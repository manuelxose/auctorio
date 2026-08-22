import { Queue, type JobsOptions } from "bullmq";
import { getRedisConnectionOptions } from "./redis";
import { QUEUE_NAMES } from "./queues";
import { getNumberEnv } from "../../shared/utils/env";

const queues = new Map<string, Queue>();

function getQueue(name: string): Queue {
  const existing = queues.get(name);
  if (existing) {
    return existing;
  }

  const queue = new Queue(name, {
    connection: getRedisConnectionOptions(),
  });
  queues.set(name, queue);
  return queue;
}

function retryOptions(): JobsOptions {
  const attempts = Math.max(1, getNumberEnv("WORKER_MAX_ATTEMPTS", 3));
  const backoffMs = Math.max(250, getNumberEnv("WORKER_BACKOFF_MS", 2_000));
  return {
    attempts,
    backoff: { type: "exponential", delay: backoffMs },
    removeOnComplete: 100,
    removeOnFail: 200,
  };
}

export async function enqueueScrapingJob(jobId: string, data: Record<string, unknown>) {
  const queue = getQueue(QUEUE_NAMES.scraping);
  await queue.add("scraping", data, { jobId, ...retryOptions() });
}

export async function enqueueTextJob(jobId: string, data: Record<string, unknown>) {
  const queue = getQueue(QUEUE_NAMES.text);
  await queue.add("text", data, { jobId, ...retryOptions() });
}

export async function enqueueImageJob(jobId: string, data: Record<string, unknown>) {
  const queue = getQueue(QUEUE_NAMES.image);
  await queue.add("image", data, { jobId, ...retryOptions() });
}

export async function enqueuePublishingJob(jobId: string, data: Record<string, unknown>) {
  const queue = getQueue(QUEUE_NAMES.publishing);
  await queue.add("publishing", data, { jobId, ...retryOptions() });
}

export async function enqueueSocialJob(jobId: string, data: Record<string, unknown>) {
  const queue = getQueue(QUEUE_NAMES.social);
  await queue.add("social", data, { jobId, ...retryOptions() });
}

export async function getPublishingQueue() {
  return getQueue(QUEUE_NAMES.publishing);
}
