import { Prisma } from "@prisma/client";
import type { Publication, PublicationAttemptStatus, PublicationChannel, PublicationState } from "@prisma/client";
import { getPrismaClient } from "../infrastructure/db/prisma";
import { getNumberEnv } from "../shared/utils/env";
import {
  createPublicationJob,
  getLatestVersion,
  getProjectById,
  getSiteById,
  resetPublicationJobForRetry,
  updateProjectStatus,
} from "./repository";
import { queuePublication } from "./orchestration";
import { writeAudit } from "./audit";

const prisma = getPrismaClient();

// ────────────────────────────────────────────────────────────── State machine

export const PUBLICATION_STATES: PublicationState[] = [
  "draft",
  "ready",
  "scheduled",
  "queued",
  "publishing",
  "published",
  "failed",
  "canceled",
  "deleted",
  "unpublished",
];

const ALLOWED_TRANSITIONS: Record<PublicationState, PublicationState[]> = {
  draft: ["ready", "scheduled", "canceled", "deleted"],
  ready: ["scheduled", "queued", "canceled", "deleted"],
  scheduled: ["queued", "canceled", "deleted", "draft"],
  queued: ["publishing", "canceled", "failed", "deleted"],
  publishing: ["published", "failed", "unpublished"],
  published: ["unpublished", "ready", "deleted"],
  failed: ["queued", "canceled", "deleted", "draft"],
  canceled: ["scheduled", "deleted"],
  deleted: [],
  unpublished: ["deleted", "ready"],
};

export function canTransition(from: PublicationState, to: PublicationState): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

export function transitionPublication(from: PublicationState, to: PublicationState): PublicationState {
  if (from === to) {
    return to;
  }
  if (!canTransition(from, to)) {
    throw new Error(`invalid_publication_transition ${from} -> ${to}`);
  }
  return to;
}

// ────────────────────────────────────────────────────────────── Error classification

export type FailureClass = "transient" | "permanent";

const TRANSIENT_PATTERNS = [
  /timeout/i,
  /timed out/i,
  /status=429/i,
  /status=5\d\d/i,
  /status=502/i,
  /status=503/i,
  /status=504/i,
  /ECONNRESET/i,
  /ECONNREFUSED/i,
  /ETIMEDOUT/i,
  /fetch failed/i,
  /network/i,
  /rate.?limit/i,
];

const PERMANENT_PATTERNS = [
  /invalid.*credential/i,
  /unauthorized/i,
  /status=401/i,
  /status=403/i,
  /deleted account/i,
  /account.*suspend/i,
  /invalid.*media/i,
  /media.*not.*found/i,
  /permission denied/i,
  /missing_publishing_credentials/i,
];

export function classifyPublicationError(message: string): FailureClass {
  if (PERMANENT_PATTERNS.some((pattern) => pattern.test(message))) {
    return "permanent";
  }
  if (TRANSIENT_PATTERNS.some((pattern) => pattern.test(message))) {
    return "transient";
  }
  return "transient";
}

export function nextRetryDelay(retryCount: number): number {
  const baseMs = Math.max(30_000, getNumberEnv("PUBLICATION_RETRY_BASE_MS", 60_000));
  const multiplier = Math.pow(2, Math.min(retryCount, 6));
  return Math.min(baseMs * multiplier, 3_600_000);
}

export function maxPublicationRetries(): number {
  return Math.max(0, getNumberEnv("PUBLICATION_MAX_RETRIES", 3));
}

export async function linkDurableWebsitePublication(
  tenantId: string,
  siteId: string,
  projectId: string,
  versionId: string,
  publicationJobId: string,
): Promise<void> {
  const existing = await prisma.publication.findFirst({
    where: { tenantId, projectId, versionId, channel: "website" },
  });
  if (existing) {
    await prisma.publication.update({
      where: { id: existing.id },
      data: { publicationJobId },
    });
    return;
  }

  const created = await createPublication({
    tenantId,
    projectId,
    versionId,
    channel: "website",
    siteId,
    scheduledFor: new Date(),
    manualOverride: true,
  });
  await prisma.publication.update({
    where: { id: created.id },
    data: { publicationJobId, status: "publishing" },
  });
}

// ────────────────────────────────────────────────────────────── CRUD

export type CreatePublicationInput = {
  tenantId: string;
  projectId: string;
  versionId: string;
  channel: PublicationChannel;
  accountId?: string | null;
  siteId?: string | null;
  socialContentId?: string | null;
  scheduledFor?: Date | string | null;
  campaignId?: string | null;
  manualOverride?: boolean;
};

export async function createPublication(input: CreatePublicationInput): Promise<Publication> {
  const scheduledFor = input.scheduledFor
    ? input.scheduledFor instanceof Date
      ? input.scheduledFor
      : new Date(input.scheduledFor)
    : null;

  const idempotencyKey = [
    "publication",
    input.projectId,
    input.versionId,
    input.channel,
    input.accountId ?? "default",
    scheduledFor ? scheduledFor.toISOString() : "now",
  ].join(":");

  const existing = await prisma.publication.findFirst({
    where: {
      tenantId: input.tenantId,
      idempotencyKey,
    },
  });
  if (existing) {
    return existing;
  }

  const publication = await prisma.publication.create({
    data: {
      tenantId: input.tenantId,
      projectId: input.projectId,
      versionId: input.versionId,
      channel: input.channel,
      accountId: input.accountId ?? null,
      siteId: input.siteId ?? null,
      socialContentId: input.socialContentId ?? null,
      campaignId: input.campaignId ?? null,
      scheduledFor,
      status: scheduledFor ? "scheduled" : "draft",
      manualOverride: input.manualOverride ?? false,
      idempotencyKey,
      metadata: Prisma.JsonNull,
    },
  });

  await writeAudit({
    tenantId: input.tenantId,
    action: scheduledFor ? "publication.scheduled" : "publication.created",
    entityType: "publication",
    entityId: publication.id,
    actorType: input.manualOverride ? "user" : "system",
    metadata: { channel: input.channel, scheduledFor: scheduledFor?.toISOString() ?? null },
  });

  return publication;
}

export async function getPublication(tenantId: string, publicationId: string) {
  return prisma.publication.findFirst({
    where: { id: publicationId, tenantId },
    include: {
      project: { select: { id: true, title: true, status: true } },
      version: {
        select: {
          id: true,
          versionNumber: true,
          status: true,
          title: true,
          contentImage: { select: { storagePath: true } },
        },
      },
      account: { select: { id: true, platform: true, displayName: true, status: true } },
      site: { select: { id: true, key: true, name: true, type: true } },
      socialContent: true,
      attempts: { orderBy: { attemptNumber: "desc" }, take: 10 },
    },
  });
}

export async function listPublications(
  tenantId: string,
  input: {
    page: number;
    pageSize: number;
    channel?: PublicationChannel;
    status?: PublicationState;
    projectId?: string;
    siteId?: string;
    search?: string;
    dateFrom?: string;
    dateTo?: string;
    sort?: "scheduled" | "created" | "updated";
    direction?: "asc" | "desc";
    failedOnly?: boolean;
  },
) {
  const skip = (input.page - 1) * input.pageSize;
  const where: Prisma.PublicationWhereInput = {
    tenantId,
    status: input.status ? input.status : { not: "deleted" },
    ...(input.channel ? { channel: input.channel } : {}),
    ...(input.projectId ? { projectId: input.projectId } : {}),
    ...(input.siteId ? { siteId: input.siteId } : {}),
    ...(input.failedOnly ? { status: "failed" } : {}),
    ...(input.dateFrom || input.dateTo
      ? {
          scheduledFor: {
            ...(input.dateFrom ? { gte: new Date(input.dateFrom) } : {}),
            ...(input.dateTo ? { lte: new Date(input.dateTo) } : {}),
          },
        }
      : {}),
    ...(input.search
      ? {
          project: {
            title: { contains: input.search, mode: "insensitive" },
          },
        }
      : {}),
  };

  const sortField = input.sort ?? "scheduled";
  const direction = input.direction ?? "desc";
  const orderBy: Prisma.PublicationOrderByWithRelationInput[] =
    sortField === "scheduled"
      ? [{ scheduledFor: direction }]
      : sortField === "created"
        ? [{ createdAt: direction }]
        : [{ updatedAt: direction }];

  const [total, items] = await prisma.$transaction([
    prisma.publication.count({ where }),
    prisma.publication.findMany({
      where,
      orderBy,
      skip,
      take: input.pageSize,
      include: {
        project: { select: { id: true, title: true, status: true } },
        version: {
          select: {
            id: true,
            versionNumber: true,
            status: true,
            title: true,
            contentImage: { select: { storagePath: true } },
          },
        },
        account: { select: { id: true, platform: true, displayName: true } },
        site: { select: { id: true, key: true, name: true, type: true } },
        socialContent: { select: { id: true, contentType: true, channel: true, body: true, characterCount: true } },
      },
    }),
  ]);

  return {
    items,
    page: input.page,
    pageSize: input.pageSize,
    total,
  };
}

export async function updatePublicationSchedule(
  tenantId: string,
  publicationId: string,
  input: {
    scheduledFor?: Date | string;
    accountId?: string | null;
    cancel?: boolean;
  },
): Promise<Publication | null> {
  const publication = await prisma.publication.findFirst({ where: { id: publicationId, tenantId } });
  if (!publication) {
    return null;
  }

  if (["publishing", "published", "deleted"].includes(publication.status)) {
    throw new Error("publication_not_editable");
  }

  const targetState = input.cancel ? "canceled" : "scheduled";
  transitionPublication(publication.status, targetState);

  const updated = await prisma.publication.update({
    where: { id: publication.id },
    data: {
      status: targetState,
      ...(input.cancel
        ? {}
        : {
            scheduledFor: input.scheduledFor
              ? input.scheduledFor instanceof Date
                ? input.scheduledFor
                : new Date(input.scheduledFor)
              : publication.scheduledFor,
          }),
      ...(input.accountId !== undefined
        ? { accountId: input.accountId }
        : {}),
      manualOverride: true,
      scheduleLocked: true,
      lastError: input.cancel ? publication.lastError : null,
      nextRetryAt: input.cancel ? null : publication.nextRetryAt,
      failureReason: input.cancel ? null : publication.failureReason,
      failureClass: input.cancel ? null : publication.failureClass,
    },
  });

  await writeAudit({
    tenantId,
    action: input.cancel ? "publication.canceled" : "publication.rescheduled",
    entityType: "publication",
    entityId: publication.id,
    actorType: "user",
    metadata: { scheduledFor: updated.scheduledFor?.toISOString() ?? null },
  });

  return updated;
}

export async function retryPublication(tenantId: string, publicationId: string): Promise<Publication | null> {
  const publication = await prisma.publication.findFirst({ where: { id: publicationId, tenantId } });
  if (!publication) {
    return null;
  }
  if (publication.status !== "failed" && publication.status !== "canceled") {
    throw new Error(`publication_not_retryable ${publication.status}`);
  }

  const updated = await prisma.publication.update({
    where: { id: publication.id },
    data: {
      status: "scheduled",
      scheduledFor: publication.scheduledFor ?? new Date(),
      nextRetryAt: null,
      lastError: null,
      failureReason: null,
      failureClass: null,
    },
  });

  await writeAudit({
    tenantId,
    action: "publication.retried",
    entityType: "publication",
    entityId: publication.id,
    actorType: "user",
  });

  return updated;
}

export async function deletePublication(tenantId: string, publicationId: string): Promise<Publication | null> {
  const publication = await prisma.publication.findFirst({ where: { id: publicationId, tenantId } });
  if (!publication) {
    return null;
  }
  if (publication.status === "publishing") {
    throw new Error("publication_in_progress");
  }

  const updated = await prisma.publication.update({
    where: { id: publication.id },
    data: { status: "deleted", manualOverride: true },
  });

  await writeAudit({
    tenantId,
    action: "publication.deleted",
    entityType: "publication",
    entityId: publication.id,
    actorType: "user",
  });

  return updated;
}

export async function unpublishPublication(tenantId: string, publicationId: string): Promise<Publication | null> {
  const publication = await prisma.publication.findFirst({ where: { id: publicationId, tenantId } });
  if (!publication) {
    return null;
  }
  if (publication.status !== "published") {
    throw new Error(`publication_not_published ${publication.status}`);
  }
  if (!publication.externalId) {
    throw new Error("publication_missing_external_id");
  }

  const updated = await prisma.publication.update({
    where: { id: publication.id },
    data: {
      status: "queued",
      nextRetryAt: null,
      metadata: {
        ...(publication.metadata && typeof publication.metadata === "object" ? publication.metadata : {}),
        unpublishRequested: true,
      } as Prisma.InputJsonObject,
    },
  });

  await enqueuePublication(updated.id);

  return updated;
}

// ────────────────────────────────────────────────────────────── Scheduler

export async function claimDuePublications(batchSize = 20): Promise<string[]> {
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM publications
    WHERE status IN ('scheduled', 'failed')
      AND (
        (status = 'scheduled' AND scheduled_for <= now())
        OR (status = 'failed' AND next_retry_at IS NOT NULL AND next_retry_at <= now())
      )
    ORDER BY scheduled_for ASC
    LIMIT ${batchSize}
    FOR UPDATE SKIP LOCKED
  `;

  const ids = rows.map((row) => row.id);
  if (ids.length === 0) {
    return [];
  }

  await prisma.publication.updateMany({
    where: { id: { in: ids } },
    data: { status: "queued" },
  });

  return ids;
}

export async function enqueuePublication(publicationId: string): Promise<void> {
  const publication = await prisma.publication.findUnique({
    where: { id: publicationId },
    include: { project: true, version: true },
  });
  if (!publication) {
    throw new Error("publication_not_found");
  }

  if (publication.channel === "website") {
    await enqueueWebsitePublication(publication.id);
    return;
  }

  const { enqueueSocialJob } = await import("../infrastructure/queue/producer");
  const attemptNumber = publication.currentAttempt + 1;
  const attempt = await prisma.publicationAttempt.create({
    data: {
      tenantId: publication.tenantId,
      publicationId: publication.id,
      attemptNumber,
      status: "queued",
      requestPayload: {
        channel: publication.channel,
        scheduledFor: publication.scheduledFor?.toISOString() ?? null,
      } as Prisma.InputJsonObject,
    },
  });

  await prisma.publication.update({
    where: { id: publication.id },
    data: {
      status: "publishing",
      currentAttempt: attemptNumber,
    },
  });

  const { createOperation } = await import("./operations");
  const operation = await createOperation({
    tenantId: publication.tenantId,
    siteId: publication.siteId,
    type: "publish",
    initiatorUserId: null,
    entityType: "publication",
    entityId: publication.id,
    queueName: "queue_social",
    jobKey: attempt.id,
    metadata: { channel: publication.channel },
  });

  await enqueueSocialJob(attempt.id, {
    kind: "publish",
    attemptId: attempt.id,
    publicationId: publication.id,
    operationId: operation.id,
  });
}

async function enqueueWebsitePublication(publicationId: string): Promise<void> {
  const publication = await prisma.publication.findUnique({
    where: { id: publicationId },
  });
  if (!publication) {
    throw new Error("publication_not_found");
  }

  const project = await getProjectById(publication.tenantId, publication.projectId);
  if (!project || !publication.siteId) {
    throw new Error("website_publication_requires_site");
  }

  const version = await getLatestVersion(publication.projectId, publication.tenantId);
  if (!version) {
    throw new Error("version_not_found");
  }

  const site = await getSiteById(publication.tenantId, publication.siteId);
  if (!site) {
    throw new Error("site_not_found");
  }

  const unpublishRequested =
    publication.metadata &&
    typeof publication.metadata === "object" &&
    (publication.metadata as Record<string, unknown>).unpublishRequested === true;

  const latestExternalId = publication.externalId;
  const action = unpublishRequested ? "unpublish" : latestExternalId ? "update" : "publish";

  const idempotencyKey = [
    "pub",
    site.id,
    project.id,
    version.id,
    action,
    "publish",
  ].join(":");

  const existingJob = await prisma.publicationJob.findFirst({
    where: {
      tenantId: publication.tenantId,
      idempotencyKey,
    },
  });
  if (existingJob && ["queued", "processing", "draft_synced", "published"].includes(existingJob.status)) {
    await prisma.publication.update({
      where: { id: publication.id },
      data: { publicationJobId: existingJob.id },
    });
    return;
  }

  if (existingJob) {
    // The idempotency key is stable per (site, project, version, action), so a
    // failed/canceled job cannot be re-created without violating the unique
    // index. Reset the row and requeue it instead — retries must be possible.
    const retried = await resetPublicationJobForRetry(existingJob.id, {
      action,
      targetStatus: "publish",
      requestedBy: "scheduler",
    });
    await updateProjectStatus(publication.tenantId, project.id, "publish_queued");
    await prisma.publication.update({
      where: { id: publication.id },
      data: { publicationJobId: retried.id },
    });
    await queuePublication(retried.id);
    return;
  }

  const job = await createPublicationJob(
    publication.tenantId,
    site.id,
    project.id,
    version.id,
    action,
    {
      action,
      targetStatus: "publish",
      requestedBy: "scheduler",
    },
    null,
    idempotencyKey,
  );
  await updateProjectStatus(publication.tenantId, project.id, "publish_queued");
  await prisma.publication.update({
    where: { id: publication.id },
    data: { publicationJobId: job.id },
  });
  await queuePublication(job.id);
}

// ────────────────────────────────────────────────────────────── Attempt outcomes

export async function startAttempt(tenantId: string, attemptId: string) {
  return prisma.publicationAttempt.updateMany({
    where: { id: attemptId, tenantId },
    data: { status: "running", startedAt: new Date() },
  });
}

export async function succeedAttempt(
  tenantId: string,
  attemptId: string,
  input: { externalId?: string | null; externalUrl?: string | null; responsePayload?: Record<string, unknown> | null },
) {
  const attempt = await prisma.publicationAttempt.findFirst({ where: { id: attemptId, tenantId } });
  if (!attempt) {
    return null;
  }
  await prisma.publicationAttempt.update({
    where: { id: attempt.id },
    data: {
      status: "succeeded",
      finishedAt: new Date(),
      externalId: input.externalId ?? null,
      externalUrl: input.externalUrl ?? null,
      responsePayload: input.responsePayload ? (input.responsePayload as Prisma.InputJsonObject) : Prisma.JsonNull,
    },
  });

  const publication = await prisma.publication.findUnique({ where: { id: attempt.publicationId } });
  if (!publication) {
    return null;
  }

  const unpublishRequested =
    publication.metadata &&
    typeof publication.metadata === "object" &&
    (publication.metadata as Record<string, unknown>).unpublishRequested === true;

  await prisma.publication.update({
    where: { id: publication.id },
    data: {
      status: unpublishRequested ? "unpublished" : "published",
      publishedAt: unpublishRequested ? null : new Date(),
      externalId: input.externalId ?? publication.externalId,
      externalUrl: input.externalUrl ?? publication.externalUrl,
      lastError: null,
      failureReason: null,
      failureClass: null,
      nextRetryAt: null,
    },
  });

  await writeAudit({
    tenantId,
    action: unpublishRequested ? "publication.unpublished" : "publication.published",
    entityType: "publication",
    entityId: publication.id,
    actorType: "automation",
    metadata: { externalId: input.externalId ?? null, channel: publication.channel },
  });

  return publication;
}

export async function failAttempt(
  tenantId: string,
  attemptId: string,
  error: Error,
): Promise<{ terminal: boolean } | null> {
  const attempt = await prisma.publicationAttempt.findFirst({ where: { id: attemptId, tenantId } });
  if (!attempt) {
    return null;
  }
  const failureClass = classifyPublicationError(error.message);

  await prisma.publicationAttempt.update({
    where: { id: attempt.id },
    data: {
      status: "failed",
      finishedAt: new Date(),
      error: error.message,
      errorClass: failureClass,
    },
  });

  const publication = await prisma.publication.findUnique({ where: { id: attempt.publicationId } });
  if (!publication) {
    return null;
  }

  const retryCount = publication.retryCount + 1;
  const terminal = failureClass === "permanent" || retryCount > maxPublicationRetries();
  const nextRetryAt = terminal ? null : new Date(Date.now() + nextRetryDelay(retryCount));

  await prisma.publication.update({
    where: { id: publication.id },
    data: {
      status: "failed",
      retryCount,
      lastError: error.message,
      failureClass,
      failureReason: terminal ? (failureClass === "permanent" ? "permanent_failure" : "retries_exhausted") : "awaiting_retry",
      nextRetryAt,
    },
  });

  await writeAudit({
    tenantId,
    action: "publication.failed",
    entityType: "publication",
    entityId: publication.id,
    actorType: "automation",
    metadata: {
      channel: publication.channel,
      attempt: attempt.attemptNumber,
      failureClass,
      terminal,
      error: error.message.slice(0, 400),
    },
  });

  return { terminal };
}
