import type {
  ContentImageRepository,
  ContentTextRepository,
  FactRepository,
  JobRepository,
  TopicRepository,
} from "../interfaces/repositories";
import type { CostPolicy, JobQueue } from "../interfaces/ports";

export type UseCaseDependencies = {
  topicRepository: TopicRepository;
  factRepository: FactRepository;
  contentTextRepository: ContentTextRepository;
  contentImageRepository: ContentImageRepository;
  jobRepository: JobRepository;
  queue: JobQueue;
  costPolicy: CostPolicy;
};
