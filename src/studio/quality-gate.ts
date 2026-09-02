// Strict autonomous quality gate (Phase 6). AUTOPILOT publication requires a
// higher, configurable bar than ordinary manual QA. The gate evaluates the
// structured QA findings per group, applies configurable thresholds and adds
// hard safety gates (publishing contract, image readiness, placeholders,
// source grounding, cannibalization, destination fields). It never bypasses
// QA — it is stricter.

import type { AutomationPolicy } from "@prisma/client";
import type { QaReportV2 } from "./qa";

export type AutonomousGateConfig = {
  /** Weighted overall QA score (0..100). */
  overallQualityScore: number;
  structuralScore: number;
  editorialScore: number;
  seoScore: number;
  evidenceScore: number;
  /** Stricter overall threshold applied to high-value content types. */
  highValueOverallScore: number;
  /** Content types that demand the stricter threshold. */
  highValueContentTypes: string[];
  /** Max unresolved warnings allowed (per group) for autopilot. */
  maxWarnings: number;
  requireValidPublishContract: boolean;
  requireHeroImage: boolean;
  requireNoPlaceholders: boolean;
  requireValidHtml: boolean;
  requireSourceGroundingForFactual: boolean;
  requireNoCriticalCannibalization: boolean;
};

export const DEFAULT_AUTONOMOUS_GATE_CONFIG: AutonomousGateConfig = {
  overallQualityScore: 90,
  structuralScore: 90,
  editorialScore: 90,
  seoScore: 90,
  evidenceScore: 85,
  highValueOverallScore: 92,
  highValueContentTypes: [
    "evergreen-pillar",
    "evergreen_explainer",
    "transactional",
    "comparison",
    "commercial-investigation",
    "commercial_investigation",
    "guide",
  ],
  maxWarnings: 0,
  requireValidPublishContract: true,
  requireHeroImage: true,
  requireNoPlaceholders: true,
  requireValidHtml: true,
  requireSourceGroundingForFactual: true,
  requireNoCriticalCannibalization: true,
};

export function readGateConfig(policy: Pick<AutomationPolicy, "autonomousQaThresholds"> | null | undefined): AutonomousGateConfig {
  const raw = policy?.autonomousQaThresholds;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ...DEFAULT_AUTONOMOUS_GATE_CONFIG };
  }
  const value = raw as Record<string, unknown>;
  const num = (key: keyof AutonomousGateConfig, fallback: number) =>
    typeof value[key] === "number" && Number.isFinite(value[key]) ? (value[key] as number) : fallback;
  const bool = (key: keyof AutonomousGateConfig, fallback: boolean) =>
    typeof value[key] === "boolean" ? (value[key] as boolean) : fallback;
  const base = { ...DEFAULT_AUTONOMOUS_GATE_CONFIG };
  return {
    overallQualityScore: num("overallQualityScore", base.overallQualityScore),
    structuralScore: num("structuralScore", base.structuralScore),
    editorialScore: num("editorialScore", base.editorialScore),
    seoScore: num("seoScore", base.seoScore),
    evidenceScore: num("evidenceScore", base.evidenceScore),
    highValueOverallScore: num("highValueOverallScore", base.highValueOverallScore),
    highValueContentTypes: Array.isArray(value.highValueContentTypes)
      ? value.highValueContentTypes.map(String).filter(Boolean)
      : base.highValueContentTypes,
    maxWarnings: num("maxWarnings", base.maxWarnings),
    requireValidPublishContract: bool("requireValidPublishContract", base.requireValidPublishContract),
    requireHeroImage: bool("requireHeroImage", base.requireHeroImage),
    requireNoPlaceholders: bool("requireNoPlaceholders", base.requireNoPlaceholders),
    requireValidHtml: bool("requireValidHtml", base.requireValidHtml),
    requireSourceGroundingForFactual: bool("requireSourceGroundingForFactual", base.requireSourceGroundingForFactual),
    requireNoCriticalCannibalization: bool("requireNoCriticalCannibalization", base.requireNoCriticalCannibalization),
  };
}

// ────────────────────────────────────────────────────────────── Content-type awareness

export type WordBand = { min: number; softMax: number };

/**
 * Word-count expectations per content type. News can be concise but must
 * still carry genuine information and sourcing; evergreen/commercial pieces
 * must be materially deeper. Arbitrary one-size word targets are avoided.
 */
export function wordBandForContentType(contentType: string | null | undefined, intent?: string | null): WordBand {
  const type = (contentType ?? "").toLowerCase();
  switch (type) {
    case "breaking_news":
    case "standard_news":
    case "developing_story":
    case "news":
      return { min: 300, softMax: 1200 };
    case "sports-live":
    case "match-report":
      return { min: 300, softMax: 1000 };
    case "match-preview":
    case "preview":
    case "trailer_news":
      return { min: 350, softMax: 1100 };
    case "movie_announcement":
    case "casting_news":
    case "release_date_news":
    case "streaming_availability":
    case "tv_programming":
    case "entertainment":
      return { min: 400, softMax: 1400 };
    case "review_info":
    case "review":
      return { min: 600, softMax: 1800 };
    case "list_ranking":
    case "ranking":
    case "what_to_watch":
      return { min: 600, softMax: 1800 };
    case "transactional":
      return { min: 600, softMax: 1800 };
    case "comparison":
    case "commercial-investigation":
    case "commercial_investigation":
      return { min: 800, softMax: 2400 };
    case "guide":
    case "evergreen_explainer":
    case "evergreen-pillar":
    case "evergreen":
    default:
      if (intent === "news" || intent === "sports-live") {
        return { min: 300, softMax: 1200 };
      }
      return { min: 800, softMax: 2400 };
  }
}

/** Content types that depend on current facts and therefore need grounding. */
export function contentRequiresEvidence(contentType: string | null | undefined, intent?: string | null): boolean {
  const type = (contentType ?? "").toLowerCase();
  const factualTypes = new Set([
    "breaking_news",
    "standard_news",
    "developing_story",
    "news",
    "sports-live",
    "match-report",
    "match-preview",
    "preview",
    "movie_announcement",
    "casting_news",
    "release_date_news",
    "trailer_news",
    "streaming_availability",
    "tv_programming",
    "review_info",
    "review",
    "analysis",
  ]);
  return factualTypes.has(type) || intent === "news" || intent === "sports-live";
}

// ────────────────────────────────────────────────────────────── Gate evaluation

export type AutonomousGateInput = {
  version: {
    status: string;
    title: string | null;
    excerpt: string | null;
    bodyHtml: string | null;
    seoTitle: string | null;
    seoDescription: string | null;
  };
  qaReport: QaReportV2;
  /** Content-type / intent metadata from the project. */
  contentType?: string | null;
  intent?: string | null;
  /** True when the hero image is persisted and has a hero variant. */
  heroImageReady: boolean;
  /** Distinct source/publisher groups behind the version's facts. */
  sourceGroups: number;
  /** Cannibalization risk label, e.g. "none" | "high" | "medium" | "low". */
  cannibalizationRisk?: string | null;
  /** Internal link inventory size for the site (site intelligence). */
  internalLinkInventorySize?: number;
  /** Destination-specific required fields already validated by the QA checks. */
  destinationRequiredFieldsComplete?: boolean;
};

export type GateReport = {
  passed: boolean;
  overallScore: number;
  groupScores: Record<string, number>;
  thresholds: Record<string, number>;
  blockers: Array<{ key: string; message: string }>;
  warnings: string[];
  evidence: {
    contentType: string | null;
    intent: string | null;
    wordBand: WordBand;
    wordCount: number;
    requiresEvidence: boolean;
    sourceGroups: number;
    highValue: boolean;
  };
};

function countWordsFromHtml(value: string | null | undefined): number {
  const plain = String(value ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return plain ? plain.split(" ").length : 0;
}

/** Group score 0..100 computed from the weighted pass rate of that group's findings. */
export function groupScore(findings: QaReportV2["findings"], group: string): number {
  const members = findings.filter((finding) => finding.group === group);
  if (members.length === 0) {
    return 100;
  }
  const weightedPassed = members.reduce((sum, finding) => sum + (finding.passed ? (finding.severity === "error" ? 2 : 1) : 0), 0);
  const weightedTotal = members.reduce((sum, finding) => sum + (finding.severity === "error" ? 2 : 1), 0);
  return Math.round((weightedPassed / Math.max(1, weightedTotal)) * 100);
}

export function evaluateAutonomousGate(
  input: AutonomousGateInput,
  config: AutonomousGateConfig,
): GateReport {
  const blockers: GateReport["blockers"] = [];
  const warnings: string[] = [];
  const findings = input.qaReport?.findings ?? [];
  const errors = findings.filter((finding) => finding.severity === "error");
  const failedErrors = errors.filter((finding) => !finding.passed);
  const failedWarnings = findings.filter((finding) => finding.severity === "warning" && !finding.passed);

  const contentType = input.contentType ?? null;
  const intent = input.intent ?? null;
  const wordBand = wordBandForContentType(contentType, intent);
  const wordCount = countWordsFromHtml(input.version.bodyHtml);
  const highValue = config.highValueContentTypes.includes(contentType ?? "");
  const overallTarget = highValue ? config.highValueOverallScore : config.overallQualityScore;

  const groupScores = {
    structural: groupScore(findings, "structural"),
    editorial: groupScore(findings, "editorial"),
    seo: groupScore(findings, "seo"),
    evidence: groupScore(findings, "evidence"),
    publishing: groupScore(findings, "publishing"),
  };

  const overallScore = input.qaReport?.score ?? 0;

  // Hard safety gates.
  if (input.version.status !== "qa_passed") {
    blockers.push({ key: "version_status", message: "La versión debe haber superado el QA estructural antes de la validación autónoma." });
  }

  if (failedErrors.length > 0) {
    blockers.push({
      key: "blocking_errors",
      message: `${failedErrors.length} error(es) de QA sin resolver: ${failedErrors.map((finding) => finding.key).join(", ")}`,
    });
  }

  if (failedWarnings.length > config.maxWarnings) {
    blockers.push({
      key: "unresolved_warnings",
      message: `${failedWarnings.length} aviso(s) de alta prioridad sin resolver: ${failedWarnings.map((finding) => finding.key).join(", ")}`,
    });
  }

  if (overallScore < overallTarget) {
    blockers.push({ key: "overall_quality_score", message: `QA global ${overallScore} por debajo del umbral ${overallTarget}.` });
  }

  if (groupScores.structural < config.structuralScore) {
    blockers.push({ key: "structural_score", message: `QA estructural ${groupScores.structural} por debajo de ${config.structuralScore}.` });
  }
  if (groupScores.editorial < config.editorialScore) {
    blockers.push({ key: "editorial_score", message: `QA editorial ${groupScores.editorial} por debajo de ${config.editorialScore}.` });
  }
  if (groupScores.seo < config.seoScore) {
    blockers.push({ key: "seo_score", message: `QA SEO ${groupScores.seo} por debajo de ${config.seoScore}.` });
  }
  if (groupScores.evidence < config.evidenceScore) {
    blockers.push({ key: "evidence_score", message: `QA de evidencia ${groupScores.evidence} por debajo de ${config.evidenceScore}.` });
  }

  if (config.requireValidPublishContract) {
    const missing: string[] = [];
    if (!input.version.title?.trim()) missing.push("title");
    if (!input.version.bodyHtml?.trim()) missing.push("body");
    if (!input.version.seoTitle?.trim()) missing.push("seo_title");
    if (!input.version.seoDescription?.trim()) missing.push("seo_description");
    if (missing.length > 0) {
      blockers.push({ key: "publish_contract", message: `Campos obligatorios de publicación incompletos: ${missing.join(", ")}.` });
    }
  }

  if (config.requireHeroImage && !input.heroImageReady) {
    blockers.push({ key: "hero_image", message: "La imagen destacada no está generada, persistida y con variante hero." });
  }

  if (config.requireNoPlaceholders) {
    const placeholders = /lorem ipsum|\[insert|\bTODO\b|\bTBD\b|RELLENAR|XXXX{3,}/i.test(input.version.bodyHtml ?? "");
    if (placeholders) {
      blockers.push({ key: "placeholders", message: "El contenido contiene texto de marcador de posición." });
    }
  }

  if (config.requireValidHtml) {
    const html = input.version.bodyHtml ?? "";
    const hOpens = (html.match(/<h[1-4][^>]*>/gi) ?? []).length;
    const hCloses = (html.match(/<\/h[1-4]>/gi) ?? []).length;
    const pOpens = (html.match(/<p[^>]*>/gi) ?? []).length;
    const pCloses = (html.match(/<\/p>/gi) ?? []).length;
    if (hOpens !== hCloses || pOpens !== pCloses) {
      blockers.push({ key: "valid_html", message: "El HTML contiene etiquetas sin cerrar." });
    }
  }

  const requiresEvidence = contentRequiresEvidence(contentType, intent);
  if (config.requireSourceGroundingForFactual && requiresEvidence && input.sourceGroups < 1) {
    blockers.push({
      key: "source_grounding",
      message: "El contenido depende de datos actuales pero no tiene fuentes recuperadas (grounding).",
    });
  }

  if (config.requireNoCriticalCannibalization && input.cannibalizationRisk && input.cannibalizationRisk !== "none") {
    blockers.push({ key: "cannibalization", message: `Conflicto de canibalización detectado: ${input.cannibalizationRisk}.` });
  }

  if (requiresEvidence && input.sourceGroups === 0) {
    warnings.push("Se publicará contenido factual sin diversidad de fuentes externas.");
  }

  if (wordCount < wordBand.min) {
    blockers.push({
      key: "thin_content",
      message: `Contenido demasiado breve para el tipo "${contentType ?? "desconocido"}": ${wordCount} palabras (mínimo ${wordBand.min}).`,
    });
  }

  return {
    passed: blockers.length === 0,
    overallScore,
    groupScores,
    thresholds: {
      overall: overallTarget,
      structural: config.structuralScore,
      editorial: config.editorialScore,
      seo: config.seoScore,
      evidence: config.evidenceScore,
    },
    blockers,
    warnings,
    evidence: {
      contentType,
      intent,
      wordBand,
      wordCount,
      requiresEvidence,
      sourceGroups: input.sourceGroups,
      highValue,
    },
  };
}

/** Convenience wrapper that resolves the config from the policy row. */
export function runAutonomousGate(
  input: Omit<AutonomousGateInput, "config"> & { policy?: Pick<AutomationPolicy, "autonomousQaThresholds"> | null },
): GateReport {
  return evaluateAutonomousGate(input, readGateConfig(input.policy));
}
