import { Worker } from "bullmq";
import { QUEUE_NAMES } from "../queue/queues";
import { getRedisConnectionOptions } from "../queue/redis";
import {
  clearProjectPublicationState,
  getLatestPublishedExternalId,
  markProjectPublished,
  updateProjectStatus,
} from "../../studio/repository";
import { getPublisher } from "../../studio/publishers";
import { buildAssetPublicUrl } from "../../studio/orchestration";
import type { PublishResult } from "../../studio/types";
import { getPrismaClient } from "../db/prisma";
import { completeOperationForJob, failOperationForJob } from "./operation-hooks";
import { bullWorkerOptions, registerBullWorkerShutdown } from "./worker-runtime";
import { incrementCounter } from "../../studio/metrics";
import { failAttempt, startAttempt, startWebsiteAttempt, succeedAttempt, verifyWebsitePublication } from "../../studio/publication";
import { assertRedisConfigured } from "../queue/redis";
import { structuredEvent } from "../../shared/utils/logger";

const prisma = getPrismaClient();

/** One website delivery: the attempt created by startWebsiteAttempt. */
export type PublishingJobData = {
  attemptId: string;
  publicationId: string;
  operationId?: string;
};

async function loadPublication(publicationId: string) {
  return prisma.publication.findUnique({
    where: { id: publicationId },
    include: {
      site: true,
      project: true,
      version: { include: { contentImage: true, contentText: true, derivatives: true } },
    },
  });
}

type LoadedPublication = NonNullable<Awaited<ReturnType<typeof loadPublication>>>;

type PublishingDependencies = {
  loadPublication: (publicationId: string) => Promise<LoadedPublication | null>;
  startAttempt: (tenantId: string, attemptId: string) => Promise<unknown>;
  succeedAttempt: typeof succeedAttempt;
  /** Persists a remote id a failed attempt already created, so the retry finishes that post. */
  recordExternalId: (publicationId: string, externalId: string) => Promise<unknown>;
  getLatestPublishedExternalId: typeof getLatestPublishedExternalId;
  buildAssetPublicUrl: typeof buildAssetPublicUrl;
  getPublisher: typeof getPublisher;
  markProjectPublished: typeof markProjectPublished;
  clearProjectPublicationState: typeof clearProjectPublicationState;
  verifyWebsitePublication: typeof verifyWebsitePublication;
};

const defaultDependencies: PublishingDependencies = {
  loadPublication,
  startAttempt,
  succeedAttempt,
  recordExternalId: (id, externalId) => prisma.publication.update({ where: { id }, data: { externalId } }),
  getLatestPublishedExternalId,
  buildAssetPublicUrl,
  getPublisher,
  markProjectPublished,
  clearProjectPublicationState,
  verifyWebsitePublication,
};

function readRequest(publication: LoadedPublication) {
  const metadata = publication.metadata && typeof publication.metadata === "object" ? (publication.metadata as Record<string, unknown>) : {};
  return {
    unpublish: metadata.unpublishRequested === true,
    targetStatus: metadata.targetStatus === "draft" ? ("draft" as const) : ("publish" as const),
  };
}

export async function processPublishingJob(data: Pick<PublishingJobData, "attemptId" | "publicationId">, dependencies: PublishingDependencies = defaultDependencies) {
  const publication = await dependencies.loadPublication(data.publicationId);
  if (!publication || !publication.site || !publication.siteId) {
    throw new Error("publication_not_found");
  }
  const { site } = publication;
  await dependencies.startAttempt(publication.tenantId, data.attemptId);

  const { unpublish, targetStatus } = readRequest(publication);
  // The row's own remote id first (a failed attempt may have created the post), then any earlier delivery of the project.
  const externalId =
    publication.externalId ?? (await dependencies.getLatestPublishedExternalId(publication.tenantId, publication.siteId, publication.projectId));

  const publisher = dependencies.getPublisher(site);
  const context = {
    site,
    project: publication.project,
    version: publication.version,
    assetUrl: await dependencies.buildAssetPublicUrl(publication.version.contentImage?.storagePath),
  };

  let result: PublishResult;
  try {
    if (unpublish) {
      if (!externalId) {
        throw new Error("publication_missing_external_id_for_unpublish");
      }
      result = await publisher.unpublish(context, externalId);
    } else if (targetStatus === "draft") {
      result = externalId ? await publisher.updateDraft(context, externalId) : await publisher.publishDraft(context);
    } else {
      result = await publisher.publish(context, externalId);
    }
  } catch (error) {
    const remoteId = (error as { externalId?: unknown }).externalId;
    if (typeof remoteId === "string" && remoteId && !externalId) {
      await dependencies.recordExternalId(publication.id, remoteId);
    }
    throw error;
  }

  // A provider that cannot keep drafts publishes anyway: then it is published.
  const draft = !unpublish && targetStatus === "draft" && result.effectiveTargetStatus !== "publish";
  await dependencies.succeedAttempt(publication.tenantId, data.attemptId, {
    externalId: result.externalId ?? externalId ?? null,
    externalUrl: result.externalUrl ?? null,
    responsePayload: (result.responsePayload as Record<string, unknown> | undefined) ?? null,
    draft,
  });

  if (!unpublish && !draft) {
    await dependencies.markProjectPublished(publication.tenantId, publication.projectId, publication.versionId, "published");
    // Remote success must never be replayed, so verification never moves the row back to a retryable status.
    await dependencies.verifyWebsitePublication(publication.tenantId, publication.id);
    return;
  }

  await dependencies.clearProjectPublicationState(publication.tenantId, publication.projectId, publication.versionId);
}

/**
 * shortcut: messages enqueued before M3b carry a PublicationJob id. They restart as a
 * fresh attempt on their linked publication; jobs without one are dropped. Delete in M6.
 */
async function translateLegacyMessage(publicationJobId: string): Promise<void> {
  const publication = await prisma.publication.findFirst({ where: { publicationJobId } });
  if (!publication || ["published", "unpublished", "deleted", "canceled"].includes(publication.status)) {
    structuredEvent("publishing.legacy_message.dropped", { publicationJobId, publicationId: publication?.id ?? null }, "warn");
    return;
  }
  // The legacy link set the row to publishing; free it so the claim can take it.
  await prisma.publication.updateMany({ where: { id: publication.id, status: "publishing" }, data: { status: "failed", lastError: "requeued_after_m3b" } });
  await startWebsiteAttempt(publication.id, { requestedBy: "legacy_queue" });
}

export async function runPublishingWorker() {
  assertRedisConfigured();

  const worker = new Worker(
    QUEUE_NAMES.publishing,
    async (job) => {
      const data = job.data as Partial<PublishingJobData> & { publicationJobId?: string };
      if (!data.attemptId && data.publicationJobId) {
        await translateLegacyMessage(data.publicationJobId);
        return;
      }
      if (!data.attemptId || !data.publicationId) {
        throw new Error("publishing_job_invalid_payload");
      }
      await processPublishingJob({ attemptId: data.attemptId, publicationId: data.publicationId });
    },
    {
      connection: getRedisConnectionOptions(),
      ...bullWorkerOptions("publishing", 1),
    },
  );

  worker.on("failed", async (job, err) => {
    await failOperationForJob(job?.data, err);
    const attemptId = (job?.data as Partial<PublishingJobData> | undefined)?.attemptId;
    if (!attemptId) {
      return;
    }
    const attempt = await prisma.publicationAttempt.findFirst({ where: { id: attemptId }, include: { publication: true } });
    if (!attempt) {
      return;
    }
    // Same bounded retry ladder and circuit breaker as social publications.
    await failAttempt(attempt.tenantId, attempt.id, err);
    await updateProjectStatus(attempt.tenantId, attempt.publication.projectId, "publish_failed");
    incrementCounter("publications_failed_total", 1);
  });

  worker.on("completed", async (job) => {
    await completeOperationForJob(job?.data);
    incrementCounter("publications_published_total", 1);
  });

  registerBullWorkerShutdown(worker, "publishing");
  console.log("[worker:publishing] started", { queue: QUEUE_NAMES.publishing });
}
