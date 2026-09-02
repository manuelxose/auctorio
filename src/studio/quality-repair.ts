// Self-healing QA repair subsystem (Phase 6).
//
// Consumes the structured findings produced by the QA system and maps them to
// targeted repair strategies. It never blindly regenerates the full article
// for every failure: deterministic structural/SEO repairs are applied
// locally, content repairs are batched into a single targeted LLM pass, and
// image failures trigger the image pipeline retry. Citations, URLs, facts,
// internal links and sources are NEVER fabricated: internal links come from
// real site intelligence and external citations only from retrieved fact
// source URLs.

import type { AssetVariant, AutomationPolicy, ContentImage, ContentVersion } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { getPrismaClient } from "../infrastructure/db/prisma";
import { getTextProvider } from "../infrastructure/ai/text";
import { runVersionQaV2, type QaReportV2 } from "./qa";
import { evaluateAutonomousGate, readGateConfig } from "./quality-gate";
import { sanitizeEditorialHtml } from "./html-sanitizer";
import { suggestInternalLinks } from "./internal-linking";
import { retryImageGeneration } from "./orchestration";
import { notifyOperators } from "./notifications";
import { structuredEvent } from "../shared/utils/logger";
import type { AutomationMode } from "./automation-mode";

const prisma = getPrismaClient();

// ────────────────────────────────────────────────────────────── Domain types

export type RepairStrategyKind =
  | "title_rewrite"
  | "seo_title_rewrite"
  | "seo_description_rewrite"
  | "excerpt_generate"
  | "html_sanitize"
  | "structure_repair"
  | "word_count_adjust"
  | "intro_rewrite"
  | "keyword_title"
  | "generic_cleanup"
  | "paragraph_restructure"
  | "internal_links_insert"
  | "evidence_cite"
  | "image_alt_text"
  | "faq_generate"
  | "image_retry"
  | "publish_contract_repair";

export type RepairStrategy = {
  key: RepairStrategyKind;
  label: string;
  /** Whether this strategy changes article content (requires the LLM pass). */
  contentLevel: boolean;
};

export type UnrepairableFinding = {
  key: string;
  message: string;
};

export type QualityRepairPlan = {
  strategies: RepairStrategy[];
  unrepairable: UnrepairableFinding[];
  /** The failed QA findings that drove the plan. */
  failedFindings: Array<{ key: string; severity: string; group: string; message: string }>;
  /** True when the plan contains at least one executable strategy. */
  actionable: boolean;
};

// Finding key → strategy mapping. Every entry targets the exact defect.
const STRATEGY_MAP: Record<string, RepairStrategy> = {
  title_present: { key: "title_rewrite", label: "Reescribir el título", contentLevel: true },
  malformed_html: { key: "html_sanitize", label: "Reparar la estructura HTML", contentLevel: false },
  h2_present: { key: "structure_repair", label: "Añadir secciones H2 requeridas", contentLevel: true },
  heading_order: { key: "structure_repair", label: "Corregir el orden de encabezados", contentLevel: false },
  empty_headings: { key: "structure_repair", label: "Eliminar encabezados vacíos", contentLevel: false },
  paragraph_count: { key: "structure_repair", label: "Dividir en párrafos", contentLevel: true },
  seo_title: { key: "seo_title_rewrite", label: "Reescribir solo el SEO title", contentLevel: false },
  seo_description: { key: "seo_description_rewrite", label: "Reescribir solo la meta description", contentLevel: false },
  word_count: { key: "word_count_adjust", label: "Ajustar la extensión al rango del tipo de contenido", contentLevel: true },
  keyword_in_title: { key: "keyword_title", label: "Revisar el título para incluir la keyword de forma natural", contentLevel: true },
  keyword_in_intro: { key: "intro_rewrite", label: "Mejorar la introducción con la keyword", contentLevel: true },
  keyword_in_headings: { key: "structure_repair", label: "Mejorar la semántica de los encabezados", contentLevel: true },
  internal_links: { key: "internal_links_insert", label: "Insertar enlaces internos reales del inventario", contentLevel: false },
  evidence_links: { key: "evidence_cite", label: "Citar fuentes externas verificables", contentLevel: true },
  evidence_grounding: { key: "evidence_cite", label: "Mejorar el grounding factual con evidencia recuperada", contentLevel: true },
  image_alt: { key: "image_alt_text", label: "Añadir texto alternativo descriptivo", contentLevel: false },
  faq_section: { key: "faq_generate", label: "Generar FAQ útil según la intención", contentLevel: true },
  intro_quality: { key: "intro_rewrite", label: "Reescribir la introducción", contentLevel: true },
  no_generic_phrases: { key: "generic_cleanup", label: "Eliminar frases genéricas de IA", contentLevel: true },
  excerpt_present: { key: "excerpt_generate", label: "Generar el extracto", contentLevel: false },
  readable_paragraphs: { key: "paragraph_restructure", label: "Reestructurar párrafos largos", contentLevel: false },
  image_ready: { key: "image_retry", label: "Reintentar el pipeline de imagen", contentLevel: false },
  publish_contract: { key: "publish_contract_repair", label: "Completar campos obligatorios de publicación", contentLevel: false },
  no_placeholders: { key: "generic_cleanup", label: "Sustituir marcadores de posición", contentLevel: true },
};

/** Findings that cannot be repaired by a targeted strategy and need regeneration. */
const UNREPAIRABLE_KEYS = new Set(["body_exists", "cannibalization", "version_missing"]);

export function buildRepairPlan(qaReport: QaReportV2): QualityRepairPlan {
  const failedFindings = (qaReport?.findings ?? [])
    .filter((finding) => !finding.passed && (finding.severity === "error" || finding.severity === "warning"))
    .map((finding) => ({
      key: finding.key,
      severity: finding.severity,
      group: finding.group,
      message: finding.message,
    }));

  const strategies: RepairStrategy[] = [];
  const unrepairable: UnrepairableFinding[] = [];
  const seen = new Set<RepairStrategyKind>();

  for (const finding of failedFindings) {
    if (UNREPAIRABLE_KEYS.has(finding.key)) {
      unrepairable.push({ key: finding.key, message: finding.message });
      continue;
    }
    const strategy = STRATEGY_MAP[finding.key];
    if (!strategy) {
      unrepairable.push({ key: finding.key, message: finding.message });
      continue;
    }
    if (!seen.has(strategy.key)) {
      seen.add(strategy.key);
      strategies.push(strategy);
    }
  }

  return { strategies, unrepairable, failedFindings, actionable: strategies.length > 0 };
}

// ────────────────────────────────────────────────────────────── Repair provider seam

export type RepairProviderInput = {
  instruction: string;
  current: {
    title: string;
    html: string;
    seoTitle: string;
    seoDescription: string;
    excerpt: string;
  };
  facts: string[];
  allowedSourceUrls: string[];
  siteName: string;
  targetWords?: { min: number; max: number };
};

export type RepairProviderResult = {
  title?: string;
  html?: string;
  seoTitle?: string;
  seoDescription?: string;
  excerpt?: string;
  provider?: string;
  model?: string;
  costUsd?: number;
};

export type RepairProvider = {
  repair(input: RepairProviderInput): Promise<RepairProviderResult>;
};

function extractJsonObject(text: string): Record<string, unknown> | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1] ?? text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    return null;
  }
  try {
    const parsed = JSON.parse(candidate.slice(start, end + 1)) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * Default provider: one targeted LLM pass with a strict JSON contract. The
 * system prompt forbids inventing facts, URLs or sources; the model may only
 * cite URLs present in the allowed list.
 */
export function createDefaultRepairProvider(): RepairProvider {
  const provider = getTextProvider();
  return {
    async repair(input: RepairProviderInput): Promise<RepairProviderResult> {
      const systemPrompt = [
        "Eres un editor corrector de un medio digital. Repara ÚNICAMENTE lo que pide la instrucción.",
        "Reglas estrictas:",
        "- NO inventes hechos, datos, nombres, fechas ni cifras que no estén en el texto o en las fuentes proporcionadas.",
        "- Para citar fuentes externas SOLO puedes usar URLs de la lista de fuentes permitidas. Nunca crees URLs.",
        "- No añadas enlaces internos inventados.",
        "- Conserva el idioma, el tono y la estructura general del artículo.",
        "- El HTML de salida debe estar bien formado (todas las etiquetas cerradas).",
        "- Responde SIEMPRE con un objeto JSON con las claves que necesites cambiar, p.ej. {\"title\":\"...\",\"html\":\"...\",\"seoTitle\":\"...\",\"seoDescription\":\"...\",\"excerpt\":\"...\"}.",
      ].join("\n");

      const userPrompt = [
        `Sitio: ${input.siteName}`,
        "",
        "Instrucción de reparación:",
        input.instruction,
        "",
        ...(input.targetWords ? [`Extensión objetivo: entre ${input.targetWords.min} y ${input.targetWords.max} palabras.`] : []),
        "",
        "Fuentes permitidas para citar (URLs reales recuperadas):",
        ...(input.allowedSourceUrls.length > 0 ? input.allowedSourceUrls.map((url) => `- ${url}`) : ["(ninguna — no cites URLs)"]),
        "",
        "Hechos recuperados (puedes usarlos para grounding, sin inventar nada más):",
        ...(input.facts.length > 0 ? input.facts.map((fact) => `- ${fact}`) : ["(sin hechos adicionales)"]),
        "",
        "Estado actual:",
        `Título: ${input.current.title}`,
        `SEO title: ${input.current.seoTitle}`,
        `Meta description: ${input.current.seoDescription}`,
        `Extracto: ${input.current.excerpt}`,
        "",
        "HTML del artículo:",
        input.current.html.slice(0, 24_000),
      ].join("\n");

      const result = await provider.generate({
        prompt: userPrompt,
        systemPrompt,
        maxTokens: 6000,
      });

      const parsed = extractJsonObject(result.output);
      const asString = (value: unknown): string | undefined =>
        typeof value === "string" && value.trim() ? value.trim() : undefined;

      return {
        title: parsed ? asString(parsed.title) : undefined,
        html: parsed ? asString(parsed.html) : undefined,
        seoTitle: parsed ? asString(parsed.seoTitle) : undefined,
        seoDescription: parsed ? asString(parsed.seoDescription) : undefined,
        excerpt: parsed ? asString(parsed.excerpt) : undefined,
        provider: result.provider,
        model: result.model,
        costUsd: 0,
      };
    },
  };
}

// ────────────────────────────────────────────────────────────── Deterministic repairs

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, Math.max(0, max - 1)).trim()}…`;
}

function stripHtml(value: string): string {
  return value.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

function splitLongParagraphs(html: string, maxWords = 120): string {
  return html.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, (match, inner: string) => {
    const text = stripHtml(inner);
    const words = text.split(/\s+/).filter(Boolean);
    if (words.length <= maxWords) {
      return match;
    }
    // Split the raw inner text at sentence boundaries.
    const sentences = inner.match(/[^.!?…]+[.!?…]+["»)]?\s*|[^.!?…]+$/g) ?? [inner];
    const chunks: string[] = [];
    let buffer = "";
    let bufferWords = 0;
    for (const sentence of sentences) {
      const sentenceWords = stripHtml(sentence).split(/\s+/).filter(Boolean).length;
      if (bufferWords + sentenceWords > maxWords && buffer) {
        chunks.push(buffer.trim());
        buffer = sentence;
        bufferWords = sentenceWords;
      } else {
        buffer += sentence;
        bufferWords += sentenceWords;
      }
    }
    if (buffer.trim()) {
      chunks.push(buffer.trim());
    }
    return chunks.map((chunk) => `<p>${chunk}</p>`).join("\n");
  });
}

function addImageAltText(html: string, fallback: string): string {
  const alt = fallback.replace(/["<>]/g, "").slice(0, 120) || "Imagen destacada";
  return html.replace(/<img([^>]*?)>/gi, (match, attrs: string) => {
    if (/alt=["'][^"']*["']/i.test(attrs)) {
      return match;
    }
    return `<img${attrs} alt="${alt}">`;
  });
}

function fitSeoTitle(title: string, keyword: string | null): string {
  let value = title.trim();
  if (keyword && !value.toLowerCase().includes(keyword.toLowerCase())) {
    value = truncate(`${value} — ${keyword}`, 70);
  }
  while (value.length < 35 && value.length > 0) {
    value = truncate(`${value} | Guía y novedades`, 70);
  }
  return truncate(value, 70);
}

function fitSeoDescription(excerpt: string, bodyText: string): string {
  let value = (excerpt || bodyText).trim();
  if (value.length < 110) {
    value = `${value} Información actualizada, útil y verificada para lectores interesados en el tema.`;
  }
  return truncate(value, 165);
}

function countWords(html: string): number {
  return stripHtml(html).split(/\s+/).filter(Boolean).length;
}

// ────────────────────────────────────────────────────────────── Repair application

export type RepairApplicationInput = {
  tenantId: string;
  siteId: string | null;
  version: {
    id: string;
    title: string;
    excerpt: string;
    bodyHtml: string;
    seoTitle: string;
    seoDescription: string;
    contentImageId: string | null;
  };
  image: ContentImage | null;
  plan: QualityRepairPlan;
  provider: RepairProvider;
  context: {
    primaryKeyword?: string | null;
    intent?: string | null;
    contentType?: string | null;
    targetWords?: { min: number; max: number };
    facts: string[];
    allowedSourceUrls: string[];
    siteName: string;
  };
};

export type RepairApplicationResult = {
  title: string;
  excerpt: string;
  bodyHtml: string;
  seoTitle: string;
  seoDescription: string;
  changedFields: string[];
  appliedStrategies: string[];
  failedStrategies: string[];
  provider?: string;
  model?: string;
  costUsd?: number;
  imageRetried: boolean;
};

function strategySet(plan: QualityRepairPlan): Set<RepairStrategyKind> {
  return new Set(plan.strategies.map((strategy) => strategy.key));
}

function contentStrategyCount(plan: QualityRepairPlan): number {
  return plan.strategies.filter((strategy) => strategy.contentLevel).length;
}

function buildRepairInstruction(plan: QualityRepairPlan, context: RepairApplicationInput["context"]): string {
  const parts = plan.strategies
    .filter((strategy) => strategy.contentLevel)
    .map((strategy) => {
      switch (strategy.key) {
        case "title_rewrite":
          return "- Reescribe el título para que sea claro, atractivo y tenga al menos 20 caracteres.";
        case "structure_repair":
          return "- Asegura una estructura de encabezados correcta (H2→H3 sin saltos), sin encabezados vacíos y con las secciones H2 que el tipo de contenido requiere.";
        case "word_count_adjust":
          return context.targetWords
            ? `- Ajusta la extensión del artículo hasta situarla entre ${context.targetWords.min} y ${context.targetWords.max} palabras (actualmente tiene ${0}). Amplía con información útil de los hechos recuperados o condensa sin perder sustancia.`
            : "- Ajusta la extensión al estándar del tipo de contenido.";
        case "intro_rewrite":
          return context.primaryKeyword
            ? `- Reescribe la introducción para que sea sustancial (≥30 palabras) e incorpore de forma natural la keyword "${context.primaryKeyword}".`
            : "- Reescribe la introducción para que sea sustancial (≥30 palabras) y presente el tema.";
        case "keyword_title":
          return context.primaryKeyword
            ? `- Revisa el título para incluir la keyword "${context.primaryKeyword}" de forma natural y semánticamente apropiada (sin keyword stuffing).`
            : "- Mejora la relevancia semántica del título.";
        case "generic_cleanup":
          return "- Elimina frases genéricas de IA y cualquier marcador de posición; sustituye por contenido concreto y útil.";
        case "evidence_cite":
          return "- Añade atribución factual: cita ÚNICAMENTE fuentes de la lista de fuentes permitidas con enlaces reales, allí donde el texto afirme datos actuales.";
        case "faq_generate":
          return "- Añade una sección de preguntas frecuentes breve y útil según la intención de búsqueda (solo si aporta valor real).";
        default:
          return null;
      }
    })
    .filter((part): part is string => Boolean(part));

  if (parts.length === 0) {
    return "Aplica las correcciones editoriales necesarias para superar el QA manteniendo la exactitud factual.";
  }
  return parts.join("\n");
}

/** Strip any external citation the model invented that is not in the allowlist. */
function enforceCitationAllowlist(html: string, allowed: Set<string>): string {
  return html.replace(/<a[^>]+href=["']([^"']+)["'][^>]*>/gi, (match, href: string) => {
    if (!/^https?:\/\//i.test(href)) {
      return match;
    }
    return allowed.has(href) ? match : match.replace(/<a[^>]*>/i, "<span>").replace("</a>", "</span>");
  });
}

export async function applyRepairPlan(input: RepairApplicationInput): Promise<RepairApplicationResult> {
  const changedFields = new Set<string>();
  const applied: string[] = [];
  const failed: string[] = [];
  const strategies = strategySet(input.plan);

  let title = input.version.title;
  let excerpt = input.version.excerpt;
  let bodyHtml = input.version.bodyHtml;
  let seoTitle = input.version.seoTitle;
  let seoDescription = input.version.seoDescription;
  let imageRetried = false;

  // 1. Deterministic local repairs (no LLM).
  if (strategies.has("html_sanitize") || strategies.has("paragraph_restructure") || strategies.has("image_alt_text")) {
    let html = sanitizeEditorialHtml(bodyHtml);
    if (strategies.has("paragraph_restructure")) {
      html = splitLongParagraphs(html);
    }
    if (strategies.has("image_alt_text")) {
      html = addImageAltText(html, title);
    }
    if (html !== bodyHtml) {
      bodyHtml = html;
      changedFields.add("bodyHtml");
      applied.push("html_sanitize", "paragraph_restructure", "image_alt_text");
    }
  }

  if (strategies.has("seo_title_rewrite") && seoTitle.trim().length < 35) {
    const next = fitSeoTitle(title, input.context.primaryKeyword ?? null);
    if (next !== seoTitle) {
      seoTitle = next;
      changedFields.add("seoTitle");
      applied.push("seo_title_rewrite");
    }
  }

  if (strategies.has("seo_description_rewrite") || (strategies.has("publish_contract_repair") && !seoDescription.trim())) {
    const bodyText = stripHtml(bodyHtml);
    const next = fitSeoDescription(excerpt, bodyText);
    if (next !== seoDescription) {
      seoDescription = next;
      changedFields.add("seoDescription");
      applied.push("seo_description_rewrite");
    }
  }

  if (strategies.has("excerpt_generate") && excerpt.length < 80) {
    const next = truncate(stripHtml(bodyHtml), 220);
    if (next !== excerpt) {
      excerpt = next;
      changedFields.add("excerpt");
      applied.push("excerpt_generate");
    }
  }

  if (strategies.has("publish_contract_repair")) {
    if (!title.trim()) {
      title = truncate(stripHtml(bodyHtml).split(/[.!?\n]/)[0] || "Artículo", 70);
      changedFields.add("title");
      applied.push("publish_contract_repair");
    }
    if (!seoTitle.trim()) {
      seoTitle = fitSeoTitle(title, input.context.primaryKeyword ?? null);
      changedFields.add("seoTitle");
    }
    if (!seoDescription.trim()) {
      seoDescription = fitSeoDescription(excerpt, stripHtml(bodyHtml));
      changedFields.add("seoDescription");
    }
  }

  // 2. Internal links from REAL site intelligence (never invented).
  if (strategies.has("internal_links_insert") && input.siteId) {
    try {
      const links = await suggestInternalLinks(input.tenantId, input.siteId, {
        keyword: input.context.primaryKeyword,
        topic: title,
        limit: 2,
      });
      const existing = new Set([...bodyHtml.matchAll(/<a[^>]+href=["']([^"']+)["']/gi)].map((match) => match[1]));
      const usable = links.filter((link) => !existing.has(link.url)).slice(0, 2);
      if (usable.length > 0) {
        const anchors = usable
          .map((link) => `<a href="${link.url}">${link.anchor.replace(/["<>]/g, "")}</a>`)
          .join(" · ");
        const paragraph = `<p><strong>Relacionado:</strong> ${anchors}</p>`;
        if (!bodyHtml.includes(anchors.split(" · ")[0] ?? "")) {
          bodyHtml = bodyHtml.trimEnd() + "\n" + paragraph;
          changedFields.add("bodyHtml");
          applied.push("internal_links_insert");
        }
      } else {
        failed.push("internal_links_insert");
      }
    } catch {
      failed.push("internal_links_insert");
    }
  }

  // 3. Image retry path (separate retry before human escalation).
  if (strategies.has("image_retry") && input.version.contentImageId) {
    try {
      await retryImageGeneration(input.tenantId, input.version.contentImageId);
      imageRetried = true;
      applied.push("image_retry");
    } catch {
      failed.push("image_retry");
    }
  }

  // 4. One targeted LLM pass for all content-level strategies.
  if (contentStrategyCount(input.plan) > 0) {
    try {
      const instruction = buildRepairInstruction(input.plan, input.context);
      const result = await input.provider.repair({
        instruction,
        current: { title, html: bodyHtml, seoTitle, seoDescription, excerpt },
        facts: input.context.facts,
        allowedSourceUrls: input.context.allowedSourceUrls,
        siteName: input.context.siteName,
        targetWords: input.context.targetWords,
      });

      if (result.html && result.html !== bodyHtml) {
        bodyHtml = sanitizeEditorialHtml(result.html);
        changedFields.add("bodyHtml");
      }
      if (result.title && result.title !== title) {
        title = truncate(result.title, 200);
        changedFields.add("title");
      }
      if (result.seoTitle && result.seoTitle !== seoTitle) {
        seoTitle = truncate(result.seoTitle, 160);
        changedFields.add("seoTitle");
      }
      if (result.seoDescription && result.seoDescription !== seoDescription) {
        seoDescription = truncate(result.seoDescription, 320);
        changedFields.add("seoDescription");
      }
      if (result.excerpt && result.excerpt !== excerpt) {
        excerpt = truncate(result.excerpt, 500);
        changedFields.add("excerpt");
      }

      const allowed = new Set(input.context.allowedSourceUrls);
      const enforced = enforceCitationAllowlist(bodyHtml, allowed);
      if (enforced !== bodyHtml) {
        bodyHtml = enforced;
        changedFields.add("bodyHtml");
      }

      for (const strategy of input.plan.strategies.filter((entry) => entry.contentLevel)) {
        applied.push(strategy.key);
      }
      return {
        title,
        excerpt,
        bodyHtml,
        seoTitle,
        seoDescription,
        changedFields: [...changedFields],
        appliedStrategies: [...new Set(applied)],
        failedStrategies: failed,
        provider: result.provider,
        model: result.model,
        costUsd: result.costUsd,
        imageRetried,
      };
    } catch (error) {
      failed.push("llm_repair");
      structuredEvent("quality_repair.provider_failed", { error: error instanceof Error ? error.message : String(error) }, "error");
    }
  }

  return {
    title,
    excerpt,
    bodyHtml,
    seoTitle,
    seoDescription,
    changedFields: [...changedFields],
    appliedStrategies: [...new Set(applied)],
    failedStrategies: failed,
    imageRetried,
  };
}

// ────────────────────────────────────────────────────────────── Repair cycle

export type RepairCycleDeps = {
  provider?: RepairProvider;
  now?: () => Date;
};

export type RepairCycleOutcome = {
  outcome: "gate_passed" | "repairing" | "intervention_required" | "locked" | "not_eligible" | "not_configured";
  versionId: string | null;
  attemptsUsed: number;
  maxAttempts: number;
  scoreBefore: number | null;
  scoreAfter: number | null;
  blockers: Array<{ key: string; message: string }>;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function readNumber(value: unknown, key: string): number | null {
  const entry = asRecord(value)[key];
  return typeof entry === "number" && Number.isFinite(entry) ? entry : null;
}

function readString(value: unknown, key: string): string | null {
  const entry = asRecord(value)[key];
  return typeof entry === "string" && entry.trim() ? entry.trim() : null;
}

export type VersionWithContext = ContentVersion & {
  project: {
    id: string;
    siteId: string;
    title: string;
    metadata: unknown;
    automationMode: string | null;
    site: { name: string; type: string };
    topic: { id: string } | null;
  };
  contentImage: (ContentImage & { assetVariants: AssetVariant[] }) | null;
};

/**
 * One bounded repair cycle for a project version.
 *
 * Guarded against concurrent ticks: the version row is claimed with a short
 * lock (`repair_locked_until`); another tick observing the lock skips. The
 * loop terminates immediately when the autonomous quality gate passes and
 * never exceeds `maxRepairAttempts`.
 */
export async function runQualityRepairCycle(
  tenantId: string,
  projectId: string,
  policy: Pick<AutomationPolicy, "autoRepair" | "maxRepairAttempts" | "autonomousQaThresholds">,
  deps: RepairCycleDeps = {},
): Promise<RepairCycleOutcome> {
  if (!policy.autoRepair) {
    return { outcome: "not_configured", versionId: null, attemptsUsed: 0, maxAttempts: 0, scoreBefore: null, scoreAfter: null, blockers: [] };
  }

  const now = deps.now?.() ?? new Date();
  const maxAttempts = Math.max(0, policy.maxRepairAttempts);
  const provider = deps.provider ?? createDefaultRepairProvider();

  const version = await prisma.contentVersion.findFirst({
    where: { tenantId, projectId },
    orderBy: { versionNumber: "desc" },
    include: {
      project: {
        include: { site: true, topic: true },
      },
      contentImage: { include: { assetVariants: true } },
    },
  });

  if (!version) {
    return { outcome: "not_eligible", versionId: null, attemptsUsed: 0, maxAttempts, scoreBefore: null, scoreAfter: null, blockers: [] };
  }

  // Gate check: nothing to repair when the autonomous gate already passes.
  const gateContext = await buildGateContext(tenantId, version);
  const qaReport = normalizeStoredQaReport(version.qaReport);
  const gate = evaluateAutonomousGate(
    {
      version: {
        status: version.status,
        title: version.title,
        excerpt: version.excerpt,
        bodyHtml: version.bodyHtml,
        seoTitle: version.seoTitle,
        seoDescription: version.seoDescription,
      },
      qaReport,
      contentType: gateContext.contentType,
      intent: gateContext.intent,
      heroImageReady: gateContext.heroImageReady,
      sourceGroups: gateContext.sourceGroups,
      cannibalizationRisk: gateContext.cannibalizationRisk,
    },
    readGateConfig(policy),
  );
  if (gate.passed) {
    return { outcome: "gate_passed", versionId: version.id, attemptsUsed: version.repairAttempts, maxAttempts, scoreBefore: qaReport.score, scoreAfter: qaReport.score, blockers: [] };
  }

  if (version.repairAttempts >= maxAttempts) {
    await markInterventionRequired(tenantId, projectId, version.id, gate.blockers);
    return {
      outcome: "intervention_required",
      versionId: version.id,
      attemptsUsed: version.repairAttempts,
      maxAttempts,
      scoreBefore: qaReport.score,
      scoreAfter: qaReport.score,
      blockers: gate.blockers,
    };
  }

  // Concurrency guard: claim the repair slot with a short lock.
  const lockUntil = new Date(now.getTime() + 5 * 60_000);
  const claimed = await prisma.contentVersion.updateMany({
    where: {
      id: version.id,
      OR: [{ repairLockedUntil: null }, { repairLockedUntil: { lt: now } }],
    },
    data: { repairLockedUntil: lockUntil },
  });
  if (claimed.count === 0) {
    return { outcome: "locked", versionId: version.id, attemptsUsed: version.repairAttempts, maxAttempts, scoreBefore: qaReport.score, scoreAfter: qaReport.score, blockers: gate.blockers };
  }

  const attemptNumber = version.repairAttempts + 1;
  const attempt = await prisma.qualityRepairAttempt.create({
    data: {
      tenantId,
      projectId,
      versionId: version.id,
      attemptNumber,
      status: "running",
      findingsSnapshot: (qaReport.findings ?? []) as unknown as Prisma.InputJsonValue,
      strategies: JSON.parse(JSON.stringify(buildRepairPlan(qaReport).strategies)) as unknown as Prisma.InputJsonValue,
      qaScoreBefore: qaReport.score,
      startedAt: now,
    },
  });

  try {
    const plan = buildRepairPlan(qaReport);
    if (!plan.actionable && plan.failedFindings.length > 0) {
      await prisma.qualityRepairAttempt.update({
        where: { id: attempt.id },
        data: { status: "failed", error: "no_actionable_strategies", finishedAt: new Date() },
      });
      await markInterventionRequired(tenantId, projectId, version.id, gate.blockers);
      await prisma.contentVersion.update({
        where: { id: version.id },
        data: { repairLockedUntil: null, repairAttempts: { increment: 1 } },
      });
      return {
        outcome: "intervention_required",
        versionId: version.id,
        attemptsUsed: attemptNumber,
        maxAttempts,
        scoreBefore: qaReport.score,
        scoreAfter: qaReport.score,
        blockers: gate.blockers,
      };
    }

    const projectMetadata = asRecord(version.project.metadata);
    const facts = await prisma.fact.findMany({
      where: { tenantId, topicId: version.project.topic?.id ?? undefined },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    const applied = await applyRepairPlan({
      tenantId,
      siteId: version.project.siteId,
      version: {
        id: version.id,
        title: version.title ?? "",
        excerpt: version.excerpt ?? "",
        bodyHtml: version.bodyHtml ?? "",
        seoTitle: version.seoTitle ?? "",
        seoDescription: version.seoDescription ?? "",
        contentImageId: version.contentImageId,
      },
      image: version.contentImage,
      plan,
      provider,
      context: {
        primaryKeyword: readString(projectMetadata, "primaryKeyword"),
        intent: readString(projectMetadata, "primaryIntent"),
        contentType: readString(projectMetadata, "contentType"),
        targetWords: gateContext.targetWords,
        facts: facts.map((fact) => fact.content).slice(0, 12),
        allowedSourceUrls: facts.map((fact) => fact.sourceRef).filter((url): url is string => Boolean(url && /^https?:\/\//i.test(url))).slice(0, 8),
        siteName: version.project.site.name,
      },
    });

    // Persist repaired fields on the same version (status stays qa_failed until QA reruns).
    await prisma.contentVersion.update({
      where: { id: version.id },
      data: {
        title: applied.title,
        excerpt: applied.excerpt,
        bodyHtml: sanitizeEditorialHtml(applied.bodyHtml),
        seoTitle: applied.seoTitle,
        seoDescription: applied.seoDescription,
        repairAttempts: { increment: 1 },
      },
    });

    // Rerun QA with the same contextual inputs used by the main pipeline.
    const freshVersion = await prisma.contentVersion.findUniqueOrThrow({ where: { id: version.id } });
    const freshQa = runVersionQaV2(
      {
        title: freshVersion.title,
        excerpt: freshVersion.excerpt,
        bodyHtml: freshVersion.bodyHtml,
        seoTitle: freshVersion.seoTitle,
        seoDescription: freshVersion.seoDescription,
      },
      {
        imageReady: gateContext.heroImageReady,
        metadata: projectMetadata,
        siteType: version.project.site.type,
        recommendedWordCountMin: readNumber(projectMetadata, "recommendedWordCountMin"),
        recommendedWordCountMax: readNumber(projectMetadata, "recommendedWordCountMax"),
        cannibalizationRisk: readString(projectMetadata, "cannibalizationRisk"),
      },
    );
    await prisma.contentVersion.update({
      where: { id: version.id },
      data: {
        status: freshQa.passed ? "qa_passed" : "qa_failed",
        qaReport: freshQa as unknown as Prisma.InputJsonObject,
        repairLockedUntil: null,
      },
    });

    const freshGate = evaluateAutonomousGate(
      {
        version: {
          status: freshQa.passed ? "qa_passed" : "qa_failed",
          title: freshVersion.title,
          excerpt: freshVersion.excerpt,
          bodyHtml: freshVersion.bodyHtml,
          seoTitle: freshVersion.seoTitle,
          seoDescription: freshVersion.seoDescription,
        },
        qaReport: freshQa,
        contentType: gateContext.contentType,
        intent: gateContext.intent,
        heroImageReady: gateContext.heroImageReady,
        sourceGroups: gateContext.sourceGroups,
        cannibalizationRisk: gateContext.cannibalizationRisk,
      },
      readGateConfig(policy),
    );

    await prisma.qualityRepairAttempt.update({
      where: { id: attempt.id },
      data: {
        status: freshGate.passed ? "succeeded" : "failed",
        changedFields: applied.changedFields as unknown as Prisma.InputJsonValue,
        qaScoreAfter: freshQa.score,
        remainingBlockers: freshGate.blockers as unknown as Prisma.InputJsonValue,
        provider: applied.provider ?? null,
        model: applied.model ?? null,
        costUsd: applied.costUsd ?? null,
        finishedAt: new Date(),
      },
    });

    await prisma.contentProject.update({
      where: { id: projectId },
      data: {
        status: freshQa.passed ? "in_review" : "qa_failed",
        automationSubstate: freshQa.passed ? "qa_passed" : "qa_repairing",
      },
    });

    if (freshGate.passed) {
      return {
        outcome: "gate_passed",
        versionId: version.id,
        attemptsUsed: attemptNumber,
        maxAttempts,
        scoreBefore: qaReport.score,
        scoreAfter: freshQa.score,
        blockers: [],
      };
    }

    if (freshVersion.repairAttempts >= maxAttempts) {
      await markInterventionRequired(tenantId, projectId, version.id, freshGate.blockers);
      return {
        outcome: "intervention_required",
        versionId: version.id,
        attemptsUsed: attemptNumber,
        maxAttempts,
        scoreBefore: qaReport.score,
        scoreAfter: freshQa.score,
        blockers: freshGate.blockers,
      };
    }

    return {
      outcome: "repairing",
      versionId: version.id,
      attemptsUsed: attemptNumber,
      maxAttempts,
      scoreBefore: qaReport.score,
      scoreAfter: freshQa.score,
      blockers: freshGate.blockers,
    };
  } catch (error) {
    await prisma.qualityRepairAttempt.update({
      where: { id: attempt.id },
      data: {
        status: "failed",
        error: error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500),
        finishedAt: new Date(),
      },
    });
    await prisma.contentVersion.update({
      where: { id: version.id },
      data: { repairLockedUntil: null, repairAttempts: { increment: 1 } },
    });
    structuredEvent("quality_repair.cycle_failed", { projectId, versionId: version.id, error: error instanceof Error ? error.message : String(error) }, "error");
    return {
      outcome: "repairing",
      versionId: version.id,
      attemptsUsed: attemptNumber,
      maxAttempts,
      scoreBefore: qaReport.score,
      scoreAfter: null,
      blockers: gate.blockers,
    };
  }
}

// ────────────────────────────────────────────────────────────── Gate context

export function normalizeStoredQaReport(value: unknown): QaReportV2 {
  if (value && typeof value === "object") {
    const candidate = value as { passed?: unknown; score?: unknown; checks?: unknown; findings?: unknown };
    if (typeof candidate.passed === "boolean" && typeof candidate.score === "number") {
      return {
        passed: candidate.passed,
        score: candidate.score,
        checks: Array.isArray(candidate.checks)
          ? (candidate.checks as QaReportV2["checks"])
          : [],
        findings: Array.isArray(candidate.findings)
          ? (candidate.findings as QaReportV2["findings"])
          : [],
      };
    }
  }
  return { passed: false, score: 0, checks: [], findings: [] };
}

async function buildGateContext(tenantId: string, version: VersionWithContext) {
  const projectMetadata = asRecord(version.project.metadata);
  const contentType = readString(projectMetadata, "contentType") ?? readString(projectMetadata, "articleType");
  const intent = readString(projectMetadata, "primaryIntent") ?? readString(projectMetadata, "searchIntent");
  const heroImageReady = Boolean(
    version.contentImage &&
      version.contentImage.status === "done" &&
      version.contentImage.storagePath &&
      version.contentImage.assetVariants.some((variant) => variant.kind === "hero"),
  );
  const factRows = version.project.topic
    ? await prisma.fact.findMany({
        where: { tenantId, topicId: version.project.topic.id },
        select: { sourceRef: true },
        take: 50,
      })
    : [];
  const sourceGroups = new Set(
    factRows
      .map((fact) => fact.sourceRef)
      .filter((url): url is string => Boolean(url))
      .map((url) => {
        try {
          return new URL(url).hostname;
        } catch {
          return url;
        }
      }),
  ).size;

  const recommendedMin = readNumber(projectMetadata, "recommendedWordCountMin");
  const recommendedMax = readNumber(projectMetadata, "recommendedWordCountMax");

  return {
    contentType,
    intent,
    heroImageReady,
    sourceGroups,
    cannibalizationRisk: readString(projectMetadata, "cannibalizationRisk"),
    targetWords: recommendedMin && recommendedMax ? { min: recommendedMin, max: recommendedMax } : undefined,
  };
}

async function markInterventionRequired(
  tenantId: string,
  projectId: string,
  versionId: string,
  blockers: Array<{ key: string; message: string }>,
) {
  await prisma.contentProject.update({
    where: { id: projectId },
    data: { automationSubstate: "intervention_required" },
  });
  await notifyOperators([tenantId], {
    category: "operations",
    severity: "error",
    title: "Autopilot: el artículo no pudo repararse automáticamente",
    message: `El proyecto ${projectId} (versión ${versionId}) agotó los intentos de reparación. Bloqueadores: ${blockers.map((blocker) => blocker.key).join(", ") || "ninguno registrado"}`,
    entityType: "content_project",
    entityId: projectId,
    actionUrl: `/studio/content/${projectId}`,
    dedupeKey: `autopilot.repair.exhausted.${projectId}`,
    dedupeWindowMs: 6 * 3_600_000,
  });
}

export function isAutopilotProject(mode: string | null): mode is AutomationMode {
  return mode === "autopilot";
}
