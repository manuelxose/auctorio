// Phase 6 — targeted, bounded, idempotent quality repair.
import test from "node:test";
import assert from "node:assert/strict";
import type { AutomationPolicy } from "@prisma/client";
import { getPrismaClient } from "../src/infrastructure/db/prisma";
import { sha256 } from "../src/shared/utils/hash";
import {
  buildRepairPlan,
  normalizeStoredQaReport,
  runQualityRepairCycle,
  type RepairProvider,
} from "../src/studio/quality-repair";
import type { QaGroup, QaReportV2 } from "../src/studio/qa";

const prisma = getPrismaClient();

// ────────────────────────────────────────────────────────────── Pure mapping

function failedFinding(key: string, severity: "error" | "warning" = "error", group: QaGroup = "structural") {
  return { key, label: key, passed: false, severity, message: `fail ${key}`, group };
}

test("buildRepairPlan maps findings to targeted strategies", () => {
  const qaReport: QaReportV2 = {
    passed: false,
    score: 40,
    checks: [],
    findings: [
      failedFinding("title_present"),
      failedFinding("malformed_html"),
      failedFinding("h2_present", "warning", "structural"),
      failedFinding("seo_title", "warning", "seo"),
      failedFinding("seo_description", "warning", "seo"),
      failedFinding("word_count", "warning", "seo"),
      failedFinding("keyword_in_title", "warning", "seo"),
      failedFinding("keyword_in_intro", "warning", "seo"),
      failedFinding("keyword_in_headings", "warning", "seo"),
      failedFinding("internal_links", "warning", "seo"),
      failedFinding("evidence_links", "warning", "seo"),
      failedFinding("evidence_grounding", "warning", "evidence"),
      failedFinding("image_alt", "warning", "seo"),
      failedFinding("faq_section", "warning", "seo"),
      failedFinding("intro_quality", "warning", "editorial"),
      failedFinding("no_generic_phrases", "warning", "editorial"),
      failedFinding("excerpt_present", "warning", "editorial"),
      failedFinding("readable_paragraphs", "warning", "editorial"),
      failedFinding("image_ready", "error", "publishing"),
      failedFinding("publish_contract", "error", "publishing"),
    ],
  };
  const plan = buildRepairPlan(qaReport);
  const kinds = plan.strategies.map((strategy) => strategy.key);
  assert.ok(kinds.includes("title_rewrite"));
  assert.ok(kinds.includes("html_sanitize"));
  assert.ok(kinds.includes("structure_repair"));
  assert.ok(kinds.includes("seo_title_rewrite"));
  assert.ok(kinds.includes("seo_description_rewrite"));
  assert.ok(kinds.includes("word_count_adjust"));
  assert.ok(kinds.includes("keyword_title"));
  assert.ok(kinds.includes("intro_rewrite"));
  assert.ok(kinds.includes("internal_links_insert"));
  assert.ok(kinds.includes("evidence_cite"));
  assert.ok(kinds.includes("image_alt_text"));
  assert.ok(kinds.includes("faq_generate"));
  assert.ok(kinds.includes("generic_cleanup"));
  assert.ok(kinds.includes("excerpt_generate"));
  assert.ok(kinds.includes("paragraph_restructure"));
  assert.ok(kinds.includes("image_retry"));
  assert.ok(kinds.includes("publish_contract_repair"));
  assert.equal(plan.unrepairable.length, 0);
  assert.equal(plan.actionable, true);
  // Deduplication: repeated findings map to one strategy each.
  assert.equal(new Set(kinds).size, kinds.length);
});

test("unrepairable findings produce no strategy", () => {
  const plan = buildRepairPlan({
    passed: false,
    score: 10,
    checks: [],
    findings: [failedFinding("body_exists"), failedFinding("unknown_key_x")],
  });
  assert.equal(plan.actionable, false);
  assert.equal(plan.strategies.length, 0);
  assert.equal(plan.unrepairable.length, 2);
});

test("normalizeStoredQaReport tolerates legacy shapes", () => {
  assert.deepEqual(normalizeStoredQaReport({ passed: true, score: 88, checks: [{ key: "a", passed: true, message: "", severity: "info" }] }), {
    passed: true,
    score: 88,
    checks: [{ key: "a", passed: true, message: "", severity: "info" }],
    findings: [],
  });
  assert.deepEqual(normalizeStoredQaReport(null), { passed: false, score: 0, checks: [], findings: [] });
});

// ────────────────────────────────────────────────────────────── DB fixtures

type Fixture = {
  tenantId: string;
  siteId: string;
  projectId: string;
  versionId: string;
  policy: AutomationPolicy;
};

async function createFixture(overrides?: {
  maxRepairAttempts?: number;
  autoRepair?: boolean;
  versionRepairAttempts?: number;
  qaReport?: unknown;
  title?: string | null;
  withImage?: boolean;
}): Promise<Fixture> {
  const seed = `repair-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
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
      mode: "autopilot",
      autoRepair: overrides?.autoRepair ?? true,
      autoApprove: true,
      autoSchedule: true,
      autoPublish: true,
      maxRepairAttempts: overrides?.maxRepairAttempts ?? 2,
    },
  });
  const project = await prisma.contentProject.create({
    data: {
      tenantId: tenant.id,
      siteId: site.id,
      title: `Proyecto ${seed}`,
      brief: "Brief de prueba",
      origin: "auto",
      status: "qa_failed",
      automationMode: "autopilot",
      metadata: {
        contentType: "tv_programming",
        primaryIntent: "informational",
        targetQuery: "programacion tv",
        recommendedWordCountMin: 50,
        recommendedWordCountMax: 2000,
      },
    },
  });

  let contentImageId: string | null = null;
  if (overrides?.withImage) {
    const topic = await prisma.topic.create({ data: { tenantId: tenant.id, title: `t-${seed}` } });
    await prisma.contentProject.update({ where: { id: project.id }, data: { topicId: topic.id } });
    // tv_programming requires source grounding: seed real retrieved facts.
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
    contentImageId = image.id;
  }

  const version = await prisma.contentVersion.create({
    data: {
      tenantId: tenant.id,
      projectId: project.id,
      versionNumber: 1,
      status: "qa_failed",
      title: overrides?.title === undefined ? null : overrides.title,
      excerpt: null,
      bodyHtml: "<p>Breve.</p>",
      seoTitle: null,
      seoDescription: null,
      qaReport: (overrides?.qaReport ?? {
        passed: false,
        score: 20,
        checks: [],
        findings: [
          { key: "title_present", label: "Título", passed: false, severity: "error", message: "Falta el título", group: "structural" },
        ],
      }) as never,
      repairAttempts: overrides?.versionRepairAttempts ?? 0,
      contentImageId,
    },
  });

  return { tenantId: tenant.id, siteId: site.id, projectId: project.id, versionId: version.id, policy };
}

async function cleanup(tenantId: string): Promise<void> {
  // Topic/Image/Fact/Site relations to Tenant have no cascade; delete children first.
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

const PASSING_PROVIDER: RepairProvider = {
  async repair() {
    const paragraph = "Información actualizada y verificada sobre la programación televisiva de la semana, con horarios y novedades.";
    const paragraphs = Array.from({ length: 34 }, () => `<p>${paragraph}</p>`).join("");
    return {
      title: "Programación de televisión semanal con horarios y novedades",
      html: [
        "<h2>Destacados de la semana</h2>",
        paragraphs,
        "<h2>Preguntas frecuentes</h2>",
        "<p>¿Cuándo se estrenan los nuevos programas? Consulta los horarios oficiales actualizados.</p>",
        '<p>Más guías: <a href="/guias/streaming">Guías de streaming</a> y <a href="/noticias/tv">Noticias TV</a>.</p>',
      ].join(""),
      seoTitle: "Programación TV semanal — horarios y novedades",
      seoDescription: "Consulta la programación de televisión de esta semana con horarios actualizados, estrenos y novedades verificadas por el equipo editorial.",
      excerpt: "Un resumen completo y útil de la programación televisiva semanal con horarios actualizados y novedades.",
      provider: "test",
      model: "test-model",
    };
  },
};

test.after(async () => {
  await prisma.$disconnect();
});

// ────────────────────────────────────────────────────────────── Cycle tests

test("repair is not configured when autoRepair is off", async () => {
  const fixture = await createFixture({ autoRepair: false });
  try {
    const outcome = await runQualityRepairCycle(fixture.tenantId, fixture.projectId, fixture.policy);
    assert.equal(outcome.outcome, "not_configured");
  } finally {
    await cleanup(fixture.tenantId);
  }
});

test("exhausted repairs stop safely with intervention_required", async () => {
  const fixture = await createFixture({ maxRepairAttempts: 2, versionRepairAttempts: 2 });
  try {
    const outcome = await runQualityRepairCycle(fixture.tenantId, fixture.projectId, fixture.policy);
    assert.equal(outcome.outcome, "intervention_required");
    const version = await prisma.contentVersion.findUnique({ where: { id: fixture.versionId } });
    assert.ok(version);
    const notification = await prisma.notification.findFirst({
      where: { tenantId: fixture.tenantId, category: "operations" },
    });
    assert.ok(notification, "operator notification must exist");
  } finally {
    await cleanup(fixture.tenantId);
  }
});

test("concurrent ticks cannot start duplicate repairs (lock)", async () => {
  const fixture = await createFixture({});
  try {
    const lockUntil = new Date(Date.now() + 30 * 60_000);
    await prisma.contentVersion.update({
      where: { id: fixture.versionId },
      data: { repairLockedUntil: lockUntil },
    });
    const outcome = await runQualityRepairCycle(fixture.tenantId, fixture.projectId, fixture.policy);
    assert.equal(outcome.outcome, "locked");
    assert.equal(await prisma.qualityRepairAttempt.count({ where: { versionId: fixture.versionId } }), 0);
  } finally {
    await cleanup(fixture.tenantId);
  }
});

test("repair loop is bounded: repair → retry → intervention when the gate cannot pass", async () => {
  const fixture = await createFixture({ maxRepairAttempts: 2 });
  try {
    const first = await runQualityRepairCycle(fixture.tenantId, fixture.projectId, fixture.policy, {
      provider: PASSING_PROVIDER,
      now: () => new Date(),
    });
    // Content gets repaired but the hero image is missing, so the gate still
    // fails: the cycle reports "repairing" with one attempt consumed.
    assert.equal(first.outcome, "repairing");
    assert.equal(first.attemptsUsed, 1);

    const version = await prisma.contentVersion.findUnique({ where: { id: fixture.versionId } });
    assert.equal(version?.repairAttempts, 1);
    assert.equal(version?.title, "Programación de televisión semanal con horarios y novedades");

    const second = await runQualityRepairCycle(fixture.tenantId, fixture.projectId, fixture.policy, {
      provider: PASSING_PROVIDER,
      now: () => new Date(),
    });
    assert.equal(second.outcome, "intervention_required");

    const attempts = await prisma.qualityRepairAttempt.findMany({
      where: { versionId: fixture.versionId },
      orderBy: { attemptNumber: "asc" },
    });
    assert.equal(attempts.length, 2);
    assert.ok(attempts.every((attempt) => attempt.status !== "running"));
    assert.ok(attempts[0].strategies);
    assert.ok(attempts[0].qaScoreBefore === 20);
    assert.equal(attempts[0].attemptNumber, 1);
  } finally {
    await cleanup(fixture.tenantId);
  }
});

test("successful repair passes the gate and is idempotent", async () => {
  const fixture = await createFixture({ withImage: true, maxRepairAttempts: 4 });
  try {
    const first = await runQualityRepairCycle(fixture.tenantId, fixture.projectId, fixture.policy, {
      provider: PASSING_PROVIDER,
      now: () => new Date(),
    });
    assert.equal(first.outcome, "gate_passed");
    assert.ok((first.scoreAfter ?? 0) > 90);

    const version = await prisma.contentVersion.findUnique({ where: { id: fixture.versionId } });
    assert.equal(version?.status, "qa_passed");
    assert.equal(version?.repairLockedUntil, null);

    // Idempotent: a second call observes the gate already passes and does not
    // create another repair attempt.
    const second = await runQualityRepairCycle(fixture.tenantId, fixture.projectId, fixture.policy, {
      provider: PASSING_PROVIDER,
      now: () => new Date(),
    });
    assert.equal(second.outcome, "gate_passed");
    assert.equal(second.attemptsUsed, first.attemptsUsed);
    assert.equal(await prisma.qualityRepairAttempt.count({ where: { versionId: fixture.versionId } }), 1);
  } finally {
    await cleanup(fixture.tenantId);
  }
});
