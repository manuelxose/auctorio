// Generic entity model (Phase 3).
//
// Core Auctorio knows only generic, domain-agnostic entity types. Domain
// plugins (see ../domains/plugin.ts) contribute specialized entity types
// (movie, tv_series, season, episode, actor, director, studio, streaming
// service, tv_channel, franchise) through the same model.

export const GENERIC_ENTITY_TYPES = [
  "person",
  "organization",
  "product",
  "place",
  "creative_work",
  "event",
  "company",
  "topic",
] as const;

export type GenericEntityType = (typeof GENERIC_ENTITY_TYPES)[number];

/** Specialized types contributed by the movie/tv domain plugin. */
export const MOVIE_TV_ENTITY_TYPES = [
  "movie",
  "tv_series",
  "season",
  "episode",
  "actor",
  "director",
  "studio",
  "streaming_service",
  "tv_channel",
  "franchise",
] as const;

export type MovieTvEntityType = (typeof MOVIE_TV_ENTITY_TYPES)[number];

export type EntityType = GenericEntityType | MovieTvEntityType | (string & {});

export type EntityEvidence = {
  /** Where the entity was observed: "title" | "description" | "text". */
  field: "title" | "description" | "text" | "provider";
  /** Exact matched surface string. */
  match: string;
  /** Provider that asserted this entity (e.g. "tmdb"), when applicable. */
  provider?: string;
  /** Deterministic signals that produced the match. */
  method: string;
};

export type EntityExtraction = {
  /** Domain that produced the extraction: "generic" or a plugin domain. */
  domain: string;
  type: EntityType;
  name: string;
  confidence: number;
  evidence: EntityEvidence[];
  /** Optional external ids asserted at extraction time (e.g. TMDB id). */
  externalIds?: Record<string, string>;
  aliases?: string[];
  /** Domain-specific metadata (e.g. release year). */
  metadata?: Record<string, unknown>;
};

/** Canonical, deterministic identity key for an entity within a domain/type. */
export function buildEntityCanonicalKey(domain: string, type: string, name: string): string {
  return `${domain}:${type}:${name.trim().toLowerCase()}`;
}

export function isGenericEntityType(type: string): type is GenericEntityType {
  return (GENERIC_ENTITY_TYPES as readonly string[]).includes(type);
}

export function clampConfidence(value: number): number {
  return Math.max(0, Math.min(1, Math.round(value * 1000) / 1000));
}
