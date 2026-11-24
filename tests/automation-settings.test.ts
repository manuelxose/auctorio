import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import Fastify from "fastify";
import { getPrismaClient } from "../src/infrastructure/db/prisma";
import { sha256 } from "../src/shared/utils/hash";
import { getAutomationStatus, nextPolicyDay, startOfLocalDay } from "../src/studio/automation";
import { registerStudioRoutes } from "../src/studio/routes";
import { ensureAutoPublications } from "../src/studio/planner";

const prisma = getPrismaClient();

test("workspaces isolate automation settings and preserve pause and circuit state on save", async (t) => {
  const api = Fastify();
  registerStudioRoutes(api);
  const tenantIds: string[] = [];
  t.after(async () => {
    await api.close();
    await prisma.publication.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.contentVersion.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.contentProject.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.automationPolicy.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.site.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
    await prisma.$disconnect();
  });
  const createWorkspace = async () => {
    const key = randomUUID();
    const tenant = await prisma.tenant.create({ data: { name: key, apiKeyHash: sha256(key), status: "active" } });
    tenantIds.push(tenant.id);
    return { id: tenant.id, headers: { authorization: `Bearer ${key}` } };
  };
  const createSite = (tenantId: string) => prisma.site.create({
    data: { tenantId, key: randomUUID(), name: "Automation test", type: "webhook" },
  });
  const owner = await createWorkspace();
  const foreign = await createWorkspace();
  const [site, otherSite, foreignSite] = await Promise.all([
    createSite(owner.id), createSite(owner.id), createSite(foreign.id),
  ]);
  const base = "/v2/automation";
  const policy = () => api.inject({ method: "GET", url: `${base}?siteId=${site.id}`, headers: owner.headers });
  const patch = (input: Record<string, unknown>) =>
    api.inject({ method: "PATCH", url: base, headers: owner.headers, payload: { siteId: site.id, ...input } });
  const action = (name: string, siteId = site.id) =>
    api.inject({ method: "POST", url: `${base}/${name}`, headers: owner.headers, payload: { siteId, dryRun: true } });

  for (const read of [base, `${base}/status`]) {
    assert.equal((await api.inject({ method: "GET", url: `${read}?siteId=${foreignSite.id}`, headers: owner.headers })).statusCode, 404);
  }
  assert.equal((await patch({ siteId: foreignSite.id, mode: "manual" })).statusCode, 404);
  for (const name of ["pause", "resume", "recover"]) {
    assert.equal((await action(name, foreignSite.id)).statusCode, 404);
  }
  assert.equal((await patch({ timezone: "Invalid/Zone" })).statusCode, 400);
  assert.equal((await patch({ mode: "invalid" })).statusCode, 400);
  assert.equal((await patch({ publishingWindows: [{ channel: "website", days: [1], from: "12:00", to: "08:00" }] })).statusCode, 400);
  assert.equal(await prisma.automationPolicy.count({ where: { tenantId: owner.id } }), 0);

  const firstReads = await Promise.all([policy(), policy(), policy()]);
  assert.ok(firstReads.every((response) => response.statusCode === 200));
  assert.equal(new Set(firstReads.map((response) => response.json().id)).size, 1);
  assert.equal((await action("pause")).json().state, "paused");
  const manual = await patch({ mode: "manual", enabled: true, autoPublish: true });
  assert.deepEqual(
    [manual.statusCode, manual.json().mode, manual.json().enabled, manual.json().state, manual.json().autoPublish],
    [200, "manual", false, "paused", false],
  );
  const assisted = await patch({ mode: "assisted", articlesPerDay: 1, timezone: "Europe/Madrid", activeDaysOfWeek: [1],
    publishingWindows: [{ channel: "website", days: [1], from: "08:00", to: "08:30" }] });
  assert.equal(assisted.statusCode, 200, assisted.body);
  assert.equal(assisted.json().state, "paused");
  assert.deepEqual((await getAutomationStatus(owner.id, site.id)).nextSlots, []);
  assert.equal((await action("resume")).json().state, "active");

  const now = new Date("2027-03-28T10:00:00Z");
  const persisted = await prisma.automationPolicy.findUniqueOrThrow({ where: { id: assisted.json().id } });
  const dayStart = startOfLocalDay(persisted, now);
  assert.equal(dayStart.toISOString(), "2027-03-27T23:00:00.000Z");
  assert.equal(nextPolicyDay(persisted, dayStart).toISOString(), "2027-03-28T22:00:00.000Z");
  const project = await prisma.contentProject.create({ data: { tenantId: owner.id, siteId: otherSite.id, title: "Other site", brief: "Test", goal: "article" } });
  const version = await prisma.contentVersion.create({ data: { tenantId: owner.id, projectId: project.id, versionNumber: 1 } });
  await prisma.publication.create({
    data: { tenantId: owner.id, siteId: otherSite.id, projectId: project.id, versionId: version.id,
      channel: "website", status: "scheduled", scheduledFor: now },
  });
  const status = await getAutomationStatus(owner.id, site.id, now);
  assert.equal(status.today.articlesPlanned, 0);
  assert.deepEqual(status.nextSlots.find((slot) => slot.channel === "website"), { channel: "website", at: "2027-03-29T06:15:00.000Z" });
  assert.equal((await getAutomationStatus(owner.id, otherSite.id, now)).today.articlesPlanned, 1);
  const followupVersion = await prisma.contentVersion.create({ data: { tenantId: owner.id, projectId: project.id, versionNumber: 2 } });
  const otherPolicy = await prisma.automationPolicy.findFirstOrThrow({ where: { tenantId: owner.id, siteId: otherSite.id } });
  assert.equal(await ensureAutoPublications({ ...otherPolicy, publishingWindows: [] }, owner.id, project.id, followupVersion.id), 0);
  assert.equal(await prisma.publication.count({ where: { versionId: followupVersion.id } }), 0);

  await prisma.automationPolicy.update({
    where: { id: persisted.id }, data: { mode: "autopilot", state: "degraded", circuitOpen: true, autoPublish: false, maxRepairAttempts: 2 },
  });
  assert.equal((await action("resume")).statusCode, 409);
  assert.equal((await patch({ mode: "autopilot" })).statusCode, 409);
  const guarded = (await policy()).json();
  assert.deepEqual([guarded.state, guarded.autoPublish, guarded.circuitOpen], ["degraded", false, true]);
  await prisma.automationPolicy.update({ where: { id: persisted.id }, data: { circuitOpen: false } });
  const resumed = (await action("resume")).json();
  assert.deepEqual([resumed.state, resumed.autoPublish, resumed.maxRepairAttempts], ["active", true, 2]);
});
