// Autopilot keeps one month of keyword plan ahead: the free publishing slots of the next 30 days are
// filled with plan items (measured keywords first). The article itself is still written just in time.

import type { AutomationPolicy } from "@prisma/client";
import { withAiTenant } from "../infrastructure/ai/ai-settings";
import { getPrismaClient } from "../infrastructure/db/prisma";
import { seoCapabilityAvailable } from "./seo-manager";
import { structuredEvent } from "../shared/utils/logger";
import { getOrCreatePolicy, isDayActive, readPublishingWindows } from "./automation";
import { PLAN_LEAD_TIME_MINUTES } from "./automation-mode";
import { evaluateAiSpend } from "./cost-budgets";
import { enqueuePlanSlots, readPlanItemSelection, type PlanResearch, type PlanShortage } from "./editorial-plan";
import { failOperation } from "./operations";
import { NEW_CONTENT, computePlanSlotsDetailed, localDateInZone, nextLocalDate, type PlanSlot, type PlanSlotRequest } from "./plan-slots";
import { getSitePlanningSettings } from "./planning-settings";

const prisma = getPrismaClient();

export const MONTH_HORIZON_DAYS = 30;
const MAX_FAILED_RUNS_PER_DAY = 3;
const RETRY_AFTER_MS = 60 * 60_000;
/** A run reports progress after every wave; this long without one means its process died. */
const STALE_RUN_MS = 30 * 60_000;
const PLAN_OPERATIONS = ["editorial_plan_generation", "editorial_plan_fill", "editorial_plan_item_regeneration", "editorial_plan_extension"];
const OPEN_ITEM = { notIn: ["rejected" as const, "canceled" as const] };

type PlanningCadence = { timezone: string; articlesPerDay: number; weekdays: number[]; publishTimes: string[] };
type MonthPolicy = Pick<AutomationPolicy, "articlesPerDay" | "maxArticlesPerDay" | "activeDaysOfWeek" | "publishingWindows" | "timezone">;

/**
 * The slots automation can use in the horizon and the ones nothing covers yet. The cadence is the site's
 * planning settings, capped by the automation policy (volume, active days and website windows).
 */
export function monthSlots(
  policy: MonthPolicy,
  settings: PlanningCadence,
  planned: Date[],
  now: Date,
): { request: PlanSlotRequest; slots: PlanSlot[]; missing: PlanSlot[]; outsideWindows: number } {
  const { timezone } = settings;
  const dateFrom = localDateInZone(now, timezone);
  let dateTo = dateFrom;
  for (let day = 1; day < MONTH_HORIZON_DAYS; day += 1) dateTo = nextLocalDate(dateTo);
  const request: PlanSlotRequest = {
    dateFrom,
    dateTo,
    timezone,
    articlesPerDay: Math.max(0, Math.min(settings.articlesPerDay, policy.articlesPerDay, policy.maxArticlesPerDay ?? policy.articlesPerDay)),
    weekdays: settings.weekdays,
    publishTimes: settings.publishTimes,
    now,
  };
  const computed = computePlanSlotsDetailed(request);
  const all = [...computed.skippedPast, ...computed.slots];
  const windows = readPublishingWindows(policy as AutomationPolicy).filter((window) => window.channel === "website");
  const inWindow = (at: Date) => {
    if (!windows.length) return true;
    const parts = new Intl.DateTimeFormat("en-GB", { timeZone: policy.timezone || timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(at);
    const weekday = new Date(localDateInZone(at, policy.timezone || timezone)).getUTCDay();
    return windows.some((window) => window.days.map(Number).includes(weekday) && window.from <= parts && parts <= window.to);
  };
  const active = all.filter((slot) => isDayActive(policy as AutomationPolicy, slot.scheduledFor));
  const usable = active.filter((slot) => inWindow(slot.scheduledFor));

  const byDay = new Map<string, number[]>();
  for (const at of planned) {
    const day = localDateInZone(at, timezone);
    byDay.set(day, [...(byDay.get(day) ?? []), at.getTime()]);
  }
  const missingTimes = new Set<number>();
  for (const day of new Set(usable.map((slot) => slot.localDate))) {
    const times = byDay.get(day) ?? [];
    const free = usable.filter((slot) => slot.localDate === day && !times.includes(slot.scheduledFor.getTime()));
    const exact = usable.filter((slot) => slot.localDate === day).length - free.length;
    // Items at another hour of the same day (moved in the calendar) also use up the day's quota.
    for (const slot of free.slice(Math.max(0, times.length - exact))) missingTimes.add(slot.scheduledFor.getTime());
  }
  const future = new Set(computed.slots.map((slot) => slot.scheduledFor.getTime()));
  const slots = usable.filter((slot) => future.has(slot.scheduledFor.getTime())) as PlanSlot[];
  return { request, slots, missing: slots.filter((slot) => missingTimes.has(slot.scheduledFor.getTime())), outsideWindows: active.length - usable.length };
}

async function loadMonth(policy: AutomationPolicy & { siteId: string }, now: Date) {
  const settings = await getSitePlanningSettings(policy.tenantId, policy.siteId);
  const dayStart = new Date(now.getTime() - 24 * 3_600_000);
  const items = await prisma.editorialPlanItem.findMany({
    where: { tenantId: policy.tenantId, siteId: policy.siteId, channel: "website", status: OPEN_ITEM, scheduledFor: { gte: dayStart }, ...NEW_CONTENT },
    select: { scheduledFor: true },
  });
  return { settings, ...monthSlots(policy, settings, items.map((item) => item.scheduledFor!), now) };
}

/** Releases plans left in `generating` by a process that died mid-run, so they can be filled again. */
async function releaseStaleRuns(tenantId: string, siteId: string, now: Date): Promise<void> {
  const stuck = await prisma.editorialPlan.findMany({
    where: { tenantId, siteId, status: "generating", updatedAt: { lt: new Date(now.getTime() - STALE_RUN_MS) } },
    select: { id: true, _count: { select: { items: true } } },
  });
  for (const plan of stuck) {
    const operation = await prisma.operation.findFirst({ where: { tenantId, entityId: plan.id, type: { in: PLAN_OPERATIONS } }, orderBy: { createdAt: "desc" } });
    if (operation && operation.updatedAt.getTime() > now.getTime() - STALE_RUN_MS) continue;
    await prisma.editorialPlan.updateMany({ where: { id: plan.id, status: "generating" }, data: { status: plan._count.items ? "partial" : "failed", error: "plan_run_interrupted" } });
    if (operation && ["queued", "running", "retrying"].includes(operation.status)) {
      await failOperation(operation.id, { errorCode: "plan_run_interrupted", errorSummary: "plan_run_interrupted", retryable: true });
    }
  }
}

/** The planner needs the site's profile (or crawled pages to build it); without them every run would fail. */
async function hasSiteIntelligence(tenantId: string, siteId: string): Promise<boolean> {
  const [profile, page] = await Promise.all([
    prisma.siteIntelligenceProfile.findUnique({ where: { siteId }, select: { siteId: true } }),
    prisma.siteIndexedPage.findFirst({ where: { tenantId, siteId, crawlState: { in: ["extracted", "stale"] } }, select: { id: true } }),
  ]);
  return Boolean(profile || page);
}

export type EnsureMonthResult = { started: boolean; reason: "complete" | "busy" | "retry_later" | "budget" | "no_intelligence" | "not_autopilot" | "started"; planId?: string; operationId?: string; slots?: number };

/**
 * Starts (at most) one run that fills the earliest month with free slots. `manual` is a person pressing the
 * button: it skips the retry pause, never the budget or the one-run-at-a-time guard.
 */
export async function ensureMonthlyPlan(
  policy: AutomationPolicy,
  options: { now?: Date; manual?: boolean; userId?: string | null; enqueue?: typeof enqueuePlanSlots } = {},
): Promise<EnsureMonthResult> {
  if (!policy.siteId) return { started: false, reason: "complete" };
  if (!options.manual && (policy.mode !== "autopilot" || !policy.enabled || policy.state !== "active")) return { started: false, reason: "not_autopilot" };
  const now = options.now ?? new Date();
  const { tenantId, siteId } = policy;
  await releaseStaleRuns(tenantId, siteId, now);
  if (await prisma.editorialPlan.findFirst({ where: { tenantId, siteId, status: "generating" }, select: { id: true } })) return { started: false, reason: "busy" };
  const month = await loadMonth({ ...policy, siteId }, now);
  if (!month.missing.length) return { started: false, reason: "complete" };

  if (!(await hasSiteIntelligence(tenantId, siteId))) return { started: false, reason: "no_intelligence" };
  if (!options.manual) {
    const failed = await prisma.operation.findMany({
      where: { tenantId, siteId, type: { in: PLAN_OPERATIONS }, status: { in: ["failed", "partial"] }, createdAt: { gte: new Date(now.getTime() - 24 * 3_600_000) }, metadata: { path: ["trigger"], equals: "autopilot" } },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });
    if (failed.length >= MAX_FAILED_RUNS_PER_DAY || (failed[0] && failed[0].createdAt.getTime() > now.getTime() - RETRY_AFTER_MS)) return { started: false, reason: "retry_later" };
  }
  const budget = await evaluateAiSpend({ tenantId, siteId, contentType: "editorial_plan", kind: "editorial_plan" });
  if (!budget.allowed) return { started: false, reason: "budget" };

  // One plan per calendar month; the next month is filled by a later tick, once this run has registered its keywords.
  const monthKey = month.missing[0].localDate.slice(0, 7);
  const slots = month.missing.filter((slot) => slot.localDate.startsWith(monthKey)).map((slot, index) => ({ ...slot, index }));
  const site = await prisma.site.findUniqueOrThrow({ where: { id: siteId }, select: { locale: true } });
  const topics = (value: unknown) => (Array.isArray(value) ? value.map(String) : []);
  const { now: _now, ...cadence } = month.request;
  const enqueue = options.enqueue ?? enqueuePlanSlots;
  // The automation tick runs outside any request: without this the run would ignore the workspace's chosen model.
  const accepted = await withAiTenant(tenantId, () => enqueue({
    tenantId,
    siteId,
    monthKey,
    slots,
    timezone: month.settings.timezone,
    cadence,
    language: site.locale.slice(0, 2),
    priorityTopics: topics(policy.priorityTopics),
    excludedTopics: topics(policy.excludedCategories),
    userId: options.userId ?? null,
    trigger: options.manual ? "manual" : "autopilot",
  }));
  structuredEvent("autopilot.month_plan.started", { tenantId, siteId, planId: accepted.planId, monthKey, slots: slots.length, manual: options.manual === true });
  return { started: true, reason: "started", planId: accepted.planId, operationId: accepted.operationId, slots: slots.length };
}

/** The month the Studio shows: what is planned, which plan and research it came from, and what is still empty. */
export async function getMonthPlan(tenantId: string, siteId: string, now = new Date()) {
  const policy = await getOrCreatePolicy(tenantId, siteId);
  const month = await loadMonth({ ...policy, siteId }, now);
  const until = new Date(now.getTime() + (MONTH_HORIZON_DAYS + 1) * 86_400_000);
  const [items, generating, lastRun, budget, intelligence] = await Promise.all([
    prisma.editorialPlanItem.findMany({
      where: { tenantId, siteId, channel: "website", status: OPEN_ITEM, scheduledFor: { gte: now, lte: until } },
      orderBy: { scheduledFor: "asc" },
      select: {
        id: true, planId: true, title: true, primaryKeyword: true, searchVolume: true, keywordDifficulty: true, keywordMetricsSource: true, opportunityScore: true,
        status: true, scheduledFor: true, projectId: true, contentType: true, metadata: true, plan: { select: { name: true } },
      },
    }),
    prisma.editorialPlan.findFirst({ where: { tenantId, siteId, status: "generating" }, orderBy: { updatedAt: "desc" }, select: { id: true, name: true } }),
    prisma.operation.findFirst({ where: { tenantId, siteId, type: { in: PLAN_OPERATIONS } }, orderBy: { createdAt: "desc" } }),
    evaluateAiSpend({ tenantId, siteId, contentType: "editorial_plan", kind: "editorial_plan" }),
    hasSiteIntelligence(tenantId, siteId),
  ]);
  const plans = await prisma.editorialPlan.findMany({ where: { tenantId, id: { in: [...new Set(items.map((item) => item.planId))] } }, select: { id: true, name: true, status: true, generatedOutput: true } });
  return {
    horizonDays: MONTH_HORIZON_DAYS,
    timezone: month.settings.timezone,
    dateFrom: month.request.dateFrom,
    dateTo: month.request.dateTo,
    mode: policy.mode,
    automationActive: policy.enabled && policy.state === "active",
    leadMinutes: PLAN_LEAD_TIME_MINUTES,
    metricsProvider: await seoCapabilityAvailable("keyword_metrics"),
    articlesPerDay: month.request.articlesPerDay,
    expectedSlots: month.slots.length,
    missing: month.missing.map((slot) => ({ localDate: slot.localDate, localTime: slot.localTime })),
    outsideWindows: month.outsideWindows,
    siteIntelligence: intelligence,
    budgetBlocked: budget.allowed ? null : budget.reason,
    generating: generating
      ? { planId: generating.id, planName: generating.name, completed: lastRun?.entityId === generating.id ? lastRun.completedSteps : 0, total: lastRun?.entityId === generating.id ? lastRun.totalSteps : 0 }
      : null,
    lastRun: lastRun ? { status: lastRun.status, at: lastRun.createdAt.toISOString(), error: lastRun.errorSummary } : null,
    items: items.map(({ metadata, plan, ...item }) => ({ ...item, planName: plan.name, source: readPlanItemSelection(metadata)?.source ?? null })),
    plans: plans.map((plan) => {
      const output = (plan.generatedOutput ?? {}) as { keywordResearch?: PlanResearch[]; shortage?: PlanShortage | null };
      const research = output.keywordResearch ?? [];
      return { id: plan.id, name: plan.name, status: plan.status, research: research[research.length - 1] ?? null, shortage: output.shortage ?? null };
    }),
  };
}
