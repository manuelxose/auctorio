import type { FastifyReply, FastifyRequest } from "fastify";
import { generateImageFromTextUseCase, getContentImageUseCase } from "../../domain/usecases";
import { getNumberEnv } from "../../shared/utils/env";
import { useCaseDependencies } from "../dependencies";
import { getIdempotencyKey, sendUseCaseError } from "./common";

export async function generateImageFromText(request: FastifyRequest, reply: FastifyReply) {
  const params = request.params as { id: string };
  const body = request.body as { options?: Record<string, unknown> } | undefined;

  const result = await generateImageFromTextUseCase(useCaseDependencies, {
    tenantId: request.tenantId,
    contentTextId: params.id,
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

  return reply.code(202).send({
    job_id: result.data.job.id,
    content_id: result.data.content.id,
    status: result.data.job.status,
  });
}

export async function getContentImage(request: FastifyRequest, reply: FastifyReply) {
  const params = request.params as { id: string };

  const result = await getContentImageUseCase(useCaseDependencies, {
    tenantId: request.tenantId,
    contentImageId: params.id,
  });

  if (!result.ok) {
    return sendUseCaseError(reply, result.error);
  }

  const content = result.data.content;

  return reply.code(200).send({
    id: content.id,
    topic_id: content.topicId,
    text_id: content.textId ?? null,
    status: content.status,
    storage_path: content.storagePath ?? null,
    created_at: content.createdAt.toISOString(),
  });
}
