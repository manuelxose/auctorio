// Shared observation glue between the HTTP client and adapters. Adapters keep
// statelessness: they record what they saw on `context.observed` and the
// business layer persists it (conditional-request state on the source row).

import type { ConditionalRequest, SourceHttpResponse } from "./http";
import type { DiscoveryContext, SourceRef } from "./types";

/** Conditional-request state derived from a persisted source row. */
export function conditionalFromSource(source: Pick<SourceRef, "lastEtag" | "lastModifiedHeader">): ConditionalRequest | null {
  if (!source.lastEtag && !source.lastModifiedHeader) {
    return null;
  }
  return { etag: source.lastEtag, lastModified: source.lastModifiedHeader };
}

/** Record a successful 200 response's headers for persistence. */
export function observeResponse(context: DiscoveryContext, response: SourceHttpResponse): void {
  context.observed = {
    etag: response.etag,
    lastModified: response.lastModified,
    status: response.status,
    notModified: false,
    finalUrl: response.finalUrl,
  };
}

/** Record a 304 not-modified outcome. */
export function observeNotModified(context: DiscoveryContext, etag: string | null): void {
  context.observed = {
    etag,
    status: 304,
    notModified: true,
  };
}

/** Record a rate-limit outcome (429 with retry-after when available). */
export function observeRateLimited(context: DiscoveryContext, status: number | null, retryAfterSeconds: number | null): void {
  context.observed = {
    status,
    notModified: false,
    rateLimited: true,
    retryAfterSeconds,
  };
}
