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
  promo: string;
};
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
