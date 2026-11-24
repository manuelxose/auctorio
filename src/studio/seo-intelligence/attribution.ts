// What was seen before and after an action. Observations with their uncertainty: a before-and-after comparison
// does not show that the action caused the change, and nothing here says so.

import { Prisma } from "@prisma/client";
import { getPrismaClient } from "../../infrastructure/db/prisma";
import { DAY_MS, addDays, day, fromDay } from "../search-console";
import { pageKey, type PageTotals } from "./detect";
import { pageTotals, siteTotals } from "./performance";
import { inHoldout } from "./select";

const prisma = getPrismaClient();
export const EVALUATION_WINDOWS = [28, 56, 90] as const;
const MIN_COHORT = 10;
const MIN_HOLDOUT = 5;
const MIN_COHORT_IMPRESSIONS = 100;

export type Figures = { clicks: number; impressions: number; position: number | null };
const figures = (totals: PageTotals | undefined): Figures => ({ clicks: totals?.clicks ?? 0, impressions: totals?.impressions ?? 0, position: totals?.impressions ? totals.positionSum / totals.impressions : null });
const ratio = (post: number, pre: number): number | null => (pre > 0 ? Math.round((post / pre) * 1000) / 1000 : null);
const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
};

export type Evaluation = {
  window: number;
  pre: Figures & { from: string; to: string };
  post: Figures & { from: string; to: string };
  change: { clicks: number; impressions: number; clicksRatio: number | null };
  site: { clicksRatio: number | null };
  /** Pages of the site nobody acted on, same dates. null = too few to compare. */
  cohort: { pages: number; medianClicksRatio: number; kind: "holdout" | "untouched" } | null;
  yearAgo: { pre: Figures; post: Figures; clicksRatio: number | null } | null;
  conversions: { value: null; status: "unavailable" };
  outcome: "higher" | "lower" | "no_clear_change" | "insufficient_data";
  causal: false;
  uncertainty: string[];
};

/** Pure: figures of one window into an evaluation. */
export function buildEvaluation(input: {
  window: number;
  ranges: { preFrom: string; preTo: string; postFrom: string; postTo: string };
  pre: PageTotals | undefined;
  post: PageTotals | undefined;
  site: { pre: PageTotals; post: PageTotals };
  cohort: Evaluation["cohort"];
  yearAgo: { pre: PageTotals | undefined; post: PageTotals | undefined } | null;
}): Evaluation {
  const pre = figures(input.pre);
  const post = figures(input.post);
  const siteRatio = ratio(input.site.post.clicks, input.site.pre.clicks);
  // Compared with pages that were not touched when there are enough; with the whole site otherwise.
  const reference = input.cohort?.medianClicksRatio ?? siteRatio ?? 1;
  const expected = pre.clicks * reference;
  const spread = Math.sqrt(post.clicks + pre.clicks * reference * reference);
  const outcome: Evaluation["outcome"] = pre.clicks + post.clicks < 30 ? "insufficient_data" : Math.abs(post.clicks - expected) < 2.6 * spread ? "no_clear_change" : post.clicks > expected ? "higher" : "lower";
  const yearRatio = input.yearAgo ? ratio(figures(input.yearAgo.post).clicks, figures(input.yearAgo.pre).clicks) : null;
  return {
    window: input.window,
    pre: { ...pre, from: input.ranges.preFrom, to: input.ranges.preTo },
    post: { ...post, from: input.ranges.postFrom, to: input.ranges.postTo },
    change: { clicks: post.clicks - pre.clicks, impressions: post.impressions - pre.impressions, clicksRatio: ratio(post.clicks, pre.clicks) },
    site: { clicksRatio: siteRatio },
    cohort: input.cohort,
    yearAgo: input.yearAgo ? { pre: figures(input.yearAgo.pre), post: figures(input.yearAgo.post), clicksRatio: yearRatio } : null,
    conversions: { value: null, status: "unavailable" },
    outcome,
    causal: false,
    uncertainty: [
      "Comparación antes y después: no demuestra que la acción sea la causa.",
      ...(input.cohort ? [] : ["Sin suficientes páginas comparables: se compara con todo el sitio."]),
      ...(input.yearAgo ? [] : ["Sin datos de hace un año: la estacionalidad no está descartada."]),
      ...(input.window === 28 ? ["28 días es pronto: Google puede tardar más en reflejar un cambio."] : []),
      ...(pre.clicks + post.clicks < 30 ? ["Muy pocos clics para distinguirlo del azar."] : []),
    ],
  };
}

async function stored(tenantId: string, siteId: string) {
  const row = await prisma.searchConsoleConnection.findFirst({ where: { tenantId, siteId }, select: { syncedFrom: true, syncedThrough: true } });
  return row?.syncedFrom && row.syncedThrough ? { from: row.syncedFrom, through: row.syncedThrough } : null;
}

export async function recordSeoAction(input: {
  tenantId: string; siteId: string; opportunityId: string; action: string; url: string; query: string | null; actedAt: Date;
  planItemId: string | null; publicationId: string | null; seoCostUsd: number | null; contentCostUsd: number | null;
}) {
  const acted = fromDay(day(input.actedAt));
  const range = await stored(input.tenantId, input.siteId);
  const baseline: Record<string, unknown> = {};
  for (const window of EVALUATION_WINDOWS) {
    const from = addDays(acted, -window);
    const to = addDays(acted, -1);
    // A window partly stored would understate what there was before.
    baseline[window] = range && range.from <= from && range.through >= to ? figures((await pageTotals(input.tenantId, input.siteId, from, to)).get(pageKey(input.url))) : null;
  }
  const data = { ...input, baseline: baseline as Prisma.InputJsonObject };
  // One action per opportunity: recording it twice keeps the first.
  return prisma.seoAction.upsert({ where: { opportunityId: input.opportunityId }, create: data, update: {} });
}

/** Planned opportunities whose article is already live become measurable actions. */
export async function linkPublishedActions(tenantId: string, siteId: string): Promise<number> {
  const planned = await prisma.contentOpportunity.findMany({ where: { tenantId, siteId, status: "planned", planItemId: { not: null }, actions: { none: {} } }, select: { id: true, action: true, kind: true, query: true, source: true, planItemId: true } });
  let linked = 0;
  for (const row of planned) {
    const item = await prisma.editorialPlanItem.findFirst({ where: { id: row.planItemId!, tenantId, siteId }, select: { projectId: true } });
    if (!item?.projectId) continue;
    const publication = await prisma.publication.findFirst({ where: { tenantId, siteId, projectId: item.projectId, channel: "website", status: "published", publishedAt: { not: null }, externalUrl: { not: null } }, orderBy: { publishedAt: "asc" } });
    if (!publication?.publishedAt || !publication.externalUrl) continue;
    const generations = await prisma.articleGeneration.findMany({ where: { tenantId, projectId: item.projectId, costUsd: { not: null } }, select: { costUsd: true } });
    await recordSeoAction({
      tenantId, siteId, opportunityId: row.id, action: row.action ?? "create_content", url: publication.externalUrl, query: row.query, actedAt: publication.publishedAt, planItemId: row.planItemId, publicationId: publication.id,
      // The ledger does not split a planning purchase between articles: unknown, unless only first-party data was used.
      seoCostUsd: row.source === "provider" ? null : 0,
      contentCostUsd: generations.length ? generations.reduce((sum, entry) => sum + (entry.costUsd ?? 0), 0) : null,
    });
    await prisma.contentOpportunity.update({ where: { id: row.id }, data: { status: "completed", decidedAt: new Date() } });
    linked += 1;
  }
  return linked;
}

/** Fills the windows that are already complete. A stored window is final. */
export async function evaluateActions(tenantId: string, siteId: string, now = new Date()): Promise<number> {
  const range = await stored(tenantId, siteId);
  if (!range) return 0;
  const [actions, settings] = await Promise.all([
    prisma.seoAction.findMany({ where: { tenantId, siteId, url: { not: null }, actedAt: { lte: now } } }),
    prisma.siteSeoProfile.findFirst({ where: { tenantId, siteId }, select: { holdoutPercent: true } }),
  ]);
  const touched = actions.map((action) => ({ key: pageKey(action.url!), at: action.actedAt.getTime() }));
  let filled = 0;
  for (const action of actions) {
    const evaluations = { ...((action.evaluations ?? {}) as Record<string, Evaluation>) };
    const acted = fromDay(day(action.actedAt));
    let changed = false;
    for (const window of EVALUATION_WINDOWS) {
      const preFrom = addDays(acted, -window);
      const postTo = addDays(acted, window);
      if (evaluations[window] || range.through < postTo || range.from > preFrom) continue;
      const preTo = addDays(acted, -1);
      const postFrom = addDays(acted, 1);
      const [pre, post, sitePre, sitePost] = await Promise.all([
        pageTotals(tenantId, siteId, preFrom, preTo), pageTotals(tenantId, siteId, postFrom, postTo), siteTotals(tenantId, siteId, preFrom, preTo), siteTotals(tenantId, siteId, postFrom, postTo),
      ]);
      const key = pageKey(action.url!);
      const busy = new Set(touched.filter((entry) => entry.key === key || Math.abs(entry.at - acted.getTime()) <= window * DAY_MS).map((entry) => entry.key));
      const comparable = [...pre].filter(([page, totals]) => !busy.has(page) && totals.impressions >= MIN_COHORT_IMPRESSIONS && totals.clicks > 0).map(([page, totals]) => ({ page, ratio: (post.get(page)?.clicks ?? 0) / totals.clicks }));
      const holdout = comparable.filter(({ page }) => inHoldout(page, settings?.holdoutPercent ?? 0));
      const group = holdout.length >= MIN_HOLDOUT ? holdout : comparable.length >= MIN_COHORT ? comparable : null;
      const year = range.from <= addDays(preFrom, -364)
        ? { pre: (await pageTotals(tenantId, siteId, addDays(preFrom, -364), addDays(preTo, -364))).get(key), post: (await pageTotals(tenantId, siteId, addDays(postFrom, -364), addDays(postTo, -364))).get(key) }
        : null;
      evaluations[window] = buildEvaluation({
        window, ranges: { preFrom: day(preFrom), preTo: day(preTo), postFrom: day(postFrom), postTo: day(postTo) }, pre: pre.get(key), post: post.get(key), site: { pre: sitePre, post: sitePost },
        cohort: group ? { pages: group.length, medianClicksRatio: Math.round(median(group.map((entry) => entry.ratio)) * 1000) / 1000, kind: group === holdout ? "holdout" : "untouched" } : null,
        yearAgo: year && (year.pre || year.post) ? year : null,
      });
      changed = true;
      filled += 1;
    }
    if (changed) await prisma.seoAction.update({ where: { id: action.id }, data: { evaluations: evaluations as unknown as Prisma.InputJsonObject } });
  }
  return filled;
}

/** Observed outcomes by action. Too few to change any weight: people read it, the engine does not learn from it on its own. */
export async function outcomeSummary(tenantId: string, siteId: string) {
  const actions = await prisma.seoAction.findMany({ where: { tenantId, siteId }, orderBy: { actedAt: "desc" }, take: 500, select: { action: true, evaluations: true, seoCostUsd: true, contentCostUsd: true } });
  const groups = new Map<string, { actions: number; evaluated: number; higher: number; lower: number; noClearChange: number; insufficientData: number }>();
  for (const action of actions) {
    const at = groups.get(action.action) ?? { actions: 0, evaluated: 0, higher: 0, lower: 0, noClearChange: 0, insufficientData: 0 };
    at.actions += 1;
    const last = [...EVALUATION_WINDOWS].reverse().map((window) => ((action.evaluations ?? {}) as Record<string, Evaluation>)[window]).find(Boolean);
    if (last) {
      at.evaluated += 1;
      if (last.outcome === "higher") at.higher += 1;
      else if (last.outcome === "lower") at.lower += 1;
      else if (last.outcome === "no_clear_change") at.noClearChange += 1;
      else at.insufficientData += 1;
    }
    groups.set(action.action, at);
  }
  const known = (values: Array<number | null>) => (values.some((value) => value === null) || !values.length ? null : values.reduce<number>((sum, value) => sum + (value ?? 0), 0));
  return {
    byAction: [...groups].map(([action, counts]) => ({ action, ...counts })),
    seoCostUsd: known(actions.map((action) => action.seoCostUsd)),
    contentCostUsd: known(actions.map((action) => action.contentCostUsd)),
    causal: false as const,
    weightsAdjusted: false as const,
    note: "Resultados observados, no causales. Los pesos de la puntuación no cambian solos.",
  };
}
