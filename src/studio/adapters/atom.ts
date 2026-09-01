// Atom feed adapter.

import { XMLParser, XMLValidator } from "fast-xml-parser";
import type { DiscoveredSourceItem, DiscoveryContext, SourceAdapter, SourceHealthCheck, SourceRef } from "./types";
import { resolveAdapterPolicies } from "./policies";
import { fetchSourceHttp, robotsAllows, SourceNotModifiedError } from "./http";
import { extractMedia } from "./media";
import { asStringArray, deriveExternalId, emptyDiscoveredItem, extractLink, parseDate, resolveRelativeUrl, stripHtmlToText, toText } from "./normalize";
import { conditionalFromSource, observeNotModified, observeResponse } from "./observe";

/** Prefer the rel="alternate" link (Atom entries may carry self/enclosure). */
export function extractAtomAlternateLink(raw: unknown): string | null {
  const list = Array.isArray(raw) ? raw : raw === undefined || raw === null ? [] : [raw];
  let firstLink: string | null = null;
  for (const entry of list) {
    const link = extractLink(entry);
    if (!link) {
      continue;
    }
    if (firstLink === null) {
      firstLink = link;
    }
    if (entry && typeof entry === "object" && !Array.isArray(entry)) {
      const rel = (entry as Record<string, unknown>).rel ?? (entry as Record<string, unknown>)["@_rel"];
      if (typeof rel === "string" && rel === "alternate") {
        return link;
      }
    }
  }
  return firstLink;
}

function extractAtomAuthors(raw: unknown): string[] {
  const list = Array.isArray(raw) ? raw : raw === undefined || raw === null ? [] : [raw];
  const authors = new Set<string>();
  for (const entry of list) {
    if (typeof entry === "string") {
      const trimmed = entry.trim();
      if (trimmed) {
        authors.add(trimmed);
      }
    } else if (entry && typeof entry === "object") {
      const record = entry as Record<string, unknown>;
      const name = toText(record.name);
      if (name) {
        authors.add(name);
      }
    }
  }
  return Array.from(authors);
}

/** Parse Atom XML into normalized discovery items. Pure — deterministic tests. */
export function parseAtomItems(xml: string, sourceUrl: string, maxItems: number): DiscoveredSourceItem[] {
  if (XMLValidator.validate(xml) !== true) {
    throw new Error("source_xml_invalid");
  }
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });
  const parsed = parser.parse(xml) as Record<string, unknown>;
  const feed = (parsed.feed ?? {}) as Record<string, unknown>;
  const rawEntries = Array.isArray(feed.entry) ? feed.entry : feed.entry ? [feed.entry] : [];
  const feedLanguage = toText(feed["xml:lang"]) ?? null;

  const items: DiscoveredSourceItem[] = [];
  for (const raw of rawEntries) {
    if (items.length >= maxItems) {
      break;
    }
    const record = (raw ?? {}) as Record<string, unknown>;
    const title = toText(record.title) ?? "";
    if (!title) {
      continue;
    }
    const rawLink = extractAtomAlternateLink(record.link);
    const linkValue = resolveRelativeUrl(sourceUrl, rawLink);
    const contentHtml = toText(record.content) ?? toText(record.summary) ?? null;
    const authors = extractAtomAuthors(record.author);
    const publishedAt = parseDate(toText(record.published)) ?? parseDate(toText(record.issued));
    const modifiedAt = parseDate(toText(record.updated));
    const externalIdSeed = linkValue ?? (toText(record.id) ? `atom-id:${toText(record.id)}` : null);

    items.push(
      emptyDiscoveredItem({
        externalId: deriveExternalId(externalIdSeed, title),
        canonicalUrl: linkValue,
        sourceUrl: linkValue,
        title,
        description: stripHtmlToText(contentHtml),
        rawText: contentHtml,
        cleanedText: stripHtmlToText(contentHtml),
        author: authors[0] ?? null,
        authors,
        publishedAt,
        modifiedAt,
        sourceImageUrls: extractMedia(record),
        language: toText(record["xml:lang"]) ?? feedLanguage,
        categories: categoryValues(record.category),
        tags: asStringArray(record["media:keywords"]),
        rawMetadata: { id: toText(record.id), feedUrl: sourceUrl },
        confidence: publishedAt || modifiedAt ? 0.9 : 0.6,
      }),
    );
  }
  return items;
}

/** Atom categories use <category term="…"/> — read the term attribute. */
function categoryValues(raw: unknown): string[] {
  const list = Array.isArray(raw) ? raw : raw === undefined || raw === null ? [] : [raw];
  const values: string[] = [];
  for (const entry of list) {
    if (typeof entry === "string") {
      const trimmed = entry.trim();
      if (trimmed) {
        values.push(trimmed);
      }
    } else if (entry && typeof entry === "object") {
      const record = entry as Record<string, unknown>;
      const term = record.term ?? record["@_term"];
      if (typeof term === "string" && term.trim()) {
        values.push(term.trim());
      } else {
        const text = record["#text"];
        if (typeof text === "string" && text.trim()) {
          values.push(text.trim());
        }
      }
    }
  }
  return Array.from(new Set(values));
}

export class AtomAdapter implements SourceAdapter {
  readonly type = "atom" as const;

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
        accept: "application/atom+xml,application/xml,text/xml",
        timeoutMs: policies.timeoutMs,
        retryAttempts: policies.retryAttempts,
        backoffBaseMs: policies.backoffBaseMs,
        backoffMaxMs: policies.backoffMaxMs,
        conditional: conditionalFromSource(source),
        signal: context.signal,
      });
      observeResponse(context, response);
      return parseAtomItems(response.body, response.finalUrl || source.url, policies.maxItems);
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
        accept: "application/atom+xml,application/xml,text/xml",
        timeoutMs: Math.min(policies.timeoutMs, 10_000),
        retryAttempts: 1,
        conditional: conditionalFromSource(source),
        signal: context.signal,
      });
      const items = parseAtomItems(response.body, response.finalUrl || source.url, policies.maxItems);
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
