import type { EditorialPlanBriefV2, SearchIntent } from "./editorial-plan-schema";
import type { SiteIntelligenceProfileSummary } from "./site-intelligence/profile";

export type RelevanceVerdict = {
  score: number;
  reasons: string[];
  rejected: boolean;
};

export type CannibalizationVerdict = {
  risk: "none" | "related-cluster" | "update-existing" | "merge-candidate" | "high";
  reasons: string[];
  conflictingUrls: string[];
};

export const DEFAULT_RELEVANCE_THRESHOLD = 45;

/** Minimal profile derived from site type when no crawl data exists yet. */
export function syntheticProfileForSiteType(
  siteType: string,
): Pick<SiteIntelligenceProfileSummary, "mainTopics" | "categories" | "commercialTopics" | "evergreenTopics" | "newsTopics" | "sportsTopics" | "topicClusters" | "contentTypes" | "detectedSiteType"> {
  if (siteType === "guiatv") {
    return {
      detectedSiteType: "tv-programming-guide",
      mainTopics: ["television", "programacion", "series", "peliculas", "streaming", "plataformas", "futbol", "canales", "horarios"],
      categories: ["tv", "streaming", "futbol"],
      commercialTopics: ["precio", "comparativa", "mejores plataformas"],
      evergreenTopics: ["guia", "como funciona"],
      newsTopics: ["estrenos", "hoy"],
      sportsTopics: ["champions", "laliga", "futbol"],
      topicClusters: [],
      contentTypes: [
        { type: "where-to-watch", count: 0 },
        { type: "schedule", count: 0 },
        { type: "ranking", count: 0 },
        { type: "sports", count: 0 },
        { type: "streaming", count: 0 },
        { type: "comparison", count: 0 },
        { type: "news", count: 0 },
        { type: "movies", count: 0 },
        { type: "series", count: 0 },
        { type: "channels", count: 0 },
        { type: "article", count: 0 },
      ],
    };
  }
  return {
    detectedSiteType: siteType,
    mainTopics: [],
    categories: [],
    commercialTopics: [],
    evergreenTopics: [],
    newsTopics: [],
    sportsTopics: [],
    topicClusters: [],
    contentTypes: [],
  };
}

/** Explicitly off-topic domains used as guardrail seeds (extensible). */
const OFF_TOPIC_TERMS = [
  "soldadura",
  "welding",
  "implantes dentales",
  "dental implants",
  "nómina",
  "payroll",
  "software b2b",
  "b2b payroll",
  "criptomoneda",
  "criptomonedas",
  "cryptocurrency",
  "bitcoin trading",
  "hipotecas",
  "mortgage",
  "seguros de vida",
  "life insurance",
  "préstamos",
  "payday loans",
  "aseguradoras",
  "contabilidad fiscal",
  "tax accounting",
  "maquinaria industrial",
  "industrial machinery",
  "clínica veterinaria",
  "veterinary clinic",
  "energía solar doméstica",
  "residential solar",
  "abogados de divorcio",
  "divorce lawyers",
];

const PLATFORM_TERMS = [
  "netflix",
  "hbo",
  "max",
  "disney",
  "prime video",
  "amazon prime",
  "movistar",
  "skyshowtime",
  "apple tv",
  "filmin",
  "atresplayer",
  "mitele",
  "pluto tv",
  "rakuten",
  "dazn",
  "youtube",
  "twitch",
  "rtve",
];

const TV_TERMS = [
  "tv",
  "television",
  "televisión",
  "programacion",
  "programación",
  "parrilla",
  "horario",
  "canal",
  "canales",
  "series",
  "serie",
  "pelicula",
  "película",
  "peliculas",
  "películas",
  "cine",
  "estreno",
  "estrenos",
  "capitulo",
  "capítulo",
  "temporada",
  "streaming",
  "plataforma",
  "plataformas",
  "reality",
  "concurso",
  "concursos",
  "futbol",
  "fútbol",
  "deportes",
  "champions",
  "laliga",
  "premier",
  "ver",
  "donde ver",
  "dónde ver",
  "donde-ver",
];

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function tokenize(value: string): string[] {
  return normalize(value)
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 2);
}

function termHitScore(blob: string, terms: string[]): number {
  const lowered = normalize(blob);
  let hits = 0;
  for (const term of terms) {
    if (lowered.includes(normalize(term))) {
      hits += 1;
    }
  }
  return hits;
}

function topicSimilarity(titleTokens: string[], topicTokens: string[]): number {
  if (topicTokens.length === 0) {
    return 0;
  }
  const hits = titleTokens.filter((token) => token.length > 3 && topicTokens.some((topic) => topic.startsWith(token) || token.startsWith(topic))).length;
  return hits / Math.max(1, titleTokens.length);
}

/**
 * Deterministic site-relevance scoring. Scores 0-100; items below the
 * threshold are rejected or flagged. Absurd off-topic candidates are
 * hard-rejected by the negative lexicon.
 */
export function computeSiteRelevanceScore(
  brief: Pick<EditorialPlanBriefV2, "topic" | "topicCluster" | "contentType" | "primaryIntent" | "targetQuery" | "primaryKeyword">,
  profile: Pick<
    SiteIntelligenceProfileSummary,
    "mainTopics" | "categories" | "commercialTopics" | "evergreenTopics" | "newsTopics" | "sportsTopics" | "topicClusters" | "contentTypes" | "detectedSiteType"
  >,
  title: string,
  options: { allowedContentFormats?: string[] } = {},
): RelevanceVerdict {
  const reasons: string[] = [];
  let score = 0;

  const blob = `${title} ${brief.topic ?? ""} ${brief.primaryKeyword ?? ""} ${brief.targetQuery ?? ""}`;
  const normalizedBlob = normalize(blob);

  // ── Hard guardrail: explicit off-topic domain
  const offTopicHits = OFF_TOPIC_TERMS.filter((term) => normalizedBlob.includes(normalize(term)));
  if (offTopicHits.length > 0) {
    reasons.push(`off-topic guardrail: ${offTopicHits.slice(0, 3).join(", ")}`);
    return { score: 0, reasons, rejected: true };
  }

  const titleTokens = tokenize(`${title} ${brief.topic ?? ""}`);
  const profileTopicTokens = [
    ...profile.mainTopics,
    ...profile.commercialTopics,
    ...profile.evergreenTopics,
    ...profile.newsTopics,
    ...profile.sportsTopics,
    ...profile.categories,
  ].flatMap((topic) => tokenize(topic));

  // Early-crawl profiles are sparse (few pages indexed). Blend the site-type
  // lexicon as supplementary vocabulary so legitimate domain items are not
  // under-credited while evidence accumulates. Off-topic terms still reject.
  if (profileTopicTokens.length < 10) {
    const synthetic = syntheticProfileForSiteType(profile.detectedSiteType ?? "");
    profileTopicTokens.push(
      ...[
        ...synthetic.mainTopics,
        ...synthetic.sportsTopics,
        ...synthetic.commercialTopics,
        ...synthetic.evergreenTopics,
        ...synthetic.newsTopics,
      ].flatMap((topic) => tokenize(topic)),
    );
  }

  // ── Topic overlap with site profile (0-35)
  const similarity = topicSimilarity(titleTokens, profileTopicTokens);
  const topicPoints = Math.round(similarity * 35);
  score += topicPoints;
  reasons.push(`topic overlap with site profile: +${topicPoints}`);

  // ── Domain affinity: TV/streaming lexicon for guiatv-like sites (0-15)
  if (profile.detectedSiteType === "tv-programming-guide" || profile.mainTopics.some((topic) => normalize(topic).includes("televi") || normalize(topic).includes("streaming"))) {
    const tvHits = termHitScore(blob, TV_TERMS);
    const tvPoints = Math.min(15, tvHits * 3);
    score += tvPoints;
    if (tvPoints > 0) {
      reasons.push(`tv-domain affinity: +${tvPoints}`);
    }
  }

  // ── Sports affinity: competition/event overlap with site sports topics (0-10)
  if (profile.sportsTopics.length > 0) {
    const sportsHits = termHitScore(blob, profile.sportsTopics);
    const sportsPoints = Math.min(10, sportsHits * 5);
    score += sportsPoints;
    if (sportsPoints > 0) {
      reasons.push(`sports affinity: +${sportsPoints}`);
    }
  }

  // ── Cluster relevance (0-15)
  const topicCluster = brief.topicCluster;
  if (topicCluster) {
    const cluster = profile.topicClusters.find((entry) => entry.slug === normalize(topicCluster).replace(/[^a-z0-9]+/g, "-") || entry.name === topicCluster);
    if (cluster) {
      score += 15;
      reasons.push(`known topic cluster "${cluster.name}": +15`);
    } else {
      reasons.push(`unknown topic cluster "${topicCluster}"`);
    }
  }

  // ── Content type fit (0-10). Formats explicitly requested by the
  // editorial strategy are always acceptable, even if the crawl has not
  // observed them yet.
  const formatAllowed = brief.contentType ? (options.allowedContentFormats ?? []).includes(brief.contentType) : false;
  if (brief.contentType && (profile.contentTypes.some((entry) => entry.type === brief.contentType) || formatAllowed)) {
    score += 10;
    reasons.push(formatAllowed ? `content type "${brief.contentType}" requested by strategy: +10` : `content type "${brief.contentType}" present on site: +10`);
  } else if (brief.contentType) {
    reasons.push(`content type "${brief.contentType}" not yet observed on site`);
  }

  // ── Intent fit (0-10)
  if (brief.primaryIntent) {
    const intentFit = intentFitsProfile(brief.primaryIntent, profile);
    const intentPoints = intentFit ? 10 : 0;
    score += intentPoints;
    reasons.push(intentFit ? `intent "${brief.primaryIntent}" matches site signals: +10` : `intent "${brief.primaryIntent}" has no matching site signal`);
  }

  // ── Query fit (0-15)
  if (brief.targetQuery) {
    const queryTokens = tokenize(brief.targetQuery);
    const overlap = topicSimilarity(queryTokens, profileTopicTokens);
    const queryPoints = Math.round(overlap * 15);
    score += queryPoints;
    reasons.push(`target query overlap: +${queryPoints}`);
  }

  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  const rejected = clamped < DEFAULT_RELEVANCE_THRESHOLD;
  if (rejected) {
    reasons.push(`below relevance threshold (${clamped} < ${DEFAULT_RELEVANCE_THRESHOLD})`);
  }
  return { score: clamped, reasons, rejected };
}

function intentFitsProfile(intent: SearchIntent, profile: Pick<SiteIntelligenceProfileSummary, "commercialTopics" | "evergreenTopics" | "newsTopics" | "sportsTopics">): boolean {
  switch (intent) {
    case "commercial-investigation":
    case "transactional":
    case "comparison":
      return profile.commercialTopics.length > 0;
    case "news":
      return profile.newsTopics.length > 0;
    case "sports-live":
      return profile.sportsTopics.length > 0;
    case "where-to-watch":
      return profile.commercialTopics.length > 0 || profile.sportsTopics.length > 0;
    case "informational":
    case "navigational":
    case "entertainment-discovery":
      return profile.evergreenTopics.length > 0 || profile.newsTopics.length > 0 || profile.sportsTopics.length > 0;
    default:
      return true;
  }
}

export function knownPlatformFromText(value: string): string | null {
  const lowered = normalize(value);
  for (const platform of PLATFORM_TERMS) {
    if (lowered.includes(normalize(platform))) {
      return platform;
    }
  }
  return null;
}

/**
 * Deterministic cannibalization classification against already-targeted
 * queries, existing indexed URLs and planned titles.
 */
export function classifyCannibalization(
  brief: Pick<EditorialPlanBriefV2, "targetQuery" | "primaryKeyword" | "suggestedSlug">,
  title: string,
  existing: {
    queries: string[];
    keywords: string[];
    indexedUrls: string[];
    plannedTitles: string[];
  },
): CannibalizationVerdict {
  const reasons: string[] = [];
  const conflictingUrls: string[] = [];

  const query = normalize(brief.targetQuery ?? "");
  const keyword = normalize(brief.primaryKeyword ?? "");
  const normalizedTitle = normalize(title);

  if (query && existing.queries.includes(query)) {
    reasons.push(`query "${query}" already targeted`);
    return { risk: "high", reasons, conflictingUrls };
  }
  if (keyword && existing.keywords.includes(keyword)) {
    reasons.push(`keyword "${keyword}" already targeted`);
    return { risk: "high", reasons, conflictingUrls };
  }

  const keywordTokens = tokenize(keyword).filter((token) => token.length > 3);
  const queryFirstToken = (query.split(" ")[0] ?? "");
  const urlMatches = existing.indexedUrls.filter((url) => {
    const normalized = normalize(url);
    return keywordTokens.some((token) => normalized.includes(token)) || (query && normalized.includes(queryFirstToken));
  });
  if (urlMatches.length > 0) {
    conflictingUrls.push(...urlMatches.slice(0, 5));
    const strong = urlMatches.some((url) => {
      const slug = url.split("/").filter(Boolean).slice(-1)[0] ?? "";
      return keywordTokens.length > 0 && keywordTokens.every((token) => slug.includes(token));
    });
    if (strong) {
      reasons.push("existing indexed URL already covers this query");
      return { risk: "update-existing", reasons, conflictingUrls };
    }
  }

  const titleSimilar = existing.plannedTitles.some((planned) => {
    const a = new Set(tokenize(normalizedTitle));
    const b = tokenize(planned);
    const intersection = b.filter((token) => a.has(token)).length;
    return intersection / Math.max(1, b.length) > 0.7;
  });
  if (titleSimilar) {
    reasons.push("highly similar title already planned");
    return { risk: "merge-candidate", reasons, conflictingUrls };
  }

  if (urlMatches.length > 0) {
    reasons.push("related indexed content exists in the same cluster");
    return { risk: "related-cluster", reasons, conflictingUrls };
  }

  return { risk: "none", reasons, conflictingUrls };
}
