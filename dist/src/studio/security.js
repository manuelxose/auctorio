"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.STUDIO_SYSTEM_ROLES = exports.STUDIO_PERMISSIONS = void 0;
exports.hasStudioPermission = hasStudioPermission;
exports.normalizeRoleKey = normalizeRoleKey;
exports.slugifyTenantName = slugifyTenantName;
exports.generateStudioToken = generateStudioToken;
exports.hashStudioToken = hashStudioToken;
exports.encryptStudioSecret = encryptStudioSecret;
exports.decryptStudioSecret = decryptStudioSecret;
exports.buildStudioProxySignature = buildStudioProxySignature;
exports.isStudioProxySignatureFresh = isStudioProxySignatureFresh;
const node_crypto_1 = __importDefault(require("node:crypto"));
const env_1 = require("../shared/utils/env");
const hash_1 = require("../shared/utils/hash");
exports.STUDIO_PERMISSIONS = [
    "workspace.manage",
    "users.manage",
    "roles.manage",
    "prompts.manage",
    "projects.manage",
    "review.approve",
    "publishing.manage",
    "integrations.manage",
    "analytics.read",
];
exports.STUDIO_SYSTEM_ROLES = {
    owner: {
        name: "Owner",
        description: "Control total del workspace editorial, identidad, equipo y runtime.",
        permissions: [...exports.STUDIO_PERMISSIONS],
    },
    admin: {
        name: "Admin",
        description: "Gobierna operaciones, configuracion y surfaces internas del cockpit.",
        permissions: [...exports.STUDIO_PERMISSIONS],
    },
    editor: {
        name: "Editor",
        description: "Opera briefs, artículos y generación editorial sin gobernar el workspace.",
        permissions: ["projects.manage", "analytics.read"],
    },
    reviewer: {
        name: "Reviewer",
        description: "Aprueba versiones y opera la cola de revisión editorial.",
        permissions: ["review.approve", "analytics.read"],
    },
    seo_manager: {
        name: "SEO Manager",
        description: "Gobierna prompts, QA y señales SEO del workspace.",
        permissions: ["prompts.manage", "projects.manage", "analytics.read"],
    },
    publisher: {
        name: "Publisher",
        description: "Gestiona destinos, ventanas de publicación e integraciones operativas.",
        permissions: ["publishing.manage", "integrations.manage", "analytics.read"],
    },
};
function hasStudioPermission(permissions, permission) {
    const set = permissions instanceof Set ? permissions : new Set(permissions);
    return set.has(permission) || set.has("*");
}
function normalizeRoleKey(value) {
    return value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .slice(0, 48);
}
function slugifyTenantName(value) {
    return value
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 48) || "workspace";
}
function generateStudioToken() {
    return node_crypto_1.default.randomBytes(32).toString("base64url");
}
function hashStudioToken(value) {
    return (0, hash_1.sha256)(value);
}
function buildSecretKey(envName, fallbackEnvName, fallbackValue) {
    const secret = (0, env_1.getEnv)(envName, (0, env_1.getEnv)(fallbackEnvName, fallbackValue));
    return node_crypto_1.default.createHash("sha256").update(secret).digest();
}
function encryptStudioSecret(value) {
    const iv = node_crypto_1.default.randomBytes(12);
    const key = buildSecretKey("STUDIO_IDENTITY_ENCRYPTION_SECRET", "STUDIO_PROXY_SHARED_SECRET", "studio-dev-secret-change-me");
    const cipher = node_crypto_1.default.createCipheriv("aes-256-gcm", key, iv);
    const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [
        "v1",
        iv.toString("base64url"),
        tag.toString("base64url"),
        encrypted.toString("base64url"),
    ].join(".");
}
function decryptStudioSecret(value) {
    if (!value) {
        return null;
    }
    try {
        const [version, ivPart, tagPart, encryptedPart] = value.split(".");
        if (version !== "v1" || !ivPart || !tagPart || !encryptedPart) {
            return null;
        }
        const key = buildSecretKey("STUDIO_IDENTITY_ENCRYPTION_SECRET", "STUDIO_PROXY_SHARED_SECRET", "studio-dev-secret-change-me");
        const decipher = node_crypto_1.default.createDecipheriv("aes-256-gcm", key, Buffer.from(ivPart, "base64url"));
        decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
        return Buffer.concat([
            decipher.update(Buffer.from(encryptedPart, "base64url")),
            decipher.final(),
        ]).toString("utf8");
    }
    catch {
        return null;
    }
}
function buildStudioProxySignature(input) {
    const payload = [
        input.method.toUpperCase(),
        input.url,
        input.tenantId,
        input.userId,
        input.sessionId,
        input.permissions.join(","),
        input.timestamp,
    ].join("\n");
    return node_crypto_1.default
        .createHmac("sha256", (0, env_1.getEnv)("STUDIO_PROXY_SHARED_SECRET", "studio-proxy-dev-secret-change-me"))
        .update(payload)
        .digest("base64url");
}
function isStudioProxySignatureFresh(timestamp) {
    const value = Number.parseInt(timestamp, 10);
    if (Number.isNaN(value)) {
        return false;
    }
    const delta = Math.abs(Date.now() - value);
    return delta <= 5 * 60 * 1000;
}
