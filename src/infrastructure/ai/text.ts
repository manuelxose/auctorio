import { getEnv, getNumberEnv, isProductionEnv } from "../../shared/utils/env";
import { fetchJson } from "../../shared/utils/http";

export type TextGenerationInput = {
  prompt: string;
  systemPrompt?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  /** OpenAI-compatible response_format passthrough (e.g. { type: "json_object" }). */
  responseFormat?: { type: "json_object" };
};

export type TextUsage = {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
};

export type TextGenerationResult = {
  output: string;
  provider: string;
  model: string;
  usage?: TextUsage;
  finishReason?: string | null;
};

export type TextProvider = {
  generate(input: TextGenerationInput): Promise<TextGenerationResult>;
};

class OpenAICompatibleTextProvider implements TextProvider {
  private baseUrl: string;
  private apiKey: string;
  private defaultModel: string;
  private providerName: string;

  constructor(providerName: string, baseUrl: string, apiKey: string, model: string) {
    this.providerName = providerName;
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.apiKey = apiKey;
    this.defaultModel = model;
  }

  async generate(input: TextGenerationInput): Promise<TextGenerationResult> {
    const model = input.model || this.defaultModel;
    if (!model) {
      throw new Error("TEXT_MODEL is required");
    }

    const data = await fetchJson<{
      choices?: Array<{ message?: { content?: string }; finish_reason?: string | null }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
    }>(`${this.baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.apiKey}`,
      },
      body: {
        model,
        messages: [
          ...(input.systemPrompt ? [{ role: "system", content: input.systemPrompt }] : []),
          { role: "user", content: input.prompt },
        ],
        temperature: input.temperature ?? getNumberEnv("TEXT_TEMPERATURE", 0.7),
        max_tokens: input.maxTokens ?? getNumberEnv("TEXT_MAX_TOKENS", 800),
        ...(input.responseFormat ? { response_format: input.responseFormat } : {}),
      },
      timeoutMs: getNumberEnv("TEXT_TIMEOUT_MS", 60_000),
      retries: getNumberEnv("TEXT_RETRIES", 1),
    });

    const output = data.choices?.[0]?.message?.content?.trim() ?? "";
    if (!output) {
      throw new Error("text_provider_empty_output");
    }

    return {
      output,
      provider: this.providerName,
      model,
      usage: {
        promptTokens: data.usage?.prompt_tokens,
        completionTokens: data.usage?.completion_tokens,
        totalTokens: data.usage?.total_tokens,
      },
      finishReason: data.choices?.[0]?.finish_reason ?? null,
    };
  }
}

class MockTextProvider implements TextProvider {
  async generate(input: TextGenerationInput): Promise<TextGenerationResult> {
    const snippet = input.prompt.split("\n").slice(0, 6).join(" ");
    return {
      output: `MOCK_RESPONSE: ${snippet}`,
      provider: "mock",
      model: "mock",
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    };
  }
}

export function getTextProvider(): TextProvider {
  const provider = getEnv("TEXT_PROVIDER", "mock").toLowerCase();
  if (provider === "mock") {
    if (isProductionEnv()) {
      throw new Error(
        "TEXT_PROVIDER=mock is not allowed in production. Set TEXT_PROVIDER, TEXT_API_BASE_URL, TEXT_API_KEY and TEXT_MODEL.",
      );
    }
    return new MockTextProvider();
  }

  const baseUrl = getEnv("TEXT_API_BASE_URL", "");
  const apiKey = getEnv("TEXT_API_KEY", "");
  const model = getEnv("TEXT_MODEL", "");

  if (!baseUrl || !apiKey || !model) {
    throw new Error(
      "TEXT_API_BASE_URL, TEXT_API_KEY and TEXT_MODEL are required for text provider",
    );
  }

  return new OpenAICompatibleTextProvider(provider, baseUrl, apiKey, model);
}
