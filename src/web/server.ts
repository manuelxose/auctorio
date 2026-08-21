import Fastify from "fastify";
import authPlugin from "./plugins/auth";
import { registerRoutes } from "./routes";
import { getEnv } from "../shared/utils/env";

export function buildServer() {
  const logLevel = getEnv("LOG_LEVEL", "info");

  const server = Fastify({
    logger: {
      level: logLevel,
    },
  });

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

  await server.listen({ port, host });
  server.log.info(`API listening on ${host}:${port}`);
}
