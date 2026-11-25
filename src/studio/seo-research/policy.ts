// Limits of a site's research. They are ceilings, never spending targets; the Cost Governor applies on top.

/** What justifies acquiring more knowledge. A calendar month changing does not. */
export const RESEARCH_TRIGGERS = ["onboarding", "insufficient_opportunities", "new_topic", "new_market", "performance_change", "competitor_opportunity", "seasonal_event", "stale_evidence", "pending_decision", "manual"] as const;
export type ResearchTrigger = (typeof RESEARCH_TRIGGERS)[number];

/** States of a run whose knowledge counts. */
export const SEO_RESEARCH_DONE = ["succeeded", "partial"] as const;

export const RESEARCH_MODES = ["automatic", "manual", "off"] as const;

export type ResearchPolicy = {
  /** automatic: justified triggers start research; manual: only people do; off: nobody does. */
  mode: (typeof RESEARCH_MODES)[number];
  /** Editorial activity the inventory should cover. */
  targetDays: number;
  /** Below it more research is justified. */
  replenishBelowDays: number;
  /** Inventory wanted when the publishing rhythm is unknown. */
  minOpportunities: number;
  /** Quality floor; it is not lowered to reach a count. */
  minScore: number;
  maxSeedBatches: number;
  maxCompetitorBatches: number;
  maxSerpLookups: number;
  maxMetricsBatches: number;
  maxUsdPerRun: number;
  /** Wait before researching again for lack of opportunities. */
  cooldownDays: number;
};

export const DEFAULT_RESEARCH_POLICY: ResearchPolicy = {
  mode: "automatic", targetDays: 75, replenishBelowDays: 30, minOpportunities: 15, minScore: 40,
  maxSeedBatches: 2, maxCompetitorBatches: 2, maxSerpLookups: 3, maxMetricsBatches: 1, maxUsdPerRun: 0.25, cooldownDays: 14,
};

type NumericKey = Exclude<keyof ResearchPolicy, "mode">;
const RANGES: Record<NumericKey, [number, number]> = {
  targetDays: [14, 120], replenishBelowDays: [7, 90], minOpportunities: [3, 100], minScore: [20, 90], maxSeedBatches: [0, 5], maxCompetitorBatches: [0, 5], maxSerpLookups: [0, 10], maxMetricsBatches: [0, 2],
  maxUsdPerRun: [0, 2], cooldownDays: [3, 60],
};
const valid = (key: NumericKey, value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= RANGES[key][0] && value <= RANGES[key][1] && (key === "maxUsdPerRun" || Number.isInteger(value));

/** Stored overrides over the defaults; an unreadable value is dropped. */
export function readResearchPolicy(stored: unknown): ResearchPolicy {
  const value = (stored && typeof stored === "object" ? stored : {}) as Record<string, unknown>;
  const policy = { ...DEFAULT_RESEARCH_POLICY };
  for (const key of Object.keys(RANGES) as NumericKey[]) if (valid(key, value[key])) policy[key] = value[key] as number;
  // An unreadable mode must not spend.
  if (value.mode !== undefined) policy.mode = (RESEARCH_MODES as readonly unknown[]).includes(value.mode) ? (value.mode as ResearchPolicy["mode"]) : "off";
  return policy;
}

/** Throws `invalid_policy` on an unknown field or a value out of range. */
export function parseResearchPolicy(input: unknown): Partial<ResearchPolicy> {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("invalid_policy");
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    const ok = key === "mode" ? (RESEARCH_MODES as readonly unknown[]).includes(value) : key in RANGES && valid(key as NumericKey, value);
    if (!ok) throw new Error("invalid_policy");
    out[key] = value;
  }
  return out as Partial<ResearchPolicy>;
}
