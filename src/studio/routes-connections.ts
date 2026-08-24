import type { FastifyInstance } from "fastify";
import {
  badRequest,
  isOneOf,
  isUuid,
  notFound,
  parseBody,
  parseOptionalString,
  requireStudioContext,
  requireStudioPermission,
} from "./http-utils";
import { getEnv } from "../shared/utils/env";
import { structuredEvent } from "../shared/utils/logger";
import {
  completeConnectionCallback,
  disconnectSocialConnection,
  listSocialConnections,
  providerAvailability,
  startConnectionSession,
  studioConnectionsUrl,
  verifySocialConnection,
} from "./social-connections";

const SOCIAL_PLATFORMS = ["x", "instagram"] as const;

function callbackBase(): string {
  return `${getEnv("PUBLIC_BASE_URL", "http://localhost:3000")}/v2/social-connections/callback`;
}

export function registerConnectionRoutes(fastify: FastifyInstance) {
  // ── List connections + provider availability

  fastify.get("/v2/social-connections", async (request, reply) => {
    const context = await requireStudioContext(request, reply);
    if (!context) {
      return;
    }
    const query = request.query as { platform?: string };
    if (query.platform && !isOneOf(query.platform, SOCIAL_PLATFORMS)) {
      return badRequest(reply, `platform must be one of: ${SOCIAL_PLATFORMS.join(", ")}`);
    }
    const connections = await listSocialConnections(context.tenantId, query.platform);
    return reply.send({
      items: connections,
      provider: providerAvailability(),
      callbackUrl: callbackBase(),
    });
  });

  // ── Provider setup requirements (for the connect wizard)

  fastify.get("/v2/social-connections/setup", async (request, reply) => {
    const context = await requireStudioContext(request, reply);
    if (!context) {
      return;
    }
    const availability = providerAvailability();
    return reply.send({
      provider: availability,
      callbackUrl: callbackBase(),
      platforms: {
        instagram: {
          ready: availability.configured,
          requirement: availability.configured
            ? "Click Connect Instagram to authorize your account."
            : "A managed social provider (Ayrshare) or a Meta developer app must be configured server-side before Instagram can be connected.",
        },
        x: {
          ready: availability.configured,
          requirement: availability.configured
            ? "Click Connect X to authorize your account."
            : "A managed social provider (Ayrshare) or an X developer application must be configured server-side before X can be connected.",
        },
      },
    });
  });

  // ── Start connection session (OAuth / provider link)

  fastify.post("/v2/social-connections/session", async (request, reply) => {
    const context = await requireStudioPermission(request, reply, "integrations.manage");
    if (!context) {
      return;
    }
    const body = parseBody<{ platform?: string; redirectUri?: string; siteId?: string }>(request);
    if (!body.platform || !isOneOf(body.platform, SOCIAL_PLATFORMS)) {
      return badRequest(reply, `platform must be one of: ${SOCIAL_PLATFORMS.join(", ")}`);
    }
    const redirectUri = parseOptionalString(body.redirectUri) ?? callbackBase();
    try {
      const session = await startConnectionSession({
        tenantId: context.tenantId,
        userId: context.userId,
        siteId: parseOptionalString(body.siteId) ?? null,
        platform: body.platform,
        redirectUri,
      });
      return reply.code(201).send(session);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      structuredEvent("social.connection.session_failed", { tenantId: context.tenantId, platform: body.platform, error: message }, "warn");
      return reply.code(503).send({ error: { code: "connection_unavailable", message } });
    }
  });

  // ── OAuth callback (public; reached by the platform after authorization)

  fastify.get("/v2/social-connections/callback", async (request, reply) => {
    const query = request.query as Record<string, string | undefined>;
    const platform = query.platform?.trim().toLowerCase();
    if (platform !== "x" && platform !== "instagram") {
      return badRequest(reply, "platform query parameter (x or instagram) is required");
    }
    try {
      await completeConnectionCallback(platform, query);
      return reply.redirect(studioConnectionsUrl("connected"));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      structuredEvent("social.connection.callback_failed", { platform, error: message }, "warn");
      const target = new URL(studioConnectionsUrl("error"));
      target.searchParams.set("reason", message.slice(0, 160));
      return reply.redirect(target.toString());
    }
  });

  // ── Verify a connection

  fastify.post("/v2/social-connections/:id/verify", async (request, reply) => {
    const context = await requireStudioPermission(request, reply, "integrations.manage");
    if (!context) {
      return;
    }
    const accountId = (request.params as { id: string }).id;
    if (!isUuid(accountId)) {
      return badRequest(reply, "invalid connection id");
    }
    try {
      const result = await verifySocialConnection(context.tenantId, accountId);
      return reply.send(result);
    } catch (error) {
      if (error instanceof Error && error.message === "connection_not_found") {
        return notFound(reply, "connection not found");
      }
      throw error;
    }
  });

  // ── Reconnect (new authorization session)

  fastify.post("/v2/social-connections/:id/reconnect", async (request, reply) => {
    const context = await requireStudioPermission(request, reply, "integrations.manage");
    if (!context) {
      return;
    }
    const accountId = (request.params as { id: string }).id;
    if (!isUuid(accountId)) {
      return badRequest(reply, "invalid connection id");
    }
    const prisma = (await import("../infrastructure/db/prisma")).getPrismaClient();
    const account = await prisma.publishingAccount.findFirst({ where: { id: accountId, tenantId: context.tenantId } });
    if (!account) {
      return notFound(reply, "connection not found");
    }
    try {
      const session = await startConnectionSession({
        tenantId: context.tenantId,
        userId: context.userId,
        siteId: account.siteId,
        platform: account.platform as "x" | "instagram",
        redirectUri: callbackBase(),
      });
      return reply.send(session);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return reply.code(503).send({ error: { code: "connection_unavailable", message } });
    }
  });

  // ── Disconnect

  fastify.delete("/v2/social-connections/:id", async (request, reply) => {
    const context = await requireStudioPermission(request, reply, "integrations.manage");
    if (!context) {
      return;
    }
    const accountId = (request.params as { id: string }).id;
    if (!isUuid(accountId)) {
      return badRequest(reply, "invalid connection id");
    }
    try {
      await disconnectSocialConnection(context.tenantId, accountId);
      return reply.send({ ok: true });
    } catch (error) {
      if (error instanceof Error && error.message === "connection_not_found") {
        return notFound(reply, "connection not found");
      }
      throw error;
    }
  });
}
