import type { ProjectStatus, VersionStatus } from "@prisma/client";
import type { ReviewGateSummary, ReviewGateStage } from "./types";

type QaCheckLike = {
  passed: boolean;
  message: string;
  severity: "error" | "warning";
};

type QaReportLike = {
  passed: boolean;
  checks: QaCheckLike[];
};

type ReviewVersionInput = {
  status: VersionStatus;
  title: string | null;
  excerpt: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  feedback: string | null;
  bodyHtml: string | null;
  qaReport: unknown;
  hasAsset: boolean;
};

export type ImageReadinessInput = {
  status?: string | null;
  storagePath?: string | null;
  assetVariants?: Array<{ kind: string } | null> | null;
};

export function isHeroImageReady(image: ImageReadinessInput | null | undefined): boolean {
  return Boolean(
    image &&
      image.status === "done" &&
      image.storagePath &&
      Array.isArray(image.assetVariants) &&
      image.assetVariants.some((variant) => variant && variant.kind === "hero"),
  );
}

type BuildReviewGateInput = {
  projectStatus: ProjectStatus;
  versionCount: number;
  latestVersion: ReviewVersionInput | null;
};

function normalizeQaReport(value: unknown): QaReportLike | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as { passed?: unknown; checks?: unknown };
  if (!Array.isArray(candidate.checks) || typeof candidate.passed !== "boolean") {
    return null;
  }

  const checks = candidate.checks
    .map((check) => {
      if (!check || typeof check !== "object") {
        return null;
      }

      const item = check as {
        passed?: unknown;
        message?: unknown;
        severity?: unknown;
      };

      if (
        typeof item.passed !== "boolean" ||
        typeof item.message !== "string" ||
        (item.severity !== "error" && item.severity !== "warning")
      ) {
        return null;
      }

      return {
        passed: item.passed,
        message: item.message,
        severity: item.severity,
      } satisfies QaCheckLike;
    })
    .filter((check): check is QaCheckLike => Boolean(check));

  return {
    passed: candidate.passed,
    checks,
  };
}

function pushUnique(target: string[], value: string) {
  const normalized = value.trim();
  if (normalized && !target.includes(normalized)) {
    target.push(normalized);
  }
}

export function countWordsFromHtml(value: string | null | undefined): number {
  const plain = String(value ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return plain ? plain.split(" ").length : 0;
}

export function countQaFailures(value: unknown): number {
  const qaReport = normalizeQaReport(value);
  if (!qaReport) {
    return 0;
  }

  return qaReport.checks.filter((check) => !check.passed && check.severity === "error").length;
}

export function countQaWarnings(value: unknown): number {
  const qaReport = normalizeQaReport(value);
  if (!qaReport) {
    return 0;
  }

  return qaReport.checks.filter((check) => !check.passed && check.severity === "warning").length;
}

function resolveStage(
  projectStatus: ProjectStatus,
  latestVersion: ReviewVersionInput | null,
  blockerCount: number,
): ReviewGateStage {
  if (!latestVersion) {
    return "awaiting_generation";
  }

  if (projectStatus === "publish_queued") {
    return "publish_queued";
  }

  if (projectStatus === "publish_failed") {
    return "publish_failed";
  }

  if (projectStatus === "published" || latestVersion.status === "published") {
    return "published";
  }

  if (latestVersion.status === "approved") {
    return "approved";
  }

  if (latestVersion.status === "qa_failed") {
    return "qa_blocked";
  }

  if (latestVersion.status === "qa_passed" && blockerCount === 0) {
    return "ready_to_approve";
  }

  return "needs_review";
}

function resolveNextAction(stage: ReviewGateStage): string {
  switch (stage) {
    case "awaiting_generation":
      return "Generate the first version";
    case "qa_blocked":
      return "Revise the content and rerun QA";
    case "ready_to_approve":
      return "Approve the latest version";
    case "approved":
      return "Queue draft sync or publish";
    case "publish_queued":
      return "Monitor publication execution";
    case "publish_failed":
      return "Inspect publication history and retry";
    case "published":
      return "Track live status and future updates";
    case "needs_review":
    default:
      return "Run QA and complete editorial review";
  }
}

export function buildReviewGate(input: BuildReviewGateInput): ReviewGateSummary {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const latestVersion = input.latestVersion;

  if (!latestVersion) {
    blockers.push("No generated version exists yet.");
  } else {
    if (!latestVersion.title?.trim()) {
      pushUnique(blockers, "Latest version has no title yet.");
    }

    if (countWordsFromHtml(latestVersion.bodyHtml) === 0) {
      pushUnique(blockers, "Latest version has no rendered body yet.");
    }

    if (!latestVersion.hasAsset) {
      pushUnique(blockers, "Featured image is still missing.");
    }

    const qaReport = normalizeQaReport(latestVersion.qaReport);
    if (!qaReport) {
      pushUnique(blockers, "QA report is missing for the latest version.");
    } else {
      for (const check of qaReport.checks) {
        if (check.passed) {
          continue;
        }

        if (check.severity === "error") {
          pushUnique(blockers, check.message);
        } else {
          pushUnique(warnings, check.message);
        }
      }
    }

    if (
      ["qa_passed", "approved", "published"].includes(latestVersion.status) &&
      !latestVersion.feedback?.trim()
    ) {
      pushUnique(warnings, "No reviewer note has been recorded for the latest decision.");
    }

    if (input.versionCount < 2) {
      pushUnique(warnings, "Only one saved version exists, so compare history is still shallow.");
    }

    if (!latestVersion.seoTitle?.trim() || !latestVersion.seoDescription?.trim()) {
      pushUnique(warnings, "SEO metadata is incomplete for the latest version.");
    }
  }

  if (input.projectStatus === "publish_failed") {
    pushUnique(warnings, "The latest publication attempt failed and needs operator review.");
  }

  const stage = resolveStage(input.projectStatus, latestVersion, blockers.length);
  const nextAction = resolveNextAction(stage);

  return {
    stage,
    compareReady: input.versionCount > 1,
    approvalReady: stage === "ready_to_approve",
    publishReady:
      blockers.length === 0 &&
      ["approved", "publish_queued", "publish_failed", "published"].includes(stage),
    blockerCount: blockers.length,
    warningCount: warnings.length,
    blockers,
    warnings,
    nextAction,
    primaryConcern: blockers[0] ?? warnings[0] ?? nextAction,
  };
}
