// Persistent knowledge, reservoir and research control without a provider (what buys is in seo-manager.test.ts).
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import { getPrismaClient } from "../src/infrastructure/db/prisma";
import { sha256 } from "../src/shared/utils/hash";
import { registerStudioRoutes } from "../src/studio/routes";
import { STUDIO_PERMISSIONS_HEADER, STUDIO_SESSION_HEADER, STUDIO_SIGNATURE_HEADER, STUDIO_TENANT_HEADER, STUDIO_TIMESTAMP_HEADER, STUDIO_USER_HEADER } from "../src/studio/http-utils";
import { buildStudioProxySignature } from "../src/studio/security";
import { applyCorrections, buildEditorialPlanningContext } from "../src/studio/editorial-plan-context";
import { addOpportunityToPlan } from "../src/studio/competitors";
import { keywordHistory, knownKeywordMetrics, listSiteKeywords, recordKeywordMetrics, sharableProviders, storeSiteKeywords, type MetricRow } from "../src/studio/seo-research/knowledge";
import { disconnectSearchConsole } from "../src/studio/search-console";
import { DEFAULT_RESEARCH_POLICY, parseResearchPolicy, readResearchPolicy } from "../src/studio/seo-research/policy";
import { getResearchProfile, parseCorrections, researchTopics, saveResearchProfile } from "../src/studio/seo-research/profile";
import { claimKeywords, claimReserved, levelOf, reconcileReservoir, releaseReservations, reserveForPlanning, reservoirCoverage, stageOf, storeResearchOpportunities, type StageRow } from "../src/studio/seo-research/reservoir";
import { controlResearchRun, getResearchOverview, getResearchRun, listResearchRuns, requestResearch } from "../src/studio/seo-research/runs";
import { evaluateTriggers, nextOccurrence } from "../src/studio/seo-research/triggers";

const prisma = getPrismaClient();
const DAY = 86_400_000;
test.after(() => prisma.$disconnect());

async function workspace(locale = "es-ES") {
  const seed = `research-${randomUUID().slice(0, 8)}`;
  const tenant = await prisma.tenant.create({ data: { name: seed, apiKeyHash: sha256(seed), status: "active" } });
  const site = await prisma.site.create({ data: { tenantId: tenant.id, key: seed, name: seed, type: "guiatv", locale, baseUrl: "https://example.test" } });
  return {
    tenantId: tenant.id, siteId: site.id,
    async remove() {
      await prisma.editorialPlanItem.deleteMany({ where: { tenantId: tenant.id } });
      await prisma.editorialPlan.deleteMany({ where: { tenantId: tenant.id } });
      await prisma.site.deleteMany({ where: { tenantId: tenant.id } });
      await prisma.auditLog.deleteMany({ where: { tenantId: tenant.id } });
      await prisma.tenant.delete({ where: { id: tenant.id } });
    },
  };
}
type Workspace = Awaited<ReturnType<typeof workspace>>;
async function using(run: (a: Workspace, b: Workspace) => Promise<void>) {
  const [a, b] = [await workspace(), await workspace()];
  try {
    await run(a, b);
  } finally {
    await a.remove();
    await b.remove();
  }
}
const evidence = (volume: number | null = 900, at = new Date()) => ({ provider: { source: "dataforseo", volume, difficulty: 10, cpc: null, intent: "informational", position: null, asOf: null, at: at.toISOString() }, firstParty: null, origin: { kind: "site_topic", value: "tv" }, variants: [] });
const candidate = (keyword: string, score = 60) => ({ keyword, score, variants: [], evidence: evidence() });
const item = (ws: Workspace, planId: string, primaryKeyword: string, status: "proposed" | "canceled" = "proposed") => prisma.editorialPlanItem.create({ data: { tenantId: ws.tenantId, planId, siteId: ws.siteId, title: primaryKeyword, channel: "website", primaryKeyword, status } });
const plan = (ws: Workspace) => prisma.editorialPlan.create({ data: { tenantId: ws.tenantId, siteId: ws.siteId, name: "p", dateFrom: new Date(), dateTo: new Date(Date.now() + 30 * DAY), status: "ready" } });

test("lifecycle and enrichment levels are derived from what is stored", () => {
  const now = new Date("2026-11-25T00:00:00Z");
  const row = (patch: Partial<StageRow> = {}): StageRow => ({ status: "open", action: "create_content", score: 55, confidence: 50, source: "research", evidence: evidence(900, now), analyzedAt: now, planItemId: null, reservedUntil: null, ...patch });
  const stage = (patch: Partial<StageRow>) => stageOf(row(patch), { minScore: 40 }, now);
  assert.equal(stage({}), "qualified");
  assert.equal(stage({ score: 75 }), "prioritized");
  assert.equal(stage({ status: "approved" }), "prioritized");
  assert.equal(stage({ score: null, analyzedAt: null }), "discovered");
  assert.equal(stage({ score: 39 }), "discovered", "below the quality floor it does not count");
  assert.equal(stage({ confidence: 20 }), "needs_validation");
  assert.equal(stage({ evidence: evidence(900, new Date(now.getTime() - 121 * DAY)) }), "needs_validation", "old provider evidence");
  assert.equal(stage({ status: "deferred" }), "needs_validation");
  assert.equal(stage({ reservedUntil: new Date(now.getTime() + 1) }), "reserved");
  assert.equal(stage({ reservedUntil: new Date(now.getTime() - 1) }), "qualified", "an expired reservation frees it");
  assert.equal(stage({ status: "planned", planItemId: "x" }), "scheduled");
  const acted = (days: number, evaluations: unknown = null) => stage({ status: "completed", actions: [{ actedAt: new Date(now.getTime() - days * DAY), evaluations }] });
  assert.deepEqual([acted(5), acted(40), acted(95, { 28: { window: 28, outcome: "lower" }, 90: { window: 90, outcome: "higher" } }), acted(95, { 90: { window: 90, outcome: "lower" } })], ["published", "monitoring", "monitoring", "refresh_candidate"]);
  assert.deepEqual([stage({ status: "dismissed" }), stage({ status: "rejected" }), stage({ status: "expired" })], ["rejected", "rejected", "superseded"]);
  assert.equal(stage({ status: "rejected", explanation: { safeguards: [{ code: "already_planned" }] } }), "superseded");
  const level = (patch: Partial<StageRow>) => levelOf(row(patch));
  assert.deepEqual(
    [level({ score: null, evidence: {} }), level({ score: null }), level({}), level({ evidence: { ...evidence(), serp: { providerId: "x", at: "", domains: [], ownUrl: null, ownPosition: null } } }), level({ planItemId: "x" }), level({ actions: [{ actedAt: now, evaluations: { 28: { window: 28 } } }] })],
    [0, 1, 2, 3, 4, 5],
  );
});

test("the research policy has bounds, and an unreadable mode does not spend", () => {
  assert.deepEqual(readResearchPolicy(null), DEFAULT_RESEARCH_POLICY);
  assert.deepEqual([readResearchPolicy({ maxUsdPerRun: 99, minScore: 0, targetDays: 90 }).maxUsdPerRun, readResearchPolicy({ minScore: 0 }).minScore, readResearchPolicy({ targetDays: 90 }).targetDays], [0.25, 40, 90]);
  assert.equal(readResearchPolicy({ mode: "whatever" }).mode, "off");
  for (const bad of [null, [], { maxUsdPerRun: 5 }, { maxSeedBatches: 1.5 }, { other: 1 }, { mode: "always" }]) assert.throws(() => parseResearchPolicy(bad), /invalid_policy/);
});

test("corrections are validated and beat what was detected, which never overwrites them", () => using(async (ws) => {
  for (const bad of [null, [], { other: 1 }, { markets: ["es"] }, { languages: ["spanish"] }, { kinds: ["casino"] }, { topics: [""] }, { seasonalEvents: [{ name: "x", month: 2, day: 31, topics: [] }] }]) assert.throws(() => parseCorrections(bad), /invalid_corrections/);
  await prisma.siteIntelligenceProfile.create({ data: { tenantId: ws.tenantId, siteId: ws.siteId, detectedSiteType: "tienda online", mainTopics: ["moda"], detectedAudience: "compradores" } });
  const detected = await getResearchProfile(ws.tenantId, ws.siteId);
  assert.deepEqual([detected.businessModel, detected.topics, detected.revenueObjectives.source], [{ value: "ecommerce", source: "detected" }, { value: ["moda"], source: "detected" }, "unknown"]);
  await saveResearchProfile(ws.tenantId, ws.siteId, { corrections: { businessModel: "guía de televisión", topics: ["programación tv"], excludedTopics: ["moda"], markets: ["es-ES", "es-MX"] } }, null);
  await prisma.siteIntelligenceProfile.update({ where: { siteId: ws.siteId }, data: { mainTopics: ["zapatos"], detectedSiteType: "shop" } });
  const corrected = await getResearchProfile(ws.tenantId, ws.siteId, { rebuild: true });
  assert.deepEqual([corrected.businessModel, corrected.topics, corrected.markets.value], [{ value: "guía de televisión", source: "corrected" }, { value: ["programación tv"], source: "corrected" }, ["es-ES", "es-MX"]]);
  assert.deepEqual(corrected.derived.topics, ["zapatos"], "the detected layer keeps its own life");
  assert.ok(!researchTopics(corrected).includes("moda"));
  const context = await buildEditorialPlanningContext(ws.tenantId, ws.siteId);
  assert.ok(context.profile!.mainTopics.includes("programación tv") && context.profile!.strategyExclusions!.includes("moda"));
  assert.equal(applyCorrections(null, { topics: ["x"] }), null);
  // Removing a correction goes back to what was detected.
  assert.equal((await saveResearchProfile(ws.tenantId, ws.siteId, { corrections: { businessModel: null } }, null)).businessModel.source, "detected");
}));

test("metrics keep their provenance and history, and cross workspaces only under an explicit licence", () => using(async (a, b) => {
  const at = (days: number) => new Date(Date.now() - days * DAY);
  const market = { country: "ES", language: "es" };
  const rows = (volume: number | null): MetricRow[] => [{ keyword: "Guía TV", values: { volume, difficulty: 10, cpc: null, intent: null }, fields: { volume: { at: at(1).toISOString(), via: "keyword_metrics", kind: "provider_reported", asOf: null, upstream: null } } }];
  const record = (ws: Workspace, volume: number | null, when: Date, sharing: "permitted" | "unverified" | "prohibited" = "unverified", storage: "permitted" | "prohibited" | "unverified" = "permitted") =>
    recordKeywordMetrics({ tenantId: ws.tenantId, provider: { id: "dataforseo", licensing: { storage, crossTenantSharing: sharing } as never }, source: "dataforseo", market, rows: rows(volume), reservationId: null, fetchedAt: when, retentionDays: storage === "prohibited" ? 0 : 90 });
  await record(a, 100, at(40));
  await record(a, 100, at(20));
  await record(a, 150, at(1));
  const history = await keywordHistory(a.tenantId, market, "guía tv");
  assert.deepEqual(history.map((row) => row.volume), [150, 100], "the same value only confirms the row");
  assert.ok(history[1].confirmedAt > history[1].collectedAt);
  assert.deepEqual([history[0].quality, (history[0].fields as Record<string, { via: string }>).volume.via], [50, "keyword_metrics"]);
  const known = async (ws: Workspace, sharable: string[] = [], maxAgeDays = 60) => (await knownKeywordMetrics(ws.tenantId, market, ["guia tv", "Guía TV"], { maxAgeDays, sharable })).get("guía tv")?.volume ?? null;
  assert.deepEqual([await known(a), await known(b), await known(b, ["dataforseo"])], [150, null, null], "not shared, even if the platform allows it, without a licence");
  await record(a, 200, new Date(), "permitted");
  assert.deepEqual([await known(b), await known(b, ["dataforseo"])], [null, 200], "with a licence it still needs the platform's switch");
  assert.deepEqual(await keywordHistory(b.tenantId, market, "guía tv"), []);
  await record(b, 5, new Date(), "prohibited", "prohibited");
  assert.equal(await known(b), null, "what may not be stored is not");
  assert.deepEqual([sharableProviders(false), sharableProviders(true)], [[], []], "no provider's licence permits it today");
  assert.deepEqual(sharableProviders(true, [{ id: "x", licensing: { storage: "permitted", crossTenantSharing: "permitted" } }, { id: "y", licensing: { storage: "unverified", crossTenantSharing: "permitted" } }]), ["x"]);
}));

test("one opportunity is one article: concurrent plans never hold the same keyword or a variant", () => using(async (ws) => {
  const keywords = ["guia tv hoy", "peliculas esta noche", "series nuevas", "futbol en directo", "canales tdt"].map((keyword) => candidate(keyword));
  const holders = Array.from({ length: 5 }, () => randomUUID());
  const got = await Promise.all(holders.map((holder) => reserveForPlanning({ tenantId: ws.tenantId, siteId: ws.siteId, market: "es-ES", holder, candidates: keywords, limit: 3 })));
  const all = got.flat().map((entry) => entry.keyword);
  assert.equal(all.length, 5);
  assert.equal(new Set(all).size, 5);
  const other = randomUUID();
  assert.deepEqual(await reserveForPlanning({ tenantId: ws.tenantId, siteId: ws.siteId, market: "es-ES", holder: other, candidates: [candidate("guia tv")], limit: 3 }), [], "a variant of a held one");
  // The winner turns it into an article; nobody else can, and a lost reservation cannot either.
  const index = got.findIndex((list) => list.length > 0);
  const row = got[index][0];
  const p = await plan(ws);
  const claim = (holder: string, planItemId: string) => prisma.$transaction((tx) => claimReserved(tx, { tenantId: ws.tenantId, siteId: ws.siteId, holder, opportunityId: row.opportunityId, planItemId }));
  const article = await item(ws, p.id, row.keyword);
  assert.deepEqual([await claim(other, article.id), await claim(holders[index], article.id), await claim(holders[index], article.id)], [false, true, false]);
  await releaseReservations(ws.tenantId, ws.siteId, holders[index]);
  assert.deepEqual(await reserveForPlanning({ tenantId: ws.tenantId, siteId: ws.siteId, market: "es-ES", holder: other, candidates: [row], limit: 1 }), [], "already an article");
  // A person's choice wins over a reservation of a running plan.
  const held = got.flat().find((entry) => entry.keyword !== row.keyword)!;
  const chosen = await item(ws, p.id, held.keyword);
  await claimKeywords(ws.tenantId, ws.siteId, [{ keyword: held.keyword, planItemId: chosen.id }]);
  const stored = await prisma.contentOpportunity.findUniqueOrThrow({ where: { id: held.opportunityId } });
  assert.deepEqual([stored.status, stored.planItemId, stored.reservedBy], ["planned", chosen.id, null]);
}));

test("opportunities outlive plans: a deleted or canceled article gives its opportunity back, a rejected one drops it", () => using(async (ws, other) => {
  const ids = await storeResearchOpportunities(ws.tenantId, ws.siteId, "es-ES", ["uno tv", "dos series", "tres futbol"].map((keyword) => candidate(keyword)), null);
  const p = await plan(ws);
  const statuses = async () => Object.fromEntries((await prisma.contentOpportunity.findMany({ where: { siteId: ws.siteId } })).map((row) => [row.query, row.status]));
  for (const [keyword, id] of ids) {
    const article = await item(ws, p.id, keyword);
    await prisma.contentOpportunity.update({ where: { id }, data: { status: "planned", decidedAt: new Date(), planItemId: article.id } });
  }
  await reconcileReservoir(ws.tenantId, ws.siteId);
  assert.deepEqual(new Set(Object.values(await statuses())), new Set(["planned"]));
  await prisma.editorialPlanItem.deleteMany({ where: { planId: p.id, primaryKeyword: "uno tv" } });
  await prisma.editorialPlanItem.updateMany({ where: { planId: p.id, primaryKeyword: "dos series" }, data: { status: "canceled" } });
  await prisma.editorialPlanItem.updateMany({ where: { planId: p.id, primaryKeyword: "tres futbol" }, data: { status: "rejected" } });
  await reconcileReservoir(other.tenantId, ws.siteId);
  assert.deepEqual(new Set(Object.values(await statuses())), new Set(["planned"]), "another workspace cannot");
  await reconcileReservoir(ws.tenantId, ws.siteId);
  assert.deepEqual(await statuses(), { "uno tv": "open", "dos series": "open", "tres futbol": "dismissed" });
  // Found again later: neither duplicated nor brought back against the person's decision.
  await storeResearchOpportunities(ws.tenantId, ws.siteId, "es-ES", [candidate("tres futbol"), candidate("uno tv")], null);
  assert.deepEqual(await statuses(), { "uno tv": "open", "dos series": "open", "tres futbol": "dismissed" });
  // The existing way of planning one by hand still works with them.
  const planned = await addOpportunityToPlan(ws.tenantId, ws.siteId, ids.get("uno tv")!, {}, null);
  assert.equal(planned.created, true);
}));

test("coverage follows the publishing rhythm and never lowers the quality floor", () => using(async (ws) => {
  const policy = DEFAULT_RESEARCH_POLICY;
  const coverage = (topics: string[] = []) => reservoirCoverage(ws.tenantId, ws.siteId, policy, topics);
  const empty = await coverage();
  assert.deepEqual([empty.available, empty.days, empty.rhythm, empty.wanted, empty.needsReplenishment], [0, null, "unknown", 15, true]);
  const words = ["cine", "series", "futbol", "canales", "horarios", "estrenos", "concursos", "telediario", "dibujos", "documentales", "novelas", "toros"];
  const ids = await storeResearchOpportunities(ws.tenantId, ws.siteId, "es-ES", words.map((word) => candidate(word)), null);
  await prisma.contentOpportunity.updateMany({ where: { siteId: ws.siteId }, data: { score: 60, confidence: 50, priority: 30, analyzedAt: new Date() } });
  await prisma.contentOpportunity.updateMany({ where: { id: { in: [ids.get("toros")!, ids.get("novelas")!] } }, data: { score: 20 } });
  await prisma.contentOpportunity.update({ where: { id: ids.get("dibujos")! }, data: { market: "en-US" } });
  await prisma.sitePlanningSettings.create({ data: { tenantId: ws.tenantId, siteId: ws.siteId, articlesPerDay: 1, weekdays: [1, 3], publishTimes: [], channels: ["website"] } });
  const full = await coverage(["series", "cocina"]);
  assert.deepEqual([full.available, full.articlesPerWeek, full.days, full.wanted, full.needsReplenishment, full.sufficient], [9, 2, 31, 22, false, false]);
  assert.deepEqual([full.gaps, full.stages.qualified, full.stages.discovered, full.freshness.newest], [["cocina"], 10, 2, 0]);
  assert.deepEqual(full.markets.find((entry) => entry.market === "en-US"), { market: "en-US", available: 1 });
}));

test("research is triggered by reasons, not by the calendar, and each reason only once", () => using(async (ws) => {
  const triggers = async (now = new Date()) => {
    const profile = await getResearchProfile(ws.tenantId, ws.siteId, { now });
    return (await evaluateTriggers(ws.tenantId, ws.siteId, profile, await reservoirCoverage(ws.tenantId, ws.siteId, profile.policy, researchTopics(profile), now), now)).map((entry) => entry.trigger);
  };
  assert.deepEqual(await triggers(), ["insufficient_opportunities"]);
  const request = (patch: object = {}) => requestResearch({ tenantId: ws.tenantId, siteId: ws.siteId, trigger: "insufficient_opportunities", triggerKey: null, detail: "x", focus: {}, ...patch });
  const first = await Promise.all([request(), request(), request()]);
  assert.deepEqual([new Set(first.map((entry) => entry.runId)).size, first.filter((entry) => entry.created).length], [1, 1], "one open run per site");
  const finish = (runId: string, at = new Date()) => prisma.seoResearchRun.update({ where: { id: runId }, data: { status: "succeeded", activeKey: null, finishedAt: at } });
  await finish(first[0].runId);
  assert.deepEqual(await triggers(), [], "nothing was found lately: not again right away");
  assert.deepEqual(await triggers(new Date(Date.now() + 10 * DAY)), [], "a new month is not a reason");
  assert.deepEqual(await triggers(new Date(Date.now() + 15 * DAY)), ["insufficient_opportunities"]);

  // A verified competitor, a topic and a market people set, and a season.
  const competitor = await prisma.competitor.create({ data: { tenantId: ws.tenantId, siteId: ws.siteId, domain: "rival.test", origin: "manual", name: "Rival", status: "accepted", verification: "verified" } });
  const soon = new Date(Date.now() + 40 * DAY);
  await saveResearchProfile(ws.tenantId, ws.siteId, { corrections: { topics: ["programación tv"], markets: ["es-ES", "es-MX"], seasonalEvents: [{ name: "Mundial", month: soon.getUTCMonth() + 1, day: Math.min(28, soon.getUTCDate()), topics: ["mundial futbol"] }] } }, null);
  const found = await triggers();
  assert.deepEqual(found, ["new_market", "new_topic", "competitor_opportunity", "seasonal_event"]);
  const keyed = await request({ trigger: "competitor_opportunity", triggerKey: `competitor:${competitor.id}` });
  await finish(keyed.runId);
  assert.deepEqual(await request({ trigger: "competitor_opportunity", triggerKey: `competitor:${competitor.id}` }), { runId: keyed.runId, created: false });
  assert.ok(!(await triggers()).includes("competitor_opportunity"));
  await prisma.seoResearchTask.createMany({ data: [{ tenantId: ws.tenantId, siteId: ws.siteId, runId: keyed.runId, position: 100, kind: "discover_seed", subject: "programación tv", market: "es-ES", status: "succeeded" }, { tenantId: ws.tenantId, siteId: ws.siteId, runId: keyed.runId, position: 101, kind: "discover_seed", subject: "tv", market: "es-MX", status: "succeeded" }] });
  assert.deepEqual(await triggers(), ["seasonal_event"]);
  assert.equal(nextOccurrence(1, 1, new Date("2026-11-25T00:00:00Z")).toISOString().slice(0, 10), "2027-01-01");

  // Modes.
  await saveResearchProfile(ws.tenantId, ws.siteId, { policy: { mode: "manual" } }, null);
  await assert.rejects(request(), /research_manual_only/);
  await saveResearchProfile(ws.tenantId, ws.siteId, { policy: { mode: "off" } }, null);
  await assert.rejects(request({ trigger: "manual" }), /research_disabled/);
}));

test("an important change of the site's own traffic is a reason, once", () => using(async (ws) => {
  const through = new Date(new Date(Date.now() - 2 * DAY).toISOString().slice(0, 10));
  const day = (back: number) => new Date(through.getTime() - back * DAY);
  await prisma.searchConsoleConnection.create({ data: { tenantId: ws.tenantId, siteId: ws.siteId, status: "active", property: "sc-domain:example.test", syncedThrough: through, syncedFrom: day(60) } });
  await prisma.searchPerformance.createMany({ data: Array.from({ length: 56 }, (_, index) => ({ tenantId: ws.tenantId, siteId: ws.siteId, dataset: "site", date: day(index), clicks: 1, impressions: index < 28 ? 100 : 20, positionSum: 500 })) });
  const profile = await getResearchProfile(ws.tenantId, ws.siteId);
  const coverage = await reservoirCoverage(ws.tenantId, ws.siteId, profile.policy, []);
  const change = (await evaluateTriggers(ws.tenantId, ws.siteId, profile, coverage)).find((entry) => entry.trigger === "performance_change")!;
  assert.match(change.detail, /×5/);
  await requestResearch({ tenantId: ws.tenantId, siteId: ws.siteId, ...change });
  assert.ok(!(await evaluateTriggers(ws.tenantId, ws.siteId, profile, coverage)).some((entry) => entry.trigger === "performance_change"));

  // Disconnecting with deletion leaves none of those figures behind.
  assert.equal(profile.derived.firstParty.impressions28d, 2800);
  await disconnectSearchConsole(ws.tenantId, ws.siteId, null, { deleteData: true });
  assert.equal((await prisma.siteResearchProfile.findUniqueOrThrow({ where: { siteId: ws.siteId } })).derived, null);
  assert.deepEqual((await prisma.seoResearchRun.findFirstOrThrow({ where: { siteId: ws.siteId } })).reason, {});
  assert.equal((await getResearchProfile(ws.tenantId, ws.siteId)).derived.firstParty.impressions28d, null);
}));

test("site keywords keep every source, never lose a level, and no workspace reads another's", () => using(async (a, b) => {
  const at = new Date();
  const discovery = (kind: string, value: string, position: number | null = null) => ({ kind, value, competitorId: null, position, url: null, providerId: "dataforseo", runId: null, discoveredAt: at, retainUntil: new Date(at.getTime() + 90 * DAY) });
  const row = { keyword: "guía tv", key: "guia tv", status: "candidate" as const, reason: null, level: 2 as const, score: 60, cluster: null, opportunityId: null };
  assert.deepEqual(await storeSiteKeywords(a.tenantId, a.siteId, "es-ES", [{ ...row, discoveries: [discovery("cluster", "tv"), discovery("competitor", "rival.test", 4)] }]), { created: 1, total: 1 });
  assert.deepEqual(await storeSiteKeywords(a.tenantId, a.siteId, "es-ES", [{ ...row, level: 1, score: 50, discoveries: [discovery("competitor", "rival.test", 2)] }]), { created: 0, total: 1 });
  const [stored] = await listSiteKeywords(a.tenantId, a.siteId);
  assert.deepEqual([stored.level, stored.score, stored.discoveries.length, stored.discoveries.find((entry) => entry.kind === "competitor")!.position], [2, 50, 2, 2]);
  assert.deepEqual(await listSiteKeywords(b.tenantId, a.siteId), []);

  const { runId } = await requestResearch({ tenantId: a.tenantId, siteId: a.siteId, trigger: "manual", triggerKey: null, detail: "x", focus: {} });
  await assert.rejects(requestResearch({ tenantId: b.tenantId, siteId: a.siteId, trigger: "manual", triggerKey: null, detail: "x", focus: {} }), /site_not_found/);
  for (const attempt of [() => getResearchRun(b.tenantId, b.siteId, runId), () => getResearchRun(b.tenantId, a.siteId, runId), () => controlResearchRun(b.tenantId, b.siteId, runId, "cancel", null)]) await assert.rejects(attempt(), /research_run_not_found/);
  for (const attempt of [() => getResearchOverview(b.tenantId, a.siteId), () => getResearchProfile(b.tenantId, a.siteId), () => saveResearchProfile(b.tenantId, a.siteId, { corrections: { topics: ["x"] } }, null)]) await assert.rejects(attempt(), /site_not_found/);
  assert.deepEqual(await listResearchRuns(b.tenantId, a.siteId), []);
  const held = await reserveForPlanning({ tenantId: b.tenantId, siteId: a.siteId, market: "es-ES", holder: randomUUID(), candidates: [{ ...candidate("guia tv"), opportunityId: (await storeResearchOpportunities(a.tenantId, a.siteId, "es-ES", [candidate("guia tv")], null)).get("guia tv")! }], limit: 1 });
  assert.deepEqual(held, [], "nor reserves them");
}));

test("research API: permissions, validation, control and audit", () => using(async (ws, other) => {
  const email = `${randomUUID().slice(0, 8)}@example.test`;
  const account = await prisma.studioAccount.create({ data: { email, displayName: "SEO", status: "active" } });
  const user = await prisma.studioUser.create({ data: { tenantId: ws.tenantId, accountId: account.id, email, displayName: "SEO", status: "active" } });
  const app = Fastify();
  registerStudioRoutes(app);
  const call = async (method: "GET" | "PUT" | "POST", path: string, permissions: string[], payload?: object, siteId = ws.siteId) => {
    const url = `/v2/sites/${siteId}/seo-research${path}`;
    const ids = { tenantId: ws.tenantId, userId: user.id, sessionId: randomUUID() };
    const timestamp = String(Date.now());
    const signature = buildStudioProxySignature({ ...ids, permissions, timestamp, method, url });
    const response = await app.inject({
      method, url, payload: method === "GET" ? undefined : payload ?? {},
      headers: { [STUDIO_TENANT_HEADER]: ids.tenantId, [STUDIO_USER_HEADER]: ids.userId, [STUDIO_SESSION_HEADER]: ids.sessionId, [STUDIO_PERMISSIONS_HEADER]: permissions.join(","), [STUDIO_TIMESTAMP_HEADER]: timestamp, [STUDIO_SIGNATURE_HEADER]: signature },
    });
    return { status: response.statusCode, body: response.json() as any };
  };
  const reader = ["analytics.read"];
  const editor = ["analytics.read", "projects.manage"];
  try {
    const overview = await call("GET", "", reader);
    assert.equal(overview.status, 200, JSON.stringify(overview.body));
    assert.ok(overview.body.coverage && overview.body.profile && Array.isArray(overview.body.triggers));
    assert.equal((await call("GET", "", [])).status, 403);
    assert.deepEqual([(await call("POST", "/runs", reader, {})).status, (await call("PUT", "/policy", editor, { policy: { mode: "off" } })).status, (await call("PUT", "/profile", reader, { corrections: {} })).status], [403, 403, 403]);
    assert.equal((await call("GET", "", reader, undefined, other.siteId)).status, 404, "another workspace's site");
    assert.deepEqual([(await call("POST", "/runs", editor, { focus: { topics: [1] } })).status, (await call("POST", "/runs", editor, { maxUsd: -1 })).status, (await call("PUT", "/profile", editor, { corrections: { x: 1 } })).status, (await call("PUT", "/policy", ["workspace.manage"], {})).status], [400, 400, 400, 400]);
    const started = await call("POST", "/runs", editor, { focus: { topics: ["series"] }, maxUsd: 0.05 });
    assert.deepEqual([started.status, started.body.created, started.body.run.status, started.body.run.maxUsd, started.body.run.progress], [200, true, "queued", 0.05, 0]);
    const run = `/runs/${started.body.run.id}`;
    assert.equal((await call("POST", "/runs", editor, {})).body.created, false);
    assert.deepEqual([(await call("POST", `${run}/pause`, reader)).status, (await call("POST", `${run}/pause`, editor)).body.status, (await call("POST", `${run}/resume`, editor)).body.status, (await call("POST", `${run}/resume`, editor)).status], [403, "paused", "queued", 409]);
    const cancelled = await call("POST", `${run}/cancel`, editor);
    assert.deepEqual([cancelled.body.status, new Set(cancelled.body.tasks.map((task: { status: string }) => task.status))], ["cancelled", new Set(["cancelled"])]);
    assert.equal((await call("POST", `${run}/pause`, editor)).status, 409);
    assert.equal((await call("POST", `${run}/retry`, editor)).body.status, "queued");
    const actions = (await prisma.auditLog.findMany({ where: { tenantId: ws.tenantId }, orderBy: { createdAt: "asc" } })).map((entry) => entry.action);
    assert.deepEqual(actions.filter((action) => action.startsWith("seo_research.")), ["seo_research.requested", "seo_research.pause", "seo_research.resume", "seo_research.cancel", "seo_research.retry"]);
  } finally {
    await app.close();
    await prisma.studioUser.deleteMany({ where: { id: user.id } });
    await prisma.studioAccount.deleteMany({ where: { id: account.id } });
  }
}));
