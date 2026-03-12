export type CostPolicyResult = {
  allowed: boolean;
  reason?: string;
  dailyBudgetUsd?: number;
  monthlyBudgetUsd?: number;
  dailySpendUsd?: number;
  monthlySpendUsd?: number;
};

export interface CostPolicy {
  check(tenantId: string, estimatedCostUsd: number): Promise<CostPolicyResult>;
}

export interface JobQueue {
  enqueueScrapingJob(jobId: string, payload: Record<string, unknown>): Promise<void>;
  enqueueTextJob(jobId: string, payload: Record<string, unknown>): Promise<void>;
  enqueueImageJob(jobId: string, payload: Record<string, unknown>): Promise<void>;
}
