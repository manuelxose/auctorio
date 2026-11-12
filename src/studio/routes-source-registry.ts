// Source registry routes: packs, feed discovery, bulk operations, runs,
// verification, health list and enrichment providers. No secret material
// ever leaves the server through these endpoints.

import type { FastifyInstance } from "fastify";
import {
  badRequest,
  conflict,
  isUuid,
  notFound,
  parseBody,
  parseOptionalString,
  parsePage,
  parsePageSize,
  requireStudioContext,
  requireStudioPermission,
} from "./http-utils";
import {
  bulkUpdateSources,
  importSourcePack,
  listSourcePacks,
  listSourceRuns,
  listSourcesWithHealth,
  markSourceUnsupported,
  verifySource,
  type BulkSourceAction,
} from "./source-registry";
import { discoverFeedsForUrl } from "./feed-discovery";
import { testSourceFetch } from "./sources";
import {
  createEnrichmentProvider,
  deleteEnrichmentProvider,
  getEnrichmentProvider,
  listEnrichmentProviders,
  testEnrichmentProvider,
  updateEnrichmentProvider,
} from "./enrichment-providers";
import { listAdapterTypes } from "./adapters/registry";
import {
  acceptSiteSourceRecommendation,
  addManualSiteSource,
  discoverSourceRecommendations,
  getSiteSourceDiagnostics,
  getSourceEvidenceForPlanning,
  listSiteSourceItems,
  listSiteSourceRecommendations,
  listSiteSources,
  rejectSiteSourceRecommendation,
  runAsOperation,
  setSiteSourceState,
  testSiteSource,
  updateSiteSourceConfig,
  type SourceConfigPatch,
} from "./source-registry-discovery";
import { registerCompetitorRoutes } from "./competitors/routes";
import type { FastifyReply } from "fastify";

const SOURCE_STATE_ACTIONS = ["pause", "resume", "archive", "restore"] as const;

/** Map domain errors to HTTP codes for the site-scoped endpoints. */
function sendDomainError(reply: FastifyReply, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (/_not_found$/.test(message)) {
    return notFound(reply, message);
  }
  return badRequest(reply, message);
}

function siteParams(request: { params: unknown }, reply: FastifyReply): { siteId: string; id?: string } | null {
  const params = request.params as { siteId: string; id?: string };
  if (!isUuid(params.siteId) || (params.id !== undefined && !isUuid(params.id))) {
    badRequest(reply, "invalid id");
    return null;
  }
  return params;
}

function registerSiteSourceRoutes(fastify: FastifyInstance) {
  fastify.post("/v2/sites/:siteId/source-recommendations/discover", async (request, reply) => {
    const context = await requireStudioPermission(request, reply, "integrations.manage");
    const params = context && siteParams(request, reply);
    if (!context || !params) return;
    const site = await listSiteSourceRecommendations(context.tenantId, params.siteId, { status: "__none__" }).catch((error: unknown) => error);
    if (site instanceof Error) return sendDomainError(reply, site);
    const started = await runAsOperation(
      { tenantId: context.tenantId, siteId: params.siteId, type: "source_discovery", userId: context.userId, entityType: "site" },
      () => discoverSourceRecommendations(context.tenantId, params.siteId),
    );
    return reply.code(202).send(started);
  });

  fastify.get("/v2/sites/:siteId/source-recommendations", async (request, reply) => {
    const context = await requireStudioContext(request, reply);
    const params = context && siteParams(request, reply);
    if (!context || !params) return;
    const query = request.query as { status?: string; relationship?: string };
    try {
      return reply.send({ items: await listSiteSourceRecommendations(context.tenantId, params.siteId, query) });
    } catch (error) {
      return sendDomainError(reply, error);
    }
  });

  fastify.post("/v2/sites/:siteId/source-recommendations/bulk", async (request, reply) => {
    const context = await requireStudioPermission(request, reply, "integrations.manage");
    const params = context && siteParams(request, reply);
    if (!context || !params) return;
    const body = parseBody<{ ids?: unknown; action?: string }>(request);
    if (!Array.isArray(body.ids) || body.ids.length === 0 || body.ids.length > 100 || !body.ids.every((id) => typeof id === "string" && isUuid(id))) {
      return badRequest(reply, "ids must be 1-100 uuids");
    }
    if (body.action !== "accept" && body.action !== "reject") return badRequest(reply, "action must be accept or reject");
    const results: Array<{ id: string; ok: boolean; error: string | null }> = [];
    for (const id of body.ids as string[]) {
      try {
        if (body.action === "accept") await acceptSiteSourceRecommendation(context.tenantId, params.siteId, id, context.userId);
        else await rejectSiteSourceRecommendation(context.tenantId, params.siteId, id, context.userId);
        results.push({ id, ok: true, error: null });
      } catch (error) {
        results.push({ id, ok: false, error: error instanceof Error ? error.message : String(error) });
      }
    }
    return reply.send({ results, succeeded: results.filter((entry) => entry.ok).length, failed: results.filter((entry) => !entry.ok).length });
  });

  for (const action of ["accept", "reject"] as const) {
    fastify.post(`/v2/sites/:siteId/source-recommendations/:id/${action}`, async (request, reply) => {
      const context = await requireStudioPermission(request, reply, "integrations.manage");
      const params = context && siteParams(request, reply);
      if (!context || !params?.id) return;
      try {
        const result =
          action === "accept"
            ? await acceptSiteSourceRecommendation(context.tenantId, params.siteId, params.id, context.userId)
            : await rejectSiteSourceRecommendation(context.tenantId, params.siteId, params.id, context.userId);
        return reply.send(result);
      } catch (error) {
        return sendDomainError(reply, error);
      }
    });
  }

  fastify.get("/v2/sites/:siteId/sources", async (request, reply) => {
    const context = await requireStudioContext(request, reply);
    const params = context && siteParams(request, reply);
    if (!context || !params) return;
    const query = request.query as { state?: string; search?: string };
    try {
      return reply.send({ items: await listSiteSources(context.tenantId, params.siteId, { state: query.state, search: parseOptionalString(query.search) ?? undefined }) });
    } catch (error) {
      return sendDomainError(reply, error);
    }
  });

  fastify.post("/v2/sites/:siteId/sources", async (request, reply) => {
    const context = await requireStudioPermission(request, reply, "integrations.manage");
    const params = context && siteParams(request, reply);
    if (!context || !params) return;
    const body = parseBody<{ url?: string; name?: string; topics?: unknown; language?: string }>(request);
    const url = parseOptionalString(body.url);
    if (!url) return badRequest(reply, "url is required");
    try {
      const source = await addManualSiteSource(
        context.tenantId,
        params.siteId,
        { url, name: parseOptionalString(body.name), topics: Array.isArray(body.topics) ? body.topics.map(String) : [], language: parseOptionalString(body.language) },
        context.userId,
      );
      return reply.code(201).send(source);
    } catch (error) {
      return sendDomainError(reply, error);
    }
  });

  fastify.patch("/v2/sites/:siteId/sources/:id/config", async (request, reply) => {
    const context = await requireStudioPermission(request, reply, "integrations.manage");
    const params = context && siteParams(request, reply);
    if (!context || !params?.id) return;
    const body = parseBody<SourceConfigPatch>(request);
    for (const key of ["topics", "pillars", "relevanceKeywords"] as const) {
      if (body[key] !== undefined && !Array.isArray(body[key])) return badRequest(reply, `${key} must be an array`);
    }
    if (body.selectors !== undefined && (typeof body.selectors !== "object" || Array.isArray(body.selectors))) return badRequest(reply, "selectors must be an object");
    try {
      return reply.send(await updateSiteSourceConfig(context.tenantId, params.siteId, params.id, body));
    } catch (error) {
      return sendDomainError(reply, error);
    }
  });

  fastify.post("/v2/sites/:siteId/sources/:id/state", async (request, reply) => {
    const context = await requireStudioPermission(request, reply, "integrations.manage");
    const params = context && siteParams(request, reply);
    if (!context || !params?.id) return;
    const action = parseBody<{ action?: string }>(request).action ?? "";
    if (!(SOURCE_STATE_ACTIONS as readonly string[]).includes(action)) return badRequest(reply, `action must be one of ${SOURCE_STATE_ACTIONS.join(", ")}`);
    try {
      return reply.send(await setSiteSourceState(context.tenantId, params.siteId, params.id, action as (typeof SOURCE_STATE_ACTIONS)[number], context.userId));
    } catch (error) {
      return sendDomainError(reply, error);
    }
  });

  fastify.post("/v2/sites/:siteId/sources/:id/test", async (request, reply) => {
    const context = await requireStudioPermission(request, reply, "integrations.manage");
    const params = context && siteParams(request, reply);
    if (!context || !params?.id) return;
    try {
      return reply.send(await testSiteSource(context.tenantId, params.siteId, params.id));
    } catch (error) {
      return sendDomainError(reply, error);
    }
  });

  fastify.get("/v2/sites/:siteId/sources/:id/items", async (request, reply) => {
    const context = await requireStudioContext(request, reply);
    const params = context && siteParams(request, reply);
    if (!context || !params?.id) return;
    try {
      return reply.send({ items: await listSiteSourceItems(context.tenantId, params.siteId, params.id, parsePageSize((request.query as { limit?: string }).limit, 50, 200)) });
    } catch (error) {
      return sendDomainError(reply, error);
    }
  });

  fastify.get("/v2/sites/:siteId/sources/:id/diagnostics", async (request, reply) => {
    const context = await requireStudioContext(request, reply);
    const params = context && siteParams(request, reply);
    if (!context || !params?.id) return;
    try {
      return reply.send(await getSiteSourceDiagnostics(context.tenantId, params.siteId, params.id));
    } catch (error) {
      return sendDomainError(reply, error);
    }
  });

  fastify.get("/v2/sites/:siteId/source-evidence", async (request, reply) => {
    const context = await requireStudioContext(request, reply);
    const params = context && siteParams(request, reply);
    if (!context || !params) return;
    return reply.send({ items: await getSourceEvidenceForPlanning(context.tenantId, params.siteId, parsePageSize((request.query as { limit?: string }).limit, 20, 100)) });
  });
}

const BULK_ACTIONS: BulkSourceAction[] = [
  "enable",
  "disable",
  "archive",
  "unarchive",
  "delete",
  "refresh",
  "assign_category",
  "assign_site",
  "assign_language",
  "set_refresh_interval",
  "verify",
];

export function registerSourceRegistryRoutes(fastify: FastifyInstance) {
  registerSiteSourceRoutes(fastify);
  registerCompetitorRoutes(fastify);

  // ── Source packs

  fastify.get("/v2/source-packs", async (request, reply) => {
    const context = await requireStudioContext(request, reply);
    if (!context) {
      return;
    }
    return reply.send({ items: await listSourcePacks(context.tenantId) });
  });

  fastify.post("/v2/source-packs/:key/import", async (request, reply) => {
    const context = await requireStudioPermission(request, reply, "integrations.manage");
    if (!context) {
      return;
    }
    const packKey = (request.params as { key: string }).key;
    if (!/^[a-z0-9][a-z0-9_-]{1,60}$/.test(packKey)) {
      return badRequest(reply, "invalid pack key");
    }
    const body = parseBody<{ enabled?: boolean; withProviders?: boolean }>(request);
    try {
      const result = await importSourcePack(context.tenantId, packKey, {
        enabled: body.enabled ?? true,
        withProviders: body.withProviders ?? false,
        userId: context.userId ?? null,
      });
      return reply.code(201).send(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message === "pack_not_found") {
        return notFound(reply, "pack not found");
      }
      return badRequest(reply, message);
    }
  });

  // ── Feed discovery (never auto-subscribes)

  fastify.post("/v2/feed-discovery/discover", async (request, reply) => {
    const context = await requireStudioPermission(request, reply, "integrations.manage");
    if (!context) {
      return;
    }
    const body = parseBody<{ url?: string }>(request);
    const url = parseOptionalString(body.url);
    if (!url) {
      return badRequest(reply, "url is required");
    }
    try {
      const result = await discoverFeedsForUrl({ url });
      return reply.send(result);
    } catch (error) {
      return badRequest(reply, error instanceof Error ? error.message : String(error));
    }
  });

  // ── Adapter catalog

  fastify.get("/v2/source-adapters", async (request, reply) => {
    const context = await requireStudioContext(request, reply);
    if (!context) {
      return;
    }
    return reply.send({ items: listAdapterTypes() });
  });

  // ── Test a draft source (before it is saved)

  fastify.post("/v2/sources/test-draft", async (request, reply) => {
    const context = await requireStudioPermission(request, reply, "integrations.manage");
    if (!context) {
      return;
    }
    const body = parseBody<{ type?: string; url?: string; configuration?: Record<string, unknown> }>(request);
    if (!body.type || !body.url) {
      return badRequest(reply, "type and url are required");
    }
    try {
      const result = await testSourceFetch(context.tenantId, {
        type: body.type as never,
        url: body.url,
        configuration: body.configuration ?? null,
      });
      return reply.send(result);
    } catch (error) {
      return reply.code(502).send({ ok: false, message: error instanceof Error ? error.message : String(error) });
    }
  });

  // ── Sources with health states

  fastify.get("/v2/sources-health", async (request, reply) => {
    const context = await requireStudioContext(request, reply);
    if (!context) {
      return;
    }
    const query = request.query as { page?: string; pageSize?: string; includeArchived?: string };
    const page = parsePage(query.page, 1);
    const pageSize = parsePageSize(query.pageSize, 25);
    return reply.send(await listSourcesWithHealth(context.tenantId, { page, pageSize, includeArchived: query.includeArchived === "true" }));
  });

  // ── Bulk operations

  fastify.post("/v2/sources/bulk", async (request, reply) => {
    const context = await requireStudioPermission(request, reply, "integrations.manage");
    if (!context) {
      return;
    }
    const body = parseBody<{
      ids?: unknown;
      action?: string;
      category?: string;
      siteId?: string;
      language?: string;
      refreshIntervalMinutes?: number;
    }>(request);
    if (!Array.isArray(body.ids) || body.ids.length === 0) {
      return badRequest(reply, "ids must be a non-empty array");
    }
    if (!body.action || !BULK_ACTIONS.includes(body.action as BulkSourceAction)) {
      return badRequest(reply, `action must be one of: ${BULK_ACTIONS.join(", ")}`);
    }
    try {
      const result = await bulkUpdateSources(context.tenantId, {
        ids: body.ids.map(String),
        action: body.action as BulkSourceAction,
        category: parseOptionalString(body.category),
        siteId: parseOptionalString(body.siteId),
        language: parseOptionalString(body.language) ?? undefined,
        refreshIntervalMinutes: body.refreshIntervalMinutes,
        userId: context.userId ?? null,
      });
      return reply.send(result);
    } catch (error) {
      return badRequest(reply, error instanceof Error ? error.message : String(error));
    }
  });

  // ── Runs and verification

  fastify.get("/v2/sources/:id/runs", async (request, reply) => {
    const context = await requireStudioContext(request, reply);
    if (!context) {
      return;
    }
    const sourceId = (request.params as { id: string }).id;
    if (!isUuid(sourceId)) {
      return badRequest(reply, "invalid source id");
    }
    const query = request.query as { page?: string; pageSize?: string };
    return reply.send(
      await listSourceRuns(context.tenantId, sourceId, {
        page: parsePage(query.page, 1),
        pageSize: parsePageSize(query.pageSize, 10),
      }),
    );
  });

  fastify.post("/v2/sources/:id/verify", async (request, reply) => {
    const context = await requireStudioPermission(request, reply, "integrations.manage");
    if (!context) {
      return;
    }
    const sourceId = (request.params as { id: string }).id;
    if (!isUuid(sourceId)) {
      return badRequest(reply, "invalid source id");
    }
    try {
      return reply.send(await verifySource(context.tenantId, sourceId));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message === "source_not_found") {
        return notFound(reply, message);
      }
      return badRequest(reply, message);
    }
  });

  fastify.post("/v2/sources/:id/mark-unsupported", async (request, reply) => {
    const context = await requireStudioPermission(request, reply, "integrations.manage");
    if (!context) {
      return;
    }
    const sourceId = (request.params as { id: string }).id;
    if (!isUuid(sourceId)) {
      return badRequest(reply, "invalid source id");
    }
    const body = parseBody<{ note?: string }>(request);
    const updated = await markSourceUnsupported(context.tenantId, sourceId, parseOptionalString(body.note) ?? "unsupported");
    if (!updated) {
      return notFound(reply, "source not found");
    }
    return reply.send({ ok: true });
  });

  // ── Enrichment providers (structured-data APIs)

  fastify.get("/v2/enrichment-providers", async (request, reply) => {
    const context = await requireStudioContext(request, reply);
    if (!context) {
      return;
    }
    const query = request.query as { page?: string; pageSize?: string };
    return reply.send(
      await listEnrichmentProviders(context.tenantId, {
        page: parsePage(query.page, 1),
        pageSize: parsePageSize(query.pageSize, 25),
      }),
    );
  });

  fastify.post("/v2/enrichment-providers", async (request, reply) => {
    const context = await requireStudioPermission(request, reply, "integrations.manage");
    if (!context) {
      return;
    }
    const body = parseBody<{
      key?: string;
      name?: string;
      providerType?: string;
      baseUrl?: string;
      endpoint?: string;
      credentialsRef?: string;
      enabled?: boolean;
      category?: string;
      configuration?: Record<string, unknown>;
    }>(request);
    if (!body.key?.trim() || !body.name?.trim() || !body.providerType) {
      return badRequest(reply, "key, name and providerType are required");
    }
    try {
      const provider = await createEnrichmentProvider(context.tenantId, {
        key: body.key.trim(),
        name: body.name.trim(),
        providerType: body.providerType,
        baseUrl: parseOptionalString(body.baseUrl),
        endpoint: parseOptionalString(body.endpoint),
        credentialsRef: parseOptionalString(body.credentialsRef),
        enabled: body.enabled ?? true,
        category: parseOptionalString(body.category),
        configuration: body.configuration ?? null,
      });
      return reply.code(201).send(provider);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/unique constraint|Unique constraint/i.test(message)) {
        return conflict(reply, "provider key already exists");
      }
      return badRequest(reply, message);
    }
  });

  fastify.patch("/v2/enrichment-providers/:id", async (request, reply) => {
    const context = await requireStudioPermission(request, reply, "integrations.manage");
    if (!context) {
      return;
    }
    const providerId = (request.params as { id: string }).id;
    if (!isUuid(providerId)) {
      return badRequest(reply, "invalid provider id");
    }
    const body = parseBody<{
      key?: string;
      name?: string;
      providerType?: string;
      baseUrl?: string;
      endpoint?: string;
      credentialsRef?: string;
      enabled?: boolean;
      category?: string;
      configuration?: Record<string, unknown>;
    }>(request);
    const updated = await updateEnrichmentProvider(context.tenantId, providerId, {
      key: body.key,
      name: body.name,
      providerType: body.providerType,
      baseUrl: parseOptionalString(body.baseUrl),
      endpoint: parseOptionalString(body.endpoint),
      credentialsRef: body.credentialsRef === undefined ? undefined : parseOptionalString(body.credentialsRef),
      enabled: body.enabled,
      category: parseOptionalString(body.category),
      configuration: body.configuration,
    });
    if (!updated) {
      return notFound(reply, "provider not found");
    }
    return reply.send(updated);
  });

  fastify.delete("/v2/enrichment-providers/:id", async (request, reply) => {
    const context = await requireStudioPermission(request, reply, "integrations.manage");
    if (!context) {
      return;
    }
    const providerId = (request.params as { id: string }).id;
    if (!isUuid(providerId)) {
      return badRequest(reply, "invalid provider id");
    }
    const deleted = await deleteEnrichmentProvider(context.tenantId, providerId);
    if (!deleted) {
      return notFound(reply, "provider not found");
    }
    return reply.send({ ok: true });
  });

  fastify.post("/v2/enrichment-providers/:id/test", async (request, reply) => {
    const context = await requireStudioPermission(request, reply, "integrations.manage");
    if (!context) {
      return;
    }
    const providerId = (request.params as { id: string }).id;
    if (!isUuid(providerId)) {
      return badRequest(reply, "invalid provider id");
    }
    try {
      const result = await testEnrichmentProvider(context.tenantId, providerId);
      return reply.send(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message === "provider_not_found") {
        return notFound(reply, message);
      }
      return badRequest(reply, message);
    }
  });

  fastify.get("/v2/enrichment-providers/:id", async (request, reply) => {
    const context = await requireStudioContext(request, reply);
    if (!context) {
      return;
    }
    const providerId = (request.params as { id: string }).id;
    if (!isUuid(providerId)) {
      return badRequest(reply, "invalid provider id");
    }
    const provider = await getEnrichmentProvider(context.tenantId, providerId);
    if (!provider) {
      return notFound(reply, "provider not found");
    }
    return reply.send(provider);
  });
}
