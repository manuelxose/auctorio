import test from "node:test";
import assert from "node:assert/strict";
import { SEO_CAPABILITIES, SeoProviderError, seoMarket, type SeoCapability, type SeoProvider, type SeoRequests } from "../src/infrastructure/seo/contract";
import { dataForSeoProvider } from "../src/infrastructure/seo/dataforseo";
import { anyApiProvider } from "../src/infrastructure/seo/anyapi";
import { DEFAULT_CONTROL, SEO_LOCKS, SEO_PROVIDERS, selectSeoProvider, type SeoControl } from "../src/infrastructure/seo/registry";

// SEO-V2-01 contract tests: both adapters against equivalent recorded shapes. No network, no database.
process.env.DATAFORSEO_LOGIN = "test";
process.env.DATAFORSEO_PASSWORD = "test";
process.env.ANYAPI_API_KEY = "aa_test";
const NO_LOCKS = { automaticRouting: false, paidFallback: false, paidAutomation: [] };

const market = seoMarket("es-ES")!;
const requests: { [C in SeoCapability]: SeoRequests[C] } = {
  keyword_metrics: { market, keywords: ["guia tv", "sin datos"] },
  keyword_suggestions: { market, seed: "guia tv", limit: 100 },
  ranked_keywords: { market, domain: "example.com", limit: 2 },
  serp_organic: { market, keyword: "guia tv" },
  search_volume: { market, keywords: ["guia tv", "sin datos"] },
  youtube_search: { market, keyword: "guia tv" },
};

const dfs = (result: unknown, cost: number | undefined = 0.0122) => ({ status_code: 20000, ...(cost === undefined ? {} : { cost }), tasks: [{ status_code: 20000, result }] });
const dfsMetric = { keyword: "Guia TV", keyword_info: { search_volume: 1600, cpc: 0.2, competition: 0.1, competition_level: "LOW", last_updated_time: "2026-11-01 05:12:53 +00:00" }, keyword_properties: { keyword_difficulty: 21 }, search_intent_info: { main_intent: "informational" } };
const dfsFixtures: Record<SeoCapability, unknown> = {
  keyword_metrics: dfs([{ items: [dfsMetric] }]),
  keyword_suggestions: dfs([{ items: [dfsMetric, { keyword: "tele hoy" }] }]),
  ranked_keywords: dfs([{ items: [{ keyword_data: dfsMetric, ranked_serp_element: { serp_item: { rank_absolute: 3, url: "https://example.com/tv", etv: 88.5 } } }] }]),
  serp_organic: dfs([{ items: [{ datetime: "2026-11-01 00:00:00 +00:00", items: [{ type: "organic", url: "https://www.xataka.com/tv", title: "TV", domain: "www.xataka.com", description: "Parrilla" }] }] }]),
  search_volume: dfs([{ keyword: "Guia TV", search_volume: 1600 }, { keyword: "sin datos", search_volume: null }]),
  youtube_search: dfs([{ items: [{ type: "youtube_video", video_id: "abcdefghijk", title: "Vídeo", channel_name: "Canal", channel_url: "https://www.youtube.com/channel/UC1" }] }]),
};

const any = (data: unknown, extra: Record<string, unknown> = {}) => ({ output: { found: true, data }, provider: "AnyAPI", costUsd: 0.0147, items: 1, replayed: false, source: { id: "anonymous-owl", kind: "anonymous", name: "Owl" }, ...extra });
const anyMetric = { keyword: "Guia TV", searchVolume: 1600, cpc: 0.2, competition: "LOW", keywordDifficulty: 21, searchIntent: "informational", updatedUtc: 1793509973 };
const anyFixtures: Record<SeoCapability, unknown> = {
  keyword_metrics: any({ keywords: [anyMetric] }),
  keyword_suggestions: any({ ideas: [anyMetric, { keyword: "tele hoy" }] }),
  ranked_keywords: any({ rankedKeywords: [{ ...anyMetric, rankAbsolute: 3, url: "https://example.com/tv", etv: 88.5 }, { keyword: "otra", rankAbsolute: 9 }] }),
  serp_organic: any({ query: "guia tv", results: [{ position: 1, title: "TV", link: "https://www.xataka.com/tv", snippet: "Parrilla" }], nextCursor: null }),
  search_volume: any({ keywords: [{ keyword: "Guia TV", searchVolume: 1600, competitionIndex: 10 }, { keyword: "sin datos" }] }),
  youtube_search: any({ videos: [{ id: "abcdefghijk", title: "Vídeo", url: "u", channel: "Canal", lengthText: "1:00", publishedTime: "x", views: 1, authorId: "UC1234567890123456789012" }], nextCursor: "next" }),
};

type Sent = { url: string; body: Record<string, unknown>; headers: Record<string, string> };
function fakeFetch(body: unknown, status = 200, sent: Sent[] = []): typeof fetch {
  return (async (url: string, init: RequestInit) => {
    sent.push({ url: String(url), body: JSON.parse(String(init.body)), headers: init.headers as Record<string, string> });
    return new Response(typeof body === "string" ? body : JSON.stringify(body), { status });
  }) as typeof fetch;
}
const run = <C extends SeoCapability>(provider: SeoProvider, capability: C, body: unknown, status = 200, sent: Sent[] = []) => provider.run(capability, requests[capability], fakeFetch(body, status, sent));
const failure = async (provider: SeoProvider, body: unknown, status = 200) => {
  const error = await run(provider, "keyword_metrics", body, status).then(() => null, (e: unknown) => e);
  assert.ok(error instanceof SeoProviderError, `expected SeoProviderError, got ${String(error)}`);
  return error;
};

for (const [provider, fixtures] of [[dataForSeoProvider, dfsFixtures], [anyApiProvider, anyFixtures]] as const) {
  test(`${provider.id}: the same answer reads the same through the contract`, async () => {
    const metrics = await run(provider, "keyword_metrics", fixtures.keyword_metrics);
    assert.equal(metrics.data.length, 1, "a keyword without data is absent");
    const { keyword, volume, difficulty, cpc, intent, source } = metrics.data[0];
    assert.deepEqual({ keyword, volume, difficulty, cpc, intent, source }, { keyword: "guia tv", volume: 1600, difficulty: 21, cpc: 0.2, intent: "informational", source: provider.id });
    assert.equal(metrics.data[0].adsCompetition?.level, "LOW", "paid competition is separate from difficulty");
    assert.match(metrics.data[0].asOf ?? "", /^2026-11-0/);
    assert.ok(metrics.billedUsd! > 0);

    const ideas = await run(provider, "keyword_suggestions", fixtures.keyword_suggestions);
    const unknown = ideas.data[1];
    assert.deepEqual([unknown.keyword, unknown.volume, unknown.difficulty, unknown.cpc, unknown.intent, unknown.adsCompetition, unknown.estimatedTraffic], ["tele hoy", null, null, null, null, null, null], "unknown stays null, never 0");

    const ranked = await run(provider, "ranked_keywords", fixtures.ranked_keywords);
    assert.deepEqual([ranked.data[0].rank, ranked.data[0].estimatedTraffic], [{ position: 3, url: "https://example.com/tv" }, 88.5]);
    assert.deepEqual((await run(provider, "serp_organic", fixtures.serp_organic)).data, [{ url: "https://www.xataka.com/tv", title: "TV", domain: "xataka.com", description: "Parrilla" }]);
    assert.deepEqual((await run(provider, "search_volume", fixtures.search_volume)).data, [{ keyword: "guia tv", volume: 1600 }]);
    assert.deepEqual((await run(provider, "youtube_search", fixtures.youtube_search)).data.map(({ id, title, channel }) => ({ id, title, channel })), [{ id: "abcdefghijk", title: "Vídeo", channel: "Canal" }]);
  });

  test(`${provider.id}: failures are typed, keep their reason and never leak the key`, async () => {
    const cases: Array<[number, string, boolean]> = [[401, "invalid_credentials", false], [402, "insufficient_balance", false], [429, "rate_limited", true], [400, "bad_request", false], [500, "upstream_error", true]];
    for (const [status, code, retryable] of cases) {
      const error = await failure(provider, { error: "nope" }, status);
      assert.deepEqual([error.code, error.retryable, error.providerId], [code, retryable, provider.id]);
      assert.ok(error.message.includes(String(status)) && !error.message.includes("aa_test"));
    }
    assert.equal((await failure(provider, "<html>not json</html>")).code, "malformed_response");
    assert.equal((await failure(provider, {})).code, "malformed_response");
    const timeout = (async () => { throw new DOMException("t", "TimeoutError"); }) as unknown as typeof fetch;
    await assert.rejects(provider.run("keyword_metrics", requests.keyword_metrics, timeout), (e: SeoProviderError) => e.code === "timeout" && e.retryable && e.billedUsd === null);
    await assert.rejects(provider.run("keyword_metrics", requests.keyword_metrics, fetch), (e: SeoProviderError) => e.code === "network_blocked", "tests cannot reach the provider");
  });

  test(`${provider.id}: every capability is declared and unsupported markets have no key`, () => {
    for (const capability of SEO_CAPABILITIES) {
      const declaration = provider.capabilities[capability];
      assert.ok(declaration.supported ? declaration.methodology && declaration.sourceTag : declaration.reason);
      assert.equal(provider.marketKey(capability, { locale: "es-ES", country: "ES", language: "es", location: "Madrid" }), null, "no sub-national targeting");
    }
    assert.equal(provider.marketKey("keyword_metrics", seoMarket("ja-JP")!), null);
  });
}

test("DataForSEO keeps its requests, cache keys and historical SERP semantics", async () => {
  assert.equal(dataForSeoProvider.marketKey("keyword_metrics", market), "2724|es");
  const sent: Sent[] = [];
  await run(dataForSeoProvider, "keyword_suggestions", dfsFixtures.keyword_suggestions, 200, sent);
  assert.match(sent[0].url, /dataforseo_labs\/google\/keyword_ideas\/live$/);
  assert.deepEqual(sent[0].body, [{ keywords: ["guia tv"], limit: 100, order_by: ["keyword_info.search_volume,desc"], location_code: 2724, language_code: "es" }]);
  const serp = await run(dataForSeoProvider, "serp_organic", dfsFixtures.serp_organic, 200, sent);
  assert.equal(serp.asOf, "2026-11-01T00:00:00.000Z", "the snapshot's own date");
  const declaration = dataForSeoProvider.capabilities.serp_organic;
  assert.ok(declaration.supported && declaration.dataKind === "historical");
  assert.equal((await run(dataForSeoProvider, "keyword_metrics", { status_code: 20000, tasks: [] })).billedUsd, null, "an unreported cost is unknown, not zero");
  assert.equal((await failure(dataForSeoProvider, { status_code: 40200, status_message: "Payment Required." })).code, "insufficient_balance");
});

test("AnyAPI sends documented requests with a price ceiling and normalizes defensively", async () => {
  const sent: Sent[] = [];
  const serp = await run(anyApiProvider, "serp_organic", any({ query: "q", results: [
    { position: 1, title: "A", link: "https://a.test/1", snippet: "s" },
    { position: 2, title: "B", link: "https://www.google.com/goto?url=x", snippet: "s" },
    { position: 3, title: "C", link: "::bad" },
    null,
  ] }), 200, sent);
  assert.equal(sent[0].url, "https://api.getanyapi.com/v1/run/google.search?max_cost_usd=0.002");
  assert.deepEqual(sent[0].body, { query: "guia tv", gl: "es", hl: "es", page: 1 });
  assert.equal(sent[0].headers.Authorization, "Bearer aa_test");
  assert.deepEqual([serp.data.map((r) => r.domain), serp.partial, serp.upstream], [["a.test"], true, "Owl"]);
  assert.ok(serp.notes.includes("redirect_links_dropped:1") && serp.notes.includes("market_unverified:ES|es"));
  const serpDeclaration = anyApiProvider.capabilities.serp_organic;
  assert.ok(serpDeclaration.supported && serpDeclaration.dataKind === "observed");

  await run(anyApiProvider, "keyword_metrics", anyFixtures.keyword_metrics, 200, sent);
  assert.deepEqual(sent[1].body, { keywords: ["guia tv", "sin datos"], language: "es", location: 2724 });
  assert.match(sent[1].url, /seo\.keyword_overview\?max_cost_usd=0\.0147$/);
  const long = await anyApiProvider.run("keyword_metrics", { market, keywords: ["guia tv", "x".repeat(81)] }, fakeFetch(anyFixtures.keyword_metrics, 200, sent));
  assert.deepEqual([(sent[2].body.keywords as string[]).length, long.partial], [1, true], "a keyword that was not sent is not 'no data'");

  const page = await run(anyApiProvider, "ranked_keywords", anyFixtures.ranked_keywords);
  assert.equal(page.nextCursor, "2");
  const odd = await run(anyApiProvider, "keyword_metrics", any({ keywords: [{ keyword: "guia tv", searchVolume: "1600", keywordDifficulty: 140, cpc: -1 }] }));
  assert.deepEqual([odd.data[0].volume, odd.data[0].difficulty, odd.data[0].cpc], [null, null, null], "invalid values are unknown");

  const miss = await run(anyApiProvider, "keyword_metrics", { output: { found: false, reason: "not_found", data: null }, costUsd: 0, replayed: false });
  assert.deepEqual([miss.data, miss.billedUsd, miss.partial], [[], 0, false]);
  assert.equal((await run(anyApiProvider, "keyword_metrics", { ...(anyFixtures.keyword_metrics as object), costUsd: "free" })).billedUsd, null);
  assert.equal((await run(anyApiProvider, "keyword_metrics", { ...(anyFixtures.keyword_metrics as object), replayed: true })).billedUsd, 0);

  const changed = await failure(anyApiProvider, any({ rows: [] }));
  assert.deepEqual([changed.code, changed.billedUsd], ["malformed_response", 0.0147], "a changed schema fails, and what it cost is kept");
  assert.equal((await failure(anyApiProvider, any({ keywords: [{ kw: "x" }] }))).code, "malformed_response");
  assert.equal((await failure(anyApiProvider, { error: "x", code: "rate_limited" }, 429)).billedUsd, 0);
  assert.equal((await failure(anyApiProvider, { error: "x", payment: { costUsd: 0.01 } }, 502)).billedUsd, 0.01);
  assert.equal((await failure(anyApiProvider, { error: "x" }, 502)).billedUsd, null, "a failure may have been billed");
});

const control = (patch: Partial<SeoControl> = {}): SeoControl => ({ ...DEFAULT_CONTROL, ...patch, providers: { ...DEFAULT_CONTROL.providers, ...patch.providers } });
const bothOn = { dataforseo: { enabled: true, priority: 10 }, anyapi: { enabled: true, priority: 20 } };
const code = (fn: () => unknown): string => {
  try {
    fn();
    return "none";
  } catch (error) {
    return (error as SeoProviderError).code;
  }
};

test("registry: modes, disabled providers, capabilities and locks", () => {
  const pick = (state: SeoControl, options: Parameters<typeof selectSeoProvider>[3] = {}, capability: SeoCapability = "keyword_metrics") => selectSeoProvider(capability, market, state, options).id;
  assert.equal(pick(control()), "dataforseo", "default: what production did before");
  assert.equal(code(() => pick(control({ mode: "disabled" }), { trigger: "authorized_test", locks: NO_LOCKS })), "external_disabled");
  assert.equal(code(() => pick(control({ providers: { dataforseo: { enabled: false, priority: 1 } } }))), "provider_disabled");
  assert.equal(code(() => pick(control({ mode: "anyapi_only" }), { locks: NO_LOCKS })), "provider_disabled", "AnyAPI starts disabled");
  assert.equal(code(() => pick(control({ mode: "anyapi_only", providers: bothOn }))), "paid_automation_locked", "AnyAPI automation waits for SEO-V2-02");
  assert.equal(pick(control({ mode: "anyapi_only", providers: bothOn }), { trigger: "authorized_test" }), "anyapi");
  assert.deepEqual([SEO_LOCKS.automaticRouting, SEO_LOCKS.paidFallback], [true, true]);

  const manual = control({ mode: "manual", routing: { serp_organic: "anyapi", keyword_metrics: "dataforseo" }, providers: bothOn });
  assert.equal(pick(manual, { locks: NO_LOCKS }), "dataforseo");
  assert.equal(pick(manual, { locks: NO_LOCKS }, "serp_organic"), "anyapi");
  assert.equal(code(() => pick(manual, { locks: NO_LOCKS }, "youtube_search")), "not_selected");

  const limited: SeoProvider = { ...anyApiProvider, capabilities: { ...anyApiProvider.capabilities, youtube_search: { supported: false, reason: "test", alternatives: ["dataforseo"] } } };
  const providers = [dataForSeoProvider, limited];
  const anyOnly = control({ mode: "anyapi_only", providers: bothOn });
  assert.equal(code(() => pick(anyOnly, { locks: NO_LOCKS, providers }, "youtube_search")), "unsupported_capability");
  assert.equal(code(() => pick({ ...anyOnly, paidFallback: true }, { providers, trigger: "authorized_test" }, "youtube_search")), "unsupported_capability", "fallback stays locked");
  assert.equal(pick({ ...anyOnly, paidFallback: true }, { locks: NO_LOCKS, providers }, "youtube_search"), "dataforseo");
  assert.equal(code(() => selectSeoProvider("keyword_metrics", seoMarket("ja-JP"), control())), "unsupported_market");
});

test("cost-optimized routing is locked; unlocked it takes the cheapest known price and never an unknown one", () => {
  const state = control({ mode: "cost_optimized", providers: bothOn });
  const options = (capability: SeoCapability, locks = NO_LOCKS) => ({ locks, quote: (provider: SeoProvider) => provider.quote(capability, requests[capability]) });
  assert.equal(code(() => selectSeoProvider("keyword_metrics", market, state, options("keyword_metrics", SEO_LOCKS as never))), "automatic_routing_locked");
  assert.equal(selectSeoProvider("keyword_metrics", market, state, options("keyword_metrics")).id, "dataforseo");
  assert.equal(selectSeoProvider("youtube_search", market, state, options("youtube_search")).id, "anyapi");
  // DataForSEO's historical_serps has no known maximum: it cannot win automatically.
  assert.equal(dataForSeoProvider.quote("serp_organic", requests.serp_organic).maxUsd, null);
  assert.equal(selectSeoProvider("serp_organic", market, state, options("serp_organic")).id, "anyapi");
  assert.equal(code(() => selectSeoProvider("serp_organic", market, control({ mode: "cost_optimized" }), options("serp_organic"))), "unknown_price");
});

test("AnyAPI is selectable without DataForSEO credentials", () => {
  delete process.env.DATAFORSEO_LOGIN;
  try {
    assert.equal(dataForSeoProvider.configured(), false);
    assert.equal(selectSeoProvider("keyword_metrics", market, control({ mode: "anyapi_only", providers: bothOn }), { locks: NO_LOCKS }).id, "anyapi");
    assert.equal(code(() => selectSeoProvider("keyword_metrics", market, control())), "not_configured");
  } finally {
    process.env.DATAFORSEO_LOGIN = "test";
  }
  assert.deepEqual(SEO_PROVIDERS.map(({ id }) => id), ["dataforseo", "anyapi"]);
});
