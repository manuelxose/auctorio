type JsonRecord = Record<string, unknown>;

export type HttpRequestOptions = {
  method?: string;
  headers?: Record<string, string>;
  body?: BodyInit | JsonRecord | null;
  timeoutMs?: number;
  retries?: number;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeBody(body: HttpRequestOptions["body"]): BodyInit | undefined {
  if (body == null) {
    return undefined;
  }

  if (
    typeof body === "string" ||
    body instanceof URLSearchParams ||
    body instanceof FormData ||
    body instanceof Blob ||
    body instanceof ArrayBuffer
  ) {
    return body;
  }

  if (Buffer.isBuffer(body)) {
    return body as unknown as BodyInit;
  }

  return JSON.stringify(body);
}

export async function fetchWithTimeout(
  url: string,
  options: HttpRequestOptions = {},
): Promise<Response> {
  const timeoutMs = options.timeoutMs ?? 30_000;
  const retries = options.retries ?? 0;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: options.method ?? "GET",
      headers: options.headers,
      body: normalizeBody(options.body),
      signal: controller.signal,
    });

    if (!response.ok && retries > 0 && response.status >= 500) {
      await sleep(250);
      return fetchWithTimeout(url, { ...options, retries: retries - 1 });
    }

    return response;
  } catch (error) {
    if (retries > 0) {
      await sleep(250);
      return fetchWithTimeout(url, { ...options, retries: retries - 1 });
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchJson<T>(
  url: string,
  options: HttpRequestOptions = {},
): Promise<T> {
  const headers = { ...options.headers };
  if (options.body && !(options.body instanceof FormData) && !headers["content-type"]) {
    headers["content-type"] = "application/json";
  }

  const response = await fetchWithTimeout(url, {
    ...options,
    headers,
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`http_error status=${response.status} body=${text}`);
  }

  if (!text) {
    return {} as T;
  }

  return JSON.parse(text) as T;
}
