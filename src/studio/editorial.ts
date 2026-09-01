import { Prisma } from "@prisma/client";
import type { ContentProject, SourceItem, SourceItemStatus, StoryCluster } from "@prisma/client";
import { getPrismaClient } from "../infrastructure/db/prisma";
import { normalizeText } from "../shared/utils/text";
import { sha256 } from "../shared/utils/hash";

const prisma = getPrismaClient();

// ────────────────────────────────────────────────────────────── Text similarity

function tokenize(value: string): string[] {
  return normalizeText(value)
    .toLowerCase()
    .split(/\s+/)
    .filter((token) => token.length > 2);
}

function toBigrams(tokens: string[]): string[] {
  if (tokens.length < 2) {
    return tokens;
  }
  const bigrams: string[] = [];
  for (let index = 0; index < tokens.length - 1; index += 1) {
    bigrams.push(`${tokens[index]}_${tokens[index + 1]}`);
  }
  return bigrams;
}

function overlapRatio(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) {
    return 0;
  }
  const setA = new Set(a);
  const setB = new Set(b);
  let shared = 0;
  for (const token of setA) {
    if (setB.has(token)) {
      shared += 1;
    }
  }
  const smaller = Math.min(setA.size, setB.size);
  return smaller === 0 ? 0 : shared / smaller;
}

export function titleSimilarity(a: string | null | undefined, b: string | null | undefined): number {
  const left = tokenize(a ?? "");
  const right = tokenize(b ?? "");
  if (left.length === 0 || right.length === 0) {
    return 0;
  }
  const tokenOverlap = overlapRatio(left, right);
  const bigramOverlap = overlapRatio(toBigrams(left), toBigrams(right));
  return Math.round((0.4 * tokenOverlap + 0.6 * bigramOverlap) * 1000) / 1000;
}

export function buildSemanticHash(title: string, text: string | null | undefined): string {
  const tokens = tokenize(`${title} ${text ?? ""}`).slice(0, 128);
  return sha256(tokens.join(" "));
}

// ────────────────────────────────────────────────────────────── Scoring

export type ScoringContext = {
  sourceTrustScore: number;
  sourcePriority: number;
  now?: Date;
  priorityTopics?: string[];
  excludedCategories?: string[];
  categoryWeights?: Record<string, number>;
  coveredTitles?: string[];
};

export type ScoreExplanationEntry = {
  signal: string;
  points: number;
  detail: string;
};

export type ScoreResult = {
  score: number;
  explanation: ScoreExplanationEntry[];
};

function clampScore(value: number): number {
  return Math.max(0, Math.min(1, Math.round(value * 100) / 100));
}

export function scoreSourceItem(item: Pick<SourceItem, "title" | "description" | "publishedAt" | "discoveredAt" | "categories">, context: ScoringContext): ScoreResult {
  const explanation: ScoreExplanationEntry[] = [];
  let total = 0;

  // Freshness: linear decay over 48 hours from discovery.
  const publishedAt = item.publishedAt ?? item.discoveredAt;
  const now = context.now ?? new Date();
  const ageHours = Math.max(0, (now.getTime() - publishedAt.getTime()) / 3_600_000);
  const freshness = clampScore(Math.max(0, 1 - ageHours / 48));
  total += freshness * 0.3;
  explanation.push({
    signal: "freshness",
    points: Math.round(freshness * 0.3 * 100) / 100,
    detail: `age ${Math.round(ageHours)}h`,
  });

  // Source trust.
  total += clampScore(context.sourceTrustScore) * 0.2;
  explanation.push({
    signal: "source_trust",
    points: Math.round(clampScore(context.sourceTrustScore) * 0.2 * 100) / 100,
    detail: `trust ${context.sourceTrustScore}`,
  });

  // Source priority.
  const priorityBoost = clampScore((context.sourcePriority + 5) / 10) * 0.1;
  total += priorityBoost;
  explanation.push({
    signal: "source_priority",
    points: Math.round(priorityBoost * 100) / 100,
    detail: `priority ${context.sourcePriority}`,
  });

  // Category relevance.
  const categories = Array.isArray(item.categories) ? item.categories.map(String) : [];
  const weights = context.categoryWeights ?? {};
  const categoryBoost = categories.reduce((sum, category) => sum + (weights[category] ?? 0.15), 0);
  const cappedCategory = clampScore(categoryBoost) * 0.15;
  total += cappedCategory;
  explanation.push({
    signal: "category_relevance",
    points: Math.round(cappedCategory * 100) / 100,
    detail: categories.length ? categories.join(", ") : "no categories",
  });

  // Priority topic keywords.
  const text = normalizeText(`${item.title} ${item.description ?? ""}`).toLowerCase();
  const priorityTopics = context.priorityTopics ?? [];
  const matchedTopics = priorityTopics.filter((topic) => text.includes(topic.toLowerCase()));
  const topicBoost = matchedTopics.length > 0 ? 0.15 : 0;
  total += topicBoost;
  explanation.push({
    signal: "priority_topics",
    points: topicBoost,
    detail: matchedTopics.length ? matchedTopics.join(", ") : "none matched",
  });

  // Excluded category penalty.
  const excluded = context.excludedCategories ?? [];
  const excludedHit = categories.find((category) => excluded.includes(category));
  if (excludedHit) {
    total -= 0.5;
    explanation.push({
      signal: "excluded_category",
      points: -0.5,
      detail: `excluded ${excludedHit}`,
    });
  }

  // Already covered penalty.
  const coveredTitles = context.coveredTitles ?? [];
  const maxCoverageSimilarity = coveredTitles.reduce(
    (max, title) => Math.max(max, titleSimilarity(item.title, title)),
    0,
  );
  if (maxCoverageSimilarity >= 0.6) {
    total -= 0.45;
    explanation.push({
      signal: "already_covered",
      points: -0.45,
      detail: `similar coverage ${Math.round(maxCoverageSimilarity * 100)}%`,
    });
  }

  // Substantive content bonus.
  const descriptionLength = String(item.description ?? "").length;
  if (descriptionLength >= 200) {
    total += 0.05;
    explanation.push({ signal: "content_depth", points: 0.05, detail: "rich description" });
  }

  return {
    score: clampScore(total),
    explanation,
  };
}

export async function scoreAndPromoteSourceItem(
  tenantId: string,
  item: Pick<SourceItem, "id" | "title" | "description" | "publishedAt" | "discoveredAt" | "categories" | "sourceId" | "clusterId">,
  context: ScoringContext,
): Promise<{ score: number; processingStatus: SourceItemStatus; clusterCreated: boolean }> {
  const scored = scoreSourceItem(item, context);
  await prisma.sourceItem.update({
    where: { id: item.id },
    data: {
      score: scored.score,
      scoreExplanation: scored.explanation as unknown as Prisma.InputJsonValue,
    },
  });
  const assignment = await assignSourceItemToCluster(tenantId, item);
  const processingStatus: SourceItemStatus = scored.score >= 0.4 ? "candidate" : "parsed";
  await prisma.sourceItem.update({
    where: { id: item.id },
    data: { processingStatus },
  });
  return { score: scored.score, processingStatus, clusterCreated: assignment.created };
}

// ────────────────────────────────────────────────────────────── Story clustering
//
// A cluster represents an EVENT, not merely similar titles. Members are the
// normalized source items; aggregates (languages, categories, entities,
// source diversity, confidence, scores, verification state) are recomputed
// from members after every change.

export const CLUSTER_WINDOW_HOURS = 7 * 24;
export const CLUSTER_SIMILARITY_THRESHOLD = 0.55;
const MAX_CLUSTER_CANDIDATES = 200;
const MAX_CLUSTER_MEMBERS_FOR_SCAN = 40;

const ENTITY_STOPWORDS = new Set([
  "the", "a", "an", "de", "la", "el", "los", "las", "del", "y", "e", "o", "u",
  "en", "con", "para", "por", "que", "news", "report", "how", "why", "what",
  "when", "who", "after", "before", "says", "new", "first", "against", "over",
  "this", "that", "with", "from", "for", "and", "per", "via",
]);

/** Generic capitalized-phrase extraction (no domain assumptions). */
export function extractEntityCandidates(titles: string[]): string[] {
  const phraseCounts = new Map<string, number>();
  for (const rawTitle of titles) {
    const tokens = String(rawTitle ?? "").split(/\s+/).filter(Boolean);
    for (let index = 0; index < tokens.length; index += 1) {
      const token = tokens[index].replace(/[^\p{L}\p{N}]/gu, "");
      const isCapitalized = /^\p{Lu}/u.test(token) && !/^\p{Lu}{2,}$/u.test(token);
      if (token.length < 2 || !isCapitalized || ENTITY_STOPWORDS.has(token.toLowerCase())) {
        continue;
      }
      phraseCounts.set(token, (phraseCounts.get(token) ?? 0) + 1);
      // Runs of 2-3 capitalized words → phrase.
      let phrase = token;
      let run = 0;
      for (let next = index + 1; next < tokens.length && run < 2; next += 1) {
        const nextToken = tokens[next].replace(/[^\p{L}\p{N}]/gu, "");
        if (!/^\p{Lu}/u.test(nextToken) || ENTITY_STOPWORDS.has(nextToken.toLowerCase())) {
          break;
        }
        phrase += ` ${nextToken}`;
        run += 1;
      }
      if (run > 0) {
        phraseCounts.set(phrase, (phraseCounts.get(phrase) ?? 0) + 1);
      }
    }
  }
  return Array.from(phraseCounts.entries())
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 10)
    .map(([entity]) => entity);
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, Math.round(value * 100) / 100));
}

type ClusterMember = {
  id: string;
  title: string;
  language: string | null;
  categories: Prisma.JsonValue | null;
  score: number | null;
  discoveredAt: Date;
  sourceId: string;
  source?: { trustScore: number } | null;
};

/** Recompute event aggregates from the cluster's current members. */
export async function refreshClusterAggregates(clusterId: string): Promise<void> {
  const cluster = await prisma.storyCluster.findUnique({
    where: { id: clusterId },
    include: {
      items: {
        orderBy: { discoveredAt: "asc" },
        take: MAX_CLUSTER_MEMBERS_FOR_SCAN,
        include: { source: { select: { trustScore: true, authorityScore: true } } },
      },
    },
  });
  if (!cluster) {
    return;
  }
  const items = cluster.items as ClusterMember[];
  if (items.length === 0) {
    return;
  }

  const sourceIds = new Set(items.map((item) => item.sourceId));
  const languages = Array.from(new Set(items.map((item) => item.language).filter((value): value is string => Boolean(value)))).slice(0, 10);
  const categoryCounts = new Map<string, number>();
  for (const item of items) {
    for (const category of Array.isArray(item.categories) ? item.categories.map(String) : []) {
      categoryCounts.set(category, (categoryCounts.get(category) ?? 0) + 1);
    }
  }
  const categories = Array.from(categoryCounts.entries())
    .sort((left, right) => right[1] - left[1])
    .slice(0, 20)
    .map(([category]) => category);

  // Confidence: strongest headline similarity between any two members.
  let confidence = 0;
  const titles = items.map((item) => item.title);
  for (let left = 0; left < titles.length && left < 30; left += 1) {
    for (let right = left + 1; right < titles.length && right < 30; right += 1) {
      confidence = Math.max(confidence, titleSimilarity(titles[left], titles[right]));
    }
  }
  if (items.length === 1) {
    confidence = 1;
  }

  const ageHours = Math.max(0, (Date.now() - cluster.lastSeenAt.getTime()) / 3_600_000);
  const freshnessScore = clamp01(Math.max(0, 1 - ageHours / 48));
  const authority = items.map((item) => item.source?.trustScore ?? 0.5);
  const authorityScore = authority.length ? clamp01(authority.reduce((sum, value) => sum + value, 0) / authority.length) : 0.5;
  const relevanceScore = clamp01(Math.max(0, ...items.map((item) => item.score ?? 0)));
  const sourceDiversity = sourceIds.size;
  const editorialValue = clamp01(
    0.4 * relevanceScore + 0.3 * authorityScore + 0.2 * freshnessScore + 0.1 * Math.min(1, Math.max(0, (sourceDiversity - 1) / 2)),
  );
  // Phase 3: never downgrade a richer verification state produced by the
  // intelligence pipeline (corroborated/high_confidence/disputed/developing)
  // back to a cruder phase-1 computation.
  const computedVerification = sourceDiversity >= 2 ? "corroborated" : "unverified";
  const currentState = cluster.verificationState;
  const richStates = new Set(["corroborated", "high_confidence", "disputed", "developing"]);
  const verificationState =
    richStates.has(currentState) && computedVerification === "unverified" ? currentState : computedVerification;
  const primarySourceId = items[0].sourceId;

  await prisma.storyCluster.update({
    where: { id: clusterId },
    data: {
      primarySourceId,
      entityCandidates: extractEntityCandidates(titles) as unknown as Prisma.InputJsonValue,
      categories: categories as unknown as Prisma.InputJsonValue,
      languages: languages as unknown as Prisma.InputJsonValue,
      confidence: clamp01(confidence),
      freshnessScore,
      authorityScore,
      relevanceScore,
      editorialValue,
      verificationState,
      sourceCount: sourceDiversity,
      score: cluster.score ?? relevanceScore,
    },
  });
}

export type ClusterAssignment = { cluster: StoryCluster | null; created: boolean };

export async function assignSourceItemToCluster(
  tenantId: string,
  item: Pick<SourceItem, "id" | "title" | "description" | "sourceId" | "clusterId">,
): Promise<ClusterAssignment> {
  // Items pre-linked by cross-publisher dedup: refresh the event and return.
  if (item.clusterId) {
    await refreshClusterAggregates(item.clusterId);
    const existing = await prisma.storyCluster.findUnique({ where: { id: item.clusterId } });
    return { cluster: existing, created: false };
  }

  const existingClusters = await prisma.storyCluster.findMany({
    where: {
      tenantId,
      status: { in: ["open", "selected", "developing", "updated"] },
      lastSeenAt: { gte: new Date(Date.now() - CLUSTER_WINDOW_HOURS * 3_600_000) },
    },
    orderBy: { lastSeenAt: "desc" },
    take: MAX_CLUSTER_CANDIDATES,
    include: {
      items: {
        orderBy: { discoveredAt: "desc" },
        take: MAX_CLUSTER_MEMBERS_FOR_SCAN,
        select: { id: true, title: true },
      },
    },
  });

  let bestCluster: StoryCluster | null = null;
  let bestSimilarity = 0;
  for (const cluster of existingClusters) {
    const similarities = cluster.items.map((member) => titleSimilarity(item.title, member.title));
    const similarity = Math.max(...(similarities.length ? similarities : [0]), titleSimilarity(item.title, cluster.headline));
    if (similarity > bestSimilarity) {
      bestCluster = cluster;
      bestSimilarity = similarity;
    }
  }

  if (!bestCluster || bestSimilarity < CLUSTER_SIMILARITY_THRESHOLD) {
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
        entityCandidates: extractEntityCandidates([item.title]) as unknown as Prisma.InputJsonValue,
        confidence: 1,
        freshnessScore: 1,
        authorityScore: 0.5,
        relevanceScore: 0,
        editorialValue: 0,
        verificationState: "unverified",
        metadata: Prisma.JsonNull,
      },
    });
    await prisma.sourceItem.update({
      where: { id: item.id },
      data: { clusterId: created.id },
    });
    await refreshClusterAggregates(created.id);
    return { cluster: created, created: true };
  }

  await prisma.sourceItem.update({
    where: { id: item.id },
    data: { clusterId: bestCluster.id },
  });
  await refreshClusterAggregates(bestCluster.id);
  return { cluster: bestCluster, created: false };
}

// ────────────────────────────────────────────────────────────── Coverage protection

export type CoverageCheckResult = {
  covered: boolean;
  project: ContentProject | null;
  similarity: number;
};

export async function findDuplicateCoverage(
  tenantId: string,
  siteId: string,
  title: string,
  options: { lookbackHours?: number } = {},
): Promise<CoverageCheckResult> {
  const lookbackHours = options.lookbackHours ?? 72;
  const recentProjects = await prisma.contentProject.findMany({
    where: {
      tenantId,
      siteId,
      deletedAt: null,
      updatedAt: { gte: new Date(Date.now() - lookbackHours * 3_600_000) },
    },
    orderBy: { updatedAt: "desc" },
    take: 50,
  });

  let best: ContentProject | null = null;
  let bestSimilarity = 0;
  for (const project of recentProjects) {
    const similarity = titleSimilarity(title, project.title);
    if (similarity > bestSimilarity) {
      best = project;
      bestSimilarity = similarity;
    }
  }

  return {
    covered: best !== null && bestSimilarity >= 0.6,
    project: best,
    similarity: bestSimilarity,
  };
}

// ────────────────────────────────────────────────────────────── Cluster listing

export async function listStoryClusters(
  tenantId: string,
  input: { page: number; pageSize: number; status?: string },
) {
  const skip = (input.page - 1) * input.pageSize;
  const where: Prisma.StoryClusterWhereInput = {
    tenantId,
    ...(input.status ? { status: input.status as StoryCluster["status"] } : {}),
  };

  const [total, clusters] = await prisma.$transaction([
    prisma.storyCluster.count({ where }),
    prisma.storyCluster.findMany({
      where,
      orderBy: { lastSeenAt: "desc" },
      skip,
      take: input.pageSize,
      include: {
        _count: { select: { items: true, projects: true } },
        items: {
          orderBy: { discoveredAt: "asc" },
          take: 3,
          select: { id: true, title: true, source: { select: { name: true } }, discoveredAt: true },
        },
      },
    }),
  ]);

  return {
    items: clusters.map((cluster) => ({
      id: cluster.id,
      primaryTopic: cluster.primaryTopic,
      headline: cluster.headline,
      summary: cluster.summary,
      firstSeenAt: cluster.firstSeenAt,
      lastSeenAt: cluster.lastSeenAt,
      score: cluster.score,
      status: cluster.status,
      sourceCount: cluster.sourceCount,
      itemCount: cluster._count.items,
      projectCount: cluster._count.projects,
      entityCandidates: cluster.entityCandidates,
      categories: cluster.categories,
      languages: cluster.languages,
      confidence: cluster.confidence,
      freshnessScore: cluster.freshnessScore,
      authorityScore: cluster.authorityScore,
      relevanceScore: cluster.relevanceScore,
      editorialValue: cluster.editorialValue,
      verificationState: cluster.verificationState,
      verificationDetail: cluster.verificationDetail,
      sourceDiversity: cluster.sourceDiversity,
      diversityDetail: cluster.diversityDetail,
      candidateScore: cluster.candidateScore,
      scoreComponents: cluster.scoreComponents,
      siteFitScore: cluster.siteFitScore,
      contentGapScore: cluster.contentGapScore,
      reasonSelected: cluster.reasonSelected,
      enrichedAt: cluster.enrichedAt,
      items: cluster.items,
    })),
    page: input.page,
    pageSize: input.pageSize,
    total,
  };
}

export async function setClusterStatus(
  tenantId: string,
  clusterId: string,
  status: StoryCluster["status"],
) {
  const cluster = await prisma.storyCluster.findFirst({ where: { id: clusterId, tenantId } });
  if (!cluster) {
    return null;
  }
  return prisma.storyCluster.update({ where: { id: cluster.id }, data: { status } });
}
