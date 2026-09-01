// RSS 2.0 / RDF adapter. Stateless; configuration overrides live in
// source.configuration / extractionPolicy.

import { XMLParser, XMLValidator } from "fast-xml-parser";
import type { DiscoveredSourceItem, DiscoveryContext, SourceAdapter, SourceHealthCheck, SourceRef } from "./types";
import { resolveAdapterPolicies } from "./policies";
import { fetchSourceHttp, robotsAllows, SourceNotModifiedError } from "./http";
import { extractMedia } from "./media";
import { asStringArray, deriveExternalId, emptyDiscoveredItem, normalizeCanonicalUrl, parseDate, resolveRelativeUrl, stripHtmlToText, toText } from "./normalize";
import { conditionalFromSource, observeNotModified, observeResponse } from "./observe";

export function readRssChannel(parsed: Record<string, unknown>): Record<string, unknown> | null {
  const rss = parsed.rss ?? parsed["rdf:RDF"];
  if (rss && typeof rss === "object") {
    const record = rss as Record<string, unknown>;
    return typeof record.channel === "object" ? (record.channel as Record<string, unknown>) : null;
  }
  return null;
}

function extractGuid(raw: unknown): { value: string | null; isPermaLink: boolean } {
  if (typeof raw === "string") {
    return { value: raw.trim() || null, isPermaLink: true };
  }
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const record = raw as Record<string, unknown>;
    const value = toText(record["#text"]);
    const flag = toText(record["@_isPermaLink"]) ?? "true";
    return { value, isPermaLink: flag.toLowerCase() !== "false" };
  }
  return { value: null, isPermaLink: true };
}

function extractRssLink(record: Record<string, unknown>): string | null {
  const link = record.link;
  if (typeof link === "string") {
    return link.trim() || null;
  }
  if (typeof link === "object" && link !== null && !Array.isArray(link)) {
    const text = (link as Record<string, unknown>)["#text"];
    if (typeof text === "string") {
      return text.trim() || null;
    }
  }
  // Some feeds (WordPress) put the permalink in <atom:link rel="alternate">.
  const atomLink = record["atom:link"];
  if (atomLink && typeof atomLink === "object" && !Array.isArray(atomLink)) {
    const candidate = (atomLink as Record<string, unknown>)["@_href"];
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }
  return null;
}

function extractAuthors(record: Record<string, unknown>): string[] {
  const values = new Set<string>();
  for (const key of ["dc:creator", "author", "creator"]) {
    for (const author of asStringArray(record[key])) {
      // "Name (email@example.com)" → keep the name part for cleanliness.
      values.add(author.replace(/\s*\([^)]*\)\s*$/, "").trim());
    }
  }
  return Array.from(values);
}

/** Parse RSS XML into normalized discovery items. Pure — deterministic tests. */
export function parseRssItems(xml: string, sourceUrl: string, maxItems: number): DiscoveredSourceItem[] {
  if (XMLValidator.validate(xml) !== true) {
    throw new Error("source_xml_invalid");
  }
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });
  const parsed = parser.parse(xml) as Record<string, unknown>;
  const channel = readRssChannel(parsed);
  if (!channel) {
    throw new Error("source_rss_missing_channel");
  }
  const rawItems = Array.isArray(channel.item) ? channel.item : channel.item ? [channel.item] : [];
  const language = toText(channel.language) ?? null;

  const items: DiscoveredSourceItem[] = [];
  for (const raw of rawItems) {
    if (items.length >= maxItems) {
      break;
    }
    const record = (raw ?? {}) as Record<string, unknown>;
    const title = toText(record.title) ?? "";
    if (!title) {
      continue;
    }
    const rawHref = extractRssLink(record);
    const sourceHref = resolveRelativeUrl(sourceUrl, rawHref);
    const guid = extractGuid(record.guid);
    const descriptionHtml = toText(record.description) ?? null;
    const contentEncoded = toText(record["content:encoded"]);
    const bodyHtml = contentEncoded ?? descriptionHtml;
    const authors = extractAuthors(record);
    const publishedRaw = toText(record.pubDate) ?? toText(record.published) ?? toText(record["dc:date"]);
    const publishedAt = parseDate(publishedRaw);
    const modifiedAt = parseDate(toText(record["dc:modified"])) ?? publishedAt;
    const externalSeed = sourceHref ?? (guid.value ? `guid:${guid.value}` : null);

    items.push(
      emptyDiscoveredItem({
        externalId: deriveExternalId(externalSeed, title),
        canonicalUrl: sourceHref,
        sourceUrl: sourceHref,
        title,
        description: stripHtmlToText(descriptionHtml ?? bodyHtml),
        rawText: bodyHtml,
        cleanedText: stripHtmlToText(bodyHtml),
        author: authors[0] ?? null,
        authors,
        publishedAt,
        modifiedAt,
        sourceImageUrls: extractMedia(record),
        language,
        categories: asStringArray(record.category),
        tags: asStringArray(record["media:keywords"]),
        rawMetadata: {
          guid: guid.value,
          guidIsPermaLink: guid.isPermaLink,
          feedUrl: sourceUrl,
          ...(sourceHref && rawHref !== sourceHref ? { resolvedFromRelative: true } : {}),
        },
        confidence: publishedAt ? 0.9 : 0.6,
      }),
    );
  }
  return items;
}

export class RssAdapter implements SourceAdapter {
  readonly type = "rss" as const;

  async discover(source: SourceRef, context: DiscoveryContext): Promise<DiscoveredSourceItem[]> {
    if (!source.url) {
      throw new Error("source_url_required");
    }
    const policies = resolveAdapterPolicies(source, context);
    const url = new URL(source.url);
    if (policies.respectRobots && !(await robotsAllows(url))) {
      throw new Error("robots_disallow");
    }
    try {
      const response = await fetchSourceHttp(url, {
        accept: "application/rss+xml,application/xml,text/xml",
        timeoutMs: policies.timeoutMs,
        retryAttempts: policies.retryAttempts,
        backoffBaseMs: policies.backoffBaseMs,
        backoffMaxMs: policies.backoffMaxMs,
        conditional: conditionalFromSource(source),
        signal: context.signal,
      });
      observeResponse(context, response);
      return parseRssItems(response.body, response.finalUrl || source.url, policies.maxItems);
    } catch (error) {
      if (error instanceof SourceNotModifiedError) {
        observeNotModified(context, error.etag);
        return [];
      }
      throw error;
    }
  }

  async healthCheck(source: SourceRef, context: DiscoveryContext): Promise<SourceHealthCheck> {
    if (!source.url) {
      return { ok: false, status: null, latencyMs: null, itemCount: null, error: "source_url_required" };
    }
    const started = Date.now();
    try {
      const policies = resolveAdapterPolicies(source, context);
      const response = await fetchSourceHttp(new URL(source.url), {
        accept: "application/rss+xml,application/xml,text/xml",
        timeoutMs: Math.min(policies.timeoutMs, 10_000),
        retryAttempts: 1,
        conditional: conditionalFromSource(source),
        signal: context.signal,
      });
      const items = parseRssItems(response.body, response.finalUrl || source.url, policies.maxItems);
      return { ok: true, status: response.status, latencyMs: Date.now() - started, itemCount: items.length, error: null };
    } catch (error) {
      if (error instanceof SourceNotModifiedError) {
        return { ok: true, status: 304, latencyMs: Date.now() - started, itemCount: 0, error: null };
      }
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
