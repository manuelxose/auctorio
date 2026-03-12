"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runScrapingWorker = runScrapingWorker;
const bullmq_1 = require("bullmq");
const env_1 = require("../../shared/utils/env");
const hash_1 = require("../../shared/utils/hash");
const text_1 = require("../../shared/utils/text");
const queues_1 = require("../queue/queues");
const redis_1 = require("../queue/redis");
const jobs_1 = require("../db/jobs");
const prisma_1 = require("../db/prisma");
const scraping_1 = require("../scraping");
async function runScrapingWorker() {
    const redisUrl = (0, env_1.getEnv)("REDIS_URL", "");
    if (!redisUrl) {
        console.warn("[worker:scraping] REDIS_URL is missing; worker not started");
        return;
    }
    const prisma = (0, prisma_1.getPrismaClient)();
    const worker = new bullmq_1.Worker(queues_1.QUEUE_NAMES.scraping, async (job) => {
        const data = job.data;
        await (0, jobs_1.markJobProcessing)(data.jobId);
        const allowedTypes = new Set(["rss", "html", "api"]);
        if (!allowedTypes.has(data.sourceType)) {
            throw new Error("invalid_source_type");
        }
        const items = await (0, scraping_1.scrapeSource)({
            sourceType: data.sourceType,
            sourceRef: data.sourceRef,
            metadata: data.metadata ?? {},
        });
        const nowIso = new Date().toISOString();
        const facts = items
            .map((item) => {
            const content = item.content?.trim();
            if (!content) {
                return null;
            }
            return {
                tenantId: data.tenantId,
                topicId: data.topicId,
                sourceType: data.sourceType,
                sourceRef: item.sourceRef ?? data.sourceRef,
                content,
                contentHash: (0, hash_1.sha256)((0, text_1.normalizeText)(content)),
                metadata: {
                    ...(item.metadata ?? {}),
                    scraped_at: nowIso,
                },
            };
        })
            .filter((fact) => Boolean(fact));
        if (facts.length > 0) {
            await prisma.fact.createMany({
                data: facts,
                skipDuplicates: true,
            });
        }
        return { created: facts.length };
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
        await (0, jobs_1.markJobFailed)(job.id.toString(), err.message);
    });
    console.log("[worker:scraping] started", { queue: queues_1.QUEUE_NAMES.scraping });
}
