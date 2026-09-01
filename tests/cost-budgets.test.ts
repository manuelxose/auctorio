// Phase 5 — AI cost controls tests: budget specificity, hard/soft limit
// enforcement, spend ledger and degrade/warn/limit actions.

import test from "node:test";
import assert from "node:assert/strict";
import { getPrismaClient } from "../src/infrastructure/db/prisma";
import { sha256 } from "../src/shared/utils/hash";
import {
  deleteCostBudget,
  evaluateAiSpend,
  getAiSpend,
  listCostBudgets,
  pickMostSpecificBudget,
  recordAiSpend,
  upsertCostBudget,
  type BudgetRow,
} from "../src/studio/cost-budgets";

const prisma = getPrismaClient();

async function createTenant(): Promise<string> {
  const seed = `budget-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const tenant = await prisma.tenant.create({
    data: { name: seed, apiKeyHash: sha256(`${seed}-k`), status: "active" },
  });
  return tenant.id;
}

function row(overrides: Partial<BudgetRow>): BudgetRow {
  return {
    id: "row-1",
    siteId: null,
    contentType: null,
    period: "daily",
    limitUsd: 10,
    hardLimitUsd: 20,
    action: "warn",
    degradeModel: null,
    enabled: true,
    ...overrides,
  };
}

test("pickMostSpecificBudget prefers site+contentType over site over tenant default", () => {
  const rows = [
    row({ id: "tenant", siteId: null, contentType: null }),
    row({ id: "site", siteId: "site-1", contentType: null }),
    row({ id: "site-content", siteId: "site-1", contentType: "standard_news" }),
  ];
  assert.equal(pickMostSpecificBudget(rows, "site-1", "standard_news")?.id, "site-content");
  assert.equal(pickMostSpecificBudget(rows, "site-1", "list")?.id, "site");
  assert.equal(pickMostSpecificBudget(rows, "other-site", "standard_news")?.id, "tenant");
});

test("spend ledger aggregates per period", async () => {
  const tenantId = await createTenant();
  try {
    await recordAiSpend({ tenantId, kind: "generation", costUsd: 1.25, model: "m" });
    await recordAiSpend({ tenantId, kind: "image_generation", costUsd: 0.75, model: "i" });
    const daily = await getAiSpend(tenantId, { period: "daily" });
    assert.equal(daily.spentUsd, 2);
    assert.equal(daily.events, 2);
  } finally {
    await prisma.aiSpendEvent.deleteMany({ where: { tenantId } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
  }
});

test("hard limit blocks generation and notifies", async () => {
  const tenantId = await createTenant();
  try {
    await upsertCostBudget(tenantId, { period: "daily", limitUsd: 5, hardLimitUsd: 10, action: "warn" });
    await recordAiSpend({ tenantId, kind: "generation", costUsd: 9.5 });

    const decision = await evaluateAiSpend({ tenantId, estimatedCostUsd: 1 });
    assert.equal(decision.allowed, false);
    assert.equal(decision.hardExceeded, true);

    const notifications = await prisma.notification.count({ where: { tenantId, category: "operations" } });
    assert.ok(notifications >= 1, "budget breach must notify operators");
  } finally {
    await prisma.notification.deleteMany({ where: { tenantId } });
    await prisma.aiSpendEvent.deleteMany({ where: { tenantId } });
    await prisma.costBudget.deleteMany({ where: { tenantId } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
  }
});

test("soft limit with action=degrade returns a model override", async () => {
  const tenantId = await createTenant();
  try {
    await upsertCostBudget(tenantId, { period: "daily", limitUsd: 5, action: "degrade", degradeModel: "small-model" });
    await recordAiSpend({ tenantId, kind: "generation", costUsd: 4.5 });

    const decision = await evaluateAiSpend({ tenantId, estimatedCostUsd: 1 });
    assert.equal(decision.allowed, true);
    assert.equal(decision.action, "degrade");
    assert.equal(decision.modelOverride, "small-model");
    assert.equal(decision.softExceeded, true);
  } finally {
    await prisma.notification.deleteMany({ where: { tenantId } });
    await prisma.aiSpendEvent.deleteMany({ where: { tenantId } });
    await prisma.costBudget.deleteMany({ where: { tenantId } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
  }
});

test("soft limit with action=pause blocks generation", async () => {
  const tenantId = await createTenant();
  try {
    await upsertCostBudget(tenantId, { period: "daily", limitUsd: 3, action: "pause" });
    await recordAiSpend({ tenantId, kind: "generation", costUsd: 3.1 });

    const decision = await evaluateAiSpend({ tenantId, estimatedCostUsd: 0 });
    assert.equal(decision.allowed, false);
    assert.equal(decision.action, "pause");
  } finally {
    await prisma.notification.deleteMany({ where: { tenantId } });
    await prisma.aiSpendEvent.deleteMany({ where: { tenantId } });
    await prisma.costBudget.deleteMany({ where: { tenantId } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
  }
});

test("budget CRUD and validation", async () => {
  const tenantId = await createTenant();
  try {
    const created = await upsertCostBudget(tenantId, { period: "monthly", limitUsd: 100, hardLimitUsd: 200, action: "warn" });
    assert.equal(created.period, "monthly");

    // hard limit below soft limit must be rejected.
    await assert.rejects(
      upsertCostBudget(tenantId, { period: "monthly", limitUsd: 100, hardLimitUsd: 50, action: "warn" }),
      /hard_limit_below_soft_limit/,
    );

    const listed = await listCostBudgets(tenantId);
    assert.ok(listed.some((budget) => budget.id === created.id));
    assert.equal(await deleteCostBudget(tenantId, created.id), true);
    assert.equal(await deleteCostBudget(tenantId, created.id), false);
  } finally {
    await prisma.costBudget.deleteMany({ where: { tenantId } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
  }
});
