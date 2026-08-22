import { XMLParser } from "fast-xml-parser";
import { load } from "cheerio";
import { Prisma } from "@prisma/client";
import type { ContentSource, ContentSourceType, SourceItemStatus } from "@prisma/client";
import { getPrismaClient } from "../infrastructure/db/prisma";
import { fetchUrl, validateScrapeUrl } from "../infrastructure/scraping";
import { normalizeText } from "../shared/utils/text";
import { sha256 } from "../shared/utils/hash";
import { getNumberEnv } from "../shared/utils/env";
import { scoreAndPromoteSourceItem } from "./editorial";
import { writeAudit } from "./audit";
import type { PaginatedResult } from "./types";

const prisma = getPrismaClient();

// ────────────────────────────────────────────────────────────── Types

export type ParsedSourceItem = {
  externalId: string;
  canonicalUrl: string | null;
  sourceUrl: string | null;
  title: string;
  description: string | null;
  rawText: string | null;
  cleanedText: string | null;
  author: string | null;
  publishedAt: string | null;
  sourceImageUrls: string[];
  language: string | null;
  categories: string[];
};

export interface SourceAdapter {
  fetch(source: Pick<ContentSource, "url" | "configuration">): Promise<ParsedSourceItem[]>;
}

// ────────────────────────────────────────────────────────────── Helpers

function compact(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function toText(value: unknown): string | null {
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

function extractLink(value: unknown): string | null {
  if (typeof value === "string") {
    return value.trim() || null;
  }
  if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>;
    const href = record.href;
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

function firstOf(...values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    if (value && value.trim()) {
      return compact(value);
    }
  }
  return null;
}

export function normalizeCanonicalUrl(raw: string | null | undefined): string | null {
  if (!raw) {
    return null;
  }
  try {
    const url = new URL(raw.trim());
    url.hash = "";
    url.protocol = url.protocol.toLowerCase();
    url.hostname = url.hostname.toLowerCase();
    const tracked = new Set([
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_term",
      "utm_content",
      "fbclid",
      "gclid",
      "ref",
    ]);
    for (const key of tracked) {
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

function parseDate(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed.toISOString();
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item)).filter(Boolean);
  }
  if (typeof value === "string" && value.trim()) {
    return [value.trim()];
  }
  return [];
}

function readConfigObject(configuration: unknown): Record<string, unknown> {
  return configuration && typeof configuration === "object"
    ? (configuration as Record<string, unknown>)
    : {};
}

// ────────────────────────────────────────────────────────────── Adapters

class RssSourceAdapter implements SourceAdapter {
  async fetch(source: Pick<ContentSource, "url" | "configuration">): Promise<ParsedSourceItem[]> {
    if (!source.url) {
      throw new Error("source_url_required");
    }
    const url = new URL(source.url);
    await validateScrapeUrl(url);
    const response = await fetchUrl(url, { accept: "application/rss+xml,application/xml,text/xml" });
    const maxItems = getNumberEnv("SCRAPE_MAX_ITEMS", 20);

    const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });
    const parsed = parser.parse(response.body) as Record<string, unknown>;
    const channel = readChannel(parsed);
    const rawItems = Array.isArray(channel?.item) ? channel.item : channel?.item ? [channel.item] : [];
    const language = toText(channel?.language) ?? null;

    const items: ParsedSourceItem[] = [];
    for (const raw of rawItems) {
      if (items.length >= maxItems) {
        break;
      }
      const record = (raw ?? {}) as Record<string, unknown>;
      const title = toText(record.title) ?? "";
      if (!title) {
        continue;
      }
      const sourceUrl = extractLink(record.link);
      const media = extractMedia(record);
      const descriptionHtml = toText(record.description) ?? toText(record["content:encoded"]) ?? null;

      items.push({
        externalId: deriveExternalId(sourceUrl, title),
        canonicalUrl: normalizeCanonicalUrl(sourceUrl),
        sourceUrl: normalizeCanonicalUrl(sourceUrl),
        title,
        description: stripHtmlToText(descriptionHtml),
        rawText: descriptionHtml,
        cleanedText: stripHtmlToText(descriptionHtml),
        author: toText(record["dc:creator"]) ?? toText(record.author) ?? null,
        publishedAt: parseDate(toText(record.pubDate) ?? toText(record.published)),
        sourceImageUrls: media,
        language,
        categories: asStringArray(record.category),
      });
    }

    return items;
  }
}

function readChannel(parsed: Record<string, unknown>): Record<string, unknown> | null {
  const rss = parsed.rss ?? parsed["rdf:RDF"];
  if (rss && typeof rss === "object") {
    const record = rss as Record<string, unknown>;
    return typeof record.channel === "object" ? (record.channel as Record<string, unknown>) : null;
  }
  return null;
}

function extractMedia(record: Record<string, unknown>): string[] {
  const urls = new Set<string>();
  const add = (value: unknown) => {
    if (typeof value === "string") {
      const normalized = normalizeCanonicalUrl(value);
      if (normalized) {
        urls.add(normalized);
      }
    }
  };

  const enclosure = record.enclosure;
  if (enclosure && typeof enclosure === "object") {
    add((enclosure as Record<string, unknown>)["@_url"]);
  }
  const media = record["media:content"];
  if (media && typeof media === "object") {
    if (Array.isArray(media)) {
      for (const entry of media) {
        add(typeof entry === "object" ? (entry as Record<string, unknown>)["@_url"] : entry);
      }
    } else {
      add((media as Record<string, unknown>)["@_url"]);
    }
  }
  const thumbnail = record["media:thumbnail"];
  if (thumbnail && typeof thumbnail === "object") {
    add((thumbnail as Record<string, unknown>)["@_url"]);
  }

  return Array.from(urls);
}

class AtomSourceAdapter implements SourceAdapter {
  async fetch(source: Pick<ContentSource, "url" | "configuration">): Promise<ParsedSourceItem[]> {
    if (!source.url) {
      throw new Error("source_url_required");
    }
    const url = new URL(source.url);
    await validateScrapeUrl(url);
    const response = await fetchUrl(url, { accept: "application/atom+xml,application/xml,text/xml" });
    const maxItems = getNumberEnv("SCRAPE_MAX_ITEMS", 20);

    const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });
    const parsed = parser.parse(response.body) as Record<string, unknown>;
    const feed = (parsed.feed ?? {}) as Record<string, unknown>;
    const rawEntries = Array.isArray(feed.entry) ? feed.entry : feed.entry ? [feed.entry] : [];

    const items: ParsedSourceItem[] = [];
    for (const raw of rawEntries) {
      if (items.length >= maxItems) {
        break;
      }
      const record = (raw ?? {}) as Record<string, unknown>;
      const title = toText(record.title) ?? "";
      if (!title) {
        continue;
      }
      const linkValue = extractLink(record.link);
      const contentHtml = toText(record.content) ?? toText(record.summary) ?? null;
      const authorRaw = record.author;
      const author =
        typeof authorRaw === "object"
          ? toText((authorRaw as Record<string, unknown>).name)
          : toText(authorRaw);

      items.push({
        externalId: deriveExternalId(linkValue, title),
        canonicalUrl: normalizeCanonicalUrl(linkValue),
        sourceUrl: normalizeCanonicalUrl(linkValue),
        title,
        description: stripHtmlToText(contentHtml),
        rawText: contentHtml,
        cleanedText: stripHtmlToText(contentHtml),
        author,
        publishedAt: parseDate(toText(record.published) ?? toText(record.updated)),
        sourceImageUrls: extractMedia(record),
        language: null,
        categories: asStringArray(record.category),
      });
    }

    return items;
  }
}

class HtmlSourceAdapter implements SourceAdapter {
  async fetch(source: Pick<ContentSource, "url" | "configuration">): Promise<ParsedSourceItem[]> {
    if (!source.url) {
      throw new Error("source_url_required");
    }
    const url = new URL(source.url);
    await validateScrapeUrl(url);
    const response = await fetchUrl(url, { accept: "text/html" });
    const $ = load(response.body);
    $("script, style, noscript, iframe, form, nav, footer, header, aside").remove();

    const title =
      $('meta[property="og:title"]').attr("content") ||
      $("head title").text() ||
      $("h1").first().text() ||
      url.hostname;
    const description =
      $('meta[property="og:description"]').attr("content") ||
      $('meta[name="description"]').attr("content") ||
      null;
    const images = new Set<string>();
    const addImage = (value: string | undefined) => {
      const normalized = normalizeCanonicalUrl(value);
      if (normalized) {
        images.add(normalized);
      }
    };
    addImage($('meta[property="og:image"]').attr("content"));
    addImage($('meta[name="twitter:image"]').attr("content"));
    $("article img").each((_index, element) => addImage($(element).attr("src")));

    const bodyText = compact($("article").text() || $("main").text() || $("body").text());

    return [
      {
        externalId: deriveExternalId(source.url, compact(title)),
        canonicalUrl: normalizeCanonicalUrl(
          $('link[rel="canonical"]').attr("href") ?? source.url,
        ),
        sourceUrl: normalizeCanonicalUrl(source.url),
        title: compact(title),
        description: compact(description ?? bodyText.slice(0, 300)) || null,
        rawText: bodyText || null,
        cleanedText: bodyText || null,
        author: $('meta[name="author"]').attr("content") ?? null,
        publishedAt: parseDate(
          $('meta[property="article:published_time"]').attr("content") ??
            $('time[datetime]').first().attr("datetime"),
        ),
        sourceImageUrls: Array.from(images),
        language: $("html").attr("lang") ?? null,
        categories: [],
      },
    ];
  }
}

class SitemapSourceAdapter implements SourceAdapter {
  async fetch(source: Pick<ContentSource, "url" | "configuration">): Promise<ParsedSourceItem[]> {
    if (!source.url) {
      throw new Error("source_url_required");
    }
    const url = new URL(source.url);
    await validateScrapeUrl(url);
    const response = await fetchUrl(url, { accept: "application/xml,text/xml" });
    const maxItems = getNumberEnv("SCRAPE_MAX_ITEMS", 20);

    const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });
    const parsed = parser.parse(response.body) as Record<string, unknown>;
    const urlset = (parsed.urlset ?? {}) as Record<string, unknown>;
    const rawUrls = Array.isArray(urlset.url) ? urlset.url : urlset.url ? [urlset.url] : [];

    const items: ParsedSourceItem[] = [];
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
      const pathParts = new URL(loc).pathname.split("/").filter(Boolean);
      const title = pathParts
        .slice(-1)[0]
        ?.replace(/[-_]+/g, " ")
        .replace(/\.html?$/, "")
        .trim() || loc;

      items.push({
        externalId: deriveExternalId(loc, title),
        canonicalUrl: canonical,
        sourceUrl: canonical,
        title,
        description: null,
        rawText: null,
        cleanedText: null,
        author: null,
        publishedAt: parseDate(toText(record.lastmod)),
        sourceImageUrls: [],
        language: null,
        categories: [],
      });
    }

    return items;
  }
}

class ApiSourceAdapter implements SourceAdapter {
  async fetch(source: Pick<ContentSource, "url" | "configuration">): Promise<ParsedSourceItem[]> {
    if (!source.url) {
      throw new Error("source_url_required");
    }
    const url = new URL(source.url);
    await validateScrapeUrl(url);
    const configuration = readConfigObject(source.configuration);
    const headers = configuration.headers && typeof configuration.headers === "object"
      ? (configuration.headers as Record<string, string>)
      : undefined;

    const response = await fetchUrl(url, {
      accept: "application/json",
      headers,
    });

    let json: unknown;
    try {
      json = JSON.parse(response.body) as unknown;
    } catch {
      throw new Error("source_api_invalid_json");
    }

    const maxItems = getNumberEnv("SCRAPE_MAX_ITEMS", 20);
    const itemsPath = typeof configuration.itemsPath === "string" ? configuration.itemsPath : "";
    const entries = resolvePath(json, itemsPath);
    const list = Array.isArray(entries) ? entries : [entries];
    const fieldMap = configuration.fields && typeof configuration.fields === "object"
      ? (configuration.fields as Record<string, string>)
      : { title: "title", url: "url" };

    const items: ParsedSourceItem[] = [];
    for (const entry of list) {
      if (items.length >= maxItems) {
        break;
      }
      const record = entry && typeof entry === "object" ? (entry as Record<string, unknown>) : {};
      const title = readField(record, fieldMap.title ?? "title") ?? "";
      if (!title) {
        continue;
      }
      const sourceUrl = readField(record, fieldMap.url ?? "url") ?? readField(record, "link") ?? null;
      const description = readField(record, fieldMap.description ?? "description") ?? null;

      items.push({
        externalId: deriveExternalId(sourceUrl, title),
        canonicalUrl: normalizeCanonicalUrl(sourceUrl),
        sourceUrl: normalizeCanonicalUrl(sourceUrl),
        title,
        description,
        rawText: description,
        cleanedText: description,
        author: readField(record, fieldMap.author ?? "author"),
        publishedAt: parseDate(readField(record, fieldMap.publishedAt ?? "published_at")),
        sourceImageUrls: asStringArray(readField(record, fieldMap.image ?? "image")),
        language: readField(record, "language"),
        categories: asStringArray(readField(record, fieldMap.categories ?? "categories")),
      });
    }

    return items;
  }
}

function readField(record: Record<string, unknown>, path: string): string | null {
  const value = resolvePath(record, path);
  return typeof value === "string" ? value.trim() || null : value === undefined || value === null ? null : String(value);
}

function resolvePath(input: unknown, path: string): unknown {
  if (!path) {
    return input;
  }
  const parts = path.split(".").map((part) => part.trim()).filter(Boolean);
  let current: unknown = input;
  for (const part of parts) {
    if (current === null || typeof current !== "object") {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

class ManualSourceAdapter implements SourceAdapter {
  async fetch(): Promise<ParsedSourceItem[]> {
    return [];
  }
}

export function getSourceAdapter(type: ContentSourceType): SourceAdapter {
  switch (type) {
    case "rss":
      return new RssSourceAdapter();
    case "atom":
      return new AtomSourceAdapter();
    case "html":
      return new HtmlSourceAdapter();
    case "sitemap":
      return new SitemapSourceAdapter();
    case "api":
      return new ApiSourceAdapter();
    case "manual":
      return new ManualSourceAdapter();
    default:
      throw new Error(`unsupported_source_type ${type}`);
  }
}

// ────────────────────────────────────────────────────────────── Service

export type CreateSourceInput = {
  siteId?: string | null;
  name: string;
  type: ContentSourceType;
  url?: string | null;
  enabled?: boolean;
  priority?: number;
  trustScore?: number;
  language?: string;
  country?: string | null;
  categories?: string[] | null;
  tags?: string[] | null;
  refreshIntervalMinutes?: number;
  configuration?: Record<string, unknown> | null;
};

export type UpdateSourceInput = Partial<CreateSourceInput>;

export async function createSource(tenantId: string, input: CreateSourceInput) {
  const source = await prisma.contentSource.create({
    data: {
      tenantId,
      siteId: input.siteId ?? null,
      name: input.name,
      type: input.type,
      url: input.url ?? null,
      enabled: input.enabled ?? true,
      priority: input.priority ?? 0,
      trustScore: input.trustScore ?? 0.5,
      language: input.language ?? "es",
      country: input.country ?? null,
      categories: input.categories ? (input.categories as Prisma.InputJsonValue) : Prisma.JsonNull,
      tags: input.tags ? (input.tags as Prisma.InputJsonValue) : Prisma.JsonNull,
      refreshIntervalMinutes: input.refreshIntervalMinutes ?? 30,
      configuration: input.configuration ? (input.configuration as Prisma.InputJsonObject) : Prisma.JsonNull,
    },
  });

  await writeAudit({
    tenantId,
    action: "source.created",
    entityType: "content_source",
    entityId: source.id,
    actorType: "user",
    metadata: { name: source.name, type: source.type, url: source.url },
  });

  return source;
}

export async function updateSource(tenantId: string, sourceId: string, input: UpdateSourceInput) {
  const existing = await prisma.contentSource.findFirst({ where: { id: sourceId, tenantId } });
  if (!existing) {
    return null;
  }

  const updated = await prisma.contentSource.update({
    where: { id: existing.id },
    data: {
      siteId: input.siteId === undefined ? undefined : input.siteId,
      name: input.name?.trim() || undefined,
      type: input.type,
      url: input.url === undefined ? undefined : input.url,
      enabled: input.enabled,
      priority: input.priority,
      trustScore: input.trustScore,
      language: input.language,
      country: input.country === undefined ? undefined : input.country,
      categories: input.categories === undefined ? undefined : input.categories ? (input.categories as Prisma.InputJsonValue) : Prisma.JsonNull,
      tags: input.tags === undefined ? undefined : input.tags ? (input.tags as Prisma.InputJsonValue) : Prisma.JsonNull,
      refreshIntervalMinutes: input.refreshIntervalMinutes,
      configuration: input.configuration === undefined ? undefined : input.configuration ? (input.configuration as Prisma.InputJsonObject) : Prisma.JsonNull,
    },
  });

  await writeAudit({
    tenantId,
    action: "source.updated",
    entityType: "content_source",
    entityId: sourceId,
    actorType: "user",
  });

  return updated;
}

export async function deleteSource(tenantId: string, sourceId: string) {
  const existing = await prisma.contentSource.findFirst({ where: { id: sourceId, tenantId } });
  if (!existing) {
    return false;
  }
  await prisma.contentSource.delete({ where: { id: existing.id } });
  await writeAudit({
    tenantId,
    action: "source.deleted",
    entityType: "content_source",
    entityId: sourceId,
    actorType: "user",
    metadata: { name: existing.name },
  });
  return true;
}

export async function getSource(tenantId: string, sourceId: string) {
  return prisma.contentSource.findFirst({
    where: { id: sourceId, tenantId },
    include: { site: { select: { id: true, name: true, key: true } } },
  });
}

export async function listSources(
  tenantId: string,
  input: { page: number; pageSize: number; type?: string; enabled?: boolean },
): Promise<PaginatedResult<unknown>> {
  const skip = (input.page - 1) * input.pageSize;
  const where: Prisma.ContentSourceWhereInput = {
    tenantId,
    ...(input.type ? { type: input.type as ContentSourceType } : {}),
    ...(input.enabled === undefined ? {} : { enabled: input.enabled }),
  };

  const [total, sources] = await prisma.$transaction([
    prisma.contentSource.count({ where }),
    prisma.contentSource.findMany({
      where,
      orderBy: [{ priority: "desc" }, { name: "asc" }],
      skip,
      take: input.pageSize,
      include: {
        _count: { select: { items: true } },
        site: { select: { id: true, name: true, key: true } },
      },
    }),
  ]);

  return {
    items: sources.map((source) => ({
      ...source,
      discoveredCount: source._count.items,
      site: source.site,
    })),
    page: input.page,
    pageSize: input.pageSize,
    total,
  };
}

export async function listDueSources(tenantId: string, now: Date = new Date()) {
  const sources = await prisma.contentSource.findMany({
    where: {
      tenantId,
      enabled: true,
      type: { not: "manual" },
      OR: [
        { lastFetchedAt: null },
        { lastFetchedAt: { lte: new Date(now.getTime() - 60_000) } },
      ],
    },
    orderBy: { priority: "desc" },
  });

  return sources.filter((source) => {
    if (!source.lastFetchedAt) {
      return true;
    }
    const intervalMs = Math.max(5, source.refreshIntervalMinutes) * 60_000;
    return now.getTime() - source.lastFetchedAt.getTime() >= intervalMs;
  });
}

export type FetchSourceResult = {
  sourceId: string;
  fetched: number;
  created: number;
  duplicates: number;
  failed: boolean;
  error: string | null;
};

export async function upsertSourceItem(
  tenantId: string,
  sourceId: string,
  item: ParsedSourceItem,
): Promise<{ created: boolean; sourceItemId: string | null }> {
  const contentHash = buildItemContentHash(item.title, item.cleanedText ?? item.description);
  const data = {
    tenantId,
    sourceId,
    externalId: item.externalId,
    canonicalUrl: item.canonicalUrl,
    sourceUrl: item.sourceUrl,
    title: item.title.slice(0, 400),
    description: item.description,
    rawText: item.rawText,
    cleanedText: item.cleanedText,
    author: item.author,
    publishedAt: item.publishedAt ? new Date(item.publishedAt) : null,
    sourceImageUrls: item.sourceImageUrls.length ? (item.sourceImageUrls as Prisma.InputJsonValue) : Prisma.JsonNull,
    language: item.language,
    categories: item.categories.length ? (item.categories as Prisma.InputJsonValue) : Prisma.JsonNull,
    contentHash,
    metadata: Prisma.JsonNull,
  };

  const existing = await prisma.sourceItem.findFirst({
    where: {
      tenantId,
      OR: [
        { sourceId, externalId: item.externalId },
        { contentHash },
      ],
    },
    select: { id: true, processingStatus: true },
  });

  if (existing) {
    return { created: false, sourceItemId: existing.id };
  }

  try {
    const created = await prisma.sourceItem.create({ data });
    return { created: true, sourceItemId: created.id };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { created: false, sourceItemId: null };
    }
    throw error;
  }
}

export async function fetchSourceNow(tenantId: string, sourceId: string): Promise<FetchSourceResult> {
  const source = await prisma.contentSource.findFirst({ where: { id: sourceId, tenantId } });
  if (!source) {
    throw new Error("source_not_found");
  }

  const result: FetchSourceResult = {
    sourceId,
    fetched: 0,
    created: 0,
    duplicates: 0,
    failed: false,
    error: null,
  };

  try {
    const adapter = getSourceAdapter(source.type);
    const items = await adapter.fetch(source);
    result.fetched = items.length;

    const createdItemIds: string[] = [];
    for (const item of items) {
      const upserted = await upsertSourceItem(tenantId, source.id, item);
      if (upserted.created) {
        result.created += 1;
        if (upserted.sourceItemId) {
          createdItemIds.push(upserted.sourceItemId);
        }
      } else {
        result.duplicates += 1;
      }
    }

    await prisma.contentSource.update({
      where: { id: source.id },
      data: {
        lastFetchedAt: new Date(),
        lastSuccessAt: new Date(),
        consecutiveFailures: 0,
      },
    });

    // Score, cluster and promote freshly discovered items immediately so the
    // inbox is useful right after a fetch.
    const context = { sourceTrustScore: source.trustScore, sourcePriority: source.priority };
    for (const itemId of createdItemIds) {
      const item = await prisma.sourceItem.findFirst({ where: { id: itemId, tenantId } });
      if (!item) {
        continue;
      }
      try {
        await scoreAndPromoteSourceItem(tenantId, item, context);
      } catch (error) {
        result.error = error instanceof Error ? error.message : String(error);
      }
    }

    await writeAudit({
      tenantId,
      action: "source.fetched",
      entityType: "content_source",
      entityId: source.id,
      actorType: source.enabled ? "automation" : "user",
      metadata: { created: result.created, duplicates: result.duplicates },
    });
  } catch (error) {
    result.failed = true;
    result.error = error instanceof Error ? error.message : String(error);
    await prisma.contentSource.update({
      where: { id: source.id },
      data: {
        lastFetchedAt: new Date(),
        consecutiveFailures: { increment: 1 },
      },
    });
  }

  return result;
}

export async function testSourceFetch(tenantId: string, input: { type: ContentSourceType; url?: string | null; configuration?: Record<string, unknown> | null }) {
  const adapter = getSourceAdapter(input.type);
  const items = await adapter.fetch({
    url: input.url ?? null,
    configuration: (input.configuration ?? null) as Prisma.JsonValue,
  });
  return { ok: true, itemCount: items.length, sample: items.slice(0, 3) };
}

// ────────────────────────────────────────────────────────────── Source items

export async function listSourceItems(
  tenantId: string,
  input: {
    page: number;
    pageSize: number;
    sourceId?: string;
    status?: SourceItemStatus;
    clusterId?: string;
    search?: string;
    minScore?: number;
    sort?: "discovered" | "score";
    direction?: "asc" | "desc";
  },
): Promise<PaginatedResult<unknown>> {
  const skip = (input.page - 1) * input.pageSize;
  const where: Prisma.SourceItemWhereInput = {
    tenantId,
    ...(input.sourceId ? { sourceId: input.sourceId } : {}),
    ...(input.status ? { processingStatus: input.status } : {}),
    ...(input.clusterId ? { clusterId: input.clusterId } : {}),
    ...(input.minScore !== undefined ? { score: { gte: input.minScore } } : {}),
    ...(input.search
      ? {
          OR: [
            { title: { contains: input.search, mode: "insensitive" } },
            { description: { contains: input.search, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const orderBy: Prisma.SourceItemOrderByWithRelationInput[] =
    input.sort === "score"
      ? [{ score: input.direction === "asc" ? "asc" : "desc" }, { discoveredAt: "desc" }]
      : [{ discoveredAt: input.direction === "asc" ? "asc" : "desc" }];

  const [total, items] = await prisma.$transaction([
    prisma.sourceItem.count({ where }),
    prisma.sourceItem.findMany({
      where,
      orderBy,
      skip,
      take: input.pageSize,
      include: {
        source: { select: { id: true, name: true, type: true, trustScore: true } },
        cluster: { select: { id: true, headline: true, sourceCount: true } },
        projects: { select: { id: true, title: true, status: true } },
      },
    }),
  ]);

  return {
    items: items.map((item) => ({
      id: item.id,
      sourceId: item.sourceId,
      clusterId: item.clusterId,
      externalId: item.externalId,
      canonicalUrl: item.canonicalUrl,
      sourceUrl: item.sourceUrl,
      title: item.title,
      description: item.description,
      author: item.author,
      publishedAt: item.publishedAt,
      discoveredAt: item.discoveredAt,
      sourceImageUrls: item.sourceImageUrls,
      language: item.language,
      categories: item.categories,
      processingStatus: item.processingStatus,
      score: item.score,
      scoreExplanation: item.scoreExplanation,
      source: item.source,
      cluster: item.cluster,
      projects: item.projects,
      projectCount: item.projects.length,
    })),
    page: input.page,
    pageSize: input.pageSize,
    total,
  };
}

export async function getSourceItemDetail(tenantId: string, itemId: string) {
  return prisma.sourceItem.findFirst({
    where: { id: itemId, tenantId },
    include: {
      source: true,
      cluster: {
        include: {
          items: {
            orderBy: { discoveredAt: "asc" },
            include: { source: { select: { id: true, name: true, type: true, trustScore: true } } },
          },
        },
      },
      projects: { select: { id: true, title: true, status: true, site: { select: { id: true, key: true, name: true } } } },
    },
  });
}

export async function setSourceItemStatus(
  tenantId: string,
  itemId: string,
  status: SourceItemStatus,
  actor: { userId?: string | null } = {},
) {
  const item = await prisma.sourceItem.findFirst({ where: { id: itemId, tenantId } });
  if (!item) {
    return null;
  }
  const updated = await prisma.sourceItem.update({
    where: { id: item.id },
    data: { processingStatus: status },
  });

  if (item.clusterId) {
    await prisma.storyCluster.update({
      where: { id: item.clusterId },
      data: { lastSeenAt: new Date() },
    });
  }

  await writeAudit({
    tenantId,
    action: `source_item.${status}`,
    entityType: "source_item",
    entityId: item.id,
    actorType: actor.userId ? "user" : "system",
    actorUserId: actor.userId ?? null,
  });

  return updated;
}

export async function markSourceItemsStatus(
  tenantId: string,
  itemIds: string[],
  status: SourceItemStatus,
) {
  return prisma.sourceItem.updateMany({
    where: { tenantId, id: { in: itemIds } },
    data: { processingStatus: status },
  });
}
