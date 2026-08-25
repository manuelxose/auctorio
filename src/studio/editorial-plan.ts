import { Prisma } from "@prisma/client";
import type { EditorialPlanItemStatus, PublicationChannel } from "@prisma/client";
import { getTextProvider } from "../infrastructure/ai/text";
import { getPrismaClient } from "../infrastructure/db/prisma";
import { writeAudit } from "./audit";
import { createProject } from "./repository";
import { startProjectGeneration } from "./orchestration";
import { structuredEvent } from "../shared/utils/logger";
import { generateStructured, StructuredOutputError, type StructuredGenerationAttempt } from "../infrastructure/ai/structured";
import {
  EDITORIAL_PLAN_PROMPT_VERSION,
  EDITORIAL_PLAN_SCHEMA_NAME,
  editorialPlanSchemaV2,
  WORD_TARGETS,
  type ContentFormat,
  type EditorialPlanBriefV2,
  type SearchIntent,
} from "./editorial-plan-schema";
import { buildEditorialPlanningContext, renderPlanningContext, type EditorialPlanningContext, type PlanningStrategy } from "./editorial-plan-context";
import { classifyCannibalization, computeSiteRelevanceScore, syntheticProfileForSiteType } from "./site-relevance";
import { registerSearchTargets } from "./site-intelligence";

const prisma = getPrismaClient();
const CHANNELS = ["website", "x", "instagram"] as const;
type PlanChannel = (typeof CHANNELS)[number];

export type GenerateEditorialPlanInput = {
  tenantId: string;
  siteId?: string | null;
  briefId?: string | null;
  dateFrom: Date;
  dateTo: Date;
  objective?: string | null;
  channels: PlanChannel[];
  publicationCount: number;
  frequency?: string | null;
  timezone?: string;
  accountIds?: string[];
  language?: string;
  audience?: string | null;
  topics?: string[];
  excludedTopics?: string[];
  userId?: string | null;
  strategy?: PlanningStrategy;
  allowWithoutIntelligence?: boolean;
};

export type PostValidationResult = {
  kept: EditorialPlanBriefV2[];
  dropped: Array<{ title: string; reason: string }>;
  warnings: string[];
};

function normalizeSlug(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
/** Token-overlap ratio between two titles; used to catch near-duplicates. */
export function titleTokenOverlap(a: string, b: string): number {
  const tokens = (value: string) =>
    new Set(
      value
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .split(/[^a-z0-9]+/)
        .filter((token) => token.length > 3),
    );
  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.size === 0 || tb.size === 0) {
    return 0;
  }
  let intersection = 0;
  for (const token of ta) {
    if (tb.has(token)) {
      intersection += 1;
    }
  }
  return intersection / Math.min(ta.size, tb.size);
}

function isNearDuplicateTitle(candidate: string, existing: string[]): boolean {
  return existing.some((title) => titleTokenOverlap(candidate, title) >= 0.75);
}
/**
 * App-level post-validation: the application, not the LLM, owns correctness.
 * Enforces dates, duplicates, internal-link inventory, evidence whitelist,
 * relevance guardrails, word targets and cannibalization classification.
 */
export function postValidatePlanItems(
  items: EditorialPlanBriefV2[],
  input: Pick<GenerateEditorialPlanInput, "dateFrom" | "dateTo" | "publicationCount" | "channels" | "strategy">,
  context: EditorialPlanningContext,
): PostValidationResult {
  const kept: EditorialPlanBriefV2[] = [];
  const dropped: Array<{ title: string; reason: string }> = [];
  const warnings: string[] = [];
  const seenTitles = new Set<string>();
  const seenQueries = new Set<string>();
  const allowedEvidenceUrls = new Set<string>([
    ...context.evidence.map((entry) => entry.url).filter((url): url is string => Boolean(url)),
    ...context.indexedUrlInventory,
  ]);

  for (const item of items) {
    const title = item.workingTitle.trim();

    // 1. Duplicate titles.
    const titleKey = normalizeSlug(title);
    if (seenTitles.has(titleKey)) {
      dropped.push({ title, reason: "duplicate title" });
      continue;
    }
    seenTitles.add(titleKey);

    // 2. Date bounds.
    const scheduled = new Date(item.scheduledFor);
    if (Number.isNaN(scheduled.getTime()) || scheduled < input.dateFrom || scheduled > input.dateTo) {
      dropped.push({ title, reason: "scheduledFor outside plan date range" });
      continue;
    }

    // 3. Channel must be requested.
    if (!input.channels.includes(item.channel as PlanChannel)) {
      dropped.push({ title, reason: `channel ${item.channel} not requested` });
      continue;
    }

    // 4. Internal links must exist in the indexed inventory. AI never invents URLs.
    const validLinks = (item.suggestedInternalLinks ?? []).filter((url) => context.indexedUrlInventory.includes(url));
    if (validLinks.length !== (item.suggestedInternalLinks ?? []).length) {
      warnings.push(`removed ${(item.suggestedInternalLinks ?? []).length - validLinks.length} non-inventoried internal link(s) from "${title}"`);
    }

    // 5. Evidence URLs must come from the provided evidence set.
    const validEvidence = (item.sourceEvidence ?? []).map((entry) =>
      entry.url && !allowedEvidenceUrls.has(entry.url) ? { ...entry, url: undefined } : entry,
    );
    const invented = (item.sourceEvidence ?? []).filter((entry) => entry.url && !allowedEvidenceUrls.has(entry.url)).length;
    if (invented > 0) {
      warnings.push(`stripped ${invented} unverified source url(s) from "${title}"`);
    }

    // 6. Relevance guardrail.
    const relevance = computeSiteRelevanceScore(
      item,
      context.profile ?? syntheticProfileForSiteType(context.site.type),
      title,
      {
        allowedContentFormats: input.strategy?.contentFormats ?? [],
      },
    );
    if (relevance.rejected) {
      dropped.push({ title, reason: `relevance guardrail (score ${relevance.score}): ${relevance.reasons.join("; ")}` });
      continue;
    }

    // 7. Cannibalization classification.
    const cannibalization = classifyCannibalization(item, title, {
      queries: [...context.searchTargets, ...context.existingPlanQueries],
      keywords: [...context.existingPlanQueries],
      indexedUrls: context.indexedUrlInventory,
      plannedTitles: context.existingPlanTitles,
    });

    // 8. Word targets: default from content format, clamp to format bounds.
    const formatTargets = WORD_TARGETS[item.contentType as ContentFormat] ?? { min: 1200, max: 2200 };
    let wordMin = item.recommendedWordCountMin;
    let wordMax = item.recommendedWordCountMax;
    if (!wordMin || !wordMax) {
      wordMin = formatTargets.min;
      wordMax = formatTargets.max;
    }
    wordMin = Math.max(200, Math.min(wordMin, wordMax));
    wordMax = Math.max(wordMin, Math.min(wordMax, formatTargets.max * 1.5));

    // 9. Duplicate target queries inside the same batch.
    const queryKey = item.targetQuery ? normalizeSlug(item.targetQuery) : null;
    if (queryKey && seenQueries.has(queryKey)) {
      dropped.push({ title, reason: `duplicate target query ${item.targetQuery}` });
      continue;
    }
    if (queryKey) {
      seenQueries.add(queryKey);
    }

    kept.push({
      ...item,
      suggestedInternalLinks: validLinks,
      sourceEvidence: validEvidence,
      relevanceScore: relevance.score,
      cannibalizationRisk: cannibalization.risk,
      recommendedWordCountMin: wordMin,
      recommendedWordCountMax: wordMax,
      secondaryIntents: (item.secondaryIntents ?? []).filter((intent) => intent !== item.primaryIntent),
      opportunityScore: Math.max(0, Math.min(100, item.opportunityScore ?? relevance.score)),
      confidence: Math.max(0, Math.min(1, item.confidence ?? 0.7)),
    });
  }

  const excess = kept.slice(input.publicationCount);
  for (const item of excess) {
    dropped.push({ title: item.workingTitle, reason: "exceeds requested publication count" });
  }
  const finalItems = kept.slice(0, input.publicationCount);
  if (finalItems.length === 0 && kept.length === 0) {
    warnings.push("no relevant items survived post-validation");
  }
  return { kept: finalItems, dropped, warnings };
}

function buildPromptV2(input: GenerateEditorialPlanInput, context: EditorialPlanningContext, countOverride?: number): string {
  const strategy: PlanningStrategy = input.strategy ?? {
    mode: "balanced",
    language: input.language ?? "es",
    audience: input.audience ?? null,
    objective: input.objective ?? null,
    priorityTopics: input.topics ?? [],
    excludedTopics: input.excludedTopics ?? [],
  };

  return [
    `Generate exactly ${countOverride ?? input.publicationCount} editorial plan items for the destination site described below.`,
    `Date range (ISO): from ${input.dateFrom.toISOString()} to ${input.dateTo.toISOString()} (timezone ${input.timezone ?? "Europe/Madrid"}). All scheduledFor values must fall inside this range.`,
    `Channels: ${input.channels.join(", ")}.`,
    "Every item is a professional SEO brief. Ground each topic in the site intelligence evidence below. Do NOT invent topics that are unrelated to the destination.",
    "Do not duplicate titles, target queries or primary keywords within the batch or against existing plan titles.",
    "For suggestedInternalLinks, use ONLY urls present in the evidence. For sourceEvidence, use ONLY the allowed evidence urls listed (or omit url).",
    "Do not invent statistics, prices or schedules; reference evidence types only.",
    "Keep every item COMPACT so the full response fits the provider output limit: outline ≤6 entries with ≤4 subpoints, all arrays ≤6 entries, rationale ≤180 characters.",
    "DIVERSITY IS MANDATORY: every item must target a DIFFERENT subject area. Do NOT produce format variants of the same subject (e.g. the same film genre once as a guide and again as a ranking). Spread the items across the topic clusters in the evidence.",
    "",
    renderPlanningContext(context, strategy),
    "",
    `Schema name: ${EDITORIAL_PLAN_SCHEMA_NAME}. Return JSON only.`,
  ].join("\n");
}

async function prepareEditorialPlan(input: GenerateEditorialPlanInput): Promise<{
  accounts: Array<{ id: string; platform: string }>;
  strategy: PlanningStrategy;
  plan: Awaited<ReturnType<typeof prisma.editorialPlan.create>>;
}> {
  if (!input.siteId) throw new Error("editorial_plan_site_required");
  if (input.dateTo <= input.dateFrom) throw new Error("editorial_plan_invalid_date_range");
  if (input.publicationCount < 1 || input.publicationCount > 100) throw new Error("editorial_plan_invalid_quantity");
  if (input.channels.length === 0) throw new Error("editorial_plan_channels_required");

  const requestedAccountIds = [...new Set(input.accountIds ?? [])];
  const accounts = requestedAccountIds.length
    ? await prisma.publishingAccount.findMany({
        where: { tenantId: input.tenantId, id: { in: requestedAccountIds }, enabled: true },
        select: { id: true, platform: true },
      })
    : [];
  if (accounts.length !== requestedAccountIds.length) throw new Error("editorial_plan_invalid_account");
  if (accounts.some((account) => !input.channels.includes(account.platform))) {
    throw new Error("editorial_plan_account_channel_mismatch");
  }

  const strategy = input.strategy ?? {
    mode: "balanced",
    language: input.language ?? "es",
    audience: input.audience ?? null,
    objective: input.objective ?? null,
    priorityTopics: input.topics ?? [],
    excludedTopics: input.excludedTopics ?? [],
  };

  const plan = await prisma.editorialPlan.create({
    data: {
      tenantId: input.tenantId,
      siteId: input.siteId,
      briefId: input.briefId ?? null,
      name: input.strategy?.campaignName || `Editorial plan ${input.dateFrom.toISOString().slice(0, 10)}`,
      status: "generating",
      dateFrom: input.dateFrom,
      dateTo: input.dateTo,
      objective: input.objective ?? null,
      channels: input.channels as Prisma.InputJsonArray,
      accountIds: input.accountIds?.length ? (input.accountIds as Prisma.InputJsonArray) : Prisma.JsonNull,
      frequency: input.frequency ?? null,
      timezone: input.timezone ?? "Europe/Madrid",
      strategyMode: strategy.mode,
      primaryIntent: strategy.primaryIntent ?? null,
      contentFormats: strategy.contentFormats?.length ? (strategy.contentFormats as Prisma.InputJsonArray) : Prisma.JsonNull,
      topicStrategy: {
        priorityTopics: strategy.priorityTopics ?? [],
        excludedTopics: strategy.excludedTopics ?? [],
        existingCluster: strategy.existingCluster ?? null,
        newCluster: strategy.newCluster ?? false,
        freeAiDiscovery: strategy.freeAiDiscovery ?? false,
        seasonalEvents: strategy.seasonalEvents ?? [],
        brandsOrEntities: strategy.brandsOrEntities ?? [],
        keywordSeeds: strategy.keywordSeeds ?? [],
      } as Prisma.InputJsonObject,
      relevanceThreshold: 45,
      configuration: {
        publicationCount: input.publicationCount,
        language: input.language ?? "es",
        audience: input.audience ?? null,
        market: strategy.market ?? null,
        campaignName: strategy.campaignName ?? null,
      } as Prisma.InputJsonObject,
      promptVersion: EDITORIAL_PLAN_PROMPT_VERSION,
    },
  });

  return { accounts, strategy, plan };
}

async function executeEditorialPlanGeneration(
  plan: Awaited<ReturnType<typeof prisma.editorialPlan.create>>,
  input: GenerateEditorialPlanInput,
  strategy: PlanningStrategy,
  accounts: Array<{ id: string; platform: string }>,
) {
  structuredEvent("editorial_plan.generation.started", {
    tenantId: input.tenantId,
    siteId: input.siteId,
    planId: plan.id,
    strategyMode: strategy.mode,
    publicationCount: input.publicationCount,
    channels: input.channels,
  });

  // prepareEditorialPlan guarantees a site; re-assert for narrowing.
  const siteId = input.siteId!;

  try {
    const contextStarted = Date.now();
    const context = await buildEditorialPlanningContext(input.tenantId, siteId);
    structuredEvent("editorial_plan.context.built", {
      tenantId: input.tenantId,
      siteId: input.siteId,
      planId: plan.id,
      assemblyMs: Date.now() - contextStarted,
      profileVersion: context.profile?.version ?? null,
      indexedUrls: context.indexedUrlInventory.length,
      evidenceCount: context.evidence.length,
    });

    if (!context.profile && input.allowWithoutIntelligence !== true) {
      throw new Error("site_intelligence_required");
    }

    const systemPrompt =
      "You are a site-aware editorial strategy engine. You plan content ONLY for the destination site described by the evidence. " +
      `Your output MUST match ${EDITORIAL_PLAN_SCHEMA_NAME}. Never output prose outside the JSON object.`;

    let validated: PostValidationResult | null = null;
    let attempts: StructuredGenerationAttempt[] = [];
    let lastProvider = "unknown";
    let lastModel = "unknown";

    const runOnce = async (extraFeedback?: string, countOverride?: number) =>
      generateStructured({
        schemaName: EDITORIAL_PLAN_SCHEMA_NAME,
        schema: editorialPlanSchemaV2,
        prompt: buildPromptV2(input, context, countOverride) + (extraFeedback ?? ""),
        systemPrompt,
        temperature: 0.5,
        maxTokens: 3000,
        maxAttempts: 3,
        eventContext: { tenantId: input.tenantId, siteId: input.siteId, planId: plan.id, siteType: context.site.type },
      });

    const mergeBatch = (
      existing: PostValidationResult,
      batch: PostValidationResult,
      limit: number,
    ): PostValidationResult => {
      const seenTitles = new Set(existing.kept.map((item) => normalizeSlug(item.workingTitle)));
      const seenQueries = new Set(existing.kept.map((item) => (item.targetQuery ? normalizeSlug(item.targetQuery) : "")));
      const keptTitles = existing.kept.map((item) => item.workingTitle);
      const extras: EditorialPlanBriefV2[] = [];
      const dropped = [...existing.dropped];
      for (const item of batch.kept) {
        const titleKey = normalizeSlug(item.workingTitle);
        const queryKey = item.targetQuery ? normalizeSlug(item.targetQuery) : "";
        if (seenTitles.has(titleKey)) {
          dropped.push({ title: item.workingTitle, reason: "duplicate title across generation batches" });
          continue;
        }
        if (isNearDuplicateTitle(item.workingTitle, keptTitles)) {
          dropped.push({ title: item.workingTitle, reason: "near-duplicate topic across generation batches" });
          continue;
        }
        if (queryKey && seenQueries.has(queryKey)) {
          dropped.push({ title: item.workingTitle, reason: `duplicate target query ${item.targetQuery}` });
          continue;
        }
        seenTitles.add(titleKey);
        if (queryKey) {
          seenQueries.add(queryKey);
        }
        keptTitles.push(item.workingTitle);
        extras.push(item);
      }
      const kept = [...existing.kept, ...extras];
      const excess = kept.slice(limit);
      for (const item of excess) {
        dropped.push({ title: item.workingTitle, reason: "exceeds requested publication count" });
      }
      return { kept: kept.slice(0, limit), dropped, warnings: [...existing.warnings, ...batch.warnings] };
    };

    // Batch size derives from the provider output cap: DeepSeek truncates at
    // 4096 tokens, so ~2 full briefs per call is the safe budget.
    const perCallBudget = 2;
    const chunks: number[] = [];
    let remaining = input.publicationCount;
    while (remaining > 0) {
      chunks.push(Math.min(perCallBudget, remaining));
      remaining -= perCallBudget;
    }

    try {
      for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex += 1) {
        const chunkCount = chunks[chunkIndex];
        try {
          const alreadyPlanned =
            chunkIndex > 0 && validated && validated.kept.length > 0
              ? `\nAlready planned titles (do NOT repeat these or close variants of them): ${validated.kept.map((item) => item.workingTitle).join(" | ")}`
              : undefined;
          const result = await runOnce(alreadyPlanned, chunkCount);
          attempts = [...attempts, ...result.attempts];
          lastProvider = result.attempts[result.attempts.length - 1].provider;
          lastModel = result.attempts[result.attempts.length - 1].model;
          const batch = postValidatePlanItems(
            result.data.items,
            { ...input, publicationCount: chunkCount },
            context,
          );
          validated = validated ? mergeBatch(validated, batch, input.publicationCount) : batch;
          structuredEvent("editorial_plan.generation.chunk_completed", {
            tenantId: input.tenantId,
            siteId: input.siteId,
            planId: plan.id,
            chunkRequested: chunkCount,
            chunkKept: batch.kept.length,
            chunkDropped: batch.dropped.length,
            runningKept: validated.kept.length,
          });
        } catch (error) {
          // A failed later chunk must not destroy already-validated items:
          // record the failure and continue with the next chunk.
          if (error instanceof StructuredOutputError && validated && validated.kept.length > 0) {
            await recordGenerationAttempts(input.tenantId, plan.id, input.siteId, error.attempts, "failed");
            structuredEvent(
              "editorial_plan.generation.chunk_failed",
              {
                tenantId: input.tenantId,
                siteId: input.siteId,
                planId: plan.id,
                chunkRequested: chunkCount,
                runningKept: validated.kept.length,
                attempts: error.attempts.length,
              },
              "warn",
            );
            continue;
          }
          throw error;
        }
      }
    } catch (error) {
      if (error instanceof StructuredOutputError) {
        await recordGenerationAttempts(input.tenantId, plan.id, input.siteId, error.attempts, "failed");
        structuredEvent("editorial_plan.generation.failed", {
          tenantId: input.tenantId,
          siteId: input.siteId,
          planId: plan.id,
          normalizedError: "EDITORIAL_PLAN_STRUCTURED_OUTPUT_INVALID",
          attempts: error.attempts.length,
        }, "error");
        throw new Error("EDITORIAL_PLAN_STRUCTURED_OUTPUT_INVALID");
      }
      throw error;
    }

    // Guardrail recovery: if every row was rejected, retry once with feedback.
    if (validated && validated.kept.length === 0) {
      const feedback = `\nYour previous plan was rejected. Rejected rows: ${validated.dropped.slice(0, 10).map((drop) => `${drop.title} (${drop.reason})`).join("; ")}. Propose topics that clearly belong to this destination.`;
      try {
        const retryResult = await runOnce(feedback, input.publicationCount);
        attempts = [...attempts, ...retryResult.attempts];
        lastProvider = retryResult.attempts[retryResult.attempts.length - 1].provider;
        lastModel = retryResult.attempts[retryResult.attempts.length - 1].model;
        validated = postValidatePlanItems(retryResult.data.items, input, context);
      } catch (error) {
        if (error instanceof StructuredOutputError) {
          await recordGenerationAttempts(input.tenantId, plan.id, input.siteId, error.attempts, "failed");
          throw new Error("EDITORIAL_PLAN_STRUCTURED_OUTPUT_INVALID");
        }
        throw error;
      }
    }

    // Quantity recovery: the model sometimes returns fewer rows than the exact
    // count requested. Ask for the remaining items (bounded rounds, small
    // batches to respect the provider output cap) and merge, deduping by
    // normalized title, near-duplicate similarity and target query. The
    // application owns quantity enforcement.
    let topUpRounds = 0;
    while (validated && validated.kept.length < input.publicationCount && topUpRounds < 2) {
      topUpRounds += 1;
      const missing = Math.min(3, input.publicationCount - validated.kept.length);
      const existingTitles = validated.kept.map((item) => item.workingTitle).join(" | ");
      const feedback =
        `\nCORRECTION REQUIRED: you returned ${validated.kept.length} items but ${input.publicationCount} in total were requested. ` +
        `Return ${missing} ADDITIONAL distinct items. Do NOT repeat these titles or close variants of them: ${existingTitles}. ` +
        `All new items must obey the same relevance and schema rules.`;
      try {
        const topUpResult = await runOnce(feedback, missing);
        attempts = [...attempts, ...topUpResult.attempts];
        lastProvider = topUpResult.attempts[topUpResult.attempts.length - 1].provider;
        lastModel = topUpResult.attempts[topUpResult.attempts.length - 1].model;
        const batch = postValidatePlanItems(
          topUpResult.data.items,
          { ...input, publicationCount: missing },
          context,
        );
        validated = mergeBatch(validated, batch, input.publicationCount);
        structuredEvent("editorial_plan.generation.topup", {
          tenantId: input.tenantId,
          siteId: input.siteId,
          planId: plan.id,
          round: topUpRounds,
          kept: validated.kept.length,
          requested: input.publicationCount,
        });
      } catch (error) {
        if (error instanceof StructuredOutputError) {
          structuredEvent("editorial_plan.generation.topup_failed", {
            tenantId: input.tenantId,
            siteId: input.siteId,
            planId: plan.id,
            round: topUpRounds,
            requested: input.publicationCount,
            kept: validated.kept.length,
          }, "warn");
          break;
        }
        throw error;
      }
    }

    if (!validated || validated.kept.length === 0) {
      structuredEvent("editorial_plan.generation.failed", {
        tenantId: input.tenantId,
        siteId: input.siteId,
        planId: plan.id,
        normalizedError: "EDITORIAL_PLAN_NO_RELEVANT_ITEMS",
        dropped: validated?.dropped.slice(0, 20) ?? [],
      }, "error");
      throw new Error("EDITORIAL_PLAN_NO_RELEVANT_ITEMS");
    }

    await recordGenerationAttempts(input.tenantId, plan.id, input.siteId, attempts, "succeeded");

    const items = validated.kept;
    await prisma.$transaction(async (tx) => {
      for (const item of items) {
        await tx.editorialPlanItem.create({
          data: {
            tenantId: input.tenantId,
            planId: plan.id,
            siteId: input.siteId,
            accountId:
              accounts.filter((account) => account.platform === item.channel)[
                items.filter((candidate) => candidate.channel === item.channel).indexOf(item) %
                  Math.max(1, accounts.filter((account) => account.platform === item.channel).length)
              ]?.id ?? null,
            title: item.workingTitle,
            workingTitle: item.workingTitle,
            finalSuggestedTitle: item.finalSuggestedTitle ?? null,
            topic: item.topic,
            topicCluster: item.topicCluster ?? null,
            pillarPage: item.pillarPage ?? null,
            angle: item.angle ?? null,
            channel: item.channel as PublicationChannel,
            scheduledFor: new Date(item.scheduledFor),
            newsOrEvergreen: item.newsOrEvergreen,
            editorialObjective: item.editorialObjective ?? input.objective ?? null,
            audience: item.targetAudience ?? input.audience ?? null,
            searchIntent: item.primaryIntent,
            primaryIntent: item.primaryIntent,
            secondaryIntents: item.secondaryIntents.length ? (item.secondaryIntents as Prisma.InputJsonArray) : Prisma.JsonNull,
            funnelStage: item.funnelStage ?? null,
            targetQuery: item.targetQuery ?? null,
            primaryKeyword: item.primaryKeyword,
            secondaryKeywords: item.secondaryKeywords.length ? (item.secondaryKeywords as Prisma.InputJsonArray) : Prisma.JsonNull,
            semanticKeywords: item.semanticKeywords.length ? (item.semanticKeywords as Prisma.InputJsonArray) : Prisma.JsonNull,
            relatedEntities: item.relatedEntities.length ? (item.relatedEntities as Prisma.InputJsonArray) : Prisma.JsonNull,
            questionsToAnswer: item.questionsToAnswer.length ? (item.questionsToAnswer as Prisma.InputJsonArray) : Prisma.JsonNull,
            competitorAngle: item.competitorAngle ?? null,
            suggestedSlug: item.suggestedSlug ?? null,
            seoTitle: item.seoTitle ?? null,
            metaDescription: item.metaDescription ?? null,
            suggestedInternalLinks: item.suggestedInternalLinks.length ? (item.suggestedInternalLinks as Prisma.InputJsonArray) : Prisma.JsonNull,
            suggestedExternalEvidenceTypes: item.suggestedExternalEvidenceTypes.length ? (item.suggestedExternalEvidenceTypes as Prisma.InputJsonArray) : Prisma.JsonNull,
            faqCandidates: item.faqCandidates.length ? (item.faqCandidates as Prisma.InputJsonArray) : Prisma.JsonNull,
            schemaTypes: item.schemaTypes.length ? (item.schemaTypes as Prisma.InputJsonArray) : Prisma.JsonNull,
            outline: item.outline.length ? (item.outline as Prisma.InputJsonArray) : Prisma.JsonNull,
            recommendedWordCountMin: item.recommendedWordCountMin,
            recommendedWordCountMax: item.recommendedWordCountMax,
            difficultyEstimate: item.difficultyEstimate,
            opportunityScore: item.opportunityScore,
            relevanceScore: item.relevanceScore,
            cannibalizationRisk: item.cannibalizationRisk,
            confidence: item.confidence,
            rationale: item.rationale,
            sourceEvidence: item.sourceEvidence.length ? (item.sourceEvidence as Prisma.InputJsonArray) : Prisma.JsonNull,
            freshnessRequirement: item.freshnessRequirement,
            contentType: item.contentType,
            socialHook: item.socialHook ?? null,
            cta: item.cta ?? null,
            suggestedHashtags: item.suggestedHashtags.length ? (item.suggestedHashtags as Prisma.InputJsonArray) : Prisma.JsonNull,
            imageConcept: item.imageConcept ?? null,
            imageRequirements: item.imageRequirements ?? null,
            priority: item.priority,
            status: "proposed",
            metadata: { relevanceReasons: undefined } as Prisma.InputJsonObject,
          },
        });
      }
      await tx.editorialPlan.update({
        where: { id: plan.id },
        data: {
          status: "ready",
          provider: lastProvider,
          model: lastModel,
          siteIntelligenceVersion: context.profile?.version ?? null,
          generatedOutput: { items, dropped: validated.dropped, warnings: validated.warnings } as Prisma.InputJsonObject,
          error: null,
        },
      });
    });

    // Register target queries so future plans avoid cannibalization.
    const targetItems = items.filter((item) => item.targetQuery);
    if (targetItems.length > 0) {
      await registerSearchTargets(
        input.tenantId,
        siteId,
        targetItems.map((item) => ({ query: item.targetQuery!, keyword: item.primaryKeyword, intent: item.primaryIntent })),
      );
    }

    structuredEvent("editorial_plan.generation.completed", {
      tenantId: input.tenantId,
      siteId: input.siteId,
      planId: plan.id,
      itemCount: items.length,
      droppedCount: validated.dropped.length,
      provider: lastProvider,
      model: lastModel,
      siteIntelligenceVersion: context.profile?.version ?? null,
    });

    await writeAudit({
      tenantId: input.tenantId,
      actorType: input.userId ? "user" : "system",
      actorUserId: input.userId,
      action: "editorial_plan.generated",
      entityType: "editorial_plan",
      entityId: plan.id,
      metadata: {
        itemCount: items.length,
        droppedCount: validated.dropped.length,
        channels: input.channels,
        strategyMode: strategy.mode,
        siteIntelligenceVersion: context.profile?.version ?? null,
      },
    });
    return prisma.editorialPlan.findUnique({ where: { id: plan.id }, include: { items: true } });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await prisma.editorialPlan.update({
      where: { id: plan.id },
      data: { status: "failed", error: message },
    });
    structuredEvent("editorial_plan.generation.failed", {
      tenantId: input.tenantId,
      siteId: input.siteId,
      planId: plan.id,
      normalizedError: message,
    }, "error");
    throw error;
  }
}

/** Synchronous generation (used by scripts and `wait` callers). */
export async function generateEditorialPlan(input: GenerateEditorialPlanInput) {
  const { accounts, strategy, plan } = await prepareEditorialPlan(input);
  return executeEditorialPlanGeneration(plan, input, strategy, accounts);
}

/**
 * Background generation: the plan row is created immediately and generation
 * runs out-of-band. Callers poll GET /v2/editorial-plans/:id until the plan
 * reaches ready|failed. Keeps long LLM pipelines off the request path.
 */
export async function enqueueEditorialPlanGeneration(input: GenerateEditorialPlanInput) {
  const { accounts, strategy, plan } = await prepareEditorialPlan(input);
  void executeEditorialPlanGeneration(plan, input, strategy, accounts).catch((error) => {
    structuredEvent(
      "editorial_plan.generation.background_error",
      {
        tenantId: input.tenantId,
        siteId: input.siteId,
        planId: plan.id,
        normalizedError: error instanceof Error ? error.message : String(error),
      },
      "error",
    );
  });
  return { planId: plan.id };
}

async function recordGenerationAttempts(
  tenantId: string,
  planId: string,
  siteId: string | null | undefined,
  attempts: StructuredGenerationAttempt[],
  finalStatus: "succeeded" | "failed",
): Promise<void> {
  await prisma.editorialPlanGenerationAttempt.createMany({
    data: attempts.map((attempt) => ({
      tenantId,
      planId,
      siteId: siteId ?? null,
      provider: attempt.provider,
      model: attempt.model,
      attempt: attempt.attempt,
      status: attempt.validation.ok ? "validated" : finalStatus,
      finishReason: attempt.finishReason ?? null,
      tokenUsage: attempt.usage ?? Prisma.JsonNull,
      schemaValidation: {
        ok: attempt.validation.ok,
        errors: attempt.validation.errors.slice(0, 20),
      } as Prisma.InputJsonObject,
      normalizedError: attempt.validation.ok ? null : attempt.validation.errors[0] ?? "schema_validation_failed",
      repairAttempted: attempt.repairAttempted,
      retryAttempted: attempts.length > attempt.attempt,
      durationMs: null,
    })),
  });
}

export async function listEditorialPlans(tenantId: string, page: number, pageSize: number) {
  const where = { tenantId, status: { not: "archived" as const } };
  const [total, items] = await prisma.$transaction([
    prisma.editorialPlan.count({ where }),
    prisma.editorialPlan.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize, include: { _count: { select: { items: true } } } }),
  ]);
  return { items, page, pageSize, total };
}

export async function getEditorialPlan(tenantId: string, planId: string) {
  return prisma.editorialPlan.findFirst({ where: { id: planId, tenantId }, include: { items: { orderBy: { scheduledFor: "asc" } } } });
}

export async function updateEditorialPlanItem(
  tenantId: string,
  itemId: string,
  input: {
    title?: string;
    workingTitle?: string | null;
    topic?: string | null;
    scheduledFor?: Date | null;
    primaryKeyword?: string | null;
    seoTitle?: string | null;
    metaDescription?: string | null;
    socialHook?: string | null;
    imageConcept?: string | null;
    imageRequirements?: string | null;
    priority?: number;
    notes?: string | null;
    contentType?: string | null;
    primaryIntent?: string | null;
    secondaryIntents?: string[] | null;
    funnelStage?: string | null;
    targetQuery?: string | null;
    semanticKeywords?: string[] | null;
    questionsToAnswer?: string[] | null;
    topicCluster?: string | null;
    pillarPage?: string | null;
    finalSuggestedTitle?: string | null;
    angle?: string | null;
    editorialObjective?: string | null;
    competitorAngle?: string | null;
    suggestedInternalLinks?: string[] | null;
    suggestedExternalEvidenceTypes?: string[] | null;
    faqCandidates?: Array<{ question: string; answer: string }> | null;
    schemaTypes?: string[] | null;
    outline?: Array<{ heading: string; subpoints?: string[] }> | null;
    recommendedWordCountMin?: number | null;
    recommendedWordCountMax?: number | null;
    difficultyEstimate?: number | null;
    confidence?: number | null;
    rationale?: string | null;
    freshnessRequirement?: string | null;
  },
) {
  const item = await prisma.editorialPlanItem.findFirst({ where: { id: itemId, tenantId } });
  if (!item) return null;
  const jsonOrNull = (value: unknown) => (value === undefined ? undefined : value === null ? Prisma.JsonNull : (value as Prisma.InputJsonArray));
  return prisma.editorialPlanItem.update({
    where: { id: item.id },
    data: {
      title: input.title?.trim() || undefined,
      workingTitle: input.workingTitle === undefined ? undefined : input.workingTitle?.trim() || null,
      finalSuggestedTitle: input.finalSuggestedTitle === undefined ? undefined : input.finalSuggestedTitle?.trim() || null,
      topic: input.topic === undefined ? undefined : input.topic?.trim() || null,
      topicCluster: input.topicCluster === undefined ? undefined : input.topicCluster?.trim() || null,
      pillarPage: input.pillarPage === undefined ? undefined : input.pillarPage?.trim() || null,
      angle: input.angle === undefined ? undefined : input.angle?.trim() || null,
      editorialObjective: input.editorialObjective === undefined ? undefined : input.editorialObjective?.trim() || null,
      competitorAngle: input.competitorAngle === undefined ? undefined : input.competitorAngle?.trim() || null,
      scheduledFor: input.scheduledFor,
      primaryKeyword: input.primaryKeyword === undefined ? undefined : input.primaryKeyword?.trim() || null,
      seoTitle: input.seoTitle === undefined ? undefined : input.seoTitle?.trim() || null,
      metaDescription: input.metaDescription === undefined ? undefined : input.metaDescription?.trim() || null,
      socialHook: input.socialHook === undefined ? undefined : input.socialHook?.trim() || null,
      imageConcept: input.imageConcept === undefined ? undefined : input.imageConcept?.trim() || null,
      imageRequirements: input.imageRequirements === undefined ? undefined : input.imageRequirements?.trim() || null,
      priority: input.priority,
      notes: input.notes === undefined ? undefined : input.notes?.trim() || null,
      contentType: input.contentType === undefined ? undefined : input.contentType?.trim() || null,
      primaryIntent: input.primaryIntent === undefined ? undefined : input.primaryIntent?.trim() || null,
      searchIntent: input.primaryIntent === undefined ? undefined : input.primaryIntent?.trim() || undefined,
      secondaryIntents: input.secondaryIntents === undefined ? undefined : input.secondaryIntents?.length ? (input.secondaryIntents as Prisma.InputJsonArray) : Prisma.JsonNull,
      funnelStage: input.funnelStage === undefined ? undefined : input.funnelStage?.trim() || null,
      targetQuery: input.targetQuery === undefined ? undefined : input.targetQuery?.trim() || null,
      semanticKeywords: input.semanticKeywords === undefined ? undefined : input.semanticKeywords?.length ? (input.semanticKeywords as Prisma.InputJsonArray) : Prisma.JsonNull,
      questionsToAnswer: input.questionsToAnswer === undefined ? undefined : input.questionsToAnswer?.length ? (input.questionsToAnswer as Prisma.InputJsonArray) : Prisma.JsonNull,
      suggestedInternalLinks: input.suggestedInternalLinks === undefined ? undefined : input.suggestedInternalLinks?.length ? (input.suggestedInternalLinks as Prisma.InputJsonArray) : Prisma.JsonNull,
      suggestedExternalEvidenceTypes: input.suggestedExternalEvidenceTypes === undefined ? undefined : input.suggestedExternalEvidenceTypes?.length ? (input.suggestedExternalEvidenceTypes as Prisma.InputJsonArray) : Prisma.JsonNull,
      faqCandidates: input.faqCandidates === undefined ? undefined : input.faqCandidates?.length ? (input.faqCandidates as Prisma.InputJsonArray) : Prisma.JsonNull,
      schemaTypes: input.schemaTypes === undefined ? undefined : input.schemaTypes?.length ? (input.schemaTypes as Prisma.InputJsonArray) : Prisma.JsonNull,
      outline: input.outline === undefined ? undefined : input.outline?.length ? (input.outline as Prisma.InputJsonArray) : Prisma.JsonNull,
      recommendedWordCountMin: input.recommendedWordCountMin === undefined ? undefined : input.recommendedWordCountMin,
      recommendedWordCountMax: input.recommendedWordCountMax === undefined ? undefined : input.recommendedWordCountMax,
      difficultyEstimate: input.difficultyEstimate === undefined ? undefined : input.difficultyEstimate,
      confidence: input.confidence === undefined ? undefined : input.confidence,
      rationale: input.rationale === undefined ? undefined : input.rationale?.trim() || null,
      freshnessRequirement: input.freshnessRequirement === undefined ? undefined : input.freshnessRequirement?.trim() || null,
    },
  });
}

export async function setEditorialPlanItemStatus(
  tenantId: string,
  itemId: string,
  status: EditorialPlanItemStatus,
  userId?: string | null,
) {
  const item = await prisma.editorialPlanItem.findFirst({ where: { id: itemId, tenantId } });
  if (!item) return null;
  const updated = await prisma.editorialPlanItem.update({ where: { id: item.id }, data: { status, approvalStatus: status === "approved" ? "approved" : status } });
  await writeAudit({ tenantId, actorType: userId ? "user" : "system", actorUserId: userId, action: `editorial_plan_item.${status}`, entityType: "editorial_plan_item", entityId: item.id, metadata: { planId: item.planId } });
  return updated;
}

export async function bulkApproveEditorialPlanItems(tenantId: string, itemIds: string[], userId?: string | null) {
  const result = await prisma.editorialPlanItem.updateMany({ where: { tenantId, id: { in: itemIds }, status: "proposed" }, data: { status: "approved", approvalStatus: "approved" } });
  await writeAudit({ tenantId, actorType: userId ? "user" : "system", actorUserId: userId, action: "editorial_plan_items.approved", metadata: { requestedCount: itemIds.length, updatedCount: result.count } });
  return { updatedCount: result.count };
}

export async function bulkSetEditorialPlanItemStatus(
  tenantId: string,
  itemIds: string[],
  status: "approved" | "rejected" | "proposed" | "canceled",
  userId?: string | null,
) {
  const result = await prisma.editorialPlanItem.updateMany({
    where: { tenantId, id: { in: itemIds }, status: { in: ["proposed", "approved", "rejected", "canceled"] } },
    data: { status, approvalStatus: status === "approved" ? "approved" : status },
  });
  await writeAudit({ tenantId, actorType: userId ? "user" : "system", actorUserId: userId, action: `editorial_plan_items.${status}`, metadata: { requestedCount: itemIds.length, updatedCount: result.count } });
  return { updatedCount: result.count };
}

export async function bulkDeleteEditorialPlanItems(tenantId: string, itemIds: string[], userId?: string | null) {
  const existing = await prisma.editorialPlanItem.findMany({ where: { tenantId, id: { in: itemIds } }, select: { id: true, projectId: true } });
  if (existing.length !== itemIds.length) throw new Error("editorial_plan_items_not_found");
  if (existing.some((item) => item.projectId)) throw new Error("editorial_plan_item_has_content");
  await prisma.editorialPlanItem.deleteMany({ where: { tenantId, id: { in: itemIds } } });
  await writeAudit({ tenantId, actorType: userId ? "user" : "system", actorUserId: userId, action: "editorial_plan_items.deleted", metadata: { count: itemIds.length } });
  return { deletedCount: itemIds.length };
}

export async function deleteEditorialPlanItem(tenantId: string, itemId: string, userId?: string | null) {
  const item = await prisma.editorialPlanItem.findFirst({ where: { id: itemId, tenantId } });
  if (!item) return null;
  if (item.projectId) throw new Error("editorial_plan_item_has_content");
  await prisma.editorialPlanItem.delete({ where: { id: item.id } });
  await writeAudit({ tenantId, actorType: userId ? "user" : "system", actorUserId: userId, action: "editorial_plan_item.deleted", entityType: "editorial_plan_item", entityId: item.id, metadata: { planId: item.planId } });
  return { ok: true as const };
}

export async function generateContentFromEditorialPlanItem(tenantId: string, itemId: string, userId?: string | null) {
  const item = await prisma.editorialPlanItem.findFirst({ where: { id: itemId, tenantId }, include: { project: true } });
  if (!item) return null;
  if (item.projectId && item.project) return { item, project: item.project };
  if (item.status !== "approved") throw new Error("editorial_plan_item_must_be_approved");
  if (!item.siteId) throw new Error("editorial_plan_item_site_required");

  const outline = Array.isArray(item.outline) ? item.outline : [];
  const briefSections = [
    `Titulo: ${item.workingTitle || item.title}`,
    item.angle ? `Angulo: ${item.angle}` : null,
    item.topic ? `Tema: ${item.topic}` : null,
    item.topicCluster ? `Cluster: ${item.topicCluster}` : null,
    item.primaryIntent ? `Intencion de busqueda: ${item.primaryIntent}` : null,
    item.targetQuery ? `Query objetivo: ${item.targetQuery}` : null,
    item.primaryKeyword ? `Keyword principal: ${item.primaryKeyword}` : null,
    item.recommendedWordCountMin ? `Extension objetivo: ${item.recommendedWordCountMin}-${item.recommendedWordCountMax ?? item.recommendedWordCountMin} palabras` : null,
    outline.length > 0
      ? `Estructura sugerida:\n${outline.map((entry, index) => `${index + 1}. ${typeof entry === "object" && entry !== null ? String((entry as Record<string, unknown>).heading ?? "") : String(entry)}`).join("\n")}`
      : null,
    item.metaDescription ? `Meta description sugerida: ${item.metaDescription}` : null,
    item.imageConcept ? `Concepto de imagen: ${item.imageConcept}` : null,
  ].filter((section): section is string => Boolean(section));

  const project = await createProject(tenantId, {
    siteId: item.siteId,
    title: item.finalSuggestedTitle || item.workingTitle || item.title,
    brief: briefSections.join("\n\n"),
    goal: item.channel === "website" ? "article" : "social_pack",
    primaryLanguage: "es",
    metadata: {
      editorialPlanId: item.planId,
      editorialPlanItemId: item.id,
      channel: item.channel,
      contentType: item.contentType ?? null,
      primaryIntent: item.primaryIntent ?? item.searchIntent ?? null,
      secondaryIntents: item.secondaryIntents ?? [],
      funnelStage: item.funnelStage ?? null,
      targetQuery: item.targetQuery ?? null,
      primaryKeyword: item.primaryKeyword ?? null,
      semanticKeywords: item.semanticKeywords ?? [],
      relatedEntities: item.relatedEntities ?? [],
      questionsToAnswer: item.questionsToAnswer ?? [],
      topicCluster: item.topicCluster ?? null,
      pillarPage: item.pillarPage ?? null,
      suggestedInternalLinks: item.suggestedInternalLinks ?? [],
      suggestedExternalEvidenceTypes: item.suggestedExternalEvidenceTypes ?? [],
      faqCandidates: item.faqCandidates ?? [],
      schemaTypes: item.schemaTypes ?? [],
      outline: outline,
      recommendedWordCountMin: item.recommendedWordCountMin ?? null,
      recommendedWordCountMax: item.recommendedWordCountMax ?? null,
      cannibalizationRisk: item.cannibalizationRisk ?? null,
      seoTitle: item.seoTitle ?? null,
      metaDescription: item.metaDescription ?? null,
      suggestedSlug: item.suggestedSlug ?? null,
      freshnessRequirement: item.freshnessRequirement ?? null,
      angle: item.angle ?? null,
    } as Prisma.InputJsonObject,
  });
  await prisma.editorialPlanItem.update({ where: { id: item.id }, data: { projectId: project.id, status: "generating", contentGenerationStatus: "generating" } });
  await startProjectGeneration(project.id, tenantId);
  await writeAudit({ tenantId, actorType: userId ? "user" : "system", actorUserId: userId, action: "editorial_plan_item.content_generation_started", entityType: "editorial_plan_item", entityId: item.id, metadata: { projectId: project.id } });
  return { item: await prisma.editorialPlanItem.findUnique({ where: { id: item.id } }), project };
}
