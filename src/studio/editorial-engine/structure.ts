// Content structure specifications per article type (Phase 4).
//
// Each article type gets a differentiated editorial template. The writer
// prompt embeds exactly one template; articles are never forced into a
// single SEO mold.

import type { ArticleType } from "./types";

export type StructureSection = {
  kind: "lead" | "context" | "detail" | "list" | "table" | "recommendations" | "update_note" | "conclusion";
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
};

export function localizedHeading(heading: string, language: "es" | "en"): string {
  return language === "es" ? (HEADINGS_ES[heading] ?? heading) : heading;
}

/**
 * Renders the template in the article language. An approved plan outline replaces
 * the template's own headings: its entries become the required H2s, in order.
 */
export function renderStructureSpec(spec: StructureSpec, language: "es" | "en" = "en", plannedOutline: string[] = []): string {
  const lines: string[] = [`Article type: ${spec.articleType}`, spec.description, "Structure:"];
  const outline = plannedOutline.map((heading) => heading.replace(/[()\n]/g, " ").trim()).filter(Boolean);
  for (const section of spec.sections) {
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
  if (language === "es") lines.push("All headings and body text must be written in Spanish.");
  lines.push(`Conclusion: ${spec.allowsConclusion ? "allowed when it adds value" : "NOT appropriate for this type — do not add one"}.`);
  lines.push(`FAQ section: ${spec.allowsFaq ? "allowed only if genuinely useful" : "NOT appropriate — do not force a FAQ onto this article"}.`);
  return lines.join("\n");
}
