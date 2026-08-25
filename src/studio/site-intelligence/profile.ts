import { Prisma } from "@prisma/client";
import type { Site } from "@prisma/client";
import { getPrismaClient } from "../../infrastructure/db/prisma";
import { getNumberEnv } from "../../shared/utils/env";

const prisma = getPrismaClient();

export type TopicClusterSummary = {
  name: string;
  slug: string;
  pagesCount: number;
  authorityScore: number;
  gapScore: number;
  keywords: string[];
  sampleUrls: string[];
};

export type EntitySummary = {
  name: string;
  type: string;
  mentions: number;
};

export type SiteIntelligenceProfileSummary = {
  siteId: string;
  version: number;
  indexedAt: string | null;
  sourceCount: number;
  pageCount: number;
  detectedSiteType: string;
  detectedLanguage: string | null;
  detectedAudience: string | null;
  brandSummary: string | null;
  mainTopics: string[];
  excludedTopics: string[];
  categories: string[];
  entities: EntitySummary[];
  contentTypes: Array<{ type: string; count: number }>;
  topicClusters: TopicClusterSummary[];
  existingContentPatterns: string[];
  editorialTone: string | null;
  formattingPatterns: string[];
  commonArticleLength: number | null;
  internalLinkTargets: Array<{ url: string; title: string; inbound: number }>;
  commercialTopics: string[];
  evergreenTopics: string[];
  newsTopics: string[];
  sportsTopics: string[];
  topicalAuthorityMap: Record<string, number>;
  discoveredSitemaps: string[];
  crawlHealth: Record<string, unknown>;
  confidence: number | null;
  warnings: string[];
};

const SPANISH_STOPWORDS = new Set(
  (
    "de la el los las un una unos unas y o u e ni que en a con por para del al como mas más " +
    "pero su sus este esta estos estas ese esa esos esas mi tu muy no si ya se lo le les me te " +
    "todo toda todos todas otro otra otros otras es son fue fueron ser estar esta hoy ayer manana " +
    "sobre entre hasta desde durante segun tras cual cuales quien quienes cuando donde como cuanto " +
    "cuanta cuantos cuantas porque por que tambien ademas solo cada vez puede pueden nuevo nueva " +
    "nuevos nuevas mejor mejores gran grandes ver hoy donde dnde qu todos los"
  ).split(/\s+/),
);

const ENGLISH_STOPWORDS = new Set(
  "the a an and or but of in on at to for with from by is are was were be been as it its this that these those you your we our they their he she his her not no yes".split(/\s+/),
);

/** GuiaTV-domain lexicons used to classify topics and entities from real crawl data. */
const GUIATV_PLATFORM_ENTITIES: Array<[string, string[]]> = [
  ["netflix", ["netflix"]],
  ["prime video", ["prime video", "amazon prime"]],
  ["disney+", ["disney+", "disney plus"]],
  ["max", ["hbo max", " max"]],
  ["movistar plus+", ["movistar", "movistar plus"]],
  ["skyshowtime", ["skyshowtime", "sky showtime"]],
  ["apple tv+", ["apple tv", "apple tv+"]],
  ["filmin", ["filmin"]],
  ["rtve play", ["rtve play", "rtve"]],
  ["atresplayer", ["atresplayer"]],
  ["mitele", ["mitele"]],
  ["pluto tv", ["pluto tv"]],
  ["rakuten tv", ["rakuten tv"]],
  ["dazn", ["dazn"]],
  ["youtube", ["youtube"]],
  ["twitch", ["twitch"]],
];

const GUIATV_SPORTS_TERMS = [
  "futbol",
  "fútbol",
  "champions",
  "champions league",
  "laliga",
  "la liga",
  "premier league",
  "premier",
  "copa del rey",
  "mundial",
  "eurocopa",
  "baloncesto",
  "nba",
  "acb",
  "tenis",
  "wimbledon",
  "roland garros",
  "motogp",
  "formula 1",
  "f1",
  "ciclismo",
  "tour de francia",
  "vuelta a espana",
  "vuelta",
  "balonmano",
  "atletismo",
  "deportes",
];

const GUIATV_COMMERCIAL_TERMS = [
  "precio",
  "precios",
  "gratis",
  "gratuito",
  "oferta",
  "oferta",
  "planes",
  "suscripcion",
  "suscripción",
  "cuanto cuesta",
  "cuánto cuesta",
  "mejor plataforma",
  "mejores plataformas",
  "comparativa",
  "comparacion",
  "comparación",
  "alternativas",
  "catalogo",
  "catálogo",
  "prueba gratis",
  "descuento",
  "recomendada",
  "recomendadas",
];

const GUIATV_NEWS_TERMS = [
  "estreno",
  "estrenos",
  "noticia",
  "noticias",
  "hoy",
  "esta noche",
  "esta semana",
  "ultima hora",
  "novedades",
  "llegada",
  "regresa",
  "cancela",
  "cancelada",
  "renovada",
  "anuncia",
];

const GUIATV_EVERGREEN_TERMS = [
  "que es",
  "qué es",
  "como funciona",
  "cómo funciona",
  "guia",
  "guía",
  "tutorial",
  "explicacion",
  "explicación",
  "consejos",
  "trucos",
  "mejores series",
  "mejores peliculas",
  "mejores películas",
];

const COMMON_TOPIC_TERMS = [
  "television",
  "televisión",
  "tv",
  "series",
  "peliculas",
  "películas",
  "cine",
  "streaming",
  "canales",
  "programacion",
  "programación",
  "parrilla",
  "horario",
  "horarios",
  "plataformas",
  "entretenimiento",
  "documentales",
  "reality",
  "concursos",
  "telenovelas",
  "series españolas",
];

const GUIATV_SITE_TYPE_PROFILE: Record<string, { siteType: string; audience: string; tone: string }> = {
  guiatv: {
    siteType: "tv-programming-guide",
    audience: "spanish-speaking viewers looking for what to watch and where to stream",
    tone: "informative, practical, recommendation-driven, entertainment editorial",
  },
  tecnoria: {
    siteType: "technology-publication",
    audience: "technology professionals and enthusiasts",
    tone: "technical, analytical, product-focused",
  },
  talkaris: {
    siteType: "communication-platform",
    audience: "professionals and teams",
    tone: "professional, solution-oriented",
  },
  webhook: {
    siteType: "generic-content-site",
    audience: "general audience",
    tone: "editorial",
  },
};

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9áéíóúüñ\s-]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 2 && !SPANISH_STOPWORDS.has(token) && !ENGLISH_STOPWORDS.has(token));
}

function countKeywords(texts: string[]): Array<[string, number]> {
  const counts = new Map<string, number>();
  for (const text of texts) {
    for (const token of tokenize(text)) {
      counts.set(token, (counts.get(token) ?? 0) + 1);
    }
  }
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
}

function termHits(text: string, terms: string[]): number {
  const lowered = text.toLowerCase();
  return terms.filter((term) => lowered.includes(term)).length;
}

function containsAny(text: string, terms: string[]): boolean {
  return termHits(text, terms) > 0;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function median(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? Math.round((sorted[middle - 1] + sorted[middle]) / 2) : sorted[middle];
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((entry): entry is string => typeof entry === "string");
}

/**
 * Deterministic synthesis of a SiteIntelligenceProfile from crawled pages.
 * No LLM required; results are explainable and reproducible.
 */
export async function rebuildSiteProfile(site: Pick<Site, "id" | "tenantId" | "type" | "name">): Promise<SiteIntelligenceProfileSummary> {
  const now = new Date();

  const [pageStats, sitemaps, pages] = await Promise.all([
    prisma.siteIndexedPage.groupBy({
      by: ["crawlState"],
      where: { tenantId: site.tenantId, siteId: site.id },
      _count: { _all: true },
    }),
    prisma.siteSitemap.findMany({ where: { tenantId: site.tenantId, siteId: site.id }, select: { url: true, kind: true, status: true, urlCount: true } }),
    prisma.siteIndexedPage.findMany({
      where: { tenantId: site.tenantId, siteId: site.id, crawlState: { in: ["extracted", "stale"] } },
      select: {
        id: true,
        url: true,
        title: true,
        h1: true,
        headings: true,
        content: true,
        wordCount: true,
        language: true,
        contentType: true,
        structuredData: true,
      },
    }),
  ]);

  const totalPages = pageStats.reduce((sum, group) => sum + group._count._all, 0);
  const extractedPages = pageStats.filter((group) => group.crawlState === "extracted" || group.crawlState === "stale").reduce((sum, group) => sum + group._count._all, 0);

  // ── Language
  const languageCounts = new Map<string, number>();
  for (const page of pages) {
    if (!page.language) {
      continue;
    }
    const lang = page.language.split("-")[0].toLowerCase();
    languageCounts.set(lang, (languageCounts.get(lang) ?? 0) + 1);
  }
  const detectedLanguage = Array.from(languageCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "es";

  // ── Content types
  const contentTypeCounts = new Map<string, number>();
  for (const page of pages) {
    const type = page.contentType ?? "article";
    contentTypeCounts.set(type, (contentTypeCounts.get(type) ?? 0) + 1);
  }

  // ── Keywords
  const titleTexts = pages.map((page) => `${page.title ?? ""} ${page.h1 ?? ""} ${readStringArray(page.headings).join(" ")}`).filter(Boolean);
  const topKeywords = countKeywords(titleTexts).slice(0, getNumberEnv("SITE_INTEL_TOP_KEYWORDS", 40));

  // ── Topics (keyword n-gram phrases from titles)
  const topicCounts = new Map<string, number>();
  for (const page of pages) {
    const title = (page.title ?? "").toLowerCase();
    for (const term of COMMON_TOPIC_TERMS) {
      if (title.includes(term)) {
        topicCounts.set(term, (topicCounts.get(term) ?? 0) + 1);
      }
    }
  }
  const detectedTopics = Array.from(topicCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([term]) => term);

  // ── Topics: fixed domain lexicon hits merged with empirically dominant
  // title tokens (so sparse early crawls still yield a useful vocabulary).
  const mergedTopics = [
    ...detectedTopics,
    ...topKeywords.map(([token]) => token).filter((token) => !detectedTopics.includes(token)),
  ].slice(0, 30);

  // ── Classified topics
  const topicTitleBlob = titleTexts.join(" ").toLowerCase();
  const commercialTopics = GUIATV_COMMERCIAL_TERMS.filter((term) => topicTitleBlob.includes(term));
  const evergreenTopics = GUIATV_EVERGREEN_TERMS.filter((term) => topicTitleBlob.includes(term));
  const newsTopics = GUIATV_NEWS_TERMS.filter((term) => topicTitleBlob.includes(term));
  const sportsTopics = GUIATV_SPORTS_TERMS.filter((term) => topicTitleBlob.includes(term));

  // ── Entities via lexicons
  const entities: EntitySummary[] = [];
  for (const [name, aliases] of GUIATV_PLATFORM_ENTITIES) {
    const mentions = pages.reduce((sum, page) => sum + termHits(`${page.title ?? ""} ${page.h1 ?? ""}`, aliases), 0);
    if (mentions > 0) {
      entities.push({ name, type: "platform", mentions });
    }
  }
  for (const term of GUIATV_SPORTS_TERMS) {
    const mentions = pages.reduce((sum, page) => sum + termHits(`${page.title ?? ""}`, [term]), 0);
    if (mentions > 0) {
      entities.push({ name: term, type: "competition", mentions });
    }
  }

  // ── Clusters by content type + dominant topic terms
  const clusterMap = new Map<string, { pages: string[]; keywords: string[]; type: string }>();
  for (const page of pages) {
    const type = page.contentType ?? "article";
    const key = type;
    const entry = clusterMap.get(key) ?? { pages: [], keywords: [], type };
    entry.pages.push(page.url);
    entry.keywords.push(...tokenize(`${page.title ?? ""} ${page.h1 ?? ""}`));
    clusterMap.set(key, entry);
  }
  const maxClusterSize = Math.max(1, ...Array.from(clusterMap.values()).map((entry) => entry.pages.length));
  const topicClusters: TopicClusterSummary[] = [];
  for (const [key, entry] of clusterMap.entries()) {
    const keywordCounts = new Map<string, number>();
    for (const token of entry.keywords) {
      keywordCounts.set(token, (keywordCounts.get(token) ?? 0) + 1);
    }
    const keywords = Array.from(keywordCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([token]) => token);
    topicClusters.push({
      name: key,
      slug: slugify(key),
      pagesCount: entry.pages.length,
      authorityScore: Number((entry.pages.length / maxClusterSize).toFixed(3)),
      gapScore: 0,
      keywords,
      sampleUrls: entry.pages.slice(0, 5),
    });
  }

  // ── Internal link targets
  const linkTargets = await prisma.siteInternalLink.groupBy({
    by: ["targetUrl"],
    where: { tenantId: site.tenantId, siteId: site.id },
    _count: { _all: true },
    orderBy: { _count: { targetUrl: "desc" } },
    take: 100,
  });
  const urlTitleMap = new Map(pages.map((page) => [page.url, page.title ?? ""]));
  const internalLinkTargets = linkTargets
    .map((entry) => ({ url: entry.targetUrl, title: urlTitleMap.get(entry.targetUrl) ?? "", inbound: entry._count._all }))
    .filter((entry) => entry.title);

  // ── Article length
  const wordCounts = pages.map((page) => page.wordCount ?? 0).filter((count) => count > 0);
  const commonArticleLength = median(wordCounts);

  // ── Structured data patterns
  const structuredCounts = new Map<string, number>();
  for (const page of pages) {
    for (const type of readStringArray(page.structuredData)) {
      structuredCounts.set(type, (structuredCounts.get(type) ?? 0) + 1);
    }
  }
  const existingContentPatterns = Array.from(structuredCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([type, count]) => `${type} (${count} pages)`);

  const typeProfile = GUIATV_SITE_TYPE_PROFILE[site.type] ?? GUIATV_SITE_TYPE_PROFILE.webhook;
  const warnings: string[] = [];
  if (extractedPages === 0) {
    warnings.push("no pages extracted yet; profile is based on URL inventory only");
  }
  if (extractedPages < 20 && totalPages > 0) {
    warnings.push(`only ${extractedPages} pages extracted of ${totalPages} known URLs; crawl more pages for a reliable profile`);
  }
  if (sitemaps.every((sitemap) => sitemap.status !== "fetched")) {
    warnings.push("no healthy sitemap fetched; discovery may be incomplete");
  }
  const confidence = extractedPages === 0 ? 0.15 : Math.min(0.95, 0.35 + extractedPages / Math.max(1, totalPages) * 0.6);

  const profile: SiteIntelligenceProfileSummary = {
    siteId: site.id,
    version: 0,
    indexedAt: now.toISOString(),
    sourceCount: sitemaps.length,
    pageCount: totalPages,
    detectedSiteType: typeProfile.siteType,
    detectedLanguage,
    detectedAudience: typeProfile.audience,
    brandSummary: `${site.name} — ${typeProfile.siteType} covering ${detectedTopics.slice(0, 6).join(", ") || "its connected content"}.`,
    mainTopics: mergedTopics.length > 0 ? mergedTopics : topKeywords.slice(0, 12).map(([token]) => token),
    excludedTopics: [],
    categories: detectedTopics,
    entities,
    contentTypes: Array.from(contentTypeCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([type, count]) => ({ type, count })),
    topicClusters,
    existingContentPatterns,
    editorialTone: typeProfile.tone,
    formattingPatterns: ["semantic headings (h1/h2/h3)", "short paragraphs", "internal linking"],
    commonArticleLength,
    internalLinkTargets,
    commercialTopics,
    evergreenTopics,
    newsTopics,
    sportsTopics,
    topicalAuthorityMap: Object.fromEntries(topicClusters.map((cluster) => [cluster.slug, cluster.pagesCount])),
    discoveredSitemaps: sitemaps.map((sitemap) => sitemap.url),
    crawlHealth: {
      states: Object.fromEntries(pageStats.map((group) => [group.crawlState, group._count._all])),
      healthySitemaps: sitemaps.filter((sitemap) => sitemap.status === "fetched").length,
      totalSitemaps: sitemaps.length,
    },
    confidence: Number(confidence.toFixed(2)),
    warnings,
  };

  // ── Persist clusters, entities and profile
  await prisma.$transaction([
    prisma.siteTopicCluster.deleteMany({ where: { tenantId: site.tenantId, siteId: site.id } }),
    prisma.siteEntity.deleteMany({ where: { tenantId: site.tenantId, siteId: site.id } }),
    ...topicClusters.map((cluster) =>
      prisma.siteTopicCluster.create({
        data: {
          tenantId: site.tenantId,
          siteId: site.id,
          name: cluster.name,
          slug: cluster.slug,
          pagesCount: cluster.pagesCount,
          authorityScore: cluster.authorityScore,
          gapScore: cluster.gapScore,
          keywords: cluster.keywords as unknown as Prisma.InputJsonValue,
          sampleUrls: cluster.sampleUrls as unknown as Prisma.InputJsonValue,
        },
      }),
    ),
    ...entities.map((entity) =>
      prisma.siteEntity.create({
        data: {
          tenantId: site.tenantId,
          siteId: site.id,
          name: entity.name,
          type: entity.type,
          mentions: entity.mentions,
          lastSeenAt: now,
        },
      }),
    ),
  ]);

  const existing = await prisma.siteIntelligenceProfile.findUnique({ where: { siteId: site.id } });
  const data = {
    tenantId: site.tenantId,
    siteId: site.id,
    indexedAt: now,
    sourceCount: sitemaps.length,
    pageCount: totalPages,
    detectedSiteType: profile.detectedSiteType,
    detectedLanguage: profile.detectedLanguage,
    detectedAudience: profile.detectedAudience,
    brandSummary: profile.brandSummary,
    mainTopics: profile.mainTopics as unknown as Prisma.InputJsonValue,
    excludedTopics: [] as unknown as Prisma.InputJsonValue,
    categories: profile.categories as unknown as Prisma.InputJsonValue,
    entities: profile.entities as unknown as Prisma.InputJsonValue,
    contentTypes: profile.contentTypes as unknown as Prisma.InputJsonValue,
    topicClusters: profile.topicClusters as unknown as Prisma.InputJsonValue,
    existingContentPatterns: profile.existingContentPatterns as unknown as Prisma.InputJsonValue,
    editorialTone: profile.editorialTone,
    formattingPatterns: profile.formattingPatterns as unknown as Prisma.InputJsonValue,
    commonArticleLength: profile.commonArticleLength,
    internalLinkTargets: profile.internalLinkTargets as unknown as Prisma.InputJsonValue,
    commercialTopics: profile.commercialTopics as unknown as Prisma.InputJsonValue,
    evergreenTopics: profile.evergreenTopics as unknown as Prisma.InputJsonValue,
    newsTopics: profile.newsTopics as unknown as Prisma.InputJsonValue,
    sportsTopics: profile.sportsTopics as unknown as Prisma.InputJsonValue,
    topicalAuthorityMap: profile.topicalAuthorityMap as unknown as Prisma.InputJsonValue,
    discoveredSitemaps: profile.discoveredSitemaps as unknown as Prisma.InputJsonValue,
    crawlHealth: profile.crawlHealth as unknown as Prisma.InputJsonValue,
    confidence: profile.confidence,
    warnings: profile.warnings as unknown as Prisma.InputJsonValue,
  };

  if (existing) {
    const updated = await prisma.siteIntelligenceProfile.update({
      where: { id: existing.id },
      data: { ...data, version: existing.version + 1 },
    });
    profile.version = updated.version;
  } else {
    const created = await prisma.siteIntelligenceProfile.create({ data });
    profile.version = created.version;
  }

  return profile;
}
