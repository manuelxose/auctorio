// Resolution of per-source policies into a single AdapterPolicies record used
// by adapters and the fetch pipeline.

import { getEnv, getNumberEnv } from "../../shared/utils/env";
import type { AdapterPolicies, DiscoveryContext, SourceRef } from "./types";
import { readConfigObject } from "./normalize";

function asPositiveNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

export function resolveAdapterPolicies(source: Pick<SourceRef, "configuration" | "rateLimitPolicy" | "robotsPolicy" | "extractionPolicy">, context: DiscoveryContext): Required<AdapterPolicies> {
  const extraction = readConfigObject(source.extractionPolicy ?? undefined);
  const robots = readConfigObject(source.robotsPolicy ?? undefined);
  const rateLimit = readConfigObject(source.rateLimitPolicy ?? undefined);

  const respectRobots = typeof robots.respect === "boolean"
    ? robots.respect
    : getEnv("SCRAPE_RESPECT_ROBOTS", "false").toLowerCase() === "true";

  return {
    timeoutMs: asPositiveNumber(context.policies?.timeoutMs, asPositiveNumber(extraction.timeoutMs, getNumberEnv("SCRAPE_TIMEOUT_MS", 10_000))),
    retryAttempts: Math.floor(asPositiveNumber(context.policies?.retryAttempts, asPositiveNumber(extraction.retryAttempts, getNumberEnv("SOURCE_FETCH_RETRY_ATTEMPTS", 2)))),
    backoffBaseMs: asPositiveNumber(context.policies?.backoffBaseMs, asPositiveNumber(extraction.backoffBaseMs, getNumberEnv("SOURCE_FETCH_BACKOFF_BASE_MS", 1000))),
    backoffMaxMs: asPositiveNumber(context.policies?.backoffMaxMs, asPositiveNumber(extraction.backoffMaxMs, getNumberEnv("SOURCE_FETCH_BACKOFF_MAX_MS", 30_000))),
    respectRobots,
    rateLimit: rateLimit && (typeof rateLimit.maxRequestsPerMinute === "number" || typeof rateLimit.minIntervalMs === "number")
      ? {
          maxRequestsPerMinute: asPositiveNumber(rateLimit.maxRequestsPerMinute, 60),
          minIntervalMs: asPositiveNumber(rateLimit.minIntervalMs, 0),
        }
      : null,
    userAgent: getEnv("SCRAPE_USER_AGENT", "auctorio-bot"),
    maxItems: asPositiveNumber(context.limits.maxItems, getNumberEnv("SCRAPE_MAX_ITEMS", 20)),
  };
}
