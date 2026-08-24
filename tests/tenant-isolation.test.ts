import test from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import { getPrismaClient } from "../src/infrastructure/db/prisma";
import { sha256 } from "../src/shared/utils/hash";
import { registerStudioRoutes } from "../src/studio/routes";

const prisma = getPrismaClient();

type Fixture = { apiKey: string; tenantId: string };

async function createFixture(): Promise<Fixture> {
  const seed = `iso-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
  const tenant = await prisma.tenant.create({
    data: { name: seed, apiKeyHash: sha256(`${seed}-key`), status: "active" },
  });
  return { apiKey: `${seed}-key`, tenantId: tenant.id };
}

function buildServer(tenantId: string) {
  const server = Fastify();
  server.decorateRequest("tenantId", "");
  server.addHook("preHandler", async (request) => {
    request.tenantId = tenantId;
  });
  registerStudioRoutes(server);
  return server;
}

async function createSocialAccount(tenantId: string, platform: "x" | "instagram") {
  return prisma.publishingAccount.create({
    data: {
      tenantId,
      platform,
      displayName: `${platform}-iso-account`,
      provider: "direct",
      providerProfileId: `${platform}-profile-${Math.random().toString(16).slice(2, 8)}`,
      credentialsCiphertext: "v1:iv:tag:data",
      connectionStatus: "connected",
      status: "active",
    },
  });
}

test.after(async () => {
  await prisma.$disconnect();
});

test("tenant A cannot list, verify or disconnect tenant B social connections (IDOR)", async () => {
  const fixtureA = await createFixture();
  const fixtureB = await createFixture();
  const serverA = buildServer(fixtureA.tenantId);
  const serverB = buildServer(fixtureB.tenantId);
  try {
    const accountB = await createSocialAccount(fixtureB.tenantId, "x");

    // Tenant A's listing is empty even though B has a connection.
    const listA = await serverA.inject({ method: "GET", url: "/v2/social-connections" });
    assert.equal(listA.statusCode, 200);
    assert.deepEqual((listA.json() as { items: unknown[] }).items, []);

    // Tenant B sees its own connection.
    const listB = await serverB.inject({ method: "GET", url: "/v2/social-connections" });
    assert.equal((listB.json() as { items: Array<{ id: string }> }).items.length, 1);

    // Cross-tenant verify must 404, not leak state.
    const verify = await serverA.inject({
      method: "POST",
      url: `/v2/social-connections/${accountB.id}/verify`,
    });
    assert.equal(verify.statusCode, 404);

    // Cross-tenant reconnect must 404.
    const reconnect = await serverA.inject({
      method: "POST",
      url: `/v2/social-connections/${accountB.id}/reconnect`,
    });
    assert.equal(reconnect.statusCode, 404);

    // Cross-tenant disconnect must 404 and leave B's account intact.
    const disconnect = await serverA.inject({
      method: "DELETE",
      url: `/v2/social-connections/${accountB.id}`,
    });
    assert.equal(disconnect.statusCode, 404);
    const stillThere = await prisma.publishingAccount.findUnique({ where: { id: accountB.id } });
    assert.ok(stillThere);
  } finally {
    await prisma.tenant.delete({ where: { id: fixtureA.tenantId } });
    await prisma.tenant.delete({ where: { id: fixtureB.tenantId } });
    await serverA.close();
    await serverB.close();
  }
});

test("discovery settings are strictly per-tenant", async () => {
  const fixtureA = await createFixture();
  const fixtureB = await createFixture();
  const serverA = buildServer(fixtureA.tenantId);
  const serverB = buildServer(fixtureB.tenantId);
  try {
    const patch = await serverA.inject({
      method: "PATCH",
      url: "/v2/discovery/settings",
      payload: { maxSearchesPerDay: 13, maxScrapesPerDay: 37 },
    });
    assert.equal(patch.statusCode, 200);

    const configA = (await serverA.inject({ method: "GET", url: "/v2/discovery/settings" })).json() as {
      config: { maxSearchesPerDay: number; maxScrapesPerDay: number };
    };
    const configB = (await serverB.inject({ method: "GET", url: "/v2/discovery/settings" })).json() as {
      config: { maxSearchesPerDay: number; maxScrapesPerDay: number };
    };
    assert.equal(configA.config.maxSearchesPerDay, 13);
    assert.equal(configA.config.maxScrapesPerDay, 37);
    assert.equal(configB.config.maxSearchesPerDay, 100); // untouched defaults
    assert.equal(configB.config.maxScrapesPerDay, 250);
  } finally {
    await prisma.tenant.delete({ where: { id: fixtureA.tenantId } });
    await prisma.tenant.delete({ where: { id: fixtureB.tenantId } });
    await serverA.close();
    await serverB.close();
  }
});

test("discovery run refuses when no web intelligence provider is configured (409)", async () => {
  const fixture = await createFixture();
  const server = buildServer(fixture.tenantId);
  try {
    // Tests run without FIRECRAWL_API_KEY/TAVILY_API_KEY; the endpoint must
    // fail fast with an actionable 409 instead of silently queueing.
    const run = await server.inject({ method: "POST", url: "/v2/discovery/run" });
    assert.equal(run.statusCode, 409);
    const body = run.json() as { error: { code: string; message: string } };
    assert.equal(body.error.code, "web_intelligence_provider_not_configured");
  } finally {
    await prisma.tenant.delete({ where: { id: fixture.tenantId } });
    await server.close();
  }
});
