// HTML article adapter (`html`): parse a single article page into a normalized
// document. Also implements fetchDetails for enrichment of items discovered
// through other adapters.

import { load } from "cheerio";
import type { DiscoveryContext, DiscoveredSourceItem, FetchContext, SourceAdapter, SourceDocument, SourceHealthCheck, SourceRef } from "./types";
import { resolveAdapterPolicies } from "./policies";
import { fetchSourceHttp, robotsAllows, SourceNotModifiedError } from "./http";
import { compact, deriveExternalId, emptyDiscoveredItem, normalizeCanonicalUrl, parseDate, resolveRelativeUrl } from "./normalize";
import { conditionalFromSource, observeNotModified, observeResponse } from "./observe";

/** Extract JSON-LD blocks from an HTML document. Pure — deterministic tests. */
export function extractJsonLd(html: string): Array<Record<string, unknown>> {
  const $ = load(html);
  const blocks: Array<Record<string, unknown>> = [];
  $('script[type="application/ld+json"]').each((_index, element) => {
    const raw = $(element).contents().text();
    if (!raw) {
      return;
    }
    try {
      const parsed = JSON.parse(raw) as unknown;
      const list = Array.isArray(parsed) ? parsed : [parsed];
      for (const entry of list) {
        if (entry && typeof entry === "object") {
          blocks.push(entry as Record<string, unknown>);
        }
      }
    } catch {
      // Malformed JSON-LD is ignored — third-party HTML is untrusted.
    }
  });
  return blocks;
}

function jsonLdField(blocks: Array<Record<string, unknown>>, keys: string[]): string | null {
  for (const block of blocks) {
    for (const key of keys) {
      const value = block[key];
      if (typeof value === "string" && value.trim()) {
        return compact(value);
      }
      if (Array.isArray(value) && typeof value[0] === "string" && value[0].trim()) {
        return compact(value[0]);
      }
      if (value && typeof value === "object" && !Array.isArray(value)) {
        const nested = (value as Record<string, unknown>).name;
        if (typeof nested === "string" && nested.trim()) {
          return compact(nested);
        }
      }
    }
  }
  return null;
}

/** Extract a normalized document from article HTML. Pure — deterministic tests. */
export function parseHtmlArticle(html: string, pageUrl: string): SourceDocument {
  const $ = load(html);
  $("script, style, noscript, iframe, form, nav, footer, header, aside").remove();

  // Canonical URL wins; otherwise normalize the page URL.
  const canonicalRaw = $('link[rel="canonical"]').attr("href");
  const url = normalizeCanonicalUrl(canonicalRaw) ?? normalizeCanonicalUrl(pageUrl) ?? pageUrl;

  const jsonLd = extractJsonLd(html);
  const title = compact(
    $('meta[property="og:title"]').attr("content") ||
      $('meta[name="twitter:title"]').attr("content") ||
      jsonLdField(jsonLd, ["headline"]) ||
      $("head title").text() ||
      $("h1").first().text() ||
      new URL(url).hostname,
  );
  const description =
    $('meta[property="og:description"]').attr("content") ||
    $('meta[name="description"]').attr("content") ||
    $('meta[name="twitter:description"]').attr("content") ||
    jsonLdField(jsonLd, ["description"]);

  const images = new Set<string>();
  const addImage = (value: string | undefined) => {
    const normalized = resolveRelativeUrl(url, value);
    if (normalized) {
      images.add(normalized);
    }
  };
  addImage($('meta[property="og:image"]').attr("content"));
  addImage($('meta[name="twitter:image"]').attr("content"));
  const jsonLdImage = jsonLdField(jsonLd, ["image", "thumbnailUrl"]);
  addImage(jsonLdImage ?? undefined);
  $("article img").each((_index, element) => addImage($(element).attr("src") ?? $(element).attr("data-src")));

  const bodyText = compact($("article").text() || $("main").text() || $("body").text());
  const section =
    $('meta[property="article:section"]').attr("content") ??
    jsonLdField(jsonLd, ["articleSection"]) ??
    null;

  return {
    url,
    title: title || null,
    description: description ?? null,
    html,
    text: bodyText || null,
    author:
      $('meta[name="author"]').attr("content") ??
      $('meta[property="article:author"]').attr("content") ??
      jsonLdField(jsonLd, ["author"]) ??
      null,
    publishedAt: parseDate(
      $('meta[property="article:published_time"]').attr("content") ??
        jsonLdField(jsonLd, ["datePublished"]) ??
        $('time[datetime]').first().attr("datetime"),
    ),
    modifiedAt: parseDate(
      $('meta[property="article:modified_time"]').attr("content") ?? jsonLdField(jsonLd, ["dateModified"]),
    ),
    language: $("html").attr("lang") ?? jsonLdField(jsonLd, ["inLanguage"]) ?? null,
    imageUrls: Array.from(images),
    section: section ?? null,
    categories: [],
    tags: [],
    rawMetadata: { pageUrl, canonicalUrl: canonicalRaw ?? null, schemaOrgTypes: jsonLd.map((block) => (typeof block["@type"] === "string" ? block["@type"] : null)).filter(Boolean) },
    confidence: bodyText ? 0.9 : 0.5,
  };
}

export class HtmlAdapter implements SourceAdapter {
  readonly type = "html" as const;

  async discover(source: SourceRef, context: DiscoveryContext): Promise<DiscoveredSourceItem[]> {
    if (!source.url) {
      throw new Error("source_url_required");
    }
    const policies = resolveAdapterPolicies(source, context);
    const url = new URL(source.url);
    if (policies.respectRobots && !(await robotsAllows(url))) {
      throw new Error("robots_disallow");
    }
    let response;
    try {
      response = await fetchSourceHttp(url, {
        accept: "text/html",
        timeoutMs: policies.timeoutMs,
        retryAttempts: policies.retryAttempts,
        backoffBaseMs: policies.backoffBaseMs,
        backoffMaxMs: policies.backoffMaxMs,
        conditional: conditionalFromSource(source),
        signal: context.signal,
      });
    } catch (error) {
      if (error instanceof SourceNotModifiedError) {
        observeNotModified(context, error.etag);
        return [];
      }
      throw error;
    }
    observeResponse(context, response);
    const document = parseHtmlArticle(response.body, response.finalUrl || source.url);
    const item: DiscoveredSourceItem = emptyDiscoveredItem({
      externalId: deriveExternalId(document.url, document.title ?? source.url),
      canonicalUrl: document.url,
      sourceUrl: document.url,
      title: document.title ?? new URL(source.url).hostname,
      description: document.text ? compact(document.text.slice(0, 300)) : null,
      rawText: document.text,
      cleanedText: document.text,
      author: document.author,
      authors: document.author ? [document.author] : [],
      publishedAt: document.publishedAt,
      modifiedAt: document.modifiedAt,
      sourceImageUrls: document.imageUrls,
      language: document.language,
      categories: document.categories,
      tags: document.tags,
      rawMetadata: document.rawMetadata,
      confidence: document.confidence,
    });
    return [item];
  }

  async fetchDetails(item: DiscoveredSourceItem, context: FetchContext): Promise<SourceDocument> {
    const target = item.canonicalUrl ?? item.sourceUrl;
    if (!target) {
      throw new Error("item_url_required");
    }
    const policies = resolveAdapterPolicies({ configuration: null, rateLimitPolicy: null, robotsPolicy: null, extractionPolicy: null }, context);
    const url = new URL(target);
    if (policies.respectRobots && !(await robotsAllows(url))) {
      throw new Error("robots_disallow");
    }
    const response = await fetchSourceHttp(url, {
      accept: "text/html",
      timeoutMs: policies.timeoutMs,
      retryAttempts: policies.retryAttempts,
      backoffBaseMs: policies.backoffBaseMs,
      backoffMaxMs: policies.backoffMaxMs,
      signal: context.signal,
    });
    return parseHtmlArticle(response.body, target);
  }

  async healthCheck(source: SourceRef, context: DiscoveryContext): Promise<SourceHealthCheck> {
    if (!source.url) {
      return { ok: false, status: null, latencyMs: null, itemCount: null, error: "source_url_required" };
    }
    const started = Date.now();
    try {
      const policies = resolveAdapterPolicies(source, context);
      const response = await fetchSourceHttp(new URL(source.url), {
        accept: "text/html",
        timeoutMs: Math.min(policies.timeoutMs, 10_000),
        retryAttempts: 1,
        signal: context.signal,
      });
      const document = parseHtmlArticle(response.body, source.url);
      return { ok: true, status: response.status, latencyMs: Date.now() - started, itemCount: document.title ? 1 : 0, error: null };
    } catch (error) {
      return {
        ok: false,
        status: null,
        latencyMs: Date.now() - started,
        itemCount: null,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
