import type { FastifyInstance } from "fastify";
import {
  badRequest,
  isUuid,
  notFound,
  parseBody,
  parseOptionalString,
  parsePage,
  parsePageSize,
  requireStudioContext,
  requireStudioPermission,
} from "./http-utils";
import { getPrismaClient } from "../infrastructure/db/prisma";
import { structuredEvent } from "../shared/utils/logger";
import {
  getDailyUsage,
  getOrCreateDiscoveryConfig,
  runWebDiscoveryForTenant,
  updateDiscoveryConfig,
} from "./web-discovery";
import {
  acceptSourceRecommendation,
  blockDomain,
  dismissSourceRecommendation,
  listBlockedDomains,
  listSourceRecommendations,
  unblockDomain,
} from "./source-quality";
import { webIntelligenceAvailability } from "./web-intelligence";

const prisma = getPrismaClient();

export function registerDiscoveryRoutes(fastify: FastifyInstance) {
  // ── Settings

  fastify.get("/v2/discovery/settings", async (request, reply) => {
    const context = await requireStudioContext(request, reply);
    if (!context) {
      return;
    }
    const config = await getOrCreateDiscoveryConfig(context.tenantId, null);
    const provider = webIntelligenceAvailability();
    const usage = await getDailyUsage(context.tenantId, provider.provider);
    return reply.send({
      config: {
        ...config,
        maxDiscoveryCostPerDay: Number(config.maxDiscoveryCostPerDay ?? 0),
      },
      provider,
      usageToday: usage,
    });
  });

  fastify.patch("/v2/discovery/settings", async (request, reply) => {
    const context = await requireStudioPermission(request, reply, "integrations.manage");
    if (!context) {
      return;
    }
    const body = parseBody<Record<string, unknown>>(request);
    try {
      const config = await updateDiscoveryConfig(context.tenantId, null, body, context.userId);
      return reply.send({ ...config, maxDiscoveryCostPerDay: Number(config.maxDiscoveryCostPerDay ?? 0) });
    } catch (error) {
      return badRequest(reply, error instanceof Error ? error.message : String(error));
    }
  });

  // ── Manual run

  fastify.post("/v2/discovery/run", async (request, reply) => {
    const context = await requireStudioPermission(request, reply, "integrations.manage");
    if (!context) {
      return;
    }
    const availability = webIntelligenceAvailability();
    if (!availability.configured) {
      // Fail fast and tell the operator what to do instead of accepting a run
      // that can only log a background failure the UI never surfaces.
      return reply.code(409).send({
        error: {
          code: "web_intelligence_provider_not_configured",
          message: availability.message,
          requestId: request.id,
        },
      });
    }
    // Kick off asynchronously; the endpoint returns immediately and the run is
    // visible through queries/usage/audit. The worker also runs this on its
    // own schedule.
    void runWebDiscoveryForTenant(context.tenantId)
      .then((result) => structuredEvent("web.discovery.manual_run.completed", result))
      .catch((error) => structuredEvent("web.discovery.manual_run.failed", { error: error instanceof Error ? error.message : String(error) }, "error"));
    return reply.code(202).send({ status: "started" });
  });

  // ── Queries

  fastify.get("/v2/discovery/queries", async (request, reply) => {
    const context = await requireStudioContext(request, reply);
    if (!context) {
      return;
    }
    const page = parsePage((request.query as { page?: unknown }).page);
    const pageSize = parsePageSize((request.query as { pageSize?: unknown }).pageSize, 20);
    const skip = (page - 1) * pageSize;
    const [total, items] = await prisma.$transaction([
      prisma.webDiscoveryQuery.count({ where: { tenantId: context.tenantId } }),
      prisma.webDiscoveryQuery.findMany({
        where: { tenantId: context.tenantId },
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
      }),
    ]);
    return reply.send({ items, page, pageSize, total });
  });

  // ── Recommendations

  fastify.get("/v2/discovery/recommendations", async (request, reply) => {
    const context = await requireStudioContext(request, reply);
    if (!context) {
      return;
    }
    const query = request.query as { status?: string; page?: unknown; pageSize?: unknown };
    if (query.status && !["open", "accepted", "dismissed"].includes(query.status)) {
      return badRequest(reply, "status must be one of: open, accepted, dismissed");
    }
    const page = parsePage(query.page);
    const pageSize = parsePageSize(query.pageSize, 50);
    const result = await listSourceRecommendations(context.tenantId, { status: query.status, page, pageSize });
    return reply.send(result);
  });

  fastify.post("/v2/discovery/recommendations/:id/accept", async (request, reply) => {
    const context = await requireStudioPermission(request, reply, "integrations.manage");
    if (!context) {
      return;
    }
    const id = (request.params as { id: string }).id;
    if (!isUuid(id)) {
      return badRequest(reply, "invalid recommendation id");
    }
    const accepted = await acceptSourceRecommendation(context.tenantId, id);
    if (!accepted) {
      return notFound(reply, "recommendation not found");
    }
    return reply.send({ ok: true, sourceId: accepted.sourceId });
  });

  fastify.post("/v2/discovery/recommendations/:id/dismiss", async (request, reply) => {
    const context = await requireStudioPermission(request, reply, "integrations.manage");
    if (!context) {
      return;
    }
    const id = (request.params as { id: string }).id;
    if (!isUuid(id)) {
      return badRequest(reply, "invalid recommendation id");
    }
    const dismissed = await dismissSourceRecommendation(context.tenantId, id);
    if (!dismissed) {
      return notFound(reply, "recommendation not found");
    }
    return reply.send({ ok: true });
  });

  // ── Recently discovered domains + blocked domains

  fastify.get("/v2/discovery/domains", async (request, reply) => {
    const context = await requireStudioContext(request, reply);
    if (!context) {
      return;
    }
    const query = request.query as { page?: unknown; pageSize?: unknown; blocked?: string };
    const page = parsePage(query.page);
    const pageSize = parsePageSize(query.pageSize, 50);
    const skip = (page - 1) * pageSize;
    const blockedOnly = query.blocked === "true";
    const [total, items] = await prisma.$transaction([
      prisma.discoveredDomain.count({ where: { tenantId: context.tenantId, ...(blockedOnly ? { blocked: true } : {}) } }),
      prisma.discoveredDomain.findMany({
        where: { tenantId: context.tenantId, ...(blockedOnly ? { blocked: true } : {}) },
        orderBy: [{ lastSeenAt: "desc" }, { discoveryCount: "desc" }],
        skip,
        take: pageSize,
      }),
    ]);
    return reply.send({ items, page, pageSize, total });
  });

  fastify.post("/v2/discovery/domains/block", async (request, reply) => {
    const context = await requireStudioPermission(request, reply, "integrations.manage");
    if (!context) {
      return;
    }
    const body = parseBody<{ domain?: string; reason?: string }>(request);
    const domain = parseOptionalString(body.domain);
    if (!domain) {
      return badRequest(reply, "domain is required");
    }
    await blockDomain(context.tenantId, domain, parseOptionalString(body.reason) ?? null);
    return reply.send({ ok: true });
  });

  fastify.post("/v2/discovery/domains/unblock", async (request, reply) => {
    const context = await requireStudioPermission(request, reply, "integrations.manage");
    if (!context) {
      return;
    }
    const body = parseBody<{ domain?: string }>(request);
    const domain = parseOptionalString(body.domain);
    if (!domain) {
      return badRequest(reply, "domain is required");
    }
    await unblockDomain(context.tenantId, domain);
    return reply.send({ ok: true });
  });

  fastify.get("/v2/discovery/blocked-domains", async (request, reply) => {
    const context = await requireStudioContext(request, reply);
    if (!context) {
      return;
    }
    const items = await listBlockedDomains(context.tenantId);
    return reply.send({ items });
  });

  // ── Usage

  fastify.get("/v2/discovery/usage", async (request, reply) => {
    const context = await requireStudioContext(request, reply);
    if (!context) {
      return;
    }
    const provider = webIntelligenceAvailability();
    const config = await getOrCreateDiscoveryConfig(context.tenantId, null);
    const usage = await getDailyUsage(context.tenantId, provider.provider);
    return reply.send({
      provider,
      usageToday: usage,
      limits: {
        maxSearchesPerDay: config.maxSearchesPerDay,
        maxScrapesPerDay: config.maxScrapesPerDay,
        maxDiscoveryCostPerDay: Number(config.maxDiscoveryCostPerDay ?? 0),
      },
    });
  });
}
