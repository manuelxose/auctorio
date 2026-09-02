// Phase 6 — recovery of existing automatic projects stuck in legacy states.
// Idempotent by design: it only ever advances a project through the same
// guarded transitions the automation tick uses, so running it repeatedly
// (or concurrently with the tick) is safe. A dry-run mode reports every
// action without mutating anything.
//
// Eligibility: origin = auto AND the active automation policy resolves to
// mode `autopilot`. Manually managed projects are never touched.

import { Prisma } from "@prisma/client";
import type { AutomationPolicy, ProjectStatus, Publication } from "@prisma/client";
import { getPrismaClient } from "../infrastructure/db/prisma";
import { structuredEvent } from "../shared/utils/logger";
import { getOrCreatePolicy } from "./automation";
import { normalizeAutomationMode } from "./automation-mode";
import { ensureAutoPublications, evaluateAutopilotGateForVersion } from "./planner";
import { runQualityRepairCycle } from "./quality-repair";
import { approveVersion } from "./repository";
import { retryPublication } from "./publication";
import { notifyOperators } from "./notifications";
import type { AutopilotProjectView } from "./planner";
import type { AutomationMode } from "./automation-mode";

const prisma = getPrismaClient();

const RECOVERABLE_STATUSES = ["qa_failed", "qa_passed", "in_review", "approved", "publish_failed"] as const;

export type RecoveryItem = {
  projectId: string;
  action: "skip" | "repair" | "approve" | "schedule" | "retry_publication" | "intervention";
  result: string;
  detail?: string;
};

export type RecoveryReport = {
  dryRun: boolean;
  scanned: number;
  eligible: number;
  acted: number;
  items: RecoveryItem[];
};

export type RecoveryInput = {
  /** Required: recovery only ever operates inside the caller's tenant. */
  tenantId?: string;
  siteId?: string | null;
  dryRun?: boolean;
  /** Restrict to specific statuses (defaults to the stuck set). */
  statuses?: string[];
  /** Per-tenant/site policy override for tests and targeted runs. */
  policyResolver?: (tenantId: string, siteId: string) => Promise<AutomationPolicy>;
};

function pushItem(
  report: RecoveryReport,
  projectId: string,
  action: RecoveryItem["action"],
  result: string,
  detail?: string,
): void {
  report.items.push({ projectId, action, result, detail });
}

/**
 * Resolve the effective mode for a policy row. Legacy rows may have a NULL
 * mode column; in that case the legacy flags decide (same normalization the
 * automation service applies at write time).
 */
function resolveMode(policy: AutomationPolicy): AutomationMode {
  return normalizeAutomationMode(policy.mode, {
    autoGenerate: policy.autoGenerate,
    autoApprove: policy.autoApprove,
    autoSchedule: policy.autoSchedule,
    autoPublish: policy.autoPublish,
  });
}

export async function recoverStuckAutoProjects(input: RecoveryInput): Promise<RecoveryReport> {
  const dryRun = input.dryRun === true;
  const statuses = input.statuses?.length
    ? input.statuses
    : (RECOVERABLE_STATUSES as readonly string[]);

  const report: RecoveryReport = { dryRun, scanned: 0, eligible: 0, acted: 0, items: [] };

  const projects = await prisma.contentProject.findMany({
    where: {
      origin: "auto",
      deletedAt: null,
      status: { in: statuses as ProjectStatus[] },
      ...(input.tenantId ? { tenantId: input.tenantId } : {}),
      ...(input.siteId ? { siteId: input.siteId } : {}),
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
      topic: true,
    },
    orderBy: { updatedAt: "desc" },
    take: 200,
  });

  for (const project of projects) {
    report.scanned += 1;
    const policy = input.policyResolver
      ? await input.policyResolver(project.tenantId, project.siteId)
      : await getOrCreatePolicy(project.tenantId, project.siteId);

    const mode = resolveMode(policy);
    if (mode !== "autopilot") {
      pushItem(report, project.id, "skip", `mode_${mode}`);
      continue;
    }
    report.eligible += 1;

    const latestVersion = project.versions[0] ?? null;
    if (!latestVersion) {
      pushItem(report, project.id, "skip", "no_version");
      continue;
    }

    const view = project as unknown as RecoveryProjectView;
    const gateView = project as unknown as AutopilotProjectView;

    try {
      if (project.status === "publish_failed") {
        await recoverFailedPublications(report, view, dryRun);
        continue;
      }

      if (project.status === "qa_failed") {
        if (dryRun) {
          pushItem(report, project.id, "repair", "dry_run", "would run bounded repair cycle");
          continue;
        }
        const outcome = await runQualityRepairCycle(project.tenantId, project.id, policy);
        report.acted += 1;
        if (outcome.outcome === "gate_passed") {
          pushItem(report, project.id, "repair", "gate_passed", `attempts=${outcome.attemptsUsed}/${outcome.maxAttempts}`);
          // Repair succeeded: approve and schedule in the same run.
          await approveAndSchedule(report, project.tenantId, gateView, latestVersion.id, policy);
        } else if (outcome.outcome === "intervention_required") {
          pushItem(report, project.id, "intervention", "repair_exhausted", outcome.blockers.join(","));
        } else {
          pushItem(report, project.id, "repair", outcome.outcome, outcome.blockers.join(","));
        }
        continue;
      }

      if (project.status === "qa_passed" || project.status === "in_review") {
        const gate = await evaluateAutopilotGateForVersion(project.tenantId, policy, gateView, latestVersion);
        if (!gate.passed) {
          if (policy.autoRepair && !dryRun) {
            const outcome = await runQualityRepairCycle(project.tenantId, project.id, policy);
            report.acted += 1;
            pushItem(report, project.id, "repair", outcome.outcome, outcome.blockers.join(","));
          } else if (dryRun) {
            pushItem(report, project.id, "repair", "dry_run", "gate not passed; repair would run");
          } else {
            pushItem(report, project.id, "intervention", "gate_not_passed");
          }
          continue;
        }
        if (dryRun) {
          pushItem(report, project.id, "approve", "dry_run", "gate passed; would auto-approve");
          continue;
        }
        await approveAndSchedule(report, project.tenantId, gateView, latestVersion.id, policy);
        continue;
      }

      if (project.status === "approved") {
        if (dryRun) {
          pushItem(report, project.id, "schedule", "dry_run", "would create missing publications");
          continue;
        }
        const created = await ensureAutoPublications(policy, project.tenantId, project.id, latestVersion.id);
        report.acted += 1;
        pushItem(report, project.id, "schedule", created > 0 ? `created_${created}` : "already_scheduled");
      }
    } catch (error) {
      pushItem(report, project.id, "skip", "error", error instanceof Error ? error.message : String(error));
      structuredEvent("autopilot.recover.project_failed", {
        tenantId: project.tenantId,
        projectId: project.id,
        error: error instanceof Error ? error.message : String(error),
      }, "error");
    }
  }

  return report;
}

async function approveAndSchedule(
  report: RecoveryReport,
  tenantId: string,
  project: AutopilotProjectView,
  versionId: string,
  policy: AutomationPolicy,
): Promise<void> {
  // Persist the gate result for observability before approving.
  await prisma.contentVersion.update({
    where: { id: versionId },
    data: { autonomousGatePassed: true },
  });
  if (policy.autoApprove) {
    await approveVersion(tenantId, project.id, versionId, "automation/autopilot", null);
    await prisma.contentProject.update({
      where: { id: project.id },
      data: { automationSubstate: "auto_approved" },
    });
    report.acted += 1;
    pushItem(report, project.id, "approve", "approved");
  }
  if (policy.autoSchedule) {
    const created = await ensureAutoPublications(policy, tenantId, project.id, versionId);
    report.acted += 1;
    pushItem(report, project.id, "schedule", created > 0 ? `created_${created}` : "already_scheduled");
  }
}

type RecoveryPublication = Pick<Publication, "id" | "status" | "failureClass" | "failureReason" | "retryCount">;

type RecoveryProjectView = Omit<AutopilotProjectView, "publications"> & {
  tenantId: string;
  siteId: string;
  status: string;
  publications: RecoveryPublication[];
};

async function recoverFailedPublications(
  report: RecoveryReport,
  project: RecoveryProjectView,
  dryRun: boolean,
): Promise<void> {
  const failed = project.publications.filter((publication) => publication.status === "failed");
  if (failed.length === 0) {
    // Project marked publish_failed but no failed publication rows remain:
    // let the tick re-evaluate.
    if (!dryRun) {
      await prisma.contentProject.update({
        where: { id: project.id },
        data: { status: "approved", automationSubstate: "retrying" },
      });
    }
    pushItem(report, project.id, "retry_publication", dryRun ? "dry_run" : "reopened");
    return;
  }

  for (const publication of failed) {
    const permanent =
      publication.failureClass === "permanent" || publication.retryCount >= 3;
    if (permanent) {
      pushItem(
        report,
        project.id,
        "intervention",
        `publication_${publication.id}_permanent`,
        publication.failureReason ?? undefined,
      );
      if (!dryRun) {
        await prisma.contentProject.update({
          where: { id: project.id },
          data: { automationSubstate: "intervention_required" },
        });
        await notifyOperators([project.tenantId], {
          category: "operations",
          severity: "error",
          title: "Autopilot: publicación irrecuperable",
          message: `La publicación ${publication.id} del proyecto ${project.id} falló de forma permanente (${publication.failureReason ?? "sin detalle"}).`,
          entityType: "publication",
          entityId: publication.id,
          actionUrl: `/studio/publishing/${publication.id}`,
          dedupeKey: `recover.permanent.${publication.id}`,
        });
      }
      continue;
    }
    if (dryRun) {
      pushItem(report, project.id, "retry_publication", "dry_run", `publication_${publication.id}`);
      continue;
    }
    await retryPublication(project.tenantId, publication.id);
    report.acted += 1;
    pushItem(report, project.id, "retry_publication", `requeued_${publication.id}`);
  }
}

export type { AutopilotProjectView };
