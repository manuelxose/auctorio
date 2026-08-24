import test from "node:test";
import assert from "node:assert/strict";
import { normalizePageUrl, parseSitemapBody } from "../src/studio/site-intelligence/sitemap";
import { extractPageFromHtml, inferContentTypeFromUrl } from "../src/studio/site-intelligence/crawler";

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
