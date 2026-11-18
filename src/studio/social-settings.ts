import { getPrismaClient } from "../infrastructure/db/prisma";

export const SOCIAL_WORKFLOWS = ["auto", "approve", "manual"] as const;
export const SOCIAL_CATEGORIES = ["educational", "philosophical", "myths", "storytelling"] as const;
export const SOCIAL_IMAGE_STYLES = ["photo", "sketch"] as const;
export const SOCIAL_FONTS = ["sans", "serif", "mono"] as const;
export const SOCIAL_HIGHLIGHTS = ["color", "marker", "underline", "none"] as const;

export type SiteSocialSettingsInput = {
  workflow?: string;
  postDays?: number[];
  postTime?: string;
  timezone?: string;
  categories?: string[];
  imageStyle?: string;
  fontFamily?: string;
  highlightStyle?: string;
  useLogo?: boolean;
  showBrandMark?: boolean;
};

export const SOCIAL_SETTINGS_DEFAULTS = {
  workflow: "approve",
  postDays: [1, 3, 5],
  postTime: "10:00",
  timezone: "UTC",
  categories: ["educational", "myths", "storytelling"],
  imageStyle: "photo",
  fontFamily: "sans",
  highlightStyle: "marker",
  useLogo: false,
  showBrandMark: true,
};

function oneOf(value: string, allowed: readonly string[], field: string) {
  if (!allowed.includes(value)) throw new Error(`invalid_${field}`);
}

function validTimezone(tz: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Throws `invalid_<field>` for the first bad value; returns the cleaned patch. */
export function validateSocialSettings(input: SiteSocialSettingsInput): SiteSocialSettingsInput {
  const out: SiteSocialSettingsInput = {};
  if (input.workflow !== undefined) { oneOf(input.workflow, SOCIAL_WORKFLOWS, "workflow"); out.workflow = input.workflow; }
  if (input.postDays !== undefined) {
    const days = [...new Set(input.postDays)];
    if (!Array.isArray(input.postDays) || days.length === 0 || days.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) {
      throw new Error("invalid_postDays");
    }
    out.postDays = days.sort((a, b) => a - b);
  }
  if (input.postTime !== undefined) {
    if (!/^([01]\d|2[0-3]):(00|30)$/.test(input.postTime)) throw new Error("invalid_postTime");
    out.postTime = input.postTime;
  }
  if (input.timezone !== undefined) {
    if (!validTimezone(input.timezone)) throw new Error("invalid_timezone");
    out.timezone = input.timezone;
  }
  if (input.categories !== undefined) {
    if (!Array.isArray(input.categories) || input.categories.length === 0) throw new Error("invalid_categories");
    input.categories.forEach((c) => oneOf(c, SOCIAL_CATEGORIES, "categories"));
    out.categories = [...new Set(input.categories)];
  }
  if (input.imageStyle !== undefined) { oneOf(input.imageStyle, SOCIAL_IMAGE_STYLES, "imageStyle"); out.imageStyle = input.imageStyle; }
  if (input.fontFamily !== undefined) { oneOf(input.fontFamily, SOCIAL_FONTS, "fontFamily"); out.fontFamily = input.fontFamily; }
  if (input.highlightStyle !== undefined) { oneOf(input.highlightStyle, SOCIAL_HIGHLIGHTS, "highlightStyle"); out.highlightStyle = input.highlightStyle; }
  for (const key of ["useLogo", "showBrandMark"] as const) {
    if (input[key] !== undefined) {
      if (typeof input[key] !== "boolean") throw new Error(`invalid_${key}`);
      out[key] = input[key];
    }
  }
  return out;
}

function zoneParts(at: Date, tz: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric" })
      .formatToParts(at)
      .map((p) => [p.type, Number(p.value)]),
  ) as Record<string, number>;
  return parts;
}

/** Wall-clock time in `tz` → UTC instant (two passes cover DST shifts). */
function zonedToUtc(y: number, m: number, d: number, h: number, mi: number, tz: string): Date {
  let guess = Date.UTC(y, m - 1, d, h, mi);
  for (let i = 0; i < 2; i += 1) {
    const p = zoneParts(new Date(guess), tz);
    const shown = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
    guess += Date.UTC(y, m - 1, d, h, mi) - shown;
  }
  return new Date(guess);
}

/** Next posting slot strictly after `now` on one of `postDays` at `postTime` in `timezone`. */
export function nextSocialSlot(settings: { postDays: number[]; postTime: string; timezone: string }, now: Date = new Date()): Date {
  const [hour, minute] = settings.postTime.split(":").map(Number);
  const today = zoneParts(now, settings.timezone);
  for (let offset = 0; offset < 8; offset += 1) {
    const local = new Date(Date.UTC(today.year, today.month - 1, today.day + offset));
    if (!settings.postDays.includes(local.getUTCDay())) continue;
    const slot = zonedToUtc(local.getUTCFullYear(), local.getUTCMonth() + 1, local.getUTCDate(), hour, minute, settings.timezone);
    if (slot.getTime() > now.getTime()) return slot;
  }
  throw new Error("no_social_slot");
}

async function assertSite(tenantId: string, siteId: string) {
  const site = await getPrismaClient().site.findFirst({ where: { id: siteId, tenantId }, select: { id: true } });
  if (!site) throw new Error("site_not_found");
}

export async function getSiteSocialSettings(tenantId: string, siteId: string) {
  await assertSite(tenantId, siteId);
  const row = await getPrismaClient().siteSocialSettings.findUnique({ where: { siteId } });
  return row ?? { siteId, ...SOCIAL_SETTINGS_DEFAULTS };
}

export async function putSiteSocialSettings(tenantId: string, siteId: string, input: SiteSocialSettingsInput) {
  const data = validateSocialSettings(input);
  await assertSite(tenantId, siteId);
  return getPrismaClient().siteSocialSettings.upsert({
    where: { siteId },
    create: { tenantId, siteId, ...data },
    update: data,
  });
}
