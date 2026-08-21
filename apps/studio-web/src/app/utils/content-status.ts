import type { ReviewGateSummary } from '../models/studio.models';

export type ContentFilter = 'all' | 'draft' | 'review' | 'ready' | 'published' | 'failed';

export const CONTENT_FILTERS: Array<{ key: ContentFilter; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'draft', label: 'Draft' },
  { key: 'review', label: 'Review' },
  { key: 'ready', label: 'Ready' },
  { key: 'published', label: 'Published' },
  { key: 'failed', label: 'Failed' },
];

export function contentFilterOf(gate: ReviewGateSummary): ContentFilter {
  switch (gate.stage) {
    case 'published':
      return 'published';
    case 'publish_failed':
      return 'failed';
    case 'approved':
    case 'publish_queued':
      return gate.publishReady ? 'ready' : 'review';
    case 'ready_to_approve':
    case 'needs_review':
    case 'qa_blocked':
      return 'review';
    case 'awaiting_generation':
    default:
      return 'draft';
  }
}

export function stageLabel(gate: ReviewGateSummary): string {
  switch (gate.stage) {
    case 'published':
      return 'Published';
    case 'publish_queued':
      return 'Publishing';
    case 'publish_failed':
      return 'Publish failed';
    case 'approved':
      return 'Approved';
    case 'ready_to_approve':
      return 'Ready for review';
    case 'qa_blocked':
      return 'QA blocked';
    case 'awaiting_generation':
      return 'Draft';
    case 'needs_review':
    default:
      return 'In review';
  }
}

export function stageTone(gate: ReviewGateSummary): 'success' | 'warning' | 'danger' | 'muted' {
  switch (gate.stage) {
    case 'published':
      return 'success';
    case 'publish_failed':
    case 'qa_blocked':
      return 'danger';
    case 'approved':
    case 'publish_queued':
      return 'warning';
    case 'ready_to_approve':
    case 'needs_review':
      return 'warning';
    default:
      return 'muted';
  }
}

export function formatRelativeTime(value: string | null | undefined): string {
  if (!value) {
    return '—';
  }
  const then = new Date(value).getTime();
  const delta = Date.now() - then;
  const minutes = Math.round(delta / 60_000);
  if (minutes < 1) {
    return 'just now';
  }
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return `${hours} h`;
  }
  const days = Math.round(hours / 24);
  return `${days} d`;
}
