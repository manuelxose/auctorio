// Persistent keyword knowledge. Market intelligence (seo_keyword_metrics) is what providers said of a keyword in a
// market; site knowledge (site_keywords) is what the keyword means to one site. They never mix.

import { Prisma } from "@prisma/client";
import { getPrismaClient } from "../../infrastructure/db/prisma";
import { normalizeKeyword, type KeywordMetrics, type SeoLicensing, type SeoMarket, type SeoProvider } from "../../infrastructure/seo/contract";
import { SEO_PROVIDERS } from "../../infrastructure/seo/registry";
import { METRIC_FIELDS, type FieldProvenance, type MetricField } from "../seo-cache";

const prisma = getPrismaClient();
const DAY_MS = 86_400_000;
const sqlTime = (date: Date) => Prisma.sql`${date.toISOString().slice(0, 23)}::timestamp`;

export type MetricValues = Pick<KeywordMetrics, MetricField>;
export type MetricRow = { keyword: string; values: MetricValues; fields: Partial<Record<MetricField, FieldProvenance>> };

/**
 * Keeps what a provider answered, one row per change: the same values again only confirm the row.
 * Nothing is kept where the licence prohibits storing.
 */
export async function recordKeywordMetrics(input: {
  tenantId: string;
  provider: Pick<SeoProvider, "id" | "licensing">;
  source: string;
  market: Pick<SeoMarket, "country" | "language">;
  rows: MetricRow[];
  reservationId: string | null;
  fetchedAt: Date;
  retentionDays: number;
}): Promise<void> {
  if (input.retentionDays <= 0 || !input.rows.length) return;
  const { licensing } = input.provider;
  const records = JSON.stringify(
    [...new Map(input.rows.map((row) => [normalizeKeyword(row.keyword), row])).entries()].map(([keyword, { values, fields }]) => ({
      keyword, volume: values.volume === null ? null : Math.round(values.volume), difficulty: values.difficulty, cpc: values.cpc, intent: values.intent, fields,
      quality: Math.round((100 * METRIC_FIELDS.filter((field) => values[field] !== null).length) / METRIC_FIELDS.length),
    })),
  );
  const at = input.fetchedAt;
  const until = new Date(at.getTime() + input.retentionDays * DAY_MS);
  await prisma.$executeRaw`
    WITH incoming AS (
      SELECT * FROM jsonb_to_recordset(${records}::jsonb) AS r(keyword text, volume int, difficulty float8, cpc float8, intent text, fields jsonb, quality int)
    ), latest AS (
      SELECT DISTINCT ON (m.keyword) m.id, m.keyword, m.volume, m.difficulty, m.cpc, m.intent
      FROM seo_keyword_metrics m JOIN incoming i ON i.keyword = m.keyword
      WHERE m.tenant_id = ${input.tenantId}::uuid AND m.provider_id = ${input.provider.id} AND m.source = ${input.source} AND m.country = ${input.market.country} AND m.language = ${input.market.language}
      ORDER BY m.keyword, m.confirmed_at DESC
    ), same AS (
      UPDATE seo_keyword_metrics m SET confirmed_at = GREATEST(m.confirmed_at, ${sqlTime(at)}), retain_until = GREATEST(m.retain_until, ${sqlTime(until)}), fields = i.fields
      FROM latest l JOIN incoming i ON i.keyword = l.keyword
      WHERE m.id = l.id AND (l.volume, l.difficulty, l.cpc, l.intent) IS NOT DISTINCT FROM (i.volume, i.difficulty, i.cpc, i.intent)
      RETURNING m.keyword
    )
    INSERT INTO seo_keyword_metrics (id, tenant_id, provider_id, source, country, language, keyword, volume, difficulty, cpc, intent, fields, quality, storage, sharing, reservation_id, collected_at, confirmed_at, retain_until)
    SELECT gen_random_uuid(), ${input.tenantId}::uuid, ${input.provider.id}, ${input.source}, ${input.market.country}, ${input.market.language}, i.keyword, i.volume, i.difficulty, i.cpc, i.intent, i.fields, i.quality,
      ${licensing.storage}, ${licensing.crossTenantSharing}, ${input.reservationId}::uuid, ${sqlTime(at)}, ${sqlTime(at)}, ${sqlTime(until)}
    FROM incoming i WHERE i.keyword NOT IN (SELECT keyword FROM same)`;
}

/** Providers whose data may cross workspaces: the platform turned sharing on and the licence permits it in writing. */
export function sharableProviders(shareMarketData: boolean, providers: ReadonlyArray<{ id: string; licensing: Pick<SeoLicensing, "storage" | "crossTenantSharing"> }> = SEO_PROVIDERS): string[] {
  return shareMarketData ? providers.filter(({ licensing }) => licensing.crossTenantSharing === "permitted" && licensing.storage === "permitted").map(({ id }) => id) : [];
}

export type KnownMetric = MetricValues & { keyword: string; providerId: string; source: string; quality: number; collectedAt: Date; confirmedAt: Date };

/**
 * Newest known metrics of these exact keywords, whatever the source, each with its own: sources are never merged.
 * Another workspace's row is served only from a sharable provider, and says nothing of who collected it.
 */
export async function knownKeywordMetrics(
  tenantId: string,
  market: Pick<SeoMarket, "country" | "language">,
  keywords: string[],
  options: { maxAgeDays: number; sharable?: string[]; now?: Date },
): Promise<Map<string, KnownMetric>> {
  const wanted = [...new Set(keywords.map(normalizeKeyword).filter(Boolean))];
  if (!wanted.length) return new Map();
  const now = options.now ?? new Date();
  const since = new Date(now.getTime() - options.maxAgeDays * DAY_MS);
  const sharable = options.sharable ?? [];
  const rows = await prisma.$queryRaw<Array<{ keyword: string; volume: number | null; difficulty: number | null; cpc: number | null; intent: string | null; provider_id: string; source: string; quality: number; collected_at: Date; confirmed_at: Date }>>`
    SELECT DISTINCT ON (keyword) keyword, volume, difficulty, cpc, intent, provider_id, source, quality, collected_at, confirmed_at
    FROM seo_keyword_metrics
    WHERE country = ${market.country} AND language = ${market.language} AND keyword = ANY(${wanted}::text[]) AND confirmed_at >= ${sqlTime(since)} AND retain_until > ${sqlTime(now)}
      AND (tenant_id = ${tenantId}::uuid OR (sharing = 'permitted' AND storage = 'permitted' AND provider_id = ANY(${sharable}::text[])))
    ORDER BY keyword, (tenant_id = ${tenantId}::uuid) DESC, (volume IS NOT NULL) DESC, confirmed_at DESC`;
  return new Map(rows.map((row) => [row.keyword, {
    keyword: row.keyword, volume: row.volume, difficulty: row.difficulty, cpc: row.cpc, intent: row.intent, providerId: row.provider_id, source: row.source, quality: row.quality,
    collectedAt: row.collected_at, confirmedAt: row.confirmed_at,
  }]));
}

/** How a keyword's figures changed, newest first; only the workspace's own rows. */
export function keywordHistory(tenantId: string, market: Pick<SeoMarket, "country" | "language">, keyword: string) {
  return prisma.seoKeywordMetric.findMany({
    where: { tenantId, country: market.country, language: market.language, keyword: normalizeKeyword(keyword) },
    orderBy: { confirmedAt: "desc" }, take: 50,
    select: { providerId: true, source: true, volume: true, difficulty: true, cpc: true, intent: true, fields: true, quality: true, collectedAt: true, confirmedAt: true, retainUntil: true },
  });
}

export type SiteKeywordInput = {
  keyword: string;
  key: string;
  status: "candidate" | "opportunity" | "rejected";
  reason: string | null;
  level: 0 | 1 | 2;
  score: number | null;
  cluster: string | null;
  opportunityId: string | null;
  discoveries: Array<{ kind: string; value: string; competitorId: string | null; position: number | null; url: string | null; providerId: string; runId: string | null; discoveredAt: Date; retainUntil: Date }>;
};

/** A level already reached and an opportunity already linked are never lost. */
export async function storeSiteKeywords(tenantId: string, siteId: string, market: string, rows: SiteKeywordInput[]): Promise<{ created: number; total: number }> {
  const unique = [...new Map(rows.filter((row) => row.key).map((row) => [row.key, row])).values()];
  if (!unique.length) return { created: 0, total: 0 };
  const now = new Date();
  const before = await prisma.siteKeyword.count({ where: { tenantId, siteId, market } });
  const records = JSON.stringify(unique.map(({ keyword, key, status, reason, level, score, cluster, opportunityId }) => ({ keyword, key, status, reason, level, score, cluster, opportunity_id: opportunityId })));
  const ids = await prisma.$queryRaw<Array<{ id: string; keyword_key: string }>>`
    INSERT INTO site_keywords AS k (id, tenant_id, site_id, market, keyword, keyword_key, status, reason, level, score, cluster, opportunity_id, first_seen_at, updated_at)
    SELECT gen_random_uuid(), ${tenantId}::uuid, ${siteId}::uuid, ${market}, r.keyword, r.key, r.status, r.reason, r.level, r.score, r.cluster, r.opportunity_id, ${sqlTime(now)}, ${sqlTime(now)}
    FROM jsonb_to_recordset(${records}::jsonb) AS r(keyword text, key text, status text, reason text, level int, score int, cluster text, opportunity_id uuid)
    ON CONFLICT (site_id, market, keyword_key) DO UPDATE SET status = EXCLUDED.status, reason = EXCLUDED.reason, level = GREATEST(k.level, EXCLUDED.level),
      score = EXCLUDED.score, cluster = COALESCE(EXCLUDED.cluster, k.cluster), opportunity_id = COALESCE(EXCLUDED.opportunity_id, k.opportunity_id), updated_at = ${sqlTime(now)}
      WHERE k.tenant_id = EXCLUDED.tenant_id
    RETURNING k.id, k.keyword_key`;
  const idOf = new Map(ids.map((row) => [row.keyword_key, row.id]));
  const discoveries = JSON.stringify(unique.flatMap((row) => row.discoveries.map((entry) => ({
    site_keyword_id: idOf.get(row.key), kind: entry.kind, value: entry.value, competitor_id: entry.competitorId, position: entry.position, url: entry.url, provider_id: entry.providerId, run_id: entry.runId,
    discovered_at: entry.discoveredAt, retain_until: entry.retainUntil,
  }))).filter((entry) => entry.site_keyword_id));
  await prisma.$executeRaw`
    INSERT INTO site_keyword_discoveries AS d (id, tenant_id, site_keyword_id, kind, value, competitor_id, position, url, provider_id, run_id, discovered_at, retain_until)
    SELECT DISTINCT ON (r.site_keyword_id, r.kind, r.value) gen_random_uuid(), ${tenantId}::uuid, r.* FROM jsonb_to_recordset(${discoveries}::jsonb)
      AS r(site_keyword_id uuid, kind text, value text, competitor_id uuid, position int, url text, provider_id text, run_id uuid, discovered_at timestamp, retain_until timestamp)
    ON CONFLICT (site_keyword_id, kind, value) DO UPDATE SET position = EXCLUDED.position, url = EXCLUDED.url, provider_id = EXCLUDED.provider_id, run_id = COALESCE(EXCLUDED.run_id, d.run_id),
      discovered_at = EXCLUDED.discovered_at, retain_until = EXCLUDED.retain_until`;
  return { created: (await prisma.siteKeyword.count({ where: { tenantId, siteId, market } })) - before, total: unique.length };
}

/** The site's keywords, best first, with where they came from. */
export function listSiteKeywords(tenantId: string, siteId: string, filters: { status?: string; take?: number } = {}) {
  return prisma.siteKeyword.findMany({
    where: { tenantId, siteId, ...(filters.status ? { status: filters.status } : {}) },
    orderBy: [{ score: { sort: "desc", nulls: "last" } }, { keyword: "asc" }],
    take: Math.min(500, filters.take ?? 200),
    select: {
      id: true, market: true, keyword: true, status: true, reason: true, level: true, score: true, cluster: true, opportunityId: true, firstSeenAt: true, updatedAt: true,
      discoveries: { select: { kind: true, value: true, position: true, url: true, providerId: true, discoveredAt: true, retainUntil: true }, orderBy: { discoveredAt: "desc" }, take: 5 },
    },
  });
}

