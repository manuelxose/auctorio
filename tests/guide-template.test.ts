import test from "node:test";
import assert from "node:assert/strict";
import { runQualityChecklist, type ChecklistInput } from "../src/studio/editorial-engine/quality-checklist";
import { GUIDE_TARGETS, getStructureSpec, renderStructureSpec, resolveArticleTargets } from "../src/studio/editorial-engine/structure";
import { mapArticleType, siteGuidance } from "../src/studio/production/plan-item";
import { pickSourceExcerpt, serpResultsToFacts } from "../src/studio/serp-sources";
import { rankOwnPosts } from "../src/studio/internal-linking";
import { OWN_POST_REASON, renderBriefForWriter } from "../src/studio/editorial-engine/brief-builder";
import type { EditorialBrief } from "../src/studio/editorial-engine/types";
import { parseSerpOrganic } from "../src/infrastructure/seo/dataforseo";
import { withTableOfContents } from "../src/studio/editorial-engine/seo-package";
import { buildPublicationJsonLd, faqItemsFromHtml } from "../src/studio/editorial-engine/json-ld";
import { sanitizeEditorialHtml } from "../src/studio/html-sanitizer";
import { buildGuiaTvPayload, publicationJsonLd } from "../src/studio/publishers";
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
    '<aside data-block="link_card"><p><strong>GuíaTV</strong></p><p><a href="https://guiaprogramaciontv.com">Visitar</a></p></aside>',
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
    externalSourceInventorySize: 4,
  };
}

const failing = (html: string) => runQualityChecklist(checklistInput(html)).filter((item) => !item.passed).map((item) => item.key);

test("guide checklist: the reference fixture passes all 10 checks", () => {
  const items = runQualityChecklist(checklistInput(withTableOfContents(guideHtml())));
  assert.equal(items.length, 10);
  assert.deepEqual(items.filter((item) => !item.passed), []);
});

test("guide checklist: a comparison without a table, no FAQ or no link card fails the structure check", () => {
  const comparing = (html: string) => runQualityChecklist({ ...checklistInput(html), primaryKeyword: "mejores plataformas para ver fútbol" }).filter((item) => !item.passed).map((item) => item.key);
  assert.deepEqual(comparing(guideHtml({ table: false })), ["answer_first", "structure"]);
  assert.deepEqual(failing(guideHtml({ table: false })), [], "no comparison → no table required");
  assert.deepEqual(failing(guideHtml({ faqSection: false })), ["structure"]);
  assert.deepEqual(failing(guideHtml().replace(/<aside data-block="link_card">[\s\S]*?<\/aside>/, "")), ["structure"]);
  assert.deepEqual(runQualityChecklist({ ...checklistInput(guideHtml().replace(/<aside data-block="link_card">[\s\S]*?<\/aside>/, "")), targets: resolveArticleTargets({ sections: { linkCard: false } }) }).filter((item) => !item.passed), []);
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

test("M3 keyword-first template: fixed BLG order, no conclusion, summary variant from writing settings", () => {
  const prompt = renderStructureSpec(getStructureSpec("guide"), "es", [], resolveArticleTargets({}));
  const order = ["- lead", "- link_card", "- summary", "- toc", "- detail", "- table", "- promo", "- faq", "- sources", "- further_reading"].map((kind) => prompt.indexOf(kind));
  assert.ok(order.every((index, i) => index >= 0 && (i === 0 || index > order[i - 1])), `order: ${order}`);
  assert.ok(!prompt.includes("key_takeaways") && !prompt.includes("How to choose") && !prompt.includes("Cómo elegir"));
  assert.match(prompt, /Conclusion: NOT appropriate/);
  assert.match(prompt, /attributed inline to its publisher with a link/);
  const takeaways = resolveArticleTargets({ writing: { summaryVariant: "key_takeaways", length: "short" } });
  assert.equal(takeaways.summaryVariant, "key_takeaways");
  const variant = renderStructureSpec(getStructureSpec("guide"), "es", [], takeaways);
  assert.ok(variant.includes("- key_takeaways") && !variant.includes("- summary") && variant.includes("about 1400 words"));
  const off = renderStructureSpec(getStructureSpec("guide"), "es", [], resolveArticleTargets({ sections: { linkCard: false, promo: false } }));
  assert.ok(!off.includes("link_card") && !off.includes("- promo"));
});

test("M3: plan items with a primary keyword use the guide template; news and reviews keep theirs", () => {
  assert.equal(mapArticleType({ primaryKeyword: "ver tdt", contentType: "listicle" }, {}), "guide");
  assert.equal(mapArticleType({ primaryKeyword: "ver tdt", contentType: "explainer" }, {}), "guide");
  assert.equal(mapArticleType({ primaryKeyword: "ver tdt", newsOrEvergreen: "news" }, {}), "standard_news");
  assert.equal(mapArticleType({ primaryKeyword: "serie x", contentType: "review" }, {}), "review_info");
  assert.equal(mapArticleType({ contentType: "listicle" }, {}), "list_ranking");
  assert.deepEqual(siteGuidance({ name: "GuíaTV", baseUrl: "https://www.guiaprogramaciontv.com" }), [
    "Site name: GuíaTV — domain: guiaprogramaciontv.com — home URL (allowed link): https://www.guiaprogramaciontv.com",
  ]);
});

test("M4 links: external target capped by citable sources; prompt makes link minimums mandatory", () => {
  const credible = (externalSourceInventorySize: number | null) =>
    runQualityChecklist({ ...checklistInput(guideHtml()), externalSourceInventorySize }).find((item) => item.key === "credible_source")?.passed;
  assert.equal(credible(4), true);
  assert.equal(credible(25), false, "25 sources available but only 4 cited");
  assert.equal(credible(null), false, "unknown inventory → full target of 20");
  assert.equal(GUIDE_TARGETS.externalLinks, 20);
  const prompt = renderStructureSpec(getStructureSpec("guide"), "es", [], GUIDE_TARGETS);
  assert.match(prompt, /AT LEAST 15 internal links/);
  assert.match(prompt, /AT LEAST 20 external links/);
});

test("M4 SERP sources: latest snapshot, organic only, own site + competitors + known URLs excluded, capped", () => {
  const body = {
    status_code: 20000,
    cost: 0.006,
    tasks: [{ status_code: 20000, result: [{ items: [{ datetime: "2025-01-01 00:00:00 +00:00", items: [{ type: "organic", url: "https://old.example/x", title: "Old", domain: "old.example" }] }, { datetime: "2026-09-02 04:55:15 +00:00", items: [
      { type: "organic", url: "https://google.com/goto?url=X", title: "Wrapped", domain: "google.com" },
      { type: "paid", url: "https://ads.example.com", title: "Ad", domain: "ads.example.com" },
      { type: "organic", url: "https://www.xataka.com/tdt", title: "Canales TDT", domain: "www.xataka.com", description: "Lista de canales." },
      { type: "organic", url: "https://guiaprogramaciontv.com/canales", title: "Own", domain: "guiaprogramaciontv.com" },
      { type: "organic", url: "https://m.rival.es/tdt", title: "Rival", domain: "m.rival.es" },
      { type: "organic", url: "https://www.ocu.org/tdt", title: "OCU TDT", domain: "www.ocu.org" },
      { type: "organic", url: "https://www.boe.es/ley", title: "Ley 13/2022", domain: "www.boe.es" },
    ] }] }] }],
  };
  const { results, costUsd } = parseSerpOrganic(body);
  assert.equal(costUsd, 0.006);
  assert.equal(results.length, 5);
  const facts = serpResultsToFacts(results, { domains: ["guiaprogramaciontv.com", "rival.es"], urls: ["https://www.ocu.org/tdt"] }, 5);
  assert.deepEqual(facts.map((fact) => fact.publisher), ["xataka.com", "boe.es"]);
  assert.equal(facts[0].statement, "Canales TDT: Lista de canales.");
  assert.equal(facts[0].sourceUrl, "https://www.xataka.com/tdt");
  assert.equal(serpResultsToFacts(results, { domains: [], urls: [] }, 2).length, 2);
});

test("M4 source pages: the cited excerpt is the page's sentences with figures and the keyword", () => {
  const content = [
    "Bienvenido a nuestra web, la mejor del sector desde siempre y para siempre.",
    "La TDT en España emite 30 canales nacionales gratuitos desde el 5 de noviembre de 2026.",
    "Suscríbete a nuestro boletín para no perderte ninguna novedad de la semana.",
    "Para resintonizar la TDT basta con abrir el menú del televisor y buscar canales.",
  ].join(" ");
  assert.equal(
    pickSourceExcerpt(content, "canales tdt"),
    "La TDT en España emite 30 canales nacionales gratuitos desde el 5 de noviembre de 2026. Para resintonizar la TDT basta con abrir el menú del televisor y buscar canales.",
  );
  assert.equal(pickSourceExcerpt("Texto corto sin nada útil que citar aquí dentro.", "canales tdt"), "");
});

test("M4 own posts: closest to the keyword first, then newest; marked in the writer brief", () => {
  const posts = rankOwnPosts(
    [
      { url: "https://guiaprogramaciontv.com/blog/futbol-hoy", title: "Fútbol hoy en TV" },
      { url: "https://guiaprogramaciontv.com/blog/canales-tdt-2026", title: "Todos los canales de la TDT" },
      { url: "https://guiaprogramaciontv.com/blog/futbol-hoy", title: "Duplicado" },
      { url: "no es url", title: "Rota" },
    ],
    "canales tdt gratis",
    5,
  );
  assert.deepEqual(posts.map((post) => post.url), ["https://guiaprogramaciontv.com/blog/canales-tdt-2026", "https://guiaprogramaciontv.com/blog/futbol-hoy"]);
  assert.ok(posts.every((post) => post.reason === OWN_POST_REASON));
  const brief = {
    storyAngle: "", targetSite: { name: "GuíaTV", type: "guiatv", locale: "es-ES" }, audience: "", searchIntent: "informational", articleType: "guide",
    primaryKeyword: "canales tdt", secondaryKeywords: [], entities: [], verifiedFacts: [], unresolvedFacts: [], requiredAttribution: [],
    internalLinkOpportunities: [...posts, { url: "https://guiaprogramaciontv.com/canales", title: "Canales", anchor: "Canales", reason: "title matches keywords", score: 50 }],
    relatedSiteContent: [], uniqueValueProposition: "", targetLengthRange: { min: 1, max: 2 }, freshnessConstraints: [], contentWarnings: [],
  } as unknown as EditorialBrief;
  const text = renderBriefForWriter(brief);
  assert.match(text, /Todos los canales de la TDT → https:\/\/guiaprogramaciontv\.com\/blog\/canales-tdt-2026 \(own post\)/);
  assert.match(text, /Canales → https:\/\/guiaprogramaciontv\.com\/canales\n/);
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

test("GuiaTV payload: no TOC, FAQ moved from the body to faqItems (GuíaTV renders both itself)", () => {
  const context = {
    site: { name: "GuíaTV", baseUrl: "https://guiaprogramaciontv.com", locale: "es-ES" },
    project: { title: "Dónde ver fútbol", primaryLanguage: "es", metadata: { slug: "donde-ver-futbol" } },
    version: { title: "Dónde ver fútbol", excerpt: "x", bodyHtml: guideHtml(), seoTitle: "t", seoDescription: "d", publishedAt: null, updatedAt: new Date("2026-11-17") },
  } as unknown as PublisherContext;
  const payload = buildGuiaTvPayload(context, null, "draft");
  const content = String(payload.content);
  assert.equal((payload.faqItems as unknown[]).length, 5);
  assert.ok(!content.includes("Preguntas frecuentes") && !content.includes("¿Pregunta 1?"));
  assert.ok(!content.includes('data-block="toc"'));
  assert.ok(content.includes("<h2>Fuentes</h2>"), "sections after the FAQ stay");
  assert.equal(payload.jsonLd, undefined);
});

test("generic REST: JSON-LD only when the site keeps it on", () => {
  const context = {
    site: { name: "Blog", baseUrl: "https://blog.example.com", locale: "es" },
    project: { title: "t", primaryLanguage: "es", metadata: {} },
    version: { title: "t", excerpt: "x", bodyHtml: guideHtml(), seoTitle: "t", seoDescription: "d", publishedAt: null, updatedAt: new Date("2026-11-17") },
  } as unknown as PublisherContext;
  assert.deepEqual(publicationJsonLd(context, null)?.map((block) => block["@type"]), ["Article", "BreadcrumbList", "FAQPage"]);
  (context.project.metadata as Record<string, unknown>).articleTargets = { sections: { jsonLd: false } };
  assert.equal(publicationJsonLd(context, null), undefined);
});
