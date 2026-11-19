import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import Fastify from "fastify";
import { getPrismaClient } from "../src/infrastructure/db/prisma";
import { normalizeOpportunity, readEngagement, saveEngagementSettings, scoreOpportunity, updateOpportunity } from "../src/studio/engagement";
import { registerEngagementRoutes } from "../src/studio/engagement/routes";
import { parseRedditListing } from "../src/studio/engagement/reddit";
import { recordWebUsage } from "../src/studio/web-discovery";
import { READ_TOOLS, WRITE_TOOLS } from "../src/studio/copilot/tools";
import { loadEditorialContext } from "../src/studio/copilot/assistant-context";

const match = { title: "¿Qué documentales ver?", description: "Un hilo sobre televisión", domain: "", score: null, publishedAt: null };

test("normalizes Reddit thread variants and excludes invalid, non-discussion and stale URLs", () => {
  const reddit = normalizeOpportunity("reddit", { ...match, url: "https://old.reddit.com/r/television/comments/AbC123/title/?campaign=abc#comment" });
  assert.equal(reddit?.url, "https://www.reddit.com/comments/abc123/");
  assert.equal(reddit?.community, "television");
  assert.equal(normalizeOpportunity("reddit", { ...match, url: "https://www.reddit.com/r/television/" }), null);
  assert.equal(normalizeOpportunity("reddit", { ...match, url: "https://reddit.com.example/comments/abc123" }), null);
  assert.equal(normalizeOpportunity("quora", { ...match, url: "https://www.quora.com/profile/Some-Name" }), null);
  assert.equal(normalizeOpportunity("quora", { ...match, url: "https://es.quora.com/Qué-documental-ver?tracking=1" })?.url, "https://es.quora.com/Qu%C3%A9-documental-ver");
  assert.equal(normalizeOpportunity("quora", { ...match, url: "https://www.quora.com/What-to-watch", publishedAt: "2020-01-01" }), null);
  assert.equal(normalizeOpportunity("quora", { ...match, url: "https://quora.com/What-to-watch/answer/Some-Name" })?.url, "https://www.quora.com/What-to-watch");
});

test("parses Reddit listings and scores relevance, votes and freshness", () => {
  const fixture = JSON.parse(readFileSync("tests/fixtures/reddit-search.json", "utf8"));
  const [post, ...other] = parseRedditListing(fixture);
  assert.equal(other.length, 0);
  assert.equal(post.votes, 43);
  assert.equal(post.description, "Programación de televisión");
  const now = new Date(post.publishedAt!);
  const item = normalizeOpportunity("reddit", post, now)!;
  const score = scoreOpportunity(item, "series", post.votes, now);
  assert.ok(score <= 100 && score > scoreOpportunity(item, "series", 0, now));
  assert.ok(score > scoreOpportunity({ ...item, publishedAt: null }, "series", post.votes, now));
  assert.ok(score > scoreOpportunity(item, "programación", post.votes, now));
  assert.equal(scoreOpportunity(item, "economía", post.votes, now), 0);
});

test("persists engagement settings and response status while isolating the channel and site", async () => {
  const prisma = getPrismaClient();
  const unique = randomUUID();
  const tenant = await prisma.tenant.create({ data: { name: unique, apiKeyHash: unique } });
  try {
    const site = await prisma.site.create({ data: { tenantId: tenant.id, key: unique, name: "QA", type: "guiatv", locale: "es-ES" } });
    const scope = { tenantId: tenant.id, siteId: site.id, platform: "reddit" as const };
    await saveEngagementSettings(scope, { keywords: [" series ", "series"], subreddits: ["r/Television"], replyStyle: " Breve " });
    const item = await prisma.engagementOpportunity.create({ data: { ...scope, url: "https://www.reddit.com/comments/abc123/", title: match.title, keyword: "series" } });
    await assert.rejects(updateOpportunity({ ...scope, platform: "quora" }, item.id, { status: "dismissed" }), /opportunity_not_found/);
    await updateOpportunity(scope, item.id, { status: "replied", draft: " Un borrador " });
    const result = await readEngagement(scope);
    assert.deepEqual(result.settings, { keywords: ["series"], subreddits: ["television"], replyStyle: "Breve", suggestedKeywords: [] });
    assert.deepEqual(result.items.map(({ status, draft }) => ({ status, draft })), [{ status: "replied", draft: "Un borrador" }]);
    await updateOpportunity(scope, item.id, { status: "dismissed" });
    assert.equal((await readEngagement(scope)).items.length, 0);
  } finally {
    await prisma.site.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.tenant.delete({ where: { id: tenant.id } });
  }
});

test("refreshes Quora over HTTP, deduplicates, drafts and confirms the reply", async (t) => {
  const prisma = getPrismaClient();
  const unique = randomUUID();
  const tenant = await prisma.tenant.create({ data: { name: unique, apiKeyHash: unique } });
  const env = {
    WEB_INTELLIGENCE_PROVIDER: "tavily", TAVILY_API_KEY: "fixture",
    TEXT_PROVIDER: "openai", TEXT_API_BASE_URL: "https://text.example", TEXT_API_KEY: "fixture", TEXT_MODEL: "test",
  };
  const previous = Object.fromEntries(Object.keys(env).map((key) => [key, process.env[key]]));
  Object.assign(process.env, env);
  const server = Fastify();
  server.decorateRequest("tenantId", "");
  server.addHook("preHandler", async (request) => { request.tenantId = tenant.id; });
  registerEngagementRoutes(server);
  t.mock.method(globalThis, "fetch", async (url: string, options: RequestInit) => {
    if (url === "https://api.tavily.com/search") {
      assert.match(String(options.body), /site:quora.com/);
      return Response.json({ results: [
        { url: "https://quora.com/Que-series-ver", title: "¿Qué series ver?", content: "Recomendaciones de televisión" },
        { url: "https://www.quora.com/Que-series-ver/answer/Some-Name", title: "¿Qué series ver?", content: "Un duplicado" },
        { url: "https://www.quora.com/Que-serie-ver", title: "Historia de la economía", content: "Fuera de tema" },
      ] });
    }
    assert.equal(url, "https://text.example/v1/chat/completions");
    assert.match(String(options.body), /Voz cercana/);
    assert.match(String(options.body), /Tono editorial/);
    assert.match(String(options.body), /Breve y claro/);
    return Response.json({ choices: [{ message: { content: "Empieza por el género que más te guste." } }] });
  });
  try {
    const site = await prisma.site.create({ data: { tenantId: tenant.id, key: unique, name: "QA", type: "guiatv", locale: "es-ES", brandVoice: "Voz cercana" } });
    await prisma.siteIntelligenceProfile.create({ data: { tenantId: tenant.id, siteId: site.id, editorialTone: "Tono editorial" } });
    await prisma.siteTopicCluster.create({ data: { tenantId: tenant.id, siteId: site.id, name: "Series", slug: "series", keywords: ["documentales de viajes"] } });
    const root = `/v2/sites/${site.id}/engagement`;
    const endpoint = (path = "", query = "") => `${root}${path}?platform=quora${query}`;
    const defaults = await server.inject({ method: "GET", url: endpoint("/settings") });
    assert.equal(defaults.statusCode, 200);
    assert.deepEqual(defaults.json().keywords, ["Series"]);
    assert.match(defaults.json().suggestedKeywords.join(" "), /documentales.*viajes/);
    const settings = await server.inject({ method: "PUT", url: endpoint("/settings"), payload: { keywords: ["series"], replyStyle: "Breve y claro" } });
    assert.equal(settings.statusCode, 200, settings.body);
    const refresh = await server.inject({ method: "POST", url: endpoint("/refresh") });
    assert.equal(refresh.statusCode, 202, refresh.body);
    const { operationId } = refresh.json();
    const waitUntil = Date.now() + 5000;
    let operation;
    do {
      await new Promise((resolve) => setTimeout(resolve, 25));
      operation = await prisma.operation.findUniqueOrThrow({ where: { id: operationId } });
    } while (["queued", "running"].includes(operation.status) && Date.now() < waitUntil);
    assert.equal(operation.status, "succeeded", operation.errorSummary ?? "");
    const listed = await server.inject({ method: "GET", url: endpoint("", "&status=to_reply") });
    const [item, ...duplicates] = listed.json().items;
    assert.ok(item.score > 0);
    assert.deepEqual(duplicates, []);
    const drafted = await server.inject({ method: "POST", url: endpoint(`/${item.id}/draft`) });
    assert.equal(drafted.statusCode, 200, drafted.body);
    assert.equal(drafted.json().draft, "Empieza por el género que más te guste.");
    const ctx = await loadEditorialContext(tenant.id, { siteId: site.id });
    assert.match((await READ_TOOLS.pending_engagement.run(ctx, {})).content, new RegExp(item.id));
    const action = await WRITE_TOOLS.mark_engagement_replied.prepare(ctx, { opportunityId: item.id });
    await WRITE_TOOLS.mark_engagement_replied.execute(tenant.id, unique, action.args);
    const replied = await server.inject({ method: "GET", url: endpoint("", "&status=replied") });
    assert.equal(replied.json().items[0].draft, drafted.json().draft);
    const patch = await server.inject({ method: "PATCH", url: endpoint(`/${item.id}`), payload: { status: "to_reply", draft: "Versión editada." } });
    assert.equal(patch.statusCode, 200, patch.body);
    const pending = await server.inject({ method: "GET", url: endpoint("", "&status=to_reply") });
    assert.equal(pending.json().items[0].draft, "Versión editada.");
    const reserve = () => recordWebUsage({ tenantId: tenant.id, siteId: site.id, provider: "tavily", operation: "search", queries: 1, maxDailySearches: 2 });
    assert.deepEqual((await Promise.all([reserve(), reserve()])).sort(), [false, true]);
  } finally {
    await server.close();
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await prisma.site.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.tenant.delete({ where: { id: tenant.id } });
  }
});
