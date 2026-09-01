import { Prisma } from "@prisma/client";
import { getPrismaClient } from "../infrastructure/db/prisma";
import { getNumberEnv } from "../shared/utils/env";
import { structuredEvent } from "../shared/utils/logger";
import { normalizeCanonicalUrl, deriveExternalId, upsertSourceItem } from "./sources";
import { getWebIntelligenceProvider, hostnameOf, type WebIntelligenceProvider, type WebSearchResult } from "./web-intelligence";
import { planDiscovery, type DiscoveryQueryPlan } from "./discovery-planner";
import {
  evaluateDomainQuality,
  loadBlockedDomainSet,
  recommendSource,
  saveSourceQualityProfile,
  upsertDiscoveredDomain,
} from "./source-quality";
import { scoreAndPromoteSourceItem } from "./editorial";
import { writeAudit } from "./audit";
import { sha256 } from "../shared/utils/hash";

const prisma = getPrismaClient();

// In-memory per-process locks so overlapping ticks/manual runs cannot stack up.
const runningTenants = new Set<string>();

export type DiscoveryRunResult = {
  tenantId: string;
  planned: number;
  searched: number;
  candidatesFound: number;
  scraped: number;
  itemsCreated: number;
  itemsUpdated: number;
  recommendations: number;
  skipped: string | null;
};

export async function getOrCreateDiscoveryConfig(tenantId: string, siteId: string | null = null) {
  const existing = await prisma.discoveryConfig.findFirst({ where: { tenantId, siteId } });
  if (existing) {
    return existing;
  }
  return prisma.discoveryConfig.create({
    data: {
      tenantId,
      siteId,
      enabled: true,
      mode: "recommend",
      frequencyMinutes: 30,
      languages: ["es", "en"] as Prisma.InputJsonValue,
      regions: [] as Prisma.InputJsonValue,
      maxSearchesPerDay: 100,
      maxScrapesPerDay: 250,
      maxDiscoveryCostPerDay: new Prisma.Decimal(5),
      preferPrimarySources: true,
      requireTwoSources: true,
      avoidLowAuthority: true,
      detectDevelopingStories: true,
      autoEnableSources: false,
      minRecommendationScore: 0.6,
    },
  });
}

export async function updateDiscoveryConfig(tenantId: string, siteId: string | null, input: Record<string, unknown>, userId: string | null) {
  const config = await getOrCreateDiscoveryConfig(tenantId, siteId);
  const patch: Prisma.DiscoveryConfigUpdateInput = {};
  if (typeof input.enabled === "boolean") patch.enabled = input.enabled;
  if (typeof input.mode === "string" && ["manual", "recommend", "automatic"].includes(input.mode)) {
    patch.mode = input.mode;
  }
  if (typeof input.frequencyMinutes === "number") {
    patch.frequencyMinutes = Math.max(5, Math.min(1440, input.frequencyMinutes));
  }
  if (Array.isArray(input.languages)) patch.languages = input.languages.map(String) as Prisma.InputJsonValue;
  if (Array.isArray(input.regions)) patch.regions = input.regions.map(String) as Prisma.InputJsonValue;
  if (typeof input.maxSearchesPerDay === "number") patch.maxSearchesPerDay = Math.max(1, Math.min(500, input.maxSearchesPerDay));
  if (typeof input.maxScrapesPerDay === "number") patch.maxScrapesPerDay = Math.max(1, Math.min(1000, input.maxScrapesPerDay));
  if (typeof input.maxDiscoveryCostPerDay === "number") patch.maxDiscoveryCostPerDay = new Prisma.Decimal(input.maxDiscoveryCostPerDay);
  if (typeof input.preferPrimarySources === "boolean") patch.preferPrimarySources = input.preferPrimarySources;
  if (typeof input.requireTwoSources === "boolean") patch.requireTwoSources = input.requireTwoSources;
  if (typeof input.avoidLowAuthority === "boolean") patch.avoidLowAuthority = input.avoidLowAuthority;
  if (typeof input.detectDevelopingStories === "boolean") patch.detectDevelopingStories = input.detectDevelopingStories;
  if (typeof input.autoEnableSources === "boolean") patch.autoEnableSources = input.autoEnableSources;
  if (typeof input.minRecommendationScore === "number") patch.minRecommendationScore = Math.max(0, Math.min(1, input.minRecommendationScore));
  if (userId) patch.updatedByStudioUserId = userId;

  return prisma.discoveryConfig.update({ where: { id: config.id }, data: patch });
}

// ────────────────────────────────────────────────────────────── Usage accounting

export type DailyUsage = {
  searches: number;
  scrapes: number;
  estimatedCostUsd: number;
};

export async function getDailyUsage(tenantId: string, providerName: string): Promise<DailyUsage> {
  const since = new Date();
  since.setHours(0, 0, 0, 0);
  const records = await prisma.webUsageRecord.findMany({
    where: { tenantId, provider: providerName, createdAt: { gte: since } },
    select: { queries: true, urlsScraped: true, estimatedCostUsd: true },
  });
  return records.reduce(
    (acc, record) => ({
      searches: acc.searches + record.queries,
      scrapes: acc.scrapes + record.urlsScraped,
      estimatedCostUsd: acc.estimatedCostUsd + Number(record.estimatedCostUsd ?? 0),
    }),
    { searches: 0, scrapes: 0, estimatedCostUsd: 0 },
  );
}

export async function recordWebUsage(input: {
  tenantId: string;
  siteId: string | null;
  provider: string;
  operation: "search" | "scrape";
  queries?: number;
  urlsScraped?: number;
  tokensIn?: number;
  tokensOut?: number;
  estimatedCostUsd?: number;
}): Promise<void> {
  await prisma.webUsageRecord.create({
    data: {
      tenantId: input.tenantId,
      siteId: input.siteId,
      provider: input.provider,
      operation: input.operation,
      queries: input.queries ?? 0,
      urlsScraped: input.urlsScraped ?? 0,
      tokensIn: input.tokensIn ?? 0,
      tokensOut: input.tokensOut ?? 0,
      estimatedCostUsd: new Prisma.Decimal(input.estimatedCostUsd ?? 0),
    },
  });
}

function estimateSearchCost(queryCount: number): number {
  // Firecrawl /search: $1 per 1,000 requests (documented list price). Kept
  // conservative and configurable.
  return (queryCount * getNumberEnv("WEB_SEARCH_COST_USD_PER_QUERY", 0.001));
}

function estimateScrapeCost(urlCount: number): number {
  return urlCount * getNumberEnv("WEB_SCRAPE_COST_USD_PER_PAGE", 0.0015);
}

// ────────────────────────────────────────────────────────────── Candidate collection

function freshnessHoursFor(freshness: DiscoveryQueryPlan["freshness"]): number {
  switch (freshness) {
    case "breaking":
      return 24;
    case "recent":
      return 72;
    default:
      return 24 * 30;
  }
}

function dedupeCandidates(results: WebSearchResult[]): Map<string, WebSearchResult> {
  const byUrl = new Map<string, WebSearchResult>();
  for (const result of results) {
    const normalized = normalizeCanonicalUrl(result.url);
    if (!normalized) {
      continue;
    }
    const key = normalized.replace(/\/$/, "");
    const existing = byUrl.get(key);
    if (!existing || (result.score ?? 0) > (existing.score ?? 0)) {
      byUrl.set(key, { ...result, url: normalized });
    }
  }
  return byUrl;
}

export async function ensureDomainSource(tenantId: string, domain: string, language: string): Promise<string> {
  const existing = await prisma.contentSource.findFirst({ where: { tenantId, name: domain } });
  if (existing) {
    return existing.id;
  }
  const created = await prisma.contentSource.create({
    data: {
      tenantId,
      name: domain,
      type: "html",
      url: `https://${domain}`,
      enabled: true,
      priority: 0,
      trustScore: 0.5,
      language,
      categories: ["ai_discovery"] as Prisma.InputJsonValue,
      configuration: { discoveredBy: "ai_web_discovery" } as Prisma.InputJsonObject,
    },
  });
  return created.id;
}

// ────────────────────────────────────────────────────────────── Main run

export async function runWebDiscoveryForTenant(tenantId: string): Promise<DiscoveryRunResult> {
  const result: DiscoveryRunResult = {
    tenantId,
    planned: 0,
    searched: 0,
    candidatesFound: 0,
    scraped: 0,
    itemsCreated: 0,
    itemsUpdated: 0,
    recommendations: 0,
    skipped: null,
  };

  if (runningTenants.has(tenantId)) {
    result.skipped = "already_running";
    return result;
  }
  const provider = getWebIntelligenceProvider();
  if (!provider) {
    result.skipped = "web_intelligence_provider_not_configured";
    structuredEvent("web.discovery.failed", { tenantId, reason: result.skipped }, "warn");
    return result;
  }
  const config = await getOrCreateDiscoveryConfig(tenantId);
  if (!config.enabled) {
    result.skipped = "discovery_disabled";
    return result;
  }

  const usage = await getDailyUsage(tenantId, provider.name);
  if (usage.searches >= config.maxSearchesPerDay) {
    result.skipped = "daily_search_limit_reached";
    structuredEvent("web.discovery.failed", { tenantId, reason: result.skipped }, "warn");
    return result;
  }

  runningTenants.add(tenantId);
  try {
    structuredEvent("web.discovery.started", { tenantId, provider: provider.name });

    let plan: DiscoveryQueryPlan | null = null;
    try {
      const planned = await planDiscovery(tenantId, null);
      if (planned) {
        plan = planned.plan;
      }
    } catch (error) {
      structuredEvent("web.discovery.failed", { tenantId, reason: "planner_failed", error: error instanceof Error ? error.message : String(error) }, "warn");
    }
    if (!plan) {
      result.skipped = "no_plan";
      return result;
    }

    const blocked = await loadBlockedDomainSet(tenantId);
    const freshnessHours = freshnessHoursFor(plan.freshness);
    const site = await prisma.site.findFirst({ where: { tenantId }, orderBy: { createdAt: "asc" }, select: { baseUrl: true } });
    const siteBaseHost = site?.baseUrl ? hostnameOf(site.baseUrl) : null;
    const topicKeywords = [...plan.topics, ...plan.entities].map((entry) => entry.toLowerCase());

    const remainingSearches = config.maxSearchesPerDay - usage.searches;
    const remainingScrapes = Math.max(0, config.maxScrapesPerDay - usage.scrapes);
    const queryLimit = Math.min(plan.queries.length, remainingSearches);

    const allCandidates = new Map<string, WebSearchResult>();
    const domainScores = new Map<string, { score: number; tier: string; searches: number; reason: string }>();

    for (const query of plan.queries.slice(0, queryLimit)) {
      const dbQuery = await prisma.webDiscoveryQuery.create({
        data: {
          tenantId,
          trigger: "scheduled",
          status: "running",
          category: query.category,
          queryText: query.queryText,
          freshnessHours,
          language: plan.language,
          country: plan.country,
          entities: plan.entities as Prisma.InputJsonValue,
          topics: plan.topics as Prisma.InputJsonValue,
          preferredDomains: plan.preferredDomains as Prisma.InputJsonValue,
          excludedDomains: plan.excludedDomains as Prisma.InputJsonValue,
          reasoningSummary: plan.reasoningSummary,
          provider: provider.name,
        },
      });

      let results: WebSearchResult[] = [];
      try {
        results = await provider.search(query.queryText, {
          limit: 10,
          freshnessHours,
          language: plan.language,
          country: plan.country,
        });
        result.searched += 1;
        await recordWebUsage({
          tenantId,
          siteId: null,
          provider: provider.name,
          operation: "search",
          queries: 1,
          estimatedCostUsd: estimateSearchCost(1),
        });
      } catch (error) {
        await prisma.webDiscoveryQuery.update({
          where: { id: dbQuery.id },
          data: { status: "failed", error: error instanceof Error ? error.message.slice(0, 500) : String(error), executedAt: new Date() },
        });
        structuredEvent("web.discovery.search.failed", { tenantId, query: query.queryText.slice(0, 80), error: error instanceof Error ? error.message : String(error) }, "warn");
        continue;
      }

      const candidates = dedupeCandidates(results).values();
      for (const candidate of candidates) {
        if (!candidate.domain || blocked.has(candidate.domain)) {
          continue;
        }
        if (plan.excludedDomains.some((excluded) => candidate.domain === excluded || candidate.domain.endsWith(`.${excluded}`))) {
          continue;
        }
        allCandidates.set(candidate.url, candidate);

        // Domain quality scoring (deterministic signals, no LLM).
        const existingSource = await prisma.contentSource.findFirst({
          where: { tenantId, url: { contains: candidate.domain } },
          select: { trustScore: true, consecutiveFailures: true, lastSuccessAt: true, lastFetchedAt: true, refreshIntervalMinutes: true, language: true, country: true },
        });
        const quality = evaluateDomainQuality({
          tenantId,
          domain: candidate.domain,
          topicKeywords,
          language: plan.language,
          blockedDomains: blocked,
          siteBaseHost,
          source: existingSource,
          resultDescription: candidate.description,
          publishedAt: candidate.publishedAt,
        });
        if (quality.tier !== "BLOCKED") {
          await upsertDiscoveredDomain(tenantId, candidate.domain, quality);
          const previous = domainScores.get(candidate.domain);
          if (!previous || quality.score > previous.score) {
            domainScores.set(candidate.domain, {
              score: quality.score,
              tier: quality.tier,
              searches: (previous?.searches ?? 0) + 1,
              reason: candidate.title.slice(0, 200),
            });
          } else if (previous) {
            domainScores.set(candidate.domain, { ...previous, searches: previous.searches + 1 });
          }
        }
      }

      await prisma.webDiscoveryQuery.update({
        where: { id: dbQuery.id },
        data: {
          status: "done",
          executedAt: new Date(),
          resultsJson: results.slice(0, 10).map((entry) => ({ url: entry.url, title: entry.title, domain: entry.domain })) as Prisma.InputJsonValue,
        },
      });
      structuredEvent("web.discovery.search.completed", { tenantId, query: query.queryText.slice(0, 80), results: results.length });
    }

    result.candidatesFound = allCandidates.size;

    // Scrape a bounded selection ordered by search relevance.
    const ranked = Array.from(allCandidates.values()).sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    const scrapeLimit = Math.min(remainingScrapes, getNumberEnv("WEB_DISCOVERY_MAX_SCRAPES_PER_RUN", 25));
    let scrapedCount = 0;
    for (const candidate of ranked) {
      if (scrapedCount >= scrapeLimit) {
        break;
      }
      const domainEntry = domainScores.get(candidate.domain);
      const domainScore = domainEntry?.score ?? 40;
      if (config.avoidLowAuthority && domainScore < 40) {
        continue;
      }
      const domain = candidate.domain || "unknown";
      const extraction = await scrapeSafely(provider, candidate.url, tenantId);
      scrapedCount += 1;
      result.scraped += 1;
      await recordWebUsage({
        tenantId,
        siteId: null,
        provider: provider.name,
        operation: "scrape",
        urlsScraped: 1,
        estimatedCostUsd: estimateScrapeCost(1),
      });
      if (!extraction) {
        continue;
      }

      try {
        const sourceId = await ensureDomainSource(tenantId, domain, plan.language);
        const author = extraction.author;
        const item = {
          externalId: deriveExternalId(candidate.url, extraction.title ?? candidate.title),
          canonicalUrl: normalizeCanonicalUrl(candidate.url),
          sourceUrl: normalizeCanonicalUrl(candidate.url),
          title: (extraction.title ?? candidate.title ?? domain).slice(0, 400),
          description: extraction.description ?? candidate.description,
          rawText: extraction.articleText,
          cleanedText: extraction.articleText,
          author,
          authors: author ? [author] : [],
          publishedAt: extraction.publishedAt ?? candidate.publishedAt,
          modifiedAt: null,
          sourceImageUrls: extraction.images,
          language: extraction.language ?? plan.language,
          categories: plan.topics,
          tags: [],
          rawMetadata: { provider: provider.name, publisher: extraction.publisher },
          attribution: null,
          confidence: 0.8,
        };
        const upserted = await upsertSourceItem(tenantId, sourceId, item);
        if (upserted.created) {
          result.itemsCreated += 1;
        } else if (upserted.updated) {
          result.itemsUpdated += 1;
        } else {
          continue;
        }
        if (!upserted.sourceItemId) {
          continue;
        }

        // Provenance: retrieval record referencing the source item.
        const contentHash = sha256(`${item.title}\n${item.cleanedText ?? ""}`.slice(0, 4000));
        await prisma.webRetrieval.create({
          data: {
            tenantId,
            sourceItemId: upserted.sourceItemId,
            sourceId,
            url: candidate.url,
            contentHash,
            status: "done",
            title: item.title,
            publisher: extraction.publisher,
            publishedAt: item.publishedAt ? new Date(item.publishedAt) : null,
            articleText: extraction.articleText?.slice(0, 50_000) ?? null,
            entities: extraction.entities as Prisma.InputJsonValue,
            claims: extraction.claims as Prisma.InputJsonValue,
            provider: provider.name,
            retrievedAt: new Date(),
          },
        });

        // Score, cluster and promote through the existing editorial pipeline.
        const fresh = await prisma.sourceItem.findFirst({ where: { id: upserted.sourceItemId, tenantId } });
        if (fresh) {
          const context = {
            sourceTrustScore: Math.max(0.3, domainScore / 100),
            sourcePriority: Math.max(0, Math.round(domainScore / 20) - 2),
          };
          try {
            await scoreAndPromoteSourceItem(tenantId, fresh, context);
            structuredEvent("web.discovery.candidate.created", {
              tenantId,
              sourceItemId: fresh.id,
              domain,
              title: fresh.title.slice(0, 120),
            });
          } catch (error) {
            structuredEvent("web.discovery.candidate.failed", { tenantId, url: candidate.url, error: error instanceof Error ? error.message : String(error) }, "warn");
          }
        }
      } catch (error) {
        structuredEvent("web.discovery.scrape.ingest_failed", { tenantId, url: candidate.url, error: error instanceof Error ? error.message : String(error) }, "warn");
      }
    }

    // Recommendations for recurring high-quality domains.
    const configMin = config.minRecommendationScore;
    for (const [domain, entry] of domainScores) {
      if (entry.searches >= 2 && entry.score >= configMin * 100 * 0.8) {
        const outcome = await recommendSource({
          tenantId,
          domain,
          score: entry.score,
          searchesCount: entry.searches,
          reasonSummary: entry.reason,
          autoEnable: config.mode === "automatic" && config.autoEnableSources,
          minScore: configMin * 100,
          language: plan.language,
        });
        if (outcome.accepted) {
          result.recommendations += 1;
          structuredEvent("web.discovery.source.recommended", { tenantId, domain, score: entry.score, accepted: true });
        }
      }
    }

    structuredEvent("web.discovery.completed", {
      tenantId,
      searched: result.searched,
      candidatesFound: result.candidatesFound,
      scraped: result.scraped,
      itemsCreated: result.itemsCreated,
      itemsUpdated: result.itemsUpdated,
      recommendations: result.recommendations,
    });

    await writeAudit({
      tenantId,
      actorType: "automation",
      action: "web.discovery.run",
      entityType: "discovery_config",
      entityId: null,
      metadata: {
        searched: result.searched,
        candidatesFound: result.candidatesFound,
        scraped: result.scraped,
        itemsCreated: result.itemsCreated,
        itemsUpdated: result.itemsUpdated,
        recommendations: result.recommendations,
        provider: provider.name,
      },
    });

    return result;
  } finally {
    runningTenants.delete(tenantId);
  }
}

async function scrapeSafely(provider: WebIntelligenceProvider, url: string, tenantId: string): Promise<ReturnType<WebIntelligenceProvider["scrape"]>> {
  try {
    return await provider.scrape(url);
  } catch (error) {
    structuredEvent("web.discovery.scrape.failed", { tenantId, url, error: error instanceof Error ? error.message : String(error) }, "warn");
    return null;
  }
}

// ────────────────────────────────────────────────────────────── Worker tick

export async function runWebDiscoveryTick(): Promise<{ tenants: number; runs: DiscoveryRunResult[] }> {
  const provider = getWebIntelligenceProvider();
  if (!provider) {
    structuredEvent("web.discovery.failed", { reason: "web_intelligence_provider_not_configured" }, "warn");
    return { tenants: 0, runs: [] };
  }
  const tenants = await prisma.tenant.findMany({
    where: { status: "active" },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  const runs: DiscoveryRunResult[] = [];
  for (const tenant of tenants) {
    try {
      const config = await prisma.discoveryConfig.findFirst({ where: { tenantId: tenant.id } });
      if (!config || config.mode === "manual") {
        continue; // manual mode only runs on explicit user trigger
      }
      const result = await runWebDiscoveryForTenant(tenant.id);
      if (!result.skipped) {
        runs.push(result);
      }
    } catch (error) {
      structuredEvent("web.discovery.failed", { tenantId: tenant.id, error: error instanceof Error ? error.message : String(error) }, "error");
    }
  }
  return { tenants: runs.length, runs };
}
