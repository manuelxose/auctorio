import test from "node:test";
import assert from "node:assert/strict";
import { runQualityChecklist, type ChecklistInput } from "../src/studio/editorial-engine/quality-checklist";
import { GUIDE_TARGETS, getStructureSpec, renderStructureSpec, resolveArticleTargets } from "../src/studio/editorial-engine/structure";
import { withTableOfContents } from "../src/studio/editorial-engine/seo-package";
import { buildPublicationJsonLd, faqItemsFromHtml } from "../src/studio/editorial-engine/json-ld";
import { sanitizeEditorialHtml } from "../src/studio/html-sanitizer";
import { buildGuiaTvPayload } from "../src/studio/publishers";
import type { PublisherContext } from "../src/studio/types";

// ────────────────────────────────────────────────────────────── Reference guide fixture

const internal = Array.from({ length: 15 }, (_, i) => `<a href="/plataformas/opcion-${i + 1}">opción ${i + 1}</a>`);
const sections = Array.from(
  { length: 8 },
  (_, i) => `<h2>Plataforma ${i + 1} para ver fútbol</h2><h3>Precio</h3><p>Cuesta ${10 + i} euros al mes y emite el 40% de los partidos. Ver ${internal[i]}.</p>`,
).join("");
const faq = Array.from({ length: 5 }, (_, i) => `<h3>¿Pregunta ${i + 1}?</h3><p>Respuesta breve ${i + 1}.</p>`).join("");

function guideHtml({ table = true, faqSection = true } = {}): string {
  return [
    "<p>Para ver el fútbol en directo hoy necesitas una de estas plataformas de streaming: aquí tienes cuáles emiten cada competición, cuánto cuestan y cómo elegir la que mejor encaja contigo.</p>",
    '<aside data-block="summary"><p><strong>En resumen</strong></p><ul><li>a</li><li>b</li><li>c</li><li>d</li><li>e</li></ul></aside>',
    sections,
    table ? "<table><thead><tr><th>Plataforma</th><th>Precio</th></tr></thead><tbody><tr><td>A</td><td>10 €</td></tr></tbody></table>" : "",
    `<h2>Cómo elegir</h2><p>Compara precio y catálogo. ${internal.slice(8, 12).join(" ")}</p>`,
    faqSection ? `<h2>Preguntas frecuentes</h2>${faq}` : "",
    '<h2>Fuentes</h2><ul><li><a href="https://www.laliga.com">LaLiga</a></li><li><a href="https://uefa.com">UEFA</a></li><li><a href="https://www.movistarplus.es">Movistar</a></li><li><a href="https://www.dazn.com">DAZN</a></li></ul>',
    `<h2>Lecturas recomendadas</h2><ul><li>${internal[12]}</li><li>${internal[13]}</li></ul>`,
    `<aside data-block="cta"><p><strong>Consulta la programación de hoy</strong></p><p>${internal[14]}</p></aside>`,
    '<img src="https://cdn.example.com/1.jpg" alt="Mando a distancia frente a la tele">',
  ].join("");
}

function checklistInput(bodyHtml: string): ChecklistInput {
  return {
    bodyHtml,
    seoTitle: "Dónde ver fútbol en directo hoy: plataformas y precios",
    seoDescription: "Qué plataformas emiten cada competición de fútbol, cuánto cuestan al mes y cómo elegir la que mejor encaja con lo que quieres ver este año.",
    primaryKeyword: "ver el fútbol en directo",
    semanticKeywords: ["plataformas de streaming", "precio", "competición"],
    targets: GUIDE_TARGETS,
    cannibalizationRisk: "none",
    internalLinkInventorySize: 30,
  };
}

const failing = (html: string) => runQualityChecklist(checklistInput(html)).filter((item) => !item.passed).map((item) => item.key);

test("guide checklist: the reference fixture passes all 10 checks", () => {
  const items = runQualityChecklist(checklistInput(withTableOfContents(guideHtml())));
  assert.equal(items.length, 10);
  assert.deepEqual(items.filter((item) => !item.passed), []);
});

test("guide checklist: no comparison table or no FAQ fails the structure check", () => {
  assert.deepEqual(failing(guideHtml({ table: false })), ["structure"]);
  assert.deepEqual(failing(guideHtml({ faqSection: false })), ["structure"]);
});

test("guide checklist: plagiarism flags duplicates, not sibling topics", () => {
  const risk = (cannibalizationRisk: string) => runQualityChecklist({ ...checklistInput(guideHtml()), cannibalizationRisk }).find((item) => item.key === "plagiarism")?.passed;
  assert.equal(risk("related-cluster"), true);
  assert.equal(risk("update-existing"), false);
  assert.equal(risk("high"), false);
});

test("guide checklist: a site that switches the FAQ off does not require it", () => {
  const targets = resolveArticleTargets({ sections: { faq: false } });
  const items = runQualityChecklist({ ...checklistInput(guideHtml({ faqSection: false })), targets });
  assert.equal(items.find((item) => item.key === "structure")?.passed, true);
});

test("guide targets: site override then article override; invalid values are dropped", () => {
  const targets = resolveArticleTargets({ words: 1800, internalLinks: 999, sections: { cta: false } }, { words: 2500, sections: { toc: "no" } });
  assert.equal(targets.words, 2500);
  assert.equal(targets.internalLinks, GUIDE_TARGETS.internalLinks);
  assert.equal(targets.sections.cta, false);
  assert.equal(targets.sections.toc, true);
  const prompt = renderStructureSpec(getStructureSpec("guide"), "es", [], resolveArticleTargets({ sections: { faq: false } }));
  assert.ok(!prompt.includes("Preguntas frecuentes"));
  assert.ok(prompt.includes("Lecturas recomendadas"));
});

test("TOC: built from the H2s after the summary box, stable ids, idempotent, survives the sanitizer", () => {
  const once = withTableOfContents(guideHtml());
  const twice = withTableOfContents(once);
  assert.equal(once, twice);
  const clean = sanitizeEditorialHtml(once);
  assert.match(clean, /<\/aside><nav data-block="toc">/);
  assert.match(clean, /<h2 id="plataforma-1-para-ver-futbol">/);
  assert.match(clean, /<a href="#preguntas-frecuentes"/);
  assert.equal((clean.match(/<nav/g) ?? []).length, 1);
});

test("JSON-LD: Article, BreadcrumbList and FAQPage from the guide body", () => {
  const faqItems = faqItemsFromHtml(guideHtml());
  assert.equal(faqItems.length, 5);
  assert.deepEqual(faqItems[0], { question: "¿Pregunta 1?", answer: "Respuesta breve 1." });
  const blocks = buildPublicationJsonLd({
    title: "Dónde ver fútbol",
    description: "desc",
    image: "https://cdn.example.com/hero.jpg",
    publishedAt: "2026-11-17T08:00:00.000Z",
    modifiedAt: "2026-11-17T08:00:00.000Z",
    languageCode: "es",
    url: null,
    siteName: "GuíaTV",
    siteUrl: "https://guiaprogramaciontv.com",
    faqItems,
  });
  assert.deepEqual(blocks.map((block) => block["@type"]), ["Article", "BreadcrumbList", "FAQPage"]);
  const crumbs = blocks[1].itemListElement as Array<Record<string, unknown>>;
  assert.deepEqual(crumbs.map((crumb) => crumb.position), [1, 2]);
  assert.equal(crumbs[0].item, "https://guiaprogramaciontv.com");
  assert.equal((blocks[2].mainEntity as unknown[]).length, 5);
});

test("GuiaTV payload: carries JSON-LD and body FAQ items; a site can switch JSON-LD off", () => {
  const context = {
    site: { name: "GuíaTV", baseUrl: "https://guiaprogramaciontv.com", locale: "es-ES" },
    project: { title: "Dónde ver fútbol", primaryLanguage: "es", metadata: { slug: "donde-ver-futbol" } },
    version: { title: "Dónde ver fútbol", excerpt: "x", bodyHtml: guideHtml(), seoTitle: "t", seoDescription: "d", publishedAt: null, updatedAt: new Date("2026-11-17") },
  } as unknown as PublisherContext;
  const payload = buildGuiaTvPayload(context, null, "draft");
  assert.deepEqual((payload.jsonLd as Array<Record<string, unknown>>).map((block) => block["@type"]), ["Article", "BreadcrumbList", "FAQPage"]);
  assert.equal((payload.faqItems as unknown[]).length, 5);
  (context.project.metadata as Record<string, unknown>).articleTargets = { sections: { jsonLd: false } };
  assert.equal(buildGuiaTvPayload(context, null, "draft").jsonLd, undefined);
});
