// Autopilot's rolling month: free slots, guards, stored reasons and keyword changes. No network, no LLM.
import test from "node:test";
import assert from "node:assert/strict";
import { getPrismaClient } from "../src/infrastructure/db/prisma";
import type { KeywordMetrics } from "../src/infrastructure/seo/dataforseo";
import { sha256 } from "../src/shared/utils/hash";
import { ensureMonthlyPlan, getMonthPlan, monthSlots } from "../src/studio/autopilot-plan";
import { mergePlanBatches, type enqueuePlanSlots } from "../src/studio/editorial-plan";
import { collectKeywordCandidates, emptyKeywordResearch, rankKeywordCandidates, type KeywordReject } from "../src/studio/keyword-candidates";
import { changePlanItemKeyword, getPlanItemSelection } from "../src/studio/plan-item-keyword";

// The keyword change re-measures when a provider is configured: never in tests.
delete process.env.DATAFORSEO_LOGIN;
delete process.env.DATAFORSEO_PASSWORD;

const prisma = getPrismaClient();
test.after(async () => {
  await prisma.$disconnect();
});

const settings = { timezone: "Europe/Madrid", articlesPerDay: 1, weekdays: [0, 1, 2, 3, 4, 5, 6], publishTimes: ["09:00"] };
const policy = { articlesPerDay: 2, maxArticlesPerDay: 3, activeDaysOfWeek: null, publishingWindows: [], timezone: "Europe/Madrid" };
const NOW = new Date("2026-03-20T05:00:00Z");

test("30 days ahead: one free slot per day, local hour kept across the DST change", () => {
  const month = monthSlots(policy, settings, [], NOW);
  assert.equal(month.missing.length, 30);
  assert.equal(month.missing.find((slot) => slot.localDate === "2026-03-28")!.scheduledFor.toISOString(), "2026-03-28T08:00:00.000Z");
  assert.equal(month.missing.find((slot) => slot.localDate === "2026-03-30")!.scheduledFor.toISOString(), "2026-03-30T07:00:00.000Z");
});

test("covered days, moved items and passed slots are not planned again", () => {
  const month = monthSlots(policy, settings, [new Date("2026-03-21T08:00:00Z"), new Date("2026-03-22T17:00:00Z")], NOW);
  assert.deepEqual(month.missing.slice(0, 2).map((slot) => slot.localDate), ["2026-03-20", "2026-03-23"]);
  // Two per day, the morning one already written: the evening slot of today is still free.
  const twice = monthSlots(policy, { ...settings, articlesPerDay: 2, publishTimes: ["09:00", "18:00"] }, [new Date("2026-03-20T08:00:00Z")], new Date("2026-03-20T11:00:00Z"));
  assert.deepEqual([twice.missing[0].localDate, twice.missing[0].localTime], ["2026-03-20", "18:00"]);
});

test("the policy caps the cadence: volume, active days and website windows", () => {
  assert.equal(monthSlots({ ...policy, articlesPerDay: 0 }, settings, [], NOW).missing.length, 0);
  assert.equal(monthSlots({ ...policy, articlesPerDay: 1 }, { ...settings, articlesPerDay: 4 }, [], NOW).missing.length, 30);
  const weekdaysOnly = monthSlots({ ...policy, activeDaysOfWeek: [1, 2, 3, 4, 5] }, settings, [], NOW);
  assert.ok(weekdaysOnly.missing.every((slot) => ![0, 6].includes(new Date(slot.localDate).getUTCDay())));
  const windowed = monthSlots({ ...policy, publishingWindows: [{ channel: "website", days: [0, 1, 2, 3, 4, 5, 6], from: "10:00", to: "12:00" }] }, settings, [], NOW);
  assert.deepEqual([windowed.missing.length, windowed.outsideWindows], [0, 30]);
});

const metric = (keyword: string, volume: number | null, difficulty: number | null): KeywordMetrics => ({ keyword, volume, difficulty, cpc: null, intent: "informational", source: "dataforseo" });
const rankContext = { profile: null, site: { id: "s", name: "Guía TV", type: "guiatv", baseUrl: "https://example.test", locale: "es-ES" }, searchTargets: [], existingPlanQueries: ["programacion la 1"], existingPlanTitles: [], indexedUrlInventory: [] };

test("every candidate keeps its score factors and origin; every drop keeps its reason", () => {
  const rejects: KeywordReject[] = [];
  const [best] = rankKeywordCandidates(
    [
      { ...metric("programacion la 2", 40_500, 5), origin: { kind: "competitor", value: "rival.test" } },
      metric("programacion la 1", 135_000, 18),
      metric("qué echan ahora", null, null),
      metric("receta de paella valenciana", 90_000, 10),
    ],
    rankContext,
    10,
    undefined,
    rejects,
  );
  assert.deepEqual(best.origin, { kind: "competitor", value: "rival.test" });
  const { demand, winnability, relevance, intentFit } = best.parts!;
  assert.equal(Math.round(100 * demand * winnability * relevance * intentFit), best.score);
  const reasons = Object.fromEntries(rejects.map((entry) => [entry.keyword, entry.reason]));
  assert.equal(reasons["programacion la 1"], "cannibalization");
  assert.equal(reasons["qué echan ahora"], "no_volume");
  assert.ok(["off_topic", "low_relevance"].includes(reasons["receta de paella valenciana"]));
});

test("without a keyword provider the research says so", async () => {
  const research = emptyKeywordResearch();
  assert.deepEqual(await collectKeywordCandidates("t", "s", {} as never, 10, undefined, research), []);
  assert.deepEqual([research.provider, research.skipped], [null, "not_configured"]);
});

test("two parallel batches cannot plan the same keyword under different queries", () => {
  const brief = (workingTitle: string, targetQuery: string) => ({ workingTitle, targetQuery, primaryKeyword: "boardwalk empire dónde ver" }) as never;
  const merged = mergePlanBatches(
    { kept: [brief("Boardwalk Empire completa", "dónde ver boardwalk empire")], dropped: [], warnings: [] },
    { kept: [brief("Mafia y gánsteres en pantalla", "series como boardwalk empire")], dropped: [], warnings: [] },
    5,
  );
  assert.equal(merged.kept.length, 1);
  assert.match(merged.dropped[0].reason, /duplicate target query/);
});

async function workspace(mode: "autopilot" | "assisted" | "manual" = "autopilot") {
  const seed = `mp-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const tenant = await prisma.tenant.create({ data: { name: seed, apiKeyHash: sha256(`${seed}-key`), status: "active" } });
  const site = await prisma.site.create({ data: { tenantId: tenant.id, key: seed, name: seed, type: "guiatv", locale: "es-ES", timezone: "Europe/Madrid", baseUrl: "https://example.test" } });
  await prisma.siteIndexedPage.create({ data: { tenantId: tenant.id, siteId: site.id, url: "https://example.test/guia", canonicalUrl: "https://example.test/guia", title: "Guía TV", crawlState: "extracted" } });
  const row = await prisma.automationPolicy.create({ data: { tenantId: tenant.id, siteId: site.id, enabled: true, state: "active", mode, articlesPerDay: 1, publishingWindows: [] } });
  const cleanup = async () => {
    await prisma.operation.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.auditLog.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.editorialPlan.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.searchTarget.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.siteIndexedPage.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.automationPolicy.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.site.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.tenant.delete({ where: { id: tenant.id } });
  };
  return { tenantId: tenant.id, siteId: site.id, policy: row, cleanup };
}

type EnqueueInput = Parameters<typeof enqueuePlanSlots>[0];
const recorder = () => {
  const calls: EnqueueInput[] = [];
  const enqueue = (async (input: EnqueueInput) => {
    calls.push(input);
    return { planId: "p", operationId: "o", expectedCount: input.slots.length };
  }) as typeof enqueuePlanSlots;
  return { calls, enqueue };
};

test("one run per month, none while another runs, and bounded retries", async () => {
  const ws = await workspace();
  try {
    const { calls, enqueue } = recorder();
    const now = new Date("2026-03-20T05:00:00Z");
    assert.equal((await ensureMonthlyPlan(ws.policy, { now, enqueue })).reason, "started");
    assert.equal(calls[0].monthKey, "2026-03");
    assert.ok(calls[0].slots.every((slot) => slot.localDate.startsWith("2026-03")));
    assert.equal(calls[0].trigger, "autopilot");

    const plan = await prisma.editorialPlan.create({ data: { tenantId: ws.tenantId, siteId: ws.siteId, name: "p", status: "generating", dateFrom: now, dateTo: now } });
    const real = new Date();
    assert.equal((await ensureMonthlyPlan(ws.policy, { now: real, enqueue })).reason, "busy");
    // A run whose process died is released after the grace period.
    assert.equal((await ensureMonthlyPlan(ws.policy, { now: new Date(real.getTime() + 31 * 60_000), enqueue })).reason, "started");
    assert.equal((await prisma.editorialPlan.findUniqueOrThrow({ where: { id: plan.id } })).status, "failed");

    const fail = () => prisma.operation.create({ data: { tenantId: ws.tenantId, siteId: ws.siteId, type: "editorial_plan_generation", status: "failed", metadata: { trigger: "autopilot" } } });
    await fail();
    assert.equal((await ensureMonthlyPlan(ws.policy, { now: new Date(), enqueue })).reason, "retry_later");
    assert.equal((await ensureMonthlyPlan(ws.policy, { now: new Date(), enqueue, manual: true })).reason, "started");
    assert.equal((await ensureMonthlyPlan(ws.policy, { now: new Date(Date.now() + 61 * 60_000), enqueue })).reason, "started");
    await fail();
    await fail();
    assert.equal((await ensureMonthlyPlan(ws.policy, { now: new Date(Date.now() + 5 * 3_600_000), enqueue })).reason, "retry_later");
  } finally {
    await ws.cleanup();
  }
});

test("only Autopilot plans by itself, and never while paused", async () => {
  const spaces = [await workspace("assisted"), await workspace("manual"), await workspace("autopilot")];
  try {
    await prisma.automationPolicy.update({ where: { id: spaces[2].policy.id }, data: { state: "paused" } });
    // Not runAutomationTick: it would plan for every other Autopilot site in this database.
    const { calls, enqueue } = recorder();
    for (const ws of spaces) {
      const current = await prisma.automationPolicy.findUniqueOrThrow({ where: { id: ws.policy.id } });
      assert.equal((await ensureMonthlyPlan(current, { enqueue })).reason, "not_autopilot");
    }
    assert.equal(calls.length, 0);
    // A person can still ask for the month in any mode.
    assert.equal((await ensureMonthlyPlan(spaces[0].policy, { enqueue, manual: true })).reason, "started");
  } finally {
    for (const ws of spaces) await ws.cleanup();
  }
});

test("without site intelligence nothing is started", async () => {
  const ws = await workspace();
  try {
    await prisma.siteIndexedPage.deleteMany({ where: { tenantId: ws.tenantId } });
    const { calls, enqueue } = recorder();
    assert.equal((await ensureMonthlyPlan(ws.policy, { enqueue })).reason, "no_intelligence");
    assert.equal(calls.length, 0);
  } finally {
    await ws.cleanup();
  }
});

test("a keyword change drops the old brief, keeps the history and is refused once writing started", async () => {
  const ws = await workspace();
  try {
    const research = { ...emptyKeywordResearch(), provider: "dataforseo" as const, candidates: [
      { keyword: "programacion la 2", volume: 40_500, difficulty: 5, intent: "informational", score: 70, variants: ["programacion la 2 hoy"], origin: { kind: "competitor" as const, value: "rival.test" }, parts: null, rank: 1 },
      { keyword: "series de television", volume: 9_900, difficulty: 20, intent: "informational", score: 55, variants: [], origin: null, parts: null, rank: 2 },
    ] };
    const tomorrow = new Date(Date.now() + 26 * 3_600_000);
    const plan = await prisma.editorialPlan.create({ data: { tenantId: ws.tenantId, siteId: ws.siteId, name: "Plan automático", status: "ready", dateFrom: new Date(), dateTo: tomorrow, generatedOutput: { keywordResearch: [research] } as never } });
    const item = await prisma.editorialPlanItem.create({ data: {
      tenantId: ws.tenantId, siteId: ws.siteId, planId: plan.id, channel: "website", status: "proposed", scheduledFor: tomorrow, title: "Guía de La 2", primaryKeyword: "programacion la 2", targetQuery: "programacion la 2",
      outline: [{ heading: "La 2" }], suggestedSlug: "guia-la-2", seoTitle: "La 2", searchVolume: 40_500, rationale: "motivo", notes: "nota del editor",
      metadata: { selection: { source: "dataforseo", researchId: research.id, score: 70, rank: 1, intent: null, parts: null, origin: { kind: "competitor", value: "rival.test" } }, generation: { tone: "cercano" } } as never,
    } });
    const before = (await getPlanItemSelection(ws.tenantId, item.id))!;
    assert.equal(before.lockedReason, null);
    assert.equal(before.research?.id, research.id);
    assert.deepEqual(before.alternatives.map((entry) => entry.keyword), ["series de television"]);

    await assert.rejects(changePlanItemKeyword(ws.tenantId, item.id, "Programacion La 2"), /keyword_unchanged/);
    const changed = await changePlanItemKeyword(ws.tenantId, item.id, "series de television");
    assert.equal(changed.primaryKeyword, "series de television");
    assert.equal(changed.scheduledFor!.getTime(), tomorrow.getTime());
    assert.deepEqual([changed.outline, changed.suggestedSlug, changed.seoTitle, changed.searchVolume], [null, null, null, null]);
    assert.deepEqual([changed.notes, changed.opportunityScore], ["nota del editor", 55]);
    const after = (await getPlanItemSelection(ws.tenantId, item.id))!;
    assert.deepEqual([after.selection?.source, after.history[0].from, after.history[0].to], ["user", "programacion la 2", "series de television"]);
    assert.deepEqual((changed.metadata as { generation?: unknown }).generation, { tone: "cercano" });
    assert.equal((await getMonthPlan(ws.tenantId, ws.siteId)).items[0].source, "user");

    await prisma.editorialPlanItem.create({ data: { tenantId: ws.tenantId, siteId: ws.siteId, planId: plan.id, channel: "website", status: "proposed", scheduledFor: tomorrow, title: "Audiencias TV", primaryKeyword: "audiencias tv", targetQuery: "audiencias tv" } });
    await assert.rejects(changePlanItemKeyword(ws.tenantId, item.id, "audiencias tv"), /keyword_already_planned/);
    await prisma.editorialPlanItem.update({ where: { id: item.id }, data: { status: "generating" } });
    await assert.rejects(changePlanItemKeyword(ws.tenantId, item.id, "cine en television"), /keyword_locked/);
    assert.equal(await getPlanItemSelection("00000000-0000-4000-8000-000000000000", item.id), null);
  } finally {
    await ws.cleanup();
  }
});
