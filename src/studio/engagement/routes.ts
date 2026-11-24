import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { getPrismaClient } from "../../infrastructure/db/prisma";
import { badRequest, isUuid, notFound, parseBody, requireStudioContext, requireStudioPermission } from "../http-utils";
import { draftOpportunity, getSettings, readEngagement, refreshEngagement, saveEngagementSettings, updateOpportunity } from "./index";

const root = "/v2/sites/:siteId/engagement";

async function engagementRequest(request: FastifyRequest, reply: FastifyReply, write = false) {
  const context = await (write ? requireStudioPermission(request, reply, "projects.manage") : requireStudioContext(request, reply));
  if (!context) return null;
  const { siteId, id } = request.params as { siteId: string; id?: string };
  const { platform } = request.query as { platform?: string };
  if (!isUuid(siteId) || (id && !isUuid(id)) || (platform !== "reddit" && platform !== "quora")) {
    badRequest(reply, "invalid_engagement_scope");
    return null;
  }
  const site = await getPrismaClient().site.findFirst({ where: { id: siteId, tenantId: context.tenantId }, select: { id: true, tenantId: true, locale: true, brandVoice: true } });
  if (!site) {
    notFound(reply, "site_not_found");
    return null;
  }
  return { site, scope: { tenantId: site.tenantId, siteId, platform }, id, userId: context.userId } as const;
}

function reportError(reply: FastifyReply, error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (message === "opportunity_not_found") return notFound(reply, message);
  if (/^(?:engagement_|invalid_engagement_|daily_search_|web_intelligence_)[a-z_]+$/.test(message)) return badRequest(reply, message);
  throw error;
}

export function registerEngagementRoutes(fastify: FastifyInstance) {
  fastify.get(root, async (request, reply) => {
    const context = await engagementRequest(request, reply);
    if (!context) return;
    const { status } = request.query as { status?: string };
    if (status !== undefined && !["to_reply", "replied", "dismissed"].includes(status)) return badRequest(reply, "invalid_engagement_status");
    return readEngagement(context.scope, status);
  });
  fastify.get(`${root}/settings`, async (request, reply) => {
    const context = await engagementRequest(request, reply);
    if (context) return getSettings(context.scope);
  });
  fastify.put(`${root}/settings`, async (request, reply) => {
    const context = await engagementRequest(request, reply, true);
    if (!context) return;
    try { return await saveEngagementSettings(context.scope, parseBody<Record<string, unknown>>(request)); }
    catch (error) { return reportError(reply, error); }
  });
  fastify.post(`${root}/refresh`, async (request, reply) => {
    const context = await engagementRequest(request, reply, true);
    if (!context) return;
    const operation = await refreshEngagement(context.scope, context.site, context.userId);
    return reply.code(202).send(operation);
  });
  fastify.post(`${root}/:id/draft`, async (request, reply) => {
    const context = await engagementRequest(request, reply, true);
    if (!context?.id) return;
    try { return await draftOpportunity(context.scope, context.site, context.id, parseBody<Record<string, unknown>>(request)); }
    catch (error) { return reportError(reply, error); }
  });
  fastify.patch(`${root}/:id`, async (request, reply) => {
    const context = await engagementRequest(request, reply, true);
    if (!context?.id) return;
    try {
      await updateOpportunity(context.scope, context.id, parseBody<Record<string, unknown>>(request));
      return { ok: true };
    } catch (error) { return reportError(reply, error); }
  });
}
