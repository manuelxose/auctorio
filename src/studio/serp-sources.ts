// External sources for keyword-first guides (BLG parity M4): the pages Google ranks for the
// keyword become citable ledger facts (title + snippet, publisher = domain, real URL).
// Best effort: no credentials, unknown market or provider error → no extra sources, writing never blocks.

import { dataForSeoConfigured, dataForSeoLocation, fetchSerpOrganic, normalizeKeyword, type SerpResult } from "../infrastructure/seo/dataforseo";
import type { LedgerFact } from "./editorial-engine/types";
import { lookupProviderCache, storeProviderCache } from "./enrichment/provider-cache";
import { recordAiSpend } from "./cost-budgets";
import { structuredEvent } from "../shared/utils/logger";
import { fetchUrl, validateScrapeUrl } from "../infrastructure/scraping";
import { extractPageFromHtml } from "./site-intelligence/crawler";

const PROVIDER = "dataforseo";
const RESOURCE = "serp_organic";
const TTL_MS = 7 * 24 * 60 * 60 * 1000; // Labs snapshots refresh every few weeks

type Fetcher = typeof fetchSerpOrganic;
/** Page text plus the outlet's own name (og:site_name), when the page declares one. */
type PageReader = (url: string) => Promise<{ content: string; siteName: string | null } | string | null>;

const fold = (value: string) => value.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/**
 * The 2 sentences of a source page a guide can cite: ones with figures or dates and the keyword's words first,
 * kept in page order. Empty when nothing qualifies (the SERP snippet is used instead).
 */
export function pickSourceExcerpt(content: string, keyword: string, maxChars = 360): string {
  const tokens = fold(keyword).split(/\s+/).filter((token) => token.length > 2); // keep short brand words like «tdt»
  const sentences = content.split(/(?<=[.!?])\s+/).map((sentence) => sentence.trim()).filter((sentence) => sentence.length >= 40 && sentence.length <= 300);
  const scored = sentences.map((sentence, index) => {
    const folded = fold(sentence);
    return { sentence, index, score: (/\d/.test(sentence) ? 2 : 0) + tokens.filter((token) => folded.includes(token)).length };
  });
  const best = scored.filter((entry) => entry.score >= 2).sort((a, b) => b.score - a.score || a.index - b.index).slice(0, 2);
  return best.sort((a, b) => a.index - b.index).map((entry) => entry.sentence).join(" ").slice(0, maxChars);
}

/** Main text and outlet name of a public HTML page (SSRF-guarded); null for PDFs, errors and thin pages. */
async function readPageText(url: string): Promise<{ content: string; siteName: string | null } | null> {
  try {
    const parsed = new URL(url);
    await validateScrapeUrl(parsed);
    const { body, contentType } = await fetchUrl(parsed, { accept: "text/html" });
    if (!/html/i.test(contentType)) return null;
    const page = extractPageFromHtml(parsed.origin, url, body);
    return page ? { content: page.content, siteName: page.siteName ?? null } : null;
  } catch {
    return null;
  }
}

/** Facts whose statement carries what the page itself says (cached per URL + keyword), falling back to the snippet. */
async function withPageExcerpts(tenantId: string, facts: LedgerFact[], keyword: string, readPage: PageReader): Promise<LedgerFact[]> {
  return Promise.all(
    facts.map(async (fact) => {
      const url = fact.sourceUrl!;
      const key = `${keyword}|${url}`;
      const cached = await lookupProviderCache(tenantId, PROVIDER, "source_page", key);
      // Older cache entries hold the bare excerpt string.
      const stored = cached.hit && !cached.negative ? cached.payload : null;
      let page: { excerpt: string; publisher: string | null } | null = cached.hit
        ? typeof stored === "string" || !stored ? { excerpt: String(stored ?? ""), publisher: null } : (stored as { excerpt: string; publisher: string | null })
        : null;
      if (!page) {
        const read = await readPage(url);
        const content = typeof read === "string" ? read : read?.content ?? "";
        page = { excerpt: content ? pickSourceExcerpt(content, keyword) : "", publisher: typeof read === "object" && read ? cleanPublisher(read.siteName) : null };
        await storeProviderCache(tenantId, PROVIDER, "source_page", key, page, { ttlMs: TTL_MS, negative: !page.excerpt && !page.publisher });
      }
      // The outlet's real name («Xataka») instead of its domain for «Título, Editor».
      const named = page.publisher ? { ...fact, publisher: page.publisher } : fact;
      if (!page.excerpt) return named;
      const title = fact.statement.split(": ")[0];
      return { ...named, statement: `${title}: ${page.excerpt}`.slice(0, 400) };
    }),
  );
}

/** og:site_name as a publisher label: trimmed, short, not a URL. */
export function cleanPublisher(value: string | null | undefined): string | null {
  const name = value?.replace(/\s+/g, " ").trim() ?? "";
  return name && name.length <= 60 && !/^https?:|\//i.test(name) ? name : null;
}

/** Social networks and video hosts are not citable sources (a «Según facebook.com» reads as no source); the video block covers YouTube. */
const NOT_CITABLE = ["facebook.com", "instagram.com", "twitter.com", "x.com", "tiktok.com", "pinterest.com", "pinterest.es", "linkedin.com", "youtube.com", "youtu.be", "threads.net"];

/** Ranked results to ledger facts, minus excluded domains (own site, competitors, social/video) and URLs already in the ledger. */
export function serpResultsToFacts(results: SerpResult[], exclude: { domains: string[]; urls: string[] }, max: number): LedgerFact[] {
  const blocked = (domain: string) => [...exclude.domains, ...NOT_CITABLE].some((entry) => domain === entry || domain.endsWith(`.${entry}`));
  const seen = new Set(exclude.urls);
  const facts: LedgerFact[] = [];
  for (const result of results) {
    if (!result.domain || blocked(result.domain) || seen.has(result.url)) continue;
    seen.add(result.url);
    facts.push({
      factKey: `serp_${facts.length + 1}`,
      statement: `${result.title}${result.description ? `: ${result.description}` : ""}`.slice(0, 400),
      publisher: result.domain,
      publisherGroup: result.domain,
      sourceUrl: result.url,
      confidence: 0.5,
      verificationStatus: "unverified",
      conflictingStatements: [],
      supportingGroups: 1,
    });
    if (facts.length >= max) break;
  }
  return facts;
}

export async function serpSourceFacts(
  input: { tenantId: string; siteId: string; locale: string | null; keyword: string; exclude: { domains: string[]; urls: string[] }; max: number },
  fetcher: Fetcher = fetchSerpOrganic,
  readPage: PageReader = readPageText,
): Promise<LedgerFact[]> {
  const location = dataForSeoLocation(input.locale);
  const keyword = normalizeKeyword(input.keyword);
  if (!dataForSeoConfigured() || !location || !keyword || input.max <= 0) return [];
  const key = `${location.locationCode}|${location.languageCode}|${keyword}`;
  try {
    const cached = await lookupProviderCache(input.tenantId, PROVIDER, RESOURCE, key);
    let results = cached.hit ? (cached.negative ? [] : (cached.payload as SerpResult[])) : null;
    if (!results) {
      const fetched = await fetcher(keyword, location);
      if (fetched.costUsd > 0) await recordAiSpend({ tenantId: input.tenantId, siteId: input.siteId, kind: "serp_sources", provider: PROVIDER, model: RESOURCE, costUsd: fetched.costUsd });
      results = fetched.results;
      await storeProviderCache(input.tenantId, PROVIDER, RESOURCE, key, results, { ttlMs: TTL_MS, negative: results.length === 0 });
    }
    return await withPageExcerpts(input.tenantId, serpResultsToFacts(results, input.exclude, input.max), keyword, readPage);
  } catch (error) {
    structuredEvent("serp_sources.failed", { tenantId: input.tenantId, siteId: input.siteId, error: error instanceof Error ? error.message : String(error) }, "warn");
    return [];
  }
}
