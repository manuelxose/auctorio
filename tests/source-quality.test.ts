import test from "node:test";
import assert from "node:assert/strict";
import {
  QUALITY_TIERS,
  detectSpamSignals,
  evaluateDomainQuality,
  type DomainEvaluationContext,
} from "../src/studio/source-quality";

function context(overrides: Partial<DomainEvaluationContext> = {}): DomainEvaluationContext {
  return {
    domain: "example.com",
    tenantId: "tenant",
    topicKeywords: ["streaming"],
    language: "es",
    blockedDomains: new Set(),
    siteBaseHost: null,
    ...overrides,
  };
}

test("detectSpamSignals flags spammy TLDs, numeric patterns and many hyphens", () => {
  assert.ok(detectSpamSignals("casino.win").spamRisk > 0.4);
  assert.ok(detectSpamSignals("deal1234site.com").spamRisk > 0.2);
  assert.ok(detectSpamSignals("a-b-c-d-example.com").spamRisk > 0.1);
  assert.equal(detectSpamSignals("example.com").spamRisk, 0);
});

test("evaluateDomainQuality marks blocked domains as BLOCKED with score 0", () => {
  const result = evaluateDomainQuality(
    context({ domain: "bad.com", blockedDomains: new Set(["bad.com"]) }),
  );
  assert.equal(result.tier, QUALITY_TIERS.BLOCKED);
  assert.equal(result.score, 0);
});

test("evaluateDomainQuality marks highly spammy domains as BLOCKED", () => {
  // Single weak signals alone do not block (legit sites use .info/.biz);
  // combined spam signals cross the 0.7 threshold.
  const result = evaluateDomainQuality(context({ domain: "win1234free.win" }));
  assert.equal(result.tier, QUALITY_TIERS.BLOCKED);
  const mild = evaluateDomainQuality(context({ domain: "deals.info" }));
  assert.ok(mild.dimensions.spamRisk > 0 && mild.tier !== QUALITY_TIERS.BLOCKED);
});

test("evaluateDomainQuality ranks the site's own host and gov domains as primary", () => {
  const own = evaluateDomainQuality(context({ domain: "tecnoria.com", siteBaseHost: "tecnoria.com" }));
  assert.equal(own.tier, QUALITY_TIERS.TIER_1_PRIMARY);
  const gov = evaluateDomainQuality(context({ domain: "cnmc.gob.es" }));
  assert.equal(gov.tier, QUALITY_TIERS.TIER_1_PRIMARY);
});

test("evaluateDomainQuality scores are bounded to 0..100", () => {
  const result = evaluateDomainQuality(
    context({
      domain: "news.example.com",
      topicKeywords: ["tv", "streaming", "futbol"],
      resultDescription: "Una cobertura muy completa y detallada del evento, con analisis y contexto relevante para la audiencia interesada en television, plataformas de streaming y futbol en directo.",
      publishedAt: new Date().toISOString(),
    }),
  );
  assert.ok(result.score >= 0 && result.score <= 100);
  assert.ok(["TIER_1_PRIMARY", "TIER_2_HIGH_AUTHORITY", "TIER_3_SPECIALIST", "TIER_4_DISCOVERY_ONLY"].includes(result.tier));
});

test("evaluateDomainQuality penalizes repeated failures and old content", () => {
  const stale = evaluateDomainQuality(
    context({
      publishedAt: new Date(Date.now() - 30 * 24 * 3_600_000).toISOString(),
      topicKeywords: [],
    }),
  );
  const fresh = evaluateDomainQuality(
    context({ publishedAt: new Date().toISOString(), topicKeywords: [] }),
  );
  assert.ok(fresh.dimensions.recency > stale.dimensions.recency);

  const unreliable = evaluateDomainQuality(
    context({
      source: {
        trustScore: 0.5,
        consecutiveFailures: 4,
        lastSuccessAt: null,
        lastFetchedAt: null,
        refreshIntervalMinutes: 30,
        language: "es",
        country: "ES",
      },
    }),
  );
  assert.ok(unreliable.dimensions.scrapeReliability < 0.5);
});

test("evaluateDomainQuality matches topics against the description", () => {
  const matched = evaluateDomainQuality(
    context({ topicKeywords: ["streaming", "television"], resultDescription: "Todo sobre streaming y television" }),
  );
  const unmatched = evaluateDomainQuality(
    context({ topicKeywords: ["streaming", "television"], resultDescription: "Recetas de cocina para principiantes" }),
  );
  assert.ok(matched.dimensions.relevance > unmatched.dimensions.relevance);
});
