import test from "node:test";
import assert from "node:assert/strict";
import { getPrismaClient } from "../src/infrastructure/db/prisma";
import { sha256 } from "../src/shared/utils/hash";
import { deleteSite } from "../src/studio/repository";
import { deleteEditorialPlan } from "../src/studio/editorial-plan";

const prisma = getPrismaClient();

test.after(async () => {
  await prisma.$disconnect();
});

test("delete plan keeps written articles; delete site removes articles, versions and plans", async () => {
  const seed = `del-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const tenant = await prisma.tenant.create({ data: { name: seed, apiKeyHash: sha256(`${seed}-key`), status: "active" } });
  try {
    const site = await prisma.site.create({ data: { tenantId: tenant.id, key: `${seed}-site`, name: "GuiaTV", type: "guiatv", baseUrl: "https://guiatv.example" } });
    const project = await prisma.contentProject.create({ data: { tenantId: tenant.id, siteId: site.id, title: "Canales TDT", brief: "b" } });
    await prisma.contentVersion.create({ data: { tenantId: tenant.id, projectId: project.id, versionNumber: 1, title: "Canales TDT", bodyHtml: "<p>x</p>" } as never });
    const plan = await prisma.editorialPlan.create({ data: { tenantId: tenant.id, siteId: site.id, name: "Plan", dateFrom: new Date(), dateTo: new Date() } as never });
    await prisma.editorialPlanItem.create({ data: { tenantId: tenant.id, planId: plan.id, siteId: site.id, title: "Canales TDT", channel: "website", projectId: project.id } as never });

    assert.deepEqual(await deleteEditorialPlan(tenant.id, plan.id), { ok: true, deletedItems: 1 });
    assert.equal(await prisma.contentProject.count({ where: { id: project.id } }), 1, "the article stays");

    const plan2 = await prisma.editorialPlan.create({ data: { tenantId: tenant.id, siteId: site.id, name: "Plan 2", dateFrom: new Date(), dateTo: new Date() } as never });
    assert.deepEqual(await deleteSite(tenant.id, site.id), { projects: 1, plans: 1 });
    assert.equal(await prisma.site.count({ where: { id: site.id } }), 0);
    assert.equal(await prisma.contentVersion.count({ where: { projectId: project.id } }), 0);
    assert.equal(await prisma.editorialPlan.count({ where: { id: plan2.id } }), 0);
    assert.equal(await deleteSite(tenant.id, site.id), null);
  } finally {
    for (const { id } of await prisma.site.findMany({ where: { tenantId: tenant.id }, select: { id: true } })) await deleteSite(tenant.id, id);
    await prisma.tenant.deleteMany({ where: { id: tenant.id } });
  }
});
