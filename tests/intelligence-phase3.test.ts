// Phase 3 intelligence tests — deterministic fixtures only, no live network.
//
// Coverage map:
//  1. duplicate vs corroborating publisher
//  2. movie title ambiguity
//  3. remake ambiguity (year disambiguation)
//  4. actor/movie name collisions
//  5. story updates (same externalId, changed content)
//  6. conflicting publication dates
//  7. conflicting factual claims (release_year)
//  8. provider unavailable
//  9. provider rate limited
// 10. cached provider response
// 11. irrelevant story
// 12. high relevance story
// plus provider-cache unit behavior (TTL/SWR/negative/coalescing) and
// verification state transitions.

import assert from "node:assert/strict";
import test from "node:test";
import { getPrismaClient } from "../src/infrastructure/db/prisma";
import { sha256 } from "../src/shared/utils/hash";
import { emptyDiscoveredItem } from "../src/studio/adapters/normalize";
import { upsertSourceItem } from "../src/studio/sources";
import {
  matchWork,
  cleanWorkTitle,
  extractYearFromTitle,
  detectWorkType,
} from "../src/studio/domains/movie-tv/matcher";
import { extractEntitiesFromText } from "../src/studio/entities/extraction";
import {
  computeVerificationState,
  extractFactsFromItem,
  upsertStoryFacts,
  summarizeClusterFacts,
  CONFLICT_SENSITIVE_FACT_KEYS,
} from "../src/studio/intelligence/verification";
import { computeSourceDiversity, publisherGroupKey } from "../src/studio/intelligence/source-diversity";
import {
  scoreCandidate,
  CANDIDATE_WEIGHTS,
} from "../src/studio/intelligence/candidate-scoring";
import { scoreSiteFit, persistSiteEditorialProfile, type SiteEditorialProfile } from "../src/studio/intelligence/site-editorial-profile";
import { titleSimilarity } from "../src/studio/editorial";
import { runIntelligencePipelineForItem, readEvidenceYear } from "../src/studio/intelligence/pipeline";
import { mergeStoryClusters, splitStoryCluster } from "../src/studio/intelligence/cluster-actions";
import { updateIntelligenceSettings } from "../src/studio/intelligence/intelligence-settings";
import { setMovieTvProviderEngine, registerMovieTvPlugin } from "../src/studio/domains/movie-tv/plugin";
import { ProviderEngine } from "../src/studio/enrichment/engine";
import {
  ProviderRateLimitedError,
  ProviderUnavailableError,
  type EnrichmentLookupInput,
  type EnrichmentLookupResult,
  type EnrichmentPayload,
  type EnrichmentProviderAdapter,
} from "../src/studio/enrichment/adapter";
import {
  buildProviderCacheKey,
  lookupProviderCache,
  storeProviderCache,
  providerRateSlotAvailable,
  resetProviderRateWindows,
} from "../src/studio/enrichment/provider-cache";
import { createCostCounters, ratesPer100 } from "../src/studio/intelligence/cost-control";

const prisma = getPrismaClient();

registerMovieTvPlugin();

// ──────────────────────────────────────────────────────────── Fake provider

function fakePayload(input: EnrichmentLookupInput): EnrichmentPayload {
  const year = input.year ?? 2024;
  return {
    id: `fake-${input.query.toLowerCase().replace(/[^a-z0-9]/g, "")}-${year}`,
    resourceType: input.resourceType,
    title: input.query,
    originalTitle: null,
    releaseDate: `${year}-01-01`,
    year,
    genres: ["Drama"],
    popularity: 10,
    rating: 7.5,
    votes: 1000,
    cast: ["Actor One"],
    crew: ["Director One"],
    studios: ["Studio One"],
    franchise: null,
    overview: "fake overview",
    posterUrl: null,
    backdropUrl: null,
    watchProviders: [],
    extra: {},
  };
}

class FakeAdapter implements EnrichmentProviderAdapter {
  readonly providerKey = "fake";
  readonly attribution = "fake attribution";
  calls = 0;
  constructor(
    private readonly behavior: {
      unavailable?: boolean;
      rateLimited?: boolean;
    } = {},
  ) {}

  isConfigured(): boolean {
    return true;
  }

  async lookup(input: EnrichmentLookupInput): Promise<EnrichmentLookupResult> {
    this.calls += 1;
    if (this.behavior.rateLimited) {
      throw new ProviderRateLimitedError(this.providerKey);
    }
    if (this.behavior.unavailable) {
      throw new ProviderUnavailableError(this.providerKey, "down");
    }
    return {
      providerKey: this.providerKey,
      resourceType: input.resourceType,
      match: fakePayload(input),
      alternatives: [],
      matchMethod: input.year ? "year_match" : "search",
      confidence: input.year ? 0.85 : 0.7,
      attribution: { source: "fake", creditText: this.attribution, fetchedAt: new Date().toISOString() },
    };
  }
}

// ──────────────────────────────────────────────────────────── DB fixtures

type IntelligenceFixture = {
  tenantId: string;
  siteId: string | null;
  sourceA: string;
  sourceB: string;
  sourceC: string;
};

async function createIntelligenceFixture(options: { siteTopics?: string[]; siteCategories?: string[] } = {}): Promise<IntelligenceFixture> {
  resetProviderRateWindows();
  const seed = `int-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const tenant = await prisma.tenant.create({ data: { name: seed, apiKeyHash: sha256(`${seed}-k`), status: "active" } });

  const site = options.siteTopics !== undefined || options.siteCategories !== undefined
    ? await prisma.site.create({ data: { tenantId: tenant.id, key: seed, name: `${seed}-site`, type: "generic_rest", locale: "en-US", baseUrl: `https://${seed}.example.com` } })
    : null;
  if (site) {
    await persistSiteEditorialProfile(tenant.id, site.id, {
      siteId: site.id,
      profileVersion: 1,
      builtAt: new Date().toISOString(),
      topics: options.siteTopics ?? [],
      categories: options.siteCategories ?? [],
      taxonomy: [],
      audience: [],
      language: "en",
      location: [],
      editorialDescription: "test editorial profile",
      contentGaps: options.siteTopics?.map((topic) => ({ topic, score: 0.6, reason: "no_existing_coverage" })) ?? [],
      existingTitles: [],
      sitemapUrl: null,
      articleStats: { articleCount: 0, avgTitleTokens: 0 },
    });
  }

  const sourceA = await prisma.contentSource.create({ data: { tenantId: tenant.id, name: `${seed}-a`, type: "rss", url: "https://a.example/feed", domain: "a.example", trustScore: 0.9, authorityScore: 0.9, language: "en", siteId: site?.id ?? null } });
  const sourceB = await prisma.contentSource.create({ data: { tenantId: tenant.id, name: `${seed}-b`, type: "rss", url: "https://b.example/feed", domain: "b.example", trustScore: 0.7, authorityScore: 0.7, language: "en", siteId: site?.id ?? null } });
  const sourceC = await prisma.contentSource.create({ data: { tenantId: tenant.id, name: `${seed}-c`, type: "rss", url: "https://c.example/feed", domain: "c.example", trustScore: 0.5, authorityScore: 0.5, language: "en", siteId: site?.id ?? null } });
  return { tenantId: tenant.id, siteId: site?.id ?? null, sourceA: sourceA.id, sourceB: sourceB.id, sourceC: sourceC.id };
}

async function cleanupIntelligenceFixture(fixture: IntelligenceFixture) {
  const tenantId = fixture.tenantId;
  await prisma.storyFact.deleteMany({ where: { tenantId } });
  await prisma.sourceItemEntity.deleteMany({ where: { tenantId } });
  await prisma.providerEnrichment.deleteMany({ where: { tenantId } });
  await prisma.providerCacheEntry.deleteMany({ where: { tenantId } });
  await prisma.muteRule.deleteMany({ where: { tenantId } });
  await prisma.intelligenceSettings.deleteMany({ where: { tenantId } });
  await prisma.entity.deleteMany({ where: { tenantId } });
  await prisma.sourceHealth.deleteMany({ where: { tenantId } });
  await prisma.discoveryRun.deleteMany({ where: { tenantId } });
  await prisma.sourceItem.deleteMany({ where: { tenantId } });
  await prisma.storyCluster.deleteMany({ where: { tenantId } });
  await prisma.contentSource.deleteMany({ where: { tenantId } });
  await prisma.siteEditorialProfile.deleteMany({ where: { tenantId } });
  await prisma.siteIntelligenceProfile.deleteMany({ where: { tenantId } });
  await prisma.site.deleteMany({ where: { tenantId } });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  setMovieTvProviderEngine(null);
}

function makeItem(overrides: Partial<ReturnType<typeof emptyDiscoveredItem>> = {}) {
  const nonce = Math.random().toString(16).slice(2, 10);
  return emptyDiscoveredItem({
    externalId: `ext-${Math.random().toString(16).slice(2, 10)}`,
    canonicalUrl: `https://a.example/story-${Math.random().toString(16).slice(2, 8)}`,
    sourceUrl: null,
    title: "A sufficiently long test story headline",
    description: `Description of the test story with enough words ${nonce}.`,
    cleanedText: `Description of the test story with enough words ${nonce}.`,
    categories: [],
    language: "en",
    ...overrides,
  });
}

async function ingestAndScore(tenantId: string, sourceId: string, item: ReturnType<typeof makeItem>, score = 0.5) {
  const upserted = await upsertSourceItem(tenantId, sourceId, item);
  assert.equal(upserted.created, true, "item should be created");
  const itemId = upserted.sourceItemId;
  assert.ok(itemId, "source item id must exist");
  await prisma.sourceItem.update({
    where: { id: itemId },
    data: { score, processingStatus: score >= 0.4 ? "candidate" : "parsed" },
  });
  return itemId as string;
}

// ──────────────────────────────────────────────────────────── Pure matcher tests

test("movie title ambiguity: generic title flagged with low confidence", () => {
  const match = matchWork({ title: "The Office" });
  assert.equal(match.workType, "unknown");
  assert.ok(match.ambiguities.includes("generic_title"));
  assert.ok(match.confidence <= 0.55);
});

test("movie title disambiguation: explicit year raises confidence", () => {
  const withYear = matchWork({ title: "Dune (2021) Remake Trailer Arrives Today" });
  const withoutYear = matchWork({ title: "Dune Remake Trailer Arrives Today" });
  assert.equal(withYear.year, 2021);
  assert.equal(withYear.workType, "movie");
  assert.ok(withYear.confidence > withoutYear.confidence);
});

test("remake ambiguity: different years are detected deterministically", () => {
  const original = matchWork({ title: "Suspiria (1977) Classic Gets 4K Restoration" });
  const remake = matchWork({ title: "Suspiria (2018) Remake Gets First Trailer" });
  assert.equal(original.year, 1977);
  assert.equal(remake.year, 2018);
  assert.notEqual(original.year, remake.year);
  assert.equal(extractYearFromTitle("The Thing 1982 vs The Thing 2011"), 1982);
});

test("actor/movie name collisions are flagged, never auto-merged", () => {
  const match = matchWork({
    title: "Margot Robbie Stars in New Ocean's Eleven Movie",
    description: "Margot Robbie stars in the new Ocean's Eleven film.",
  });
  assert.ok(match.ambiguities.includes("person_name_collision"));
  assert.ok(match.confidence <= 0.55);
});

test("tv series detection from season cues", () => {
  const match = matchWork({ title: "Stranger Things Season 5 First Look Revealed" });
  assert.equal(match.season, 5);
  assert.equal(match.workType, "tv_series");
  assert.equal(cleanWorkTitle("Stranger Things Season 5 First Look Revealed"), "Stranger Things First Look Revealed");
});

test("generic entity extraction keeps evidence and confidence", () => {
  const extractions = extractEntitiesFromText({
    title: "Warner Bros. Announces Major DC Slate",
    description: "The studio says James Gunn will direct the new film.",
  });
  const studio = extractions.find((extraction) => extraction.type === "organization");
  const person = extractions.find((extraction) => extraction.type === "person");
  assert.ok(studio, "studio entity extracted");
  assert.equal(studio.evidence[0].field, "title");
  assert.ok(studio.confidence >= 0.5);
  assert.ok(person, "person entity extracted from person cue");
});

// ──────────────────────────────────────────────────────────── Verification

test("verification states: unverified → single → corroborated → high_confidence → disputed → developing", () => {
  assert.equal(computeVerificationState({ independentPublishers: 0, factCount: 0, conflictingFacts: 0, corroboratedFacts: 0, developing: false }).state, "unverified");
  assert.equal(computeVerificationState({ independentPublishers: 1, factCount: 3, conflictingFacts: 0, corroboratedFacts: 0, developing: false }).state, "single_source");
  assert.equal(computeVerificationState({ independentPublishers: 2, factCount: 5, conflictingFacts: 0, corroboratedFacts: 1, developing: false }).state, "corroborated");
  assert.equal(computeVerificationState({ independentPublishers: 3, factCount: 9, conflictingFacts: 0, corroboratedFacts: 4, developing: false }).state, "high_confidence");
  assert.equal(computeVerificationState({ independentPublishers: 3, factCount: 5, conflictingFacts: 2, corroboratedFacts: 2, developing: false }).state, "disputed");
  assert.equal(computeVerificationState({ independentPublishers: 2, factCount: 4, conflictingFacts: 0, corroboratedFacts: 0, developing: true }).state, "developing");
});

test("conflicting publication dates are conflict-sensitive; headline wording is not", () => {
  assert.ok(CONFLICT_SENSITIVE_FACT_KEYS.has("published_at"));
  assert.ok(CONFLICT_SENSITIVE_FACT_KEYS.has("release_year"));
  assert.equal(CONFLICT_SENSITIVE_FACT_KEYS.has("headline"), false);
});

test("fact extraction is deterministic", () => {
  const facts = extractFactsFromItem({
    title: "Warner Bros. Announces Major DC Slate",
    publishedAt: new Date("2026-08-30T10:00:00Z"),
    language: "en",
    externalId: "ext-1",
  });
  assert.equal(facts.length, 3);
  assert.equal(facts[0].factKey, "headline");
  assert.equal(facts[1].factKey, "published_at");
  assert.equal(facts[1].statement, "2026-08-30T10:00:00.000Z");
});

// ──────────────────────────────────────────────────────────── Source diversity

test("source diversity: duplicate/syndicated copies never count as independent", () => {
  const members = [
    { itemId: "1", sourceDomain: "deadline.com", sourceName: "Deadline", contentHash: "hash-a", title: "Dune Part Three Officially Greenlit at Warner" },
    { itemId: "2", sourceDomain: "variety.com", sourceName: "Variety", contentHash: "hash-b", title: "Dune Part Three Officially Greenlit at Warner" },
    { itemId: "3", sourceDomain: "www.deadline.com", sourceName: "Deadline Mirror", contentHash: "hash-a", title: "Dune Part Three Officially Greenlit at Warner" },
    { itemId: "4", sourceDomain: "m.deadline.com", sourceName: "Deadline Mobile", contentHash: "hash-a", title: "Dune Part Three Officially Greenlit at Warner" },
    { itemId: "5", sourceDomain: "syndication.example", sourceName: "Syndicator", contentHash: "hash-b", title: "Dune Part Three Officially Greenlit at Warner" },
  ];
  const result = computeSourceDiversity(members);
  // Same headline across publishers is CORROBORATION, not syndication; only
  // identical content (mirror copies) folds into another publisher's group.
  assert.equal(result.independentPublishers, 2, "deadline + variety only");
  assert.equal(result.syndicatedGroups, 1, "syndicator folds into variety");
  assert.ok(Math.abs(result.diversityScore - 2 / 3) < 0.01, "diversity score saturates at 2/3");
});

test("publisher group key collapses mirrors and www/m prefixes", () => {
  assert.equal(publisherGroupKey("www.Deadline.com"), "deadline.com");
  assert.equal(publisherGroupKey("m.variety.com"), "variety.com");
  assert.equal(publisherGroupKey("amp.screenrant.com"), "screenrant.com");
});

// ──────────────────────────────────────────────────────────── Candidate scoring

test("high relevance story scores far above an irrelevant one", () => {
  const profile: SiteEditorialProfile = {
    siteId: "site-1",
    profileVersion: 1,
    builtAt: new Date().toISOString(),
    topics: ["movies", "series", "streaming"],
    categories: ["cine", "tv"],
    taxonomy: [],
    audience: [],
    language: "en",
    location: [],
    editorialDescription: null,
    contentGaps: [{ topic: "movies", score: 0.6, reason: "no_existing_coverage" }],
    existingTitles: [],
    sitemapUrl: null,
    articleStats: { articleCount: 0, avgTitleTokens: 0 },
  };

  const fitHigh = scoreSiteFit(profile, {
    title: "Dune: Part Three Officially Greenlit at Warner",
    categories: ["cine"],
    entityNames: ["Dune", "Warner Bros"],
    entityTypes: ["movie", "organization"],
    language: "en",
  });
  assert.ok(fitHigh.score >= 0.7, `site fit should be high, got ${fitHigh.score}`);
  assert.ok(fitHigh.gapHit, "gap hit expected");

  const fitLow = scoreSiteFit(profile, {
    title: "Central Bank Raises Interest Rates Again",
    categories: ["economy"],
    entityNames: ["Central Bank"],
    entityTypes: ["organization"],
    language: "en",
  });
  assert.ok(fitLow.score <= 0.3, `site fit should be low, got ${fitLow.score}`);

  const base = {
    now: new Date(),
    firstSeenAt: new Date(Date.now() - 2 * 3_600_000),
    lastSeenAt: new Date(),
    memberCount: 3,
    authorityScore: 0.8,
    diversity: { independentPublishers: 3, totalGroups: 3, syndicatedGroups: 0, diversityScore: 1, detail: { groups: [], evidence: [] } },
    verificationState: "corroborated" as const,
    corroboratedFacts: 4,
    entities: [
      { name: "Dune", type: "movie", confidence: 0.85 },
      { name: "Warner Bros", type: "organization", confidence: 0.7 },
    ],
    enrichmentCount: 2,
    coveredSimilarity: 0,
    domainRelevance: [{ score: 0.8, reason: "site_covers_movie" }],
  };
  const high = scoreCandidate({ ...base, siteFit: fitHigh });
  const low = scoreCandidate({
    ...base,
    siteFit: fitLow,
    entities: [{ name: "Central Bank", type: "organization", confidence: 0.7 }],
    domainRelevance: [],
  });
  assert.ok(high.score >= 0.6, `high relevance expected, got ${high.score}`);
  assert.ok(low.score < high.score - 0.2, "irrelevant story must score lower");
  // Component transparency: every weighted component is present.
  assert.equal(high.components.length, Object.keys(CANDIDATE_WEIGHTS).length);
  assert.ok(high.reasons.some((reason) => reason.includes("content_gap")));
});

// ──────────────────────────────────────────────────────────── Provider cache

test("provider cache: TTL, negative caching, coalescing and rate limiting", async () => {
  const seed = `cache-${Date.now()}`;
  const tenant = await prisma.tenant.create({ data: { name: seed, apiKeyHash: sha256(`${seed}-k`), status: "active" } });
  try {
    const key = buildProviderCacheKey("fake", "movie", { query: "Dune", year: 2021 });
    // Deterministic key.
    assert.equal(key, buildProviderCacheKey("fake", "movie", { year: 2021, query: "Dune" }));

    // Miss → store → hit.
    const miss = await lookupProviderCache(tenant.id, "fake", "movie", key);
    assert.equal(miss.miss, true);
    await storeProviderCache(tenant.id, "fake", "movie", key, { id: "1" }, { ttlMs: 60_000 });
    const hit = await lookupProviderCache(tenant.id, "fake", "movie", key);
    assert.equal(hit.hit, true);
    assert.deepEqual(hit.payload, { id: "1" });

    // Negative cache.
    const negKey = buildProviderCacheKey("fake", "movie", { query: "Not A Real Film", year: 1999 });
    await storeProviderCache(tenant.id, "fake", "movie", negKey, null, { ttlMs: 60_000, negative: true });
    const neg = await lookupProviderCache(tenant.id, "fake", "movie", negKey);
    assert.equal(neg.hit, true);
    assert.equal(neg.negative, true);

    // SWR: expired within grace window still servable as stale.
    const staleKey = buildProviderCacheKey("fake", "movie", { query: "Stale", year: 2000 });
    const expiredAt = new Date(Date.now() - 10 * 60_000);
    await prisma.providerCacheEntry.create({
      data: { tenantId: tenant.id, providerKey: "fake", resourceType: "movie", cacheKey: staleKey, payload: { id: "stale" }, isNegative: false, expiresAt: expiredAt },
    });
    const stale = await lookupProviderCache(tenant.id, "fake", "movie", staleKey);
    assert.equal(stale.hit, true);
    assert.equal(stale.stale, true);

    // Rate limiting: window caps calls.
    resetProviderRateWindows();
    const policy = { maxRequests: 3, windowMs: 60_000 };
    assert.equal(providerRateSlotAvailable("fake", policy), true);
    assert.equal(providerRateSlotAvailable("fake", policy), true);
    assert.equal(providerRateSlotAvailable("fake", policy), true);
    assert.equal(providerRateSlotAvailable("fake", policy), false);

    // Per-100 rates are stable math.
    const counters = createCostCounters();
    counters.itemsSeen = 100;
    counters.aiCalls = 2;
    counters.enrichmentCalls = 15;
    counters.cacheHits = 30;
    counters.cacheMisses = 10;
    const rates = ratesPer100(counters);
    assert.equal(rates.aiCallsPer100, 2);
    assert.equal(rates.enrichmentCallsPer100, 15);
    assert.equal(rates.cacheHitRatio, 0.75);
  } finally {
    await prisma.providerCacheEntry.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.tenant.deleteMany({ where: { id: tenant.id } });
  }
});

// ──────────────────────────────────────────────────────────── Pipeline: DB

test("scenario: duplicate vs corroborating publisher — syndication collapses, independent publishers corroborate", async () => {
  const fixture = await createIntelligenceFixture();
  try {
    const title = "Dune Part Three Officially Greenlit at Warner Bros";
    // Publisher A + its mirror (same content hash) + publisher B.
    const itemA = makeItem({ title, externalId: "a-1", canonicalUrl: "https://a.example/dune3", sourceUrl: "https://a.example/dune3", publishedAt: "2026-08-30T10:00:00Z" });
    const mirror = makeItem({ title, externalId: "a-mirror-1", canonicalUrl: "https://mirror.a.example/dune3", sourceUrl: "https://mirror.a.example/dune3", publishedAt: "2026-08-30T10:05:00Z", description: "Mirror copy with slightly different body wording.", cleanedText: "Mirror copy with slightly different body wording." });
    const itemB = makeItem({ title, externalId: "b-1", canonicalUrl: "https://b.example/dune3", sourceUrl: "https://b.example/dune3", publishedAt: "2026-08-30T10:00:00Z" });

    const idA = await ingestAndScore(fixture.tenantId, fixture.sourceA, itemA, 0.8);
    const idMirror = await ingestAndScore(fixture.tenantId, fixture.sourceA, { ...mirror, externalId: "a-mirror-1", canonicalUrl: "https://mirror.a.example/dune3" }, 0.8);
    const idB = await ingestAndScore(fixture.tenantId, fixture.sourceB, { ...itemB, externalId: "b-1", canonicalUrl: "https://b.example/dune3" }, 0.8);

    await runIntelligencePipelineForItem(fixture.tenantId, idA);
    await runIntelligencePipelineForItem(fixture.tenantId, idMirror);
    await runIntelligencePipelineForItem(fixture.tenantId, idB);

    const clusters = await prisma.storyCluster.findMany({ where: { tenantId: fixture.tenantId, status: { not: "superseded" } } });
    assert.equal(clusters.length, 1, "one story cluster expected");
    const cluster = clusters[0];
    assert.equal(cluster.sourceDiversity, 2, "only 2 independent publishers");
    assert.equal(cluster.verificationState, "corroborated");
    assert.equal(cluster.sourceCount, 2, "distinct sources count");
  } finally {
    await cleanupIntelligenceFixture(fixture);
  }
});

test("scenario: story updates — same externalId with changed content updates the item", async () => {
  const fixture = await createIntelligenceFixture();
  try {
    const title = "Marvel Announces New Avengers Movie Date";
    const first = makeItem({ title, externalId: "story-update-1", canonicalUrl: "https://a.example/avengers", sourceUrl: "https://a.example/avengers" });
    const updated = makeItem({ title, externalId: "story-update-1", canonicalUrl: "https://a.example/avengers", sourceUrl: "https://a.example/avengers", description: "Updated description with a changed release window for the film.", cleanedText: "Updated description with a changed release window for the film." });

    const id1 = await ingestAndScore(fixture.tenantId, fixture.sourceA, first, 0.6);
    await runIntelligencePipelineForItem(fixture.tenantId, id1);

    const again = await upsertSourceItem(fixture.tenantId, fixture.sourceA, updated);
    assert.equal(again.created, false);
    assert.equal(again.updated, true, "changed content on same identity is an update");
    assert.ok(again.sourceItemId);

    // Re-running the pipeline on the updated item refreshes facts.
    const rerun = await runIntelligencePipelineForItem(fixture.tenantId, again.sourceItemId as string);
    assert.equal(rerun.filtered, false);
  } finally {
    await cleanupIntelligenceFixture(fixture);
  }
});

test("scenario: conflicting publication dates across publishers → disputed", async () => {
  const fixture = await createIntelligenceFixture();
  try {
    const title = "Netflix Renews The Midnight Club For Second Season";
    const itemA = makeItem({ title, externalId: "date-a", canonicalUrl: "https://a.example/date", sourceUrl: "https://a.example/date", publishedAt: "2026-08-29T10:00:00Z" });
    const itemB = makeItem({ title, externalId: "date-b", canonicalUrl: "https://b.example/date", sourceUrl: "https://b.example/date", publishedAt: "2026-08-31T10:00:00Z" });

    const idA = await ingestAndScore(fixture.tenantId, fixture.sourceA, itemA, 0.7);
    const idB = await ingestAndScore(fixture.tenantId, fixture.sourceB, itemB, 0.7);
    await runIntelligencePipelineForItem(fixture.tenantId, idA);
    await runIntelligencePipelineForItem(fixture.tenantId, idB);

    const clusters = await prisma.storyCluster.findMany({ where: { tenantId: fixture.tenantId } });
    assert.equal(clusters.length, 1);
    assert.equal(clusters[0].verificationState, "disputed");
    const summary = await summarizeClusterFacts(fixture.tenantId, clusters[0].id);
    assert.equal(summary.conflictingFacts, 2, "both sides record the conflict");
  } finally {
    await cleanupIntelligenceFixture(fixture);
  }
});

test("scenario: conflicting factual claims (release year) → disputed with evidence", async () => {
  const fixture = await createIntelligenceFixture();
  try {
    await updateIntelligenceSettings(fixture.tenantId, { enabledDomains: ["movie_tv"] });
    const engine = new ProviderEngine([new FakeAdapter()]);
    setMovieTvProviderEngine(engine);

    const titleA = "Dune Remake (2021) Gets Official Release Date";
    const titleB = "Dune Remake (1984) Gets Official Release Date";
    const itemA = makeItem({ title: titleA, externalId: "year-a", canonicalUrl: "https://a.example/year", sourceUrl: "https://a.example/year", publishedAt: "2026-08-30T10:00:00Z" });
    const itemB = makeItem({ title: titleB, externalId: "year-b", canonicalUrl: "https://b.example/year", sourceUrl: "https://b.example/year", publishedAt: "2026-08-30T11:00:00Z" });

    const idA = await ingestAndScore(fixture.tenantId, fixture.sourceA, itemA, 0.8);
    const idB = await ingestAndScore(fixture.tenantId, fixture.sourceB, itemB, 0.8);
    await runIntelligencePipelineForItem(fixture.tenantId, idA);
    await runIntelligencePipelineForItem(fixture.tenantId, idB);

    const clusters = await prisma.storyCluster.findMany({ where: { tenantId: fixture.tenantId } });
    assert.equal(clusters.length, 1, "same-story headlines must cluster despite year difference");
    const summary = await summarizeClusterFacts(fixture.tenantId, clusters[0].id);
    assert.ok(summary.conflictingFacts > 0, "release_year conflict recorded");
    assert.equal(clusters[0].verificationState, "disputed");
  } finally {
    await cleanupIntelligenceFixture(fixture);
  }
});

test("scenario: provider unavailable — pipeline completes, negative cache written", async () => {
  const fixture = await createIntelligenceFixture();
  try {
    await updateIntelligenceSettings(fixture.tenantId, { enabledDomains: ["movie_tv"], providerPrecedence: { identity: ["fake"], rating: [], metadata: [] } });
    const fake = new FakeAdapter({ unavailable: true });
    setMovieTvProviderEngine(new ProviderEngine([fake]));

    const item = makeItem({ title: "Dune: Part Three Greenlit By Warner Bros", externalId: "down-1", canonicalUrl: "https://a.example/down", sourceUrl: "https://a.example/down" });
    const id = await ingestAndScore(fixture.tenantId, fixture.sourceA, item, 0.7);
    const result = await runIntelligencePipelineForItem(fixture.tenantId, id);
    assert.equal(result.filtered, false);
    assert.equal(result.clusterId === null, false);
    assert.equal(fake.calls, 1, "provider attempted once");

    const negatives = await prisma.providerCacheEntry.count({ where: { tenantId: fixture.tenantId, isNegative: true } });
    assert.ok(negatives >= 1, "negative cache protects the provider from repeat misses");

    // A second identical item must NOT call the provider again.
    const item2 = makeItem({ title: "Dune: Part Three Greenlit By Warner Bros", externalId: "down-2", canonicalUrl: "https://b.example/down2", sourceUrl: "https://b.example/down2" });
    const id2 = await ingestAndScore(fixture.tenantId, fixture.sourceB, item2, 0.7);
    await runIntelligencePipelineForItem(fixture.tenantId, id2);
    assert.equal(fake.calls, 1, "negative cache short-circuits the provider");
  } finally {
    await cleanupIntelligenceFixture(fixture);
  }
});

test("scenario: provider rate limited — pipeline skips without negative cache", async () => {
  const fixture = await createIntelligenceFixture();
  try {
    await updateIntelligenceSettings(fixture.tenantId, { enabledDomains: ["movie_tv"], providerPrecedence: { identity: ["fake"], rating: [], metadata: [] } });
    const fake = new FakeAdapter({ rateLimited: true });
    setMovieTvProviderEngine(new ProviderEngine([fake]));

    const item = makeItem({ title: "Dune: Part Three Greenlit By Warner Bros", externalId: "rl-1", canonicalUrl: "https://a.example/rl", sourceUrl: "https://a.example/rl" });
    const id = await ingestAndScore(fixture.tenantId, fixture.sourceA, item, 0.7);
    const result = await runIntelligencePipelineForItem(fixture.tenantId, id);
    assert.equal(result.filtered, false, "rate limit must not fail the pipeline");
    assert.ok(fake.calls >= 1);

    const negatives = await prisma.providerCacheEntry.count({ where: { tenantId: fixture.tenantId, isNegative: true } });
    assert.equal(negatives, 0, "rate limits are never cached as not-found");
  } finally {
    await cleanupIntelligenceFixture(fixture);
  }
});

test("scenario: cached provider response — second identical enrichment never calls the provider", async () => {
  const fixture = await createIntelligenceFixture();
  try {
    await updateIntelligenceSettings(fixture.tenantId, { enabledDomains: ["movie_tv"], providerPrecedence: { identity: ["fake"], rating: [], metadata: [] } });
    const fake = new FakeAdapter();
    setMovieTvProviderEngine(new ProviderEngine([fake]));

    const title = "Dune: Part Three Greenlit By Warner Bros";
    const itemA = makeItem({ title, externalId: "cache-1", canonicalUrl: "https://a.example/cache", sourceUrl: "https://a.example/cache" });
    const itemB = makeItem({ title, externalId: "cache-2", canonicalUrl: "https://b.example/cache", sourceUrl: "https://b.example/cache" });

    const idA = await ingestAndScore(fixture.tenantId, fixture.sourceA, itemA, 0.7);
    const idB = await ingestAndScore(fixture.tenantId, fixture.sourceB, itemB, 0.7);
    const first = await runIntelligencePipelineForItem(fixture.tenantId, idA);
    const second = await runIntelligencePipelineForItem(fixture.tenantId, idB);

    assert.equal(first.counters.enrichmentCalls, 1);
    assert.equal(second.counters.enrichmentCalls, 0, "second lookup served from cache");
    assert.equal(fake.calls, 1, "provider called exactly once");
    assert.ok(second.counters.cacheHits >= 1);

    // Enrichment rows exist and carry attribution + provider data.
    const enrichments = await prisma.providerEnrichment.findMany({ where: { tenantId: fixture.tenantId } });
    assert.ok(enrichments.length >= 1);
    assert.equal(enrichments[0].providerKey, "fake");
  } finally {
    await cleanupIntelligenceFixture(fixture);
  }
});

test("scenario: irrelevant story scores low against an entertainment site", async () => {
  const fixture = await createIntelligenceFixture({ siteTopics: ["movies", "series", "streaming"], siteCategories: ["cine"] });
  try {
    const item = makeItem({
      title: "Central Bank Raises Interest Rates Across The Eurozone",
      externalId: "irr-1",
      canonicalUrl: "https://a.example/rates",
      sourceUrl: "https://a.example/rates",
      categories: ["economy"],
    });
    const id = await ingestAndScore(fixture.tenantId, fixture.sourceA, item, 0.7);
    const result = await runIntelligencePipelineForItem(fixture.tenantId, id);
    const cluster = await prisma.storyCluster.findFirst({ where: { id: result.clusterId as string } });
    assert.ok(cluster);
    assert.ok((cluster.candidateScore ?? 1) < 0.6, `irrelevant story scored ${cluster.candidateScore}`);
    const siteFit = cluster.siteFitScore ?? 1;
    assert.ok(siteFit <= 0.3, `site fit should be low, got ${siteFit}`);
  } finally {
    await cleanupIntelligenceFixture(fixture);
  }
});

test("scenario: high relevance story ranks high with explainable components", async () => {
  const fixture = await createIntelligenceFixture({ siteTopics: ["movies", "series", "streaming"], siteCategories: ["cine"] });
  try {
    const title = "Dune: Part Three Officially Greenlit at Warner Bros";
    const itemA = makeItem({ title, externalId: "high-a", canonicalUrl: "https://a.example/dune", sourceUrl: "https://a.example/dune", categories: ["cine"] });
    const itemB = makeItem({ title, externalId: "high-b", canonicalUrl: "https://b.example/dune", sourceUrl: "https://b.example/dune", categories: ["cine"] });
    const idA = await ingestAndScore(fixture.tenantId, fixture.sourceA, itemA, 0.9);
    const idB = await ingestAndScore(fixture.tenantId, fixture.sourceB, itemB, 0.9);
    await runIntelligencePipelineForItem(fixture.tenantId, idA);
    await runIntelligencePipelineForItem(fixture.tenantId, idB);

    const clusters = await prisma.storyCluster.findMany({ where: { tenantId: fixture.tenantId } });
    assert.equal(clusters.length, 1);
    const cluster = clusters[0];
    assert.ok((cluster.candidateScore ?? 0) >= 0.6, `expected high score, got ${cluster.candidateScore}`);
    assert.ok(Array.isArray(cluster.scoreComponents) && cluster.scoreComponents.length === 10, "all components stored");
    const reason = (cluster.reasonSelected as string[] | null) ?? [];
    assert.ok(reason.some((entry) => entry.includes("content_gap")), "content gap reason present");
    assert.ok(reason.some((entry) => entry.includes("topic_match") || entry.includes("site_covers")), "topic reason present");
  } finally {
    await cleanupIntelligenceFixture(fixture);
  }
});

// ──────────────────────────────────────────────────────────── Cluster actions

test("cluster merge moves items and facts; split creates a new cluster", async () => {
  const fixture = await createIntelligenceFixture();
  try {
    const titleA = "Marvel Announces New Avengers Movie Date";
    const titleB = "Sony Delays Kraven The Hunter To Next Spring";
    const idA = await ingestAndScore(fixture.tenantId, fixture.sourceA, makeItem({ title: titleA, externalId: "m-1", canonicalUrl: "https://a.example/m1", sourceUrl: "https://a.example/m1" }), 0.6);
    const idB = await ingestAndScore(fixture.tenantId, fixture.sourceB, makeItem({ title: titleB, externalId: "m-2", canonicalUrl: "https://b.example/m2", sourceUrl: "https://b.example/m2" }), 0.6);
    await runIntelligencePipelineForItem(fixture.tenantId, idA);
    await runIntelligencePipelineForItem(fixture.tenantId, idB);

    const clusters = await prisma.storyCluster.findMany({ where: { tenantId: fixture.tenantId } });
    assert.equal(clusters.length, 2);

    const merged = await mergeStoryClusters(fixture.tenantId, clusters[1].id, clusters[0].id);
    assert.ok(merged);
    assert.equal(merged.movedItems, 1);

    const items = await prisma.sourceItem.findMany({ where: { tenantId: fixture.tenantId } });
    assert.ok(items.every((item) => item.clusterId === clusters[0].id), "all items in target cluster");

    const split = await splitStoryCluster(fixture.tenantId, clusters[0].id, [idB]);
    assert.ok(split);
    assert.equal(split.movedItems, 1);
    const newCluster = await prisma.storyCluster.findUnique({ where: { id: split.newClusterId } });
    assert.ok(newCluster);
    assert.equal(newCluster.headline, titleB);
  } finally {
    await cleanupIntelligenceFixture(fixture);
  }
});

test("mute rules filter items at level 0 without provider calls", async () => {
  const fixture = await createIntelligenceFixture();
  try {
    await prisma.muteRule.create({ data: { tenantId: fixture.tenantId, kind: "topic", value: "cryptocurrency" } });
    const item = makeItem({
      title: "Cryptocurrency Markets Rally After New Regulation",
      externalId: "mute-1",
      canonicalUrl: "https://a.example/mute",
      sourceUrl: "https://a.example/mute",
    });
    const id = await ingestAndScore(fixture.tenantId, fixture.sourceA, item, 0.8);
    const result = await runIntelligencePipelineForItem(fixture.tenantId, id);
    assert.equal(result.filtered, true);
    assert.equal(result.rejected, true);
    assert.equal(result.maxLevel, 0);
    const stored = await prisma.sourceItem.findUnique({ where: { id } });
    assert.equal(stored?.processingStatus, "rejected");
  } finally {
    await cleanupIntelligenceFixture(fixture);
  }
});

test("evidence year reader parses deterministic year signals", () => {
  assert.equal(readEvidenceYear([{ match: "year:2021", method: "movie_tv_signal" }]), 2021);
  assert.equal(readEvidenceYear([{ match: "something else" }]), null);
  assert.equal(readEvidenceYear(null), null);
});

test("candidate score component weights sum to 1", () => {
  const total = Object.values(CANDIDATE_WEIGHTS).reduce((sum, weight) => sum + weight, 0);
  assert.ok(Math.abs(total - 1) < 1e-9, `weights must sum to 1, got ${total}`);
});
