// Phase 6 — AUTOPILOT planner integration: qa_passed auto-approves, creates
// publications; irreparable content stops safely and notifies. No LLM calls.
import test from "node:test";
import assert from "node:assert/strict";
import { getPrismaClient } from "../src/infrastructure/db/prisma";
import { sha256 } from "../src/shared/utils/hash";
import { runAutomationTick } from "../src/studio/planner";

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

test("autopilot: qa_passed is auto-approved and scheduled without any manual step", async () => {
  const workspace = await createWorkspace();
  try {
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
  } finally {
    await cleanupWorkspace(workspace.tenantId);
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
