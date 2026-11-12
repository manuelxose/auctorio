// Structured assistant tools.
//
// READ tools compute their answer from tenant data on the server; nothing is
// left for a model to invent. WRITE tools never run when chosen: `prepare`
// validates the arguments against the tenant and produces a human summary,
// the operator confirms it, and only then `execute` calls the real service.

import { Prisma } from "@prisma/client";
import { getPrismaClient } from "../../infrastructure/db/prisma";
import { enqueueFillMissingSlots, enqueueRegeneratePlanItem, titleTokenOverlap, updateEditorialPlanItem } from "../editorial-plan";
import type { StudioPermission } from "../security";
import { type AssistantContext, evidenceCount, strings, unfilledSlotsOf } from "./assistant-context";
import { CopilotError } from "./errors";

const prisma = getPrismaClient();

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const INACTIVE = new Set(["rejected", "canceled"]);

export type ToolLink = { label: string; path: string };
export type ToolFinding = { severity: "high" | "medium" | "low"; message: string };
export type ToolArgs = Record<string, unknown>;

export type ReadResult = {
  content: string;
  findings?: ToolFinding[];
  sources?: ToolLink[];
  /** Write actions the answer offers; each becomes a pending action the operator confirms. */
  offers?: Array<{ tool: WriteToolName; args: ToolArgs }>;
};

export type ExecuteResult = { result: Record<string, unknown>; links: ToolLink[] };

type Base = { label: string; description: string; permission: StudioPermission; needs: string };
export type ReadTool = Base & { kind: "read"; run(ctx: AssistantContext, args: ToolArgs): Promise<ReadResult> };
export type WriteTool = Base & {
  kind: "write";
  prepare(ctx: AssistantContext, args: ToolArgs): Promise<{ args: ToolArgs; summary: string }>;
  execute(tenantId: string, userId: string, args: ToolArgs): Promise<ExecuteResult>;
};

const planPath = (planId: string, itemId?: string | null) => `/studio/editorial-plan?plan=${planId}${itemId ? `&item=${itemId}` : ""}`;
const operationPath = (operationId: string) => `/studio/activity?operation=${operationId}`;

function optionalId(args: ToolArgs, key: string, fallback: string | null | undefined): string | null {
  const value = args[key] ?? fallback ?? null;
  if (value === null || value === "") return null;
  if (typeof value !== "string" || !UUID.test(value)) throw new CopilotError(400, `invalid ${key}`);
  return value;
}

function requireId(args: ToolArgs, key: string, fallback: string | null | undefined, missing: string): string {
  const value = optionalId(args, key, fallback);
  if (!value) throw new CopilotError(400, missing);
  return value;
}

function text(value: unknown, field: string, max: number): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string" || !value.trim()) throw new CopilotError(400, `${field} must be non-empty text`);
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (trimmed.length > max) throw new CopilotError(400, `${field} is longer than ${max} characters`);
  return trimmed;
}

/** YYYY-MM-DD in the plan timezone. */
export function localDay(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function daysBetween(from: Date, to: Date, timeZone: string, cap = 92): string[] {
  const days: string[] = [];
  const seen = new Set<string>();
  for (let t = from.getTime(); t <= to.getTime() + 1 && days.length < cap; t += 6 * 3600 * 1000) {
    const key = localDay(new Date(t), timeZone);
    if (!seen.has(key)) {
      seen.add(key);
      days.push(key);
    }
  }
  return days;
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const weekdayOf = (day: string) => new Date(`${day}T12:00:00Z`).getUTCDay();

async function planItems(tenantId: string, planId: string) {
  return prisma.editorialPlanItem.findMany({
    where: { tenantId, planId },
    orderBy: { scheduledFor: "asc" },
    take: 500,
    select: { id: true, title: true, status: true, scheduledFor: true, topicCluster: true, primaryKeyword: true, sourceEvidence: true, relevanceScore: true, projectId: true },
  });
}

async function loadPlan(ctx: AssistantContext, planId: string) {
  const plan = await prisma.editorialPlan.findFirst({ where: { id: planId, tenantId: ctx.tenantId } });
  if (!plan) throw new CopilotError(404, "plan not found");
  return plan;
}

function needPlan(ctx: AssistantContext, args: ToolArgs): string {
  return requireId(args, "planId", ctx.selection.planId, "Open an editorial plan first (or select one in the calendar) so I know which plan to read.");
}

// ── READ ─────────────────────────────────────────────────────────────────

const explainStrategy: ReadTool = {
  kind: "read",
  label: "Explain strategy",
  description: "Summarises the site profile and the selected plan's strategy (mode, intent, priority topics, exclusions).",
  permission: "analytics.read",
  needs: "site or plan",
  async run(ctx, args) {
    const planId = optionalId(args, "planId", ctx.selection.planId);
    if (!ctx.site && !planId) throw new CopilotError(400, "Select a site or an editorial plan to explain its strategy.");
    const lines: string[] = [];
    const sources: ToolLink[] = [];
    if (ctx.site) {
      lines.push(`**Site:** ${ctx.site.name}`);
      if (ctx.siteProfile) {
        lines.push(`- Brand summary: ${ctx.siteProfile.brandSummary ?? "not detected"}`);
        lines.push(`- Main topics: ${ctx.siteProfile.mainTopics.join(", ") || "none detected"}`);
        lines.push(`- Audience: ${ctx.siteProfile.audience ?? "not detected"}`);
        lines.push(`- Profile version ${ctx.siteProfile.version}, confidence ${ctx.siteProfile.confidence === null ? "unknown" : Math.round(ctx.siteProfile.confidence * 100) + "%"}`);
      } else {
        lines.push("- No site intelligence profile exists yet, so there is no detected positioning to explain.");
      }
      if (ctx.editorialProfile) {
        if (ctx.editorialProfile.description) lines.push(`- Editorial description: ${ctx.editorialProfile.description.slice(0, 400)}`);
        if (ctx.editorialProfile.contentGaps.length) lines.push(`- Known content gaps: ${ctx.editorialProfile.contentGaps.slice(0, 8).join(", ")}`);
      }
      sources.push({ label: "Site intelligence", path: "/studio/site-intelligence" });
    }
    if (planId) {
      const plan = await loadPlan(ctx, planId);
      const topics = (plan.topicStrategy ?? {}) as Record<string, unknown>;
      lines.push("", `**Plan:** ${plan.name} (${plan.status})`);
      lines.push(`- Strategy mode: ${plan.strategyMode ?? "not set"}; primary intent: ${plan.primaryIntent ?? "not set"}`);
      lines.push(`- Objective: ${plan.objective ?? "not set"}`);
      lines.push(`- Formats: ${strings(plan.contentFormats).join(", ") || "not set"}`);
      lines.push(`- Priority topics: ${strings(topics.priorityTopics).join(", ") || "none"}`);
      lines.push(`- Excluded topics: ${strings(topics.excludedTopics).join(", ") || "none"}`);
      lines.push(`- Keyword seeds: ${strings(topics.keywordSeeds).join(", ") || "none"}`);
      if (plan.relevanceThreshold !== null) lines.push(`- Relevance threshold: ${plan.relevanceThreshold}`);
      sources.push({ label: plan.name, path: planPath(plan.id) });
    }
    return { content: lines.join("\n"), sources };
  },
};

const explainProposalRelevance: ReadTool = {
  kind: "read",
  label: "Explain proposal relevance",
  description: "Explains why a proposal is in the plan from its stored rationale, evidence and relevance score; says so when evidence is missing.",
  permission: "analytics.read",
  needs: "proposal",
  async run(ctx, args) {
    const itemId = requireId(args, "itemId", ctx.selection.planItemId, "Select a proposal in the plan or calendar first.");
    const item = await prisma.editorialPlanItem.findFirst({ where: { id: itemId, tenantId: ctx.tenantId } });
    if (!item) throw new CopilotError(404, "proposal not found");
    const findings: ToolFinding[] = [];
    const lines = [`**${item.title}**`];
    const pct = (value: number | null) => (value === null ? "not scored" : value <= 1 ? `${Math.round(value * 100)}%` : String(Math.round(value)));
    lines.push(`- Relevance score: ${pct(item.relevanceScore)}; opportunity: ${pct(item.opportunityScore)}; confidence: ${pct(item.confidence)}`);
    if (item.primaryKeyword || item.targetQuery) lines.push(`- Targets: ${[item.primaryKeyword, item.targetQuery].filter(Boolean).join(" / ")}`);
    if (item.topicCluster) lines.push(`- Cluster: ${item.topicCluster}`);
    if (item.cannibalizationRisk) lines.push(`- Cannibalization risk: ${item.cannibalizationRisk}`);
    lines.push(item.rationale ? `- Rationale: ${item.rationale.slice(0, 800)}` : "- No rationale was stored for this proposal.");
    const evidence = Array.isArray(item.sourceEvidence) ? (item.sourceEvidence as Array<Record<string, unknown>>) : [];
    if (evidenceCount(item.sourceEvidence) === 0) {
      findings.push({ severity: "medium", message: "No evidence is stored for this proposal: its relevance rests only on the generator's rationale." });
    } else {
      lines.push("- Evidence:");
      for (const entry of evidence.slice(0, 5)) {
        const label = String(entry.title ?? entry.label ?? entry.type ?? entry.url ?? "evidence item").slice(0, 160);
        lines.push(`  - ${label}${entry.url ? ` (${String(entry.url).slice(0, 200)})` : ""}`);
      }
    }
    if (item.relevanceScore === null) findings.push({ severity: "low", message: "The proposal has no relevance score." });
    return { content: lines.join("\n"), findings, sources: [{ label: "Proposal in plan", path: planPath(item.planId, item.id) }] };
  },
};

export function weaknessFindings(
  plan: { dateFrom: Date; dateTo: Date; timezone: string; generatedOutput: unknown; relevanceThreshold: number | null },
  items: Array<{ id: string; title: string; status: string; scheduledFor: Date | null; topicCluster: string | null; sourceEvidence: unknown; relevanceScore: number | null }>,
): ToolFinding[] {
  const findings: ToolFinding[] = [];
  const active = items.filter((item) => !INACTIVE.has(item.status));
  const unfilled = unfilledSlotsOf(plan.generatedOutput);
  if (unfilled.length) findings.push({ severity: "high", message: `${unfilled.length} slot(s) have no proposal (${unfilled.slice(0, 5).map((slot) => slot.localDate).join(", ")}${unfilled.length > 5 ? ", …" : ""}).` });

  const perDay = new Map<string, number>();
  for (const item of active) if (item.scheduledFor) perDay.set(localDay(item.scheduledFor, plan.timezone), (perDay.get(localDay(item.scheduledFor, plan.timezone)) ?? 0) + 1);
  const emptyDays = daysBetween(plan.dateFrom, plan.dateTo, plan.timezone).filter((day) => !perDay.has(day));
  if (emptyDays.length) findings.push({ severity: "medium", message: `${emptyDays.length} day(s) in the plan range have no active proposal (${emptyDays.slice(0, 7).join(", ")}${emptyDays.length > 7 ? ", …" : ""}).` });

  const capped = active.slice(0, 300);
  const pairs: string[] = [];
  for (let i = 0; i < capped.length; i += 1) {
    for (let j = i + 1; j < capped.length; j += 1) {
      if (titleTokenOverlap(capped[i].title, capped[j].title) >= 0.6) pairs.push(`"${capped[i].title}" / "${capped[j].title}"`);
    }
  }
  if (pairs.length) findings.push({ severity: "medium", message: `${pairs.length} pair(s) of near-duplicate titles: ${pairs.slice(0, 3).join("; ")}${pairs.length > 3 ? "; …" : ""}.` });

  const noEvidence = active.filter((item) => evidenceCount(item.sourceEvidence) === 0);
  if (noEvidence.length) findings.push({ severity: noEvidence.length === active.length ? "high" : "medium", message: `${noEvidence.length} of ${active.length} active proposal(s) have no stored evidence.` });

  if (plan.relevanceThreshold !== null) {
    const low = active.filter((item) => item.relevanceScore !== null && item.relevanceScore < plan.relevanceThreshold!);
    if (low.length) findings.push({ severity: "low", message: `${low.length} proposal(s) score below the plan's relevance threshold (${plan.relevanceThreshold}).` });
  }

  if (active.length >= 3) {
    const clusters = new Map<string, number>();
    for (const item of active) clusters.set(item.topicCluster ?? "", (clusters.get(item.topicCluster ?? "") ?? 0) + 1);
    const unclustered = clusters.get("") ?? 0;
    clusters.delete("");
    const [topName, topCount] = [...clusters.entries()].sort((a, b) => b[1] - a[1])[0] ?? ["", 0];
    if (topCount / active.length > 0.5 && clusters.size > 0) findings.push({ severity: "medium", message: `Cluster imbalance: "${topName}" holds ${topCount} of ${active.length} active proposals.` });
    if (unclustered) findings.push({ severity: "low", message: `${unclustered} proposal(s) have no topic cluster.` });
  }
  return findings;
}

const findPlanWeaknesses: ReadTool = {
  kind: "read",
  label: "Find plan weaknesses",
  description: "Computes gaps from the plan's data: unfilled slots, empty days, near-duplicate titles, missing evidence and cluster imbalance.",
  permission: "analytics.read",
  needs: "plan",
  async run(ctx, args) {
    const plan = await loadPlan(ctx, needPlan(ctx, args));
    const items = await planItems(ctx.tenantId, plan.id);
    const findings = weaknessFindings(plan, items);
    const active = items.filter((item) => !INACTIVE.has(item.status)).length;
    const content = findings.length
      ? `Checked **${plan.name}**: ${active} active proposal(s) between ${localDay(plan.dateFrom, plan.timezone)} and ${localDay(plan.dateTo, plan.timezone)}. ${findings.length} weakness(es) found.`
      : `Checked **${plan.name}**: ${active} active proposal(s). No unfilled slots, empty days, near-duplicates, missing evidence or cluster imbalance found.`;
    const offers: ReadResult["offers"] = plan.status === "partial" && unfilledSlotsOf(plan.generatedOutput).length ? [{ tool: "fill_missing_slots", args: { planId: plan.id } }] : [];
    return { content, findings, sources: [{ label: plan.name, path: planPath(plan.id) }], offers };
  },
};

const ERROR_HINTS: Record<string, string> = {
  plan_generation_failed: "The plan generator threw before it could store proposals. Check the text model configuration and the site intelligence profile, then retry.",
  editorial_plan_has_no_unfilled_slots: "There were no unfilled slots left to fill.",
  editorial_plan_busy: "Another generation was already running on the same plan.",
  STRUCTURED_OUTPUT_INVALID: "The model's answer did not match the required structure after every repair attempt.",
};

const explainFailedJob: ReadTool = {
  kind: "read",
  label: "Explain failed job",
  description: "Explains a failed background operation from its stored error code and summary.",
  permission: "analytics.read",
  needs: "a failed operation (latest one in context by default)",
  async run(ctx, args) {
    const operationId = optionalId(args, "operationId", ctx.recentFailures[0]?.id);
    if (!operationId) return { content: `No failed operations found${ctx.site ? ` for ${ctx.site.name}` : ""}.`, sources: [{ label: "Activity", path: "/studio/activity" }] };
    const op = await prisma.operation.findFirst({ where: { id: operationId, tenantId: ctx.tenantId } });
    if (!op) throw new CopilotError(404, "operation not found");
    const meta = (op.metadata ?? {}) as Record<string, unknown>;
    const lines = [
      `**${op.type}** — ${op.status}${op.finishedAt ? ` at ${op.finishedAt.toISOString()}` : ""}`,
      `- Error code: ${op.errorCode ?? "none recorded"}`,
      `- Error: ${op.errorSummary ? op.errorSummary.slice(0, 600) : "no error summary was stored"}`,
      `- Phase: ${op.phase ?? "unknown"}; retries so far: ${op.retryCount}${typeof meta.retryable === "boolean" ? `; retryable: ${meta.retryable ? "yes" : "no"}` : ""}`,
    ];
    if (op.errorCode && ERROR_HINTS[op.errorCode]) lines.push(`- What it means: ${ERROR_HINTS[op.errorCode]}`);
    if (op.status !== "failed") lines.push("- This operation is not in a failed state.");
    return { content: lines.join("\n"), sources: [{ label: "Operation", path: operationPath(op.id) }] };
  },
};

const suggestCadence: ReadTool = {
  kind: "read",
  label: "Suggest cadence",
  description: "Suggests a publishing cadence from the plan's real distribution across days and weekdays.",
  permission: "analytics.read",
  needs: "plan",
  async run(ctx, args) {
    const plan = await loadPlan(ctx, needPlan(ctx, args));
    const items = (await planItems(ctx.tenantId, plan.id)).filter((item) => !INACTIVE.has(item.status) && item.scheduledFor);
    const days = daysBetween(plan.dateFrom, plan.dateTo, plan.timezone);
    const perDay = new Map<string, number>();
    const perWeekday = new Array(7).fill(0) as number[];
    for (const item of items) {
      const day = localDay(item.scheduledFor!, plan.timezone);
      perDay.set(day, (perDay.get(day) ?? 0) + 1);
      perWeekday[weekdayOf(day)] += 1;
    }
    const weeks = Math.max(1, days.length / 7);
    const perWeek = items.length / weeks;
    const max = Math.max(0, ...perDay.values());
    const busiest = [...perDay.entries()].filter(([, count]) => count === max).map(([day]) => day);
    const daysPresent = new Set(days.map(weekdayOf));
    const emptyWeekdays = [...daysPresent].filter((weekday) => perWeekday[weekday] === 0).map((weekday) => WEEKDAYS[weekday]);
    const target = Math.max(1, Math.round(perWeek));
    const lines = [
      `**${plan.name}**: ${items.length} scheduled proposal(s) over ${days.length} day(s) — about ${perWeek.toFixed(1)} per week.`,
      `- By weekday: ${[1, 2, 3, 4, 5, 6, 0].map((weekday) => `${WEEKDAYS[weekday].slice(0, 3)} ${perWeekday[weekday]}`).join(", ")}`,
      `- Busiest day: ${max ? `${busiest.slice(0, 3).join(", ")} (${max})` : "none"}`,
      `- Plan frequency setting: ${plan.frequency ?? "not set"}. No per-site planning settings are stored, so this suggestion uses the plan only.`,
      "",
      "**Suggestion**",
      `- Keep about ${target} publication(s) per week${target >= 7 ? " (daily)" : ""}, one per day at most${max > 1 ? `; ${busiest.length} day(s) currently carry ${max}` : ""}.`,
    ];
    if (emptyWeekdays.length && items.length >= 3) lines.push(`- Spread into weekdays with nothing scheduled: ${emptyWeekdays.join(", ")}.`);
    const unfilled = unfilledSlotsOf(plan.generatedOutput).length;
    if (unfilled) lines.push(`- ${unfilled} slot(s) are still unfilled; filling them gets the plan to its requested cadence.`);
    const offers: ReadResult["offers"] = plan.status === "partial" && unfilled ? [{ tool: "fill_missing_slots", args: { planId: plan.id } }] : [];
    return { content: lines.join("\n"), sources: [{ label: plan.name, path: planPath(plan.id) }], offers };
  },
};

const suggestProposalsForDay: ReadTool = {
  kind: "read",
  label: "Suggest proposals for a day",
  description: "Lists what is planned on a day and topics from the site profile and plan strategy the plan does not cover yet; offers to fill or regenerate that day's slots.",
  permission: "analytics.read",
  needs: "plan and a date (YYYY-MM-DD)",
  async run(ctx, args) {
    const plan = await loadPlan(ctx, needPlan(ctx, args));
    const date = typeof args.date === "string" && DAY.test(args.date) ? args.date : ctx.selection.periodFrom && ctx.selection.periodFrom === ctx.selection.periodTo ? ctx.selection.periodFrom : null;
    if (!date) throw new CopilotError(400, "Tell me the day as YYYY-MM-DD, e.g. “suggest proposals for 2026-11-20”.");
    const items = await planItems(ctx.tenantId, plan.id);
    const onDay = items.filter((item) => item.scheduledFor && localDay(item.scheduledFor, plan.timezone) === date);
    const unfilled = unfilledSlotsOf(plan.generatedOutput).filter((slot) => slot.localDate === date);
    const topics = (plan.topicStrategy ?? {}) as Record<string, unknown>;
    const candidates: Array<{ topic: string; source: string }> = [
      ...(ctx.editorialProfile?.contentGaps ?? []).map((topic) => ({ topic, source: "content gap in the site's editorial profile" })),
      ...strings(topics.priorityTopics).map((topic) => ({ topic, source: "priority topic in the plan strategy" })),
      ...strings(topics.keywordSeeds).map((topic) => ({ topic, source: "keyword seed in the plan strategy" })),
      ...(ctx.siteProfile?.mainTopics ?? []).map((topic) => ({ topic, source: "main topic in the site intelligence profile" })),
    ];
    const covered = items.filter((item) => !INACTIVE.has(item.status)).map((item) => [item.title, item.primaryKeyword, item.topicCluster].filter(Boolean).join(" "));
    const seen = new Set<string>();
    const fresh = candidates.filter((candidate) => {
      const key = candidate.topic.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return !covered.some((entry) => entry.toLowerCase().includes(key) || titleTokenOverlap(entry, candidate.topic) >= 0.5);
    });
    const lines = [`**${date}** in ${plan.name}:`];
    lines.push(onDay.length ? onDay.map((item) => `- ${item.title} (${item.status})`).join("\n") : "- Nothing is scheduled on this day.");
    if (unfilled.length) lines.push(`- ${unfilled.length} unfilled slot(s) at ${unfilled.map((slot) => slot.localTime).join(", ")}.`);
    lines.push("", fresh.length ? "**Uncovered topics you could plan here**" : "No uncovered topic was found in the site profile or plan strategy; regenerate a proposal to get a new angle.");
    for (const candidate of fresh.slice(0, 5)) lines.push(`- ${candidate.topic} — ${candidate.source}`);
    lines.push("", "Applying a suggestion goes through the plan generator (fill or regenerate), never a direct insert.");
    const offers: NonNullable<ReadResult["offers"]> = [];
    if (unfilled.length && plan.status === "partial") offers.push({ tool: "fill_missing_slots", args: { planId: plan.id } });
    for (const item of onDay.filter((entry) => !entry.projectId && entry.status === "rejected").slice(0, 2)) offers.push({ tool: "regenerate_proposal", args: { itemId: item.id } });
    return { content: lines.join("\n"), sources: [{ label: "Calendar", path: "/studio/calendar" }, { label: plan.name, path: planPath(plan.id) }], offers };
  },
};

// ── WRITE ────────────────────────────────────────────────────────────────

async function ownedItem(tenantId: string, itemId: string) {
  const item = await prisma.editorialPlanItem.findFirst({ where: { id: itemId, tenantId }, include: { plan: { select: { id: true, status: true, name: true } } } });
  if (!item) throw new CopilotError(404, "proposal not found");
  return item;
}

function parseUpdate(args: ToolArgs) {
  const fields: Record<string, unknown> = {};
  const title = text(args.title, "title", 200);
  if (title) fields.title = title;
  const seoTitle = text(args.seoTitle, "seoTitle", 120);
  if (seoTitle) fields.seoTitle = seoTitle;
  const metaDescription = text(args.metaDescription, "metaDescription", 320);
  if (metaDescription) fields.metaDescription = metaDescription;
  const primaryKeyword = text(args.primaryKeyword, "primaryKeyword", 120);
  if (primaryKeyword) fields.primaryKeyword = primaryKeyword;
  if (args.priority !== undefined && args.priority !== null) {
    const priority = Number(args.priority);
    if (!Number.isInteger(priority) || priority < 0 || priority > 100) throw new CopilotError(400, "priority must be an integer from 0 to 100");
    fields.priority = priority;
  }
  if (args.scheduledFor !== undefined && args.scheduledFor !== null) {
    const raw = String(args.scheduledFor);
    const date = new Date(DAY.test(raw) ? `${raw}T09:00:00Z` : raw);
    if (Number.isNaN(date.getTime())) throw new CopilotError(400, "scheduledFor must be a date (YYYY-MM-DD) or ISO timestamp");
    fields.scheduledFor = date.toISOString();
  }
  if (args.keywords !== undefined && args.keywords !== null) {
    if (!Array.isArray(args.keywords) || args.keywords.length > 20) throw new CopilotError(400, "keywords must be a list of up to 20 terms");
    fields.keywords = args.keywords.map((entry, index) => text(entry, `keywords[${index}]`, 80)!);
  }
  if (!Object.keys(fields).length) throw new CopilotError(400, "Say what to change: title, seoTitle, metaDescription, primaryKeyword, keywords, scheduledFor or priority.");
  return fields;
}

const updateProposal: WriteTool = {
  kind: "write",
  label: "Update proposal",
  description: "Changes a proposal's title, SEO title, meta description, keyword(s), date or priority.",
  permission: "projects.manage",
  needs: "proposal",
  async prepare(ctx, args) {
    const itemId = requireId(args, "itemId", ctx.selection.planItemId, "Select the proposal to update first.");
    const item = await ownedItem(ctx.tenantId, itemId);
    const fields = parseUpdate(args);
    const described = Object.entries(fields).map(([key, value]) => `${key} → ${Array.isArray(value) ? value.join(", ") : String(value)}`);
    return { args: { itemId, ...fields }, summary: `Update proposal “${item.title}”: ${described.join("; ")}` };
  },
  async execute(tenantId, _userId, args) {
    const itemId = requireId(args, "itemId", null, "itemId is required");
    const fields = parseUpdate(args);
    const updated = await updateEditorialPlanItem(tenantId, itemId, {
      title: fields.title as string | undefined,
      seoTitle: fields.seoTitle as string | undefined,
      metaDescription: fields.metaDescription as string | undefined,
      primaryKeyword: fields.primaryKeyword as string | undefined,
      priority: fields.priority as number | undefined,
      scheduledFor: fields.scheduledFor ? new Date(fields.scheduledFor as string) : undefined,
      semanticKeywords: fields.keywords as string[] | undefined,
    });
    if (!updated) throw new CopilotError(404, "proposal not found");
    return {
      result: { itemId: updated.id, planId: updated.planId, updatedFields: Object.keys(fields), title: updated.title, scheduledFor: updated.scheduledFor?.toISOString() ?? null, priority: updated.priority },
      links: [{ label: "Open proposal", path: planPath(updated.planId, updated.id) }],
    };
  },
};

function planError(error: unknown): never {
  const code = error instanceof Error ? error.message : "";
  const messages: Record<string, string> = {
    editorial_plan_item_not_found: "proposal not found",
    editorial_plan_item_not_replaceable: "Only proposals that are still proposed or rejected, with no article yet, can be regenerated.",
    editorial_plan_not_found: "plan not found",
    editorial_plan_not_extendable: "The plan must be ready or partial (not generating, failed or archived).",
    editorial_plan_has_no_unfilled_slots: "The plan has no unfilled slots.",
    editorial_plan_busy: "Another generation is already running on this plan.",
  };
  if (messages[code]) throw new CopilotError(code.endsWith("not_found") ? 404 : 409, messages[code]);
  throw error;
}

const regenerateProposal: WriteTool = {
  kind: "write",
  label: "Regenerate proposal",
  description: "Regenerates one proposed or rejected proposal in its own slot; the rest of the plan is kept.",
  permission: "projects.manage",
  needs: "proposal",
  async prepare(ctx, args) {
    const itemId = requireId(args, "itemId", ctx.selection.planItemId, "Select the proposal to regenerate first.");
    const item = await ownedItem(ctx.tenantId, itemId);
    if (item.projectId || !["proposed", "rejected"].includes(item.status)) planError(new Error("editorial_plan_item_not_replaceable"));
    if (!["ready", "partial"].includes(item.plan.status)) planError(new Error("editorial_plan_not_extendable"));
    return { args: { itemId }, summary: `Regenerate proposal “${item.title}” in plan “${item.plan.name}” (its slot is kept; the current proposal is replaced).` };
  },
  async execute(tenantId, userId, args) {
    const itemId = requireId(args, "itemId", null, "itemId is required");
    const queued = await enqueueRegeneratePlanItem(tenantId, itemId, userId).catch(planError);
    return { result: { operationId: queued.operationId, planId: queued.planId, itemId }, links: [{ label: "Follow the operation", path: operationPath(queued.operationId) }, { label: "Open plan", path: planPath(queued.planId) }] };
  },
};

const fillMissingSlots: WriteTool = {
  kind: "write",
  label: "Fill missing slots",
  description: "Generates proposals only for the plan's unfilled slots; existing proposals are untouched.",
  permission: "projects.manage",
  needs: "partial plan",
  async prepare(ctx, args) {
    const plan = await loadPlan(ctx, needPlan(ctx, args));
    const unfilled = unfilledSlotsOf(plan.generatedOutput);
    if (plan.status !== "partial" || !unfilled.length) planError(new Error("editorial_plan_has_no_unfilled_slots"));
    return { args: { planId: plan.id }, summary: `Generate proposals for the ${unfilled.length} unfilled slot(s) of “${plan.name}”.` };
  },
  async execute(tenantId, userId, args) {
    const planId = requireId(args, "planId", null, "planId is required");
    const queued = await enqueueFillMissingSlots(tenantId, planId, userId).catch(planError);
    return { result: { operationId: queued.operationId, planId: queued.planId, expectedCount: queued.expectedCount }, links: [{ label: "Follow the operation", path: operationPath(queued.operationId) }, { label: "Open plan", path: planPath(queued.planId) }] };
  },
};

export function normalizeDomain(value: unknown): string {
  if (typeof value !== "string") throw new CopilotError(400, "domain is required");
  const domain = value.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split(/[/?#]/)[0];
  if (!/^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(domain)) throw new CopilotError(400, `"${String(value).slice(0, 80)}" is not a valid domain`);
  return domain;
}

const proposeSource: WriteTool = {
  kind: "write",
  label: "Propose source",
  description: "Adds a source recommendation for review in Sources. It is never activated automatically.",
  permission: "projects.manage",
  needs: "a domain and a reason",
  async prepare(ctx, args) {
    const domain = normalizeDomain(args.domain);
    const relationship = text(args.relationship, "relationship", 40) ?? "reference";
    const reason = text(args.reason, "reason", 600);
    if (!reason) throw new CopilotError(400, "Give a reason for proposing this source.");
    const existing = await prisma.sourceRecommendation.findFirst({ where: { tenantId: ctx.tenantId, siteId: null, domain } });
    return {
      args: { domain, relationship, reason },
      summary: existing
        ? `${domain} is already a source recommendation (${existing.status}); confirming leaves it unchanged.`
        : `Propose ${domain} as a ${relationship} source for review in Sources (status open, not activated). Reason: ${reason}`,
    };
  },
  async execute(tenantId, _userId, args) {
    const domain = normalizeDomain(args.domain);
    const relationship = text(args.relationship, "relationship", 40) ?? "reference";
    const reason = text(args.reason, "reason", 600) ?? "";
    const existing = await prisma.sourceRecommendation.findFirst({ where: { tenantId, siteId: null, domain } });
    if (existing) return { result: { recommendationId: existing.id, domain, status: existing.status, alreadyExisted: true }, links: [{ label: "Review in Sources", path: "/studio/sources" }] };
    try {
      const created = await prisma.sourceRecommendation.create({
        // score 0: proposed by an operator, not scored by discovery yet.
        data: { tenantId, domain, status: "open", score: 0, searchesCount: 0, reasonSummary: `[${relationship}] ${reason} (proposed via assistant)`.slice(0, 1000) },
      });
      return { result: { recommendationId: created.id, domain, status: created.status, alreadyExisted: false }, links: [{ label: "Review in Sources", path: "/studio/sources" }] };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new CopilotError(409, `${domain} was proposed at the same time by someone else`);
      throw error;
    }
  },
};

export const READ_TOOLS = {
  explain_strategy: explainStrategy,
  explain_proposal_relevance: explainProposalRelevance,
  find_plan_weaknesses: findPlanWeaknesses,
  explain_failed_job: explainFailedJob,
  suggest_cadence: suggestCadence,
  suggest_proposals_for_day: suggestProposalsForDay,
} as const;

export const WRITE_TOOLS = {
  update_proposal: updateProposal,
  regenerate_proposal: regenerateProposal,
  fill_missing_slots: fillMissingSlots,
  propose_source: proposeSource,
} as const;

export type ReadToolName = keyof typeof READ_TOOLS;
export type WriteToolName = keyof typeof WRITE_TOOLS;
export type ToolName = ReadToolName | WriteToolName;
export const TOOL_NAMES = [...Object.keys(READ_TOOLS), ...Object.keys(WRITE_TOOLS)] as ToolName[];

export function findTool(name: string): ReadTool | WriteTool | null {
  return (READ_TOOLS as Record<string, ReadTool>)[name] ?? (WRITE_TOOLS as Record<string, WriteTool>)[name] ?? null;
}

export function toolRegistry(permissions: string[], has: (permissions: string[], permission: StudioPermission) => boolean) {
  return TOOL_NAMES.map((name) => {
    const tool = findTool(name)!;
    return { name, kind: tool.kind, label: tool.label, description: tool.description, permission: tool.permission, needs: tool.needs, confirmation: tool.kind === "write", allowed: has(permissions, tool.permission) };
  });
}
