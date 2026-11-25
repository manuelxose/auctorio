import { randomUUID } from "node:crypto";
import test from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import { getPrismaClient } from "../src/infrastructure/db/prisma";
import { SEARCH_CONSOLE_SCOPE } from "../src/infrastructure/google/search-console";
import { encryptSecret, sha256Hex } from "../src/shared/utils/crypto";
import { sha256 } from "../src/shared/utils/hash";
import { addOpportunityToPlan } from "../src/studio/competitors";
import { collectKeywordCandidates, emptyKeywordResearch } from "../src/studio/keyword-candidates";
import { READ_TOOLS } from "../src/studio/copilot/tools";
import { buildEditorialPlanningContext } from "../src/studio/editorial-plan-context";
import { registerStudioRoutes } from "../src/studio/routes";
import { completeSearchConsoleConnection, disconnectSearchConsole, getSearchConsoleStatus, selectSearchConsoleProperty, startSearchConsoleConnection, syncSearchConsole } from "../src/studio/search-console";
import { analyzeSite, completeSeoOpportunity, decideSeoOpportunity, listSeoOpportunities, saveSeoProfile } from "../src/studio/seo-intelligence";
import { evaluateActions, outcomeSummary, type Evaluation } from "../src/studio/seo-intelligence/attribution";

const prisma = getPrismaClient();
const saved = { id: process.env.GOOGLE_CLIENT_ID, secret: process.env.GOOGLE_CLIENT_SECRET, key: process.env.SOCIAL_TOKEN_ENCRYPTION_KEY };
test.before(() => {
  process.env.GOOGLE_CLIENT_ID = "test-client";
  process.env.GOOGLE_CLIENT_SECRET = "test-secret";
  process.env.SOCIAL_TOKEN_ENCRYPTION_KEY ||= "test-key";
});
test.after(async () => {
  for (const [name, value] of [["GOOGLE_CLIENT_ID", saved.id], ["GOOGLE_CLIENT_SECRET", saved.secret], ["SOCIAL_TOKEN_ENCRYPTION_KEY", saved.key]] as const) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  await prisma.$disconnect();
});

const DAY = 86_400_000;
const iso = (offset: number) => new Date(Date.UTC(2026, 10, 18) + offset * DAY).toISOString().slice(0, 10);
const NOW = new Date("2026-11-21T12:00:00Z");
const PROPERTY = "sc-domain:example.test";

async function workspace() {
  const seed = `gsc-${randomUUID().slice(0, 8)}`;
  const tenant = await prisma.tenant.create({ data: { name: seed, apiKeyHash: sha256(seed), status: "active" } });
  const email = `${seed}@example.test`;
  const account = await prisma.studioAccount.create({ data: { email } });
  const user = await prisma.studioUser.create({ data: { tenantId: tenant.id, accountId: account.id, email, displayName: seed, status: "active" } });
  const site = await prisma.site.create({ data: { tenantId: tenant.id, key: seed, name: "Viajes", type: "generic_rest", locale: "es-ES", baseUrl: "https://example.test" } });
  return {
    seed, tenantId: tenant.id, siteId: site.id, userId: user.id,
    connect: (over: Record<string, unknown> = {}) => prisma.searchConsoleConnection.create({ data: { tenantId: tenant.id, siteId: site.id, status: "active", property: PROPERTY, refreshTokenCiphertext: encryptSecret("refresh-1"), connectedByUserId: user.id, ...over } as never }),
    async remove() {
      const where = { tenantId: tenant.id };
      await prisma.socialConnectionSession.deleteMany({ where });
      await prisma.editorialPlanItem.deleteMany({ where });
      await prisma.editorialPlan.deleteMany({ where });
      await prisma.site.deleteMany({ where });
      await prisma.auditLog.deleteMany({ where });
      await prisma.studioUser.deleteMany({ where });
      await prisma.studioAccount.delete({ where: { id: account.id } });
      await prisma.tenant.delete({ where: { id: tenant.id } });
    },
  };
}

type Call = { url: string; body: Record<string, unknown> };
/** A Google that answers by endpoint; `rows` serves Search Analytics. */
function google(calls: Call[], over: { rows?: (body: Record<string, unknown>) => unknown[]; token?: () => Response; query?: () => Response | null; sites?: string[] } = {}): typeof fetch {
  return (async (input: string, init?: RequestInit) => {
    const url = String(input);
    const raw = String(init?.body ?? "");
    const body = raw.startsWith("{") ? (JSON.parse(raw) as Record<string, unknown>) : Object.fromEntries(new URLSearchParams(raw));
    calls.push({ url, body });
    const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
    if (url.endsWith("/token")) return over.token?.() ?? json({ access_token: "access", refresh_token: "refresh-new", scope: `openid ${SEARCH_CONSOLE_SCOPE}` });
    if (url.endsWith("/revoke")) return json({});
    if (url.endsWith("/sites")) return json({ siteEntry: (over.sites ?? [PROPERTY, "sc-domain:other.test"]).map((siteUrl) => ({ siteUrl, permissionLevel: "siteOwner" })).concat({ siteUrl: "https://example.test/", permissionLevel: "siteUnverifiedUser" }) });
    if (url.includes("urlInspection")) return json({ inspectionResult: { indexStatusResult: { verdict: "PASS", coverageState: "ok", robotsTxtState: "ALLOWED", indexingState: "INDEXING_ALLOWED", pageFetchState: "SUCCESSFUL" } } });
    return over.query?.() ?? json({ rows: over.rows?.(body) ?? [] });
  }) as typeof fetch;
}
const daysWithData = (count: number) => Array.from({ length: count }, (_, index) => iso(-index));
const dailyRows = (days: string[]) => (body: Record<string, unknown>) => {
  const dimensions = body.dimensions as string[];
  const within = days.filter((date) => date >= String(body.startDate) && date <= String(body.endDate));
  if (dimensions[0] === "date") return within.map((date) => ({ keys: [date], clicks: 1, impressions: 10, position: 5 }));
  if (!within.length) return [];
  if (dimensions[0] === "page") return [{ keys: ["https://example.test/a"], clicks: 1, impressions: 10, position: 5 }];
  if (dimensions[0] === "query") return [{ keys: ["trenes toledo", "https://example.test/a", "esp", "MOBILE"], clicks: 1, impressions: 8, position: 5 }];
  return [{ keys: ["esp", "MOBILE"], clicks: 1, impressions: 10, position: 5 }];
};

test("authorization: read-only scope, bound to the person who started it, single use, own domain only, token encrypted", async () => {
  const ws = await workspace();
  try {
    const { url } = await startSearchConsoleConnection(ws.tenantId, ws.siteId, ws.userId);
    const params = new URL(url).searchParams;
    assert.deepEqual([params.get("scope"), params.get("access_type"), params.get("code_challenge_method")], [SEARCH_CONSOLE_SCOPE, "offline", "S256"]);
    const state = params.get("state")!;
    assert.equal(await prisma.socialConnectionSession.count({ where: { stateHash: sha256Hex(state) } }), 1);
    const calls: Call[] = [];
    await assert.rejects(completeSearchConsoleConnection(ws.tenantId, randomUUID(), { state, code: "c" }, google(calls)), /unknown_state/);
    assert.equal(calls.length, 0);
    const done = await completeSearchConsoleConnection(ws.tenantId, ws.userId, { state, code: "c" }, google(calls));
    assert.deepEqual(done.properties.map((entry) => entry.property), [PROPERTY], "other domains and unverified properties are not offered");
    await assert.rejects(completeSearchConsoleConnection(ws.tenantId, ws.userId, { state, code: "c" }, google(calls)), /expired/);
    const row = await prisma.searchConsoleConnection.findFirstOrThrow({ where: { siteId: ws.siteId } });
    assert.deepEqual([row.status, row.property], ["active", PROPERTY]);
    assert.ok(row.refreshTokenCiphertext && !row.refreshTokenCiphertext.includes("refresh-new"));
    assert.doesNotMatch(JSON.stringify(await getSearchConsoleStatus(ws.tenantId, ws.siteId)), /refresh|ciphertext|v1:/);
    await assert.rejects(selectSearchConsoleProperty(ws.tenantId, ws.siteId, "sc-domain:other.test", ws.userId, google(calls)), /not_allowed/);

    const again = new URL((await startSearchConsoleConnection(ws.tenantId, ws.siteId, ws.userId)).url).searchParams.get("state")!;
    const denied = google([], { token: () => new Response(JSON.stringify({ access_token: "a", refresh_token: "r", scope: "openid" })) });
    await assert.rejects(completeSearchConsoleConnection(ws.tenantId, ws.userId, { state: again, code: "c" }, denied), /scope_not_granted/);
  } finally {
    await ws.remove();
  }
});

test("incremental: no day is asked twice, rows are stored once, history is bounded per run", async () => {
  const ws = await workspace();
  try {
    await ws.connect();
    const days = daysWithData(5);
    const calls: Call[] = [];
    const fetchImpl = google(calls, { rows: dailyRows(days) });
    const first = await syncSearchConsole(ws.siteId, { fetchImpl, maxDays: 3, now: NOW });
    assert.deepEqual([first.status, first.days, first.more], ["synced", 3, true]);
    const second = await syncSearchConsole(ws.siteId, { fetchImpl, maxDays: 3, now: NOW });
    assert.deepEqual([second.days, second.more], [2, false]);
    const asked = calls.filter((call) => (call.body.dimensions as string[] | undefined)?.[0] === "page").map((call) => String(call.body.startDate));
    assert.deepEqual([...asked].sort(), [...days].sort(), "each day once");
    assert.ok(calls.filter((call) => call.body.dimensions).every((call) => call.body.dataState === "final"));
    const third = await syncSearchConsole(ws.siteId, { fetchImpl, now: NOW });
    assert.equal(third.days, 0);
    const last = calls.filter((call) => (call.body.dimensions as string[] | undefined)?.[0] === "date").at(-1)!;
    assert.equal(last.body.startDate, iso(1), "once the history is in, only what follows it is asked");
    assert.equal(await prisma.searchPerformance.count({ where: { siteId: ws.siteId } }), 15);
    const status = await getSearchConsoleStatus(ws.tenantId, ws.siteId, NOW);
    assert.deepEqual([status.syncedFrom, status.syncedThrough, status.dataAgeDays, status.backfillComplete, status.lastError], [iso(-4), iso(0), 3, true, null]);
    // The newest day arrives later.
    const grown = google(calls, { rows: dailyRows([iso(1), ...days]) });
    assert.equal((await syncSearchConsole(ws.siteId, { fetchImpl: grown, now: NOW })).days, 1);
    // Another worker holds the site.
    await prisma.searchConsoleConnection.updateMany({ where: { siteId: ws.siteId }, data: { leaseUntil: new Date(Date.now() + 60_000) } });
    assert.equal((await syncSearchConsole(ws.siteId, { fetchImpl: grown, now: NOW })).status, "skipped");
  } finally {
    await ws.remove();
  }
});

test("failures: revoked access forgets the token, lost permission stops, quota waits, nothing stored is lost", async () => {
  const ws = await workspace();
  try {
    await ws.connect();
    await syncSearchConsole(ws.siteId, { fetchImpl: google([], { rows: dailyRows(daysWithData(2)) }), now: NOW });
    const answer = (status: number, reason: string) => () => new Response(JSON.stringify({ error: { status: reason, errors: [{ reason }] } }), { status });
    const run = async (over: Parameters<typeof google>[1]) => {
      await prisma.searchConsoleConnection.updateMany({ where: { siteId: ws.siteId }, data: { status: "active", failureCount: 0, leaseUntil: null, refreshTokenCiphertext: encryptSecret("refresh-1") } });
      const result = await syncSearchConsole(ws.siteId, { fetchImpl: google([], over), now: NOW });
      return { result, row: await prisma.searchConsoleConnection.findFirstOrThrow({ where: { siteId: ws.siteId } }) };
    };
    const quota = await run({ query: answer(429, "quotaExceeded") });
    assert.deepEqual([quota.result.status, quota.row.status, quota.row.leaseUntil], ["failed", "active", null]);
    assert.ok(quota.row.nextSyncAt!.getTime() - NOW.getTime() >= 3_600_000);
    const forbidden = await run({ query: answer(403, "forbidden") });
    assert.deepEqual([forbidden.row.status, forbidden.row.nextSyncAt], ["forbidden", null]);
    const revoked = await run({ token: () => new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 }) });
    assert.deepEqual([revoked.row.status, revoked.row.refreshTokenCiphertext, revoked.row.nextSyncAt], ["revoked", null, null]);
    assert.equal((await syncSearchConsole(ws.siteId, { fetchImpl: google([]), now: NOW })).status, "skipped");
    assert.equal(await prisma.searchPerformance.count({ where: { siteId: ws.siteId } }), 6);
    // Disconnecting keeps the data unless asked otherwise.
    await disconnectSearchConsole(ws.tenantId, ws.siteId, ws.userId, { deleteData: false }, google([]));
    assert.equal(await prisma.searchPerformance.count({ where: { siteId: ws.siteId } }), 6);
    await disconnectSearchConsole(ws.tenantId, ws.siteId, ws.userId, { deleteData: true }, google([]));
    assert.equal(await prisma.searchPerformance.count({ where: { siteId: ws.siteId } }), 0);
  } finally {
    await ws.remove();
  }
});

/** 120 days of a page that could rank better, a query nobody covers and an untouched cohort. */
async function seedPerformance(ws: Awaited<ReturnType<typeof workspace>>, days = 120) {
  await ws.connect({ syncedFrom: new Date(iso(-days + 1)), syncedThrough: new Date(iso(0)), backfillComplete: true });
  const rows: Array<Record<string, unknown>> = [];
  for (let offset = 0; offset < days; offset += 1) {
    const at = { tenantId: ws.tenantId, siteId: ws.siteId, date: new Date(iso(-offset)) };
    rows.push({ ...at, dataset: "site", country: "esp", device: "mobile", clicks: 30, impressions: 600, positionSum: 600 * 8 });
    rows.push({ ...at, dataset: "page", page: "https://www.example.test/trenes/", clicks: 2, impressions: 40, positionSum: 40 * 8 });
    for (let page = 0; page < 12; page += 1) rows.push({ ...at, dataset: "page", page: `https://example.test/otra-${page}`, clicks: 2, impressions: 40, positionSum: 40 * 8 });
    rows.push({ ...at, dataset: "query", query: "horario tren toledo", page: "https://www.example.test/trenes/", country: "esp", device: "mobile", clicks: 2, impressions: 40, positionSum: 40 * 8 });
    rows.push({ ...at, dataset: "query", query: "alquiler bicicletas toledo", page: "https://www.example.test/trenes/", country: "esp", device: "mobile", clicks: 0, impressions: 30, positionSum: 30 * 25 });
  }
  for (let i = 0; i < rows.length; i += 1_000) await prisma.searchPerformance.createMany({ data: rows.slice(i, i + 1_000) as never });
  for (const [path, title] of [["trenes", "Horario de tren a Toledo"], ["otra-1", "Otra uno"], ["otra-2", "Otra dos"], ["otra-3", "Otra tres"], ["otra-4", "Otra cuatro"]]) {
    await prisma.siteIndexedPage.create({ data: { tenantId: ws.tenantId, siteId: ws.siteId, url: `https://example.test/${path}`, title, h1: title, crawlState: "extracted" } });
  }
  await prisma.siteIntelligenceProfile.create({ data: { tenantId: ws.tenantId, siteId: ws.siteId, detectedSiteType: "blog", indexedAt: new Date(), mainTopics: ["tren", "toledo", "horario", "alquiler", "bicicletas"], categories: ["toledo"], evergreenTopics: ["horario"], commercialTopics: ["alquiler"], newsTopics: [], sportsTopics: [], excludedTopics: [], topicClusters: [], contentTypes: [], entities: [] } as never });
}

test("a site with Search Console data gets scored, explained opportunities without any provider, isolated by tenant", async () => {
  const ws = await workspace();
  const other = await workspace();
  try {
    await seedPerformance(ws);
    const before = await prisma.seoSpendReservation.count({ where: { tenantId: ws.tenantId } });
    const summary = await analyzeSite(ws.tenantId, ws.siteId, NOW);
    assert.equal(summary.firstPartyData, true);
    const items = await listSeoOpportunities(ws.tenantId, ws.siteId);
    const ranked = items.find((item) => item.query === "horario tren toledo")!;
    assert.deepEqual([ranked.kind, ranked.action, ranked.status], ["striking_distance", "update_existing", "open"]);
    const created = items.find((item) => item.query === "alquiler bicicletas toledo")!;
    assert.deepEqual([created.action, created.status], ["create_content", "open"]);
    for (const item of items) {
      const explanation = item.explanation as Record<string, any>;
      assert.ok(explanation.why && explanation.action.reason && explanation.effort && explanation.confidence.reasons.length && Array.isArray(explanation.risks), item.kind);
      assert.equal(explanation.externalData.required, false);
    }
    assert.equal(await prisma.seoSpendReservation.count({ where: { tenantId: ws.tenantId } }), before, "nothing was bought");

    // Same data, same result.
    const ids = items.map((item) => `${item.id}:${item.status}:${item.score}`).sort();
    await analyzeSite(ws.tenantId, ws.siteId, new Date(NOW.getTime() + 1_000));
    assert.deepEqual((await listSeoOpportunities(ws.tenantId, ws.siteId)).map((item) => `${item.id}:${item.status}:${item.score}`).sort(), ids);

    // The plan can use the query nobody measured, with its volume still unknown.
    const context = await buildEditorialPlanningContext(ws.tenantId, ws.siteId);
    const research = emptyKeywordResearch();
    const candidates = await collectKeywordCandidates(ws.tenantId, ws.siteId, { ...context, site: { ...context.site, locale: "xx-XX" } }, 5, undefined, research);
    const candidate = candidates.find((entry) => entry.keyword === "alquiler bicicletas toledo")!;
    assert.ok(candidate, JSON.stringify(research));
    assert.deepEqual([candidate.volume, candidate.difficulty, candidate.source, candidate.origin?.kind], [null, null, "search_console", "search_console"]);
    assert.ok(candidate.firstParty!.impressions > 500 && candidate.score > 0);

    // The assistant reads the same decision.
    const tool = await READ_TOOLS.seo_opportunities.run({ tenantId: ws.tenantId, site: { id: ws.siteId, name: "Viajes" }, selection: {} } as never, {});
    assert.match(tool.content, /horario tren toledo.*update_existing/);

    // Another tenant sees nothing and cannot act, whatever id it uses.
    await assert.rejects(listSeoOpportunities(other.tenantId, ws.siteId), /site_not_found/);
    await assert.rejects(getSearchConsoleStatus(other.tenantId, ws.siteId), /site_not_found/);
    await assert.rejects(decideSeoOpportunity(other.tenantId, other.siteId, ranked.id, "approved", null), /not_found/);
    await assert.rejects(completeSeoOpportunity(other.tenantId, other.siteId, ranked.id, { actedAt: NOW, url: null }, null), /not_found/);
    assert.equal((await analyzeSite(other.tenantId, other.siteId, NOW)).firstPartyData, false);
    assert.deepEqual(await listSeoOpportunities(other.tenantId, other.siteId), []);
  } finally {
    await ws.remove();
    await other.remove();
  }
});

test("decisions survive the next analysis; only new content goes to the plan; a page has one approved action", async () => {
  const ws = await workspace();
  try {
    await seedPerformance(ws);
    await analyzeSite(ws.tenantId, ws.siteId, NOW);
    const items = await listSeoOpportunities(ws.tenantId, ws.siteId);
    const update = items.find((item) => item.query === "horario tren toledo")!;
    const create = items.find((item) => item.query === "alquiler bicicletas toledo")!;
    await assert.rejects(addOpportunityToPlan(ws.tenantId, ws.siteId, update.id, {}, ws.userId), /not_plannable/);
    await assert.rejects(addOpportunityToPlan(ws.tenantId, ws.siteId, create.id, { mode: "update" }, ws.userId), /not_plannable/);
    const planned = await addOpportunityToPlan(ws.tenantId, ws.siteId, create.id, {}, ws.userId);
    assert.deepEqual([planned.created, planned.planItem.primaryKeyword, planned.planItem.title], [true, "alquiler bicicletas toledo", "Alquiler bicicletas toledo"]);
    assert.equal((await addOpportunityToPlan(ws.tenantId, ws.siteId, create.id, {}, ws.userId)).created, false);
    await decideSeoOpportunity(ws.tenantId, ws.siteId, update.id, "approved", ws.userId);
    const rival = await prisma.contentOpportunity.create({ data: { tenantId: ws.tenantId, siteId: ws.siteId, source: "search_console", kind: "low_ctr", topic: "x", dedupeKey: "seo:test", rationale: "x", action: "improve_metadata", targetUrl: "https://example.test/trenes" } });
    await assert.rejects(decideSeoOpportunity(ws.tenantId, ws.siteId, rival.id, "approved", ws.userId), /conflicts/);
    await analyzeSite(ws.tenantId, ws.siteId, new Date(NOW.getTime() + 1_000));
    const after = Object.fromEntries((await listSeoOpportunities(ws.tenantId, ws.siteId)).map((item) => [item.id, item.status]));
    assert.deepEqual([after[update.id], after[create.id], after[rival.id]], ["approved", "planned", "expired"]);
    assert.ok(await prisma.auditLog.count({ where: { tenantId: ws.tenantId, action: "seo_opportunity.approved" } }));

    await assert.rejects(saveSeoProfile(ws.tenantId, ws.siteId, { profile: "bank" }, ws.userId), /invalid_profile/);
    await assert.rejects(saveSeoProfile(ws.tenantId, ws.siteId, { profile: "services", weights: { searchDemand: 9 } }, ws.userId), /invalid_weights/);
    const profile = await saveSeoProfile(ws.tenantId, ws.siteId, { profile: "services", weights: { searchDemand: 0 }, priorityTopics: ["toledo"], holdoutPercent: 10 }, ws.userId);
    assert.deepEqual([profile.profile, profile.weights.searchDemand, profile.priorityTopics, profile.holdoutPercent], ["services", 0, ["toledo"], 10]);
  } finally {
    await ws.remove();
  }
});

test("attribution: frozen baseline, final windows against untouched pages, unknown costs stay unknown", async () => {
  const ws = await workspace();
  try {
    await seedPerformance(ws);
    await analyzeSite(ws.tenantId, ws.siteId, NOW);
    const update = (await listSeoOpportunities(ws.tenantId, ws.siteId)).find((item) => item.query === "horario tren toledo")!;
    await assert.rejects(completeSeoOpportunity(ws.tenantId, ws.siteId, update.id, { actedAt: NOW, url: "https://evil.test/x" }, ws.userId), /not_of_this_site/);
    const action = await completeSeoOpportunity(ws.tenantId, ws.siteId, update.id, { actedAt: new Date(iso(-40)), url: null }, ws.userId);
    const baseline = action.baseline as Record<string, { clicks: number } | null>;
    assert.deepEqual([baseline["28"]?.clicks, baseline["56"]?.clicks, baseline["90"]], [56, 112, null], "a window not fully stored has no baseline");
    await assert.rejects(completeSeoOpportunity(ws.tenantId, ws.siteId, update.id, { actedAt: NOW, url: null }, ws.userId), /already_acted/);
    assert.equal(await evaluateActions(ws.tenantId, ws.siteId, NOW), 1);
    assert.equal(await evaluateActions(ws.tenantId, ws.siteId, NOW), 0);
    const row = await prisma.seoAction.findFirstOrThrow({ where: { opportunityId: update.id } });
    const evaluations = row.evaluations as unknown as Record<string, Evaluation>;
    assert.deepEqual(Object.keys(evaluations), ["28"]);
    assert.deepEqual([evaluations["28"].pre.clicks, evaluations["28"].post.clicks, evaluations["28"].outcome, evaluations["28"].causal, evaluations["28"].cohort?.pages], [56, 56, "no_clear_change", false, 12]);
    const outcomes = await outcomeSummary(ws.tenantId, ws.siteId);
    assert.deepEqual([outcomes.seoCostUsd, outcomes.contentCostUsd, outcomes.weightsAdjusted], [0, null, false]);
  } finally {
    await ws.remove();
  }
});

test("routes enforce permissions and never show a token", async () => {
  const ws = await workspace();
  const app = Fastify();
  registerStudioRoutes(app);
  try {
    await ws.connect();
    const headers = { authorization: `Bearer ${ws.seed}` };
    const status = await app.inject({ method: "GET", url: `/v2/sites/${ws.siteId}/search-console`, headers });
    assert.equal(status.statusCode, 200);
    assert.doesNotMatch(status.body, /cipher|refresh/i);
    assert.equal((await app.inject({ method: "POST", url: `/v2/sites/${ws.siteId}/search-console/connect`, headers, payload: {} })).statusCode, 403, "a signed-in person is required");
    assert.equal((await app.inject({ method: "GET", url: `/v2/sites/${ws.siteId}/seo-opportunities` })).statusCode, 401);
    assert.equal((await app.inject({ method: "GET", url: `/v2/sites/${randomUUID()}/seo-opportunities`, headers })).statusCode, 404);
    assert.equal((await app.inject({ method: "PUT", url: `/v2/sites/${ws.siteId}/seo-profile`, headers, payload: { profile: "nope" } })).statusCode, 400);
    assert.equal((await app.inject({ method: "GET", url: `/v2/sites/${ws.siteId}/seo-profile`, headers })).json().profile, "publisher");
  } finally {
    await app.close();
    await ws.remove();
  }
});
