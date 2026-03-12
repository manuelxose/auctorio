import type { UseCaseDependencies } from "../domain/usecases";
import {
  contentImageRepository,
  contentTextRepository,
  factRepository,
  jobRepository,
  topicRepository,
} from "../infrastructure/db/repositories";
import { jobQueue } from "../infrastructure/queue/job-queue";
import { costPolicyAdapter } from "../infrastructure/policies/cost-policy-adapter";

export const useCaseDependencies: UseCaseDependencies = {
  topicRepository,
  factRepository,
  contentTextRepository,
  contentImageRepository,
  jobRepository,
  queue: jobQueue,
  costPolicy: costPolicyAdapter,
};
