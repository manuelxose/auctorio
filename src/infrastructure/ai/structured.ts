import { getTextProvider, type TextGenerationResult, type TextProvider, type TextUsage } from "./text";
import type { SchemaDef, SchemaValidationResult } from "../../shared/schema";
import { validateValue } from "../../shared/schema";
import { structuredEvent } from "../../shared/utils/logger";
import { getBooleanEnv, getNumberEnv } from "../../shared/utils/env";

export type StructuredGenerationOptions<T> = {
  schemaName: string;
  schema: SchemaDef<T>;
  prompt: string;
  systemPrompt?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  maxAttempts?: number;
  /** Extra observability context (never secrets). */
  eventContext?: Record<string, unknown>;
  /** Test seam: inject a provider instead of the env-configured one. */
  providerOverride?: TextProvider;
};

export type StructuredGenerationAttempt = {
  attempt: number;
  provider: string;
  model: string;
  finishReason: string | null;
  repairAttempted: boolean;
  validation: { ok: boolean; errors: string[] };
  usage?: TextUsage;
};

export type StructuredGenerationResult<T> = {
  data: T;
  attempts: StructuredGenerationAttempt[];
};

export class StructuredOutputError extends Error {
  readonly code = "STRUCTURED_OUTPUT_INVALID";
  readonly attempts: StructuredGenerationAttempt[];

  constructor(message: string, attempts: StructuredGenerationAttempt[]) {
    super(message);
    this.name = "StructuredOutputError";
    this.attempts = attempts;
  }
}

function stripFences(value: string): string {
  return value.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
}

/** Extract the first JSON object/array from a possibly-prose output. */
export function extractJsonCandidate(value: string): string | null {
  const cleaned = stripFences(value);
  if (!cleaned) {
    return null;
  }
  const starts = [cleaned.indexOf("{"), cleaned.indexOf("[")].filter((index) => index >= 0);
  if (starts.length === 0) {
    return null;
  }
  const start = Math.min(...starts);
  const open = cleaned[start];
  const close = open === "{" ? "}" : "]";
  const end = cleaned.lastIndexOf(close);
  if (end <= start) {
    return null;
  }
  return cleaned.slice(start, end + 1);
}

function balanceJson(value: string): string {
  let result = value;
  const counts: Record<string, number> = { "{": 0, "[": 0, "}": 0, "]": 0 };
  for (const char of result) {
    if (char in counts) {
      counts[char] += 1;
    }
  }
  const missingSquare = counts["["] - counts["]"];
  const missingCurly = counts["{"] - counts["}"];
  // Inner-most containers are closed first.
  for (let i = 0; i < missingSquare; i += 1) {
    result += "]";
  }
  for (let i = 0; i < missingCurly; i += 1) {
    result += "}";
  }
  return result;
}

function repairJson(value: string): string {
  // Strip trailing commas before closing braces/brackets.
  let result = value.replace(/,\s*([}\]])/g, "$1");
  // Strip a dangling comma at the truncation point.
  result = result.replace(/,\s*$/, "");
  // Balance unterminated containers (truncated responses).
  result = balanceJson(result);
  return result;
}

/** Controlled parse: strict → extraction → repair. Never throws. */
export function parseJsonWithRepair(value: string): { json: unknown; repairAttempted: boolean } | null {
  const cleaned = stripFences(value);
  try {
    return { json: JSON.parse(cleaned), repairAttempted: false };
  } catch {
    // fall through to extraction
  }
  const candidate = extractJsonCandidate(cleaned);
  if (!candidate) {
    return null;
  }
  try {
    return { json: JSON.parse(candidate), repairAttempted: false };
  } catch {
    // fall through to repair
  }
  try {
    return { json: JSON.parse(repairJson(candidate)), repairAttempted: true };
  } catch {
    return null;
  }
}

function useJsonResponseFormat(): boolean {
  return getBooleanEnv("STRUCTURED_JSON_RESPONSE_FORMAT", true);
}

/**
 * Reliable structured generation: provider-native JSON mode where supported,
 * safe extraction, controlled repair, strict schema validation, and a single
 * corrective retry carrying the validation errors. Fails with a typed domain
 * error if the output remains invalid.
 */
export async function generateStructured<T>(options: StructuredGenerationOptions<T>): Promise<StructuredGenerationResult<T>> {
  const provider = options.providerOverride ?? getTextProvider();
  const maxAttempts = Math.max(1, options.maxAttempts ?? getNumberEnv("STRUCTURED_MAX_ATTEMPTS", 2));
  const attempts: StructuredGenerationAttempt[] = [];
  const schemaJson = JSON.stringify(options.schema.jsonSchema());

  const systemPrompt = [
    options.systemPrompt ?? `You are a structured output engine for "${options.schemaName}".`,
    "Return ONLY a valid JSON object. No markdown fences, no prose outside the object.",
    `Schema (JSON Schema draft): ${schemaJson}`,
  ].join("\n");

  for (let attemptNumber = 1; attemptNumber <= maxAttempts; attemptNumber += 1) {
    const correction = attempts.length > 0 ? `\nYour previous response was invalid. Fix these validation errors and return valid JSON only:\n${attempts[attempts.length - 1].validation.errors.slice(0, 15).join("\n")}` : "";
    let result: TextGenerationResult;
    try {
      result = await provider.generate({
        prompt: options.prompt + correction,
        systemPrompt,
        model: options.model,
        temperature: options.temperature ?? 0,
        maxTokens: options.maxTokens,
        responseFormat: useJsonResponseFormat() ? { type: "json_object" } : undefined,
      });
    } catch (error) {
      structuredEvent(
        "ai.structured.provider_error",
        {
          schemaName: options.schemaName,
          provider: "unknown",
          attempt: attemptNumber,
          errorClass: error instanceof Error ? error.message : String(error),
          ...options.eventContext,
        },
        "error",
      );
      throw error;
    }

    const parsed = parseJsonWithRepair(result.output);
    if (!parsed) {
      const attempt: StructuredGenerationAttempt = {
        attempt: attemptNumber,
        provider: result.provider,
        model: result.model,
        finishReason: result.finishReason ?? null,
        repairAttempted: true,
        validation: { ok: false, errors: ["unparseable_json_after_repair"] },
        usage: result.usage,
      };
      attempts.push(attempt);
      structuredEvent(
        attemptNumber < maxAttempts ? "ai.structured.retry" : "ai.structured.failed",
        {
          schemaName: options.schemaName,
          provider: result.provider,
          model: result.model,
          attempt: attemptNumber,
          finishReason: result.finishReason ?? null,
          normalizedError: "unparseable_json",
          repairAttempted: true,
          retryAttempted: attemptNumber < maxAttempts,
          ...options.eventContext,
        },
        attemptNumber < maxAttempts ? "warn" : "error",
      );
      continue;
    }

    const validation = validateValue(options.schema, parsed.json);
    const attempt: StructuredGenerationAttempt = {
      attempt: attemptNumber,
      provider: result.provider,
      model: result.model,
      finishReason: result.finishReason ?? null,
      repairAttempted: parsed.repairAttempted,
      validation: { ok: validation.ok, errors: validation.ok ? [] : validation.errors },
      usage: result.usage,
    };
    attempts.push(attempt);

    if (validation.ok) {
      structuredEvent("ai.structured.completed", {
        schemaName: options.schemaName,
        provider: result.provider,
        model: result.model,
        attempt: attemptNumber,
        finishReason: result.finishReason ?? null,
        repairAttempted: parsed.repairAttempted,
        validation: "passed",
        promptTokens: result.usage?.promptTokens ?? 0,
        completionTokens: result.usage?.completionTokens ?? 0,
        ...options.eventContext,
      });
      return { data: validation.value, attempts };
    }

    structuredEvent(
      attemptNumber < maxAttempts ? "ai.structured.retry" : "ai.structured.failed",
      {
        schemaName: options.schemaName,
        provider: result.provider,
        model: result.model,
        attempt: attemptNumber,
        finishReason: result.finishReason ?? null,
        normalizedError: "schema_validation_failed",
        repairAttempted: parsed.repairAttempted,
        retryAttempted: attemptNumber < maxAttempts,
        validationErrors: validation.errors.slice(0, 20),
        ...options.eventContext,
      },
      attemptNumber < maxAttempts ? "warn" : "error",
    );
  }

  throw new StructuredOutputError(
    `structured_output_invalid: ${options.schemaName} failed validation after ${attempts.length} attempt(s)`,
    attempts,
  );
}

export type { SchemaValidationResult };
