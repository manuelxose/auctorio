// Provider-independent SEO contract (SEO-V2). Consumers depend on this file and on studio/seo-manager only;
// a provider's endpoints, codes and response shapes stay inside its adapter.
// Nothing here estimates a metric: a value the provider did not return is null.

export const SEO_CAPABILITIES = ["keyword_metrics", "keyword_suggestions", "ranked_keywords", "serp_organic", "search_volume", "youtube_search"] as const;
export type SeoCapability = (typeof SEO_CAPABILITIES)[number];

/** Where a value comes from. `unknown` = never asked; `unavailable` = asked, the provider has no value (both are stored as null). */
export type SeoDataKind = "observed" | "provider_reported" | "estimated" | "historical" | "unavailable" | "unknown";

export type SeoMarket = {
  locale: string;
  /** ISO 3166-1 alpha-2, upper case. */
  country: string;
  language: string;
  /** Sub-national target (canonical name). No adapter serves it yet, so a market with one is unsupported. */
  location?: string | null;
};

const DEFAULT_COUNTRY: Record<string, string> = { es: "ES", en: "US", fr: "FR", de: "DE", it: "IT", pt: "PT" };

/** "es", "es-ES", "es_MX" → market; null when the country cannot be told. Whether a provider serves it is the provider's call. */
export function seoMarket(locale: string | null | undefined): SeoMarket | null {
  const [lang, region] = (locale ?? "").trim().replace("_", "-").split("-");
  const language = lang?.toLowerCase();
  const country = (region ?? DEFAULT_COUNTRY[language ?? ""] ?? "").toUpperCase();
  return language && country ? { locale: locale!.trim(), country, language } : null;
}

/** Google geo target ids; shared by every provider that forwards Google's own location codes. */
// shortcut: only the markets we publish in; add a row when a site targets another country.
export const GOOGLE_LOCATION_CODES: Record<string, number> = { ES: 2724, US: 2840, GB: 2826, MX: 2484, AR: 2032, FR: 2250, DE: 2276, IT: 2380, PT: 2620 };

export function normalizeKeyword(keyword: string): string {
  return keyword.normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase();
}

/** "https://www.Example.com/path" → "example.com": one spelling per domain in requests and cache keys. */
export function normalizeDomain(domain: string): string {
  return domain.trim().toLowerCase().replace(/^[a-z]+:\/\//, "").replace(/[/?#].*$/, "").replace(/:\d+$/, "").replace(/^www\./, "").replace(/\.$/, "");
}

/** BLG-style label derived from the 0–100 difficulty (never stored). */
export function difficultyLabel(difficulty: number | null | undefined): "easy" | "medium" | "hard" | "very_hard" | null {
  if (typeof difficulty !== "number") return null;
  if (difficulty < 30) return "easy";
  if (difficulty < 50) return "medium";
  if (difficulty < 70) return "hard";
  return "very_hard";
}

/** Finite number or null: the only way a provider's metric enters the contract. */
export const num = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null);
export const text = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value : null);

export type KeywordMetrics = {
  keyword: string;
  volume: number | null;
  /** Organic difficulty 0–100, the provider's own scale. Never paid competition; not comparable across providers. */
  difficulty: number | null;
  cpc: number | null;
  intent: string | null;
  /** Provider the numbers come from. */
  source: string;
  // Optional: entries cached before SEO-V2 do not have the fields below (absent = unknown).
  /** Paid (Ads) competition, kept apart from organic difficulty. index is 0–1. */
  adsCompetition?: { index: number | null; level: string | null } | null;
  /** When the provider last refreshed these numbers (ISO), when it says so. */
  asOf?: string | null;
  /** Ranking the provider observed in its stored SERP (ranked_keywords only). */
  rank?: { position: number | null; url: string | null } | null;
  /** Provider's traffic estimate for that ranking: an estimate, never observed traffic. */
  estimatedTraffic?: number | null;
};
export type KeywordVolume = { keyword: string; volume: number };
export type SerpResult = { url: string; title: string; domain: string; description: string };
export type YoutubeResult = { id: string; title: string; channel: string; channelUrl: string };

type Paged = { market: SeoMarket; cursor?: string };
export type SeoRequests = {
  keyword_metrics: { market: SeoMarket; keywords: string[] };
  keyword_suggestions: Paged & { seed: string; limit: number };
  ranked_keywords: Paged & { domain: string; limit: number };
  serp_organic: Paged & { keyword: string; engine?: "google"; device?: "desktop" | "mobile" };
  search_volume: { market: SeoMarket; keywords: string[] };
  youtube_search: Paged & { keyword: string };
};
export type SeoData = {
  keyword_metrics: KeywordMetrics[];
  keyword_suggestions: KeywordMetrics[];
  ranked_keywords: KeywordMetrics[];
  serp_organic: SerpResult[];
  search_volume: KeywordVolume[];
  youtube_search: YoutubeResult[];
};

export type SeoQuote = {
  /** null = price unknown: never spend automatically on an unknown price. */
  estimatedUsd: number | null;
  maxUsd: number | null;
  unit: string;
  units: number | null;
};

/** What an adapter returns: data plus what the provider said about it. */
export type SeoAdapterResult<C extends SeoCapability> = {
  data: SeoData[C];
  /** USD the provider reports it charged; null = not reported. */
  billedUsd: number | null;
  /** Timestamp of the data when the whole response shares one (ISO). */
  asOf: string | null;
  /** Upstream source when the provider discloses one. */
  upstream: string | null;
  /** Some rows were dropped or not served: absence of a keyword is not "no data". */
  partial: boolean;
  nextCursor: string | null;
  notes: string[];
};

export type SeoResult<C extends SeoCapability> = {
  data: SeoData[C];
  meta: Omit<SeoAdapterResult<C>, "data"> & {
    providerId: string;
    capability: C;
    market: SeoMarket;
    fetchedAt: string;
    dataKind: SeoDataKind;
    methodology: string;
    quote: SeoQuote;
    /** What the answer is made of; counts of cache keys (keywords, or 1 for a single subject). */
    cache: { hits: number; stale: number; bought: number };
    /** Oldest state of the data returned. */
    freshness: SeoFreshness;
    /** Subjects nobody could answer now (no budget, cool-down, partial answer…): unknown, never "no data". */
    unresolved: string[];
    reservationIds: string[];
  };
};

/** missing: never acquired. expired: past retention, not served. */
export type SeoFreshness = "fresh" | "stale" | "expired" | "missing";

export type CapabilityDeclaration =
  | {
      supported: true;
      /** Value stored as the metric's source. */
      sourceTag: string;
      dataKind: SeoDataKind;
      /** Kind per field where it differs from the response's own kind. */
      fieldKinds?: Partial<Record<string, SeoDataKind>>;
      methodology: string;
      engine: "google" | "youtube";
      /** Devices a caller may choose; empty = the provider decides. */
      devices: ReadonlyArray<"desktop" | "mobile">;
      maxBatch: number | null;
      maxResults: number | null;
      pagination: boolean;
      /** What is lost compared with the contract; null = nothing. */
      degraded: string | null;
    }
  | { supported: false; reason: string; alternatives: string[] };

export type SeoLicensing = {
  termsUrl: string;
  checkedAt: string;
  commercialUse: "permitted" | "prohibited" | "unverified";
  storage: "permitted" | "prohibited" | "unverified";
  /** Rule 20: only an explicit "permitted" lets external data cross tenants. */
  crossTenantSharing: "permitted" | "prohibited" | "unverified";
  upstream: "disclosed" | "undisclosed" | "first_party";
  notes: string[];
};

export interface SeoProvider {
  id: string;
  label: string;
  credentials: ReadonlyArray<{ envName: string; label: string }>;
  capabilities: Record<SeoCapability, CapabilityDeclaration>;
  licensing: SeoLicensing;
  rateLimit: string | null;
  /** Markets ("ES|es") a real call has confirmed; others are attempted only where marketKey() is not null. */
  verifiedMarkets: readonly string[];
  configured(): boolean;
  /** Cache-key prefix of a market, or null when the provider cannot serve it. */
  marketKey(capability: SeoCapability, market: SeoMarket): string | null;
  quote<C extends SeoCapability>(capability: C, request: SeoRequests[C]): SeoQuote;
  /** One provider request. Throws SeoProviderError. */
  run<C extends SeoCapability>(capability: C, request: SeoRequests[C], fetchImpl: typeof fetch): Promise<SeoAdapterResult<C>>;
}

export type SeoErrorCode =
  | "external_disabled" | "provider_disabled" | "not_selected" | "not_configured" | "unsupported_capability" | "unsupported_market"
  | "paid_automation_locked" | "automatic_routing_locked" | "unknown_price" | "spend_limit" | "network_blocked" | "bad_request"
  | "emergency_stop" | "license_prohibited" | "budget_exhausted" | "circuit_open" | "quota_wait" | "acquisition_in_progress"
  | "billing_uncertain" | "retry_cooldown" | "duplicate_request" | "reuse_only" | "not_worth_cost"
  | "invalid_credentials" | "insufficient_balance" | "rate_limited" | "timeout" | "malformed_response" | "upstream_error";

const RETRYABLE: ReadonlySet<SeoErrorCode> = new Set(["rate_limited", "timeout", "upstream_error"]);

export class SeoProviderError extends Error {
  readonly retryable: boolean;
  constructor(
    readonly code: SeoErrorCode,
    message: string,
    readonly providerId: string | null = null,
    /** USD charged although the call failed; null = not reported (a timeout may still have been billed). */
    readonly billedUsd: number | null = null,
  ) {
    super(message);
    this.name = "SeoProviderError";
    this.retryable = RETRYABLE.has(code);
  }
}

/** Tests never reach a provider: inside the test runner only an injected fetch may be used. */
export function assertNetworkAllowed(fetchImpl: typeof fetch, providerId: string): void {
  if (fetchImpl === globalThis.fetch && (process.env.NODE_TEST_CONTEXT || process.env.NODE_ENV === "test")) {
    throw new SeoProviderError("network_blocked", `${providerId}: external SEO calls are blocked in tests`, providerId, 0);
  }
}
