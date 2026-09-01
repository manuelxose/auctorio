// Cluster merge/split actions (Phase 3) — extracted from routes so the
// behavior is testable and reusable (inbox actions, workers).

import { Prisma } from "@prisma/client";
import { getPrismaClient } from "../../infrastructure/db/prisma";
import { refreshClusterAggregates } from "../editorial";
import { loadClusterDiversityInputs } from "./pipeline";
import { computeSourceDiversity } from "./source-diversity";
import { summarizeClusterFacts, refreshClusterVerification } from "./verification";

const prisma = getPrismaClient();

/** Refresh diversity + verification after any membership change. */
export async function refreshClusterIntelligence(tenantId: string, clusterId: string): Promise<void> {
  const members = await loadClusterDiversityInputs(tenantId, clusterId);
  const diversity = computeSourceDiversity(members);
  const factSummary = await summarizeClusterFacts(tenantId, clusterId);
  await refreshClusterVerification(tenantId, clusterId, {
    independentPublishers: diversity.independentPublishers,
    factCount: factSummary.factCount,
    conflictingFacts: factSummary.conflictingFacts,
    corroboratedFacts: factSummary.corroboratedFacts,
    developing: false,
  });
  await prisma.storyCluster.update({
    where: { id: clusterId },
    data: {
      sourceDiversity: diversity.independentPublishers,
      diversityDetail: diversity.detail as Prisma.InputJsonValue,
    },
  });
}

export type MergeClustersResult = { merged: boolean; movedItems: number; targetClusterId: string };

/** Merge a cluster into another: move items + facts, supersede the source. */
export async function mergeStoryClusters(
  tenantId: string,
  clusterId: string,
  targetClusterId: string,
): Promise<MergeClustersResult | null> {
  if (clusterId === targetClusterId) {
    throw new Error("cannot merge a cluster into itself");
  }
  const [sourceCluster, targetCluster] = await Promise.all([
    prisma.storyCluster.findFirst({ where: { id: clusterId, tenantId } }),
    prisma.storyCluster.findFirst({ where: { id: targetClusterId, tenantId } }),
  ]);
  if (!sourceCluster || !targetCluster) {
    return null;
  }

  const movedItems = await prisma.sourceItem.updateMany({
    where: { tenantId, clusterId: sourceCluster.id },
    data: { clusterId: targetCluster.id },
  });
  await prisma.storyFact.updateMany({
    where: { tenantId, clusterId: sourceCluster.id },
    data: { clusterId: targetCluster.id },
  });
  await prisma.storyCluster.update({
    where: { id: sourceCluster.id },
    data: { status: "superseded" },
  });
  await prisma.storyCluster.update({
    where: { id: targetCluster.id },
    data: { lastSeenAt: new Date(), sourceCount: { increment: movedItems.count } },
  });
  await refreshClusterAggregates(targetCluster.id);
  await refreshClusterAggregates(sourceCluster.id);
  await refreshClusterIntelligence(tenantId, targetCluster.id);
  return { merged: true, movedItems: movedItems.count, targetClusterId: targetCluster.id };
}

export type SplitClustersResult = { split: boolean; newClusterId: string; movedItems: number };

/** Split selected items out of a cluster into a new one. */
export async function splitStoryCluster(
  tenantId: string,
  clusterId: string,
  itemIds: string[],
): Promise<SplitClustersResult | null> {
  const sourceCluster = await prisma.storyCluster.findFirst({ where: { id: clusterId, tenantId } });
  if (!sourceCluster) {
    return null;
  }
  const itemsToSplit = await prisma.sourceItem.findMany({
    where: { tenantId, clusterId, id: { in: itemIds } },
    orderBy: { discoveredAt: "asc" },
    select: { id: true, title: true, description: true, discoveredAt: true },
  });
  if (itemsToSplit.length === 0) {
    return null;
  }
  const first = itemsToSplit[0];
  const newCluster = await prisma.storyCluster.create({
    data: {
      tenantId,
      headline: first.title.slice(0, 300),
      summary: String(first.description ?? "").slice(0, 500) || null,
      primarySourceId: sourceCluster.primarySourceId,
      firstSeenAt: first.discoveredAt ?? sourceCluster.firstSeenAt,
      lastSeenAt: new Date(),
      sourceCount: itemsToSplit.length,
      status: "open",
      confidence: 1,
      freshnessScore: 1,
      authorityScore: 0.5,
      relevanceScore: 0,
      editorialValue: 0,
      verificationState: "unverified",
      metadata: { split_from: sourceCluster.id } as Prisma.InputJsonValue,
    },
    select: { id: true },
  });
  await prisma.sourceItem.updateMany({
    where: { tenantId, id: { in: itemsToSplit.map((item) => item.id) } },
    data: { clusterId: newCluster.id },
  });
  await prisma.storyFact.updateMany({
    where: { tenantId, clusterId, itemId: { in: itemsToSplit.map((item) => item.id) } },
    data: { clusterId: newCluster.id },
  });
  await refreshClusterAggregates(clusterId);
  await refreshClusterAggregates(newCluster.id);
  await refreshClusterIntelligence(tenantId, clusterId);
  await refreshClusterIntelligence(tenantId, newCluster.id);
  return { split: true, newClusterId: newCluster.id, movedItems: itemsToSplit.length };
}
