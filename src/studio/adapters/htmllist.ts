// Configurable HTML listing adapter (`htmllist`): cards → items. Works with
// plain HTTP for reachable sites and a headless-browser engine for
// WAF-protected sites. Per-domain defaults are adapter configuration, never
// business logic.

import { load } from "cheerio";
import { getNumberEnv } from "../../shared/utils/env";
import { fetchHtmlWithBrowser } from "../../infrastructure/scraping/browser";
import type { DiscoveredSourceItem, DiscoveryContext, SourceAdapter, SourceRef } from "./types";
import { resolveAdapterPolicies } from "./policies";
import { fetchSourceHttp, robotsAllows } from "./http";
import { compact, deriveExternalId, emptyDiscoveredItem, normalizeCanonicalUrl, parseDate, readConfigObject } from "./normalize";

export type ListingSourceConfig = {
  /** "http" (default) or "browser" (headless Chromium for WAF-protected sites). */
  engine?: "http" | "browser";
  itemSelector?: string;
  titleSelector?: string;
  linkSelector?: string;
  imageSelector?: string;
  dateSelector?: string;
  categoriesSelector?: string;
  descriptionSelectors?: string[];
  maxItems?: number;
  waitMs?: number;
  headers?: Record<string, string>;
};

const LISTING_DEFAULTS: Record<string, ListingSourceConfig> = {
  "www.filmaffinity.com": {
    engine: "browser",
    itemSelector: "div.fa-card",
    titleSelector: ".mc-title a",
    linkSelector: ".mc-title a",
    imageSelector: "img",
    descriptionSelectors: [".mc-title"],
    waitMs: 8000,
  },
  "www.sensacine.com": {
    engine: "http",
    itemSelector: "ul.item_lists_3 > li.mdl",
    titleSelector: ".meta-title-link",
    linkSelector: ".meta-title-link",
    imageSelector: "img",
    descriptionSelectors: [".meta-body"],
    categoriesSelector: ".meta-body-info",
    maxItems: 24,
  },
};

export function resolveListingConfig(sourceUrl: string, configuration: unknown): ListingSourceConfig {
  let hostDefaults: ListingSourceConfig = {};
  try {
    const host = new URL(sourceUrl).hostname.replace(/^www\./, "");
    hostDefaults = LISTING_DEFAULTS[host] ?? LISTING_DEFAULTS[`www.${host}`] ?? {};
  } catch {
    hostDefaults = {};
  }
  const configured = readConfigObject(configuration);
  return { ...hostDefaults, ...configured };
}

/** Extract listing cards from HTML. Pure — deterministic tests. */
export function extractListingItems(html: string, sourceUrl: string, config: ListingSourceConfig): DiscoveredSourceItem[] {
  const maxItems = Math.max(1, Math.min(config.maxItems ?? getNumberEnv("SCRAPE_MAX_ITEMS", 20), 100));
  const $ = load(html);

  let itemNodes = config.itemSelector ? $(config.itemSelector) : $();
  if (itemNodes.length === 0) {
    itemNodes = $("article, li:has(h2, h3), tr:has(td a[href])");
  }

  const items: DiscoveredSourceItem[] = [];
  itemNodes.each((_index, element) => {
    if (items.length >= maxItems) {
      return;
    }
    const node = $(element);

    const linkElement = config.linkSelector ? node.find(config.linkSelector).first() : node.find("a[href]").first();
    const rawHref = linkElement.attr("href") ?? node.find("a[href]").first().attr("href");
    if (!rawHref || /^(javascript:|mailto:|#)/i.test(rawHref.trim())) {
      return;
    }
    let canonicalUrl: string | null = null;
    try {
      canonicalUrl = normalizeCanonicalUrl(new URL(rawHref, sourceUrl).toString());
    } catch {
      return;
    }
    if (!canonicalUrl) {
      return;
    }

    const title = compact(
      (config.titleSelector ? node.find(config.titleSelector).first().text() : "") ||
        linkElement.text() ||
        node.find("h2, h3").first().text(),
    );
    if (!title) {
      return;
    }

    const descriptionParts: string[] = [];
    for (const selector of config.descriptionSelectors ?? []) {
      const text = compact(node.find(selector).first().text());
      if (text && !descriptionParts.includes(text)) {
        descriptionParts.push(text);
      }
    }

    let image: string | null = null;
    if (config.imageSelector) {
      const rawImage = node.find(config.imageSelector).first().attr("src") ?? node.find(config.imageSelector).first().attr("data-src");
      if (rawImage) {
        try {
          image = normalizeCanonicalUrl(new URL(rawImage, sourceUrl).toString());
        } catch {
          image = null;
        }
      }
    }

    const categories: string[] = [];
    if (config.categoriesSelector) {
      const rawCategories = compact(node.find(config.categoriesSelector).first().text());
      for (const part of rawCategories.split(/\s*\|\s*|,|·/)) {
        const cleaned = part.replace(/^\d+\s*h\s*\d*\s*min$/, "").trim();
        if (cleaned && cleaned.length <= 60 && !/^\d{1,2} de .* de \d{4}$/.test(cleaned) && !categories.includes(cleaned)) {
          categories.push(cleaned);
        }
      }
    }

    items.push(
      emptyDiscoveredItem({
        externalId: deriveExternalId(canonicalUrl, title),
        canonicalUrl,
        sourceUrl: canonicalUrl,
        title: title.slice(0, 400),
        description: descriptionParts.length > 0 ? descriptionParts.join(" · ") : null,
        rawText: descriptionParts.join("\n") || null,
        cleanedText: descriptionParts.join("\n") || null,
        author: null,
        authors: [],
        publishedAt: config.dateSelector ? parseDate(compact(node.find(config.dateSelector).first().text())) : null,
        sourceImageUrls: image ? [image] : [],
        language: null,
        categories,
        confidence: 0.7,
      }),
    );
  });

  return items;
}

export class HtmlListingAdapter implements SourceAdapter {
  readonly type = "htmllist" as const;

  async discover(source: SourceRef, context: DiscoveryContext): Promise<DiscoveredSourceItem[]> {
    if (!source.url) {
      throw new Error("source_url_required");
    }
    const url = new URL(source.url);
    const config = resolveListingConfig(source.url, source.configuration);
    const policies = resolveAdapterPolicies(source, context);
    if (policies.respectRobots && !(await robotsAllows(url))) {
      throw new Error("robots_disallow");
    }

    let html: string;
    if (config.engine === "browser") {
      html = await fetchHtmlWithBrowser(url.toString(), { settleMs: config.waitMs });
    } else {
      const response = await fetchSourceHttp(url, {
        accept: "text/html",
        headers: config.headers,
        timeoutMs: policies.timeoutMs,
        retryAttempts: policies.retryAttempts,
        backoffBaseMs: policies.backoffBaseMs,
        backoffMaxMs: policies.backoffMaxMs,
        signal: context.signal,
      });
      html = response.body;
    }
    return extractListingItems(html, url.toString(), config);
  }
}
