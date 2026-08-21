"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ImageDownloadError = void 0;
exports.getImageProvider = getImageProvider;
const http_1 = require("../../shared/utils/http");
const env_1 = require("../../shared/utils/env");
const PLACEHOLDER_PNG_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=";
const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
class ImageDownloadError extends Error {
    code;
    retryable;
    attempts;
    providerStage;
    constructor(params) {
        super(params.message);
        this.name = "ImageDownloadError";
        this.code = params.code;
        this.retryable = params.retryable;
        this.attempts = params.attempts ?? 1;
        this.providerStage = "asset_download";
    }
}
exports.ImageDownloadError = ImageDownloadError;
function sniffImageType(bytes) {
    if (bytes.length >= 8 &&
        bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
        return "image/png";
    }
    if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
        return "image/jpeg";
    }
    if (bytes.length >= 12 &&
        bytes.toString("ascii", 0, 4) === "RIFF" &&
        bytes.toString("ascii", 8, 12) === "WEBP") {
        return "image/webp";
    }
    if (bytes.length >= 12 &&
        bytes.toString("ascii", 4, 8) === "ftyp" &&
        ["avif", "avis"].includes(bytes.toString("ascii", 8, 12))) {
        return "image/avif";
    }
    return null;
}
function backoffDelay(attempt) {
    const base = Math.min(2 ** attempt * 250, 5000);
    const jitter = Math.floor(Math.random() * 250);
    return base + jitter;
}
async function downloadBytesRobust(url) {
    const configuredRetries = (0, env_1.getNumberEnv)("IMAGE_DOWNLOAD_RETRIES", 1);
    const attempts = Math.max(1, configuredRetries) + 1;
    const timeoutMs = (0, env_1.getNumberEnv)("IMAGE_DOWNLOAD_TIMEOUT_MS", 90_000);
    let lastError = null;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
        if (attempt > 0) {
            await new Promise((resolve) => setTimeout(resolve, backoffDelay(attempt)));
        }
        let response;
        try {
            response = await fetch(url, {
                signal: AbortSignal.timeout(timeoutMs),
                redirect: "follow",
                // @ts-expect-error undici supports autoSelectFamily (Node >= 18.18)
                autoSelectFamily: true,
            });
        }
        catch (error) {
            const cause = error?.cause;
            const causeCode = cause?.code || error?.code;
            const timedOut = error instanceof DOMException && error.name === "TimeoutError"
                ? true
                : causeCode === "ABORT_ERR";
            lastError = new ImageDownloadError({
                code: timedOut ? "image_download_timeout" : "image_download_network_error",
                message: `Image download attempt ${attempt + 1}/${attempts} failed: ${causeCode || error.message}. Provider: siliconflow. Stage: asset_download. Action: retry.`,
                retryable: true,
                attempts: attempt + 1,
            });
            continue;
        }
        if (!response.ok) {
            const retryable = response.status >= 500 || response.status === 429;
            lastError = new ImageDownloadError({
                code: "image_download_http_error",
                message: `Image download attempt ${attempt + 1}/${attempts} returned HTTP ${response.status}. Provider: siliconflow. Stage: asset_download. Action: ${retryable ? "retry" : "inspect provider"}.`,
                retryable,
                attempts: attempt + 1,
            });
            if (!retryable) {
                break;
            }
            continue;
        }
        const declaredType = String(response.headers.get("content-type") || "").toLowerCase();
        const buffer = Buffer.from(await response.arrayBuffer());
        if (buffer.length === 0) {
            lastError = new ImageDownloadError({
                code: "image_download_empty",
                message: `Image download returned an empty body. Provider: siliconflow. Stage: asset_download. Action: retry.`,
                retryable: true,
                attempts: attempt + 1,
            });
            continue;
        }
        if (buffer.length > MAX_IMAGE_BYTES) {
            throw new ImageDownloadError({
                code: "image_download_invalid_content",
                message: `Image download exceeded the ${MAX_IMAGE_BYTES} byte limit. Provider: siliconflow. Stage: asset_download.`,
                retryable: false,
                attempts: attempt + 1,
            });
        }
        const sniffed = sniffImageType(buffer);
        if (!sniffed) {
            throw new ImageDownloadError({
                code: "image_download_invalid_content",
                message: `Image download returned unrecognized content (signature check failed). Provider: siliconflow. Stage: asset_download.`,
                retryable: false,
                attempts: attempt + 1,
            });
        }
        if (declaredType && !declaredType.startsWith("image/")) {
            throw new ImageDownloadError({
                code: "image_download_invalid_content",
                message: `Image download returned non-image content type "${declaredType}". Provider: siliconflow. Stage: asset_download.`,
                retryable: false,
                attempts: attempt + 1,
            });
        }
        return { bytes: buffer, contentType: sniffed };
    }
    throw lastError;
}
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
                size: input.size ?? "1024x576",
                image_size: input.size ?? "1024x576",
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
        let bytes;
        let contentType;
        if (completed.bytes) {
            bytes = completed.bytes;
            const sniffed = sniffImageType(bytes);
            contentType = completed.contentType && completed.contentType.startsWith("image/")
                ? completed.contentType
                : sniffed ?? "image/png";
            if (!sniffed) {
                throw new ImageDownloadError({
                    code: "image_download_invalid_content",
                    message: "Image provider returned bytes that fail the image signature check. Provider: siliconflow. Stage: generation.",
                    retryable: false,
                });
            }
        }
        else if (completed.remoteUrl) {
            const downloaded = await downloadBytesRobust(completed.remoteUrl);
            bytes = downloaded.bytes;
            contentType = downloaded.contentType;
        }
        else {
            throw new Error("image_provider_empty_output");
        }
        return {
            bytes,
            provider: completed.provider,
            model: completed.model,
            contentType,
        };
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
        if ((0, env_1.isProductionEnv)()) {
            throw new Error("IMAGE_PROVIDER=mock is not allowed in production. Set IMAGE_PROVIDER, IMAGE_API_BASE_URL, IMAGE_API_KEY and IMAGE_MODEL.");
        }
        return new MockImageProvider();
    }
    const baseUrl = (0, env_1.getEnv)("IMAGE_API_BASE_URL", "");
    const apiKey = (0, env_1.getEnv)("IMAGE_API_KEY", "");
    const model = (0, env_1.getEnv)("IMAGE_MODEL", "");
    if (!baseUrl || !apiKey || !model) {
        throw new Error("IMAGE_API_BASE_URL, IMAGE_API_KEY and IMAGE_MODEL are required for image provider");
    }
    return new OpenAICompatibleImageProvider(provider, baseUrl, apiKey, model);
}
