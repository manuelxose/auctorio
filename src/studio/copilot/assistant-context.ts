// Editorial context for the contextual assistant.
//
// The Studio sends only ids and a visible period (EditorialContextService).
// Everything else is re-loaded here, scoped to the tenant from the signed
// Studio context; an id that does not belong to that tenant is rejected.

import { getPrismaClient } from "../../infrastructure/db/prisma";
import { CopilotError } from "./errors";

const prisma = getPrismaClient();

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export type EditorialSelectionInput = {
  siteId?: string | null;
  planId?: string | null;
  planItemId?: string | null;
  projectId?: string | null;
  periodFrom?: string | null;
  periodTo?: string | null;
  area?: string | null;
};

export type EditorialSelection = {
  siteId: string | null;
  planId: string | null;
  planItemId: string | null;
  projectId: string | null;
  periodFrom: string | null;
  periodTo: string | null;
  area: string | null;
};

function id(value: unknown, field: string): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !UUID.test(value)) throw new CopilotError(400, `invalid ${field}`);
  return value;
}

function day(value: unknown, field: string): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !DAY.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) throw new CopilotError(400, `invalid ${field}`);
  return value;
}

/** Shape-checks the client selection; ownership is checked in loadEditorialContext. */
export function parseSelection(input: EditorialSelectionInput | undefined | null): EditorialSelection {
  const area = typeof input?.area === "string" ? input.area.replace(/[^a-z0-9-]/gi, "").slice(0, 40) || null : null;
  const periodFrom = day(input?.periodFrom, "periodFrom");
  const periodTo = day(input?.periodTo, "periodTo");
  if (periodFrom && periodTo && periodFrom > periodTo) throw new CopilotError(400, "periodFrom is after periodTo");
  return {
    siteId: id(input?.siteId, "siteId"),
    planId: id(input?.planId, "planId"),
    planItemId: id(input?.planItemId, "planItemId"),
    projectId: id(input?.projectId, "projectId"),
    periodFrom,
    periodTo,
    area,
  };
}

export type PlanSummary = {
  id: string;
  name: string;
  status: string;
  siteId: string | null;
  dateFrom: string;
  dateTo: string;
  timezone: string;
  objective: string | null;
  strategyMode: string | null;
  primaryIntent: string | null;
  frequency: string | null;
  itemCount: number;
  countsByStatus: Record<string, number>;
  unfilledSlots: number;
};

export type ProposalBrief = {
  id: string;
  planId: string;
  title: string;
  status: string;
  channel: string;
  scheduledFor: string | null;
  primaryKeyword: string | null;
  topicCluster: string | null;
  relevanceScore: number | null;
  rationale: string | null;
  evidenceCount: number;
  projectId: string | null;
};

export type AssistantContext = {
  tenantId: string;
  selection: EditorialSelection;
  site: { id: string; name: string } | null;
  siteProfile: { brandSummary: string | null; mainTopics: string[]; audience: string | null; confidence: number | null; version: number } | null;
  editorialProfile: { description: string | null; topics: string[]; contentGaps: string[] } | null;
  plan: PlanSummary | null;
  proposal: ProposalBrief | null;
  period: { from: string; to: string; items: Array<{ id: string; title: string; status: string; scheduledFor: string | null }> } | null;
  activeSources: number;
  recentFailures: Array<{ id: string; type: string; errorCode: string | null; errorSummary: string | null; finishedAt: string | null }>;
};

export function strings(value: unknown, limit = 20): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => (typeof entry === "string" ? entry : entry && typeof entry === "object" ? String((entry as Record<string, unknown>).name ?? (entry as Record<string, unknown>).topic ?? (entry as Record<string, unknown>).label ?? "") : ""))
    .map((entry) => entry.trim())
    .filter(Boolean)
    .slice(0, limit);
}

export function evidenceCount(value: unknown): number {
  if (Array.isArray(value)) return value.length;
  if (value && typeof value === "object") return Object.keys(value).length;
  return 0;
}

export function unfilledSlotsOf(generatedOutput: unknown): Array<{ localDate: string; localTime: string; scheduledFor: string; reason: string }> {
  const slots = (generatedOutput as { unfilledSlots?: unknown } | null)?.unfilledSlots;
  return Array.isArray(slots) ? (slots as Array<{ localDate: string; localTime: string; scheduledFor: string; reason: string }>) : [];
}

/** Loads every part of the selection the operator is looking at, enforcing tenant ownership. */
export async function loadEditorialContext(tenantId: string, input: EditorialSelectionInput | undefined | null): Promise<AssistantContext> {
  const selection = parseSelection(input);

  let proposal: ProposalBrief | null = null;
  if (selection.planItemId) {
    const item = await prisma.editorialPlanItem.findFirst({ where: { id: selection.planItemId, tenantId } });
    if (!item) throw new CopilotError(404, "proposal not found");
    if (selection.planId && selection.planId !== item.planId) throw new CopilotError(400, "proposal does not belong to the selected plan");
    selection.planId = item.planId;
    proposal = {
      id: item.id,
      planId: item.planId,
      title: item.title,
      status: item.status,
      channel: item.channel,
      scheduledFor: item.scheduledFor?.toISOString() ?? null,
      primaryKeyword: item.primaryKeyword,
      topicCluster: item.topicCluster,
      relevanceScore: item.relevanceScore,
      rationale: item.rationale,
      evidenceCount: evidenceCount(item.sourceEvidence),
      projectId: item.projectId,
    };
  }

  let plan: PlanSummary | null = null;
  if (selection.planId) {
    const row = await prisma.editorialPlan.findFirst({ where: { id: selection.planId, tenantId } });
    if (!row) throw new CopilotError(404, "plan not found");
    if (selection.siteId && row.siteId && row.siteId !== selection.siteId) throw new CopilotError(400, "plan does not belong to the selected site");
    selection.siteId = selection.siteId ?? row.siteId;
    const grouped = await prisma.editorialPlanItem.groupBy({ by: ["status"], where: { tenantId, planId: row.id }, _count: { _all: true } });
    const countsByStatus = Object.fromEntries(grouped.map((entry) => [entry.status, entry._count._all]));
    plan = {
      id: row.id,
      name: row.name,
      status: row.status,
      siteId: row.siteId,
      dateFrom: row.dateFrom.toISOString(),
      dateTo: row.dateTo.toISOString(),
      timezone: row.timezone,
      objective: row.objective,
      strategyMode: row.strategyMode,
      primaryIntent: row.primaryIntent,
      frequency: row.frequency,
      itemCount: grouped.reduce((sum, entry) => sum + entry._count._all, 0),
      countsByStatus,
      unfilledSlots: unfilledSlotsOf(row.generatedOutput).length,
    };
  }

  if (selection.projectId) {
    const project = await prisma.contentProject.findFirst({ where: { id: selection.projectId, tenantId, deletedAt: null }, select: { siteId: true } });
    if (!project) throw new CopilotError(404, "article not found");
    if (selection.siteId && project.siteId && project.siteId !== selection.siteId) throw new CopilotError(400, "article does not belong to the selected site");
    selection.siteId = selection.siteId ?? project.siteId;
  }

  let site: AssistantContext["site"] = null;
  let siteProfile: AssistantContext["siteProfile"] = null;
  let editorialProfile: AssistantContext["editorialProfile"] = null;
  if (selection.siteId) {
    const row = await prisma.site.findFirst({ where: { id: selection.siteId, tenantId }, select: { id: true, name: true } });
    if (!row) throw new CopilotError(404, "site not found");
    site = row;
    const [intel, editorial] = await Promise.all([
      prisma.siteIntelligenceProfile.findFirst({ where: { siteId: row.id, tenantId } }),
      prisma.siteEditorialProfile.findFirst({ where: { siteId: row.id, tenantId } }),
    ]);
    if (intel) {
      siteProfile = { brandSummary: intel.brandSummary, mainTopics: strings(intel.mainTopics), audience: intel.detectedAudience, confidence: intel.confidence, version: intel.version };
    }
    if (editorial) {
      editorialProfile = { description: editorial.editorialDescription, topics: strings(editorial.topics), contentGaps: strings(editorial.contentGaps) };
    }
  }

  let period: AssistantContext["period"] = null;
  if (selection.periodFrom && selection.periodTo) {
    // Inclusive local dates; a day of margin either side covers timezone offsets.
    const from = new Date(`${selection.periodFrom}T00:00:00Z`);
    const to = new Date(`${selection.periodTo}T23:59:59Z`);
    const items = await prisma.editorialPlanItem.findMany({
      where: { tenantId, scheduledFor: { gte: from, lte: to }, ...(selection.siteId ? { siteId: selection.siteId } : {}), ...(selection.planId ? { planId: selection.planId } : {}) },
      orderBy: { scheduledFor: "asc" },
      take: 50,
      select: { id: true, title: true, status: true, scheduledFor: true },
    });
    period = { from: selection.periodFrom, to: selection.periodTo, items: items.map((item) => ({ ...item, scheduledFor: item.scheduledFor?.toISOString() ?? null })) };
  }

  const siteScope = selection.siteId ? { OR: [{ siteId: selection.siteId }, { siteId: null }] } : {};
  const [activeSources, failures] = await Promise.all([
    prisma.contentSource.count({ where: { tenantId, enabled: true, ...siteScope } }),
    prisma.operation.findMany({
      where: { tenantId, status: "failed", ...(selection.siteId ? { siteId: selection.siteId } : {}) },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, type: true, errorCode: true, errorSummary: true, finishedAt: true },
    }),
  ]);

  return {
    tenantId,
    selection,
    site,
    siteProfile,
    editorialProfile,
    plan,
    proposal,
    period,
    activeSources,
    recentFailures: failures.map((entry) => ({ ...entry, errorSummary: entry.errorSummary?.slice(0, 300) ?? null, finishedAt: entry.finishedAt?.toISOString() ?? null })),
  };
}
