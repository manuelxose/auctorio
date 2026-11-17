// The 10 quality checks shown as a list in the article panel (M4). Pure: it reads the
// stored body and SEO fields, so every QA v2 re-run (image sync, repair, edit) refreshes it.

import type { ArticleTargets } from "./structure";

export type ChecklistItem = { key: string; label: string; passed: boolean; detail: string };

export type ChecklistInput = {
  bodyHtml: string;
  seoTitle: string;
  seoDescription: string;
  primaryKeyword: string | null;
  semanticKeywords: string[];
  /** Guide targets; null for other article types (lighter structure rule, no section switches). */
  targets: ArticleTargets | null;
  cannibalizationRisk: string | null;
  internalLinkInventorySize: number | null;
};

const fold = (value: string) => value.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
const words = (value: string) => value.split(/\s+/).filter(Boolean).length;

const STAT = /\d+(?:[.,]\d+)?\s?(?:%|por ciento|percent|millones|millions|mil\b|€|\$|euros|dólares|dollars|horas|hours|minutos|minutes|días|days|gb|mb)/i;
const FAQ_HEADING = /<h2[^>]*>[^<]*(preguntas frecuentes|faq|frequently asked)/i;

export function runQualityChecklist(input: ChecklistInput): ChecklistItem[] {
  const html = input.bodyHtml;
  const body = fold(text(html));
  const keyword = fold(input.primaryKeyword?.trim() ?? "");
  const targets = input.targets;
  const sections = targets?.sections;
  const items: ChecklistItem[] = [];
  const add = (key: string, label: string, passed: boolean, detail: string) => items.push({ key, label, passed, detail });

  // 1. Answer first: the opening paragraph is short and names the query.
  const first = text(/<p[^>]*>([\s\S]*?)<\/p>/i.exec(html)?.[1] ?? "");
  const firstWords = words(first);
  const answers = firstWords >= 15 && firstWords <= 140 && (!keyword || fold(first).includes(keyword));
  add("answer_first", "Respuesta primero", answers, answers ? "La introducción responde la búsqueda desde la primera frase." : `El primer párrafo (${firstWords} palabras) debe responder la búsqueda${keyword ? ` y nombrar «${input.primaryKeyword}»` : ""}.`);

  // 2. A concrete figure or statistic.
  const numbers = text(html).match(/\b\d+(?:[.,]\d+)?\b/g) ?? [];
  const stat = STAT.test(text(html)) || numbers.length >= 3;
  add("statistic", "Dato o estadística", stat, stat ? "Incluye cifras concretas." : "Añade al menos un dato o estadística verificable.");

  // 3. Semantic keywords: at least half appear.
  const semantic = [...new Set(input.semanticKeywords.map((entry) => fold(entry.trim())).filter(Boolean))];
  const covered = semantic.filter((entry) => body.includes(entry)).length;
  const semanticOk = semantic.length === 0 || covered >= Math.ceil(semantic.length / 2);
  add("semantic_keywords", "Keywords semánticas", semanticOk, semantic.length === 0 ? "El plan no define keywords semánticas." : `${covered}/${semantic.length} keywords semánticas presentes.`);

  // 4. Credible source: external links.
  const external = (html.match(/<a[^>]+href=["']https?:\/\//gi) ?? []).length;
  add("credible_source", "Fuente creíble", external >= 1, `${external} enlace(s) a fuentes externas${targets ? `; objetivo ~${targets.externalLinks}` : ""}.`);

  // 5. Structure: H2s, and for guides the comparison table, FAQ and summary box.
  const h2 = (html.match(/<h2[^>]*>/gi) ?? []).length;
  const missing: string[] = [];
  if (h2 < 3) missing.push(`al menos 3 H2 (hay ${h2})`);
  if (targets) {
    if (!/<table[\s>]/i.test(html)) missing.push("tabla comparativa");
    if (sections?.faq && !FAQ_HEADING.test(html)) missing.push("sección de preguntas frecuentes");
    if (sections?.summary && !/<aside[^>]*data-block=["']summary["']/i.test(html)) missing.push("caja «En resumen»");
  }
  add("structure", "Estructura", missing.length === 0, missing.length === 0 ? `${h2} secciones H2${targets ? ", tabla y FAQ" : ""}.` : `Falta: ${missing.join(", ")}.`);

  // 6. Internal links (TOC anchors don't count): the target, capped by what the site inventory offers.
  const internal = (html.match(/<a[^>]+href=["'](?!https?:\/\/|mailto:|tel:|#)/gi) ?? []).length;
  const wanted = targets ? targets.internalLinks : 2;
  const required = input.internalLinkInventorySize === null ? wanted : Math.min(wanted, input.internalLinkInventorySize);
  add("internal_links", "Enlaces internos", internal >= required, `${internal} enlace(s) interno(s); objetivo ${required}.`);

  // 7. Plagiarism / overlap with the site (duplicate-check feeds cannibalizationRisk).
  const risk = input.cannibalizationRisk;
  // "related-cluster" is a sibling topic, not a duplicate (editorial-plan-schema CANNIBALIZATION_RISKS).
  const original = !risk || risk === "none" || risk === "low" || risk === "related-cluster";
  add("plagiarism", "Sin plagio", original, original ? "Sin solapamiento con contenido existente." : `Riesgo de duplicado: ${risk}.`);

  // 8. Image alt text.
  const images = html.match(/<img[^>]*>/gi) ?? [];
  const withAlt = images.filter((image) => /alt=["'][^"']+["']/i.test(image)).length;
  add("image_alt", "Alt de imágenes", withAlt === images.length, images.length === 0 ? "Sin imágenes todavía." : `${withAlt}/${images.length} imágenes con alt${targets ? `; objetivo ${targets.images} imágenes` : ""}.`);

  // 9. Meta tags.
  const titleOk = input.seoTitle.length >= 35 && input.seoTitle.length <= 70;
  const descriptionOk = input.seoDescription.length >= 110 && input.seoDescription.length <= 165;
  add("meta_tags", "Meta tags", titleOk && descriptionOk, `SEO title ${input.seoTitle.length} car. (35–70), meta description ${input.seoDescription.length} car. (110–165).`);

  // 10. JSON-LD is generated at publish time (json-ld.ts) unless the site switched it off.
  const jsonLd = sections ? sections.jsonLd : true;
  add("json_ld", "JSON-LD", true, jsonLd ? `Article y BreadcrumbList${FAQ_HEADING.test(html) ? " y FAQPage" : ""} al publicar.` : "Desactivado para este sitio.");

  return items;
}
