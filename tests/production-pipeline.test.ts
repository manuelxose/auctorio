// Unified production pipeline: ENG-01 / ENG-02 / OPS-01 (writer injected, image queue faked).

import assert from "node:assert/strict";
import test from "node:test";
import { getPrismaClient } from "../src/infrastructure/db/prisma";
import { sha256 } from "../src/shared/utils/hash";
import { setArticleWriterFactory } from "../src/studio/editorial-engine/writer-provider";
import {
  cancelProductionJob,
  getProductionJob,
  listProductionJobs,
  retryProductionJob,
  reviewProductionJob,
  startProduction,
  startProductionForPlanItem,
} from "../src/studio/production/pipeline";
import { getDefaultProductionStages, setProductionStageOverrides } from "../src/studio/production/stages";
import { listOperations } from "../src/studio/operations";
import { FakeWriter } from "./support/fake-editorial-writer";

const prisma = getPrismaClient();

async function fixture() {
  const seed = `prod-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`;
  const tenant = await prisma.tenant.create({ data: { name: seed, apiKeyHash: sha256(`${seed}-k`), status: "active" } });
  const site = await prisma.site.create({ data: { tenantId: tenant.id, key: seed, name: `${seed}-site`, type: "guiatv", locale: "es-ES", baseUrl: `https://${seed}.example.com` } });
  const plan = await prisma.editorialPlan.create({
    data: { tenantId: tenant.id, siteId: site.id, name: "p", dateFrom: new Date("2026-11-01"), dateTo: new Date("2026-11-30"), status: "ready" },
  });
  const item = await prisma.editorialPlanItem.create({
    data: {
      tenantId: tenant.id, planId: plan.id, siteId: site.id, title: "Guia de series de misterio", channel: "website", status: "approved",
      scheduledFor: new Date("2026-11-20T10:00:00Z"), primaryKeyword: "series de misterio", outline: ["Que ver primero", "Para quien es"],
    },
  });
  return { tenantId: tenant.id, siteId: site.id, planId: plan.id, itemId: item.id };
}

async function cleanup(tenantId: string) {
  for (const model of ["productionJob", "articleGeneration", "publicationAttempt", "publication", "publicationJob", "contentDerivative", "contentVersion", "editorialPlanItem", "contentProject", "editorialPlan", "operation", "site"] as const) {
    await (prisma[model] as unknown as { deleteMany(args: unknown): Promise<unknown> }).deleteMany({ where: { tenantId } });
  }
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  setArticleWriterFactory(null);
  setProductionStageOverrides(null);
}

function fakeImageQueue() {
  setProductionStageOverrides({ requestImage: async () => undefined });
}

test("ENG-01: plan item and manual requests run the same shared QA/gates stage functions", async () => {
  const f = await fixture();
  setArticleWriterFactory(() => new FakeWriter());
  const defaults = getDefaultProductionStages();
  const seen: string[] = [];
  setProductionStageOverrides({
    requestImage: async () => undefined,
    qa: async (ctx) => (seen.push(`qa:${ctx.kind}`), defaults.qa(ctx)),
    gates: async (ctx) => (seen.push(`gates:${ctx.kind}`), defaults.gates(ctx)),
  });
  try {
    const a = await startProduction(f.tenantId, { kind: "plan_item", planItemId: f.itemId }, { wait: true });
    const b = await startProduction(f.tenantId, { kind: "manual", siteId: f.siteId, title: "Peliculas de terror clasicas", brief: "Recopilatorio editorial propio" }, { wait: true });
    assert.deepEqual(seen.sort(), ["gates:manual", "gates:plan_item", "qa:manual", "qa:plan_item"]);
    for (const view of [a.job, b.job]) {
      const job = await getProductionJob(f.tenantId, view.id);
      assert.ok(["needs_review", "ready"].includes(job!.status), `${job!.kind}: ${job!.status} ${job!.error}`);
      assert.ok(job!.summary.qa && job!.summary.gates);
    }
  } finally {
    await cleanup(f.tenantId);
  }
});

test("ENG-02: starting twice and retrying keeps one job and one project; plan item follows the job", async () => {
  const f = await fixture();
  fakeImageQueue();
  let fail = true;
  setArticleWriterFactory(() => ({
    generate: async (input) => {
      if (fail) throw new Error("writer exploded");
      return new FakeWriter().generate(input);
    },
  }));
  try {
    const first = await startProduction(f.tenantId, { kind: "plan_item", planItemId: f.itemId }, { wait: true });
    assert.equal(first.job.status, "failed");
    assert.equal(first.job.stage, "write");
    let item = await prisma.editorialPlanItem.findUniqueOrThrow({ where: { id: f.itemId } });
    assert.equal(item.status, "approved");
    assert.equal(item.contentGenerationStatus, "failed");
    const projectId = item.projectId;
    assert.ok(projectId);

    fail = false;
    const retried = await retryProductionJob(f.tenantId, first.job.id, { wait: true });
    assert.equal(retried.id, first.job.id);
    assert.equal(retried.attempts, 2);
    assert.ok(["needs_review", "ready"].includes(retried.status), `${retried.status} ${retried.error}`);
    item = await prisma.editorialPlanItem.findUniqueOrThrow({ where: { id: f.itemId } });
    assert.ok(["review_required", "content_ready"].includes(item.status));

    const again = await startProduction(f.tenantId, { kind: "plan_item", planItemId: f.itemId }, { wait: true });
    assert.equal(again.created, false);
    assert.equal(again.job.id, first.job.id);
    assert.equal(await prisma.productionJob.count({ where: { tenantId: f.tenantId } }), 1);
    assert.equal(await prisma.contentProject.count({ where: { tenantId: f.tenantId } }), 1);
    assert.equal(await prisma.contentVersion.count({ where: { tenantId: f.tenantId, projectId } }), 1);

    const viaPlan = await startProductionForPlanItem(f.tenantId, f.itemId, null);
    assert.equal(viaPlan?.project?.id, projectId);
  } finally {
    await cleanup(f.tenantId);
  }
});

test("cancel rules and review; OPS-01 failed and cancelled jobs are visible in operations", async () => {
  const f = await fixture();
  fakeImageQueue();
  try {
    setArticleWriterFactory(() => ({ generate: async () => { throw new Error("boom"); } }));
    const failed = await startProduction(f.tenantId, { kind: "plan_item", planItemId: f.itemId }, { wait: true });
    assert.equal(failed.job.cancellable, true);
    const cancelled = await cancelProductionJob(f.tenantId, failed.job.id);
    assert.equal(cancelled.status, "cancelled");
    assert.equal((await prisma.editorialPlanItem.findUniqueOrThrow({ where: { id: f.itemId } })).contentGenerationStatus, "cancelled");
    await assert.rejects(() => cancelProductionJob(f.tenantId, failed.job.id), /cancelled/);

    const ops = await listOperations(f.tenantId, { type: "content_production" });
    assert.equal(ops.items.length, 1);
    assert.equal(ops.items[0].status, "cancelled");
    const jobs = await listProductionJobs(f.tenantId, { siteId: f.siteId, status: "cancelled" });
    assert.equal(jobs.total, 1);

    setArticleWriterFactory(() => new FakeWriter());
    const done = await retryProductionJob(f.tenantId, failed.job.id, { wait: true });
    assert.equal(done.cancellable, false);
    await assert.rejects(() => cancelProductionJob(f.tenantId, done.id), /not_cancellable|cancellable|done|needs_review|ready/);
    if (done.status === "needs_review") {
      const approved = await reviewProductionJob(f.tenantId, done.id, { decision: "approve", notes: "ok" }, null);
      assert.equal(approved.status, "ready");
      assert.equal((await prisma.editorialPlanItem.findUniqueOrThrow({ where: { id: f.itemId } })).status, "content_ready");
    }
  } finally {
    await cleanup(f.tenantId);
  }
});

test("a stale queued job is retryable and a concurrent review has one winner", async () => {
  const f = await fixture();
  fakeImageQueue();
  try {
    setArticleWriterFactory(() => ({ generate: async () => { throw new Error("boom"); } }));
    const { job } = await startProduction(f.tenantId, { kind: "plan_item", planItemId: f.itemId }, { wait: true });
    await prisma.productionJob.update({ where: { id: job.id }, data: { status: "queued" } });
    const fresh = await startProduction(f.tenantId, { kind: "plan_item", planItemId: f.itemId }, {});
    assert.equal(fresh.job.id, job.id);
    await prisma.$executeRaw`UPDATE production_jobs SET updated_at = now() - interval '2 hours' WHERE id = ${job.id}::uuid`;
    setArticleWriterFactory(() => new FakeWriter());
    const retried = await retryProductionJob(f.tenantId, job.id, { wait: true });
    assert.notEqual(retried.status, "queued");

    await prisma.productionJob.update({ where: { id: job.id }, data: { status: "needs_review" } });
    const results = await Promise.allSettled([
      reviewProductionJob(f.tenantId, job.id, { decision: "approve" }, null),
      reviewProductionJob(f.tenantId, job.id, { decision: "reject", notes: "no" }, null),
    ]);
    assert.deepEqual(results.map((r) => r.status).sort(), ["fulfilled", "rejected"]);
    const loser = results.find((r): r is PromiseRejectedResult => r.status === "rejected")!;
    assert.equal((loser.reason as { httpStatus?: number }).httpStatus, 409);
  } finally {
    await cleanup(f.tenantId);
  }
});
