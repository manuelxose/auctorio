import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import Fastify from "fastify";
import { getPrismaClient } from "../src/infrastructure/db/prisma";
import { sha256 } from "../src/shared/utils/hash";
import { getStudioSessionByToken, listStudioRoles } from "../src/studio/auth";
import { registerStudioRoutes } from "../src/studio/routes";
import { buildStudioProxySignature, hashStudioToken, STUDIO_PERMISSIONS } from "../src/studio/security";

const prisma = getPrismaClient();
type Method = "GET" | "POST" | "PATCH" | "DELETE";

async function workspace(t: { after: (cleanup: () => Promise<void>) => void }, owner = true) {
  const seed = randomUUID();
  const apiKey = randomUUID();
  const tenant = await prisma.tenant.create({ data: { name: seed, apiKeyHash: sha256(apiKey), status: "active" } });
  const accountIds: string[] = [];
  const app = Fastify();
  registerStudioRoutes(app);
  t.after(async () => {
    await app.close();
    await prisma.tenant.delete({ where: { id: tenant.id } });
    await prisma.studioAccount.deleteMany({ where: { id: { in: accountIds } } });
  });
  const roles = await listStudioRoles(tenant.id);
  const role = (key: string) => roles.find((item) => item.key === key)!;

  async function member(name: string, keys: string[]) {
    const email = `${seed}-${name}@example.test`;
    const account = await prisma.studioAccount.create({ data: { email, displayName: name, status: "active" } });
    accountIds.push(account.id);
    const user = await prisma.studioUser.create({
      data: {
        tenantId: tenant.id, accountId: account.id, email, displayName: name, status: "active",
        roles: { create: keys.map((key) => ({ studioRoleId: role(key).id })) },
      },
    });
    const token = randomUUID();
    const session = await prisma.studioUserSession.create({
      data: {
        tenantId: tenant.id, studioUserId: user.id, tokenHash: hashStudioToken(token),
        expiresAt: new Date(Date.now() + 600_000),
      },
    });
    const permissions = keys.flatMap((key) => role(key).permissions);
    return {
      id: user.id, email, token,
      inject(method: Method, url: string, payload?: Record<string, unknown>) {
        const timestamp = String(Date.now());
        const signature = buildStudioProxySignature({
          tenantId: tenant.id, userId: user.id, sessionId: session.id, permissions, timestamp, method, url,
        });
        return app.inject({
          method, url, payload,
          headers: {
            "x-studio-tenant-id": tenant.id, "x-studio-user-id": user.id, "x-studio-session-id": session.id,
            "x-studio-permissions": permissions.join(","), "x-studio-timestamp": timestamp, "x-studio-signature": signature,
          },
        });
      },
    };
  }

  const asKey = (method: Method, url: string, payload?: Record<string, unknown>) =>
    app.inject({ method, url, payload, headers: { authorization: `Bearer ${apiKey}` } });
  return { tenant, roles, role, member, asKey, owner: owner ? await member("owner", ["owner"]) : null };
}

test("role and member mutations enforce delegation and workspace scope", async (t) => {
  const ws = await workspace(t);
  const other = await workspace(t);
  const owner = ws.owner!;
  const permissions = ["users.manage", "roles.manage", "projects.manage", "analytics.read"];
  const created = await owner.inject("POST", "/v2/roles", { name: "Delegate", permissions });
  assert.equal(created.statusCode, 201, created.body);
  ws.roles.push(created.json());
  const delegate = await ws.member("delegate", [created.json().key]);
  const editor = await ws.member("editor", ["editor"]);
  const member = `/v2/users/${editor.id}`;
  const customRole = `/v2/roles/${created.json().id}`;

  assert.equal((await delegate.inject("POST", `${member}/roles`, { roleId: ws.role("admin").id })).statusCode, 403);
  assert.equal((await delegate.inject("POST", "/v2/users/invitations", { email: "new@example.test", roleKeys: ["admin"] })).statusCode, 403);
  assert.equal((await delegate.inject("POST", "/v2/roles", { name: "Admin clone", cloneFromRoleId: ws.role("admin").id })).statusCode, 403);
  assert.equal((await delegate.inject("PATCH", customRole, { permissions: ["publishing.manage"] })).statusCode, 403);
  assert.equal((await editor.inject("POST", "/v2/roles", { name: "Editor clone" })).statusCode, 403);
  assert.equal((await delegate.inject("PATCH", `/v2/users/${owner.id}`, { status: "suspended" })).statusCode, 403);
  assert.equal((await owner.inject("PATCH", `/v2/users/${other.owner!.id}`, { status: "suspended" })).statusCode, 404);
  assert.equal((await owner.inject("POST", `${member}/roles`, { roleId: other.role("editor").id })).statusCode, 404);
  assert.equal((await owner.inject("POST", "/v2/roles", { name: "Foreign clone", cloneFromRoleId: other.role("editor").id })).statusCode, 404);
  assert.equal((await owner.inject("POST", "/v2/users/invitations", { email: owner.email, roleKeys: ["editor"] })).statusCode, 409);
  assert.equal((await owner.inject("PATCH", `/v2/roles/${ws.role("admin").id}`, { permissions: [] })).statusCode, 409);

  const updated = await delegate.inject("PATCH", customRole, { permissions: ["users.manage", "roles.manage"] });
  assert.equal(updated.statusCode, 200, updated.body);
  const forbidden = await delegate.inject("POST", `${member}/roles`, { roleId: ws.role("editor").id });
  assert.equal(forbidden.statusCode, 403);
  assert.deepEqual((await getStudioSessionByToken(delegate.token))?.permissions, ["roles.manage", "users.manage"]);

  assert.equal((await owner.inject("PATCH", member, { status: "suspended" })).statusCode, 200);
  assert.equal(await getStudioSessionByToken(editor.token), null);
  assert.equal((await owner.inject("PATCH", member, { status: "active" })).statusCode, 200);
  assert.equal(await getStudioSessionByToken(editor.token), null);
});

test("workspace transactions protect the last owner and concurrent removals of effective admins", async (t) => {
  const ws = await workspace(t);
  const owner = ws.owner!;
  assert.equal((await owner.inject("PATCH", `/v2/users/${owner.id}`, { status: "suspended" })).statusCode, 403);
  assert.equal((await owner.inject("DELETE", `/v2/users/${owner.id}/roles/${ws.role("owner").id}`)).statusCode, 409);
  const admin = await ws.member("admin", ["admin"]);
  assert.equal((await admin.inject("PATCH", `/v2/users/${owner.id}`, { status: "suspended" })).statusCode, 403);
  assert.equal(await prisma.studioUserRole.count({ where: { studioUserId: owner.id, studioRoleId: ws.role("owner").id } }), 1);

  const noOwner = await workspace(t, false);
  const custom = await noOwner.asKey("POST", "/v2/roles", { name: "Custom admin", permissions: [...STUDIO_PERMISSIONS] });
  assert.equal(custom.statusCode, 201, custom.body);
  noOwner.roles.push(custom.json());
  const a = await noOwner.member("a", [custom.json().key]);
  const b = await noOwner.member("b", ["admin"]);
  const results = await Promise.all([
    noOwner.asKey("PATCH", `/v2/roles/${custom.json().id}`, { permissions: [] }),
    noOwner.asKey("PATCH", `/v2/users/${b.id}`, { status: "suspended" }),
  ]);
  assert.deepEqual(results.map((response) => response.statusCode).sort(), [200, 409], results.map((response) => response.body).join("\n"));
  assert.equal(results.find((response) => response.statusCode === 409)?.json().message, "last_admin");
  const session = await getStudioSessionByToken(a.token);
  assert.ok(session);
});
