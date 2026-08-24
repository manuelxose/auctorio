import { arr, enums, num, obj, optionalString, optNul, str, type SchemaDef, type Infer } from "../shared/schema";

/** Versioned schema identity for editorial plan generation. */
export const EDITORIAL_PLAN_SCHEMA_NAME = "EditorialPlanGenerationSchemaV2";
export const EDITORIAL_PLAN_PROMPT_VERSION = "v2";

// ────────────────────────────────────────────────────────────── Enums

export const STRATEGY_MODES = [
  "balanced",
  "seo-growth",
  "topical-authority",
  "news-freshness",
  "evergreen-growth",
  "commercial-transactional",
  "engagement",
  "seasonal",
  "custom",
] as const;
export type StrategyMode = (typeof STRATEGY_MODES)[number];

export const SEARCH_INTENTS = [
  "informational",
  "navigational",
  "commercial-investigation",
  "transactional",
  "local",
  "comparison",
  "news",
  "entertainment-discovery",
  "where-to-watch",
  "sports-live",
  "mixed",
] as const;
export type SearchIntent = (typeof SEARCH_INTENTS)[number];

export const CONTENT_FORMATS = [
  "guide",
  "news",
  "ranking",
  "comparison",
  "analysis",
  "explainer",
  "tutorial",
  "faq",
  "landing",
  "review",
  "preview",
  "match-preview",
  "match-report",
  "schedule",
  "where-to-watch",
  "streaming-recommendation",
  "evergreen-pillar",
  "cluster-article",
] as const;
export type ContentFormat = (typeof CONTENT_FORMATS)[number];

export const FUNNEL_STAGES = ["top", "middle", "bottom", "retention"] as const;

export const CANNIBALIZATION_RISKS = ["none", "related-cluster", "update-existing", "merge-candidate", "high"] as const;
export type CannibalizationRisk = (typeof CANNIBALIZATION_RISKS)[number];

/** Default word-count ranges per content format (defaults, not absolute rules). */
export const WORD_TARGETS: Record<ContentFormat, { min: number; max: number }> = {
  news: { min: 600, max: 1000 },
  preview: { min: 600, max: 1000 },
  "match-preview": { min: 700, max: 1200 },
  "match-report": { min: 800, max: 1400 },
  analysis: { min: 900, max: 1500 },
  review: { min: 900, max: 1600 },
  tutorial: { min: 1200, max: 2200 },
  explainer: { min: 1200, max: 2200 },
  "where-to-watch": { min: 1200, max: 2000 },
  "streaming-recommendation": { min: 1200, max: 2000 },
  ranking: { min: 1200, max: 2200 },
  "cluster-article": { min: 1200, max: 2200 },
  schedule: { min: 1200, max: 2200 },
  guide: { min: 1800, max: 3000 },
  faq: { min: 1200, max: 2200 },
  landing: { min: 1200, max: 2200 },
  comparison: { min: 1500, max: 3000 },
  "evergreen-pillar": { min: 2500, max: 4500 },
};

/** Formats that make sense per site type; sites may override. */
export const FORMATS_BY_SITE_TYPE: Record<string, ContentFormat[]> = {
  guiatv: [
    "guide",
    "news",
    "ranking",
    "comparison",
    "analysis",
    "explainer",
    "preview",
    "match-preview",
    "match-report",
    "schedule",
    "where-to-watch",
    "streaming-recommendation",
    "evergreen-pillar",
    "cluster-article",
    "faq",
  ],
  tecnoria: ["guide", "news", "analysis", "explainer", "tutorial", "review", "comparison", "ranking", "evergreen-pillar", "cluster-article", "faq"],
  talkaris: ["guide", "analysis", "explainer", "landing", "evergreen-pillar", "cluster-article", "faq"],
  webhook: CONTENT_FORMATS as unknown as ContentFormat[],
};

/** Strategy-mode → allowed intents. */
export const INTENTS_BY_STRATEGY: Record<StrategyMode, SearchIntent[]> = {
  balanced: ["informational", "mixed", "news", "entertainment-discovery", "comparison"],
  "seo-growth": ["informational", "commercial-investigation", "comparison", "transactional"],
  "topical-authority": ["informational", "navigational", "mixed"],
  "news-freshness": ["news", "sports-live", "entertainment-discovery"],
  "evergreen-growth": ["informational", "navigational"],
  "commercial-transactional": ["commercial-investigation", "transactional", "comparison", "where-to-watch"],
  engagement: ["entertainment-discovery", "news", "mixed"],
  seasonal: ["informational", "news", "commercial-investigation"],
  custom: [...SEARCH_INTENTS],
};

// ────────────────────────────────────────────────────────────── Schema V2

const channelSchema = enums(["website", "x", "instagram"] as const);
const contentTypeSchema = enums(CONTENT_FORMATS);
const intentSchema = enums(SEARCH_INTENTS);
const funnelStageSchema = enums(FUNNEL_STAGES);

const outlineItemSchema = obj({
  heading: str({ minLength: 3, maxLength: 200 }),
  subpoints: arr(str({ maxLength: 300 }), { maxItems: 8 }),
});

const faqCandidateSchema = obj({
  question: str({ minLength: 8, maxLength: 300 }),
  answer: str({ minLength: 20, maxLength: 800 }),
});

const evidenceItemSchema = obj({
  sourceType: enums(["site", "profile", "source", "indexed-page"] as const),
  url: optionalString({ maxLength: 2048 }),
  title: optionalString({ maxLength: 400 }),
  trustScore: optNul(num({ min: 0, max: 100 })),
});

const briefItemSchema = obj({
  scheduledFor: str(),
  channel: channelSchema,
  contentType: contentTypeSchema,
  newsOrEvergreen: enums(["news", "evergreen"] as const),
  topic: str({ minLength: 3, maxLength: 160 }),
  topicCluster: optionalString({ maxLength: 120 }),
  pillarPage: optionalString({ maxLength: 200 }),
  workingTitle: str({ minLength: 8, maxLength: 300 }),
  finalSuggestedTitle: optionalString({ maxLength: 300 }),
  angle: optionalString({ maxLength: 400 }),
  editorialObjective: optionalString({ maxLength: 300 }),
  primaryIntent: intentSchema,
  secondaryIntents: arr(intentSchema, { maxItems: 3 }),
  funnelStage: funnelStageSchema,
  targetAudience: optionalString({ maxLength: 300 }),
  targetQuery: optionalString({ maxLength: 300 }),
  primaryKeyword: str({ minLength: 2, maxLength: 200 }),
  secondaryKeywords: arr(str({ maxLength: 120 }), { maxItems: 10 }),
  semanticKeywords: arr(str({ maxLength: 120 }), { maxItems: 15 }),
  relatedEntities: arr(str({ maxLength: 120 }), { maxItems: 15 }),
  questionsToAnswer: arr(str({ maxLength: 300 }), { maxItems: 10 }),
  competitorAngle: optionalString({ maxLength: 400 }),
  suggestedSlug: optionalString({ maxLength: 300 }),
  seoTitle: optionalString({ maxLength: 200 }),
  metaDescription: optionalString({ maxLength: 400 }),
  recommendedWordCountMin: num({ integer: true, min: 200, max: 6000 }),
  recommendedWordCountMax: num({ integer: true, min: 200, max: 8000 }),
  outline: arr(outlineItemSchema, { minItems: 3, maxItems: 12 }),
  suggestedInternalLinks: arr(str({ maxLength: 2048 }), { maxItems: 8 }),
  suggestedExternalEvidenceTypes: arr(str({ maxLength: 80 }), { maxItems: 8 }),
  faqCandidates: arr(faqCandidateSchema, { maxItems: 6 }),
  schemaTypes: arr(str({ maxLength: 80 }), { maxItems: 6 }),
  cta: optionalString({ maxLength: 300 }),
  imageConcept: optionalString({ maxLength: 400 }),
  imageRequirements: optionalString({ maxLength: 400 }),
  socialHook: optionalString({ maxLength: 300 }),
  suggestedHashtags: arr(str({ maxLength: 60 }), { maxItems: 10 }),
  freshnessRequirement: enums(["evergreen", "low", "medium", "high"] as const),
  priority: num({ integer: true, min: 1, max: 10 }),
  difficultyEstimate: num({ integer: true, min: 1, max: 10 }),
  opportunityScore: num({ min: 0, max: 100 }),
  relevanceScore: num({ min: 0, max: 100 }),
  cannibalizationRisk: enums(CANNIBALIZATION_RISKS),
  confidence: num({ min: 0, max: 1 }),
  rationale: str({ minLength: 10, maxLength: 800 }),
  sourceEvidence: arr(evidenceItemSchema, { maxItems: 8 }),
});

export const editorialPlanSchemaV2: SchemaDef<{ items: Infer<typeof briefItemSchema>[] }> = obj({
  items: arr(briefItemSchema, { minItems: 1, maxItems: 100 }),
});

export type EditorialPlanBriefV2 = Infer<typeof briefItemSchema>;
export type EditorialPlanOutputV2 = Infer<typeof editorialPlanSchemaV2>;
export type OutlineItem = Infer<typeof outlineItemSchema>;
export type FaqCandidate = Infer<typeof faqCandidateSchema>;
export type EvidenceItem = Infer<typeof evidenceItemSchema>;

// ────────────────────────────────────────────────────────────── Input types

export type PlannerStrategyInput = {
  mode: StrategyMode;
  primaryIntent?: SearchIntent | null;
  contentFormats?: ContentFormat[];
  audience?: string | null;
  market?: string | null;
  language?: string;
  objective?: string | null;
  campaignName?: string | null;
  priorityTopics?: string[];
  excludedTopics?: string[];
  existingCluster?: string | null;
  newCluster?: boolean;
  freeAiDiscovery?: boolean;
  seasonalEvents?: string[];
  brandsOrEntities?: string[];
  keywordSeeds?: string[];
};
