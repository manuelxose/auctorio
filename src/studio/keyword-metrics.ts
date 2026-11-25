// Real search demand for plan items: provider volume + difficulty, reused from whatever was already bought.
// Best effort: no provider, unknown market or provider error → fields stay null, planning never blocks.

import { getPrismaClient } from "../infrastructure/db/prisma";
import { normalizeKeyword, type KeywordMetrics } from "../infrastructure/seo/contract";
import { acquireSeo, seoRoute, type SeoRoute, type SeoScope } from "./seo-manager";
import { structuredEvent } from "../shared/utils/logger";

const prisma = getPrismaClient();

type AcquireOptions = Pick<SeoScope, "fetchImpl" | "reuseOnly" | "decision" | "priority" | "runId">;

/** Metrics per normalized keyword; a keyword the provider has no data for maps to null, one nobody could answer now is absent. */
export async function getKeywordMetrics(tenantId: string, siteId: string | null, keywords: string[], route: SeoRoute, options: AcquireOptions = {}): Promise<Map<string, KeywordMetrics | null>> {
  const wanted = [...new Set(keywords.map(normalizeKeyword).filter(Boolean))];
  if (!wanted.length) return new Map();
  const { data, meta } = await acquireSeo(route, "keyword_metrics", { keywords: wanted }, { tenantId, siteId, kind: "keyword_metrics", ...options });
  return answered(wanted, meta.unresolved, new Map(data.map((item) => [item.keyword, item])));
}

/** Search volume alone, for keywords without metrics; a keyword without volume maps to null, one nobody could answer now is absent. */
export async function getSearchVolumes(tenantId: string, siteId: string | null, keywords: string[], route: SeoRoute, options: AcquireOptions = {}): Promise<Map<string, number | null>> {
  const wanted = [...new Set(keywords.map(normalizeKeyword).filter(Boolean))];
  if (!wanted.length) return new Map();
  const { data, meta } = await acquireSeo(route, "search_volume", { keywords: wanted }, { tenantId, siteId, kind: "keyword_metrics", ...options });
  return answered(wanted, meta.unresolved, new Map(data.map((item) => [item.keyword, item.volume])));
}

function answered<T>(wanted: string[], unresolved: string[], found: Map<string, T>): Map<string, T | null> {
  const unknown = new Set(unresolved);
  return new Map(wanted.filter((keyword) => !unknown.has(keyword)).map((keyword) => [keyword, found.get(keyword) ?? null]));
}

/**
 * Fill searchVolume/keywordDifficulty on a plan's items that have a primary keyword and no metrics yet.
 * With reuseOnly (ordinary editing) nothing is bought: what is not stored stays unmeasured until the next planning run.
 */
export async function enrichPlanItemsWithKeywordMetrics(
  tenantId: string,
  planId: string,
  fetchImpl: typeof fetch = fetch,
  options: { reuseOnly?: boolean } = {},
): Promise<number> {
  const items = await prisma.editorialPlanItem.findMany({
    where: { tenantId, planId, primaryKeyword: { not: null }, keywordMetricsSource: null },
    select: { id: true, siteId: true, primaryKeyword: true, site: { select: { locale: true, type: true } } },
  });
  if (items.length === 0) return 0;
  try {
    const [route, volumeRoute] = await Promise.all([seoRoute("keyword_metrics", items[0].site?.locale), seoRoute("search_volume", items[0].site?.locale)]);
    if (!route.provider) {
      structuredEvent("keyword_metrics.skipped", { tenantId, planId, reason: route.reason, locale: items[0].site?.locale ?? null }, route.reason === "unsupported_market" ? "warn" : "info");
      return 0;
    }
    const acquire: AcquireOptions = { fetchImpl, reuseOnly: options.reuseOnly, decision: { importance: "normal", siteType: items[0].site?.type }, priority: "planning" };
    const metrics = await getKeywordMetrics(tenantId, items[0].siteId, items.map((item) => item.primaryKeyword!), route, acquire);
    // Keywords the provider has no volume for: search volume only, never a difficulty.
    const unknown = items.map((item) => item.primaryKeyword!).filter((keyword) => metrics.has(normalizeKeyword(keyword)) && metrics.get(normalizeKeyword(keyword))?.volume == null);
    const ads = unknown.length && volumeRoute.provider
      ? await getSearchVolumes(tenantId, items[0].siteId, unknown, volumeRoute, acquire).catch((error: unknown) => {
          structuredEvent("keyword_metrics.volume_skipped", { tenantId, planId, error: error instanceof Error ? error.message : String(error) });
          return new Map<string, number | null>();
        })
      : new Map<string, number | null>();
    const now = new Date();
    let checked = 0;
    for (const item of items) {
      const key = normalizeKeyword(item.primaryKeyword!);
      const found = metrics.get(key);
      const adsVolume = found?.volume == null ? ads.get(key) ?? null : null;
      if (!metrics.has(key)) continue; // not answered: stays "never checked"
      // The fallback was not answered either (not worth its price yet, or failed): no volume is known, which is not "no demand".
      if (found?.volume == null && volumeRoute.provider && !ads.has(key) && found?.difficulty == null) continue;
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
