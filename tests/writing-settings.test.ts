import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_WRITING,
  formatInternalUrl,
  readArticleTargetsOverride,
  readWritingSettings,
  renderWritingGuidance,
  resolveArticleTargets,
  resolveWritingSettings,
} from "../src/studio/editorial-engine/structure";

test("readWritingSettings keeps valid values, trims and caps rules, drops junk", () => {
  const settings = readWritingSettings({
    instructions: ["  Never use the word  leverage ", "", "Never use the word leverage", "x".repeat(400), 42],
    length: "long",
    authorPerspective: true,
    summaryVariant: "key_takeaways",
    internalLinks: { enabled: false, www: true },
    disclaimer: "Written with AI assistance.",
    evil: "<script>",
  });
  assert.deepEqual(settings.instructions, ["Never use the word leverage", "x".repeat(300)]);
  assert.equal(settings.length, "long");
  assert.equal(settings.summaryVariant, "key_takeaways");
  assert.deepEqual(settings.internalLinks, { enabled: false, www: true, trailingSlash: false });
  assert.equal((settings as Record<string, unknown>).evil, undefined);
  assert.deepEqual(readWritingSettings(null), DEFAULT_WRITING);
  assert.equal(readWritingSettings({ length: "huge" }).length, "dynamic");
});

test("the writing block survives the article_targets round trip and a fixed length sets the word target", () => {
  const stored = readArticleTargetsOverride({ faqCount: 4, writing: { length: "short", citations: false } });
  assert.equal(stored.writing?.length, "short");
  assert.equal(resolveWritingSettings(stored).citations, false);
  assert.equal(resolveArticleTargets(stored).words, 1400);
  assert.equal(resolveArticleTargets(stored).faqCount, 4);
  assert.equal((resolveArticleTargets(stored) as Record<string, unknown>).writing, undefined);
  // Dynamic keeps the guide default.
  assert.equal(resolveArticleTargets({ writing: { length: "dynamic" } }).words, 2300);
  assert.deepEqual(resolveWritingSettings(null), DEFAULT_WRITING);
});

test("internal URLs follow the site's www and trailing-slash choice", () => {
  const url = "https://www.guiaprogramaciontv.com/guia-canales";
  assert.equal(formatInternalUrl(url, { enabled: true, www: false, trailingSlash: true }), "https://guiaprogramaciontv.com/guia-canales/");
  assert.equal(formatInternalUrl("https://guiaprogramaciontv.com/guia-canales/", { enabled: true, www: true, trailingSlash: false }), "https://www.guiaprogramaciontv.com/guia-canales");
  assert.equal(formatInternalUrl("https://guiaprogramaciontv.com/feed.xml", { enabled: true, www: false, trailingSlash: true }), "https://guiaprogramaciontv.com/feed.xml");
  assert.equal(formatInternalUrl("not a url", { enabled: true, www: true, trailingSlash: true }), "not a url");
});

test("writer guidance carries rules, register, summary variant and the disclaimer", () => {
  const lines = renderWritingGuidance(readWritingSettings({ instructions: ["Say «programación», not «parrilla»"], summaryVariant: "key_takeaways", disclaimer: "Texto con ayuda de IA." }), "es").join("\n");
  assert.match(lines, /- Say «programación», not «parrilla»/);
  assert.match(lines, /impersonal/);
  assert.match(lines, /Puntos clave/);
  assert.match(lines, /Do not mention or recommend competitors/);
  assert.match(lines, /verbatim.*Texto con ayuda de IA\./);
});
