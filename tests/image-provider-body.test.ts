import assert from "node:assert/strict";
import test from "node:test";
import { openAiImageBody } from "../src/infrastructure/ai/image";

test("OpenAI image body sends only fields the API accepts; compatible providers keep image_size/seed", () => {
  const openai = openAiImageBody("openai", "gpt-image-1", { prompt: "p", size: "1024x576", seed: 7 });
  assert.deepEqual(Object.keys(openai).sort(), ["model", "n", "prompt", "size"]);
  assert.equal(openai.size, "1536x1024");
  const other = openAiImageBody("fal", "flux", { prompt: "p", size: "1024x576", seed: 7 });
  assert.deepEqual([other.image_size, other.seed, other.response_format], ["1024x576", 7, "b64_json"]);
});
