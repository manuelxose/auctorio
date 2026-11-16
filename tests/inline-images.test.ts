// In-body images: placement spread across sections, idempotent per slot, slot ids round-trip.
import test from "node:test";
import assert from "node:assert/strict";
import { INLINE_IMAGE_MIN, filledInlineSlots, inlineFigureHtml, inlineImageHash, insertInlineFigure, parseInlineImageHash } from "../src/studio/inline-images";

const body = ["<p>intro</p>", ...[1, 2, 3, 4, 5, 6].map((n) => `<h2>S${n}</h2><p>p${n}</p><p>q${n}</p>`)].join("");

test("three inline images land after the first paragraph of different sections, never the opening one", () => {
  let html = body;
  for (let slot = 0; slot < INLINE_IMAGE_MIN; slot++) {
    html = insertInlineFigure(html, inlineFigureHtml(`https://cdn.test/${slot}.webp`, `S`, slot, `id-${slot}`), slot);
  }
  assert.deepEqual(filledInlineSlots(html).sort(), [0, 1, 2]);
  assert.match(html, /<h2>S2<\/h2><p>p2<\/p>\n<figure data-auctorio-slot="0"/);
  assert.match(html, /<h2>S4<\/h2><p>p4<\/p>\n<figure data-auctorio-slot="1"/);
  assert.match(html, /<h2>S5<\/h2><p>p5<\/p>\n<figure data-auctorio-slot="2"/);
  assert.equal(insertInlineFigure(html, "<figure>dup</figure>", 1), html);
});

test("a body without H2 still gets its images between paragraphs", () => {
  const html = insertInlineFigure("<p>a</p><p>b</p><p>c</p><p>d</p>", "<figure data-auctorio-slot=\"0\"></figure>", 0);
  assert.equal(html, "<p>a</p><p>b</p>\n<figure data-auctorio-slot=\"0\"></figure><p>c</p><p>d</p>");
});

test("the dedupe hash carries version and slot", () => {
  const versionId = "3f2b8c1e-1a2b-4c3d-8e9f-0a1b2c3d4e5f";
  assert.deepEqual(parseInlineImageHash(inlineImageHash(versionId, 2, "n")), { versionId, slot: 2 });
  assert.equal(parseInlineImageHash("sha256:abc"), null);
});
