import Redis from "ioredis";
import { getRedisConnectionOptions } from "../infrastructure/queue/redis";
import { getNumberEnv } from "../shared/utils/env";

// Cross-process event bus for tenant-scoped live updates.
// Redis Streams provide bounded retention and Last-Event-ID replay.

const MAX_STREAM_LEN = 500;
const HEARTBEAT_MS = 25_000;
const MAX_EVENTS_PER_MINUTE = 300;

let publisher: Redis | null = null;

function getPublisher(): Redis {
  if (!publisher) {
    publisher = new Redis(getRedisConnectionOptions());
  }
  return publisher;
}

function streamKey(tenantId: string): string {
  return `studio:events:${tenantId}`;
}

export type StudioEventType =
  | "operation.created"
  | "operation.progress"
  | "operation.completed"
  | "operation.failed"
  | "operation.cancelled"
  | "notification.created"
  | "notification.read"
  | "connection.installation.state"
  | "publication.updated";

export type StudioEvent = {
  id: string;
  tenantId: string;
  siteId: string | null;
  type: StudioEventType | string;
  payload: Record<string, unknown>;
  emittedAt: string;
};

export function sanitizeEventPayload(payload: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (value === undefined) {
      continue;
    }
    if (typeof value === "string") {
      const redacted = value
        .replace(/eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/g, "[token]")
        .replace(/(bearer\s+)[a-z0-9._~+/=-]+/gi, "$1[redacted]");
      sanitized[key] = redacted.slice(0, 2000);
    } else if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      sanitized[key] = sanitizeEventPayload(value as Record<string, unknown>);
    } else if (typeof value === "object" && Array.isArray(value)) {
      sanitized[key] = value.map((item) =>
        typeof item === "object" && item !== null && !Array.isArray(item)
          ? sanitizeEventPayload(item as Record<string, unknown>)
          : item,
      );
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

export async function publishEvent(input: {
  tenantId: string;
  siteId?: string | null;
  type: StudioEventType | string;
  payload?: Record<string, unknown>;
}): Promise<string | null> {
  try {
    const id = await getPublisher().xadd(
      streamKey(input.tenantId),
      "MAXLEN",
      "~",
      MAX_STREAM_LEN,
      "*",
      "siteId",
      input.siteId ?? "",
      "type",
      input.type,
      "payload",
      JSON.stringify(sanitizeEventPayload(input.payload ?? {})),
      "emittedAt",
      new Date().toISOString(),
    );
    return id;
  } catch (error) {
    // Event publishing must never break the main flow.
    // eslint-disable-next-line no-console
    console.error("studio.event.publish_failed", error instanceof Error ? error.message : String(error));
    return null;
  }
}

function parseEvent(entry: [id: string, fields: string[]], tenantId: string): StudioEvent {
  const [id, rawFields] = entry;
  const fields: Record<string, string> = {};
  for (let index = 0; index < rawFields.length; index += 2) {
    fields[rawFields[index]] = rawFields[index + 1];
  }
  let payload: Record<string, unknown> = {};
  try {
    payload = JSON.parse(fields.payload ?? "{}") as Record<string, unknown>;
  } catch {
    payload = {};
  }
  return {
    id,
    tenantId,
    siteId: fields.siteId || null,
    type: fields.type ?? "unknown",
    payload,
    emittedAt: fields.emittedAt ?? new Date().toISOString(),
  };
}

export async function readEventsSince(
  tenantId: string,
  lastEventId: string | null,
  limit = 100,
): Promise<StudioEvent[]> {
  try {
    const from = lastEventId ? `(${lastEventId}` : "-";
    const raw = (await getPublisher().xrange(streamKey(tenantId), from, "+", "COUNT", limit)) as Array<[string, string[]]>;
    return raw.map((entry) => parseEvent(entry, tenantId));
  } catch {
    return [];
  }
}

export type TenantEventSubscription = {
  dispose: () => void;
};

/**
 * Subscribe to tenant events. Delivers replay plus live events through the
 * callback. Dispose to release the Redis connection.
 */
export function subscribeToTenantEvents(
  tenantId: string,
  sinceId: string | null,
  onEvent: (event: StudioEvent) => void,
  onEnd?: () => void,
): TenantEventSubscription {
  let disposed = false;
  const client = new Redis(getRedisConnectionOptions());
  const key = streamKey(tenantId);

  void (async () => {
    let cursor = sinceId ?? "$";
    while (!disposed) {
      try {
        const raw = (await (client as unknown as { xread(...args: unknown[]): Promise<unknown> }).xread(
          "BLOCK",
          5_000,
          "COUNT",
          100,
          "STREAMS",
          key,
          cursor,
        )) as Array<[string, Array<[string, string[]]>]> | null;
        if (!raw || disposed) {
          continue;
        }
        for (const [, entries] of raw) {
          for (const entry of entries) {
            const event = parseEvent(entry, tenantId);
            cursor = event.id;
            if (sinceId && cursor === sinceId) {
              continue; // skip the boundary event itself
            }
            onEvent(event);
          }
        }
      } catch (error) {
        if (disposed) {
          break;
        }
        // eslint-disable-next-line no-console
        console.error("studio.event.subscribe_failed", error instanceof Error ? error.message : String(error));
        await new Promise((resolve) => setTimeout(resolve, 1_000));
      }
    }
    void client.quit().catch(() => undefined);
    onEnd?.();
  })();

  return {
    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      void client.disconnect();
    },
  };
}

export function eventHeartbeatMs(): number {
  return getNumberEnv("SSE_HEARTBEAT_MS", HEARTBEAT_MS);
}

export function eventRateLimitPerMinute(): number {
  return getNumberEnv("SSE_MAX_EVENTS_PER_MINUTE", MAX_EVENTS_PER_MINUTE);
}
