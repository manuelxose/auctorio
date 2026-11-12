import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { badRequest, conflict, errorBody, notFound, parseBody, parsePageSize, requireStudioContext } from "./http-utils";
import {
  CopilotError,
  competencyRuns,
  competencyStats,
  deleteThread,
  describeContext,
  getThread,
  listCompetencies,
  listThreads,
  listTools,
  retryMessage,
  sendMessage,
  type CopilotActor,
} from "./copilot/copilot";
import { cancelAction, confirmAction, listActions } from "./copilot/assistant";

/** Copilot threads are per Studio user, so API-key (machine) access is refused. */
async function requireActor(request: FastifyRequest, reply: FastifyReply): Promise<CopilotActor | null> {
  const context = await requireStudioContext(request, reply);
  if (!context) return null;
  if (!context.userId) {
    reply.code(403).send(errorBody(reply, "forbidden", "the copilot requires a Studio user session"));
    return null;
  }
  return { tenantId: context.tenantId, userId: context.userId, permissions: context.permissions };
}

function handle(reply: FastifyReply, error: unknown) {
  if (error instanceof CopilotError) {
    if (error.status === 404) return notFound(reply, error.message);
    if (error.status === 409) return conflict(reply, error.message);
    if (error.status === 403) return reply.code(403).send(errorBody(reply, "forbidden", error.message));
    return badRequest(reply, error.message);
  }
  throw error;
}

/** True once the browser has gone away (Stop button, closed tab). */
function abortedProbe(reply: FastifyReply) {
  let aborted = false;
  reply.raw.on("close", () => {
    if (!reply.raw.writableEnded) aborted = true;
  });
  return () => aborted;
}

export function registerCopilotRoutes(fastify: FastifyInstance) {
  fastify.get("/v2/copilot/competencies", async (request, reply) => {
    const actor = await requireActor(request, reply);
    if (!actor) return;
    return reply.send({ items: listCompetencies(actor), stats: await competencyStats(actor) });
  });

  fastify.get("/v2/copilot/runs", async (request, reply) => {
    const actor = await requireActor(request, reply);
    if (!actor) return;
    const query = request.query as { key?: string; limit?: string };
    return reply.send({ items: await competencyRuns(actor, { key: query.key, limit: parsePageSize(query.limit, 20, 100) }) });
  });

  fastify.get("/v2/copilot/threads", async (request, reply) => {
    const actor = await requireActor(request, reply);
    if (!actor) return;
    return reply.send({ items: await listThreads(actor, (request.query as { q?: string }).q) });
  });

  fastify.get("/v2/copilot/threads/:id", async (request, reply) => {
    const actor = await requireActor(request, reply);
    if (!actor) return;
    try {
      return reply.send(await getThread(actor, (request.params as { id: string }).id));
    } catch (error) {
      return handle(reply, error);
    }
  });

  fastify.delete("/v2/copilot/threads/:id", async (request, reply) => {
    const actor = await requireActor(request, reply);
    if (!actor) return;
    try {
      await deleteThread(actor, (request.params as { id: string }).id);
      return reply.send({ ok: true });
    } catch (error) {
      return handle(reply, error);
    }
  });

  fastify.post("/v2/copilot/messages", async (request, reply) => {
    const actor = await requireActor(request, reply);
    if (!actor) return;
    const isAborted = abortedProbe(reply);
    try {
      return reply.send(await sendMessage(actor, parseBody(request), isAborted));
    } catch (error) {
      return handle(reply, error);
    }
  });

  fastify.post("/v2/copilot/messages/:id/retry", async (request, reply) => {
    const actor = await requireActor(request, reply);
    if (!actor) return;
    const isAborted = abortedProbe(reply);
    try {
      return reply.send(await retryMessage(actor, (request.params as { id: string }).id, isAborted));
    } catch (error) {
      return handle(reply, error);
    }
  });

  fastify.get("/v2/copilot/tools", async (request, reply) => {
    const actor = await requireActor(request, reply);
    if (!actor) return;
    return reply.send({ items: listTools(actor) });
  });

  /** Resolves the client's selection (ids only) server-side, with tenant checks, for the context chip. */
  fastify.post("/v2/copilot/context", async (request, reply) => {
    const actor = await requireActor(request, reply);
    if (!actor) return;
    try {
      return reply.send(await describeContext(actor, parseBody(request)));
    } catch (error) {
      return handle(reply, error);
    }
  });

  fastify.get("/v2/copilot/actions", async (request, reply) => {
    const actor = await requireActor(request, reply);
    if (!actor) return;
    const status = (request.query as { status?: string }).status;
    if (status && !["pending", "executing", "confirmed", "failed", "cancelled"].includes(status)) return badRequest(reply, "invalid status");
    return reply.send({ items: await listActions(actor, status) });
  });

  fastify.post("/v2/copilot/actions/:id/confirm", async (request, reply) => {
    const actor = await requireActor(request, reply);
    if (!actor) return;
    try {
      return reply.send(await confirmAction(actor, (request.params as { id: string }).id));
    } catch (error) {
      return handle(reply, error);
    }
  });

  fastify.post("/v2/copilot/actions/:id/cancel", async (request, reply) => {
    const actor = await requireActor(request, reply);
    if (!actor) return;
    try {
      return reply.send({ action: await cancelAction(actor, (request.params as { id: string }).id) });
    } catch (error) {
      return handle(reply, error);
    }
  });
}
