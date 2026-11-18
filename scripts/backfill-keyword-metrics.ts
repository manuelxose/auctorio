// One-off: measure DataForSEO volume + difficulty for plan items created before keyword metrics existed.
// Run: node --env-file=.env node_modules/ts-node/dist/bin.js scripts/backfill-keyword-metrics.ts
// Safe to re-run: items already checked (keywordMetricsSource set) are skipped; keywords are cached 30 days.

import { getPrismaClient } from "../src/infrastructure/db/prisma";
import { dataForSeoConfigured } from "../src/infrastructure/seo/dataforseo";
import { enrichPlanItemsWithKeywordMetrics } from "../src/studio/keyword-metrics";

async function main(): Promise<void> {
  const prisma = getPrismaClient();
  try {
    if (!dataForSeoConfigured()) {
      console.error("DATAFORSEO_LOGIN / DATAFORSEO_PASSWORD are not set; nothing measured.");
      process.exitCode = 1;
      return;
    }
    const plans = await prisma.editorialPlanItem.groupBy({
      by: ["tenantId", "planId"],
      where: { primaryKeyword: { not: null }, keywordMetricsSource: null },
      _count: { _all: true },
    });
    let measured = 0;
    for (const plan of plans) measured += await enrichPlanItemsWithKeywordMetrics(plan.tenantId, plan.planId);
    const pending = plans.reduce((sum, plan) => sum + plan._count._all, 0);
    console.log(`plans: ${plans.length}, items pending: ${pending}, items measured: ${measured}`);
  } finally {
    await prisma.$disconnect();
  }
}

void main();
