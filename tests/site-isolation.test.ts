import test from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import { getPrismaClient } from "../src/infrastructure/db/prisma";
import { sha256 } from "../src/shared/utils/hash";
import { registerStudioRoutes } from "../src/studio/routes";
import { buildEditorialPlanningContext } from "../src/studio/editorial-plan-context";
import { getSiteIntelligenceOverview, registerSearchTargets } from "../src/studio/site-intelligence";

const prisma = getPrismaClient();

type Fixture = {
  tenantId: string;
  siteGuiatv: string;
  siteTecnoria: string;
  sourceTecnoria: string;
};

async function createFixture(): Promise<Fixture> {
  const seed = `scope-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
  const tenant = await prisma.tenant.create({
    data: { name: seed, apiKeyHash: sha256(`${seed}-key`), status: "active" },
  });
  const guiatv = await prisma.site.create({
    data: { tenantId: tenant.id, key: `${seed}-guiatv`, name: "GuiaTV", type: "guiatv", baseUrl: "https://guiaprogramaciontv.example" },
  });
  const tecnoria = await prisma.site.create({
    data: { tenantId: tenant.id, key: `${seed}-tecnoria`, name: "Tecnoria", type: "tecnoria", baseUrl: "https://tecnoria.example" },
  });

  // Site intelligence for GuiaTV only.
  await prisma.siteIndexedPage.createMany({
    data: [
      {
        tenantId: tenant.id,
        siteId: guiatv.id,
        url: "https://guiaprogramaciontv.example/guia/hoy",
        title: "Guía de TV hoy",
        contentType: "schedule",
        crawlState: "extracted",
        wordCount: 900,
      },
      {
        tenantId: tenant.id,
        siteId: guiatv.id,
        url: "https://guiaprogramaciontv.example/donde-ver/x",
        title: "Dónde ver X",
        contentType: "where-to-watch",
        crawlState: "extracted",
        wordCount: 1400,
      },
    ],
  });
  await prisma.searchTarget.create({
    data: { tenantId: tenant.id, siteId: guiatv.id, query: "guia tv hoy", intent: "informational" },
  });

  // Tecnoria-only source and candidate.
  const source = await prisma.contentSource.create({
    data: { tenantId: tenant.id, siteId: tecnoria.id, name: `${seed}-tecnoria-source`, type: "rss", url: "https://tecnoria.example/feed" },
  });
  await prisma.sourceItem.create({
    data: {
      tenantId: tenant.id,
      sourceId: source.id,
      externalId: `${seed}-item-1`,
      title: "Tecnoria-only story about servers",
      contentHash: sha256(`${seed}-item-1`),
      processingStatus: "candidate",
      score: 90,
    },
  });

  return { tenantId: tenant.id, siteGuiatv: guiatv.id, siteTecnoria: tecnoria.id, sourceTecnoria: source.id };
}

async function cleanup(fixture: Fixture) {
  await prisma.sourceItem.deleteMany({ where: { tenantId: fixture.tenantId } });
  await prisma.contentSource.deleteMany({ where: { tenantId: fixture.tenantId } });
  await prisma.searchTarget.deleteMany({ where: { tenantId: fixture.tenantId } });
  await prisma.siteIndexedPage.deleteMany({ where: { tenantId: fixture.tenantId } });
  await prisma.siteSitemap.deleteMany({ where: { tenantId: fixture.tenantId } });
  await prisma.siteTopicCluster.deleteMany({ where: { tenantId: fixture.tenantId } });
  await prisma.siteEntity.deleteMany({ where: { tenantId: fixture.tenantId } });
  await prisma.siteInternalLink.deleteMany({ where: { tenantId: fixture.tenantId } });
  await prisma.siteIntelligenceProfile.deleteMany({ where: { tenantId: fixture.tenantId } });
  await prisma.editorialPlanItem.deleteMany({ where: { tenantId: fixture.tenantId } });
  await prisma.editorialPlan.deleteMany({ where: { tenantId: fixture.tenantId } });
  await prisma.site.deleteMany({ where: { tenantId: fixture.tenantId } });
  await prisma.tenant.deleteMany({ where: { id: fixture.tenantId } });
}

test.after(async () => {
  await prisma.$disconnect();
});

test("site intelligence overview is strictly site-scoped", async () => {
  const fixture = await createFixture();
  try {
    const guiatvOverview = await getSiteIntelligenceOverview(fixture.tenantId, fixture.siteGuiatv);
    assert.equal(guiatvOverview.totalPages, 2);
    assert.equal(guiatvOverview.extractedPages, 2);

    const tecnoriaOverview = await getSiteIntelligenceOverview(fixture.tenantId, fixture.siteTecnoria);
    assert.equal(tecnoriaOverview.totalPages, 0, "Tecnoria must not see GuiaTV indexed pages");
    assert.equal(tecnoriaOverview.extractedPages, 0);
  } finally {
    await cleanup(fixture);
  }
});

test("planner context for GuiaTV never injects Tecnoria-only sources or items", async () => {
  const fixture = await createFixture();
  try {
    const context = await buildEditorialPlanningContext(fixture.tenantId, fixture.siteGuiatv);
    assert.equal(context.indexedUrlInventory.length, 2);
    assert.ok(context.indexedUrlInventory.every((url) => url.includes("guiaprogramaciontv")));
    assert.ok(
      !context.evidence.some((entry) => entry.title.includes("Tecnoria-only")),
      "Tecnoria-only source item must not appear in GuiaTV evidence",
    );
    assert.ok(
      !context.sourceTitles.some((source) => source.title.includes("tecnoria-source")),
      "Tecnoria site-scoped source must not be suggested for GuiaTV",
    );
  } finally {
    await cleanup(fixture);
  }
});

test("search target registration is site-scoped", async () => {
  const fixture = await createFixture();
  try {
    await registerSearchTargets(fixture.tenantId, fixture.siteGuiatv, [{ query: "mejores series netflix" }]);
    const guiatvTargets = await prisma.searchTarget.count({ where: { tenantId: fixture.tenantId, siteId: fixture.siteGuiatv } });
    const tecnoriaTargets = await prisma.searchTarget.count({ where: { tenantId: fixture.tenantId, siteId: fixture.siteTecnoria } });
    assert.equal(guiatvTargets, 2);
    assert.equal(tecnoriaTargets, 0, "targets must never leak across sites");
  } finally {
    await cleanup(fixture);
  }
});

test("site intelligence routes reject cross-site access to inventory", async () => {
  const fixture = await createFixture();
  const server = Fastify();
  server.decorateRequest("tenantId", "");
  server.addHook("preHandler", async (request) => {
    request.tenantId = fixture.tenantId;
  });
  registerStudioRoutes(server);
  try {
    const pages = await server.inject({ method: "GET", url: `/v2/site-intelligence/${fixture.siteGuiatv}/pages` });
    assert.equal(pages.statusCode, 200);
    assert.equal((pages.json() as { total: number }).total, 2);

    const tecnoriaPages = await server.inject({ method: "GET", url: `/v2/site-intelligence/${fixture.siteTecnoria}/pages` });
    assert.equal(tecnoriaPages.statusCode, 200);
    assert.equal((tecnoriaPages.json() as { total: number }).total, 0, "cross-site inventory must be empty");
  } finally {
    await server.close();
    await cleanup(fixture);
  }
});
