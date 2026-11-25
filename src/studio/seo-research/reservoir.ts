// The site's inventory of usable opportunities, on top of content_opportunities (SEO-V2-04): the lifecycle is derived from
// the stored statuses, so it cannot drift from them, and one article per opportunity is guaranteed by the database.

import { Prisma } from "@prisma/client";
import { getPrismaClient } from "../../infrastructure/db/prisma";
import { seoMarket } from "../../infrastructure/seo/contract";
import type { Evaluation } from "../seo-intelligence/attribution";
import type { OpportunityExplanation } from "../seo-intelligence/select";
import { MIN_CONFIDENCE } from "../seo-intelligence/scoring";
import { editorialCapacity } from "./profile";
import type { ResearchPolicy } from "./policy";
import { isKeywordVariant, keywordTokens } from "../keyword-candidates";
import { NEW_CONTENT } from "../plan-slots";

const prisma = getPrismaClient();
const DAY_MS = 86_400_000;
const sqlTime = (date: Date) => Prisma.sql`${date.toISOString().slice(0, 23)}::timestamp`;
// Serializes the reservations of one site between processes.
const RESERVOIR_LOCK = 846_205;
/** Longer than any plan generation; a lost one gives its keywords back by itself. */
const RESERVATION_MS = 60 * 60_000;
/** Provider evidence older than this needs to be checked again before it counts. */
export const EVIDENCE_MAX_DAYS = 120;

export const STAGES = [
  "discovered", "needs_validation", "qualified", "prioritized", "reserved", "scheduled", "published", "monitoring", "refresh_candidate", "rejected", "superseded",
] as const;
export type Stage = (typeof STAGES)[number];

/** Actions an article of the plan can carry out. */
export const PLANNABLE: readonly string[] = ["create_content", "strengthen_cluster"];
/** From this score, or once a person approved it, it goes first. */
const PRIORITY_SCORE = 70;

export type OpportunityEvidence = {
  firstParty?: { impressions: number; clicks: number; position: number | null; intent?: string | null } | null;
  provider?: { source: string; volume: number | null; difficulty: number | null; cpc?: number | null; intent: string | null; position?: number | null; asOf: string | null; at?: string | null } | null;
  origin?: { kind: string; value: string } | null;
  variants?: string[];
  serp?: { providerId: string; /** observed = live; historical = stored by the provider. */ dataKind?: string; asOf?: string | null; format?: string | null; at: string; domains: string[]; ownUrl: string | null; ownPosition: number | null } | null;
};

export type StageRow = {
  status: string;
  action: string | null;
  score: number | null;
  confidence: number | null;
  source: string;
  evidence: unknown;
  explanation?: unknown;
  analyzedAt: Date | null;
  planItemId: string | null;
  reservedUntil: Date | null;
  actions?: Array<{ actedAt: Date; evaluations: unknown }>;
};

const evidenceOf = (value: unknown): OpportunityEvidence => (value && typeof value === "object" && !Array.isArray(value) ? (value as OpportunityEvidence) : {});
export const evidenceDate = (evidence: unknown): Date | null => {
  const provider = evidenceOf(evidence).provider;
  const at = provider?.at ?? provider?.asOf ?? null;
  return at && Number.isFinite(Date.parse(at)) ? new Date(at) : null;
};

/** Stored by window. */
const evaluationsOf = (value: unknown): Evaluation[] => (value && typeof value === "object" ? (Object.values(value) as Evaluation[]).sort((a, b) => a.window - b.window) : []);

/** Where an opportunity is in its life. Pure. */
export function stageOf(row: StageRow, policy: Pick<ResearchPolicy, "minScore">, now = new Date()): Stage {
  if (row.status === "dismissed") return "rejected";
  if (row.status === "expired") return "superseded";
  if (row.status === "rejected") {
    const codes = ((row.explanation as OpportunityExplanation | null | undefined)?.safeguards ?? []).map((entry) => entry.code);
    return codes.includes("duplicate") || codes.includes("already_planned") ? "superseded" : "rejected";
  }
  if (row.status === "completed") {
    const action = row.actions?.[0];
    const last = evaluationsOf(action?.evaluations).at(-1);
    if (last?.outcome === "lower") return "refresh_candidate";
    return !last && action && now.getTime() - action.actedAt.getTime() < 28 * DAY_MS ? "published" : "monitoring";
  }
  if (row.status === "planned") return "scheduled";
  if (row.status === "monitoring") return "monitoring";
  if (row.reservedUntil && row.reservedUntil > now) return "reserved";
  if (row.status === "deferred") return "needs_validation";
  if (row.status === "approved") return "prioritized";
  if (row.score === null && !row.analyzedAt) return "discovered";
  const at = evidenceDate(row.evidence);
  const external = row.source === "provider" || row.source === "research";
  if (row.score === null || (row.confidence ?? MIN_CONFIDENCE) < MIN_CONFIDENCE || (external && (!at || now.getTime() - at.getTime() > EVIDENCE_MAX_DAYS * DAY_MS))) return "needs_validation";
  if (row.score < policy.minScore) return "discovered";
  return row.score >= PRIORITY_SCORE ? "prioritized" : "qualified";
}

/** Progressive enrichment already reached, 0 to 5. Pure. */
export function levelOf(row: StageRow): 0 | 1 | 2 | 3 | 4 | 5 {
  if (evaluationsOf(row.actions?.[0]?.evaluations).length) return 5;
  if (row.planItemId) return 4;
  const evidence = evidenceOf(row.evidence);
  if (evidence.serp) return 3;
  if (row.score !== null) return 2;
  return evidence.firstParty || evidence.provider?.volume != null || evidence.provider?.difficulty != null ? 1 : 0;
}

/**
 * Brings the inventory in line with the plans: an article that is gone gives its opportunity back, one a person rejected
 * takes it out. Opportunities outlive plans.
 */
export async function reconcileReservoir(tenantId: string, siteId: string): Promise<void> {
  await prisma.$executeRaw`
    UPDATE content_opportunities o SET status = 'open', decided_at = NULL, plan_item_id = NULL, updated_at = ${sqlTime(new Date())}
    WHERE o.tenant_id = ${tenantId}::uuid AND o.site_id = ${siteId}::uuid AND o.status = 'planned' AND o.plan_item_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM editorial_plan_items i WHERE i.id = o.plan_item_id AND i.status <> 'canceled')`;
  await prisma.$executeRaw`
    UPDATE content_opportunities o SET status = 'dismissed', updated_at = ${sqlTime(new Date())}
    FROM editorial_plan_items i
    WHERE o.tenant_id = ${tenantId}::uuid AND o.site_id = ${siteId}::uuid AND o.status = 'planned' AND i.id = o.plan_item_id AND i.status = 'rejected'`;
}

export const researchDedupeKey = (keyword: string, market: string) => `seo:research:${market}:${keywordTokens(keyword).join(" ")}`.slice(0, 500);

export type ReservoirCandidate = {
  keyword: string;
  /** Set when the inventory already has it. */
  opportunityId?: string;
  score: number;
  variants: string[];
  evidence: OpportunityEvidence;
};

/**
 * Puts candidates found by research into the inventory. An opportunity someone decided on, or is planning, is left alone;
 * a discarded one is not proposed again.
 */
export async function storeResearchOpportunities(tenantId: string, siteId: string, market: string, candidates: ReservoirCandidate[], runId: string | null, client: Prisma.TransactionClient | typeof prisma = prisma): Promise<Map<string, string>> {
  const ids = new Map<string, string>();
  for (const candidate of candidates) {
    if (candidate.opportunityId) {
      ids.set(candidate.keyword, candidate.opportunityId);
      continue;
    }
    const dedupeKey = researchDedupeKey(candidate.keyword, market);
    const provider = candidate.evidence.provider;
    const facts = {
      rationale: `Investigación: «${candidate.keyword}»${provider?.volume ? `, ${provider.volume} búsquedas al mes según el proveedor` : ", volumen desconocido"}${provider?.difficulty != null ? ` y dificultad ${provider.difficulty}` : ""}. Ninguna página tuya la cubre.`,
      evidence: candidate.evidence as unknown as Prisma.InputJsonObject,
    };
    const row = await client.contentOpportunity.upsert({
      where: { siteId_dedupeKey: { siteId, dedupeKey } },
      create: { tenantId, siteId, source: "research", kind: "researched_keyword", topic: candidate.keyword, query: candidate.keyword, dedupeKey, action: "create_content", market, researchRunId: runId, score: candidate.score, ...facts },
      update: {},
      select: { id: true, tenantId: true, decidedAt: true, evidence: true },
    });
    if (row.tenantId !== tenantId) continue;
    ids.set(candidate.keyword, row.id);
    const serp = evidenceOf(row.evidence).serp;
    if (!row.decidedAt) await client.contentOpportunity.updateMany({ where: { id: row.id, decidedAt: null }, data: { ...facts, evidence: { ...candidate.evidence, ...(serp ? { serp } : {}) } as unknown as Prisma.InputJsonObject } });
  }
  return ids;
}

/**
 * Reserves the best candidates for one plan generation. Under a lock of the site, and leaving out whatever another
 * generation holds or the plan already has (variants included): two workers never get the same article.
 */
export async function reserveForPlanning<T extends ReservoirCandidate>(input: { tenantId: string; siteId: string; market: string; holder: string; candidates: T[]; limit: number; now?: Date }): Promise<Array<T & { opportunityId: string }>> {
  const { tenantId, siteId, holder } = input;
  if (!input.candidates.length || input.limit <= 0) return [];
  const now = input.now ?? new Date();
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${RESERVOIR_LOCK}::int, hashtext(${siteId}))`;
    const [held, planned] = await Promise.all([
      tx.contentOpportunity.findMany({ where: { tenantId, siteId, reservedUntil: { gt: now }, reservedBy: { not: holder }, query: { not: null } }, select: { query: true } }),
      tx.editorialPlanItem.findMany({ where: { tenantId, siteId, primaryKeyword: { not: null }, status: { notIn: ["rejected", "canceled"] } }, select: { primaryKeyword: true }, orderBy: { createdAt: "desc" }, take: 5_000 }),
    ]);
    const taken = [...held.map((row) => row.query!), ...planned.map((row) => row.primaryKeyword!)];
    const free = input.candidates.filter((candidate) => !taken.some((query) => isKeywordVariant(query, candidate.keyword)));
    const ids = await storeResearchOpportunities(tenantId, siteId, input.market, free.slice(0, input.limit), null, tx);
    const wanted = [...ids.values()];
    if (!wanted.length) return [];
    const got = await tx.$queryRaw<Array<{ id: string }>>`
      UPDATE content_opportunities SET reserved_by = ${holder}::uuid, reserved_until = ${sqlTime(new Date(now.getTime() + RESERVATION_MS))}, updated_at = ${sqlTime(now)}
      WHERE id = ANY(${wanted}::uuid[]) AND tenant_id = ${tenantId}::uuid AND site_id = ${siteId}::uuid AND status IN ('open', 'approved') AND plan_item_id IS NULL
        AND (reserved_until IS NULL OR reserved_until <= ${sqlTime(now)} OR reserved_by = ${holder}::uuid)
      RETURNING id`;
    const mine = new Set(got.map((row) => row.id));
    return free.flatMap((candidate) => {
      const id = ids.get(candidate.keyword);
      return id && mine.has(id) ? [{ ...candidate, opportunityId: id }] : [];
    });
  }, { timeout: 60_000, maxWait: 20_000 });
}

/** The article exists: the opportunity is its. false when the reservation was lost meanwhile, and the article must not be created. */
export async function claimReserved(tx: Prisma.TransactionClient, input: { tenantId: string; siteId: string; holder: string; opportunityId: string; planItemId: string }): Promise<boolean> {
  const claimed = await tx.contentOpportunity.updateMany({
    where: { id: input.opportunityId, tenantId: input.tenantId, siteId: input.siteId, reservedBy: input.holder, status: { in: ["open", "approved"] }, planItemId: null },
    data: { status: "planned", decidedAt: new Date(), planItemId: input.planItemId, reservedBy: null, reservedUntil: null },
  });
  return claimed.count === 1;
}

export async function releaseReservations(tenantId: string, siteId: string, holder: string): Promise<void> {
  await prisma.contentOpportunity.updateMany({ where: { tenantId, siteId, reservedBy: holder }, data: { reservedBy: null, reservedUntil: null } });
}

/** A person chose these keywords for articles: their opportunities leave the inventory, reserved or not. */
export async function claimKeywords(tenantId: string, siteId: string, items: Array<{ keyword: string; planItemId: string }>): Promise<void> {
  if (!items.length) return;
  const rows = await prisma.contentOpportunity.findMany({ where: { tenantId, siteId, status: { in: ["open", "approved"] }, action: { in: [...PLANNABLE] }, query: { not: null }, planItemId: null }, select: { id: true, query: true } });
  for (const row of rows) {
    const key = keywordTokens(row.query!).join(" ");
    const item = items.find((entry) => keywordTokens(entry.keyword).join(" ") === key);
    if (item) await prisma.contentOpportunity.updateMany({ where: { id: row.id, status: { in: ["open", "approved"] }, planItemId: null }, data: { status: "planned", decidedAt: new Date(), planItemId: item.planItemId, reservedBy: null, reservedUntil: null } });
  }
}

/** The keyword of an article was replaced by a person: its opportunity was discarded. */
export async function dropClaim(tenantId: string, siteId: string, planItemId: string): Promise<void> {
  await prisma.contentOpportunity.updateMany({ where: { tenantId, siteId, planItemId, status: "planned" }, data: { status: "dismissed" } });
}

export type Coverage = {
  /** Usable for new articles now: qualified or prioritized, with a query, in the site's language. */
  available: number;
  /** Wanted to cover the target; a target, never a reason to lower the quality floor. */
  wanted: number;
  articlesPerWeek: number | null;
  rhythm: "settings" | "observed" | "unknown";
  /** Days of editorial activity the available ones cover; null when the rhythm is unknown. */
  days: number | null;
  /** Articles already scheduled ahead. */
  scheduledAhead: number;
  sufficient: boolean;
  needsReplenishment: boolean;
  confidence: number | null;
  stages: Record<Stage, number>;
  topics: Array<{ topic: string; available: number; pages: number }>;
  markets: Array<{ market: string; available: number }>;
  /** Age in days of the evidence behind the available ones. */
  freshness: { newest: number | null; oldest: number | null };
  /** Topics of the site without one available opportunity. */
  gaps: string[];
};

export async function reservoirCoverage(tenantId: string, siteId: string, policy: ResearchPolicy, topics: string[], now = new Date()): Promise<Coverage> {
  const [site, rows, clusters, capacity, scheduledAhead] = await Promise.all([
    prisma.site.findFirstOrThrow({ where: { id: siteId, tenantId }, select: { locale: true } }),
    prisma.contentOpportunity.findMany({
      where: { tenantId, siteId },
      select: { status: true, action: true, score: true, confidence: true, source: true, evidence: true, explanation: true, analyzedAt: true, planItemId: true, reservedUntil: true, query: true, market: true, actions: { select: { actedAt: true, evaluations: true } } },
    }),
    prisma.siteTopicCluster.findMany({ where: { tenantId, siteId }, select: { name: true, pagesCount: true } }),
    editorialCapacity(tenantId, siteId, now),
    prisma.editorialPlanItem.count({ where: { tenantId, siteId, channel: "website", scheduledFor: { gt: now }, status: { notIn: ["rejected", "canceled", "published"] }, ...NEW_CONTENT } }),
  ]);
  const stages = Object.fromEntries(STAGES.map((stage) => [stage, 0])) as Record<Stage, number>;
  const language = seoMarket(site.locale)?.language ?? site.locale;
  const markets = new Map<string, number>();
  const available: typeof rows = [];
  for (const row of rows) {
    const stage = stageOf(row, policy, now);
    stages[stage] += 1;
    if ((stage !== "qualified" && stage !== "prioritized") || !row.query || !PLANNABLE.includes(row.action ?? "")) continue;
    const market = row.market ?? site.locale;
    markets.set(market, (markets.get(market) ?? 0) + 1);
    if ((seoMarket(market)?.language ?? market) === language) available.push(row);
  }
  const perDay = capacity.articlesPerWeek ? capacity.articlesPerWeek / 7 : null;
  const days = perDay ? Math.floor(available.length / perDay) : null;
  const wanted = perDay ? Math.max(1, Math.ceil(perDay * policy.targetDays)) : policy.minOpportunities;
  const tokensOf = available.map((row) => keywordTokens(row.query!));
  const count = (topic: string) => {
    const words = keywordTokens(topic);
    return words.length ? tokensOf.filter((tokens) => words.every((word) => tokens.includes(word))).length : 0;
  };
  const pagesOf = new Map(clusters.map((cluster) => [cluster.name.toLowerCase(), cluster.pagesCount]));
  const named = [...new Set(topics)].slice(0, 40).map((topic) => ({ topic, available: count(topic), pages: pagesOf.get(topic.toLowerCase()) ?? 0 }));
  const ages = available.map((row) => evidenceDate(row.evidence) ?? row.analyzedAt).filter((at): at is Date => at !== null).map((at) => Math.max(0, Math.round((now.getTime() - at.getTime()) / DAY_MS)));
  return {
    available: available.length, wanted, articlesPerWeek: capacity.articlesPerWeek, rhythm: capacity.basis, days, scheduledAhead,
    sufficient: available.length >= wanted, needsReplenishment: days === null ? available.length < policy.minOpportunities : days < policy.replenishBelowDays,
    confidence: available.length ? Math.round(available.reduce((sum, row) => sum + (row.confidence ?? 0), 0) / available.length) : null,
    stages, topics: named, markets: [...markets].map(([market, value]) => ({ market, available: value })),
    freshness: { newest: ages.length ? Math.min(...ages) : null, oldest: ages.length ? Math.max(...ages) : null },
    gaps: named.filter((entry) => entry.available === 0).map((entry) => entry.topic),
  };
}
