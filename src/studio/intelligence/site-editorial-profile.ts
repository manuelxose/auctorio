// SiteEditorialProfile (Phase 3): compact, reusable knowledge about a
// connected website. Built from permitted signals only — sitemap, existing
// article titles, categories, publishing taxonomy, configured editorial
// description, language, location, audience. Persisted once and reused by
// every candidate; the site is never re-crawled per candidate.
//
// Generic by design: no site is hardcoded (no GuiaTV special cases).

import { Prisma } from "@prisma/client";
import { getPrismaClient } from "../../infrastructure/db/prisma";
import { normalizeText } from "../../shared/utils/text";
import { titleSimilarity } from "../editorial";

const prisma = getPrismaClient();

export type ContentGap = {
  topic: string;
  score: number;
  reason: string;
};

export type SiteEditorialProfile = {
  siteId: string;
  profileVersion: number;
  builtAt: string;
  topics: string[];
  categories: string[];
  taxonomy: string[];
  audience: string[];
  language: string | null;
  location: string[];
  editorialDescription: string | null;
  contentGaps: ContentGap[];
  existingTitles: string[];
  sitemapUrl: string | null;
  articleStats: { articleCount: number; avgTitleTokens: number } | null;
};

export type BuildProfileInput = {
  /** Existing article titles from projects/indexed pages (bounded sample). */
  maxExistingTitles?: number;
  /** Only derive gaps for these topics (default: profile mainTopics). */
  now?: Date;
};

export function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map(String).filter((entry) => entry.trim().length > 0);
}

function readProfileTopicArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

/** Gather permitted signals and build the compact profile. */
export async function buildSiteEditorialProfile(
  tenantId: string,
  siteId: string,
  input: BuildProfileInput = {},
): Promise<SiteEditorialProfile | null> {
  const site = await prisma.site.findFirst({ where: { id: siteId, tenantId } });
  if (!site) {
    return null;
  }

  const maxTitles = input.maxExistingTitles ?? 250;

  const [intelligence, sitemaps, indexedPages, projects, sources, existingProfile] = await Promise.all([
    prisma.siteIntelligenceProfile.findUnique({ where: { siteId } }),
    prisma.siteSitemap.findMany({
      where: { siteId, status: { not: "failed" } },
      orderBy: { urlCount: "desc" },
      take: 3,
      select: { url: true },
    }),
    prisma.siteIndexedPage.findMany({
      where: { siteId, title: { not: null } },
      orderBy: { lastIndexedAt: "desc" },
      take: 120,
      select: { title: true, categories: true, language: true },
    }),
    prisma.contentProject.findMany({
      where: { siteId, deletedAt: null },
      orderBy: { updatedAt: "desc" },
      take: maxTitles,
      select: { title: true },
    }),
    prisma.contentSource.findMany({
      where: { tenantId, siteId, categories: { not: Prisma.JsonNull } },
      select: { categories: true },
      take: 50,
    }),
    prisma.siteEditorialProfile.findUnique({ where: { siteId } }),
  ]);

  const taxonomy = site.taxonomyMap ? readTaxonomy(site.taxonomyMap) : [];

  const categories = new Set<string>();
  for (const page of indexedPages) {
    for (const category of readStringArray(page.categories)) {
      categories.add(category.trim());
    }
  }
  for (const source of sources) {
    for (const category of readStringArray(source.categories)) {
      categories.add(category.trim());
    }
  }

  const existingTitles = projects.map((project) => project.title);

  const topics = intelligence ? readProfileTopicArray(intelligence.mainTopics) : [];
  const audience = intelligence && Array.isArray(intelligence.detectedAudience) ? readStringArray(intelligence.detectedAudience) : [];
  const language =
    indexedPages.find((page) => page.language)?.language ??
    intelligence?.detectedLanguage ??
    site.locale.split("-")[0] ??
    null;

  const articleStats = {
    articleCount: projects.length,
    avgTitleTokens: projects.length
      ? Math.round(projects.reduce((sum, project) => sum + normalizeText(project.title).split(/\s+/).filter(Boolean).length, 0) / projects.length)
      : 0,
  };

  // Content gaps: profile topics with no recent existing-title coverage.
  const contentGaps: ContentGap[] = [];
  for (const topic of topics.slice(0, 30)) {
    const topicText = normalizeText(topic);
    const covered = existingTitles.some((title) => normalizeText(title).includes(topicText) || titleSimilarity(title, topic) >= 0.5);
    if (!covered) {
      contentGaps.push({ topic, score: 0.6, reason: "no_existing_coverage" });
    }
  }

  const profile: SiteEditorialProfile = {
    siteId,
    profileVersion: (existingProfile?.profileVersion ?? 0) + 1,
    builtAt: new Date().toISOString(),
    topics,
    categories: Array.from(categories).slice(0, 80),
    taxonomy: taxonomy.slice(0, 80),
    audience,
    language,
    location: [],
    editorialDescription: site.brandVoice && typeof site.brandVoice === "object" ? readEditorialDescription(site.brandVoice) : null,
    contentGaps,
    existingTitles: existingTitles.slice(0, maxTitles),
    sitemapUrl: sitemaps[0]?.url ?? null,
    articleStats,
  };

  await persistSiteEditorialProfile(tenantId, siteId, profile);
  return profile;
}

function readTaxonomy(taxonomyMap: Prisma.JsonValue): string[] {
  if (!taxonomyMap || typeof taxonomyMap !== "object" || Array.isArray(taxonomyMap)) {
    return [];
  }
  const out: string[] = [];
  const record = taxonomyMap as Record<string, unknown>;
  for (const [key, value] of Object.entries(record)) {
    out.push(key);
    if (Array.isArray(value)) {
      for (const entry of value) {
        out.push(String(entry));
      }
    }
  }
  return out;
}

function readEditorialDescription(brandVoice: Prisma.JsonValue): string | null {
  if (!brandVoice || typeof brandVoice !== "object" || Array.isArray(brandVoice)) {
    return null;
  }
  const record = brandVoice as Record<string, unknown>;
  const description = record.description ?? record.editorialDescription ?? record.toneDescription;
  return typeof description === "string" && description.trim() ? description.trim().slice(0, 2000) : null;
}

export async function persistSiteEditorialProfile(
  tenantId: string,
  siteId: string,
  profile: SiteEditorialProfile,
): Promise<void> {
  await prisma.siteEditorialProfile.upsert({
    where: { siteId },
    create: {
      tenantId,
      siteId,
      profileVersion: profile.profileVersion,
      topics: profile.topics as Prisma.InputJsonValue,
      categories: profile.categories as Prisma.InputJsonValue,
      taxonomy: profile.taxonomy as Prisma.InputJsonValue,
      audience: profile.audience as Prisma.InputJsonValue,
      language: profile.language,
      location: profile.location as Prisma.InputJsonValue,
      editorialDescription: profile.editorialDescription,
      contentGaps: profile.contentGaps as Prisma.InputJsonValue,
      existingTitles: profile.existingTitles as Prisma.InputJsonValue,
      sitemapUrl: profile.sitemapUrl,
      articleStats: profile.articleStats as Prisma.InputJsonValue,
      builtAt: new Date(profile.builtAt),
    },
    update: {
      profileVersion: profile.profileVersion,
      topics: profile.topics as Prisma.InputJsonValue,
      categories: profile.categories as Prisma.InputJsonValue,
      taxonomy: profile.taxonomy as Prisma.InputJsonValue,
      audience: profile.audience as Prisma.InputJsonValue,
      language: profile.language,
      location: profile.location as Prisma.InputJsonValue,
      editorialDescription: profile.editorialDescription,
      contentGaps: profile.contentGaps as Prisma.InputJsonValue,
      existingTitles: profile.existingTitles as Prisma.InputJsonValue,
      sitemapUrl: profile.sitemapUrl,
      articleStats: profile.articleStats as Prisma.InputJsonValue,
      builtAt: new Date(profile.builtAt),
    },
  });
}

/** Read the persisted compact profile (never re-crawls anything). */
export async function getSiteEditorialProfile(
  tenantId: string,
  siteId: string,
): Promise<SiteEditorialProfile | null> {
  const row = await prisma.siteEditorialProfile.findUnique({ where: { siteId } });
  if (!row) {
    return null;
  }
  return {
    siteId: row.siteId,
    profileVersion: row.profileVersion,
    builtAt: row.builtAt.toISOString(),
    topics: readProfileTopicArray(row.topics),
    categories: readStringArray(row.categories),
    taxonomy: readStringArray(row.taxonomy),
    audience: readStringArray(row.audience),
    language: row.language,
    location: readStringArray(row.location),
    editorialDescription: row.editorialDescription,
    contentGaps: Array.isArray(row.contentGaps) ? (row.contentGaps as ContentGap[]) : [],
    existingTitles: readStringArray(row.existingTitles),
    sitemapUrl: row.sitemapUrl,
    articleStats: row.articleStats ? (row.articleStats as unknown as SiteEditorialProfile["articleStats"]) : null,
  };
}

export type SiteFitResult = {
  score: number;
  reasons: string[];
  gapHit: string | null;
  categoryHit: string | null;
  topicHit: string | null;
  languageOk: boolean;
};

/** Cheap singular/plural word-form comparison for topic matching. */
function topicWordForms(value: string): Set<string> {
  const forms = new Set<string>([value, `${value}s`, `${value}es`]);
  const ySuffix = /^(.*)y$/.exec(value);
  if (ySuffix) {
    forms.add(`${ySuffix[1]}ies`);
  }
  return forms;
}

/** Generic entity-type → editorial-topic aliases (domain-agnostic). */
const TYPE_TOPIC_ALIASES: Record<string, string[]> = {
  creative_work: ["movie", "film", "series", "show", "program", "tv"],
};

/** Deterministic site fit for one story (title + entities + categories). */
export function scoreSiteFit(
  profile: SiteEditorialProfile | null,
  input: {
    title: string;
    categories: string[];
    entityNames: string[];
    entityTypes: string[];
    language?: string | null;
  },
): SiteFitResult {
  const reasons: string[] = [];
  let score = 0;
  if (!profile) {
    return { score: 0.5, reasons: ["no_site_profile"], gapHit: null, categoryHit: null, topicHit: null, languageOk: true };
  }

  const text = normalizeText(`${input.title} ${input.entityNames.join(" ")}`).toLowerCase();
  const languageOk = !profile.language || !input.language || profile.language === input.language;
  if (languageOk) {
    score += 0.1;
  } else {
    reasons.push(`language_mismatch:${profile.language}`);
  }

  let topicHit: string | null = null;
  for (const topic of profile.topics.slice(0, 50)) {
    const topicText = normalizeText(topic);
    if (topicText.length >= 3 && text.includes(topicText)) {
      topicHit = topic;
      score += 0.3;
      reasons.push(`topic_match:${topic}`);
      break;
    }
  }
  // Entity-type-level topic match (e.g. site covers movies/series) using
  // singular/plural word forms so `movie` matches `movies`; generic types
  // (creative_work) alias to editorial topics.
  if (!topicHit) {
    const entityForms = new Set<string>();
    for (const type of input.entityTypes) {
      const normalized = normalizeText(type);
      for (const form of topicWordForms(normalized)) {
        entityForms.add(form);
      }
      for (const alias of TYPE_TOPIC_ALIASES[normalized] ?? []) {
        for (const form of topicWordForms(alias)) {
          entityForms.add(form);
        }
      }
    }
    for (const topic of profile.topics.slice(0, 50)) {
      const topicText = normalizeText(topic);
      const topicForms = topicWordForms(topicText);
      let matched = false;
      for (const form of topicForms) {
        if (form.length >= 4 && entityForms.has(form)) {
          matched = true;
          break;
        }
      }
      if (matched) {
        topicHit = topic;
        score += 0.2;
        reasons.push(`entity_type_match:${topic}`);
        break;
      }
    }
  }

  let categoryHit: string | null = null;
  const profileCategories = new Set(profile.categories.map((category) => normalizeText(category)));
  for (const category of input.categories) {
    if (profileCategories.has(normalizeText(category))) {
      categoryHit = category;
      score += 0.2;
      reasons.push(`category_match:${category}`);
      break;
    }
  }

  let gapHit: string | null = null;
  if (topicHit) {
    for (const gap of profile.contentGaps) {
      if (normalizeText(gap.topic) === normalizeText(topicHit)) {
        gapHit = gap.topic;
        score += 0.25;
        reasons.push(`content_gap:${gap.topic}`);
        break;
      }
    }
  }

  const covered = profile.existingTitles.some((existing) => titleSimilarity(input.title, existing) >= 0.6);
  if (covered) {
    score -= 0.3;
    reasons.push("already_covered");
  }

  return {
    score: Math.max(0, Math.min(1, Math.round(score * 100) / 100)),
    reasons,
    gapHit,
    categoryHit,
    topicHit,
    languageOk,
  };
}
