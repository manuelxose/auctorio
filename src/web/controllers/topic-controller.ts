import type { FastifyReply, FastifyRequest } from "fastify";
import {
  addFactUseCase,
  createTopicUseCase,
  generateImageUseCase,
  generateTextUseCase,
  getResultsUseCase,
} from "../../domain/usecases";
import { getNumberEnv } from "../../shared/utils/env";
import { useCaseDependencies } from "../dependencies";
import {
  getIdempotencyKey,
  sendContentAccepted,
  sendJobAccepted,
  sendTopicCreated,
  sendUseCaseError,
} from "./common";

type TopicParams = { id: string };

type FactCreateInput = {
  source_type: "manual" | "rss" | "html" | "api";
  source_ref?: string;
  content?: string;
  metadata?: Record<string, unknown>;
};

type GenerateTextInput = {
  type: "seo" | "instagram";
  language: "es" | "en";
  options?: Record<string, unknown>;
};

type GenerateImageInput = {
  mode?: "contextual" | "independent";
  options?: Record<string, unknown>;
};

function mapContentText(content: { id: string; topicId: string; type: string; language: string; status: string; output?: string | null; createdAt: Date }) {
  return {
    id: content.id,
    topic_id: content.topicId,
    type: content.type,
    language: content.language,
    status: content.status,
    output: content.output ?? null,
    created_at: content.createdAt.toISOString(),
  };
}

function mapContentImage(content: { id: string; topicId: string; textId?: string | null; status: string; storagePath?: string | null; createdAt: Date }) {
  return {
    id: content.id,
    topic_id: content.topicId,
    text_id: content.textId ?? null,
    status: content.status,
    storage_path: content.storagePath ?? null,
    created_at: content.createdAt.toISOString(),
  };
}

export async function createTopic(request: FastifyRequest, reply: FastifyReply) {
  const body = request.body as { title?: string; description?: string } | undefined;

  const result = await createTopicUseCase(useCaseDependencies, {
    tenantId: request.tenantId,
    title: body?.title,
    description: body?.description ?? null,
  });

  if (!result.ok) {
    return sendUseCaseError(reply, result.error);
  }

  return sendTopicCreated(reply, result.data.topic);
}

export async function addFacts(request: FastifyRequest, reply: FastifyReply) {
  const params = request.params as TopicParams;
  const body = request.body as FactCreateInput | undefined;

  const result = await addFactUseCase(useCaseDependencies, {
    tenantId: request.tenantId,
    topicId: params.id,
    sourceType: body?.source_type,
    sourceRef: body?.source_ref,
    content: body?.content,
    metadata: body?.metadata ?? null,
    idempotencyKey: getIdempotencyKey(request),
  });

  if (!result.ok) {
    return sendUseCaseError(reply, result.error);
  }

  if (result.data.kind === "manual") {
    const fact = result.data.fact;
    return reply.code(result.data.created ? 201 : 200).send({
      id: fact.id,
      topic_id: fact.topicId,
      source_type: fact.sourceType,
      source_ref: fact.sourceRef ?? null,
      content: fact.content,
      created_at: fact.createdAt.toISOString(),
    });
  }

  return sendJobAccepted(reply, result.data.job.id, result.data.job.status);
}

export async function generateText(request: FastifyRequest, reply: FastifyReply) {
  const params = request.params as TopicParams;
  const body = request.body as GenerateTextInput | undefined;

  const result = await generateTextUseCase(useCaseDependencies, {
    tenantId: request.tenantId,
    topicId: params.id,
    type: body?.type,
    language: body?.language,
    options: body?.options ?? null,
    idempotencyKey: getIdempotencyKey(request),
    estimatedCostUsd: getNumberEnv("ESTIMATED_TEXT_COST_USD", 0),
  });

  if (!result.ok) {
    return sendUseCaseError(reply, result.error);
  }

  if (result.data.deduped || !result.data.job) {
    return reply.code(200).send({
      job_id: null,
      content_id: result.data.content.id,
      status: result.data.content.status,
    });
  }

  return sendContentAccepted(reply, result.data.job.id, result.data.content.id, result.data.job.status);
}

export async function generateImage(request: FastifyRequest, reply: FastifyReply) {
  const params = request.params as TopicParams;
  const body = request.body as GenerateImageInput | undefined;

  const result = await generateImageUseCase(useCaseDependencies, {
    tenantId: request.tenantId,
    topicId: params.id,
    mode: body?.mode,
    options: body?.options ?? null,
    idempotencyKey: getIdempotencyKey(request),
    estimatedCostUsd: getNumberEnv("ESTIMATED_IMAGE_COST_USD", 0),
  });

  if (!result.ok) {
    return sendUseCaseError(reply, result.error);
  }

  if (result.data.deduped || !result.data.job) {
    return reply.code(200).send({
      job_id: null,
      content_id: result.data.content.id,
      status: result.data.content.status,
    });
  }

  return sendContentAccepted(reply, result.data.job.id, result.data.content.id, result.data.job.status);
}

export async function getResults(request: FastifyRequest, reply: FastifyReply) {
  const params = request.params as TopicParams;

  const result = await getResultsUseCase(useCaseDependencies, {
    tenantId: request.tenantId,
    topicId: params.id,
  });

  if (!result.ok) {
    return sendUseCaseError(reply, result.error);
  }

  return reply.code(200).send({
    topic_id: result.data.topic.id,
    texts: result.data.texts.map(mapContentText),
    images: result.data.images.map(mapContentImage),
  });
}
