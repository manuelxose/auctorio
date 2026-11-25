// The decision engine over a site's stored data. It reads the database only: nothing here calls a provider.

import { Prisma } from "@prisma/client";
import { getPrismaClient } from "../../infrastructure/db/prisma";
import { structuredEvent } from "../../shared/utils/logger";
import { writeAudit } from "../audit";
import { buildEditorialPlanningContext } from "../editorial-plan-context";
import { REACHABLE_DIFFICULTY, keywordScoringFor } from "../keyword-candidates";
import { DAY_MS, addDays, day } from "../search-console";
import { classifyCannibalization, computeSiteRelevanceScore, syntheticProfileForSiteType } from "../site-relevance";
import { evaluateActions, linkPublishedActions, recordSeoAction } from "./attribution";
import { base, detectOpportunities, pageKey, queryKey, type Draft, type QueryRow, type SearchData } from "./detect";
import { pageTotals, siteTotals } from "./performance";
import { FACTORS, SEO_PROFILES, isSeoProfile, resolveWeights, type SeoAction } from "./scoring";
import { decideOpportunities, type DecisionContext } from "./select";

const prisma = getPrismaClient();
const WINDOW = 28;
/** Minimum stored history before any search rule runs. */
const MIN_HISTORY_DAYS = 28;
// Serializes the analysis of one site between processes.
const ANALYSIS_LOCK = 846_204;

/** Figures of the last windows, or null when there is not enough history to decide anything. */
export async function loadSearchData(tenantId: string, siteId: string): Promise<SearchData | null> {
  const connection = await prisma.searchConsoleConnection.findFirst({ where: { tenantId, siteId }, select: { syncedFrom: true, syncedThrough: true } });
  const { syncedFrom: oldest, syncedThrough: through } = connection ?? {};
  if (!oldest || !through || (through.getTime() - oldest.getTime()) / DAY_MS + 1 < MIN_HISTORY_DAYS) return null;
  const window = (shift: number) => ({ from: addDays(through, -shift - WINDOW + 1), to: addDays(through, -shift) });
  const stored = (shift: number) => window(shift).from >= oldest;
  const pages = (shift: number) => pageTotals(tenantId, siteId, window(shift).from, window(shift).to);
  const current = window(0);
  const previous = window(WINDOW);
  const rows = await prisma.$queryRaw<Array<{ query: string; page: string; device: string; country: string; clicks: number; impressions: number; position_sum: number; days: number }>>`
    SELECT query, page, device, country, SUM(clicks)::int AS clicks, SUM(impressions)::int AS impressions, SUM(position_sum)::float8 AS position_sum,
      COUNT(DISTINCT date)::int AS days
    FROM search_performance WHERE tenant_id = ${tenantId}::uuid AND site_id = ${siteId}::uuid AND dataset = 'query' AND date BETWEEN ${day(current.from)}::date AND ${day(current.to)}::date
    GROUP BY query, page, device, country`;
  const before = await prisma.$queryRaw<Array<{ query: string; page: string; impressions: number }>>`
    SELECT query, page, SUM(impressions)::int AS impressions
    FROM search_performance WHERE tenant_id = ${tenantId}::uuid AND site_id = ${siteId}::uuid AND dataset = 'query' AND date BETWEEN ${day(previous.from)}::date AND ${day(previous.to)}::date
    GROUP BY query, page`;
  const previousQueries = new Map<string, number>();
  for (const row of before) {
    const key = `${queryKey(row.query)}\n${pageKey(row.page)}`;
    previousQueries.set(key, (previousQueries.get(key) ?? 0) + row.impressions);
  }
  const year = stored(364 + WINDOW);
  const [pagesNow, pagesPrevious, pagesBefore, pagesYearAgo, pagesYearAgoPrevious, pagesYearAgoNext, site, sitePrevious] = await Promise.all([
    pages(0), pages(WINDOW), pages(2 * WINDOW), stored(364) ? pages(364) : null, year ? pages(364 + WINDOW) : null, stored(364) ? pages(364 - WINDOW) : null,
    siteTotals(tenantId, siteId, current.from, current.to), siteTotals(tenantId, siteId, previous.from, previous.to),
  ]);
  return {
    from: day(current.from), through: day(through),
    current: rows.map<QueryRow>((row) => ({ query: row.query, page: row.page, device: row.device, country: row.country, clicks: row.clicks, impressions: row.impressions, positionSum: row.position_sum, days: row.days })),
    previousQueries, hasPrevious: stored(WINDOW), pages: pagesNow, pagesPrevious, pagesBefore, hasBefore: stored(2 * WINDOW),
    pagesYearAgo, pagesYearAgoPrevious, pagesYearAgoNext, site, sitePrevious,
  };
}

const COMPETITOR_ACTIONS: Record<string, SeoAction> = {
  missing_topic: "create_content", differentiated_angle: "create_content", underdeveloped_cluster: "strengthen_cluster", improve_existing: "update_existing", cannibalization_risk: "investigate_cannibalization",
};

/** Opportunities found elsewhere (competitors, provider rankings) become drafts so they are weighed like the rest. */
function storedDrafts(rows: Array<{ source: string; kind: string; topic: string; query: string | null; targetUrl: string | null; relatedSiteUrls: unknown; rationale: string; evidence: unknown; dedupeKey: string }>): Draft[] {
  return rows.flatMap<Draft>((row) => {
    const relatedUrls = Array.isArray(row.relatedSiteUrls) ? (row.relatedSiteUrls as string[]) : [];
    if (row.source === "provider") {
      const provider = (row.evidence as { provider?: { source: string; volume: number | null; difficulty: number | null; intent: string | null; position: number | null; asOf: string | null } } | null)?.provider;
      if (!provider) return [];
      return [base({
        source: "provider", kind: row.kind, topic: row.topic, query: row.query, targetUrl: row.targetUrl, relatedUrls, action: "update_existing", intent: provider.intent, why: row.rationale,
        actionReason: "Ya hay una página que posiciona: mejorarla antes que crear otra.", volume: provider.volume, difficulty: provider.difficulty, position: provider.position,
        evidence: [
          { metric: "Posición según el proveedor", value: provider.position, kind: "provider_reported", source: "provider", period: provider.asOf ?? undefined, note: "Resultado guardado por el proveedor, no observado por el sitio." },
          { metric: "Volumen mensual", value: provider.volume, kind: "provider_reported", source: "provider" },
          { metric: "Dificultad", value: provider.difficulty, kind: provider.difficulty === null ? "unknown" : "provider_reported", source: "provider" },
        ],
        risks: ["Cambiar una página que ya posiciona puede empeorarla."], caveats: ["Sin datos propios: la posición la informa un proveedor."], dedupeKey: row.dedupeKey,
      })];
    }
    const action = COMPETITOR_ACTIONS[row.kind];
    if (!action) return [];
    const pages = Array.isArray(row.evidence) ? (row.evidence as Array<{ url?: string }>) : [];
    return [base({
      source: "competitor", kind: row.kind, topic: row.topic, query: action === "create_content" ? row.topic : null, targetUrl: row.targetUrl, relatedUrls, action, why: row.rationale,
      actionReason: "Propuesta a partir de la cobertura observada en competidores aceptados.", competitorPages: pages.length,
      evidence: [{ metric: "Páginas de competidores en la muestra", value: pages.length, kind: "observed", source: "competitors" }],
      risks: ["Que un competidor lo cubra no prueba que haya demanda."], caveats: ["Muestra parcial de títulos de competidores."], dedupeKey: row.dedupeKey,
    })];
  });
}

export type AnalysisSummary = { analyzed: number; open: number; monitoring: number; deferred: number; rejected: number; expired: number; firstPartyData: boolean };

/** Detects, scores and stores the site's opportunities. Repeating it changes nothing unless the data changed. */
export async function analyzeSite(tenantId: string, siteId: string, now = new Date()): Promise<AnalysisSummary> {
  const context = await buildEditorialPlanningContext(tenantId, siteId);
  await linkPublishedActions(tenantId, siteId);
  const [site, data, connection, pages, inbound, clusters, index, stored, settings, actions, plannedItems, publications] = await Promise.all([
    prisma.site.findFirstOrThrow({ where: { id: siteId, tenantId }, select: { id: true, type: true, name: true, baseUrl: true } }),
    loadSearchData(tenantId, siteId),
    prisma.searchConsoleConnection.findFirst({ where: { tenantId, siteId }, select: { syncedThrough: true } }),
    prisma.siteIndexedPage.findMany({ where: { tenantId, siteId }, select: { url: true, title: true, h1: true, modifiedAt: true, publishedAt: true, crawlState: true }, take: 20_000 }),
    prisma.siteInternalLink.groupBy({ by: ["targetUrl"], where: { tenantId, siteId }, _count: { _all: true } }),
    prisma.siteTopicCluster.findMany({ where: { tenantId, siteId }, select: { name: true, slug: true, pagesCount: true } }),
    prisma.searchIndexStatus.findMany({ where: { tenantId, siteId } }),
    prisma.contentOpportunity.findMany({ where: { tenantId, siteId, source: { in: ["competitor", "provider"] }, decidedAt: null } }),
    prisma.siteSeoProfile.findFirst({ where: { tenantId, siteId } }),
    prisma.seoAction.findMany({ where: { tenantId, siteId }, select: { url: true, actedAt: true } }),
    prisma.editorialPlanItem.findMany({ where: { tenantId, siteId, status: { notIn: ["rejected", "canceled"] } }, select: { primaryKeyword: true, targetQuery: true }, take: 5_000 }),
    prisma.publication.findMany({ where: { tenantId, siteId, status: "published", publishedAt: { gte: addDays(now, -60) }, externalUrl: { not: null } }, select: { externalUrl: true, publishedAt: true } }),
  ]);
  const scoring = await keywordScoringFor(tenantId, site, context.profile?.detectedSiteType ?? null);
  const profile = context.profile ?? syntheticProfileForSiteType(site.type);
  // Most addresses come from sitemaps unread: what few read pages link to or talk about says nothing of the whole site.
  const wellRead = pages.filter((page) => page.crawlState === "extracted" || page.crawlState === "stale").length >= pages.length * 0.8;
  const readClusters = wellRead ? clusters : [];
  const links = new Map<string, number>();
  for (const row of inbound) links.set(pageKey(row.targetUrl), (links.get(pageKey(row.targetUrl)) ?? 0) + row._count._all);
  const inventory = pages.map((page) => ({ url: page.url, title: page.title ?? "", h1: page.h1 ?? "", modifiedAt: page.modifiedAt, publishedAt: page.publishedAt, inbound: wellRead && links.size ? links.get(pageKey(page.url)) ?? 0 : null }));

  const touched = new Map<string, Date>();
  const touch = (url: string | null, at: Date | null) => {
    if (!url || !at) return;
    const key = pageKey(url);
    if (!touched.has(key) || touched.get(key)! < at) touched.set(key, at);
  };
  // Not the crawled modification date: many sites stamp every page every day.
  for (const page of pages) touch(page.url, page.publishedAt);
  for (const publication of publications) touch(publication.externalUrl, publication.publishedAt);
  for (const action of actions) touch(action.url, action.actedAt);

  const relevanceCache = new Map<string, ReturnType<DecisionContext["relevance"]>>();
  const decisionContext: DecisionContext = {
    profile: scoring.profile,
    weights: scoring.weights,
    priorityTopics: Array.isArray(settings?.priorityTopics) ? (settings!.priorityTopics as string[]) : [],
    reachableDifficulty: REACHABLE_DIFFICULTY,
    relevance: (subject) => {
      const cached = relevanceCache.get(subject);
      if (cached !== undefined) return cached;
      const brief = { topic: subject, primaryKeyword: subject, targetQuery: subject, topicCluster: null, contentType: "guide", primaryIntent: "informational" } as never;
      const verdict = computeSiteRelevanceScore(brief, profile, subject);
      // Without topics of its own there is nothing to compare with: unknown, not irrelevant.
      const value = profile.mainTopics.length === 0 ? null : { score: verdict.score, offTopic: verdict.reasons.some((reason) => reason.startsWith("off-topic") || reason.startsWith("excluded")) };
      relevanceCache.set(subject, value);
      return value;
    },
    cannibalization: (query) => classifyCannibalization({ targetQuery: query, primaryKeyword: query, suggestedSlug: undefined } as never, query, {
      queries: [...context.searchTargets, ...context.existingPlanQueries], keywords: context.existingPlanQueries, indexedUrls: context.indexedUrlInventory, plannedTitles: context.existingPlanTitles,
    }).risk,
    clusters: readClusters,
    plannedQueries: plannedItems.flatMap((item) => [item.primaryKeyword, item.targetQuery]).filter((value): value is string => Boolean(value)),
    touched,
    dataAgeDays: connection?.syncedThrough ? Math.max(0, Math.round((now.getTime() - connection.syncedThrough.getTime()) / DAY_MS)) : null,
    holdoutPercent: settings?.holdoutPercent ?? 0,
    now,
  };
  const brandTokens = [...(site.baseUrl && URL.canParse(site.baseUrl) ? [new URL(site.baseUrl).hostname.replace(/^www\./, "").split(".")[0]] : []), site.name.toLowerCase().replace(/\s+/g, "")];
  const decisions = decideOpportunities([...detectOpportunities({ data, inventory, clusters: readClusters, index, brandTokens, now }), ...storedDrafts(stored)], decisionContext);

  const summary: AnalysisSummary = { analyzed: decisions.length, open: 0, monitoring: 0, deferred: 0, rejected: 0, expired: 0, firstPartyData: data !== null };
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${ANALYSIS_LOCK}::int, hashtext(${siteId}))`;
    const existing = new Map((await tx.contentOpportunity.findMany({ where: { tenantId, siteId }, select: { id: true, dedupeKey: true, decidedAt: true } })).map((row) => [row.dedupeKey, row]));
    for (const decision of decisions) {
      const { draft } = decision;
      const dedupeKey = draft.dedupeKey.slice(0, 500);
      const row = existing.get(dedupeKey);
      summary[decision.status] += 1;
      const scored = {
        action: decision.action, score: decision.score, confidence: decision.confidence, priority: decision.priority, analyzedAt: now,
        explanation: decision.explanation as unknown as Prisma.InputJsonValue,
        // Competitor opportunities keep the status people work with; the engine only weighs them.
        ...(row?.decidedAt || draft.source === "competitor" ? {} : { status: decision.status }),
      };
      if (draft.source === "competitor" || draft.source === "provider") {
        if (row) await tx.contentOpportunity.update({ where: { id: row.id }, data: scored });
        continue;
      }
      // A decision already taken keeps the explanation it was taken with.
      if (row?.decidedAt) continue;
      const facts = {
        rationale: draft.why, targetUrl: draft.targetUrl, query: draft.query, relatedSiteUrls: draft.relatedUrls as unknown as Prisma.InputJsonValue,
        evidence: { firstParty: draft.impressions === null ? null : { impressions: draft.impressions, clicks: draft.clicks ?? 0, position: draft.position, intent: draft.intent } } as Prisma.InputJsonObject,
      };
      if (row) await tx.contentOpportunity.update({ where: { id: row.id }, data: { ...facts, ...scored, kind: draft.kind, topic: draft.topic } });
      else await tx.contentOpportunity.create({ data: { tenantId, siteId, source: draft.source, kind: draft.kind, topic: draft.topic, dedupeKey, ...facts, ...scored } });
    }
    // No longer detected: the data moved on. Without search data nothing can be said about what it had found.
    const expired = await tx.contentOpportunity.updateMany({
      where: {
        tenantId, siteId, decidedAt: null, status: { not: "expired" }, source: { in: data ? ["search_console", "crawl"] : ["crawl"] },
        OR: [{ analyzedAt: null }, { analyzedAt: { lt: now } }],
      },
      data: { status: "expired" },
    });
    summary.expired = expired.count;
  }, { timeout: 60_000, maxWait: 20_000 });
  await evaluateActions(tenantId, siteId, now);
  structuredEvent("seo_intelligence.analyzed", { tenantId, siteId, ...summary });
  return summary;
}

async function requireSite(tenantId: string, siteId: string) {
  const site = await prisma.site.findFirst({ where: { id: siteId, tenantId }, select: { id: true, type: true } });
  if (!site) throw new Error("site_not_found");
  return site;
}

export async function listSeoOpportunities(tenantId: string, siteId: string, filters: { status?: string; action?: string; take?: number } = {}) {
  await requireSite(tenantId, siteId);
  return prisma.contentOpportunity.findMany({
    where: { tenantId, siteId, action: filters.action ?? { not: null }, ...(filters.status ? { status: filters.status } : {}) },
    orderBy: [{ priority: { sort: "desc", nulls: "last" } }, { updatedAt: "desc" }],
    take: filters.take ?? 200,
    select: {
      id: true, source: true, kind: true, topic: true, query: true, targetUrl: true, relatedSiteUrls: true, rationale: true, action: true, status: true, score: true, confidence: true, priority: true,
      explanation: true, planItemId: true, decidedAt: true, analyzedAt: true,
      actions: { select: { id: true, actedAt: true, url: true, evaluations: true, baseline: true, seoCostUsd: true, contentCostUsd: true } },
    },
  });
}

/** Statuses a person may set; planning and completing have their own operations. */
export const OPPORTUNITY_DECISIONS = ["approved", "dismissed", "open"] as const;

export async function decideSeoOpportunity(tenantId: string, siteId: string, id: string, decision: (typeof OPPORTUNITY_DECISIONS)[number], userId: string | null) {
  const row = await prisma.contentOpportunity.findFirst({ where: { id, tenantId, siteId } });
  if (!row) throw new Error("opportunity_not_found");
  if (["completed", "planned", "expired"].includes(row.status)) throw new Error("opportunity_already_acted");
  // Two approved actions on the same page would hide each other's effect.
  if (decision === "approved" && row.targetUrl) {
    const others = await prisma.contentOpportunity.findMany({ where: { tenantId, siteId, id: { not: id }, status: "approved", targetUrl: { not: null } }, select: { targetUrl: true } });
    if (others.some((other) => pageKey(other.targetUrl!) === pageKey(row.targetUrl!))) throw new Error("opportunity_conflicts_with_approved");
  }
  const updated = await prisma.contentOpportunity.updateMany({ where: { id, tenantId, siteId, status: row.status }, data: { status: decision, decidedAt: decision === "open" ? null : new Date() } });
  if (updated.count !== 1) throw new Error("opportunity_changed");
  await writeAudit({ tenantId, actorType: userId ? "user" : "system", actorUserId: userId, action: `seo_opportunity.${decision}`, entityType: "content_opportunity", entityId: id, metadata: { seoAction: row.action, targetUrl: row.targetUrl } });
}

/** A person says when the change went live: measuring starts there. */
export async function completeSeoOpportunity(tenantId: string, siteId: string, id: string, input: { actedAt: Date; url: string | null }, userId: string | null) {
  const row = await prisma.contentOpportunity.findFirst({ where: { id, tenantId, siteId }, include: { site: { select: { baseUrl: true } } } });
  if (!row) throw new Error("opportunity_not_found");
  if (row.status === "completed" || row.status === "dismissed") throw new Error("opportunity_already_acted");
  const url = input.url ?? row.targetUrl;
  const host = (value: string) => new URL(value).hostname.replace(/^www\./, "");
  if (!url) throw new Error("url_required");
  if (!row.site.baseUrl || !URL.canParse(url) || host(url) !== host(row.site.baseUrl)) throw new Error("url_not_of_this_site");
  const action = await recordSeoAction({ tenantId, siteId, opportunityId: id, action: row.action ?? "update_existing", url, query: row.query, actedAt: input.actedAt, planItemId: row.planItemId, publicationId: null, seoCostUsd: row.source === "provider" ? null : 0, contentCostUsd: null });
  await prisma.contentOpportunity.update({ where: { id }, data: { status: "completed", decidedAt: new Date() } });
  await writeAudit({ tenantId, actorType: userId ? "user" : "system", actorUserId: userId, action: "seo_opportunity.completed", entityType: "content_opportunity", entityId: id, metadata: { url, actedAt: input.actedAt.toISOString() } });
  return action;
}

export async function getSeoProfile(tenantId: string, siteId: string) {
  const site = await requireSite(tenantId, siteId);
  const [saved, detected] = await Promise.all([
    prisma.siteSeoProfile.findFirst({ where: { tenantId, siteId } }),
    prisma.siteIntelligenceProfile.findFirst({ where: { tenantId, siteId }, select: { detectedSiteType: true } }),
  ]);
  const { profile, weights } = await keywordScoringFor(tenantId, site, detected?.detectedSiteType ?? null);
  return {
    profile, chosen: Boolean(saved), weights, defaults: resolveWeights(profile), priorityTopics: (saved?.priorityTopics as string[] | null) ?? [], holdoutPercent: saved?.holdoutPercent ?? 0,
    profiles: SEO_PROFILES, factors: FACTORS,
  };
}

export async function saveSeoProfile(tenantId: string, siteId: string, input: { profile: unknown; weights?: unknown; priorityTopics?: unknown; holdoutPercent?: unknown }, userId: string | null) {
  await requireSite(tenantId, siteId);
  if (!isSeoProfile(input.profile)) throw new Error("invalid_profile");
  const entries = Object.entries((input.weights ?? {}) as Record<string, unknown>);
  if (entries.some(([key, value]) => !(FACTORS as readonly string[]).includes(key) || typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 3)) throw new Error("invalid_weights");
  const topics = input.priorityTopics ?? [];
  if (!Array.isArray(topics) || topics.length > 20 || topics.some((topic) => typeof topic !== "string" || !topic.trim() || topic.length > 100)) throw new Error("invalid_priority_topics");
  const holdout = input.holdoutPercent ?? 0;
  if (typeof holdout !== "number" || !Number.isInteger(holdout) || holdout < 0 || holdout > 30) throw new Error("invalid_holdout_percent");
  const data = { profile: input.profile, weights: entries.length ? (Object.fromEntries(entries) as Prisma.InputJsonObject) : Prisma.DbNull, priorityTopics: topics.map((topic: string) => topic.trim()), holdoutPercent: holdout };
  await prisma.siteSeoProfile.upsert({ where: { siteId }, create: { tenantId, siteId, ...data }, update: data });
  await writeAudit({ tenantId, actorType: userId ? "user" : "system", actorUserId: userId, action: "seo_profile.updated", entityType: "site", entityId: siteId, metadata: { profile: input.profile, weights: Object.fromEntries(entries), holdoutPercent: holdout } });
  return getSeoProfile(tenantId, siteId);
}
