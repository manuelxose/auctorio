import { Worker } from "bullmq";
import { getEnv } from "../../shared/utils/env";
import { getPrismaClient } from "../db/prisma";
import { QUEUE_NAMES } from "../queue/queues";
import { getRedisConnectionOptions } from "../queue/redis";
import { runSocialGenerationJob, type SocialGenerationJobData } from "../../studio/social";
import { failAttempt, startAttempt, succeedAttempt } from "../../studio/publication";
import { readSocialCredentials, getSocialPublisher } from "../../studio/social-publishers";
import { socialAssetUrlForVersion } from "../../studio/social";
import { writeAudit } from "../../studio/audit";

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

async function processPublish(data: SocialPublishJobData) {
  const publication = await prisma.publication.findUnique({
    where: { id: data.publicationId },
    include: {
      account: true,
      socialContent: true,
      project: { select: { id: true, title: true } },
      version: { include: { contentImage: { include: { assetVariants: true } } } },
    },
  });
  if (!publication || !publication.account || publication.account.platform === "website") {
    throw new Error("publication_or_account_not_found");
  }

  await startAttempt(publication.tenantId, data.attemptId);

  const credentials = readSocialCredentials(publication.account.credentialsRef);
  if (!credentials) {
    throw new Error(`missing_publishing_credentials for ${publication.account.platform} account ${publication.account.id}`);
  }

  const publisher = getSocialPublisher(publication.account.platform as "x" | "instagram");
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

  const payload = {
    text,
    imageUrls: imageUrl ? [imageUrl] : [],
    mediaType: mediaType as "text" | "photo" | "carousel" | "story",
    thread:
      thread.length > 0
        ? thread.map((entry) => ({ body: entry.body }))
        : undefined,
  };

  const result = await publisher.publish(payload, credentials);

  await succeedAttempt(publication.tenantId, data.attemptId, {
    externalId: result.externalId,
    externalUrl: result.externalUrl,
    responsePayload: result.responsePayload ?? undefined,
  });
}

async function processUnpublish(data: SocialUnpublishJobData) {
  const publication = await prisma.publication.findUnique({
    where: { id: data.publicationId },
    include: { account: true },
  });
  if (!publication || !publication.account || !publication.externalId) {
    throw new Error("publication_or_external_id_not_found");
  }

  await startAttempt(publication.tenantId, data.attemptId);

  const credentials = readSocialCredentials(publication.account.credentialsRef);
  if (!credentials) {
    throw new Error(`missing_publishing_credentials for ${publication.account.platform}`);
  }

  const publisher = getSocialPublisher(publication.account.platform as "x" | "instagram");
  if (!publisher.capabilities.delete && !publisher.capabilities.unpublish) {
    throw new Error(`${publication.account.platform}_unpublish_not_supported`);
  }

  const result = await publisher.delete(publication.externalId, credentials);

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
  const redisUrl = getEnv("REDIS_URL", "");
  if (!redisUrl) {
    console.warn("[worker:social] REDIS_URL is missing; worker not started");
    return;
  }

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
    },
  );

  worker.on("failed", async (job, err) => {
    const data = job?.data as SocialJobData | undefined;
    if (data && data.kind !== "generate" && data.attemptId) {
      const attempt = await prisma.publicationAttempt.findFirst({ where: { id: data.attemptId } });
      if (attempt) {
        await failAttempt(attempt.tenantId, data.attemptId, err);
      }
    }
  });

  const shutdown = async () => {
    await worker.close();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown());
  process.on("SIGINT", () => void shutdown());

  console.log("[worker:social] started", { queue: QUEUE_NAMES.social });
}
