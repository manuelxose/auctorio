import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import { getPrismaClient } from "../src/infrastructure/db/prisma";
import { SeoProviderError, type SeoErrorCode } from "../src/infrastructure/seo/contract";
import { dataForSeoProvider } from "../src/infrastructure/seo/dataforseo";
import { sha256 } from "../src/shared/utils/hash";
import { registerStudioRoutes } from "../src/studio/routes";
import { buildStudioProxySignature } from "../src/studio/security";
import { STUDIO_PERMISSIONS_HEADER, STUDIO_SESSION_HEADER, STUDIO_SIGNATURE_HEADER, STUDIO_TENANT_HEADER, STUDIO_TIMESTAMP_HEADER, STUDIO_USER_HEADER } from "../src/studio/http-utils";
import { storeProviderCache } from "../src/studio/enrichment/provider-cache";
import { buildEditorialPlanningContext } from "../src/studio/editorial-plan-context";
import { collectKeywordCandidates, emptyKeywordResearch } from "../src/studio/keyword-candidates";
import { knownKeywordMetrics, listSiteKeywords } from "../src/studio/seo-research/knowledge";
import { advanceResearchRun, checkSiteResearch, controlResearchRun, estimateResearch, getResearchRun, requestPlanningResearch, requestResearch, runCost, runResearchTick, startOnboardingResearch } from "../src/studio/seo-research/runs";
import { enrichPlanItemsWithKeywordMetrics } from "../src/studio/keyword-metrics";
import {
  dispatchSeoReservation, recoverSeoReservations, releaseSeoReservation, reserveSeoSpend, resolveUncertainReservation, settleSeoReservation, type ReserveInput,
} from "../src/studio/seo-governor";
import { acquireSeo, seoCapabilityAvailable, seoRoute, verifySeoProvider, withSeoSlot, type SeoRoute, type SeoScope } from "../src/studio/seo-manager";
import { serpSourceFacts } from "../src/studio/serp-sources";
import { youtubeVideoFor } from "../src/studio/youtube-videos";

import { setArticleWriterFactory } from "../src/studio/editorial-engine/writer-provider";
import { enqueueRegeneratePlanItem, generateEditorialPlan, readPlanItemSelection, updateEditorialPlanItem, type PlanShortage } from "../src/studio/editorial-plan";
import { getOrCreatePolicy } from "../src/studio/automation";
import { getMonthPlan } from "../src/studio/autopilot-plan";
import { NEW_CONTENT } from "../src/studio/plan-slots";
import { progressDuePlanItems } from "../src/studio/planner";
import { getProductionJob, retryProductionJob, reviewProductionJob, startProduction, startProductionForProject } from "../src/studio/production/pipeline";
import { setProductionStageOverrides } from "../src/studio/production/stages";
import { listSeoOpportunities, startOpportunityRevision } from "../src/studio/seo-intelligence";
import { getWebIntelligenceProvider } from "../src/studio/web-intelligence";
import { FakeWriter } from "./support/fake-editorial-writer";

// The control state is platform-wide, so everything that depends on it lives in this file (its tests run in order).
const prisma = getPrismaClient();
const ENV = ["DATAFORSEO_LOGIN", "DATAFORSEO_PASSWORD", "ANYAPI_API_KEY", "PLATFORM_ADMIN_EMAILS", "SOCIAL_TOKEN_ENCRYPTION_KEY"];
const savedEnv = new Map(ENV.map((name) => [name, process.env[name]]));
const KEYS = ["DATAFORSEO_LOGIN", "DATAFORSEO_PASSWORD", "ANYAPI_API_KEY"];
const NO_LOCKS = { automaticRouting: false, paidFallback: false, paidAutomation: [] };

const controlRows = async () => ({
  states: await prisma.seoProviderState.findMany(),
  settings: await prisma.seoControlSetting.findMany(),
  budgets: await prisma.seoBudget.findMany(),
  authorizations: await prisma.seoBudgetAuthorization.findMany(),
  keys: await prisma.aiProviderKey.findMany({ where: { envName: { in: KEYS } } }),
});
let savedRows: Awaited<ReturnType<typeof controlRows>>;

async function clearControl() {
  await prisma.seoProviderState.deleteMany();
  await prisma.seoControlSetting.deleteMany();
  await prisma.seoBudget.deleteMany();
  await prisma.seoBudgetAuthorization.deleteMany();
  await prisma.aiProviderKey.deleteMany({ where: { envName: { in: KEYS } } });
}
test.before(async () => {
  savedRows = await controlRows();
  await clearControl();
  Object.assign(process.env, { DATAFORSEO_LOGIN: "test", DATAFORSEO_PASSWORD: "test", ANYAPI_API_KEY: "", SOCIAL_TOKEN_ENCRYPTION_KEY: "seo-test-key" });
});
test.after(async () => {
  await clearControl();
  await prisma.seoProviderState.createMany({ data: savedRows.states as never });
  await prisma.seoControlSetting.createMany({ data: savedRows.settings as never });
  await prisma.seoBudget.createMany({ data: savedRows.budgets });
  await prisma.seoBudgetAuthorization.createMany({ data: savedRows.authorizations });
  await prisma.aiProviderKey.createMany({ data: savedRows.keys });
  for (const [name, value] of savedEnv) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  await prisma.$disconnect();
});

async function workspace() {
  const seed = `seo-${randomUUID().slice(0, 8)}`;
  const tenant = await prisma.tenant.create({ data: { name: seed, apiKeyHash: sha256(seed), status: "active" } });
  const site = await prisma.site.create({ data: { tenantId: tenant.id, key: seed, name: seed, type: "guiatv", locale: "es-ES", baseUrl: "https://example.test" } });
  return {
    tenantId: tenant.id,
    siteId: site.id,
    reservations: () => prisma.seoSpendReservation.findMany({ where: { tenantId: tenant.id }, orderBy: { createdAt: "asc" } }),
    spend: () => prisma.aiSpendEvent.findMany({ where: { tenantId: tenant.id }, orderBy: { createdAt: "asc" } }),
    async remove() {
      const where = { tenantId: tenant.id };
      await prisma.aiSpendEvent.deleteMany({ where });
      const reservations = await prisma.seoSpendReservation.findMany({ where, select: { id: true } });
      await prisma.seoAcquisitionLease.deleteMany({ where: { reservationId: { in: reservations.map(({ id }) => id) } } });
      await prisma.seoSpendReservation.deleteMany({ where });
      await prisma.notification.deleteMany({ where });
      await prisma.providerCacheEntry.deleteMany({ where });
      await prisma.editorialPlanItem.deleteMany({ where });
      await prisma.editorialPlan.deleteMany({ where });
      await prisma.site.deleteMany({ where });
      await prisma.auditLog.deleteMany({ where });
      await prisma.tenant.delete({ where: { id: tenant.id } });
    },
  };
}
const answering = (calls: string[], reply: (url: string) => unknown, status = 200) =>
  (async (url: string) => {
    calls.push(String(url));
    return new Response(JSON.stringify(reply(String(url))), { status });
  }) as typeof fetch;
const codeOf = (promise: Promise<unknown>) => promise.then(() => "none", (error: unknown) => (error instanceof SeoProviderError ? error.code : String(error)));

test("plan items get measured metrics once, cached per keyword; no credentials → untouched", async () => {
  const ws = await workspace();
  const plan = await prisma.editorialPlan.create({ data: { tenantId: ws.tenantId, siteId: ws.siteId, name: "p", dateFrom: new Date(), dateTo: new Date() } });
  const item = (title: string, primaryKeyword: string | null) =>
    prisma.editorialPlanItem.create({ data: { tenantId: ws.tenantId, planId: plan.id, siteId: ws.siteId, title, channel: "website", primaryKeyword } });
  const [known, unknown, none] = await Promise.all([item("a", "Canales de televisión gratis"), item("b", "keyword sin datos"), item("c", null)]);
  const calls: string[] = [];
  const fetchImpl = answering(calls, (url) =>
    url.includes("google_ads")
      ? { status_code: 20000, cost: 0, tasks: [{ status_code: 20000, result: [] }] }
      : { status_code: 20000, cost: 0.0101, tasks: [{ status_code: 20000, result: [{ items: [{ keyword: "canales de televisión gratis", keyword_info: { search_volume: 1600 }, keyword_properties: { keyword_difficulty: 21 } }] }] }] });
  const overviewCalls = () => calls.filter((url) => url.includes("keyword_overview")).length;
  try {
    process.env.DATAFORSEO_LOGIN = "";
    assert.equal(await enrichPlanItemsWithKeywordMetrics(ws.tenantId, plan.id, fetchImpl), 0);
    assert.equal(await seoCapabilityAvailable("keyword_metrics"), false);
    assert.equal(calls.length, 0);

    process.env.DATAFORSEO_LOGIN = "test";
    assert.equal(await enrichPlanItemsWithKeywordMetrics(ws.tenantId, plan.id, fetchImpl), 1);
    const byId = new Map((await prisma.editorialPlanItem.findMany({ where: { planId: plan.id } })).map((row) => [row.id, row]));
    assert.deepEqual([byId.get(known.id)!.searchVolume, byId.get(known.id)!.keywordDifficulty, byId.get(known.id)!.keywordMetricsSource], [1600, 21, "dataforseo"]);
    // One keyword is not worth the flat price of a search-volume request: it stays unmeasured, not "no demand".
    assert.deepEqual([byId.get(unknown.id)!.searchVolume, byId.get(unknown.id)!.keywordMetricsSource, calls.length], [null, null, 1]);
    assert.equal(byId.get(none.id)!.keywordMetricsSource, null);
    assert.deepEqual((await ws.spend()).map((row) => [row.kind, row.provider, row.model, row.costUsd]), [["keyword_metrics", "dataforseo", "keyword_overview", 0.0101]]);

    // Same keyword on a new item is served from cache: no second provider call.
    const again = await item("d", "canales de televisión gratis");
    assert.equal(await enrichPlanItemsWithKeywordMetrics(ws.tenantId, plan.id, fetchImpl), 1);
    assert.equal(overviewCalls(), 1);
    // Checked and no data anywhere: source recorded, numbers stay null (never invented).
    await prisma.seoControlSetting.create({ data: { mode: "dataforseo_only", policy: { minVolumeBatch: 1 } } });
    assert.equal(await enrichPlanItemsWithKeywordMetrics(ws.tenantId, plan.id, fetchImpl), 1);
    const checked = await prisma.editorialPlanItem.findUniqueOrThrow({ where: { id: unknown.id } });
    assert.deepEqual([checked.searchVolume, checked.keywordMetricsSource, overviewCalls(), calls.length], [null, "dataforseo", 1, 2]);
    assert.equal((await prisma.editorialPlanItem.findUnique({ where: { id: again.id } }))!.searchVolume, 1600);
  } finally {
    await clearControl();
    await ws.remove();
  }
});

test("data cached before SEO-V2 is still read, under the same keys", async () => {
  const ws = await workspace();
  const calls: string[] = [];
  const fetchImpl = answering(calls, () => ({}));
  try {
    await storeProviderCache(ws.tenantId, "dataforseo", "serp_organic", "2724|es|guia tv", [{ url: "https://xataka.com/tv", title: "TV", domain: "xataka.com", description: "Parrilla" }], { ttlMs: 60_000 });
    await storeProviderCache(ws.tenantId, "dataforseo", "youtube_organic", "2724|es|guia tv", [{ id: "abcdefghijk", title: "Guía TV de hoy", channel: "Canal", channelUrl: "" }], { ttlMs: 60_000 });
    const { facts, serp } = await serpSourceFacts({ tenantId: ws.tenantId, siteId: ws.siteId, locale: "es-ES", keyword: "Guia TV", exclude: { domains: [], urls: [] }, max: 3 }, fetchImpl, async () => null);
    assert.deepEqual(facts.map((fact) => [fact.sourceUrl, fact.statement, fact.evidenceKind]), [["https://xataka.com/tv", "TV", "search_result"]], "a page nobody read is a lead: its snippet is not evidence");
    assert.deepEqual([serp.state, serp.dataKind], ["reused", "historical"]);
    const video = await youtubeVideoFor({ tenantId: ws.tenantId, siteId: ws.siteId, locale: "es", keyword: "guia tv", youtube: { enabled: true, channelOnly: false, channelUrl: "", approved: [] }, needed: true }, fetchImpl);
    assert.deepEqual([video.video?.id, video.state], ["abcdefghijk", "reused"]);
    assert.deepEqual(calls.filter((url) => !url.includes("youtube.com/oembed")), [], "only the free embed check leaves");
  } finally {
    await ws.remove();
  }
});

test("a disabled provider or the kill switch stops calls at once, even for a route already resolved", async () => {
  const ws = await workspace();
  const calls: string[] = [];
  const scope = { tenantId: ws.tenantId, siteId: ws.siteId, kind: "keyword_metrics", fetchImpl: answering(calls, () => ({})) };
  const acquire = (route: SeoRoute) => codeOf(acquireSeo(route, "keyword_metrics", { keywords: ["guia tv"] }, scope));
  try {
    const route = await seoRoute("keyword_metrics", "es-ES");
    assert.ok(route.provider);
    await prisma.seoProviderState.upsert({ where: { providerId: "dataforseo" }, create: { providerId: "dataforseo", enabled: false, priority: 10 }, update: { enabled: false } });
    assert.equal(await acquire(route), "provider_disabled");
    assert.deepEqual(await seoRoute("keyword_metrics", "es-ES"), { provider: null, reason: "provider_disabled" });
    await prisma.seoProviderState.update({ where: { providerId: "dataforseo" }, data: { enabled: true } });
    await prisma.seoControlSetting.create({ data: { mode: "disabled" } });
    assert.equal(await acquire(route), "external_disabled");
    await prisma.seoControlSetting.update({ where: { id: "global" }, data: { mode: "something-else" } });
    assert.equal(await acquire(route), "external_disabled", "an unreadable mode does not spend");
    assert.equal(calls.length, 0);
    assert.deepEqual(await ws.spend(), []);
  } finally {
    await clearControl();
    await ws.remove();
  }
});

test("keyword research records its provider, or why there was none", async () => {
  const ws = await workspace();
  const calls: string[] = [];
  const context = (locale: string) => ({ profile: null, clusters: [{ name: "guia tv" }], site: { id: ws.siteId, name: "Guía TV", type: "guiatv", baseUrl: null, locale }, searchTargets: [], existingPlanQueries: [], existingPlanTitles: [], indexedUrlInventory: [] }) as never;
  const skipped = async (locale: string) => {
    const research = emptyKeywordResearch();
    assert.deepEqual(await collectKeywordCandidates(ws.tenantId, ws.siteId, context(locale), 5, {}, research), []);
    return research.skipped;
  };
  try {
    process.env.DATAFORSEO_LOGIN = "";
    assert.equal(await skipped("es-ES"), "not_configured");
    process.env.DATAFORSEO_LOGIN = "test";
    assert.equal(await skipped("ja-JP"), "unsupported_market");
    await prisma.seoControlSetting.create({ data: { mode: "disabled" } });
    assert.equal(await skipped("es-ES"), "disabled");
    await clearControl();
    assert.equal(calls.length, 0);

    const research = emptyKeywordResearch();
    const row = { keyword: "guia tv hoy", keyword_info: { search_volume: 9000 }, keyword_properties: { keyword_difficulty: 10 }, search_intent_info: { main_intent: "informational" } };
    const ideas = (await seoRoute("keyword_suggestions", "es-ES")) as SeoRoute;
    await acquireSeo(ideas, "keyword_suggestions", { seed: "guia tv", limit: 100 }, { tenantId: ws.tenantId, siteId: ws.siteId, kind: "keyword_metrics", fetchImpl: answering(calls, () => ({ status_code: 20000, cost: 0.024, tasks: [{ status_code: 20000, result: [{ items: [row] }] }] })) });
    const ranked = await collectKeywordCandidates(ws.tenantId, ws.siteId, context("es-ES"), 5, {}, research);
    assert.deepEqual([calls.length, research.market, research.seeds, research.failedCalls, research.rows], [1, "2724|es", [{ keyword: "guia tv", origin: "cluster" }], 0, 1]);
    assert.deepEqual([research.provider, research.skipped], ranked.length ? ["dataforseo", null] : [null, "no_data"]);
  } finally {
    process.env.DATAFORSEO_LOGIN = "test";
    await clearControl();
    await ws.remove();
  }
});

test("AnyAPI serves the same operation when selected; its automation is locked and its cost and health are recorded", async () => {
  const ws = await workspace();
  process.env.ANYAPI_API_KEY = "aa_test_secret";
  process.env.DATAFORSEO_LOGIN = "";
  const calls: string[] = [];
  const ok = answering(calls, () => ({ output: { found: true, data: { keywords: [{ keyword: "guia tv", searchVolume: 1600 }] } }, costUsd: 0.01454, replayed: false, source: { name: "Owl" } }));
  const scope = { tenantId: ws.tenantId, siteId: ws.siteId, kind: "keyword_metrics", fetchImpl: ok };
  try {
    await prisma.seoControlSetting.create({ data: { mode: "anyapi_only" } });
    await prisma.seoProviderState.create({ data: { providerId: "anyapi", enabled: true, priority: 20 } });
    assert.deepEqual(await seoRoute("keyword_metrics", "es-ES"), { provider: null, reason: "paid_automation_locked" });
    const route = (await seoRoute("keyword_metrics", "es-ES", { locks: NO_LOCKS })) as SeoRoute;
    assert.equal(route.provider.id, "anyapi");
    assert.equal(await codeOf(acquireSeo(route, "keyword_metrics", { keywords: ["guia tv"] }, scope)), "paid_automation_locked");
    assert.equal(calls.length, 0);

    const unlocked = { ...scope, locks: NO_LOCKS };
    const { data, meta } = await acquireSeo(route, "keyword_metrics", { keywords: ["guia tv"] }, unlocked);
    assert.deepEqual([data[0].volume, data[0].difficulty, data[0].source, meta.providerId, meta.billedUsd, meta.upstream], [1600, null, "anyapi", "anyapi", 0.01454, "Owl"]);
    assert.equal(meta.dataKind, "provider_reported");
    // 701 keywords are two requests; a failure that was billed is accounted for.
    await acquireSeo(route, "keyword_metrics", { keywords: Array.from({ length: 701 }, (_, i) => `k${i}`) }, unlocked);
    assert.equal(calls.length, 3);
    const failing = answering(calls, () => ({ error: "boom", costUsd: 0.002 }), 502);
    assert.equal(await codeOf(acquireSeo(route, "keyword_metrics", { keywords: ["x"] }, { ...unlocked, fetchImpl: failing })), "upstream_error");
    // A cost the provider does not report is recorded at its maximum, not at zero.
    assert.equal(await codeOf(acquireSeo(route, "keyword_metrics", { keywords: ["x"] }, unlocked)), "retry_cooldown", "a failed request is not repeated at once");
    await acquireSeo(route, "keyword_metrics", { keywords: ["y"] }, { ...unlocked, fetchImpl: answering(calls, () => ({ output: { found: false } })) });
    const spend = await ws.spend();
    assert.deepEqual(spend.map((row) => row.costUsd), [0.01454, 0.01454, 0.01454, 0.002, 0.01454]);
    assert.ok(spend.every((row) => row.provider === "anyapi"));
    const state = await prisma.seoProviderState.findUniqueOrThrow({ where: { providerId: "anyapi" } });
    assert.ok(state.lastSuccessAt && state.lastErrorCode === "upstream_error" && !state.lastErrorMessage!.includes("aa_test_secret"));
    assert.equal(await codeOf(acquireSeo(route, "keyword_suggestions", { seed: "x", limit: 5000 }, unlocked)), "bad_request");
    assert.equal(await codeOf(acquireSeo(route, "serp_organic", { keyword: "x", device: "mobile" }, unlocked)), "bad_request");
  } finally {
    process.env.DATAFORSEO_LOGIN = "test";
    process.env.ANYAPI_API_KEY = "";
    await clearControl();
    await ws.remove();
  }
});

test("a live test needs a known maximum price within the authorized ceiling", async () => {
  const ws = await workspace();
  process.env.ANYAPI_API_KEY = "aa_test";
  const calls: string[] = [];
  const fetchImpl = answering(calls, () => ({ output: { found: true, data: { keywords: [{ keyword: "weather", searchVolume: 10 }] } }, costUsd: 0.01454, replayed: false }));
  const verify = (patch: Partial<Parameters<typeof verifySeoProvider>[0]> = {}) => verifySeoProvider({ providerId: "anyapi", capability: "keyword_metrics", locale: "es-ES", maxSpendUsd: 0.05, tenantId: ws.tenantId, fetchImpl, ...patch });
  try {
    assert.equal(await codeOf(verify()), "provider_disabled");
    await prisma.seoProviderState.create({ data: { providerId: "anyapi", enabled: true, priority: 20 } });
    assert.equal(await codeOf(verify({ maxSpendUsd: 0.001 })), "spend_limit");
    assert.equal(await codeOf(verify({ maxSpendUsd: 100 })), "spend_limit");
    assert.equal(await codeOf(verify({ providerId: "dataforseo", capability: "serp_organic" })), "unknown_price");
    assert.equal(calls.length, 0);
    assert.deepEqual(await verify(), { rows: 1, costUsd: 0.01454, partial: false, notes: [], market: "ES|es" });
    const state = await prisma.seoProviderState.findUniqueOrThrow({ where: { providerId: "anyapi" } });
    assert.ok((state.verifications as Record<string, unknown>).keyword_metrics);
    assert.deepEqual((await ws.spend()).map((row) => [row.kind, row.costUsd]), [["seo_live_test", 0.01454]]);
    await prisma.seoControlSetting.create({ data: { mode: "disabled" } });
    assert.equal(await codeOf(verify()), "external_disabled", "the kill switch also stops tests");
    assert.equal(calls.length, 1);
  } finally {
    process.env.ANYAPI_API_KEY = "";
    await clearControl();
    await ws.remove();
  }
});

test("admin control plane: platform admins only, audited, secrets go in and never come out", async () => {
  const ws = await workspace();
  const email = `${randomUUID().slice(0, 8)}@example.test`;
  const account = await prisma.studioAccount.create({ data: { email, displayName: "SEO admin", status: "active" } });
  const user = await prisma.studioUser.create({ data: { tenantId: ws.tenantId, accountId: account.id, email, displayName: "SEO admin", status: "active" } });
  const app = Fastify();
  registerStudioRoutes(app);
  const call = async (method: "GET" | "PUT" | "PATCH" | "POST", url: string, payload?: object) => {
    const ids = { tenantId: ws.tenantId, userId: user.id, sessionId: randomUUID() };
    const permissions = ["content:read"];
    const timestamp = String(Date.now());
    const signature = buildStudioProxySignature({ ...ids, permissions, timestamp, method, url });
    const response = await app.inject({
      method,
      url,
      payload: method === "GET" ? undefined : payload ?? {},
      headers: { [STUDIO_TENANT_HEADER]: ids.tenantId, [STUDIO_USER_HEADER]: ids.userId, [STUDIO_SESSION_HEADER]: ids.sessionId, [STUDIO_PERMISSIONS_HEADER]: permissions.join(","), [STUDIO_TIMESTAMP_HEADER]: timestamp, [STUDIO_SIGNATURE_HEADER]: signature },
    });
    return { status: response.statusCode, text: response.body, body: JSON.parse(response.body || "{}") };
  };
  const SECRET = "aa_live_super_secret_value";
  try {
    process.env.PLATFORM_ADMIN_EMAILS = "";
    for (const [method, url] of [["GET", "/v2/admin/seo"], ["PUT", "/v2/admin/seo/control"], ["PATCH", "/v2/admin/seo/providers/anyapi"], ["PUT", "/v2/admin/seo/providers/anyapi/credentials"], ["POST", "/v2/admin/seo/providers/anyapi/verify"]] as const) {
      assert.equal((await call(method, url)).status, 403, `${method} ${url}`);
    }
    process.env.PLATFORM_ADMIN_EMAILS = email;
    const first = await call("GET", "/v2/admin/seo");
    assert.deepEqual([first.status, first.body.mode, first.body.providers.map((p: { id: string; enabled: boolean }) => [p.id, p.enabled])], [200, "dataforseo_only", [["dataforseo", true], ["anyapi", false], ["tavily", true], ["firecrawl", true]]]);
    assert.ok(first.body.providers.every((p: { liveVerification: string }) => p.liveVerification === "pending"));

    assert.equal((await call("PUT", "/v2/admin/seo/providers/anyapi/credentials", { envName: "DATABASE_URL", value: "x" })).status, 400);
    const saved = await call("PUT", "/v2/admin/seo/providers/anyapi/credentials", { envName: "ANYAPI_API_KEY", value: SECRET });
    assert.deepEqual([saved.status, saved.body.configured, saved.body.source], [200, true, "ui"]);
    const row = await prisma.aiProviderKey.findUniqueOrThrow({ where: { envName: "ANYAPI_API_KEY" } });
    assert.ok(row.ciphertext.startsWith("v1:") && !row.ciphertext.includes(SECRET));

    assert.equal((await call("PATCH", "/v2/admin/seo/providers/anyapi", { enabled: true, priority: 5 })).status, 200);
    assert.equal((await call("PATCH", "/v2/admin/seo/providers/anyapi", { priority: 0 })).status, 400);
    assert.equal((await call("PATCH", "/v2/admin/seo/providers/nobody", { enabled: true })).status, 404);
    assert.equal((await call("PUT", "/v2/admin/seo/control", { mode: "cost_optimized" })).status, 409);
    assert.equal((await call("PUT", "/v2/admin/seo/control", { mode: "nonsense" })).status, 400);
    assert.equal((await call("PUT", "/v2/admin/seo/control", { routing: { serp_organic: "nobody" } })).status, 400);
    assert.equal((await call("PUT", "/v2/admin/seo/control", { mode: "manual", routing: { serp_organic: "anyapi", keyword_metrics: "dataforseo" } })).status, 200);
    const after = await call("GET", "/v2/admin/seo");
    const serving = Object.fromEntries(after.body.capabilities.map((c: { id: string; provider: string | null; reason: string | null }) => [c.id, c.provider ?? c.reason]));
    assert.deepEqual([serving.keyword_metrics, serving.serp_organic, serving.youtube_search], ["dataforseo", "paid_automation_locked", "not_selected"]);
    assert.deepEqual([after.body.providers[1].enabled, after.body.providers[1].priority, after.body.providers[1].configured], [true, 5, true]);

    assert.equal((await call("POST", "/v2/admin/seo/providers/anyapi/verify", { capability: "keyword_metrics", maxSpendUsd: 0.05 })).status, 400, "not authorized");
    assert.equal((await call("POST", "/v2/admin/seo/providers/anyapi/verify", { authorize: true, capability: "keyword_metrics" })).status, 400, "no ceiling");
    const blocked = await call("POST", "/v2/admin/seo/providers/anyapi/verify", { authorize: true, capability: "keyword_metrics", maxSpendUsd: 0.05 });
    assert.deepEqual([blocked.status, blocked.body.error], [409, "network_blocked"], "even an authorized test makes no call inside the test runner");
    assert.deepEqual(await ws.spend(), []);

    assert.equal((await call("PUT", "/v2/admin/seo/control", { mode: "disabled" })).status, 200);
    assert.equal(await seoCapabilityAvailable("keyword_metrics"), false);
    const audits = await prisma.auditLog.findMany({ where: { tenantId: ws.tenantId, action: { startsWith: "seo." } } });
    assert.deepEqual([...new Set(audits.map((entry) => entry.action))].sort(), ["seo.control.updated", "seo.credential.set", "seo.provider.live_test", "seo.provider.updated"]);
    for (const leak of [first.text, saved.text, after.text, blocked.text, JSON.stringify(audits)]) assert.ok(!leak.includes(SECRET));
  } finally {
    await app.close();
    await clearControl();
    await prisma.auditLog.deleteMany({ where: { tenantId: ws.tenantId } });
    await prisma.studioUser.delete({ where: { id: user.id } });
    await prisma.studioAccount.delete({ where: { id: account.id } });
    await ws.remove();
  }
});

// ---- Cost Governor (SEO-V2-02) ----

type Workspace = Awaited<ReturnType<typeof workspace>>;
const labs = (items: unknown[], cost: number | undefined = 0.0121) => ({ status_code: 20000, cost, tasks: [{ status_code: 20000, result: [{ items }] }] });
const labsRow = (keyword: string, volume: number | null = 100, difficulty: number | null = 20) => ({ keyword, keyword_info: { search_volume: volume }, keyword_properties: { keyword_difficulty: difficulty } });
/** DataForSEO answering for every keyword it is asked about. */
const labsFetch = (calls: string[][], cost = 0.0121) =>
  (async (_url: string, init: RequestInit) => {
    const [task] = JSON.parse(String(init.body));
    const keywords: string[] = task.keywords ?? [task.target ?? task.keyword];
    calls.push(keywords);
    return new Response(JSON.stringify(labs(keywords.map((keyword) => labsRow(keyword)), cost)));
  }) as typeof fetch;
const scopeOf = (ws: Workspace, fetchImpl: typeof fetch, patch: Partial<SeoScope> = {}): SeoScope => ({ tenantId: ws.tenantId, siteId: ws.siteId, kind: "keyword_metrics", fetchImpl, ...patch });
const metricsRoute = async (locale = "es-ES") => (await seoRoute("keyword_metrics", locale)) as SeoRoute;
const reserveInput = (ws: Workspace, keys: string[], patch: Partial<ReserveInput> = {}): ReserveInput => ({
  tenantId: ws.tenantId, siteId: ws.siteId, provider: dataForSeoProvider, capability: "keyword_metrics", kind: "keyword_metrics", resource: "keyword_overview", keys: keys.map((key) => `${ws.tenantId}:${key}`),
  quote: (list) => ({ estimatedUsd: 0.01 * list.length, maxUsd: 0.01 * list.length, unit: "test", units: list.length }), ...patch,
});
const held = async (ws: Workspace) => (await ws.reservations()).filter((row) => ["reserved", "dispatched", "uncertain"].includes(row.state)).reduce((sum, row) => sum + Number(row.maxUsd), 0);
const setPolicy = (policy: object) => prisma.seoControlSetting.upsert({ where: { id: "global" }, create: { id: "global", mode: "dataforseo_only", policy }, update: { policy } });
const limitTo = (scope: string, scopeId: string, period: string, limitUsd: number, patch: object = {}) => prisma.seoBudget.create({ data: { scope, scopeId, period, limitUsd, ...patch } });

async function governed(run: (ws: Workspace) => Promise<void>): Promise<void> {
  const ws = await workspace();
  try {
    await run(ws);
  } finally {
    await clearControl();
    await ws.remove();
  }
}

test("hundreds of simultaneous reservations never exceed a budget", () => governed(async (ws) => {
  await setPolicy({ maxRequestsPerMinute: 100_000 });
  await limitTo("tenant", ws.tenantId, "daily", 0.1);
  // The rest of the application keeps getting connections meanwhile.
  const [outcomes, waited] = await Promise.all([
    Promise.all(Array.from({ length: 300 }, (_, i) => codeOf(reserveSeoSpend(reserveInput(ws, [`k${i}`]))))),
    (async () => {
      const start = Date.now();
      await prisma.tenant.findUnique({ where: { id: ws.tenantId } });
      return Date.now() - start;
    })(),
  ]);
  assert.ok(waited < 5_000, `another query waited ${waited} ms`);
  const count = (code: string) => outcomes.filter((outcome) => outcome === code).length;
  assert.deepEqual([count("none"), count("budget_exhausted")], [10, 290]);
  assert.ok(Math.abs((await held(ws)) - 0.1) < 1e-9);
  assert.equal(await prisma.seoAcquisitionLease.count({ where: { key: { startsWith: ws.tenantId } } }), 10, "a refused reservation leaves nothing behind");
}));

test("every applicable limit holds: platform, provider, plan, tenant, site, operation, burst and onboarding", () => governed(async (ws) => {
  const cases: Array<[string, string, string, object?]> = [
    ["global", "platform", "monthly"], ["global", "platform", "daily"], ["provider", "dataforseo", "monthly"], ["plan", "*", "monthly"], ["tenant", ws.tenantId, "monthly"], ["tenant", "*", "daily"],
    ["site", ws.siteId, "daily"], ["site", "*", "total", { allowance: "onboarding" }], ["site", ws.siteId, "monthly", { operation: "keyword_metrics" }], ["global", "platform", "daily", { operation: "keyword_metrics" }],
  ];
  for (const [scope, scopeId, period, patch] of cases) {
    const row = await limitTo(scope, scopeId, period, 0.005, patch);
    assert.equal(await codeOf(reserveSeoSpend(reserveInput(ws, ["k"]))), "budget_exhausted", `${scope} ${period}`);
    await prisma.seoBudget.delete({ where: { id: row.id } });
  }
  // A plan allowance is per workspace: what others spend does not use it up.
  const other = await workspace();
  await reserveSeoSpend({ ...reserveInput(other, ["theirs"]), siteId: other.siteId });
  const plan = await limitTo("plan", "*", "monthly", 0.015);
  assert.equal(await codeOf(reserveSeoSpend(reserveInput(ws, ["plan"]))), "none");
  assert.equal(await codeOf(reserveSeoSpend(reserveInput(ws, ["plan2"]))), "budget_exhausted");
  await prisma.seoSpendReservation.deleteMany({ where: { tenantId: ws.tenantId } });
  await prisma.seoBudget.delete({ where: { id: plan.id } });
  await other.remove();
  // Limits that are somebody else's do not apply; a specific limit wins over the general one.
  await limitTo("tenant", randomUUID(), "daily", 0);
  await limitTo("site", "*", "monthly", 0, { operation: "youtube_search" });
  await limitTo("site", "*", "monthly", 0, { allowance: "recurring" }); // the site is still onboarding
  await limitTo("tenant", "*", "daily", 0);
  await limitTo("tenant", ws.tenantId, "daily", 1);
  assert.equal(await codeOf(reserveSeoSpend(reserveInput(ws, ["k"]))), "none");
  await prisma.site.update({ where: { id: ws.siteId }, data: { createdAt: new Date(Date.now() - 30 * 86_400_000) } });
  assert.equal(await codeOf(reserveSeoSpend(reserveInput(ws, ["k2"]))), "budget_exhausted", "past onboarding the recurring allowance applies");
  assert.deepEqual((await ws.reservations()).map((row) => [row.allowance, row.state]), [["onboarding", "reserved"]]);
  // The workspace's general spending limit (AI included) also applies.
  await prisma.seoBudget.deleteMany();
  const general = await prisma.costBudget.create({ data: { tenantId: ws.tenantId, period: "daily", limitUsd: 0.001, hardLimitUsd: 0.002, action: "pause" } });
  assert.equal(await codeOf(reserveSeoSpend(reserveInput(ws, ["k3"]))), "budget_exhausted");
  await prisma.costBudget.delete({ where: { id: general.id } });
}));

test("budget exhaustion keeps using stored data, tells the workspace, and authorized extra spend lifts only its own limit", () => governed(async (ws) => {
  const calls: string[][] = [];
  const route = await metricsRoute();
  const ask = (keyword: string, patch: Partial<SeoScope> = {}) => acquireSeo(route, "keyword_metrics", { keywords: [keyword] }, scopeOf(ws, labsFetch(calls), patch));
  await ask("guia tv");
  await limitTo("tenant", ws.tenantId, "monthly", 0.0122);
  assert.equal(await codeOf(ask("otra")), "budget_exhausted");
  assert.equal((await ask("guia tv")).data[0].volume, 100);
  assert.equal(calls.length, 1);
  assert.equal(await prisma.notification.count({ where: { tenantId: ws.tenantId, entityType: "seo_budget" } }), 1);
  const extra = await prisma.seoBudgetAuthorization.create({ data: { scope: "tenant", scopeId: ws.tenantId, period: "monthly", amountUsd: 0.02, reason: "test", expiresAt: new Date(Date.now() + 60_000) } });
  const site = await limitTo("site", ws.siteId, "daily", 0.0122);
  assert.equal(await codeOf(ask("otra")), "budget_exhausted", "the site limit was not lifted");
  await prisma.seoBudget.delete({ where: { id: site.id } });
  assert.equal(await codeOf(ask("otra")), "none");
  await prisma.seoBudgetAuthorization.update({ where: { id: extra.id }, data: { revokedAt: new Date() } });
  assert.equal(await codeOf(ask("una más")), "budget_exhausted");
  assert.equal(calls.length, 2);
}));

test("background work leaves part of the budget to people; a full lane serves the most urgent first", () => governed(async (ws) => {
  await limitTo("tenant", ws.tenantId, "daily", 0.011);
  assert.equal(await codeOf(reserveSeoSpend(reserveInput(ws, ["b"], { priority: "background" }))), "budget_exhausted");
  assert.equal(await codeOf(reserveSeoSpend(reserveInput(ws, ["i"], { priority: "interactive" }))), "none");
  const order: string[] = [];
  let open!: () => void;
  const gate = new Promise<void>((resolve) => (open = resolve));
  const blockers = Array.from({ length: 4 }, () => withSeoSlot("lane-test", "planning", () => gate));
  const queued = (["background", "planning", "interactive"] as const).map((priority) => withSeoSlot("lane-test", priority, async () => void order.push(priority)));
  open();
  await Promise.all([...blockers, ...queued]);
  assert.deepEqual(order, ["interactive", "planning", "background"]);
}));

test("worker processes asking for the same data buy it once, overlapping batches included", () => governed(async (ws) => {
  const requested: string[] = [];
  const server = createServer((request, response) => {
    let body = "";
    request.on("data", (part) => (body += part));
    request.on("end", () => {
      const keywords: string[] = JSON.parse(body)[0].keywords;
      requested.push(...keywords);
      setTimeout(() => response.end(JSON.stringify(labs(keywords.map((keyword) => labsRow(keyword))))), 1500); // slow enough to overlap
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  const work = (keywords: string) => promisify(execFile)(process.execPath, [join(__dirname, "seo-worker.js"), ws.tenantId, ws.siteId, String(port), keywords], { env: process.env }).then(({ stdout }) => JSON.parse(stdout));
  try {
    const results = await Promise.all([work("a,b,c"), work("b,c,d"), work("a,b,c"), work("c,d,e"), work("a,e")]);
    assert.deepEqual(results.map((result) => [result.rows, result.unresolved]), [[3, []], [3, []], [3, []], [3, []], [2, []]]);
    assert.deepEqual([...requested].sort(), ["a", "b", "c", "d", "e"], "each keyword was bought exactly once");
    const reservations = await ws.reservations();
    assert.ok(reservations.every((row) => row.state === "settled" || (row.state === "released" && row.resolution === "already_acquired")));
    assert.equal((await ws.spend()).length, reservations.filter((row) => row.state === "settled").length);
    // Different data, one budget: across processes only what fits is sent.
    requested.length = 0;
    await limitTo("tenant", ws.tenantId, "daily", (await ws.spend()).reduce((sum, row) => sum + row.costUsd, 0) + 0.0245);
    const outcomes = await Promise.all(Array.from({ length: 8 }, (_, i) => work(`solo${i}`).then(() => "bought", (error: { stderr?: string }) => (error.stderr?.includes("budget") ? "refused" : String(error.stderr)))));
    assert.deepEqual([requested.length, outcomes.filter((outcome) => outcome === "bought").length, outcomes.filter((outcome) => outcome === "refused").length], [2, 2, 6]);
  } finally {
    server.close();
  }
}));

test("identical simultaneous requests in one process share one purchase; keyword batches travel together", () => governed(async (ws) => {
  const calls: string[][] = [];
  const route = (await seoRoute("ranked_keywords", "es-ES")) as SeoRoute;
  const slow = (async (url: string, init: RequestInit) => {
    await new Promise((resolve) => setTimeout(resolve, 200));
    return labsFetch(calls, 0.024)(url, init);
  }) as typeof fetch;
  const spellings = ["example.com", "https://www.example.com/", "EXAMPLE.com", "example.com"];
  const results = await Promise.all(spellings.map((domain) => acquireSeo(route, "ranked_keywords", { domain, limit: 100 }, scopeOf(ws, slow))));
  assert.deepEqual([calls, results.map((result) => result.data.length)], [[["example.com"]], [1, 1, 1, 1]]);
  calls.length = 0;
  const metrics = await metricsRoute();
  const batch = await Promise.all([["k1", "k2"], ["K2", "k3"], ["k4"]].map((keywords) => acquireSeo(metrics, "keyword_metrics", { keywords }, scopeOf(ws, labsFetch(calls)))));
  assert.deepEqual([calls, batch.map((result) => result.data.map((row) => row.keyword))], [[["k1", "k2", "k3", "k4"]], [["k1", "k2"], ["k2", "k3"], ["k4"]]]);
}));

test("a job delivered twice, and a test clicked twice, hold and spend once", () => governed(async (ws) => {
  const input = reserveInput(ws, ["job"], { idempotencyKey: `job:${ws.tenantId}` });
  const [first, second] = [await reserveSeoSpend(input), await reserveSeoSpend(input)];
  assert.deepEqual([first.claimed.length, second.reservation, second.busy.length], [1, null, 1]);
  assert.ok(Math.abs((await held(ws)) - 0.01) < 1e-9);
  assert.equal(await dispatchSeoReservation(first.reservation!.id, "dataforseo"), true);
  assert.equal(await dispatchSeoReservation(first.reservation!.id, "dataforseo"), false, "one dispatch per reservation");
  assert.equal(await settleSeoReservation(first.reservation!.id, { actualUsd: 0.008 }), true);
  assert.equal(await settleSeoReservation(first.reservation!.id, { actualUsd: 0.008 }), false, "one ledger entry per reservation");
  assert.equal(await releaseSeoReservation(first.reservation!.id, "late"), false, "a settled request cannot be released");
  assert.equal(await codeOf(reserveSeoSpend(input)), "duplicate_request");
  const ledger = await ws.spend();
  assert.deepEqual(ledger.map((row) => [row.costUsd, row.reservationId]), [[0.008, first.reservation!.id]]);

  const calls: string[][] = [];
  const requestId = randomUUID();
  const verify = () => verifySeoProvider({ providerId: "dataforseo", capability: "keyword_metrics", locale: "es-ES", maxSpendUsd: 0.05, tenantId: ws.tenantId, requestId, fetchImpl: labsFetch(calls) });
  const outcomes = await Promise.all([codeOf(verify()), codeOf(verify())]);
  assert.deepEqual([outcomes.sort(), calls.length], [["duplicate_request", "none"], 1]);
}));

test("a worker lost before dispatch frees its reservation; lost after dispatch it keeps holding the maximum", () => governed(async (ws) => {
  const lose = (id: string) => prisma.seoSpendReservation.update({ where: { id }, data: { leaseUntil: new Date(Date.now() - 1000) } });
  const stateOf = async (id: string) => (await prisma.seoSpendReservation.findUniqueOrThrow({ where: { id } })).state;
  const before = (await reserveSeoSpend(reserveInput(ws, ["before"]))).reservation!.id;
  await lose(before);
  assert.equal(await dispatchSeoReservation(before, "dataforseo"), false, "a worker that comes back late must not send");
  assert.equal((await reserveSeoSpend(reserveInput(ws, ["before"]))).claimed.length, 1, "the data can be asked again");
  assert.equal(await stateOf(before), "released");

  const after = (await reserveSeoSpend(reserveInput(ws, ["after"]))).reservation!.id;
  assert.equal(await dispatchSeoReservation(after, "dataforseo"), true);
  await lose(after);
  await recoverSeoReservations();
  assert.equal(await stateOf(after), "uncertain");
  const again = await reserveSeoSpend(reserveInput(ws, ["after"]));
  assert.deepEqual([again.reservation, again.blocked.map(({ code }) => code)], [null, ["billing_uncertain"]], "possibly billed: not bought again");
  assert.equal(await releaseSeoReservation(after, "nope"), false, "never released by itself");
  await recoverSeoReservations(prisma, new Date(Date.now() + 365 * 86_400_000));
  assert.equal(await stateOf(after), "uncertain", "time does not make it free");
  assert.equal(await resolveUncertainReservation(after, 0.007, "invoice 12", null), true);
  assert.equal(await resolveUncertainReservation(after, 0.007, "invoice 12", null), false);
  assert.deepEqual((await ws.spend()).map((row) => [row.costUsd, row.reservationId]), [[0.007, after]]);

  // The answer arriving after the recovery settles the request with its real cost.
  const late = (await reserveSeoSpend(reserveInput(ws, ["late"]))).reservation!.id;
  await dispatchSeoReservation(late, "dataforseo");
  await lose(late);
  await recoverSeoReservations();
  assert.equal(await settleSeoReservation(late, { actualUsd: 0.004 }), true);
  assert.equal(await stateOf(late), "settled");
}));

test("an ambiguous timeout is not free, is not retried at once and is not stored as 'no demand'", () => governed(async (ws) => {
  let attempts = 0;
  const timeout = (async () => {
    attempts += 1;
    throw new DOMException("timed out", "TimeoutError");
  }) as unknown as typeof fetch;
  const route = await metricsRoute();
  assert.equal(await codeOf(acquireSeo(route, "keyword_metrics", { keywords: ["lenta"] }, scopeOf(ws, timeout))), "timeout");
  const [row] = await ws.reservations();
  assert.deepEqual([row.state, Number(row.maxUsd), row.actualUsd], ["uncertain", 0.01212, null]);
  assert.equal(await codeOf(acquireSeo(route, "keyword_metrics", { keywords: ["lenta"] }, scopeOf(ws, timeout))), "billing_uncertain");
  assert.equal(attempts, 1);
  assert.equal(await prisma.providerCacheEntry.count({ where: { tenantId: ws.tenantId } }), 0);
  await limitTo("tenant", ws.tenantId, "daily", 0.0122);
  assert.equal(await codeOf(acquireSeo(route, "keyword_metrics", { keywords: ["otra"] }, scopeOf(ws, timeout))), "budget_exhausted", "the possible charge counts");
}));

test("failures are told apart, never stored, and open the circuit; an empty answer is stored", () => governed(async (ws) => {
  const route = await metricsRoute();
  const fail = (status: number, body: object) => answering([], () => body, status);
  const reset = () => prisma.seoProviderState.updateMany({ data: { circuitOpenUntil: null, consecutiveFailures: 0 } });
  const cases: Array<[SeoErrorCode, typeof fetch, string, boolean]> = [
    ["invalid_credentials", fail(401, { status_code: 40100 }), "released", true],
    ["insufficient_balance", fail(402, { status_code: 40210 }), "released", true],
    ["rate_limited", fail(429, { status_code: 40202, cost: 0 }), "released", true],
    ["upstream_error", fail(500, { status_code: 50000 }), "uncertain", false],
    ["upstream_error", fail(500, { status_code: 50000, cost: 0.003 }), "settled", false],
  ];
  for (const [index, [code, fetchImpl, state, opens]] of cases.entries()) {
    await reset();
    assert.equal(await codeOf(acquireSeo(route, "keyword_metrics", { keywords: [`f${index}`] }, scopeOf(ws, fetchImpl))), code);
    assert.equal((await ws.reservations()).at(-1)!.state, state, `${code} ${state}`);
    assert.equal(await codeOf(acquireSeo(route, "keyword_metrics", { keywords: ["otra"] }, scopeOf(ws, answering([], () => labs([labsRow("otra")]))))), opens ? "circuit_open" : "none");
    await prisma.providerCacheEntry.deleteMany({ where: { tenantId: ws.tenantId } });
  }
  assert.deepEqual((await ws.spend()).map((row) => row.costUsd).filter((cost) => cost === 0.003), [0.003], "a billed failure is in the ledger");
  // Three provider failures in a row leave it alone; other requests are not sent.
  await reset();
  for (const keyword of ["g1", "g2", "g3"]) await codeOf(acquireSeo(route, "keyword_metrics", { keywords: [keyword] }, scopeOf(ws, fail(503, { cost: 0 }))));
  const sent: string[][] = [];
  assert.equal(await codeOf(acquireSeo(route, "keyword_metrics", { keywords: ["g4"] }, scopeOf(ws, labsFetch(sent)))), "circuit_open");
  assert.equal(sent.length, 0);
  await reset();
  let asked = 0;
  const empty = answering([], () => ((asked += 1), labs([])));
  for (let i = 0; i < 2; i += 1) assert.deepEqual((await acquireSeo(route, "keyword_metrics", { keywords: ["nadie busca"] }, scopeOf(ws, empty))).data, []);
  assert.equal(asked, 1, "a genuine empty answer is not bought twice");
}));

test("the emergency stop and the provider switch win over a reservation already made", () => governed(async (ws) => {
  const calls: string[][] = [];
  const route = await metricsRoute();
  const one = (await reserveSeoSpend(reserveInput(ws, ["one"]))).reservation!.id;
  const two = (await reserveSeoSpend(reserveInput(ws, ["two"]))).reservation!.id;
  await prisma.seoControlSetting.create({ data: { mode: "dataforseo_only", emergencyStop: true } });
  assert.equal(await dispatchSeoReservation(one, "dataforseo"), false);
  assert.equal(await codeOf(reserveSeoSpend(reserveInput(ws, ["three"]))), "emergency_stop");
  assert.equal(await codeOf(acquireSeo(route, "keyword_metrics", { keywords: ["x"] }, scopeOf(ws, labsFetch(calls)))), "emergency_stop");
  assert.deepEqual(await seoRoute("keyword_metrics", "es-ES"), { provider: null, reason: "emergency_stop" });
  assert.equal(await codeOf(verifySeoProvider({ providerId: "dataforseo", capability: "keyword_metrics", locale: "es-ES", maxSpendUsd: 0.05, tenantId: ws.tenantId, fetchImpl: labsFetch(calls) })), "emergency_stop");
  await prisma.seoControlSetting.update({ where: { id: "global" }, data: { emergencyStop: false } });
  await prisma.seoProviderState.upsert({ where: { providerId: "dataforseo" }, create: { providerId: "dataforseo", enabled: false, priority: 10 }, update: { enabled: false } });
  assert.equal(await dispatchSeoReservation(two, "dataforseo"), false);
  assert.equal(calls.length, 0);
}));

test("a disabled provider is not reached as fallback; an enabled one only when fallback is explicitly on, and it is said", () => governed(async (ws) => {
  process.env.ANYAPI_API_KEY = "aa_test";
  try {
    const calls: string[] = [];
    const fetchImpl = answering(calls, (url) => (url.includes("getanyapi") ? { output: { found: true, data: { keywords: [{ keyword: "guia tv", searchVolume: 5 }] } }, costUsd: 0.0145 } : labs([labsRow("guia tv")])));
    const resolve = () => seoRoute("keyword_metrics", "es-ES", { locks: NO_LOCKS });
    const setting = await prisma.seoControlSetting.create({ data: { mode: "dataforseo_only", paidFallback: true } });
    await prisma.seoProviderState.create({ data: { providerId: "dataforseo", enabled: false, priority: 10 } });
    assert.deepEqual(await resolve(), { provider: null, reason: "provider_disabled" }, "AnyAPI is off by default");
    await prisma.seoProviderState.create({ data: { providerId: "anyapi", enabled: true, priority: 20 } });
    await prisma.seoControlSetting.update({ where: { id: setting.id }, data: { paidFallback: false } });
    assert.deepEqual(await resolve(), { provider: null, reason: "provider_disabled" });
    await prisma.seoControlSetting.update({ where: { id: setting.id }, data: { paidFallback: true } });
    assert.deepEqual(await seoRoute("keyword_metrics", "es-ES"), { provider: null, reason: "provider_disabled" }, "locked in code");
    const route = (await resolve()) as SeoRoute;
    const { meta } = await acquireSeo(route, "keyword_metrics", { keywords: ["guia tv"] }, scopeOf(ws, fetchImpl, { locks: NO_LOCKS }));
    assert.deepEqual([meta.providerId, meta.notes.includes("paid_fallback:dataforseo"), calls.length], ["anyapi", true, 1]);
    assert.ok(calls.every((url) => url.includes("getanyapi")), "the disabled provider got nothing");
    // A failed purchase never pays a second provider.
    const failing = answering(calls, () => ({ error: "boom" }), 502);
    assert.equal(await codeOf(acquireSeo(route, "keyword_metrics", { keywords: ["otra"] }, scopeOf(ws, failing, { locks: NO_LOCKS }))), "upstream_error");
    assert.equal(calls.length, 2);
  } finally {
    process.env.ANYAPI_API_KEY = "";
  }
}));

test("an unknown price spends nothing until an administrator records a ceiling; a bill above it closes the operation again", () => governed(async (ws) => {
  const calls: string[] = [];
  const serp = (cost: number) => answering(calls, () => ({ status_code: 20000, cost, tasks: [{ status_code: 20000, result: [{ items: [{ datetime: "2026-11-01", items: [{ type: "organic", url: "https://a.test/1", title: "A", domain: "a.test" }] }] }] }] }));
  const route = (await seoRoute("serp_organic", "es-ES")) as SeoRoute;
  const ask = (keyword: string, cost: number) => acquireSeo(route, "serp_organic", { keyword }, scopeOf(ws, serp(cost)));
  assert.equal(await codeOf(ask("a", 0.001)), "unknown_price");
  assert.deepEqual([calls.length, (await ws.reservations()).length], [0, 0]);
  await prisma.seoControlSetting.create({ data: { mode: "dataforseo_only", pricing: { "dataforseo:serp_organic": { maxRequestUsd: 0.05, source: "invoice", verifiedAt: new Date().toISOString() } } } });
  assert.equal(await codeOf(ask("a", 0.001)), "none");
  const { meta } = await ask("b", 0.2);
  assert.ok(meta.notes.includes("billed_over_quote"));
  assert.deepEqual((await ws.spend()).map((row) => row.costUsd), [0.001, 0.2], "the real bill is in the ledger");
  assert.equal(await codeOf(ask("c", 0.001)), "unknown_price");
  assert.equal(calls.length, 2);
}));

test("what a partial answer leaves out is unknown, and is not bought again at once", () => governed(async (ws) => {
  process.env.ANYAPI_API_KEY = "aa_test";
  try {
    const calls: string[] = [];
    await prisma.seoControlSetting.create({ data: { mode: "anyapi_only" } });
    await prisma.seoProviderState.create({ data: { providerId: "anyapi", enabled: true, priority: 20 } });
    const fetchImpl = answering(calls, () => ({ output: { found: true, data: { keywords: [{ keyword: "guia tv", searchVolume: 5 }, { broken: true }] } }, costUsd: 0.0145 }));
    const route = (await seoRoute("keyword_metrics", "es-ES", { locks: NO_LOCKS })) as SeoRoute;
    const ask = (keywords: string[]) => acquireSeo(route, "keyword_metrics", { keywords }, scopeOf(ws, fetchImpl, { locks: NO_LOCKS }));
    const { data, meta } = await ask(["guia tv", "rota"]);
    assert.deepEqual([data.map((row) => row.keyword), meta.unresolved, meta.partial], [["guia tv"], ["rota"], true]);
    assert.deepEqual([(await ask(["guia tv"])).data.length, await codeOf(ask(["rota"])), calls.length], [1, "retry_cooldown", 1]);
    assert.equal(await prisma.providerCacheEntry.count({ where: { tenantId: ws.tenantId, isNegative: true } }), 0);
  } finally {
    process.env.ANYAPI_API_KEY = "";
  }
}));

test("metrics that came with discovery are reused: the overview is not bought, and only missing keywords are", () => governed(async (ws) => {
  const calls: string[] = [];
  const discovery = answering(calls, () => labs([labsRow("guia tv hoy", 900, 12), { ...labsRow("tdt hoy", 300, null) }, labsRow("sin volumen", null, null)], 0.0124));
  const ideas = (await seoRoute("keyword_suggestions", "es-ES")) as SeoRoute;
  await acquireSeo(ideas, "keyword_suggestions", { seed: "guia tv", limit: 100 }, scopeOf(ws, discovery));
  const bought: string[][] = [];
  const { data, meta } = await acquireSeo(await metricsRoute(), "keyword_metrics", { keywords: ["Guia TV hoy", "tdt hoy", "sin volumen", "nueva"] }, scopeOf(ws, labsFetch(bought)));
  assert.deepEqual(bought, [["nueva"]], "a missing difficulty is not worth a full overview");
  assert.deepEqual(data.map((row) => [row.keyword, row.volume, row.difficulty]), [["guia tv hoy", 900, 12], ["tdt hoy", 300, null], ["sin volumen", null, null], ["nueva", 100, 20]]);
  assert.deepEqual([meta.cache, meta.unresolved], [{ hits: 3, stale: 0, bought: 1 }, []]);
  const entry = await prisma.providerCacheEntry.findFirstOrThrow({ where: { tenantId: ws.tenantId, resourceType: "keyword_overview", cacheKey: { endsWith: "|guia tv hoy" } } });
  const fields = (entry.meta as { fields: Record<string, { via: string; kind: string }> }).fields;
  assert.deepEqual([fields.volume.via, fields.volume.kind], ["keyword_suggestions", "provider_reported"]);
  const snapshots = await prisma.seoSnapshot.findMany({ where: { tenantId: ws.tenantId }, orderBy: { fetchedAt: "asc" } });
  assert.deepEqual(snapshots.map((row) => row.operation), ["keyword_suggestions", "keyword_metrics"]);
  const ids = new Set((await ws.reservations()).map((row) => row.id));
  assert.ok(snapshots.every((row) => ids.has(row.reservationId)) && (await ws.spend()).every((row) => ids.has(row.reservationId!)), "history and ledger point to the reservation");
}));

test("markets, languages and operations never answer for each other", () => governed(async (ws) => {
  const calls: string[][] = [];
  for (const locale of ["es-ES", "es-MX", "en-US", "en-GB"]) await acquireSeo(await metricsRoute(locale), "keyword_metrics", { keywords: ["tv"] }, scopeOf(ws, labsFetch(calls)));
  assert.equal(calls.length, 4);
  const entries = await prisma.providerCacheEntry.findMany({ where: { tenantId: ws.tenantId } });
  assert.equal(new Set(entries.map((row) => row.cacheKey)).size, 4);
  // Same text as keyword, seed and domain, at the same time.
  const [ideas, ranked] = [(await seoRoute("keyword_suggestions", "es-ES")) as SeoRoute, (await seoRoute("ranked_keywords", "es-ES")) as SeoRoute];
  calls.length = 0;
  await Promise.all([acquireSeo(ideas, "keyword_suggestions", { seed: "example.com", limit: 100 }, scopeOf(ws, labsFetch(calls))), acquireSeo(ranked, "ranked_keywords", { domain: "example.com", limit: 100 }, scopeOf(ws, labsFetch(calls)))]);
  assert.equal(calls.length, 2);
  // Another workspace shares nothing: no licence permits it.
  const other = await workspace();
  try {
    await acquireSeo(await metricsRoute(), "keyword_metrics", { keywords: ["tv"] }, scopeOf(other, labsFetch(calls)));
    assert.equal(calls.length, 3);
  } finally {
    await other.remove();
  }
}));

test("stale data is refreshed only for a decision worth its price, and served when it cannot be", () => governed(async (ws) => {
  const calls: string[][] = [];
  const route = await metricsRoute();
  const ask = (patch: Partial<SeoScope> = {}) => acquireSeo(route, "keyword_metrics", { keywords: ["guia tv"] }, scopeOf(ws, labsFetch(calls), patch));
  const age = (days: number) => prisma.providerCacheEntry.updateMany({ where: { tenantId: ws.tenantId }, data: { fetchedAt: new Date(Date.now() - days * 86_400_000), expiresAt: new Date(Date.now() + (90 - days) * 86_400_000) } });
  await ask();
  await age(80);
  assert.deepEqual([(await ask()).meta.freshness, calls.length], ["stale", 1], "nobody is deciding anything with it");
  assert.deepEqual([(await ask({ decision: { importance: "low" } })).meta.freshness, calls.length], ["fresh", 1], "a minor decision accepts older data");
  await age(89);
  await setPolicy({ decisionValueUsd: { normal: 0.001 } });
  assert.deepEqual([(await ask({ decision: {} })).meta.freshness, calls.length], ["stale", 1], "not worth its price");
  await prisma.seoControlSetting.update({ where: { id: "global" }, data: { policy: {}, emergencyStop: true } });
  assert.deepEqual([(await ask({ decision: {} })).data[0].volume, calls.length], [100, 1], "stale is better than nothing");
  await prisma.seoControlSetting.update({ where: { id: "global" }, data: { emergencyStop: false } });
  assert.deepEqual([(await ask({ decision: {} })).meta.freshness, calls.length], ["fresh", 2]);
  await age(91);
  assert.equal(await codeOf(ask({ reuseOnly: true })), "reuse_only", "past retention it is not served");
}));

// ---- Research (SEO-V2-03) ----

const WORDS = ["cine", "estrenos", "infantiles", "coreanas", "policiacas", "historicas", "turcas", "romanticas", "cortas", "britanicas"];
/** DataForSEO answering `rows` relevant keywords per seed or domain; `before` runs while the request is in flight. */
const researchFetch = (calls: string[], options: { rows?: number; cost?: number; before?: (subject: string) => Promise<void> | void; volume?: number } = {}) =>
  (async (url: string, init: RequestInit) => {
    const [task] = JSON.parse(String(init.body));
    const subject: string = task.target ?? task.keywords?.[0] ?? task.keyword;
    calls.push(`${url.includes("ranked_keywords") ? "domain" : url.includes("keyword_overview") ? "metrics" : "seed"}:${subject}`);
    await options.before?.(subject);
    const base = url.includes("ranked_keywords") ? `peliculas ${subject.split(".")[0]}` : subject;
    const keywords: string[] = url.includes("keyword_overview") ? task.keywords : WORDS.slice(0, options.rows ?? 10).map((word) => `${base} ${word}`);
    const items = keywords.map((keyword) => ({ ...labsRow(keyword, options.volume ?? 9000, 10), search_intent_info: { main_intent: "informational" } }));
    return new Response(JSON.stringify(labs(url.includes("ranked_keywords") ? items.map((item) => ({ keyword_data: item, ranked_serp_element: { serp_item: { rank_absolute: 3, url: `https://${subject}/x` } } })) : items, options.cost ?? 0.024)));
  }) as typeof fetch;
async function researchSite(ws: Workspace, policy: object = {}) {
  for (const name of ["series", "television", "futbol"]) await prisma.siteTopicCluster.create({ data: { tenantId: ws.tenantId, siteId: ws.siteId, name, slug: name, pagesCount: 3 } });
  await prisma.competitor.create({ data: { tenantId: ws.tenantId, siteId: ws.siteId, domain: "rival.test", origin: "manual", name: "Rival", status: "accepted", verification: "verified" } });
  await prisma.siteResearchProfile.create({ data: { tenantId: ws.tenantId, siteId: ws.siteId, policy } });
}
const kinds = (run: Awaited<ReturnType<typeof getResearchRun>>, status: string) => run.tasks.filter((task) => task.status === status && task.external).map((task) => task.kind);

test("onboarding research is bounded, persistent and not repeated; planning reads what it found and buys nothing", () => governed(async (ws) => {
  await researchSite(ws, { minOpportunities: 100 });
  const calls: string[] = [];
  const fetchImpl = researchFetch(calls);
  const estimate = await estimateResearch(ws.tenantId, ws.siteId);
  assert.deepEqual([estimate.acquisitions.map((entry) => entry.kind), Math.round(estimate.maxUsd * 1000)], [["discover_seed", "discover_seed", "own_keywords", "competitor_keywords"], 96]);
  assert.equal(calls.length, 0, "an estimate buys nothing");

  const run = await startOnboardingResearch(ws.tenantId, ws.siteId, null, { fetchImpl });
  assert.equal(run.status, "succeeded", JSON.stringify(run.tasks.filter((task) => task.status !== "succeeded")));
  assert.equal(calls.length, 4, "two seeds, the own domain and one competitor at most");
  assert.deepEqual([run.progress, run.cost.requests, Math.round(run.cost.actualUsd * 1000), run.cost.heldUsd], [100, 4, 96, 0]);
  assert.ok(run.cost.actualUsd <= run.maxUsd && run.cost.actualUsd <= run.estimatedUsd! + 1e-9);
  assert.ok((await ws.reservations()).every((row) => row.runId === run.id), "every purchase belongs to its run");
  assert.ok(run.tasks.filter((task) => task.external).every((task) => task.reason && task.billedUsd! > 0));

  // Everything that came back is kept: metrics with provenance, keywords with their sources, opportunities with evidence.
  const metrics = await knownKeywordMetrics(ws.tenantId, { country: "ES", language: "es" }, ["series cine", "series turcas"], { maxAgeDays: 1 });
  assert.deepEqual([metrics.size, metrics.get("series cine")!.volume, metrics.get("series cine")!.providerId], [2, 9000, "dataforseo"]);
  const keywords = await listSiteKeywords(ws.tenantId, ws.siteId, {});
  assert.ok(keywords.length >= 20 && keywords.every((row) => row.discoveries.length > 0));
  assert.ok(keywords.some((row) => row.discoveries.some((entry) => entry.kind === "competitor" && entry.value === "rival.test" && entry.position === 3)));
  const opportunities = await prisma.contentOpportunity.findMany({ where: { tenantId: ws.tenantId, source: "research" } });
  assert.ok(opportunities.length > 5 && opportunities.every((row) => row.researchRunId === run.id && row.analyzedAt), `${opportunities.length}`);
  assert.ok(opportunities.some((row) => row.status === "open" && row.action === "create_content" && row.score! >= 40), JSON.stringify(opportunities[0]));

  // Again, and concurrently: the same run, no request.
  for (const again of await Promise.all([startOnboardingResearch(ws.tenantId, ws.siteId, null, { fetchImpl }), startOnboardingResearch(ws.tenantId, ws.siteId, null, { fetchImpl })])) assert.equal(again.id, run.id);
  assert.equal(calls.length, 4);
  // Another run only buys what nobody answered: the third topic is left; what is known is not asked again.
  const manual = await requestResearch({ tenantId: ws.tenantId, siteId: ws.siteId, trigger: "manual", triggerKey: null, detail: "x", focus: {} });
  await advanceResearchRun(manual.runId, { fetchImpl });
  assert.equal(calls.length, 5);
  assert.equal(new Set(calls).size, 5);

  // Planning: candidates from the inventory, reserved, and not one request, however often.
  const context = await buildEditorialPlanningContext(ws.tenantId, ws.siteId);
  const holder = randomUUID();
  const mine = await collectKeywordCandidates(ws.tenantId, ws.siteId, context, 60, { reserveFor: holder, reserve: 3 });
  assert.ok(mine.length === 3 && mine.every((candidate) => candidate.opportunityId));
  const others = await collectKeywordCandidates(ws.tenantId, ws.siteId, context, 60, { reserveFor: randomUUID(), reserve: 3 });
  assert.equal(others.filter((candidate) => mine.some((held) => held.keyword === candidate.keyword)).length, 0);
  for (let i = 0; i < 5; i += 1) await collectKeywordCandidates(ws.tenantId, ws.siteId, context, 60);
  assert.equal((await requestPlanningResearch(ws.tenantId, ws.siteId, 100, null, { fetchImpl })).state, "researched_recently", "nothing more is bought for a plan");
  assert.equal(calls.length, 5);
}));

test("a plan without enough knowledge asks for research once; with enough it asks for none", () => governed(async (ws) => {
  await researchSite(ws, { minOpportunities: 5 });
  const calls: string[] = [];
  const fetchImpl = researchFetch(calls);
  assert.equal((await requestPlanningResearch(ws.tenantId, ws.siteId, 4, null, { fetchImpl, unattended: true })).state, "not_authorized", "automation may not start it unless the platform says so");
  assert.equal(calls.length, 0);
  const asked = await requestPlanningResearch(ws.tenantId, ws.siteId, 4, null, { fetchImpl });
  const run = await getResearchRun(ws.tenantId, ws.siteId, asked.runId!);
  assert.deepEqual([run.trigger, run.status, calls.length], ["pending_decision", "succeeded", 1]);
  assert.deepEqual([...new Set(run.tasks.filter((task) => task.status === "skipped").map((task) => task.reason))], ["enough_opportunities"], "early stopping");
  assert.ok(["sufficient", "researched_recently"].includes((await requestPlanningResearch(ws.tenantId, ws.siteId, 4, null, { fetchImpl })).state));
  assert.equal(calls.length, 1);
  await prisma.siteResearchProfile.update({ where: { siteId: ws.siteId }, data: { policy: { mode: "manual", minOpportunities: 100 } } });
  assert.equal((await requestPlanningResearch(ws.tenantId, ws.siteId, 50, null, { fetchImpl })).state, "turned_off", "only people start it");
}));

test("a run stays within its own limit and the governor's; what was refused can be retried", () => governed(async (ws) => {
  await researchSite(ws, { minOpportunities: 100 });
  const calls: string[] = [];
  const fetchImpl = researchFetch(calls);
  const request = async (maxUsd?: number) => (await requestResearch({ tenantId: ws.tenantId, siteId: ws.siteId, trigger: "manual", triggerKey: null, detail: "x", focus: {}, maxUsd })).runId;
  const small = await request(0.03);
  await advanceResearchRun(small, { fetchImpl });
  let run = await getResearchRun(ws.tenantId, ws.siteId, small);
  assert.deepEqual([run.status, calls.length, run.tasks.filter((task) => task.reason === "run_limit").length], ["partial", 1, 3]);
  await limitTo("tenant", ws.tenantId, "daily", 0.03);
  const second = await request();
  await advanceResearchRun(second, { fetchImpl });
  run = await getResearchRun(ws.tenantId, ws.siteId, second);
  assert.deepEqual([run.status, calls.length], ["partial", 1]);
  assert.ok(run.tasks.filter((task) => task.status === "skipped").every((task) => task.reason === "budget_exhausted"));
  // The budget is raised and a person retries: only what was not bought is bought.
  await prisma.seoBudget.deleteMany({ where: { scopeId: ws.tenantId } });
  await controlResearchRun(ws.tenantId, ws.siteId, second, "retry", null);
  await advanceResearchRun(second, { fetchImpl });
  run = await getResearchRun(ws.tenantId, ws.siteId, second);
  assert.deepEqual([run.status, kinds(run, "succeeded").length, new Set(calls).size === calls.length], ["succeeded", 4, true]);
}));

test("cancelling or pausing stops the next request; the one in flight is accounted for", () => governed(async (ws) => {
  await researchSite(ws, { minOpportunities: 100 });
  const request = async () => (await requestResearch({ tenantId: ws.tenantId, siteId: ws.siteId, trigger: "manual", triggerKey: null, detail: "x", focus: {} })).runId;
  const calls: string[] = [];
  const cancelled = await request();
  await advanceResearchRun(cancelled, { fetchImpl: researchFetch(calls, { before: async () => void (await controlResearchRun(ws.tenantId, ws.siteId, cancelled, "cancel", null)), rows: 2 }) });
  let run = await getResearchRun(ws.tenantId, ws.siteId, cancelled);
  assert.deepEqual([run.status, calls.length], ["cancelled", 1]);
  assert.equal(Math.round(run.cost.actualUsd * 1000), 24, "what had left is paid for");
  assert.equal(run.cost.heldUsd, 0);
  assert.ok(run.tasks.some((task) => task.status === "cancelled"));
  const sent = calls.length;
  assert.equal(await advanceResearchRun(cancelled, { fetchImpl: researchFetch(calls) }), null);
  assert.equal(calls.length, sent);

  // The last check before sending looks at the run itself, so a stopped one cannot be raced.
  const paused = await request();
  await prisma.seoResearchRun.update({ where: { id: paused }, data: { status: "running" } });
  const one = (await reserveSeoSpend(reserveInput(ws, ["run-a"], { runId: paused }))).reservation!.id;
  const two = (await reserveSeoSpend(reserveInput(ws, ["run-b"], { runId: paused }))).reservation!.id;
  assert.equal(await dispatchSeoReservation(one, "dataforseo"), true);
  await controlResearchRun(ws.tenantId, ws.siteId, paused, "pause", null);
  assert.equal(await dispatchSeoReservation(two, "dataforseo"), false);
  await releaseSeoReservation(two, "test");
  await settleSeoReservation(one, { actualUsd: 0.007 });
  assert.deepEqual([Math.round((await runCost(paused)).actualUsd * 1000), (await runCost(paused)).heldUsd], [7, 0]);
  assert.equal(await advanceResearchRun(paused, { fetchImpl: researchFetch(calls) }), null, "paused");
  await controlResearchRun(ws.tenantId, ws.siteId, paused, "resume", null);
  await advanceResearchRun(paused, { fetchImpl: researchFetch(calls) });
  run = await getResearchRun(ws.tenantId, ws.siteId, paused);
  assert.equal(run.status, "succeeded", JSON.stringify(run.tasks));
}));

test("a lost worker, concurrent workers and the emergency stop repeat and lose nothing", () => governed(async (ws) => {
  await researchSite(ws, { minOpportunities: 100 });
  const calls: string[] = [];
  const runId = (await requestResearch({ tenantId: ws.tenantId, siteId: ws.siteId, trigger: "manual", triggerKey: null, detail: "x", focus: {} })).runId;
  const set = (active: boolean) => prisma.seoControlSetting.upsert({ where: { id: "global" }, create: { id: "global", mode: "dataforseo_only", emergencyStop: active }, update: { emergencyStop: active } });
  await set(true);
  assert.equal(await advanceResearchRun(runId, { fetchImpl: researchFetch(calls) }), null);
  assert.deepEqual(await runResearchTick({ fetchImpl: researchFetch(calls) }), { advanced: 0, checked: 0 });
  await set(false);
  // The stop arrives while a request is being answered: the next one waits.
  await advanceResearchRun(runId, { fetchImpl: researchFetch(calls, { before: async () => void (await set(true)) }) });
  let run = await getResearchRun(ws.tenantId, ws.siteId, runId);
  assert.deepEqual([run.status, calls.length], ["queued", 1]);
  await set(false);
  // The worker died in the middle of a step that had already bought its data.
  await prisma.seoResearchTask.updateMany({ where: { runId, kind: "discover_seed", status: "succeeded" }, data: { status: "running", result: {} } });
  await prisma.seoResearchRun.update({ where: { id: runId }, data: { status: "running", leaseId: randomUUID(), leaseUntil: new Date(Date.now() - 1), nextAt: null } });
  const states = await Promise.all(Array.from({ length: 4 }, () => advanceResearchRun(runId, { fetchImpl: researchFetch(calls) })));
  assert.equal(states.filter((state) => state !== null).length, 1, "one worker holds it");
  run = await getResearchRun(ws.tenantId, ws.siteId, runId);
  assert.equal(run.status, "succeeded", JSON.stringify(run.tasks));
  assert.deepEqual([calls.length, new Set(calls).size], [4, 4], "the step that was done was read back, not bought again");
}));

test("a worker starts research by itself only when the platform allows it", () => governed(async (ws) => {
  await researchSite(ws);
  assert.equal(await checkSiteResearch(ws.tenantId, ws.siteId), null, "off by default");
  await setPolicy({ automaticResearch: true });
  await prisma.siteResearchProfile.update({ where: { siteId: ws.siteId }, data: { policy: { mode: "manual" } } });
  assert.equal(await checkSiteResearch(ws.tenantId, ws.siteId), null, "the site opted out");
  await prisma.siteResearchProfile.update({ where: { siteId: ws.siteId }, data: { policy: {} } });
  const started = (await checkSiteResearch(ws.tenantId, ws.siteId))!;
  assert.deepEqual([started.created, (await getResearchRun(ws.tenantId, ws.siteId, started.runId)).trigger], [true, "insufficient_opportunities"]);
}));

test("regenerated plans, edits and repeated interactions buy nothing new", () => governed(async (ws) => {
  await researchSite(ws, { minOpportunities: 100 });
  const calls: string[] = [];
  const fetchImpl = researchFetch(calls);
  await startOnboardingResearch(ws.tenantId, ws.siteId, null, { fetchImpl });
  const spent = calls.length;
  const context = await buildEditorialPlanningContext(ws.tenantId, ws.siteId);
  const plan = () => collectKeywordCandidates(ws.tenantId, ws.siteId, context, 60);
  const first = (await plan()).map((candidate) => candidate.keyword);
  assert.ok(first.length > 0);
  for (let i = 0; i < 5; i += 1) assert.deepEqual((await plan()).map((candidate) => candidate.keyword), first);
  await Promise.all(Array.from({ length: 10 }, () => plan()));
  assert.equal(calls.length, spent);

  const planRow = await prisma.editorialPlan.create({ data: { tenantId: ws.tenantId, siteId: ws.siteId, name: "p", dateFrom: new Date(), dateTo: new Date() } });
  const item = (primaryKeyword: string) => prisma.editorialPlanItem.create({ data: { tenantId: ws.tenantId, planId: planRow.id, siteId: ws.siteId, title: primaryKeyword, channel: "website", primaryKeyword } });
  const [known, unknown] = [await item("series cine"), await item("palabra escrita a mano")];
  assert.equal(await enrichPlanItemsWithKeywordMetrics(ws.tenantId, planRow.id, fetchImpl, { reuseOnly: true }), 1, "editing uses what discovery brought");
  assert.equal((await prisma.editorialPlanItem.findUniqueOrThrow({ where: { id: known.id } })).searchVolume, 9000);
  assert.equal((await prisma.editorialPlanItem.findUniqueOrThrow({ where: { id: unknown.id } })).keywordMetricsSource, null);
  assert.equal(calls.length, spent);
}));

test("governor administration: platform admins only, validated, audited, effective at once", () => governed(async (ws) => {
  const email = `${randomUUID().slice(0, 8)}@example.test`;
  const account = await prisma.studioAccount.create({ data: { email, displayName: "SEO admin", status: "active" } });
  const user = await prisma.studioUser.create({ data: { tenantId: ws.tenantId, accountId: account.id, email, displayName: "SEO admin", status: "active" } });
  const app = Fastify();
  registerStudioRoutes(app);
  const call = async (method: "GET" | "PUT" | "POST" | "DELETE", url: string, payload?: object) => {
    const ids = { tenantId: ws.tenantId, userId: user.id, sessionId: randomUUID() };
    const permissions = ["content:read"];
    const timestamp = String(Date.now());
    const signature = buildStudioProxySignature({ ...ids, permissions, timestamp, method, url });
    const response = await app.inject({ method, url, payload: method === "GET" || method === "DELETE" ? undefined : payload ?? {}, headers: { [STUDIO_TENANT_HEADER]: ids.tenantId, [STUDIO_USER_HEADER]: ids.userId, [STUDIO_SESSION_HEADER]: ids.sessionId, [STUDIO_PERMISSIONS_HEADER]: permissions.join(","), [STUDIO_TIMESTAMP_HEADER]: timestamp, [STUDIO_SIGNATURE_HEADER]: signature, "x-studio-site-id": randomUUID() } });
    return { status: response.statusCode, body: JSON.parse(response.body || "{}") };
  };
  const calls: string[][] = [];
  const route = await metricsRoute();
  const ask = async (keyword: string) => codeOf(acquireSeo(route, "keyword_metrics", { keywords: [keyword] }, scopeOf(ws, labsFetch(calls))));
  try {
    process.env.PLATFORM_ADMIN_EMAILS = "";
    for (const [method, path] of [["GET", "governor"], ["GET", "ledger"], ["PUT", "emergency-stop"], ["PUT", "budgets"], ["POST", "authorizations"], ["DELETE", `authorizations/${randomUUID()}`], ["POST", `reservations/${randomUUID()}/resolve`], ["PUT", "pricing"], ["PUT", "policy"]] as const) {
      assert.equal((await call(method, `/v2/admin/seo/${path}`)).status, 403, path);
    }
    process.env.PLATFORM_ADMIN_EMAILS = email;
    assert.equal(await ask("uno"), "none");
    const view = await call("GET", "/v2/admin/seo/governor");
    assert.equal(view.status, 200);
    const tenantUse = view.body.use.find((row: { scope: string; scopeId: string }) => row.scope === "tenant" && row.scopeId === ws.tenantId);
    assert.deepEqual([tenantUse.actualUsd, tenantUse.heldUsd, tenantUse.remainingUsd], [0.0121, 0, 5 - 0.0121]);
    assert.equal(view.body.pricing.entries.find((row: { providerId: string; capability: string }) => row.providerId === "dataforseo" && row.capability === "serp_organic").status, "unknown");

    const key = { scope: "tenant", scopeId: ws.tenantId, period: "monthly" };
    for (const bad of [{ ...key, scope: "x", limitUsd: 1 }, { ...key, period: "weekly", limitUsd: 1 }, { ...key, limitUsd: -1 }, { ...key, limitUsd: "1" }, { ...key, scopeId: "x", limitUsd: 1 }, { ...key, operation: "x", limitUsd: 1 }, { ...key }]) assert.equal((await call("PUT", "/v2/admin/seo/budgets", bad)).status, 400, JSON.stringify(bad));
    assert.equal((await call("PUT", "/v2/admin/seo/budgets", { ...key, limitUsd: 0.0122 })).status, 200);
    assert.equal(await ask("dos"), "budget_exhausted");
    for (const bad of [{ amountUsd: 0, days: 1, reason: "r" }, { amountUsd: 1000, days: 1, reason: "r" }, { amountUsd: 1, days: 400, reason: "r" }, { amountUsd: 1, days: 1, reason: " " }]) assert.equal((await call("POST", "/v2/admin/seo/authorizations", { ...key, ...bad })).status, 400);
    const granted = await call("POST", "/v2/admin/seo/authorizations", { ...key, amountUsd: 1, days: 1, reason: "campaign" });
    assert.equal(granted.status, 201);
    assert.equal(await ask("dos"), "none");
    assert.equal((await call("DELETE", `/v2/admin/seo/authorizations/${granted.body.id}`)).status, 200);
    assert.equal(await ask("tres"), "budget_exhausted");
    assert.equal((await call("PUT", "/v2/admin/seo/budgets", { ...key, limitUsd: null })).status, 200);
    assert.equal(await ask("tres"), "none");

    const lost = (await reserveSeoSpend(reserveInput(ws, ["lost"]))).reservation!.id;
    await dispatchSeoReservation(lost, "dataforseo");
    assert.equal((await call("POST", `/v2/admin/seo/reservations/${lost}/resolve`, { actualUsd: 0, note: "x" })).status, 409, "still in flight");
    await prisma.seoSpendReservation.update({ where: { id: lost }, data: { leaseUntil: new Date(0) } });
    assert.deepEqual((await call("GET", "/v2/admin/seo/governor")).body.uncertain.map((row: { id: string }) => row.id), [lost]);
    assert.equal((await call("POST", `/v2/admin/seo/reservations/${lost}/resolve`, { actualUsd: 0.005 })).status, 400, "a note is required");
    assert.equal((await call("POST", `/v2/admin/seo/reservations/${lost}/resolve`, { actualUsd: 0.005, note: "provider statement" })).status, 200);
    const ledger = await call("GET", "/v2/admin/seo/ledger");
    assert.deepEqual(ledger.body.items.filter((row: { tenantId: string }) => row.tenantId === ws.tenantId).map((row: { state: string; actualUsd: number }) => [row.state, row.actualUsd]), [["settled", 0.005], ["settled", 0.0121], ["settled", 0.0121], ["settled", 0.0121]]);

    assert.equal((await call("PUT", "/v2/admin/seo/control", { paidFallback: true })).status, 409);
    assert.equal((await call("PUT", "/v2/admin/seo/pricing", { providerId: "dataforseo", capability: "serp_organic", maxRequestUsd: 0.05 })).status, 400, "a source is required");
    assert.equal((await call("PUT", "/v2/admin/seo/pricing", { providerId: "dataforseo", capability: "serp_organic", maxRequestUsd: 0.05, source: "invoice" })).status, 200);
    assert.equal((await call("PUT", "/v2/admin/seo/policy", { policy: { freshnessDays: { keyword_metrics: 60 } } })).body.freshness.keyword_metrics.days, 60);
    assert.equal((await call("PUT", "/v2/admin/seo/emergency-stop", {})).status, 400);
    assert.equal((await call("PUT", "/v2/admin/seo/emergency-stop", { active: true, reason: "drill" })).status, 200);
    assert.equal(await ask("cuatro"), "emergency_stop");
    assert.equal((await call("PUT", "/v2/admin/seo/emergency-stop", { active: false })).status, 200);
    assert.equal(await ask("cuatro"), "none");
    const audits = (await prisma.auditLog.findMany({ where: { tenantId: ws.tenantId, action: { startsWith: "seo." } } })).map((entry) => entry.action);
    for (const action of ["seo.budget.updated", "seo.budget.authorized", "seo.budget.authorization_revoked", "seo.reservation.resolved", "seo.pricing.updated", "seo.policy.updated", "seo.emergency_stop.activated", "seo.emergency_stop.lifted"]) assert.ok(audits.includes(action), action);
  } finally {
    await app.close();
    await prisma.auditLog.deleteMany({ where: { tenantId: ws.tenantId } });
    await prisma.studioUser.delete({ where: { id: user.id } });
    await prisma.studioAccount.delete({ where: { id: account.id } });
  }
}));

// ---- Editorial integration (SEO-V2-05) ----

const TEXT_ENV = { TEXT_PROVIDER: "openai", TEXT_API_BASE_URL: "https://text.example", TEXT_API_KEY: "fixture", TEXT_MODEL: "test" };
type Outside = { seo: string[]; pages: string[]; serpStatus: number; serpResults: number };

/** Everything outside, replaced: DataForSEO, Tavily, the text model (writes the keywords it is handed, then its own), and the pages of the results. */
async function withOutside(run: (outside: Outside) => Promise<void>, env: Record<string, string> = {}) {
  const outside: Outside = { seo: [], pages: [], serpStatus: 200, serpResults: 8 };
  const all = { ...TEXT_ENV, TAVILY_API_KEY: "test", WEB_INTELLIGENCE_PROVIDER: "tavily", ...env };
  const saved = Object.fromEntries(Object.keys(all).map((name) => [name, process.env[name]]));
  Object.assign(process.env, all);
  const original = globalThis.fetch;
  let invented = 0;
  globalThis.fetch = (async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.startsWith("https://text.example")) {
      const prompt = JSON.stringify(JSON.parse(String(init.body)));
      const count = Number(/Generate exactly (\d+) editorial/.exec(prompt)?.[1] ?? 1);
      const block = prompt.split("KEYWORDS ARE FIXED")[1] ?? "";
      const handed = [...block.matchAll(/\\n- \\"(.+?)\\"/g)].map((match) => match[1]);
      const keywords = [...handed, ...Array.from({ length: Math.max(0, count - handed.length) }, () => `series de television en streaming canal tema ${"abcdefghijklmnopqrstuvwxyz"[invented % 26]}${++invented}`)].slice(0, count);
      const items = keywords.map((keyword, index) => ({
        scheduledFor: new Date(Date.now() + (index + 1) * 86_400_000).toISOString(), channel: "website", contentType: "guide", newsOrEvergreen: "evergreen", topic: "series", topicCluster: "series",
        workingTitle: `${keyword[0].toUpperCase()}${keyword.slice(1)} ${invented}${index}`, primaryIntent: "informational", secondaryIntents: [], targetQuery: keyword, primaryKeyword: keyword, secondaryKeywords: [], semanticKeywords: [], relatedEntities: [], questionsToAnswer: [],
        suggestedSlug: keyword.replace(/\s+/g, "-"), recommendedWordCountMin: 1200, recommendedWordCountMax: 2000, outline: [{ heading: "Qué es", subpoints: [] }, { heading: "Cómo elegir", subpoints: [] }, { heading: "Preguntas", subpoints: [] }],
        suggestedInternalLinks: [], suggestedExternalEvidenceTypes: [], faqCandidates: [], schemaTypes: [], suggestedHashtags: [], freshnessRequirement: "low", opportunityScore: 50, relevanceScore: 80, confidence: 0.8, difficultyEstimate: 5, funnelStage: "top", cannibalizationRisk: "none", rationale: "serie con demanda medida", sourceEvidence: [], priority: 1,
      }));
      return Response.json({ choices: [{ message: { content: JSON.stringify({ schemaVersion: "2", items }) }, finish_reason: "stop" }], usage: { prompt_tokens: 1, completion_tokens: 1 } });
    }
    if (url.includes("dataforseo.com")) {
      const [task] = JSON.parse(String(init.body));
      outside.seo.push(`${url.split("/v3/")[1]}:${task.keyword ?? task.target ?? task.keywords?.[0]}`);
      if (outside.serpStatus !== 200) return new Response("{}", { status: outside.serpStatus });
      const results = Array.from({ length: outside.serpResults }, (_, index) => ({ type: "organic", url: `https://93.184.216.${30 + index}/a`, title: `Cómo elegir series ${index}`, domain: `93.184.216.${30 + index}`, description: "d" }));
      return Response.json(labs([{ datetime: "2026-11-20 00:00:00 +00:00", items: results }], 0.002));
    }
    if (url.includes("api.tavily.com")) {
      outside.seo.push(`tavily:${JSON.parse(String(init.body)).query}`);
      return Response.json({ results: [{ url: "https://found.test/a", title: "F", content: "c" }] });
    }
    outside.pages.push(url);
    return new Response(`<html><body><main><p>${"Las series de misterio de 2026 suman 40 estrenos en España según el recuento anual. ".repeat(30)}</p></main></body></html>`, { status: 200, headers: { "content-type": "text/html" } });
  }) as typeof fetch;
  try {
    await run(outside);
  } finally {
    globalThis.fetch = original;
    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}

/** The price of a stored SERP is unknown until an administrator records a maximum. */
const pricedSerp = (patch: object = {}) => {
  const data = { mode: "dataforseo_only", pricing: { "dataforseo:serp_organic": { maxRequestUsd: 0.01, source: "test", verifiedAt: "2026-11-25" } }, ...patch };
  return prisma.seoControlSetting.upsert({ where: { id: "global" }, create: { id: "global", ...data }, update: data });
};

async function articleItem(ws: Workspace, patch: object = {}) {
  const plan = await prisma.editorialPlan.create({ data: { tenantId: ws.tenantId, siteId: ws.siteId, name: "p", status: "ready", dateFrom: new Date(), dateTo: new Date(Date.now() + 30 * 86_400_000) } });
  return prisma.editorialPlanItem.create({
    data: { tenantId: ws.tenantId, planId: plan.id, siteId: ws.siteId, title: "Guía de series de misterio", channel: "website", status: "approved", scheduledFor: new Date(Date.now() + 5 * 86_400_000), primaryKeyword: "series de misterio", contentType: "guide", newsOrEvergreen: "evergreen", outline: ["Qué ver", "Para quién"], ...patch },
  });
}

async function withProduction(run: () => Promise<void>) {
  setArticleWriterFactory(() => new FakeWriter());
  setProductionStageOverrides({ requestImage: async () => undefined, requestInlineImages: async () => undefined });
  try {
    await run();
  } finally {
    setArticleWriterFactory(null);
    setProductionStageOverrides(null);
  }
}
const dropProduction = async (ws: Workspace) => {
  const where = { tenantId: ws.tenantId };
  for (const model of ["productionJob", "articleGeneration", "publicationAttempt", "publication", "contentVersion", "editorialPlanItem", "contentProject", "editorialPlan", "operation", "automationPolicy"] as const) await (prisma[model] as unknown as { deleteMany(args: unknown): Promise<unknown> }).deleteMany({ where });
};
const produced = (body: (ws: Workspace, outside: Outside) => Promise<void>, env: Record<string, string> = {}) => governed((ws) => withOutside((outside) => withProduction(async () => {
  try {
    await body(ws, outside);
  } finally {
    await dropProduction(ws);
  }
}), env));
const settled = async (ws: Workspace, jobId: string) => {
  for (let i = 0; i < 150; i += 1) {
    const job = (await getProductionJob(ws.tenantId, jobId))!;
    if (!["queued", "running"].includes(job.status)) return job;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return assert.fail("the job did not finish");
};
type Research = { serp: { state: string; reason: string; code: string | null; dataKind: string | null }; video: { state: string }; pagesRead: number; leads: number };
const researchOf = (job: { summary: Record<string, unknown> }) => job.summary.research as Research;

test("an article buys its search results once: retry, regeneration, calendar, editing and reading buy nothing", () => produced(async (ws, outside) => {
  await pricedSerp();
  const item = await articleItem(ws);
  const first = await startProduction(ws.tenantId, { kind: "plan_item", planItemId: item.id }, { wait: true });
  assert.equal(first.job.status, "needs_review", `${first.job.error}`);
  assert.deepEqual([researchOf(first.job).serp.state, researchOf(first.job).serp.reason, researchOf(first.job).serp.dataKind], ["acquired", "insufficient_sources", "historical"]);
  assert.ok(researchOf(first.job).pagesRead > 0, JSON.stringify(researchOf(first.job)));
  assert.equal(outside.seo.length, 1);
  const [reservation] = await ws.reservations();
  assert.deepEqual([reservation.operation, reservation.kind, reservation.state], ["serp_organic", "serp_sources", "settled"]);
  assert.equal((await ws.spend()).length, 1, "and it is in the ledger");
  const pages = outside.pages.length;

  // Nothing stored can answer any more: what the article already has must be enough.
  await prisma.providerCacheEntry.deleteMany({ where: { tenantId: ws.tenantId } });
  await reviewProductionJob(ws.tenantId, first.job.id, { decision: "reject", notes: "otra vez" });
  const retried = await retryProductionJob(ws.tenantId, first.job.id, { wait: true });
  assert.deepEqual([retried.status, researchOf(retried).serp.state], ["needs_review", "reused"]);
  const rerun = await settled(ws, (await startProductionForProject(ws.tenantId, first.job.projectId!, { feedback: "Más corto" })).id);
  assert.deepEqual([rerun.status, researchOf(rerun).serp.state, researchOf(rerun).pagesRead], ["needs_review", "reused", researchOf(first.job).pagesRead]);
  await updateEditorialPlanItem(ws.tenantId, item.id, { scheduledFor: new Date(Date.now() + 9 * 86_400_000) } as never);
  await updateEditorialPlanItem(ws.tenantId, item.id, { angle: "Otro enfoque" } as never);
  await listSeoOpportunities(ws.tenantId, ws.siteId);
  await getMonthPlan(ws.tenantId, ws.siteId);
  assert.deepEqual([outside.seo.length, outside.pages.length], [1, pages], "not one request, not even to read a page again");

  // A person may ask for fresh data; then it is bought, within the limits.
  const fresh = await settled(ws, (await startProductionForProject(ws.tenantId, first.job.projectId!, { feedback: "x", refreshResearch: true })).id);
  assert.deepEqual([researchOf(fresh).serp.state, outside.seo.length], ["acquired", 2]);
}));

test("enough evidence buys nothing; a question that moves is not answered with stored results of another date", () => produced(async (ws, outside) => {
  await pricedSerp();
  await prisma.sitePlanningSettings.create({ data: { tenantId: ws.tenantId, siteId: ws.siteId, articlesPerDay: 1, weekdays: [1, 3], publishTimes: [], channels: ["website"], articleTargets: { externalLinks: 2 } } });
  const evidence = [1, 2, 3].map((n) => ({ sourceType: "source", url: `https://medio${n}.test/a`, title: `Dato ${n} sobre series de misterio` }));
  const measured = await articleItem(ws, { sourceEvidence: evidence, metadata: { selection: { source: "dataforseo", intent: "informational" } } });
  const done = await startProduction(ws.tenantId, { kind: "plan_item", planItemId: measured.id }, { wait: true });
  assert.deepEqual([researchOf(done.job).serp.state, researchOf(done.job).serp.reason, outside.seo.length], ["not_needed", "enough_evidence", 0]);

  // Buying a stored snapshot for news is refused; the draft says so and never publishes itself.
  await prisma.automationPolicy.deleteMany({ where: { tenantId: ws.tenantId } });
  const policy = await getOrCreatePolicy(ws.tenantId, ws.siteId);
  await prisma.automationPolicy.update({ where: { id: policy.id }, data: { mode: "autopilot", enabled: true, autoGenerate: true, autoApprove: true, autoSchedule: true, autoPublish: true } });
  const news = await articleItem(ws, { newsOrEvergreen: "news", contentType: "news", title: "Estreno de hoy", primaryKeyword: "estreno serie hoy" });
  const held = await startProduction(ws.tenantId, { kind: "plan_item", planItemId: news.id }, { wait: true });
  assert.equal(outside.seo.length, 0);
  assert.deepEqual([researchOf(held.job).serp.state, researchOf(held.job).serp.code], ["unavailable", "historical_only"]);
  if (held.job.status !== "failed") assert.deepEqual([held.job.status, held.job.summary.held], ["needs_review", "no_fresh_evidence"]);
  assert.ok((held.job.summary.degraded as string[]).includes("no_fresh_evidence"));
  assert.equal(await prisma.publication.count({ where: { tenantId: ws.tenantId, projectId: held.job.projectId! } }), 0);
}));

test("every configuration writes its article, and says what it lacked", async () => {
  type Case = { name: string; control?: object; env?: Record<string, string>; site?: object; prepare?: (ws: Workspace, outside: Outside) => Promise<unknown>; state: string; code?: string | null; calls: number };
  const cases: Case[] = [
    { name: "new website, no Search Console", state: "acquired", calls: 1 },
    { name: "established website", site: { createdAt: new Date(Date.now() - 400 * 86_400_000) }, state: "acquired", calls: 1 },
    { name: "editorial publisher", site: { type: "tecnoria" }, state: "acquired", calls: 1 },
    { name: "service business", site: { type: "talkaris" }, state: "acquired", calls: 1 },
    { name: "disconnected credentials", env: { DATAFORSEO_LOGIN: "", DATAFORSEO_PASSWORD: "" }, state: "unavailable", code: "not_configured", calls: 0 },
    { name: "exhausted SEO budget", prepare: (ws) => limitTo("site", ws.siteId, "daily", 0), state: "unavailable", code: "budget_exhausted", calls: 0 },
    { name: "AnyAPI only (automation locked)", control: { mode: "anyapi_only" }, env: { ANYAPI_API_KEY: "aa_test" }, prepare: () => prisma.seoProviderState.create({ data: { providerId: "anyapi", enabled: true, priority: 1 } }), state: "unavailable", code: "paid_automation_locked", calls: 0 },
    { name: "external providers disabled", control: { mode: "disabled" }, state: "unavailable", code: "external_disabled", calls: 0 },
    { name: "emergency stop", control: { emergencyStop: true }, state: "unavailable", code: "emergency_stop", calls: 0 },
    { name: "outage while preparing", prepare: async (_ws, outside) => { outside.serpStatus = 500; }, state: "unavailable", calls: 1 },
    { name: "no balance", prepare: async (_ws, outside) => { outside.serpStatus = 402; }, state: "unavailable", calls: 1 },
    { name: "unknown price", control: { pricing: {} }, state: "unavailable", code: "unknown_price", calls: 0 },
  ];
  for (const entry of cases) {
    await produced(async (ws, outside) => {
      await pricedSerp(entry.control ?? {});
      if (entry.site) await prisma.site.update({ where: { id: ws.siteId }, data: entry.site });
      await entry.prepare?.(ws, outside);
      const item = await articleItem(ws);
      const { job } = await startProduction(ws.tenantId, { kind: "plan_item", planItemId: item.id }, { wait: true });
      assert.equal(job.status, "needs_review", `${entry.name}: ${job.errorCode} ${job.error}`);
      assert.equal(researchOf(job).serp.state, entry.state, `${entry.name}: ${JSON.stringify(researchOf(job))}`);
      if (entry.code !== undefined) assert.equal(researchOf(job).serp.code, entry.code, entry.name);
      assert.equal(outside.seo.length, entry.calls, entry.name);
      assert.equal(entry.state === "unavailable", (job.summary.degraded as string[] | undefined)?.some((code) => code.startsWith("sources_")) ?? false, entry.name);
      assert.equal((await ws.reservations()).filter((row) => row.state === "reserved" || row.state === "dispatched").length, 0, `${entry.name}: nothing left in flight`);
    }, entry.env);
  }
});

test("what an outage did not give is tried again by a retry; stored data keeps working without a provider", () => produced(async (ws, outside) => {
  await pricedSerp();
  outside.serpStatus = 429;
  const item = await articleItem(ws);
  const first = await startProduction(ws.tenantId, { kind: "plan_item", planItemId: item.id }, { wait: true });
  assert.equal(researchOf(first.job).serp.state, "unavailable");
  outside.serpStatus = 200;
  await prisma.seoAcquisitionLease.deleteMany({ where: { reservationId: { in: (await ws.reservations()).map((row) => row.id) } } });
  await prisma.seoProviderState.deleteMany();
  await reviewProductionJob(ws.tenantId, first.job.id, { decision: "reject" });
  const retried = await retryProductionJob(ws.tenantId, first.job.id, { wait: true });
  assert.deepEqual([researchOf(retried).serp.state, outside.seo.length], ["acquired", 2]);
  // Another article about the same search, everything outside stopped: the stored results serve.
  await pricedSerp({ emergencyStop: true });
  const other = await articleItem(ws, { title: "Otra guía de series de misterio" });
  const second = await startProduction(ws.tenantId, { kind: "plan_item", planItemId: other.id }, { wait: true });
  assert.deepEqual([researchOf(second.job).serp.state, outside.seo.length], ["reused", 2]);
}));

test("improving a public page is a new version of it, waits for approval and never takes an article's place", () => produced(async (ws, outside) => {
  await pricedSerp();
  const policy = await getOrCreatePolicy(ws.tenantId, ws.siteId);
  await prisma.automationPolicy.update({ where: { id: policy.id }, data: { mode: "autopilot", enabled: true, autoGenerate: true, autoApprove: true, autoSchedule: true, autoPublish: true, articlesPerDay: 5 } });
  const item = await articleItem(ws);
  const first = await startProduction(ws.tenantId, { kind: "plan_item", planItemId: item.id }, { wait: true });
  const projectId = first.job.projectId!;
  await prisma.publication.deleteMany({ where: { tenantId: ws.tenantId } });
  await prisma.publication.create({ data: { tenantId: ws.tenantId, projectId, versionId: first.job.versionId!, siteId: ws.siteId, channel: "website", status: "published", externalId: "42", externalUrl: "https://www.example.test/series-de-misterio/", publishedAt: new Date() } });
  const calls = outside.seo.length;

  const update = await articleItem(ws, { title: "Mejorar series de misterio", primaryKeyword: null, contentType: "update", scheduledFor: new Date(Date.now() + 60_000), metadata: { origin: "content_opportunity", targetUrl: "https://example.test/series-de-misterio" } });
  assert.equal(await progressDuePlanItems(await getOrCreatePolicy(ws.tenantId, ws.siteId), { start: async (_tenant, id) => assert.notEqual(id, update.id) }), 0, "automation does not start it");
  const revision = await startProduction(ws.tenantId, { kind: "plan_item", planItemId: update.id }, { wait: true });
  assert.deepEqual([revision.job.status, revision.job.projectId, revision.job.summary.held], ["needs_review", projectId, "modifies_published_page"], `${revision.job.error}`);
  assert.equal(await prisma.contentVersion.count({ where: { projectId } }), 2);
  assert.equal(await prisma.contentProject.count({ where: { tenantId: ws.tenantId } }), 1, "no second article");
  assert.equal(await prisma.publication.count({ where: { tenantId: ws.tenantId, versionId: revision.job.versionId! } }), 0, "autopilot does not publish it");
  const rewritten = await settled(ws, (await startProductionForProject(ws.tenantId, projectId, { feedback: "x" })).id);
  assert.equal(rewritten.summary.held, "modifies_published_page", "nor a rewrite of a public article");

  const foreign = await articleItem(ws, { title: "Mejorar otra", contentType: "update", metadata: { targetUrl: "https://example.test/not-ours" } });
  await assert.rejects(startProduction(ws.tenantId, { kind: "plan_item", planItemId: foreign.id }, { wait: true }), /not published with Auctorio/);

  const opportunity = await prisma.contentOpportunity.create({ data: { tenantId: ws.tenantId, siteId: ws.siteId, source: "search_console", kind: "low_ctr", topic: "x", query: "series de misterio", dedupeKey: randomUUID(), rationale: "r", action: "improve_metadata", targetUrl: "https://example.test/series-de-misterio", status: "open" } });
  await assert.rejects(startOpportunityRevision(ws.tenantId, ws.siteId, opportunity.id, null), /opportunity_not_approved/);
  await prisma.contentOpportunity.update({ where: { id: opportunity.id }, data: { status: "approved" } });
  const task = await startOpportunityRevision(ws.tenantId, ws.siteId, opportunity.id, null);
  assert.equal(task.projectId, projectId);
  assert.equal((await settled(ws, task.jobId)).summary.held, "modifies_published_page");
  assert.equal(outside.seo.length, calls, "no improvement bought anything");

  // Improvements do not count as planned articles.
  const planned = await prisma.editorialPlanItem.count({ where: { tenantId: ws.tenantId, ...NEW_CONTENT } });
  assert.equal(planned, 1);
}));

test("plans take stored opportunities with their provenance, never the same one twice, and say when there are not enough", () => governed(async (ws) => {
  await researchSite(ws, { minOpportunities: 5 });
  const run = await requestResearch({ tenantId: ws.tenantId, siteId: ws.siteId, trigger: "manual", triggerKey: null, detail: "x", focus: {} });
  await advanceResearchRun(run.runId, { fetchImpl: researchFetch([]) });
  const usable = await prisma.contentOpportunity.count({ where: { tenantId: ws.tenantId, status: "open", action: "create_content", score: { gte: 40 } } });
  assert.ok(usable >= 4, `${usable}`);
  await withOutside(async (outside) => {
    const input = (publicationCount: number) => ({ tenantId: ws.tenantId, siteId: ws.siteId, dateFrom: new Date(), dateTo: new Date(Date.now() + 60 * 86_400_000), publicationCount, channels: ["website" as const], allowWithoutIntelligence: true });
    try {
      const plans = await Promise.all([generateEditorialPlan(input(2)), generateEditorialPlan(input(2))]);
      const items = plans.flatMap((plan) => plan!.items);
      const selections = items.map((item) => readPlanItemSelection(item.metadata)!);
      assert.equal(items.length, 4);
      assert.ok(selections.every((selection) => selection.opportunityId && selection.researchRunId === run.runId && selection.metrics === "measured" && selection.metricsAt), JSON.stringify(selections));
      assert.equal(new Set(selections.map((selection) => selection.opportunityId)).size, 4, "two simultaneous plans share nothing");
      assert.equal(await prisma.contentOpportunity.count({ where: { tenantId: ws.tenantId, status: "planned", planItemId: { in: items.map((item) => item.id) } } }), 4);
      for (const plan of plans) assert.equal((plan!.generatedOutput as { shortage: unknown }).shortage, null);

      // Rewriting a proposal uses what there is.
      const { operationId } = await enqueueRegeneratePlanItem(ws.tenantId, items[0].id);
      for (let i = 0; i < 200 && ["queued", "running"].includes((await prisma.operation.findUniqueOrThrow({ where: { id: operationId } })).status); i += 1) await new Promise((resolve) => setTimeout(resolve, 50));

      // More articles than opportunities: the rest is proposed by the model, marked as unmeasured, and the plan says it is short.
      const big = await generateEditorialPlan({ ...input(60), allowWithoutIntelligence: true });
      const { shortage } = big!.generatedOutput as { shortage: PlanShortage };
      const bySource = big!.items.map((item) => readPlanItemSelection(item.metadata)!);
      assert.deepEqual([shortage.requested, shortage.fromOpportunities, shortage.fromModel, shortage.research.state], [60, bySource.filter((s) => s.opportunityId).length, bySource.filter((s) => s.metrics === "unmeasured").length, "researched_recently"]);
      assert.ok(shortage.fromModel + shortage.unfilled > 0);
      assert.ok(big!.items.filter((item) => readPlanItemSelection(item.metadata)!.metrics === "unmeasured").every((item) => item.searchVolume === null && item.keywordDifficulty === null), "no invented figures");
      assert.deepEqual(outside.seo, [], "no plan bought anything");
    } finally {
      await dropProduction(ws);
    }
  });
}));

test("web search goes through the governor: stored answers, limits, stops and ledger", () => governed((ws) => withOutside(async (outside) => {
  const web = getWebIntelligenceProvider({ tenantId: ws.tenantId, siteId: ws.siteId })!;
  assert.equal(web.name, "tavily");
  const ask = (query: string, freshnessHours?: number) => web.search(query, { limit: 5, language: "es", freshnessHours });
  assert.deepEqual((await ask("series news")).map((row) => row.domain), ["found.test"]);
  await ask("series news");
  assert.equal(outside.seo.length, 1, "asked again: stored");
  await ask("series news", 24);
  assert.equal(outside.seo.length, 2, "what happened today is another question");
  const rows = await ws.reservations();
  assert.ok(rows.length === 2 && rows.every((row) => row.providerId === "tavily" && row.operation === "web_search" && row.state === "settled" && Number(row.actualUsd) === 0.008));
  assert.equal((await ws.spend()).length, 2);
  // A day later the daily question is not answered with yesterday's results when no new ones can be had.
  await prisma.providerCacheEntry.updateMany({ where: { tenantId: ws.tenantId }, data: { fetchedAt: new Date(Date.now() - 86_400_000) } });
  await pricedSerp({ emergencyStop: true });
  assert.notEqual(await codeOf(ask("series news", 24)), "none");
  assert.equal(await codeOf(ask("series news")), "none", "the evergreen one is still good");
  assert.equal(await codeOf(ask("other")), "emergency_stop");
  await pricedSerp({ emergencyStop: false, mode: "disabled" });
  assert.equal(await codeOf(ask("other")), "external_disabled");
  await pricedSerp({ mode: "anyapi_only" });
  await limitTo("tenant", ws.tenantId, "monthly", 0.001, { operation: "web_search" });
  assert.equal(await codeOf(ask("other")), "budget_exhausted");
  assert.equal(outside.seo.length, 2);
})));
