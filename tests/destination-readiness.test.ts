import test from "node:test";
import assert from "node:assert/strict";
import { dedupeLegacyWebsiteAccounts, installationToConnection } from "../src/studio/destination-readiness";

const base = { id: "i1", displayName: "GuiaTV", verifiedAt: null, lastError: null, siteId: "s1", site: { name: "GuiaTV" } };

test("active installation without verification is not connected", () => {
  const c = installationToConnection(base);
  assert.equal(c.readiness, "not_verified");
  assert.equal(c.connectionState, "not_verified");
  assert.ok(c.reason);
});

test("verified installation is ready; lastError wins", () => {
  assert.equal(installationToConnection({ ...base, verifiedAt: new Date() }).connectionState, "connected");
  assert.equal(installationToConnection({ ...base, verifiedAt: new Date(), lastError: "x" }).readiness, "error");
});

test("legacy website account is hidden when an installation covers the site", () => {
  const accounts = [
    { platform: "website", siteId: "s1" },
    { platform: "website", siteId: "s2" },
    { platform: "x", siteId: "s1" },
  ];
  assert.deepEqual(dedupeLegacyWebsiteAccounts(accounts, [{ siteId: "s1" }]), [accounts[1], accounts[2]]);
});

import { normalizeOrigin, resolveSiteIdByOrigin, loadWebsiteDestinations } from "../src/studio/destination-readiness";
import { getPrismaClient } from "../src/infrastructure/db/prisma";
import { sha256 } from "../src/shared/utils/hash";

test("probe outcomes are separated and unknown stays null", () => {
  const caps = { verification: { probes: [{ probe: "auth", outcome: "passed" }, { probe: "draft_roundtrip", outcome: "failed" }] } };
  const c = installationToConnection({ ...base, verifiedAt: new Date(), capabilities: caps, configured: true });
  assert.equal(c.checks.authenticated, true);
  assert.equal(c.checks.canCreateDraft, false);
  assert.equal(c.checks.canPublish, null);
  assert.equal(c.checks.configured, true);
});

test("origin normalization and ambiguous matches", () => {
  assert.equal(normalizeOrigin("https://WWW.GuiaTV.example/path?x=1"), "https://guiatv.example");
  assert.equal(normalizeOrigin("not a url %%"), null);
  const sites = [{ id: "a", baseUrl: "https://guiatv.example" }, { id: "b", baseUrl: "https://guiatv.example/" }, { id: "c", baseUrl: "https://other.example" }];
  assert.equal(resolveSiteIdByOrigin("https://other.example/x", sites), "c");
  assert.equal(resolveSiteIdByOrigin("https://guiatv.example", sites), null);
});

test("synthetic GuiaTV installation without PublishingAccount appears once, not verified; tenants isolated", async () => {
  const prisma = getPrismaClient();
  const mk = async (tag: string) => {
    const seed = `dest-${tag}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    const tenant = await prisma.tenant.create({ data: { name: seed, apiKeyHash: sha256(seed), status: "active" } });
    const site = await prisma.site.create({ data: { tenantId: tenant.id, key: seed, name: "GuiaTV", type: "guiatv", baseUrl: "https://guiatv-dest.example" } });
    return { tenant, site };
  };
  const a = await mk("a");
  const b = await mk("b");
  try {
    await prisma.connectorInstallation.create({
      data: { tenantId: a.tenant.id, kind: "website", provider: "generic_webhook", state: "active", config: { baseUrl: "https://www.guiatv-dest.example/" }, credentialsCiphertext: "SECRET-CIPHERTEXT" },
    });
    const rowsA = await loadWebsiteDestinations(a.tenant.id);
    assert.equal(rowsA.length, 1);
    assert.equal(rowsA[0].siteId, a.site.id);
    assert.equal(rowsA[0].readiness, "not_verified");
    assert.equal(rowsA[0].checks.configured, true);
    assert.ok(!JSON.stringify(rowsA).includes("SECRET-CIPHERTEXT"));
    assert.equal((await loadWebsiteDestinations(b.tenant.id)).length, 0);
  } finally {
    await prisma.connectorInstallation.deleteMany({ where: { tenantId: { in: [a.tenant.id, b.tenant.id] } } });
    await prisma.site.deleteMany({ where: { tenantId: { in: [a.tenant.id, b.tenant.id] } } });
    await prisma.tenant.deleteMany({ where: { id: { in: [a.tenant.id, b.tenant.id] } } });
  }
});

import Fastify from "fastify";
import { registerStudioRoutes } from "../src/studio/routes";

function server(tenantId: string) {
  const s = Fastify();
  s.decorateRequest("tenantId", "");
  s.decorateRequest("studioPermissions", []);
  s.addHook("preHandler", async (r) => {
    r.tenantId = tenantId;
    r.studioPermissions = ["workspace.manage", "publishing.manage", "integrations.manage", "analytics.read"];
  });
  registerStudioRoutes(s);
  return s;
}

test("HTTP: overview dedupes legacy account, hides disabled/revoked, isolates tenants; list links site by origin", async () => {
  process.env.SOCIAL_TOKEN_ENCRYPTION_KEY = process.env.SOCIAL_TOKEN_ENCRYPTION_KEY || "test-only-encryption-key";
  const prisma = getPrismaClient();
  const seed = `dest-http-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const mkTenant = (n: string) => prisma.tenant.create({ data: { name: `${seed}-${n}`, apiKeyHash: sha256(`${seed}-${n}`), status: "active" } });
  const [ta, tb] = [await mkTenant("a"), await mkTenant("b")];
  const site = await prisma.site.create({ data: { tenantId: ta.id, key: seed, name: "GuiaTV", type: "guiatv", baseUrl: "https://guiatv-http.example" } });
  try {
    await prisma.publishingAccount.create({
      data: { tenantId: ta.id, siteId: site.id, platform: "website", displayName: "Legacy GuiaTV", status: "active", enabled: true },
    });
    const mk = (state: "active" | "disabled" | "cancelled" | "failed", extra: object = {}) =>
      prisma.connectorInstallation.create({
        data: { tenantId: ta.id, kind: "website", provider: "generic_webhook", state, siteId: site.id, config: { baseUrl: "https://guiatv-http.example" }, ...extra },
      });
    await mk("active");
    await mk("disabled");
    await mk("cancelled");
    await mk("failed");
    const a = server(ta.id);
    const res = await a.inject({ method: "GET", url: "/v2/overview" });
    assert.equal(res.statusCode, 200);
    const web = (res.json().connections as Array<{ platform: string; readiness?: string; displayName: string }>).filter((c) => c.platform === "website");
    assert.equal(web.length, 1, "legacy account + active install + non-active installs must collapse to one row");
    assert.equal(web[0].readiness, "not_verified");

    const b = await server(tb.id).inject({ method: "GET", url: "/v2/overview" });
    assert.equal((b.json().connections as unknown[]).length, 0);

    await prisma.connectorInstallation.deleteMany({ where: { tenantId: ta.id } });
    await prisma.connectorInstallation.create({
      data: { tenantId: ta.id, kind: "website", provider: "generic_webhook", state: "active", config: { baseUrl: "https://www.guiatv-http.example/" } },
    });
    const list = await a.inject({ method: "GET", url: "/v2/connector-installations" });
    assert.equal(list.json().items[0].siteId, site.id);
    assert.ok(!JSON.stringify(list.json()).includes("credentialsCiphertext"));
  } finally {
    const ids = [ta.id, tb.id];
    await prisma.connectorInstallation.deleteMany({ where: { tenantId: { in: ids } } });
    await prisma.publishingAccount.deleteMany({ where: { tenantId: { in: ids } } });
    await prisma.site.deleteMany({ where: { tenantId: { in: ids } } });
    await prisma.tenant.deleteMany({ where: { id: { in: ids } } });
  }
});

test("verification older than 30 days is stale, never connected", () => {
  const old = new Date(Date.now() - 31 * 24 * 3_600_000);
  const c = installationToConnection({ ...base, verifiedAt: old });
  assert.equal(c.readiness, "stale");
  assert.equal(c.connectionState, "stale");
  assert.equal(c.checks.capabilitiesVerified, false);
});

test("HTTP: legacy account only and Site only (no installation)", async () => {
  const prisma = getPrismaClient();
  const seed = `dest-leg-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const t = await prisma.tenant.create({ data: { name: seed, apiKeyHash: sha256(seed), status: "active" } });
  const site = await prisma.site.create({ data: { tenantId: t.id, key: seed, name: "Only", type: "guiatv", baseUrl: "https://only.example" } });
  try {
    const none = await server(t.id).inject({ method: "GET", url: "/v2/overview" });
    assert.equal((none.json().connections as unknown[]).length, 0, "a Site alone is not a destination");
    await prisma.publishingAccount.create({ data: { tenantId: t.id, siteId: site.id, platform: "website", displayName: "Legacy", status: "active", enabled: true } });
    const legacy = await server(t.id).inject({ method: "GET", url: "/v2/overview" });
    const rows = legacy.json().connections as Array<{ displayName: string }>;
    assert.equal(rows.length, 1);
    assert.equal(rows[0].displayName, "Legacy");
  } finally {
    await prisma.publishingAccount.deleteMany({ where: { tenantId: t.id } });
    await prisma.site.deleteMany({ where: { tenantId: t.id } });
    await prisma.tenant.deleteMany({ where: { id: t.id } });
  }
});

test("stage separates unconfigured / stored / authenticated / read-only / ready", () => {
  const auth = { verification: { probes: [{ probe: "auth", outcome: "passed" }] } };
  const noDraft = { verification: { probes: [{ probe: "auth", outcome: "passed" }, { probe: "draft_roundtrip", outcome: "failed" }] } };
  assert.equal(installationToConnection({ ...base, configured: false }).stage, "unconfigured");
  assert.equal(installationToConnection({ ...base, configured: true }).stage, "stored");
  assert.equal(installationToConnection({ ...base, configured: true, capabilities: auth }).stage, "authenticated");
  assert.equal(installationToConnection({ ...base, configured: true, verifiedAt: new Date(), capabilities: noDraft }).stage, "read_only");
  assert.equal(installationToConnection({ ...base, configured: true, verifiedAt: new Date(), capabilities: auth }).stage, "ready");
  assert.equal(installationToConnection({ ...base, configured: true, lastError: "x" }).stage, "error");
});

test("HTTP: /v2/overview?siteId scopes counts to the active site, not the tenant", async () => {
  const prisma = getPrismaClient();
  const seed = `dest-scope-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const t = await prisma.tenant.create({ data: { name: seed, apiKeyHash: sha256(seed), status: "active" } });
  const s1 = await prisma.site.create({ data: { tenantId: t.id, key: `${seed}-1`, name: "One", type: "guiatv" } });
  const s2 = await prisma.site.create({ data: { tenantId: t.id, key: `${seed}-2`, name: "Two", type: "tecnoria" } });
  try {
    await prisma.contentSource.create({ data: { tenantId: t.id, siteId: s1.id, name: "a", type: "rss" } });
    await prisma.contentSource.create({ data: { tenantId: t.id, siteId: s1.id, name: "b", type: "rss" } });
    await prisma.contentSource.create({ data: { tenantId: t.id, siteId: s2.id, name: "c", type: "rss" } });
    const get = async (q: string) => (await server(t.id).inject({ method: "GET", url: `/v2/overview${q}` })).json().sources.total;
    assert.equal(await get(""), 3);
    assert.equal(await get(`?siteId=${s1.id}`), 2);
    assert.equal(await get(`?siteId=${s2.id}`), 1);
    assert.equal(await get("?siteId=00000000-0000-4000-8000-000000000000"), 3, "unknown site id falls back, never leaks another tenant");
  } finally {
    await prisma.contentSource.deleteMany({ where: { tenantId: t.id } });
    await prisma.site.deleteMany({ where: { tenantId: t.id } });
    await prisma.tenant.deleteMany({ where: { id: t.id } });
  }
});

test("a site with stored publishing credentials shows as connected, without claiming a verification", async () => {
  const { legacySiteToConnection } = await import("../src/studio/destination-readiness");
  const connection = legacySiteToConnection({ id: "site-1", name: "Guia" });
  assert.equal(connection.connectionState, "connected");
  assert.equal(connection.lastVerifiedAt, null);
  assert.equal(connection.checks.capabilitiesVerified, false);
  assert.match(connection.reason, /not been checked/);
});
