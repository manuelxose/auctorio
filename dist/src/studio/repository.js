"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createSite = createSite;
exports.getSiteById = getSiteById;
exports.updateSite = updateSite;
exports.listSites = listSites;
exports.createProject = createProject;
exports.updateProject = updateProject;
exports.getProjectById = getProjectById;
exports.listProjects = listProjects;
exports.ensureProjectTopic = ensureProjectTopic;
exports.addManualFact = addManualFact;
exports.createQueuedText = createQueuedText;
exports.createQueuedImage = createQueuedImage;
exports.createVersion = createVersion;
exports.updateProjectStatus = updateProjectStatus;
exports.findVersionByTextId = findVersionByTextId;
exports.findVersionByImageId = findVersionByImageId;
exports.updateVersionFromText = updateVersionFromText;
exports.attachImageToVersion = attachImageToVersion;
exports.replaceDerivatives = replaceDerivatives;
exports.updateVersionQa = updateVersionQa;
exports.approveVersion = approveVersion;
exports.createPublicationJob = createPublicationJob;
exports.getPublicationJobById = getPublicationJobById;
exports.listPublicationJobs = listPublicationJobs;
exports.updatePublicationJob = updatePublicationJob;
exports.markProjectPublished = markProjectPublished;
exports.clearProjectPublicationState = clearProjectPublicationState;
exports.createAssetVariant = createAssetVariant;
exports.getLatestVersion = getLatestVersion;
exports.getLatestPublishedExternalId = getLatestPublishedExternalId;
exports.getContentTextById = getContentTextById;
exports.getContentImageById = getContentImageById;
exports.getStudioSession = getStudioSession;
const client_1 = require("@prisma/client");
const prisma_1 = require("../infrastructure/db/prisma");
const review_1 = require("./review");
const security_1 = require("./security");
const prisma = (0, prisma_1.getPrismaClient)();
function readPublicationTargetStatus(value) {
    return value === "draft" || value === "publish" ? value : null;
}
async function createSite(tenantId, input) {
    return prisma.site.create({
        data: {
            tenantId,
            key: input.key,
            name: input.name,
            type: input.type,
            locale: input.locale ?? "es-ES",
            baseUrl: input.baseUrl ?? null,
            brandVoice: input.brandVoice
                ? input.brandVoice
                : client_1.Prisma.JsonNull,
            seoRules: input.seoRules
                ? input.seoRules
                : client_1.Prisma.JsonNull,
            taxonomyMap: input.taxonomyMap
                ? input.taxonomyMap
                : client_1.Prisma.JsonNull,
            publishingCredentialsRef: input.publishingCredentialsRef ?? null,
        },
    });
}
async function getSiteById(tenantId, siteId) {
    return prisma.site.findFirst({ where: { id: siteId, tenantId } });
}
async function updateSite(tenantId, siteId, input) {
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
                    ? input.brandVoice
                    : client_1.Prisma.JsonNull,
            seoRules: input.seoRules === undefined
                ? undefined
                : input.seoRules
                    ? input.seoRules
                    : client_1.Prisma.JsonNull,
            taxonomyMap: input.taxonomyMap === undefined
                ? undefined
                : input.taxonomyMap
                    ? input.taxonomyMap
                    : client_1.Prisma.JsonNull,
            publishingCredentialsRef: input.publishingCredentialsRef === undefined
                ? undefined
                : input.publishingCredentialsRef,
        },
    });
}
async function listSites(tenantId, page, pageSize) {
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
async function createProject(tenantId, input) {
    return prisma.contentProject.create({
        data: {
            tenantId,
            siteId: input.siteId,
            title: input.title,
            brief: input.brief,
            goal: input.goal ?? "article",
            primaryLanguage: input.primaryLanguage ?? "es",
            metadata: input.metadata
                ? input.metadata
                : client_1.Prisma.JsonNull,
        },
    });
}
async function updateProject(tenantId, projectId, input) {
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
            metadata: input.metadata === undefined
                ? undefined
                : input.metadata
                    ? input.metadata
                    : client_1.Prisma.JsonNull,
        },
    });
}
async function getProjectById(tenantId, projectId) {
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
async function listProjects(tenantId, input) {
    const page = input.page ?? 1;
    const pageSize = input.pageSize ?? 20;
    const skip = (page - 1) * pageSize;
    const where = {
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
                                assetVariants: true,
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
                reviewGate: (0, review_1.buildReviewGate)({
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
                            hasAsset: (0, review_1.isHeroImageReady)(latestVersion.contentImage),
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
                        hasAsset: (0, review_1.isHeroImageReady)(latestVersion.contentImage),
                        assetUrl: latestVersion.contentImage?.storagePath ?? null,
                        promptPresetVersionId: latestVersion.contentText?.promptPresetVersion?.id ??
                            latestVersion.contentImage?.promptPresetVersion?.id ??
                            null,
                        promptVersionLabel: latestVersion.contentText?.promptPresetVersion
                            ? `v${latestVersion.contentText.promptPresetVersion.versionNumber}`
                            : latestVersion.contentImage?.promptPresetVersion
                                ? `v${latestVersion.contentImage.promptPresetVersion.versionNumber}`
                                : latestVersion.contentText?.promptVersion ?? null,
                        promptPresetName: latestVersion.contentText?.promptPresetVersion?.preset.name ??
                            latestVersion.contentImage?.promptPresetVersion?.preset.name ??
                            null,
                        promptPresetKey: latestVersion.contentText?.promptPresetVersion?.preset.key ??
                            latestVersion.contentImage?.promptPresetVersion?.preset.key ??
                            null,
                        wordCount: (0, review_1.countWordsFromHtml)(latestVersion.bodyHtml),
                        qaFailureCount: (0, review_1.countQaFailures)(latestVersion.qaReport),
                        qaWarningCount: (0, review_1.countQaWarnings)(latestVersion.qaReport),
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
async function ensureProjectTopic(tenantId, projectId, title, brief) {
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
    const topic = existingTopic ??
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
async function addManualFact(tenantId, topicId, content, metadata) {
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
                ? metadata
                : client_1.Prisma.JsonNull,
        },
    });
}
async function createQueuedText(tenantId, topicId, language) {
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
async function createQueuedImage(tenantId, topicId, textId) {
    return prisma.contentImage.create({
        data: {
            tenantId,
            topicId,
            textId,
            status: "queued",
        },
    });
}
async function createVersion(tenantId, projectId, contentTextId, feedback) {
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
async function updateProjectStatus(tenantId, projectId, status) {
    return prisma.contentProject.update({
        where: { id: projectId },
        data: { status },
    });
}
async function findVersionByTextId(tenantId, contentTextId) {
    return prisma.contentVersion.findFirst({
        where: { tenantId, contentTextId },
        include: { project: { include: { site: true } } },
    });
}
async function findVersionByImageId(tenantId, contentImageId) {
    return prisma.contentVersion.findFirst({
        where: { tenantId, contentImageId },
        include: { project: { include: { site: true } } },
    });
}
async function updateVersionFromText(tenantId, versionId, data, status) {
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
async function attachImageToVersion(versionId, contentImageId) {
    return prisma.contentVersion.update({
        where: { id: versionId },
        data: { contentImageId },
    });
}
async function replaceDerivatives(tenantId, projectId, versionId, derivatives) {
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
async function updateVersionQa(versionId, status, qaReport) {
    return prisma.contentVersion.update({
        where: { id: versionId },
        data: {
            status,
            qaReport,
        },
    });
}
async function approveVersion(tenantId, projectId, versionId, approvedBy, approvedByStudioUserId) {
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
async function createPublicationJob(tenantId, siteId, projectId, versionId, action = "publish", requestPayload, requestedByStudioUserId) {
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
                ? requestPayload
                : client_1.Prisma.JsonNull,
        },
    });
}
async function getPublicationJobById(tenantId, publicationJobId) {
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
async function listPublicationJobs(tenantId, page, pageSize, status) {
    const skip = (page - 1) * pageSize;
    const where = {
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
async function updatePublicationJob(publicationJobId, data) {
    return prisma.publicationJob.update({
        where: { id: publicationJobId },
        data: {
            status: data.status,
            externalId: data.externalId ?? undefined,
            externalUrl: data.externalUrl ?? undefined,
            requestPayload: data.requestPayload === null ? client_1.Prisma.JsonNull : data.requestPayload ?? undefined,
            responsePayload: data.responsePayload === null ? client_1.Prisma.JsonNull : data.responsePayload ?? undefined,
            error: data.error ?? undefined,
            publishedAt: data.publishedAt ?? undefined,
        },
    });
}
async function markProjectPublished(tenantId, projectId, versionId, status) {
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
async function clearProjectPublicationState(tenantId, projectId, versionId) {
    await prisma.contentVersion.update({
        where: { id: versionId },
        data: {
            status: "approved",
            publishedAt: null,
        },
    });
    return updateProjectStatus(tenantId, projectId, "approved");
}
async function createAssetVariant(input) {
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
async function getLatestVersion(projectId, tenantId) {
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
async function getLatestPublishedExternalId(tenantId, siteId, projectId) {
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
async function getContentTextById(tenantId, contentTextId) {
    return prisma.contentText.findFirst({
        where: { tenantId, id: contentTextId },
    });
}
async function getContentImageById(tenantId, contentImageId) {
    return prisma.contentImage.findFirst({
        where: { tenantId, id: contentImageId },
        include: { assetVariants: true },
    });
}
async function getStudioSession(tenantId) {
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
        permissions: [...security_1.STUDIO_PERMISSIONS],
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
function mapQaState(status) {
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
function mapPublicationJob(publication) {
    const requestPayload = publication.requestPayload && typeof publication.requestPayload === "object"
        ? publication.requestPayload
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
