import type { ContentVersion } from "@prisma/client";
import type { QaCheck, QaReport } from "./types";
import { INLINE_IMAGE_MIN } from "./inline-images";
import { wordBandForContentType } from "./quality-gate";
import { runQualityChecklist, type ChecklistItem } from "./editorial-engine/quality-checklist";
import type { ArticleTargets } from "./editorial-engine/structure";

export type QaSeverity = "error" | "warning" | "info";
export type QaGroup = "structural" | "seo" | "editorial" | "evidence" | "publishing";

export type QaFinding = {
  key: string;
  label: string;
  passed: boolean;
  severity: QaSeverity;
  message: string;
  group: QaGroup;
};

export type QaReportV2 = {
  passed: boolean;
  score: number;
  checks: QaCheck[];
  findings: QaFinding[];
  /** The 10 checks listed in the article panel (absent on reports stored before M4). */
  checklist?: ChecklistItem[];
};

export type QaVersionContext = {
  imageReady: boolean;
  metadata?: Record<string, unknown>;
  siteType?: string | null;
  recommendedWordCountMin?: number | null;
  recommendedWordCountMax?: number | null;
  evidenceCount?: number;
  cannibalizationRisk?: string | null;
  internalLinkInventorySize?: number;
};

const GENERIC_AI_PHRASES = [
  "in today's digital world",
  "in today's fast-paced world",
  "in the digital age",
  "en el mundo digital actual",
  "en el vertiginoso mundo digital",
  "en la era digital actual",
  "como todos sabemos",
  "es innegable que",
  "sin lugar a dudas",
  "en un mundo cada vez más",
];

const PLACEHOLDER_PATTERNS = [/lorem ipsum/i, /\[insert/i, /\bTODO\b/, /\bTBD\b/, /RELLENAR/i, /XXXX{3,}/];

function wordCount(value: string): number {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

function stripHtml(value: string): string {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasHeadingOrderIssues(html: string): boolean {
  const headings = [...html.matchAll(/<(h[1-4])[^>]*>/gi)].map((match) => Number(match[1].slice(1)));
  let lastLevel = 1;
  for (const level of headings) {
    if (level > lastLevel + 1) {
      return true;
    }
    lastLevel = level;
  }
  return false;
}

function hasEmptyHeadings(html: string): boolean {
  const pattern = /<(h[1-4])[^>]*>\s*(?:<[^>]+>\s*)*<\/\1>/gi;
  return pattern.test(html);
}

function hasMalformedHtml(html: string): boolean {
  const opens = (html.match(/<h[1-4][^>]*>/gi) ?? []).length;
  const closes = (html.match(/<\/h[1-4]>/gi) ?? []).length;
  if (opens !== closes) {
    return true;
  }
  const pOpens = (html.match(/<p[^>]*>/gi) ?? []).length;
  const pCloses = (html.match(/<\/p>/gi) ?? []).length;
  return pOpens !== pCloses;
}

function countInternalLinks(html: string): number {
  return (html.match(/<a[^>]+href=["'](?!https?:\/\/|mailto:|tel:|#)/gi) ?? []).length;
}

function countExternalLinks(html: string): number {
  return (html.match(/<a[^>]+href=["']https?:\/\//gi) ?? []).length;
}

function countImages(html: string): number {
  return (html.match(/<img[^>]*>/gi) ?? []).length;
}

function hasImageAlt(html: string): boolean {
  const images = html.match(/<img[^>]*>/gi) ?? [];
  if (images.length === 0) {
    return true;
  }
  return images.every((image) => /alt=["'][^"']+["']/i.test(image));
}

function hasFaqSection(html: string): boolean {
  return /<h[23][^>]*>\s*[^<]*(preguntas frecuentes|faq|dudas frecuentes)/i.test(html) || /\bfaq\b/i.test(html);
}

function containsKeyword(html: string, keyword: string): boolean {
  if (!keyword) {
    return true;
  }
  const normalizedKeyword = keyword.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const normalizedHtml = stripHtml(html).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return normalizedHtml.includes(normalizedKeyword);
}

function headingTokens(value: string): string[] {
  return value.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").split(/[^a-z0-9ñ]+/).filter((token) => token.length > 2);
}

/** Outline entries with no H2 sharing at least half of their meaningful words (the writer may lightly rephrase). */
export function missingOutlineHeadings(outline: unknown[], html: string): string[] {
  const h2s = [...html.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/gi)].map((match) => new Set(headingTokens(stripHtml(match[1]))));
  return outline
    .map((entry) => (entry && typeof entry === "object" ? String((entry as Record<string, unknown>).heading ?? "") : String(entry ?? "")).trim())
    .filter(Boolean)
    .filter((heading) => {
      const tokens = headingTokens(heading);
      if (tokens.length === 0) return false;
      return !h2s.some((h2) => tokens.filter((token) => h2.has(token)).length / tokens.length >= 0.5);
    });
}

/**
 * Intent-aware editorial QA. The score is explainable: every finding carries a
 * reason, group and severity. Errors block publication; warnings are visible.
 */
export function runVersionQaV2(
  version: Pick<ContentVersion, "title" | "excerpt" | "bodyHtml" | "seoTitle" | "seoDescription">,
  context: QaVersionContext,
): QaReportV2 {
  const body = String(version.bodyHtml || "").trim();
  const bodyText = stripHtml(body);
  const title = String(version.title || "").trim();
  const excerpt = String(version.excerpt || "").trim();
  const seoTitle = String(version.seoTitle || "").trim();
  const seoDescription = String(version.seoDescription || "").trim();
  const metadata = context.metadata ?? {};

  const intent = typeof metadata.primaryIntent === "string" ? metadata.primaryIntent : null;
  const contentType = typeof metadata.contentType === "string" ? metadata.contentType : null;
  const primaryKeyword = typeof metadata.primaryKeyword === "string" ? metadata.primaryKeyword : null;
  const targetQuery = typeof metadata.targetQuery === "string" ? metadata.targetQuery : null;
  const faqCandidates = Array.isArray(metadata.faqCandidates) ? metadata.faqCandidates.length : 0;
  const outlineCount = Array.isArray(metadata.outline) ? metadata.outline.length : 0;
  const words = wordCount(bodyText);
  // The plan's targets win; otherwise the content-type band the autonomous gate also uses.
  const band = wordBandForContentType(contentType, intent);
  const wordRangeTarget = { min: context.recommendedWordCountMin ?? band.min, max: context.recommendedWordCountMax ?? band.softMax };

  const findings: QaFinding[] = [];
  const add = (key: string, label: string, passed: boolean, severity: QaSeverity, message: string, group: QaGroup) => {
    findings.push({ key, label, passed, severity, message, group });
  };

  // ── Structural
  add("title_present", "Title present", title.length >= 20, "error", "El título debe existir y tener un mínimo razonable (≥20 caracteres).", "structural");
  add("body_exists", "Body present", body.length > 0, "error", "El cuerpo del artículo no puede estar vacío.", "structural");
  const h2Count = (body.match(/<h2[^>]*>/gi) ?? []).length;
  const needsRichStructure = contentType === "guide" || contentType === "evergreen-pillar" || contentType === "comparison" || contentType === "ranking";
  add("h2_present", "H2 sections", h2Count >= 1 && (!needsRichStructure || h2Count >= 3), needsRichStructure ? "error" : "warning", needsRichStructure ? "Un artículo de este tipo necesita al menos 3 secciones H2." : "La pieza debe incluir al menos un subtítulo estructural.", "structural");
  add("heading_order", "Heading order", !hasHeadingOrderIssues(body), "warning", "Los niveles de encabezado deben ser consecutivos (H2 → H3, sin saltos).", "structural");
  add("empty_headings", "No empty headings", !hasEmptyHeadings(body), "warning", "No debe haber encabezados vacíos.", "structural");
  add("malformed_html", "Valid HTML", !hasMalformedHtml(body), "error", "El HTML contiene etiquetas sin cerrar; el contenido podría romperse al publicar.", "structural");
  const paragraphs = (body.match(/<p[^>]*>/gi) ?? []).length;
  add("paragraph_count", "Paragraph count", paragraphs >= 4, "warning", `El cuerpo debe estar dividido en párrafos legibles (actual: ${paragraphs}).`, "structural");

  // ── SEO
  const seoTitleHealthy = seoTitle.length >= 35 && seoTitle.length <= 70;
  add("seo_title", "SEO title", seoTitleHealthy, "warning", `El SEO title debe medir entre 35 y 70 caracteres (actual: ${seoTitle.length}).`, "seo");
  const seoDescriptionHealthy = seoDescription.length >= 110 && seoDescription.length <= 165;
  add("seo_description", "Meta description", seoDescriptionHealthy, "warning", `La meta description debe medir entre 110 y 165 caracteres (actual: ${seoDescription.length}).`, "seo");
  if (intent) {
    add("intent_defined", "Primary intent defined", true, "info", `Intención principal: ${intent}.`, "seo");
  } else {
    add("intent_defined", "Primary intent defined", false, "warning", "Define la intención de búsqueda principal para orientar el contenido.", "seo");
  }
  if (targetQuery) {
    add("target_query", "Target query present", true, "info", `Query objetivo: ${targetQuery}.`, "seo");
  } else if (intent && intent !== "news" && intent !== "sports-live") {
    add("target_query", "Target query present", false, "warning", "Sin query objetivo definido para esta intención.", "seo");
  } else {
    add("target_query", "Target query present", true, "info", "Query objetivo no aplica para contenido de actualidad.", "seo");
  }
  const inRange = words >= wordRangeTarget.min * 0.85 && words <= wordRangeTarget.max * 1.25;
  add(
    "word_count",
    "Word count in range",
    inRange,
    "warning",
    `El artículo tiene ${words} palabras; el rango recomendado es ${wordRangeTarget.min}–${wordRangeTarget.max}.`,
    "seo",
  );
  if (primaryKeyword) {
    add("keyword_in_title", "Keyword in title", containsKeyword(title, primaryKeyword), "warning", `La keyword "${primaryKeyword}" debería aparecer en el título.`, "seo");
    const intro = bodyText.slice(0, 150);
    add("keyword_in_intro", "Keyword in introduction", containsKeyword(intro, primaryKeyword), "warning", `La keyword "${primaryKeyword}" debería aparecer en la introducción.`, "seo");
    const headingsBlob = [...body.matchAll(/<h[23][^>]*>(.*?)<\/h[23]>/gi)].map((match) => match[1]).join(" ");
    add("keyword_in_headings", "Keyword in headings", containsKeyword(stripHtml(headingsBlob), primaryKeyword), "warning", `Incluye la keyword "${primaryKeyword}" en algún H2/H3.`, "seo");
  }
  const internalLinks = countInternalLinks(body);
  add("internal_links", "Internal links", internalLinks >= 2, "warning", `Añade al menos 2 enlaces internos reales del inventario del sitio (actual: ${internalLinks}).`, "seo");
  const externalLinks = countExternalLinks(body);
  add("evidence_links", "External evidence links", externalLinks >= 1 || !(intent === "news" || intent === "commercial-investigation"), intent === "news" || intent === "commercial-investigation" ? "warning" : "info", "El contenido de actualidad o comparación debe citar fuentes externas verificables.", "seo");
  const imageCount = countImages(body);
  // Checked once the hero exists: inline images are queued with it and land in the body as they finish.
  add("image_presence", "Inline images", imageCount >= INLINE_IMAGE_MIN || !context.imageReady, "error", `El artículo debe llevar al menos ${INLINE_IMAGE_MIN} imágenes dentro del cuerpo (actual: ${imageCount}).`, "seo");
  add("image_alt", "Image alt text", hasImageAlt(body), "warning", "Todas las imágenes deben llevar texto alternativo descriptivo.", "seo");
  if (faqCandidates > 0 || intent === "informational" || intent === "commercial-investigation" || intent === "transactional") {
    add("faq_section", "FAQ section", hasFaqSection(body), "warning", "Esta intención se beneficia de una sección FAQ con preguntas frecuentes.", "seo");
  } else {
    add("faq_section", "FAQ section", true, "info", "No se requiere FAQ para este formato.", "seo");
  }
  if (outlineCount > 0) {
    const missing = missingOutlineHeadings(metadata.outline as unknown[], body);
    add(
      "outline_coverage",
      "Approved outline covered",
      missing.length === 0,
      "error",
      missing.length === 0
        ? `Las ${outlineCount} secciones del outline aprobado están presentes como H2.`
        : `Faltan secciones del outline aprobado como H2: ${missing.map((heading) => `«${heading}»`).join(", ")}. Añádelas o edita el outline del plan.`,
      "structural",
    );
  }
  if (context.cannibalizationRisk && context.cannibalizationRisk !== "none") {
    add("cannibalization", "Cannibalization risk", false, "warning", `Riesgo de canibalización detectado: ${context.cannibalizationRisk}. Revisa el query objetivo.`, "seo");
  } else {
    add("cannibalization", "Cannibalization risk", true, "info", "Sin conflicto de canibalización detectado.", "seo");
  }

  // ── Editorial
  const introWords = wordCount(bodyText.slice(0, 250));
  add("intro_quality", "Coherent introduction", introWords >= 30, "warning", "La introducción debe presentar el tema con sustancia (≥30 palabras).", "editorial");
  const hasGenericPhrase = GENERIC_AI_PHRASES.some((phrase) => bodyText.toLowerCase().includes(phrase));
  add("no_generic_phrases", "No generic AI filler", !hasGenericPhrase, "warning", "Evita frases genéricas de IA como «en el mundo digital actual».", "editorial");
  const hasPlaceholder = PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(bodyText));
  add("no_placeholders", "No placeholder text", !hasPlaceholder, "error", "El texto contiene marcadores de posición sin sustituir.", "editorial");
  add("excerpt_present", "Excerpt present", excerpt.length >= 80, "warning", "El extracto debe resumir la pieza con al menos 80 caracteres.", "editorial");
  const avgParagraphWords = paragraphs > 0 ? words / paragraphs : 0;
  add("readable_paragraphs", "Readable paragraphs", paragraphs === 0 || avgParagraphWords <= 120, "warning", `Párrafos demasiado largos (media de ${Math.round(avgParagraphWords)} palabras); divídelos para facilitar la lectura.`, "editorial");

  // ── Evidence
  const evidenceRequired = intent === "news" || intent === "sports-live" || contentType === "analysis" || contentType === "match-report" || contentType === "preview";
  add(
    "evidence_grounding",
    "Evidence grounding",
    !evidenceRequired || externalLinks >= 1 || (context.evidenceCount ?? 0) >= 1,
    evidenceRequired ? "warning" : "info",
    "El contenido que depende de datos actuales debe estar basado en fuentes recuperadas.",
    "evidence",
  );

  // ── Publishing
  add("publish_contract", "Publishing contract", title.length > 0 && body.length > 0 && seoTitle.length > 0 && seoDescription.length > 0, "error", "Faltan campos obligatorios para publicar en el destino (título, cuerpo, SEO title y meta description).", "publishing");
  add("image_ready", "Featured image ready", context.imageReady, "error", "La versión debe disponer de una imagen destacada lista (hero variant persistida).", "publishing");

  const errors = findings.filter((finding) => finding.severity === "error");
  const passed = errors.every((finding) => finding.passed);
  const weightedPassed = findings.reduce((sum, finding) => sum + (finding.passed ? (finding.severity === "error" ? 2 : 1) : 0), 0);
  const weightedTotal = findings.reduce((sum, finding) => sum + (finding.severity === "error" ? 2 : 1), 0);
  const score = Math.round((weightedPassed / Math.max(1, weightedTotal)) * 100);

  const checks: QaCheck[] = findings
    .filter((finding) => finding.severity === "error" || finding.severity === "warning")
    .map((finding) => ({
      key: finding.key,
      passed: finding.passed,
      message: finding.message,
      severity: finding.severity as "error" | "warning",
    }));

  const stringList = (value: unknown) => (Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : []);
  const storedInventory = typeof metadata.internalLinkInventorySize === "number" ? metadata.internalLinkInventorySize : null;
  const checklist = runQualityChecklist({
    bodyHtml: body,
    seoTitle,
    seoDescription,
    primaryKeyword,
    semanticKeywords: [...stringList(metadata.semanticKeywords), ...stringList(metadata.secondaryKeywords)],
    // Stored by the plan brief for guides only (structure.ts resolveArticleTargets).
    targets: metadata.articleTargets && typeof metadata.articleTargets === "object" ? (metadata.articleTargets as ArticleTargets) : null,
    cannibalizationRisk: context.cannibalizationRisk ?? null,
    internalLinkInventorySize: context.internalLinkInventorySize ?? storedInventory,
  });

  return { passed, score, checks, findings, checklist };
}

/** Backward-compatible entry point used by existing call sites. */
export function runVersionQa(
  version: Pick<ContentVersion, "title" | "excerpt" | "bodyHtml" | "seoTitle" | "seoDescription">,
  imageReady: boolean,
): QaReport & { score: number; findings: QaFinding[] } {
  return runVersionQaV2(version, { imageReady });
}
