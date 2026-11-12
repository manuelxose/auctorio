// Mirrors src/studio/onboarding/orchestrator.ts and src/studio/site-intelligence/strategy.ts.

export type OnboardingStepId = 'index' | 'profile' | 'sources' | 'competitors' | 'strategy' | 'first_plan_offer';
export type OnboardingStepStatus = 'pending' | 'running' | 'succeeded' | 'failed' | 'skipped';

export type OnboardingStepState = {
  id: OnboardingStepId;
  status: OnboardingStepStatus;
  summary: string | null;
  counts: Record<string, number> | null;
  error: string | null;
  startedAt: string | null;
  finishedAt: string | null;
};

export type OnboardingRun = {
  id: string;
  siteId: string;
  operationId: string | null;
  status: 'running' | 'succeeded' | 'failed';
  trigger: string;
  steps: OnboardingStepState[];
  completedSteps: number;
  totalSteps: number;
  currentStep: OnboardingStepId | null;
  retryFrom: OnboardingStepId | null;
  startedAt: string;
  finishedAt: string | null;
  updatedAt: string;
};

export type OnboardingResponse = {
  run: OnboardingRun | null;
  operation: { id: string; status: string; progress: number; phase: string | null; errorSummary: string | null } | null;
};

export type StrategyPillar = {
  name: string;
  description: string | null;
  subtopics: string[];
  keywords: string[];
  weight: number;
  included: boolean;
  clusterSlug: string | null;
};

export type StrategyConfig = {
  description: string | null;
  primaryAudience: string | null;
  languages: string[];
  markets: string[];
  pillars: StrategyPillar[];
  priorityCategories: string[];
  excludedTopics: string[];
  writingStyle: string | null;
  preferredFormats: string[];
  searchIntents: string[];
  seoObjectives: string[];
  sourcePolicy: string | null;
  cadenceNotes: string | null;
  editorialRestrictions: string[];
  internalLinkingRules: string[];
};

export type StrategyField = keyof StrategyConfig;
export type Provenance = 'approved' | 'suggested' | 'none';

export type DetectedEvidence = {
  profileVersion: number;
  indexedAt: string | null;
  pageCount: number;
  siteType: string | null;
  language: string | null;
  audience: string | null;
  brandSummary: string | null;
  tone: string | null;
  commonArticleLength: number | null;
  mainTopics: string[];
  categories: string[];
  contentTypes: Array<{ type: string; count: number }>;
  clusters: Array<{ name: string; slug: string; pagesCount: number; keywords: string[] }>;
};

export type StrategyLayers = {
  siteId: string;
  detected: DetectedEvidence | null;
  suggested: { config: StrategyConfig; source: string; generatedAt: string; evidence: Record<string, string> } | null;
  approved: { config: StrategyConfig; version: number; approvedAt: string | null; approvedByUserId: string | null } | null;
  effective: StrategyConfig;
  provenance: Record<StrategyField, Provenance>;
  /** Aligned with effective.pillars. */
  pillarProvenance: Provenance[];
};

export type StrategyVersion = {
  version: number;
  note: string | null;
  restoredFromVersion: number | null;
  createdByUserId: string | null;
  createdAt: string;
  config: StrategyConfig;
};

export type ClusterCoverage = {
  cluster: { name: string; slug: string; pagesCount: number; keywords: string[] };
  pillar: { name: string; included: boolean; provenance: Provenance } | null;
  subtopicSource: 'approved' | 'suggested' | 'detected';
  pages: Array<{ url: string; title: string | null; crawlState: string; modifiedAt: string | null }>;
  coverage: Array<{ subtopic: string; pagesCovering: number; sample: Array<{ url: string; title: string | null }> }>;
  gaps: string[];
  proposalsUrl: string;
};

export type PillarPatch = {
  clusterSlug?: string | null;
  name?: string;
  description?: string | null;
  keywords?: string[];
  subtopics?: string[];
  included?: boolean;
  weight?: number;
};
