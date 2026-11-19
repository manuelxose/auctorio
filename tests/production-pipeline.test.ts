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
  startProductionForProject,
} from "../src/studio/production/pipeline";
import { getDefaultProductionStages, setProductionStageOverrides } from "../src/studio/production/stages";
import { listOperations } from "../src/studio/operations";
import { listCalendarEvents } from "../src/studio/calendar";
import { archiveProject } from "../src/studio/projects";
import { listSiteSocialContent } from "../src/studio/social";
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
  for (const model of ["productionJob", "articleGeneration", "publicationAttempt", "publication", "socialContent", "contentDerivative", "contentVersion", "editorialPlanItem", "contentProject", "fact", "topic", "editorialPlan", "operation", "site"] as const) {
    await (prisma[model] as unknown as { deleteMany(args: unknown): Promise<unknown> }).deleteMany({ where: { tenantId } });
  }
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  setArticleWriterFactory(null);
  setProductionStageOverrides(null);
}

function fakeImageQueue() {
  setProductionStageOverrides({ requestImage: async () => undefined, requestInlineImages: async () => undefined });
}

test("ENG-01: plan item and manual requests run the same shared QA/gates stage functions", async () => {
  const f = await fixture();
  setArticleWriterFactory(() => new FakeWriter());
  const defaults = getDefaultProductionStages();
  const seen: string[] = [];
  setProductionStageOverrides({
    requestImage: async () => undefined,
    requestInlineImages: async () => undefined,
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

test("PROD-07a: truncated writer JSON fails the job with a typed code, stores no version, and retry reuses the project", async () => {
  const f = await fixture();
  fakeImageQueue();
  let truncate = true;
  const tokens: Array<number | undefined> = [];
  setArticleWriterFactory(() => ({
    generate: async (input) => {
      tokens.push(input.maxTokens);
      const good = await new FakeWriter().generate(input);
      return truncate ? { ...good, output: good.output.slice(0, Math.floor(good.output.length / 2)) } : good;
    },
  }));
  try {
    const first = await startProduction(f.tenantId, { kind: "plan_item", planItemId: f.itemId }, { wait: true });
    assert.equal(first.job.status, "failed");
    assert.equal(first.job.stage, "write");
    assert.equal(first.job.errorCode, "writer_output_invalid");
    assert.equal(tokens.length, 2, "one bounded retry");
    assert.equal(tokens[1], 8000);
    assert.equal(await prisma.contentVersion.count({ where: { tenantId: f.tenantId } }), 0, "no raw JSON version persisted");

    truncate = false;
    const retried = await retryProductionJob(f.tenantId, first.job.id, { wait: true });
    assert.ok(["needs_review", "ready"].includes(retried.status), `${retried.status} ${retried.error}`);
    assert.equal(await prisma.contentProject.count({ where: { tenantId: f.tenantId } }), 1);
    const versions = await prisma.contentVersion.findMany({ where: { tenantId: f.tenantId } });
    assert.equal(versions.length, 1);
    assert.doesNotMatch(versions[0].bodyHtml ?? "", /"bodyHtml"|^\s*\{/);
  } finally {
    await cleanup(f.tenantId);
  }
});

test("PROD-07b: a Spanish plan item gets Spanish template headings and its approved outline as required H2s", async () => {
  const f = await fixture();
  fakeImageQueue();
  const prompts: string[] = [];
  setArticleWriterFactory(() => ({
    generate: async (input) => (prompts.push(input.prompt), new FakeWriter().generate(input)),
  }));
  try {
    const run = await startProduction(f.tenantId, { kind: "plan_item", planItemId: f.itemId }, { wait: true });
    assert.ok(["needs_review", "ready"].includes(run.job.status), `${run.job.status} ${run.job.error}`);
    const prompt = prompts[0];
    assert.match(prompt, /\(heading: Que ver primero\) \[required\]/);
    assert.match(prompt, /\(heading: Para quien es\) \[required\]/);
    assert.doesNotMatch(prompt, /What you need to know|Key facts|\(heading: Context\)/);
    assert.match(prompt, /written in Spanish/);
    const version = await prisma.contentVersion.findFirstOrThrow({ where: { tenantId: f.tenantId } });
    assert.match(version.bodyHtml ?? "", /<h2>Que ver primero<\/h2>/);
    const findings = (version.qaReport as { findings: Array<{ key: string; passed: boolean; severity: string }> }).findings;
    const coverage = findings.find((finding) => finding.key === "outline_coverage");
    assert.deepEqual([coverage?.passed, coverage?.severity], [true, "error"]);
  } finally {
    await cleanup(f.tenantId);
  }
});

test("M1: an assisted plan item waits as ready in its slot; approval schedules it there", async () => {
  const f = await fixture();
  fakeImageQueue();
  setArticleWriterFactory(() => new FakeWriter());
  const slot = new Date(Date.now() + 3 * 24 * 3_600_000);
  await prisma.editorialPlanItem.update({ where: { id: f.itemId }, data: { scheduledFor: slot } });
  try {
    const { job } = await startProduction(f.tenantId, { kind: "plan_item", planItemId: f.itemId }, { wait: true });
    const done = await getProductionJob(f.tenantId, job.id);
    assert.equal(done!.status, "needs_review", done!.error ?? "");
    const pending = await prisma.publication.findFirstOrThrow({ where: { tenantId: f.tenantId, channel: "website" } });
    assert.equal(pending.status, "ready");
    assert.equal(pending.scheduledFor?.toISOString(), slot.toISOString());

    await reviewProductionJob(f.tenantId, job.id, { decision: "approve" }, null);
    const released = await prisma.publication.findUniqueOrThrow({ where: { id: pending.id } });
    assert.equal(released.status, "scheduled");
    assert.equal(released.manualOverride, true);
    assert.equal(released.scheduledFor?.toISOString(), slot.toISOString());
  } finally {
    await cleanup(f.tenantId);
  }
});

test("M1: approving after the slot passed publishes now; manual mode creates no publication", async () => {
  const f = await fixture();
  fakeImageQueue();
  setArticleWriterFactory(() => new FakeWriter());
  await prisma.editorialPlanItem.update({ where: { id: f.itemId }, data: { scheduledFor: new Date(Date.now() - 3_600_000) } });
  try {
    const { job } = await startProduction(f.tenantId, { kind: "plan_item", planItemId: f.itemId }, { wait: true });
    const before = Date.now();
    await reviewProductionJob(f.tenantId, job.id, { decision: "approve" }, null);
    const released = await prisma.publication.findFirstOrThrow({ where: { tenantId: f.tenantId, channel: "website" } });
    assert.equal(released.status, "scheduled");
    assert.ok(released.scheduledFor!.getTime() >= before - 1000);
  } finally {
    await cleanup(f.tenantId);
  }

  const m = await fixture();
  fakeImageQueue();
  setArticleWriterFactory(() => new FakeWriter());
  await prisma.automationPolicy.create({ data: { tenantId: m.tenantId, siteId: m.siteId, mode: "manual", enabled: false } });
  try {
    const { job } = await startProduction(m.tenantId, { kind: "plan_item", planItemId: m.itemId }, { wait: true });
    await reviewProductionJob(m.tenantId, job.id, { decision: "approve" }, null);
    assert.equal(await prisma.publication.count({ where: { tenantId: m.tenantId } }), 0);
  } finally {
    await cleanup(m.tenantId);
  }
});

test("M2: rewriting an existing project runs the pipeline into that project with the editor's feedback", async () => {
  const f = await fixture();
  fakeImageQueue();
  const prompts: string[] = [];
  const writer = new FakeWriter();
  setArticleWriterFactory(() => ({ generate: async (input: Parameters<FakeWriter["generate"]>[0]) => (prompts.push(input.prompt), writer.generate(input)) }));
  const project = await prisma.contentProject.create({ data: { tenantId: f.tenantId, siteId: f.siteId, title: "Series de misterio para maratonear", brief: "Guia propia de series de misterio", status: "draft" } });
  try {
    const job = await startProductionForProject(f.tenantId, project.id, { feedback: "Añade una tabla comparativa" });
    const again = await startProductionForProject(f.tenantId, project.id);
    assert.equal(again.id, job.id, "a run in flight is returned, not forked");
    let done = await getProductionJob(f.tenantId, job.id);
    for (let i = 0; i < 100 && done && ["queued", "running"].includes(done.status); i++) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      done = await getProductionJob(f.tenantId, job.id);
    }
    assert.ok(["needs_review", "ready"].includes(done!.status), `${done!.status} ${done!.error}`);
    assert.ok(prompts.some((prompt) => prompt.includes("Añade una tabla comparativa")));
    assert.equal(await prisma.contentProject.count({ where: { tenantId: f.tenantId } }), 1);
    assert.equal(await prisma.contentVersion.count({ where: { tenantId: f.tenantId, projectId: project.id } }), 1);
  } finally {
    await cleanup(f.tenantId);
  }
});

test("M2: a source-item project's stored facts reach the ledger, so its rewrite is not rejected as unsupported", async () => {
  const f = await fixture();
  fakeImageQueue();
  setArticleWriterFactory(() => new FakeWriter());
  const topic = await prisma.topic.create({ data: { tenantId: f.tenantId, title: "Estrenos de series" } });
  await prisma.fact.create({
    data: {
      tenantId: f.tenantId, topicId: topic.id, sourceType: "rss", sourceRef: "https://news-a.example/estrenos",
      content: "La plataforma estrena tres series de misterio este viernes por la noche. La primera temporada tiene ocho episodios de una hora cada uno.",
      contentHash: `facts-${f.tenantId}`,
    },
  });
  const project = await prisma.contentProject.create({ data: { tenantId: f.tenantId, siteId: f.siteId, topicId: topic.id, title: "Estrenos de series de misterio este viernes", brief: "Noticia de estrenos", status: "draft" } });
  try {
    const job = await startProductionForProject(f.tenantId, project.id);
    let done = await getProductionJob(f.tenantId, job.id);
    for (let i = 0; i < 100 && done && ["queued", "running"].includes(done.status); i++) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      done = await getProductionJob(f.tenantId, job.id);
    }
    assert.ok(["needs_review", "ready"].includes(done!.status), `${done!.status} ${done!.error}`);
  } finally {
    await cleanup(f.tenantId);
  }
});

test("M3: an autopilot plan item that passes the single gate schedules itself in its slot", async () => {
  const f = await fixture();
  fakeImageQueue();
  setArticleWriterFactory(() => new FakeWriter());
  const slot = new Date(Date.now() + 2 * 24 * 3_600_000);
  await prisma.editorialPlanItem.update({ where: { id: f.itemId }, data: { scheduledFor: slot } });
  await prisma.automationPolicy.create({
    data: {
      tenantId: f.tenantId, siteId: f.siteId, mode: "autopilot", enabled: true, autoGenerate: true, autoApprove: true, autoSchedule: true, autoPublish: true,
      autonomousQaThresholds: { overallQualityScore: 0, minSourceGroups: 0, minSiteMatch: 0 },
    },
  });
  try {
    const { job } = await startProduction(f.tenantId, { kind: "plan_item", planItemId: f.itemId }, { wait: true });
    const done = await getProductionJob(f.tenantId, job.id);
    assert.equal(done!.status, "ready", done!.error ?? "");
    const publication = await prisma.publication.findFirstOrThrow({ where: { tenantId: f.tenantId, channel: "website" }, include: { version: true } });
    assert.equal(publication.status, "scheduled");
    assert.equal(publication.scheduledFor?.toISOString(), slot.toISOString());
    assert.equal(publication.version.status, "approved");
  } finally {
    await cleanup(f.tenantId);
  }
});

test("M3: the calendar reports the derived lifecycle through an assisted run", async () => {
  const f = await fixture();
  fakeImageQueue();
  setArticleWriterFactory(() => new FakeWriter());
  const slot = new Date(Date.now() + 2 * 24 * 3_600_000);
  await prisma.editorialPlanItem.update({ where: { id: f.itemId }, data: { scheduledFor: slot } });
  const window = { from: new Date(Date.now() - 86_400_000), to: new Date(Date.now() + 5 * 86_400_000), siteId: f.siteId };
  try {
    const [planned] = await listCalendarEvents(f.tenantId, window);
    assert.deepEqual([planned.kind, planned.lifecycle, planned.chip], ["plan_item", "planned", "queued"]);

    const { job } = await startProduction(f.tenantId, { kind: "plan_item", planItemId: f.itemId }, { wait: true });
    const review = await listCalendarEvents(f.tenantId, window);
    assert.equal(review.length, 1, "the plan item is represented by its publication, not twice");
    assert.deepEqual([review[0].kind, review[0].lifecycle, review[0].chip], ["publication", "needs_review", "review"]);

    await reviewProductionJob(f.tenantId, job.id, { decision: "approve" }, null);
    const [scheduled] = await listCalendarEvents(f.tenantId, window);
    assert.deepEqual([scheduled.lifecycle, scheduled.chip], ["scheduled", "queued"]);
  } finally {
    await cleanup(f.tenantId);
  }
});

test("social drafts survive article archival and the calendar replaces an approved X draft with its scheduled post", async () => {
  const f = await fixture();
  const window = { from: new Date(Date.now() - 86_400_000), to: new Date(Date.now() + 8 * 86_400_000), siteId: f.siteId };
  try {
    const project = await prisma.contentProject.create({
      data: { tenantId: f.tenantId, siteId: f.siteId, title: "Artículo", brief: "Enfoque editorial" },
    });
    const version = await prisma.contentVersion.create({
      data: { tenantId: f.tenantId, projectId: project.id, versionNumber: 1, title: project.title },
    });
    const common = { tenantId: f.tenantId, projectId: project.id, versionId: version.id, generationStatus: "done" as const, editorialStatus: "draft" as const };
    const thread = await prisma.socialContent.create({ data: { ...common, channel: "x", contentType: "x_thread", body: "Entrada\n\nSegunda parte" } });
    const carousel = await prisma.socialContent.create({ data: { ...common, channel: "instagram", contentType: "instagram_carousel", body: "Carrusel" } });
    await archiveProject(f.tenantId, project.id, { mode: "archive" });
    const social = await listSiteSocialContent(f.tenantId, f.siteId, "x", thread.id);
    assert.deepEqual(social.map((item) => item.id), [thread.id]);
    const initial = (await listCalendarEvents(f.tenantId, window)).filter((event) => event.kind === "social_draft");
    assert.deepEqual(initial.map((event) => event.id).sort(), [thread.id, carousel.id].sort());
    assert.ok(initial.every((event) => event.chip === "review"));
    assert.equal((await listCalendarEvents(f.tenantId, { ...window, channel: "website" })).some((event) => event.kind === "social_draft"), false);

    await prisma.socialContent.update({ where: { id: thread.id }, data: { editorialStatus: "approved" } });
    const publication = await prisma.publication.create({
      data: { tenantId: f.tenantId, projectId: project.id, versionId: version.id, channel: "x", siteId: f.siteId, socialContentId: thread.id, status: "scheduled", scheduledFor: initial[0].scheduledFor },
    });
    const timeline = await listCalendarEvents(f.tenantId, { ...window, channel: "x" });
    assert.equal(timeline.length, 1);
    const [scheduled] = timeline;
    assert.equal(scheduled.kind, "publication");
    if (scheduled.kind === "publication") {
      assert.deepEqual([scheduled.id, scheduled.socialContentId, scheduled.chip], [publication.id, thread.id, "queued"]);
    }
  } finally {
    await cleanup(f.tenantId);
  }
});

// Acceptance 2026-11-18: Regenerate on a plan guide ran as a manual piece (news headings, no sources, no link card).
test("Regenerate on a project from a plan item reruns the plan item (guide template), as a new version of the same project", async () => {
  const f = await fixture();
  fakeImageQueue();
  setArticleWriterFactory(() => new FakeWriter());
  try {
    const first = await startProduction(f.tenantId, { kind: "plan_item", planItemId: f.itemId }, { wait: true });
    const projectId = first.job.projectId!;
    assert.ok(projectId);
    const rerun = await startProductionForProject(f.tenantId, projectId, { feedback: "Más concreto" });
    assert.equal(rerun.kind, "plan_item");
    assert.notEqual(rerun.id, first.job.id);
    // Wait for the rerun to finish: it writes version 2 of the same project.
    for (let i = 0; i < 100 && !["needs_review", "ready", "failed"].includes((await getProductionJob(f.tenantId, rerun.id))!.status); i++) await new Promise((r) => setTimeout(r, 100));
    const done = await getProductionJob(f.tenantId, rerun.id);
    assert.ok(["needs_review", "ready"].includes(done!.status), `${done!.status} ${done!.error}`);
    assert.equal(done!.projectId, projectId);
    assert.equal(await prisma.contentVersion.count({ where: { tenantId: f.tenantId, projectId } }), 2);
    assert.equal(await prisma.contentProject.count({ where: { tenantId: f.tenantId } }), 1);
  } finally {
    await cleanup(f.tenantId);
  }
});

// Acceptance 2026-11-18: the same prompt gave a 2,341-word guide and then a 1,493-word one; a short guide gets one "expand" pass.
test("a guide that comes back well under the minimum gets one expand pass, and the longer draft is kept", async () => {
  const f = await fixture();
  fakeImageQueue();
  const prompts: string[] = [];
  setArticleWriterFactory(() => ({
    generate: async (input) => {
      prompts.push(input.prompt);
      const base = await new FakeWriter().generate(input);
      if (!input.prompt.includes("Previous answer:")) return base;
      const parsed = JSON.parse(base.output) as { bodyHtml: string };
      parsed.bodyHtml += `<h2>Más detalle</h2><p>${"palabra ".repeat(2500)}</p>`;
      return { ...base, output: JSON.stringify(parsed) };
    },
  }));
  try {
    const run = await startProduction(f.tenantId, { kind: "plan_item", planItemId: f.itemId }, { wait: true });
    assert.ok(["needs_review", "ready"].includes(run.job.status), `${run.job.status} ${run.job.error}`);
    assert.equal(prompts.length, 2);
    assert.match(prompts[1], /has only \d+ words in the article body/);
    const version = await prisma.contentVersion.findFirstOrThrow({ where: { tenantId: f.tenantId, projectId: run.job.projectId! } });
    assert.match(version.bodyHtml ?? "", /Más detalle/);
  } finally {
    await cleanup(f.tenantId);
  }
});
