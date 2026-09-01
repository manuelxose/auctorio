import { Prisma, type Notification, type NotificationSeverity } from "@prisma/client";
import { getPrismaClient } from "../infrastructure/db/prisma";
import { structuredEvent } from "../shared/utils/logger";

const prisma = getPrismaClient();

export type NotificationCategory =
  | "publication"
  | "connection"
  | "generation"
  | "editorial"
  | "automation"
  | "operations"
  | "system";

export type NotificationInput = {
  tenantId: string;
  userId?: string | null;
  siteId?: string | null;
  category: NotificationCategory | string;
  severity?: NotificationSeverity;
  title: string;
  message: string;
  entityType?: string | null;
  entityId?: string | null;
  actionUrl?: string | null;
  dedupeKey?: string | null;
  /**
   * Alert cooldown: when set, repeated notify() calls for the same dedupeKey
   * inside this window are silently suppressed (the existing notification is
   * NOT re-marked unread). Prevents operational alert spam (Phase 5).
   */
  dedupeWindowMs?: number | null;
};

export type NotificationView = {
  id: string;
  tenantId: string;
  userId: string | null;
  siteId: string | null;
  category: string;
  severity: NotificationSeverity;
  title: string;
  message: string;
  entityType: string | null;
  entityId: string | null;
  actionUrl: string | null;
  readAt: Date | null;
  archivedAt: Date | null;
  createdAt: Date;
};

function toView(notification: Notification): NotificationView {
  return {
    id: notification.id,
    tenantId: notification.tenantId,
    userId: notification.userId,
    siteId: notification.siteId,
    category: notification.category,
    severity: notification.severity,
    title: notification.title,
    message: notification.message,
    entityType: notification.entityType,
    entityId: notification.entityId,
    actionUrl: notification.actionUrl,
    readAt: notification.readAt,
    archivedAt: notification.archivedAt,
    createdAt: notification.createdAt,
  };
}

function sanitize(value: string, max = 2000): string {
  // Notifications never carry secrets or raw provider payloads.
  const withoutTokens = value
    .replace(/eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/g, "[token]")
    .replace(/(bearer\s+)[a-z0-9._~+/=-]+/gi, "$1[redacted]")
    .replace(/(api[_-]?key|token|secret|password)\s*[:=]\s*[^\s,;]+/gi, "$1=[redacted]");
  return withoutTokens.slice(0, max);
}

/**
 * Create a durable notification. Idempotent per (tenantId, dedupeKey):
 * repeated calls for the same logical event update the existing row.
 */
export async function notify(input: NotificationInput): Promise<NotificationView | null> {
  const data = {
    tenantId: input.tenantId,
    userId: input.userId ?? null,
    siteId: input.siteId ?? null,
    category: input.category,
    severity: input.severity ?? "info",
    title: sanitize(input.title, 300),
    message: sanitize(input.message),
    entityType: input.entityType ?? null,
    entityId: input.entityId ?? null,
    actionUrl: input.actionUrl ?? null,
  };

  if (input.dedupeKey) {
    const existing = await prisma.notification.findUnique({
      where: { tenantId_dedupeKey: { tenantId: input.tenantId, dedupeKey: input.dedupeKey } },
    });
    if (existing) {
      // Alert cooldown: suppress repeated alerts inside the dedupe window
      // instead of re-surfacing the same notification every tick.
      if (input.dedupeWindowMs) {
        const since = Date.now() - input.dedupeWindowMs;
        if (existing.createdAt.getTime() >= since) {
          structuredEvent("notification.suppressed", { dedupeKey: input.dedupeKey, notificationId: existing.id });
          return null;
        }
      }
      const updated = await prisma.notification.update({
        where: { id: existing.id },
        data: { ...data, readAt: null },
      });
      structuredEvent("notification.deduped", { notificationId: updated.id, dedupeKey: input.dedupeKey });
      return toView(updated);
    }
  }

  const created = await prisma.notification.create({
    data: { ...data, dedupeKey: input.dedupeKey ?? null },
  });
  structuredEvent("notification.created", {
    notificationId: created.id,
    tenantId: created.tenantId,
    category: created.category,
    severity: created.severity,
  });
  return toView(created);
}

/**
 * Notify the tenants affected by an operational event (queue congestion,
 * broken sources, budget thresholds). Callers pass explicit tenant IDs so
 * alerts are never sprayed across unrelated tenants.
 */
export async function notifyOperators(
  tenantIds: string[],
  input: Omit<NotificationInput, "tenantId">,
): Promise<number> {
  let delivered = 0;
  for (const tenantId of tenantIds) {
    try {
      await notify({ ...input, tenantId });
      delivered += 1;
    } catch (error) {
      structuredEvent("notification.operator_delivery_failed", { tenantId, error: error instanceof Error ? error.message : String(error) }, "warn");
    }
  }
  return delivered;
}

export async function listNotifications(
  tenantId: string,
  input: {
    page?: number;
    pageSize?: number;
    unreadOnly?: boolean;
    category?: string;
    archived?: boolean;
    siteId?: string;
  } = {},
): Promise<{ items: NotificationView[]; page: number; pageSize: number; total: number; unread: number; counts: Record<string, number> }> {
  const page = input.page ?? 1;
  const pageSize = Math.min(input.pageSize ?? 20, 100);
  const where: Prisma.NotificationWhereInput = {
    tenantId,
    ...(input.unreadOnly ? { readAt: null } : {}),
    ...(input.category && input.category !== "all" ? { category: input.category } : {}),
    ...(input.archived ? { archivedAt: { not: null } } : { archivedAt: null }),
    ...(input.siteId ? { siteId: input.siteId } : {}),
  };

  const [total, unread, items, countsRows] = await prisma.$transaction([
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { tenantId, readAt: null, archivedAt: null, ...(input.siteId ? { siteId: input.siteId } : {}) } }),
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.notification.groupBy({
      by: ["category"],
      where: { tenantId, archivedAt: null, ...(input.siteId ? { siteId: input.siteId } : {}) },
      orderBy: { category: "asc" },
      _count: { _all: true },
    }),
  ]);

  const counts: Record<string, number> = {};
  for (const row of countsRows) {
    const count = row._count;
    const all = typeof count === "object" && count !== null && "_all" in count ? (count as { _all: number })._all : 0;
    counts[row.category] = all;
  }

  return { items: items.map(toView), page, pageSize, total, unread, counts };
}

export async function markNotificationRead(tenantId: string, id: string, read: boolean): Promise<NotificationView> {
  const notification = await prisma.notification.findFirst({ where: { id, tenantId } });
  if (!notification) {
    throw new Error("notification_not_found");
  }
  const updated = await prisma.notification.update({
    where: { id: notification.id },
    data: { readAt: read ? new Date() : null },
  });
  return toView(updated);
}

export async function markAllNotificationsRead(tenantId: string, category?: string): Promise<{ updated: number }> {
  const result = await prisma.notification.updateMany({
    where: {
      tenantId,
      readAt: null,
      ...(category && category !== "all" ? { category } : {}),
    },
    data: { readAt: new Date() },
  });
  return { updated: result.count };
}

export async function archiveNotification(tenantId: string, id: string, archived: boolean): Promise<NotificationView> {
  const notification = await prisma.notification.findFirst({ where: { id, tenantId } });
  if (!notification) {
    throw new Error("notification_not_found");
  }
  const updated = await prisma.notification.update({
    where: { id: notification.id },
    data: { archivedAt: archived ? new Date() : null },
  });
  return toView(updated);
}

// ────────────────────────────────────────────────────────────── Preferences

export async function getNotificationPreferences(tenantId: string, userId: string): Promise<Array<{ category: string; enabled: boolean }>> {
  const rows = await prisma.notificationPreference.findMany({ where: { tenantId, userId } });
  return rows.map((row) => ({ category: row.category, enabled: row.enabled }));
}

export async function setNotificationPreference(tenantId: string, userId: string, category: string, enabled: boolean): Promise<{ category: string; enabled: boolean }> {
  const row = await prisma.notificationPreference.upsert({
    where: { tenantId_userId_category: { tenantId, userId, category } },
    update: { enabled },
    create: { tenantId, userId, category, enabled },
  });
  return { category: row.category, enabled: row.enabled };
}

/** Whether the user has opted in to a category (default: enabled). */
export async function isNotificationCategoryEnabled(tenantId: string, userId: string | null, category: string): Promise<boolean> {
  if (!userId) {
    return true;
  }
  const row = await prisma.notificationPreference.findUnique({
    where: { tenantId_userId_category: { tenantId, userId, category } },
  });
  return row ? row.enabled : true;
}
