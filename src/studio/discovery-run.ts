// Discovery-run tracing and metrics. Every run is traceable through
// runId → source → adapter → items → clusters, and metrics are derived from
// the discovery_runs table.

import { randomUUID } from "node:crypto";
import { getPrismaClient } from "../infrastructure/db/prisma";
import { structuredEvent } from "../shared/utils/logger";

const prisma = getPrismaClient();

export function newRunKey(prefix = "discovery"): string {
  return `${prefix}_${Date.now().toString(36)}_${randomUUID().slice(0, 8)}`;
}

export type RunCounters = {
  itemsFound: number;
  itemsCreated: number;
  itemsDuplicated: number;
  clustersCreated: number;
  parseErrors: number;
  sourceFailures: number;
};

export async function beginDiscoveryRun(input: {
  tenantId: string;
  sourceId?: string | null;
  adapterType?: string | null;
  runKey?: string;
}): Promise<string> {
  const run = await prisma.discoveryRun.create({
    data: {
      tenantId: input.tenantId,
      sourceId: input.sourceId ?? null,
      adapterType: input.adapterType ?? null,
      runKey: input.runKey ?? newRunKey(),
      status: "running",
    },
  });
  return run.id;
}

export async function finishDiscoveryRun(runId: string, counters: RunCounters, metrics?: Record<string, unknown>): Promise<void> {
  const run = await prisma.discoveryRun.findUnique({ where: { id: runId } });
  if (!run) {
    return;
  }
  const durationMs = run.startedAt ? Date.now() - run.startedAt.getTime() : null;
  await prisma.discoveryRun.update({
    where: { id: runId },
    data: {
      status: "succeeded",
      finishedAt: new Date(),
      durationMs,
      ...counters,
      metrics: metrics ? (metrics as never) : undefined,
    },
  });
}

export async function failDiscoveryRun(runId: string, counters: Partial<RunCounters>, errorMessage: string): Promise<void> {
  const run = await prisma.discoveryRun.findUnique({ where: { id: runId } });
  if (!run) {
    return;
  }
  const durationMs = run.startedAt ? Date.now() - run.startedAt.getTime() : null;
  await prisma.discoveryRun.update({
    where: { id: runId },
    data: {
      status: "failed",
      finishedAt: new Date(),
      durationMs,
      ...counters,
      sourceFailures: (counters.sourceFailures ?? 0) + 1,
      errorMessage: errorMessage.slice(0, 500),
    },
  });
}

/** Mark a run as skipped (circuit open, rate limited…) — not a failure. */
export async function skipDiscoveryRun(runId: string, counters: Partial<RunCounters>, reason: string): Promise<void> {
  const run = await prisma.discoveryRun.findUnique({ where: { id: runId } });
  if (!run) {
    return;
  }
  const durationMs = run.startedAt ? Date.now() - run.startedAt.getTime() : null;
  await prisma.discoveryRun.update({
    where: { id: runId },
    data: {
      status: "skipped",
      finishedAt: new Date(),
      durationMs,
      ...counters,
      metrics: { skipReason: reason } as never,
    },
  });
}

/** Structured log event with the run id attached. */
export function logDiscoveryEvent(runId: string, event: string, data: Record<string, unknown> = {}, level: "debug" | "info" | "warn" | "error" = "info"): void {
  structuredEvent(event, { runId, ...data }, level);
}

export type DiscoveryMetrics = {
  windowHours: number;
  totalRuns: number;
  succeededRuns: number;
  failedRuns: number;
  skippedRuns: number;
  avgDurationMs: number | null;
  itemsFound: number;
  itemsCreated: number;
  itemsDuplicated: number;
  clustersCreated: number;
  parseErrors: number;
  sourceFailures: number;
  itemsPerMinute: number;
  duplicateRate: number | null;
  rateLimitEvents: number;
  queueDepth: number;
};

export async function getDiscoveryMetrics(tenantId: string, windowHours = 24): Promise<DiscoveryMetrics> {
  const since = new Date(Date.now() - windowHours * 3_600_000);
  const [aggregates, rateLimitEvents, queueDepth] = await Promise.all([
    prisma.discoveryRun.aggregate({
      where: { tenantId, startedAt: { gte: since } },
      _count: { _all: true },
      _sum: {
        durationMs: true,
        itemsFound: true,
        itemsCreated: true,
        itemsDuplicated: true,
        clustersCreated: true,
        parseErrors: true,
        sourceFailures: true,
      },
      _avg: { durationMs: true },
    }),
    prisma.sourceHealth.aggregate({
      where: { tenantId, rateLimitEvents: { gt: 0 } },
      _sum: { rateLimitEvents: true },
    }),
    prisma.contentSource.count({ where: { tenantId, enabled: true, type: { not: "manual" } } }),
  ]);

  const failedRuns = await prisma.discoveryRun.count({
    where: { tenantId, startedAt: { gte: since }, status: "failed" },
  });
  const succeededRuns = await prisma.discoveryRun.count({
    where: { tenantId, startedAt: { gte: since }, status: "succeeded" },
  });
  const skippedRuns = await prisma.discoveryRun.count({
    where: { tenantId, startedAt: { gte: since }, status: "skipped" },
  });

  const itemsCreated = aggregates._sum.itemsCreated ?? 0;
  const itemsFound = aggregates._sum.itemsFound ?? 0;
  const duplicates = aggregates._sum.itemsDuplicated ?? 0;
  return {
    windowHours,
    totalRuns: aggregates._count._all,
    succeededRuns,
    failedRuns,
    skippedRuns,
    avgDurationMs: aggregates._avg.durationMs ? Math.round(aggregates._avg.durationMs) : null,
    itemsFound,
    itemsCreated,
    itemsDuplicated: duplicates,
    clustersCreated: aggregates._sum.clustersCreated ?? 0,
    parseErrors: aggregates._sum.parseErrors ?? 0,
    sourceFailures: aggregates._sum.sourceFailures ?? 0,
    itemsPerMinute: itemsCreated / Math.max(1, windowHours * 60),
    duplicateRate: itemsFound > 0 ? duplicates / itemsFound : null,
    rateLimitEvents: rateLimitEvents._sum.rateLimitEvents ?? 0,
    queueDepth,
  };
}
