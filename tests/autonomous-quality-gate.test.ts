// Phase 6 — the strict autonomous quality gate is stronger than ordinary QA.
import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_AUTONOMOUS_GATE_CONFIG,
  contentRequiresEvidence,
  evaluateAutonomousGate,
  groupScore,
  readGateConfig,
  wordBandForContentType,
  type AutonomousGateInput,
} from "../src/studio/quality-gate";

function longBody(words = 900): string {
  const paragraph = "Contenido informativo y verificado sobre la programación televisiva de la semana, con horarios y novedades.";
  const paragraphs: string[] = [];
  const needed = Math.ceil(words / 10);
  for (let index = 0; index < needed; index += 1) {
    paragraphs.push(`<p>${paragraph}</p>`);
  }
  return `<h2>Destacados</h2>${paragraphs.join("")}`;
}

function baseInput(overrides?: Partial<AutonomousGateInput>): AutonomousGateInput {
  return {
    version: {
      status: "qa_passed",
      title: "Programación de televisión completa para esta semana",
      excerpt: "Un resumen extenso y útil de la programación televisiva semanal con horarios y novedades.",
      bodyHtml: longBody(),
      seoTitle: "Programación TV completa de esta semana — horarios y novedades",
      seoDescription: "Guía completa de la programación de televisión de esta semana con horarios, estrenos y novedades verificadas.",
    },
    qaReport: { passed: true, score: 95, checks: [], findings: [] },
    heroImageReady: true,
    sourceGroups: 2,
    ...overrides,
  };
}

test("clean high-quality content passes the autonomous gate", () => {
  const report = evaluateAutonomousGate(baseInput(), DEFAULT_AUTONOMOUS_GATE_CONFIG);
  assert.equal(report.passed, true, JSON.stringify(report.blockers));
});

test("version must have passed QA before the autonomous gate", () => {
  const report = evaluateAutonomousGate(
    baseInput({ version: { ...baseInput().version, status: "qa_passed" } }),
    DEFAULT_AUTONOMOUS_GATE_CONFIG,
  );
  assert.equal(report.passed, true);
  const blocked = evaluateAutonomousGate(
    baseInput({ version: { ...baseInput().version, status: "in_review" } }),
    DEFAULT_AUTONOMOUS_GATE_CONFIG,
  );
  assert.equal(blocked.passed, false);
  assert.ok(blocked.blockers.some((blocker) => blocker.key === "version_status"));
});

test("overall score below 90 blocks autopilot", () => {
  const report = evaluateAutonomousGate(
    baseInput({ qaReport: { passed: true, score: 89, checks: [], findings: [] } }),
    DEFAULT_AUTONOMOUS_GATE_CONFIG,
  );
  assert.equal(report.passed, false);
  assert.ok(report.blockers.some((blocker) => blocker.key === "overall_quality_score"));
});

test("unresolved QA errors and warnings block autopilot (warning escalation)", () => {
  const errors = evaluateAutonomousGate(
    baseInput({
      qaReport: {
        passed: false,
        score: 91,
        checks: [],
        findings: [{ key: "no_placeholders", label: "", passed: false, severity: "error", message: "TODO", group: "editorial" }],
      },
    }),
    DEFAULT_AUTONOMOUS_GATE_CONFIG,
  );
  assert.equal(errors.passed, false);
  assert.ok(errors.blockers.some((blocker) => blocker.key === "blocking_errors"));

  const warnings = evaluateAutonomousGate(
    baseInput({
      qaReport: {
        passed: true,
        score: 95,
        checks: [],
        findings: [{ key: "internal_links", label: "", passed: false, severity: "warning", message: "faltan enlaces", group: "seo" }],
      },
    }),
    DEFAULT_AUTONOMOUS_GATE_CONFIG,
  );
  assert.equal(warnings.passed, false);
  assert.ok(warnings.blockers.some((blocker) => blocker.key === "unresolved_warnings"));

  // Configurable: a policy allowing one warning lets it pass (the seo group
  // still reaches its 90 threshold thanks to the other passing findings).
  const lenient = evaluateAutonomousGate(
    baseInput({
      qaReport: {
        passed: true,
        score: 95,
        checks: [],
        findings: [
          { key: "internal_links", label: "", passed: false, severity: "warning", message: "faltan enlaces", group: "seo" },
          ...Array.from({ length: 9 }, (_, index) => ({
            key: `ok_${index}`,
            label: "",
            passed: true,
            severity: "warning" as const,
            message: "ok",
            group: "seo" as const,
          })),
        ],
      },
    }),
    { ...DEFAULT_AUTONOMOUS_GATE_CONFIG, maxWarnings: 1 },
  );
  assert.equal(lenient.passed, true, JSON.stringify(lenient.blockers));
});

test("per-group scores enforce structural/editorial/SEO/evidence thresholds", () => {
  const failing = (group: "structural" | "editorial" | "seo" | "evidence") =>
    evaluateAutonomousGate(
      baseInput({
        qaReport: {
          passed: true,
          score: 96,
          checks: [],
          findings: [
            { key: `x_${group}`, label: "", passed: false, severity: "error", message: "x", group },
          ],
        },
      }),
      DEFAULT_AUTONOMOUS_GATE_CONFIG,
    );

  assert.ok(failing("structural").blockers.some((blocker) => blocker.key === "structural_score"));
  assert.ok(failing("editorial").blockers.some((blocker) => blocker.key === "editorial_score"));
  assert.ok(failing("seo").blockers.some((blocker) => blocker.key === "seo_score"));
  assert.ok(failing("evidence").blockers.some((blocker) => blocker.key === "evidence_score"));
});

test("groupScore weights errors twice as much as warnings", () => {
  const findings = [
    { key: "a", label: "", passed: false, severity: "error", message: "", group: "seo" },
    { key: "b", label: "", passed: true, severity: "error", message: "", group: "seo" },
    { key: "c", label: "", passed: true, severity: "warning", message: "", group: "seo" },
  ] as const;
  // Failed error (0/2) + passed error (2/2) + passed warning (1/1) = 3/5 = 60.
  assert.equal(groupScore(findings as never, "seo"), 60);
  assert.equal(groupScore([], "seo"), 100);
});

test("hard safety gates: hero image, publish contract, placeholders, HTML", () => {
  const noImage = evaluateAutonomousGate(baseInput({ heroImageReady: false }), DEFAULT_AUTONOMOUS_GATE_CONFIG);
  assert.ok(noImage.blockers.some((blocker) => blocker.key === "hero_image"));

  const noContract = evaluateAutonomousGate(
    baseInput({ version: { ...baseInput().version, seoDescription: null } }),
    DEFAULT_AUTONOMOUS_GATE_CONFIG,
  );
  assert.ok(noContract.blockers.some((blocker) => blocker.key === "publish_contract"));

  const placeholders = evaluateAutonomousGate(
    baseInput({ version: { ...baseInput().version, bodyHtml: "<p>TODO</p>" } }),
    DEFAULT_AUTONOMOUS_GATE_CONFIG,
  );
  assert.ok(placeholders.blockers.some((blocker) => blocker.key === "placeholders"));

  const badHtml = evaluateAutonomousGate(
    baseInput({ version: { ...baseInput().version, bodyHtml: "<p>sin cerrar<h2>abierto" } }),
    DEFAULT_AUTONOMOUS_GATE_CONFIG,
  );
  assert.ok(badHtml.blockers.some((blocker) => blocker.key === "valid_html"));
});

test("factual content cannot autopilot-publish without source grounding", () => {
  const report = evaluateAutonomousGate(
    baseInput({ contentType: "breaking_news", sourceGroups: 0 }),
    DEFAULT_AUTONOMOUS_GATE_CONFIG,
  );
  assert.equal(report.passed, false);
  assert.ok(report.blockers.some((blocker) => blocker.key === "source_grounding"));

  const grounded = evaluateAutonomousGate(
    baseInput({ contentType: "breaking_news", sourceGroups: 2, qaReport: { passed: true, score: 95, checks: [], findings: [] } }),
    DEFAULT_AUTONOMOUS_GATE_CONFIG,
  );
  // News with sources and in-range length passes (news word band is concise).
  assert.equal(grounded.passed, true, JSON.stringify(grounded.blockers));
});

test("cannibalization conflicts block autopilot", () => {
  const report = evaluateAutonomousGate(
    baseInput({ cannibalizationRisk: "high" }),
    DEFAULT_AUTONOMOUS_GATE_CONFIG,
  );
  assert.equal(report.passed, false);
  assert.ok(report.blockers.some((blocker) => blocker.key === "cannibalization"));
  assert.equal(evaluateAutonomousGate(baseInput({ cannibalizationRisk: "none" }), DEFAULT_AUTONOMOUS_GATE_CONFIG).passed, true);
});

test("thin content is rejected with content-type-aware word bands", () => {
  const thin = evaluateAutonomousGate(
    baseInput({ contentType: "breaking_news", version: { ...baseInput().version, bodyHtml: "<p>Muy breve.</p>" } }),
    DEFAULT_AUTONOMOUS_GATE_CONFIG,
  );
  assert.ok(thin.blockers.some((blocker) => blocker.key === "thin_content"));

  // News needs 300+, transactional 600+, commercial investigation 800+.
  assert.equal(wordBandForContentType("breaking_news").min, 300);
  assert.equal(wordBandForContentType("transactional").min, 600);
  assert.equal(wordBandForContentType("commercial_investigation").min, 800);
  assert.equal(wordBandForContentType("guide").min, 800);
});

test("high-value content types require the stricter threshold", () => {
  const comparison = evaluateAutonomousGate(
    baseInput({ contentType: "comparison", qaReport: { passed: true, score: 91, checks: [], findings: [] } }),
    DEFAULT_AUTONOMOUS_GATE_CONFIG,
  );
  assert.equal(comparison.passed, false);
  assert.ok(comparison.blockers.some((blocker) => blocker.key === "overall_quality_score"));

  const evergreen = evaluateAutonomousGate(
    baseInput({ contentType: "evergreen_explainer", qaReport: { passed: true, score: 91, checks: [], findings: [] } }),
    DEFAULT_AUTONOMOUS_GATE_CONFIG,
  );
  assert.equal(evergreen.passed, false);

  const normal = evaluateAutonomousGate(
    baseInput({ contentType: "breaking_news", qaReport: { passed: true, score: 91, checks: [], findings: [] } }),
    DEFAULT_AUTONOMOUS_GATE_CONFIG,
  );
  // News is not high-value: 91 passes the 90 threshold (with sources present).
  assert.equal(normal.passed, true, JSON.stringify(normal.blockers));
});

test("evidence requirement is content-type aware", () => {
  assert.equal(contentRequiresEvidence("breaking_news"), true);
  assert.equal(contentRequiresEvidence("analysis"), true);
  assert.equal(contentRequiresEvidence("tv_programming"), true);
  assert.equal(contentRequiresEvidence("transactional"), false);
  assert.equal(contentRequiresEvidence(null, "news"), true);
});

test("readGateConfig honors per-policy thresholds", () => {
  const config = readGateConfig({
    autonomousQaThresholds: {
      overallQualityScore: 94,
      evidenceScore: 80,
      highValueContentTypes: ["guide"],
      maxWarnings: 2,
    },
  } as never);
  assert.equal(config.overallQualityScore, 94);
  assert.equal(config.evidenceScore, 80);
  assert.deepEqual(config.highValueContentTypes, ["guide"]);
  assert.equal(config.maxWarnings, 2);
  // Defaults preserved for unspecified keys.
  assert.equal(config.structuralScore, 90);

  assert.equal(readGateConfig(null).overallQualityScore, 90);
});
