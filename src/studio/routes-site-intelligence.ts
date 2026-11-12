import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { getPrismaClient } from "../infrastructure/db/prisma";
import {
  badRequest,
  conflict,
  errorBody,
  isUuid,
  notFound,
  parseBody,
  parsePage,
  parsePageSize,
  parseOptionalString,
  requireStudioContext,
  requireStudioPermission,
} from "./http-utils";
import {
  getSiteIntelligenceOverview,
  isSiteIndexing,
  listIndexedPages,
  refreshSiteIntelligence,
} from "./site-intelligence";
import { suggestInternalLinks } from "./internal-linking";
import { completeOperation, createOperation, failOperation, getOperation, startOperation } from "./operations";
import { publishEvent } from "./events";
import { getSiteOnboarding, retrySiteOnboarding, startSiteOnboarding } from "./onboarding/orchestrator";
import {
  getStrategyLayers,
  listStrategyVersions,
  regenerateStrategySuggestion,
  restoreStrategyVersion,
  saveApprovedStrategy,
  upsertApprovedPillar,
} from "./site-intelligence/strategy";
import { getClusterCoverage } from "./site-intelligence/cluster-coverage";

const prisma = getPrismaClient();

const ERROR_STATUS: Record<string, number> = {
  site_not_found: 404,
  onboarding_not_found: 404,
  strategy_version_not_found: 404,
  cluster_not_found: 404,
  onboarding_running: 409,
  onboarding_nothing_to_retry: 409,
  pillar_name_required: 400,
};

function sendDomainError(reply: FastifyReply, error: unknown) {
  const code = error instanceof Error ? error.message : String(error);
  const status = ERROR_STATUS[code] ?? 500;
  if (status === 500) throw error;
  return reply.code(status).send(errorBody(reply, code, code.replace(/_/g, " ")));
}


/**
 * Starts a durable, observable site index. Safe to call repeatedly: an in-flight
 * run for the same site is reused by refreshSiteIntelligence, so nothing is duplicated.
 * Read-only discovery; it never grants or uses publishing rights.
 */
export async function startSiteIndexOperation(
  tenantId: string,
  siteId: string,
  userId: string | null,
  options: { crawl?: boolean; budget?: number; changedOnly?: boolean; force?: boolean; trigger?: string } = {},
) {
  const started = !isSiteIndexing(siteId);
  const operation = await createOperation({
    tenantId,
    siteId,
    type: "site_index",
    initiatorUserId: userId,
    entityType: "site",
    entityId: siteId,
    metadata: { crawl: options.crawl ?? true, budget: options.budget ?? null, trigger: options.trigger ?? "manual" },
  });
  await startOperation(operation.id, "discovering");
  await publishEvent({ tenantId, siteId, type: "operation.created", payload: { operationId: operation.id, type: "site_index" } });
  const promise = refreshSiteIntelligence(tenantId, siteId, options)
    .then(async (result) => {
      await completeOperation(operation.id);
      await publishEvent({ tenantId, siteId, type: "operation.completed", payload: { operationId: operation.id } });
      return result;
    })
    .catch(async (error) => {
      await failOperation(operation.id, {
        errorCode: "site_index_failed",
        errorSummary: error instanceof Error ? error.message : String(error),
        retryable: true,
      });
      throw error;
    });
  return { started, operationId: operation.id, promise };
}
async function loadSiteForParams(request: FastifyRequest, reply: FastifyReply, tenantId: string) {
  const siteId = (request.params as { siteId: string }).siteId;
  if (!isUuid(siteId)) {
    badRequest(reply, "invalid site id");
    return null;
  }
  return siteId;
}

export function registerSiteIntelligenceRoutes(fastify: FastifyInstance) {
  // Overview: profile, sitemaps, page states, clusters, indexing state.
  fastify.get("/v2/site-intelligence/:siteId", async (request, reply) => {
    const context = await requireStudioContext(request, reply);
    if (!context) return;
    const siteId = await loadSiteForParams(request, reply, context.tenantId);
    if (!siteId) return;
    try {
      return reply.send(await getSiteIntelligenceOverview(context.tenantId, siteId));
    } catch (error) {
      if (error instanceof Error && error.message === "site_not_found") {
        return notFound(reply, "site not found");
      }
      return badRequest(reply, error instanceof Error ? error.message : String(error));
    }
  });

  // Trigger (re)index. Runs in the background; pass wait=true to await it.
  fastify.post("/v2/site-intelligence/:siteId/index", async (request, reply) => {
    const context = await requireStudioPermission(request, reply, "integrations.manage");
    if (!context) return;
    const siteId = await loadSiteForParams(request, reply, context.tenantId);
    if (!siteId) return;
    const body = parseBody<{ crawl?: boolean; budget?: number; changedOnly?: boolean; force?: boolean; wait?: boolean }>(request);
    const options = {
      crawl: body.crawl !== false,
      budget: typeof body.budget === "number" && body.budget > 0 ? Math.min(body.budget, 500) : undefined,
      changedOnly: body.changedOnly === true,
      force: body.force === true,
    };

    const { started, operationId, promise } = await startSiteIndexOperation(context.tenantId, siteId, context.userId, options);
    const operation = { id: operationId };
    const running = !started;
    // Callers that do not wait must not leave a rejected promise unhandled; the operation records the failure.
    promise.catch(() => undefined);

    if (body.wait === true) {
      try {
        const result = await promise;
        return reply.send({ started: !running, operationId: operation.id, result });
      } catch (error) {
        return badRequest(reply, error instanceof Error ? error.message : String(error));
      }
    }
    return reply.code(202).send({ started: !running, indexing: true, operationId: operation.id });
  });

  // Searchable indexed page inventory.
  fastify.get("/v2/site-intelligence/:siteId/pages", async (request, reply) => {
    const context = await requireStudioContext(request, reply);
    if (!context) return;
    const siteId = await loadSiteForParams(request, reply, context.tenantId);
    if (!siteId) return;
    const query = request.query as { q?: string; crawlState?: string; contentType?: string; page?: string; pageSize?: string };
    return reply.send(
      await listIndexedPages(context.tenantId, siteId, {
        query: parseOptionalString(query.q) ?? undefined,
        crawlState: parseOptionalString(query.crawlState) ?? undefined,
        contentType: parseOptionalString(query.contentType) ?? undefined,
        page: parsePage(query.page, 1),
        pageSize: parsePageSize(query.pageSize, 25),
      }),
    );
  });

  // Internal link suggestions from the real indexed inventory.
  fastify.get("/v2/site-intelligence/:siteId/internal-links", async (request, reply) => {
    const context = await requireStudioContext(request, reply);
    if (!context) return;
    const siteId = await loadSiteForParams(request, reply, context.tenantId);
    if (!siteId) return;
    const query = request.query as { keyword?: string; topic?: string; q?: string; excludeUrl?: string; limit?: string };
    const suggestions = await suggestInternalLinks(context.tenantId, siteId, {
      keyword: parseOptionalString(query.keyword),
      topic: parseOptionalString(query.topic),
      query: parseOptionalString(query.q),
      excludeUrl: parseOptionalString(query.excludeUrl),
      limit: query.limit ? Number.parseInt(query.limit, 10) : undefined,
    });
    return reply.send({ items: suggestions });
  });

  // ── Website editorial onboarding

  fastify.get("/v2/sites/:siteId/onboarding", async (request, reply) => {
    const context = await requireStudioContext(request, reply);
    if (!context) return;
    const siteId = await loadSiteForParams(request, reply, context.tenantId);
    if (!siteId) return;
    try {
      const site = await findSite(context.tenantId, siteId);
      if (!site) return notFound(reply, "site not found");
      const run = await getSiteOnboarding(context.tenantId, siteId);
      const operation = run?.operationId ? await getOperation(context.tenantId, run.operationId) : null;
      return reply.send({ run, operation });
    } catch (error) {
      return sendDomainError(reply, error);
    }
  });

  fastify.post("/v2/sites/:siteId/onboarding", async (request, reply) => {
    const context = await requireStudioPermission(request, reply, "integrations.manage");
    if (!context) return;
    const siteId = await loadSiteForParams(request, reply, context.tenantId);
    if (!siteId) return;
    try {
      const start = await startSiteOnboarding(context.tenantId, siteId, context.userId, { trigger: "manual" });
      start.promise.catch(() => undefined);
      return reply.code(start.started ? 202 : 200).send({ started: start.started, operationId: start.operationId, run: start.run });
    } catch (error) {
      return sendDomainError(reply, error);
    }
  });

  fastify.post("/v2/sites/:siteId/onboarding/retry", async (request, reply) => {
    const context = await requireStudioPermission(request, reply, "integrations.manage");
    if (!context) return;
    const siteId = await loadSiteForParams(request, reply, context.tenantId);
    if (!siteId) return;
    try {
      const start = await retrySiteOnboarding(context.tenantId, siteId, context.userId);
      start.promise.catch(() => undefined);
      return reply.code(202).send({ started: true, operationId: start.operationId, fromStep: start.fromStep, run: start.run });
    } catch (error) {
      return sendDomainError(reply, error);
    }
  });

  // ── Editorial strategy (detected / suggested / approved)

  fastify.get("/v2/sites/:siteId/strategy", async (request, reply) => {
    const context = await requireStudioContext(request, reply);
    if (!context) return;
    const siteId = await loadSiteForParams(request, reply, context.tenantId);
    if (!siteId) return;
    try {
      return reply.send(await getStrategyLayers(context.tenantId, siteId));
    } catch (error) {
      return sendDomainError(reply, error);
    }
  });

  fastify.put("/v2/sites/:siteId/strategy", async (request, reply) => {
    const context = await requireStudioPermission(request, reply, "projects.manage");
    if (!context) return;
    const siteId = await loadSiteForParams(request, reply, context.tenantId);
    if (!siteId) return;
    const body = parseBody<{ config?: unknown; note?: string }>(request);
    if (!body.config || typeof body.config !== "object") return badRequest(reply, "config is required");
    try {
      const saved = await saveApprovedStrategy(context.tenantId, siteId, body.config, { userId: context.userId, note: parseOptionalString(body.note) });
      return reply.send({ version: saved.version, config: saved.config, layers: await getStrategyLayers(context.tenantId, siteId) });
    } catch (error) {
      return sendDomainError(reply, error);
    }
  });

  fastify.post("/v2/sites/:siteId/strategy/suggest", async (request, reply) => {
    const context = await requireStudioPermission(request, reply, "projects.manage");
    if (!context) return;
    const siteId = await loadSiteForParams(request, reply, context.tenantId);
    if (!siteId) return;
    try {
      const result = await regenerateStrategySuggestion(context.tenantId, siteId);
      if (!result.generated) return conflict(reply, result.reason ?? "no site profile yet");
      return reply.send({ ...result, layers: await getStrategyLayers(context.tenantId, siteId) });
    } catch (error) {
      return sendDomainError(reply, error);
    }
  });

  fastify.get("/v2/sites/:siteId/strategy/versions", async (request, reply) => {
    const context = await requireStudioContext(request, reply);
    if (!context) return;
    const siteId = await loadSiteForParams(request, reply, context.tenantId);
    if (!siteId) return;
    return reply.send({ items: await listStrategyVersions(context.tenantId, siteId) });
  });

  fastify.post("/v2/sites/:siteId/strategy/versions/:version/restore", async (request, reply) => {
    const context = await requireStudioPermission(request, reply, "projects.manage");
    if (!context) return;
    const siteId = await loadSiteForParams(request, reply, context.tenantId);
    if (!siteId) return;
    const version = Number.parseInt((request.params as { version: string }).version, 10);
    if (!Number.isInteger(version) || version < 1) return badRequest(reply, "invalid version");
    try {
      const saved = await restoreStrategyVersion(context.tenantId, siteId, version, context.userId);
      return reply.send({ version: saved.version, layers: await getStrategyLayers(context.tenantId, siteId) });
    } catch (error) {
      return sendDomainError(reply, error);
    }
  });

  // Topic cluster actions: edit / include / exclude write the approved layer (new version).
  fastify.patch("/v2/sites/:siteId/strategy/pillars", async (request, reply) => {
    const context = await requireStudioPermission(request, reply, "projects.manage");
    if (!context) return;
    const siteId = await loadSiteForParams(request, reply, context.tenantId);
    if (!siteId) return;
    const body = parseBody<{ clusterSlug?: string; name?: string; description?: string; keywords?: string[]; subtopics?: string[]; included?: boolean; weight?: number }>(request);
    if (!parseOptionalString(body.clusterSlug) && !parseOptionalString(body.name)) return badRequest(reply, "clusterSlug or name is required");
    try {
      const saved = await upsertApprovedPillar(
        context.tenantId,
        siteId,
        {
          clusterSlug: parseOptionalString(body.clusterSlug),
          name: parseOptionalString(body.name),
          description: body.description === undefined ? undefined : parseOptionalString(body.description),
          keywords: Array.isArray(body.keywords) ? body.keywords : undefined,
          subtopics: Array.isArray(body.subtopics) ? body.subtopics : undefined,
          included: typeof body.included === "boolean" ? body.included : undefined,
          weight: typeof body.weight === "number" ? body.weight : undefined,
        },
        context.userId,
      );
      return reply.send({ version: saved.version, layers: await getStrategyLayers(context.tenantId, siteId) });
    } catch (error) {
      return sendDomainError(reply, error);
    }
  });

  // "Investigate gap": indexed coverage per subtopic + a link to the plan generator for this pillar.
  fastify.get("/v2/sites/:siteId/strategy/clusters/:slug/coverage", async (request, reply) => {
    const context = await requireStudioContext(request, reply);
    if (!context) return;
    const siteId = await loadSiteForParams(request, reply, context.tenantId);
    if (!siteId) return;
    const slug = parseOptionalString((request.params as { slug: string }).slug);
    if (!slug) return badRequest(reply, "invalid cluster");
    try {
      return reply.send(await getClusterCoverage(context.tenantId, siteId, slug));
    } catch (error) {
      return sendDomainError(reply, error);
    }
  });
}

async function findSite(tenantId: string, siteId: string) {
  return prisma.site.findFirst({ where: { id: siteId, tenantId }, select: { id: true } });
}
