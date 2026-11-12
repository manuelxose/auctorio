import type { EditorialPlan, EditorialPlanItem } from './studio.models';

export type PlanChannel = 'website' | 'x' | 'instagram';

/** Generation settings stored in item.metadata.generation and passed to the writer brief. */
export type PlanItemGenerationSettings = {
  tone?: string | null;
  includeFaq?: boolean | null;
  includeImage?: boolean | null;
  instructions?: string | null;
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
  persisted: boolean;
};

export type PlanningInventory = {
  indexedPages: Array<{ url: string; title: string }>;
  sourceItems: Array<{ url: string; title: string }>;
};
