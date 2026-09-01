// Phase 5 — AI cost controls (budgets + spend ledger + enforcement).
//
// Budgets are rows in cost_budgets keyed by (tenantId, siteId, contentType,
// period). Enforcement actions: warn → degrade → delay → pause. A hard limit
// is never exceeded silently: evaluateAiSpend returns allowed=false whenever
// the estimated spend would cross hardLimitUsd.
//
// Spend is recorded append-only in ai_spend_events from the sites that know
// a real cost: worker-text (legacy content pipeline), the editorial-engine
// orchestrator (article generation) and worker-image.

import { getPrismaClient } from "../infrastructure/db/prisma";
import { structuredEvent } from "../shared/utils/logger";
import { notify } from "./notifications";

const prisma = getPrismaClient();

export type BudgetAction = "warn" | "degrade" | "delay" | "pause";

export type AiSpendInput = {
  tenantId: string;
  siteId?: string | null;
  contentType?: string | null;
  kind: string;
  provider?: string | null;
  model?: string | null;
  costUsd: number;
  tokensInput?: number | null;
  tokensOutput?: number | null;
};

export type BudgetDecision = {
  allowed: boolean;
  action: BudgetAction;
  /** Degraded model when action === "degrade". */
  modelOverride?: string;
  hardExceeded: boolean;
  softExceeded: boolean;
  spentUsd: number;
  limitUsd: number;
  reason: string;
};

export type BudgetRow = {
  id: string;
  siteId: string | null;
  contentType: string | null;
  period: string;
  limitUsd: number;
  hardLimitUsd: number | null;
  action: string;
  degradeModel: string | null;
  enabled: boolean;
};

function periodStart(period: string, now = new Date()): Date {
  if (period === "monthly") {
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  }
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/** Most specific budget wins: site+contentType > site > contentType > tenant default. */
export function pickMostSpecificBudget(
  rows: BudgetRow[],
  siteId: string | null | undefined,
  contentType: string | null | undefined,
): BudgetRow | null {
  const scored = rows
    .filter((row) => row.enabled)
    .map((row) => {
      let score = 0;
      if (row.siteId && row.siteId === siteId) {
        score += 4;
      } else if (row.siteId) {
        return null;
      }
      if (row.contentType && row.contentType === contentType) {
        score += 2;
      } else if (row.contentType) {
        return null;
      }
      return { row, score };
    })
    .filter((entry): entry is { row: BudgetRow; score: number } => entry !== null)
    .sort((a, b) => b.score - a.score);
  return scored[0]?.row ?? null;
}

export async function recordAiSpend(input: AiSpendInput): Promise<void> {
  if (!Number.isFinite(input.costUsd) || input.costUsd < 0) {
    structuredEvent("cost.record_skipped", { tenantId: input.tenantId, reason: "invalid cost" }, "warn");
    return;
  }
  await prisma.aiSpendEvent.create({
    data: {
      tenantId: input.tenantId,
      siteId: input.siteId ?? null,
      contentType: input.contentType ?? null,
      kind: input.kind,
      provider: input.provider ?? null,
      model: input.model ?? null,
      costUsd: input.costUsd,
      tokensInput: input.tokensInput ?? null,
      tokensOutput: input.tokensOutput ?? null,
    },
  });
  structuredEvent("cost.spend_recorded", {
    tenantId: input.tenantId,
    kind: input.kind,
    contentType: input.contentType ?? null,
    costUsd: input.costUsd,
  });
}

export async function getAiSpend(
  tenantId: string,
  input: { siteId?: string | null; period?: "daily" | "monthly"; since?: Date } = {},
): Promise<{ spentUsd: number; events: number }> {
  const since = input.since ?? periodStart(input.period ?? "daily");
  const aggregate = await prisma.aiSpendEvent.aggregate({
    where: {
      tenantId,
      createdAt: { gte: since },
      ...(input.siteId ? { siteId: input.siteId } : {}),
    },
    _sum: { costUsd: true },
    _count: { _all: true },
  });
  return {
    spentUsd: aggregate._sum.costUsd ?? 0,
    events: aggregate._count._all,
  };
}

export async function listCostBudgets(tenantId: string): Promise<BudgetRow[]> {
  const rows = await prisma.costBudget.findMany({
    where: { tenantId },
    orderBy: [{ period: "asc" }, { siteId: "asc" }],
  });
  return rows.map((row) => ({
    id: row.id,
    siteId: row.siteId,
    contentType: row.contentType,
    period: row.period,
    limitUsd: row.limitUsd,
    hardLimitUsd: row.hardLimitUsd,
    action: row.action,
    degradeModel: row.degradeModel,
    enabled: row.enabled,
  }));
}

export async function upsertCostBudget(
  tenantId: string,
  input: {
    siteId?: string | null;
    contentType?: string | null;
    period: "daily" | "monthly";
    limitUsd: number;
    hardLimitUsd?: number | null;
    action: BudgetAction;
    degradeModel?: string | null;
    enabled?: boolean;
  },
): Promise<BudgetRow> {
  if (!Number.isFinite(input.limitUsd) || input.limitUsd < 0) {
    throw new Error("invalid_limit_usd");
  }
  if (input.hardLimitUsd !== undefined && input.hardLimitUsd !== null && input.hardLimitUsd < input.limitUsd) {
    throw new Error("hard_limit_below_soft_limit");
  }
  const existing = await prisma.costBudget.findFirst({
    where: {
      tenantId,
      siteId: input.siteId ?? null,
      contentType: input.contentType ?? null,
      period: input.period,
    },
  });
  const row = existing
    ? await prisma.costBudget.update({
        where: { id: existing.id },
        data: {
          limitUsd: input.limitUsd,
          hardLimitUsd: input.hardLimitUsd ?? existing.hardLimitUsd,
          action: input.action,
          degradeModel: input.degradeModel ?? null,
          enabled: input.enabled ?? existing.enabled,
        },
      })
    : await prisma.costBudget.create({
        data: {
          tenantId,
          siteId: input.siteId ?? null,
          contentType: input.contentType ?? null,
          period: input.period,
          limitUsd: input.limitUsd,
          hardLimitUsd: input.hardLimitUsd ?? null,
          action: input.action,
          degradeModel: input.degradeModel ?? null,
          enabled: input.enabled ?? true,
        },
      });
  structuredEvent("cost.budget_updated", { tenantId, budgetId: row.id, action: row.action, limitUsd: row.limitUsd });
  return {
    id: row.id,
    siteId: row.siteId,
    contentType: row.contentType,
    period: row.period,
    limitUsd: row.limitUsd,
    hardLimitUsd: row.hardLimitUsd,
    action: row.action,
    degradeModel: row.degradeModel,
    enabled: row.enabled,
  };
}

export async function deleteCostBudget(tenantId: string, budgetId: string): Promise<boolean> {
  const existing = await prisma.costBudget.findFirst({ where: { id: budgetId, tenantId } });
  if (!existing) {
    return false;
  }
  await prisma.costBudget.delete({ where: { id: existing.id } });
  return true;
}

/** Evaluate budgets before an AI call. Never throw; returns a decision. */
export async function evaluateAiSpend(input: {
  tenantId: string;
  siteId?: string | null;
  contentType?: string | null;
  kind?: string;
  estimatedCostUsd?: number;
}): Promise<BudgetDecision> {
  const periods: Array<"daily" | "monthly"> = ["daily", "monthly"];
  for (const period of periods) {
    const rows = await prisma.costBudget.findMany({
      where: {
        tenantId: input.tenantId,
        period,
        enabled: true,
      },
    });
    if (rows.length === 0) {
      continue;
    }
    const row = pickMostSpecificBudget(
      rows.map((r) => ({
        id: r.id,
        siteId: r.siteId,
        contentType: r.contentType,
        period: r.period,
        limitUsd: r.limitUsd,
        hardLimitUsd: r.hardLimitUsd,
        action: r.action,
        degradeModel: r.degradeModel,
        enabled: r.enabled,
      })),
      input.siteId,
      input.contentType,
    );
    if (!row) {
      continue;
    }

    const { spentUsd } = await getAiSpend(input.tenantId, {
      siteId: row.siteId,
      period,
    });
    const projected = spentUsd + (input.estimatedCostUsd ?? 0);
    const hard = row.hardLimitUsd ?? row.limitUsd * 2;

    if (projected > hard) {
      await notifyBudgetEvent(input, row, spentUsd, "hard");
      return {
        allowed: false,
        action: "pause",
        hardExceeded: true,
        softExceeded: projected > row.limitUsd,
        spentUsd,
        limitUsd: hard,
        reason: `ai budget hard limit reached (period=${period}, spent=${spentUsd.toFixed(4)}, hard=${hard.toFixed(4)})`,
      };
    }

    if (projected > row.limitUsd) {
      await notifyBudgetEvent(input, row, spentUsd, "soft");
      if (row.action === "pause") {
        return {
          allowed: false,
          action: "pause",
          hardExceeded: false,
          softExceeded: true,
          spentUsd,
          limitUsd: row.limitUsd,
          reason: `ai budget limit reached and action=pause (period=${period}, limit=${row.limitUsd})`,
        };
      }
      if (row.action === "degrade") {
        return {
          allowed: true,
          action: "degrade",
          modelOverride: row.degradeModel ?? undefined,
          hardExceeded: false,
          softExceeded: true,
          spentUsd,
          limitUsd: row.limitUsd,
          reason: `ai budget limit reached; degrading model (period=${period})`,
        };
      }
      if (row.action === "delay") {
        return {
          allowed: false,
          action: "delay",
          hardExceeded: false,
          softExceeded: true,
          spentUsd,
          limitUsd: row.limitUsd,
          reason: `ai budget limit reached and action=delay (period=${period})`,
        };
      }
      // warn → allow and warn
    }
  }

  return {
    allowed: true,
    action: "warn",
    hardExceeded: false,
    softExceeded: false,
    spentUsd: 0,
    limitUsd: 0,
    reason: "within budget",
  };
}

async function notifyBudgetEvent(
  input: { tenantId: string; siteId?: string | null },
  row: { period: string; limitUsd: number; action: string },
  spentUsd: number,
  level: "hard" | "soft",
): Promise<void> {
  await notify({
    tenantId: input.tenantId,
    siteId: input.siteId ?? null,
    category: "operations",
    severity: level === "hard" ? "error" : "warning",
    title: level === "hard" ? "AI budget hard limit reached" : "AI budget limit reached",
    message: `${level === "hard" ? "Generation paused" : `Action: ${row.action}`} — ${row.period} limit $${row.limitUsd.toFixed(2)}, spent $${spentUsd.toFixed(2)}.`,
    entityType: "cost_budget",
    actionUrl: "/studio/operations",
    dedupeKey: `cost.budget.${input.tenantId}.${input.siteId ?? "all"}.${row.period}.${level}`,
    dedupeWindowMs: 24 * 60 * 60_000,
  });
}
