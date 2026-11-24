import { Prisma } from "@prisma/client";
import type { PublicationChannel } from "@prisma/client";
import { getPrismaClient } from "../infrastructure/db/prisma";
import { buildAssetPublicUrl } from "./orchestration";
import { articleChip, articleState } from "./article-lifecycle";
import { nextSocialSlot, SOCIAL_SETTINGS_DEFAULTS } from "./social-settings";

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
  const now = new Date();
  const where: Prisma.PublicationWhereInput = {
    tenantId,
    status: { not: "deleted" },
    ...(filters.channel ? { channel: filters.channel } : {}),
    ...(filters.siteId ? { siteId: filters.siteId } : {}),
    scheduledFor: { gte: filters.from, lte: filters.to },
  };

  const [publications, planItems, socialDrafts] = await Promise.all([
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
    filters.channel === "website" || filters.to <= now ? [] : prisma.socialContent.findMany({
      where: {
        tenantId,
        channel: filters.channel,
        generationStatus: "done",
        editorialStatus: "draft",
        OR: [{ threadPosition: null }, { threadPosition: 0 }],
        publications: { none: { status: { not: "deleted" } } },
        ...(filters.siteId ? { project: { siteId: filters.siteId } } : {}),
      },
      select: {
        id: true, projectId: true, channel: true, contentType: true, body: true, createdAt: true, updatedAt: true,
        project: { select: {
          title: true,
          origin: true,
          site: { select: { id: true, key: true, name: true, type: true, socialSettings: true } },
        } },
      },
    }),
  ]);

  // Content → plan item, so publications can point back at their brief.
  const linkedItems = publications.length
    ? await prisma.editorialPlanItem.findMany({
        where: { tenantId, projectId: { in: [...new Set(publications.map((publication) => publication.projectId))] } },
        select: { id: true, planId: true, projectId: true, channel: true, status: true },
      })
    : [];

  // Latest production job per plan item feeds the derived lifecycle.
  const planItemIds = [...new Set([...planItems.map((item) => item.id), ...linkedItems.map((item) => item.id)])];
  const jobs = planItemIds.length
    ? await prisma.productionJob.findMany({ where: { tenantId, planItemId: { in: planItemIds } }, orderBy: { createdAt: "asc" }, select: { planItemId: true, status: true } })
    : [];
  const jobByItem = new Map(jobs.map((job) => [job.planItemId, job]));
  const lifecycle = (records: Parameters<typeof articleState>[0]) => {
    const state = articleState(records);
    return { lifecycle: state, chip: articleChip(state) };
  };

  const publicationEvents = await Promise.all(
    publications.map(async (publication) => {
      const brief = linkedItems.find((item) => item.projectId === publication.projectId && item.channel === publication.channel);
      return {
        kind: "publication" as const,
        id: publication.id,
        projectId: publication.projectId,
        planId: brief?.planId ?? null,
        planItemId: brief?.id ?? null,
        socialContentId: publication.socialContent?.id ?? null,
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
        contentType: publication.socialContent?.contentType ?? null,
        primaryKeyword: null as string | null,
        searchVolume: null as number | null,
        keywordDifficulty: null as number | null,
        createdAt: publication.createdAt,
        updatedAt: publication.updatedAt,
        ...lifecycle({ planItem: brief, job: brief ? jobByItem.get(brief.id) : null, publication }),
      };
    }),
  );

  const publishedSocialIds = new Set(publications.map((publication) => publication.socialContentId));
  const socialEvents = socialDrafts.flatMap((draft) => {
    if (publishedSocialIds.has(draft.id)) return [];
    const { socialSettings, ...site } = draft.project.site;
    const scheduledFor = nextSocialSlot(socialSettings ?? SOCIAL_SETTINGS_DEFAULTS, now);
    if (scheduledFor < filters.from || scheduledFor > filters.to) return [];
    return [{
      kind: "social_draft" as const,
      id: draft.id,
      socialContentId: draft.id,
      projectId: draft.projectId,
      planId: null,
      planItemId: null,
      channel: draft.channel,
      status: "draft",
      scheduledFor,
      publishedAt: null,
      externalUrl: null,
      title: draft.body.slice(0, 80) || draft.project.title,
      projectTitle: draft.project.title,
      destination: site.name,
      site,
      account: null,
      thumbnail: null,
      automated: draft.project.origin === "auto",
      lastError: null,
      failureClass: null,
      priority: null,
      contentType: draft.contentType,
      createdAt: draft.createdAt,
      updatedAt: draft.updatedAt,
      lifecycle: "needs_review",
      chip: "review" as const,
    }];
  });
  const socialKeys = new Set(socialEvents.map((event) => `${event.projectId}:${event.channel}`));
  // A plan item is represented by the draft or publication on its channel.
  const planEvents = planItems
    .filter((item) => !item.project?.publications.some((publication) => publication.channel === item.channel))
    .filter((item) => !socialKeys.has(`${item.projectId}:${item.channel}`))
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
      primaryKeyword: item.primaryKeyword,
      // A number is only shown with the provider that measured it (never estimated).
      searchVolume: item.keywordMetricsSource ? item.searchVolume : null,
      keywordDifficulty: item.keywordMetricsSource ? item.keywordDifficulty : null,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      ...lifecycle({ planItem: item, job: jobByItem.get(item.id) }),
    }));

  return [...publicationEvents, ...planEvents, ...socialEvents].sort(
    (a, b) => (a.scheduledFor?.getTime() ?? 0) - (b.scheduledFor?.getTime() ?? 0),
  );
}
