import { Queue } from "bullmq";
import { getRedisConnectionOptions } from "./redis";
import { QUEUE_NAMES } from "./queues";

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

export async function enqueueScrapingJob(jobId: string, data: Record<string, unknown>) {
  const queue = getQueue(QUEUE_NAMES.scraping);
  await queue.add("scraping", data, {
    jobId,
    attempts: 1,
    removeOnComplete: 100,
    removeOnFail: 100,
  });
}

export async function enqueueTextJob(jobId: string, data: Record<string, unknown>) {
  const queue = getQueue(QUEUE_NAMES.text);
  await queue.add("text", data, {
    jobId,
    attempts: 1,
    removeOnComplete: 100,
    removeOnFail: 100,
  });
}

export async function enqueueImageJob(jobId: string, data: Record<string, unknown>) {
  const queue = getQueue(QUEUE_NAMES.image);
  await queue.add("image", data, {
    jobId,
    attempts: 1,
    removeOnComplete: 100,
    removeOnFail: 100,
  });
}

export async function enqueuePublishingJob(jobId: string, data: Record<string, unknown>) {
  const queue = getQueue(QUEUE_NAMES.publishing);
  await queue.add("publishing", data, {
    jobId,
    attempts: 1,
    removeOnComplete: 100,
    removeOnFail: 100,
  });
}
