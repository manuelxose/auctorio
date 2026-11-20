import { Prisma } from "@prisma/client";
import type { AutomationPolicy, FactSourceType } from "@prisma/client";
import { getPrismaClient } from "../infrastructure/db/prisma";
import { structuredEvent } from "../shared/utils/logger";
import { writeAudit } from "./audit";
import { approveVersion, createProject, ensureProjectTopic } from "./repository";
import { createPublication } from "./publication";
import { findDuplicateCoverage } from "./editorial";
import {
  countChannelPublicationsToday,
  generateEditorialSlots,
  getOrCreatePolicy,
  nextPolicyDay,
  startOfLocalDay,
} from "./automation";
import { countQaWarnings, countWordsFromHtml, isHeroImageReady } from "./review";
import { runQualityRepairCycle } from "./quality-repair";
import { evaluateAutonomousGate, readGateConfig } from "./quality-gate";
import type { QaReportV2 } from "./qa";
import { PLAN_LEAD_TIME_MINUTES, type AutomationMode } from "./automation-mode";
import { bulkApproveEditorialPlanItems } from "./editorial-plan";
import { startProductionForPlanItem, startProductionForProject } from "./production/pipeline";

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
  productionJobId: string;
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
    const update = `${coverage.project.brief}

Nueva fuente: ${item.title}
${(item.cleanedText ?? item.description ?? "").trim().slice(0, 3500)}`;
    const job = await startProductionForProject(tenantId, coverage.project.id, { brief: update, userId: input.userId ?? null });
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
      productionJobId: job.id,
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

  const job = await startProductionForProject(tenantId, project.id, { userId: input.userId ?? null });

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

  return { kind: "created", projectId: project.id, productionJobId: job.id };
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
  if (limit <= 0 || !policy.autoGenerate || !policy.siteId) {
    return [];
  }

  const where: Prisma.SourceItemWhereInput = {
    tenantId,
    processingStatus: "candidate",
    score: { gte: policy.minimumStoryScore },
    discoveredAt: { gte: new Date(Date.now() - 72 * 3_600_000) },
    source: { siteId: policy.siteId, enabled: true, archivedAt: null },
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
      data: {
        origin: "auto",
        automationMode: policy.mode,
        automationSubstate: "generating",
      },
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
      publications: { where: { status: { not: "deleted" } } },
      site: true,
      topic: true,
    },
    take: 30,
  });

  for (const project of projects) {
    // One failing project (a vanished row, a provider error) must not abort the tick for every other tenant.
    try {
      const latestVersion = project.versions[0] ?? null;
      const mode = policy.mode as AutomationMode;

      // ── AUTOPILOT: strict gate, self-healing repair, automatic approval. ──
      if (mode === "autopilot") {
        const advanced = await advanceAutopilotProject(policy, tenantId, project, latestVersion);
        progress.projectsAdvanced += advanced.projectsAdvanced;
        progress.socialJobsCreated += advanced.socialJobsCreated;
        progress.publicationsCreated += advanced.publicationsCreated;
        progress.approvals += advanced.approvals;
        continue;
      }

      // ── Legacy / assisted path (human approval semantics preserved). ──
      if (!latestVersion) {
        if (policy.autoGenerate) {
          await startProductionForProject(tenantId, project.id);
          progress.projectsAdvanced += 1;
        }
        continue;
      }

      // Auto approval requires stricter quality than an ordinary QA-passed
      // version. Failures remain in QA/review and are never scheduled.
      if (policy.autoApprove && isAutomaticApprovalQualityReady(latestVersion)) {
        await approveVersion(tenantId, project.id, latestVersion.id, "automation", null);
        progress.approvals += 1;
      }
    } catch (error) {
      structuredEvent(
        "planner.project_failed",
        { tenantId, projectId: project.id, error: error instanceof Error ? error.message : String(error) },
        "error",
      );
    }
  }

  return progress;
}

/**
 * Advance one AUTOPILOT project one step per tick. The step order mirrors the
 * pipeline: generation → image → strict QA → targeted repair (bounded) →
 * auto approval → social → scheduling → publication.
 */
async function advanceAutopilotProject(
  policy: AutomationPolicy,
  tenantId: string,
  project: AutopilotProjectView,
  latestVersion: AutopilotProjectView["versions"][number] | null,
): Promise<ProgressResult> {
  const progress: ProgressResult = {
    projectsAdvanced: 0,
    socialJobsCreated: 0,
    publicationsCreated: 0,
    approvals: 0,
  };

  if (!latestVersion) {
    if (policy.autoGenerate) {
      await startProductionForProject(tenantId, project.id);
      await prisma.contentProject.update({
        where: { id: project.id },
        data: { automationSubstate: "generating" },
      });
      progress.projectsAdvanced += 1;
    }
    return progress;
  }

  const imageReady = isHeroImageReady(latestVersion.contentImage);

  // Waiting for the image pipeline: no further advancement until it finishes
  // (the image worker triggers QA once the hero variant is persisted).
  if (latestVersion.status === "ai_generated" || latestVersion.status === "draft") {
    await prisma.contentProject.update({
      where: { id: project.id },
      data: { automationSubstate: imageReady ? "qa_checking" : "waiting_for_image" },
    });
    return progress;
  }

  // QA failed → bounded self-healing repair cycle.
  if (latestVersion.status === "qa_failed") {
    const outcome = await runQualityRepairCycle(tenantId, project.id, policy);
    progress.projectsAdvanced += 1;
    if (outcome.outcome === "gate_passed") {
      // QA passed after repair; the next tick approves and schedules.
    }
    return progress;
  }

  // QA passed → the strict autonomous quality gate decides.
  if (latestVersion.status === "qa_passed") {
    const gate = await evaluateAutopilotGateForVersion(tenantId, policy, project, latestVersion);

    if (!gate.passed) {
      if (policy.autoRepair) {
        await runQualityRepairCycle(tenantId, project.id, policy);
        progress.projectsAdvanced += 1;
      } else {
        await prisma.contentProject.update({
          where: { id: project.id },
          data: { automationSubstate: "intervention_required" },
        });
      }
      return progress;
    }

    // Persist the gate result for observability and approve automatically.
    await prisma.contentVersion.update({
      where: { id: latestVersion.id },
      data: {
        autonomousGatePassed: true,
        autonomousGateReport: gate.report as unknown as Prisma.InputJsonObject,
      },
    });
    if (policy.autoApprove) {
      await approveVersion(tenantId, project.id, latestVersion.id, "automation/autopilot", null);
      await prisma.contentProject.update({
        where: { id: project.id },
        data: { automationSubstate: "auto_approved" },
      });
      await writeAudit({
        tenantId,
        action: "project.autopilot_approved",
        entityType: "content_project",
        entityId: project.id,
        actorType: "system",
        actorUserId: null,
        metadata: { actor: "automation/autopilot", versionId: latestVersion.id, qaScore: gate.report.overallScore },
      });
      progress.approvals += 1;
    }
    return progress;
  }

  if (latestVersion.status === "approved") {
    if (policy.autoSchedule) {
      const created = await ensureAutoPublications(policy, tenantId, project.id, latestVersion.id);
      progress.publicationsCreated += created;
      await prisma.contentProject.update({
        where: { id: project.id },
        data: { automationSubstate: created > 0 ? "scheduled" : "scheduling" },
      });
    }
    return progress;
  }

  // Publication is flowing through the scheduler/publishing workers.
  return progress;
}

export type AutopilotProjectView = {
  id: string;
  versions: Array<{
    id: string;
    status: string;
    title: string | null;
    excerpt: string | null;
    bodyHtml: string | null;
    seoTitle: string | null;
    seoDescription: string | null;
    qaReport: unknown;
    contentImage: {
      status: string | null;
      storagePath: string | null;
      assetVariants: Array<{ kind: string }>;
    } | null;
  }>;
  publications: Array<{ id: string }>;
  metadata: unknown;
  topic: { id: string } | null;
};

export async function evaluateAutopilotGateForVersion(
  tenantId: string,
  policy: AutomationPolicy,
  project: AutopilotProjectView,
  latestVersion: AutopilotProjectView["versions"][number],
) {
  const metadata = (project.metadata && typeof project.metadata === "object"
    ? project.metadata
    : {}) as Record<string, unknown>;
  const readString = (key: string): string | null => {
    const value = metadata[key];
    return typeof value === "string" && value.trim() ? value.trim() : null;
  };

  const qaReport = latestVersion.qaReport && typeof latestVersion.qaReport === "object"
    ? (latestVersion.qaReport as { passed?: unknown; score?: unknown; findings?: unknown })
    : null;

  const findings = Array.isArray(qaReport?.findings)
    ? (qaReport.findings as QaReportV2["findings"])
    : [];

  const factRows = project.topic
    ? await prisma.fact.findMany({
        where: { tenantId, topicId: project.topic.id },
        select: { sourceRef: true },
        take: 50,
      })
    : [];
  const sourceGroups = new Set(
    factRows
      .map((fact) => fact.sourceRef)
      .filter((url): url is string => Boolean(url))
      .map((url) => {
        try {
          return new URL(url).hostname;
        } catch {
          return url;
        }
      }),
  ).size;

  const report = evaluateAutonomousGate(
    {
      version: {
        status: latestVersion.status,
        title: latestVersion.title,
        excerpt: latestVersion.excerpt,
        bodyHtml: latestVersion.bodyHtml,
        seoTitle: latestVersion.seoTitle,
        seoDescription: latestVersion.seoDescription,
      },
      qaReport: {
        passed: qaReport?.passed === true,
        score: typeof qaReport?.score === "number" ? qaReport.score : 0,
        checks: [],
        findings,
      },
      contentType: readString("contentType") ?? readString("articleType"),
      intent: readString("primaryIntent") ?? readString("searchIntent"),
      heroImageReady: isHeroImageReady(latestVersion.contentImage),
      sourceGroups,
      cannibalizationRisk: readString("cannibalizationRisk"),
    },
    readGateConfig(policy),
  );

  return { passed: report.passed, report };
}

export async function ensureAutoPublications(
  policy: AutomationPolicy,
  tenantId: string,
  projectId: string,
  versionId: string,
): Promise<number> {
  if (!policy.siteId) return 0;
  const existing = await prisma.publication.findFirst({
    where: { tenantId, projectId, versionId, channel: "website", status: { not: "deleted" } },
    select: { id: true },
  });
  if (existing) return 0;

  const scheduledFor = await nextFreeSlot(policy, tenantId, startOfLocalDay(policy));
  if (!scheduledFor) return 0;
  await createPublication({
    tenantId,
    projectId,
    versionId,
    channel: "website",
    siteId: policy.siteId,
    scheduledFor,
  });
  return 1;
}

async function nextFreeSlot(
  policy: AutomationPolicy,
  tenantId: string,
  dayStart: Date,
): Promise<Date | null> {
  const now = new Date();
  const minimumSpacingMs = Math.max(15, policy.minimumMinutesBetweenArticles) * 60_000;

  let day = dayStart;
  for (let dayOffset = 0; dayOffset < 8; dayOffset += 1, day = nextPolicyDay(policy, day)) {
    const slots = generateEditorialSlots(policy, day).filter((slot) => slot.channel === "website");
    if (!slots.length || await countChannelPublicationsToday(tenantId, "website", day, nextPolicyDay(policy, day), policy.siteId) >= policy.maxArticlesPerDay) continue;
    for (const slot of slots) {
      if (slot.at.getTime() <= now.getTime() + 60_000) {
        continue;
      }
      const conflicts = await prisma.publication.findFirst({
        where: {
          tenantId,
          ...(policy.siteId ? { siteId: policy.siteId } : {}),
          channel: "website",
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
      return slot.at;
    }
  }

  return null;
}

const PLAN_ITEMS_PER_TICK = 3;

/**
 * Just-in-time plan production: approved website items whose slot is within
 * the lead time start the article pipeline. Before that they stay a title,
 * intent and keywords. Autopilot approves its own proposals for that window.
 */
export async function progressDuePlanItems(
  policy: AutomationPolicy,
  options: { now?: Date; start?: (tenantId: string, planItemId: string) => Promise<unknown> } = {},
): Promise<number> {
  if (!policy.siteId || (policy.mode !== "assisted" && policy.mode !== "autopilot")) return 0;
  const now = options.now ?? new Date();
  const start = options.start ?? startProductionForPlanItem;
  const { tenantId, siteId } = policy;
  const window = { tenantId, siteId, channel: "website" as const, scheduledFor: { lte: new Date(now.getTime() + PLAN_LEAD_TIME_MINUTES * 60_000) } };
  if (policy.mode === "autopilot") {
    const proposed = await prisma.editorialPlanItem.findMany({ where: { ...window, status: "proposed" }, select: { id: true } });
    if (proposed.length) await bulkApproveEditorialPlanItems(tenantId, proposed.map((item) => item.id), null);
  }
  const startedToday = await prisma.productionJob.count({ where: { tenantId, siteId, kind: "plan_item", createdAt: { gte: startOfLocalDay(policy, now) } } });
  const budget = Math.min(PLAN_ITEMS_PER_TICK, policy.articlesPerDay - startedToday);
  if (budget <= 0) return 0;
  const candidates = await prisma.editorialPlanItem.findMany({ where: { ...window, status: "approved", projectId: null }, orderBy: { scheduledFor: "asc" }, take: 50, select: { id: true } });
  // A failed job returns its item to `approved`: only items never produced start here, retries stay manual.
  const produced = new Set((await prisma.productionJob.findMany({ where: { tenantId, planItemId: { in: candidates.map((item) => item.id) } }, select: { planItemId: true } })).map((job) => job.planItemId));
  let started = 0;
  for (const item of candidates.filter((candidate) => !produced.has(candidate.id)).slice(0, budget)) {
    try {
      await start(tenantId, item.id);
      started += 1;
    } catch (error) {
      structuredEvent("planner.plan_item_failed", { tenantId, planItemId: item.id, error: error instanceof Error ? error.message : String(error) }, "error");
    }
  }
  return started;
}

async function hasActiveSources(tenantId: string, siteId: string | null): Promise<boolean> {
  return Boolean(siteId && await prisma.contentSource.findFirst({
    where: { tenantId, siteId, enabled: true, archivedAt: null },
    select: { id: true },
  }));
}

export type AutomationTickResult = {
  policiesProcessed: number;
  planItemsStarted: number;
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
    planItemsStarted: 0,
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
    const websitePlanned = await countChannelPublicationsToday(tenantId, "website", dayStart, nextPolicyDay(policy, dayStart), policy.siteId);
    const pendingQueue = await prisma.publication.count({
      where: { tenantId, ...(policy.siteId ? { siteId: policy.siteId } : {}), channel: "website", status: { in: ["draft", "ready", "scheduled"] } },
    });

    result.planItemsStarted += await progressDuePlanItems(policy);

    // News sources are an Advanced feature: only sites with active Sources draft from SourceItems.
    if (policy.autoGenerate && websitePlanned < policy.articlesPerDay && pendingQueue < policy.maximumQueueSize && (await hasActiveSources(tenantId, policy.siteId))) {
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
