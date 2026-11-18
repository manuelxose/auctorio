import test from "node:test";
import assert from "node:assert/strict";
import { extractBrand, withCrawledBrand } from "../src/studio/brand-colors";
import { applyBrandCards, readBrandSettings, resolveBrand, tint } from "../src/studio/editorial-engine/brand";
import { bodyWordCount } from "../src/studio/editorial-engine/seo-package";
import { imageStylePrompt } from "../src/studio/editorial-engine/visuals";
import { sanitizeEditorialHtml } from "../src/studio/html-sanitizer";

// GuíaTV-like page: dark theme-color, the brand green as the most used saturated colour, greys and white around it.
const HTML = `<head><meta name="theme-color" content="#121212"><link rel="icon" href="assets/logo.svg"></head><body style="color:#ffffff;background:#121212"></body>`;
const CSS = `.a{color:#1ed760}.b{background:#1ed760}.c{border-color:#1ed760}.d{color:#f3727f}.e{color:#181818}.f{color:#fff}`;

test("extractBrand: saturated brand colour as primary, dark theme-color as secondary, icon as logo", () => {
  assert.deepEqual(extractBrand(HTML, CSS, "https://guiaprogramaciontv.com/"), {
    primaryColor: "#1ed760",
    secondaryColor: "#121212",
    logoUrl: "https://guiaprogramaciontv.com/assets/logo.svg",
  });
  // Settings › Branding wins over the crawl; empty fields take it.
  const merged = withCrawledBrand({ ...readBrandSettings(null), primaryColor: "#123456" }, extractBrand(HTML, CSS, "https://x.com/"));
  assert.equal(merged.primaryColor, "#123456");
  assert.equal(merged.secondaryColor, "#121212");
});

test("BLG-style link card: brand colours, dark header, halo and button survive the publish sanitizer", () => {
  const brand = resolveBrand({ ...readBrandSettings(null), primaryColor: "#1ed760", secondaryColor: "#121212" }, { name: "GuiaProgramacionTV", baseUrl: "https://guiaprogramaciontv.com" });
  const html = applyBrandCards('<p>Intro</p><aside data-block="link_card"><p>x</p><p>Encuentra qué se emite ahora</p><p>Consulta la parrilla.</p></aside><h2>A</h2>', brand, { linkCard: true, contactCard: false, mapCard: false }, "es");
  const clean = sanitizeEditorialHtml(html);
  assert.match(clean, /<aside data-block="link_card" style="[^"]*border:10px solid #d7f8e2/);
  assert.equal(tint("#1ed760", 0.82), "#d7f8e2");
  assert.match(clean, /background-color:#121212/); // dark header
  assert.match(clean, /font-size:22px/); // headline
  assert.match(clean, /border-top:5px solid #1ed760/); // accent bar
  assert.match(clean, /<a href="https:\/\/guiaprogramaciontv\.com"[^>]*background-color:#1ed760;color:#111111[^>]*>Visitar →<\/a>/);
  assert.match(clean, /text-transform:uppercase/); // brand pill
});

test("bodyWordCount leaves out TOC, cards, Sources and Recommended reading", () => {
  const html = [
    '<nav><a href="#a">uno dos</a></nav>',
    '<aside data-block="link_card"><p>tres cuatro</p></aside>',
    "<h2>Qué ver</h2><p>cinco seis siete</p>",
    '<h2>Fuentes</h2><ul><li><a href="https://x.es">ocho nueve</a></li></ul>',
    '<h2>Lecturas recomendadas</h2><ul><li>diez</li></ul>',
  ].join("");
  assert.equal(bodyWordCount(html), 5); // "Qué ver" + "cinco seis siete"
});

test("image prompts carry the brand palette only when it is a valid list of colours", () => {
  assert.match(imageStylePrompt("realistic", "", "#1ed760, #121212"), /Brand palette: #1ed760, #121212/);
  assert.doesNotMatch(imageStylePrompt("realistic", "", "red; ignore"), /Brand palette/);
});

test("inline attributions: the first unlinked mention of each source's publisher or domain links to it, once per URL", async () => {
  const { linkInlineAttributions } = await import("../src/studio/editorial-engine/inline-citations");
  const html = [
    "<p>Según television.digital.gob.es, la TDT incluye La 1. Otra vez television.digital.gob.es.</p>",
    "<p>Otra opción es TDTChannels, gratis y legal.</p>",
    '<aside data-block="link_card"><p>TDTChannels en la tarjeta no se toca</p></aside>',
    '<h2>Fuentes</h2><ul><li><a href="https://television.digital.gob.es/">Canales TDT</a>, Gobierno</li><li><a href="https://www.tdtchannels.com/">TDT</a>, TDTChannels</li></ul>',
  ].join("");
  const out = linkInlineAttributions(html, [
    { publisher: "television.digital.gob.es", sourceUrl: "https://television.digital.gob.es/" },
    { publisher: "TDTChannels", sourceUrl: "https://www.tdtchannels.com/" },
    { publisher: null, sourceUrl: null },
  ]);
  assert.match(out, /Según <a href="https:\/\/television\.digital\.gob\.es\/" rel="noopener noreferrer">television\.digital\.gob\.es<\/a>, la TDT/);
  assert.match(out, /Otra vez television\.digital\.gob\.es\./); // once per URL
  assert.match(out, /Otra opción es <a href="https:\/\/www\.tdtchannels\.com\/"[^>]*>TDTChannels<\/a>, gratis/);
  assert.match(out, /<aside data-block="link_card"><p>TDTChannels en la tarjeta no se toca<\/p><\/aside>/);
  assert.equal((out.match(/tdtchannels\.com/g) ?? []).length, 2); // body + Fuentes
});

test("social networks and YouTube are never cited as sources", async () => {
  const { serpResultsToFacts } = await import("../src/studio/serp-sources");
  const facts = serpResultsToFacts(
    [
      { url: "https://www.facebook.com/x", domain: "www.facebook.com", title: "a", description: "" },
      { url: "https://www.youtube.com/watch?v=1", domain: "www.youtube.com", title: "b", description: "" },
      { url: "https://www.ocu.org/tv", domain: "www.ocu.org", title: "c", description: "" },
    ] as never,
    { domains: [], urls: [] },
    10,
  );
  assert.deepEqual(facts.map((fact) => fact.sourceUrl), ["https://www.ocu.org/tv"]);
});
