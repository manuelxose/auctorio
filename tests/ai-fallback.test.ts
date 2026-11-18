import test from "node:test";
import assert from "node:assert/strict";
import { textChain, type AiTextSettings } from "../src/infrastructure/ai/ai-settings";
import { FallbackTextProvider, type TextProvider } from "../src/infrastructure/ai/text";

const all = () => true;

test("textChain: the use's model first, then the explicit fallback, then every other provider with a key", () => {
  const settings: AiTextSettings = {
    provider: "anthropic",
    model: "claude-sonnet-5-5",
    uses: { articles: { provider: "anthropic", model: "claude-haiku-5-5" } },
    fallback: { provider: "deepseek", model: "deepseek-reasoner" },
  };
  const onlyKeys = (ids: string[]) => (p: { id: string }) => ids.includes(p.id);
  assert.deepEqual(textChain(settings, "articles", onlyKeys(["anthropic", "deepseek"])), [
    { provider: "anthropic", model: "claude-haiku-5-5" },
    { provider: "deepseek", model: "deepseek-reasoner" },
  ]);
  // A use without its own model runs on the default; providers without a key are skipped.
  assert.deepEqual(textChain(settings, "plans", onlyKeys(["anthropic", "deepseek"])).map((s) => s.model), ["claude-sonnet-5-5", "deepseek-reasoner"]);
  // No explicit fallback: the other configured providers on their default model.
  const chain = textChain({ provider: "anthropic", model: "claude-sonnet-5-5" }, undefined, onlyKeys(["anthropic", "deepseek"]));
  assert.deepEqual(chain, [{ provider: "anthropic", model: "claude-sonnet-5-5" }, { provider: "deepseek", model: "deepseek-chat" }]);
  // The chosen provider lost its key: the chain still has a model to run.
  assert.deepEqual(textChain({ provider: "anthropic", model: "claude-sonnet-5-5" }, undefined, onlyKeys(["deepseek"])), [{ provider: "deepseek", model: "deepseek-chat" }]);
  assert.equal(textChain({ provider: "anthropic", model: "claude-sonnet-5-5" }, undefined, all).length >= 2, true);
});

test("FallbackTextProvider: a failing provider (no credit) hands the call to the next one", async () => {
  const calls: string[] = [];
  const failing: TextProvider = { generate: async () => { calls.push("a"); throw new Error("400 credit balance is too low"); } };
  const working: TextProvider = { generate: async () => { calls.push("b"); return { output: "ok", provider: "deepseek", model: "deepseek-chat" }; } };
  const result = await new FallbackTextProvider([{ label: "anthropic", provider: failing }, { label: "deepseek", provider: working }]).generate({ prompt: "x" });
  assert.equal(result.output, "ok");
  assert.equal(result.provider, "deepseek");
  assert.deepEqual(calls, ["a", "b"]);
  // Every provider failing surfaces the last error.
  await assert.rejects(new FallbackTextProvider([{ label: "a", provider: failing }]).generate({ prompt: "x" }), /credit balance/);
});
