import type { EditorialPlan, EditorialPlanItem } from './studio.models';

export type PlanChannel = 'website' | 'x' | 'instagram' | 'facebook';

/** Generation settings stored in item.metadata.generation and passed to the writer brief. */
export type PlanItemGenerationSettings = {
  tone?: string | null;
  includeFaq?: boolean | null;
  includeImage?: boolean | null;
  instructions?: string | null;
  referenceUrl?: string | null;
};

export type PlanKeywordsResult = {
  created: Array<{ id: string; keyword: string; scheduledFor: string }>;
  dropped: Array<{ keyword: string; reason: 'duplicate' | 'variant' | 'already_planned' | 'off_topic' }>;
  /** Kept but no free slot in the next 120 days. */
  unscheduled: string[];
};

export type PlanOutlineEntry = { heading: string; subpoints?: string[] };
export type PlanEvidenceEntry = { title: string; url?: string; sourceType?: string };

/** The plan item as the backend returns it (studio.models' type plus fields the drawer edits). */
export type PlanItem = EditorialPlanItem & {
  planId?: string;
  siteId?: string | null;
  priority?: number;
  notes?: string | null;
  audience?: string | null;
  metadata?: { generation?: PlanItemGenerationSettings } & Record<string, unknown> | null;
};

export type PlanDetail = Omit<EditorialPlan, 'items'> & { items?: PlanItem[]; configuration?: Record<string, unknown> | null };

export type PlanGenerationAccepted = {
  planId: string;
  operationId: string;
  status: 'generating';
  expectedCount: number;
  skippedPast?: Array<{ localDate: string; localTime: string }> | number;
  timezone?: string;
};

export type PlanPreset = {
  id: string;
  siteId: string | null;
  name: string;
  payload: GeneratorPresetPayload;
  createdAt: string;
  updatedAt: string;
};

/** What a preset stores: the generator's cadence and strategy (never site or dates). */
export type GeneratorPresetPayload = {
  articlesPerDay?: number;
  weekdays?: number[];
  publishTimes?: string[];
  channels?: PlanChannel[];
  strategyMode?: string;
  primaryIntent?: string;
  contentFormats?: string[];
  campaignName?: string;
  market?: string;
  objective?: string;
  audience?: string;
  topics?: string[];
  excludedTopics?: string[];
  keywordSeeds?: string[];
  seasonalEvents?: string[];
};

export type SitePlanningSettings = {
  siteId: string;
  timezone: string;
  articlesPerDay: number;
  weekdays: number[];
  publishTimes: string[];
  channels: PlanChannel[];
  defaultPresetId: string | null;
  /** Site override of the guide template (src/studio/editorial-engine/structure.ts); null = defaults. */
  articleTargets?: ArticleTargetsOverride | null;
  persisted: boolean;
};

export type ArticleSectionKey = 'summary' | 'toc' | 'faq' | 'sources' | 'jsonLd' | 'furtherReading' | 'cta' | 'linkCard' | 'promo' | 'contactCard' | 'mapCard';
export type ArticleTargetsOverride = { words?: number; internalLinks?: number; externalLinks?: number; images?: number; faqCount?: number; sections?: Partial<Record<ArticleSectionKey, boolean>>; writing?: WritingSettings; brand?: BrandSettings; visuals?: VisualSettings };

/** Mirrors visuals.ts VisualSettings. */
export type ImageStyle = 'realistic' | 'illustration' | 'editorial' | 'minimal';
export type VisualSettings = {
  imageInstructions: string;
  coverStyle: ImageStyle;
  bodyStyle: ImageStyle | 'media_library';
  infographic: boolean;
  youtube: { enabled: boolean; channelOnly: boolean; channelUrl: string };
};

/** Mirrors brand.ts BrandSettings (CTAs, business details, branding). */
export type BrandSettings = {
  logoUrl: string;
  primaryColor: string;
  secondaryColor: string;
  positioning: string;
  audience: string[];
  location: { country: string; cities: string[] };
  offers: Array<{ name: string; price: string; url: string }>;
  blogPath: string;
  linkCard: { headline: string; text: string; url: string; buttonText: string };
  contactCard: { headline: string; text: string; email: string; phone: string; url: string; buttonText: string };
  mapCard: { headline: string; address: string; url: string };
  cardStyle: 'classic' | 'editorial' | 'soft' | 'minimal' | 'bold' | 'ink' | 'frame';
  cardCorners: 'rounded' | 'square';
  promo: string;
};
/** Palette and logo read from the site's own pages (server crawl); null when the site could not be read. */
export type DetectedBrand = { source: string | null; detected: { primaryColor: string; secondaryColor: string; logoUrl: string } | null };
export type ArticleTargets = { words: number; internalLinks: number; externalLinks: number; images: number; faqCount: number; sections: Record<ArticleSectionKey, boolean> };

/** Mirrors structure.ts WritingSettings ("Customize future articles"). */
export type WritingSettings = {
  instructions: string[];
  length: 'dynamic' | 'short' | 'medium' | 'long';
  authorPerspective: boolean;
  citations: boolean;
  mentionCompetitors: boolean;
  summaryVariant: 'tldr' | 'key_takeaways';
  internalLinks: { enabled: boolean; www: boolean; trailingSlash: boolean };
  disclaimer: string;
};

export type PlanningInventory = {
  indexedPages: Array<{ url: string; title: string }>;
  sourceItems: Array<{ url: string; title: string }>;
};

// ── Plan del mes (mirrors keyword-candidates.ts KeywordResearch, autopilot-plan.ts getMonthPlan, plan-item-keyword.ts) ──

export type KeywordOrigin = { kind: 'opportunity' | 'site_topic' | 'cluster' | 'competitor'; value: string };
export type KeywordScoreParts = { demand: number; winnability: number; relevance: number; intentFit: number };
export type KeywordRejectReason = 'no_volume' | 'already_ranking' | 'off_topic' | 'low_relevance' | 'cannibalization' | 'no_score';
export type KeywordCandidate = { keyword: string; volume: number | null; difficulty: number | null; intent: string | null; score: number; variants: string[]; origin: KeywordOrigin | null; parts: KeywordScoreParts | null; rank: number };
export type PlanResearch = {
  id: string;
  at: string;
  provider: 'dataforseo' | null;
  skipped: 'not_configured' | 'unsupported_market' | 'provider_error' | 'no_data' | null;
  market: string | null;
  seeds: Array<{ keyword: string; origin: string }>;
  competitors: string[];
  ownRankingKeywords: number;
  reachableDifficulty: number;
  rows: number;
  failedCalls: number;
  lastError?: string | null;
  candidates: KeywordCandidate[];
  rejected: Partial<Record<KeywordRejectReason, number>>;
  rejectedSample: Array<{ keyword: string; reason: KeywordRejectReason; volume: number | null }>;
  strategy: { mode: string; priorityTopics: string[]; excludedTopics: string[]; approvedVersion: number | null; pillars: string[]; siteIntelligenceVersion: number | null };
};
export type PlanItemSelection = { source: 'dataforseo' | 'model' | 'user'; researchId: string | null; score: number | null; rank: number | null; intent: string | null; parts: KeywordScoreParts | null; origin: KeywordOrigin | null };

export type MonthPlanItem = {
  id: string;
  planId: string;
  planName: string;
  title: string;
  primaryKeyword: string | null;
  searchVolume: number | null;
  keywordDifficulty: number | null;
  opportunityScore: number | null;
  status: string;
  scheduledFor: string | null;
  projectId: string | null;
  source: PlanItemSelection['source'] | null;
};
export type MonthPlan = {
  horizonDays: number;
  timezone: string;
  dateFrom: string;
  dateTo: string;
  mode: string;
  automationActive: boolean;
  leadMinutes: number;
  metricsProvider: boolean;
  articlesPerDay: number;
  expectedSlots: number;
  missing: Array<{ localDate: string; localTime: string }>;
  outsideWindows: number;
  siteIntelligence: boolean;
  budgetBlocked: string | null;
  generating: { planId: string; planName: string; completed: number; total: number } | null;
  lastRun: { status: string; at: string; error: string | null } | null;
  items: MonthPlanItem[];
  plans: Array<{ id: string; name: string; status: string; research: PlanResearch | null }>;
};
export type MonthPlanStart = { started: boolean; reason: string; planId?: string; operationId?: string; slots?: number };
export type PlanItemSelectionView = {
  item: { id: string; title: string; primaryKeyword: string | null; scheduledFor: string | null; status: string; searchVolume: number | null; keywordDifficulty: number | null; rationale: string | null; sourceEvidence: unknown };
  plan: { id: string; name: string; status: string };
  selection: PlanItemSelection | null;
  research: PlanResearch | null;
  history: Array<{ from: string | null; to: string; at: string; by: string | null }>;
  lockedReason: 'has_article' | 'being_written' | 'closed' | null;
  changeableUntil: string | null;
  alternatives: KeywordCandidate[];
};
