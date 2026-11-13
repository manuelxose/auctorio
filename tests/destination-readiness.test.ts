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
