import { Prisma } from "@prisma/client";
import { Worker } from "bullmq";
import { QUEUE_NAMES } from "../queue/queues";
import { getRedisConnectionOptions } from "../queue/redis";
import {
  clearProjectPublicationState,
  getPublicationJobById,
  getLatestPublishedExternalId,
  markProjectPublished,
  updateProjectStatus,
  updatePublicationJob,
} from "../../studio/repository";
import { getPublisher } from "../../studio/publishers";
import { buildAssetPublicUrl } from "../../studio/orchestration";
import { getEnv } from "../../shared/utils/env";
import type { PublicationStatus } from "@prisma/client";
import type { PublishResult, PublicationTargetStatus } from "../../studio/types";
import { getPrismaClient } from "../db/prisma";
import { completeOperationForJob, failOperationForJob } from "./operation-hooks";
import { bullWorkerOptions, registerBullWorkerShutdown } from "./worker-runtime";
import { incrementCounter } from "../../studio/metrics";
import { classifyPublicationError, maxPublicationRetries, nextRetryDelay, verifyWebsitePublication } from "../../studio/publication";

const prisma = getPrismaClient();

type PublishingJobData = {
  publicationJobId: string;
};

type LoadedPublication = NonNullable<Awaited<ReturnType<typeof getPublicationJobById>>>;

type PublishingDependencies = {
  getPublicationJobById: typeof getPublicationJobById;
  updatePublicationJob: typeof updatePublicationJob;
  updateProjectStatus: typeof updateProjectStatus;
  getLatestPublishedExternalId: typeof getLatestPublishedExternalId;
  buildAssetPublicUrl: typeof buildAssetPublicUrl;
  getPublisher: typeof getPublisher;
  markProjectPublished: typeof markProjectPublished;
  clearProjectPublicationState: typeof clearProjectPublicationState;
  verifyWebsitePublication: typeof verifyWebsitePublication;
};

const defaultDependencies: PublishingDependencies = {
  getPublicationJobById,
  updatePublicationJob,
  updateProjectStatus,
  getLatestPublishedExternalId,
  buildAssetPublicUrl,
  getPublisher,
  markProjectPublished,
  clearProjectPublicationState,
  verifyWebsitePublication,
};

function readTargetStatus(publication: LoadedPublication): PublicationTargetStatus {
  const requestPayload =
    publication.requestPayload && typeof publication.requestPayload === "object"
      ? (publication.requestPayload as Record<string, unknown>)
      : null;
  return requestPayload?.targetStatus === "draft" ? "draft" : "publish";
}

function resolvePublicationStatus(
  publication: LoadedPublication,
  result: PublishResult,
): PublicationStatus {
  if (publication.action === "unpublish") {
    return "canceled";
  }

  if (result.effectiveTargetStatus === "publish") {
    return "published";
  }

  return readTargetStatus(publication) === "draft" ? "draft_synced" : "published";
}

async function runPublisherAction(
  publication: LoadedPublication,
  externalId: string | null,
  dependencies: PublishingDependencies,
): Promise<PublishResult> {
  const publisher = dependencies.getPublisher(publication.site);
  const assetUrl = await dependencies.buildAssetPublicUrl(
    publication.version.contentImage?.storagePath,
  );
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

export async function processPublishingJob(
  publicationJobId: string,
  dependencies: PublishingDependencies = defaultDependencies,
) {
  const publication = await dependencies.getPublicationJobById(null, publicationJobId);
  if (!publication) {
    throw new Error("publication_job_not_found");
  }

  await dependencies.updatePublicationJob(publication.id, {
    status: "processing",
  });

  await dependencies.updateProjectStatus(publication.tenantId, publication.projectId, "publish_queued");

  const externalId = await dependencies.getLatestPublishedExternalId(
    publication.tenantId,
    publication.siteId,
    publication.projectId,
  );
  const result = await runPublisherAction(publication, externalId, dependencies);
  const status = resolvePublicationStatus(publication, result);

  await dependencies.updatePublicationJob(publication.id, {
    status,
    externalId: result.externalId ?? externalId ?? null,
    externalUrl: result.externalUrl ?? null,
    responsePayload: result.responsePayload
      ? (result.responsePayload as unknown as Prisma.JsonObject)
      : null,
    publishedAt: status === "canceled" ? null : new Date(),
  });

  await syncDurablePublication(publication.id, status, result, externalId);

  if (status === "published") {
    await dependencies.markProjectPublished(
      publication.tenantId,
      publication.projectId,
      publication.versionId,
      "published",
    );
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

  await dependencies.clearProjectPublicationState(
    publication.tenantId,
    publication.projectId,
    publication.versionId,
  );
}

async function syncDurablePublication(
  publicationJobId: string,
  jobStatus: PublicationStatus,
  result: PublishResult,
  externalId: string | null,
): Promise<void> {
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
    const wasUnpublish =
      durable.metadata && typeof durable.metadata === "object"
        ? (durable.metadata as Record<string, unknown>).unpublishRequested === true
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

export async function runPublishingWorker() {
  const redisUrl = getEnv("REDIS_URL", "");
  if (!redisUrl) {
    console.warn("[worker:publishing] REDIS_URL is missing; worker not started");
    return;
  }

  const worker = new Worker(
    QUEUE_NAMES.publishing,
    async (job) => {
      const data = job.data as PublishingJobData;
      await processPublishingJob(data.publicationJobId);
    },
    {
      connection: getRedisConnectionOptions(),
      ...bullWorkerOptions("publishing", 1),
    },
  );

  worker.on("failed", async (job, err) => {
    const publicationJobId = String((job?.data as PublishingJobData | undefined)?.publicationJobId || "");
    if (publicationJobId) {
      await failOperationForJob(job?.data, err);
    }
    if (!publicationJobId) {
      return;
    }

    const publication = await getPublicationJobById(null, publicationJobId);
    if (!publication) {
      return;
    }

    await updatePublicationJob(publication.id, {
      status: "failed",
      error: err.message.slice(0, 500),
    });
    await updateProjectStatus(publication.tenantId, publication.projectId, "publish_failed");

    // Bounded retry with classification (same ladder as social publications):
    // transient errors retry with exponential backoff until maxPublicationRetries,
    // permanent errors and exhausted retries terminate.
    const durable = await prisma.publication.findFirst({ where: { publicationJobId } });
    if (durable) {
      const failureClass = classifyPublicationError(err.message);
      const retryCount = durable.retryCount + 1;
      const terminal = failureClass === "permanent" || retryCount > maxPublicationRetries();
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
          nextRetryAt: terminal ? null : new Date(Date.now() + nextRetryDelay(retryCount)),
        },
      });
    }

    incrementCounter("publications_failed_total", 1);
  });

  worker.on("completed", async (job) => {
    await completeOperationForJob(job?.data);
    incrementCounter("publications_published_total", 1);
  });

  registerBullWorkerShutdown(worker, "publishing");
  console.log("[worker:publishing] started", { queue: QUEUE_NAMES.publishing });
}
