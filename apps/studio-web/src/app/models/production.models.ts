export type ProductionStageName = 'prepare' | 'duplicates' | 'evidence' | 'brief' | 'write' | 'seo' | 'qa' | 'gates' | 'materialize';
export type ProductionJobStatus = 'queued' | 'running' | 'needs_review' | 'ready' | 'failed' | 'cancelled';

export type ProductionJob = {
  id: string;
  siteId: string;
  kind: 'plan_item' | 'cluster' | 'manual';
  planItemId: string | null;
  clusterId: string | null;
  projectId: string | null;
  versionId: string | null;
  operationId: string | null;
  status: ProductionJobStatus;
  stage: string;
  attempts: number;
  error: string | null;
  errorCode: string | null;
  stages: Array<{ stage: ProductionStageName; status: 'done' | 'running' | 'failed' | 'cancelled' | 'pending' }>;
  progress: number;
  cancellable: boolean;
  retryable: boolean;
  reviewable: boolean;
  links: { editorUrl: string | null };
  summary: Record<string, Record<string, unknown>>;
  createdAt: string;
  updatedAt: string;
};

export type ProductionJobList = { items: ProductionJob[]; total: number; page: number; pageSize: number; counts: Record<string, number> };
