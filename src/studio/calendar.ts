import { Prisma } from "@prisma/client";
import type { PublicationChannel } from "@prisma/client";
import { getPrismaClient } from "../infrastructure/db/prisma";
import { buildAssetPublicUrl } from "./orchestration";

const prisma = getPrismaClient();

export type CalendarFilters = {
  from: Date;
  to: Date;
  channel?: PublicationChannel;
  siteId?: string;
};

/**
 * One schedule projection over the editorial lifecycle: plan items (proposal →
 * approved → generating → draft) until a publication exists for their content,
 * then the publication itself (scheduled → published / failed). Nothing is copied:
 * each event points back at its source record, and publications carry the
 * originating plan item so a brief stays traceable through to delivery.
 */
export async function listCalendarEvents(tenantId: string, filters: CalendarFilters) {
  const where: Prisma.PublicationWhereInput = {
    tenantId,
    status: { not: "deleted" },
    ...(filters.channel ? { channel: filters.channel } : {}),
    ...(filters.siteId ? { siteId: filters.siteId } : {}),
    scheduledFor: { gte: filters.from, lte: filters.to },
  };

  const [publications, planItems] = await Promise.all([
    prisma.publication.findMany({
      where,
      orderBy: { scheduledFor: "asc" },
      include: {
        project: { select: { id: true, title: true, status: true, origin: true } },
        version: {
          select: {
            id: true,
            versionNumber: true,
            title: true,
            contentImage: { select: { storagePath: true } },
          },
        },
        account: { select: { id: true, platform: true, displayName: true } },
        site: { select: { id: true, key: true, name: true, type: true } },
        socialContent: { select: { id: true, contentType: true, body: true } },
      },
    }),
    prisma.editorialPlanItem.findMany({
      where: {
        tenantId,
        status: { not: "rejected" },
        plan: { status: { not: "archived" } },
        ...(filters.channel ? { channel: filters.channel } : {}),
        ...(filters.siteId ? { siteId: filters.siteId } : {}),
        scheduledFor: { gte: filters.from, lte: filters.to },
      },
      orderBy: { scheduledFor: "asc" },
      include: {
        plan: { select: { id: true, name: true } },
        project: { select: { id: true, status: true, publications: { where: { status: { not: "deleted" } }, select: { id: true, channel: true } } } },
        site: { select: { id: true, key: true, name: true, type: true } },
      },
    }),
  ]);

  // Content → plan item, so publications can point back at their brief.
  const linkedItems = publications.length
    ? await prisma.editorialPlanItem.findMany({
        where: { tenantId, projectId: { in: [...new Set(publications.map((publication) => publication.projectId))] } },
        select: { id: true, planId: true, projectId: true, channel: true },
      })
    : [];

  const publicationEvents = await Promise.all(
    publications.map(async (publication) => {
      const brief = linkedItems.find((item) => item.projectId === publication.projectId && item.channel === publication.channel)
        ?? linkedItems.find((item) => item.projectId === publication.projectId);
      return {
        kind: "publication" as const,
        id: publication.id,
        projectId: publication.projectId,
        planId: brief?.planId ?? null,
        planItemId: brief?.id ?? null,
        channel: publication.channel,
        status: publication.status as string,
        scheduledFor: publication.scheduledFor,
        publishedAt: publication.publishedAt,
        externalUrl: publication.externalUrl,
        title:
          publication.channel === "website"
            ? publication.version.title || publication.project.title
            : publication.socialContent?.body.slice(0, 80) || publication.project.title,
        projectTitle: publication.project.title,
        destination: publication.channel === "website"
          ? publication.site?.name ?? "Website"
          : publication.account?.displayName ?? publication.channel,
        site: publication.site,
        account: publication.account,
        thumbnail: await buildAssetPublicUrl(publication.version.contentImage?.storagePath ?? null),
        automated: publication.project.origin === "auto",
        lastError: publication.lastError,
        failureClass: publication.failureClass,
        priority: null as number | null,
        contentType: null as string | null,
        createdAt: publication.createdAt,
        updatedAt: publication.updatedAt,
      };
    }),
  );

  // A plan item whose content already has a publication on its channel is represented by that publication.
  const planEvents = planItems
    .filter((item) => !item.project?.publications.some((publication) => publication.channel === item.channel))
    .map((item) => ({
      kind: "plan_item" as const,
      id: item.id,
      projectId: item.projectId,
      planId: item.planId,
      planItemId: item.id,
      channel: item.channel,
      status: item.status as string,
      scheduledFor: item.scheduledFor,
      publishedAt: null,
      externalUrl: null,
      title: item.finalSuggestedTitle || item.workingTitle || item.title,
      projectTitle: item.plan.name,
      destination: item.site?.name ?? item.channel,
      site: item.site,
      account: null,
      thumbnail: null,
      automated: false,
      lastError: null,
      failureClass: null,
      priority: item.priority,
      contentType: item.contentType,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    }));

  return [...publicationEvents, ...planEvents].sort(
    (a, b) => (a.scheduledFor?.getTime() ?? 0) - (b.scheduledFor?.getTime() ?? 0),
  );
}
