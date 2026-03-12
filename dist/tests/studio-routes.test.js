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
    await prisma.contentVersion.create({
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
        strict_1.default.equal(payload.items[0]?.latestVersion?.title, "Version inicial");
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
