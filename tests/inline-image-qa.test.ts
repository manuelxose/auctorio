// QA must not report a false "missing images" failure while inline images are still
// rendering, and must still run once the last one settles (even if it failed).
import test from "node:test";
import assert from "node:assert/strict";
import { getPrismaClient } from "../src/infrastructure/db/prisma";
import { sha256 } from "../src/shared/utils/hash";
import { syncImageResultToStudio, syncInlineImageToVersion } from "../src/studio/orchestration";
import { inlineImageHash } from "../src/studio/inline-images";

const prisma = getPrismaClient();

test.after(async () => {
  await prisma.$disconnect();
});

test("QA waits for in-flight inline images and runs once the last one settles", async () => {
  const seed = `iiq-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const tenant = await prisma.tenant.create({ data: { name: seed, apiKeyHash: sha256(`${seed}-key`), status: "active" } });
  try {
    const site = await prisma.site.create({ data: { tenantId: tenant.id, key: seed, name: seed, type: "guiatv", locale: "es-ES", baseUrl: "https://example.test" } });
    const topic = await prisma.topic.create({ data: { tenantId: tenant.id, title: `t-${seed}` } });
    const hero = await prisma.contentImage.create({ data: { tenantId: tenant.id, topicId: topic.id, status: "done", storagePath: `generated/${seed}/hero.webp` } });
    await prisma.assetVariant.create({ data: { tenantId: tenant.id, siteId: site.id, contentImageId: hero.id, kind: "hero", storagePath: `generated/${seed}/hero.webp`, mimeType: "image/webp" } });
    const project = await prisma.contentProject.create({
      data: { tenantId: tenant.id, siteId: site.id, topicId: topic.id, title: "Guía de estrenos", brief: "Brief", status: "draft" }, // production leaves new projects in draft
    });
    const version = await prisma.contentVersion.create({
      data: { tenantId: tenant.id, projectId: project.id, versionNumber: 1, status: "ai_generated", title: "Guía de estrenos", bodyHtml: "<h2>Uno</h2><p>Texto.</p>", contentImageId: hero.id },
    });
    const inline = await prisma.contentImage.create({
      data: { tenantId: tenant.id, topicId: topic.id, status: "processing", dedupeHash: inlineImageHash(version.id, 0, "n1") },
    });

    // Hero finished, inline still rendering: no QA verdict yet.
    await syncImageResultToStudio(tenant.id, hero.id);
    const pending = await prisma.contentVersion.findUniqueOrThrow({ where: { id: version.id } });
    assert.equal(pending.qaReport, null);
    assert.equal(pending.status, "ai_generated");

    // Last inline image fails permanently: QA runs and reports the real image count.
    await prisma.contentImage.update({ where: { id: inline.id }, data: { status: "failed" } });
    await syncInlineImageToVersion(tenant.id, inline.id);
    const settled = await prisma.contentVersion.findUniqueOrThrow({ where: { id: version.id } });
    assert.equal(settled.status, "qa_failed");
    const findings = ((settled.qaReport as { findings?: Array<{ key: string; passed: boolean }> }).findings ?? []);
    assert.equal(findings.find((finding) => finding.key === "image_presence")?.passed, false);
  } finally {
    await prisma.contentVersion.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.contentProject.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.assetVariant.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.contentImage.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.topic.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.notification.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.auditLog.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.site.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.tenant.delete({ where: { id: tenant.id } });
  }
});
