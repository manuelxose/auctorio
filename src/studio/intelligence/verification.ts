// Fact ledger + verification state machine (Phase 3).
//
// Inference is never presented as fact. Every fact tracks which source
// supports it, and the cluster's verification state is a pure function of
// the facts and the publisher diversity — no model involved.
//
// States: unverified → single_source → corroborated → high_confidence,
// plus disputed (conflicting claims) and developing (actively updating).

import { Prisma } from "@prisma/client";
import { getPrismaClient } from "../../infrastructure/db/prisma";
import { normalizeText } from "../../shared/utils/text";
import { publisherGroupKey } from "./source-diversity";

const prisma = getPrismaClient();

export const VERIFICATION_STATES = [
  "unverified",
  "single_source",
  "corroborated",
  "high_confidence",
  "disputed",
  "developing",
] as const;

export type VerificationState = (typeof VERIFICATION_STATES)[number];

export const DEVELOPING_WINDOW_HOURS = 6;

/** Fact keys where differing statements mean a real conflict (dates, years,
 *  identities). Headline wording differs naturally per publisher and must
 *  never be treated as a factual dispute. */
export const CONFLICT_SENSITIVE_FACT_KEYS = new Set(["published_at", "release_year", "title_identity"]);

export type FactExtraction = {
  factKey: string;
  statement: string;
  confidence: number;
  evidenceRef: string;
};

export type FactSource = {
  itemId: string;
  sourceUrl: string | null;
  publisher: string | null;
  sourceDomain: string | null;
};

/** Deterministic fact extraction from a normalized source item. No AI. */
export function extractFactsFromItem(input: {
  title: string;
  description?: string | null;
  publishedAt?: Date | null;
  language?: string | null;
  externalId: string;
}): FactExtraction[] {
  const facts: FactExtraction[] = [
    {
      factKey: "headline",
      statement: input.title.trim().slice(0, 300),
      confidence: 0.95,
      evidenceRef: `title:${input.externalId}`,
    },
  ];
  if (input.publishedAt) {
    facts.push({
      factKey: "published_at",
      statement: input.publishedAt.toISOString(),
      confidence: 0.9,
      evidenceRef: `publishedAt:${input.externalId}`,
    });
  }
  if (input.language) {
    facts.push({
      factKey: "language",
      statement: input.language,
      confidence: 0.85,
      evidenceRef: `language:${input.externalId}`,
    });
  }
  return facts;
}

export function normalizeFactStatement(statement: string): string {
  return normalizeText(statement).toLowerCase();
}

export type UpsertStoryFactsInput = {
  tenantId: string;
  clusterId: string;
  source: FactSource;
  facts: FactExtraction[];
};

/** Upsert facts for one item into the ledger, detecting conflicting claims
 *  from different publishers (same factKey, materially different statement). */
export async function upsertStoryFacts(input: UpsertStoryFactsInput): Promise<number> {
  const group = publisherGroupKey(input.source.sourceDomain) ?? input.source.publisher ?? "unknown";
  let count = 0;
  for (const fact of input.facts) {
    const normalized = normalizeFactStatement(fact.statement);
    const conflictSensitive = CONFLICT_SENSITIVE_FACT_KEYS.has(fact.factKey);

    // Find a same-key fact from a DIFFERENT publisher group.
    const conflicting = conflictSensitive
      ? await prisma.storyFact.findFirst({
          where: {
            tenantId: input.tenantId,
            clusterId: input.clusterId,
            factKey: fact.factKey,
            NOT: { itemId: input.source.itemId },
            metadata: { path: ["publisher_group"], not: group },
          },
          orderBy: { extractedAt: "asc" },
        })
      : null;

    const conflicts: Array<{ factId: string; statement: string; publisher: string | null }> = [];
    let verificationStatus = "unverified";
    if (conflicting && normalizeFactStatement(conflicting.statement) !== normalized) {
      // Conflicting publication dates / factual claims are recorded on both
      // sides; the cluster then reports `disputed` with evidence.
      conflicts.push({ factId: conflicting.id, statement: conflicting.statement.slice(0, 300), publisher: conflicting.publisher });
      verificationStatus = "conflicting";
      await prisma.storyFact.update({
        where: { id: conflicting.id },
        data: {
          verificationStatus: "conflicting",
          conflictingFacts: [
            ...(Array.isArray(conflicting.conflictingFacts) ? (conflicting.conflictingFacts as unknown[]) : []),
            { factId: null, statement: fact.statement.slice(0, 300), publisher: input.source.publisher },
          ] as Prisma.InputJsonValue,
        },
      });
    }

    await prisma.storyFact.upsert({
      where: {
        tenantId_itemId_factKey: { tenantId: input.tenantId, itemId: input.source.itemId, factKey: fact.factKey },
      },
      create: {
        tenantId: input.tenantId,
        clusterId: input.clusterId,
        itemId: input.source.itemId,
        factKey: fact.factKey,
        statement: fact.statement,
        sourceUrl: input.source.sourceUrl,
        publisher: input.source.publisher,
        evidenceRef: fact.evidenceRef,
        confidence: fact.confidence,
        verificationStatus,
        conflictingFacts: conflicts.length ? (conflicts as Prisma.InputJsonValue) : Prisma.JsonNull,
        metadata: { publisher_group: group } as Prisma.InputJsonValue,
      },
      update: {
        statement: fact.statement,
        sourceUrl: input.source.sourceUrl,
        publisher: input.source.publisher,
        confidence: fact.confidence,
        verificationStatus,
        conflictingFacts: conflicts.length ? (conflicts as Prisma.InputJsonValue) : Prisma.JsonNull,
      },
    });
    count += 1;
  }
  return count;
}

export type VerificationInput = {
  /** Independent publisher groups (post-syndication-folding). */
  independentPublishers: number;
  factCount: number;
  /** Number of facts with verificationStatus = "conflicting". */
  conflictingFacts: number;
  /** Number of facts corroborated by ≥2 independent publishers. */
  corroboratedFacts: number;
  /** Whether any member item was updated within the developing window. */
  developing: boolean;
};

/** Pure transition function — never involves a model. */
export function computeVerificationState(input: VerificationInput): { state: VerificationState; reasons: string[] } {
  const reasons: string[] = [];
  if (input.factCount === 0) {
    return { state: "unverified", reasons: ["no_facts"] };
  }
  if (input.conflictingFacts > 0) {
    reasons.push(`conflicting_facts:${input.conflictingFacts}`);
    return { state: "disputed", reasons };
  }
  if (input.developing) {
    reasons.push("active_updates");
    if (input.independentPublishers >= 2) {
      reasons.push(`independent_publishers:${input.independentPublishers}`);
      return { state: "developing", reasons };
    }
    return { state: "single_source", reasons };
  }
  if (input.independentPublishers >= 3 && input.corroboratedFacts >= 3) {
    reasons.push(`independent_publishers:${input.independentPublishers}`);
    reasons.push(`corroborated_facts:${input.corroboratedFacts}`);
    return { state: "high_confidence", reasons };
  }
  if (input.independentPublishers >= 2) {
    reasons.push(`independent_publishers:${input.independentPublishers}`);
    return { state: "corroborated", reasons };
  }
  reasons.push(`single_publisher:${input.independentPublishers}`);
  return { state: "single_source", reasons };
}

export type FactLedgerSummary = {
  factCount: number;
  conflictingFacts: number;
  corroboratedFacts: number;
  byKey: Record<string, { supporters: number; variants: Array<{ statement: string; publisher: string | null; groups: number }> }>;
};

/** Aggregate the ledger for a cluster: which facts, who supports them, and
 *  whether independent publishers agree. */
export async function summarizeClusterFacts(tenantId: string, clusterId: string): Promise<FactLedgerSummary> {
  const facts = await prisma.storyFact.findMany({
    where: { tenantId, clusterId },
    orderBy: { extractedAt: "asc" },
    select: { factKey: true, statement: true, publisher: true, verificationStatus: true, metadata: true },
  });

  const byKey: FactLedgerSummary["byKey"] = {};
  let conflictingFacts = 0;
  for (const fact of facts) {
    if (!byKey[fact.factKey]) {
      byKey[fact.factKey] = { supporters: 0, variants: [] };
    }
    const bucket = byKey[fact.factKey];
    const group =
      fact.metadata && typeof fact.metadata === "object" && !Array.isArray(fact.metadata)
        ? String((fact.metadata as Record<string, unknown>).publisher_group ?? "unknown")
        : "unknown";
    let variant = bucket.variants.find(
      (entry) => normalizeFactStatement(entry.statement) === normalizeFactStatement(fact.statement),
    );
    if (!variant) {
      variant = { statement: fact.statement, publisher: fact.publisher, groups: 0 };
      bucket.variants.push(variant);
    }
    variant.groups += 1;
    bucket.supporters += 1;
    if (fact.verificationStatus === "conflicting") {
      conflictingFacts += 1;
    }
  }

  // Corroboration: one statement variant supported by ≥2 distinct publisher
  // groups, and no competing variant for the same key.
  let corroboratedFacts = 0;
  for (const bucket of Object.values(byKey)) {
    if (bucket.variants.length === 1 && bucket.variants[0].groups >= 2) {
      corroboratedFacts += 1;
    }
  }

  return {
    factCount: facts.length,
    conflictingFacts,
    corroboratedFacts,
    byKey,
  };
}

/** Persist cluster verification state + explainable detail. */
export async function refreshClusterVerification(
  tenantId: string,
  clusterId: string,
  input: VerificationInput,
): Promise<{ state: VerificationState; reasons: string[] }> {
  const { state, reasons } = computeVerificationState(input);
  await prisma.storyCluster.update({
    where: { id: clusterId },
    data: {
      verificationState: state,
      verificationDetail: { reasons, asOf: new Date().toISOString() } as Prisma.InputJsonValue,
    },
  });
  return { state, reasons };
}
