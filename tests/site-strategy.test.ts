import test from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import { getPrismaClient } from "../src/infrastructure/db/prisma";
import { sha256 } from "../src/shared/utils/hash";
import { registerStudioRoutes } from "../src/studio/routes";
import { buildEditorialPlanningContext, renderPlanningContext } from "../src/studio/editorial-plan-context";
import { postValidatePlanItems } from "../src/studio/editorial-plan";
import type { EditorialPlanBriefV2 } from "../src/studio/editorial-plan-schema";
import { isExcludedByStrategy } from "../src/studio/site-relevance";
import {
  getStrategyLayers,
  listStrategyVersions,
  regenerateStrategySuggestion,
  restoreStrategyVersion,
  saveApprovedStrategy,
  strategyExclusions,
  EMPTY_STRATEGY,
} from "../src/studio/site-intelligence/strategy";

const prisma = getPrismaClient();

async function fixture() {
  const seed = `strat-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const tenant = await prisma.tenant.create({ data: { name: seed, apiKeyHash: sha256(`${seed}-key`), status: "active" } });
  const site = await prisma.site.create({
    data: { tenantId: tenant.id, key: seed, name: "Cocina y Liga", type: "generic_rest", locale: "es-ES", baseUrl: "https://cocina.example.test" },
  });
  // Detected layer: a crawl found a recipes cluster and a football cluster.
  await prisma.siteIntelligenceProfile.create({
    data: {
      tenantId: tenant.id,
      siteId: site.id,
      version: 3,
      indexedAt: new Date(),
      pageCount: 40,
      detectedSiteType: "generic_rest",
      detectedLanguage: "es",
      detectedAudience: "lectores generalistas",
      mainTopics: ["recetas", "postres", "cocina", "futbol", "liga"],
      excludedTopics: [],
      categories: ["recetas", "deportes"],
      contentTypes: [{ type: "guide", count: 25 }, { type: "news", count: 15 }],
      topicClusters: [
        { name: "recetas", slug: "recetas", pagesCount: 25, authorityScore: 1, gapScore: 0, keywords: ["tarta", "postres", "horno"], sampleUrls: [] },
        { name: "futbol", slug: "futbol", pagesCount: 15, authorityScore: 0.6, gapScore: 0, keywords: ["liga", "partido"], sampleUrls: [] },
      ],
      commercialTopics: [],
      evergreenTopics: ["guia", "como hacer"],
      newsTopics: ["noticias"],
      sportsTopics: ["futbol", "liga"],
      entities: [],
      warnings: [],
      internalLinkTargets: [],
    },
  });
  return { tenantId: tenant.id, siteId: site.id };
}

function item(title: string, topic: string, cluster: string): EditorialPlanBriefV2 {
  return {
    scheduledFor: "2026-12-02T10:00:00.000Z",
    channel: "website",
    contentType: "guide",
    newsOrEvergreen: "evergreen",
    topic,
    topicCluster: cluster,
    workingTitle: title,
    primaryIntent: "informational",
    secondaryIntents: [],
    targetQuery: title.toLowerCase(),
    primaryKeyword: topic,
    secondaryKeywords: [],
    suggestedInternalLinks: [],
    sourceEvidence: [],
    recommendedWordCountMin: 1000,
    recommendedWordCountMax: 1600,
  } as unknown as EditorialPlanBriefV2;
}

const planInput = {
  dateFrom: new Date("2026-12-01T00:00:00.000Z"),
  dateTo: new Date("2026-12-31T23:59:59.000Z"),
  publicationCount: 5,
  channels: ["website"] as Array<"website">,
};

const candidates = [
  item("Guía de recetas de postres con tarta al horno", "recetas", "recetas"),
  item("Guía de la liga de futbol: cómo seguir cada partido", "futbol", "futbol"),
];

test.after(async () => {
  await prisma.$disconnect();
});

test("isExcludedByStrategy matches whole words/phrases, accent-insensitive", () => {
  assert.equal(isExcludedByStrategy("Resumen de la Liga", null, ["liga"]), "liga");
  assert.equal(isExcludedByStrategy("Un resultado ligado al clima", null, ["liga"]), null);
  assert.equal(isExcludedByStrategy("Fútbol esta noche", null, ["futbol"]), "futbol");
  assert.equal(isExcludedByStrategy("Recetas", "postres", []), null);
  // Subtopics shared with an included pillar are not banned when another pillar is excluded.
  const exclusions = strategyExclusions({
    ...EMPTY_STRATEGY,
    pillars: [
      { name: "recetas", description: null, subtopics: ["horno"], keywords: [], weight: 1, included: true, clusterSlug: "recetas" },
      { name: "futbol", description: null, subtopics: ["liga", "horno"], keywords: [], weight: 1, included: false, clusterSlug: "futbol" },
    ],
  });
  assert.deepEqual(exclusions.sort(), ["futbol", "liga"]);
});

test("INT-01: the approved strategy drives the planning context and rejects excluded candidates", async () => {
  const { tenantId, siteId } = await fixture();

  // Before approval: inferred defaults, nothing excluded.
  const before = await buildEditorialPlanningContext(tenantId, siteId);
  assert.equal(before.approvedStrategy, null);
  const promptBefore = renderPlanningContext(before, { mode: "balanced" });
  assert.match(promptBefore, /AUDIENCE: lectores generalistas/);
  assert.doesNotMatch(promptBefore, /APPROVED EDITORIAL STRATEGY/);
  const resultBefore = postValidatePlanItems(candidates, planInput, before);
  assert.ok(!resultBefore.dropped.some((drop) => drop.reason.includes("excluded by approved strategy")));

  // Operator approves: football pillar excluded, audience changed, formats set.
  const saved = await saveApprovedStrategy(
    tenantId,
    siteId,
    {
      primaryAudience: "cocineros caseros",
      languages: ["es"],
      pillars: [
        { name: "recetas", subtopics: ["postres", "tarta"], weight: 3, included: true, clusterSlug: "recetas" },
        { name: "futbol", subtopics: ["liga", "partido"], weight: 1, included: false, clusterSlug: "futbol" },
      ],
      excludedTopics: ["alcohol"],
      preferredFormats: ["tutorial"],
      writingStyle: "Cercano y práctico",
    },
    { userId: null, note: "first approval" },
  );
  assert.equal(saved.version, 1);

  const after = await buildEditorialPlanningContext(tenantId, siteId);
  assert.equal(after.approvedStrategy?.version, 1);
  const promptAfter = renderPlanningContext(after, { mode: "balanced" });
  assert.match(promptAfter, /APPROVED EDITORIAL STRATEGY \(operator-approved v1/);
  assert.match(promptAfter, /AUDIENCE: cocineros caseros/);
  assert.match(promptAfter, /content pillars[^\n]*recetas \[100%\]/);
  assert.match(promptAfter, /EXCLUDED TOPICS: [^\n]*futbol/);
  assert.match(promptAfter, /PREFERRED CONTENT FORMATS: tutorial/);
  assert.match(promptAfter, /writing style: Cercano y práctico/);
  assert.ok(!after.clusters.some((cluster) => cluster.slug === "futbol"), "excluded pillar leaves the cluster list");
  assert.ok(!after.profile?.topicClusters.some((cluster) => cluster.slug === "futbol"));
  assert.ok(!after.profile?.mainTopics.includes("futbol"));
  assert.equal(after.profile?.detectedAudience, "cocineros caseros");

  const resultAfter = postValidatePlanItems(candidates, planInput, after);
  const footballDrop = resultAfter.dropped.find((drop) => drop.title.includes("liga de futbol"));
  assert.ok(footballDrop, "excluded pillar candidate is rejected after generation");
  assert.match(footballDrop!.reason, /excluded by approved strategy/);
  assert.ok(!resultAfter.dropped.some((drop) => drop.title.includes("postres") && drop.reason.includes("excluded by approved strategy")));

  // Including the pillar again (new version) lifts the exclusion; restoring v1 brings it back.
  const v2 = await saveApprovedStrategy(tenantId, siteId, { ...saved.config, pillars: saved.config.pillars.map((pillar) => ({ ...pillar, included: true })) }, { userId: null });
  assert.equal(v2.version, 2);
  const reopened = postValidatePlanItems(candidates, planInput, await buildEditorialPlanningContext(tenantId, siteId));
  assert.ok(!reopened.dropped.some((drop) => drop.reason.includes("excluded by approved strategy")));

  const restored = await restoreStrategyVersion(tenantId, siteId, 1, null);
  assert.equal(restored.version, 3);
  const versions = await listStrategyVersions(tenantId, siteId);
  assert.deepEqual(versions.map((version) => version.version), [3, 2, 1]);
  assert.equal(versions[0].restoredFromVersion, 1);
  const again = postValidatePlanItems(candidates, planInput, await buildEditorialPlanningContext(tenantId, siteId));
  assert.ok(again.dropped.some((drop) => drop.reason.includes("excluded by approved strategy")));
});

test("refreshing suggestions or the detected profile never overwrites the approved layer", async () => {
  const { tenantId, siteId } = await fixture();
  await saveApprovedStrategy(tenantId, siteId, { primaryAudience: "cocineros caseros", excludedTopics: ["alcohol"] }, { userId: null });
  const suggestion = await regenerateStrategySuggestion(tenantId, siteId);
  assert.equal(suggestion.generated, true);
  assert.match(suggestion.source ?? "", /^heuristic:/);
  await prisma.siteIntelligenceProfile.update({ where: { siteId }, data: { detectedAudience: "otro público", version: 4 } });
  await regenerateStrategySuggestion(tenantId, siteId);

  const layers = await getStrategyLayers(tenantId, siteId);
  assert.equal(layers.approved?.version, 1);
  assert.equal(layers.approved?.config.primaryAudience, "cocineros caseros");
  assert.equal(layers.suggested?.config.primaryAudience, "otro público");
  assert.equal(layers.detected?.audience, "otro público");
  // Provenance per field: approved where set, suggestion elsewhere.
  assert.equal(layers.provenance.primaryAudience, "approved");
  assert.equal(layers.provenance.pillars, "suggested");
  assert.equal(layers.effective.primaryAudience, "cocineros caseros");
  assert.ok(layers.suggested?.evidence.pillars, "suggestions state their evidence");
});

test("strategy routes: save versions, cluster include/exclude, coverage and tenant isolation", async () => {
  const { tenantId, siteId } = await fixture();
  const server = Fastify();
  server.decorateRequest("tenantId", "");
  server.decorateRequest("studioPermissions", []);
  server.addHook("preHandler", async (request) => {
    request.tenantId = tenantId;
    request.studioPermissions = ["projects.manage", "integrations.manage"];
  });
  registerStudioRoutes(server);
  await prisma.siteTopicCluster.create({ data: { tenantId, siteId, name: "guide", slug: "guide", pagesCount: 1, keywords: ["tarta", "pan"] } });
  await prisma.siteIndexedPage.create({
    data: { tenantId, siteId, url: "https://cocina.example.test/tarta", title: "Tarta de queso", contentType: "guide", crawlState: "extracted" },
  });

  const exclude = await server.inject({ method: "PATCH", url: `/v2/sites/${siteId}/strategy/pillars`, payload: { clusterSlug: "guide", included: false } });
  assert.equal(exclude.statusCode, 200, exclude.body);
  const excludeBody = exclude.json() as { version: number; layers: { approved: { config: { pillars: Array<{ name: string; included: boolean }> } } } };
  assert.equal(excludeBody.version, 1);
  assert.deepEqual(excludeBody.layers.approved.config.pillars.map((pillar) => [pillar.name, pillar.included]), [["guide", false]]);

  const edit = await server.inject({
    method: "PATCH",
    url: `/v2/sites/${siteId}/strategy/pillars`,
    payload: { clusterSlug: "guide", name: "Recetas", description: "Recetas caseras", keywords: ["tarta", "bizcocho"], included: true },
  });
  assert.equal((edit.json() as { version: number }).version, 2);

  const coverage = await server.inject({ method: "GET", url: `/v2/sites/${siteId}/strategy/clusters/guide/coverage` });
  assert.equal(coverage.statusCode, 200);
  const coverageBody = coverage.json() as { pages: unknown[]; gaps: string[]; proposalsUrl: string; coverage: Array<{ subtopic: string; pagesCovering: number }> };
  assert.equal(coverageBody.pages.length, 1);
  assert.ok(coverageBody.coverage.find((entry) => entry.subtopic === "tarta")!.pagesCovering >= 1);
  assert.ok(coverageBody.gaps.includes("pan"));
  assert.match(coverageBody.proposalsUrl, /\/studio\/editorial-plan\?siteId=.*&pillar=Recetas/);

  const put = await server.inject({ method: "PUT", url: `/v2/sites/${siteId}/strategy`, payload: { config: { primaryAudience: "x".repeat(900) }, note: "audience" } });
  assert.equal(put.statusCode, 200);
  assert.equal((put.json() as { config: { primaryAudience: string } }).config.primaryAudience.length, 500, "input is bounded");
  const versions = await server.inject({ method: "GET", url: `/v2/sites/${siteId}/strategy/versions` });
  assert.equal((versions.json() as { items: unknown[] }).items.length, 3);
  const pages = await server.inject({ method: "GET", url: `/v2/site-intelligence/${siteId}/pages?contentType=guide` });
  assert.equal((pages.json() as { total: number }).total, 1);

  const otherSeed = `strat-o-${Date.now()}`;
  const other = await prisma.tenant.create({ data: { name: otherSeed, apiKeyHash: sha256(otherSeed), status: "active" } });
  const foreign = Fastify();
  foreign.decorateRequest("tenantId", "");
  foreign.decorateRequest("studioPermissions", []);
  foreign.addHook("preHandler", async (request) => {
    request.tenantId = other.id;
    request.studioPermissions = ["projects.manage"];
  });
  registerStudioRoutes(foreign);
  assert.equal((await foreign.inject({ method: "GET", url: `/v2/sites/${siteId}/strategy` })).statusCode, 404);
  assert.equal((await foreign.inject({ method: "PUT", url: `/v2/sites/${siteId}/strategy`, payload: { config: {} } })).statusCode, 404);
  assert.equal((await foreign.inject({ method: "GET", url: `/v2/sites/${siteId}/strategy/versions` })).json().items.length, 0);
});
