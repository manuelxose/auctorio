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
