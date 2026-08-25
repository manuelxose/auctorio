import test from "node:test";
import assert from "node:assert/strict";
import { runVersionQa } from "../src/studio/qa";

test("runVersionQa passes a complete editorial version", () => {
  const report = runVersionQa(
    {
      title: "Comparativa de plataformas de streaming para elegir mejor en 2026",
      excerpt:
        "Analizamos precios, catalogo y perfil de uso para ayudarte a elegir la mejor plataforma segun tu caso.",
      bodyHtml:
        "<p>Intro detallada con suficiente contexto para el lector profesional.</p><h2>Comparativa</h2><p>" +
        "palabra ".repeat(220) +
        "</p>",
      seoTitle: "Comparativa de plataformas de streaming 2026",
      seoDescription:
        "Guia clara para comparar Netflix, Max, Disney+ y otras plataformas segun catalogo, precio y tipo de usuario.",
    },
    true,
  );

  assert.equal(report.passed, true);
  assert.equal(report.checks.some((check) => check.passed === false && check.severity === "error"), false);
});

test("runVersionQa fails when image and body are missing", () => {
  const report = runVersionQa(
    {
      title: "Titulo corto",
      excerpt: "Resumen corto",
      bodyHtml: "<p>poco texto</p>",
      seoTitle: "Titulo",
      seoDescription: "Descripcion corta",
    },
    false,
  );

  assert.equal(report.passed, false);
  assert.equal(report.checks.some((check) => check.key === "image_ready" && check.passed === false), true);
});

test("placeholder detection does not flag the common Spanish word 'todo'", () => {
  const report = runVersionQa(
    {
      title: "Guia completa para ver series en television",
      excerpt: "Todo lo que necesitas saber para no perderte ningun estreno, con todo el detalle de plataformas y horarios.",
      bodyHtml:
        "<p>Todo el mundo quiere saber que ver esta noche. Esta guia explica todo lo necesario sobre horarios y plataformas.</p>" +
        "<h2>Plataformas</h2><p>" + "contenido ".repeat(80) + "</p>",
      seoTitle: "Guia completa para ver series en television",
      seoDescription: "Todo lo que necesitas saber para no perderte ningun estreno, con detalle de plataformas y horarios.",
    },
    true,
  );

  const placeholderCheck = report.checks.find((check) => check.key === "no_placeholders");
  assert.ok(placeholderCheck);
  assert.equal(placeholderCheck.passed, true);
});

test("placeholder detection still flags real TODO markers", () => {
  const report = runVersionQa(
    {
      title: "Guia completa para ver series en television",
      excerpt: "Todo lo que necesitas saber para no perderte ningun estreno.",
      bodyHtml: "<p>TODO: revisar la tabla de horarios antes de publicar.</p><h2>Plataformas</h2><p>" + "contenido ".repeat(80) + "</p>",
      seoTitle: "Guia completa para ver series en television",
      seoDescription: "Todo lo que necesitas saber para no perderte ningun estreno, con detalle de plataformas y horarios.",
    },
    true,
  );

  const placeholderCheck = report.checks.find((check) => check.key === "no_placeholders");
  assert.ok(placeholderCheck);
  assert.equal(placeholderCheck.passed, false);
});
