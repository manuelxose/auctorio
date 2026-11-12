// Cluster-specific pre-stages of the unified production pipeline
// (docs/adr/unified-production-pipeline.md). Classification, site value and
// the story brief stay specialized here; everything after the brief is the
// shared pipeline in src/studio/production/stages.ts.

import { getPrismaClient } from "../../infrastructure/db/prisma";
import { getIntelligenceSettings, resolveDomainsForSite } from "../intelligence/intelligence-settings";
import { getSiteEditorialProfile } from "../intelligence/site-editorial-profile";
import { suggestInternalLinks } from "../internal-linking";
import { getClassifiedStory, type ClassificationInput } from "./classifier";
import { resolveSiteValueBlocks, type SiteValueConfig } from "./site-value";
import { buildStoryBrief } from "./brief-builder";
import type { FactSafetyReport } from "./fact-safety";
import type { DuplicateCheckResult } from "./duplicate-check";
import type { ArticleType, EngineEnrichment, EngineEntity, FactLicense, LedgerFact, SearchIntent } from "./types";
import { isArticleType, isSearchIntent } from "./types";
import type { BriefArtifact, PreparedInput, ProductionRequestOptions } from "../production/types";

const prisma = getPrismaClient();

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

// ────────────────────────────────────────────────────────────── Ledger view

async function loadLedgerFacts(tenantId: string, clusterId: string): Promise<LedgerFact[]> {
  const rows = await prisma.storyFact.findMany({
    where: { tenantId, clusterId },
    orderBy: { extractedAt: "asc" },
    select: {
      factKey: true,
      statement: true,
      publisher: true,
      sourceUrl: true,
      confidence: true,
      verificationStatus: true,
      metadata: true,
      conflictingFacts: true,
    },
  });

  // Count distinct publisher groups per (factKey, statement).
  const groupCounts = new Map<string, Set<string>>();
  for (const row of rows) {
    const metadata = asRecord(row.metadata);
    const group = typeof metadata.publisher_group === "string" ? metadata.publisher_group : "unknown";
    const key = `${row.factKey}\u0000${row.statement.trim().toLowerCase()}`;
    const groups = groupCounts.get(key) ?? new Set<string>();
    groups.add(group);
    groupCounts.set(key, groups);
  }

  return rows.map((row) => {
    const key = `${row.factKey}\u0000${row.statement.trim().toLowerCase()}`;
    const metadata = asRecord(row.metadata);
    const alternatives = rows
      .filter(
        (other) =>
          other.factKey === row.factKey &&
          other.statement.trim().toLowerCase() !== row.statement.trim().toLowerCase(),
      )
      .map((other) => other.statement);
    return {
      factKey: row.factKey,
      statement: row.statement,
      publisher: row.publisher,
      publisherGroup: typeof metadata.publisher_group === "string" ? metadata.publisher_group : null,
      sourceUrl: row.sourceUrl,
      confidence: row.confidence,
      verificationStatus: row.verificationStatus,
      conflictingStatements: [...new Set(alternatives)],
      supportingGroups: groupCounts.get(key)?.size ?? 1,
    };
  });
}

async function loadClusterEntities(tenantId: string, clusterId: string): Promise<EngineEntity[]> {
  const links = await prisma.sourceItemEntity.findMany({
    where: { tenantId, item: { clusterId } },
    select: {
      confidence: true,
      entity: { select: { id: true, domain: true, type: true, name: true, externalIds: true } },
    },
  });
  const byId = new Map<string, EngineEntity>();
  for (const link of links) {
    const existing = byId.get(link.entity.id);
    if (!existing || link.confidence > existing.confidence) {
      byId.set(link.entity.id, {
        id: link.entity.id,
        domain: link.entity.domain,
        type: link.entity.type,
        name: link.entity.name,
        confidence: link.confidence,
        externalIds: asRecord(link.entity.externalIds) as Record<string, string>,
      });
    }
  }
  return Array.from(byId.values()).sort((left, right) => right.confidence - left.confidence);
}

async function loadClusterEnrichments(tenantId: string, entities: EngineEntity[]): Promise<EngineEnrichment[]> {
  if (entities.length === 0) {
    return [];
  }
  const rows = await prisma.providerEnrichment.findMany({
    where: { tenantId, entityId: { in: entities.map((entity) => entity.id) } },
    orderBy: { cachedAt: "desc" },
  });
  return rows.map((row) => ({
    entityId: row.entityId,
    providerKey: row.providerKey,
    title: row.title,
    originalTitle: row.originalTitle,
    releaseDate: row.releaseDate ? row.releaseDate.toISOString().slice(0, 10) : null,
    resourceType: row.resourceType,
    matchMethod: row.matchMethod,
    confidence: row.confidence,
    data: asRecord(row.data),
  }));
}

export function enrichmentKnowledgeOf(enrichments: EngineEnrichment[]): string[] {
  const knowledge: string[] = [];
  for (const enrichment of enrichments) {
    if (enrichment.title) {
      knowledge.push(enrichment.title);
    }
    if (enrichment.originalTitle) {
      knowledge.push(enrichment.originalTitle);
    }
    const data = enrichment.data;
    for (const key of ["cast", "crew", "studios", "genres", "franchise"]) {
      if (Array.isArray(data[key])) {
        knowledge.push(...data[key].map(String));
      } else if (typeof data[key] === "string" && data[key]) {
        knowledge.push(data[key]);
      }
    }
    if (typeof data.overview === "string" && data.overview) {
      knowledge.push(...data.overview.split(/\s+/).slice(0, 120));
    }
  }
  return knowledge.filter((entry) => entry.length > 0);
}

// ────────────────────────────────────────────────────────────── Preflight + prepare

/** Resolve and validate the cluster's target site before a job exists. */
export async function resolveClusterSite(tenantId: string, clusterId: string, siteId?: string | null): Promise<string> {
  const cluster = await prisma.storyCluster.findFirst({
    where: { id: clusterId, tenantId },
    include: {
      items: { orderBy: { discoveredAt: "asc" }, take: 1, include: { source: { select: { siteId: true } } } },
    },
  });
  if (!cluster) {
    throw new Error("cluster_not_found");
  }
  if (cluster.items.length === 0) {
    throw new Error("cluster_has_no_items");
  }
  const resolved = siteId ?? cluster.items[0]?.source?.siteId ?? null;
  if (!resolved) {
    throw new Error("site_required_for_generation");
  }
  const site = await prisma.site.findFirst({ where: { id: resolved, tenantId }, select: { id: true } });
  if (!site) {
    throw new Error("site_not_found");
  }
  return site.id;
}

export async function prepareClusterInput(
  tenantId: string,
  clusterId: string,
  siteId: string,
  options: ProductionRequestOptions,
  now: Date,
): Promise<PreparedInput> {
  const cluster = await prisma.storyCluster.findFirst({
    where: { id: clusterId, tenantId },
    include: {
      items: {
        orderBy: { discoveredAt: "asc" },
        take: 30,
        include: { source: { select: { id: true, name: true, domain: true, trustScore: true, siteId: true } } },
      },
    },
  });
  if (!cluster) {
    throw new Error("cluster_not_found");
  }
  const items = cluster.items;
  if (items.length === 0) {
    throw new Error("cluster_has_no_items");
  }
  const site = await prisma.site.findFirst({ where: { id: siteId, tenantId } });
  if (!site) {
    throw new Error("site_not_found");
  }

  const headline = cluster.headline ?? items[0].title;
  const summary = cluster.summary ?? items[0].description ?? null;
  const memberTitles = items.map((item) => item.title);
  const sourceTexts = items.flatMap((item) => [item.title, item.description ?? ""].filter(Boolean));
  const entities = await loadClusterEntities(tenantId, clusterId);
  const enrichments = await loadClusterEnrichments(tenantId, entities);
  const ledgerFacts = await loadLedgerFacts(tenantId, clusterId);

  const primaryEntityNames = entities
    .filter((entity) => ["movie", "tv_series", "creative_work"].includes(entity.type))
    .map((entity) => entity.name);
  const keywordForLinks = primaryEntityNames[0] ?? entities[0]?.name ?? headline;
  const internalLinks = await suggestInternalLinks(tenantId, siteId, { keyword: keywordForLinks, topic: headline, limit: 6 });
  const indexedPages = await prisma.siteIndexedPage.findMany({
    where: { tenantId, siteId, crawlState: { in: ["extracted", "stale"] } },
    select: { title: true },
    take: 250,
  });

  return {
    kind: "cluster",
    tenantId,
    siteId,
    site: { id: site.id, name: site.name, type: site.type, locale: site.locale, siteValueConfig: site.siteValueConfig },
    language: options.language === "en" ? "en" : "es",
    headline,
    summary,
    entities,
    enrichments,
    ledgerFacts,
    factContext: { clusterVerificationState: cluster.verificationState, independentPublisherGroups: cluster.sourceDiversity },
    memberTitles,
    sourceTexts,
    internalLinks,
    indexedPageTitles: indexedPages.map((page) => page.title ?? ""),
    siteFitScore: cluster.siteFitScore,
    primaryEntityNames: primaryEntityNames.length > 0 ? primaryEntityNames : entities.slice(0, 2).map((entity) => entity.name),
    ownProjectId: null,
    cluster: {
      id: cluster.id,
      status: cluster.status,
      primarySourceId: cluster.primarySourceId,
      categories: Array.isArray(cluster.categories) ? cluster.categories.map(String) : [],
      verificationState: cluster.verificationState,
      ageHours: Math.max(0, (now.getTime() - cluster.firstSeenAt.getTime()) / 3_600_000),
    },
    plan: null,
    options,
  };
}

// ────────────────────────────────────────────────────────────── Brief (classification + site value)

async function computeUpdateDelta(
  tenantId: string,
  projectId: string,
  licenses: FactLicense[],
): Promise<BriefArtifact["updateDelta"]> {
  const previous = await prisma.articleGeneration.findFirst({
    where: { tenantId, projectId, status: { notIn: ["failed", "skipped"] } },
    orderBy: { createdAt: "desc" },
  });
  if (!previous) {
    return null;
  }
  const previousLicenses = Array.isArray(previous.factLicenses)
    ? (previous.factLicenses as unknown as FactLicense[])
    : [];
  const previousByKey = new Map(previousLicenses.map((license) => [license.factKey, license.statement]));
  const newFacts: string[] = [];
  const changedFacts: Array<{ factKey: string; before: string; after: string }> = [];
  for (const license of licenses) {
    const before = previousByKey.get(license.factKey);
    if (before === undefined) {
      newFacts.push(`[${license.factKey}] ${license.statement}`);
    } else if (before !== license.statement) {
      changedFacts.push({ factKey: license.factKey, before, after: license.statement });
    }
  }
  return { newFacts, changedFacts, previousTitle: previous.brief ? String((previous.brief as Record<string, unknown>).primaryKeyword ?? "") : null };
}

export async function buildClusterBrief(
  input: PreparedInput,
  duplicate: DuplicateCheckResult,
  factSafety: FactSafetyReport,
  now: Date,
): Promise<BriefArtifact> {
  const cluster = input.cluster;
  if (!cluster) {
    throw new Error("cluster_input_missing");
  }
  const { tenantId, siteId, options } = input;

  const classificationInput: ClassificationInput = {
    headline: input.headline,
    summary: input.summary,
    memberTitles: input.memberTitles,
    categories: cluster.categories,
    verificationState: cluster.verificationState,
    entities: input.entities,
    facts: input.ledgerFacts,
    ageHours: cluster.ageHours,
  };
  let classification = getClassifiedStory(classificationInput);
  if (options.articleTypeOverride && isArticleType(options.articleTypeOverride)) {
    classification = {
      articleType: options.articleTypeOverride as ArticleType,
      searchIntent: options.searchIntentOverride && isSearchIntent(options.searchIntentOverride)
        ? (options.searchIntentOverride as SearchIntent)
        : classification.searchIntent,
      signals: [{ signal: "manual_override", detail: "article type overridden by the editor" }],
    };
  }
  if (duplicate.decision === "update_existing") {
    classification = { ...classification, articleType: "article_update", signals: [...classification.signals, { signal: "update_existing", detail: duplicate.reason }] };
  }

  const settings = await getIntelligenceSettings(tenantId);
  const editorialProfile = await getSiteEditorialProfile(tenantId, siteId);
  const domains = settings.domainsAuto
    ? editorialProfile
      ? resolveDomainsForSite(settings, editorialProfile.topics ?? [], editorialProfile.categories ?? [])
      : []
    : settings.enabledDomains;

  const siteValueConfig = input.site.siteValueConfig ? (input.site.siteValueConfig as SiteValueConfig) : null;
  const siteValueBlocks = resolveSiteValueBlocks({
    config: siteValueConfig,
    domains,
    locale: input.site.locale,
    entities: input.entities,
    enrichments: input.enrichments,
    internalLinks: input.internalLinks,
    factStatements: factSafety.licenses
      .filter((license) => license.usage === "state" || license.usage === "state_confidently")
      .map((license) => ({ factKey: license.factKey, statement: license.statement })),
  });

  const brief = buildStoryBrief({
    headline: input.headline,
    summary: input.summary,
    classification,
    factSafety,
    entities: input.entities,
    enrichments: input.enrichments,
    site: {
      siteId,
      siteName: input.site.name,
      siteType: input.site.type,
      locale: input.site.locale,
      internalLinks: input.internalLinks,
      indexedPageTitles: input.indexedPageTitles,
      siteValueBlocks,
    },
    ageHours: cluster.ageHours,
    now,
  });

  let previousArticle: BriefArtifact["previousArticle"] = null;
  let updateDelta: BriefArtifact["updateDelta"] = null;
  if (duplicate.decision === "update_existing" && duplicate.targetProjectId) {
    const targetProject = await prisma.contentProject.findFirst({
      where: { id: duplicate.targetProjectId, tenantId },
      include: { versions: { orderBy: { versionNumber: "desc" }, take: 1 } },
    });
    const previousVersion = targetProject?.versions[0];
    if (previousVersion?.bodyHtml && targetProject) {
      previousArticle = { title: previousVersion.title ?? targetProject.title, bodyHtml: previousVersion.bodyHtml };
    }
    updateDelta = await computeUpdateDelta(tenantId, duplicate.targetProjectId, factSafety.licenses);
  }

  return { brief, siteValueBlocks, previousArticle, updateDelta, guidance: [] };
}
