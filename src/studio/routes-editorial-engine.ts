// Editorial engine API (Phase 4): generate evidence-grounded original
// articles from Story Intelligence clusters, review QA/provenance, and
// manage per-site value configuration.

import type { FastifyInstance } from "fastify";
import { getPrismaClient } from "../infrastructure/db/prisma";
import {
  badRequest,
  isUuid,
  notFound,
  parseBody,
  requireStudioContext,
  requireStudioPermission,
} from "./http-utils";
import { writeAudit } from "./audit";
import {
  generateArticleFromCluster,
  getGenerationDetail,
  listGenerations,
} from "./editorial-engine/orchestrator";
import type { SiteValueConfig } from "./editorial-engine/site-value";

const prisma = getPrismaClient();

export function registerEditorialEngineRoutes(fastify: FastifyInstance) {
  // ──────────────────────────────────────────────── Generate from cluster

  fastify.post("/v2/editorial-engine/clusters/:id/generate", async (request, reply) => {
    const context = await requireStudioPermission(request, reply, "projects.manage");
    if (!context) {
      return;
    }
    const clusterId = (request.params as { id: string }).id;
    if (!isUuid(clusterId)) {
      return badRequest(reply, "invalid cluster id");
    }
    const body = parseBody<{
      siteId?: string;
      language?: "es" | "en";
      articleTypeOverride?: string;
      searchIntentOverride?: string;
      persistDraft?: boolean;
    }>(request);
    if (body.siteId && !isUuid(body.siteId)) {
      return badRequest(reply, "invalid site id");
    }
    if (body.language && body.language !== "es" && body.language !== "en") {
      return badRequest(reply, "language must be es or en");
    }

    try {
      const detail = await generateArticleFromCluster(context.tenantId, clusterId, {
        siteId: body.siteId ?? null,
        language: body.language ?? "es",
        articleTypeOverride: body.articleTypeOverride ?? null,
        searchIntentOverride: body.searchIntentOverride ?? null,
        persistDraft: body.persistDraft ?? true,
      });
      return reply.send(detail);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message === "cluster_not_found" || message === "generation_not_found") {
        return notFound(reply, message);
      }
      return badRequest(reply, message);
    }
  });

  // ──────────────────────────────────────────────── Generation listing

  fastify.get("/v2/editorial-engine/generations", async (request, reply) => {
    const context = await requireStudioContext(request, reply);
    if (!context) {
      return;
    }
    const query = request.query as {
      page?: string;
      pageSize?: string;
      siteId?: string;
      clusterId?: string;
    };
    const page = Math.max(1, Number.parseInt(query.page ?? "1", 10) || 1);
    const pageSize = Math.min(100, Math.max(1, Number.parseInt(query.pageSize ?? "20", 10) || 20));
    return reply.send(
      await listGenerations(context.tenantId, {
        page,
        pageSize,
        siteId: query.siteId || null,
        clusterId: query.clusterId || null,
      }),
    );
  });

  // ──────────────────────────────────────────────── Generation detail

  fastify.get("/v2/editorial-engine/generations/:id", async (request, reply) => {
    const context = await requireStudioContext(request, reply);
    if (!context) {
      return;
    }
    const generationId = (request.params as { id: string }).id;
    if (!isUuid(generationId)) {
      return badRequest(reply, "invalid generation id");
    }
    try {
      return reply.send(await getGenerationDetail(context.tenantId, generationId));
    } catch {
      return notFound(reply, "generation_not_found");
    }
  });

  // ──────────────────────────────────────────────── Review actions

  fastify.post("/v2/editorial-engine/generations/:id/approve", async (request, reply) => {
    const context = await requireStudioPermission(request, reply, "projects.manage");
    if (!context) {
      return;
    }
    const generationId = (request.params as { id: string }).id;
    const generation = await prisma.articleGeneration.findFirst({
      where: { id: generationId, tenantId: context.tenantId },
    });
    if (!generation) {
      return notFound(reply, "generation_not_found");
    }
    await prisma.articleGeneration.update({
      where: { id: generation.id },
      data: { status: "approved" },
    });
    if (generation.versionId) {
      await prisma.contentVersion.updateMany({
        where: { id: generation.versionId, tenantId: context.tenantId },
        data: { status: "qa_passed" },
      });
    }
    await writeAudit({
      tenantId: context.tenantId,
      action: "editorial_engine.approved",
      entityType: "article_generation",
      entityId: generation.id,
      actorType: "user",
    });
    return reply.send({ id: generation.id, status: "approved" });
  });

  fastify.post("/v2/editorial-engine/generations/:id/reject", async (request, reply) => {
    const context = await requireStudioPermission(request, reply, "projects.manage");
    if (!context) {
      return;
    }
    const generationId = (request.params as { id: string }).id;
    const body = parseBody<{ reason?: string }>(request);
    const generation = await prisma.articleGeneration.findFirst({
      where: { id: generationId, tenantId: context.tenantId },
    });
    if (!generation) {
      return notFound(reply, "generation_not_found");
    }
    await prisma.articleGeneration.update({
      where: { id: generation.id },
      data: { status: "rejected", error: body.reason?.slice(0, 500) ?? null },
    });
    await writeAudit({
      tenantId: context.tenantId,
      action: "editorial_engine.rejected",
      entityType: "article_generation",
      entityId: generation.id,
      actorType: "user",
      metadata: { reason: body.reason ?? null },
    });
    return reply.send({ id: generation.id, status: "rejected" });
  });

  // ──────────────────────────────────────────────── Site value configuration

  fastify.get("/v2/editorial-engine/sites/:siteId/value-config", async (request, reply) => {
    const context = await requireStudioContext(request, reply);
    if (!context) {
      return;
    }
    const siteId = (request.params as { siteId: string }).siteId;
    const site = await prisma.site.findFirst({ where: { id: siteId, tenantId: context.tenantId } });
    if (!site) {
      return notFound(reply, "site_not_found");
    }
    return reply.send({ siteId: site.id, config: site.siteValueConfig ?? null });
  });

  fastify.put("/v2/editorial-engine/sites/:siteId/value-config", async (request, reply) => {
    const context = await requireStudioPermission(request, reply, "projects.manage");
    if (!context) {
      return;
    }
    const siteId = (request.params as { siteId: string }).siteId;
    const body = parseBody<{ config: SiteValueConfig | null }>(request);
    if (body.config !== null && (typeof body.config !== "object" || Array.isArray(body.config))) {
      return badRequest(reply, "config must be an object or null");
    }
    const site = await prisma.site.findFirst({ where: { id: siteId, tenantId: context.tenantId } });
    if (!site) {
      return notFound(reply, "site_not_found");
    }
    const updated = await prisma.site.update({
      where: { id: site.id },
      data: { siteValueConfig: body.config as never },
    });
    await writeAudit({
      tenantId: context.tenantId,
      action: "editorial_engine.site_value_config_updated",
      entityType: "site",
      entityId: site.id,
      actorType: "user",
    });
    return reply.send({ siteId: site.id, config: updated.siteValueConfig });
  });
}
