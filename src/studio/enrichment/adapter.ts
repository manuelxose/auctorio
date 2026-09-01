// Enrichment provider adapters (TMDB, OMDb, IMDb official API).
//
// A provider adapter turns provider-specific HTTP responses into a neutral
// `EnrichmentLookupResult`. The provider engine owns precedence, caching,
// rate limiting and persistence; adapters own only the wire format and
// attribution metadata.

import { fetchSourceHttp, SourceHttpError } from "../adapters/http";

export type EnrichmentLookupInput = {
  /** Free-form search string (usually a title). */
  query: string;
  /** Optional release year for disambiguation (remakes). */
  year?: number | null;
  /** Preferred resource type: "movie" | "tv" | "person". */
  resourceType: string;
};

export type EnrichmentPayload = {
  id: string | null;
  resourceType: string;
  title: string;
  originalTitle: string | null;
  releaseDate: string | null;
  year: number | null;
  genres: string[];
  popularity: number | null;
  rating: number | null;
  votes: number | null;
  cast: string[];
  crew: string[];
  studios: string[];
  franchise: string | null;
  overview: string | null;
  posterUrl: string | null;
  backdropUrl: string | null;
  watchProviders: string[];
  /** Extra provider-specific fields (provider data must remain attributable). */
  extra: Record<string, unknown>;
};

export type EnrichmentLookupResult = {
  providerKey: string;
  resourceType: string;
  match: EnrichmentPayload;
  /** Secondary candidates when ambiguity was detected (remakes…). */
  alternatives: EnrichmentPayload[];
  /** How the match was produced: "exact" | "search" | "year_match". */
  matchMethod: string;
  confidence: number;
  /** Provider attribution metadata (kept with the enrichment). */
  attribution: { source: string; creditText: string; fetchedAt: string };
};

export class ProviderUnavailableError extends Error {
  constructor(providerKey: string, detail = "provider unavailable") {
    super(`${providerKey}:${detail}`);
    this.name = "ProviderUnavailableError";
  }
}

export class ProviderRateLimitedError extends Error {
  constructor(providerKey: string) {
    super(`${providerKey}:rate_limited`);
    this.name = "ProviderRateLimitedError";
  }
}

export interface EnrichmentProviderAdapter {
  readonly providerKey: string;
  /** True when credentials are configured for this provider. */
  isConfigured(): boolean;
  /** Human-readable attribution requirement. */
  attribution: string;
  /** Perform one lookup. Must not cache — the engine owns caching. */
  lookup(input: EnrichmentLookupInput): Promise<EnrichmentLookupResult>;
}

/** Shared helpers for HTTP provider adapters. */

export async function providerGetJson<T>(
  providerKey: string,
  url: string,
  options: { headers?: Record<string, string>; timeoutMs?: number } = {},
): Promise<T> {
  try {
    const response = await fetchSourceHttp(new URL(url), {
      accept: "application/json",
      headers: options.headers,
      maxBytes: 4 * 1024 * 1024,
      timeoutMs: options.timeoutMs ?? 15_000,
    });
    if (response.status === 429) {
      throw new ProviderRateLimitedError(providerKey);
    }
    if (response.status === 404) {
      throw new ProviderUnavailableError(providerKey, "not_found");
    }
    if (response.status >= 400) {
      throw new ProviderUnavailableError(providerKey, `http_${response.status}`);
    }
    return JSON.parse(response.body) as T;
  } catch (error) {
    if (error instanceof ProviderUnavailableError || error instanceof ProviderRateLimitedError) {
      throw error;
    }
    if (error instanceof SourceHttpError) {
      throw new ProviderUnavailableError(providerKey, error.message);
    }
    throw new ProviderUnavailableError(providerKey, error instanceof Error ? error.message : String(error));
  }
}

export function yearFromDate(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }
  const parsed = Number.parseInt(value.slice(0, 4), 10);
  return Number.isFinite(parsed) ? parsed : null;
}
