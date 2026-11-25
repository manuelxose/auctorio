// What a workspace sees of its SEO intelligence (SEO-V2-06): one site's knowledge, performance and allowance, read from stored
// data. Nothing here calls a provider, and no amount of money, price or provider account ever leaves through it.

import { Prisma } from "@prisma/client";
import { getPrismaClient } from "../infrastructure/db/prisma";
import { normalizeKeyword, seoMarket } from "../infrastructure/seo/contract";
import { addDays, day, getSearchConsoleStatus } from "./search-console";
import { readSeoControl } from "./seo-control";
import { applicableBudgets, budgetUse } from "./seo-governor";
import { sharableNow } from "./seo-licensing";
import { seoRoute } from "./seo-manager";
import { outcomeSummary, type Evaluation } from "./seo-intelligence/attribution";
import { pageTotals, siteTotals } from "./seo-intelligence/performance";
import { pageKey, type PageTotals } from "./seo-intelligence/detect";
import { intensityOf } from "./seo-research/policy";
import { getResearchProfile, researchTopics } from "./seo-research/profile";
import { PLANNABLE, reservoirCoverage } from "./seo-research/reservoir";
import { estimateResearch, getResearchOverview, researchHold } from "./seo-research/runs";
import { keywordHistory, knownKeywordMetrics } from "./seo-research/knowledge";
import type { ResearchFocus } from "./seo-research/triggers";

const prisma = getPrismaClient();
const DAY_MS = 86_400_000;

async function requireSite(tenantId: string, siteId: string) {
  const site = await prisma.site.findFirst({ where: { id: siteId, tenantId }, select: { id: true, name: true, locale: true, createdAt: true, tenant: { select: { plan: true } } } });
  if (!site) throw new Error("site_not_found");
  return site;
}

// ---- No amounts ----

const MONEY_KEY = /usd$|cost|price|billed/i;
/** As the governor and the spending limits write amounts; a keyword that names a price stays as it is. */
const MONEY_TEXT = /\d+\.\d{4} USD|(?<=can cost )\d+\.\d+|(?<=\b(?:spent|hard|limit)=)\d+\.\d+/g;

/** Wholesale amounts and provider accounts are the platform's: removed from whatever a workspace receives. */
export function withoutCosts<T>(value: T): T {
  if (typeof value === "string") return value.replace(MONEY_TEXT, "—") as T;
  if (Array.isArray(value)) return value.map(withoutCosts) as T;
  if (!value || typeof value !== "object" || value instanceof Date) return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => !MONEY_KEY.test(key) && key !== "providerId").map(([key, entry]) => [key, withoutCosts(entry)])) as T;
}

/** A run as a workspace may see it: no amounts, and the platform's own errors only by name. */
export function runForWorkspace<T extends { error: string | null; tasks?: Array<{ reason: string | null }> }>(run: T): T {
  const named = (text: string | null) => (text === null || /^[a-z_]+$/.test(text) ? text : "unexpected_failure");
  return withoutCosts({ ...run, error: named(run.error), ...(run.tasks ? { tasks: run.tasks.map((task) => ({ ...task, reason: named(task.reason) })) } : {}) });
}

// ---- Allowance ----

export type ResearchAllowance = {
  /** low = under a fifth left; platform_limit = the workspace has allowance, the platform does not. */
  state: "available" | "low" | "exhausted" | "platform_limit" | "stopped" | "disabled" | "no_provider";
  kind: "onboarding" | "recurring";
  /** Of the tightest limit of the subscription, workspace or site. */
  usedPercent: number;
  /** When that limit renews; null for a one-off allowance. */
  renewsAt: string | null;
  /** The platform and the site both let research start by itself. */
  automatic: boolean;
  /** Why the platform keeps automatic research off here. */
  held: string | null;
};

async function allowanceOf(tenantId: string, siteId: string, now = new Date()): Promise<{ view: ResearchAllowance; own: { remainingUsd: number; limitUsd: number } }> {
  const site = await requireSite(tenantId, siteId);
  const [control, profile, hold] = await Promise.all([readSeoControl(), getResearchProfile(tenantId, siteId), researchHold(tenantId, siteId)]);
  const market = profile.markets.value?.[0] ?? site.locale;
  const routes = await Promise.all([seoRoute("keyword_suggestions", market), seoRoute("ranked_keywords", market)]);
  const provider = routes.find((entry) => entry.provider)?.provider ?? null;
  const kind = now.getTime() - site.createdAt.getTime() < control.policy.onboardingDays * DAY_MS ? "onboarding" : "recurring";
  const budgets = await applicableBudgets(prisma, { tenantId, siteId, providerId: provider?.id ?? "none", plan: site.tenant.plan ?? "none", operation: "keyword_suggestions", allowance: kind }, now);
  const use = await budgetUse(prisma, budgets, now);
  const rows = budgets.map((budget, index) => {
    const limitUsd = budget.limitUsd + budget.extraUsd;
    const remainingUsd = Math.max(0, limitUsd - use[index].actualUsd - use[index].heldUsd);
    return { ...budget, limitUsd, remainingUsd, used: limitUsd > 0 ? 1 - remainingUsd / limitUsd : 1 };
  });
  const own = rows.filter((row) => row.scope === "plan" || row.scope === "tenant" || row.scope === "site");
  const tightest = own.reduce<(typeof own)[number] | null>((worst, row) => (!worst || row.used > worst.used ? row : worst), null);
  // What people plan with is the smallest allowance of the long periods; a daily limit is burst protection.
  const main = own.filter((row) => row.period !== "daily").reduce<(typeof own)[number] | null>((least, row) => (!least || row.limitUsd < least.limitUsd ? row : least), null) ?? tightest;
  const remainingUsd = Math.min(Number.MAX_SAFE_INTEGER, ...own.map((row) => row.remainingUsd));
  const usedPercent = Math.min(100, Math.round((tightest?.used ?? 0) * 100));
  const state: ResearchAllowance["state"] = control.emergencyStop ? "stopped"
    : control.mode === "disabled" ? "disabled"
      : !provider ? "no_provider"
        : remainingUsd <= 0 ? "exhausted"
          : rows.some((row) => (row.scope === "global" || row.scope === "provider") && row.remainingUsd <= 0) ? "platform_limit"
            : usedPercent >= 80 ? "low" : "available";
  const renewsAt = !tightest || tightest.period === "total" ? null
    : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + (tightest.period === "monthly" ? 1 : 0), tightest.period === "daily" ? now.getUTCDate() + 1 : 1)).toISOString();
  return {
    view: { state, kind, usedPercent, renewsAt, automatic: control.policy.automaticResearch && profile.policy.mode === "automatic" && !hold, held: hold?.reason ?? null },
    own: { remainingUsd, limitUsd: main?.limitUsd ?? 0 },
  };
}

export const researchAllowance = async (tenantId: string, siteId: string): Promise<ResearchAllowance> => (await allowanceOf(tenantId, siteId)).view;

/** What a research request would ask for and its share of the allowance. Buys and changes nothing. */
export async function previewResearch(tenantId: string, siteId: string, focus: ResearchFocus = {}) {
  const [estimate, allowance] = await Promise.all([estimateResearch(tenantId, siteId, focus), allowanceOf(tenantId, siteId)]);
  const share = (usd: number) => (allowance.own.limitUsd > 0 ? Math.min(100, Math.ceil((usd / allowance.own.limitUsd) * 100)) : 100);
  const buys = estimate.acquisitions.some((entry) => !entry.blocked);
  return {
    acquisitions: estimate.acquisitions.map(({ kind, subject, market, reason, focus: asked, blocked }) => ({ kind, subject, market, reason, focus: asked, blocked })),
    /** The run's ceiling: later steps may add to what is known now, never past it. */
    maxPercent: buys ? share(estimate.ceilingUsd) : 0,
    knownPercent: buys ? share(estimate.maxUsd) : 0,
    exceedsAllowance: buys && estimate.maxUsd > allowance.own.remainingUsd,
    allowance: allowance.view,
    coverage: estimate.coverage,
  };
}

/** The research page's data, as a workspace may see it. */
export async function researchForWorkspace(tenantId: string, siteId: string) {
  const [overview, allowance] = await Promise.all([getResearchOverview(tenantId, siteId), researchAllowance(tenantId, siteId)]);
  return withoutCosts({ ...overview, runs: overview.runs.map(runForWorkspace), active: overview.active && runForWorkspace(overview.active), intensity: intensityOf(overview.profile.policy), allowance });
}

// ---- Overview ----

const figures = (totals: PageTotals) => ({ clicks: totals.clicks, impressions: totals.impressions, position: totals.impressions ? totals.positionSum / totals.impressions : null, days: totals.days });

async function organic(tenantId: string, siteId: string, through: Date, days: number) {
  const [now, before] = await Promise.all([siteTotals(tenantId, siteId, addDays(through, 1 - days), through), siteTotals(tenantId, siteId, addDays(through, 1 - 2 * days), addDays(through, -days))]);
  // A comparison with a window that is not fully stored would invent a trend.
  return { from: day(addDays(through, 1 - days)), through: day(through), days, current: figures(now), previous: before.days >= days * 0.9 ? figures(before) : null };
}

export type NextAction = "read_site" | "connect_search_console" | "research_running" | "plan_approved" | "review_opportunities" | "request_research" | "up_to_date";

export async function workspaceOverview(tenantId: string, siteId: string) {
  const site = await requireSite(tenantId, siteId);
  const [connection, profile, allowance, statuses, top, approved, pages, run, keywords] = await Promise.all([
    getSearchConsoleStatus(tenantId, siteId), getResearchProfile(tenantId, siteId), researchAllowance(tenantId, siteId),
    prisma.contentOpportunity.groupBy({ by: ["status"], where: { tenantId, siteId, action: { not: null } }, _count: { _all: true } }),
    prisma.contentOpportunity.findMany({
      where: { tenantId, siteId, status: { in: ["open", "approved"] }, action: { not: null } }, orderBy: [{ priority: { sort: "desc", nulls: "last" } }], take: 5,
      select: { id: true, topic: true, action: true, status: true, score: true, confidence: true, rationale: true, targetUrl: true },
    }),
    prisma.contentOpportunity.count({ where: { tenantId, siteId, status: "approved", action: { in: [...PLANNABLE] }, planItemId: null } }),
    prisma.siteIndexedPage.groupBy({ by: ["crawlState"], where: { tenantId, siteId }, _count: { _all: true } }),
    prisma.seoResearchRun.findFirst({ where: { tenantId, siteId }, orderBy: { createdAt: "desc" }, select: { id: true, status: true, trigger: true, createdAt: true, finishedAt: true } }),
    prisma.siteKeyword.count({ where: { tenantId, siteId } }),
  ]);
  const coverage = await reservoirCoverage(tenantId, siteId, profile.policy, researchTopics(profile));
  const counts = Object.fromEntries(statuses.map((row) => [row.status, row._count._all])) as Record<string, number>;
  const total = pages.reduce((sum, row) => sum + row._count._all, 0);
  const read = pages.filter((row) => row.crawlState === "extracted" || row.crawlState === "stale").reduce((sum, row) => sum + row._count._all, 0);
  const running = run && ["queued", "running", "paused"].includes(run.status);
  const nextAction: NextAction = !total ? "read_site"
    : connection.configured && connection.status !== "active" ? "connect_search_console"
      : running ? "research_running"
        : approved ? "plan_approved"
          : counts.open ? "review_opportunities"
            : !coverage.sufficient && (allowance.state === "available" || allowance.state === "low") ? "request_research"
              : "up_to_date";
  return withoutCosts({
    site: { id: site.id, name: site.name },
    research: { lastRun: run, keywords, pages: { total, read } },
    connection, organic: connection.syncedThrough ? await organic(tenantId, siteId, new Date(connection.syncedThrough), 28) : null,
    opportunities: { open: counts.open ?? 0, approved: counts.approved ?? 0, planned: counts.planned ?? 0, waiting: (counts.deferred ?? 0) + (counts.monitoring ?? 0), completed: counts.completed ?? 0 },
    recommendations: top, coverage, allowance, nextAction,
  });
}

// ---- Keywords ----

export type KeywordQuery = { search?: string; view?: string; cluster?: string; intent?: string; sort?: string; page?: number };
export const KEYWORD_PAGE_SIZE = 50;

type OwnQuery = { clicks: number; impressions: number; position: number | null; page: string | null };

/** Own clicks and impressions of the last 28 stored days by query, with the page that got most of them. */
async function ownQueries(tenantId: string, siteId: string, through: Date | null): Promise<Map<string, OwnQuery>> {
  const out = new Map<string, OwnQuery & { sum: number }>();
  if (!through) return out;
  const rows = await prisma.$queryRaw<Array<{ query: string; page: string; clicks: number; impressions: number; position_sum: number }>>`
    SELECT query, page, SUM(clicks)::int AS clicks, SUM(impressions)::int AS impressions, SUM(position_sum)::float8 AS position_sum
    FROM search_performance WHERE tenant_id = ${tenantId}::uuid AND site_id = ${siteId}::uuid AND dataset = 'query' AND date BETWEEN ${day(addDays(through, -27))}::date AND ${day(through)}::date
    GROUP BY query, page ORDER BY SUM(clicks) DESC, SUM(impressions) DESC`;
  for (const row of rows) {
    const key = normalizeKeyword(row.query);
    const at = out.get(key) ?? { clicks: 0, impressions: 0, position: null, page: row.page || null, sum: 0 };
    at.clicks += row.clicks;
    at.impressions += row.impressions;
    at.sum += row.position_sum;
    at.position = at.impressions ? at.sum / at.impressions : null;
    out.set(key, at);
  }
  return out;
}

/** One page of the site's keywords. A figure nobody reported is null, never zero. */
export async function workspaceKeywords(tenantId: string, siteId: string, query: KeywordQuery) {
  await requireSite(tenantId, siteId);
  const connection = await prisma.searchConsoleConnection.findFirst({ where: { tenantId, siteId }, select: { syncedThrough: true } });
  // shortcut: the site's keywords (at most 1,000 per market) are joined in memory; move to SQL if that ceiling grows.
  const [rows, own, control] = await Promise.all([
    prisma.siteKeyword.findMany({
      where: { tenantId, siteId }, take: 5_000,
      select: {
        id: true, market: true, keyword: true, status: true, reason: true, level: true, score: true, cluster: true, opportunityId: true,
        discoveries: { select: { kind: true, value: true, position: true, url: true, discoveredAt: true }, orderBy: { discoveredAt: "desc" }, take: 5 },
      },
    }),
    ownQueries(tenantId, siteId, connection?.syncedThrough ?? null), readSeoControl(),
  ]);
  const sharable = await sharableNow(control.policy.shareMarketData);
  const metrics = new Map<string, Awaited<ReturnType<typeof knownKeywordMetrics>>>();
  for (const market of new Set(rows.map((row) => row.market))) {
    const place = seoMarket(market);
    if (place) metrics.set(market, await knownKeywordMetrics(tenantId, place, rows.filter((row) => row.market === market).map((row) => row.keyword), { maxAgeDays: 730, sharable }));
  }
  const linked = await prisma.contentOpportunity.findMany({ where: { tenantId, siteId, id: { in: rows.flatMap((row) => (row.opportunityId ? [row.opportunityId] : [])) } }, select: { id: true, targetUrl: true, action: true, status: true } });
  const opportunities = new Map(linked.map((row) => [row.id, row]));
  const items = rows.map((row) => {
    const key = normalizeKeyword(row.keyword);
    const metric = metrics.get(row.market)?.get(key);
    const seen = own.get(key);
    const opportunity = row.opportunityId ? opportunities.get(row.opportunityId) ?? null : null;
    const ageDays = metric ? Math.floor((Date.now() - metric.confirmedAt.getTime()) / DAY_MS) : null;
    return {
      id: row.id, keyword: row.keyword, market: row.market, status: row.status, reason: row.reason, score: row.score, cluster: row.cluster, level: row.level,
      volume: metric?.volume ?? null, difficulty: metric?.difficulty ?? null, cpc: metric?.cpc ?? null, intent: metric?.intent ?? null,
      quality: metric?.quality ?? null, measuredAt: metric?.confirmedAt.toISOString() ?? null, ageDays,
      freshness: ageDays === null ? ("unmeasured" as const) : ageDays <= control.policy.freshness.keyword_metrics.days ? ("fresh" as const) : ("stale" as const),
      impressions: seen?.impressions ?? null, clicks: seen?.clicks ?? null, position: seen?.position ?? null, page: seen?.page ?? opportunity?.targetUrl ?? null,
      opportunity, discoveries: row.discoveries,
    };
  });
  type Item = (typeof items)[number];
  const needle = normalizeKeyword(query.search ?? "");
  const inView = (item: Item) => query.view === "all" || (query.view === "rejected" || query.view === "opportunity" ? item.status === query.view : item.status !== "rejected");
  const matching = items.filter((item) => inView(item) && (!needle || normalizeKeyword(item.keyword).includes(needle))
    && (!query.cluster || (query.cluster === "none" ? !item.cluster : item.cluster === query.cluster)) && (!query.intent || (query.intent === "unknown" ? !item.intent : item.intent === query.intent)));
  // Unknown figures go last whatever the order.
  const by = (key: "score" | "volume" | "difficulty" | "impressions") => (a: Item, b: Item) => (a[key] === null || b[key] === null ? Number(a[key] === null) - Number(b[key] === null) : key === "difficulty" ? a[key]! - b[key]! : b[key]! - a[key]!);
  const order = query.sort === "keyword" ? () => 0 : by(query.sort === "volume" || query.sort === "difficulty" || query.sort === "impressions" ? query.sort : "score");
  matching.sort((a, b) => order(a, b) || a.keyword.localeCompare(b.keyword, "es"));
  const pages = Math.max(1, Math.ceil(matching.length / KEYWORD_PAGE_SIZE));
  const page = Math.min(pages, Math.max(1, query.page ?? 1));
  const clusters = new Map<string, number>();
  for (const item of items) if (item.cluster && item.status !== "rejected") clusters.set(item.cluster, (clusters.get(item.cluster) ?? 0) + 1);
  const count = (status: string) => items.filter((item) => item.status === status).length;
  return {
    items: matching.slice((page - 1) * KEYWORD_PAGE_SIZE, page * KEYWORD_PAGE_SIZE), total: matching.length, page, pages,
    counts: { discovered: items.length, relevant: items.length - count("rejected"), opportunity: count("opportunity"), rejected: count("rejected"), measured: items.filter((item) => item.volume !== null).length },
    clusters: [...clusters].map(([name, keywords]) => ({ name, keywords })).sort((a, b) => b.keywords - a.keywords),
    intents: [...new Set(items.flatMap((item) => (item.intent ? [item.intent] : [])))].sort(),
    searchConsoleThrough: connection?.syncedThrough ? day(connection.syncedThrough) : null,
  };
}

/** How the figures of one keyword of the site changed, with where each came from. */
export async function workspaceKeywordHistory(tenantId: string, siteId: string, id: string) {
  const row = await prisma.siteKeyword.findFirst({ where: { id, tenantId, siteId }, select: { keyword: true, market: true } });
  const place = row && seoMarket(row.market);
  if (!row || !place) throw new Error("keyword_not_found");
  const items = await keywordHistory(tenantId, place, row.keyword);
  const provenance = (fields: unknown) => Object.fromEntries(Object.entries((fields ?? {}) as Record<string, { kind?: string; at?: string; asOf?: string | null }>).map(([name, value]) => [name, { kind: value?.kind ?? "unknown", at: value?.at ?? null, asOf: value?.asOf ?? null }]));
  return {
    keyword: row.keyword, market: row.market,
    items: items.map((item) => ({ volume: item.volume, difficulty: item.difficulty, cpc: item.cpc, intent: item.intent, quality: item.quality, collectedAt: item.collectedAt, confirmedAt: item.confirmedAt, fields: provenance(item.fields) })),
  };
}

// ---- Performance ----

export async function workspacePerformance(tenantId: string, siteId: string, days: 28 | 90) {
  await requireSite(tenantId, siteId);
  const connection = await getSearchConsoleStatus(tenantId, siteId);
  const [actions, outcomes, publications] = await Promise.all([
    prisma.seoAction.findMany({ where: { tenantId, siteId }, orderBy: { actedAt: "desc" }, take: 100, select: { id: true, action: true, url: true, query: true, actedAt: true, evaluations: true, opportunity: { select: { id: true, topic: true, score: true } } } }),
    outcomeSummary(tenantId, siteId),
    prisma.publication.findMany({ where: { tenantId, siteId, channel: "website", status: "published", publishedAt: { gte: addDays(new Date(), -180) }, externalUrl: { not: null } }, orderBy: { publishedAt: "desc" }, take: 50, select: { id: true, externalUrl: true, publishedAt: true, project: { select: { id: true, title: true } } } }),
  ]);
  const through = connection.syncedThrough ? new Date(connection.syncedThrough) : null;
  const history = actions.map(({ evaluations, ...action }) => ({ ...action, evaluation: Object.values((evaluations ?? {}) as Record<string, Evaluation>).sort((a, b) => b.window - a.window)[0] ?? null }));
  const base = { connection, history, outcomes, conversions: { status: "unavailable" as const } };
  if (!through) return withoutCosts({ ...base, organic: null, series: [], pages: [], queries: [], newContent: publications.map((row) => ({ ...row, clicks: null, impressions: null })) });
  const from = addDays(through, 1 - days);
  const [series, current, previous, queries, summary] = await Promise.all([
    prisma.$queryRaw<Array<{ date: string; clicks: number; impressions: number }>>`
      SELECT to_char(date, 'YYYY-MM-DD') AS date, SUM(clicks)::int AS clicks, SUM(impressions)::int AS impressions FROM search_performance
      WHERE tenant_id = ${tenantId}::uuid AND site_id = ${siteId}::uuid AND dataset = 'site' AND date BETWEEN ${day(from)}::date AND ${day(through)}::date GROUP BY date ORDER BY date`,
    pageTotals(tenantId, siteId, from, through), pageTotals(tenantId, siteId, addDays(from, -days), addDays(from, -1)),
    prisma.$queryRaw<Array<{ query: string; clicks: number; impressions: number; position: number | null }>>`
      SELECT query, SUM(clicks)::int AS clicks, SUM(impressions)::int AS impressions, (SUM(position_sum) / NULLIF(SUM(impressions), 0))::float8 AS position FROM search_performance
      WHERE tenant_id = ${tenantId}::uuid AND site_id = ${siteId}::uuid AND dataset = 'query' AND date BETWEEN ${day(from)}::date AND ${day(through)}::date
      GROUP BY query ORDER BY SUM(clicks) DESC, SUM(impressions) DESC LIMIT 50`,
    organic(tenantId, siteId, through, days),
  ]);
  const pages = [...current].sort((a, b) => b[1].clicks - a[1].clicks || b[1].impressions - a[1].impressions).slice(0, 50).map(([page, totals]) => ({ page, ...figures(totals), previousClicks: summary.previous ? previous.get(page)?.clicks ?? 0 : null }));
  const newContent = await Promise.all(publications.map(async (row) => {
    const since = addDays(row.publishedAt!, 1);
    // Published after the newest stored day: nothing is known yet.
    const totals = since <= through ? (await pageTotals(tenantId, siteId, since, through)).get(pageKey(row.externalUrl!)) ?? { clicks: 0, impressions: 0 } : null;
    return { ...row, clicks: totals?.clicks ?? null, impressions: totals?.impressions ?? null };
  }));
  return withoutCosts({ ...base, organic: summary, series, pages, queries, newContent });
}

// ---- Competitors ----

/** Keywords of the site each competitor was seen for, and when. */
export async function competitorKeywordOverlap(tenantId: string, siteId: string): Promise<Map<string, { keywords: number; lastAt: string }>> {
  const rows = await prisma.$queryRaw<Array<{ competitor_id: string; keywords: number; last_at: Date }>>(Prisma.sql`
    SELECT d.competitor_id::text, COUNT(DISTINCT d.site_keyword_id)::int AS keywords, MAX(d.discovered_at) AS last_at FROM site_keyword_discoveries d JOIN site_keywords k ON k.id = d.site_keyword_id
    WHERE k.tenant_id = ${tenantId}::uuid AND k.site_id = ${siteId}::uuid AND d.tenant_id = ${tenantId}::uuid AND d.competitor_id IS NOT NULL GROUP BY d.competitor_id`);
  return new Map(rows.map((row) => [row.competitor_id, { keywords: row.keywords, lastAt: row.last_at.toISOString() }]));
}
