import test from "node:test";
import assert from "node:assert/strict";
import { runVersionQa, runVersionQaV2 } from "../src/studio/qa";

function version(bodyHtml: string): {
  title: string;
  excerpt: string;
  bodyHtml: string;
  seoTitle: string;
  seoDescription: string;
} {
  return {
    title: "Dónde ver La Isla de las Tentaciones en streaming: todas las plataformas",
    excerpt: "Guía completa con las plataformas, precios y horarios para ver La Isla de las Tentaciones online desde España.",
    bodyHtml,
    seoTitle: "Dónde ver La Isla de las Tentaciones: plataformas y horarios",
    seoDescription: "Descubre en qué plataformas puedes ver La Isla de las Tentaciones, los precios de cada servicio y los horarios de emisión.",
  };
}

const richBody = `<p>${"palabra ".repeat(60)}</p>
<h2>Plataformas disponibles</h2>
<p>${"palabra ".repeat(80)}</p>
<h3>Telecinco y Mitele</h3>
<p>${"palabra ".repeat(80)}</p>
<h2>Precios y suscripciones</h2>
<p>${"palabra ".repeat(80)}</p>
<h2>Preguntas frecuentes</h2>
<p>${"palabra ".repeat(80)}</p>`;

test("QA V2 passes a complete intent-aware article and reports an explainable score", () => {
  const report = runVersionQaV2(version(richBody), {
    imageReady: true,
    metadata: {
      primaryIntent: "where-to-watch",
      contentType: "where-to-watch",
      primaryKeyword: "donde ver la isla de las tentaciones",
      targetQuery: "donde ver la isla de las tentaciones",
      recommendedWordCountMin: 1200,
      recommendedWordCountMax: 2000,
      faqCandidates: [{ question: "¿Dónde ver La Isla de las Tentaciones?", answer: "Puedes verla en Telecinco y Mitele." }],
      outline: [{ heading: "Plataformas disponibles" }, { heading: "Precios y suscripciones" }, { heading: "Preguntas frecuentes" }],
    },
  });
  assert.equal(report.passed, true);
  assert.ok(report.score > 0 && report.score <= 100);
  assert.ok(report.findings.length > 10, "detailed findings must be produced");
  assert.ok(report.findings.some((finding) => finding.group === "seo"));
  assert.ok(report.findings.some((finding) => finding.key === "faq_section" && finding.passed === true));
});

test("QA V2 flags short content below the brief word target with an explainable finding", () => {
  const short = version(`<p>${"palabra ".repeat(30)}</p><h2>Intro</h2><p>${"palabra ".repeat(30)}</p>`);
  const report = runVersionQaV2(short, {
    imageReady: true,
    metadata: {
      primaryIntent: "informational",
      contentType: "guide",
      primaryKeyword: "la isla de las tentaciones",
      targetQuery: "la isla de las tentaciones donde ver",
      recommendedWordCountMin: 1800,
      recommendedWordCountMax: 3000,
    },
  });
  assert.equal(report.passed, false, "content below target must fail QA (word target + H2 richness are errors/warnings)");
  assert.ok(report.findings.some((finding) => finding.key === "word_count" && !finding.passed));
  assert.ok(report.findings.some((finding) => finding.key === "h2_present" && !finding.passed));
});

test("QA V2 detects malformed HTML, placeholders and generic AI filler", () => {
  const bad = version(
    `<p>${"palabra ".repeat(40)} en el mundo digital actual</p><h2>Sección</h2><p>${"palabra ".repeat(40)} lorem ipsum TODO</p><h2>Sin cerrar<p>${"palabra ".repeat(40)}</p>`,
  );
  const report = runVersionQaV2(bad, { imageReady: true, metadata: { primaryIntent: "informational" } });
  assert.ok(report.findings.some((finding) => finding.key === "malformed_html" && !finding.passed));
  assert.ok(report.findings.some((finding) => finding.key === "no_placeholders" && !finding.passed));
  assert.ok(report.findings.some((finding) => finding.key === "no_generic_phrases" && !finding.passed));
});

test("QA V2 flags missing image and publication contract", () => {
  const report = runVersionQaV2(
    { title: "", excerpt: "", bodyHtml: "", seoTitle: "", seoDescription: "" },
    { imageReady: false },
  );
  assert.equal(report.passed, false);
  assert.ok(report.findings.some((finding) => finding.key === "image_ready" && !finding.passed));
  assert.ok(report.findings.some((finding) => finding.key === "publish_contract" && !finding.passed));
});

test("QA V2 reports cannibalization risk from the brief", () => {
  const report = runVersionQaV2(version(richBody), {
    imageReady: true,
    metadata: { primaryIntent: "informational" },
    cannibalizationRisk: "high",
  });
  assert.ok(report.findings.some((finding) => finding.key === "cannibalization" && !finding.passed));
});

test("runVersionQa remains backward compatible with legacy call sites", () => {
  const report = runVersionQa(
    {
      title: "Comparativa de plataformas de streaming para elegir mejor en 2026",
      excerpt: "Analizamos precios, catalogo y perfil de uso para ayudarte a elegir la mejor plataforma segun tu caso.",
      bodyHtml: "<p>Intro detallada con suficiente contexto para el lector profesional.</p><h2>Comparativa</h2><p>" + "palabra ".repeat(220) + "</p>",
      seoTitle: "Comparativa de plataformas de streaming 2026",
      seoDescription: "Guia clara para comparar Netflix, Max, Disney+ y otras plataformas segun catalogo, precio y tipo de usuario.",
    },
    true,
  );
  assert.equal(report.passed, true);
  assert.equal(report.checks.some((check) => check.passed === false && check.severity === "error"), false);
  assert.ok(typeof report.score === "number");
});
