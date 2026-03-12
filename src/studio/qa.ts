import type { ContentVersion } from "@prisma/client";
import type { QaCheck, QaReport } from "./types";

function hasAtLeastWords(value: string, minWords: number): boolean {
  const words = value.trim().split(/\s+/).filter(Boolean);
  return words.length >= minWords;
}

export function runVersionQa(version: Pick<ContentVersion, "title" | "excerpt" | "bodyHtml" | "seoTitle" | "seoDescription">, hasImage: boolean): QaReport {
  const body = String(version.bodyHtml || "").trim();
  const title = String(version.title || "").trim();
  const excerpt = String(version.excerpt || "").trim();
  const seoTitle = String(version.seoTitle || "").trim();
  const seoDescription = String(version.seoDescription || "").trim();

  const checks: QaCheck[] = [
    {
      key: "title_present",
      passed: title.length >= 20,
      message: "El titulo debe existir y tener un minimo razonable.",
      severity: "error",
    },
    {
      key: "body_length",
      passed: hasAtLeastWords(body, 180),
      message: "El cuerpo principal debe tener al menos 180 palabras.",
      severity: "error",
    },
    {
      key: "excerpt_present",
      passed: excerpt.length >= 80,
      message: "El extracto debe resumir la pieza con al menos 80 caracteres.",
      severity: "warning",
    },
    {
      key: "seo_title",
      passed: seoTitle.length >= 35 && seoTitle.length <= 65,
      message: "El SEO title debe moverse entre 35 y 65 caracteres.",
      severity: "warning",
    },
    {
      key: "seo_description",
      passed: seoDescription.length >= 110 && seoDescription.length <= 165,
      message: "La meta description debe moverse entre 110 y 165 caracteres.",
      severity: "warning",
    },
    {
      key: "heading_presence",
      passed: /<h2/i.test(body) || /\n##\s+/.test(body),
      message: "La pieza debe incluir al menos un subtitulo estructural.",
      severity: "warning",
    },
    {
      key: "image_present",
      passed: hasImage,
      message: "La version debe disponer de una imagen destacada.",
      severity: "error",
    },
  ];

  const passed = checks.every((check) => check.passed || check.severity !== "error");
  return { passed, checks };
}
