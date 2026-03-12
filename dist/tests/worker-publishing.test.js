"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const worker_publishing_1 = require("../src/infrastructure/workers/worker-publishing");
function buildPublication(overrides) {
    const now = new Date();
    return {
        id: "publication-1",
        tenantId: "tenant-1",
        siteId: "site-1",
        projectId: "project-1",
        versionId: "version-1",
        status: "queued",
        action: "publish",
        externalId: null,
        externalUrl: null,
        requestPayload: {
            targetStatus: "publish",
        },
        responsePayload: null,
        error: null,
        publishedAt: null,
        createdAt: now,
        updatedAt: now,
        site: {
            id: "site-1",
            tenantId: "tenant-1",
            key: "site-key",
            name: "Site",
            type: "guiatv",
            locale: "es-ES",
            baseUrl: "https://example.test",
            brandVoice: null,
            seoRules: null,
            taxonomyMap: null,
            publishingCredentialsRef: null,
            createdAt: now,
            updatedAt: now,
        },
        project: {
            id: "project-1",
            tenantId: "tenant-1",
            siteId: "site-1",
            topicId: null,
            title: "Proyecto",
            brief: "Brief",
            goal: "article",
            status: "approved",
            primaryLanguage: "es",
            metadata: null,
            createdAt: now,
            updatedAt: now,
        },
        version: {
            id: "version-1",
            tenantId: "tenant-1",
            projectId: "project-1",
            contentTextId: null,
            contentImageId: null,
            versionNumber: 1,
            status: "approved",
            title: "Titulo",
            excerpt: "Resumen",
            bodyHtml: "<p>Contenido</p>",
            seoTitle: "SEO",
            seoDescription: "Descripcion",
            qaReport: null,
            feedback: null,
            approvedAt: now,
            approvedBy: "studio",
            publishedAt: null,
            createdAt: now,
            updatedAt: now,
            contentImage: null,
            contentText: null,
            derivatives: [],
        },
        ...overrides,
    };
}
function buildPublisher(overrides) {
    const defaultResult = {
        externalId: "remote-1",
        externalUrl: "https://remote.example/items/1",
        effectiveTargetStatus: "publish",
        responsePayload: { ok: true },
    };
    return {
        publishDraft: async () => ({ ...defaultResult, effectiveTargetStatus: "draft" }),
        updateDraft: async () => ({ ...defaultResult, effectiveTargetStatus: "draft" }),
        publish: async () => defaultResult,
        unpublish: async () => ({ externalId: "remote-1", responsePayload: { ok: true } }),
        ...overrides,
    };
}
(0, node_test_1.default)("processPublishingJob uses publishDraft and keeps the project approved when syncing a draft", async () => {
    const publication = buildPublication({
        requestPayload: { targetStatus: "draft" },
    });
    const calls = [];
    await (0, worker_publishing_1.processPublishingJob)("publication-1", {
        getPublicationJobById: async () => publication,
        updatePublicationJob: async (_id, data) => {
            calls.push(`update:${data.status}`);
            if (data.status === "draft_synced") {
                strict_1.default.equal(data.externalId, "remote-1");
            }
            return {};
        },
        updateProjectStatus: async (_tenantId, _projectId, status) => {
            calls.push(`project:${status}`);
            return {};
        },
        getLatestPublishedExternalId: async () => null,
        buildAssetPublicUrl: async () => null,
        getPublisher: () => buildPublisher({
            publishDraft: async () => ({
                externalId: "remote-1",
                externalUrl: "https://remote.example/drafts/1",
                effectiveTargetStatus: "draft",
                responsePayload: { mode: "draft" },
            }),
        }),
        markProjectPublished: async () => {
            calls.push("mark-published");
            return {};
        },
        clearProjectPublicationState: async () => {
            calls.push("clear-published");
            return {};
        },
    });
    strict_1.default.deepEqual(calls, [
        "update:processing",
        "project:publish_queued",
        "update:draft_synced",
        "clear-published",
    ]);
});
(0, node_test_1.default)("processPublishingJob upgrades to published when the provider cannot keep a draft", async () => {
    const publication = buildPublication({
        requestPayload: { targetStatus: "draft" },
    });
    const calls = [];
    await (0, worker_publishing_1.processPublishingJob)("publication-1", {
        getPublicationJobById: async () => publication,
        updatePublicationJob: async (_id, data) => {
            calls.push(`update:${data.status}`);
            return {};
        },
        updateProjectStatus: async (_tenantId, _projectId, status) => {
            calls.push(`project:${status}`);
            return {};
        },
        getLatestPublishedExternalId: async () => "remote-1",
        buildAssetPublicUrl: async () => null,
        getPublisher: () => buildPublisher({
            updateDraft: async () => ({
                externalId: "remote-1",
                externalUrl: "https://remote.example/items/1",
                effectiveTargetStatus: "publish",
                responsePayload: { mode: "published" },
            }),
        }),
        markProjectPublished: async () => {
            calls.push("mark-published");
            return {};
        },
        clearProjectPublicationState: async () => {
            calls.push("clear-published");
            return {};
        },
    });
    strict_1.default.deepEqual(calls, [
        "update:processing",
        "project:publish_queued",
        "update:published",
        "mark-published",
    ]);
});
(0, node_test_1.default)("processPublishingJob calls unpublish and clears published state", async () => {
    const publication = buildPublication({
        action: "unpublish",
        requestPayload: { targetStatus: "publish" },
    });
    const calls = [];
    await (0, worker_publishing_1.processPublishingJob)("publication-1", {
        getPublicationJobById: async () => publication,
        updatePublicationJob: async (_id, data) => {
            calls.push(`update:${data.status}`);
            return {};
        },
        updateProjectStatus: async (_tenantId, _projectId, status) => {
            calls.push(`project:${status}`);
            return {};
        },
        getLatestPublishedExternalId: async () => "remote-1",
        buildAssetPublicUrl: async () => null,
        getPublisher: () => buildPublisher({
            unpublish: async (_context, externalId) => {
                calls.push(`unpublish:${externalId}`);
                return {
                    externalId,
                    responsePayload: { deleted: true },
                };
            },
        }),
        markProjectPublished: async () => {
            calls.push("mark-published");
            return {};
        },
        clearProjectPublicationState: async () => {
            calls.push("clear-published");
            return {};
        },
    });
    strict_1.default.deepEqual(calls, [
        "update:processing",
        "project:publish_queued",
        "unpublish:remote-1",
        "update:canceled",
        "clear-published",
    ]);
});
(0, node_test_1.default)("processPublishingJob routes talkaris draft publications through updateDraft when an external id already exists", async () => {
    const publication = buildPublication({
        site: {
            ...buildPublication().site,
            type: "talkaris",
            key: "talkaris-blog",
        },
        requestPayload: { targetStatus: "draft" },
    });
    const calls = [];
    await (0, worker_publishing_1.processPublishingJob)("publication-1", {
        getPublicationJobById: async () => publication,
        updatePublicationJob: async (_id, data) => {
            calls.push(`update:${data.status}`);
            return {};
        },
        updateProjectStatus: async (_tenantId, _projectId, status) => {
            calls.push(`project:${status}`);
            return {};
        },
        getLatestPublishedExternalId: async () => "talkaris-remote-1",
        buildAssetPublicUrl: async () => "https://auctorio.com/assets/example.webp",
        getPublisher: () => buildPublisher({
            updateDraft: async (_context, externalId) => {
                calls.push(`talkaris-update:${externalId}`);
                return {
                    externalId,
                    externalUrl: "https://talkaris.com/blog/example",
                    effectiveTargetStatus: "draft",
                    responsePayload: { mode: "draft" },
                };
            },
        }),
        markProjectPublished: async () => {
            calls.push("mark-published");
            return {};
        },
        clearProjectPublicationState: async () => {
            calls.push("clear-published");
            return {};
        },
    });
    strict_1.default.deepEqual(calls, [
        "update:processing",
        "project:publish_queued",
        "talkaris-update:talkaris-remote-1",
        "update:draft_synced",
        "clear-published",
    ]);
});
