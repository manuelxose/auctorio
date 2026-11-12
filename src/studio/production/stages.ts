// Stage registry of the unified production pipeline. Every request kind runs
// these same functions in PRODUCTION_STAGES order; only `prepare` and `brief`
// dispatch on kind (cluster classification/site-value stay specialized).
// Tests swap entries with setProductionStageOverrides (ENG-01) and inject the
// writer with setArticleWriterFactory — no real AI in CI.

import { Prisma } from "@prisma/client";
import { getPrismaClient } from "../../infrastructure/db/prisma";
import { sanitizeEditorialHtml } from "../html-sanitizer";
import { getOrCreatePolicy } from "../automation";
import { createPublication, enqueuePublication } from "../publication";
import { writeAudit } from "../audit";
import { runVersionQaV2 } from "../qa";
import { requestImageGenerationForVersion } from "../orchestration";
import { buildFactSafetyReport, hasCopyrightWarningCues, type FactSafetyReport } from "../editorial-engine/fact-safety";
import { decideCreateUpdateOrSkip, type DuplicateCheckResult } from "../editorial-engine/duplicate-check";
import { buildWriterPrompt, parseWriterOutput } from "../editorial-engine/writer-prompt";
import { getArticleWriter } from "../editorial-engine/writer-provider";
import { buildSeoPackage } from "../editorial-engine/seo-package";
import { buildProvenance, summarizeProvenance } from "../editorial-engine/provenance";
import { runEditorialQa } from "../editorial-engine/editorial-qa";
import { evaluatePublicationGates } from "../editorial-engine/publication-gates";
import { buildClusterBrief, enrichmentKnowledgeOf, prepareClusterInput } from "../editorial-engine/cluster-production";
import type { SeoPackage } from "../editorial-engine/types";
import { buildPlanBrief, prepareManualInput, preparePlanItemInput } from "./plan-item";
import {
  ProductionStop,
  type BriefArtifact,
  type GatesArtifact,
  type MaterializeArtifact,
  type PreparedInput,
  type ProductionRequest,
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
    editorialGuidance: briefArtifact.guidance,
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
  const maxTokens = Math.min(8000, Math.max(1400, Math.round(briefArtifact.brief.targetLengthRange.max * 2.2)));
  const result = await getArticleWriter().generate({
    prompt: writerPrompt.userPrompt,
    systemPrompt: writerPrompt.systemPrompt,
    maxTokens,
    language: ctx.input.language,
  });
  const parsed = parseWriterOutput(result.output);
  // Editorial HTML is allowlist-sanitized before anything is stored.
  parsed.bodyHtml = sanitizeEditorialHtml(parsed.bodyHtml);
  await updateGeneration(ctx, { provider: result.provider, model: result.model, articleOutput: result.output.slice(0, 300_000) });
  return { parsed, provider: result.provider, model: result.model, writerPrompt: writerPrompt.userPrompt };
}

async function seo(ctx: StageContext): Promise<SeoPackage> {
  return buildSeoPackage({
    brief: need(ctx.artifacts.brief, "brief").brief,
    article: need(ctx.artifacts.write, "write").parsed,
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
      },
      siteType: input.site.type,
      recommendedWordCountMin: briefArtifact.brief.targetLengthRange.min,
      recommendedWordCountMax: briefArtifact.brief.targetLengthRange.max,
      evidenceCount: input.ledgerFacts.length,
      cannibalizationRisk: overlap ? "high" : typeof record.cannibalizationRisk === "string" ? record.cannibalizationRisk : null,
      internalLinkInventorySize: input.internalLinks.length,
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
    configJson: asRecord(policy.qaGates),
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
        sourceItemId: firstItem?.id ?? null,
        origin: ctx.kind === "cluster" ? "editorial_engine" : "manual",
        metadata: {
          generationId: ctx.generationId,
          productionJobId: ctx.jobId,
          articleType: duplicate.decision === "update_existing" ? "article_update" : "create_new",
          provenance: gate.provenance.slice(0, 40),
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

  if (input.cluster) {
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
