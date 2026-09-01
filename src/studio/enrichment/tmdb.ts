// TMDB provider adapter. Configured via TMDB_API_KEY (v3 auth bearer token).
// Attribution: metadata sourced from TMDb, with a link to themoviedb.org as
// required by the TMDb terms of use. Provider popularity is metadata, never
// editorial truth.

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

export const TMDB_PROVIDER_KEY = "tmdb";
const TMDB_BASE = "https://api.themoviedb.org/3";
const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p/w500";

type TmdbSearchResult = {
  id: number;
  media_type?: string;
  title?: string;
  name?: string;
  original_title?: string;
  original_name?: string;
  release_date?: string;
  first_air_date?: string;
  overview?: string;
  popularity?: number;
  poster_path?: string | null;
  genre_ids?: number[];
};

type TmdbDetails = {
  id: number;
  title?: string;
  name?: string;
  original_title?: string;
  original_name?: string;
  release_date?: string;
  first_air_date?: string;
  overview?: string | null;
  popularity?: number;
  vote_average?: number;
  vote_count?: number;
  poster_path?: string | null;
  backdrop_path?: string | null;
  genres?: Array<{ id: number; name: string }>;
  belongs_to_collection?: { name: string } | null;
  production_companies?: Array<{ name: string }>;
  networks?: Array<{ name: string }>;
};

type TmdbCredits = {
  cast?: Array<{ name: string }>;
  crew?: Array<{ name: string; job?: string }>;
};

type TmdbWatchProviders = {
  results?: Record<string, { flatrate?: Array<{ provider_name: string }> }>;
};

export class TmdbProvider implements EnrichmentProviderAdapter {
  readonly providerKey = TMDB_PROVIDER_KEY;
  readonly attribution = "Data by TMDB — themoviedb.org";

  private readonly token: string | null;

  constructor(token?: string | null) {
    this.token = token !== undefined ? token : getEnv("TMDB_API_KEY", "") || null;
  }

  isConfigured(): boolean {
    return Boolean(this.token);
  }

  private authHeaders(): Record<string, string> {
    if (!this.token) {
      throw new ProviderUnavailableError(this.providerKey, "not_configured");
    }
    return { authorization: `Bearer ${this.token}` };
  }

  async lookup(input: EnrichmentLookupInput): Promise<EnrichmentLookupResult> {
    if (!this.isConfigured()) {
      throw new ProviderUnavailableError(this.providerKey, "not_configured");
    }
    const mediaType = input.resourceType === "tv" ? "tv" : "movie";
    const params = new URLSearchParams({
      query: input.query,
      include_adult: "false",
      language: "en-US",
    });
    if (input.year) {
      params.set("year", String(input.year));
      params.set("primary_release_year", String(input.year));
    }

    const search = await providerGetJson<{ results?: TmdbSearchResult[] }>(
      this.providerKey,
      `${TMDB_BASE}/search/${mediaType}?${params.toString()}`,
      { headers: this.authHeaders() },
    );
    const results = (search.results ?? []).filter((result) =>
      mediaType === "tv" ? result.name : result.title,
    );
    if (results.length === 0) {
      throw new ProviderUnavailableError(this.providerKey, "not_found");
    }

    const alternatives: EnrichmentPayload[] = [];
    for (const result of results.slice(1, 4)) {
      alternatives.push(this.toPayload(result, mediaType, "search"));
    }

    // Year preference wins (remake disambiguation); otherwise most popular.
    let best = results[0];
    let matchMethod = "search";
    if (input.year) {
      const dated = results.find((result) => {
        const raw = mediaType === "tv" ? result.first_air_date : result.release_date;
        return raw && yearFromDate(raw) === input.year;
      });
      if (dated) {
        best = dated;
        matchMethod = "year_match";
      }
    }
    // Exact normalized title match upgrades the method.
    const exact = results.find((result) => {
      const raw = (mediaType === "tv" ? result.name : result.title) ?? "";
      return raw.trim().toLowerCase() === input.query.trim().toLowerCase();
    });
    if (exact) {
      best = exact;
      matchMethod = "exact";
    }

    const details = await providerGetJson<TmdbDetails>(
      this.providerKey,
      `${TMDB_BASE}/${mediaType}/${best.id}?language=en-US&append_to_response=`,
      { headers: this.authHeaders() },
    ).catch(() => null);

    let credits: TmdbCredits | null = null;
    let watchProviders: TmdbWatchProviders | null = null;
    if (details) {
      credits = await providerGetJson<TmdbCredits>(
        this.providerKey,
        `${TMDB_BASE}/${mediaType}/${best.id}/credits?language=en-US`,
        { headers: this.authHeaders() },
      ).catch(() => null);
      watchProviders = await providerGetJson<TmdbWatchProviders>(
        this.providerKey,
        `${TMDB_BASE}/${mediaType}/${best.id}/watch/providers`,
        { headers: this.authHeaders() },
      ).catch(() => null);
    }

    const match = this.mergeDetails(this.toPayload(best, mediaType, matchMethod), details, credits, watchProviders, mediaType);
    return {
      providerKey: this.providerKey,
      resourceType: mediaType,
      match,
      alternatives,
      matchMethod,
      confidence: matchMethod === "exact" ? 0.95 : matchMethod === "year_match" ? 0.85 : 0.7,
      attribution: {
        source: "TMDB",
        creditText: this.attribution,
        fetchedAt: new Date().toISOString(),
      },
    };
  }

  private toPayload(result: TmdbSearchResult, mediaType: string, method: string): EnrichmentPayload {
    return {
      id: String(result.id),
      resourceType: mediaType,
      title: (mediaType === "tv" ? result.name : result.title) ?? result.name ?? "",
      originalTitle: (mediaType === "tv" ? result.original_name : result.original_title) ?? null,
      releaseDate: (mediaType === "tv" ? result.first_air_date : result.release_date) ?? null,
      year: yearFromDate(mediaType === "tv" ? result.first_air_date : result.release_date),
      genres: [],
      popularity: result.popularity ?? null,
      rating: null,
      votes: null,
      cast: [],
      crew: [],
      studios: [],
      franchise: null,
      overview: result.overview ?? null,
      posterUrl: result.poster_path ? `${TMDB_IMAGE_BASE}${result.poster_path}` : null,
      backdropUrl: null,
      watchProviders: [],
      extra: { matchMethod: method },
    };
  }

  private mergeDetails(
    base: EnrichmentPayload,
    details: TmdbDetails | null,
    credits: TmdbCredits | null,
    watchProviders: TmdbWatchProviders | null,
    mediaType: string,
  ): EnrichmentPayload {
    if (!details) {
      return base;
    }
    const providerNames = new Set<string>();
    const regionResults = watchProviders?.results;
    if (regionResults) {
      for (const region of Object.values(regionResults)) {
        for (const entry of region.flatrate ?? []) {
          providerNames.add(entry.provider_name);
        }
      }
    }
    const studios = [
      ...(details.production_companies ?? []).map((company) => company.name),
      ...(details.networks ?? []).map((network) => network.name),
    ];
    const directors = (credits?.crew ?? [])
      .filter((member) => member.job === "Director")
      .map((member) => member.name);
    return {
      ...base,
      title: (mediaType === "tv" ? details.name : details.title) ?? base.title,
      originalTitle: (mediaType === "tv" ? details.original_name : details.original_title) ?? base.originalTitle,
      releaseDate: (mediaType === "tv" ? details.first_air_date : details.release_date) ?? base.releaseDate,
      year: yearFromDate(mediaType === "tv" ? details.first_air_date : details.release_date),
      genres: (details.genres ?? []).map((genre) => genre.name),
      popularity: details.popularity ?? base.popularity,
      rating: details.vote_average ?? null,
      votes: details.vote_count ?? null,
      cast: (credits?.cast ?? []).slice(0, 10).map((member) => member.name),
      crew: directors,
      studios,
      franchise: details.belongs_to_collection?.name ?? null,
      overview: details.overview ?? base.overview,
      posterUrl: details.poster_path ? `${TMDB_IMAGE_BASE}${details.poster_path}` : base.posterUrl,
      backdropUrl: details.backdrop_path ? `https://image.tmdb.org/t/p/w1280${details.backdrop_path}` : null,
      watchProviders: Array.from(providerNames),
      extra: { ...base.extra, tmdbId: details.id },
    };
  }
}

let sharedTmdb: TmdbProvider | null = null;

export function getTmdbProvider(): TmdbProvider {
  if (!sharedTmdb) {
    sharedTmdb = new TmdbProvider();
  }
  return sharedTmdb;
}
