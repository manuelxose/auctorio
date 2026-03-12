import { fetchWithTimeout, fetchJson } from "../../shared/utils/http";
import { getEnv, getNumberEnv } from "../../shared/utils/env";

export type ImageGenerationInput = {
  prompt: string;
  model?: string;
  size?: string;
  seed?: number;
};

export type ImageGenerationHandle = {
  id: string;
  provider: string;
  model: string;
  status: "processing" | "completed";
  bytes?: Buffer;
  remoteUrl?: string;
  contentType?: string;
  raw?: unknown;
};

export type ImageGenerationResult = {
  bytes: Buffer;
  provider: string;
  model: string;
  contentType: string;
};

export type ImageProvider = {
  submit(input: ImageGenerationInput): Promise<ImageGenerationHandle>;
  poll(handle: ImageGenerationHandle): Promise<ImageGenerationHandle>;
  cancel?(handle: ImageGenerationHandle): Promise<void>;
  generate(input: ImageGenerationInput): Promise<ImageGenerationResult>;
};

const PLACEHOLDER_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=";

class OpenAICompatibleImageProvider implements ImageProvider {
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

  async submit(input: ImageGenerationInput): Promise<ImageGenerationHandle> {
    const model = input.model || this.defaultModel;
    if (!model) {
      throw new Error("IMAGE_MODEL is required");
    }

    const data = await fetchJson<{
      data?: Array<{ b64_json?: string; url?: string }>;
      images?: Array<{ b64_json?: string; url?: string }>;
      request_id?: string;
      id?: string;
      job_id?: string;
      status?: string;
      output?: Array<string>;
    }>(`${this.baseUrl}/v1/images/generations`, {
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
      timeoutMs: getNumberEnv("IMAGE_TIMEOUT_MS", 90_000),
      retries: getNumberEnv("IMAGE_RETRIES", 1),
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
      id:
        data.request_id ||
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

  async poll(handle: ImageGenerationHandle): Promise<ImageGenerationHandle> {
    return handle;
  }

  async generate(input: ImageGenerationInput): Promise<ImageGenerationResult> {
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

  private async downloadBytes(url: string): Promise<Buffer> {
    const response = await fetchWithTimeout(url, {
      timeoutMs: getNumberEnv("IMAGE_DOWNLOAD_TIMEOUT_MS", 90_000),
      retries: getNumberEnv("IMAGE_DOWNLOAD_RETRIES", 1),
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`image_download_error status=${response.status} body=${body}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }
}

class MockImageProvider implements ImageProvider {
  async submit(): Promise<ImageGenerationHandle> {
    return {
      id: "mock-image",
      provider: "mock",
      model: "mock",
      status: "completed",
      bytes: Buffer.from(PLACEHOLDER_PNG_BASE64, "base64"),
      contentType: "image/png",
    };
  }

  async poll(handle: ImageGenerationHandle): Promise<ImageGenerationHandle> {
    return handle;
  }

  async generate(): Promise<ImageGenerationResult> {
    return {
      bytes: Buffer.from(PLACEHOLDER_PNG_BASE64, "base64"),
      provider: "mock",
      model: "mock",
      contentType: "image/png",
    };
  }
}

export function getImageProvider(): ImageProvider {
  const provider = getEnv("IMAGE_PROVIDER", "mock").toLowerCase();
  if (provider === "mock") {
    return new MockImageProvider();
  }

  const baseUrl = getEnv("IMAGE_API_BASE_URL", "");
  const apiKey = getEnv("IMAGE_API_KEY", "");
  const model = getEnv("IMAGE_MODEL", "");

  if (!baseUrl || !apiKey) {
    throw new Error("IMAGE_API_BASE_URL and IMAGE_API_KEY are required for image provider");
  }

  return new OpenAICompatibleImageProvider(provider, baseUrl, apiKey, model);
}
