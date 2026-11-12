// Unified production pipeline (docs/adr/unified-production-pipeline.md).
//
//   startProduction(request) → ProductionJob (+ Operation) → stage registry
//   prepare → duplicates → evidence → brief → write → seo → qa → gates → materialize
//
// Jobs are durable and idempotent: one active job per plan item / cluster+site,
// retry resumes from the failed stage, and materialization reuses the job's
// project, so a retry never duplicates projects or publications (ENG-02).

import crypto from "node:crypto";
import { Prisma, type ProductionJob, type ProductionJobStatus } from "@prisma/client";
import { getPrismaClient } from "../../infrastructure/db/prisma";
import { structuredEvent } from "../../shared/utils/logger";
import { writeAudit } from "../audit";
import {
  cancelOperation,
  classifyRetryable,
  completeOperation,
  createOperation,
  failOperation,
  markOperationRetrying,
  startOperation,
  touchOperationProgress,
} from "../operations";
import { generateContentFromEditorialPlanItem } from "../editorial-plan";
import { resolveClusterSite } from "../editorial-engine/cluster-production";
import { ensurePlanItemProject } from "./plan-item";
import { productionStages } from "./stages";
import {
  ACTIVE_JOB_STATUSES,
  PRODUCTION_STAGES,
  ProductionStop,
  type ProductionArtifacts,
  type ProductionRequest,
  type ProductionStage,
  type StageContext,
} from "./types";

const prisma = getPrismaClient();

/** A running job not touched for this long is considered abandoned (process died) and may be retried/cancelled. */
export const STALE_RUNNING_MS = 15 * 60_000;
const WORK_STAGES = PRODUCTION_STAGES.filter((stage) => stage !== "prepare");

export class ProductionError extends Error {
  constructor(public readonly code: string, message?: string, public readonly httpStatus = 400) {
    super(message ?? code);
  }
}

// ────────────────────────────────────────────────────────────── Views

export type ProductionStageView = { stage: ProductionStage; status: "done" | "running" | "failed" | "cancelled" | "pending" };

export type ProductionJobView = {
  id: string;
  tenantId: string;
  siteId: string;
  kind: string;
  planItemId: string | null;
  clusterId: string | null;
  projectId: string | null;
  versionId: string | null;
  generationId: string | null;
  operationId: string | null;
  status: ProductionJobStatus;
  stage: string;
  attempts: number;
  error: string | null;
  errorCode: string | null;
  stages: ProductionStageView[];
  progress: number;
  cancellable: boolean;
  retryable: boolean;
  reviewable: boolean;
  review: { decision: string | null; notes: string | null; reviewedByUserId: string | null; reviewedAt: Date | null };
  links: { editorUrl: string | null; projectId: string | null; versionId: string | null };
  summary: Record<string, unknown>;
  request: Record<string, unknown>;
  cancelRequestedAt: Date | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

function artifactsOf(job: Pick<ProductionJob, "artifacts">): ProductionArtifacts {
  return (job.artifacts && typeof job.artifacts === "object" && !Array.isArray(job.artifacts) ? job.artifacts : {}) as ProductionArtifacts;
}

function isStale(job: ProductionJob, now = new Date()): boolean {
  // A queued job whose runner died between the claim and runProductionJob is just as stuck as a running one.
  return (job.status === "running" || job.status === "queued") && now.getTime() - job.updatedAt.getTime() > STALE_RUNNING_MS;
}

function writeCompleted(job: ProductionJob): boolean {
  return (artifactsOf(job).completed ?? []).includes("write");
}

export function canCancel(job: ProductionJob, now = new Date()): boolean {
  if (job.status === "queued" || job.status === "failed") return true;
  if (job.status === "running") return !writeCompleted(job) || isStale(job, now);
  return false;
}

export function canRetry(job: ProductionJob, now = new Date()): boolean {
  return job.status === "failed" || job.status === "cancelled" || isStale(job, now);
}

export function toProductionJobView(job: ProductionJob): ProductionJobView {
  const artifacts = artifactsOf(job);
  const completed = new Set(artifacts.completed ?? []);
  const stages: ProductionStageView[] = PRODUCTION_STAGES.map((stage) => {
    if (completed.has(stage)) return { stage, status: "done" };
    if (stage !== job.stage) return { stage, status: "pending" };
    if (job.status === "running" || job.status === "queued") return { stage, status: job.status === "running" ? "running" : "pending" };
    if (job.status === "failed") return { stage, status: "failed" };
    if (job.status === "cancelled") return { stage, status: "cancelled" };
    return { stage, status: "pending" };
  });
  const summary: Record<string, unknown> = {};
  if (artifacts.duplicates) summary.duplicates = { decision: artifacts.duplicates.decision, reason: artifacts.duplicates.reason, similarity: artifacts.duplicates.similarity };
  if (artifacts.evidence) summary.evidence = { licenses: artifacts.evidence.licenses.length, forbidden: artifacts.evidence.forbidden.length, requireAttribution: artifacts.evidence.requireAttribution.length };
  if (artifacts.brief) summary.brief = { articleType: artifacts.brief.brief.articleType, searchIntent: artifacts.brief.brief.searchIntent, primaryKeyword: artifacts.brief.brief.primaryKeyword };
  if (artifacts.write) summary.writer = { provider: artifacts.write.provider, model: artifacts.write.model, title: artifacts.write.parsed.title };
  if (artifacts.qa) {
    summary.qa = {
      editorialScore: artifacts.qa.editorial.score,
      editorialPassed: artifacts.qa.editorial.passed,
      criticalUnsupportedClaims: artifacts.qa.editorial.criticalUnsupportedClaims.length,
      versionScore: artifacts.qa.version.score,
      versionPassed: artifacts.qa.version.passed,
    };
  }
  if (artifacts.gates) summary.gates = { decision: artifacts.gates.decision.decision, reasons: artifacts.gates.decision.reasons };
  if (artifacts.materialize) summary.materialize = { publicationId: artifacts.materialize.publicationId, imageRequestError: artifacts.materialize.imageRequestError };
  return {
    id: job.id,
    tenantId: job.tenantId,
    siteId: job.siteId,
    kind: job.kind,
    planItemId: job.planItemId,
    clusterId: job.clusterId,
    projectId: job.projectId,
    versionId: job.versionId,
    generationId: job.generationId,
    operationId: job.operationId,
    status: job.status,
    stage: job.stage,
    attempts: job.attempts,
    error: job.error,
    errorCode: job.errorCode,
    stages,
    progress: Math.round((completed.size / PRODUCTION_STAGES.length) * 100),
    cancellable: canCancel(job),
    retryable: canRetry(job),
    reviewable: job.status === "needs_review",
    review: { decision: job.reviewDecision, notes: job.reviewNotes, reviewedByUserId: job.reviewedByUserId, reviewedAt: job.reviewedAt },
    links: { editorUrl: job.projectId ? `/content/${job.projectId}` : null, projectId: job.projectId, versionId: job.versionId },
    summary,
    request: (job.request ?? {}) as Record<string, unknown>,
    cancelRequestedAt: job.cancelRequestedAt,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  };
}

// ────────────────────────────────────────────────────────────── Plan item status follows the job

async function syncPlanItem(job: ProductionJob, outcome: "generating" | "needs_review" | "ready" | "failed" | "cancelled" | "rejected"): Promise<void> {
  if (!job.planItemId) return;
  const data: Prisma.EditorialPlanItemUpdateManyMutationInput =
    outcome === "generating"
      ? { status: "generating", contentGenerationStatus: "generating" }
      : outcome === "needs_review"
        ? { status: "review_required", contentGenerationStatus: "review_required" }
        : outcome === "ready"
          ? { status: "content_ready", contentGenerationStatus: "content_ready" }
          : // The item enum has no `failed`: it returns to approved so it can be produced again.
            { status: "approved", contentGenerationStatus: outcome };
  await prisma.editorialPlanItem.updateMany({ where: { id: job.planItemId, tenantId: job.tenantId }, data });
}

// ────────────────────────────────────────────────────────────── Start

type StartOptions = { userId?: string | null; wait?: boolean; now?: Date };

function manualKey(request: { siteId: string; title: string; brief: string }): string {
  return crypto.createHash("sha256").update(`${request.siteId}\u0000${request.title.trim()}\u0000${request.brief.trim()}`).digest("hex").slice(0, 40);
}

async function resolveTarget(tenantId: string, request: ProductionRequest) {
  if (request.kind === "plan_item") {
    const item = await prisma.editorialPlanItem.findFirst({ where: { id: request.planItemId, tenantId } });
    if (!item) throw new ProductionError("editorial_plan_item_not_found", undefined, 404);
    if (!item.siteId) throw new ProductionError("editorial_plan_item_site_required");
    if (item.channel !== "website") throw new ProductionError("production_channel_not_supported", "the article pipeline produces website content only");
    return { siteId: item.siteId, key: `plan_item:${item.id}`, item };
  }
  if (request.kind === "cluster") {
    let siteId: string;
    try {
      siteId = await resolveClusterSite(tenantId, request.clusterId, request.siteId ?? null);
    } catch (error) {
      const code = error instanceof Error ? error.message : String(error);
      throw new ProductionError(code, undefined, code === "cluster_not_found" || code === "site_not_found" ? 404 : 400);
    }
    return { siteId, key: `cluster:${request.clusterId}:${siteId}`, item: null };
  }
  if (!request.title?.trim() || !request.brief?.trim()) throw new ProductionError("manual_title_and_brief_required");
  const site = await prisma.site.findFirst({ where: { id: request.siteId, tenantId }, select: { id: true } });
  if (!site) throw new ProductionError("site_not_found", undefined, 404);
  return { siteId: site.id, key: `manual:${manualKey(request)}`, item: null };
}

export async function startProduction(
  tenantId: string,
  request: ProductionRequest,
  options: StartOptions = {},
): Promise<{ job: ProductionJobView; created: boolean }> {
  const target = await resolveTarget(tenantId, request);
  const existing = await prisma.productionJob.findUnique({ where: { idempotencyKey: target.key } });
  if (existing && existing.tenantId === tenantId) {
    if ((ACTIVE_JOB_STATUSES as readonly string[]).includes(existing.status) && !isStale(existing)) {
      return { job: toProductionJobView(existing), created: false };
    }
    if (existing.status === "failed" || existing.status === "cancelled" || isStale(existing)) {
      return { job: await retryProductionJob(tenantId, existing.id, options), created: false };
    }
    if (request.kind === "plan_item") {
      // A plan item produces one piece; a finished job is the answer.
      return { job: toProductionJobView(existing), created: false };
    }
    // Finished cluster/manual run: archive the key so a new run (update_existing) can start.
    await prisma.productionJob.update({ where: { id: existing.id }, data: { idempotencyKey: `${existing.idempotencyKey}#${existing.id}` } });
  }

  if (target.item && target.item.status !== "approved" && !target.item.projectId) {
    throw new ProductionError("editorial_plan_item_must_be_approved");
  }

  let job: ProductionJob;
  try {
    job = await prisma.productionJob.create({
      data: {
        tenantId,
        siteId: target.siteId,
        kind: request.kind,
        planItemId: request.kind === "plan_item" ? request.planItemId : null,
        clusterId: request.kind === "cluster" ? request.clusterId : null,
        status: "queued",
        stage: "prepare",
        idempotencyKey: target.key,
        request: request as unknown as Prisma.InputJsonObject,
        artifacts: { completed: [] } as Prisma.InputJsonObject,
        initiatorUserId: options.userId ?? null,
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const winner = await prisma.productionJob.findUnique({ where: { idempotencyKey: target.key } });
      if (winner) return { job: toProductionJobView(winner), created: false };
    }
    throw error;
  }

  const operation = await createOperation({
    tenantId,
    siteId: target.siteId,
    type: "content_production",
    initiatorUserId: options.userId ?? null,
    entityType: "production_job",
    entityId: job.id,
    jobKey: job.id,
    totalSteps: PRODUCTION_STAGES.length,
    metadata: { kind: request.kind, planItemId: job.planItemId, clusterId: job.clusterId },
  });

  let projectId: string | null = null;
  if (target.item) {
    projectId = (await ensurePlanItemProject(target.item, job.id)).id;
  }
  const generation = await prisma.articleGeneration.create({
    data: { tenantId, siteId: target.siteId, clusterId: job.clusterId, projectId, status: "briefing", decision: "pending" },
  });
  job = await prisma.productionJob.update({
    where: { id: job.id },
    data: { operationId: operation.id, projectId, generationId: generation.id },
  });
  await syncPlanItem(job, "generating");
  await writeAudit({
    tenantId,
    actorType: options.userId ? "user" : "system",
    actorUserId: options.userId ?? null,
    action: "production.job.started",
    entityType: "production_job",
    entityId: job.id,
    metadata: { kind: job.kind, planItemId: job.planItemId, clusterId: job.clusterId, projectId },
  });

  if (options.wait) {
    await runProductionJob(job.id, { now: options.now });
  } else {
    void runProductionJob(job.id, { now: options.now }).catch((error) => {
      structuredEvent("production.job.run_crashed", { jobId: job.id, error: error instanceof Error ? error.message : String(error) }, "error");
    });
  }
  const fresh = await prisma.productionJob.findUniqueOrThrow({ where: { id: job.id } });
  return { job: toProductionJobView(fresh), created: true };
}

// ────────────────────────────────────────────────────────────── Run

async function saveArtifacts(jobId: string, data: Prisma.ProductionJobUpdateInput, artifacts: ProductionArtifacts) {
  return prisma.productionJob.update({ where: { id: jobId }, data: { ...data, artifacts: artifacts as unknown as Prisma.InputJsonObject } });
}

async function finishCancelled(job: ProductionJob): Promise<void> {
  const updated = await prisma.productionJob.update({ where: { id: job.id }, data: { status: "cancelled", finishedAt: new Date() } });
  if (job.operationId) await cancelOperation(job.operationId);
  await syncPlanItem(updated, "cancelled");
}

/** Execute (or resume) a job. Safe to call concurrently: only the caller that claims the queued job runs it. */
export async function runProductionJob(jobId: string, options: { now?: Date } = {}): Promise<ProductionJobView | null> {
  const claim = await prisma.productionJob.updateMany({
    where: { id: jobId, status: "queued" },
    data: { status: "running", attempts: { increment: 1 }, startedAt: new Date(), error: null, errorCode: null },
  });
  if (claim.count === 0) return null;
  let job = await prisma.productionJob.findUniqueOrThrow({ where: { id: jobId } });
  if (job.operationId) await startOperation(job.operationId, job.stage);
  const artifacts = artifactsOf(job);
  artifacts.completed = artifacts.completed ?? [];
  const request = job.request as unknown as ProductionRequest;
  const now = options.now ?? new Date();
  let currentStage: ProductionStage = "prepare";

  try {
    job = await saveArtifacts(job.id, { stage: "prepare" }, artifacts);
    const input = await productionStages.prepare({ tenantId: job.tenantId, siteId: job.siteId, request }, now);
    if (!artifacts.completed.includes("prepare")) artifacts.completed.push("prepare");
    const ctx: StageContext = { jobId: job.id, tenantId: job.tenantId, siteId: job.siteId, kind: request.kind, request, generationId: job.generationId, input, artifacts, now };

    for (const stage of WORK_STAGES) {
      if (artifacts.completed.includes(stage)) continue;
      const latest = await prisma.productionJob.findUniqueOrThrow({ where: { id: job.id }, select: { cancelRequestedAt: true } });
      if (latest.cancelRequestedAt) {
        await finishCancelled(job);
        await writeAudit({ tenantId: job.tenantId, action: "production.job.cancelled", entityType: "production_job", entityId: job.id, metadata: { stage } });
        return toProductionJobView(await prisma.productionJob.findUniqueOrThrow({ where: { id: job.id } }));
      }
      currentStage = stage;
      job = await saveArtifacts(job.id, { stage }, artifacts);
      if (job.operationId) await touchOperationProgress(job.operationId, { phase: stage, completedSteps: artifacts.completed.length });
      const output = await productionStages[stage](ctx);
      (artifacts as Record<string, unknown>)[stage] = output;
      artifacts.completed.push(stage);
      const materialized = stage === "materialize" ? artifacts.materialize : undefined;
      job = await saveArtifacts(job.id, materialized ? { projectId: materialized.projectId ?? job.projectId, versionId: materialized.versionId } : {}, artifacts);
    }

    const published = Boolean(artifacts.materialize?.publicationId);
    const status: ProductionJobStatus = published ? "ready" : "needs_review";
    job = await prisma.productionJob.update({ where: { id: job.id }, data: { status, stage: "review", finishedAt: new Date() } });
    if (job.operationId) {
      const imageError = artifacts.materialize?.imageRequestError;
      if (imageError) {
        await prisma.operation.update({ where: { id: job.operationId }, data: { errorSummary: `hero image request failed: ${imageError}` } });
      }
      await touchOperationProgress(job.operationId, { completedSteps: artifacts.completed.length });
      await completeOperation(job.operationId, { partial: Boolean(imageError), phase: status });
    }
    await syncPlanItem(job, published ? "ready" : "needs_review");
    await writeAudit({ tenantId: job.tenantId, action: "production.job.completed", entityType: "production_job", entityId: job.id, metadata: { status, projectId: job.projectId, versionId: job.versionId } });
    return toProductionJobView(job);
  } catch (error) {
    const stop = error instanceof ProductionStop ? error : null;
    const classified = classifyRetryable(error);
    const code = stop?.code ?? classified.code;
    const message = (error instanceof Error ? error.message : String(error)).slice(0, 2000);
    if (stop?.resumeFrom) {
      // Deterministic stages after a rejected draft re-run from the writer.
      const from = PRODUCTION_STAGES.indexOf(stop.resumeFrom);
      artifacts.completed = (artifacts.completed ?? []).filter((stage) => PRODUCTION_STAGES.indexOf(stage) < from);
    }
    job = await saveArtifacts(job.id, { status: "failed", stage: currentStage, error: message, errorCode: code, finishedAt: new Date() }, artifacts);
    if (!stop && job.generationId) {
      await prisma.articleGeneration.update({ where: { id: job.generationId }, data: { status: "failed", error: message } }).catch(() => undefined);
    }
    if (job.operationId) {
      await failOperation(job.operationId, { errorCode: code, errorSummary: message, retryable: stop ? false : classified.retryable, phase: currentStage });
    }
    await syncPlanItem(job, "failed");
    await writeAudit({ tenantId: job.tenantId, action: "production.job.failed", entityType: "production_job", entityId: job.id, metadata: { stage: currentStage, errorCode: code } });
    structuredEvent("production.job.failed", { jobId: job.id, stage: currentStage, errorCode: code }, "warn");
    return toProductionJobView(job);
  }
}

// ────────────────────────────────────────────────────────────── Retry / cancel / review

async function loadJob(tenantId: string, jobId: string): Promise<ProductionJob> {
  const job = await prisma.productionJob.findFirst({ where: { id: jobId, tenantId } });
  if (!job) throw new ProductionError("production_job_not_found", undefined, 404);
  return job;
}

export async function retryProductionJob(tenantId: string, jobId: string, options: StartOptions = {}): Promise<ProductionJobView> {
  const job = await loadJob(tenantId, jobId);
  if (!canRetry(job)) throw new ProductionError("production_job_not_retryable", `job is ${job.status}`, 409);
  const claimed = await prisma.productionJob.updateMany({
    where: { id: job.id, status: job.status, updatedAt: job.updatedAt },
    data: { status: "queued", error: null, errorCode: null, cancelRequestedAt: null, finishedAt: null },
  });
  if (claimed.count === 0) throw new ProductionError("production_job_changed", "job changed concurrently, reload it", 409);
  if (job.operationId) await markOperationRetrying(job.operationId);
  await syncPlanItem(job, "generating");
  await writeAudit({ tenantId, actorType: options.userId ? "user" : "system", actorUserId: options.userId ?? null, action: "production.job.retried", entityType: "production_job", entityId: job.id, metadata: { fromStage: job.stage, attempts: job.attempts } });
  if (options.wait) {
    await runProductionJob(job.id, { now: options.now });
  } else {
    void runProductionJob(job.id, { now: options.now }).catch((error) => {
      structuredEvent("production.job.run_crashed", { jobId: job.id, error: error instanceof Error ? error.message : String(error) }, "error");
    });
  }
  return toProductionJobView(await prisma.productionJob.findUniqueOrThrow({ where: { id: job.id } }));
}

export async function cancelProductionJob(tenantId: string, jobId: string, userId?: string | null): Promise<ProductionJobView> {
  const job = await loadJob(tenantId, jobId);
  if (!canCancel(job)) {
    throw new ProductionError("production_job_not_cancellable", job.status === "running" ? "writing already completed; review or reject the draft instead" : `job is ${job.status}`, 409);
  }
  if (job.status === "running" && !isStale(job)) {
    // The runner stops at the next stage boundary and never materializes.
    await prisma.productionJob.update({ where: { id: job.id }, data: { cancelRequestedAt: new Date() } });
  } else {
    await finishCancelled(job);
  }
  await writeAudit({ tenantId, actorType: userId ? "user" : "system", actorUserId: userId ?? null, action: "production.job.cancel_requested", entityType: "production_job", entityId: job.id, metadata: { status: job.status, stage: job.stage } });
  return toProductionJobView(await prisma.productionJob.findUniqueOrThrow({ where: { id: job.id } }));
}

export async function reviewProductionJob(
  tenantId: string,
  jobId: string,
  input: { decision: "approve" | "reject"; notes?: string | null },
  userId?: string | null,
): Promise<ProductionJobView> {
  const job = await loadJob(tenantId, jobId);
  if (job.status !== "needs_review") throw new ProductionError("production_job_not_reviewable", `job is ${job.status}`, 409);
  const notes = input.notes?.trim().slice(0, 2000) || null;
  const approved = input.decision === "approve";
  const reviewed = { reviewDecision: input.decision, reviewNotes: notes, reviewedByUserId: userId ?? null, reviewedAt: new Date() };
  // Atomic claim: concurrent approve/reject cannot both win.
  const claimed = await prisma.productionJob.updateMany({ where: { id: job.id, tenantId, status: "needs_review" }, data: { ...reviewed, status: approved ? "ready" : "failed" } });
  if (claimed.count !== 1) throw new ProductionError("production_job_not_reviewable", "job was reviewed concurrently", 409);
  let updated: ProductionJob;
  if (approved) {
    // Approval marks the draft ready; publishing still goes through the authorized publish/schedule flows.
    updated = await prisma.productionJob.findUniqueOrThrow({ where: { id: job.id } });
    if (job.kind === "cluster" && job.versionId) {
      // Same effect the engine's own approve action has always had.
      await prisma.contentVersion.updateMany({ where: { id: job.versionId, tenantId }, data: { status: "qa_passed" } });
    }
    if (job.generationId) await prisma.articleGeneration.updateMany({ where: { id: job.generationId, tenantId }, data: { status: "approved" } });
    await syncPlanItem(updated, "ready");
  } else {
    // Rejection keeps the draft for reference; a retry writes a new version into the same project.
    const artifacts = artifactsOf(job);
    const from = PRODUCTION_STAGES.indexOf("write");
    artifacts.completed = (artifacts.completed ?? []).filter((stage) => PRODUCTION_STAGES.indexOf(stage) < from);
    updated = await saveArtifacts(job.id, { ...reviewed, status: "failed", stage: "write", errorCode: "review_rejected", error: notes ?? "rejected in review" }, artifacts);
    if (job.generationId) await prisma.articleGeneration.updateMany({ where: { id: job.generationId, tenantId }, data: { status: "rejected", error: notes } });
    await syncPlanItem(updated, "rejected");
  }
  await writeAudit({ tenantId, actorType: userId ? "user" : "system", actorUserId: userId ?? null, action: `production.job.${approved ? "approved" : "rejected"}`, entityType: "production_job", entityId: job.id, metadata: { notes, projectId: job.projectId, versionId: job.versionId } });
  return toProductionJobView(updated);
}

// ────────────────────────────────────────────────────────────── Queries

export async function getProductionJob(tenantId: string, jobId: string): Promise<ProductionJobView | null> {
  const job = await prisma.productionJob.findFirst({ where: { id: jobId, tenantId } });
  return job ? toProductionJobView(job) : null;
}

export async function listProductionJobs(
  tenantId: string,
  input: { siteId?: string; status?: ProductionJobStatus; kind?: string; planItemId?: string; clusterId?: string; page?: number; pageSize?: number } = {},
) {
  const page = Math.max(1, input.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, input.pageSize ?? 20));
  const where: Prisma.ProductionJobWhereInput = {
    tenantId,
    ...(input.siteId ? { siteId: input.siteId } : {}),
    ...(input.status ? { status: input.status } : {}),
    ...(input.kind ? { kind: input.kind } : {}),
    ...(input.planItemId ? { planItemId: input.planItemId } : {}),
    ...(input.clusterId ? { clusterId: input.clusterId } : {}),
  };
  const [total, rows, counts] = await prisma.$transaction([
    prisma.productionJob.count({ where }),
    prisma.productionJob.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
    prisma.productionJob.groupBy({ by: ["status"], where: { tenantId, ...(input.siteId ? { siteId: input.siteId } : {}) }, orderBy: { status: "asc" }, _count: { _all: true } }),
  ]);
  const statusCounts: Record<string, number> = {};
  for (const row of counts) {
    const count = row._count;
    statusCounts[row.status] = typeof count === "object" && count !== null && "_all" in count ? (count as { _all: number })._all : 0;
  }
  return { items: rows.map(toProductionJobView), page, pageSize, total, counts: statusCounts };
}

// ────────────────────────────────────────────────────────────── Plan item entry (replaces generateContentFromEditorialPlanItem)

/**
 * Drop-in replacement for generateContentFromEditorialPlanItem: same return
 * shape ({ item, project }) plus `job`. Website items run through the governed
 * pipeline; social items (x/instagram) still use the legacy social generator.
 */
export async function startProductionForPlanItem(tenantId: string, planItemId: string, userId?: string | null) {
  const item = await prisma.editorialPlanItem.findFirst({ where: { id: planItemId, tenantId }, include: { project: true } });
  if (!item) return null;
  if (item.channel !== "website") {
    // shortcut: the article writer cannot produce social packs; move social to the pipeline once a social writer stage exists.
    const legacy = await generateContentFromEditorialPlanItem(tenantId, planItemId, userId);
    return legacy ? { ...legacy, job: null } : null;
  }
  const jobByItem = await prisma.productionJob.findFirst({ where: { tenantId, planItemId: item.id }, orderBy: { createdAt: "desc" } });
  if (item.projectId && item.project && !jobByItem) {
    // Generated before the pipeline existed: keep the legacy answer.
    return { item, project: item.project, job: null };
  }
  const { job, created } = await startProduction(tenantId, { kind: "plan_item", planItemId: item.id }, { userId });
  if (created) {
    await writeAudit({ tenantId, actorType: userId ? "user" : "system", actorUserId: userId, action: "editorial_plan_item.content_generation_started", entityType: "editorial_plan_item", entityId: item.id, metadata: { projectId: job.projectId, productionJobId: job.id } });
  }
  const [freshItem, project] = await Promise.all([
    prisma.editorialPlanItem.findUnique({ where: { id: item.id } }),
    job.projectId ? prisma.contentProject.findUnique({ where: { id: job.projectId } }) : Promise.resolve(null),
  ]);
  return { item: freshItem, project, job };
}
