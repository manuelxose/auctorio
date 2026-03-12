import type { FastifyReply, FastifyRequest } from "fastify";
import { getContentTextUseCase } from "../../domain/usecases";
import { useCaseDependencies } from "../dependencies";
import { sendUseCaseError } from "./common";

export async function getContentText(request: FastifyRequest, reply: FastifyReply) {
  const params = request.params as { id: string };

  const result = await getContentTextUseCase(useCaseDependencies, {
    tenantId: request.tenantId,
    contentTextId: params.id,
  });

  if (!result.ok) {
    return sendUseCaseError(reply, result.error);
  }

  const content = result.data.content;

  return reply.code(200).send({
    id: content.id,
    topic_id: content.topicId,
    type: content.type,
    language: content.language,
    status: content.status,
    output: content.output ?? null,
    created_at: content.createdAt.toISOString(),
  });
}
