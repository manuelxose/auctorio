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
(0, node_test_1.default)("placeholder detection does not flag the common Spanish word 'todo'", () => {
    const report = (0, qa_1.runVersionQa)({
        title: "Guia completa para ver series en television",
        excerpt: "Todo lo que necesitas saber para no perderte ningun estreno, con todo el detalle de plataformas y horarios.",
        bodyHtml: "<p>Todo el mundo quiere saber que ver esta noche. Esta guia explica todo lo necesario sobre horarios y plataformas.</p>" +
            "<h2>Plataformas</h2><p>" + "contenido ".repeat(80) + "</p>",
        seoTitle: "Guia completa para ver series en television",
        seoDescription: "Todo lo que necesitas saber para no perderte ningun estreno, con detalle de plataformas y horarios.",
    }, true);
    const placeholderCheck = report.checks.find((check) => check.key === "no_placeholders");
    strict_1.default.ok(placeholderCheck);
    strict_1.default.equal(placeholderCheck.passed, true);
});
(0, node_test_1.default)("placeholder detection still flags real TODO markers", () => {
    const report = (0, qa_1.runVersionQa)({
        title: "Guia completa para ver series en television",
        excerpt: "Todo lo que necesitas saber para no perderte ningun estreno.",
        bodyHtml: "<p>TODO: revisar la tabla de horarios antes de publicar.</p><h2>Plataformas</h2><p>" + "contenido ".repeat(80) + "</p>",
        seoTitle: "Guia completa para ver series en television",
        seoDescription: "Todo lo que necesitas saber para no perderte ningun estreno, con detalle de plataformas y horarios.",
    }, true);
    const placeholderCheck = report.checks.find((check) => check.key === "no_placeholders");
    strict_1.default.ok(placeholderCheck);
    strict_1.default.equal(placeholderCheck.passed, false);
});
