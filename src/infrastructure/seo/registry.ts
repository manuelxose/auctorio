// Provider registry and capability-based selection. Pure: control state comes in, a decision comes out.
// To add a provider: implement SeoProvider and append it to SEO_PROVIDERS.

import { anyApiProvider } from "./anyapi";
import { SeoProviderError, type SeoCapability, type SeoErrorCode, type SeoMarket, type SeoProvider, type SeoQuote } from "./contract";
import { dataForSeoProvider } from "./dataforseo";
import { DEFAULT_SEO_POLICY, type SeoPolicy } from "./policy";
import type { SeoPriceOverrides } from "./pricing";

export const SEO_PROVIDERS: readonly SeoProvider[] = [dataForSeoProvider, anyApiProvider];

export const SEO_MODES = ["disabled", "dataforseo_only", "anyapi_only", "manual", "cost_optimized"] as const;
export type SeoMode = (typeof SEO_MODES)[number];

export type SeoProviderControl = { enabled: boolean; priority: number };
export type SeoControl = {
  mode: SeoMode;
  /** Manual mode: provider per capability; a capability left out is not acquired. */
  routing: Partial<Record<SeoCapability, string>>;
  /** Pay another provider when the selected one cannot serve a capability. Off by default and locked (see below). */
  paidFallback: boolean;
  /** Nothing is sent to any provider, whatever the mode. */
  emergencyStop: boolean;
  policy: SeoPolicy;
  pricing: SeoPriceOverrides;
  providers: Record<string, SeoProviderControl>;
};

/** What an installation did before SEO-V2: DataForSEO only. */
export const DEFAULT_CONTROL: SeoControl = {
  mode: "dataforseo_only",
  routing: {},
  paidFallback: false,
  emergencyStop: false,
  policy: DEFAULT_SEO_POLICY,
  pricing: {},
  providers: { dataforseo: { enabled: true, priority: 10 }, anyapi: { enabled: false, priority: 20 } },
};

/**
 * Budgets are enforced since SEO-V2-02; these stay closed until the licensing and production activation gates
 * (docs/seo-v2/production-readiness.md) are met. They are code, not settings: an admin cannot turn them off.
 */
export type SeoLocks = { automaticRouting: boolean; paidFallback: boolean; paidAutomation: readonly string[] };
export const SEO_LOCKS: SeoLocks = { automaticRouting: true, paidFallback: true, paidAutomation: ["anyapi"] };

/** automation: any product workflow. authorized_test: an admin's explicit live test with a spending ceiling. */
export type SeoTrigger = "automation" | "authorized_test";

export function findSeoProvider(id: string | null | undefined, providers: readonly SeoProvider[] = SEO_PROVIDERS): SeoProvider | null {
  return providers.find((provider) => provider.id === id) ?? null;
}

/** Why a provider cannot serve this now; null = it can. */
export function seoBlockReason(
  provider: SeoProvider,
  capability: SeoCapability,
  market: SeoMarket | null,
  control: SeoControl,
  trigger: SeoTrigger = "automation",
  locks: SeoLocks = SEO_LOCKS,
): SeoErrorCode | null {
  if (control.emergencyStop) return "emergency_stop";
  if (control.mode === "disabled") return "external_disabled";
  if (!control.providers[provider.id]?.enabled) return "provider_disabled";
  if (provider.licensing.commercialUse === "prohibited") return "license_prohibited";
  if (!provider.capabilities[capability].supported) return "unsupported_capability";
  if (!provider.configured()) return "not_configured";
  if (market && provider.marketKey(capability, market) === null) return "unsupported_market";
  if (trigger === "automation" && locks.paidAutomation.includes(provider.id)) return "paid_automation_locked";
  return null;
}

/** The provider the mode names for a capability; null when it is chosen by price or not at all. */
export function primarySeoProviderId(capability: SeoCapability, control: Pick<SeoControl, "mode" | "routing">): string | null {
  return control.mode === "dataforseo_only" ? "dataforseo" : control.mode === "anyapi_only" ? "anyapi" : control.mode === "manual" ? control.routing[capability] ?? null : null;
}

/**
 * The provider that serves a capability under the current mode. Throws SeoProviderError with the reason when none does.
 * `quote` prices a concrete request; cost-optimized routing ignores providers whose maximum price is unknown.
 */
export function selectSeoProvider(
  capability: SeoCapability,
  market: SeoMarket | null,
  control: SeoControl,
  options: { trigger?: SeoTrigger; quote?: (provider: SeoProvider) => SeoQuote; locks?: SeoLocks; providers?: readonly SeoProvider[] } = {},
): SeoProvider {
  const { trigger = "automation", locks = SEO_LOCKS, providers = SEO_PROVIDERS } = options;
  if (control.emergencyStop) throw new SeoProviderError("emergency_stop", "the global emergency stop is active");
  if (control.mode === "disabled") throw new SeoProviderError("external_disabled", "external SEO calls are disabled");
  const blocked = (provider: SeoProvider) => seoBlockReason(provider, capability, market, control, trigger, locks);
  const priority = (provider: SeoProvider) => control.providers[provider.id]?.priority ?? Number.MAX_SAFE_INTEGER;

  if (control.mode === "cost_optimized") {
    if (locks.automaticRouting) throw new SeoProviderError("automatic_routing_locked", "automatic paid routing is locked until the production activation gates are met");
    const priced = providers.filter((provider) => !blocked(provider)).map((provider) => ({ provider, max: options.quote?.(provider).maxUsd ?? null }));
    const known = priced.filter((entry): entry is { provider: SeoProvider; max: number } => entry.max !== null);
    if (!known.length) throw new SeoProviderError(priced.length ? "unknown_price" : "not_selected", `no provider with a known price can serve ${capability}`);
    return known.sort((a, b) => a.max - b.max || priority(a.provider) - priority(b.provider))[0].provider;
  }

  const primary = findSeoProvider(primarySeoProviderId(capability, control), providers);
  const reason = primary ? blocked(primary) : "not_selected";
  if (primary && !reason) return primary;
  if (control.paidFallback && !locks.paidFallback) {
    const fallback = [...providers].filter((provider) => provider !== primary && !blocked(provider)).sort((a, b) => priority(a) - priority(b))[0];
    if (fallback) return fallback;
  }
  throw new SeoProviderError(reason ?? "not_selected", `${capability}: ${primary ? `${primary.id} ${reason}` : "no provider selected"}`, primary?.id ?? null);
}
