// Plan item + manual pre-stages of the unified production pipeline.
// Everything the legacy plan-item generator used to put in the project
// brief/metadata is kept; the plan item is additionally mapped onto the same
// EditorialBrief the cluster path uses so both converge on one writer + QA.

import { Prisma, type EditorialPlanItem } from "@prisma/client";
import { getPrismaClient } from "../../infrastructure/db/prisma";
import { createProject } from "../repository";
import { suggestInternalLinks, suggestOwnPosts } from "../internal-linking";
import { serpSourceFacts } from "../serp-sources";
import { buildStoryBrief } from "../editorial-engine/brief-builder";
import { LENGTH_BY_TYPE } from "../editorial-engine/classifier";
import { formatInternalUrl, LENGTH_MODES, readArticleTargetsOverride, renderWritingGuidance, resolveArticleTargets, resolveBrandSettings, resolveVisualSettings, resolveWritingSettings, wordTargetRange } from "../editorial-engine/structure";
import { youtubeVideoFor } from "../youtube-videos";
import { hasContactCard, hasMapCard, readBrandSettings, renderBrandGuidance, resolveBrand, type ResolvedBrand } from "../editorial-engine/brand";
import { crawlBrand, withCrawledBrand } from "../brand-colors";
import type { FactSafetyReport } from "../editorial-engine/fact-safety";
import { isArticleType, type ArticleType, type EngineEntity, type EngineInternalLink, type LedgerFact, type SearchIntent } from "../editorial-engine/types";
import type { BriefArtifact, PreparedInput, ProductionRequestOptions } from "./types";

const prisma = getPrismaClient();

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => (typeof entry === "string" ? entry : typeof entry === "object" && entry !== null ? String((entry as Record<string, unknown>).name ?? (entry as Record<string, unknown>).question ?? (entry as Record<string, unknown>).heading ?? "") : ""))
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function hostOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

/** `metadata.generation` settings on the plan item (language, articleType, word counts, tone…). */
export function readGenerationSettings(item: Pick<EditorialPlanItem, "metadata">): Record<string, unknown> {
  return asRecord(asRecord(item.metadata).generation);
}

export function outlineHeadings(item: { outline?: unknown }): string[] {
  return Array.isArray(item.outline)
    ? item.outline.map((entry) => (typeof entry === "object" && entry !== null ? String((entry as Record<string, unknown>).heading ?? "") : String(entry))).filter(Boolean)
    : [];
}

// ────────────────────────────────────────────────────────────── Project shell

export function planItemBriefText(item: EditorialPlanItem): string {
  const outline = outlineHeadings(item);
  return [
    `Titulo: ${item.finalSuggestedTitle || item.workingTitle || item.title}`,
    item.angle ? `Angulo: ${item.angle}` : null,
    item.topic ? `Tema: ${item.topic}` : null,
    item.topicCluster ? `Cluster: ${item.topicCluster}` : null,
    item.audience ? `Audiencia: ${item.audience}` : null,
    item.primaryIntent ? `Intencion de busqueda: ${item.primaryIntent}` : null,
    item.targetQuery ? `Query objetivo: ${item.targetQuery}` : null,
    item.primaryKeyword ? `Keyword principal: ${item.primaryKeyword}` : null,
    item.recommendedWordCountMin ? `Extension objetivo: ${item.recommendedWordCountMin}-${item.recommendedWordCountMax ?? item.recommendedWordCountMin} palabras` : null,
    outline.length > 0 ? `Estructura sugerida:\n${outline.map((heading, index) => `${index + 1}. ${heading}`).join("\n")}` : null,
    item.metaDescription ? `Meta description sugerida: ${item.metaDescription}` : null,
    item.imageConcept ? `Concepto de imagen: ${item.imageConcept}` : null,
  ].filter((section): section is string => Boolean(section)).join("\n\n");
}

/**
 * Create (once) the project a plan item produces into and link the item.
 * Idempotent: an item that already has a project keeps it (ENG-02).
 */
export async function ensurePlanItemProject(item: EditorialPlanItem, jobId: string) {
  if (item.projectId) {
    const existing = await prisma.contentProject.findFirst({ where: { id: item.projectId, tenantId: item.tenantId } });
    if (existing) return existing;
  }
  if (!item.siteId) throw new Error("editorial_plan_item_site_required");
  const generation = readGenerationSettings(item);
  const project = await createProject(item.tenantId, {
    siteId: item.siteId,
    title: item.finalSuggestedTitle || item.workingTitle || item.title,
    brief: planItemBriefText(item),
    goal: item.channel === "website" ? "article" : "social_pack",
    primaryLanguage: generation.language === "en" ? "en" : "es",
    metadata: {
      editorialPlanId: item.planId,
      editorialPlanItemId: item.id,
      productionJobId: jobId,
      channel: item.channel,
      contentType: item.contentType ?? null,
      primaryIntent: item.primaryIntent ?? item.searchIntent ?? null,
      secondaryIntents: item.secondaryIntents ?? [],
      funnelStage: item.funnelStage ?? null,
      audience: item.audience ?? null,
      objective: item.objective ?? item.editorialObjective ?? null,
      targetQuery: item.targetQuery ?? null,
      primaryKeyword: item.primaryKeyword ?? null,
      secondaryKeywords: item.secondaryKeywords ?? [],
      semanticKeywords: item.semanticKeywords ?? [],
      relatedEntities: item.relatedEntities ?? [],
      questionsToAnswer: item.questionsToAnswer ?? [],
      topicCluster: item.topicCluster ?? null,
      pillarPage: item.pillarPage ?? null,
      suggestedInternalLinks: item.suggestedInternalLinks ?? [],
      suggestedExternalEvidenceTypes: item.suggestedExternalEvidenceTypes ?? [],
      sourceEvidence: item.sourceEvidence ?? [],
      faqCandidates: item.faqCandidates ?? [],
      schemaTypes: item.schemaTypes ?? [],
      outline: Array.isArray(item.outline) ? item.outline : [],
      recommendedWordCountMin: item.recommendedWordCountMin ?? null,
      recommendedWordCountMax: item.recommendedWordCountMax ?? null,
      cannibalizationRisk: item.cannibalizationRisk ?? null,
      seoTitle: item.seoTitle ?? null,
      metaDescription: item.metaDescription ?? null,
      suggestedSlug: item.suggestedSlug ?? null,
      freshnessRequirement: item.freshnessRequirement ?? null,
      angle: item.angle ?? null,
      rationale: item.rationale ?? null,
      cta: item.cta ?? null,
      generation,
    } as Prisma.InputJsonObject,
  });
  await prisma.editorialPlanItem.update({
    where: { id: item.id },
    data: { projectId: project.id, status: "generating", contentGenerationStatus: "generating" },
  });
  return project;
}

// ────────────────────────────────────────────────────────────── Evidence

/** Plan evidence (inventory-validated URLs + titles) becomes single-source, attribute-only facts. */
export function planEvidenceToLedger(sourceEvidence: unknown): { facts: LedgerFact[]; groups: number } {
  const entries = Array.isArray(sourceEvidence) ? sourceEvidence.map(asRecord) : [];
  const facts: LedgerFact[] = [];
  const groups = new Set<string>();
  const letters = "abcdefghijklmnopqrstuvwxyz";
  for (const entry of entries) {
    const statement = typeof entry.title === "string" ? entry.title.trim() : "";
    if (!statement) continue;
    const url = typeof entry.url === "string" && entry.url ? entry.url : null;
    const host = hostOf(url);
    const group = host ?? String(entry.sourceType ?? "site");
    groups.add(group);
    const trust = typeof entry.trustScore === "number" ? entry.trustScore / 100 : 0.5;
    facts.push({
      factKey: `evidence_${letters[facts.length % letters.length]}`,
      statement: statement.slice(0, 400),
      publisher: host,
      publisherGroup: group,
      sourceUrl: url,
      confidence: Math.max(0, Math.min(1, trust)),
      verificationStatus: "unverified",
      conflictingStatements: [],
      supportingGroups: 1,
      ...(typeof entry.sourceId === "string" && typeof entry.itemId === "string" ? { origin: { sourceId: entry.sourceId, itemId: entry.itemId } } : {}),
    });
  }
  return { facts, groups: groups.size };
}

// ────────────────────────────────────────────────────────────── Prepare

/** Source facts already stored on the project's topic (source-item projects), as ledger entries. */
async function projectFactLedger(tenantId: string, projectId: string): Promise<{ facts: LedgerFact[]; groups: number }> {
  const project = await prisma.contentProject.findFirst({ where: { id: projectId, tenantId }, select: { topicId: true } });
  if (!project?.topicId) return { facts: [], groups: 0 };
  const rows = await prisma.fact.findMany({ where: { tenantId, topicId: project.topicId, sourceType: { not: "manual" } }, orderBy: { createdAt: "desc" }, take: 6 });
  const evidence = rows.flatMap((row) =>
    row.content
      .split(/(?<=[.!?])\s+/)
      .map((sentence) => sentence.trim())
      .filter((sentence) => sentence.length >= 30)
      .slice(0, 15)
      .map((title) => ({ title, url: row.sourceRef ?? null, sourceType: row.sourceType })),
  );
  return planEvidenceToLedger(evidence.slice(0, 40));
}

async function loadSite(tenantId: string, siteId: string) {
  const site = await prisma.site.findFirst({ where: { id: siteId, tenantId } });
  if (!site) throw new Error("site_not_found");
  return site;
}

async function loadInternalLinks(
  tenantId: string,
  siteId: string,
  keyword: string,
  topic: string,
  planUrls: string[],
  limit = 6,
  ownPosts: { excludeProjectId: string | null } | null = null,
): Promise<EngineInternalLink[]> {
  const suggested = await suggestInternalLinks(tenantId, siteId, { keyword, topic, limit, fillWithHubs: limit > 6 });
  const links: EngineInternalLink[] = suggested.map((link) => ({ ...link }) as EngineInternalLink);
  const missing = planUrls.filter((url) => !links.some((link) => link.url === url));
  if (missing.length > 0) {
    const pages = await prisma.siteIndexedPage.findMany({ where: { tenantId, siteId, url: { in: missing } }, select: { url: true, title: true } });
    for (const page of pages) {
      links.unshift({ url: page.url, title: page.title ?? page.url, anchor: page.title ?? page.url, reason: "suggested by the editorial plan", score: 1 });
    }
  }
  const capped = links.slice(0, Math.max(8, limit));
  if (!ownPosts) return capped;
  // Recommended reading: the site's own published posts closest to the keyword, listed first.
  const posts = await suggestOwnPosts(tenantId, siteId, { keyword, topic, excludeProjectId: ownPosts.excludeProjectId, limit: 5 });
  const postUrls = new Set(posts.map((post) => post.url));
  return [...posts, ...capped.filter((link) => !postUrls.has(link.url))];
}

async function indexedTitles(tenantId: string, siteId: string): Promise<string[]> {
  const pages = await prisma.siteIndexedPage.findMany({
    where: { tenantId, siteId, crawlState: { in: ["extracted", "stale"] } },
    select: { title: true },
    take: 250,
  });
  return pages.map((page) => page.title ?? "");
}

export function planGuidance(item: EditorialPlanItem): string[] {
  // The approved outline is not guidance: the structure template renders it as required H2s.
  const lines: string[] = [];
  if (item.angle) lines.push(`Angle: ${item.angle}`);
  if (item.editorialObjective || item.objective) lines.push(`Objective: ${item.editorialObjective || item.objective}`);
  if (item.audience) lines.push(`Audience: ${item.audience}`);
  if (item.funnelStage) lines.push(`Funnel stage: ${item.funnelStage}`);
  if (item.competitorAngle) lines.push(`Differentiate from competitors: ${item.competitorAngle}`);
  const questions = stringList(item.questionsToAnswer);
  if (questions.length) lines.push(`Questions the article must answer:\n${questions.map((question) => `- ${question}`).join("\n")}`);
  const faq = stringList(item.faqCandidates);
  if (faq.length) lines.push(`FAQ candidates (only if genuinely useful):\n${faq.map((question) => `- ${question}`).join("\n")}`);
  if (item.cta) lines.push(`Call to action: ${item.cta}`);
  if (item.freshnessRequirement) lines.push(`Freshness requirement: ${item.freshnessRequirement}`);
  // Set from the calendar's instructions modal (or the plan drawer).
  const generation = readGenerationSettings(item);
  if (typeof generation.instructions === "string" && generation.instructions) lines.push(`Editor instructions: ${generation.instructions}`);
  if (typeof generation.referenceUrl === "string" && generation.referenceUrl) lines.push(`Reference page to take as a model (do not copy it): ${generation.referenceUrl}`);
  if (item.notes) lines.push(`Editor notes: ${item.notes}`);
  return lines;
}

/** Brand data for the guide's intro, link card and promo block (business details and CTA wording when configured). */
export function siteGuidance(site: { name: string; baseUrl: string | null }, brand: ResolvedBrand = resolveBrand(readBrandSettings(null), site), sections?: Parameters<typeof renderBrandGuidance>[1]): string[] {
  return renderBrandGuidance(brand, sections);
}

export async function preparePlanItemInput(
  tenantId: string,
  planItemId: string,
  options: ProductionRequestOptions,
): Promise<PreparedInput> {
  const item = await prisma.editorialPlanItem.findFirst({ where: { id: planItemId, tenantId } });
  if (!item) throw new Error("editorial_plan_item_not_found");
  if (!item.siteId) throw new Error("editorial_plan_item_site_required");
  const site = await loadSite(tenantId, item.siteId);
  const generation = readGenerationSettings(item);
  const planningSettings = await prisma.sitePlanningSettings.findUnique({ where: { siteId: site.id }, select: { articleTargets: true } });
  const writing = resolveWritingSettings(planningSettings?.articleTargets);
  const profile = await prisma.siteIntelligenceProfile.findUnique({ where: { siteId: site.id }, select: { brandSummary: true, detectedAudience: true } });
  const brand = resolveBrand(withCrawledBrand(resolveBrandSettings(planningSettings?.articleTargets), await crawlBrand(tenantId, site.baseUrl)), site, profile);
  const language = options.language ?? (generation.language === "en" ? "en" : "es");
  const headline = item.finalSuggestedTitle || item.workingTitle || item.title;
  const keyword = item.primaryKeyword || item.targetQuery || headline;
  const isGuide = mapArticleType(item as unknown as Record<string, unknown>, generation) === "guide";
  const planEvidence = planEvidenceToLedger(item.sourceEvidence);
  // Links are primary (BLG parity M4): enough internal candidates for the target, and the pages Google ranks
  // for the keyword as citable external sources (own site and accepted competitors excluded).
  const targets = resolveArticleTargets(planningSettings?.articleTargets, generation.articleTargets);
  const competitors = await prisma.competitor.findMany({ where: { tenantId, siteId: site.id, status: "accepted" }, select: { domain: true } });
  const serpFacts = item.primaryKeyword && isGuide
    ? await serpSourceFacts({
        tenantId,
        siteId: site.id,
        locale: site.locale,
        siteType: site.type,
        timeSensitive: item.newsOrEvergreen === "news",
        keyword: item.primaryKeyword,
        exclude: {
          domains: [hostOf(site.baseUrl), ...competitors.map(({ domain }) => hostOf(`https://${domain.replace(/^https?:\/\//, "")}`))].filter((domain): domain is string => Boolean(domain)),
          urls: planEvidence.facts.map((fact) => fact.sourceUrl).filter((url): url is string => Boolean(url)),
        },
        max: targets.externalLinks + 5, // a few spare so the writer picks the relevant ones
      })
    : [];
  const youtube = isGuide && item.primaryKeyword
    ? await youtubeVideoFor({ tenantId, siteId: site.id, locale: site.locale, keyword: item.primaryKeyword, youtube: resolveVisualSettings(planningSettings?.articleTargets).youtube })
    : null;
  const facts = [...planEvidence.facts, ...serpFacts];
  const evidence = { facts, groups: new Set(facts.map((fact) => fact.publisherGroup)).size };
  const entities: EngineEntity[] = stringList(item.relatedEntities).map((name, index) => ({
    id: `plan-entity-${index}`,
    domain: "editorial_plan",
    type: "concept",
    name,
    confidence: 0.5,
    externalIds: {},
  }));
  return {
    kind: "plan_item",
    tenantId,
    siteId: site.id,
    site: { id: site.id, name: site.name, type: site.type, locale: site.locale, siteValueConfig: site.siteValueConfig, baseUrl: site.baseUrl },
    language,
    headline,
    summary: item.angle ?? item.rationale ?? null,
    entities,
    enrichments: [],
    ledgerFacts: evidence.facts,
    factContext: { clusterVerificationState: evidence.groups >= 2 ? "unverified" : "single_source", independentPublisherGroups: evidence.groups },
    memberTitles: evidence.facts.map((fact) => fact.statement),
    sourceTexts: evidence.facts.map((fact) => fact.statement),
    // Site writing settings: internal linking can be off, and URLs follow its www / trailing-slash choice.
    internalLinks: writing.internalLinks.enabled
      ? (await loadInternalLinks(tenantId, site.id, keyword, item.topic ?? headline, stringList(item.suggestedInternalLinks), targets.internalLinks + 5, { excludeProjectId: item.projectId })).map((link) => ({ ...link, url: formatInternalUrl(link.url, writing.internalLinks) }))
      : [],
    indexedPageTitles: await indexedTitles(tenantId, site.id),
    siteFitScore: typeof item.relevanceScore === "number" ? Math.max(0, Math.min(1, item.relevanceScore > 1 ? item.relevanceScore / 100 : item.relevanceScore)) : null,
    primaryEntityNames: [keyword],
    siteArticleTargets: planningSettings?.articleTargets ?? null,
    ownProjectId: item.projectId,
    cluster: null,
    plan: {
      planItemId: item.id,
      planId: item.planId,
      record: item as unknown as Record<string, unknown>,
      generation,
      guidance: [...planGuidance(item), ...siteGuidance(site, brand, isGuide ? targets.sections : null), ...renderWritingGuidance(writing, language, { summary: isGuide && targets.sections.summary })],
      brand,
      disclaimer: writing.disclaimer,
      youtube,
    },
    options,
  };
}

export async function prepareManualInput(
  tenantId: string,
  request: { title: string; brief: string; siteId: string; projectId?: string | null },
  options: ProductionRequestOptions,
): Promise<PreparedInput> {
  const site = await loadSite(tenantId, request.siteId);
  const evidence = request.projectId ? await projectFactLedger(tenantId, request.projectId) : { facts: [], groups: 0 };
  // Manual articles follow the same site writing, linking and brand settings as planned ones (M4/M5).
  const planningSettings = await prisma.sitePlanningSettings.findUnique({ where: { siteId: site.id }, select: { articleTargets: true } });
  const writing = resolveWritingSettings(planningSettings?.articleTargets);
  const targets = resolveArticleTargets(planningSettings?.articleTargets);
  const profile = await prisma.siteIntelligenceProfile.findUnique({ where: { siteId: site.id }, select: { brandSummary: true, detectedAudience: true } });
  const brand = resolveBrand(withCrawledBrand(resolveBrandSettings(planningSettings?.articleTargets), await crawlBrand(tenantId, site.baseUrl)), site, profile);
  const language = options.language === "en" ? "en" : "es";
  return {
    kind: "manual",
    tenantId,
    siteId: site.id,
    site: { id: site.id, name: site.name, type: site.type, locale: site.locale, siteValueConfig: site.siteValueConfig, baseUrl: site.baseUrl },
    language,
    headline: request.title,
    summary: request.brief.slice(0, 500),
    entities: [],
    enrichments: [],
    ledgerFacts: evidence.facts,
    factContext: { clusterVerificationState: evidence.groups >= 2 ? "unverified" : "single_source", independentPublisherGroups: evidence.groups },
    memberTitles: evidence.facts.map((fact) => fact.statement),
    sourceTexts: [request.brief, ...evidence.facts.map((fact) => fact.statement)],
    internalLinks: writing.internalLinks.enabled
      ? (await loadInternalLinks(tenantId, site.id, request.title, request.title, [], targets.internalLinks + 5, { excludeProjectId: request.projectId ?? null })).map((link) => ({ ...link, url: formatInternalUrl(link.url, writing.internalLinks) }))
      : [],
    indexedPageTitles: await indexedTitles(tenantId, site.id),
    siteFitScore: null,
    primaryEntityNames: [request.title],
    siteArticleTargets: planningSettings?.articleTargets ?? null,
    ownProjectId: request.projectId ?? null,
    cluster: null,
    plan: { planItemId: null, planId: null, record: {}, generation: {}, guidance: [`Editor brief:\n${request.brief}`, ...siteGuidance(site, brand, null), ...renderWritingGuidance(writing, language, { summary: false })] },
    options,
  };
}

// ────────────────────────────────────────────────────────────── Brief

function mapIntent(value: unknown): SearchIntent {
  const text = String(value ?? "").toLowerCase();
  if (text.includes("commercial") || text.includes("compar")) return "commercial_investigation";
  if (text.includes("transaction")) return "transactional";
  if (text.includes("navigation")) return "navigational";
  return "informational";
}

export function mapArticleType(record: Record<string, unknown>, generation: Record<string, unknown>): ArticleType {
  if (typeof generation.articleType === "string" && isArticleType(generation.articleType)) return generation.articleType;
  const contentType = String(record.contentType ?? "").toLowerCase();
  const news = String(record.newsOrEvergreen ?? "").toLowerCase() === "news";
  // Keyword-first items (guide/explainer/listicle) all use the BLG guide template (M3).
  if (!news && String(record.primaryKeyword ?? "").trim() && !/review|analisis|análisis/.test(contentType)) return "guide";
  if (/list|ranking|top/.test(contentType)) return "list_ranking";
  if (/review|analisis|análisis/.test(contentType)) return "review_info";
  if (/guide|guia|guía|tutorial/.test(contentType)) return "guide";
  if (String(record.newsOrEvergreen ?? "").toLowerCase() === "news") return "standard_news";
  return "evergreen_explainer";
}

/** Plan item / manual brief: same EditorialBrief + fact handling as clusters, plan fields override the derived ones. */
export function buildPlanBrief(input: PreparedInput, factSafety: FactSafetyReport, now: Date): BriefArtifact {
  const plan = input.plan ?? { record: {} as Record<string, unknown>, generation: {} as Record<string, unknown>, guidance: [] as string[] };
  const record = plan.record;
  const articleType = mapArticleType(record, plan.generation);
  const searchIntent = mapIntent(record.primaryIntent ?? record.searchIntent);
  const base = buildStoryBrief({
    headline: input.headline,
    summary: input.summary,
    classification: { articleType, searchIntent, signals: [{ signal: "editorial_plan", detail: `${input.kind} request` }] },
    factSafety,
    entities: input.entities,
    enrichments: [],
    site: {
      siteId: input.siteId,
      siteName: input.site.name,
      siteType: input.site.type,
      locale: input.site.locale,
      internalLinks: input.internalLinks,
      indexedPageTitles: input.indexedPageTitles,
      siteValueBlocks: [],
    },
    // Planned content is durable: never framed as breaking news.
    ageHours: 24 * 30,
    now,
  });
  // Guides: site override, then the article's own (generation.articleTargets).
  const articleTargets = articleType === "guide" ? resolveArticleTargets(input.siteArticleTargets, plan.generation.articleTargets) : undefined;
  // Contact and map cards exist only when the site filled in their data.
  const brand = input.plan?.brand;
  if (articleTargets && brand) {
    articleTargets.sections.contactCard &&= hasContactCard(brand);
    articleTargets.sections.mapCard &&= hasMapCard(brand);
  }
  const siteWriting = resolveWritingSettings(input.siteArticleTargets);
  const words = articleTargets?.words ?? readArticleTargetsOverride(plan.generation.articleTargets).words ?? LENGTH_MODES[siteWriting.length];
  const typeLength = words ? wordTargetRange(words) : LENGTH_BY_TYPE[articleType];
  const min = Number(record.recommendedWordCountMin ?? plan.generation.wordCountMin) || typeLength.min;
  const max = Math.max(min, Number(record.recommendedWordCountMax ?? plan.generation.wordCountMax) || typeLength.max);
  if (articleTargets) {
    articleTargets.words = Math.max(min, Math.min(max, articleTargets.words));
    if (!siteWriting.internalLinks.enabled) articleTargets.internalLinks = 0;
  }
  const keywords = [...stringList(record.secondaryKeywords), ...stringList(record.semanticKeywords)];
  const brief = {
    ...base,
    storyAngle: String(record.angle ?? record.editorialObjective ?? "") || base.storyAngle,
    audience: String(record.audience ?? "") || base.audience,
    primaryKeyword: String(record.primaryKeyword ?? record.targetQuery ?? "") || input.headline,
    secondaryKeywords: keywords.length ? [...new Set(keywords)].slice(0, 10) : base.secondaryKeywords,
    targetLengthRange: { min, max },
    freshnessConstraints: [
      ...(record.freshnessRequirement ? [String(record.freshnessRequirement)] : []),
      "all dates and availability statements must come from the fact ledger",
    ],
    ...(articleTargets ? { articleTargets } : {}),
  };
  return { brief, siteValueBlocks: [], previousArticle: null, updateDelta: null, guidance: plan.guidance };
}

/** A plan item publishes at its calendar slot, or now when the slot already passed. */
export function slotOrNow(slot: Date | null, now: Date): Date {
  return slot && slot.getTime() > now.getTime() ? slot : now;
}
