// SEO data kept in the existing provider cache (SEO-V2-02): canonical keys, provenance per field, history and retention.
// Only answers are stored, a genuine "no data" included; a failure never is.

import { Prisma } from "@prisma/client";
import { getPrismaClient } from "../infrastructure/db/prisma";
import type { KeywordMetrics, SeoCapability, SeoDataKind, SeoFreshness } from "../infrastructure/seo/contract";
import { SEO_RESOURCES, freshnessOf } from "../infrastructure/seo/policy";
import { SEO_PROVIDERS } from "../infrastructure/seo/registry";
import { structuredEvent } from "../shared/utils/logger";

const prisma = getPrismaClient();

export const METRIC_FIELDS = ["volume", "difficulty", "cpc", "intent"] as const;
export type MetricField = (typeof METRIC_FIELDS)[number];
/** Where one value came from. A field listed with a null value was answered as unavailable; one not listed was never asked. */
export type FieldProvenance = { at: string; via: SeoCapability; kind: SeoDataKind; asOf: string | null; upstream: string | null };
export type SeoCacheMeta = { asOf?: string | null; upstream?: string | null; methodology?: string; fields?: Partial<Record<MetricField, FieldProvenance>> };

export type SeoCacheEntry = { payload: unknown; negative: boolean; fetchedAt: Date; expiresAt: Date; freshness: SeoFreshness; meta: SeoCacheMeta };
export type SeoCacheRow = { key: string; payload: unknown; negative: boolean; meta: SeoCacheMeta; /** When the value that decides freshness was acquired, if earlier than this answer. */ fetchedAt?: Date };

/** Entries by key; expired ones are left out. `legacyKey` finds data bought before canonical keys, until it expires. */
export async function readSeoCache(
  tenantId: string,
  providerId: string,
  capability: SeoCapability,
  keys: Array<{ key: string; legacyKey: string | null }>,
  freshDays: number,
  now = new Date(),
): Promise<Map<string, SeoCacheEntry>> {
  const rows = await prisma.providerCacheEntry.findMany({
    where: { tenantId, providerKey: providerId, resourceType: SEO_RESOURCES[capability], cacheKey: { in: keys.flatMap(({ key, legacyKey }) => (legacyKey ? [key, legacyKey] : [key])) } },
  });
  const byKey = new Map(rows.map((row) => [row.cacheKey, row]));
  const found = new Map<string, SeoCacheEntry>();
  const used: string[] = [];
  for (const { key, legacyKey } of keys) {
    for (const row of [byKey.get(key), legacyKey ? byKey.get(legacyKey) : undefined]) {
      if (!row) continue;
      const fetchedAt = row.fetchedAt ?? row.createdAt;
      const freshness = freshnessOf(fetchedAt, row.expiresAt, freshDays, now);
      if (freshness === "expired") continue;
      found.set(key, { payload: row.payload, negative: row.isNegative, fetchedAt, expiresAt: row.expiresAt, freshness, meta: (row.meta ?? {}) as SeoCacheMeta });
      used.push(row.id);
      break;
    }
  }
  if (used.length) await prisma.providerCacheEntry.updateMany({ where: { id: { in: used } }, data: { hitCount: { increment: 1 }, lastAccessedAt: now } }).catch(() => undefined);
  return found;
}

export async function writeSeoCache(tenantId: string, providerId: string, capability: SeoCapability, rows: SeoCacheRow[], fetchedAt: Date, retentionDays: number): Promise<void> {
  if (!rows.length || retentionDays <= 0) return;
  const utc = (date: Date) => date.toISOString().slice(0, 23);
  const records = JSON.stringify(rows.map((row) => {
    const at = row.fetchedAt ?? fetchedAt;
    return { cache_key: row.key, payload: row.payload ?? null, is_negative: row.negative, meta: row.meta, fetched_at: utc(at), expires_at: utc(new Date(at.getTime() + retentionDays * 86_400_000)) };
  }));
  const now = utc(fetchedAt);
  await prisma.$executeRaw`
    INSERT INTO provider_cache_entries (id, tenant_id, provider_key, resource_type, cache_key, payload, is_negative, meta, fetched_at, expires_at, last_accessed_at, created_at, updated_at)
    SELECT gen_random_uuid(), ${tenantId}::uuid, ${providerId}, ${SEO_RESOURCES[capability]}, r.cache_key, r.payload, r.is_negative, r.meta, r.fetched_at, r.expires_at, ${now}::timestamp, ${now}::timestamp, ${now}::timestamp
    FROM jsonb_to_recordset(${records}::jsonb) AS r(cache_key text, payload jsonb, is_negative boolean, meta jsonb, fetched_at timestamp, expires_at timestamp)
    ON CONFLICT (tenant_id, provider_key, resource_type, cache_key) DO UPDATE SET
      payload = EXCLUDED.payload, is_negative = EXCLUDED.is_negative, meta = EXCLUDED.meta, fetched_at = EXCLUDED.fetched_at, expires_at = EXCLUDED.expires_at, updated_at = EXCLUDED.updated_at`;
}

/** One keyword's values after a new answer: a value is replaced by a newer one, never by "not returned". Pure. */
export function mergeKeywordMetrics(
  existing: { payload: KeywordMetrics | null; meta: SeoCacheMeta } | null,
  incoming: KeywordMetrics,
  provenance: FieldProvenance,
): { payload: KeywordMetrics; meta: SeoCacheMeta } {
  // A ranking belongs to a domain, not to the keyword.
  const { rank: _rank, estimatedTraffic: _traffic, ...values } = incoming;
  const payload: KeywordMetrics = { ...values };
  const fields: Partial<Record<MetricField, FieldProvenance>> = {};
  for (const field of METRIC_FIELDS) {
    const known = existing?.payload?.[field] ?? null;
    if (incoming[field] === null && known !== null && existing?.meta.fields?.[field]) {
      (payload as Record<MetricField, unknown>)[field] = known;
      fields[field] = existing.meta.fields[field];
    } else fields[field] = { ...provenance, asOf: incoming.asOf ?? provenance.asOf };
  }
  return { payload, meta: { asOf: incoming.asOf ?? null, upstream: provenance.upstream, fields } };
}

/** History of what was bought, one row per request, kept as long as the licence allows. */
export async function writeSeoSnapshot(input: { tenantId: string; providerId: string; capability: SeoCapability; cacheKey: string; data: unknown; meta: Record<string, unknown>; reservationId: string; fetchedAt: Date; retentionDays: number }): Promise<void> {
  if (input.retentionDays <= 0) return;
  await prisma.seoSnapshot.create({
    data: {
      tenantId: input.tenantId, providerId: input.providerId, operation: input.capability, cacheKey: input.cacheKey, payload: input.data as Prisma.InputJsonValue, meta: input.meta as Prisma.InputJsonObject,
      reservationId: input.reservationId, fetchedAt: input.fetchedAt, retainUntil: new Date(input.fetchedAt.getTime() + input.retentionDays * 86_400_000),
    },
  });
  await purgeExpiredSeoData();
}

let lastPurge = 0;
/** Deletes SEO data past its retention; at most once an hour per process, after a purchase. */
export async function purgeExpiredSeoData(now = new Date(), force = false): Promise<void> {
  if (!force && now.getTime() - lastPurge < 3_600_000) return;
  lastPurge = now.getTime();
  try {
    await prisma.seoSnapshot.deleteMany({ where: { retainUntil: { lt: now } } });
    await prisma.providerCacheEntry.deleteMany({ where: { providerKey: { in: SEO_PROVIDERS.map((provider) => provider.id) }, expiresAt: { lt: now } } });
    await prisma.seoKeywordMetric.deleteMany({ where: { retainUntil: { lt: now } } });
    // What the licence no longer lets be kept, and the site keywords nothing explains any more.
    await prisma.siteKeywordDiscovery.deleteMany({ where: { retainUntil: { lt: now } } });
    await prisma.siteKeyword.deleteMany({ where: { opportunityId: null, discoveries: { none: {} }, updatedAt: { lt: new Date(now.getTime() - 86_400_000) } } });
    await prisma.seoAcquisitionLease.deleteMany({ where: { until: { lt: new Date(now.getTime() - 2 * 86_400_000) } } });
  } catch (error) {
    structuredEvent("seo.purge_failed", { error: error instanceof Error ? error.message : String(error) }, "warn");
  }
}
