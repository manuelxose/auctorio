// IMDb official API provider adapter — optional, and only ever used when
// official IMDb API credentials are configured (IMDB_API_BASE_URL,
// IMDB_API_KEY). No unofficial IMDb scraping, ever. The pipeline never
// depends on IMDb availability; when unconfigured this adapter is inert.

import { getEnv } from "../../shared/utils/env";
import {
  ProviderUnavailableError,
  providerGetJson,
  type EnrichmentLookupInput,
  type EnrichmentLookupResult,
  type EnrichmentPayload,
  type EnrichmentProviderAdapter,
} from "./adapter";

export const IMDB_PROVIDER_KEY = "imdb";

export class ImdbProvider implements EnrichmentProviderAdapter {
  readonly providerKey = IMDB_PROVIDER_KEY;
  readonly attribution = "Data by IMDb (official API)";

  private readonly baseUrl: string;
  private readonly apiKey: string | null;

  constructor(options: { baseUrl?: string; apiKey?: string | null } = {}) {
    this.baseUrl = (options.baseUrl ?? getEnv("IMDB_API_BASE_URL", "")).replace(/\/$/, "");
    this.apiKey = options.apiKey !== undefined ? options.apiKey : getEnv("IMDB_API_KEY", "") || null;
  }

  isConfigured(): boolean {
    // IMDb has no public HTTP API (AWS Data Exchange license). Only a
    // deliberately configured endpoint is ever called.
    return Boolean(this.baseUrl && this.apiKey);
  }

  async lookup(input: EnrichmentLookupInput): Promise<EnrichmentLookupResult> {
    if (!this.isConfigured()) {
      throw new ProviderUnavailableError(this.providerKey, "not_configured");
    }
    const params = new URLSearchParams({ title: input.query });
    if (input.year) {
      params.set("year", String(input.year));
    }
    const data = await providerGetJson<{
      id?: string;
      title?: string;
      rating?: number;
      votes?: number;
      releaseDate?: string;
      boxOffice?: string;
      people?: Array<{ name: string; role?: string }>;
    }>(this.providerKey, `${this.baseUrl}/titles?${params.toString()}`, {
      headers: { "x-api-key": this.apiKey as string },
    });
    if (!data || !data.title) {
      throw new ProviderUnavailableError(this.providerKey, "not_found");
    }
    const payload: EnrichmentPayload = {
      id: data.id ?? null,
      resourceType: input.resourceType,
      title: data.title,
      originalTitle: null,
      releaseDate: data.releaseDate ?? null,
      year: data.releaseDate ? Number.parseInt(data.releaseDate.slice(0, 4), 10) : null,
      genres: [],
      popularity: null,
      rating: data.rating ?? null,
      votes: data.votes ?? null,
      cast: (data.people ?? []).filter((person) => person.role === "actor").map((person) => person.name),
      crew: (data.people ?? []).filter((person) => person.role !== "actor").map((person) => person.name),
      studios: [],
      franchise: null,
      overview: null,
      posterUrl: null,
      backdropUrl: null,
      watchProviders: [],
      extra: { boxOffice: data.boxOffice ?? null },
    };
    return {
      providerKey: this.providerKey,
      resourceType: input.resourceType,
      match: payload,
      alternatives: [],
      matchMethod: "exact",
      confidence: 0.9,
      attribution: { source: "IMDb", creditText: this.attribution, fetchedAt: new Date().toISOString() },
    };
  }
}

let sharedImdb: ImdbProvider | null = null;

export function getImdbProvider(): ImdbProvider {
  if (!sharedImdb) {
    sharedImdb = new ImdbProvider();
  }
  return sharedImdb;
}
