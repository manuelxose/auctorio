import type {
  AssetVariant,
  ContentDerivative,
  ContentImage,
  ContentProject,
  ContentText,
  ContentVersion,
  DerivativeType,
  PublicationAction,
  PublicationJob,
  PublicationStatus,
  Site,
  VersionStatus,
} from "@prisma/client";
import { Prisma } from "@prisma/client";
import type {
  AssetVariantInput,
  CreateProjectInput,
  CreateSiteInput,
  GeneratedDerivative,
  ListProjectsInput,
  PaginatedResult,
  PublicationTargetStatus,
  StudioProjectSummary,
  StudioSession,
  StudioSiteSummary,
  StudioVersionDerivation,
  UpdateProjectInput,
  UpdateSiteInput,
} from "./types";
import { getPrismaClient } from "../infrastructure/db/prisma";
import { buildReviewGate, countQaFailures, countQaWarnings, countWordsFromHtml } from "./review";
import { STUDIO_PERMISSIONS } from "./security";

const prisma = getPrismaClient();

function readPublicationTargetStatus(value: unknown): PublicationTargetStatus | null {
  return value === "draft" || value === "publish" ? value : null;
}

export async function createSite(tenantId: string, input: CreateSiteInput): Promise<Site> {
  return prisma.site.create({
    data: {
      tenantId,
      key: input.key,
      name: input.name,
      type: input.type,
      locale: input.locale ?? "es-ES",
      baseUrl: input.baseUrl ?? null,
      brandVoice: input.brandVoice
        ? (input.brandVoice as Prisma.InputJsonObject)
        : Prisma.JsonNull,
      seoRules: input.seoRules
        ? (input.seoRules as Prisma.InputJsonObject)
        : Prisma.JsonNull,
      taxonomyMap: input.taxonomyMap
        ? (input.taxonomyMap as Prisma.InputJsonObject)
        : Prisma.JsonNull,
      publishingCredentialsRef: input.publishingCredentialsRef ?? null,
    },
  });
}

export async function getSiteById(tenantId: string, siteId: string): Promise<Site | null> {
  return prisma.site.findFirst({ where: { id: siteId, tenantId } });
}

export async function updateSite(tenantId: string, siteId: string, input: UpdateSiteInput): Promise<Site | null> {
  const site = await getSiteById(tenantId, siteId);
  if (!site) {
    return null;
  }

  return prisma.site.update({
    where: { id: site.id },
    data: {
      name: input.name?.trim() || undefined,
      type: input.type,
      locale: input.locale?.trim() || undefined,
      baseUrl: input.baseUrl === undefined ? undefined : input.baseUrl,
      brandVoice: input.brandVoice === undefined
        ? undefined
        : input.brandVoice
          ? (input.brandVoice as Prisma.InputJsonObject)
          : Prisma.JsonNull,
      seoRules: input.seoRules === undefined
        ? undefined
        : input.seoRules
          ? (input.seoRules as Prisma.InputJsonObject)
          : Prisma.JsonNull,
      taxonomyMap: input.taxonomyMap === undefined
        ? undefined
        : input.taxonomyMap
          ? (input.taxonomyMap as Prisma.InputJsonObject)
          : Prisma.JsonNull,
      publishingCredentialsRef:
        input.publishingCredentialsRef === undefined
          ? undefined
          : input.publishingCredentialsRef,
    },
  });
}

export async function listSites(
  tenantId: string,
  page: number,
  pageSize: number,
): Promise<PaginatedResult<StudioSiteSummary>> {
  const skip = (page - 1) * pageSize;

  const [total, sites] = await prisma.$transaction([
    prisma.site.count({
      where: { tenantId },
    }),
    prisma.site.findMany({
      where: { tenantId },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      skip,
      take: pageSize,
      include: {
        _count: {
          select: {
            projects: true,
          },
        },
        publicationJobs: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: {
            id: true,
            status: true,
            externalUrl: true,
            createdAt: true,
            publishedAt: true,
            error: true,
          },
        },
        projects: {
          where: { status: "published" },
          select: { id: true },
        },
      },
    }),
  ]);

  return {
    items: sites.map((site) => ({
      id: site.id,
      key: site.key,
      name: site.name,
      type: site.type,
      locale: site.locale,
      baseUrl: site.baseUrl,
      publishingCredentialsRef: site.publishingCredentialsRef,
      createdAt: site.createdAt,
      updatedAt: site.updatedAt,
      projectCount: site._count.projects,
      publishedProjectCount: site.projects.length,
      latestPublicationJob: site.publicationJobs[0] ?? null,
    })),
    page,
    pageSize,
    total,
  };
}

export async function createProject(tenantId: string, input: CreateProjectInput): Promise<ContentProject> {
  return prisma.contentProject.create({
    data: {
      tenantId,
      siteId: input.siteId,
      title: input.title,
      brief: input.brief,
      goal: input.goal ?? "article",
      primaryLanguage: input.primaryLanguage ?? "es",
      metadata: input.metadata
        ? (input.metadata as Prisma.InputJsonObject)
        : Prisma.JsonNull,
    },
  });
}

export async function updateProject(
  tenantId: string,
  projectId: string,
  input: UpdateProjectInput,
): Promise<ContentProject | null> {
  const project = await prisma.contentProject.findFirst({
    where: { id: projectId, tenantId },
    select: { id: true },
  });
  if (!project) {
    return null;
  }

  return prisma.contentProject.update({
    where: { id: project.id },
    data: {
      siteId: input.siteId ?? undefined,
      title: input.title?.trim() || undefined,
      brief: input.brief?.trim() || undefined,
      goal: input.goal,
      primaryLanguage: input.primaryLanguage?.trim() || undefined,
      metadata:
        input.metadata === undefined
          ? undefined
          : input.metadata
            ? (input.metadata as Prisma.InputJsonObject)
            : Prisma.JsonNull,
    },
  });
}

export async function getProjectById(tenantId: string, projectId: string) {
  return prisma.contentProject.findFirst({
    where: { id: projectId, tenantId },
    include: {
      site: true,
      topic: true,
      versions: {
        orderBy: { versionNumber: "desc" },
        include: {
          contentText: {
            include: {
              promptPresetVersion: {
                include: {
                  preset: true,
                },
              },
            },
          },
          contentImage: {
            include: {
              assetVariants: {
                orderBy: { createdAt: "asc" },
              },
              promptPresetVersion: {
                include: {
                  preset: true,
                },
              },
            },
          },
          derivatives: true,
          publicationJobs: { orderBy: { createdAt: "desc" } },
        },
      },
      publicationJobs: {
        orderBy: { createdAt: "desc" },
      },
    },
  });
}

export async function listProjects(
  tenantId: string,
  input: ListProjectsInput,
): Promise<PaginatedResult<StudioProjectSummary>> {
  const page = input.page ?? 1;
  const pageSize = input.pageSize ?? 20;
  const skip = (page - 1) * pageSize;
  const where: Prisma.ContentProjectWhereInput = {
    tenantId,
    ...(input.siteId ? { siteId: input.siteId } : {}),
    ...(input.status ? { status: input.status } : {}),
    ...(input.goal ? { goal: input.goal } : {}),
  };

  const [total, projects] = await prisma.$transaction([
    prisma.contentProject.count({ where }),
    prisma.contentProject.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      skip,
      take: pageSize,
      include: {
        _count: {
          select: {
            versions: true,
          },
        },
        site: true,
        versions: {
          orderBy: { versionNumber: "desc" },
          take: 1,
          include: {
            contentText: {
              include: {
                promptPresetVersion: {
                  include: {
                    preset: true,
                  },
                },
              },
            },
            contentImage: {
              include: {
                promptPresetVersion: {
                  include: {
                    preset: true,
                  },
                },
              },
            },
            derivatives: true,
            publicationJobs: {
              orderBy: { createdAt: "desc" },
              take: 1,
            },
          },
        },
        publicationJobs: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    }),
  ]);

  return {
    items: projects.map((project) => {
      const latestVersion = project.versions[0] ?? null;

      return {
        id: project.id,
        siteId: project.siteId,
        title: project.title,
        brief: project.brief,
        goal: project.goal,
        status: project.status,
        primaryLanguage: project.primaryLanguage,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
        site: {
          id: project.site.id,
          key: project.site.key,
          name: project.site.name,
          type: project.site.type,
          locale: project.site.locale,
          baseUrl: project.site.baseUrl,
        },
        versionCount: project._count.versions,
        reviewGate: buildReviewGate({
          projectStatus: project.status,
          versionCount: project._count.versions,
          latestVersion: latestVersion
            ? {
                status: latestVersion.status,
                title: latestVersion.title,
                excerpt: latestVersion.excerpt,
                seoTitle: latestVersion.seoTitle,
                seoDescription: latestVersion.seoDescription,
                feedback: latestVersion.feedback,
                bodyHtml: latestVersion.bodyHtml,
                qaReport: latestVersion.qaReport,
                hasAsset: Boolean(latestVersion.contentImage?.storagePath),
              }
            : null,
        }),
        latestVersion: latestVersion
          ? {
            id: latestVersion.id,
            versionNumber: latestVersion.versionNumber,
            status: latestVersion.status,
            title: latestVersion.title,
            excerpt: latestVersion.excerpt,
            seoTitle: latestVersion.seoTitle,
            seoDescription: latestVersion.seoDescription,
            feedback: latestVersion.feedback,
            createdAt: latestVersion.createdAt,
            updatedAt: latestVersion.updatedAt,
            approvedAt: latestVersion.approvedAt,
            approvedBy: latestVersion.approvedBy,
            publishedAt: latestVersion.publishedAt,
            qaState: mapQaState(latestVersion.status),
            hasAsset: Boolean(latestVersion.contentImage?.storagePath),
            assetUrl: latestVersion.contentImage?.storagePath ?? null,
            promptPresetVersionId:
              latestVersion.contentText?.promptPresetVersion?.id ??
              latestVersion.contentImage?.promptPresetVersion?.id ??
              null,
            promptVersionLabel:
              latestVersion.contentText?.promptPresetVersion
                ? `v${latestVersion.contentText.promptPresetVersion.versionNumber}`
                : latestVersion.contentImage?.promptPresetVersion
                  ? `v${latestVersion.contentImage.promptPresetVersion.versionNumber}`
                  : latestVersion.contentText?.promptVersion ?? null,
            promptPresetName:
              latestVersion.contentText?.promptPresetVersion?.preset.name ??
              latestVersion.contentImage?.promptPresetVersion?.preset.name ??
              null,
            promptPresetKey:
              latestVersion.contentText?.promptPresetVersion?.preset.key ??
              latestVersion.contentImage?.promptPresetVersion?.preset.key ??
              null,
            wordCount: countWordsFromHtml(latestVersion.bodyHtml),
            qaFailureCount: countQaFailures(latestVersion.qaReport),
            qaWarningCount: countQaWarnings(latestVersion.qaReport),
            derivativeCount: latestVersion.derivatives.length,
            latestPublicationJob: latestVersion.publicationJobs[0]
              ? mapPublicationJob(latestVersion.publicationJobs[0])
              : null,
            qaReport: latestVersion.qaReport,
          }
        : null,
        latestPublicationJob: project.publicationJobs[0]
          ? mapPublicationJob(project.publicationJobs[0])
          : null,
      };
    }),
    page,
    pageSize,
    total,
  };
}

export async function ensureProjectTopic(tenantId: string, projectId: string, title: string, brief: string) {
  const project = await prisma.contentProject.findFirst({
    where: { id: projectId, tenantId },
  });
  if (!project) {
    throw new Error("project_not_found");
  }

  if (project.topicId) {
    return project.topicId;
  }

  const existingTopic = await prisma.topic.findFirst({
    where: { tenantId, title },
  });

  const topic =
    existingTopic ??
    (await prisma.topic.create({
      data: {
        tenantId,
        title,
        description: brief.slice(0, 400),
      },
    }));

  await prisma.contentProject.update({
    where: { id: project.id },
    data: { topicId: topic.id },
  });

  return topic.id;
}

export async function addManualFact(tenantId: string, topicId: string, content: string, metadata?: Prisma.InputJsonValue | null) {
  const normalized = content.trim();
  if (!normalized) {
    return null;
  }

  return prisma.fact.create({
    data: {
      tenantId,
      topicId,
      sourceType: "manual",
      content: normalized,
      contentHash: `${topicId}:${Buffer.from(normalized).toString("base64").slice(0, 120)}`,
      metadata: metadata
        ? (metadata as Prisma.InputJsonObject)
        : Prisma.JsonNull,
    },
  });
}

export async function createQueuedText(tenantId: string, topicId: string, language: "es" | "en") {
  return prisma.contentText.create({
    data: {
      tenantId,
      topicId,
      type: "seo",
      language,
      status: "queued",
    },
  });
}

export async function createQueuedImage(tenantId: string, topicId: string, textId: string | null) {
  return prisma.contentImage.create({
    data: {
      tenantId,
      topicId,
      textId,
      status: "queued",
    },
  });
}

export async function createVersion(tenantId: string, projectId: string, contentTextId: string, feedback?: string | null) {
  const latest = await prisma.contentVersion.findFirst({
    where: { tenantId, projectId },
    orderBy: { versionNumber: "desc" },
    select: { versionNumber: true },
  });

  return prisma.contentVersion.create({
    data: {
      tenantId,
      projectId,
      contentTextId,
      versionNumber: (latest?.versionNumber ?? 0) + 1,
      status: "draft",
      feedback: feedback ?? null,
    },
  });
}

export async function updateProjectStatus(tenantId: string, projectId: string, status: ContentProject["status"]) {
  return prisma.contentProject.update({
    where: { id: projectId },
    data: { status },
  });
}

export async function findVersionByTextId(tenantId: string, contentTextId: string) {
  return prisma.contentVersion.findFirst({
    where: { tenantId, contentTextId },
    include: { project: { include: { site: true } } },
  });
}

export async function findVersionByImageId(tenantId: string, contentImageId: string) {
  return prisma.contentVersion.findFirst({
    where: { tenantId, contentImageId },
    include: { project: { include: { site: true } } },
  });
}

export async function updateVersionFromText(tenantId: string, versionId: string, data: StudioVersionDerivation, status: VersionStatus) {
  return prisma.contentVersion.update({
    where: { id: versionId },
    data: {
      title: data.title,
      excerpt: data.excerpt,
      bodyHtml: data.bodyHtml,
      seoTitle: data.seoTitle,
      seoDescription: data.seoDescription,
      status,
    },
  });
}

export async function attachImageToVersion(versionId: string, contentImageId: string) {
  return prisma.contentVersion.update({
    where: { id: versionId },
    data: { contentImageId },
  });
}

export async function replaceDerivatives(
  tenantId: string,
  projectId: string,
  versionId: string,
  derivatives: GeneratedDerivative[],
): Promise<ContentDerivative[]> {
  await prisma.contentDerivative.deleteMany({
    where: { tenantId, projectId, versionId },
  });

  if (derivatives.length === 0) {
    return [];
  }

  await prisma.contentDerivative.createMany({
    data: derivatives.map((derivative) => ({
      tenantId,
      projectId,
      versionId,
      type: derivative.type,
      title: derivative.title ?? null,
      body: derivative.body,
      status: "done",
    })),
  });

  return prisma.contentDerivative.findMany({
    where: { tenantId, projectId, versionId },
    orderBy: { createdAt: "asc" },
  });
}

export async function updateVersionQa(
  versionId: string,
  status: VersionStatus,
  qaReport: Prisma.InputJsonValue,
) {
  return prisma.contentVersion.update({
    where: { id: versionId },
    data: {
      status,
      qaReport,
    },
  });
}

export async function approveVersion(
  tenantId: string,
  projectId: string,
  versionId: string,
  approvedBy?: string | null,
  approvedByStudioUserId?: string | null,
) {
  await prisma.contentVersion.update({
    where: { id: versionId },
    data: {
      status: "approved",
      approvedAt: new Date(),
      approvedBy: approvedBy ?? "studio",
      approvedByStudioUserId: approvedByStudioUserId ?? null,
    },
  });

  return updateProjectStatus(tenantId, projectId, "approved");
}

export async function createPublicationJob(
  tenantId: string,
  siteId: string,
  projectId: string,
  versionId: string,
  action: PublicationAction = "publish",
  requestPayload?: {
    action?: PublicationAction;
    targetStatus?: PublicationTargetStatus;
    requestedBy?: string;
  } | null,
  requestedByStudioUserId?: string | null,
): Promise<PublicationJob> {
  return prisma.publicationJob.create({
    data: {
      tenantId,
      siteId,
      projectId,
      versionId,
      action,
      status: "queued",
      requestedByStudioUserId: requestedByStudioUserId ?? null,
      requestPayload: requestPayload
        ? (requestPayload as Prisma.InputJsonObject)
        : Prisma.JsonNull,
    },
  });
}

export async function getPublicationJobById(tenantId: string | null | undefined, publicationJobId: string) {
  return prisma.publicationJob.findFirst({
    where: {
      id: publicationJobId,
      ...(tenantId ? { tenantId } : {}),
    },
    include: {
      site: true,
      project: true,
      version: {
        include: {
          contentImage: true,
          contentText: true,
          derivatives: true,
        },
      },
    },
  });
}

export async function listPublicationJobs(
  tenantId: string,
  page: number,
  pageSize: number,
  status?: PublicationStatus,
) {
  const skip = (page - 1) * pageSize;
  const where: Prisma.PublicationJobWhereInput = {
    tenantId,
    ...(status ? { status } : {}),
  };

  const [total, items] = await prisma.$transaction([
    prisma.publicationJob.count({ where }),
    prisma.publicationJob.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip,
      take: pageSize,
      include: {
        site: true,
        project: true,
        version: {
          include: {
            contentImage: true,
          },
        },
      },
    }),
  ]);

  return {
    items,
    page,
    pageSize,
    total,
  };
}

export async function updatePublicationJob(
  publicationJobId: string,
  data: {
    status: PublicationStatus;
    externalId?: string | null;
    externalUrl?: string | null;
    requestPayload?: Prisma.InputJsonValue | null;
    responsePayload?: Prisma.InputJsonValue | null;
    error?: string | null;
    publishedAt?: Date | null;
  },
) {
  return prisma.publicationJob.update({
    where: { id: publicationJobId },
    data: {
      status: data.status,
      externalId: data.externalId ?? undefined,
      externalUrl: data.externalUrl ?? undefined,
      requestPayload:
        data.requestPayload === null ? Prisma.JsonNull : data.requestPayload ?? undefined,
      responsePayload:
        data.responsePayload === null ? Prisma.JsonNull : data.responsePayload ?? undefined,
      error: data.error ?? undefined,
      publishedAt: data.publishedAt ?? undefined,
    },
  });
}

export async function markProjectPublished(tenantId: string, projectId: string, versionId: string, status: ContentProject["status"]) {
  await prisma.contentVersion.update({
    where: { id: versionId },
    data: {
      ...(status === "published"
        ? {
            status: "published",
            publishedAt: new Date(),
          }
        : {}),
    },
  });

  return updateProjectStatus(tenantId, projectId, status);
}

export async function clearProjectPublicationState(tenantId: string, projectId: string, versionId: string) {
  await prisma.contentVersion.update({
    where: { id: versionId },
    data: {
      status: "approved",
      publishedAt: null,
    },
  });

  return updateProjectStatus(tenantId, projectId, "approved");
}

export async function createAssetVariant(input: AssetVariantInput): Promise<AssetVariant> {
  return prisma.assetVariant.create({
    data: {
      tenantId: input.tenantId,
      siteId: input.siteId ?? null,
      contentImageId: input.contentImageId,
      kind: input.kind ?? "original",
      storagePath: input.storagePath,
      mimeType: input.mimeType,
      width: input.width ?? null,
      height: input.height ?? null,
    },
  });
}

export async function getLatestVersion(projectId: string, tenantId: string) {
  return prisma.contentVersion.findFirst({
    where: { tenantId, projectId },
    orderBy: { versionNumber: "desc" },
    include: {
      contentText: true,
      contentImage: true,
      project: { include: { site: true } },
      derivatives: true,
    },
  });
}

export async function getLatestPublishedExternalId(tenantId: string, siteId: string, projectId: string) {
  const record = await prisma.publicationJob.findFirst({
    where: {
      tenantId,
      siteId,
      projectId,
      status: { in: ["published", "draft_synced"] },
      externalId: { not: null },
    },
    orderBy: { createdAt: "desc" },
  });

  return record?.externalId ?? null;
}

export async function getContentTextById(tenantId: string, contentTextId: string): Promise<ContentText | null> {
  return prisma.contentText.findFirst({
    where: { tenantId, id: contentTextId },
  });
}

export async function getContentImageById(tenantId: string, contentImageId: string): Promise<ContentImage | null> {
  return prisma.contentImage.findFirst({
    where: { tenantId, id: contentImageId },
  });
}

export async function getStudioSession(tenantId: string): Promise<StudioSession | null> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      id: true,
      name: true,
      slug: true,
      status: true,
      studioIdentityProvider: {
        select: {
          enabled: true,
          issuer: true,
          provisioningMode: true,
        },
      },
      _count: {
        select: {
          sites: true,
          contentProjects: true,
        },
      },
    },
  });

  if (!tenant) {
    return null;
  }

  return {
    tenant: {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      status: tenant.status,
    },
    authMode: "api_key",
    user: {
      id: "api-key-session",
      email: "api-key@system.local",
      displayName: "API Key Session",
      avatarUrl: null,
      status: "active",
      lastLoginAt: null,
    },
    roles: ["owner", "admin"],
    permissions: [...STUDIO_PERMISSIONS],
    identityProvider: tenant.studioIdentityProvider
      ? {
          enabled: tenant.studioIdentityProvider.enabled,
          issuer: tenant.studioIdentityProvider.issuer,
          provisioningMode: tenant.studioIdentityProvider.provisioningMode,
        }
      : null,
    siteCount: tenant._count.sites,
    projectCount: tenant._count.contentProjects,
  };
}

function mapQaState(
  status: VersionStatus,
): "not_ready" | "failed" | "passed" | "approved" | "published" {
  switch (status) {
    case "qa_failed":
      return "failed";
    case "qa_passed":
      return "passed";
    case "approved":
      return "approved";
    case "published":
      return "published";
    default:
      return "not_ready";
  }
}

function mapPublicationJob(
  publication: Pick<
    PublicationJob,
    | "id"
    | "status"
    | "action"
    | "externalId"
    | "externalUrl"
    | "error"
    | "createdAt"
    | "updatedAt"
    | "publishedAt"
    | "requestPayload"
  >,
) {
  const requestPayload =
    publication.requestPayload && typeof publication.requestPayload === "object"
      ? (publication.requestPayload as Record<string, unknown>)
      : null;
  const targetStatus = readPublicationTargetStatus(requestPayload?.targetStatus);

  return {
    id: publication.id,
    status: publication.status,
    action: publication.action,
    targetStatus,
    externalId: publication.externalId,
    externalUrl: publication.externalUrl,
    error: publication.error,
    createdAt: publication.createdAt,
    updatedAt: publication.updatedAt,
    publishedAt: publication.publishedAt,
  };
}
