// Intelligence pipeline (Phase 3): the cascading computation that turns raw
// source items into explainable editorial candidates.
//
//   L0 cheap deterministic filters  → mute rules, length, language
//   L1 entity extraction + facts    → generic + domain plugins (no calls)
//   L2 clustering                   → deterministic multi-signal
//   L3 enrichment                   → cached provider metadata only
//   L4 semantic similarity / judge  → only for ambiguous high-value items
//
// Every step is observable and budgeted.

import { Prisma } from "@prisma/client";
import { getPrismaClient } from "../../infrastructure/db/prisma";
import { extractEntitiesFromText, mergeExtractions } from "../entities/extraction";
import { storeEntityExtractions, listEntitiesForItem, listEntitiesForCluster } from "../entities/store";
import type { EntityExtraction } from "../entities/model";
import { getDomainPlugin, listDomainPlugins } from "../domains/plugin";
import { registerMovieTvPlugin } from "../domains/movie-tv/plugin";
import { extractFactsFromItem, upsertStoryFacts, summarizeClusterFacts, refreshClusterVerification, DEVELOPING_WINDOW_HOURS, type VerificationInput } from "./verification";
import { computeSourceDiversity, publisherGroupKey, type DiversityInput } from "./source-diversity";
import {
  clusterSourceItemMultiSignal,
  assignClusterAndRefresh,
  listClusterCandidates,
  type ClusterEntitySignal,
} from "./story-clustering";
import { scoreCandidate, CANDIDATE_WEIGHTS, type CandidateScoreResult } from "./candidate-scoring";
import { scoreSiteFit, getSiteEditorialProfile, type SiteEditorialProfile } from "./site-editorial-profile";
import { getAiJudge } from "./ai-judge";
import { getIntelligenceSettings, resolveDomainsForSite } from "./intelligence-settings";
import {
  createCostCounters,
  createLevelBudget,
  mergeCostCounters,
  canUseLevel4,
  canUseAi,
  bumpAiCall,
  type CostCounters,
  type LevelBudget,
  type IntelligenceLevel,
} from "./cost-control";
import { createProviderCacheStats, type ProviderCacheStats } from "../enrichment/provider-cache";
import { titleSimilarity } from "../editorial";

const prisma = getPrismaClient();

registerMovieTvPlugin();

/** Minimum deterministic similarity for the judge to even consider a merge. */
export const JUDGE_SIMILARITY_FLOOR = 0.35;

export type PipelineOptions = {
  budget?: LevelBudget;
  stats?: ProviderCacheStats;
  now?: Date;
  /** Callback per item (observability). */
  onStep?: (step: string, detail: Record<string, unknown>) => void;
};

export type PipelineItemResult = {
  itemId: string;
  clusterId: string | null;
  maxLevel: IntelligenceLevel;
  filtered: boolean;
  filteredReason: string | null;
  rejected: boolean;
  candidateScore: number | null;
  verificationState: string | null;
  counters: CostCounters;
};

function bumpMaxLevel(result: PipelineItemResult, level: IntelligenceLevel): void {
  if (level > result.maxLevel) {
    result.maxLevel = level;
  }
}

type ItemWithSource = {
  id: string;
  tenantId: string;
  sourceId: string;
  clusterId: string | null;
  title: string;
  description: string | null;
  rawText: string | null;
  cleanedText: string | null;
  publishedAt: Date | null;
  modifiedAt: Date | null;
  discoveredAt: Date;
  updatedAt: Date;
  categories: Prisma.JsonValue | null;
  language: string | null;
  normalizedTitleHash: string | null;
  score: number | null;
  processingStatus: string;
  externalId: string;
  canonicalUrl: string | null;
  sourceUrl: string | null;
  source: {
    domain: string | null;
    name: string;
    siteId: string | null;
    trustScore: number;
    authorityScore: number;
    categories: Prisma.JsonValue | null;
  };
};

async function loadItem(tenantId: string, itemId: string): Promise<ItemWithSource | null> {
  return prisma.sourceItem.findFirst({
    where: { id: itemId, tenantId },
    include: {
      source: {
        select: { domain: true, name: true, siteId: true, trustScore: true, authorityScore: true, categories: true },
      },
    },
  }) as Promise<ItemWithSource | null>;
}

export type MuteCheck = { muted: boolean; kind: string | null; value: string | null };

/** L0: active mute rules (topic / source). */
export async function checkMuteRules(tenantId: string, item: ItemWithSource): Promise<MuteCheck> {
  const rules = await prisma.muteRule.findMany({
    where: { tenantId, active: true },
    select: { kind: true, value: true },
  });
  const haystack = `${item.title} ${Array.isArray(item.categories) ? item.categories.map(String).join(" ") : ""}`.toLowerCase();
  for (const rule of rules) {
    if (rule.kind === "topic" && haystack.includes(rule.value.toLowerCase())) {
      return { muted: true, kind: "topic", value: rule.value };
    }
    if (rule.kind === "source" && (rule.value === item.sourceId || rule.value === item.source.domain || rule.value === item.source.name)) {
      return { muted: true, kind: "source", value: rule.value };
    }
  }
  return { muted: false, kind: null, value: null };
}

export async function loadClusterDiversityInputs(tenantId: string, clusterId: string): Promise<DiversityInput[]> {
  const members = await prisma.sourceItem.findMany({
    where: { tenantId, clusterId },
    select: {
      id: true,
      title: true,
      contentHash: true,
      source: { select: { domain: true, name: true } },
    },
  });
  return members.map((member) => ({
    itemId: member.id,
    sourceDomain: member.source.domain,
    sourceName: member.source.name,
    contentHash: member.contentHash,
    title: member.title,
  }));
}

function itemText(item: ItemWithSource): string {
  return item.cleanedText ?? item.rawText ?? item.description ?? "";
}

/** Read "year:YYYY" evidence left by domain extraction (deterministic). */
export function readEvidenceYear(evidence: unknown): number | null {
  if (!Array.isArray(evidence)) {
    return null;
  }
  for (const entry of evidence) {
    if (entry && typeof entry === "object" && typeof (entry as Record<string, unknown>).match === "string") {
      const match = String((entry as Record<string, unknown>).match);
      const parsed = /^year:(\d{4})$/.exec(match.trim());
      if (parsed) {
        return Number.parseInt(parsed[1], 10);
      }
    }
  }
  return null;
}

/** Run the full cascade for one source item. */
export async function runIntelligencePipelineForItem(
  tenantId: string,
  itemId: string,
  options: PipelineOptions = {},
): Promise<PipelineItemResult> {
  const now = options.now ?? new Date();
  const item = await loadItem(tenantId, itemId);
  const result: PipelineItemResult = {
    itemId,
    clusterId: null,
    maxLevel: 0,
    filtered: false,
    filteredReason: null,
    rejected: false,
    candidateScore: null,
    verificationState: null,
    counters: createCostCounters(),
  };
  if (!item) {
    result.filtered = true;
    result.filteredReason = "item_not_found";
    return result;
  }

  const settings = await getIntelligenceSettings(tenantId);
  const budget = options.budget ?? createLevelBudget(settings.levelPolicy);
  const stats = options.stats ?? createProviderCacheStats();
  const step = (name: string, detail: Record<string, unknown> = {}) => options.onStep?.(name, detail);

  result.counters.itemsSeen = 1;

  // ── L0: cheap deterministic filters ──────────────────────────────────────
  const mute = await checkMuteRules(tenantId, item);
  if (mute.muted) {
    result.filtered = true;
    result.rejected = true;
    result.filteredReason = `muted_${mute.kind}:${mute.value}`;
    result.counters.level0Filtered = 1;
    await prisma.sourceItem.update({
      where: { id: item.id },
      data: { processingStatus: "rejected", intelligenceProcessedAt: now },
    });
    step("l0_filtered", { reason: result.filteredReason });
    return result;
  }
  if (item.title.trim().length < 12) {
    result.filtered = true;
    result.filteredReason = "title_too_short";
    result.counters.level0Filtered = 1;
    await prisma.sourceItem.update({
      where: { id: item.id },
      data: { intelligenceProcessedAt: now },
    });
    step("l0_filtered", { reason: result.filteredReason });
    return result;
  }

  // Site profile (never re-crawls; compact persisted representation).
  let siteProfile: SiteEditorialProfile | null = null;
  if (item.source.siteId) {
    siteProfile = await getSiteEditorialProfile(tenantId, item.source.siteId);
  }
  const domains = resolveDomainsForSite(
    settings,
    siteProfile?.topics ?? [],
    siteProfile?.categories ?? [],
  );

  // ── L1: entity extraction (generic + enabled domains) ────────────────────
  const genericExtractions = extractEntitiesFromText({
    title: item.title,
    description: item.description,
    text: itemText(item),
  });
  let extractions: EntityExtraction[] = [...genericExtractions];

  const pluginContext = {
    tenantId,
    siteId: item.source.siteId,
    siteProfile,
    budget,
    stats,
    now,
  };
  for (const domain of domains) {
    const plugin = getDomainPlugin(domain);
    if (!plugin) {
      continue;
    }
    const domainResult = plugin.extractEntities(
      {
        title: item.title,
        description: item.description,
        text: itemText(item),
        publishedAt: item.publishedAt,
      },
      pluginContext,
    );
    extractions = extractions.concat(domainResult.extractions);
  }
  extractions = mergeExtractions(extractions);
  const entityRows = await storeEntityExtractions(tenantId, item.id, extractions, 1);
  result.counters.level1Processed = 1;
  bumpMaxLevel(result, 1);
  step("l1_entities", { count: entityRows.length, domains });

  const entitySignals: ClusterEntitySignal[] = (await listEntitiesForItem(tenantId, item.id)).map((row) => ({
    key: `${row.entity.domain}:${row.entity.type}:${row.entity.name.toLowerCase()}`,
    type: row.entity.type,
    name: row.entity.name,
    externalIds:
      row.entity.externalIds && typeof row.entity.externalIds === "object" && !Array.isArray(row.entity.externalIds)
        ? (row.entity.externalIds as Record<string, string>)
        : {},
  }));

  // ── L2: multi-signal clustering ──────────────────────────────────────────
  const assignment = await clusterSourceItemMultiSignal(tenantId, {
    id: item.id,
    title: item.title,
    description: item.description,
    sourceId: item.sourceId,
    clusterId: item.clusterId,
    discoveredAt: item.discoveredAt,
    publishedAt: item.publishedAt,
    categories: item.categories,
    language: item.language,
    normalizedTitleHash: item.normalizedTitleHash,
    entitySignals,
  });
  const assigned = await assignClusterAndRefresh(tenantId, item, assignment);
  let clusterId = assigned.clusterId;
  const created = assigned.created;
  result.clusterId = clusterId;
  bumpMaxLevel(result, 2);
  step("l2_clustered", { clusterId, created, matchedBy: assignment.signals?.matchedBy ?? "none" });

  // Fact ledger for this item.
  await upsertStoryFacts({
    tenantId,
    clusterId,
    source: {
      itemId: item.id,
      sourceUrl: item.canonicalUrl ?? item.sourceUrl,
      publisher: item.source.name,
      sourceDomain: item.source.domain,
    },
    facts: extractFactsFromItem({
      title: item.title,
      description: item.description,
      publishedAt: item.publishedAt,
      language: item.language,
      externalId: item.externalId,
    }),
  });

  // ── L3: cached domain enrichment (only entities the plugins own) ────────
  for (const domain of domains) {
    const plugin = getDomainPlugin(domain);
    if (!plugin) {
      continue;
    }
    const pluginEntities = (await listEntitiesForItem(tenantId, item.id))
      .filter((row) => row.entity.domain === plugin.domain)
      .map((row) => ({ id: row.entityId, type: row.entity.type, name: row.entity.name }));
    if (pluginEntities.length === 0) {
      continue;
    }
    const outcome = await plugin.enrichEntities(pluginEntities, pluginContext);
    mergeCostCounters(result.counters, {
      itemsSeen: 0,
      level0Filtered: 0,
      level1Processed: 0,
      level2Enriched: outcome.enrichmentCalls > 0 ? 1 : 0,
      level3Similarity: 0,
      level4Judged: 0,
      aiCalls: outcome.aiCalls,
      enrichmentCalls: outcome.enrichmentCalls,
      cacheHits: stats.hits + stats.staleHits,
      cacheMisses: stats.misses,
      cacheNegatives: stats.negatives,
      providerFailures: 0,
    });
    if (outcome.enrichmentCalls > 0 || outcome.cacheHits > 0) {
      bumpMaxLevel(result, 3);
    }
  }

  // Domain-derived facts (conflict-sensitive): release years from extracted
  // work entities (evidence carries "year:YYYY") or provider enrichments,
  // each with source evidence.
  const itemEntityRows = await listEntitiesForItem(tenantId, item.id);
  const releaseYearFacts: Array<{ factKey: string; statement: string; confidence: number; evidenceRef: string }> = [];
  for (const row of itemEntityRows) {
    const workType = row.entity.type === "movie" || row.entity.type === "tv_series" || row.entity.type === "creative_work";
    if (!workType) {
      continue;
    }
    let year: number | null = readEvidenceYear(row.evidence);
    if (year === null) {
      const enrichments = await prisma.providerEnrichment.findMany({
        where: { tenantId, entityId: row.entityId },
        select: { releaseDate: true },
        take: 1,
      });
      year = enrichments.length > 0 && enrichments[0].releaseDate ? enrichments[0].releaseDate.getUTCFullYear() : null;
    }
    if (year !== null) {
      releaseYearFacts.push({
        factKey: "release_year",
        statement: String(year),
        confidence: 0.85,
        evidenceRef: `${row.entity.name}:${year}`,
      });
      break;
    }
  }
  if (releaseYearFacts.length > 0) {
    await upsertStoryFacts({
      tenantId,
      clusterId,
      source: {
        itemId: item.id,
        sourceUrl: item.canonicalUrl ?? item.sourceUrl,
        publisher: item.source.name,
        sourceDomain: item.source.domain,
      },
      facts: releaseYearFacts,
    });
  }

  // ── L4: AI judge only for high-value ambiguous candidates ────────────────
  // Fires only when deterministic signals left a high-value item in its own
  // cluster while a similar recent cluster exists in the ambiguity zone.
  const highValue = (item.score ?? 0) >= 0.7;
  let aiJudgeVerdict: Record<string, unknown> | null = null;
  if (highValue && settings.aiJudge.enabled && canUseLevel4(budget) && canUseAi(budget) && created) {
    const candidates = await listClusterCandidates(tenantId);
    let judgeCandidate: { clusterId: string; titles: string[]; similarity: number } | null = null;
    for (const candidate of candidates) {
      if (candidate.id === clusterId) {
        continue;
      }
      const similarity = Math.max(
        ...candidate.items.map((member) => titleSimilarity(item.title, member.title)),
        titleSimilarity(item.title, candidate.headline),
      );
      if (similarity >= JUDGE_SIMILARITY_FLOOR && (!judgeCandidate || similarity > judgeCandidate.similarity)) {
        judgeCandidate = {
          clusterId: candidate.id,
          titles: candidate.items.slice(0, 10).map((member) => member.title),
          similarity,
        };
      }
    }
    if (judgeCandidate) {
      const judge = getAiJudge(settings.aiJudge);
      const verdict = await judge.judge({
        question: "merge",
        itemTitle: item.title,
        candidateTitles: judgeCandidate.titles.filter((title) => title !== item.title),
        entityNames: entitySignals.map((entity) => entity.name),
        context: `deterministic similarity ${Math.round(judgeCandidate.similarity * 100)}% is below the merge threshold`,
      });
      bumpAiCall(budget);
      result.counters.aiCalls += 1;
      result.counters.level4Judged = 1;
      bumpMaxLevel(result, 4);
      aiJudgeVerdict = { verdict: verdict.decision, confidence: verdict.confidence, reasoning: verdict.reasoning, at: now.toISOString() };
      if (verdict.decision === "merge" && verdict.confidence >= 0.6) {
        await prisma.sourceItem.update({
          where: { id: item.id },
          data: { clusterId: judgeCandidate.clusterId },
        });
        await prisma.storyFact.updateMany({
          where: { tenantId, itemId: item.id },
          data: { clusterId: judgeCandidate.clusterId },
        });
        const { refreshClusterAggregates } = await import("../editorial");
        await refreshClusterAggregates(judgeCandidate.clusterId);
        await refreshClusterAggregates(clusterId);
        // The now-empty cluster the item just left is superseded.
        await prisma.storyCluster.update({
          where: { id: clusterId },
          data: { status: "superseded" },
        });
        clusterId = judgeCandidate.clusterId;
        result.clusterId = clusterId;
      }
      step("l4_judged", { verdict: verdict.decision, confidence: verdict.confidence });
    }
  }

  // ── Diversity + verification refresh ─────────────────────────────────────
  const members = await loadClusterDiversityInputs(tenantId, clusterId);
  const diversity = computeSourceDiversity(members);
  const factSummary = await summarizeClusterFacts(tenantId, clusterId);

  const recentUpdates = await prisma.sourceItem.count({
    where: {
      tenantId,
      clusterId,
      OR: [
        { modifiedAt: { gte: new Date(now.getTime() - DEVELOPING_WINDOW_HOURS * 3_600_000) } },
        { extractionStatus: "updated", updatedAt: { gte: new Date(now.getTime() - DEVELOPING_WINDOW_HOURS * 3_600_000) } },
      ],
    },
  });
  const verificationInput: VerificationInput = {
    independentPublishers: diversity.independentPublishers,
    factCount: factSummary.factCount,
    conflictingFacts: factSummary.conflictingFacts,
    corroboratedFacts: factSummary.corroboratedFacts,
    developing: created ? false : recentUpdates > 0,
  };
  const verification = await refreshClusterVerification(tenantId, clusterId, verificationInput);
  result.verificationState = verification.state;

  await prisma.storyCluster.update({
    where: { id: clusterId },
    data: {
      sourceDiversity: diversity.independentPublishers,
      diversityDetail: diversity.detail as Prisma.InputJsonValue,
      metadata: {
        cluster_entities: (await listEntitiesForCluster(tenantId, clusterId)).slice(0, 30).map((row) => ({
          key: `${row.entity.domain}:${row.entity.type}:${row.entity.name.toLowerCase()}`,
          type: row.entity.type,
          name: row.entity.name,
          externalIds:
            row.entity.externalIds && typeof row.entity.externalIds === "object" && !Array.isArray(row.entity.externalIds)
              ? row.entity.externalIds
              : {},
        })),
        ...(aiJudgeVerdict ? { ai_judge: aiJudgeVerdict } : {}),
      } as Prisma.InputJsonValue,
    },
  });

  // ── Candidate scoring (transparent components) ───────────────────────────
  const entityRowsForScoring = await listEntitiesForCluster(tenantId, clusterId);
  const siteFit = scoreSiteFit(siteProfile, {
    title: item.title,
    categories: Array.isArray(item.categories) ? item.categories.map(String) : [],
    entityNames: entityRowsForScoring.map((row) => row.entity.name),
    entityTypes: entityRowsForScoring.map((row) => row.entity.type),
    language: item.language,
  });

  const domainRelevance: Array<{ score: number; reason: string }> = [];
  for (const domain of domains) {
    const plugin = getDomainPlugin(domain);
    if (!plugin) {
      continue;
    }
    const signals = plugin.relevanceSignals(
      entityRowsForScoring.map((row) => ({ type: row.entity.type, name: row.entity.name })),
      pluginContext,
    );
    for (const signal of signals) {
      domainRelevance.push({ score: signal.score, reason: signal.reason });
    }
  }

  const coveredSimilarity = siteProfile
    ? siteProfile.existingTitles.reduce((max, title) => Math.max(max, titleSimilarity(item.title, title)), 0)
    : 0;

  const clusterRow = await prisma.storyCluster.findUnique({ where: { id: clusterId } });
  const candidate = scoreCandidate({
    now,
    firstSeenAt: clusterRow?.firstSeenAt ?? now,
    lastSeenAt: clusterRow?.lastSeenAt ?? now,
    memberCount: members.length,
    authorityScore: item.source.authorityScore,
    diversity,
    verificationState: verification.state,
    corroboratedFacts: factSummary.corroboratedFacts,
    entities: entityRowsForScoring.map((row) => ({ name: row.entity.name, type: row.entity.type, confidence: row.confidence })),
    enrichmentCount: await prisma.providerEnrichment.count({ where: { tenantId, entityId: { in: entityRowsForScoring.map((row) => row.entityId) } } }),
    siteFit,
    coveredSimilarity,
    domainRelevance,
  });

  result.candidateScore = candidate.score;
  await prisma.storyCluster.update({
    where: { id: clusterId },
    data: {
      candidateScore: candidate.score,
      scoreComponents: candidate.components.map((component) => ({
        key: component.key,
        weight: CANDIDATE_WEIGHTS[component.key],
        value: component.value,
        detail: component.detail,
      })) as Prisma.InputJsonValue,
      siteFitScore: siteFit.score,
      contentGapScore: siteFit.gapHit ? 1 : 0,
      reasonSelected: [...candidate.reasons, ...domainRelevance.map((signal) => `${signal.reason}:${signal.score}`)].slice(0, 8) as Prisma.InputJsonValue,
      enrichedAt: now,
    },
  });
  step("candidate_scored", { score: candidate.score, components: candidate.components });

  await prisma.sourceItem.update({
    where: { id: item.id },
    data: { intelligenceProcessedAt: now },
  });

  return result;
}

export type { CandidateScoreResult };

/** Persist accumulated pipeline counters onto a discovery run. */
export async function mergeCountersIntoDiscoveryRun(runId: string, counters: CostCounters): Promise<void> {
  const run = await prisma.discoveryRun.findUnique({ where: { id: runId }, select: { costCounters: true } });
  const existing = run?.costCounters && typeof run.costCounters === "object" && !Array.isArray(run.costCounters)
    ? (run.costCounters as Record<string, unknown>)
    : {};
  const merged: Record<string, unknown> = { ...existing };
  for (const [key, value] of Object.entries(counters)) {
    merged[key] = Number(existing[key] ?? 0) + Number(value);
  }
  await prisma.discoveryRun.update({
    where: { id: runId },
    data: { costCounters: merged as Prisma.InputJsonValue },
  });
}
