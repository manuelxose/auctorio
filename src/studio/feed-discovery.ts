// Feed discovery: when adding a domain or URL, inspect the page HTML for
// `<link rel="alternate">`, common feed paths, robots.txt sitemap
// declarations, sitemap.xml and news sitemaps.
//
// Discovery only presents verified candidates to the operator — nothing is
// subscribed automatically. Every candidate that claims "verified" was
// actually fetched and parsed successfully in this run.

import { load } from "cheerio";
import { validateScrapeUrl } from "../infrastructure/scraping";
import { fetchSourceHttp, SourceHttpError, SourceNotModifiedError } from "./adapters/http";
import { parseRssItems } from "./adapters/rss";
import { parseAtomItems } from "./adapters/atom";
import { parseSitemapItems } from "./adapters/sitemap";
import { normalizeCanonicalUrl, resolveRelativeUrl } from "./adapters/normalize";
import { getNumberEnv } from "../shared/utils/env";

export type FeedCandidateType = "rss" | "atom" | "sitemap" | "news_sitemap" | "feed";

export type FeedCandidate = {
  url: string;
  type: FeedCandidateType;
  method: "link_alternate" | "common_path" | "robots_txt" | "sitemap_index" | "news_sitemap" | "root_sitemap";
  title: string | null;
  verified: boolean;
  status: number | null;
  contentType: string | null;
  itemCount: number | null;
  note: string | null;
};

export type FeedDiscoveryResult = {
  pageUrl: string;
  hostname: string;
  robotsChecked: boolean;
  candidates: FeedCandidate[];
  errors: string[];
};

const COMMON_FEED_PATHS = ["/feed", "/feed/", "/rss", "/rss.xml", "/feed.xml", "/atom.xml", "/index.xml"];
const COMMON_NEWS_SITEMAP_PATHS = ["/news-sitemap.xml", "/post_google_news.xml"];

const MAX_CANDIDATE_CHECKS = 14;

/** Parse `<link rel="alternate">` / `<link rel="feed">` declarations from HTML.
 *  Pure — deterministic tests. */
export function extractFeedLinksFromHtml(html: string, baseUrl: string): Array<{ url: string; type: FeedCandidateType; title: string | null; method: "link_alternate" }> {
  const $ = load(html);
  const found = new Map<string, { url: string; type: FeedCandidateType; title: string | null; method: "link_alternate" }>();

  const consider = (href: string | undefined, typeAttr: string | undefined, title: string | null) => {
    const resolved = resolveRelativeUrl(baseUrl, href);
    if (!resolved) {
      return;
    }
    const typeLower = (typeAttr ?? "").toLowerCase();
    const hrefLower = resolved.toLowerCase();
    let candidateType: FeedCandidateType;
    if (typeLower.includes("atom")) {
      candidateType = "atom";
    } else if (typeLower.includes("rss") || /(rss|\.rss|feed|\.xml)/i.test(hrefLower)) {
      candidateType = "rss";
    } else {
      return; // not a feed declaration
    }
    const existing = found.get(resolved);
    if (!existing || (title && !existing.title)) {
      found.set(resolved, { url: resolved, type: candidateType, title: title ?? existing?.title ?? null, method: "link_alternate" });
    }
  };

  $('link[rel*="alternate"], link[rel="feed"]').each((_index, element) => {
    const rel = ($(element).attr("rel") ?? "").toLowerCase();
    const href = $(element).attr("href");
    const typeAttr = $(element).attr("type");
    const title = $(element).attr("title") ?? null;
    if (rel.includes("alternate") || rel === "feed") {
      consider(href, typeAttr, title);
    }
  });

  return Array.from(found.values());
}

/** Parse sitemap declarations from robots.txt. Pure — deterministic tests. */
export function extractSitemapUrlsFromRobots(body: string): string[] {
  const urls: string[] = [];
  for (const rawLine of body.split("\n")) {
    const match = /^sitemap\s*:\s*(.+)$/i.exec(rawLine.trim());
    if (match) {
      const url = normalizeCanonicalUrl(match[1].trim());
      if (url) {
        urls.push(url);
      }
    }
  }
  return Array.from(new Set(urls));
}

function classifySitemapUrl(url: string): FeedCandidateType {
  return /news|google_news|news[-_]sitemap/i.test(url) ? "news_sitemap" : "sitemap";
}

/** Verify a candidate endpoint: fetch (bounded) and try to parse it. */
export async function verifyFeedCandidate(url: string): Promise<{
  verified: boolean;
  status: number | null;
  contentType: string | null;
  itemCount: number | null;
  type: FeedCandidateType | null;
  note: string | null;
}> {
  const parsedUrl = normalizeCanonicalUrl(url);
  if (!parsedUrl) {
    return { verified: false, status: null, contentType: null, itemCount: null, type: null, note: "invalid_url" };
  }
  try {
    await validateScrapeUrl(new URL(parsedUrl));
  } catch {
    return { verified: false, status: null, contentType: null, itemCount: null, type: null, note: "blocked_url" };
  }
  try {
    const response = await fetchSourceHttp(new URL(parsedUrl), {
      accept: "application/rss+xml,application/atom+xml,application/xml,text/xml,text/html",
      timeoutMs: 8_000,
      connectTimeoutMs: 4_000,
      retryAttempts: 1,
      maxBytes: 2 * 1024 * 1024,
    });
    const contentType = response.contentType.toLowerCase();
    const looksXml = contentType.includes("xml") || /^\s*<\?xml|^\s*<(rss|feed|urlset|sitemapindex)/i.test(response.body);
    if (!looksXml) {
      return { verified: false, status: response.status, contentType: response.contentType, itemCount: null, type: null, note: "not_a_feed" };
    }
    // Try the three document families in order; count items without keeping
    // raw payloads in memory beyond this call.
    for (const [family, parser] of [
      ["rss", (xml: string, base: string, max: number) => parseRssItems(xml, base, max)],
      ["atom", (xml: string, base: string, max: number) => parseAtomItems(xml, base, max)],
      ["sitemap", (xml: string, base: string, max: number) => parseSitemapItems(xml, base, max)],
    ] as const) {
      try {
        const items = parser(response.body, response.finalUrl, 5);
        const sitemapFamily = family === "sitemap" && /news:news/i.test(response.body);
        const type: FeedCandidateType = family === "sitemap" ? (sitemapFamily ? "news_sitemap" : "sitemap") : family;
        return { verified: true, status: response.status, contentType: response.contentType, itemCount: items.length, type, note: null };
      } catch {
        // next family
      }
    }
    return { verified: false, status: response.status, contentType: response.contentType, itemCount: null, type: null, note: "unparseable_xml" };
  } catch (error) {
    if (error instanceof SourceNotModifiedError) {
      return { verified: true, status: 304, contentType: null, itemCount: null, type: null, note: "not_modified" };
    }
    const status = error instanceof SourceHttpError ? error.status : null;
    return { verified: false, status, contentType: null, itemCount: null, type: null, note: error instanceof Error ? error.message : String(error) };
  }
}

/** Discover and verify feed/sitemap endpoints for a URL or domain. */
export async function discoverFeedsForUrl(input: { url: string }): Promise<FeedDiscoveryResult> {
  const errors: string[] = [];
  const pageUrl = normalizeCanonicalUrl(input.url) ?? input.url;
  let base: URL;
  try {
    base = new URL(pageUrl);
  } catch {
    return { pageUrl, hostname: "", robotsChecked: false, candidates: [], errors: ["invalid_url"] };
  }
  const hostname = base.hostname.toLowerCase();
  const candidates: FeedCandidate[] = [];
  const seen = new Set<string>();

  const addCandidate = (candidate: FeedCandidate) => {
    const key = `${candidate.type}:${candidate.url}`;
    if (!seen.has(key) && seen.size < 40) {
      seen.add(key);
      candidates.push(candidate);
    }
  };

  // 1. Page HTML → <link rel="alternate"> / rel="feed".
  try {
    await validateScrapeUrl(base);
    const htmlResponse = await fetchSourceHttp(base, {
      accept: "text/html,application/xhtml+xml",
      timeoutMs: 8_000,
      connectTimeoutMs: 4_000,
      retryAttempts: 1,
      maxBytes: 3 * 1024 * 1024,
    });
    for (const link of extractFeedLinksFromHtml(htmlResponse.body, htmlResponse.finalUrl)) {
      addCandidate({ url: link.url, type: link.type, method: "link_alternate", title: link.title, verified: false, status: null, contentType: null, itemCount: null, note: null });
    }
  } catch (error) {
    errors.push(`page_fetch: ${error instanceof Error ? error.message : String(error)}`);
  }

  // 2. Common feed paths on the same host.
  const origin = `https://${hostname}`;
  for (const path of COMMON_FEED_PATHS) {
    addCandidate({ url: `${origin}${path}`, type: "feed", method: "common_path", title: null, verified: false, status: null, contentType: null, itemCount: null, note: null });
  }

  // 3. robots.txt sitemap declarations.
  let robotsChecked = false;
  let sitemapDeclarations: string[] = [];
  try {
    const robotsUrl = new URL(`https://${hostname}/robots.txt`);
    await validateScrapeUrl(robotsUrl);
    const robotsResponse = await fetchSourceHttp(robotsUrl, {
      accept: "text/plain",
      timeoutMs: 6_000,
      connectTimeoutMs: 4_000,
      retryAttempts: 1,
      maxBytes: 256 * 1024,
    });
    robotsChecked = true;
    sitemapDeclarations = extractSitemapUrlsFromRobots(robotsResponse.body);
    for (const sitemapUrl of sitemapDeclarations) {
      addCandidate({ url: sitemapUrl, type: classifySitemapUrl(sitemapUrl), method: "robots_txt", title: null, verified: false, status: null, contentType: null, itemCount: null, note: null });
    }
  } catch {
    // robots.txt is optional.
  }

  // 4. Root sitemap.xml (only when robots.txt did not declare one).
  if (!sitemapDeclarations.length) {
    addCandidate({ url: `${origin}/sitemap.xml`, type: "sitemap", method: "root_sitemap", title: null, verified: false, status: null, contentType: null, itemCount: null, note: null });
  }

  // 5. News sitemap patterns (only when at least one sitemap is known).
  const anySitemap = sitemapDeclarations.some((url) => !/news/i.test(url)) || sitemapDeclarations.length > 0;
  if (anySitemap) {
    for (const path of COMMON_NEWS_SITEMAP_PATHS) {
      addCandidate({ url: `${origin}${path}`, type: "news_sitemap", method: "news_sitemap", title: null, verified: false, status: null, contentType: null, itemCount: null, note: null });
    }
  }

  // 6. Verify candidates (bounded count, prefer link_alternate first).
  const ordered = candidates.sort((a, b) => {
    const rank: Record<string, number> = { link_alternate: 0, robots_txt: 1, common_path: 2, root_sitemap: 3, news_sitemap: 4 };
    return (rank[a.method] ?? 9) - (rank[b.method] ?? 9);
  });
  const checks = ordered.slice(0, getNumberEnv("FEED_DISCOVERY_MAX_CHECKS", MAX_CANDIDATE_CHECKS));
  await Promise.all(
    checks.map(async (candidate) => {
      const verification = await verifyFeedCandidate(candidate.url);
      candidate.verified = verification.verified;
      candidate.status = verification.status;
      candidate.contentType = verification.contentType;
      candidate.itemCount = verification.itemCount;
      candidate.note = verification.note;
      if (verification.type && candidate.type === "feed") {
        candidate.type = verification.type;
      }
      if (verification.type === "news_sitemap") {
        candidate.type = "news_sitemap";
      }
    }),
  );

  return {
    pageUrl,
    hostname,
    robotsChecked,
    candidates: ordered,
    errors,
  };
}
