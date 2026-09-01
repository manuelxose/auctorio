// Phase 5 — backpressure helpers for BullMQ queues.
//
// When a queue is above its configured depth limit, callers defer work
// instead of piling it on. Deferral is always idempotent on the caller side:
// the durable scheduler keeps rows 'scheduled', automation keeps policy
// counts, so nothing is lost or duplicated.

import { Queue } from "bullmq";
import { getRedisConnectionOptions } from "./redis";
import { getNumberEnv } from "../../shared/utils/env";

const depthCache = new Map<string, { value: number; at: number }>();
const DEPTH_CACHE_TTL_MS = 5_000;

export class QueueBackpressureError extends Error {
  constructor(
    readonly queueName: string,
    readonly depth: number,
    readonly limit: number,
  ) {
    super(`queue_backpressure ${queueName} depth=${depth} limit=${limit}`);
    this.name = "QueueBackpressureError";
  }
}

/** Sum of job counts in the given states. Cached briefly to avoid hammering
 *  Redis from scheduler ticks. */
export async function getQueueDepth(
  queueName: string,
  states: Array<"waiting" | "active" | "delayed" | "prioritized"> = ["waiting", "active", "delayed"],
): Promise<number> {
  const cached = depthCache.get(queueName);
  if (cached && Date.now() - cached.at < DEPTH_CACHE_TTL_MS) {
    return cached.value;
  }

  const queue = new Queue(queueName, { connection: getRedisConnectionOptions() });
  try {
    const counts = await queue.getJobCounts(...states);
    const depth = states.reduce((sum, state) => sum + (counts[state] ?? 0), 0);
    depthCache.set(queueName, { value: depth, at: Date.now() });
    return depth;
  } finally {
    await queue.close().catch(() => undefined);
  }
}

export function queueDepthLimit(queueName: string): number {
  return Math.max(10, getNumberEnv("QUEUE_MAX_DEPTH", 500));
}

export async function assertQueueHasCapacity(queueName: string): Promise<void> {
  const limit = queueDepthLimit(queueName);
  const depth = await getQueueDepth(queueName);
  if (depth >= limit) {
    throw new QueueBackpressureError(queueName, depth, limit);
  }
}
