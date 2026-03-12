import test from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import { getPrismaClient } from "../src/infrastructure/db/prisma";
import { sha256 } from "../src/shared/utils/hash";
import { registerStudioRoutes } from "../src/studio/routes";

const prisma = getPrismaClient();

type Fixture = {
  apiKey: string;
  tenantId: string;
  siteId: string;
  projectId: string;
};

async function createFixture(): Promise<Fixture> {
  const seed = `studio-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
  const apiKey = `${seed}-key`;
  const tenant = await prisma.tenant.create({
    data: {
      name: seed,
      apiKeyHash: sha256(apiKey),
      status: "active",
    },
  });

  const site = await prisma.site.create({
    data: {
      tenantId: tenant.id,
      key: `${seed}-site`,
      name: "Studio Test Site",
      type: "webhook",
      locale: "es-ES",
      baseUrl: "https://example.test",
    },
  });

  const project = await prisma.contentProject.create({
    data: {
      tenantId: tenant.id,
      siteId: site.id,
      title: "Proyecto de prueba",
      brief: "Brief de prueba para los listados del studio",
      goal: "article",
      primaryLanguage: "es",
      status: "draft",
    },
  });

  await prisma.contentVersion.create({
    data: {
      tenantId: tenant.id,
      projectId: project.id,
      versionNumber: 1,
      status: "draft",
      title: "Version inicial",
      excerpt: "Resumen inicial",
      bodyHtml: "<p>Contenido de prueba suficientemente largo para el listado.</p>",
      seoTitle: "SEO Version inicial",
      seoDescription: "Descripcion SEO inicial",
    },
  });

  return {
    apiKey,
    tenantId: tenant.id,
    siteId: site.id,
    projectId: project.id,
  };
}

async function cleanupFixture(tenantId: string) {
  await prisma.publicationJob.deleteMany({ where: { tenantId } });
  await prisma.contentDerivative.deleteMany({ where: { tenantId } });
  await prisma.contentVersion.deleteMany({ where: { tenantId } });
  await prisma.contentProject.deleteMany({ where: { tenantId } });
  await prisma.assetVariant.deleteMany({ where: { tenantId } });
  await prisma.contentImage.deleteMany({ where: { tenantId } });
  await prisma.contentText.deleteMany({ where: { tenantId } });
  await prisma.fact.deleteMany({ where: { tenantId } });
  await prisma.topic.deleteMany({ where: { tenantId } });
  await prisma.site.deleteMany({ where: { tenantId } });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
}

function buildStudioTestServer(tenantId: string) {
  const server = Fastify();
  server.decorateRequest("tenantId", "");
  server.addHook("preHandler", async (request) => {
    request.tenantId = tenantId;
  });
  registerStudioRoutes(server);
  return server;
}

test.after(async () => {
  await prisma.$disconnect();
});

test("GET /v2/sites returns paginated site summaries", async () => {
  const fixture = await createFixture();
  const server = buildStudioTestServer(fixture.tenantId);

  try {
    const response = await server.inject({
      method: "GET",
      url: "/v2/sites?page=1&pageSize=10",
    });

    assert.equal(response.statusCode, 200);
    const payload = response.json() as {
      items: Array<{
        id: string;
        key: string;
        projectCount: number;
      }>;
      total: number;
    };

    assert.equal(payload.total, 1);
    assert.equal(payload.items.length, 1);
    assert.equal(payload.items[0]?.id, fixture.siteId);
    assert.equal(payload.items[0]?.projectCount, 1);
  } finally {
    await server.close();
    await cleanupFixture(fixture.tenantId);
  }
});

test("GET /v2/projects returns filtered project summaries", async () => {
  const fixture = await createFixture();
  const server = buildStudioTestServer(fixture.tenantId);

  try {
    const response = await server.inject({
      method: "GET",
      url: `/v2/projects?siteId=${fixture.siteId}&status=draft&page=1&pageSize=10`,
    });

    assert.equal(response.statusCode, 200);
    const payload = response.json() as {
      items: Array<{
        id: string;
        site: { id: string; key: string };
        latestVersion: { title: string | null } | null;
      }>;
      total: number;
    };

    assert.equal(payload.total, 1);
    assert.equal(payload.items.length, 1);
    assert.equal(payload.items[0]?.id, fixture.projectId);
    assert.equal(payload.items[0]?.site.id, fixture.siteId);
    assert.equal(payload.items[0]?.latestVersion?.title, "Version inicial");
  } finally {
    await server.close();
    await cleanupFixture(fixture.tenantId);
  }
});

test("GET /v2/session/me returns tenant session summary", async () => {
  const fixture = await createFixture();
  const server = buildStudioTestServer(fixture.tenantId);

  try {
    const response = await server.inject({
      method: "GET",
      url: "/v2/session/me",
    });

    assert.equal(response.statusCode, 200);
    const payload = response.json() as {
      tenant: { id: string; name: string; status: string };
      siteCount: number;
      projectCount: number;
    };

    assert.equal(payload.tenant.id, fixture.tenantId);
    assert.equal(payload.siteCount, 1);
    assert.equal(payload.projectCount, 1);
  } finally {
    await server.close();
    await cleanupFixture(fixture.tenantId);
  }
});
