// Phase 5 — Redis/BullMQ operational CLI.
//
// npm run ops:queue -- <command> [args]
//
// Commands:
//   health                  queue depths + redis/db check + worker heartbeats
//   depths                  per-queue waiting/active/delayed/failed counts
//   retry-failed <queue>    re-enqueue all failed jobs in a queue
//   clean <queue>           remove completed jobs beyond retention
//   inspect <queue> <jobId> job state, attempts, progress, data (redacted)
//   pause <queue>           stop processing new jobs
//   resume <queue>          resume processing
//
// Safe by design: never deletes waiting/active/delayed jobs.

import { Queue } from "bullmq";
import { getRedisConnectionOptions } from "../src/infrastructure/queue/redis";
import { QUEUE_NAMES } from "../src/infrastructure/queue/queues";
import { listWorkerHeartbeats } from "../src/studio/worker-health";
import { getPrismaClient } from "../src/infrastructure/db/prisma";

const prisma = getPrismaClient();

const ALL_QUEUES: string[] = Object.values(QUEUE_NAMES);
const OP_TIMEOUT_MS = Math.max(1_000, Number.parseInt(process.env.QUEUE_OP_TIMEOUT_MS ?? "5000", 10) || 5_000);

async function withTimeout<T>(label: string, operation: Promise<T>): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label}_timeout_after_${OP_TIMEOUT_MS}ms`)), OP_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function usage(): never {
  console.error(
    [
      "Usage: npm run ops:queue -- <command> [args]",
      "",
      "  health                 queue depths + db/redis health + worker heartbeats",
      "  depths                 per-queue job counts",
      "  retry-failed <queue>   re-enqueue failed jobs",
      "  clean <queue>          remove completed jobs beyond retention",
      "  inspect <queue> <job>  job state and metadata",
      "  pause <queue>          pause queue consumption",
      "  resume <queue>         resume queue consumption",
    ].join("\n"),
  );
  process.exit(2);
}

function resolveQueue(name: string): string {
  if (ALL_QUEUES.includes(name)) {
    return name;
  }
  const canonical: Record<string, string> = {
    scraping: "queue_scraping",
    text: "queue_text",
    image: "queue_image",
    publishing: "queue_publishing",
    social: "queue_social",
    connection: "queue_connection",
  };
  const resolved = canonical[name];
  if (!resolved) {
    console.error(`Unknown queue: ${name}`);
    process.exit(2);
  }
  return resolved;
}

function open(name: string): Queue {
  return new Queue(name, { connection: getRedisConnectionOptions() });
}

async function health(): Promise<void> {
  let db = "ok";
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (error) {
    db = `error: ${error instanceof Error ? error.message : String(error)}`;
  }

  let redis = "ok";
  const queueRows: Array<Record<string, unknown>> = [];
  for (const name of ALL_QUEUES) {
    const queue = open(name);
    try {
      const counts = await withTimeout(`${name}_counts`, queue.getJobCounts("waiting", "active", "delayed", "failed", "completed"));
      queueRows.push({ queue: name, ...counts });
    } catch (error) {
      redis = `error: ${error instanceof Error ? error.message : String(error)}`;
      queueRows.push({ queue: name, error: redis });
    } finally {
      await withTimeout(`${name}_close`, queue.close()).catch(() => undefined);
    }
  }

  let workers: unknown[] = [];
  try {
    workers = await listWorkerHeartbeats();
  } catch {
    workers = [];
  }

  console.log(JSON.stringify({ db, redis, queues: queueRows, workers }, null, 2));
}

async function retryFailed(queueName: string): Promise<void> {
  const queue = open(queueName);
  const jobs = await queue.getJobs(["failed"]);
  let retried = 0;
  for (const job of jobs) {
    try {
      await job.retry("failed");
      retried += 1;
    } catch (error) {
      console.error(`retry ${job.id} failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  console.log(`Retried ${retried} failed job(s) in ${queueName}`);
  await queue.close();
}

async function clean(queueName: string): Promise<void> {
  const queue = open(queueName);
  // Only completed jobs are pruned; failed jobs are kept for inspection.
  const jobs = await queue.getJobs(["completed"], 0, 2000, true);
  let removed = 0;
  for (const job of jobs) {
    if (job.attemptsMade > 0) {
      await job.remove();
      removed += 1;
    }
  }
  console.log(`Removed ${removed} completed job(s) from ${queueName}`);
  await queue.close();
}

async function inspect(queueName: string, jobId: string): Promise<void> {
  const queue = open(queueName);
  const job = await queue.getJob(jobId);
  if (!job) {
    console.error(`Job ${jobId} not found in ${queueName}`);
    await queue.close();
    process.exit(1);
  }
  const state = await job.getState();
  const data = job.data as Record<string, unknown> | undefined;
  const safeData = data
    ? Object.fromEntries(
        Object.entries(data).filter(([key]) => !/(secret|token|password|credential|authorization)/i.test(key)),
      )
    : null;
  console.log(
    JSON.stringify(
      {
        id: job.id,
        name: job.name,
        state,
        attemptsMade: job.attemptsMade,
        progress: job.progress,
        failedReason: job.failedReason,
        timestamp: job.timestamp,
        data: safeData,
      },
      null,
      2,
    ),
  );
  await queue.close();
}

async function pause(queueName: string): Promise<void> {
  const queue = open(queueName);
  await queue.pause();
  console.log(`Paused ${queueName}`);
  await queue.close();
}

async function resume(queueName: string): Promise<void> {
  const queue = open(queueName);
  await queue.resume();
  console.log(`Resumed ${queueName}`);
  await queue.close();
}

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);
  switch (command) {
    case "health":
      await health();
      break;
    case "depths":
      await health();
      break;
    case "retry-failed": {
      const queueName = resolveQueue(args[0] ?? "");
      await retryFailed(queueName);
      break;
    }
    case "clean": {
      const queueName = resolveQueue(args[0] ?? "");
      await clean(queueName);
      break;
    }
    case "inspect": {
      const queueName = resolveQueue(args[0] ?? "");
      const jobId = args[1] ?? "";
      if (!jobId) {
        usage();
      }
      await inspect(queueName, jobId);
      break;
    }
    case "pause": {
      const queueName = resolveQueue(args[0] ?? "");
      await pause(queueName);
      break;
    }
    case "resume": {
      const queueName = resolveQueue(args[0] ?? "");
      await resume(queueName);
      break;
    }
    default:
      usage();
  }
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
