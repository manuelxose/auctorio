// Data first, AI second: the plan's keywords come from the SEO provider (ideas around the site's own
// topics + keywords accepted competitors rank for), filtered and scored by the app. The model only
// writes the brief for a keyword it is handed.

import { randomUUID } from "node:crypto";
import { getPrismaClient } from "../infrastructure/db/prisma";
import { SeoProviderError, normalizeKeyword, type KeywordMetrics } from "../infrastructure/seo/contract";
import { acquireSeo, seoRoute, type SeoRoute } from "./seo-manager";
import { classifyCannibalization, computeSiteRelevanceScore, syntheticProfileForSiteType } from "./site-relevance";
import type { EditorialPlanningContext } from "./editorial-plan-context";
import { structuredEvent } from "../shared/utils/logger";

const prisma = getPrismaClient();
// Cost caps per plan: ≤5 seeds + ≤3 competitors → ≤9 calls of ≤100 rows (docs/seo-v2/cost-model.md), reused while fresh.
const MAX_SEEDS = 5;
const MAX_COMPETITORS = 3;
const ROWS_PER_CALL = 100;
const MIN_RELEVANCE = 30;
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
export type KeywordOrigin = { kind: "opportunity" | "site_topic" | "cluster" | "competitor"; value: string };
/** The four factors of the score, each 0–1, as they were when the keyword was chosen. */
export type KeywordScoreParts = { demand: number; winnability: number; relevance: number; intentFit: number };
export type KeywordCandidate = KeywordMetrics & { score: number; variants: string[]; origin?: KeywordOrigin | null; parts?: KeywordScoreParts };

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
  candidates: Array<{ keyword: string; volume: number | null; difficulty: number | null; intent: string | null; score: number; variants: string[]; origin: KeywordOrigin | null; parts: KeywordScoreParts | null; rank: number }>;
  rejected: Partial<Record<KeywordRejectReason, number>>;
  rejectedSample: KeywordReject[];
};

export function emptyKeywordResearch(): KeywordResearch {
  return {
    id: randomUUID(), at: new Date().toISOString(), provider: null, skipped: null, market: null, seeds: [], competitors: [], ownDomain: null,
    ownRankingKeywords: 0, reachableDifficulty: REACHABLE_DIFFICULTY, rows: 0, failedCalls: 0, lastError: null, candidates: [], rejected: {}, rejectedSample: [],
  };
}

/** The factors behind the opportunity score; null when the keyword has no measured demand. */
export function keywordScoreParts(
  input: { volume: number | null; difficulty: number | null; relevance: number; intent: string | null },
  reachableDifficulty = REACHABLE_DIFFICULTY,
): KeywordScoreParts | null {
  if (!input.volume || input.volume <= 0) return null;
  const demand = Math.min(1, Math.log10(input.volume + 1) / 5); // 100k searches/mo → 1
  const difficulty = input.difficulty ?? reachableDifficulty; // unknown difficulty: assume just reachable
  const winnability = difficulty <= reachableDifficulty ? 1 : Math.max(0.05, 1 - (difficulty - reachableDifficulty) / 40);
  // shortcut: same intent preference for every site type (content sites); weight by site type when a shop is onboarded.
  const intentFit = ({ informational: 1, navigational: 1, commercial: 0.8, transactional: 0.5 } as Record<string, number>)[input.intent ?? ""] ?? 0.8;
  const relevance = Math.max(0, Math.min(1, input.relevance / 100));
  return { demand, winnability, relevance, intentFit };
}

/** Deterministic opportunity 0–100 = demand × winnability × relevance × intent fit. */
export function keywordOpportunityScore(input: Parameters<typeof keywordScoreParts>[0], reachableDifficulty = REACHABLE_DIFFICULTY): number {
  const parts = keywordScoreParts(input, reachableDifficulty);
  return parts ? Math.round(100 * parts.demand * parts.winnability * parts.relevance * parts.intentFit) : 0;
}

const tokens = (keyword: string) =>
  normalizeKeyword(keyword).normalize("NFD").replace(/[̀-ͯ]/g, "").split(/[^a-z0-9ñ]+/).filter((token) => token && !STOPWORDS.has(token));
const STOPWORDS = new Set(["de", "del", "la", "el", "los", "las", "en", "y", "a", "para", "por", "con", "the", "of", "in", "for", "to", "and"]);

/** Same topic, one modifier apart ("programacion la 2" ~ "programación la 2 hoy"); "la 1" vs "la 2" are different topics. */
export function isKeywordVariant(a: string, b: string): boolean {
  const ta = new Set(tokens(a));
  const tb = new Set(tokens(b));
  const [small, large] = ta.size <= tb.size ? [ta, tb] : [tb, ta];
  if (small.size === 0 || large.size - small.size > 1) return false;
  return [...small].every((token) => large.has(token));
}

/** Pure ranking: drop off-topic, cannibalizing and no-demand keywords, score, fold variants into the strongest. */
export function rankKeywordCandidates(
  metrics: Array<KeywordMetrics & { origin?: KeywordOrigin | null }>,
  context: Pick<EditorialPlanningContext, "profile" | "site" | "searchTargets" | "existingPlanQueries" | "existingPlanTitles" | "indexedUrlInventory">,
  limit: number,
  own: { keywords: string[]; reachableDifficulty: number } = { keywords: [], reachableDifficulty: REACHABLE_DIFFICULTY },
  /** Filled with every keyword that was dropped and why. */
  rejects: KeywordReject[] = [],
): KeywordCandidate[] {
  // The site already ranks with a page for these: another article would cannibalize it.
  const ranking = new Set(own.keywords.map((keyword) => tokens(normalizeKeyword(keyword)).join(" ")));
  const profile = context.profile ?? syntheticProfileForSiteType(context.site.type);
  const seen = new Set<string>();
  const scored: KeywordCandidate[] = [];
  for (const metric of metrics) {
    const keyword = normalizeKeyword(metric.keyword);
    const key = tokens(keyword).join(" "); // accent/stopword-insensitive: "programacion" = "programación"
    const reject = (reason: KeywordRejectReason) => rejects.push({ keyword, reason, volume: metric.volume });
    // No volume is not marked as seen: another source may know the volume of the same keyword.
    if (!keyword || seen.has(key) || !metric.volume) continue;
    seen.add(key);
    if (ranking.has(key)) {
      reject("already_ranking");
      continue;
    }
    const brief = { topic: keyword, primaryKeyword: keyword, targetQuery: keyword, topicCluster: null, contentType: "guide", primaryIntent: "informational" } as never;
    const relevance = computeSiteRelevanceScore(brief, profile, keyword);
    // The 45 plan threshold rejects short real queries ("programación la 2 hoy" = 42); keep hard guardrails + a lower floor.
    const hardReject = relevance.reasons.some((reason) => reason.startsWith("off-topic") || reason.startsWith("excluded"));
    if (hardReject || relevance.score < MIN_RELEVANCE) {
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
    const factors = { volume: metric.volume, difficulty: metric.difficulty, relevance: relevance.score, intent: metric.intent };
    const score = keywordOpportunityScore(factors, own.reachableDifficulty);
    if (score > 0) scored.push({ ...metric, keyword, score, variants: [], parts: keywordScoreParts(factors, own.reachableDifficulty) ?? undefined });
    else reject("no_score");
  }
  for (const metric of metrics) {
    const keyword = normalizeKeyword(metric.keyword);
    const key = tokens(keyword).join(" ");
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
  const [ideas, rankings] = await Promise.all([seoRoute("keyword_suggestions", context.site.locale), seoRoute("ranked_keywords", context.site.locale)]);
  if (!ideas.provider && !rankings.provider) {
    research.skipped = ideas.reason === "not_configured" || ideas.reason === "unsupported_market" ? ideas.reason : "disabled";
    return [];
  }
  const competitors = await prisma.competitor.findMany({ where: { tenantId, siteId, status: "accepted" }, select: { domain: true }, orderBy: { overlapScore: "desc" }, take: MAX_COMPETITORS });
  const opportunities = await prisma.contentOpportunity.findMany({ where: { tenantId, siteId, status: "open" }, select: { topic: true }, orderBy: { createdAt: "desc" }, take: 5 });
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
  const own = { keywords: ownKeywords.map((item) => item.keyword), reachableDifficulty };
  // What is stored costs nothing and is always used; the rest is bought in order only while candidates are still short.
  const answers = new Map<number, { rows: KeywordMetrics[]; stale: boolean }>();
  for (const [index, call] of calls.entries()) {
    const stored = await call.run(true).catch((error: unknown) => {
      if (error instanceof SeoProviderError) return null;
      throw error;
    });
    if (stored) answers.set(index, stored);
  }
  const collected = () => calls.flatMap((call, index) => (answers.get(index)?.rows ?? []).map((item) => ({ ...item, origin: call.origin })));
  let bought = 0;
  for (const [index, call] of calls.entries()) {
    if (answers.get(index)?.stale === false) continue;
    if (rankKeywordCandidates(collected(), context, limit, own).length >= limit) break;
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
  const ranked = rankKeywordCandidates(metrics, context, limit, own, rejects);
  Object.assign(research, {
    provider: ranked[0]?.source ?? null,
    skipped: ranked.length ? null : research.failedCalls && !metrics.length ? "provider_error" : "no_data",
    market: ideas.provider ? ideas.marketKey : rankings.provider ? rankings.marketKey : null,
    competitors: rankedCompetitors.map(({ domain }) => domain),
    ownDomain,
    ownRankingKeywords: ownKeywords.length,
    reachableDifficulty,
    rows: metrics.length,
    candidates: ranked.slice(0, MAX_STORED_CANDIDATES).map((candidate, index) => ({
      keyword: candidate.keyword, volume: candidate.volume, difficulty: candidate.difficulty, intent: candidate.intent, score: candidate.score,
      variants: candidate.variants, origin: candidate.origin ?? null, parts: candidate.parts ?? null, rank: index + 1,
    })),
    rejected: rejects.reduce<KeywordResearch["rejected"]>((counts, { reason }) => ({ ...counts, [reason]: (counts[reason] ?? 0) + 1 }), {}),
    rejectedSample: [...rejects].sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0)).slice(0, 25),
  } satisfies Partial<KeywordResearch>);
  structuredEvent("keyword_candidates.collected", { tenantId, siteId, calls: calls.length + (ownDomain && rankings.provider ? 1 : 0), bought, rows: metrics.length, candidates: ranked.length, reachableDifficulty });
  return ranked;
}
