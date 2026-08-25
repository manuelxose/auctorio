import type { FastifyInstance } from "fastify";
import {
  badRequest,
  isUuid,
  notFound,
  parseBody,
  requireStudioContext,
} from "./http-utils";
import { parsePage, parsePageSize } from "./http-utils";
import {
  archiveNotification,
  getNotificationPreferences,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  setNotificationPreference,
} from "./notifications";
import { publishEvent } from "./events";

const CATEGORIES = ["publication", "connection", "generation", "editorial", "automation", "system", "all"] as const;

export function registerNotificationRoutes(fastify: FastifyInstance) {
  fastify.get("/v2/notifications", async (request, reply) => {
    const context = await requireStudioContext(request, reply);
    if (!context) {
      return;
    }
    const query = request.query as { page?: string; pageSize?: string; unreadOnly?: string; category?: string; archived?: string; siteId?: string };
    if (query.category && !CATEGORIES.includes(query.category as (typeof CATEGORIES)[number])) {
      return badRequest(reply, `category must be one of: ${CATEGORIES.join(", ")}`);
    }
    const result = await listNotifications(context.tenantId, {
      page: parsePage(query.page, 1),
      pageSize: parsePageSize(query.pageSize, 20),
      unreadOnly: query.unreadOnly === "true",
      category: query.category,
      archived: query.archived === "true",
      siteId: query.siteId,
    });
    return reply.send(result);
  });

  fastify.post("/v2/notifications/:id/read", async (request, reply) => {
    const context = await requireStudioContext(request, reply);
    if (!context) {
      return;
    }
    const id = (request.params as { id: string }).id;
    if (!isUuid(id)) {
      return badRequest(reply, "invalid notification id");
    }
    const body = parseBody<{ read?: boolean }>(request);
    try {
      const updated = await markNotificationRead(context.tenantId, id, body.read !== false);
      if (body.read !== false) {
        await publishEvent({
          tenantId: context.tenantId,
          type: "notification.read",
          payload: { notificationId: id },
        });
      }
      return reply.send(updated);
    } catch (error) {
      if (error instanceof Error && error.message === "notification_not_found") {
        return notFound(reply, "notification not found");
      }
      throw error;
    }
  });

  fastify.post("/v2/notifications/read-all", async (request, reply) => {
    const context = await requireStudioContext(request, reply);
    if (!context) {
      return;
    }
    const body = parseBody<{ category?: string }>(request);
    if (body.category && !CATEGORIES.includes(body.category as (typeof CATEGORIES)[number])) {
      return badRequest(reply, `category must be one of: ${CATEGORIES.join(", ")}`);
    }
    const result = await markAllNotificationsRead(context.tenantId, body.category);
    return reply.send(result);
  });

  fastify.post("/v2/notifications/:id/archive", async (request, reply) => {
    const context = await requireStudioContext(request, reply);
    if (!context) {
      return;
    }
    const id = (request.params as { id: string }).id;
    if (!isUuid(id)) {
      return badRequest(reply, "invalid notification id");
    }
    const body = parseBody<{ archived?: boolean }>(request);
    try {
      const updated = await archiveNotification(context.tenantId, id, body.archived !== false);
      return reply.send(updated);
    } catch (error) {
      if (error instanceof Error && error.message === "notification_not_found") {
        return notFound(reply, "notification not found");
      }
      throw error;
    }
  });

  fastify.get("/v2/notifications/preferences", async (request, reply) => {
    const context = await requireStudioContext(request, reply);
    if (!context) {
      return;
    }
    if (!context.userId) {
      return reply.send({ preferences: CATEGORIES.filter((category) => category !== "all").map((category) => ({ category, enabled: true })) });
    }
    const preferences = await getNotificationPreferences(context.tenantId, context.userId);
    const complete = CATEGORIES.filter((category) => category !== "all").map((category) => ({
      category,
      enabled: preferences.find((preference) => preference.category === category)?.enabled ?? true,
    }));
    return reply.send({ preferences: complete });
  });

  fastify.put("/v2/notifications/preferences", async (request, reply) => {
    const context = await requireStudioContext(request, reply);
    if (!context) {
      return;
    }
    if (!context.userId) {
      return badRequest(reply, "user-scoped preferences require a studio session");
    }
    const body = parseBody<{ category?: string; enabled?: boolean }>(request);
    if (!body.category || !CATEGORIES.includes(body.category as (typeof CATEGORIES)[number]) || body.category === "all") {
      return badRequest(reply, `category must be one of: ${CATEGORIES.filter((item) => item !== "all").join(", ")}`);
    }
    const updated = await setNotificationPreference(context.tenantId, context.userId, body.category, body.enabled !== false);
    return reply.send(updated);
  });
}
