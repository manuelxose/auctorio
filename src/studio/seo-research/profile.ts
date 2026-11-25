// Research profile of a website: what stored data says of it, under what people approved and corrected.
// Nothing here calls a model or a provider, and rebuilding it never touches what a person set.

import { Prisma } from "@prisma/client";
import { getPrismaClient } from "../../infrastructure/db/prisma";
import { normalizeKeyword, seoMarket } from "../../infrastructure/seo/contract";
import { writeAudit } from "../audit";
import { getSitePlanningSettings } from "../planning-settings";
import { addDays } from "../search-console";
import { siteTotals } from "../seo-intelligence/performance";
import { defaultSeoProfile, isSeoProfile, type SeoProfile } from "../seo-intelligence/scoring";
import { getApprovedStrategy } from "../site-intelligence/strategy";
import { parseResearchPolicy, readResearchPolicy, type ResearchPolicy } from "./policy";

const prisma = getPrismaClient();

/** Who says it. A person's word (corrected, configured, approved) always beats what was detected. */
export type ProfileSource = "corrected" | "configured" | "approved" | "observed" | "detected" | "unknown";
export type ProfileField<T> = { value: T | null; source: ProfileSource };

export const SITE_KINDS = ["new_website", "established", "publisher", "local_business", "services", "ecommerce", "multilingual"] as const;
export type SiteKind = (typeof SITE_KINDS)[number];

/** Month and day it starts each year; topics to have ready by then. */
export type SeasonalEvent = { name: string; month: number; day: number; topics: string[] };

export type ProfileCorrections = Partial<{
  kinds: SiteKind[];
  businessModel: string;
  offerings: string[];
  revenueObjectives: string[];
  audience: string;
  languages: string[];
  /** Locales to research, the site's own first (es-ES, es-MX). */
  markets: string[];
  /** Places within the markets; kept for relevance, providers are asked by country. */
  regions: string[];
  topics: string[];
  excludedTopics: string[];
  seasonalEvents: SeasonalEvent[];
}>;

export type DerivedProfile = {
  version: 1;
  kinds: SiteKind[];
  businessModel: SeoProfile;
  audience: string | null;
  languages: string[];
  topics: string[];
  offerings: string[];
  entities: Array<{ name: string; type: string; mentions: number }>;
  coverage: Array<{ topic: string; pages: number }>;
  content: { pages: number; read: number; byType: Record<string, number>; queriesCovered: number; internalLinks: number };
  sitemaps: Array<{ url: string; status: string; urls: number | null }>;
  competitors: Array<{ id: string; domain: string; verified: boolean }>;
  capacity: { articlesPerWeek: number | null; basis: "settings" | "observed" | "unknown" };
  firstParty: { searchConsole: boolean; through: string | null; clicks28d: number | null; impressions28d: number | null };
  seasonal: string[];
};

export type ResearchProfile = {
  siteId: string;
  kinds: ProfileField<SiteKind[]>;
  businessModel: ProfileField<string>;
  offerings: ProfileField<string[]>;
  revenueObjectives: ProfileField<string[]>;
  audience: ProfileField<string>;
  languages: ProfileField<string[]>;
  markets: ProfileField<string[]>;
  regions: ProfileField<string[]>;
  topics: ProfileField<string[]>;
  excludedTopics: ProfileField<string[]>;
  seasonalEvents: ProfileField<SeasonalEvent[]>;
  derived: DerivedProfile;
  derivedAt: string;
  corrections: ProfileCorrections;
  reviewedAt: string | null;
  policy: ResearchPolicy;
};

const strings = (value: unknown): string[] => (Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())) : []);
const DERIVED_TTL_MS = 24 * 3_600_000;

/** Website articles a week: the cadence people set, or what was really scheduled; null when neither says. */
export async function editorialCapacity(tenantId: string, siteId: string, now = new Date()): Promise<DerivedProfile["capacity"]> {
  const settings = await getSitePlanningSettings(tenantId, siteId);
  if (settings.persisted) return { articlesPerWeek: settings.articlesPerDay * settings.weekdays.length, basis: "settings" };
  const scheduled = await prisma.editorialPlanItem.count({
    where: { tenantId, siteId, channel: "website", status: { notIn: ["rejected", "canceled"] }, scheduledFor: { gte: addDays(now, -30), lt: addDays(now, 30) } },
  });
  return scheduled >= 4 ? { articlesPerWeek: Math.round((scheduled / 60) * 70) / 10, basis: "observed" } : { articlesPerWeek: null, basis: "unknown" };
}

async function deriveProfile(tenantId: string, site: { id: string; type: string; locale: string; createdAt: Date }, now: Date): Promise<DerivedProfile> {
  const siteId = site.id;
  const [detected, editorial, entities, clusters, states, types, languages, links, sitemaps, competitors, capacity, connection, targets, structured, seasonal] = await Promise.all([
    prisma.siteIntelligenceProfile.findFirst({ where: { tenantId, siteId } }),
    prisma.siteEditorialProfile.findFirst({ where: { tenantId, siteId }, select: { language: true, categories: true } }),
    prisma.siteEntity.findMany({ where: { tenantId, siteId }, orderBy: { mentions: "desc" }, take: 25, select: { name: true, type: true, mentions: true } }),
    prisma.siteTopicCluster.findMany({ where: { tenantId, siteId }, orderBy: { pagesCount: "desc" }, take: 40, select: { name: true, pagesCount: true } }),
    prisma.siteIndexedPage.groupBy({ by: ["crawlState"], where: { tenantId, siteId }, _count: { _all: true } }),
    prisma.siteIndexedPage.groupBy({ by: ["contentType"], where: { tenantId, siteId }, _count: { _all: true } }),
    prisma.siteIndexedPage.groupBy({ by: ["language"], where: { tenantId, siteId, language: { not: null } }, _count: { _all: true } }),
    prisma.siteInternalLink.count({ where: { tenantId, siteId } }),
    prisma.siteSitemap.findMany({ where: { tenantId, siteId }, take: 50, select: { url: true, status: true, urlCount: true } }),
    prisma.competitor.findMany({ where: { tenantId, siteId, status: "accepted" }, orderBy: { overlapScore: "desc" }, take: 20, select: { id: true, domain: true, verification: true } }),
    editorialCapacity(tenantId, siteId, now),
    prisma.searchConsoleConnection.findFirst({ where: { tenantId, siteId }, select: { status: true, syncedThrough: true } }),
    prisma.searchTarget.count({ where: { tenantId, siteId, status: "active" } }),
    prisma.siteIndexedPage.findMany({ where: { tenantId, siteId, crawlState: { in: ["extracted", "stale"] } }, take: 1_000, orderBy: { lastIndexedAt: "desc" }, select: { structuredData: true } }),
    prisma.contentOpportunity.findMany({ where: { tenantId, siteId, kind: { contains: "season" }, status: { in: ["open", "approved"] } }, take: 10, select: { topic: true } }),
  ]);
  const pages = states.reduce((sum, row) => sum + row._count._all, 0);
  const read = states.filter((row) => row.crawlState === "extracted" || row.crawlState === "stale").reduce((sum, row) => sum + row._count._all, 0);
  const schema = new Map<string, number>();
  for (const row of structured) for (const type of new Set(strings(row.structuredData))) schema.set(type, (schema.get(type) ?? 0) + 1);
  const share = (pattern: RegExp) => (structured.length ? [...schema].filter(([type]) => pattern.test(type)).reduce((sum, [, count]) => sum + count, 0) / structured.length : 0);
  // A language counts with a tenth of the pages: a few mislabelled ones do not make a site multilingual.
  const tagged = languages.reduce((sum, row) => sum + row._count._all, 0);
  const spoken = [...languages.reduce((map, row) => map.set(row.language!.slice(0, 2).toLowerCase(), (map.get(row.language!.slice(0, 2).toLowerCase()) ?? 0) + row._count._all), new Map<string, number>())]
    .filter(([, count]) => count >= 5 && count >= tagged * 0.1).sort((a, b) => b[1] - a[1]).map(([language]) => language);
  const totals = connection?.syncedThrough ? await siteTotals(tenantId, siteId, addDays(connection.syncedThrough, -27), connection.syncedThrough) : null;
  const businessModel: SeoProfile = share(/^(Product|Offer|ProductGroup)$/) > 0.15 ? "ecommerce"
    : share(/LocalBusiness|Restaurant|Dentist|Store$|MedicalClinic|HealthAndBeautyBusiness/) > 0.15 ? "local_business"
      : defaultSeoProfile(site.type, detected?.detectedSiteType ?? null);
  const established = pages >= 50 || (totals?.impressions ?? 0) >= 1_000;
  const kinds: SiteKind[] = [established ? "established" : "new_website"];
  if (businessModel === "publisher" || businessModel === "local_business" || businessModel === "services" || businessModel === "ecommerce") kinds.push(businessModel);
  if (businessModel === "corporate") kinds.push("services");
  if (spoken.length > 1) kinds.push("multilingual");
  const fallbackLanguage = (detected?.detectedLanguage ?? editorial?.language ?? site.locale).slice(0, 2).toLowerCase();
  return {
    version: 1, kinds, businessModel, audience: detected?.detectedAudience ?? null, languages: spoken.length ? spoken : [fallbackLanguage],
    topics: strings(detected?.mainTopics), offerings: entities.filter((entity) => /product|service|producto|servicio/i.test(entity.type)).map((entity) => entity.name).slice(0, 15),
    entities, coverage: clusters.map((cluster) => ({ topic: cluster.name, pages: cluster.pagesCount })),
    content: { pages, read, byType: Object.fromEntries(types.map((row) => [row.contentType ?? "unknown", row._count._all])), queriesCovered: targets, internalLinks: links },
    sitemaps: sitemaps.map((sitemap) => ({ url: sitemap.url, status: sitemap.status, urls: sitemap.urlCount })),
    competitors: competitors.map((competitor) => ({ id: competitor.id, domain: competitor.domain, verified: competitor.verification === "verified" })),
    capacity,
    firstParty: { searchConsole: connection?.status === "active", through: connection?.syncedThrough?.toISOString().slice(0, 10) ?? null, clicks28d: totals?.clicks ?? null, impressions28d: totals?.impressions ?? null },
    seasonal: seasonal.map((row) => row.topic),
  };
}

const field = <T>(...options: Array<[T | null | undefined, ProfileSource]>): ProfileField<T> => {
  for (const [value, source] of options) if (value !== null && value !== undefined && value !== "" && !(Array.isArray(value) && value.length === 0)) return { value, source };
  return { value: null, source: "unknown" };
};

/** The profile in force. `rebuild` derives it again from stored data; otherwise at most once a day. */
export async function getResearchProfile(tenantId: string, siteId: string, options: { rebuild?: boolean; now?: Date } = {}): Promise<ResearchProfile> {
  const now = options.now ?? new Date();
  const site = await prisma.site.findFirst({ where: { id: siteId, tenantId }, select: { id: true, type: true, locale: true, createdAt: true } });
  if (!site) throw new Error("site_not_found");
  const [stored, strategy, seo] = await Promise.all([
    prisma.siteResearchProfile.findFirst({ where: { tenantId, siteId } }),
    getApprovedStrategy(tenantId, siteId),
    prisma.siteSeoProfile.findFirst({ where: { tenantId, siteId } }),
  ]);
  let derived = stored?.derived as DerivedProfile | null | undefined;
  let derivedAt = stored?.derivedAt ?? null;
  if (options.rebuild || !derived || !derivedAt || now.getTime() - derivedAt.getTime() > DERIVED_TTL_MS) {
    derived = await deriveProfile(tenantId, site, now);
    derivedAt = now;
    const data = { derived: derived as unknown as Prisma.InputJsonObject, derivedAt };
    await prisma.siteResearchProfile.upsert({ where: { siteId }, create: { tenantId, siteId, ...data }, update: data });
  }
  const corrections = (stored?.corrections ?? {}) as ProfileCorrections;
  const approved = strategy?.config ?? null;
  const language = seoMarket(site.locale)?.language ?? site.locale.slice(0, 2);
  return {
    siteId,
    kinds: field<SiteKind[]>([corrections.kinds, "corrected"], [derived.kinds, "detected"]),
    businessModel: field<string>([corrections.businessModel, "corrected"], [isSeoProfile(seo?.profile) ? seo!.profile : null, "configured"], [derived.businessModel, "detected"]),
    offerings: field<string[]>([corrections.offerings, "corrected"], [derived.offerings, "detected"]),
    // Nobody can read them from a website: unknown until someone says.
    revenueObjectives: field<string[]>([corrections.revenueObjectives, "corrected"], [approved?.seoObjectives, "approved"]),
    audience: field<string>([corrections.audience, "corrected"], [approved?.primaryAudience, "approved"], [derived.audience, "detected"]),
    languages: field<string[]>([corrections.languages, "corrected"], [approved?.languages, "approved"], [derived.languages, "detected"]),
    markets: field<string[]>([corrections.markets, "corrected"], [[site.locale], "configured"]),
    regions: field<string[]>([corrections.regions, "corrected"]),
    topics: field<string[]>(
      [corrections.topics, "corrected"],
      [[...new Set([...strings(seo?.priorityTopics), ...(approved?.pillars ?? []).filter((pillar) => pillar.included).map((pillar) => pillar.name)])], "approved"],
      [derived.topics.length ? derived.topics : derived.coverage.map((entry) => entry.topic), "detected"],
    ),
    excludedTopics: field<string[]>([[...new Set([...(corrections.excludedTopics ?? []), ...(approved?.excludedTopics ?? [])])], corrections.excludedTopics?.length ? "corrected" : "approved"]),
    seasonalEvents: field<SeasonalEvent[]>([corrections.seasonalEvents, "corrected"]),
    derived: { ...derived, languages: derived.languages.length ? derived.languages : [language] },
    derivedAt: derivedAt.toISOString(), corrections, reviewedAt: stored?.reviewedAt?.toISOString() ?? null, policy: readResearchPolicy(stored?.policy),
  };
}

const LISTS = ["offerings", "revenueObjectives", "regions", "topics", "excludedTopics"] as const;

/** Validated corrections; null in a field removes it. Throws `invalid_corrections`. */
export function parseCorrections(input: unknown, current: ProfileCorrections = {}): ProfileCorrections {
  const bad = (): never => { throw new Error("invalid_corrections"); };
  if (!input || typeof input !== "object" || Array.isArray(input)) return bad();
  const out: Record<string, unknown> = { ...current };
  const list = (value: unknown, max: number): string[] => {
    if (!Array.isArray(value) || value.length > max || value.some((item) => typeof item !== "string" || !item.trim() || item.length > 100)) return bad();
    return [...new Set(value.map((item: string) => item.trim()))];
  };
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (value === null) delete out[key];
    else if ((LISTS as readonly string[]).includes(key)) out[key] = list(value, 40);
    else if (key === "businessModel" || key === "audience") out[key] = typeof value === "string" && value.trim() && value.length <= 300 ? value.trim() : bad();
    else if (key === "kinds") out[key] = list(value, SITE_KINDS.length).every((kind) => (SITE_KINDS as readonly string[]).includes(kind)) ? list(value, SITE_KINDS.length) : bad();
    else if (key === "languages") out[key] = list(value, 10).map((code) => (/^[a-z]{2}$/i.test(code) ? code.toLowerCase() : bad()));
    else if (key === "markets") out[key] = list(value, 5).map((locale) => (/^[a-z]{2}-[A-Z]{2}$/.test(locale) && seoMarket(locale) ? locale : bad()));
    else if (key === "seasonalEvents") {
      if (!Array.isArray(value) || value.length > 20) return bad();
      out[key] = value.map((event: Partial<SeasonalEvent>) => {
        const days = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
        const { name, month, day } = event ?? {};
        if (typeof name !== "string" || !name.trim() || name.length > 100 || !Number.isInteger(month) || month! < 1 || month! > 12 || !Number.isInteger(day) || day! < 1 || day! > days[month! - 1]) return bad();
        return { name: name.trim(), month, day, topics: list(event.topics ?? [], 10) };
      });
    } else return bad();
  }
  return out as ProfileCorrections;
}

/** A person's corrections and policy. What is detected later never changes them. */
export async function saveResearchProfile(tenantId: string, siteId: string, input: { corrections?: unknown; policy?: unknown; reviewed?: boolean }, userId: string | null): Promise<ResearchProfile> {
  const current = await getResearchProfile(tenantId, siteId);
  const stored = await prisma.siteResearchProfile.findFirstOrThrow({ where: { tenantId, siteId }, select: { policy: true } });
  const data: Prisma.SiteResearchProfileUpdateInput = {};
  if (input.corrections !== undefined) data.corrections = parseCorrections(input.corrections, current.corrections) as Prisma.InputJsonObject;
  if (input.policy !== undefined) data.policy = { ...((stored.policy ?? {}) as Prisma.JsonObject), ...parseResearchPolicy(input.policy) } as Prisma.InputJsonObject;
  if (input.corrections !== undefined || input.reviewed) Object.assign(data, { reviewedAt: new Date(), reviewedByUserId: userId });
  // What changed may justify research: look again soon.
  data.nextCheckAt = new Date();
  await prisma.siteResearchProfile.update({ where: { siteId }, data });
  await writeAudit({ tenantId, actorType: userId ? "user" : "system", actorUserId: userId, action: "seo_research.profile_updated", entityType: "site", entityId: siteId, metadata: { corrections: input.corrections ?? null, policy: input.policy ?? null, reviewed: Boolean(input.reviewed) } });
  return getResearchProfile(tenantId, siteId);
}

/** Subjects a run may ask about: what people chose first, then what was detected. */
export function researchTopics(profile: ResearchProfile): string[] {
  const excluded = new Set((profile.excludedTopics.value ?? []).map(normalizeKeyword));
  return [...new Set([...(profile.topics.value ?? []), ...(profile.offerings.value ?? []), ...profile.derived.coverage.map((entry) => entry.topic)].map(normalizeKeyword))].filter((topic) => topic && topic.length <= 80 && !excluded.has(topic));
}
