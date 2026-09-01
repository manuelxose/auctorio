// Resilient HTTP client for source adapters: SSRF validation, connect/headers/
// body timeouts, bounded redirects, conditional requests (ETag/Last-Modified,
// 304 handling), retry with backoff + jitter, per-domain concurrency and
// robots.txt politeness. Compression (gzip/deflate/br) is handled
// transparently by undici.

import { Agent } from "undici";
import { getEnv, getNumberEnv } from "../../shared/utils/env";
import { retryWithBackoff } from "../resilience/retry";
import { DomainThrottle } from "../resilience/limiter";
import { validateScrapeUrl } from "../../infrastructure/scraping";

export class SourceHttpError extends Error {
  constructor(
    message: string,
    readonly status: number | null = null,
    readonly retryable = false,
    readonly retryAfterSeconds: number | null = null,
  ) {
    super(message);
    this.name = "SourceHttpError";
  }
}

/** Thrown when a conditional request returned HTTP 304 (content unchanged). */
export class SourceNotModifiedError extends Error {
  constructor(
    message = "source_not_modified",
    readonly etag: string | null = null,
  ) {
    super(message);
    this.name = "SourceNotModifiedError";
  }
}

export type ConditionalRequest = {
  etag?: string | null;
  lastModified?: string | null;
};

export type SourceHttpOptions = {
  accept: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
  connectTimeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  retryAttempts?: number;
  backoffBaseMs?: number;
  backoffMaxMs?: number;
  /** When present, If-None-Match / If-Modified-Since are sent and a 304
   *  response yields SourceNotModifiedError instead of a body. */
  conditional?: ConditionalRequest | null;
  signal?: AbortSignal;
};

export type RateLimitSnapshot = {
  remaining: number | null;
  resetSeconds: number | null;
  retryAfterSeconds: number | null;
};

export type SourceHttpResponse = {
  body: string;
  contentType: string;
  status: number;
  finalUrl: string;
  etag: string | null;
  lastModified: string | null;
  rateLimit: RateLimitSnapshot | null;
};

const DEFAULT_MAX_REDIRECTS = 5;

const domainThrottle = new DomainThrottle({
  maxConcurrentPerDomain: Math.max(1, getNumberEnv("DISCOVERY_MAX_CONCURRENT_PER_DOMAIN", 2)),
  minIntervalMs: Math.max(0, getNumberEnv("DISCOVERY_MIN_INTERVAL_PER_DOMAIN_MS", 500)),
});

type RobotsRules = { disallow: string[] };
const robotsCache = new Map<string, { fetchedAt: number; rules: RobotsRules }>();

export function getDomainThrottle(): DomainThrottle {
  return domainThrottle;
}

/** Build an undici Agent with separate connect/headers/body timeouts. */
function buildAgent(connectTimeoutMs: number, headersTimeoutMs: number, bodyTimeoutMs: number): Agent {
  return new Agent({
    connect: { timeout: connectTimeoutMs },
    headersTimeout: headersTimeoutMs,
    bodyTimeout: bodyTimeoutMs,
  });
}

function parseRetryAfter(headerValue: string | null): number | null {
  if (!headerValue) {
    return null;
  }
  const trimmed = headerValue.trim();
  if (/^\d+$/.test(trimmed)) {
    const seconds = Number.parseInt(trimmed, 10);
    return Number.isFinite(seconds) && seconds >= 0 ? seconds : null;
  }
  const date = Date.parse(trimmed);
  if (!Number.isNaN(date)) {
    return Math.max(0, Math.round((date - Date.now()) / 1000));
  }
  return null;
}

function readRateLimit(headers: Headers): RateLimitSnapshot | null {
  const remainingRaw = headers.get("x-ratelimit-remaining") ?? headers.get("ratelimit-remaining");
  const resetRaw = headers.get("x-ratelimit-reset") ?? headers.get("ratelimit-reset");
  const retryAfterRaw = headers.get("retry-after");
  const remaining = remainingRaw ? Number.parseInt(remainingRaw, 10) : null;
  const resetSeconds = resetRaw ? Number.parseInt(resetRaw, 10) : null;
  const retryAfterSeconds = parseRetryAfter(retryAfterRaw);
  if (remaining === null && resetSeconds === null && retryAfterSeconds === null) {
    return null;
  }
  return {
    remaining: remaining !== null && Number.isFinite(remaining) ? remaining : null,
    resetSeconds: resetSeconds !== null && Number.isFinite(resetSeconds) ? resetSeconds : null,
    retryAfterSeconds,
  };
}

/** One hop of the fetch chain with conditional headers. Redirect responses
 *  surface as { redirectUrl } so the caller can bound and validate hops. */
async function rawHop(
  url: URL,
  options: SourceHttpOptions,
  timeoutMs: number,
): Promise<{ response: Response; body: string } | { redirectUrl: URL }> {
  const connectTimeoutMs = options.connectTimeoutMs ?? getNumberEnv("SOURCE_CONNECT_TIMEOUT_MS", 5_000);
  const agent = buildAgent(connectTimeoutMs, timeoutMs, timeoutMs);
  const headers: Record<string, string> = {
    accept: options.accept,
    "user-agent": getEnv("SCRAPE_USER_AGENT", "auctorio-bot"),
    ...(options.headers ?? {}),
  };
  if (options.conditional?.etag) {
    headers["if-none-match"] = options.conditional.etag;
  }
  if (options.conditional?.lastModified) {
    headers["if-modified-since"] = options.conditional.lastModified;
  }

  const controller = new AbortController();
  const onParentAbort = () => controller.abort();
  const parentSignal = options.signal;
  parentSignal?.addEventListener("abort", onParentAbort, { once: true });
  const deadline = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await globalThis.fetch(url.toString(), {
      method: "GET",
      headers,
      redirect: "manual",
      signal: controller.signal,
      dispatcher: agent,
    } as RequestInit);

    const status = response.status;
    if (status >= 300 && status < 400 && status !== 304) {
      const location = response.headers.get("location");
      // Drain the (small) redirect body so the connection is reusable.
      await response.arrayBuffer().catch(() => undefined);
      if (!location) {
        throw new SourceHttpError(`redirect_without_location status=${status}`, status, false);
      }
      const next = new URL(location, url.toString());
      return { redirectUrl: next };
    }

    const body = status === 304 ? "" : await readBody(response, options.maxBytes ?? getNumberEnv("SOURCE_FETCH_MAX_BYTES", 10 * 1024 * 1024));
    // 304 Not Modified is a successful conditional outcome, not a failure.
    if (status !== 304 && !response.ok) {
      const retryAfterSeconds = readRateLimit(response.headers)?.retryAfterSeconds ?? null;
      throw new SourceHttpError(
        `fetch_failed status=${status}`,
        status,
        status === 429 || status >= 500,
        retryAfterSeconds,
      );
    }
    return { response, body };
  } catch (error) {
    if (error instanceof SourceHttpError) {
      throw error;
    }
    if (controller.signal.aborted && !parentSignal?.aborted) {
      throw new SourceHttpError(`fetch_timeout after ${timeoutMs}ms`, null, true);
    }
    if (parentSignal?.aborted) {
      throw new SourceHttpError("fetch_aborted", null, false);
    }
    throw error;
  } finally {
    clearTimeout(deadline);
    parentSignal?.removeEventListener("abort", onParentAbort);
    await agent.close().catch(() => undefined);
  }
}

async function readBody(response: Response, maxBytes: number): Promise<string> {
  const text = await response.text();
  if (text.length > maxBytes) {
    throw new SourceHttpError(`fetch_body_too_large bytes=${text.length}`, response.status, false);
  }
  return text;
}

function rawFetch(url: URL, options: SourceHttpOptions, signal: AbortSignal): Promise<SourceHttpResponse> {
  const timeoutMs = options.timeoutMs ?? getNumberEnv("SCRAPE_TIMEOUT_MS", 10_000);
  const maxRedirects = Math.max(0, options.maxRedirects ?? getNumberEnv("SOURCE_FETCH_MAX_REDIRECTS", DEFAULT_MAX_REDIRECTS));

  const step = async (current: URL, hopsLeft: number): Promise<SourceHttpResponse> => {
    const hop = await rawHop(current, options, timeoutMs);
    if ("redirectUrl" in hop) {
      if (hopsLeft <= 0) {
        throw new SourceHttpError(`too_many_redirects max=${maxRedirects}`, null, false);
      }
      // SSRF guard applies to every hop, not just the first URL.
      await validateScrapeUrl(hop.redirectUrl);
      return step(hop.redirectUrl, hopsLeft - 1);
    }
    const { response, body } = hop;
    const etag = response.headers.get("etag");
    const lastModified = response.headers.get("last-modified");
    if (response.status === 304) {
      throw new SourceNotModifiedError(`source_not_modified status=304`, etag);
    }
    return {
      body,
      contentType: response.headers.get("content-type") ?? "",
      status: response.status,
      finalUrl: response.url || current.toString(),
      etag,
      lastModified,
      rateLimit: readRateLimit(response.headers),
    };
  };

  return step(url, maxRedirects);
}

/** Fetch a source URL with SSRF validation, bounded redirects, conditional
 *  requests (304 → SourceNotModifiedError), retry/backoff + jitter and
 *  per-domain politeness. */
export async function fetchSourceHttp(url: URL, options: SourceHttpOptions): Promise<SourceHttpResponse> {
  await validateScrapeUrl(url);
  const retryAttempts = options.retryAttempts ?? Math.max(1, getNumberEnv("SOURCE_FETCH_RETRY_ATTEMPTS", 2));
  const signal = options.signal ?? new AbortController().signal;
  const waitDeadlineMs = Math.max(1000, (options.timeoutMs ?? getNumberEnv("SCRAPE_TIMEOUT_MS", 10_000)) / 2);

  return domainThrottle.run(url.hostname, () =>
    retryWithBackoff(
      () => rawFetch(url, options, signal),
      {
        attempts: retryAttempts,
        baseDelayMs: options.backoffBaseMs ?? getNumberEnv("SOURCE_FETCH_BACKOFF_BASE_MS", 1000),
        maxDelayMs: options.backoffMaxMs ?? getNumberEnv("SOURCE_FETCH_BACKOFF_MAX_MS", 30_000),
        shouldRetry: (error) => (error instanceof SourceHttpError ? error.retryable : false),
        signal,
      },
    ),
    waitDeadlineMs,
  );
}

// ── robots.txt

const ROBOTS_USER_AGENT = getEnv("SCRAPE_USER_AGENT", "auctorio-bot").split("/")[0].toLowerCase();

function isPathAllowed(rules: RobotsRules, pathname: string): boolean {
  for (const rule of rules.disallow) {
    if (!rule) {
      continue;
    }
    if (rule === "/") {
      return false;
    }
    if (rule.startsWith("/") && (pathname === rule || pathname.startsWith(rule))) {
      return false;
    }
  }
  return true;
}

/** Parse a robots.txt body into disallow rules. Pure — deterministic tests. */
export function parseRobotsTxt(body: string): RobotsRules {
  const disallow: string[] = [];
  let currentAgent: string | null = null;
  for (const rawLine of body.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    const match = /^user-agent\s*:\s*(.+)$/i.exec(line);
    if (match) {
      currentAgent = match[1].trim().toLowerCase();
      continue;
    }
    const rule = /^disallow\s*:\s*(.+)$/i.exec(line);
    if (rule && (currentAgent === "*" || currentAgent === ROBOTS_USER_AGENT)) {
      disallow.push(rule[1].trim());
    }
  }
  return { disallow };
}

export function isPathAllowedByRules(rules: RobotsRules, pathname: string): boolean {
  return isPathAllowed(rules, pathname);
}

export async function fetchRobotsRules(hostname: string): Promise<RobotsRules> {
  const cached = robotsCache.get(hostname);
  if (cached && Date.now() - cached.fetchedAt < 60 * 60_000) {
    return cached.rules;
  }
  const rules: RobotsRules = { disallow: [] };
  try {
    const robotsUrl = new URL(`https://${hostname}/robots.txt`);
    // Same SSRF guard as content fetches — never bypass for robots.txt.
    await validateScrapeUrl(robotsUrl);
    const response = await fetch(robotsUrl.toString(), {
      headers: { "user-agent": getEnv("SCRAPE_USER_AGENT", "auctorio-bot") },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) {
      // 404/403 robots.txt means "no restrictions" per convention.
      robotsCache.set(hostname, { fetchedAt: Date.now(), rules });
      return rules;
    }
    const body = await response.text();
    const parsed = parseRobotsTxt(body);
    robotsCache.set(hostname, { fetchedAt: Date.now(), rules: parsed });
    return parsed;
  } catch {
    // Network failure or blocked host: fail open (allow), keep a short
    // negative cache.
  }
  robotsCache.set(hostname, { fetchedAt: Date.now(), rules });
  if (robotsCache.size > 500) {
    const oldest = robotsCache.keys().next().value;
    if (oldest) {
      robotsCache.delete(oldest);
    }
  }
  return rules;
}

export async function robotsAllows(url: URL): Promise<boolean> {
  const rules = await fetchRobotsRules(url.hostname);
  return isPathAllowed(rules, url.pathname);
}
