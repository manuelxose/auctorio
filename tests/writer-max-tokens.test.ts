import assert from "node:assert/strict";
import test from "node:test";
import { writerMaxTokens } from "../src/studio/production/stages";

test("writerMaxTokens leaves room for the JSON envelope of a 650-word Spanish article", () => {
  // Regression: 650 words used to get 1430 tokens, which truncated DeepSeek's JSON mid-article.
  assert.ok(writerMaxTokens(650) >= 3000);
  assert.equal(writerMaxTokens(100), 3000);
  assert.equal(writerMaxTokens(5000), 8000);
});
