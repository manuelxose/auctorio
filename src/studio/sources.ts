// Source management service: creation, discovery orchestration, upsert with
// multi-signal deduplication, health tracking and run tracing.
//
// Adapters live in ./adapters (registry + contract); this module is the
// business-facing façade and keeps compatibility exports for older callers.

import { Prisma } from "@prisma/client";
import type { ContentSource, ContentSourceType, SourceItemStatus } from "@prisma/client";
import { getPrismaClient } from "../infrastructure/db/prisma";
import { scoreAndPromoteSourceItem } from "./editorial";
import { writeAudit } from "./audit";
import type { PaginatedResult } from "./types";
import type { DiscoveredSourceItem, DiscoveryContext, SourceAdapter } from "./adapters/types";
import {
  buildCanonicalUrlHash,
  buildItemContentHash,
  buildNormalizedTitleHash,
  deriveExternalId,
  normalizeCanonicalUrl,
  stripHtmlToText,
} from "./adapters/normalize";
import { getSourceAdapter } from "./adapters/registry";
import { extractListingItems, type ListingSourceConfig } from "./adapters/htmllist";
import { parseImdbTsvLines, type ImdbDatasetOptions } from "./adapters/imdb";
import { evaluateDedup } from "./deduplication";
import { getSourceBreaker, recordFetchOutcome } from "./source-health";
import { SourceRateLimiter, type SourceRateLimitPolicy } from "./resilience/limiter";
import { SourceHttpError } from "./adapters/http";
import { beginDiscoveryRun, failDiscoveryRun, finishDiscoveryRun, logDiscoveryEvent, newRunKey, skipDiscoveryRun } from "./discovery-run";
import { buildProvenance, mergeProvenance } from "./provenance";
import { getNumberEnv } from "../shared/utils/env";
import { runIntelligencePipelineForItem, mergeCountersIntoDiscoveryRun } from "./intelligence/pipeline";
import { getIntelligenceSettings } from "./intelligence/intelligence-settings";
import { createLevelBudget, createCostCounters, mergeCostCounters } from "./intelligence/cost-control";

const prisma = getPrismaClient();
const sourceRateLimiter = new SourceRateLimiter();

// ── Compatibility exports (previous module layout)

export { extractListingItems, parseImdbTsvLines };
export { getSourceAdapter, registerSourceAdapter } from "./adapters/registry";
export {
  buildCanonicalUrlHash,
  buildItemContentHash,
  buildNormalizedTitleHash,
  deriveExternalId,
  normalizeCanonicalUrl,
  normalizeTitleForFingerprint,
  stripHtmlToText,
} from "./adapters/normalize";
export type { ListingSourceConfig, ImdbDatasetOptions };
export type { SourceAdapter, DiscoveredSourceItem, DiscoveryContext, SourceDocument, SourceHealthCheck } from "./adapters/types";

/** Back-compat alias: the legacy parsed-item shape is the normalized item. */
export type ParsedSourceItem = DiscoveredSourceItem;

// ────────────────────────────────────────────────────────────── Sources

export type CreateSourceInput = {
  siteId?: string | null;
  name: string;
  type: ContentSourceType;
  url?: string | null;
  domain?: string | null;
  endpoint?: string | null;
  enabled?: boolean;
  priority?: number;
  trustScore?: number;
  authorityScore?: number;
  freshnessWeight?: number;
  language?: string;
  country?: string | null;
  timezone?: string | null;
  categories?: string[] | null;
  tags?: string[] | null;
  credentialsRef?: string | null;
  refreshIntervalMinutes?: number;
  rateLimitPolicy?: Record<string, unknown> | null;
  robotsPolicy?: Record<string, unknown> | null;
  extractionPolicy?: Record<string, unknown> | null;
  enrichmentPolicy?: Record<string, unknown> | null;
  copyrightPolicy?: Record<string, unknown> | null;
  configuration?: Record<string, unknown> | null;
  packKey?: string | null;
  discoveryMethod?: string | null;
  restrictionsNote?: string | null;
  verificationStatus?: string | null;
  archivedAt?: Date | null;
};

export type UpdateSourceInput = Partial<CreateSourceInput>;

function jsonOrNull(value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  return value ? (value as Prisma.InputJsonValue) : Prisma.JsonNull;
}

export async function createSource(tenantId: string, input: CreateSourceInput) {
  const source = await prisma.contentSource.create({
    data: {
      tenantId,
      siteId: input.siteId ?? null,
      name: input.name,
      type: input.type,
      url: input.url ?? null,
      domain: input.domain ?? deriveDomain(input.url),
      endpoint: input.endpoint ?? null,
      enabled: input.enabled ?? true,
      priority: input.priority ?? 0,
      trustScore: input.trustScore ?? 0.5,
      authorityScore: input.authorityScore ?? 0.5,
      freshnessWeight: input.freshnessWeight ?? 1.0,
      language: input.language ?? "es",
      country: input.country ?? null,
      timezone: input.timezone ?? null,
      categories: jsonOrNull(input.categories),
      tags: jsonOrNull(input.tags),
      credentialsRef: input.credentialsRef ?? null,
      refreshIntervalMinutes: input.refreshIntervalMinutes ?? 30,
      rateLimitPolicy: jsonOrNull(input.rateLimitPolicy),
      robotsPolicy: jsonOrNull(input.robotsPolicy),
      extractionPolicy: jsonOrNull(input.extractionPolicy),
      enrichmentPolicy: jsonOrNull(input.enrichmentPolicy),
      copyrightPolicy: jsonOrNull(input.copyrightPolicy),
      configuration: jsonOrNull(input.configuration),
      packKey: input.packKey ?? null,
      discoveryMethod: input.discoveryMethod ?? null,
      restrictionsNote: input.restrictionsNote ?? null,
      verificationStatus: input.verificationStatus ?? "unverified",
      archivedAt: input.archivedAt ?? null,
    },
  });

  await writeAudit({
    tenantId,
    action: "source.created",
    entityType: "content_source",
    entityId: source.id,
    actorType: "user",
    metadata: { name: source.name, type: source.type, url: source.url },
  });

  return source;
}

function deriveDomain(url: string | null | undefined): string | null {
  if (!url) {
    return null;
  }
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** Redact secret-shaped configuration keys (headers/auth blocks) in a source
 *  configuration before it is returned to the browser. */
export function redactSourceConfiguration(configuration: unknown): Record<string, unknown> {
  if (!configuration || typeof configuration !== "object" || Array.isArray(configuration)) {
    return configuration as Record<string, unknown>;
  }
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(configuration as Record<string, unknown>)) {
    if (key.toLowerCase() === "headers" && value && typeof value === "object") {
      out[key] = Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([headerKey]) => [headerKey, "[redacted]"]),
      );
    } else if (/(authorization|bearer|token|secret|api_?key|password|credential)/i.test(key)) {
      out[key] = "[redacted]";
    } else {
      out[key] = value;
    }
  }
  return out;
}

/** Remove credential references and redact configuration before a source row
 *  leaves the server. API keys are never returned to the browser. */
export function sanitizeSourceForClient<T>(source: T): T {
  if (!source || typeof source !== "object") {
    return source;
  }
  const record: Record<string, unknown> = { ...(source as Record<string, unknown>) };
  delete record.credentialsRef;
  if (record.configuration && typeof record.configuration === "object") {
    record.configuration = redactSourceConfiguration(record.configuration);
  }
  return record as unknown as T;
}

export async function updateSource(tenantId: string, sourceId: string, input: UpdateSourceInput) {
  const existing = await prisma.contentSource.findFirst({ where: { id: sourceId, tenantId } });
  if (!existing) {
    return null;
  }

  const updated = await prisma.contentSource.update({
    where: { id: existing.id },
    data: {
      siteId: input.siteId === undefined ? undefined : input.siteId,
      name: input.name?.trim() || undefined,
      type: input.type,
      url: input.url === undefined ? undefined : input.url,
      domain: input.domain === undefined ? undefined : input.domain,
      endpoint: input.endpoint === undefined ? undefined : input.endpoint,
      enabled: input.enabled,
      priority: input.priority,
      trustScore: input.trustScore,
      authorityScore: input.authorityScore,
      freshnessWeight: input.freshnessWeight,
      language: input.language,
      country: input.country === undefined ? undefined : input.country,
      timezone: input.timezone === undefined ? undefined : input.timezone,
      categories: input.categories === undefined ? undefined : jsonOrNull(input.categories),
      tags: input.tags === undefined ? undefined : jsonOrNull(input.tags),
      credentialsRef: input.credentialsRef === undefined ? undefined : input.credentialsRef,
      refreshIntervalMinutes: input.refreshIntervalMinutes,
      rateLimitPolicy: input.rateLimitPolicy === undefined ? undefined : jsonOrNull(input.rateLimitPolicy),
      robotsPolicy: input.robotsPolicy === undefined ? undefined : jsonOrNull(input.robotsPolicy),
      extractionPolicy: input.extractionPolicy === undefined ? undefined : jsonOrNull(input.extractionPolicy),
      enrichmentPolicy: input.enrichmentPolicy === undefined ? undefined : jsonOrNull(input.enrichmentPolicy),
      copyrightPolicy: input.copyrightPolicy === undefined ? undefined : jsonOrNull(input.copyrightPolicy),
      configuration: input.configuration === undefined ? undefined : jsonOrNull(input.configuration),
      packKey: input.packKey === undefined ? undefined : input.packKey,
      discoveryMethod: input.discoveryMethod === undefined ? undefined : input.discoveryMethod,
      restrictionsNote: input.restrictionsNote === undefined ? undefined : input.restrictionsNote,
      verificationStatus: input.verificationStatus === undefined ? undefined : input.verificationStatus,
      archivedAt: input.archivedAt === undefined ? undefined : input.archivedAt,
    },
  });

  await writeAudit({
    tenantId,
    action: "source.updated",
    entityType: "content_source",
    entityId: sourceId,
    actorType: "user",
  });

  return updated;
}

export async function deleteSource(tenantId: string, sourceId: string) {
  const existing = await prisma.contentSource.findFirst({ where: { id: sourceId, tenantId } });
  if (!existing) {
    return false;
  }
  await prisma.contentSource.delete({ where: { id: existing.id } });
  await writeAudit({
    tenantId,
    action: "source.deleted",
    entityType: "content_source",
    entityId: sourceId,
    actorType: "user",
    metadata: { name: existing.name },
  });
  return true;
}

export async function getSource(tenantId: string, sourceId: string) {
  const source = await prisma.contentSource.findFirst({
    where: { id: sourceId, tenantId },
    include: {
      site: { select: { id: true, name: true, key: true } },
      health: true,
    },
  });
  return source ? sanitizeSourceForClient(source) : null;
}

export async function listSources(
  tenantId: string,
  input: { page: number; pageSize: number; type?: string; enabled?: boolean },
): Promise<PaginatedResult<unknown>> {
  const skip = (input.page - 1) * input.pageSize;
  const where: Prisma.ContentSourceWhereInput = {
    tenantId,
    ...(input.type ? { type: input.type as ContentSourceType } : {}),
    ...(input.enabled === undefined ? {} : { enabled: input.enabled }),
  };

  const [total, sources] = await prisma.$transaction([
    prisma.contentSource.count({ where }),
    prisma.contentSource.findMany({
      where,
      orderBy: [{ priority: "desc" }, { name: "asc" }],
      skip,
      take: input.pageSize,
      include: {
        _count: { select: { items: true } },
        site: { select: { id: true, name: true, key: true } },
        health: true,
      },
    }),
  ]);

  return {
    items: sources.map((source) =>
      sanitizeSourceForClient({
        ...source,
        discoveredCount: source._count.items,
        site: source.site,
      }),
    ),
    page: input.page,
    pageSize: input.pageSize,
    total,
  };
}

export async function listDueSources(tenantId: string, now: Date = new Date()) {
  const sources = await prisma.contentSource.findMany({
    where: {
      tenantId,
      enabled: true,
      type: { notIn: ["manual", "webhook"] },
      OR: [
        { lastFetchedAt: null },
        { lastFetchedAt: { lte: new Date(now.getTime() - 60_000) } },
      ],
    },
    orderBy: { priority: "desc" },
  });

  const due = sources.filter((source) => {
    if (!source.lastFetchedAt) {
      return true;
    }
    const intervalMs = Math.max(5, source.refreshIntervalMinutes) * 60_000;
    return now.getTime() - source.lastFetchedAt.getTime() >= intervalMs;
  });

  // A broken publisher must never destabilize discovery for others: sources
  // with an open circuit breaker are skipped until the cooldown allows a
  // half-open probe.
  const skippable = await Promise.all(
    due.map(async (source) => {
      const breaker = getSourceBreaker(tenantId, source.id, source.configuration);
      const canAttempt = await breaker.canAttempt(`${tenantId}:${source.id}`);
      return { source, canAttempt };
    }),
  );
  return skippable.filter(({ canAttempt }) => canAttempt).map(({ source }) => source);
}

// ────────────────────────────────────────────────────────────── Upsert

export type UpsertSourceItemResult = {
  created: boolean;
  updated: boolean;
  sourceItemId: string | null;
  dedupReason: string | null;
  clusterLinkId: string | null;
};

export async function upsertSourceItem(
  tenantId: string,
  sourceId: string,
  item: DiscoveredSourceItem,
  options: {
    discoveryRunId?: string | null;
    /** Publisher identity for the provenance chain (avoids a per-item query). */
    sourceInfo?: { name: string; domain: string | null; url: string | null };
  } = {},
): Promise<UpsertSourceItemResult> {
  const contentHash = buildItemContentHash(item.title, item.cleanedText ?? item.description);
  const normalizedTitleHash = buildNormalizedTitleHash(item.title);
  const canonicalUrlHash = buildCanonicalUrlHash(item.canonicalUrl ?? item.sourceUrl);

  const sourceInfo = options.sourceInfo ?? (await prisma.contentSource.findFirst({
    where: { id: sourceId, tenantId },
    select: { name: true, domain: true, url: true },
  }));
  const provenance = sourceInfo
    ? buildProvenance(sourceInfo, item)
    : null;

  const decision = await evaluateDedup({
    tenantId,
    sourceId,
    item,
    contentHash,
    normalizedTitleHash,
    canonicalUrlHash,
  });

  if (decision.outcome === "duplicate") {
    const existingId = decision.sourceItemId;
    if (decision.updated && existingId) {
      // Developing story: same identity, changed content. Rewrite the item so
      // it re-enters scoring and bump the cluster update counter.
      const existing = await prisma.sourceItem.findUnique({ where: { id: existingId } });
      if (existing) {
        const previousMetadata =
          existing.metadata && typeof existing.metadata === "object" && !Array.isArray(existing.metadata)
            ? (existing.metadata as Record<string, unknown>)
            : {};
        const updated = await prisma.sourceItem.update({
          where: { id: existingId },
          data: {
            title: item.title.slice(0, 400),
            description: item.description,
            rawText: item.rawText,
            cleanedText: item.cleanedText,
            author: item.author,
            canonicalUrl: item.canonicalUrl,
            sourceUrl: item.sourceUrl,
            ...(item.publishedAt ? { publishedAt: new Date(item.publishedAt) } : {}),
            ...(item.modifiedAt ? { modifiedAt: new Date(item.modifiedAt) } : {}),
            sourceImageUrls: item.sourceImageUrls.length ? (item.sourceImageUrls as Prisma.InputJsonValue) : Prisma.JsonNull,
            language: item.language,
            categories: item.categories.length ? (item.categories as Prisma.InputJsonValue) : Prisma.JsonNull,
            contentHash,
            normalizedTitleHash,
            canonicalUrlHash,
            confidence: item.confidence,
            attribution: provenance
              ? (mergeProvenance(
                  existing.attribution && typeof existing.attribution === "object" && !Array.isArray(existing.attribution)
                    ? (existing.attribution as Record<string, unknown>)
                    : item.attribution,
                  provenance,
                ) as Prisma.InputJsonValue)
              : item.attribution
                ? (item.attribution as Prisma.InputJsonValue)
                : undefined,
            extractionStatus: "updated",
            processingStatus: "parsed",
            updatedAt: new Date(),
            metadata: {
              ...previousMetadata,
              contentUpdatedAt: new Date().toISOString(),
              previousContentHash: existing.contentHash,
            } as Prisma.InputJsonObject,
          },
        });
        if (existing.clusterId) {
          const cluster = await prisma.storyCluster.findUnique({
            where: { id: existing.clusterId },
            select: { status: true },
          });
          if (cluster) {
            const newStatus =
              cluster.status === "selected" || cluster.status === "covered" ? "updated" : "developing";
            await prisma.storyCluster.update({
              where: { id: existing.clusterId },
              data: {
                updateCount: { increment: 1 },
                lastUpdateAt: new Date(),
                lastSeenAt: new Date(),
                status: newStatus,
              },
            });
          }
        }
        return { created: false, updated: true, sourceItemId: updated.id, dedupReason: decision.reason, clusterLinkId: null };
      }
    }
    return { created: false, updated: false, sourceItemId: existingId, dedupReason: decision.reason, clusterLinkId: null };
  }

  // NEW ITEM — "same story from another publisher" keeps the item and links it
  // to the existing story cluster (never discarded).
  const data: Prisma.SourceItemUncheckedCreateInput = {
    tenantId,
    sourceId,
    externalId: item.externalId,
    canonicalUrl: item.canonicalUrl,
    canonicalUrlHash,
    sourceUrl: item.sourceUrl,
    title: item.title.slice(0, 400),
    normalizedTitleHash,
    description: item.description,
    rawText: item.rawText,
    cleanedText: item.cleanedText,
    author: item.author,
    publishedAt: item.publishedAt ? new Date(item.publishedAt) : null,
    modifiedAt: item.modifiedAt ? new Date(item.modifiedAt) : null,
    sourceImageUrls: item.sourceImageUrls.length ? (item.sourceImageUrls as Prisma.InputJsonValue) : Prisma.JsonNull,
    language: item.language,
    categories: item.categories.length ? (item.categories as Prisma.InputJsonValue) : Prisma.JsonNull,
    contentHash,
    metadata: item.rawMetadata ? (item.rawMetadata as Prisma.InputJsonValue) : Prisma.JsonNull,
    attribution: provenance
      ? (mergeProvenance(item.attribution, provenance) as Prisma.InputJsonValue)
      : item.attribution
        ? (item.attribution as Prisma.InputJsonValue)
        : Prisma.JsonNull,
    confidence: item.confidence,
    extractionStatus: "normalized",
    clusterId: decision.clusterLinkId,
    discoveryRunId: options.discoveryRunId ?? null,
  };

  try {
    const created = await prisma.sourceItem.create({ data });
    return { created: true, updated: false, sourceItemId: created.id, dedupReason: decision.reason, clusterLinkId: decision.clusterLinkId };
  } catch (error) {
    // Concurrent insert race (unique source+externalId): treat as duplicate.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { created: false, updated: false, sourceItemId: null, dedupReason: "source_external_id", clusterLinkId: null };
    }
    throw error;
  }
}

// ────────────────────────────────────────────────────────────── Fetch

export type FetchSourceResult = {
  sourceId: string;
  runId: string;
  fetched: number;
  created: number;
  duplicates: number;
  clustersCreated: number;
  failed: boolean;
  skipped?: boolean;
  notModified?: boolean;
  error: string | null;
  circuitState?: string;
};

function resolveSourceRateLimitPolicy(policy: unknown): SourceRateLimitPolicy | null {
  if (!policy || typeof policy !== "object") {
    return null;
  }
  const record = policy as Record<string, unknown>;
  return {
    maxRequests: typeof record.maxRequestsPerMinute === "number" ? record.maxRequestsPerMinute : undefined,
    windowMs: 60_000,
    minIntervalMs: typeof record.minIntervalMs === "number" ? record.minIntervalMs : undefined,
  };
}

function isParseError(message: string): boolean {
  return /parse|invalid_json|missing_channel|xml|json/i.test(message);
}

export async function fetchSourceNow(
  tenantId: string,
  sourceId: string,
  options: { runKey?: string; signal?: AbortSignal } = {},
): Promise<FetchSourceResult> {
  const source = await prisma.contentSource.findFirst({ where: { id: sourceId, tenantId } });
  if (!source) {
    throw new Error("source_not_found");
  }

  const started = Date.now();
  const runKey = options.runKey ?? newRunKey("source");
  const runId = await beginDiscoveryRun({ tenantId, sourceId: source.id, adapterType: source.type, runKey });
  const counters = { itemsFound: 0, itemsCreated: 0, itemsDuplicated: 0, clustersCreated: 0, parseErrors: 0, sourceFailures: 0 };

  const result: FetchSourceResult = {
    sourceId,
    runId,
    fetched: 0,
    created: 0,
    duplicates: 0,
    clustersCreated: 0,
    failed: false,
    error: null,
  };

  const breakerKey = `${tenantId}:${source.id}`;
  const breaker = getSourceBreaker(tenantId, source.id, source.configuration);
  result.circuitState = await breaker.state(breakerKey);

  // Circuit breaker gate: a broken publisher is skipped until cooldown.
  if (!(await breaker.canAttempt(breakerKey))) {
    result.skipped = true;
    result.error = "circuit_open";
    logDiscoveryEvent(runId, "source.discovery.circuit_open", { sourceId: source.id, sourceName: source.name }, "warn");
    await skipDiscoveryRun(runId, counters, "circuit_open");
    return result;
  }

  // Per-source rate limiting (configured via rateLimitPolicy).
  const ratePolicy = resolveSourceRateLimitPolicy(source.rateLimitPolicy);
  const rateOk = await sourceRateLimiter.waitForSlot(source.id, ratePolicy, getNumberEnv("SOURCE_RATE_LIMIT_WAIT_MS", 30_000));
  if (!rateOk) {
    result.skipped = true;
    result.error = "rate_limited";
    logDiscoveryEvent(runId, "source.discovery.rate_limited", { sourceId: source.id, sourceName: source.name }, "warn");
    await recordFetchOutcome(
      tenantId,
      source.id,
      {
        ok: false,
        latencyMs: Date.now() - started,
        httpStatus: null,
        itemsFound: 0,
        itemsCreated: 0,
        duplicates: 0,
        parseError: false,
        emptyFeed: false,
        rateLimited: true,
        notModified: false,
        consecutiveFailures: source.consecutiveFailures,
        error: "rate_limited",
      },
      source.configuration,
    );
    await skipDiscoveryRun(runId, counters, "rate_limited");
    return result;
  }

  const context: DiscoveryContext = {
    runId: runKey,
    tenantId,
    limits: {},
    signal: options.signal,
  };

  try {
    const adapter = getSourceAdapter(source.type);
    logDiscoveryEvent(runId, "source.discovery.started", { sourceId: source.id, sourceName: source.name, adapterType: source.type });
    const items = await adapter.discover(source, context);
    counters.itemsFound = items.length;
    result.fetched = items.length;

    // Conditional request: HTTP 304 means the publisher confirmed nothing
    // changed — record it without re-downloading or re-processing the feed.
    const observed = context.observed;
    if (observed?.notModified) {
      result.notModified = true;
      await prisma.contentSource.update({
        where: { id: source.id },
        data: {
          lastFetchedAt: new Date(),
          consecutiveFailures: 0,
          notModifiedCount: { increment: 1 },
          ...(observed.etag ? { lastEtag: observed.etag } : {}),
          lastHttpStatus: 304,
          lastError: null,
          lastErrorAt: null,
        },
      });
      await recordFetchOutcome(
        tenantId,
        source.id,
        {
          ok: true,
          latencyMs: Date.now() - started,
          httpStatus: 304,
          itemsFound: 0,
          itemsCreated: 0,
          duplicates: 0,
          parseError: false,
          emptyFeed: false,
          rateLimited: false,
          notModified: true,
          consecutiveFailures: 0,
          error: null,
        },
        source.configuration,
      );
      await finishDiscoveryRun(runId, counters, { notModified: true });
      logDiscoveryEvent(runId, "source.discovery.not_modified", { sourceId: source.id, sourceName: source.name });
      return result;
    }

    const processedIds: string[] = [];
    const sourceInfo = { name: source.name, domain: source.domain, url: source.url };
    for (const item of items) {
      const upserted = await upsertSourceItem(tenantId, source.id, item, { discoveryRunId: runId, sourceInfo });
      if (upserted.created) {
        result.created += 1;
        counters.itemsCreated += 1;
        if (upserted.sourceItemId) {
          processedIds.push(upserted.sourceItemId);
        }
      } else if (upserted.updated) {
        // A previously covered story changed: re-score the updated item.
        counters.itemsCreated += 1;
        if (upserted.sourceItemId) {
          processedIds.push(upserted.sourceItemId);
        }
      } else {
        result.duplicates += 1;
        counters.itemsDuplicated += 1;
      }
    }

    const updatedSource = await prisma.contentSource.update({
      where: { id: source.id },
      data: {
        lastFetchedAt: new Date(),
        lastSuccessAt: new Date(),
        lastDiscoveryAt: new Date(),
        consecutiveFailures: 0,
        lastError: null,
        lastErrorAt: null,
        ...(observed?.etag !== undefined && observed?.etag !== null ? { lastEtag: observed.etag } : {}),
        ...(observed?.lastModified !== undefined && observed?.lastModified !== null ? { lastModifiedHeader: observed.lastModified } : {}),
        ...(observed?.status !== undefined && observed?.status !== null ? { lastHttpStatus: observed.status } : {}),
      },
    });

    // Score, cluster and promote freshly discovered items immediately so the
    // inbox is useful right after a fetch.
    const contextScore = { sourceTrustScore: source.trustScore, sourcePriority: source.priority };
    for (const itemId of processedIds) {
      const item = await prisma.sourceItem.findFirst({ where: { id: itemId, tenantId } });
      if (!item) {
        continue;
      }
      try {
        const scored = await scoreAndPromoteSourceItem(tenantId, item, contextScore);
        if (scored.clusterCreated) {
          counters.clustersCreated += 1;
        }
      } catch (error) {
        counters.parseErrors += 1;
        result.error = error instanceof Error ? error.message : String(error);
        logDiscoveryEvent(runId, "source.discovery.scoring_failed", { itemId, error: result.error }, "warn");
      }
    }
    result.clustersCreated = counters.clustersCreated;

    // Phase 3: intelligence pipeline for candidate items (entities, facts,
    // verification, enrichment, transparent candidate scoring). One shared
    // budget per run caps provider and AI calls.
    const intelligenceSettings = await getIntelligenceSettings(tenantId).catch(() => null);
    const intelligenceBudget = createLevelBudget(intelligenceSettings?.levelPolicy);
    const runCounters = createCostCounters();
    for (const itemId of processedIds) {
      const item = await prisma.sourceItem.findFirst({
        where: { id: itemId, tenantId },
        select: { score: true, processingStatus: true, intelligenceProcessedAt: true },
      });
      if (!item || item.intelligenceProcessedAt || (item.score ?? 0) < 0.4) {
        continue;
      }
      try {
        const pipelineResult = await runIntelligencePipelineForItem(tenantId, itemId, { budget: intelligenceBudget });
        mergeCostCounters(runCounters, pipelineResult.counters);
      } catch (error) {
        logDiscoveryEvent(
          runId,
          "source.discovery.intelligence_failed",
          { itemId, error: error instanceof Error ? error.message : String(error) },
          "warn",
        );
      }
    }
    if (runCounters.itemsSeen > 0) {
      await mergeCountersIntoDiscoveryRun(runId, runCounters).catch(() => undefined);
    }
    logDiscoveryEvent(runId, "source.discovery.intelligence", {
      itemsSeen: runCounters.itemsSeen,
      aiCalls: runCounters.aiCalls,
      enrichmentCalls: runCounters.enrichmentCalls,
      cacheHits: runCounters.cacheHits,
    });

    await recordFetchOutcome(
      tenantId,
      source.id,
      {
        ok: true,
        latencyMs: Date.now() - started,
        httpStatus: observed?.status ?? null,
        itemsFound: counters.itemsFound,
        itemsCreated: result.created,
        duplicates: result.duplicates,
        parseError: false,
        emptyFeed: counters.itemsFound === 0,
        rateLimited: false,
        notModified: false,
        consecutiveFailures: updatedSource.consecutiveFailures,
        error: null,
      },
      source.configuration,
    );
    await finishDiscoveryRun(runId, counters);
    logDiscoveryEvent(runId, "source.discovery.completed", { sourceId: source.id, sourceName: source.name, ...counters });

    await writeAudit({
      tenantId,
      action: "source.fetched",
      entityType: "content_source",
      entityId: source.id,
      actorType: source.enabled ? "automation" : "user",
      metadata: { created: result.created, duplicates: result.duplicates, runId: runKey },
    });
  } catch (error) {
    result.failed = true;
    result.error = error instanceof Error ? error.message : String(error);
    const parseError = isParseError(result.error);
    const httpError = error instanceof SourceHttpError ? error : null;
    const isRateLimited = httpError?.status === 429;
    if (parseError) {
      counters.parseErrors += 1;
    }
    const updatedSource = await prisma.contentSource.update({
      where: { id: source.id },
      data: {
        lastFetchedAt: new Date(),
        consecutiveFailures: { increment: 1 },
        lastError: result.error.slice(0, 500),
        lastErrorAt: new Date(),
        ...(httpError?.status ? { lastHttpStatus: httpError.status } : {}),
      },
    });
    await recordFetchOutcome(
      tenantId,
      source.id,
      {
        ok: false,
        latencyMs: Date.now() - started,
        httpStatus: httpError?.status ?? null,
        itemsFound: counters.itemsFound,
        itemsCreated: result.created,
        duplicates: result.duplicates,
        parseError,
        emptyFeed: false,
        rateLimited: isRateLimited,
        notModified: false,
        consecutiveFailures: updatedSource.consecutiveFailures,
        error: result.error,
      },
      source.configuration,
    );
    await failDiscoveryRun(runId, counters, result.error);
    logDiscoveryEvent(runId, "source.discovery.failed", { sourceId: source.id, sourceName: source.name, error: result.error }, "error");
  }

  return result;
}

export async function testSourceFetch(
  tenantId: string,
  input: { type: ContentSourceType; url?: string | null; configuration?: Record<string, unknown> | null },
) {
  const adapter = getSourceAdapter(input.type);
  const items = await adapter.discover(
    {
      id: "test",
      type: input.type,
      url: input.url ?? null,
      endpoint: null,
      configuration: (input.configuration ?? null) as Prisma.JsonValue,
      rateLimitPolicy: null,
      robotsPolicy: null,
      extractionPolicy: null,
      timezone: null,
      language: "es",
      domain: null,
      lastEtag: null,
      lastModifiedHeader: null,
    },
    { runId: newRunKey("test"), tenantId, limits: {} },
  );
  // Never leak raw payloads to the Studio: return a sanitized sample only.
  const sample = items.slice(0, 3).map((item) => ({
    title: item.title,
    canonicalUrl: item.canonicalUrl,
    description: item.description,
    publishedAt: item.publishedAt,
    language: item.language,
    categories: item.categories,
    confidence: item.confidence,
  }));
  return { ok: true, itemCount: items.length, sample };
}

// ────────────────────────────────────────────────────────────── Source items

export async function listSourceItems(
  tenantId: string,
  input: {
    page: number;
    pageSize: number;
    sourceId?: string;
    status?: SourceItemStatus;
    clusterId?: string;
    search?: string;
    minScore?: number;
    sort?: "discovered" | "score";
    direction?: "asc" | "desc";
  },
): Promise<PaginatedResult<unknown>> {
  const skip = (input.page - 1) * input.pageSize;
  const where: Prisma.SourceItemWhereInput = {
    tenantId,
    ...(input.sourceId ? { sourceId: input.sourceId } : {}),
    ...(input.status ? { processingStatus: input.status } : {}),
    ...(input.clusterId ? { clusterId: input.clusterId } : {}),
    ...(input.minScore !== undefined ? { score: { gte: input.minScore } } : {}),
    ...(input.search
      ? {
          OR: [
            { title: { contains: input.search, mode: "insensitive" } },
            { description: { contains: input.search, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const orderBy: Prisma.SourceItemOrderByWithRelationInput[] =
    input.sort === "score"
      ? [{ score: input.direction === "asc" ? "asc" : "desc" }, { discoveredAt: "desc" }]
      : [{ discoveredAt: input.direction === "asc" ? "asc" : "desc" }];

  const [total, items] = await prisma.$transaction([
    prisma.sourceItem.count({ where }),
    prisma.sourceItem.findMany({
      where,
      orderBy,
      skip,
      take: input.pageSize,
      include: {
        source: { select: { id: true, name: true, type: true, trustScore: true } },
        cluster: { select: { id: true, headline: true, sourceCount: true } },
        projects: { select: { id: true, title: true, status: true } },
        webRetrievals: {
          select: { id: true, provider: true, retrievedAt: true },
          orderBy: { retrievedAt: "desc" },
          take: 1,
        },
      },
    }),
  ]);

  return {
    items: items.map((item) => ({
      id: item.id,
      sourceId: item.sourceId,
      clusterId: item.clusterId,
      externalId: item.externalId,
      canonicalUrl: item.canonicalUrl,
      sourceUrl: item.sourceUrl,
      title: item.title,
      description: item.description,
      author: item.author,
      publishedAt: item.publishedAt,
      discoveredAt: item.discoveredAt,
      sourceImageUrls: item.sourceImageUrls,
      language: item.language,
      categories: item.categories,
      processingStatus: item.processingStatus,
      extractionStatus: item.extractionStatus,
      confidence: item.confidence,
      score: item.score,
      scoreExplanation: item.scoreExplanation,
      source: item.source,
      cluster: item.cluster,
      projects: item.projects,
      projectCount: item.projects.length,
      retrieval: item.webRetrievals[0] ?? null,
    })),
    page: input.page,
    pageSize: input.pageSize,
    total,
  };
}

export async function getSourceItemDetail(tenantId: string, itemId: string) {
  return prisma.sourceItem.findFirst({
    where: { id: itemId, tenantId },
    include: {
      source: true,
      cluster: {
        include: {
          items: {
            orderBy: { discoveredAt: "asc" },
            include: { source: { select: { id: true, name: true, type: true, trustScore: true } } },
          },
        },
      },
      projects: { select: { id: true, title: true, status: true, site: { select: { id: true, key: true, name: true } } } },
    },
  });
}

export async function setSourceItemStatus(
  tenantId: string,
  itemId: string,
  status: SourceItemStatus,
  actor: { userId?: string | null } = {},
) {
  const item = await prisma.sourceItem.findFirst({ where: { id: itemId, tenantId } });
  if (!item) {
    return null;
  }
  const updated = await prisma.sourceItem.update({
    where: { id: item.id },
    data: { processingStatus: status },
  });

  if (item.clusterId) {
    await prisma.storyCluster.update({
      where: { id: item.clusterId },
      data: { lastSeenAt: new Date() },
    });
  }

  await writeAudit({
    tenantId,
    action: `source_item.${status}`,
    entityType: "source_item",
    entityId: item.id,
    actorType: actor.userId ? "user" : "system",
    actorUserId: actor.userId ?? null,
  });

  return updated;
}

export async function markSourceItemsStatus(
  tenantId: string,
  itemIds: string[],
  status: SourceItemStatus,
) {
  return prisma.sourceItem.updateMany({
    where: { tenantId, id: { in: itemIds } },
    data: { processingStatus: status },
  });
}
