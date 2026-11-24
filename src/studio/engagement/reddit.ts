import { setTimeout as delay } from "node:timers/promises";
import { validateScrapeUrl } from "../../infrastructure/scraping";
import { fetchJson } from "../../shared/utils/http";
import type { WebSearchResult } from "../web-intelligence";

const origin = "https://www.reddit.com";
let nextRequest = 0;
let blockedUntil = 0;

type RedditListing = {
  data?: { children?: Array<{ kind?: string; data?: {
    permalink?: string; title?: string; selftext?: string; score?: number;
    created_utc?: number; archived?: boolean; locked?: boolean; over_18?: boolean;
  } }> };
};

export type RedditResult = WebSearchResult & { votes: number };

export function parseRedditListing(listing: RedditListing): RedditResult[] {
  if (!Array.isArray(listing?.data?.children)) return [];
  return listing.data.children.flatMap(({ kind, data }) => {
    if (kind !== "t3" || !data || data.archived || data.locked || data.over_18
      || typeof data.permalink !== "string" || !data.permalink.startsWith("/r/")
      || typeof data.title !== "string" || !Number.isFinite(data.created_utc)) return [];
    const date = new Date(data.created_utc! * 1000);
    if (!Number.isFinite(+date)) return [];
    return [{
      url: origin + data.permalink, title: data.title, description: typeof data.selftext === "string" ? data.selftext : null,
      publishedAt: date.toISOString(), domain: "reddit.com", score: null,
      votes: Number.isSafeInteger(data.score) ? Math.max(0, Math.min(data.score!, 2_147_483_647)) : 0,
    }];
  });
}

export async function searchReddit(keyword: string, subreddits: string[]): Promise<RedditResult[] | null> {
  if (Date.now() < blockedUntil) return null;
  const path = subreddits.length ? `/r/${subreddits.join("+")}/search.json` : "/search.json";
  const url = new URL(path, origin);
  url.search = new URLSearchParams({ q: keyword, sort: "top", t: "week", type: "link", limit: "8", restrict_sr: String(Boolean(subreddits.length)) }).toString();
  const slot = Math.max(Date.now(), nextRequest);
  nextRequest = slot + 2_000;
  await delay(Math.max(0, slot - Date.now()));
  if (Date.now() < blockedUntil) return null;
  try {
    await validateScrapeUrl(url);
    return parseRedditListing(await fetchJson<RedditListing>(url.href, {
      timeoutMs: 6_000, redirect: "error",
      headers: { "User-Agent": "web:auctorio-engagement:1.0 (+https://auctorio.com)", Accept: "application/json" },
    }));
  } catch {
    blockedUntil = Date.now() + 60_000;
    return null;
  }
}
