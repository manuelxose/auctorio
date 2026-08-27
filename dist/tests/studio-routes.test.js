"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const fastify_1 = __importDefault(require("fastify"));
const prisma_1 = require("../src/infrastructure/db/prisma");
const hash_1 = require("../src/shared/utils/hash");
const routes_1 = require("../src/studio/routes");
const publication_1 = require("../src/studio/publication");
const prisma = (0, prisma_1.getPrismaClient)();
async function createFixture() {
    const seed = `studio-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
    const apiKey = `${seed}-key`;
    const tenant = await prisma.tenant.create({
        data: {
            name: seed,
            apiKeyHash: (0, hash_1.sha256)(apiKey),
            status: "active",
        },
    });
    const site = await prisma.site.create({
        data: {
            tenantId: tenant.id,
            key: `${seed}-site`,
            name: "Studio Test Site",
            type: "webhook",
            locale: "es-ES",
            baseUrl: "https://example.test",
        },
    });
    const project = await prisma.contentProject.create({
        data: {
            tenantId: tenant.id,
            siteId: site.id,
            title: "Proyecto de prueba",
            brief: "Brief de prueba para los listados del studio",
            goal: "article",
            primaryLanguage: "es",
            status: "draft",
        },
    });
    const version = await prisma.contentVersion.create({
        data: {
            tenantId: tenant.id,
            projectId: project.id,
            versionNumber: 1,
            status: "draft",
            title: "Version inicial",
            excerpt: "Resumen inicial",
            bodyHtml: "<p>Contenido de prueba suficientemente largo para el listado.</p>",
            seoTitle: "SEO Version inicial",
            seoDescription: "Descripcion SEO inicial",
        },
    });
    return {
        apiKey,
        tenantId: tenant.id,
        siteId: site.id,
        projectId: project.id,
        versionId: version.id,
    };
}
async function cleanupFixture(tenantId) {
    await prisma.publicationJob.deleteMany({ where: { tenantId } });
    await prisma.contentDerivative.deleteMany({ where: { tenantId } });
    await prisma.contentVersion.deleteMany({ where: { tenantId } });
    await prisma.contentProject.deleteMany({ where: { tenantId } });
    await prisma.assetVariant.deleteMany({ where: { tenantId } });
    await prisma.contentImage.deleteMany({ where: { tenantId } });
    await prisma.contentText.deleteMany({ where: { tenantId } });
    await prisma.fact.deleteMany({ where: { tenantId } });
    await prisma.topic.deleteMany({ where: { tenantId } });
    await prisma.site.deleteMany({ where: { tenantId } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
}
function buildStudioTestServer(tenantId) {
    const server = (0, fastify_1.default)();
    server.decorateRequest("tenantId", "");
    server.addHook("preHandler", async (request) => {
        request.tenantId = tenantId;
    });
    (0, routes_1.registerStudioRoutes)(server);
    return server;
}
node_test_1.default.after(async () => {
    await prisma.$disconnect();
});
(0, node_test_1.default)("GET /v2/sites returns paginated site summaries", async () => {
    const fixture = await createFixture();
    const server = buildStudioTestServer(fixture.tenantId);
    try {
        const response = await server.inject({
            method: "GET",
            url: "/v2/sites?page=1&pageSize=10",
        });
        strict_1.default.equal(response.statusCode, 200);
        const payload = response.json();
        strict_1.default.equal(payload.total, 1);
        strict_1.default.equal(payload.items.length, 1);
        strict_1.default.equal(payload.items[0]?.id, fixture.siteId);
        strict_1.default.equal(payload.items[0]?.projectCount, 1);
    }
    finally {
        await server.close();
        await cleanupFixture(fixture.tenantId);
    }
});
(0, node_test_1.default)("DELETE /v2/media/:id removes an unused asset and preserves the audit contract", async () => {
    const fixture = await createFixture();
    const topic = await prisma.topic.create({
        data: {
            tenantId: fixture.tenantId,
            title: "Media test topic",
            description: "Topic for media deletion coverage",
            status: "active",
        },
    });
    const image = await prisma.contentImage.create({
        data: {
            tenantId: fixture.tenantId,
            topicId: topic.id,
            status: "done",
        },
    });
    const server = buildStudioTestServer(fixture.tenantId);
    try {
        const response = await server.inject({
            method: "DELETE",
            url: `/v2/media/${image.id}`,
        });
        strict_1.default.equal(response.statusCode, 200);
        strict_1.default.deepEqual(response.json(), { ok: true });
        strict_1.default.equal(await prisma.contentImage.findUnique({ where: { id: image.id } }), null);
        strict_1.default.equal(await prisma.auditLog.count({
            where: { tenantId: fixture.tenantId, action: "media.deleted", entityId: image.id },
        }), 1);
    }
    finally {
        await server.close();
        await cleanupFixture(fixture.tenantId);
    }
});
(0, node_test_1.default)("DELETE /v2/media/:id refuses an asset still used by content", async () => {
    const fixture = await createFixture();
    const topic = await prisma.topic.create({
        data: {
            tenantId: fixture.tenantId,
            title: "In-use media topic",
            description: "Topic for media protection coverage",
            status: "active",
        },
    });
    const image = await prisma.contentImage.create({
        data: { tenantId: fixture.tenantId, topicId: topic.id, status: "done" },
    });
    await prisma.contentVersion.update({
        where: { id: fixture.versionId },
        data: { contentImageId: image.id },
    });
    const server = buildStudioTestServer(fixture.tenantId);
    try {
        const response = await server.inject({ method: "DELETE", url: `/v2/media/${image.id}` });
        strict_1.default.equal(response.statusCode, 409);
        strict_1.default.match(response.json().error.message, /used by 1 version/);
        strict_1.default.ok(await prisma.contentImage.findUnique({ where: { id: image.id } }));
    }
    finally {
        await server.close();
        await cleanupFixture(fixture.tenantId);
    }
});
(0, node_test_1.default)("publishing accounts expose real state and never credential references", async () => {
    const fixture = await createFixture();
    const server = buildStudioTestServer(fixture.tenantId);
    try {
        const created = await server.inject({
            method: "POST",
            url: "/v2/publishing-accounts",
            payload: {
                platform: "website",
                displayName: "QA website",
                credentialsRef: "QA_SECRET_REF",
                siteId: fixture.siteId,
            },
        });
        strict_1.default.equal(created.statusCode, 201);
        const createdBody = created.json();
        strict_1.default.equal(createdBody.status, "pending");
        strict_1.default.equal(createdBody.hasCredentials, true);
        strict_1.default.equal(createdBody.credentialsRef, undefined);
        const listed = await server.inject({ method: "GET", url: "/v2/publishing-accounts" });
        strict_1.default.equal(listed.statusCode, 200);
        const listBody = listed.json();
        const found = listBody.items.find((item) => item.id === createdBody.id);
        strict_1.default.ok(found);
        strict_1.default.equal(found.hasCredentials, true);
        strict_1.default.equal(found.credentialsRef, undefined);
        strict_1.default.equal(JSON.stringify(found).includes("QA_SECRET_REF"), false);
        const removed = await server.inject({ method: "DELETE", url: `/v2/publishing-accounts/${createdBody.id}` });
        strict_1.default.equal(removed.statusCode, 200);
        strict_1.default.equal(await prisma.publishingAccount.count({ where: { tenantId: fixture.tenantId } }), 0);
    }
    finally {
        await server.close();
        await cleanupFixture(fixture.tenantId);
    }
});
(0, node_test_1.default)("GET /v2/projects returns filtered project summaries", async () => {
    const fixture = await createFixture();
    const server = buildStudioTestServer(fixture.tenantId);
    try {
        const response = await server.inject({
            method: "GET",
            url: `/v2/projects?siteId=${fixture.siteId}&status=draft&page=1&pageSize=10`,
        });
        strict_1.default.equal(response.statusCode, 200);
        const payload = response.json();
        strict_1.default.equal(payload.total, 1);
        strict_1.default.equal(payload.items.length, 1);
        strict_1.default.equal(payload.items[0]?.id, fixture.projectId);
        strict_1.default.equal(payload.items[0]?.site.id, fixture.siteId);
        strict_1.default.equal(payload.items[0]?.versionCount, 1);
        strict_1.default.equal(payload.items[0]?.reviewGate.stage, "needs_review");
        strict_1.default.equal(payload.items[0]?.reviewGate.compareReady, false);
        strict_1.default.equal(payload.items[0]?.reviewGate.blockerCount, 2);
        strict_1.default.equal(payload.items[0]?.latestVersion?.title, "Version inicial");
        strict_1.default.equal(payload.items[0]?.latestVersion?.wordCount, 8);
        strict_1.default.equal(payload.items[0]?.latestVersion?.qaFailureCount, 0);
        strict_1.default.equal(payload.items[0]?.latestVersion?.qaWarningCount, 0);
    }
    finally {
        await server.close();
        await cleanupFixture(fixture.tenantId);
    }
});
(0, node_test_1.default)("Editorial plan bulk operations approve, reject and delete rows", async () => {
    const fixture = await createFixture();
    const plan = await prisma.editorialPlan.create({
        data: {
            tenantId: fixture.tenantId,
            siteId: fixture.siteId,
            name: "Bulk plan test",
            dateFrom: new Date("2026-08-22T00:00:00.000Z"),
            dateTo: new Date("2026-08-29T00:00:00.000Z"),
            status: "ready",
        },
    });
    const items = await Promise.all([
        prisma.editorialPlanItem.create({
            data: { tenantId: fixture.tenantId, planId: plan.id, siteId: fixture.siteId, title: "Row one", channel: "website", scheduledFor: new Date("2026-08-23T10:00:00.000Z") },
        }),
        prisma.editorialPlanItem.create({
            data: { tenantId: fixture.tenantId, planId: plan.id, siteId: fixture.siteId, title: "Row two", channel: "x", scheduledFor: new Date("2026-08-23T11:00:00.000Z") },
        }),
    ]);
    const server = buildStudioTestServer(fixture.tenantId);
    try {
        const approved = await server.inject({
            method: "POST",
            url: "/v2/editorial-plan-items/bulk-approve",
            payload: { itemIds: items.map((item) => item.id) },
        });
        strict_1.default.equal(approved.statusCode, 200);
        strict_1.default.equal(approved.json().updatedCount, 2);
        const rejected = await server.inject({
            method: "POST",
            url: "/v2/editorial-plan-items/bulk-status",
            payload: { itemIds: [items[1].id], status: "rejected" },
        });
        strict_1.default.equal(rejected.statusCode, 200);
        strict_1.default.equal(rejected.json().updatedCount, 1);
        strict_1.default.equal((await prisma.editorialPlanItem.findUnique({ where: { id: items[1].id } }))?.status, "rejected");
        const deleted = await server.inject({
            method: "POST",
            url: "/v2/editorial-plan-items/bulk-delete",
            payload: { itemIds: items.map((item) => item.id) },
        });
        strict_1.default.equal(deleted.statusCode, 200);
        strict_1.default.equal(deleted.json().deletedCount, 2);
        strict_1.default.equal(await prisma.editorialPlanItem.count({ where: { tenantId: fixture.tenantId } }), 0);
    }
    finally {
        await server.close();
        await prisma.editorialPlanItem.deleteMany({ where: { tenantId: fixture.tenantId } });
        await prisma.editorialPlan.deleteMany({ where: { tenantId: fixture.tenantId } });
        await cleanupFixture(fixture.tenantId);
    }
});
(0, node_test_1.default)("Publication reschedule rolls back when its audit write fails", async () => {
    const fixture = await createFixture();
    const originalSchedule = new Date("2026-08-23T10:00:00.000Z");
    const publication = await prisma.publication.create({
        data: {
            tenantId: fixture.tenantId,
            projectId: fixture.projectId,
            versionId: fixture.versionId,
            siteId: fixture.siteId,
            channel: "website",
            status: "scheduled",
            scheduledFor: originalSchedule,
        },
    });
    try {
        await strict_1.default.rejects((0, publication_1.updatePublicationSchedule)(fixture.tenantId, publication.id, { scheduledFor: new Date("2026-08-24T12:30:00.000Z") }, async () => {
            throw new Error("forced_audit_failure");
        }), /forced_audit_failure/);
        const persisted = await prisma.publication.findUniqueOrThrow({ where: { id: publication.id } });
        strict_1.default.equal(persisted.status, "scheduled");
        strict_1.default.equal(persisted.scheduledFor?.toISOString(), originalSchedule.toISOString());
        strict_1.default.equal(persisted.manualOverride, false);
        strict_1.default.equal(persisted.scheduleLocked, false);
    }
    finally {
        await cleanupFixture(fixture.tenantId);
    }
});
(0, node_test_1.default)("Editorial plan rows can be approved, edited and deleted without creating content", async () => {
    const fixture = await createFixture();
    const plan = await prisma.editorialPlan.create({
        data: {
            tenantId: fixture.tenantId,
            siteId: fixture.siteId,
            name: "Plan test",
            dateFrom: new Date("2026-08-22T00:00:00.000Z"),
            dateTo: new Date("2026-08-29T00:00:00.000Z"),
            status: "ready",
        },
    });
    const item = await prisma.editorialPlanItem.create({
        data: {
            tenantId: fixture.tenantId,
            planId: plan.id,
            siteId: fixture.siteId,
            title: "Plan item",
            channel: "website",
            scheduledFor: new Date("2026-08-23T10:00:00.000Z"),
        },
    });
    const server = buildStudioTestServer(fixture.tenantId);
    try {
        const edited = await server.inject({
            method: "PATCH",
            url: `/v2/editorial-plan-items/${item.id}`,
            payload: { title: "Edited plan item", primaryKeyword: "editorial workflow" },
        });
        strict_1.default.equal(edited.statusCode, 200);
        strict_1.default.equal(edited.json().title, "Edited plan item");
        const approved = await server.inject({ method: "POST", url: `/v2/editorial-plan-items/${item.id}/approve` });
        strict_1.default.equal(approved.statusCode, 200);
        strict_1.default.equal(approved.json().status, "approved");
        strict_1.default.equal(await prisma.contentProject.count({ where: { tenantId: fixture.tenantId } }), 1);
        const deleted = await server.inject({ method: "DELETE", url: `/v2/editorial-plan-items/${item.id}` });
        strict_1.default.equal(deleted.statusCode, 200);
        strict_1.default.equal(await prisma.editorialPlanItem.findUnique({ where: { id: item.id } }), null);
    }
    finally {
        await server.close();
        await prisma.editorialPlanItem.deleteMany({ where: { tenantId: fixture.tenantId } });
        await prisma.editorialPlan.deleteMany({ where: { tenantId: fixture.tenantId } });
        await cleanupFixture(fixture.tenantId);
    }
});
(0, node_test_1.default)("GET /v2/projects/:id returns review gate and version insights", async () => {
    const fixture = await createFixture();
    const server = buildStudioTestServer(fixture.tenantId);
    try {
        const response = await server.inject({
            method: "GET",
            url: `/v2/projects/${fixture.projectId}`,
        });
        strict_1.default.equal(response.statusCode, 200);
        const payload = response.json();
        strict_1.default.equal(payload.id, fixture.projectId);
        strict_1.default.equal(payload.versionCount, 1);
        strict_1.default.equal(payload.reviewGate.stage, "needs_review");
        strict_1.default.equal(payload.reviewGate.blockers.length, 2);
        strict_1.default.equal(payload.reviewGate.warnings.length, 1);
        strict_1.default.equal(payload.versions[0]?.versionNumber, 1);
        strict_1.default.equal(payload.versions[0]?.wordCount, 8);
        strict_1.default.equal(payload.versions[0]?.qaFailureCount, 0);
    }
    finally {
        await server.close();
        await cleanupFixture(fixture.tenantId);
    }
});
(0, node_test_1.default)("POST /v2/projects/:id/duplicate copies the project and latest version", async () => {
    const fixture = await createFixture();
    const server = buildStudioTestServer(fixture.tenantId);
    try {
        const response = await server.inject({
            method: "POST",
            url: `/v2/projects/${fixture.projectId}/duplicate`,
        });
        strict_1.default.equal(response.statusCode, 201);
        const duplicateId = response.json().id;
        const duplicate = await prisma.contentProject.findUnique({
            where: { id: duplicateId },
            include: { versions: true },
        });
        strict_1.default.ok(duplicate);
        strict_1.default.ok(duplicate.title.endsWith("(copy)"));
        strict_1.default.equal(duplicate.brief, "Brief de prueba para los listados del studio");
        strict_1.default.equal(duplicate.versions.length, 1);
        strict_1.default.equal(duplicate.versions[0]?.bodyHtml, "<p>Contenido de prueba suficientemente largo para el listado.</p>");
        strict_1.default.equal(await prisma.auditLog.count({
            where: { tenantId: fixture.tenantId, action: "project.duplicated", entityId: duplicateId },
        }), 1);
    }
    finally {
        await server.close();
        await cleanupFixture(fixture.tenantId);
    }
});
(0, node_test_1.default)("PUT /v2/projects/:id updates the editorial brief payload", async () => {
    const fixture = await createFixture();
    const server = buildStudioTestServer(fixture.tenantId);
    try {
        const response = await server.inject({
            method: "PUT",
            url: `/v2/projects/${fixture.projectId}`,
            payload: {
                title: "Proyecto reencuadrado",
                brief: "Brief reescrito con nueva estrategia editorial",
                primaryLanguage: "en",
                metadata: {
                    targetQuery: "enterprise editorial workflow",
                    keywords: ["editorial cockpit", "content ops"],
                    featured: true,
                },
            },
        });
        strict_1.default.equal(response.statusCode, 200);
        const payload = response.json();
        strict_1.default.equal(payload.id, fixture.projectId);
        strict_1.default.equal(payload.title, "Proyecto reencuadrado");
        strict_1.default.equal(payload.brief, "Brief reescrito con nueva estrategia editorial");
        strict_1.default.equal(payload.primaryLanguage, "en");
        strict_1.default.equal(payload.metadata?.targetQuery, "enterprise editorial workflow");
        strict_1.default.deepEqual(payload.metadata?.keywords, ["editorial cockpit", "content ops"]);
        strict_1.default.equal(payload.metadata?.featured, true);
    }
    finally {
        await server.close();
        await cleanupFixture(fixture.tenantId);
    }
});
(0, node_test_1.default)("GET /v2/session/me returns tenant session summary", async () => {
    const fixture = await createFixture();
    const server = buildStudioTestServer(fixture.tenantId);
    try {
        const response = await server.inject({
            method: "GET",
            url: "/v2/session/me",
        });
        strict_1.default.equal(response.statusCode, 200);
        const payload = response.json();
        strict_1.default.equal(payload.tenant.id, fixture.tenantId);
        strict_1.default.equal(payload.siteCount, 1);
        strict_1.default.equal(payload.projectCount, 1);
    }
    finally {
        await server.close();
        await cleanupFixture(fixture.tenantId);
    }
});
(0, node_test_1.default)("POST /v2/projects/:id/approve rejects versions that look qa_passed but still fail the review gate", async () => {
    const fixture = await createFixture();
    const server = buildStudioTestServer(fixture.tenantId);
    try {
        await prisma.contentVersion.update({
            where: { id: fixture.versionId },
            data: {
                status: "qa_passed",
            },
        });
        await prisma.contentProject.update({
            where: { id: fixture.projectId },
            data: {
                status: "qa_passed",
            },
        });
        const response = await server.inject({
            method: "POST",
            url: `/v2/projects/${fixture.projectId}/approve`,
        });
        strict_1.default.equal(response.statusCode, 400);
        const payload = response.json();
        strict_1.default.equal(payload.error.code, "bad_request");
        strict_1.default.equal(payload.error.message, "Featured image is still missing.");
        strict_1.default.ok(payload.error.requestId);
    }
    finally {
        await server.close();
        await cleanupFixture(fixture.tenantId);
    }
});
(0, node_test_1.default)("POST /v2/projects/:id/publish rejects approved versions when gate blockers remain", async () => {
    const fixture = await createFixture();
    const server = buildStudioTestServer(fixture.tenantId);
    try {
        await prisma.contentVersion.update({
            where: { id: fixture.versionId },
            data: {
                status: "approved",
            },
        });
        await prisma.contentProject.update({
            where: { id: fixture.projectId },
            data: {
                status: "approved",
            },
        });
        const response = await server.inject({
            method: "POST",
            url: `/v2/projects/${fixture.projectId}/publish`,
            payload: {
                action: "publish",
                targetStatus: "publish",
            },
        });
        strict_1.default.equal(response.statusCode, 400);
        const payload = response.json();
        strict_1.default.equal(payload.error.code, "bad_request");
        strict_1.default.equal(payload.error.message, "Featured image is still missing.");
        strict_1.default.ok(payload.error.requestId);
    }
    finally {
        await server.close();
        await cleanupFixture(fixture.tenantId);
    }
});
