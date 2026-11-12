import { Prisma } from "@prisma/client";
import { getPrismaClient } from "../infrastructure/db/prisma";
import { writeAudit } from "./audit";

const prisma = getPrismaClient();
const INDEXED_STATES = ["extracted", "stale"] as const;
const LOCAL_TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const CHANNELS = ["website", "x", "instagram"] as const;
const MAX_PRESET_BYTES = 16_000;

// ──────────────────────────────────────────── URL inventory (internal links + evidence)

/** Searchable inventory the Studio may pick internal links (indexed pages) and evidence (indexed pages + source items) from. */
export async function listPlanningInventory(tenantId: string, siteId: string, query: string | null, limit = 20) {
  const term = query?.trim() || null;
  const contains = term ? { contains: term, mode: "insensitive" as const } : undefined;
  const [pages, sourceItems] = await Promise.all([
    prisma.siteIndexedPage.findMany({
      where: { tenantId, siteId, crawlState: { in: [...INDEXED_STATES] }, ...(contains ? { OR: [{ title: contains }, { url: contains }] } : {}) },
      orderBy: [{ modifiedAt: "desc" }],
      take: limit,
      select: { url: true, title: true },
    }),
    prisma.sourceItem.findMany({
      where: {
        tenantId,
        canonicalUrl: { not: null },
        source: { OR: [{ siteId }, { siteId: null }] },
        ...(contains ? { OR: [{ title: contains }, { canonicalUrl: contains }] } : {}),
      },
      orderBy: [{ discoveredAt: "desc" }],
      take: limit,
      select: { canonicalUrl: true, title: true },
    }),
  ]);
  return {
    indexedPages: pages.map((page) => ({ url: page.url, title: page.title ?? page.url })),
    sourceItems: sourceItems.map((item) => ({ url: item.canonicalUrl!, title: item.title })),
  };
}

/** Returns the URLs that are NOT in the site's inventory (empty = all valid). */
export async function findUninventoriedUrls(tenantId: string, siteId: string, urls: { internalLinks: string[]; evidence: string[] }): Promise<string[]> {
  const all = [...new Set([...urls.internalLinks, ...urls.evidence])];
  if (all.length === 0) return [];
  const [pages, items] = await Promise.all([
    prisma.siteIndexedPage.findMany({ where: { tenantId, siteId, crawlState: { in: [...INDEXED_STATES] }, url: { in: all } }, select: { url: true } }),
    urls.evidence.length
      ? prisma.sourceItem.findMany({ where: { tenantId, canonicalUrl: { in: urls.evidence }, source: { OR: [{ siteId }, { siteId: null }] } }, select: { canonicalUrl: true } })
      : Promise.resolve([] as Array<{ canonicalUrl: string | null }>),
  ]);
  const indexed = new Set(pages.map((page) => page.url));
  const evidence = new Set([...indexed, ...items.map((item) => item.canonicalUrl ?? "")]);
  return [...urls.internalLinks.filter((url) => !indexed.has(url)), ...urls.evidence.filter((url) => !evidence.has(url))];
}

// ──────────────────────────────────────────── Strategy presets

export type PresetPayload = Record<string, unknown>;

/** Presets are opaque generator settings, but must be a bounded JSON object. */
export function validatePresetPayload(value: unknown): PresetPayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("preset_payload_must_be_object");
  if (JSON.stringify(value).length > MAX_PRESET_BYTES) throw new Error("preset_payload_too_large");
  return value as PresetPayload;
}

async function assertSite(tenantId: string, siteId: string) {
  const site = await prisma.site.findFirst({ where: { id: siteId, tenantId }, select: { id: true, timezone: true } });
  if (!site) throw new Error("site_not_found");
  return site;
}

/** Site presets plus tenant-wide ones (siteId null). */
export async function listPlanPresets(tenantId: string, siteId?: string | null) {
  return prisma.editorialPlanPreset.findMany({
    where: { tenantId, ...(siteId ? { OR: [{ siteId }, { siteId: null }] } : {}) },
    orderBy: [{ name: "asc" }],
  });
}

export async function createPlanPreset(tenantId: string, input: { name: string; siteId?: string | null; payload: unknown }, userId?: string | null) {
  const name = input.name.trim();
  if (!name || name.length > 120) throw new Error("preset_name_invalid");
  if (input.siteId) await assertSite(tenantId, input.siteId);
  const preset = await prisma.editorialPlanPreset.create({
    data: { tenantId, siteId: input.siteId ?? null, name, payload: validatePresetPayload(input.payload) as Prisma.InputJsonObject },
  });
  await writeAudit({ tenantId, actorType: userId ? "user" : "system", actorUserId: userId, action: "editorial_plan_preset.created", entityType: "editorial_plan_preset", entityId: preset.id, metadata: { name } });
  return preset;
}

export async function updatePlanPreset(tenantId: string, presetId: string, input: { name?: string; payload?: unknown }, userId?: string | null) {
  const existing = await prisma.editorialPlanPreset.findFirst({ where: { id: presetId, tenantId } });
  if (!existing) return null;
  const name = input.name?.trim();
  if (name !== undefined && (!name || name.length > 120)) throw new Error("preset_name_invalid");
  const preset = await prisma.editorialPlanPreset.update({
    where: { id: existing.id },
    data: { name, payload: input.payload === undefined ? undefined : (validatePresetPayload(input.payload) as Prisma.InputJsonObject) },
  });
  await writeAudit({ tenantId, actorType: userId ? "user" : "system", actorUserId: userId, action: "editorial_plan_preset.updated", entityType: "editorial_plan_preset", entityId: preset.id, metadata: { name: preset.name } });
  return preset;
}

export async function deletePlanPreset(tenantId: string, presetId: string, userId?: string | null) {
  const existing = await prisma.editorialPlanPreset.findFirst({ where: { id: presetId, tenantId } });
  if (!existing) return null;
  await prisma.editorialPlanPreset.delete({ where: { id: existing.id } });
  await writeAudit({ tenantId, actorType: userId ? "user" : "system", actorUserId: userId, action: "editorial_plan_preset.deleted", entityType: "editorial_plan_preset", entityId: existing.id, metadata: { name: existing.name } });
  return { ok: true as const };
}

// ──────────────────────────────────────────── Site planning defaults

export type PlanningSettingsInput = {
  timezone?: string;
  articlesPerDay?: number;
  weekdays?: number[];
  publishTimes?: string[];
  channels?: string[];
  defaultPresetId?: string | null;
};

/** Pure validation/normalisation of a settings update; throws a stable error code on bad input. */
export function normalizePlanningSettings(input: PlanningSettingsInput): PlanningSettingsInput {
  const out: PlanningSettingsInput = {};
  if (input.timezone !== undefined) {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: input.timezone });
    } catch {
      throw new Error("planning_settings_invalid_timezone");
    }
    out.timezone = input.timezone;
  }
  if (input.articlesPerDay !== undefined) {
    if (!Number.isInteger(input.articlesPerDay) || input.articlesPerDay < 1 || input.articlesPerDay > 8) throw new Error("planning_settings_invalid_articles_per_day");
    out.articlesPerDay = input.articlesPerDay;
  }
  if (input.weekdays !== undefined) {
    const days = [...new Set(input.weekdays)].sort();
    if (days.length === 0 || days.some((day) => !Number.isInteger(day) || day < 0 || day > 6)) throw new Error("planning_settings_invalid_weekdays");
    out.weekdays = days;
  }
  if (input.publishTimes !== undefined) {
    if (input.publishTimes.length > 8 || input.publishTimes.some((time) => !LOCAL_TIME.test(time))) throw new Error("planning_settings_invalid_publish_times");
    out.publishTimes = [...new Set(input.publishTimes)].sort();
  }
  if (input.channels !== undefined) {
    const channels = [...new Set(input.channels)];
    if (channels.length === 0 || channels.some((channel) => !(CHANNELS as readonly string[]).includes(channel))) throw new Error("planning_settings_invalid_channels");
    out.channels = channels;
  }
  if (input.defaultPresetId !== undefined) out.defaultPresetId = input.defaultPresetId;
  return out;
}

export async function getSitePlanningSettings(tenantId: string, siteId: string) {
  const site = await assertSite(tenantId, siteId);
  const stored = await prisma.sitePlanningSettings.findUnique({ where: { siteId } });
  return {
    siteId,
    timezone: site.timezone,
    articlesPerDay: stored?.articlesPerDay ?? 1,
    weekdays: (stored?.weekdays as number[] | undefined) ?? [0, 1, 2, 3, 4, 5, 6],
    publishTimes: (stored?.publishTimes as string[] | undefined) ?? [],
    channels: (stored?.channels as string[] | undefined) ?? ["website"],
    defaultPresetId: stored?.defaultPresetId ?? null,
    persisted: Boolean(stored),
  };
}

export async function putSitePlanningSettings(tenantId: string, siteId: string, input: PlanningSettingsInput, userId?: string | null) {
  await assertSite(tenantId, siteId);
  const next = normalizePlanningSettings(input);
  if (next.defaultPresetId) {
    const preset = await prisma.editorialPlanPreset.findFirst({ where: { id: next.defaultPresetId, tenantId, OR: [{ siteId }, { siteId: null }] } });
    if (!preset) throw new Error("planning_settings_preset_not_found");
  }
  const current = await getSitePlanningSettings(tenantId, siteId);
  const merged = { ...current, ...next };
  await prisma.$transaction([
    ...(next.timezone ? [prisma.site.update({ where: { id: siteId }, data: { timezone: next.timezone } })] : []),
    prisma.sitePlanningSettings.upsert({
      where: { siteId },
      create: {
        tenantId,
        siteId,
        articlesPerDay: merged.articlesPerDay,
        weekdays: merged.weekdays as Prisma.InputJsonArray,
        publishTimes: merged.publishTimes as Prisma.InputJsonArray,
        channels: merged.channels as Prisma.InputJsonArray,
        defaultPresetId: merged.defaultPresetId,
      },
      update: {
        articlesPerDay: merged.articlesPerDay,
        weekdays: merged.weekdays as Prisma.InputJsonArray,
        publishTimes: merged.publishTimes as Prisma.InputJsonArray,
        channels: merged.channels as Prisma.InputJsonArray,
        defaultPresetId: merged.defaultPresetId,
      },
    }),
  ]);
  await writeAudit({ tenantId, actorType: userId ? "user" : "system", actorUserId: userId, action: "site.planning_settings_updated", entityType: "site", entityId: siteId, metadata: next as Prisma.InputJsonObject });
  return getSitePlanningSettings(tenantId, siteId);
}

/** The timezone plans for this site use when the request names none. */
export async function siteTimezone(tenantId: string, siteId: string): Promise<string | null> {
  const site = await prisma.site.findFirst({ where: { id: siteId, tenantId }, select: { timezone: true } });
  return site?.timezone ?? null;
}
