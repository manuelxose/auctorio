import { load } from "cheerio";
import type { ContentImage, ContentProject, ContentVersion, Site } from "@prisma/client";
import { buildAssetPublicUrl } from "./orchestration";
import { sanitizeEditorialHtml } from "./html-sanitizer";
import { getPrismaClient } from "../infrastructure/db/prisma";

/**
 * Public article feed for client sites that pull their content instead of receiving a push
 * (`GET /api/integrations/v1/articles`). It is the same contract GuíaTV already consumes from
 * BabyLoveGrowth, so a client needs one integration, not one per producer: the article body,
 * its SEO metadata, the JSON-LD for the page head, the cover image and the idempotency key (slug).
 */

export const FEED_MAX_PAGE = 50;

export interface FeedArticleSummary {
  id: string;
  slug: string;
  title: string;
  publishedAt: string;
  languageCode: string;
  meta_description: string;
  hero_image_url: string;
}

export interface FeedArticle extends FeedArticleSummary {
  content_html: string;
  content_markdown: string;
  jsonLd: Record<string, unknown>;
  faqJsonLd: Record<string, unknown> | null;
  /** The live URL on the client's site, once its publisher reports it; empty until then. */
  published_url: string;
}

export interface FeedFaqItem {
  question: string;
  answer: string;
}

export interface FeedArticleSource
  extends Pick<
    ContentVersion,
    "id" | "title" | "excerpt" | "bodyHtml" | "seoTitle" | "seoDescription" | "publishedAt" | "updatedAt"
  > {
  project: Pick<ContentProject, "title" | "primaryLanguage" | "metadata"> & {
    site?: Pick<Site, "name" | "baseUrl"> | null;
  };
  contentImage?: Pick<ContentImage, "storagePath"> | null;
  /** Live URL reported by the publisher (Publication.externalUrl, website channel). */
  publishedUrl?: string | null;
  /** Cover URL resolved by the caller; derived from `contentImage` when omitted. */
  assetUrl?: string | null;
}

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

const clean = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

const withoutEmpty = (input: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(Object.entries(input).filter(([, value]) => {
    if (value === undefined || value === null || value === "") return false;
    if (Array.isArray(value) && value.length === 0) return false;
    return true;
  }));

export function slugifyTitle(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96);
}

/** The project metadata holds the approved slug; the title is the fallback, never empty. */
export function feedSlug(source: FeedArticleSource): string {
  const metadata = asRecord(source.project.metadata);
  return clean(metadata.slug).replace(/^\/+/, "") || slugifyTitle(source.title || source.project.title) || source.id;
}

export function feedFaqItems(source: FeedArticleSource): FeedFaqItem[] {
  const value = asRecord(source.project.metadata).faqItems;
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => asRecord(item))
    .filter((item) => clean(item.question) && clean(item.answer))
    .map((item) => ({ question: clean(item.question), answer: clean(item.answer) }));
}

export function buildFaqJsonLd(items: FeedFaqItem[]): Record<string, unknown> | null {
  if (!items.length) return null;
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answer },
    })),
  };
}

export function buildArticleJsonLd(input: {
  title: string;
  description: string;
  image: string;
  publishedAt: string;
  modifiedAt: string;
  languageCode: string;
  url: string;
  publisherName: string;
  publisherUrl: string;
}): Record<string, unknown> {
  return withoutEmpty({
    "@context": "https://schema.org",
    "@type": "Article",
    headline: input.title,
    description: input.description,
    image: input.image ? [input.image] : [],
    datePublished: input.publishedAt,
    dateModified: input.modifiedAt,
    inLanguage: input.languageCode,
    mainEntityOfPage: input.url,
    url: input.url,
    author: input.publisherName ? { "@type": "Organization", name: input.publisherName } : undefined,
    publisher: input.publisherName
      ? withoutEmpty({ "@type": "Organization", name: input.publisherName, url: input.publisherUrl })
      : undefined,
  });
}

/**
 * The Markdown alternative of the article body. It covers the tags the editorial sanitizer allows and stays
 * deliberately simple: models, cells and nested lists are flattened to readable Markdown, not a faithful mirror.
 */
export function htmlToMarkdown(html: string | null | undefined): string {
  if (!html || !html.trim()) return "";
  const $ = load(html);

  const render = (node: any): string => {
    if (node.type === "text") return String(node.data ?? "").replace(/\s+/g, " ");
    if (node.type !== "tag") return "";
    const tag = String(node.name || "").toLowerCase();
    const inner = (): string => ((node.children || []) as any[]).map(render).join("").trim();

    switch (tag) {
      case "h2":
      case "h3":
      case "h4":
        return `\n\n${"#".repeat(Number(tag.slice(1)))} ${inner()}\n\n`;
      case "p":
        return `\n\n${inner()}\n\n`;
      case "br":
        return "  \n";
      case "strong":
      case "b":
        return `**${inner()}**`;
      case "em":
      case "i":
        return `_${inner()}_`;
      case "u":
        return `<u>${inner()}</u>`;
      case "blockquote":
        return `\n\n> ${inner().replace(/\n+/g, " ")}\n\n`;
      case "ul":
      case "ol":
        return `\n\n${renderList(node, tag === "ol")}\n\n`;
      case "hr":
        return "\n\n---\n\n";
      case "a": {
        const href = clean($(node).attr("href"));
        const label = inner();
        return href ? `[${label || href}](${href})` : label;
      }
      case "img": {
        const src = clean($(node).attr("src"));
        return src ? `![${clean($(node).attr("alt"))}](${src})` : "";
      }
      case "figure":
        return `\n\n${inner()}\n\n`;
      case "figcaption":
        return `\n\n_${inner()}_\n\n`;
      case "table":
        return `\n\n${renderTable($, node)}\n\n`;
      default:
        return inner();
    }
  };

  const rendered = ((($("body").get(0) as any)?.children || []) as any[]).map(render).join("");
  return rendered.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function renderList(node: any, ordered: boolean, depth = 0): string {
  const items = ((node.children || []) as any[]).filter((child) => String(child.name || "").toLowerCase() === "li");
  return items
    .map((item, index) => {
      const marker = ordered ? `${index + 1}.` : "-";
      const text = ((item.children || []) as any[])
        .map((child: any) => {
          // A nested list keeps its own lines; everything else collapses into the item text.
          if (["ul", "ol"].includes(String(child.name || "").toLowerCase())) return "";
          if (child.type === "text") return String(child.data ?? "").replace(/\s+/g, " ");
          if (child.type !== "tag") return "";
          return renderInline(child);
        })
        .join("")
        .trim();
      const nested = ((item.children || []) as any[]).filter((child) =>
        ["ul", "ol"].includes(String(child.name || "").toLowerCase()),
      );
      const nestedText = nested
        .map((child: any) => renderList(child, String(child.name || "").toLowerCase() === "ol", depth + 1))
        .join("\n");
      return `${"  ".repeat(depth)}${marker} ${text}${nestedText ? `\n${nestedText}` : ""}`;
    })
    .join("\n");
}

function renderInline(node: any): string {
  const tag = String(node.name || "").toLowerCase();
  const text = ((node.children || []) as any[])
    .map((child: any) => (child.type === "text" ? String(child.data ?? "") : renderInline(child)))
    .join("")
    .replace(/\s+/g, " ")
    .trim();
  if (tag === "strong" || tag === "b") return `**${text}**`;
  if (tag === "em" || tag === "i") return `_${text}_`;
  return text;
}

function renderTable($: ReturnType<typeof load>, node: any): string {
  const rows = $(node)
    .find("tr")
    .toArray()
    .map((row) =>
      $(row)
        .find("th,td")
        .toArray()
        .map((cell) => $(cell).text().replace(/\s+/g, " ").trim()),
    )
    .filter((cells) => cells.length);
  if (!rows.length) return "";
  const width = Math.max(...rows.map((cells) => cells.length));
  const line = (cells: string[]) =>
    `| ${Array.from({ length: width }, (_, index) => cells[index] ?? "").join(" | ")} |`;
  return [line(rows[0]), `| ${Array.from({ length: width }, () => "---").join(" | ")} |`, ...rows.slice(1).map(line)].join("\n");
}

const languageCodeOf = (source: FeedArticleSource): string => {
  const metadata = asRecord(source.project.metadata);
  return clean(source.project.primaryLanguage) || clean(metadata.languageCode) || "es";
};

const publishedAtOf = (source: FeedArticleSource): string =>
  (source.publishedAt ?? source.updatedAt).toISOString();

const titleOf = (source: FeedArticleSource): string =>
  clean(source.title) || clean(source.project.title);

const metaDescriptionOf = (source: FeedArticleSource): string =>
  clean(source.seoDescription) || clean(source.excerpt);

async function heroImageOf(source: FeedArticleSource): Promise<string> {
  if (source.assetUrl !== undefined) return clean(source.assetUrl);
  return clean(await buildAssetPublicUrl(source.contentImage?.storagePath ?? null));
}

export async function buildFeedSummary(source: FeedArticleSource): Promise<FeedArticleSummary> {
  return {
    id: source.id,
    slug: feedSlug(source),
    title: titleOf(source),
    publishedAt: publishedAtOf(source),
    languageCode: languageCodeOf(source),
    meta_description: metaDescriptionOf(source),
    hero_image_url: await heroImageOf(source),
  };
}

export async function buildFeedArticle(source: FeedArticleSource): Promise<FeedArticle> {
  const summary = await buildFeedSummary(source);
  const site = source.project.site ?? null;
  const publishedUrl = clean(source.publishedUrl);
  return {
    ...summary,
    content_html: sanitizeEditorialHtml(source.bodyHtml ?? ""),
    content_markdown: htmlToMarkdown(source.bodyHtml ?? ""),
    jsonLd: buildArticleJsonLd({
      title: summary.title,
      description: summary.meta_description,
      image: summary.hero_image_url,
      publishedAt: summary.publishedAt,
      modifiedAt: source.updatedAt.toISOString(),
      languageCode: summary.languageCode,
      url: publishedUrl,
      publisherName: clean(site?.name),
      publisherUrl: clean(site?.baseUrl),
    }),
    faqJsonLd: buildFaqJsonLd(feedFaqItems(source)),
    published_url: publishedUrl,
  };
}

export interface FeedQuery {
  tenantId: string;
  /** Site key scopes the feed to one destination (e.g. `guiatv-editorial`); absent = every site of the tenant. */
  siteKey?: string | null;
}

/** `ok: false` means the tenant has no such site: the request is a 404, not an empty feed. */
export async function resolveFeedSite(query: FeedQuery): Promise<{ ok: boolean; siteId?: string }> {
  const siteKey = clean(query.siteKey);
  if (!siteKey) return { ok: true };
  const site = await getPrismaClient().site.findFirst({
    where: { tenantId: query.tenantId, key: siteKey },
    select: { id: true },
  });
  return site ? { ok: true, siteId: site.id } : { ok: false };
}

const publishedWhere = (tenantId: string, siteId?: string) => ({
  tenantId,
  publishedAt: { not: null },
  project: { deletedAt: null, ...(siteId ? { siteId } : {}) },
});

export async function listFeedArticles(
  query: FeedQuery & { limit: number; offset: number },
): Promise<{ items: FeedArticleSummary[]; total: number } | null> {
  const site = await resolveFeedSite(query);
  if (!site.ok) return null;
  const where = publishedWhere(query.tenantId, site.siteId);
  const prisma = getPrismaClient();

  const [rows, total] = await Promise.all([
    prisma.contentVersion.findMany({
      where,
      orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
      skip: query.offset,
      take: query.limit,
      include: { project: { include: { site: true } }, contentImage: true },
    }),
    prisma.contentVersion.count({ where }),
  ]);

  return { items: await Promise.all(rows.map((row) => buildFeedSummary(row))), total };
}

export async function getFeedArticle(
  query: FeedQuery & { id: string },
): Promise<FeedArticle | null | { siteNotFound: true }> {
  const site = await resolveFeedSite(query);
  if (!site.ok) return { siteNotFound: true };

  const row = await getPrismaClient().contentVersion.findFirst({
    where: { ...publishedWhere(query.tenantId, site.siteId), id: query.id },
    include: {
      project: { include: { site: true } },
      contentImage: true,
      publications: {
        where: { channel: "website", status: "published" },
        orderBy: { updatedAt: "desc" },
      },
    },
  });
  if (!row) return null;

  return buildFeedArticle({ ...row, publishedUrl: row.publications.find((item) => clean(item.externalUrl))?.externalUrl });
}
