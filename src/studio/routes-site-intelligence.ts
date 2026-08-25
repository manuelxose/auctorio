import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  badRequest,
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
import { completeOperation, createOperation, failOperation, startOperation } from "./operations";
import { publishEvent } from "./events";

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

    const running = isSiteIndexing(siteId);

    const operation = await createOperation({
      tenantId: context.tenantId,
      siteId,
      type: "site_index",
      initiatorUserId: context.userId,
      entityType: "site",
      entityId: siteId,
      metadata: { crawl: options.crawl, budget: options.budget ?? null },
    });
    await startOperation(operation.id, "discovering");
    await publishEvent({
      tenantId: context.tenantId,
      siteId,
      type: "operation.created",
      payload: { operationId: operation.id, type: "site_index" },
    });

    const promise = refreshSiteIntelligence(context.tenantId, siteId, options)
      .then(async (result) => {
        await completeOperation(operation.id);
        await publishEvent({
          tenantId: context.tenantId,
          siteId,
          type: "operation.completed",
          payload: { operationId: operation.id },
        });
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
    const query = request.query as { q?: string; crawlState?: string; page?: string; pageSize?: string };
    return reply.send(
      await listIndexedPages(context.tenantId, siteId, {
        query: parseOptionalString(query.q) ?? undefined,
        crawlState: parseOptionalString(query.crawlState) ?? undefined,
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
}
