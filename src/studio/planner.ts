import { Prisma } from "@prisma/client";
import type { AutomationPolicy, FactSourceType, PublicationChannel } from "@prisma/client";
import { getPrismaClient } from "../infrastructure/db/prisma";
import { writeAudit } from "./audit";
import { approveVersion, createProject, ensureProjectTopic } from "./repository";
import { startProjectGeneration } from "./orchestration";
import { createSocialGenerationJobs } from "./social";
import { createPublication } from "./publication";
import { findDuplicateCoverage } from "./editorial";
import {
  countChannelPublicationsToday,
  generateEditorialSlots,
  getOrCreatePolicy,
  isDayActive,
  startOfLocalDay,
} from "./automation";
import { countQaWarnings, countWordsFromHtml, isHeroImageReady } from "./review";

const prisma = getPrismaClient();

// ────────────────────────────────────────────────────────────── Facts from source items

function sourceTypeToFactSourceType(type: string): FactSourceType {
  switch (type) {
    case "rss":
    case "atom":
      return "rss";
    case "api":
      return "api";
    case "html":
    case "sitemap":
      return "html";
    default:
      return "manual";
  }
}

async function createFactsFromSourceItem(
  tenantId: string,
  topicId: string,
  item: { id: string; title: string; cleanedText: string | null; description: string | null; canonicalUrl: string | null },
  sourceType: string,
  metadata: Record<string, unknown>,
) {
  const content = (item.cleanedText ?? item.description ?? "").trim();
  if (!content) {
    return 0;
  }

  const chunkSize = 3500;
  const chunks: string[] = [];
  for (let offset = 0; offset < content.length && offset < chunkSize * 3; offset += chunkSize) {
    const chunk = content.slice(offset, offset + chunkSize).trim();
    if (chunk) {
      chunks.push(chunk);
    }
  }
  if (chunks.length === 0) {
    return 0;
  }

  const hashes = chunks.map((chunk) => `${topicId}:${Buffer.from(chunk).toString("base64").slice(0, 100)}`);
  const existing = await prisma.fact.findMany({
    where: { tenantId, topicId, contentHash: { in: hashes } },
    select: { contentHash: true },
  });
  const existingHashes = new Set(existing.map((fact) => fact.contentHash));

  let created = 0;
  for (let index = 0; index < chunks.length; index += 1) {
    const chunk = chunks[index];
    const contentHash = hashes[index];
    if (existingHashes.has(contentHash)) {
      continue;
    }
    await prisma.fact.create({
      data: {
        tenantId,
        topicId,
        sourceType: sourceTypeToFactSourceType(sourceType),
        sourceRef: item.canonicalUrl ?? undefined,
        content: chunk,
        contentHash,
        metadata: metadata as Prisma.InputJsonObject,
      },
    });
    created += 1;
  }
  return created;
}

// ────────────────────────────────────────────────────────────── Manual inbox → article

export type CreateProjectFromSourceItemInput = {
  tenantId: string;
  siteId: string;
  sourceItemId: string;
  goal?: "news_article" | "article";
  title?: string;
  allowUpdateExisting?: boolean;
  userId?: string | null;
};

export type CreateProjectFromSourceItemResult = {
  kind: "created" | "update";
  projectId: string;
  versionId: string | null;
  coveredByProjectId?: string;
};

export async function createProjectFromSourceItem(
  input: CreateProjectFromSourceItemInput,
): Promise<CreateProjectFromSourceItemResult> {
  const { tenantId } = input;
  const item = await prisma.sourceItem.findFirst({
    where: { id: input.sourceItemId, tenantId },
    include: { source: true },
  });
  if (!item) {
    throw new Error("source_item_not_found");
  }

  const site = await prisma.site.findFirst({ where: { id: input.siteId, tenantId } });
  if (!site) {
    throw new Error("site_not_found");
  }

  const coverage = await findDuplicateCoverage(tenantId, input.siteId, input.title ?? item.title);
  if (coverage.covered && coverage.project) {
    if (!input.allowUpdateExisting) {
      throw new Error(`already_covered:${coverage.project.id}`);
    }

    const topicId = await ensureProjectTopic(tenantId, coverage.project.id, coverage.project.title, coverage.project.brief);
    await createFactsFromSourceItem(tenantId, topicId, item, item.source.type, {
      project_id: coverage.project.id,
      source_item_id: item.id,
    });
    const result = await startProjectGeneration(coverage.project.id, tenantId);
    await prisma.sourceItem.update({ where: { id: item.id }, data: { processingStatus: "processed" } });
    await prisma.contentProject.update({
      where: { id: coverage.project.id },
      data: {
        sourceItemId: item.id,
        ...(item.clusterId ? { clusterId: item.clusterId } : {}),
      },
    });
    await markClusterSelected(tenantId, item.clusterId);

    await writeAudit({
      tenantId,
      action: "project.updated_from_source",
      entityType: "content_project",
      entityId: coverage.project.id,
      actorType: input.userId ? "user" : "system",
      actorUserId: input.userId,
      metadata: { sourceItemId: item.id },
    });

    return {
      kind: "update",
      projectId: coverage.project.id,
      versionId: result.versionId,
      coveredByProjectId: coverage.project.id,
    };
  }

  const text = (item.cleanedText ?? item.description ?? "").trim();
  const brief = `${input.title ?? item.title}\n\n${text.slice(0, 3500)}`;

  const project = await createProject(tenantId, {
    siteId: site.id,
    title: (input.title ?? item.title).slice(0, 200),
    brief,
    goal: input.goal ?? "news_article",
    primaryLanguage: item.language === "en" ? "en" : "es",
    metadata: {
      source_item_id: item.id,
      cluster_id: item.clusterId,
      source_url: item.canonicalUrl,
      source_name: item.source.name,
      provenance: {
        sourceItemId: item.id,
        sourceUrl: item.canonicalUrl,
        sourceTitle: item.title,
        ingestedAt: new Date().toISOString(),
      },
    } as Prisma.InputJsonObject,
  });

  await prisma.contentProject.update({
    where: { id: project.id },
    data: {
      sourceItemId: item.id,
      clusterId: item.clusterId,
      origin: "manual",
    },
  });

  const topicId = await ensureProjectTopic(tenantId, project.id, project.title, project.brief);
  await createFactsFromSourceItem(tenantId, topicId, item, item.source.type, {
    project_id: project.id,
    source_item_id: item.id,
  });

  const result = await startProjectGeneration(project.id, tenantId);

  await prisma.sourceItem.update({ where: { id: item.id }, data: { processingStatus: "selected" } });
  await markClusterSelected(tenantId, item.clusterId);

  await writeAudit({
    tenantId,
    action: "project.created_from_source",
    entityType: "content_project",
    entityId: project.id,
    actorType: input.userId ? "user" : "system",
    actorUserId: input.userId,
    metadata: { sourceItemId: item.id, sourceUrl: item.canonicalUrl },
  });

  return { kind: "created", projectId: project.id, versionId: result.versionId };
}

async function markClusterSelected(tenantId: string, clusterId: string | null) {
  if (!clusterId) {
    return;
  }
  await prisma.storyCluster.updateMany({
    where: { id: clusterId, tenantId, status: "open" },
    data: { status: "selected" },
  });
}

// ────────────────────────────────────────────────────────────── Automatic planning

async function selectCandidates(
  policy: AutomationPolicy,
  tenantId: string,
  limit: number,
): Promise<string[]> {
  if (limit <= 0 || !policy.autoGenerate) {
    return [];
  }

  const where: Prisma.SourceItemWhereInput = {
    tenantId,
    processingStatus: "candidate",
    score: { gte: policy.minimumStoryScore },
    discoveredAt: { gte: new Date(Date.now() - 72 * 3_600_000) },
    ...(policy.siteId ? { source: { siteId: policy.siteId } } : {}),
    projects: { none: {} },
  };

  const candidates = await prisma.sourceItem.findMany({
    where,
    orderBy: [{ score: "desc" }, { discoveredAt: "asc" }],
    take: limit * 3,
  });

  const excludedCategories = Array.isArray(policy.excludedCategories)
    ? policy.excludedCategories.map(String).filter(Boolean)
    : [];
  const allowedCategories = Array.isArray(policy.categories)
    ? policy.categories.map(String).filter(Boolean)
    : [];

  const selected: string[] = [];
  for (const candidate of candidates) {
    if (selected.length >= limit) {
      break;
    }
    if (!policy.siteId) {
      continue;
    }
    const categories = Array.isArray(candidate.categories) ? candidate.categories.map(String) : [];
    if (excludedCategories.some((category) => categories.includes(category))) {
      continue;
    }
    if (allowedCategories.length > 0 && !categories.some((category) => allowedCategories.includes(category))) {
      continue;
    }
    const coverage = await findDuplicateCoverage(tenantId, policy.siteId, candidate.title, { lookbackHours: 72 });
    if (coverage.covered) {
      continue;
    }
    selected.push(candidate.id);
  }

  return selected;
}

async function createAutoProject(policy: AutomationPolicy, tenantId: string, sourceItemId: string): Promise<void> {
  if (!policy.siteId) {
    return;
  }
  await createProjectFromSourceItem({
    tenantId,
    siteId: policy.siteId,
    sourceItemId,
    goal: "news_article",
    allowUpdateExisting: false,
  });

  const project = await prisma.contentProject.findFirst({
    where: { tenantId, sourceItemId, deletedAt: null },
    orderBy: { createdAt: "desc" },
  });
  if (project) {
    await prisma.contentProject.update({
      where: { id: project.id },
      data: { origin: "auto" },
    });
  }
}

type ProgressResult = {
  projectsAdvanced: number;
  socialJobsCreated: number;
  publicationsCreated: number;
  approvals: number;
};

type AutomaticApprovalCandidate = {
  status: string;
  bodyHtml: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  qaReport: unknown;
  contentImage: {
    status: string | null;
    storagePath: string | null;
    assetVariants: Array<{ kind: string }>;
  } | null;
};

/**
 * A scheduled auto-publication must meet a stricter threshold than a merely
 * QA-passed draft. This keeps the legacy automation path aligned with the
 * editorial-engine gates and avoids publishing thin, unillustrated or
 * warning-bearing content when the human approval step is enabled remotely.
 */
export function isAutomaticApprovalQualityReady(
  version: AutomaticApprovalCandidate,
  minimumQaScore = 90,
): boolean {
  if (version.status !== "qa_passed") return false;
  if (!isHeroImageReady(version.contentImage)) return false;
  if (countWordsFromHtml(version.bodyHtml) < 500) return false;
  if (!version.seoTitle?.trim() || !version.seoDescription?.trim()) return false;
  if (countQaWarnings(version.qaReport) > 0) return false;

  const qa = version.qaReport && typeof version.qaReport === "object"
    ? version.qaReport as { passed?: unknown; score?: unknown }
    : null;
  return qa?.passed === true && typeof qa.score === "number" && qa.score >= minimumQaScore;
}

async function progressAutoProjects(policy: AutomationPolicy, tenantId: string): Promise<ProgressResult> {
  const progress: ProgressResult = {
    projectsAdvanced: 0,
    socialJobsCreated: 0,
    publicationsCreated: 0,
    approvals: 0,
  };

  const projects = await prisma.contentProject.findMany({
    where: {
      tenantId,
      origin: "auto",
      deletedAt: null,
      updatedAt: { gte: new Date(Date.now() - 3 * 24 * 3_600_000) },
      ...(policy.siteId ? { siteId: policy.siteId } : {}),
    },
    include: {
      versions: {
        orderBy: { versionNumber: "desc" },
        take: 1,
        include: { contentImage: { include: { assetVariants: true } } },
      },
      socialContents: true,
      publications: { where: { status: { not: "deleted" } } },
      site: true,
    },
    take: 30,
  });

  for (const project of projects) {
    const latestVersion = project.versions[0] ?? null;

    if (!latestVersion) {
      if (policy.autoGenerate) {
        await startProjectGeneration(project.id, tenantId);
        progress.projectsAdvanced += 1;
      }
      continue;
    }

    // Auto approval requires stricter quality than an ordinary QA-passed
    // version. Failures remain in QA/review and are never scheduled.
    if (policy.autoApprove && isAutomaticApprovalQualityReady(latestVersion)) {
      await approveVersion(tenantId, project.id, latestVersion.id, "automation", null);
      progress.approvals += 1;
      continue;
    }

    const socialReady = !policy.socialRequired || project.socialContents.length > 0;
    const socialChannelsWanted =
      (policy.xPostsPerDay > 0 ? ["x"] : []).concat(policy.instagramPostsPerDay > 0 ? ["instagram"] : []);

    if (!socialReady && socialChannelsWanted.length > 0 && latestVersion.bodyHtml) {
      await createSocialGenerationJobs(tenantId, {
        projectId: project.id,
        versionId: latestVersion.id,
        channels: socialChannelsWanted as Array<"x" | "instagram">,
      });
      progress.socialJobsCreated += 1;
      continue;
    }

    if (policy.autoSchedule && (socialReady || !policy.socialRequired)) {
      const publishedVersionStatuses = ["approved", "published"];
      const versionEligible =
        policy.autoApprove
          ? publishedVersionStatuses.includes(latestVersion.status)
          : ["approved", "in_review", "qa_passed"].includes(latestVersion.status);

      if (versionEligible) {
        const created = await ensureAutoPublications(policy, tenantId, project.id, latestVersion.id);
        progress.publicationsCreated += created;
      }
    }
  }

  return progress;
}

async function ensureAutoPublications(
  policy: AutomationPolicy,
  tenantId: string,
  projectId: string,
  versionId: string,
): Promise<number> {
  const existing = await prisma.publication.findMany({
    where: { tenantId, projectId, versionId, status: { not: "deleted" } },
  });
  const existingChannels = new Set(existing.map((publication) => publication.channel));
  let created = 0;

  const occupied: Date[] = [];
  const dayStart = startOfLocalDay(policy);

  if (!existingChannels.has("website") && policy.siteId) {
    const slot = await nextFreeSlot(policy, "website", tenantId, occupied, dayStart);
    if (slot) {
      occupied.push(slot);
      await createPublication({
        tenantId,
        projectId,
        versionId,
        channel: "website",
        siteId: policy.siteId,
        scheduledFor: slot,
      });
      created += 1;
    }
  }

  if (!existingChannels.has("x") && policy.xPostsPerDay > 0) {
    const account = await pickAccount(tenantId, "x", policy.siteId);
    if (account) {
      const slot = await nextFreeSlot(policy, "x", tenantId, occupied, dayStart);
      if (slot) {
        occupied.push(slot);
        await createPublication({
          tenantId,
          projectId,
          versionId,
          channel: "x",
          accountId: account.id,
          siteId: policy.siteId,
          scheduledFor: slot,
        });
        created += 1;
      }
    }
  }

  if (!existingChannels.has("instagram") && policy.instagramPostsPerDay > 0) {
    const account = await pickAccount(tenantId, "instagram", policy.siteId);
    if (account) {
      const slot = await nextFreeSlot(policy, "instagram", tenantId, occupied, dayStart);
      if (slot) {
        occupied.push(slot);
        await createPublication({
          tenantId,
          projectId,
          versionId,
          channel: "instagram",
          accountId: account.id,
          siteId: policy.siteId,
          scheduledFor: slot,
        });
        created += 1;
      }
    }
  }

  return created;
}

async function pickAccount(tenantId: string, platform: "x" | "instagram", siteId: string | null) {
  const account = await prisma.publishingAccount.findFirst({
    where: {
      tenantId,
      platform,
      enabled: true,
      status: { in: ["active", "pending"] },
      ...(siteId ? { siteId } : {}),
    },
  });
  return account;
}

async function nextFreeSlot(
  policy: AutomationPolicy,
  channel: PublicationChannel,
  tenantId: string,
  alreadyOccupied: Date[],
  dayStart: Date,
): Promise<Date | null> {
  const now = new Date();
  const minimumSpacingMs = Math.max(15, policy.minimumMinutesBetweenArticles) * 60_000;

  for (let dayOffset = 0; dayOffset < 3; dayOffset += 1) {
    const day = new Date(dayStart.getTime() + dayOffset * 24 * 3_600_000);
    if (!isDayActive(policy, day)) {
      continue;
    }
    const slots = generateEditorialSlots(policy, day).filter((slot) => slot.channel === channel);
    for (const slot of slots) {
      if (slot.at.getTime() <= now.getTime() + 60_000) {
        continue;
      }
      const conflicts = await prisma.publication.findFirst({
        where: {
          tenantId,
          channel,
          status: { in: ["scheduled", "queued", "publishing"] },
          scheduledFor: {
            gte: new Date(slot.at.getTime() - minimumSpacingMs),
            lte: new Date(slot.at.getTime() + minimumSpacingMs),
          },
        },
      });
      if (conflicts) {
        continue;
      }
      const conflictsWithBatch = alreadyOccupied.some(
        (at) => Math.abs(at.getTime() - slot.at.getTime()) < minimumSpacingMs,
      );
      if (conflictsWithBatch) {
        continue;
      }
      return slot.at;
    }
  }

  // Fallback: keep planning running even when windows are exhausted.
  return new Date(now.getTime() + 10 * 60_000);
}

export type AutomationTickResult = {
  policiesProcessed: number;
  candidatesSelected: number;
  projectsAdvanced: number;
  socialJobsCreated: number;
  publicationsCreated: number;
  approvals: number;
  skippedPaused: number;
};

export async function runAutomationTick(): Promise<AutomationTickResult> {
  const result: AutomationTickResult = {
    policiesProcessed: 0,
    candidatesSelected: 0,
    projectsAdvanced: 0,
    socialJobsCreated: 0,
    publicationsCreated: 0,
    approvals: 0,
    skippedPaused: 0,
  };

  const policies = await prisma.automationPolicy.findMany({
    where: { enabled: true },
  });

  for (const policy of policies) {
    if (policy.state !== "active") {
      result.skippedPaused += 1;
      continue;
    }

    result.policiesProcessed += 1;
    const tenantId = policy.tenantId;

    // Safety limits.
    const dayStart = startOfLocalDay(policy);
    const websitePlanned = await countChannelPublicationsToday(tenantId, "website", dayStart);
    const pendingQueue = await prisma.publication.count({
      where: { tenantId, status: { in: ["draft", "ready", "scheduled"] } },
    });

    if (policy.autoGenerate && websitePlanned < policy.articlesPerDay && pendingQueue < policy.maximumQueueSize) {
      const needed = Math.min(
        policy.articlesPerDay - websitePlanned,
        policy.maxArticlesPerDay - websitePlanned,
      );
      const candidateIds = await selectCandidates(policy, tenantId, Math.max(0, needed));
      for (const candidateId of candidateIds) {
        await createAutoProject(policy, tenantId, candidateId);
        result.candidatesSelected += 1;
      }
    }

    const progress = await progressAutoProjects(policy, tenantId);
    result.projectsAdvanced += progress.projectsAdvanced;
    result.socialJobsCreated += progress.socialJobsCreated;
    result.publicationsCreated += progress.publicationsCreated;
    result.approvals += progress.approvals;
  }

  return result;
}
