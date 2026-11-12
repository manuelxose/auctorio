import { Prisma } from "@prisma/client";
import type { EditorialPlanItemStatus, PublicationChannel } from "@prisma/client";
import { getTextProvider } from "../infrastructure/ai/text";
import { getPrismaClient } from "../infrastructure/db/prisma";
import { SOURCE_DATA_RULES } from "./prompt-injection";
import { writeAudit } from "./audit";
import { createProject } from "./repository";
import { startProjectGeneration } from "./orchestration";
import { structuredEvent } from "../shared/utils/logger";
import { getNumberEnv } from "../shared/utils/env";
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
import { MAX_PLAN_SLOTS, computePlanSlotsDetailed, localDateInZone, nextLocalDate, planRangeBounds, type PlanSlot, type PlanSlotRequest } from "./plan-slots";

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
  /** Deterministic publication slots; when set, publicationCount must equal slots.length. */
  slots?: PlanSlot[];
  slotRequest?: PlanSlotRequest;
  /** Extend an existing plan instead of creating one: only `slots` are generated, everything else is kept. */
  append?: PlanAppendMode;
};

type StoredPlanOutput = {
  items?: unknown[];
  dropped?: Array<{ title: string; reason: string }>;
  warnings?: string[];
  requestedCount?: number;
  unfilledSlots?: UnfilledSlot[];
};

type PlanAppendMode = {
  previousStatus: "ready" | "partial";
  previous: StoredPlanOutput;
  totalRequested: number;
  /** Titles already in the plan; new briefs must not repeat them. */
  avoidTitles: string[];
  /** Unfilled slots outside this run that stay unfilled. */
  keepUnfilled: UnfilledSlot[];
  /** Regeneration: delete this item in the same transaction that inserts its replacement. */
  replaceItemId?: string;
  /** Extension: the plan's new end and cadence, written in the same transaction as the new items. */
  extendTo?: { dateTo: Date; cadence: Omit<PlanSlotRequest, "now"> };
};

export type UnfilledSlot = { localDate: string; localTime: string; scheduledFor: string; reason: string };

/** Assigns validated briefs to slots in order; the LLM's own scheduledFor is discarded. */
export function assignBriefsToSlots(items: EditorialPlanBriefV2[], slots: PlanSlot[]): { items: EditorialPlanBriefV2[]; unfilled: UnfilledSlot[] } {
  return {
    items: items.slice(0, slots.length).map((item, index) => ({ ...item, scheduledFor: slots[index].scheduledFor.toISOString() })),
    unfilled: slots.slice(items.length).map((slot) => ({
      localDate: slot.localDate,
      localTime: slot.localTime,
      scheduledFor: slot.scheduledFor.toISOString(),
      reason: "no valid proposal survived validation after bounded top-up retries",
    })),
  };
}

/** Merges a validated batch into the running set, dropping cross-batch duplicates and anything beyond `limit`. */
export function mergePlanBatches(existing: PostValidationResult, batch: PostValidationResult, limit: number): PostValidationResult {
  const seenTitles = new Set(existing.kept.map((item) => normalizeSlug(item.workingTitle)));
  const seenQueries = new Set(existing.kept.map((item) => (item.targetQuery ? normalizeSlug(item.targetQuery) : "")));
  const keptTitles = existing.kept.map((item) => item.workingTitle);
  const extras: EditorialPlanBriefV2[] = [];
  const dropped = [...existing.dropped, ...batch.dropped];
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
    if (queryKey) seenQueries.add(queryKey);
    keptTitles.push(item.workingTitle);
    extras.push(item);
  }
  const kept = [...existing.kept, ...extras];
  for (const item of kept.slice(limit)) {
    dropped.push({ title: item.workingTitle, reason: "exceeds requested publication count" });
  }
  return { kept: kept.slice(0, limit), dropped, warnings: [...existing.warnings, ...batch.warnings] };
}

/**
 * Bounded quantity recovery: asks for the missing proposals until `target` is
 * reached, `maxRounds` is spent, or the provider fails (runBatch returns null).
 */
export async function topUpPlanItems(
  validated: PostValidationResult,
  target: number,
  runBatch: (missing: number, existingTitles: string[]) => Promise<PostValidationResult | null>,
  options: { maxRounds?: number; perRound?: number; onRound?: (round: number, kept: number) => void | Promise<void> } = {},
): Promise<{ validated: PostValidationResult; rounds: number }> {
  const maxRounds = options.maxRounds ?? 3;
  const perRound = options.perRound ?? 4;
  let rounds = 0;
  while (validated.kept.length < target && rounds < maxRounds) {
    rounds += 1;
    const missing = Math.min(perRound, target - validated.kept.length);
    const batch = await runBatch(missing, validated.kept.map((item) => item.workingTitle));
    if (!batch) break;
    validated = mergePlanBatches(validated, batch, target);
    await options.onRound?.(rounds, validated.kept.length);
  }
  return { validated, rounds };
}

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
  input: Pick<GenerateEditorialPlanInput, "dateFrom" | "dateTo" | "publicationCount" | "channels" | "strategy" | "slots">,
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

    // 2. Date bounds (slotted plans assign dates afterwards, so the model's date is irrelevant).
    const scheduled = new Date(item.scheduledFor);
    if (!input.slots?.length && (Number.isNaN(scheduled.getTime()) || scheduled < input.dateFrom || scheduled > input.dateTo)) {
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
  if (input.publicationCount < 1 || input.publicationCount > MAX_PLAN_SLOTS) throw new Error("editorial_plan_invalid_quantity");
  if (input.slots && input.slots.length !== input.publicationCount) throw new Error("editorial_plan_slot_count_mismatch");
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
      name: input.strategy?.campaignName || `Editorial plan ${input.slotRequest?.dateFrom ?? input.dateFrom.toISOString().slice(0, 10)}`,
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
        cadence: input.slotRequest ? (input.slotRequest as unknown as Prisma.InputJsonObject) : null,
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
  /** Called after each wave with topics validated so far, so the UI can show progress. */
  onProgress?: (planned: number, total: number) => Promise<void>,
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
      `Your output MUST match ${EDITORIAL_PLAN_SCHEMA_NAME}. Never output prose outside the JSON object.

${SOURCE_DATA_RULES}`;

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
        maxTokens: 8000,
        maxAttempts: 3,
        eventContext: { tenantId: input.tenantId, siteId: input.siteId, planId: plan.id, siteType: context.site.type },
      });

    const mergeBatch = mergePlanBatches;
    const avoidTitles = input.append?.avoidTitles ?? [];
    // Post-validation plus, when extending a plan, rejection of anything that repeats a proposal it already holds.
    const validate = (items: EditorialPlanBriefV2[], count: number): PostValidationResult => {
      const batch = postValidatePlanItems(items, { ...input, publicationCount: count }, context);
      if (avoidTitles.length === 0) return batch;
      const avoidKeys = new Set(avoidTitles.map(normalizeSlug));
      const kept: EditorialPlanBriefV2[] = [];
      for (const item of batch.kept) {
        if (avoidKeys.has(normalizeSlug(item.workingTitle)) || isNearDuplicateTitle(item.workingTitle, avoidTitles)) {
          batch.dropped.push({ title: item.workingTitle, reason: "repeats a proposal already in this plan" });
        } else {
          kept.push(item);
        }
      }
      return { ...batch, kept };
    };

    // A full brief is ~1.5k output tokens; 4 per call fits the 8k output cap of DeepSeek (Claude/OpenAI allow more).
    const perCallBudget = Math.max(1, Math.min(8, getNumberEnv("EDITORIAL_PLAN_ITEMS_PER_CALL", 4)));
    const chunks: number[] = [];
    let remaining = input.publicationCount;
    while (remaining > 0) {
      chunks.push(Math.min(perCallBudget, remaining));
      remaining -= perCallBudget;
    }

    // Chunks run in parallel waves: one wave costs the time of its slowest call instead of the
    // sum of all calls (30 topics at 2 per call was 15 sequential calls). Each wave is told the
    // titles planned by earlier waves; mergeBatch still drops duplicates between parallel chunks.
    const concurrency = Math.max(1, Math.min(8, getNumberEnv("EDITORIAL_PLAN_CONCURRENCY", 8)));
    try {
      for (let waveStart = 0; waveStart < chunks.length; waveStart += concurrency) {
        const wave = chunks.slice(waveStart, waveStart + concurrency);
        const plannedTitles = [...avoidTitles, ...(validated?.kept.map((item) => item.workingTitle) ?? [])];
        const alreadyPlanned = plannedTitles.length > 0
          ? `\nAlready planned titles (do NOT repeat these or close variants of them): ${plannedTitles.join(" | ")}`
          : "";
        const results = await Promise.allSettled(
          wave.map((chunkCount, offset) =>
            runOnce(
              alreadyPlanned +
                (wave.length > 1
                  ? `\nThis is batch ${offset + 1} of ${wave.length} running at the same time: pick clearly different subtopics and keywords from the other batches.`
                  : ""),
              chunkCount,
            ),
          ),
        );
        let waveError: unknown = null;
        for (let offset = 0; offset < results.length; offset += 1) {
          const outcome = results[offset];
          const chunkCount = wave[offset];
          if (outcome.status === "fulfilled") {
            const result = outcome.value;
            attempts = [...attempts, ...result.attempts];
            lastProvider = result.attempts[result.attempts.length - 1].provider;
            lastModel = result.attempts[result.attempts.length - 1].model;
            const batch = validate(result.data.items, chunkCount);
            validated = validated ? mergeBatch(validated, batch, input.publicationCount) : batch;
            structuredEvent("editorial_plan.generation.chunk_completed", {
              tenantId: input.tenantId,
              siteId: input.siteId,
              planId: plan.id,
              chunkRequested: chunkCount,
              chunkKept: batch.kept.length,
              chunkDropped: batch.dropped.length,
              dropReasons: [...new Set(batch.dropped.map((entry) => entry.reason.split(":")[0]))].slice(0, 3),
              runningKept: validated.kept.length,
            });
            continue;
          }
          const error = outcome.reason;
          if (!(error instanceof StructuredOutputError)) throw error;
          waveError = waveError ?? error;
          // A failed chunk must not destroy items validated by other chunks.
          await recordGenerationAttempts(input.tenantId, plan.id, input.siteId, error.attempts, "failed");
          structuredEvent(
            "editorial_plan.generation.chunk_failed",
            { tenantId: input.tenantId, siteId: input.siteId, planId: plan.id, chunkRequested: chunkCount, runningKept: validated?.kept.length ?? 0, attempts: error.attempts.length },
            "warn",
          );
        }
        // Nothing usable after the first wave: fail fast as the sequential version did.
        // Attempts were already recorded above, so this bypasses the outer handler's recording.
        if (waveError && (!validated || validated.kept.length === 0)) {
          structuredEvent("editorial_plan.generation.failed", {
            tenantId: input.tenantId,
            siteId: input.siteId,
            planId: plan.id,
            normalizedError: "EDITORIAL_PLAN_STRUCTURED_OUTPUT_INVALID",
            attempts: (waveError as StructuredOutputError).attempts.length,
          }, "error");
          throw new Error("EDITORIAL_PLAN_STRUCTURED_OUTPUT_INVALID");
        }
        await onProgress?.(validated?.kept.length ?? 0, input.publicationCount);
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
        validated = validate(retryResult.data.items, input.publicationCount);
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
    if (validated) {
      const topUp = await topUpPlanItems(
        validated,
        input.publicationCount,
        async (missing, existingTitles) => {
          const feedback =
            `\nCORRECTION REQUIRED: ${existingTitles.length} valid items exist but ${input.publicationCount} in total were requested. ` +
            `Return ${missing} ADDITIONAL distinct items. Do NOT repeat these titles or close variants of them: ${existingTitles.join(" | ")}. ` +
            `All new items must obey the same relevance and schema rules.`;
          try {
            const topUpResult = await runOnce(feedback, missing);
            attempts = [...attempts, ...topUpResult.attempts];
            lastProvider = topUpResult.attempts[topUpResult.attempts.length - 1].provider;
            lastModel = topUpResult.attempts[topUpResult.attempts.length - 1].model;
            return validate(topUpResult.data.items, missing);
          } catch (error) {
            if (!(error instanceof StructuredOutputError)) throw error;
            structuredEvent("editorial_plan.generation.topup_failed", { tenantId: input.tenantId, siteId: input.siteId, planId: plan.id, requested: input.publicationCount }, "warn");
            return null;
          }
        },
        {
          perRound: perCallBudget,
          maxRounds: Math.max(3, Math.ceil(input.publicationCount / (perCallBudget * 4))),
          onRound: async (round, kept) => {
            structuredEvent("editorial_plan.generation.topup", { tenantId: input.tenantId, siteId: input.siteId, planId: plan.id, round, kept, requested: input.publicationCount });
            await onProgress?.(kept, input.publicationCount);
          },
        },
      );
      validated = topUp.validated;
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

    const assignment = input.slots?.length ? assignBriefsToSlots(validated.kept, input.slots) : { items: validated.kept, unfilled: [] as UnfilledSlot[] };
    const items = assignment.items;
    const append = input.append;
    const unfilledSlots = [...(append?.keepUnfilled ?? []), ...assignment.unfilled];
    const requestedTotal = append?.totalRequested ?? input.publicationCount;
    let filledTotal = items.length;
    let finalStatus: "ready" | "partial" = "ready";
    let replacedTitles: string[] = [];
    await prisma.$transaction(async (tx) => {
      if (append?.replaceItemId) {
        const replaced = await tx.editorialPlanItem.findFirst({ where: { id: append.replaceItemId, tenantId: input.tenantId }, select: { title: true, workingTitle: true } });
        replacedTitles = [replaced?.title, replaced?.workingTitle].filter((value): value is string => Boolean(value));
        // Only an untouched proposal may be replaced; approved or produced items are never discarded.
        const removed = await tx.editorialPlanItem.deleteMany({
          where: { id: append.replaceItemId, tenantId: input.tenantId, projectId: null, status: { in: ["proposed", "rejected"] } },
        });
        if (removed.count !== 1) throw new Error("editorial_plan_item_not_replaceable");
      }
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
      if (append) filledTotal = await tx.editorialPlanItem.count({ where: { planId: plan.id } });
      // A plan with empty required slots is never "ready": it is reported as partial with the exact gaps.
      finalStatus = unfilledSlots.length > 0 || filledTotal < requestedTotal ? "partial" : "ready";
      await tx.editorialPlan.update({
        where: { id: plan.id },
        data: {
          status: finalStatus,
          provider: lastProvider,
          model: lastModel,
          siteIntelligenceVersion: context.profile?.version ?? null,
          generatedOutput: {
            // The replaced proposal's stored brief goes too, so the output never lists a proposal that no longer exists.
            items: [...withoutReplacedBriefs(append?.previous.items ?? [], replacedTitles), ...items],
            dropped: [...(append?.previous.dropped ?? []), ...validated.dropped],
            warnings: [...(append?.previous.warnings ?? []), ...validated.warnings],
            requestedCount: requestedTotal,
            filledCount: filledTotal,
            unfilledSlots,
          } as unknown as Prisma.InputJsonObject,
          error: finalStatus === "partial" ? `${Math.max(unfilledSlots.length, requestedTotal - filledTotal)} of ${requestedTotal} slots could not be filled` : null,
          ...(append?.extendTo
            ? {
                dateTo: append.extendTo.dateTo,
                configuration: { ...((plan.configuration ?? {}) as Record<string, unknown>), cadence: append.extendTo.cadence } as unknown as Prisma.InputJsonObject,
              }
            : {}),
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
      action: append ? (append.replaceItemId ? "editorial_plan.item_regenerated" : append.extendTo ? "editorial_plan.extended" : "editorial_plan.slots_filled") : "editorial_plan.generated",
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
    // A failed extension must not destroy the plan it was extending.
    await prisma.editorialPlan.update({
      where: { id: plan.id },
      data: input.append
        ? { status: input.append.previousStatus, error: `Last ${input.append.replaceItemId ? "regeneration" : input.append.extendTo ? "extension" : "fill"} failed: ${message}` }
        : { status: "failed", error: message },
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
  return runPlanGenerationInBackground(plan, input, strategy, accounts, "editorial_plan_generation");
}

/** Shared durable runner: one Operation per run, real progress, partial/failed states mirrored on the operation. */
async function runPlanGenerationInBackground(
  plan: Awaited<ReturnType<typeof prisma.editorialPlan.create>>,
  input: GenerateEditorialPlanInput,
  strategy: PlanningStrategy,
  accounts: Array<{ id: string; platform: string }>,
  type: "editorial_plan_generation" | "editorial_plan_fill" | "editorial_plan_item_regeneration" | "editorial_plan_extension",
) {
  const { createOperation, startOperation, completeOperation, failOperation, touchOperationProgress } = await import("./operations");
  const operation = await createOperation({
    tenantId: input.tenantId,
    siteId: input.siteId ?? null,
    type,
    initiatorUserId: input.userId ?? null,
    entityType: "editorial_plan",
    entityId: plan.id,
    metadata: { strategy: input.strategy ?? null, slots: input.publicationCount, replaceItemId: input.append?.replaceItemId ?? null },
  });
  await startOperation(operation.id, "generating");
  const reportProgress = (planned: number, total: number) =>
    touchOperationProgress(operation.id, { phase: `${planned} of ${total} topics planned`, completedSteps: planned, totalSteps: total })
      .then(() => undefined)
      .catch(() => undefined);
  void executeEditorialPlanGeneration(plan, input, strategy, accounts, reportProgress)
    .then(async (finished) => {
      const output = (finished?.generatedOutput ?? {}) as StoredPlanOutput & { filledCount?: number };
      const filled = output.filledCount ?? finished?.items.length ?? 0;
      const total = output.requestedCount ?? input.publicationCount;
      await touchOperationProgress(operation.id, { completedSteps: filled, totalSteps: total }).catch(() => undefined);
      await completeOperation(operation.id, finished?.status === "partial" ? { partial: true, phase: `${filled} of ${total} slots filled` } : { phase: `${filled} proposals planned` });
    })
    .catch(async (error) => {
      await failOperation(operation.id, {
        errorCode: "plan_generation_failed",
        errorSummary: error instanceof Error ? error.message : String(error),
        retryable: true,
      });
      structuredEvent(
        "editorial_plan.generation.background_error",
        { tenantId: input.tenantId, siteId: input.siteId, planId: plan.id, normalizedError: error instanceof Error ? error.message : String(error) },
        "error",
      );
    });
  return { planId: plan.id, operationId: operation.id, expectedCount: input.publicationCount };
}

/** Rebuilds a generation input from a persisted plan so extensions use the same strategy and cadence. */
async function loadPlanForExtension(tenantId: string, planId: string, userId?: string | null) {
  const plan = await prisma.editorialPlan.findFirst({ where: { id: planId, tenantId }, include: { items: { select: { id: true, title: true } } } });
  if (!plan) throw new Error("editorial_plan_not_found");
  if (plan.status !== "ready" && plan.status !== "partial") throw new Error("editorial_plan_not_extendable");
  const config = (plan.configuration ?? {}) as Record<string, unknown>;
  const topics = (plan.topicStrategy ?? {}) as Record<string, unknown>;
  const list = (value: unknown) => (Array.isArray(value) ? value.map(String) : []);
  const accountIds = list(plan.accountIds);
  const accounts = accountIds.length
    ? await prisma.publishingAccount.findMany({ where: { tenantId, id: { in: accountIds }, enabled: true }, select: { id: true, platform: true } })
    : [];
  const strategy: PlanningStrategy = {
    mode: (plan.strategyMode ?? "balanced") as PlanningStrategy["mode"],
    primaryIntent: (plan.primaryIntent ?? null) as PlanningStrategy["primaryIntent"],
    contentFormats: list(plan.contentFormats) as PlanningStrategy["contentFormats"],
    market: (config.market as string | null) ?? null,
    campaignName: (config.campaignName as string | null) ?? null,
    language: (config.language as string) ?? "es",
    audience: (config.audience as string | null) ?? null,
    objective: plan.objective,
    priorityTopics: list(topics.priorityTopics),
    excludedTopics: list(topics.excludedTopics),
    seasonalEvents: list(topics.seasonalEvents),
    keywordSeeds: list(topics.keywordSeeds),
    brandsOrEntities: list(topics.brandsOrEntities),
  };
  const base: Omit<GenerateEditorialPlanInput, "publicationCount" | "slots" | "append"> = {
    tenantId,
    siteId: plan.siteId,
    dateFrom: plan.dateFrom,
    dateTo: plan.dateTo,
    objective: plan.objective,
    channels: list(plan.channels).filter((channel): channel is PlanChannel => (CHANNELS as readonly string[]).includes(channel)),
    timezone: plan.timezone,
    accountIds: accounts.map((account) => account.id),
    language: strategy.language,
    audience: strategy.audience,
    userId,
    strategy,
    allowWithoutIntelligence: plan.siteIntelligenceVersion === null,
  };
  return { plan, base, strategy, accounts, previous: (plan.generatedOutput ?? {}) as StoredPlanOutput };
}

/** Atomically claims the plan (ready|partial -> generating) so two extensions never run at once. */
async function claimPlan(planId: string, from: "ready" | "partial"): Promise<void> {
  const claimed = await prisma.editorialPlan.updateMany({ where: { id: planId, status: from }, data: { status: "generating" } });
  if (claimed.count !== 1) throw new Error("editorial_plan_busy");
}

/** Missing-slot recovery: generates proposals only for the plan's unfilled slots; existing items are untouched. */
export async function enqueueFillMissingSlots(tenantId: string, planId: string, userId?: string | null) {
  const { plan, base, strategy, accounts, previous } = await loadPlanForExtension(tenantId, planId, userId);
  const unfilled = previous.unfilledSlots ?? [];
  if (plan.status !== "partial" || unfilled.length === 0) throw new Error("editorial_plan_has_no_unfilled_slots");
  const slots: PlanSlot[] = unfilled.map((slot, index) => ({ index, localDate: slot.localDate, localTime: slot.localTime, scheduledFor: new Date(slot.scheduledFor) }));
  await claimPlan(plan.id, "partial");
  return runPlanGenerationInBackground(
    plan,
    {
      ...base,
      publicationCount: slots.length,
      slots,
      append: {
        previousStatus: "partial",
        previous,
        totalRequested: previous.requestedCount ?? plan.items.length + slots.length,
        avoidTitles: plan.items.map((item) => item.title),
        keepUnfilled: [],
      },
    },
    strategy,
    accounts,
    "editorial_plan_fill",
  );
}

/** Stored briefs minus the ones whose proposal was just replaced (matched by working title). */
export function withoutReplacedBriefs<T>(briefs: T[], replacedTitles: string[]): T[] {
  return briefs.filter((brief) => !replacedTitles.includes((brief as { workingTitle?: string }).workingTitle ?? ""));
}

/** Regenerates one untouched proposal in its own slot; every other item in the plan is preserved. */
export async function enqueueRegeneratePlanItem(tenantId: string, itemId: string, userId?: string | null) {
  const item = await prisma.editorialPlanItem.findFirst({ where: { id: itemId, tenantId } });
  if (!item) throw new Error("editorial_plan_item_not_found");
  if (item.projectId || !["proposed", "rejected"].includes(item.status)) throw new Error("editorial_plan_item_not_replaceable");
  const { plan, base, strategy, accounts, previous } = await loadPlanForExtension(tenantId, item.planId, userId);
  const scheduledFor = item.scheduledFor ?? plan.dateFrom;
  const local = new Intl.DateTimeFormat("en-CA", {
    timeZone: plan.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(scheduledFor);
  const part = (type: string) => local.find((entry) => entry.type === type)?.value ?? "00";
  const slots: PlanSlot[] = [{ index: 0, localDate: `${part("year")}-${part("month")}-${part("day")}`, localTime: `${part("hour")}:${part("minute")}`, scheduledFor }];
  const previousStatus = plan.status as "ready" | "partial";
  await claimPlan(plan.id, previousStatus);
  return runPlanGenerationInBackground(
    plan,
    {
      ...base,
      channels: [item.channel as PlanChannel],
      publicationCount: 1,
      slots,
      append: {
        previousStatus,
        previous,
        totalRequested: previous.requestedCount ?? plan.items.length,
        avoidTitles: plan.items.map((entry) => entry.title),
        keepUnfilled: previous.unfilledSlots ?? [],
        replaceItemId: item.id,
      },
    },
    strategy,
    accounts,
    "editorial_plan_item_regeneration",
  );
}

/**
 * Slot request for extending a plan: only dates strictly after the plan's current local end date,
 * with the plan's stored cadence (articlesPerDay may be overridden). Pure, so it is unit-tested.
 */
export function buildExtensionSlotRequest(
  plan: { dateTo: Date; timezone: string; configuration: unknown },
  input: { dateTo: string; articlesPerDay?: number },
  now?: Date,
): PlanSlotRequest {
  const stored = ((plan.configuration ?? {}) as { cadence?: Partial<PlanSlotRequest> | null }).cadence ?? null;
  const dateFrom = nextLocalDate(localDateInZone(plan.dateTo, plan.timezone));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.dateTo) || input.dateTo < dateFrom) throw new Error("editorial_plan_extend_date_not_after_plan_end");
  const articlesPerDay = input.articlesPerDay ?? stored?.articlesPerDay;
  if (articlesPerDay === undefined) throw new Error("editorial_plan_extend_cadence_required");
  return {
    dateFrom,
    dateTo: input.dateTo,
    timezone: plan.timezone,
    articlesPerDay,
    weekdays: stored?.weekdays,
    // An explicit new cadence replaces per-weekday overrides; otherwise the stored ones carry over.
    weekdayQuotas: input.articlesPerDay === undefined ? stored?.weekdayQuotas : undefined,
    excludedDates: stored?.excludedDates,
    publishTimes: stored?.publishTimes,
    now,
  };
}

/** Extends a plan to a later end date: only the NEW slots are generated; existing items are untouched. */
export async function enqueueExtendPlan(tenantId: string, planId: string, input: { dateTo: string; articlesPerDay?: number }, userId?: string | null) {
  const { plan, base, strategy, accounts, previous } = await loadPlanForExtension(tenantId, planId, userId);
  const request = buildExtensionSlotRequest(plan, input);
  const { slots, skippedPast } = computePlanSlotsDetailed(request);
  if (slots.length === 0) throw new Error("editorial_plan_extend_no_slots");
  if (plan.items.length + slots.length > MAX_PLAN_SLOTS) throw new Error("editorial_plan_extend_too_many_items");
  const bounds = planRangeBounds(request.dateFrom, request.dateTo, plan.timezone);
  const previousStatus = plan.status as "ready" | "partial";
  await claimPlan(plan.id, previousStatus);
  const { now: _now, ...cadence } = request;
  const accepted = await runPlanGenerationInBackground(
    plan,
    {
      ...base,
      dateFrom: bounds.from,
      dateTo: bounds.to,
      publicationCount: slots.length,
      slots,
      append: {
        previousStatus,
        previous,
        totalRequested: (previous.requestedCount ?? plan.items.length) + slots.length,
        avoidTitles: plan.items.map((item) => item.title),
        keepUnfilled: previous.unfilledSlots ?? [],
        // The stored cadence keeps describing the whole plan, so its start stays the original one.
        extendTo: { dateTo: bounds.to, cadence: { ...cadence, dateFrom: localDateInZone(plan.dateFrom, plan.timezone) } },
      },
    },
    strategy,
    accounts,
    "editorial_plan_extension",
  );
  return { ...accepted, skippedPast: skippedPast.length };
}

/** Rename and/or archive a plan. Archiving is refused while a generation run owns the plan. */
export async function updateEditorialPlan(tenantId: string, planId: string, input: { name?: string; status?: "archived" }, userId?: string | null) {
  const plan = await prisma.editorialPlan.findFirst({ where: { id: planId, tenantId } });
  if (!plan) return null;
  if (input.status === "archived" && plan.status === "generating") throw new Error("editorial_plan_busy");
  const updated = await prisma.editorialPlan.update({ where: { id: plan.id }, data: { name: input.name?.trim() || undefined, status: input.status } });
  await writeAudit({
    tenantId,
    actorType: userId ? "user" : "system",
    actorUserId: userId,
    action: input.status === "archived" ? "editorial_plan.archived" : "editorial_plan.updated",
    entityType: "editorial_plan",
    entityId: plan.id,
    metadata: { name: updated.name },
  });
  return updated;
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
    prisma.editorialPlan.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        _count: { select: { items: true } },
        site: { select: { id: true, name: true } },
        items: { select: { channel: true, status: true } },
      },
    }),
  ]);

  // Enrich each plan with channel and status rollups so the Studio can render
  // meaningful cards without a per-plan detail request.
  const enriched = items.map(({ items: itemRollups, ...plan }) => {
    const channelCounts = { website: 0, x: 0, instagram: 0 } as Record<string, number>;
    const statusCounts = {} as Record<string, number>;
    for (const row of itemRollups) {
      if (channelCounts[row.channel] !== undefined) {
        channelCounts[row.channel] += 1;
      }
      statusCounts[row.status] = (statusCounts[row.status] ?? 0) + 1;
    }
    return {
      ...plan,
      siteName: plan.site?.name ?? null,
      channelCounts,
      statusCounts,
    };
  });

  return { items: enriched, page, pageSize, total };
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
    secondaryKeywords?: string[] | null;
    relatedEntities?: string[] | null;
    audience?: string | null;
    suggestedSlug?: string | null;
    sourceEvidence?: Array<{ title: string; url?: string; sourceType?: string }> | null;
    /** Merged into metadata.generation; null clears it. */
    generation?: PlanItemGenerationSettings | null;
  },
) {
  const item = await prisma.editorialPlanItem.findFirst({ where: { id: itemId, tenantId } });
  if (!item) return null;
  // The app owns URLs: internal links must be indexed pages, evidence must be indexed or a known source item.
  // URLs already on the item (from validated generation) stay allowed so edits can keep or reorder them.
  const existingUrls = new Set([
    ...jsonStrings(item.suggestedInternalLinks),
    ...jsonArray(item.sourceEvidence).map((entry) => (entry && typeof entry === "object" ? String((entry as Record<string, unknown>).url ?? "") : "")),
  ]);
  const newLinks = (input.suggestedInternalLinks ?? []).filter((url) => !existingUrls.has(url));
  const newEvidence = (input.sourceEvidence ?? []).map((entry) => entry.url).filter((url): url is string => Boolean(url) && !existingUrls.has(url!));
  if (newLinks.length || newEvidence.length) {
    if (!item.siteId) throw new Error("editorial_plan_item_url_not_in_inventory");
    const { findUninventoriedUrls } = await import("./planning-settings");
    const missing = await findUninventoriedUrls(tenantId, item.siteId, { internalLinks: newLinks, evidence: newEvidence });
    if (missing.length) throw new Error(`editorial_plan_item_url_not_in_inventory: ${missing.slice(0, 3).join(", ")}`);
  }
  const metadata = (item.metadata && typeof item.metadata === "object" && !Array.isArray(item.metadata) ? item.metadata : {}) as Record<string, unknown>;
  return prisma.editorialPlanItem.update({
    where: { id: item.id },
    data: {
      secondaryKeywords: input.secondaryKeywords === undefined ? undefined : input.secondaryKeywords?.length ? (input.secondaryKeywords as Prisma.InputJsonArray) : Prisma.JsonNull,
      relatedEntities: input.relatedEntities === undefined ? undefined : input.relatedEntities?.length ? (input.relatedEntities as Prisma.InputJsonArray) : Prisma.JsonNull,
      audience: input.audience === undefined ? undefined : input.audience?.trim() || null,
      suggestedSlug: input.suggestedSlug === undefined ? undefined : input.suggestedSlug?.trim() || null,
      sourceEvidence: input.sourceEvidence === undefined ? undefined : input.sourceEvidence?.length ? (input.sourceEvidence as unknown as Prisma.InputJsonArray) : Prisma.JsonNull,
      metadata: input.generation === undefined ? undefined : ({ ...metadata, generation: input.generation ?? undefined } as Prisma.InputJsonObject),
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

/** Per-item writing settings edited in the Studio drawer; stored in item.metadata.generation. */
export type PlanItemGenerationSettings = {
  tone?: string | null;
  includeFaq?: boolean | null;
  includeImage?: boolean | null;
  instructions?: string | null;
};

function jsonArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function jsonStrings(value: unknown): string[] {
  return jsonArray(value).filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0);
}

/** Reads metadata.generation defensively: only known keys with the right types survive. */
export function readGenerationSettings(metadata: unknown): PlanItemGenerationSettings {
  const raw = metadata && typeof metadata === "object" && !Array.isArray(metadata) ? (metadata as Record<string, unknown>).generation : null;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const record = raw as Record<string, unknown>;
  const settings: PlanItemGenerationSettings = {};
  if (typeof record.tone === "string" && record.tone.trim()) settings.tone = record.tone.trim();
  if (typeof record.includeFaq === "boolean") settings.includeFaq = record.includeFaq;
  if (typeof record.includeImage === "boolean") settings.includeImage = record.includeImage;
  if (typeof record.instructions === "string" && record.instructions.trim()) settings.instructions = record.instructions.trim();
  return settings;
}

type BriefSourceItem = Pick<
  Prisma.EditorialPlanItemGetPayload<Record<string, never>>,
  | "id" | "planId" | "siteId" | "channel" | "title" | "workingTitle" | "finalSuggestedTitle" | "angle" | "topic" | "topicCluster" | "pillarPage"
  | "primaryIntent" | "searchIntent" | "secondaryIntents" | "funnelStage" | "targetQuery" | "primaryKeyword" | "secondaryKeywords" | "semanticKeywords"
  | "relatedEntities" | "questionsToAnswer" | "audience" | "editorialObjective" | "competitorAngle" | "suggestedInternalLinks" | "suggestedExternalEvidenceTypes"
  | "faqCandidates" | "schemaTypes" | "outline" | "recommendedWordCountMin" | "recommendedWordCountMax" | "cannibalizationRisk" | "seoTitle"
  | "metaDescription" | "suggestedSlug" | "freshnessRequirement" | "imageConcept" | "contentType" | "sourceEvidence" | "notes" | "metadata"
>;

/**
 * Pure: turns an (edited) plan item into the project the writer receives. Everything the editor can change in
 * the Studio drawer lands either in the brief text (what the text model reads) or in metadata (what QA reads).
 */
export function buildProjectInputFromPlanItem(item: BriefSourceItem, options: { language?: string } = {}) {
  const outline = jsonArray(item.outline);
  const generation = readGenerationSettings(item.metadata);
  const secondaryKeywords = jsonStrings(item.secondaryKeywords);
  const relatedEntities = jsonStrings(item.relatedEntities);
  const questions = jsonStrings(item.questionsToAnswer);
  const internalLinks = jsonStrings(item.suggestedInternalLinks);
  const evidence = jsonArray(item.sourceEvidence)
    .map((entry) => (entry && typeof entry === "object" ? (entry as Record<string, unknown>) : null))
    .filter((entry): entry is Record<string, unknown> => Boolean(entry));
  const outlineText = outline
    .map((entry, index) => {
      if (!entry || typeof entry !== "object") return `${index + 1}. ${String(entry)}`;
      const record = entry as Record<string, unknown>;
      const subpoints = jsonStrings(record.subpoints);
      return [`${index + 1}. ${String(record.heading ?? "")}`, ...subpoints.map((point) => `   - ${point}`)].join("\n");
    })
    .join("\n");
  const yesNo = (value: boolean) => (value ? "si" : "no");
  const briefSections = [
    `Titulo: ${item.finalSuggestedTitle || item.workingTitle || item.title}`,
    item.angle ? `Angulo: ${item.angle}` : null,
    item.topic ? `Tema: ${item.topic}` : null,
    item.topicCluster ? `Cluster: ${item.topicCluster}` : null,
    item.contentType ? `Formato: ${item.contentType}` : null,
    item.audience ? `Audiencia: ${item.audience}` : null,
    item.editorialObjective ? `Objetivo editorial: ${item.editorialObjective}` : null,
    item.primaryIntent ? `Intencion de busqueda: ${item.primaryIntent}` : null,
    jsonStrings(item.secondaryIntents).length ? `Intenciones secundarias: ${jsonStrings(item.secondaryIntents).join(", ")}` : null,
    item.targetQuery ? `Query objetivo: ${item.targetQuery}` : null,
    item.primaryKeyword ? `Keyword principal: ${item.primaryKeyword}` : null,
    secondaryKeywords.length ? `Keywords secundarias: ${secondaryKeywords.join(", ")}` : null,
    relatedEntities.length ? `Entidades relacionadas: ${relatedEntities.join(", ")}` : null,
    item.recommendedWordCountMin ? `Extension objetivo: ${item.recommendedWordCountMin}-${item.recommendedWordCountMax ?? item.recommendedWordCountMin} palabras` : null,
    outlineText ? `Estructura sugerida:\n${outlineText}` : null,
    questions.length ? `Preguntas a responder:\n${questions.map((question) => `- ${question}`).join("\n")}` : null,
    item.seoTitle ? `SEO title sugerido: ${item.seoTitle}` : null,
    item.metaDescription ? `Meta description sugerida: ${item.metaDescription}` : null,
    internalLinks.length ? `Enlaces internos (solo estas URLs):\n${internalLinks.map((url) => `- ${url}`).join("\n")}` : null,
    evidence.length
      ? `Evidencias (no inventes datos fuera de ellas):\n${evidence.map((entry) => `- ${String(entry.title ?? entry.url ?? "")}${entry.url ? ` (${String(entry.url)})` : ""}`).join("\n")}`
      : null,
    generation.tone ? `Tono: ${generation.tone}` : null,
    generation.includeFaq !== undefined && generation.includeFaq !== null ? `Incluir seccion FAQ: ${yesNo(generation.includeFaq)}` : null,
    generation.includeImage !== undefined && generation.includeImage !== null ? `Imagen destacada: ${yesNo(generation.includeImage)}` : null,
    item.imageConcept && generation.includeImage !== false ? `Concepto de imagen: ${item.imageConcept}` : null,
    generation.instructions ? `Instrucciones adicionales: ${generation.instructions}` : null,
    item.notes ? `Notas del editor: ${item.notes}` : null,
  ].filter((section): section is string => Boolean(section));

  return {
    siteId: item.siteId!,
    title: item.finalSuggestedTitle || item.workingTitle || item.title,
    brief: briefSections.join("\n\n"),
    goal: (item.channel === "website" ? "article" : "social_pack") as "article" | "social_pack",
    primaryLanguage: options.language ?? "es",
    metadata: {
      editorialPlanId: item.planId,
      editorialPlanItemId: item.id,
      channel: item.channel,
      contentType: item.contentType ?? null,
      audience: item.audience ?? null,
      primaryIntent: item.primaryIntent ?? item.searchIntent ?? null,
      secondaryIntents: item.secondaryIntents ?? [],
      funnelStage: item.funnelStage ?? null,
      targetQuery: item.targetQuery ?? null,
      primaryKeyword: item.primaryKeyword ?? null,
      secondaryKeywords,
      semanticKeywords: item.semanticKeywords ?? [],
      relatedEntities,
      questionsToAnswer: item.questionsToAnswer ?? [],
      topicCluster: item.topicCluster ?? null,
      pillarPage: item.pillarPage ?? null,
      suggestedInternalLinks: internalLinks,
      suggestedExternalEvidenceTypes: item.suggestedExternalEvidenceTypes ?? [],
      sourceEvidence: evidence,
      faqCandidates: generation.includeFaq === false ? [] : item.faqCandidates ?? [],
      schemaTypes: item.schemaTypes ?? [],
      outline,
      recommendedWordCountMin: item.recommendedWordCountMin ?? null,
      recommendedWordCountMax: item.recommendedWordCountMax ?? null,
      cannibalizationRisk: item.cannibalizationRisk ?? null,
      seoTitle: item.seoTitle ?? null,
      metaDescription: item.metaDescription ?? null,
      suggestedSlug: item.suggestedSlug ?? null,
      freshnessRequirement: item.freshnessRequirement ?? null,
      angle: item.angle ?? null,
      editorNotes: item.notes ?? null,
      generation,
    } as Prisma.InputJsonObject,
  };
}

export async function generateContentFromEditorialPlanItem(tenantId: string, itemId: string, userId?: string | null) {
  const item = await prisma.editorialPlanItem.findFirst({ where: { id: itemId, tenantId }, include: { project: true, plan: { select: { configuration: true } } } });
  if (!item) return null;
  if (item.projectId && item.project) return { item, project: item.project };
  if (item.status !== "approved") throw new Error("editorial_plan_item_must_be_approved");
  if (!item.siteId) throw new Error("editorial_plan_item_site_required");

  const language = ((item.plan.configuration ?? {}) as { language?: unknown }).language;
  const project = await createProject(tenantId, buildProjectInputFromPlanItem(item, { language: typeof language === "string" ? language : "es" }));
  await prisma.editorialPlanItem.update({ where: { id: item.id }, data: { projectId: project.id, status: "generating", contentGenerationStatus: "generating" } });
  await startProjectGeneration(project.id, tenantId);
  await writeAudit({ tenantId, actorType: userId ? "user" : "system", actorUserId: userId, action: "editorial_plan_item.content_generation_started", entityType: "editorial_plan_item", entityId: item.id, metadata: { projectId: project.id } });
  return { item: await prisma.editorialPlanItem.findUnique({ where: { id: item.id } }), project };
}
