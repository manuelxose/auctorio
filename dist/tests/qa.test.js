"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const qa_1 = require("../src/studio/qa");
(0, node_test_1.default)("runVersionQa passes a complete editorial version", () => {
    const report = (0, qa_1.runVersionQa)({
        title: "Comparativa de plataformas de streaming para elegir mejor en 2026",
        excerpt: "Analizamos precios, catalogo y perfil de uso para ayudarte a elegir la mejor plataforma segun tu caso.",
        bodyHtml: "<p>Intro detallada con suficiente contexto para el lector profesional.</p><h2>Comparativa</h2><p>" +
            "palabra ".repeat(220) +
            "</p>",
        seoTitle: "Comparativa de plataformas de streaming 2026",
        seoDescription: "Guia clara para comparar Netflix, Max, Disney+ y otras plataformas segun catalogo, precio y tipo de usuario.",
    }, true);
    strict_1.default.equal(report.passed, true);
    strict_1.default.equal(report.checks.some((check) => check.passed === false && check.severity === "error"), false);
});
(0, node_test_1.default)("runVersionQa fails when image and body are missing", () => {
    const report = (0, qa_1.runVersionQa)({
        title: "Titulo corto",
        excerpt: "Resumen corto",
        bodyHtml: "<p>poco texto</p>",
        seoTitle: "Titulo",
        seoDescription: "Descripcion corta",
    }, false);
    strict_1.default.equal(report.passed, false);
    strict_1.default.equal(report.checks.some((check) => check.key === "image_ready" && check.passed === false), true);
});
