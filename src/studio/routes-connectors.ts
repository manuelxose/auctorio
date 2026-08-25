import type { FastifyInstance } from "fastify";
import crypto from "node:crypto";
import {
  badRequest,
  conflict,
  isOneOf,
  isUuid,
  notFound,
  parseBody,
  parseOptionalString,
  requireStudioContext,
  requireStudioPermission,
} from "./http-utils";
import { structuredEvent } from "../shared/utils/logger";
import {
  connectorCapabilityView,
  getConnectorDescriptor,
} from "./connectors/registry";
import { discoverWebsite, normalizeDestinationUrl } from "./connectors/discovery";
import { verificationProbePlan } from "./connectors/verification";
import {
  cancelInstallation,
  createInstallation,
  deleteInstallationDraft,
  getInstallation,
  listInstallations,
  storeInstallationCredentials,
  toInstallationView,
  transitionInstallation,
  type InstallationView,
} from "./connectors/installation";
import { createOperation } from "./operations";
import { enqueueConnectionJob } from "../infrastructure/queue/producer";
import { getPrismaClient } from "../infrastructure/db/prisma";
import { startConnectionSession } from "./social-connections";
import { publishEvent } from "./events";
import { notify } from "./notifications";

const prisma = getPrismaClient();

const KINDS = ["website", "x", "instagram"] as const;
const STATES = [
  "draft",
  "discovering",
  "credentials_required",
  "verifying",
  "ready",
  "active",
  "failed",
  "expired",
  "disabled",
  "cancelled",
] as const;

function siteKeyForOrigin(origin: string): string {
  try {
    return new URL(origin).hostname.replace(/[^a-z0-9-]/gi, "-").toLowerCase().slice(0, 48);
  } catch {
    return `site-${crypto.randomBytes(4).toString("hex")}`;
  }
}

export function registerConnectorRoutes(fastify: FastifyInstance) {
  // ── Connector capability metadata (rendered by the wizard, never hard-coded)

  fastify.get("/v2/connectors/capabilities", async (request, reply) => {
    const context = await requireStudioContext(request, reply);
    if (!context) {
      return;
    }
    return reply.send({ kinds: connectorCapabilityView() });
  });

  // ── Website discovery (synchronous, SSRF-safe, never marks connected)

  fastify.post("/v2/connectors/discover-website", async (request, reply) => {
    const context = await requireStudioContext(request, reply);
    if (!context) {
      return;
    }
    const body = parseBody<{ url?: string }>(request);
    const rawUrl = parseOptionalString(body.url);
    if (!rawUrl) {
      return badRequest(reply, "url is required");
    }
    try {
      const result = await discoverWebsite(rawUrl);
      return reply.send(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return badRequest(reply, message);
    }
  });

  // ── Installations

  fastify.get("/v2/connector-installations", async (request, reply) => {
    const context = await requireStudioContext(request, reply);
    if (!context) {
      return;
    }
    const query = request.query as { kind?: string; state?: string };
    if (query.kind && !isOneOf(query.kind, KINDS)) {
      return badRequest(reply, `kind must be one of: ${KINDS.join(", ")}`);
    }
    if (query.state && !isOneOf(query.state, STATES)) {
      return badRequest(reply, `state must be one of: ${STATES.join(", ")}`);
    }
    const items = await listInstallations(context.tenantId, {
      ...(query.kind ? { kind: query.kind as "website" | "x" | "instagram" } : {}),
      ...(query.state ? { state: query.state as (typeof STATES)[number] } : {}),
    });
    return reply.send({ items });
  });

  fastify.post("/v2/connector-installations", async (request, reply) => {
    const context = await requireStudioPermission(request, reply, "integrations.manage");
    if (!context) {
      return;
    }
    const body = parseBody<{ kind?: string; provider?: string; siteId?: string; displayName?: string }>(request);
    if (!body.kind || !isOneOf(body.kind, KINDS)) {
      return badRequest(reply, `kind must be one of: ${KINDS.join(", ")}`);
    }
    if (!body.provider) {
      return badRequest(reply, "provider is required");
    }
    const descriptor = getConnectorDescriptor(body.provider);
    if (!descriptor || descriptor.kind !== body.kind) {
      return badRequest(reply, `unknown provider ${body.provider} for kind ${body.kind}`);
    }
    try {
      const installation = await createInstallation({
        tenantId: context.tenantId,
        siteId: parseOptionalString(body.siteId) ?? null,
        kind: body.kind,
        provider: body.provider,
        displayName: body.displayName ?? null,
        userId: context.userId,
      });
      await publishEvent({
        tenantId: context.tenantId,
        type: "connection.installation.state",
        payload: { installationId: installation.id, state: "draft" },
      });
      return reply.code(201).send(installation);
    } catch (error) {
      return badRequest(reply, String(error));
    }
  });

  fastify.get("/v2/connector-installations/:id", async (request, reply) => {
    const context = await requireStudioContext(request, reply);
    if (!context) {
      return;
    }
    const id = (request.params as { id: string }).id;
    if (!isUuid(id)) {
      return badRequest(reply, "invalid installation id");
    }
    const installation = await getInstallation(context.tenantId, id);
    if (!installation) {
      return notFound(reply, "installation not found");
    }
    const descriptor = getConnectorDescriptor(installation.provider);
    return reply.send({
      installation: toInstallationView(installation),
      descriptor: descriptor
        ? {
            id: descriptor.id,
            name: descriptor.name,
            kind: descriptor.kind,
            capabilities: descriptor.capabilities,
            configSchema: descriptor.configSchema,
            verification: {
              probes: verificationProbePlan(descriptor),
              reversible: descriptor.verification.reversible,
              notes: descriptor.verification.notes,
            },
          }
        : null,
    });
  });

  // ── Start discovery (async via BullMQ)

  fastify.post("/v2/connector-installations/:id/discover", async (request, reply) => {
    const context = await requireStudioPermission(request, reply, "integrations.manage");
    if (!context) {
      return;
    }
    const id = (request.params as { id: string }).id;
    if (!isUuid(id)) {
      return badRequest(reply, "invalid installation id");
    }
    const installation = await getInstallation(context.tenantId, id);
    if (!installation) {
      return notFound(reply, "installation not found");
    }
    const body = parseBody<{ url?: string }>(request);
    const rawUrl = parseOptionalString(body.url) ?? String(((installation.config ?? {}) as Record<string, unknown>).baseUrl ?? "");
    if (!rawUrl) {
      return badRequest(reply, "url is required");
    }
    let normalized: string;
    try {
      normalized = normalizeDestinationUrl(rawUrl);
    } catch (error) {
      return badRequest(reply, error instanceof Error ? error.message : String(error));
    }

    await transitionInstallation(context.tenantId, id, "discovering", {
      userId: context.userId,
      patch: { config: { ...((installation.config ?? {}) as Record<string, unknown>), baseUrl: normalized, inputUrl: rawUrl } },
    });

    const operation = await createOperation({
      tenantId: context.tenantId,
      siteId: installation.siteId,
      type: "connection_installation",
      initiatorUserId: context.userId,
      entityType: "connector_installation",
      entityId: installation.id,
      queueName: "queue_connection",
      metadata: { phase: "discovery" },
    });
    const jobId = crypto.randomUUID();
    await prisma.operation.update({
      where: { id: operation.id },
      data: { jobKey: jobId },
    });
    await enqueueConnectionJob(jobId, {
      kind: "discover",
      installationId: installation.id,
      tenantId: context.tenantId,
      operationId: operation.id,
      siteId: installation.siteId,
    });

    return reply.code(202).send({ operationId: operation.id, state: "discovering" });
  });

  // ── Store credentials (write-only, encrypted at rest)

  fastify.post("/v2/connector-installations/:id/credentials", async (request, reply) => {
    const context = await requireStudioPermission(request, reply, "integrations.manage");
    if (!context) {
      return;
    }
    const id = (request.params as { id: string }).id;
    if (!isUuid(id)) {
      return badRequest(reply, "invalid installation id");
    }
    const installation = await getInstallation(context.tenantId, id);
    if (!installation) {
      return notFound(reply, "installation not found");
    }
    const body = parseBody<{ secrets?: Record<string, string>; config?: Record<string, unknown> }>(request);
    if (!body.secrets || typeof body.secrets !== "object" || Array.isArray(body.secrets)) {
      return badRequest(reply, "secrets object is required");
    }
    if (!body.config || typeof body.config !== "object" || Array.isArray(body.config)) {
      return badRequest(reply, "config object is required");
    }
    try {
      const updated = await storeInstallationCredentials(context.tenantId, id, {
        secrets: body.secrets,
        config: body.config,
        userId: context.userId,
      });
      await publishEvent({
        tenantId: context.tenantId,
        type: "connection.installation.state",
        payload: { installationId: id, state: updated.state },
      });
      return reply.send(sanitizeInstallation(updated));
    } catch (error) {
      return badRequest(reply, String(error));
    }
  });

  // ── Start verification (async)

  fastify.post("/v2/connector-installations/:id/verify", async (request, reply) => {
    const context = await requireStudioPermission(request, reply, "integrations.manage");
    if (!context) {
      return;
    }
    const id = (request.params as { id: string }).id;
    if (!isUuid(id)) {
      return badRequest(reply, "invalid installation id");
    }
    const installation = await getInstallation(context.tenantId, id);
    if (!installation) {
      return notFound(reply, "installation not found");
    }
    if (installation.kind === "x" || installation.kind === "instagram") {
      // Social connections verify through the existing provider flow.
      return badRequest(reply, "social installations verify through the provider authorization flow");
    }
    if (!installation.credentialsCiphertext && !installation.credentialsRef) {
      return conflict(reply, "credentials are required before verification");
    }
    try {
      await transitionInstallation(context.tenantId, id, "verifying", { userId: context.userId });
    } catch (error) {
      if (error instanceof Error && error.name === "InvalidTransitionError") {
        return conflict(reply, error.message);
      }
      throw error;
    }

    const operation = await createOperation({
      tenantId: context.tenantId,
      siteId: installation.siteId,
      type: "connection_verification",
      initiatorUserId: context.userId,
      entityType: "connector_installation",
      entityId: installation.id,
      queueName: "queue_connection",
      metadata: { phase: "verification" },
    });
    const jobId = crypto.randomUUID();
    await prisma.operation.update({
      where: { id: operation.id },
      data: { jobKey: jobId },
    });
    await enqueueConnectionJob(jobId, {
      kind: "verify",
      installationId: installation.id,
      tenantId: context.tenantId,
      operationId: operation.id,
      siteId: installation.siteId,
    });

    return reply.code(202).send({ operationId: operation.id, state: "verifying" });
  });

  // ── Social authorization session (preserves PKCE/state protections)

  fastify.post("/v2/connector-installations/:id/social-session", async (request, reply) => {
    const context = await requireStudioPermission(request, reply, "integrations.manage");
    if (!context) {
      return;
    }
    const id = (request.params as { id: string }).id;
    if (!isUuid(id)) {
      return badRequest(reply, "invalid installation id");
    }
    const installation = await getInstallation(context.tenantId, id);
    if (!installation) {
      return notFound(reply, "installation not found");
    }
    if (installation.kind !== "x" && installation.kind !== "instagram") {
      return badRequest(reply, "only social installations start provider sessions");
    }
    const body = parseBody<{ redirectUri?: string; siteId?: string }>(request);
    try {
      const session = await startConnectionSession({
        tenantId: context.tenantId,
        userId: context.userId,
        siteId: parseOptionalString(body.siteId) ?? installation.siteId,
        platform: installation.kind,
        redirectUri: parseOptionalString(body.redirectUri) ?? "",
      });
      await prisma.connectorInstallation.update({
        where: { id: installation.id },
        data: {
          config: { ...((installation.config ?? {}) as Record<string, unknown>), socialSessionId: session.sessionId },
        },
      });
      return reply.code(201).send(session);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      structuredEvent("connector.social_session_failed", { installationId: id, error: message }, "warn");
      return reply.code(503).send({ error: { code: "connection_unavailable", message } });
    }
  });

  // ── Activate

  fastify.post("/v2/connector-installations/:id/activate", async (request, reply) => {
    const context = await requireStudioPermission(request, reply, "integrations.manage");
    if (!context) {
      return;
    }
    const id = (request.params as { id: string }).id;
    if (!isUuid(id)) {
      return badRequest(reply, "invalid installation id");
    }
    const installation = await getInstallation(context.tenantId, id);
    if (!installation) {
      return notFound(reply, "installation not found");
    }
    const activationStates =
      installation.kind === "x" || installation.kind === "instagram"
        ? ["draft", "credentials_required", "verifying", "ready"]
        : ["ready"];
    if (!activationStates.includes(installation.state)) {
      return conflict(reply, `installation in state ${installation.state} cannot be activated; complete verification first`);
    }

    if (installation.kind === "x" || installation.kind === "instagram") {
      const body = parseBody<{ socialAccountId?: string }>(request);
      const accountId = parseOptionalString(body.socialAccountId);
      if (!accountId || !isUuid(accountId)) {
        return badRequest(reply, "socialAccountId is required to activate a social installation");
      }
      const account = await prisma.publishingAccount.findFirst({
        where: { id: accountId, tenantId: context.tenantId, platform: installation.kind },
      });
      if (!account) {
        return notFound(reply, "social connection not found for this workspace");
      }
      if (account.connectionStatus !== "connected" && account.connectionStatus !== null) {
        return conflict(reply, "the social connection is not healthy; complete authorization first");
      }
      // Social authorization (OAuth callback) counts as verification.
      if (installation.state !== "ready") {
        await transitionInstallation(context.tenantId, id, "ready", { userId: context.userId });
      }
      const activated = await transitionInstallation(context.tenantId, id, "active", {
        userId: context.userId,
        patch: {
          externalAccountId: account.id,
          displayName: account.displayName,
          activatedAt: new Date(),
          siteId: account.siteId ?? installation.siteId,
        },
      });
      await notify({
        tenantId: context.tenantId,
        siteId: activated.siteId,
        category: "connection",
        severity: "success",
        title: "Social connection active",
        message: `${activated.displayName ?? "The account"} is now connected to Auctorio.`,
        entityType: "connector_installation",
        entityId: id,
        actionUrl: "/studio/connections",
        dedupeKey: `installation.${id}.active`,
      });
      return reply.send(sanitizeInstallation(activated));
    }

    // Website activation: create or update the publishing Site behind the
    // installation so the existing publication pipeline can use it.
    const config = (installation.config ?? {}) as Record<string, unknown>;
    const baseUrl = parseOptionalString(config.baseUrl);
    if (!baseUrl) {
      return badRequest(reply, "a destination URL is required to activate a website installation");
    }
    const siteType = installation.provider === "generic_webhook" ? "webhook" : "generic_rest";
    const key = installation.siteId
      ? undefined
      : `${siteKeyForOrigin(baseUrl)}-${crypto.randomBytes(3).toString("hex")}`;
    const site = installation.siteId
      ? await prisma.site.findFirst({ where: { id: installation.siteId, tenantId: context.tenantId } })
      : await prisma.site.upsert({
          where: { tenantId_key: { tenantId: context.tenantId, key: key! } },
          update: {},
          create: {
            tenantId: context.tenantId,
            key: key!,
            name: installation.displayName ?? new URL(baseUrl).hostname,
            type: siteType,
            locale: parseOptionalString(config.locale) ?? "es-ES",
            baseUrl,
          },
        });
    if (!site) {
      return notFound(reply, "linked site not found");
    }

    const activated = await transitionInstallation(context.tenantId, id, "active", {
      userId: context.userId,
      patch: {
        siteId: site.id,
        displayName: installation.displayName ?? site.name,
        activatedAt: new Date(),
      },
    });
    await notify({
      tenantId: context.tenantId,
      siteId: site.id,
      category: "connection",
      severity: "success",
      title: "Website destination active",
      message: `${site.name} is ready to receive publications.`,
      entityType: "connector_installation",
      entityId: id,
      actionUrl: "/studio/connections",
      dedupeKey: `installation.${id}.active`,
    });
    return reply.send(sanitizeInstallation(activated));
  });

  // ── Cancel / resume / delete

  fastify.post("/v2/connector-installations/:id/cancel", async (request, reply) => {
    const context = await requireStudioPermission(request, reply, "integrations.manage");
    if (!context) {
      return;
    }
    const id = (request.params as { id: string }).id;
    if (!isUuid(id)) {
      return badRequest(reply, "invalid installation id");
    }
    const installation = await cancelInstallation(context.tenantId, id, context.userId);
    return reply.send(sanitizeInstallation(installation));
  });

  fastify.post("/v2/connector-installations/:id/resume", async (request, reply) => {
    const context = await requireStudioPermission(request, reply, "integrations.manage");
    if (!context) {
      return;
    }
    const id = (request.params as { id: string }).id;
    if (!isUuid(id)) {
      return badRequest(reply, "invalid installation id");
    }
    const installation = await getInstallation(context.tenantId, id);
    if (!installation) {
      return notFound(reply, "installation not found");
    }
    const resumeState = installation.kind === "website" ? "credentials_required" : "draft";
    const updated = await transitionInstallation(context.tenantId, id, resumeState, { userId: context.userId });
    return reply.send(sanitizeInstallation(updated));
  });

  fastify.delete("/v2/connector-installations/:id", async (request, reply) => {
    const context = await requireStudioPermission(request, reply, "integrations.manage");
    if (!context) {
      return;
    }
    const id = (request.params as { id: string }).id;
    if (!isUuid(id)) {
      return badRequest(reply, "invalid installation id");
    }
    try {
      await deleteInstallationDraft(context.tenantId, id, context.userId);
      return reply.send({ ok: true });
    } catch (error) {
      return conflict(reply, String(error));
    }
  });

  // ── Resumable installations hint for the hub

  fastify.get("/v2/connectors/resume-hint", async (request, reply) => {
    const context = await requireStudioContext(request, reply);
    if (!context) {
      return;
    }
    const pending = await listInstallations(context.tenantId, {});
    const resumable = pending.filter((item) => ["draft", "discovering", "credentials_required", "verifying", "ready", "failed", "cancelled"].includes(item.state));
    return reply.send({ resumable: resumable.map(sanitizeInstallation) });
  });
}

function sanitizeInstallation(installation: InstallationView): InstallationView {
  return installation;
}
