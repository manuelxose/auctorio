import test from "node:test";
import assert from "node:assert/strict";
import { parseGoogleAdsVolume } from "../src/infrastructure/seo/dataforseo";
import { keywordContentType } from "../src/studio/plan-keywords";
import { REACHABLE_DIFFICULTY, reachableDifficultyFor } from "../src/studio/keyword-candidates";
import { cleanPublisher } from "../src/studio/serp-sources";
import { renderWritingGuidance, DEFAULT_WRITING } from "../src/studio/editorial-engine/structure";
import { extractPageFromHtml } from "../src/studio/site-intelligence/crawler";

test("M2 Google Ads fallback: volume only, keywords without volume absent", () => {
  const { items, costUsd } = parseGoogleAdsVolume({
    status_code: 20000,
    cost: 0.075,
    tasks: [{ status_code: 20000, result: [{ keyword: "Canal Sur Hoy", search_volume: 50 }, { keyword: "sin datos", search_volume: null }] }],
  });
  assert.equal(costUsd, 0.075);
  assert.deepEqual(items, [{ keyword: "canal sur hoy", volume: 50 }]);
  assert.throws(() => parseGoogleAdsVolume({ status_code: 40104, status_message: "not verified" }), /40104/);
});

test("M2 Add keywords: list keywords become listicles, the rest explainers", () => {
  assert.deepEqual(keywordContentType("mejores apps para ver la tele"), { contentType: "listicle", intent: "commercial-investigation" });
  assert.deepEqual(keywordContentType("top 10 series de netflix"), { contentType: "listicle", intent: "informational" });
  assert.deepEqual(keywordContentType("qué es la tdt"), { contentType: "explainer", intent: "informational" });
  assert.equal(keywordContentType("precio de movistar plus").intent, "commercial-investigation");
});

test("M2 reachable difficulty: 75th percentile of the site's own ranking keywords, clamped", () => {
  const own = (values: number[]) => values.map((difficulty, i) => ({ keyword: `k${i}`, volume: 10, difficulty, cpc: null, intent: null, source: "dataforseo" as const, fetchedAt: "" }));
  assert.equal(reachableDifficultyFor(own([1, 2, 3])), REACHABLE_DIFFICULTY, "too few known");
  assert.equal(reachableDifficultyFor(own([10, 20, 30, 40, 45, 50, 55, 60, 70, 80])), 60);
  assert.equal(reachableDifficultyFor(own(Array(12).fill(5))), 20);
});

test("M4 publisher: the outlet's og:site_name, not its domain", () => {
  const html = `<html><head><meta property="og:site_name" content="Xataka"><title>t</title></head><body><main>${"Texto largo de prueba con muchas palabras. ".repeat(20)}</main></body></html>`;
  assert.equal(extractPageFromHtml("https://www.xataka.com", "https://www.xataka.com/a", html)?.siteName, "Xataka");
  assert.equal(cleanPublisher("  Xataka  "), "Xataka");
  assert.equal(cleanPublisher("https://xataka.com"), null);
  assert.equal(cleanPublisher("x".repeat(80)), null);
});

test("M8 news/manual: writing rules without the guide's summary box", () => {
  const lines = renderWritingGuidance({ ...DEFAULT_WRITING, instructions: ["Nunca uses «leverage»"], disclaimer: "Aviso." }, "es", { summary: false });
  assert.ok(lines.some((line) => line.includes("leverage")) && lines.some((line) => line.includes("Aviso.")));
  assert.ok(!lines.some((line) => line.startsWith("Summary block")));
  assert.ok(renderWritingGuidance(DEFAULT_WRITING, "es").some((line) => line.startsWith("Summary block")));
});
