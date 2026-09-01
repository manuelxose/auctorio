// Cascading computation budget (Phase 3).
//
// LEVEL 0  cheap deterministic filters           (0 external calls)
// LEVEL 1  metadata / entity matching            (0 external calls)
// LEVEL 2  cached enrichment                     (provider calls, cached)
// LEVEL 3  embedding / similarity — only when necessary
// LEVEL 4  LLM judgment — only high-value ambiguous candidates
//
// The most expensive model must never run for every feed item.

export const INTELLIGENCE_LEVELS = [0, 1, 2, 3, 4] as const;
export type IntelligenceLevel = (typeof INTELLIGENCE_LEVELS)[number];

export type CostCounters = {
  itemsSeen: number;
  level0Filtered: number;
  level1Processed: number;
  level2Enriched: number;
  level3Similarity: number;
  level4Judged: number;
  aiCalls: number;
  enrichmentCalls: number;
  cacheHits: number;
  cacheMisses: number;
  cacheNegatives: number;
  providerFailures: number;
};

export function createCostCounters(): CostCounters {
  return {
    itemsSeen: 0,
    level0Filtered: 0,
    level1Processed: 0,
    level2Enriched: 0,
    level3Similarity: 0,
    level4Judged: 0,
    aiCalls: 0,
    enrichmentCalls: 0,
    cacheHits: 0,
    cacheMisses: 0,
    cacheNegatives: 0,
    providerFailures: 0,
  };
}

export type LevelPolicy = {
  /** Max items entering level 3 (similarity) per run window. */
  maxLevel3PerRun: number;
  /** Max items entering level 4 (LLM) per run window. */
  maxLevel4PerRun: number;
  /** Max provider calls per run window (hard stop for enrichment). */
  maxEnrichmentCallsPerRun: number;
  /** Max AI calls per run window. */
  maxAiCallsPerRun: number;
};

export const DEFAULT_LEVEL_POLICY: LevelPolicy = {
  maxLevel3PerRun: 50,
  maxLevel4PerRun: 5,
  maxEnrichmentCallsPerRun: 200,
  maxAiCallsPerRun: 10,
};

export function normalizeLevelPolicy(config: unknown): LevelPolicy {
  const source = (config ?? {}) as Partial<Record<keyof LevelPolicy, unknown>>;
  return {
    maxLevel3PerRun: typeof source.maxLevel3PerRun === "number" ? source.maxLevel3PerRun : DEFAULT_LEVEL_POLICY.maxLevel3PerRun,
    maxLevel4PerRun: typeof source.maxLevel4PerRun === "number" ? source.maxLevel4PerRun : DEFAULT_LEVEL_POLICY.maxLevel4PerRun,
    maxEnrichmentCallsPerRun:
      typeof source.maxEnrichmentCallsPerRun === "number" ? source.maxEnrichmentCallsPerRun : DEFAULT_LEVEL_POLICY.maxEnrichmentCallsPerRun,
    maxAiCallsPerRun: typeof source.maxAiCallsPerRun === "number" ? source.maxAiCallsPerRun : DEFAULT_LEVEL_POLICY.maxAiCallsPerRun,
  };
}

export type LevelBudget = {
  counters: CostCounters;
  policy: LevelPolicy;
};

export function createLevelBudget(policy: LevelPolicy = DEFAULT_LEVEL_POLICY): LevelBudget {
  return { counters: createCostCounters(), policy };
}

export function canUseLevel3(budget: LevelBudget): boolean {
  return budget.counters.level3Similarity < budget.policy.maxLevel3PerRun;
}

export function canUseLevel4(budget: LevelBudget): boolean {
  return (
    budget.counters.level4Judged < budget.policy.maxLevel4PerRun &&
    budget.counters.aiCalls < budget.policy.maxAiCallsPerRun
  );
}

export function canUseEnrichment(budget: LevelBudget): boolean {
  return budget.counters.enrichmentCalls < budget.policy.maxEnrichmentCallsPerRun;
}

export function canUseAi(budget: LevelBudget): boolean {
  return budget.counters.aiCalls < budget.policy.maxAiCallsPerRun;
}

export function bumpAiCall(budget: LevelBudget, count = 1): void {
  budget.counters.aiCalls += count;
}

export function bumpEnrichmentCall(budget: LevelBudget, count = 1): void {
  budget.counters.enrichmentCalls += count;
}

/** Merge a subordinate run's counters into a parent report. */
export function mergeCostCounters(into: CostCounters, from: CostCounters): void {
  (Object.keys(from) as Array<keyof CostCounters>).forEach((key) => {
    into[key] += from[key];
  });
}

/** Per-100-item rates for the observability report. */
export function ratesPer100(counters: CostCounters): {
  aiCallsPer100: number;
  enrichmentCallsPer100: number;
  cacheHitRatio: number;
} {
  const scale = counters.itemsSeen > 0 ? 100 / counters.itemsSeen : 0;
  const cacheTotal = counters.cacheHits + counters.cacheMisses;
  return {
    aiCallsPer100: Math.round(counters.aiCalls * scale * 100) / 100,
    enrichmentCallsPer100: Math.round(counters.enrichmentCalls * scale * 100) / 100,
    cacheHitRatio: cacheTotal > 0 ? Math.round((counters.cacheHits / cacheTotal) * 1000) / 1000 : 0,
  };
}
