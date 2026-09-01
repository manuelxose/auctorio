// Duplicate / cannibalization check (Phase 4).
//
// Before generating a new article the engine decides between CREATE NEW,
// UPDATE EXISTING and SKIP, comparing against content the platform already
// manages (ContentProject) and content the site already has indexed. The
// decision and its reason are stored on the generation record.

import { getPrismaClient } from "../../infrastructure/db/prisma";
import { titleSimilarity } from "../editorial";
import type { DuplicateDecision } from "./types";

const prisma = getPrismaClient();

export type DuplicateCheckInput = {
  tenantId: string;
  siteId: string;
  clusterId: string;
  headline: string;
  summary: string | null;
  /** Primary entity names of the cluster (movie/tv work names preferred). */
  entityNames: string[];
  /** Lookback window in hours for existing projects (default 14 days). */
  lookbackHours?: number;
};

export type DuplicateCheckResult = {
  decision: DuplicateDecision;
  reason: string;
  targetProjectId: string | null;
  targetVersionId: string | null;
  similarity: number;
  evidence: Array<{ kind: string; title: string; similarity: number }>;
};

const UPDATE_SIMILARITY = 0.6;
const SKIP_SIMILARITY = 0.72;
const CANNIBAL_ENTITY_SIMILARITY = 0.42;

function sharesPrimaryEntity(title: string, entityNames: string[]): boolean {
  const lowered = title.toLowerCase();
  return entityNames.some((name) => name.length >= 4 && lowered.includes(name.toLowerCase()));
}

export async function decideCreateUpdateOrSkip(input: DuplicateCheckInput): Promise<DuplicateCheckResult> {
  const lookbackHours = input.lookbackHours ?? 24 * 14;
  const evidence: DuplicateCheckResult["evidence"] = [];

  // 1) Same cluster already has a managed project → update it.
  const clusterProject = await prisma.contentProject.findFirst({
    where: { tenantId: input.tenantId, siteId: input.siteId, clusterId: input.clusterId, deletedAt: null },
    orderBy: { updatedAt: "desc" },
    include: { versions: { orderBy: { versionNumber: "desc" }, take: 1 } },
  });
  if (clusterProject) {
    return {
      decision: "update_existing",
      reason: `the story cluster already has a managed article (${clusterProject.title.slice(0, 80)})`,
      targetProjectId: clusterProject.id,
      targetVersionId: clusterProject.versions[0]?.id ?? null,
      similarity: 1,
      evidence: [{ kind: "cluster_project", title: clusterProject.title, similarity: 1 }],
    };
  }

  // 2) Managed projects with the same event → update.
  const projects = await prisma.contentProject.findMany({
    where: {
      tenantId: input.tenantId,
      siteId: input.siteId,
      deletedAt: null,
      updatedAt: { gte: new Date(Date.now() - lookbackHours * 3_600_000) },
    },
    orderBy: { updatedAt: "desc" },
    take: 60,
    include: { versions: { orderBy: { versionNumber: "desc" }, take: 1 } },
  });

  let bestProject: (typeof projects)[number] | null = null;
  let bestSimilarity = 0;
  for (const project of projects) {
    const similarity = Math.max(
      titleSimilarity(input.headline, project.title),
      titleSimilarity(input.summary ?? "", project.title),
    );
    evidence.push({ kind: "project", title: project.title, similarity });
    if (similarity > bestSimilarity) {
      bestSimilarity = similarity;
      bestProject = project;
    }
  }

  if (bestProject && bestSimilarity >= UPDATE_SIMILARITY) {
    const entityHit = sharesPrimaryEntity(bestProject.title, input.entityNames);
    if (entityHit || bestSimilarity >= 0.72) {
      return {
        decision: "update_existing",
        reason: `managed article «${bestProject.title.slice(0, 80)}» covers the same event (similarity ${Math.round(bestSimilarity * 100)}%)${entityHit ? " and shares the primary entity" : ""}`,
        targetProjectId: bestProject.id,
        targetVersionId: bestProject.versions[0]?.id ?? null,
        similarity: bestSimilarity,
        evidence,
      };
    }
  }

  // 3) The site already has the same story indexed (not managed) → skip.
  const indexedPages = await prisma.siteIndexedPage.findMany({
    where: { tenantId: input.tenantId, siteId: input.siteId, crawlState: { in: ["extracted", "stale"] } },
    select: { title: true, url: true },
    take: 400,
  });
  let bestPage: { title: string | null; url: string } | null = null;
  let bestPageSimilarity = 0;
  for (const page of indexedPages) {
    const similarity = Math.max(
      titleSimilarity(input.headline, page.title),
      titleSimilarity(input.summary ?? "", page.title),
    );
    if (similarity > bestPageSimilarity) {
      bestPageSimilarity = similarity;
      bestPage = page;
    }
  }
  if (bestPage && bestPageSimilarity >= SKIP_SIMILARITY && bestPage.title) {
    return {
      decision: "skip",
      reason: `the site already covers this event at ${bestPage.url} («${bestPage.title.slice(0, 80)}», similarity ${Math.round(bestPageSimilarity * 100)}%)`,
      targetProjectId: null,
      targetVersionId: null,
      similarity: bestPageSimilarity,
      evidence: [...evidence, { kind: "indexed_page", title: bestPage.title, similarity: bestPageSimilarity }],
    };
  }

  // 4) Same primary entity + same intent with moderate title overlap →
  //    cannibalization risk → skip (unless event clearly differs).
  if (bestProject && bestSimilarity >= CANNIBAL_ENTITY_SIMILARITY && sharesPrimaryEntity(bestProject.title, input.entityNames)) {
    return {
      decision: "skip",
      reason: `managed article «${bestProject.title.slice(0, 80)}» targets the same entity with a similar angle — cannibalization risk (similarity ${Math.round(bestSimilarity * 100)}%)`,
      targetProjectId: null,
      targetVersionId: null,
      similarity: bestSimilarity,
      evidence,
    };
  }

  return {
    decision: "create_new",
    reason: "no managed article or indexed page covers this event; safe to create a new article",
    targetProjectId: null,
    targetVersionId: null,
    similarity: bestSimilarity,
    evidence,
  };
}
