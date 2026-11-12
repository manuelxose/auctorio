// SRC-01/02, CMP-01, plan linking and SEC-02 for site sources + competitor
// intelligence. No live network: every HTTP call goes to a mocked
// `globalThis.fetch` that serves fixture feeds for TEST-NET IP-literal hosts
// (which the SSRF guard accepts without DNS); anything else fails the test.

import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import dns from "node:dns/promises";
import { getPrismaClient } from "../src/infrastructure/db/prisma";
import { sha256 } from "../src/shared/utils/hash";
import { getOnboardingStep } from "../src/studio/onboarding/contracts";
import { listDueSources } from "../src/studio/sources";
import { verifyFeedCandidate } from "../src/studio/feed-discovery";
import {
  acceptSiteSourceRecommendation,
  discoverSourceRecommendations,
  getSourceEvidenceForPlanning,
  rejectSiteSourceRecommendation,
  setSiteSourceState,
  testSiteSource,
  classifyTopics,
} from "../src/studio/source-registry-discovery";
import {
  addCompetitorManually,
  addOpportunityToPlan,
  discoverCompetitors,
  extractDomainMentions,
  refreshCompetitorCoverage,
  updateCompetitor,
} from "../src/studio/competitors";
import { registerSourceRegistryRoutes } from "../src/studio/routes-source-registry";

const prisma = getPrismaClient();

// No DNS and no real search provider: hostname lookups fail like an unknown
// domain, and only the explicitly enabled fake Tavily endpoint answers.
(dns as unknown as { lookup: unknown }).lookup = async (hostname: string) => {
  throw Object.assign(new Error(`getaddrinfo ENOTFOUND ${hostname}`), { code: "ENOTFOUND" });
};
process.env.WEB_INTELLIGENCE_PROVIDER = "none";

const SITE = "198.51.100.20";
const RIVAL = "203.0.113.30";
const SEARCHED = "203.0.113.40";
const now = new Date();
const daysAgo = (days: number) => new Date(now.getTime() - days * 86_400_000).toUTCString();

function rss(title: string, items: Array<{ title: string; link: string; date: string }>): string {
  return `<?xml version="1.0"?><rss version="2.0"><channel><title>${title}</title>${items
    .map((item) => `<item><title>${item.title}</title><link>${item.link}</link><guid>${item.link}</guid><pubDate>${item.date}</pubDate></item>`)
    .join("")}</channel></rss>`;
}

const ROUTES: Record<string, { body: string; type: string }> = {
  [`https://${SITE}/`]: { type: "text/html", body: `<html><head><link rel="alternate" type="application/rss+xml" title="Main" href="/feed/"></head><body>home</body></html>` },
  [`https://${SITE}/feed/`]: {
    type: "application/rss+xml",
    body: rss("Site", [
      { title: "Electric bikes get a new battery standard", link: `https://${SITE}/news/battery-standard`, date: daysAgo(0) },
      { title: "Cycling routes reopened", link: `https://${SITE}/news/routes`, date: daysAgo(1) },
    ]),
  },
  [`https://${RIVAL}/`]: { type: "text/html", body: `<html><head><link rel="alternate" type="application/rss+xml" href="/rss.xml"></head></html>` },
  [`https://${RIVAL}/rss.xml`]: {
    type: "application/rss+xml",
    body: rss("Rival", [
      { title: "Battery care for winter", link: `https://${RIVAL}/battery-care-winter`, date: daysAgo(1) },
      { title: "Battery storage tips", link: `https://${RIVAL}/battery-storage`, date: daysAgo(2) },
      { title: "Electric bikes for commuters", link: `https://${RIVAL}/ebikes-commuters`, date: daysAgo(3) },
      { title: "Folding cargo trailers reviewed", link: `https://${RIVAL}/cargo-1`, date: daysAgo(4) },
      { title: "Cargo trailers compared", link: `https://${RIVAL}/cargo-2`, date: daysAgo(5) },
      { title: "Cargo trailers for kids", link: `https://${RIVAL}/cargo-3`, date: daysAgo(6) },
    ]),
  },
  [`https://${SEARCHED}/`]: { type: "text/html", body: `<html><head><link rel="alternate" type="application/rss+xml" href="/feed/"></head></html>` },
  [`https://${SEARCHED}/feed/`]: { type: "application/rss+xml", body: rss("Searched", [{ title: "Electric bikes market notes", link: `https://${SEARCHED}/a`, date: daysAgo(2) }]) },
};

const fetchedUrls: string[] = [];

function installFetch(): () => void {
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    fetchedUrls.push(url);
    if (url === "https://api.tavily.com/search") {
      return new Response(JSON.stringify({ results: [{ url: `https://${SEARCHED}/a`, title: "A", content: "c", score: 0.9 }] }), { status: 200, headers: { "content-type": "application/json" } });
    }
    const host = new URL(url).hostname;
    if (![SITE, RIVAL, SEARCHED].includes(host)) {
      throw new Error(`unexpected network call in test: ${url}`);
    }
    const route = ROUTES[url];
    if (route) return new Response(route.body, { status: 200, headers: { "content-type": route.type } });
    if (host === SITE && /\/(electric|cycling)/.test(new URL(url).pathname)) {
      return new Response(`<html><body><main><a href="https://${RIVAL}/review">rival</a> <a href="https://facebook.com/x">fb</a></main></body></html>`, { status: 200, headers: { "content-type": "text/html" } });
    }
    void init;
    return new Response("not found", { status: 404, headers: { "content-type": "text/plain" } });
  }) as typeof fetch;
  return () => {
    globalThis.fetch = original;
  };
}

async function seed(label: string) {
  const seedKey = `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const apiKey = `${seedKey}-key`;
  const tenant = await prisma.tenant.create({ data: { name: `tenant-${seedKey}`, slug: `t-${seedKey}`, apiKeyHash: sha256(apiKey) } });
  const site = await prisma.site.create({ data: { tenantId: tenant.id, key: `site-${seedKey}`, name: "Bike Desk", type: "generic_rest", locale: "en-US", baseUrl: `https://${SITE}` } });
  await prisma.siteTopicCluster.createMany({
    data: [
      { tenantId: tenant.id, siteId: site.id, name: "Electric bikes", slug: "electric-bikes", pagesCount: 3, keywords: ["ebike"] },
      { tenantId: tenant.id, siteId: site.id, name: "Battery care", slug: "battery-care", pagesCount: 0, keywords: ["battery"] },
      { tenantId: tenant.id, siteId: site.id, name: "Cycling routes", slug: "cycling-routes", pagesCount: 1, keywords: [] },
    ],
  });
  await prisma.siteIndexedPage.createMany({
    data: [
      { tenantId: tenant.id, siteId: site.id, url: `https://${SITE}/electric-bikes-guide`, title: "Electric bikes buying guide", modifiedAt: new Date("2025-01-01"), content: "Compare with rival-bikes.com reviews" },
      { tenantId: tenant.id, siteId: site.id, url: `https://${SITE}/electric-bikes-buying-guide-2`, title: "Electric bike buying guide", modifiedAt: new Date() },
      { tenantId: tenant.id, siteId: site.id, url: `https://${SITE}/cycling-routes-north`, title: "Best cycling routes in the north", modifiedAt: new Date() },
    ],
  });
  return { tenant, site, apiKey };
}

function useSearchProvider(): () => void {
  const previousKey = process.env.TAVILY_API_KEY;
  process.env.WEB_INTELLIGENCE_PROVIDER = "tavily";
  process.env.TAVILY_API_KEY = "test-key";
  return () => {
    process.env.WEB_INTELLIGENCE_PROVIDER = "none";
    if (previousKey === undefined) delete process.env.TAVILY_API_KEY;
    else process.env.TAVILY_API_KEY = previousKey;
  };
}

test("classifyTopics and extractDomainMentions are deterministic", () => {
  const vocabulary = [{ name: "Electric bikes", terms: ["electric bikes", "ebike"] }, { name: "Battery care", terms: ["battery care", "battery"] }];
  assert.deepEqual(classifyTopics("New electric bike battery", vocabulary), ["Electric bikes", "Battery care"]);
  assert.deepEqual(classifyTopics("Unrelated story", vocabulary), []);
  assert.deepEqual(extractDomainMentions("See www.rival-bikes.com and docs.example.org."), ["rival-bikes.com", "docs.example.org"]);
});

test("SRC-01: discovery yields verified, deduplicated, idempotent recommendations for a site", async () => {
  const restoreFetch = installFetch();
  const restoreProvider = useSearchProvider();
  try {
    const { tenant, site } = await seed("src01");
    const first = await discoverSourceRecommendations(tenant.id, site.id);
    assert.equal(first.errors.filter((error) => !error.startsWith("search")).length, 0);
    const rows = await prisma.sourceRecommendation.findMany({ where: { tenantId: tenant.id, siteId: site.id } });
    const own = rows.filter((row) => row.canonicalUrl === `https://${SITE}/feed/`);
    assert.equal(own.length, 1, "link_alternate + common path collapse into one canonical row");
    assert.equal(own[0].relationship, "first_party");
    assert.equal(own[0].verificationStatus, "verified");
    assert.equal(own[0].expectedFreshness, "daily");
    assert.ok((own[0].topics as string[]).includes("Electric bikes"));
    assert.ok((own[0].limitations as string[]).some((entry) => /republication/i.test(entry)));
    const external = rows.find((row) => row.domain === SEARCHED);
    assert.ok(external, "search-derived external candidate is persisted");
    assert.equal(external.relationship, "external");
    assert.equal(external.verificationStatus, "verified");
    assert.match(external.discoveryMethod ?? "", /^web_search:tavily/);
    assert.ok(external.assessmentReason && external.reasonSummary && external.lastCheckedAt);

    await rejectSiteSourceRecommendation(tenant.id, site.id, external.id, null);
    const second = await discoverSourceRecommendations(tenant.id, site.id);
    assert.equal(second.created, 0, "re-run creates nothing new");
    assert.equal(await prisma.sourceRecommendation.count({ where: { tenantId: tenant.id, siteId: site.id } }), rows.length);
    assert.equal((await prisma.sourceRecommendation.findUnique({ where: { id: external.id } }))?.status, "rejected", "operator decision survives re-runs");

    // The onboarding step is registered by importing the module.
    const step = getOnboardingStep("sources");
    assert.ok(step);
    const outcome = await step({ tenantId: tenant.id, siteId: site.id, userId: null, operationId: "op" });
    assert.match(outcome.summary, /source candidate/);
    assert.ok((outcome.counts?.verified ?? 0) >= 2);
  } finally {
    restoreProvider();
    restoreFetch();
  }
});

test("SRC-02: accept/pause/resume/archive change ingestion and planning evidence", async () => {
  const restoreFetch = installFetch();
  try {
    const { tenant, site } = await seed("src02");
    await discoverSourceRecommendations(tenant.id, site.id);
    const recommendation = await prisma.sourceRecommendation.findFirstOrThrow({ where: { tenantId: tenant.id, siteId: site.id, canonicalUrl: `https://${SITE}/feed/` } });
    assert.deepEqual(await getSourceEvidenceForPlanning(tenant.id, site.id, 10), [], "no evidence before acceptance");

    const accepted = (await acceptSiteSourceRecommendation(tenant.id, site.id, recommendation.id, null)) as { id: string; configuration: Record<string, unknown> };
    const again = (await acceptSiteSourceRecommendation(tenant.id, site.id, recommendation.id, null)) as { id: string };
    assert.equal(again.id, accepted.id, "accepting twice reuses the same source");
    assert.equal((accepted.configuration.provenance as { recommendationId: string }).recommendationId, recommendation.id);

    const tested = await testSiteSource(tenant.id, site.id, accepted.id);
    assert.equal(tested.ok, true);
    assert.equal(tested.items[0].title, "Electric bikes get a new battery standard");

    await prisma.sourceItem.createMany({
      data: [
        { tenantId: tenant.id, sourceId: accepted.id, externalId: "a", title: "Electric bikes get a new battery standard", canonicalUrl: `https://${SITE}/news/battery-standard`, contentHash: "h1", publishedAt: new Date() },
        { tenantId: tenant.id, sourceId: accepted.id, externalId: "b", title: "Bakery opens downtown", canonicalUrl: `https://${SITE}/news/bakery`, contentHash: "h2", publishedAt: new Date() },
      ],
    });
    const due = async () => (await listDueSources(tenant.id)).map((source) => source.id);
    const evidence = async () => getSourceEvidenceForPlanning(tenant.id, site.id, 10);

    assert.ok((await due()).includes(accepted.id));
    const active = await evidence();
    assert.equal(active.length, 1, "irrelevant items are filtered by the site vocabulary");
    assert.deepEqual(active[0].topics.sort(), ["Battery care", "Electric bikes"]);
    assert.equal(active[0].sourceName.length > 0, true);

    await setSiteSourceState(tenant.id, site.id, accepted.id, "pause", null);
    assert.ok(!(await due()).includes(accepted.id));
    assert.deepEqual(await evidence(), []);

    await setSiteSourceState(tenant.id, site.id, accepted.id, "resume", null);
    assert.ok((await due()).includes(accepted.id));
    assert.equal((await evidence()).length, 1);

    await setSiteSourceState(tenant.id, site.id, accepted.id, "archive", null);
    assert.ok(!(await due()).includes(accepted.id));
    assert.deepEqual(await evidence(), []);
    await assert.rejects(setSiteSourceState(tenant.id, site.id, accepted.id, "resume", null), /restore_first/);
    assert.equal(await prisma.sourceItem.count({ where: { sourceId: accepted.id } }), 2, "archive keeps collected items");
    const archived = await prisma.contentSource.findUniqueOrThrow({ where: { id: accepted.id } });
    assert.ok(archived.archivedAt);
    assert.ok((archived.configuration as Record<string, unknown>).provenance, "archive keeps provenance");
  } finally {
    restoreFetch();
  }
});

test("CMP-01: competitor accept/edit/remove keeps evidence; Add to plan creates exactly one linked proposal", async () => {
  const restoreFetch = installFetch();
  try {
    const { tenant, site, apiKey } = await seed("cmp01");
    const discovery = await discoverCompetitors(tenant.id, site.id);
    assert.ok(discovery.candidates >= 1);
    const rival = await prisma.competitor.findUniqueOrThrow({ where: { siteId_domain: { siteId: site.id, domain: RIVAL } } });
    assert.equal(rival.status, "suggested");
    assert.equal(rival.verification, "verified", "reachable + feed fetched + topical overlap");
    const evidence = rival.evidence as Array<{ kind: string }>;
    assert.ok(evidence.some((entry) => entry.kind === "outbound_link"));
    assert.ok(evidence.some((entry) => entry.kind === "feed_fetched"));
    assert.equal(await prisma.competitor.count({ where: { siteId: site.id, domain: "facebook.com" } }), 0, "platforms are never competitors");
    const mention = await prisma.competitor.findUnique({ where: { siteId_domain: { siteId: site.id, domain: "rival-bikes.com" } } });
    assert.ok(mention, "content mention becomes a candidate");
    assert.equal(mention.verification, "speculative", "unreachable candidates stay speculative");
    assert.ok(getOnboardingStep("competitors"));

    await updateCompetitor(tenant.id, site.id, rival.id, { status: "accepted", name: "Rival Bikes", notes: "Main competitor" }, null);
    const coverage = await refreshCompetitorCoverage(tenant.id, site.id);
    assert.equal(coverage.sampled, 6);
    const opportunities = await prisma.contentOpportunity.findMany({ where: { siteId: site.id } });
    const kinds = new Set(opportunities.map((row) => row.kind));
    assert.ok(kinds.has("missing_topic"));
    assert.ok(kinds.has("improve_existing"));
    assert.ok(kinds.has("cannibalization_risk"));
    const battery = opportunities.find((row) => row.kind === "missing_topic" && row.topic === "Battery care");
    assert.ok(battery);
    assert.ok((battery.evidence as Array<{ url: string }>).every((entry) => entry.url.startsWith(`https://${RIVAL}/`)));
    assert.ok(opportunities.some((row) => row.kind === "missing_topic" && /cargo|trailers/.test(row.topic)));
    const rerun = await refreshCompetitorCoverage(tenant.id, site.id);
    assert.equal(rerun.opportunities.created, 0, "coverage refresh is idempotent");

    // Add to plan: concurrent clicks still yield exactly one proposal.
    const [a, b] = await Promise.all([addOpportunityToPlan(tenant.id, site.id, battery.id, {}, null), addOpportunityToPlan(tenant.id, site.id, battery.id, {}, null)]);
    assert.equal(a.planItem.id, b.planItem.id);
    const items = await prisma.editorialPlanItem.findMany({ where: { tenantId: tenant.id, siteId: site.id } });
    assert.equal(items.length, 1);
    assert.equal(items[0].status, "proposed");
    assert.equal(items[0].topic, "Battery care");
    assert.ok(items[0].rationale);
    assert.ok((items[0].sourceEvidence as unknown[]).length > 0);
    const plan = await prisma.editorialPlan.findUniqueOrThrow({ where: { id: items[0].planId } });
    assert.equal(plan.name, "Backlog");
    assert.equal(plan.status, "ready");
    const linked = await prisma.contentOpportunity.findUniqueOrThrow({ where: { id: battery.id } });
    assert.equal(linked.status, "planned");
    assert.equal(linked.planItemId, items[0].id);

    // Improve existing article → contentType "update" referencing the URL, via the HTTP route.
    const improve = opportunities.find((row) => row.kind === "improve_existing");
    assert.ok(improve);
    const app = Fastify();
    registerSourceRegistryRoutes(app);
    const response = await app.inject({ method: "POST", url: `/v2/sites/${site.id}/opportunities/${improve.id}/plan`, headers: { authorization: `Bearer ${apiKey}` }, payload: { mode: "update" } });
    assert.equal(response.statusCode, 201, response.body);
    const body = response.json() as { planItem: { contentType: string; metadata: { targetUrl: string }; planId: string; scheduledFor: string | null } };
    assert.equal(body.planItem.contentType, "update");
    assert.equal(body.planItem.metadata.targetUrl, `https://${SITE}/electric-bikes-guide`);
    assert.equal(body.planItem.planId, plan.id, "reuses the site's ready plan");
    assert.notEqual(body.planItem.scheduledFor?.slice(0, 10), items[0].scheduledFor?.toISOString().slice(0, 10), "next free day");
    const listed = await app.inject({ method: "GET", url: `/v2/sites/${site.id}/source-recommendations`, headers: { authorization: `Bearer ${apiKey}` } });
    assert.equal(listed.statusCode, 200);
    await app.close();

    // Remove keeps evidence and coverage history.
    await updateCompetitor(tenant.id, site.id, rival.id, { status: "removed" }, null);
    const removed = await prisma.competitor.findUniqueOrThrow({ where: { id: rival.id } });
    assert.equal(removed.status, "removed");
    assert.equal(removed.name, "Rival Bikes");
    assert.ok((removed.evidence as unknown[]).length >= evidence.length);
    assert.equal(await prisma.competitorCoverageSnapshot.count({ where: { competitorId: rival.id } }), 6);
  } finally {
    restoreFetch();
  }
});

test("SEC-02: discovery and coverage fetches reject private/loopback targets in production mode", async () => {
  const restoreFetch = installFetch();
  const previousEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  try {
    const { tenant, site } = await seed("sec02");
    await prisma.site.update({ where: { id: site.id }, data: { baseUrl: "http://127.0.0.1:4552" } });
    fetchedUrls.length = 0;
    const result = await discoverSourceRecommendations(tenant.id, site.id);
    assert.equal(result.verified, 0);
    assert.ok(!fetchedUrls.some((url) => /127\.0\.0\.1|10\.0\.0\./.test(url)), "no request reached a private host");
    assert.equal((await verifyFeedCandidate("http://127.0.0.1:4552/feed")).note, "blocked_url");
    assert.equal((await verifyFeedCandidate("http://10.0.0.5/feed")).note, "blocked_url");

    const competitor = await addCompetitorManually(tenant.id, site.id, { url: "http://10.0.0.5" }, null);
    assert.equal(competitor.verification, "speculative");
    await refreshCompetitorCoverage(tenant.id, site.id);
    assert.equal(await prisma.competitorCoverageSnapshot.count({ where: { competitorId: competitor.id } }), 0);
    assert.ok(!fetchedUrls.some((url) => /127\.0\.0\.1|10\.0\.0\./.test(url)));
  } finally {
    process.env.NODE_ENV = previousEnv;
    restoreFetch();
  }
});
