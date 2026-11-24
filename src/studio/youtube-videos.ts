// One YouTube video per guide (BLG parity M6): the top YouTube result for the keyword, optionally only from the
// site's own channel. Best effort like serp-sources: no provider, no market or provider error → no video.

import { normalizeKeyword, type YoutubeResult } from "../infrastructure/seo/contract";
import { lookupProviderCache, storeProviderCache } from "./enrichment/provider-cache";
import { acquireSeo, seoRoute } from "./seo-manager";
import { structuredEvent } from "../shared/utils/logger";
import { pickYoutubeVideo, type VisualSettings, type YoutubeVideo } from "./editorial-engine/visuals";

const RESOURCE = "youtube_organic";
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

export async function youtubeVideoFor(
  input: { tenantId: string; siteId: string; locale: string | null; keyword: string; youtube: VisualSettings["youtube"] },
  fetchImpl: typeof fetch = fetch,
): Promise<YoutubeVideo | null> {
  const keyword = normalizeKeyword(input.keyword);
  if (!input.youtube.enabled || !keyword) return null;
  try {
    const route = await seoRoute("youtube_search", input.locale);
    if (!route.provider) return null;
    const key = `${route.marketKey}|${keyword}`;
    const cached = await lookupProviderCache(input.tenantId, route.provider.id, RESOURCE, key);
    let videos = cached.hit ? (cached.negative ? [] : (cached.payload as YoutubeResult[])) : null;
    if (!videos) {
      const { data, meta } = await acquireSeo(route, "youtube_search", { keyword }, { tenantId: input.tenantId, siteId: input.siteId, kind: "youtube_video", resource: RESOURCE, fetchImpl });
      videos = data;
      // Nothing left of a partial answer is not "no videos": ask again next time.
      if (videos.length || !meta.partial) await storeProviderCache(input.tenantId, route.provider.id, RESOURCE, key, videos, { ttlMs: TTL_MS, negative: videos.length === 0 });
    }
    return pickYoutubeVideo(videos, input.youtube);
  } catch (error) {
    structuredEvent("youtube_video.failed", { tenantId: input.tenantId, siteId: input.siteId, error: error instanceof Error ? error.message : String(error) }, "warn");
    return null;
  }
}
