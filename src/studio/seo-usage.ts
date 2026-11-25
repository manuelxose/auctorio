// Counters of SEO requests that leave no ledger row: answers reused, joined or refused. Platform statistics, never a limit.

import { Prisma } from "@prisma/client";
import { getPrismaClient } from "../infrastructure/db/prisma";
import { structuredEvent } from "../shared/utils/logger";

const prisma = getPrismaClient();

export type SeoUsageScope = { tenantId: string; siteId: string | null; providerId: string; operation: string };

/** Adds to today's counters (UTC). A statistic that cannot be written never fails the request it counts. */
export async function countSeoUsage(scope: SeoUsageScope, counts: Record<string, number>): Promise<void> {
  const rows = Object.entries(counts).filter(([, count]) => count > 0);
  if (!rows.length) return;
  const day = new Date().toISOString().slice(0, 10);
  try {
    await prisma.$executeRaw`
      INSERT INTO seo_usage_daily AS u (day, tenant_id, site_key, provider_id, operation, metric, count)
      VALUES ${Prisma.join(rows.map(([metric, count]) => Prisma.sql`(${day}::date, ${scope.tenantId}::uuid, ${scope.siteId ?? ""}, ${scope.providerId}, ${scope.operation}, ${metric}, ${count})`))}
      ON CONFLICT (day, tenant_id, site_key, provider_id, operation, metric) DO UPDATE SET count = u.count + EXCLUDED.count`;
  } catch (error) {
    structuredEvent("seo.usage_not_counted", { ...scope, error: error instanceof Error ? error.message : String(error) }, "warn");
  }
}
