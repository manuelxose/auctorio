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
      error: err.message,
    });
    await updateProjectStatus(publication.tenantId, publication.projectId, "publish_failed");

    await prisma.publication.updateMany({
      where: { publicationJobId },
      data: {
        status: "failed",
        lastError: err.message,
        failureClass: "transient",
        failureReason: "website_publish_failed",
        nextRetryAt: new Date(Date.now() + 60_000),
      },
    });
  });

  worker.on("completed", async (job) => {
    await completeOperationForJob(job?.data);
  });

  console.log("[worker:publishing] started", { queue: QUEUE_NAMES.publishing });
}
