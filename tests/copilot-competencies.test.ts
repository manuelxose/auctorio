// Studio Copilot — competency selection and deterministic SEO findings.
import test from "node:test";
import assert from "node:assert/strict";
import { COMPETENCIES, availableCompetencies, seoFindings, selectCompetency } from "../src/studio/copilot/competencies";

test("every competency is read-only and declares a permission", () => {
  for (const competency of COMPETENCIES) {
    assert.equal(competency.mutates, false, competency.key);
    assert.ok(competency.permission, competency.key);
  }
});

test("project competencies are unavailable without an open article", () => {
  const keys = availableCompetencies({ projectId: null }).map((item) => item.key);
  assert.ok(!keys.includes("seo-review"));
  assert.ok(!keys.includes("qa-explain"));
  assert.ok(keys.includes("workspace-brief"));
});

test("selectCompetency maps intents and leaves general questions to the page context", () => {
  assert.equal(selectCompetency("Analyze this article for SEO weaknesses", { projectId: "p" })?.key, "seo-review");
  assert.equal(selectCompetency("Explain why the QA stage failed", { projectId: "p" })?.key, "qa-explain");
  assert.equal(selectCompetency("Show the latest publication attempts", { projectId: null })?.key, "publication-status");
  assert.equal(selectCompetency("Explain why the QA stage failed", { projectId: null }), null);
  assert.equal(selectCompetency("hello", { projectId: "p" }), null);
});

test("seoFindings flags missing metadata, thin bodies and images without alt", () => {
  const findings = seoFindings({ title: "Hi", seoTitle: null, seoDescription: "", bodyHtml: "<p>short</p><img src=x>" });
  const messages = findings.map((f) => f.message).join(" | ");
  assert.match(messages, /SEO title is 2 characters/);
  assert.match(messages, /No meta description/);
  assert.match(messages, /under 300/);
  assert.match(messages, /without alt text/);
});

test("seoFindings passes a well-formed article", () => {
  const body = `<h2>One</h2><p>${"word ".repeat(400)}</p><h2>Two</h2><p>${"word ".repeat(300)}<a href="/x">x</a></p><img src="a" alt="A chart">`;
  const findings = seoFindings({ seoTitle: "A thirty-plus character SEO title here", seoDescription: "d".repeat(120), bodyHtml: body });
  assert.deepEqual(findings, []);
});
