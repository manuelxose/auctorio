// Multi-signal story clustering (Phase 3).
//
// Deterministic signals first, expensive signals only when necessary:
//   1. external movie/TV id match        (enrichment identity)
//   2. normalized-title fingerprint      (cross-source same story)
//   3. title similarity                  (token + bigram overlap)
//   4. named-entity overlap              (people, companies, franchises)
//   5. source category / publication window compatibility
//   6. semantic similarity (level 3)     — only for ambiguous candidates
//
// No embeddings are used unless a similarity provider is configured and the
// deterministic signals are inconclusive.

import { Prisma } from "@prisma/client";
import { getPrismaClient } from "../../infrastructure/db/prisma";
import { titleSimilarity } from "../editorial";

const prisma = getPrismaClient();

export const CLUSTER2_WINDOW_HOURS = 7 * 24;
export const CLUSTER2_TITLE_THRESHOLD = 0.55;
export const CLUSTER2_ENTITY_TITLE_FLOOR = 0.35;
export const CLUSTER2_ENTITY_OVERLAP_THRESHOLD = 0.5;
export const CLUSTER2_AMBIGUOUS_BAND = 0.12; // within this band → semantic help

const MAX_CLUSTER_CANDIDATES = 200;
const MAX_MEMBER_TITLES = 40;

export type ClusterEntitySignal = {
  key: string;
  type: string;
  name: string;
  externalIds: Record<string, string>;
};

export type ClusterSignals = {
  titleSimilarity: number;
  normalizedTitleMatch: boolean;
  entityOverlap: number;
  sharedEntities: string[];
  externalIdMatch: string | null;
  sourceCategoryOverlap: string | null;
  windowHours: number;
  score: number;
  matchedBy: "external_id" | "normalized_title" | "title_similarity" | "entity_overlap" | "none";
  ambiguous: boolean;
};

export type SemanticSimilarityProvider = {
  provider: string;
  similarity(a: string, b: string): Promise<number>;
};

let semanticProvider: SemanticSimilarityProvider | null = null;

export function setSemanticSimilarityProvider(provider: SemanticSimilarityProvider | null): void {
  semanticProvider = provider;
}

export function getSemanticSimilarityProvider(): SemanticSimilarityProvider | null {
  return semanticProvider;
}

export type ClusterItemInput = {
  id: string;
  title: string;
  description?: string | null;
  sourceId: string;
  clusterId?: string | null;
  discoveredAt?: Date;
  publishedAt?: Date | null;
  categories?: Prisma.JsonValue | null;
  language?: string | null;
  normalizedTitleHash?: string | null;
  entitySignals?: ClusterEntitySignal[];
};

/** Pure, deterministic signal computation against one candidate cluster. */
export function computeClusterSignals(
  item: ClusterItemInput,
  candidate: {
    id: string;
    headline: string | null;
    lastSeenAt: Date;
    memberTitles: string[];
    normalizedTitleHashes: string[];
    entitySignals: ClusterEntitySignal[];
    categories: string[];
  },
  now: Date = new Date(),
): ClusterSignals {
  const signals: ClusterSignals = {
    titleSimilarity: 0,
    normalizedTitleMatch: false,
    entityOverlap: 0,
    sharedEntities: [],
    externalIdMatch: null,
    sourceCategoryOverlap: null,
    windowHours: 0,
    score: 0,
    matchedBy: "none",
    ambiguous: false,
  };

  const memberSimilarities = candidate.memberTitles.map((title) => titleSimilarity(item.title, title));
  signals.titleSimilarity = Math.max(
    ...(memberSimilarities.length ? memberSimilarities : [0]),
    titleSimilarity(item.title, candidate.headline),
  );

  if (item.normalizedTitleHash && candidate.normalizedTitleHashes.includes(item.normalizedTitleHash)) {
    signals.normalizedTitleMatch = true;
  }

  // External id identity (TMDB/IMDb ids) — strongest deterministic signal.
  const itemExternalIds = new Set<string>();
  for (const entity of item.entitySignals ?? []) {
    for (const [provider, id] of Object.entries(entity.externalIds)) {
      itemExternalIds.add(`${provider}:${id}`);
    }
  }
  for (const candidateEntity of candidate.entitySignals) {
    for (const [provider, id] of Object.entries(candidateEntity.externalIds)) {
      if (itemExternalIds.has(`${provider}:${id}`)) {
        signals.externalIdMatch = `${provider}:${id}`;
        break;
      }
    }
    if (signals.externalIdMatch) {
      break;
    }
  }

  // Named-entity overlap (person/company/franchise names shared).
  const itemEntityKeys = new Set((item.entitySignals ?? []).map((entity) => entity.key));
  for (const candidateEntity of candidate.entitySignals) {
    if (itemEntityKeys.has(candidateEntity.key)) {
      signals.sharedEntities.push(candidateEntity.name);
    }
  }
  const itemEntityCount = itemEntityKeys.size;
  const candidateEntityCount = candidate.entitySignals.length;
  const union = new Set<string>([...itemEntityKeys, ...candidate.entitySignals.map((entity) => entity.key)]);
  signals.entityOverlap = union.size > 0 ? Math.round((signals.sharedEntities.length / union.size) * 1000) / 1000 : 0;

  // Source category compatibility.
  const itemCategories = Array.isArray(item.categories) ? item.categories.map(String) : [];
  const overlapCategory = itemCategories.find((category) => candidate.categories.includes(category));
  if (overlapCategory) {
    signals.sourceCategoryOverlap = overlapCategory;
  }

  signals.windowHours = Math.max(0, Math.round((now.getTime() - candidate.lastSeenAt.getTime()) / 3_600_000));

  // Score and classification.
  let score = signals.titleSimilarity;
  if (signals.externalIdMatch) {
    signals.matchedBy = "external_id";
    score += 0.5;
  } else if (signals.normalizedTitleMatch && signals.titleSimilarity >= CLUSTER2_ENTITY_TITLE_FLOOR) {
    signals.matchedBy = "normalized_title";
    score += 0.35;
  } else if (signals.titleSimilarity >= CLUSTER2_TITLE_THRESHOLD) {
    signals.matchedBy = "title_similarity";
  } else if (
    signals.entityOverlap >= CLUSTER2_ENTITY_OVERLAP_THRESHOLD &&
    signals.titleSimilarity >= CLUSTER2_ENTITY_TITLE_FLOOR
  ) {
    signals.matchedBy = "entity_overlap";
    score += 0.15;
  }
  signals.score = Math.round(score * 1000) / 1000;

  // Ambiguity band: close to the title threshold but not decisive.
  signals.ambiguous =
    signals.matchedBy === "none" &&
    signals.titleSimilarity >= CLUSTER2_TITLE_THRESHOLD - CLUSTER2_AMBIGUOUS_BAND;

  return signals;
}

/** Which candidate clusters to scan (bounded, windowed). */
export async function listClusterCandidates(tenantId: string, now: Date = new Date()) {
  return prisma.storyCluster.findMany({
    where: {
      tenantId,
      status: { in: ["open", "selected", "developing", "updated"] },
      lastSeenAt: { gte: new Date(now.getTime() - CLUSTER2_WINDOW_HOURS * 3_600_000) },
    },
    orderBy: { lastSeenAt: "desc" },
    take: MAX_CLUSTER_CANDIDATES,
    select: {
      id: true,
      headline: true,
      lastSeenAt: true,
      metadata: true,
      items: {
        orderBy: { discoveredAt: "desc" },
        take: MAX_MEMBER_TITLES,
        select: { title: true, normalizedTitleHash: true, categories: true },
      },
    },
  });
}

function readClusterEntitySignals(metadata: Prisma.JsonValue): ClusterEntitySignal[] {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return [];
  }
  const entities = (metadata as Record<string, unknown>).cluster_entities;
  if (!Array.isArray(entities)) {
    return [];
  }
  return entities.filter(
    (entry): entry is ClusterEntitySignal =>
      typeof entry === "object" && entry !== null && typeof (entry as Record<string, unknown>).key === "string",
  ) as ClusterEntitySignal[];
}

export type MultiSignalAssignment = {
  clusterId: string | null;
  created: boolean;
  signals: ClusterSignals | null;
};

/**
 * Assign one source item to a story cluster using all deterministic signals.
 * Level 3 semantic similarity is consulted only when a candidate is in the
 * ambiguity band (and a provider is configured).
 */
export async function clusterSourceItemMultiSignal(
  tenantId: string,
  item: ClusterItemInput,
): Promise<MultiSignalAssignment> {
  const now = item.discoveredAt ?? new Date();
  const candidates = await listClusterCandidates(tenantId, now);

  let best: { clusterId: string; signals: ClusterSignals } | null = null;
  for (const candidate of candidates) {
    const candidateCategories = Array.from(
      new Set(
        candidate.items
          .map((member) => (Array.isArray(member.categories) ? member.categories.map(String) : []))
          .flat(),
      ),
    );
    const signals = computeClusterSignals(item, {
      id: candidate.id,
      headline: candidate.headline,
      lastSeenAt: candidate.lastSeenAt,
      memberTitles: candidate.items.map((member) => member.title),
      normalizedTitleHashes: candidate.items.map((member) => member.normalizedTitleHash).filter((hash): hash is string => Boolean(hash)),
      entitySignals: readClusterEntitySignals(candidate.metadata),
      categories: candidateCategories,
    }, now);

    if (signals.matchedBy === "external_id" || signals.matchedBy === "normalized_title") {
      return {
        clusterId: candidate.id,
        created: false,
        signals,
      };
    }
    if (signals.matchedBy === "title_similarity" || signals.matchedBy === "entity_overlap") {
      if (!best || signals.score > best.signals.score) {
        best = { clusterId: candidate.id, signals };
      }
      continue;
    }

    // Ambiguity band → semantic similarity (level 3) only when configured.
    if (signals.ambiguous && semanticProvider) {
      const semantic = await semanticProvider.similarity(item.title, candidate.headline ?? "");
      if (semantic >= CLUSTER2_TITLE_THRESHOLD) {
        return {
          clusterId: candidate.id,
          created: false,
          signals: { ...signals, matchedBy: "title_similarity", score: Math.round((signals.score + 0.1) * 1000) / 1000 },
        };
      }
    }
  }

  if (best) {
    return { clusterId: best.clusterId, created: false, signals: best.signals };
  }
  return { clusterId: null, created: true, signals: null };
}

/** Attach the item to a cluster (or create one) and refresh aggregates. */
export async function assignClusterAndRefresh(
  tenantId: string,
  item: ClusterItemInput & { sourceId: string },
  assignment: MultiSignalAssignment,
): Promise<{ clusterId: string; created: boolean }> {
  if (!assignment.created && assignment.clusterId) {
    await prisma.sourceItem.update({
      where: { id: item.id },
      data: { clusterId: assignment.clusterId },
    });
    const { refreshClusterAggregates } = await import("../editorial");
    await refreshClusterAggregates(assignment.clusterId);
    return { clusterId: assignment.clusterId, created: false };
  }

  const created = await prisma.storyCluster.create({
    data: {
      tenantId,
      headline: item.title.slice(0, 300),
      summary: String(item.description ?? "").slice(0, 500) || null,
      primarySourceId: item.sourceId,
      firstSeenAt: new Date(),
      lastSeenAt: new Date(),
      sourceCount: 1,
      status: "open",
      entityCandidates: (item.entitySignals ?? []).map((entity) => entity.name) as Prisma.InputJsonValue,
      confidence: 1,
      freshnessScore: 1,
      authorityScore: 0.5,
      relevanceScore: 0,
      editorialValue: 0,
      verificationState: "unverified",
      metadata: Prisma.JsonNull,
    },
    select: { id: true },
  });
  await prisma.sourceItem.update({
    where: { id: item.id },
    data: { clusterId: created.id },
  });
  const { refreshClusterAggregates } = await import("../editorial");
  await refreshClusterAggregates(created.id);
  return { clusterId: created.id, created: true };
}
