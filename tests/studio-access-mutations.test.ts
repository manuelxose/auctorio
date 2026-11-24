import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import Fastify from "fastify";
import { getPrismaClient } from "../src/infrastructure/db/prisma";
import { sha256 } from "../src/shared/utils/hash";
import { acceptStudioInvitation, completeStudioSsoLogin, getStudioSessionByToken, listStudioRoles, loginStudioAccountWithPassword, sendStudioPasswordReset } from "../src/studio/auth";
import * as studioEmail from "../src/studio/email";
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

test("member update replaces roles atomically with name and status", async (t) => {
  const ws = await workspace(t);
  const other = await workspace(t);
  const owner = ws.owner!;
  const editor = await ws.member("atomic-editor", ["editor"]);
  const url = `/v2/users/${editor.id}`;
  const invalid = await owner.inject("PATCH", url, { displayName: "Should not persist", roleIds: [other.role("editor").id] });
  assert.equal(invalid.statusCode, 404, invalid.body);
  let member = await prisma.studioUser.findUniqueOrThrow({ where: { id: editor.id }, include: { roles: true } });
  assert.equal(member.displayName, "atomic-editor");
  assert.deepEqual(member.roles.map((role) => role.studioRoleId), [ws.role("editor").id]);
  assert.equal((await owner.inject("PATCH", url, { roleIds: ["not-a-uuid"] })).statusCode, 400);
  const updated = await owner.inject("PATCH", url, { displayName: "Updated editor", status: "suspended", roleIds: [ws.role("reviewer").id, ws.role("editor").id] });
  assert.equal(updated.statusCode, 200, updated.body);
  member = await prisma.studioUser.findUniqueOrThrow({ where: { id: editor.id }, include: { roles: true } });
  assert.equal(member.displayName, "Updated editor");
  assert.equal(member.status, "suspended");
  assert.deepEqual(new Set(member.roles.map((role) => role.studioRoleId)), new Set([ws.role("reviewer").id, ws.role("editor").id]));
  assert.equal(await getStudioSessionByToken(editor.token), null);
  const lastOwner = await owner.inject("PATCH", `/v2/users/${owner.id}`, { displayName: "Should roll back", roleIds: [] });
  assert.equal(lastOwner.statusCode, 409, lastOwner.body);
  assert.notEqual((await prisma.studioUser.findUniqueOrThrow({ where: { id: owner.id } })).displayName, "Should roll back");
  const delegate = await ws.member("atomic-admin", ["admin"]);
  const forbidden = await delegate.inject("PATCH", url, { displayName: "Forbidden", roleIds: [ws.role("owner").id] });
  assert.equal(forbidden.statusCode, 403, forbidden.body);
  assert.equal((await prisma.studioUser.findUniqueOrThrow({ where: { id: editor.id } })).displayName, "Updated editor");
});

async function inviteForLink(owner: NonNullable<Awaited<ReturnType<typeof workspace>>['owner']>, email: string) {
  const reply = await owner.inject("POST", "/v2/users/invitations", { email, roleKeys: ["editor"] });
  assert.equal(reply.statusCode, 201, reply.body);
  const invitation = reply.json<{ id: string; userId: string; delivery: string }>();
  assert.equal(invitation.delivery, "not_configured");
  const token = "workspace:" + randomUUID();
  await prisma.studioInvitation.update({
    where: { id: invitation.id },
    data: { tokenHash: "workspace:" + hashStudioToken(token) },
  });
  return { ...invitation, token };
}

test("revoking an invitation isolates its workspace and prevents replay after a fresh invitation", async (t) => {
  const first = await workspace(t);
  const second = await workspace(t);
  const actor = first.owner!;
  const other = second.owner!;
  const editor = await first.member("revocation-editor", ["editor"]);
  const email = randomUUID() + "@example.test";
  t.after(async () => { await prisma.studioAccount.deleteMany({ where: { email } }); });

  const revoked = await inviteForLink(actor, email);
  const remaining = await inviteForLink(other, email);
  const path = "/v2/users/" + revoked.userId + "/invitation";
  assert.equal((await editor.inject("DELETE", path)).statusCode, 403);
  assert.equal((await other.inject("DELETE", path)).statusCode, 404);
  assert.equal((await actor.inject("DELETE", path)).statusCode, 204);
  assert.equal((await actor.inject("PATCH", "/v2/users/" + revoked.userId, { status: "active" })).statusCode, 409);
  assert.equal((await prisma.studioInvitation.findUniqueOrThrow({ where: { id: revoked.id } })).status, "revoked");
  assert.equal((await prisma.studioInvitation.findUniqueOrThrow({ where: { id: remaining.id } })).status, "pending");

  const replacement = await inviteForLink(actor, email);
  const password = randomUUID();
  await assert.rejects(() => acceptStudioInvitation({ token: revoked.token, password }), /invite_invalid|invite_consumed/);
  const accepted = await acceptStudioInvitation({ token: remaining.token, password });
  assert.equal(accepted.session.tenant.id, second.tenant.id);
  const stillInvited = await prisma.studioUser.findUniqueOrThrow({ where: { id: replacement.userId } });
  assert.equal(stillInvited.status, "invited");
  await assert.rejects(() => loginStudioAccountWithPassword({ email, password, workspaceId: first.tenant.id }), /workspace_not_authorized|activation_required|user_not_authorized|user_not_invited/);
  await assert.rejects(() => acceptStudioInvitation({ token: replacement.token, password: randomUUID() }), /invalid_credentials/);
  const renewed = await acceptStudioInvitation({ token: replacement.token, password });
  assert.equal(renewed.session.tenant.id, first.tenant.id);
  assert.equal((await actor.inject("DELETE", "/v2/users/" + replacement.userId + "/invitation")).statusCode, 409);
});

test("acceptance and revocation reach one terminal state when they overlap", async (t) => {
  const ws = await workspace(t);
  const owner = ws.owner!;
  const email = randomUUID() + "@example.test";
  t.after(async () => { await prisma.studioAccount.deleteMany({ where: { email } }); });
  const invite = await inviteForLink(owner, email);
  const [acceptance, revocation] = await Promise.allSettled([
    acceptStudioInvitation({ token: invite.token, password: randomUUID() }),
    owner.inject("DELETE", "/v2/users/" + invite.userId + "/invitation"),
  ]);
  assert.equal(revocation.status, "fulfilled");
  if (revocation.status !== "fulfilled") return;
  const row = await prisma.studioInvitation.findUniqueOrThrow({ where: { id: invite.id } });
  if (acceptance.status === "fulfilled") {
    assert.equal(revocation.value.statusCode, 409);
    assert.equal(row.status, "accepted");
  } else {
    assert.match(String(acceptance.reason), /invite_invalid|invite_consumed/);
    assert.equal(revocation.value.statusCode, 204);
    assert.equal(row.status, "revoked");
  }
});

test("a legacy account link still admits its original workspace without accepting scoped invitations", async (t) => {
  const old = await workspace(t);
  const current = await workspace(t);
  const email = randomUUID() + "@example.test";
  t.after(async () => { await prisma.studioAccount.deleteMany({ where: { email } }); });
  const original = await inviteForLink(old.owner!, email);
  await prisma.studioInvitation.update({
    where: { id: original.id }, data: { tokenHash: hashStudioToken(randomUUID()) },
  });
  const scoped = await inviteForLink(current.owner!, email);
  const account = await prisma.studioAccount.findUniqueOrThrow({ where: { email } });
  const accountToken = randomUUID();
  await prisma.studioAccountToken.create({
    data: { accountId: account.id, kind: "activation", tokenHash: hashStudioToken(accountToken), expiresAt: new Date(Date.now() + 600_000) },
  });
  const password = randomUUID();
  const accepted = await acceptStudioInvitation({ token: accountToken, password, workspaceId: old.tenant.id });
  assert.equal(accepted.session.tenant.id, old.tenant.id);
  const pending = await prisma.studioInvitation.findUniqueOrThrow({
    where: { id: scoped.id }, include: { user: true },
  });
  assert.equal(pending.status, "pending");
  assert.equal(pending.user?.status, "invited");
});

test("an SSO workspace accepts its scoped invitation through the configured provider", async (t) => {
  const ws = await workspace(t);
  const slug = "sso-" + randomUUID();
  const issuer = "https://id.example.test";
  const email = randomUUID() + "@example.test";
  t.after(async () => { await prisma.studioAccount.deleteMany({ where: { email } }); });
  await prisma.tenant.update({ where: { id: ws.tenant.id }, data: { slug } });
  await prisma.studioIdentityProvider.create({
    data: { tenantId: ws.tenant.id, issuer, clientId: "test", enabled: true, provisioningMode: "invite_only" },
  });
  const invitation = await inviteForLink(ws.owner!, email);
  await assert.rejects(() => acceptStudioInvitation({ token: invitation.token, password: randomUUID() }), /password_login_not_available|user_not_authorized/);
  const identity = { slug, issuer, subject: randomUUID(), claims: { email, name: "Invited SSO user", email_verified: true } };
  await assert.rejects(() => completeStudioSsoLogin({ ...identity, issuer: "https://unrelated.example.test" }), /issuer|authorized|identity_provider_not_configured/);
  await assert.rejects(() => completeStudioSsoLogin({ ...identity, claims: { ...identity.claims, email_verified: false } }), /user_not_invited/);
  const before = await prisma.studioAccount.findUniqueOrThrow({ where: { email } });
  assert.equal(before.emailVerifiedAt, null);
  const login = await completeStudioSsoLogin(identity);
  assert.equal(login.session.tenant.id, ws.tenant.id);
  assert.equal(login.session.authMode, "oidc");
  assert.equal((await prisma.studioInvitation.findUniqueOrThrow({ where: { id: invitation.id } })).status, "accepted");
});

test("recovery rotates a pending scoped link without emailing other workspaces", async (t) => {
  const first = await workspace(t);
  const second = await workspace(t);
  const email = randomUUID() + "@example.test";
  t.after(async () => { await prisma.studioAccount.deleteMany({ where: { email } }); });
  const firstInvite = await inviteForLink(first.owner!, email);
  const secondInvite = await inviteForLink(second.owner!, email);
  await prisma.studioInvitation.update({
    where: { id: firstInvite.id }, data: { updatedAt: new Date(Date.now() - 120 * 60_000) },
  });
  await prisma.studioInvitation.update({
    where: { id: secondInvite.id }, data: { updatedAt: new Date(Date.now() - 90 * 60_000) },
  });
  await assert.rejects(() => acceptStudioInvitation({ token: secondInvite.token, password: randomUUID() }), /invite_expired/);
  const untouched = await prisma.studioInvitation.findUniqueOrThrow({ where: { id: firstInvite.id } });
  let recovered: string | null = null;
  t.mock.method(studioEmail, "isStudioEmailConfigured", () => true);
  const delivery = t.mock.method(studioEmail, "sendStudioEmail", async ({ to, text }: { to: string; text: string }) => {
    assert.equal(to, email);
    const url = text.match(/https?:\/\/[^\s]+/)?.[0];
    assert.ok(url);
    recovered = new URL(url).searchParams.get("invite");
  });
  await sendStudioPasswordReset(email);
  assert.equal(delivery.mock.callCount(), 1);
  assert.ok(recovered);
  assert.notEqual(recovered, secondInvite.token);
  const firstAfter = await prisma.studioInvitation.findUniqueOrThrow({ where: { id: firstInvite.id } });
  assert.equal(firstAfter.tokenHash, untouched.tokenHash);
  const password = randomUUID();
  await assert.rejects(() => acceptStudioInvitation({ token: secondInvite.token, password }), /invite_invalid|invite_consumed/);
  const session = await acceptStudioInvitation({ token: recovered, password });
  assert.equal(session.session.tenant.id, second.tenant.id);
});
