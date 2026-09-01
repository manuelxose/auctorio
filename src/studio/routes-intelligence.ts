// Intelligence API (Phase 3): settings, story detail, merge/split, mutes,
// enrichment, observability report, site editorial profiles.

import { Prisma } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { getPrismaClient } from "../infrastructure/db/prisma";
import {
  badRequest,
  isOneOf,
  isUuid,
  notFound,
  parseBody,
  parseOptionalString,
  requireStudioContext,
  requireStudioPermission,
} from "./http-utils";
import { writeAudit } from "./audit";
import { titleSimilarity } from "./editorial";
import {
  getIntelligenceSettings,
  updateIntelligenceSettings,
} from "./intelligence/intelligence-settings";
import {
  runIntelligencePipelineForItem,
} from "./intelligence/pipeline";
import {
  mergeStoryClusters,
  splitStoryCluster,
} from "./intelligence/cluster-actions";
import {
  buildSiteEditorialProfile,
  getSiteEditorialProfile,
} from "./intelligence/site-editorial-profile";
import { buildIntelligenceReport } from "./intelligence/observability";
import { getTmdbProvider } from "./enrichment/tmdb";
import { getOmdbProvider } from "./enrichment/omdb";
import { getImdbProvider } from "./enrichment/imdb";
import { listStoryClusters } from "./editorial";

const prisma = getPrismaClient();

const MUTE_KINDS = ["topic", "source"] as const;

export function registerIntelligenceRoutes(fastify: FastifyInstance) {
  // ──────────────────────────────────────────────── Settings

  fastify.get("/v2/intelligence/settings", async (request, reply) => {
    const context = await requireStudioContext(request, reply);
    if (!context) {
      return;
    }
    return reply.send(await getIntelligenceSettings(context.tenantId));
  });

  fastify.patch("/v2/intelligence/settings", async (request, reply) => {
    const context = await requireStudioPermission(request, reply, "projects.manage");
    if (!context) {
      return;
    }
    const body = parseBody<{
      enabledDomains?: string[];
      providerPrecedence?: Record<string, string[]>;
      aiJudge?: Record<string, unknown>;
      levelPolicy?: Record<string, unknown>;
    }>(request);
    if (body.enabledDomains !== undefined && (!Array.isArray(body.enabledDomains) || body.enabledDomains.some((domain) => typeof domain !== "string"))) {
      return badRequest(reply, "enabledDomains must be an array of strings");
    }
    const settings = await updateIntelligenceSettings(context.tenantId, {
      enabledDomains: body.enabledDomains,
      providerPrecedence: body.providerPrecedence as never,
      aiJudge: body.aiJudge as never,
      levelPolicy: body.levelPolicy as never,
    });
    await writeAudit({
      tenantId: context.tenantId,
      action: "intelligence.settings_updated",
      entityType: "tenant",
      entityId: context.tenantId,
      actorType: "user",
    });
    return reply.send(settings);
  });

  fastify.get("/v2/intelligence/providers", async (request, reply) => {
    const context = await requireStudioContext(request, reply);
    if (!context) {
      return;
    }
    const tmdb = getTmdbProvider();
    const omdb = getOmdbProvider();
    const imdb = getImdbProvider();
    return reply.send({
      providers: [
        { key: "tmdb", configured: tmdb.isConfigured(), attribution: tmdb.attribution },
        { key: "omdb", configured: omdb.isConfigured(), attribution: omdb.attribution },
        { key: "imdb", configured: imdb.isConfigured(), attribution: imdb.attribution, note: "official API only; optional" },
      ],
    });
  });

  // ──────────────────────────────────────────────── Story detail

  fastify.get("/v2/intelligence/story-clusters/:id/story", async (request, reply) => {
    const context = await requireStudioContext(request, reply);
    if (!context) {
      return;
    }
    const clusterId = (request.params as { id: string }).id;
    if (!isUuid(clusterId)) {
      return badRequest(reply, "invalid cluster id");
    }
    const cluster = await prisma.storyCluster.findFirst({
      where: { id: clusterId, tenantId: context.tenantId },
      include: {
        items: {
          orderBy: { discoveredAt: "asc" },
          include: { source: { select: { id: true, name: true, domain: true, trustScore: true } } },
        },
      },
    });
    if (!cluster) {
      return notFound(reply, "cluster not found");
    }

    const [facts, entityLinks, enrichments, siteProfile] = await Promise.all([
      prisma.storyFact.findMany({
        where: { tenantId: context.tenantId, clusterId },
        orderBy: { extractedAt: "asc" },
        select: {
          id: true,
          itemId: true,
          factKey: true,
          statement: true,
          sourceUrl: true,
          publisher: true,
          evidenceRef: true,
          confidence: true,
          extractedAt: true,
          verificationStatus: true,
          conflictingFacts: true,
        },
      }),
      prisma.sourceItemEntity.findMany({
        where: { tenantId: context.tenantId, item: { clusterId } },
        orderBy: { confidence: "desc" },
        select: {
          confidence: true,
          entity: { select: { id: true, domain: true, type: true, name: true, externalIds: true, metadata: true } },
        },
      }),
      prisma.providerEnrichment.findMany({
        where: {
          tenantId: context.tenantId,
          entityId: {
            in: (
              await prisma.sourceItemEntity.findMany({
                where: { tenantId: context.tenantId, item: { clusterId } },
                select: { entityId: true },
              })
            ).map((link) => link.entityId),
          },
        },
        select: {
          id: true,
          entityId: true,
          providerKey: true,
          providerEntityId: true,
          resourceType: true,
          title: true,
          originalTitle: true,
          releaseDate: true,
          matchMethod: true,
          confidence: true,
          data: true,
        },
      }),
      cluster.items[0]?.sourceId
        ? prisma.contentSource.findUnique({ where: { id: cluster.items[0].sourceId }, select: { siteId: true } })
        : null,
    ]);

    const siteId = siteProfile?.siteId ?? null;
    const editorialProfile = siteId ? await getSiteEditorialProfile(context.tenantId, siteId) : null;

    const relatedContent = editorialProfile
      ? editorialProfile.existingTitles
          .map((title) => ({ title, similarity: titleSimilarity(cluster.headline ?? "", title) }))
          .filter((entry) => entry.similarity >= 0.35)
          .sort((a, b) => b.similarity - a.similarity)
          .slice(0, 5)
      : [];

    const entityMap = new Map<string, typeof entityLinks[number]["entity"]>();
    for (const link of entityLinks) {
      entityMap.set(link.entity.id, link.entity);
    }
    const entities = Array.from(entityMap.values()).map((entity) => {
      const entityEnrichments = enrichments.filter((enrichment) => enrichment.entityId === entity.id);
      return { ...entity, enrichments: entityEnrichments };
    });

    return reply.send({
      id: cluster.id,
      headline: cluster.headline,
      summary: cluster.summary,
      status: cluster.status,
      verificationState: cluster.verificationState,
      verificationDetail: cluster.verificationDetail,
      sourceDiversity: cluster.sourceDiversity,
      diversityDetail: cluster.diversityDetail,
      candidateScore: cluster.candidateScore,
      scoreComponents: cluster.scoreComponents,
      siteFitScore: cluster.siteFitScore,
      contentGapScore: cluster.contentGapScore,
      reasonSelected: cluster.reasonSelected,
      firstSeenAt: cluster.firstSeenAt,
      lastSeenAt: cluster.lastSeenAt,
      freshnessScore: cluster.freshnessScore,
      authorityScore: cluster.authorityScore,
      confidence: cluster.confidence,
      sources: cluster.items.map((item) => ({
        itemId: item.id,
        title: item.title,
        url: item.canonicalUrl ?? item.sourceUrl,
        publisher: item.source.name,
        domain: item.source.domain,
        trustScore: item.source.trustScore,
        discoveredAt: item.discoveredAt,
        publishedAt: item.publishedAt,
        modifiedAt: item.modifiedAt,
        score: item.score,
        status: item.processingStatus,
      })),
      facts,
      entities,
      relatedContent,
      siteId,
    });
  });

  // ──────────────────────────────────────────────── Cluster merge / split

  fastify.post("/v2/intelligence/story-clusters/:id/merge", async (request, reply) => {
    const context = await requireStudioPermission(request, reply, "projects.manage");
    if (!context) {
      return;
    }
    const clusterId = (request.params as { id: string }).id;
    const body = parseBody<{ targetClusterId?: string }>(request);
    if (!body.targetClusterId || !isUuid(body.targetClusterId)) {
      return badRequest(reply, "targetClusterId is required");
    }
    let result: Awaited<ReturnType<typeof mergeStoryClusters>>;
    try {
      result = await mergeStoryClusters(context.tenantId, clusterId, body.targetClusterId);
    } catch (error) {
      return badRequest(reply, error instanceof Error ? error.message : String(error));
    }
    if (!result) {
      return notFound(reply, "cluster not found");
    }
    await writeAudit({
      tenantId: context.tenantId,
      action: "story_cluster.merged",
      entityType: "story_cluster",
      entityId: result.targetClusterId,
      actorType: "user",
      metadata: { fromClusterId: clusterId, movedItems: result.movedItems },
    });
    return reply.send(result);
  });

  fastify.post("/v2/intelligence/story-clusters/:id/split", async (request, reply) => {
    const context = await requireStudioPermission(request, reply, "projects.manage");
    if (!context) {
      return;
    }
    const clusterId = (request.params as { id: string }).id;
    const body = parseBody<{ itemIds?: string[] }>(request);
    if (!Array.isArray(body.itemIds) || body.itemIds.length === 0 || body.itemIds.some((id) => !isUuid(id))) {
      return badRequest(reply, "itemIds is required and must be UUIDs");
    }
    const result = await splitStoryCluster(context.tenantId, clusterId, body.itemIds);
    if (!result) {
      return notFound(reply, "cluster not found or no matching items");
    }
    await writeAudit({
      tenantId: context.tenantId,
      action: "story_cluster.split",
      entityType: "story_cluster",
      entityId: clusterId,
      actorType: "user",
      metadata: { newClusterId: result.newClusterId, movedItems: result.movedItems },
    });
    return reply.send(result);
  });

  // ──────────────────────────────────────────────── Mute rules

  fastify.get("/v2/intelligence/mutes", async (request, reply) => {
    const context = await requireStudioContext(request, reply);
    if (!context) {
      return;
    }
    const mutes = await prisma.muteRule.findMany({
      where: { tenantId: context.tenantId, active: true },
      orderBy: { createdAt: "desc" },
    });
    return reply.send({ items: mutes, total: mutes.length });
  });

  fastify.post("/v2/intelligence/mutes", async (request, reply) => {
    const context = await requireStudioPermission(request, reply, "projects.manage");
    if (!context) {
      return;
    }
    const body = parseBody<{ kind?: string; value?: string }>(request);
    if (!body.kind || !isOneOf(body.kind, MUTE_KINDS)) {
      return badRequest(reply, `kind must be one of: ${MUTE_KINDS.join(", ")}`);
    }
    if (!body.value || body.value.trim().length < 2) {
      return badRequest(reply, "value is required");
    }
    const existing = await prisma.muteRule.findUnique({
      where: { tenantId_kind_value: { tenantId: context.tenantId, kind: body.kind, value: body.value.trim() } },
    });
    if (existing) {
      const reactivated = await prisma.muteRule.update({
        where: { id: existing.id },
        data: { active: true, mutedBy: context.userId ?? null },
      });
      return reply.code(200).send(reactivated);
    }
    const created = await prisma.muteRule.create({
      data: { tenantId: context.tenantId, kind: body.kind, value: body.value.trim(), mutedBy: context.userId ?? null },
    });
    await writeAudit({
      tenantId: context.tenantId,
      action: "mute.created",
      entityType: "mute_rule",
      entityId: created.id,
      actorType: "user",
      metadata: { kind: created.kind, value: created.value },
    });
    return reply.code(201).send(created);
  });

  fastify.delete("/v2/intelligence/mutes/:id", async (request, reply) => {
    const context = await requireStudioPermission(request, reply, "projects.manage");
    if (!context) {
      return;
    }
    const muteId = (request.params as { id: string }).id;
    if (!isUuid(muteId)) {
      return badRequest(reply, "invalid mute id");
    }
    const mute = await prisma.muteRule.findFirst({ where: { id: muteId, tenantId: context.tenantId } });
    if (!mute) {
      return notFound(reply, "mute rule not found");
    }
    await prisma.muteRule.update({ where: { id: mute.id }, data: { active: false } });
    return reply.send({ unmuted: true });
  });

  // ──────────────────────────────────────────────── Manual enrichment

  fastify.post("/v2/intelligence/source-items/:id/enrich", async (request, reply) => {
    const context = await requireStudioPermission(request, reply, "projects.manage");
    if (!context) {
      return;
    }
    const itemId = (request.params as { id: string }).id;
    if (!isUuid(itemId)) {
      return badRequest(reply, "invalid source item id");
    }
    const result = await runIntelligencePipelineForItem(context.tenantId, itemId);
    if (result.filtered && result.filteredReason === "item_not_found") {
      return notFound(reply, "source item not found");
    }
    return reply.send(result);
  });

  // ──────────────────────────────────────────────── Observability report

  fastify.get("/v2/intelligence/report", async (request, reply) => {
    const context = await requireStudioContext(request, reply);
    if (!context) {
      return;
    }
    const hours = request.query && typeof request.query === "object"
      ? Number((request.query as { hours?: string }).hours ?? 24)
      : 24;
    const report = await buildIntelligenceReport(context.tenantId, { windowHours: Number.isFinite(hours) ? hours : 24 });
    return reply.send(report);
  });

  // ──────────────────────────────────────────────── Site editorial profile

  fastify.get("/v2/sites/:id/editorial-profile", async (request, reply) => {
    const context = await requireStudioContext(request, reply);
    if (!context) {
      return;
    }
    const siteId = (request.params as { id: string }).id;
    if (!isUuid(siteId)) {
      return badRequest(reply, "invalid site id");
    }
    const profile = await getSiteEditorialProfile(context.tenantId, siteId);
    if (!profile) {
      return notFound(reply, "editorial profile not built yet");
    }
    return reply.send(profile);
  });

  fastify.post("/v2/sites/:id/editorial-profile/rebuild", async (request, reply) => {
    const context = await requireStudioPermission(request, reply, "projects.manage");
    if (!context) {
      return;
    }
    const siteId = (request.params as { id: string }).id;
    if (!isUuid(siteId)) {
      return badRequest(reply, "invalid site id");
    }
    const profile = await buildSiteEditorialProfile(context.tenantId, siteId);
    if (!profile) {
      return notFound(reply, "site not found");
    }
    return reply.send(profile);
  });

  // ──────────────────────────────────────────────── Legacy cluster listing
  // (kept for compatibility; inbox uses /v2/story-clusters + story detail)

  fastify.get("/v2/intelligence/clusters", async (request, reply) => {
    const context = await requireStudioContext(request, reply);
    if (!context) {
      return;
    }
    const query = request.query as { page?: string; pageSize?: string; status?: string };
    const page = Math.max(1, Number.parseInt(query.page ?? "1", 10) || 1);
    const pageSize = Math.min(50, Math.max(1, Number.parseInt(query.pageSize ?? "20", 10) || 20));
    const status = parseOptionalString(query.status);
    if (status && !isOneOf(status, ["open", "selected", "covered", "rejected", "archived", "developing", "updated", "superseded"])) {
      return badRequest(reply, "invalid status");
    }
    const listed = await listStoryClusters(context.tenantId, { page, pageSize, status: status ?? undefined });
    return reply.send(listed);
  });
}
