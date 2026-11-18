import test from "node:test";
import assert from "node:assert/strict";
import { articleChip, articleState, type ArticleRecords, type ArticleState } from "../src/studio/article-lifecycle";

const cases: Array<[string, ArticleRecords, ArticleState]> = [
  ["proposed plan item", { planItem: { status: "proposed" } }, "planned"],
  ["approved plan item, nothing produced", { planItem: { status: "approved" } }, "planned"],
  ["job writing", { planItem: { status: "generating" }, job: { status: "running" } }, "drafting"],
  ["job queued", { planItem: { status: "generating" }, job: { status: "queued" } }, "drafting"],
  ["assisted draft: ready publication but job awaits review", { job: { status: "needs_review" }, publication: { status: "ready" } }, "needs_review"],
  ["approved draft, manual mode (no publication)", { job: { status: "ready" } }, "ready"],
  ["approved and scheduled in its slot", { job: { status: "ready" }, publication: { status: "scheduled" } }, "scheduled"],
  ["publishing now", { publication: { status: "publishing" } }, "scheduled"],
  ["published", { job: { status: "ready" }, publication: { status: "published" } }, "published"],
  ["publish failed", { job: { status: "ready" }, publication: { status: "failed" } }, "failed"],
  ["writing failed (item went back to approved)", { planItem: { status: "approved" }, job: { status: "failed" } }, "failed"],
  ["job cancelled, item back to approved", { planItem: { status: "approved" }, job: { status: "cancelled" } }, "planned"],
  ["rejected plan item", { planItem: { status: "rejected" } }, "canceled"],
  ["canceled plan item", { planItem: { status: "canceled" } }, "canceled"],
  ["legacy item in review, no job", { planItem: { status: "review_required" } }, "needs_review"],
  ["legacy content ready, no job", { planItem: { status: "content_ready" } }, "ready"],
  ["nothing at all", {}, "planned"],
];

for (const [name, records, expected] of cases) {
  test(`lifecycle: ${name} → ${expected}`, () => {
    assert.equal(articleState(records), expected);
  });
}

test("lifecycle chips: ready and scheduled show as queued; canceled has no chip", () => {
  assert.equal(articleChip("planned"), "queued");
  assert.equal(articleChip("ready"), "queued");
  assert.equal(articleChip("scheduled"), "queued");
  assert.equal(articleChip("drafting"), "drafting");
  assert.equal(articleChip("needs_review"), "review");
  assert.equal(articleChip("published"), "published");
  assert.equal(articleChip("failed"), "failed");
  assert.equal(articleChip("canceled"), null);
});
