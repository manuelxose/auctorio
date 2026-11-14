import test from "node:test";
import assert from "node:assert/strict";
import { normalizePageUrl, parseSitemapBody } from "../src/studio/site-intelligence/sitemap";
import { extractPageFromHtml, inferContentTypeFromUrl, isUtilityUrl, routeFamily, selectStratified } from "../src/studio/site-intelligence/crawler";
import { computeOpportunities, computeSeoSignals } from "../src/studio/site-intelligence/signals";
import { computeSiteRelevanceScore } from "../src/studio/site-relevance";

const BASE = "https://guiaprogramaciontv.com";

// ────────────────────────────────────────────────────────────── URL normalization

test("normalizePageUrl resolves relative urls and strips hashes", () => {
  assert.equal(normalizePageUrl(BASE, "/guia/la1"), `${BASE}/guia/la1`);
  assert.equal(normalizePageUrl(BASE, "https://guiaprogramaciontv.com/x#frag"), `${BASE}/x`);
  assert.equal(normalizePageUrl(BASE, BASE + "/"), `${BASE}/`);
});

test("normalizePageUrl blocks cross-origin and invalid urls", () => {
  assert.equal(normalizePageUrl(BASE, "https://evil.example.com/steal"), null);
  assert.equal(normalizePageUrl(BASE, "ftp://guiaprogramaciontv.com/file"), null);
  assert.equal(normalizePageUrl(BASE, "http://"), null);
});

// ────────────────────────────────────────────────────────────── Sitemap parsing

function urlset(entries: Array<[string, string?]>): string {
  const urls = entries
    .map(([loc, lastmod]) => `<url><loc>${loc}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ""}</url>`)
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`;
}

test("parseSitemapBody parses urlset with lastmod and deduplicates", () => {
  const parsed = parseSitemapBody(
    urlset([
      ["/guia/hoy", "2026-08-20"],
      ["/ranking/netflix", "2026-08-21"],
      ["/guia/hoy"],
    ]),
    BASE,
  );
  assert.equal(parsed.kind, "urlset");
  assert.equal(parsed.entries.length, 2);
  assert.equal(parsed.entries[0].loc, `${BASE}/guia/hoy`);
  assert.equal(parsed.entries[0].lastmod, new Date("2026-08-20").toISOString());
  assert.equal(parsed.entries[1].loc, `${BASE}/ranking/netflix`);
});

test("parseSitemapBody recurses sitemap indexes", () => {
  const body = `<?xml version="1.0"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
    <sitemap><loc>https://guiaprogramaciontv.com/sitemap-tv.xml</loc></sitemap>
    <sitemap><loc>https://guiaprogramaciontv.com/sitemap-streaming.xml</loc></sitemap>
  </sitemapindex>`;
  const parsed = parseSitemapBody(body, BASE);
  assert.equal(parsed.kind, "sitemapindex");
  assert.deepEqual(parsed.nested, [`${BASE}/sitemap-tv.xml`, `${BASE}/sitemap-streaming.xml`]);
  assert.equal(parsed.entries.length, 0);
});

test("parseSitemapBody rejects cross-origin locs inside a sitemap", () => {
  const body = urlset([["https://evil.example.com/page"]]);
  const parsed = parseSitemapBody(body, BASE);
  assert.equal(parsed.entries.length, 0);
});

test("parseSitemapBody handles malformed xml and unknown roots gracefully", () => {
  // Malformed sitemap fragments must never crash the pipeline.
  const broken = parseSitemapBody("<urlset><url>", BASE);
  assert.equal(broken.entries.length, 0);
  const unknown = parseSitemapBody("<foo><bar>1</bar></foo>", BASE);
  assert.equal(unknown.kind, "unknown");
});

test("parseSitemapBody accepts sitemap urls in single-entry form", () => {
  const body = `<?xml version="1.0"?><urlset><url><loc>https://guiaprogramaciontv.com/unica</loc></url></urlset>`;
  const parsed = parseSitemapBody(body, BASE);
  assert.equal(parsed.kind, "urlset");
  assert.equal(parsed.entries.length, 1);
});

// ────────────────────────────────────────────────────────────── Content type inference

test("inferContentTypeFromUrl maps guiatv URL patterns", () => {
  assert.equal(inferContentTypeFromUrl(`${BASE}/programas/todo-es-mentira`), "where-to-watch");
  assert.equal(inferContentTypeFromUrl(`${BASE}/guias/precios-plataformas-streaming-espana`), "article");
  assert.equal(inferContentTypeFromUrl(`${BASE}/donde-ver/la-isla-de-las-tentaciones`), "where-to-watch");
  assert.equal(inferContentTypeFromUrl(`${BASE}/guia/la1-hoy`), "schedule");
  assert.equal(inferContentTypeFromUrl(`${BASE}/ranking/mejores-series-netflix`), "ranking");
  assert.equal(inferContentTypeFromUrl(`${BASE}/comparativa/netflix-vs-max`), "comparison");
  assert.equal(inferContentTypeFromUrl(`${BASE}/streaming/plataformas`), "streaming");
  assert.equal(inferContentTypeFromUrl(`${BASE}/futbol/champions-hoy`), "sports");
  assert.equal(inferContentTypeFromUrl(`${BASE}/noticias/estrenos-marzo`), "news");
  assert.equal(inferContentTypeFromUrl(`${BASE}/peliculas/el-silencio`), "movies");
  assert.equal(inferContentTypeFromUrl(`${BASE}/series/lost`), "series");
  assert.equal(inferContentTypeFromUrl(`${BASE}/canales/antena-3`), "channels");
  assert.equal(inferContentTypeFromUrl(`${BASE}/misc/unknown-page`), "article");
});

// ────────────────────────────────────────────────────────────── Page extraction

function pageHtml(overrides: { body?: string; title?: string } = {}): string {
  const words = "palabra ".repeat(60);
  return `<!doctype html><html lang="es"><head>
    <title>${overrides.title ?? "Guía de TV hoy"}</title>
    <meta name="description" content="La programación de televisión de hoy con horarios y canales.">
    <link rel="canonical" href="https://guiaprogramaciontv.com/guia/hoy">
    <script type="application/ld+json">{"@type":"TVSchedule","name":"Hoy"}</script>
  </head><body>
    <nav><a href="/">Inicio</a></nav>
    <header><a href="/noticias">Noticias</a></header>
    <main>
      <h1>Guía de TV hoy</h1>
      <h2>Prime time</h2><p>${words}</p>
      <h3>Canales</h3><p>${words}</p>
      <a href="/donde-ver/la-isla">Dónde ver La Isla</a>
      <a href="https://external.example.com/x">External</a>
      <img src="/images/tv.jpg" alt="Guía de TV">
      ${overrides.body ?? ""}
    </main>
    <footer>© GuiaTV</footer>
  </body></html>`;
}

test("extractPageFromHtml extracts semantic structure and strips boilerplate", () => {
  const page = extractPageFromHtml(BASE, `${BASE}/guia/hoy`, pageHtml());
  assert.ok(page);
  assert.equal(page.title, "Guía de TV hoy");
  assert.equal(page.h1, "Guía de TV hoy");
  assert.equal(page.language, "es");
  assert.equal(page.contentType, "schedule");
  assert.deepEqual(page.headings.slice(0, 2), ["Prime time", "Canales"]);
  assert.deepEqual(page.structuredDataTypes, ["TVSchedule"]);
  assert.ok(page.wordCount >= 120);
  assert.ok(!page.content.includes("© GuiaTV"), "footer boilerplate must be removed");
});

test("extractPageFromHtml collects internal links only, with anchors", () => {
  const page = extractPageFromHtml(BASE, `${BASE}/guia/hoy`, pageHtml());
  assert.ok(page);
  const targets = page.internalLinks.map((link) => link.targetUrl);
  assert.ok(targets.includes(`${BASE}/donde-ver/la-isla`));
  assert.ok(!targets.some((url) => url.includes("external.example.com")));
  assert.equal(page.internalLinks[0].anchorText, "Dónde ver La Isla");
});

test("extractPageFromHtml rejects low-content pages", () => {
  const html = `<!doctype html><html><head><title>X</title></head><body><main><p>poco texto</p></main></body></html>`;
  assert.equal(extractPageFromHtml(BASE, `${BASE}/x`, html), null);
});

test("extractPageFromHtml keeps canonical url", () => {
  const page = extractPageFromHtml(BASE, `${BASE}/guia/hoy`, pageHtml());
  assert.ok(page);
  assert.equal(page.canonicalUrl, `${BASE}/guia/hoy`);
});

// ────────────────────────────────────────────────────────────── representative sampling

test("selectStratified covers every route family under a small budget and skips utility pages", () => {
  const families = ["canales", "series", "programas", "programacion-tv", "guias", "deportes"];
  const items = [
    ...Array.from({ length: 500 }, (_, i) => ({ url: `${BASE}/peliculas/p-${i}` })),
    ...families.flatMap((f) => Array.from({ length: 5 }, (_, i) => ({ url: `${BASE}/${f}/x-${i}` }))),
    { url: `${BASE}/aviso-legal` },
    { url: `${BASE}/es/privacidad` },
  ];
  const picked = selectStratified(items, 14);
  assert.equal(picked.length, 14);
  const covered = new Set(picked.map((p) => routeFamily(p.url)));
  for (const f of [...families, "peliculas"]) assert.ok(covered.has(f), `missing ${f}`);
  assert.ok(picked.every((p) => !isUtilityUrl(p.url)));
  assert.deepEqual(selectStratified(items, 14), picked); // deterministic
});

test("legal routes are typed utility, not an editorial content type", () => {
  assert.equal(inferContentTypeFromUrl(`${BASE}/politica-de-privacidad`), "utility");
  assert.equal(routeFamily(`${BASE}/es/series/x`), "series");
  assert.ok(isUtilityUrl(`${BASE}/avisolegal`) && isUtilityUrl(`${BASE}/accesibilidad`));
});

test("approved pillar alias scores like a known cluster and records why", () => {
  const profile = { mainTopics: ["programacion tv"], categories: [], commercialTopics: [], evergreenTopics: [], newsTopics: [], sportsTopics: [], topicClusters: [], contentTypes: [], detectedSiteType: "media", pillarAliases: [{ name: "Programación TV", clusterSlug: null }] } as unknown as Parameters<typeof computeSiteRelevanceScore>[1];
  const verdict = computeSiteRelevanceScore({ topic: "x", topicCluster: "programacion-tv", contentType: "schedule", primaryIntent: "informational", targetQuery: "x", primaryKeyword: "x" } as never, profile, "Programación TV hoy");
  assert.ok(verdict.reasons.some((r) => r.includes('approved strategy pillar "Programación TV"')), JSON.stringify(verdict));
});

// ────────────────────────────────────────────────────────────── SEO signals and opportunities

const page = (over: Partial<import("../src/studio/site-intelligence/signals").SignalPage> = {}) => ({
  url: `${BASE}/a`, title: "Series hoy", h1: "Series hoy", metaDescription: "d", wordCount: 500, structuredData: ["Article"], canonicalUrl: `${BASE}/a/`, ...over,
});

test("computeSeoSignals counts issues only over analysed pages and samples urls", () => {
  const signals = computeSeoSignals([page(), page({ url: `${BASE}/b`, metaDescription: null, wordCount: 50, structuredData: [], canonicalUrl: `${BASE}/other` })]);
  const get = (id: string) => signals.find((s) => s.id === id)!;
  assert.equal(get("missing_meta_description").count, 1);
  assert.equal(get("thin_content").count, 1);
  assert.equal(get("no_structured_data").count, 1);
  assert.equal(get("canonical_differs").count, 1); // trailing slash alone is not a difference
  assert.equal(get("missing_h1").count, 0);
  assert.equal(get("thin_content").of, 2);
  assert.deepEqual(get("thin_content").samples, [`${BASE}/b`]);
});

test("computeOpportunities flags uncovered subtopics with sample-based confidence and no invented metrics", () => {
  const pages = [page({ title: "Series hoy en TV", h1: null })];
  const low = computeOpportunities(pages, [{ name: "Series", subtopics: ["series", "Estrenos Netflix"] }], 4000);
  assert.deepEqual(low.map((o) => o.subtopic), ["Estrenos Netflix"]);
  assert.equal(low[0].confidence, "low");
  assert.match(low[0].reason, /1 of 4000/);
  assert.equal(computeOpportunities(pages, [{ name: "Series", subtopics: ["Estrenos Netflix"] }], 2)[0].confidence, "high");
  assert.deepEqual(Object.keys(low[0]).sort(), ["confidence", "pagesRead", "pillar", "reason", "subtopic"]);
});

test("extractPageFromHtml keeps an H1 that lives inside <header>", () => {
  const words = Array.from({ length: 60 }, (_, i) => `palabra${i}`).join(" ");
  const html = `<html><head><title>T</title></head><body><main><header><h1>Programación de Neox hoy</h1></header><p>${words}</p></main></body></html>`;
  assert.equal(extractPageFromHtml(BASE, `${BASE}/canales/neox`, html)?.h1, "Programación de Neox hoy");
});
