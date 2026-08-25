import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  badRequest,
  parseOptionalString,
  requireStudioContext,
} from "./http-utils";
import {
  eventHeartbeatMs,
  eventRateLimitPerMinute,
  subscribeToTenantEvents,
  type StudioEvent,
} from "./events";

function serializeSse(event: StudioEvent): string {
  return [
    `id: ${event.id}`,
    `event: ${event.type}`,
    `data: ${JSON.stringify({ type: event.type, payload: event.payload, siteId: event.siteId, emittedAt: event.emittedAt })}`,
    "",
    "",
  ].join("\n");
}

export function registerEventRoutes(fastify: FastifyInstance) {
  fastify.get("/v2/events/stream", async (request: FastifyRequest, reply: FastifyReply) => {
    const context = await requireStudioContext(request, reply);
    if (!context) {
      return;
    }
    const query = request.query as { siteId?: string; lastEventId?: string };
    const siteId = parseOptionalString(query.siteId);
    const lastEventId = parseOptionalString(query.lastEventId) ?? null;

    if (siteId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(siteId)) {
      return badRequest(reply, "invalid siteId");
    }

    reply.raw.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    });
    reply.raw.flushHeaders?.();

    let sent = 0;
    const rateLimit = eventRateLimitPerMinute();
    let subscription: ReturnType<typeof subscribeToTenantEvents> | null = null;

    const send = (event: StudioEvent): void => {
      if (siteId && event.siteId && event.siteId !== siteId) {
        return;
      }
      sent += 1;
      if (sent > rateLimit) {
        if (!reply.raw.destroyed) {
          reply.raw.write('event: rate_limited\ndata: {"message":"too many events"}\n\n');
        }
        subscription?.dispose();
        if (!reply.raw.destroyed) {
          reply.raw.end();
        }
        return;
      }
      if (!reply.raw.destroyed) {
        reply.raw.write(serializeSse(event));
      }
    };

    subscription = subscribeToTenantEvents(
      context.tenantId,
      lastEventId,
      send,
      () => {
        if (!reply.raw.destroyed) {
          reply.raw.end();
        }
      },
    );

    const heartbeat = setInterval(() => {
      if (!reply.raw.destroyed) {
        reply.raw.write(": keepalive\n\n");
      }
    }, eventHeartbeatMs());

    const cleanup = (): void => {
      clearInterval(heartbeat);
      subscription?.dispose();
    };
    reply.raw.on("close", cleanup);
    request.raw.on("aborted", cleanup);

    return reply;
  });
}
