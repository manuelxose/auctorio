import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { sha256 } from "../../shared/utils/hash";
import { tenantRepository } from "../../infrastructure/db/repositories";
import { FEED_MAX_PAGE, getFeedArticle, listFeedArticles } from "../../studio/integrations-feed";
import { getPrismaClient } from "../../infrastructure/db/prisma";

/**
 * Pull feed for client sites (GuíaTV first). The client reads the article list once per schedule and stores the
 * bodies itself, so the API is read-heavy only from the scheduler, never from a page view.
 *
 * Auth is `X-API-Key` with the tenant's key (same key the Studio uses); the tenant it resolves to is the only data
 * the caller can see. `?site=<site key>` narrows the feed to one destination.
 */

const sendUnauthorized = (reply: FastifyReply, message: string) =>
  reply.code(401).send({ error: "unauthorized", message });

type FeedCaller = { tenantId: string; siteKey: string | null; installationKey: boolean };

const PULL_RECORD_INTERVAL_MS = 60_000;

/**
 * A wizard-issued installation key (`auc_…`) sees only its own site and records each pull so the wizard can
 * verify the connection. The tenant key keeps working for existing clients.
 */
async function resolveInstallationKey(key: string): Promise<FeedCaller | null> {
  const prisma = getPrismaClient();
  const installation = await prisma.connectorInstallation.findFirst({
    where: {
      provider: "auctorio_feed",
      state: { notIn: ["cancelled", "disabled"] },
      config: { path: ["feedKeyHash"], equals: sha256(key) },
    },
  });
  if (!installation) return null;
  const config = (installation.config ?? {}) as Record<string, unknown>;
  const last = Date.parse(String(config.lastPulledAt ?? ""));
  if (!Number.isFinite(last) || Date.now() - last > PULL_RECORD_INTERVAL_MS) {
    await prisma.connectorInstallation.update({
      where: { id: installation.id },
      data: { config: { ...config, lastPulledAt: new Date().toISOString() } },
    });
  }
  const site = installation.siteId
    ? await prisma.site.findFirst({ where: { id: installation.siteId }, select: { key: true } })
    : null;
  return { tenantId: installation.tenantId, siteKey: site?.key ?? (config.feedSiteKey ? String(config.feedSiteKey) : null), installationKey: true };
}

async function resolveCaller(request: FastifyRequest, reply: FastifyReply): Promise<FeedCaller | null> {
  const header = request.headers["x-api-key"];
  const key = (Array.isArray(header) ? header[0] : header ?? "").trim();
  if (!key) {
    await sendUnauthorized(reply, "Missing X-API-Key header");
    return null;
  }

  if (key.startsWith("auc_")) {
    const caller = await resolveInstallationKey(key);
    if (!caller) await sendUnauthorized(reply, "Invalid API key");
    return caller;
  }

  const tenant = await tenantRepository.findByApiKeyHash(sha256(key));
  if (!tenant || tenant.status !== "active") {
    await sendUnauthorized(reply, "Invalid API key");
    return null;
  }
  return { tenantId: tenant.id, siteKey: null, installationKey: false };
}

/** An installation key is pinned to its site; with no site yet it sees nothing rather than the whole tenant. */
function scopedSiteKey(caller: FeedCaller, query: Record<string, unknown>): string | null | false {
  if (!caller.installationKey) return readSiteKey(query);
  return caller.siteKey ?? false;
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
    const caller = await resolveCaller(request, reply);
    if (!caller) return;

    const query = (request.query ?? {}) as Record<string, unknown>;
    const limit = Math.min(Math.max(readInteger(query.limit, FEED_MAX_PAGE), 1), FEED_MAX_PAGE);
    const offset = Math.max(readInteger(query.offset, 0), 0);

    const siteKey = scopedSiteKey(caller, query);
    if (siteKey === false) {
      return reply.code(200).send({ items: [], total: 0, limit, offset });
    }
    const page = await listFeedArticles({ tenantId: caller.tenantId, siteKey, limit, offset });
    if (!page) {
      return reply.code(404).send({ error: "site_not_found", message: `No site with key ${siteKey}` });
    }

    return reply.code(200).send({ items: page.items, total: page.total, limit, offset });
  });

  fastify.get("/api/integrations/v1/articles/:id", async (request, reply) => {
    const caller = await resolveCaller(request, reply);
    if (!caller) return;

    const params = request.params as { id?: string };
    const id = String(params.id ?? "").trim();
    if (!id) {
      return reply.code(400).send({ error: "bad_request", message: "Missing article id" });
    }

    const query = (request.query ?? {}) as Record<string, unknown>;
    const siteKey = scopedSiteKey(caller, query);
    const article = siteKey === false ? null : await getFeedArticle({ tenantId: caller.tenantId, siteKey, id });
    if (article === null) {
      return reply.code(404).send({ error: "not_found", message: `No published article ${id}` });
    }
    if ("siteNotFound" in article) {
      return reply.code(404).send({ error: "site_not_found", message: `No site with key ${readSiteKey(query)}` });
    }

    return reply.code(200).send({ article });
  });
}
