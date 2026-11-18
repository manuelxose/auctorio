import test from "node:test";
import assert from "node:assert/strict";
import { countLinks, runQualityChecklist } from "../src/studio/editorial-engine/quality-checklist";
import { slugify } from "../src/studio/editorial-engine/seo-package";

// Acceptance 2026-11-18: the writer emits absolute own-site URLs, which QA counted as external (0 internal, 46 external).
test("countLinks: absolute links on the site's host (with or without www) are internal", () => {
  const html = [
    '<a href="https://guiaprogramaciontv.com/guia-canales">a</a>',
    '<a href="https://www.guiaprogramaciontv.com/peliculas-hoy/">b</a>',
    '<a href="/canal/la-1">c</a>',
    '<a href="https://www.rtve.es/play/">d</a>',
    '<a href="#faq">toc</a>',
    '<a href="mailto:x@y.z">m</a>',
  ].join("");
  assert.deepEqual(countLinks(html, "https://guiaprogramaciontv.com"), { internal: 3, external: 1 });
  // Without the site URL only relative links are internal (previous behaviour).
  assert.deepEqual(countLinks(html, null), { internal: 1, external: 3 });

  const items = runQualityChecklist({
    bodyHtml: `<p>x</p>${html}`,
    seoTitle: "",
    seoDescription: "",
    primaryKeyword: null,
    semanticKeywords: [],
    targets: null,
    cannibalizationRisk: null,
    internalLinkInventorySize: null,
    siteUrl: "https://guiaprogramaciontv.com/",
  });
  assert.equal(items.find((item) => item.key === "internal_links")?.passed, true);
});

test("slugify cuts at a word boundary within the limit", () => {
  assert.equal(slugify("Canales de televisión gratis", 60), "canales-de-television-gratis");
  const long = slugify("Audiencias de televisión del miércoles: la final de MasterChef arrasa en prime time", 60);
  assert.ok(long.length <= 60);
  assert.equal(long, "audiencias-de-television-del-miercoles-la-final-de");
  assert.equal(slugify("supercalifragilistico", 10), "supercalif");
});
