// Plan item + manual pre-stages of the unified production pipeline.
// Everything generateContentFromEditorialPlanItem used to put in the project
// brief/metadata is kept; the plan item is additionally mapped onto the same
// EditorialBrief the cluster path uses so both converge on one writer + QA.

import { Prisma, type EditorialPlanItem } from "@prisma/client";
import { getPrismaClient } from "../../infrastructure/db/prisma";
import { createProject } from "../repository";
import { suggestInternalLinks } from "../internal-linking";
import { buildStoryBrief } from "../editorial-engine/brief-builder";
import { LENGTH_BY_TYPE } from "../editorial-engine/classifier";
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

function outlineHeadings(item: Pick<EditorialPlanItem, "outline">): string[] {
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
    });
  }
  return { facts, groups: groups.size };
}

// ────────────────────────────────────────────────────────────── Prepare

async function loadSite(tenantId: string, siteId: string) {
  const site = await prisma.site.findFirst({ where: { id: siteId, tenantId } });
  if (!site) throw new Error("site_not_found");
  return site;
}

async function loadInternalLinks(tenantId: string, siteId: string, keyword: string, topic: string, planUrls: string[]): Promise<EngineInternalLink[]> {
  const suggested = await suggestInternalLinks(tenantId, siteId, { keyword, topic, limit: 6 });
  const links: EngineInternalLink[] = suggested.map((link) => ({ ...link }) as EngineInternalLink);
  const missing = planUrls.filter((url) => !links.some((link) => link.url === url));
  if (missing.length > 0) {
    const pages = await prisma.siteIndexedPage.findMany({ where: { tenantId, siteId, url: { in: missing } }, select: { url: true, title: true } });
    for (const page of pages) {
      links.unshift({ url: page.url, title: page.title ?? page.url, anchor: page.title ?? page.url, reason: "suggested by the editorial plan", score: 1 });
    }
  }
  return links.slice(0, 8);
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
  const lines: string[] = [];
  const outline = outlineHeadings(item);
  if (item.angle) lines.push(`Angle: ${item.angle}`);
  if (item.editorialObjective || item.objective) lines.push(`Objective: ${item.editorialObjective || item.objective}`);
  if (item.audience) lines.push(`Audience: ${item.audience}`);
  if (item.funnelStage) lines.push(`Funnel stage: ${item.funnelStage}`);
  if (item.competitorAngle) lines.push(`Differentiate from competitors: ${item.competitorAngle}`);
  if (outline.length) lines.push(`Planned outline (use as H2 sections where the structure allows):\n${outline.map((heading, index) => `${index + 1}. ${heading}`).join("\n")}`);
  const questions = stringList(item.questionsToAnswer);
  if (questions.length) lines.push(`Questions the article must answer:\n${questions.map((question) => `- ${question}`).join("\n")}`);
  const faq = stringList(item.faqCandidates);
  if (faq.length) lines.push(`FAQ candidates (only if genuinely useful):\n${faq.map((question) => `- ${question}`).join("\n")}`);
  if (item.cta) lines.push(`Call to action: ${item.cta}`);
  if (item.freshnessRequirement) lines.push(`Freshness requirement: ${item.freshnessRequirement}`);
  return lines;
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
  const headline = item.finalSuggestedTitle || item.workingTitle || item.title;
  const keyword = item.primaryKeyword || item.targetQuery || headline;
  const evidence = planEvidenceToLedger(item.sourceEvidence);
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
    site: { id: site.id, name: site.name, type: site.type, locale: site.locale, siteValueConfig: site.siteValueConfig },
    language: options.language ?? (generation.language === "en" ? "en" : "es"),
    headline,
    summary: item.angle ?? item.rationale ?? null,
    entities,
    enrichments: [],
    ledgerFacts: evidence.facts,
    factContext: { clusterVerificationState: evidence.groups >= 2 ? "unverified" : "single_source", independentPublisherGroups: evidence.groups },
    memberTitles: evidence.facts.map((fact) => fact.statement),
    sourceTexts: evidence.facts.map((fact) => fact.statement),
    internalLinks: await loadInternalLinks(tenantId, site.id, keyword, item.topic ?? headline, stringList(item.suggestedInternalLinks)),
    indexedPageTitles: await indexedTitles(tenantId, site.id),
    siteFitScore: typeof item.relevanceScore === "number" ? Math.max(0, Math.min(1, item.relevanceScore > 1 ? item.relevanceScore / 100 : item.relevanceScore)) : null,
    primaryEntityNames: [keyword],
    ownProjectId: item.projectId,
    cluster: null,
    plan: {
      planItemId: item.id,
      planId: item.planId,
      record: item as unknown as Record<string, unknown>,
      generation,
      guidance: planGuidance(item),
    },
    options,
  };
}

export async function prepareManualInput(
  tenantId: string,
  request: { title: string; brief: string; siteId: string },
  options: ProductionRequestOptions,
): Promise<PreparedInput> {
  const site = await loadSite(tenantId, request.siteId);
  return {
    kind: "manual",
    tenantId,
    siteId: site.id,
    site: { id: site.id, name: site.name, type: site.type, locale: site.locale, siteValueConfig: site.siteValueConfig },
    language: options.language === "en" ? "en" : "es",
    headline: request.title,
    summary: request.brief.slice(0, 500),
    entities: [],
    enrichments: [],
    ledgerFacts: [],
    factContext: { clusterVerificationState: "unverified", independentPublisherGroups: 0 },
    memberTitles: [],
    sourceTexts: [request.brief],
    internalLinks: await loadInternalLinks(tenantId, site.id, request.title, request.title, []),
    indexedPageTitles: await indexedTitles(tenantId, site.id),
    siteFitScore: null,
    primaryEntityNames: [request.title],
    ownProjectId: null,
    cluster: null,
    plan: { planItemId: null, planId: null, record: {}, generation: {}, guidance: [`Editor brief:\n${request.brief}`] },
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

function mapArticleType(record: Record<string, unknown>, generation: Record<string, unknown>): ArticleType {
  if (typeof generation.articleType === "string" && isArticleType(generation.articleType)) return generation.articleType;
  const contentType = String(record.contentType ?? "").toLowerCase();
  if (/list|ranking|top/.test(contentType)) return "list_ranking";
  if (/review|analisis|análisis/.test(contentType)) return "review_info";
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
  const min = Number(record.recommendedWordCountMin ?? plan.generation.wordCountMin) || LENGTH_BY_TYPE[articleType].min;
  const max = Number(record.recommendedWordCountMax ?? plan.generation.wordCountMax) || Math.max(min, LENGTH_BY_TYPE[articleType].max);
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
  };
  return { brief, siteValueBlocks: [], previousArticle: null, updateDelta: null, guidance: plan.guidance };
}
