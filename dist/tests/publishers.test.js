"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const node_http_1 = __importDefault(require("node:http"));
const publishers_1 = require("../src/studio/publishers");
const ENV_KEYS = [
    "PUBLISH_DRY_RUN",
    "APP_ENV",
    "NODE_ENV",
    "PUBLISH_TIMEOUT_MS",
    "IMAGE_DOWNLOAD_TIMEOUT_MS",
    "GUIATV_TEST_KEY",
    "TECNORIA_TEST_TOKEN",
    "TECNORIA_TEST_CREDS",
    "TALKARIS_TEST_TOKEN",
    "WEBHOOK_SECRET",
];
const originalEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
function restoreEnv() {
    for (const key of ENV_KEYS) {
        if (originalEnv[key] === undefined) {
            delete process.env[key];
            continue;
        }
        process.env[key] = originalEnv[key];
    }
}
async function createMockServer(handler) {
    const requests = [];
    const server = node_http_1.default.createServer(async (req, res) => {
        const chunks = [];
        for await (const chunk of req) {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
        const bodyText = Buffer.concat(chunks).toString("utf8");
        requests.push({
            method: req.method || "GET",
            path: req.url || "/",
            headers: req.headers,
            bodyText,
        });
        try {
            await handler(req, res, bodyText, requests);
        }
        catch (error) {
            res.statusCode = 500;
            res.setHeader("content-type", "application/json");
            res.end(JSON.stringify({
                error: error instanceof Error ? error.message : "unexpected_error",
            }));
        }
    });
    await new Promise((resolve) => {
        server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    if (!address || typeof address === "string") {
        throw new Error("mock_server_address_unavailable");
    }
    return {
        url: `http://127.0.0.1:${address.port}`,
        requests,
        close: async () => {
            await new Promise((resolve, reject) => {
                server.close((error) => {
                    if (error) {
                        reject(error);
                        return;
                    }
                    resolve();
                });
            });
        },
    };
}
function buildContext(siteType, overrides) {
    const now = new Date();
    const site = {
        id: `${siteType}-site`,
        tenantId: "tenant-1",
        key: `${siteType}-key`,
        name: `${siteType} site`,
        type: siteType,
        locale: "es-ES",
        baseUrl: "https://example.test",
        brandVoice: null,
        seoRules: null,
        taxonomyMap: null,
        publishingCredentialsRef: null,
        createdAt: now,
        updatedAt: now,
    };
    const project = {
        id: "project-1",
        tenantId: "tenant-1",
        siteId: site.id,
        topicId: null,
        title: "Proyecto test",
        brief: "Brief test",
        goal: "article",
        status: "approved",
        primaryLanguage: "es",
        metadata: {
            slug: "proyecto-test",
            categories: ["streaming", "tv"],
            tags: ["ia", "studio"],
        },
        sourceItemId: null,
        clusterId: null,
        campaignId: null,
        briefId: null,
        origin: "manual",
        deletedAt: null,
        deletedBy: null,
        deletedByStudioUserId: null,
        deletionReason: null,
        createdAt: now,
        updatedAt: now,
    };
    const version = {
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
        seoTitle: "SEO Titulo",
        seoDescription: "SEO Descripcion",
        qaReport: null,
        feedback: null,
        approvedAt: now,
        approvedBy: "studio",
        approvedByStudioUserId: null,
        publishedAt: null,
        createdAt: now,
        updatedAt: now,
    };
    const mergedSite = {
        ...site,
        ...(overrides?.site ?? {}),
    };
    const mergedProject = {
        ...project,
        ...(overrides?.project ?? {}),
    };
    const mergedVersion = {
        ...version,
        ...(overrides?.version ?? {}),
        approvedByStudioUserId: overrides?.version?.approvedByStudioUserId === undefined
            ? version.approvedByStudioUserId
            : overrides.version.approvedByStudioUserId,
    };
    return {
        ...(overrides ?? {}),
        site: mergedSite,
        project: mergedProject,
        version: mergedVersion,
        assetUrl: overrides?.assetUrl ?? null,
    };
}
node_test_1.default.afterEach(() => {
    restoreEnv();
});
for (const siteType of ["guiatv", "tecnoria", "talkaris", "webhook"]) {
    (0, node_test_1.default)(`publisher ${siteType} falls back to dry-run when credentials are missing`, async () => {
        process.env["APP_ENV"] = "development";
        process.env["NODE_ENV"] = "development";
        process.env["PUBLISH_DRY_RUN"] = "false";
        const result = await (0, publishers_1.getPublisher)(buildContext(siteType).site).publish(buildContext(siteType));
        const responsePayload = result.responsePayload;
        strict_1.default.equal(String(responsePayload["mode"]), "dry_run");
        strict_1.default.equal(String(responsePayload["reason"]), "missing_publishing_credentials");
        strict_1.default.match(String(result.externalId), /^dryrun-/);
    });
    (0, node_test_1.default)(`publisher ${siteType} fails loudly in production when credentials are missing`, async () => {
        process.env["APP_ENV"] = "production";
        process.env["NODE_ENV"] = "production";
        process.env["PUBLISH_DRY_RUN"] = "false";
        await strict_1.default.rejects(() => (0, publishers_1.getPublisher)(buildContext(siteType).site).publish(buildContext(siteType)), /publishing_missing_credentials/);
    });
}
(0, node_test_1.default)("publisher dry-run can be forced by env even if credentials exist", async () => {
    process.env["APP_ENV"] = "production";
    process.env["NODE_ENV"] = "production";
    process.env["PUBLISH_DRY_RUN"] = "true";
    process.env["GUIATV_TEST_KEY"] = "secret";
    const context = buildContext("guiatv", {
        site: {
            ...buildContext("guiatv").site,
            publishingCredentialsRef: "GUIATV_TEST_KEY",
        },
    });
    const result = await (0, publishers_1.getPublisher)(context.site).publish(context);
    const responsePayload = result.responsePayload;
    strict_1.default.equal(String(responsePayload["mode"]), "dry_run");
    strict_1.default.equal(String(responsePayload["reason"]), "env_publish_dry_run");
});
(0, node_test_1.default)("guiatv supports draft, publish and unpublish flows against the real contract shape", async () => {
    process.env["APP_ENV"] = "production";
    process.env["NODE_ENV"] = "production";
    process.env["PUBLISH_DRY_RUN"] = "false";
    process.env["GUIATV_TEST_KEY"] = "guiatv-secret";
    const server = await createMockServer((req, res, bodyText) => {
        if (req.url === "/v2/blog" && req.method === "POST") {
            const body = JSON.parse(bodyText);
            strict_1.default.equal(req.headers["x-admin-key"], "guiatv-secret");
            strict_1.default.equal(body.status, "draft");
            strict_1.default.equal(body.slug, "proyecto-test");
            res.statusCode = 201;
            res.setHeader("content-type", "application/json");
            res.end(JSON.stringify({
                data: {
                    post: {
                        id: "post-1",
                        link: "https://guiatv.example/editorial/proyecto-test",
                    },
                },
            }));
            return;
        }
        if (req.url === "/v2/blog/post-1" && req.method === "PUT") {
            const body = JSON.parse(bodyText);
            strict_1.default.equal(req.headers["x-admin-key"], "guiatv-secret");
            strict_1.default.equal(body.status, "publish");
            res.statusCode = 200;
            res.setHeader("content-type", "application/json");
            res.end(JSON.stringify({
                data: {
                    post: {
                        id: "post-1",
                        link: "https://guiatv.example/editorial/proyecto-test",
                    },
                },
            }));
            return;
        }
        if (req.url === "/v2/blog/post-1" && req.method === "DELETE") {
            strict_1.default.equal(req.headers["x-admin-key"], "guiatv-secret");
            res.statusCode = 200;
            res.setHeader("content-type", "application/json");
            res.end(JSON.stringify({
                data: {
                    deleted: true,
                    id: "post-1",
                },
            }));
            return;
        }
        res.statusCode = 404;
        res.end();
    });
    try {
        const context = buildContext("guiatv", {
            site: {
                ...buildContext("guiatv").site,
                baseUrl: server.url,
                publishingCredentialsRef: "GUIATV_TEST_KEY",
            },
        });
        const publisher = (0, publishers_1.getPublisher)(context.site);
        const draft = await publisher.publishDraft(context);
        strict_1.default.equal(draft.externalId, "post-1");
        strict_1.default.equal(draft.effectiveTargetStatus, "draft");
        const published = await publisher.publish(context, "post-1");
        strict_1.default.equal(published.externalId, "post-1");
        strict_1.default.equal(published.effectiveTargetStatus, "publish");
        const deleted = await publisher.unpublish(context, "post-1");
        strict_1.default.equal(deleted.externalId, "post-1");
        strict_1.default.equal(server.requests.length, 3);
    }
    finally {
        await server.close();
    }
});
(0, node_test_1.default)("guiatv surfaces upstream validation/conflict failures", async () => {
    process.env["APP_ENV"] = "production";
    process.env["NODE_ENV"] = "production";
    process.env["PUBLISH_DRY_RUN"] = "false";
    process.env["GUIATV_TEST_KEY"] = "guiatv-secret";
    const server = await createMockServer((_req, res) => {
        res.statusCode = 409;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ error: "slug_conflict" }));
    });
    try {
        const context = buildContext("guiatv", {
            site: {
                ...buildContext("guiatv").site,
                baseUrl: server.url,
                publishingCredentialsRef: "GUIATV_TEST_KEY",
            },
        });
        await strict_1.default.rejects(() => (0, publishers_1.getPublisher)(context.site).publishDraft(context), /http_error status=409 body=\{"error":"slug_conflict"\}/);
    }
    finally {
        await server.close();
    }
});
(0, node_test_1.default)("tecnoria publishes with bearer token and image upload", async () => {
    process.env["APP_ENV"] = "production";
    process.env["NODE_ENV"] = "production";
    process.env["PUBLISH_DRY_RUN"] = "false";
    process.env["TECNORIA_TEST_TOKEN"] = "tecnoria-token";
    process.env["IMAGE_DOWNLOAD_TIMEOUT_MS"] = "1000";
    const server = await createMockServer((req, res, bodyText) => {
        if (req.url === "/assets/generated.png" && req.method === "GET") {
            res.statusCode = 200;
            res.setHeader("content-type", "image/png");
            res.end(Buffer.from("png"));
            return;
        }
        if (req.url === "/api/v1/blog/upload-image" && req.method === "POST") {
            strict_1.default.equal(req.headers.authorization, "Bearer tecnoria-token");
            strict_1.default.match(String(req.headers["content-type"]), /multipart\/form-data/);
            res.statusCode = 201;
            res.setHeader("content-type", "application/json");
            res.end(JSON.stringify({ url: "/uploads/blog/generated.png" }));
            return;
        }
        if (req.url === "/api/v1/blog" && req.method === "POST") {
            strict_1.default.equal(req.headers.authorization, "Bearer tecnoria-token");
            const body = JSON.parse(bodyText);
            strict_1.default.equal(body.slug, "proyecto-test");
            strict_1.default.equal(body.image, "/uploads/blog/generated.png");
            strict_1.default.equal(body.status, "publish");
            strict_1.default.equal(body.seoTitle, "SEO Titulo");
            res.statusCode = 201;
            res.setHeader("content-type", "application/json");
            res.end(JSON.stringify({ id: "42", slug: "proyecto-test", status: "publish" }));
            return;
        }
        res.statusCode = 404;
        res.end();
    });
    try {
        const context = buildContext("tecnoria", {
            site: {
                ...buildContext("tecnoria").site,
                baseUrl: server.url,
                publishingCredentialsRef: "TECNORIA_TEST_TOKEN",
            },
            assetUrl: `${server.url}/assets/generated.png`,
        });
        const result = await (0, publishers_1.getPublisher)(context.site).publish(context);
        strict_1.default.equal(result.externalId, "42");
        strict_1.default.equal(result.effectiveTargetStatus, "publish");
        strict_1.default.equal(result.externalUrl, `${server.url}/blog/proyecto-test`);
    }
    finally {
        await server.close();
    }
});
(0, node_test_1.default)("tecnoria unpublish downgrades the remote article to draft", async () => {
    process.env["APP_ENV"] = "production";
    process.env["NODE_ENV"] = "production";
    process.env["PUBLISH_DRY_RUN"] = "false";
    process.env["TECNORIA_TEST_TOKEN"] = "tecnoria-token";
    const server = await createMockServer((req, res, bodyText) => {
        if (req.url === "/api/v1/blog/42" && req.method === "PUT") {
            strict_1.default.equal(req.headers.authorization, "Bearer tecnoria-token");
            const body = JSON.parse(bodyText);
            strict_1.default.equal(body.status, "draft");
            res.statusCode = 200;
            res.setHeader("content-type", "application/json");
            res.end(JSON.stringify({ id: "42", slug: "proyecto-test", status: "draft" }));
            return;
        }
        res.statusCode = 404;
        res.end();
    });
    try {
        const context = buildContext("tecnoria", {
            site: {
                ...buildContext("tecnoria").site,
                baseUrl: server.url,
                publishingCredentialsRef: "TECNORIA_TEST_TOKEN",
            },
        });
        const result = await (0, publishers_1.getPublisher)(context.site).unpublish(context, "42");
        strict_1.default.equal(result.externalId, "42");
    }
    finally {
        await server.close();
    }
});
(0, node_test_1.default)("tecnoria surfaces 401 login failures", async () => {
    process.env["APP_ENV"] = "production";
    process.env["NODE_ENV"] = "production";
    process.env["PUBLISH_DRY_RUN"] = "false";
    process.env["TECNORIA_TEST_CREDS"] = JSON.stringify({
        email: "admin@example.test",
        password: "secret",
    });
    const server = await createMockServer((_req, res) => {
        res.statusCode = 401;
        res.end("bad credentials");
    });
    try {
        const context = buildContext("tecnoria", {
            site: {
                ...buildContext("tecnoria").site,
                baseUrl: server.url,
                publishingCredentialsRef: "TECNORIA_TEST_CREDS",
            },
        });
        await strict_1.default.rejects(() => (0, publishers_1.getPublisher)(context.site).publish(context), /tecnoria_login_failed status=401 body=bad credentials/);
    }
    finally {
        await server.close();
    }
});
(0, node_test_1.default)("tecnoria surfaces partial upload failures before publishing", async () => {
    process.env["APP_ENV"] = "production";
    process.env["NODE_ENV"] = "production";
    process.env["PUBLISH_DRY_RUN"] = "false";
    process.env["TECNORIA_TEST_TOKEN"] = "tecnoria-token";
    const server = await createMockServer((req, res) => {
        if (req.url === "/assets/generated.png" && req.method === "GET") {
            res.statusCode = 200;
            res.setHeader("content-type", "image/png");
            res.end(Buffer.from("png"));
            return;
        }
        if (req.url === "/api/v1/blog/upload-image" && req.method === "POST") {
            res.statusCode = 422;
            res.setHeader("content-type", "application/json");
            res.end(JSON.stringify({ code: "INVALID_IMAGE" }));
            return;
        }
        res.statusCode = 404;
        res.end();
    });
    try {
        const context = buildContext("tecnoria", {
            site: {
                ...buildContext("tecnoria").site,
                baseUrl: server.url,
                publishingCredentialsRef: "TECNORIA_TEST_TOKEN",
            },
            assetUrl: `${server.url}/assets/generated.png`,
        });
        await strict_1.default.rejects(() => (0, publishers_1.getPublisher)(context.site).publish(context), /http_error status=422 body=\{"code":"INVALID_IMAGE"\}/);
    }
    finally {
        await server.close();
    }
});
(0, node_test_1.default)("talkaris publishes with bearer token and preserves SEO fields", async () => {
    process.env["APP_ENV"] = "production";
    process.env["NODE_ENV"] = "production";
    process.env["PUBLISH_DRY_RUN"] = "false";
    process.env["TALKARIS_TEST_TOKEN"] = "talkaris-token";
    const server = await createMockServer((req, res, bodyText) => {
        if (req.url === "/api/v1/ops/blog" && req.method === "POST") {
            strict_1.default.equal(req.headers.authorization, "Bearer talkaris-token");
            const body = JSON.parse(bodyText);
            strict_1.default.equal(body.slug, "proyecto-test");
            strict_1.default.equal(body.status, "publish");
            strict_1.default.equal(body.seoDescription, "SEO Descripcion");
            strict_1.default.equal(body.imageUrl, "https://auctorio.example/assets/image.webp");
            res.statusCode = 201;
            res.setHeader("content-type", "application/json");
            res.end(JSON.stringify({ id: "talkaris-1", slug: "proyecto-test", status: "publish" }));
            return;
        }
        res.statusCode = 404;
        res.end();
    });
    try {
        const context = buildContext("talkaris", {
            site: {
                ...buildContext("talkaris").site,
                baseUrl: server.url,
                publishingCredentialsRef: "TALKARIS_TEST_TOKEN",
            },
            assetUrl: "https://auctorio.example/assets/image.webp",
        });
        const result = await (0, publishers_1.getPublisher)(context.site).publish(context);
        strict_1.default.equal(result.externalId, "talkaris-1");
        strict_1.default.equal(result.externalUrl, `${server.url}/blog/proyecto-test`);
        strict_1.default.equal(result.effectiveTargetStatus, "publish");
    }
    finally {
        await server.close();
    }
});
(0, node_test_1.default)("talkaris draft sync and unpublish use the same remote record id", async () => {
    process.env["APP_ENV"] = "production";
    process.env["NODE_ENV"] = "production";
    process.env["PUBLISH_DRY_RUN"] = "false";
    process.env["TALKARIS_TEST_TOKEN"] = "talkaris-token";
    const seen = [];
    const server = await createMockServer((req, res, bodyText) => {
        if (req.url === "/api/v1/ops/blog/talkaris-1" && req.method === "PUT") {
            const body = JSON.parse(bodyText);
            seen.push({ method: "PUT", status: String(body.status) });
            res.statusCode = 200;
            res.setHeader("content-type", "application/json");
            res.end(JSON.stringify({ id: "talkaris-1", slug: "proyecto-test", status: body.status }));
            return;
        }
        res.statusCode = 404;
        res.end();
    });
    try {
        const context = buildContext("talkaris", {
            site: {
                ...buildContext("talkaris").site,
                baseUrl: server.url,
                publishingCredentialsRef: "TALKARIS_TEST_TOKEN",
            },
        });
        const publisher = (0, publishers_1.getPublisher)(context.site);
        const draft = await publisher.updateDraft(context, "talkaris-1");
        const unpublished = await publisher.unpublish(context, "talkaris-1");
        strict_1.default.equal(draft.effectiveTargetStatus, "draft");
        strict_1.default.equal(unpublished.externalId, "talkaris-1");
        strict_1.default.deepEqual(seen, [
            { method: "PUT", status: "draft" },
            { method: "PUT", status: "draft" },
        ]);
    }
    finally {
        await server.close();
    }
});
(0, node_test_1.default)("webhook publisher signs the payload and preserves draft target status", async () => {
    process.env["APP_ENV"] = "production";
    process.env["NODE_ENV"] = "production";
    process.env["PUBLISH_DRY_RUN"] = "false";
    process.env["WEBHOOK_SECRET"] = "super-secret";
    const server = await createMockServer((req, res, bodyText) => {
        const body = JSON.parse(bodyText);
        const publication = body.publication;
        strict_1.default.equal(publication.targetStatus, "draft");
        strict_1.default.equal(publication.action, "publishDraft");
        strict_1.default.ok(req.headers["x-content-signature"]);
        res.statusCode = 200;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ id: "webhook-1", url: "https://consumer.example/items/1" }));
    });
    try {
        const context = buildContext("webhook", {
            site: {
                ...buildContext("webhook").site,
                baseUrl: server.url,
                publishingCredentialsRef: "WEBHOOK_SECRET",
            },
        });
        const result = await (0, publishers_1.getPublisher)(context.site).publishDraft(context);
        strict_1.default.equal(result.externalId, "webhook-1");
        strict_1.default.equal(result.effectiveTargetStatus, "draft");
    }
    finally {
        await server.close();
    }
});
(0, node_test_1.default)("webhook publisher surfaces timeout failures", async () => {
    process.env["APP_ENV"] = "production";
    process.env["NODE_ENV"] = "production";
    process.env["PUBLISH_DRY_RUN"] = "false";
    process.env["PUBLISH_TIMEOUT_MS"] = "25";
    process.env["WEBHOOK_SECRET"] = "super-secret";
    const server = await createMockServer(async (_req, res) => {
        await new Promise((resolve) => setTimeout(resolve, 100));
        res.statusCode = 200;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ id: "slow-webhook" }));
    });
    try {
        const context = buildContext("webhook", {
            site: {
                ...buildContext("webhook").site,
                baseUrl: server.url,
                publishingCredentialsRef: "WEBHOOK_SECRET",
            },
        });
        await strict_1.default.rejects(() => (0, publishers_1.getPublisher)(context.site).publish(context));
    }
    finally {
        await server.close();
    }
});
(0, node_test_1.default)("tecnoria sends JSON content-type with bearer-token auth (regression: INVALID_INPUT)", async () => {
    process.env["APP_ENV"] = "production";
    process.env["NODE_ENV"] = "production";
    process.env["PUBLISH_DRY_RUN"] = "false";
    process.env["TECNORIA_TEST_TOKEN"] = "tecnoria-token";
    const seenHeaders = [];
    const server = await createMockServer((req, res, bodyText) => {
        const headers = req.headers;
        seenHeaders.push(headers);
        if (req.url === "/api/v1/blog" && req.method === "POST") {
            strict_1.default.equal(String(headers.authorization), "Bearer tecnoria-token");
            const contentType = String(headers["content-type"] ?? "");
            strict_1.default.match(contentType, /application\/json/);
            const body = JSON.parse(bodyText);
            strict_1.default.equal(body.status, "draft");
            strict_1.default.equal(body.slug, "proyecto-test");
            res.statusCode = 201;
            res.setHeader("content-type", "application/json");
            res.end(JSON.stringify({ id: "tpost-1", slug: "proyecto-test", status: "draft" }));
            return;
        }
        if (req.url === "/api/v1/blog/tpost-1" && req.method === "PUT") {
            strict_1.default.equal(String(headers.authorization), "Bearer tecnoria-token");
            const contentType = String(headers["content-type"] ?? "");
            strict_1.default.match(contentType, /application\/json/);
            const body = JSON.parse(bodyText);
            strict_1.default.equal(body.status, "publish");
            res.statusCode = 200;
            res.setHeader("content-type", "application/json");
            res.end(JSON.stringify({ id: "tpost-1", slug: "proyecto-test", status: "publish" }));
            return;
        }
        res.statusCode = 404;
        res.end();
    });
    try {
        const context = buildContext("tecnoria", {
            site: {
                ...buildContext("tecnoria").site,
                baseUrl: server.url,
                publishingCredentialsRef: "TECNORIA_TEST_TOKEN",
            },
        });
        const publisher = (0, publishers_1.getPublisher)(context.site);
        const draft = await publisher.publishDraft(context);
        strict_1.default.equal(draft.externalId, "tpost-1");
        strict_1.default.equal(draft.externalUrl, `${server.url}/blog/proyecto-test`);
        const published = await publisher.publish(context, draft.externalId);
        strict_1.default.equal(published.externalId, "tpost-1");
        // Every JSON request in the flow must carry a JSON content type so the
        // destination's express.json() parses the body.
        for (const headers of seenHeaders) {
            strict_1.default.match(String(headers["content-type"] ?? ""), /application\/json/);
        }
    }
    finally {
        await server.close();
    }
});
