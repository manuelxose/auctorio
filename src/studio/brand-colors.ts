// Brand palette and logo read from the site itself (homepage + its first stylesheet), so CTA cards and images
// carry the site's colours when Settings › Branding is empty. Cached 30 days per site; any failure → nothing.

import { fetchUrl, validateScrapeUrl } from "../infrastructure/scraping";
import { lookupProviderCache, storeProviderCache } from "./enrichment/provider-cache";

export type CrawledBrand = { primaryColor: string; secondaryColor: string; logoUrl: string };

const TTL_MS = 30 * 24 * 60 * 60 * 1000;

function hsl(hex: string): { s: number; l: number } {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const s = max === min ? 0 : (max - min) / (1 - Math.abs(2 * l - 1));
  return { s, l };
}

const expand = (hex: string) => (hex.length === 4 ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}` : hex).toLowerCase();

/**
 * Pure: primary = the most used saturated colour (not grey, not near black/white); secondary = the theme-color
 * when it is dark/neutral (the site's chrome), else the next saturated colour; logo = the declared icon.
 */
export function extractBrand(html: string, css: string, baseUrl: string): CrawledBrand {
  const counts = new Map<string, number>();
  for (const match of `${html}\n${css}`.matchAll(/#(?:[0-9a-f]{6}|[0-9a-f]{3})\b/gi)) {
    const hex = expand(match[0]);
    counts.set(hex, (counts.get(hex) ?? 0) + 1);
  }
  const saturated = [...counts.entries()]
    .filter(([hex]) => {
      const { s, l } = hsl(hex);
      return s >= 0.4 && l >= 0.25 && l <= 0.75;
    })
    .sort((a, b) => b[1] - a[1])
    .map(([hex]) => hex);
  const themeRaw = /<meta[^>]+name=["']theme-color["'][^>]*content=["'](#[0-9a-f]{3,6})["']/i.exec(html)?.[1];
  const theme = themeRaw ? expand(themeRaw) : "";
  const primaryColor = saturated[0] ?? (theme && hsl(theme).s >= 0.4 ? theme : "");
  const secondaryColor = theme && theme !== primaryColor ? theme : saturated.find((hex) => hex !== primaryColor) ?? "";
  const icon = /<link[^>]+rel=["'](?:apple-touch-icon|icon)["'][^>]*href=["']([^"']+)["']/i.exec(html)?.[1] ?? "";
  let logoUrl = "";
  try {
    logoUrl = icon ? new URL(icon, baseUrl).toString() : "";
  } catch {
    logoUrl = "";
  }
  return { primaryColor, secondaryColor, logoUrl: /^https?:\/\//.test(logoUrl) ? logoUrl : "" };
}

async function readText(url: URL): Promise<string> {
  await validateScrapeUrl(url);
  const { body } = await fetchUrl(url, { accept: "text/html,text/css" });
  return body.slice(0, 2_000_000);
}

/** The site's crawled palette (cached); null when the site can't be read. */
export async function crawlBrand(tenantId: string, baseUrl: string | null): Promise<CrawledBrand | null> {
  if (!baseUrl) return null;
  const cached = await lookupProviderCache(tenantId, "site", "brand_palette", baseUrl);
  if (cached.hit) return cached.negative ? null : (cached.payload as CrawledBrand);
  try {
    const home = new URL(baseUrl);
    const html = await readText(home);
    const href = /<link[^>]+rel=["']stylesheet["'][^>]*href=["']([^"']+)["']/i.exec(html)?.[1];
    const css = href ? await readText(new URL(href, home)).catch(() => "") : "";
    const brand = extractBrand(html, css, home.toString());
    const found = Boolean(brand.primaryColor || brand.secondaryColor || brand.logoUrl);
    await storeProviderCache(tenantId, "site", "brand_palette", baseUrl, found ? brand : undefined, { ttlMs: TTL_MS, negative: !found });
    return found ? brand : null;
  } catch {
    await storeProviderCache(tenantId, "site", "brand_palette", baseUrl, undefined, { ttlMs: 24 * 60 * 60 * 1000, negative: true }).catch(() => undefined);
    return null;
  }
}

/** Settings › Branding wins; empty fields take the crawled palette/logo. */
export function withCrawledBrand<T extends { primaryColor: string; secondaryColor: string; logoUrl: string }>(settings: T, crawled: CrawledBrand | null): T {
  if (!crawled) return settings;
  return {
    ...settings,
    primaryColor: settings.primaryColor || crawled.primaryColor,
    secondaryColor: settings.secondaryColor || crawled.secondaryColor,
    logoUrl: settings.logoUrl || crawled.logoUrl,
  };
}
