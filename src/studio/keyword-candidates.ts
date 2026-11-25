// Data first, AI second: the plan's keywords come from the site's opportunity inventory and from what providers already
// answered, filtered and scored by the app. The model only writes the brief for a keyword it is handed.
// Planning never buys: acquiring more is the research engine's decision (seo-research/).

import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { getPrismaClient } from "../infrastructure/db/prisma";
import { SeoProviderError, normalizeDomain, normalizeKeyword, seoMarket, type KeywordMetrics } from "../infrastructure/seo/contract";
import { acquireSeo, seoRoute, type SeoRoute, type SeoScope } from "./seo-manager";
import { classifyCannibalization, computeSiteRelevanceScore, syntheticProfileForSiteType } from "./site-relevance";
import type { EditorialPlanningContext } from "./editorial-plan-context";
import { structuredEvent } from "../shared/utils/logger";
import { combineFactors, demandFromImpressions, demandFromVolume, defaultSeoProfile, factor, feasibilityFromPosition, intentValue, isSeoProfile, resolveWeights, type SeoProfile, type Weights } from "./seo-intelligence/scoring";
import { PLANNABLE, reconcileReservoir, reserveForPlanning, type OpportunityEvidence } from "./seo-research/reservoir";

const prisma = getPrismaClient();
const MAX_SEEDS = 5;
const MAX_COMPETITORS = 3;
export const ROWS_PER_CALL = 100;
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
export type KeywordOrigin = { kind: "opportunity" | "site_topic" | "cluster" | "competitor" | "search_console" | "own_ranking"; value: string };
/** The four factors of the score, each 0–1, as they were when the keyword was chosen; null = unknown, left out of the score. */
export type KeywordScoreParts = { demand: number | null; winnability: number | null; relevance: number | null; intentFit: number | null };
/** What Search Console observed for the query on the site itself in the last 28 days. */
export type FirstPartyEvidence = { impressions: number; clicks: number; position: number | null };
export type KeywordCandidate = KeywordMetrics & { score: number; variants: string[]; origin?: KeywordOrigin | null; parts?: KeywordScoreParts; firstParty?: FirstPartyEvidence; collectedAt?: string; opportunityId?: string; /** A person approved it. */ approved?: boolean; researchRunId?: string | null };
/** How the site values a keyword. */
export type KeywordScoring = { profile: SeoProfile; weights: Weights };
const PUBLISHER: KeywordScoring = { profile: "publisher", weights: resolveWeights("publisher") };

export type KeywordRejectReason = "no_volume" | "already_ranking" | "off_topic" | "low_relevance" | "cannibalization" | "no_score" | "excluded_topic";
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

/** Every word of the topic is in the keyword. */
export const isAboutTopic = (keyword: string, topic: string): boolean => {
  const words = keywordTokens(topic);
  const tokens = new Set(keywordTokens(keyword));
  return words.length > 0 && words.every((word) => tokens.has(word));
};
const PRIORITY_BONUS = 10;
const REPEAT_PENALTY = 8;

/**
 * The order a plan takes them in: what a person approved first; then by score, with a bonus for the priority topics and
 * a growing penalty for a topic already taken, so that one cluster does not fill the plan. Never drops anything. Pure.
 */
export function balanceCandidates<T extends { keyword: string; score: number; approved?: boolean }>(candidates: T[], topics: string[], priorityTopics: string[] = []): T[] {
  const rest = candidates.filter((candidate) => !candidate.approved).map((candidate) => ({ candidate, topic: topics.find((topic) => isAboutTopic(candidate.keyword, topic)) ?? null, bonus: priorityTopics.some((topic) => isAboutTopic(candidate.keyword, topic)) ? PRIORITY_BONUS : 0 }));
  const out = candidates.filter((candidate) => candidate.approved);
  const used = new Map<string, number>();
  for (const candidate of out) {
    const topic = topics.find((entry) => isAboutTopic(candidate.keyword, entry));
    if (topic) used.set(topic, (used.get(topic) ?? 0) + 1);
  }
  while (rest.length) {
    const value = (entry: (typeof rest)[number]) => entry.candidate.score + entry.bonus - (entry.topic ? (used.get(entry.topic) ?? 0) * REPEAT_PENALTY : 0);
    let best = 0;
    for (let index = 1; index < rest.length; index += 1) if (value(rest[index]) > value(rest[best])) best = index;
    const [taken] = rest.splice(best, 1);
    if (taken.topic) used.set(taken.topic, (used.get(taken.topic) ?? 0) + 1);
    out.push(taken.candidate);
  }
  return out;
}

/** One discovery answer of a provider. With reuseOnly it costs nothing and throws `reuse_only` when nothing is stored. */
export async function keywordRows(
  tenantId: string,
  site: { id: string; type: string },
  route: SeoRoute,
  capability: "keyword_suggestions" | "ranked_keywords",
  subject: string,
  options: Pick<SeoScope, "fetchImpl" | "reuseOnly" | "runId" | "priority">,
) {
  const scope: SeoScope = { tenantId, siteId: site.id, kind: "keyword_metrics", priority: "planning", decision: { importance: "normal", siteType: site.type }, ...options };
  const { data, meta } = capability === "keyword_suggestions"
    ? await acquireSeo(route, capability, { seed: subject, limit: ROWS_PER_CALL }, scope)
    : await acquireSeo(route, capability, { domain: subject, limit: ROWS_PER_CALL }, scope);
  return { rows: data.map((row) => ({ ...row, collectedAt: meta.fetchedAt })), meta };
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

/** Opportunities of the inventory a plan may write: the site's own queries and what research found, in the plan's language. */
async function inventoryRows(tenantId: string, siteId: string, locale: string) {
  const now = new Date();
  const language = seoMarket(locale)?.language;
  const rows = await prisma.contentOpportunity.findMany({
    where: {
      tenantId, siteId, source: { in: ["search_console", "research"] }, action: { in: [...PLANNABLE] }, status: { in: ["open", "approved"] }, planItemId: null, query: { not: null },
      OR: [{ reservedUntil: null }, { reservedUntil: { lte: now } }],
    },
    // What a person approved goes first.
    orderBy: [{ status: "asc" }, { priority: { sort: "desc", nulls: "last" } }],
    take: MAX_STORED_CANDIDATES * 3,
    select: { id: true, query: true, source: true, evidence: true, market: true, status: true, researchRunId: true },
  });
  return rows.flatMap<KeywordMetrics & { opportunityId: string; approved: boolean; researchRunId: string | null; origin: KeywordOrigin | null; firstParty?: FirstPartyEvidence; collectedAt?: string }>((row) => {
    const evidence = (row.evidence ?? {}) as OpportunityEvidence;
    const keyword = normalizeKeyword(row.query!);
    if (row.market && language && seoMarket(row.market)?.language !== language) return [];
    if (row.source === "search_console") {
      if (!evidence.firstParty) return [];
      const { impressions, clicks, position, intent } = evidence.firstParty;
      return [{ opportunityId: row.id, approved: row.status === "approved", researchRunId: row.researchRunId, keyword, volume: null, difficulty: null, cpc: null, intent: intent ?? null, source: "search_console", origin: { kind: "search_console" as const, value: keyword }, firstParty: { impressions, clicks, position } }];
    }
    const provider = evidence.provider;
    // The search results showed a page of the site: improving it is another task.
    if (!provider || evidence.serp?.ownUrl) return [];
    return [{
      opportunityId: row.id, approved: row.status === "approved", researchRunId: row.researchRunId, keyword, volume: provider.volume, difficulty: provider.difficulty, cpc: provider.cpc ?? null, intent: provider.intent, source: provider.source, asOf: provider.asOf,
      origin: (evidence.origin ?? null) as KeywordOrigin | null, collectedAt: provider.at ?? undefined,
    }];
  });
}

/** Keywords a provider says the site ranks for, within reach: work on the page that ranks. Scored by the next analysis. */
export async function recordRankedOpportunities(tenantId: string, siteId: string, rows: Array<KeywordMetrics & { collectedAt?: string }>) {
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
      evidence: { provider: { source: row.source, volume: row.volume, difficulty: row.difficulty, intent: row.intent, position: row.rank!.position, asOf: row.asOf ?? null, at: row.collectedAt ?? null } } as Prisma.InputJsonObject,
    };
    await prisma.contentOpportunity.upsert({
      where: { siteId_dedupeKey: { siteId, dedupeKey } },
      create: { tenantId, siteId, source: "provider", kind: "ranked_keyword", topic: keyword, query: keyword, dedupeKey, action: "update_existing", ...data },
      update: data,
    });
  }
}

export const ownDomainOf = (baseUrl: string | null): string | null => (baseUrl && URL.canParse(baseUrl) ? new URL(baseUrl).hostname.replace(/^www\./, "") : null);

export type KeywordSubjects = { seeds: Array<{ keyword: string; origin: KeywordOrigin["kind"] }>; competitors: Array<{ id: string; domain: string }>; ownDomain: string | null };
export type StoredKeyword = KeywordMetrics & { origin: KeywordOrigin; collectedAt: string; providerId: string; competitorId: string | null };

/** What a plan looks at by default. */
export async function keywordSubjects(tenantId: string, siteId: string, context: Pick<EditorialPlanningContext, "profile" | "clusters" | "site">): Promise<KeywordSubjects> {
  const competitors = await prisma.competitor.findMany({ where: { tenantId, siteId, status: "accepted" }, select: { id: true, domain: true }, orderBy: { overlapScore: "desc" }, take: MAX_COMPETITORS });
  const opportunities = await prisma.contentOpportunity.findMany({ where: { tenantId, siteId, status: "open", kind: { in: ["missing_topic", "underdeveloped_cluster", "differentiated_angle"] } }, select: { topic: true }, orderBy: { createdAt: "desc" }, take: 5 });
  const topics = opportunities.map((entry) => entry.topic);
  return { seeds: keywordSeeds(context, topics).map((keyword) => ({ keyword, origin: seedOrigin(keyword, context, topics) })), competitors, ownDomain: ownDomainOf(context.site.baseUrl) };
}

/** Everything providers already answered about these subjects in a market. Buys nothing. */
export async function storedKeywords(
  tenantId: string,
  site: { id: string; type: string },
  locale: string,
  subjects: KeywordSubjects,
): Promise<{ rows: StoredKeyword[]; own: StoredKeyword[]; market: string | null; reason: string | null; answered: Set<string> }> {
  const [ideas, rankings] = await Promise.all([seoRoute("keyword_suggestions", locale), seoRoute("ranked_keywords", locale)]);
  // A capability without a provider is skipped: the other one still yields candidates.
  const calls = [
    ...(ideas.provider ? subjects.seeds.map(({ keyword, origin }) => ({ route: ideas, capability: "keyword_suggestions" as const, origin: { kind: origin, value: keyword } as KeywordOrigin, competitorId: null as string | null })) : []),
    ...(rankings.provider ? subjects.competitors.map(({ id, domain }) => ({ route: rankings, capability: "ranked_keywords" as const, origin: { kind: "competitor", value: normalizeDomain(domain) } as KeywordOrigin, competitorId: id as string | null })) : []),
    ...(rankings.provider && subjects.ownDomain ? [{ route: rankings, capability: "ranked_keywords" as const, origin: { kind: "own_ranking", value: normalizeDomain(subjects.ownDomain) } as KeywordOrigin, competitorId: null as string | null }] : []),
  ];
  const rows: StoredKeyword[] = [];
  const own: StoredKeyword[] = [];
  const answered = new Set<string>();
  for (const call of calls) {
    const stored = await keywordRows(tenantId, site, call.route, call.capability, call.origin.value, { reuseOnly: true }).catch((error: unknown) => {
      if (error instanceof SeoProviderError) return null;
      throw error;
    });
    if (!stored) continue;
    if (stored.meta.freshness !== "stale") answered.add(`${call.capability}|${call.origin.value}`);
    (call.origin.kind === "own_ranking" ? own : rows).push(...stored.rows.map((row) => ({ ...row, origin: call.origin, providerId: call.route.provider.id, competitorId: call.competitorId })));
  }
  return { rows, own, market: ideas.provider ? ideas.marketKey : rankings.provider ? rankings.marketKey : null, reason: ideas.provider || rankings.provider ? null : (ideas as { reason: string }).reason, answered };
}

/** What the site's own rankings say: what is reachable, and what it already ranks for. */
export function ownRankings(own: KeywordMetrics[]): { keywords: string[]; reachableDifficulty: number } {
  // Position unknown counts as ranking: creating a second page would be the costlier mistake.
  return { keywords: own.filter((item) => (item.rank?.position ?? 0) <= RANKING_LIMIT).map((item) => item.keyword), reachableDifficulty: reachableDifficultyFor(own) };
}

/** Never the site's own figures: those belong to the Search Console opportunities, which are deleted with them. */
export const evidenceOfCandidate = (candidate: KeywordCandidate): OpportunityEvidence => ({
  firstParty: null,
  provider: candidate.source === "search_console" ? null : { source: candidate.source, volume: candidate.volume, difficulty: candidate.difficulty, cpc: candidate.cpc, intent: candidate.intent, position: null, asOf: candidate.asOf ?? null, at: candidate.collectedAt ?? null },
  origin: candidate.origin ?? null,
  variants: candidate.variants.slice(0, 20),
});

/**
 * Keyword candidates for a plan, best first, from the inventory and from stored provider data; nothing is bought.
 * With `reserveFor` they are reserved for that generation, and only those it got are returned. Empty when there is
 * nothing to choose from: the caller then keeps the model-picked flow.
 */
export async function collectKeywordCandidates(
  tenantId: string,
  siteId: string,
  context: EditorialPlanningContext,
  limit: number,
  options: { reserveFor?: string; reserve?: number; priorityTopics?: string[]; excludedTopics?: string[] } = {},
  /** Filled in place with the trace of the run. */
  research: KeywordResearch = emptyKeywordResearch(),
): Promise<KeywordCandidate[]> {
  if (options.reserveFor) await reconcileReservoir(tenantId, siteId);
  const scoring = await keywordScoringFor(tenantId, { id: siteId, type: context.site.type }, context.profile?.detectedSiteType ?? null);
  const inventory = await inventoryRows(tenantId, siteId, context.site.locale);
  const routes = await Promise.all([seoRoute("keyword_suggestions", context.site.locale), seoRoute("ranked_keywords", context.site.locale)]);
  const reason = routes.some((route) => route.provider) ? null : (routes[0] as { reason: string }).reason;
  if (reason && !inventory.length) {
    research.skipped = reason === "not_configured" || reason === "unsupported_market" ? reason : "disabled";
    return [];
  }
  const subjects = await keywordSubjects(tenantId, siteId, context);
  const stored = await storedKeywords(tenantId, context.site, context.site.locale, subjects);
  const own = ownRankings(stored.own);
  // The inventory goes last so a provider's row of the same keyword keeps its newer values.
  const metrics = [...stored.rows, ...inventory];
  const rejects: KeywordReject[] = [];
  const excluded = options.excludedTopics ?? [];
  const known = new Map([...inventory].reverse().map((row) => [keywordTokens(row.keyword).join(" "), row]));
  const found = rankKeywordCandidates(metrics, context, limit, own, rejects, scoring).flatMap<KeywordCandidate>((candidate) => {
    if (excluded.some((topic) => isAboutTopic(candidate.keyword, topic))) {
      rejects.push({ keyword: candidate.keyword, reason: "excluded_topic", volume: candidate.volume });
      return [];
    }
    const row = known.get(keywordTokens(candidate.keyword).join(" "));
    return [{ ...candidate, opportunityId: row?.opportunityId, approved: row?.approved ?? false, researchRunId: row?.researchRunId ?? null }];
  });
  const business = await prisma.siteSeoProfile.findFirst({ where: { tenantId, siteId }, select: { priorityTopics: true } });
  const priorityTopics = [...(options.priorityTopics ?? []), ...(Array.isArray(business?.priorityTopics) ? business.priorityTopics.map(String) : [])];
  const ranked = balanceCandidates(found, [...new Set([...context.clusters.map((cluster) => cluster.name), ...(context.profile?.mainTopics ?? [])])], priorityTopics);
  const candidates = ranked;
  Object.assign(research, {
    provider: ranked.find((candidate) => candidate.source !== "search_console")?.source ?? ranked[0]?.source ?? null,
    skipped: ranked.length ? null : "no_data",
    market: stored.market,
    seeds: stored.reason ? [] : (subjects.seeds as KeywordResearch["seeds"]),
    competitors: stored.reason ? [] : subjects.competitors.map(({ domain }) => domain),
    ownDomain: subjects.ownDomain,
    ownRankingKeywords: stored.own.length,
    reachableDifficulty: own.reachableDifficulty,
    rows: metrics.length,
    candidates: ranked.slice(0, MAX_STORED_CANDIDATES).map((candidate, index) => ({
      keyword: candidate.keyword, volume: candidate.volume, difficulty: candidate.difficulty, intent: candidate.intent, score: candidate.score,
      variants: candidate.variants, origin: candidate.origin ?? null, parts: candidate.parts ?? null, firstParty: candidate.firstParty ?? null, rank: index + 1,
    })),
    rejected: rejects.reduce<KeywordResearch["rejected"]>((counts, { reason: code }) => ({ ...counts, [code]: (counts[code] ?? 0) + 1 }), {}),
    rejectedSample: [...rejects].sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0)).slice(0, 25),
  } satisfies Partial<KeywordResearch>);
  structuredEvent("keyword_candidates.collected", { tenantId, siteId, rows: metrics.length, candidates: ranked.length, reachableDifficulty: own.reachableDifficulty });
  if (!options.reserveFor) return candidates;
  return reserveForPlanning({
    tenantId, siteId, market: context.site.locale, holder: options.reserveFor, limit: options.reserve ?? limit,
    candidates: candidates.map((candidate) => ({ ...candidate, evidence: evidenceOfCandidate(candidate) })),
  });
}
