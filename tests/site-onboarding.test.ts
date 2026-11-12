import test from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import { getPrismaClient } from "../src/infrastructure/db/prisma";
import { closeEventPublisher } from "../src/studio/events";
import { sha256 } from "../src/shared/utils/hash";
import { registerStudioRoutes } from "../src/studio/routes";
import { createInstallation, storeInstallationCredentials, transitionInstallation } from "../src/studio/connectors/installation";
import { getSiteOnboarding, retrySiteOnboarding, startSiteOnboarding } from "../src/studio/onboarding/orchestrator";
import { getOnboardingStep, registerOnboardingStep, type OnboardingStepHandler } from "../src/studio/onboarding/contracts";
import { rebuildSiteProfile } from "../src/studio/site-intelligence/profile";

const prisma = getPrismaClient();

// The real "index" step crawls the network; tests inject pages instead and run the real profile rebuild.
let indexCalls = 0;
let indexGate: Promise<void> | null = null;
let indexFailuresLeft = 0;
const fakeIndex: OnboardingStepHandler = async ({ tenantId, siteId }) => {
  indexCalls += 1;
  if (indexGate) await indexGate;
  if (indexFailuresLeft > 0) {
    indexFailuresLeft -= 1;
    throw new Error("sitemap fetch timeout");
  }
  const site = await prisma.site.findFirstOrThrow({ where: { id: siteId, tenantId } });
  const base = site.baseUrl ?? "https://example.test";
  await prisma.siteIndexedPage.createMany({
    skipDuplicates: true,
    data: [
      ["recetas/tarta-de-queso", "Tarta de queso al horno", "guide"],
      ["recetas/pan-casero", "Pan casero paso a paso", "guide"],
      ["noticias/feria-gastronomica", "Feria gastronómica de otoño", "news"],
    ].map(([path, title, contentType]) => ({
      tenantId,
      siteId,
      url: `${base}/${path}`,
      title,
      h1: title,
      contentType,
      language: "es",
      wordCount: 900,
      crawlState: "extracted",
      modifiedAt: new Date(),
      lastIndexedAt: new Date(),
    })),
  });
  await rebuildSiteProfile(site);
  return { summary: "fake index", counts: { pages: 3 } };
};
registerOnboardingStep("index", fakeIndex);
const realStrategy = getOnboardingStep("strategy")!;

async function createTenant() {
  const seed = `onb-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  return prisma.tenant.create({ data: { name: seed, apiKeyHash: sha256(`${seed}-key`), status: "active" } });
}

async function createSite(tenantId: string) {
  return prisma.site.create({
    data: { tenantId, key: `s-${Math.random().toString(16).slice(2, 10)}`, name: "Cocina Test", type: "generic_rest", baseUrl: "https://cocina.example.test" },
  });
}

function buildServer(tenantId: string) {
  const server = Fastify();
  server.decorateRequest("tenantId", "");
  server.decorateRequest("studioPermissions", []);
  server.addHook("preHandler", async (request) => {
    request.tenantId = tenantId;
    request.studioPermissions = ["integrations.manage", "projects.manage", "publishing.manage", "analytics.read"];
  });
  registerStudioRoutes(server);
  return server;
}

async function waitForRun(tenantId: string, siteId: string) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const run = await getSiteOnboarding(tenantId, siteId);
    if (run && run.status !== "running") return run;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("onboarding did not finish");
}

async function readyWebsiteInstallation(tenantId: string) {
  const installation = await createInstallation({ tenantId, siteId: null, kind: "website", provider: "generic_rest", displayName: "Cocina" });
  await storeInstallationCredentials(tenantId, installation.id, { secrets: { apiToken: "test-token" }, config: { baseUrl: "https://cocina.example.test" } });
  await transitionInstallation(tenantId, installation.id, "ready", {});
  return installation;
}

test.before(() => {
  process.env.SOCIAL_TOKEN_ENCRYPTION_KEY = process.env.SOCIAL_TOKEN_ENCRYPTION_KEY || "test-only-encryption-key";
});

test.after(async () => {
  await closeEventPublisher();
  await prisma.$disconnect();
});

test("ONB-01: activating a website creates one onboarding run whose steps run in order", async () => {
  const tenant = await createTenant();
  const server = buildServer(tenant.id);
  const installation = await readyWebsiteInstallation(tenant.id);

  const response = await server.inject({ method: "POST", url: `/v2/connector-installations/${installation.id}/activate`, payload: {} });
  assert.equal(response.statusCode, 200, response.body);
  const body = response.json() as { siteId: string; initialization: { operationId: string; siteId: string } };
  assert.ok(body.initialization?.operationId, "activation returns the onboarding operation");
  const siteId = body.initialization.siteId;

  const run = await waitForRun(tenant.id, siteId);
  assert.deepEqual(run.steps.map((step) => step.id), ["index", "profile", "sources", "competitors", "strategy", "first_plan_offer"]);
  assert.deepEqual(run.steps.map((step) => step.status), ["succeeded", "succeeded", "skipped", "skipped", "succeeded", "succeeded"]);
  assert.equal(run.status, "succeeded");
  assert.ok(run.steps.every((step) => step.status === "skipped" || (step.startedAt && step.finishedAt)));
  assert.match(run.steps[2].summary ?? "", /not available/i);

  const operation = await prisma.operation.findUniqueOrThrow({ where: { id: body.initialization.operationId } });
  assert.equal(operation.type, "site_onboarding");
  assert.equal(operation.status, "succeeded");
  assert.equal(operation.totalSteps, 6);
  assert.equal(operation.completedSteps, 6);

  // Strategy is only suggested, never approved automatically; the plan is only offered.
  const strategy = await prisma.siteEditorialStrategy.findUniqueOrThrow({ where: { siteId } });
  assert.ok(strategy.suggested);
  assert.equal(strategy.approvedVersion, 0);
  const offer = await prisma.notification.findFirstOrThrow({ where: { tenantId: tenant.id, dedupeKey: `onboarding.${siteId}.first_plan` } });
  assert.equal(offer.actionUrl, `/studio/editorial-plan?siteId=${siteId}`);
  assert.equal(await prisma.editorialPlan.count({ where: { siteId } }), 0, "no plan is generated");

  const view = await server.inject({ method: "GET", url: `/v2/sites/${siteId}/onboarding` });
  assert.equal(view.statusCode, 200);
  const viewBody = view.json() as { run: { status: string; completedSteps: number }; operation: { id: string } };
  assert.equal(viewBody.run.status, "succeeded");
  assert.equal(viewBody.operation.id, body.initialization.operationId);
});

test("ONB-02: re-activation and repeated starts never duplicate the site, run or profiles", async () => {
  const tenant = await createTenant();
  const server = buildServer(tenant.id);
  const installation = await readyWebsiteInstallation(tenant.id);
  const first = await server.inject({ method: "POST", url: `/v2/connector-installations/${installation.id}/activate`, payload: {} });
  const siteId = (first.json() as { initialization: { siteId: string } }).initialization.siteId;
  await waitForRun(tenant.id, siteId);
  const callsAfterFirst = indexCalls;

  await transitionInstallation(tenant.id, installation.id, "expired", {});
  await transitionInstallation(tenant.id, installation.id, "credentials_required", {});
  await transitionInstallation(tenant.id, installation.id, "ready", {});
  const second = await server.inject({ method: "POST", url: `/v2/connector-installations/${installation.id}/activate`, payload: {} });
  assert.equal(second.statusCode, 200, second.body);
  assert.equal((second.json() as { initialization: { siteId: string } }).initialization.siteId, siteId);

  const again = await startSiteOnboarding(tenant.id, siteId, null, { trigger: "manual" });
  assert.equal(again.started, false, "a completed onboarding is not repeated");

  assert.equal(await prisma.site.count({ where: { tenantId: tenant.id } }), 1);
  assert.equal(await prisma.siteOnboardingRun.count({ where: { siteId } }), 1);
  assert.equal(await prisma.siteIntelligenceProfile.count({ where: { siteId } }), 1);
  assert.equal(await prisma.siteEditorialProfile.count({ where: { siteId } }), 1);
  assert.equal(await prisma.siteEditorialStrategy.count({ where: { siteId } }), 1);
  assert.equal(await prisma.operation.count({ where: { siteId, type: "site_onboarding" } }), 1);
  assert.equal(indexCalls, callsAfterFirst, "no second crawl");
});

test("a running onboarding is joined, not duplicated, and cannot be retried concurrently", async () => {
  const tenant = await createTenant();
  const site = await createSite(tenant.id);
  const server = buildServer(tenant.id);
  let release!: () => void;
  indexGate = new Promise((resolve) => (release = resolve));
  try {
    const first = await startSiteOnboarding(tenant.id, site.id, null);
    const second = await startSiteOnboarding(tenant.id, site.id, null);
    assert.equal(first.started, true);
    assert.equal(second.started, false);
    assert.equal(second.operationId, first.operationId);
    const retry = await server.inject({ method: "POST", url: `/v2/sites/${site.id}/onboarding/retry` });
    assert.equal(retry.statusCode, 409);
    const running = await getSiteOnboarding(tenant.id, site.id);
    assert.equal(running?.currentStep, "index");
    release();
    await first.promise;
  } finally {
    indexGate = null;
    release?.();
  }
  assert.equal((await getSiteOnboarding(tenant.id, site.id))?.status, "succeeded");
});

test("retry re-runs from the first failed/skipped step and keeps earlier results", async () => {
  const tenant = await createTenant();
  const site = await createSite(tenant.id);
  registerOnboardingStep("strategy", async () => {
    throw new Error("strategy provider unavailable");
  });
  try {
    const start = await startSiteOnboarding(tenant.id, site.id, null);
    await start.promise;
  } finally {
    registerOnboardingStep("strategy", realStrategy);
  }
  const failed = await waitForRun(tenant.id, site.id);
  assert.equal(failed.status, "failed");
  assert.equal(failed.steps.find((step) => step.id === "strategy")?.status, "failed");
  assert.equal(failed.steps.find((step) => step.id === "first_plan_offer")?.status, "succeeded", "a non-critical failure does not block later steps");
  const indexBefore = failed.steps[0];
  const calls = indexCalls;
  const operation = await prisma.operation.findUniqueOrThrow({ where: { id: failed.operationId! } });
  assert.equal(operation.status, "failed");

  const retried = await retrySiteOnboarding(tenant.id, site.id, null);
  assert.equal(retried.fromStep, "sources");
  await retried.promise;
  const after = await waitForRun(tenant.id, site.id);
  assert.equal(after.status, "succeeded");
  assert.deepEqual(after.steps[0], indexBefore, "index result kept, not re-run");
  assert.equal(after.steps[1].status, "succeeded");
  assert.equal(indexCalls, calls);
  assert.equal(after.steps.find((step) => step.id === "strategy")?.status, "succeeded");
  assert.notEqual(after.operationId, failed.operationId, "each pass is its own operation");
});

test("a failed critical step stops the pass; activation resumes from it", async () => {
  const tenant = await createTenant();
  const site = await createSite(tenant.id);
  indexFailuresLeft = 1;
  await (await startSiteOnboarding(tenant.id, site.id, null)).promise;
  const failed = await waitForRun(tenant.id, site.id);
  assert.equal(failed.steps[0].status, "failed");
  assert.match(failed.steps[0].error ?? "", /timeout/);
  assert.ok(failed.steps.slice(1).every((step) => step.status === "pending"));
  assert.equal(failed.retryFrom, "index");

  const resumed = await startSiteOnboarding(tenant.id, site.id, null, { trigger: "connection_activated" });
  assert.equal(resumed.started, true);
  await resumed.promise;
  assert.equal((await waitForRun(tenant.id, site.id)).status, "succeeded");
  assert.equal(await prisma.siteOnboardingRun.count({ where: { siteId: site.id } }), 1);
});

test("onboarding routes are tenant-scoped", async () => {
  const owner = await createTenant();
  const other = await createTenant();
  const site = await createSite(owner.id);
  const foreign = buildServer(other.id);
  assert.equal((await foreign.inject({ method: "GET", url: `/v2/sites/${site.id}/onboarding` })).statusCode, 404);
  assert.equal((await foreign.inject({ method: "POST", url: `/v2/sites/${site.id}/onboarding/retry` })).statusCode, 404);
  assert.equal((await foreign.inject({ method: "POST", url: `/v2/sites/${site.id}/onboarding` })).statusCode, 404);
  assert.equal(await prisma.siteOnboardingRun.count({ where: { siteId: site.id } }), 0);
});
