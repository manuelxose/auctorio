import { Prisma } from "@prisma/client";
import type { ContentProject, SourceItem, StoryCluster } from "@prisma/client";
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

// ────────────────────────────────────────────────────────────── Story clustering

export async function assignSourceItemToCluster(
  tenantId: string,
  item: Pick<SourceItem, "id" | "title" | "description" | "sourceId">,
): Promise<StoryCluster | null> {
  const existingClusters = await prisma.storyCluster.findMany({
    where: {
      tenantId,
      status: { in: ["open", "selected"] },
      lastSeenAt: { gte: new Date(Date.now() - 48 * 3_600_000) },
    },
    include: { items: { select: { id: true, title: true } } },
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

  const threshold = 0.55;
  if (!bestCluster || bestSimilarity < threshold) {
    const created = await prisma.storyCluster.create({
      data: {
        tenantId,
        headline: item.title.slice(0, 300),
        summary: String(item.description ?? "").slice(0, 500) || null,
        firstSeenAt: new Date(),
        lastSeenAt: new Date(),
        sourceCount: 1,
        status: "open",
        metadata: Prisma.JsonNull,
      },
    });
    await prisma.sourceItem.update({
      where: { id: item.id },
      data: { clusterId: created.id },
    });
    return created;
  }

  const updated = await prisma.storyCluster.update({
    where: { id: bestCluster.id },
    data: {
      lastSeenAt: new Date(),
      sourceCount: { increment: 1 },
    },
  });
  await prisma.sourceItem.update({
    where: { id: item.id },
    data: { clusterId: updated.id },
  });
  return updated;
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
