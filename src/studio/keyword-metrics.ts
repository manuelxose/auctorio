// Real search demand for plan items: DataForSEO volume + difficulty, cached per keyword.
// Best effort: no credentials, unknown market or provider error → fields stay null, planning never blocks.

import { getPrismaClient } from "../infrastructure/db/prisma";
import {
  dataForSeoConfigured,
  dataForSeoLocation,
  fetchGoogleAdsVolume,
  fetchKeywordOverview,
  normalizeKeyword,
  type DataForSeoLocation,
  type KeywordMetrics,
} from "../infrastructure/seo/dataforseo";
import { lookupProviderCache, storeProviderCache } from "./enrichment/provider-cache";
import { recordAiSpend } from "./cost-budgets";
import { structuredEvent } from "../shared/utils/logger";

const prisma = getPrismaClient();
const PROVIDER = "dataforseo";
const RESOURCE = "keyword_overview";
const TTL_MS = 30 * 24 * 60 * 60 * 1000; // DataForSEO refreshes keyword data monthly

type Fetcher = typeof fetchKeywordOverview;

/** Metrics per normalized keyword; a keyword the provider has no data for maps to null. */
export async function getKeywordMetrics(
  tenantId: string,
  siteId: string | null,
  keywords: string[],
  location: DataForSeoLocation,
  fetcher: Fetcher = fetchKeywordOverview,
): Promise<Map<string, KeywordMetrics | null>> {
  const wanted = [...new Set(keywords.map(normalizeKeyword).filter(Boolean))];
  const result = new Map<string, KeywordMetrics | null>();
  const cacheKey = (keyword: string) => `${location.locationCode}|${location.languageCode}|${keyword}`;
  const missing: string[] = [];
  for (const keyword of wanted) {
    const cached = await lookupProviderCache(tenantId, PROVIDER, RESOURCE, cacheKey(keyword));
    if (cached.hit) result.set(keyword, cached.negative ? null : (cached.payload as KeywordMetrics));
    else missing.push(keyword);
  }
  if (missing.length === 0) return result;

  const { items, costUsd } = await fetcher(missing, location);
  if (costUsd > 0) await recordAiSpend({ tenantId, siteId, kind: "keyword_metrics", provider: PROVIDER, model: RESOURCE, costUsd });
  const byKeyword = new Map(items.map((item) => [item.keyword, item]));
  for (const keyword of missing) {
    const metrics = byKeyword.get(keyword) ?? null;
    await storeProviderCache(tenantId, PROVIDER, RESOURCE, cacheKey(keyword), metrics ?? undefined, { ttlMs: TTL_MS, negative: !metrics });
    result.set(keyword, metrics);
  }
  return result;
}

const ADS_SOURCE = "dataforseo_google_ads";

/** Google Ads volume for keywords Labs has no data for (cached 30 days); a keyword without volume maps to null. */
export async function getGoogleAdsVolumes(
  tenantId: string,
  siteId: string | null,
  keywords: string[],
  location: DataForSeoLocation,
  fetcher: typeof fetchGoogleAdsVolume = fetchGoogleAdsVolume,
): Promise<Map<string, number | null>> {
  const result = new Map<string, number | null>();
  const cacheKey = (keyword: string) => `${location.locationCode}|${location.languageCode}|${keyword}`;
  const missing: string[] = [];
  for (const keyword of [...new Set(keywords.map(normalizeKeyword).filter(Boolean))]) {
    const cached = await lookupProviderCache(tenantId, PROVIDER, "google_ads_volume", cacheKey(keyword));
    if (cached.hit) result.set(keyword, cached.negative ? null : Number(cached.payload));
    else missing.push(keyword);
  }
  if (!missing.length) return result;
  const { items, costUsd } = await fetcher(missing, location);
  if (costUsd > 0) await recordAiSpend({ tenantId, siteId, kind: "keyword_metrics", provider: PROVIDER, model: "google_ads_volume", costUsd });
  const byKeyword = new Map(items.map((item) => [item.keyword, item.volume]));
  for (const keyword of missing) {
    const volume = byKeyword.get(keyword) ?? null;
    await storeProviderCache(tenantId, PROVIDER, "google_ads_volume", cacheKey(keyword), volume ?? undefined, { ttlMs: TTL_MS, negative: volume === null });
    result.set(keyword, volume);
  }
  return result;
}

/** Fill searchVolume/keywordDifficulty on a plan's items that have a primary keyword and no metrics yet. */
export async function enrichPlanItemsWithKeywordMetrics(
  tenantId: string,
  planId: string,
  fetcher: Fetcher = fetchKeywordOverview,
  adsFetcher: typeof fetchGoogleAdsVolume = fetchGoogleAdsVolume,
): Promise<number> {
  if (!dataForSeoConfigured()) return 0;
  const items = await prisma.editorialPlanItem.findMany({
    where: { tenantId, planId, primaryKeyword: { not: null }, keywordMetricsSource: null },
    select: { id: true, siteId: true, primaryKeyword: true, site: { select: { locale: true } } },
  });
  if (items.length === 0) return 0;
  const location = dataForSeoLocation(items[0].site?.locale);
  if (!location) {
    structuredEvent("keyword_metrics.skipped", { tenantId, planId, reason: "unsupported_locale", locale: items[0].site?.locale ?? null }, "warn");
    return 0;
  }
  try {
    const metrics = await getKeywordMetrics(tenantId, items[0].siteId, items.map((item) => item.primaryKeyword!), location, fetcher);
    // Keywords Labs does not know (typically added by hand): Google Ads volume only, never a difficulty.
    const unknown = items.map((item) => item.primaryKeyword!).filter((keyword) => metrics.get(normalizeKeyword(keyword))?.volume == null);
    const ads = unknown.length ? await getGoogleAdsVolumes(tenantId, items[0].siteId, unknown, location, adsFetcher).catch(() => new Map<string, number | null>()) : new Map<string, number | null>();
    const now = new Date();
    for (const item of items) {
      const key = normalizeKeyword(item.primaryKeyword!);
      const found = metrics.get(key);
      const adsVolume = found?.volume == null ? ads.get(key) ?? null : null;
      await prisma.editorialPlanItem.update({
        where: { id: item.id },
        // Source is set even when the provider has no data: "checked, unknown" is not "never checked".
        data: adsVolume !== null
          ? { searchVolume: adsVolume, keywordDifficulty: null, keywordMetricsSource: ADS_SOURCE, keywordMetricsAt: now }
          : { searchVolume: found?.volume ?? null, keywordDifficulty: found?.difficulty ?? null, keywordMetricsSource: PROVIDER, keywordMetricsAt: now },
      });
    }
    structuredEvent("keyword_metrics.enriched", { tenantId, planId, items: items.length });
    return items.length;
  } catch (error) {
    structuredEvent("keyword_metrics.failed", { tenantId, planId, error: error instanceof Error ? error.message : String(error) }, "warn");
    return 0;
  }
}
