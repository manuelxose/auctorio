// Data first, AI second: the plan's keywords come from DataForSEO (ideas around the site's own
// topics + keywords accepted competitors rank for), filtered and scored by the app. The model only
// writes the brief for a keyword it is handed.

import { getPrismaClient } from "../infrastructure/db/prisma";
import {
  dataForSeoConfigured,
  dataForSeoLocation,
  fetchKeywordIdeas,
  fetchRankedKeywords,
  normalizeKeyword,
  type DataForSeoLocation,
  type KeywordMetrics,
} from "../infrastructure/seo/dataforseo";
import { lookupProviderCache, storeProviderCache } from "./enrichment/provider-cache";
import { recordAiSpend } from "./cost-budgets";
import { classifyCannibalization, computeSiteRelevanceScore, syntheticProfileForSiteType } from "./site-relevance";
import type { EditorialPlanningContext } from "./editorial-plan-context";
import { structuredEvent } from "../shared/utils/logger";

const prisma = getPrismaClient();
const PROVIDER = "dataforseo";
const TTL_MS = 30 * 24 * 60 * 60 * 1000;
// Cost caps per plan: ≤5 seeds + ≤3 competitors → ≤8 Labs calls (~0.012 USD each), cached 30 days.
const MAX_SEEDS = 5;
const MAX_COMPETITORS = 3;
const ROWS_PER_CALL = 100;
const MIN_RELEVANCE = 30;
// shortcut: one reachable difficulty for every site (no domain-authority data yet); derive it per site once we measure authority.
export const REACHABLE_DIFFICULTY = 30;

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
): KeywordCandidate[] {
  const profile = context.profile ?? syntheticProfileForSiteType(context.site.type);
  const seen = new Set<string>();
  const scored: KeywordCandidate[] = [];
  for (const metric of metrics) {
    const keyword = normalizeKeyword(metric.keyword);
    const key = tokens(keyword).join(" "); // accent/stopword-insensitive: "programacion" = "programación"
    if (!keyword || seen.has(key) || !metric.volume) continue;
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
    const score = keywordOpportunityScore({ volume: metric.volume, difficulty: metric.difficulty, relevance: relevance.score, intent: metric.intent });
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

type Fetchers = { ideas: typeof fetchKeywordIdeas; ranked: typeof fetchRankedKeywords };

async function cachedCall(
  tenantId: string,
  siteId: string,
  resource: "keyword_ideas" | "ranked_keywords",
  key: string,
  call: () => Promise<{ items: KeywordMetrics[]; costUsd: number }>,
): Promise<KeywordMetrics[]> {
  const cached = await lookupProviderCache(tenantId, PROVIDER, resource, key);
  if (cached.hit && !cached.stale) return cached.negative ? [] : (cached.payload as KeywordMetrics[]);
  const { items, costUsd } = await call();
  if (costUsd > 0) await recordAiSpend({ tenantId, siteId, kind: "keyword_metrics", provider: PROVIDER, model: resource, costUsd });
  await storeProviderCache(tenantId, PROVIDER, resource, key, items.length ? items : undefined, { ttlMs: TTL_MS, negative: items.length === 0 });
  return items;
}

/** Seeds: the site's own topics (profile + sitemap clusters). */
export function keywordSeeds(context: Pick<EditorialPlanningContext, "profile" | "clusters">): string[] {
  const raw = [...(context.profile?.mainTopics ?? []), ...context.clusters.map((cluster) => cluster.name)];
  const out: string[] = [];
  for (const seed of raw.map(normalizeKeyword)) if (seed && !out.includes(seed)) out.push(seed);
  return out.slice(0, MAX_SEEDS);
}

/**
 * Measured keyword candidates for a plan, best first. Empty when DataForSEO is not configured,
 * the market is unsupported or every call fails: the caller then keeps the model-picked flow.
 */
export async function collectKeywordCandidates(
  tenantId: string,
  siteId: string,
  context: EditorialPlanningContext,
  limit: number,
  fetchers: Fetchers = { ideas: fetchKeywordIdeas, ranked: fetchRankedKeywords },
): Promise<KeywordCandidate[]> {
  if (!dataForSeoConfigured()) return [];
  const location: DataForSeoLocation | null = dataForSeoLocation(context.site.locale);
  if (!location) return [];
  const market = `${location.locationCode}|${location.languageCode}`;
  const competitors = await prisma.competitor.findMany({ where: { tenantId, siteId, status: "accepted" }, select: { domain: true }, orderBy: { overlapScore: "desc" }, take: MAX_COMPETITORS });
  const calls = [
    ...keywordSeeds(context).map((seed) => () => cachedCall(tenantId, siteId, "keyword_ideas", `${market}|${seed}`, () => fetchers.ideas(seed, location, ROWS_PER_CALL))),
    ...competitors.map(({ domain }) => () => cachedCall(tenantId, siteId, "ranked_keywords", `${market}|${domain}`, () => fetchers.ranked(domain, location, ROWS_PER_CALL))),
  ];
  const metrics: KeywordMetrics[] = [];
  for (const call of calls) {
    try {
      metrics.push(...(await call()));
    } catch (error) {
      structuredEvent("keyword_candidates.call_failed", { tenantId, siteId, error: error instanceof Error ? error.message : String(error) }, "warn");
    }
  }
  const ranked = rankKeywordCandidates(metrics, context, limit);
  structuredEvent("keyword_candidates.collected", { tenantId, siteId, calls: calls.length, rows: metrics.length, candidates: ranked.length });
  return ranked;
}
