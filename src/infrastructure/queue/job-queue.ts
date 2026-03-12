import type { JobQueue } from "../../domain/interfaces/ports";
import { enqueueImageJob, enqueueScrapingJob, enqueueTextJob } from "./producer";

export const jobQueue: JobQueue = {
  async enqueueScrapingJob(jobId, payload) {
    await enqueueScrapingJob(jobId, payload);
  },

  async enqueueTextJob(jobId, payload) {
    await enqueueTextJob(jobId, payload);
  },

  async enqueueImageJob(jobId, payload) {
    await enqueueImageJob(jobId, payload);
  },
};
