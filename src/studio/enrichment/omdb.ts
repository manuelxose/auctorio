// OMDb provider adapter — optional lightweight enrichment (titles, ratings,
// votes, posters). Configured via OMDB_API_KEY. Attribution: OMDb by Brian
// Fritz; data must remain attributable.

import { getEnv } from "../../shared/utils/env";
import {
  ProviderUnavailableError,
  providerGetJson,
  yearFromDate,
  type EnrichmentLookupInput,
  type EnrichmentLookupResult,
  type EnrichmentPayload,
  type EnrichmentProviderAdapter,
} from "./adapter";

export const OMDB_PROVIDER_KEY = "omdb";

type OmdbResponse = {
  Response: string;
  Error?: string;
  imdbID?: string;
  Title?: string;
  Year?: string;
  Released?: string;
  Genre?: string;
  Director?: string;
  Actors?: string;
  imdbRating?: string;
  imdbVotes?: string;
  Poster?: string;
  Type?: string;
  Plot?: string;
};

export class OmdbProvider implements EnrichmentProviderAdapter {
  readonly providerKey = OMDB_PROVIDER_KEY;
  readonly attribution = "Data by OMDb API — omdbapi.com";

  private readonly apiKey: string | null;

  constructor(apiKey?: string | null) {
    this.apiKey = apiKey !== undefined ? apiKey : getEnv("OMDB_API_KEY", "") || null;
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  async lookup(input: EnrichmentLookupInput): Promise<EnrichmentLookupResult> {
    if (!this.apiKey) {
      throw new ProviderUnavailableError(this.providerKey, "not_configured");
    }
    const mediaType = input.resourceType === "tv" ? "series" : "movie";
    const params = new URLSearchParams({
      apikey: this.apiKey,
      t: input.query,
      type: mediaType,
    });
    if (input.year) {
      params.set("y", String(input.year));
    }
    const data = await providerGetJson<OmdbResponse>(
      this.providerKey,
      `https://www.omdbapi.com/?${params.toString()}`,
    );
    if (data.Response === "False" || !data.Title) {
      throw new ProviderUnavailableError(this.providerKey, data.Error ?? "not_found");
    }

    const payload: EnrichmentPayload = {
      id: data.imdbID ?? null,
      resourceType: input.resourceType,
      title: data.Title,
      originalTitle: null,
      releaseDate: data.Released && data.Released !== "N/A" ? data.Released : null,
      year: yearFromDate(data.Year ?? null),
      genres: (data.Genre ?? "").split(",").map((genre) => genre.trim()).filter(Boolean),
      popularity: null,
      rating: data.imdbRating && data.imdbRating !== "N/A" ? Number.parseFloat(data.imdbRating) : null,
      votes: data.imdbVotes && data.imdbVotes !== "N/A" ? Number.parseInt(data.imdbVotes.replace(/,/g, ""), 10) : null,
      cast: (data.Actors ?? "").split(",").map((name) => name.trim()).filter(Boolean),
      crew: data.Director ? data.Director.split(",").map((name) => name.trim()).filter(Boolean) : [],
      studios: [],
      franchise: null,
      overview: data.Plot && data.Plot !== "N/A" ? data.Plot : null,
      posterUrl: data.Poster && data.Poster !== "N/A" ? data.Poster : null,
      backdropUrl: null,
      watchProviders: [],
      extra: { imdbId: data.imdbID ?? null },
    };

    const yearMatch = input.year && payload.year === input.year;
    return {
      providerKey: this.providerKey,
      resourceType: input.resourceType,
      match: payload,
      alternatives: [],
      matchMethod: yearMatch ? "year_match" : "exact",
      confidence: yearMatch ? 0.9 : 0.8,
      attribution: { source: "OMDb", creditText: this.attribution, fetchedAt: new Date().toISOString() },
    };
  }
}

let sharedOmdb: OmdbProvider | null = null;

export function getOmdbProvider(): OmdbProvider {
  if (!sharedOmdb) {
    sharedOmdb = new OmdbProvider();
  }
  return sharedOmdb;
}
