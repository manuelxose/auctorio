// Operational source health: latency, statuses, parse failures, empty feeds,
// duplicate rate, rate-limit events and circuit-breaker state. One row per
// source in `source_health`, updated in place.

import { Prisma } from "@prisma/client";
import { getPrismaClient } from "../infrastructure/db/prisma";
import { CircuitBreaker, resolveBreakerOptions, type CircuitState } from "./resilience/breaker";

const prisma = getPrismaClient();

export type FetchOutcome = {
  ok: boolean;
  latencyMs: number;
  httpStatus: number | null;
  itemsFound: number;
  itemsCreated: number;
  duplicates: number;
  parseError: boolean;
  emptyFeed: boolean;
  rateLimited: boolean;
  /** HTTP 304 — conditional request succeeded without a new download. */
  notModified: boolean;
  /** Consecutive failures on ContentSource after this attempt. */
  consecutiveFailures: number;
  error: string | null;
};

const breakerBySource = new Map<string, CircuitBreaker>();
const MAX_BREAKERS = 1000;

export function getSourceBreaker(tenantId: string, sourceId: string, configuration: unknown): CircuitBreaker {
  const key = `${tenantId}:${sourceId}`;
  let breaker = breakerBySource.get(key);
  if (!breaker) {
    breaker = new CircuitBreaker(resolveBreakerOptions(configuration));
    breakerBySource.set(key, breaker);
    if (breakerBySource.size > MAX_BREAKERS) {
      const oldest = breakerBySource.keys().next().value;
      if (oldest) {
        breakerBySource.delete(oldest);
      }
    }
  }
  return breaker;
}

export function computeHealthStatus(input: {
  totalFetches: number;
  consecutiveFailures: number;
  circuitState: CircuitState;
}): string {
  if (input.totalFetches === 0) {
    return "unknown";
  }
  if (input.circuitState === "open" || input.consecutiveFailures >= 5) {
    return "failing";
  }
  if (input.consecutiveFailures >= 1) {
    return "degraded";
  }
  return "healthy";
}

async function ensureHealthRow(tenantId: string, sourceId: string): Promise<void> {
  await prisma.sourceHealth.upsert({
    where: { sourceId },
    create: {
      tenantId,
      sourceId,
      healthStatus: "unknown",
      circuitState: "closed",
      httpStatusCounts: Prisma.JsonNull,
    },
    update: {},
  });
}

function updateStatusCounts(current: unknown, status: number | null): Prisma.InputJsonValue {
  const counts: Record<string, number> =
    current && typeof current === "object" && !Array.isArray(current)
      ? { ...(current as Record<string, number>) }
      : {};
  if (status !== null) {
    const key = String(status);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts as Prisma.InputJsonValue;
}

/** Record one fetch attempt against the source's health row. */
export async function recordFetchOutcome(
  tenantId: string,
  sourceId: string,
  outcome: FetchOutcome,
  breakerConfiguration: unknown,
): Promise<void> {
  await ensureHealthRow(tenantId, sourceId);
  const breaker = getSourceBreaker(tenantId, sourceId, breakerConfiguration);
  const key = `${tenantId}:${sourceId}`;

  if (outcome.ok) {
    await breaker.recordSuccess(key);
  } else if (!outcome.rateLimited) {
    await breaker.recordFailure(key);
  }
  const circuitState = await breaker.state(key);

  const existing = await prisma.sourceHealth.findUnique({ where: { sourceId } });
  if (!existing) {
    return;
  }

  const totalFetches = existing.totalFetches + 1;
  const duplicateRate = outcome.itemsFound > 0
    ? outcome.duplicates / outcome.itemsFound
    : null;

  await prisma.sourceHealth.update({
    where: { sourceId },
    data: {
      lastHttpStatus: outcome.httpStatus,
      httpStatusCounts: updateStatusCounts(existing.httpStatusCounts, outcome.httpStatus),
      fetchLatencyMs: Math.round(outcome.latencyMs),
      totalFetches,
      successfulFetches: existing.successfulFetches + (outcome.ok ? 1 : 0),
      failedFetches: existing.failedFetches + (outcome.ok ? 0 : 1),
      parseFailures: existing.parseFailures + (outcome.parseError ? 1 : 0),
      emptyFeeds: existing.emptyFeeds + (outcome.emptyFeed ? 1 : 0),
      itemsDiscovered: existing.itemsDiscovered + outcome.itemsFound,
      duplicateRate,
      lastNewItemAt: outcome.itemsCreated > 0 ? new Date() : existing.lastNewItemAt,
      rateLimitEvents: existing.rateLimitEvents + (outcome.rateLimited ? 1 : 0),
      notModifiedFetches: existing.notModifiedFetches + (outcome.notModified ? 1 : 0),
      lastError: outcome.ok ? null : outcome.error,
      lastErrorAt: outcome.ok ? null : new Date(),
      circuitState,
      circuitOpenedAt: circuitState === "open" ? existing.circuitOpenedAt ?? new Date() : null,
      lastHealthCheckAt: new Date(),
      healthStatus: computeHealthStatus({ totalFetches, consecutiveFailures: outcome.consecutiveFailures, circuitState }),
    },
  });
}

export async function getSourceHealth(tenantId: string, sourceId: string) {
  return prisma.sourceHealth.findFirst({ where: { sourceId, tenantId } });
}
