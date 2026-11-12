// AI provider selection: model validation, provider lookup, workspace-less jobs.
import test from "node:test";
import assert from "node:assert/strict";
import { AI_PROVIDERS, activeAiSelection, findProvider, isValidModel, withAiTenant } from "../src/infrastructure/ai/ai-settings";

test("the registry offers DeepSeek, Claude and OpenAI and reads GuíaTV's key names", () => {
  assert.deepEqual(AI_PROVIDERS.map((p) => p.id), ["deepseek", "anthropic", "openai"]);
  assert.deepEqual(AI_PROVIDERS.map((p) => p.keyEnv), ["DEEPSEEK_API_KEY", "ANTHROPIC_API_KEY", "OPENAI_API_KEY"]);
});

test("only listed models are accepted, except for providers with free model ids", () => {
  assert.equal(isValidModel(findProvider("deepseek")!, "deepseek-chat"), true);
  assert.equal(isValidModel(findProvider("deepseek")!, "gpt-anything"), false);
  assert.equal(isValidModel(findProvider("anthropic")!, "claude-opus-5-5"), true);
  assert.equal(isValidModel(findProvider("anthropic")!, "claude-opus-5-5; drop table"), false);
  assert.equal(isValidModel(findProvider("openai")!, "some-model-id"), true);
  assert.equal(isValidModel(findProvider("openai")!, "bad id with spaces"), false);
  assert.equal(findProvider("ollama"), null);
});

test("outside a workspace context there is no selection and jobs run unchanged", async () => {
  assert.equal(activeAiSelection(), null);
  assert.equal(await withAiTenant(null, async () => "ran"), "ran");
});
