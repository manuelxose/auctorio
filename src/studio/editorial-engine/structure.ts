// Content structure specifications per article type (Phase 4).
//
// Each article type gets a differentiated editorial template. The writer
// prompt embeds exactly one template; articles are never forced into a
// single SEO mold.

import type { ArticleType } from "./types";

export type StructureSection = {
  kind:
    | "lead"
    | "context"
    | "detail"
    | "list"
    | "table"
    | "recommendations"
    | "update_note"
    | "conclusion"
    | "summary"
    | "toc"
    | "faq"
    | "sources"
    | "further_reading"
    | "cta"
    | "link_card"
    | "promo"
    | "key_takeaways";
  heading: string | null; // null → no heading (lead/body)
  instruction: string;
  required: boolean;
};

export type StructureSpec = {
  articleType: ArticleType;
  description: string;
  sections: StructureSection[];
  /** Whether a conclusion is editorially appropriate for this type. */
  allowsConclusion: boolean;
  /** Whether FAQ sections should be offered (writer may still skip them). */
  allowsFaq: boolean;
};

const LEAD_INVERTED_PYRAMID: StructureSection = {
  kind: "lead",
  heading: null,
  instruction:
    "Lead paragraph answering who/what/when/where with the most important verified facts first (inverted pyramid).",
  required: true,
};

const CONTEXT: StructureSection = {
  kind: "context",
  heading: "Context",
  instruction: "Background that helps the reader understand the story, built only from the fact ledger and enrichment data.",
  required: false,
};

const ATTRIBUTION: StructureSection = {
  kind: "detail",
  heading: null,
  instruction: "Clearly attribute single-source claims to their publisher (e.g. «according to Variety»).",
  required: false,
};

const CONCLUSION: StructureSection = {
  kind: "conclusion",
  heading: null,
  instruction: "Short closing paragraph summarizing what happens next.",
  required: false,
};

// ────────────────────────────────────────────────────────────── Guide targets

/** Optional guide blocks a site (or one article) can switch off. */
export type ArticleSections = {
  summary: boolean;
  toc: boolean;
  faq: boolean;
  sources: boolean;
  jsonLd: boolean;
  /** "Recommended reads": the site's own posts. */
  furtherReading: boolean;
  cta: boolean;
  /** Site card (name, domain, headline, «Visitar») right after the intro. */
  linkCard: boolean;
  /** Brand paragraph under its own H2 before the FAQ. */
  promo: boolean;
};

export type ArticleTargets = {
  words: number;
  internalLinks: number;
  externalLinks: number;
  images: number;
  faqCount: number;
  sections: ArticleSections;
  /** From the site's writing settings: «En resumen» bullets or «Puntos clave» thesis + table. */
  summaryVariant: WritingSettings["summaryVariant"];
};

export const GUIDE_TARGETS: ArticleTargets = {
  words: 2300,
  // BLG guides carry ≥10 internal and often 25+ external links: links are primary, not decoration.
  internalLinks: 15,
  externalLinks: 20,
  images: 5,
  faqCount: 5,
  sections: { summary: true, toc: true, faq: true, sources: true, jsonLd: true, furtherReading: true, cta: true, linkCard: true, promo: true },
  summaryVariant: "tldr",
};

const TARGET_LIMITS: Record<Exclude<keyof ArticleTargets, "sections" | "summaryVariant">, [number, number]> = {
  words: [300, 6000],
  internalLinks: [0, 40],
  externalLinks: [0, 40],
  images: [0, 12],
  faqCount: [0, 12],
};

export type ArticleTargetsOverride = Partial<Omit<ArticleTargets, "sections" | "summaryVariant">> & { sections?: Partial<ArticleSections>; writing?: WritingSettings };

// ────────────────────────────────────────────────────────────── Writing settings
// "Customize future articles" (BLG parity M8): stored next to the targets in
// site_planning_settings.article_targets.writing, applied by the writer prompt.

export const LENGTH_MODES = { dynamic: null, short: 1400, medium: 2000, long: 2600 } as const;
export type LengthMode = keyof typeof LENGTH_MODES;

export type WritingSettings = {
  /** Rules every article follows ("Never use the word leverage"); ≤30, ≤300 chars each. */
  instructions: string[];
  /** dynamic = length follows intent (guide target); otherwise a fixed band. */
  length: LengthMode;
  authorPerspective: boolean;
  citations: boolean;
  mentionCompetitors: boolean;
  summaryVariant: "tldr" | "key_takeaways";
  internalLinks: { enabled: boolean; www: boolean; trailingSlash: boolean };
  /** Appended verbatim at the end of every article; ≤500 chars. */
  disclaimer: string;
};

export const DEFAULT_WRITING: WritingSettings = {
  instructions: [],
  length: "dynamic",
  authorPerspective: false,
  citations: true,
  mentionCompetitors: false,
  summaryVariant: "tldr",
  internalLinks: { enabled: true, www: false, trailingSlash: false },
  disclaimer: "",
};

const cleanText = (value: unknown, max: number) => (typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "");

/** Valid writing settings from untrusted JSON; unknown keys dropped, defaults fill the gaps. */
export function readWritingSettings(value: unknown): WritingSettings {
  const raw = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  const links = raw.internalLinks && typeof raw.internalLinks === "object" ? (raw.internalLinks as Record<string, unknown>) : {};
  const bool = (input: unknown, fallback: boolean) => (typeof input === "boolean" ? input : fallback);
  return {
    instructions: Array.isArray(raw.instructions) ? [...new Set(raw.instructions.map((rule) => cleanText(rule, 300)).filter(Boolean))].slice(0, 30) : [],
    length: typeof raw.length === "string" && raw.length in LENGTH_MODES ? (raw.length as LengthMode) : DEFAULT_WRITING.length,
    authorPerspective: bool(raw.authorPerspective, DEFAULT_WRITING.authorPerspective),
    citations: bool(raw.citations, DEFAULT_WRITING.citations),
    mentionCompetitors: bool(raw.mentionCompetitors, DEFAULT_WRITING.mentionCompetitors),
    summaryVariant: raw.summaryVariant === "key_takeaways" ? "key_takeaways" : "tldr",
    internalLinks: {
      enabled: bool(links.enabled, true),
      www: bool(links.www, false),
      trailingSlash: bool(links.trailingSlash, false),
    },
    disclaimer: cleanText(raw.disclaimer, 500),
  };
}

/** Applies the site's www / trailing-slash preference to one internal URL. */
export function formatInternalUrl(url: string, links: WritingSettings["internalLinks"]): string {
  try {
    const parsed = new URL(url);
    const bare = parsed.hostname.replace(/^www\./, "");
    parsed.hostname = links.www ? `www.${bare}` : bare;
    const isFile = /\.[a-z0-9]{2,5}$/i.test(parsed.pathname);
    if (links.trailingSlash && !isFile && !parsed.pathname.endsWith("/")) parsed.pathname += "/";
    if (!links.trailingSlash && parsed.pathname.length > 1) parsed.pathname = parsed.pathname.replace(/\/+$/, "");
    return parsed.toString();
  } catch {
    return url;
  }
}

/** Writer guidance lines for the site's writing settings (instructions, perspective, summary, disclaimer…). */
export function renderWritingGuidance(writing: WritingSettings, language: "es" | "en" = "es"): string[] {
  const lines: string[] = [];
  if (writing.instructions.length) lines.push(`Site writing rules (always follow):\n${writing.instructions.map((rule) => `- ${rule}`).join("\n")}`);
  lines.push(
    writing.authorPerspective
      ? "Write from the publication's own perspective (first person plural where natural), sharing practical experience."
      : "Use an impersonal, precise register; no first person.",
  );
  if (writing.citations) lines.push("Attribute every figure, date and claim inline to its source («según X…») and link that source.");
  lines.push(writing.mentionCompetitors ? "Competitors may be mentioned when it genuinely helps the reader." : "Do not mention or recommend competitors.");
  lines.push(
    writing.summaryVariant === "key_takeaways"
      ? `Summary block: "${language === "es" ? "Puntos clave" : "Key takeaways"}" — one thesis sentence followed by a two-column table (Point / Detail).`
      : `Summary block: "${language === "es" ? "En resumen" : "In short"}" — 3–5 self-contained bullet points.`,
  );
  if (writing.disclaimer) lines.push(`End the article with this disclaimer, verbatim, as the last paragraph: "${writing.disclaimer}"`);
  return lines;
}

/** Valid keys of an override (site `article_targets` or plan item `generation.articleTargets`); anything else is dropped. */
export function readArticleTargetsOverride(value: unknown): ArticleTargetsOverride {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const raw = value as Record<string, unknown>;
  const out: ArticleTargetsOverride = {};
  for (const [key, [min, max]] of Object.entries(TARGET_LIMITS) as Array<[keyof typeof TARGET_LIMITS, [number, number]]>) {
    const number = raw[key];
    if (typeof number === "number" && Number.isInteger(number) && number >= min && number <= max) out[key] = number;
  }
  const sections = raw.sections && typeof raw.sections === "object" && !Array.isArray(raw.sections) ? (raw.sections as Record<string, unknown>) : {};
  for (const key of Object.keys(GUIDE_TARGETS.sections) as Array<keyof ArticleSections>) {
    if (typeof sections[key] === "boolean") (out.sections ??= {})[key] = sections[key] as boolean;
  }
  if (raw.writing !== undefined && raw.writing !== null) out.writing = readWritingSettings(raw.writing);
  return out;
}

/** Guide defaults, then each override in order (site first, article last). A fixed length mode sets the word target. */
export function resolveArticleTargets(...overrides: unknown[]): ArticleTargets {
  return overrides.reduce<ArticleTargets>((acc, value) => {
    const { writing, ...override } = readArticleTargetsOverride(value);
    const fixedWords = writing ? LENGTH_MODES[writing.length] : null;
    return {
      ...acc,
      ...override,
      ...(fixedWords ? { words: fixedWords } : {}),
      ...(writing ? { summaryVariant: writing.summaryVariant } : {}),
      sections: { ...acc.sections, ...override.sections } };
  }, { ...GUIDE_TARGETS, sections: { ...GUIDE_TARGETS.sections } });
}

/** The site's writing settings from its stored article_targets (defaults when unset). */
export function resolveWritingSettings(siteArticleTargets: unknown): WritingSettings {
  return readArticleTargetsOverride(siteArticleTargets).writing ?? DEFAULT_WRITING;
}

const SECTION_SWITCH: Partial<Record<StructureSection["kind"], keyof ArticleSections>> = {
  summary: "summary",
  toc: "toc",
  faq: "faq",
  sources: "sources",
  further_reading: "furtherReading",
  cta: "cta",
  link_card: "linkCard",
  promo: "promo",
  key_takeaways: "summary",
};

export function sectionEnabled(section: StructureSection, targets: ArticleTargets | null | undefined): boolean {
  // Exactly one of the two summary variants is rendered (TL;DR by default).
  const keyTakeaways = targets?.summaryVariant === "key_takeaways";
  if ((section.kind === "summary" && keyTakeaways) || (section.kind === "key_takeaways" && !keyTakeaways)) return false;
  const key = SECTION_SWITCH[section.kind];
  return !targets || !key || targets.sections[key];
}

export const STRUCTURE_SPECS: Record<ArticleType, StructureSpec> = {
  breaking_news: {
    articleType: "breaking_news",
    description: "Short, urgent news item. Inverted pyramid, no conclusion, no fluff.",
    sections: [
      LEAD_INVERTED_PYRAMID,
      { kind: "detail", heading: "What we know", instruction: "The verified facts, in order of importance. Keep temporal language while the story is developing.", required: true },
      ATTRIBUTION,
    ],
    allowsConclusion: false,
    allowsFaq: false,
  },
  standard_news: {
    articleType: "standard_news",
    description: "Standard news article: lead, key facts, context, attribution.",
    sections: [
      LEAD_INVERTED_PYRAMID,
      { kind: "detail", heading: "Key details", instruction: "The verified facts with clear attribution where required.", required: true },
      CONTEXT,
      ATTRIBUTION,
      CONCLUSION,
    ],
    allowsConclusion: true,
    allowsFaq: false,
  },
  developing_story: {
    articleType: "developing_story",
    description: "Actively developing story. Temporal language everywhere; no definitive claims.",
    sections: [
      {
        kind: "lead",
        heading: null,
        instruction: "Lead that explains the story is developing and summarizes what is reported so far.",
        required: true,
      },
      {
        kind: "detail",
        heading: "What has been reported so far",
        instruction: "Facts with temporal language («as of», «so far», «reported»). Never present unverified updates as definitive.",
        required: true,
      },
      CONTEXT,
      CONCLUSION,
    ],
    allowsConclusion: false,
    allowsFaq: false,
  },
  movie_announcement: {
    articleType: "movie_announcement",
    description: "Announcement article: what was announced, by whom, and known details.",
    sections: [
      LEAD_INVERTED_PYRAMID,
      { kind: "detail", heading: "What we know so far", instruction: "Announced details from the ledger only: title, studio, key people, dates when confirmed.", required: true },
      CONTEXT,
      ATTRIBUTION,
      CONCLUSION,
    ],
    allowsConclusion: true,
    allowsFaq: false,
  },
  casting_news: {
    articleType: "casting_news",
    description: "Casting update: who joins, in which role, with production context.",
    sections: [
      LEAD_INVERTED_PYRAMID,
      { kind: "list", heading: "Confirmed cast", instruction: "List cast members confirmed in the ledger with their roles where known.", required: false },
      CONTEXT,
      ATTRIBUTION,
    ],
    allowsConclusion: true,
    allowsFaq: false,
  },
  release_date_news: {
    articleType: "release_date_news",
    description: "Release-date news: the date, the work, and the verified source of the date.",
    sections: [
      LEAD_INVERTED_PYRAMID,
      { kind: "detail", heading: "The confirmed date", instruction: "State the date exactly as the ledger records it, with its source. Never invent other dates.", required: true },
      CONTEXT,
      ATTRIBUTION,
    ],
    allowsConclusion: true,
    allowsFaq: false,
  },
  trailer_news: {
    articleType: "trailer_news",
    description: "Trailer news: what the trailer shows (from the ledger only), where it is available.",
    sections: [
      LEAD_INVERTED_PYRAMID,
      { kind: "detail", heading: "What the trailer shows", instruction: "Describe only what the ledger says the trailer contains. Do not invent scenes.", required: true },
      CONTEXT,
      ATTRIBUTION,
    ],
    allowsConclusion: true,
    allowsFaq: false,
  },
  streaming_availability: {
    articleType: "streaming_availability",
    description: "Streaming availability: platform and availability facts, validated only.",
    sections: [
      LEAD_INVERTED_PYRAMID,
      { kind: "detail", heading: "Where to stream", instruction: "Only platforms validated in the enrichment/ledger. Never guess providers or windows.", required: true },
      { kind: "detail", heading: "Availability", instruction: "Release/availability dates only when verified; otherwise say they are unconfirmed.", required: false },
      CONTEXT,
    ],
    allowsConclusion: false,
    allowsFaq: true,
  },
  tv_programming: {
    articleType: "tv_programming",
    description: "TV programming story: schedule, channel, season, airing facts.",
    sections: [
      LEAD_INVERTED_PYRAMID,
      { kind: "detail", heading: "Programming details", instruction: "Channel, dates and scheduling facts exactly as verified in the ledger.", required: true },
      CONTEXT,
      ATTRIBUTION,
    ],
    allowsConclusion: true,
    allowsFaq: false,
  },
  review_info: {
    articleType: "review_info",
    description: "Review-style informational article grounded in enrichment metadata.",
    sections: [
      { kind: "lead", heading: null, instruction: "Introduce the work and why the reader cares, from ledger facts only.", required: true },
      { kind: "detail", heading: "What it's about", instruction: "Synopsis strictly from enrichment overview data.", required: true },
      { kind: "list", heading: "Key facts", instruction: "Cast, crew, release year — only from enrichment/ledger.", required: false },
      CONTEXT,
      CONCLUSION,
    ],
    allowsConclusion: true,
    allowsFaq: true,
  },
  evergreen_explainer: {
    articleType: "evergreen_explainer",
    description: "Evergreen explainer: durable information about a work or topic.",
    sections: [
      { kind: "lead", heading: null, instruction: "Introduce the topic and what the reader will learn.", required: true },
      { kind: "detail", heading: "What you need to know", instruction: "Core verified facts in logical H2/H3 sections.", required: true },
      { kind: "list", heading: "Key facts", instruction: "Bullet list of verified facts where useful.", required: false },
      CONTEXT,
      CONCLUSION,
    ],
    allowsConclusion: true,
    allowsFaq: true,
  },
  guide: {
    articleType: "guide",
    description:
      "Keyword-first search guide (BLG anatomy), in this fixed order: answer-first intro → link card → summary → TOC → body of sub-query H2s → brand promo H2 → FAQ → Sources → Recommended reading → disclaimer. No «Conclusión» H2.",
    sections: [
      {
        kind: "lead",
        heading: null,
        instruction:
          "Answer-first intro, exactly 2 paragraphs (no heading): P1 answers the search query in its first sentence with the primary keyword and presents the target site with its value proposition; P2 announces the scope («Este artículo expone qué…, cómo… y dónde…»).",
        required: true,
      },
      {
        kind: "link_card",
        heading: null,
        instruction:
          "Right after the intro: <aside data-block=\"link_card\"><p><strong>(site name)</strong> · (site domain)</p><p><strong>(short headline of what the site lets the reader do)</strong></p><p>(one sentence)</p><p><a href=\"(site home URL)\">Visitar</a></p></aside> («Visit» in English).",
        required: true,
      },
      {
        kind: "summary",
        heading: null,
        instruction: "After the link card: <aside data-block=\"summary\"><p><strong>En resumen</strong></p><ul> with 3–5 <li>, each a self-contained fact</ul></aside> (use «In short» in English).",
        required: true,
      },
      {
        kind: "key_takeaways",
        heading: null,
        instruction:
          "After the link card: <aside data-block=\"summary\"><p><strong>Puntos clave</strong></p><p>(one thesis sentence)</p><table><thead><tr><th>Punto</th><th>Detalle</th></tr></thead><tbody>(3–5 rows)</tbody></table></aside> («Key takeaways», «Point / Detail» in English).",
        required: true,
      },
      { kind: "toc", heading: null, instruction: "Do NOT write a table of contents: it is generated from your H2s.", required: false },
      {
        kind: "detail",
        heading: null,
        instruction:
          "Body: 8–12 H2s phrased as sub-queries of the primary keyword («Qué…», «Cómo…», «Dónde…», «Cuánto…»), split into H3s where useful; for a list/ranking keyword, one H2 per entry. Use <ol> for steps and <ul> for lists. Give concrete dates and figures from the fact ledger, each attributed inline to its publisher with a link to its source URL («según X, en mayo de 2026…»).",
        required: true,
      },
      { kind: "table", heading: null, instruction: "At least one <table> with <thead> wherever options or criteria are compared (options as rows, criteria as columns).", required: true },
      {
        kind: "promo",
        heading: null,
        instruction:
          "Right before the FAQ, an H2 of its own named after what the site offers for this need (not «Conclusión»): one paragraph on how the site helps, with 2 links to its most relevant internal URLs from the brief.",
        required: true,
      },
      { kind: "faq", heading: "Frequently asked questions", instruction: "H2 followed by one H3 per question (the question itself) and a self-contained 2–4 sentence answer.", required: true },
      { kind: "sources", heading: "Sources", instruction: "Bulleted list «Título, Editor», each linked to its URL (only URLs from the fact ledger).", required: true },
      { kind: "further_reading", heading: "Recommended reading", instruction: "Bulleted list of the site's own posts from the brief's internal links, with descriptive anchors.", required: true },
    ],
    allowsConclusion: false,
    allowsFaq: true,
  },
  list_ranking: {
    articleType: "list_ranking",
    description: "List/ranking article: one H2 per entry, each grounded in facts.",
    sections: [
      { kind: "lead", heading: null, instruction: "Explain the selection criteria and that it is grounded in the verified ledger.", required: true },
      { kind: "list", heading: null, instruction: "One H2 section per entry with short paragraphs; every entry's facts must come from the ledger/enrichment.", required: true },
      CONTEXT,
    ],
    allowsConclusion: true,
    allowsFaq: false,
  },
  what_to_watch: {
    articleType: "what_to_watch",
    description: "What-to-watch recommendation article grounded in validated data.",
    sections: [
      { kind: "lead", heading: null, instruction: "Introduce the recommendations and their grounding.", required: true },
      { kind: "recommendations", heading: null, instruction: "Recommend only works with validated enrichment data; include where to watch when known.", required: true },
      CONTEXT,
    ],
    allowsConclusion: true,
    allowsFaq: true,
  },
  article_update: {
    articleType: "article_update",
    description: "Update to an existing article: the delta, clearly marked.",
    sections: [
      {
        kind: "update_note",
        heading: null,
        instruction: "Open with a short update note (what changed and when).",
        required: true,
      },
      { kind: "detail", heading: "Updated information", instruction: "Present the new verified facts; preserve previously verified context.", required: true },
      ATTRIBUTION,
    ],
    allowsConclusion: false,
    allowsFaq: false,
  },
};

export function getStructureSpec(articleType: ArticleType): StructureSpec {
  return STRUCTURE_SPECS[articleType];
}

/** Spanish wording of the template headings: the writer copies headings literally, so English ones leaked into Spanish articles. */
const HEADINGS_ES: Record<string, string> = {
  Context: "Contexto",
  "What we know": "Lo que sabemos",
  "Key details": "Claves",
  "What has been reported so far": "Lo que se sabe hasta ahora",
  "What we know so far": "Lo que sabemos hasta ahora",
  "Confirmed cast": "Reparto confirmado",
  "The confirmed date": "La fecha confirmada",
  "What the trailer shows": "Qué muestra el tráiler",
  "Where to stream": "Dónde verlo",
  Availability: "Disponibilidad",
  "Programming details": "Detalles de la programación",
  "What it's about": "De qué trata",
  "Key facts": "Datos clave",
  "What you need to know": "Lo que necesitas saber",
  "Updated information": "Información actualizada",
  "How to choose": "Cómo elegir",
  "Frequently asked questions": "Preguntas frecuentes",
  Sources: "Fuentes",
  "Recommended reading": "Lecturas recomendadas",
};

export function localizedHeading(heading: string, language: "es" | "en"): string {
  return language === "es" ? (HEADINGS_ES[heading] ?? heading) : heading;
}

/**
 * Renders the template in the article language. An approved plan outline replaces
 * the template's own headings: its entries become the required H2s, in order.
 */
export function renderStructureSpec(spec: StructureSpec, language: "es" | "en" = "en", plannedOutline: string[] = [], targets?: ArticleTargets): string {
  const lines: string[] = [`Article type: ${spec.articleType}`, spec.description, "Structure:"];
  const outline = plannedOutline.map((heading) => heading.replace(/[()\n]/g, " ").trim()).filter(Boolean);
  for (const section of spec.sections.filter((entry) => sectionEnabled(entry, targets))) {
    if (outline.length > 0 && section.heading) {
      lines.push(`- ${section.kind} [guidance]: ${section.instruction} Place this material under the approved H2 sections below.`);
      continue;
    }
    const heading = section.heading ? ` (heading: ${localizedHeading(section.heading, language)})` : "";
    const required = section.required ? " [required]" : " [optional]";
    lines.push(`- ${section.kind}${heading}${required}: ${section.instruction}`);
  }
  if (outline.length > 0) {
    lines.push("Approved outline — use each entry below as an H2, with this exact wording and in this order:");
    for (const heading of outline) lines.push(`- outline (heading: ${heading}) [required]: cover this section with verified facts only.`);
  }
  if (targets) {
    lines.push(
      `Targets: about ${targets.words} words; ${targets.sections.faq ? `${targets.faqCount} FAQ questions; ` : ""}every image needs a descriptive alt.`,
      `Links are mandatory, not optional: AT LEAST ${targets.internalLinks} internal links spread through the body with descriptive anchors (only brief URLs; fewer only if the brief has fewer), and AT LEAST ${targets.externalLinks} external links to distinct sources from the fact ledger (inline attributions plus the Sources list; fewer only if the ledger has fewer).`,
    );
  }
  if (language === "es") lines.push("All headings and body text must be written in Spanish.");
  lines.push(`Conclusion: ${spec.allowsConclusion ? "allowed when it adds value" : "NOT appropriate for this type — do not add one"}.`);
  const faqOff = targets ? !targets.sections.faq : false;
  lines.push(`FAQ section: ${faqOff ? "switched off for this site — do not add one" : spec.allowsFaq ? "allowed only if genuinely useful" : "NOT appropriate — do not force a FAQ onto this article"}.`);
  return lines.join("\n");
}
