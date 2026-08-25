import test from "node:test";
import assert from "node:assert/strict";
import { getPrismaClient } from "../src/infrastructure/db/prisma";
import { sha256 } from "../src/shared/utils/hash";
import {
  canTransition,
  createInstallation,
  deleteInstallationDraft,
  getInstallation,
  listInstallations,
  storeInstallationCredentials,
  transitionInstallation,
  InvalidTransitionError,
} from "../src/studio/connectors/installation";

const prisma = getPrismaClient();

async function createTenant(): Promise<string> {
  const seed = `inst-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const tenant = await prisma.tenant.create({
    data: { name: seed, apiKeyHash: sha256(`${seed}-key`), status: "active" },
  });
  return tenant.id;
}

test.before(() => {
  process.env.SOCIAL_TOKEN_ENCRYPTION_KEY = process.env.SOCIAL_TOKEN_ENCRYPTION_KEY || "test-only-encryption-key";
});

test.after(async () => {
  await prisma.$disconnect();
});

test("state machine allows the happy path and rejects invalid transitions", () => {
  assert.equal(canTransition("draft", "discovering"), true);
  assert.equal(canTransition("discovering", "credentials_required"), true);
  assert.equal(canTransition("credentials_required", "verifying"), true);
  assert.equal(canTransition("verifying", "ready"), true);
  assert.equal(canTransition("ready", "active"), true);
  assert.equal(canTransition("active", "disabled"), true);
  assert.equal(canTransition("active", "expired"), true);
  assert.equal(canTransition("failed", "verifying"), true);
  assert.equal(canTransition("cancelled", "draft"), true);

  assert.equal(canTransition("draft", "active"), false, "cannot jump from draft to active");
  assert.equal(canTransition("active", "draft"), false, "cannot jump from active to draft");
  assert.equal(canTransition("discovering", "active"), false);
  assert.equal(canTransition("credentials_required", "active"), false, "activation requires verification first");
});

test("installations persist tenant-scoped and never expose secrets in views", async () => {
  const tenantA = await createTenant();
  const tenantB = await createTenant();

  const created = await createInstallation({
    tenantId: tenantA,
    siteId: null,
    kind: "website",
    provider: "generic_rest",
    displayName: "A test site",
  });
  assert.equal(created.state, "draft");
  assert.equal(created.kind, "website");

  const stored = await storeInstallationCredentials(tenantA, created.id, {
    secrets: { apiToken: "super-secret-token-123" },
    config: { baseUrl: "https://example.com", contentPath: "posts" },
    userId: null,
  });
  assert.equal(stored.hasCredentials, true);
  assert.ok(!JSON.stringify(stored).includes("super-secret-token-123"), "secret never appears in a view");

  const raw = await getInstallation(tenantA, created.id);
  assert.ok(raw?.credentialsCiphertext, "ciphertext persisted");
  assert.ok(!raw?.credentialsCiphertext?.includes("super-secret-token-123"));
  assert.ok(raw?.secretFingerprint, "fingerprint persisted");

  // Tenant scoping: B cannot see A's installation.
  assert.equal(await getInstallation(tenantB, created.id), null);
  assert.deepEqual((await listInstallations(tenantB, {})).map((item) => item.id), []);

  await deleteInstallationDraft(tenantA, created.id, null);
});

test("transitionInstallation validates transitions and audits them", async () => {
  const tenantId = await createTenant();
  const installation = await createInstallation({ tenantId, siteId: null, kind: "website", provider: "generic_webhook" });

  await assert.rejects(
    () => transitionInstallation(tenantId, installation.id, "active", {}),
    InvalidTransitionError,
  );

  await transitionInstallation(tenantId, installation.id, "discovering", {});
  await transitionInstallation(tenantId, installation.id, "credentials_required", {});
  const verifying = await transitionInstallation(tenantId, installation.id, "verifying", {});
  assert.equal(verifying.state, "verifying");
  const ready = await transitionInstallation(tenantId, installation.id, "ready", { patch: { verifiedAt: new Date() } });
  assert.equal(ready.state, "ready");
  assert.ok(ready.verifiedAt);

  const audits = await prisma.auditLog.findMany({
    where: { tenantId, entityType: "connector_installation", entityId: installation.id },
  });
  assert.ok(audits.length >= 4, "every transition is audited");

  await deleteInstallationDraft(tenantId, installation.id, null);
});

test("active installations cannot be deleted as drafts", async () => {
  const tenantId = await createTenant();
  const installation = await createInstallation({ tenantId, siteId: null, kind: "x", provider: "x_oauth" });
  await transitionInstallation(tenantId, installation.id, "credentials_required", {});
  await transitionInstallation(tenantId, installation.id, "verifying", {});
  await transitionInstallation(tenantId, installation.id, "ready", {});
  await transitionInstallation(tenantId, installation.id, "active", {});
  await assert.rejects(() => deleteInstallationDraft(tenantId, installation.id, null), /active_installation_cannot_be_deleted/);
});
