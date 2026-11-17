// External sources for keyword-first guides (BLG parity M4): the pages Google ranks for the
// keyword become citable ledger facts (title + snippet, publisher = domain, real URL).
// Best effort: no credentials, unknown market or provider error → no extra sources, writing never blocks.

import { dataForSeoConfigured, dataForSeoLocation, fetchSerpOrganic, normalizeKeyword, type SerpResult } from "../infrastructure/seo/dataforseo";
import type { LedgerFact } from "./editorial-engine/types";
import { lookupProviderCache, storeProviderCache } from "./enrichment/provider-cache";
import { recordAiSpend } from "./cost-budgets";
import { structuredEvent } from "../shared/utils/logger";

const PROVIDER = "dataforseo";
const RESOURCE = "serp_organic";
const TTL_MS = 7 * 24 * 60 * 60 * 1000; // Labs snapshots refresh every few weeks

type Fetcher = typeof fetchSerpOrganic;

/** Ranked results to ledger facts, minus excluded domains (own site, competitors) and URLs already in the ledger. */
export function serpResultsToFacts(results: SerpResult[], exclude: { domains: string[]; urls: string[] }, max: number): LedgerFact[] {
  const blocked = (domain: string) => exclude.domains.some((entry) => domain === entry || domain.endsWith(`.${entry}`));
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
    return serpResultsToFacts(results, input.exclude, input.max);
  } catch (error) {
    structuredEvent("serp_sources.failed", { tenantId: input.tenantId, siteId: input.siteId, error: error instanceof Error ? error.message : String(error) }, "warn");
    return [];
  }
}
