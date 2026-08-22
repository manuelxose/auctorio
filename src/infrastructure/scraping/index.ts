import { XMLParser } from "fast-xml-parser";
import { load } from "cheerio";
import dns from "node:dns/promises";
import net from "node:net";
import { getEnv, getNumberEnv } from "../../shared/utils/env";

export type ScrapeSourceType = "rss" | "html" | "api";

export type ScrapeInput = {
  sourceType: ScrapeSourceType;
  sourceRef: string;
  metadata?: Record<string, unknown>;
};

export type ScrapeItem = {
  content: string;
  sourceRef?: string;
  metadata?: Record<string, unknown>;
};

type RobotsRules = {
  disallow: string[];
};

const lastRequestByHost = new Map<string, number>();
const robotsCache = new Map<string, { fetchedAt: number; rules: RobotsRules }>();

export async function scrapeSource(input: ScrapeInput): Promise<ScrapeItem[]> {
  const url = new URL(input.sourceRef);
  await validateScrapeUrl(url);
  await enforceRateLimit(url.hostname);
  await ensureRobotsAllowed(url);

  const response = await fetchUrl(url, {
    accept: input.sourceType === "api" ? "application/json" : "application/xml,text/xml,text/html",
  });

  if (input.sourceType === "rss") {
    return parseRss(response.body, input.sourceRef, input.metadata);
  }

  if (input.sourceType === "html") {
    return parseHtml(response.body, input.sourceRef, input.metadata);
  }

  if (input.sourceType === "api") {
    return parseApi(response.body, input.sourceRef, input.metadata);
  }

  return [];
}

export async function fetchUrl(url: URL, options: { accept: string; headers?: Record<string, string> }) {
  const timeoutMs = getNumberEnv("SCRAPE_TIMEOUT_MS", 10000);
  const userAgent = getEnv("SCRAPE_USER_AGENT", "auctorio-bot");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url.toString(), {
      headers: {
        accept: options.accept,
        "user-agent": userAgent,
        ...(options.headers ?? {}),
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`fetch_failed status=${response.status}`);
    }

    const body = await response.text();
    return { body, contentType: response.headers.get("content-type") ?? "" };
  } finally {
    clearTimeout(timeout);
  }
}

function parseRss(xml: string, sourceRef: string, metadata?: Record<string, unknown>): ScrapeItem[] {
  const maxItems = getNumberEnv("SCRAPE_MAX_ITEMS", 20);
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    textNodeName: "#text",
  });

  const data = parser.parse(xml);
  const items: ScrapeItem[] = [];

  const rssItems = toArray(data?.rss?.channel?.item);
  const atomItems = toArray(data?.feed?.entry);

  for (const item of [...rssItems, ...atomItems]) {
    if (items.length >= maxItems) {
      break;
    }

    const title = toText(item?.title);
    const description =
      toText(item?.description) ||
      toText(item?.summary) ||
      toText(item?.["content:encoded"]) ||
      toText(item?.content);

    const link = extractLink(item?.link);
    const content = compactWhitespace([title, description].filter(Boolean).join("\n"));

    if (!content) {
      continue;
    }

    items.push({
      content: limitChars(content),
      sourceRef: link || sourceRef,
      metadata: {
        ...(metadata ?? {}),
        title,
        link,
        published_at: toText(item?.pubDate) || toText(item?.published),
      },
    });
  }

  return items;
}

function parseHtml(html: string, sourceRef: string, metadata?: Record<string, unknown>): ScrapeItem[] {
  const $ = load(html);
  $("script, style, noscript").remove();
  const selectors = extractSelectors(metadata);
  let text = "";

  if (selectors.length > 0) {
    text = selectors
      .map((selector) => $(selector).text())
      .filter((value) => value && value.trim().length > 0)
      .join("\n");
  }

  if (!text) {
    text = $("body").text();
  }

  const title = $("title").text() || undefined;
  const content = compactWhitespace(text);
  if (!content) {
    return [];
  }

  return [
    {
      content: limitChars(content),
      sourceRef,
      metadata: {
        ...(metadata ?? {}),
        title,
        selectors: selectors.length > 0 ? selectors : undefined,
      },
    },
  ];
}

function parseApi(body: string, sourceRef: string, metadata?: Record<string, unknown>): ScrapeItem[] {
  const maxItems = getNumberEnv("SCRAPE_MAX_ITEMS", 20);
  const json = JSON.parse(body);
  const path = typeof metadata?.json_path === "string" ? metadata.json_path : undefined;
  const fields = Array.isArray(metadata?.fields) ? metadata?.fields : undefined;

  const resolved = path ? resolveJsonPath(json, path) : json;
  const items = Array.isArray(resolved) ? resolved : [resolved];

  const results: ScrapeItem[] = [];
  for (const item of items) {
    if (results.length >= maxItems) {
      break;
    }

    const content = compactWhitespace(buildContentFromFields(item, fields));
    if (!content) {
      continue;
    }

    results.push({
      content: limitChars(content),
      sourceRef,
      metadata: {
        ...(metadata ?? {}),
        json_path: path,
      },
    });
  }

  return results;
}

function resolveJsonPath(input: unknown, path: string): unknown {
  const parts = path.split(".").map((part) => part.trim()).filter(Boolean);
  let current: unknown = input;
  for (const part of parts) {
    if (current === null || typeof current !== "object") {
      return undefined;
    }

    if (Array.isArray(current)) {
      const index = Number.parseInt(part, 10);
      if (Number.isNaN(index) || index < 0 || index >= current.length) {
        return undefined;
      }
      current = current[index];
      continue;
    }

    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function buildContentFromFields(item: unknown, fields?: unknown[]): string {
  if (fields && item && typeof item === "object") {
    const record = item as Record<string, unknown>;
    const chunks = fields.map((field) => {
      if (typeof field !== "string") {
        return "";
      }
      const value = record[field];
      if (value === null || value === undefined) {
        return "";
      }
      return String(value);
    });
    return chunks.filter(Boolean).join("\n");
  }

  if (typeof item === "string" || typeof item === "number" || typeof item === "boolean") {
    return String(item);
  }

  return JSON.stringify(item);
}

function extractSelectors(metadata?: Record<string, unknown>): string[] {
  if (!metadata) {
    return [];
  }

  if (typeof metadata.selector === "string" && metadata.selector.trim()) {
    return [metadata.selector.trim()];
  }

  if (Array.isArray(metadata.selectors)) {
    return metadata.selectors.filter((value) => typeof value === "string").map((value) => value.trim());
  }

  return [];
}

function toArray<T>(value: T | T[] | undefined): T[] {
  if (!value) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

function toText(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record["#text"] === "string") {
      return record["#text"] as string;
    }
    if (typeof record.text === "string") {
      return record.text as string;
    }
  }
  return "";
}

function extractLink(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      const link = extractLink(entry);
      if (link) {
        return link;
      }
    }
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record["@_href"] === "string") {
      return record["@_href"] as string;
    }
  }
  return "";
}

function compactWhitespace(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

function limitChars(input: string): string {
  const maxChars = getNumberEnv("SCRAPE_MAX_CHARS", 4000);
  if (input.length <= maxChars) {
    return input;
  }
  return input.slice(0, maxChars);
}

export async function validateScrapeUrl(url: URL) {
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("invalid_protocol");
  }

  const hostname = url.hostname.toLowerCase();
  if (!hostname || hostname === "localhost") {
    throw new Error("invalid_host");
  }

  if (!isHostAllowed(hostname)) {
    throw new Error("host_not_allowed");
  }

  if (net.isIP(hostname)) {
    if (isPrivateIp(hostname)) {
      throw new Error("private_ip_blocked");
    }
    return;
  }

  const addresses = await dns.lookup(hostname, { all: true });
  for (const address of addresses) {
    if (isPrivateIp(address.address)) {
      throw new Error("private_ip_blocked");
    }
  }
}

function isHostAllowed(hostname: string): boolean {
  const allowlist = getEnv("SCRAPE_ALLOWLIST", "");
  if (!allowlist) {
    return true;
  }

  const entries = allowlist
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);

  if (entries.length === 0) {
    return true;
  }

  return entries.some((entry) => {
    if (entry.startsWith("*.") || entry.startsWith(".")) {
      const normalized = entry.replace(/^\*\./, ".");
      return hostname.endsWith(normalized);
    }
    return hostname === entry;
  });
}

function isPrivateIp(ip: string): boolean {
  if (ip.includes(":")) {
    const normalized = ip.toLowerCase();
    if (normalized === "::1") {
      return true;
    }
    if (normalized.startsWith("fc") || normalized.startsWith("fd")) {
      return true;
    }
    if (normalized.startsWith("fe80")) {
      return true;
    }
    return false;
  }

  const [a, b] = ip.split(".").map((segment) => Number.parseInt(segment, 10));
  if ([a, b].some((segment) => Number.isNaN(segment))) {
    return true;
  }

  if (a === 10 || a === 127 || a === 0) {
    return true;
  }
  if (a === 169 && b === 254) {
    return true;
  }
  if (a === 172 && b >= 16 && b <= 31) {
    return true;
  }
  if (a === 192 && b === 168) {
    return true;
  }
  if (a === 100 && b >= 64 && b <= 127) {
    return true;
  }

  return false;
}

async function enforceRateLimit(hostname: string) {
  const minDelayMs = getNumberEnv("SCRAPE_MIN_DELAY_MS", 0);
  if (minDelayMs <= 0) {
    return;
  }

  const now = Date.now();
  const last = lastRequestByHost.get(hostname) ?? 0;
  const elapsed = now - last;
  if (elapsed < minDelayMs) {
    await sleep(minDelayMs - elapsed);
  }
  lastRequestByHost.set(hostname, Date.now());
}

async function ensureRobotsAllowed(url: URL) {
  const respect = getEnv("SCRAPE_RESPECT_ROBOTS", "false").toLowerCase();
  if (!(respect === "1" || respect === "true")) {
    return;
  }

  const rules = await getRobotsRules(url);
  if (!isPathAllowedByRobots(rules, url.pathname)) {
    throw new Error("robots_disallow");
  }
}

async function getRobotsRules(url: URL): Promise<RobotsRules> {
  const ttlMs = getNumberEnv("SCRAPE_ROBOTS_TTL_MS", 21600000);
  const cached = robotsCache.get(url.hostname);
  if (cached && Date.now() - cached.fetchedAt < ttlMs) {
    return cached.rules;
  }

  try {
    const robotsUrl = new URL("/robots.txt", url.origin);
    const response = await fetchUrl(robotsUrl, { accept: "text/plain" });
    const rules = parseRobotsTxt(response.body);
    robotsCache.set(url.hostname, { fetchedAt: Date.now(), rules });
    return rules;
  } catch (_err) {
    const rules = { disallow: [] };
    robotsCache.set(url.hostname, { fetchedAt: Date.now(), rules });
    return rules;
  }
}

function parseRobotsTxt(body: string): RobotsRules {
  const lines = body.split(/\r?\n/);
  let activeForAll = false;
  const disallow: string[] = [];

  for (const rawLine of lines) {
    const line = rawLine.split("#")[0]?.trim();
    if (!line) {
      continue;
    }

    const [keyRaw, valueRaw] = line.split(":", 2);
    if (!valueRaw) {
      continue;
    }

    const key = keyRaw.trim().toLowerCase();
    const value = valueRaw.trim();

    if (key === "user-agent") {
      activeForAll = value === "*";
      continue;
    }

    if (key === "disallow" && activeForAll) {
      if (value) {
        disallow.push(value);
      }
    }
  }

  return { disallow };
}

function isPathAllowedByRobots(rules: RobotsRules, path: string): boolean {
  for (const disallow of rules.disallow) {
    if (disallow === "/") {
      return false;
    }
    if (path.startsWith(disallow)) {
      return false;
    }
  }
  return true;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
