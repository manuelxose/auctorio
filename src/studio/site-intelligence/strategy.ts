// Three-layer editorial strategy for a connected site:
//   detected  — machine evidence from the crawl (SiteIntelligenceProfile, rebuilt on reindex)
//   suggested — heuristic interpretation of that evidence (regenerated on demand / by onboarding)
//   approved  — operator-edited configuration, versioned; reindex and suggestion NEVER touch it.
// Planning reads only the approved layer (suggestions are never applied automatically).

import { Prisma } from "@prisma/client";
import { getPrismaClient } from "../../infrastructure/db/prisma";
import { CONTENT_FORMATS, SEARCH_INTENTS } from "../editorial-plan-schema";
import type { SiteIntelligenceProfileSummary } from "./profile";

const prisma = getPrismaClient();

export type StrategyPillar = {
  name: string;
  description: string | null;
  subtopics: string[];
  keywords: string[];
  weight: number;
  included: boolean;
  /** Topic cluster this pillar came from, when it was derived from or edited on a cluster. */
  clusterSlug: string | null;
};

export type StrategyConfig = {
  description: string | null;
  primaryAudience: string | null;
  languages: string[];
  markets: string[];
  pillars: StrategyPillar[];
  priorityCategories: string[];
  excludedTopics: string[];
  writingStyle: string | null;
  preferredFormats: string[];
  searchIntents: string[];
  seoObjectives: string[];
  sourcePolicy: string | null;
  cadenceNotes: string | null;
  editorialRestrictions: string[];
  internalLinkingRules: string[];
};

export type StrategyField = keyof StrategyConfig;
export const STRATEGY_FIELDS: StrategyField[] = [
  "description",
  "primaryAudience",
  "languages",
  "markets",
  "pillars",
  "priorityCategories",
  "excludedTopics",
  "writingStyle",
  "preferredFormats",
  "searchIntents",
  "seoObjectives",
  "sourcePolicy",
  "cadenceNotes",
  "editorialRestrictions",
  "internalLinkingRules",
];

export type Provenance = "approved" | "suggested" | "none";

export type StrategyLayers = {
  siteId: string;
  detected: DetectedEvidence | null;
  suggested: { config: StrategyConfig; source: string; generatedAt: string; evidence: Record<string, string> } | null;
  approved: { config: StrategyConfig; version: number; approvedAt: string | null; approvedByUserId: string | null } | null;
  effective: StrategyConfig;
  provenance: Record<StrategyField, Provenance>;
  /** Aligned with effective.pillars. */
  pillarProvenance: Provenance[];
};

export type DetectedEvidence = {
  profileVersion: number;
  indexedAt: string | null;
  pageCount: number;
  siteType: string | null;
  language: string | null;
  audience: string | null;
  brandSummary: string | null;
  tone: string | null;
  commonArticleLength: number | null;
  mainTopics: string[];
  categories: string[];
  contentTypes: Array<{ type: string; count: number }>;
  clusters: Array<{ name: string; slug: string; pagesCount: number; keywords: string[] }>;
};

export const EMPTY_STRATEGY: StrategyConfig = {
  description: null,
  primaryAudience: null,
  languages: [],
  markets: [],
  pillars: [],
  priorityCategories: [],
  excludedTopics: [],
  writingStyle: null,
  preferredFormats: [],
  searchIntents: [],
  seoObjectives: [],
  sourcePolicy: null,
  cadenceNotes: null,
  editorialRestrictions: [],
  internalLinkingRules: [],
};

// ────────────────────────────────────────────────────────────── Sanitizing (trust boundary)

function text(value: unknown, max = 2000): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().slice(0, max);
  return trimmed || null;
}

function list(value: unknown, maxItems = 40, maxLength = 200): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of value) {
    const item = text(entry, maxLength);
    if (item && !seen.has(item.toLowerCase())) {
      seen.add(item.toLowerCase());
      out.push(item);
    }
    if (out.length >= maxItems) break;
  }
  return out;
}

function pillar(value: unknown): StrategyPillar | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const name = text(record.name, 120);
  if (!name) return null;
  const weight = typeof record.weight === "number" && Number.isFinite(record.weight) ? record.weight : 1;
  return {
    name,
    description: text(record.description, 1000),
    subtopics: list(record.subtopics, 30, 120),
    keywords: list(record.keywords, 30, 120),
    weight: Math.max(0, Math.min(10, Math.round(weight * 100) / 100)),
    included: record.included !== false,
    clusterSlug: text(record.clusterSlug, 120),
  };
}

/** Normalize untrusted input (request body or stored JSON) into a complete config. */
export function sanitizeStrategyConfig(value: unknown): StrategyConfig {
  const record = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  const pillars: StrategyPillar[] = [];
  const names = new Set<string>();
  for (const entry of Array.isArray(record.pillars) ? record.pillars.slice(0, 40) : []) {
    const parsed = pillar(entry);
    if (parsed && !names.has(parsed.name.toLowerCase())) {
      names.add(parsed.name.toLowerCase());
      pillars.push(parsed);
    }
  }
  return {
    description: text(record.description),
    primaryAudience: text(record.primaryAudience, 500),
    languages: list(record.languages, 10, 20),
    markets: list(record.markets, 20, 60),
    pillars,
    priorityCategories: list(record.priorityCategories),
    excludedTopics: list(record.excludedTopics, 80),
    writingStyle: text(record.writingStyle, 1000),
    preferredFormats: list(record.preferredFormats, 20, 60),
    searchIntents: list(record.searchIntents, 20, 60),
    seoObjectives: list(record.seoObjectives, 20, 300),
    sourcePolicy: text(record.sourcePolicy, 1000),
    cadenceNotes: text(record.cadenceNotes, 500),
    editorialRestrictions: list(record.editorialRestrictions, 30, 300),
    internalLinkingRules: list(record.internalLinkingRules, 30, 300),
  };
}

function isEmptyValue(value: unknown): boolean {
  return value === null || value === undefined || (Array.isArray(value) && value.length === 0) || value === "";
}

function samePillar(a: StrategyPillar, b: StrategyPillar): boolean {
  return Boolean(a.clusterSlug && a.clusterSlug === b.clusterSlug) || a.name.toLowerCase() === b.name.toLowerCase();
}

/**
 * Field-level merge: approved wins where set, then the suggestion. Pillars merge per pillar
 * (approved ones, then suggestions not yet decided) with their own provenance.
 */
export function resolveEffectiveStrategy(
  approved: StrategyConfig | null,
  suggested: StrategyConfig | null,
): { effective: StrategyConfig; provenance: Record<StrategyField, Provenance>; pillarProvenance: Provenance[] } {
  const effective = { ...EMPTY_STRATEGY } as Record<StrategyField, unknown>;
  const provenance = {} as Record<StrategyField, Provenance>;
  const approvedPillars = approved?.pillars ?? [];
  const pendingSuggestions = (suggested?.pillars ?? []).filter((entry) => !approvedPillars.some((pillar) => samePillar(pillar, entry)));
  const pillarProvenance: Provenance[] = [...approvedPillars.map(() => "approved" as const), ...pendingSuggestions.map(() => "suggested" as const)];
  for (const field of STRATEGY_FIELDS) {
    if (field === "pillars") {
      effective.pillars = [...approvedPillars, ...pendingSuggestions];
      provenance.pillars = approvedPillars.length ? "approved" : pendingSuggestions.length ? "suggested" : "none";
      continue;
    }
    if (approved && !isEmptyValue(approved[field])) {
      effective[field] = approved[field];
      provenance[field] = "approved";
    } else if (suggested && !isEmptyValue(suggested[field])) {
      effective[field] = suggested[field];
      provenance[field] = "suggested";
    } else {
      provenance[field] = "none";
    }
  }
  return { effective: effective as StrategyConfig, provenance, pillarProvenance };
}

// ────────────────────────────────────────────────────────────── Detected evidence

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0) : [];
}

function readProfile(row: Record<string, unknown>): SiteIntelligenceProfileSummary {
  return row as unknown as SiteIntelligenceProfileSummary;
}

export function detectedFromProfile(profile: SiteIntelligenceProfileSummary | null): DetectedEvidence | null {
  if (!profile) return null;
  const indexedAt = profile.indexedAt as unknown;
  return {
    profileVersion: profile.version,
    indexedAt: indexedAt instanceof Date ? indexedAt.toISOString() : (indexedAt as string | null) ?? null,
    pageCount: profile.pageCount,
    siteType: profile.detectedSiteType ?? null,
    language: profile.detectedLanguage ?? null,
    audience: profile.detectedAudience ?? null,
    brandSummary: profile.brandSummary ?? null,
    tone: profile.editorialTone ?? null,
    commonArticleLength: profile.commonArticleLength ?? null,
    mainTopics: strings(profile.mainTopics),
    categories: strings(profile.categories),
    contentTypes: Array.isArray(profile.contentTypes) ? profile.contentTypes : [],
    clusters: (Array.isArray(profile.topicClusters) ? profile.topicClusters : []).map((cluster) => ({
      name: cluster.name,
      slug: cluster.slug,
      pagesCount: cluster.pagesCount,
      keywords: strings(cluster.keywords),
    })),
  };
}

// ────────────────────────────────────────────────────────────── Suggestion (deterministic heuristic)

const INTENT_SET = new Set<string>(SEARCH_INTENTS);
const FORMAT_SET = new Set<string>(CONTENT_FORMATS);

/**
 * Deterministic interpretation of crawl evidence. Every suggested field records the evidence it
 * came from, so the UI can show why it was proposed. No AI call: the source is reported as
 * "heuristic" so it is never presented as model output.
 */
export function suggestStrategyFromEvidence(
  profile: SiteIntelligenceProfileSummary,
  site: { locale: string },
  extra: { recentPagesPerWeek?: number | null } = {},
): { config: StrategyConfig; evidence: Record<string, string> } {
  const evidence: Record<string, string> = {};
  const clusters = [...(profile.topicClusters ?? [])].sort((a, b) => b.pagesCount - a.pagesCount).slice(0, 8);
  const maxPages = Math.max(1, ...clusters.map((cluster) => cluster.pagesCount));
  const pillars: StrategyPillar[] = clusters.map((cluster) => ({
    name: cluster.name,
    description: `${cluster.pagesCount} indexed page(s) in this cluster.`,
    subtopics: strings(cluster.keywords).slice(0, 6),
    keywords: strings(cluster.keywords).slice(0, 8),
    weight: Math.max(0.1, Math.round((cluster.pagesCount / maxPages) * 100) / 100),
    included: true,
    clusterSlug: cluster.slug,
  }));
  if (pillars.length) evidence.pillars = `${pillars.length} largest topic clusters from ${profile.pageCount} indexed page(s); weight = share of pages`;

  const languages = [profile.detectedLanguage ?? site.locale.split("-")[0]].filter((value): value is string => Boolean(value));
  evidence.languages = profile.detectedLanguage ? "detected from crawled pages" : "from the site locale";
  const region = site.locale.split("-")[1];
  const markets = region ? [region.toUpperCase()] : [];
  if (markets.length) evidence.markets = `from the site locale ${site.locale}`;

  const formats = (profile.contentTypes ?? [])
    .filter((entry) => FORMAT_SET.has(entry.type) && entry.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)
    .map((entry) => entry.type);
  if (formats.length) evidence.preferredFormats = "most frequent content formats observed on the site";

  const intents: string[] = [];
  if ((profile.evergreenTopics ?? []).length) intents.push("informational");
  if ((profile.commercialTopics ?? []).length) intents.push("commercial-investigation");
  if ((profile.newsTopics ?? []).length) intents.push("news");
  if ((profile.sportsTopics ?? []).length) intents.push("sports-live");
  if (intents.length) evidence.searchIntents = "topic families detected in page titles";

  const gaps = (profile.topicClusters ?? []).filter((cluster) => cluster.pagesCount > 0 && cluster.pagesCount <= Math.max(2, maxPages * 0.15));
  const seoObjectives = [
    ...(clusters[0] ? [`Grow topical authority in "${clusters[0].name}"`] : []),
    ...gaps.slice(0, 3).map((cluster) => `Close the coverage gap in "${cluster.name}" (${cluster.pagesCount} page(s))`),
  ];
  if (seoObjectives.length) evidence.seoObjectives = "largest cluster and thinly covered clusters";

  const linkTargets = (profile.internalLinkTargets ?? []).slice(0, 3);
  const internalLinkingRules = linkTargets.map((target) => `Link to hub page "${target.title || target.url}" when relevant`);
  if (internalLinkingRules.length) evidence.internalLinkingRules = "most linked internal pages";

  const styleParts = [profile.editorialTone ? `Tone: ${profile.editorialTone}` : null, profile.commonArticleLength ? `typical length ~${profile.commonArticleLength} words` : null].filter(Boolean);
  if (styleParts.length) evidence.writingStyle = "tone and article length measured on crawled pages";

  const cadenceNotes = extra.recentPagesPerWeek ? `About ${extra.recentPagesPerWeek} new or updated page(s) per week over the last 8 weeks` : null;
  if (cadenceNotes) evidence.cadenceNotes = "page modification dates from the sitemap/crawl";

  if (profile.brandSummary) evidence.description = "brand summary extracted from the site";
  if (profile.detectedAudience) evidence.primaryAudience = "audience detected from site content";
  const priorityCategories = strings(profile.categories).slice(0, 8);
  if (priorityCategories.length) evidence.priorityCategories = "site categories found in crawled pages";
  const excludedTopics = strings(profile.excludedTopics);

  return {
    config: sanitizeStrategyConfig({
      description: profile.brandSummary,
      primaryAudience: profile.detectedAudience,
      languages,
      markets,
      pillars,
      priorityCategories,
      excludedTopics,
      writingStyle: styleParts.join("; ") || null,
      preferredFormats: formats,
      searchIntents: intents.filter((intent) => INTENT_SET.has(intent)),
      seoObjectives,
      sourcePolicy: null,
      cadenceNotes,
      editorialRestrictions: [],
      internalLinkingRules,
    }),
    evidence,
  };
}

async function recentPagesPerWeek(tenantId: string, siteId: string): Promise<number | null> {
  const since = new Date(Date.now() - 56 * 24 * 3600_000);
  const count = await prisma.siteIndexedPage.count({ where: { tenantId, siteId, modifiedAt: { gte: since } } });
  return count > 0 ? Math.max(1, Math.round(count / 8)) : null;
}

async function ensureStrategyRow(tenantId: string, siteId: string) {
  return prisma.siteEditorialStrategy.upsert({ where: { siteId }, create: { tenantId, siteId }, update: {} });
}

/** Regenerate the suggested layer from the current profile. Never touches the approved layer. */
export async function regenerateStrategySuggestion(
  tenantId: string,
  siteId: string,
): Promise<{ generated: boolean; pillars: number; source: string | null; reason?: string }> {
  const site = await prisma.site.findFirst({ where: { id: siteId, tenantId } });
  if (!site) throw new Error("site_not_found");
  const row = await prisma.siteIntelligenceProfile.findUnique({ where: { siteId } });
  if (!row || row.tenantId !== tenantId) {
    return { generated: false, pillars: 0, source: null, reason: "no site profile yet; index the website first" };
  }
  const profile = readProfile(row as unknown as Record<string, unknown>);
  const { config, evidence } = suggestStrategyFromEvidence(profile, site, { recentPagesPerWeek: await recentPagesPerWeek(tenantId, siteId) });
  const source = `heuristic:site-profile-v${profile.version}`;
  await ensureStrategyRow(tenantId, siteId);
  await prisma.siteEditorialStrategy.update({
    where: { siteId },
    data: {
      suggested: { config, evidence } as unknown as Prisma.InputJsonObject,
      suggestedSource: source,
      suggestedAt: new Date(),
    },
  });
  return { generated: true, pillars: config.pillars.length, source };
}

// ────────────────────────────────────────────────────────────── Reading layers

export async function getApprovedStrategy(tenantId: string, siteId: string): Promise<{ config: StrategyConfig; version: number } | null> {
  const row = await prisma.siteEditorialStrategy.findFirst({ where: { tenantId, siteId } });
  if (!row || !row.approved || row.approvedVersion === 0) return null;
  return { config: sanitizeStrategyConfig(row.approved), version: row.approvedVersion };
}

export async function getStrategyLayers(tenantId: string, siteId: string): Promise<StrategyLayers> {
  const site = await prisma.site.findFirst({ where: { id: siteId, tenantId }, select: { id: true } });
  if (!site) throw new Error("site_not_found");
  const [row, profileRow] = await Promise.all([
    prisma.siteEditorialStrategy.findFirst({ where: { tenantId, siteId } }),
    prisma.siteIntelligenceProfile.findFirst({ where: { tenantId, siteId } }),
  ]);
  const suggestedJson = row?.suggested as { config?: unknown; evidence?: Record<string, string> } | null | undefined;
  const suggested = suggestedJson?.config
    ? {
        config: sanitizeStrategyConfig(suggestedJson.config),
        source: row?.suggestedSource ?? "heuristic",
        generatedAt: row?.suggestedAt?.toISOString() ?? new Date(0).toISOString(),
        evidence: suggestedJson.evidence ?? {},
      }
    : null;
  const approved = row?.approved && row.approvedVersion > 0
    ? {
        config: sanitizeStrategyConfig(row.approved),
        version: row.approvedVersion,
        approvedAt: row.approvedAt?.toISOString() ?? null,
        approvedByUserId: row.approvedByUserId,
      }
    : null;
  const { effective, provenance, pillarProvenance } = resolveEffectiveStrategy(approved?.config ?? null, suggested?.config ?? null);
  return {
    siteId,
    detected: detectedFromProfile(profileRow ? readProfile(profileRow as unknown as Record<string, unknown>) : null),
    suggested,
    approved,
    effective,
    provenance,
    pillarProvenance,
  };
}

// ────────────────────────────────────────────────────────────── Writing the approved layer (versioned)

export async function saveApprovedStrategy(
  tenantId: string,
  siteId: string,
  input: unknown,
  meta: { userId: string | null; note?: string | null; restoredFromVersion?: number | null },
): Promise<{ version: number; config: StrategyConfig }> {
  const site = await prisma.site.findFirst({ where: { id: siteId, tenantId }, select: { id: true } });
  if (!site) throw new Error("site_not_found");
  const config = sanitizeStrategyConfig(input);
  const strategy = await ensureStrategyRow(tenantId, siteId);
  return prisma.$transaction(async (tx) => {
    // Re-read inside the transaction so concurrent saves get distinct versions (unique constraint backs it).
    const current = await tx.siteEditorialStrategy.findUniqueOrThrow({ where: { id: strategy.id } });
    const version = current.approvedVersion + 1;
    await tx.siteEditorialStrategyVersion.create({
      data: {
        tenantId,
        siteId,
        strategyId: strategy.id,
        version,
        config: config as unknown as Prisma.InputJsonObject,
        note: text(meta.note, 500),
        restoredFromVersion: meta.restoredFromVersion ?? null,
        createdByUserId: meta.userId,
      },
    });
    await tx.siteEditorialStrategy.update({
      where: { id: strategy.id },
      data: {
        approved: config as unknown as Prisma.InputJsonObject,
        approvedVersion: version,
        approvedAt: new Date(),
        approvedByUserId: meta.userId,
      },
    });
    return { version, config };
  });
}

export async function listStrategyVersions(tenantId: string, siteId: string) {
  const rows = await prisma.siteEditorialStrategyVersion.findMany({
    where: { tenantId, siteId },
    orderBy: { version: "desc" },
    take: 50,
  });
  return rows.map((row) => ({
    version: row.version,
    note: row.note,
    restoredFromVersion: row.restoredFromVersion,
    createdByUserId: row.createdByUserId,
    createdAt: row.createdAt.toISOString(),
    config: sanitizeStrategyConfig(row.config),
  }));
}

export async function restoreStrategyVersion(tenantId: string, siteId: string, version: number, userId: string | null) {
  const row = await prisma.siteEditorialStrategyVersion.findFirst({ where: { tenantId, siteId, version } });
  if (!row) throw new Error("strategy_version_not_found");
  return saveApprovedStrategy(tenantId, siteId, row.config, { userId, note: `Restored version ${version}`, restoredFromVersion: version });
}

/**
 * Edit one pillar (topic cluster actions: rename/describe/keywords, include/exclude) in the
 * approved layer. Starts from the current approved config, or an empty one: editing one
 * cluster never silently approves the rest of the suggestion.
 */
export async function upsertApprovedPillar(
  tenantId: string,
  siteId: string,
  input: { clusterSlug?: string | null; name?: string | null; description?: string | null; keywords?: string[] | null; subtopics?: string[] | null; included?: boolean; weight?: number },
  userId: string | null,
) {
  const layers = await getStrategyLayers(tenantId, siteId);
  const base = layers.approved?.config ?? { ...EMPTY_STRATEGY };
  const slug = text(input.clusterSlug, 120);
  const pillars = [...base.pillars];
  let index = pillars.findIndex((entry) => (slug && entry.clusterSlug === slug) || (input.name && entry.name.toLowerCase() === input.name.toLowerCase()));
  if (index < 0) {
    // Seed from the suggestion (or the detected cluster) so unspecified fields keep their evidence.
    const dbCluster = slug && !layers.detected?.clusters.some((entry) => entry.slug === slug) ? await prisma.siteTopicCluster.findFirst({ where: { tenantId, siteId, slug } }) : null;
    const seed =
      layers.suggested?.config.pillars.find((entry) => (slug && entry.clusterSlug === slug) || (input.name && entry.name === input.name)) ??
      (() => {
        const cluster =
          layers.detected?.clusters.find((entry) => entry.slug === slug) ??
          (dbCluster ? { name: dbCluster.name, slug: dbCluster.slug, keywords: strings(dbCluster.keywords) } : undefined);
        return cluster
          ? { name: cluster.name, description: null, subtopics: cluster.keywords.slice(0, 6), keywords: cluster.keywords, weight: 1, included: true, clusterSlug: cluster.slug }
          : null;
      })();
    const name = text(input.name, 120) ?? seed?.name;
    if (!name) throw new Error("pillar_name_required");
    pillars.push({ ...(seed ?? { name, description: null, subtopics: [], keywords: [], weight: 1, included: true, clusterSlug: slug }), name });
    index = pillars.length - 1;
  }
  const current = pillars[index];
  pillars[index] = {
    ...current,
    ...(input.name !== undefined && text(input.name, 120) ? { name: text(input.name, 120)! } : {}),
    ...(input.description !== undefined ? { description: text(input.description, 1000) } : {}),
    ...(input.keywords ? { keywords: list(input.keywords, 30, 120) } : {}),
    ...(input.subtopics ? { subtopics: list(input.subtopics, 30, 120) } : {}),
    ...(typeof input.included === "boolean" ? { included: input.included } : {}),
    ...(typeof input.weight === "number" ? { weight: input.weight } : {}),
  };
  const action = typeof input.included === "boolean" ? (input.included ? "included" : "excluded") : "edited";
  return saveApprovedStrategy(tenantId, siteId, { ...base, pillars }, { userId, note: `Pillar "${pillars[index].name}" ${action}` });
}

// ────────────────────────────────────────────────────────────── Planning helpers (pure)

/** Every term an approved strategy forbids: excluded topics plus excluded pillars and their subtopics. */
export function strategyExclusions(config: StrategyConfig | null): string[] {
  if (!config) return [];
  const out = new Set<string>(config.excludedTopics);
  // A subtopic shared with an included pillar stays allowed; only what is unique to the excluded pillar is banned.
  const kept = new Set(
    config.pillars.filter((entry) => entry.included).flatMap((entry) => [entry.name, ...entry.subtopics, ...entry.keywords]).map((term) => term.toLowerCase()),
  );
  for (const entry of config.pillars) {
    if (!entry.included) {
      out.add(entry.name);
      for (const subtopic of entry.subtopics) {
        if (!kept.has(subtopic.toLowerCase())) out.add(subtopic);
      }
    }
  }
  return Array.from(out).filter((term) => term.trim().length >= 3);
}
