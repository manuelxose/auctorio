"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerRoutes = registerRoutes;
const topic_controller_1 = require("../controllers/topic-controller");
const content_image_controller_1 = require("../controllers/content-image-controller");
const content_text_controller_1 = require("../controllers/content-text-controller");
const routes_1 = require("../../studio/routes");
function registerRoutes(fastify) {
    fastify.get("/health", async () => ({ status: "ok" }));
    fastify.post("/v1/topics", topic_controller_1.createTopic);
    fastify.post("/v1/topics/:id/facts", topic_controller_1.addFacts);
    fastify.post("/v1/topics/:id/generate-text", topic_controller_1.generateText);
    fastify.post("/v1/topics/:id/generate-image", topic_controller_1.generateImage);
    fastify.post("/v1/text/:id/generate-image", content_image_controller_1.generateImageFromText);
    fastify.get("/v1/topics/:id/results", topic_controller_1.getResults);
    fastify.get("/v1/text/:id", content_text_controller_1.getContentText);
    fastify.get("/v1/images/:id", content_image_controller_1.getContentImage);
    (0, routes_1.registerStudioRoutes)(fastify);
}
