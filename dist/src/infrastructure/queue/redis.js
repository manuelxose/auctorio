"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRedisConnectionOptions = getRedisConnectionOptions;
exports.assertRedisConfigured = assertRedisConfigured;
const env_1 = require("../../shared/utils/env");
function getRedisConnectionOptions() {
    const redisUrl = (0, env_1.getEnv)("REDIS_URL", "");
    if (!redisUrl) {
        throw new Error("REDIS_URL is required");
    }
    const url = new URL(redisUrl);
    const db = url.pathname ? Number(url.pathname.replace("/", "")) : undefined;
    return {
        host: url.hostname,
        port: url.port ? Number(url.port) : 6379,
        username: url.username || undefined,
        password: url.password || undefined,
        db: Number.isNaN(db) ? undefined : db,
        // Avoid invisible multi-minute waits in CLI preflight/operations calls.
        connectTimeout: Math.max(1_000, (0, env_1.getNumberEnv)("REDIS_CONNECT_TIMEOUT_MS", 5_000)),
        maxRetriesPerRequest: null,
        enableOfflineQueue: false,
    };
}
function assertRedisConfigured() {
    if (!(0, env_1.getEnv)("REDIS_URL", "").trim()) {
        throw new Error("REDIS_URL is required; worker cannot start");
    }
}
