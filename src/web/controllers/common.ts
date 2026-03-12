import type { FastifyReply, FastifyRequest } from "fastify";
import { nowIso } from "../../shared/utils/ids";
import type { UseCaseError } from "../../domain/usecases";

export function sendNotImplemented(reply: FastifyReply, message: string) {
  return reply.code(501).send({ error: "not_implemented", message });
}

export function sendJobAccepted(reply: FastifyReply, jobId: string, status = "queued") {
  return reply.code(202).send({
    job_id: jobId,
    status,
  });
}

export function sendContentAccepted(
  reply: FastifyReply,
  jobId: string,
  contentId: string,
  status = "queued",
) {
  return reply.code(202).send({
    job_id: jobId,
    content_id: contentId,
    status,
  });
}

export function sendTopicCreated(
  reply: FastifyReply,
  topic: { id: string; title: string; description?: string | null; createdAt?: Date },
) {
  return reply.code(201).send({
    id: topic.id,
    title: topic.title,
    description: topic.description ?? null,
    status: "active",
    created_at: topic.createdAt ? topic.createdAt.toISOString() : nowIso(),
  });
}

export function sendUseCaseError(reply: FastifyReply, error: UseCaseError) {
  const status = mapErrorCodeToStatus(error.code);
  const payload: Record<string, unknown> = {
    error: error.code,
    message: error.message,
  };

  if (error.details) {
    payload.details = error.details;
  }

  return reply.code(status).send(payload);
}

export function getIdempotencyKey(request: FastifyRequest): string | undefined {
  const header = request.headers["idempotency-key"];
  if (!header) {
    return undefined;
  }
  if (Array.isArray(header)) {
    return header[0];
  }
  return header;
}

function mapErrorCodeToStatus(code: string): number {
  switch (code) {
    case "bad_request":
      return 400;
    case "unauthorized":
      return 401;
    case "forbidden":
      return 403;
    case "not_found":
      return 404;
    case "conflict":
      return 409;
    case "budget_exceeded":
      return 402;
    default:
      return 500;
  }
}
