"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.processPublishingJob = processPublishingJob;
exports.runPublishingWorker = runPublishingWorker;
const bullmq_1 = require("bullmq");
const queues_1 = require("../queue/queues");
const redis_1 = require("../queue/redis");
const repository_1 = require("../../studio/repository");
const publishers_1 = require("../../studio/publishers");
const orchestration_1 = require("../../studio/orchestration");
const env_1 = require("../../shared/utils/env");
const prisma_1 = require("../db/prisma");
const operation_hooks_1 = require("./operation-hooks");
const worker_runtime_1 = require("./worker-runtime");
const metrics_1 = require("../../studio/metrics");
const publication_1 = require("../../studio/publication");
const prisma = (0, prisma_1.getPrismaClient)();
const defaultDependencies = {
    getPublicationJobById: repository_1.getPublicationJobById,
    updatePublicationJob: repository_1.updatePublicationJob,
    updateProjectStatus: repository_1.updateProjectStatus,
    getLatestPublishedExternalId: repository_1.getLatestPublishedExternalId,
    buildAssetPublicUrl: orchestration_1.buildAssetPublicUrl,
    getPublisher: publishers_1.getPublisher,
    markProjectPublished: repository_1.markProjectPublished,
    clearProjectPublicationState: repository_1.clearProjectPublicationState,
    verifyWebsitePublication: publication_1.verifyWebsitePublication,
};
function readTargetStatus(publication) {
    const requestPayload = publication.requestPayload && typeof publication.requestPayload === "object"
        ? publication.requestPayload
        : null;
    return requestPayload?.targetStatus === "draft" ? "draft" : "publish";
}
function resolvePublicationStatus(publication, result) {
    if (publication.action === "unpublish") {
        return "canceled";
    }
    if (result.effectiveTargetStatus === "publish") {
        return "published";
    }
    return readTargetStatus(publication) === "draft" ? "draft_synced" : "published";
}
async function runPublisherAction(publication, externalId, dependencies) {
    const publisher = dependencies.getPublisher(publication.site);
    const assetUrl = await dependencies.buildAssetPublicUrl(publication.version.contentImage?.storagePath);
    const context = {
        site: publication.site,
        project: publication.project,
        version: publication.version,
        assetUrl,
    };
    if (publication.action === "unpublish") {
        if (!externalId) {
            throw new Error("publication_missing_external_id_for_unpublish");
        }
        return publisher.unpublish(context, externalId);
    }
    const targetStatus = readTargetStatus(publication);
    if (targetStatus === "draft") {
        return externalId
            ? publisher.updateDraft(context, externalId)
            : publisher.publishDraft(context);
    }
    return publisher.publish(context, externalId);
}
async function processPublishingJob(publicationJobId, dependencies = defaultDependencies) {
    const publication = await dependencies.getPublicationJobById(null, publicationJobId);
    if (!publication) {
        throw new Error("publication_job_not_found");
    }
    await dependencies.updatePublicationJob(publication.id, {
        status: "processing",
    });
    await dependencies.updateProjectStatus(publication.tenantId, publication.projectId, "publish_queued");
    const externalId = await dependencies.getLatestPublishedExternalId(publication.tenantId, publication.siteId, publication.projectId);
    const result = await runPublisherAction(publication, externalId, dependencies);
    const status = resolvePublicationStatus(publication, result);
    await dependencies.updatePublicationJob(publication.id, {
        status,
        externalId: result.externalId ?? externalId ?? null,
        externalUrl: result.externalUrl ?? null,
        responsePayload: result.responsePayload
            ? result.responsePayload
            : null,
        publishedAt: status === "canceled" ? null : new Date(),
    });
    await syncDurablePublication(publication.id, status, result, externalId);
    if (status === "published") {
        await dependencies.markProjectPublished(publication.tenantId, publication.projectId, publication.versionId, "published");
        // Post-publish verification: a publisher response alone is not enough.
        // Remote success must never be replayed, so verification never mutates
        // the publication state back to a retryable status.
        const durable = await prisma.publication.findFirst({
            where: { publicationJobId: publication.id },
        });
        if (durable) {
            await dependencies.verifyWebsitePublication(publication.tenantId, durable.id);
        }
        return;
    }
    await dependencies.clearProjectPublicationState(publication.tenantId, publication.projectId, publication.versionId);
}
async function syncDurablePublication(publicationJobId, jobStatus, result, externalId) {
    const durable = await prisma.publication.findFirst({
        where: { publicationJobId },
    });
    if (!durable) {
        return;
    }
    if (jobStatus === "published") {
        await prisma.publication.update({
            where: { id: durable.id },
            data: {
                status: "published",
                publishedAt: new Date(),
                externalId: result.externalId ?? externalId ?? durable.externalId,
                externalUrl: result.externalUrl ?? durable.externalUrl,
                lastError: null,
                failureReason: null,
                failureClass: null,
            },
        });
        return;
    }
    if (jobStatus === "canceled") {
        const wasUnpublish = durable.metadata && typeof durable.metadata === "object"
            ? durable.metadata.unpublishRequested === true
            : false;
        await prisma.publication.update({
            where: { id: durable.id },
            data: wasUnpublish
                ? { status: "unpublished", publishedAt: null }
                : { status: "canceled", lastError: null },
        });
        return;
    }
    if (jobStatus === "draft_synced") {
        await prisma.publication.update({
            where: { id: durable.id },
            data: {
                status: "ready",
                externalId: result.externalId ?? externalId ?? durable.externalId,
                externalUrl: result.externalUrl ?? durable.externalUrl,
            },
        });
    }
}
async function runPublishingWorker() {
    const redisUrl = (0, env_1.getEnv)("REDIS_URL", "");
    if (!redisUrl) {
        console.warn("[worker:publishing] REDIS_URL is missing; worker not started");
        return;
    }
    const worker = new bullmq_1.Worker(queues_1.QUEUE_NAMES.publishing, async (job) => {
        const data = job.data;
        await processPublishingJob(data.publicationJobId);
    }, {
        connection: (0, redis_1.getRedisConnectionOptions)(),
        ...(0, worker_runtime_1.bullWorkerOptions)("publishing", 1),
    });
    worker.on("failed", async (job, err) => {
        const publicationJobId = String(job?.data?.publicationJobId || "");
        if (publicationJobId) {
            await (0, operation_hooks_1.failOperationForJob)(job?.data, err);
        }
        if (!publicationJobId) {
            return;
        }
        const publication = await (0, repository_1.getPublicationJobById)(null, publicationJobId);
        if (!publication) {
            return;
        }
        await (0, repository_1.updatePublicationJob)(publication.id, {
            status: "failed",
            error: err.message.slice(0, 500),
        });
        await (0, repository_1.updateProjectStatus)(publication.tenantId, publication.projectId, "publish_failed");
        // Bounded retry with classification (same ladder as social publications):
        // transient errors retry with exponential backoff until maxPublicationRetries,
        // permanent errors and exhausted retries terminate.
        const durable = await prisma.publication.findFirst({ where: { publicationJobId } });
        if (durable) {
            const failureClass = (0, publication_1.classifyPublicationError)(err.message);
            const retryCount = durable.retryCount + 1;
            const terminal = failureClass === "permanent" || retryCount > (0, publication_1.maxPublicationRetries)();
            await prisma.publication.update({
                where: { id: durable.id },
                data: {
                    status: "failed",
                    retryCount,
                    lastError: err.message.slice(0, 500),
                    failureClass,
                    failureReason: terminal
                        ? failureClass === "permanent"
                            ? "permanent_failure"
                            : "retries_exhausted"
                        : "awaiting_retry",
                    nextRetryAt: terminal ? null : new Date(Date.now() + (0, publication_1.nextRetryDelay)(retryCount)),
                },
            });
        }
        (0, metrics_1.incrementCounter)("publications_failed_total", 1);
    });
    worker.on("completed", async (job) => {
        await (0, operation_hooks_1.completeOperationForJob)(job?.data);
        (0, metrics_1.incrementCounter)("publications_published_total", 1);
    });
    (0, worker_runtime_1.registerBullWorkerShutdown)(worker, "publishing");
    console.log("[worker:publishing] started", { queue: queues_1.QUEUE_NAMES.publishing });
}
