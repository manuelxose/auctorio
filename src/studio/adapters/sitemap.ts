// Sitemap adapter. Handles classic `<urlset>` and Google News sitemaps
// (`<news:news>` metadata) transparently.

import { XMLParser, XMLValidator } from "fast-xml-parser";
import type { DiscoveredSourceItem, DiscoveryContext, SourceAdapter, SourceHealthCheck, SourceRef } from "./types";
import { resolveAdapterPolicies } from "./policies";
import { fetchSourceHttp, robotsAllows, SourceNotModifiedError } from "./http";
import { deriveExternalId, emptyDiscoveredItem, normalizeCanonicalUrl, parseDate, toText } from "./normalize";
import { conditionalFromSource, observeNotModified, observeResponse } from "./observe";

function titleFromLoc(loc: string): string {
  try {
    const pathParts = new URL(loc).pathname.split("/").filter(Boolean);
    const last = pathParts.slice(-1)[0];
    if (last) {
      return last.replace(/[-_]+/g, " ").replace(/\.html?$/, "").trim() || loc;
    }
  } catch {
    // fall through
  }
  return loc;
}

/** Parse a sitemap (classic or Google News) into normalized items. Pure. */
export function parseSitemapItems(xml: string, sourceUrl: string, maxItems: number): DiscoveredSourceItem[] {
  if (XMLValidator.validate(xml) !== true) {
    throw new Error("source_xml_invalid");
  }
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });
  const parsed = parser.parse(xml) as Record<string, unknown>;

  // Sitemap index: recurse into child sitemap URLs without fetching (we only
  // return what is present in this document — the caller may re-run per URL).
  const sitemapIndex = parsed.sitemapindex ?? {};
  const indexRecord = (sitemapIndex ?? {}) as Record<string, unknown>;
  const rawUrls: unknown[] = [];
  const urlset = (parsed.urlset ?? {}) as Record<string, unknown>;
  if (Array.isArray(urlset.url)) {
    rawUrls.push(...urlset.url);
  } else if (urlset.url) {
    rawUrls.push(urlset.url);
  }

  const items: DiscoveredSourceItem[] = [];
  for (const raw of rawUrls) {
    if (items.length >= maxItems) {
      break;
    }
    const record = (raw ?? {}) as Record<string, unknown>;
    const loc = toText(record.loc);
    if (!loc) {
      continue;
    }
    const canonical = normalizeCanonicalUrl(loc);
    const title = titleFromLoc(loc);

    // Google News sitemap: news:news carries publication metadata.
    const newsRaw = record["news:news"];
    const news = newsRaw && typeof newsRaw === "object" ? (newsRaw as Record<string, unknown>) : null;
    const publicationRaw = news ? news["news:publication"] : null;
    const publication = publicationRaw && typeof publicationRaw === "object" ? (publicationRaw as Record<string, unknown>) : null;
    const newsTitle = news ? toText(news["news:title"] ?? news.title) : null;
    const newsDate = news ? parseDate(toText(news["news:publication_date"])) : null;
    const newsKeywords = news && typeof news["news:keywords"] === "string" ? news["news:keywords"].split(",").map((part) => part.trim()).filter(Boolean) : [];
    const newsName = publication ? toText(publication["news:name"]) : toText(news ? news["news:name"] : null);
    const newsLanguage = news ? toText(news["news:language"] ?? (publication ? publication["news:language"] : null)) : null;

    items.push(
      emptyDiscoveredItem({
        externalId: deriveExternalId(loc, newsTitle ?? title),
        canonicalUrl: canonical,
        sourceUrl: canonical,
        title: newsTitle ?? title,
        description: null,
        rawText: null,
        cleanedText: null,
        author: newsName,
        authors: newsName ? [newsName] : [],
        publishedAt: newsDate ?? parseDate(toText(record.lastmod)),
        modifiedAt: parseDate(toText(record.lastmod)),
        sourceImageUrls: [],
        language: newsLanguage,
        categories: [],
        tags: newsKeywords,
        rawMetadata: { lastmod: toText(record.lastmod), newsSitemap: Boolean(news), sourceUrl },
        confidence: news ? 0.9 : 0.7,
      }),
    );
  }
  // Sitemap index entries also yield discoverable child sitemaps.
  if (Array.isArray(indexRecord.sitemap)) {
    for (const raw of indexRecord.sitemap) {
      if (items.length >= maxItems) {
        break;
      }
      const record = (raw ?? {}) as Record<string, unknown>;
      const loc = toText(record.loc);
      if (!loc) {
        continue;
      }
      const canonical = normalizeCanonicalUrl(loc);
      items.push(
        emptyDiscoveredItem({
          externalId: deriveExternalId(loc, `sitemap:${loc}`),
          canonicalUrl: canonical,
          sourceUrl: canonical,
          title: titleFromLoc(loc),
          rawMetadata: { lastmod: toText(record.lastmod), sitemapIndexEntry: true, sourceUrl },
          confidence: 0.5,
        }),
      );
    }
  }
  return items;
}

export class SitemapAdapter implements SourceAdapter {
  readonly type = "sitemap" as const;

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
        accept: "application/xml,text/xml",
        timeoutMs: policies.timeoutMs,
        retryAttempts: policies.retryAttempts,
        backoffBaseMs: policies.backoffBaseMs,
        backoffMaxMs: policies.backoffMaxMs,
        conditional: conditionalFromSource(source),
        signal: context.signal,
      });
      observeResponse(context, response);
      return parseSitemapItems(response.body, response.finalUrl || source.url, policies.maxItems);
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
        accept: "application/xml,text/xml",
        timeoutMs: Math.min(policies.timeoutMs, 10_000),
        retryAttempts: 1,
        conditional: conditionalFromSource(source),
        signal: context.signal,
      });
      const items = parseSitemapItems(response.body, response.finalUrl || source.url, policies.maxItems);
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
