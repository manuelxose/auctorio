"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.jobQueue = void 0;
const producer_1 = require("./producer");
exports.jobQueue = {
    async enqueueScrapingJob(jobId, payload) {
        await (0, producer_1.enqueueScrapingJob)(jobId, payload);
    },
    async enqueueTextJob(jobId, payload) {
        await (0, producer_1.enqueueTextJob)(jobId, payload);
    },
    async enqueueImageJob(jobId, payload) {
        await (0, producer_1.enqueueImageJob)(jobId, payload);
    },
};
