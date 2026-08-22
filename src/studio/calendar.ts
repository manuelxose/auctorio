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

export async function listCalendarEvents(tenantId: string, filters: CalendarFilters) {
  const where: Prisma.PublicationWhereInput = {
    tenantId,
    status: { not: "deleted" },
    ...(filters.channel ? { channel: filters.channel } : {}),
    ...(filters.siteId ? { siteId: filters.siteId } : {}),
    scheduledFor: { gte: filters.from, lte: filters.to },
  };

  const publications = await prisma.publication.findMany({
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
  });

  const events = await Promise.all(
    publications.map(async (publication) => ({
      id: publication.id,
      projectId: publication.projectId,
      channel: publication.channel,
      status: publication.status,
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
      createdAt: publication.createdAt,
      updatedAt: publication.updatedAt,
    })),
  );

  return events;
}
