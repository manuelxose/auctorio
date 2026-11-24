// Data first, AI second: the plan's keywords come from the SEO provider (ideas around the site's own
// topics + keywords accepted competitors rank for), filtered and scored by the app. The model only
// writes the brief for a keyword it is handed.

import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { getPrismaClient } from "../infrastructure/db/prisma";
import { SeoProviderError, normalizeKeyword, type KeywordMetrics } from "../infrastructure/seo/contract";
import { acquireSeo, seoRoute, type SeoRoute } from "./seo-manager";
import { classifyCannibalization, computeSiteRelevanceScore, syntheticProfileForSiteType } from "./site-relevance";
import type { EditorialPlanningContext } from "./editorial-plan-context";
import { structuredEvent } from "../shared/utils/logger";
import { combineFactors, demandFromImpressions, demandFromVolume, defaultSeoProfile, factor, feasibilityFromPosition, intentValue, isSeoProfile, resolveWeights, type SeoProfile, type Weights } from "./seo-intelligence/scoring";

const prisma = getPrismaClient();
// Cost caps per plan: ≤5 seeds + ≤3 competitors → ≤9 calls of ≤100 rows (docs/seo-v2/cost-model.md), reused while fresh.
const MAX_SEEDS = 5;
const MAX_COMPETITORS = 3;
const ROWS_PER_CALL = 100;
/** Below it a keyword is not proposed as new content. */
export const MIN_RELEVANCE = 30;
/** Kept on the plan so an editor can swap a keyword for another measured one. */
export const MAX_STORED_CANDIDATES = 60;
/** Default reachable difficulty when the site's own ranking keywords are unknown. */
export const REACHABLE_DIFFICULTY = 30;

/**
 * Difficulty the site can reach: the 75th percentile of the difficulty of keywords it already ranks for,
 * clamped to 20–60; the default when fewer than 10 are known.
 */
export function reachableDifficultyFor(ownKeywords: KeywordMetrics[]): number {
  const values = ownKeywords.map((item) => item.difficulty).filter((value): value is number => typeof value === "number").sort((a, b) => a - b);
  if (values.length < 10) return REACHABLE_DIFFICULTY;
  return Math.max(20, Math.min(60, values[Math.floor(values.length * 0.75)]));
}

/** Where a candidate came from: a seed of the site's own (keyword ideas) or a competitor that ranks for it. */
export type KeywordOrigin = { kind: "opportunity" | "site_topic" | "cluster" | "competitor" | "search_console"; value: string };
/** The four factors of the score, each 0–1, as they were when the keyword was chosen; null = unknown, left out of the score. */
export type KeywordScoreParts = { demand: number | null; winnability: number | null; relevance: number | null; intentFit: number | null };
/** What Search Console observed for the query on the site itself in the last 28 days. */
export type FirstPartyEvidence = { impressions: number; clicks: number; position: number | null };
export type KeywordCandidate = KeywordMetrics & { score: number; variants: string[]; origin?: KeywordOrigin | null; parts?: KeywordScoreParts; firstParty?: FirstPartyEvidence };
/** How the site values a keyword. */
export type KeywordScoring = { profile: SeoProfile; weights: Weights };
const PUBLISHER: KeywordScoring = { profile: "publisher", weights: resolveWeights("publisher") };

export type KeywordRejectReason = "no_volume" | "already_ranking" | "off_topic" | "low_relevance" | "cannibalization" | "no_score";
export type KeywordReject = { keyword: string; reason: KeywordRejectReason; volume: number | null };

/** What one plan run measured and why it kept or dropped keywords; stored on the plan so the choice can be reviewed. */
export type KeywordResearch = {
  id: string;
  at: string;
  /** null: no provider data was used and the model picked the keywords. */
  provider: string | null;
  skipped: "not_configured" | "disabled" | "unsupported_market" | "provider_error" | "no_data" | null;
  market: string | null;
  seeds: Array<{ keyword: string; origin: "opportunity" | "site_topic" | "cluster" }>;
  competitors: string[];
  ownDomain: string | null;
  ownRankingKeywords: number;
  reachableDifficulty: number;
  rows: number;
  failedCalls: number;
  lastError: string | null;
  candidates: Array<{ keyword: string; volume: number | null; difficulty: number | null; intent: string | null; score: number; variants: string[]; origin: KeywordOrigin | null; parts: KeywordScoreParts | null; firstParty?: FirstPartyEvidence | null; rank: number }>;
  rejected: Partial<Record<KeywordRejectReason, number>>;
  rejectedSample: KeywordReject[];
};

export function emptyKeywordResearch(): KeywordResearch {
  return {
    id: randomUUID(), at: new Date().toISOString(), provider: null, skipped: null, market: null, seeds: [], competitors: [], ownDomain: null,
    ownRankingKeywords: 0, reachableDifficulty: REACHABLE_DIFFICULTY, rows: 0, failedCalls: 0, lastError: null, candidates: [], rejected: {}, rejectedSample: [],
  };
}

/** The factors behind the opportunity score; null when neither a provider nor the site itself shows any demand. */
export function keywordScoreParts(
  input: { volume: number | null; difficulty: number | null; relevance: number | null; intent: string | null; firstParty?: FirstPartyEvidence | null },
  reachableDifficulty = REACHABLE_DIFFICULTY,
  scoring: KeywordScoring = PUBLISHER,
): KeywordScoreParts | null {
  const observed = input.firstParty && input.firstParty.impressions > 0 ? input.firstParty : null;
  if (!(input.volume && input.volume > 0) && !observed) return null;
  // Own impressions are exposure, not market volume: they only speak when nobody measured the volume.
  const demand = input.volume && input.volume > 0 ? demandFromVolume(input.volume) : demandFromImpressions(observed!.impressions);
  // What the site already gets beats a provider's difficulty; without either, reachability is unknown.
  const winnability = observed?.position
    ? feasibilityFromPosition(observed.position)
    : input.difficulty === null
      ? null
      : input.difficulty <= reachableDifficulty ? 1 : Math.max(0.05, 1 - (input.difficulty - reachableDifficulty) / 40);
  return { demand, winnability, relevance: input.relevance === null ? null : Math.max(0, Math.min(1, input.relevance / 100)), intentFit: intentValue(scoring.profile, input.intent) };
}

/** Deterministic opportunity 0–100: weighted geometric mean of the known factors, with the site's own weights. */
export function keywordOpportunityScore(input: Parameters<typeof keywordScoreParts>[0], reachableDifficulty = REACHABLE_DIFFICULTY, scoring: KeywordScoring = PUBLISHER): number {
  const parts = keywordScoreParts(input, reachableDifficulty, scoring);
  if (!parts || parts.relevance === 0) return 0;
  const w = scoring.weights;
  const { score } = combineFactors(
    {
      searchDemand: factor(parts.demand, "provider_reported", ""), rankingFeasibility: factor(parts.winnability, "provider_reported", ""),
      businessRelevance: factor(parts.relevance, "estimated", ""), conversionPotential: factor(parts.intentFit, "estimated", ""),
    },
    { ...w, existingPerformance: 0, topicalAuthority: 0, competitiveEvidence: 0, seasonality: 0, productionEffort: 0, maintenanceCost: 0, cannibalizationRisk: 0, expectedValue: 0 },
  );
  return score ?? 0;
}

/** The site's scoring profile and weights; its type decides while the owner has not. */
export async function keywordScoringFor(tenantId: string, site: { id: string; type: string }, detectedSiteType: string | null): Promise<KeywordScoring> {
  const saved = await prisma.siteSeoProfile.findFirst({ where: { tenantId, siteId: site.id } });
  const profile = isSeoProfile(saved?.profile) ? saved!.profile as SeoProfile : defaultSeoProfile(site.type, detectedSiteType);
  return { profile, weights: resolveWeights(profile, saved?.weights) };
}

/** Beyond it, "already ranking" means an unrelated page showing up: a dedicated one does not compete with it. */
const RANKING_LIMIT = 30;

export const keywordTokens = (keyword: string) =>
  normalizeKeyword(keyword).normalize("NFD").replace(/[̀-ͯ]/g, "").split(/[^a-z0-9ñ]+/).filter((token) => token && !STOPWORDS.has(token));
const STOPWORDS = new Set(["de", "del", "la", "el", "los", "las", "en", "y", "a", "para", "por", "con", "the", "of", "in", "for", "to", "and"]);

/** Same topic, one modifier apart ("programacion la 2" ~ "programación la 2 hoy"); "la 1" vs "la 2" are different topics. */
export function isKeywordVariant(a: string, b: string): boolean {
  const ta = new Set(keywordTokens(a));
  const tb = new Set(keywordTokens(b));
  const [small, large] = ta.size <= tb.size ? [ta, tb] : [tb, ta];
  if (small.size === 0 || large.size - small.size > 1) return false;
  return [...small].every((token) => large.has(token));
}

/** Pure ranking: drop off-topic, cannibalizing and no-demand keywords, score, fold variants into the strongest. */
export function rankKeywordCandidates(
  metrics: Array<KeywordMetrics & { origin?: KeywordOrigin | null; firstParty?: FirstPartyEvidence }>,
  context: Pick<EditorialPlanningContext, "profile" | "site" | "searchTargets" | "existingPlanQueries" | "existingPlanTitles" | "indexedUrlInventory">,
  limit: number,
  own: { keywords: string[]; reachableDifficulty: number } = { keywords: [], reachableDifficulty: REACHABLE_DIFFICULTY },
  /** Filled with every keyword that was dropped and why. */
  rejects: KeywordReject[] = [],
  scoring: KeywordScoring = PUBLISHER,
): KeywordCandidate[] {
  // The site already ranks with a page for these: they are optimizations of that page, not new articles.
  const observed = new Map(metrics.flatMap((metric) => (metric.firstParty ? [[keywordTokens(metric.keyword).join(" "), metric.firstParty] as const] : [])));
  const ranking = new Set(own.keywords.map((keyword) => keywordTokens(normalizeKeyword(keyword)).join(" ")));
  const profile = context.profile ?? syntheticProfileForSiteType(context.site.type);
  const seen = new Set<string>();
  const scored: KeywordCandidate[] = [];
  for (const metric of metrics) {
    const keyword = normalizeKeyword(metric.keyword);
    const key = keywordTokens(keyword).join(" "); // accent/stopword-insensitive: "programacion" = "programación"
    const reject = (reason: KeywordRejectReason) => rejects.push({ keyword, reason, volume: metric.volume });
    // No volume is not marked as seen: another source may know the volume of the same keyword.
    if (!keyword || seen.has(key) || (!metric.volume && !metric.firstParty)) continue;
    seen.add(key);
    if (ranking.has(key)) {
      reject("already_ranking");
      continue;
    }
    const brief = { topic: keyword, primaryKeyword: keyword, targetQuery: keyword, topicCluster: null, contentType: "guide", primaryIntent: "informational" } as never;
    const relevance = computeSiteRelevanceScore(brief, profile, keyword);
    // The 45 plan threshold rejects short real queries ("programación la 2 hoy" = 42); keep hard guardrails + a lower floor.
    const hardReject = relevance.reasons.some((reason) => reason.startsWith("off-topic") || reason.startsWith("excluded"));
    // A site without a profile has nothing to compare with: its own impressions are the only sign that the query is its business.
    const unknownRelevance = Boolean(metric.firstParty) && profile.mainTopics.length === 0;
    if (hardReject || (!unknownRelevance && relevance.score < MIN_RELEVANCE)) {
      reject(hardReject ? "off_topic" : "low_relevance");
      continue;
    }
    const cannibalization = classifyCannibalization({ targetQuery: keyword, primaryKeyword: keyword, suggestedSlug: undefined } as never, keyword, {
      queries: [...context.searchTargets, ...context.existingPlanQueries],
      keywords: context.existingPlanQueries,
      indexedUrls: context.indexedUrlInventory,
      plannedTitles: context.existingPlanTitles,
    });
    if (cannibalization.risk !== "none" && cannibalization.risk !== "related-cluster") {
      reject("cannibalization");
      continue;
    }
    const firstParty = metric.firstParty ?? observed.get(key);
    const factors = { volume: metric.volume, difficulty: metric.difficulty, relevance: unknownRelevance ? null : relevance.score, intent: metric.intent, firstParty };
    const score = keywordOpportunityScore(factors, own.reachableDifficulty, scoring);
    if (score > 0) scored.push({ ...metric, ...(firstParty ? { firstParty } : {}), keyword, score, variants: [], parts: keywordScoreParts(factors, own.reachableDifficulty, scoring) ?? undefined });
    else reject("no_score");
  }
  for (const metric of metrics) {
    const keyword = normalizeKeyword(metric.keyword);
    const key = keywordTokens(keyword).join(" ");
    if (!keyword || metric.volume || seen.has(key)) continue;
    seen.add(key);
    rejects.push({ keyword, reason: "no_volume", volume: null });
  }
  scored.sort((a, b) => b.score - a.score || (b.volume ?? 0) - (a.volume ?? 0));
  const out: KeywordCandidate[] = [];
  for (const candidate of scored) {
    const head = out.find((kept) => isKeywordVariant(kept.keyword, candidate.keyword));
    if (head) head.variants.push(candidate.keyword);
    else out.push(candidate);
  }
  return out.slice(0, limit);
}

async function keywordRows(
  tenantId: string,
  site: { id: string; type: string },
  route: SeoRoute,
  capability: "keyword_suggestions" | "ranked_keywords",
  subject: string,
  options: { fetchImpl: typeof fetch; reuseOnly: boolean },
): Promise<{ rows: KeywordMetrics[]; stale: boolean }> {
  const scope = { tenantId, siteId: site.id, kind: "keyword_metrics", priority: "planning" as const, decision: { importance: "normal" as const, siteType: site.type }, ...options };
  const { data, meta } = capability === "keyword_suggestions"
    ? await acquireSeo(route, capability, { seed: subject, limit: ROWS_PER_CALL }, scope)
    : await acquireSeo(route, capability, { domain: subject, limit: ROWS_PER_CALL }, scope);
  return { rows: data, stale: meta.freshness === "stale" };
}

function seedOrigin(seed: string, context: Pick<EditorialPlanningContext, "profile">, opportunityTopics: string[]): "opportunity" | "site_topic" | "cluster" {
  if (opportunityTopics.slice(0, 2).some((topic) => normalizeKeyword(topic) === seed)) return "opportunity";
  return (context.profile?.mainTopics ?? []).some((topic) => normalizeKeyword(topic) === seed) ? "site_topic" : "cluster";
}

/** Seeds: open content-gap opportunities first (topics competitors cover and the site does not), then the site's own topics. */
export function keywordSeeds(context: Pick<EditorialPlanningContext, "profile" | "clusters">, opportunityTopics: string[] = []): string[] {
  const raw = [...opportunityTopics.slice(0, 2), ...(context.profile?.mainTopics ?? []), ...context.clusters.map((cluster) => cluster.name)];
  const out: string[] = [];
  for (const seed of raw.map(normalizeKeyword)) if (seed && !out.includes(seed)) out.push(seed);
  return out.slice(0, MAX_SEEDS);
}

/** Queries Search Console showed for the site that no page of it covers (found by the SEO intelligence engine). */
async function firstPartyCandidates(tenantId: string, siteId: string) {
  const rows = await prisma.contentOpportunity.findMany({
    where: { tenantId, siteId, source: "search_console", action: "create_content", status: "open", query: { not: null } },
    orderBy: { priority: { sort: "desc", nulls: "last" } },
    take: MAX_STORED_CANDIDATES,
    select: { query: true, evidence: true },
  });
  return rows.flatMap((row) => {
    const firstParty = (row.evidence as { firstParty?: FirstPartyEvidence & { intent?: string | null } } | null)?.firstParty;
    if (!row.query || !firstParty) return [];
    return [{
      keyword: normalizeKeyword(row.query), volume: null, difficulty: null, cpc: null, intent: firstParty.intent ?? null, source: "search_console",
      origin: { kind: "search_console" as const, value: normalizeKeyword(row.query) },
      firstParty: { impressions: firstParty.impressions, clicks: firstParty.clicks, position: firstParty.position },
    }];
  });
}

/** Keywords a provider says the site ranks for, within reach: work on the page that ranks. Scored by the next analysis. */
async function recordRankedOpportunities(tenantId: string, siteId: string, rows: KeywordMetrics[]) {
  const reachable = rows
    .filter((row) => row.rank?.url && row.rank.position && row.rank.position >= 4 && row.rank.position <= RANKING_LIMIT && row.volume)
    .sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0))
    .slice(0, 25);
  for (const row of reachable) {
    const keyword = normalizeKeyword(row.keyword);
    const dedupeKey = `seo:ranked_keyword:${keywordTokens(keyword).join(" ")}`.slice(0, 500);
    const data = {
      rationale: `El proveedor sitúa una página tuya en la posición ${row.rank!.position} para «${keyword}».`,
      targetUrl: row.rank!.url,
      evidence: { provider: { source: row.source, volume: row.volume, difficulty: row.difficulty, intent: row.intent, position: row.rank!.position, asOf: row.asOf ?? null } } as Prisma.InputJsonObject,
    };
    await prisma.contentOpportunity.upsert({
      where: { siteId_dedupeKey: { siteId, dedupeKey } },
      create: { tenantId, siteId, source: "provider", kind: "ranked_keyword", topic: keyword, query: keyword, dedupeKey, action: "update_existing", ...data },
      update: data,
    });
  }
}

/**
 * Measured keyword candidates for a plan, best first. Empty when no SEO provider may be used,
 * the market is unsupported or every call fails: the caller then keeps the model-picked flow.
 */
export async function collectKeywordCandidates(
  tenantId: string,
  siteId: string,
  context: EditorialPlanningContext,
  limit: number,
  fetchImpl: typeof fetch = fetch,
  /** Filled in place with the trace of the run. */
  research: KeywordResearch = emptyKeywordResearch(),
): Promise<KeywordCandidate[]> {
  // A capability without a provider is skipped: the other one still yields candidates.
  const scoring = await keywordScoringFor(tenantId, { id: siteId, type: context.site.type }, context.profile?.detectedSiteType ?? null);
  const firstPartyRows = await firstPartyCandidates(tenantId, siteId);
  const [ideas, rankings] = await Promise.all([seoRoute("keyword_suggestions", context.site.locale), seoRoute("ranked_keywords", context.site.locale)]);
  if (!ideas.provider && !rankings.provider && !firstPartyRows.length) {
    research.skipped = ideas.reason === "not_configured" || ideas.reason === "unsupported_market" ? ideas.reason : "disabled";
    return [];
  }
  const competitors = await prisma.competitor.findMany({ where: { tenantId, siteId, status: "accepted" }, select: { domain: true }, orderBy: { overlapScore: "desc" }, take: MAX_COMPETITORS });
  const opportunities = await prisma.contentOpportunity.findMany({ where: { tenantId, siteId, status: "open", kind: { in: ["missing_topic", "underdeveloped_cluster", "differentiated_angle"] } }, select: { topic: true }, orderBy: { createdAt: "desc" }, take: 5 });
  // The site's own ranking keywords (1 cached call): skip what it already ranks for and set its reachable difficulty.
  const ownDomain = (() => {
    try {
      return context.site.baseUrl ? new URL(context.site.baseUrl).hostname.replace(/^www\./, "") : null;
    } catch {
      return null;
    }
  })();
  let ownKeywords: KeywordMetrics[] = [];
  if (ownDomain && rankings.provider) {
    try {
      ownKeywords = (await keywordRows(tenantId, context.site, rankings, "ranked_keywords", ownDomain, { fetchImpl, reuseOnly: false })).rows;
    } catch (error) {
      research.failedCalls += 1;
      research.lastError = (error instanceof Error ? error.message : String(error)).slice(0, 200);
      structuredEvent("keyword_candidates.call_failed", { tenantId, siteId, error: research.lastError }, "warn");
    }
  }
  const opportunityTopics = opportunities.map((entry) => entry.topic);
  research.seeds = ideas.provider ? keywordSeeds(context, opportunityTopics).map((keyword) => ({ keyword, origin: seedOrigin(keyword, context, opportunityTopics) })) : [];
  const rankedCompetitors = rankings.provider ? competitors : [];
  const calls: Array<{ origin: KeywordOrigin; run: (reuseOnly: boolean) => ReturnType<typeof keywordRows> }> = [
    ...research.seeds.map(({ keyword, origin }) => ({
      origin: { kind: origin, value: keyword },
      run: (reuseOnly: boolean) => keywordRows(tenantId, context.site, ideas as SeoRoute, "keyword_suggestions", keyword, { fetchImpl, reuseOnly }),
    })),
    ...rankedCompetitors.map(({ domain }) => ({
      origin: { kind: "competitor" as const, value: domain },
      run: (reuseOnly: boolean) => keywordRows(tenantId, context.site, rankings as SeoRoute, "ranked_keywords", domain, { fetchImpl, reuseOnly }),
    })),
  ];
  const reachableDifficulty = reachableDifficultyFor(ownKeywords);
  // Position unknown counts as ranking: creating a second page would be the costlier mistake.
  const own = { keywords: ownKeywords.filter((item) => (item.rank?.position ?? 0) <= RANKING_LIMIT).map((item) => item.keyword), reachableDifficulty };
  // What is stored costs nothing and is always used; the rest is bought in order only while candidates are still short.
  const answers = new Map<number, { rows: KeywordMetrics[]; stale: boolean }>();
  for (const [index, call] of calls.entries()) {
    const stored = await call.run(true).catch((error: unknown) => {
      if (error instanceof SeoProviderError) return null;
      throw error;
    });
    if (stored) answers.set(index, stored);
  }
  // First-party queries go last in the list so a provider's row of the same keyword keeps its volume, and cost nothing.
  const collected = () => [...calls.flatMap((call, index) => (answers.get(index)?.rows ?? []).map((item) => ({ ...item, origin: call.origin }))), ...firstPartyRows];
  let bought = 0;
  for (const [index, call] of calls.entries()) {
    if (answers.get(index)?.stale === false) continue;
    if (rankKeywordCandidates(collected(), context, limit, own, [], scoring).length >= limit) break;
    try {
      answers.set(index, await call.run(false));
      bought += 1;
    } catch (error) {
      research.failedCalls += 1;
      research.lastError = (error instanceof Error ? error.message : String(error)).slice(0, 200);
      structuredEvent("keyword_candidates.call_failed", { tenantId, siteId, error: research.lastError }, "warn");
    }
  }
  const metrics = collected();
  const rejects: KeywordReject[] = [];
  const ranked = rankKeywordCandidates(metrics, context, limit, own, rejects, scoring);
  await recordRankedOpportunities(tenantId, siteId, ownKeywords);
  Object.assign(research, {
    provider: ranked.find((candidate) => candidate.source !== "search_console")?.source ?? ranked[0]?.source ?? null,
    skipped: ranked.length ? null : research.failedCalls && !metrics.length ? "provider_error" : "no_data",
    market: ideas.provider ? ideas.marketKey : rankings.provider ? rankings.marketKey : null,
    competitors: rankedCompetitors.map(({ domain }) => domain),
    ownDomain,
    ownRankingKeywords: ownKeywords.length,
    reachableDifficulty,
    rows: metrics.length,
    candidates: ranked.slice(0, MAX_STORED_CANDIDATES).map((candidate, index) => ({
      keyword: candidate.keyword, volume: candidate.volume, difficulty: candidate.difficulty, intent: candidate.intent, score: candidate.score,
      variants: candidate.variants, origin: candidate.origin ?? null, parts: candidate.parts ?? null, firstParty: candidate.firstParty ?? null, rank: index + 1,
    })),
    rejected: rejects.reduce<KeywordResearch["rejected"]>((counts, { reason }) => ({ ...counts, [reason]: (counts[reason] ?? 0) + 1 }), {}),
    rejectedSample: [...rejects].sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0)).slice(0, 25),
  } satisfies Partial<KeywordResearch>);
  structuredEvent("keyword_candidates.collected", { tenantId, siteId, calls: calls.length + (ownDomain && rankings.provider ? 1 : 0), bought, rows: metrics.length, candidates: ranked.length, reachableDifficulty });
  return ranked;
}
