import { Prisma, type Operation, type OperationStatus } from "@prisma/client";
import { getPrismaClient } from "../infrastructure/db/prisma";
import { structuredEvent } from "../shared/utils/logger";
import { writeAudit } from "./audit";

const prisma = getPrismaClient();

// ────────────────────────────────────────────────────────────── Types

export type OperationType =
  | "site_index"
  | "source_discovery"
  | "editorial_plan_generation"
  | "text_generation"
  | "image_generation"
  | "social_generation"
  | "publish"
  | "unpublish"
  | "connection_installation"
  | "connection_verification"
  | "import"
  | "automation";

export type OperationInput = {
  tenantId: string;
  siteId?: string | null;
  type: OperationType | string;
  initiatorUserId?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  queueName?: string | null;
  jobKey?: string | null;
  totalSteps?: number;
  metadata?: Record<string, unknown> | null;
};

export type OperationView = {
  id: string;
  tenantId: string;
  siteId: string | null;
  type: string;
  status: OperationStatus;
  phase: string | null;
  progress: number;
  totalSteps: number;
  completedSteps: number;
  initiatorUserId: string | null;
  entityType: string | null;
  entityId: string | null;
  retryCount: number;
  errorSummary: string | null;
  errorCode: string | null;
  queueName: string | null;
  jobKey: string | null;
  metadata: Record<string, unknown> | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  cancelledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

const RETRYABLE_ERROR_PATTERNS = [
  /timeout/i,
  /econnrefused/i,
  /econnreset/i,
  /429/,
  /rate.?limit/i,
  /temporar/i,
  /busy/i,
  /5\d\d/,
];

export function classifyRetryable(error: unknown): { retryable: boolean; code: string; summary: string } {
  const message = error instanceof Error ? error.message : String(error);
  const codeMatch = message.match(/^([a-z_][a-z0-9_]*)/i);
  const code = codeMatch?.[1] ?? "operation_error";
  const summary = message.slice(0, 400);
  return { retryable: RETRYABLE_ERROR_PATTERNS.some((pattern) => pattern.test(message)), code, summary };
}

function toView(operation: Operation): OperationView {
  return {
    id: operation.id,
    tenantId: operation.tenantId,
    siteId: operation.siteId,
    type: operation.type,
    status: operation.status,
    phase: operation.phase,
    progress: operation.progress,
    totalSteps: operation.totalSteps,
    completedSteps: operation.completedSteps,
    initiatorUserId: operation.initiatorUserId,
    entityType: operation.entityType,
    entityId: operation.entityId,
    retryCount: operation.retryCount,
    errorSummary: operation.errorSummary,
    errorCode: operation.errorCode,
    queueName: operation.queueName,
    jobKey: operation.jobKey,
    metadata: (operation.metadata ?? null) as Record<string, unknown> | null,
    startedAt: operation.startedAt,
    finishedAt: operation.finishedAt,
    cancelledAt: operation.cancelledAt,
    createdAt: operation.createdAt,
    updatedAt: operation.updatedAt,
  };
}

// ────────────────────────────────────────────────────────────── Lifecycle

export async function createOperation(input: OperationInput): Promise<OperationView> {
  const created = await prisma.operation.create({
    data: {
      tenantId: input.tenantId,
      siteId: input.siteId ?? null,
      type: input.type,
      initiatorUserId: input.initiatorUserId ?? null,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      queueName: input.queueName ?? null,
      jobKey: input.jobKey ?? null,
      totalSteps: input.totalSteps ?? 0,
      status: "queued",
      metadata: input.metadata ? (input.metadata as Prisma.InputJsonObject) : Prisma.JsonNull,
    },
  });
  structuredEvent("operation.created", { operationId: created.id, tenantId: created.tenantId, type: created.type });
  return toView(created);
}

export async function startOperation(operationId: string, phase?: string): Promise<OperationView> {
  const updated = await prisma.operation.update({
    where: { id: operationId },
    data: {
      status: "running",
      startedAt: new Date(),
      ...(phase ? { phase } : {}),
    },
  });
  return toView(updated);
}

export async function touchOperationProgress(
  operationId: string,
  input: { phase?: string; completedSteps?: number; totalSteps?: number; progress?: number },
): Promise<OperationView> {
  const current = await prisma.operation.findUnique({ where: { id: operationId } });
  if (!current) {
    throw new Error("operation_not_found");
  }
  const total = input.totalSteps ?? current.totalSteps;
  const completed = input.completedSteps ?? current.completedSteps;
  const progress = total > 0
    ? Math.min(100, Math.max(0, Math.round((completed / total) * 100)))
    : (input.progress ?? current.progress);
  const updated = await prisma.operation.update({
    where: { id: operationId },
    data: {
      ...(input.phase !== undefined ? { phase: input.phase } : {}),
      completedSteps: completed,
      ...(input.totalSteps !== undefined ? { totalSteps: input.totalSteps } : {}),
      progress,
    },
  });
  return toView(updated);
}

export async function completeOperation(operationId: string, input: { partial?: boolean; phase?: string } = {}): Promise<OperationView> {
  const current = await prisma.operation.findUnique({ where: { id: operationId } });
  const updated = await prisma.operation.update({
    where: { id: operationId },
    data: {
      status: input.partial ? "partial" : "succeeded",
      progress: input.partial ? 99 : 100,
      ...(input.phase ? { phase: input.phase } : {}),
      finishedAt: new Date(),
      errorSummary: input.partial ? (current?.errorSummary ?? null) : null,
    },
  });
  structuredEvent("operation.completed", { operationId, tenantId: updated.tenantId, type: updated.type, status: updated.status });
  return toView(updated);
}

export async function markOperationRetrying(operationId: string): Promise<OperationView> {
  const updated = await prisma.operation.update({
    where: { id: operationId },
    data: { status: "retrying", retryCount: { increment: 1 } },
  });
  return toView(updated);
}

export async function failOperation(
  operationId: string,
  input: { errorCode?: string; errorSummary?: string; retryable?: boolean; phase?: string } = {},
): Promise<OperationView> {
  const current = await prisma.operation.findUnique({ where: { id: operationId } });
  if (!current) {
    throw new Error("operation_not_found");
  }
  const summary = (input.errorSummary ?? "The operation failed.").slice(0, 1000);
  const updated = await prisma.operation.update({
    where: { id: operationId },
    data: {
      status: "failed",
      errorCode: input.errorCode ?? "operation_failed",
      errorSummary: summary,
      finishedAt: new Date(),
      ...(input.phase ? { phase: input.phase } : {}),
      metadata: {
        ...(typeof current.metadata === "object" && current.metadata && !Array.isArray(current.metadata)
          ? (current.metadata as Record<string, unknown>)
          : {}),
        retryable: input.retryable ?? classifyRetryable(summary).retryable,
      } as Prisma.InputJsonObject,
    },
  });
  structuredEvent("operation.failed", {
    operationId,
    tenantId: updated.tenantId,
    type: updated.type,
    errorCode: updated.errorCode,
  }, "warn");
  return toView(updated);
}

export async function cancelOperation(operationId: string): Promise<OperationView> {
  const updated = await prisma.operation.update({
    where: { id: operationId },
    data: { status: "cancelled", cancelledAt: new Date(), finishedAt: new Date() },
  });
  structuredEvent("operation.cancelled", { operationId, tenantId: updated.tenantId });
  return toView(updated);
}

// ────────────────────────────────────────────────────────────── Queries

export async function getOperation(tenantId: string, operationId: string): Promise<OperationView | null> {
  const operation = await prisma.operation.findFirst({ where: { id: operationId, tenantId } });
  return operation ? toView(operation) : null;
}

export async function listOperations(
  tenantId: string,
  input: {
    page?: number;
    pageSize?: number;
    status?: OperationStatus | "all";
    type?: string;
    siteId?: string;
    search?: string;
  } = {},
): Promise<{ items: OperationView[]; page: number; pageSize: number; total: number; counts: Record<string, number> }> {
  const page = input.page ?? 1;
  const pageSize = Math.min(input.pageSize ?? 20, 100);
  const where: Prisma.OperationWhereInput = {
    tenantId,
    ...(input.status && input.status !== "all" ? { status: input.status } : {}),
    ...(input.type ? { type: input.type } : {}),
    ...(input.siteId ? { siteId: input.siteId } : {}),
  };

  const [total, items, countsRows] = await prisma.$transaction([
    prisma.operation.count({ where }),
    prisma.operation.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.operation.groupBy({
      by: ["status"],
      where: { tenantId, ...(input.siteId ? { siteId: input.siteId } : {}) },
      orderBy: { status: "asc" },
      _count: { _all: true },
    }),
  ]);

  const counts: Record<string, number> = {};
  for (const row of countsRows) {
    const count = row._count;
    const all = typeof count === "object" && count !== null && "_all" in count ? (count as { _all: number })._all : 0;
    counts[row.status] = all;
  }
  if (input.search) {
    const query = input.search.toLowerCase();
    return {
      items: items.filter((item) => item.type.toLowerCase().includes(query) || item.entityType?.toLowerCase().includes(query)).map(toView),
      page,
      pageSize,
      total,
      counts,
    };
  }
  return { items: items.map(toView), page, pageSize, total, counts };
}

// ────────────────────────────────────────────────────────────── Correlation helpers

/** Idempotent operation retrieval or creation for a queue job key. */
export async function findOrCreateOperationForJob(input: OperationInput): Promise<OperationView> {
  if (input.jobKey) {
    const existing = await prisma.operation.findFirst({
      where: { tenantId: input.tenantId, jobKey: input.jobKey },
      orderBy: { createdAt: "desc" },
    });
    if (existing) {
      return toView(existing);
    }
  }
  return createOperation(input);
}

export async function recordAuditForOperation(operationId: string, action: string, metadata: Record<string, unknown> = {}): Promise<void> {
  const operation = await prisma.operation.findUnique({ where: { id: operationId } });
  if (!operation) {
    return;
  }
  await writeAudit({
    tenantId: operation.tenantId,
    action,
    entityType: "operation",
    entityId: operationId,
    metadata,
  });
}
