// External sources for keyword-first guides (BLG parity M4): the pages Google ranks for the keyword are read, and what
// they say becomes citable ledger facts. A result whose page could not be read is only a lead, never evidence of a claim.
// Best effort: no provider, unknown market or provider error → no extra sources; the outcome says why (SEO-V2-05).

import { SeoProviderError, normalizeKeyword, type SeoDataKind, type SerpResult } from "../infrastructure/seo/contract";
import type { LedgerFact } from "./editorial-engine/types";
import { lookupProviderCache, storeProviderCache } from "./enrichment/provider-cache";
import { loadSeoControl } from "./seo-control";
import { acquireSeo, readStoredSeo, seoRoute, type SeoScope } from "./seo-manager";
import { looksLikeInstruction, neutralizeInlineControlCharacters } from "./prompt-injection";
import { structuredEvent } from "../shared/utils/logger";
import { fetchUrl, validateScrapeUrl } from "../infrastructure/scraping";
import { extractPageFromHtml } from "./site-intelligence/crawler";

/** Page excerpts are read by our own crawler, not by an SEO provider. */
const PAGE_CACHE = "web";
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Page text plus the outlet's own name (og:site_name), when the page declares one. */
type PageReader = (url: string) => Promise<{ content: string; siteName: string | null } | string | null>;

const fold = (value: string) => value.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/**
 * The 2 sentences of a source page a guide can cite: ones with figures or dates and the keyword's words first,
 * kept in page order. Empty when nothing qualifies (the SERP snippet is used instead).
 */
export function pickSourceExcerpt(content: string, keyword: string, maxChars = 360): string {
  const tokens = fold(keyword).split(/\s+/).filter((token) => token.length > 2); // keep short brand words like «tdt»
  const sentences = neutralizeInlineControlCharacters(content).split(/(?<=[.!?])\s+/).map((sentence) => sentence.trim()).filter((sentence) => sentence.length >= 40 && sentence.length <= 300 && !looksLikeInstruction(sentence));
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

/** Facts whose statement carries what the page itself says (cached per URL + keyword). Unread pages keep only their title, as leads. */
async function withPageExcerpts(tenantId: string, facts: LedgerFact[], keyword: string, readPage: PageReader): Promise<LedgerFact[]> {
  return Promise.all(
    facts.map(async (fact) => {
      const url = fact.sourceUrl!;
      const key = `${keyword}|${url}`;
      const cached = await lookupProviderCache(tenantId, PAGE_CACHE, "source_page", key);
      // Older cache entries hold the bare excerpt string.
      const stored = cached.hit && !cached.negative ? cached.payload : null;
      let page: { excerpt: string; publisher: string | null; at?: string } | null = cached.hit
        ? typeof stored === "string" || !stored ? { excerpt: String(stored ?? ""), publisher: null } : (stored as { excerpt: string; publisher: string | null; at?: string })
        : null;
      if (!page) {
        const read = await readPage(url);
        const content = typeof read === "string" ? read : read?.content ?? "";
        page = { excerpt: content ? pickSourceExcerpt(content, keyword) : "", publisher: typeof read === "object" && read ? cleanPublisher(read.siteName) : null, at: new Date().toISOString() };
        await storeProviderCache(tenantId, PAGE_CACHE, "source_page", key, page, { ttlMs: TTL_MS, negative: !page.excerpt && !page.publisher });
      }
      // The outlet's real name («Xataka») instead of its domain for «Título, Editor».
      const named = page.publisher ? { ...fact, publisher: page.publisher } : fact;
      const title = fact.statement.split(": ")[0];
      if (!page.excerpt) return { ...named, statement: title, confidence: 0.2, evidenceKind: "search_result" as const };
      return { ...named, statement: `${title}: ${page.excerpt}`.slice(0, 400), evidenceKind: "page" as const, retrievedAt: page.at ?? null };
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

const OFFICIAL = /(^|\.)(gov|gob|gouv|govt|mil|edu|int|europa)(\.[a-z]{2,3})?$|(^|\.)(boe|ine|aepd|cnmv|bde|who|un|oecd)\.(es|org|int)$/;
const DOCUMENTATION = /^(docs?|developers?|support|help|ayuda|soporte|learn)\./;

const hostOf = (url: string | null): string | null => (url && URL.canParse(url) ? new URL(url).hostname.replace(/^www\./, "") : null);

/** 0 official, 1 primary documentation, 2 read or validated, 3 only found. */
export function sourceTier(fact: Pick<LedgerFact, "sourceUrl" | "evidenceKind">): 0 | 1 | 2 | 3 {
  if (fact.evidenceKind === "search_result") return 3;
  const host = hostOf(fact.sourceUrl);
  return host && OFFICIAL.test(host) ? 0 : host && DOCUMENTATION.test(host) ? 1 : 2;
}

/** Official and primary sources first; within a tier the order they came in (plan evidence, then search rank). */
export const prioritizeSources = (facts: LedgerFact[]): LedgerFact[] => [...facts].sort((a, b) => sourceTier(a) - sourceTier(b));

export type SerpReason = "time_sensitive" | "unclear_intent" | "insufficient_sources" | "enough_evidence";

/** Whether an article's search results are worth buying. A stored answer is read either way. Pure. */
export function serpNeed(input: { timeSensitive: boolean; /** Measured, not guessed by a model. */ intent: string | null; /** A research run already looked at its results. */ serpKnown: boolean; sources: number; wantedSources: number }): { buy: boolean; reason: SerpReason } {
  if (input.timeSensitive) return { buy: true, reason: "time_sensitive" };
  if (input.sources < input.wantedSources) return { buy: true, reason: "insufficient_sources" };
  if (!input.intent && !input.serpKnown) return { buy: true, reason: "unclear_intent" };
  return { buy: false, reason: "enough_evidence" };
}

const FORMATS: Array<[string, RegExp]> = [
  ["video", /\b(v[ií]deos?|youtube|tr[aá]iler|trailer)\b/i],
  ["how_to", /\b(c[oó]mo|paso a paso|tutorial|how to|step by step|gu[ií]a para)\b/i],
  ["comparison", /\b(vs\.?|versus|comparativa|comparison|diferencias?|alternativas?|alternatives)\b/i],
  ["list", /(^|\s)\d{1,3}\s+\p{L}|\b(mejores|best|top|lista|listado)\b/iu],
  ["news", /\b(hoy|today|[uú]ltima hora|noticias|news|breaking)\b/i],
];
export type SerpInsight = { results: number; format: string | null; share: number };

/** The format that dominates the titles; null when none reaches 40 %. Only counts and fixed words leave it, never the titles. */
export function serpInsight(results: Array<Pick<SerpResult, "title">>): SerpInsight {
  const counts = new Map<string, number>();
  for (const { title } of results) {
    const format = FORMATS.find(([, pattern]) => pattern.test(title))?.[0];
    if (format) counts.set(format, (counts.get(format) ?? 0) + 1);
  }
  const [format, count] = [...counts].sort((a, b) => b[1] - a[1])[0] ?? [null, 0];
  const share = results.length ? Math.round((count / results.length) * 100) / 100 : 0;
  return { results: results.length, format: share >= 0.4 && results.length >= 5 ? format : null, share };
}

/** not_needed: nothing stored and not worth buying. too_old: only an answer unfit for a question that moves. unavailable: wanted, and could not be had. */
export type SerpState = "acquired" | "reused" | "not_needed" | "too_old" | "unavailable";
export type SerpOutcome = { state: SerpState; reason: SerpReason; /** Why it could not be had. */ code: string | null; providerId: string | null; /** observed = live results; historical = the provider's stored ones. */ dataKind: SeoDataKind | null; asOf: string | null; fetchedAt: string | null; insight: SerpInsight | null };

export async function serpSourceFacts(
  input: {
    tenantId: string; siteId: string; locale: string | null; keyword: string; siteType?: string; /** The topic moves: search results age in days, not weeks. */ timeSensitive?: boolean; exclude: { domains: string[]; urls: string[] }; max: number;
    /** What to buy for; left out = buy what is missing. */
    need?: ReturnType<typeof serpNeed>;
    /** Stored data only, whatever the need. */
    reuseOnly?: boolean;
  },
  fetchImpl: typeof fetch = fetch,
  readPage: PageReader = readPageText,
): Promise<{ facts: LedgerFact[]; serp: SerpOutcome }> {
  const keyword = normalizeKeyword(input.keyword);
  const need = input.need ?? { buy: true, reason: "insufficient_sources" as const };
  const none = (state: SerpState, code: string | null = null, patch: Partial<SerpOutcome> = {}) => ({ facts: [], serp: { state, reason: need.reason, code, providerId: null, dataKind: null, asOf: null, fetchedAt: null, insight: null, ...patch } });
  if (!keyword || input.max <= 0) return none("not_needed");
  try {
    const route = await seoRoute("serp_organic", input.locale);
    const scope: SeoScope = {
      tenantId: input.tenantId, siteId: input.siteId, kind: "serp_sources", fetchImpl, priority: "planning",
      decision: { importance: "normal", siteType: input.siteType, urgency: input.timeSensitive ? "time_sensitive" : "evergreen" },
    };
    const declaration = route.provider?.capabilities.serp_organic;
    // Stored results of an unknown date do not answer what happened this week: they are not bought for it.
    const historical = declaration?.supported && declaration.dataKind === "historical";
    const reuseOnly = input.reuseOnly === true || !need.buy || (input.timeSensitive === true && historical);
    const answer = route.provider ? await acquireSeo(route, "serp_organic", { keyword }, { ...scope, reuseOnly }) : await readStoredSeo("serp_organic", input.locale, { keyword }, scope);
    if (!answer) return need.buy ? none("unavailable", (route as { reason: string }).reason) : none("not_needed");
    const { data, meta } = answer;
    const provenance = { providerId: meta.providerId, dataKind: meta.dataKind, asOf: meta.asOf, fetchedAt: meta.fetchedAt };
    if (input.timeSensitive) {
      const { policy } = await loadSeoControl();
      const at = Date.parse(meta.asOf ?? meta.fetchedAt);
      if (meta.freshness !== "fresh" || !Number.isFinite(at) || Date.now() - at > policy.timeSensitiveSerpDays * 86_400_000) return none("too_old", null, provenance);
    }
    const facts = await withPageExcerpts(input.tenantId, serpResultsToFacts(data, input.exclude, input.max), keyword, readPage);
    return { facts, serp: { state: meta.cache.bought ? "acquired" : "reused", reason: need.reason, code: null, ...provenance, insight: serpInsight(data) } };
  } catch (error) {
    const code = error instanceof SeoProviderError ? error.code : "error";
    if (code === "reuse_only") return need.buy ? none("unavailable", input.reuseOnly ? "reuse_only" : "historical_only") : none("not_needed");
    structuredEvent("serp_sources.failed", { tenantId: input.tenantId, siteId: input.siteId, code, error: error instanceof Error ? error.message : String(error) }, "warn");
    return none("unavailable", code);
  }
}
