// Platform view of SEO operations (SEO-V2-06): costs, effective budgets, research of every workspace, governance and unit
// economics. Read from the ledger and the counters; nothing here calls a provider, except the free balance read an administrator asks for.

import { Prisma } from "@prisma/client";
import { getPrismaClient, readAcrossWorkspaceSites } from "../infrastructure/db/prisma";
import { SEO_CAPABILITIES, SeoProviderError } from "../infrastructure/seo/contract";
import { retentionDays } from "../infrastructure/seo/policy";
import { SEO_PRICES, seoPriceStatus } from "../infrastructure/seo/pricing";
import { SEO_PROVIDERS, findSeoProvider } from "../infrastructure/seo/registry";
import { getAiSpend, listCostBudgets } from "./cost-budgets";
import { loadSeoControl, readSeoControl } from "./seo-control";
import { applicableBudgets, budgetUse, type SeoAllowance } from "./seo-governor";
import { effectiveLicences, sharableNow } from "./seo-licensing";
import { DEFAULT_RESEARCH_POLICY } from "./seo-research/policy";
import { getResearchRun, runCost } from "./seo-research/runs";
import { listWorkerHeartbeats } from "./worker-health";

const prisma = getPrismaClient();
const DAY_MS = 86_400_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const sqlTime = (date: Date) => Prisma.sql`${date.toISOString().slice(0, 23)}::timestamp`;
const isoDay = (date: Date) => date.toISOString().slice(0, 10);

// ---- Filters ----

export type CostFilters = { from: Date; /** Exclusive. */ to: Date; tenantId?: string; siteId?: string; providerId?: string; operation?: string; runId?: string; plan?: string };
export const MAX_RANGE_DAYS = 366;

/** Query string into filters, or why not. Without dates, the current month (UTC). */
export function parseCostFilters(query: Record<string, string | undefined>, now = new Date()): CostFilters | string {
  const date = (value: string | undefined, fallback: Date): Date | null => {
    if (!value) return fallback;
    const at = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00Z`) : null;
    return at && Number.isFinite(at.getTime()) ? at : null;
  };
  const from = date(query.from, new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)));
  const last = date(query.to, new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())));
  if (!from || !last || last < from) return "from and to must be dates (YYYY-MM-DD), in order";
  const to = new Date(last.getTime() + DAY_MS);
  if (to.getTime() - from.getTime() > MAX_RANGE_DAYS * DAY_MS) return `at most ${MAX_RANGE_DAYS} days`;
  for (const key of ["tenantId", "siteId", "runId"] as const) if (query[key] && !UUID.test(query[key]!)) return `invalid ${key}`;
  if (query.providerId && !findSeoProvider(query.providerId)) return "unknown provider";
  if (query.operation && !(SEO_CAPABILITIES as readonly string[]).includes(query.operation)) return "unknown operation";
  return { from, to, tenantId: query.tenantId || undefined, siteId: query.siteId || undefined, providerId: query.providerId || undefined, operation: query.operation || undefined, runId: query.runId || undefined, plan: query.plan?.slice(0, 60) || undefined };
}

/** Conditions over seo_spend_reservations r, with tenants t joined. A plan is the one the workspace has today. */
function ledgerWhere(filters: CostFilters): Prisma.Sql {
  const conditions = [Prisma.sql`r.created_at >= ${sqlTime(filters.from)} AND r.created_at < ${sqlTime(filters.to)}`];
  if (filters.tenantId) conditions.push(Prisma.sql`r.tenant_id = ${filters.tenantId}::uuid`);
  if (filters.siteId) conditions.push(Prisma.sql`r.target_site_id = ${filters.siteId}::uuid`);
  if (filters.providerId) conditions.push(Prisma.sql`r.provider_id = ${filters.providerId}`);
  if (filters.operation) conditions.push(Prisma.sql`r.operation = ${filters.operation}`);
  if (filters.runId) conditions.push(Prisma.sql`r.run_id = ${filters.runId}::uuid`);
  if (filters.plan) conditions.push(Prisma.sql`COALESCE(t.plan, 'none') = ${filters.plan}`);
  return Prisma.join(conditions, " AND ");
}

const LEDGER = Prisma.sql`seo_spend_reservations r LEFT JOIN tenants t ON t.id = r.tenant_id LEFT JOIN sites s ON s.id = r.target_site_id`;

// ---- Costs ----

const DIMENSIONS = {
  provider: Prisma.sql`r.provider_id`,
  operation: Prisma.sql`r.operation`,
  tenant: Prisma.sql`r.tenant_id::text`,
  site: Prisma.sql`COALESCE(r.target_site_id::text, '')`,
  plan: Prisma.sql`COALESCE(t.plan, 'none')`,
  run: Prisma.sql`COALESCE(r.run_id::text, '')`,
  day: Prisma.sql`to_char(r.created_at, 'YYYY-MM-DD')`,
} as const;
export type CostDimension = keyof typeof DIMENSIONS;

type CostRow = { key: string; label: string | null; requests: number; settled_usd: number; estimated_usd: number; held_usd: number; failures: number; failed_usd: number };

async function costBy(dimension: CostDimension, filters: CostFilters, take = 50): Promise<CostRow[]> {
  const label = dimension === "tenant" ? Prisma.sql`MAX(t.name)` : dimension === "site" ? Prisma.sql`MAX(s.name)` : Prisma.sql`NULL::text`;
  return prisma.$queryRaw<CostRow[]>`
    SELECT ${DIMENSIONS[dimension]} AS key, ${label} AS label, (COUNT(*) FILTER (WHERE r.dispatched_at IS NOT NULL))::int AS requests,
      COALESCE(SUM(r.actual_usd) FILTER (WHERE r.state = 'settled'), 0)::float8 AS settled_usd,
      COALESCE(SUM(COALESCE(r.estimated_usd, r.max_usd)) FILTER (WHERE r.state = 'settled'), 0)::float8 AS estimated_usd,
      COALESCE(SUM(r.max_usd) FILTER (WHERE r.state IN ('reserved', 'dispatched', 'uncertain')), 0)::float8 AS held_usd,
      (COUNT(*) FILTER (WHERE r.state = 'uncertain' OR r.resolution LIKE 'billed_failure:%' OR r.resolution LIKE 'not_billed:%'))::int AS failures,
      COALESCE(SUM(r.actual_usd) FILTER (WHERE r.resolution LIKE 'billed_failure:%'), 0)::float8 AS failed_usd
    FROM ${LEDGER} WHERE ${ledgerWhere(filters)} GROUP BY 1 ORDER BY ${dimension === "day" ? Prisma.sql`1` : Prisma.sql`4 DESC, 1`} LIMIT ${dimension === "day" ? MAX_RANGE_DAYS : take}`;
}

const view = (row: CostRow) => ({ key: row.key, label: row.label, requests: row.requests, settledUsd: row.settled_usd, estimatedUsd: row.estimated_usd, heldUsd: row.held_usd, failures: row.failures, failedUsd: row.failed_usd });
const ratio = (usd: number, count: number | null) => (count ? usd / count : null);

/** Reuse since the counters exist: what was asked and not bought again. */
async function reuse(filters: CostFilters) {
  const conditions = [Prisma.sql`u.day >= ${isoDay(filters.from)}::date AND u.day < ${isoDay(filters.to)}::date`];
  if (filters.tenantId) conditions.push(Prisma.sql`u.tenant_id = ${filters.tenantId}::uuid`);
  if (filters.siteId) conditions.push(Prisma.sql`u.site_key = ${filters.siteId}`);
  if (filters.providerId) conditions.push(Prisma.sql`u.provider_id = ${filters.providerId}`);
  if (filters.operation) conditions.push(Prisma.sql`u.operation = ${filters.operation}`);
  if (filters.plan) conditions.push(Prisma.sql`COALESCE(t.plan, 'none') = ${filters.plan}`);
  const rows = await prisma.$queryRaw<Array<{ provider_id: string; operation: string; metric: string; count: number }>>`
    SELECT u.provider_id, u.operation, u.metric, SUM(u.count)::int AS count FROM seo_usage_daily u LEFT JOIN tenants t ON t.id = u.tenant_id WHERE ${Prisma.join(conditions, " AND ")} GROUP BY 1, 2, 3`;
  const [{ since }] = await prisma.$queryRaw<Array<{ since: string | null }>>`SELECT to_char(MIN(day), 'YYYY-MM-DD') AS since FROM seo_usage_daily`;
  const sum = (test: (metric: string) => boolean) => rows.filter((row) => test(row.metric)).reduce((total, row) => total + row.count, 0);
  const [stored, joined, waited, bought] = ["reused", "joined", "waited", "bought"].map((metric) => sum((entry) => entry === metric));
  const served = stored + joined + waited;
  // What the same answers cost when they were bought, in the same filter: an estimate, not an amount anyone was charged.
  const prices = await prisma.$queryRaw<Array<{ provider_id: string; operation: string; per_unit: number | null }>>`
    SELECT r.provider_id, r.operation, (SUM(r.actual_usd) / NULLIF(SUM(r.units), 0))::float8 AS per_unit FROM ${LEDGER} WHERE ${ledgerWhere(filters)} AND r.state = 'settled' GROUP BY 1, 2`;
  const price = new Map(prices.map((row) => [`${row.provider_id}:${row.operation}`, row.per_unit]));
  let avoided = 0;
  let unpriced = 0;
  for (const row of rows) {
    if (!["reused", "joined", "waited"].includes(row.metric)) continue;
    const unit = price.get(`${row.provider_id}:${row.operation}`);
    if (unit === undefined || unit === null) unpriced += row.count;
    else avoided += row.count * unit;
  }
  return {
    countedSince: since, reused: stored, bought, duplicatesPrevented: joined + waited, hitRate: served + bought ? served / (served + bought) : null,
    avoidedUsdEstimate: served > unpriced ? avoided : null, unpricedAnswers: unpriced,
    refused: Object.fromEntries(rows.filter((row) => row.metric.startsWith("refused:")).reduce((map, row) => map.set(row.metric.slice(8), (map.get(row.metric.slice(8)) ?? 0) + row.count), new Map<string, number>())),
    byProvider: SEO_PROVIDERS.map(({ id }) => {
      const of = (metric: string) => rows.filter((row) => row.provider_id === id && row.metric === metric).reduce((total, row) => total + row.count, 0);
      const hits = of("reused") + of("joined") + of("waited");
      return { providerId: id, served: hits, bought: of("bought"), hitRate: hits + of("bought") ? hits / (hits + of("bought")) : null };
    }).filter((row) => row.served || row.bought),
  };
}

export async function costAnalytics(filters: CostFilters) {
  const where = ledgerWhere(filters);
  const names = ["provider", "operation", "tenant", "site", "plan", "run", "day"] as const;
  const [groups, [totals], [knowledge], cache] = await Promise.all([
    Promise.all(names.map((name) => costBy(name, filters))),
    prisma.$queryRaw<Array<{ requests: number; settled: number; estimated: number; held: number; uncertain: number; uncertain_usd: number; assumed: number; failed_usd: number; failures: number; onboarding: number; recurring: number; onboarding_sites: number; recurring_sites: number }>>`
      SELECT (COUNT(*) FILTER (WHERE r.dispatched_at IS NOT NULL))::int AS requests, COALESCE(SUM(r.actual_usd) FILTER (WHERE r.state = 'settled'), 0)::float8 AS settled,
        COALESCE(SUM(COALESCE(r.estimated_usd, r.max_usd)) FILTER (WHERE r.state = 'settled'), 0)::float8 AS estimated,
        COALESCE(SUM(r.max_usd) FILTER (WHERE r.state IN ('reserved', 'dispatched')), 0)::float8 AS held,
        (COUNT(*) FILTER (WHERE r.state = 'uncertain'))::int AS uncertain, COALESCE(SUM(r.max_usd) FILTER (WHERE r.state = 'uncertain'), 0)::float8 AS uncertain_usd,
        COALESCE(SUM(r.actual_usd) FILTER (WHERE r.resolution = 'assumed_maximum'), 0)::float8 AS assumed,
        COALESCE(SUM(r.actual_usd) FILTER (WHERE r.resolution LIKE 'billed_failure:%'), 0)::float8 AS failed_usd,
        (COUNT(*) FILTER (WHERE r.state = 'uncertain' OR r.resolution LIKE 'billed_failure:%' OR r.resolution LIKE 'not_billed:%'))::int AS failures,
        COALESCE(SUM(r.actual_usd) FILTER (WHERE r.allowance = 'onboarding'), 0)::float8 AS onboarding, COALESCE(SUM(r.actual_usd) FILTER (WHERE r.allowance = 'recurring'), 0)::float8 AS recurring,
        (COUNT(DISTINCT r.target_site_id) FILTER (WHERE r.allowance = 'onboarding'))::int AS onboarding_sites, (COUNT(DISTINCT r.target_site_id) FILTER (WHERE r.allowance = 'recurring'))::int AS recurring_sites
      FROM ${LEDGER} WHERE ${where}`,
    prisma.$queryRaw<Array<{ keywords: number; keyword_usd: number; opportunities: number; run_usd: number }>>`
      WITH scope AS (SELECT r.id, r.run_id, r.actual_usd, r.state FROM ${LEDGER} WHERE ${where}),
        metrics AS (SELECT DISTINCT m.reservation_id, m.tenant_id, m.country, m.language, m.keyword FROM seo_keyword_metrics m JOIN scope ON scope.id = m.reservation_id)
      SELECT (SELECT COUNT(*) FROM (SELECT DISTINCT tenant_id, country, language, keyword FROM metrics) k)::int AS keywords,
        COALESCE((SELECT SUM(actual_usd) FROM scope WHERE state = 'settled' AND id IN (SELECT reservation_id FROM metrics)), 0)::float8 AS keyword_usd,
        (SELECT COUNT(*) FROM content_opportunities o LEFT JOIN site_research_profiles p ON p.site_id = o.site_id
          WHERE o.research_run_id IN (SELECT run_id FROM scope WHERE run_id IS NOT NULL) AND o.score >= COALESCE((p.policy->>'minScore')::int, ${DEFAULT_RESEARCH_POLICY.minScore}))::int AS opportunities,
        COALESCE((SELECT SUM(actual_usd) FROM scope WHERE state = 'settled' AND run_id IS NOT NULL), 0)::float8 AS run_usd`,
    reuse(filters),
  ]);
  // An article is not bought by one provider, operation or run: with those filters there is nothing to divide by.
  const wholeSites = !filters.providerId && !filters.operation && !filters.runId;
  const articles = wholeSites ? (await prisma.$queryRaw<Array<{ count: number }>>`
    SELECT COUNT(DISTINCT p.project_id)::int AS count FROM publications p JOIN tenants t ON t.id = p.tenant_id
    WHERE p.channel = 'website' AND p.status = 'published' AND p.published_at >= ${sqlTime(filters.from)} AND p.published_at < ${sqlTime(filters.to)}
      ${filters.tenantId ? Prisma.sql`AND p.tenant_id = ${filters.tenantId}::uuid` : Prisma.empty} ${filters.siteId ? Prisma.sql`AND p.site_id = ${filters.siteId}::uuid` : Prisma.empty}
      ${filters.plan ? Prisma.sql`AND COALESCE(t.plan, 'none') = ${filters.plan}` : Prisma.empty}`)[0].count : null;
  return {
    range: { from: isoDay(filters.from), to: isoDay(new Date(filters.to.getTime() - DAY_MS)) },
    totals: {
      requests: totals.requests, settledUsd: totals.settled, estimatedUsd: totals.estimated, heldUsd: totals.held, uncertain: totals.uncertain, uncertainUsd: totals.uncertain_usd, assumedUsd: totals.assumed,
      failures: totals.failures, failedUsd: totals.failed_usd, onboardingUsd: totals.onboarding, recurringUsd: totals.recurring,
    },
    units: {
      keywords: knowledge.keywords, perKeywordUsd: ratio(knowledge.keyword_usd, knowledge.keywords), opportunities: knowledge.opportunities, perOpportunityUsd: ratio(knowledge.run_usd, knowledge.opportunities),
      articles, perArticleUsd: ratio(totals.settled, articles), perOnboardingSiteUsd: ratio(totals.onboarding, totals.onboarding_sites), perRecurringSiteUsd: ratio(totals.recurring, totals.recurring_sites),
    },
    cache,
    by: Object.fromEntries(names.map((name, index) => [name, groups[index].map(view)])) as Record<CostDimension, ReturnType<typeof view>[]>,
  };
}

const CSV_MAX_ROWS = 50_000;
/** A spreadsheet runs cells that start like a formula. */
const csvCell = (value: unknown): string => {
  const text = value === null || value === undefined ? "" : value instanceof Date ? value.toISOString() : String(value);
  const safe = /^[=+\-@\t\r]/.test(text) && !/^-?\d+(\.\d+)?$/.test(text) ? `'${text}` : text;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

/** The ledger rows behind the analytics. */
export async function costCsv(filters: CostFilters): Promise<{ csv: string; rows: number; truncated: boolean }> {
  const rows = await prisma.$queryRaw<Array<Record<string, unknown>>>`
    SELECT r.created_at, t.name AS tenant, r.tenant_id::text AS tenant_id, COALESCE(t.plan, 'none') AS plan, s.name AS site, r.target_site_id::text AS site_id, r.provider_id, r.operation, r.allowance, r.run_id::text AS run_id, r.units, r.state,
      r.estimated_usd::text AS estimated_usd, r.max_usd::text AS max_usd, r.actual_usd::text AS actual_usd, r.resolution, r.pricing_version
    FROM ${LEDGER} WHERE ${ledgerWhere(filters)} ORDER BY r.created_at DESC LIMIT ${CSV_MAX_ROWS + 1}`;
  const columns = ["created_at", "tenant", "tenant_id", "plan", "site", "site_id", "provider_id", "operation", "allowance", "run_id", "units", "state", "estimated_usd", "max_usd", "actual_usd", "resolution", "pricing_version"];
  const kept = rows.slice(0, CSV_MAX_ROWS);
  return { csv: [columns.join(","), ...kept.map((row) => columns.map((column) => csvCell(row[column])).join(","))].join("\r\n"), rows: kept.length, truncated: rows.length > CSV_MAX_ROWS };
}

// ---- Budgets ----

/** Every limit one request would meet, and the one that stops it first. */
export async function effectiveBudget(input: { tenantId: string; siteId: string | null; providerId: string; operation: string }, now = new Date()) {
  const [tenant, site, control] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: input.tenantId }, select: { name: true, plan: true, status: true } }),
    input.siteId ? prisma.site.findUnique({ where: { id: input.siteId }, select: { name: true, tenantId: true, createdAt: true } }) : null,
    readSeoControl(),
  ]);
  if (!tenant || (input.siteId && site?.tenantId !== input.tenantId)) return null;
  const allowance: SeoAllowance = site && now.getTime() - site.createdAt.getTime() < control.policy.onboardingDays * DAY_MS ? "onboarding" : "recurring";
  const budgets = await applicableBudgets(prisma, { ...input, plan: tenant.plan ?? "none", allowance }, now);
  const [use, general, daily, monthly] = await Promise.all([
    budgetUse(prisma, budgets, now), readAcrossWorkspaceSites(() => listCostBudgets(input.tenantId)),
    readAcrossWorkspaceSites(() => getAiSpend(input.tenantId, { period: "daily" })), readAcrossWorkspaceSites(() => getAiSpend(input.tenantId, { period: "monthly" })),
  ]);
  const rows = budgets.map((budget, index) => ({ ...budget, ...use[index], remainingUsd: Math.max(0, budget.limitUsd + budget.extraUsd - use[index].actualUsd - use[index].heldUsd) })).sort((a, b) => a.remainingUsd - b.remainingUsd);
  const stopped = control.emergencyStop ? "emergency_stop" : control.mode === "disabled" ? "external_disabled" : tenant.status !== "active" ? "tenant_suspended" : control.providers[input.providerId]?.enabled === false ? "provider_disabled" : null;
  return {
    tenant: tenant.name, plan: tenant.plan, site: site?.name ?? null, allowance, rows, effectiveUsd: stopped ? 0 : rows[0]?.remainingUsd ?? 0, stopped,
    // The workspace's own spending limits also apply, artificial intelligence included.
    general: general.filter((budget) => budget.enabled && (!budget.siteId || budget.siteId === input.siteId)).map((budget) => ({ period: budget.period, siteId: budget.siteId, limitUsd: budget.limitUsd, hardLimitUsd: budget.hardLimitUsd ?? budget.limitUsd * 2, spentUsd: budget.period === "daily" ? daily.spentUsd : monthly.spentUsd })),
  };
}

/** Requests refused because a budget had no room, by day. */
export async function exhaustionHistory(days = 90) {
  return prisma.$queryRaw<Array<{ day: string; metric: string; tenant: string | null; site: string | null; provider_id: string; operation: string; count: number }>>`
    SELECT to_char(u.day, 'YYYY-MM-DD') AS day, SUBSTRING(u.metric FROM 11) AS metric, t.name AS tenant, s.name AS site, u.provider_id, u.operation, SUM(u.count)::int AS count
    FROM seo_usage_daily u LEFT JOIN tenants t ON t.id = u.tenant_id LEFT JOIN sites s ON s.id::text = u.site_key
    WHERE u.metric LIKE 'exhausted:%' AND u.day >= ${isoDay(new Date(Date.now() - days * DAY_MS))}::date GROUP BY 1, 2, 3, 4, 5, 6 ORDER BY 1 DESC, 7 DESC LIMIT 200`;
}

// ---- Providers ----

/** What failed and how the provider answered lately, from the ledger. */
export async function providerHistory(providerId: string) {
  const since = new Date(Date.now() - 30 * DAY_MS);
  const [daily, failures] = await Promise.all([
    prisma.$queryRaw<Array<{ day: string; ok: number; failed: number; usd: number }>>`
      SELECT to_char(created_at, 'YYYY-MM-DD') AS day, (COUNT(*) FILTER (WHERE state = 'settled' AND resolution NOT LIKE 'billed_failure:%'))::int AS ok,
        (COUNT(*) FILTER (WHERE state = 'uncertain' OR resolution LIKE 'billed_failure:%' OR resolution LIKE 'not_billed:%'))::int AS failed, COALESCE(SUM(actual_usd) FILTER (WHERE state = 'settled'), 0)::float8 AS usd
      FROM seo_spend_reservations WHERE provider_id = ${providerId} AND dispatched_at IS NOT NULL AND created_at >= ${sqlTime(since)} GROUP BY 1 ORDER BY 1 DESC`,
    prisma.$queryRaw<Array<{ id: string; at: Date; operation: string; state: string; reason: string | null; usd: number | null }>>`
      SELECT id::text, created_at AS at, operation, state, resolution AS reason, actual_usd::float8 AS usd FROM seo_spend_reservations
      WHERE provider_id = ${providerId} AND (state = 'uncertain' OR resolution LIKE 'billed_failure:%' OR resolution LIKE 'not_billed:%' OR resolution LIKE 'worker_lost%' OR resolution = 'stopped_before_dispatch') ORDER BY created_at DESC LIMIT 50`,
  ]);
  return { daily, failures };
}

/** Reads the balance from the provider's own free endpoint. Refused where it has none, is off or everything is stopped. */
export async function readProviderBalance(providerId: string, fetchImpl: typeof fetch = fetch): Promise<{ usd: number; at: string }> {
  const provider = findSeoProvider(providerId);
  if (!provider) throw new SeoProviderError("not_selected", "unknown provider", null, 0);
  if (!provider.balance) throw new SeoProviderError("unsupported_capability", `${provider.id} does not publish its balance`, provider.id, 0);
  const control = await loadSeoControl();
  if (control.emergencyStop) throw new SeoProviderError("emergency_stop", "everything is stopped", provider.id, 0);
  if (control.mode === "disabled") throw new SeoProviderError("external_disabled", "external SEO is disabled", provider.id, 0);
  if (!control.providers[provider.id]?.enabled) throw new SeoProviderError("provider_disabled", `${provider.id} is disabled`, provider.id, 0);
  if (!provider.configured()) throw new SeoProviderError("not_configured", `${provider.id} has no credentials`, provider.id, 0);
  const balance = { usd: await provider.balance(fetchImpl), at: new Date().toISOString() };
  await prisma.seoProviderState.upsert({ where: { providerId }, create: { providerId, ...control.providers[providerId], balance }, update: { balance } });
  return balance;
}

// ---- Research operations ----

export const RUN_STATUSES = ["queued", "running", "paused", "failed", "partial", "succeeded", "cancelled"] as const;
const RUN_PAGE = 25;

export async function listResearchOperations(query: { status?: string; tenantId?: string; siteId?: string; page?: number }) {
  return readAcrossWorkspaceSites(async () => {
    const where: Prisma.SeoResearchRunWhereInput = { ...(query.status ? { status: query.status } : {}), ...(query.tenantId ? { tenantId: query.tenantId } : {}), ...(query.siteId ? { siteId: query.siteId } : {}) };
    const page = Math.max(1, query.page ?? 1);
    const [total, rows, counts, workers, control, holds, [held], tenants, sites] = await Promise.all([
      prisma.seoResearchRun.count({ where }),
      prisma.seoResearchRun.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * RUN_PAGE, take: RUN_PAGE, include: { tasks: { select: { status: true } } } }),
      prisma.seoResearchRun.groupBy({ by: ["status"], _count: { _all: true } }),
      listWorkerHeartbeats(), readSeoControl(), prisma.seoResearchHold.findMany({ orderBy: { createdAt: "desc" } }),
      prisma.$queryRaw<Array<{ held: number; in_flight: number; uncertain: number }>>`
        SELECT COALESCE(SUM(max_usd) FILTER (WHERE state IN ('reserved', 'dispatched')), 0)::float8 AS held, (COUNT(*) FILTER (WHERE state = 'dispatched'))::int AS in_flight, (COUNT(*) FILTER (WHERE state = 'uncertain'))::int AS uncertain
        FROM seo_spend_reservations WHERE state IN ('reserved', 'dispatched', 'uncertain')`,
      prisma.tenant.findMany({ select: { id: true, name: true, plan: true }, orderBy: { name: "asc" } }),
      prisma.site.findMany({ select: { id: true, name: true, tenantId: true }, orderBy: { name: "asc" } }),
    ]);
    const names = new Map<string, string>([...tenants, ...sites].map((row) => [row.id, row.name]));
    const items = await Promise.all(rows.map(async ({ tasks, ...run }) => {
      const cost = await runCost(run.id);
      const finished = tasks.filter((task) => !["pending", "running"].includes(task.status)).length;
      const open = ["queued", "running", "paused"].includes(run.status);
      return {
        id: run.id, tenantId: run.tenantId, tenant: names.get(run.tenantId) ?? null, siteId: run.siteId, site: names.get(run.siteId) ?? null, trigger: run.trigger, detail: (run.reason as { detail?: string } | null)?.detail ?? null, status: run.status, error: run.error,
        progress: tasks.length ? Math.round((100 * finished) / tasks.length) : 0, createdAt: run.createdAt, startedAt: run.startedAt, finishedAt: run.finishedAt, nextAt: run.nextAt, maxUsd: run.maxUsd, estimatedUsd: run.estimatedUsd, cost,
        /** What is left of the estimate; null before anything was estimated, 0 once it is over. */
        remainingUsd: !open ? 0 : run.estimatedUsd === null ? null : Math.max(0, run.estimatedUsd - cost.actualUsd - cost.heldUsd),
      };
    }));
    return {
      page, total, pages: Math.max(1, Math.ceil(total / RUN_PAGE)), items, counts: Object.fromEntries(counts.map((row) => [row.status, row._count._all])),
      workers: workers.filter((worker) => /automation|control|research/i.test(worker.name)),
      control: { emergencyStop: control.emergencyStop, mode: control.mode, automaticResearch: control.policy.automaticResearch, providers: SEO_PROVIDERS.map(({ id, label }) => ({ id, label, enabled: control.providers[id]?.enabled ?? false, circuit: control.circuits[id] && control.circuits[id].until > new Date() ? control.circuits[id] : null })) },
      reserved: { heldUsd: held.held, inFlight: held.in_flight, uncertain: held.uncertain },
      holds: holds.map((hold) => ({ ...hold, name: names.get(hold.scopeId) ?? null })),
      targets: { tenants, sites },
    };
  });
}

export async function researchOperation(runId: string) {
  return readAcrossWorkspaceSites(async () => {
    const run = await prisma.seoResearchRun.findUnique({ where: { id: runId }, select: { tenantId: true, siteId: true } });
    if (!run) return null;
    const [detail, inFlight] = await Promise.all([getResearchRun(run.tenantId, run.siteId, runId), prisma.seoSpendReservation.count({ where: { runId, state: "dispatched" } })]);
    return { ...run, inFlight, run: detail };
  });
}

// ---- Data and governance ----

export async function governanceView(now = new Date()) {
  return readAcrossWorkspaceSites(async () => {
    const [control, licences, records, provenance, cache, connections, [gaps], users] = await Promise.all([
      readSeoControl(), effectiveLicences(now), prisma.seoLicenseRecord.findMany({ orderBy: { createdAt: "desc" }, take: 100 }),
      prisma.$queryRaw<Array<{ provider_id: string; source: string; storage: string; sharing: string; rows: number; keywords: number; quality: number; oldest: Date; newest: Date; expiring: number }>>`
        SELECT provider_id, source, storage, sharing, COUNT(*)::int AS rows, COUNT(DISTINCT (tenant_id, country, language, keyword))::int AS keywords, ROUND(AVG(quality))::int AS quality, MIN(confirmed_at) AS oldest, MAX(confirmed_at) AS newest,
          (COUNT(*) FILTER (WHERE retain_until < ${sqlTime(new Date(now.getTime() + 7 * DAY_MS))}))::int AS expiring FROM seo_keyword_metrics GROUP BY 1, 2, 3, 4 ORDER BY 5 DESC`,
      prisma.$queryRaw<Array<{ provider_key: string; resource_type: string; entries: number; hits: number; negative: number; expired: number; oldest: Date | null }>>`
        SELECT provider_key, resource_type, COUNT(*)::int AS entries, SUM(hit_count)::int AS hits, (COUNT(*) FILTER (WHERE is_negative))::int AS negative, (COUNT(*) FILTER (WHERE expires_at < ${sqlTime(now)}))::int AS expired, MIN(fetched_at) AS oldest
        FROM provider_cache_entries WHERE provider_key IN (${Prisma.join(SEO_PROVIDERS.map(({ id }) => id))}) GROUP BY 1, 2 ORDER BY 1, 2`,
      prisma.searchConsoleConnection.findMany({ orderBy: { updatedAt: "desc" }, take: 200, select: { tenantId: true, siteId: true, status: true, syncedThrough: true, lastSuccessAt: true, lastError: true, failureCount: true, nextSyncAt: true, backfillComplete: true, tenant: { select: { name: true } }, site: { select: { name: true } } } }),
      prisma.$queryRaw<Array<{ no_volume: number; low_quality: number; expired_rows: number; uncertain: number }>>`
        SELECT (SELECT COUNT(*) FROM seo_keyword_metrics WHERE volume IS NULL)::int AS no_volume, (SELECT COUNT(*) FROM seo_keyword_metrics WHERE quality < 50)::int AS low_quality,
          (SELECT COUNT(*) FROM seo_keyword_metrics WHERE retain_until < ${sqlTime(now)})::int AS expired_rows, (SELECT COUNT(*) FROM seo_spend_reservations WHERE state = 'uncertain')::int AS uncertain`,
      prisma.studioUser.findMany({ where: { id: { in: (await prisma.seoLicenseRecord.findMany({ select: { createdByUserId: true, approvedByUserId: true }, take: 200 })).flatMap((row) => [row.createdByUserId, ...(row.approvedByUserId ? [row.approvedByUserId] : [])]) } }, select: { id: true, email: true } }),
    ]);
    const emails = new Map(users.map((user) => [user.id, user.email]));
    const eligible = await sharableNow(true);
    const prices = SEO_PRICES.map((entry) => ({ key: `${entry.providerId}:${entry.capability}`, status: seoPriceStatus(entry, control.pricing, now) }));
    const failing = connections.filter((row) => row.status === "active" && row.failureCount > 0);
    const warning = (code: string, count: number) => (count ? [{ code, count }] : []);
    return {
      retention: SEO_PROVIDERS.map((provider) => ({ providerId: provider.id, label: provider.label, storage: provider.licensing.storage, days: retentionDays(provider.licensing), termsUrl: provider.licensing.termsUrl, checkedAt: provider.licensing.checkedAt })),
      searchConsoleRetentionDays: 500,
      freshness: control.policy.freshness,
      licences: licences.map(({ id, licensing }) => ({ providerId: id, ...licensing })),
      records: records.map((row) => ({ ...row, createdBy: emails.get(row.createdByUserId) ?? null, approvedBy: row.approvedByUserId ? emails.get(row.approvedByUserId) ?? null : null, expired: Boolean(row.validUntil && row.validUntil <= now) })),
      sharing: { requested: control.policy.shareMarketData, eligible, active: control.policy.shareMarketData && eligible.length > 0 },
      provenance, cache,
      warnings: [
        ...warning("metrics_without_volume", gaps.no_volume), ...warning("low_quality_metrics", gaps.low_quality), ...warning("expired_metrics", gaps.expired_rows), ...warning("uncertain_billing", gaps.uncertain),
        ...warning("expired_cache", cache.reduce((sum, row) => sum + row.expired, 0)), ...warning("sync_failing", failing.length),
        ...warning("price_unknown", prices.filter((entry) => entry.status === "unknown").length), ...warning("price_suspect", prices.filter((entry) => String(entry.status) === "suspect").length),
      ],
      sync: connections.map(({ tenant, site, ...row }) => ({ ...row, tenant: tenant.name, site: site.name })),
    };
  });
}

// ---- Unit economics ----

/** What each workspace cost. Auctorio stores no subscription revenue, so a margin is never invented. */
export async function economicsView(filters: Pick<CostFilters, "from" | "to">) {
  const [seo, ai, tenants, sites] = await readAcrossWorkspaceSites(() => Promise.all([
    prisma.$queryRaw<Array<{ tenant_id: string; usd: number; held: number }>>`
      SELECT tenant_id::text, COALESCE(SUM(actual_usd) FILTER (WHERE state = 'settled'), 0)::float8 AS usd, COALESCE(SUM(max_usd) FILTER (WHERE state IN ('reserved', 'dispatched', 'uncertain')), 0)::float8 AS held
      FROM seo_spend_reservations WHERE created_at >= ${sqlTime(filters.from)} AND created_at < ${sqlTime(filters.to)} GROUP BY 1`,
    // SEO charges are in the same ledger, marked by their reservation.
    prisma.$queryRaw<Array<{ tenant_id: string; image: boolean; usd: number; events: number }>>`
      SELECT tenant_id::text, (kind LIKE 'image%') AS image, SUM(cost_usd)::float8 AS usd, COUNT(*)::int AS events FROM ai_spend_events
      WHERE reservation_id IS NULL AND created_at >= ${sqlTime(filters.from)} AND created_at < ${sqlTime(filters.to)} GROUP BY 1, 2`,
    prisma.tenant.findMany({ select: { id: true, name: true, plan: true, status: true }, orderBy: { name: "asc" } }),
    prisma.site.groupBy({ by: ["tenantId"], _count: { _all: true } }),
  ]));
  const rows = tenants.map((tenant) => {
    const own = seo.find((row) => row.tenant_id === tenant.id);
    const spend = (image: boolean) => ai.find((row) => row.tenant_id === tenant.id && row.image === image) ?? null;
    const [text, images] = [spend(false), spend(true)];
    return {
      tenantId: tenant.id, tenant: tenant.name, plan: tenant.plan, status: tenant.status, sites: sites.find((row) => row.tenantId === tenant.id)?._count._all ?? 0,
      revenueUsd: null, seoUsd: own?.usd ?? 0, seoHeldUsd: own?.held ?? 0,
      // Without one recorded charge nothing is known: the tenant may use its own keys or a provider that reports no cost.
      aiUsd: text?.usd ?? null, imageUsd: images?.usd ?? null, knownCostUsd: (own?.usd ?? 0) + (text?.usd ?? 0) + (images?.usd ?? 0), contributionMarginUsd: null,
    };
  }).sort((a, b) => b.knownCostUsd - a.knownCostUsd);
  return {
    range: { from: isoDay(filters.from), to: isoDay(new Date(filters.to.getTime() - DAY_MS)) }, rows,
    totals: { seoUsd: rows.reduce((sum, row) => sum + row.seoUsd, 0), aiUsd: rows.reduce((sum, row) => sum + (row.aiUsd ?? 0), 0), imageUsd: rows.reduce((sum, row) => sum + (row.imageUsd ?? 0), 0) },
    revenue: { available: false as const, reason: "no_subscription_billing" as const },
  };
}
