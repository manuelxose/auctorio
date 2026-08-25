import net from "node:net";
import { getNumberEnv } from "../../shared/utils/env";
import { fetchWithTimeout } from "../../shared/utils/http";
import { validateScrapeUrl } from "../../infrastructure/scraping";

// ────────────────────────────────────────────────────────────── URL normalization

/**
 * Normalize a user-entered destination URL to a canonical https origin.
 * Adds a scheme, keeps the host, strips credentials, query and hash.
 * SSRF validation happens separately (validateDestinationUrl) before any fetch.
 */
export function normalizeDestinationUrl(raw: string): string {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) {
    throw new Error("url_required");
  }
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let parsed: URL;
  try {
    parsed = new URL(withScheme);
  } catch {
    throw new Error("invalid_url");
  }
  if (parsed.username || parsed.password) {
    throw new Error("url_credentials_not_allowed");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("url_protocol_not_allowed");
  }
  if (!parsed.hostname) {
    throw new Error("invalid_url_host");
  }
  return parsed.origin;
}

/** SSRF-safe validation: protocol, host and DNS resolution must all be public. */
export async function validateDestinationUrl(url: string): Promise<URL> {
  const normalized = normalizeDestinationUrl(url);
  const parsed = new URL(normalized);

  // IP literals (including bracketed IPv6) are checked without DNS.
  const hostWithoutBrackets = parsed.hostname.replace(/^\[|\]$/g, "");
  if (net.isIP(hostWithoutBrackets)) {
    if (isPrivateIpLiteral(hostWithoutBrackets)) {
      throw new Error("private_ip_blocked");
    }
    return parsed;
  }

  await validateScrapeUrl(parsed);
  return parsed;
}

function isPrivateIpLiteral(ip: string): boolean {
  if (ip.includes(":")) {
    const normalized = ip.toLowerCase();
    return (
      normalized === "::1" ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      normalized.startsWith("fe80")
    );
  }
  const parts = ip.split(".").map((segment) => Number.parseInt(segment, 10));
  const [a, b] = parts;
  if (parts.some((segment) => Number.isNaN(segment))) {
    return true;
  }
  return (
    a === 10 ||
    a === 127 ||
    a === 0 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127)
  );
}

// ────────────────────────────────────────────────────────────── Discovery

export type DiscoveredAuthOption = {
  id: string;
  label: string;
  available: boolean;
  detail: string | null;
};

export type WebsiteDiscoveryResult = {
  inputUrl: string;
  canonicalOrigin: string;
  reachable: boolean;
  httpStatus: number | null;
  title: string | null;
  locale: string | null;
  faviconUrl: string | null;
  cms: string | null;
  cmsSignals: string[];
  robotsTxtUrl: string | null;
  robotsHasSitemap: boolean;
  sitemapUrls: string[];
  generators: string[];
  endpoints: Array<{ url: string; kind: string; status: number | null; note: string | null }>;
  authOptions: DiscoveredAuthOption[];
  publishingCapabilities: string[];
  warnings: string[];
  discoveredAt: string;
};

function safeText(value: string | null | undefined, max = 300): string | null {
  if (!value) {
    return null;
  }
  return value.trim().slice(0, max) || null;
}

function extractMetaContent(html: string, name: string, property = false): string | null {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const attribute = property ? "property" : "name";
  const match = html.match(new RegExp(`<meta[^>]+${attribute}=["']${escaped}["'][^>]*content=["']([^"']*)["']`, "i"))
    ?? html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*${attribute}=["']${escaped}["']`, "i"));
  return safeText(match?.[1]);
}

function detectCms(html: string, origin: string): { cms: string | null; signals: string[]; endpoints: Array<{ url: string; kind: string; status: number | null; note: string | null }> } {
  const signals: string[] = [];
  const endpoints: Array<{ url: string; kind: string; status: number | null; note: string | null }> = [];
  let cms: string | null = null;

  const generator = extractMetaContent(html, "generator");
  if (generator) {
    signals.push(`generator:${generator.toLowerCase()}`);
  }

  if (/wp-content|wp-includes|\/wp-json/i.test(html) || /wordpress/i.test(generator ?? "")) {
    cms = "wordpress";
    signals.push("wordpress");
    endpoints.push({ url: `${origin}/wp-json`, kind: "rest_root", status: null, note: "WordPress REST API root" });
    endpoints.push({ url: `${origin}/wp-json/wp/v2/posts`, kind: "posts", status: null, note: "WordPress posts endpoint" });
    endpoints.push({ url: `${origin}/wp-json/wp/v2/media`, kind: "media", status: null, note: "WordPress media endpoint" });
    endpoints.push({ url: `${origin}/wp-json/wp/v2/users/me?context=edit`, kind: "identity", status: null, note: "Identity endpoint (requires authentication)" });
  } else if (/ghost|ghost\.io/i.test(html)) {
    cms = "ghost";
    signals.push("ghost");
    endpoints.push({ url: `${origin}/ghost/api/admin/pages`, kind: "pages", status: null, note: "Ghost Admin API (requires JWT)" });
  } else if (/webflow/i.test(generator ?? "") || /data-wf-site/i.test(html)) {
    cms = "webflow";
    signals.push("webflow");
    endpoints.push({ url: `https://api.webflow.com/v2/sites`, kind: "api", status: null, note: "Webflow Data API (requires a site API token)" });
  } else if (/wix\.com|wixstatic/i.test(html)) {
    cms = "wix";
    signals.push("wix");
  } else if (/shopify/i.test(html)) {
    cms = "shopify";
    signals.push("shopify");
  }

  return { cms, signals, endpoints };
}

const PROBE_HEADERS: Record<string, string> = {
  "user-agent": "Auctorio/1.0 (+https://auctorio.com) connector-discovery",
  accept: "text/html,application/json;q=0.9,*/*;q=0.5",
};

async function probeEndpoint(url: string, timeoutMs: number): Promise<{ status: number | null; ok: boolean }> {
  try {
    const response = await fetchWithTimeout(url, {
      headers: PROBE_HEADERS,
      timeoutMs,
      retries: 0,
    });
    return { status: response.status, ok: response.ok };
  } catch {
    return { status: null, ok: false };
  }
}

/**
 * SSRF-safe website discovery. A public GET never implies "connected":
 * the result only records what is reachable and which capabilities the
 * destination publicly advertises.
 */
export async function discoverWebsite(rawUrl: string): Promise<WebsiteDiscoveryResult> {
  const timeoutMs = getNumberEnv("CONNECTOR_DISCOVERY_TIMEOUT_MS", 10_000);
  const warnings: string[] = [];

  let origin: URL;
  try {
    origin = await validateDestinationUrl(rawUrl);
  } catch (error) {
    throw new Error(`url_blocked: ${error instanceof Error ? error.message : String(error)}`);
  }

  const homepageUrl = origin.toString();
  const robotsUrl = new URL("/robots.txt", origin).toString();
  const sitemapCandidates = [
    new URL("/sitemap.xml", origin).toString(),
    new URL("/sitemap_index.xml", origin).toString(),
    new URL("/sitemap-index.xml", origin).toString(),
  ];

  let html = "";
  let homepageStatus: number | null = null;
  let reachable = false;
  try {
    const response = await fetchWithTimeout(homepageUrl, {
      headers: PROBE_HEADERS,
      timeoutMs,
      retries: 0,
    });
    homepageStatus = response.status;
    reachable = response.ok;
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("text/html") || contentType.includes("application/xhtml")) {
      const buffer = await response.arrayBuffer();
      if (buffer.byteLength <= getNumberEnv("CONNECTOR_DISCOVERY_MAX_BYTES", 2 * 1024 * 1024)) {
        html = Buffer.from(buffer).toString("utf8");
      } else {
        warnings.push("homepage_too_large: discovery used a bounded prefix");
        html = Buffer.from(buffer.slice(0, 512 * 1024)).toString("utf8");
      }
    }
  } catch (error) {
    warnings.push(`homepage_unreachable: ${error instanceof Error ? error.message.slice(0, 120) : String(error)}`);
  }

  // robots.txt
  let robotsHasSitemap = false;
  let robotsTxt = "";
  const robotsProbe = await probeEndpoint(robotsUrl, timeoutMs);
  if (robotsProbe.ok) {
    try {
      const response = await fetchWithTimeout(robotsUrl, { headers: PROBE_HEADERS, timeoutMs, retries: 0 });
      robotsTxt = await response.text();
      robotsHasSitemap = /sitemap\s*:/i.test(robotsTxt);
    } catch {
      /* ignore */
    }
  }

  // sitemaps: from robots first, then candidates
  const sitemapUrls = new Set<string>();
  for (const match of robotsTxt.matchAll(/sitemap\s*:\s*(\S+)/gi)) {
    try {
      const resolved = new URL(match[1], origin);
      if (resolved.origin === origin.origin) {
        sitemapUrls.add(resolved.toString());
      }
    } catch {
      /* ignore */
    }
  }
  for (const candidate of sitemapCandidates) {
    const probe = await probeEndpoint(candidate, timeoutMs);
    if (probe.status && probe.status < 500 && probe.status !== 404) {
      sitemapUrls.add(candidate);
    }
  }

  const detection = detectCms(html, origin.origin);
  for (const endpoint of detection.endpoints) {
    const probe = await probeEndpoint(endpoint.url, timeoutMs);
    endpoint.status = probe.status;
    endpoint.note = probe.status ? (probe.status === 401 || probe.status === 403 ? `${endpoint.note} — authentication required` : endpoint.note) : `${endpoint.note} — unreachable`;
  }

  const wp = detection.cms === "wordpress";
  const ghost = detection.cms === "ghost";

  const authOptions: DiscoveredAuthOption[] = [];
  if (wp) {
    authOptions.push({
      id: "application_password",
      label: "WordPress application password",
      available: true,
      detail: "Create one under Users → Profile → Application Passwords, then use it with the REST adapter.",
    });
  }
  authOptions.push({
    id: "api_token",
    label: "API token (bearer)",
    available: true,
    detail: "Any documented REST API that accepts a bearer token.",
  });
  authOptions.push({
    id: "signing_secret",
    label: "Signed webhook",
    available: true,
    detail: "The destination exposes an endpoint that verifies an HMAC signature.",
  });
  if (ghost) {
    authOptions.push({
      id: "ghost_admin_key",
      label: "Ghost Admin API key",
      available: true,
      detail: "A JWT issued by the destination's Ghost integration.",
    });
  }

  const publishingCapabilities: string[] = [];
  if (wp) {
    publishingCapabilities.push("draft_create", "draft_update", "publish", "unpublish", "media_upload", "taxonomy", "canonical_url");
  } else {
    publishingCapabilities.push("draft_create", "draft_update", "publish");
  }

  const locale = extractMetaContent(html, "og:locale", true) ?? safeText(html.match(/<html[^>]*lang=["']([^"']+)["']/i)?.[1]);
  const faviconMatch = html.match(/<link[^>]+rel=["'][^"']*icon[^"']*["'][^>]+href=["']([^"']+)["']/i)
    ?? html.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["'][^"']*icon[^"']*["']/i);

  return {
    inputUrl: rawUrl,
    canonicalOrigin: origin.origin,
    reachable,
    httpStatus: homepageStatus,
    title: safeText(extractMetaContent(html, "og:title", true) ?? html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]),
    locale,
    faviconUrl: faviconMatch ? new URL(faviconMatch[1], origin).toString() : null,
    cms: detection.cms,
    cmsSignals: detection.signals,
    robotsTxtUrl: robotsProbe.ok ? robotsUrl : null,
    robotsHasSitemap,
    sitemapUrls: Array.from(sitemapUrls).slice(0, 12),
    generators: detection.signals,
    endpoints: detection.endpoints,
    authOptions,
    publishingCapabilities,
    warnings,
    discoveredAt: new Date().toISOString(),
  };
}
