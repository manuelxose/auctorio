import { Prisma } from "@prisma/client";
import type { EditorialPlanItemStatus, PublicationChannel } from "@prisma/client";
import { getTextProvider } from "../infrastructure/ai/text";
import { getPrismaClient } from "../infrastructure/db/prisma";
import { writeAudit } from "./audit";
import { createProject } from "./repository";
import { startProjectGeneration } from "./orchestration";

const prisma = getPrismaClient();
const CHANNELS = ["website", "x", "instagram"] as const;
type PlanChannel = (typeof CHANNELS)[number];

export type GenerateEditorialPlanInput = {
  tenantId: string;
  siteId?: string | null;
  briefId?: string | null;
  dateFrom: Date;
  dateTo: Date;
  objective?: string | null;
  channels: PlanChannel[];
  publicationCount: number;
  frequency?: string | null;
  timezone?: string;
  accountIds?: string[];
  language?: string;
  audience?: string | null;
  topics?: string[];
  excludedTopics?: string[];
  userId?: string | null;
};

type GeneratedPlanItem = {
  title: string;
  workingTitle?: string;
  topic?: string;
  channel: PlanChannel;
  scheduledFor: string;
  newsOrEvergreen?: string;
  objective?: string;
  audience?: string;
  searchIntent?: string;
  primaryKeyword?: string;
  secondaryKeywords?: string[];
  relatedEntities?: string[];
  suggestedSlug?: string;
  seoTitle?: string;
  metaDescription?: string;
  socialHook?: string;
  cta?: string;
  suggestedHashtags?: string[];
  imageConcept?: string;
  imageRequirements?: string;
  priority?: number;
  notes?: string;
};

function parseGeneratedJson(output: string): unknown {
  const cleaned = output.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start < 0 || end <= start) {
      throw new Error("editorial_plan_invalid_json");
    }
    return JSON.parse(cleaned.slice(start, end + 1));
  }
}

function readString(value: unknown, field: string, required = false): string | undefined {
  if (typeof value !== "string" || !value.trim()) {
    if (required) throw new Error(`editorial_plan_invalid_${field}`);
    return undefined;
  }
  return value.trim();
}

function readStringArray(value: unknown): string[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error("editorial_plan_invalid_array");
  }
  return value.map((item) => item.trim()).filter(Boolean);
}

function validateItems(value: unknown, expectedCount: number): GeneratedPlanItem[] {
  if (!value || typeof value !== "object" || !Array.isArray((value as { items?: unknown }).items)) {
    throw new Error("editorial_plan_items_required");
  }
  const items = (value as { items: unknown[] }).items;
  if (items.length === 0 || items.length > expectedCount) {
    throw new Error("editorial_plan_invalid_item_count");
  }
  return items.map((raw) => {
    if (!raw || typeof raw !== "object") throw new Error("editorial_plan_invalid_item");
    const item = raw as Record<string, unknown>;
    const channel = readString(item.channel, "channel", true)!;
    if (!CHANNELS.includes(channel as PlanChannel)) throw new Error("editorial_plan_invalid_channel");
    const scheduledFor = readString(item.scheduledFor, "scheduledFor", true)!;
    if (Number.isNaN(new Date(scheduledFor).getTime())) throw new Error("editorial_plan_invalid_schedule");
    return {
      title: readString(item.title, "title", true)!,
      workingTitle: readString(item.workingTitle, "workingTitle"),
      topic: readString(item.topic, "topic"),
      channel: channel as PlanChannel,
      scheduledFor,
      newsOrEvergreen: readString(item.newsOrEvergreen, "newsOrEvergreen"),
      objective: readString(item.objective, "objective"),
      audience: readString(item.audience, "audience"),
      searchIntent: readString(item.searchIntent, "searchIntent"),
      primaryKeyword: readString(item.primaryKeyword, "primaryKeyword"),
      secondaryKeywords: readStringArray(item.secondaryKeywords),
      relatedEntities: readStringArray(item.relatedEntities),
      suggestedSlug: readString(item.suggestedSlug, "suggestedSlug"),
      seoTitle: readString(item.seoTitle, "seoTitle"),
      metaDescription: readString(item.metaDescription, "metaDescription"),
      socialHook: readString(item.socialHook, "socialHook"),
      cta: readString(item.cta, "cta"),
      suggestedHashtags: readStringArray(item.suggestedHashtags),
      imageConcept: readString(item.imageConcept, "imageConcept"),
      imageRequirements: readString(item.imageRequirements, "imageRequirements"),
      priority: typeof item.priority === "number" && Number.isFinite(item.priority) ? item.priority : 0,
      notes: readString(item.notes, "notes"),
    };
  });
}

function buildPrompt(input: GenerateEditorialPlanInput, sourceTitles: string[]): string {
  return [
    "Generate an editorial publication plan. Return JSON only, with no markdown.",
    `Create at most ${input.publicationCount} unique items between ${input.dateFrom.toISOString()} and ${input.dateTo.toISOString()}.`,
    `Allowed channels: ${input.channels.join(", ")}. Use timezone ${input.timezone ?? "Europe/Madrid"}.`,
    `Objective: ${input.objective ?? "balanced editorial coverage"}. Language: ${input.language ?? "es"}.`,
    `Audience: ${input.audience ?? "general digital audience"}.`,
    `Topics: ${(input.topics ?? []).join(", ") || "use source relevance and balanced coverage"}.`,
    `Excluded topics: ${(input.excludedTopics ?? []).join(", ") || "none"}.`,
    "Avoid duplicate titles, repeated hooks, keyword cannibalization, and identical schedule times.",
    `Recent source candidates: ${sourceTitles.join(" | ") || "none available"}.`,
    "Schema: {\"items\":[{\"title\":string,\"workingTitle\":string,\"topic\":string,\"channel\":\"website\"|\"x\"|\"instagram\",\"scheduledFor\":ISO datetime,\"newsOrEvergreen\":string,\"objective\":string,\"audience\":string,\"searchIntent\":string,\"primaryKeyword\":string,\"secondaryKeywords\":string[],\"relatedEntities\":string[],\"suggestedSlug\":string,\"seoTitle\":string,\"metaDescription\":string,\"socialHook\":string,\"cta\":string,\"suggestedHashtags\":string[],\"imageConcept\":string,\"imageRequirements\":string,\"priority\":number,\"notes\":string}]}",
  ].join("\n");
}

export async function generateEditorialPlan(input: GenerateEditorialPlanInput) {
  if (!input.siteId) throw new Error("editorial_plan_site_required");
  if (input.dateTo <= input.dateFrom) throw new Error("editorial_plan_invalid_date_range");
  if (input.publicationCount < 1 || input.publicationCount > 100) throw new Error("editorial_plan_invalid_quantity");
  if (input.channels.length === 0) throw new Error("editorial_plan_channels_required");

  const requestedAccountIds = [...new Set(input.accountIds ?? [])];
  const accounts = requestedAccountIds.length
    ? await prisma.publishingAccount.findMany({
        where: { tenantId: input.tenantId, id: { in: requestedAccountIds }, enabled: true },
        select: { id: true, platform: true },
      })
    : [];
  if (accounts.length !== requestedAccountIds.length) throw new Error("editorial_plan_invalid_account");
  if (accounts.some((account) => !input.channels.includes(account.platform))) {
    throw new Error("editorial_plan_account_channel_mismatch");
  }

  const plan = await prisma.editorialPlan.create({
    data: {
      tenantId: input.tenantId,
      siteId: input.siteId ?? null,
      briefId: input.briefId ?? null,
      name: `Editorial plan ${input.dateFrom.toISOString().slice(0, 10)}`,
      status: "generating",
      dateFrom: input.dateFrom,
      dateTo: input.dateTo,
      objective: input.objective ?? null,
      channels: input.channels as Prisma.InputJsonArray,
      accountIds: input.accountIds?.length ? (input.accountIds as Prisma.InputJsonArray) : Prisma.JsonNull,
      frequency: input.frequency ?? null,
      timezone: input.timezone ?? "Europe/Madrid",
      configuration: {
        publicationCount: input.publicationCount,
        language: input.language ?? "es",
        audience: input.audience ?? null,
        topics: input.topics ?? [],
        excludedTopics: input.excludedTopics ?? [],
      } as Prisma.InputJsonObject,
    },
  });

  try {
    const sourceItems = await prisma.sourceItem.findMany({
      where: { tenantId: input.tenantId, processingStatus: "candidate" },
      orderBy: [{ score: "desc" }, { discoveredAt: "desc" }],
      take: 20,
      select: { title: true },
    });
    const provider = getTextProvider();
    const result = await provider.generate({
      prompt: buildPrompt(input, sourceItems.map((item) => item.title)),
      systemPrompt: "You are a structured editorial planning engine. Never output prose outside the requested JSON object.",
      temperature: 0,
      maxTokens: Math.max(1200, input.publicationCount * 220),
    });
    const parsed = parseGeneratedJson(result.output);
    const items = validateItems(parsed, input.publicationCount);
    const uniqueTitles = new Set(items.map((item) => item.title.toLowerCase()));
    if (uniqueTitles.size !== items.length) throw new Error("editorial_plan_duplicate_titles");

    await prisma.$transaction(async (tx) => {
      await tx.editorialPlanItem.createMany({
        data: items.map((item) => ({
          tenantId: input.tenantId,
          planId: plan.id,
          siteId: input.siteId ?? null,
          accountId: accounts.filter((account) => account.platform === item.channel)[
            items.filter((candidate) => candidate.channel === item.channel).indexOf(item) %
              Math.max(1, accounts.filter((account) => account.platform === item.channel).length)
          ]?.id ?? null,
          title: item.title,
          workingTitle: item.workingTitle ?? null,
          topic: item.topic ?? null,
          channel: item.channel as PublicationChannel,
          scheduledFor: new Date(item.scheduledFor),
          newsOrEvergreen: item.newsOrEvergreen ?? null,
          objective: item.objective ?? input.objective ?? null,
          audience: item.audience ?? input.audience ?? null,
          searchIntent: item.searchIntent ?? null,
          primaryKeyword: item.primaryKeyword ?? null,
          secondaryKeywords: item.secondaryKeywords?.length ? (item.secondaryKeywords as Prisma.InputJsonArray) : Prisma.JsonNull,
          relatedEntities: item.relatedEntities?.length ? (item.relatedEntities as Prisma.InputJsonArray) : Prisma.JsonNull,
          suggestedSlug: item.suggestedSlug ?? null,
          seoTitle: item.seoTitle ?? null,
          metaDescription: item.metaDescription ?? null,
          socialHook: item.socialHook ?? null,
          cta: item.cta ?? null,
          suggestedHashtags: item.suggestedHashtags?.length ? (item.suggestedHashtags as Prisma.InputJsonArray) : Prisma.JsonNull,
          imageConcept: item.imageConcept ?? null,
          imageRequirements: item.imageRequirements ?? null,
          priority: item.priority ?? 0,
          status: "proposed",
          notes: item.notes ?? null,
        })),
      });
      await tx.editorialPlan.update({
        where: { id: plan.id },
        data: { status: "ready", provider: result.provider, model: result.model, generatedOutput: parsed as Prisma.InputJsonObject, error: null },
      });
    });
    await writeAudit({
      tenantId: input.tenantId,
      actorType: input.userId ? "user" : "system",
      actorUserId: input.userId,
      action: "editorial_plan.generated",
      entityType: "editorial_plan",
      entityId: plan.id,
      metadata: { itemCount: items.length, channels: input.channels },
    });
    return prisma.editorialPlan.findUnique({ where: { id: plan.id }, include: { items: true } });
  } catch (error) {
    await prisma.editorialPlan.update({
      where: { id: plan.id },
      data: { status: "failed", error: error instanceof Error ? error.message : String(error) },
    });
    throw error;
  }
}

export async function listEditorialPlans(tenantId: string, page: number, pageSize: number) {
  const where = { tenantId, status: { not: "archived" as const } };
  const [total, items] = await prisma.$transaction([
    prisma.editorialPlan.count({ where }),
    prisma.editorialPlan.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize, include: { _count: { select: { items: true } } } }),
  ]);
  return { items, page, pageSize, total };
}

export async function getEditorialPlan(tenantId: string, planId: string) {
  return prisma.editorialPlan.findFirst({ where: { id: planId, tenantId }, include: { items: { orderBy: { scheduledFor: "asc" } } } });
}

export async function updateEditorialPlanItem(
  tenantId: string,
  itemId: string,
  input: {
    title?: string;
    workingTitle?: string | null;
    topic?: string | null;
    scheduledFor?: Date | null;
    primaryKeyword?: string | null;
    seoTitle?: string | null;
    metaDescription?: string | null;
    socialHook?: string | null;
    imageConcept?: string | null;
    priority?: number;
    notes?: string | null;
  },
) {
  const item = await prisma.editorialPlanItem.findFirst({ where: { id: itemId, tenantId } });
  if (!item) return null;
  return prisma.editorialPlanItem.update({
    where: { id: item.id },
    data: {
      title: input.title?.trim() || undefined,
      workingTitle: input.workingTitle === undefined ? undefined : input.workingTitle?.trim() || null,
      topic: input.topic === undefined ? undefined : input.topic?.trim() || null,
      scheduledFor: input.scheduledFor,
      primaryKeyword: input.primaryKeyword === undefined ? undefined : input.primaryKeyword?.trim() || null,
      seoTitle: input.seoTitle === undefined ? undefined : input.seoTitle?.trim() || null,
      metaDescription: input.metaDescription === undefined ? undefined : input.metaDescription?.trim() || null,
      socialHook: input.socialHook === undefined ? undefined : input.socialHook?.trim() || null,
      imageConcept: input.imageConcept === undefined ? undefined : input.imageConcept?.trim() || null,
      priority: input.priority,
      notes: input.notes === undefined ? undefined : input.notes?.trim() || null,
    },
  });
}

export async function setEditorialPlanItemStatus(
  tenantId: string,
  itemId: string,
  status: EditorialPlanItemStatus,
  userId?: string | null,
) {
  const item = await prisma.editorialPlanItem.findFirst({ where: { id: itemId, tenantId } });
  if (!item) return null;
  const updated = await prisma.editorialPlanItem.update({ where: { id: item.id }, data: { status, approvalStatus: status === "approved" ? "approved" : status } });
  await writeAudit({ tenantId, actorType: userId ? "user" : "system", actorUserId: userId, action: `editorial_plan_item.${status}`, entityType: "editorial_plan_item", entityId: item.id, metadata: { planId: item.planId } });
  return updated;
}

export async function bulkApproveEditorialPlanItems(tenantId: string, itemIds: string[], userId?: string | null) {
  const result = await prisma.editorialPlanItem.updateMany({ where: { tenantId, id: { in: itemIds }, status: "proposed" }, data: { status: "approved", approvalStatus: "approved" } });
  await writeAudit({ tenantId, actorType: userId ? "user" : "system", actorUserId: userId, action: "editorial_plan_items.approved", metadata: { requestedCount: itemIds.length, updatedCount: result.count } });
  return { updatedCount: result.count };
}

export async function bulkSetEditorialPlanItemStatus(
  tenantId: string,
  itemIds: string[],
  status: "approved" | "rejected" | "proposed" | "canceled",
  userId?: string | null,
) {
  const result = await prisma.editorialPlanItem.updateMany({
    where: { tenantId, id: { in: itemIds }, status: { in: ["proposed", "approved", "rejected", "canceled"] } },
    data: { status, approvalStatus: status === "approved" ? "approved" : status },
  });
  await writeAudit({ tenantId, actorType: userId ? "user" : "system", actorUserId: userId, action: `editorial_plan_items.${status}`, metadata: { requestedCount: itemIds.length, updatedCount: result.count } });
  return { updatedCount: result.count };
}

export async function bulkDeleteEditorialPlanItems(tenantId: string, itemIds: string[], userId?: string | null) {
  const existing = await prisma.editorialPlanItem.findMany({ where: { tenantId, id: { in: itemIds } }, select: { id: true, projectId: true } });
  if (existing.length !== itemIds.length) throw new Error("editorial_plan_items_not_found");
  if (existing.some((item) => item.projectId)) throw new Error("editorial_plan_item_has_content");
  await prisma.editorialPlanItem.deleteMany({ where: { tenantId, id: { in: itemIds } } });
  await writeAudit({ tenantId, actorType: userId ? "user" : "system", actorUserId: userId, action: "editorial_plan_items.deleted", metadata: { count: itemIds.length } });
  return { deletedCount: itemIds.length };
}

export async function deleteEditorialPlanItem(tenantId: string, itemId: string, userId?: string | null) {
  const item = await prisma.editorialPlanItem.findFirst({ where: { id: itemId, tenantId } });
  if (!item) return null;
  if (item.projectId) throw new Error("editorial_plan_item_has_content");
  await prisma.editorialPlanItem.delete({ where: { id: item.id } });
  await writeAudit({ tenantId, actorType: userId ? "user" : "system", actorUserId: userId, action: "editorial_plan_item.deleted", entityType: "editorial_plan_item", entityId: item.id, metadata: { planId: item.planId } });
  return { ok: true as const };
}

export async function generateContentFromEditorialPlanItem(tenantId: string, itemId: string, userId?: string | null) {
  const item = await prisma.editorialPlanItem.findFirst({ where: { id: itemId, tenantId }, include: { project: true } });
  if (!item) return null;
  if (item.projectId && item.project) return { item, project: item.project };
  if (item.status !== "approved") throw new Error("editorial_plan_item_must_be_approved");
  if (!item.siteId) throw new Error("editorial_plan_item_site_required");

  const project = await createProject(tenantId, {
    siteId: item.siteId,
    title: item.workingTitle || item.title,
    brief: [item.title, item.topic, item.primaryKeyword, item.metaDescription, item.imageConcept].filter(Boolean).join("\n\n"),
    goal: item.channel === "website" ? "article" : "social_pack",
    primaryLanguage: "es",
    metadata: { editorialPlanId: item.planId, editorialPlanItemId: item.id, channel: item.channel } as Prisma.InputJsonObject,
  });
  await prisma.editorialPlanItem.update({ where: { id: item.id }, data: { projectId: project.id, status: "generating", contentGenerationStatus: "generating" } });
  await startProjectGeneration(project.id, tenantId);
  await writeAudit({ tenantId, actorType: userId ? "user" : "system", actorUserId: userId, action: "editorial_plan_item.content_generation_started", entityType: "editorial_plan_item", entityId: item.id, metadata: { projectId: project.id } });
  return { item: await prisma.editorialPlanItem.findUnique({ where: { id: item.id } }), project };
}
