"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerStudioRoutes = registerStudioRoutes;
const node_fs_1 = require("node:fs");
const node_path_1 = __importDefault(require("node:path"));
const ioredis_1 = __importDefault(require("ioredis"));
const prisma_1 = require("../infrastructure/db/prisma");
const redis_1 = require("../infrastructure/queue/redis");
const env_1 = require("../shared/utils/env");
const mime_1 = require("../shared/utils/mime");
const repository_1 = require("./repository");
const auth_1 = require("./auth");
const orchestration_1 = require("./orchestration");
const projects_1 = require("./projects");
const publication_1 = require("./publication");
const qa_1 = require("./qa");
const google_1 = require("./google");
const prompts_1 = require("./prompts");
const review_1 = require("./review");
const security_1 = require("./security");
const http_utils_1 = require("./http-utils");
const views_1 = require("./views");
const routes_editorial_1 = require("./routes-editorial");
const SITE_TYPES = ["guiatv", "tecnoria", "talkaris", "webhook"];
const PROJECT_GOALS = [
    "article",
    "landing",
    "comparison",
    "faq",
    "newsletter",
    "social_pack",
    "news_article",
];
const PROJECT_STATUSES = [
    "draft",
    "ai_generated",
    "qa_failed",
    "qa_passed",
    "in_review",
    "approved",
    "publish_queued",
    "published",
    "publish_failed",
];
const CONTENT_STATUSES = ["queued", "processing", "done", "failed", "retryable", "canceled"];
const PUBLICATION_STATUSES = [
    "queued",
    "processing",
    "draft_synced",
    "published",
    "failed",
    "canceled",
];
const STUDIO_USER_STATUSES = ["invited", "active", "suspended"];
const STUDIO_PROMPT_SURFACES = [
    "text_seo",
    "text_instagram",
    "image_contextual",
    "image_independent",
];
const STUDIO_PROMPT_SCOPES = ["global", "site"];
const STUDIO_PROMPT_VERSION_STATUSES = ["draft", "approved", "deprecated"];
const STUDIO_PROVISIONING_MODES = ["invite_only"];
const prisma = (0, prisma_1.getPrismaClient)();
function authErrorReply(reply, status, message) {
    return reply.code(status).send((0, http_utils_1.errorBody)(reply, "auth_error", message));
}
function getAuthErrorStatus(message) {
    if ([
        "email_required",
        "password_required",
        "workspace_selection_required",
        "workspace_not_authorized",
        "google_login_not_configured",
        "google_identity_invalid",
        "google_email_not_verified",
        "invite_invalid",
        "invite_expired",
        "invite_consumed",
        "reset_invalid",
        "reset_expired",
        "reset_consumed",
        "password_too_short",
    ].includes(message)) {
        return 400;
    }
    if ([
        "invalid_credentials",
        "activation_required",
        "password_login_not_available",
        "user_not_authorized",
        "user_suspended",
        "google_subject_mismatch",
    ].includes(message)) {
        return 403;
    }
    return 500;
}
function parsePublicationTargetStatus(value) {
    return value === "draft" || value === "publish" ? value : null;
}
async function handleReadyCheck() {
    const prisma = (0, prisma_1.getPrismaClient)();
    await prisma.$queryRaw `SELECT 1`;
    const redis = new ioredis_1.default((0, redis_1.getRedisConnectionOptions)());
    try {
        await redis.ping();
    }
    finally {
        redis.disconnect();
    }
    const storageRoot = node_path_1.default.resolve((0, env_1.getEnv)("STORAGE_ROOT", "/var/www/auctorio/storage"));
    const probePath = node_path_1.default.join(storageRoot, ".health-probe");
    await node_fs_1.promises.writeFile(probePath, `${Date.now()}`);
    await node_fs_1.promises.unlink(probePath);
}
async function checkDestinationHealth() {
    const prisma = (0, prisma_1.getPrismaClient)();
    const sites = await prisma.site.findMany({ select: { id: true, key: true, type: true, baseUrl: true } });
    return Promise.all(sites.map(async (site) => {
        const baseUrl = String(site.baseUrl || "").trim();
        if (!baseUrl) {
            return {
                siteId: site.id,
                siteKey: site.key,
                siteType: site.type,
                baseUrl: null,
                reachable: false,
                status: null,
                latencyMs: null,
                error: "no baseUrl configured",
            };
        }
        const startedAt = Date.now();
        try {
            const response = await fetch(baseUrl, {
                signal: AbortSignal.timeout(6_000),
                redirect: "follow",
            });
            return {
                siteId: site.id,
                siteKey: site.key,
                siteType: site.type,
                baseUrl,
                reachable: response.ok,
                status: response.status,
                latencyMs: Date.now() - startedAt,
                error: response.ok ? null : `HTTP ${response.status}`,
            };
        }
        catch (error) {
            return {
                siteId: site.id,
                siteKey: site.key,
                siteType: site.type,
                baseUrl,
                reachable: false,
                status: null,
                latencyMs: Date.now() - startedAt,
                error: error?.cause?.code || error.message,
            };
        }
    }));
}
async function serveAsset(request, reply) {
    const params = request.params;
    const storageRoot = node_path_1.default.resolve((0, env_1.getEnv)("STORAGE_ROOT", "/var/www/auctorio/storage"));
    const rawPath = String(params["*"] || "").replace(/^\/+/, "");
    const absolutePath = node_path_1.default.resolve(storageRoot, rawPath);
    if (!absolutePath.startsWith(storageRoot)) {
        return reply.code(400).send({ error: "bad_request", message: "Invalid asset path" });
    }
    try {
        const file = await node_fs_1.promises.readFile(absolutePath);
        reply.header("content-type", (0, mime_1.getContentTypeFromPath)(absolutePath));
        reply.header("cache-control", "public, max-age=86400");
        return reply.send(file);
    }
    catch {
        return (0, http_utils_1.notFound)(reply, "asset not found");
    }
}
function registerStudioRoutes(fastify) {
    (0, routes_editorial_1.registerEditorialRoutes)(fastify);
    fastify.get("/health/live", async () => ({ status: "ok" }));
    fastify.get("/health/ready", async (_request, reply) => {
        try {
            await handleReadyCheck();
            return reply.send({ status: "ok" });
        }
        catch (error) {
            return reply.code(503).send({
                status: "degraded",
                message: String(error),
            });
        }
    });
    fastify.get("/health/destinations", async (_request, reply) => {
        try {
            return reply.send({
                status: "ok",
                destinations: await checkDestinationHealth(),
            });
        }
        catch (error) {
            return reply.code(503).send({
                status: "degraded",
                message: String(error),
            });
        }
    });
    fastify.get("/assets/*", serveAsset);
    fastify.get("/internal/identity-provider/:slug", async (request, reply) => {
        if (!(0, http_utils_1.requireInternalSecret)(request, reply)) {
            return;
        }
        const slug = request.params.slug;
        const provider = await (0, auth_1.getInternalStudioIdentityProviderBySlug)(slug);
        if (!provider) {
            return (0, http_utils_1.notFound)(reply, "identity provider not found");
        }
        return reply.send(provider);
    });
    fastify.get("/internal/workspace-access/:slug", async (request, reply) => {
        if (!(0, http_utils_1.requireInternalSecret)(request, reply)) {
            return;
        }
        const slug = request.params.slug;
        const access = await (0, auth_1.getInternalStudioWorkspaceAccessBySlug)(slug);
        if (!access) {
            return (0, http_utils_1.notFound)(reply, "workspace not found");
        }
        return reply.send(access);
    });
    fastify.post("/internal/login/options", async (request, reply) => {
        if (!(0, http_utils_1.requireInternalSecret)(request, reply)) {
            return;
        }
        const body = (0, http_utils_1.parseBody)(request);
        const email = body.email?.trim() || "";
        if (!email) {
            return (0, http_utils_1.badRequest)(reply, "email_required");
        }
        try {
            const options = await (0, auth_1.getStudioLoginOptions)(email);
            return reply.send(options);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return reply.code(getAuthErrorStatus(message)).send({
                error: "auth_error",
                message,
            });
        }
    });
    fastify.post("/internal/login/password", async (request, reply) => {
        if (!(0, http_utils_1.requireInternalSecret)(request, reply)) {
            return;
        }
        const body = (0, http_utils_1.parseBody)(request);
        try {
            const result = await (0, auth_1.loginStudioAccountWithPassword)({
                email: body.email?.trim() || "",
                password: body.password || "",
                workspaceId: body.workspaceId?.trim() || null,
            });
            return reply.send(result);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return reply.code(getAuthErrorStatus(message)).send({
                error: "auth_error",
                message,
            });
        }
    });
    fastify.post("/internal/login/google", async (request, reply) => {
        if (!(0, http_utils_1.requireInternalSecret)(request, reply)) {
            return;
        }
        const body = (0, http_utils_1.parseBody)(request);
        try {
            const result = await (0, auth_1.loginStudioAccountWithGoogle)({
                credential: body.credential?.trim() || "",
                emailHint: body.emailHint?.trim() || null,
                workspaceId: body.workspaceId?.trim() || null,
            });
            return reply.send(result);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return reply.code(getAuthErrorStatus(message)).send({
                error: "auth_error",
                message,
            });
        }
    });
    fastify.get("/internal/auth/providers", async (request, reply) => {
        if (!(0, http_utils_1.requireInternalSecret)(request, reply)) {
            return;
        }
        return reply.send({
            googleClientId: (0, google_1.getStudioGoogleClientId)(),
        });
    });
    fastify.post("/internal/session/global-login/password", async (request, reply) => {
        if (!(0, http_utils_1.requireInternalSecret)(request, reply)) {
            return;
        }
        const body = (0, http_utils_1.parseBody)(request);
        try {
            const result = await (0, auth_1.loginStudioAccountWithPasswordGlobal)({
                email: body.email?.trim() || "",
                password: body.password || "",
            });
            return reply.send(result);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return reply.code(getAuthErrorStatus(message)).send({
                error: "auth_error",
                message,
            });
        }
    });
    fastify.post("/internal/session/global-login/google", async (request, reply) => {
        if (!(0, http_utils_1.requireInternalSecret)(request, reply)) {
            return;
        }
        const body = (0, http_utils_1.parseBody)(request);
        try {
            const result = await (0, auth_1.loginStudioAccountWithGoogleGlobal)({
                credential: body.credential?.trim() || "",
            });
            return reply.send(result);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return reply.code(getAuthErrorStatus(message)).send({
                error: "auth_error",
                message,
            });
        }
    });
    fastify.post("/internal/password/forgot", async (request, reply) => {
        if (!(0, http_utils_1.requireInternalSecret)(request, reply)) {
            return;
        }
        const body = (0, http_utils_1.parseBody)(request);
        try {
            const result = await (0, auth_1.sendStudioPasswordReset)(body.email?.trim() || "");
            return reply.send(result);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return reply.code(getAuthErrorStatus(message)).send({
                error: "auth_error",
                message,
            });
        }
    });
    fastify.post("/internal/password/reset", async (request, reply) => {
        if (!(0, http_utils_1.requireInternalSecret)(request, reply)) {
            return;
        }
        const body = (0, http_utils_1.parseBody)(request);
        try {
            const result = await (0, auth_1.resetStudioPassword)({
                token: body.token?.trim() || "",
                password: body.password || "",
            });
            return reply.send(result);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return reply.code(getAuthErrorStatus(message)).send({
                error: "auth_error",
                message,
            });
        }
    });
    fastify.post("/internal/invitations/accept", async (request, reply) => {
        if (!(0, http_utils_1.requireInternalSecret)(request, reply)) {
            return;
        }
        const body = (0, http_utils_1.parseBody)(request);
        try {
            const result = await (0, auth_1.acceptStudioInvitation)({
                token: body.token?.trim() || "",
                password: body.password || "",
                workspaceId: body.workspaceId?.trim() || null,
            });
            return reply.send(result);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return reply.code(getAuthErrorStatus(message)).send({
                error: "auth_error",
                message,
            });
        }
    });
    fastify.post("/internal/launch-tickets", async (request, reply) => {
        if (!(0, http_utils_1.requireInternalSecret)(request, reply)) {
            return;
        }
        const body = (0, http_utils_1.parseBody)(request);
        if (!body.workspace?.trim() || !body.email?.trim() || !body.sourceApp?.trim()) {
            return (0, http_utils_1.badRequest)(reply, "workspace, email and sourceApp are required");
        }
        try {
            const ticket = await (0, auth_1.createStudioLaunchTicket)({
                slug: body.workspace.trim(),
                email: body.email.trim(),
                displayName: body.displayName ?? null,
                returnTo: body.returnTo ?? null,
                sourceApp: body.sourceApp.trim(),
            });
            request.log.info({
                workspace: ticket.tenantSlug,
                email: body.email.trim().toLowerCase(),
                returnTo: ticket.returnTo,
                sourceApp: body.sourceApp.trim(),
            }, "studio_launch_ticket_created");
            return reply.send(ticket);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            request.log.warn({
                workspace: body.workspace?.trim(),
                email: body.email?.trim().toLowerCase(),
                returnTo: body.returnTo ?? null,
                sourceApp: body.sourceApp?.trim(),
                reason: message,
            }, "studio_launch_ticket_failed");
            if (message === "workspace_not_found") {
                return (0, http_utils_1.notFound)(reply, message);
            }
            if (message === "workspace_launch_not_allowed" ||
                message === "interactive_login_required" ||
                message === "user_not_authorized" ||
                message === "user_suspended") {
                return reply.code(403).send({ error: "forbidden", message });
            }
            return reply.code(500).send({ error: "internal_error", message });
        }
    });
    fastify.post("/internal/launch-tickets/redeem", async (request, reply) => {
        if (!(0, http_utils_1.requireInternalSecret)(request, reply)) {
            return;
        }
        const body = (0, http_utils_1.parseBody)(request);
        const launchId = body.launchId?.trim();
        if (!launchId) {
            return (0, http_utils_1.badRequest)(reply, "launchId is required");
        }
        try {
            const redeemed = await (0, auth_1.redeemStudioLaunchTicket)(launchId);
            request.log.info({
                workspace: redeemed.tenantSlug,
                returnTo: redeemed.returnTo,
                userId: redeemed.session.user.id,
                email: redeemed.session.user.email,
            }, "studio_launch_ticket_redeemed");
            return reply.send(redeemed);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            request.log.warn({ launchId, reason: message }, "studio_launch_ticket_redeem_failed");
            if (message === "launch_invalid" ||
                message === "launch_consumed" ||
                message === "launch_expired") {
                return reply.code(400).send({ error: "bad_request", message });
            }
            if (message === "user_suspended" || message === "user_not_found") {
                return reply.code(403).send({ error: "forbidden", message });
            }
            return reply.code(500).send({ error: "internal_error", message });
        }
    });
    fastify.post("/internal/session/oidc", async (request, reply) => {
        if (!(0, http_utils_1.requireInternalSecret)(request, reply)) {
            return;
        }
        const body = (0, http_utils_1.parseBody)(request);
        if (!body.slug?.trim() || !body.issuer?.trim() || !body.subject?.trim()) {
            return (0, http_utils_1.badRequest)(reply, "slug, issuer and subject are required");
        }
        try {
            const result = await (0, auth_1.completeStudioSsoLogin)({
                slug: body.slug.trim(),
                issuer: body.issuer.trim(),
                subject: body.subject.trim(),
                claims: body.claims && typeof body.claims === "object" && !Array.isArray(body.claims)
                    ? body.claims
                    : {},
            });
            return reply.send(result);
        }
        catch (error) {
            return reply.code(400).send({
                error: "bad_request",
                message: error instanceof Error ? error.message : String(error),
            });
        }
    });
    fastify.post("/internal/session/validate", async (request, reply) => {
        if (!(0, http_utils_1.requireInternalSecret)(request, reply)) {
            return;
        }
        const body = (0, http_utils_1.parseBody)(request);
        const token = body.sessionToken?.trim();
        if (!token) {
            return (0, http_utils_1.badRequest)(reply, "sessionToken is required");
        }
        const record = await (0, auth_1.getStudioSessionByToken)(token);
        if (!record) {
            return reply.code(401).send({ error: "unauthorized", message: "Invalid session token" });
        }
        return reply.send(record);
    });
    fastify.post("/internal/session/revoke", async (request, reply) => {
        if (!(0, http_utils_1.requireInternalSecret)(request, reply)) {
            return;
        }
        const body = (0, http_utils_1.parseBody)(request);
        const token = body.sessionToken?.trim();
        if (!token) {
            return (0, http_utils_1.badRequest)(reply, "sessionToken is required");
        }
        await (0, auth_1.revokeStudioSessionByToken)(token);
        return reply.send({ ok: true });
    });
    fastify.get("/v2/session/me", async (request, reply) => {
        const context = await (0, http_utils_1.requireStudioContext)(request, reply);
        if (!context) {
            return;
        }
        const session = context.authMode === "oidc" && context.sessionId
            ? await (0, auth_1.getStudioSessionBySessionId)(context.sessionId)
            : await (0, auth_1.buildApiKeyStudioSession)(context.tenantId);
        if (!session) {
            return reply.code(401).send({ error: "unauthorized", message: "Invalid studio session" });
        }
        return reply.send(session);
    });
    fastify.get("/v2/sites", async (request, reply) => {
        const context = await (0, http_utils_1.requireStudioContext)(request, reply);
        if (!context) {
            return;
        }
        const query = request.query;
        const page = (0, http_utils_1.parsePage)(query.page, 1);
        const pageSize = (0, http_utils_1.parsePageSize)(query.pageSize, 20);
        const sites = await (0, repository_1.listSites)(context.tenantId, page, pageSize);
        return reply.send(sites);
    });
    fastify.post("/v2/sites", async (request, reply) => {
        const context = await (0, http_utils_1.requireStudioPermission)(request, reply, "integrations.manage");
        if (!context) {
            return;
        }
        const body = (0, http_utils_1.parseBody)(request);
        if (!body.key?.trim() || !body.name?.trim() || !body.type) {
            return (0, http_utils_1.badRequest)(reply, "key, name and type are required");
        }
        if (!(0, http_utils_1.isOneOf)(body.type, SITE_TYPES)) {
            return (0, http_utils_1.badRequest)(reply, `type must be one of: ${SITE_TYPES.join(", ")}`);
        }
        try {
            const site = await (0, repository_1.createSite)(context.tenantId, {
                key: body.key.trim(),
                name: body.name.trim(),
                type: body.type,
                locale: body.locale,
                baseUrl: (0, http_utils_1.parseOptionalString)(body.baseUrl) ?? null,
                brandVoice: (0, http_utils_1.parseJsonObjectField)(body.brandVoice, "brandVoice") ?? null,
                seoRules: (0, http_utils_1.parseJsonObjectField)(body.seoRules, "seoRules") ?? null,
                taxonomyMap: (0, http_utils_1.parseJsonObjectField)(body.taxonomyMap, "taxonomyMap") ?? null,
                publishingCredentialsRef: (0, http_utils_1.parseOptionalString)(body.publishingCredentialsRef) ?? null,
            });
            return reply.code(201).send(site);
        }
        catch (error) {
            return (0, http_utils_1.badRequest)(reply, String(error));
        }
    });
    fastify.get("/v2/sites/:id", async (request, reply) => {
        const context = await (0, http_utils_1.requireStudioContext)(request, reply);
        if (!context) {
            return;
        }
        const siteId = request.params.id;
        if (!(0, http_utils_1.isUuid)(siteId)) {
            return (0, http_utils_1.badRequest)(reply, "invalid site id");
        }
        const site = await (0, repository_1.getSiteById)(context.tenantId, siteId);
        if (!site) {
            return (0, http_utils_1.notFound)(reply, "site not found");
        }
        return reply.send(site);
    });
    fastify.put("/v2/sites/:id", async (request, reply) => {
        const context = await (0, http_utils_1.requireStudioPermission)(request, reply, "integrations.manage");
        if (!context) {
            return;
        }
        const siteId = request.params.id;
        if (!(0, http_utils_1.isUuid)(siteId)) {
            return (0, http_utils_1.badRequest)(reply, "invalid site id");
        }
        const body = (0, http_utils_1.parseBody)(request);
        if (body.type && !(0, http_utils_1.isOneOf)(body.type, SITE_TYPES)) {
            return (0, http_utils_1.badRequest)(reply, `type must be one of: ${SITE_TYPES.join(", ")}`);
        }
        try {
            const site = await (0, repository_1.updateSite)(context.tenantId, siteId, {
                name: body.name?.trim(),
                type: body.type,
                locale: body.locale?.trim(),
                baseUrl: (0, http_utils_1.parseOptionalString)(body.baseUrl),
                brandVoice: (0, http_utils_1.parseJsonObjectField)(body.brandVoice, "brandVoice"),
                seoRules: (0, http_utils_1.parseJsonObjectField)(body.seoRules, "seoRules"),
                taxonomyMap: (0, http_utils_1.parseJsonObjectField)(body.taxonomyMap, "taxonomyMap"),
                publishingCredentialsRef: (0, http_utils_1.parseOptionalString)(body.publishingCredentialsRef),
            });
            if (!site) {
                return (0, http_utils_1.notFound)(reply, "site not found");
            }
            return reply.send(site);
        }
        catch (error) {
            return (0, http_utils_1.badRequest)(reply, String(error));
        }
    });
    fastify.get("/v2/projects", async (request, reply) => {
        const context = await (0, http_utils_1.requireStudioContext)(request, reply);
        if (!context) {
            return;
        }
        const query = request.query;
        const page = (0, http_utils_1.parsePage)(query.page, 1);
        const pageSize = (0, http_utils_1.parsePageSize)(query.pageSize, 20);
        if (query.siteId && !(0, http_utils_1.isUuid)(query.siteId)) {
            return (0, http_utils_1.badRequest)(reply, "invalid siteId");
        }
        if (query.status && !(0, http_utils_1.isOneOf)(query.status, PROJECT_STATUSES)) {
            return (0, http_utils_1.badRequest)(reply, `status must be one of: ${PROJECT_STATUSES.join(", ")}`);
        }
        if (query.goal && !(0, http_utils_1.isOneOf)(query.goal, PROJECT_GOALS)) {
            return (0, http_utils_1.badRequest)(reply, `goal must be one of: ${PROJECT_GOALS.join(", ")}`);
        }
        if (query.origin && !(0, http_utils_1.isOneOf)(query.origin, ["manual", "auto"])) {
            return (0, http_utils_1.badRequest)(reply, "origin must be one of: manual, auto");
        }
        const projects = await (0, repository_1.listProjects)(context.tenantId, {
            siteId: query.siteId,
            status: query.status,
            goal: query.goal,
            page,
            pageSize,
            search: (0, http_utils_1.parseOptionalString)(query.search) ?? undefined,
            origin: query.origin,
            includeArchived: query.archived === "true",
        });
        const items = await Promise.all(projects.items.map(async (project) => ({
            ...project,
            latestVersion: project.latestVersion
                ? {
                    ...project.latestVersion,
                    assetUrl: await (0, orchestration_1.buildAssetPublicUrl)(project.latestVersion.assetUrl),
                }
                : null,
        })));
        return reply.send({
            ...projects,
            items,
        });
    });
    fastify.post("/v2/projects", async (request, reply) => {
        const context = await (0, http_utils_1.requireStudioPermission)(request, reply, "projects.manage");
        if (!context) {
            return;
        }
        const body = (0, http_utils_1.parseBody)(request);
        if (!body.siteId?.trim() || !body.title?.trim() || !body.brief?.trim()) {
            return (0, http_utils_1.badRequest)(reply, "siteId, title and brief are required");
        }
        if (body.goal && !(0, http_utils_1.isOneOf)(body.goal, PROJECT_GOALS)) {
            return (0, http_utils_1.badRequest)(reply, `goal must be one of: ${PROJECT_GOALS.join(", ")}`);
        }
        const site = await (0, repository_1.getSiteById)(context.tenantId, body.siteId);
        if (!site) {
            return (0, http_utils_1.notFound)(reply, "site not found");
        }
        try {
            const project = await (0, repository_1.createProject)(context.tenantId, {
                siteId: site.id,
                title: body.title.trim(),
                brief: body.brief.trim(),
                goal: body.goal ?? "article",
                primaryLanguage: body.primaryLanguage ?? "es",
                metadata: (0, http_utils_1.parseJsonObjectField)(body.metadata, "metadata") ?? null,
            });
            return reply.code(201).send(project);
        }
        catch (error) {
            return (0, http_utils_1.badRequest)(reply, String(error));
        }
    });
    fastify.put("/v2/projects/:id", async (request, reply) => {
        const context = await (0, http_utils_1.requireStudioPermission)(request, reply, "projects.manage");
        if (!context) {
            return;
        }
        const projectId = request.params.id;
        if (!(0, http_utils_1.isUuid)(projectId)) {
            return (0, http_utils_1.badRequest)(reply, "invalid project id");
        }
        const body = (0, http_utils_1.parseBody)(request);
        if (body.siteId === undefined &&
            body.title === undefined &&
            body.brief === undefined &&
            body.goal === undefined &&
            body.primaryLanguage === undefined &&
            body.metadata === undefined) {
            return (0, http_utils_1.badRequest)(reply, "at least one project field must be provided");
        }
        if (body.siteId !== undefined && !body.siteId.trim()) {
            return (0, http_utils_1.badRequest)(reply, "siteId cannot be empty");
        }
        if (body.siteId && !(0, http_utils_1.isUuid)(body.siteId)) {
            return (0, http_utils_1.badRequest)(reply, "invalid siteId");
        }
        if (body.title !== undefined && !body.title.trim()) {
            return (0, http_utils_1.badRequest)(reply, "title cannot be empty");
        }
        if (body.brief !== undefined && !body.brief.trim()) {
            return (0, http_utils_1.badRequest)(reply, "brief cannot be empty");
        }
        if (body.primaryLanguage !== undefined && !body.primaryLanguage.trim()) {
            return (0, http_utils_1.badRequest)(reply, "primaryLanguage cannot be empty");
        }
        if (body.goal && !(0, http_utils_1.isOneOf)(body.goal, PROJECT_GOALS)) {
            return (0, http_utils_1.badRequest)(reply, `goal must be one of: ${PROJECT_GOALS.join(", ")}`);
        }
        const existingProject = await (0, repository_1.getProjectById)(context.tenantId, projectId);
        if (!existingProject) {
            return (0, http_utils_1.notFound)(reply, "project not found");
        }
        const nextSiteId = body.siteId?.trim();
        if (nextSiteId && nextSiteId !== existingProject.siteId) {
            const site = await (0, repository_1.getSiteById)(context.tenantId, nextSiteId);
            if (!site) {
                return (0, http_utils_1.notFound)(reply, "site not found");
            }
        }
        try {
            const parsedMetadata = (0, http_utils_1.parseJsonObjectField)(body.metadata, "metadata");
            await (0, repository_1.updateProject)(context.tenantId, projectId, {
                siteId: nextSiteId,
                title: body.title?.trim(),
                brief: body.brief?.trim(),
                goal: body.goal,
                primaryLanguage: body.primaryLanguage?.trim(),
                metadata: parsedMetadata,
            });
            const updatedProject = await (0, repository_1.getProjectById)(context.tenantId, projectId);
            if (!updatedProject) {
                return (0, http_utils_1.notFound)(reply, "project not found");
            }
            return reply.send(await (0, views_1.toProjectDetail)(updatedProject));
        }
        catch (error) {
            return (0, http_utils_1.badRequest)(reply, String(error));
        }
    });
    fastify.get("/v2/projects/:id", async (request, reply) => {
        const context = await (0, http_utils_1.requireStudioContext)(request, reply);
        if (!context) {
            return;
        }
        const projectId = request.params.id;
        if (!(0, http_utils_1.isUuid)(projectId)) {
            return (0, http_utils_1.badRequest)(reply, "invalid project id");
        }
        const project = await (0, repository_1.getProjectById)(context.tenantId, projectId);
        if (!project) {
            return (0, http_utils_1.notFound)(reply, "project not found");
        }
        return reply.send(await (0, views_1.toProjectDetail)(project));
    });
    fastify.post("/v2/projects/:id/generate", async (request, reply) => {
        const context = await (0, http_utils_1.requireStudioPermission)(request, reply, "projects.manage");
        if (!context) {
            return;
        }
        const projectId = request.params.id;
        if (!(0, http_utils_1.isUuid)(projectId)) {
            return (0, http_utils_1.badRequest)(reply, "invalid project id");
        }
        const project = await (0, repository_1.getProjectById)(context.tenantId, projectId);
        if (!project) {
            return (0, http_utils_1.notFound)(reply, "project not found");
        }
        const body = (0, http_utils_1.parseBody)(request);
        const result = await (0, orchestration_1.startProjectGeneration)(project.id, context.tenantId, body.feedback ?? null, body.promptPresetVersionId?.trim() || null);
        return reply.code(202).send({
            project_id: project.id,
            version_id: result.versionId,
            content_text_id: result.contentTextId,
            job_id: result.jobId,
            status: "queued",
        });
    });
    fastify.post("/v2/projects/:id/revise", async (request, reply) => {
        const context = await (0, http_utils_1.requireStudioPermission)(request, reply, "projects.manage");
        if (!context) {
            return;
        }
        const projectId = request.params.id;
        if (!(0, http_utils_1.isUuid)(projectId)) {
            return (0, http_utils_1.badRequest)(reply, "invalid project id");
        }
        const body = (0, http_utils_1.parseBody)(request);
        if (!body.feedback?.trim()) {
            return (0, http_utils_1.badRequest)(reply, "feedback is required");
        }
        const project = await (0, repository_1.getProjectById)(context.tenantId, projectId);
        if (!project) {
            return (0, http_utils_1.notFound)(reply, "project not found");
        }
        const result = await (0, orchestration_1.startProjectGeneration)(project.id, context.tenantId, body.feedback.trim(), null);
        return reply.code(202).send({
            project_id: project.id,
            version_id: result.versionId,
            content_text_id: result.contentTextId,
            job_id: result.jobId,
            status: "queued",
        });
    });
    fastify.post("/v2/projects/:id/approve", async (request, reply) => {
        const context = await (0, http_utils_1.requireStudioPermission)(request, reply, "review.approve");
        if (!context) {
            return;
        }
        const projectId = request.params.id;
        if (!(0, http_utils_1.isUuid)(projectId)) {
            return (0, http_utils_1.badRequest)(reply, "invalid project id");
        }
        const project = await (0, repository_1.getProjectById)(context.tenantId, projectId);
        if (!project) {
            return (0, http_utils_1.notFound)(reply, "project not found");
        }
        const latestVersion = project.versions[0];
        if (!latestVersion) {
            return (0, http_utils_1.badRequest)(reply, "project has no versions");
        }
        const reviewGate = (0, views_1.buildProjectReviewGate)(project);
        if (!reviewGate.approvalReady) {
            return (0, http_utils_1.badRequest)(reply, reviewGate.primaryConcern || "latest version is not ready for approval");
        }
        await (0, repository_1.approveVersion)(context.tenantId, project.id, latestVersion.id, context.userId ? "studio_user" : "studio", context.userId);
        return reply.send({
            project_id: project.id,
            version_id: latestVersion.id,
            status: "approved",
        });
    });
    fastify.post("/v2/projects/:id/publish", async (request, reply) => {
        const context = await (0, http_utils_1.requireStudioPermission)(request, reply, "publishing.manage");
        if (!context) {
            return;
        }
        const projectId = request.params.id;
        if (!(0, http_utils_1.isUuid)(projectId)) {
            return (0, http_utils_1.badRequest)(reply, "invalid project id");
        }
        const body = (0, http_utils_1.parseBody)(request);
        const action = body.action ?? "publish";
        const targetStatus = body.targetStatus ?? "publish";
        if (!(0, http_utils_1.isOneOf)(action, ["publish", "update", "unpublish"])) {
            return (0, http_utils_1.badRequest)(reply, "action must be one of: publish, update, unpublish");
        }
        if (!(0, http_utils_1.isOneOf)(targetStatus, ["draft", "publish"])) {
            return (0, http_utils_1.badRequest)(reply, "targetStatus must be one of: draft, publish");
        }
        const project = await (0, repository_1.getProjectById)(context.tenantId, projectId);
        if (!project) {
            return (0, http_utils_1.notFound)(reply, "project not found");
        }
        const latestVersion = project.versions[0];
        if (!latestVersion) {
            return (0, http_utils_1.badRequest)(reply, "project has no versions");
        }
        const reviewGate = (0, views_1.buildProjectReviewGate)(project);
        if (action !== "unpublish" &&
            !reviewGate.publishReady) {
            return (0, http_utils_1.badRequest)(reply, reviewGate.primaryConcern || "latest version is not ready for publishing");
        }
        const latestExternalId = await (0, repository_1.getLatestPublishedExternalId)(context.tenantId, project.site.id, project.id);
        if (action === "unpublish" && !latestExternalId) {
            return (0, http_utils_1.badRequest)(reply, "project has no published or synced external content");
        }
        const idempotencyKey = [
            "pub",
            project.site.id,
            project.id,
            latestVersion.id,
            action,
            targetStatus,
        ].join(":");
        const existing = await (0, repository_1.findPublicationJobByIdempotency)(context.tenantId, idempotencyKey);
        if (existing) {
            if (existing.status === "queued" || existing.status === "processing") {
                await (0, orchestration_1.queuePublication)(existing.id);
                return reply.code(202).send({
                    publication_id: existing.id,
                    project_id: project.id,
                    version_id: latestVersion.id,
                    status: existing.status,
                    reused: true,
                });
            }
            if (existing.status === "draft_synced" || existing.status === "published") {
                return reply.code(202).send({
                    publication_id: existing.id,
                    project_id: project.id,
                    version_id: latestVersion.id,
                    status: existing.status,
                    reused: true,
                });
            }
            const retried = await (0, repository_1.resetPublicationJobForRetry)(existing.id, {
                action,
                targetStatus,
                requestedBy: context.userId ? "studio_user" : "studio",
            }, context.userId);
            await (0, repository_1.updateProjectStatus)(context.tenantId, project.id, "publish_queued");
            await (0, orchestration_1.queuePublication)(retried.id);
            return reply.code(202).send({
                publication_id: retried.id,
                project_id: project.id,
                version_id: latestVersion.id,
                status: "queued",
                retried: true,
            });
        }
        const publication = await (0, repository_1.createPublicationJob)(context.tenantId, project.site.id, project.id, latestVersion.id, action, {
            action,
            targetStatus,
            requestedBy: context.userId ? "studio_user" : "studio",
        }, context.userId, idempotencyKey);
        await (0, repository_1.updateProjectStatus)(context.tenantId, project.id, "publish_queued");
        await (0, orchestration_1.queuePublication)(publication.id);
        if (action === "publish" || action === "update") {
            await (0, publication_1.linkDurableWebsitePublication)(context.tenantId, project.site.id, project.id, latestVersion.id, publication.id);
        }
        return reply.code(202).send({
            publication_id: publication.id,
            project_id: project.id,
            version_id: latestVersion.id,
            status: "queued",
        });
    });
    fastify.delete("/v2/projects/:id", async (request, reply) => {
        const context = await (0, http_utils_1.requireStudioPermission)(request, reply, "projects.manage");
        if (!context) {
            return;
        }
        const projectId = request.params.id;
        if (!(0, http_utils_1.isUuid)(projectId)) {
            return (0, http_utils_1.badRequest)(reply, "invalid project id");
        }
        const body = (0, http_utils_1.parseBody)(request);
        const mode = body.mode ?? "archive";
        try {
            const result = await (0, projects_1.archiveProject)(context.tenantId, projectId, {
                reason: (0, http_utils_1.parseOptionalString)(body.reason),
                mode,
                actorUserId: context.userId,
            });
            return reply.send(result);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (message === "project_not_found") {
                return (0, http_utils_1.notFound)(reply, message);
            }
            if (message === "project_has_scheduled_publications") {
                return (0, http_utils_1.conflict)(reply, message);
            }
            return (0, http_utils_1.badRequest)(reply, message);
        }
    });
    fastify.post("/v2/projects/:id/restore", async (request, reply) => {
        const context = await (0, http_utils_1.requireStudioPermission)(request, reply, "projects.manage");
        if (!context) {
            return;
        }
        const projectId = request.params.id;
        if (!(0, http_utils_1.isUuid)(projectId)) {
            return (0, http_utils_1.badRequest)(reply, "invalid project id");
        }
        const project = await (0, repository_1.getProjectById)(context.tenantId, projectId);
        if (!project) {
            return (0, http_utils_1.notFound)(reply, "project not found");
        }
        if (!project.deletedAt) {
            return (0, http_utils_1.conflict)(reply, "project is not archived");
        }
        await prisma.contentProject.update({
            where: { id: project.id },
            data: {
                deletedAt: null,
                deletedBy: null,
                deletedByStudioUserId: null,
                deletionReason: null,
            },
        });
        return reply.send({ ok: true });
    });
    fastify.post("/v2/content-images/:id/retry", async (request, reply) => {
        const context = await (0, http_utils_1.requireStudioPermission)(request, reply, "projects.manage");
        if (!context) {
            return;
        }
        const imageId = request.params.id;
        if (!(0, http_utils_1.isUuid)(imageId)) {
            return (0, http_utils_1.badRequest)(reply, "invalid image id");
        }
        try {
            const jobId = await (0, orchestration_1.retryImageGeneration)(context.tenantId, imageId);
            return reply.code(202).send({
                job_id: jobId,
                content_image_id: imageId,
                status: "queued",
            });
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return (0, http_utils_1.badRequest)(reply, message);
        }
    });
    fastify.post("/v2/assets/generate", async (request, reply) => {
        const context = await (0, http_utils_1.requireStudioPermission)(request, reply, "projects.manage");
        if (!context) {
            return;
        }
        const body = (0, http_utils_1.parseBody)(request);
        const projectId = body.projectId?.trim();
        if (!projectId) {
            return (0, http_utils_1.badRequest)(reply, "projectId is required");
        }
        if (!(0, http_utils_1.isUuid)(projectId)) {
            return (0, http_utils_1.badRequest)(reply, "invalid project id");
        }
        const version = body.versionId?.trim()
            ? (await (0, repository_1.getProjectById)(context.tenantId, projectId))?.versions.find((item) => item.id === body.versionId)
            : await (0, repository_1.getLatestVersion)(projectId, context.tenantId);
        if (!version) {
            return (0, http_utils_1.notFound)(reply, "version not found");
        }
        const contentImageId = await (0, orchestration_1.requestImageGenerationForVersion)(context.tenantId, version.id, body.promptPresetVersionId?.trim() || null);
        return reply.code(202).send({
            version_id: version.id,
            content_image_id: contentImageId,
            status: "queued",
        });
    });
    fastify.get("/v2/media", async (request, reply) => {
        const context = await (0, http_utils_1.requireStudioContext)(request, reply);
        if (!context) {
            return;
        }
        const query = request.query;
        const page = (0, http_utils_1.parsePage)(query.page, 1);
        const pageSize = (0, http_utils_1.parsePageSize)(query.pageSize, 24);
        if (query.status && !(0, http_utils_1.isOneOf)(query.status, CONTENT_STATUSES)) {
            return (0, http_utils_1.badRequest)(reply, `status must be one of: ${CONTENT_STATUSES.join(", ")}`);
        }
        const media = await (0, repository_1.listMediaImages)(context.tenantId, {
            siteId: query.siteId?.trim() || undefined,
            status: query.status?.trim() || undefined,
            page,
            pageSize,
        });
        return reply.send({
            ...media,
            items: await Promise.all(media.items.map(async (item) => ({
                ...item,
                assetUrl: await (0, orchestration_1.buildAssetPublicUrl)(item.storagePath),
                variants: await Promise.all(item.variants.map(async (variant) => ({
                    ...variant,
                    publicUrl: await (0, orchestration_1.buildAssetPublicUrl)(variant.storagePath),
                }))),
            }))),
        });
    });
    fastify.patch("/v2/versions/:id", async (request, reply) => {
        const context = await (0, http_utils_1.requireStudioPermission)(request, reply, "projects.manage");
        if (!context) {
            return;
        }
        const versionId = request.params.id;
        if (!(0, http_utils_1.isUuid)(versionId)) {
            return (0, http_utils_1.badRequest)(reply, "invalid version id");
        }
        const body = (0, http_utils_1.parseBody)(request);
        try {
            const version = await (0, repository_1.updateVersionContent)(context.tenantId, versionId, {
                title: body.title,
                excerpt: body.excerpt,
                bodyHtml: body.bodyHtml,
                seoTitle: body.seoTitle,
                seoDescription: body.seoDescription,
            });
            if (!version) {
                return (0, http_utils_1.notFound)(reply, "version not found");
            }
            const project = await (0, repository_1.getProjectById)(context.tenantId, version.projectId);
            const latestVersion = project?.versions[0] ?? null;
            let qaReport = null;
            if (latestVersion && latestVersion.id === version.id) {
                qaReport = (0, qa_1.runVersionQa)({
                    title: version.title,
                    excerpt: version.excerpt,
                    bodyHtml: version.bodyHtml,
                    seoTitle: version.seoTitle,
                    seoDescription: version.seoDescription,
                }, (0, review_1.isHeroImageReady)(latestVersion.contentImage));
                await (0, repository_1.updateVersionQa)(version.id, qaReport.passed ? "qa_passed" : "qa_failed", qaReport);
                await (0, repository_1.updateProjectStatus)(context.tenantId, version.projectId, qaReport.passed ? "in_review" : "qa_failed");
            }
            return reply.send({
                id: version.id,
                status: version.status,
                qaReport,
            });
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return (0, http_utils_1.badRequest)(reply, message);
        }
    });
    fastify.get("/v2/publication-jobs", async (request, reply) => {
        const context = await (0, http_utils_1.requireStudioContext)(request, reply);
        if (!context) {
            return;
        }
        const query = request.query;
        const page = (0, http_utils_1.parsePage)(query.page, 1);
        const pageSize = (0, http_utils_1.parsePageSize)(query.pageSize, 20);
        if (query.status && !(0, http_utils_1.isOneOf)(query.status, PUBLICATION_STATUSES)) {
            return (0, http_utils_1.badRequest)(reply, `status must be one of: ${PUBLICATION_STATUSES.join(", ")}`);
        }
        const publications = await (0, repository_1.listPublicationJobs)(context.tenantId, page, pageSize, query.status);
        const items = await Promise.all(publications.items.map(async (publication) => ({
            id: publication.id,
            status: publication.status,
            action: publication.action,
            targetStatus: parsePublicationTargetStatus(publication.requestPayload && typeof publication.requestPayload === "object"
                ? publication.requestPayload.targetStatus
                : null),
            externalId: publication.externalId,
            externalUrl: publication.externalUrl,
            error: publication.error,
            createdAt: publication.createdAt,
            updatedAt: publication.updatedAt,
            publishedAt: publication.publishedAt,
            site: {
                id: publication.site.id,
                key: publication.site.key,
                name: publication.site.name,
                type: publication.site.type,
            },
            project: {
                id: publication.project.id,
                title: publication.project.title,
                status: publication.project.status,
            },
            version: {
                id: publication.version.id,
                versionNumber: publication.version.versionNumber,
                status: publication.version.status,
            },
            assetUrl: await (0, orchestration_1.buildAssetPublicUrl)(publication.version.contentImage?.storagePath),
        })));
        return reply.send({
            ...publications,
            items,
        });
    });
    fastify.get("/v2/publication-jobs/:id", async (request, reply) => {
        const context = await (0, http_utils_1.requireStudioContext)(request, reply);
        if (!context) {
            return;
        }
        const publicationId = request.params.id;
        if (!(0, http_utils_1.isUuid)(publicationId)) {
            return (0, http_utils_1.badRequest)(reply, "invalid publication id");
        }
        const publication = await (0, repository_1.getPublicationJobById)(context.tenantId, publicationId);
        if (!publication) {
            return (0, http_utils_1.notFound)(reply, "publication not found");
        }
        return reply.send({
            ...publication,
            assetUrl: await (0, orchestration_1.buildAssetPublicUrl)(publication.version.contentImage?.storagePath),
        });
    });
    fastify.get("/v2/workspace/identity-provider", async (request, reply) => {
        const context = await (0, http_utils_1.requireStudioContext)(request, reply);
        if (!context) {
            return;
        }
        return reply.send(await (0, auth_1.getStudioIdentityProviderConfig)(context.tenantId));
    });
    fastify.patch("/v2/workspace/identity-provider", async (request, reply) => {
        const context = await (0, http_utils_1.requireStudioPermission)(request, reply, "workspace.manage");
        if (!context) {
            return;
        }
        const body = (0, http_utils_1.parseBody)(request);
        if (body.provisioningMode && !(0, http_utils_1.isOneOf)(body.provisioningMode, STUDIO_PROVISIONING_MODES)) {
            return (0, http_utils_1.badRequest)(reply, `provisioningMode must be one of: ${STUDIO_PROVISIONING_MODES.join(", ")}`);
        }
        try {
            const claimMappings = (0, http_utils_1.parseJsonObjectField)(body.claimMappings, "claimMappings");
            const provider = await (0, auth_1.upsertStudioIdentityProvider)(context.tenantId, {
                enabled: body.enabled,
                issuer: body.issuer?.trim(),
                clientId: body.clientId?.trim(),
                clientSecret: body.clientSecret === undefined ? undefined : (0, http_utils_1.parseOptionalString)(body.clientSecret),
                scopes: body.scopes?.trim(),
                claimMappings: claimMappings ?? undefined,
                provisioningMode: body.provisioningMode,
            });
            return reply.send(provider);
        }
        catch (error) {
            return (0, http_utils_1.badRequest)(reply, error instanceof Error ? error.message : String(error));
        }
    });
    fastify.post("/v2/workspace/identity-provider/test", async (request, reply) => {
        const context = await (0, http_utils_1.requireStudioPermission)(request, reply, "workspace.manage");
        if (!context) {
            return;
        }
        const body = (0, http_utils_1.parseBody)(request);
        const candidate = {
            ...(await (0, auth_1.getStudioIdentityProviderConfig)(context.tenantId)),
            issuer: body.issuer?.trim() || undefined,
            clientId: body.clientId?.trim() || undefined,
            scopes: body.scopes?.trim() || undefined,
        };
        if (!candidate.issuer) {
            return (0, http_utils_1.badRequest)(reply, "issuer is required");
        }
        try {
            const wellKnownUrl = new URL("/.well-known/openid-configuration", candidate.issuer.endsWith("/") ? candidate.issuer : `${candidate.issuer}/`);
            const response = await fetch(wellKnownUrl, {
                headers: {
                    accept: "application/json",
                },
            });
            if (!response.ok) {
                return reply.code(502).send({
                    ok: false,
                    message: `OIDC discovery failed with status ${response.status}`,
                });
            }
            const payload = (await response.json());
            return reply.send({
                ok: true,
                issuer: payload["issuer"] ?? candidate.issuer,
                authorizationEndpoint: payload["authorization_endpoint"] ?? null,
                tokenEndpoint: payload["token_endpoint"] ?? null,
                scopesSupported: payload["scopes_supported"] ?? null,
            });
        }
        catch (error) {
            return reply.code(502).send({
                ok: false,
                message: error instanceof Error ? error.message : String(error),
            });
        }
    });
    fastify.get("/v2/users", async (request, reply) => {
        const context = await (0, http_utils_1.requireStudioPermission)(request, reply, "users.manage");
        if (!context) {
            return;
        }
        return reply.send(await (0, auth_1.listStudioUsers)(context.tenantId));
    });
    fastify.post("/v2/users/invitations", async (request, reply) => {
        const context = await (0, http_utils_1.requireStudioPermission)(request, reply, "users.manage");
        if (!context) {
            return;
        }
        const body = (0, http_utils_1.parseBody)(request);
        if (!body.email?.trim()) {
            return (0, http_utils_1.badRequest)(reply, "email is required");
        }
        try {
            const invitation = await (0, auth_1.inviteStudioUser)(context.tenantId, context.userId, {
                email: body.email.trim(),
                displayName: (0, http_utils_1.parseOptionalString)(body.displayName) ?? undefined,
                roleKeys: Array.isArray(body.roleKeys)
                    ? body.roleKeys.map((item) => String(item).trim()).filter(Boolean)
                    : undefined,
            });
            return reply.code(201).send(invitation);
        }
        catch (error) {
            return (0, http_utils_1.badRequest)(reply, error instanceof Error ? error.message : String(error));
        }
    });
    fastify.patch("/v2/users/:id", async (request, reply) => {
        const context = await (0, http_utils_1.requireStudioPermission)(request, reply, "users.manage");
        if (!context) {
            return;
        }
        const userId = request.params.id;
        if (!(0, http_utils_1.isUuid)(userId)) {
            return (0, http_utils_1.badRequest)(reply, "invalid user id");
        }
        const body = (0, http_utils_1.parseBody)(request);
        if (body.status && !(0, http_utils_1.isOneOf)(body.status, STUDIO_USER_STATUSES)) {
            return (0, http_utils_1.badRequest)(reply, `status must be one of: ${STUDIO_USER_STATUSES.join(", ")}`);
        }
        try {
            const user = await (0, auth_1.updateStudioUser)(context.tenantId, userId, {
                displayName: body.displayName?.trim(),
                status: body.status,
            });
            if (!user) {
                return (0, http_utils_1.notFound)(reply, "user not found");
            }
            return reply.send(user);
        }
        catch (error) {
            return (0, http_utils_1.badRequest)(reply, error instanceof Error ? error.message : String(error));
        }
    });
    fastify.post("/v2/users/:id/roles", async (request, reply) => {
        const context = await (0, http_utils_1.requireStudioPermission)(request, reply, "users.manage");
        if (!context) {
            return;
        }
        const userId = request.params.id;
        if (!(0, http_utils_1.isUuid)(userId)) {
            return (0, http_utils_1.badRequest)(reply, "invalid user id");
        }
        const body = (0, http_utils_1.parseBody)(request);
        const roleId = body.roleId?.trim();
        if (!roleId || !(0, http_utils_1.isUuid)(roleId)) {
            return (0, http_utils_1.badRequest)(reply, "roleId is required");
        }
        try {
            await (0, auth_1.assignStudioRoleToUser)(context.tenantId, userId, roleId);
            return reply.code(204).send();
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (message === "user_or_role_not_found") {
                return (0, http_utils_1.notFound)(reply, "user or role not found");
            }
            return (0, http_utils_1.badRequest)(reply, message);
        }
    });
    fastify.delete("/v2/users/:id/roles/:roleId", async (request, reply) => {
        const context = await (0, http_utils_1.requireStudioPermission)(request, reply, "users.manage");
        if (!context) {
            return;
        }
        const { id: userId, roleId } = request.params;
        if (!(0, http_utils_1.isUuid)(userId) || !(0, http_utils_1.isUuid)(roleId)) {
            return (0, http_utils_1.badRequest)(reply, "invalid user or role id");
        }
        try {
            await (0, auth_1.removeStudioRoleFromUser)(context.tenantId, userId, roleId);
            return reply.code(204).send();
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (message === "user_or_role_not_found") {
                return (0, http_utils_1.notFound)(reply, "user or role not found");
            }
            return (0, http_utils_1.badRequest)(reply, message);
        }
    });
    fastify.get("/v2/roles", async (request, reply) => {
        const context = await (0, http_utils_1.requireStudioContext)(request, reply);
        if (!context) {
            return;
        }
        if (!(0, security_1.hasStudioPermission)(context.permissions, "roles.manage") &&
            !(0, security_1.hasStudioPermission)(context.permissions, "users.manage")) {
            return reply.code(403).send({ error: "forbidden", message: "Missing permission: roles.manage" });
        }
        return reply.send(await (0, auth_1.listStudioRoles)(context.tenantId));
    });
    fastify.post("/v2/roles", async (request, reply) => {
        const context = await (0, http_utils_1.requireStudioPermission)(request, reply, "roles.manage");
        if (!context) {
            return;
        }
        const body = (0, http_utils_1.parseBody)(request);
        if (!body.name?.trim()) {
            return (0, http_utils_1.badRequest)(reply, "name is required");
        }
        try {
            const role = await (0, auth_1.createStudioRole)(context.tenantId, {
                key: (0, http_utils_1.parseOptionalString)(body.key) ?? undefined,
                name: body.name.trim(),
                description: (0, http_utils_1.parseOptionalString)(body.description) ?? undefined,
                permissions: (0, http_utils_1.parsePermissionList)(body.permissions),
                cloneFromRoleId: (0, http_utils_1.parseOptionalString)(body.cloneFromRoleId),
            });
            return reply.code(201).send(role);
        }
        catch (error) {
            return (0, http_utils_1.badRequest)(reply, error instanceof Error ? error.message : String(error));
        }
    });
    fastify.patch("/v2/roles/:id", async (request, reply) => {
        const context = await (0, http_utils_1.requireStudioPermission)(request, reply, "roles.manage");
        if (!context) {
            return;
        }
        const roleId = request.params.id;
        if (!(0, http_utils_1.isUuid)(roleId)) {
            return (0, http_utils_1.badRequest)(reply, "invalid role id");
        }
        const body = (0, http_utils_1.parseBody)(request);
        try {
            const role = await (0, auth_1.updateStudioRole)(context.tenantId, roleId, {
                name: body.name?.trim(),
                description: (0, http_utils_1.parseOptionalString)(body.description),
                permissions: body.permissions === undefined ? undefined : (0, http_utils_1.parsePermissionList)(body.permissions),
            });
            if (!role) {
                return (0, http_utils_1.notFound)(reply, "role not found");
            }
            return reply.send(role);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (message === "system_role_locked") {
                return reply.code(409).send({ error: "conflict", message });
            }
            return (0, http_utils_1.badRequest)(reply, message);
        }
    });
    fastify.get("/v2/prompts", async (request, reply) => {
        const context = await (0, http_utils_1.requireStudioPermission)(request, reply, "prompts.manage");
        if (!context) {
            return;
        }
        return reply.send(await (0, prompts_1.listStudioPromptPresets)(prisma, context.tenantId));
    });
    fastify.post("/v2/prompts", async (request, reply) => {
        const context = await (0, http_utils_1.requireStudioPermission)(request, reply, "prompts.manage");
        if (!context) {
            return;
        }
        const body = (0, http_utils_1.parseBody)(request);
        if (!body.name?.trim() || !body.userTemplate?.trim()) {
            return (0, http_utils_1.badRequest)(reply, "name and userTemplate are required");
        }
        if (!body.surface || !(0, http_utils_1.isOneOf)(body.surface, STUDIO_PROMPT_SURFACES)) {
            return (0, http_utils_1.badRequest)(reply, `surface must be one of: ${STUDIO_PROMPT_SURFACES.join(", ")}`);
        }
        if (body.scope && !(0, http_utils_1.isOneOf)(body.scope, STUDIO_PROMPT_SCOPES)) {
            return (0, http_utils_1.badRequest)(reply, `scope must be one of: ${STUDIO_PROMPT_SCOPES.join(", ")}`);
        }
        try {
            const preset = await (0, prompts_1.createStudioPromptPreset)(prisma, context.tenantId, context.userId, {
                key: (0, http_utils_1.parseOptionalString)(body.key) ?? undefined,
                name: body.name.trim(),
                surface: body.surface,
                scope: body.scope,
                siteId: (0, http_utils_1.parseOptionalString)(body.siteId),
                description: (0, http_utils_1.parseOptionalString)(body.description),
                systemTemplate: body.systemTemplate === undefined ? undefined : (0, http_utils_1.parseOptionalString)(body.systemTemplate),
                userTemplate: body.userTemplate,
                variablesJson: (0, http_utils_1.parseJsonObjectField)(body.variablesJson, "variablesJson") ?? undefined,
                notes: (0, http_utils_1.parseOptionalString)(body.notes),
            });
            return reply.code(201).send(preset);
        }
        catch (error) {
            return (0, http_utils_1.badRequest)(reply, error instanceof Error ? error.message : String(error));
        }
    });
    fastify.get("/v2/prompts/:id", async (request, reply) => {
        const context = await (0, http_utils_1.requireStudioPermission)(request, reply, "prompts.manage");
        if (!context) {
            return;
        }
        const presetId = request.params.id;
        if (!(0, http_utils_1.isUuid)(presetId)) {
            return (0, http_utils_1.badRequest)(reply, "invalid prompt id");
        }
        const projectId = (0, http_utils_1.parseOptionalString)(request.query.projectId);
        if (projectId && !(0, http_utils_1.isUuid)(projectId)) {
            return (0, http_utils_1.badRequest)(reply, "invalid project id");
        }
        const preset = await (0, prompts_1.getStudioPromptPresetDetail)(prisma, context.tenantId, presetId, projectId);
        if (!preset) {
            return (0, http_utils_1.notFound)(reply, "prompt not found");
        }
        return reply.send(preset);
    });
    fastify.post("/v2/prompts/:id/versions", async (request, reply) => {
        const context = await (0, http_utils_1.requireStudioPermission)(request, reply, "prompts.manage");
        if (!context) {
            return;
        }
        const presetId = request.params.id;
        if (!(0, http_utils_1.isUuid)(presetId)) {
            return (0, http_utils_1.badRequest)(reply, "invalid prompt id");
        }
        const body = (0, http_utils_1.parseBody)(request);
        if (!body.userTemplate?.trim()) {
            return (0, http_utils_1.badRequest)(reply, "userTemplate is required");
        }
        const version = await (0, prompts_1.createStudioPromptVersion)(prisma, context.tenantId, presetId, context.userId, {
            systemTemplate: body.systemTemplate === undefined ? undefined : (0, http_utils_1.parseOptionalString)(body.systemTemplate),
            userTemplate: body.userTemplate,
            variablesJson: (0, http_utils_1.parseJsonObjectField)(body.variablesJson, "variablesJson") ?? undefined,
            notes: (0, http_utils_1.parseOptionalString)(body.notes),
        });
        if (!version) {
            return (0, http_utils_1.notFound)(reply, "prompt not found");
        }
        return reply.code(201).send(version);
    });
    fastify.patch("/v2/prompts/:id/versions/:versionId", async (request, reply) => {
        const context = await (0, http_utils_1.requireStudioPermission)(request, reply, "prompts.manage");
        if (!context) {
            return;
        }
        const { id: presetId, versionId } = request.params;
        if (!(0, http_utils_1.isUuid)(presetId) || !(0, http_utils_1.isUuid)(versionId)) {
            return (0, http_utils_1.badRequest)(reply, "invalid prompt or version id");
        }
        const body = (0, http_utils_1.parseBody)(request);
        if (body.status && !(0, http_utils_1.isOneOf)(body.status, STUDIO_PROMPT_VERSION_STATUSES)) {
            return (0, http_utils_1.badRequest)(reply, `status must be one of: ${STUDIO_PROMPT_VERSION_STATUSES.join(", ")}`);
        }
        const version = await (0, prompts_1.updateStudioPromptVersion)(prisma, context.tenantId, presetId, versionId, context.userId, {
            status: body.status,
            systemTemplate: body.systemTemplate === undefined ? undefined : (0, http_utils_1.parseOptionalString)(body.systemTemplate),
            userTemplate: body.userTemplate,
            variablesJson: (0, http_utils_1.parseJsonObjectField)(body.variablesJson, "variablesJson") ?? undefined,
            notes: body.notes === undefined ? undefined : (0, http_utils_1.parseOptionalString)(body.notes),
        });
        if (!version) {
            return (0, http_utils_1.notFound)(reply, "prompt version not found");
        }
        return reply.send(version);
    });
    fastify.post("/v2/prompts/:id/versions/:versionId/approve", async (request, reply) => {
        const context = await (0, http_utils_1.requireStudioPermission)(request, reply, "prompts.manage");
        if (!context) {
            return;
        }
        const { id: presetId, versionId } = request.params;
        if (!(0, http_utils_1.isUuid)(presetId) || !(0, http_utils_1.isUuid)(versionId)) {
            return (0, http_utils_1.badRequest)(reply, "invalid prompt or version id");
        }
        const version = await (0, prompts_1.approveStudioPromptVersion)(prisma, context.tenantId, presetId, versionId, context.userId);
        if (!version) {
            return (0, http_utils_1.notFound)(reply, "prompt version not found");
        }
        return reply.send(version);
    });
    fastify.post("/v2/prompts/:id/assignments", async (request, reply) => {
        const context = await (0, http_utils_1.requireStudioPermission)(request, reply, "prompts.manage");
        if (!context) {
            return;
        }
        const presetId = request.params.id;
        if (!(0, http_utils_1.isUuid)(presetId)) {
            return (0, http_utils_1.badRequest)(reply, "invalid prompt id");
        }
        const body = (0, http_utils_1.parseBody)(request);
        const versionId = body.versionId?.trim();
        if (!versionId || !(0, http_utils_1.isUuid)(versionId)) {
            return (0, http_utils_1.badRequest)(reply, "versionId is required");
        }
        if (body.siteId && !(0, http_utils_1.isUuid)(body.siteId)) {
            return (0, http_utils_1.badRequest)(reply, "invalid site id");
        }
        const assignment = await (0, prompts_1.assignStudioPromptVersion)(prisma, context.tenantId, presetId, context.userId, {
            versionId,
            siteId: (0, http_utils_1.parseOptionalString)(body.siteId),
        });
        if (!assignment) {
            return (0, http_utils_1.notFound)(reply, "approved prompt version not found");
        }
        return reply.send(assignment);
    });
}
