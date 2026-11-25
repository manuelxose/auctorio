// Open-web search and page reading (Tavily, Firecrawl) as providers of the central manager (SEO-V2-05): same switches,
// budgets, reservations, cache and ledger as the keyword providers. What they return is discovery metadata, not fact.

import { secretOf } from "../ai/ai-settings";
import { getEnv, getNumberEnv } from "../../shared/utils/env";
import {
  SEO_CAPABILITIES,
  SeoProviderError,
  assertNetworkAllowed,
  num,
  text,
  type CapabilityDeclaration,
  type SeoAdapterResult,
  type SeoCapability,
  type SeoData,
  type SeoErrorCode,
  type SeoProvider,
  type SeoRequests,
  type WebExtraction,
  type WebSearchResult,
} from "./contract";
import { priceQuote } from "./pricing";

type Row = Record<string, unknown>;
const record = (value: unknown): Row => (value && typeof value === "object" && !Array.isArray(value) ? (value as Row) : {});
export const MAX_WEB_RESULTS = 20;

export function hostnameOf(value: string): string | null {
  try {
    return new URL(value).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

function searchRow(row: Row, description: unknown, publishedAt: unknown): WebSearchResult | null {
  const url = text(row.url)?.trim();
  const domain = url && /^https?:/i.test(url) ? hostnameOf(url) : null;
  if (!url || !domain) return null;
  return { url, title: text(row.title)?.trim().slice(0, 400) ?? domain, description: text(description)?.trim().slice(0, 1000) ?? null, publishedAt: text(publishedAt), domain, score: num(row.score) };
}

const extraction = (url: string, patch: Partial<WebExtraction>): WebExtraction => ({
  url, title: null, publisher: null, author: null, publishedAt: null, description: null, articleText: null, images: [], language: null, entities: [], claims: [], structuredData: null, ...patch,
});

function statusCode(status: number): SeoErrorCode {
  if (status === 401 || status === 403) return "invalid_credentials";
  // 432 and 433 are Tavily's plan and pay-as-you-go limits.
  if (status === 402 || status === 432 || status === 433) return "insufficient_balance";
  if (status === 429) return "rate_limited";
  return status >= 400 && status < 500 ? "bad_request" : "upstream_error";
}

async function post(id: string, fetchImpl: typeof fetch, url: string, headers: Record<string, string>, body: Row): Promise<Row> {
  assertNetworkAllowed(fetchImpl, id);
  let response: Response;
  let payload: unknown;
  try {
    response = await fetchImpl(url, {
      method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body), redirect: "error", // the key must not follow a redirect
      signal: AbortSignal.timeout(getNumberEnv("WEB_INTELLIGENCE_TIMEOUT_MS", 45_000)),
    });
    payload = await response.json().catch((error: unknown) => {
      if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) throw error;
      return null;
    });
  } catch (error) {
    const timeout = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    throw new SeoProviderError(timeout ? "timeout" : "upstream_error", `${id}: ${timeout ? "timed out" : "network error"}`, id);
  }
  // A refused request is not billed; after a server error it is not known.
  if (!response.ok) throw new SeoProviderError(statusCode(response.status), `${id}_http_${response.status}`, id, response.status < 500 ? 0 : null);
  if (!payload || typeof payload !== "object") throw new SeoProviderError("malformed_response", `${id}: not an object`, id);
  return payload as Row;
}

type Search = SeoRequests["web_search"];
type Backend = { search(request: Search, fetchImpl: typeof fetch): Promise<Array<WebSearchResult | null>>; extract(url: string, fetchImpl: typeof fetch): Promise<WebExtraction | null> };

const tavily: Backend = {
  async search({ keyword, limit, freshnessHours }, fetchImpl) {
    const days = freshnessHours && freshnessHours <= 168 ? { days: Math.max(1, Math.ceil(freshnessHours / 24)) } : {};
    const data = await post("tavily", fetchImpl, "https://api.tavily.com/search", {}, { api_key: secretOf("TAVILY_API_KEY"), query: keyword, max_results: limit ?? 10, include_answer: false, ...days });
    if (!Array.isArray(data.results)) throw new SeoProviderError("malformed_response", "tavily: response without results", "tavily");
    return data.results.map((entry) => searchRow(record(entry), record(entry).content, record(entry).published_date));
  },
  async extract(url, fetchImpl) {
    const data = await post("tavily", fetchImpl, "https://api.tavily.com/extract", {}, { api_key: secretOf("TAVILY_API_KEY"), urls: [url] });
    const row = record(Array.isArray(data.results) ? data.results[0] : null);
    const articleText = text(row.raw_content);
    return articleText ? extraction(url, { title: text(row.title), publishedAt: text(row.published_date), description: text(row.content)?.slice(0, 1000) ?? null, articleText }) : null;
  },
};

const firecrawl: Backend = {
  async search({ keyword, limit, freshnessHours, market }, fetchImpl) {
    const data = await post("firecrawl", fetchImpl, `${firecrawlBase()}/v1/search`, firecrawlAuth(), {
      query: keyword, limit: limit ?? 10, lang: market.language, country: market.country.toLowerCase(),
      ...(freshnessHours ? { tbs: freshnessHours <= 24 ? "qdr:d" : freshnessHours <= 168 ? "qdr:w" : "qdr:m" } : {}),
    });
    if (!Array.isArray(data.data)) throw new SeoProviderError("malformed_response", "firecrawl: response without data", "firecrawl");
    return data.data.map((entry) => searchRow(record(entry), record(entry).description, record(entry).publishedAt ?? record(entry).publishedDate));
  },
  async extract(url, fetchImpl) {
    const payload = await post("firecrawl", fetchImpl, `${firecrawlBase()}/v1/scrape`, firecrawlAuth(), { url, formats: ["markdown", "extract"] });
    const data = record(payload.data);
    if (!payload.success || !payload.data) return null;
    const metadata = record(data.metadata);
    return extraction(url, {
      title: text(metadata.title), publisher: text(metadata.ogSiteName), author: text(metadata.author), publishedAt: text(metadata.publishedDate), description: text(metadata.description),
      articleText: text(data.markdown), images: [text(metadata.ogImage)].filter((entry): entry is string => entry !== null), language: text(metadata.language),
      entities: Array.isArray(metadata.entities) ? metadata.entities.map(String) : [], structuredData: data.extract && typeof data.extract === "object" ? (data.extract as Row) : null,
    });
  },
};
const firecrawlBase = () => getEnv("FIRECRAWL_BASE_URL", "https://api.firecrawl.dev");
const firecrawlAuth = () => ({ authorization: `Bearer ${secretOf("FIRECRAWL_API_KEY")}` });

const capabilities = (id: string, label: string): Record<SeoCapability, CapabilityDeclaration> => ({
  ...(Object.fromEntries(SEO_CAPABILITIES.map((capability) => [capability, { supported: false, reason: `${label} only searches and reads the web`, alternatives: ["dataforseo", "anyapi"] }])) as Record<SeoCapability, CapabilityDeclaration>),
  web_search: { supported: true, sourceTag: id, dataKind: "observed", methodology: `${label} web search at request time`, engine: "web", devices: [], maxBatch: 1, maxResults: MAX_WEB_RESULTS, pagination: false, degraded: id === "tavily" ? "No country or language targeting" : null },
  web_extract: { supported: true, sourceTag: id, dataKind: "observed", methodology: `${label} page extraction at request time`, engine: "web", devices: [], maxBatch: 1, maxResults: null, pagination: false, degraded: null },
});

const provider = (id: "tavily" | "firecrawl", label: string, envName: string, termsUrl: string, backend: Backend): SeoProvider => ({
  id,
  label,
  credentials: [{ envName, label: "API key" }],
  capabilities: capabilities(id, label),
  licensing: {
    termsUrl, checkedAt: "2026-11-25", commercialUse: "unverified", storage: "unverified", crossTenantSharing: "unverified", upstream: "undisclosed",
    notes: ["Integration accepted before SEO V2; its resale, storage and sharing clauses were not established, so cached data stays per tenant."],
  },
  rateLimit: null,
  verifiedMarkets: [],
  configured: () => Boolean(secretOf(envName)),
  marketKey: (_capability, market) => (market.location ? null : id === "tavily" ? "global" : `${market.country}|${market.language}`),
  quote: (capability) => priceQuote(id, capability, 1),
  async run<C extends SeoCapability>(capability: C, request: SeoRequests[C], fetchImpl: typeof fetch): Promise<SeoAdapterResult<C>> {
    // Neither says what it charged: the manager accounts for the maximum.
    const base = { billedUsd: null, asOf: null, upstream: null, nextCursor: null, notes: [] };
    if (capability === "web_search") {
      const rows = await backend.search(request as Search, fetchImpl);
      const data = rows.filter((row): row is WebSearchResult => row !== null);
      return { ...base, data: data as SeoData[C], partial: data.length < rows.length };
    }
    if (capability === "web_extract") {
      const page = await backend.extract((request as SeoRequests["web_extract"]).url, fetchImpl);
      return { ...base, data: (page ? [page] : []) as SeoData[C], partial: false };
    }
    throw new SeoProviderError("unsupported_capability", `${id}: ${capability} is not supported`, id, 0);
  },
});

export const tavilyProvider = provider("tavily", "Tavily", "TAVILY_API_KEY", "https://www.tavily.com/terms", tavily);
export const firecrawlProvider = provider("firecrawl", "Firecrawl", "FIRECRAWL_API_KEY", "https://www.firecrawl.dev/terms-of-service", firecrawl);

/** The web provider the installation chose; the mode of the SEO data providers does not change it. */
export const webProviderId = () => {
  const id = getEnv("WEB_INTELLIGENCE_PROVIDER", "").trim().toLowerCase() || "firecrawl";
  return id === "tavily" || id === "firecrawl" ? id : null;
};
