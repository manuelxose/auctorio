import type { FastifyPluginCallback } from "fastify";
import { sha256 } from "../../shared/utils/hash";
import { tenantRepository } from "../../infrastructure/db/repositories";

const authPlugin: FastifyPluginCallback = (fastify, _opts, done) => {
  fastify.decorateRequest("tenantId", "");

  fastify.addHook("preHandler", async (request, reply) => {
    if (!request.url.startsWith("/v1/") && !request.url.startsWith("/v2/")) {
      return;
    }

    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return reply.code(401).send({ error: "unauthorized", message: "Missing API key" });
    }

    const token = authHeader.slice("Bearer ".length).trim();
    if (!token) {
      return reply.code(401).send({ error: "unauthorized", message: "Invalid API key" });
    }

    const apiKeyHash = sha256(token);

    const tenant = await tenantRepository.findByApiKeyHash(apiKeyHash);

    if (!tenant || tenant.status !== "active") {
      return reply.code(401).send({ error: "unauthorized", message: "Invalid API key" });
    }

    request.tenantId = tenant.id;
  });

  done();
};

export default authPlugin;
