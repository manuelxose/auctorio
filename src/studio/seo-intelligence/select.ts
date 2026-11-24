// From a draft to a decision: factors, score, confidence, safeguards and the explanation. Pure and deterministic.

import { createHash } from "node:crypto";
import { MIN_RELEVANCE, isKeywordVariant, keywordTokens } from "../keyword-candidates";
import { pageKey, type Draft, type Evidence } from "./detect";
import {
  MIN_CONFIDENCE,
  combineFactors,
  confidenceOf,
  demandFromImpressions,
  demandFromVolume,
  factor,
  feasibilityFromPosition,
  intentValue,
  unknownFactor,
  type FactorKey,
  type Factors,
  type SeoAction,
  type SeoProfile,
  type Weights,
} from "./scoring";

export type OpportunityStatus = "open" | "monitoring" | "deferred" | "rejected";
export type Effort = "low" | "medium" | "high";

/** Stored with the opportunity and read by Studio, the planner and the assistant. Add fields, never rename them. */
export type OpportunityExplanation = {
  version: 1;
  why: string;
  action: { type: SeoAction; proposed: SeoAction; reason: string };
  evidence: Evidence[];
  factors: Array<{ key: FactorKey; value: number | null; weight: number; kind: string; detail: string }>;
  score: { value: number | null; coverage: number; note: string };
  confidence: { value: number; evidenceQuality: number; reasons: string[] };
  expected: { clicks28d: number | null; scenario: string | null; kind: "estimated" | "unknown" };
  effort: Effort;
  externalData: { required: boolean; used: string[]; detail: string };
  risks: string[];
  safeguards: Array<{ code: string; detail: string }>;
  profile: SeoProfile;
  destructiveRequiresApproval: boolean;
};

export type Decision = { draft: Draft; action: SeoAction; status: OpportunityStatus; score: number | null; confidence: number; priority: number; explanation: OpportunityExplanation };

const EFFORT: Record<SeoAction, { label: Effort; value: number }> = {
  improve_metadata: { label: "low", value: 0.9 }, improve_internal_linking: { label: "low", value: 0.9 }, monitor: { label: "low", value: 1 }, defer: { label: "low", value: 1 }, reject: { label: "low", value: 1 },
  investigate_cannibalization: { label: "medium", value: 0.7 }, resolve_technical: { label: "medium", value: 0.6 }, update_existing: { label: "medium", value: 0.6 }, expand_existing: { label: "medium", value: 0.5 },
  create_content: { label: "high", value: 0.3 }, strengthen_cluster: { label: "high", value: 0.2 },
};
const TIME_SENSITIVE = /\b(hoy|ayer|mañana|semana|20\d\d|today|tomorrow|this week)\b/i;
/** Actions that change or add pages; the rest only look. */
const CHANGES: readonly SeoAction[] = ["create_content", "update_existing", "expand_existing", "improve_metadata", "improve_internal_linking", "strengthen_cluster"];
const COOLDOWN_DAYS = 28;
const DAY_MS = 86_400_000;

export type DecisionContext = {
  profile: SeoProfile;
  weights: Weights;
  priorityTopics: string[];
  reachableDifficulty: number;
  /** null when the relevance of the subject cannot be told. */
  relevance: (subject: string) => { score: number; offTopic: boolean } | null;
  cannibalization: (query: string) => "none" | "related-cluster" | "update-existing" | "merge-candidate" | "high";
  clusters: Array<{ name: string; pagesCount: number }>;
  plannedQueries: string[];
  /** Page -> last time it was published, modified or acted on. */
  touched: Map<string, Date>;
  /** Days since the newest stored day; null without Search Console. */
  dataAgeDays: number | null;
  holdoutPercent: number;
  now: Date;
};

function buildFactors(draft: Draft, ctx: DecisionContext): Factors {
  const subject = draft.query ?? draft.topic;
  const words = keywordTokens(subject);
  const relevance = ctx.relevance(subject);
  const priority = ctx.priorityTopics.find((topic) => keywordTokens(topic).length > 0 && keywordTokens(topic).every((word) => words.includes(word)));
  const cluster = ctx.clusters.filter((entry) => keywordTokens(entry.name).length > 0 && keywordTokens(entry.name).every((word) => words.includes(word))).sort((a, b) => b.pagesCount - a.pagesCount)[0];
  const intent = intentValue(ctx.profile, draft.intent);
  const creates = draft.action === "create_content" || draft.action === "strengthen_cluster";
  const risk = creates && draft.query ? ctx.cannibalization(draft.query) : null;
  return {
    businessRelevance: priority
      ? factor(Math.max(0.95, (relevance?.score ?? 0) / 100), "estimated", `Coincide con tu tema prioritario «${priority}».`)
      : relevance ? factor(relevance.score / 100, "estimated", "Parecido con los temas del perfil del sitio.") : unknownFactor("No hay perfil del sitio con el que compararlo."),
    searchDemand: draft.impressions !== null
      ? factor(demandFromImpressions(draft.impressions), "observed", `${draft.impressions} impresiones propias en 28 días.`)
      : draft.volume ? factor(demandFromVolume(draft.volume), "provider_reported", `${draft.volume} búsquedas al mes según el proveedor.`) : unknownFactor("Sin volumen externo ni impresiones propias."),
    rankingFeasibility: draft.position !== null
      ? factor(feasibilityFromPosition(draft.position), "estimated", "Distancia desde la posición media observada. No es una probabilidad de posicionar.")
      : draft.difficulty !== null
        ? factor(draft.difficulty <= ctx.reachableDifficulty ? 1 : Math.max(0.05, 1 - (draft.difficulty - ctx.reachableDifficulty) / 40), "provider_reported", `Dificultad ${draft.difficulty} según el proveedor, frente a ${ctx.reachableDifficulty} alcanzable.`)
        : unknownFactor("Sin posición observada ni dificultad de un proveedor."),
    conversionPotential: intent === null ? unknownFactor("La intención no se deduce de la consulta y no hay datos de conversión autorizados.") : factor(intent, "estimated", `Intención ${draft.intent} para el perfil elegido. Sin datos de conversión autorizados.`),
    existingPerformance: draft.clicks === null ? unknownFactor("Sin rendimiento propio observado.") : factor(Math.min(1, Math.log10(draft.clicks + 1) / 3), "observed", `${draft.clicks} clics en 28 días.`),
    topicalAuthority: cluster ? factor(Math.min(1, cluster.pagesCount / 10), "observed", `${cluster.pagesCount} página(s) rastreadas sobre «${cluster.name}».`) : unknownFactor("Ningún tema rastreado lo cubre."),
    competitiveEvidence: draft.competitorPages === null ? unknownFactor("Sin datos de competidores para este tema.") : factor(Math.min(1, 0.3 + draft.competitorPages / 10), "observed", `${draft.competitorPages} página(s) de competidores en la muestra.`),
    seasonality: draft.seasonalLift === null ? unknownFactor("Sin historia suficiente para ver una temporada.") : factor(draft.seasonalLift / 3, "historical", `Hace un año subió ×${Math.round(draft.seasonalLift * 10) / 10} en las fechas siguientes.`),
    productionEffort: factor(EFFORT[draft.action].value, "estimated", "Esfuerzo típico de la acción."),
    maintenanceCost: factor(TIME_SENSITIVE.test(subject) ? 0.3 : creates ? 0.6 : 0.85, "estimated", TIME_SENSITIVE.test(subject) ? "Caduca pronto: habrá que mantenerla." : "Mantenimiento normal."),
    cannibalizationRisk: risk
      ? factor(risk === "none" ? 1 : risk === "related-cluster" ? 0.8 : 0.2, "estimated", `Solapamiento con lo publicado y lo planificado: ${risk}.`)
      : factor(draft.kind === "cannibalization" ? 0.5 : 1, "estimated", creates ? "Sin consulta concreta con la que comparar." : "Actúa sobre una página existente: no añade otra."),
    expectedValue: draft.expectedClicks === null ? unknownFactor("Sin datos suficientes para un escenario.") : factor(Math.log10(Math.max(0, draft.expectedClicks) + 1) / 3, "estimated", `Unos ${draft.expectedClicks} clics más en 28 días ${draft.expectedScenario ?? ""}.`),
  };
}

/** The same pages always fall in the experiment, whatever the order of the run. */
export const inHoldout = (key: string, percent: number): boolean => percent > 0 && parseInt(createHash("sha256").update(key).digest("hex").slice(0, 8), 16) % 100 < percent;

/** Which action wins when several want the same page. */
const PRECEDENCE: SeoAction[] = ["resolve_technical", "investigate_cannibalization"];
const rank = (action: SeoAction) => (PRECEDENCE.includes(action) ? PRECEDENCE.indexOf(action) : PRECEDENCE.length);

export function decideOpportunities(drafts: Draft[], ctx: DecisionContext): Decision[] {
  const decisions = drafts.map((draft) => {
    const factors = buildFactors(draft, ctx);
    const { score, coverage } = combineFactors(factors, ctx.weights);
    const firstParty = draft.source === "search_console" || draft.source === "crawl";
    const confidence = confidenceOf({ coverage, impressions: draft.impressions, days: draft.days, dataAgeDays: draft.impressions === null ? null : ctx.dataAgeDays, observed: firstParty, caveats: draft.caveats });
    const explanation: OpportunityExplanation = {
      version: 1,
      why: draft.why,
      action: { type: draft.action, proposed: draft.action, reason: draft.actionReason },
      evidence: draft.evidence,
      factors: (Object.keys(ctx.weights) as FactorKey[]).map((key) => ({ key, value: factors[key]?.value ?? null, weight: ctx.weights[key], kind: factors[key]?.kind ?? "unknown", detail: factors[key]?.detail ?? "Sin dato." })),
      score: { value: score, coverage: Math.round(coverage * 100) / 100, note: "Puntuación heurística para ordenar el trabajo: no es una probabilidad de posicionar." },
      confidence: { value: confidence.score, evidenceQuality: confidence.evidenceQuality, reasons: confidence.reasons },
      expected: { clicks28d: draft.expectedClicks, scenario: draft.expectedScenario, kind: draft.expectedClicks === null ? "unknown" : "estimated" },
      effort: EFFORT[draft.action].label,
      externalData: draft.source === "provider"
        ? { required: true, used: ["Proveedor SEO"], detail: "Usa datos de un proveedor externo ya guardados; no se ha comprado nada para esta decisión." }
        : { required: false, used: [], detail: firstParty ? "No ha hecho falta ningún dato externo de pago." : "Usa páginas públicas de competidores ya leídas; sin coste de proveedor." },
      risks: draft.risks,
      safeguards: [],
      profile: ctx.profile,
      destructiveRequiresApproval: draft.action === "investigate_cannibalization",
    };
    const decision: Decision = { draft, action: draft.action, status: draft.action === "monitor" ? "monitoring" : "open", score, confidence: confidence.score, priority: ((score ?? 0) * confidence.score) / 100, explanation };
    return decision;
  });

  const settle = (decision: Decision, status: OpportunityStatus, action: SeoAction, code: string, detail: string) => {
    decision.status = status;
    decision.action = action;
    decision.explanation.action.type = action;
    decision.explanation.safeguards.push({ code, detail });
  };

  // Each on its own.
  for (const decision of decisions) {
    const { draft } = decision;
    if (decision.status !== "open") continue;
    const technical = draft.action === "resolve_technical";
    const target = draft.targetUrl ? pageKey(draft.targetUrl) : null;
    const touched = target ? ctx.touched.get(target) : undefined;
    const creates = draft.action === "create_content";
    if (draft.query && ctx.relevance(draft.query)?.offTopic) settle(decision, "rejected", "reject", "off_topic", "La consulta queda fuera de los temas del sitio.");
    else if (creates && draft.query && (ctx.relevance(draft.query)?.score ?? 100) < MIN_RELEVANCE) settle(decision, "rejected", "reject", "low_relevance", "Se parece demasiado poco a los temas del sitio para dedicarle contenido nuevo.");
    else if (creates && draft.query && ctx.plannedQueries.some((planned) => isKeywordVariant(planned, draft.query!))) settle(decision, "rejected", "reject", "already_planned", "Ya hay un artículo planificado o publicado para esta consulta o una variante.");
    else if (creates && draft.query && ["update-existing", "merge-candidate", "high"].includes(ctx.cannibalization(draft.query))) settle(decision, "deferred", "defer", "cannibalization_risk", "Una página o un plan existente ya apunta a esta consulta: antes de crear otra hay que revisarlo.");
    else if (!technical && decision.score === null) settle(decision, "deferred", "defer", "insufficient_evidence", "Se conocen muy pocos factores para puntuarla.");
    else if (!technical && decision.confidence < MIN_CONFIDENCE) settle(decision, "deferred", "defer", "insufficient_evidence", `La confianza (${decision.confidence}) no llega al mínimo (${MIN_CONFIDENCE}).`);
    else if (touched && CHANGES.includes(draft.action) && ctx.now.getTime() - touched.getTime() < COOLDOWN_DAYS * DAY_MS) settle(decision, "monitoring", "monitor", "cooldown", `La página cambió el ${touched.toISOString().slice(0, 10)}: hacen falta ${COOLDOWN_DAYS} días para ver el efecto antes de volver a tocarla.`);
    else if (target && CHANGES.includes(draft.action) && !creates && inHoldout(target, ctx.holdoutPercent)) settle(decision, "monitoring", "monitor", "holdout", "Forma parte del grupo de control del experimento: no se toca para poder comparar.");
  }

  // Between them: one open action per page, and nothing on a query under investigation.
  const ordered = [...decisions].sort((a, b) => rank(a.draft.action) - rank(b.draft.action) || b.priority - a.priority || a.draft.dedupeKey.localeCompare(b.draft.dedupeKey));
  const pages = new Map<string, Decision>();
  const contested: string[] = [];
  const created: string[] = [];
  for (const decision of ordered) {
    const { draft } = decision;
    if (decision.status !== "open") continue;
    if (draft.action === "investigate_cannibalization" && draft.query) contested.push(draft.query);
    else if (draft.query && CHANGES.includes(draft.action) && draft.action !== "improve_internal_linking" && contested.some((query) => isKeywordVariant(query, draft.query!))) {
      settle(decision, "deferred", "defer", "cannibalization_open", "Hay una posible canibalización sin resolver en esta consulta.");
      continue;
    }
    if (draft.action === "create_content" && draft.query) {
      if (created.some((query) => isKeywordVariant(query, draft.query!))) {
        settle(decision, "rejected", "reject", "duplicate", "Otra oportunidad propone el mismo contenido.");
        continue;
      }
      created.push(draft.query);
    }
    const target = draft.targetUrl ? pageKey(draft.targetUrl) : null;
    if (!target) continue;
    const winner = pages.get(target);
    if (winner) settle(decision, "deferred", "defer", "conflict", `La misma página ya tiene una acción prioritaria: ${winner.action} (${winner.draft.topic}).`);
    else pages.set(target, decision);
  }
  return decisions;
}
