// Versioned price registry: the only place that says what an SEO request can cost. Bump SEO_PRICING_VERSION with any change;
// every reservation records the version it was priced with.

import type { SeoCapability, SeoQuote } from "./contract";

export const SEO_PRICING_VERSION = "2026-11-25.1";
/** Older verifications are flagged for review; they do not stop spending (a bill above the quote does). */
export const PRICE_REVIEW_DAYS = 90;

export type SeoPrice = {
  providerId: string;
  capability: SeoCapability;
  billingUnit: string;
  currency: "USD";
  /** Charged per request, whatever it returns. null = unknown. */
  perRequestUsd: number | null;
  perItemUsd: number;
  minRequestUsd: number;
  /** Highest possible charge where it is not base + items (failover lanes). null = follows from the formula. */
  maxRequestUsd: number | null;
  /** Items one request may carry at this price; null = one subject per request. */
  batchItems: number | null;
  verifiedAt: string;
  source: string;
  uncertainty: "none" | "list_price" | "failover_range" | "unknown_maximum";
};

const DFS_LABS = "https://dataforseo.com/pricing/dataforseo-labs/dataforseo-google-api";
const ANYAPI = "https://api.getanyapi.com/catalog";
const VERIFIED = "2026-11-24";
const TAVILY = "https://docs.tavily.com/documentation/api-credits";
const FIRECRAWL = "https://www.firecrawl.dev/pricing";
const WEB_VERIFIED = "2026-11-25";
const price = (providerId: string, capability: SeoCapability, source: string, patch: Pick<SeoPrice, "billingUnit" | "perRequestUsd"> & Partial<SeoPrice>): SeoPrice => ({
  providerId, capability, currency: "USD", perItemUsd: 0, minRequestUsd: 0, maxRequestUsd: null, batchItems: null, verifiedAt: VERIFIED, source, uncertainty: "list_price", ...patch,
});

export const SEO_PRICES: readonly SeoPrice[] = [
  price("dataforseo", "keyword_metrics", DFS_LABS, { billingUnit: "task + item", perRequestUsd: 0.012, perItemUsd: 0.00012, batchItems: 700 }),
  price("dataforseo", "keyword_suggestions", DFS_LABS, { billingUnit: "task + item", perRequestUsd: 0.012, perItemUsd: 0.00012 }),
  price("dataforseo", "ranked_keywords", DFS_LABS, { billingUnit: "task + item", perRequestUsd: 0.012, perItemUsd: 0.00012 }),
  // Billed per stored snapshot and how many there are is not known beforehand: no maximum, so nothing is spent until an administrator records one.
  price("dataforseo", "serp_organic", DFS_LABS, { billingUnit: "stored SERP", perRequestUsd: null, perItemUsd: 0.00012, uncertainty: "unknown_maximum" }),
  price("dataforseo", "search_volume", "https://dataforseo.com/pricing/keywords-data/google-ads", { billingUnit: "task", perRequestUsd: 0.09, batchItems: 1000 }),
  price("dataforseo", "youtube_search", "https://dataforseo.com/pricing/serp/youtube-serp-api", { billingUnit: "20 results", perRequestUsd: 0.002 }),
  // AnyAPI confirmed these with its quote endpoint; max_cost_usd makes it refuse, uncharged, a dearer call.
  price("anyapi", "keyword_metrics", ANYAPI, { billingUnit: "base + keyword", perRequestUsd: 0.01438, perItemUsd: 0.00016, batchItems: 700, uncertainty: "none" }),
  price("anyapi", "keyword_suggestions", ANYAPI, { billingUnit: "base + result", perRequestUsd: 0.01496, perItemUsd: 0.00016, uncertainty: "none" }),
  price("anyapi", "ranked_keywords", ANYAPI, { billingUnit: "base + result", perRequestUsd: 0.01496, perItemUsd: 0.00016, uncertainty: "none" }),
  price("anyapi", "serp_organic", ANYAPI, { billingUnit: "request", perRequestUsd: 0.0005, maxRequestUsd: 0.002, uncertainty: "failover_range" }),
  price("anyapi", "search_volume", ANYAPI, { billingUnit: "request", perRequestUsd: 0.108, batchItems: 1000, uncertainty: "none" }),
  price("anyapi", "youtube_search", ANYAPI, { billingUnit: "request", perRequestUsd: 0.00034, maxRequestUsd: 0.0012, uncertainty: "failover_range" }),
  // The dearest published price of a credit: pay as you go (Tavily), monthly Hobby (Firecrawl).
  price("tavily", "web_search", TAVILY, { billingUnit: "1 credit", perRequestUsd: 0.008, verifiedAt: WEB_VERIFIED }),
  price("tavily", "web_extract", TAVILY, { billingUnit: "1 credit per 5 pages", perRequestUsd: 0.008, verifiedAt: WEB_VERIFIED }),
  price("firecrawl", "web_search", FIRECRAWL, { billingUnit: "2 credits per 10 results", perRequestUsd: 0.0076, maxRequestUsd: 0.0152, verifiedAt: WEB_VERIFIED }),
  price("firecrawl", "web_extract", FIRECRAWL, { billingUnit: "1 credit + 4 for extraction", perRequestUsd: 0.019, verifiedAt: WEB_VERIFIED }),
];

export function seoPrice(providerId: string, capability: SeoCapability): SeoPrice | null {
  return SEO_PRICES.find((entry) => entry.providerId === providerId && entry.capability === capability) ?? null;
}

/** Expected and highest charge of one request with `items` billable items; null = unknown. */
export function priceQuote(providerId: string, capability: SeoCapability, items: number): SeoQuote {
  const entry = seoPrice(providerId, capability);
  if (!entry || entry.perRequestUsd === null) return { estimatedUsd: null, maxUsd: null, unit: entry?.billingUnit ?? "unknown", units: null };
  const estimatedUsd = Math.max(entry.minRequestUsd, entry.perRequestUsd + entry.perItemUsd * items);
  return { estimatedUsd, maxUsd: entry.maxRequestUsd ?? estimatedUsd, unit: entry.billingUnit, units: entry.perItemUsd ? items : 1 };
}

/**
 * What an administrator or a bill has established about a price, by "provider:capability".
 * `suspect`: the provider billed above the maximum, so the maximum is not known any more.
 */
export type SeoPriceOverrides = Record<string, { maxRequestUsd?: number; source?: string; verifiedAt?: string; suspect?: { billedUsd: number; at: string } }>;

/** The quote that may be spent on. Unknown and suspect prices have no maximum. */
export function effectiveQuote(quote: SeoQuote, providerId: string, capability: SeoCapability, overrides: SeoPriceOverrides): SeoQuote {
  const override = overrides[`${providerId}:${capability}`];
  if (!override) return quote;
  if (override.suspect) return { ...quote, maxUsd: null };
  if (override.maxRequestUsd === undefined) return quote;
  // A recorded ceiling can raise a maximum or supply a missing one, never lower a published price.
  const maxUsd = Math.max(override.maxRequestUsd, quote.maxUsd ?? 0);
  return { ...quote, estimatedUsd: quote.estimatedUsd ?? maxUsd, maxUsd };
}

export type SeoPriceStatus = "known" | "admin_ceiling" | "unknown" | "suspect" | "review_due";

export function seoPriceStatus(entry: SeoPrice, overrides: SeoPriceOverrides, now = new Date()): SeoPriceStatus {
  const override = overrides[`${entry.providerId}:${entry.capability}`];
  if (override?.suspect) return "suspect";
  const ceiling = override?.maxRequestUsd !== undefined;
  if (entry.perRequestUsd === null && !ceiling) return "unknown";
  const verified = Date.parse(override?.verifiedAt ?? entry.verifiedAt);
  if (now.getTime() - verified > PRICE_REVIEW_DAYS * 86_400_000) return "review_due";
  return ceiling ? "admin_ceiling" : "known";
}
