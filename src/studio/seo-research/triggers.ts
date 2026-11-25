// When more knowledge is worth acquiring. Reads stored data only.

import { getPrismaClient } from "../../infrastructure/db/prisma";
import { normalizeDomain, normalizeKeyword } from "../../infrastructure/seo/contract";
import { keywordTokens } from "../keyword-candidates";
import { addDays } from "../search-console";
import { siteTotals } from "../seo-intelligence/performance";
import { SEO_RESEARCH_DONE, type ResearchTrigger } from "./policy";
import type { ResearchProfile } from "./profile";
import { EVIDENCE_MAX_DAYS, evidenceDate, type Coverage } from "./reservoir";

const prisma = getPrismaClient();
const DAY_MS = 86_400_000;

/** What a run must look at even when there are enough opportunities. */
export type ResearchFocus = { topics?: string[]; competitorIds?: string[]; market?: string; keywords?: string[] };
export type TriggerDecision = { trigger: ResearchTrigger; triggerKey: string | null; detail: string; focus: ResearchFocus };

const slug = (value: string) => keywordTokens(value).join("-").slice(0, 80);
/** Change of the site's impressions that is worth looking at, and the least traffic it needs. */
const CHANGE = { up: 1.5, down: 0.6, minImpressions: 500 };
/** Content for a season has to exist before it starts. */
const SEASON_DAYS = { from: 21, to: 75 };

/** Pure: the next time a yearly date comes. */
export function nextOccurrence(month: number, day: number, now: Date): Date {
  const at = new Date(Date.UTC(now.getUTCFullYear(), month - 1, day));
  return at.getTime() >= now.getTime() ? at : new Date(Date.UTC(now.getUTCFullYear() + 1, month - 1, day));
}

/** Every justified reason, most specific first. A new calendar month is not one. */
export async function evaluateTriggers(tenantId: string, siteId: string, profile: ResearchProfile, coverage: Coverage, now = new Date()): Promise<TriggerDecision[]> {
  const { policy } = profile;
  const [runs, tasks, competitors, approved, connection] = await Promise.all([
    prisma.seoResearchRun.findMany({ where: { tenantId, siteId }, select: { trigger: true, triggerKey: true, status: true, finishedAt: true }, orderBy: { createdAt: "desc" }, take: 500 }),
    prisma.seoResearchTask.findMany({ where: { tenantId, siteId, status: "succeeded", kind: { in: ["discover_seed", "competitor_keywords"] } }, select: { kind: true, subject: true, market: true }, take: 5_000 }),
    prisma.competitor.findMany({ where: { tenantId, siteId, status: "accepted", verification: "verified" }, select: { id: true, domain: true }, take: 50 }),
    prisma.contentOpportunity.findMany({ where: { tenantId, siteId, status: "approved", source: { in: ["research", "provider"] }, query: { not: null } }, select: { id: true, query: true, evidence: true }, take: 100 }),
    prisma.searchConsoleConnection.findFirst({ where: { tenantId, siteId }, select: { syncedThrough: true, syncedFrom: true } }),
  ]);
  const keys = new Set(runs.map((run) => run.triggerKey));
  const done = runs.filter((run) => (SEO_RESEARCH_DONE as readonly string[]).includes(run.status));
  const researched = (kind: string, subject: string, market?: string) => tasks.some((task) => task.kind === kind && task.subject === subject && (!market || task.market === market));
  const out: TriggerDecision[] = [];
  const add = (decision: TriggerDecision) => {
    if (decision.triggerKey === null || !keys.has(decision.triggerKey)) out.push(decision);
  };

  // Before the first research everything is new: that is onboarding, or a lack of opportunities, not news.
  if (done.length) {
    const [primary, ...others] = profile.markets.value ?? [];
    for (const market of others) if (!tasks.some((task) => task.market === market)) add({ trigger: "new_market", triggerKey: `market:${market}`, detail: `Mercado nuevo en el perfil: ${market}.`, focus: { market } });
    if (profile.topics.source === "corrected" || profile.topics.source === "approved") {
      const topics = (profile.topics.value ?? []).map(normalizeKeyword).filter((topic) => topic && !researched("discover_seed", topic, primary) && coverage.gaps.some((gap) => normalizeKeyword(gap) === topic) && !keys.has(`topic:${slug(topic)}`));
      if (topics.length) add({ trigger: "new_topic", triggerKey: `topic:${slug(topics[0])}`, detail: `Tema del negocio sin investigar ni oportunidades: ${topics[0]}.`, focus: { topics: topics.slice(0, 1) } });
    }
    const competitor = competitors.find((entry) => !researched("competitor_keywords", normalizeDomain(entry.domain)) && !keys.has(`competitor:${entry.id}`));
    if (competitor) add({ trigger: "competitor_opportunity", triggerKey: `competitor:${competitor.id}`, detail: `Competidor aceptado y verificado sin investigar: ${competitor.domain}.`, focus: { competitorIds: [competitor.id] } });
  }

  for (const event of profile.seasonalEvents.value ?? []) {
    const at = nextOccurrence(event.month, event.day, now);
    const days = (at.getTime() - now.getTime()) / DAY_MS;
    if (days >= SEASON_DAYS.from && days <= SEASON_DAYS.to) add({ trigger: "seasonal_event", triggerKey: `season:${slug(event.name)}:${at.getUTCFullYear()}`, detail: `«${event.name}» empieza el ${at.toISOString().slice(0, 10)}.`, focus: { topics: (event.topics.length ? event.topics : [event.name]).map(normalizeKeyword) } });
  }

  const { syncedThrough: through, syncedFrom: from } = connection ?? {};
  const recentChange = runs.some((run) => run.trigger === "performance_change" && (!run.finishedAt || now.getTime() - run.finishedAt.getTime() < 28 * DAY_MS));
  if (through && from && from <= addDays(through, -55) && !recentChange) {
    const [current, previous] = await Promise.all([siteTotals(tenantId, siteId, addDays(through, -27), through), siteTotals(tenantId, siteId, addDays(through, -55), addDays(through, -28))]);
    const ratio = previous.impressions ? current.impressions / previous.impressions : null;
    if (ratio !== null && Math.max(current.impressions, previous.impressions) >= CHANGE.minImpressions && (ratio >= CHANGE.up || ratio <= CHANGE.down)) {
      add({ trigger: "performance_change", triggerKey: `performance:${ratio >= CHANGE.up ? "up" : "down"}:${through.toISOString().slice(0, 10)}`, detail: `Las impresiones propias han cambiado ×${Math.round(ratio * 100) / 100} en 28 días.`, focus: {} });
    }
  }

  const stale = approved.filter((row) => {
    const at = evidenceDate(row.evidence);
    return !at || now.getTime() - at.getTime() > EVIDENCE_MAX_DAYS * DAY_MS;
  });
  if (stale.length) add({ trigger: "stale_evidence", triggerKey: `evidence:${stale[0].id}`, detail: `${stale.length} oportunidad(es) aprobadas esperan con datos de hace más de ${EVIDENCE_MAX_DAYS} días.`, focus: { keywords: stale.slice(0, 50).map((row) => row.query!) } });

  // Lack of opportunities last: the reasons above usually bring some. Not again until the last attempt is old enough.
  const last = done.find((run) => run.trigger !== "performance_change" && run.trigger !== "stale_evidence")?.finishedAt;
  if (coverage.needsReplenishment && (!last || now.getTime() - last.getTime() >= policy.cooldownDays * DAY_MS)) {
    add({ trigger: "insufficient_opportunities", triggerKey: null, detail: coverage.days === null ? `${coverage.available} oportunidades de calidad, menos de las ${policy.minOpportunities} previstas.` : `Las oportunidades de calidad cubren ${coverage.days} días, menos de los ${policy.replenishBelowDays} fijados.`, focus: {} });
  }
  return out;
}
