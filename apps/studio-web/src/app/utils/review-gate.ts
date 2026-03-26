import type {
  ReviewGateStage,
  ReviewGateSummary,
  VersionSummary,
} from '../models/studio.models';

export type ReviewGateTone = 'muted' | 'accent' | 'warning' | 'success' | 'danger';
export type ReviewChecklistStatus = 'pass' | 'warning' | 'fail';
export type ReviewChecklistItem = {
  label: string;
  detail: string;
  status: ReviewChecklistStatus;
};

export function reviewStageLabel(stage: ReviewGateStage): string {
  const labels: Record<ReviewGateStage, string> = {
    awaiting_generation: 'Awaiting generation',
    needs_review: 'Needs review',
    qa_blocked: 'QA blocked',
    ready_to_approve: 'Ready to approve',
    approved: 'Approved',
    publish_queued: 'Publish queued',
    publish_failed: 'Publish failed',
    published: 'Published',
  };

  return labels[stage];
}

export function reviewStageTone(stage: ReviewGateStage): ReviewGateTone {
  switch (stage) {
    case 'qa_blocked':
    case 'publish_failed':
      return 'danger';
    case 'needs_review':
      return 'warning';
    case 'ready_to_approve':
    case 'publish_queued':
      return 'accent';
    case 'approved':
    case 'published':
      return 'success';
    case 'awaiting_generation':
    default:
      return 'muted';
  }
}

export function buildQaScore(version: Pick<VersionSummary, 'qaReport' | 'qaFailureCount' | 'qaWarningCount'> | null | undefined): number {
  if (!version?.qaReport) {
    return 0;
  }

  return Math.max(0, 100 - version.qaFailureCount * 35 - version.qaWarningCount * 10);
}

export function qaScoreLabel(score: number): string {
  if (score >= 90) {
    return 'Release ready';
  }

  if (score >= 70) {
    return 'Watch warnings';
  }

  if (score > 0) {
    return 'Blocked';
  }

  return 'Pending QA';
}

export function buildReviewChecklist(
  latestVersion: VersionSummary | null | undefined,
  reviewGate: ReviewGateSummary,
): ReviewChecklistItem[] {
  return [
    {
      label: 'QA report',
      detail: latestVersion?.qaReport
        ? `${latestVersion.qaFailureCount} blockers · ${latestVersion.qaWarningCount} warnings`
        : 'QA has not been run on the latest version yet.',
      status: latestVersion?.qaReport ? 'pass' : 'fail',
    },
    {
      label: 'Featured image',
      detail: latestVersion?.hasAsset
        ? 'Featured image is available for release.'
        : 'Featured image is still missing.',
      status: latestVersion?.hasAsset ? 'pass' : 'fail',
    },
    {
      label: 'SEO metadata',
      detail: latestVersion?.seoTitle && latestVersion?.seoDescription
        ? 'SEO title and description are present.'
        : 'SEO title or meta description still need attention.',
      status: latestVersion?.seoTitle && latestVersion?.seoDescription ? 'pass' : 'warning',
    },
    {
      label: 'Compare memory',
      detail: reviewGate.compareReady
        ? 'There is enough saved history to compare iterations.'
        : 'Only one saved version exists, so compare history is shallow.',
      status: reviewGate.compareReady ? 'pass' : 'warning',
    },
    {
      label: 'Editorial gate',
      detail: reviewGate.nextAction,
      status: reviewGate.publishReady || reviewGate.approvalReady
        ? 'pass'
        : reviewGate.blockerCount > 0
          ? 'fail'
          : 'warning',
    },
    {
      label: 'Reviewer note',
      detail: latestVersion?.feedback?.trim()
        ? 'A human note exists on the latest version.'
        : 'No reviewer note has been recorded yet.',
      status: latestVersion?.feedback?.trim() ? 'pass' : 'warning',
    },
  ];
}
