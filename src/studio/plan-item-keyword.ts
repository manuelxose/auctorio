// Why a plan item has its keyword, and changing it before the article is written.

import { Prisma } from "@prisma/client";
import { getPrismaClient } from "../infrastructure/db/prisma";
import { normalizeKeyword } from "../infrastructure/seo/contract";
import { writeAudit } from "./audit";
import { PLAN_LEAD_TIME_MINUTES } from "./automation-mode";
import { resolveArticleTargets } from "./editorial-engine/structure";
import { readPlanItemSelection, type PlanItemSelection, type PlanResearch } from "./editorial-plan";
import { buildEditorialPlanningContext, type EditorialPlanningContext } from "./editorial-plan-context";
import { enrichPlanItemsWithKeywordMetrics } from "./keyword-metrics";
import { claimKeywords, dropClaim } from "./seo-research/reservoir";
import { keywordContentType, screenKeywords } from "./plan-keywords";
import { getSitePlanningSettings } from "./planning-settings";
import { registerSearchTargets } from "./site-intelligence";

const prisma = getPrismaClient();
const MAX_ALTERNATIVES = 20;
const MAX_HISTORY = 20;
const CHANGEABLE: Array<"proposed" | "approved"> = ["proposed", "approved"];

type KeywordChange = { from: string | null; to: string; at: string; userId: string | null };
type Item = Prisma.EditorialPlanItemGetPayload<Record<string, never>>;

const record = (value: unknown) => (value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {});
const historyOf = (metadata: unknown) => (Array.isArray(record(metadata).keywordHistory) ? (record(metadata).keywordHistory as KeywordChange[]) : []);

async function lockReason(item: Item): Promise<"has_article" | "being_written" | "closed" | null> {
  if (item.projectId) return "has_article";
  const job = await prisma.productionJob.findFirst({ where: { tenantId: item.tenantId, planItemId: item.id, status: { in: ["queued", "running", "needs_review", "ready"] } }, select: { id: true } });
  if (job || item.status === "generating" || item.status === "content_pending") return "being_written";
  return (CHANGEABLE as string[]).includes(item.status) ? null : "closed";
}

/** The item being changed must not count as "already planned" against its own replacement. */
function withoutItem(context: EditorialPlanningContext, item: Item): EditorialPlanningContext {
  const own = new Set([item.primaryKeyword, item.targetQuery, item.title, item.workingTitle].filter((value): value is string => Boolean(value)).map(normalizeKeyword));
  const others = (values: string[]) => values.filter((value) => !own.has(normalizeKeyword(value)));
  return { ...context, existingPlanQueries: others(context.existingPlanQueries), existingPlanTitles: others(context.existingPlanTitles), searchTargets: others(context.searchTargets) };
}

async function siteResearch(tenantId: string, siteId: string): Promise<PlanResearch[]> {
  const plans = await prisma.editorialPlan.findMany({ where: { tenantId, siteId, status: { in: ["ready", "partial", "generating"] } }, orderBy: { updatedAt: "desc" }, take: 6, select: { generatedOutput: true } });
  return plans
    .flatMap((plan) => ((plan.generatedOutput ?? {}) as { keywordResearch?: PlanResearch[] }).keywordResearch ?? [])
    .sort((a, b) => b.at.localeCompare(a.at));
}

/** Measured candidates nobody uses yet, best first. */
function freeCandidates(research: PlanResearch[], context: EditorialPlanningContext, item: Item): PlanResearch["candidates"] {
  const byKeyword = new Map<string, PlanResearch["candidates"][number]>();
  for (const candidate of research.flatMap((run) => run.candidates)) if (!byKeyword.has(candidate.keyword)) byKeyword.set(candidate.keyword, candidate);
  if (item.primaryKeyword) byKeyword.delete(normalizeKeyword(item.primaryKeyword));
  const kept = screenKeywords([...byKeyword.keys()], context).kept;
  return kept.map((keyword) => byKeyword.get(keyword)!).sort((a, b) => b.score - a.score).slice(0, MAX_ALTERNATIVES);
}

export async function getPlanItemSelection(tenantId: string, itemId: string) {
  const item = await prisma.editorialPlanItem.findFirst({ where: { id: itemId, tenantId }, include: { plan: { select: { id: true, name: true, status: true, generatedOutput: true } } } });
  if (!item) return null;
  const { plan, ...row } = item;
  const selection = readPlanItemSelection(row.metadata);
  const runs = ((plan.generatedOutput ?? {}) as { keywordResearch?: PlanResearch[] }).keywordResearch ?? [];
  const locked = row.siteId ? await lockReason(row) : "closed";
  let alternatives: PlanResearch["candidates"] = [];
  if (!locked && row.siteId) {
    const context = withoutItem(await buildEditorialPlanningContext(tenantId, row.siteId), row);
    alternatives = freeCandidates(await siteResearch(tenantId, row.siteId), context, row);
  }
  const history = historyOf(row.metadata);
  const userIds = history.map((entry) => entry.userId).filter((id): id is string => Boolean(id));
  const names = new Map((await prisma.studioUser.findMany({ where: { tenantId, id: { in: userIds } }, select: { id: true, displayName: true } })).map((user) => [user.id, user.displayName]));
  return {
    item: {
      id: row.id, title: row.title, primaryKeyword: row.primaryKeyword, secondaryKeywords: row.secondaryKeywords, scheduledFor: row.scheduledFor, status: row.status,
      searchVolume: row.searchVolume, keywordDifficulty: row.keywordDifficulty, keywordMetricsSource: row.keywordMetricsSource, keywordMetricsAt: row.keywordMetricsAt,
      opportunityScore: row.opportunityScore, relevanceScore: row.relevanceScore, cannibalizationRisk: row.cannibalizationRisk, rationale: row.rationale, angle: row.angle,
      topicCluster: row.topicCluster, contentType: row.contentType, primaryIntent: row.primaryIntent, sourceEvidence: row.sourceEvidence,
    },
    plan: { id: plan.id, name: plan.name, status: plan.status },
    selection,
    /** null for items planned before the research was stored. */
    research: runs.find((run) => run.id === selection?.researchId) ?? null,
    history: history.map((entry) => ({ from: entry.from, to: entry.to, at: entry.at, by: entry.userId ? names.get(entry.userId) ?? null : null })),
    lockedReason: locked,
    changeableUntil: row.scheduledFor ? new Date(row.scheduledFor.getTime() - PLAN_LEAD_TIME_MINUTES * 60_000).toISOString() : null,
    alternatives,
  };
}

/**
 * Changes the keyword in the item's own slot. The old keyword's brief goes with it: the new one is
 * filled in at drafting time, as with keywords added in the calendar.
 */
export async function changePlanItemKeyword(tenantId: string, itemId: string, rawKeyword: string, userId?: string | null) {
  const item = await prisma.editorialPlanItem.findFirst({ where: { id: itemId, tenantId } });
  if (!item || !item.siteId) throw new Error("editorial_plan_item_not_found");
  const locked = await lockReason(item);
  if (locked) throw new Error("editorial_plan_item_keyword_locked");
  const context = withoutItem(await buildEditorialPlanningContext(tenantId, item.siteId), item);
  const screen = screenKeywords([rawKeyword], context);
  if (!screen.kept.length) throw new Error(`editorial_plan_keyword_${screen.dropped[0]?.reason ?? "empty"}`);
  const keyword = screen.kept[0];
  if (normalizeKeyword(keyword) === normalizeKeyword(item.primaryKeyword ?? "")) throw new Error("editorial_plan_keyword_unchanged");

  const candidate = (await siteResearch(tenantId, item.siteId)).flatMap((run) => run.candidates.map((entry) => ({ ...entry, researchId: run.id }))).find((entry) => entry.keyword === normalizeKeyword(keyword)) ?? null;
  const type = keywordContentType(keyword);
  const words = resolveArticleTargets((await getSitePlanningSettings(tenantId, item.siteId)).articleTargets).words;
  const title = keyword.charAt(0).toUpperCase() + keyword.slice(1);
  const selection: PlanItemSelection = {
    source: "user",
    researchId: candidate?.researchId ?? null,
    score: candidate?.score ?? null,
    rank: candidate?.rank ?? null,
    intent: candidate?.intent ?? null,
    parts: candidate?.parts ?? null,
    origin: candidate?.origin ?? null,
  };
  const change: KeywordChange = { from: item.primaryKeyword, to: keyword, at: new Date().toISOString(), userId: userId ?? null };
  const none = Prisma.JsonNull;
  // Same conditions as the check above, inside the write: the automation may have started the article meanwhile.
  const changed = await prisma.editorialPlanItem.updateMany({
    where: { id: item.id, tenantId, projectId: null, status: { in: CHANGEABLE }, primaryKeyword: item.primaryKeyword },
    data: {
      title, workingTitle: title, finalSuggestedTitle: null, topic: keyword, primaryKeyword: keyword, targetQuery: keyword,
      secondaryKeywords: candidate?.variants.length ? candidate.variants : none,
      contentType: type.contentType, searchIntent: type.intent, primaryIntent: type.intent,
      recommendedWordCountMin: Math.round(words * 0.87), recommendedWordCountMax: Math.round(words * 1.13),
      searchVolume: null, keywordDifficulty: null, keywordMetricsSource: null, keywordMetricsAt: null,
      opportunityScore: candidate?.score ?? null,
      rationale: candidate ? "El equipo eligió esta palabra entre las candidatas medidas." : "El equipo escribió esta palabra.",
      metadata: { ...record(item.metadata), selection, keywordHistory: [...historyOf(item.metadata), change].slice(-MAX_HISTORY) } as unknown as Prisma.InputJsonObject,
      topicCluster: null, pillarPage: null, angle: null, editorialObjective: null, competitorAngle: null, funnelStage: null, suggestedSlug: null, seoTitle: null,
      metaDescription: null, socialHook: null, cta: null, imageConcept: null, imageRequirements: null, freshnessRequirement: null, difficultyEstimate: null,
      relevanceScore: null, cannibalizationRisk: null, confidence: null, newsOrEvergreen: null,
      semanticKeywords: none, relatedEntities: none, questionsToAnswer: none, secondaryIntents: none, suggestedInternalLinks: none, suggestedExternalEvidenceTypes: none,
      faqCandidates: none, schemaTypes: none, outline: none, sourceEvidence: none, suggestedHashtags: none,
    },
  });
  if (changed.count !== 1) throw new Error("editorial_plan_item_keyword_locked");

  // The inventory follows the person's choice: the old opportunity is discarded, the new one is this article's.
  await dropClaim(tenantId, item.siteId, item.id);
  await claimKeywords(tenantId, item.siteId, [{ keyword, planItemId: item.id }]);
  // Ordinary editing never buys data: only what is already stored.
  await enrichPlanItemsWithKeywordMetrics(tenantId, item.planId, undefined, { reuseOnly: true });
  // The old keyword stays registered on purpose: it was discarded by a person, so the plan does not propose it again.
  await registerSearchTargets(tenantId, item.siteId, [{ query: keyword, keyword, intent: type.intent }]);
  await writeAudit({ tenantId, actorType: userId ? "user" : "system", actorUserId: userId, action: "editorial_plan_item.keyword_changed", entityType: "editorial_plan_item", entityId: item.id, metadata: { planId: item.planId, from: change.from, to: keyword, measured: Boolean(candidate) } });
  return prisma.editorialPlanItem.findUniqueOrThrow({ where: { id: item.id } });
}
