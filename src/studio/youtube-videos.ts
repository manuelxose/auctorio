// One YouTube video per guide (BLG parity M6). From the site's approved videos, then its own channel's public feed, then
// stored search results; a search is bought only when the article calls for a video (SEO-V2-05). Best effort: without one,
// the article goes without video.

import { XMLParser } from "fast-xml-parser";
import { fetchUrl } from "../infrastructure/scraping";
import { SeoProviderError, assertNetworkAllowed, normalizeKeyword } from "../infrastructure/seo/contract";
import { structuredEvent } from "../shared/utils/logger";
import { youtubeCandidates, type VisualSettings, type YoutubeVideo } from "./editorial-engine/visuals";
import { lookupProviderCache, storeProviderCache } from "./enrichment/provider-cache";
import { keywordTokens } from "./keyword-candidates";
import { loadSeoControl } from "./seo-control";
import { acquireSeo, readStoredSeo, seoRoute, type SeoScope } from "./seo-manager";

const DAY_MS = 86_400_000;
const CACHE = "youtube";

export type VideoState = "approved" | "own_channel" | "reused" | "acquired" | "not_needed" | "none_relevant" | "unavailable" | "disabled";
export type VideoOutcome = { video: YoutubeVideo | null; state: VideoState; code: string | null };

/** At least half of the keyword's words are in the title. */
export function isRelevantVideo(keyword: string, title: string): boolean {
  const wanted = keywordTokens(keyword);
  const words = new Set(keywordTokens(title));
  return wanted.length > 0 && wanted.filter((token) => words.has(token)).length >= Math.ceil(wanted.length / 2);
}

/** Uploads of a channel from its public feed (about the last 15). Only for channel URLs that carry the id. */
async function channelUploads(tenantId: string, channelUrl: string, online: boolean, fetchImpl?: typeof fetch): Promise<YoutubeVideo[]> {
  const id = /youtube\.com\/channel\/(UC[\w-]{22})/.exec(channelUrl)?.[1];
  if (!id) return [];
  const cached = await lookupProviderCache(tenantId, CACHE, "channel_feed", id);
  if (cached.hit) return cached.negative ? [] : (cached.payload as YoutubeVideo[]);
  if (!online) return [];
  const url = new URL(`https://www.youtube.com/feeds/videos.xml?channel_id=${id}`);
  let body: string;
  if (fetchImpl) body = await (await fetchImpl(url.toString())).text();
  else {
    assertNetworkAllowed(fetch, CACHE);
    body = (await fetchUrl(url, { accept: "application/xml" })).body;
  }
  const feed = new XMLParser({ ignoreAttributes: true }).parse(body)?.feed;
  const entries = (Array.isArray(feed?.entry) ? feed.entry : feed?.entry ? [feed.entry] : []) as Array<Record<string, unknown>>;
  const videos = entries.flatMap((entry) => {
    const video = String(entry["yt:videoId"] ?? "");
    return /^[\w-]{11}$/.test(video) ? [{ id: video, title: String(entry.title ?? ""), channel: String(feed.title ?? ""), channelUrl: `https://www.youtube.com/channel/${id}` }] : [];
  });
  await storeProviderCache(tenantId, CACHE, "channel_feed", id, videos, { ttlMs: DAY_MS, negative: videos.length === 0 });
  return videos;
}

/** YouTube's own oEmbed answers 401/403/404 for a video that cannot be embedded or is gone. Unreachable = not known, not refused. */
async function isEmbeddable(tenantId: string, id: string, online: boolean, fetchImpl?: typeof fetch): Promise<boolean> {
  const cached = await lookupProviderCache(tenantId, CACHE, "oembed", id);
  if (cached.hit) return !cached.negative;
  if (!online) return true;
  try {
    assertNetworkAllowed(fetchImpl ?? fetch, CACHE);
    const response = await (fetchImpl ?? fetch)(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}`, { redirect: "error", signal: AbortSignal.timeout(8_000) });
    const refused = [400, 401, 403, 404].includes(response.status);
    if (response.ok || refused) await storeProviderCache(tenantId, CACHE, "oembed", id, {}, { ttlMs: 7 * DAY_MS, negative: refused });
    return !refused;
  } catch {
    return true;
  }
}

export async function youtubeVideoFor(
  input: { tenantId: string; siteId: string; locale: string | null; keyword: string; youtube: VisualSettings["youtube"]; /** The article calls for a video: a search may be bought. */ needed: boolean; reuseOnly?: boolean },
  fetchImpl?: typeof fetch,
): Promise<VideoOutcome> {
  const { tenantId, siteId, youtube } = input;
  const keyword = normalizeKeyword(input.keyword);
  if (!youtube.enabled || !keyword) return { video: null, state: "disabled", code: null };
  // Free and official, but the emergency stop stops them too.
  const online = !(await loadSeoControl()).emergencyStop;
  const firstUsable = async (videos: YoutubeVideo[]) => {
    for (const video of videos.filter((entry) => isRelevantVideo(keyword, entry.title)).slice(0, 5)) if (await isEmbeddable(tenantId, video.id, online, fetchImpl)) return video;
    return null;
  };
  try {
    const approved = await firstUsable(youtube.approved.map((entry) => ({ ...entry, channel: "", channelUrl: "" })));
    if (approved) return { video: approved, state: "approved", code: null };
    const own = await firstUsable(await channelUploads(tenantId, youtube.channelUrl, online, fetchImpl).catch(() => []));
    if (own) return { video: own, state: "own_channel", code: null };
    const route = await seoRoute("youtube_search", input.locale);
    const scope: SeoScope = { tenantId, siteId, kind: "youtube_video", fetchImpl, priority: "background", decision: { importance: "low" } };
    const answer = route.provider ? await acquireSeo(route, "youtube_search", { keyword }, { ...scope, reuseOnly: input.reuseOnly || !input.needed }) : await readStoredSeo("youtube_search", input.locale, { keyword }, scope);
    if (!answer) return { video: null, state: input.needed ? "unavailable" : "not_needed", code: (route as { reason: string }).reason };
    const { data, meta } = answer;
    // The site's own channel first, when it has one; only it, when the site says so.
    const ownFirst = youtube.channelUrl ? youtubeCandidates(data, { channelOnly: true, channelUrl: youtube.channelUrl }) : [];
    const video = await firstUsable([...ownFirst, ...youtubeCandidates(data, youtube).filter((entry) => !ownFirst.includes(entry))]);
    return { video, state: video ? (meta.cache.bought ? "acquired" : "reused") : "none_relevant", code: null };
  } catch (error) {
    const code = error instanceof SeoProviderError ? error.code : "error";
    if (code === "reuse_only") return { video: null, state: "not_needed", code: null };
    structuredEvent("youtube_video.failed", { tenantId, siteId, code, error: error instanceof Error ? error.message : String(error) }, "warn");
    return { video: null, state: "unavailable", code };
  }
}
