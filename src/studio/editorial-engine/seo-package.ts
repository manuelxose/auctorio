// SEO package (Phase 4). Deterministic SEO artifacts derived from the
// parsed article and the brief. The engine never manufactures search
// volume and never stuffs keywords.

import type {
  EditorialBrief,
  EngineInternalLink,
  ParsedArticle,
  SeoPackage,
} from "./types";

export function slugify(value: string, maxLength = 90): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLength)
    .replace(/-+$/g, "");
}

export function stripHtml(value: string): string {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export function wordCount(value: string): number {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

function truncateWords(value: string, maxWords: number): string {
  const words = value.split(/\s+/).filter(Boolean);
  return words.length <= maxWords ? value : `${words.slice(0, maxWords).join(" ")}…`;
}

function normalizeForMatch(value: string): string {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function countOccurrences(haystack: string, needle: string): number {
  if (!needle.trim()) {
    return 0;
  }
  const normalized = normalizeForMatch(haystack);
  const target = normalizeForMatch(needle);
  if (target.length < 3) {
    return 0;
  }
  let count = 0;
  let index = normalized.indexOf(target);
  while (index !== -1) {
    count += 1;
    index = normalized.indexOf(target, index + target.length);
  }
  return count;
}

export type SeoInput = {
  brief: EditorialBrief;
  article: ParsedArticle;
  internalLinks: EngineInternalLink[];
  factSourceUrls: Array<{ url: string | null; publisher: string | null }>;
};

function buildSeoTitle(article: ParsedArticle, brief: EditorialBrief): string {
  const provided = article.seoTitle?.trim() ?? "";
  if (provided.length >= 35 && provided.length <= 70) {
    return provided;
  }
  const base = (article.h1 || article.title || brief.primaryKeyword).trim();
  const suffix = brief.targetSite.name ? ` | ${brief.targetSite.name}` : "";
  const candidate = `${base}${suffix}`;
  return truncateWords(candidate, 14).slice(0, 70);
}

function buildMetaDescription(article: ParsedArticle, brief: EditorialBrief): string {
  const provided = article.seoDescription?.trim() ?? "";
  if (provided.length >= 110 && provided.length <= 165) {
    return provided;
  }
  const base = provided || article.excerpt || `${brief.primaryKeyword}: ${brief.storyAngle}.`;
  const padded = truncateWords(base, 28).slice(0, 160);
  return padded.length >= 110 ? padded : `${padded} Toda la información verificada.`.slice(0, 165);
}

function structuredDataFor(articleType: string, searchIntent: string): string {
  switch (articleType) {
    case "review_info":
      return "Review (only if a validated rating exists in enrichment data; otherwise Article)";
    case "list_ranking":
    case "what_to_watch":
      return searchIntent === "commercial_investigation" ? "ItemList (+ NewsArticle/Article)" : "Article";
    case "breaking_news":
    case "standard_news":
    case "developing_story":
    case "movie_announcement":
    case "casting_news":
    case "release_date_news":
    case "trailer_news":
    case "streaming_availability":
    case "tv_programming":
    case "article_update":
      return "NewsArticle (+ BreadcrumbList)";
    default:
      return "Article (+ BreadcrumbList)";
  }
}

export function buildSeoPackage(input: SeoInput): SeoPackage {
  const { brief, article } = input;
  const bodyText = stripHtml(article.bodyHtml);
  const words = wordCount(bodyText);
  const primaryKeyword = brief.primaryKeyword || "";
  const primaryOccurrences = countOccurrences(bodyText, primaryKeyword);
  const densityPercent = words > 0 ? Math.round((primaryOccurrences / words) * 1000) / 10 : 0;
  const stuffingRisk = words > 0 && densityPercent > 2.5;

  const h1 = (article.h1 || article.title).trim();
  const seoTitle = buildSeoTitle(article, brief);
  const metaDescription = buildMetaDescription(article, brief);
  const slug = slugify(article.title || h1 || primaryKeyword || "articulo");

  const entityCoverage = brief.entities.map((entity) => {
    const occurrences = countOccurrences(bodyText, entity.name);
    return { name: entity.name, type: entity.type, occurrences, covered: occurrences > 0 };
  });

  const usedInternalUrls = new Set(
    [...bodyText.matchAll(/href=["']([^"']+)["']/g)].map((match) => match[1]),
  );
  const internalLinks = input.internalLinks
    .map((link) => ({ ...link, used: usedInternalUrls.has(link.url) }))
    .sort((left, right) => Number(right.used) - Number(left.used) || right.score - left.score)
    .slice(0, 6)
    .map(({ used: _used, ...link }) => link);

  const externalSeen = new Set<string>();
  const externalAttributionLinks = input.factSourceUrls
    .filter((entry) => entry.url && /^https?:\/\//i.test(entry.url))
    .filter((entry) => {
      const url = entry.url as string;
      if (externalSeen.has(url)) {
        return false;
      }
      externalSeen.add(url);
      return true;
    })
    .slice(0, 6)
    .map((entry) => ({ url: entry.url as string, publisher: entry.publisher }));

  const openGraphTitle = truncateWords(seoTitle, 12);
  const socialTitle = `${brief.targetSite.name ? `${brief.targetSite.name}: ` : ""}${truncateWords(article.title || h1, 9)}`.slice(0, 80);

  return {
    seoTitle,
    h1,
    slug,
    metaDescription,
    excerpt: truncateWords(article.excerpt || bodyText, 40),
    primaryKeyword,
    secondaryKeywords: brief.secondaryKeywords,
    entityCoverage,
    internalLinks,
    externalAttributionLinks,
    openGraph: {
      title: openGraphTitle,
      description: truncateWords(metaDescription, 24),
    },
    socialTitle,
    structuredDataRecommendation: structuredDataFor(brief.articleType, brief.searchIntent),
    keywordDensity: {
      keyword: primaryKeyword,
      occurrences: primaryOccurrences,
      densityPercent,
      stuffingRisk,
    },
    searchVolumeDisclaimer: "Search volume is never estimated or claimed by the engine.",
  };
}
