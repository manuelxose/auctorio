import { load } from "cheerio";
import { Prisma } from "@prisma/client";
import type { Site } from "@prisma/client";
import { getPrismaClient } from "../../infrastructure/db/prisma";
import { fetchUrl, validateScrapeUrl } from "../../infrastructure/scraping";
import { getNumberEnv } from "../../shared/utils/env";
import { sha256 } from "../../shared/utils/hash";
import { normalizePageUrl } from "./sitemap";

const prisma = getPrismaClient();

export type ExtractedPage = {
  url: string;
  canonicalUrl: string | null;
  title: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
  h1: string | null;
  headings: string[];
  content: string;
  wordCount: number;
  publishedAt: string | null;
  modifiedAt: string | null;
  author: string | null;
  categories: string[];
  tags: string[];
  images: string[];
  structuredDataTypes: string[];
  ogTitle: string | null;
  ogDescription: string | null;
  ogImage: string | null;
  language: string | null;
  contentType: string | null;
  internalLinks: Array<{ targetUrl: string; anchorText: string }>;
};

const BOILERPLATE_SELECTORS = [
  "script",
  "style",
  "noscript",
  "iframe",
  "form",
  "svg",
  "nav",
  "header",
  "footer",
  "aside",
  "[role='navigation']",
  "[aria-hidden='true']",
  ".cookie-banner",
  ".cookie-consent",
  ".consent-banner",
  ".newsletter",
  ".sidebar",
  ".ads",
  ".ad-container",
  ".advertisement",
  "[class*='cookie']",
  "[class*='Cookie']",
  "[id*='cookie']",
  "[class*='banner-consent']",
];

function firstText(...values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    if (value && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

function compact(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function readMeta($: ReturnType<typeof load>, name: string): string | null {
  return compact($(`meta[name="${name}"]`).attr("content") ?? "") || null;
}

function readMetaProperty($: ReturnType<typeof load>, property: string): string | null {
  return compact($(`meta[property="${property}"]`).attr("content") ?? "") || null;
}

function readArticleDates($: ReturnType<typeof load>): { published: string | null; modified: string | null } {
  const candidates: Array<string | null> = [
    readMetaProperty($, "article:published_time"),
    readMetaProperty($, "article:modified_time"),
    readMeta($, "date"),
    readMeta($, "last-modified"),
    $("time[datetime]").first().attr("datetime") ?? null,
    readMetaProperty($, "og:updated_time"),
  ];
  const parsed = candidates.map((value) => {
    if (!value) {
      return null;
    }
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  });
  return { published: parsed[0] ?? null, modified: parsed[1] ?? parsed[3] ?? null };
}

function readJsonLdTypes($: ReturnType<typeof load>): string[] {
  const types = new Set<string>();
  $('script[type="application/ld+json"]').each((_, element) => {
    const raw = $(element).text().trim();
    if (!raw) {
      return;
    }
    try {
      const parsed = JSON.parse(raw);
      const collect = (value: unknown) => {
        if (!value || typeof value !== "object") {
          return;
        }
        if (Array.isArray(value)) {
          for (const item of value) {
            collect(item);
          }
          return;
        }
        const record = value as Record<string, unknown>;
        const type = record["@type"];
        if (typeof type === "string") {
          types.add(type);
        } else if (Array.isArray(type)) {
          for (const entry of type) {
            if (typeof entry === "string") {
              types.add(entry);
            }
          }
        }
        if (record["@graph"] && Array.isArray(record["@graph"])) {
          for (const item of record["@graph"]) {
            collect(item);
          }
        }
      };
      collect(parsed);
    } catch {
      // Ignore malformed JSON-LD.
    }
  });
  return Array.from(types);
}

/** Infer a coarse content type from URL patterns and metadata. */
export function inferContentTypeFromUrl(url: string): string {
  const path = new URL(url).pathname.toLowerCase();
  if (/(^|\/)(donde-ver|donde-ver-hoy|ver-online|como-ver)(\/|$)/.test(path)) return "where-to-watch";
  if (/(^|\/)(guia|programacion|parrilla|horario)(\/|$)/.test(path)) return "schedule";
  if (/(^|\/)(ranking|top|mejores|listas)(\/|$)/.test(path)) return "ranking";
  if (/(^|\/)(comparativa|comparacion|vs)(\/|$)/.test(path)) return "comparison";
  if (/(^|\/)(streaming|plataformas|servicios-streaming)(\/|$)/.test(path)) return "streaming";
  if (/(^|\/)(futbol|deportes|champions|laliga|premier)(\/|$)/.test(path)) return "sports";
  if (/(^|\/)(noticias|news)(\/|$)/.test(path)) return "news";
  if (/(^|\/)(peliculas|pelicula)(\/|$)/.test(path)) return "movies";
  if (/(^|\/)(series)(\/|$)/.test(path)) return "series";
  if (/(^|\/)(canales|cadena)(\/|$)/.test(path)) return "channels";
  return "article";
}

/** Pure HTML extraction (no network). Unit-testable. */
export function extractPageFromHtml(baseUrl: string, pageUrl: string, html: string): ExtractedPage | null {
  const normalizedBase = baseUrl.replace(/\/$/, "");
  const $ = load(html);
  // JSON-LD must be read before boilerplate removal (script tags are removed).
  const jsonLdTypes = readJsonLdTypes($);
  $(BOILERPLATE_SELECTORS.join(",")).remove();

  const title = firstText($("head title").text(), $("h1").first().text());
  const h1 = firstText($("h1").first().text());
  const metaTitle = readMetaProperty($, "og:title") ?? title;
  const metaDescription = readMetaProperty($, "og:description") ?? readMeta($, "description");

  const mainContent = $("main, article, [role='main'], .content, .entry-content, .post-content, #content").first();
  const contentRoot = mainContent.length > 0 ? mainContent : $("body");
  const content = compact(contentRoot.text()).slice(0, getNumberEnv("SITE_INTEL_MAX_PAGE_TEXT_CHARS", 12_000));

  const wordCount = content ? content.split(/\s+/).filter(Boolean).length : 0;
  if (wordCount < getNumberEnv("SITE_INTEL_MIN_PAGE_WORDS", 40)) {
    return null;
  }

  const headings: string[] = [];
  contentRoot.find("h2, h3").each((_, element) => {
    const text = compact($(element).text());
    if (text) {
      headings.push(text);
    }
  });

  const canonicalHref = $("link[rel='canonical']").attr("href") ?? null;
  const canonicalUrl = canonicalHref ? normalizePageUrl(normalizedBase, canonicalHref) : pageUrl;

  const internalLinks: Array<{ targetUrl: string; anchorText: string }> = [];
  const seenLinks = new Set<string>();
  contentRoot.find("a[href]").each((_, element) => {
    const href = $(element).attr("href") ?? "";
    const normalized = normalizePageUrl(normalizedBase, href);
    if (!normalized || seenLinks.has(normalized) || normalized === pageUrl) {
      return;
    }
    seenLinks.add(normalized);
    const anchor = compact($(element).text());
    internalLinks.push({ targetUrl: normalized, anchorText: anchor });
  });

  const images: string[] = [];
  contentRoot.find("img[src]").each((_, element) => {
    const src = $(element).attr("src");
    if (!src) {
      return;
    }
    const alt = compact($(element).attr("alt") ?? "");
    try {
      const normalized = new URL(src, normalizedBase).toString();
      images.push(alt ? `${normalized} :: ${alt.slice(0, 120)}` : normalized);
    } catch {
      // Ignore malformed image urls.
    }
  });

  const dates = readArticleDates($);

  return {
    url: pageUrl,
    canonicalUrl,
    title,
    metaTitle,
    metaDescription,
    h1,
    headings: headings.slice(0, 40),
    content,
    wordCount,
    publishedAt: dates.published,
    modifiedAt: dates.modified,
    author: readMeta($, "author") ?? readMetaProperty($, "article:author"),
    categories: [],
    tags: [],
    images: images.slice(0, 20),
    structuredDataTypes: jsonLdTypes,
    ogTitle: readMetaProperty($, "og:title"),
    ogDescription: readMetaProperty($, "og:description"),
    ogImage: readMetaProperty($, "og:image"),
    language: $("html").attr("lang") ?? null,
    contentType: inferContentTypeFromUrl(pageUrl),
    internalLinks,
  };
}

/**
 * Fetch and extract the meaningful content of a destination page.
 * SSRF-safe via validateScrapeUrl and size-bounded.
 */
export async function extractPage(site: Pick<Site, "baseUrl">, pageUrl: string): Promise<ExtractedPage | null> {
  if (!site.baseUrl) {
    return null;
  }
  const baseUrl = site.baseUrl.replace(/\/$/, "");
  const url = new URL(pageUrl);
  if (!sameOriginText(baseUrl, pageUrl)) {
    return null;
  }
  await validateScrapeUrl(url);

  const maxBytes = getNumberEnv("SITE_INTEL_MAX_PAGE_BYTES", 1_000_000);
  const response = await fetchUrl(url, { accept: "text/html" });
  if (Buffer.byteLength(response.body, "utf8") > maxBytes) {
    return null;
  }

  return extractPageFromHtml(baseUrl, pageUrl, response.body);
}

function sameOriginText(baseUrl: string, candidate: string): boolean {
  try {
    return new URL(baseUrl).hostname === new URL(candidate).hostname;
  } catch {
    return false;
  }
}

/** Ensure every discovered sitemap URL has an indexed-page row (inventory first, crawl later). */
export async function upsertDiscoveredPages(
  tenantId: string,
  siteId: string,
  entries: Array<{ loc: string; lastmod?: string | null }>,
  sitemapId?: string | null,
): Promise<{ created: number; updated: number }> {
  let created = 0;
  let updated = 0;
  for (const entry of entries) {
    const existing = await prisma.siteIndexedPage.findUnique({
      where: { siteId_url: { siteId, url: entry.loc } },
    });
    const lastmod = entry.lastmod ? new Date(entry.lastmod) : null;
    if (existing) {
      const patch: Record<string, unknown> = { crawlState: existing.crawlState === "extracted" ? existing.crawlState : "discovered" };
      if (sitemapId && !existing.sitemapId) {
        patch.sitemapId = sitemapId;
      }
      if (lastmod && (!existing.modifiedAt || lastmod > existing.modifiedAt)) {
        patch.modifiedAt = lastmod;
        if (existing.crawlState === "extracted") {
          patch.crawlState = "stale";
        }
      }
      await prisma.siteIndexedPage.update({ where: { id: existing.id }, data: patch });
      updated += 1;
    } else {
      await prisma.siteIndexedPage.create({
        data: {
          tenantId,
          siteId,
          sitemapId,
          url: entry.loc,
          modifiedAt: lastmod,
          crawlState: "discovered",
        },
      });
      created += 1;
    }
  }
  return { created, updated };
}

export type CrawlBatchResult = {
  extracted: number;
  failed: number;
  skipped: number;
  errors: string[];
};

/** Crawl eligible destination pages with a budget, respecting rate limits. */
export async function crawlPagesForSite(
  site: Pick<Site, "id" | "tenantId" | "baseUrl">,
  options: { budget?: number; changedOnly?: boolean } = {},
): Promise<CrawlBatchResult> {
  const budget = options.budget ?? getNumberEnv("SITE_INTEL_CRAWL_BUDGET", 200);
  const changedOnly = options.changedOnly ?? false;
  const now = new Date();

  const where: Record<string, unknown> = {
    tenantId: site.tenantId,
    siteId: site.id,
    crawlState: changedOnly ? "stale" : { in: ["discovered", "failed", "stale"] },
  };
  const pages = await prisma.siteIndexedPage.findMany({
    where,
    orderBy: [{ crawlState: "asc" }, { modifiedAt: "desc" }],
    take: Math.min(budget, 500),
    select: { id: true, url: true },
  });

  const result: CrawlBatchResult = { extracted: 0, failed: 0, skipped: 0, errors: [] };
  for (const page of pages) {
    try {
      const extracted = await extractPage(site, page.url);
      if (!extracted) {
        await prisma.siteIndexedPage.update({
          where: { id: page.id },
          data: { crawlState: "skipped", error: "low_content_or_blocked", lastIndexedAt: now },
        });
        result.skipped += 1;
        continue;
      }

      const contentHash = sha256(extracted.content);
      const existing = await prisma.siteIndexedPage.findUnique({ where: { id: page.id } });
      if (existing?.contentHash === contentHash && existing.crawlState === "extracted") {
        await prisma.siteIndexedPage.update({
          where: { id: page.id },
          data: { crawlState: "extracted", lastIndexedAt: now, modifiedAt: extracted.modifiedAt ? new Date(extracted.modifiedAt) : undefined },
        });
        result.skipped += 1;
        continue;
      }

      await prisma.siteIndexedPage.update({
        where: { id: page.id },
        data: {
          canonicalUrl: extracted.canonicalUrl,
          title: extracted.title?.slice(0, 400) ?? null,
          metaTitle: extracted.metaTitle?.slice(0, 400) ?? null,
          metaDescription: extracted.metaDescription?.slice(0, 1000) ?? null,
          h1: extracted.h1?.slice(0, 400) ?? null,
          headings: extracted.headings as unknown as Prisma.InputJsonValue,
          content: extracted.content,
          wordCount: extracted.wordCount,
          publishedAt: extracted.publishedAt ? new Date(extracted.publishedAt) : null,
          modifiedAt: extracted.modifiedAt ? new Date(extracted.modifiedAt) : existing?.modifiedAt ?? null,
          author: extracted.author?.slice(0, 200) ?? null,
          images: extracted.images as unknown as Prisma.InputJsonValue,
          structuredData: extracted.structuredDataTypes as unknown as Prisma.InputJsonValue,
          ogMetadata: {
            title: extracted.ogTitle,
            description: extracted.ogDescription,
            image: extracted.ogImage,
          } as unknown as Prisma.InputJsonValue,
          language: extracted.language?.slice(0, 20) ?? null,
          contentType: extracted.contentType,
          crawlState: "extracted",
          contentHash,
          firstIndexedAt: existing?.firstIndexedAt ?? now,
          lastIndexedAt: now,
          error: null,
        },
      });

      if (extracted.internalLinks.length > 0) {
        const linkRows = extracted.internalLinks.slice(0, 100).map((link) => ({
          tenantId: site.tenantId,
          siteId: site.id,
          sourcePageId: page.id,
          targetUrl: link.targetUrl.slice(0, 2048),
          anchorText: (link.anchorText || "").slice(0, 300) || null,
        }));
        await prisma.$transaction(
          linkRows.map((row) =>
            prisma.siteInternalLink.upsert({
              where: { sourcePageId_targetUrl: { sourcePageId: row.sourcePageId, targetUrl: row.targetUrl } },
              create: row,
              update: { anchorText: row.anchorText },
            }),
          ),
        );
      }
      result.extracted += 1;
    } catch (error) {
      result.failed += 1;
      const message = error instanceof Error ? error.message : String(error);
      if (result.errors.length < 20) {
        result.errors.push(`${page.url}: ${message}`);
      }
      await prisma.siteIndexedPage.update({
        where: { id: page.id },
        data: { crawlState: "failed", error: message.slice(0, 500), lastIndexedAt: now },
      });
    }
  }

  return result;
}
