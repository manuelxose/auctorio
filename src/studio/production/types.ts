// Unified production pipeline — shared types (see docs/adr/unified-production-pipeline.md).

import type { DuplicateCheckResult } from "../editorial-engine/duplicate-check";
import type { FactSafetyContext, FactSafetyReport } from "../editorial-engine/fact-safety";
import type {
  EditorialBrief,
  EditorialQaReport,
  PublicationDecision,
  ProvenanceEntry,
  EngineEnrichment,
  EngineEntity,
  EngineInternalLink,
  LedgerFact,
  ParsedArticle,
  SeoPackage,
  SiteValueBlock,
} from "../editorial-engine/types";
import type { QaReportV2 } from "../qa";

export type ProductionRequestOptions = {
  language?: "es" | "en";
  articleTypeOverride?: string | null;
  searchIntentOverride?: string | null;
  /** Cluster runs only: when false the draft is not materialized (dry run). */
  persistDraft?: boolean;
};

export type ProductionRequest =
  | ({ kind: "plan_item"; planItemId: string } & ProductionRequestOptions)
  | ({ kind: "cluster"; clusterId: string; siteId?: string | null } & ProductionRequestOptions)
  | ({ kind: "manual"; title: string; brief: string; siteId: string } & ProductionRequestOptions);

export type ProductionKind = ProductionRequest["kind"];

export const PRODUCTION_STAGES = [
  "prepare",
  "duplicates",
  "evidence",
  "brief",
  "write",
  "seo",
  "qa",
  "gates",
  "materialize",
] as const;

export type ProductionStage = (typeof PRODUCTION_STAGES)[number];

export const ACTIVE_JOB_STATUSES = ["queued", "running"] as const;

/** Inputs loaded by the kind-specific `prepare` stage. Recomputed on every run, never persisted. */
export type PreparedInput = {
  kind: ProductionKind;
  tenantId: string;
  siteId: string;
  site: { id: string; name: string; type: string; locale: string; siteValueConfig: unknown };
  language: "es" | "en";
  headline: string;
  summary: string | null;
  entities: EngineEntity[];
  enrichments: EngineEnrichment[];
  ledgerFacts: LedgerFact[];
  factContext: FactSafetyContext;
  memberTitles: string[];
  sourceTexts: string[];
  internalLinks: EngineInternalLink[];
  indexedPageTitles: string[];
  siteFitScore: number | null;
  /** Primary entity names used by the duplicate check. */
  primaryEntityNames: string[];
  /** Project created for this job before writing (plan item shell); excluded from the duplicate check. */
  ownProjectId: string | null;
  /** Cluster specifics (classifier / site-value pre-stages). */
  cluster: {
    id: string;
    status: string;
    primarySourceId: string | null;
    categories: string[];
    verificationState: string;
    ageHours: number;
  } | null;
  /** Plan item / manual specifics. */
  plan: {
    planItemId: string | null;
    planId: string | null;
    record: Record<string, unknown>;
    generation: Record<string, unknown>;
    guidance: string[];
  } | null;
  options: ProductionRequestOptions;
};

export type BriefArtifact = {
  brief: EditorialBrief;
  siteValueBlocks: SiteValueBlock[];
  previousArticle: { title: string; bodyHtml: string } | null;
  updateDelta: {
    newFacts: string[];
    changedFacts: Array<{ factKey: string; before: string; after: string }>;
    previousTitle: string | null;
  } | null;
  guidance: string[];
};

export type WriteArtifact = {
  parsed: ParsedArticle;
  provider: string;
  model: string;
  writerPrompt: string;
};

export type QaArtifact = { editorial: EditorialQaReport; version: QaReportV2 };

export type GatesArtifact = { decision: PublicationDecision; copyrightWarning: boolean; provenance: ProvenanceEntry[] };

export type MaterializeArtifact = {
  projectId: string | null;
  versionId: string | null;
  publicationId: string | null;
  /** Hero image enqueue failure (job finishes as partial; the draft is kept). */
  imageRequestError: string | null;
};

export type ProductionArtifacts = {
  completed?: ProductionStage[];
  duplicates?: DuplicateCheckResult;
  evidence?: FactSafetyReport;
  brief?: BriefArtifact;
  write?: WriteArtifact;
  seo?: SeoPackage;
  qa?: QaArtifact;
  gates?: GatesArtifact;
  materialize?: MaterializeArtifact;
};

export type StageContext = {
  jobId: string;
  tenantId: string;
  siteId: string;
  kind: ProductionKind;
  request: ProductionRequest;
  generationId: string | null;
  input: PreparedInput;
  artifacts: ProductionArtifacts;
  now: Date;
};

/** A stage stopped the run on purpose (skip / gate rejection), not a crash. */
export class ProductionStop extends Error {
  constructor(
    public readonly code: string,
    message: string,
    /** Stage a retry must resume from (defaults to the stage that stopped). */
    public readonly resumeFrom?: ProductionStage,
  ) {
    super(message);
  }
}
