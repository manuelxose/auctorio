import { getEnv, getNumberEnv } from "../../shared/utils/env";
import { claimDuePublications, enqueuePublication } from "../../studio/publication";
import { runIntervalWorker } from "./worker-runtime";
import { getPrismaClient } from "../db/prisma";
import { structuredEvent } from "../../shared/utils/logger";
import { incrementCounter, setGauge } from "../../studio/metrics";
import { getQueueDepth } from "../queue/backpressure";
import { notifyOperators } from "../../studio/notifications";

const prisma = getPrismaClient();

const QUEUES_TO_GUARD = ["queue_publishing", "queue_social"];

export type SchedulerTickResult = {
  claimed: number;
  enqueued: number;
  failed: number;
};

/**
 * Claim due publications and enqueue them into BullMQ.
 *
 * Backpressure: when the publishing/social queues are above the configured
 * depth limit, this tick defers (rows stay 'scheduled'/'failed' in the DB and
 * are re-claimed next tick once the queue drains) — nothing is lost and
 * nothing is duplicated.
 */
export async function runSchedulerTick(): Promise<SchedulerTickResult> {
  const result: SchedulerTickResult = {
    claimed: 0,
    enqueued: 0,
    failed: 0,
  };

  // Guard BEFORE claiming: deferral keeps rows claimable for later ticks.
  for (const queueName of QUEUES_TO_GUARD) {
    const limit = Math.max(10, getNumberEnv("SCHEDULER_QUEUE_MAX_DEPTH", 200));
    const depth = await getQueueDepth(queueName);
    setGauge(`queue_depth_${queueName}`, depth);
    if (depth >= limit) {
      structuredEvent("scheduler.backpressure", { queue: queueName, depth, limit }, "warn");
      const affected = await prisma.publication.findMany({
        where: { status: { in: ["scheduled", "failed"] } },
        select: { tenantId: true },
        distinct: ["tenantId"],
      });
      await notifyOperators(affected.map((row) => row.tenantId), {
        category: "operations",
        severity: "warning",
        title: "Publication queue is congested",
        message: `${queueName} depth ${depth} ≥ limit ${limit}; scheduler deferring new enqueues.`,
        entityType: "queue",
        entityId: queueName,
        actionUrl: "/studio/operations",
        dedupeKey: `ops.queue.${queueName}.congested`,
        dedupeWindowMs: 30 * 60_000,
      });
      return result;
    }
  }

  const claimed = await claimDuePublications(getNumberEnv("SCHEDULER_BATCH_SIZE", 20));
  result.claimed = claimed.length;
  incrementCounter("scheduler_publications_claimed_total", claimed.length);

  for (const publicationId of claimed) {
    try {
      await enqueuePublication(publicationId);
      result.enqueued += 1;
      incrementCounter("scheduler_publications_enqueued_total", 1);
    } catch (error) {
      result.failed += 1;
      incrementCounter("scheduler_enqueue_failures_total", 1);
      const message = error instanceof Error ? error.message : String(error);
      structuredEvent("scheduler.enqueue_failed", { publicationId, error: message }, "error");
      const failed = await prisma.publication.update({
        where: { id: publicationId },
        data: {
          status: "failed",
          lastError: message.slice(0, 500),
          failureClass: "permanent",
          failureReason: "enqueue_failed",
        },
      });
      await notifyOperators([failed.tenantId], {
        category: "operations",
        severity: "error",
        title: "Publication enqueue failed",
        message: `Publication ${publicationId} could not be enqueued: ${message.slice(0, 200)}`,
        entityType: "publication",
        entityId: publicationId,
        actionUrl: "/studio/operations",
        dedupeKey: `ops.publication.${publicationId}.enqueue_failed`,
        dedupeWindowMs: 60 * 60_000,
      });
    }
  }

  return result;
}

export async function runSchedulerWorker() {
  const redisUrl = getEnv("REDIS_URL", "");
  if (!redisUrl) {
    console.warn("[worker:scheduler] REDIS_URL is missing; worker not started");
    return;
  }

  await runIntervalWorker({
    name: "scheduler",
    intervalMs: Math.max(5_000, getNumberEnv("SCHEDULER_INTERVAL_MS", 10_000)),
    tick: async () => {
      const result = await runSchedulerTick();
      if (result.claimed > 0 || result.failed > 0) {
        structuredEvent("scheduler.tick", { ...result });
      }
    },
  });
}
