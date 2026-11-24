// How much an opportunity is worth to one site. Pure: no database, no provider, no model.
// A score is a heuristic to order work. It is never a ranking probability.

import { normalizeKeyword } from "../../infrastructure/seo/contract";

export const SEO_ACTIONS = [
  "create_content", "update_existing", "expand_existing", "improve_metadata", "improve_internal_linking", "strengthen_cluster",
  "investigate_cannibalization", "resolve_technical", "monitor", "defer", "reject",
] as const;
export type SeoAction = (typeof SEO_ACTIONS)[number];

/** The contract's kinds of data: what was seen is never mixed with what was guessed. */
export type DataKind = "observed" | "provider_reported" | "estimated" | "historical" | "unavailable" | "unknown";

export const FACTORS = [
  "businessRelevance", "searchDemand", "rankingFeasibility", "conversionPotential", "existingPerformance", "topicalAuthority",
  "competitiveEvidence", "seasonality", "productionEffort", "maintenanceCost", "cannibalizationRisk", "expectedValue",
] as const;
export type FactorKey = (typeof FACTORS)[number];
/** 0–1, always "more is better" (effort, maintenance and risk are inverted); null = unknown, and it stays unknown. */
export type Factor = { value: number | null; kind: DataKind; detail: string };
export type Factors = Partial<Record<FactorKey, Factor>>;
export type Weights = Record<FactorKey, number>;

export const SEO_PROFILES = ["publisher", "corporate", "local_business", "services", "ecommerce", "new_website", "custom"] as const;
export type SeoProfile = (typeof SEO_PROFILES)[number];
export const isSeoProfile = (value: unknown): value is SeoProfile => (SEO_PROFILES as readonly unknown[]).includes(value);

const BASE: Weights = {
  businessRelevance: 1, searchDemand: 1, rankingFeasibility: 0.8, conversionPotential: 0.8, existingPerformance: 0.5, topicalAuthority: 0.5,
  competitiveEvidence: 0.3, seasonality: 0.3, productionEffort: 0.4, maintenanceCost: 0.3, cannibalizationRisk: 0.6, expectedValue: 0.8,
};
const PROFILE_WEIGHTS: Record<SeoProfile, Weights> = {
  publisher: { ...BASE, searchDemand: 1.2, conversionPotential: 0.5, seasonality: 0.6 },
  corporate: { ...BASE, businessRelevance: 1.4, searchDemand: 0.6, conversionPotential: 1.1 },
  local_business: { ...BASE, businessRelevance: 1.5, searchDemand: 0.4, conversionPotential: 1.4, maintenanceCost: 0.5 },
  services: { ...BASE, businessRelevance: 1.4, searchDemand: 0.6, conversionPotential: 1.4 },
  ecommerce: { ...BASE, businessRelevance: 1.2, conversionPotential: 1.5, seasonality: 0.6 },
  new_website: { ...BASE, searchDemand: 0.6, rankingFeasibility: 1.5, existingPerformance: 0.2, competitiveEvidence: 0.6, productionEffort: 0.6 },
  custom: BASE,
};

/** The owner's weights win over the profile's; anything unreadable is ignored. */
export function resolveWeights(profile: SeoProfile, overrides?: unknown): Weights {
  const weights = { ...PROFILE_WEIGHTS[profile] };
  if (overrides && typeof overrides === "object") {
    for (const key of FACTORS) {
      const value = (overrides as Record<string, unknown>)[key];
      if (typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 3) weights[key] = value;
    }
  }
  return weights;
}

export type SearchIntentClass = "informational" | "navigational" | "commercial" | "transactional";
const INTENT_VALUE: Record<SeoProfile, Record<SearchIntentClass, number>> = {
  publisher: { informational: 1, navigational: 1, commercial: 0.8, transactional: 0.5 },
  corporate: { informational: 0.7, navigational: 0.9, commercial: 1, transactional: 0.9 },
  local_business: { informational: 0.5, navigational: 0.9, commercial: 0.9, transactional: 1 },
  services: { informational: 0.6, navigational: 0.7, commercial: 1, transactional: 1 },
  ecommerce: { informational: 0.5, navigational: 0.6, commercial: 1, transactional: 1 },
  new_website: { informational: 1, navigational: 0.5, commercial: 0.8, transactional: 0.7 },
  custom: { informational: 0.8, navigational: 0.8, commercial: 0.8, transactional: 0.8 },
};

/** What an intent is worth to the business; null when the intent is unknown. */
export function intentValue(profile: SeoProfile, intent: string | null | undefined): number | null {
  const key = (intent ?? "").split("-")[0] as SearchIntentClass;
  return INTENT_VALUE[profile][key] ?? null;
}

const fold = (value: string) => normalizeKeyword(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "");
/** Intent written in the query itself; null when its words do not say. An estimate, never a provider's classification. */
export function queryIntent(query: string): SearchIntentClass | null {
  const text = fold(query);
  if (/\b(comprar|contratar|reservar|presupuesto|descargar|pedir|cerca de mi|near me|buy|order|book|hire|download)\b/.test(text)) return "transactional";
  if (/\b(mejor(es)?|precios?|baratos?|baratas?|ofertas?|vs|comparativas?|opiniones|alternativas?|best|price|cheap|review|reviews|coste|cuanto cuesta)\b/.test(text)) return "commercial";
  if (/^(que|como|cuando|donde|por que|quien|cual|cuales|para que|what|how|when|where|why|who)\b|\b(guia|tutorial|significado|ejemplos?|horarios?)\b/.test(text)) return "informational";
  return null;
}

/** Profile when the owner has not chosen one. A content site is the product's default. */
export function defaultSeoProfile(siteType: string, detectedSiteType: string | null): SeoProfile {
  const text = fold(`${detectedSiteType ?? ""}`);
  if (/shop|store|commerce|tienda/.test(text)) return "ecommerce";
  if (/local/.test(text)) return "local_business";
  if (/saas|service|servicio|agenc|software/.test(text) || siteType === "talkaris") return "services";
  if (/corporat|company|empresa/.test(text)) return "corporate";
  return "publisher";
}

/** Share of the weight that must be known before a score means anything. */
export const MIN_COVERAGE = 0.35;
const FLOOR = 0.02;

/**
 * Weighted geometric mean of the known factors, 0–100. Unknown factors leave the formula instead of
 * counting as zero or as an average; `coverage` says how much of the decision they left uncovered.
 */
export function combineFactors(factors: Factors, weights: Weights): { score: number | null; coverage: number } {
  let known = 0;
  let total = 0;
  let sum = 0;
  for (const key of FACTORS) {
    const weight = weights[key];
    if (!weight) continue;
    total += weight;
    const value = factors[key]?.value;
    if (value === null || value === undefined || !Number.isFinite(value)) continue;
    known += weight;
    sum += weight * Math.log(Math.max(FLOOR, Math.min(1, value)));
  }
  const coverage = total ? known / total : 0;
  return { score: known && coverage >= MIN_COVERAGE ? Math.round(100 * Math.exp(sum / known)) : null, coverage };
}

export type Confidence = { score: number; evidenceQuality: number; reasons: string[] };
/** Below it nothing is recommended: the opportunity waits for evidence. */
export const MIN_CONFIDENCE = 35;

/** How far the data supports the decision, apart from how good the opportunity looks. */
export function confidenceOf(input: { coverage: number; impressions: number | null; days: number | null; dataAgeDays: number | null; observed: boolean; caveats?: string[] }): Confidence {
  const reasons: string[] = [];
  // 1 from 1000 impressions and 14 days with data; a single day never reaches it.
  const sample = input.impressions === null ? null : Math.min(1, Math.log10(input.impressions + 1) / 3);
  const spread = input.days === null ? null : Math.min(1, input.days / 14);
  const evidenceQuality = sample === null ? 0.5 : sample * (spread === null ? 0.8 : 0.4 + 0.6 * spread);
  reasons.push(sample === null ? "Sin datos propios de búsqueda: se apoya en el rastreo o en la competencia." : `${input.impressions} impresiones observadas${input.days === null ? "" : ` en ${input.days} días con datos`}.`);
  reasons.push(`Se conoce el ${Math.round(input.coverage * 100)} % de lo que pesa en la decisión.`);
  let score = 100 * (0.45 * input.coverage + 0.55 * evidenceQuality) * (input.observed ? 1 : 0.8);
  if (input.dataAgeDays !== null && input.dataAgeDays > 10) {
    score *= input.dataAgeDays > 30 ? 0.5 : 0.75;
    reasons.push(`Los datos tienen ${input.dataAgeDays} días.`);
  }
  for (const caveat of input.caveats ?? []) {
    score *= 0.85;
    reasons.push(caveat);
  }
  return { score: Math.round(Math.max(0, Math.min(100, score))), evidenceQuality: Math.round(evidenceQuality * 100) / 100, reasons };
}

export const unknownFactor = (detail: string): Factor => ({ value: null, kind: "unknown", detail });
export const factor = (value: number | null, kind: DataKind, detail: string): Factor =>
  value === null ? unknownFactor(detail) : { value: Math.round(Math.max(0, Math.min(1, value)) * 1000) / 1000, kind, detail };

/** Observed exposure. Impressions are the site's own visibility, not the market's volume: 10k in 28 days → 1. */
export const demandFromImpressions = (impressions: number) => Math.min(1, Math.log10(impressions + 1) / 4);
/** Provider volume: 100k searches a month → 1. */
export const demandFromVolume = (volume: number) => Math.min(1, Math.log10(volume + 1) / 5);
/** The closer the observed average position, the less is left to climb. */
export const feasibilityFromPosition = (position: number) => Math.max(0.1, Math.min(1, 1 - Math.max(0, position - 4) / 40));
