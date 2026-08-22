import { Prisma } from "@prisma/client";
import { getEnv, getNumberEnv } from "../../shared/utils/env";
import { getPrismaClient } from "../db/prisma";
import { listDueSources, fetchSourceNow } from "../../studio/sources";
import {
  assignSourceItemToCluster,
  scoreSourceItem,
  type ScoringContext,
} from "../../studio/editorial";

const prisma = getPrismaClient();

export type DiscoveryTickResult = {
  sourcesFetched: number;
  itemsCreated: number;
  itemsClustered: number;
  errors: number;
};

async function scoreAndClusterItems(tenantId: string): Promise<{ clustered: number }> {
  const unscored = await prisma.sourceItem.findMany({
    where: {
      tenantId,
      processingStatus: "discovered",
      score: null,
    },
    orderBy: { discoveredAt: "asc" },
    take: 100,
  });

  let clustered = 0;
  for (const item of unscored) {
    const source = await prisma.contentSource.findUnique({
      where: { id: item.sourceId },
      select: { trustScore: true, priority: true },
    });
    if (!source) {
      continue;
    }

    const context: ScoringContext = {
      sourceTrustScore: source.trustScore,
      sourcePriority: source.priority,
    };
    const scored = scoreSourceItem(item, context);

    await prisma.sourceItem.update({
      where: { id: item.id },
      data: {
        score: scored.score,
        scoreExplanation: scored.explanation as unknown as Prisma.InputJsonValue,
      },
    });

    await assignSourceItemToCluster(tenantId, item);
    await prisma.sourceItem.update({
      where: { id: item.id },
      data: {
        processingStatus: scored.score >= 0.4 ? "candidate" : "parsed",
      },
    });
    clustered += 1;
  }

  return { clustered };
}

export async function runDiscoveryTick(): Promise<DiscoveryTickResult> {
  const result: DiscoveryTickResult = {
    sourcesFetched: 0,
    itemsCreated: 0,
    itemsClustered: 0,
    errors: 0,
  };

  const tenants = await prisma.tenant.findMany({
    where: { status: "active" },
    select: { id: true },
  });

  for (const tenant of tenants) {
    const dueSources = await listDueSources(tenant.id);
    for (const source of dueSources) {
      const fetched = await fetchSourceNow(tenant.id, source.id);
      result.sourcesFetched += 1;
      result.itemsCreated += fetched.created;
      if (fetched.failed) {
        result.errors += 1;
      }
    }

    const { clustered } = await scoreAndClusterItems(tenant.id);
    result.itemsClustered += clustered;
  }

  return result;
}

export async function runDiscoveryWorker() {
  const redisUrl = getEnv("REDIS_URL", "");
  if (!redisUrl) {
    console.warn("[worker:discovery] REDIS_URL is missing; worker not started");
    return;
  }

  const intervalMs = Math.max(15_000, getNumberEnv("DISCOVERY_INTERVAL_MS", 60_000));
  let running = false;
  let shuttingDown = false;

  const tick = async () => {
    if (running || shuttingDown) {
      return;
    }
    running = true;
    try {
      const result = await runDiscoveryTick();
      if (result.sourcesFetched > 0 || result.itemsCreated > 0) {
        console.log("[worker:discovery] tick", result);
      }
    } catch (error) {
      console.error("[worker:discovery] tick failed", error);
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
  console.log("[worker:discovery] started", { intervalMs });
}
