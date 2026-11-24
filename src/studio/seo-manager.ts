// Central manager for external SEO data (SEO-V2): the only way to reach a provider.
// It reads the control state from the database on every decision, so disabling a provider (or everything) takes
// effect on the next call in every process; it records what was billed and the provider's health.

import { Prisma } from "@prisma/client";
import { loadProviderKeys } from "../infrastructure/ai/ai-settings";
import { getPrismaClient } from "../infrastructure/db/prisma";
import {
  SeoProviderError,
  seoMarket,
  type SeoCapability,
  type SeoData,
  type SeoErrorCode,
  type SeoMarket,
  type SeoProvider,
  type SeoRequests,
  type SeoResult,
} from "../infrastructure/seo/contract";
import { DEFAULT_CONTROL, SEO_MODES, findSeoProvider, seoBlockReason, selectSeoProvider, type SeoControl, type SeoLocks, type SeoMode } from "../infrastructure/seo/registry";
import { structuredEvent } from "../shared/utils/logger";
import { recordAiSpend } from "./cost-budgets";

const prisma = getPrismaClient();

export async function loadSeoControl(): Promise<SeoControl> {
  const [setting, states] = await Promise.all([prisma.seoControlSetting.findUnique({ where: { id: "global" } }), prisma.seoProviderState.findMany(), loadProviderKeys(true)]);
  const providers = { ...DEFAULT_CONTROL.providers };
  for (const state of states) providers[state.providerId] = { enabled: state.enabled, priority: state.priority };
  // An unreadable mode must not spend: it counts as disabled.
  const mode: SeoMode = !setting ? DEFAULT_CONTROL.mode : (SEO_MODES as readonly string[]).includes(setting.mode) ? (setting.mode as SeoMode) : "disabled";
  return { mode, routing: (setting?.routing ?? {}) as SeoControl["routing"], paidFallback: false, providers };
}

export type SeoRoute = {
  provider: SeoProvider;
  market: SeoMarket;
  /** Prefix of every cache key of this market for this provider. */
  marketKey: string;
  /** Source stored on the metrics this route returns. */
  sourceTag: string;
};

/** Who would serve a capability for a site's locale; null (with the reason) when nobody may. Never calls a provider. */
export async function seoRoute(capability: SeoCapability, locale: string | null | undefined, options: { locks?: SeoLocks } = {}): Promise<SeoRoute | { provider: null; reason: SeoErrorCode }> {
  const market = seoMarket(locale);
  if (!market) return { provider: null, reason: "unsupported_market" };
  try {
    const provider = selectSeoProvider(capability, market, await loadSeoControl(), { locks: options.locks, quote: nominalQuote(capability, market) });
    const declaration = provider.capabilities[capability];
    return { provider, market, marketKey: provider.marketKey(capability, market)!, sourceTag: declaration.supported ? declaration.sourceTag : provider.id };
  } catch (error) {
    if (error instanceof SeoProviderError) return { provider: null, reason: error.code };
    throw error;
  }
}

/** Whether a capability can be acquired at all right now (any market). Database read only. */
export async function seoCapabilityAvailable(capability: SeoCapability): Promise<boolean> {
  try {
    selectSeoProvider(capability, null, await loadSeoControl());
    return true;
  } catch (error) {
    if (error instanceof SeoProviderError) return false;
    throw error;
  }
}

export type SeoScope = { tenantId: string; siteId: string | null; /** Spend category. */ kind: string; resource: string; fetchImpl?: typeof fetch; locks?: SeoLocks };

/** Request options the provider does not declare are refused before anything is sent. */
function assertRequest<C extends SeoCapability>(provider: SeoProvider, capability: C, request: SeoRequests[C]): void {
  const declaration = provider.capabilities[capability];
  if (!declaration.supported) throw new SeoProviderError("unsupported_capability", `${provider.id}: ${capability} is not supported (${declaration.reason})`, provider.id, 0);
  const options = request as { limit?: number; cursor?: string; device?: "desktop" | "mobile" };
  const refuse = (what: string) => new SeoProviderError("bad_request", `${provider.id}: ${capability} ${what}`, provider.id, 0);
  if (options.cursor !== undefined && !declaration.pagination) throw refuse("has no pagination");
  if (options.device && !declaration.devices.includes(options.device)) throw refuse("cannot choose a device");
  if (options.limit !== undefined && (!Number.isInteger(options.limit) || options.limit < 1 || (declaration.maxResults !== null && options.limit > declaration.maxResults))) throw refuse(`limit ${options.limit} is out of range`);
}

async function recordHealth(provider: SeoProvider, data: Prisma.SeoProviderStateUpdateInput): Promise<void> {
  const defaults = DEFAULT_CONTROL.providers[provider.id] ?? { enabled: false, priority: 100 };
  try {
    await prisma.seoProviderState.upsert({ where: { providerId: provider.id }, create: { providerId: provider.id, ...defaults, ...(data as object) }, update: data });
  } catch (error) {
    structuredEvent("seo.health_not_recorded", { provider: provider.id, error: error instanceof Error ? error.message : String(error) }, "warn");
  }
}

async function callProvider<C extends SeoCapability>(provider: SeoProvider, capability: C, request: SeoRequests[C], scope: SeoScope): Promise<SeoResult<C>> {
  const declaration = provider.capabilities[capability];
  const quote = provider.quote(capability, request);
  const trace = { tenantId: scope.tenantId, siteId: scope.siteId, provider: provider.id, capability };
  // A ledger failure must not throw away data already paid for, nor hide the provider's own error.
  const spend = async (costUsd: number) => {
    try {
      await recordAiSpend({ tenantId: scope.tenantId, siteId: scope.siteId, kind: scope.kind, provider: provider.id, model: scope.resource, costUsd });
    } catch (error) {
      structuredEvent("seo.spend_not_recorded", { ...trace, costUsd, error: error instanceof Error ? error.message : String(error) }, "error");
    }
  };
  try {
    const { data, ...meta } = await provider.run(capability, request, scope.fetchImpl ?? fetch);
    if (meta.billedUsd === null) {
      // The provider did not say: account for the most it could have charged, never for zero.
      structuredEvent("seo.cost_unreported", { ...trace, assumedUsd: quote.maxUsd }, "warn");
      if (quote.maxUsd) await spend(quote.maxUsd);
    } else if (meta.billedUsd > 0) await spend(meta.billedUsd);
    if (meta.billedUsd !== null && quote.maxUsd !== null && meta.billedUsd > quote.maxUsd * 1.001) {
      structuredEvent("seo.billed_over_quote", { ...trace, billedUsd: meta.billedUsd, maxUsd: quote.maxUsd }, "error");
      meta.notes.push("billed_over_quote");
    }
    if (meta.notes.length) structuredEvent("seo.notes", { ...trace, upstream: meta.upstream, notes: meta.notes });
    await recordHealth(provider, { lastSuccessAt: new Date() });
    return {
      data,
      meta: { ...meta, providerId: provider.id, capability, market: request.market, fetchedAt: new Date().toISOString(), dataKind: declaration.supported ? declaration.dataKind : "unknown", methodology: declaration.supported ? declaration.methodology : "", quote },
    };
  } catch (error) {
    const failure = error instanceof SeoProviderError ? error : new SeoProviderError("upstream_error", `${provider.id}: unexpected failure`, provider.id);
    if (failure.billedUsd) await spend(failure.billedUsd);
    else if (failure.billedUsd === null) structuredEvent("seo.cost_unknown_after_error", { ...trace, code: failure.code, maxUsd: quote.maxUsd }, "warn");
    await recordHealth(provider, { lastErrorAt: new Date(), lastErrorCode: failure.code, lastErrorMessage: failure.message.slice(0, 300) });
    throw failure;
  }
}

/**
 * Acquire from the route's provider. The control state is read again here: a provider disabled since the route was
 * resolved is not called. Keyword batches above the provider's limit are split.
 */
export async function acquireSeo<C extends SeoCapability>(route: SeoRoute, capability: C, request: Omit<SeoRequests[C], "market">, scope: SeoScope): Promise<SeoResult<C>> {
  const full = { ...request, market: route.market } as SeoRequests[C];
  const declaration = route.provider.capabilities[capability];
  const keywords = (full as { keywords?: string[] }).keywords;
  const size = declaration.supported ? declaration.maxBatch : null;
  const batches = keywords && size && keywords.length > size
    ? Array.from({ length: Math.ceil(keywords.length / size) }, (_, i) => ({ ...full, keywords: keywords.slice(i * size, (i + 1) * size) }) as SeoRequests[C])
    : [full];
  let merged: SeoResult<C> | null = null;
  for (const batch of batches) {
    assertRequest(route.provider, capability, batch);
    const current = selectSeoProvider(capability, route.market, await loadSeoControl(), { locks: scope.locks, quote: nominalQuote(capability, route.market) });
    if (current.id !== route.provider.id) throw new SeoProviderError("provider_disabled", `${capability}: ${route.provider.id} is no longer the selected provider`, route.provider.id, 0);
    const result = await callProvider(current, capability, batch, scope);
    merged = !merged ? result : {
      data: [...(merged.data as unknown[]), ...(result.data as unknown[])] as SeoData[C],
      meta: {
        ...result.meta,
        billedUsd: merged.meta.billedUsd === null || result.meta.billedUsd === null ? null : merged.meta.billedUsd + result.meta.billedUsd,
        partial: merged.meta.partial || result.meta.partial,
        notes: [...merged.meta.notes, ...result.meta.notes],
      },
    };
  }
  return merged!;
}

/** Most an administrator can authorize for one live test. */
export const MAX_TEST_SPEND_USD = 0.25;

const testRequest = (market: SeoMarket): { [C in SeoCapability]: SeoRequests[C] } => ({
  keyword_metrics: { market, keywords: ["weather"] },
  keyword_suggestions: { market, seed: "weather", limit: 1 },
  ranked_keywords: { market, domain: "wikipedia.org", limit: 1 },
  serp_organic: { market, keyword: "weather" },
  search_volume: { market, keywords: ["weather"] },
  youtube_search: { market, keyword: "weather" },
});

/** Price of the same small request on every provider: what cost-optimized routing compares. */
function nominalQuote(capability: SeoCapability, market: SeoMarket) {
  const request = testRequest(market)[capability];
  return (provider: SeoProvider) => provider.quote(capability, request);
}

/** One minimal live call an admin authorized with a ceiling. Refused, uncalled, when the maximum price is unknown or above it. */
export async function verifySeoProvider(
  input: { providerId: string; capability: SeoCapability; locale: string; maxSpendUsd: number; tenantId: string; fetchImpl?: typeof fetch },
): Promise<{ rows: number; costUsd: number | null; partial: boolean; notes: string[]; market: string }> {
  const provider = findSeoProvider(input.providerId);
  if (!provider) throw new SeoProviderError("not_selected", "unknown provider", null, 0);
  const market = seoMarket(input.locale);
  if (!market) throw new SeoProviderError("unsupported_market", `unknown market ${input.locale}`, provider.id, 0);
  const reason = seoBlockReason(provider, input.capability, market, await loadSeoControl(), "authorized_test");
  if (reason) throw new SeoProviderError(reason, `${provider.id}: ${reason}`, provider.id, 0);
  const request = testRequest(market)[input.capability];
  const { maxUsd } = provider.quote(input.capability, request);
  if (maxUsd === null) throw new SeoProviderError("unknown_price", `${provider.id}: the maximum price of ${input.capability} is unknown`, provider.id, 0);
  if (!(input.maxSpendUsd > 0) || input.maxSpendUsd > MAX_TEST_SPEND_USD || maxUsd > input.maxSpendUsd) {
    throw new SeoProviderError("spend_limit", `${provider.id}: this test can cost up to ${maxUsd} USD; authorized ${input.maxSpendUsd} (at most ${MAX_TEST_SPEND_USD})`, provider.id, 0);
  }
  const { data, meta } = await callProvider(provider, input.capability, request, { tenantId: input.tenantId, siteId: null, kind: "seo_live_test", resource: input.capability, fetchImpl: input.fetchImpl });
  if (!data.length) return { rows: 0, costUsd: meta.billedUsd, partial: meta.partial, notes: meta.notes, market: `${market.country}|${market.language}` }; // answered, but proves nothing about the data
  const row = await prisma.seoProviderState.findUnique({ where: { providerId: provider.id }, select: { verifications: true } });
  const verifications = { ...((row?.verifications ?? {}) as Record<string, unknown>), [input.capability]: { at: meta.fetchedAt, market: `${market.country}|${market.language}`, costUsd: meta.billedUsd } };
  await recordHealth(provider, { verifications: verifications as Prisma.InputJsonObject });
  return { rows: data.length, costUsd: meta.billedUsd, partial: meta.partial, notes: meta.notes, market: `${market.country}|${market.language}` };
}
