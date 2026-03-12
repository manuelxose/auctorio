"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const hash_1 = require("../../shared/utils/hash");
const repositories_1 = require("../../infrastructure/db/repositories");
const authPlugin = (fastify, _opts, done) => {
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
        const apiKeyHash = (0, hash_1.sha256)(token);
        const tenant = await repositories_1.tenantRepository.findByApiKeyHash(apiKeyHash);
        if (!tenant || tenant.status !== "active") {
            return reply.code(401).send({ error: "unauthorized", message: "Invalid API key" });
        }
        request.tenantId = tenant.id;
    });
    done();
};
exports.default = authPlugin;
