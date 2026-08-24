import test from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import { getPrismaClient } from "../src/infrastructure/db/prisma";
import { sha256 } from "../src/shared/utils/hash";
import { registerStudioRoutes } from "../src/studio/routes";

const prisma = getPrismaClient();

type Fixture = { apiKey: string; tenantId: string };

async function createFixture(): Promise<Fixture> {
  const seed = `conn-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
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

test.after(async () => {
  await prisma.$disconnect();
});

test("GET /v2/social-connections lists connections and provider availability", async () => {
  const fixture = await createFixture();
  const server = buildServer(fixture.tenantId);
  try {
    const response = await server.inject({ method: "GET", url: "/v2/social-connections" });
    assert.equal(response.statusCode, 200);
    const payload = response.json() as {
      items: unknown[];
      provider: { provider: string; configured: boolean };
      callbackUrl: string;
    };
    assert.deepEqual(payload.items, []);
    assert.ok(payload.provider.provider.length > 0);
    assert.ok(payload.callbackUrl.endsWith("/v2/social-connections/callback"));
  } finally {
    await prisma.tenant.delete({ where: { id: fixture.tenantId } });
    await server.close();
  }
});

test("POST /v2/social-connections/session fails cleanly when no provider is configured", async () => {
  const fixture = await createFixture();
  const server = buildServer(fixture.tenantId);
  try {
    const response = await server.inject({
      method: "POST",
      url: "/v2/social-connections/session",
      payload: { platform: "instagram" },
    });
    assert.equal(response.statusCode, 503);
    const payload = response.json() as { error: { code: string; message: string } };
    assert.equal(payload.error.code, "connection_unavailable");
  } finally {
    await prisma.tenant.delete({ where: { id: fixture.tenantId } });
    await server.close();
  }
});

test("GET /v2/social-connections/setup exposes platform requirements", async () => {
  const fixture = await createFixture();
  const server = buildServer(fixture.tenantId);
  try {
    const response = await server.inject({ method: "GET", url: "/v2/social-connections/setup" });
    assert.equal(response.statusCode, 200);
    const payload = response.json() as { platforms: { x: { ready: boolean; requirement: string } } };
    assert.equal(typeof payload.platforms.x.ready, "boolean");
    assert.ok(payload.platforms.x.requirement.length > 0);
  } finally {
    await prisma.tenant.delete({ where: { id: fixture.tenantId } });
    await server.close();
  }
});

test("discovery settings roundtrip with limits clamping", async () => {
  const fixture = await createFixture();
  const server = buildServer(fixture.tenantId);
  try {
    const initial = await server.inject({ method: "GET", url: "/v2/discovery/settings" });
    assert.equal(initial.statusCode, 200);
    const initialPayload = initial.json() as { config: { mode: string; maxSearchesPerDay: number } };
    assert.equal(initialPayload.config.mode, "recommend");

    const patch = await server.inject({
      method: "PATCH",
      url: "/v2/discovery/settings",
      payload: { mode: "manual", maxSearchesPerDay: 7, maxScrapesPerDay: 42, enabled: true },
    });
    assert.equal(patch.statusCode, 200);
    const patched = patch.json() as { mode: string; maxSearchesPerDay: number; maxScrapesPerDay: number };
    assert.equal(patched.mode, "manual");
    assert.equal(patched.maxSearchesPerDay, 7);
    assert.equal(patched.maxScrapesPerDay, 42);
  } finally {
    await prisma.tenant.delete({ where: { id: fixture.tenantId } });
    await server.close();
  }
});

test("blocking and unblocking domains persists tenant-isolated", async () => {
  const fixtureA = await createFixture();
  const fixtureB = await createFixture();
  const server = buildServer(fixtureA.tenantId);
  try {
    const block = await server.inject({
      method: "POST",
      url: "/v2/discovery/domains/block",
      payload: { domain: "https://spam.example.org/path", reason: "low quality" },
    });
    assert.equal(block.statusCode, 200);

    const listed = await server.inject({ method: "GET", url: "/v2/discovery/blocked-domains" });
    const items = (listed.json() as { items: Array<{ domain: string; reason: string | null }> }).items;
    assert.equal(items.length, 1);
    assert.equal(items[0].domain, "spam.example.org");
    assert.equal(items[0].reason, "low quality");

    const otherTenant = buildServer(fixtureB.tenantId);
    const otherList = await otherTenant.inject({ method: "GET", url: "/v2/discovery/blocked-domains" });
    assert.deepEqual((otherList.json() as { items: unknown[] }).items, []);
    await otherTenant.close();

    const unblock = await server.inject({
      method: "POST",
      url: "/v2/discovery/domains/unblock",
      payload: { domain: "spam.example.org" },
    });
    assert.equal(unblock.statusCode, 200);
    const after = await server.inject({ method: "GET", url: "/v2/discovery/blocked-domains" });
    assert.deepEqual((after.json() as { items: unknown[] }).items, []);
  } finally {
    await prisma.tenant.delete({ where: { id: fixtureA.tenantId } });
    await prisma.tenant.delete({ where: { id: fixtureB.tenantId } });
    await server.close();
  }
});

test("legacy publishing-account creation still works (backward compatibility)", async () => {
  const fixture = await createFixture();
  const server = buildServer(fixture.tenantId);
  try {
    const create = await server.inject({
      method: "POST",
      url: "/v2/publishing-accounts",
      payload: { platform: "website", displayName: "Test site", externalAccountId: "test.example.com" },
    });
    assert.equal(create.statusCode, 201);
    const created = create.json() as { id: string; provider: string; hasCredentials: boolean };
    assert.equal(created.provider, "legacy");
    assert.equal(created.hasCredentials, false);

    const list = await server.inject({ method: "GET", url: "/v2/publishing-accounts" });
    const items = (list.json() as { items: Array<{ id: string }> }).items;
    assert.equal(items.length, 1);
    assert.equal(items[0].id, created.id);
  } finally {
    await prisma.tenant.delete({ where: { id: fixture.tenantId } });
    await server.close();
  }
});

test("worker health endpoint includes provider and connection status", async () => {
  const fixture = await createFixture();
  const server = buildServer(fixture.tenantId);
  try {
    const response = await server.inject({ method: "GET", url: "/v2/health/workers" });
    assert.equal(response.statusCode, 200);
    const payload = response.json() as {
      workers: unknown[];
      providers: { social: { configured: boolean }; webIntelligence: { configured: boolean } };
      connections: unknown[];
    };
    assert.ok(Array.isArray(payload.workers));
    assert.equal(typeof payload.providers.social.configured, "boolean");
    assert.equal(typeof payload.providers.webIntelligence.configured, "boolean");
    assert.ok(Array.isArray(payload.connections));
  } finally {
    await prisma.tenant.delete({ where: { id: fixture.tenantId } });
    await server.close();
  }
});
