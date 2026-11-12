// Site-scoped competitor intelligence routes. Registered from
// routes-source-registry.ts so the server route list stays untouched.

import type { FastifyInstance, FastifyReply } from "fastify";
import { badRequest, isUuid, notFound, parseBody, parseOptionalString, requireStudioContext, requireStudioPermission } from "../http-utils";
import { runAsOperation } from "../source-registry-discovery";
import {
  addCompetitorManually,
  addOpportunityToPlan,
  discoverCompetitors,
  getCoverageComparison,
  listCompetitors,
  listOpportunities,
  refreshCompetitorCoverage,
  setOpportunityStatus,
  updateCompetitor,
} from "./index";

function fail(reply: FastifyReply, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /_not_found$/.test(message) ? notFound(reply, message) : badRequest(reply, message);
}

function ids(request: { params: unknown }, reply: FastifyReply): { siteId: string; id?: string } | null {
  const params = request.params as { siteId: string; id?: string };
  if (!isUuid(params.siteId) || (params.id !== undefined && !isUuid(params.id))) {
    badRequest(reply, "invalid id");
    return null;
  }
  return params;
}

export function registerCompetitorRoutes(fastify: FastifyInstance) {
  fastify.get("/v2/sites/:siteId/competitors", async (request, reply) => {
    const context = await requireStudioContext(request, reply);
    const params = context && ids(request, reply);
    if (!context || !params) return;
    try {
      return reply.send({ items: await listCompetitors(context.tenantId, params.siteId, { status: parseOptionalString((request.query as { status?: string }).status) ?? undefined }) });
    } catch (error) {
      return fail(reply, error);
    }
  });

  for (const [path, type, work] of [
    ["discover", "competitor_discovery", discoverCompetitors],
    ["coverage/refresh", "competitor_coverage", (tenantId: string, siteId: string) => refreshCompetitorCoverage(tenantId, siteId)],
  ] as const) {
    fastify.post(`/v2/sites/:siteId/competitors/${path}`, async (request, reply) => {
      const context = await requireStudioPermission(request, reply, "integrations.manage");
      const params = context && ids(request, reply);
      if (!context || !params) return;
      try {
        await listCompetitors(context.tenantId, params.siteId, { status: "__none__" }); // tenant/site guard
      } catch (error) {
        return fail(reply, error);
      }
      const started = await runAsOperation({ tenantId: context.tenantId, siteId: params.siteId, type, userId: context.userId, entityType: "site" }, () => work(context.tenantId, params.siteId));
      return reply.code(202).send(started);
    });
  }

  fastify.post("/v2/sites/:siteId/competitors", async (request, reply) => {
    const context = await requireStudioPermission(request, reply, "integrations.manage");
    const params = context && ids(request, reply);
    if (!context || !params) return;
    const body = parseBody<{ url?: string; name?: string; notes?: string }>(request);
    const url = parseOptionalString(body.url);
    if (!url) return badRequest(reply, "url is required");
    try {
      return reply.code(201).send(await addCompetitorManually(context.tenantId, params.siteId, { url, name: parseOptionalString(body.name), notes: parseOptionalString(body.notes) }, context.userId));
    } catch (error) {
      return fail(reply, error);
    }
  });

  fastify.patch("/v2/sites/:siteId/competitors/:id", async (request, reply) => {
    const context = await requireStudioPermission(request, reply, "integrations.manage");
    const params = context && ids(request, reply);
    if (!context || !params?.id) return;
    const body = parseBody<{ name?: string; notes?: string | null; status?: string; feedUrl?: string | null; sitemapUrl?: string | null }>(request);
    try {
      return reply.send(
        await updateCompetitor(
          context.tenantId,
          params.siteId,
          params.id,
          { name: body.name, notes: body.notes === undefined ? undefined : parseOptionalString(body.notes) ?? null, status: body.status, feedUrl: body.feedUrl === undefined ? undefined : parseOptionalString(body.feedUrl) ?? null, sitemapUrl: body.sitemapUrl === undefined ? undefined : parseOptionalString(body.sitemapUrl) ?? null },
          context.userId,
        ),
      );
    } catch (error) {
      return fail(reply, error);
    }
  });

  fastify.get("/v2/sites/:siteId/competitors/coverage", async (request, reply) => {
    const context = await requireStudioContext(request, reply);
    const params = context && ids(request, reply);
    if (!context || !params) return;
    try {
      return reply.send(await getCoverageComparison(context.tenantId, params.siteId));
    } catch (error) {
      return fail(reply, error);
    }
  });

  fastify.get("/v2/sites/:siteId/opportunities", async (request, reply) => {
    const context = await requireStudioContext(request, reply);
    const params = context && ids(request, reply);
    if (!context || !params) return;
    const query = request.query as { status?: string; kind?: string };
    try {
      return reply.send({ items: await listOpportunities(context.tenantId, params.siteId, { status: parseOptionalString(query.status) ?? undefined, kind: parseOptionalString(query.kind) ?? undefined }) });
    } catch (error) {
      return fail(reply, error);
    }
  });

  fastify.post("/v2/sites/:siteId/opportunities/:id/plan", async (request, reply) => {
    const context = await requireStudioPermission(request, reply, "projects.manage");
    const params = context && ids(request, reply);
    if (!context || !params?.id) return;
    const body = parseBody<{ mode?: string; targetUrl?: string }>(request);
    if (body.mode !== undefined && body.mode !== "new" && body.mode !== "update") return badRequest(reply, "mode must be new or update");
    try {
      const result = await addOpportunityToPlan(context.tenantId, params.siteId, params.id, { mode: body.mode, targetUrl: parseOptionalString(body.targetUrl) }, context.userId);
      return reply.code(result.created ? 201 : 200).send(result);
    } catch (error) {
      return fail(reply, error);
    }
  });

  fastify.post("/v2/sites/:siteId/opportunities/:id/status", async (request, reply) => {
    const context = await requireStudioPermission(request, reply, "projects.manage");
    const params = context && ids(request, reply);
    if (!context || !params?.id) return;
    const status = parseBody<{ status?: string }>(request).status;
    if (status !== "dismissed" && status !== "monitoring" && status !== "open") return badRequest(reply, "status must be dismissed, monitoring or open");
    try {
      return reply.send(await setOpportunityStatus(context.tenantId, params.siteId, params.id, status, context.userId));
    } catch (error) {
      return fail(reply, error);
    }
  });
}
