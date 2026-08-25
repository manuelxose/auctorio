import { Prisma } from "@prisma/client";
import { Worker } from "bullmq";
import { getEnv, getNumberEnv } from "../../shared/utils/env";
import { QUEUE_NAMES } from "../queue/queues";
import { getRedisConnectionOptions } from "../queue/redis";
import { markJobDone, markJobFailed, markJobProcessing } from "../db/jobs";
import { getPrismaClient } from "../db/prisma";
import { getTextProvider } from "../ai/text";
import { resolveTextPrompt } from "../../studio/prompts";
import { syncTextResultToStudio } from "../../studio/orchestration";
import { completeOperationForJob, failOperationForJob } from "./operation-hooks";

type TextJobData = {
  jobId: string;
  tenantId: string;
  topicId: string;
  contentTextId: string;
  type: "seo" | "instagram";
  language: "es" | "en";
  options?: Record<string, unknown>;
};

function computeTextCost(usage?: { promptTokens?: number; completionTokens?: number }): number {
  const inputRate = getNumberEnv("TEXT_COST_PER_1K_INPUT_USD", 0);
  const outputRate = getNumberEnv("TEXT_COST_PER_1K_OUTPUT_USD", 0);
  if (!usage?.promptTokens && !usage?.completionTokens) {
    return 0;
  }
  const promptTokens = usage.promptTokens ?? 0;
  const completionTokens = usage.completionTokens ?? 0;
  return (promptTokens / 1000) * inputRate + (completionTokens / 1000) * outputRate;
}

export async function runTextWorker() {
  const redisUrl = getEnv("REDIS_URL", "");
  if (!redisUrl) {
    console.warn("[worker:text] REDIS_URL is missing; worker not started");
    return;
  }

  const prisma = getPrismaClient();
  const provider = getTextProvider();

  const worker = new Worker(
    QUEUE_NAMES.text,
    async (job) => {
      const data = job.data as TextJobData;
      await markJobProcessing(data.jobId);
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

      const promptData = await resolveTextPrompt(prisma, {
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
        facts: facts.map((fact) => fact.content),
        type: data.type,
        language: data.language,
        options: data.options ?? {},
      });

      // Scale output budget from the approved brief's word target so long-form
      // content is not truncated by the default token budget.
      const briefMetadata =
        data.options?.metadata && typeof data.options.metadata === "object"
          ? (data.options.metadata as Record<string, unknown>)
          : {};
      const targetWordMax =
        typeof briefMetadata.recommendedWordCountMax === "number"
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
          usageJson: result.usage ?? Prisma.JsonNull,
        },
      });

      await syncTextResultToStudio(data.tenantId, data.contentTextId);
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
    await completeOperationForJob(job.data);
  });

  worker.on("failed", async (job, err) => {
    if (!job?.id) {
      return;
    }
    const data = job.data as TextJobData | undefined;
    await markJobFailed(job.id.toString(), err.message);
    await failOperationForJob(job.data, err);
    if (data?.contentTextId) {
      await prisma.contentText.update({
        where: { id: data.contentTextId },
        data: { status: "failed", error: err.message },
      });
    }
  });

  console.log("[worker:text] started", { queue: QUEUE_NAMES.text });
}
