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
function buildServer() {
    const logLevel = (0, env_1.getEnv)("LOG_LEVEL", "info");
    const server = (0, fastify_1.default)({
        logger: {
            level: logLevel,
        },
    });
    server.register(auth_1.default);
    (0, routes_1.registerRoutes)(server);
    return server;
}
async function startServer() {
    const port = Number.parseInt((0, env_1.getEnv)("PORT", "3000"), 10);
    const host = (0, env_1.getEnv)("HOST", "0.0.0.0");
    const server = buildServer();
    await server.listen({ port, host });
    server.log.info(`API listening on ${host}:${port}`);
}
