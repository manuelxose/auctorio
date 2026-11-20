// Stage registry of the unified production pipeline. Every request kind runs
// these same functions in PRODUCTION_STAGES order; only `prepare` and `brief`
// dispatch on kind (cluster classification/site-value stay specialized).
// Tests swap entries with setProductionStageOverrides (ENG-01) and inject the
// writer with setArticleWriterFactory — no real AI in CI.

import { Prisma } from "@prisma/client";
import { getPrismaClient } from "../../infrastructure/db/prisma";
import { structuredEvent } from "../../shared/utils/logger";
import { sanitizeEditorialHtml } from "../html-sanitizer";
import { getOrCreatePolicy } from "../automation";
import { createPublication, enqueuePublication } from "../publication";
import { writeAudit } from "../audit";
import { runVersionQaV2 } from "../qa";
import { requestImageGenerationForVersion, requestInlineImagesForVersion } from "../orchestration";
import { buildFactSafetyReport, hasCopyrightWarningCues, type FactSafetyReport } from "../editorial-engine/fact-safety";
import { decideCreateUpdateOrSkip, type DuplicateCheckResult } from "../editorial-engine/duplicate-check";
import { buildWriterPrompt, parseWriterOutput } from "../editorial-engine/writer-prompt";
import { getArticleWriter } from "../editorial-engine/writer-provider";
import { bodyWordCount, buildSeoPackage, withTableOfContents } from "../editorial-engine/seo-package";
import { linkInlineAttributions } from "../editorial-engine/inline-citations";
import { applyBrandCards } from "../editorial-engine/brand";
import { insertYoutube } from "../editorial-engine/visuals";
import { buildProvenance, summarizeProvenance } from "../editorial-engine/provenance";
import { runEditorialQa } from "../editorial-engine/editorial-qa";
import { evaluatePublicationGates } from "../editorial-engine/publication-gates";
import { buildClusterBrief, enrichmentKnowledgeOf, prepareClusterInput } from "../editorial-engine/cluster-production";
import type { SeoPackage } from "../editorial-engine/types";
import { resolveWritingSettings } from "../editorial-engine/structure";
import { buildPlanBrief, outlineHeadings, prepareManualInput, preparePlanItemInput, slotOrNow } from "./plan-item";
import { approveVersion } from "../repository";
import {
  ProductionStop,
  type BriefArtifact,
  type GatesArtifact,
  type MaterializeArtifact,
  type PreparedInput,
  type ProductionRequest,
  type ProductionRequestOptions,
  type QaArtifact,
  type StageContext,
  type WriteArtifact,
} from "./types";

const prisma = getPrismaClient();

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function need<T>(value: T | undefined, stage: string): T {
  if (value === undefined) throw new Error(`production_stage_input_missing: ${stage}`);
  return value;
}

async function updateGeneration(ctx: StageContext, data: Prisma.ArticleGenerationUpdateInput): Promise<void> {
  if (ctx.generationId) {
    await prisma.articleGeneration.update({ where: { id: ctx.generationId }, data });
  }
}

// ────────────────────────────────────────────────────────────── Shared stages

async function prepare(job: { tenantId: string; siteId: string; request: ProductionRequest }, now: Date): Promise<PreparedInput> {
  const { request } = job;
  if (request.kind === "cluster") return prepareClusterInput(job.tenantId, request.clusterId, job.siteId, request, now);
  if (request.kind === "plan_item") return preparePlanItemInput(job.tenantId, request.planItemId, request);
  return prepareManualInput(job.tenantId, request, request);
}

async function duplicates(ctx: StageContext): Promise<DuplicateCheckResult> {
  const { input } = ctx;
  const result = await decideCreateUpdateOrSkip({
    tenantId: ctx.tenantId,
    siteId: ctx.siteId,
    clusterId: input.cluster?.id ?? null,
    excludeProjectIds: input.ownProjectId ? [input.ownProjectId] : [],
    headline: input.headline,
    summary: input.summary,
    entityNames: input.primaryEntityNames,
  });
  if (ctx.kind !== "cluster") {
    // Planned/manual content was approved as its own piece: overlap is flagged
    // for review (cannibalization risk in QA), never silently merged or dropped.
    return result.decision === "create_new"
      ? result
      : { ...result, decision: "create_new", reason: `possible overlap flagged for review — ${result.reason}`, targetProjectId: null, targetVersionId: null };
  }
  if (result.decision === "skip") {
    await updateGeneration(ctx, { status: "skipped", decision: "skip", decisionReason: result.reason });
    await writeAudit({ tenantId: ctx.tenantId, action: "editorial_engine.skipped", entityType: "article_generation", entityId: ctx.generationId, actorType: "automation", metadata: { clusterId: input.cluster?.id, reason: result.reason, productionJobId: ctx.jobId } });
    throw new ProductionStop("duplicate_skip", result.reason);
  }
  return result;
}

async function evidence(ctx: StageContext): Promise<FactSafetyReport> {
  return buildFactSafetyReport(ctx.input.ledgerFacts, ctx.input.factContext);
}

async function brief(ctx: StageContext): Promise<BriefArtifact> {
  const factSafety = need(ctx.artifacts.evidence, "evidence");
  if (ctx.kind === "cluster") return buildClusterBrief(ctx.input, need(ctx.artifacts.duplicates, "duplicates"), factSafety, ctx.now);
  return buildPlanBrief(ctx.input, factSafety, ctx.now);
}

/** The writer returns a JSON envelope (HTML body, claims, SEO); too tight a cap truncates it and the write stage fails instead of storing it. */
export function writerMaxTokens(targetWordMax: number): number {
  return Math.min(8000, Math.max(3000, Math.round(targetWordMax * 5)));
}

/** Per-run editor input (rewrite feedback, prompt preset) on top of the brief's guidance. */
async function requestGuidance(tenantId: string, options: ProductionRequestOptions): Promise<string[]> {
  const out: string[] = [];
  if (options.feedback?.trim()) out.push(`Revision feedback from the editor (apply it in this rewrite):
${options.feedback.trim().slice(0, 4000)}`);
  if (options.presetVersionId) {
    const version = await prisma.studioPromptVersion.findFirst({ where: { id: options.presetVersionId, status: "approved", preset: { tenantId } }, select: { systemTemplate: true, userTemplate: true } });
    const text = version?.systemTemplate?.trim() || version?.userTemplate?.trim();
    if (text) out.push(`House writing instructions (prompt preset):
${text.slice(0, 4000)}`);
  }
  return out;
}

/** Second pass for a guide that came back short: same envelope and blocks, longer body sections. */
export function expandPrompt(userPrompt: string, previousOutput: string, words: number, minimum: number): string {
  return `${userPrompt}

Your previous answer (below) has only ${words} words in the article body (without TOC, cards, Sources and Recommended reading); the minimum is ${minimum}.
Return the same JSON envelope, keeping every block, heading, link, card placeholder and source, and expand the body sections with more concrete detail grounded in the fact ledger (steps, examples, figures, comparisons) until the body has at least ${minimum} words. No conclusion section, no filler.

Previous answer:
${previousOutput.slice(0, 60_000)}`;
}

async function write(ctx: StageContext): Promise<WriteArtifact> {
  const briefArtifact = need(ctx.artifacts.brief, "brief");
  const factSafety = need(ctx.artifacts.evidence, "evidence");
  const duplicate = need(ctx.artifacts.duplicates, "duplicates");
  const writerPrompt = buildWriterPrompt({
    brief: briefArtifact.brief,
    licenses: factSafety.licenses,
    siteValueBlocks: briefArtifact.siteValueBlocks,
    previousArticle: briefArtifact.previousArticle,
    updateDelta: briefArtifact.updateDelta,
    language: ctx.input.language,
    editorialGuidance: [...briefArtifact.guidance, ...(await requestGuidance(ctx.tenantId, ctx.request))],
    plannedOutline: outlineHeadings(ctx.input.plan?.record ?? {}),
  });
  await updateGeneration(ctx, {
    status: "generating",
    decision: duplicate.decision,
    decisionReason: duplicate.reason,
    articleType: briefArtifact.brief.articleType,
    searchIntent: briefArtifact.brief.searchIntent,
    brief: briefArtifact.brief as unknown as Prisma.InputJsonValue,
    factLicenses: factSafety.licenses as unknown as Prisma.InputJsonValue,
    writerPrompt: writerPrompt.userPrompt,
  });
  // One bounded retry at the token ceiling: a truncated envelope is the usual cause.
  const attempts = [writerMaxTokens(briefArtifact.brief.targetLengthRange.max), 8000];
  for (let attempt = 0; attempt < attempts.length; attempt++) {
    const result = await getArticleWriter().generate({
      prompt: writerPrompt.userPrompt,
      systemPrompt: writerPrompt.systemPrompt,
      maxTokens: attempts[attempt],
      language: ctx.input.language,
    });
    await updateGeneration(ctx, { provider: result.provider, model: result.model, articleOutput: result.output.slice(0, 300_000) });
    let parsed = parseWriterOutput(result.output);
    if (parsed) {
      // Guides: one bounded "expand" pass when the body falls clearly short (below QA's 85 % tolerance; models vary run to run).
      const minimum = briefArtifact.brief.articleTargets ? briefArtifact.brief.targetLengthRange.min : 0;
      const words = bodyWordCount(parsed.bodyHtml);
      if (words < minimum * 0.85) {
        const expanded = await getArticleWriter()
          .generate({
            prompt: expandPrompt(writerPrompt.userPrompt, result.output, words, minimum),
            systemPrompt: writerPrompt.systemPrompt,
            maxTokens: 8000,
            language: ctx.input.language,
          })
          .catch(() => null);
        const longer = expanded ? parseWriterOutput(expanded.output) : null;
        const longerWords = longer ? bodyWordCount(longer.bodyHtml) : 0;
        structuredEvent("production.writer_expanded", { jobId: ctx.jobId, words, minimum, expandedWords: longerWords });
        if (longer && longerWords > words) {
          parsed = longer;
          await updateGeneration(ctx, { articleOutput: expanded!.output.slice(0, 300_000) });
        }
      }
      // Editorial HTML is allowlist-sanitized before anything is stored.
      // The brief marks own posts «(own post)» for the writer; a copied marker never reaches the article.
      parsed.bodyHtml = sanitizeEditorialHtml(parsed.bodyHtml).replace(/\s*\((?:own post|post propio)\)/gi, "");
      // Named-but-unlinked sources («Según television.digital.gob.es…») get their link inline, not only in «Fuentes».
      parsed.bodyHtml = linkInlineAttributions(parsed.bodyHtml, ctx.input.ledgerFacts);
      return { parsed, provider: result.provider, model: result.model, writerPrompt: writerPrompt.userPrompt };
    }
    structuredEvent("production.writer_output_invalid", { jobId: ctx.jobId, attempt: attempt + 1, maxTokens: attempts[attempt], outputChars: result.output.length }, "warn");
  }
  // Nothing is materialized: the raw output stays on the generation record only, never in a ContentVersion.
  throw new Error(`writer_output_invalid: the writer did not return a complete JSON article after ${attempts.length} attempts (likely truncated). Retry the job; if it persists, shorten the target length or switch the AI provider.`);
}

async function seo(ctx: StageContext): Promise<SeoPackage> {
  const brief = need(ctx.artifacts.brief, "brief").brief;
  const article = need(ctx.artifacts.write, "write").parsed;
  const brand = ctx.input.plan?.brand;
  const video = ctx.input.plan?.youtube;
  if (brief.articleTargets && video) article.bodyHtml = insertYoutube(article.bodyHtml, video);
  if (brief.articleTargets && brand) article.bodyHtml = applyBrandCards(article.bodyHtml, brand, brief.articleTargets.sections, ctx.input.language, ctx.input.plan?.disclaimer);
  if (brief.articleTargets?.sections.toc) article.bodyHtml = withTableOfContents(article.bodyHtml, ctx.input.language);
  return buildSeoPackage({
    brief,
    article,
    internalLinks: ctx.input.internalLinks,
    factSourceUrls: ctx.input.ledgerFacts.map((fact) => ({ url: fact.sourceUrl, publisher: fact.publisher })),
  });
}

/** The single QA stage every kind converges on: editorial QA + version QA v2 on the same draft. */
async function qa(ctx: StageContext): Promise<QaArtifact> {
  const { input } = ctx;
  const parsed = need(ctx.artifacts.write, "write").parsed;
  const seoPackage = need(ctx.artifacts.seo, "seo");
  const briefArtifact = need(ctx.artifacts.brief, "brief");
  const factSafety = need(ctx.artifacts.evidence, "evidence");
  const duplicate = need(ctx.artifacts.duplicates, "duplicates");
  const editorial = runEditorialQa({
    article: parsed,
    brief: briefArtifact.brief,
    licenses: factSafety.licenses,
    seo: seoPackage,
    sourceTexts: input.sourceTexts,
    indexedPageTitles: input.indexedPageTitles,
    entityNames: input.entities.map((entity) => entity.name),
    enrichmentKnowledge: enrichmentKnowledgeOf(input.enrichments),
    enrichmentDates: input.enrichments.map((enrichment) => enrichment.releaseDate).filter((date): date is string => Boolean(date)),
    plannedOutline: outlineHeadings(input.plan?.record ?? {}),
    language: input.language,
  });
  const record = input.plan?.record ?? {};
  const overlap = ctx.kind !== "cluster" && duplicate.similarity >= 0.6;
  const version = runVersionQaV2(
    { title: parsed.title, excerpt: seoPackage.excerpt, bodyHtml: parsed.bodyHtml, seoTitle: seoPackage.seoTitle, seoDescription: seoPackage.metaDescription },
    {
      // The hero image is requested after materialization; syncImageResultToStudio re-runs QA v2 once it exists.
      imageReady: false,
      metadata: {
        contentType: record.contentType ?? null,
        primaryIntent: record.primaryIntent ?? record.searchIntent ?? briefArtifact.brief.searchIntent,
        primaryKeyword: briefArtifact.brief.primaryKeyword,
        outline: record.outline ?? [],
        secondaryKeywords: briefArtifact.brief.secondaryKeywords,
        siteUrl: input.site.baseUrl ?? null,
        internalLinksEnabled: resolveWritingSettings(input.siteArticleTargets).internalLinks.enabled,
        ...(briefArtifact.brief.articleTargets ? { articleTargets: briefArtifact.brief.articleTargets } : {}),
      },
      siteType: input.site.type,
      recommendedWordCountMin: briefArtifact.brief.targetLengthRange.min,
      recommendedWordCountMax: briefArtifact.brief.targetLengthRange.max,
      evidenceCount: input.ledgerFacts.length,
      cannibalizationRisk: overlap ? "high" : typeof record.cannibalizationRisk === "string" ? record.cannibalizationRisk : null,
      internalLinkInventorySize: input.internalLinks.length,
      externalSourceInventorySize: externalSourceCount(input.ledgerFacts),
    },
  );
  return { editorial, version };
}

async function gates(ctx: StageContext): Promise<GatesArtifact> {
  const { input } = ctx;
  const parsed = need(ctx.artifacts.write, "write").parsed;
  const factSafety = need(ctx.artifacts.evidence, "evidence");
  const qaArtifact = need(ctx.artifacts.qa, "qa");
  const provenance = buildProvenance({ article: parsed, licenses: factSafety.licenses });
  const policy = await getOrCreatePolicy(ctx.tenantId, ctx.siteId);
  const copyrightWarning = hasCopyrightWarningCues(input.memberTitles);
  const decision = evaluatePublicationGates({
    qa: qaArtifact.editorial,
    configJson: asRecord(policy.autonomousQaThresholds),
    policy: { autoGenerate: policy.autoGenerate, autoApprove: policy.autoApprove, autoSchedule: policy.autoSchedule, autoPublish: policy.autoPublish },
    sourceGroups: summarizeProvenance(provenance).sourceGroups.size,
    siteFitScore: input.siteFitScore,
    copyrightWarning,
  });
  const briefArtifact = need(ctx.artifacts.brief, "brief");
  await updateGeneration(ctx, {
    status: "qa_review",
    parsedArticle: parsed as unknown as Prisma.InputJsonValue,
    seoPackage: need(ctx.artifacts.seo, "seo") as unknown as Prisma.InputJsonValue,
    qaReport: qaArtifact.editorial as unknown as Prisma.InputJsonValue,
    publicationDecision: decision as unknown as Prisma.InputJsonValue,
    provenance: provenance as unknown as Prisma.InputJsonValue,
    updateDelta: briefArtifact.updateDelta ? (briefArtifact.updateDelta as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
  });
  if (decision.decision === "reject") {
    throw new ProductionStop("quality_rejected", `publication gates rejected the draft: ${decision.reasons.join("; ") || "quality below threshold"}`, "write");
  }
  return { decision, copyrightWarning, provenance };
}

async function materialize(ctx: StageContext): Promise<MaterializeArtifact> {
  const { input } = ctx;
  const parsed = need(ctx.artifacts.write, "write").parsed;
  const seoPackage = need(ctx.artifacts.seo, "seo");
  const qaArtifact = need(ctx.artifacts.qa, "qa");
  const gate = need(ctx.artifacts.gates, "gates");
  const duplicate = need(ctx.artifacts.duplicates, "duplicates");
  const result: MaterializeArtifact = { projectId: null, versionId: null, publicationId: null, imageRequestError: null };
  if (ctx.kind === "cluster" && input.options.persistDraft === false) {
    return result;
  }

  // Cluster drafts keep the editorial QA report (engine review UI); plan/manual
  // drafts keep QA v2, which the image sync and review gate already read.
  const qaReport = (ctx.kind === "cluster" ? qaArtifact.editorial : qaArtifact.version) as unknown as Prisma.JsonObject;
  const title = (parsed.title || seoPackage.h1 || parsed.h1 || "Sin título").slice(0, 200);
  // A retried job reuses the project an earlier attempt already created (ENG-02).
  const jobProject = input.ownProjectId
    ? null
    : await prisma.contentProject.findFirst({ where: { tenantId: ctx.tenantId, metadata: { path: ["productionJobId"], equals: ctx.jobId } }, select: { id: true } });
  let projectId = input.ownProjectId ?? jobProject?.id ?? (duplicate.decision === "update_existing" ? duplicate.targetProjectId : null);
  const existing = projectId ? await prisma.contentProject.findFirst({ where: { id: projectId, tenantId: ctx.tenantId } }) : null;
  if (!existing) projectId = null;
  // Registry items that fed this draft (plan evidence), kept on the project that owns every version.
  // Guide targets + inventory size: QA v2 re-runs rebuild the checklist from project metadata; publishers read the JSON-LD switch.
  const brief = need(ctx.artifacts.brief, "brief").brief;
  const articleTargets = brief.articleTargets;
  const internalLinksEnabled = resolveWritingSettings(input.siteArticleTargets).internalLinks.enabled;
  const recommendedWordCountMin = brief.targetLengthRange.min;
  const recommendedWordCountMax = brief.targetLengthRange.max;
  const guideMetadata = articleTargets
    ? { articleTargets, internalLinkInventorySize: input.internalLinks.length, externalSourceInventorySize: externalSourceCount(input.ledgerFacts) }
    : {};
  const sourceOrigins = input.ledgerFacts.flatMap((fact) => (fact.origin ? [{ ...fact.origin, url: fact.sourceUrl }] : [])).slice(0, 40);

  if (!existing) {
    const firstItem = input.cluster
      ? await prisma.sourceItem.findFirst({ where: { tenantId: ctx.tenantId, clusterId: input.cluster.id }, orderBy: { discoveredAt: "asc" }, select: { id: true } })
      : null;
    const created = await prisma.contentProject.create({
      data: {
        tenantId: ctx.tenantId,
        siteId: ctx.siteId,
        title,
        brief: ctx.request.kind === "manual" ? ctx.request.brief : seoPackage.excerpt,
        goal: "article",
        status: "draft",
        primaryLanguage: input.language,
        clusterId: input.cluster?.id ?? null,
        sourceItemId: firstItem?.id ?? sourceOrigins[0]?.itemId ?? null,
        origin: ctx.kind === "cluster" ? "editorial_engine" : "manual",
        metadata: {
          generationId: ctx.generationId,
          productionJobId: ctx.jobId,
          articleType: duplicate.decision === "update_existing" ? "article_update" : "create_new",
          provenance: gate.provenance.slice(0, 40),
          ...(sourceOrigins.length ? { sourceOrigins } : {}),
          ...guideMetadata,
          internalLinksEnabled,
          recommendedWordCountMin,
          recommendedWordCountMax,
          siteUrl: input.site.baseUrl ?? null,
          slug: seoPackage.slug,
        } as Prisma.InputJsonValue,
      },
    });
    projectId = created.id;
  } else {
    await prisma.contentProject.update({
      where: { id: existing.id },
      data: {
        status: "draft",
        ...(input.cluster ? { clusterId: input.cluster.id } : {}),
        metadata: {
          ...asRecord(existing.metadata),
          lastGenerationId: ctx.generationId,
          productionJobId: ctx.jobId,
          provenance: gate.provenance.slice(0, 40),
          ...(sourceOrigins.length ? { sourceOrigins } : {}),
          ...guideMetadata,
          internalLinksEnabled,
          recommendedWordCountMin,
          recommendedWordCountMax,
          siteUrl: input.site.baseUrl ?? null,
          slug: asRecord(existing.metadata).suggestedSlug ?? seoPackage.slug,
          ...(input.cluster ? { updatedByEditorialEngine: true } : {}),
        } as Prisma.InputJsonValue,
      },
    });
  }

  const latest = await prisma.contentVersion.findFirst({ where: { tenantId: ctx.tenantId, projectId: projectId! }, orderBy: { versionNumber: "desc" }, select: { versionNumber: true } });
  const version = await prisma.contentVersion.create({
    data: {
      tenantId: ctx.tenantId,
      projectId: projectId!,
      versionNumber: (latest?.versionNumber ?? 0) + 1,
      status: "draft",
      title: parsed.title?.slice(0, 200) ?? null,
      excerpt: seoPackage.excerpt,
      bodyHtml: parsed.bodyHtml,
      seoTitle: seoPackage.seoTitle,
      seoDescription: seoPackage.metaDescription,
      qaReport,
    },
  });
  result.projectId = projectId;
  result.versionId = version.id;

  const autoPublish = ctx.kind === "cluster" && gate.decision.decision === "auto_publish";
  await updateGeneration(ctx, { project: { connect: { id: projectId! } }, version: { connect: { id: version.id } }, status: autoPublish ? "auto_publish_scheduled" : "qa_review" });

  if (autoPublish) {
    // Only the cluster path auto-publishes, exactly as before, and only when the site's policy allows it.
    const policy = await getOrCreatePolicy(ctx.tenantId, ctx.siteId);
    if (policy.autoPublish) {
      const publication = await createPublication({ tenantId: ctx.tenantId, projectId: projectId!, versionId: version.id, channel: "website", siteId: ctx.siteId, scheduledFor: ctx.now });
      await enqueuePublication(publication.id);
      result.publicationId = publication.id;
      await writeAudit({ tenantId: ctx.tenantId, action: "editorial_engine.auto_published", entityType: "article_generation", entityId: ctx.generationId, actorType: "automation", metadata: { projectId, publicationId: publication.id, productionJobId: ctx.jobId } });
    }
  }

  if (ctx.request.kind === "plan_item") {
    // Plan items publish in their calendar slot, never earlier: assisted waits for approval, autopilot schedules itself.
    const policy = await getOrCreatePolicy(ctx.tenantId, ctx.siteId);
    const autopilot = policy.mode === "autopilot" && gate.decision.decision === "auto_publish";
    if (autopilot || policy.mode === "assisted") {
      const item = await prisma.editorialPlanItem.findFirst({ where: { id: ctx.request.planItemId, tenantId: ctx.tenantId }, select: { scheduledFor: true } });
      const scheduledFor = slotOrNow(item?.scheduledFor ?? null, ctx.now);
      if (autopilot) await approveVersion(ctx.tenantId, projectId!, version.id, "automation", null);
      // The scheduler claims the row once its slot is due.
      const publication = await createPublication({ tenantId: ctx.tenantId, projectId: projectId!, versionId: version.id, channel: "website", siteId: ctx.siteId, scheduledFor, ...(autopilot ? {} : { status: "ready" as const }) });
      if (autopilot) result.publicationId = publication.id;
    }
  }

  if (input.cluster) {
    // Engine drafts keep their editorial QA (no hero), but still get in-body images unless already published.
    if (!result.publicationId) {
      try {
        await productionStages.requestInlineImages(ctx.tenantId, version.id);
      } catch (error) {
        result.imageRequestError = (error instanceof Error ? error.message : String(error)).slice(0, 400);
      }
    }
    if (input.cluster.status === "open") {
      await prisma.storyCluster.update({ where: { id: input.cluster.id }, data: { status: "selected" } });
    }
    await writeAudit({
      tenantId: ctx.tenantId,
      action: "editorial_engine.generated",
      entityType: "article_generation",
      entityId: ctx.generationId,
      actorType: "automation",
      metadata: { clusterId: input.cluster.id, siteId: ctx.siteId, articleType: need(ctx.artifacts.brief, "brief").brief.articleType, decision: duplicate.decision, qaScore: qaArtifact.editorial.score, publicationDecision: gate.decision.decision, productionJobId: ctx.jobId },
    });
  } else {
    // Hero image as in the legacy plan-item flow; a queue outage keeps the draft and marks the job partial.
    try {
      await productionStages.requestImage(ctx.tenantId, version.id);
    } catch (error) {
      result.imageRequestError = (error instanceof Error ? error.message : String(error)).slice(0, 400);
    }
  }
  return result;
}

// ────────────────────────────────────────────────────────────── Registry

const defaultStages = {
  prepare,
  duplicates,
  evidence,
  brief,
  write,
  seo,
  qa,
  gates,
  materialize,
  requestImage: async (tenantId: string, versionId: string): Promise<void> => {
    await requestImageGenerationForVersion(tenantId, versionId);
    await requestInlineImagesForVersion(tenantId, versionId);
  },
  requestInlineImages: async (tenantId: string, versionId: string): Promise<void> => {
    await requestInlineImagesForVersion(tenantId, versionId);
  },
};

export type ProductionStageRegistry = typeof defaultStages;

/** Live registry the runner calls through (mutated only by setProductionStageOverrides). */
export const productionStages: ProductionStageRegistry = { ...defaultStages };

export function getDefaultProductionStages(): ProductionStageRegistry {
  return defaultStages;
}

/** Test seam: replace stages (spies, fake image queue). Pass null to restore defaults. */
export function setProductionStageOverrides(overrides: Partial<ProductionStageRegistry> | null): void {
  Object.assign(productionStages, defaultStages, overrides ?? {});
}

/** Distinct source URLs in the ledger: the most external links a guide can honestly carry. */
function externalSourceCount(facts: Array<{ sourceUrl: string | null }>): number {
  return new Set(facts.map((fact) => fact.sourceUrl).filter(Boolean)).size;
}
