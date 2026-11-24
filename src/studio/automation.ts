import { Prisma } from "@prisma/client";
import type { AutomationPolicy, PublicationChannel } from "@prisma/client";
import { getPrismaClient } from "../infrastructure/db/prisma";
import { getNumberEnv } from "../shared/utils/env";
import { writeAudit } from "./audit";
import {
  buildModePayload,
  clampRepairAttempts,
  DEFAULT_AUTOMATION_MODE,
  isAutomationMode,
  MODE_FLAGS,
  normalizeAutomationMode,
  type AutomationMode,
} from "./automation-mode";
import { notifyOperators } from "./notifications";
import { readGateConfig } from "./quality-gate";
import { seoCapabilityAvailable } from "./seo-manager";
import { PLAN_LEAD_TIME_MINUTES } from "./automation-mode";
import { localDateInZone, nextLocalDate, zonedTimeToUtc } from "./plan-slots";

const prisma = getPrismaClient();

export const AUTOMATION_DEFAULTS = {
  timezone: "Europe/Madrid",
  articlesPerDay: 3,
  maxArticlesPerDay: 6,
  xPostsPerDay: 5,
  instagramPostsPerDay: 2,
  minimumMinutesBetweenArticles: 120,
  minimumStoryScore: 0.5,
  maximumQueueSize: 20,
  articlesPerHour: 2,
  socialPostsPerHour: 6,
  maximumDailySocial: 12,
  socialTimingMinutesX: 5,
  socialTimingMinutesInstagram: 60,
  imageRequired: true,
  socialRequired: false,
  ...MODE_FLAGS[DEFAULT_AUTOMATION_MODE],
  mode: DEFAULT_AUTOMATION_MODE,
  maxRepairAttempts: 4,
} as const;

/** Maximum consecutive website publication failures before the circuit opens. */
export const CIRCUIT_BREAKER_THRESHOLD = 3;

export type AutomationModeValue = AutomationMode;

// ────────────────────────────────────────────────────────────── Policy CRUD

export async function getOrCreatePolicy(tenantId: string, siteId: string | null) {
  const existing = await prisma.automationPolicy.findFirst({
    where: { tenantId, siteId },
  });
  if (existing) {
    return existing;
  }
  return prisma.$transaction(async (db) => {
    // The workspace-wide policy has a nullable site id; a unique index alone cannot serialize its creation.
    await db.$queryRaw`SELECT id FROM tenants WHERE id = ${tenantId}::uuid FOR NO KEY UPDATE`;
    const initialized = await db.automationPolicy.findFirst({ where: { tenantId, siteId } });
    if (initialized) return initialized;
    return db.automationPolicy.create({
      data: {
        tenantId,
        siteId,
        enabled: AUTOMATION_DEFAULTS.enabled,
        state: "active",
        timezone: AUTOMATION_DEFAULTS.timezone,
        articlesPerDay: AUTOMATION_DEFAULTS.articlesPerDay,
        maxArticlesPerDay: AUTOMATION_DEFAULTS.maxArticlesPerDay,
        xPostsPerDay: AUTOMATION_DEFAULTS.xPostsPerDay,
        instagramPostsPerDay: AUTOMATION_DEFAULTS.instagramPostsPerDay,
        minimumMinutesBetweenArticles: AUTOMATION_DEFAULTS.minimumMinutesBetweenArticles,
        minimumStoryScore: AUTOMATION_DEFAULTS.minimumStoryScore,
        maximumQueueSize: AUTOMATION_DEFAULTS.maximumQueueSize,
        articlesPerHour: AUTOMATION_DEFAULTS.articlesPerHour,
        socialPostsPerHour: AUTOMATION_DEFAULTS.socialPostsPerHour,
        maximumDailySocial: AUTOMATION_DEFAULTS.maximumDailySocial,
        socialTimingMinutesX: AUTOMATION_DEFAULTS.socialTimingMinutesX,
        socialTimingMinutesInstagram: AUTOMATION_DEFAULTS.socialTimingMinutesInstagram,
        imageRequired: AUTOMATION_DEFAULTS.imageRequired,
        socialRequired: AUTOMATION_DEFAULTS.socialRequired,
        autoGenerate: AUTOMATION_DEFAULTS.autoGenerate,
        autoApprove: AUTOMATION_DEFAULTS.autoApprove,
        autoSchedule: AUTOMATION_DEFAULTS.autoSchedule,
        autoPublish: AUTOMATION_DEFAULTS.autoPublish,
        mode: AUTOMATION_DEFAULTS.mode,
        autoRepair: AUTOMATION_DEFAULTS.autoRepair,
        maxRepairAttempts: AUTOMATION_DEFAULTS.maxRepairAttempts,
        activeDaysOfWeek: [0, 1, 2, 3, 4, 5, 6] as unknown as Prisma.InputJsonValue,
        publishingWindows: [
          { channel: "website", days: [0, 1, 2, 3, 4, 5, 6], from: "08:00", to: "20:00" },
          { channel: "x", days: [0, 1, 2, 3, 4, 5, 6], from: "08:00", to: "22:00" },
          { channel: "instagram", days: [0, 1, 2, 3, 4, 5, 6], from: "09:00", to: "21:00" },
        ] as unknown as Prisma.InputJsonValue,
        categories: Prisma.JsonNull,
        excludedCategories: Prisma.JsonNull,
        priorityTopics: Prisma.JsonNull,
        sourceSelectionRules: Prisma.JsonNull,
      },
    });
  });
}

export type UpdatePolicyInput = {
  enabled?: boolean;
  state?: "active" | "paused" | "degraded";
  pausedReason?: string | null;
  timezone?: string;
  articlesPerDay?: number;
  maxArticlesPerDay?: number;
  xPostsPerDay?: number;
  instagramPostsPerDay?: number;
  minimumMinutesBetweenArticles?: number;
  activeDaysOfWeek?: number[];
  publishingWindows?: Array<{ channel: string; days: number[]; from: string; to: string }>;
  autoGenerate?: boolean;
  autoApprove?: boolean;
  autoSchedule?: boolean;
  autoPublish?: boolean;
  autoRepair?: boolean;
  maxRepairAttempts?: number;
  mode?: AutomationModeValue;
  autonomousQaThresholds?: Record<string, unknown> | null;
  sourceRequirements?: Record<string, unknown> | null;
  minimumStoryScore?: number;
  categories?: string[] | null;
  excludedCategories?: string[] | null;
  priorityTopics?: string[] | null;
  imageRequired?: boolean;
  socialRequired?: boolean;
  maximumQueueSize?: number;
  articlesPerHour?: number;
  socialPostsPerHour?: number;
  maximumDailySocial?: number;
  socialTimingMinutesX?: number;
  socialTimingMinutesInstagram?: number;
  sourceSelectionRules?: Record<string, unknown> | null;
};

export function sanitizePolicyInput(input: UpdatePolicyInput): UpdatePolicyInput {
  const sanitized: UpdatePolicyInput = { ...input };
  const hardMax = getNumberEnv("AUTOMATION_HARD_MAX_ARTICLES_DAY", 20);
  if (sanitized.articlesPerDay !== undefined) {
    sanitized.articlesPerDay = Math.max(0, Math.min(hardMax, Math.round(sanitized.articlesPerDay)));
  }
  if (sanitized.maxArticlesPerDay !== undefined) {
    sanitized.maxArticlesPerDay = Math.max(0, Math.min(hardMax, Math.round(sanitized.maxArticlesPerDay)));
  }
  if (sanitized.xPostsPerDay !== undefined) {
    sanitized.xPostsPerDay = Math.max(0, Math.min(50, Math.round(sanitized.xPostsPerDay)));
  }
  if (sanitized.instagramPostsPerDay !== undefined) {
    sanitized.instagramPostsPerDay = Math.max(0, Math.min(20, Math.round(sanitized.instagramPostsPerDay)));
  }
  if (sanitized.minimumMinutesBetweenArticles !== undefined) {
    sanitized.minimumMinutesBetweenArticles = Math.max(15, sanitized.minimumMinutesBetweenArticles);
  }
  if (sanitized.minimumStoryScore !== undefined) {
    sanitized.minimumStoryScore = Math.max(0, Math.min(1, sanitized.minimumStoryScore));
  }
  if (sanitized.maxRepairAttempts !== undefined) {
    sanitized.maxRepairAttempts = clampRepairAttempts(sanitized.maxRepairAttempts);
  }
  return sanitized;
}

/**
 * Resolve the effective mode for an update. When `mode` is present it wins
 * and the flags are derived atomically from it (no contradictory partial
 * states can be persisted); otherwise the legacy flag path is preserved.
 */
export function resolveModeUpdate(input: UpdatePolicyInput): UpdatePolicyInput {
  if (input.mode === undefined || !isAutomationMode(input.mode)) {
    return input;
  }
  const payload = buildModePayload(input.mode as AutomationMode, {
    maxRepairAttempts: input.maxRepairAttempts,
    autonomousQaThresholds: input.autonomousQaThresholds,
    sourceRequirements: input.sourceRequirements,
  });
  return {
    ...input,
    enabled: payload.flags.enabled,
    autoGenerate: payload.flags.autoGenerate,
    autoApprove: payload.flags.autoApprove,
    autoSchedule: payload.flags.autoSchedule,
    autoPublish: payload.flags.autoPublish,
    autoRepair: payload.flags.autoRepair,
    ...(payload.autopilot ? { maxRepairAttempts: payload.autopilot.maxRepairAttempts } : {}),
  };
}

export function assertSafeAutomationPolicy(input: UpdatePolicyInput): void {
  if (input.mode !== undefined && isAutomationMode(input.mode)) {
    return;
  }
  if (input.autoPublish && (!input.autoGenerate || !input.autoApprove || !input.autoSchedule)) {
    throw new Error("auto_publish_requires_generation_approval_and_schedule");
  }
}

export async function updatePolicy(
  tenantId: string,
  siteId: string | null,
  input: UpdatePolicyInput,
  actorUserId?: string | null,
): Promise<AutomationPolicy> {
  if (input.mode !== undefined && !isAutomationMode(input.mode)) throw new Error("invalid_automation_mode");
  if (input.timezone !== undefined) {
    if (typeof input.timezone !== "string" || !input.timezone.trim()) throw new Error("invalid_automation_timezone");
    try {
      new Intl.DateTimeFormat("en", { timeZone: input.timezone });
    } catch {
      throw new Error("invalid_automation_timezone");
    }
  }
  const validDays = (days: unknown): days is number[] => Array.isArray(days) &&
    days.every((day) => Number.isInteger(day) && day >= 0 && day <= 6);
  if (input.activeDaysOfWeek !== undefined && !validDays(input.activeDaysOfWeek)) throw new Error("invalid_automation_days");
  if (input.publishingWindows !== undefined && (!Array.isArray(input.publishingWindows) ||
    input.publishingWindows.some((window) => {
      if (!window || !["website", "x", "instagram", "facebook"].includes(window.channel) || !validDays(window.days)) return true;
      const from = parseTimeMinutes(window.from);
      const to = parseTimeMinutes(window.to);
      return from === null || to === null || from >= to;
    }))) throw new Error("invalid_automation_window");
  const resolved = resolveModeUpdate(input);
  const sanitized = sanitizePolicyInput(resolved);
  assertSafeAutomationPolicy(sanitized);
  const policy = await getOrCreatePolicy(tenantId, siteId);
  const requiresClosedCircuit = Boolean(sanitized.autoPublish || sanitized.state === "active");
  if (requiresClosedCircuit && policy.circuitOpen) throw new Error("publication_circuit_open");
  const previous = {
    articlesPerDay: policy.articlesPerDay,
    xPostsPerDay: policy.xPostsPerDay,
    instagramPostsPerDay: policy.instagramPostsPerDay,
    autoGenerate: policy.autoGenerate,
    autoPublish: policy.autoPublish,
    enabled: policy.enabled,
    mode: policy.mode,
    autoRepair: policy.autoRepair,
  };

  const updated = await prisma.automationPolicy.update({
    where: { id: policy.id, ...(requiresClosedCircuit ? { circuitOpen: false } : {}) },
    data: {
      enabled: sanitized.enabled,
      state: sanitized.state,
      pausedReason: sanitized.pausedReason === undefined ? undefined : sanitized.pausedReason,
      timezone: sanitized.timezone,
      articlesPerDay: sanitized.articlesPerDay,
      maxArticlesPerDay: sanitized.maxArticlesPerDay,
      xPostsPerDay: sanitized.xPostsPerDay,
      instagramPostsPerDay: sanitized.instagramPostsPerDay,
      minimumMinutesBetweenArticles: sanitized.minimumMinutesBetweenArticles,
      activeDaysOfWeek: sanitized.activeDaysOfWeek === undefined ? undefined : (sanitized.activeDaysOfWeek as unknown as Prisma.InputJsonValue),
      publishingWindows: sanitized.publishingWindows === undefined ? undefined : (sanitized.publishingWindows as unknown as Prisma.InputJsonValue),
      autoGenerate: sanitized.autoGenerate,
      autoApprove: sanitized.autoApprove,
      autoSchedule: sanitized.autoSchedule,
      autoPublish: sanitized.autoPublish,
      autoRepair: sanitized.autoRepair,
      maxRepairAttempts: sanitized.maxRepairAttempts,
      mode: sanitized.mode,
      autonomousQaThresholds: sanitized.autonomousQaThresholds === undefined ? undefined : sanitized.autonomousQaThresholds ? (sanitized.autonomousQaThresholds as Prisma.InputJsonObject) : Prisma.JsonNull,
      sourceRequirements: sanitized.sourceRequirements === undefined ? undefined : sanitized.sourceRequirements ? (sanitized.sourceRequirements as Prisma.InputJsonObject) : Prisma.JsonNull,
      minimumStoryScore: sanitized.minimumStoryScore,
      categories: sanitized.categories === undefined ? undefined : sanitized.categories ? (sanitized.categories as Prisma.InputJsonValue) : Prisma.JsonNull,
      excludedCategories: sanitized.excludedCategories === undefined ? undefined : sanitized.excludedCategories ? (sanitized.excludedCategories as Prisma.InputJsonValue) : Prisma.JsonNull,
      priorityTopics: sanitized.priorityTopics === undefined ? undefined : sanitized.priorityTopics ? (sanitized.priorityTopics as Prisma.InputJsonValue) : Prisma.JsonNull,
      imageRequired: sanitized.imageRequired,
      socialRequired: sanitized.socialRequired,
      maximumQueueSize: sanitized.maximumQueueSize,
      articlesPerHour: sanitized.articlesPerHour,
      socialPostsPerHour: sanitized.socialPostsPerHour,
      maximumDailySocial: sanitized.maximumDailySocial,
      socialTimingMinutesX: sanitized.socialTimingMinutesX,
      socialTimingMinutesInstagram: sanitized.socialTimingMinutesInstagram,
      sourceSelectionRules: sanitized.sourceSelectionRules === undefined ? undefined : sanitized.sourceSelectionRules ? (sanitized.sourceSelectionRules as Prisma.InputJsonObject) : Prisma.JsonNull,
      updatedByStudioUserId: actorUserId ?? null,
    },
  }).catch((error: unknown) => {
    if (requiresClosedCircuit && error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      throw new Error("publication_circuit_open");
    }
    throw error;
  });

  await writeAudit({
    tenantId,
    action: "automation.policy_updated",
    entityType: "automation_policy",
    entityId: policy.id,
    actorType: actorUserId ? "user" : "system",
    actorUserId,
    metadata: { previous, next: sanitized },
  });

  return updated;
}

export async function pauseAutomation(tenantId: string, siteId: string | null, reason: string, actorUserId?: string | null) {
  const policy = await updatePolicy(tenantId, siteId, { state: "paused", pausedReason: reason }, actorUserId);
  await writeAudit({
    tenantId,
    action: "automation.paused",
    entityType: "automation_policy",
    entityId: policy.id,
    actorType: actorUserId ? "user" : "system",
    actorUserId,
    metadata: { reason },
  });
  return policy;
}

export async function resumeAutomation(tenantId: string, siteId: string | null, actorUserId?: string | null) {
  const current = await getOrCreatePolicy(tenantId, siteId);
  const mode = current.mode === "autopilot" && !current.autoPublish ? "autopilot" : undefined;
  const policy = await updatePolicy(tenantId, siteId, {
    state: "active", pausedReason: null,
    ...(mode ? { mode, maxRepairAttempts: current.maxRepairAttempts } : {}),
  }, actorUserId);
  await writeAudit({
    tenantId,
    action: "automation.resumed",
    entityType: "automation_policy",
    entityId: policy.id,
    actorType: actorUserId ? "user" : "system",
    actorUserId,
  });
  return policy;
}

// ────────────────────────────────────────────────────────────── Windows & slots

export type PublishingWindow = {
  channel: string;
  days: number[];
  from: string;
  to: string;
};

export function readPublishingWindows(policy: AutomationPolicy): PublishingWindow[] {
  const value = policy.publishingWindows;
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => (entry && typeof entry === "object" ? entry as unknown as PublishingWindow : null))
    .filter((entry): entry is PublishingWindow => Boolean(entry && entry.from && entry.to && Array.isArray(entry.days)));
}

export function isDayActive(policy: AutomationPolicy, date: Date): boolean {
  const days = policy.activeDaysOfWeek;
  const weekDay = new Date(localDateInZone(date, policyTimezone(policy))).getUTCDay();
  if (Array.isArray(days)) {
    return days.map(Number).includes(weekDay);
  }
  return true;
}

export type EditorialSlot = {
  channel: PublicationChannel;
  at: Date;
  source: "policy" | "social_offset";
};

export function generateEditorialSlots(policy: AutomationPolicy, dayStart: Date): EditorialSlot[] {
  if (!isDayActive(policy, dayStart)) return [];
  const timezone = policyTimezone(policy);
  const localDate = localDateInZone(dayStart, timezone);
  const weekday = new Date(localDate).getUTCDay();
  const windows = readPublishingWindows(policy).filter((window) => window.days.map(Number).includes(weekday));
  const minutesIn = (channel: string) => {
    const minutes = new Set<number>();
    for (const window of windows.filter((entry) => entry.channel === channel)) {
      const from = parseTimeMinutes(window.from);
      const to = parseTimeMinutes(window.to);
      if (from === null || to === null || to <= from) continue;
      for (let minute = from; minute <= to; minute += 1) minutes.add(minute);
    }
    return minutes;
  };
  const website = [...minutesIn("website")].sort((a, b) => a - b);
  const count = Math.max(0, Math.min(website.length, policy.articlesPerDay, policy.maxArticlesPerDay ?? policy.articlesPerDay));
  const social = [
    { channel: "x" as const, limit: policy.xPostsPerDay, delay: policy.socialTimingMinutesX, minutes: minutesIn("x"), used: 0 },
    { channel: "instagram" as const, limit: policy.instagramPostsPerDay, delay: policy.socialTimingMinutesInstagram, minutes: minutesIn("instagram"), used: 0 },
  ];
  const socialLimit = policy.maximumDailySocial ?? Infinity;
  let socialUsed = 0;
  const atMinute = (minute: number) => zonedTimeToUtc(localDate, `${Math.floor(minute / 60)}:${minute % 60}`, timezone);
  const slots: EditorialSlot[] = [];

  for (let index = 0; index < count; index += 1) {
    const fraction = count === 1 ? 0.5 : index / (count - 1);
    const minute = website[Math.round((website.length - 1) * fraction)];
    slots.push({ channel: "website", at: atMinute(minute), source: "policy" });
    for (const channel of social) {
      const socialMinute = minute + Math.max(0, channel.delay);
      if (channel.used >= channel.limit || socialUsed >= socialLimit || !channel.minutes.has(socialMinute)) continue;
      slots.push({ channel: channel.channel, at: atMinute(socialMinute), source: "social_offset" });
      channel.used += 1;
      socialUsed += 1;
    }
  }

  return slots.sort((a, b) => a.at.getTime() - b.at.getTime());
}

function parseTimeMinutes(value: string): number | null {
  if (typeof value !== "string" || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) return null;
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

export function startOfLocalDay(policy: AutomationPolicy, now: Date = new Date()): Date {
  const timezone = policyTimezone(policy);
  return zonedTimeToUtc(localDateInZone(now, timezone), "00:00", timezone);
}

export function nextPolicyDay(policy: AutomationPolicy, day: Date): Date {
  const timezone = policyTimezone(policy);
  return zonedTimeToUtc(nextLocalDate(localDateInZone(day, timezone)), "00:00", timezone);
}

function policyTimezone(policy: AutomationPolicy): string {
  const timezone = policy.timezone || "UTC";
  try {
    new Intl.DateTimeFormat("en", { timeZone: timezone });
    return timezone;
  } catch {
    return "UTC";
  }
}

// ────────────────────────────────────────────────────────────── Limits

export async function countChannelPublicationsToday(
  tenantId: string,
  channel: string,
  dayStart: Date,
  dayEnd: Date,
  siteId: string | null,
): Promise<number> {
  return prisma.publication.count({
    where: {
      tenantId,
      ...(siteId ? { siteId } : {}),
      channel: channel as PublicationChannel,
      status: { in: ["draft", "ready", "scheduled", "queued", "publishing", "published", "failed"] },
      OR: [
        { scheduledFor: { gte: dayStart, lt: dayEnd } },
        { publishedAt: { gte: dayStart, lt: dayEnd } },
      ],
    },
  });
}

export type AutomationStatus = {
  policyId: string;
  enabled: boolean;
  state: string;
  pausedReason: string | null;
  timezone: string;
  mode: string;
  autoRepair: boolean;
  maxRepairAttempts: number;
  circuit: {
    open: boolean;
    consecutiveFailures: number;
    openedAt: string | null;
  };
  today: {
    date: string;
    articlesPlanned: number;
    articlesPublished: number;
    xPlanned: number;
    instagramPlanned: number;
  };
  limits: {
    articlesPerDay: number;
    xPostsPerDay: number;
    instagramPostsPerDay: number;
    maximumDailySocial: number;
    maximumQueueSize: number;
  };
  nextSlots: Array<{ channel: string; at: string }>;
  /** Why the pipeline is (not) producing: what is waiting for the automation and what it already left for a human. */
  pipeline: {
    /** Website plan items still to be written whose slot is inside the lead window (they start on the next tick). */
    planDueNow: number;
    /** Website plan items still to be written with a later slot. */
    planUpcoming: number;
    /** Articles written by the plan that the quality gate did not release: a person has to review them. */
    awaitingReview: number;
    activeSources: number;
    /** Source stories (last 72 h) above the site's minimum score that are not yet an article. */
    candidateStories: number;
    minQaScore: number;
    leadMinutes: number;
    /** The keyword plan (main flow): the next website plan items with their primary keyword and measured volume. */
    keywordPlan: { upcoming: Array<{ id: string; keyword: string; scheduledFor: string | null; status: string; searchVolume: number | null }>; withVolume: number; metricsProvider: boolean };
  };
  warnings: string[];
};

export async function getAutomationStatus(tenantId: string, siteId: string | null, now = new Date()): Promise<AutomationStatus> {
  const policy = await getOrCreatePolicy(tenantId, siteId);
  const dayStart = startOfLocalDay(policy, now);
  const dayEnd = nextPolicyDay(policy, dayStart);
  const siteScope = siteId ? { siteId } : {};

  const [articlesPlanned, articlesPublished, xPlanned, igPlanned, pendingQueue] = await Promise.all([
    countChannelPublicationsToday(tenantId, "website", dayStart, dayEnd, siteId),
    prisma.publication.count({
      where: {
        tenantId,
        ...siteScope,
        channel: "website",
        status: "published",
        publishedAt: { gte: dayStart, lt: dayEnd },
      },
    }),
    countChannelPublicationsToday(tenantId, "x", dayStart, dayEnd, siteId),
    countChannelPublicationsToday(tenantId, "instagram", dayStart, dayEnd, siteId),
    prisma.publication.count({ where: { tenantId, ...siteScope, status: { in: ["draft", "ready", "scheduled"] } } }),
  ]);

  const planScope = { tenantId, ...siteScope, channel: "website" as const };
  const [planDueNow, planUpcoming, awaitingReview, activeSources, candidateStories] = await Promise.all([
    prisma.editorialPlanItem.count({ where: { ...planScope, status: { in: ["proposed", "approved"] }, projectId: null, scheduledFor: { lte: new Date(now.getTime() + PLAN_LEAD_TIME_MINUTES * 60_000) } } }),
    prisma.editorialPlanItem.count({ where: { ...planScope, status: { in: ["proposed", "approved"] }, projectId: null, scheduledFor: { gt: new Date(now.getTime() + PLAN_LEAD_TIME_MINUTES * 60_000) } } }),
    prisma.editorialPlanItem.count({ where: { ...planScope, status: "review_required" } }),
    prisma.contentSource.count({ where: { tenantId, ...siteScope, enabled: true, archivedAt: null } }),
    prisma.sourceItem.count({ where: { tenantId, processingStatus: "candidate", score: { gte: policy.minimumStoryScore }, discoveredAt: { gte: new Date(now.getTime() - 72 * 3_600_000) }, source: { ...siteScope, enabled: true, archivedAt: null }, projects: { none: {} } } }),
  ]);

  const upcomingItems = await prisma.editorialPlanItem.findMany({
    where: { ...planScope, status: { notIn: ["rejected", "canceled"] }, scheduledFor: { gte: now } },
    orderBy: { scheduledFor: "asc" },
    take: 6,
    select: { id: true, title: true, primaryKeyword: true, scheduledFor: true, status: true, searchVolume: true },
  });
  const withVolume = await prisma.editorialPlanItem.count({ where: { ...planScope, status: { notIn: ["rejected", "canceled"] }, scheduledFor: { gte: now }, searchVolume: { not: null } } });

  const warnings: string[] = [];
  if (articlesPlanned > policy.maxArticlesPerDay) {
    warnings.push(`articles planned (${articlesPlanned}) exceed max per day (${policy.maxArticlesPerDay})`);
  }
  if (pendingQueue > policy.maximumQueueSize) {
    warnings.push(`pending queue (${pendingQueue}) exceeds configured maximum (${policy.maximumQueueSize})`);
  }
  if (policy.circuitOpen) {
    warnings.push("website autopublishing is paused by the circuit breaker after consecutive publication failures");
  }

  const slots: EditorialSlot[] = [];
  const mode = normalizeAutomationMode(policy.mode, policy);
  if (policy.enabled && mode !== "manual" && policy.state === "active" && !policy.circuitOpen) {
    let day = dayStart;
    for (let offset = 0; offset < 8 && slots.length < 10; offset += 1) {
      slots.push(...generateEditorialSlots(policy, day).filter((slot) => slot.at > now));
      day = nextPolicyDay(policy, day);
    }
  }
  const nextSlots = slots.sort((a, b) => a.at.getTime() - b.at.getTime()).slice(0, 10)
    .map((slot) => ({ channel: slot.channel, at: slot.at.toISOString() }));

  return {
    policyId: policy.id,
    enabled: policy.enabled,
    state: policy.state,
    pausedReason: policy.pausedReason,
    timezone: policyTimezone(policy),
    mode,
    autoRepair: policy.autoRepair,
    maxRepairAttempts: policy.maxRepairAttempts,
    circuit: {
      open: policy.circuitOpen,
      consecutiveFailures: policy.consecutivePublishFailures,
      openedAt: policy.circuitOpenedAt?.toISOString() ?? null,
    },
    today: {
      date: dayStart.toISOString(),
      articlesPlanned,
      articlesPublished,
      xPlanned,
      instagramPlanned: igPlanned,
    },
    limits: {
      articlesPerDay: policy.articlesPerDay,
      xPostsPerDay: policy.xPostsPerDay,
      instagramPostsPerDay: policy.instagramPostsPerDay,
      maximumDailySocial: policy.maximumDailySocial,
      maximumQueueSize: policy.maximumQueueSize,
    },
    nextSlots,
    pipeline: { planDueNow, planUpcoming, awaitingReview, activeSources, candidateStories, minQaScore: readGateConfig(policy).overallQualityScore, leadMinutes: PLAN_LEAD_TIME_MINUTES, keywordPlan: { upcoming: upcomingItems.map((item) => ({ id: item.id, keyword: item.primaryKeyword ?? item.title, scheduledFor: item.scheduledFor?.toISOString() ?? null, status: item.status, searchVolume: item.searchVolume })), withVolume, metricsProvider: await seoCapabilityAvailable("keyword_metrics") } },
    warnings,
  };
}

// ────────────────────────────────────────────────────────────── Circuit breaker

/**
 * Record a terminal website publication failure for the site policy. When
 * consecutive failures reach the threshold, the circuit opens: website
 * autopublishing is paused for that site, the policy is marked degraded and
 * operators are notified. Successful publications reset the counter.
 */
export async function recordWebsitePublishFailure(tenantId: string, siteId: string | null): Promise<void> {
  const policy = await getOrCreatePolicy(tenantId, siteId);
  const failures = policy.consecutivePublishFailures + 1;
  const opensCircuit = failures >= CIRCUIT_BREAKER_THRESHOLD;

  const updated = await prisma.automationPolicy.update({
    where: { id: policy.id },
    data: {
      consecutivePublishFailures: failures,
      ...(opensCircuit
        ? {
            circuitOpen: true,
            circuitOpenedAt: new Date(),
            state: "degraded",
            pausedReason: "circuit_breaker_open",
            autoPublish: false,
          }
        : {}),
    },
  });

  if (opensCircuit) {
    await writeAudit({
      tenantId,
      action: "automation.circuit_opened",
      entityType: "automation_policy",
      entityId: policy.id,
      actorType: "system",
      metadata: { siteId, failures, threshold: CIRCUIT_BREAKER_THRESHOLD },
    });
    await notifyOperators([tenantId], {
      category: "operations",
      severity: "error",
      title: "Autopilot pausado por fallos consecutivos de publicación",
      message: `El sitio acumula ${failures} publicaciones web fallidas consecutivas; la autopublicación web se ha pausado y la política marcada como degradada. Los trabajos seguros ya en curso se preservan.`,
      entityType: "automation_policy",
      entityId: policy.id,
      actionUrl: "/studio/automation",
      dedupeKey: `autopilot.circuit.${policy.id}`,
      dedupeWindowMs: 12 * 3_600_000,
    });
  }

  void updated;
}

export async function resetWebsitePublishCircuit(tenantId: string, siteId: string | null): Promise<void> {
  const policy = await getOrCreatePolicy(tenantId, siteId);
  await prisma.automationPolicy.update({
    where: { id: policy.id },
    data: {
      consecutivePublishFailures: 0,
      circuitOpen: false,
      circuitOpenedAt: null,
    },
  });
}

export async function isWebsitePublishCircuitOpen(tenantId: string, siteId: string | null): Promise<boolean> {
  const policy = await getOrCreatePolicy(tenantId, siteId);
  return policy.circuitOpen;
}
