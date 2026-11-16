// A second "generate" while the latest version is still being written must be refused,
// but a lost (stale) text job must not lock the project forever.
import test from "node:test";
import assert from "node:assert/strict";
import { getPrismaClient } from "../src/infrastructure/db/prisma";
import { sha256 } from "../src/shared/utils/hash";
import { isProjectGenerationInFlight } from "../src/studio/orchestration";
import { createQueuedText } from "../src/studio/repository";

const prisma = getPrismaClient();

test.after(async () => {
  await prisma.$disconnect();
});

test("generation in flight: live text blocks, finished or stale text does not", async () => {
  const seed = `gif-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const tenant = await prisma.tenant.create({ data: { name: seed, apiKeyHash: sha256(`${seed}-key`), status: "active" } });
  try {
    const site = await prisma.site.create({ data: { tenantId: tenant.id, key: seed, name: seed, type: "guiatv", locale: "es-ES", baseUrl: "https://example.test" } });
    const topic = await prisma.topic.create({ data: { tenantId: tenant.id, title: `t-${seed}` } });
    const project = await prisma.contentProject.create({ data: { tenantId: tenant.id, siteId: site.id, topicId: topic.id, title: "T", brief: "B", status: "draft" } });
    assert.equal(await isProjectGenerationInFlight(tenant.id, project.id), false, "no version yet");

    const text = await createQueuedText(tenant.id, topic.id, "es");
    await prisma.contentVersion.create({ data: { tenantId: tenant.id, projectId: project.id, versionNumber: 1, status: "draft", contentTextId: text.id } });
    assert.equal(await isProjectGenerationInFlight(tenant.id, project.id), true, "queued text is in flight");

    await prisma.$executeRaw`update content_text set updated_at = now() - interval '2 hours' where id = ${text.id}::uuid`;
    assert.equal(await isProjectGenerationInFlight(tenant.id, project.id), false, "stale text is a lost job");

    await prisma.contentText.update({ where: { id: text.id }, data: { status: "done" } });
    assert.equal(await isProjectGenerationInFlight(tenant.id, project.id), false, "finished text");
  } finally {
    await prisma.contentVersion.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.contentProject.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.contentText.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.topic.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.site.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.tenant.delete({ where: { id: tenant.id } });
  }
});
