"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.findJobByIdempotency = findJobByIdempotency;
exports.createJob = createJob;
exports.markJobProcessing = markJobProcessing;
exports.markJobDone = markJobDone;
exports.markJobFailed = markJobFailed;
const prisma_1 = require("./prisma");
async function findJobByIdempotency(tenantId, idempotencyKey) {
    const prisma = (0, prisma_1.getPrismaClient)();
    return prisma.job.findUnique({
        where: {
            tenantId_idempotencyKey: {
                tenantId,
                idempotencyKey,
            },
        },
    });
}
async function createJob(params) {
    const prisma = (0, prisma_1.getPrismaClient)();
    return prisma.job.create({
        data: {
            tenantId: params.tenantId,
            type: params.type,
            status: params.status ?? "queued",
            idempotencyKey: params.idempotencyKey ?? null,
        },
    });
}
async function markJobProcessing(jobId) {
    const prisma = (0, prisma_1.getPrismaClient)();
    return prisma.job.update({
        where: { id: jobId },
        data: {
            status: "processing",
            startedAt: new Date(),
        },
    });
}
async function markJobDone(jobId) {
    const prisma = (0, prisma_1.getPrismaClient)();
    return prisma.job.update({
        where: { id: jobId },
        data: {
            status: "done",
            finishedAt: new Date(),
        },
    });
}
async function markJobFailed(jobId, error) {
    const prisma = (0, prisma_1.getPrismaClient)();
    return prisma.job.update({
        where: { id: jobId },
        data: {
            status: "failed",
            lastError: error,
            finishedAt: new Date(),
        },
    });
}
