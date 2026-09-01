// Shared normalization helpers used by all adapters. Normalization happens at
// the source boundary so raw payloads never leak into business services.

import { load } from "cheerio";
import { normalizeText } from "../../shared/utils/text";
import { sha256 } from "../../shared/utils/hash";

export function compact(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function toText(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value === "object") {
    const nested = (value as Record<string, unknown>)["#text"];
    return typeof nested === "string" ? compact(nested) : null;
  }
  const text = String(value).trim();
  return text ? text : null;
}

export function extractLink(value: unknown): string | null {
  if (typeof value === "string") {
    return value.trim() || null;
  }
  if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>;
    // Atom uses attribute-prefixed keys (@_href) with ignoreAttributes.
    const href = record.href ?? record["@_href"];
    if (typeof href === "string") {
      return href.trim() || null;
    }
    const nested = (record as Record<string, unknown>)["#text"];
    if (typeof nested === "string") {
      return nested.trim() || null;
    }
  }
  return null;
}

export function firstOf(...values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    if (value && value.trim()) {
      return compact(value);
    }
  }
  return null;
}

const TRACKING_PARAMS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "fbclid",
  "gclid",
  "ref",
  "mc_cid",
  "mc_eid",
  "igshid",
]);

export function normalizeCanonicalUrl(raw: string | null | undefined): string | null {
  if (!raw) {
    return null;
  }
  try {
    const url = new URL(raw.trim());
    url.hash = "";
    url.protocol = url.protocol.toLowerCase();
    url.hostname = url.hostname.toLowerCase();
    for (const key of TRACKING_PARAMS) {
      url.searchParams.delete(key);
    }
    return url.toString();
  } catch {
    return null;
  }
}

export function deriveExternalId(sourceUrl: string | null, title: string): string {
  const normalizedUrl = normalizeCanonicalUrl(sourceUrl);
  if (normalizedUrl) {
    return sha256(normalizedUrl).slice(0, 32);
  }
  return sha256(`${normalizeText(title)}`).slice(0, 32);
}

export function buildItemContentHash(title: string, text: string | null): string {
  const seed = normalizeText(`${title}\n${text ?? ""}`).slice(0, 4000);
  return sha256(seed);
}

/** Headline fingerprint: lowercase, strip punctuation/diacritics, collapse
 *  whitespace — used for cross-publisher duplicate/story signals. */
export function normalizeTitleForFingerprint(title: string | null | undefined): string {
  return (title ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildNormalizedTitleHash(title: string | null | undefined): string | null {
  const fingerprint = normalizeTitleForFingerprint(title);
  if (!fingerprint) {
    return null;
  }
  return sha256(fingerprint);
}

export function buildCanonicalUrlHash(url: string | null | undefined): string | null {
  const canonical = normalizeCanonicalUrl(url);
  if (!canonical) {
    return null;
  }
  return sha256(canonical);
}

export function stripHtmlToText(html: string | null | undefined): string | null {
  if (!html) {
    return null;
  }
  const withBreaks = html
    .replace(/<\/(p|div|h1|h2|h3|h4|h5|h6|li|blockquote|section|article)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n");
  const $ = load(withBreaks);
  $("script, style, noscript, iframe, form").remove();
  const text = compact($("body").text() || $.text());
  return text || null;
}

export function parseDate(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  const text = String(value).trim();
  if (!text) {
    return null;
  }
  const direct = new Date(text);
  if (!Number.isNaN(direct.getTime())) {
    return direct.toISOString();
  }
  // RFC 822/2822 variants commonly broken in the wild: wrong or missing
  // day-of-week prefix (e.g. "28 Aug 2026 12:00:00 GMT").
  const withoutDow = text.replace(/^[A-Za-z]{3},\s*/, "");
  const retry = new Date(withoutDow);
  if (!Number.isNaN(retry.getTime())) {
    return retry.toISOString();
  }
  return null;
}

/** Resolve a possibly-relative URL against a document base URL. Only http(s)
 *  results are returned; other schemes (mailto:, javascript:…) yield null. */
export function resolveRelativeUrl(base: string, raw: string | null | undefined): string | null {
  if (!raw) {
    return null;
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }
  try {
    const resolved = new URL(trimmed, base);
    if (resolved.protocol !== "http:" && resolved.protocol !== "https:") {
      return null;
    }
    return normalizeCanonicalUrl(resolved.toString());
  } catch {
    return null;
  }
}

export function asStringArray(value: unknown): string[] {
  const out: string[] = [];
  const push = (item: unknown) => {
    if (item === null || item === undefined) {
      return;
    }
    if (typeof item === "string") {
      out.push(item.trim());
      return;
    }
    if (typeof item === "object" && !Array.isArray(item)) {
      const record = item as Record<string, unknown>;
      const nested = record["#text"] ?? record.term ?? record.label;
      if (typeof nested === "string" && nested.trim()) {
        out.push(nested.trim());
      }
    }
  };
  if (Array.isArray(value)) {
    for (const item of value) {
      push(item);
    }
  } else {
    push(value);
  }
  return Array.from(new Set(out.filter(Boolean)));
}

export function readConfigObject(configuration: unknown): Record<string, unknown> {
  return configuration && typeof configuration === "object"
    ? (configuration as Record<string, unknown>)
    : {};
}

/** Build an empty normalized item with all fields present. */
export function emptyDiscoveredItem(overrides: Partial<import("./types").DiscoveredSourceItem>): import("./types").DiscoveredSourceItem {
  return {
    externalId: "",
    canonicalUrl: null,
    sourceUrl: null,
    title: "",
    description: null,
    rawText: null,
    cleanedText: null,
    author: null,
    authors: [],
    publishedAt: null,
    modifiedAt: null,
    sourceImageUrls: [],
    language: null,
    categories: [],
    tags: [],
    rawMetadata: null,
    attribution: null,
    confidence: null,
    ...overrides,
  };
}
