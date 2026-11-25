// DataForSEO client: endpoints, response parsing and (at the end) the adapter behind the provider contract.
// The engine never estimates volume: every number here comes from the provider, or is null.

import { secretOf } from "../ai/ai-settings";
import {
  GOOGLE_LOCATION_CODES,
  NO_WEB,
  SeoProviderError,
  assertNetworkAllowed,
  normalizeKeyword,
  num,
  seoMarket,
  text,
  type KeywordMetrics,
  type KeywordVolume,
  type SeoAdapterResult,
  type DataCapability,
  type SeoCapability,
  type SeoData,
  type SeoErrorCode,
  type SeoMarket,
  type SeoProvider,
  type SeoRequests,
  type SerpResult,
  type YoutubeResult,
} from "./contract";
import { priceQuote } from "./pricing";

export { difficultyLabel, normalizeKeyword } from "./contract";
export type { KeywordMetrics, SerpResult, YoutubeResult } from "./contract";

export type DataForSeoLocation = { locationCode: number; languageCode: string };

const LABS = "https://api.dataforseo.com/v3/dataforseo_labs/google";
const MAX_KEYWORDS_PER_TASK = 700;
const MAX_ADS_KEYWORDS = 1000;
const TIMEOUT_MS = 30_000;

/** Panel credentials win over the server env (the manager loads them first). */
export function dataForSeoConfigured(): boolean {
  return Boolean(secretOf("DATAFORSEO_LOGIN") && secretOf("DATAFORSEO_PASSWORD"));
}

/** "es", "es-ES", "es_MX" → DataForSEO location/language; null when the market is unknown. */
export function dataForSeoLocation(locale: string | null | undefined): DataForSeoLocation | null {
  return locationOf(seoMarket(locale));
}

function locationOf(market: SeoMarket | null): DataForSeoLocation | null {
  const locationCode = market && !market.location ? GOOGLE_LOCATION_CODES[market.country] : undefined;
  return market && locationCode ? { locationCode, languageCode: market.language } : null;
}

/** A failure as DataForSEO states it, with the cost its envelope declares (null = it does not say). */
class DataForSeoFailure extends Error {
  constructor(message: string, readonly costUsd: number | null) {
    super(message);
  }
}

/** Every item of every task result, after DataForSEO's own status checks. costUsd is null when the response omits it. */
function resultItems(body: unknown): { raws: unknown[]; costUsd: number | null } {
  const root = body as { status_code?: number; status_message?: string; cost?: number; tasks?: Array<{ status_code?: number; status_message?: string; result?: Array<{ items?: unknown[] | null }> | null }> };
  if (root?.status_code !== 20000) throw new DataForSeoFailure(`dataforseo_error: ${root?.status_code ?? "?"} ${root?.status_message ?? ""}`.trim(), num(root?.cost));
  const raws: unknown[] = [];
  for (const task of root.tasks ?? []) {
    if (task.status_code !== 20000) throw new DataForSeoFailure(`dataforseo_task_error: ${task.status_code ?? "?"} ${task.status_message ?? ""}`.trim(), num(root.cost));
    for (const result of task.result ?? []) raws.push(...(result.items ?? []));
  }
  return { raws, costUsd: num(root.cost) };
}

/** "2026-11-01 05:12:53 +00:00" → ISO; null when absent or unreadable. */
function isoTime(value: unknown): string | null {
  const time = typeof value === "string" ? Date.parse(value.replace(" ", "T").replace(" ", "")) : Number.NaN;
  return Number.isNaN(time) ? null : new Date(time).toISOString();
}

/** Parse a keyword_overview/live response. Throws when the API reports a failure. */
export function parseKeywordOverview(body: unknown): { items: KeywordMetrics[]; costUsd: number | null } {
  const { raws, costUsd } = resultItems(body);
  const items: KeywordMetrics[] = [];
  for (const raw of raws) {
    // ranked_keywords nests the keyword under keyword_data; overview/ideas items are flat.
    const item = ((raw as { keyword_data?: unknown })?.keyword_data ?? raw) as { keyword?: string; keyword_info?: { search_volume?: unknown; cpc?: unknown; competition?: unknown; competition_level?: unknown; last_updated_time?: unknown }; keyword_properties?: { keyword_difficulty?: unknown }; search_intent_info?: { main_intent?: unknown } };
    if (typeof item?.keyword !== "string") continue;
    const serp = (raw as { ranked_serp_element?: { serp_item?: { rank_absolute?: unknown; url?: unknown; etv?: unknown } } }).ranked_serp_element?.serp_item;
    const competition = { index: num(item.keyword_info?.competition), level: text(item.keyword_info?.competition_level) };
    items.push({
      keyword: normalizeKeyword(item.keyword),
      volume: num(item.keyword_info?.search_volume),
      difficulty: num(item.keyword_properties?.keyword_difficulty),
      cpc: num(item.keyword_info?.cpc),
      intent: typeof item.search_intent_info?.main_intent === "string" ? item.search_intent_info.main_intent : null,
      source: "dataforseo",
      adsCompetition: competition.index === null && competition.level === null ? null : competition,
      asOf: isoTime(item.keyword_info?.last_updated_time),
      rank: serp ? { position: num(serp.rank_absolute), url: text(serp.url) } : null,
      estimatedTraffic: num(serp?.etv),
    });
  }
  return { items, costUsd };
}

/**
 * Organic results (no ads, maps, videos) of the most recent stored SERP snapshot, in ranking order.
 * Live Google SERPs now wrap most URLs in google.com/goto redirects behind a bot check; Labs snapshots keep the real URLs.
 */
export function parseSerpOrganic(body: unknown): { results: SerpResult[]; costUsd: number | null; asOf: string | null } {
  const { raws, costUsd } = resultItems(body);
  const snapshots = raws as Array<{ datetime?: string; items?: unknown[] | null }>;
  const latest = snapshots.reduce<(typeof snapshots)[number] | null>((best, snap) => (!best || String(snap?.datetime ?? "") > String(best.datetime ?? "") ? snap : best), null);
  const results: SerpResult[] = [];
  for (const raw of (latest?.items ?? []) as Array<{ type?: string; url?: unknown; title?: unknown; domain?: unknown; description?: unknown }>) {
    if (raw?.type !== "organic" || typeof raw.url !== "string" || typeof raw.title !== "string" || /google\.com\/goto/.test(raw.url)) continue;
    const domain = typeof raw.domain === "string" ? raw.domain.replace(/^www\./, "") : "";
    results.push({ url: raw.url, title: raw.title, domain, description: typeof raw.description === "string" ? raw.description : "" });
  }
  return { results, costUsd, asOf: isoTime(latest?.datetime) };
}

/** One Labs live task; every Labs keyword endpoint returns items in the keyword_overview shape. */
async function postLabsTask(path: string, task: Record<string, unknown>, location: DataForSeoLocation, fetchImpl: typeof fetch) {
  return parseKeywordOverview(await postLive(`${LABS}/${path}/live`, task, location, fetchImpl));
}

/** Google organic results for a keyword (latest Labs snapshot, up to 100): the real pages a guide can cite as sources. */
export async function fetchSerpOrganic(keyword: string, location: DataForSeoLocation, fetchImpl: typeof fetch = fetch) {
  return parseSerpOrganic(await postLive(`${LABS}/historical_serps/live`, { keyword }, location, fetchImpl));
}

async function postLive(url: string, task: Record<string, unknown>, location: DataForSeoLocation, fetchImpl: typeof fetch): Promise<unknown> {
  assertNetworkAllowed(fetchImpl, "dataforseo");
  const auth = Buffer.from(`${secretOf("DATAFORSEO_LOGIN")}:${secretOf("DATAFORSEO_PASSWORD")}`).toString("base64");
  const response = await fetchImpl(url, {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
    body: JSON.stringify([{ ...task, location_code: location.locationCode, language_code: location.languageCode }]),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const body = await response.json().catch(() => null);
  // Errors carry DataForSEO's own reason (e.g. 40104 account not verified), not just the HTTP status.
  if (!response.ok) throw new DataForSeoFailure(`dataforseo_http_${response.status}: ${body?.status_code ?? "?"} ${body?.status_message ?? ""}`.trim(), num(body?.cost));
  return body;
}

/** One live call (≤700 keywords; the manager splits larger batches). Keywords without data are absent from the result. */
export function fetchKeywordOverview(keywords: string[], location: DataForSeoLocation, fetchImpl: typeof fetch = fetch) {
  return postLabsTask("keyword_overview", { keywords }, location, fetchImpl);
}

/** Real keyword candidates around a seed (keyword_ideas), highest volume first. */
export function fetchKeywordIdeas(seed: string, location: DataForSeoLocation, limit: number, fetchImpl: typeof fetch = fetch) {
  return postLabsTask("keyword_ideas", { keywords: [seed], limit, order_by: ["keyword_info.search_volume,desc"] }, location, fetchImpl);
}

/** Keywords a domain ranks for (ranked_keywords), highest volume first. */
export function fetchRankedKeywords(domain: string, location: DataForSeoLocation, limit: number, fetchImpl: typeof fetch = fetch) {
  return postLabsTask("ranked_keywords", { target: domain, limit, order_by: ["keyword_data.keyword_info.search_volume,desc"] }, location, fetchImpl);
}

/** Video results of a YouTube organic SERP, in ranking order (M6 «one YouTube video per article»). */
export function parseYoutubeOrganic(body: unknown): { videos: YoutubeResult[]; costUsd: number | null } {
  const { raws, costUsd } = resultItems(body);
  const videos: YoutubeResult[] = [];
  for (const raw of raws as Array<{ type?: string; video_id?: unknown; title?: unknown; channel_name?: unknown; channel_url?: unknown }>) {
    if (raw?.type !== "youtube_video" || typeof raw.video_id !== "string" || !/^[\w-]{11}$/.test(raw.video_id) || typeof raw.title !== "string") continue;
    videos.push({ id: raw.video_id, title: raw.title, channel: typeof raw.channel_name === "string" ? raw.channel_name : "", channelUrl: typeof raw.channel_url === "string" ? raw.channel_url : "" });
  }
  return { videos, costUsd };
}

export async function fetchYoutubeOrganic(keyword: string, location: DataForSeoLocation, fetchImpl: typeof fetch = fetch) {
  return parseYoutubeOrganic(await postLive("https://api.dataforseo.com/v3/serp/youtube/organic/live/advanced", { keyword, depth: 20 }, location, fetchImpl));
}

/**
 * Google Ads search volume (keywords_data) for keywords Labs has no data for (M2 fallback). Volume only, in the
 * bucketed values Google Ads reports (10, 50, 140…); keywords Google returns no volume for are absent.
 */
export function parseGoogleAdsVolume(body: unknown): { items: KeywordVolume[]; costUsd: number | null } {
  const root = body as { status_code?: number; status_message?: string; cost?: number; tasks?: Array<{ status_code?: number; status_message?: string; result?: Array<{ keyword?: unknown; search_volume?: unknown }> | null }> };
  if (root?.status_code !== 20000) throw new DataForSeoFailure(`dataforseo_error: ${root?.status_code ?? "?"} ${root?.status_message ?? ""}`.trim(), num(root?.cost));
  const items: KeywordVolume[] = [];
  for (const task of root.tasks ?? []) {
    if (task.status_code !== 20000) throw new DataForSeoFailure(`dataforseo_task_error: ${task.status_code ?? "?"} ${task.status_message ?? ""}`.trim(), num(root.cost));
    for (const row of task.result ?? []) {
      if (typeof row.keyword === "string" && typeof row.search_volume === "number") items.push({ keyword: normalizeKeyword(row.keyword), volume: row.search_volume });
    }
  }
  return { items, costUsd: num(root.cost) };
}

export async function fetchGoogleAdsVolume(keywords: string[], location: DataForSeoLocation, fetchImpl: typeof fetch = fetch) {
  return parseGoogleAdsVolume(await postLive("https://api.dataforseo.com/v3/keywords_data/google_ads/search_volume/live", { keywords }, location, fetchImpl));
}

// ---- Adapter behind the provider contract ----

const ID = "dataforseo";
/** DataForSEO failures as contract errors; the original message (status, DataForSEO code and reason) is kept. */
function toSeoError(error: unknown): SeoProviderError {
  if (error instanceof SeoProviderError) return error;
  const name = error instanceof Error ? error.name : "";
  const message = (error instanceof Error ? error.message : String(error)).slice(0, 300);
  const match = /^dataforseo_(?:http_(\d+)|error|task_error): ?(\d+)?/.exec(message);
  const status = match?.[1] ?? "";
  const detail = match?.[2] ?? "";
  let code: SeoErrorCode = "upstream_error";
  if (name === "TimeoutError" || name === "AbortError") code = "timeout";
  else if (status === "401" || status === "403" || detail.startsWith("401")) code = "invalid_credentials";
  else if (status === "402" || detail === "40200" || detail === "40210") code = "insufficient_balance";
  else if (status === "429" || detail === "40202") code = "rate_limited";
  else if (match && !status && !detail) code = "malformed_response"; // 200 without DataForSEO's envelope
  else if (status.startsWith("4") || detail.startsWith("4")) code = "bad_request";
  else if (!match && error instanceof TypeError && name === "TypeError" && !/fetch/i.test(message)) code = "malformed_response";
  // Refused credentials or balance are never charged; any other failure costs what the envelope says, or is unknown.
  const free = code === "invalid_credentials" || code === "insufficient_balance";
  return new SeoProviderError(code, message, ID, (error instanceof DataForSeoFailure ? error.costUsd : null) ?? (free ? 0 : null));
}

const result = <C extends SeoCapability>(data: SeoData[C], billedUsd: number | null, asOf: string | null = null): SeoAdapterResult<C> => ({
  data, billedUsd, asOf, upstream: null, partial: false, nextCursor: null, notes: [],
});

type Handlers = { [C in DataCapability]: (request: SeoRequests[C], location: DataForSeoLocation, fetchImpl: typeof fetch) => Promise<SeoAdapterResult<C>> };

const handlers: Handlers = {
  keyword_metrics: async ({ keywords }, location, fetchImpl) => {
    const { items, costUsd } = await fetchKeywordOverview(keywords, location, fetchImpl);
    return result<"keyword_metrics">(items, costUsd);
  },
  keyword_suggestions: async ({ seed, limit }, location, fetchImpl) => {
    const { items, costUsd } = await fetchKeywordIdeas(seed, location, limit, fetchImpl);
    return result<"keyword_suggestions">(items, costUsd);
  },
  ranked_keywords: async ({ domain, limit }, location, fetchImpl) => {
    const { items, costUsd } = await fetchRankedKeywords(domain, location, limit, fetchImpl);
    return result<"ranked_keywords">(items, costUsd);
  },
  serp_organic: async ({ keyword }, location, fetchImpl) => {
    const { results, costUsd, asOf } = await fetchSerpOrganic(keyword, location, fetchImpl);
    return result<"serp_organic">(results, costUsd, asOf);
  },
  search_volume: async ({ keywords }, location, fetchImpl) => {
    const { items, costUsd } = await fetchGoogleAdsVolume(keywords, location, fetchImpl);
    return result<"search_volume">(items, costUsd);
  },
  youtube_search: async ({ keyword }, location, fetchImpl) => {
    const { videos, costUsd } = await fetchYoutubeOrganic(keyword, location, fetchImpl);
    return result<"youtube_search">(videos, costUsd);
  },
};

const METRIC_KINDS = { volume: "provider_reported", cpc: "provider_reported", adsCompetition: "provider_reported", difficulty: "estimated", intent: "estimated" } as const;
const NO_OPTIONS = { devices: [], pagination: false, degraded: null };

export const dataForSeoProvider: SeoProvider = {
  id: ID,
  label: "DataForSEO",
  credentials: [{ envName: "DATAFORSEO_LOGIN", label: "API login" }, { envName: "DATAFORSEO_PASSWORD", label: "API password" }],
  capabilities: {
    keyword_metrics: { supported: true, sourceTag: ID, dataKind: "provider_reported", fieldKinds: METRIC_KINDS, methodology: "DataForSEO Labs keyword_overview (monthly refresh); difficulty is DataForSEO's own 0–100 model", engine: "google", maxBatch: MAX_KEYWORDS_PER_TASK, maxResults: null, ...NO_OPTIONS },
    keyword_suggestions: { supported: true, sourceTag: ID, dataKind: "provider_reported", fieldKinds: METRIC_KINDS, methodology: "DataForSEO Labs keyword_ideas, by search volume", engine: "google", maxBatch: 1, maxResults: 1000, ...NO_OPTIONS },
    ranked_keywords: { supported: true, sourceTag: ID, dataKind: "historical", fieldKinds: { ...METRIC_KINDS, rank: "historical", estimatedTraffic: "estimated" }, methodology: "DataForSEO Labs ranked_keywords: positions from stored SERPs", engine: "google", maxBatch: 1, maxResults: 1000, ...NO_OPTIONS },
    serp_organic: { supported: true, sourceTag: ID, dataKind: "historical", methodology: "Latest stored Google SERP snapshot (Labs historical_serps), not a live search", engine: "google", maxBatch: 1, maxResults: 100, ...NO_OPTIONS },
    search_volume: { supported: true, sourceTag: "dataforseo_google_ads", dataKind: "provider_reported", methodology: "Google Ads search volume in Google's buckets", engine: "google", maxBatch: MAX_ADS_KEYWORDS, maxResults: null, ...NO_OPTIONS },
    youtube_search: { supported: true, sourceTag: ID, dataKind: "observed", methodology: "Live YouTube organic results", engine: "youtube", maxBatch: 1, maxResults: 20, ...NO_OPTIONS },
    ...NO_WEB,
  },
  licensing: {
    termsUrl: "https://dataforseo.com/terms-of-service",
    checkedAt: "2026-11-24",
    commercialUse: "unverified",
    storage: "unverified",
    crossTenantSharing: "unverified",
    upstream: "first_party",
    notes: ["Existing accepted integration; its resale, storage and sharing clauses were not established in SEO-V2-01, so cached data stays per tenant."],
  },
  rateLimit: null,
  verifiedMarkets: [],
  configured: dataForSeoConfigured,
  marketKey(_capability, market) {
    const location = locationOf(market);
    return location ? `${location.locationCode}|${location.languageCode}` : null; // format of the keys already cached
  },
  quote(capability, request) {
    const { keywords, limit } = request as { keywords?: string[]; limit?: number };
    return priceQuote(ID, capability, keywords?.length ?? limit ?? 1);
  },
  async run<C extends SeoCapability>(capability: C, request: SeoRequests[C], fetchImpl: typeof fetch): Promise<SeoAdapterResult<C>> {
    const handler = handlers[capability as DataCapability] as unknown as ((request: SeoRequests[C], location: DataForSeoLocation, fetchImpl: typeof fetch) => Promise<SeoAdapterResult<C>>) | undefined;
    if (!handler) throw new SeoProviderError("unsupported_capability", `${ID}: ${capability} is not supported`, ID, 0);
    const location = locationOf(request.market);
    if (!location) throw new SeoProviderError("unsupported_market", `${ID}: market ${request.market.locale} is not supported`, ID);
    try {
      return await handler(request, location, fetchImpl);
    } catch (error) {
      throw toSeoError(error);
    }
  },
};
