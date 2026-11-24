import { randomUUID } from "node:crypto";
import test from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import { getPrismaClient } from "../src/infrastructure/db/prisma";
import { SeoProviderError } from "../src/infrastructure/seo/contract";
import { sha256 } from "../src/shared/utils/hash";
import { registerStudioRoutes } from "../src/studio/routes";
import { buildStudioProxySignature } from "../src/studio/security";
import { STUDIO_PERMISSIONS_HEADER, STUDIO_SESSION_HEADER, STUDIO_SIGNATURE_HEADER, STUDIO_TENANT_HEADER, STUDIO_TIMESTAMP_HEADER, STUDIO_USER_HEADER } from "../src/studio/http-utils";
import { storeProviderCache } from "../src/studio/enrichment/provider-cache";
import { enrichPlanItemsWithKeywordMetrics } from "../src/studio/keyword-metrics";
import { acquireSeo, seoCapabilityAvailable, seoRoute, verifySeoProvider, type SeoRoute } from "../src/studio/seo-manager";
import { serpSourceFacts } from "../src/studio/serp-sources";
import { youtubeVideoFor } from "../src/studio/youtube-videos";

// The control state is platform-wide, so everything that depends on it lives in this file (its tests run in order).
const prisma = getPrismaClient();
const ENV = ["DATAFORSEO_LOGIN", "DATAFORSEO_PASSWORD", "ANYAPI_API_KEY", "PLATFORM_ADMIN_EMAILS", "SOCIAL_TOKEN_ENCRYPTION_KEY"];
const savedEnv = new Map(ENV.map((name) => [name, process.env[name]]));
const KEYS = ["DATAFORSEO_LOGIN", "DATAFORSEO_PASSWORD", "ANYAPI_API_KEY"];
const NO_LOCKS = { automaticRouting: false, paidFallback: false, paidAutomation: [] };

const controlRows = async () => ({
  states: await prisma.seoProviderState.findMany(),
  settings: await prisma.seoControlSetting.findMany(),
  keys: await prisma.aiProviderKey.findMany({ where: { envName: { in: KEYS } } }),
});
let savedRows: Awaited<ReturnType<typeof controlRows>>;

async function clearControl() {
  await prisma.seoProviderState.deleteMany();
  await prisma.seoControlSetting.deleteMany();
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
    spend: () => prisma.aiSpendEvent.findMany({ where: { tenantId: tenant.id }, orderBy: { createdAt: "asc" } }),
    async remove() {
      const where = { tenantId: tenant.id };
      await prisma.aiSpendEvent.deleteMany({ where });
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
    assert.equal(await enrichPlanItemsWithKeywordMetrics(ws.tenantId, plan.id, fetchImpl), 2);
    const byId = new Map((await prisma.editorialPlanItem.findMany({ where: { planId: plan.id } })).map((row) => [row.id, row]));
    assert.deepEqual([byId.get(known.id)!.searchVolume, byId.get(known.id)!.keywordDifficulty, byId.get(known.id)!.keywordMetricsSource], [1600, 21, "dataforseo"]);
    // Checked but no data: source recorded, numbers stay null (never invented).
    assert.deepEqual([byId.get(unknown.id)!.searchVolume, byId.get(unknown.id)!.keywordMetricsSource], [null, "dataforseo"]);
    assert.equal(byId.get(none.id)!.keywordMetricsSource, null);
    assert.deepEqual((await ws.spend()).map((row) => [row.kind, row.provider, row.model, row.costUsd]), [["keyword_metrics", "dataforseo", "keyword_overview", 0.0101]]);

    // Same keyword on a new item is served from cache: no second provider call.
    const again = await item("d", "canales de televisión gratis");
    assert.equal(await enrichPlanItemsWithKeywordMetrics(ws.tenantId, plan.id, fetchImpl), 1);
    assert.equal(overviewCalls(), 1);
    assert.equal((await prisma.editorialPlanItem.findUnique({ where: { id: again.id } }))!.searchVolume, 1600);
  } finally {
    await ws.remove();
  }
});

test("data cached before SEO-V2 is still read, under the same keys", async () => {
  const ws = await workspace();
  const calls: string[] = [];
  const fetchImpl = answering(calls, () => ({}));
  try {
    await storeProviderCache(ws.tenantId, "dataforseo", "serp_organic", "2724|es|guia tv", [{ url: "https://xataka.com/tv", title: "TV", domain: "xataka.com", description: "Parrilla" }], { ttlMs: 60_000 });
    await storeProviderCache(ws.tenantId, "dataforseo", "youtube_organic", "2724|es|guia tv", [{ id: "abcdefghijk", title: "Vídeo", channel: "Canal", channelUrl: "" }], { ttlMs: 60_000 });
    const facts = await serpSourceFacts({ tenantId: ws.tenantId, siteId: ws.siteId, locale: "es-ES", keyword: "Guia TV", exclude: { domains: [], urls: [] }, max: 3 }, fetchImpl, async () => null);
    assert.deepEqual(facts.map((fact) => fact.sourceUrl), ["https://xataka.com/tv"]);
    const video = await youtubeVideoFor({ tenantId: ws.tenantId, siteId: ws.siteId, locale: "es", keyword: "guia tv", youtube: { enabled: true } as never }, fetchImpl);
    assert.equal(video?.id, "abcdefghijk");
    assert.equal(calls.length, 0);
  } finally {
    await ws.remove();
  }
});

test("a disabled provider or the kill switch stops calls at once, even for a route already resolved", async () => {
  const ws = await workspace();
  const calls: string[] = [];
  const scope = { tenantId: ws.tenantId, siteId: ws.siteId, kind: "keyword_metrics", resource: "keyword_overview", fetchImpl: answering(calls, () => ({})) };
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

test("AnyAPI serves the same operation when selected; its automation is locked and its cost and health are recorded", async () => {
  const ws = await workspace();
  process.env.ANYAPI_API_KEY = "aa_test_secret";
  process.env.DATAFORSEO_LOGIN = "";
  const calls: string[] = [];
  const ok = answering(calls, () => ({ output: { found: true, data: { keywords: [{ keyword: "guia tv", searchVolume: 1600 }] } }, costUsd: 0.01454, replayed: false, source: { name: "Owl" } }));
  const scope = { tenantId: ws.tenantId, siteId: ws.siteId, kind: "keyword_metrics", resource: "keyword_overview", fetchImpl: ok };
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
    await acquireSeo(route, "keyword_metrics", { keywords: ["x"] }, { ...unlocked, fetchImpl: answering(calls, () => ({ output: { found: false } })) });
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
    assert.deepEqual(await verify(), { rows: 1, costUsd: 0.01454, partial: false, notes: ["market_unverified:ES|es"], market: "ES|es" });
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
  const account = await prisma.studioAccount.create({ data: { email, emailNormalized: email, displayName: "SEO admin", status: "active" } as never });
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
    assert.deepEqual([first.status, first.body.mode, first.body.providers.map((p: { id: string; enabled: boolean }) => [p.id, p.enabled])], [200, "dataforseo_only", [["dataforseo", true], ["anyapi", false]]]);
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
