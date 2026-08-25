"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runTextWorker = runTextWorker;
const client_1 = require("@prisma/client");
const bullmq_1 = require("bullmq");
const env_1 = require("../../shared/utils/env");
const queues_1 = require("../queue/queues");
const redis_1 = require("../queue/redis");
const jobs_1 = require("../db/jobs");
const prisma_1 = require("../db/prisma");
const text_1 = require("../ai/text");
const prompts_1 = require("../../studio/prompts");
const orchestration_1 = require("../../studio/orchestration");
const operation_hooks_1 = require("./operation-hooks");
function computeTextCost(usage) {
    const inputRate = (0, env_1.getNumberEnv)("TEXT_COST_PER_1K_INPUT_USD", 0);
    const outputRate = (0, env_1.getNumberEnv)("TEXT_COST_PER_1K_OUTPUT_USD", 0);
    if (!usage?.promptTokens && !usage?.completionTokens) {
        return 0;
    }
    const promptTokens = usage.promptTokens ?? 0;
    const completionTokens = usage.completionTokens ?? 0;
    return (promptTokens / 1000) * inputRate + (completionTokens / 1000) * outputRate;
}
async function runTextWorker() {
    const redisUrl = (0, env_1.getEnv)("REDIS_URL", "");
    if (!redisUrl) {
        console.warn("[worker:text] REDIS_URL is missing; worker not started");
        return;
    }
    const prisma = (0, prisma_1.getPrismaClient)();
    const provider = (0, text_1.getTextProvider)();
    const worker = new bullmq_1.Worker(queues_1.QUEUE_NAMES.text, async (job) => {
        const data = job.data;
        await (0, jobs_1.markJobProcessing)(data.jobId);
        await prisma.contentText.update({
            where: { id: data.contentTextId },
            data: { status: "processing" },
        });
        const topic = await prisma.topic.findFirst({
            where: { id: data.topicId, tenantId: data.tenantId },
        });
        if (!topic) {
            throw new Error("topic_not_found");
        }
        const facts = await prisma.fact.findMany({
            where: { tenantId: data.tenantId, topicId: data.topicId },
            orderBy: { createdAt: "desc" },
            take: 20,
        });
        const promptData = await (0, prompts_1.resolveTextPrompt)(prisma, {
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
            facts: facts.map((fact) => fact.content),
            type: data.type,
            language: data.language,
            options: data.options ?? {},
        });
        // Scale output budget from the approved brief's word target so long-form
        // content is not truncated by the default token budget.
        const briefMetadata = data.options?.metadata && typeof data.options.metadata === "object"
            ? data.options.metadata
            : {};
        const targetWordMax = typeof briefMetadata.recommendedWordCountMax === "number"
            ? briefMetadata.recommendedWordCountMax
            : undefined;
        const maxTokens = targetWordMax
            ? Math.min(8000, Math.max(1400, Math.round(targetWordMax * 2.2)))
            : data.type === "seo"
                ? 3200
                : undefined;
        const result = await provider.generate({
            prompt: promptData.userPrompt,
            systemPrompt: promptData.systemPrompt,
            ...(maxTokens ? { maxTokens } : {}),
        });
        const costUsd = computeTextCost({
            promptTokens: result.usage?.promptTokens,
            completionTokens: result.usage?.completionTokens,
        });
        await prisma.contentText.update({
            where: { id: data.contentTextId },
            data: {
                status: "done",
                provider: result.provider,
                model: result.model,
                prompt: promptData.userPrompt,
                promptVersion: promptData.promptVersionLabel,
                promptPresetVersionId: promptData.promptPresetVersionId,
                output: result.output,
                tokensInput: result.usage?.promptTokens ?? null,
                tokensOutput: result.usage?.completionTokens ?? null,
                costUsd,
            },
        });
        await prisma.aiAudit.create({
            data: {
                tenantId: data.tenantId,
                jobId: data.jobId,
                provider: result.provider,
                model: result.model,
                prompt: promptData.userPrompt,
                promptPresetVersionId: promptData.promptPresetVersionId,
                response: result.output.slice(0, 8000),
                usageJson: result.usage ?? client_1.Prisma.JsonNull,
            },
        });
        await (0, orchestration_1.syncTextResultToStudio)(data.tenantId, data.contentTextId);
    }, {
        connection: (0, redis_1.getRedisConnectionOptions)(),
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
        if (data?.contentTextId) {
            await prisma.contentText.update({
                where: { id: data.contentTextId },
                data: { status: "failed", error: err.message },
            });
        }
    });
    console.log("[worker:text] started", { queue: queues_1.QUEUE_NAMES.text });
}
