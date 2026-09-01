// Production source registry: pack catalog/imports, bulk operations,
// live verification and provenance. The database (ContentSource) is the
// runtime source of truth — packs are bootstrap configuration only.

import { Prisma } from "@prisma/client";
import type { ContentSource } from "@prisma/client";
import { getPrismaClient } from "../infrastructure/db/prisma";
import { writeAudit } from "./audit";
import { fetchSourceNow, sanitizeSourceForClient, testSourceFetch } from "./sources";
import { getSourceAdapter } from "./adapters/registry";
import type { SourcePackDefinition, SourcePackEntry } from "./source-packs/types";
import { MOVIE_TV_EN_PACK } from "./source-packs/movie-tv-en";
import { buildProvenance } from "./provenance";
import { getSourceHealth } from "./source-health";
import { newRunKey } from "./discovery-run";

const prisma = getPrismaClient();

// ────────────────────────────────────────────────────────────── Pack catalog

const PACK_DEFINITIONS: SourcePackDefinition[] = [MOVIE_TV_EN_PACK];

export function listPackCatalog(): SourcePackDefinition[] {
  return PACK_DEFINITIONS;
}

export function getPackDefinition(packKey: string): SourcePackDefinition | null {
  return PACK_DEFINITIONS.find((pack) => pack.key === packKey) ?? null;
}

export async function listSourcePacks(tenantId: string) {
  const definitions = listPackCatalog();
  const [catalogRows, importCounts] = await Promise.all([
    prisma.sourcePack.findMany({ where: {} }),
    prisma.sourcePackImport.groupBy({ by: ["packKey"], where: { tenantId }, _count: { _all: true } }),
  ]);
  const rowByKey = new Map(catalogRows.map((row) => [row.key, row]));
  const countByKey = new Map(importCounts.map((group) => [group.packKey, group._count._all]));
  const importedSourceCounts = await prisma.contentSource.groupBy({
    by: ["packKey"],
    where: { tenantId, packKey: { not: null }, archivedAt: null },
    _count: { _all: true },
  });
  const sourcesByKey = new Map(importedSourceCounts.map((group) => [group.packKey ?? "", group._count._all]));

  return definitions.map((definition) => ({
    key: definition.key,
    name: definition.name,
    description: definition.description,
    category: definition.category,
    language: definition.language,
    country: definition.country,
    optional: definition.optional,
    entryCount: definition.entries.length,
    providerCount: definition.providers.length,
    catalogId: rowByKey.get(definition.key)?.id ?? null,
    importCount: countByKey.get(definition.key) ?? 0,
    importedSourceCount: sourcesByKey.get(definition.key) ?? 0,
    entries: definition.entries.map((entry) => ({
      id: entry.id,
      name: entry.name,
      domain: entry.domain,
      adapter: entry.adapter,
      endpoint: entry.endpoint,
      discoveryMethod: entry.discoveryMethod,
      enabled: entry.enabled,
      notes: entry.notes ?? null,
      restrictions: entry.restrictions ?? null,
    })),
  }));
}

// ────────────────────────────────────────────────────────────── Pack import

export type ImportSourcePackResult = {
  packKey: string;
  imported: number;
  skipped: number;
  failed: number;
  createdSourceIds: string[];
  errors: string[];
  importedProviders: number;
};

export async function importSourcePack(
  tenantId: string,
  packKey: string,
  options: { enabled?: boolean; withProviders?: boolean; userId?: string | null } = {},
): Promise<ImportSourcePackResult> {
  const pack = getPackDefinition(packKey);
  if (!pack) {
    throw new Error("pack_not_found");
  }

  const result: ImportSourcePackResult = {
    packKey,
    imported: 0,
    skipped: 0,
    failed: 0,
    createdSourceIds: [],
    errors: [],
    importedProviders: 0,
  };
  const log: Array<Record<string, unknown>> = [];
  const enabled = options.enabled ?? true;

  await prisma.sourcePack.upsert({
    where: { key: pack.key },
    create: {
      key: pack.key,
      name: pack.name,
      description: pack.description,
      category: pack.category,
      language: pack.language,
      country: pack.country,
      sourceCount: pack.entries.length,
      optional: pack.optional,
    },
    update: { sourceCount: pack.entries.length },
  });

  for (const entry of pack.entries) {
    try {
      const existing = await prisma.contentSource.findFirst({
        where: { tenantId, name: entry.name },
      });
      if (existing) {
        result.skipped += 1;
        log.push({ entry: entry.id, status: "skipped", reason: "name_exists" });
        continue;
      }
      const created = await createSourceFromPackEntry(tenantId, entry, packKey, enabled);
      result.imported += 1;
      result.createdSourceIds.push(created.id);
      log.push({ entry: entry.id, status: "imported", sourceId: created.id });
    } catch (error) {
      result.failed += 1;
      const message = error instanceof Error ? error.message : String(error);
      result.errors.push(`${entry.id}: ${message}`);
      log.push({ entry: entry.id, status: "failed", error: message });
    }
  }

  if (options.withProviders) {
    for (const provider of pack.providers) {
      try {
        const existing = await prisma.enrichmentProvider.findFirst({
          where: { tenantId, key: provider.key },
        });
        if (existing) {
          continue;
        }
        await prisma.enrichmentProvider.create({
          data: {
            tenantId,
            key: provider.key,
            name: provider.name,
            providerType: provider.providerType,
            adapter: "api",
            baseUrl: provider.baseUrl,
            endpoint: provider.endpoint,
            credentialsRef: provider.credentialsRef,
            enabled: provider.enabled,
            category: provider.category,
            configuration: provider.configuration ? (provider.configuration as Prisma.InputJsonValue) : Prisma.JsonNull,
            verificationStatus: provider.baseUrl ? "unverified" : "unsupported",
          },
        });
        result.importedProviders += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        result.errors.push(`provider ${provider.key}: ${message}`);
      }
    }
  }

  await prisma.sourcePackImport.create({
    data: {
      tenantId,
      packKey,
      status: result.failed === pack.entries.length ? "failed" : result.failed > 0 ? "partial" : "succeeded",
      importedCount: result.imported,
      skippedCount: result.skipped,
      failedCount: result.failed,
      createdSourceIds: result.createdSourceIds as Prisma.InputJsonValue,
      log: log as Prisma.InputJsonValue,
      importedByUserId: options.userId ?? null,
      finishedAt: new Date(),
    },
  });

  await writeAudit({
    tenantId,
    action: "source_pack.imported",
    entityType: "content_source",
    entityId: packKey,
    actorType: "user",
    metadata: { imported: result.imported, skipped: result.skipped, failed: result.failed },
  });

  return result;
}

export async function createSourceFromPackEntry(
  tenantId: string,
  entry: SourcePackEntry,
  packKey: string,
  enabled: boolean,
): Promise<ContentSource> {
  const source = await prisma.contentSource.create({
    data: {
      tenantId,
      name: entry.name,
      type: entry.adapter,
      url: entry.endpoint,
      domain: entry.domain,
      endpoint: entry.endpoint,
      enabled,
      priority: entry.priority,
      trustScore: entry.trust,
      authorityScore: entry.authority,
      freshnessWeight: 1.0,
      language: entry.language,
      country: entry.country,
      categories: [entry.category] as Prisma.InputJsonValue,
      tags: entry.tags as Prisma.InputJsonValue,
      refreshIntervalMinutes: entry.refreshIntervalMinutes,
      rateLimitPolicy: entry.rateLimits ? (entry.rateLimits as Prisma.InputJsonValue) : Prisma.JsonNull,
      robotsPolicy: entry.robotsPolicy ? (entry.robotsPolicy as Prisma.InputJsonValue) : Prisma.JsonNull,
      extractionPolicy: entry.extractionPolicy ? (entry.extractionPolicy as Prisma.InputJsonValue) : Prisma.JsonNull,
      copyrightPolicy: { respectCopyright: true } as Prisma.InputJsonValue,
      packKey,
      discoveryMethod: entry.discoveryMethod,
      restrictionsNote: entry.restrictions ?? null,
      verificationStatus: "unverified",
    },
  });
  await writeAudit({
    tenantId,
    action: "source.created",
    entityType: "content_source",
    entityId: source.id,
    actorType: "user",
    metadata: { name: source.name, type: source.type, packKey },
  });
  return source;
}

// ────────────────────────────────────────────────────────────── Bulk operations

export type BulkSourceAction =
  | "enable"
  | "disable"
  | "archive"
  | "unarchive"
  | "delete"
  | "refresh"
  | "assign_category"
  | "assign_site"
  | "assign_language"
  | "set_refresh_interval"
  | "verify";

export type BulkSourceResult = {
  total: number;
  succeeded: number;
  failed: number;
  results: Array<{ id: string; ok: boolean; error: string | null; detail?: unknown }>;
};

const MAX_BULK_REFRESH = 20;

export async function bulkUpdateSources(
  tenantId: string,
  input: { ids: string[]; action: BulkSourceAction; category?: string | null; siteId?: string | null; language?: string; refreshIntervalMinutes?: number; userId?: string | null },
): Promise<BulkSourceResult> {
  const ids = Array.from(new Set(input.ids.filter((id) => /^[0-9a-f-]{36}$/i.test(id)))).slice(0, 100);
  const result: BulkSourceResult = { total: ids.length, succeeded: 0, failed: 0, results: [] };
  if (ids.length === 0) {
    return result;
  }

  const run = async (id: string, fn: () => Promise<unknown>): Promise<void> => {
    try {
      const detail = await fn();
      result.results.push({ id, ok: true, error: null, detail });
      result.succeeded += 1;
    } catch (error) {
      result.results.push({ id, ok: false, error: error instanceof Error ? error.message : String(error) });
      result.failed += 1;
    }
  };

  for (const id of ids) {
    switch (input.action) {
      case "enable":
      case "disable":
        await run(id, async () => {
          const updated = await prisma.contentSource.updateMany({
            where: { id, tenantId },
            data: { enabled: input.action === "enable" },
          });
          if (updated.count === 0) {
            throw new Error("source_not_found");
          }
          return { enabled: input.action === "enable" };
        });
        break;
      case "archive":
        await run(id, () =>
          prisma.contentSource.updateMany({ where: { id, tenantId }, data: { archivedAt: new Date(), enabled: false } }).then((u) => {
            if (u.count === 0) throw new Error("source_not_found");
            return { archived: true };
          }),
        );
        break;
      case "unarchive":
        await run(id, () =>
          prisma.contentSource.updateMany({ where: { id, tenantId }, data: { archivedAt: null } }).then((u) => {
            if (u.count === 0) throw new Error("source_not_found");
            return { archived: false };
          }),
        );
        break;
      case "delete":
        await run(id, async () => {
          const deleted = await prisma.contentSource.deleteMany({ where: { id, tenantId } });
          if (deleted.count === 0) {
            throw new Error("source_not_found");
          }
          return { deleted: true };
        });
        break;
      case "refresh":
        await run(id, () => fetchSourceNow(tenantId, id, { runKey: newRunKey("bulk") }));
        break;
      case "assign_category":
        await run(id, async () => {
          const source = await prisma.contentSource.findFirst({ where: { id, tenantId } });
          if (!source) {
            throw new Error("source_not_found");
          }
          const categories = Array.isArray(source.categories) ? (source.categories as string[]) : [];
          const merged = input.category && !categories.includes(input.category) ? [...categories, input.category] : categories;
          return prisma.contentSource.update({ where: { id }, data: { categories: merged as Prisma.InputJsonValue } });
        });
        break;
      case "assign_site":
        await run(id, async () => {
          const updated = await prisma.contentSource.updateMany({ where: { id, tenantId }, data: { siteId: input.siteId ?? null } });
          if (updated.count === 0) {
            throw new Error("source_not_found");
          }
          return { siteId: input.siteId ?? null };
        });
        break;
      case "assign_language":
        if (!input.language) {
          throw new Error("language_required");
        }
        await run(id, () =>
          prisma.contentSource.updateMany({ where: { id, tenantId }, data: { language: input.language } }).then((u) => {
            if (u.count === 0) throw new Error("source_not_found");
            return { language: input.language };
          }),
        );
        break;
      case "set_refresh_interval":
        if (!input.refreshIntervalMinutes) {
          throw new Error("refresh_interval_required");
        }
        await run(id, () =>
          prisma.contentSource
            .updateMany({
              where: { id, tenantId },
              data: { refreshIntervalMinutes: input.refreshIntervalMinutes },
            })
            .then((u) => {
              if (u.count === 0) throw new Error("source_not_found");
              return { refreshIntervalMinutes: input.refreshIntervalMinutes };
            }),
        );
        break;
      case "verify":
        await run(id, () => verifySource(tenantId, id));
        break;
      default:
        throw new Error("unsupported_bulk_action");
    }
    if (input.action === "refresh" && result.succeeded + result.failed >= MAX_BULK_REFRESH) {
      break;
    }
  }

  await writeAudit({
    tenantId,
    action: "sources.bulk",
    entityType: "content_source",
    entityId: "bulk",
    actorType: "user",
    metadata: { action: input.action, total: ids.length, succeeded: result.succeeded, failed: result.failed },
  });

  return result;
}

// ────────────────────────────────────────────────────────────── Verification

export async function verifySource(tenantId: string, sourceId: string) {
  const source = await prisma.contentSource.findFirst({ where: { id: sourceId, tenantId } });
  if (!source) {
    throw new Error("source_not_found");
  }
  const adapter = getSourceAdapter(source.type);
  const started = Date.now();
  let ok = false;
  let error: string | null = null;
  let status: number | null = null;
  let itemCount: number | null = null;
  try {
    if (adapter.healthCheck) {
      const health = await adapter.healthCheck(source, { runId: newRunKey("verify"), tenantId, limits: {} });
      ok = health.ok;
      status = health.status;
      itemCount = health.itemCount;
      error = health.error;
    } else {
      const items = await testSourceFetch(tenantId, {
        type: source.type,
        url: source.url,
        configuration: source.configuration as Record<string, unknown> | null,
      });
      ok = items.ok;
      itemCount = items.itemCount;
    }
  } catch (cause) {
    error = cause instanceof Error ? cause.message : String(cause);
  }

  const verificationStatus = ok ? "verified" : "failed";
  const updated = await prisma.contentSource.update({
    where: { id: source.id },
    data: {
      verifiedAt: ok ? new Date() : null,
      verificationStatus,
      lastError: ok ? null : error,
      lastErrorAt: ok ? null : new Date(),
    },
  });
  await writeAudit({
    tenantId,
    action: "source.verified",
    entityType: "content_source",
    entityId: source.id,
    actorType: "user",
    metadata: { ok, status, error },
  });
  return { id: source.id, ok, status, itemCount, latencyMs: Date.now() - started, error, verificationStatus: updated.verificationStatus };
}

export async function markSourceUnsupported(tenantId: string, sourceId: string, note: string) {
  const source = await prisma.contentSource.findFirst({ where: { id: sourceId, tenantId } });
  if (!source) {
    return null;
  }
  return prisma.contentSource.update({
    where: { id: source.id },
    data: { verificationStatus: "unsupported", restrictionsNote: note, enabled: false },
  });
}

// ────────────────────────────────────────────────────────────── Runs

export async function listSourceRuns(tenantId: string, sourceId: string, input: { page: number; pageSize: number }) {
  const skip = (input.page - 1) * input.pageSize;
  const [total, runs] = await prisma.$transaction([
    prisma.discoveryRun.count({ where: { tenantId, sourceId } }),
    prisma.discoveryRun.findMany({
      where: { tenantId, sourceId },
      orderBy: { startedAt: "desc" },
      skip,
      take: input.pageSize,
    }),
  ]);
  return { items: runs, page: input.page, pageSize: input.pageSize, total };
}

// ────────────────────────────────────────────────────────────── Health UI state

export type SourceUiHealth =
  | "healthy"
  | "delayed"
  | "degraded"
  | "rate_limited"
  | "broken"
  | "disabled"
  | "archived"
  | "unknown";

/** Concise UI health state from a source + its health row. Pure — tests. */
export function computeSourceUiHealth(input: {
  enabled: boolean;
  archivedAt: Date | null;
  healthStatus: string | null;
  circuitState: string | null;
  lastFetchedAt: Date | null;
  lastSuccessAt: Date | null;
  refreshIntervalMinutes: number;
  rateLimitEvents: number;
  consecutiveFailures: number;
  lastError: string | null;
  now?: Date;
}): { state: SourceUiHealth; diagnostics: string[] } {
  const now = input.now ?? new Date();
  const diagnostics: string[] = [];

  if (input.archivedAt) {
    return { state: "archived", diagnostics: ["Source archived"] };
  }
  if (!input.enabled) {
    return { state: "disabled", diagnostics: ["Source disabled"] };
  }
  if (input.lastFetchedAt === null) {
    return { state: "unknown", diagnostics: ["Never fetched"] };
  }
  if (input.circuitState === "open") {
    diagnostics.push("Circuit breaker open");
  }
  if (input.rateLimitEvents > 0 && input.lastError && /429|rate.?limit/i.test(input.lastError)) {
    diagnostics.push(`Rate limited by publisher (${input.rateLimitEvents} events)`);
    return { state: "rate_limited", diagnostics };
  }
  const failedRecently = input.consecutiveFailures >= 5;
  if (failedRecently) {
    return { state: "broken", diagnostics: [...diagnostics, `${input.consecutiveFailures} consecutive failures`, input.lastError ? truncateDiagnostic(input.lastError) : "No error detail"] };
  }
  if (input.healthStatus === "failing") {
    return { state: "broken", diagnostics: [...diagnostics, "Health: failing"] };
  }
  const refreshMs = Math.max(5, input.refreshIntervalMinutes) * 60_000;
  const sinceFetch = now.getTime() - input.lastFetchedAt.getTime();
  if (input.lastSuccessAt && sinceFetch > refreshMs * 2) {
    diagnostics.push(`Last fetch ${Math.round(sinceFetch / 60_000)} min ago (interval ${input.refreshIntervalMinutes} min)`);
    if (input.healthStatus === "degraded" || input.consecutiveFailures >= 1) {
      return { state: "degraded", diagnostics: [...diagnostics, `${input.consecutiveFailures} recent failure(s)`] };
    }
    return { state: "delayed", diagnostics };
  }
  if (input.healthStatus === "degraded" || input.consecutiveFailures >= 1) {
    diagnostics.push(`${input.consecutiveFailures} recent failure(s)`);
    return { state: "degraded", diagnostics };
  }
  if (input.healthStatus === "healthy") {
    return { state: "healthy", diagnostics };
  }
  return { state: "unknown", diagnostics };
}

function truncateDiagnostic(message: string): string {
  const clean = message.replace(/\s+/g, " ").trim();
  return clean.length > 140 ? `${clean.slice(0, 140)}…` : clean;
}

export async function listSourcesWithHealth(tenantId: string, input: { page: number; pageSize: number; includeArchived?: boolean }) {
  const skip = (input.page - 1) * input.pageSize;
  const where: Prisma.ContentSourceWhereInput = {
    tenantId,
    ...(input.includeArchived ? {} : { archivedAt: null }),
  };
  const [total, sources] = await prisma.$transaction([
    prisma.contentSource.count({ where }),
    prisma.contentSource.findMany({
      where,
      orderBy: [{ priority: "desc" }, { name: "asc" }],
      skip,
      take: input.pageSize,
      include: {
        health: true,
        _count: { select: { items: true } },
        site: { select: { id: true, name: true, key: true } },
      },
    }),
  ]);

  return {
    items: sources.map((source) => {
      const uiHealth = computeSourceUiHealth({
        enabled: source.enabled,
        archivedAt: source.archivedAt,
        healthStatus: source.health?.healthStatus ?? null,
        circuitState: source.health?.circuitState ?? null,
        lastFetchedAt: source.lastFetchedAt,
        lastSuccessAt: source.lastSuccessAt,
        refreshIntervalMinutes: source.refreshIntervalMinutes,
        rateLimitEvents: source.health?.rateLimitEvents ?? 0,
        consecutiveFailures: source.consecutiveFailures,
        lastError: source.lastError ?? source.health?.lastError ?? null,
      });
      return sanitizeSourceForClient({
        ...source,
        discoveredCount: source._count.items,
        uiHealth,
        lastNewItemAt: source.health?.lastNewItemAt ?? null,
      });
    }),
    page: input.page,
    pageSize: input.pageSize,
    total,
  };
}

// ────────────────────────────────────────────────────────────── Provenance

export { buildProvenance };
export type { ProvenanceRecord } from "./provenance";

/** Get the health row for a source (re-export for route convenience). */
export { getSourceHealth };
