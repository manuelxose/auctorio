import { getPrismaClient } from "../infrastructure/db/prisma";
import type { SiteIntelligenceProfileSummary } from "./site-intelligence/profile";
import { rebuildSiteProfile } from "./site-intelligence/profile";
import type { SiteTopicCluster } from "@prisma/client";

const prisma = getPrismaClient();

export type PlanningEvidence = {
  sourceType: "source" | "indexed-page" | "profile";
  url?: string;
  title: string;
  trustScore?: number;
};

export type EditorialPlanningContext = {
  site: { id: string; name: string; type: string; baseUrl: string | null; locale: string };
  profile: SiteIntelligenceProfileSummary | null;
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

  const [profile, topPages, indexedUrls, searchTargets, futureItems, recentProjects, siteSources, sharedSources, clusters] = await Promise.all([
    loadProfile(tenantId, siteId),
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

  lines.push(`EXISTING INDEXED PAGES (sample): ${context.topIndexedPages.slice(0, 25).map((page) => page.title).join(" | ") || "n/a"}`);
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
  lines.push(`AUDIENCE: ${strategy.audience ?? context.profile?.detectedAudience ?? "site audience"}`);
  if (strategy.market) {
    lines.push(`MARKET: ${strategy.market}`);
  }
  if (strategy.contentFormats?.length) {
    lines.push(`PREFERRED CONTENT FORMATS: ${strategy.contentFormats.join(", ")}`);
  }
  if (strategy.priorityTopics?.length) {
    lines.push(`PRIORITY TOPICS: ${strategy.priorityTopics.join(", ")}`);
  }
  if (strategy.excludedTopics?.length) {
    lines.push(`EXCLUDED TOPICS: ${strategy.excludedTopics.join(", ")}`);
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
