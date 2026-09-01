import type { FactSourceType } from "@prisma/client";
import { Worker } from "bullmq";
import { getEnv } from "../../shared/utils/env";
import { sha256 } from "../../shared/utils/hash";
import { normalizeText } from "../../shared/utils/text";
import { QUEUE_NAMES } from "../queue/queues";
import { getRedisConnectionOptions } from "../queue/redis";
import { markJobDone, markJobFailed, markJobProcessing } from "../db/jobs";
import { getPrismaClient } from "../db/prisma";
import { scrapeSource, type ScrapeSourceType } from "../scraping";
import { bullWorkerOptions, registerBullWorkerShutdown } from "./worker-runtime";

type ScrapeJobData = {
  jobId: string;
  tenantId: string;
  topicId: string;
  sourceType: string;
  sourceRef: string;
  metadata?: Record<string, unknown>;
};

export async function runScrapingWorker() {
  const redisUrl = getEnv("REDIS_URL", "");
  if (!redisUrl) {
    console.warn("[worker:scraping] REDIS_URL is missing; worker not started");
    return;
  }

  const prisma = getPrismaClient();

  const worker = new Worker(
    QUEUE_NAMES.scraping,
    async (job) => {
      const data = job.data as ScrapeJobData;
      await markJobProcessing(data.jobId);

      const allowedTypes = new Set(["rss", "html", "api"]);
      if (!allowedTypes.has(data.sourceType)) {
        throw new Error("invalid_source_type");
      }

      const items = await scrapeSource({
        sourceType: data.sourceType as ScrapeSourceType,
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
            sourceType: data.sourceType as FactSourceType,
            sourceRef: item.sourceRef ?? data.sourceRef,
            content,
            contentHash: sha256(normalizeText(content)),
            metadata: {
              ...(item.metadata ?? {}),
              scraped_at: nowIso,
            },
          };
        })
        .filter((fact): fact is NonNullable<typeof fact> => Boolean(fact));

      if (facts.length > 0) {
        await prisma.fact.createMany({
          data: facts,
          skipDuplicates: true,
        });
      }

      return { created: facts.length };
    },
    {
      connection: getRedisConnectionOptions(),
      ...bullWorkerOptions("scraping", 2),
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
    await markJobFailed(job.id.toString(), err.message);
  });

  registerBullWorkerShutdown(worker, "scraping");
  console.log("[worker:scraping] started", { queue: QUEUE_NAMES.scraping });
}
