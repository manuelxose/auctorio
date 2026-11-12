import { getPrismaClient } from "../infrastructure/db/prisma";
import type { SiteIntelligenceProfileSummary } from "./site-intelligence/profile";
import { rebuildSiteProfile } from "./site-intelligence/profile";
import type { SiteTopicCluster } from "@prisma/client";
import { getApprovedStrategy, strategyExclusions, type StrategyConfig } from "./site-intelligence/strategy";

const prisma = getPrismaClient();

/** Detected profile with the approved strategy layered on top (exclusions enforced by site-relevance). */
export type PlanningProfile = SiteIntelligenceProfileSummary & { strategyExclusions?: string[] };

/**
 * Approved strategy beats inferred defaults: approved pillars lead the topic space, excluded
 * pillars/topics leave it (and become hard exclusions), audience/language/tone/formats override.
 * Pure: never mutates the persisted detected profile.
 */
export function applyApprovedStrategy(profile: SiteIntelligenceProfileSummary, config: StrategyConfig): PlanningProfile {
  const exclusions = strategyExclusions(config);
  const banned = new Set(exclusions.map((term) => term.toLowerCase()));
  const keep = (value: string) => !banned.has(value.toLowerCase());
  const included = config.pillars.filter((pillar) => pillar.included).sort((a, b) => b.weight - a.weight);
  const excludedSlugs = new Set(config.pillars.filter((pillar) => !pillar.included).map((pillar) => pillar.clusterSlug ?? pillar.name.toLowerCase()));
  const pillarTopics = included.flatMap((pillar) => [pillar.name, ...pillar.subtopics]);
  const contentTypes = [...(profile.contentTypes ?? [])];
  for (const format of config.preferredFormats) {
    if (!contentTypes.some((entry) => entry.type === format)) contentTypes.push({ type: format, count: 0 });
  }
  return {
    ...profile,
    mainTopics: Array.from(new Set([...pillarTopics, ...(profile.mainTopics ?? [])])).filter(keep),
    categories: Array.from(new Set([...config.priorityCategories, ...(profile.categories ?? [])])).filter(keep),
    commercialTopics: (profile.commercialTopics ?? []).filter(keep),
    evergreenTopics: (profile.evergreenTopics ?? []).filter(keep),
    newsTopics: (profile.newsTopics ?? []).filter(keep),
    sportsTopics: (profile.sportsTopics ?? []).filter(keep),
    topicClusters: (profile.topicClusters ?? []).filter((cluster) => !excludedSlugs.has(cluster.slug) && !excludedSlugs.has(cluster.name.toLowerCase()) && keep(cluster.name)),
    contentTypes,
    excludedTopics: Array.from(new Set([...(profile.excludedTopics ?? []), ...exclusions])),
    detectedAudience: config.primaryAudience ?? profile.detectedAudience,
    detectedLanguage: config.languages[0] ?? profile.detectedLanguage,
    editorialTone: config.writingStyle ?? profile.editorialTone,
    strategyExclusions: exclusions,
  };
}

export type PlanningEvidence = {
  sourceType: "source" | "indexed-page" | "profile";
  url?: string;
  title: string;
  trustScore?: number;
};

export type EditorialPlanningContext = {
  site: { id: string; name: string; type: string; baseUrl: string | null; locale: string };
  profile: PlanningProfile | null;
  /** Operator-approved editorial strategy (versioned); null until someone approves one. */
  approvedStrategy?: { version: number; config: StrategyConfig; exclusions: string[] } | null;
  profileWarnings: string[];
  topIndexedPages: Array<{ url: string; title: string; contentType: string | null }>;
  indexedUrlInventory: string[];
  searchTargets: string[];
  existingPlanQueries: string[];
  existingPlanTitles: string[];
  recentProjectTitles: string[];
  sourceTitles: Array<{ title: string; trustScore: number | null }>;
  clusters: SiteTopicCluster[];
  evidence: PlanningEvidence[];
  assemblyMs: number;
};

/** Load the persisted profile, or rebuild it from already-crawled data if stale. */
async function loadProfile(tenantId: string, siteId: string): Promise<SiteIntelligenceProfileSummary | null> {
  const existing = await prisma.siteIntelligenceProfile.findUnique({ where: { siteId } });
  const maxAgeMs = 7 * 24 * 3600_000;
  if (existing?.indexedAt && Date.now() - existing.indexedAt.getTime() < maxAgeMs) {
    return existing as unknown as SiteIntelligenceProfileSummary;
  }
  const site = await prisma.site.findFirst({ where: { id: siteId, tenantId } });
  if (!site) {
    return null;
  }
  const pageCount = await prisma.siteIndexedPage.count({ where: { tenantId, siteId, crawlState: { in: ["extracted", "stale"] } } });
  if (pageCount === 0 && existing) {
    return existing as unknown as SiteIntelligenceProfileSummary;
  }
  if (pageCount === 0) {
    return null;
  }
  try {
    return await rebuildSiteProfile(site);
  } catch {
    return (existing as unknown as SiteIntelligenceProfileSummary) ?? null;
  }
}

/**
 * Compact, ranked site-scoped evidence for editorial plan generation.
 * Never mixes other tenants' or other sites' data.
 */
export async function buildEditorialPlanningContext(tenantId: string, siteId: string): Promise<EditorialPlanningContext> {
  const started = Date.now();
  const site = await prisma.site.findFirst({ where: { id: siteId, tenantId } });
  if (!site) {
    throw new Error("site_not_found");
  }

  const [detectedProfile, approved, topPages, indexedUrls, searchTargets, futureItems, recentProjects, siteSources, sharedSources, allClusters] = await Promise.all([
    loadProfile(tenantId, siteId),
    getApprovedStrategy(tenantId, siteId),
    prisma.siteIndexedPage.findMany({
      where: { tenantId, siteId, crawlState: { in: ["extracted", "stale"] } },
      orderBy: [{ modifiedAt: "desc" }, { wordCount: "desc" }],
      take: 40,
      select: { url: true, title: true, contentType: true },
    }),
    prisma.siteIndexedPage.findMany({
      where: { tenantId, siteId, crawlState: { in: ["extracted", "stale"] } },
      select: { url: true },
      take: 2000,
    }),
    prisma.searchTarget.findMany({ where: { tenantId, siteId, status: "active" }, select: { query: true } }),
    prisma.editorialPlanItem.findMany({
      where: { tenantId, siteId, scheduledFor: { gte: new Date() }, status: { in: ["proposed", "approved", "generating", "content_ready"] } },
      select: { title: true, targetQuery: true, primaryKeyword: true },
      take: 200,
    }),
    prisma.contentProject.findMany({
      where: { tenantId, siteId, deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: 30,
      select: { title: true },
    }),
    prisma.contentSource.findMany({
      where: { tenantId, siteId, enabled: true },
      select: { name: true, trustScore: true },
      take: 30,
    }),
    prisma.contentSource.findMany({
      where: { tenantId, siteId: null, enabled: true },
      select: { name: true, trustScore: true },
      take: 15,
    }),
    prisma.siteTopicCluster.findMany({ where: { tenantId, siteId }, orderBy: { pagesCount: "desc" }, take: 25 }),
  ]);
  const profile: PlanningProfile | null = detectedProfile && approved ? applyApprovedStrategy(detectedProfile, approved.config) : detectedProfile;
  const exclusions = approved ? strategyExclusions(approved.config) : [];
  const excludedSlugs = new Set(approved?.config.pillars.filter((pillar) => !pillar.included).map((pillar) => pillar.clusterSlug ?? pillar.name.toLowerCase()) ?? []);
  const clusters = allClusters.filter((cluster) => !excludedSlugs.has(cluster.slug) && !excludedSlugs.has(cluster.name.toLowerCase()));

  const sourceItems = await prisma.sourceItem.findMany({
    where: {
      tenantId,
      processingStatus: "candidate",
      source: { OR: [{ siteId }, { siteId: null }] },
    },
    orderBy: [{ score: "desc" }, { discoveredAt: "desc" }],
    take: 15,
    select: { title: true, canonicalUrl: true, score: true },
  });

  const evidence: PlanningEvidence[] = [
    ...sourceItems.map((item) => ({
      sourceType: "source" as const,
      url: item.canonicalUrl ?? undefined,
      title: item.title,
      trustScore: item.score ?? undefined,
    })),
    ...topPages.slice(0, 12).map((page) => ({
      sourceType: "indexed-page" as const,
      url: page.url,
      title: page.title ?? page.url,
    })),
  ];

  return {
    site: { id: site.id, name: site.name, type: site.type, baseUrl: site.baseUrl, locale: site.locale },
    profile,
    approvedStrategy: approved ? { version: approved.version, config: approved.config, exclusions } : null,
    profileWarnings: profile?.warnings ?? [],
    topIndexedPages: topPages.map((page) => ({ url: page.url, title: page.title ?? page.url, contentType: page.contentType })),
    indexedUrlInventory: indexedUrls.map((page) => page.url),
    searchTargets: searchTargets.map((target) => target.query),
    existingPlanQueries: futureItems.map((item) => item.targetQuery).filter((value): value is string => Boolean(value)),
    existingPlanTitles: futureItems.map((item) => item.title),
    recentProjectTitles: recentProjects.map((project) => project.title),
    sourceTitles: [...siteSources, ...sharedSources].map((source) => ({ title: source.name, trustScore: source.trustScore })),
    clusters,
    evidence,
    assemblyMs: Date.now() - started,
  };
}

export type PlanningStrategy = {
  mode: string;
  primaryIntent?: string | null;
  contentFormats?: string[];
  audience?: string | null;
  market?: string | null;
  language?: string;
  objective?: string | null;
  campaignName?: string | null;
  priorityTopics?: string[];
  excludedTopics?: string[];
  existingCluster?: string | null;
  newCluster?: boolean;
  freeAiDiscovery?: boolean;
  seasonalEvents?: string[];
  brandsOrEntities?: string[];
  keywordSeeds?: string[];
};

/** Render compact ranked context for the LLM prompt. */
export function renderPlanningContext(context: EditorialPlanningContext, strategy: PlanningStrategy): string {
  const profile = context.profile;
  const lines: string[] = [];

  lines.push(`DESTINATION SITE: ${context.site.name} (type=${context.site.type}, language=${context.site.locale}, base=${context.site.baseUrl ?? "n/a"})`);

  if (profile) {
    lines.push(`SITE INTELLIGENCE (v${profile.version}, indexed ${profile.indexedAt ?? "?"}):`);
    lines.push(`- pages indexed: ${profile.pageCount}; site type: ${profile.detectedSiteType}; language: ${profile.detectedLanguage}`);
    lines.push(`- main topics: ${profile.mainTopics.slice(0, 20).join(", ") || "n/a"}`);
    lines.push(`- categories: ${profile.categories.slice(0, 12).join(", ") || "n/a"}`);
    lines.push(`- content types present: ${profile.contentTypes.map((entry) => entry.type).join(", ") || "n/a"}`);
    lines.push(`- clusters: ${profile.topicClusters.slice(0, 12).map((cluster) => `${cluster.name}(${cluster.pagesCount})`).join(", ") || "n/a"}`);
    const subjectSpace = [
      ...profile.topicClusters.slice(0, 12).map((cluster) => cluster.name),
      ...profile.sportsTopics,
      ...profile.commercialTopics,
      ...profile.evergreenTopics,
    ].filter(Boolean);
    if (subjectSpace.length > 0) {
      lines.push(`TOPIC SPACE — pick a DIFFERENT subject for every item (never repeat a subject, only vary its format if requested): ${subjectSpace.slice(0, 25).join(", ")}`);
    }
    lines.push(`- commercial topics: ${profile.commercialTopics.join(", ") || "n/a"}`);
    lines.push(`- evergreen topics: ${profile.evergreenTopics.join(", ") || "n/a"}`);
    lines.push(`- news topics: ${profile.newsTopics.join(", ") || "n/a"}`);
    lines.push(`- sports topics: ${profile.sportsTopics.join(", ") || "n/a"}`);
    lines.push(`- entities: ${profile.entities.slice(0, 15).map((entity) => entity.name).join(", ") || "n/a"}`);
    lines.push(`- common article length: ${profile.commonArticleLength ?? "n/a"} words; tone: ${profile.editorialTone ?? "n/a"}`);
    if (profile.warnings.length > 0) {
      lines.push(`- profile warnings: ${profile.warnings.join("; ")}`);
    }
  } else {
    lines.push("SITE INTELLIGENCE: none available. Propose only topics that clearly belong to the destination site type and language.");
  }

  const approved = context.approvedStrategy?.config ?? null;
  if (approved && context.approvedStrategy) {
    lines.push(`APPROVED EDITORIAL STRATEGY (operator-approved v${context.approvedStrategy.version}; overrides the inferred site intelligence above):`);
    if (approved.description) lines.push(`- editorial line: ${approved.description}`);
    if (approved.primaryAudience) lines.push(`- primary audience: ${approved.primaryAudience}`);
    if (approved.languages.length) lines.push(`- languages: ${approved.languages.join(", ")}`);
    if (approved.markets.length) lines.push(`- markets: ${approved.markets.join(", ")}`);
    const included = approved.pillars.filter((pillar) => pillar.included).sort((a, b) => b.weight - a.weight);
    if (included.length) {
      const total = included.reduce((sum, pillar) => sum + pillar.weight, 0) || 1;
      lines.push(`- content pillars (distribute items by weight): ${included
        .map((pillar) => `${pillar.name} [${Math.round((pillar.weight / total) * 100)}%]${pillar.subtopics.length ? ` (${pillar.subtopics.slice(0, 6).join(", ")})` : ""}`)
        .join("; ")}`);
    }
    if (approved.priorityCategories.length) lines.push(`- priority categories: ${approved.priorityCategories.join(", ")}`);
    if (approved.preferredFormats.length) lines.push(`- preferred formats: ${approved.preferredFormats.join(", ")}`);
    if (approved.searchIntents.length) lines.push(`- search-intent strategy: ${approved.searchIntents.join(", ")}`);
    if (approved.writingStyle) lines.push(`- writing style: ${approved.writingStyle}`);
    if (approved.seoObjectives.length) lines.push(`- SEO objectives: ${approved.seoObjectives.join("; ")}`);
    if (approved.sourcePolicy) lines.push(`- source policy: ${approved.sourcePolicy}`);
    if (approved.cadenceNotes) lines.push(`- cadence: ${approved.cadenceNotes}`);
    if (approved.editorialRestrictions.length) lines.push(`- editorial restrictions: ${approved.editorialRestrictions.join("; ")}`);
    if (approved.internalLinkingRules.length) lines.push(`- internal linking rules: ${approved.internalLinkingRules.join("; ")}`);
    if (context.approvedStrategy.exclusions.length) {
      lines.push(`- NEVER propose items about (items mentioning these are rejected): ${context.approvedStrategy.exclusions.join(", ")}`);
    }
  }

  lines.push(`EXISTING INDEXED PAGES (sample):${context.topIndexedPages.slice(0, 25).map((page) => page.title).join(" | ") || "n/a"}`);
  lines.push(`ALREADY TARGETED QUERIES: ${context.searchTargets.slice(0, 40).join(", ") || "none"}`);
  lines.push(`EXISTING PLAN QUERIES: ${context.existingPlanQueries.slice(0, 40).join(", ") || "none"}`);
  lines.push(`EXISTING PLAN TITLES: ${context.existingPlanTitles.slice(0, 40).join(" | ") || "none"}`);
  lines.push(`RECENT CONTENT: ${context.recentProjectTitles.slice(0, 15).join(" | ") || "none"}`);
  lines.push(`SITE SOURCES: ${context.sourceTitles.map((source) => source.title).join(" | ") || "none"}`);

  lines.push(`ALLOWED EVIDENCE URLS (use ONLY these in sourceEvidence.url):`);
  for (const entry of context.evidence.slice(0, 25)) {
    lines.push(`- [${entry.sourceType}] ${entry.title} ${entry.url ? `(${entry.url})` : ""}`);
  }
  if (context.evidence.length === 0) {
    lines.push("- none; use sourceType 'site' or 'profile' without url");
  }

  lines.push(`STRATEGY: mode=${strategy.mode}${strategy.primaryIntent ? `, primaryIntent=${strategy.primaryIntent}` : ""}${strategy.campaignName ? `, campaign=${strategy.campaignName}` : ""}`);
  lines.push(`OBJECTIVE: ${strategy.objective ?? "editorial growth aligned with the destination"}`);
  // Per-plan request values win; then the approved strategy; then what the crawl inferred.
  lines.push(`AUDIENCE: ${strategy.audience ?? approved?.primaryAudience ?? context.profile?.detectedAudience ?? "site audience"}`);
  const market = strategy.market ?? approved?.markets.join(", ");
  if (market) {
    lines.push(`MARKET: ${market}`);
  }
  const formats = strategy.contentFormats?.length ? strategy.contentFormats : (approved?.preferredFormats ?? []);
  if (formats.length) {
    lines.push(`PREFERRED CONTENT FORMATS: ${formats.join(", ")}`);
  }
  if (strategy.priorityTopics?.length) {
    lines.push(`PRIORITY TOPICS: ${strategy.priorityTopics.join(", ")}`);
  }
  const excludedTopics = Array.from(new Set([...(strategy.excludedTopics ?? []), ...(context.approvedStrategy?.exclusions ?? [])]));
  if (excludedTopics.length) {
    lines.push(`EXCLUDED TOPICS: ${excludedTopics.join(", ")}`);
  }
  if (strategy.keywordSeeds?.length) {
    lines.push(`KEYWORD SEEDS: ${strategy.keywordSeeds.join(", ")}`);
  }
  if (strategy.seasonalEvents?.length) {
    lines.push(`SEASONAL EVENTS: ${strategy.seasonalEvents.join(", ")}`);
  }
  if (strategy.brandsOrEntities?.length) {
    lines.push(`BRANDS/ENTITIES: ${strategy.brandsOrEntities.join(", ")}`);
  }

  return lines.join("\n");
}
