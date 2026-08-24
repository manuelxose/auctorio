"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPublisher = getPublisher;
const node_crypto_1 = __importDefault(require("node:crypto"));
const node_path_1 = __importDefault(require("node:path"));
const http_1 = require("../shared/utils/http");
const env_1 = require("../shared/utils/env");
const orchestration_1 = require("./orchestration");
const env_2 = require("../shared/utils/env");
function asRecord(value) {
    return value && typeof value === "object" ? value : {};
}
const GUIATV_CONTENT_TYPES = new Set([
    "guide",
    "ranking",
    "trend",
    "news",
    "analysis",
    "preview",
    "match-report",
]);
const GUIATV_CONTENT_TYPE_ALIASES = {
    faq: "guide",
    article: "guide",
    blog: "news",
    comparison: "guide",
};
const GUIATV_RELATED_ROUTE_KEYS = new Set(["platforms", "guide", "explore", "stats", "comparison"]);
const GUIATV_RELATED_PLATFORM_KEYS = new Set([
    "netflix",
    "prime-video",
    "disney-plus",
    "max",
    "movistar-plus",
    "skyshowtime",
    "apple-tv-plus",
    "filmin",
    "rtve-play",
    "atresplayer",
    "mitele",
    "pluto-tv",
    "rakuten-tv",
]);
function normalizeGuiaTvContentType(value) {
    const normalized = String(value || "").trim().toLowerCase();
    if (GUIATV_CONTENT_TYPES.has(normalized)) {
        return normalized;
    }
    return GUIATV_CONTENT_TYPE_ALIASES[normalized] ?? "guide";
}
function filterGuiaTvRelatedPlatformKeys(keys) {
    return keys.filter((key) => GUIATV_RELATED_PLATFORM_KEYS.has(key));
}
function filterGuiaTvRelatedRouteKeys(keys) {
    return keys.filter((key) => GUIATV_RELATED_ROUTE_KEYS.has(key));
}
function readCredentialRef(ref) {
    if (!ref) {
        return "";
    }
    return (0, env_1.getEnv)(ref, "").trim();
}
function readJsonCredentials(ref) {
    const raw = readCredentialRef(ref);
    if (!raw) {
        return null;
    }
    try {
        return JSON.parse(raw);
    }
    catch {
        return null;
    }
}
function getMetadata(project) {
    return asRecord(project.metadata);
}
function getStringArray(value) {
    if (Array.isArray(value)) {
        return value.map((item) => String(item).trim()).filter(Boolean);
    }
    if (typeof value === "string") {
        return value
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean);
    }
    return [];
}
function getFaqItems(project) {
    const value = getMetadata(project).faqItems;
    if (!Array.isArray(value)) {
        return [];
    }
    return value
        .map((item) => asRecord(item))
        .filter((item) => item.question && item.answer)
        .map((item) => ({
        question: String(item.question),
        answer: String(item.answer),
    }));
}
function imageFileName(assetUrl) {
    const parsed = new URL(assetUrl);
    return node_path_1.default.basename(parsed.pathname) || "generated-image.png";
}
async function resolveAssetUrl(context) {
    if (context.assetUrl) {
        return context.assetUrl;
    }
    return (0, orchestration_1.buildAssetPublicUrl)(context.version.contentImage?.storagePath);
}
function isPublishDryRunEnabled() {
    const defaultValue = (0, env_1.getEnv)("APP_ENV", "local") !== "production" || (0, env_1.getEnv)("NODE_ENV", "development") !== "production";
    return (0, env_1.getBooleanEnv)("PUBLISH_DRY_RUN", defaultValue);
}
function buildDryRunExternalId(context, action) {
    const seed = [
        context.site.type,
        context.site.key,
        context.project.id,
        context.version.id,
        action,
    ].join(":");
    const digest = node_crypto_1.default.createHash("sha1").update(seed).digest("hex").slice(0, 16);
    return `dryrun-${digest}`;
}
async function buildDryRunResult(context, action, reason, externalId) {
    const resolvedExternalId = externalId || buildDryRunExternalId(context, action);
    const assetUrl = await resolveAssetUrl(context);
    const baseUrl = String(context.site.baseUrl || "").replace(/\/$/, "");
    const effectiveTargetStatus = action === "publishDraft" || action === "updateDraft"
        ? "draft"
        : action === "publish"
            ? "publish"
            : null;
    return {
        externalId: resolvedExternalId,
        externalUrl: baseUrl ? `${baseUrl}/dry-run/${resolvedExternalId}` : null,
        effectiveTargetStatus,
        responsePayload: {
            mode: "dry_run",
            reason,
            action,
            effectiveTargetStatus,
            siteType: context.site.type,
            siteKey: context.site.key,
            projectId: context.project.id,
            versionId: context.version.id,
            generatedAt: new Date().toISOString(),
            assetUrl,
        },
    };
}
function getDryRunDecision(hasResolvedCredentials) {
    if (isPublishDryRunEnabled()) {
        return {
            enabled: true,
            reason: "env_publish_dry_run",
        };
    }
    if (!hasResolvedCredentials) {
        if ((0, env_2.isProductionEnv)()) {
            throw new Error("publishing_missing_credentials");
        }
        return {
            enabled: true,
            reason: "missing_publishing_credentials",
        };
    }
    return {
        enabled: false,
        reason: null,
    };
}
class GuiaTvPublisher {
    getAdminKey(site) {
        return readCredentialRef(site.publishingCredentialsRef);
    }
    getHeaders(site) {
        const adminKey = this.getAdminKey(site);
        if (!adminKey) {
            throw new Error("guiatv_missing_admin_key");
        }
        return {
            "content-type": "application/json",
            "x-admin-key": adminKey,
        };
    }
    async maybeDryRun(context, action, externalId) {
        const decision = getDryRunDecision(Boolean(this.getAdminKey(context.site)));
        if (!decision.enabled || !decision.reason) {
            return null;
        }
        return buildDryRunResult(context, action, decision.reason, externalId);
    }
    buildPayload(context, assetUrl, status) {
        const metadata = getMetadata(context.project);
        const categories = getStringArray(metadata.categories);
        const keywords = getStringArray(metadata.keywords);
        return {
            title: context.version.title || context.project.title,
            slug: String(metadata.slug || "").trim() || undefined,
            status,
            excerpt: context.version.excerpt || "",
            content: context.version.bodyHtml || "",
            categories,
            contentType: normalizeGuiaTvContentType(String(metadata.contentType || "guide")),
            featured: Boolean(metadata.featured),
            primaryIntent: metadata.primaryIntent ? String(metadata.primaryIntent) : undefined,
            targetQuery: metadata.targetQuery ? String(metadata.targetQuery) : undefined,
            relatedPlatformKeys: filterGuiaTvRelatedPlatformKeys(getStringArray(metadata.relatedPlatformKeys)),
            relatedRouteKeys: filterGuiaTvRelatedRouteKeys(getStringArray(metadata.relatedRouteKeys)),
            faqItems: getFaqItems(context.project),
            evergreen: metadata.evergreen !== false,
            featuredImage: assetUrl ?? undefined,
            coverImage: assetUrl ?? undefined,
            metaTitle: context.version.seoTitle || undefined,
            metaDescription: context.version.seoDescription || undefined,
            keywords,
            ogImage: assetUrl ?? undefined,
            canonicalUrl: metadata.canonicalUrl ? String(metadata.canonicalUrl) : undefined,
            publishedAt: new Date().toISOString(),
        };
    }
    async publishDraft(context) {
        const dryRun = await this.maybeDryRun(context, "publishDraft");
        if (dryRun) {
            return dryRun;
        }
        const assetUrl = await resolveAssetUrl(context);
        const payload = this.buildPayload(context, assetUrl, "draft");
        const siteBaseUrl = String(context.site.baseUrl || "").replace(/\/$/, "");
        const response = await this.postJson(`${siteBaseUrl}/v2/blog`, context, payload);
        return {
            externalId: String(response.data?.post?.id || ""),
            externalUrl: response.data?.post?.link || null,
            effectiveTargetStatus: "draft",
            responsePayload: response,
        };
    }
    async postJson(url, context, payload) {
        try {
            return await (0, http_1.fetchJson)(url, {
                method: "POST",
                headers: this.getHeaders(context.site),
                body: payload,
                timeoutMs: (0, env_1.getNumberEnv)("PUBLISH_TIMEOUT_MS", 30_000),
                retries: 1,
            });
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (/status=401|status=403/.test(message)) {
                throw new Error(`guiatv_admin_key_rejected. The configured x-admin-key was not accepted by ${url}. Verify GUIATV_AUCTORIO_ADMIN_KEY matches the destination ANALYTICS_ADMIN_KEY.`);
            }
            if (/status=404/.test(message)) {
                throw new Error(`guiatv_endpoint_not_found at ${url}. The GuiaTV admin API is served under /v2/blog.`);
            }
            throw error;
        }
    }
    async updateDraft(context, externalId) {
        const dryRun = await this.maybeDryRun(context, "updateDraft", externalId);
        if (dryRun) {
            return dryRun;
        }
        const assetUrl = await resolveAssetUrl(context);
        const payload = this.buildPayload(context, assetUrl, "draft");
        const siteBaseUrl = String(context.site.baseUrl || "").replace(/\/$/, "");
        const response = await (0, http_1.fetchJson)(`${siteBaseUrl}/v2/blog/${externalId}`, {
            method: "PUT",
            headers: this.getHeaders(context.site),
            body: payload,
            timeoutMs: (0, env_1.getNumberEnv)("PUBLISH_TIMEOUT_MS", 30_000),
            retries: 1,
        });
        return {
            externalId,
            externalUrl: response.data?.post?.link || null,
            effectiveTargetStatus: "draft",
            responsePayload: response,
        };
    }
    async publish(context, externalId) {
        const dryRun = await this.maybeDryRun(context, "publish", externalId);
        if (dryRun) {
            return dryRun;
        }
        if (externalId) {
            const assetUrl = await resolveAssetUrl(context);
            const payload = this.buildPayload(context, assetUrl, "publish");
            const siteBaseUrl = String(context.site.baseUrl || "").replace(/\/$/, "");
            const response = await (0, http_1.fetchJson)(`${siteBaseUrl}/v2/blog/${externalId}`, {
                method: "PUT",
                headers: this.getHeaders(context.site),
                body: payload,
                timeoutMs: (0, env_1.getNumberEnv)("PUBLISH_TIMEOUT_MS", 30_000),
                retries: 1,
            });
            return {
                externalId,
                externalUrl: response.data?.post?.link || null,
                effectiveTargetStatus: "publish",
                responsePayload: response,
            };
        }
        const draft = await this.publishDraft(context);
        if (!draft.externalId) {
            return draft;
        }
        return this.publish(context, draft.externalId);
    }
    async unpublish(context, externalId) {
        const dryRun = await this.maybeDryRun(context, "unpublish", externalId);
        if (dryRun) {
            return dryRun;
        }
        const siteBaseUrl = String(context.site.baseUrl || "").replace(/\/$/, "");
        const response = await (0, http_1.fetchJson)(`${siteBaseUrl}/v2/blog/${externalId}`, {
            method: "DELETE",
            headers: this.getHeaders(context.site),
            timeoutMs: (0, env_1.getNumberEnv)("PUBLISH_TIMEOUT_MS", 30_000),
            retries: 1,
        });
        return {
            externalId: String(response.data?.id || externalId),
            responsePayload: response,
        };
    }
}
class TecnoriaPublisher {
    readCredentials(site) {
        const ref = site.publishingCredentialsRef;
        if (!ref) {
            return null;
        }
        const raw = readCredentialRef(ref);
        if (!raw) {
            return null;
        }
        const parsed = readJsonCredentials(ref);
        if (parsed?.token?.trim()) {
            return { token: parsed.token.trim() };
        }
        if (parsed?.email?.trim() && parsed?.password?.trim()) {
            return {
                email: parsed.email.trim(),
                password: parsed.password.trim(),
            };
        }
        return { token: raw };
    }
    async maybeDryRun(context, action, externalId) {
        const decision = getDryRunDecision(Boolean(this.readCredentials(context.site)));
        if (!decision.enabled || !decision.reason) {
            return null;
        }
        return buildDryRunResult(context, action, decision.reason, externalId);
    }
    async getSessionCookie(site) {
        const credentials = this.readCredentials(site);
        if (!credentials) {
            throw new Error("tecnoria_missing_credentials");
        }
        const siteBaseUrl = String(site.baseUrl || "").replace(/\/$/, "");
        const response = await (0, http_1.fetchWithTimeout)(`${siteBaseUrl}/api/v1/auth/login`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: {
                email: credentials.email,
                password: credentials.password,
            },
            timeoutMs: (0, env_1.getNumberEnv)("PUBLISH_TIMEOUT_MS", 30_000),
            retries: 1,
        });
        if (!response.ok) {
            const body = await response.text();
            throw new Error(`tecnoria_login_failed status=${response.status} body=${body}`);
        }
        const setCookie = response.headers.get("set-cookie");
        if (!setCookie) {
            throw new Error("tecnoria_missing_session_cookie");
        }
        return setCookie.split(";")[0];
    }
    async getAuthHeaders(site, contentType) {
        const credentials = this.readCredentials(site);
        if (!credentials) {
            throw new Error("tecnoria_missing_credentials");
        }
        if (credentials.token?.trim()) {
            return {
                ...(contentType ? { "content-type": contentType } : {}),
                Authorization: `Bearer ${credentials.token.trim()}`,
            };
        }
        const cookie = await this.getSessionCookie(site);
        return {
            ...(contentType ? { "content-type": contentType } : {}),
            Cookie: cookie,
        };
    }
    async uploadAsset(context) {
        const assetUrl = await resolveAssetUrl(context);
        if (!assetUrl) {
            return null;
        }
        const siteBaseUrl = String(context.site.baseUrl || "").replace(/\/$/, "");
        const assetResponse = await (0, http_1.fetchWithTimeout)(assetUrl, {
            timeoutMs: (0, env_1.getNumberEnv)("IMAGE_DOWNLOAD_TIMEOUT_MS", 60_000),
            retries: 1,
        });
        if (!assetResponse.ok) {
            const body = await assetResponse.text();
            throw new Error(`asset_download_failed status=${assetResponse.status} body=${body}`);
        }
        const buffer = Buffer.from(await assetResponse.arrayBuffer());
        const formData = new FormData();
        formData.append("file", new Blob([buffer]), imageFileName(assetUrl));
        const upload = await (0, http_1.fetchJson)(`${siteBaseUrl}/api/v1/blog/upload-image`, {
            method: "POST",
            headers: await this.getAuthHeaders(context.site),
            body: formData,
            timeoutMs: (0, env_1.getNumberEnv)("PUBLISH_TIMEOUT_MS", 60_000),
            retries: 1,
        });
        return upload.url ?? null;
    }
    buildPayload(context, uploadedImage, status) {
        const metadata = getMetadata(context.project);
        const slug = String(metadata.slug || "").trim() ||
            String(context.version.title || context.project.title)
                .toLowerCase()
                .replace(/[^a-z0-9\s-]/g, "")
                .trim()
                .replace(/\s+/g, "-");
        return {
            slug,
            title: context.version.title || context.project.title,
            shortDescription: context.version.excerpt || "",
            content: context.version.bodyHtml || "",
            image: uploadedImage ?? undefined,
            tags: getStringArray(metadata.tags),
            author: metadata.author ? String(metadata.author) : "TecnoRia",
            status,
            publishedAt: status === "publish" ? new Date().toISOString() : null,
            seoTitle: context.version.seoTitle || undefined,
            seoDescription: context.version.seoDescription || undefined,
        };
    }
    async publishDraft(context) {
        const dryRun = await this.maybeDryRun(context, "publishDraft");
        if (dryRun) {
            return dryRun;
        }
        return this.upsert(context, "draft");
    }
    async updateDraft(context, externalId) {
        const dryRun = await this.maybeDryRun(context, "updateDraft", externalId);
        if (dryRun) {
            return dryRun;
        }
        return this.upsert(context, "draft", externalId);
    }
    async publish(context, externalId) {
        const dryRun = await this.maybeDryRun(context, "publish", externalId);
        if (dryRun) {
            return dryRun;
        }
        return this.upsert(context, "publish", externalId ?? undefined);
    }
    async upsert(context, status, externalId) {
        const uploadedImage = await this.uploadAsset(context);
        const payload = this.buildPayload(context, uploadedImage, status);
        const siteBaseUrl = String(context.site.baseUrl || "").replace(/\/$/, "");
        const method = externalId ? "PUT" : "POST";
        const url = externalId ? `${siteBaseUrl}/api/v1/blog/${externalId}` : `${siteBaseUrl}/api/v1/blog`;
        const response = await (0, http_1.fetchWithTimeout)(url, {
            method,
            headers: await this.getAuthHeaders(context.site, "application/json"),
            body: payload,
            timeoutMs: (0, env_1.getNumberEnv)("PUBLISH_TIMEOUT_MS", 30_000),
            retries: 1,
        });
        const text = await response.text();
        if (!response.ok) {
            throw new Error(`tecnoria_publish_failed status=${response.status} body=${text}`);
        }
        const parsed = text ? JSON.parse(text) : {};
        const resolvedExternalId = externalId ?? (parsed.id ? String(parsed.id) : null);
        const resolvedSlug = parsed.slug && String(parsed.slug).trim()
            ? String(parsed.slug).trim()
            : String(payload.slug || "").trim();
        return {
            externalId: resolvedExternalId,
            externalUrl: resolvedSlug ? `${siteBaseUrl}/blog/${resolvedSlug}` : null,
            effectiveTargetStatus: status,
            responsePayload: parsed,
        };
    }
    async unpublish(context, externalId) {
        const dryRun = await this.maybeDryRun(context, "unpublish", externalId);
        if (dryRun) {
            return dryRun;
        }
        return this.upsert(context, "draft", externalId);
    }
}
class TalkarisPublisher {
    getToken(site) {
        return readCredentialRef(site.publishingCredentialsRef);
    }
    async maybeDryRun(context, action, externalId) {
        const decision = getDryRunDecision(Boolean(this.getToken(context.site)));
        if (!decision.enabled || !decision.reason) {
            return null;
        }
        return buildDryRunResult(context, action, decision.reason, externalId);
    }
    getHeaders(site) {
        const token = this.getToken(site);
        if (!token) {
            throw new Error("talkaris_missing_token");
        }
        return {
            "content-type": "application/json",
            Authorization: `Bearer ${token}`,
        };
    }
    buildPayload(context, status, externalId) {
        const metadata = getMetadata(context.project);
        const slug = String(metadata.slug || "").trim() ||
            String(context.version.title || context.project.title)
                .toLowerCase()
                .replace(/[^a-z0-9\s-]/g, "")
                .trim()
                .replace(/\s+/g, "-");
        return {
            id: externalId ?? undefined,
            slug,
            title: context.version.title || context.project.title,
            summary: context.version.excerpt || "",
            bodyHtml: context.version.bodyHtml || "",
            locale: context.project.primaryLanguage || "en",
            author: metadata.author ? String(metadata.author) : "Talkaris Team",
            category: metadata.category ? String(metadata.category) : "product-updates",
            tags: getStringArray(metadata.tags),
            imageUrl: context.assetUrl ?? null,
            seoTitle: context.version.seoTitle || undefined,
            seoDescription: context.version.seoDescription || undefined,
            status,
            publishedAt: status === "publish" ? new Date().toISOString() : null,
        };
    }
    async dispatch(context, status, externalId) {
        const siteBaseUrl = String(context.site.baseUrl || "").replace(/\/$/, "");
        const payload = this.buildPayload(context, status, externalId);
        const method = externalId ? "PUT" : "POST";
        const url = externalId
            ? `${siteBaseUrl}/api/v1/ops/blog/${externalId}`
            : `${siteBaseUrl}/api/v1/ops/blog`;
        const response = await (0, http_1.fetchWithTimeout)(url, {
            method,
            headers: this.getHeaders(context.site),
            body: payload,
            timeoutMs: (0, env_1.getNumberEnv)("PUBLISH_TIMEOUT_MS", 30_000),
            retries: 1,
        });
        const text = await response.text();
        if (!response.ok) {
            throw new Error(`talkaris_publish_failed status=${response.status} body=${text}`);
        }
        const parsed = text ? JSON.parse(text) : {};
        const resolvedExternalId = externalId ?? (parsed.id ? String(parsed.id) : null);
        const resolvedSlug = parsed.slug && String(parsed.slug).trim()
            ? String(parsed.slug).trim()
            : String(payload.slug || "").trim();
        return {
            externalId: resolvedExternalId,
            externalUrl: resolvedSlug ? `${siteBaseUrl}/blog/${resolvedSlug}` : null,
            effectiveTargetStatus: status,
            responsePayload: parsed,
        };
    }
    async publishDraft(context) {
        const dryRun = await this.maybeDryRun(context, "publishDraft");
        if (dryRun) {
            return dryRun;
        }
        return this.dispatch(context, "draft");
    }
    async updateDraft(context, externalId) {
        const dryRun = await this.maybeDryRun(context, "updateDraft", externalId);
        if (dryRun) {
            return dryRun;
        }
        return this.dispatch(context, "draft", externalId);
    }
    async publish(context, externalId) {
        const dryRun = await this.maybeDryRun(context, "publish", externalId);
        if (dryRun) {
            return dryRun;
        }
        return this.dispatch(context, "publish", externalId);
    }
    async unpublish(context, externalId) {
        const dryRun = await this.maybeDryRun(context, "unpublish", externalId);
        if (dryRun) {
            return dryRun;
        }
        return this.dispatch(context, "draft", externalId);
    }
}
class GenericWebhookPublisher {
    getSecret(site) {
        return readCredentialRef(site.publishingCredentialsRef);
    }
    async maybeDryRun(context, action, externalId) {
        const decision = getDryRunDecision(Boolean(this.getSecret(context.site)));
        if (!decision.enabled || !decision.reason) {
            return null;
        }
        return buildDryRunResult(context, action, decision.reason, externalId);
    }
    buildPayload(context, action, targetStatus, externalId) {
        return {
            site: {
                id: context.site.id,
                key: context.site.key,
                type: context.site.type,
            },
            project: {
                id: context.project.id,
                title: context.project.title,
                goal: context.project.goal,
                metadata: context.project.metadata,
            },
            version: {
                id: context.version.id,
                title: context.version.title,
                excerpt: context.version.excerpt,
                bodyHtml: context.version.bodyHtml,
                seoTitle: context.version.seoTitle,
                seoDescription: context.version.seoDescription,
            },
            publication: {
                action,
                targetStatus,
                externalId: externalId ?? null,
            },
            assetUrl: context.assetUrl ?? null,
        };
    }
    async publishDraft(context) {
        const dryRun = await this.maybeDryRun(context, "publishDraft");
        if (dryRun) {
            return dryRun;
        }
        return this.dispatch(context, "publishDraft", "draft");
    }
    async updateDraft(context, externalId) {
        const dryRun = await this.maybeDryRun(context, "updateDraft", externalId);
        if (dryRun) {
            return dryRun;
        }
        return this.dispatch(context, "updateDraft", "draft", externalId);
    }
    async publish(context, externalId) {
        const dryRun = await this.maybeDryRun(context, "publish", externalId);
        if (dryRun) {
            return dryRun;
        }
        return this.dispatch(context, "publish", "publish", externalId);
    }
    async dispatch(context, action, targetStatus, externalId) {
        const siteBaseUrl = String(context.site.baseUrl || "").replace(/\/$/, "");
        const payload = this.buildPayload(context, action, targetStatus, externalId);
        const body = JSON.stringify(payload);
        const signature = node_crypto_1.default
            .createHmac("sha256", this.getSecret(context.site))
            .update(body)
            .digest("hex");
        const response = await (0, http_1.fetchWithTimeout)(siteBaseUrl, {
            method: "POST",
            headers: {
                "content-type": "application/json",
                "x-content-signature": signature,
            },
            body,
            timeoutMs: (0, env_1.getNumberEnv)("PUBLISH_TIMEOUT_MS", 30_000),
            retries: 1,
        });
        const text = await response.text();
        if (!response.ok) {
            throw new Error(`webhook_publish_failed status=${response.status} body=${text}`);
        }
        const parsed = text ? JSON.parse(text) : {};
        return {
            externalId: parsed.id ? String(parsed.id) : null,
            externalUrl: parsed.url ? String(parsed.url) : null,
            effectiveTargetStatus: targetStatus,
            responsePayload: parsed,
        };
    }
    async unpublish(context, externalId) {
        const dryRun = await this.maybeDryRun(context, "unpublish", externalId);
        if (dryRun) {
            return dryRun;
        }
        return this.dispatch(context, "unpublish", null, externalId);
    }
}
function getPublisher(site) {
    switch (site.type) {
        case "guiatv":
            return new GuiaTvPublisher();
        case "tecnoria":
            return new TecnoriaPublisher();
        case "talkaris":
            return new TalkarisPublisher();
        case "webhook":
            return new GenericWebhookPublisher();
        default:
            throw new Error(`unsupported_publisher_type ${site.type}`);
    }
}
