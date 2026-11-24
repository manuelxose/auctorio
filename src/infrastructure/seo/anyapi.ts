// AnyAPI (getanyapi.com, AnyAPI Labs, Inc.) adapter, written against https://api.getanyapi.com/openapi.json and /catalog
// as read on 2026-11-24 (docs/seo-v2/provider-capabilities.md). Each operation was called once for es-ES on that date and answered as documented.

import { secretOf } from "../ai/ai-settings";
import {
  GOOGLE_LOCATION_CODES,
  SeoProviderError,
  assertNetworkAllowed,
  normalizeKeyword,
  num,
  text,
  type KeywordMetrics,
  type SeoAdapterResult,
  type SeoCapability,
  type SeoData,
  type SeoErrorCode,
  type SeoMarket,
  type SeoProvider,
  type SeoQuote,
  type SeoRequests,
} from "./contract";

const ID = "anyapi";
const BASE = "https://api.getanyapi.com/v1/run/";
const KEY_ENV = "ANYAPI_API_KEY";
const TIMEOUT_MS = 45_000; // google.search's first lane has a 9 s median
const MAX_KEYWORD_CHARS = 80;

type Row = Record<string, unknown>;
type Parsed<C extends SeoCapability> = { data: SeoData[C]; dropped: number; nextCursor?: string | null; notes?: string[] };
type Operation<C extends SeoCapability> = {
  sku: string;
  body(request: SeoRequests[C]): Record<string, unknown>;
  /** Name of the array inside output.data. */
  list: string;
  rows(rows: Row[], data: Row, request: SeoRequests[C]): Parsed<C>;
  quote(request: SeoRequests[C]): SeoQuote;
};

// Published prices (catalog, 2026-11-24). max is sent as max_cost_usd, so AnyAPI refuses, uncharged, a dearer call.
const linear = (base: number, per: number, units: number, unit: string): SeoQuote => ({ estimatedUsd: base + per * units, maxUsd: base + per * units, unit, units });
const flat = (usd: number, maxUsd: number): SeoQuote => ({ estimatedUsd: usd, maxUsd, unit: "request", units: 1 });

const isoSeconds = (value: unknown): string | null => {
  const seconds = num(value);
  return seconds === null || seconds <= 0 || seconds > 1e11 ? null : new Date(seconds * 1000).toISOString();
};
const geo = (market: SeoMarket) => ({ language: market.language, location: GOOGLE_LOCATION_CODES[market.country] });
const within = (value: unknown, max: number): number | null => {
  const number = num(value);
  return number !== null && number >= 0 && number <= max ? number : null;
};

function metricRows(rows: Row[]): { data: KeywordMetrics[]; dropped: number } {
  const data: KeywordMetrics[] = [];
  for (const row of rows) {
    const keyword = text(row?.keyword);
    if (!keyword) continue;
    const level = text(row.competition);
    data.push({
      keyword: normalizeKeyword(keyword),
      volume: within(row.searchVolume, Number.MAX_SAFE_INTEGER),
      difficulty: within(row.keywordDifficulty, 100),
      cpc: within(row.cpc, Number.MAX_SAFE_INTEGER),
      intent: text(row.searchIntent)?.toLowerCase() ?? null,
      source: ID,
      adsCompetition: level ? { index: null, level } : null,
      asOf: isoSeconds(row.updatedUtc),
      rank: row.rankAbsolute === undefined ? null : { position: within(row.rankAbsolute, 1000), url: text(row.url) },
      estimatedTraffic: within(row.etv, Number.MAX_SAFE_INTEGER),
    });
  }
  return { data, dropped: rows.length - data.length };
}

/** Over-long keywords would make AnyAPI reject the whole batch. */
const sendable = (keywords: string[]) => keywords.filter((keyword) => keyword.length <= MAX_KEYWORD_CHARS);
const skipped = (keywords: string[]) => keywords.length - sendable(keywords).length;

const operations: { [C in SeoCapability]: Operation<C> } = {
  keyword_metrics: {
    sku: "seo.keyword_overview",
    list: "keywords",
    body: ({ keywords, market }) => ({ keywords: sendable(keywords), ...geo(market) }),
    rows: (rows, _data, { keywords }) => {
      const parsed = metricRows(rows);
      return { ...parsed, dropped: parsed.dropped + skipped(keywords) };
    },
    quote: ({ keywords }) => linear(0.01438, 0.00016, keywords.length, "base + keyword"),
  },
  keyword_suggestions: {
    sku: "seo.keyword_ideas", // same semantics as the Labs keyword_ideas in use; seo.keyword_suggestions only extends the phrase
    list: "ideas",
    body: ({ seed, limit, market }) => ({ keywords: [seed], limit, orderBy: "volume_desc", ...geo(market) }),
    rows: (rows) => metricRows(rows),
    quote: ({ limit }) => linear(0.01496, 0.00016, limit, "base + result"),
  },
  ranked_keywords: {
    sku: "seo.ranked_keywords",
    list: "rankedKeywords",
    body: ({ domain, limit, cursor, market }) => ({ target: domain, limit, offset: pageNumber(cursor, 0), orderBy: "volume_desc", ...geo(market) }),
    rows: (rows, _data, { limit, cursor }) => ({ ...metricRows(rows), nextCursor: rows.length === limit ? String(pageNumber(cursor, 0) + limit) : null }),
    quote: ({ limit }) => linear(0.01496, 0.00016, limit, "base + result"),
  },
  serp_organic: {
    sku: "google.search",
    list: "results",
    body: ({ keyword, cursor, market }) => ({ query: keyword, gl: market.country.toLowerCase(), hl: market.language, page: pageNumber(cursor, 1) }),
    rows: (rows, _data, { cursor }) => {
      const valid = rows.filter((row) => text(row?.link) && text(row?.title));
      // google.com/goto links hide the destination: the page cannot be cited.
      const direct = valid.filter((row) => !/google\.[a-z.]+\/(goto|url)/.test(String(row.link)));
      const data: SeoData["serp_organic"] = [];
      for (const row of direct) {
        try {
          data.push({ url: String(row.link), title: String(row.title), domain: new URL(String(row.link)).hostname.replace(/^www\./, ""), description: text(row.snippet) ?? "" });
        } catch {
          // not a URL: counted as dropped below
        }
      }
      const hidden = valid.length - direct.length;
      return { data, dropped: rows.length - hidden - data.length, nextCursor: rows.length ? String(pageNumber(cursor, 1) + 1) : null, notes: hidden ? [`redirect_links_dropped:${hidden}`] : [] };
    },
    quote: () => flat(0.0005, 0.002),
  },
  search_volume: {
    sku: "seo.search_volume",
    list: "keywords",
    body: ({ keywords, market }) => ({ keywords: sendable(keywords), ...geo(market) }),
    rows: (rows, _data, { keywords }) => {
      const named = rows.filter((row) => text(row?.keyword));
      const data = named.flatMap((row) => {
        const volume = within(row.searchVolume, Number.MAX_SAFE_INTEGER);
        return volume === null ? [] : [{ keyword: normalizeKeyword(String(row.keyword)), volume }];
      });
      return { data, dropped: rows.length - named.length + skipped(keywords) };
    },
    quote: () => flat(0.108, 0.108),
  },
  youtube_search: {
    sku: "youtube.search",
    list: "videos",
    body: ({ keyword, cursor }) => ({ query: keyword, ...(cursor ? { cursor } : {}) }),
    rows: (rows, data) => {
      const valid = rows.filter((row) => /^[\w-]{11}$/.test(String(row?.id ?? "")) && text(row.title));
      return {
        data: valid.map((row) => ({ id: String(row.id), title: String(row.title), channel: text(row.channel) ?? "", channelUrl: /^UC[\w-]{22}$/.test(String(row.authorId ?? "")) ? `https://www.youtube.com/channel/${row.authorId}` : "" })),
        dropped: rows.length - valid.length,
        nextCursor: text(data.nextCursor),
      };
    },
    quote: () => flat(0.00034, 0.0012),
  },
};

function pageNumber(cursor: string | undefined, first: number): number {
  const page = cursor === undefined ? first : Number(cursor);
  if (!Number.isInteger(page) || page < first) throw new SeoProviderError("bad_request", `${ID}: invalid cursor`, ID, 0);
  return page;
}

/** Documented statuses only; anything else is an upstream error. Codes refine 402/429. */
function statusCode(status: number): SeoErrorCode {
  if (status === 401 || status === 403) return "invalid_credentials";
  if (status === 402) return "insufficient_balance";
  if (status === 429) return "rate_limited";
  if (status === 400 || status === 404 || status === 409 || status === 422) return "bad_request";
  return "upstream_error";
}

async function call<C extends SeoCapability>(capability: C, request: SeoRequests[C], fetchImpl: typeof fetch): Promise<SeoAdapterResult<C>> {
  const operation = operations[capability] as unknown as Operation<C>;
  const body = operation.body(request);
  if (Array.isArray(body.keywords) && body.keywords.length === 0) throw new SeoProviderError("bad_request", `${ID}: no keyword can be sent (over ${MAX_KEYWORD_CHARS} characters)`, ID, 0);
  const quote = operation.quote(request);
  assertNetworkAllowed(fetchImpl, ID);
  let response: Response;
  let payload: Row | null;
  try {
    response = await fetchImpl(`${BASE}${operation.sku}?max_cost_usd=${Number(quote.maxUsd!.toFixed(6))}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${secretOf(KEY_ENV)}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      redirect: "error", // the key must not follow a redirect
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    payload = (await response.json().catch((error: unknown) => {
      if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) throw error;
      return null;
    })) as Row | null;
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    const timeout = name === "TimeoutError" || name === "AbortError";
    throw new SeoProviderError(timeout ? "timeout" : "upstream_error", `${ID}: ${timeout ? "timed out" : "network error"} (${operation.sku})`, ID);
  }
  const payment = (payload?.payment ?? null) as Row | null;
  const charged = within(payload?.costUsd, 1000) ?? within(payment?.costUsd, 1000);
  if (!response.ok) {
    const reason = [text(payload?.code), text(payload?.error)].filter(Boolean).join(" ").slice(0, 200);
    // A 429 rate_limited and a rejected input are documented as never charged; other failures may be, at an amount the response states.
    const free = payload?.code === "rate_limited" || payload?.code === "invalid_input" || response.status === 401;
    throw new SeoProviderError(statusCode(response.status), `${ID}_http_${response.status}: ${reason || "no reason given"}`, ID, charged ?? (free ? 0 : null));
  }

  // 200: { output: { found, data }, costUsd, items, replayed, source }
  const output = payload?.output as Row | null | undefined;
  const malformed = (what: string) => new SeoProviderError("malformed_response", `${ID}: ${what} (${operation.sku})`, ID, charged);
  if (!output || typeof output.found !== "boolean") throw malformed("response without output.found");
  const source = payload?.source as Row | undefined;
  const base = { billedUsd: payload?.replayed === true ? 0 : charged, asOf: null, upstream: text(source?.name) ?? text(source?.id), notes: [] as string[] };
  if (!output.found) return { ...base, data: [] as unknown as SeoData[C], partial: false, nextCursor: null };
  const data = output.data as Row | null;
  const rows = data?.[operation.list];
  if (!data || !Array.isArray(rows)) throw malformed(`response without data.${operation.list}`);
  const parsed = operation.rows(rows as Row[], data, request);
  if (rows.length > 0 && parsed.data.length === 0 && parsed.dropped >= rows.length) throw malformed("no row matches the documented schema");
  const hint = text(payload?.hint);
  const notes = [...(parsed.notes ?? []), ...(hint ? [`hint:${hint.slice(0, 120)}`] : [])];
  const market = `${request.market.country}|${request.market.language}`;
  if (capability !== "youtube_search" && !anyApiProvider.verifiedMarkets.includes(market)) notes.push(`market_unverified:${market}`);
  return { ...base, data: parsed.data, partial: parsed.dropped > 0, nextCursor: parsed.nextCursor ?? null, notes };
}

const METRIC_KINDS = { volume: "provider_reported", cpc: "provider_reported", adsCompetition: "provider_reported", difficulty: "estimated", intent: "estimated" } as const;

export const anyApiProvider: SeoProvider = {
  id: ID,
  label: "AnyAPI",
  credentials: [{ envName: KEY_ENV, label: "API key" }],
  capabilities: {
    keyword_metrics: { supported: true, sourceTag: ID, dataKind: "provider_reported", fieldKinds: METRIC_KINDS, methodology: "AnyAPI seo.keyword_overview; upstream undisclosed", engine: "google", devices: [], maxBatch: 700, maxResults: null, pagination: false, degraded: "Paid competition is a level, not an index" },
    keyword_suggestions: { supported: true, sourceTag: ID, dataKind: "provider_reported", fieldKinds: METRIC_KINDS, methodology: "AnyAPI seo.keyword_ideas by volume; upstream undisclosed", engine: "google", devices: [], maxBatch: 1, maxResults: 1000, pagination: false, degraded: null },
    ranked_keywords: { supported: true, sourceTag: ID, dataKind: "historical", fieldKinds: { ...METRIC_KINDS, rank: "historical", estimatedTraffic: "estimated" }, methodology: "AnyAPI seo.ranked_keywords: provider's stored rankings; upstream undisclosed", engine: "google", devices: [], maxBatch: 1, maxResults: 1000, pagination: true, degraded: null },
    serp_organic: { supported: true, sourceTag: ID, dataKind: "observed", methodology: "AnyAPI google.search: live Google results at request time", engine: "google", devices: [], maxBatch: 1, maxResults: 10, pagination: true, degraded: "About 10 results per request; those Google hides behind redirect links are dropped (6 of 10 in the live test)" },
    search_volume: { supported: true, sourceTag: "anyapi_search_volume", dataKind: "provider_reported", methodology: "AnyAPI seo.search_volume; upstream undisclosed", engine: "google", devices: [], maxBatch: 1000, maxResults: null, pagination: false, degraded: "Flat 0.108 USD per request, whatever the number of keywords" },
    youtube_search: { supported: true, sourceTag: ID, dataKind: "observed", methodology: "AnyAPI youtube.search: live YouTube results", engine: "youtube", devices: [], maxBatch: 1, maxResults: null, pagination: true, degraded: "No country or language targeting" },
  },
  licensing: {
    termsUrl: "https://getanyapi.com/terms",
    checkedAt: "2026-11-24",
    commercialUse: "permitted",
    storage: "unverified",
    crossTenantSharing: "unverified",
    upstream: "undisclosed",
    notes: [
      "Terms §11 permit reselling results and charging customers for them.",
      "The terms say nothing about storing or caching results, and do not disclose the SEO upstream or its licence.",
      "§8 makes the customer responsible for lawful use; §9 and §12 give no accuracy or availability warranty; §13 caps liability.",
    ],
  },
  rateLimit: "500 new requests per minute, per account and API (Retry-After on 429)",
  verifiedMarkets: ["ES|es"],
  configured: () => Boolean(secretOf(KEY_ENV)),
  marketKey(capability, market) {
    if (market.location) return null;
    if (capability === "youtube_search") return "global"; // the API has no market: the same results serve every locale
    return GOOGLE_LOCATION_CODES[market.country] ? `${market.country}|${market.language}` : null;
  },
  quote: (capability, request) => (operations[capability] as unknown as Operation<typeof capability>).quote(request),
  run: call,
};
