import { getEnv, getNumberEnv } from "../../shared/utils/env";
import { getPrismaClient } from "../db/prisma";
import { listDueSources, fetchSourceNow } from "../../studio/sources";
import { scoreAndPromoteSourceItem } from "../../studio/editorial";
import { runWebDiscoveryTick } from "../../studio/web-discovery";
import { structuredEvent } from "../../shared/utils/logger";

const prisma = getPrismaClient();

export type DiscoveryTickResult = {
  sourcesFetched: number;
  itemsCreated: number;
  itemsClustered: number;
  errors: number;
};

async function scoreAndClusterItems(tenantId: string): Promise<{ clustered: number }> {
  // Backfill safety net for items that were ingested before immediate scoring
  // (e.g. created by another process or before a restart).
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

    await scoreAndPromoteSourceItem(tenantId, item, {
      sourceTrustScore: source.trustScore,
      sourcePriority: source.priority,
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
  const webIntervalMs = Math.max(300_000, getNumberEnv("WEB_DISCOVERY_INTERVAL_MS", 30 * 60_000));
  let running = false;
  let shuttingDown = false;
  let webRunning = false;

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

  // AI web source discovery: plan, search, evaluate, scrape and feed the
  // existing source-item / cluster pipeline.
  const webTick = async () => {
    if (webRunning || shuttingDown) {
      return;
    }
    webRunning = true;
    try {
      await runWebDiscoveryTick();
    } catch (error) {
      structuredEvent("web.discovery.tick_failed", { error: error instanceof Error ? error.message : String(error) }, "error");
    } finally {
      webRunning = false;
    }
  };

  const timer = setInterval(() => void tick(), intervalMs);
  const webTimer = setInterval(() => void webTick(), webIntervalMs);
  const stop = () => {
    shuttingDown = true;
    clearInterval(timer);
    clearInterval(webTimer);
  };
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);

  void tick();
  console.log("[worker:discovery] started", { intervalMs, webIntervalMs });
}
