import { randomUUID } from "node:crypto";
import test from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import { getPrismaClient } from "../src/infrastructure/db/prisma";
import { sha256 } from "../src/shared/utils/hash";
import { registerStudioRoutes } from "../src/studio/routes";
import { STUDIO_SYSTEM_ROLES, buildStudioProxySignature } from "../src/studio/security";
import {
  STUDIO_PERMISSIONS_HEADER,
  STUDIO_SESSION_HEADER,
  STUDIO_SIGNATURE_HEADER,
  STUDIO_TENANT_HEADER,
  STUDIO_TIMESTAMP_HEADER,
  STUDIO_USER_HEADER,
} from "../src/studio/http-utils";

// STUDIO-10: system internals and privileged settings are enforced by the API, not only hidden in the UI.
const prisma = getPrismaClient();

type Method = "GET" | "POST" | "PUT" | "PATCH";

/** Signs requests the way the Studio proxy does, so the API sees a real member's permissions. */
async function server(permissions: string[]) {
  const seed = `rbac-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const tenant = await prisma.tenant.create({ data: { name: seed, apiKeyHash: sha256(`${seed}-key`), status: "active" } });
  const app = Fastify();
  registerStudioRoutes(app);
  const ids = { tenantId: tenant.id, userId: randomUUID(), sessionId: randomUUID() };
  return {
    inject(method: Method, url: string) {
      const timestamp = String(Date.now());
      const signature = buildStudioProxySignature({ ...ids, permissions, timestamp, method, url });
      return app.inject({
        method,
        url,
        payload: method === "GET" ? undefined : {},
        headers: {
          [STUDIO_TENANT_HEADER]: ids.tenantId,
          [STUDIO_USER_HEADER]: ids.userId,
          [STUDIO_SESSION_HEADER]: ids.sessionId,
          [STUDIO_PERMISSIONS_HEADER]: permissions.join(","),
          [STUDIO_TIMESTAMP_HEADER]: timestamp,
          [STUDIO_SIGNATURE_HEADER]: signature,
        },
      });
    },
  };
}

const ADMIN_ONLY: Array<{ method: Method; url: string }> = [
  { method: "GET", url: "/v2/operations/health" },
  { method: "GET", url: "/v2/operations/metrics" },
  { method: "GET", url: "/v2/operations/release-preflight" },
  { method: "GET", url: "/v2/cost-controls" },
  { method: "GET", url: "/v2/automation/health" },
  { method: "GET", url: "/v2/health/workers" },
  { method: "PATCH", url: "/v2/automation" },
  { method: "POST", url: "/v2/automation/pause" },
  { method: "POST", url: "/v2/automation/recover" },
  { method: "PUT", url: "/v2/cost-controls" },
  { method: "POST", url: "/v2/roles" },
  { method: "POST", url: "/v2/users/invitations" },
];

test.after(async () => {
  await prisma.$disconnect();
});

for (const role of ["editor", "reviewer", "publisher", "seo_manager"]) {
  test(`${role} gets 403 on system internals and privileged settings`, async () => {
    const app = await server(STUDIO_SYSTEM_ROLES[role].permissions);
    for (const route of ADMIN_ONLY) {
      const response = await app.inject(route.method, route.url);
      assert.equal(response.statusCode, 403, `${role} ${route.method} ${route.url}`);
    }
  });
}

test("viewer without permissions is refused and editor cannot change sources", async () => {
  const viewer = await server([]);
  for (const route of ADMIN_ONLY) {
    const response = await viewer.inject(route.method, route.url);
    assert.equal(response.statusCode, 403, `viewer ${route.method} ${route.url}`);
  }
  const editor = await server(STUDIO_SYSTEM_ROLES.editor.permissions);
  assert.equal((await editor.inject("POST", "/v2/sources")).statusCode, 403);
});

test("regular members keep the plain automation summary; admins read internals", async () => {
  const editor = await server(STUDIO_SYSTEM_ROLES.editor.permissions);
  assert.equal((await editor.inject("GET", "/v2/automation/status")).statusCode, 200);

  const admin = await server(STUDIO_SYSTEM_ROLES.admin.permissions);
  assert.equal((await admin.inject("GET", "/v2/operations/metrics")).statusCode, 200);
  assert.equal((await admin.inject("GET", "/v2/cost-controls")).statusCode, 200);
});
