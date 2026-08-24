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
    const promise = refreshSiteIntelligence(context.tenantId, siteId, options);

    if (body.wait === true) {
      try {
        const result = await promise;
        return reply.send({ started: !running, result });
      } catch (error) {
        return badRequest(reply, error instanceof Error ? error.message : String(error));
      }
    }
    return reply.code(202).send({ started: !running, indexing: true });
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
}
