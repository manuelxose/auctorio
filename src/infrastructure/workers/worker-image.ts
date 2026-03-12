import { Prisma } from "@prisma/client";
import { Worker } from "bullmq";
import { getEnv, getNumberEnv } from "../../shared/utils/env";
import { QUEUE_NAMES } from "../queue/queues";
import { getRedisConnectionOptions } from "../queue/redis";
import { markJobDone, markJobFailed, markJobProcessing } from "../db/jobs";
import { getPrismaClient } from "../db/prisma";
import { getImageProvider } from "../ai/image";
import { resolveImagePrompt } from "../../studio/prompts";
import { saveImageAsset } from "../storage/local-storage";
import { syncImageResultToStudio } from "../../studio/orchestration";

type ImageJobData = {
  jobId: string;
  tenantId: string;
  topicId: string;
  contentImageId: string;
  mode: "contextual" | "independent";
  textId?: string;
  options?: Record<string, unknown>;
};

function parseSize(size?: string): { width?: number; height?: number } {
  if (!size) {
    return {};
  }
  const match = size.match(/^(\d+)x(\d+)$/);
  if (!match) {
    return {};
  }
  return { width: Number.parseInt(match[1], 10), height: Number.parseInt(match[2], 10) };
}

function computeImageCost(): number {
  return getNumberEnv("IMAGE_COST_PER_GEN_USD", 0);
}

function extensionFromContentType(contentType: string): string {
  if (contentType === "image/jpeg") {
    return ".jpg";
  }
  if (contentType === "image/webp") {
    return ".webp";
  }
  return ".png";
}

export async function runImageWorker() {
  const redisUrl = getEnv("REDIS_URL", "");
  if (!redisUrl) {
    console.warn("[worker:image] REDIS_URL is missing; worker not started");
    return;
  }

  const prisma = getPrismaClient();
  const provider = getImageProvider();

  const worker = new Worker(
    QUEUE_NAMES.image,
    async (job) => {
      const data = job.data as ImageJobData;
      await markJobProcessing(data.jobId);
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

      let textOutput: string | null = null;
      if (data.textId) {
        const text = await prisma.contentText.findFirst({
          where: { id: data.textId, tenantId: data.tenantId },
        });
        textOutput = text?.output ?? null;
      }

      const prompt = await resolveImagePrompt(prisma, {
        tenantId: data.tenantId,
        siteId:
          typeof data.options?.site_id === "string" && data.options.site_id.trim()
            ? data.options.site_id.trim()
            : null,
        promptPresetVersionId:
          typeof data.options?.promptPresetVersionId === "string" &&
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
      const stored = await saveImageAsset({
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
          usageJson: Prisma.JsonNull,
        },
      });

      await syncImageResultToStudio(data.tenantId, data.contentImageId);
    },
    {
      connection: getRedisConnectionOptions(),
    },
  );

  worker.on("completed", async (job) => {
    if (!job?.id) {
      return;
    }
    await markJobDone(job.id.toString());
  });

  worker.on("failed", async (job, err) => {
    if (!job?.id) {
      return;
    }
    const data = job.data as ImageJobData | undefined;
    await markJobFailed(job.id.toString(), err.message);
    if (data?.contentImageId) {
      await prisma.contentImage.update({
        where: { id: data.contentImageId },
        data: { status: "failed", error: err.message },
      });
    }
  });

  console.log("[worker:image] started", { queue: QUEUE_NAMES.image });
}
