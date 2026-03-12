"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTextProvider = getTextProvider;
const env_1 = require("../../shared/utils/env");
const http_1 = require("../../shared/utils/http");
class OpenAICompatibleTextProvider {
    baseUrl;
    apiKey;
    defaultModel;
    providerName;
    constructor(providerName, baseUrl, apiKey, model) {
        this.providerName = providerName;
        this.baseUrl = baseUrl.replace(/\/$/, "");
        this.apiKey = apiKey;
        this.defaultModel = model;
    }
    async generate(input) {
        const model = input.model || this.defaultModel;
        if (!model) {
            throw new Error("TEXT_MODEL is required");
        }
        const data = await (0, http_1.fetchJson)(`${this.baseUrl}/v1/chat/completions`, {
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
                temperature: input.temperature ?? (0, env_1.getNumberEnv)("TEXT_TEMPERATURE", 0.7),
                max_tokens: input.maxTokens ?? (0, env_1.getNumberEnv)("TEXT_MAX_TOKENS", 800),
            },
            timeoutMs: (0, env_1.getNumberEnv)("TEXT_TIMEOUT_MS", 60_000),
            retries: (0, env_1.getNumberEnv)("TEXT_RETRIES", 1),
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
        };
    }
}
class MockTextProvider {
    async generate(input) {
        const snippet = input.prompt.split("\n").slice(0, 6).join(" ");
        return {
            output: `MOCK_RESPONSE: ${snippet}`,
            provider: "mock",
            model: "mock",
            usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        };
    }
}
function getTextProvider() {
    const provider = (0, env_1.getEnv)("TEXT_PROVIDER", "mock").toLowerCase();
    if (provider === "mock") {
        return new MockTextProvider();
    }
    const baseUrl = (0, env_1.getEnv)("TEXT_API_BASE_URL", "");
    const apiKey = (0, env_1.getEnv)("TEXT_API_KEY", "");
    const model = (0, env_1.getEnv)("TEXT_MODEL", "");
    if (!baseUrl || !apiKey) {
        throw new Error("TEXT_API_BASE_URL and TEXT_API_KEY are required for text provider");
    }
    return new OpenAICompatibleTextProvider(provider, baseUrl, apiKey, model);
}
