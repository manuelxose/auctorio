// Phase 6 — AUTOPILOT planner integration: qa_passed auto-approves, creates
// publications; irreparable content stops safely and notifies. No LLM calls.
import test from "node:test";
import assert from "node:assert/strict";
import { getPrismaClient } from "../src/infrastructure/db/prisma";
import { sha256 } from "../src/shared/utils/hash";
import { enqueueEditorialPlanGeneration } from "../src/studio/editorial-plan";
import { progressDuePlanItems, runAutomationTick } from "../src/studio/planner";

const prisma = getPrismaClient();

test.after(async () => {
  await prisma.$disconnect();
});

const PASSING_TITLE = "Programación de televisión semanal con horarios y novedades";
const PASSING_SEO_TITLE = "Programación TV semanal — horarios y novedades";
const PASSING_SEO_DESC =
  "Consulta la programación de televisión de esta semana con horarios actualizados, estrenos y novedades verificadas por el equipo editorial.";
const PASSING_EXCERPT =
  "Un resumen completo y útil de la programación televisiva semanal con horarios actualizados y novedades.";

function passingBody(): string {
  const paragraph = "Información actualizada y verificada sobre la programación televisiva de la semana, con horarios y novedades.";
  const paragraphs = Array.from({ length: 34 }, () => `<p>${paragraph}</p>`).join("");
  return [
    "<h2>Destacados de la semana</h2>",
    paragraphs,
    "<h2>Preguntas frecuentes</h2>",
    "<p>¿Cuándo se estrenan los nuevos programas? Consulta los horarios oficiales actualizados.</p>",
    '<p>Más guías: <a href="/guias/streaming">Guías de streaming</a> y <a href="/noticias/tv">Noticias TV</a>.</p>',
  ].join("");
}

async function createWorkspace(maxRepairAttempts = 2) {
  const seed = `ap-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const tenant = await prisma.tenant.create({
    data: { name: seed, apiKeyHash: sha256(`${seed}-key`), status: "active" },
  });
  const site = await prisma.site.create({
    data: { tenantId: tenant.id, key: seed, name: seed, type: "guiatv", locale: "es-ES", baseUrl: "https://example.test" },
  });
  const policy = await prisma.automationPolicy.create({
    data: {
      tenantId: tenant.id,
      siteId: site.id,
      enabled: true,
      state: "active",
      mode: "autopilot",
      autoGenerate: true,
      autoRepair: true,
      autoApprove: true,
      autoSchedule: true,
      autoPublish: true,
      maxRepairAttempts,
      articlesPerDay: 2,
      xPostsPerDay: 0,
      instagramPostsPerDay: 0,
      socialRequired: false,
      publishingWindows: [{ channel: "website", days: [0, 1, 2, 3, 4, 5, 6], from: "00:00", to: "23:59" }],
    },
  });
  const topic = await prisma.topic.create({ data: { tenantId: tenant.id, title: `t-${seed}` } });
  await prisma.fact.create({
    data: {
      tenantId: tenant.id,
      topicId: topic.id,
      sourceType: "rss",
      sourceRef: "https://news-source-a.example/programacion",
      content: "La programación semanal incluye estrenos y horarios verificados.",
      contentHash: `hash-a-${seed}`,
    },
  });
  await prisma.fact.create({
    data: {
      tenantId: tenant.id,
      topicId: topic.id,
      sourceType: "rss",
      sourceRef: "https://news-source-b.example/tv",
      content: "Los canales actualizan sus parrillas cada lunes.",
      contentHash: `hash-b-${seed}`,
    },
  });
  const image = await prisma.contentImage.create({
    data: { tenantId: tenant.id, topicId: topic.id, status: "done", storagePath: `generated/${seed}/hero.webp` },
  });
  await prisma.assetVariant.create({
    data: {
      tenantId: tenant.id,
      siteId: site.id,
      contentImageId: image.id,
      kind: "hero",
      storagePath: `generated/${seed}/hero.webp`,
      mimeType: "image/webp",
    },
  });
  return { seed, tenantId: tenant.id, siteId: site.id, policyId: policy.id, topicId: topic.id, imageId: image.id };
}

async function cleanupWorkspace(tenantId: string): Promise<void> {
  await prisma.auditLog.deleteMany({ where: { tenantId } });
  await prisma.notification.deleteMany({ where: { tenantId } });
  await prisma.publication.deleteMany({ where: { tenantId } });
  await prisma.publishingAccount.deleteMany({ where: { tenantId } });
  await prisma.socialContent.deleteMany({ where: { tenantId } });
  await prisma.qualityRepairAttempt.deleteMany({ where: { tenantId } });
  await prisma.contentVersion.deleteMany({ where: { tenantId } });
  await prisma.contentProject.deleteMany({ where: { tenantId } });
  await prisma.contentSource.deleteMany({ where: { tenantId } });
  await prisma.assetVariant.deleteMany({ where: { tenantId } });
  await prisma.contentImage.deleteMany({ where: { tenantId } });
  await prisma.fact.deleteMany({ where: { tenantId } });
  await prisma.topic.deleteMany({ where: { tenantId } });
  await prisma.automationPolicy.deleteMany({ where: { tenantId } });
  await prisma.site.deleteMany({ where: { tenantId } });
  await prisma.tenant.delete({ where: { id: tenantId } });
}

test("a plan whose operation is gone when it fails does not raise an unhandled rejection", async () => {
  const workspace = await createWorkspace();
  const unhandled: unknown[] = [];
  const listen = (reason: unknown) => unhandled.push(reason);
  process.on("unhandledRejection", listen);
  try {
    // No site intelligence: the generation fails in the background.
    const { planId, operationId } = await enqueueEditorialPlanGeneration({
      tenantId: workspace.tenantId, siteId: workspace.siteId, dateFrom: new Date(), dateTo: new Date(Date.now() + 7 * 86_400_000), publicationCount: 1, channels: ["website"],
    } as Parameters<typeof enqueueEditorialPlanGeneration>[0]);
    await prisma.operation.delete({ where: { id: operationId } });
    for (let i = 0; i < 100; i += 1) {
      if ((await prisma.editorialPlan.findUniqueOrThrow({ where: { id: planId } })).status === "failed") break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    assert.equal((await prisma.editorialPlan.findUniqueOrThrow({ where: { id: planId } })).status, "failed");
    await new Promise((resolve) => setTimeout(resolve, 300));
    assert.deepEqual(unhandled, []);
  } finally {
    process.off("unhandledRejection", listen);
    await prisma.editorialPlan.deleteMany({ where: { tenantId: workspace.tenantId } });
    await cleanupWorkspace(workspace.tenantId);
  }
});

test("autopilot: qa_passed is auto-approved and scheduled without any manual step", async () => {
  const workspace = await createWorkspace();
  try {
    await prisma.automationPolicy.update({
      where: { id: workspace.policyId },
      data: { xPostsPerDay: 1, instagramPostsPerDay: 1, socialRequired: true },
    });
    for (const platform of ["x", "instagram"] as const) {
      await prisma.publishingAccount.create({
        data: { tenantId: workspace.tenantId, siteId: workspace.siteId, platform, displayName: platform, enabled: true, status: "active" },
      });
    }
    const project = await prisma.contentProject.create({
      data: {
        tenantId: workspace.tenantId,
        siteId: workspace.siteId,
        topicId: workspace.topicId,
        title: PASSING_TITLE,
        brief: "Programación semanal de televisión",
        origin: "auto",
        status: "qa_passed",
        automationMode: "autopilot",
        automationSubstate: "qa_passed",
        metadata: {
          contentType: "tv_programming",
          primaryIntent: "informational",
          targetQuery: "programacion tv",
          recommendedWordCountMin: 50,
          recommendedWordCountMax: 2000,
        },
      },
    });
    await prisma.contentVersion.create({
      data: {
        tenantId: workspace.tenantId,
        projectId: project.id,
        versionNumber: 1,
        status: "qa_passed",
        title: PASSING_TITLE,
        excerpt: PASSING_EXCERPT,
        bodyHtml: passingBody(),
        seoTitle: PASSING_SEO_TITLE,
        seoDescription: PASSING_SEO_DESC,
        qaReport: {
          passed: true,
          score: 94,
          checks: [],
          findings: [],
        },
        contentImageId: workspace.imageId,
      },
    });

    // Tick 1: strict gate passes → auto approval.
    const first = await runAutomationTick();
    assert.ok(first.approvals >= 1);

    const afterApproval = await prisma.contentProject.findUniqueOrThrow({ where: { id: project.id } });
    assert.equal(afterApproval.status, "approved");
    assert.equal(afterApproval.automationSubstate, "auto_approved");

    const version = await prisma.contentVersion.findFirstOrThrow({ where: { projectId: project.id } });
    assert.equal(version.status, "approved");
    assert.equal(version.approvedBy, "automation/autopilot");
    assert.ok(version.approvedAt);
    assert.equal(version.autonomousGatePassed, true);

    // Tick 2: approved → publication created and scheduled.
    const second = await runAutomationTick();
    assert.ok(second.publicationsCreated >= 1);

    const publications = await prisma.publication.findMany({ where: { projectId: project.id } });
    assert.ok(publications.length >= 1);
    assert.ok(publications.every((publication) => publication.channel === "website"));
    assert.ok(publications.every((publication) => publication.scheduledFor !== null));
    assert.equal(await prisma.socialContent.count({ where: { projectId: project.id } }), 0);
  } finally {
    await cleanupWorkspace(workspace.tenantId);
  }
});

test("autopilot ignores candidates from paused and archived sources even when another source is active", async () => {
  const workspace = await createWorkspace();
  const scope = { tenantId: workspace.tenantId, siteId: workspace.siteId };
  try {
    await prisma.contentSource.create({ data: { ...scope, name: "Active", type: "rss", enabled: true } });
    for (const [name, enabled, archivedAt] of [
      ["Paused", false, null],
      ["Archived", true, new Date()],
    ] as const) {
      const source = await prisma.contentSource.create({ data: { ...scope, name, type: "rss", enabled, archivedAt } });
      await prisma.sourceItem.create({
        data: {
          tenantId: scope.tenantId,
          sourceId: source.id,
          externalId: name,
          title: `Candidato de ${name}`,
          contentHash: sha256(name),
          processingStatus: "candidate",
          score: 0.98,
        },
      });
    }
    const tick = await runAutomationTick();
    assert.equal(tick.candidatesSelected, 0);
    assert.equal(await prisma.contentProject.count({ where: scope }), 0);
  } finally {
    await cleanupWorkspace(scope.tenantId);
  }
});

test("autopilot: irreparable content does NOT publish and notifies the operator", async () => {
  const workspace = await createWorkspace(0);
  try {
    const project = await prisma.contentProject.create({
      data: {
        tenantId: workspace.tenantId,
        siteId: workspace.siteId,
        title: "Proyecto irreparable",
        brief: "Brief",
        origin: "auto",
        status: "qa_failed",
        automationMode: "autopilot",
        automationSubstate: "qa_repairing",
      },
    });
    await prisma.contentVersion.create({
      data: {
        tenantId: workspace.tenantId,
        projectId: project.id,
        versionNumber: 1,
        status: "qa_failed",
        title: null,
        excerpt: null,
        bodyHtml: "<p>Breve.</p>",
        seoTitle: null,
        seoDescription: null,
        qaReport: {
          passed: false,
          score: 10,
          checks: [],
          findings: [
            { key: "title_present", label: "Título", passed: false, severity: "error", message: "Falta el título", group: "structural" },
            { key: "image_ready", label: "Imagen", passed: false, severity: "error", message: "Falta la imagen", group: "publishing" },
          ],
        },
        repairAttempts: 0,
      },
    });

    await runAutomationTick();

    const after = await prisma.contentProject.findUniqueOrThrow({ where: { id: project.id } });
    assert.equal(after.automationSubstate, "intervention_required");
    assert.notEqual(after.status, "approved");
    assert.notEqual(after.status, "published");

    const publications = await prisma.publication.findMany({ where: { projectId: project.id } });
    assert.equal(publications.length, 0);

    const notification = await prisma.notification.findFirst({
      where: { tenantId: workspace.tenantId, category: "operations" },
    });
    assert.ok(notification, "intervention notification must exist");
  } finally {
    await cleanupWorkspace(workspace.tenantId);
  }
});

test("assisted mode prepares approved automatic content without scheduling a release", async () => {
  const workspace = await createWorkspace();
  try {
    await prisma.automationPolicy.update({
      where: { id: workspace.policyId },
      data: { mode: "assisted", autoApprove: false, autoSchedule: false, autoPublish: false },
    });
    const project = await prisma.contentProject.create({
      data: {
        tenantId: workspace.tenantId,
        siteId: workspace.siteId,
        topicId: workspace.topicId,
        title: "Contenido preparado para revisión humana",
        brief: "Brief",
        origin: "auto",
        status: "approved",
        automationMode: "assisted",
      },
    });
    await prisma.contentVersion.create({
      data: {
        tenantId: workspace.tenantId,
        projectId: project.id,
        versionNumber: 1,
        status: "approved",
        title: "Contenido preparado para revisión humana",
        excerpt: "Resumen",
        bodyHtml: "<p>Contenido revisable.</p>",
        seoTitle: "Contenido revisable",
        seoDescription: "Descripción revisable",
        contentImageId: workspace.imageId,
      },
    });

    const tick = await runAutomationTick();
    assert.equal(tick.publicationsCreated, 0);
    assert.equal(await prisma.publication.count({ where: { projectId: project.id } }), 0);
  } finally {
    await cleanupWorkspace(workspace.tenantId);
  }
});

test("manual mode never auto-approves or schedules, even QA-passed content", async () => {
  const workspace = await createWorkspace();
  try {
    await prisma.automationPolicy.update({
      where: { id: workspace.policyId },
      data: { mode: "manual", autoGenerate: false, autoRepair: false, autoApprove: false, autoSchedule: false, autoPublish: false },
    });
    const passed = await prisma.contentProject.create({
      data: {
        tenantId: workspace.tenantId,
        siteId: workspace.siteId,
        topicId: workspace.topicId,
        title: PASSING_TITLE,
        brief: "Brief",
        origin: "auto",
        status: "qa_passed",
        automationMode: "manual",
        automationSubstate: "qa_passed",
      },
    });
    await prisma.contentVersion.create({
      data: {
        tenantId: workspace.tenantId,
        projectId: passed.id,
        versionNumber: 1,
        status: "qa_passed",
        title: PASSING_TITLE,
        excerpt: PASSING_EXCERPT,
        bodyHtml: passingBody(),
        seoTitle: PASSING_SEO_TITLE,
        seoDescription: PASSING_SEO_DESC,
        qaReport: { passed: true, score: 94, checks: [], findings: [] },
        contentImageId: workspace.imageId,
      },
    });

    await runAutomationTick();
    await runAutomationTick();

    const after = await prisma.contentProject.findUniqueOrThrow({ where: { id: passed.id } });
    assert.equal(after.status, "qa_passed");
    const version = await prisma.contentVersion.findFirstOrThrow({ where: { projectId: passed.id } });
    assert.equal(version.approvedBy, null);
    assert.equal(await prisma.publication.count({ where: { projectId: passed.id } }), 0);
  } finally {
    await cleanupWorkspace(workspace.tenantId);
  }
});

async function dropPlanWorkspace(tenantId: string) {
  for (const model of ["auditLog", "editorialPlanItem", "editorialPlan", "automationPolicy", "site"] as const) {
    await (prisma[model] as unknown as { deleteMany(args: unknown): Promise<unknown> }).deleteMany({ where: { tenantId } });
  }
  await prisma.tenant.delete({ where: { id: tenantId } });
}

async function planWorkspace(mode: "assisted" | "autopilot", articlesPerDay = 3) {
  const seed = `due-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const tenant = await prisma.tenant.create({ data: { name: seed, apiKeyHash: sha256(`${seed}-key`), status: "active" } });
  const site = await prisma.site.create({ data: { tenantId: tenant.id, key: seed, name: seed, type: "guiatv", locale: "es-ES", baseUrl: "https://example.test" } });
  const policy = await prisma.automationPolicy.create({ data: { tenantId: tenant.id, siteId: site.id, enabled: true, state: "active", mode, articlesPerDay } });
  const plan = await prisma.editorialPlan.create({ data: { tenantId: tenant.id, siteId: site.id, name: "p", dateFrom: new Date(), dateTo: new Date(Date.now() + 30 * 86_400_000), status: "ready" } });
  const item = (title: string, minutesFromNow: number, status: "approved" | "proposed") =>
    prisma.editorialPlanItem.create({ data: { tenantId: tenant.id, planId: plan.id, siteId: site.id, title, channel: "website", status, scheduledFor: new Date(Date.now() + minutesFromNow * 60_000) } });
  return { tenantId: tenant.id, policy, item };
}

test("M1: due approved plan items start production; later ones and unapproved ones wait (assisted)", async () => {
  const w = await planWorkspace("assisted");
  try {
    const due = await w.item("Due", 30, "approved");
    await w.item("Tomorrow", 24 * 60, "approved");
    const proposed = await w.item("Proposed", 10, "proposed");
    const started: string[] = [];
    const count = await progressDuePlanItems(w.policy, { start: async (_tenant, id) => { started.push(id); } });
    assert.equal(count, 1);
    assert.deepEqual(started, [due.id]);
    assert.equal((await prisma.editorialPlanItem.findUniqueOrThrow({ where: { id: proposed.id } })).status, "proposed");
  } finally {
    await dropPlanWorkspace(w.tenantId);
  }
});

test("M1: autopilot approves its due proposals and respects the daily cap", async () => {
  const w = await planWorkspace("autopilot", 1);
  try {
    await w.item("A", 5, "proposed");
    await w.item("B", 20, "proposed");
    const started: string[] = [];
    const count = await progressDuePlanItems(w.policy, { start: async (_tenant, id) => { started.push(id); } });
    assert.equal(count, 1);
    assert.equal(await prisma.editorialPlanItem.count({ where: { tenantId: w.tenantId, status: "approved" } }), 2);
  } finally {
    await dropPlanWorkspace(w.tenantId);
  }
});

test("M1: manual mode never starts plan production", async () => {
  const w = await planWorkspace("assisted");
  try {
    await w.item("Due", 5, "approved");
    const count = await progressDuePlanItems({ ...w.policy, mode: "manual" }, { start: async () => assert.fail("must not start") });
    assert.equal(count, 0);
  } finally {
    await dropPlanWorkspace(w.tenantId);
  }
});
