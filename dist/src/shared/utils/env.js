"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getEnv = getEnv;
exports.getNumberEnv = getNumberEnv;
exports.getBooleanEnv = getBooleanEnv;
exports.getJsonEnv = getJsonEnv;
exports.requireEnv = requireEnv;
exports.getPublicBaseUrl = getPublicBaseUrl;
function getEnv(key, fallback) {
    const value = process.env[key];
    if (value === undefined || value === "") {
        if (fallback !== undefined) {
            return fallback;
        }
        return "";
    }
    return value;
}
function getNumberEnv(key, fallback) {
    const value = getEnv(key, "");
    const parsed = Number.parseFloat(value);
    if (Number.isNaN(parsed)) {
        return fallback;
    }
    return parsed;
}
function getBooleanEnv(key, fallback) {
    const value = getEnv(key, "");
    if (!value) {
        return fallback;
    }
    const normalized = value.trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(normalized)) {
        return true;
    }
    if (["0", "false", "no", "off"].includes(normalized)) {
        return false;
    }
    return fallback;
}
function getJsonEnv(key, fallback) {
    const value = getEnv(key, "");
    if (!value) {
        return fallback;
    }
    try {
        return JSON.parse(value);
    }
    catch (error) {
        throw new Error(`Invalid JSON env var: ${key} (${String(error)})`);
    }
}
function requireEnv(key) {
    const value = process.env[key];
    if (!value) {
        throw new Error(`Missing required env var: ${key}`);
    }
    return value;
}
function getPublicBaseUrl() {
    const value = getEnv("PUBLIC_BASE_URL", "").trim();
    if (value) {
        return value.replace(/\/$/, "");
    }
    const host = getEnv("HOST", "0.0.0.0");
    const port = getEnv("PORT", "3000");
    return `http://${host === "0.0.0.0" ? "localhost" : host}:${port}`;
}
