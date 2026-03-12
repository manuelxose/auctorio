"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runImageWorker = runImageWorker;
const client_1 = require("@prisma/client");
const bullmq_1 = require("bullmq");
const env_1 = require("../../shared/utils/env");
const queues_1 = require("../queue/queues");
const redis_1 = require("../queue/redis");
const jobs_1 = require("../db/jobs");
const prisma_1 = require("../db/prisma");
const image_1 = require("../ai/image");
const prompts_1 = require("../../studio/prompts");
const local_storage_1 = require("../storage/local-storage");
const orchestration_1 = require("../../studio/orchestration");
function parseSize(size) {
    if (!size) {
        return {};
    }
    const match = size.match(/^(\d+)x(\d+)$/);
    if (!match) {
        return {};
    }
    return { width: Number.parseInt(match[1], 10), height: Number.parseInt(match[2], 10) };
}
function computeImageCost() {
    return (0, env_1.getNumberEnv)("IMAGE_COST_PER_GEN_USD", 0);
}
function extensionFromContentType(contentType) {
    if (contentType === "image/jpeg") {
        return ".jpg";
    }
    if (contentType === "image/webp") {
        return ".webp";
    }
    return ".png";
}
async function runImageWorker() {
    const redisUrl = (0, env_1.getEnv)("REDIS_URL", "");
    if (!redisUrl) {
        console.warn("[worker:image] REDIS_URL is missing; worker not started");
        return;
    }
    const prisma = (0, prisma_1.getPrismaClient)();
    const provider = (0, image_1.getImageProvider)();
    const worker = new bullmq_1.Worker(queues_1.QUEUE_NAMES.image, async (job) => {
        const data = job.data;
        await (0, jobs_1.markJobProcessing)(data.jobId);
        await prisma.contentImage.update({
            where: { id: data.contentImageId },
            data: { status: "processing" },
        });
        const topic = await prisma.topic.findFirst({
            where: { id: data.topicId, tenantId: data.tenantId },
        });
        if (!topic) {
            throw new Error("topic_not_found");
        }
        let textOutput = null;
        if (data.textId) {
            const text = await prisma.contentText.findFirst({
                where: { id: data.textId, tenantId: data.tenantId },
            });
            textOutput = text?.output ?? null;
        }
        const prompt = await (0, prompts_1.resolveImagePrompt)(prisma, {
            tenantId: data.tenantId,
            siteId: typeof data.options?.site_id === "string" && data.options.site_id.trim()
                ? data.options.site_id.trim()
                : null,
            promptPresetVersionId: typeof data.options?.promptPresetVersionId === "string" &&
                data.options.promptPresetVersionId.trim()
                ? data.options.promptPresetVersionId.trim()
                : null,
            topicTitle: topic.title,
            topicDescription: topic.description,
            mode: data.mode,
            textOutput,
            options: data.options ?? {},
        });
        const size = typeof data.options?.size === "string" ? data.options.size : undefined;
        const result = await provider.generate({
            prompt: prompt.userPrompt,
            size,
        });
        const extension = extensionFromContentType(result.contentType);
        const stored = await (0, local_storage_1.saveImageAsset)({
            tenantId: data.tenantId,
            contentImageId: data.contentImageId,
            bytes: result.bytes,
            extension,
        });
        const parsed = parseSize(size);
        const costUsd = computeImageCost();
        await prisma.contentImage.update({
            where: { id: data.contentImageId },
            data: {
                status: "done",
                provider: result.provider,
                model: result.model,
                prompt: prompt.userPrompt,
                promptPresetVersionId: prompt.promptPresetVersionId,
                storagePath: stored.relativePath,
                width: parsed.width ?? null,
                height: parsed.height ?? null,
                costUsd,
            },
        });
        await prisma.aiAudit.create({
            data: {
                tenantId: data.tenantId,
                jobId: data.jobId,
                provider: result.provider,
                model: result.model,
                prompt: prompt.userPrompt,
                promptPresetVersionId: prompt.promptPresetVersionId,
                response: JSON.stringify({ storage_path: stored.relativePath }),
                usageJson: client_1.Prisma.JsonNull,
            },
        });
        await (0, orchestration_1.syncImageResultToStudio)(data.tenantId, data.contentImageId);
    }, {
        connection: (0, redis_1.getRedisConnectionOptions)(),
    });
    worker.on("completed", async (job) => {
        if (!job?.id) {
            return;
        }
        await (0, jobs_1.markJobDone)(job.id.toString());
    });
    worker.on("failed", async (job, err) => {
        if (!job?.id) {
            return;
        }
        const data = job.data;
        await (0, jobs_1.markJobFailed)(job.id.toString(), err.message);
        if (data?.contentImageId) {
            await prisma.contentImage.update({
                where: { id: data.contentImageId },
                data: { status: "failed", error: err.message },
            });
        }
    });
    console.log("[worker:image] started", { queue: queues_1.QUEUE_NAMES.image });
}
