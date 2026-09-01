// Writer prompt assembly + output parsing (Phase 4).
//
// The prompt is assembled from the editorial brief, the fact licenses and
// the structure template. Originality is enforced in the system prompt:
// the writer must synthesize — it must not preserve source sentence
// structures, paragraph order, distinctive phrasing or the source outline.

import type { FactLicense } from "./types";
import { renderBriefForWriter } from "./brief-builder";
import { renderStructureSpec, getStructureSpec } from "./structure";
import { clampUntrustedContent, SOURCE_DATA_RULES, wrapUntrustedContent } from "../prompt-injection";
import type { EditorialBrief, ParsedArticle, SiteValueBlock } from "./types";

export type WriterPromptInput = {
  brief: EditorialBrief;
  licenses: FactLicense[];
  siteValueBlocks: SiteValueBlock[];
  /** Previous article body for update runs. */
  previousArticle?: { title: string; bodyHtml: string } | null;
  updateDelta?: { newFacts: string[]; changedFacts: Array<{ factKey: string; before: string; after: string }> } | null;
  language: "es" | "en";
};

export type WriterPrompt = {
  systemPrompt: string;
  userPrompt: string;
};

const ORIGINALITY_RULES_EN = [
  "You are an original editorial writer. You SYNTHESIZE evidence — you never translate, paraphrase or lightly rewrite a source article.",
  "Never preserve from any source: sentence structures, paragraph order, distinctive phrasing, or the article outline.",
  "Write every sentence in your own words. Two independent sentences may not match any source sentence word-for-word.",
  "Do not quote sources unless the editorial brief explicitly requires attribution.",
  "When attribution is required, attribute clearly («according to Variety», with the source name) instead of quoting.",
  "Never copy promotional copy, plot summaries, or critic text verbatim. Summaries must be your own synthesis.",
  "Never add facts that are not in the fact ledger. If the ledger does not say it, do not write it.",
  "Write in the target language of the site. Match the brand voice implied by the brief.",
].join("\n");

const ORIGINALITY_RULES_ES = [
  "Eres un redactor editorial original. SINTETIZAS la evidencia — nunca traduces, parafraseas ni reescribes ligeramente un artículo fuente.",
  "No conserves de ninguna fuente: estructuras de frases, orden de párrafos, frases distintivas ni el esquema del artículo.",
  "Escribe cada frase con tus propias palabras. Ninguna frase debe coincidir palabra por palabra con una frase fuente.",
  "No cites fuentes salvo que el brief editorial lo exija explícitamente.",
  "Cuando se requiera atribución, atribuye con claridad («según Variety», con el nombre de la fuente) en lugar de citar.",
  "Nunca copies texto promocional, sinopsis o críticas literalmente. Las sinopsis deben ser tu propia síntesis.",
  "No añadas hechos que no estén en el libro mayor de hechos (fact ledger). Si el ledger no lo dice, no lo escribas.",
  "Escribe en el idioma objetivo del sitio y respeta la voz de marca.",
].join("\n");

function renderFactLedgerBlock(licenses: FactLicense[]): string[] {
  const lines = ["FACT LEDGER (the only facts you may use):"];
  if (licenses.length === 0) {
    lines.push("- (empty ledger — you must not state any specific facts)");
    return lines;
  }
  for (const license of licenses) {
    const sources = license.sources.map((source) => `${source.publisher ?? "unknown"}${source.url ? ` <${source.url}>` : ""}`).join(", ");
    lines.push(
      `- [${license.factKey}] "${license.statement}" — usage: ${license.usage} — ${license.phrasingHint} — sources: ${sources} — alternatives: ${license.alternatives.join(" | ") || "(none)"}`,
    );
  }
  return lines;
}

function renderSiteValueBlock(siteValueBlocks: SiteValueBlock[]): string[] {
  if (siteValueBlocks.length === 0) {
    return ["SITE VALUE (none available for this story)"];
  }
  const lines = ["SITE VALUE (validated data only — include where editorially useful):"];
  for (const block of siteValueBlocks) {
    lines.push(`- ${block.title}: ${block.lines.join("; ")}`);
  }
  return lines;
}

export const WRITER_OUTPUT_FORMAT = [
  "Respond with STRICT JSON only — no markdown fences, no commentary:",
  `{
  "title": "article title",
  "h1": "H1 heading (may equal the title)",
  "excerpt": "short excerpt, 20-40 words",
  "bodyHtml": "<h2>…</h2><p>…</p> (clean HTML, only h2/h3/p/ul/ol/li/strong/a tags)",
  "seoTitle": "SEO title, 35-70 characters",
  "seoDescription": "meta description, 110-165 characters",
  "claims": [
    { "text": "sentence that states the fact", "factKey": "matching ledger key or null", "attributionRequired": false }
  ]
}`,
].join("\n");

export function buildWriterPrompt(input: WriterPromptInput): WriterPrompt {
  const { brief, licenses } = input;
  const language = input.language === "en" ? "en" : "es";
  const systemLines = [
    language === "es" ? ORIGINALITY_RULES_ES : ORIGINALITY_RULES_EN,
    "",
    SOURCE_DATA_RULES,
    "",
    `Search intent: ${brief.searchIntent}. SEO decisions must follow this intent.`,
    `Primary keyword: «${brief.primaryKeyword}». Use it naturally in the H1/lead — never keyword-stuff.`,
    "Length guidance is a target, not a quota.",
    "Use short readable paragraphs. Bold sparingly when useful. Use lists/tables only where genuinely useful.",
    "Internal links: only use URLs provided in the brief — never invent URLs.",
    "Conclusion and FAQ only where the structure template allows them.",
  ].join("\n");

  const userLines: string[] = [];
  userLines.push("EDITORIAL BRIEF:");
  userLines.push(renderBriefForWriter(brief));
  userLines.push("");
  userLines.push(wrapUntrustedContent("fact-ledger", renderFactLedgerBlock(licenses).join("\n")));
  userLines.push("");
  userLines.push(wrapUntrustedContent("site-value", renderSiteValueBlock(input.siteValueBlocks).join("\n")));
  userLines.push("");
  userLines.push("STRUCTURE TEMPLATE:");
  userLines.push(renderStructureSpec(getStructureSpec(brief.articleType)));
  userLines.push("");

  if (input.previousArticle) {
    userLines.push(`PREVIOUS ARTICLE «${input.previousArticle.title}» (update it — keep its URL identity and add the new facts):`);
    userLines.push(wrapUntrustedContent("previous-article", clampUntrustedContent(input.previousArticle.bodyHtml, 6000)));
    userLines.push("");
  }
  if (input.updateDelta) {
    userLines.push("UPDATE DELTA:");
    const deltaLines: string[] = [];
    for (const changed of input.updateDelta.changedFacts) {
      deltaLines.push(`- changed [${changed.factKey}]: «${changed.before}» → «${changed.after}»`);
    }
    for (const fact of input.updateDelta.newFacts) {
      deltaLines.push(`- new fact: ${fact}`);
    }
    userLines.push(wrapUntrustedContent("update-delta", deltaLines.join("\n")));
    userLines.push("");
  }

  if (brief.contentWarnings.length > 0) {
    userLines.push("CONTENT WARNINGS (hard constraints):");
    for (const warning of brief.contentWarnings) {
      userLines.push(`- ${warning}`);
    }
    userLines.push("");
  }

  userLines.push(WRITER_OUTPUT_FORMAT);

  return {
    systemPrompt: systemLines,
    userPrompt: userLines.join("\n"),
  };
}

// ────────────────────────────────────────────────────────────── Parsing

function stripHtml(value: string): string {
  return value.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

function clampText(value: unknown, max: number): string {
  return String(value ?? "").slice(0, max).trim();
}

type RawArticleShape = {
  title?: unknown;
  h1?: unknown;
  excerpt?: unknown;
  bodyHtml?: unknown;
  seoTitle?: unknown;
  seoDescription?: unknown;
  claims?: Array<{ text?: unknown; factKey?: unknown; attributionRequired?: unknown }>;
};

/** Extract the first JSON object from a (possibly fenced/annotated) output. */
export function extractJsonObject(raw: string): Record<string, unknown> | null {
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    return null;
  }
  try {
    const parsed = JSON.parse(cleaned.slice(start, end + 1)) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function parseWriterOutput(raw: string): ParsedArticle {
  const shape = extractJsonObject(raw) as RawArticleShape | null;
  if (shape && typeof shape.bodyHtml === "string" && shape.bodyHtml.trim()) {
    const claims = Array.isArray(shape.claims)
      ? shape.claims
          .filter((claim) => claim && typeof claim.text === "string" && claim.text.trim())
          .map((claim) => ({
            text: clampText(claim.text, 300),
            factKey: typeof claim.factKey === "string" && claim.factKey.trim() ? claim.factKey.trim() : null,
            attributionRequired: claim.attributionRequired === true,
          }))
          .slice(0, 40)
      : [];
    const title = clampText(shape.title, 200) || clampText(shape.h1, 200);
    return {
      title,
      h1: clampText(shape.h1, 200) || title,
      excerpt: clampText(shape.excerpt, 300),
      bodyHtml: shape.bodyHtml.slice(0, 200_000),
      seoTitle: clampText(shape.seoTitle, 80),
      seoDescription: clampText(shape.seoDescription, 300),
      claims,
    };
  }

  // Fallback: treat the raw output as the body so QA still runs on it.
  const text = stripHtml(raw);
  return {
    title: text.split(/[.!?\n]/)[0]?.slice(0, 120) || "",
    h1: "",
    excerpt: text.slice(0, 300),
    bodyHtml: `<p>${raw.slice(0, 200_000).replace(/\n/g, "</p><p>")}</p>`,
    seoTitle: "",
    seoDescription: "",
    claims: [],
  };
}
