// One YouTube video per guide (BLG parity M6): the top YouTube result for the keyword, optionally only from the
// site's own channel. Best effort like serp-sources: no credentials, no market or provider error → no video.

import { dataForSeoConfigured, dataForSeoLocation, fetchYoutubeOrganic, normalizeKeyword, type YoutubeResult } from "../infrastructure/seo/dataforseo";
import { lookupProviderCache, storeProviderCache } from "./enrichment/provider-cache";
import { recordAiSpend } from "./cost-budgets";
import { structuredEvent } from "../shared/utils/logger";
import { pickYoutubeVideo, type VisualSettings, type YoutubeVideo } from "./editorial-engine/visuals";

const PROVIDER = "dataforseo";
const RESOURCE = "youtube_organic";
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

export async function youtubeVideoFor(
  input: { tenantId: string; siteId: string; locale: string | null; keyword: string; youtube: VisualSettings["youtube"] },
  fetcher: typeof fetchYoutubeOrganic = fetchYoutubeOrganic,
): Promise<YoutubeVideo | null> {
  const location = dataForSeoLocation(input.locale);
  const keyword = normalizeKeyword(input.keyword);
  if (!input.youtube.enabled || !dataForSeoConfigured() || !location || !keyword) return null;
  const key = `${location.locationCode}|${location.languageCode}|${keyword}`;
  try {
    const cached = await lookupProviderCache(input.tenantId, PROVIDER, RESOURCE, key);
    let videos = cached.hit ? (cached.negative ? [] : (cached.payload as YoutubeResult[])) : null;
    if (!videos) {
      const fetched = await fetcher(keyword, location);
      if (fetched.costUsd > 0) await recordAiSpend({ tenantId: input.tenantId, siteId: input.siteId, kind: "youtube_video", provider: PROVIDER, model: RESOURCE, costUsd: fetched.costUsd });
      videos = fetched.videos;
      await storeProviderCache(input.tenantId, PROVIDER, RESOURCE, key, videos, { ttlMs: TTL_MS, negative: videos.length === 0 });
    }
    return pickYoutubeVideo(videos, input.youtube);
  } catch (error) {
    structuredEvent("youtube_video.failed", { tenantId: input.tenantId, siteId: input.siteId, error: error instanceof Error ? error.message : String(error) }, "warn");
    return null;
  }
}
