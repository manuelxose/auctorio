// DataForSEO Labs keyword metrics (search volume + keyword difficulty).
// The engine never estimates volume: every number here comes from the provider, or is null.

import { getEnv } from "../../shared/utils/env";

export type KeywordMetrics = {
  keyword: string;
  volume: number | null;
  difficulty: number | null; // 0–100, DataForSEO keyword_difficulty
  cpc: number | null;
  intent: string | null;
  source: "dataforseo";
};

export type DataForSeoLocation = { locationCode: number; languageCode: string };

const LABS = "https://api.dataforseo.com/v3/dataforseo_labs/google";
const MAX_KEYWORDS_PER_TASK = 700;
const TIMEOUT_MS = 30_000;

// shortcut: only the markets we publish in; add a row when a site targets another country.
const LOCATION_CODES: Record<string, number> = { ES: 2724, US: 2840, GB: 2826, MX: 2484, AR: 2032, FR: 2250, DE: 2276, IT: 2380, PT: 2620 };
const DEFAULT_COUNTRY: Record<string, string> = { es: "ES", en: "US", fr: "FR", de: "DE", it: "IT", pt: "PT" };

export function dataForSeoConfigured(): boolean {
  return Boolean(getEnv("DATAFORSEO_LOGIN") && getEnv("DATAFORSEO_PASSWORD"));
}

/** "es", "es-ES", "es_MX" → DataForSEO location/language; null when the market is unknown. */
export function dataForSeoLocation(locale: string | null | undefined): DataForSeoLocation | null {
  const [lang, country] = (locale ?? "").trim().replace("_", "-").split("-");
  const languageCode = lang?.toLowerCase();
  if (!languageCode) return null;
  const locationCode = LOCATION_CODES[(country ?? DEFAULT_COUNTRY[languageCode] ?? "").toUpperCase()];
  return locationCode ? { locationCode, languageCode } : null;
}

/** BLG-style label derived from the 0–100 difficulty (never stored). */
export function difficultyLabel(difficulty: number | null | undefined): "easy" | "medium" | "hard" | "very_hard" | null {
  if (typeof difficulty !== "number") return null;
  if (difficulty < 30) return "easy";
  if (difficulty < 50) return "medium";
  if (difficulty < 70) return "hard";
  return "very_hard";
}

export function normalizeKeyword(keyword: string): string {
  return keyword.trim().replace(/\s+/g, " ").toLowerCase();
}

const num = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null);

/** Every item of every task result, after DataForSEO's own status checks. */
function resultItems(body: unknown): { raws: unknown[]; costUsd: number } {
  const root = body as { status_code?: number; status_message?: string; cost?: number; tasks?: Array<{ status_code?: number; status_message?: string; result?: Array<{ items?: unknown[] | null }> | null }> };
  if (root?.status_code !== 20000) throw new Error(`dataforseo_error: ${root?.status_code ?? "?"} ${root?.status_message ?? ""}`.trim());
  const raws: unknown[] = [];
  for (const task of root.tasks ?? []) {
    if (task.status_code !== 20000) throw new Error(`dataforseo_task_error: ${task.status_code ?? "?"} ${task.status_message ?? ""}`.trim());
    for (const result of task.result ?? []) raws.push(...(result.items ?? []));
  }
  return { raws, costUsd: num(root.cost) ?? 0 };
}

/** Parse a keyword_overview/live response. Throws when the API reports a failure. */
export function parseKeywordOverview(body: unknown): { items: KeywordMetrics[]; costUsd: number } {
  const { raws, costUsd } = resultItems(body);
  const items: KeywordMetrics[] = [];
  for (const raw of raws) {
    // ranked_keywords nests the keyword under keyword_data; overview/ideas items are flat.
    const item = ((raw as { keyword_data?: unknown })?.keyword_data ?? raw) as { keyword?: string; keyword_info?: { search_volume?: unknown; cpc?: unknown }; keyword_properties?: { keyword_difficulty?: unknown }; search_intent_info?: { main_intent?: unknown } };
    if (typeof item.keyword !== "string") continue;
    items.push({
      keyword: normalizeKeyword(item.keyword),
      volume: num(item.keyword_info?.search_volume),
      difficulty: num(item.keyword_properties?.keyword_difficulty),
      cpc: num(item.keyword_info?.cpc),
      intent: typeof item.search_intent_info?.main_intent === "string" ? item.search_intent_info.main_intent : null,
      source: "dataforseo",
    });
  }
  return { items, costUsd };
}

export type SerpResult = { url: string; title: string; domain: string; description: string };

/**
 * Organic results (no ads, maps, videos) of the most recent stored SERP snapshot, in ranking order.
 * Live Google SERPs now wrap most URLs in google.com/goto redirects behind a bot check; Labs snapshots keep the real URLs.
 */
export function parseSerpOrganic(body: unknown): { results: SerpResult[]; costUsd: number } {
  const { raws, costUsd } = resultItems(body);
  const snapshots = raws as Array<{ datetime?: string; items?: unknown[] | null }>;
  const latest = snapshots.reduce<(typeof snapshots)[number] | null>((best, snap) => (!best || String(snap?.datetime ?? "") > String(best.datetime ?? "") ? snap : best), null);
  const results: SerpResult[] = [];
  for (const raw of (latest?.items ?? []) as Array<{ type?: string; url?: unknown; title?: unknown; domain?: unknown; description?: unknown }>) {
    if (raw?.type !== "organic" || typeof raw.url !== "string" || typeof raw.title !== "string" || /google\.com\/goto/.test(raw.url)) continue;
    const domain = typeof raw.domain === "string" ? raw.domain.replace(/^www\./, "") : "";
    results.push({ url: raw.url, title: raw.title, domain, description: typeof raw.description === "string" ? raw.description : "" });
  }
  return { results, costUsd };
}

/** One Labs live task; every Labs keyword endpoint returns items in the keyword_overview shape. */
async function postLabsTask(
  path: string,
  task: Record<string, unknown>,
  location: DataForSeoLocation,
  fetchImpl: typeof fetch,
): Promise<{ items: KeywordMetrics[]; costUsd: number }> {
  return parseKeywordOverview(await postLive(`${LABS}/${path}/live`, task, location, fetchImpl));
}

/** Google organic results for a keyword (latest Labs snapshot, up to 100): the real pages a guide can cite as sources. */
export async function fetchSerpOrganic(keyword: string, location: DataForSeoLocation, fetchImpl: typeof fetch = fetch) {
  return parseSerpOrganic(await postLive(`${LABS}/historical_serps/live`, { keyword }, location, fetchImpl));
}

async function postLive(url: string, task: Record<string, unknown>, location: DataForSeoLocation, fetchImpl: typeof fetch): Promise<unknown> {
  const auth = Buffer.from(`${getEnv("DATAFORSEO_LOGIN")}:${getEnv("DATAFORSEO_PASSWORD")}`).toString("base64");
  const response = await fetchImpl(url, {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
    body: JSON.stringify([{ ...task, location_code: location.locationCode, language_code: location.languageCode }]),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const body = await response.json().catch(() => null);
  // Errors carry DataForSEO's own reason (e.g. 40104 account not verified), not just the HTTP status.
  if (!response.ok) throw new Error(`dataforseo_http_${response.status}: ${body?.status_code ?? "?"} ${body?.status_message ?? ""}`.trim());
  return body;
}

/** One live call per ≤700 keywords. Keywords without data are simply absent from the result. */
export async function fetchKeywordOverview(
  keywords: string[],
  location: DataForSeoLocation,
  fetchImpl: typeof fetch = fetch,
): Promise<{ items: KeywordMetrics[]; costUsd: number }> {
  const out = { items: [] as KeywordMetrics[], costUsd: 0 };
  for (let i = 0; i < keywords.length; i += MAX_KEYWORDS_PER_TASK) {
    const parsed = await postLabsTask("keyword_overview", { keywords: keywords.slice(i, i + MAX_KEYWORDS_PER_TASK) }, location, fetchImpl);
    out.items.push(...parsed.items);
    out.costUsd += parsed.costUsd;
  }
  return out;
}

/** Real keyword candidates around a seed (keyword_ideas), highest volume first. */
export function fetchKeywordIdeas(seed: string, location: DataForSeoLocation, limit: number, fetchImpl: typeof fetch = fetch) {
  return postLabsTask("keyword_ideas", { keywords: [seed], limit, order_by: ["keyword_info.search_volume,desc"] }, location, fetchImpl);
}

/** Keywords a domain ranks for (ranked_keywords), highest volume first. */
export function fetchRankedKeywords(domain: string, location: DataForSeoLocation, limit: number, fetchImpl: typeof fetch = fetch) {
  return postLabsTask("ranked_keywords", { target: domain, limit, order_by: ["keyword_data.keyword_info.search_volume,desc"] }, location, fetchImpl);
}
