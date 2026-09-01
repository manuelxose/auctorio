import { getEnv, getNumberEnv } from "../../shared/utils/env";
import { getPrismaClient } from "../db/prisma";
import { listDueSources, fetchSourceNow } from "../../studio/sources";
import { scoreAndPromoteSourceItem } from "../../studio/editorial";
import { runIntelligencePipelineForItem } from "../../studio/intelligence/pipeline";
import { getIntelligenceSettings } from "../../studio/intelligence/intelligence-settings";
import { createLevelBudget } from "../../studio/intelligence/cost-control";
import { runWebDiscoveryTick } from "../../studio/web-discovery";
import { structuredEvent } from "../../shared/utils/logger";
import { newRunKey } from "../../studio/discovery-run";
import { runIntervalWorker } from "./worker-runtime";
import { incrementCounter, observeLatencyMs } from "../../studio/metrics";
import { notifyOperators } from "../../studio/notifications";

const prisma = getPrismaClient();

export type DiscoveryTickResult = {
  sourcesFetched: number;
  sourcesDeferred: number;
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

  // Phase 3 backfill: candidates that never went through the intelligence
  // pipeline (pre-Phase-3 rows or crashed runs).
  const pending = await prisma.sourceItem.findMany({
    where: {
      tenantId,
      processingStatus: { in: ["candidate", "selected"] },
      score: { gte: 0.4 },
      intelligenceProcessedAt: null,
    },
    orderBy: { discoveredAt: "asc" },
    take: 50,
  });
  if (pending.length > 0) {
    const settings = await getIntelligenceSettings(tenantId);
    const budget = createLevelBudget(settings.levelPolicy);
    for (const item of pending) {
      try {
        await runIntelligencePipelineForItem(tenantId, item.id, { budget });
      } catch (error) {
        structuredEvent("discovery.intelligence_backfill.failed", {
          tenantId,
          itemId: item.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  return { clustered };
}

export async function runDiscoveryTick(): Promise<DiscoveryTickResult> {
  const tickId = newRunKey("tick");
  const maxSourcesPerTick = Math.max(1, getNumberEnv("DISCOVERY_MAX_SOURCES_PER_TICK", 50));
  const result: DiscoveryTickResult = {
    sourcesFetched: 0,
    sourcesDeferred: 0,
    itemsCreated: 0,
    itemsClustered: 0,
    errors: 0,
  };

  const tenants = await prisma.tenant.findMany({
    where: { status: "active" },
    select: { id: true },
  });

  const startedAt = Date.now();
  for (const tenant of tenants) {
    const dueSources = await listDueSources(tenant.id);
    // Backpressure: bound work per tick; the rest stays due for the next tick.
    const sourcesThisTick = dueSources.slice(0, maxSourcesPerTick);
    result.sourcesDeferred += Math.max(0, dueSources.length - sourcesThisTick.length);

    for (const source of sourcesThisTick) {
      const fetchStarted = Date.now();
      try {
        const fetched = await fetchSourceNow(tenant.id, source.id, { runKey: `${tickId}:${source.id}` });
        result.sourcesFetched += 1;
        result.itemsCreated += fetched.created;
        observeLatencyMs("discovery_source_fetch_ms", Date.now() - fetchStarted);
        if (fetched.failed) {
          result.errors += 1;
        }
      } catch (error) {
        result.errors += 1;
        structuredEvent("discovery.source_fetch_failed", {
          tenantId: tenant.id,
          sourceId: source.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const { clustered } = await scoreAndClusterItems(tenant.id);
    result.itemsClustered += clustered;
  }

  incrementCounter("discovery_sources_fetched_total", result.sourcesFetched);
  incrementCounter("discovery_source_items_created_total", result.itemsCreated);
  incrementCounter("discovery_errors_total", result.errors);
  incrementCounter("discovery_sources_deferred_total", result.sourcesDeferred);
  incrementCounter("discovery_ticks_total", 1);
  observeLatencyMs("discovery_tick_ms", Date.now() - startedAt);

  structuredEvent("discovery.tick.completed", {
    tickId,
    durationMs: Date.now() - startedAt,
    ...result,
  });

  await notifyBrokenSources();

  return result;
}

/** Prolonged source failure alerts, deduped per source (6h window). */
async function notifyBrokenSources(): Promise<void> {
  const failing = await prisma.sourceHealth.findMany({
    where: { healthStatus: "failing" },
    select: { tenantId: true, sourceId: true },
    take: 20,
  });
  for (const row of failing) {
    await notifyOperators([row.tenantId], {
      category: "operations",
      severity: "warning",
      title: "Source has been failing",
      message: `A content source reached failing health and is being skipped by discovery.`,
      entityType: "source",
      entityId: row.sourceId,
      actionUrl: "/studio/sources",
      dedupeKey: `ops.source.${row.sourceId}.failing`,
      dedupeWindowMs: 6 * 60 * 60_000,
    });
  }
}

export async function runDiscoveryWorker() {
  const redisUrl = getEnv("REDIS_URL", "");
  if (!redisUrl) {
    console.warn("[worker:discovery] REDIS_URL is missing; worker not started");
    return;
  }

  await runIntervalWorker({
    name: "discovery",
    intervalMs: Math.max(15_000, getNumberEnv("DISCOVERY_INTERVAL_MS", 60_000)),
    tick: async () => {
      const result = await runDiscoveryTick();
      if (result.sourcesFetched > 0 || result.itemsCreated > 0 || result.errors > 0) {
        structuredEvent("discovery.tick", { ...result });
      }
    },
    extraIntervals: [
      {
        name: "web-discovery",
        intervalMs: Math.max(300_000, getNumberEnv("WEB_DISCOVERY_INTERVAL_MS", 30 * 60_000)),
        tick: async () => {
          await runWebDiscoveryTick();
        },
      },
    ],
  });
}
