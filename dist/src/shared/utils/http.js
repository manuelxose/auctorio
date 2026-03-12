"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchWithTimeout = fetchWithTimeout;
exports.fetchJson = fetchJson;
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
function normalizeBody(body) {
    if (body == null) {
        return undefined;
    }
    if (typeof body === "string" ||
        body instanceof URLSearchParams ||
        body instanceof FormData ||
        body instanceof Blob ||
        body instanceof ArrayBuffer) {
        return body;
    }
    if (Buffer.isBuffer(body)) {
        return body;
    }
    return JSON.stringify(body);
}
async function fetchWithTimeout(url, options = {}) {
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
    }
    catch (error) {
        if (retries > 0) {
            await sleep(250);
            return fetchWithTimeout(url, { ...options, retries: retries - 1 });
        }
        throw error;
    }
    finally {
        clearTimeout(timer);
    }
}
async function fetchJson(url, options = {}) {
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
        return {};
    }
    return JSON.parse(text);
}
