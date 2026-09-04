// Phase 5 — operations telemetry and cost controls routes.
//
// /v2/operations/metrics  process metrics snapshot (counters/gauges)
// /v2/operations/health   system health: db, redis, queues, workers, sources,
//                         throughput, AI cost, recent failures
// /v2/cost-controls       per-tenant cost budgets + spend

import type { FastifyInstance } from "fastify";
import { Queue } from "bullmq";
import { getRedisConnectionOptions } from "../infrastructure/queue/redis";
import { QUEUE_NAMES } from "../infrastructure/queue/queues";
import { getPrismaClient } from "../infrastructure/db/prisma";
import {
  badRequest,
  isUuid,
  notFound,
  parseBody,
  parseOptionalString,
  requireStudioContext,
  requireStudioPermission,
} from "./http-utils";
import { getMetricsSnapshot } from "./metrics";
import { listWorkerHeartbeats } from "./worker-health";
import { deleteCostBudget, getAiSpend, listCostBudgets, upsertCostBudget } from "./cost-budgets";
import { structuredEvent } from "../shared/utils/logger";
import { getTenantReleaseReadiness } from "./release-readiness";

const prisma = getPrismaClient();

const BUDGET_ACTIONS = ["warn", "degrade", "delay", "pause"] as const;
const BUDGET_PERIODS = ["daily", "monthly"] as const;

export function registerPhase5OpsRoutes(fastify: FastifyInstance) {
  fastify.get("/v2/operations/metrics", async (request, reply) => {
    const context = await requireStudioContext(request, reply);
    if (!context) {
      return;
    }
    return reply.send(getMetricsSnapshot());
  });

  fastify.get("/v2/operations/health", async (request, reply) => {
    const context = await requireStudioContext(request, reply);
    if (!context) {
      return;
    }

    const health: Record<string, unknown> = {
      checkedAt: new Date().toISOString(),
      tenantId: context.tenantId,
    };

    // DB health.
    try {
      await prisma.$queryRaw`SELECT 1`;
      health.db = "ok";
    } catch (error) {
      health.db = `error: ${error instanceof Error ? error.message : String(error)}`;
    }

    // Redis + queue depths.
    try {
      const entries = [];
      for (const queueName of Object.values(QUEUE_NAMES)) {
        const queue = new Queue(queueName, { connection: getRedisConnectionOptions() });
        try {
          const counts = await queue.getJobCounts("waiting", "active", "delayed", "failed", "completed");
          entries.push({ queue: queueName, counts });
        } finally {
          await queue.close().catch(() => undefined);
        }
      }
      health.redis = "ok";
      health.queues = entries;
    } catch (error) {
      health.redis = `error: ${error instanceof Error ? error.message : String(error)}`;
      health.queues = [];
    }

    // Workers.
    try {
      health.workers = await listWorkerHeartbeats();
    } catch {
      health.workers = [];
    }

    // Sources: broken + rate-limited.
    try {
      const [broken, rateLimited] = await Promise.all([
        prisma.sourceHealth.count({ where: { tenantId: context.tenantId, healthStatus: "failing" } }),
        prisma.sourceHealth.count({ where: { tenantId: context.tenantId, rateLimitEvents: { gt: 0 } } }),
      ]);
      health.sources = { broken, rateLimited };
    } catch {
      health.sources = { broken: null, rateLimited: null };
    }

    // Throughput + failures.
    const since = new Date(Date.now() - 24 * 60 * 60_000);
    try {
      const [items24h, failedOps24h, failedPublications] = await Promise.all([
        prisma.sourceItem.count({ where: { tenantId: context.tenantId, createdAt: { gte: since } } }),
        prisma.operation.count({ where: { tenantId: context.tenantId, status: "failed", updatedAt: { gte: since } } }),
        prisma.publication.count({ where: { tenantId: context.tenantId, status: "failed" } }),
      ]);
      health.throughput = { sourceItems24h: items24h };
      health.failures = { operations24h: failedOps24h, publicationsFailed: failedPublications };
    } catch {
      health.throughput = { sourceItems24h: null };
      health.failures = { operations24h: null, publicationsFailed: null };
    }

    // AI cost.
    try {
      const [daily, monthly] = await Promise.all([
        getAiSpend(context.tenantId, { period: "daily" }),
        getAiSpend(context.tenantId, { period: "monthly" }),
      ]);
      health.aiCost = { dailyUsd: daily.spentUsd, monthlyUsd: monthly.spentUsd };
    } catch {
      health.aiCost = { dailyUsd: null, monthlyUsd: null };
    }

    // Recent critical errors (drill-down, bounded).
    try {
      health.recentErrors = await prisma.operation.findMany({
        where: { tenantId: context.tenantId, status: "failed" },
        orderBy: { updatedAt: "desc" },
        take: 5,
        select: {
          id: true,
          type: true,
          errorCode: true,
          errorSummary: true,
          queueName: true,
          updatedAt: true,
        },
      });
    } catch {
      health.recentErrors = [];
    }

    // Automation state.
    try {
      const policies = await prisma.automationPolicy.findMany({
        where: { tenantId: context.tenantId },
        select: { siteId: true, enabled: true, state: true, pausedReason: true },
        take: 20,
      });
      health.automation = policies;
    } catch {
      health.automation = [];
    }

    const degraded = health.db !== "ok" || health.redis !== "ok";
    return reply.code(degraded ? 503 : 200).send({
      status: degraded ? "degraded" : "ok",
      ...health,
    });
  });

  /** Read-only release preflight used before enabling a tenant autopilot. */
  fastify.get("/v2/operations/release-preflight", async (request, reply) => {
    const context = await requireStudioContext(request, reply);
    if (!context) return;
    const report = await getTenantReleaseReadiness(context.tenantId);
    return reply.code(report.ready ? 200 : 409).send(report);
  });

  // ──────────────────────────────────────────────────────────── Cost controls

  fastify.get("/v2/cost-controls", async (request, reply) => {
    const context = await requireStudioContext(request, reply);
    if (!context) {
      return;
    }
    const [budgets, daily, monthly] = await Promise.all([
      listCostBudgets(context.tenantId),
      getAiSpend(context.tenantId, { period: "daily" }),
      getAiSpend(context.tenantId, { period: "monthly" }),
    ]);
    return reply.send({
      budgets,
      spend: { dailyUsd: daily.spentUsd, dailyEvents: daily.events, monthlyUsd: monthly.spentUsd, monthlyEvents: monthly.events },
    });
  });

  fastify.put("/v2/cost-controls", async (request, reply) => {
    const context = await requireStudioPermission(request, reply, "workspace.manage");
    if (!context) {
      return;
    }
    const body = parseBody<{
      siteId?: string | null;
      contentType?: string | null;
      period?: string;
      limitUsd?: number;
      hardLimitUsd?: number | null;
      action?: string;
      degradeModel?: string | null;
      enabled?: boolean;
    }>(request);
    if (!body.period || !["daily", "monthly"].includes(body.period)) {
      return badRequest(reply, `period must be one of: ${BUDGET_PERIODS.join(", ")}`);
    }
    if (typeof body.limitUsd !== "number" || !Number.isFinite(body.limitUsd) || body.limitUsd < 0) {
      return badRequest(reply, "limitUsd must be a non-negative number");
    }
    if (body.action && !["warn", "degrade", "delay", "pause"].includes(body.action)) {
      return badRequest(reply, `action must be one of: ${BUDGET_ACTIONS.join(", ")}`);
    }
    if (body.siteId && !isUuid(body.siteId)) {
      return badRequest(reply, "invalid siteId");
    }

    try {
      const budget = await upsertCostBudget(context.tenantId, {
        siteId: body.siteId ?? null,
        contentType: parseOptionalString(body.contentType) ?? null,
        period: body.period as "daily" | "monthly",
        limitUsd: body.limitUsd,
        hardLimitUsd: body.hardLimitUsd ?? undefined,
        action: (body.action ?? "warn") as "warn" | "degrade" | "delay" | "pause",
        degradeModel: parseOptionalString(body.degradeModel) ?? null,
        enabled: body.enabled,
      });
      return reply.send(budget);
    } catch (error) {
      return badRequest(reply, error instanceof Error ? error.message : String(error));
    }
  });

  fastify.delete("/v2/cost-controls/:id", async (request, reply) => {
    const context = await requireStudioPermission(request, reply, "workspace.manage");
    if (!context) {
      return;
    }
    const id = (request.params as { id: string }).id;
    if (!isUuid(id)) {
      return badRequest(reply, "invalid budget id");
    }
    const deleted = await deleteCostBudget(context.tenantId, id);
    if (!deleted) {
      return notFound(reply, "budget not found");
    }
    structuredEvent("cost.budget_deleted", { tenantId: context.tenantId, budgetId: id });
    return reply.send({ ok: true });
  });
}
