// Phase 4 editorial engine tests — deterministic fixtures only.
//
// End-to-end scenarios (DISCOVERY → CLUSTER → FACTS → ENRICHMENT → BRIEF →
// ARTICLE → QA → PUBLICATION DECISION) plus pure unit tests for the
// classifier, fact safety, writer prompt, SEO package, QA and gates.
// The AI writer is a deterministic fake injected through the factory seam.

import assert from "node:assert/strict";
import test from "node:test";
import { getPrismaClient } from "../src/infrastructure/db/prisma";
import { sha256 } from "../src/shared/utils/hash";
import { emptyDiscoveredItem } from "../src/studio/adapters/normalize";
import { upsertSourceItem } from "../src/studio/sources";
import { runIntelligencePipelineForItem } from "../src/studio/intelligence/pipeline";
import { updateIntelligenceSettings } from "../src/studio/intelligence/intelligence-settings";
import { registerMovieTvPlugin } from "../src/studio/domains/movie-tv/plugin";
import {
  classifyStory,
  getClassifiedStory,
  setClassifierOverride,
} from "../src/studio/editorial-engine/classifier";
import {
  buildFactSafetyReport,
  licenseFact,
  validateDateStatement,
  detectVerbatimOverlap,
} from "../src/studio/editorial-engine/fact-safety";
import {
  buildWriterPrompt,
  parseWriterOutput,
  extractJsonObject,
} from "../src/studio/editorial-engine/writer-prompt";
import { buildSeoPackage, slugify } from "../src/studio/editorial-engine/seo-package";
import { runEditorialQa } from "../src/studio/editorial-engine/editorial-qa";
import {
  evaluatePublicationGates,
  resolveGatesConfig,
} from "../src/studio/editorial-engine/publication-gates";
import { buildProvenance } from "../src/studio/editorial-engine/provenance";
import { resolveSiteValueBlocks } from "../src/studio/editorial-engine/site-value";
import {
  setArticleWriterFactory,
} from "../src/studio/editorial-engine/writer-provider";
import { FakeWriter } from "./support/fake-editorial-writer";
import { generateArticleFromCluster } from "../src/studio/editorial-engine/orchestrator";
import type {
  FactLicense,
  LedgerFact,
  ParsedArticle,
} from "../src/studio/editorial-engine/types";

const prisma = getPrismaClient();

registerMovieTvPlugin();

// ──────────────────────────────────────────────────────────── DB fixtures

type EngineFixture = {
  tenantId: string;
  siteId: string;
  sourceA: string;
  sourceB: string;
  sourceC: string;
  seed: string;
};

async function createEngineFixture(options: {
  siteTopics?: string[];
  siteCategories?: string[];
  indexedPages?: Array<{ title: string; url: string }>;
} = {}): Promise<EngineFixture> {
  const seed = `eng-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`;
  const tenant = await prisma.tenant.create({
    data: { name: seed, apiKeyHash: sha256(`${seed}-k`), status: "active" },
  });
  const site = await prisma.site.create({
    data: {
      tenantId: tenant.id,
      key: seed,
      name: `${seed}-site`,
      type: "guiatv",
      locale: "es-ES",
      baseUrl: `https://${seed}.example.com`,
    },
  });

  await prisma.siteEditorialProfile.create({
    data: {
      tenantId: tenant.id,
      siteId: site.id,
      profileVersion: 1,
      topics: options.siteTopics ?? ["movies", "series", "streaming"],
      categories: options.siteCategories ?? ["movies"],
      taxonomy: [],
      audience: [],
      language: "es",
      location: [],
      editorialDescription: "test editorial profile",
      contentGaps: [{ topic: "trailers", score: 0.6, reason: "no_existing_coverage" }],
      existingTitles: [],
      sitemapUrl: null,
      articleStats: { articleCount: 0, avgTitleTokens: 0 },
    },
  });

  for (const page of options.indexedPages ?? []) {
    await prisma.siteIndexedPage.create({
      data: {
        tenantId: tenant.id,
        siteId: site.id,
        url: page.url,
        title: page.title,
        crawlState: "extracted",
        wordCount: 800,
        contentType: "article",
      },
    });
  }

  const sourceA = await prisma.contentSource.create({
    data: { tenantId: tenant.id, name: `${seed}-variety`, type: "rss", url: "https://variety.example/feed", domain: "variety.example", trustScore: 0.9, authorityScore: 0.9, language: "es", siteId: site.id },
  });
  const sourceB = await prisma.contentSource.create({
    data: { tenantId: tenant.id, name: `${seed}-hollywood-reporter`, type: "rss", url: "https://hollywoodreporter.example/feed", domain: "hollywoodreporter.example", trustScore: 0.8, authorityScore: 0.8, language: "es", siteId: site.id },
  });
  const sourceC = await prisma.contentSource.create({
    data: { tenantId: tenant.id, name: `${seed}-blog`, type: "rss", url: "https://blog.example/feed", domain: "blog.example", trustScore: 0.4, authorityScore: 0.4, language: "es", siteId: site.id },
  });

  return { tenantId: tenant.id, siteId: site.id, sourceA: sourceA.id, sourceB: sourceB.id, sourceC: sourceC.id, seed };
}

async function cleanupEngineFixture(fixture: EngineFixture): Promise<void> {
  const tenantId = fixture.tenantId;
  await prisma.articleGeneration.deleteMany({ where: { tenantId } });
  await prisma.publicationAttempt.deleteMany({ where: { tenantId } });
  await prisma.publication.deleteMany({ where: { tenantId } });
  await prisma.publicationJob.deleteMany({ where: { tenantId } });
  await prisma.contentDerivative.deleteMany({ where: { tenantId } });
  await prisma.socialContent.deleteMany({ where: { tenantId } });
  await prisma.contentVersion.deleteMany({ where: { tenantId } });
  await prisma.contentProject.deleteMany({ where: { tenantId } });
  await prisma.storyFact.deleteMany({ where: { tenantId } });
  await prisma.sourceItemEntity.deleteMany({ where: { tenantId } });
  await prisma.providerEnrichment.deleteMany({ where: { tenantId } });
  await prisma.providerCacheEntry.deleteMany({ where: { tenantId } });
  await prisma.muteRule.deleteMany({ where: { tenantId } });
  await prisma.intelligenceSettings.deleteMany({ where: { tenantId } });
  await prisma.entity.deleteMany({ where: { tenantId } });
  await prisma.sourceHealth.deleteMany({ where: { tenantId } });
  await prisma.discoveryRun.deleteMany({ where: { tenantId } });
  await prisma.sourceItem.deleteMany({ where: { tenantId } });
  await prisma.storyCluster.deleteMany({ where: { tenantId } });
  await prisma.contentSource.deleteMany({ where: { tenantId } });
  await prisma.siteEditorialProfile.deleteMany({ where: { tenantId } });
  await prisma.siteIntelligenceProfile.deleteMany({ where: { tenantId } });
  await prisma.siteIndexedPage.deleteMany({ where: { tenantId } });
  await prisma.searchTarget.deleteMany({ where: { tenantId } });
  await prisma.site.deleteMany({ where: { tenantId } });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  setArticleWriterFactory(null);
  setClassifierOverride(null);
}

function makeItem(overrides: Partial<ReturnType<typeof emptyDiscoveredItem>> = {}): ReturnType<typeof emptyDiscoveredItem> {
  const nonce = Math.random().toString(16).slice(2, 10);
  return emptyDiscoveredItem({
    externalId: `ext-${Math.random().toString(16).slice(2, 10)}`,
    canonicalUrl: `https://variety.example/story-${Math.random().toString(16).slice(2, 8)}`,
    sourceUrl: null,
    title: "A sufficiently long test story headline",
    description: `Description of the test story with enough words ${nonce}.`,
    cleanedText: `Description of the test story with enough words ${nonce}.`,
    categories: ["movies"],
    language: "es",
    ...overrides,
  });
}

async function ingestAndScore(tenantId: string, sourceId: string, item: ReturnType<typeof makeItem>, score = 0.7): Promise<string> {
  const upserted = await upsertSourceItem(tenantId, sourceId, item);
  const itemId = upserted.sourceItemId;
  assert.ok(itemId, "source item id must exist");
  await prisma.sourceItem.update({
    where: { id: itemId },
    data: { score, processingStatus: score >= 0.4 ? "candidate" : "parsed" },
  });
  await runIntelligencePipelineForItem(tenantId, itemId);
  return itemId;
}

async function addEnrichment(
  fixture: EngineFixture,
  entityName: string,
  data: { releaseDate?: string; cast?: string[]; watchProviders?: string[]; rating?: number; overview?: string },
): Promise<void> {
  const entity = await prisma.entity.findFirst({
    where: { tenantId: fixture.tenantId, name: { contains: entityName } },
  });
  assert.ok(entity, `entity ${entityName} should exist`);
  await prisma.providerEnrichment.create({
    data: {
      tenantId: fixture.tenantId,
      entityId: entity.id,
      providerKey: "tmdb",
      providerEntityId: "fake-tmdb-id",
      resourceType: "movie",
      title: entity.name,
      releaseDate: data.releaseDate ? new Date(data.releaseDate) : null,
      matchMethod: "year_match",
      confidence: 0.9,
      data: {
        cast: data.cast ?? [],
        crew: ["A Famous Director"],
        watchProviders: data.watchProviders ?? [],
        rating: data.rating ?? null,
        overview: data.overview ?? "A verified overview summary.",
        genres: ["Drama"],
      },
    },
  });
}

async function singleClusterFor(fixture: EngineFixture): Promise<{ id: string; verificationState: string; siteFitScore: number | null }> {
  const clusters = await prisma.storyCluster.findMany({
    where: { tenantId: fixture.tenantId, status: { not: "superseded" } },
  });
  assert.equal(clusters.length, 1, "exactly one cluster expected");
  return {
    id: clusters[0].id,
    verificationState: clusters[0].verificationState,
    siteFitScore: clusters[0].siteFitScore,
  };
}

type GenerationDetail = {
  status: string;
  decision: string;
  articleType: string;
  qa: { score: number; passed: boolean; criticalUnsupportedClaims: Array<{ claim: string; reason: string }> };
  publication: { decision: string; gates: Array<{ key: string; passed: boolean }> };
  brief: { contentWarnings: string[]; uniqueValueProposition: string } | null;
  provenance: unknown[] | null;
  project: { id: string } | null;
  version: Record<string, unknown> | null;
  sources: unknown[] | null;
  updateDelta: { changedFacts: Array<{ factKey: string }> } | null;
  seo: { structuredDataRecommendation: string } | null;
  enrichment: unknown[] | null;
  factLicenses: FactLicense[];
  cluster: { verificationState: string; siteFitScore: number | null } | null;
};

const asRecord = (value: unknown): Record<string, any> => (value && typeof value === "object" ? (value as Record<string, any>) : {});

function detailOf(generation: Record<string, unknown>): GenerationDetail {
  const qa = asRecord(generation.qaReport);
  const publication = asRecord(generation.publicationDecision);
  const brief = asRecord(generation.brief);
  const seo = asRecord(generation.seo);
  const updateDelta = asRecord(generation.updateDelta);
  return {
    status: String(generation.status),
    decision: String(generation.decision),
    articleType: String(generation.articleType ?? ""),
    qa: {
      score: Number(qa.score ?? 0),
      passed: Boolean(qa.passed),
      criticalUnsupportedClaims: Array.isArray(qa.criticalUnsupportedClaims) ? qa.criticalUnsupportedClaims : [],
    },
    publication: {
      decision: String(publication.decision ?? ""),
      gates: Array.isArray(publication.gates)
        ? publication.gates.map((gate: unknown) => {
            const record = asRecord(gate);
            return { key: String(record.key ?? ""), passed: Boolean(record.passed) };
          })
        : [],
    },
    brief: {
      contentWarnings: Array.isArray(brief.contentWarnings) ? brief.contentWarnings.map(String) : [],
      uniqueValueProposition: String(brief.uniqueValueProposition ?? ""),
    },
    provenance: Array.isArray(generation.provenance) ? generation.provenance : null,
    project: generation.project ? { id: String(asRecord(generation.project).id) } : null,
    version: asRecord(generation.version),
    sources: Array.isArray(generation.sources) ? generation.sources : null,
    updateDelta: {
      changedFacts: Array.isArray(updateDelta.changedFacts) ? updateDelta.changedFacts : [],
    },
    seo: { structuredDataRecommendation: String(seo.structuredDataRecommendation ?? "") },
    enrichment: Array.isArray(generation.enrichment) ? generation.enrichment : null,
    factLicenses: Array.isArray(asRecord(generation.factPanel).licenses)
      ? (asRecord(generation.factPanel).licenses as FactLicense[])
      : [],
    cluster: generation.cluster
      ? {
          verificationState: String(asRecord(generation.cluster).verificationState ?? ""),
          siteFitScore: asRecord(generation.cluster).siteFitScore ?? null,
        }
      : null,
  };
}

// ──────────────────────────────────────────────────────────── Unit tests

test("classifier: differentiated article types are detected deterministically", () => {
  const base = {
    summary: null,
    memberTitles: [],
    categories: [],
    verificationState: "corroborated",
    entities: [] as Array<{ type: string; name: string }>,
    facts: [] as Array<{ factKey: string; statement: string; verificationStatus: string }>,
    ageHours: 10,
  };
  assert.equal(classifyStory({ ...base, headline: "Studio Drops First Trailer For The Horizon (2027)" }).articleType, "trailer_news");
  assert.equal(classifyStory({ ...base, headline: "Ana Joins The Horizon (2027) Cast" }).articleType, "casting_news");
  assert.equal(classifyStory({ ...base, headline: "The Horizon (2027) Gets Official Release Date" }).articleType, "release_date_news");
  assert.equal(classifyStory({ ...base, headline: "The Horizon (2027) Now Streaming On Netflix" }).articleType, "streaming_availability");
  assert.equal(classifyStory({ ...base, headline: "HBO Renews The Horizon For Season 3" }).articleType, "tv_programming");
  assert.equal(classifyStory({ ...base, headline: "Studio Announces New Action Film At CinemaCon" }).articleType, "movie_announcement");
  assert.equal(classifyStory({ ...base, headline: "The Best Movies Of 2026, Ranked" }).articleType, "list_ranking");
  assert.equal(classifyStory({ ...base, headline: "What To Watch This Weekend" }).articleType, "what_to_watch");
  assert.equal(
    classifyStory({ ...base, headline: "Developing: Fire On Studio Lot", verificationState: "developing" }).articleType,
    "developing_story",
  );
  assert.equal(
    classifyStory({
      ...base,
      headline: "Evergreen Look At Classic Film (1999)",
      entities: [{ type: "movie", name: "Classic Film" }],
      facts: [{ factKey: "release_year", statement: "1999", verificationStatus: "unverified" }],
      ageHours: 100,
    }).articleType,
    "evergreen_explainer",
  );
});

test("fact safety: licenses follow the verification state machine and validate dates", () => {
  const fact: LedgerFact = {
    factKey: "release_year",
    statement: "2027",
    publisher: "Variety",
    publisherGroup: "variety.example",
    sourceUrl: "https://variety.example/x",
    confidence: 0.9,
    verificationStatus: "unverified",
    conflictingStatements: [],
    supportingGroups: 1,
  };
  assert.equal(licenseFact(fact, { clusterVerificationState: "single_source", independentPublisherGroups: 1 }).usage, "temporal_language");
  assert.equal(licenseFact({ ...fact, supportingGroups: 2 }, { clusterVerificationState: "high_confidence", independentPublisherGroups: 3 }).usage, "state_confidently");
  assert.equal(licenseFact({ ...fact, conflictingStatements: ["2028"] }, { clusterVerificationState: "disputed", independentPublisherGroups: 2 }).usage, "represent_uncertainty");
  assert.equal(licenseFact({ ...fact, statement: "1500" }, { clusterVerificationState: "high_confidence", independentPublisherGroups: 3 }).usage, "forbidden");
  assert.deepEqual(validateDateStatement("2027-07-16"), { valid: true, reason: null });
  assert.equal(validateDateStatement("not-a-date").valid, false);
  assert.equal(validateDateStatement("999").valid, false);
});

test("fact safety: verbatim overlap detection flags long source spans", () => {
  const overlaps = detectVerbatimOverlap(
    "This is a very long sentence that copies the source text exactly word for word without any change whatsoever.",
    ["This is a very long sentence that copies the source text exactly word for word without any change whatsoever."],
  );
  assert.ok(overlaps.length > 0, "verbatim overlap must be detected");
  const clean = detectVerbatimOverlap(
    "A completely original synthesis written in different words.",
    ["This is a very long sentence that copies the source text exactly word for word without any change whatsoever."],
  );
  assert.equal(clean.length, 0);
});

test("writer prompt: embeds originality rules, fact ledger and structure; parser is robust", () => {
  const prompt = buildWriterPrompt({
    brief: {
      storyAngle: "report",
      targetSite: { id: "s", name: "Site", type: "guiatv", locale: "es-ES" },
      audience: "readers",
      searchIntent: "informational",
      articleType: "standard_news",
      primaryKeyword: "Horizon",
      secondaryKeywords: [],
      entities: [],
      verifiedFacts: [],
      unresolvedFacts: [],
      requiredAttribution: [],
      internalLinkOpportunities: [],
      relatedSiteContent: [],
      uniqueValueProposition: "u",
      targetLengthRange: { min: 400, max: 800 },
      freshnessConstraints: [],
      contentWarnings: [],
      generatedAt: new Date().toISOString(),
    },
    licenses: [],
    siteValueBlocks: [],
    language: "es",
  });
  assert.match(prompt.systemPrompt, /SINTETIZAS/i);
  assert.match(prompt.userPrompt, /FACT LEDGER/);
  assert.match(prompt.userPrompt, /STRUCTURE TEMPLATE/);

  const parsed = parseWriterOutput(
    `\`\`\`json\n${JSON.stringify({
      title: "T",
      h1: "T",
      excerpt: "E",
      bodyHtml: "<h2>A</h2><p>B</p>",
      seoTitle: "ST",
      seoDescription: "SD",
      claims: [{ text: "c", factKey: "headline", attributionRequired: false }],
    })}\n\`\`\``,
  );
  assert.equal(parsed.title, "T");
  assert.equal(parsed.claims.length, 1);

  assert.equal(extractJsonObject("plain text with no json"), null);
});

test("SEO package: deterministic slug, no invented volume, stuffing detection", () => {
  const seo = buildSeoPackage({
    brief: {
      storyAngle: "a",
      targetSite: { id: null, name: "Guiatv", type: "guiatv", locale: "es-ES" },
      audience: "r",
      searchIntent: "informational",
      articleType: "standard_news",
      primaryKeyword: "El Horizonte",
      secondaryKeywords: [],
      entities: [{ name: "El Horizonte", type: "movie", externalIds: {} }],
      verifiedFacts: [],
      unresolvedFacts: [],
      requiredAttribution: [],
      internalLinkOpportunities: [],
      relatedSiteContent: [],
      uniqueValueProposition: "u",
      targetLengthRange: { min: 100, max: 500 },
      freshnessConstraints: [],
      contentWarnings: [],
      generatedAt: new Date().toISOString(),
    },
    article: {
      title: "El Horizonte confirma su fecha",
      h1: "El Horizonte confirma su fecha",
      excerpt: "Excerpt",
      bodyHtml: "<p>El Horizonte El Horizonte El Horizonte.</p>",
      seoTitle: "",
      seoDescription: "",
      claims: [],
    },
    internalLinks: [],
    factSourceUrls: [],
  });
  assert.equal(slugify("El Horizonte: Año Uno"), "el-horizonte-ano-uno");
  assert.ok(seo.slug.length > 0);
  assert.match(seo.searchVolumeDisclaimer, /never estimated/i);
  assert.equal(seo.keywordDensity.stuffingRisk, true, "heavy repetition must be flagged as stuffing");
});

test("editorial QA: unsupported years hard-fail publication", () => {
  const licenses: FactLicense[] = [
    {
      factKey: "headline",
      statement: "Studio announces movie",
      usage: "state",
      sensitivity: "normal",
      reasons: [],
      phrasingHint: "",
      sources: [{ publisher: "V", url: null, group: "v" }],
      alternatives: [],
    },
  ];
  const article = {
    title: "T",
    h1: "T",
    excerpt: "e",
    bodyHtml: "<p>Studio announces movie. It all started in 1931.</p>",
    seoTitle: "T".padEnd(40, "x"),
    seoDescription: "d".padEnd(120, "x"),
    claims: [],
  };
  const brief = {
    storyAngle: "a",
    targetSite: { id: null, name: null, type: null, locale: null },
    audience: "r",
    searchIntent: "informational" as const,
    articleType: "standard_news" as const,
    primaryKeyword: "Studio",
    secondaryKeywords: [],
    entities: [],
    verifiedFacts: [],
    unresolvedFacts: [],
    requiredAttribution: [],
    internalLinkOpportunities: [],
    relatedSiteContent: [],
    uniqueValueProposition: "u",
    targetLengthRange: { min: 50, max: 500 },
    freshnessConstraints: [],
    contentWarnings: [],
    generatedAt: new Date().toISOString(),
  };
  const report = runEditorialQa({
    article,
    brief,
    licenses,
    seo: {
      seoTitle: article.seoTitle,
      h1: "T",
      slug: "t",
      metaDescription: article.seoDescription,
      excerpt: "e",
      primaryKeyword: "Studio",
      secondaryKeywords: [],
      entityCoverage: [],
      internalLinks: [],
      externalAttributionLinks: [],
      openGraph: { title: "t", description: "d" },
      socialTitle: "t",
      structuredDataRecommendation: "NewsArticle",
      keywordDensity: { keyword: "Studio", occurrences: 1, densityPercent: 1, stuffingRisk: false },
      searchVolumeDisclaimer: "x",
    },
    sourceTexts: [],
    indexedPageTitles: [],
    entityNames: [],
    enrichmentKnowledge: [],
    enrichmentDates: [],
  });
  assert.equal(report.passed, false, "unsupported year must hard-fail");
  assert.equal(report.criticalUnsupportedClaims.length, 1);
});

test("publication gates: configurable ladder from auto_publish to reject", () => {
  const goodQa = { score: 90, passed: true, criticalUnsupportedClaims: [], dimensions: [], findings: [] };
  const baseInput = {
    qa: goodQa,
    configJson: null,
    sourceGroups: 2,
    siteFitScore: 0.8,
    copyrightWarning: false,
  };
  const auto = evaluatePublicationGates({
    ...baseInput,
    policy: { autoGenerate: true, autoApprove: true, autoSchedule: true, autoPublish: true },
    configJson: { autoPublish: { minQaScore: 80, allowUnsupportedClaims: false, allowCopyrightWarning: false, minSourceGroups: 2, minSiteMatch: 0.5, requireHumanApproval: false } },
  });
  assert.equal(auto.decision, "auto_publish");

  const review = evaluatePublicationGates({
    ...baseInput,
    policy: { autoGenerate: true, autoApprove: true, autoSchedule: true, autoPublish: true },
    configJson: { autoPublish: { minQaScore: 80, allowUnsupportedClaims: false, allowCopyrightWarning: false, minSourceGroups: 2, minSiteMatch: 0.5, requireHumanApproval: true } },
  });
  assert.equal(review.decision, "review");

  const hold = evaluatePublicationGates({
    ...baseInput,
    qa: { ...goodQa, score: 40 },
    policy: { autoGenerate: true, autoApprove: true, autoSchedule: true, autoPublish: true },
    configJson: { autoPublish: { minQaScore: 80, allowUnsupportedClaims: false, allowCopyrightWarning: false, minSourceGroups: 2, minSiteMatch: 0.5, requireHumanApproval: false } },
  });
  assert.equal(hold.decision, "hold", "quality gates must hold auto-publishing when approval is not required");

  const reject = evaluatePublicationGates({
    ...baseInput,
    qa: { ...goodQa, criticalUnsupportedClaims: [{ claim: "1931", reason: "not in ledger" }] },
    policy: { autoGenerate: true, autoApprove: true, autoSchedule: true, autoPublish: true },
    configJson: null,
  });
  assert.equal(reject.decision, "reject");

  const policyOff = evaluatePublicationGates({
    ...baseInput,
    policy: { autoGenerate: false, autoApprove: false, autoSchedule: false, autoPublish: false },
  });
  assert.equal(policyOff.decision, "review");

  assert.equal(resolveGatesConfig(null).minQaScore, 75);
  assert.equal(resolveGatesConfig({ autoPublish: { minQaScore: 60 } }).minQaScore, 60);
});

test("provenance: claims map back to ledger facts and single-source attribution is detected", () => {
  const licenses: FactLicense[] = [
    {
      factKey: "release_year",
      statement: "2027",
      usage: "attribute",
      sensitivity: "high",
      reasons: [],
      phrasingHint: "",
      sources: [{ publisher: "Variety", url: "https://v.example/x", group: "variety" }],
      alternatives: [],
    },
  ];
  const article: ParsedArticle = {
    title: "T",
    h1: "T",
    excerpt: "e",
    bodyHtml: "<p>According to Variety, 2027.</p>",
    seoTitle: "",
    seoDescription: "",
    claims: [{ text: "According to Variety, 2027.", factKey: "release_year", attributionRequired: true }],
  };
  const entries = buildProvenance({ article, licenses });
  assert.equal(entries.length, 1);
  assert.equal(entries[0].claims.length, 1);
  assert.equal(entries[0].inlineAttributed, true);
});

test("site value: blocks only render from validated data; Spanish release never derived", () => {
  const blocks = resolveSiteValueBlocks({
    config: null,
    domains: ["movie_tv"],
    locale: "es-ES",
    entities: [{ type: "movie", name: "Film" }],
    enrichments: [
      {
        entityId: "e",
        providerKey: "tmdb",
        title: "Film",
        originalTitle: null,
        releaseDate: "2027-07-16",
        resourceType: "movie",
        matchMethod: "year_match",
        confidence: 0.9,
        data: { cast: ["Ana"], watchProviders: ["Netflix"], rating: 7 },
      },
    ],
    internalLinks: [{ url: "https://site.example/x", title: "Related", anchor: "Related", reason: "r", score: 5 }],
    factStatements: [],
  });
  const keys = blocks.map((block) => block.key);
  assert.ok(keys.includes("where_to_watch"));
  assert.ok(keys.includes("cast"));
  assert.ok(keys.includes("related_content"));
  assert.ok(!keys.includes("spanish_release"), "Spanish release must never be derived from the general release date");
  const empty = resolveSiteValueBlocks({
    config: null,
    domains: ["movie_tv"],
    locale: "es-ES",
    entities: [{ type: "movie", name: "Film" }],
    enrichments: [],
    internalLinks: [],
    factStatements: [],
  });
  assert.equal(empty.length, 0, "no data → no value blocks");
});

// ──────────────────────────────────────────────────────────── E2E scenarios

test("scenario 1: single source — attributed license, human review, no hard failures", async () => {
  const fixture = await createEngineFixture();
  setArticleWriterFactory(() => new FakeWriter());
  try {
    const item = makeItem({
      title: "Small Indie Horror Reveals New Trailer Ahead Of Premiere",
      externalId: "s1",
      canonicalUrl: "https://variety.example/s1",
      publishedAt: new Date(Date.now() - 3_600_000).toISOString(),
    });
    await ingestAndScore(fixture.tenantId, fixture.sourceA, item, 0.7);
    const cluster = await singleClusterFor(fixture);
    const generation = await generateArticleFromCluster(fixture.tenantId, cluster.id, { siteId: fixture.siteId });
    const detail = detailOf(generation);
    assert.equal(detail.decision, "create_new");
    assert.equal(detail.articleType, "trailer_news");
    assert.equal(detail.qa.passed, true, "no critical claims expected");
    const licenses = detail.factLicenses;
    assert.ok(licenses.some((license) => license.usage === "attribute"), "single-source facts must be attributed");
    assert.ok(detail.publication && detail.publication.decision === "review", "policy disabled → human review");
    assert.ok(detail.project, "draft must be materialized for review");
    assert.ok(Array.isArray(detail.provenance) && detail.provenance.length > 0, "provenance stored even without inline attribution");
  } finally {
    await cleanupEngineFixture(fixture);
  }
});

test("scenario 2: corroborated news — confident facts, strong QA, review decision", async () => {
  const fixture = await createEngineFixture();
  setArticleWriterFactory(() => new FakeWriter());
  try {
    const publishedAt = new Date(Date.now() - 3_600_000).toISOString();
    const title = "Studio Announces Space Epic (2027) At CinemaCon";
    await ingestAndScore(fixture.tenantId, fixture.sourceA, makeItem({
      title,
      externalId: "s2a",
      canonicalUrl: "https://variety.example/s2a",
      publishedAt,
    }), 0.8);
    await ingestAndScore(fixture.tenantId, fixture.sourceB, makeItem({
      title,
      externalId: "s2b",
      canonicalUrl: "https://hollywoodreporter.example/s2b",
      publishedAt,
    }), 0.8);
    const cluster = await singleClusterFor(fixture);
    assert.equal(cluster.verificationState, "corroborated");
    const generation = await generateArticleFromCluster(fixture.tenantId, cluster.id, { siteId: fixture.siteId });
    const detail = detailOf(generation);
    assert.equal(detail.articleType, "movie_announcement");
    const licenses = detail.factLicenses;
    assert.ok(licenses.some((license) => license.usage === "state_confidently" && license.factKey === "headline"));
    assert.ok(Number(detail.qa.score) >= 70, `expected strong QA, got ${detail.qa.score}`);
    assert.equal(detail.publication?.decision, "review");
    assert.equal(detail.qa.criticalUnsupportedClaims.length, 0);
  } finally {
    await cleanupEngineFixture(fixture);
  }
});

test("scenario 3: conflicting news — uncertainty is represented, never silently resolved", async () => {
  const fixture = await createEngineFixture();
  setArticleWriterFactory(() => new FakeWriter());
  try {
    const title = "Netflix Renews The Midnight Club For A Second Season";
    await ingestAndScore(fixture.tenantId, fixture.sourceA, makeItem({
      title,
      externalId: "s3a",
      canonicalUrl: "https://variety.example/s3a",
      publishedAt: "2026-08-29T10:00:00Z",
    }), 0.7);
    await ingestAndScore(fixture.tenantId, fixture.sourceB, makeItem({
      title,
      externalId: "s3b",
      canonicalUrl: "https://hollywoodreporter.example/s3b",
      publishedAt: "2026-08-31T10:00:00Z",
    }), 0.7);
    const cluster = await singleClusterFor(fixture);
    assert.equal(cluster.verificationState, "disputed");
    const generation = await generateArticleFromCluster(fixture.tenantId, cluster.id, { siteId: fixture.siteId });
    const detail = detailOf(generation);
    assert.equal(detail.articleType, "standard_news");
    const licenses = detail.factLicenses;
    assert.ok(licenses.some((license) => license.usage === "represent_uncertainty"), "conflicting dates must require uncertainty");
    assert.ok(
      Array.isArray(detail.brief?.contentWarnings) && (detail.brief.contentWarnings as string[]).some((warning) => warning.includes("uncertainty")),
      "brief must carry the uncertainty warning",
    );
    assert.equal(detail.publication?.decision, "review");
    assert.equal(detail.qa.criticalUnsupportedClaims.length, 0);
  } finally {
    await cleanupEngineFixture(fixture);
  }
});

test("scenario 4: movie release — enrichment-driven site value, no hallucinated availability", async () => {
  const fixture = await createEngineFixture();
  setArticleWriterFactory(() => new FakeWriter());
  try {
    const item = makeItem({
      title: "Fantastic Beasts Finale (2027) Gets Official Release Date",
      externalId: "s4",
      canonicalUrl: "https://variety.example/s4",
      publishedAt: new Date(Date.now() - 3_600_000).toISOString(),
    });
    await ingestAndScore(fixture.tenantId, fixture.sourceA, item, 0.75);
    const cluster = await singleClusterFor(fixture);
    await addEnrichment(fixture, "Fantastic Beasts Finale", {
      releaseDate: "2027-07-16",
      cast: ["Eddie Redmayne"],
      watchProviders: ["HBO Max"],
    });
    const generation = await generateArticleFromCluster(fixture.tenantId, cluster.id, { siteId: fixture.siteId });
    const detail = detailOf(generation);
    assert.equal(detail.articleType, "release_date_news");
    assert.match(String(detail.seo?.structuredDataRecommendation ?? ""), /NewsArticle/);
    const valueProposition = detail.brief?.uniqueValueProposition ?? "";
    assert.match(valueProposition, /HBO Max/, "validated provider must feed the site value");
    assert.match(valueProposition, /Eddie Redmayne/);
    assert.ok(Array.isArray(detail.sources) && detail.sources.length >= 1, "sources panel present");
    assert.ok(Array.isArray(detail.enrichment) && detail.enrichment.length >= 1, "enrichment panel present");
    assert.equal(detail.qa.criticalUnsupportedClaims.length, 0);
  } finally {
    await cleanupEngineFixture(fixture);
  }
});

test("scenario 5: casting announcement — dedicated template, grounded claims", async () => {
  const fixture = await createEngineFixture();
  setArticleWriterFactory(() => new FakeWriter());
  try {
    await ingestAndScore(fixture.tenantId, fixture.sourceA, makeItem({
      title: "Ana De Armas Joins Gladiator Sequel (2027) Cast",
      externalId: "s5",
      canonicalUrl: "https://variety.example/s5",
      publishedAt: new Date(Date.now() - 3_600_000).toISOString(),
    }), 0.75);
    const cluster = await singleClusterFor(fixture);
    const generation = await generateArticleFromCluster(fixture.tenantId, cluster.id, { siteId: fixture.siteId });
    const detail = detailOf(generation);
    assert.equal(detail.articleType, "casting_news");
    assert.equal(detail.qa.criticalUnsupportedClaims.length, 0);
  } finally {
    await cleanupEngineFixture(fixture);
  }
});

test("scenario 6: fake rumor — single low-trust source stays attributed and never auto-publishes", async () => {
  const fixture = await createEngineFixture();
  setArticleWriterFactory(() => new FakeWriter());
  try {
    await ingestAndScore(fixture.tenantId, fixture.sourceC, makeItem({
      title: "Rumor: Major Director Attached To Secret DC Project",
      externalId: "s6",
      canonicalUrl: "https://blog.example/s6",
      publishedAt: new Date(Date.now() - 3_600_000).toISOString(),
    }), 0.6);
    const cluster = await singleClusterFor(fixture);
    const generation = await generateArticleFromCluster(fixture.tenantId, cluster.id, { siteId: fixture.siteId });
    const detail = detailOf(generation);
    const licenses = detail.factLicenses;
    assert.ok(licenses.some((license) => license.usage === "attribute"));
    assert.ok(detail.publication && detail.publication.decision !== "auto_publish", "a single low-trust source can never auto-publish");
    assert.equal(detail.qa.criticalUnsupportedClaims.length, 0);
  } finally {
    await cleanupEngineFixture(fixture);
  }
});

test("scenario 7: release-date correction — update existing article, version history, no provenance overwrite", async () => {
  const fixture = await createEngineFixture();
  setArticleWriterFactory(() => new FakeWriter());
  try {
    const title = "Untitled Sci-Fi Project (2027) Gets Release Date";
    const first = makeItem({
      title,
      externalId: "s7",
      canonicalUrl: "https://variety.example/s7",
      publishedAt: new Date(Date.now() - 24 * 3_600_000).toISOString(),
    });
    await ingestAndScore(fixture.tenantId, fixture.sourceA, first, 0.7);
    const cluster = await singleClusterFor(fixture);
    const firstGeneration = await generateArticleFromCluster(fixture.tenantId, cluster.id, { siteId: fixture.siteId });
    const firstProjectId = detailOf(firstGeneration).project?.id;
    assert.ok(firstProjectId, "first generation must materialize a project");

    // The release year changes: same externalId, updated content → developing.
    const corrected = makeItem({
      title: "Untitled Sci-Fi Project (2028) Gets Release Date",
      externalId: "s7",
      canonicalUrl: "https://variety.example/s7",
      publishedAt: new Date(Date.now() - 3_600_000).toISOString(),
    });
    const upserted = await upsertSourceItem(fixture.tenantId, fixture.sourceA, corrected);
    assert.equal(upserted.updated, true, "changed content on same identity is an update");
    assert.ok(upserted.sourceItemId);
    await runIntelligencePipelineForItem(fixture.tenantId, upserted.sourceItemId as string);

    const secondGeneration = await generateArticleFromCluster(fixture.tenantId, cluster.id, { siteId: fixture.siteId });
    const detail = detailOf(secondGeneration);
    assert.equal(detail.decision, "update_existing");
    assert.equal(detail.articleType, "article_update");
    assert.equal(detail.project?.id, firstProjectId, "same project is updated");
    assert.ok(
      Array.isArray(detail.updateDelta?.changedFacts) &&
        (detail.updateDelta.changedFacts as unknown[]).some((entry) => (entry as { factKey: string }).factKey === "release_year"),
      "update delta must record the changed release year",
    );

    const versions = await prisma.contentVersion.findMany({ where: { projectId: firstProjectId } });
    assert.equal(versions.length, 2, "version history preserved");
    assert.ok(versions.some((version) => version.versionNumber === 2));

    const generations = await prisma.articleGeneration.findMany({
      where: { tenantId: fixture.tenantId, projectId: firstProjectId },
      orderBy: { createdAt: "asc" },
    });
    assert.equal(generations.length, 2, "provenance history preserved as separate generation rows");
  } finally {
    await cleanupEngineFixture(fixture);
  }
});

test("scenario 8: existing article on the site — duplicate check chooses update over duplicate", async () => {
  const fixture = await createEngineFixture({
    indexedPages: [{ title: "The Longest Yard Remake (2027) Explained", url: "https://site.example/longest-yard" }],
  });
  setArticleWriterFactory(() => new FakeWriter());
  try {
    const cluster = await (async () => {
      await ingestAndScore(fixture.tenantId, fixture.sourceA, makeItem({
        title: "The Longest Yard Remake (2027) Explained",
        externalId: "s8",
        canonicalUrl: "https://variety.example/s8",
        publishedAt: new Date(Date.now() - 3_600_000).toISOString(),
      }), 0.7);
      return singleClusterFor(fixture);
    })();

    // The site already has a managed article for this cluster (simulated as
    // an article created before the engine existed).
    const project = await prisma.contentProject.create({
      data: {
        tenantId: fixture.tenantId,
        siteId: fixture.siteId,
        title: "The Longest Yard Remake (2027) Explained",
        brief: "older article",
        goal: "article",
        status: "approved",
        primaryLanguage: "es",
        clusterId: cluster.id,
        origin: "manual",
      },
    });
    await prisma.contentVersion.create({
      data: {
        tenantId: fixture.tenantId,
        projectId: project.id,
        versionNumber: 1,
        status: "published",
        title: project.title,
        bodyHtml: "<p>Older body.</p>",
      },
    });

    const generation = await generateArticleFromCluster(fixture.tenantId, cluster.id, { siteId: fixture.siteId });
    const detail = detailOf(generation);
    assert.equal(detail.decision, "update_existing", "an existing managed article must be updated, not duplicated");
    assert.equal(detail.project?.id, project.id);
    const versions = await prisma.contentVersion.findMany({ where: { projectId: project.id } });
    assert.equal(versions.length, 2);
  } finally {
    await cleanupEngineFixture(fixture);
  }
});

test("scenario 9: irrelevant topic — site-match gate blocks automation, human review with visible evidence", async () => {
  const fixture = await createEngineFixture();
  setArticleWriterFactory(() => new FakeWriter());
  try {
    await ingestAndScore(fixture.tenantId, fixture.sourceA, makeItem({
      title: "Global Coffee Prices Rise Amid Supply Shortages",
      externalId: "s9",
      canonicalUrl: "https://variety.example/s9",
      categories: ["markets"],
      publishedAt: new Date(Date.now() - 48 * 3_600_000).toISOString(),
    }), 0.5);
    const cluster = await singleClusterFor(fixture);
    const generation = await generateArticleFromCluster(fixture.tenantId, cluster.id, { siteId: fixture.siteId });
    const detail = detailOf(generation);
    assert.ok(["breaking_news", "standard_news"].includes(detail.articleType), `expected a plain news type, got ${detail.articleType}`);
    const siteFit = detail.cluster?.siteFitScore ?? null;
    assert.ok(siteFit !== null && siteFit < 0.5, `expected low site fit, got ${siteFit}`);
    assert.equal(detail.publication?.decision, "review", "policy is off → human review with gate evidence");
    assert.ok(
      detail.publication.gates.some((gate) => gate.key === "site_match" && gate.passed === false),
      "the failed site-match gate must be visible to the editor",
    );
  } finally {
    await cleanupEngineFixture(fixture);
  }
});

test("scenario 10: ambiguous movie title — year conflict represented, never picked silently", async () => {
  const fixture = await createEngineFixture();
  setArticleWriterFactory(() => new FakeWriter());
  try {
    await ingestAndScore(fixture.tenantId, fixture.sourceA, makeItem({
      title: "Dune Remake (2021) Gets Official Release Date",
      externalId: "s10a",
      canonicalUrl: "https://variety.example/s10a",
      publishedAt: new Date(Date.now() - 3_600_000).toISOString(),
    }), 0.75);
    await ingestAndScore(fixture.tenantId, fixture.sourceB, makeItem({
      title: "Dune Remake (1984) Gets Official Release Date",
      externalId: "s10b",
      canonicalUrl: "https://hollywoodreporter.example/s10b",
      publishedAt: new Date(Date.now() - 3_600_000).toISOString(),
    }), 0.75);
    const cluster = await singleClusterFor(fixture);
    assert.equal(cluster.verificationState, "disputed");
    const generation = await generateArticleFromCluster(fixture.tenantId, cluster.id, { siteId: fixture.siteId });
    const detail = detailOf(generation);
    assert.equal(detail.qa.criticalUnsupportedClaims.length, 0, "both years exist in the ledger — the conflict is represented, not fatal");
    const licenses = detail.factLicenses;
    assert.ok(licenses.some((license) => license.factKey === "release_year" && license.usage === "represent_uncertainty"));
    assert.equal(detail.publication?.decision, "review");
  } finally {
    await cleanupEngineFixture(fixture);
  }
});

test("scenario 11: unsupported claim injected by the writer — QA hard-fails and publication rejects", async () => {
  const fixture = await createEngineFixture();
  setArticleWriterFactory(() => new FakeWriter(true));
  try {
    await ingestAndScore(fixture.tenantId, fixture.sourceA, makeItem({
      title: "Director Attached To New Heist Thriller",
      externalId: "s11",
      canonicalUrl: "https://variety.example/s11",
      publishedAt: new Date(Date.now() - 3_600_000).toISOString(),
    }), 0.7);
    const cluster = await singleClusterFor(fixture);
    const generation = await generateArticleFromCluster(fixture.tenantId, cluster.id, { siteId: fixture.siteId });
    const detail = detailOf(generation);
    assert.equal(detail.qa.passed, false, "unsupported year must hard-fail QA");
    assert.ok(detail.qa.criticalUnsupportedClaims.length > 0);
    assert.equal(detail.publication?.decision, "reject", "critical unsupported claims must reject publication");
  } finally {
    await cleanupEngineFixture(fixture);
  }
});

test("classifier override seam: deterministic tests can inject an override", () => {
  setClassifierOverride((input) => ({
    articleType: "what_to_watch",
    searchIntent: "commercial_investigation",
    signals: [{ signal: "override", detail: "test override" }],
  }));
  try {
    const result = getClassifiedStory({
      headline: "Any headline",
      summary: null,
      memberTitles: [],
      categories: [],
      verificationState: "unverified",
      entities: [],
      facts: [],
      ageHours: 1,
    });
    assert.equal(result.articleType, "what_to_watch");
  } finally {
    setClassifierOverride(null);
  }
});
