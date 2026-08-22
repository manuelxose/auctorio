"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.enqueueScrapingJob = enqueueScrapingJob;
exports.enqueueTextJob = enqueueTextJob;
exports.enqueueImageJob = enqueueImageJob;
exports.enqueuePublishingJob = enqueuePublishingJob;
exports.enqueueSocialJob = enqueueSocialJob;
exports.getPublishingQueue = getPublishingQueue;
const bullmq_1 = require("bullmq");
const redis_1 = require("./redis");
const queues_1 = require("./queues");
const env_1 = require("../../shared/utils/env");
const queues = new Map();
function getQueue(name) {
    const existing = queues.get(name);
    if (existing) {
        return existing;
    }
    const queue = new bullmq_1.Queue(name, {
        connection: (0, redis_1.getRedisConnectionOptions)(),
    });
    queues.set(name, queue);
    return queue;
}
function retryOptions() {
    const attempts = Math.max(1, (0, env_1.getNumberEnv)("WORKER_MAX_ATTEMPTS", 3));
    const backoffMs = Math.max(250, (0, env_1.getNumberEnv)("WORKER_BACKOFF_MS", 2_000));
    return {
        attempts,
        backoff: { type: "exponential", delay: backoffMs },
        removeOnComplete: 100,
        removeOnFail: 200,
    };
}
async function enqueueScrapingJob(jobId, data) {
    const queue = getQueue(queues_1.QUEUE_NAMES.scraping);
    await queue.add("scraping", data, { jobId, ...retryOptions() });
}
async function enqueueTextJob(jobId, data) {
    const queue = getQueue(queues_1.QUEUE_NAMES.text);
    await queue.add("text", data, { jobId, ...retryOptions() });
}
async function enqueueImageJob(jobId, data) {
    const queue = getQueue(queues_1.QUEUE_NAMES.image);
    await queue.add("image", data, { jobId, ...retryOptions() });
}
async function enqueuePublishingJob(jobId, data) {
    const queue = getQueue(queues_1.QUEUE_NAMES.publishing);
    await queue.add("publishing", data, { jobId, ...retryOptions() });
}
async function enqueueSocialJob(jobId, data) {
    const queue = getQueue(queues_1.QUEUE_NAMES.social);
    await queue.add("social", data, { jobId, ...retryOptions() });
}
async function getPublishingQueue() {
    return getQueue(queues_1.QUEUE_NAMES.publishing);
}
