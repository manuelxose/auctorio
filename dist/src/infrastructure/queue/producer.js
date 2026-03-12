"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.enqueueScrapingJob = enqueueScrapingJob;
exports.enqueueTextJob = enqueueTextJob;
exports.enqueueImageJob = enqueueImageJob;
exports.enqueuePublishingJob = enqueuePublishingJob;
const bullmq_1 = require("bullmq");
const redis_1 = require("./redis");
const queues_1 = require("./queues");
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
async function enqueueScrapingJob(jobId, data) {
    const queue = getQueue(queues_1.QUEUE_NAMES.scraping);
    await queue.add("scraping", data, {
        jobId,
        attempts: 1,
        removeOnComplete: 100,
        removeOnFail: 100,
    });
}
async function enqueueTextJob(jobId, data) {
    const queue = getQueue(queues_1.QUEUE_NAMES.text);
    await queue.add("text", data, {
        jobId,
        attempts: 1,
        removeOnComplete: 100,
        removeOnFail: 100,
    });
}
async function enqueueImageJob(jobId, data) {
    const queue = getQueue(queues_1.QUEUE_NAMES.image);
    await queue.add("image", data, {
        jobId,
        attempts: 1,
        removeOnComplete: 100,
        removeOnFail: 100,
    });
}
async function enqueuePublishingJob(jobId, data) {
    const queue = getQueue(queues_1.QUEUE_NAMES.publishing);
    await queue.add("publishing", data, {
        jobId,
        attempts: 1,
        removeOnComplete: 100,
        removeOnFail: 100,
    });
}
