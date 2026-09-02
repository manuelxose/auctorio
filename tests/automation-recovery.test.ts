// Phase 6 — automation recovery: tenant isolation, manual-project safety and
// the approved → scheduled recovery action. Dry-run is non-mutating.

import test from "node:test";
import assert from "node:assert/strict";
import { getPrismaClient } from "../src/infrastructure/db/prisma";
import { sha256 } from "../src/shared/utils/hash";
import { recoverStuckAutoProjects } from "../src/studio/automation-recovery";

const prisma = getPrismaClient();

test.after(async () => {
  await prisma.$disconnect();
});

async function createTenant(seed: string): Promise<{ tenantId: string; siteId: string }> {
  const tenant = await prisma.tenant.create({
    data: { name: seed, apiKeyHash: sha256(`${seed}-key`), status: "active" },
  });
  const site = await prisma.site.create({
    data: { tenantId: tenant.id, key: seed, name: seed, type: "guiatv", locale: "es-ES", baseUrl: "https://example.test" },
  });
  return { tenantId: tenant.id, siteId: site.id };
}

async function cleanup(tenantId: string): Promise<void> {
  await prisma.auditLog.deleteMany({ where: { tenantId } });
  await prisma.notification.deleteMany({ where: { tenantId } });
  await prisma.publication.deleteMany({ where: { tenantId } });
  await prisma.qualityRepairAttempt.deleteMany({ where: { tenantId } });
  await prisma.contentVersion.deleteMany({ where: { tenantId } });
  await prisma.contentProject.deleteMany({ where: { tenantId } });
  await prisma.assetVariant.deleteMany({ where: { tenantId } });
  await prisma.contentImage.deleteMany({ where: { tenantId } });
  await prisma.fact.deleteMany({ where: { tenantId } });
  await prisma.topic.deleteMany({ where: { tenantId } });
  await prisma.automationPolicy.deleteMany({ where: { tenantId } });
  await prisma.site.deleteMany({ where: { tenantId } });
  await prisma.tenant.delete({ where: { id: tenantId } });
}

async function seedProject(
  tenantId: string,
  siteId: string,
  seed: string,
  origin: "auto" | "manual",
  status: "qa_failed" | "approved",
): Promise<string> {
  const project = await prisma.contentProject.create({
    data: {
      tenantId,
      siteId,
      title: `Proyecto ${seed}`,
      brief: "Brief",
      origin,
      status,
      automationMode: origin === "auto" ? "autopilot" : null,
    },
  });
  await prisma.contentVersion.create({
    data: {
      tenantId,
      projectId: project.id,
      versionNumber: 1,
      status: status === "approved" ? "approved" : "qa_failed",
      title: "Título de prueba con longitud suficiente",
      excerpt: "Extracto de prueba.",
      bodyHtml: `<h2>Sección</h2>${"<p>Contenido de prueba verificado y útil.</p>".repeat(40)}`,
      seoTitle: "SEO título de prueba",
      seoDescription: "Meta descripción de prueba con suficiente longitud y utilidad para el lector.",
      qaReport: status === "approved"
        ? { passed: true, score: 95, checks: [], findings: [] }
        : { passed: false, score: 20, checks: [], findings: [{ key: "title_present", label: "Título", passed: false, severity: "error", message: "Falta el título", group: "structural" }] },
    },
  });
  return project.id;
}

async function seedPolicy(tenantId: string, siteId: string): Promise<void> {
  await prisma.automationPolicy.create({
    data: {
      tenantId,
      siteId,
      enabled: true,
      state: "active",
      mode: "autopilot",
      autoGenerate: true,
      autoRepair: true,
      autoApprove: true,
      autoSchedule: true,
      autoPublish: true,
      articlesPerDay: 2,
      xPostsPerDay: 0,
      instagramPostsPerDay: 0,
      socialRequired: false,
      publishingWindows: [{ channel: "website", days: [0, 1, 2, 3, 4, 5, 6], from: "00:00", to: "23:59" }],
    },
  });
}

test("dry-run is tenant-scoped, ignores manual projects and mutates nothing", async () => {
  const a = await createTenant(`rec-a-${Date.now()}`);
  const b = await createTenant(`rec-b-${Date.now()}`);
  try {
    await seedPolicy(a.tenantId, a.siteId);
    await seedPolicy(b.tenantId, b.siteId);
    const autoA = await seedProject(a.tenantId, a.siteId, "autoA", "auto", "qa_failed");
    await seedProject(a.tenantId, a.siteId, "manualA", "manual", "qa_failed");
    const autoB = await seedProject(b.tenantId, b.siteId, "autoB", "auto", "qa_failed");

    const report = await recoverStuckAutoProjects({ tenantId: a.tenantId, dryRun: true });

    // Only tenant A's automatic project is visible; its manual project and
    // tenant B are out of scope.
    assert.equal(report.scanned, 1);
    assert.equal(report.items.length, 1);
    assert.equal(report.items[0]!.projectId, autoA);
    assert.ok(!report.items.some((item) => item.projectId === autoB));
    assert.equal(report.acted, 0);

    // Dry-run must not mutate anything.
    const project = await prisma.contentProject.findUnique({ where: { id: autoA } });
    assert.equal(project?.status, "qa_failed");
    assert.equal(project?.automationSubstate, null);
  } finally {
    await cleanup(a.tenantId);
    await cleanup(b.tenantId);
  }
});

test("live recovery schedules publications for approved autopilot projects", async () => {
  const tenant = await createTenant(`rec-live-${Date.now()}`);
  try {
    await seedPolicy(tenant.tenantId, tenant.siteId);
    const projectId = await seedProject(tenant.tenantId, tenant.siteId, "live", "auto", "approved");

    const report = await recoverStuckAutoProjects({ tenantId: tenant.tenantId, siteId: tenant.siteId, dryRun: false });

    assert.equal(report.scanned, 1);
    assert.equal(report.acted, 1);
    assert.equal(report.items[0]!.action, "schedule");

    const publications = await prisma.publication.findMany({ where: { tenantId: tenant.tenantId, projectId } });
    assert.equal(publications.length, 1);
    assert.equal(publications[0]!.channel, "website");
    assert.equal(publications[0]!.status, "scheduled");

    // Idempotent: running again does not duplicate publications.
    const second = await recoverStuckAutoProjects({ tenantId: tenant.tenantId, siteId: tenant.siteId, dryRun: false });
    assert.equal(second.acted, 1);
    assert.equal(second.items[0]!.result, "already_scheduled");
    assert.equal(await prisma.publication.count({ where: { tenantId: tenant.tenantId, projectId } }), 1);
  } finally {
    await cleanup(tenant.tenantId);
  }
});
