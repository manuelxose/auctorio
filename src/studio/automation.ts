import { Prisma } from "@prisma/client";
import type { AutomationPolicy, PublicationChannel } from "@prisma/client";
import { getPrismaClient } from "../infrastructure/db/prisma";
import { getNumberEnv } from "../shared/utils/env";
import { writeAudit } from "./audit";

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
  socialRequired: true,
  autoGenerate: false,
  autoApprove: false,
  autoSchedule: false,
  autoPublish: false,
} as const;

// ────────────────────────────────────────────────────────────── Policy CRUD

export async function getOrCreatePolicy(tenantId: string, siteId: string | null) {
  const existing = await prisma.automationPolicy.findFirst({
    where: { tenantId, siteId },
  });
  if (existing) {
    return existing;
  }
  return prisma.automationPolicy.create({
    data: {
      tenantId,
      siteId,
      enabled: false,
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
  return sanitized;
}

export async function updatePolicy(
  tenantId: string,
  siteId: string | null,
  input: UpdatePolicyInput,
  actorUserId?: string | null,
): Promise<AutomationPolicy> {
  const policy = await getOrCreatePolicy(tenantId, siteId);
  const sanitized = sanitizePolicyInput(input);
  const previous = {
    articlesPerDay: policy.articlesPerDay,
    xPostsPerDay: policy.xPostsPerDay,
    instagramPostsPerDay: policy.instagramPostsPerDay,
    autoGenerate: policy.autoGenerate,
    autoPublish: policy.autoPublish,
    enabled: policy.enabled,
  };

  const updated = await prisma.automationPolicy.update({
    where: { id: policy.id },
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
  const policy = await updatePolicy(tenantId, siteId, { state: "active", pausedReason: null }, actorUserId);
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

export function getChannelWindow(policy: AutomationPolicy, channel: string): PublishingWindow | null {
  return readPublishingWindows(policy).find((window) => window.channel === channel) ?? null;
}

export function isDayActive(policy: AutomationPolicy, date: Date): boolean {
  const days = policy.activeDaysOfWeek;
  const weekDay = date.getDay();
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
  const slots: EditorialSlot[] = [];
  const websiteWindow = getChannelWindow(policy, "website");
  if (!websiteWindow || !isDayActive(policy, dayStart)) {
    return slots;
  }

  const fromMinutes = parseTimeMinutes(websiteWindow.from);
  const toMinutes = parseTimeMinutes(websiteWindow.to);
  const spanMinutes = Math.max(60, toMinutes - fromMinutes);
  const count = Math.max(0, policy.articlesPerDay);

  for (let index = 0; index < count; index += 1) {
    const fraction = count === 1 ? 0.5 : index / (count - 1);
    const minutesOffset = Math.round(spanMinutes * fraction);
    const at = new Date(dayStart);
    at.setHours(0, 0, 0, 0);
    at.setMinutes(fromMinutes + minutesOffset);
    slots.push({ channel: "website", at, source: "policy" });

    if (policy.xPostsPerDay > 0) {
      const xAt = new Date(at.getTime() + Math.max(0, policy.socialTimingMinutesX) * 60_000);
      slots.push({ channel: "x", at: xAt, source: "social_offset" });
    }
    if (policy.instagramPostsPerDay > 0) {
      const igAt = new Date(at.getTime() + Math.max(0, policy.socialTimingMinutesInstagram) * 60_000);
      slots.push({ channel: "instagram", at: igAt, source: "social_offset" });
    }
  }

  return slots.sort((a, b) => a.at.getTime() - b.at.getTime());
}

function parseTimeMinutes(value: string): number {
  const [hours, minutes] = value.split(":").map(Number);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) {
    return 0;
  }
  return hours * 60 + minutes;
}

export function startOfLocalDay(policy: AutomationPolicy, now: Date = new Date()): Date {
  const local = toTimezone(now, policy.timezone);
  return new Date(local.getFullYear(), local.getMonth(), local.getDate(), 0, 0, 0, 0);
}

function toTimezone(date: Date, timezone: string): Date {
  try {
    return new Date(date.toLocaleString("en-US", { timeZone: timezone }));
  } catch {
    return date;
  }
}

// ────────────────────────────────────────────────────────────── Limits

export async function countChannelPublicationsToday(
  tenantId: string,
  channel: string,
  dayStart: Date,
): Promise<number> {
  return prisma.publication.count({
    where: {
      tenantId,
      channel: channel as PublicationChannel,
      status: { in: ["draft", "ready", "scheduled", "queued", "publishing", "published", "failed"] },
      OR: [
        { scheduledFor: { gte: dayStart, lt: new Date(dayStart.getTime() + 24 * 3_600_000) } },
        { publishedAt: { gte: dayStart, lt: new Date(dayStart.getTime() + 24 * 3_600_000) } },
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
  warnings: string[];
};

export async function getAutomationStatus(tenantId: string, siteId: string | null): Promise<AutomationStatus> {
  const policy = await getOrCreatePolicy(tenantId, siteId);
  const dayStart = startOfLocalDay(policy);
  const dayEnd = new Date(dayStart.getTime() + 24 * 3_600_000);

  const [articlesPlanned, articlesPublished, xPlanned, igPlanned, pendingQueue] = await Promise.all([
    countChannelPublicationsToday(tenantId, "website", dayStart),
    prisma.publication.count({
      where: {
        tenantId,
        channel: "website",
        status: "published",
        publishedAt: { gte: dayStart, lt: dayEnd },
      },
    }),
    countChannelPublicationsToday(tenantId, "x", dayStart),
    countChannelPublicationsToday(tenantId, "instagram", dayStart),
    prisma.publication.count({ where: { tenantId, status: { in: ["draft", "ready", "scheduled"] } } }),
  ]);

  const warnings: string[] = [];
  if (articlesPlanned > policy.maxArticlesPerDay) {
    warnings.push(`articles planned (${articlesPlanned}) exceed max per day (${policy.maxArticlesPerDay})`);
  }
  if (pendingQueue > policy.maximumQueueSize) {
    warnings.push(`pending queue (${pendingQueue}) exceeds configured maximum (${policy.maximumQueueSize})`);
  }

  const slots = generateEditorialSlots(policy, dayStart);
  const now = new Date();
  const nextSlots = slots
    .filter((slot) => slot.at > now)
    .slice(0, 10)
    .map((slot) => ({ channel: slot.channel, at: slot.at.toISOString() }));

  return {
    policyId: policy.id,
    enabled: policy.enabled,
    state: policy.state,
    pausedReason: policy.pausedReason,
    timezone: policy.timezone,
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
    warnings,
  };
}
