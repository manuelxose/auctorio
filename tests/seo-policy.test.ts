import test from "node:test";
import assert from "node:assert/strict";
import { SEO_CAPABILITIES, normalizeDomain, seoMarket, type KeywordMetrics, type SeoMarket } from "../src/infrastructure/seo/contract";
import { DEFAULT_SEO_POLICY, freshnessDays, freshnessOf, readSeoPolicy, retentionDays, seoCacheKey } from "../src/infrastructure/seo/policy";
import { SEO_PRICES, effectiveQuote, priceQuote, seoPriceStatus } from "../src/infrastructure/seo/pricing";
import { SEO_PROVIDERS } from "../src/infrastructure/seo/registry";
import { mergeKeywordMetrics } from "../src/studio/seo-cache";

const [dataforseo, anyapi] = SEO_PROVIDERS;
const market = (locale: string) => seoMarket(locale) as SeoMarket;

test("every supported operation has a price entry; unknown prices have no maximum and quotes follow the registry", () => {
  for (const provider of SEO_PROVIDERS) for (const capability of SEO_CAPABILITIES) if (provider.capabilities[capability].supported) assert.ok(SEO_PRICES.some((entry) => entry.providerId === provider.id && entry.capability === capability), `${provider.id} ${capability}`);
  const near = (actual: number | null, expected: number) => assert.ok(actual !== null && Math.abs(actual - expected) < 1e-9, `${actual} ≠ ${expected}`);
  near(priceQuote("dataforseo", "keyword_metrics", 700).maxUsd, 0.096);
  near(dataforseo.quote("keyword_suggestions", { market: market("es-ES"), seed: "x", limit: 100 }).maxUsd, 0.024);
  near(priceQuote("dataforseo", "search_volume", 1).maxUsd, 0.09);
  near(priceQuote("dataforseo", "search_volume", 1000).maxUsd, 0.09);
  near(priceQuote("anyapi", "serp_organic", 1).estimatedUsd, 0.0005);
  near(priceQuote("anyapi", "serp_organic", 1).maxUsd, 0.002);
  assert.equal(priceQuote("dataforseo", "serp_organic", 1).maxUsd, null);
  assert.equal(priceQuote("nobody", "serp_organic", 1).maxUsd, null);
});

test("an administrator's ceiling supplies a missing maximum, never lowers a list price; a suspect price has none", () => {
  const unknown = priceQuote("dataforseo", "serp_organic", 1);
  const known = priceQuote("dataforseo", "search_volume", 1);
  assert.equal(effectiveQuote(unknown, "dataforseo", "serp_organic", {}).maxUsd, null);
  assert.equal(effectiveQuote(unknown, "dataforseo", "serp_organic", { "dataforseo:serp_organic": { maxRequestUsd: 0.05 } }).maxUsd, 0.05);
  assert.equal(effectiveQuote(known, "dataforseo", "search_volume", { "dataforseo:search_volume": { maxRequestUsd: 0.01 } }).maxUsd, 0.09);
  assert.equal(effectiveQuote(known, "dataforseo", "search_volume", { "dataforseo:search_volume": { maxRequestUsd: 0.2, suspect: { billedUsd: 1, at: "" } } }).maxUsd, null);
  const entry = SEO_PRICES.find((price) => price.providerId === "dataforseo" && price.capability === "search_volume")!;
  assert.deepEqual([seoPriceStatus(entry, {}, new Date("2026-11-25")), seoPriceStatus(entry, {}, new Date("2027-11-25"))], ["known", "review_due"]);
});

test("cache keys separate everything that changes the answer and nothing else", () => {
  const key = (locale: string, subject = "Guía TV", options = {}, capability: "keyword_metrics" | "serp_organic" = "keyword_metrics") => seoCacheKey(dataforseo, capability, market(locale), subject, options);
  const distinct = [key("es-ES"), key("es-MX"), key("en-US"), key("en-GB"), key("pt-PT"), key("es-US"), key("es-ES", "guia tv"), key("es-ES", "Guía TV", {}, "serp_organic"), key("es-ES", "Guía TV", { limit: 10 }), key("es-ES", "Guía TV", { limit: 100 }), key("es-ES", "Guía TV", { cursor: "2" }), key("es-ES", "Guía TV", { device: "mobile" }), seoCacheKey(anyapi, "keyword_metrics", market("es-ES"), "Guía TV")];
  assert.equal(new Set(distinct).size, distinct.length);
  assert.equal(key("es-ES"), key("es", "  guía   TV "), "same market and query, other spelling");
  assert.equal(key("es-ES", "guía tv"), key("es-ES", "guía tv"), "composed and decomposed accents are the same query");
  assert.equal(key("es-ES", "a|b"), key("es-ES", "a|b"));
  assert.notEqual(seoCacheKey(dataforseo, "keyword_metrics", market("es-ES"), "a", { limit: 1 }), seoCacheKey(dataforseo, "keyword_metrics", market("es-ES"), "1|a"));
  assert.equal(seoCacheKey(anyapi, "youtube_search", market("es-ES"), "x"), seoCacheKey(anyapi, "youtube_search", market("en-US"), "x"), "AnyAPI's YouTube ignores the market");
  for (const spelling of ["https://www.Example.com/a?b", "EXAMPLE.com.", "example.com:443"]) assert.equal(normalizeDomain(spelling), "example.com");
});

test("freshness depends on data, site, market, urgency, importance and licence; it is never shorter than retention allows", () => {
  const es = market("es-ES");
  const days = (capability: Parameters<typeof freshnessDays>[0], decision = {}, policy = DEFAULT_SEO_POLICY) => freshnessDays(capability, es, decision, policy, dataforseo.licensing);
  assert.deepEqual([days("keyword_metrics"), days("keyword_metrics", { importance: "high" }), days("keyword_metrics", { importance: "low" })], [75, 60, 90]);
  assert.deepEqual([days("serp_organic"), days("serp_organic", { urgency: "time_sensitive" })], [21, 3]);
  const policy = readSeoPolicy({ overrides: [{ capability: "serp_organic", siteType: "guiatv", country: "ES", days: 1 }, { capability: "nope", days: 1 }], freshnessDays: { ranked_keywords: 45, search_volume: -1 }, minVolumeBatch: "x" });
  assert.deepEqual([days("serp_organic", { siteType: "guiatv" }, policy), days("serp_organic", { siteType: "webhook" }, policy), days("ranked_keywords", {}, policy), days("search_volume", {}, policy), policy.minVolumeBatch, policy.overrides.length], [1, 21, 45, 75, 10, 1]);
  assert.deepEqual([retentionDays({ ...dataforseo.licensing, storage: "prohibited" }), retentionDays(dataforseo.licensing), retentionDays({ ...dataforseo.licensing, storage: "permitted" })], [0, 90, 730]);
  assert.equal(freshnessDays("keyword_metrics", es, {}, DEFAULT_SEO_POLICY, { ...dataforseo.licensing, storage: "prohibited" }), 0);
  const now = new Date("2026-11-24T00:00:00Z");
  const ago = (n: number) => new Date(now.getTime() - n * 86_400_000);
  assert.deepEqual([freshnessOf(null, null, 10, now), freshnessOf(ago(5), ago(-5), 10, now), freshnessOf(ago(11), ago(-5), 10, now), freshnessOf(ago(5), ago(1), 10, now)], ["missing", "fresh", "stale", "expired"]);
});

test("a metric is replaced by a newer value, never by 'not returned', and keeps its provenance", () => {
  const row = (patch: Partial<KeywordMetrics>): KeywordMetrics => ({ keyword: "guia tv", volume: null, difficulty: null, cpc: null, intent: null, source: "dataforseo", ...patch });
  const by = (at: string, via: "keyword_suggestions" | "keyword_metrics") => ({ at, via, kind: "provider_reported" as const, asOf: null, upstream: null });
  const first = mergeKeywordMetrics(null, row({ volume: 100, difficulty: 20, rank: { position: 3, url: "u" }, estimatedTraffic: 9 }), by("2026-01-01T00:00:00.000Z", "keyword_suggestions"));
  assert.equal(first.payload.rank, undefined, "a ranking belongs to a domain");
  const second = mergeKeywordMetrics(first, row({ volume: 120, cpc: 0.4 }), by("2026-02-01T00:00:00.000Z", "keyword_metrics"));
  assert.deepEqual([second.payload.volume, second.payload.difficulty, second.payload.cpc, second.payload.intent], [120, 20, 0.4, null]);
  assert.deepEqual([second.meta.fields!.volume!.via, second.meta.fields!.difficulty!.via, second.meta.fields!.intent!.at], ["keyword_metrics", "keyword_suggestions", "2026-02-01T00:00:00.000Z"]);
});
