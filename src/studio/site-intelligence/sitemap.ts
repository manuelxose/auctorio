import { XMLParser } from "fast-xml-parser";
import type { Site } from "@prisma/client";
import { getPrismaClient } from "../../infrastructure/db/prisma";
import { fetchUrl } from "../../infrastructure/scraping";
import { getNumberEnv } from "../../shared/utils/env";

const prisma = getPrismaClient();

export type SitemapUrlEntry = {
  loc: string;
  lastmod?: string | null;
};

export type DiscoveredSitemap = {
  id: string;
  url: string;
  kind: string;
  status: string;
  urlCount: number | null;
};

export type SitemapDiscoveryResult = {
  sitemaps: DiscoveredSitemap[];
  entries: SitemapUrlEntry[];
  warnings: string[];
};

const ROBOTS_SITEMAP_PATTERN = /^Sitemap\s*:\s*(\S+)\s*$/im;

function sameOrigin(baseUrl: string, candidate: string): boolean {
  try {
    const base = new URL(baseUrl);
    const target = new URL(candidate);
    return base.hostname === target.hostname;
  } catch {
    return false;
  }
}

export function normalizePageUrl(baseUrl: string, candidate: string): string | null {
  try {
    const resolved = new URL(candidate, baseUrl);
    if (resolved.protocol !== "http:" && resolved.protocol !== "https:") {
      return null;
    }
    if (!sameOrigin(baseUrl, resolved.toString())) {
      return null;
    }
    resolved.hash = "";
    return resolved.toString();
  } catch {
    return null;
  }
}

function readLoc(value: unknown): string | null {
  if (typeof value === "string") {
    return value.trim() || null;
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record["#text"] === "string") {
      return record["#text"].trim() || null;
    }
  }
  return null;
}

function readLastmod(value: unknown): string | null {
  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }
  if (value && typeof value === "object") {
    return readLastmod((value as Record<string, unknown>)["#text"]);
  }
  return null;
}

/** Parse a sitemap XML body into url entries or nested sitemap references. */
export function parseSitemapBody(xml: string, baseUrl: string): {
  kind: "urlset" | "sitemapindex" | "unknown";
  entries: SitemapUrlEntry[];
  nested: string[];
} {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    textNodeName: "#text",
    allowBooleanAttributes: true,
  });
  const parsed = parser.parse(xml) as Record<string, unknown>;

  const urlset = parsed.urlset;
  if (urlset && typeof urlset === "object") {
    const urlsetValue = (urlset as Record<string, unknown>).url;
    const rawUrls: unknown[] = Array.isArray(urlsetValue) ? urlsetValue : urlsetValue ? [urlsetValue] : [];
    const entries: SitemapUrlEntry[] = [];
    const seen = new Set<string>();
    for (const raw of rawUrls) {
      if (!raw || typeof raw !== "object") {
        continue;
      }
      const loc = readLoc((raw as Record<string, unknown>).loc);
      if (!loc) {
        continue;
      }
      const normalized = normalizePageUrl(baseUrl, loc);
      if (!normalized || seen.has(normalized)) {
        continue;
      }
      seen.add(normalized);
      entries.push({ loc: normalized, lastmod: readLastmod((raw as Record<string, unknown>).lastmod) });
    }
    return { kind: "urlset", entries, nested: [] };
  }

  const index = parsed.sitemapindex;
  if (index && typeof index === "object") {
    const indexValue = (index as Record<string, unknown>).sitemap;
    const rawMaps: unknown[] = Array.isArray(indexValue) ? indexValue : indexValue ? [indexValue] : [];
    const nested: string[] = [];
    for (const raw of rawMaps) {
      if (!raw || typeof raw !== "object") {
        continue;
      }
      const loc = readLoc((raw as Record<string, unknown>).loc);
      if (!loc) {
        continue;
      }
      const normalized = normalizePageUrl(baseUrl, loc);
      if (normalized && !nested.includes(normalized)) {
        nested.push(normalized);
      }
    }
    return { kind: "sitemapindex", entries: [], nested };
  }

  return { kind: "unknown", entries: [], nested: [] };
}

function parseRobotsTxt(body: string): string[] {
  const lines = body.split(/\r?\n/);
  const refs: string[] = [];
  for (const line of lines) {
    const match = line.match(ROBOTS_SITEMAP_PATTERN);
    if (match?.[1]) {
      refs.push(match[1].trim());
    }
  }
  return refs;
}

async function fetchBounded(url: URL): Promise<{ body: string } | null> {
  const maxBytes = getNumberEnv("SITE_INTEL_MAX_SITEMAP_BYTES", 2_000_000);
  try {
    const response = await fetchUrl(url, { accept: "application/xml,text/xml,text/plain" });
    if (Buffer.byteLength(response.body, "utf8") > maxBytes) {
      return null;
    }
    return { body: response.body };
  } catch {
    return null;
  }
}

async function recordSitemap(
  tenantId: string,
  siteId: string,
  url: string,
  kind: string,
  status: string,
  extra: { urlCount?: number | null; statusCode?: number | null; error?: string | null },
): Promise<{ id: string }> {
  const existing = await prisma.siteSitemap.findUnique({ where: { siteId_url: { siteId, url } } });
  if (existing) {
    await prisma.siteSitemap.update({
      where: { id: existing.id },
      data: {
        kind: existing.kind === "discovered" ? kind : existing.kind,
        status,
        lastFetchedAt: new Date(),
        lastStatusCode: extra.statusCode ?? null,
        urlCount: extra.urlCount,
        error: extra.error ?? null,
      },
    });
    return { id: existing.id };
  }
  const created = await prisma.siteSitemap.create({
    data: {
      tenantId,
      siteId,
      url,
      kind,
      status,
      lastFetchedAt: new Date(),
      lastStatusCode: extra.statusCode ?? null,
      urlCount: extra.urlCount,
      error: extra.error ?? null,
    },
  });
  return { id: created.id };
}

/**
 * Discover sitemaps for a connected site: configured references, conventional
 * paths (/sitemap.xml, /sitemap_index.xml) and robots.txt declarations, with
 * bounded recursion into nested sitemap indexes.
 */
export async function discoverSitemapsForSite(
  site: Pick<Site, "id" | "tenantId" | "baseUrl">,
  options: { force?: boolean } = {},
): Promise<SitemapDiscoveryResult> {
  const warnings: string[] = [];
  if (!site.baseUrl) {
    throw new Error("site_base_url_required");
  }
  const baseUrl = site.baseUrl.replace(/\/$/, "");
  const base = new URL(baseUrl);

  const configured = await prisma.siteSitemap.findMany({
    where: { tenantId: site.tenantId, siteId: site.id, kind: "configured" },
  });

  const candidates = new Set<string>();
  for (const item of configured) {
    candidates.add(item.url);
  }
  if (!options.force) {
    const recent = await prisma.siteSitemap.findMany({
      where: {
        tenantId: site.tenantId,
        siteId: site.id,
        kind: { not: "configured" },
        status: "fetched",
        lastFetchedAt: { gte: new Date(Date.now() - 24 * 3600_000) },
      },
    });
    if (recent.length > 0) {
      // Already discovered recently; still refresh candidates but keep fast path.
    }
  }
  candidates.add(new URL("/sitemap.xml", base).toString());
  candidates.add(new URL("/sitemap_index.xml", base).toString());

  const robotsUrl = new URL("/robots.txt", base);
  const robotsResponse = await fetchBounded(robotsUrl);
  if (robotsResponse) {
    for (const ref of parseRobotsTxt(robotsResponse.body)) {
      const normalized = normalizePageUrl(baseUrl, ref);
      if (normalized) {
        candidates.add(normalized);
      }
    }
  }

  const maxNested = getNumberEnv("SITE_INTEL_MAX_SITEMAP_DEPTH", 3);
  const queue: Array<{ url: string; depth: number; via: string }> = Array.from(candidates).map((url) => ({
    url,
    depth: 0,
    via: "candidate",
  }));
  const visited = new Set<string>();
  const entries: SitemapUrlEntry[] = [];
  const sitemaps: DiscoveredSitemap[] = [];
  const maxEntries = getNumberEnv("SITE_INTEL_MAX_SITEMAP_URLS", 5000);

  while (queue.length > 0) {
    const next = queue.shift()!;
    if (visited.has(next.url) || next.depth > maxNested) {
      continue;
    }
    visited.add(next.url);

    let body: { body: string } | null = null;
    try {
      const url = new URL(next.url);
      if (!sameOrigin(baseUrl, url.toString())) {
        await recordSitemap(site.tenantId, site.id, next.url, next.via, "blocked", {
          error: "cross_origin_sitemap_blocked",
        });
        warnings.push(`blocked cross-origin sitemap ${next.url}`);
        continue;
      }
      body = await fetchBounded(url);
    } catch {
      warnings.push(`failed to fetch sitemap ${next.url}`);
    }

    if (!body) {
      await recordSitemap(site.tenantId, site.id, next.url, next.via, "failed", {
        error: "fetch_failed_or_oversized",
      });
      continue;
    }

    let parsed: ReturnType<typeof parseSitemapBody>;
    try {
      parsed = parseSitemapBody(body.body, baseUrl);
    } catch {
      await recordSitemap(site.tenantId, site.id, next.url, next.via, "failed", {
        error: "malformed_sitemap_xml",
      });
      warnings.push(`malformed sitemap ${next.url}`);
      continue;
    }

    const kind = parsed.kind === "sitemapindex" ? "sitemap_index" : next.via === "candidate" ? "sitemap" : next.via;
    if (parsed.kind === "unknown") {
      await recordSitemap(site.tenantId, site.id, next.url, kind, "failed", {
        error: "unrecognized_sitemap_root",
      });
      warnings.push(`unrecognized sitemap root ${next.url}`);
      continue;
    }

    const record = await recordSitemap(site.tenantId, site.id, next.url, kind, "fetched", {
      urlCount: parsed.kind === "urlset" ? parsed.entries.length : parsed.nested.length,
    });
    sitemaps.push({
      id: record.id,
      url: next.url,
      kind,
      status: "fetched",
      urlCount: parsed.kind === "urlset" ? parsed.entries.length : parsed.nested.length,
    });

    if (parsed.kind === "sitemapindex") {
      for (const nested of parsed.nested) {
        queue.push({ url: nested, depth: next.depth + 1, via: "nested" });
      }
      continue;
    }

    const seen = new Set(entries.map((entry) => entry.loc));
    for (const entry of parsed.entries) {
      if (seen.has(entry.loc) || entries.length >= maxEntries) {
        continue;
      }
      seen.add(entry.loc);
      entries.push(entry);
    }
  }

  return { sitemaps, entries, warnings };
}
