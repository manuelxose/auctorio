// Unified production pipeline API (docs/adr/unified-production-pipeline.md).

import type { FastifyInstance, FastifyReply } from "fastify";
import type { ProductionJobStatus } from "@prisma/client";
import { badRequest, isUuid, parseBody, requireStudioContext, requireStudioPermission } from "./http-utils";
import {
  ProductionError,
  cancelProductionJob,
  getProductionJob,
  listProductionJobs,
  retryProductionJob,
  reviewProductionJob,
  startProduction,
} from "./production/pipeline";
import type { ProductionRequest } from "./production/types";

const STATUSES = ["queued", "running", "needs_review", "ready", "failed", "cancelled"];

function fail(reply: FastifyReply, error: unknown) {
  if (error instanceof ProductionError) {
    return reply.code(error.httpStatus).send({ error: error.code, message: error.message });
  }
  throw error;
}

export function registerProductionRoutes(fastify: FastifyInstance) {
  fastify.post("/v2/production/jobs", async (request, reply) => {
    const context = await requireStudioPermission(request, reply, "projects.manage");
    if (!context) return;
    const body = parseBody<{ kind?: string; planItemId?: string; clusterId?: string; siteId?: string; title?: string; brief?: string; language?: "es" | "en" }>(request);
    const language = body.language === "en" ? "en" : "es";
    let req: ProductionRequest;
    if (body.kind === "plan_item" && body.planItemId && isUuid(body.planItemId)) {
      req = { kind: "plan_item", planItemId: body.planItemId, language };
    } else if (body.kind === "cluster" && body.clusterId && isUuid(body.clusterId) && (!body.siteId || isUuid(body.siteId))) {
      req = { kind: "cluster", clusterId: body.clusterId, siteId: body.siteId ?? null, language };
    } else if (body.kind === "manual" && body.siteId && isUuid(body.siteId) && body.title && body.brief) {
      req = { kind: "manual", siteId: body.siteId, title: body.title, brief: body.brief, language };
    } else {
      return badRequest(reply, "kind must be plan_item(planItemId) | cluster(clusterId) | manual(siteId,title,brief)");
    }
    try {
      const { job, created } = await startProduction(context.tenantId, req, { userId: context.userId });
      return reply.code(created ? 202 : 200).send({ job, created });
    } catch (error) {
      return fail(reply, error);
    }
  });

  fastify.get("/v2/production/jobs", async (request, reply) => {
    const context = await requireStudioContext(request, reply);
    if (!context) return;
    const q = request.query as Record<string, string | undefined>;
    if (q.status && !STATUSES.includes(q.status)) return badRequest(reply, "invalid status");
    if ((q.siteId && !isUuid(q.siteId)) || (q.planItemId && !isUuid(q.planItemId)) || (q.clusterId && !isUuid(q.clusterId))) {
      return badRequest(reply, "invalid id filter");
    }
    return reply.send(
      await listProductionJobs(context.tenantId, {
        siteId: q.siteId,
        status: q.status as ProductionJobStatus | undefined,
        kind: q.kind,
        planItemId: q.planItemId,
        clusterId: q.clusterId,
        page: Number.parseInt(q.page ?? "1", 10) || 1,
        pageSize: Number.parseInt(q.pageSize ?? "20", 10) || 20,
      }),
    );
  });

  fastify.get("/v2/production/jobs/:id", async (request, reply) => {
    const context = await requireStudioContext(request, reply);
    if (!context) return;
    const id = (request.params as { id: string }).id;
    if (!isUuid(id)) return badRequest(reply, "invalid job id");
    const job = await getProductionJob(context.tenantId, id);
    return job ? reply.send({ job }) : reply.code(404).send({ error: "production_job_not_found" });
  });

  for (const action of ["retry", "cancel", "review"] as const) {
    fastify.post(`/v2/production/jobs/:id/${action}`, async (request, reply) => {
      const context = await requireStudioPermission(request, reply, "projects.manage");
      if (!context) return;
      const id = (request.params as { id: string }).id;
      if (!isUuid(id)) return badRequest(reply, "invalid job id");
      try {
        if (action === "retry") return reply.send({ job: await retryProductionJob(context.tenantId, id, { userId: context.userId }) });
        if (action === "cancel") return reply.send({ job: await cancelProductionJob(context.tenantId, id, context.userId) });
        const body = parseBody<{ decision?: string; notes?: string }>(request);
        if (body.decision !== "approve" && body.decision !== "reject") return badRequest(reply, "decision must be approve or reject");
        return reply.send({ job: await reviewProductionJob(context.tenantId, id, { decision: body.decision, notes: body.notes }, context.userId) });
      } catch (error) {
        return fail(reply, error);
      }
    });
  }
}
