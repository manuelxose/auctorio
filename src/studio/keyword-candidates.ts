// Data first, AI second: the plan's keywords come from the SEO provider (ideas around the site's own
// topics + keywords accepted competitors rank for), filtered and scored by the app. The model only
// writes the brief for a keyword it is handed.

import { getPrismaClient } from "../infrastructure/db/prisma";
import { normalizeKeyword, type KeywordMetrics } from "../infrastructure/seo/contract";
import { lookupProviderCache, storeProviderCache } from "./enrichment/provider-cache";
import { acquireSeo, seoRoute, type SeoRoute } from "./seo-manager";
import { classifyCannibalization, computeSiteRelevanceScore, syntheticProfileForSiteType } from "./site-relevance";
import type { EditorialPlanningContext } from "./editorial-plan-context";
import { structuredEvent } from "../shared/utils/logger";

const prisma = getPrismaClient();
const TTL_MS = 30 * 24 * 60 * 60 * 1000;
// Cost caps per plan: ≤5 seeds + ≤3 competitors → ≤9 calls of ≤100 rows (docs/seo-v2/cost-model.md), cached 30 days.
const MAX_SEEDS = 5;
const MAX_COMPETITORS = 3;
const ROWS_PER_CALL = 100;
const MIN_RELEVANCE = 30;
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

export type KeywordCandidate = KeywordMetrics & { score: number; variants: string[] };

/** Deterministic opportunity 0–100 = demand × winnability × relevance × intent fit. */
export function keywordOpportunityScore(
  input: { volume: number | null; difficulty: number | null; relevance: number; intent: string | null },
  reachableDifficulty = REACHABLE_DIFFICULTY,
): number {
  if (!input.volume || input.volume <= 0) return 0;
  const demand = Math.min(1, Math.log10(input.volume + 1) / 5); // 100k searches/mo → 1
  const difficulty = input.difficulty ?? reachableDifficulty; // unknown difficulty: assume just reachable
  const winnability = difficulty <= reachableDifficulty ? 1 : Math.max(0.05, 1 - (difficulty - reachableDifficulty) / 40);
  // shortcut: same intent preference for every site type (content sites); weight by site type when a shop is onboarded.
  const intentFit = ({ informational: 1, navigational: 1, commercial: 0.8, transactional: 0.5 } as Record<string, number>)[input.intent ?? ""] ?? 0.8;
  const relevance = Math.max(0, Math.min(1, input.relevance / 100));
  return Math.round(100 * demand * winnability * relevance * intentFit);
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
  metrics: KeywordMetrics[],
  context: Pick<EditorialPlanningContext, "profile" | "site" | "searchTargets" | "existingPlanQueries" | "existingPlanTitles" | "indexedUrlInventory">,
  limit: number,
  own: { keywords: string[]; reachableDifficulty: number } = { keywords: [], reachableDifficulty: REACHABLE_DIFFICULTY },
): KeywordCandidate[] {
  // The site already ranks with a page for these: another article would cannibalize it.
  const ranking = new Set(own.keywords.map((keyword) => tokens(normalizeKeyword(keyword)).join(" ")));
  const profile = context.profile ?? syntheticProfileForSiteType(context.site.type);
  const seen = new Set<string>();
  const scored: KeywordCandidate[] = [];
  for (const metric of metrics) {
    const keyword = normalizeKeyword(metric.keyword);
    const key = tokens(keyword).join(" "); // accent/stopword-insensitive: "programacion" = "programación"
    if (!keyword || seen.has(key) || !metric.volume || ranking.has(key)) continue;
    seen.add(key);
    const brief = { topic: keyword, primaryKeyword: keyword, targetQuery: keyword, topicCluster: null, contentType: "guide", primaryIntent: "informational" } as never;
    const relevance = computeSiteRelevanceScore(brief, profile, keyword);
    // The 45 plan threshold rejects short real queries ("programación la 2 hoy" = 42); keep hard guardrails + a lower floor.
    const hardReject = relevance.reasons.some((reason) => reason.startsWith("off-topic") || reason.startsWith("excluded"));
    if (hardReject || relevance.score < MIN_RELEVANCE) continue;
    const cannibalization = classifyCannibalization({ targetQuery: keyword, primaryKeyword: keyword, suggestedSlug: undefined } as never, keyword, {
      queries: [...context.searchTargets, ...context.existingPlanQueries],
      keywords: context.existingPlanQueries,
      indexedUrls: context.indexedUrlInventory,
      plannedTitles: context.existingPlanTitles,
    });
    if (cannibalization.risk !== "none" && cannibalization.risk !== "related-cluster") continue;
    const score = keywordOpportunityScore({ volume: metric.volume, difficulty: metric.difficulty, relevance: relevance.score, intent: metric.intent }, own.reachableDifficulty);
    if (score > 0) scored.push({ ...metric, keyword, score, variants: [] });
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

async function cachedCall(
  tenantId: string,
  siteId: string,
  route: SeoRoute,
  resource: "keyword_ideas" | "ranked_keywords",
  subject: string,
  fetchImpl: typeof fetch,
): Promise<KeywordMetrics[]> {
  const key = `${route.marketKey}|${subject}`;
  const cached = await lookupProviderCache(tenantId, route.provider.id, resource, key);
  if (cached.hit && !cached.stale) return cached.negative ? [] : (cached.payload as KeywordMetrics[]);
  const scope = { tenantId, siteId, kind: "keyword_metrics", resource, fetchImpl };
  const { data: items, meta } = resource === "keyword_ideas"
    ? await acquireSeo(route, "keyword_suggestions", { seed: subject, limit: ROWS_PER_CALL }, scope)
    : await acquireSeo(route, "ranked_keywords", { domain: subject, limit: ROWS_PER_CALL }, scope);
  if (items.length || !meta.partial) await storeProviderCache(tenantId, route.provider.id, resource, key, items.length ? items : undefined, { ttlMs: TTL_MS, negative: items.length === 0 });
  return items;
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
): Promise<KeywordCandidate[]> {
  // A capability without a provider is skipped: the other one still yields candidates.
  const [ideas, rankings] = await Promise.all([seoRoute("keyword_suggestions", context.site.locale), seoRoute("ranked_keywords", context.site.locale)]);
  if (!ideas.provider && !rankings.provider) return [];
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
      ownKeywords = await cachedCall(tenantId, siteId, rankings, "ranked_keywords", ownDomain, fetchImpl);
    } catch (error) {
      structuredEvent("keyword_candidates.call_failed", { tenantId, siteId, error: error instanceof Error ? error.message : String(error) }, "warn");
    }
  }
  const calls = [
    ...(ideas.provider ? keywordSeeds(context, opportunities.map((entry) => entry.topic)).map((seed) => () => cachedCall(tenantId, siteId, ideas, "keyword_ideas", seed, fetchImpl)) : []),
    ...(rankings.provider ? competitors.map(({ domain }) => () => cachedCall(tenantId, siteId, rankings, "ranked_keywords", domain, fetchImpl)) : []),
  ];
  const metrics: KeywordMetrics[] = [];
  for (const call of calls) {
    try {
      metrics.push(...(await call()));
    } catch (error) {
      structuredEvent("keyword_candidates.call_failed", { tenantId, siteId, error: error instanceof Error ? error.message : String(error) }, "warn");
    }
  }
  const reachableDifficulty = reachableDifficultyFor(ownKeywords);
  const ranked = rankKeywordCandidates(metrics, context, limit, { keywords: ownKeywords.map((item) => item.keyword), reachableDifficulty });
  structuredEvent("keyword_candidates.collected", { tenantId, siteId, calls: calls.length + (ownDomain && rankings.provider ? 1 : 0), rows: metrics.length, candidates: ranked.length, reachableDifficulty });
  return ranked;
}
