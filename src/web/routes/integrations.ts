import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { sha256 } from "../../shared/utils/hash";
import { tenantRepository } from "../../infrastructure/db/repositories";
import { FEED_MAX_PAGE, getFeedArticle, listFeedArticles } from "../../studio/integrations-feed";

/**
 * Pull feed for client sites (GuíaTV first). The client reads the article list once per schedule and stores the
 * bodies itself, so the API is read-heavy only from the scheduler, never from a page view.
 *
 * Auth is `X-API-Key` with the tenant's key (same key the Studio uses); the tenant it resolves to is the only data
 * the caller can see. `?site=<site key>` narrows the feed to one destination.
 */

const sendUnauthorized = (reply: FastifyReply, message: string) =>
  reply.code(401).send({ error: "unauthorized", message });

async function resolveTenantId(request: FastifyRequest, reply: FastifyReply): Promise<string | null> {
  const header = request.headers["x-api-key"];
  const key = (Array.isArray(header) ? header[0] : header ?? "").trim();
  if (!key) {
    await sendUnauthorized(reply, "Missing X-API-Key header");
    return null;
  }

  const tenant = await tenantRepository.findByApiKeyHash(sha256(key));
  if (!tenant || tenant.status !== "active") {
    await sendUnauthorized(reply, "Invalid API key");
    return null;
  }
  return tenant.id;
}

function readInteger(value: unknown, fallback: number): number {
  const parsed = Number.parseInt(typeof value === "string" ? value : "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readSiteKey(query: Record<string, unknown>): string | null {
  const value = query.site;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function registerIntegrationRoutes(fastify: FastifyInstance) {
  fastify.get("/api/integrations/v1/articles", async (request, reply) => {
    const tenantId = await resolveTenantId(request, reply);
    if (!tenantId) return;

    const query = (request.query ?? {}) as Record<string, unknown>;
    const limit = Math.min(Math.max(readInteger(query.limit, FEED_MAX_PAGE), 1), FEED_MAX_PAGE);
    const offset = Math.max(readInteger(query.offset, 0), 0);

    const page = await listFeedArticles({ tenantId, siteKey: readSiteKey(query), limit, offset });
    if (!page) {
      return reply.code(404).send({ error: "site_not_found", message: `No site with key ${readSiteKey(query)}` });
    }

    return reply.code(200).send({ items: page.items, total: page.total, limit, offset });
  });

  fastify.get("/api/integrations/v1/articles/:id", async (request, reply) => {
    const tenantId = await resolveTenantId(request, reply);
    if (!tenantId) return;

    const params = request.params as { id?: string };
    const id = String(params.id ?? "").trim();
    if (!id) {
      return reply.code(400).send({ error: "bad_request", message: "Missing article id" });
    }

    const query = (request.query ?? {}) as Record<string, unknown>;
    const article = await getFeedArticle({ tenantId, siteKey: readSiteKey(query), id });
    if (article === null) {
      return reply.code(404).send({ error: "not_found", message: `No published article ${id}` });
    }
    if ("siteNotFound" in article) {
      return reply.code(404).send({ error: "site_not_found", message: `No site with key ${readSiteKey(query)}` });
    }

    return reply.code(200).send({ article });
  });
}
