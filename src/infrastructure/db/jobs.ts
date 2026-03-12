import type { JobStatus, JobType } from "@prisma/client";
import { getPrismaClient } from "./prisma";

export async function findJobByIdempotency(tenantId: string, idempotencyKey: string) {
  const prisma = getPrismaClient();
  return prisma.job.findUnique({
    where: {
      tenantId_idempotencyKey: {
        tenantId,
        idempotencyKey,
      },
    },
  });
}

export async function createJob(params: {
  tenantId: string;
  type: JobType;
  status?: JobStatus;
  idempotencyKey?: string;
}) {
  const prisma = getPrismaClient();
  return prisma.job.create({
    data: {
      tenantId: params.tenantId,
      type: params.type,
      status: params.status ?? "queued",
      idempotencyKey: params.idempotencyKey ?? null,
    },
  });
}

export async function markJobProcessing(jobId: string) {
  const prisma = getPrismaClient();
  return prisma.job.update({
    where: { id: jobId },
    data: {
      status: "processing",
      startedAt: new Date(),
    },
  });
}

export async function markJobDone(jobId: string) {
  const prisma = getPrismaClient();
  return prisma.job.update({
    where: { id: jobId },
    data: {
      status: "done",
      finishedAt: new Date(),
    },
  });
}

export async function markJobFailed(jobId: string, error: string) {
  const prisma = getPrismaClient();
  return prisma.job.update({
    where: { id: jobId },
    data: {
      status: "failed",
      lastError: error,
      finishedAt: new Date(),
    },
  });
}
