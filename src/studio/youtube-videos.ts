// One YouTube video per guide (BLG parity M6): the top YouTube result for the keyword, optionally only from the
// site's own channel. Best effort like serp-sources: no provider, no market or provider error → no video.

import { normalizeKeyword } from "../infrastructure/seo/contract";
import { acquireSeo, seoRoute } from "./seo-manager";
import { structuredEvent } from "../shared/utils/logger";
import { pickYoutubeVideo, type VisualSettings, type YoutubeVideo } from "./editorial-engine/visuals";

export async function youtubeVideoFor(
  input: { tenantId: string; siteId: string; locale: string | null; keyword: string; youtube: VisualSettings["youtube"] },
  fetchImpl: typeof fetch = fetch,
): Promise<YoutubeVideo | null> {
  const keyword = normalizeKeyword(input.keyword);
  if (!input.youtube.enabled || !keyword) return null;
  try {
    const route = await seoRoute("youtube_search", input.locale);
    if (!route.provider) return null;
    const { data } = await acquireSeo(route, "youtube_search", { keyword }, { tenantId: input.tenantId, siteId: input.siteId, kind: "youtube_video", fetchImpl, priority: "background", decision: { importance: "low" } });
    return pickYoutubeVideo(data, input.youtube);
  } catch (error) {
    structuredEvent("youtube_video.failed", { tenantId: input.tenantId, siteId: input.siteId, error: error instanceof Error ? error.message : String(error) }, "warn");
    return null;
  }
}
