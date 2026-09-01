// Article-type and search-intent classification (Phase 4).
//
// Deterministic by default: classified from cluster signals only (headline,
// member titles, categories, verification state, entities, facts). An
// injectable override allows AI-assisted classification in production
// without ever breaking deterministic CI.

import type { ArticleType, EngineEntity, LedgerFact, SearchIntent } from "./types";

export type ClassificationInput = {
  headline: string;
  summary: string | null;
  memberTitles: string[];
  categories: string[];
  verificationState: string;
  entities: Array<Pick<EngineEntity, "type" | "name">>;
  facts: Array<Pick<LedgerFact, "factKey" | "statement" | "verificationStatus">>;
  ageHours: number;
};

export type ClassificationResult = {
  articleType: ArticleType;
  searchIntent: SearchIntent;
  signals: Array<{ signal: string; detail: string }>;
};

const textOf = (input: ClassificationInput): string =>
  [
    input.headline,
    input.summary ?? "",
    ...input.memberTitles,
    input.categories.join(" "),
    ...input.facts.map((fact) => fact.statement),
  ]
    .join(" ")
    .toLowerCase();

function hasEntityType(input: ClassificationInput, types: string[]): boolean {
  return input.entities.some((entity) => types.includes(entity.type));
}

function hasFactKey(input: ClassificationInput, key: string): boolean {
  return input.facts.some((fact) => fact.factKey === key);
}

type Rule = {
  type: ArticleType;
  test: (input: ClassificationInput, text: string) => string | null;
};

const KEYWORD_RULES: Rule[] = [
  {
    type: "trailer_news",
    test: (_input, text) => {
      if (/\b(trailer|teaser)\b/.test(text) && /\b(drop|released?|debut|first|watch|new)\b/.test(text)) {
        return "trailer cue + release verb in story text";
      }
      return null;
    },
  },
  {
    type: "casting_news",
    test: (_input, text) => {
      if (/\b(cast|casting|joins?|attached to|tapped to|in talks|rounds? out)\b/.test(text)) {
        return "casting cue in story text";
      }
      return null;
    },
  },
  {
    type: "release_date_news",
    test: (_input, text) => {
      if (/\b(release date|premiere date|hits? theaters|arrives? on|sets? .* date|estreno)\b/.test(text)) {
        return "release-date cue in story text";
      }
      return null;
    },
  },
  {
    type: "streaming_availability",
    test: (_input, text) => {
      if (
        /\b(streaming|now streaming|available on|exclusively on|netflix|disney\+|prime video|hbo max|hulu|apple tv\+|paramount\+|peacock)\b/.test(text)
      ) {
        return "streaming/platform cue in story text";
      }
      return null;
    },
  },
  {
    type: "tv_programming",
    test: (_input, text) => {
      if (
        /\b(season (premiere|finale|2|3|4|5)|episode|renewed|canceled|cancelled|lineup|schedule|tv channel|broadcast|airing)\b/.test(text)
      ) {
        return "TV programming cue in story text";
      }
      return null;
    },
  },
  {
    type: "movie_announcement",
    test: (_input, text) => {
      if (
        /\b(announces?|announced|greenlit|green lights?|in development|first look|unveils?|new film|new movie)\b/.test(text)
      ) {
        return "announcement cue in story text";
      }
      return null;
    },
  },
  {
    type: "list_ranking",
    test: (_input, text) => {
      if (/\b(ranking|ranked|best .* (movie|film|show)|top \d+|the \d+ best|must-?watch|mejores|listas?)\b/.test(text)) {
        return "ranking/list cue in story text";
      }
      return null;
    },
  },
  {
    type: "what_to_watch",
    test: (_input, text) => {
      if (/\b(what to watch|where to watch|qué ver|dónde ver)\b/.test(text)) {
        return "watch-guidance cue in story text";
      }
      return null;
    },
  },
  {
    type: "review_info",
    test: (_input, text) => {
      if (/\b(review|reviews?|rating|rated|review roundup|reception|critical response)\b/.test(text)) {
        return "review/reception cue in story text";
      }
      return null;
    },
  },
];

/** Intent defaults by article type; overridable per site. */
const INTENT_BY_TYPE: Record<ArticleType, SearchIntent> = {
  breaking_news: "informational",
  standard_news: "informational",
  developing_story: "informational",
  movie_announcement: "informational",
  casting_news: "informational",
  release_date_news: "informational",
  trailer_news: "informational",
  streaming_availability: "informational",
  tv_programming: "informational",
  review_info: "commercial_investigation",
  evergreen_explainer: "informational",
  list_ranking: "commercial_investigation",
  what_to_watch: "commercial_investigation",
  article_update: "informational",
};

/** Default target length ranges per article type. */
export const LENGTH_BY_TYPE: Record<ArticleType, { min: number; max: number }> = {
  breaking_news: { min: 250, max: 500 },
  standard_news: { min: 450, max: 900 },
  developing_story: { min: 350, max: 800 },
  movie_announcement: { min: 350, max: 700 },
  casting_news: { min: 300, max: 600 },
  release_date_news: { min: 300, max: 650 },
  trailer_news: { min: 300, max: 650 },
  streaming_availability: { min: 350, max: 750 },
  tv_programming: { min: 300, max: 700 },
  review_info: { min: 800, max: 1600 },
  evergreen_explainer: { min: 900, max: 1800 },
  list_ranking: { min: 800, max: 1600 },
  what_to_watch: { min: 700, max: 1400 },
  article_update: { min: 300, max: 700 },
};

export function classifyStory(input: ClassificationInput): ClassificationResult {
  const text = textOf(input);
  const signals: ClassificationResult["signals"] = [];

  // Verification-driven type first: an actively-updating or disputed story
  // is a developing story by definition.
  if (input.verificationState === "developing") {
    signals.push({ signal: "verification", detail: "cluster verification state is developing" });
    const type: ArticleType = "developing_story";
    return { articleType: type, searchIntent: INTENT_BY_TYPE[type], signals };
  }

  if (input.verificationState === "disputed") {
    signals.push({
      signal: "verification",
      detail: "cluster has conflicting facts; standard news with explicit uncertainty",
    });
    const type: ArticleType = "standard_news";
    return { articleType: type, searchIntent: INTENT_BY_TYPE[type], signals };
  }

  for (const rule of KEYWORD_RULES) {
    const detail = rule.test(input, text);
    if (detail) {
      signals.push({ signal: "keywords", detail });
      return { articleType: rule.type, searchIntent: INTENT_BY_TYPE[rule.type], signals };
    }
  }

  // Release-year fact with a movie entity and no news cue → evergreen-style
  // informational content about an existing work.
  if (hasFactKey(input, "release_year") && hasEntityType(input, ["movie", "tv_series", "creative_work"]) && input.ageHours > 48) {
    signals.push({ signal: "entities", detail: "work entity + release year, aged story → evergreen explainer" });
    const type: ArticleType = "evergreen_explainer";
    return { articleType: type, searchIntent: INTENT_BY_TYPE[type], signals };
  }

  // Fresh (≤48h) movie/tv story with no specialized cue → standard news.
  if (hasEntityType(input, ["movie", "tv_series", "actor", "director", "studio", "streaming_service", "tv_channel"])) {
    signals.push({ signal: "entities", detail: "movie/tv entity present, no specialized cue" });
    const type: ArticleType = "standard_news";
    return { articleType: type, searchIntent: INTENT_BY_TYPE[type], signals };
  }

  if (input.ageHours <= 6) {
    signals.push({ signal: "freshness", detail: "story younger than 6 hours → breaking news" });
    const type: ArticleType = "breaking_news";
    return { articleType: type, searchIntent: INTENT_BY_TYPE[type], signals };
  }

  signals.push({ signal: "default", detail: "no specialized signal matched" });
  const type: ArticleType = "standard_news";
  return { articleType: type, searchIntent: INTENT_BY_TYPE[type], signals };
}

export type ClassifierOverride = (input: ClassificationInput) => ClassificationResult | null;

let classifierOverride: ClassifierOverride | null = null;

/** Override classification (production AI-assisted flows; tests reset it). */
export function setClassifierOverride(override: ClassifierOverride | null): void {
  classifierOverride = override;
}

export function getClassifiedStory(input: ClassificationInput): ClassificationResult {
  if (classifierOverride) {
    const result = classifierOverride(input);
    if (result) {
      return result;
    }
  }
  return classifyStory(input);
}
