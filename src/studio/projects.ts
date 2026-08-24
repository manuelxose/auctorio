import { getPrismaClient } from "../infrastructure/db/prisma";
import { writeAudit } from "./audit";

const prisma = getPrismaClient();

export type ArchiveProjectInput = {
  reason?: string | null;
  mode?: "archive" | "unpublish_delete";
  actorUserId?: string | null;
};

export type ArchiveProjectResult = {
  projectId: string;
  archived: boolean;
  externalPublicationsDeleted: number;
  externalPublicationsUnpublished: number;
  mode: "archive" | "unpublish_delete";
};

export async function archiveProject(
  tenantId: string,
  projectId: string,
  input: ArchiveProjectInput,
): Promise<ArchiveProjectResult> {
  const project = await prisma.contentProject.findFirst({
    where: { id: projectId, tenantId },
    include: {
      publications: true,
      site: true,
    },
  });
  if (!project) {
    throw new Error("project_not_found");
  }
  if (project.deletedAt) {
    throw new Error("project_already_archived");
  }

  const activePublications = project.publications.filter((publication) =>
    ["draft", "ready", "scheduled", "queued", "publishing"].includes(publication.status),
  );
  if (activePublications.length > 0) {
    throw new Error("project_has_scheduled_publications");
  }

  const publishedPublications = project.publications.filter((publication) => publication.status === "published");
  let externalPublicationsDeleted = 0;
  let externalPublicationsUnpublished = 0;

  if (input.mode === "unpublish_delete" && publishedPublications.length > 0) {
    const { enqueueSocialJob } = await import("../infrastructure/queue/producer");
    const { claimDuePublications } = await import("./publication");
    void claimDuePublications;
    for (const publication of publishedPublications) {
      if (publication.channel === "website" && publication.externalId) {
        // Website unpublish flows through the existing publication job pipeline.
        await prisma.publication.update({
          where: { id: publication.id },
          data: {
            status: "queued",
            metadata: {
              ...(publication.metadata && typeof publication.metadata === "object"
                ? publication.metadata
                : {}),
              unpublishRequested: true,
            },
          },
        });
        await enqueueUnpublishForWebsite(tenantId, publication);
        externalPublicationsUnpublished += 1;
      } else if (publication.externalId) {
        const attempt = await prisma.publicationAttempt.create({
          data: {
            tenantId,
            publicationId: publication.id,
            attemptNumber: publication.currentAttempt + 1,
            status: "queued",
            requestPayload: { action: "unpublish" },
          },
        });
        await enqueueSocialJob(attempt.id, {
          kind: "unpublish",
          attemptId: attempt.id,
          publicationId: publication.id,
        });
        externalPublicationsUnpublished += 1;
      } else {
        await prisma.publication.update({
          where: { id: publication.id },
          data: { status: "deleted" },
        });
        externalPublicationsDeleted += 1;
      }
    }
  }

  await prisma.contentProject.update({
    where: { id: project.id },
    data: {
      deletedAt: new Date(),
      deletedBy: input.actorUserId ? "studio_user" : "studio",
      deletedByStudioUserId: input.actorUserId ?? null,
      deletionReason: input.reason ?? null,
    },
  });

  await writeAudit({
    tenantId,
    action: "project.archived",
    entityType: "content_project",
    entityId: project.id,
    actorType: input.actorUserId ? "user" : "system",
    actorUserId: input.actorUserId,
    metadata: {
      mode: input.mode ?? "archive",
      reason: input.reason ?? null,
      title: project.title,
    },
  });

  return {
    projectId: project.id,
    archived: true,
    externalPublicationsDeleted,
    externalPublicationsUnpublished,
    mode: input.mode ?? "archive",
  };
}

async function enqueueUnpublishForWebsite(
  tenantId: string,
  publication: { id: string; projectId: string; versionId: string; siteId: string | null },
) {
  const { createPublicationJob, resetPublicationJobForRetry } = await import("./repository");
  const { queuePublication } = await import("./orchestration");
  if (!publication.siteId) {
    return;
  }
  const idempotencyKey = `unpublish:${tenantId}:${publication.siteId}:${publication.projectId}:${publication.versionId}`;
  const existing = await prisma.publicationJob.findFirst({
    where: { tenantId, idempotencyKey },
  });
  if (existing && ["queued", "processing"].includes(existing.status)) {
    await queuePublication(existing.id);
    return;
  }
  if (existing) {
    // failed/canceled: reset the stable-key row and requeue instead of hitting
    // the (tenant_id, idempotency_key) unique index with a new row.
    const retried = await resetPublicationJobForRetry(existing.id, {
      action: "unpublish",
      targetStatus: "publish",
      requestedBy: "archive_flow",
    });
    await queuePublication(retried.id);
    return;
  }
  const job = await createPublicationJob(
    tenantId,
    publication.siteId,
    publication.projectId,
    publication.versionId,
    "unpublish",
    { action: "unpublish", targetStatus: "publish", requestedBy: "archive_flow" },
    null,
    idempotencyKey,
  );
  await queuePublication(job.id);
}
