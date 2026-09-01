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
const image_processing_1 = require("../storage/image-processing");
const orchestration_1 = require("../../studio/orchestration");
const operation_hooks_1 = require("./operation-hooks");
const worker_runtime_1 = require("./worker-runtime");
const cost_budgets_1 = require("../../studio/cost-budgets");
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
function isImageModerationRejection(error) {
    const message = error instanceof Error ? error.message : String(error);
    return /status=451|prohibited or sensitive content|sensitive content|content policy/i.test(message);
}
function buildModerationFallbackPrompt(siteName) {
    const brand = siteName.trim() || "una redacción digital";
    return [
        `Ilustración editorial genérica y neutral para ${brand}.`,
        "Escritorio de redacción moderno con pantallas, periódicos y titulares abstractos e ilegibles.",
        "Sin personas reales, sin políticos, sin símbolos institucionales, sin texto legible.",
        "Estilo limpio, profesional, colores discretos, composición horizontal.",
    ].join(" ");
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
        // Cost control gate: never exceed hard AI budget limits.
        const budget = await (0, cost_budgets_1.evaluateAiSpend)({
            tenantId: data.tenantId,
            siteId: typeof data.options?.site_id === "string" ? data.options.site_id : null,
            contentType: "image_generation",
            kind: "image_generation",
        });
        if (!budget.allowed) {
            throw new Error(`budget_exceeded: ${budget.reason}`);
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
        let usedPrompt = prompt.userPrompt;
        let result;
        try {
            result = await provider.generate({
                prompt: usedPrompt,
                size,
            });
        }
        catch (error) {
            if (!isImageModerationRejection(error)) {
                throw error;
            }
            usedPrompt = buildModerationFallbackPrompt(typeof data.options?.site_name === "string" ? data.options.site_name : "");
            result = await provider.generate({
                prompt: usedPrompt,
                size,
            });
        }
        const extension = extensionFromContentType(result.contentType);
        const stored = await (0, local_storage_1.saveImageAsset)({
            tenantId: data.tenantId,
            contentImageId: data.contentImageId,
            bytes: result.bytes,
            extension,
        });
        const storageRoot = (0, env_1.getEnv)("STORAGE_ROOT", "/var/www/auctorio/storage");
        const processed = await (0, image_processing_1.buildImageDerivatives)({
            storageRoot,
            originalRelativePath: stored.relativePath,
            tenantId: data.tenantId,
            contentImageId: data.contentImageId,
        });
        const parsed = parseSize(size);
        const costUsd = computeImageCost();
        await (0, cost_budgets_1.recordAiSpend)({
            tenantId: data.tenantId,
            siteId: typeof data.options?.site_id === "string" ? data.options.site_id : null,
            contentType: "image_generation",
            kind: "image_generation",
            provider: result.provider,
            model: result.model,
            costUsd,
        });
        const width = processed.width || (parsed.width ?? null);
        const height = processed.height || (parsed.height ?? null);
        await prisma.contentImage.update({
            where: { id: data.contentImageId },
            data: {
                status: "done",
                provider: result.provider,
                model: result.model,
                prompt: usedPrompt,
                promptPresetVersionId: prompt.promptPresetVersionId,
                storagePath: stored.relativePath,
                width,
                height,
                costUsd,
            },
        });
        await prisma.assetVariant.createMany({
            data: [
                {
                    tenantId: data.tenantId,
                    contentImageId: data.contentImageId,
                    kind: "original",
                    storagePath: stored.relativePath,
                    mimeType: result.contentType,
                    width,
                    height,
                },
                ...processed.derivatives.map((derivative) => ({
                    tenantId: data.tenantId,
                    contentImageId: data.contentImageId,
                    kind: derivative.kind,
                    storagePath: derivative.storagePath,
                    mimeType: derivative.mimeType,
                    width: derivative.width,
                    height: derivative.height,
                })),
            ],
        });
        await prisma.aiAudit.create({
            data: {
                tenantId: data.tenantId,
                jobId: data.jobId,
                provider: result.provider,
                model: result.model,
                prompt: usedPrompt,
                promptPresetVersionId: prompt.promptPresetVersionId,
                response: JSON.stringify({
                    storage_path: stored.relativePath,
                    variants: processed.derivatives.map((derivative) => ({
                        kind: derivative.kind,
                        storage_path: derivative.storagePath,
                        width: derivative.width,
                        height: derivative.height,
                    })),
                }),
                usageJson: client_1.Prisma.JsonNull,
            },
        });
        await (0, orchestration_1.syncImageResultToStudio)(data.tenantId, data.contentImageId);
    }, {
        connection: (0, redis_1.getRedisConnectionOptions)(),
        ...(0, worker_runtime_1.bullWorkerOptions)("image", 1),
    });
    worker.on("completed", async (job) => {
        if (!job?.id) {
            return;
        }
        await (0, jobs_1.markJobDone)(job.id.toString());
        await (0, operation_hooks_1.completeOperationForJob)(job.data);
    });
    worker.on("failed", async (job, err) => {
        if (!job?.id) {
            return;
        }
        const data = job.data;
        await (0, jobs_1.markJobFailed)(job.id.toString(), err.message);
        await (0, operation_hooks_1.failOperationForJob)(job.data, err);
        if (data?.contentImageId) {
            const retryable = err instanceof image_1.ImageDownloadError && err.retryable;
            await prisma.contentImage.update({
                where: { id: data.contentImageId },
                data: {
                    status: retryable ? "retryable" : "failed",
                    error: err.message.slice(0, 500),
                },
            });
            if (!retryable && data.tenantId) {
                // QA must not be blocked by a permanently failed hero image.
                try {
                    await (0, orchestration_1.syncImageResultToStudio)(data.tenantId, data.contentImageId);
                }
                catch (qaError) {
                    console.warn("[worker:image] qa-after-failure skipped", qaError instanceof Error ? qaError.message : String(qaError));
                }
            }
        }
    });
    (0, worker_runtime_1.registerBullWorkerShutdown)(worker, "image");
    console.log("[worker:image] started", { queue: queues_1.QUEUE_NAMES.image });
}
