// Observed totals of a site's pages, always filtered by tenant and site.

import { getPrismaClient } from "../../infrastructure/db/prisma";
import { day } from "../search-console";
import { pageKey, type PageTotals } from "./detect";

const prisma = getPrismaClient();

type PageAggregate = { page: string; clicks: number; impressions: number; position_sum: number; days: number };
const toTotals = (row: Omit<PageAggregate, "page">): PageTotals => ({ clicks: row.clicks, impressions: row.impressions, positionSum: row.position_sum, days: row.days });

/** Complete per-page totals of a window, by normalized URL. Both days included. */
export async function pageTotals(tenantId: string, siteId: string, from: Date, to: Date): Promise<Map<string, PageTotals>> {
  const rows = await prisma.$queryRaw<PageAggregate[]>`
    SELECT page, SUM(clicks)::int AS clicks, SUM(impressions)::int AS impressions, SUM(position_sum)::float8 AS position_sum, COUNT(DISTINCT date)::int AS days
    FROM search_performance WHERE tenant_id = ${tenantId}::uuid AND site_id = ${siteId}::uuid AND dataset = 'page' AND date BETWEEN ${day(from)}::date AND ${day(to)}::date
    GROUP BY page`;
  const out = new Map<string, PageTotals>();
  for (const row of rows) {
    const key = pageKey(row.page);
    const at = out.get(key);
    out.set(key, at ? { clicks: at.clicks + row.clicks, impressions: at.impressions + row.impressions, positionSum: at.positionSum + row.position_sum, days: Math.max(at.days, row.days) } : toTotals(row));
  }
  return out;
}

export async function siteTotals(tenantId: string, siteId: string, from: Date, to: Date): Promise<PageTotals> {
  const [row] = await prisma.$queryRaw<Array<Omit<PageAggregate, "page">>>`
    SELECT COALESCE(SUM(clicks), 0)::int AS clicks, COALESCE(SUM(impressions), 0)::int AS impressions, COALESCE(SUM(position_sum), 0)::float8 AS position_sum, COUNT(DISTINCT date)::int AS days
    FROM search_performance WHERE tenant_id = ${tenantId}::uuid AND site_id = ${siteId}::uuid AND dataset = 'site' AND date BETWEEN ${day(from)}::date AND ${day(to)}::date`;
  return toTotals(row);
}
