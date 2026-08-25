import type { FastifyInstance } from "fastify";
import { Queue } from "bullmq";
import {
  badRequest,
  isOneOf,
  isUuid,
  notFound,
  parseBody,
  parseOptionalString,
  requireStudioContext,
  requireStudioPermission,
} from "./http-utils";
import { parsePage, parsePageSize } from "./http-utils";
import { getRedisConnectionOptions } from "../infrastructure/queue/redis";
import {
  cancelOperation,
  getOperation,
  listOperations,
  markOperationRetrying,
} from "./operations";
import { publishEvent } from "./events";
import { notify } from "./notifications";
import { structuredEvent } from "../shared/utils/logger";

const STATUSES = ["queued", "running", "retrying", "succeeded", "partial", "failed", "cancelled", "all"] as const;

export function registerOperationRoutes(fastify: FastifyInstance) {
  fastify.get("/v2/operations", async (request, reply) => {
    const context = await requireStudioContext(request, reply);
    if (!context) {
      return;
    }
    const query = request.query as { page?: string; pageSize?: string; status?: string; type?: string; siteId?: string; search?: string };
    if (query.status && !isOneOf(query.status, STATUSES)) {
      return badRequest(reply, `status must be one of: ${STATUSES.join(", ")}`);
    }
    const result = await listOperations(context.tenantId, {
      page: parsePage(query.page, 1),
      pageSize: parsePageSize(query.pageSize, 20),
      status: query.status as (typeof STATUSES)[number] | undefined,
      type: parseOptionalString(query.type) ?? undefined,
      siteId: parseOptionalString(query.siteId) ?? undefined,
      search: parseOptionalString(query.search) ?? undefined,
    });
    return reply.send(result);
  });

  fastify.get("/v2/operations/:id", async (request, reply) => {
    const context = await requireStudioContext(request, reply);
    if (!context) {
      return;
    }
    const id = (request.params as { id: string }).id;
    if (!isUuid(id)) {
      return badRequest(reply, "invalid operation id");
    }
    const operation = await getOperation(context.tenantId, id);
    if (!operation) {
      return notFound(reply, "operation not found");
    }
    return reply.send(operation);
  });

  fastify.post("/v2/operations/:id/retry", async (request, reply) => {
    const context = await requireStudioPermission(request, reply, "projects.manage");
    if (!context) {
      return;
    }
    const id = (request.params as { id: string }).id;
    if (!isUuid(id)) {
      return badRequest(reply, "invalid operation id");
    }
    const operation = await getOperation(context.tenantId, id);
    if (!operation) {
      return notFound(reply, "operation not found");
    }
    if (operation.status !== "failed" && operation.status !== "partial") {
      return reply.code(409).send({ error: { code: "not_retryable", message: `operation in state ${operation.status} cannot be retried` } });
    }
    const retryable = Boolean(operation.metadata && typeof operation.metadata === "object" && (operation.metadata as Record<string, unknown>).retryable);
    if (!retryable && operation.status === "failed") {
      return reply.code(409).send({ error: { code: "not_retryable", message: "this failure is not retryable" } });
    }

    // Retry the correlated queue job when one exists.
    let requeued = false;
    if (operation.queueName && operation.jobKey) {
      try {
        const queue = new Queue(operation.queueName, { connection: getRedisConnectionOptions() });
        const job = await queue.getJob(operation.jobKey);
        if (job) {
          const jobState = await job.getState();
          if (jobState === "failed") {
            await job.retry("failed");
            requeued = true;
          }
        }
        await queue.close();
      } catch (error) {
        structuredEvent("operation.retry_requeue_failed", { operationId: id, error: error instanceof Error ? error.message : String(error) }, "warn");
      }
    }

    const updated = await markOperationRetrying(id);
    await publishEvent({
      tenantId: context.tenantId,
      siteId: operation.siteId,
      type: "operation.created",
      payload: { operationId: id, status: "retrying" },
    });
    return reply.send({ ...updated, requeued });
  });

  fastify.post("/v2/operations/:id/cancel", async (request, reply) => {
    const context = await requireStudioPermission(request, reply, "projects.manage");
    if (!context) {
      return;
    }
    const id = (request.params as { id: string }).id;
    if (!isUuid(id)) {
      return badRequest(reply, "invalid operation id");
    }
    const operation = await getOperation(context.tenantId, id);
    if (!operation) {
      return notFound(reply, "operation not found");
    }
    const cancellable = ["queued", "running", "retrying"].includes(operation.status);
    if (!cancellable) {
      return reply.code(409).send({ error: { code: "not_cancellable", message: `operation in state ${operation.status} cannot be cancelled` } });
    }

    let queueCancelled = false;
    if (operation.queueName && operation.jobKey) {
      try {
        const queue = new Queue(operation.queueName, { connection: getRedisConnectionOptions() });
        const job = await queue.getJob(operation.jobKey);
        if (job) {
          const state = await job.getState();
          if (state === "waiting" || state === "delayed" || state === "active") {
            await job.remove();
            queueCancelled = true;
          }
        }
        await queue.close();
      } catch (error) {
        structuredEvent("operation.cancel_queue_failed", { operationId: id, error: error instanceof Error ? error.message : String(error) }, "warn");
      }
    }

    const updated = await cancelOperation(id);
    await publishEvent({
      tenantId: context.tenantId,
      siteId: operation.siteId,
      type: "operation.cancelled",
      payload: { operationId: id },
    });
    await notify({
      tenantId: context.tenantId,
      userId: context.userId,
      siteId: operation.siteId,
      category: "system",
      severity: "info",
      title: "Operation cancelled",
      message: `${operation.type} was cancelled before completion.`,
      entityType: "operation",
      entityId: id,
      actionUrl: "/studio/activity",
      dedupeKey: `operation.${id}.cancelled`,
    });
    return reply.send({ ...updated, queueCancelled });
  });
}
