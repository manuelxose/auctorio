// Bulk keywords → plan items (M5 calendar "Add keywords"). Deterministic: the
// app screens duplicates and off-topic keywords; the brief is filled in at
// drafting time like any other plan item.

import { getPrismaClient } from "../infrastructure/db/prisma";
import { writeAudit } from "./audit";
import { buildEditorialPlanningContext, type EditorialPlanningContext } from "./editorial-plan-context";
import { titleTokenOverlap } from "./editorial-plan";
import { resolveArticleTargets } from "./editorial-engine/structure";
import { computePlanSlots, localDateInZone } from "./plan-slots";
import { getSitePlanningSettings } from "./planning-settings";
import { computeSiteRelevanceScore, syntheticProfileForSiteType } from "./site-relevance";
import { isKeywordVariant } from "./keyword-candidates";
import { enrichPlanItemsWithKeywordMetrics } from "./keyword-metrics";

const prisma = getPrismaClient();

export const MAX_PLAN_KEYWORDS = 50;
const LOOKAHEAD_DAYS = 120;

export type KeywordScreen = { kept: string[]; dropped: Array<{ keyword: string; reason: "duplicate" | "variant" | "already_planned" | "off_topic" }> };

const normalize = (value: string) => value.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();

/** The user chose the keyword: only the hard guardrails drop it, not the soft score threshold (short phrases score low). */
function isOffTopic(keyword: string, profile: Parameters<typeof computeSiteRelevanceScore>[1]): boolean {
  const verdict = computeSiteRelevanceScore({ topic: keyword, primaryKeyword: keyword, targetQuery: keyword, topicCluster: null, contentType: "guide", primaryIntent: "informational" } as never, profile, keyword);
  return verdict.rejected && verdict.reasons.some((reason) => reason.startsWith("off-topic") || reason.startsWith("excluded"));
}

export function screenKeywords(
  keywords: string[],
  context: Pick<EditorialPlanningContext, "profile" | "site" | "existingPlanQueries" | "existingPlanTitles" | "searchTargets">,
): KeywordScreen {
  const kept: string[] = [];
  const dropped: KeywordScreen["dropped"] = [];
  const planned = [...context.existingPlanQueries, ...context.existingPlanTitles, ...context.searchTargets];
  const profile = context.profile ?? syntheticProfileForSiteType(context.site.type);
  const seen = new Set<string>();
  for (const raw of keywords) {
    const keyword = raw.replace(/\s+/g, " ").trim();
    if (!keyword) continue;
    const key = normalize(keyword);
    if (seen.has(key)) {
      dropped.push({ keyword, reason: "duplicate" });
      continue;
    }
    seen.add(key);
    if (kept.some((head) => isKeywordVariant(head, keyword))) {
      // One article per topic: the variant becomes a secondary keyword of the first one.
      dropped.push({ keyword, reason: "variant" });
    } else if (planned.some((other) => normalize(other) === key || titleTokenOverlap(keyword, other) >= 0.75)) {
      dropped.push({ keyword, reason: "already_planned" });
    } else if (isOffTopic(keyword, profile)) {
      dropped.push({ keyword, reason: "off_topic" });
    } else {
      kept.push(keyword);
    }
  }
  return { kept, dropped };
}

/** BLG calendar type: list/ranking keywords become listicles, everything else an explainer (both use the guide template). */
export function keywordContentType(keyword: string): { contentType: "listicle" | "explainer"; intent: "informational" | "commercial-investigation" } {
  const folded = keyword.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const listicle = /^(top\s*\d+|\d+\s|los\s+\d+|las\s+\d+|mejores\b|best\b)|\b(ranking|mejores|top\s*\d+|alternativas|alternatives)\b/.test(folded);
  const commercial = /\b(mejor(es)?|precio|precios|comprar|barato|oferta|vs|comparativa|best|price|cheap|buy)\b/.test(folded);
  return { contentType: listicle ? "listicle" : "explainer", intent: commercial ? "commercial-investigation" : "informational" };
}

/** Turns up to 50 keywords into approved plan items in the site's next free publishing slots. */
export async function addPlanKeywords(tenantId: string, siteId: string, keywords: string[], userId?: string | null) {
  const context = await buildEditorialPlanningContext(tenantId, siteId);
  const screen = screenKeywords(keywords, context);
  if (!screen.kept.length) return { created: [] as Array<{ id: string; keyword: string; scheduledFor: Date }>, dropped: screen.dropped, unscheduled: [] as string[] };

  const settings = await getSitePlanningSettings(tenantId, siteId);
  const now = new Date();
  const dateFrom = localDateInZone(now, settings.timezone);
  const dateTo = localDateInZone(new Date(now.getTime() + LOOKAHEAD_DAYS * 86_400_000), settings.timezone);
  const slots = computePlanSlots({ dateFrom, dateTo, timezone: settings.timezone, articlesPerDay: settings.articlesPerDay, weekdays: settings.weekdays, publishTimes: settings.publishTimes, now });
  const taken = new Set(
    (await prisma.editorialPlanItem.findMany({
      where: { tenantId, siteId, channel: "website", status: { notIn: ["rejected", "canceled"] }, scheduledFor: { gte: now } },
      select: { scheduledFor: true },
    })).map((item) => item.scheduledFor?.getTime()),
  );
  const free = slots.filter((slot) => !taken.has(slot.scheduledFor.getTime()));
  const placed = screen.kept.slice(0, free.length);
  const unscheduled = screen.kept.slice(free.length);
  if (!placed.length) return { created: [], dropped: screen.dropped, unscheduled };

  const plan = (await prisma.editorialPlan.findFirst({ where: { tenantId, siteId, status: { not: "archived" }, name: "Your keywords" }, orderBy: { createdAt: "desc" } }))
    ?? (await prisma.editorialPlan.create({
      data: { tenantId, siteId, name: "Your keywords", status: "ready", dateFrom: now, dateTo: free[placed.length - 1].scheduledFor, timezone: settings.timezone, channels: ["website"] },
    }));
  const lastSlot = free[placed.length - 1].scheduledFor;
  if (lastSlot > plan.dateTo) await prisma.editorialPlan.update({ where: { id: plan.id }, data: { dateTo: lastSlot } });

  const words = resolveArticleTargets(settings.articleTargets).words;
  const variantsOf = (keyword: string) => screen.dropped.filter((entry) => entry.reason === "variant" && isKeywordVariant(keyword, entry.keyword)).map((entry) => entry.keyword);
  const created = await prisma.$transaction(
    placed.map((keyword, index) =>
      prisma.editorialPlanItem.create({
        data: {
          tenantId,
          planId: plan.id,
          siteId,
          channel: "website",
          scheduledFor: free[index].scheduledFor,
          title: keyword.charAt(0).toUpperCase() + keyword.slice(1),
          workingTitle: keyword.charAt(0).toUpperCase() + keyword.slice(1),
          topic: keyword,
          primaryKeyword: keyword,
          secondaryKeywords: variantsOf(keyword).length ? variantsOf(keyword) : undefined,
          targetQuery: keyword,
          contentType: keywordContentType(keyword).contentType,
          searchIntent: keywordContentType(keyword).intent,
          primaryIntent: keywordContentType(keyword).intent,
          recommendedWordCountMin: Math.round(words * 0.87),
          recommendedWordCountMax: Math.round(words * 1.13),
          rationale: "You added this keyword to the calendar.",
          status: "approved",
          approvalStatus: "approved",
          metadata: { origin: "keywords" },
        },
        select: { id: true, primaryKeyword: true, scheduledFor: true },
      }),
    ),
  );
  // Measured volume + difficulty for the new items (no-op without an SEO provider; never blocks).
  await enrichPlanItemsWithKeywordMetrics(tenantId, plan.id);
  await writeAudit({ tenantId, actorType: userId ? "user" : "system", actorUserId: userId, action: "editorial_plan_items.keywords_added", entityType: "site", entityId: siteId, metadata: { planId: plan.id, created: created.length, dropped: screen.dropped.length, unscheduled: unscheduled.length } });
  return { created: created.map((item) => ({ id: item.id, keyword: item.primaryKeyword ?? "", scheduledFor: item.scheduledFor! })), dropped: screen.dropped, unscheduled };
}
