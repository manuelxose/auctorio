"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getImageProvider = getImageProvider;
const http_1 = require("../../shared/utils/http");
const env_1 = require("../../shared/utils/env");
const PLACEHOLDER_PNG_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=";
class OpenAICompatibleImageProvider {
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
    async submit(input) {
        const model = input.model || this.defaultModel;
        if (!model) {
            throw new Error("IMAGE_MODEL is required");
        }
        const data = await (0, http_1.fetchJson)(`${this.baseUrl}/v1/images/generations`, {
            method: "POST",
            headers: {
                "content-type": "application/json",
                authorization: `Bearer ${this.apiKey}`,
            },
            body: {
                model,
                prompt: input.prompt,
                size: input.size ?? "1024x1024",
                image_size: input.size ?? "1024x1024",
                n: 1,
                response_format: "b64_json",
                seed: input.seed,
            },
            timeoutMs: (0, env_1.getNumberEnv)("IMAGE_TIMEOUT_MS", 90_000),
            retries: (0, env_1.getNumberEnv)("IMAGE_RETRIES", 1),
        });
        const imageData = data.data?.[0] ?? data.images?.[0];
        const remoteUrl = imageData?.url ?? data.output?.[0];
        const b64 = imageData?.b64_json;
        if (!remoteUrl && !b64) {
            throw new Error("image_provider_empty_output");
        }
        return {
            provider: this.providerName,
            model,
            id: data.request_id ||
                data.job_id ||
                data.id ||
                `${this.providerName}:${Date.now().toString(36)}`,
            status: "completed",
            bytes: b64 ? Buffer.from(b64, "base64") : undefined,
            remoteUrl,
            contentType: "image/png",
            raw: data,
        };
    }
    async poll(handle) {
        return handle;
    }
    async generate(input) {
        const submission = await this.submit(input);
        const completed = await this.poll(submission);
        const bytes = completed.bytes ?? (completed.remoteUrl ? await this.downloadBytes(completed.remoteUrl) : null);
        if (!bytes) {
            throw new Error("image_provider_empty_output");
        }
        return {
            bytes,
            provider: completed.provider,
            model: completed.model,
            contentType: completed.contentType ?? "image/png",
        };
    }
    async downloadBytes(url) {
        const response = await (0, http_1.fetchWithTimeout)(url, {
            timeoutMs: (0, env_1.getNumberEnv)("IMAGE_DOWNLOAD_TIMEOUT_MS", 90_000),
            retries: (0, env_1.getNumberEnv)("IMAGE_DOWNLOAD_RETRIES", 1),
        });
        if (!response.ok) {
            const body = await response.text();
            throw new Error(`image_download_error status=${response.status} body=${body}`);
        }
        const arrayBuffer = await response.arrayBuffer();
        return Buffer.from(arrayBuffer);
    }
}
class MockImageProvider {
    async submit() {
        return {
            id: "mock-image",
            provider: "mock",
            model: "mock",
            status: "completed",
            bytes: Buffer.from(PLACEHOLDER_PNG_BASE64, "base64"),
            contentType: "image/png",
        };
    }
    async poll(handle) {
        return handle;
    }
    async generate() {
        return {
            bytes: Buffer.from(PLACEHOLDER_PNG_BASE64, "base64"),
            provider: "mock",
            model: "mock",
            contentType: "image/png",
        };
    }
}
function getImageProvider() {
    const provider = (0, env_1.getEnv)("IMAGE_PROVIDER", "mock").toLowerCase();
    if (provider === "mock") {
        return new MockImageProvider();
    }
    const baseUrl = (0, env_1.getEnv)("IMAGE_API_BASE_URL", "");
    const apiKey = (0, env_1.getEnv)("IMAGE_API_KEY", "");
    const model = (0, env_1.getEnv)("IMAGE_MODEL", "");
    if (!baseUrl || !apiKey) {
        throw new Error("IMAGE_API_BASE_URL and IMAGE_API_KEY are required for image provider");
    }
    return new OpenAICompatibleImageProvider(provider, baseUrl, apiKey, model);
}
