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
