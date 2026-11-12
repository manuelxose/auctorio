import Anthropic from "@anthropic-ai/sdk";
import { getNumberEnv } from "../../shared/utils/env";
import type { TextGenerationInput, TextGenerationResult, TextProvider } from "./text";

/** Models that accept server-side refusal fallbacks with automatic routing. */
const FALLBACK_MODELS = new Set(["claude-opus-5-5", "claude-sonnet-5-5"]);

/**
 * Claude through the official Anthropic SDK. Notes for current models:
 * - temperature is not sent (rejected by Claude 5.x);
 * - thinking is adaptive and counts against max_tokens, so short requests get headroom;
 * - JSON shape comes from the prompt and is validated by generateStructured, because the
 *   planner's schemas use array-length constraints that output_config.format does not accept.
 */
export class AnthropicTextProvider implements TextProvider {
  private readonly client: Anthropic;

  constructor(
    apiKey: string,
    private readonly model: string,
  ) {
    this.client = new Anthropic({ apiKey, timeout: getNumberEnv("TEXT_TIMEOUT_MS", 120_000), maxRetries: 2 });
  }

  async generate(input: TextGenerationInput): Promise<TextGenerationResult> {
    const model = this.model;
    const response = await this.client.beta.messages.create({
      model,
      max_tokens: Math.max(input.maxTokens ?? 0, 16_000),
      ...(input.systemPrompt ? { system: input.systemPrompt } : {}),
      messages: [{ role: "user", content: input.prompt }],
      ...(FALLBACK_MODELS.has(model) ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
    });
    if (response.stop_reason === "refusal") {
      throw new Error("text_provider_refused");
    }
    const output = response.content
      .map((block) => (block.type === "text" ? block.text : ""))
      .join("")
      .trim();
    if (!output) {
      throw new Error("text_provider_empty_output");
    }
    return {
      output,
      provider: "anthropic",
      model: response.model,
      usage: {
        promptTokens: response.usage.input_tokens,
        completionTokens: response.usage.output_tokens,
        totalTokens: response.usage.input_tokens + response.usage.output_tokens,
      },
      finishReason: response.stop_reason,
    };
  }
}
