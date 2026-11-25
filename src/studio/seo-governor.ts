// SEO Cost Governor (SEO-V2-02): hard budgets, atomic reservations, single flight and settlement.
//
// A paid request needs a reservation of its maximum price before it is sent. Reservations are made one at a time (a
// database lock), in the transaction that also checks every limit and takes the single-flight leases.
//   reserved -> dispatched -> settled (what was billed) | released (nothing was billed) | uncertain (may have been billed)
// reserved, dispatched and uncertain rows hold their maximum in every budget. An uncertain row is never released by
// itself: a late answer settles it, or an administrator resolves it.

import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { getPrismaClient } from "../infrastructure/db/prisma";
import { SeoProviderError, type SeoCapability, type SeoErrorCode, type SeoProvider, type SeoQuote } from "../infrastructure/seo/contract";
import { SEO_PRICING_VERSION, effectiveQuote } from "../infrastructure/seo/pricing";
import { seoBlockReason, SEO_LOCKS, type SeoLocks, type SeoTrigger } from "../infrastructure/seo/registry";
import { structuredEvent } from "../shared/utils/logger";
import { evaluateAiSpend } from "./cost-budgets";
import { notify } from "./notifications";
import { readSeoControl } from "./seo-control";

const prisma = getPrismaClient();
type Client = Prisma.TransactionClient;

/** Longer than the slowest adapter timeout (45 s): past this a silent worker is gone. */
export const SEO_LEASE_MS = 120_000;
/** The same data is not asked again for a day while its last request may have been billed. */
export const SEO_UNCERTAIN_HOLD_MS = 24 * 3_600_000;
const COOLDOWN_BASE_MS = 60_000;
/** Background work leaves this part of every recurring limit to people waiting for an answer. */
const BACKGROUND_SHARE = 0.8;
const LOCK_ID = 20261124;

export type SeoBudgetScope = "global" | "provider" | "plan" | "tenant" | "site";
export const SEO_BUDGET_SCOPES: readonly SeoBudgetScope[] = ["global", "provider", "plan", "tenant", "site"];
export const SEO_BUDGET_PERIODS = ["daily", "monthly", "total"] as const;
export type SeoBudgetPeriod = (typeof SEO_BUDGET_PERIODS)[number];
export const SEO_BUDGET_ALLOWANCES = ["any", "onboarding", "recurring"] as const;
export type SeoAllowance = "onboarding" | "recurring" | "admin_test";
export type SeoBudgetKey = { scope: SeoBudgetScope; scopeId: string; operation: string; allowance: string; period: SeoBudgetPeriod };
export type SeoBudgetLimit = SeoBudgetKey & { limitUsd: number; extraUsd: number; source: "default" | "custom"; /** Plan budgets are per workspace: whose. */ tenantId?: string };
export type SeoPriority = "interactive" | "planning" | "background";

const limit = (scope: SeoBudgetScope, scopeId: string, period: SeoBudgetPeriod, limitUsd: number, patch: Partial<SeoBudgetKey> = {}) => ({ scope, scopeId, operation: "*", allowance: "any", period, limitUsd, ...patch });

/** In force without any row. "*" applies to each provider, plan, tenant or site on its own. */
export const DEFAULT_SEO_BUDGETS: ReadonlyArray<SeoBudgetKey & { limitUsd: number }> = [
  limit("global", "platform", "monthly", 25),
  limit("global", "platform", "daily", 5),
  limit("provider", "*", "monthly", 20),
  limit("plan", "*", "monthly", 5), // per tenant on the plan
  limit("tenant", "*", "monthly", 5),
  limit("tenant", "*", "daily", 2),
  limit("site", "*", "monthly", 3, { allowance: "recurring" }),
  limit("site", "*", "total", 2, { allowance: "onboarding" }),
  limit("site", "*", "daily", 1), // burst protection
  limit("site", "*", "monthly", 0.5, { operation: "search_volume" }),
  // News and discovery run all day: they must not use up what keyword research needs.
  limit("tenant", "*", "monthly", 2, { operation: "web_search" }),
  limit("tenant", "*", "monthly", 1, { operation: "web_extract" }),
];

export const budgetKeyOf = (key: SeoBudgetKey) => [key.scope, key.scopeId, key.operation, key.allowance, key.period].join("|");
/** Stored and compared as UTC text: the session's time zone must not move a period. */
const sqlTime = (date: Date) => Prisma.sql`${date.toISOString().slice(0, 23)}::timestamp`;
const roundUp = (usd: number) => Math.ceil(usd * 1e6 - 1e-6) / 1e6;

function periodStart(period: SeoBudgetPeriod, now: Date): Date {
  if (period === "total") return new Date(0);
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), period === "daily" ? now.getUTCDate() : 1));
}

type BudgetContext = { tenantId: string; siteId: string | null; providerId: string; plan: string; operation: string; allowance: string };

/** Every limit that applies: for each scope the specific row wins over "*", and a stored row over the default. All must have room. */
export async function applicableBudgets(client: Client | typeof prisma, context: BudgetContext, now = new Date()): Promise<SeoBudgetLimit[]> {
  const ids: Record<SeoBudgetScope, string | null> = { global: "platform", provider: context.providerId, plan: context.plan, tenant: context.tenantId, site: context.siteId };
  const [rows, extras] = [await client.seoBudget.findMany(), await client.seoBudgetAuthorization.findMany({ where: { revokedAt: null, expiresAt: { gt: now } } })];
  const chosen = new Map<string, SeoBudgetLimit & { rank: number }>();
  const consider = (key: SeoBudgetKey, limitUsd: number, source: "default" | "custom") => {
    const id = ids[key.scope];
    if (!id || (key.scopeId !== "*" && key.scopeId !== id)) return;
    if (key.operation !== "*" && key.operation !== context.operation) return;
    if (key.allowance !== "any" && key.allowance !== context.allowance) return;
    const concrete = { scope: key.scope, scopeId: id, operation: key.operation, allowance: key.allowance, period: key.period, ...(key.scope === "plan" ? { tenantId: context.tenantId } : {}) };
    const rank = (key.scopeId === id ? 2 : 0) + (source === "custom" ? 1 : 0);
    const current = chosen.get(budgetKeyOf(concrete));
    if (!current || rank > current.rank) chosen.set(budgetKeyOf(concrete), { ...concrete, limitUsd, extraUsd: 0, source, rank });
  };
  for (const entry of DEFAULT_SEO_BUDGETS) consider(entry, entry.limitUsd, "default");
  for (const row of rows) consider(row as unknown as SeoBudgetKey, Number(row.limitUsd), "custom");
  for (const extra of extras) {
    const budget = chosen.get(budgetKeyOf(extra as unknown as SeoBudgetKey));
    if (budget) budget.extraUsd += Number(extra.amountUsd);
  }
  return [...chosen.values()].map(({ rank: _rank, ...budget }) => budget);
}

export type SeoBudgetUse = { actualUsd: number; heldUsd: number };

/** What each budget has spent (settled) and holds (reserved, in flight or uncertain) in its current period. */
export async function budgetUse(client: Client | typeof prisma, budgets: SeoBudgetLimit[], now = new Date()): Promise<SeoBudgetUse[]> {
  if (!budgets.length) return [];
  const where = (budget: SeoBudgetLimit) => {
    const conditions = [Prisma.sql`created_at >= ${sqlTime(periodStart(budget.period, now))}`];
    if (budget.scope === "provider") conditions.push(Prisma.sql`provider_id = ${budget.scopeId}`);
    if (budget.scope === "tenant") conditions.push(Prisma.sql`tenant_id = ${budget.scopeId}::uuid`);
    if (budget.scope === "plan") conditions.push(Prisma.sql`tenant_id = ${budget.tenantId}::uuid`);
    if (budget.scope === "site") conditions.push(Prisma.sql`target_site_id = ${budget.scopeId}::uuid`);
    if (budget.operation !== "*") conditions.push(Prisma.sql`operation = ${budget.operation}`);
    if (budget.allowance !== "any") conditions.push(Prisma.sql`allowance = ${budget.allowance}`);
    return Prisma.join(conditions, " AND ");
  };
  // shortcut: adds up the ledger on each reservation; keep running counters past ~100k reservations a month.
  const use = await client.$queryRaw<Array<{ i: number; actual: number; held: number }>>(Prisma.join(budgets.map((budget, i) => Prisma.sql`
    SELECT ${i}::int AS i,
      COALESCE(SUM(actual_usd) FILTER (WHERE state = 'settled'), 0)::float8 AS actual,
      COALESCE(SUM(max_usd) FILTER (WHERE state IN ('reserved', 'dispatched', 'uncertain')), 0)::float8 AS held
    FROM seo_spend_reservations WHERE ${where(budget)}`), " UNION ALL "));
  return budgets.map((_, index) => {
    const row = use.find((entry) => entry.i === index);
    return { actualUsd: row?.actual ?? 0, heldUsd: row?.held ?? 0 };
  });
}

export type ReserveInput = {
  /** Same id = same reservation: a job delivered twice does not hold or spend twice. */
  idempotencyKey?: string;
  tenantId: string;
  siteId: string | null;
  provider: SeoProvider;
  capability: SeoCapability;
  kind: string;
  resource: string;
  /** Single-flight keys of what will be bought. */
  keys: string[];
  /** Price of buying those of `keys` that this caller gets. */
  quote(keys: string[]): SeoQuote;
  priority?: SeoPriority;
  trigger?: SeoTrigger;
  locks?: SeoLocks;
  /** Research run that asks: its request leaves only while the run is running. */
  runId?: string;
};

export type SeoReservation = { id: string; maxUsd: number; quote: SeoQuote };
export type ReserveResult = {
  /** null: every key is taken by someone else or may not be asked yet. */
  reservation: SeoReservation | null;
  claimed: string[];
  /** Being acquired by another worker right now. */
  busy: string[];
  /** Not to be asked again yet (failed or possibly billed). */
  blocked: Array<{ key: string; code: SeoErrorCode }>;
};

class BudgetExhausted extends SeoProviderError {
  constructor(readonly budget: SeoBudgetLimit, providerId: string, maxUsd: number, remainingUsd: number) {
    super("budget_exhausted", `${budget.scope} ${budget.period} SEO budget has ${Math.max(0, remainingUsd).toFixed(4)} USD left; this request can cost ${maxUsd.toFixed(4)}`, providerId, 0);
  }
}

let lastReservation: Promise<unknown> = Promise.resolve();

/**
 * Reserves the maximum price of one request, or throws the reason it must not be sent. Nothing is reserved on a throw.
 * Waits its turn on the lock, so any number of workers see consistent budgets. One at a time per process: waiting
 * for the database lock must not hold more than one connection of the pool.
 */
export function reserveSeoSpend(input: ReserveInput): Promise<ReserveResult> {
  const turn = lastReservation.then(() => reserveNow(input));
  lastReservation = turn.catch(() => undefined);
  return turn;
}

async function reserveNow(input: ReserveInput): Promise<ReserveResult> {
  const { provider, capability, tenantId, siteId } = input;
  const refuse = (code: SeoErrorCode, message: string) => new SeoProviderError(code, `${provider.id}: ${message}`, provider.id, 0);
  // The tenant's general spending limits (AI included) also apply; SEO charges are part of that ledger.
  const upper = effectiveQuote(input.quote(input.keys), provider.id, capability, (await readSeoControl()).pricing);
  const general = await evaluateAiSpend({ tenantId, siteId, kind: input.kind, estimatedCostUsd: upper.maxUsd ?? 0 });
  if (!general.allowed) throw refuse("budget_exhausted", general.reason);
  try {
    return await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${LOCK_ID})`;
      const now = new Date();
      await recoverSeoReservations(tx, now);

      if (input.idempotencyKey) {
        const existing = await tx.seoSpendReservation.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
        if (existing) {
          if (existing.state === "reserved" || existing.state === "dispatched") return { reservation: null, claimed: [], busy: input.keys, blocked: [] };
          if (existing.state === "uncertain") throw refuse("billing_uncertain", "this request may already have been billed");
          throw refuse("duplicate_request", `already ${existing.state}`);
        }
      }

      const control = await readSeoControl(tx);
      const reason = seoBlockReason(provider, capability, null, control, input.trigger, input.locks ?? SEO_LOCKS);
      if (reason) throw refuse(reason, `${capability} ${reason}`);
      if (input.trigger !== "authorized_test") {
        const circuit = control.circuits[provider.id];
        if (circuit && circuit.until > now) throw refuse("circuit_open", `paused until ${circuit.until.toISOString()} (${circuit.reason ?? "failures"})`);
      }
      const [{ recent }] = await tx.$queryRaw<Array<{ recent: number }>>`
        SELECT COUNT(*)::int AS recent FROM seo_spend_reservations WHERE provider_id = ${provider.id} AND state <> 'released' AND created_at >= ${sqlTime(new Date(now.getTime() - 60_000))}`;
      if (recent >= control.policy.maxRequestsPerMinute) throw refuse("quota_wait", `${recent} requests in the last minute`);

      const id = randomUUID();
      const leaseUntil = new Date(now.getTime() + SEO_LEASE_MS);
      const keys = [...new Set(input.keys)].sort();
      const claimed = (await tx.$queryRaw<Array<{ key: string }>>`
        INSERT INTO seo_acquisition_leases AS l (key, reservation_id, status, attempts, until)
        SELECT key, ${id}::uuid, 'held', 0, ${sqlTime(leaseUntil)} FROM unnest(${keys}::text[]) AS key
        ON CONFLICT (key) DO UPDATE SET reservation_id = EXCLUDED.reservation_id, status = 'held', until = EXCLUDED.until WHERE l.until < ${sqlTime(now)}
        RETURNING l.key`).map((row) => row.key);
      const taken = new Set(claimed);
      const others = await tx.seoAcquisitionLease.findMany({ where: { key: { in: keys.filter((key) => !taken.has(key)) } } });
      const busy = others.filter((lease) => lease.status === "held").map((lease) => lease.key);
      const blocked = others.filter((lease) => lease.status !== "held").map((lease) => ({ key: lease.key, code: (lease.status === "uncertain" ? "billing_uncertain" : "retry_cooldown") as SeoErrorCode }));
      if (!claimed.length) return { reservation: null, claimed, busy, blocked };

      const ordered = input.keys.filter((key) => taken.has(key));
      const quote = effectiveQuote(input.quote(ordered), provider.id, capability, control.pricing);
      if (quote.maxUsd === null || !Number.isFinite(quote.maxUsd) || quote.maxUsd < 0) throw refuse("unknown_price", `the maximum price of ${capability} is unknown`);
      const maxUsd = roundUp(quote.maxUsd);

      const tenant = await tx.tenant.findUnique({ where: { id: tenantId }, select: { plan: true, status: true } });
      if (!tenant || tenant.status !== "active") throw refuse("budget_exhausted", "the workspace is not active");
      const site = siteId ? await tx.site.findUnique({ where: { id: siteId }, select: { tenantId: true, createdAt: true } }) : null;
      if (siteId && site?.tenantId !== tenantId) throw refuse("bad_request", "the site does not belong to the workspace");
      const onboarding = site && now.getTime() - site.createdAt.getTime() < control.policy.onboardingDays * 86_400_000;
      const allowance: SeoAllowance = input.trigger === "authorized_test" ? "admin_test" : onboarding ? "onboarding" : "recurring";
      const budgets = await applicableBudgets(tx, { tenantId, siteId, providerId: provider.id, plan: tenant.plan ?? "none", operation: capability, allowance }, now);
      if (!budgets.some((budget) => budget.scope === "global")) throw refuse("budget_exhausted", "there is no global budget");
      const use = await budgetUse(tx, budgets, now);
      budgets.forEach((budget, index) => {
        const share = input.priority === "background" && budget.period !== "total" ? BACKGROUND_SHARE : 1;
        const remaining = (budget.limitUsd + budget.extraUsd) * share - use[index].actualUsd - use[index].heldUsd;
        if (maxUsd > remaining + 1e-9) throw new BudgetExhausted(budget, provider.id, maxUsd, remaining);
      });

      await tx.seoSpendReservation.create({
        data: {
          id, idempotencyKey: input.idempotencyKey ?? id, runId: input.runId ?? null, tenantId, targetSiteId: siteId, providerId: provider.id, operation: capability, allowance,
          kind: input.kind, resource: input.resource, units: ordered.length, state: "reserved", estimatedUsd: quote.estimatedUsd === null ? null : roundUp(quote.estimatedUsd), maxUsd,
          pricingVersion: SEO_PRICING_VERSION, leaseUntil, createdAt: now,
        },
      });
      return { reservation: { id, maxUsd, quote }, claimed: ordered, busy, blocked };
    }, { maxWait: 60_000, timeout: 60_000 });
  } catch (error) {
    if (error instanceof BudgetExhausted) await reportExhausted(error.budget, input);
    throw error;
  }
}

async function reportExhausted(budget: SeoBudgetLimit, input: ReserveInput): Promise<void> {
  structuredEvent("seo.budget_exhausted", { tenantId: input.tenantId, siteId: input.siteId, provider: input.provider.id, capability: input.capability, budget: budgetKeyOf(budget), limitUsd: budget.limitUsd + budget.extraUsd }, "warn");
  if (budget.scope === "global" || budget.scope === "provider") return; // platform limits are not the workspace's business
  await notify({
    tenantId: input.tenantId, siteId: input.siteId, category: "operations", severity: "warning", entityType: "seo_budget", actionUrl: "/studio/operations",
    title: "SEO data budget reached", message: `The ${budget.period} SEO data budget is used up. Stored data keeps being used; nothing new is bought until it renews.`,
    dedupeKey: `seo.budget.${budgetKeyOf(budget)}`, dedupeWindowMs: 24 * 3_600_000,
  }).catch(() => undefined);
}

/**
 * Last check before the request leaves. false: the reservation was lost, or an emergency stop, the kill switch, the
 * provider switch or the pause or cancellation of its research run came in between; the request must not be sent.
 */
export async function dispatchSeoReservation(id: string, providerId: string): Promise<boolean> {
  const now = new Date();
  return (await prisma.$executeRaw`
    UPDATE seo_spend_reservations SET state = 'dispatched', dispatched_at = ${sqlTime(now)}, lease_until = ${sqlTime(new Date(now.getTime() + SEO_LEASE_MS))}
    WHERE id = ${id}::uuid AND state = 'reserved' AND lease_until > ${sqlTime(now)}
      AND NOT EXISTS (SELECT 1 FROM seo_control_settings WHERE id = 'global' AND (emergency_stop OR mode = 'disabled'))
      AND (run_id IS NULL OR EXISTS (SELECT 1 FROM seo_research_runs r WHERE r.id = run_id AND r.status = 'running'))
      AND NOT EXISTS (SELECT 1 FROM seo_provider_states WHERE provider_id = ${providerId} AND NOT enabled)`) === 1;
}

/** Leases of a finished request: removed, or kept as a cool-down (failure) or a hold (may have been billed). */
async function closeLeases(client: Client, reservationId: string, outcome: { status: "done" } | { status: "cooldown" | "uncertain"; errorCode: string | null }, now: Date): Promise<void> {
  if (outcome.status === "done") {
    await client.seoAcquisitionLease.deleteMany({ where: { reservationId } });
  } else if (outcome.status === "uncertain") {
    await client.seoAcquisitionLease.updateMany({ where: { reservationId }, data: { status: "uncertain", errorCode: outcome.errorCode, attempts: { increment: 1 }, until: new Date(now.getTime() + SEO_UNCERTAIN_HOLD_MS) } });
  } else {
    // 1, 4, 16, 64… minutes, at most a day: retries are bounded across workers.
    await client.$executeRaw`
      UPDATE seo_acquisition_leases SET status = 'cooldown', error_code = ${outcome.errorCode}, attempts = attempts + 1,
        until = ${sqlTime(now)} + LEAST(${COOLDOWN_BASE_MS / 1000} * POWER(4, LEAST(attempts, 8)), 86400) * INTERVAL '1 second'
      WHERE reservation_id = ${reservationId}::uuid`;
  }
}

export type SettleInput = {
  actualUsd: number;
  /** The provider did not say: the maximum is assumed. */
  assumed?: boolean;
  /** The request failed but was billed. */
  errorCode?: string | null;
  /** Leases of what a partial answer left out: asked again only after a cool-down. */
  unanswered?: string[];
  resolution?: string;
  resolvedByUserId?: string | null;
};

/** Records what a request cost, once: the reservation and its ledger entry change together. */
export async function settleSeoReservation(id: string, input: SettleInput, from: readonly string[] = ["dispatched", "uncertain"]): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const now = new Date();
    const changed = await tx.$executeRaw`
      UPDATE seo_spend_reservations SET state = 'settled', actual_usd = ${new Prisma.Decimal(input.actualUsd.toFixed(6))}, resolved_at = ${sqlTime(now)},
        resolution = ${input.resolution ?? (input.assumed ? "assumed_maximum" : input.errorCode ? `billed_failure:${input.errorCode}` : "billed")}, resolved_by_user_id = ${input.resolvedByUserId ?? null}::uuid
      WHERE id = ${id}::uuid AND state IN (${Prisma.join([...from])})`;
    if (changed !== 1) return false;
    const row = await tx.seoSpendReservation.findUniqueOrThrow({ where: { id } });
    // The tenant or the site may be gone by now; its spending still counts in the reservations.
    const tenant = await tx.tenant.findUnique({ where: { id: row.tenantId }, select: { id: true } });
    const site = row.targetSiteId ? await tx.site.findUnique({ where: { id: row.targetSiteId }, select: { id: true } }) : null;
    if (input.actualUsd > 0 && tenant) {
      await tx.aiSpendEvent.create({ data: { tenantId: row.tenantId, siteId: site?.id ?? null, kind: row.kind, provider: row.providerId, model: row.resource, costUsd: Number(row.actualUsd), reservationId: id } });
    }
    if (!input.errorCode) await tx.seoAcquisitionLease.deleteMany({ where: { reservationId: id, key: { notIn: input.unanswered ?? [] } } });
    await closeLeases(tx, id, input.errorCode || input.unanswered?.length ? { status: "cooldown", errorCode: input.errorCode ?? "partial_answer" } : { status: "done" }, now);
    return true;
  }, { maxWait: 60_000, timeout: 60_000 });
}

/** Nothing was billed. */
export async function releaseSeoReservation(id: string, resolution: string, errorCode: string | null = null): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const now = new Date();
    const changed = await tx.$executeRaw`
      UPDATE seo_spend_reservations SET state = 'released', actual_usd = 0, resolved_at = ${sqlTime(now)}, resolution = ${resolution}
      WHERE id = ${id}::uuid AND state IN ('reserved', 'dispatched')`;
    if (changed !== 1) return false;
    await closeLeases(tx, id, errorCode ? { status: "cooldown", errorCode } : { status: "done" }, now);
    return true;
  }, { maxWait: 60_000, timeout: 60_000 });
}

/** The request left and its bill is not known: it keeps holding its maximum. */
export async function markSeoReservationUncertain(id: string, errorCode: string): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const changed = await tx.$executeRaw`UPDATE seo_spend_reservations SET state = 'uncertain', resolution = ${errorCode} WHERE id = ${id}::uuid AND state = 'dispatched'`;
    if (changed === 1) await closeLeases(tx, id, { status: "uncertain", errorCode }, new Date());
    return changed === 1;
  }, { maxWait: 60_000, timeout: 60_000 });
}

/** Requests whose worker went silent: never sent → released; sent → uncertain (holds its maximum). */
export async function recoverSeoReservations(client: Client | typeof prisma = prisma, now = new Date()): Promise<{ released: number; uncertain: number }> {
  const released = await client.$queryRaw<Array<{ id: string }>>`
    UPDATE seo_spend_reservations SET state = 'released', actual_usd = 0, resolved_at = ${sqlTime(now)}, resolution = 'worker_lost_before_dispatch'
    WHERE state = 'reserved' AND lease_until < ${sqlTime(now)} RETURNING id::text`;
  const uncertain = await client.$queryRaw<Array<{ id: string }>>`
    UPDATE seo_spend_reservations SET state = 'uncertain', resolution = 'worker_lost_after_dispatch'
    WHERE state = 'dispatched' AND lease_until < ${sqlTime(now)} RETURNING id::text`;
  // shortcut: one statement per lost request; there are only ever a handful.
  for (const { id } of released) await closeLeases(client as Client, id, { status: "done" }, now);
  for (const { id } of uncertain) {
    await closeLeases(client as Client, id, { status: "uncertain", errorCode: "worker_lost_after_dispatch" }, now);
    structuredEvent("seo.reservation_uncertain", { reservationId: id, reason: "worker_lost_after_dispatch" }, "error");
  }
  return { released: released.length, uncertain: uncertain.length };
}

/** An administrator states what an uncertain request really cost (0 = it was not billed). */
export async function resolveUncertainReservation(id: string, actualUsd: number, note: string, userId: string | null): Promise<boolean> {
  return settleSeoReservation(id, { actualUsd, resolution: `admin:${note.slice(0, 200)}`, resolvedByUserId: userId }, ["uncertain"]);
}

/** Waits until nobody is acquiring these keys (or the holder is lost). */
export async function waitForSeoLeases(keys: string[], timeoutMs = SEO_LEASE_MS): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  for (let pause = 50; ; pause = Math.min(pause * 1.5, 1000)) {
    const held = await prisma.seoAcquisitionLease.count({ where: { key: { in: keys }, status: "held", until: { gt: new Date() } } });
    if (!held) return true;
    if (Date.now() >= deadline) return false;
    await new Promise((resolve) => setTimeout(resolve, pause));
  }
}
