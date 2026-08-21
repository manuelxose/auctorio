"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerStudioRoutes = registerStudioRoutes;
const node_fs_1 = require("node:fs");
const node_path_1 = __importDefault(require("node:path"));
const node_crypto_1 = __importDefault(require("node:crypto"));
const ioredis_1 = __importDefault(require("ioredis"));
const prisma_1 = require("../infrastructure/db/prisma");
const repositories_1 = require("../infrastructure/db/repositories");
const redis_1 = require("../infrastructure/queue/redis");
const hash_1 = require("../shared/utils/hash");
const env_1 = require("../shared/utils/env");
const mime_1 = require("../shared/utils/mime");
const repository_1 = require("./repository");
const auth_1 = require("./auth");
const orchestration_1 = require("./orchestration");
const qa_1 = require("./qa");
const google_1 = require("./google");
const prompts_1 = require("./prompts");
const review_1 = require("./review");
const security_1 = require("./security");
const SITE_TYPES = ["guiatv", "tecnoria", "talkaris", "webhook"];
const PROJECT_GOALS = [
    "article",
    "landing",
    "comparison",
    "faq",
    "newsletter",
    "social_pack",
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
const INTERNAL_SECRET_HEADER = "x-studio-internal-secret";
const STUDIO_TENANT_HEADER = "x-studio-tenant-id";
const STUDIO_USER_HEADER = "x-studio-user-id";
const STUDIO_SESSION_HEADER = "x-studio-session-id";
const STUDIO_PERMISSIONS_HEADER = "x-studio-permissions";
const STUDIO_SIGNATURE_HEADER = "x-studio-signature";
const STUDIO_TIMESTAMP_HEADER = "x-studio-timestamp";
function errorBody(reply, code, message) {
    return {
        error: {
            code,
            message,
            requestId: reply.request.id ?? null,
        },
    };
}
function badRequest(reply, message) {
    return reply.code(400).send(errorBody(reply, "bad_request", message));
}
function notFound(reply, message) {
    return reply.code(404).send(errorBody(reply, "not_found", message));
}
function authErrorReply(reply, status, message) {
    return reply.code(status).send(errorBody(reply, "auth_error", message));
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
function parseBody(request) {
    return (request.body ?? {});
}
function isUuid(value) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
async function requireTenant(request, reply) {
    if (request.tenantId) {
        return request.tenantId;
    }
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        reply.code(401).send({ error: "unauthorized", message: "Missing API key" });
        return null;
    }
    const token = authHeader.slice("Bearer ".length).trim();
    if (!token) {
        reply.code(401).send({ error: "unauthorized", message: "Invalid API key" });
        return null;
    }
    const tenant = await repositories_1.tenantRepository.findByApiKeyHash((0, hash_1.sha256)(token));
    if (!tenant || tenant.status !== "active") {
        reply.code(401).send({ error: "unauthorized", message: "Invalid API key" });
        return null;
    }
    request.tenantId = tenant.id;
    return tenant.id;
}
function readSingleHeader(request, name) {
    const value = request.headers[name];
    if (Array.isArray(value)) {
        return value[0] ?? null;
    }
    return typeof value === "string" ? value : null;
}
function getInternalSharedSecret() {
    return (0, env_1.getEnv)("STUDIO_PROXY_SHARED_SECRET", "studio-proxy-dev-secret-change-me");
}
function requireInternalSecret(request, reply) {
    const secret = readSingleHeader(request, INTERNAL_SECRET_HEADER);
    if (!secret || secret !== getInternalSharedSecret()) {
        reply.code(401).send({ error: "unauthorized", message: "Invalid studio internal secret" });
        return false;
    }
    return true;
}
function readSignedStudioContext(request) {
    const tenantId = readSingleHeader(request, STUDIO_TENANT_HEADER)?.trim() || "";
    const userId = readSingleHeader(request, STUDIO_USER_HEADER)?.trim() || "";
    const sessionId = readSingleHeader(request, STUDIO_SESSION_HEADER)?.trim() || "";
    const permissionsValue = readSingleHeader(request, STUDIO_PERMISSIONS_HEADER)?.trim() || "";
    const timestamp = readSingleHeader(request, STUDIO_TIMESTAMP_HEADER)?.trim() || "";
    const signature = readSingleHeader(request, STUDIO_SIGNATURE_HEADER)?.trim() || "";
    if (!tenantId || !userId || !sessionId || !timestamp || !signature) {
        return null;
    }
    if (!(0, security_1.isStudioProxySignatureFresh)(timestamp)) {
        return null;
    }
    const permissions = permissionsValue
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
    const expected = (0, security_1.buildStudioProxySignature)({
        tenantId,
        userId,
        sessionId,
        permissions,
        timestamp,
        method: request.method,
        url: request.url,
    });
    const providedBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expected);
    if (providedBuffer.length !== expectedBuffer.length) {
        return null;
    }
    if (!node_crypto_1.default.timingSafeEqual(providedBuffer, expectedBuffer)) {
        return null;
    }
    request.tenantId = tenantId;
    request.studioUserId = userId;
    request.studioSessionId = sessionId;
    request.studioPermissions = permissions;
    request.studioAuthMode = "oidc";
    return {
        tenantId,
        userId,
        sessionId,
        permissions,
        authMode: "oidc",
    };
}
async function requireStudioContext(request, reply) {
    const signed = readSignedStudioContext(request);
    if (signed) {
        return signed;
    }
    const tenantId = await requireTenant(request, reply);
    if (!tenantId) {
        return null;
    }
    request.studioAuthMode = "api_key";
    request.studioPermissions = [...security_1.STUDIO_PERMISSIONS];
    return {
        tenantId,
        userId: null,
        sessionId: null,
        permissions: [...security_1.STUDIO_PERMISSIONS],
        authMode: "api_key",
    };
}
async function requireStudioPermission(request, reply, permission) {
    const context = await requireStudioContext(request, reply);
    if (!context) {
        return null;
    }
    if (!(0, security_1.hasStudioPermission)(context.permissions, permission)) {
        reply.code(403).send({ error: "forbidden", message: `Missing permission: ${permission}` });
        return null;
    }
    return context;
}
function parsePage(value, fallback = 1) {
    const parsed = Number.parseInt(String(value ?? fallback), 10);
    if (Number.isNaN(parsed) || parsed < 1) {
        return fallback;
    }
    return parsed;
}
function parsePageSize(value, fallback = 20, max = 100) {
    const parsed = Number.parseInt(String(value ?? fallback), 10);
    if (Number.isNaN(parsed) || parsed < 1) {
        return fallback;
    }
    return Math.min(parsed, max);
}
function parseJsonObjectField(value, fieldName) {
    if (value === undefined) {
        return undefined;
    }
    if (value === null || value === "") {
        return null;
    }
    if (typeof value === "string") {
        try {
            const parsed = JSON.parse(value);
            if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
                return parsed;
            }
        }
        catch (error) {
            throw new Error(`${fieldName} must be valid JSON (${String(error)})`);
        }
        throw new Error(`${fieldName} must be a JSON object`);
    }
    if (typeof value === "object" && !Array.isArray(value)) {
        return value;
    }
    throw new Error(`${fieldName} must be a JSON object`);
}
function isOneOf(value, allowed) {
    return allowed.includes(value);
}
function parseOptionalString(value) {
    if (value === undefined) {
        return undefined;
    }
    if (value === null) {
        return null;
    }
    const normalized = String(value).trim();
    return normalized || null;
}
function parsePermissionList(value) {
    if (!Array.isArray(value)) {
        return [];
    }
    const permissions = value
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter(Boolean);
    if (!permissions.every((permission) => (0, security_1.hasStudioPermission)(security_1.STUDIO_PERMISSIONS, permission))) {
        throw new Error(`permissions must be one of: ${security_1.STUDIO_PERMISSIONS.join(", ")}`);
    }
    return Array.from(new Set(permissions));
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
        return notFound(reply, "asset not found");
    }
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
function mapPublicationState(publication) {
    const requestPayload = publication.requestPayload && typeof publication.requestPayload === "object"
        ? publication.requestPayload
        : null;
    return {
        id: publication.id,
        status: publication.status,
        action: publication.action,
        targetStatus: parsePublicationTargetStatus(requestPayload?.targetStatus),
        externalId: publication.externalId,
        externalUrl: publication.externalUrl,
        error: publication.error,
        createdAt: publication.createdAt,
        updatedAt: publication.updatedAt,
        publishedAt: publication.publishedAt,
    };
}
function readPromptFields(version) {
    const promptPresetVersion = version.contentText?.promptPresetVersion ?? version.contentImage?.promptPresetVersion ?? null;
    return {
        promptPresetVersionId: promptPresetVersion?.id ?? null,
        promptVersionLabel: promptPresetVersion
            ? `v${promptPresetVersion.versionNumber}`
            : version.contentText?.promptVersion ?? null,
        promptPresetName: promptPresetVersion?.preset.name ?? null,
        promptPresetKey: promptPresetVersion?.preset.key ?? null,
    };
}
async function toVersionSummary(version) {
    return {
        id: version.id,
        versionNumber: version.versionNumber,
        status: version.status,
        title: version.title,
        excerpt: version.excerpt,
        seoTitle: version.seoTitle,
        seoDescription: version.seoDescription,
        feedback: version.feedback,
        createdAt: version.createdAt,
        updatedAt: version.updatedAt,
        approvedAt: version.approvedAt,
        approvedBy: version.approvedBy,
        publishedAt: version.publishedAt,
        qaState: mapQaState(version.status),
        hasAsset: (0, review_1.isHeroImageReady)(version.contentImage),
        assetUrl: await (0, orchestration_1.buildAssetPublicUrl)(version.contentImage?.storagePath),
        image: version.contentImage
            ? {
                id: version.contentImage.id,
                status: version.contentImage.status,
                error: version.contentImage.error,
            }
            : null,
        ...readPromptFields(version),
        wordCount: (0, review_1.countWordsFromHtml)(version.bodyHtml),
        qaFailureCount: (0, review_1.countQaFailures)(version.qaReport),
        qaWarningCount: (0, review_1.countQaWarnings)(version.qaReport),
        derivativeCount: version.derivatives.length,
        latestPublicationJob: version.publicationJobs[0]
            ? mapPublicationState(version.publicationJobs[0])
            : null,
        qaReport: version.qaReport,
    };
}
function buildProjectReviewGate(project) {
    const latestVersionRecord = project.versions[0] ?? null;
    const latestImage = latestVersionRecord?.contentImage ?? null;
    const heroReady = (0, review_1.isHeroImageReady)(latestImage);
    return (0, review_1.buildReviewGate)({
        projectStatus: project.status,
        versionCount: project.versions.length,
        latestVersion: latestVersionRecord
            ? {
                status: latestVersionRecord.status,
                title: latestVersionRecord.title,
                excerpt: latestVersionRecord.excerpt,
                seoTitle: latestVersionRecord.seoTitle,
                seoDescription: latestVersionRecord.seoDescription,
                feedback: latestVersionRecord.feedback,
                bodyHtml: latestVersionRecord.bodyHtml,
                qaReport: latestVersionRecord.qaReport,
                hasAsset: heroReady,
            }
            : null,
    });
}
async function toProjectDetail(project) {
    const latestVersionRecord = project.versions[0] ?? null;
    const latestVersion = latestVersionRecord ? await toVersionSummary(latestVersionRecord) : null;
    const latestAssetUrl = await (0, orchestration_1.buildAssetPublicUrl)(latestVersionRecord?.contentImage?.storagePath);
    const versions = await Promise.all(project.versions.map(async (version) => ({
        ...(await toVersionSummary(version)),
        bodyHtml: version.bodyHtml,
    })));
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
        versionCount: project.versions.length,
        reviewGate: buildProjectReviewGate(project),
        metadata: project.metadata,
        site: {
            id: project.site.id,
            key: project.site.key,
            name: project.site.name,
            type: project.site.type,
            locale: project.site.locale,
            baseUrl: project.site.baseUrl,
            brandVoice: project.site.brandVoice,
            seoRules: project.site.seoRules,
            taxonomyMap: project.site.taxonomyMap,
            publishingCredentialsRef: project.site.publishingCredentialsRef,
        },
        topic: project.topic
            ? {
                id: project.topic.id,
                title: project.topic.title,
            }
            : null,
        latestVersion: latestVersionRecord && latestVersion
            ? {
                ...latestVersion,
                bodyHtml: latestVersionRecord.bodyHtml,
                derivatives: latestVersionRecord.derivatives.map((derivative) => ({
                    id: derivative.id,
                    type: derivative.type,
                    title: derivative.title,
                    body: derivative.body,
                    status: derivative.status,
                    createdAt: derivative.createdAt,
                    updatedAt: derivative.updatedAt,
                })),
                assetVariants: await Promise.all((latestVersionRecord.contentImage?.assetVariants ?? []).map(async (variant) => ({
                    id: variant.id,
                    kind: variant.kind,
                    storagePath: variant.storagePath,
                    mimeType: variant.mimeType,
                    width: variant.width,
                    height: variant.height,
                    createdAt: variant.createdAt,
                    updatedAt: variant.updatedAt,
                    publicUrl: await (0, orchestration_1.buildAssetPublicUrl)(variant.storagePath),
                }))),
            }
            : null,
        latestAssetUrl,
        versions,
        latestPublicationJob: project.publicationJobs[0]
            ? mapPublicationState(project.publicationJobs[0])
            : null,
        publicationJobs: project.publicationJobs.map((publication) => mapPublicationState(publication)),
    };
}
function registerStudioRoutes(fastify) {
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
        if (!requireInternalSecret(request, reply)) {
            return;
        }
        const slug = request.params.slug;
        const provider = await (0, auth_1.getInternalStudioIdentityProviderBySlug)(slug);
        if (!provider) {
            return notFound(reply, "identity provider not found");
        }
        return reply.send(provider);
    });
    fastify.get("/internal/workspace-access/:slug", async (request, reply) => {
        if (!requireInternalSecret(request, reply)) {
            return;
        }
        const slug = request.params.slug;
        const access = await (0, auth_1.getInternalStudioWorkspaceAccessBySlug)(slug);
        if (!access) {
            return notFound(reply, "workspace not found");
        }
        return reply.send(access);
    });
    fastify.post("/internal/login/options", async (request, reply) => {
        if (!requireInternalSecret(request, reply)) {
            return;
        }
        const body = parseBody(request);
        const email = body.email?.trim() || "";
        if (!email) {
            return badRequest(reply, "email_required");
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
        if (!requireInternalSecret(request, reply)) {
            return;
        }
        const body = parseBody(request);
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
        if (!requireInternalSecret(request, reply)) {
            return;
        }
        const body = parseBody(request);
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
        if (!requireInternalSecret(request, reply)) {
            return;
        }
        return reply.send({
            googleClientId: (0, google_1.getStudioGoogleClientId)(),
        });
    });
    fastify.post("/internal/session/global-login/password", async (request, reply) => {
        if (!requireInternalSecret(request, reply)) {
            return;
        }
        const body = parseBody(request);
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
        if (!requireInternalSecret(request, reply)) {
            return;
        }
        const body = parseBody(request);
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
        if (!requireInternalSecret(request, reply)) {
            return;
        }
        const body = parseBody(request);
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
        if (!requireInternalSecret(request, reply)) {
            return;
        }
        const body = parseBody(request);
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
        if (!requireInternalSecret(request, reply)) {
            return;
        }
        const body = parseBody(request);
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
        if (!requireInternalSecret(request, reply)) {
            return;
        }
        const body = parseBody(request);
        if (!body.workspace?.trim() || !body.email?.trim() || !body.sourceApp?.trim()) {
            return badRequest(reply, "workspace, email and sourceApp are required");
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
                return notFound(reply, message);
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
        if (!requireInternalSecret(request, reply)) {
            return;
        }
        const body = parseBody(request);
        const launchId = body.launchId?.trim();
        if (!launchId) {
            return badRequest(reply, "launchId is required");
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
        if (!requireInternalSecret(request, reply)) {
            return;
        }
        const body = parseBody(request);
        if (!body.slug?.trim() || !body.issuer?.trim() || !body.subject?.trim()) {
            return badRequest(reply, "slug, issuer and subject are required");
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
        if (!requireInternalSecret(request, reply)) {
            return;
        }
        const body = parseBody(request);
        const token = body.sessionToken?.trim();
        if (!token) {
            return badRequest(reply, "sessionToken is required");
        }
        const record = await (0, auth_1.getStudioSessionByToken)(token);
        if (!record) {
            return reply.code(401).send({ error: "unauthorized", message: "Invalid session token" });
        }
        return reply.send(record);
    });
    fastify.post("/internal/session/revoke", async (request, reply) => {
        if (!requireInternalSecret(request, reply)) {
            return;
        }
        const body = parseBody(request);
        const token = body.sessionToken?.trim();
        if (!token) {
            return badRequest(reply, "sessionToken is required");
        }
        await (0, auth_1.revokeStudioSessionByToken)(token);
        return reply.send({ ok: true });
    });
    fastify.get("/v2/session/me", async (request, reply) => {
        const context = await requireStudioContext(request, reply);
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
        const context = await requireStudioContext(request, reply);
        if (!context) {
            return;
        }
        const query = request.query;
        const page = parsePage(query.page, 1);
        const pageSize = parsePageSize(query.pageSize, 20);
        const sites = await (0, repository_1.listSites)(context.tenantId, page, pageSize);
        return reply.send(sites);
    });
    fastify.post("/v2/sites", async (request, reply) => {
        const context = await requireStudioPermission(request, reply, "integrations.manage");
        if (!context) {
            return;
        }
        const body = parseBody(request);
        if (!body.key?.trim() || !body.name?.trim() || !body.type) {
            return badRequest(reply, "key, name and type are required");
        }
        if (!isOneOf(body.type, SITE_TYPES)) {
            return badRequest(reply, `type must be one of: ${SITE_TYPES.join(", ")}`);
        }
        try {
            const site = await (0, repository_1.createSite)(context.tenantId, {
                key: body.key.trim(),
                name: body.name.trim(),
                type: body.type,
                locale: body.locale,
                baseUrl: parseOptionalString(body.baseUrl) ?? null,
                brandVoice: parseJsonObjectField(body.brandVoice, "brandVoice") ?? null,
                seoRules: parseJsonObjectField(body.seoRules, "seoRules") ?? null,
                taxonomyMap: parseJsonObjectField(body.taxonomyMap, "taxonomyMap") ?? null,
                publishingCredentialsRef: parseOptionalString(body.publishingCredentialsRef) ?? null,
            });
            return reply.code(201).send(site);
        }
        catch (error) {
            return badRequest(reply, String(error));
        }
    });
    fastify.get("/v2/sites/:id", async (request, reply) => {
        const context = await requireStudioContext(request, reply);
        if (!context) {
            return;
        }
        const siteId = request.params.id;
        if (!isUuid(siteId)) {
            return badRequest(reply, "invalid site id");
        }
        const site = await (0, repository_1.getSiteById)(context.tenantId, siteId);
        if (!site) {
            return notFound(reply, "site not found");
        }
        return reply.send(site);
    });
    fastify.put("/v2/sites/:id", async (request, reply) => {
        const context = await requireStudioPermission(request, reply, "integrations.manage");
        if (!context) {
            return;
        }
        const siteId = request.params.id;
        if (!isUuid(siteId)) {
            return badRequest(reply, "invalid site id");
        }
        const body = parseBody(request);
        if (body.type && !isOneOf(body.type, SITE_TYPES)) {
            return badRequest(reply, `type must be one of: ${SITE_TYPES.join(", ")}`);
        }
        try {
            const site = await (0, repository_1.updateSite)(context.tenantId, siteId, {
                name: body.name?.trim(),
                type: body.type,
                locale: body.locale?.trim(),
                baseUrl: parseOptionalString(body.baseUrl),
                brandVoice: parseJsonObjectField(body.brandVoice, "brandVoice"),
                seoRules: parseJsonObjectField(body.seoRules, "seoRules"),
                taxonomyMap: parseJsonObjectField(body.taxonomyMap, "taxonomyMap"),
                publishingCredentialsRef: parseOptionalString(body.publishingCredentialsRef),
            });
            if (!site) {
                return notFound(reply, "site not found");
            }
            return reply.send(site);
        }
        catch (error) {
            return badRequest(reply, String(error));
        }
    });
    fastify.get("/v2/projects", async (request, reply) => {
        const context = await requireStudioContext(request, reply);
        if (!context) {
            return;
        }
        const query = request.query;
        const page = parsePage(query.page, 1);
        const pageSize = parsePageSize(query.pageSize, 20);
        if (query.siteId && !isUuid(query.siteId)) {
            return badRequest(reply, "invalid siteId");
        }
        if (query.status && !isOneOf(query.status, PROJECT_STATUSES)) {
            return badRequest(reply, `status must be one of: ${PROJECT_STATUSES.join(", ")}`);
        }
        if (query.goal && !isOneOf(query.goal, PROJECT_GOALS)) {
            return badRequest(reply, `goal must be one of: ${PROJECT_GOALS.join(", ")}`);
        }
        const projects = await (0, repository_1.listProjects)(context.tenantId, {
            siteId: query.siteId,
            status: query.status,
            goal: query.goal,
            page,
            pageSize,
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
        const context = await requireStudioPermission(request, reply, "projects.manage");
        if (!context) {
            return;
        }
        const body = parseBody(request);
        if (!body.siteId?.trim() || !body.title?.trim() || !body.brief?.trim()) {
            return badRequest(reply, "siteId, title and brief are required");
        }
        if (body.goal && !isOneOf(body.goal, PROJECT_GOALS)) {
            return badRequest(reply, `goal must be one of: ${PROJECT_GOALS.join(", ")}`);
        }
        const site = await (0, repository_1.getSiteById)(context.tenantId, body.siteId);
        if (!site) {
            return notFound(reply, "site not found");
        }
        try {
            const project = await (0, repository_1.createProject)(context.tenantId, {
                siteId: site.id,
                title: body.title.trim(),
                brief: body.brief.trim(),
                goal: body.goal ?? "article",
                primaryLanguage: body.primaryLanguage ?? "es",
                metadata: parseJsonObjectField(body.metadata, "metadata") ?? null,
            });
            return reply.code(201).send(project);
        }
        catch (error) {
            return badRequest(reply, String(error));
        }
    });
    fastify.put("/v2/projects/:id", async (request, reply) => {
        const context = await requireStudioPermission(request, reply, "projects.manage");
        if (!context) {
            return;
        }
        const projectId = request.params.id;
        if (!isUuid(projectId)) {
            return badRequest(reply, "invalid project id");
        }
        const body = parseBody(request);
        if (body.siteId === undefined &&
            body.title === undefined &&
            body.brief === undefined &&
            body.goal === undefined &&
            body.primaryLanguage === undefined &&
            body.metadata === undefined) {
            return badRequest(reply, "at least one project field must be provided");
        }
        if (body.siteId !== undefined && !body.siteId.trim()) {
            return badRequest(reply, "siteId cannot be empty");
        }
        if (body.siteId && !isUuid(body.siteId)) {
            return badRequest(reply, "invalid siteId");
        }
        if (body.title !== undefined && !body.title.trim()) {
            return badRequest(reply, "title cannot be empty");
        }
        if (body.brief !== undefined && !body.brief.trim()) {
            return badRequest(reply, "brief cannot be empty");
        }
        if (body.primaryLanguage !== undefined && !body.primaryLanguage.trim()) {
            return badRequest(reply, "primaryLanguage cannot be empty");
        }
        if (body.goal && !isOneOf(body.goal, PROJECT_GOALS)) {
            return badRequest(reply, `goal must be one of: ${PROJECT_GOALS.join(", ")}`);
        }
        const existingProject = await (0, repository_1.getProjectById)(context.tenantId, projectId);
        if (!existingProject) {
            return notFound(reply, "project not found");
        }
        const nextSiteId = body.siteId?.trim();
        if (nextSiteId && nextSiteId !== existingProject.siteId) {
            const site = await (0, repository_1.getSiteById)(context.tenantId, nextSiteId);
            if (!site) {
                return notFound(reply, "site not found");
            }
        }
        try {
            const parsedMetadata = parseJsonObjectField(body.metadata, "metadata");
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
                return notFound(reply, "project not found");
            }
            return reply.send(await toProjectDetail(updatedProject));
        }
        catch (error) {
            return badRequest(reply, String(error));
        }
    });
    fastify.get("/v2/projects/:id", async (request, reply) => {
        const context = await requireStudioContext(request, reply);
        if (!context) {
            return;
        }
        const projectId = request.params.id;
        if (!isUuid(projectId)) {
            return badRequest(reply, "invalid project id");
        }
        const project = await (0, repository_1.getProjectById)(context.tenantId, projectId);
        if (!project) {
            return notFound(reply, "project not found");
        }
        return reply.send(await toProjectDetail(project));
    });
    fastify.post("/v2/projects/:id/generate", async (request, reply) => {
        const context = await requireStudioPermission(request, reply, "projects.manage");
        if (!context) {
            return;
        }
        const projectId = request.params.id;
        if (!isUuid(projectId)) {
            return badRequest(reply, "invalid project id");
        }
        const project = await (0, repository_1.getProjectById)(context.tenantId, projectId);
        if (!project) {
            return notFound(reply, "project not found");
        }
        const body = parseBody(request);
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
        const context = await requireStudioPermission(request, reply, "projects.manage");
        if (!context) {
            return;
        }
        const projectId = request.params.id;
        if (!isUuid(projectId)) {
            return badRequest(reply, "invalid project id");
        }
        const body = parseBody(request);
        if (!body.feedback?.trim()) {
            return badRequest(reply, "feedback is required");
        }
        const project = await (0, repository_1.getProjectById)(context.tenantId, projectId);
        if (!project) {
            return notFound(reply, "project not found");
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
        const context = await requireStudioPermission(request, reply, "review.approve");
        if (!context) {
            return;
        }
        const projectId = request.params.id;
        if (!isUuid(projectId)) {
            return badRequest(reply, "invalid project id");
        }
        const project = await (0, repository_1.getProjectById)(context.tenantId, projectId);
        if (!project) {
            return notFound(reply, "project not found");
        }
        const latestVersion = project.versions[0];
        if (!latestVersion) {
            return badRequest(reply, "project has no versions");
        }
        const reviewGate = buildProjectReviewGate(project);
        if (!reviewGate.approvalReady) {
            return badRequest(reply, reviewGate.primaryConcern || "latest version is not ready for approval");
        }
        await (0, repository_1.approveVersion)(context.tenantId, project.id, latestVersion.id, context.userId ? "studio_user" : "studio", context.userId);
        return reply.send({
            project_id: project.id,
            version_id: latestVersion.id,
            status: "approved",
        });
    });
    fastify.post("/v2/projects/:id/publish", async (request, reply) => {
        const context = await requireStudioPermission(request, reply, "publishing.manage");
        if (!context) {
            return;
        }
        const projectId = request.params.id;
        if (!isUuid(projectId)) {
            return badRequest(reply, "invalid project id");
        }
        const body = parseBody(request);
        const action = body.action ?? "publish";
        const targetStatus = body.targetStatus ?? "publish";
        if (!isOneOf(action, ["publish", "update", "unpublish"])) {
            return badRequest(reply, "action must be one of: publish, update, unpublish");
        }
        if (!isOneOf(targetStatus, ["draft", "publish"])) {
            return badRequest(reply, "targetStatus must be one of: draft, publish");
        }
        const project = await (0, repository_1.getProjectById)(context.tenantId, projectId);
        if (!project) {
            return notFound(reply, "project not found");
        }
        const latestVersion = project.versions[0];
        if (!latestVersion) {
            return badRequest(reply, "project has no versions");
        }
        const reviewGate = buildProjectReviewGate(project);
        if (action !== "unpublish" &&
            !reviewGate.publishReady) {
            return badRequest(reply, reviewGate.primaryConcern || "latest version is not ready for publishing");
        }
        const latestExternalId = await (0, repository_1.getLatestPublishedExternalId)(context.tenantId, project.site.id, project.id);
        if (action === "unpublish" && !latestExternalId) {
            return badRequest(reply, "project has no published or synced external content");
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
        return reply.code(202).send({
            publication_id: publication.id,
            project_id: project.id,
            version_id: latestVersion.id,
            status: "queued",
        });
    });
    fastify.post("/v2/content-images/:id/retry", async (request, reply) => {
        const context = await requireStudioPermission(request, reply, "projects.manage");
        if (!context) {
            return;
        }
        const imageId = request.params.id;
        if (!isUuid(imageId)) {
            return badRequest(reply, "invalid image id");
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
            return badRequest(reply, message);
        }
    });
    fastify.post("/v2/assets/generate", async (request, reply) => {
        const context = await requireStudioPermission(request, reply, "projects.manage");
        if (!context) {
            return;
        }
        const body = parseBody(request);
        const projectId = body.projectId?.trim();
        if (!projectId) {
            return badRequest(reply, "projectId is required");
        }
        if (!isUuid(projectId)) {
            return badRequest(reply, "invalid project id");
        }
        const version = body.versionId?.trim()
            ? (await (0, repository_1.getProjectById)(context.tenantId, projectId))?.versions.find((item) => item.id === body.versionId)
            : await (0, repository_1.getLatestVersion)(projectId, context.tenantId);
        if (!version) {
            return notFound(reply, "version not found");
        }
        const contentImageId = await (0, orchestration_1.requestImageGenerationForVersion)(context.tenantId, version.id, body.promptPresetVersionId?.trim() || null);
        return reply.code(202).send({
            version_id: version.id,
            content_image_id: contentImageId,
            status: "queued",
        });
    });
    fastify.get("/v2/media", async (request, reply) => {
        const context = await requireStudioContext(request, reply);
        if (!context) {
            return;
        }
        const query = request.query;
        const page = parsePage(query.page, 1);
        const pageSize = parsePageSize(query.pageSize, 24);
        if (query.status && !isOneOf(query.status, CONTENT_STATUSES)) {
            return badRequest(reply, `status must be one of: ${CONTENT_STATUSES.join(", ")}`);
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
        const context = await requireStudioPermission(request, reply, "projects.manage");
        if (!context) {
            return;
        }
        const versionId = request.params.id;
        if (!isUuid(versionId)) {
            return badRequest(reply, "invalid version id");
        }
        const body = parseBody(request);
        try {
            const version = await (0, repository_1.updateVersionContent)(context.tenantId, versionId, {
                title: body.title,
                excerpt: body.excerpt,
                bodyHtml: body.bodyHtml,
                seoTitle: body.seoTitle,
                seoDescription: body.seoDescription,
            });
            if (!version) {
                return notFound(reply, "version not found");
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
            return badRequest(reply, message);
        }
    });
    fastify.get("/v2/publications", async (request, reply) => {
        const context = await requireStudioContext(request, reply);
        if (!context) {
            return;
        }
        const query = request.query;
        const page = parsePage(query.page, 1);
        const pageSize = parsePageSize(query.pageSize, 20);
        if (query.status && !isOneOf(query.status, PUBLICATION_STATUSES)) {
            return badRequest(reply, `status must be one of: ${PUBLICATION_STATUSES.join(", ")}`);
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
    fastify.get("/v2/publications/:id", async (request, reply) => {
        const context = await requireStudioContext(request, reply);
        if (!context) {
            return;
        }
        const publicationId = request.params.id;
        if (!isUuid(publicationId)) {
            return badRequest(reply, "invalid publication id");
        }
        const publication = await (0, repository_1.getPublicationJobById)(context.tenantId, publicationId);
        if (!publication) {
            return notFound(reply, "publication not found");
        }
        return reply.send({
            ...publication,
            assetUrl: await (0, orchestration_1.buildAssetPublicUrl)(publication.version.contentImage?.storagePath),
        });
    });
    fastify.get("/v2/workspace/identity-provider", async (request, reply) => {
        const context = await requireStudioContext(request, reply);
        if (!context) {
            return;
        }
        return reply.send(await (0, auth_1.getStudioIdentityProviderConfig)(context.tenantId));
    });
    fastify.patch("/v2/workspace/identity-provider", async (request, reply) => {
        const context = await requireStudioPermission(request, reply, "workspace.manage");
        if (!context) {
            return;
        }
        const body = parseBody(request);
        if (body.provisioningMode && !isOneOf(body.provisioningMode, STUDIO_PROVISIONING_MODES)) {
            return badRequest(reply, `provisioningMode must be one of: ${STUDIO_PROVISIONING_MODES.join(", ")}`);
        }
        try {
            const claimMappings = parseJsonObjectField(body.claimMappings, "claimMappings");
            const provider = await (0, auth_1.upsertStudioIdentityProvider)(context.tenantId, {
                enabled: body.enabled,
                issuer: body.issuer?.trim(),
                clientId: body.clientId?.trim(),
                clientSecret: body.clientSecret === undefined ? undefined : parseOptionalString(body.clientSecret),
                scopes: body.scopes?.trim(),
                claimMappings: claimMappings ?? undefined,
                provisioningMode: body.provisioningMode,
            });
            return reply.send(provider);
        }
        catch (error) {
            return badRequest(reply, error instanceof Error ? error.message : String(error));
        }
    });
    fastify.post("/v2/workspace/identity-provider/test", async (request, reply) => {
        const context = await requireStudioPermission(request, reply, "workspace.manage");
        if (!context) {
            return;
        }
        const body = parseBody(request);
        const candidate = {
            ...(await (0, auth_1.getStudioIdentityProviderConfig)(context.tenantId)),
            issuer: body.issuer?.trim() || undefined,
            clientId: body.clientId?.trim() || undefined,
            scopes: body.scopes?.trim() || undefined,
        };
        if (!candidate.issuer) {
            return badRequest(reply, "issuer is required");
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
        const context = await requireStudioPermission(request, reply, "users.manage");
        if (!context) {
            return;
        }
        return reply.send(await (0, auth_1.listStudioUsers)(context.tenantId));
    });
    fastify.post("/v2/users/invitations", async (request, reply) => {
        const context = await requireStudioPermission(request, reply, "users.manage");
        if (!context) {
            return;
        }
        const body = parseBody(request);
        if (!body.email?.trim()) {
            return badRequest(reply, "email is required");
        }
        try {
            const invitation = await (0, auth_1.inviteStudioUser)(context.tenantId, context.userId, {
                email: body.email.trim(),
                displayName: parseOptionalString(body.displayName) ?? undefined,
                roleKeys: Array.isArray(body.roleKeys)
                    ? body.roleKeys.map((item) => String(item).trim()).filter(Boolean)
                    : undefined,
            });
            return reply.code(201).send(invitation);
        }
        catch (error) {
            return badRequest(reply, error instanceof Error ? error.message : String(error));
        }
    });
    fastify.patch("/v2/users/:id", async (request, reply) => {
        const context = await requireStudioPermission(request, reply, "users.manage");
        if (!context) {
            return;
        }
        const userId = request.params.id;
        if (!isUuid(userId)) {
            return badRequest(reply, "invalid user id");
        }
        const body = parseBody(request);
        if (body.status && !isOneOf(body.status, STUDIO_USER_STATUSES)) {
            return badRequest(reply, `status must be one of: ${STUDIO_USER_STATUSES.join(", ")}`);
        }
        try {
            const user = await (0, auth_1.updateStudioUser)(context.tenantId, userId, {
                displayName: body.displayName?.trim(),
                status: body.status,
            });
            if (!user) {
                return notFound(reply, "user not found");
            }
            return reply.send(user);
        }
        catch (error) {
            return badRequest(reply, error instanceof Error ? error.message : String(error));
        }
    });
    fastify.post("/v2/users/:id/roles", async (request, reply) => {
        const context = await requireStudioPermission(request, reply, "users.manage");
        if (!context) {
            return;
        }
        const userId = request.params.id;
        if (!isUuid(userId)) {
            return badRequest(reply, "invalid user id");
        }
        const body = parseBody(request);
        const roleId = body.roleId?.trim();
        if (!roleId || !isUuid(roleId)) {
            return badRequest(reply, "roleId is required");
        }
        try {
            await (0, auth_1.assignStudioRoleToUser)(context.tenantId, userId, roleId);
            return reply.code(204).send();
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (message === "user_or_role_not_found") {
                return notFound(reply, "user or role not found");
            }
            return badRequest(reply, message);
        }
    });
    fastify.delete("/v2/users/:id/roles/:roleId", async (request, reply) => {
        const context = await requireStudioPermission(request, reply, "users.manage");
        if (!context) {
            return;
        }
        const { id: userId, roleId } = request.params;
        if (!isUuid(userId) || !isUuid(roleId)) {
            return badRequest(reply, "invalid user or role id");
        }
        try {
            await (0, auth_1.removeStudioRoleFromUser)(context.tenantId, userId, roleId);
            return reply.code(204).send();
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (message === "user_or_role_not_found") {
                return notFound(reply, "user or role not found");
            }
            return badRequest(reply, message);
        }
    });
    fastify.get("/v2/roles", async (request, reply) => {
        const context = await requireStudioContext(request, reply);
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
        const context = await requireStudioPermission(request, reply, "roles.manage");
        if (!context) {
            return;
        }
        const body = parseBody(request);
        if (!body.name?.trim()) {
            return badRequest(reply, "name is required");
        }
        try {
            const role = await (0, auth_1.createStudioRole)(context.tenantId, {
                key: parseOptionalString(body.key) ?? undefined,
                name: body.name.trim(),
                description: parseOptionalString(body.description) ?? undefined,
                permissions: parsePermissionList(body.permissions),
                cloneFromRoleId: parseOptionalString(body.cloneFromRoleId),
            });
            return reply.code(201).send(role);
        }
        catch (error) {
            return badRequest(reply, error instanceof Error ? error.message : String(error));
        }
    });
    fastify.patch("/v2/roles/:id", async (request, reply) => {
        const context = await requireStudioPermission(request, reply, "roles.manage");
        if (!context) {
            return;
        }
        const roleId = request.params.id;
        if (!isUuid(roleId)) {
            return badRequest(reply, "invalid role id");
        }
        const body = parseBody(request);
        try {
            const role = await (0, auth_1.updateStudioRole)(context.tenantId, roleId, {
                name: body.name?.trim(),
                description: parseOptionalString(body.description),
                permissions: body.permissions === undefined ? undefined : parsePermissionList(body.permissions),
            });
            if (!role) {
                return notFound(reply, "role not found");
            }
            return reply.send(role);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (message === "system_role_locked") {
                return reply.code(409).send({ error: "conflict", message });
            }
            return badRequest(reply, message);
        }
    });
    fastify.get("/v2/prompts", async (request, reply) => {
        const context = await requireStudioPermission(request, reply, "prompts.manage");
        if (!context) {
            return;
        }
        return reply.send(await (0, prompts_1.listStudioPromptPresets)(prisma, context.tenantId));
    });
    fastify.post("/v2/prompts", async (request, reply) => {
        const context = await requireStudioPermission(request, reply, "prompts.manage");
        if (!context) {
            return;
        }
        const body = parseBody(request);
        if (!body.name?.trim() || !body.userTemplate?.trim()) {
            return badRequest(reply, "name and userTemplate are required");
        }
        if (!body.surface || !isOneOf(body.surface, STUDIO_PROMPT_SURFACES)) {
            return badRequest(reply, `surface must be one of: ${STUDIO_PROMPT_SURFACES.join(", ")}`);
        }
        if (body.scope && !isOneOf(body.scope, STUDIO_PROMPT_SCOPES)) {
            return badRequest(reply, `scope must be one of: ${STUDIO_PROMPT_SCOPES.join(", ")}`);
        }
        try {
            const preset = await (0, prompts_1.createStudioPromptPreset)(prisma, context.tenantId, context.userId, {
                key: parseOptionalString(body.key) ?? undefined,
                name: body.name.trim(),
                surface: body.surface,
                scope: body.scope,
                siteId: parseOptionalString(body.siteId),
                description: parseOptionalString(body.description),
                systemTemplate: body.systemTemplate === undefined ? undefined : parseOptionalString(body.systemTemplate),
                userTemplate: body.userTemplate,
                variablesJson: parseJsonObjectField(body.variablesJson, "variablesJson") ?? undefined,
                notes: parseOptionalString(body.notes),
            });
            return reply.code(201).send(preset);
        }
        catch (error) {
            return badRequest(reply, error instanceof Error ? error.message : String(error));
        }
    });
    fastify.get("/v2/prompts/:id", async (request, reply) => {
        const context = await requireStudioPermission(request, reply, "prompts.manage");
        if (!context) {
            return;
        }
        const presetId = request.params.id;
        if (!isUuid(presetId)) {
            return badRequest(reply, "invalid prompt id");
        }
        const projectId = parseOptionalString(request.query.projectId);
        if (projectId && !isUuid(projectId)) {
            return badRequest(reply, "invalid project id");
        }
        const preset = await (0, prompts_1.getStudioPromptPresetDetail)(prisma, context.tenantId, presetId, projectId);
        if (!preset) {
            return notFound(reply, "prompt not found");
        }
        return reply.send(preset);
    });
    fastify.post("/v2/prompts/:id/versions", async (request, reply) => {
        const context = await requireStudioPermission(request, reply, "prompts.manage");
        if (!context) {
            return;
        }
        const presetId = request.params.id;
        if (!isUuid(presetId)) {
            return badRequest(reply, "invalid prompt id");
        }
        const body = parseBody(request);
        if (!body.userTemplate?.trim()) {
            return badRequest(reply, "userTemplate is required");
        }
        const version = await (0, prompts_1.createStudioPromptVersion)(prisma, context.tenantId, presetId, context.userId, {
            systemTemplate: body.systemTemplate === undefined ? undefined : parseOptionalString(body.systemTemplate),
            userTemplate: body.userTemplate,
            variablesJson: parseJsonObjectField(body.variablesJson, "variablesJson") ?? undefined,
            notes: parseOptionalString(body.notes),
        });
        if (!version) {
            return notFound(reply, "prompt not found");
        }
        return reply.code(201).send(version);
    });
    fastify.patch("/v2/prompts/:id/versions/:versionId", async (request, reply) => {
        const context = await requireStudioPermission(request, reply, "prompts.manage");
        if (!context) {
            return;
        }
        const { id: presetId, versionId } = request.params;
        if (!isUuid(presetId) || !isUuid(versionId)) {
            return badRequest(reply, "invalid prompt or version id");
        }
        const body = parseBody(request);
        if (body.status && !isOneOf(body.status, STUDIO_PROMPT_VERSION_STATUSES)) {
            return badRequest(reply, `status must be one of: ${STUDIO_PROMPT_VERSION_STATUSES.join(", ")}`);
        }
        const version = await (0, prompts_1.updateStudioPromptVersion)(prisma, context.tenantId, presetId, versionId, context.userId, {
            status: body.status,
            systemTemplate: body.systemTemplate === undefined ? undefined : parseOptionalString(body.systemTemplate),
            userTemplate: body.userTemplate,
            variablesJson: parseJsonObjectField(body.variablesJson, "variablesJson") ?? undefined,
            notes: body.notes === undefined ? undefined : parseOptionalString(body.notes),
        });
        if (!version) {
            return notFound(reply, "prompt version not found");
        }
        return reply.send(version);
    });
    fastify.post("/v2/prompts/:id/versions/:versionId/approve", async (request, reply) => {
        const context = await requireStudioPermission(request, reply, "prompts.manage");
        if (!context) {
            return;
        }
        const { id: presetId, versionId } = request.params;
        if (!isUuid(presetId) || !isUuid(versionId)) {
            return badRequest(reply, "invalid prompt or version id");
        }
        const version = await (0, prompts_1.approveStudioPromptVersion)(prisma, context.tenantId, presetId, versionId, context.userId);
        if (!version) {
            return notFound(reply, "prompt version not found");
        }
        return reply.send(version);
    });
    fastify.post("/v2/prompts/:id/assignments", async (request, reply) => {
        const context = await requireStudioPermission(request, reply, "prompts.manage");
        if (!context) {
            return;
        }
        const presetId = request.params.id;
        if (!isUuid(presetId)) {
            return badRequest(reply, "invalid prompt id");
        }
        const body = parseBody(request);
        const versionId = body.versionId?.trim();
        if (!versionId || !isUuid(versionId)) {
            return badRequest(reply, "versionId is required");
        }
        if (body.siteId && !isUuid(body.siteId)) {
            return badRequest(reply, "invalid site id");
        }
        const assignment = await (0, prompts_1.assignStudioPromptVersion)(prisma, context.tenantId, presetId, context.userId, {
            versionId,
            siteId: parseOptionalString(body.siteId),
        });
        if (!assignment) {
            return notFound(reply, "approved prompt version not found");
        }
        return reply.send(assignment);
    });
}
