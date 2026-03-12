import type { FastifyInstance } from "fastify";
import {
  addFacts,
  createTopic,
  generateImage,
  generateText,
  getResults,
} from "../controllers/topic-controller";
import { generateImageFromText, getContentImage } from "../controllers/content-image-controller";
import { getContentText } from "../controllers/content-text-controller";
import { registerStudioRoutes } from "../../studio/routes";

export function registerRoutes(fastify: FastifyInstance) {
  fastify.get("/health", async () => ({ status: "ok" }));

  fastify.post("/v1/topics", createTopic);
  fastify.post("/v1/topics/:id/facts", addFacts);
  fastify.post("/v1/topics/:id/generate-text", generateText);
  fastify.post("/v1/topics/:id/generate-image", generateImage);
  fastify.post("/v1/text/:id/generate-image", generateImageFromText);

  fastify.get("/v1/topics/:id/results", getResults);
  fastify.get("/v1/text/:id", getContentText);
  fastify.get("/v1/images/:id", getContentImage);

  registerStudioRoutes(fastify);
}
