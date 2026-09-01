// Editorial QA (Phase 4): a multi-dimensional, explainable score.
//
// Dimensions: factual grounding, attribution, originality, relevance,
// completeness, readability, SEO quality, internal linking, entity
// consistency, date consistency, unsupported claims, duplication and
// source diversity.
//
// Serious unsupported factual claims (dates/years not present in the fact
// ledger) are errors and hard-fail publication.

import { detectVerbatimOverlap } from "./fact-safety";
import { getStructureSpec } from "./structure";
import { stripHtml, wordCount } from "./seo-package";
import { titleSimilarity } from "../editorial";
import type {
  EditorialBrief,
  EditorialQaReport,
  FactLicense,
  ParsedArticle,
  QaDimensionKey,
  QaDimensionScore,
  QaFindingV3,
  SeoPackage,
} from "./types";

const MONTHS_EN = "january|february|march|april|may|june|july|august|september|october|november|december";
const MONTHS_ES = "enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre";

export type QaInput = {
  article: ParsedArticle;
  brief: EditorialBrief;
  licenses: FactLicense[];
  seo: SeoPackage;
  /** Source titles/descriptions used for verbatim-overlap detection. */
  sourceTexts: string[];
  /** Titles of pages already indexed on the target site. */
  indexedPageTitles: string[];
  /** Entity display names with their allowed variants. */
  entityNames: string[];
  /** Extra allowed knowledge from enrichment (cast/crew/overview tokens). */
  enrichmentKnowledge: string[];
  /** Validated enrichment release dates (ISO) — allowed date knowledge. */
  enrichmentDates: string[];
};

type DimensionAccumulator = {
  findings: QaFindingV3[];
  passedWeight: number;
  totalWeight: number;
};

function addFinding(
  dim: DimensionAccumulator,
  key: string,
  label: string,
  passed: boolean,
  severity: "error" | "warning" | "info",
  message: string,
  dimension: QaDimensionKey,
): void {
  dim.findings.push({ key, dimension, severity, passed, message: message.slice(0, 400) });
  dim.totalWeight += severity === "error" ? 2 : 1;
  if (passed) {
    dim.passedWeight += severity === "error" ? 2 : 1;
  }
}

function scoreOf(dim: DimensionAccumulator): number {
  return dim.totalWeight === 0 ? 100 : Math.round((dim.passedWeight / dim.totalWeight) * 100);
}

// ────────────────────────────────────────────────────────────── Extraction

const YEAR_PATTERN = /\b(1[89]\d{2}|20\d{2})\b/g;
const DATE_PATTERN = new RegExp(
  [
    `\\b(?:${MONTHS_EN}|${MONTHS_ES})\\.?\\s+\\d{1,2}(?:\\s*,?\\s+(?:1[89]\\d{2}|20\\d{2}))?\\b`,
    `\\b\\d{1,2}\\s+(?:de\\s+)?(?:${MONTHS_EN}|${MONTHS_ES})(?:\\s+(?:de\\s+)?(?:1[89]\\d{2}|20\\d{2}))?\\b`,
    `\\b(?:1[89]\\d{2}|20\\d{2})-\\d{2}-\\d{2}\\b`,
  ].join("|"),
  "gi",
);

const CAPITALIZED_NAME_PATTERN = /\b[A-ZÁÉÍÓÚÑÜ][a-záéíóúñü]{2,}(?:\s+[A-ZÁÉÍÓÚÑÜ][a-záéíóúñü]{2,}){0,2}\b/g;

/** Generic editorial boilerplate words are never "unsupported claims". */
const NAME_STOPWORDS = new Set([
  "what", "more", "the", "this", "these", "those", "further", "next", "here",
  "when", "where", "how", "why", "according", "details", "everything",
  "verified", "context", "validated", "related", "sources", "key", "story",
  "update", "updated", "information", "confirmed", "expected", "reported",
  "reporting", "report", "read", "original", "news", "rest", "section",
  "covered", "coverage", "facts", "fact", "one", "new", "details", "develops",
  "developing", "line", "brief", "piece", "comes", "part",
  "january", "february", "march", "april", "may", "june", "july", "august",
  "september", "october", "november", "december",
  "enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto",
  "septiembre", "octubre", "noviembre", "diciembre",
]);

function normalize(value: string): string {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function normalizeDate(value: string): string | null {
  const iso = /((?:1[89]\d{2}|20\d{2}))-(\d{2})-(\d{2})/.exec(value);
  if (iso) {
    return `${iso[1]}-${iso[2]}-${iso[3]}`;
  }
  const yearMatch = /((?:1[89]\d{2}|20\d{2}))/.exec(value);
  const year = yearMatch ? yearMatch[1] : null;
  const monthNames: Record<string, number> = {
    january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
    july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
    enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6,
    julio: 7, agosto: 8, septiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
  };
  let month: number | null = null;
  for (const [name, number] of Object.entries(monthNames)) {
    if (value.toLowerCase().includes(name)) {
      month = number;
      break;
    }
  }
  const dayMatch = /\b(\d{1,2})\b/.exec(value);
  const day = dayMatch ? Number.parseInt(dayMatch[1], 10) : null;
  if (year === null && month === null) {
    return null;
  }
  const parts: string[] = [];
  if (year) parts.push(year);
  if (month !== null) parts.push(String(month).padStart(2, "0"));
  if (day !== null && month !== null) parts.push(String(day).padStart(2, "0"));
  return parts.join("-");
}

/** Every year mentioned in the article must exist in the ledger knowledge. */
function extractYears(value: string): string[] {
  return Array.from(value.matchAll(YEAR_PATTERN)).map((match) => match[0]);
}

function extractDates(value: string): string[] {
  return Array.from(value.matchAll(DATE_PATTERN)).map((match) => match[0]);
}

export function sentenceSplit(value: string): string[] {
  return value
    .split(/(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÑÜ"«])/g)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 20);
}

// ────────────────────────────────────────────────────────────── QA

const NEWS_TYPES = new Set([
  "breaking_news",
  "standard_news",
  "developing_story",
  "movie_announcement",
  "casting_news",
  "release_date_news",
  "trailer_news",
  "streaming_availability",
  "tv_programming",
  "article_update",
]);

export function runEditorialQa(input: QaInput): EditorialQaReport {
  const { article, brief, licenses, seo } = input;
  const bodyText = stripHtml(article.bodyHtml);
  const bodyWords = bodyText.split(/\s+/).filter(Boolean);
  const words = wordCount(bodyText);
  const title = article.title || article.h1 || "";

  const dimensions: Record<QaDimensionKey, DimensionAccumulator> = {
    factual_grounding: { findings: [], passedWeight: 0, totalWeight: 0 },
    attribution: { findings: [], passedWeight: 0, totalWeight: 0 },
    originality: { findings: [], passedWeight: 0, totalWeight: 0 },
    relevance: { findings: [], passedWeight: 0, totalWeight: 0 },
    completeness: { findings: [], passedWeight: 0, totalWeight: 0 },
    readability: { findings: [], passedWeight: 0, totalWeight: 0 },
    seo_quality: { findings: [], passedWeight: 0, totalWeight: 0 },
    internal_linking: { findings: [], passedWeight: 0, totalWeight: 0 },
    entity_consistency: { findings: [], passedWeight: 0, totalWeight: 0 },
    date_consistency: { findings: [], passedWeight: 0, totalWeight: 0 },
    unsupported_claims: { findings: [], passedWeight: 0, totalWeight: 0 },
    duplication: { findings: [], passedWeight: 0, totalWeight: 0 },
    source_diversity: { findings: [], passedWeight: 0, totalWeight: 0 },
  };

  const add = (
    dimension: QaDimensionKey,
    key: string,
    label: string,
    passed: boolean,
    severity: "error" | "warning" | "info",
    message: string,
  ) => addFinding(dimensions[dimension], key, label, passed, severity, message, dimension);

  // ── Knowledge bases (what the article is ALLOWED to claim) ──────────────
  const ledgerKnowledge = licenses.map((license) => normalize(license.statement));
  const entityKnowledge = [...input.entityNames, ...brief.entities.map((entity) => entity.name)].map(normalize);
  const enrichmentKnowledge = input.enrichmentKnowledge.map(normalize);
  const allowedYears = new Set(
    licenses.flatMap((license) => extractYears(license.statement)).concat(input.enrichmentDates.flatMap((date) => extractYears(date))),
  );
  const allowedDates = new Set(
    [
      ...licenses.map((license) => normalizeDate(license.statement)),
      ...input.enrichmentDates.map((date) => normalizeDate(date)),
    ].filter((value): value is string => Boolean(value)),
  );

  // ── Unsupported claims (years/dates not in the ledger are critical) ────
  const years = extractYears(bodyText);
  const dates = extractDates(bodyText);
  const criticalUnsupportedClaims: Array<{ claim: string; reason: string }> = [];

  for (const year of years) {
    if (!allowedYears.has(year)) {
      criticalUnsupportedClaims.push({
        claim: year,
        reason: `year ${year} does not appear in the fact ledger`,
      });
    }
  }
  for (const date of dates) {
    const normalized = normalizeDate(date);
    if (normalized && !allowedDates.has(normalized)) {
      criticalUnsupportedClaims.push({
        claim: date,
        reason: `date ${date} does not match any ledger date`,
      });
    }
  }

  // Capitalized names not present in knowledge bases → possible unsupported.
  const knownNames = new Set([...entityKnowledge, ...enrichmentKnowledge, ...ledgerKnowledge]);
  const seenNames = new Set<string>();
  for (const match of bodyText.matchAll(CAPITALIZED_NAME_PATTERN)) {
    const name = match[0];
    const key = normalize(name);
    if (seenNames.has(key) || name.length < 4 || NAME_STOPWORDS.has(key)) {
      continue;
    }
    seenNames.add(key);
    const known = [...knownNames].some((entry) => entry.includes(key) || key.includes(entry) && entry.length >= 5);
    if (!known && !criticalUnsupportedClaims.some((entry) => entry.claim === name)) {
      add(
        "unsupported_claims",
        `name_${key}`,
        "Unsupported name",
        false,
        "warning",
        `«${name}» does not appear in the fact ledger, entities or enrichment data.`,
      );
    }
  }

  if (criticalUnsupportedClaims.length > 0) {
    add(
      "unsupported_claims",
      "critical_unsupported",
      "Unsupported factual claims",
      false,
      "error",
      `The article states ${criticalUnsupportedClaims.length} date/year claim(s) that are not in the fact ledger: ${criticalUnsupportedClaims.map((entry) => entry.claim).join(", ")}.`,
    );
  } else {
    add("unsupported_claims", "critical_unsupported", "Unsupported factual claims", true, "info", "No dates or years outside the fact ledger detected.");
  }

  // ── Factual grounding ───────────────────────────────────────────────────
  const usableLicenses = licenses.filter((license) => license.usage !== "forbidden");
  const forbiddenUsed = licenses
    .filter((license) => license.usage === "forbidden")
    .filter((license) => bodyText.toLowerCase().includes(license.statement.toLowerCase().slice(0, 40)));
  if (forbiddenUsed.length > 0) {
    add(
      "factual_grounding",
      "forbidden_fact_used",
      "Forbidden fact used",
      false,
      "error",
      `Forbidden facts appear in the article: ${forbiddenUsed.map((license) => license.factKey).join(", ")}.`,
    );
  } else {
    add("factual_grounding", "forbidden_fact_used", "Forbidden facts excluded", true, "info", "No forbidden facts were used.");
  }

  const claims = article.claims.length > 0 ? article.claims : sentenceSplit(bodyText).slice(0, 12).map((sentence) => ({ text: sentence, factKey: null, attributionRequired: false }));
  let grounded = 0;
  for (const claim of claims) {
    const claimText = normalize(claim.text);
    const match = usableLicenses.some((license) => {
      const statement = normalize(license.statement);
      return (
        (claim.factKey && claim.factKey === license.factKey) ||
        statement.includes(claimText) ||
        claimText.includes(statement.slice(0, 40)) ||
        claimText.split(" ").filter((token) => token.length > 3).filter((token) => statement.includes(token)).length >= 2
      );
    });
    if (match) {
      grounded += 1;
    }
  }
  const groundingRatio = claims.length > 0 ? grounded / claims.length : 0;
  const groundingPass = usableLicenses.length === 0 || groundingRatio >= 0.8;
  add(
    "factual_grounding",
    "claim_grounding",
    "Claims grounded in the ledger",
    groundingPass,
    groundingPass ? "info" : "error",
    `${grounded}/${claims.length} claims map to ledger facts (${Math.round(groundingRatio * 100)}%).`,
  );

  // ── Attribution ─────────────────────────────────────────────────────────
  const requiredAttribution = licenses.filter((license) => license.usage === "attribute" || license.usage === "represent_uncertainty");
  let attributed = 0;
  for (const license of requiredAttribution) {
    const publisher = license.sources[0]?.publisher;
    const used = claims.some((claim) => claim.factKey === license.factKey) || bodyText.toLowerCase().includes(normalize(license.statement).slice(0, 40));
    if (!used) {
      continue;
    }
    const inline = publisher && bodyText.toLowerCase().includes(normalize(publisher));
    if (inline) {
      attributed += 1;
    }
  }
  const attributionPass = requiredAttribution.length === 0 || attributed === requiredAttribution.length;
  add(
    "attribution",
    "single_source_attribution",
    "Single-source facts attributed",
    attributionPass,
    attributionPass ? "info" : "warning",
    requiredAttribution.length === 0
      ? "No single-source facts require attribution."
      : `${attributed}/${requiredAttribution.length} single-source facts carry inline attribution.`,
  );
  const externalLinks = [...bodyText.matchAll(/href=["'](https?:\/\/[^"']+)["']/g)].map((match) => match[1]).length;
  const needsExternal = NEWS_TYPES.has(brief.articleType) && requiredAttribution.length > 0;
  add(
    "attribution",
    "external_links",
    "External attribution links",
    !needsExternal || externalLinks >= 1,
    needsExternal ? "warning" : "info",
    needsExternal ? "News content should link the attributed sources." : "External links not required for this type.",
  );

  // ── Originality ─────────────────────────────────────────────────────────
  const overlaps = detectVerbatimOverlap(bodyText, input.sourceTexts);
  if (overlaps.length > 0) {
    add(
      "originality",
      "verbatim_overlap",
      "No verbatim source spans",
      false,
      "warning",
      `${overlaps.length} verbatim span(s) overlap source text: ${overlaps.map((entry) => `«${entry.excerpt.slice(0, 60)}»`).join("; ")}`,
    );
  } else {
    add("originality", "verbatim_overlap", "No verbatim source spans", true, "info", "No verbatim overlap with source titles/descriptions detected.");
  }
  const longestSentence = Math.max(0, ...bodyText.split(/[.!?]/).map((sentence) => sentence.trim().split(/\s+/).length));
  add(
    "originality",
    "synthesis_shape",
    "Synthesized sentence shapes",
    longestSentence <= 45,
    longestSentence <= 45 ? "info" : "warning",
    `Longest sentence has ${longestSentence} words; synthesized prose should avoid source-like run-ons.`,
  );

  // ── Relevance ───────────────────────────────────────────────────────────
  const primary = brief.primaryKeyword;
  const normalizedBody = normalize(bodyText);
  const keywordInBody = primary.length > 0 && normalizedBody.includes(normalize(primary));
  const keywordInTitle = primary.length > 0 && (normalize(title).includes(normalize(primary)) || normalize(seo.h1).includes(normalize(primary)));
  add("relevance", "primary_keyword", "Primary keyword coverage", keywordInBody || keywordInTitle, keywordInBody || keywordInTitle ? "info" : "warning", `Primary keyword «${primary}» ${keywordInBody || keywordInTitle ? "appears in the article" : "is missing from the article"}.`);
  const coveredEntities = seo.entityCoverage.filter((entry) => entry.covered).length;
  const entityRatio = seo.entityCoverage.length > 0 ? coveredEntities / seo.entityCoverage.length : 1;
  add("relevance", "entity_coverage", "Entity coverage", entityRatio >= 0.5, entityRatio >= 0.5 ? "info" : "warning", `${coveredEntities}/${seo.entityCoverage.length} brief entities appear in the body.`);

  // ── Completeness ────────────────────────────────────────────────────────
  const spec = getStructureSpec(brief.articleType);
  const h2s = [...article.bodyHtml.matchAll(/<h2[^>]*>(.*?)<\/h2>/gi)].map((match) => stripHtml(match[1]).toLowerCase());
  for (const section of spec.sections.filter((entry) => entry.required)) {
    let present: boolean;
    if (section.kind === "lead" || section.kind === "update_note") {
      present = bodyWords.length > 40;
    } else if (section.heading) {
      present = h2s.some((h2) => h2.includes(normalize(section.heading ?? "")));
    } else {
      present = bodyWords.length > 80;
    }
    add(
      "completeness",
      `section_${section.kind}`,
      `Required section: ${section.heading ?? section.kind}`,
      present,
      present ? "info" : "warning",
      present ? "Present." : `Missing required section «${section.heading ?? section.kind}».`,
    );
  }
  const inRange = words >= brief.targetLengthRange.min * 0.75 && words <= brief.targetLengthRange.max * 1.4;
  add("completeness", "length", "Length in target range", inRange, inRange ? "info" : "warning", `${words} words; target ${brief.targetLengthRange.min}–${brief.targetLengthRange.max}.`);

  // ── Readability ─────────────────────────────────────────────────────────
  const paragraphs = [...bodyText.matchAll(/<p[^>]*>/gi)].length;
  const avgParagraph = paragraphs > 0 ? Math.round(words / paragraphs) : 0;
  add("readability", "paragraph_length", "Readable paragraphs", paragraphs === 0 || avgParagraph <= 120, "warning", `Average paragraph length is ${avgParagraph} words (target ≤120).`);
  const headingLevels = [...article.bodyHtml.matchAll(/<(h[1-4])[^>]*>/gi)].map((match) => Number(match[1].slice(1)));
  let headingOrderOk = true;
  for (let index = 1; index < headingLevels.length; index += 1) {
    if (headingLevels[index] > (headingLevels[index - 1] ?? 1) + 1) {
      headingOrderOk = false;
    }
  }
  add("readability", "heading_order", "Heading order", headingOrderOk, "warning", "Heading levels must not skip (H2 → H4).");

  // ── SEO quality ─────────────────────────────────────────────────────────
  add("seo_quality", "seo_title_length", "SEO title length", seo.seoTitle.length >= 35 && seo.seoTitle.length <= 70, "warning", `SEO title is ${seo.seoTitle.length} characters (35–70).`);
  add("seo_quality", "meta_length", "Meta description length", seo.metaDescription.length >= 110 && seo.metaDescription.length <= 165, "warning", `Meta description is ${seo.metaDescription.length} characters (110–165).`);
  add("seo_quality", "slug", "Slug present", seo.slug.length > 0, "error", "Slug must exist.");
  add("seo_quality", "no_stuffing", "No keyword stuffing", !seo.keywordDensity.stuffingRisk, "warning", `Keyword density ${seo.keywordDensity.densityPercent}% (stuffing >2.5%).`);
  add("seo_quality", "structured_data", "Structured data recommendation", seo.structuredDataRecommendation.length > 0, "info", seo.structuredDataRecommendation);

  // ── Internal linking ────────────────────────────────────────────────────
  const internalLinksUsed = [...article.bodyHtml.matchAll(/href=["']((?!https?:\/\/|mailto:|tel:|#)[^"']+)["']/gi)].length;
  const requiredInternal = brief.articleType === "evergreen_explainer" || brief.articleType === "list_ranking" || brief.articleType === "what_to_watch" || brief.articleType === "review_info" ? 2 : 1;
  const inventoryEmpty = brief.internalLinkOpportunities.length === 0;
  add(
    "internal_linking",
    "internal_links",
    "Contextual internal links",
    internalLinksUsed >= requiredInternal || inventoryEmpty,
    internalLinksUsed >= requiredInternal || inventoryEmpty ? "info" : "warning",
    inventoryEmpty
      ? "No internal-link inventory available; skipped."
      : `${internalLinksUsed} internal link(s) used; ${requiredInternal} recommended.`,
  );

  // ── Entity consistency ──────────────────────────────────────────────────
  for (const entity of brief.entities) {
    const occurrences = normalize(bodyText).split(normalize(entity.name)).length - 1;
    const inTitle = normalize(title).includes(normalize(entity.name));
    add(
      "entity_consistency",
      `entity_${entity.name.toLowerCase().replace(/\s+/g, "_")}`,
      `Entity «${entity.name}»`,
      occurrences > 0 || inTitle || brief.entities.length === 0,
      occurrences > 0 || inTitle ? "info" : "warning",
      occurrences > 0 ? `${occurrences} occurrence(s).` : "Entity not mentioned in the article.",
    );
  }

  // ── Date consistency ────────────────────────────────────────────────────
  const bodyDates = extractDates(bodyText);
  const distinctDates = [...new Set(bodyDates.map((date) => normalizeDate(date)).filter((value): value is string => Boolean(value)))];
  const conflictingInBody = distinctDates.some((date) => date.split("-")[0] && years.length > 0 && !years.includes(date.split("-")[0]));
  add(
    "date_consistency",
    "date_consistency",
    "Date consistency",
    !conflictingInBody,
    conflictingInBody ? "error" : "info",
    conflictingInBody
      ? "Article dates conflict with the years mentioned in the article."
      : `Dates used: ${bodyDates.join(", ") || "none"}.`,
  );

  // ── Duplication ─────────────────────────────────────────────────────────
  const maxPageSimilarity = input.indexedPageTitles.reduce(
    (max, pageTitle) => Math.max(max, titleSimilarity(title, pageTitle)),
    0,
  );
  add(
    "duplication",
    "site_duplication",
    "No duplication with site content",
    maxPageSimilarity < 0.72,
    maxPageSimilarity < 0.72 ? "info" : "warning",
    maxPageSimilarity >= 0.72 ? `Title is ${Math.round(maxPageSimilarity * 100)}% similar to an existing indexed page.` : "No similar indexed page titles.",
  );

  // ── Source diversity ────────────────────────────────────────────────────
  const usedGroups = new Set(
    licenses
      .filter((license) => license.usage !== "forbidden")
      .flatMap((license) => license.sources.map((source) => source.group))
      .filter((group): group is string => Boolean(group)),
  );
  const diversityPass = NEWS_TYPES.has(brief.articleType) ? usedGroups.size >= 2 || licenses.length === 0 : usedGroups.size >= 1;
  add(
    "source_diversity",
    "source_diversity",
    "Source diversity",
    diversityPass,
    diversityPass ? "info" : "warning",
    `${usedGroups.size} distinct publisher group(s) behind the used facts.`,
  );

  // ── Aggregate ───────────────────────────────────────────────────────────
  const dimensionList: QaDimensionScore[] = (Object.keys(dimensions) as QaDimensionKey[]).map((key) => ({
    dimension: key,
    score: scoreOf(dimensions[key]),
    findings: dimensions[key].findings,
  }));

  const findings = dimensionList.flatMap((dimension) => dimension.findings);
  const errors = findings.filter((finding) => finding.severity === "error");
  const passed = errors.every((finding) => finding.passed);

  const weights: Record<QaDimensionKey, number> = {
    factual_grounding: 0.18,
    unsupported_claims: 0.18,
    attribution: 0.08,
    originality: 0.1,
    relevance: 0.06,
    completeness: 0.06,
    readability: 0.05,
    seo_quality: 0.08,
    internal_linking: 0.05,
    entity_consistency: 0.04,
    date_consistency: 0.06,
    duplication: 0.03,
    source_diversity: 0.03,
  };
  let weighted = 0;
  let weightTotal = 0;
  for (const dimension of dimensionList) {
    const weight = weights[dimension.dimension] ?? 0;
    weighted += dimension.score * weight;
    weightTotal += weight;
  }
  const score = weightTotal > 0 ? Math.round(weighted / weightTotal) : 0;

  return {
    score,
    passed,
    criticalUnsupportedClaims,
    dimensions: dimensionList,
    findings,
  };
}
