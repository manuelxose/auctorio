// Durable research runs: bounded, resumable and controllable. A run uses what is stored first, buys the smallest useful
// batches through the manager and the Cost Governor, and stops early when the inventory is good enough.

import { randomUUID } from "node:crypto";
import { Prisma, type SeoResearchRun, type SeoResearchTask } from "@prisma/client";
import { getPrismaClient } from "../../infrastructure/db/prisma";
import { SeoProviderError, normalizeDomain, normalizeKeyword, seoMarket, type SeoCapability, type SeoErrorCode, type SeoRequests } from "../../infrastructure/seo/contract";
import { retentionDays } from "../../infrastructure/seo/policy";
import { effectiveQuote } from "../../infrastructure/seo/pricing";
import { findSeoProvider } from "../../infrastructure/seo/registry";
import { structuredEvent } from "../../shared/utils/logger";
import { writeAudit } from "../audit";
import { buildEditorialPlanningContext, type EditorialPlanningContext } from "../editorial-plan-context";
import {
  evidenceOfCandidate, keywordRows, keywordScoringFor, keywordSubjects, keywordTokens, ownRankings, rankKeywordCandidates, recordRankedOpportunities, storedKeywords, ROWS_PER_CALL,
  type KeywordCandidate, type KeywordReject, type KeywordSubjects, type StoredKeyword,
} from "../keyword-candidates";
import { enrichPlanItemsWithKeywordMetrics, getKeywordMetrics } from "../keyword-metrics";
import { analyzeSite } from "../seo-intelligence";
import { purgeExpiredSeoData } from "../seo-cache";
import { readSeoControl } from "../seo-control";
import { acquireSeo, seoRoute, type SeoRoute } from "../seo-manager";
import { sharableNow } from "../seo-licensing";
import { serpInsight } from "../serp-sources";
import { knownKeywordMetrics, storeSiteKeywords, type SiteKeywordInput } from "./knowledge";
import { SEO_RESEARCH_DONE, readResearchPolicy, type ResearchPolicy } from "./policy";
import { getResearchProfile, researchTopics, type ResearchProfile } from "./profile";
import { reconcileReservoir, reservoirCoverage, stageOf, storeResearchOpportunities, type Coverage, type OpportunityEvidence } from "./reservoir";
import { evaluateTriggers, type ResearchFocus, type TriggerDecision } from "./triggers";

const prisma = getPrismaClient();
const DAY_MS = 86_400_000;
const MINUTE_MS = 60_000;
/** Longer than any single step; renewed before each. */
const LEASE_MS = 10 * MINUTE_MS;
const MAX_ATTEMPTS = 3;
/** How long a purchase of a subject counts as done. */
const REPEAT_DAYS = 60;
/** Fewer keywords are not worth the base price of a metrics batch. */
const MIN_METRICS_BATCH = 5;
const MAX_SITE_KEYWORDS = 1_000;
const ACTIVE = ["queued", "running", "paused"] as const;

type TaskKind = "inspect_site" | "first_party" | "profile" | "gaps" | "discover_seed" | "competitor_keywords" | "own_keywords" | "screen" | "metrics" | "serp" | "inventory";
const EXTERNAL: readonly string[] = ["discover_seed", "competitor_keywords", "own_keywords", "metrics", "serp"];
const DISCOVERY: readonly string[] = ["discover_seed", "competitor_keywords", "own_keywords"];
/** Positions leave room for the purchases decided along the way. */
const STEPS: Array<{ kind: TaskKind; position: number }> = [
  { kind: "inspect_site", position: 10 }, { kind: "first_party", position: 20 }, { kind: "profile", position: 30 }, { kind: "gaps", position: 40 }, { kind: "screen", position: 500 }, { kind: "inventory", position: 1000 },
];

/** Tried again later by itself. A timeout is not: it may have been billed. */
const LATER: ReadonlySet<SeoErrorCode> = new Set(["rate_limited", "quota_wait", "acquisition_in_progress", "circuit_open", "retry_cooldown", "upstream_error"]);
/** Not a failure: it may not be bought, or is not worth it. */
const REFUSED: ReadonlySet<SeoErrorCode> = new Set([
  "external_disabled", "provider_disabled", "not_selected", "not_configured", "unsupported_capability", "unsupported_market", "paid_automation_locked", "automatic_routing_locked", "unknown_price", "spend_limit",
  "network_blocked", "license_prohibited", "budget_exhausted", "billing_uncertain", "not_worth_cost", "insufficient_balance", "invalid_credentials",
]);

// ---- Requesting ----

/** The platform does not let research start by itself on this site or its workspace, whatever the site's policy says. */
export async function researchHold(tenantId: string, siteId: string): Promise<{ scope: string; reason: string } | null> {
  return prisma.seoResearchHold.findFirst({ where: { OR: [{ scope: "tenant", scopeId: tenantId }, { scope: "site", scopeId: siteId }] }, select: { scope: true, reason: true } });
}

export type RunView = Awaited<ReturnType<typeof getResearchRun>>;

/**
 * Asks for research. One open run per site, and the same trigger key is never researched twice: both return what exists.
 * `created: false` means nothing new was started.
 */
export async function requestResearch(input: { tenantId: string; siteId: string; userId?: string | null; maxUsd?: number } & TriggerDecision): Promise<{ runId: string; created: boolean }> {
  const { tenantId, siteId } = input;
  const profile = await getResearchProfile(tenantId, siteId);
  if (profile.policy.mode === "off") throw new Error("research_disabled");
  if (profile.policy.mode === "manual" && input.trigger !== "manual") throw new Error("research_manual_only");
  const existing = await prisma.seoResearchRun.findFirst({ where: { tenantId, siteId, OR: [{ activeKey: siteId }, ...(input.triggerKey ? [{ triggerKey: input.triggerKey }] : [])] }, orderBy: { activeKey: { sort: "desc", nulls: "last" } } });
  if (existing) return { runId: existing.id, created: false };
  try {
    const run = await prisma.seoResearchRun.create({
      data: {
        tenantId, siteId, trigger: input.trigger, triggerKey: input.triggerKey, activeKey: siteId, reason: { detail: input.detail, focus: input.focus } as Prisma.InputJsonObject,
        policy: profile.policy as unknown as Prisma.InputJsonObject, maxUsd: Math.min(input.maxUsd ?? profile.policy.maxUsdPerRun, profile.policy.maxUsdPerRun), requestedByUserId: input.userId ?? null,
        tasks: { create: STEPS.map((step) => ({ tenantId, siteId, ...step })) },
      },
    });
    await writeAudit({ tenantId, actorType: input.userId ? "user" : "system", actorUserId: input.userId ?? null, action: "seo_research.requested", entityType: "seo_research_run", entityId: run.id, metadata: { siteId, trigger: input.trigger, detail: input.detail, maxUsd: run.maxUsd } });
    return { runId: run.id, created: true };
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
    const winner = await prisma.seoResearchRun.findFirstOrThrow({ where: { tenantId, siteId, OR: [{ activeKey: siteId }, ...(input.triggerKey ? [{ triggerKey: input.triggerKey }] : [])] } });
    return { runId: winner.id, created: false };
  }
}

const providerAvailable = async (locale: string) => (await Promise.all([seoRoute("keyword_suggestions", locale), seoRoute("ranked_keywords", locale)])).some((route) => route.provider);

/** Why a plan did, or did not, ask for research; kept on the plan when it is short of opportunities. */
export type PlanningResearch = {
  state: "not_requested" | "sufficient" | "turned_off" | "no_provider" | "not_authorized" | "researched_recently" | "finished" | "in_progress" | "failed";
  runId: string | null;
  /** Qualified opportunities before asking. */
  available: number | null;
};

/**
 * A plan is about to be written. Only when the inventory cannot feed it, nothing was researched lately and it may be
 * asked for (a person asked for the plan, or the platform lets research start by itself) is research requested, about the
 * priority topics without opportunities when there are any. The plan waits briefly and goes on with whatever there is.
 */
export async function requestPlanningResearch(tenantId: string, siteId: string, articles: number, userId: string | null, options: { fetchImpl?: typeof fetch; /** Nobody is waiting: automation asks. */ unattended?: boolean; priorityTopics?: string[] } = {}): Promise<PlanningResearch> {
  let available: number | null = null;
  const outcome = (state: PlanningResearch["state"], runId: string | null = null): PlanningResearch => ({ state, runId, available });
  try {
    const profile = await getResearchProfile(tenantId, siteId);
    await reconcileReservoir(tenantId, siteId);
    const coverage = await reservoirCoverage(tenantId, siteId, profile.policy, options.priorityTopics ?? [], new Date());
    available = coverage.available;
    if (coverage.available >= articles) return outcome("sufficient");
    if (profile.policy.mode !== "automatic") return outcome("turned_off");
    if (!(await providerAvailable(profile.markets.value?.[0] ?? ""))) return outcome("no_provider");
    if (options.unattended && (!(await readSeoControl()).policy.automaticResearch || (await researchHold(tenantId, siteId)))) return outcome("not_authorized");
    const recent = await prisma.seoResearchRun.findFirst({ where: { tenantId, siteId, status: { in: [...SEO_RESEARCH_DONE] }, finishedAt: { gte: new Date(Date.now() - profile.policy.cooldownDays * DAY_MS) } }, select: { id: true } });
    if (recent) return outcome("researched_recently", recent.id);
    const focus = coverage.gaps.length ? { topics: coverage.gaps.slice(0, 3) } : {};
    const { runId } = await requestResearch({ tenantId, siteId, userId, trigger: "pending_decision", triggerKey: null, detail: `Un plan necesita ${articles} artículos y hay ${coverage.available} oportunidades de calidad.`, focus });
    await advanceResearchRun(runId, { deadlineMs: 90_000, fetchImpl: options.fetchImpl });
    const run = await prisma.seoResearchRun.findUnique({ where: { id: runId }, select: { status: true } });
    return outcome((SEO_RESEARCH_DONE as readonly string[]).includes(run?.status ?? "") ? "finished" : run?.status === "failed" || run?.status === "cancelled" ? "failed" : "in_progress", runId);
  } catch (error) {
    structuredEvent("seo_research.planning_request_failed", { tenantId, siteId, error: error instanceof Error ? error.message : String(error) }, "warn");
    return outcome("failed");
  }
}

// ---- Cost ----

/** What the run's reservations cost. Uncertain and in-flight requests hold their maximum until they are settled. */
export async function runCost(runId: string): Promise<{ actualUsd: number; heldUsd: number; uncertain: number; requests: number }> {
  const [row] = await prisma.$queryRaw<Array<{ actual: number; held: number; uncertain: number; requests: number }>>`
    SELECT COALESCE(SUM(actual_usd) FILTER (WHERE state = 'settled'), 0)::float8 AS actual, COALESCE(SUM(max_usd) FILTER (WHERE state IN ('reserved', 'dispatched', 'uncertain')), 0)::float8 AS held,
      (COUNT(*) FILTER (WHERE state = 'uncertain'))::int AS uncertain, (COUNT(*) FILTER (WHERE dispatched_at IS NOT NULL))::int AS requests
    FROM seo_spend_reservations WHERE run_id = ${runId}::uuid`;
  return { actualUsd: row.actual, heldUsd: row.held, uncertain: row.uncertain, requests: row.requests };
}

async function priceOf<C extends SeoCapability>(route: SeoRoute, capability: C, request: Omit<SeoRequests[C], "market">): Promise<number | null> {
  const control = await readSeoControl();
  return effectiveQuote(route.provider.quote(capability, { ...request, market: route.market } as SeoRequests[C]), route.provider.id, capability, control.pricing).maxUsd;
}

// ---- What to buy ----

type Workspace = { tenantId: string; siteId: string; profile: ResearchProfile; policy: ResearchPolicy; context: EditorialPlanningContext; focus: ResearchFocus };

async function loadWorkspace(run: Pick<SeoResearchRun, "tenantId" | "siteId" | "policy" | "reason">): Promise<Workspace> {
  const { tenantId, siteId } = run;
  const [profile, context] = await Promise.all([getResearchProfile(tenantId, siteId), buildEditorialPlanningContext(tenantId, siteId)]);
  return { tenantId, siteId, profile, policy: readResearchPolicy(run.policy), context, focus: (run.reason as { focus?: ResearchFocus } | null)?.focus ?? {} };
}

const marketOf = (work: Workspace) => work.focus.market ?? work.profile.markets.value?.[0] ?? work.context.site.locale;
const coverageOf = (work: Workspace) => reservoirCoverage(work.tenantId, work.siteId, work.policy, researchTopics(work.profile));

/** Everything already asked for the site in a market, plus what a plan looks at: all of it is read back for free. */
async function knownSubjects(work: Workspace, market: string): Promise<KeywordSubjects> {
  const base = await keywordSubjects(work.tenantId, work.siteId, work.context);
  const [tasks, competitors] = await Promise.all([
    prisma.seoResearchTask.findMany({ where: { tenantId: work.tenantId, siteId: work.siteId, market, kind: "discover_seed", status: "succeeded" }, select: { subject: true }, distinct: ["subject"], take: 100 }),
    prisma.competitor.findMany({ where: { tenantId: work.tenantId, siteId: work.siteId, status: "accepted" }, select: { id: true, domain: true }, orderBy: { overlapScore: "desc" }, take: 20 }),
  ]);
  const seeds = new Map(base.seeds.map((seed) => [seed.keyword, seed]));
  for (const { subject } of tasks) if (!seeds.has(subject)) seeds.set(subject, { keyword: subject, origin: "site_topic" });
  return { seeds: [...seeds.values()], competitors, ownDomain: base.ownDomain };
}

export type Acquisition = { kind: "discover_seed" | "competitor_keywords" | "own_keywords"; subject: string; market: string; reason: string; focus: boolean; maxUsd: number | null; blocked: SeoErrorCode | null };

/** The smallest useful external batches: only what nobody answered yet, focus first, within the policy's ceilings. */
async function planAcquisitions(work: Workspace, coverage: Coverage, used: Array<Pick<SeoResearchTask, "kind">> = []): Promise<Acquisition[]> {
  const market = marketOf(work);
  const { tenantId, siteId, policy, profile, focus } = work;
  const subjects = await knownSubjects(work, market);
  const stored = await storedKeywords(tenantId, work.context.site, market, subjects);
  const since = new Date(Date.now() - REPEAT_DAYS * DAY_MS);
  const past = await prisma.seoResearchTask.findMany({ where: { tenantId, siteId, market, kind: { in: [...DISCOVERY] }, status: "succeeded", finishedAt: { gte: since } }, select: { kind: true, subject: true } });
  const done = new Set(past.map((task) => `${task.kind}|${task.subject}`));
  const fresh = (kind: string, subject: string) => done.has(`${kind}|${subject}`) || stored.answered.has(`${kind === "discover_seed" ? "keyword_suggestions" : "ranked_keywords"}|${subject}`);
  const [ideas, rankings] = await Promise.all([seoRoute("keyword_suggestions", market), seoRoute("ranked_keywords", market)]);

  const wanted = new Set((focus.topics ?? []).map(normalizeKeyword));
  const gaps = new Set(coverage.gaps.map(normalizeKeyword));
  const candidates = [...wanted, ...subjects.seeds.filter((seed) => seed.origin === "opportunity").map((seed) => seed.keyword), ...researchTopics(profile).sort((a, b) => Number(gaps.has(b)) - Number(gaps.has(a))), ...subjects.seeds.map((seed) => seed.keyword)];
  const left = (limit: number, kinds: string[]) => Math.max(0, limit - used.filter((task) => kinds.includes(task.kind)).length);
  const seeds = [...new Set(candidates)].filter((seed) => seed && !fresh("discover_seed", seed)).slice(0, left(policy.maxSeedBatches, ["discover_seed"]));

  const wantedIds = new Set(focus.competitorIds ?? []);
  const ranked = [...subjects.competitors].sort((a, b) => Number(wantedIds.has(b.id)) - Number(wantedIds.has(a.id))).map((entry) => ({ kind: "competitor_keywords" as const, subject: normalizeDomain(entry.domain), focus: wantedIds.has(entry.id) }));
  // Search Console already says what the site ranks for, for free.
  const own = subjects.ownDomain && !profile.derived.firstParty.searchConsole ? [{ kind: "own_keywords" as const, subject: normalizeDomain(subjects.ownDomain), focus: false }] : [];
  const domains = [...ranked.filter((entry) => entry.focus), ...own, ...ranked.filter((entry) => !entry.focus)].filter((entry) => entry.subject && !fresh(entry.kind, entry.subject)).slice(0, left(policy.maxCompetitorBatches, ["competitor_keywords", "own_keywords"]));

  const priced = async (kind: Acquisition["kind"], subject: string, isFocus: boolean, reason: string): Promise<Acquisition> => {
    const route = kind === "discover_seed" ? ideas : rankings;
    if (!route.provider) return { kind, subject, market, reason, focus: isFocus, maxUsd: null, blocked: route.reason };
    const maxUsd = kind === "discover_seed" ? await priceOf(route, "keyword_suggestions", { seed: subject, limit: ROWS_PER_CALL }) : await priceOf(route, "ranked_keywords", { domain: subject, limit: ROWS_PER_CALL });
    return { kind, subject, market, reason, focus: isFocus, maxUsd, blocked: maxUsd === null ? "unknown_price" : null };
  };
  return Promise.all([
    ...seeds.map((seed) => priced("discover_seed", seed, wanted.has(seed), wanted.has(seed) ? "Lo pide el motivo de la investigación." : gaps.has(seed) ? "Tema del sitio sin oportunidades de calidad." : "Semilla del sitio sin datos guardados.")),
    ...domains.map((entry) => priced(entry.kind, entry.subject, entry.focus, entry.kind === "own_keywords" ? "Sin Search Console: hace falta saber por qué posiciona el sitio." : "Palabras de un competidor aceptado sin datos guardados.")),
  ]);
}

/** What a run would buy now and at most for how much. Buys and changes nothing. */
export async function estimateResearch(tenantId: string, siteId: string, focus: ResearchFocus = {}) {
  const profile = await getResearchProfile(tenantId, siteId);
  const work = await loadWorkspace({ tenantId, siteId, policy: profile.policy as unknown as Prisma.JsonObject, reason: { focus } as Prisma.JsonObject });
  const coverage = await coverageOf(work);
  const acquisitions = (await planAcquisitions(work, coverage)).filter((entry) => entry.focus || !coverage.sufficient);
  return { acquisitions, maxUsd: Math.min(profile.policy.maxUsdPerRun, acquisitions.reduce((sum, entry) => sum + (entry.maxUsd ?? 0), 0)), ceilingUsd: profile.policy.maxUsdPerRun, coverage };
}

// ---- Screening and inventory (local) ----

type Screened = { market: string; ranked: KeywordCandidate[]; rejects: KeywordReject[]; stored: Awaited<ReturnType<typeof storedKeywords>>; rows: StoredKeyword[] };

/** Ranks everything known for the market: no purchase, no write. */
async function screen(work: Workspace, market: string): Promise<Screened> {
  const { tenantId, siteId, context } = work;
  const stored = await storedKeywords(tenantId, context.site, market, await knownSubjects(work, market));
  const place = seoMarket(market);
  // A keyword its own provider has no figures for may have been measured through another one; its figures stay its own.
  const blank = stored.rows.filter((row) => row.volume === null && row.difficulty === null).map((row) => row.keyword);
  const known = place ? await knownKeywordMetrics(tenantId, place, blank, { maxAgeDays: 90, sharable: await sharableNow((await readSeoControl()).policy.shareMarketData) }) : new Map();
  const rows = stored.rows.map((row) => {
    const metric = row.volume === null && row.difficulty === null ? known.get(normalizeKeyword(row.keyword)) : undefined;
    return metric && metric.volume !== null ? { ...row, volume: metric.volume, difficulty: metric.difficulty, cpc: metric.cpc, intent: metric.intent, source: metric.source, collectedAt: metric.confirmedAt.toISOString() } : row;
  });
  const scoring = await keywordScoringFor(tenantId, { id: siteId, type: context.site.type }, context.profile?.detectedSiteType ?? null);
  const rejects: KeywordReject[] = [];
  const ranked = rankKeywordCandidates(rows, context, 300, ownRankings(stored.own), rejects, scoring);
  return { market, ranked, rejects, stored, rows };
}

/** Screening plus persistence: the keywords of the site, and the good ones in the inventory, scored by the one engine. */
async function buildInventory(work: Workspace, run: SeoResearchRun) {
  const { tenantId, siteId, policy, context } = work;
  const result = { keywords: 0, newKeywords: 0, stored: 0, rejected: {} as Record<string, number>, markets: [] as string[] };
  const markets = [...new Set([marketOf(work), ...(work.profile.markets.value ?? [])])];
  for (const market of markets) {
    const screened = await screen(work, market);
    if (!screened.rows.length && !screened.stored.own.length) continue;
    result.markets.push(market);
    const coverage = await coverageOf(work);
    const good = screened.ranked.filter((candidate) => candidate.score >= policy.minScore).slice(0, Math.min(200, Math.max(30, coverage.wanted)));
    const ids = await storeResearchOpportunities(tenantId, siteId, market, good.map((candidate) => ({ keyword: candidate.keyword, score: candidate.score, variants: candidate.variants, evidence: evidenceOfCandidate(candidate) })), run.id);
    if (market === context.site.locale) await recordRankedOpportunities(tenantId, siteId, screened.stored.own);
    const reasons = new Map(screened.rejects.map((entry) => [keywordTokens(entry.keyword).join(" "), entry.reason]));
    const scores = new Map(screened.ranked.map((candidate) => [keywordTokens(candidate.keyword).join(" "), candidate]));
    const clusters = context.clusters.map((cluster) => ({ name: cluster.name, words: keywordTokens(cluster.name) })).filter((cluster) => cluster.words.length);
    const inputs = new Map<string, SiteKeywordInput>();
    for (const row of [...screened.rows, ...screened.stored.own]) {
      const keyword = normalizeKeyword(row.keyword);
      const tokens = keywordTokens(keyword);
      const key = tokens.join(" ");
      if (!key || (!inputs.has(key) && inputs.size >= MAX_SITE_KEYWORDS)) continue;
      const candidate = scores.get(key);
      const opportunityId = candidate ? ids.get(candidate.keyword) ?? null : null;
      const reason = reasons.get(key) ?? null;
      const provider = findSeoProvider(row.providerId);
      const discoveredAt = new Date(row.collectedAt);
      const entry = inputs.get(key) ?? {
        keyword, key, status: opportunityId ? "opportunity" : reason ? "rejected" : "candidate", reason, level: candidate || reason ? 2 : row.volume !== null ? 1 : 0, score: candidate?.score ?? null,
        cluster: clusters.find((cluster) => cluster.words.every((word) => tokens.includes(word)))?.name ?? null, opportunityId, discoveries: [],
      };
      const days = provider ? retentionDays(provider.licensing) : 0;
      if (days > 0) entry.discoveries.push({ kind: row.origin.kind, value: row.origin.value, competitorId: row.competitorId, position: row.rank?.position ?? null, url: row.rank?.url ?? null, providerId: row.providerId, runId: run.id, discoveredAt, retainUntil: new Date(discoveredAt.getTime() + days * DAY_MS) });
      // What may not be stored does not enter.
      if (entry.discoveries.length) inputs.set(key, entry);
    }
    const kept = await storeSiteKeywords(tenantId, siteId, market, [...inputs.values()]);
    result.keywords += kept.total;
    result.newKeywords += kept.created;
    result.stored += ids.size;
    for (const reject of screened.rejects) result.rejected[reject.reason] = (result.rejected[reject.reason] ?? 0) + 1;
  }
  const analysis = await analyzeSite(tenantId, siteId);
  return { ...result, analysis: { open: analysis.open, deferred: analysis.deferred, rejected: analysis.rejected } };
}

/** Good opportunities there would be with what is known now: those in the inventory plus the candidates not in it yet. */
async function goodEnough(work: Workspace): Promise<{ available: number; wanted: number; enough: boolean }> {
  const market = marketOf(work);
  const [coverage, screened, existing] = await Promise.all([
    coverageOf(work), screen(work, market),
    prisma.contentOpportunity.findMany({ where: { tenantId: work.tenantId, siteId: work.siteId, query: { not: null } }, select: { query: true } }),
  ]);
  const keys = new Set(existing.map((row) => keywordTokens(row.query!).join(" ")));
  const fresh = screened.ranked.filter((candidate) => candidate.score >= work.policy.minScore && !keys.has(keywordTokens(candidate.keyword).join(" "))).length;
  return { available: coverage.available + fresh, wanted: coverage.wanted, enough: coverage.available + fresh >= coverage.wanted };
}

// ---- Executing ----

class Refused extends Error {
  constructor(readonly code: string) { super(code); }
}

type Outcome = { result: Record<string, unknown>; tasks?: Prisma.SeoResearchTaskCreateManyInput[] };

async function buy<T>(work: Workspace, run: SeoResearchRun, task: SeoResearchTask, capability: SeoCapability, send: (route: SeoRoute) => Promise<T>): Promise<T> {
  if (DISCOVERY.includes(task.kind) && !task.focus) {
    const state = await goodEnough(work);
    if (state.enough) throw new Refused("enough_opportunities");
  }
  const route = await seoRoute(capability, task.market || marketOf(work));
  if (!route.provider) throw new Refused(route.reason);
  const cost = await runCost(run.id);
  if (task.maxUsd === null || cost.actualUsd + cost.heldUsd + task.maxUsd > run.maxUsd + 1e-9) throw new Refused(task.maxUsd === null ? "unknown_price" : "run_limit");
  return send(route);
}

async function execute(work: Workspace, run: SeoResearchRun, task: SeoResearchTask, options: { fetchImpl?: typeof fetch }): Promise<Outcome> {
  const { tenantId, siteId, policy } = work;
  const scope = { fetchImpl: options.fetchImpl, runId: run.id, priority: run.trigger === "manual" || run.trigger === "pending_decision" || run.trigger === "onboarding" ? ("planning" as const) : ("background" as const) };
  const base = { tenantId, siteId, runId: run.id };
  switch (task.kind as TaskKind) {
    case "inspect_site": {
      await reconcileReservoir(tenantId, siteId);
      const profile = await getResearchProfile(tenantId, siteId, { rebuild: true });
      const { content, sitemaps } = profile.derived;
      // The crawl is reused as it is; reading the site is the index's job, not bought data.
      return { result: { pages: content.pages, read: content.read, sitemaps: sitemaps.length, reused: content.read > 0, note: content.pages === 0 ? "El sitio aún no está indexado: solo se usan los temas del perfil." : content.read < content.pages * 0.8 ? "Parte del sitio está sin leer: la cobertura de temas es parcial." : null } };
    }
    case "first_party":
      // The figures stay in their own tables.
      return { result: { searchConsole: work.profile.derived.firstParty.searchConsole, through: work.profile.derived.firstParty.through } };
    case "profile":
      return { result: { kinds: work.profile.kinds, businessModel: work.profile.businessModel, topics: researchTopics(work.profile).slice(0, 40), entities: work.profile.derived.entities.length, queriesCovered: work.profile.derived.content.queriesCovered, competitors: work.profile.derived.competitors.length, reviewed: work.profile.reviewedAt !== null } };
    case "gaps": {
      // What other paths already learned goes into the inventory first: it may be enough.
      const inventory = await buildInventory(work, run);
      const coverage = await coverageOf(work);
      // A retried run keeps the purchases it made within the same ceilings.
      const planned = await planAcquisitions(work, coverage, await prisma.seoResearchTask.findMany({ where: { runId: run.id, kind: { in: [...DISCOVERY] } }, select: { kind: true } }));
      await prisma.seoResearchRun.update({ where: { id: run.id }, data: { estimatedUsd: planned.reduce((sum, entry) => sum + (entry.maxUsd ?? 0), 0) } });
      return {
        result: { gaps: coverage.gaps, available: coverage.available, wanted: coverage.wanted, days: coverage.days, inventory },
        tasks: planned.map((entry, index) => ({ ...base, position: 100 + index + (entry.focus ? 0 : 100), kind: entry.kind, subject: entry.subject, market: entry.market, focus: entry.focus, reason: entry.reason, maxUsd: entry.maxUsd, ...(entry.blocked ? { status: "skipped", reason: entry.blocked, finishedAt: new Date() } : {}) })),
      };
    }
    case "discover_seed":
    case "competitor_keywords":
    case "own_keywords": {
      const capability = task.kind === "discover_seed" ? "keyword_suggestions" : "ranked_keywords";
      const { rows, meta } = await buy(work, run, task, capability, (route) => keywordRows(tenantId, work.context.site, route, capability, task.subject, scope));
      return { result: { rows: rows.length, withVolume: rows.filter((row) => row.volume !== null).length, provider: meta.providerId, freshness: meta.freshness, reused: meta.cache.bought === 0 } };
    }
    case "screen": {
      const inventory = await buildInventory(work, run);
      const tasks = [...(await planMetrics(work, run)), ...(await planSerp(work, run))];
      return { result: inventory, tasks };
    }
    case "metrics": {
      const keywords = ((task.result as { keywords?: string[] } | null)?.keywords ?? []).slice(0, 700);
      const found = await buy(work, run, task, "keyword_metrics", (route) => getKeywordMetrics(tenantId, siteId, keywords, route, { ...scope, decision: { importance: "normal", siteType: work.context.site.type } }));
      const plans = await prisma.editorialPlanItem.findMany({ where: { tenantId, siteId, keywordMetricsSource: null, primaryKeyword: { in: keywords, mode: "insensitive" } }, select: { planId: true }, distinct: ["planId"] });
      for (const { planId } of plans) await enrichPlanItemsWithKeywordMetrics(tenantId, planId, undefined, { reuseOnly: true });
      const measured = await refreshEvidence(work, keywords);
      return { result: { keywords, answered: found.size, measured } };
    }
    case "serp": {
      const { data, meta } = await buy(work, run, task, "serp_organic", (route) => acquireSeo(route, "serp_organic", { keyword: task.subject }, { tenantId, siteId, kind: "keyword_metrics", ...scope, decision: { importance: "normal", siteType: work.context.site.type } }));
      const own = normalizeDomain(work.context.site.baseUrl ?? "");
      const at = data.findIndex((row) => own && normalizeDomain(row.domain) === own);
      const serp = { providerId: meta.providerId, dataKind: meta.dataKind, asOf: meta.asOf, format: serpInsight(data).format, at: meta.fetchedAt, domains: [...new Set(data.map((row) => row.domain))].slice(0, 10), ownUrl: at >= 0 ? data[at].url : null, ownPosition: at >= 0 ? at + 1 : null };
      const rows = await prisma.contentOpportunity.findMany({ where: { tenantId, siteId, source: "research", query: task.subject, decidedAt: null }, select: { id: true, evidence: true } });
      for (const row of rows) await prisma.contentOpportunity.updateMany({ where: { id: row.id, decidedAt: null }, data: { evidence: { ...((row.evidence ?? {}) as Prisma.JsonObject), serp } as Prisma.InputJsonObject } });
      return { result: { results: data.length, ownPosition: serp.ownPosition } };
    }
    case "inventory": {
      const inventory = await buildInventory(work, run);
      const coverage = await coverageOf(work);
      return { result: { ...inventory, available: coverage.available, wanted: coverage.wanted, days: coverage.days, sufficient: coverage.sufficient } };
    }
  }
}

/** One batch for keywords a decision waits for and nobody measured: articles already planned and opportunities without figures. */
async function planMetrics(work: Workspace, run: SeoResearchRun): Promise<Prisma.SeoResearchTaskCreateManyInput[]> {
  const { tenantId, siteId, policy, context } = work;
  if (policy.maxMetricsBatches < 1) return [];
  const market = context.site.locale;
  const route = await seoRoute("keyword_metrics", market);
  if (!route.provider) return [];
  const [items, opportunities] = await Promise.all([
    prisma.editorialPlanItem.findMany({ where: { tenantId, siteId, channel: "website", keywordMetricsSource: null, primaryKeyword: { not: null }, scheduledFor: { gt: new Date() }, status: { in: ["proposed", "approved"] } }, select: { primaryKeyword: true }, take: 100 }),
    prisma.contentOpportunity.findMany({ where: { tenantId, siteId, source: "research", status: { in: ["open", "approved"] }, OR: [{ market }, { market: null }], query: { not: null } }, select: { query: true, evidence: true }, take: 300 }),
  ]);
  const unmeasured = opportunities.filter((row) => (row.evidence as OpportunityEvidence | null)?.provider?.volume == null).map((row) => row.query!);
  const wanted = [...new Set([...(work.focus.keywords ?? []), ...items.map((item) => item.primaryKeyword!), ...unmeasured].map(normalizeKeyword))].filter((keyword) => keyword && keyword.length <= 80).slice(0, 100);
  if (!wanted.length) return [];
  const focus = Boolean(work.focus.keywords?.length);
  const answered = await getKeywordMetrics(tenantId, siteId, wanted, route, { reuseOnly: true }).catch((error: unknown) => {
    if (error instanceof SeoProviderError) return new Map();
    throw error;
  });
  // Old evidence is asked again; otherwise only what nobody answered.
  const keywords = wanted.filter((keyword) => !answered.has(keyword) || (focus && work.focus.keywords!.map(normalizeKeyword).includes(keyword)));
  if (keywords.length < (focus ? 1 : MIN_METRICS_BATCH)) return [];
  return [{ tenantId, siteId, runId: run.id, position: 600, kind: "metrics", subject: "batch", market, focus, maxUsd: await priceOf(route, "keyword_metrics", { keywords }), reason: "Palabras planificadas u oportunidades sin medir.", result: { keywords } }];
}

/** Search results only for the few opportunities where they decide something. */
async function planSerp(work: Workspace, run: SeoResearchRun): Promise<Prisma.SeoResearchTaskCreateManyInput[]> {
  const { tenantId, siteId, policy, context } = work;
  if (policy.maxSerpLookups < 1) return [];
  const market = context.site.locale;
  const route = await seoRoute("serp_organic", market);
  if (!route.provider) return [];
  const rows = await prisma.contentOpportunity.findMany({
    where: { tenantId, siteId, source: "research", status: { in: ["open", "approved"] }, OR: [{ market }, { market: null }], query: { not: null }, score: { gte: policy.minScore } },
    orderBy: { priority: { sort: "desc", nulls: "last" } }, take: 50,
    select: { query: true, evidence: true, status: true, action: true, score: true, confidence: true, source: true, analyzedAt: true, planItemId: true, reservedUntil: true },
  });
  const chosen = rows.filter((row) => {
    const evidence = (row.evidence ?? {}) as OpportunityEvidence;
    const stage = stageOf(row, policy);
    return !evidence.serp && evidence.provider?.volume != null && (stage === "prioritized" || (stage === "qualified" && evidence.provider.difficulty === null));
  }).slice(0, policy.maxSerpLookups);
  if (!chosen.length) return [];
  // Optional detail: without a known price it is simply not part of the run.
  const maxUsd = await priceOf(route, "serp_organic", { keyword: chosen[0].query! });
  if (maxUsd === null) return [];
  return chosen.map((row, index) => ({ tenantId, siteId, runId: run.id, position: 700 + index, kind: "serp", subject: row.query!, market, maxUsd, reason: "Oportunidad prioritaria sin resultados de búsqueda guardados." }));
}

/** New figures for the opportunities that waited for them. */
async function refreshEvidence(work: Workspace, keywords: string[]): Promise<number> {
  const { tenantId, siteId } = work;
  const place = seoMarket(work.context.site.locale);
  const metrics = place ? await knownKeywordMetrics(tenantId, place, keywords, { maxAgeDays: 90 }) : new Map();
  const rows = await prisma.contentOpportunity.findMany({ where: { tenantId, siteId, source: { in: ["research", "provider"] }, status: { in: ["open", "approved", "deferred"] }, query: { not: null } }, select: { id: true, query: true, evidence: true } });
  let measured = 0;
  for (const row of rows) {
    const metric = metrics.get(normalizeKeyword(row.query!));
    if (!metric) continue;
    const evidence = (row.evidence ?? {}) as OpportunityEvidence;
    const provider = { ...evidence.provider, source: metric.source, volume: metric.volume, difficulty: metric.difficulty, cpc: metric.cpc, intent: metric.intent, asOf: null, at: metric.confirmedAt.toISOString() };
    await prisma.contentOpportunity.update({ where: { id: row.id }, data: { evidence: { ...evidence, provider } as unknown as Prisma.InputJsonObject } });
    measured += 1;
  }
  return measured;
}

/**
 * Works on a run until it ends, is paused or cancelled, has to wait, or the deadline passes. Safe to call from several
 * workers: one holds the lease. Returns the state it was left in, or null when someone else has it or it is not due.
 */
export async function advanceResearchRun(runId: string, options: { fetchImpl?: typeof fetch; deadlineMs?: number; now?: Date } = {}): Promise<string | null> {
  const deadline = Date.now() + (options.deadlineMs ?? 4 * MINUTE_MS);
  const lease = randomUUID();
  const now = options.now ?? new Date();
  if ((await readSeoControl()).emergencyStop) return null;
  const claimed = await prisma.seoResearchRun.updateMany({
    where: { id: runId, status: { in: ["queued", "running"] }, tenant: { status: "active" }, AND: [{ OR: [{ leaseUntil: null }, { leaseUntil: { lt: new Date() } }] }, { OR: [{ nextAt: null }, { nextAt: { lte: now } }] }] },
    data: { status: "running", leaseId: lease, leaseUntil: new Date(Date.now() + LEASE_MS), nextAt: null },
  });
  if (claimed.count !== 1) return null;
  const run = await prisma.seoResearchRun.findUniqueOrThrow({ where: { id: runId } });
  if (!run.startedAt) await prisma.seoResearchRun.updateMany({ where: { id: runId, leaseId: lease }, data: { startedAt: new Date() } });
  // A step another worker left half done starts over: what it bought is stored, so it is not bought again.
  await prisma.seoResearchTask.updateMany({ where: { runId, status: "running" }, data: { status: "pending" } });
  const leave = async (data: Prisma.SeoResearchRunUpdateManyMutationInput) => {
    await prisma.seoResearchRun.updateMany({ where: { id: runId, leaseId: lease, status: "running" }, data });
    await prisma.seoResearchRun.updateMany({ where: { id: runId, leaseId: lease }, data: { leaseId: null, leaseUntil: null } });
    return (await prisma.seoResearchRun.findUnique({ where: { id: runId }, select: { status: true } }))?.status ?? null;
  };

  let work: Workspace | null = null;
  while (true) {
    const task = await prisma.seoResearchTask.findFirst({ where: { runId, status: "pending" }, orderBy: [{ position: "asc" }, { id: "asc" }] });
    if (!task) return leave(await closing(run));
    if (Date.now() >= deadline) return leave({ status: "queued" });
    if ((await readSeoControl()).emergencyStop) return leave({ status: "queued", nextAt: new Date(Date.now() + 5 * MINUTE_MS) });
    const held = await prisma.seoResearchRun.updateMany({ where: { id: runId, leaseId: lease, status: "running" }, data: { leaseUntil: new Date(Date.now() + LEASE_MS) } });
    if (held.count !== 1) return leave({}); // paused, cancelled or taken over
    const started = await prisma.seoResearchTask.updateMany({ where: { id: task.id, status: "pending" }, data: { status: "running", attempts: { increment: 1 }, startedAt: new Date() } });
    if (started.count !== 1) continue;
    const finish = (data: Prisma.SeoResearchTaskUpdateManyMutationInput) => prisma.seoResearchTask.updateMany({ where: { id: task.id, status: "running" }, data });
    const before = EXTERNAL.includes(task.kind) ? await runCost(runId) : null;
    // What it really cost is recorded whatever became of the run meanwhile.
    const billed = async () => (before ? Math.max(0, (await runCost(runId)).actualUsd - before.actualUsd) : null);
    try {
      work = work && EXTERNAL.includes(task.kind) ? work : await loadWorkspace(run);
      const outcome = await execute(work, run, task, options);
      if (outcome.tasks?.length) await prisma.seoResearchTask.createMany({ data: outcome.tasks, skipDuplicates: true });
      await finish({ status: "succeeded", result: outcome.result as Prisma.InputJsonObject, billedUsd: await billed(), finishedAt: new Date() });
    } catch (error) {
      const code = error instanceof Refused ? error.code : error instanceof SeoProviderError ? error.code : null;
      const message = (error instanceof Error ? error.message : String(error)).slice(0, 300);
      if (code === "run_stopped" || code === "emergency_stop") {
        await finish({ status: "pending", attempts: task.attempts, billedUsd: await billed() });
        return leave(code === "emergency_stop" ? { status: "queued", nextAt: new Date(Date.now() + 5 * MINUTE_MS) } : {});
      }
      if (error instanceof Refused || (code && REFUSED.has(code as SeoErrorCode))) await finish({ status: "skipped", reason: code, billedUsd: await billed(), finishedAt: new Date() });
      else if (task.attempts + 1 < MAX_ATTEMPTS && (!code || LATER.has(code as SeoErrorCode))) {
        await finish({ status: "pending", reason: code ?? message, billedUsd: await billed() });
        structuredEvent("seo_research.task_retry", { tenantId: run.tenantId, siteId: run.siteId, runId, kind: task.kind, error: code ?? message }, "warn");
        return leave({ status: "queued", nextAt: new Date(Date.now() + MINUTE_MS * 4 ** (task.attempts + 1)) });
      } else {
        await finish({ status: "failed", reason: code ?? message, billedUsd: await billed(), finishedAt: new Date() });
        structuredEvent("seo_research.task_failed", { tenantId: run.tenantId, siteId: run.siteId, runId, kind: task.kind, error: code ?? message }, "warn");
        // A local step that fails leaves nothing to build on; a purchase that fails only leaves a hole.
        if (!EXTERNAL.includes(task.kind)) return leave({ status: "failed", error: `${task.kind}: ${message}`, finishedAt: new Date(), activeKey: null });
      }
    }
  }
}

async function closing(run: SeoResearchRun): Promise<Prisma.SeoResearchRunUpdateManyMutationInput> {
  const tasks = await prisma.seoResearchTask.findMany({ where: { runId: run.id }, orderBy: { position: "asc" } });
  const cost = await runCost(run.id);
  const missing = tasks.filter((task) => task.status === "failed" || (task.status === "skipped" && task.reason !== "enough_opportunities"));
  const inventory = (tasks.find((task) => task.kind === "inventory")?.result ?? {}) as Record<string, unknown>;
  const summary = {
    ...inventory, purchases: tasks.filter((task) => EXTERNAL.includes(task.kind) && task.status === "succeeded" && (task.billedUsd ?? 0) > 0).length,
    stoppedEarly: tasks.some((task) => task.reason === "enough_opportunities"), notAcquired: missing.map((task) => ({ kind: task.kind, subject: task.subject, reason: task.reason })), actualUsd: cost.actualUsd,
  };
  structuredEvent("seo_research.finished", { tenantId: run.tenantId, siteId: run.siteId, runId: run.id, trigger: run.trigger, actualUsd: cost.actualUsd, notAcquired: missing.length });
  return { status: missing.length ? "partial" : "succeeded", summary: summary as unknown as Prisma.InputJsonObject, finishedAt: new Date(), activeKey: null, error: null };
}

// ---- Control ----

async function requireRun(tenantId: string, siteId: string, runId: string) {
  const run = await prisma.seoResearchRun.findFirst({ where: { id: runId, tenantId, siteId } });
  if (!run) throw new Error("research_run_not_found");
  return run;
}

export const RUN_CONTROLS = ["pause", "resume", "cancel", "retry"] as const;

/** From the next instant nothing new of a paused or cancelled run is sent; what was already sent is accounted for when it ends. */
export async function controlResearchRun(tenantId: string, siteId: string, runId: string, control: (typeof RUN_CONTROLS)[number], userId: string | null) {
  await requireRun(tenantId, siteId, runId);
  const where = (status: string[]) => ({ id: runId, tenantId, siteId, status: { in: status } });
  let changed = 0;
  if (control === "pause") changed = (await prisma.seoResearchRun.updateMany({ where: where(["queued", "running"]), data: { status: "paused" } })).count;
  else if (control === "resume") changed = (await prisma.seoResearchRun.updateMany({ where: where(["paused"]), data: { status: "queued", nextAt: null } })).count;
  else if (control === "cancel") {
    changed = (await prisma.seoResearchRun.updateMany({ where: where([...ACTIVE]), data: { status: "cancelled", activeKey: null, finishedAt: new Date() } })).count;
    if (changed) await prisma.seoResearchTask.updateMany({ where: { runId, status: "pending" }, data: { status: "cancelled", finishedAt: new Date() } });
  } else {
    try {
      changed = (await prisma.seoResearchRun.updateMany({ where: where(["failed", "partial", "cancelled"]), data: { status: "queued", activeKey: siteId, finishedAt: null, nextAt: null, error: null } })).count;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new Error("research_already_running");
      throw error;
    }
    if (changed) {
      // Only what was not done; what succeeded is a checkpoint. The last steps run again over what arrives.
      await prisma.seoResearchTask.updateMany({ where: { runId, status: { in: ["failed", "cancelled"] } }, data: { status: "pending", attempts: 0, finishedAt: null } });
      // A skipped purchase was never made: it is planned again with today's prices and providers.
      await prisma.seoResearchTask.deleteMany({ where: { runId, status: "skipped", kind: { in: [...EXTERNAL] } } });
      await prisma.seoResearchTask.updateMany({ where: { runId, kind: { in: ["gaps", "screen", "inventory"] } }, data: { status: "pending", attempts: 0, finishedAt: null } });
    }
  }
  if (!changed) throw new Error("research_run_not_controllable");
  await writeAudit({ tenantId, actorType: userId ? "user" : "system", actorUserId: userId, action: `seo_research.${control}`, entityType: "seo_research_run", entityId: runId, metadata: { siteId } });
  return getResearchRun(tenantId, siteId, runId);
}

// ---- Reading ----

function summarize(run: SeoResearchRun, tasks: Array<Pick<SeoResearchTask, "status">>) {
  const finished = tasks.filter((task) => !["pending", "running"].includes(task.status)).length;
  return {
    id: run.id, trigger: run.trigger, reason: run.reason, status: run.status, maxUsd: run.maxUsd, estimatedUsd: run.estimatedUsd, summary: run.summary, error: run.error, nextAt: run.nextAt,
    createdAt: run.createdAt, startedAt: run.startedAt, finishedAt: run.finishedAt, requestedByUserId: run.requestedByUserId,
    progress: tasks.length ? Math.round((100 * finished) / tasks.length) : 0, completedTasks: finished, totalTasks: tasks.length,
  };
}

export async function listResearchRuns(tenantId: string, siteId: string, take = 30) {
  const runs = await prisma.seoResearchRun.findMany({ where: { tenantId, siteId }, orderBy: { createdAt: "desc" }, take, include: { tasks: { select: { status: true } } } });
  const costs = await Promise.all(runs.map((run) => runCost(run.id)));
  return runs.map(({ tasks, ...run }, index) => ({ ...summarize(run, tasks), cost: costs[index] }));
}

export async function getResearchRun(tenantId: string, siteId: string, runId: string) {
  const run = await requireRun(tenantId, siteId, runId);
  const tasks = await prisma.seoResearchTask.findMany({ where: { runId, tenantId }, orderBy: [{ position: "asc" }, { id: "asc" }] });
  return {
    ...summarize(run, tasks), cost: await runCost(runId),
    tasks: tasks.map((task) => ({ id: task.id, kind: task.kind, subject: task.subject, market: task.market, status: task.status, reason: task.reason, focus: task.focus, attempts: task.attempts, external: EXTERNAL.includes(task.kind), maxUsd: task.maxUsd, billedUsd: task.billedUsd, result: task.result, startedAt: task.startedAt, finishedAt: task.finishedAt })),
  };
}

export async function getResearchOverview(tenantId: string, siteId: string) {
  const profile = await getResearchProfile(tenantId, siteId);
  const coverage = await reservoirCoverage(tenantId, siteId, profile.policy, researchTopics(profile));
  const [triggers, runs, keywords] = await Promise.all([
    evaluateTriggers(tenantId, siteId, profile, coverage), listResearchRuns(tenantId, siteId),
    prisma.siteKeyword.groupBy({ by: ["status"], where: { tenantId, siteId }, _count: { _all: true } }),
  ]);
  return { profile, coverage, triggers, runs, active: runs.find((run) => (ACTIVE as readonly string[]).includes(run.status)) ?? null, keywords: Object.fromEntries(keywords.map((row) => [row.status, row._count._all])) };
}

// ---- Worker ----

const CHECK_EVERY_MS = 6 * 3_600_000;

/** Looks at one site and starts the first justified research, if any. */
export async function checkSiteResearch(tenantId: string, siteId: string, now = new Date()): Promise<{ runId: string; created: boolean } | null> {
  await reconcileReservoir(tenantId, siteId);
  const profile = await getResearchProfile(tenantId, siteId, { now });
  await prisma.siteResearchProfile.update({ where: { siteId }, data: { nextCheckAt: new Date(now.getTime() + CHECK_EVERY_MS) } });
  // Nobody is asking: the platform must have allowed it, and the site must not have opted out.
  if (profile.policy.mode !== "automatic" || !(await readSeoControl()).policy.automaticResearch || (await researchHold(tenantId, siteId))) return null;
  const coverage = await reservoirCoverage(tenantId, siteId, profile.policy, researchTopics(profile), now);
  const [first] = await evaluateTriggers(tenantId, siteId, profile, coverage, now);
  // Nothing to gain from a run that can neither buy nor read anything new.
  if (!first || (!(await providerAvailable(profile.markets.value?.[0] ?? "")) && first.trigger !== "performance_change")) return null;
  return requestResearch({ tenantId, siteId, ...first });
}

/** Continues open runs and looks for justified ones in sites with editorial activity. */
export async function runResearchTick(options: { fetchImpl?: typeof fetch; now?: Date } = {}): Promise<{ advanced: number; checked: number }> {
  const now = options.now ?? new Date();
  await purgeExpiredSeoData(); // retention does not wait for the next purchase
  if ((await readSeoControl()).emergencyStop) return { advanced: 0, checked: 0 };
  const due = await prisma.seoResearchRun.findMany({
    where: { tenant: { status: "active" }, OR: [{ status: "queued", AND: [{ OR: [{ nextAt: null }, { nextAt: { lte: now } }] }] }, { status: "running", leaseUntil: { lt: now } }] },
    orderBy: { createdAt: "asc" }, take: 3, select: { id: true, tenantId: true, siteId: true },
  });
  for (const run of due) {
    try {
      await advanceResearchRun(run.id, { fetchImpl: options.fetchImpl, now });
    } catch (error) {
      structuredEvent("seo_research.advance_failed", { tenantId: run.tenantId, siteId: run.siteId, runId: run.id, error: error instanceof Error ? error.message : String(error) }, "error");
    }
  }
  const sites = await prisma.site.findMany({
    where: {
      tenant: { status: "active" }, OR: [{ siteResearchProfile: null }, { siteResearchProfile: { OR: [{ nextCheckAt: null }, { nextCheckAt: { lte: now } }] } }],
      editorialPlanItems: { some: { channel: "website", status: { notIn: ["rejected", "canceled"] }, scheduledFor: { gte: new Date(now.getTime() - 30 * DAY_MS) } } },
    },
    take: 5, select: { id: true, tenantId: true },
  });
  for (const site of sites) {
    try {
      await checkSiteResearch(site.tenantId, site.id, now);
    } catch (error) {
      structuredEvent("seo_research.check_failed", { tenantId: site.tenantId, siteId: site.id, error: error instanceof Error ? error.message : String(error) }, "error");
    }
  }
  return { advanced: due.length, checked: sites.length };
}

/** Onboarding: once per site. What an interrupted or repeated onboarding already researched is not researched again. */
export async function startOnboardingResearch(tenantId: string, siteId: string, userId: string | null, options: { fetchImpl?: typeof fetch; deadlineMs?: number } = {}) {
  const { runId } = await requestResearch({ tenantId, siteId, userId, trigger: "onboarding", triggerKey: "onboarding", detail: "Primera investigación del sitio.", focus: {} });
  await advanceResearchRun(runId, { fetchImpl: options.fetchImpl, deadlineMs: options.deadlineMs ?? 3 * MINUTE_MS });
  return getResearchRun(tenantId, siteId, runId);
}
