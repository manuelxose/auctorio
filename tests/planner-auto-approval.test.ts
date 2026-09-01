import test from "node:test";
import assert from "node:assert/strict";
import { isAutomaticApprovalQualityReady } from "../src/studio/planner";

const readyVersion = {
  status: "qa_passed",
  bodyHtml: `<p>${"Contenido editorial verificado para televisión y streaming. ".repeat(100)}</p>`,
  seoTitle: "Guía verificada de streaming | GuíaTV",
  seoDescription: "Una guía de televisión y streaming verificada, con información útil y actualizada.",
  qaReport: { passed: true, score: 92, checks: [] },
  contentImage: {
    status: "done",
    storagePath: "generated/hero.webp",
    assetVariants: [{ kind: "original" }, { kind: "hero" }, { kind: "og" }],
  },
};

test("automatic approval requires the maximum baseline quality", () => {
  assert.equal(isAutomaticApprovalQualityReady(readyVersion), true);
});

test("automatic approval blocks weak QA, warnings, missing image and thin copy", () => {
  assert.equal(isAutomaticApprovalQualityReady({ ...readyVersion, qaReport: { passed: true, score: 89, checks: [] } }), false);
  assert.equal(isAutomaticApprovalQualityReady({ ...readyVersion, qaReport: { passed: true, score: 92, checks: [{ key: "freshness", passed: false, message: "Needs refresh", severity: "warning" }] } }), false);
  assert.equal(isAutomaticApprovalQualityReady({ ...readyVersion, contentImage: null }), false);
  assert.equal(isAutomaticApprovalQualityReady({ ...readyVersion, bodyHtml: "<p>Breve.</p>" }), false);
});
