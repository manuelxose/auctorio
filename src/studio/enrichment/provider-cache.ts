// External provider response cache (Phase 3).
//
// - deterministic cache key (canonical JSON → sha256)
// - TTL by resource type
// - stale-while-revalidate (serve stale within grace window, refresh behind)
// - negative caching (unavailable / not-found results)
// - request coalescing (identical in-flight lookups share one request)
// - rate-limit protection (per-provider token policy)
//
// Never pay repeatedly for identical enrichment.

import { Prisma } from "@prisma/client";
import { getPrismaClient } from "../../infrastructure/db/prisma";
import { sha256 } from "../../shared/utils/hash";
import { isUniqueViolation } from "../../infrastructure/db/errors";

const prisma = getPrismaClient();

export const RESOURCE_TYPE_TTL_MS: Record<string, number> = {
  search: 6 * 3_600_000,
  movie: 30 * 24 * 3_600_000,
  tv: 30 * 24 * 3_600_000,
  person: 30 * 24 * 3_600_000,
  credits: 30 * 24 * 3_600_000,
  images: 7 * 24 * 3_600_000,
  watch_providers: 7 * 24 * 3_600_000,
  rating: 24 * 3_600_000,
  default: 24 * 3_600_000,
};

export const DEFAULT_TTL_MS = RESOURCE_TYPE_TTL_MS.default;

/** Stale grace window: fraction of the resource TTL during which stale data
 *  may still be served while a background refresh runs. */
export const STALE_GRACE_RATIO = 0.25;
/** Hard floor for the stale grace window (never refresh-bomb providers). */
export const STALE_GRACE_MIN_MS = 30 * 60_000;

export function ttlForResourceType(resourceType: string): number {
  return RESOURCE_TYPE_TTL_MS[resourceType] ?? DEFAULT_TTL_MS;
}

/** Deterministic cache key from a provider lookup. */
export function buildProviderCacheKey(
  providerKey: string,
  resourceType: string,
  query: Record<string, unknown>,
): string {
  const canonical = JSON.stringify(
    Object.keys(query)
      .sort()
      .map((key) => [key, query[key]]),
  );
  return sha256(`${providerKey}|${resourceType}|${canonical}`);
}

export type CacheLookup = {
  key: string;
  hit: boolean;
  /** Present on a positive hit. */
  payload?: unknown;
  /** True when the hit is a cached negative (e.g. not found / unavailable). */
  negative: boolean;
  /** True when the entry expired but is still servable (SWR). */
  stale: boolean;
  /** True when the entry is a hard miss (no usable data at all). */
  miss: boolean;
};

export type CacheStoreOptions = {
  ttlMs?: number;
  negative?: boolean;
};

const coalescing = new Map<string, Promise<CacheLookup>>();

/** In-memory per-provider rate limiting (shared with resilience limiter). */
export type ProviderRatePolicy = {
  maxRequests?: number;
  windowMs?: number;
  minIntervalMs?: number;
};

type ProviderWindow = { timestamps: number[] };

const providerWindows = new Map<string, ProviderWindow>();

export function resolveProviderRatePolicy(policy: ProviderRatePolicy | null | undefined): Required<ProviderRatePolicy> {
  return { maxRequests: 40, windowMs: 10_000, minIntervalMs: 0, ...(policy ?? {}) };
}

/** Cheap sliding-window gate. Returns false when the provider must wait. */
export function providerRateSlotAvailable(providerKey: string, policy: ProviderRatePolicy | null | undefined, now = Date.now()): boolean {
  const resolved = resolveProviderRatePolicy(policy);
  let window = providerWindows.get(providerKey);
  if (!window) {
    window = { timestamps: [] };
    providerWindows.set(providerKey, window);
  }
  const cutoff = now - resolved.windowMs;
  window.timestamps = window.timestamps.filter((timestamp) => timestamp >= cutoff);
  if (window.timestamps.length >= resolved.maxRequests) {
    return false;
  }
  if (resolved.minIntervalMs > 0 && window.timestamps.length > 0) {
    const last = window.timestamps[window.timestamps.length - 1];
    if (now - last < resolved.minIntervalMs) {
      return false;
    }
  }
  window.timestamps.push(now);
  if (window.timestamps.length > 256) {
    window.timestamps.splice(0, window.timestamps.length - 256);
  }
  return true;
}

/** Record a provider request timestamp without gating (for tests/metrics). */
export function recordProviderRequest(providerKey: string, now = Date.now()): void {
  let window = providerWindows.get(providerKey);
  if (!window) {
    window = { timestamps: [] };
    providerWindows.set(providerKey, window);
  }
  window.timestamps.push(now);
  if (window.timestamps.length > 256) {
    window.timestamps.splice(0, window.timestamps.length - 256);
  }
}

export function resetProviderRateWindows(): void {
  providerWindows.clear();
}

export function providerRateWindowSize(providerKey: string): number {
  return providerWindows.get(providerKey)?.timestamps.length ?? 0;
}

/** Look up a cache entry. Coalesces concurrent identical lookups so a burst
 *  of the same query performs exactly one provider request. */
export async function lookupProviderCache(
  tenantId: string,
  providerKey: string,
  resourceType: string,
  cacheKey: string,
  now = new Date(),
): Promise<CacheLookup> {
  const coalesceKey = `${tenantId}|${cacheKey}`;
  const inFlight = coalescing.get(coalesceKey);
  if (inFlight) {
    return inFlight;
  }

  const promise = doLookup(tenantId, providerKey, resourceType, cacheKey, now).finally(() => {
    coalescing.delete(coalesceKey);
  });
  coalescing.set(coalesceKey, promise);
  return promise;
}

async function doLookup(
  tenantId: string,
  providerKey: string,
  resourceType: string,
  cacheKey: string,
  now: Date,
): Promise<CacheLookup> {
  const entry = await prisma.providerCacheEntry.findUnique({
    where: {
      tenantId_providerKey_resourceType_cacheKey: { tenantId, providerKey, resourceType, cacheKey },
    },
  });
  if (!entry) {
    return { key: cacheKey, hit: false, negative: false, stale: false, miss: true };
  }

  await prisma.providerCacheEntry
    .update({
      where: { id: entry.id },
      data: { lastAccessedAt: now, hitCount: { increment: 1 } },
    })
    .catch(() => undefined);

  const ttl = ttlForResourceType(resourceType);
  const graceMs = Math.max(STALE_GRACE_MIN_MS, ttl * STALE_GRACE_RATIO);
  const ageMs = now.getTime() - entry.expiresAt.getTime();

  if (ageMs <= 0) {
    return { key: cacheKey, hit: true, payload: entry.payload, negative: entry.isNegative, stale: false, miss: false };
  }
  if (ageMs <= graceMs) {
    // Stale-but-servable: caller may revalidate in the background.
    return { key: cacheKey, hit: true, payload: entry.payload, negative: entry.isNegative, stale: true, miss: false };
  }
  return { key: cacheKey, hit: false, negative: entry.isNegative, stale: false, miss: true };
}

/** Persist a positive or negative entry (idempotent upsert by unique key). */
export async function storeProviderCache(
  tenantId: string,
  providerKey: string,
  resourceType: string,
  cacheKey: string,
  payload: unknown,
  options: CacheStoreOptions = {},
): Promise<void> {
  const ttl = options.ttlMs ?? ttlForResourceType(resourceType);
  const expiresAt = new Date(Date.now() + ttl);
  try {
    await prisma.providerCacheEntry.create({
      data: {
        tenantId,
        providerKey,
        resourceType,
        cacheKey,
        payload: payload === undefined ? Prisma.JsonNull : (payload as Prisma.InputJsonValue),
        isNegative: options.negative ?? false,
        expiresAt,
      },
    });
  } catch (error) {
    if (!isUniqueViolation(error)) {
      throw error;
    }
    await prisma.providerCacheEntry.updateMany({
      where: { tenantId, providerKey, resourceType, cacheKey },
      data: {
        payload: payload === undefined ? Prisma.JsonNull : (payload as Prisma.InputJsonValue),
        isNegative: options.negative ?? false,
        expiresAt,
        updatedAt: new Date(),
      },
    });
  }
}

export type ProviderCacheStats = {
  hits: number;
  staleHits: number;
  negatives: number;
  misses: number;
  stores: number;
};

export function createProviderCacheStats(): ProviderCacheStats {
  return { hits: 0, staleHits: 0, negatives: 0, misses: 0, stores: 0 };
}

/** Bump in-memory counters for the observability report. */
export function recordCacheStat(stats: ProviderCacheStats, result: CacheLookup): void {
  if (result.miss) {
    stats.misses += 1;
    return;
  }
  if (result.negative) {
    stats.negatives += 1;
    return;
  }
  if (result.stale) {
    stats.staleHits += 1;
    return;
  }
  stats.hits += 1;
}

export function resetProviderCacheCoalescing(): void {
  coalescing.clear();
}
