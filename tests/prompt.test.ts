import test from "node:test";
import assert from "node:assert/strict";
import { buildTextPrompt, buildImagePrompt } from "../src/application/services/prompt";

test("buildTextPrompt includes studio context for SEO generation", () => {
  const prompt = buildTextPrompt({
    topicTitle: "Guia de streaming",
    topicDescription: "Comparativa de plataformas",
    facts: ["Netflix tiene plan estandar", "Max tiene catalogo de HBO"],
    type: "seo",
    language: "es",
    options: {
      goal: "comparison",
      site_name: "Guia TV",
      brand_voice: { tone: "directo" },
      revision_feedback: "Hazlo mas claro",
    },
  });

  assert.match(prompt.systemPrompt, /SEO/);
  assert.match(prompt.prompt, /Editorial goal: comparison/);
  assert.match(prompt.prompt, /Site: Guia TV/);
  assert.match(prompt.prompt, /Revision feedback: Hazlo mas claro/);
});

test("buildImagePrompt adds editorial image guidance", () => {
  const prompt = buildImagePrompt({
    topicTitle: "Articulo de tecnologia",
    topicDescription: "Contenido corporativo",
    mode: "independent",
    options: {
      site_name: "TecnoRia",
      goal: "article",
      style: "editorial photography",
    },
  });

  assert.match(prompt, /TecnoRia/);
  assert.match(prompt, /editorial publication/);
});
