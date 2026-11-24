// Real search demand for plan items: provider volume + difficulty, cached per keyword and provider.
// Best effort: no provider, unknown market or provider error → fields stay null, planning never blocks.

import { getPrismaClient } from "../infrastructure/db/prisma";
import { normalizeKeyword, type KeywordMetrics } from "../infrastructure/seo/contract";
import { lookupProviderCache, storeProviderCache } from "./enrichment/provider-cache";
import { acquireSeo, seoRoute, type SeoRoute } from "./seo-manager";
import { structuredEvent } from "../shared/utils/logger";

const prisma = getPrismaClient();
const RESOURCE = "keyword_overview";
const VOLUME_RESOURCE = "google_ads_volume"; // name of the entries already cached
const TTL_MS = 30 * 24 * 60 * 60 * 1000; // keyword data is refreshed monthly

/** Metrics per normalized keyword; a keyword the provider has no data for maps to null. */
export async function getKeywordMetrics(
  tenantId: string,
  siteId: string | null,
  keywords: string[],
  route: SeoRoute,
  fetchImpl: typeof fetch = fetch,
): Promise<Map<string, KeywordMetrics | null>> {
  const wanted = [...new Set(keywords.map(normalizeKeyword).filter(Boolean))];
  const result = new Map<string, KeywordMetrics | null>();
  const cacheKey = (keyword: string) => `${route.marketKey}|${keyword}`;
  const missing: string[] = [];
  for (const keyword of wanted) {
    const cached = await lookupProviderCache(tenantId, route.provider.id, RESOURCE, cacheKey(keyword));
    if (cached.hit) result.set(keyword, cached.negative ? null : (cached.payload as KeywordMetrics));
    else missing.push(keyword);
  }
  if (missing.length === 0) return result;

  const { data, meta } = await acquireSeo(route, "keyword_metrics", { keywords: missing }, { tenantId, siteId, kind: "keyword_metrics", resource: RESOURCE, fetchImpl });
  const byKeyword = new Map(data.map((item) => [item.keyword, item]));
  for (const keyword of missing) {
    const metrics = byKeyword.get(keyword) ?? null;
    // Missing from a partial answer is unknown, not "no data": it is neither cached nor returned.
    if (!metrics && meta.partial) continue;
    await storeProviderCache(tenantId, route.provider.id, RESOURCE, cacheKey(keyword), metrics ?? undefined, { ttlMs: TTL_MS, negative: !metrics });
    result.set(keyword, metrics);
  }
  return result;
}

/** Search volume alone, for keywords without metrics (cached 30 days); a keyword without volume maps to null. */
export async function getSearchVolumes(
  tenantId: string,
  siteId: string | null,
  keywords: string[],
  route: SeoRoute,
  fetchImpl: typeof fetch = fetch,
): Promise<Map<string, number | null>> {
  const result = new Map<string, number | null>();
  const cacheKey = (keyword: string) => `${route.marketKey}|${keyword}`;
  const missing: string[] = [];
  for (const keyword of [...new Set(keywords.map(normalizeKeyword).filter(Boolean))]) {
    const cached = await lookupProviderCache(tenantId, route.provider.id, VOLUME_RESOURCE, cacheKey(keyword));
    if (cached.hit) result.set(keyword, cached.negative ? null : Number(cached.payload));
    else missing.push(keyword);
  }
  if (!missing.length) return result;
  const { data, meta } = await acquireSeo(route, "search_volume", { keywords: missing }, { tenantId, siteId, kind: "keyword_metrics", resource: VOLUME_RESOURCE, fetchImpl });
  const byKeyword = new Map(data.map((item) => [item.keyword, item.volume]));
  for (const keyword of missing) {
    const volume = byKeyword.get(keyword) ?? null;
    if (volume === null && meta.partial) continue;
    await storeProviderCache(tenantId, route.provider.id, VOLUME_RESOURCE, cacheKey(keyword), volume ?? undefined, { ttlMs: TTL_MS, negative: volume === null });
    result.set(keyword, volume);
  }
  return result;
}

/** Fill searchVolume/keywordDifficulty on a plan's items that have a primary keyword and no metrics yet. */
export async function enrichPlanItemsWithKeywordMetrics(
  tenantId: string,
  planId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<number> {
  const items = await prisma.editorialPlanItem.findMany({
    where: { tenantId, planId, primaryKeyword: { not: null }, keywordMetricsSource: null },
    select: { id: true, siteId: true, primaryKeyword: true, site: { select: { locale: true } } },
  });
  if (items.length === 0) return 0;
  try {
    const [route, volumeRoute] = await Promise.all([seoRoute("keyword_metrics", items[0].site?.locale), seoRoute("search_volume", items[0].site?.locale)]);
    if (!route.provider) {
      structuredEvent("keyword_metrics.skipped", { tenantId, planId, reason: route.reason, locale: items[0].site?.locale ?? null }, route.reason === "unsupported_market" ? "warn" : "info");
      return 0;
    }
    const metrics = await getKeywordMetrics(tenantId, items[0].siteId, items.map((item) => item.primaryKeyword!), route, fetchImpl);
    // Keywords without metrics (typically added by hand): search volume only, never a difficulty.
    const unknown = items.map((item) => item.primaryKeyword!).filter((keyword) => metrics.get(normalizeKeyword(keyword))?.volume == null);
    const ads = unknown.length && volumeRoute.provider ? await getSearchVolumes(tenantId, items[0].siteId, unknown, volumeRoute, fetchImpl).catch(() => new Map<string, number | null>()) : new Map<string, number | null>();
    const now = new Date();
    let checked = 0;
    for (const item of items) {
      const key = normalizeKeyword(item.primaryKeyword!);
      const found = metrics.get(key);
      const adsVolume = found?.volume == null ? ads.get(key) ?? null : null;
      if (!metrics.has(key) && adsVolume === null) continue; // not answered: stays "never checked"
      checked += 1;
      await prisma.editorialPlanItem.update({
        where: { id: item.id },
        // Source is set even when the provider has no data: "checked, unknown" is not "never checked".
        data: adsVolume !== null && volumeRoute.provider
          ? { searchVolume: adsVolume, keywordDifficulty: null, keywordMetricsSource: volumeRoute.sourceTag, keywordMetricsAt: now }
          : { searchVolume: found?.volume ?? null, keywordDifficulty: found?.difficulty ?? null, keywordMetricsSource: route.sourceTag, keywordMetricsAt: now },
      });
    }
    structuredEvent("keyword_metrics.enriched", { tenantId, planId, items: checked });
    return checked;
  } catch (error) {
    structuredEvent("keyword_metrics.failed", { tenantId, planId, error: error instanceof Error ? error.message : String(error) }, "warn");
    return 0;
  }
}
