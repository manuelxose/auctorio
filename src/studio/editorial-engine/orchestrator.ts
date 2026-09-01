// Editorial engine orchestrator (Phase 4).
//
//   CLUSTER → duplicate decision → classification → fact safety →
//   site knowledge → editorial brief → writer prompt → AI writer →
//   parse → SEO → provenance → QA → publication gates → draft materialization
//
// Every artifact is persisted on the ArticleGeneration record so the Studio
// can show article, SEO, fact panel, sources, provenance, enrichment, QA
// warnings, internal links and social preview for human review.

import { Prisma } from "@prisma/client";
import { getPrismaClient } from "../../infrastructure/db/prisma";
import { getIntelligenceSettings } from "../intelligence/intelligence-settings";
import { getSiteEditorialProfile } from "../intelligence/site-editorial-profile";
import { suggestInternalLinks } from "../internal-linking";
import { sanitizeEditorialHtml } from "../html-sanitizer";
import { getOrCreatePolicy } from "../automation";
import { createPublication, enqueuePublication } from "../publication";
import { writeAudit } from "../audit";
import { getClassifiedStory, type ClassificationInput } from "./classifier";
import {
  buildFactSafetyReport,
  hasCopyrightWarningCues,
  type FactSafetyContext,
} from "./fact-safety";
import { resolveSiteValueBlocks, type SiteValueConfig } from "./site-value";
import { buildStoryBrief } from "./brief-builder";
import { decideCreateUpdateOrSkip, type DuplicateCheckResult } from "./duplicate-check";
import { buildWriterPrompt, parseWriterOutput } from "./writer-prompt";
import { getArticleWriter } from "./writer-provider";
import { buildSeoPackage } from "./seo-package";
import { buildProvenance, summarizeProvenance } from "./provenance";
import { runEditorialQa } from "./editorial-qa";
import { evaluatePublicationGates } from "./publication-gates";
import { LENGTH_BY_TYPE } from "./classifier";
import type {
  ArticleType,
  EditorialBrief,
  EngineEnrichment,
  EngineEntity,
  FactLicense,
  LedgerFact,
  ParsedArticle,
  SearchIntent,
} from "./types";
import { isArticleType, isSearchIntent } from "./types";

const prisma = getPrismaClient();

export type GenerationOptions = {
  siteId?: string | null;
  language?: "es" | "en";
  articleTypeOverride?: string | null;
  searchIntentOverride?: string | null;
  persistDraft?: boolean;
  now?: Date;
};

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

function enrichmentKnowledgeOf(enrichments: EngineEnrichment[]): string[] {
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

// ────────────────────────────────────────────────────────────── Update delta

async function computeUpdateDelta(
  tenantId: string,
  projectId: string,
  licenses: FactLicense[],
): Promise<{ newFacts: string[]; changedFacts: Array<{ factKey: string; before: string; after: string }>; previousTitle: string | null } | null> {
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

// ────────────────────────────────────────────────────────────── Orchestration

export async function generateArticleFromCluster(
  tenantId: string,
  clusterId: string,
  options: GenerationOptions = {},
): Promise<Record<string, unknown>> {
  const now = options.now ?? new Date();
  const language = options.language === "en" ? "en" : "es";

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

  const siteId = options.siteId ?? items[0]?.source?.siteId ?? null;
  if (!siteId) {
    throw new Error("site_required_for_generation");
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

  const generation = await prisma.articleGeneration.create({
    data: {
      tenantId,
      siteId,
      clusterId,
      status: "briefing",
      decision: "pending",
    },
  });

  try {
    // ── 1. Duplicate / cannibalization decision ───────────────────────────
    const primaryEntityNames = entities
      .filter((entity) => ["movie", "tv_series", "creative_work"].includes(entity.type))
      .map((entity) => entity.name);
    const duplicate = await decideCreateUpdateOrSkip({
      tenantId,
      siteId,
      clusterId,
      headline,
      summary,
      entityNames: primaryEntityNames.length > 0 ? primaryEntityNames : entities.slice(0, 2).map((entity) => entity.name),
    });

    if (duplicate.decision === "skip") {
      await prisma.articleGeneration.update({
        where: { id: generation.id },
        data: {
          status: "skipped",
          decision: "skip",
          decisionReason: duplicate.reason,
        },
      });
      await writeAudit({
        tenantId,
        action: "editorial_engine.skipped",
        entityType: "article_generation",
        entityId: generation.id,
        actorType: "automation",
        metadata: { clusterId, reason: duplicate.reason },
      });
      return await getGenerationDetail(tenantId, generation.id);
    }

    // ── 2. Classification ─────────────────────────────────────────────────
    const ageHours = Math.max(0, (now.getTime() - cluster.firstSeenAt.getTime()) / 3_600_000);
    let classificationInput: ClassificationInput = {
      headline,
      summary,
      memberTitles,
      categories: Array.isArray(cluster.categories) ? cluster.categories.map(String) : [],
      verificationState: cluster.verificationState,
      entities,
      facts: ledgerFacts,
      ageHours,
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

    // ── 3. Fact safety ────────────────────────────────────────────────────
    const safetyContext: FactSafetyContext = {
      clusterVerificationState: cluster.verificationState,
      independentPublisherGroups: cluster.sourceDiversity,
    };
    const factSafety = buildFactSafetyReport(ledgerFacts, safetyContext);

    // ── 4. Site knowledge ─────────────────────────────────────────────────
    const settings = await getIntelligenceSettings(tenantId);
    const editorialProfile = await getSiteEditorialProfile(tenantId, siteId);
    const domains = settings.domainsAuto
      ? editorialProfile
        ? (await import("../intelligence/intelligence-settings")).resolveDomainsForSite(settings, editorialProfile.topics ?? [], editorialProfile.categories ?? [])
        : []
      : settings.enabledDomains;

    const keywordForLinks =
      primaryEntityNames[0] ?? entities[0]?.name ?? headline;
    const internalLinks = await suggestInternalLinks(tenantId, siteId, {
      keyword: keywordForLinks,
      topic: headline,
      limit: 6,
    });
    const indexedPages = await prisma.siteIndexedPage.findMany({
      where: { tenantId, siteId, crawlState: { in: ["extracted", "stale"] } },
      select: { title: true },
      take: 250,
    });
    const siteValueConfig = site.siteValueConfig ? (site.siteValueConfig as unknown as SiteValueConfig) : null;
    const siteValueBlocks = resolveSiteValueBlocks({
      config: siteValueConfig,
      domains,
      locale: site.locale,
      entities,
      enrichments,
      internalLinks,
      factStatements: factSafety.licenses
        .filter((license) => license.usage === "state" || license.usage === "state_confidently")
        .map((license) => ({ factKey: license.factKey, statement: license.statement })),
    });

    // ── 5. Editorial brief (always before any article text) ───────────────
    const brief: EditorialBrief = buildStoryBrief({
      headline,
      summary,
      classification,
      factSafety,
      entities,
      enrichments,
      site: {
        siteId,
        siteName: site.name,
        siteType: site.type,
        locale: site.locale,
        internalLinks,
        indexedPageTitles: indexedPages.map((page) => page.title ?? ""),
        siteValueBlocks,
      },
      ageHours,
      now,
    });

    // ── 6. Update delta for update runs ───────────────────────────────────
    let previousArticle: { title: string; bodyHtml: string } | null = null;
    let updateDelta: Awaited<ReturnType<typeof computeUpdateDelta>> = null;
    if (duplicate.decision === "update_existing" && duplicate.targetProjectId) {
      const targetProject = await prisma.contentProject.findFirst({
        where: { id: duplicate.targetProjectId, tenantId },
        include: { versions: { orderBy: { versionNumber: "desc" }, take: 1 } },
      });
      const previousVersion = targetProject?.versions[0];
      if (previousVersion?.bodyHtml && targetProject) {
        previousArticle = {
          title: previousVersion.title ?? targetProject.title,
          bodyHtml: previousVersion.bodyHtml,
        };
      }
      updateDelta = await computeUpdateDelta(tenantId, duplicate.targetProjectId, factSafety.licenses);
    }

    // ── 7. Writer prompt ──────────────────────────────────────────────────
    const writerPrompt = buildWriterPrompt({
      brief,
      licenses: factSafety.licenses,
      siteValueBlocks,
      previousArticle,
      updateDelta,
      language,
    });
    await prisma.articleGeneration.update({
      where: { id: generation.id },
      data: {
        status: "generating",
        decision: duplicate.decision,
        decisionReason: duplicate.reason,
        articleType: classification.articleType,
        searchIntent: classification.searchIntent,
        brief: brief as unknown as Prisma.InputJsonValue,
        factLicenses: factSafety.licenses as unknown as Prisma.InputJsonValue,
        writerPrompt: writerPrompt.userPrompt,
      },
    });

    // ── 8. AI writer (injectable for deterministic CI) ────────────────────
    const maxTokens = Math.min(8000, Math.max(1400, Math.round(LENGTH_BY_TYPE[classification.articleType].max * 2.2)));
    const writer = getArticleWriter();
    const result = await writer.generate({
      prompt: writerPrompt.userPrompt,
      systemPrompt: writerPrompt.systemPrompt,
      maxTokens,
      language,
    });

    const parsed: ParsedArticle = parseWriterOutput(result.output);
    // Editorial HTML is allowlist-sanitized before anything is stored.
    parsed.bodyHtml = sanitizeEditorialHtml(parsed.bodyHtml);
    await prisma.articleGeneration.update({
      where: { id: generation.id },
      data: {
        provider: result.provider,
        model: result.model,
        articleOutput: result.output.slice(0, 300_000),
      },
    });

    // ── 9. SEO package ────────────────────────────────────────────────────
    const seo = buildSeoPackage({
      brief,
      article: parsed,
      internalLinks,
      factSourceUrls: ledgerFacts.map((fact) => ({ url: fact.sourceUrl, publisher: fact.publisher })),
    });

    // ── 10. Provenance ────────────────────────────────────────────────────
    const provenance = buildProvenance({ article: parsed, licenses: factSafety.licenses });
    const provenanceSummary = summarizeProvenance(provenance);

    // ── 11. QA ────────────────────────────────────────────────────────────
    const copyrightWarning = hasCopyrightWarningCues(memberTitles);
    const qa = runEditorialQa({
      article: parsed,
      brief,
      licenses: factSafety.licenses,
      seo,
      sourceTexts,
      indexedPageTitles: indexedPages.map((page) => page.title ?? ""),
      entityNames: entities.map((entity) => entity.name),
      enrichmentKnowledge: enrichmentKnowledgeOf(enrichments),
      enrichmentDates: enrichments
        .map((enrichment) => enrichment.releaseDate)
        .filter((date): date is string => Boolean(date)),
    });

    // ── 12. Publication gates (policy + configurable quality gates) ───────
    const policy = await getOrCreatePolicy(tenantId, siteId);
    const gatesInput = {
      qa,
      configJson: asRecord(policy.qaGates),
      policy: {
        autoGenerate: policy.autoGenerate,
        autoApprove: policy.autoApprove,
        autoSchedule: policy.autoSchedule,
        autoPublish: policy.autoPublish,
      },
      sourceGroups: provenanceSummary.sourceGroups.size,
      siteFitScore: cluster.siteFitScore,
      copyrightWarning,
    };
    const publicationDecision = evaluatePublicationGates(gatesInput);

    // ── 13. Persist full record ───────────────────────────────────────────
    await prisma.articleGeneration.update({
      where: { id: generation.id },
      data: {
        status: "qa_review",
        decision: duplicate.decision,
        articleType: classification.articleType,
        searchIntent: classification.searchIntent,
        brief: brief as unknown as Prisma.InputJsonValue,
        factLicenses: factSafety.licenses as unknown as Prisma.InputJsonValue,
        parsedArticle: parsed as unknown as Prisma.InputJsonValue,
        seoPackage: seo as unknown as Prisma.InputJsonValue,
        qaReport: qa as unknown as Prisma.InputJsonValue,
        publicationDecision: publicationDecision as unknown as Prisma.InputJsonValue,
        provenance: provenance as unknown as Prisma.InputJsonValue,
        updateDelta: updateDelta ? (updateDelta as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
      },
    });

    // ── 14. Materialize draft for human review (existing pipeline) ────────
    if (options.persistDraft !== false && publicationDecision.decision !== "reject") {
      const materialized = await materializeDraft({
        tenantId,
        siteId,
        cluster,
        generationId: generation.id,
        duplicate,
        parsed,
        seo,
        qa,
        provenance,
        language,
      });
      await prisma.articleGeneration.update({
        where: { id: generation.id },
        data: {
          projectId: materialized.projectId,
          versionId: materialized.versionId,
          status: publicationDecision.decision === "auto_publish" ? "auto_publish_scheduled" : "qa_review",
        },
      });

      if (publicationDecision.decision === "auto_publish" && policy.autoPublish) {
        const publication = await createPublication({
          tenantId,
          projectId: materialized.projectId,
          versionId: materialized.versionId,
          channel: "website",
          siteId,
          scheduledFor: now,
        });
        await enqueuePublication(publication.id);
        await writeAudit({
          tenantId,
          action: "editorial_engine.auto_published",
          entityType: "article_generation",
          entityId: generation.id,
          actorType: "automation",
          metadata: { projectId: materialized.projectId, publicationId: publication.id },
        });
      }
    }

    // Cluster is now being worked on.
    if (cluster.status === "open") {
      await prisma.storyCluster.update({ where: { id: clusterId }, data: { status: "selected" } });
    }

    await writeAudit({
      tenantId,
      action: "editorial_engine.generated",
      entityType: "article_generation",
      entityId: generation.id,
      actorType: "automation",
      metadata: {
        clusterId,
        siteId,
        articleType: classification.articleType,
        decision: duplicate.decision,
        qaScore: qa.score,
        publicationDecision: publicationDecision.decision,
      },
    });

    return await getGenerationDetail(tenantId, generation.id);
  } catch (error) {
    await prisma.articleGeneration.update({
      where: { id: generation.id },
      data: {
        status: "failed",
        error: error instanceof Error ? error.message.slice(0, 2000) : String(error),
      },
    });
    throw error;
  }
}

// ────────────────────────────────────────────────────────────── Materialization

async function materializeDraft(input: {
  tenantId: string;
  siteId: string;
  cluster: { id: string; primarySourceId: string | null };
  generationId: string;
  duplicate: DuplicateCheckResult;
  parsed: ParsedArticle;
  seo: ReturnType<typeof buildSeoPackage>;
  qa: ReturnType<typeof runEditorialQa>;
  provenance: ReturnType<typeof buildProvenance>;
  language: "es" | "en";
}): Promise<{ projectId: string; versionId: string }> {
  const { tenantId, siteId, parsed, seo, qa } = input;
  const title = (parsed.title || seo.h1 || parsed.h1 || "Sin título").slice(0, 200);

  if (input.duplicate.decision === "update_existing" && input.duplicate.targetProjectId) {
    const project = await prisma.contentProject.findFirst({
      where: { id: input.duplicate.targetProjectId, tenantId },
      include: { versions: { orderBy: { versionNumber: "desc" }, take: 1 } },
    });
    if (project) {
      const version = await prisma.contentVersion.create({
        data: {
          tenantId,
          projectId: project.id,
          versionNumber: (project.versions[0]?.versionNumber ?? 0) + 1,
          status: "draft",
          title: parsed.title?.slice(0, 200) ?? null,
          excerpt: seo.excerpt,
          bodyHtml: parsed.bodyHtml,
          seoTitle: seo.seoTitle,
          seoDescription: seo.metaDescription,
          qaReport: qa as unknown as Prisma.JsonObject,
        },
      });
      await prisma.contentProject.update({
        where: { id: project.id },
        data: {
          status: "draft",
          clusterId: input.cluster.id,
          metadata: {
            ...(project.metadata && typeof project.metadata === "object" && !Array.isArray(project.metadata)
              ? (project.metadata as Record<string, unknown>)
              : {}),
            lastGenerationId: input.generationId,
            updatedByEditorialEngine: true,
          } as Prisma.InputJsonValue,
        },
      });
      return { projectId: project.id, versionId: version.id };
    }
  }

  const firstItem = await prisma.sourceItem.findFirst({
    where: { tenantId, clusterId: input.cluster.id },
    orderBy: { discoveredAt: "asc" },
    select: { id: true },
  });

  const project = await prisma.contentProject.create({
    data: {
      tenantId,
      siteId,
      title,
      brief: seo.excerpt,
      goal: "article",
      status: "draft",
      primaryLanguage: input.language,
      clusterId: input.cluster.id,
      sourceItemId: firstItem?.id ?? null,
      origin: "editorial_engine",
      metadata: {
        generationId: input.generationId,
        articleType: input.duplicate.decision === "update_existing" ? "article_update" : "create_new",
        provenance: input.provenance.slice(0, 40),
        slug: seo.slug,
      } as Prisma.InputJsonValue,
    },
  });

  const version = await prisma.contentVersion.create({
    data: {
      tenantId,
      projectId: project.id,
      versionNumber: 1,
      status: "draft",
      title: parsed.title?.slice(0, 200) ?? null,
      excerpt: seo.excerpt,
      bodyHtml: parsed.bodyHtml,
      seoTitle: seo.seoTitle,
      seoDescription: seo.metaDescription,
      qaReport: qa as unknown as Prisma.JsonObject,
    },
  });

  return { projectId: project.id, versionId: version.id };
}

// ────────────────────────────────────────────────────────────── Read model

export async function listGenerations(
  tenantId: string,
  input: { page: number; pageSize: number; siteId?: string | null; clusterId?: string | null },
) {
  const skip = (input.page - 1) * input.pageSize;
  const where: Prisma.ArticleGenerationWhereInput = {
    tenantId,
    ...(input.siteId ? { siteId: input.siteId } : {}),
    ...(input.clusterId ? { clusterId: input.clusterId } : {}),
  };
  const [total, rows] = await prisma.$transaction([
    prisma.articleGeneration.count({ where }),
    prisma.articleGeneration.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: input.pageSize,
      select: {
        id: true,
        status: true,
        decision: true,
        decisionReason: true,
        articleType: true,
        searchIntent: true,
        clusterId: true,
        projectId: true,
        versionId: true,
        siteId: true,
        provider: true,
        model: true,
        createdAt: true,
        updatedAt: true,
        qaReport: true,
        publicationDecision: true,
        brief: true,
      },
    }),
  ]);
  return {
    items: rows.map((row) => ({
      ...row,
      qaScore: row.qaReport && typeof row.qaReport === "object" ? (row.qaReport as Record<string, unknown>).score ?? null : null,
      publicationOutcome:
        row.publicationDecision && typeof row.publicationDecision === "object"
          ? (row.publicationDecision as Record<string, unknown>).decision ?? null
          : null,
      title: row.brief && typeof row.brief === "object" ? (row.brief as Record<string, unknown>).primaryKeyword ?? null : null,
    })),
    page: input.page,
    pageSize: input.pageSize,
    total,
  };
}

export async function getGenerationDetail(tenantId: string, generationId: string): Promise<Record<string, unknown>> {
  const row = await prisma.articleGeneration.findFirst({
    where: { id: generationId, tenantId },
    include: {
      site: { select: { id: true, name: true, type: true, baseUrl: true } },
      project: { select: { id: true, title: true, status: true } },
      version: { select: { id: true, versionNumber: true, status: true, title: true, approvedAt: true } },
    },
  });
  if (!row) {
    throw new Error("generation_not_found");
  }

  const cluster = row.clusterId
    ? await prisma.storyCluster.findFirst({
        where: { id: row.clusterId, tenantId },
        select: {
          id: true,
          headline: true,
          summary: true,
          status: true,
          verificationState: true,
          verificationDetail: true,
          sourceDiversity: true,
          candidateScore: true,
          siteFitScore: true,
          firstSeenAt: true,
          lastSeenAt: true,
        },
      })
    : null;

  const clusterEntityIds = cluster
    ? (
        await prisma.sourceItemEntity.findMany({
          where: { tenantId, item: { clusterId: cluster.id } },
          select: { entityId: true },
        })
      ).map((link) => link.entityId)
    : [];

  const [facts, enrichments] = await Promise.all([
    cluster
      ? prisma.storyFact.findMany({
          where: { tenantId, clusterId: cluster.id },
          orderBy: { extractedAt: "asc" },
          select: {
            id: true,
            factKey: true,
            statement: true,
            publisher: true,
            sourceUrl: true,
            verificationStatus: true,
            confidence: true,
            conflictingFacts: true,
          },
        })
      : Promise.resolve([]),
    clusterEntityIds.length > 0
      ? prisma.providerEnrichment.findMany({
          where: { tenantId, entityId: { in: clusterEntityIds } },
          select: {
            id: true,
            entityId: true,
            providerKey: true,
            title: true,
            releaseDate: true,
            matchMethod: true,
            confidence: true,
            data: true,
          },
        })
      : Promise.resolve([]),
  ]);

  return {
    id: row.id,
    status: row.status,
    decision: row.decision,
    decisionReason: row.decisionReason,
    articleType: row.articleType,
    searchIntent: row.searchIntent,
    site: row.site,
    cluster,
    project: row.project,
    version: row.version,
    brief: row.brief,
    factPanel: {
      ledger: facts,
      licenses: row.factLicenses,
    },
    sources: facts
      .filter((fact) => fact.sourceUrl)
      .map((fact) => ({ url: fact.sourceUrl, publisher: fact.publisher, factKey: fact.factKey }))
      .filter(
        (entry, index, array) =>
          array.findIndex((other) => other.url === entry.url && other.publisher === entry.publisher) === index,
      ),
    provenance: row.provenance,
    enrichment: enrichments,
    article: row.parsedArticle,
    seo: row.seoPackage,
    socialPreview: row.seoPackage
      ? {
          title: (row.seoPackage as Record<string, unknown>).socialTitle ?? null,
          description: (row.seoPackage as Record<string, unknown>).openGraph
            ? ((row.seoPackage as Record<string, unknown>).openGraph as Record<string, unknown>).description ?? null
            : null,
        }
      : null,
    qaReport: row.qaReport,
    publicationDecision: row.publicationDecision,
    updateDelta: row.updateDelta,
    provider: row.provider,
    model: row.model,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    error: row.error,
  };
}
