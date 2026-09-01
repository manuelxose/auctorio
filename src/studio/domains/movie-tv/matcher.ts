// Deterministic movie/TV title matching (Level 1-2, no AI).
//
// Handles the classic ambiguity cases deterministically:
// - title vs person (actor/movie name collisions)
// - remakes (year disambiguation, alternatives retained)
// - generic titles ("The Office", "The Bear")
// Only when determinism is exhausted does the pipeline consider an AI judge.

import { normalizeText } from "../../../shared/utils/text";

export type WorkType = "movie" | "tv_series" | "episode" | "unknown";

export type TitleMatch = {
  /** Cleaned candidate work title without year/season artifacts. */
  candidateTitle: string;
  year: number | null;
  season: number | null;
  episode: number | null;
  workType: WorkType;
  /** Why this classification was chosen (explainable). */
  signals: string[];
  /** Ambiguity flags detected deterministically. */
  ambiguities: string[];
  confidence: number;
};

const YEAR_PATTERN = /\b(18[8-9]\d|19\d{2}|20\d{2}|21\d{2})\b/;
const PAREN_YEAR_PATTERN = /\((\d{4})\)/;
const SEASON_PATTERN = /\b(season|temporada)\s*(\d{1,2})\b/i;
const SXXEXX_PATTERN = /\bs(\d{1,2})[\s._-]*e(\d{1,2})\b/i;
const EPISODE_PATTERN = /\bepisode\s*(\d{1,3})\b/i;

const TV_CUES = [
  "series", "season", "temporada", "episode", "show", "spinoff", "spin-off",
  "renewed", "renewal", "streaming series", "tv show", "miniseries", "sitcom",
];
const MOVIE_CUES = [
  "movie", "film", "trailer", "remake", "reboot", "sequel", "prequel",
  "feature", "documentary film", "box office",
];

/** Names that collide with people: never auto-classify as a work alone. */
const PERSON_NAME_MARKERS = /\b(?:says|said|director|directed|stars|starring|star|actor|actress|joins|cast in|to direct|to star)\b/i;

export function extractYearFromTitle(title: string): number | null {
  const paren = PAREN_YEAR_PATTERN.exec(title);
  if (paren) {
    return Number.parseInt(paren[1], 10);
  }
  const bare = YEAR_PATTERN.exec(title);
  if (bare) {
    return Number.parseInt(bare[0], 10);
  }
  return null;
}

export function extractSeasonFromTitle(title: string): { season: number | null; episode: number | null } {
  const sxx = SXXEXX_PATTERN.exec(title);
  if (sxx) {
    return { season: Number.parseInt(sxx[1], 10), episode: Number.parseInt(sxx[2], 10) };
  }
  const season = SEASON_PATTERN.exec(title);
  const episode = EPISODE_PATTERN.exec(title);
  return {
    season: season ? Number.parseInt(season[2], 10) : null,
    episode: episode ? Number.parseInt(episode[1], 10) : null,
  };
}

/** Strip year/season/episode artifacts from a candidate title. */
export function cleanWorkTitle(title: string): string {
  return title
    .replace(PAREN_YEAR_PATTERN, " ")
    .replace(SXXEXX_PATTERN, " ")
    .replace(SEASON_PATTERN, " ")
    .replace(EPISODE_PATTERN, " ")
    .replace(/[|:–—-].*$/, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function detectWorkType(title: string, description: string | null | undefined): WorkType {
  const haystack = normalizeText(`${title} ${description ?? ""}`);
  const tvHits = TV_CUES.filter((cue) => haystack.includes(cue)).length;
  const movieHits = MOVIE_CUES.filter((cue) => haystack.includes(cue)).length;
  if (tvHits > movieHits) {
    return "tv_series";
  }
  if (movieHits > tvHits) {
    return "movie";
  }
  return "unknown";
}

export type MatchWorkInput = {
  title: string;
  description?: string | null;
  /** Context text when the title alone is ambiguous. */
  text?: string | null;
};

export function matchWork(input: MatchWorkInput): TitleMatch {
  const { title } = input;
  const signals: string[] = [];
  const ambiguities: string[] = [];

  const year = extractYearFromTitle(title);
  if (year) {
    signals.push(`year:${year}`);
  }
  const { season, episode } = extractSeasonFromTitle(title);
  if (season !== null) {
    signals.push(`season:${season}`);
  }
  if (episode !== null) {
    signals.push(`episode:${episode}`);
  }

  const candidateTitle = cleanWorkTitle(title);
  let workType = detectWorkType(title, input.description);
  if (season !== null || episode !== null) {
    workType = "tv_series";
    signals.push("season_episode_cue");
  }

  const haystack = normalizeText(`${title} ${input.description ?? ""} ${input.text ?? ""}`);
  if (PERSON_NAME_MARKERS.test(haystack) && !season && !year) {
    ambiguities.push("person_name_collision");
  }
  if (workType === "unknown" && !year && !season) {
    ambiguities.push("generic_title");
  }

  let confidence = 0.5;
  if (year) confidence += 0.15;
  if (workType !== "unknown") confidence += 0.15;
  if (season !== null) confidence += 0.1;
  if (ambiguities.length > 0) confidence = Math.min(confidence, 0.55);
  confidence = Math.max(0.1, Math.min(0.95, confidence));

  return {
    candidateTitle,
    year,
    season,
    episode,
    workType,
    signals,
    ambiguities,
    confidence: Math.round(confidence * 100) / 100,
  };
}

/** Normalized title equality for provider confirmation. */
export function normalizedTitleEqual(a: string, b: string): boolean {
  const normalize = (value: string) =>
    normalizeText(value)
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  return normalize(a) === normalize(b);
}
