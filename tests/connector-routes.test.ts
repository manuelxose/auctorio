import test from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import { getPrismaClient } from "../src/infrastructure/db/prisma";
import { sha256 } from "../src/shared/utils/hash";
import { registerStudioRoutes } from "../src/studio/routes";
import { createInstallation, storeInstallationCredentials, transitionInstallation } from "../src/studio/connectors/installation";
import { createOperation } from "../src/studio/operations";
import { notify } from "../src/studio/notifications";

const prisma = getPrismaClient();

type Fixture = { tenantId: string };

async function createFixture(): Promise<Fixture> {
  const seed = `conn-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const tenant = await prisma.tenant.create({
    data: { name: seed, apiKeyHash: sha256(`${seed}-key`), status: "active" },
  });
  return { tenantId: tenant.id };
}

function buildServer(tenantId: string) {
  const server = Fastify();
  server.decorateRequest("tenantId", "");
  server.decorateRequest("studioPermissions", []);
  server.addHook("preHandler", async (request) => {
    request.tenantId = tenantId;
    request.studioPermissions = [
      "workspace.manage",
      "users.manage",
      "roles.manage",
      "prompts.manage",
      "projects.manage",
      "review.approve",
      "publishing.manage",
      "integrations.manage",
      "analytics.read",
    ];
  });
  registerStudioRoutes(server);
  return server;
}

test.before(() => {
  process.env.SOCIAL_TOKEN_ENCRYPTION_KEY = process.env.SOCIAL_TOKEN_ENCRYPTION_KEY || "test-only-encryption-key";
});

test.after(async () => {
  await prisma.$disconnect();
});

test("capabilities endpoint renders without authentication leaks", async () => {
  const fixture = await createFixture();
  const server = buildServer(fixture.tenantId);
  const response = await server.inject({ method: "GET", url: "/v2/connectors/capabilities" });
  assert.equal(response.statusCode, 200);
  const body = response.json() as { kinds: Array<{ kind: string }> };
  assert.ok(body.kinds.length >= 3);
});

test("cross-tenant user cannot read another tenant installation (IDOR)", async () => {
  const fixtureA = await createFixture();
  const fixtureB = await createFixture();
  const serverA = buildServer(fixtureA.tenantId);
  const serverB = buildServer(fixtureB.tenantId);

  const installation = await createInstallation({
    tenantId: fixtureB.tenantId,
    siteId: null,
    kind: "website",
    provider: "generic_rest",
    displayName: "B's site",
  });

  const foreign = await serverA.inject({ method: "GET", url: `/v2/connector-installations/${installation.id}` });
  assert.equal(foreign.statusCode, 404);

  const own = await serverB.inject({ method: "GET", url: `/v2/connector-installations/${installation.id}` });
  assert.equal(own.statusCode, 200);

  const foreignDiscover = await serverA.inject({
    method: "POST",
    url: `/v2/connector-installations/${installation.id}/discover`,
    payload: { url: "https://example.com" },
  });
  assert.equal(foreignDiscover.statusCode, 404);
});

test("installation detail never exposes credential material", async () => {
  const fixture = await createFixture();
  const server = buildServer(fixture.tenantId);
  const installation = await createInstallation({ tenantId: fixture.tenantId, siteId: null, kind: "website", provider: "generic_rest" });
  await storeInstallationCredentials(fixture.tenantId, installation.id, {
    secrets: { apiToken: "do-not-leak-this-token" },
    config: { baseUrl: "https://example.com" },
  });
  const response = await server.inject({ method: "GET", url: `/v2/connector-installations/${installation.id}` });
  assert.equal(response.statusCode, 200);
  const raw = response.body;
  assert.ok(!raw.includes("do-not-leak-this-token"), "credential material never returned");
  assert.ok(!raw.includes("credentialsCiphertext"));
});

test("invalid state transitions return conflict", async () => {
  const fixture = await createFixture();
  const server = buildServer(fixture.tenantId);
  const installation = await createInstallation({ tenantId: fixture.tenantId, siteId: null, kind: "website", provider: "generic_webhook" });

  // draft -> active is not allowed
  const activate = await server.inject({
    method: "POST",
    url: `/v2/connector-installations/${installation.id}/activate`,
    payload: {},
  });
  assert.equal(activate.statusCode, 409);

  // verification without credentials is rejected
  await transitionInstallation(fixture.tenantId, installation.id, "discovering", {});
  await transitionInstallation(fixture.tenantId, installation.id, "credentials_required", {});
  const verify = await server.inject({ method: "POST", url: `/v2/connector-installations/${installation.id}/verify` });
  assert.equal(verify.statusCode, 409);
});

test("operations and notifications are tenant-isolated", async () => {
  const fixtureA = await createFixture();
  const fixtureB = await createFixture();
  const serverA = buildServer(fixtureA.tenantId);

  const operationB = await createOperation({ tenantId: fixtureB.tenantId, type: "text_generation" });
  const notificationB = await notify({ tenantId: fixtureB.tenantId, category: "system", severity: "info", title: "B", message: "B" });

  const foreignOperation = await serverA.inject({ method: "GET", url: `/v2/operations/${operationB.id}` });
  assert.equal(foreignOperation.statusCode, 404);

  const foreignMarkRead = await serverA.inject({
    method: "POST",
    url: `/v2/notifications/${notificationB?.id}/read`,
    payload: { read: true },
  });
  assert.equal(foreignMarkRead.statusCode, 404);

  const listA = await serverA.inject({ method: "GET", url: "/v2/operations" });
  const listBody = listA.json() as { items: Array<{ tenantId: string }> };
  assert.ok(listBody.items.every((item) => item.tenantId === fixtureA.tenantId));

  const notifListA = await serverA.inject({ method: "GET", url: "/v2/notifications" });
  const notifBody = notifListA.json() as { items: Array<{ tenantId: string }> };
  assert.ok(notifBody.items.every((item) => item.tenantId === fixtureA.tenantId));
});

test("SSE stream requires an authenticated context", async () => {
  const anonymous = Fastify();
  anonymous.decorateRequest("tenantId", "");
  anonymous.addHook("preHandler", async (request) => {
    request.tenantId = "";
  });
  registerStudioRoutes(anonymous);
  const response = await anonymous.inject({ method: "GET", url: "/v2/events/stream" });
  assert.equal(response.statusCode, 401);
});
