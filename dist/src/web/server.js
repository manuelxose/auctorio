"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildServer = buildServer;
exports.startServer = startServer;
const fastify_1 = __importDefault(require("fastify"));
const auth_1 = __importDefault(require("./plugins/auth"));
const routes_1 = require("./routes");
const env_1 = require("../shared/utils/env");
const logger_1 = require("../shared/utils/logger");
const metrics_1 = require("../studio/metrics");
/**
 * Phase 5: lightweight fixed-window rate limiter (no heavy platform).
 * Default 300 req/min per IP; auth/session routes get a stricter window.
 */
function buildRateLimiter(windowMs, max) {
    const buckets = new Map();
    // Bound memory: never keep more than 10k tracked IPs.
    const MAX_BUCKETS = 10_000;
    return (ip) => {
        const now = Date.now();
        const bucket = buckets.get(ip);
        if (!bucket || bucket.resetAt <= now) {
            if (buckets.size >= MAX_BUCKETS && !bucket) {
                buckets.delete(buckets.keys().next().value);
            }
            buckets.set(ip, { count: 1, resetAt: now + windowMs });
            return true;
        }
        bucket.count += 1;
        return bucket.count <= max;
    };
}
function buildServer() {
    const logLevel = (0, env_1.getEnv)("LOG_LEVEL", "info");
    const server = (0, fastify_1.default)({
        logger: {
            level: logLevel,
        },
        // Explicit inbound payload bound (default is 1 MiB); kept explicit for
        // documentation and to guard against oversized JSON bodies.
        bodyLimit: 1_048_576,
    });
    // Global per-IP rate limiting; enabled by default in production, disabled
    // in tests/dev unless explicitly configured.
    const rateLimitMax = (0, env_1.getNumberEnv)("API_RATE_LIMIT_MAX_PER_MIN", (0, env_1.isProductionEnv)() ? 300 : 0);
    if (rateLimitMax > 0) {
        const globalLimit = buildRateLimiter(60_000, rateLimitMax);
        const authLimit = buildRateLimiter(60_000, (0, env_1.getNumberEnv)("API_AUTH_RATE_LIMIT_MAX_PER_MIN", 30));
        server.addHook("onRequest", async (request, reply) => {
            const ip = request.ip ?? "unknown";
            const isAuthPath = request.url.includes("/internal/login") ||
                request.url.includes("/internal/password") ||
                request.url.includes("/internal/session/validate");
            const allowed = isAuthPath ? authLimit(ip) : globalLimit(ip);
            if (!allowed) {
                (0, logger_1.structuredEvent)("api.rate_limited", { ip, url: request.url }, "warn");
                reply.code(429).send({ error: { code: "rate_limited", message: "Too many requests" } });
            }
        });
    }
    server.setNotFoundHandler((request, reply) => {
        reply.code(404).send({
            error: {
                code: "not_found",
                message: `Route ${request.method} ${request.url} not found`,
                requestId: request.id ?? null,
            },
        });
    });
    server.setErrorHandler((error, request, reply) => {
        const statusCode = error.statusCode && error.statusCode >= 400 && error.statusCode < 600 ? error.statusCode : 500;
        if (statusCode >= 500) {
            request.log.error({ err: error }, "unhandled request error");
        }
        reply.code(statusCode).send({
            error: {
                code: error.code || "internal_error",
                message: statusCode >= 500 ? "internal_error" : error.message,
                requestId: request.id ?? null,
            },
        });
    });
    server.register(auth_1.default);
    (0, routes_1.registerRoutes)(server);
    return server;
}
async function startServer() {
    const port = Number.parseInt((0, env_1.getEnv)("PORT", "3000"), 10);
    const host = (0, env_1.getEnv)("HOST", "0.0.0.0");
    const server = buildServer();
    (0, metrics_1.startMetricsLogging)();
    await server.listen({ port, host });
    server.log.info(`API listening on ${host}:${port}`);
}
