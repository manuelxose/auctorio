import Fastify from "fastify";
import authPlugin from "./plugins/auth";
import { registerRoutes } from "./routes";
import { getEnv, getNumberEnv, isProductionEnv } from "../shared/utils/env";
import { structuredEvent } from "../shared/utils/logger";
import { startMetricsLogging } from "../studio/metrics";

/**
 * Phase 5: lightweight fixed-window rate limiter (no heavy platform).
 * Default 300 req/min per IP; auth/session routes get a stricter window.
 */
function buildRateLimiter(windowMs: number, max: number): (ip: string) => boolean {
  const buckets = new Map<string, { count: number; resetAt: number }>();
  // Bound memory: never keep more than 10k tracked IPs.
  const MAX_BUCKETS = 10_000;
  return (ip: string) => {
    const now = Date.now();
    const bucket = buckets.get(ip);
    if (!bucket || bucket.resetAt <= now) {
      if (buckets.size >= MAX_BUCKETS && !bucket) {
        buckets.delete(buckets.keys().next().value as string);
      }
      buckets.set(ip, { count: 1, resetAt: now + windowMs });
      return true;
    }
    bucket.count += 1;
    return bucket.count <= max;
  };
}

export function buildServer() {
  const logLevel = getEnv("LOG_LEVEL", "info");

  const server = Fastify({
    logger: {
      level: logLevel,
    },
    // Explicit inbound payload bound (default is 1 MiB); kept explicit for
    // documentation and to guard against oversized JSON bodies.
    bodyLimit: 1_048_576,
  });

  // Global per-IP rate limiting; enabled by default in production, disabled
  // in tests/dev unless explicitly configured.
  const rateLimitMax = getNumberEnv("API_RATE_LIMIT_MAX_PER_MIN", isProductionEnv() ? 300 : 0);
  if (rateLimitMax > 0) {
    const globalLimit = buildRateLimiter(60_000, rateLimitMax);
    const authLimit = buildRateLimiter(60_000, getNumberEnv("API_AUTH_RATE_LIMIT_MAX_PER_MIN", 30));
    server.addHook("onRequest", async (request, reply) => {
      const ip = request.ip ?? "unknown";
      const isAuthPath =
        request.url.includes("/internal/login") ||
        request.url.includes("/internal/password") ||
        request.url.includes("/internal/session/validate");
      const allowed = isAuthPath ? authLimit(ip) : globalLimit(ip);
      if (!allowed) {
        structuredEvent("api.rate_limited", { ip, url: request.url }, "warn");
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

  server.register(authPlugin);
  registerRoutes(server);

  return server;
}

export async function startServer() {
  const port = Number.parseInt(getEnv("PORT", "3000"), 10);
  const host = getEnv("HOST", "0.0.0.0");
  const server = buildServer();

  startMetricsLogging();
  await server.listen({ port, host });
  server.log.info(`API listening on ${host}:${port}`);
}
