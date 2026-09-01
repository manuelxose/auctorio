// Transparent candidate scoring (Phase 3).
//
// The candidate score is a weighted sum of explainable components. Every
// component is stored, so Studio users can see exactly why something ranked
// highly. No single LLM prompt hides the decision.

import type { VerificationState } from "./verification";
import type { DiversityResult } from "./source-diversity";
import type { SiteFitResult } from "./site-editorial-profile";

export type CandidateComponentKey =
  | "freshness"
  | "sourceAuthority"
  | "sourceDiversity"
  | "relevance"
  | "trendPotential"
  | "novelty"
  | "entityConfidence"
  | "verificationConfidence"
  | "siteFit"
  | "contentGap";

export const CANDIDATE_WEIGHTS: Record<CandidateComponentKey, number> = {
  freshness: 0.1,
  sourceAuthority: 0.1,
  sourceDiversity: 0.15,
  relevance: 0.2,
  trendPotential: 0.1,
  novelty: 0.05,
  entityConfidence: 0.05,
  verificationConfidence: 0.1,
  siteFit: 0.1,
  contentGap: 0.05,
};

export type ScoreComponent = {
  key: CandidateComponentKey;
  value: number;
  detail: string;
};

export type CandidateScoreResult = {
  score: number;
  components: ScoreComponent[];
  reasons: string[];
};

export type CandidateScoreInput = {
  now?: Date;
  firstSeenAt: Date;
  lastSeenAt: Date;
  memberCount: number;
  authorityScore: number;
  diversity: DiversityResult;
  verificationState: VerificationState;
  corroboratedFacts: number;
  entities: Array<{ name: string; type: string; confidence: number }>;
  enrichmentCount: number;
  siteFit: SiteFitResult;
  /** Highest similarity to any existing site title (0..1). */
  coveredSimilarity: number;
  /** Domain-plugin relevance signals (e.g. movie/tv site matches). */
  domainRelevance: Array<{ score: number; reason: string }>;
};

export function clamp01(value: number): number {
  return Math.max(0, Math.min(1, Math.round(value * 1000) / 1000));
}

export function verificationConfidenceFor(state: VerificationState): number {
  switch (state) {
    case "unverified":
      return 0.1;
    case "single_source":
      return 0.3;
    case "developing":
      return 0.45;
    case "disputed":
      return 0.2;
    case "corroborated":
      return 0.65;
    case "high_confidence":
      return 0.95;
  }
}

/** Pure scoring function — deterministic and explainable. */
export function scoreCandidate(input: CandidateScoreInput): CandidateScoreResult {
  const now = input.now ?? new Date();

  const ageHours = Math.max(0, (now.getTime() - input.firstSeenAt.getTime()) / 3_600_000);
  const freshness = clamp01(Math.max(0, 1 - ageHours / 48));

  const sourceAuthority = clamp01(input.authorityScore);

  const sourceDiversity = input.diversity.diversityScore;

  // Relevance: topics/categories via site fit + domain signals + priority cues.
  const topicHit = input.siteFit.topicHit ? 0.4 : 0;
  const categoryHit = input.siteFit.categoryHit ? 0.25 : 0;
  const domainBest = input.domainRelevance.reduce((best, signal) => Math.max(best, signal.score), 0);
  const relevance = clamp01(Math.min(1, 0.1 + topicHit + categoryHit + domainBest * 0.3));

  // Trend potential: arrivals concentrated in the last 24h.
  const recencyHours = Math.max(0, (now.getTime() - input.lastSeenAt.getTime()) / 3_600_000);
  const trendPotential = clamp01(0.35 * Math.max(0, 1 - recencyHours / 24) + 0.65 * Math.min(1, input.memberCount / 5));

  const novelty = clamp01(1 - input.coveredSimilarity);

  const entityConfidence = input.entities.length
    ? clamp01(input.entities.reduce((sum, entity) => sum + entity.confidence, 0) / input.entities.length)
    : 0.2;

  const verificationConfidence = verificationConfidenceFor(input.verificationState);

  const siteFit = input.siteFit.score;

  const contentGap = input.siteFit.gapHit ? 1 : 0;

  const components: ScoreComponent[] = [
    { key: "freshness", value: freshness, detail: `age ${Math.round(ageHours)}h` },
    { key: "sourceAuthority", value: sourceAuthority, detail: `authority ${Math.round(sourceAuthority * 100) / 100}` },
    { key: "sourceDiversity", value: sourceDiversity, detail: `${input.diversity.independentPublishers} independent publishers` },
    { key: "relevance", value: relevance, detail: [input.siteFit.topicHit ? `topic:${input.siteFit.topicHit}` : null, input.siteFit.categoryHit ? `category:${input.siteFit.categoryHit}` : null].filter(Boolean).join(", ") || "generic" },
    { key: "trendPotential", value: trendPotential, detail: `${input.memberCount} sources, last seen ${Math.round(recencyHours)}h ago` },
    { key: "novelty", value: novelty, detail: `max existing similarity ${Math.round(input.coveredSimilarity * 100)}%` },
    { key: "entityConfidence", value: entityConfidence, detail: `${input.entities.length} entities` },
    { key: "verificationConfidence", value: verificationConfidence, detail: `${input.verificationState}, ${input.corroboratedFacts} corroborated facts` },
    { key: "siteFit", value: siteFit, detail: input.siteFit.reasons.join(", ") || "no profile" },
    { key: "contentGap", value: contentGap, detail: input.siteFit.gapHit ?? "no gap" },
  ];

  const score = clamp01(
    components.reduce((sum, component) => sum + component.value * CANDIDATE_WEIGHTS[component.key], 0),
  );

  // Explainability first: content-gap and site-fit signals explain WHY a
  // story was selected for this site, so they precede generic signals.
  const strong = components.filter((component) => component.value > 0.45 && component.key !== "freshness");
  const ordered = [
    ...strong.filter((component) => component.key === "contentGap"),
    ...strong.filter((component) => component.key === "siteFit"),
    ...strong.filter((component) => component.key !== "contentGap" && component.key !== "siteFit"),
  ];
  const reasons = ordered
    .slice(0, 6)
    .map((component) => `${component.key}:${component.detail}`);

  return { score, components, reasons };
}

/** Candidate funnel stage labels (for the observability report). */
export const CANDIDATE_FUNNEL_STAGES = [
  "source_items",
  "level0_filtered",
  "clustered",
  "enriched",
  "scored_candidates",
  "high_relevance",
] as const;

export function classifyCandidateBand(score: number): "low" | "medium" | "high" {
  if (score >= 0.6) {
    return "high";
  }
  if (score >= 0.4) {
    return "medium";
  }
  return "low";
}
