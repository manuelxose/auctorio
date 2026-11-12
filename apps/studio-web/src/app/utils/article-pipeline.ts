import type { ReviewGateStage } from '../models/studio.models';

export type PipelineStep = { id: string; label: string; state: 'done' | 'current' | 'todo' | 'failed' };

const STEPS = [
  { id: 'brief', label: 'Brief' },
  { id: 'draft', label: 'Draft' },
  { id: 'qa', label: 'Quality check' },
  { id: 'review', label: 'Review' },
  { id: 'approved', label: 'Approved' },
  { id: 'queued', label: 'Publishing' },
  { id: 'published', label: 'Published' },
] as const;

/**
 * Where each review-gate stage sits in the pipeline. The gate is the same source the
 * status badge and the next-action hint use, so the pipeline never contradicts them.
 */
const POSITION: Record<ReviewGateStage, { index: number; failed?: boolean }> = {
  awaiting_generation: { index: 0 },
  qa_blocked: { index: 2, failed: true },
  needs_review: { index: 3 },
  ready_to_approve: { index: 3 },
  approved: { index: 4 },
  publish_queued: { index: 5 },
  publish_failed: { index: 5, failed: true },
  published: { index: 6 },
};

export function articlePipeline(stage: ReviewGateStage): PipelineStep[] {
  const position = POSITION[stage] ?? { index: 0 };
  return STEPS.map((step, index) => ({
    ...step,
    state:
      index < position.index || (stage === 'published' && index === position.index)
        ? 'done'
        : index === position.index
          ? position.failed
            ? 'failed'
            : 'current'
          : 'todo',
  }));
}
