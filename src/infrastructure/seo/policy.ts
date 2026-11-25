// Freshness, retention and acquisition policy (SEO-V2-02). Pure. Freshness is when data may be refreshed, not a refresh schedule:
// stale data is bought again only for a pending decision worth more than the request.

import { SEO_CAPABILITIES, isWebCapability, normalizeDomain, normalizeKeyword, type SeoCapability, type SeoFreshness, type SeoLicensing, type SeoMarket, type SeoProvider } from "./contract";
import { sha256 } from "../../shared/utils/hash";

/** Bump when the shape of cached SEO payloads changes: older entries stop matching. */
export const SEO_CACHE_SCHEMA = 2;

export type SeoUrgency = "evergreen" | "time_sensitive";
export type SeoImportance = "low" | "normal" | "high";
/** What the data is needed for. importance prices the decision; a stale value is only refreshed when that is worth it. */
export type SeoDecision = { importance?: SeoImportance; urgency?: SeoUrgency; siteType?: string | null };

type FreshnessRange = { min: number; days: number; max: number };
export type SeoPolicy = {
  /** Days data stays fresh, and the range within which importance can move it. */
  freshness: Record<SeoCapability, FreshnessRange>;
  timeSensitiveSerpDays: number;
  timeSensitiveWebDays: number;
  /** First match wins; every field given must match. */
  overrides: Array<{ capability: SeoCapability; siteType?: string; country?: string; urgency?: SeoUrgency; days: number }>;
  /** USD a decision that depends on fresh data is worth. */
  decisionValueUsd: Record<SeoImportance, number>;
  /** Fewest keywords worth a flat-priced search-volume request. */
  minVolumeBatch: number;
  onboardingDays: number;
  /** Own ceiling of requests per minute to each provider, below its documented limit. */
  maxRequestsPerMinute: number;
  /** Market data may be read by other workspaces. Off unless the platform says so, and only for providers whose licence permits it. */
  shareMarketData: boolean;
  /** Workers may start research, and so buy, without anyone asking. Off until the platform says so. */
  automaticResearch: boolean;
};

export const DEFAULT_SEO_POLICY: SeoPolicy = {
  freshness: {
    keyword_metrics: { min: 60, days: 75, max: 90 },
    keyword_suggestions: { min: 60, days: 75, max: 90 },
    search_volume: { min: 60, days: 75, max: 90 },
    ranked_keywords: { min: 30, days: 60, max: 90 },
    serp_organic: { min: 14, days: 21, max: 30 },
    youtube_search: { min: 14, days: 21, max: 30 },
    web_search: { min: 3, days: 7, max: 14 },
    web_extract: { min: 1, days: 7, max: 14 },
  },
  timeSensitiveSerpDays: 3,
  timeSensitiveWebDays: 0.25,
  overrides: [],
  decisionValueUsd: { low: 0.005, normal: 0.05, high: 0.5 },
  minVolumeBatch: 10,
  onboardingDays: 14,
  maxRequestsPerMinute: 60,
  shareMarketData: false,
  automaticResearch: false,
};

const positive = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value > 0;
const isCapability = (value: unknown): value is SeoCapability => (SEO_CAPABILITIES as readonly unknown[]).includes(value);

/** Stored policy over the defaults; unreadable values are ignored. */
export function readSeoPolicy(stored: unknown): SeoPolicy {
  const value = (stored && typeof stored === "object" && !Array.isArray(stored) ? stored : {}) as Record<string, any>;
  const policy: SeoPolicy = { ...DEFAULT_SEO_POLICY, freshness: { ...DEFAULT_SEO_POLICY.freshness }, decisionValueUsd: { ...DEFAULT_SEO_POLICY.decisionValueUsd } };
  for (const capability of SEO_CAPABILITIES) {
    const days = value.freshnessDays?.[capability];
    const range = policy.freshness[capability];
    if (positive(days)) policy.freshness[capability] = { min: Math.min(range.min, days), days, max: Math.max(range.max, days) };
  }
  if (positive(value.timeSensitiveSerpDays)) policy.timeSensitiveSerpDays = value.timeSensitiveSerpDays;
  if (Array.isArray(value.overrides)) policy.overrides = value.overrides.filter((entry: any) => isCapability(entry?.capability) && positive(entry.days));
  for (const key of ["low", "normal", "high"] as const) if (typeof value.decisionValueUsd?.[key] === "number" && value.decisionValueUsd[key] >= 0) policy.decisionValueUsd[key] = value.decisionValueUsd[key];
  for (const key of ["minVolumeBatch", "onboardingDays", "maxRequestsPerMinute"] as const) if (positive(value[key])) policy[key] = value[key];
  policy.shareMarketData = value.shareMarketData === true;
  policy.automaticResearch = value.automaticResearch === true;
  return policy;
}

/** Days the data is fresh for this decision. High importance uses the shortest of the range, low the longest. */
export function freshnessDays(capability: SeoCapability, market: SeoMarket, decision: SeoDecision, policy: SeoPolicy, licensing: SeoLicensing): number {
  const urgency = decision.urgency ?? "evergreen";
  const override = policy.overrides.find((entry) =>
    entry.capability === capability && (!entry.siteType || entry.siteType === decision.siteType) && (!entry.country || entry.country === market.country) && (!entry.urgency || entry.urgency === urgency));
  const range = policy.freshness[capability];
  const importance = decision.importance ?? "normal";
  const days = override?.days
    ?? (capability === "serp_organic" && urgency === "time_sensitive" ? policy.timeSensitiveSerpDays
      : capability === "web_search" && urgency === "time_sensitive" ? policy.timeSensitiveWebDays
      : importance === "high" ? range.min : importance === "low" ? range.max : range.days);
  return Math.min(days, retentionDays(licensing));
}

/** How long acquired data may be kept: nothing where storing is prohibited, 90 days where the licence does not say. */
export function retentionDays(licensing: SeoLicensing): number {
  return licensing.storage === "prohibited" ? 0 : licensing.storage === "permitted" ? 730 : 90;
}

export function freshnessOf(fetchedAt: Date | null, expiresAt: Date | null, freshDays: number, now = new Date()): SeoFreshness {
  if (!fetchedAt) return "missing";
  if (expiresAt && expiresAt <= now) return "expired";
  return now.getTime() - fetchedAt.getTime() <= freshDays * 86_400_000 ? "fresh" : "stale";
}

/** Same resource names as the entries cached before SEO-V2. */
export const SEO_RESOURCES: Record<SeoCapability, string> = {
  keyword_metrics: "keyword_overview",
  keyword_suggestions: "keyword_ideas",
  ranked_keywords: "ranked_keywords",
  serp_organic: "serp_organic",
  search_volume: "google_ads_volume",
  youtube_search: "youtube_organic",
  web_search: "web_search",
  web_extract: "web_extract",
};

/**
 * Canonical cache key of one subject (keyword, seed or domain). Everything that changes the answer is in it, so two markets,
 * languages, depths or methodologies never share an entry. The provider and the resource are columns of the cache table.
 */
export function seoCacheKey(
  provider: SeoProvider,
  capability: SeoCapability,
  market: SeoMarket,
  subject: string,
  options: { device?: string; engine?: string; limit?: number; cursor?: string; freshnessHours?: number } = {},
): string {
  const declaration = provider.capabilities[capability];
  const marketKey = provider.marketKey(capability, market) ?? "-";
  const worldwide = marketKey === "global"; // the provider ignores the market: every locale shares the answer
  return [
    `v${SEO_CACHE_SCHEMA}`,
    declaration.supported ? options.engine ?? declaration.engine : "-",
    marketKey,
    worldwide ? "-" : market.country,
    worldwide ? "-" : market.language,
    market.location ?? "-",
    options.device ?? "-",
    options.limit ?? "-",
    options.cursor ?? "-",
    sha256(declaration.supported ? declaration.methodology : "").slice(0, 8), // names the endpoint or SKU: the upstream source
    ...(options.freshnessHours ? [`${options.freshnessHours}h`] : []),
    isWebCapability(capability) ? subject.trim() : capability === "ranked_keywords" ? normalizeDomain(subject) : normalizeKeyword(subject),
  ].map((part) => String(part).replace(/\|/g, "%7C")).join("|");
}
