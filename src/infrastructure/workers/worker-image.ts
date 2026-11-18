import { withAiTenant } from "../ai/ai-settings";
import { Prisma } from "@prisma/client";
import { Worker } from "bullmq";
import { getEnv, getNumberEnv } from "../../shared/utils/env";
import { QUEUE_NAMES } from "../queue/queues";
import { getRedisConnectionOptions } from "../queue/redis";
import { markJobDone, markJobFailed, markJobProcessing } from "../db/jobs";
import { getPrismaClient } from "../db/prisma";
import { getImageProvider, ImageDownloadError, ImageGenerationResult } from "../ai/image";
import { resolveImagePrompt } from "../../studio/prompts";
import { saveImageAsset } from "../storage/local-storage";
import { buildImageDerivatives, stripImageMetadata } from "../storage/image-processing";
import { imageStylePrompt, infographicPrompt, IMAGE_STYLES, type ImageStyle } from "../../studio/editorial-engine/visuals";
import { syncImageResultToStudio, syncInlineImageToVersion } from "../../studio/orchestration";
import { completeOperationForJob, failOperationForJob } from "./operation-hooks";
import { bullWorkerOptions, registerBullWorkerShutdown } from "./worker-runtime";
import { evaluateAiSpend, recordAiSpend } from "../../studio/cost-budgets";

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

function isImageModerationRejection(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /status=451|prohibited or sensitive content|sensitive content|content policy/i.test(message);
}

function buildModerationFallbackPrompt(siteName: string): string {
  const brand = siteName.trim() || "una redacción digital";
  return [
    `Ilustración editorial genérica y neutral para ${brand}.`,
    "Escritorio de redacción moderno con pantallas, periódicos y titulares abstractos e ilegibles.",
    "Sin personas reales, sin políticos, sin símbolos institucionales, sin texto legible.",
    "Estilo limpio, profesional, colores discretos, composición horizontal.",
  ].join(" ");
}

export async function runImageWorker() {
  const redisUrl = getEnv("REDIS_URL", "");
  if (!redisUrl) {
    console.warn("[worker:image] REDIS_URL is missing; worker not started");
    return;
  }

  const prisma = getPrismaClient();
  const worker = new Worker(
    QUEUE_NAMES.image,
    async (job) => withAiTenant((job.data as ImageJobData).tenantId, async () => {
      const data = job.data as ImageJobData;
      // Resolved per job: each workspace may have chosen a different image model (Settings -> AI).
      const provider = getImageProvider();
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

      // Cost control gate: never exceed hard AI budget limits.
      const budget = await evaluateAiSpend({
        tenantId: data.tenantId,
        siteId: typeof data.options?.site_id === "string" ? data.options.site_id : null,
        contentType: "image_generation",
        kind: "image_generation",
      });
      if (!budget.allowed) {
        throw new Error(`budget_exceeded: ${budget.reason}`);
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
      const role = data.options?.image_role;
      const section = (role === "inline" || role === "infographic") && typeof data.options?.section === "string" ? data.options.section : null;
      // Site visuals settings (M6): style per role and the site's own image instructions.
      const style = IMAGE_STYLES.includes(data.options?.image_style as ImageStyle) ? (data.options?.image_style as ImageStyle) : null;
      const styleLine = imageStylePrompt(style, typeof data.options?.image_instructions === "string" ? data.options.image_instructions : "");
      let usedPrompt = role === "infographic" && section && typeof data.options?.section_text === "string"
        ? [infographicPrompt(section, data.options.section_text, data.options?.language === "en" ? "en" : "es"), imageStylePrompt(null, typeof data.options?.image_instructions === "string" ? data.options.image_instructions : "")].filter(Boolean).join("\n")
        : [
            section
              ? `${prompt.userPrompt.replace(/^.*hero image.*$/gim, "").trim()}\nCreate an in-article editorial image that illustrates the section "${section}". Its own composition, distinct from the hero. No text, logos or watermarks in the image.`
              : prompt.userPrompt,
            styleLine,
          ].filter(Boolean).join("\n");
      let result: ImageGenerationResult;
      try {
        result = await provider.generate({
          prompt: usedPrompt,
          size,
        });
      } catch (error) {
        if (!isImageModerationRejection(error)) {
          throw error;
        }
        usedPrompt = buildModerationFallbackPrompt(
          typeof data.options?.site_name === "string" ? data.options.site_name : "",
        );
        result = await provider.generate({
          prompt: usedPrompt,
          size,
        });
      }

      const extension = extensionFromContentType(result.contentType);
      const clean = await stripImageMetadata(result.bytes);
      const stored = await saveImageAsset({
        tenantId: data.tenantId,
        contentImageId: data.contentImageId,
        bytes: clean.bytes,
        extension,
      });

      const storageRoot = getEnv("STORAGE_ROOT", "/var/www/auctorio/storage");
      const processed = await buildImageDerivatives({
        storageRoot,
        originalRelativePath: stored.relativePath,
        tenantId: data.tenantId,
        contentImageId: data.contentImageId,
      });

      const parsed = parseSize(size);
      const costUsd = computeImageCost();

      await recordAiSpend({
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
          metadataStripped: clean.stripped,
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
          usageJson: Prisma.JsonNull,
        },
      });

      if (section) {
        await syncInlineImageToVersion(data.tenantId, data.contentImageId);
      } else {
        await syncImageResultToStudio(data.tenantId, data.contentImageId);
      }
    }),
    {
      connection: getRedisConnectionOptions(),
      ...bullWorkerOptions("image", 1),
    },
  );

  worker.on("completed", async (job) => {
    if (!job?.id) {
      return;
    }
    await markJobDone(job.id.toString());
    await completeOperationForJob(job.data);
  });

  worker.on("failed", async (job, err) => {
    if (!job?.id) {
      return;
    }
    const data = job.data as ImageJobData | undefined;
    await markJobFailed(job.id.toString(), err.message);
    await failOperationForJob(job.data, err);
    if (data?.contentImageId) {
      const retryable = err instanceof ImageDownloadError && err.retryable;
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
          if (data.options?.image_role === "inline") {
            await syncInlineImageToVersion(data.tenantId, data.contentImageId);
          } else {
            await syncImageResultToStudio(data.tenantId, data.contentImageId);
          }
        } catch (qaError) {
          console.warn("[worker:image] qa-after-failure skipped", qaError instanceof Error ? qaError.message : String(qaError));
        }
      }
    }
  });

  registerBullWorkerShutdown(worker, "image");
  console.log("[worker:image] started", { queue: QUEUE_NAMES.image });
}
