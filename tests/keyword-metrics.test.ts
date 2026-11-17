import test from "node:test";
import assert from "node:assert/strict";
import { getPrismaClient } from "../src/infrastructure/db/prisma";
import { sha256 } from "../src/shared/utils/hash";
import { dataForSeoLocation, difficultyLabel, parseKeywordOverview } from "../src/infrastructure/seo/dataforseo";
import { enrichPlanItemsWithKeywordMetrics } from "../src/studio/keyword-metrics";

const prisma = getPrismaClient();
test.after(async () => {
  await prisma.$disconnect();
});

const overview = (items: unknown[], cost = 0.01) => ({ status_code: 20000, cost, tasks: [{ status_code: 20000, result: [{ items }] }] });

test("parseKeywordOverview reads volume, 0–100 difficulty, cpc and intent; missing values stay null", () => {
  const parsed = parseKeywordOverview(overview([
    { keyword: "Canales de Televisión Gratis", keyword_info: { search_volume: 1600, cpc: 0.2 }, keyword_properties: { keyword_difficulty: 21 }, search_intent_info: { main_intent: "informational" } },
    { keyword: "guía tv online", keyword_info: { search_volume: null }, keyword_properties: {} },
  ]));
  assert.equal(parsed.costUsd, 0.01);
  assert.deepEqual(parsed.items[0], { keyword: "canales de televisión gratis", volume: 1600, difficulty: 21, cpc: 0.2, intent: "informational", source: "dataforseo" });
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

test("plan items get measured metrics once, cached per keyword; no credentials → untouched", async () => {
  const seed = `kwm-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const tenant = await prisma.tenant.create({ data: { name: seed, apiKeyHash: sha256(seed), status: "active" } });
  const site = await prisma.site.create({ data: { tenantId: tenant.id, key: seed, name: seed, type: "guiatv", locale: "es-ES", baseUrl: "https://example.test" } });
  const plan = await prisma.editorialPlan.create({ data: { tenantId: tenant.id, siteId: site.id, name: seed, dateFrom: new Date(), dateTo: new Date() } });
  const item = (title: string, primaryKeyword: string | null) =>
    prisma.editorialPlanItem.create({ data: { tenantId: tenant.id, planId: plan.id, siteId: site.id, title, channel: "website", primaryKeyword } });
  const [known, unknown, none] = await Promise.all([item("a", "Canales de televisión gratis"), item("b", "keyword sin datos"), item("c", null)]);
  const saved = { login: process.env.DATAFORSEO_LOGIN, password: process.env.DATAFORSEO_PASSWORD };
  let calls = 0;
  const fetcher = async (keywords: string[]) => {
    calls++;
    assert.deepEqual(keywords.sort(), ["canales de televisión gratis", "keyword sin datos"]);
    return parseKeywordOverview(overview([{ keyword: "canales de televisión gratis", keyword_info: { search_volume: 1600 }, keyword_properties: { keyword_difficulty: 21 } }], 0.0101));
  };
  try {
    delete process.env.DATAFORSEO_LOGIN;
    assert.equal(await enrichPlanItemsWithKeywordMetrics(tenant.id, plan.id, fetcher), 0);
    assert.equal(calls, 0);

    process.env.DATAFORSEO_LOGIN = "test";
    process.env.DATAFORSEO_PASSWORD = "test";
    assert.equal(await enrichPlanItemsWithKeywordMetrics(tenant.id, plan.id, fetcher), 2);
    const rows = await prisma.editorialPlanItem.findMany({ where: { planId: plan.id } });
    const byId = new Map(rows.map((row) => [row.id, row]));
    assert.deepEqual([byId.get(known.id)!.searchVolume, byId.get(known.id)!.keywordDifficulty, byId.get(known.id)!.keywordMetricsSource], [1600, 21, "dataforseo"]);
    // Checked but no data: source recorded, numbers stay null (never invented).
    assert.deepEqual([byId.get(unknown.id)!.searchVolume, byId.get(unknown.id)!.keywordMetricsSource], [null, "dataforseo"]);
    assert.equal(byId.get(none.id)!.keywordMetricsSource, null);
    const spend = await prisma.aiSpendEvent.findMany({ where: { tenantId: tenant.id, kind: "keyword_metrics" } });
    assert.deepEqual(spend.map((row) => row.costUsd), [0.0101]);

    // Same keyword on a new item is served from cache: no second provider call.
    const again = await item("d", "canales de televisión gratis");
    assert.equal(await enrichPlanItemsWithKeywordMetrics(tenant.id, plan.id, fetcher), 1);
    assert.equal(calls, 1);
    assert.equal((await prisma.editorialPlanItem.findUnique({ where: { id: again.id } }))!.searchVolume, 1600);
  } finally {
    process.env.DATAFORSEO_LOGIN = saved.login ?? "";
    process.env.DATAFORSEO_PASSWORD = saved.password ?? "";
    await prisma.aiSpendEvent.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.providerCacheEntry.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.editorialPlanItem.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.editorialPlan.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.site.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.tenant.delete({ where: { id: tenant.id } });
  }
});
