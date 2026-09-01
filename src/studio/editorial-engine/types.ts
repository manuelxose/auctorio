// Editorial engine (Phase 4) — core types.
//
// The engine turns high-quality Story Intelligence clusters into original,
// publication-ready editorial content. It extends the existing article
// pipeline: the writer output is parsed, QA'd and persisted as an
// ArticleGeneration record that can be materialized into ContentProject /
// ContentVersion for the existing review and publication flows.

export const ARTICLE_TYPES = [
  "breaking_news",
  "standard_news",
  "developing_story",
  "movie_announcement",
  "casting_news",
  "release_date_news",
  "trailer_news",
  "streaming_availability",
  "tv_programming",
  "review_info",
  "evergreen_explainer",
  "list_ranking",
  "what_to_watch",
  "article_update",
] as const;

export type ArticleType = (typeof ARTICLE_TYPES)[number];

export const SEARCH_INTENTS = [
  "informational",
  "navigational",
  "commercial_investigation",
  "transactional",
] as const;

export type SearchIntent = (typeof SEARCH_INTENTS)[number];

export type DuplicateDecision = "create_new" | "update_existing" | "skip";

// ────────────────────────────────────────────────────────────── Fact ledger view

/** A single fact from the ledger, normalized for the engine. */
export type LedgerFact = {
  factKey: string;
  statement: string;
  publisher: string | null;
  publisherGroup: string | null;
  sourceUrl: string | null;
  confidence: number;
  verificationStatus: string;
  /** Other statements for the same key (conflicts), when present. */
  conflictingStatements: string[];
  /** Number of independent publisher groups supporting this exact statement. */
  supportingGroups: number;
};

export type FactUsage =
  | "state_confidently"
  | "state"
  | "attribute"
  | "temporal_language"
  | "represent_uncertainty"
  | "forbidden";

export type FactSensitivity = "high" | "normal";

export type FactLicense = {
  factKey: string;
  statement: string;
  usage: FactUsage;
  sensitivity: FactSensitivity;
  reasons: string[];
  phrasingHint: string;
  sources: Array<{ publisher: string | null; url: string | null; group: string | null }>;
  /** Alternative statements recorded for this key (conflicts). */
  alternatives: string[];
};

export type FactLedgerView = {
  facts: LedgerFact[];
  byKey: Record<string, { variants: LedgerFact[]; supporters: number }>;
  clusterVerificationState: string;
  independentPublisherGroups: number;
  licenses: FactLicense[];
};

// ────────────────────────────────────────────────────────────── Entities & enrichment

export type EngineEntity = {
  id: string;
  domain: string;
  type: string;
  name: string;
  confidence: number;
  externalIds: Record<string, string>;
};

export type EngineEnrichment = {
  entityId: string;
  providerKey: string;
  title: string | null;
  originalTitle: string | null;
  releaseDate: string | null; // ISO date
  resourceType: string;
  matchMethod: string;
  confidence: number;
  data: Record<string, unknown>;
};

// ────────────────────────────────────────────────────────────── Site knowledge

export type EngineInternalLink = {
  url: string;
  title: string;
  anchor: string;
  reason: string;
  score: number;
};

export type SiteValueBlock = {
  key: string;
  title: string;
  /** Only populated from validated data; empty content means the block is dropped. */
  lines: string[];
  source: string;
};

export type SiteKnowledge = {
  siteId: string | null;
  siteName: string | null;
  siteType: string | null;
  locale: string | null;
  internalLinks: EngineInternalLink[];
  indexedPageTitles: string[];
  siteValueBlocks: SiteValueBlock[];
};

// ────────────────────────────────────────────────────────────── Editorial brief

export type EditorialBrief = {
  storyAngle: string;
  targetSite: {
    id: string | null;
    name: string | null;
    type: string | null;
    locale: string | null;
  };
  audience: string;
  searchIntent: SearchIntent;
  articleType: ArticleType;
  primaryKeyword: string;
  secondaryKeywords: string[];
  entities: Array<{ name: string; type: string; externalIds: Record<string, string> }>;
  verifiedFacts: Array<{ factKey: string; statement: string }>;
  unresolvedFacts: Array<{ factKey: string; statements: string[] }>;
  requiredAttribution: Array<{ publisher: string | null; url: string | null; reason: string }>;
  internalLinkOpportunities: EngineInternalLink[];
  relatedSiteContent: string[];
  uniqueValueProposition: string;
  targetLengthRange: { min: number; max: number };
  freshnessConstraints: string[];
  contentWarnings: string[];
  generatedAt: string;
};

// ────────────────────────────────────────────────────────────── Article

export type ParsedArticle = {
  title: string;
  h1: string;
  excerpt: string;
  bodyHtml: string;
  seoTitle: string;
  seoDescription: string;
  /** Claims the writer reports using, mapped back to fact keys. */
  claims: Array<{ text: string; factKey: string | null; attributionRequired: boolean }>;
};

export type WriterOutput = {
  raw: string;
  provider: string;
  model: string | null;
  parsed: ParsedArticle;
};

// ────────────────────────────────────────────────────────────── SEO

export type SeoPackage = {
  seoTitle: string;
  h1: string;
  slug: string;
  metaDescription: string;
  excerpt: string;
  primaryKeyword: string;
  secondaryKeywords: string[];
  entityCoverage: Array<{ name: string; type: string; occurrences: number; covered: boolean }>;
  internalLinks: EngineInternalLink[];
  externalAttributionLinks: Array<{ url: string; publisher: string | null }>;
  openGraph: { title: string; description: string };
  socialTitle: string;
  structuredDataRecommendation: string;
  keywordDensity: { keyword: string; occurrences: number; densityPercent: number; stuffingRisk: boolean };
  /** Explicit: the engine never manufactures search volume. */
  searchVolumeDisclaimer: string;
};

// ────────────────────────────────────────────────────────────── QA

export type QaDimensionKey =
  | "factual_grounding"
  | "attribution"
  | "originality"
  | "relevance"
  | "completeness"
  | "readability"
  | "seo_quality"
  | "internal_linking"
  | "entity_consistency"
  | "date_consistency"
  | "unsupported_claims"
  | "duplication"
  | "source_diversity";

export type QaFindingV3 = {
  key: string;
  dimension: QaDimensionKey;
  severity: "error" | "warning" | "info";
  passed: boolean;
  message: string;
};

export type QaDimensionScore = {
  dimension: QaDimensionKey;
  score: number; // 0..100
  findings: QaFindingV3[];
};

export type EditorialQaReport = {
  score: number; // 0..100
  passed: boolean; // no errors
  criticalUnsupportedClaims: Array<{ claim: string; reason: string }>;
  dimensions: QaDimensionScore[];
  findings: QaFindingV3[];
};

// ────────────────────────────────────────────────────────────── Publication decision

export type PublicationGateResult = {
  key: string;
  label: string;
  passed: boolean;
  detail: string;
};

export type PublicationDecision = {
  decision: "auto_publish" | "review" | "hold" | "reject";
  gates: PublicationGateResult[];
  config: Record<string, unknown>;
  reasons: string[];
};

export type PublicationGatesConfig = {
  minQaScore: number;
  allowUnsupportedClaims: boolean;
  allowCopyrightWarning: boolean;
  minSourceGroups: number;
  minSiteMatch: number;
  requireHumanApproval: boolean;
};

// ────────────────────────────────────────────────────────────── Provenance

export type ProvenanceEntry = {
  factKey: string;
  statement: string;
  usage: FactUsage;
  sensitivity: FactSensitivity;
  sources: Array<{ publisher: string | null; url: string | null; group: string | null }>;
  /** Claims in the generated article that rely on this fact. */
  claims: string[];
  inlineAttributed: boolean;
};

export type UpdateDelta = {
  previousTitle: string | null;
  newFacts: string[];
  changedFacts: Array<{ factKey: string; before: string; after: string }>;
  updateNote: string;
  detectedAt: string;
};

export function isArticleType(value: string): value is ArticleType {
  return (ARTICLE_TYPES as readonly string[]).includes(value);
}

export function isSearchIntent(value: string): value is SearchIntent {
  return (SEARCH_INTENTS as readonly string[]).includes(value);
}
