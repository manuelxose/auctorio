"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRedisConnectionOptions = getRedisConnectionOptions;
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
    };
}
