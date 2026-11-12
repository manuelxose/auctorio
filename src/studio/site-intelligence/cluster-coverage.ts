import { getPrismaClient } from "../../infrastructure/db/prisma";
import { getStrategyLayers } from "./strategy";

const prisma = getPrismaClient();

/**
 * "Investigate gap" for one topic cluster: the cluster's indexed pages and, for each subtopic of
 * its pillar (approved > suggested > detected keywords), how many indexed pages already cover it.
 */
export async function getClusterCoverage(tenantId: string, siteId: string, slug: string) {
  const cluster = await prisma.siteTopicCluster.findFirst({ where: { tenantId, siteId, slug } });
  if (!cluster) throw new Error("cluster_not_found");
  const layers = await getStrategyLayers(tenantId, siteId);
  const approvedPillar = layers.approved?.config.pillars.find((pillar) => pillar.clusterSlug === slug);
  const suggestedPillar = layers.suggested?.config.pillars.find((pillar) => pillar.clusterSlug === slug);
  const pillar = approvedPillar ?? suggestedPillar ?? null;
  const keywords = Array.isArray(cluster.keywords) ? cluster.keywords.filter((entry): entry is string => typeof entry === "string") : [];
  const subtopics = (pillar?.subtopics.length ? pillar.subtopics : keywords).slice(0, 20);

  const pages = await prisma.siteIndexedPage.findMany({
    where: { tenantId, siteId, contentType: cluster.name },
    orderBy: { modifiedAt: "desc" },
    take: 20,
    select: { url: true, title: true, crawlState: true, modifiedAt: true },
  });
  const coverage = await Promise.all(
    subtopics.map(async (subtopic) => {
      const where = { tenantId, siteId, title: { contains: subtopic, mode: "insensitive" as const } };
      const [count, sample] = await Promise.all([
        prisma.siteIndexedPage.count({ where }),
        prisma.siteIndexedPage.findMany({ where, take: 3, select: { url: true, title: true } }),
      ]);
      return { subtopic, pagesCovering: count, sample };
    }),
  );
  const pillarName = pillar?.name ?? cluster.name;
  return {
    cluster: { name: cluster.name, slug: cluster.slug, pagesCount: cluster.pagesCount, keywords },
    pillar: pillar ? { name: pillar.name, included: pillar.included, provenance: approvedPillar ? "approved" : "suggested" } : null,
    subtopicSource: pillar?.subtopics.length ? (approvedPillar ? "approved" : "suggested") : "detected",
    pages,
    coverage,
    gaps: coverage.filter((entry) => entry.pagesCovering === 0).map((entry) => entry.subtopic),
    proposalsUrl: `/studio/editorial-plan?siteId=${encodeURIComponent(siteId)}&pillar=${encodeURIComponent(pillarName)}`,
  };
}
