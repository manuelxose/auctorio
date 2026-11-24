// Control state of external SEO data, read from the database on every decision.

import type { Prisma } from "@prisma/client";
import { loadProviderKeys } from "../infrastructure/ai/ai-settings";
import { getPrismaClient } from "../infrastructure/db/prisma";
import { readSeoPolicy } from "../infrastructure/seo/policy";
import type { SeoPriceOverrides } from "../infrastructure/seo/pricing";
import { DEFAULT_CONTROL, SEO_MODES, type SeoControl, type SeoMode } from "../infrastructure/seo/registry";

const prisma = getPrismaClient();

/** `circuits`: providers whose circuit breaker is open, and until when. */
export type SeoControlState = SeoControl & { circuits: Record<string, { until: Date; reason: string | null }> };

export async function readSeoControl(client: Prisma.TransactionClient | typeof prisma = prisma): Promise<SeoControlState> {
  const setting = await client.seoControlSetting.findUnique({ where: { id: "global" } });
  const states = await client.seoProviderState.findMany();
  const providers = { ...DEFAULT_CONTROL.providers };
  const circuits: SeoControlState["circuits"] = {};
  for (const state of states) {
    providers[state.providerId] = { enabled: state.enabled, priority: state.priority };
    if (state.circuitOpenUntil) circuits[state.providerId] = { until: state.circuitOpenUntil, reason: state.circuitReason };
  }
  // An unreadable mode must not spend: it counts as disabled.
  const mode: SeoMode = !setting ? DEFAULT_CONTROL.mode : (SEO_MODES as readonly string[]).includes(setting.mode) ? (setting.mode as SeoMode) : "disabled";
  return {
    mode,
    routing: (setting?.routing ?? {}) as SeoControl["routing"],
    paidFallback: setting?.paidFallback ?? false,
    emergencyStop: setting?.emergencyStop ?? false,
    policy: readSeoPolicy(setting?.policy),
    pricing: (setting?.pricing ?? {}) as SeoPriceOverrides,
    providers,
    circuits,
  };
}

/** Control state with the providers' saved credentials loaded first. */
export async function loadSeoControl(): Promise<SeoControlState> {
  await loadProviderKeys(true);
  return readSeoControl();
}
