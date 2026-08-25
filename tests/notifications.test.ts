import test from "node:test";
import assert from "node:assert/strict";
import { getPrismaClient } from "../src/infrastructure/db/prisma";
import { sha256 } from "../src/shared/utils/hash";
import {
  archiveNotification,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  notify,
  setNotificationPreference,
} from "../src/studio/notifications";

const prisma = getPrismaClient();

async function createTenant(): Promise<string> {
  const seed = `notif-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const tenant = await prisma.tenant.create({
    data: { name: seed, apiKeyHash: sha256(`${seed}-key`), status: "active" },
  });
  return tenant.id;
}

test.after(async () => {
  await prisma.$disconnect();
});

test("notifications dedupe per tenant + dedupe key and update in place", async () => {
  const tenantId = await createTenant();
  const first = await notify({
    tenantId,
    category: "publication",
    severity: "warning",
    title: "Publication pending",
    message: "A publication requires review.",
    dedupeKey: "publication.review.1",
  });
  const second = await notify({
    tenantId,
    category: "publication",
    severity: "warning",
    title: "Publication pending",
    message: "A publication requires review.",
    dedupeKey: "publication.review.1",
  });
  assert.equal(first?.id, second?.id);

  const total = await prisma.notification.count({ where: { tenantId, dedupeKey: "publication.review.1" } });
  assert.equal(total, 1);
});

test("notification bodies never contain secrets or raw provider responses", async () => {
  const tenantId = await createTenant();
  await notify({
    tenantId,
    category: "connection",
    severity: "error",
    title: "Connection failed",
    message: "bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmnhSucgM6sYnWtGq6E9Kq0iHjN8R4 and api_key=abc123def456",
  });
  const rows = await prisma.notification.findMany({ where: { tenantId } });
  assert.ok(rows.length === 1);
  assert.ok(!rows[0].message.includes("eyJhbGciOiJIUzI1Ni"), "JWT redacted");
  assert.ok(!rows[0].message.includes("abc123def456"), "api key redacted");
});

test("read/archive lifecycle and unread counts are tenant-scoped", async () => {
  const tenantA = await createTenant();
  const tenantB = await createTenant();
  const a1 = await notify({ tenantId: tenantA, category: "system", severity: "info", title: "A one", message: "message" });
  await notify({ tenantId: tenantB, category: "system", severity: "info", title: "B one", message: "message" });

  const listA = await listNotifications(tenantA, {});
  assert.equal(listA.unread, 1);
  assert.ok(listA.items.every((item) => item.tenantId === tenantA));

  if (a1) {
    const read = await markNotificationRead(tenantA, a1.id, true);
    assert.ok(read.readAt);
    const unreadList = await listNotifications(tenantA, { unreadOnly: true });
    assert.equal(unreadList.unread, 0);

    await markNotificationRead(tenantA, a1.id, false);
    const archived = await archiveNotification(tenantA, a1.id, true);
    assert.ok(archived.archivedAt);
    const active = await listNotifications(tenantA, {});
    assert.equal(active.total, 0, "archived notifications leave the active inbox");
  }
});

test("mark all read is scoped and optional by category", async () => {
  const tenantId = await createTenant();
  await notify({ tenantId, category: "publication", severity: "info", title: "P1", message: "m" });
  await notify({ tenantId, category: "system", severity: "info", title: "S1", message: "m" });
  const result = await markAllNotificationsRead(tenantId, "publication");
  assert.equal(result.updated, 1);
  const list = await listNotifications(tenantId, {});
  assert.equal(list.unread, 1, "only the publication category was marked read");
});

test("notification preferences upsert per user and category", async () => {
  const tenantId = await createTenant();
  const userId = crypto.randomUUID();
  await setNotificationPreference(tenantId, userId, "publication", false);
  await setNotificationPreference(tenantId, userId, "publication", true);
  const rows = await prisma.notificationPreference.findMany({ where: { tenantId, userId } });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].enabled, true);
});
