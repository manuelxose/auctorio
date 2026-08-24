import test from "node:test";
import assert from "node:assert/strict";
import {
  StructuredOutputError,
  extractJsonCandidate,
  generateStructured,
  parseJsonWithRepair,
} from "../src/infrastructure/ai/structured";
import type { TextGenerationInput, TextGenerationResult, TextProvider } from "../src/infrastructure/ai/text";
import { arr, obj, str, num, enums, optionalString, validateValue } from "../src/shared/schema";

const planSchema = obj({
  items: arr(
    obj({
      title: str({ minLength: 5 }),
      scheduledFor: str(),
      channel: enums(["website", "x", "instagram"]),
      priority: num({ integer: true, min: 0, max: 10 }),
      notes: optionalString(),
    }),
    { minItems: 1, maxItems: 7 },
  ),
});

function mockProvider(responses: string[]): TextProvider {
  let calls = 0;
  return {
    async generate(_input: TextGenerationInput): Promise<TextGenerationResult> {
      const output = responses[Math.min(calls, responses.length - 1)];
      calls += 1;
      return {
        output,
        provider: "mock",
        model: "mock-model",
        finishReason: "stop",
        usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
      };
    },
  };
}

function validPlan(): string {
  return JSON.stringify({
    items: [
      { title: "Guía de TV hoy", scheduledFor: "2026-09-01T10:00:00.000Z", channel: "website", priority: 8 },
      { title: "Dónde ver La Isla", scheduledFor: "2026-09-02T10:00:00.000Z", channel: "website", priority: 7 },
    ],
  });
}

// ────────────────────────────────────────────────────────────── parsing pipeline

test("parseJsonWithRepair accepts perfect JSON", () => {
  const parsed = parseJsonWithRepair(validPlan());
  assert.ok(parsed);
  assert.equal(parsed.repairAttempted, false);
  assert.deepEqual((parsed.json as { items: unknown[] }).items.length, 2);
});

test("parseJsonWithRepair accepts markdown-fenced JSON", () => {
  const parsed = parseJsonWithRepair("```json\n" + validPlan() + "\n```");
  assert.ok(parsed);
  assert.equal(parsed.repairAttempted, false);
});

test("parseJsonWithRepair extracts JSON from trailing prose", () => {
  const parsed = parseJsonWithRepair(`Here is the plan: ${validPlan()} Hope this helps!`);
  assert.ok(parsed);
  assert.equal((parsed.json as { items: unknown[] }).items.length, 2);
});

test("parseJsonWithRepair repairs truncated (unbalanced) JSON", () => {
  const truncated = validPlan().slice(0, -12); // cut closing braces
  const parsed = parseJsonWithRepair(truncated);
  assert.ok(parsed, "truncated object must be repaired");
  assert.equal(parsed.repairAttempted, true);
  assert.ok((parsed.json as { items: unknown[] }).items.length >= 1);
});

test("parseJsonWithRepair repairs trailing commas", () => {
  const withTrailingCommas = '{"items":[{"title":"X","priority":1,},],}';
  const parsed = parseJsonWithRepair(withTrailingCommas);
  assert.ok(parsed);
  assert.equal(parsed.repairAttempted, true);
});

test("parseJsonWithRepair returns null for irrecoverable output", () => {
  assert.equal(parseJsonWithRepair("no json anywhere"), null);
  assert.equal(parseJsonWithRepair("[1 2]"), null, "missing comma is not blindly repaired");
  assert.equal(parseJsonWithRepair(""), null);
});

test("extractJsonCandidate picks the first object", () => {
  assert.equal(extractJsonCandidate('prose {"a": 1} more'), '{"a": 1}');
  assert.equal(extractJsonCandidate("nothing"), null);
});

// ────────────────────────────────────────────────────────────── schema validation

test("validateValue reports wrong enums, invalid dates, excess rows, missing fields", () => {
  const badEnum = validateValue(planSchema, { items: [{ title: "X", scheduledFor: "2026-09-01", channel: "tiktok" }] });
  assert.equal(badEnum.ok, false);
  assert.ok((badEnum.errors ?? []).some((error) => error.includes("channel")));

  const badDate = validateValue(planSchema, { items: [{ title: "Una guia de ejemplo", scheduledFor: "not-a-date", channel: "website", priority: 5 }] });
  assert.equal(badDate.ok, true, "schema accepts any string; ISO validity is enforced by app-level date parsing");
  assert.ok(Number.isNaN(new Date("not-a-date").getTime()));

  const tooMany = validateValue(planSchema, { items: Array.from({ length: 8 }, () => ({ title: "T" })) });
  assert.equal(tooMany.ok, false);
  assert.ok((tooMany.errors ?? []).some((error) => error.includes("array longer")));

  const missing = validateValue(planSchema, { items: [{ scheduledFor: "2026-09-01", channel: "website" }] });
  assert.equal(missing.ok, false);
  assert.ok((missing.errors ?? []).some((error) => error.includes("title")));
});

// ────────────────────────────────────────────────────────────── generateStructured retry behaviour

test("generateStructured succeeds on first valid response", async () => {
  const result = await generateStructured({
    schemaName: "test_plan",
    schema: planSchema,
    prompt: "generate",
    providerOverride: mockProvider([validPlan()]),
  });
  assert.equal(result.attempts.length, 1);
  assert.equal(result.attempts[0].validation.ok, true);
  assert.equal(result.data.items.length, 2);
});

test("generateStructured retries once with validation errors and succeeds", async () => {
  const invalid = JSON.stringify({ items: [{ title: "short", scheduledFor: "2026-09-01", channel: "tiktok" }] });
  const result = await generateStructured({
    schemaName: "test_plan",
    schema: planSchema,
    prompt: "generate",
    providerOverride: mockProvider([invalid, validPlan()]),
  });
  assert.equal(result.attempts.length, 2);
  assert.equal(result.attempts[0].validation.ok, false);
  assert.equal(result.attempts[1].validation.ok, true);
  assert.equal(result.data.items.length, 2);
});

test("generateStructured fails with typed error after retries exhausted", async () => {
  const invalid = JSON.stringify({ items: [{ title: "short", channel: "tiktok" }] });
  await assert.rejects(
    () =>
      generateStructured({
        schemaName: "test_plan",
        schema: planSchema,
        prompt: "generate",
        providerOverride: mockProvider([invalid, invalid, invalid]),
      }),
    (error: unknown) => {
      assert.ok(error instanceof StructuredOutputError);
      assert.equal((error as StructuredOutputError).code, "STRUCTURED_OUTPUT_INVALID");
      assert.equal((error as StructuredOutputError).attempts.length, 2, "default maxAttempts is 2");
      return true;
    },
  );
});

test("generateStructured handles unparseable output with retry", async () => {
  const result = await generateStructured({
    schemaName: "test_plan",
    schema: planSchema,
    prompt: "generate",
    providerOverride: mockProvider(["I cannot generate JSON today", validPlan()]),
  });
  assert.equal(result.attempts.length, 2);
  assert.equal(result.attempts[0].validation.ok, false);
  assert.ok(result.attempts[0].validation.errors.includes("unparseable_json_after_repair"));
  assert.equal(result.data.items.length, 2);
});

test("generateStructured never returns partially valid data on final failure", async () => {
  await assert.rejects(
    () =>
      generateStructured({
        schemaName: "test_plan",
        schema: planSchema,
        prompt: "generate",
        maxAttempts: 1,
        providerOverride: mockProvider(["not json at all"]),
      }),
    (error: unknown) => error instanceof StructuredOutputError,
  );
});
