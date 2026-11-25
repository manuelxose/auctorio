import test from "node:test";
import assert from "node:assert/strict";
import { parseKeywordOverview, type KeywordMetrics } from "../src/infrastructure/seo/dataforseo";
import { isKeywordVariant, keywordOpportunityScore, keywordScoreParts, rankKeywordCandidates, type KeywordCandidate } from "../src/studio/keyword-candidates";
import { resolveWeights } from "../src/studio/seo-intelligence/scoring";
import { applyMeasuredKeywords, keywordAssignmentBlock } from "../src/studio/editorial-plan";
import { screenKeywords } from "../src/studio/plan-keywords";

const metric = (keyword: string, volume: number | null, difficulty: number | null, intent: string | null = "informational"): KeywordMetrics => ({ keyword, volume, difficulty, cpc: null, intent, source: "dataforseo" });
const context = {
  profile: null,
  site: { id: "s", name: "Guía TV", type: "guiatv", baseUrl: "https://example.test", locale: "es-ES" },
  searchTargets: [] as string[],
  existingPlanQueries: [] as string[],
  existingPlanTitles: [] as string[],
  indexedUrlInventory: [] as string[],
};

test("opportunity score: known factors only; no demand of any kind → 0", () => {
  const base = { volume: 10_000, difficulty: 20, relevance: 80, intent: "informational" };
  assert.equal(keywordOpportunityScore({ ...base, volume: null }), 0);
  assert.equal(keywordOpportunityScore({ volume: 99_999, difficulty: 10, relevance: 100, intent: "informational" }), 100);
  const easy = keywordOpportunityScore(base);
  const hard = keywordOpportunityScore({ ...base, difficulty: 60 });
  assert.ok(easy > hard && hard > 0, `${easy} > ${hard} > 0`);
  assert.ok(easy > keywordOpportunityScore({ ...base, intent: "transactional" }));
  // Difficulty matters but no longer decides alone: the old product left this at 4.
  assert.ok(keywordOpportunityScore({ volume: 10_000, difficulty: 100, relevance: 100, intent: "informational" }) > 30);
  assert.equal(keywordOpportunityScore({ ...base, relevance: 0 }), 0);
  // Unknown stays unknown: it is neither the best nor the worst value.
  assert.deepEqual(keywordScoreParts({ ...base, difficulty: null, intent: null }), { demand: keywordScoreParts(base)!.demand, winnability: null, relevance: 0.8, intentFit: null });
});

test("the intent a business prefers depends on its profile", () => {
  const score = (profile: "publisher" | "ecommerce", intent: string) => keywordOpportunityScore({ volume: 5_000, difficulty: 10, relevance: 90, intent }, 30, { profile, weights: resolveWeights(profile) });
  assert.ok(score("publisher", "informational") > score("publisher", "transactional"));
  assert.ok(score("ecommerce", "transactional") > score("ecommerce", "informational"));
});

test("Search Console evidence keeps a keyword nobody measured; a volume still wins over impressions", () => {
  const firstParty = { impressions: 800, clicks: 3, position: 22 };
  const ranked = rankKeywordCandidates(
    [metric("programacion canal sur", null, null, null), { ...metric("programacion la 2", null, null, null), source: "search_console", firstParty }],
    context,
    10,
  );
  assert.deepEqual(ranked.map((candidate) => [candidate.keyword, candidate.volume, candidate.difficulty]), [["programacion la 2", null, null]]);
  assert.deepEqual(ranked[0].firstParty, firstParty);
  assert.equal(ranked[0].parts!.winnability! > 0, true);
  const measured = keywordScoreParts({ volume: 1_000, difficulty: null, relevance: 80, intent: null, firstParty })!;
  assert.equal(measured.demand, keywordScoreParts({ volume: 1_000, difficulty: null, relevance: 80, intent: null })!.demand);
});

test("variants differ by one modifier; different channels are different topics", () => {
  assert.equal(isKeywordVariant("programacion la 2", "programación La 2 hoy"), true);
  assert.equal(isKeywordVariant("programacion la 1", "programacion la 2"), false);
  assert.equal(isKeywordVariant("audiencias tv", "audiencias tv ayer hoy"), false);
});

test("rankKeywordCandidates drops no-demand and planned keywords, folds variants into the strongest", () => {
  const ranked = rankKeywordCandidates(
    [
      metric("programación la 2 hoy", 12_100, 0),
      metric("programacion la 2", 40_500, 5),
      metric("Programación La 2", 40_500, 5), // duplicate after normalization
      metric("qué echan ahora", null, null),
      metric("receta de paella valenciana", 90_000, 10), // competitor noise, off-topic
      metric("audiencias tv", 135_000, 18),
    ],
    { ...context, existingPlanQueries: ["audiencias tv"] },
    10,
  );
  assert.deepEqual(ranked.map((candidate) => candidate.keyword), ["programacion la 2"]);
  assert.deepEqual(ranked[0].variants, ["programación la 2 hoy"]);
  assert.ok(ranked[0].score > 0);
});

test("ranked_keywords rows (nested keyword_data) parse like overview rows", () => {
  const parsed = parseKeywordOverview({
    status_code: 20000,
    cost: 0.012,
    tasks: [{ status_code: 20000, result: [{ items: [{ keyword_data: { keyword: "Guía TV", keyword_info: { search_volume: 90_500 }, keyword_properties: { keyword_difficulty: 40 } }, ranked_serp_element: {} }] }] }],
  });
  assert.deepEqual([parsed.items[0].keyword, parsed.items[0].volume, parsed.items[0].difficulty], ["guía tv", 90_500, 40]);
});

test("the model writes briefs for handed keywords only; its score is replaced", () => {
  const assigned: KeywordCandidate[] = [{ ...metric("programacion la 2", 40_500, 5), score: 77, variants: ["programación la 2 hoy"] }];
  assert.match(keywordAssignmentBlock(assigned, 1), /"programacion la 2" \(variants: programación la 2 hoy\)/);
  assert.doesNotMatch(keywordAssignmentBlock(assigned, 1), /of your choice/);
  assert.match(keywordAssignmentBlock(assigned, 2), /1 more item\(s\) with keywords of your choice/);
  assert.equal(keywordAssignmentBlock([], 3), "");

  const brief = (primaryKeyword: string) => ({ workingTitle: primaryKeyword, primaryKeyword, opportunityScore: 99, secondaryKeywords: ["x"] }) as never;
  const full = applyMeasuredKeywords([brief("Programacion La 2"), brief("otra cosa")], assigned, 1);
  assert.equal(full.items.length, 1);
  assert.deepEqual([full.items[0].opportunityScore, full.items[0].targetQuery, full.items[0].secondaryKeywords], [77, "programacion la 2", ["programación la 2 hoy", "x"]]);
  assert.match(full.dropped[0].reason, /not from measured candidates/);
  // Pool ran short (1 keyword for 2 items): the model's own keyword is allowed for the rest.
  assert.equal(applyMeasuredKeywords([brief("programacion la 2"), brief("otra cosa")], assigned, 2).items.length, 2);
  // No provider: untouched.
  assert.equal(applyMeasuredKeywords([brief("otra cosa")], [], 1).items[0].opportunityScore, 99);
});

test("Add keywords folds a variant into the first keyword instead of a second article", () => {
  const screen = screenKeywords(["programacion la 2", "programación la 2 hoy"], context);
  assert.deepEqual(screen.kept, ["programacion la 2"]);
  assert.deepEqual(screen.dropped, [{ keyword: "programación la 2 hoy", reason: "variant" }]);
});
