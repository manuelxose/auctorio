// Intelligence observability (Phase 3): cost, funnel and cache reporting.
// The pipeline must be observable and economically viable at thousands of
// source items per day.

import { Prisma } from "@prisma/client";
import { getPrismaClient } from "../../infrastructure/db/prisma";
import { ratesPer100, type CostCounters } from "./cost-control";
import { VERIFICATION_STATES } from "./verification";
import { CANDIDATE_FUNNEL_STAGES } from "./candidate-scoring";

const prisma = getPrismaClient();

export type IntelligenceReport = {
  windowHours: number;
  generatedAt: string;
  // Items through the pipeline in the window.
  sourceItemsInWindow: number;
  clustered: number;
  enriched: number;
  candidates: number;
  highRelevance: number;
  funnel: Array<{ stage: (typeof CANDIDATE_FUNNEL_STAGES)[number]; count: number }>;
  // Cost counters aggregated from discovery runs.
  counters: CostCounters;
  aiCallsPer100: number;
  enrichmentCallsPer100: number;
  cacheHitRatio: number;
  // Verification distribution.
  verificationStates: Record<string, number>;
  // Cluster quality signals.
  clustersInWindow: number;
  avgSourceDiversity: number;
};

function readCounter(json: Prisma.JsonValue | null, key: string): number {
  if (!json || typeof json !== "object" || Array.isArray(json)) {
    return 0;
  }
  const value = (json as Record<string, unknown>)[key];
  return typeof value === "number" ? value : 0;
}

export async function buildIntelligenceReport(
  tenantId: string,
  options: { windowHours?: number } = {},
): Promise<IntelligenceReport> {
  const windowHours = Math.max(1, options.windowHours ?? 24);
  const since = new Date(Date.now() - windowHours * 3_600_000);

  const [runs, itemsInWindow, clustersInWindow, candidates, highRelevance, verificationRows, enriched] =
    await Promise.all([
      prisma.discoveryRun.findMany({
        where: { tenantId, startedAt: { gte: since } },
        select: { costCounters: true },
      }),
      prisma.sourceItem.count({ where: { tenantId, discoveredAt: { gte: since } } }),
      prisma.storyCluster.count({ where: { tenantId, lastSeenAt: { gte: since } } }),
      prisma.storyCluster.count({ where: { tenantId, lastSeenAt: { gte: since }, candidateScore: { gte: 0.4 } } }),
      prisma.storyCluster.count({ where: { tenantId, lastSeenAt: { gte: since }, candidateScore: { gte: 0.6 } } }),
      prisma.storyCluster.groupBy({
        by: ["verificationState"],
        where: { tenantId, lastSeenAt: { gte: since } },
        _count: { _all: true },
      }),
      prisma.storyCluster.aggregate({
        where: { tenantId, lastSeenAt: { gte: since }, enrichedAt: { not: null } },
        _avg: { sourceDiversity: true },
      }),
    ]);

  const counters: CostCounters = {
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
  for (const run of runs) {
    counters.itemsSeen += readCounter(run.costCounters, "itemsSeen");
    counters.level0Filtered += readCounter(run.costCounters, "level0Filtered");
    counters.level1Processed += readCounter(run.costCounters, "level1Processed");
    counters.level2Enriched += readCounter(run.costCounters, "level2Enriched");
    counters.level3Similarity += readCounter(run.costCounters, "level3Similarity");
    counters.level4Judged += readCounter(run.costCounters, "level4Judged");
    counters.aiCalls += readCounter(run.costCounters, "aiCalls");
    counters.enrichmentCalls += readCounter(run.costCounters, "enrichmentCalls");
    counters.cacheHits += readCounter(run.costCounters, "cacheHits");
    counters.cacheMisses += readCounter(run.costCounters, "cacheMisses");
    counters.cacheNegatives += readCounter(run.costCounters, "cacheNegatives");
    counters.providerFailures += readCounter(run.costCounters, "providerFailures");
  }
  // When no run counters exist yet (fresh install), fall back to item counts.
  if (counters.itemsSeen === 0) {
    counters.itemsSeen = itemsInWindow;
    counters.level1Processed = itemsInWindow;
    counters.level2Enriched = enriched._avg.sourceDiversity !== null ? clustersInWindow : 0;
  }

  const rates = ratesPer100(counters);

  const verificationStates: Record<string, number> = {};
  for (const state of VERIFICATION_STATES) {
    verificationStates[state] = 0;
  }
  for (const row of verificationRows) {
    if (typeof row.verificationState === "string") {
      verificationStates[row.verificationState] = row._count._all;
    }
  }

  return {
    windowHours,
    generatedAt: new Date().toISOString(),
    sourceItemsInWindow: itemsInWindow,
    clustered: clustersInWindow,
    enriched: enriched._avg.sourceDiversity !== null ? clustersInWindow : 0,
    candidates,
    highRelevance,
    funnel: [
      { stage: "source_items", count: itemsInWindow },
      { stage: "level0_filtered", count: counters.level0Filtered },
      { stage: "clustered", count: clustersInWindow },
      { stage: "enriched", count: counters.level2Enriched },
      { stage: "scored_candidates", count: candidates },
      { stage: "high_relevance", count: highRelevance },
    ],
    counters,
    aiCallsPer100: rates.aiCallsPer100,
    enrichmentCallsPer100: rates.enrichmentCallsPer100,
    cacheHitRatio: rates.cacheHitRatio,
    verificationStates,
    clustersInWindow,
    avgSourceDiversity: Math.round((enriched._avg.sourceDiversity ?? 0) * 100) / 100,
  };
}
