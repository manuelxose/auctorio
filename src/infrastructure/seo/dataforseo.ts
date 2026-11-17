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

const ENDPOINT = "https://api.dataforseo.com/v3/dataforseo_labs/google/keyword_overview/live";
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

/** Parse a keyword_overview/live response. Throws when the API reports a failure. */
export function parseKeywordOverview(body: unknown): { items: KeywordMetrics[]; costUsd: number } {
  const root = body as { status_code?: number; status_message?: string; cost?: number; tasks?: Array<{ status_code?: number; status_message?: string; result?: Array<{ items?: unknown[] | null }> | null }> };
  if (root?.status_code !== 20000) throw new Error(`dataforseo_error: ${root?.status_code ?? "?"} ${root?.status_message ?? ""}`.trim());
  const items: KeywordMetrics[] = [];
  for (const task of root.tasks ?? []) {
    if (task.status_code !== 20000) throw new Error(`dataforseo_task_error: ${task.status_code ?? "?"} ${task.status_message ?? ""}`.trim());
    for (const result of task.result ?? []) {
      for (const raw of result.items ?? []) {
        const item = raw as { keyword?: string; keyword_info?: { search_volume?: unknown; cpc?: unknown }; keyword_properties?: { keyword_difficulty?: unknown }; search_intent_info?: { main_intent?: unknown } };
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
    }
  }
  return { items, costUsd: num(root.cost) ?? 0 };
}

/** One live call per ≤700 keywords. Keywords without data are simply absent from the result. */
export async function fetchKeywordOverview(
  keywords: string[],
  location: DataForSeoLocation,
  fetchImpl: typeof fetch = fetch,
): Promise<{ items: KeywordMetrics[]; costUsd: number }> {
  const auth = Buffer.from(`${getEnv("DATAFORSEO_LOGIN")}:${getEnv("DATAFORSEO_PASSWORD")}`).toString("base64");
  const out = { items: [] as KeywordMetrics[], costUsd: 0 };
  for (let i = 0; i < keywords.length; i += MAX_KEYWORDS_PER_TASK) {
    const response = await fetchImpl(ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
      body: JSON.stringify([{ keywords: keywords.slice(i, i + MAX_KEYWORDS_PER_TASK), location_code: location.locationCode, language_code: location.languageCode }]),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const body = await response.json().catch(() => null);
    // Errors carry DataForSEO's own reason (e.g. 40104 account not verified), not just the HTTP status.
    if (!response.ok) throw new Error(`dataforseo_http_${response.status}: ${body?.status_code ?? "?"} ${body?.status_message ?? ""}`.trim());
    const parsed = parseKeywordOverview(body);
    out.items.push(...parsed.items);
    out.costUsd += parsed.costUsd;
  }
  return out;
}
