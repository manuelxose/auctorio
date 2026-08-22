import { getEnv, getNumberEnv } from "../../shared/utils/env";
import { claimDuePublications, enqueuePublication } from "../../studio/publication";

export async function runSchedulerTick(): Promise<{ claimed: number }> {
  const claimed = await claimDuePublications(getNumberEnv("SCHEDULER_BATCH_SIZE", 20));
  for (const publicationId of claimed) {
    try {
      await enqueuePublication(publicationId);
    } catch (error) {
      const { getPrismaClient } = await import("../db/prisma");
      const prisma = getPrismaClient();
      await prisma.publication.update({
        where: { id: publicationId },
        data: {
          status: "failed",
          lastError: error instanceof Error ? error.message : String(error),
          failureClass: "permanent",
          failureReason: "enqueue_failed",
        },
      });
    }
  }
  return { claimed: claimed.length };
}

export async function runSchedulerWorker() {
  const redisUrl = getEnv("REDIS_URL", "");
  if (!redisUrl) {
    console.warn("[worker:scheduler] REDIS_URL is missing; worker not started");
    return;
  }

  const intervalMs = Math.max(5_000, getNumberEnv("SCHEDULER_INTERVAL_MS", 10_000));
  let running = false;
  let shuttingDown = false;

  const tick = async () => {
    if (running || shuttingDown) {
      return;
    }
    running = true;
    try {
      const result = await runSchedulerTick();
      if (result.claimed > 0) {
        console.log("[worker:scheduler] tick", result);
      }
    } catch (error) {
      console.error("[worker:scheduler] tick failed", error);
    } finally {
      running = false;
    }
  };

  const timer = setInterval(() => void tick(), intervalMs);
  const stop = () => {
    shuttingDown = true;
    clearInterval(timer);
  };
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);

  void tick();
  console.log("[worker:scheduler] started", { intervalMs });
}
