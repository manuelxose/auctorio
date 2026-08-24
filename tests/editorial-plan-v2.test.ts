import test from "node:test";
import assert from "node:assert/strict";
import { classifyCannibalization, computeSiteRelevanceScore, DEFAULT_RELEVANCE_THRESHOLD } from "../src/studio/site-relevance";
import { postValidatePlanItems } from "../src/studio/editorial-plan";
import type { EditorialPlanBriefV2 } from "../src/studio/editorial-plan-schema";
import type { EditorialPlanningContext } from "../src/studio/editorial-plan-context";
import type { SiteIntelligenceProfileSummary } from "../src/studio/site-intelligence/profile";

// ────────────────────────────────────────────────────────────── GuiaTV fixture profile

const guiatvProfile = {
  detectedSiteType: "tv-programming-guide",
  mainTopics: ["television", "programacion", "series", "peliculas", "streaming", "plataformas", "futbol", "canales"],
  categories: ["tv", "streaming", "futbol"],
  commercialTopics: ["precio", "comparativa", "mejores plataformas", "suscripcion"],
  evergreenTopics: ["que es", "guia", "como funciona"],
  newsTopics: ["estrenos", "hoy", "noticias"],
  sportsTopics: ["champions", "laliga", "futbol"],
  topicClusters: [
    { name: "streaming", slug: "streaming", pagesCount: 214, authorityScore: 1, gapScore: 0, keywords: [], sampleUrls: [] },
    { name: "where-to-watch", slug: "where-to-watch", pagesCount: 180, authorityScore: 0.8, gapScore: 0, keywords: [], sampleUrls: [] },
    { name: "sports", slug: "sports", pagesCount: 173, authorityScore: 0.7, gapScore: 0, keywords: [], sampleUrls: [] },
  ],
  contentTypes: [
    { type: "where-to-watch", count: 180 },
    { type: "schedule", count: 150 },
    { type: "ranking", count: 90 },
    { type: "sports", count: 170 },
  ],
} as unknown as Pick<SiteIntelligenceProfileSummary, "mainTopics" | "categories" | "commercialTopics" | "evergreenTopics" | "newsTopics" | "sportsTopics" | "topicClusters" | "contentTypes" | "detectedSiteType">;

function brief(overrides: Partial<EditorialPlanBriefV2>): EditorialPlanBriefV2 {
  const defaults: EditorialPlanBriefV2 = {
    scheduledFor: "2026-09-02T10:00:00.000Z",
    channel: "website",
    contentType: "where-to-watch",
    newsOrEvergreen: "evergreen",
    topic: "streaming",
    topicCluster: "where-to-watch",
    pillarPage: undefined,
    workingTitle: "Donde ver contenido en streaming",
    finalSuggestedTitle: undefined,
    angle: undefined,
    editorialObjective: undefined,
    primaryIntent: "where-to-watch",
    secondaryIntents: [],
    funnelStage: "middle",
    targetAudience: undefined,
    targetQuery: "donde ver la isla de las tentaciones",
    primaryKeyword: "donde ver la isla de las tentaciones",
    secondaryKeywords: ["la isla de las tentaciones"],
    semanticKeywords: [],
    relatedEntities: [],
    questionsToAnswer: [],
    competitorAngle: undefined,
    suggestedSlug: "donde-ver-la-isla-de-las-tentaciones",
    seoTitle: undefined,
    metaDescription: undefined,
    recommendedWordCountMin: 1200,
    recommendedWordCountMax: 2000,
    outline: [
      { heading: "Plataformas disponibles", subpoints: [] },
      { heading: "Precio", subpoints: [] },
      { heading: "Preguntas frecuentes", subpoints: [] },
    ],
    suggestedInternalLinks: [],
    suggestedExternalEvidenceTypes: [],
    faqCandidates: [],
    schemaTypes: [],
    cta: undefined,
    imageConcept: undefined,
    imageRequirements: undefined,
    socialHook: undefined,
    suggestedHashtags: [],
    freshnessRequirement: "low",
    priority: 8,
    difficultyEstimate: 3,
    opportunityScore: 80,
    relevanceScore: 80,
    cannibalizationRisk: "none",
    confidence: 0.8,
    rationale: "Guia del destino sobre donde ver un reality popular.",
    sourceEvidence: [],
  };
  return { ...defaults, ...overrides };
}

// ────────────────────────────────────────────────────────────── Relevance scoring

test("relevant GuiaTV ideas pass the relevance threshold", () => {
  const cases: Array<{ topic: string; title: string }> = [
    { topic: "streaming", title: "Dónde ver La Isla de las Tentaciones en streaming" },
    { topic: "tv guide", title: "Guía de TV hoy: programación de La 1 y Antena 3" },
    { topic: "football", title: "Horario y canal del Real Madrid - Barcelona en Champions" },
    { topic: "platforms", title: "Comparativa Netflix vs Max: precios y catálogo" },
    { topic: "ranking", title: "Las 15 mejores series de Netflix en 2026" },
  ];
  for (const candidate of cases) {
    const verdict = computeSiteRelevanceScore(
      brief({ topic: candidate.topic, workingTitle: candidate.title }),
      guiatvProfile,
      candidate.title,
    );
    assert.equal(verdict.rejected, false, `${candidate.title} must pass (score ${verdict.score}): ${verdict.reasons.join("; ")}`);
    assert.ok(verdict.score >= DEFAULT_RELEVANCE_THRESHOLD, `${candidate.title} score ${verdict.score}`);
  }
});

test("absurd off-topic candidates are hard-rejected for GuiaTV", () => {
  const cases = [
    "Equipos de soldadura industrial para talleres",
    "Implantes dentales: precios y clínicas",
    "El mejor software B2B de nóminas en 2026",
    "Guía de especulación con criptomonedas",
  ];
  for (const title of cases) {
    const verdict = computeSiteRelevanceScore(
      brief({ topic: "irrelevant", workingTitle: title, topicCluster: undefined }),
      guiatvProfile,
      title,
    );
    assert.equal(verdict.rejected, true, `${title} must be rejected`);
    assert.equal(verdict.score, 0);
    assert.ok(verdict.reasons.some((reason) => reason.includes("off-topic")));
  }
});

test("weakly related ideas score below threshold", () => {
  const verdict = computeSiteRelevanceScore(
    brief({
      topic: "contabilidad",
      workingTitle: "Cómo llevar la contabilidad de una pyme",
      topicCluster: undefined,
      targetQuery: "contabilidad pyme",
      primaryKeyword: "contabilidad pyme",
      contentType: "tutorial",
    }),
    guiatvProfile,
    "Cómo llevar la contabilidad de una pyme",
  );
  assert.ok(verdict.score < DEFAULT_RELEVANCE_THRESHOLD, `expected low score, got ${verdict.score}`);
});

// ────────────────────────────────────────────────────────────── Cannibalization

const existing = {
  queries: ["mejores series netflix"],
  keywords: [],
  indexedUrls: [
    "https://guiaprogramaciontv.com/ranking/mejores-series-netflix",
    "https://guiaprogramaciontv.com/guia/la1-hoy",
  ],
  plannedTitles: ["Ranking de las mejores series de Netflix 2026"],
};

test("classifyCannibalization flags already-targeted queries as high risk", () => {
  const verdict = classifyCannibalization(
    brief({
      topic: "netflix",
      workingTitle: "Ranking de las mejores series de Netflix",
      targetQuery: "mejores series netflix",
      primaryKeyword: "mejores series netflix",
    }),
    "Ranking de las mejores series de Netflix",
    existing,
  );
  assert.equal(verdict.risk, "high");
});

test("classifyCannibalization suggests updating an existing indexed page", () => {
  const verdict = classifyCannibalization(
    brief({
      topic: "netflix",
      workingTitle: "Top de series de Netflix",
      targetQuery: "series netflix ranking",
      primaryKeyword: "series netflix",
      suggestedSlug: "ranking-mejores-series-netflix",
    }),
    "Top de series de Netflix",
    existing,
  );
  assert.ok(["update-existing", "related-cluster", "merge-candidate"].includes(verdict.risk));
  assert.ok(verdict.conflictingUrls.some((url) => url.includes("ranking")));
});

test("classifyCannibalization detects merge candidates by title similarity", () => {
  const verdict = classifyCannibalization(
    brief({
      topic: "netflix",
      workingTitle: "Ranking de las mejores series de Netflix 2026",
      targetQuery: "ranking dramas 2026",
      primaryKeyword: "dramas",
    }),
    "Ranking de las mejores series de Netflix 2026",
    { ...existing, queries: [] },
  );
  assert.equal(verdict.risk, "merge-candidate");
});

test("classifyCannibalization reports no conflict for fresh queries", () => {
  const verdict = classifyCannibalization(
    brief({
      topic: "tv",
      workingTitle: "Qué ver esta noche en la televisión",
      targetQuery: "que ver esta noche en la tele",
      primaryKeyword: "que ver esta noche",
    }),
    "Qué ver esta noche en la televisión",
    existing,
  );
  assert.equal(verdict.risk, "none");
});

// ────────────────────────────────────────────────────────────── Post-validation

function planningContext(overrides: Partial<EditorialPlanningContext> = {}): EditorialPlanningContext {
  return {
    site: { id: "site-1", name: "GuiaTV", type: "guiatv", baseUrl: "https://guiaprogramaciontv.com", locale: "es-ES" },
    profile: guiatvProfile as unknown as SiteIntelligenceProfileSummary,
    profileWarnings: [],
    topIndexedPages: [],
    indexedUrlInventory: [
      "https://guiaprogramaciontv.com/guia/la1-hoy",
      "https://guiaprogramaciontv.com/ranking/mejores-series-netflix",
    ],
    searchTargets: [],
    existingPlanQueries: [],
    existingPlanTitles: [],
    recentProjectTitles: [],
    sourceTitles: [],
    clusters: [],
    evidence: [{ sourceType: "indexed-page", url: "https://guiaprogramaciontv.com/guia/la1-hoy", title: "Guía La 1 hoy" }],
    assemblyMs: 0,
    ...overrides,
  };
}

const planInput = {
  dateFrom: new Date("2026-09-01T00:00:00.000Z"),
  dateTo: new Date("2026-09-07T23:59:59.000Z"),
  publicationCount: 7,
  channels: ["website"] as Array<"website">,
};

test("postValidatePlanItems drops out-of-range dates, duplicates and unrequested channels", () => {
  const items = [
    brief({ topic: "tv", workingTitle: "Guía de TV hoy", scheduledFor: "2026-09-02T10:00:00.000Z" }),
    brief({ topic: "tv", workingTitle: "Guía de TV hoy", scheduledFor: "2026-09-03T10:00:00.000Z" }),
    brief({ topic: "tv", workingTitle: "Fuera de rango", scheduledFor: "2026-10-02T10:00:00.000Z" }),
    brief({ topic: "tv", workingTitle: "Solo en X", channel: "x" as const, scheduledFor: "2026-09-03T10:00:00.000Z" }),
  ];
  const result = postValidatePlanItems(items, planInput, planningContext());
  assert.equal(result.kept.length, 1);
  assert.equal(result.kept[0].workingTitle, "Guía de TV hoy");
  assert.ok(result.dropped.some((drop) => drop.reason.includes("date range")));
  assert.ok(result.dropped.some((drop) => drop.reason.includes("duplicate title")));
  assert.ok(result.dropped.some((drop) => drop.reason.includes("not requested")));
});

test("postValidatePlanItems strips invented internal links and unverified evidence urls", () => {
  const item = brief({
    topic: "tv",
    workingTitle: "Guía de TV hoy",
    suggestedInternalLinks: [
      "https://guiaprogramaciontv.com/guia/la1-hoy",
      "https://invented.example.com/nope",
    ],
    sourceEvidence: [
      { sourceType: "indexed-page", url: "https://guiaprogramaciontv.com/guia/la1-hoy", title: "La 1 hoy", trustScore: null },
      { sourceType: "source", url: "https://fabricated.example.com/x", title: "fabricado", trustScore: null },
    ],
  });
  const result = postValidatePlanItems([item], planInput, planningContext());
  assert.equal(result.kept.length, 1);
  assert.deepEqual(result.kept[0].suggestedInternalLinks, ["https://guiaprogramaciontv.com/guia/la1-hoy"]);
  assert.equal(result.kept[0].sourceEvidence.length, 2, "entries are kept but unverified urls are stripped");
  assert.ok(result.kept[0].sourceEvidence.every((entry) => !entry.url || entry.url !== "https://fabricated.example.com/x"));
  assert.ok(result.warnings.some((warning) => warning.includes("non-inventoried")));
  assert.ok(result.warnings.some((warning) => warning.includes("unverified")));
});

test("postValidatePlanItems rejects off-topic rows and trims excess quantity", () => {
  const items = [
    brief({ topic: "tv", workingTitle: "Guía de TV hoy" }),
    brief({ topic: "tv", workingTitle: "Dónde ver La Isla en streaming", targetQuery: "donde ver la isla en streaming" }),
    brief({ topic: "welding", workingTitle: "Equipos de soldadura industrial" }),
  ];
  const result = postValidatePlanItems(items, { ...planInput, publicationCount: 1 }, planningContext());
  assert.equal(result.kept.length, 1);
  assert.ok(result.dropped.some((drop) => drop.reason.includes("off-topic") || drop.reason.includes("relevance")));
  assert.ok(result.dropped.some((drop) => drop.reason.includes("exceeds")));
});

test("postValidatePlanItems applies word targets from content format", () => {
  const item = brief({
    topic: "tv",
    workingTitle: "Noticia de estreno",
    contentType: "news",
    recommendedWordCountMin: 0,
    recommendedWordCountMax: 0,
  });
  const result = postValidatePlanItems([item], planInput, planningContext());
  assert.equal(result.kept.length, 1);
  assert.equal(result.kept[0].recommendedWordCountMin, 600);
  assert.equal(result.kept[0].recommendedWordCountMax, 1000);
});

test("postValidatePlanItems drops duplicate target queries within a batch", () => {
  const items = [
    brief({ topic: "tv", workingTitle: "Uno", targetQuery: "que ver esta noche" }),
    brief({ topic: "tv", workingTitle: "Dos", targetQuery: "que ver esta noche" }),
  ];
  const result = postValidatePlanItems(items, planInput, planningContext());
  assert.equal(result.kept.length, 1);
  assert.ok(result.dropped.some((drop) => drop.reason.includes("duplicate target query")));
});

test("postValidatePlanItems records cannibalization risk from existing targets", () => {
  const item = brief({
    topic: "tv",
    workingTitle: "Ranking de las mejores series de Netflix",
    targetQuery: "mejores series netflix",
  });
  const result = postValidatePlanItems([item], planInput, planningContext({ searchTargets: ["mejores series netflix"] }));
  assert.equal(result.kept.length, 1);
  assert.equal(result.kept[0].cannibalizationRisk, "high");
});
