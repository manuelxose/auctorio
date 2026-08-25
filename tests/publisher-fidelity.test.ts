import test from "node:test";
import assert from "node:assert/strict";
import { sanitizeEditorialHtml } from "../src/studio/html-sanitizer";
import { buildGuiaTvPayload } from "../src/studio/publishers";
import type { PublisherContext } from "../src/studio/types";

// ────────────────────────────────────────────────────────────── Sanitizer

const richHtml = `
<h2>Plataformas disponibles</h2>
<p><strong>Netflix</strong> y <em>Max</em> ofrecen <u>catálogos</u> distintos.</p>
<h3>Precios</h3>
<ul><li>Netflix: 5,49 €</li><li>Max: 4,99 €</li></ul>
<ol><li>Crear cuenta</li><li>Elegir plan</li></ol>
<blockquote>La mejor plataforma depende de tu uso.</blockquote>
<a href="https://guiaprogramaciontv.com/ranking/mejores-series-netflix">Mejores series</a>
<table><thead><tr><th>Plan</th><th>Precio</th></tr></thead><tbody><tr><td>Básico</td><td>5,49 €</td></tr></tbody></table>
<img src="https://cdn.example.com/hero.jpg" alt="Guía de TV">
<hr>
`;

test("sanitizer preserves semantic editorial structure", () => {
  const clean = sanitizeEditorialHtml(richHtml);
  assert.ok(clean.includes("<h2>"));
  assert.ok(clean.includes("<strong>"));
  assert.ok(clean.includes("<em>"));
  assert.ok(clean.includes("<u>"));
  assert.ok(clean.includes("<ul>"));
  assert.ok(clean.includes("<ol>"));
  assert.ok(clean.includes("<blockquote>"));
  assert.ok(clean.includes("<a href="));
  assert.ok(clean.includes("<table>"));
  assert.ok(clean.includes("<img"));
  assert.ok(clean.includes("<hr"));
});

test("sanitizer strips scripts, styles, event handlers and unsafe urls", () => {
  const dirty = `<p>Intro</p><script>alert('x')</script><p onclick="steal()">Hola</p><a href="javascript:alert(1)">Link malo</a><img src="javascript:alert(2)" alt="x"><iframe src="https://evil.example.com"></iframe>`;
  const clean = sanitizeEditorialHtml(dirty);
  assert.ok(!clean.toLowerCase().includes("script"));
  assert.ok(!clean.includes("onclick"));
  assert.ok(!clean.includes("javascript:"));
  assert.ok(!clean.toLowerCase().includes("iframe"));
  assert.ok(clean.includes("Intro"));
  assert.ok(clean.includes("Hola"));
});

test("sanitizer unwraps unknown tags but keeps their text", () => {
  const clean = sanitizeEditorialHtml("<div><span>Texto útil</span></div><custom-widget>Más texto</custom-widget>");
  assert.ok(clean.includes("Texto útil"));
  assert.ok(clean.includes("Más texto"));
  assert.ok(!clean.includes("<div"));
  assert.ok(!clean.includes("<custom-widget"));
});

test("sanitizer enforces attribute allowlist on links", () => {
  const clean = sanitizeEditorialHtml(`<a href="https://ok.example.com" data-track="x" onclick="bad()">Link</a>`);
  assert.ok(clean.includes('href="https://ok.example.com"'));
  assert.ok(!clean.includes("onclick"));
});

// ────────────────────────────────────────────────────────────── GuiaTV payload fidelity

function publisherContext(overrides: Partial<PublisherContext> = {}): PublisherContext {
  return {
    site: {
      id: "site-1",
      tenantId: "tenant-1",
      key: "guiatv-editorial",
      name: "GuiaTV",
      type: "guiatv",
      locale: "es-ES",
      baseUrl: "https://guiaprogramaciontv.com",
      publishingCredentialsRef: null,
    },
    project: {
      id: "project-1",
      tenantId: "tenant-1",
      title: "Dónde ver La Isla de las Tentaciones",
      metadata: {
        contentType: "where-to-watch",
        primaryIntent: "where-to-watch",
        targetQuery: "donde ver la isla de las tentaciones",
        relatedPlatformKeys: ["netflix", "mitele", "fake-platform"],
        relatedRouteKeys: ["platforms", "fake-route"],
        categories: ["streaming", "reality"],
        keywords: ["la isla de las tentaciones", "telecinco"],
        faqItems: [
          { question: "¿Dónde ver La Isla de las Tentaciones?", answer: "En Telecinco y Mitele." },
        ],
        canonicalUrl: "https://guiaprogramaciontv.com/donde-ver/la-isla-de-las-tentaciones",
      },
    },
    version: {
      id: "version-1",
      tenantId: "tenant-1",
      title: "Dónde ver La Isla de las Tentaciones: todas las plataformas",
      excerpt: "Guía completa para ver La Isla de las Tentaciones en streaming.",
      bodyHtml: richHtml,
      seoTitle: "Dónde ver La Isla de las Tentaciones: plataformas y horarios",
      seoDescription: "Descubre en qué plataformas ver La Isla de las Tentaciones y sus horarios.",
    },
    assetUrl: null,
    ...overrides,
  } as unknown as PublisherContext;
}

test("GuiaTV payload carries the full SEO brief and semantic HTML", () => {
  const payload = buildGuiaTvPayload(publisherContext(), "https://cdn.example.com/hero.jpg", "draft");
  // The destination content-type contract is guide|ranking|trend|news|analysis|preview|match-report;
  // intent and query carry the semantic where-to-watch meaning.
  assert.equal(payload.contentType, "guide");
  assert.equal(payload.primaryIntent, "where-to-watch");
  assert.equal(payload.targetQuery, "donde ver la isla de las tentaciones");
  assert.equal(payload.metaTitle, "Dónde ver La Isla de las Tentaciones: plataformas y horarios");
  assert.equal(payload.metaDescription, "Descubre en qué plataformas ver La Isla de las Tentaciones y sus horarios.");
  assert.equal(payload.canonicalUrl, "https://guiaprogramaciontv.com/donde-ver/la-isla-de-las-tentaciones");
  assert.deepEqual(payload.faqItems, [{ question: "¿Dónde ver La Isla de las Tentaciones?", answer: "En Telecinco y Mitele." }]);
  assert.deepEqual(payload.categories, ["streaming", "reality"]);
  assert.deepEqual(payload.keywords, ["la isla de las tentaciones", "telecinco"]);
  assert.deepEqual(payload.relatedPlatformKeys, ["netflix", "mitele"], "unknown platform keys are filtered");
  assert.deepEqual(payload.relatedRouteKeys, ["platforms"], "unknown route keys are filtered");
  assert.equal(payload.status, "draft");

  const content = String(payload.content);
  assert.ok(content.includes("<h2>"));
  assert.ok(content.includes("<strong>"));
  assert.ok(content.includes("<ul>"));
  assert.ok(content.includes("<table>"));
  assert.ok(content.includes("<a href="));
});

test("GuiaTV payload sanitizes unsafe HTML before it can reach the destination", () => {
  const context = publisherContext();
  (context as { version: { bodyHtml: string } }).version.bodyHtml =
    "<p>Seguro</p><script>alert('x')</script><a href=\"javascript:alert(1)\">Mal</a>";
  const payload = buildGuiaTvPayload(context, null, "publish");
  const content = String(payload.content);
  assert.ok(!content.toLowerCase().includes("script"));
  assert.ok(!content.includes("javascript:"));
  assert.ok(content.includes("Seguro"));
});

test("GuiaTV payload normalizes unsupported content types to guide", () => {
  const context = publisherContext();
  (context.project.metadata as Record<string, unknown>).contentType = "video-essay";
  const payload = buildGuiaTvPayload(context, null, "draft");
  assert.equal(payload.contentType, "guide");
});
