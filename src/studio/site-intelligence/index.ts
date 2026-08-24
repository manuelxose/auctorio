import { Prisma } from "@prisma/client";
import type { Site } from "@prisma/client";
import { getPrismaClient } from "../../infrastructure/db/prisma";
import { getNumberEnv } from "../../shared/utils/env";
import { structuredEvent } from "../../shared/utils/logger";
import { writeAudit } from "../audit";
import { crawlPagesForSite, upsertDiscoveredPages } from "./crawler";
import { rebuildSiteProfile } from "./profile";
import { discoverSitemapsForSite } from "./sitemap";

const prisma = getPrismaClient();

export type SiteIntelligenceRefreshResult = {
  siteId: string;
  sitemapsDiscovered: number;
  urlsFromSitemaps: number;
  pagesCreated: number;
  pagesUpdated: number;
  pagesExtracted: number;
  pagesFailed: number;
  pagesSkipped: number;
  profileVersion: number;
  warnings: string[];
  durationMs: number;
};

export type SiteIntelligenceOverview = {
  site: { id: string; name: string; type: string; baseUrl: string | null };
  profile: Record<string, unknown> | null;
  sitemaps: Array<{ id: string; url: string; kind: string; status: string; urlCount: number | null; lastFetchedAt: string | null; error: string | null }>;
  pageStates: Record<string, number>;
  totalPages: number;
  extractedPages: number;
  clusters: Array<Record<string, unknown>>;
  indexing: boolean;
  lastRun: string | null;
};

const activeRuns = new Map<string, Promise<SiteIntelligenceRefreshResult>>();

export function isSiteIndexing(siteId: string): boolean {
  return activeRuns.has(siteId);
}

/** Full (re)index of a connected site: sitemap discovery → inventory → crawl → profile. */
export function refreshSiteIntelligence(
  tenantId: string,
  siteId: string,
  options: { crawl?: boolean; budget?: number; changedOnly?: boolean; force?: boolean } = {},
): Promise<SiteIntelligenceRefreshResult> {
  const running = activeRuns.get(siteId);
  if (running) {
    return running;
  }
  const promise = runRefresh(tenantId, siteId, options).finally(() => {
    activeRuns.delete(siteId);
  });
  activeRuns.set(siteId, promise);
  return promise;
}

async function runRefresh(
  tenantId: string,
  siteId: string,
  options: { crawl?: boolean; budget?: number; changedOnly?: boolean; force?: boolean },
): Promise<SiteIntelligenceRefreshResult> {
  const started = Date.now();
  const site = await prisma.site.findFirst({ where: { id: siteId, tenantId } });
  if (!site) {
    throw new Error("site_not_found");
  }
  const warnings: string[] = [];

  structuredEvent("site_intelligence.index.started", { tenantId, siteId, siteType: site.type });
  try {
    const discovery = await discoverSitemapsForSite(site, { force: options.force });
    warnings.push(...discovery.warnings);

    let pagesCreated = 0;
    let pagesUpdated = 0;
    const firstUrlset = discovery.sitemaps.find((sitemap) => sitemap.kind !== "sitemap_index");
    if (discovery.entries.length > 0) {
      const result = await upsertDiscoveredPages(
        tenantId,
        siteId,
        discovery.entries,
        firstUrlset?.id ?? null,
      );
      pagesCreated += result.created;
      pagesUpdated += result.updated;
    }

    let pagesExtracted = 0;
    let pagesFailed = 0;
    let pagesSkipped = 0;
    if (options.crawl !== false) {
      const crawlResult = await crawlPagesForSite(site, {
        budget: options.budget ?? getNumberEnv("SITE_INTEL_CRAWL_BUDGET", 200),
        changedOnly: options.changedOnly,
      });
      pagesExtracted = crawlResult.extracted;
      pagesFailed = crawlResult.failed;
      pagesSkipped = crawlResult.skipped;
      for (const error of crawlResult.errors) {
        warnings.push(error);
      }
    }

    const profile = await rebuildSiteProfile(site);
    const durationMs = Date.now() - started;

    structuredEvent("site_intelligence.index.completed", {
      tenantId,
      siteId,
      siteType: site.type,
      sitemapsDiscovered: discovery.sitemaps.length,
      urlsFromSitemaps: discovery.entries.length,
      pagesCreated,
      pagesExtracted,
      pagesFailed,
      profileVersion: profile.version,
      durationMs,
    });

    await writeAudit({
      tenantId,
      actorType: "system",
      action: "site_intelligence.index.completed",
      entityType: "site",
      entityId: siteId,
      metadata: {
        sitemapsDiscovered: discovery.sitemaps.length,
        urlsFromSitemaps: discovery.entries.length,
        pagesCreated,
        pagesUpdated,
        pagesExtracted,
        pagesFailed,
        pagesSkipped,
        profileVersion: profile.version,
        durationMs,
      },
    });

    return {
      siteId,
      sitemapsDiscovered: discovery.sitemaps.length,
      urlsFromSitemaps: discovery.entries.length,
      pagesCreated,
      pagesUpdated,
      pagesExtracted,
      pagesFailed,
      pagesSkipped,
      profileVersion: profile.version,
      warnings,
      durationMs,
    };
  } catch (error) {
    structuredEvent(
      "site_intelligence.index.failed",
      { tenantId, siteId, siteType: site.type, error: error instanceof Error ? error.message : String(error), durationMs: Date.now() - started },
      "error",
    );
    throw error;
  }
}

export async function getSiteIntelligenceOverview(tenantId: string, siteId: string): Promise<SiteIntelligenceOverview> {
  const site = await prisma.site.findFirst({ where: { id: siteId, tenantId } });
  if (!site) {
    throw new Error("site_not_found");
  }
  const [profile, sitemaps, pageGroups, clusters] = await Promise.all([
    prisma.siteIntelligenceProfile.findUnique({ where: { siteId: site.id } }),
    prisma.siteSitemap.findMany({ where: { tenantId, siteId: site.id }, orderBy: { lastFetchedAt: "desc" } }),
    prisma.siteIndexedPage.groupBy({ by: ["crawlState"], where: { tenantId, siteId: site.id }, _count: { _all: true } }),
    prisma.siteTopicCluster.findMany({ where: { tenantId, siteId: site.id }, orderBy: { pagesCount: "desc" } }),
  ]);

  const pageStates: Record<string, number> = {};
  let totalPages = 0;
  for (const group of pageGroups) {
    pageStates[group.crawlState] = group._count._all;
    totalPages += group._count._all;
  }
  const extractedPages = (pageStates.extracted ?? 0) + (pageStates.stale ?? 0);

  return {
    site: { id: site.id, name: site.name, type: site.type, baseUrl: site.baseUrl },
    profile: profile as unknown as Record<string, unknown> | null,
    sitemaps: sitemaps.map((sitemap) => ({
      id: sitemap.id,
      url: sitemap.url,
      kind: sitemap.kind,
      status: sitemap.status,
      urlCount: sitemap.urlCount,
      lastFetchedAt: sitemap.lastFetchedAt?.toISOString() ?? null,
      error: sitemap.error,
    })),
    pageStates,
    totalPages,
    extractedPages,
    clusters: clusters.map((cluster) => ({
      id: cluster.id,
      name: cluster.name,
      slug: cluster.slug,
      pagesCount: cluster.pagesCount,
      authorityScore: cluster.authorityScore,
      gapScore: cluster.gapScore,
      keywords: cluster.keywords,
      sampleUrls: cluster.sampleUrls,
    })),
    indexing: isSiteIndexing(siteId),
    lastRun: profile?.indexedAt?.toISOString() ?? null,
  };
}

export async function listIndexedPages(
  tenantId: string,
  siteId: string,
  options: { query?: string; crawlState?: string; page?: number; pageSize?: number } = {},
) {
  const page = Math.max(1, options.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, options.pageSize ?? 25));
  const where: Prisma.SiteIndexedPageWhereInput = { tenantId, siteId };
  if (options.query?.trim()) {
    where.OR = [
      { url: { contains: options.query.trim(), mode: "insensitive" } },
      { title: { contains: options.query.trim(), mode: "insensitive" } },
    ];
  }
  if (options.crawlState && options.crawlState !== "all") {
    where.crawlState = options.crawlState;
  }
  const [total, items] = await prisma.$transaction([
    prisma.siteIndexedPage.count({ where }),
    prisma.siteIndexedPage.findMany({
      where,
      orderBy: [{ crawlState: "asc" }, { modifiedAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        url: true,
        title: true,
        contentType: true,
        wordCount: true,
        crawlState: true,
        modifiedAt: true,
        lastIndexedAt: true,
      },
    }),
  ]);
  return { items, page, pageSize, total };
}

/** Upsert search targets so the planner can check which queries are already covered. */
export async function registerSearchTargets(
  tenantId: string,
  siteId: string,
  targets: Array<{ query: string; keyword?: string | null; intent?: string | null }>,
): Promise<{ created: number; updated: number }> {
  let created = 0;
  let updated = 0;
  for (const target of targets) {
    const normalizedQuery = target.query.trim().toLowerCase();
    if (!normalizedQuery) {
      continue;
    }
    const existing = await prisma.searchTarget.findUnique({
      where: { siteId_query: { siteId, query: normalizedQuery } },
    });
    if (existing) {
      await prisma.searchTarget.update({
        where: { id: existing.id },
        data: {
          keyword: target.keyword?.trim() || existing.keyword,
          intent: target.intent?.trim() || existing.intent,
          status: "active",
        },
      });
      updated += 1;
    } else {
      await prisma.searchTarget.create({
        data: {
          tenantId,
          siteId,
          query: normalizedQuery,
          keyword: target.keyword?.trim() || null,
          intent: target.intent?.trim() || null,
        },
      });
      created += 1;
    }
  }
  return { created, updated };
}
