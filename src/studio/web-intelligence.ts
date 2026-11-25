// Web search and page reading for discovery (competitors, sources, news, engagement). Every call goes through the SEO
// manager: emergency stop, switches, budgets, cache, single flight and ledger (infrastructure/seo/web.ts).

import { seoMarket, type SeoRequests, type SeoResult, type WebCapability, type WebExtraction, type WebSearchResult } from "../infrastructure/seo/contract";
import { SeoProviderError } from "../infrastructure/seo/contract";
import { findSeoProvider } from "../infrastructure/seo/registry";
import { MAX_WEB_RESULTS, hostnameOf, webProviderId } from "../infrastructure/seo/web";
import { getEnv } from "../shared/utils/env";
import { acquireSeo, readStoredSeo, seoRoute, type SeoScope } from "./seo-manager";

export { hostnameOf };
export type { WebExtraction, WebSearchResult };
export type { WebClaim } from "../infrastructure/seo/contract";

export type WebSearchOptions = { limit?: number; freshnessHours?: number; language?: string | null; country?: string | null };
export type WebScope = { tenantId: string; siteId: string | null; priority?: SeoScope["priority"]; fetchImpl?: typeof fetch };

export interface WebIntelligenceProvider {
  readonly name: string;
  search(query: string, options?: WebSearchOptions): Promise<WebSearchResult[]>;
  scrape(url: string): Promise<WebExtraction | null>;
}

/** Any locale serves: the market only names the language and country asked for. */
const localeOf = (options: WebSearchOptions) => {
  const locale = options.language ? `${options.language}${options.country ? `-${options.country}` : ""}` : "en";
  return seoMarket(locale) ? locale : "en";
};

async function acquireWeb<C extends WebCapability>(capability: C, locale: string, request: Omit<SeoRequests[C], "market">, scope: SeoScope): Promise<SeoResult<C>> {
  const route = await seoRoute(capability, locale);
  if (route.provider) return acquireSeo(route, capability, request, scope);
  const stored = await readStoredSeo(capability, locale, request, scope);
  if (!stored) throw new SeoProviderError(route.reason, `${capability}: ${route.reason}`, null, 0);
  return stored;
}

/** The configured web provider for a workspace, or null. Its calls throw SeoProviderError when they may not be bought. */
export function getWebIntelligenceProvider(scope: WebScope): WebIntelligenceProvider | null {
  const provider = findSeoProvider(webProviderId());
  if (!provider?.configured()) return null;
  const base = { tenantId: scope.tenantId, siteId: scope.siteId, fetchImpl: scope.fetchImpl, priority: scope.priority ?? "background" } satisfies Partial<SeoScope>;
  return {
    name: provider.id,
    async search(query, options = {}) {
      const timeSensitive = Boolean(options.freshnessHours && options.freshnessHours <= 168);
      const { data, meta } = await acquireWeb("web_search", localeOf(options), { keyword: query, limit: Math.max(1, Math.min(options.limit ?? 10, MAX_WEB_RESULTS)), ...(options.freshnessHours ? { freshnessHours: options.freshnessHours } : {}) }, {
        ...base, kind: "web_search", decision: { importance: "normal", urgency: timeSensitive ? "time_sensitive" : "evergreen" },
      });
      // Yesterday's answer to «what happened today» is the wrong answer, even when no new one can be had.
      if (timeSensitive && meta.freshness !== "fresh") throw new SeoProviderError("upstream_error", "web_search: only results too old for this question are available", provider.id, 0);
      return data;
    },
    async scrape(url) {
      const { data } = await acquireWeb("web_extract", "en", { url }, { ...base, kind: "web_extract", decision: { importance: "normal" } });
      return data[0] ?? null;
    },
  };
}

export function webIntelligenceAvailability(): { provider: string; configured: boolean; message: string } {
  const id = webProviderId();
  const provider = findSeoProvider(id);
  if (!provider) return { provider: getEnv("WEB_INTELLIGENCE_PROVIDER", ""), configured: false, message: "WEB_INTELLIGENCE_PROVIDER is not a known provider" };
  const configured = provider.configured();
  return { provider: provider.id, configured, message: configured ? `${provider.label} configured` : `${provider.credentials[0].envName} is not set` };
}
