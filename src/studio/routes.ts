import { promises as fs } from "node:fs";
import path from "node:path";
import { Prisma } from "@prisma/client";
import type { ProjectGoal, ProjectStatus, PublicationStatus, SiteType } from "@prisma/client";
import { Queue } from "bullmq";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import Redis from "ioredis";
import { getPrismaClient } from "../infrastructure/db/prisma";
import { QUEUE_NAMES } from "../infrastructure/queue/queues";
import { getRedisConnectionOptions } from "../infrastructure/queue/redis";
import { getEnv } from "../shared/utils/env";
import { getContentTypeFromPath } from "../shared/utils/mime";
import { writeAudit } from "./audit";
import {
  approveVersion,
  createProject,
  createPublicationJob,
  findPublicationJobByIdempotency,
  resetPublicationJobForRetry,
  getLatestPublishedExternalId,
  createSite,
  getLatestVersion,
  getProjectById,
  getPublicationJobById,
  getSiteById,
  listMediaImages,
  listProjects,
  listPublicationJobs,
  listSites,
  updateProject,
  updateProjectStatus,
  updateSite,
  updateVersionContent,
  updateVersionQa,
} from "./repository";
import {
  acceptStudioInvitation,
  assignStudioRoleToUser,
  buildApiKeyStudioSession,
  completeStudioSsoLogin,
  createStudioLaunchTicket,
  getStudioLoginOptions,
  getInternalStudioIdentityProviderBySlug,
  getInternalStudioWorkspaceAccessBySlug,
  getStudioIdentityProviderConfig,
  loginStudioAccountWithGoogle,
  loginStudioAccountWithPassword,
  loginStudioAccountWithGoogleGlobal,
  loginStudioAccountWithPasswordGlobal,
  getStudioSessionBySessionId,
  getStudioSessionByToken,
  inviteStudioUser,
  listStudioRoles,
  listStudioUsers,
  removeStudioRoleFromUser,
  revokeStudioSessionByToken,
  redeemStudioLaunchTicket,
  resetStudioPassword,
  sendStudioPasswordReset,
  upsertStudioIdentityProvider,
  updateStudioRole,
  updateStudioUser,
  createStudioRole,
  resolveTenantBySlug,
} from "./auth";
import {
  buildAssetPublicUrl,
  queuePublication,
  requestImageGenerationForVersion,
  retryImageGeneration,
  startProjectGeneration,
} from "./orchestration";
import { archiveProject } from "./projects";
import { linkDurableWebsitePublication } from "./publication";
import { runVersionQaV2 } from "./qa";
import { getStudioGoogleClientId } from "./google";
import {
  approveStudioPromptVersion,
  assignStudioPromptVersion,
  createStudioPromptPreset,
  createStudioPromptVersion,
  getStudioPromptPresetDetail,
  listStudioPromptPresets,
  updateStudioPromptVersion,
} from "./prompts";
import { isHeroImageReady } from "./review";
import { hasStudioPermission, type StudioPermission } from "./security";
import type {
  AssignStudioPromptInput,
  CreateProjectInput,
  CreateSiteInput,
  CreateStudioInvitationInput,
  CreateStudioPromptPresetInput,
  CreateStudioPromptVersionInput,
  CreateStudioRoleInput,
  PublicationPayload,
  PublicationTargetStatus,
  UpdateStudioIdentityProviderInput,
  UpdateProjectInput,
  UpdateStudioPromptVersionInput,
  UpdateStudioRoleInput,
  UpdateStudioUserInput,
  UpdateSiteInput,
} from "./types";
import {
  badRequest,
  conflict,
  errorBody,
  isOneOf,
  isUuid,
  notFound,
  parseBody,
  parseJsonObjectField,
  parseOptionalString,
  parsePage,
  parsePageSize,
  parsePermissionList,
  readSingleHeader,
  requireInternalSecret,
  requireStudioContext,
  requireStudioPermission,
  STUDIO_TENANT_HEADER,
  STUDIO_USER_HEADER,
  STUDIO_SESSION_HEADER,
  STUDIO_PERMISSIONS_HEADER,
  STUDIO_SIGNATURE_HEADER,
  STUDIO_TIMESTAMP_HEADER,
} from "./http-utils";
import {
  buildProjectReviewGate,
  mapPublicationState,
  mapQaState,
  toProjectDetail,
  toVersionSummary,
  type ProjectRecord,
  type ProjectVersionRecord,
  type PublicationRecord,
} from "./views";
import { registerEditorialRoutes } from "./routes-editorial";
import { registerConnectionRoutes } from "./routes-connections";
import { registerConnectorRoutes } from "./routes-connectors";
import { registerOperationRoutes } from "./routes-operations";
import { registerNotificationRoutes } from "./routes-notifications";
import { registerEventRoutes } from "./routes-events";
import { registerDiscoveryRoutes } from "./routes-discovery";
import { registerSiteIntelligenceRoutes } from "./routes-site-intelligence";

const SITE_TYPES: SiteType[] = ["guiatv", "tecnoria", "talkaris", "webhook"];
const PROJECT_GOALS: ProjectGoal[] = [
  "article",
  "landing",
  "comparison",
  "faq",
  "newsletter",
  "social_pack",
  "news_article",
];
const PROJECT_STATUSES: ProjectStatus[] = [
  "draft",
  "ai_generated",
  "qa_failed",
  "qa_passed",
  "in_review",
  "approved",
  "publish_queued",
  "published",
  "publish_failed",
];
const CONTENT_STATUSES = ["queued", "processing", "done", "failed", "retryable", "canceled"] as const;
const PUBLICATION_STATUSES: PublicationStatus[] = [
  "queued",
  "processing",
  "draft_synced",
  "published",
  "failed",
  "canceled",
];
const STUDIO_USER_STATUSES = ["invited", "active", "suspended"] as const;
const STUDIO_PROMPT_SURFACES = [
  "text_seo",
  "text_instagram",
  "image_contextual",
  "image_independent",
] as const;
const STUDIO_PROMPT_SCOPES = ["global", "site"] as const;
const STUDIO_PROMPT_VERSION_STATUSES = ["draft", "approved", "deprecated"] as const;
const STUDIO_PROVISIONING_MODES = ["invite_only"] as const;

const prisma = getPrismaClient();

function authErrorReply(reply: FastifyReply, status: number, message: string) {
  return reply.code(status).send(errorBody(reply, "auth_error", message));
}

function getAuthErrorStatus(message: string): number {
  if (
    [
      "email_required",
      "password_required",
      "workspace_selection_required",
      "workspace_not_authorized",
      "google_login_not_configured",
      "google_identity_invalid",
      "google_email_not_verified",
      "invite_invalid",
      "invite_expired",
      "invite_consumed",
      "reset_invalid",
      "reset_expired",
      "reset_consumed",
      "password_too_short",
    ].includes(message)
  ) {
    return 400;
  }

  if (
    [
      "invalid_credentials",
      "activation_required",
      "password_login_not_available",
      "user_not_authorized",
      "user_suspended",
      "google_subject_mismatch",
    ].includes(message)
  ) {
    return 403;
  }

  return 500;
}

function parsePublicationTargetStatus(value: unknown): PublicationTargetStatus | null {
  return value === "draft" || value === "publish" ? value : null;
}

async function handleReadyCheck() {
  const prisma = getPrismaClient();
  await prisma.$queryRaw`SELECT 1`;

  const redis = new Redis(getRedisConnectionOptions());
  try {
    await redis.ping();
  } finally {
    redis.disconnect();
  }

  const storageRoot = path.resolve(getEnv("STORAGE_ROOT", "/var/www/auctorio/storage"));
  const probePath = path.join(storageRoot, ".health-probe");
  await fs.writeFile(probePath, `${Date.now()}`);
  await fs.unlink(probePath);
}

type DestinationHealth = {
  siteId: string;
  siteKey: string;
  siteType: string;
  baseUrl: string | null;
  reachable: boolean;
  status: number | null;
  latencyMs: number | null;
  error: string | null;
};

async function checkDestinationHealth(): Promise<DestinationHealth[]> {
  const prisma = getPrismaClient();
  const sites = await prisma.site.findMany({ select: { id: true, key: true, type: true, baseUrl: true } });

  return Promise.all(
    sites.map(async (site): Promise<DestinationHealth> => {
      const baseUrl = String(site.baseUrl || "").trim();
      if (!baseUrl) {
        return {
          siteId: site.id,
          siteKey: site.key,
          siteType: site.type,
          baseUrl: null,
          reachable: false,
          status: null,
          latencyMs: null,
          error: "no baseUrl configured",
        };
      }

      const startedAt = Date.now();
      try {
        const response = await fetch(baseUrl, {
          signal: AbortSignal.timeout(6_000),
          redirect: "follow",
        });
        return {
          siteId: site.id,
          siteKey: site.key,
          siteType: site.type,
          baseUrl,
          reachable: response.ok,
          status: response.status,
          latencyMs: Date.now() - startedAt,
          error: response.ok ? null : `HTTP ${response.status}`,
        };
      } catch (error) {
        return {
          siteId: site.id,
          siteKey: site.key,
          siteType: site.type,
          baseUrl,
          reachable: false,
          status: null,
          latencyMs: Date.now() - startedAt,
          error: (error as { cause?: { code?: string } })?.cause?.code || (error as Error).message,
        };
      }
    }),
  );
}

async function serveAsset(request: FastifyRequest, reply: FastifyReply) {
  const params = request.params as { "*": string };
  const storageRoot = path.resolve(getEnv("STORAGE_ROOT", "/var/www/auctorio/storage"));
  const rawPath = String(params["*"] || "").replace(/^\/+/, "");
  const absolutePath = path.resolve(storageRoot, rawPath);

  if (!absolutePath.startsWith(storageRoot)) {
    return reply.code(400).send({ error: "bad_request", message: "Invalid asset path" });
  }

  try {
    const file = await fs.readFile(absolutePath);
    reply.header("content-type", getContentTypeFromPath(absolutePath));
    reply.header("cache-control", "public, max-age=86400");
    return reply.send(file);
  } catch {
    return notFound(reply, "asset not found");
  }
}

export function registerStudioRoutes(fastify: FastifyInstance) {
  registerEditorialRoutes(fastify);
  registerConnectionRoutes(fastify);
  registerDiscoveryRoutes(fastify);
  registerSiteIntelligenceRoutes(fastify);
  registerConnectorRoutes(fastify);
  registerOperationRoutes(fastify);
  registerNotificationRoutes(fastify);
  registerEventRoutes(fastify);

  fastify.get("/health/live", async () => ({ status: "ok" }));

  fastify.get("/health/ready", async (_request, reply) => {
    try {
      await handleReadyCheck();
      return reply.send({ status: "ok" });
    } catch (error) {
      return reply.code(503).send({
        status: "degraded",
        message: String(error),
      });
    }
  });

  fastify.get("/health/queues", async (_request, reply) => {
    const entries = await Promise.all(
      Object.entries(QUEUE_NAMES).map(async ([key, queueName]) => {
        const queue = new Queue(queueName, { connection: getRedisConnectionOptions() });
        try {
          const counts = await queue.getJobCounts("waiting", "active", "delayed", "failed", "completed");
          const oldest = await queue.getJobs(["waiting", "delayed"], 0, 0, true);
          const oldestWaiting = oldest[0];
          return {
            key,
            queueName,
            counts,
            oldestWaitingAgeMs: oldestWaiting?.timestamp
              ? Math.max(0, Date.now() - oldestWaiting.timestamp)
              : null,
          };
        } catch (error) {
          return {
            key,
            queueName,
            counts: null,
            oldestWaitingAgeMs: null,
            error: error instanceof Error ? error.message : String(error),
          };
        } finally {
          await queue.close();
        }
      }),
    );
    const broken = entries.filter((entry) => "error" in entry);
    return reply.code(broken.length > 0 ? 503 : 200).send({
      status: broken.length > 0 ? "degraded" : "ok",
      queues: entries,
    });
  });

  fastify.get("/health/destinations", async (_request, reply) => {
    try {
      return reply.send({
        status: "ok",
        destinations: await checkDestinationHealth(),
      });
    } catch (error) {
      return reply.code(503).send({
        status: "degraded",
        message: String(error),
      });
    }
  });

  fastify.get("/assets/*", serveAsset);

  fastify.get("/internal/identity-provider/:slug", async (request, reply) => {
    if (!requireInternalSecret(request, reply)) {
      return;
    }

    const slug = (request.params as { slug: string }).slug;
    const provider = await getInternalStudioIdentityProviderBySlug(slug);
    if (!provider) {
      return notFound(reply, "identity provider not found");
    }

    return reply.send(provider);
  });

  fastify.get("/internal/workspace-access/:slug", async (request, reply) => {
    if (!requireInternalSecret(request, reply)) {
      return;
    }

    const slug = (request.params as { slug: string }).slug;
    const access = await getInternalStudioWorkspaceAccessBySlug(slug);
    if (!access) {
      return notFound(reply, "workspace not found");
    }

    return reply.send(access);
  });

  fastify.post("/internal/login/options", async (request, reply) => {
    if (!requireInternalSecret(request, reply)) {
      return;
    }

    const body = parseBody<{ email?: string }>(request);
    const email = body.email?.trim() || "";
    if (!email) {
      return badRequest(reply, "email_required");
    }

    try {
      const options = await getStudioLoginOptions(email);
      return reply.send(options);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return reply.code(getAuthErrorStatus(message)).send({
        error: "auth_error",
        message,
      });
    }
  });

  fastify.post("/internal/login/password", async (request, reply) => {
    if (!requireInternalSecret(request, reply)) {
      return;
    }

    const body = parseBody<{
      email?: string;
      password?: string;
      workspaceId?: string | null;
    }>(request);

    try {
      const result = await loginStudioAccountWithPassword({
        email: body.email?.trim() || "",
        password: body.password || "",
        workspaceId: body.workspaceId?.trim() || null,
      });
      return reply.send(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return reply.code(getAuthErrorStatus(message)).send({
        error: "auth_error",
        message,
      });
    }
  });

  fastify.post("/internal/login/google", async (request, reply) => {
    if (!requireInternalSecret(request, reply)) {
      return;
    }

    const body = parseBody<{
      credential?: string;
      emailHint?: string | null;
      workspaceId?: string | null;
    }>(request);

    try {
      const result = await loginStudioAccountWithGoogle({
        credential: body.credential?.trim() || "",
        emailHint: body.emailHint?.trim() || null,
        workspaceId: body.workspaceId?.trim() || null,
      });
      return reply.send(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return reply.code(getAuthErrorStatus(message)).send({
        error: "auth_error",
        message,
      });
    }
  });

  fastify.get("/internal/auth/providers", async (request, reply) => {
    if (!requireInternalSecret(request, reply)) {
      return;
    }

    return reply.send({
      googleClientId: getStudioGoogleClientId(),
    });
  });

  fastify.post("/internal/session/global-login/password", async (request, reply) => {
    if (!requireInternalSecret(request, reply)) {
      return;
    }

    const body = parseBody<{ email?: string; password?: string }>(request);
    try {
      const result = await loginStudioAccountWithPasswordGlobal({
        email: body.email?.trim() || "",
        password: body.password || "",
      });
      return reply.send(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return reply.code(getAuthErrorStatus(message)).send({
        error: "auth_error",
        message,
      });
    }
  });

  fastify.post("/internal/session/global-login/google", async (request, reply) => {
    if (!requireInternalSecret(request, reply)) {
      return;
    }

    const body = parseBody<{ credential?: string }>(request);
    try {
      const result = await loginStudioAccountWithGoogleGlobal({
        credential: body.credential?.trim() || "",
      });
      return reply.send(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return reply.code(getAuthErrorStatus(message)).send({
        error: "auth_error",
        message,
      });
    }
  });

  fastify.post("/internal/password/forgot", async (request, reply) => {
    if (!requireInternalSecret(request, reply)) {
      return;
    }

    const body = parseBody<{ email?: string }>(request);
    try {
      const result = await sendStudioPasswordReset(body.email?.trim() || "");
      return reply.send(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return reply.code(getAuthErrorStatus(message)).send({
        error: "auth_error",
        message,
      });
    }
  });

  fastify.post("/internal/password/reset", async (request, reply) => {
    if (!requireInternalSecret(request, reply)) {
      return;
    }

    const body = parseBody<{ token?: string; password?: string }>(request);
    try {
      const result = await resetStudioPassword({
        token: body.token?.trim() || "",
        password: body.password || "",
      });
      return reply.send(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return reply.code(getAuthErrorStatus(message)).send({
        error: "auth_error",
        message,
      });
    }
  });

  fastify.post("/internal/invitations/accept", async (request, reply) => {
    if (!requireInternalSecret(request, reply)) {
      return;
    }

    const body = parseBody<{ token?: string; password?: string; workspaceId?: string | null }>(request);
    try {
      const result = await acceptStudioInvitation({
        token: body.token?.trim() || "",
        password: body.password || "",
        workspaceId: body.workspaceId?.trim() || null,
      });
      return reply.send(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return reply.code(getAuthErrorStatus(message)).send({
        error: "auth_error",
        message,
      });
    }
  });

  fastify.post("/internal/launch-tickets", async (request, reply) => {
    if (!requireInternalSecret(request, reply)) {
      return;
    }

    const body = parseBody<{
      workspace?: string;
      email?: string;
      displayName?: string | null;
      returnTo?: string | null;
      sourceApp?: string;
    }>(request);

    if (!body.workspace?.trim() || !body.email?.trim() || !body.sourceApp?.trim()) {
      return badRequest(reply, "workspace, email and sourceApp are required");
    }

    try {
      const ticket = await createStudioLaunchTicket({
        slug: body.workspace.trim(),
        email: body.email.trim(),
        displayName: body.displayName ?? null,
        returnTo: body.returnTo ?? null,
        sourceApp: body.sourceApp.trim(),
      });

      request.log.info(
        {
          workspace: ticket.tenantSlug,
          email: body.email.trim().toLowerCase(),
          returnTo: ticket.returnTo,
          sourceApp: body.sourceApp.trim(),
        },
        "studio_launch_ticket_created",
      );

      return reply.send(ticket);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      request.log.warn(
        {
          workspace: body.workspace?.trim(),
          email: body.email?.trim().toLowerCase(),
          returnTo: body.returnTo ?? null,
          sourceApp: body.sourceApp?.trim(),
          reason: message,
        },
        "studio_launch_ticket_failed",
      );

      if (message === "workspace_not_found") {
        return notFound(reply, message);
      }

      if (
        message === "workspace_launch_not_allowed" ||
        message === "interactive_login_required" ||
        message === "user_not_authorized" ||
        message === "user_suspended"
      ) {
        return reply.code(403).send({ error: "forbidden", message });
      }

      return reply.code(500).send({ error: "internal_error", message });
    }
  });

  fastify.post("/internal/launch-tickets/redeem", async (request, reply) => {
    if (!requireInternalSecret(request, reply)) {
      return;
    }

    const body = parseBody<{ launchId?: string }>(request);
    const launchId = body.launchId?.trim();
    if (!launchId) {
      return badRequest(reply, "launchId is required");
    }

    try {
      const redeemed = await redeemStudioLaunchTicket(launchId);
      request.log.info(
        {
          workspace: redeemed.tenantSlug,
          returnTo: redeemed.returnTo,
          userId: redeemed.session.user.id,
          email: redeemed.session.user.email,
        },
        "studio_launch_ticket_redeemed",
      );
      return reply.send(redeemed);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      request.log.warn({ launchId, reason: message }, "studio_launch_ticket_redeem_failed");

      if (
        message === "launch_invalid" ||
        message === "launch_consumed" ||
        message === "launch_expired"
      ) {
        return reply.code(400).send({ error: "bad_request", message });
      }

      if (message === "user_suspended" || message === "user_not_found") {
        return reply.code(403).send({ error: "forbidden", message });
      }

      return reply.code(500).send({ error: "internal_error", message });
    }
  });

  fastify.post("/internal/session/oidc", async (request, reply) => {
    if (!requireInternalSecret(request, reply)) {
      return;
    }

    const body = parseBody<{
      slug?: string;
      issuer?: string;
      subject?: string;
      claims?: Record<string, unknown>;
    }>(request);

    if (!body.slug?.trim() || !body.issuer?.trim() || !body.subject?.trim()) {
      return badRequest(reply, "slug, issuer and subject are required");
    }

    try {
      const result = await completeStudioSsoLogin({
        slug: body.slug.trim(),
        issuer: body.issuer.trim(),
        subject: body.subject.trim(),
        claims:
          body.claims && typeof body.claims === "object" && !Array.isArray(body.claims)
            ? body.claims
            : {},
      });
      return reply.send(result);
    } catch (error) {
      return reply.code(400).send({
        error: "bad_request",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  fastify.post("/internal/session/validate", async (request, reply) => {
    if (!requireInternalSecret(request, reply)) {
      return;
    }

    const body = parseBody<{ sessionToken?: string }>(request);
    const token = body.sessionToken?.trim();
    if (!token) {
      return badRequest(reply, "sessionToken is required");
    }

    const record = await getStudioSessionByToken(token);
    if (!record) {
      return reply.code(401).send({ error: "unauthorized", message: "Invalid session token" });
    }

    return reply.send(record);
  });

  fastify.post("/internal/session/revoke", async (request, reply) => {
    if (!requireInternalSecret(request, reply)) {
      return;
    }

    const body = parseBody<{ sessionToken?: string }>(request);
    const token = body.sessionToken?.trim();
    if (!token) {
      return badRequest(reply, "sessionToken is required");
    }

    await revokeStudioSessionByToken(token);
    return reply.send({ ok: true });
  });

  fastify.get("/v2/session/me", async (request, reply) => {
    const context = await requireStudioContext(request, reply);
    if (!context) {
      return;
    }

    const session =
      context.authMode === "oidc" && context.sessionId
        ? await getStudioSessionBySessionId(context.sessionId)
        : await buildApiKeyStudioSession(context.tenantId);
    if (!session) {
      return reply.code(401).send({ error: "unauthorized", message: "Invalid studio session" });
    }

    return reply.send(session);
  });

  fastify.get("/v2/sites", async (request, reply) => {
    const context = await requireStudioContext(request, reply);
    if (!context) {
      return;
    }

    const query = request.query as { page?: string; pageSize?: string };
    const page = parsePage(query.page, 1);
    const pageSize = parsePageSize(query.pageSize, 20);
    const sites = await listSites(context.tenantId, page, pageSize);
    return reply.send(sites);
  });

  fastify.post("/v2/sites", async (request, reply) => {
    const context = await requireStudioPermission(request, reply, "integrations.manage");
    if (!context) {
      return;
    }

    const body = parseBody<CreateSiteInput>(request);
    if (!body.key?.trim() || !body.name?.trim() || !body.type) {
      return badRequest(reply, "key, name and type are required");
    }
    if (!isOneOf(body.type, SITE_TYPES)) {
      return badRequest(reply, `type must be one of: ${SITE_TYPES.join(", ")}`);
    }

    try {
      const site = await createSite(context.tenantId, {
        key: body.key.trim(),
        name: body.name.trim(),
        type: body.type,
        locale: body.locale,
        baseUrl: parseOptionalString(body.baseUrl) ?? null,
        brandVoice: parseJsonObjectField(body.brandVoice, "brandVoice") ?? null,
        seoRules: parseJsonObjectField(body.seoRules, "seoRules") ?? null,
        taxonomyMap: parseJsonObjectField(body.taxonomyMap, "taxonomyMap") ?? null,
        publishingCredentialsRef: parseOptionalString(body.publishingCredentialsRef) ?? null,
      });

      return reply.code(201).send(site);
    } catch (error) {
      return badRequest(reply, String(error));
    }
  });

  fastify.get("/v2/sites/:id", async (request, reply) => {
    const context = await requireStudioContext(request, reply);
    if (!context) {
      return;
    }

    const siteId = (request.params as { id: string }).id;
    if (!isUuid(siteId)) {
      return badRequest(reply, "invalid site id");
    }

    const site = await getSiteById(context.tenantId, siteId);
    if (!site) {
      return notFound(reply, "site not found");
    }

    return reply.send(site);
  });

  fastify.put("/v2/sites/:id", async (request, reply) => {
    const context = await requireStudioPermission(request, reply, "integrations.manage");
    if (!context) {
      return;
    }

    const siteId = (request.params as { id: string }).id;
    if (!isUuid(siteId)) {
      return badRequest(reply, "invalid site id");
    }

    const body = parseBody<UpdateSiteInput>(request);
    if (body.type && !isOneOf(body.type, SITE_TYPES)) {
      return badRequest(reply, `type must be one of: ${SITE_TYPES.join(", ")}`);
    }

    try {
      const site = await updateSite(context.tenantId, siteId, {
        name: body.name?.trim(),
        type: body.type,
        locale: body.locale?.trim(),
        baseUrl: parseOptionalString(body.baseUrl),
        brandVoice: parseJsonObjectField(body.brandVoice, "brandVoice"),
        seoRules: parseJsonObjectField(body.seoRules, "seoRules"),
        taxonomyMap: parseJsonObjectField(body.taxonomyMap, "taxonomyMap"),
        publishingCredentialsRef: parseOptionalString(body.publishingCredentialsRef),
      });

      if (!site) {
        return notFound(reply, "site not found");
      }

      return reply.send(site);
    } catch (error) {
      return badRequest(reply, String(error));
    }
  });

  fastify.get("/v2/projects", async (request, reply) => {
    const context = await requireStudioContext(request, reply);
    if (!context) {
      return;
    }

    const query = request.query as {
      siteId?: string;
      status?: string;
      goal?: string;
      page?: string;
      pageSize?: string;
      search?: string;
      origin?: string;
      archived?: string;
    };
    const page = parsePage(query.page, 1);
    const pageSize = parsePageSize(query.pageSize, 20);

    if (query.siteId && !isUuid(query.siteId)) {
      return badRequest(reply, "invalid siteId");
    }
    if (query.status && !isOneOf(query.status, PROJECT_STATUSES)) {
      return badRequest(reply, `status must be one of: ${PROJECT_STATUSES.join(", ")}`);
    }
    if (query.goal && !isOneOf(query.goal, PROJECT_GOALS)) {
      return badRequest(reply, `goal must be one of: ${PROJECT_GOALS.join(", ")}`);
    }
    if (query.origin && !isOneOf(query.origin, ["manual", "auto"] as const)) {
      return badRequest(reply, "origin must be one of: manual, auto");
    }

    const projects = await listProjects(context.tenantId, {
      siteId: query.siteId,
      status: query.status as ProjectStatus | undefined,
      goal: query.goal as ProjectGoal | undefined,
      page,
      pageSize,
      search: parseOptionalString(query.search) ?? undefined,
      origin: query.origin as "manual" | "auto" | undefined,
      includeArchived: query.archived === "true",
    });

    const items = await Promise.all(
      projects.items.map(async (project) => ({
        ...project,
        latestVersion: project.latestVersion
          ? {
              ...project.latestVersion,
              assetUrl: await buildAssetPublicUrl(project.latestVersion.assetUrl),
            }
          : null,
      })),
    );

    return reply.send({
      ...projects,
      items,
    });
  });

  fastify.post("/v2/projects", async (request, reply) => {
    const context = await requireStudioPermission(request, reply, "projects.manage");
    if (!context) {
      return;
    }

    const body = parseBody<CreateProjectInput>(request);
    if (!body.siteId?.trim() || !body.title?.trim() || !body.brief?.trim()) {
      return badRequest(reply, "siteId, title and brief are required");
    }
    if (body.goal && !isOneOf(body.goal, PROJECT_GOALS)) {
      return badRequest(reply, `goal must be one of: ${PROJECT_GOALS.join(", ")}`);
    }

    const site = await getSiteById(context.tenantId, body.siteId);
    if (!site) {
      return notFound(reply, "site not found");
    }

    try {
      const project = await createProject(context.tenantId, {
        siteId: site.id,
        title: body.title.trim(),
        brief: body.brief.trim(),
        goal: body.goal ?? "article",
        primaryLanguage: body.primaryLanguage ?? "es",
        metadata: parseJsonObjectField(body.metadata, "metadata") ?? null,
      });

      return reply.code(201).send(project);
    } catch (error) {
      return badRequest(reply, String(error));
    }
  });

  fastify.put("/v2/projects/:id", async (request, reply) => {
    const context = await requireStudioPermission(request, reply, "projects.manage");
    if (!context) {
      return;
    }

    const projectId = (request.params as { id: string }).id;
    if (!isUuid(projectId)) {
      return badRequest(reply, "invalid project id");
    }

    const body = parseBody<UpdateProjectInput>(request);
    if (
      body.siteId === undefined &&
      body.title === undefined &&
      body.brief === undefined &&
      body.goal === undefined &&
      body.primaryLanguage === undefined &&
      body.metadata === undefined
    ) {
      return badRequest(reply, "at least one project field must be provided");
    }
    if (body.siteId !== undefined && !body.siteId.trim()) {
      return badRequest(reply, "siteId cannot be empty");
    }
    if (body.siteId && !isUuid(body.siteId)) {
      return badRequest(reply, "invalid siteId");
    }
    if (body.title !== undefined && !body.title.trim()) {
      return badRequest(reply, "title cannot be empty");
    }
    if (body.brief !== undefined && !body.brief.trim()) {
      return badRequest(reply, "brief cannot be empty");
    }
    if (body.primaryLanguage !== undefined && !body.primaryLanguage.trim()) {
      return badRequest(reply, "primaryLanguage cannot be empty");
    }
    if (body.goal && !isOneOf(body.goal, PROJECT_GOALS)) {
      return badRequest(reply, `goal must be one of: ${PROJECT_GOALS.join(", ")}`);
    }

    const existingProject = await getProjectById(context.tenantId, projectId);
    if (!existingProject) {
      return notFound(reply, "project not found");
    }

    const nextSiteId = body.siteId?.trim();
    if (nextSiteId && nextSiteId !== existingProject.siteId) {
      const site = await getSiteById(context.tenantId, nextSiteId);
      if (!site) {
        return notFound(reply, "site not found");
      }
    }

    try {
      const parsedMetadata = parseJsonObjectField(body.metadata, "metadata");

      await updateProject(context.tenantId, projectId, {
        siteId: nextSiteId,
        title: body.title?.trim(),
        brief: body.brief?.trim(),
        goal: body.goal,
        primaryLanguage: body.primaryLanguage?.trim(),
        metadata: parsedMetadata,
      });

      const updatedProject = await getProjectById(context.tenantId, projectId);
      if (!updatedProject) {
        return notFound(reply, "project not found");
      }

      return reply.send(await toProjectDetail(updatedProject));
    } catch (error) {
      return badRequest(reply, String(error));
    }
  });

  fastify.get("/v2/projects/:id", async (request, reply) => {
    const context = await requireStudioContext(request, reply);
    if (!context) {
      return;
    }

    const projectId = (request.params as { id: string }).id;
    if (!isUuid(projectId)) {
      return badRequest(reply, "invalid project id");
    }

    const project = await getProjectById(context.tenantId, projectId);
    if (!project) {
      return notFound(reply, "project not found");
    }

    return reply.send(await toProjectDetail(project));
  });

  fastify.post("/v2/projects/:id/generate", async (request, reply) => {
    const context = await requireStudioPermission(request, reply, "projects.manage");
    if (!context) {
      return;
    }

    const projectId = (request.params as { id: string }).id;
    if (!isUuid(projectId)) {
      return badRequest(reply, "invalid project id");
    }
    const project = await getProjectById(context.tenantId, projectId);
    if (!project) {
      return notFound(reply, "project not found");
    }

    const body = parseBody<{ feedback?: string; promptPresetVersionId?: string }>(request);
    const result = await startProjectGeneration(
      project.id,
      context.tenantId,
      body.feedback ?? null,
      body.promptPresetVersionId?.trim() || null,
    );
    return reply.code(202).send({
      project_id: project.id,
      version_id: result.versionId,
      content_text_id: result.contentTextId,
      job_id: result.jobId,
      status: "queued",
    });
  });

  fastify.post("/v2/projects/:id/revise", async (request, reply) => {
    const context = await requireStudioPermission(request, reply, "projects.manage");
    if (!context) {
      return;
    }

    const projectId = (request.params as { id: string }).id;
    if (!isUuid(projectId)) {
      return badRequest(reply, "invalid project id");
    }

    const body = parseBody<{ feedback?: string }>(request);
    if (!body.feedback?.trim()) {
      return badRequest(reply, "feedback is required");
    }

    const project = await getProjectById(context.tenantId, projectId);
    if (!project) {
      return notFound(reply, "project not found");
    }

    const result = await startProjectGeneration(
      project.id,
      context.tenantId,
      body.feedback.trim(),
      null,
    );
    return reply.code(202).send({
      project_id: project.id,
      version_id: result.versionId,
      content_text_id: result.contentTextId,
      job_id: result.jobId,
      status: "queued",
    });
  });

  fastify.post("/v2/projects/:id/approve", async (request, reply) => {
    const context = await requireStudioPermission(request, reply, "review.approve");
    if (!context) {
      return;
    }

    const projectId = (request.params as { id: string }).id;
    if (!isUuid(projectId)) {
      return badRequest(reply, "invalid project id");
    }
    const project = await getProjectById(context.tenantId, projectId);
    if (!project) {
      return notFound(reply, "project not found");
    }

    const latestVersion = project.versions[0];
    if (!latestVersion) {
      return badRequest(reply, "project has no versions");
    }
    const reviewGate = buildProjectReviewGate(project);
    if (!reviewGate.approvalReady) {
      return badRequest(reply, reviewGate.primaryConcern || "latest version is not ready for approval");
    }

    await approveVersion(
      context.tenantId,
      project.id,
      latestVersion.id,
      context.userId ? "studio_user" : "studio",
      context.userId,
    );
    return reply.send({
      project_id: project.id,
      version_id: latestVersion.id,
      status: "approved",
    });
  });

  fastify.post("/v2/projects/:id/publish", async (request, reply) => {
    const context = await requireStudioPermission(request, reply, "publishing.manage");
    if (!context) {
      return;
    }

    const projectId = (request.params as { id: string }).id;
    if (!isUuid(projectId)) {
      return badRequest(reply, "invalid project id");
    }
    const body = parseBody<PublicationPayload>(request);
    const action = body.action ?? "publish";
    const targetStatus = body.targetStatus ?? "publish";
    if (!isOneOf(action, ["publish", "update", "unpublish"] as const)) {
      return badRequest(reply, "action must be one of: publish, update, unpublish");
    }
    if (!isOneOf(targetStatus, ["draft", "publish"] as const)) {
      return badRequest(reply, "targetStatus must be one of: draft, publish");
    }

    const project = await getProjectById(context.tenantId, projectId);
    if (!project) {
      return notFound(reply, "project not found");
    }

    const latestVersion = project.versions[0];
    if (!latestVersion) {
      return badRequest(reply, "project has no versions");
    }
    const reviewGate = buildProjectReviewGate(project);

    if (
      action !== "unpublish" &&
      !reviewGate.publishReady
    ) {
      return badRequest(reply, reviewGate.primaryConcern || "latest version is not ready for publishing");
    }

    const latestExternalId = await getLatestPublishedExternalId(
      context.tenantId,
      project.site.id,
      project.id,
    );
    if (action === "unpublish" && !latestExternalId) {
      return badRequest(reply, "project has no published or synced external content");
    }

    const idempotencyKey = [
      "pub",
      project.site.id,
      project.id,
      latestVersion.id,
      action,
      targetStatus,
    ].join(":");

    const existing = await findPublicationJobByIdempotency(context.tenantId, idempotencyKey);
    if (existing) {
      if (existing.status === "queued" || existing.status === "processing") {
        await queuePublication(existing.id);
        return reply.code(202).send({
          publication_id: existing.id,
          project_id: project.id,
          version_id: latestVersion.id,
          status: existing.status,
          reused: true,
        });
      }

      if (existing.status === "draft_synced" || existing.status === "published") {
        return reply.code(202).send({
          publication_id: existing.id,
          project_id: project.id,
          version_id: latestVersion.id,
          status: existing.status,
          reused: true,
        });
      }

      const retried = await resetPublicationJobForRetry(
        existing.id,
        {
          action,
          targetStatus,
          requestedBy: context.userId ? "studio_user" : "studio",
        },
        context.userId,
      );
      await updateProjectStatus(context.tenantId, project.id, "publish_queued");
      await queuePublication(retried.id);

      return reply.code(202).send({
        publication_id: retried.id,
        project_id: project.id,
        version_id: latestVersion.id,
        status: "queued",
        retried: true,
      });
    }

    const publication = await createPublicationJob(
      context.tenantId,
      project.site.id,
      project.id,
      latestVersion.id,
      action,
      {
        action,
        targetStatus,
        requestedBy: context.userId ? "studio_user" : "studio",
      },
      context.userId,
      idempotencyKey,
    );
    await updateProjectStatus(context.tenantId, project.id, "publish_queued");
    await queuePublication(publication.id);

    if (action === "publish" || action === "update") {
      await linkDurableWebsitePublication(
        context.tenantId,
        project.site.id,
        project.id,
        latestVersion.id,
        publication.id,
      );
    }

    return reply.code(202).send({
      publication_id: publication.id,
      project_id: project.id,
      version_id: latestVersion.id,
      status: "queued",
    });
  });

  fastify.delete("/v2/projects/:id", async (request, reply) => {
    const context = await requireStudioPermission(request, reply, "projects.manage");
    if (!context) {
      return;
    }

    const projectId = (request.params as { id: string }).id;
    if (!isUuid(projectId)) {
      return badRequest(reply, "invalid project id");
    }
    const body = parseBody<{ reason?: string; mode?: "archive" | "unpublish_delete" }>(request);
    const mode = body.mode ?? "archive";

    try {
      const result = await archiveProject(
        context.tenantId,
        projectId,
        {
          reason: parseOptionalString(body.reason),
          mode,
          actorUserId: context.userId,
        },
      );
      return reply.send(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message === "project_not_found") {
        return notFound(reply, message);
      }
      if (message === "project_has_scheduled_publications") {
        return conflict(reply, message);
      }
      return badRequest(reply, message);
    }
  });

  fastify.post("/v2/projects/:id/restore", async (request, reply) => {
    const context = await requireStudioPermission(request, reply, "projects.manage");
    if (!context) {
      return;
    }

    const projectId = (request.params as { id: string }).id;
    if (!isUuid(projectId)) {
      return badRequest(reply, "invalid project id");
    }

    const project = await getProjectById(context.tenantId, projectId);
    if (!project) {
      return notFound(reply, "project not found");
    }
    if (!project.deletedAt) {
      return conflict(reply, "project is not archived");
    }

    await prisma.contentProject.update({
      where: { id: project.id },
      data: {
        deletedAt: null,
        deletedBy: null,
        deletedByStudioUserId: null,
        deletionReason: null,
      },
    });

    return reply.send({ ok: true });
  });

  fastify.post("/v2/projects/:id/duplicate", async (request, reply) => {
    const context = await requireStudioPermission(request, reply, "projects.manage");
    if (!context) {
      return;
    }

    const projectId = (request.params as { id: string }).id;
    if (!isUuid(projectId)) {
      return badRequest(reply, "invalid project id");
    }

    const project = await prisma.contentProject.findFirst({
      where: { id: projectId, tenantId: context.tenantId },
      include: {
        versions: {
          orderBy: { versionNumber: "desc" },
          take: 1,
          select: {
            title: true,
            excerpt: true,
            bodyHtml: true,
            seoTitle: true,
            seoDescription: true,
          },
        },
      },
    });
    if (!project) {
      return notFound(reply, "project not found");
    }

    const duplicate = await prisma.contentProject.create({
      data: {
        tenantId: project.tenantId,
        siteId: project.siteId,
        topicId: project.topicId,
        title: `${project.title} (copy)`,
        brief: project.brief,
        goal: project.goal,
        status: "draft",
        primaryLanguage: project.primaryLanguage,
        metadata: {
          duplicatedFromProjectId: project.id,
        } as Prisma.InputJsonObject,
      },
    });

    const source = project.versions[0];
    if (source) {
      await prisma.contentVersion.create({
        data: {
          tenantId: duplicate.tenantId,
          projectId: duplicate.id,
          versionNumber: 1,
          status: "draft",
          title: source.title,
          excerpt: source.excerpt,
          bodyHtml: source.bodyHtml,
          seoTitle: source.seoTitle,
          seoDescription: source.seoDescription,
        },
      });
    }

    await writeAudit({
      tenantId: context.tenantId,
      actorType: "user",
      actorUserId: context.userId,
      action: "project.duplicated",
      entityType: "content_project",
      entityId: duplicate.id,
      metadata: { sourceProjectId: project.id },
    });

    return reply.code(201).send({ id: duplicate.id });
  });

  fastify.post("/v2/content-images/:id/retry", async (request, reply) => {
    const context = await requireStudioPermission(request, reply, "projects.manage");
    if (!context) {
      return;
    }

    const imageId = (request.params as { id: string }).id;
    if (!isUuid(imageId)) {
      return badRequest(reply, "invalid image id");
    }

    try {
      const jobId = await retryImageGeneration(context.tenantId, imageId);
      return reply.code(202).send({
        job_id: jobId,
        content_image_id: imageId,
        status: "queued",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return badRequest(reply, message);
    }
  });

  fastify.post("/v2/assets/generate", async (request, reply) => {
    const context = await requireStudioPermission(request, reply, "projects.manage");
    if (!context) {
      return;
    }

    const body = parseBody<{ projectId?: string; versionId?: string; promptPresetVersionId?: string }>(request);
    const projectId = body.projectId?.trim();
    if (!projectId) {
      return badRequest(reply, "projectId is required");
    }
    if (!isUuid(projectId)) {
      return badRequest(reply, "invalid project id");
    }

    const version =
      body.versionId?.trim()
        ? (await getProjectById(context.tenantId, projectId))?.versions.find((item) => item.id === body.versionId)
        : await getLatestVersion(projectId, context.tenantId);

    if (!version) {
      return notFound(reply, "version not found");
    }

    const contentImageId = await requestImageGenerationForVersion(
      context.tenantId,
      version.id,
      body.promptPresetVersionId?.trim() || null,
    );
    return reply.code(202).send({
      version_id: version.id,
      content_image_id: contentImageId,
      status: "queued",
    });
  });

  fastify.get("/v2/media", async (request, reply) => {
    const context = await requireStudioContext(request, reply);
    if (!context) {
      return;
    }

    const query = request.query as { page?: string; pageSize?: string; siteId?: string; status?: string; unused?: string };
    const page = parsePage(query.page, 1);
    const pageSize = parsePageSize(query.pageSize, 24);
    if (query.status && !isOneOf(query.status, CONTENT_STATUSES)) {
      return badRequest(reply, `status must be one of: ${CONTENT_STATUSES.join(", ")}`);
    }

    const media = await listMediaImages(context.tenantId, {
      siteId: query.siteId?.trim() || undefined,
      status: query.status?.trim() || undefined,
      unusedOnly: query.unused === "true",
      page,
      pageSize,
    });

    return reply.send({
      ...media,
      items: await Promise.all(
        media.items.map(async (item) => ({
          ...item,
          assetUrl: await buildAssetPublicUrl(item.storagePath),
          variants: await Promise.all(
            item.variants.map(async (variant) => ({
              ...variant,
              publicUrl: await buildAssetPublicUrl(variant.storagePath),
            })),
          ),
        })),
      ),
    });
  });

  fastify.post("/v2/media/bulk-delete", async (request, reply) => {
    const context = await requireStudioPermission(request, reply, "projects.manage");
    if (!context) return;
    const body = parseBody<{ itemIds?: string[] }>(request);
    if (!Array.isArray(body.itemIds) || body.itemIds.length === 0 || body.itemIds.some((id) => !isUuid(id))) {
      return badRequest(reply, "itemIds must contain valid ids");
    }
    const itemIds = [...new Set(body.itemIds)];
    const images = await prisma.contentImage.findMany({
      where: { tenantId: context.tenantId, id: { in: itemIds } },
      include: { assetVariants: true, _count: { select: { versions: true } } },
    });
    if (images.length !== itemIds.length) return notFound(reply, "one or more media assets were not found");
    const used = images.find((image) => image._count.versions > 0);
    if (used) return conflict(reply, `media ${used.id} is used by ${used._count.versions} version(s); detach it before deleting`);
    const storageRoot = path.resolve(getEnv("STORAGE_ROOT", "/var/www/content-ai-platform/storage"));
    const paths = images.flatMap((image) => [image.storagePath, ...image.assetVariants.map((variant) => variant.storagePath)])
      .filter((value): value is string => Boolean(value)).map((value) => path.resolve(storageRoot, value));
    if (paths.some((filePath) => filePath === storageRoot || !filePath.startsWith(`${storageRoot}${path.sep}`))) {
      return badRequest(reply, "invalid media storage path");
    }
    await prisma.contentImage.deleteMany({ where: { tenantId: context.tenantId, id: { in: itemIds } } });
    await Promise.all(paths.map(async (filePath) => { try { await fs.unlink(filePath); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; } }));
    await writeAudit({ tenantId: context.tenantId, actorType: "user", actorUserId: context.userId, action: "media.bulk_deleted", metadata: { count: images.length } });
    return reply.send({ ok: true, deletedCount: images.length });
  });

  fastify.delete("/v2/media/:id", async (request, reply) => {
    const context = await requireStudioPermission(request, reply, "projects.manage");
    if (!context) {
      return;
    }

    const imageId = (request.params as { id: string }).id;
    if (!isUuid(imageId)) {
      return badRequest(reply, "invalid image id");
    }

    const image = await prisma.contentImage.findFirst({
      where: { id: imageId, tenantId: context.tenantId },
      include: { assetVariants: true, _count: { select: { versions: true } } },
    });
    if (!image) {
      return notFound(reply, "media not found");
    }
    if (image._count.versions > 0) {
      return conflict(reply, `media is used by ${image._count.versions} version(s); detach it before deleting`);
    }

    const storageRoot = path.resolve(getEnv("STORAGE_ROOT", "/var/www/content-ai-platform/storage"));
    const paths = [image.storagePath, ...image.assetVariants.map((variant) => variant.storagePath)]
      .filter((value): value is string => Boolean(value))
      .map((value) => path.resolve(storageRoot, value));
    for (const filePath of paths) {
      if (filePath === storageRoot || !filePath.startsWith(`${storageRoot}${path.sep}`)) {
        return badRequest(reply, "invalid media storage path");
      }
    }

    await prisma.contentImage.delete({ where: { id: image.id } });
    await Promise.all(paths.map(async (filePath) => {
      try {
        await fs.unlink(filePath);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
          throw error;
        }
      }
    }));
    await writeAudit({
      tenantId: context.tenantId,
      actorType: "user",
      actorUserId: context.userId,
      action: "media.deleted",
      entityType: "content_image",
      entityId: image.id,
      metadata: { variantCount: image.assetVariants.length },
    });
    return reply.send({ ok: true });
  });

  fastify.patch("/v2/versions/:id", async (request, reply) => {
    const context = await requireStudioPermission(request, reply, "projects.manage");
    if (!context) {
      return;
    }

    const versionId = (request.params as { id: string }).id;
    if (!isUuid(versionId)) {
      return badRequest(reply, "invalid version id");
    }

    const body = parseBody<{
      title?: string;
      excerpt?: string;
      bodyHtml?: string;
      seoTitle?: string;
      seoDescription?: string;
    }>(request);

    try {
      const version = await updateVersionContent(context.tenantId, versionId, {
        title: body.title,
        excerpt: body.excerpt,
        bodyHtml: body.bodyHtml,
        seoTitle: body.seoTitle,
        seoDescription: body.seoDescription,
      });
      if (!version) {
        return notFound(reply, "version not found");
      }

      const project = await getProjectById(context.tenantId, version.projectId);
      const latestVersion = project?.versions[0] ?? null;
      let qaReport: unknown = null;

      if (latestVersion && latestVersion.id === version.id) {
        const projectMetadata = (project?.metadata ?? {}) as Record<string, unknown>;
        const readNum = (key: string): number | null => {
          const value = projectMetadata[key];
          return typeof value === "number" && Number.isFinite(value) ? value : null;
        };
        qaReport = runVersionQaV2(
          {
            title: version.title,
            excerpt: version.excerpt,
            bodyHtml: version.bodyHtml,
            seoTitle: version.seoTitle,
            seoDescription: version.seoDescription,
          },
          {
            imageReady: isHeroImageReady(latestVersion.contentImage),
            metadata: projectMetadata,
            siteType: project?.site?.type ?? null,
            recommendedWordCountMin: readNum("recommendedWordCountMin"),
            recommendedWordCountMax: readNum("recommendedWordCountMax"),
            cannibalizationRisk: typeof projectMetadata.cannibalizationRisk === "string" ? projectMetadata.cannibalizationRisk : null,
          },
        );
        await updateVersionQa(
          version.id,
          (qaReport as { passed: boolean }).passed ? "qa_passed" : "qa_failed",
          qaReport as Prisma.JsonObject,
        );
        await updateProjectStatus(
          context.tenantId,
          version.projectId,
          (qaReport as { passed: boolean }).passed ? "in_review" : "qa_failed",
        );
      }

      return reply.send({
        id: version.id,
        status: version.status,
        qaReport,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return badRequest(reply, message);
    }
  });

  fastify.get("/v2/publication-jobs", async (request, reply) => {
    const context = await requireStudioContext(request, reply);
    if (!context) {
      return;
    }

    const query = request.query as { page?: string; pageSize?: string; status?: string };
    const page = parsePage(query.page, 1);
    const pageSize = parsePageSize(query.pageSize, 20);
    if (query.status && !isOneOf(query.status, PUBLICATION_STATUSES)) {
      return badRequest(reply, `status must be one of: ${PUBLICATION_STATUSES.join(", ")}`);
    }

    const publications = await listPublicationJobs(
      context.tenantId,
      page,
      pageSize,
      query.status as PublicationStatus | undefined,
    );

    const items = await Promise.all(
      publications.items.map(async (publication) => ({
        id: publication.id,
        status: publication.status,
        action: publication.action,
        targetStatus: parsePublicationTargetStatus(
          publication.requestPayload && typeof publication.requestPayload === "object"
            ? (publication.requestPayload as Record<string, unknown>).targetStatus
            : null,
        ),
        externalId: publication.externalId,
        externalUrl: publication.externalUrl,
        error: publication.error,
        createdAt: publication.createdAt,
        updatedAt: publication.updatedAt,
        publishedAt: publication.publishedAt,
        site: {
          id: publication.site.id,
          key: publication.site.key,
          name: publication.site.name,
          type: publication.site.type,
        },
        project: {
          id: publication.project.id,
          title: publication.project.title,
          status: publication.project.status,
        },
        version: {
          id: publication.version.id,
          versionNumber: publication.version.versionNumber,
          status: publication.version.status,
        },
        assetUrl: await buildAssetPublicUrl(publication.version.contentImage?.storagePath),
      })),
    );

    return reply.send({
      ...publications,
      items,
    });
  });

  fastify.get("/v2/publication-jobs/:id", async (request, reply) => {
    const context = await requireStudioContext(request, reply);
    if (!context) {
      return;
    }

    const publicationId = (request.params as { id: string }).id;
    if (!isUuid(publicationId)) {
      return badRequest(reply, "invalid publication id");
    }

    const publication = await getPublicationJobById(context.tenantId, publicationId);
    if (!publication) {
      return notFound(reply, "publication not found");
    }

    return reply.send({
      ...publication,
      assetUrl: await buildAssetPublicUrl(publication.version.contentImage?.storagePath),
    });
  });

  fastify.get("/v2/workspace/identity-provider", async (request, reply) => {
    const context = await requireStudioContext(request, reply);
    if (!context) {
      return;
    }

    return reply.send(await getStudioIdentityProviderConfig(context.tenantId));
  });

  fastify.patch("/v2/workspace/identity-provider", async (request, reply) => {
    const context = await requireStudioPermission(request, reply, "workspace.manage");
    if (!context) {
      return;
    }

    const body = parseBody<UpdateStudioIdentityProviderInput>(request);
    if (body.provisioningMode && !isOneOf(body.provisioningMode, STUDIO_PROVISIONING_MODES)) {
      return badRequest(reply, `provisioningMode must be one of: ${STUDIO_PROVISIONING_MODES.join(", ")}`);
    }

    try {
      const claimMappings = parseJsonObjectField(body.claimMappings, "claimMappings");
      const provider = await upsertStudioIdentityProvider(context.tenantId, {
        enabled: body.enabled,
        issuer: body.issuer?.trim(),
        clientId: body.clientId?.trim(),
        clientSecret: body.clientSecret === undefined ? undefined : parseOptionalString(body.clientSecret),
        scopes: body.scopes?.trim(),
        claimMappings: claimMappings ?? undefined,
        provisioningMode: body.provisioningMode,
      });
      return reply.send(provider);
    } catch (error) {
      return badRequest(reply, error instanceof Error ? error.message : String(error));
    }
  });

  fastify.post("/v2/workspace/identity-provider/test", async (request, reply) => {
    const context = await requireStudioPermission(request, reply, "workspace.manage");
    if (!context) {
      return;
    }

    const body = parseBody<UpdateStudioIdentityProviderInput>(request);
    const candidate = {
      ...(await getStudioIdentityProviderConfig(context.tenantId)),
      issuer: body.issuer?.trim() || undefined,
      clientId: body.clientId?.trim() || undefined,
      scopes: body.scopes?.trim() || undefined,
    };

    if (!candidate.issuer) {
      return badRequest(reply, "issuer is required");
    }

    try {
      const wellKnownUrl = new URL(
        "/.well-known/openid-configuration",
        candidate.issuer.endsWith("/") ? candidate.issuer : `${candidate.issuer}/`,
      );
      const response = await fetch(wellKnownUrl, {
        headers: {
          accept: "application/json",
        },
      });

      if (!response.ok) {
        return reply.code(502).send({
          ok: false,
          message: `OIDC discovery failed with status ${response.status}`,
        });
      }

      const payload = (await response.json()) as Record<string, unknown>;
      return reply.send({
        ok: true,
        issuer: payload["issuer"] ?? candidate.issuer,
        authorizationEndpoint: payload["authorization_endpoint"] ?? null,
        tokenEndpoint: payload["token_endpoint"] ?? null,
        scopesSupported: payload["scopes_supported"] ?? null,
      });
    } catch (error) {
      return reply.code(502).send({
        ok: false,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  fastify.get("/v2/users", async (request, reply) => {
    const context = await requireStudioPermission(request, reply, "users.manage");
    if (!context) {
      return;
    }

    return reply.send(await listStudioUsers(context.tenantId));
  });

  fastify.post("/v2/users/invitations", async (request, reply) => {
    const context = await requireStudioPermission(request, reply, "users.manage");
    if (!context) {
      return;
    }

    const body = parseBody<CreateStudioInvitationInput>(request);
    if (!body.email?.trim()) {
      return badRequest(reply, "email is required");
    }

    try {
      const invitation = await inviteStudioUser(context.tenantId, context.userId, {
        email: body.email.trim(),
        displayName: parseOptionalString(body.displayName) ?? undefined,
        roleKeys: Array.isArray(body.roleKeys)
          ? body.roleKeys.map((item) => String(item).trim()).filter(Boolean)
          : undefined,
      });
      return reply.code(201).send(invitation);
    } catch (error) {
      return badRequest(reply, error instanceof Error ? error.message : String(error));
    }
  });

  fastify.patch("/v2/users/:id", async (request, reply) => {
    const context = await requireStudioPermission(request, reply, "users.manage");
    if (!context) {
      return;
    }

    const userId = (request.params as { id: string }).id;
    if (!isUuid(userId)) {
      return badRequest(reply, "invalid user id");
    }

    const body = parseBody<UpdateStudioUserInput>(request);
    if (body.status && !isOneOf(body.status, STUDIO_USER_STATUSES)) {
      return badRequest(reply, `status must be one of: ${STUDIO_USER_STATUSES.join(", ")}`);
    }

    try {
      const user = await updateStudioUser(context.tenantId, userId, {
        displayName: body.displayName?.trim(),
        status: body.status,
      });
      if (!user) {
        return notFound(reply, "user not found");
      }
      return reply.send(user);
    } catch (error) {
      return badRequest(reply, error instanceof Error ? error.message : String(error));
    }
  });

  fastify.post("/v2/users/:id/roles", async (request, reply) => {
    const context = await requireStudioPermission(request, reply, "users.manage");
    if (!context) {
      return;
    }

    const userId = (request.params as { id: string }).id;
    if (!isUuid(userId)) {
      return badRequest(reply, "invalid user id");
    }

    const body = parseBody<{ roleId?: string }>(request);
    const roleId = body.roleId?.trim();
    if (!roleId || !isUuid(roleId)) {
      return badRequest(reply, "roleId is required");
    }

    try {
      await assignStudioRoleToUser(context.tenantId, userId, roleId);
      return reply.code(204).send();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message === "user_or_role_not_found") {
        return notFound(reply, "user or role not found");
      }
      return badRequest(reply, message);
    }
  });

  fastify.delete("/v2/users/:id/roles/:roleId", async (request, reply) => {
    const context = await requireStudioPermission(request, reply, "users.manage");
    if (!context) {
      return;
    }

    const { id: userId, roleId } = request.params as { id: string; roleId: string };
    if (!isUuid(userId) || !isUuid(roleId)) {
      return badRequest(reply, "invalid user or role id");
    }

    try {
      await removeStudioRoleFromUser(context.tenantId, userId, roleId);
      return reply.code(204).send();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message === "user_or_role_not_found") {
        return notFound(reply, "user or role not found");
      }
      return badRequest(reply, message);
    }
  });

  fastify.get("/v2/roles", async (request, reply) => {
    const context = await requireStudioContext(request, reply);
    if (!context) {
      return;
    }

    if (
      !hasStudioPermission(context.permissions, "roles.manage") &&
      !hasStudioPermission(context.permissions, "users.manage")
    ) {
      return reply.code(403).send({ error: "forbidden", message: "Missing permission: roles.manage" });
    }

    return reply.send(await listStudioRoles(context.tenantId));
  });

  fastify.post("/v2/roles", async (request, reply) => {
    const context = await requireStudioPermission(request, reply, "roles.manage");
    if (!context) {
      return;
    }

    const body = parseBody<CreateStudioRoleInput>(request);
    if (!body.name?.trim()) {
      return badRequest(reply, "name is required");
    }

    try {
      const role = await createStudioRole(context.tenantId, {
        key: parseOptionalString(body.key) ?? undefined,
        name: body.name.trim(),
        description: parseOptionalString(body.description) ?? undefined,
        permissions: parsePermissionList(body.permissions),
        cloneFromRoleId: parseOptionalString(body.cloneFromRoleId),
      });
      return reply.code(201).send(role);
    } catch (error) {
      return badRequest(reply, error instanceof Error ? error.message : String(error));
    }
  });

  fastify.patch("/v2/roles/:id", async (request, reply) => {
    const context = await requireStudioPermission(request, reply, "roles.manage");
    if (!context) {
      return;
    }

    const roleId = (request.params as { id: string }).id;
    if (!isUuid(roleId)) {
      return badRequest(reply, "invalid role id");
    }

    const body = parseBody<UpdateStudioRoleInput>(request);

    try {
      const role = await updateStudioRole(context.tenantId, roleId, {
        name: body.name?.trim(),
        description: parseOptionalString(body.description),
        permissions: body.permissions === undefined ? undefined : parsePermissionList(body.permissions),
      });
      if (!role) {
        return notFound(reply, "role not found");
      }
      return reply.send(role);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message === "system_role_locked") {
        return reply.code(409).send({ error: "conflict", message });
      }
      return badRequest(reply, message);
    }
  });

  fastify.get("/v2/prompts", async (request, reply) => {
    const context = await requireStudioPermission(request, reply, "prompts.manage");
    if (!context) {
      return;
    }

    return reply.send(await listStudioPromptPresets(prisma, context.tenantId));
  });

  fastify.post("/v2/prompts", async (request, reply) => {
    const context = await requireStudioPermission(request, reply, "prompts.manage");
    if (!context) {
      return;
    }

    const body = parseBody<CreateStudioPromptPresetInput>(request);
    if (!body.name?.trim() || !body.userTemplate?.trim()) {
      return badRequest(reply, "name and userTemplate are required");
    }
    if (!body.surface || !isOneOf(body.surface, STUDIO_PROMPT_SURFACES)) {
      return badRequest(reply, `surface must be one of: ${STUDIO_PROMPT_SURFACES.join(", ")}`);
    }
    if (body.scope && !isOneOf(body.scope, STUDIO_PROMPT_SCOPES)) {
      return badRequest(reply, `scope must be one of: ${STUDIO_PROMPT_SCOPES.join(", ")}`);
    }

    try {
      const preset = await createStudioPromptPreset(prisma, context.tenantId, context.userId, {
        key: parseOptionalString(body.key) ?? undefined,
        name: body.name.trim(),
        surface: body.surface,
        scope: body.scope,
        siteId: parseOptionalString(body.siteId),
        description: parseOptionalString(body.description),
        systemTemplate: body.systemTemplate === undefined ? undefined : parseOptionalString(body.systemTemplate),
        userTemplate: body.userTemplate,
        variablesJson: parseJsonObjectField(body.variablesJson, "variablesJson") ?? undefined,
        notes: parseOptionalString(body.notes),
      });
      return reply.code(201).send(preset);
    } catch (error) {
      return badRequest(reply, error instanceof Error ? error.message : String(error));
    }
  });

  fastify.get("/v2/prompts/:id", async (request, reply) => {
    const context = await requireStudioPermission(request, reply, "prompts.manage");
    if (!context) {
      return;
    }

    const presetId = (request.params as { id: string }).id;
    if (!isUuid(presetId)) {
      return badRequest(reply, "invalid prompt id");
    }

    const projectId = parseOptionalString((request.query as { projectId?: string }).projectId);
    if (projectId && !isUuid(projectId)) {
      return badRequest(reply, "invalid project id");
    }

    const preset = await getStudioPromptPresetDetail(prisma, context.tenantId, presetId, projectId);
    if (!preset) {
      return notFound(reply, "prompt not found");
    }

    return reply.send(preset);
  });

  fastify.post("/v2/prompts/:id/versions", async (request, reply) => {
    const context = await requireStudioPermission(request, reply, "prompts.manage");
    if (!context) {
      return;
    }

    const presetId = (request.params as { id: string }).id;
    if (!isUuid(presetId)) {
      return badRequest(reply, "invalid prompt id");
    }

    const body = parseBody<CreateStudioPromptVersionInput>(request);
    if (!body.userTemplate?.trim()) {
      return badRequest(reply, "userTemplate is required");
    }

    const version = await createStudioPromptVersion(prisma, context.tenantId, presetId, context.userId, {
      systemTemplate: body.systemTemplate === undefined ? undefined : parseOptionalString(body.systemTemplate),
      userTemplate: body.userTemplate,
      variablesJson: parseJsonObjectField(body.variablesJson, "variablesJson") ?? undefined,
      notes: parseOptionalString(body.notes),
    });
    if (!version) {
      return notFound(reply, "prompt not found");
    }

    return reply.code(201).send(version);
  });

  fastify.patch("/v2/prompts/:id/versions/:versionId", async (request, reply) => {
    const context = await requireStudioPermission(request, reply, "prompts.manage");
    if (!context) {
      return;
    }

    const { id: presetId, versionId } = request.params as { id: string; versionId: string };
    if (!isUuid(presetId) || !isUuid(versionId)) {
      return badRequest(reply, "invalid prompt or version id");
    }

    const body = parseBody<UpdateStudioPromptVersionInput>(request);
    if (body.status && !isOneOf(body.status, STUDIO_PROMPT_VERSION_STATUSES)) {
      return badRequest(reply, `status must be one of: ${STUDIO_PROMPT_VERSION_STATUSES.join(", ")}`);
    }

    const version = await updateStudioPromptVersion(prisma, context.tenantId, presetId, versionId, context.userId, {
      status: body.status,
      systemTemplate: body.systemTemplate === undefined ? undefined : parseOptionalString(body.systemTemplate),
      userTemplate: body.userTemplate,
      variablesJson: parseJsonObjectField(body.variablesJson, "variablesJson") ?? undefined,
      notes: body.notes === undefined ? undefined : parseOptionalString(body.notes),
    });
    if (!version) {
      return notFound(reply, "prompt version not found");
    }

    return reply.send(version);
  });

  fastify.post("/v2/prompts/:id/versions/:versionId/approve", async (request, reply) => {
    const context = await requireStudioPermission(request, reply, "prompts.manage");
    if (!context) {
      return;
    }

    const { id: presetId, versionId } = request.params as { id: string; versionId: string };
    if (!isUuid(presetId) || !isUuid(versionId)) {
      return badRequest(reply, "invalid prompt or version id");
    }

    const version = await approveStudioPromptVersion(prisma, context.tenantId, presetId, versionId, context.userId);
    if (!version) {
      return notFound(reply, "prompt version not found");
    }

    return reply.send(version);
  });

  fastify.post("/v2/prompts/:id/assignments", async (request, reply) => {
    const context = await requireStudioPermission(request, reply, "prompts.manage");
    if (!context) {
      return;
    }

    const presetId = (request.params as { id: string }).id;
    if (!isUuid(presetId)) {
      return badRequest(reply, "invalid prompt id");
    }

    const body = parseBody<AssignStudioPromptInput>(request);
    const versionId = body.versionId?.trim();
    if (!versionId || !isUuid(versionId)) {
      return badRequest(reply, "versionId is required");
    }
    if (body.siteId && !isUuid(body.siteId)) {
      return badRequest(reply, "invalid site id");
    }

    const assignment = await assignStudioPromptVersion(prisma, context.tenantId, presetId, context.userId, {
      versionId,
      siteId: parseOptionalString(body.siteId),
    });
    if (!assignment) {
      return notFound(reply, "approved prompt version not found");
    }

    return reply.send(assignment);
  });
}
