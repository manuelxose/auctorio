"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const prompt_1 = require("../src/application/services/prompt");
(0, node_test_1.default)("buildTextPrompt includes studio context for SEO generation", () => {
    const prompt = (0, prompt_1.buildTextPrompt)({
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
    strict_1.default.match(prompt.systemPrompt, /SEO/);
    strict_1.default.match(prompt.prompt, /Editorial goal: comparison/);
    strict_1.default.match(prompt.prompt, /Site: Guia TV/);
    strict_1.default.match(prompt.prompt, /Revision feedback: Hazlo mas claro/);
});
(0, node_test_1.default)("buildImagePrompt adds editorial image guidance", () => {
    const prompt = (0, prompt_1.buildImagePrompt)({
        topicTitle: "Articulo de tecnologia",
        topicDescription: "Contenido corporativo",
        mode: "independent",
        options: {
            site_name: "TecnoRia",
            goal: "article",
            style: "editorial photography",
        },
    });
    strict_1.default.match(prompt, /TecnoRia/);
    strict_1.default.match(prompt, /editorial publication/);
});
