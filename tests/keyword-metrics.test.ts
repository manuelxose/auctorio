import test from "node:test";
import assert from "node:assert/strict";
import { dataForSeoLocation, difficultyLabel, parseKeywordOverview } from "../src/infrastructure/seo/dataforseo";

// The plan-enrichment workflow (database, cache, spend) is covered in seo-manager.test.ts.
const overview = (items: unknown[], cost = 0.01) => ({ status_code: 20000, cost, tasks: [{ status_code: 20000, result: [{ items }] }] });

test("parseKeywordOverview reads volume, 0–100 difficulty, cpc and intent; missing values stay null", () => {
  const parsed = parseKeywordOverview(overview([
    { keyword: "Canales de Televisión Gratis", keyword_info: { search_volume: 1600, cpc: 0.2 }, keyword_properties: { keyword_difficulty: 21 }, search_intent_info: { main_intent: "informational" } },
    { keyword: "guía tv online", keyword_info: { search_volume: null }, keyword_properties: {} },
  ]));
  assert.equal(parsed.costUsd, 0.01);
  assert.deepEqual(parsed.items[0], { keyword: "canales de televisión gratis", volume: 1600, difficulty: 21, cpc: 0.2, intent: "informational", source: "dataforseo", adsCompetition: null, asOf: null, rank: null, estimatedTraffic: null });
  assert.deepEqual([parsed.items[1].volume, parsed.items[1].difficulty], [null, null]);
  assert.throws(() => parseKeywordOverview({ status_code: 40100, status_message: "Not authorized" }), /40100/);
  assert.throws(() => parseKeywordOverview({ status_code: 20000, tasks: [{ status_code: 40501 }] }), /40501/);
});

test("dataForSeoLocation maps locales and refuses unknown markets; difficultyLabel buckets", () => {
  assert.deepEqual(dataForSeoLocation("es-ES"), { locationCode: 2724, languageCode: "es" });
  assert.deepEqual(dataForSeoLocation("es"), { locationCode: 2724, languageCode: "es" });
  assert.deepEqual(dataForSeoLocation("es_MX"), { locationCode: 2484, languageCode: "es" });
  assert.equal(dataForSeoLocation("ja-JP"), null);
  assert.equal(dataForSeoLocation(null), null);
  assert.deepEqual([21, 30, 55, 89, null].map(difficultyLabel), ["easy", "medium", "hard", "very_hard", null]);
});
