"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildAssetPublicUrl = buildAssetPublicUrl;
exports.startProjectGeneration = startProjectGeneration;
exports.requestImageGenerationForVersion = requestImageGenerationForVersion;
exports.syncTextResultToStudio = syncTextResultToStudio;
exports.syncImageResultToStudio = syncImageResultToStudio;
exports.queuePublication = queuePublication;
exports.retryImageGeneration = retryImageGeneration;
const producer_1 = require("../infrastructure/queue/producer");
const prisma_1 = require("../infrastructure/db/prisma");
const env_1 = require("../shared/utils/env");
const repository_1 = require("./repository");
const qa_1 = require("./qa");
const prisma = (0, prisma_1.getPrismaClient)();
function stripHtml(value) {
    return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}
function truncate(value, max) {
    return value.length <= max ? value : `${value.slice(0, Math.max(0, max - 1)).trim()}…`;
}
function toHtml(text) {
    const blocks = text
        .split(/\n{2,}/)
        .map((block) => block.trim())
        .filter(Boolean);
    return blocks
        .map((block, index) => {
        if (block.startsWith("# ")) {
            return `<h1>${block.slice(2).trim()}</h1>`;
        }
        if (block.startsWith("## ")) {
            return `<h2>${block.slice(3).trim()}</h2>`;
        }
        if (index === 0) {
            return `<p>${block}</p>`;
        }
        return `<p>${block}</p>`;
    })
        .join("\n");
}
function deriveVersion(text, project) {
    const normalized = text.trim();
    const html = /<h\d|<p|<ul|<ol/i.test(normalized) ? normalized : toHtml(normalized);
    const plain = stripHtml(html);
    const title = project.title.trim() || plain.split(/[.!?\n]/)[0] || "Contenido generado";
    return {
        title: truncate(title, 70),
        excerpt: truncate(plain, 220),
        bodyHtml: html,
        seoTitle: truncate(title, 60),
        seoDescription: truncate(plain, 155),
    };
}
function makeDerivative(type, title, body) {
    return { type, title, body };
}
function buildDerivatives(derived, site) {
    const plain = stripHtml(derived.bodyHtml);
    return [
        makeDerivative("newsletter_subject", "Newsletter subject", truncate(`${derived.title} | ${site.name}`, 70)),
        makeDerivative("newsletter_intro", "Newsletter intro", truncate(`${derived.excerpt} Lee la pieza completa en ${site.name}.`, 220)),
        makeDerivative("social_post", "Social post", truncate(`${derived.title}\n\n${derived.excerpt}\n\n#${site.key} #contentstudio`, 280)),
        makeDerivative("social_caption", "Social caption", truncate(`${derived.excerpt} ${site.name}`, 200)),
        makeDerivative("social_thread", "Social thread", truncate(`${derived.title}: ${plain}`, 500)),
    ];
}
async function buildAssetPublicUrl(relativePath) {
    if (!relativePath) {
        return null;
    }
    return `${(0, env_1.getPublicBaseUrl)()}/assets/${relativePath.replace(/^\/+/, "")}`;
}
async function startProjectGeneration(projectId, tenantId, feedback, promptPresetVersionId) {
    const project = await prisma.contentProject.findFirst({
        where: { id: projectId, tenantId },
        include: { site: true },
    });
    if (!project) {
        throw new Error("project_not_found");
    }
    const topicId = await (0, repository_1.ensureProjectTopic)(tenantId, projectId, project.title, project.brief);
    await prisma.fact.create({
        data: {
            tenantId,
            topicId,
            sourceType: "manual",
            content: feedback?.trim() ? `${project.brief}\n\nFeedback de revision:\n${feedback.trim()}` : project.brief,
            contentHash: `${projectId}:${Date.now()}`,
            metadata: {
                project_id: projectId,
                goal: project.goal,
            },
        },
    });
    const contentText = await (0, repository_1.createQueuedText)(tenantId, topicId, project.primaryLanguage === "en" ? "en" : "es");
    const version = await (0, repository_1.createVersion)(tenantId, projectId, contentText.id, feedback);
    const textJob = await prisma.job.create({
        data: {
            tenantId,
            type: "text",
            status: "queued",
        },
    });
    await (0, producer_1.enqueueTextJob)(textJob.id, {
        jobId: textJob.id,
        tenantId,
        topicId,
        contentTextId: contentText.id,
        type: "seo",
        language: project.primaryLanguage === "en" ? "en" : "es",
        options: {
            goal: project.goal,
            site_id: project.siteId,
            site_name: project.site.name,
            site_type: project.site.type,
            brand_voice: project.site.brandVoice ?? {},
            seo_rules: project.site.seoRules ?? {},
            metadata: project.metadata ?? {},
            revision_feedback: feedback ?? undefined,
            promptPresetVersionId: promptPresetVersionId ?? undefined,
        },
    });
    await (0, repository_1.updateProjectStatus)(tenantId, projectId, "draft");
    return { versionId: version.id, contentTextId: contentText.id, jobId: textJob.id };
}
async function requestImageGenerationForVersion(tenantId, versionId, promptPresetVersionId) {
    const version = await prisma.contentVersion.findFirst({
        where: { id: versionId, tenantId },
        include: { project: { include: { site: true } }, contentText: true },
    });
    if (!version || !version.project.topicId) {
        throw new Error("version_or_topic_not_found");
    }
    const textId = version.contentTextId ?? null;
    const contentImage = await (0, repository_1.createQueuedImage)(tenantId, version.project.topicId, textId);
    await (0, repository_1.attachImageToVersion)(version.id, contentImage.id);
    const imageJob = await prisma.job.create({
        data: {
            tenantId,
            type: "image",
            status: "queued",
        },
    });
    const projectMetadata = version.project.metadata && typeof version.project.metadata === "object" && !Array.isArray(version.project.metadata)
        ? version.project.metadata
        : {};
    await (0, producer_1.enqueueImageJob)(imageJob.id, {
        jobId: imageJob.id,
        tenantId,
        topicId: version.project.topicId,
        contentImageId: contentImage.id,
        mode: textId ? "contextual" : "independent",
        textId: textId ?? undefined,
        options: {
            ...projectMetadata,
            site_id: version.project.siteId,
            goal: version.project.goal,
            site_name: version.project.site?.name ?? undefined,
            promptPresetVersionId: promptPresetVersionId ?? undefined,
        },
    });
    return contentImage.id;
}
async function syncTextResultToStudio(tenantId, contentTextId) {
    const contentText = await (0, repository_1.getContentTextById)(tenantId, contentTextId);
    if (!contentText?.output) {
        return;
    }
    const version = await (0, repository_1.findVersionByTextId)(tenantId, contentTextId);
    if (!version) {
        return;
    }
    const derived = deriveVersion(contentText.output, version.project);
    await (0, repository_1.updateVersionFromText)(tenantId, version.id, derived, "ai_generated");
    await (0, repository_1.replaceDerivatives)(tenantId, version.project.id, version.id, buildDerivatives(derived, version.project.site));
    await (0, repository_1.updateProjectStatus)(tenantId, version.project.id, "ai_generated");
    if (!version.contentImageId) {
        await requestImageGenerationForVersion(tenantId, version.id);
    }
}
async function syncImageResultToStudio(tenantId, contentImageId) {
    const image = await (0, repository_1.getContentImageById)(tenantId, contentImageId);
    if (!image) {
        return;
    }
    const version = await (0, repository_1.findVersionByImageId)(tenantId, contentImageId);
    if (!version) {
        return;
    }
    const qaReport = (0, qa_1.runVersionQa)({
        title: version.title,
        excerpt: version.excerpt,
        bodyHtml: version.bodyHtml,
        seoTitle: version.seoTitle,
        seoDescription: version.seoDescription,
    }, image.status === "done" &&
        Boolean(image.storagePath) &&
        image.assetVariants.some((variant) => variant.kind === "hero"));
    await (0, repository_1.updateVersionQa)(version.id, qaReport.passed ? "qa_passed" : "qa_failed", qaReport);
    await (0, repository_1.updateProjectStatus)(tenantId, version.project.id, qaReport.passed ? "in_review" : "qa_failed");
}
async function queuePublication(publicationJobId) {
    await (0, producer_1.enqueuePublishingJob)(publicationJobId, {
        publicationJobId,
    });
}
async function retryImageGeneration(tenantId, contentImageId) {
    const image = await prisma.contentImage.findFirst({
        where: { id: contentImageId, tenantId },
    });
    if (!image) {
        throw new Error("image_not_found");
    }
    if (image.status === "processing" || image.status === "queued") {
        throw new Error("image_already_in_flight");
    }
    if (image.status !== "failed" && image.status !== "retryable") {
        throw new Error("image_not_retryable");
    }
    const topic = await prisma.topic.findFirst({
        where: { id: image.topicId, tenantId },
    });
    if (!topic) {
        throw new Error("topic_not_found");
    }
    const version = await (0, repository_1.findVersionByImageId)(tenantId, contentImageId);
    await prisma.contentImage.update({
        where: { id: contentImageId },
        data: { status: "queued", error: null },
    });
    const imageJob = await prisma.job.create({
        data: {
            tenantId,
            type: "image",
            status: "queued",
        },
    });
    await (0, producer_1.enqueueImageJob)(imageJob.id, {
        jobId: imageJob.id,
        tenantId,
        topicId: topic.id,
        contentImageId,
        mode: image.textId ? "contextual" : "independent",
        textId: image.textId ?? undefined,
        options: {
            site_id: version?.project.siteId ?? undefined,
            goal: version?.project.goal ?? undefined,
            promptPresetVersionId: image.promptPresetVersionId ?? undefined,
        },
    });
    return imageJob.id;
}
