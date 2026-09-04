import { Worker } from "bullmq";
import { getNumberEnv } from "../../shared/utils/env";
import { getPrismaClient } from "../db/prisma";
import { QUEUE_NAMES } from "../queue/queues";
import { getRedisConnectionOptions } from "../queue/redis";
import { runSocialGenerationJob, type SocialGenerationJobData } from "../../studio/social";
import { failAttempt, startAttempt, succeedAttempt } from "../../studio/publication";
import { buildDryRunResult, dryRunGate, getSocialPublisher, readSocialCredentials } from "../../studio/social-publishers";
import { socialAssetUrlForVersion } from "../../studio/social";
import { writeAudit } from "../../studio/audit";
import { structuredEvent } from "../../shared/utils/logger";
import { completeOperationForJob, failOperationForJob } from "./operation-hooks";
import { bullWorkerOptions, registerBullWorkerShutdown } from "./worker-runtime";
import { getSocialIntegrationProvider, type SocialPublishInput } from "../../studio/social-provider";
import { resolveAccountCredentials, runConnectionHealthCheck } from "../../studio/social-connections";
import { assertRedisConfigured } from "../queue/redis";

const prisma = getPrismaClient();

type SocialPublishJobData = {
  kind: "publish";
  attemptId: string;
  publicationId: string;
};

type SocialGenerateJobData = SocialGenerationJobData & { kind: "generate" };

type SocialUnpublishJobData = {
  kind: "unpublish";
  attemptId: string;
  publicationId: string;
};

type SocialJobData = SocialGenerateJobData | SocialPublishJobData | SocialUnpublishJobData;

async function buildPublishInput(publication: Awaited<ReturnType<typeof loadPublication>>): Promise<SocialPublishInput> {
  const imageUrl = await socialAssetUrlForVersion(publication.versionId, publication.tenantId);
  const thread = await prisma.socialContent.findMany({
    where: { tenantId: publication.tenantId, versionId: publication.versionId, channel: "x", contentType: "x_thread" },
    orderBy: { threadPosition: "asc" },
  });

  const text = publication.socialContent?.body ?? "";
  const mediaType =
    publication.account.platform === "x"
      ? publication.socialContent?.contentType === "x_thread" && thread.length > 0
        ? "text"
        : imageUrl
          ? "photo"
          : "text"
      : publication.socialContent?.contentType === "instagram_story"
        ? "story"
        : "photo";

  return {
    text,
    mediaUrls: imageUrl ? [imageUrl] : [],
    mediaType,
    thread: thread.length > 0 ? thread.map((entry) => ({ body: entry.body })) : undefined,
  };
}

type LoadedPublication = {
  id: string;
  tenantId: string;
  versionId: string;
  channel: string;
  externalId: string | null;
  account: {
    id: string;
    platform: "x" | "instagram" | "website";
    credentialsRef: string | null;
    provider: string;
    providerProfileId: string | null;
    providerAccountId: string | null;
    credentialsCiphertext: string | null;
  };
  socialContent: { body: string; contentType: string } | null;
};

async function loadPublication(publicationId: string): Promise<LoadedPublication> {
  const publication = await prisma.publication.findUnique({
    where: { id: publicationId },
    include: { account: true, socialContent: true },
  });
  if (!publication || !publication.account || publication.account.platform === "website") {
    throw new Error("publication_or_account_not_found");
  }
  return publication as unknown as LoadedPublication;
}

async function processPublish(data: SocialPublishJobData) {
  const publication = await loadPublication(data.publicationId);
  const account = publication.account;

  await startAttempt(publication.tenantId, data.attemptId);

  let result;
  if (account.provider && account.provider !== "legacy") {
    const provider = getSocialIntegrationProvider(account.provider);
    const credentials = resolveAccountCredentials(account as never);
    const dryRun = dryRunGate(Boolean(credentials));
    if (dryRun.enabled || !credentials) {
      const payload = await buildPublishInput(publication);
      result = buildDryRunResult(account.platform, `${payload.text}|${payload.mediaUrls.join(",")}`);
    } else {
      const payload = await buildPublishInput(publication);
      const validation = provider.validateContent(payload, account.platform as "x" | "instagram");
      if (!validation.valid) {
        throw new Error(`platform_content_invalid: ${validation.errors.join("; ")}`);
      }
      result = await provider.publish(payload, credentials, account);
    }
  } else {
    const credentials = readSocialCredentials(account.credentialsRef);
    const dryRun = dryRunGate(Boolean(credentials));
    const publisher = getSocialPublisher(account.platform as "x" | "instagram");
    const payload = await buildPublishInput(publication);
    if (dryRun.enabled || !credentials) {
      result = buildDryRunResult(account.platform, `${payload.text}|${payload.mediaUrls.join(",")}`);
    } else {
      const legacyPayload = {
        text: payload.text,
        imageUrls: payload.mediaUrls,
        mediaType: payload.mediaType,
        thread: payload.thread,
      };
      result = await publisher.publish(legacyPayload, credentials);
    }
  }

  structuredEvent("social.publish.completed", {
    tenantId: publication.tenantId,
    publicationId: publication.id,
    platform: account.platform,
    provider: account.provider,
    externalId: result.externalId,
    dryRun: result.dryRun,
  });

  await succeedAttempt(publication.tenantId, data.attemptId, {
    externalId: result.externalId,
    externalUrl: result.externalUrl,
    responsePayload: result.responsePayload ?? undefined,
  });
}

async function processUnpublish(data: SocialUnpublishJobData) {
  const publication = await loadPublication(data.publicationId);
  const account = publication.account;
  if (!publication.externalId) {
    throw new Error("publication_or_external_id_not_found");
  }

  await startAttempt(publication.tenantId, data.attemptId);

  let result;
  if (account.provider && account.provider !== "legacy") {
    const provider = getSocialIntegrationProvider(account.provider);
    const credentials = resolveAccountCredentials(account as never);
    const dryRun = dryRunGate(Boolean(credentials));
    if (dryRun.enabled || !credentials) {
      result = buildDryRunResult(account.platform, `delete:${publication.externalId}`);
    } else {
      result = await provider.deletePublication(publication.externalId, credentials, account);
    }
  } else {
    const credentials = readSocialCredentials(account.credentialsRef);
    const dryRun = dryRunGate(Boolean(credentials));
    const publisher = getSocialPublisher(account.platform as "x" | "instagram");
    if (!publisher.capabilities.delete && !publisher.capabilities.unpublish) {
      throw new Error(`${account.platform}_unpublish_not_supported`);
    }
    if (dryRun.enabled || !credentials) {
      result = buildDryRunResult(account.platform, `delete:${publication.externalId}`);
    } else {
      result = await publisher.delete(publication.externalId, credentials);
    }
  }

  await succeedAttempt(publication.tenantId, data.attemptId, {
    externalId: null,
    externalUrl: null,
    responsePayload: result.responsePayload ?? undefined,
  });

  await prisma.publication.update({
    where: { id: publication.id },
    data: { status: "unpublished", publishedAt: null },
  });

  await writeAudit({
    tenantId: publication.tenantId,
    action: "publication.unpublished",
    entityType: "publication",
    entityId: publication.id,
    actorType: "automation",
    metadata: { channel: publication.channel },
  });
}

export async function runSocialWorker() {
  assertRedisConfigured();

  const worker = new Worker(
    QUEUE_NAMES.social,
    async (job) => {
      const data = job.data as SocialJobData;
      if (data.kind === "generate") {
        await runSocialGenerationJob(data);
        return;
      }
      if (data.kind === "unpublish") {
        await processUnpublish(data);
        return;
      }
      await processPublish(data);
    },
    {
      connection: getRedisConnectionOptions(),
      ...bullWorkerOptions("social", 1),
    },
  );

  worker.on("failed", async (job, err) => {
    await failOperationForJob(job?.data, err);
    const data = job?.data as SocialJobData | undefined;
    if (data && data.kind !== "generate" && data.attemptId) {
      const attempt = await prisma.publicationAttempt.findFirst({ where: { id: data.attemptId } });
      if (attempt) {
        await failAttempt(attempt.tenantId, data.attemptId, err);
      }
      structuredEvent("social.publish.failed", { attemptId: data.attemptId, error: err.message }, "error");
    }
  });

  worker.on("completed", async (job) => {
    await completeOperationForJob(job?.data);
  });

  // Periodic social connection health checks so broken tokens surface in the
  // UI before a scheduled publication fails.
  let healthRunning = false;
  const runHealthCheck = async () => {
    if (healthRunning) {
      return;
    }
    healthRunning = true;
    try {
      await runConnectionHealthCheck();
    } catch (error) {
      structuredEvent("social.connection.health.error", { error: error instanceof Error ? error.message : String(error) }, "error");
    } finally {
      healthRunning = false;
    }
  };
  const healthIntervalMs = Math.max(60_000, getNumberEnv("SOCIAL_CONNECTION_HEALTH_MS", 6 * 3_600_000));
  const healthTimer = setInterval(() => void runHealthCheck(), healthIntervalMs);
  setTimeout(() => void runHealthCheck(), 30_000);

  // Shared graceful shutdown: close the BullMQ worker (finish or release the
  // in-flight job), clear the health timer, then exit.
  registerBullWorkerShutdown(worker, "social");
  for (const signal of ["SIGTERM", "SIGINT"] as const) {
    process.on(signal, () => {
      clearInterval(healthTimer);
    });
  }

  console.log("[worker:social] started", { queue: QUEUE_NAMES.social, healthIntervalMs });
}
