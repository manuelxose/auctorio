import test from "node:test";
import assert from "node:assert/strict";
import { applyBrandCards, readBrandSettings, readableOn, resolveBrand } from "../src/studio/editorial-engine/brand";
import { getStructureSpec, renderStructureSpec, resolveArticleTargets, resolveBrandSettings } from "../src/studio/editorial-engine/structure";
import { siteGuidance } from "../src/studio/production/plan-item";
import { cleanStyle, sanitizeEditorialHtml } from "../src/studio/html-sanitizer";
import { buildGuiaTvPayload } from "../src/studio/publishers";
import type { PublisherContext } from "../src/studio/types";

const site = { name: "GuíaTV", baseUrl: "https://guiaprogramaciontv.com" };
const allOn = { linkCard: true, contactCard: true, mapCard: true };
const writerBody = [
  "<p>Intro con la respuesta.</p><p>Alcance.</p>",
  '<aside data-block="link_card"><p><strong>GuíaTV</strong> · guiaprogramaciontv.com</p><p><strong>Encuentra qué se emite ahora</strong></p><p>Toda la parrilla en una página.</p><p><a href="https://guiaprogramaciontv.com">Visitar</a></p></aside>',
  '<aside data-block="summary"><p><strong>En resumen</strong></p><ul><li>a</li></ul></aside>',
  "<h2>Qué canales hay</h2><p>Texto.</p>",
  "<p>Aviso legal.</p>",
].join("");

test("M5 brand settings: untrusted JSON is validated (URLs, colours, limits)", () => {
  const brand = readBrandSettings({
    logoUrl: "javascript:alert(1)",
    primaryColor: "#FF0000",
    secondaryColor: "red",
    positioning: "x".repeat(600),
    offers: Array.from({ length: 25 }, (_, i) => ({ name: `Plan ${i}`, price: "9 €", url: i === 0 ? "ftp://x" : "https://a.es/p" })),
    blogPath: "/blog",
    contactCard: { email: "no-es-email", phone: "+34 600<b>" },
    unknown: true,
  });
  assert.equal(brand.logoUrl, "");
  assert.equal(brand.primaryColor, "#ff0000");
  assert.equal(brand.secondaryColor, "");
  assert.equal(brand.positioning.length, 500);
  assert.equal(brand.offers.length, 20);
  assert.equal(brand.offers[0].url, "");
  assert.equal(brand.contactCard.email, "");
  assert.equal(brand.contactCard.phone, "+34 600");
  assert.ok(!("unknown" in brand));
  // Stored next to the targets; resolving the targets ignores it.
  assert.equal(resolveBrandSettings({ brand: { primaryColor: "#123456" } }).primaryColor, "#123456");
  assert.ok(!("brand" in resolveArticleTargets({ brand: { primaryColor: "#123456" } })));
});

test("M5 link card: app-rendered with brand colours, writer wording kept unless configured, survives the sanitizer", () => {
  const brand = resolveBrand(readBrandSettings({ primaryColor: "#ffcc00", logoUrl: "https://cdn.example.com/logo.png" }), site);
  const html = sanitizeEditorialHtml(applyBrandCards(writerBody, brand, allOn, "es"));
  assert.equal((html.match(/data-block="link_card"/g) ?? []).length, 1);
  assert.match(html, /<aside data-block="link_card" style="[^"]*border-left:4px solid #ffcc00/);
  assert.match(html, /<strong>Encuentra qué se emite ahora<\/strong>/);
  assert.match(html, /<a href="https:\/\/guiaprogramaciontv\.com" style="[^"]*background-color:#ffcc00;color:#111111[^"]*" rel="noopener noreferrer">Visitar<\/a>/);
  assert.match(html, /<img src="https:\/\/cdn\.example\.com\/logo\.png" alt="GuíaTV"/);
  assert.ok(!html.includes("contact_card") && !html.includes("map_card"), "no data → no contact/map card");
  assert.ok(!/<script|onclick/i.test(html));

  const configured = resolveBrand(readBrandSettings({ linkCard: { headline: "Mira la parrilla", text: "Gratis.", url: "https://guiaprogramaciontv.com/hoy", buttonText: "Ver hoy" } }), site);
  const out = applyBrandCards(writerBody, configured, allOn, "es");
  assert.match(out, /<strong>Mira la parrilla<\/strong>/);
  assert.match(out, /href="https:\/\/guiaprogramaciontv\.com\/hoy"[^>]*>Ver hoy</);
  assert.equal(readableOn("#1f2937"), "#ffffff");

  // Switched off: the writer's block is removed too.
  assert.ok(!applyBrandCards(writerBody, brand, { ...allOn, linkCard: false }, "es").includes("link_card"));
});

test("M5 contact and map cards: placeholders filled, otherwise contact last (before the disclaimer) and map before it", () => {
  const brand = resolveBrand(readBrandSettings({ contactCard: { email: "hola@guiaprogramaciontv.com", phone: "+34 600 000 000" }, mapCard: { address: "Calle Mayor 1, Madrid" } }), site);
  const out = applyBrandCards(writerBody, brand, allOn, "es", "Aviso legal.");
  const contact = out.indexOf('data-block="contact_card"');
  const map = out.indexOf('data-block="map_card"');
  assert.ok(map > 0 && contact > map && out.indexOf("Aviso legal.") > contact, out);
  assert.match(out, /href="mailto:hola@guiaprogramaciontv\.com"/);
  assert.match(out, /href="tel:\+34600000000"/);
  assert.match(out, /google\.com\/maps\/search\/\?api=1&amp;query=Calle%20Mayor%201%2C%20Madrid/);

  const placed = applyBrandCards(`${writerBody}<h2>Dónde</h2><aside data-block="map_card"></aside><p>Fin.</p>`, brand, allOn, "es");
  assert.ok(placed.indexOf('data-block="map_card"') < placed.indexOf("<p>Fin.</p>"));
  const off = applyBrandCards(placed, brand, { ...allOn, contactCard: false, mapCard: false }, "es");
  assert.ok(!off.includes("contact_card") && !off.includes("map_card"), "switched off");
});

test("M5 sanitizer: inline style keeps only plain presentational declarations", () => {
  assert.equal(cleanStyle("color:#fff;background-image:url(x);background-color:red;width:expression(alert(1))"), "color:#fff;background-color:red");
  assert.equal(sanitizeEditorialHtml('<p style="background:url(javascript:x)">a</p>'), "<p>a</p>");
  assert.equal(sanitizeEditorialHtml('<h2 style="color:red">a</h2>'), "<h2>a</h2>", "style only on card elements");
});

test("M5 writer: brand facts in guidance; map/contact sections only when switched on", () => {
  const brand = resolveBrand(
    readBrandSettings({ positioning: "La guía de TV más rápida", audience: ["Espectadores de TDT"], location: { country: "España", cities: ["Madrid"] }, offers: [{ name: "Guía premium", price: "3 €/mes", url: "https://guiaprogramaciontv.com/premium" }], blogPath: "/blog", promo: "Es gratis" }),
    site,
    { brandSummary: "ignorado", detectedAudience: "ignorado" },
  );
  const lines = siteGuidance(site, brand).join("\n");
  assert.match(lines, /home URL \(allowed link\): https:\/\/guiaprogramaciontv\.com/);
  assert.match(lines, /La guía de TV más rápida/);
  assert.match(lines, /Guía premium — 3 €\/mes — https:\/\/guiaprogramaciontv\.com\/premium/);
  assert.match(lines, /Madrid — España/);
  assert.match(lines, /blog lives under \/blog/);
  assert.match(lines, /must convey: Es gratis/);
  // The crawled profile fills empty fields.
  assert.match(siteGuidance(site, resolveBrand(readBrandSettings(null), site, { brandSummary: "Parrilla de TV", detectedAudience: "Teleespectadores" })).join("\n"), /Parrilla de TV[\s\S]*Teleespectadores/);

  const on = renderStructureSpec(getStructureSpec("guide"), "es", [], resolveArticleTargets({}));
  assert.ok(on.includes("- map_card") && on.includes("- contact_card"));
  const off = renderStructureSpec(getStructureSpec("guide"), "es", [], resolveArticleTargets({ sections: { mapCard: false, contactCard: false } }));
  assert.ok(!off.includes("map_card") && !off.includes("contact_card"));
});

test("M5 publisher: the rendered link card reaches the GuíaTV payload with its colours", () => {
  const body = applyBrandCards(writerBody, resolveBrand(readBrandSettings({ primaryColor: "#0055aa" }), site), allOn, "es");
  const context = {
    site: { name: "GuíaTV", baseUrl: site.baseUrl, locale: "es-ES" },
    project: { title: "t", primaryLanguage: "es", metadata: { slug: "t" } },
    version: { title: "t", excerpt: "x", bodyHtml: sanitizeEditorialHtml(body), seoTitle: "t", seoDescription: "d", publishedAt: null, updatedAt: new Date("2026-11-18") },
  } as unknown as PublisherContext;
  const content = String(buildGuiaTvPayload(context, null, "draft").content);
  assert.match(content, /<aside data-block="link_card" style="[^"]*#0055aa/);
  assert.match(content, /background-color:#0055aa;color:#ffffff/);
});
