// Editorial engine orchestrator (Phase 4).
//
// Cluster generation now runs through the unified production pipeline
// (src/studio/production, docs/adr/unified-production-pipeline.md):
//
//   CLUSTER → duplicate decision → fact safety → classification + site value +
//   editorial brief → writer → SEO → QA → publication gates → provenance +
//   draft materialization
//
// Every artifact is still mirrored on the ArticleGeneration record so the
// Studio can show article, SEO, fact panel, sources, provenance, enrichment,
// QA warnings, internal links and social preview for human review.

import { Prisma } from "@prisma/client";
import { getPrismaClient } from "../../infrastructure/db/prisma";
import { startProduction } from "../production/pipeline";

const prisma = getPrismaClient();

export type GenerationOptions = {
  siteId?: string | null;
  language?: "es" | "en";
  articleTypeOverride?: string | null;
  searchIntentOverride?: string | null;
  persistDraft?: boolean;
  now?: Date;
  userId?: string | null;
};

// ────────────────────────────────────────────────────────────── Orchestration

/**
 * Run (synchronously) the production job for a cluster and return the
 * generation detail. Skips and gate rejections are outcomes, not errors; any
 * other stage failure is rethrown with its message, as before.
 */
export async function generateArticleFromCluster(
  tenantId: string,
  clusterId: string,
  options: GenerationOptions = {},
): Promise<Record<string, unknown>> {
  const { job } = await startProduction(
    tenantId,
    {
      kind: "cluster",
      clusterId,
      siteId: options.siteId ?? null,
      language: options.language === "en" ? "en" : "es",
      articleTypeOverride: options.articleTypeOverride ?? null,
      searchIntentOverride: options.searchIntentOverride ?? null,
      persistDraft: options.persistDraft,
    },
    { wait: true, now: options.now, userId: options.userId ?? null },
  );
  if (job.status === "failed" && job.errorCode !== "duplicate_skip" && job.errorCode !== "quality_rejected") {
    throw new Error(job.error ?? "production_failed");
  }
  if (!job.generationId) {
    throw new Error("generation_not_found");
  }
  return { ...(await getGenerationDetail(tenantId, job.generationId)), productionJob: job };
}

// ────────────────────────────────────────────────────────────── Read model

export async function listGenerations(
  tenantId: string,
  input: { page: number; pageSize: number; siteId?: string | null; clusterId?: string | null },
) {
  const skip = (input.page - 1) * input.pageSize;
  const where: Prisma.ArticleGenerationWhereInput = {
    tenantId,
    ...(input.siteId ? { siteId: input.siteId } : {}),
    ...(input.clusterId ? { clusterId: input.clusterId } : {}),
  };
  const [total, rows] = await prisma.$transaction([
    prisma.articleGeneration.count({ where }),
    prisma.articleGeneration.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: input.pageSize,
      select: {
        id: true,
        status: true,
        decision: true,
        decisionReason: true,
        articleType: true,
        searchIntent: true,
        clusterId: true,
        projectId: true,
        versionId: true,
        siteId: true,
        provider: true,
        model: true,
        createdAt: true,
        updatedAt: true,
        qaReport: true,
        publicationDecision: true,
        brief: true,
      },
    }),
  ]);
  return {
    items: rows.map((row) => ({
      ...row,
      qaScore: row.qaReport && typeof row.qaReport === "object" ? (row.qaReport as Record<string, unknown>).score ?? null : null,
      publicationOutcome:
        row.publicationDecision && typeof row.publicationDecision === "object"
          ? (row.publicationDecision as Record<string, unknown>).decision ?? null
          : null,
      title: row.brief && typeof row.brief === "object" ? (row.brief as Record<string, unknown>).primaryKeyword ?? null : null,
    })),
    page: input.page,
    pageSize: input.pageSize,
    total,
  };
}

export async function getGenerationDetail(tenantId: string, generationId: string): Promise<Record<string, unknown>> {
  const row = await prisma.articleGeneration.findFirst({
    where: { id: generationId, tenantId },
    include: {
      site: { select: { id: true, name: true, type: true, baseUrl: true } },
      project: { select: { id: true, title: true, status: true } },
      version: { select: { id: true, versionNumber: true, status: true, title: true, approvedAt: true } },
    },
  });
  if (!row) {
    throw new Error("generation_not_found");
  }

  const cluster = row.clusterId
    ? await prisma.storyCluster.findFirst({
        where: { id: row.clusterId, tenantId },
        select: {
          id: true,
          headline: true,
          summary: true,
          status: true,
          verificationState: true,
          verificationDetail: true,
          sourceDiversity: true,
          candidateScore: true,
          siteFitScore: true,
          firstSeenAt: true,
          lastSeenAt: true,
        },
      })
    : null;

  const clusterEntityIds = cluster
    ? (
        await prisma.sourceItemEntity.findMany({
          where: { tenantId, item: { clusterId: cluster.id } },
          select: { entityId: true },
        })
      ).map((link) => link.entityId)
    : [];

  const [facts, enrichments] = await Promise.all([
    cluster
      ? prisma.storyFact.findMany({
          where: { tenantId, clusterId: cluster.id },
          orderBy: { extractedAt: "asc" },
          select: {
            id: true,
            factKey: true,
            statement: true,
            publisher: true,
            sourceUrl: true,
            verificationStatus: true,
            confidence: true,
            conflictingFacts: true,
          },
        })
      : Promise.resolve([]),
    clusterEntityIds.length > 0
      ? prisma.providerEnrichment.findMany({
          where: { tenantId, entityId: { in: clusterEntityIds } },
          select: {
            id: true,
            entityId: true,
            providerKey: true,
            title: true,
            releaseDate: true,
            matchMethod: true,
            confidence: true,
            data: true,
          },
        })
      : Promise.resolve([]),
  ]);

  return {
    id: row.id,
    status: row.status,
    decision: row.decision,
    decisionReason: row.decisionReason,
    articleType: row.articleType,
    searchIntent: row.searchIntent,
    site: row.site,
    cluster,
    project: row.project,
    version: row.version,
    brief: row.brief,
    factPanel: {
      ledger: facts,
      licenses: row.factLicenses,
    },
    sources: facts
      .filter((fact) => fact.sourceUrl)
      .map((fact) => ({ url: fact.sourceUrl, publisher: fact.publisher, factKey: fact.factKey }))
      .filter(
        (entry, index, array) =>
          array.findIndex((other) => other.url === entry.url && other.publisher === entry.publisher) === index,
      ),
    provenance: row.provenance,
    enrichment: enrichments,
    article: row.parsedArticle,
    seo: row.seoPackage,
    socialPreview: row.seoPackage
      ? {
          title: (row.seoPackage as Record<string, unknown>).socialTitle ?? null,
          description: (row.seoPackage as Record<string, unknown>).openGraph
            ? ((row.seoPackage as Record<string, unknown>).openGraph as Record<string, unknown>).description ?? null
            : null,
        }
      : null,
    qaReport: row.qaReport,
    publicationDecision: row.publicationDecision,
    updateDelta: row.updateDelta,
    provider: row.provider,
    model: row.model,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    error: row.error,
  };
}
