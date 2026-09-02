import { Prisma } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { getPrismaClient } from "../infrastructure/db/prisma";
import { QUEUE_NAMES } from "../infrastructure/queue/queues";
import {
  badRequest,
  conflict,
  isOneOf,
  isUuid,
  notFound,
  parseBody,
  parseOptionalString,
  parsePage,
  parsePageSize,
  requireStudioContext,
  requireStudioPermission,
} from "./http-utils";
import {
  createSource,
  deleteSource,
  fetchSourceNow,
  getSource,
  getSourceItemDetail,
  listSourceItems,
  listSources,
  markSourceItemsStatus,
  sanitizeSourceForClient,
  setSourceItemStatus,
  testSourceFetch,
  updateSource,
} from "./sources";
import { listStoryClusters, setClusterStatus } from "./editorial";
import { getSourceHealth } from "./source-health";
import { createProjectFromSourceItem } from "./planner";
import {
  createPublication,
  deletePublication,
  getPublication,
  listPublications,
  retryPublication,
  unpublishPublication,
  updatePublicationSchedule,
} from "./publication";
import { listCalendarEvents } from "./calendar";
import { listWorkerHeartbeats } from "./worker-health";
import { recoverStuckAutoProjects } from "./automation-recovery";
import { getEnv } from "../shared/utils/env";
import {
  getAutomationStatus,
  getOrCreatePolicy,
  pauseAutomation,
  resumeAutomation,
  updatePolicy,
  type UpdatePolicyInput,
} from "./automation";
import {
  createSocialGenerationJobs,
  listSocialContent,
  regenerateSocial,
  updateSocialContent,
} from "./social";
import { listAudit } from "./audit";
import { writeAudit } from "./audit";
import { computeConnectionState } from "./social-connections";
import { buildAssetPublicUrl } from "./orchestration";
import {
  bulkApproveEditorialPlanItems,
  bulkDeleteEditorialPlanItems,
  bulkSetEditorialPlanItemStatus,
  deleteEditorialPlanItem,
  enqueueEditorialPlanGeneration,
  generateContentFromEditorialPlanItem,
  generateEditorialPlan,
  getEditorialPlan,
  listEditorialPlans,
  setEditorialPlanItemStatus,
  updateEditorialPlanItem,
  type GenerateEditorialPlanInput,
} from "./editorial-plan";
import { CONTENT_FORMATS, SEARCH_INTENTS, STRATEGY_MODES } from "./editorial-plan-schema";

const prisma = getPrismaClient();

const SOURCE_TYPES = ["rss", "atom", "html", "sitemap", "api", "htmllist", "imdb", "manual"] as const;
const SOURCE_ITEM_STATUSES = [
  "discovered",
  "fetched",
  "parsed",
  "duplicate",
  "rejected",
  "candidate",
  "selected",
  "processed",
  "failed",
] as const;
const CLUSTER_STATUSES = ["open", "selected", "covered", "rejected", "archived"] as const;
const PUBLICATION_CHANNELS = ["website", "x", "instagram"] as const;
const PUBLICATION_STATES = [
  "draft",
  "ready",
  "scheduled",
  "queued",
  "publishing",
  "published",
  "failed",
  "canceled",
  "deleted",
  "unpublished",
] as const;
const ACCOUNT_PLATFORMS = ["website", "x", "instagram"] as const;
const ACCOUNT_STATUSES = ["pending", "active", "error", "disabled"] as const;
const SOCIAL_CHANNELS = ["x", "instagram"] as const;
const SOCIAL_EDITORIAL_STATUSES = ["draft", "approved", "rejected"] as const;

function parseIsoDate(value: unknown): Date | null {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed;
}

// ────────────────────────────────────────────────────────────── Sources

export function registerEditorialRoutes(fastify: FastifyInstance) {
  fastify.get("/v2/sources", async (request, reply) => {
    const context = await requireStudioContext(request, reply);
    if (!context) {
      return;
    }
    const query = request.query as { page?: string; pageSize?: string; type?: string; enabled?: string };
    const page = parsePage(query.page, 1);
    const pageSize = parsePageSize(query.pageSize, 20);
    if (query.type && !isOneOf(query.type, SOURCE_TYPES)) {
      return badRequest(reply, `type must be one of: ${SOURCE_TYPES.join(", ")}`);
    }
    const sources = await listSources(context.tenantId, {
      page,
      pageSize,
      type: query.type,
      enabled: query.enabled === undefined ? undefined : query.enabled === "true",
    });
    return reply.send(sources);
  });

  fastify.post("/v2/sources", async (request, reply) => {
    const context = await requireStudioPermission(request, reply, "integrations.manage");
    if (!context) {
      return;
    }
    const body = parseBody<{
      siteId?: string;
      name?: string;
      type?: string;
      url?: string;
      domain?: string;
      enabled?: boolean;
      priority?: number;
      trustScore?: number;
      authorityScore?: number;
      language?: string;
      country?: string;
      categories?: string[];
      tags?: string[];
      refreshIntervalMinutes?: number;
      configuration?: Record<string, unknown>;
      rateLimitPolicy?: Record<string, unknown>;
      robotsPolicy?: Record<string, unknown>;
      extractionPolicy?: Record<string, unknown>;
      credentialsRef?: string;
      discoveryMethod?: string;
      restrictionsNote?: string;
    }>(request);

    if (!body.name?.trim() || !body.type) {
      return badRequest(reply, "name and type are required");
    }
    if (!isOneOf(body.type, SOURCE_TYPES)) {
      return badRequest(reply, `type must be one of: ${SOURCE_TYPES.join(", ")}`);
    }
    if (body.type !== "manual" && !body.url?.trim()) {
      return badRequest(reply, "url is required for this source type");
    }

    try {
      const source = await createSource(context.tenantId, {
        siteId: parseOptionalString(body.siteId),
        name: body.name.trim(),
        type: body.type as (typeof SOURCE_TYPES)[number],
        url: parseOptionalString(body.url),
        domain: parseOptionalString(body.domain),
        enabled: body.enabled ?? true,
        priority: body.priority ?? 0,
        trustScore: body.trustScore ?? 0.5,
        authorityScore: body.authorityScore ?? 0.5,
        language: body.language ?? "es",
        country: parseOptionalString(body.country),
        categories: body.categories ?? null,
        tags: body.tags ?? null,
        refreshIntervalMinutes: body.refreshIntervalMinutes ?? 30,
        configuration: body.configuration ?? null,
        rateLimitPolicy: body.rateLimitPolicy ?? null,
        robotsPolicy: body.robotsPolicy ?? null,
        extractionPolicy: body.extractionPolicy ?? null,
        credentialsRef: parseOptionalString(body.credentialsRef),
        discoveryMethod: parseOptionalString(body.discoveryMethod),
        restrictionsNote: parseOptionalString(body.restrictionsNote),
      });
      return reply.code(201).send(sanitizeSourceForClient(source));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/unique constraint|Unique constraint/i.test(message)) {
        return conflict(reply, "source name already exists");
      }
      return badRequest(reply, message);
    }
  });

  fastify.get("/v2/sources/:id", async (request, reply) => {
    const context = await requireStudioContext(request, reply);
    if (!context) {
      return;
    }
    const sourceId = (request.params as { id: string }).id;
    if (!isUuid(sourceId)) {
      return badRequest(reply, "invalid source id");
    }
    const source = await getSource(context.tenantId, sourceId);
    if (!source) {
      return notFound(reply, "source not found");
    }
    return reply.send(source);
  });

  fastify.patch("/v2/sources/:id", async (request, reply) => {
    const context = await requireStudioPermission(request, reply, "integrations.manage");
    if (!context) {
      return;
    }
    const sourceId = (request.params as { id: string }).id;
    if (!isUuid(sourceId)) {
      return badRequest(reply, "invalid source id");
    }
    const body = parseBody<{
      siteId?: string;
      name?: string;
      type?: string;
      url?: string;
      domain?: string;
      enabled?: boolean;
      priority?: number;
      trustScore?: number;
      authorityScore?: number;
      language?: string;
      country?: string;
      categories?: string[];
      tags?: string[];
      refreshIntervalMinutes?: number;
      configuration?: Record<string, unknown>;
      rateLimitPolicy?: Record<string, unknown>;
      robotsPolicy?: Record<string, unknown>;
      extractionPolicy?: Record<string, unknown>;
      credentialsRef?: string;
      discoveryMethod?: string;
      restrictionsNote?: string;
      archived?: boolean;
    }>(request);
    if (body.type && !isOneOf(body.type, SOURCE_TYPES)) {
      return badRequest(reply, `type must be one of: ${SOURCE_TYPES.join(", ")}`);
    }

    const source = await updateSource(context.tenantId, sourceId, {
      siteId: parseOptionalString(body.siteId),
      name: body.name?.trim(),
      type: body.type as (typeof SOURCE_TYPES)[number] | undefined,
      url: parseOptionalString(body.url),
      domain: parseOptionalString(body.domain),
      enabled: body.enabled,
      priority: body.priority,
      trustScore: body.trustScore,
      authorityScore: body.authorityScore,
      language: body.language,
      country: parseOptionalString(body.country),
      categories: body.categories,
      tags: body.tags,
      refreshIntervalMinutes: body.refreshIntervalMinutes,
      configuration: body.configuration,
      rateLimitPolicy: body.rateLimitPolicy,
      robotsPolicy: body.robotsPolicy,
      extractionPolicy: body.extractionPolicy,
      credentialsRef: body.credentialsRef === undefined ? undefined : parseOptionalString(body.credentialsRef),
      discoveryMethod: parseOptionalString(body.discoveryMethod),
      restrictionsNote: parseOptionalString(body.restrictionsNote),
      archivedAt: body.archived === undefined ? undefined : body.archived ? new Date() : null,
    });
    if (!source) {
      return notFound(reply, "source not found");
    }
    return reply.send(sanitizeSourceForClient(source));
  });

  fastify.delete("/v2/sources/:id", async (request, reply) => {
    const context = await requireStudioPermission(request, reply, "integrations.manage");
    if (!context) {
      return;
    }
    const sourceId = (request.params as { id: string }).id;
    if (!isUuid(sourceId)) {
      return badRequest(reply, "invalid source id");
    }
    const deleted = await deleteSource(context.tenantId, sourceId);
    if (!deleted) {
      return notFound(reply, "source not found");
    }
    return reply.send({ ok: true });
  });

  fastify.post("/v2/sources/:id/test", async (request, reply) => {
    const context = await requireStudioPermission(request, reply, "integrations.manage");
    if (!context) {
      return;
    }
    const sourceId = (request.params as { id: string }).id;
    if (!isUuid(sourceId)) {
      return badRequest(reply, "invalid source id");
    }
    const source = await getSource(context.tenantId, sourceId);
    if (!source) {
      return notFound(reply, "source not found");
    }
    try {
      const result = await testSourceFetch(context.tenantId, {
        type: source.type,
        url: source.url,
        configuration: source.configuration as Record<string, unknown> | null,
      });
      return reply.send(result);
    } catch (error) {
      return reply.code(502).send({
        ok: false,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  fastify.post("/v2/sources/:id/fetch", async (request, reply) => {
    const context = await requireStudioPermission(request, reply, "integrations.manage");
    if (!context) {
      return;
    }
    const sourceId = (request.params as { id: string }).id;
    if (!isUuid(sourceId)) {
      return badRequest(reply, "invalid source id");
    }
    try {
      const result = await fetchSourceNow(context.tenantId, sourceId);
      return reply.send(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message === "source_not_found") {
        return notFound(reply, message);
      }
      return badRequest(reply, message);
    }
  });

  fastify.get("/v2/sources/:id/health", async (request, reply) => {
    const context = await requireStudioContext(request, reply);
    if (!context) {
      return;
    }
    const sourceId = (request.params as { id: string }).id;
    if (!isUuid(sourceId)) {
      return badRequest(reply, "invalid source id");
    }
    const health = await getSourceHealth(context.tenantId, sourceId);
    if (!health) {
      return notFound(reply, "source health not available");
    }
    return reply.send(health);
  });

  // ──────────────────────────────────────────────────────────── Inbox

  fastify.get("/v2/source-items", async (request, reply) => {
    const context = await requireStudioContext(request, reply);
    if (!context) {
      return;
    }
    const query = request.query as {
      page?: string;
      pageSize?: string;
      sourceId?: string;
      status?: string;
      clusterId?: string;
      search?: string;
      minScore?: string;
      sort?: string;
      direction?: string;
    };
    const page = parsePage(query.page, 1);
    const pageSize = parsePageSize(query.pageSize, 20);
    if (query.status && !isOneOf(query.status, SOURCE_ITEM_STATUSES)) {
      return badRequest(reply, `status must be one of: ${SOURCE_ITEM_STATUSES.join(", ")}`);
    }
    if (query.sort && !isOneOf(query.sort, ["discovered", "score"] as const)) {
      return badRequest(reply, "sort must be one of: discovered, score");
    }
    if (query.direction && !isOneOf(query.direction, ["asc", "desc"] as const)) {
      return badRequest(reply, "direction must be one of: asc, desc");
    }

    const items = await listSourceItems(context.tenantId, {
      page,
      pageSize,
      sourceId: query.sourceId,
      status: query.status as (typeof SOURCE_ITEM_STATUSES)[number] | undefined,
      clusterId: query.clusterId,
      search: parseOptionalString(query.search) ?? undefined,
      minScore: query.minScore ? Number.parseFloat(query.minScore) : undefined,
      sort: query.sort as "discovered" | "score" | undefined,
      direction: query.direction as "asc" | "desc" | undefined,
    });

    return reply.send(items);
  });

  fastify.get("/v2/source-items/:id", async (request, reply) => {
    const context = await requireStudioContext(request, reply);
    if (!context) {
      return;
    }
    const itemId = (request.params as { id: string }).id;
    if (!isUuid(itemId)) {
      return badRequest(reply, "invalid source item id");
    }
    const item = await getSourceItemDetail(context.tenantId, itemId);
    if (!item) {
      return notFound(reply, "source item not found");
    }
    return reply.send(item);
  });

  fastify.post("/v2/source-items/:id/select", async (request, reply) => {
    const context = await requireStudioPermission(request, reply, "projects.manage");
    if (!context) {
      return;
    }
    const itemId = (request.params as { id: string }).id;
    if (!isUuid(itemId)) {
      return badRequest(reply, "invalid source item id");
    }
    const item = await setSourceItemStatus(context.tenantId, itemId, "selected", { userId: context.userId });
    if (!item) {
      return notFound(reply, "source item not found");
    }
    return reply.send(item);
  });

  fastify.post("/v2/source-items/:id/reject", async (request, reply) => {
    const context = await requireStudioPermission(request, reply, "projects.manage");
    if (!context) {
      return;
    }
    const itemId = (request.params as { id: string }).id;
    if (!isUuid(itemId)) {
      return badRequest(reply, "invalid source item id");
    }
    const item = await setSourceItemStatus(context.tenantId, itemId, "rejected", { userId: context.userId });
    if (!item) {
      return notFound(reply, "source item not found");
    }
    return reply.send(item);
  });

  fastify.post("/v2/source-items/bulk", async (request, reply) => {
    const context = await requireStudioPermission(request, reply, "projects.manage");
    if (!context) {
      return;
    }
    const body = parseBody<{ itemIds?: string[]; status?: string }>(request);
    if (!Array.isArray(body.itemIds) || !body.status) {
      return badRequest(reply, "itemIds and status are required");
    }
    if (!isOneOf(body.status, SOURCE_ITEM_STATUSES)) {
      return badRequest(reply, `status must be one of: ${SOURCE_ITEM_STATUSES.join(", ")}`);
    }
    const updated = await markSourceItemsStatus(
      context.tenantId,
      body.itemIds.filter(isUuid),
      body.status as (typeof SOURCE_ITEM_STATUSES)[number],
    );
    return reply.send({ updated: updated.count });
  });

  fastify.post("/v2/source-items/:id/create-project", async (request, reply) => {
    const context = await requireStudioPermission(request, reply, "projects.manage");
    if (!context) {
      return;
    }
    const itemId = (request.params as { id: string }).id;
    if (!isUuid(itemId)) {
      return badRequest(reply, "invalid source item id");
    }
    const body = parseBody<{
      siteId?: string;
      goal?: string;
      allowUpdateExisting?: boolean;
    }>(request);
    if (!body.siteId || !isUuid(body.siteId)) {
      return badRequest(reply, "siteId is required");
    }
    if (body.goal && !isOneOf(body.goal, ["news_article", "article"] as const)) {
      return badRequest(reply, "goal must be one of: news_article, article");
    }

    try {
      const result = await createProjectFromSourceItem({
        tenantId: context.tenantId,
        siteId: body.siteId,
        sourceItemId: itemId,
        goal: body.goal as "news_article" | "article" | undefined,
        allowUpdateExisting: body.allowUpdateExisting ?? false,
        userId: context.userId,
      });
      return reply.code(201).send(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.startsWith("already_covered")) {
        return conflict(reply, message);
      }
      if (message === "source_item_not_found") {
        return notFound(reply, message);
      }
      if (message === "site_not_found") {
        return notFound(reply, message);
      }
      return badRequest(reply, message);
    }
  });

  // ──────────────────────────────────────────────────────────── Story clusters

  fastify.get("/v2/story-clusters", async (request, reply) => {
    const context = await requireStudioContext(request, reply);
    if (!context) {
      return;
    }
    const query = request.query as { page?: string; pageSize?: string; status?: string };
    const page = parsePage(query.page, 1);
    const pageSize = parsePageSize(query.pageSize, 20);
    if (query.status && !isOneOf(query.status, CLUSTER_STATUSES)) {
      return badRequest(reply, `status must be one of: ${CLUSTER_STATUSES.join(", ")}`);
    }
    return reply.send(
      await listStoryClusters(context.tenantId, { page, pageSize, status: query.status }),
    );
  });

  fastify.patch("/v2/story-clusters/:id", async (request, reply) => {
    const context = await requireStudioPermission(request, reply, "projects.manage");
    if (!context) {
      return;
    }
    const clusterId = (request.params as { id: string }).id;
    if (!isUuid(clusterId)) {
      return badRequest(reply, "invalid cluster id");
    }
    const body = parseBody<{ status?: string }>(request);
    if (!body.status || !isOneOf(body.status, CLUSTER_STATUSES)) {
      return badRequest(reply, `status must be one of: ${CLUSTER_STATUSES.join(", ")}`);
    }
    const cluster = await setClusterStatus(context.tenantId, clusterId, body.status as (typeof CLUSTER_STATUSES)[number]);
    if (!cluster) {
      return notFound(reply, "cluster not found");
    }
    return reply.send(cluster);
  });

  // ──────────────────────────────────────────────────────────── Publications

  fastify.get("/v2/publications", async (request, reply) => {
    const context = await requireStudioContext(request, reply);
    if (!context) {
      return;
    }
    const query = request.query as {
      page?: string;
      pageSize?: string;
      channel?: string;
      status?: string;
      projectId?: string;
      siteId?: string;
      search?: string;
      dateFrom?: string;
      dateTo?: string;
      sort?: string;
      direction?: string;
      failed?: string;
    };
    const page = parsePage(query.page, 1);
    const pageSize = parsePageSize(query.pageSize, 20);
    if (query.channel && !isOneOf(query.channel, PUBLICATION_CHANNELS)) {
      return badRequest(reply, `channel must be one of: ${PUBLICATION_CHANNELS.join(", ")}`);
    }
    if (query.status && !isOneOf(query.status, PUBLICATION_STATES)) {
      return badRequest(reply, `status must be one of: ${PUBLICATION_STATES.join(", ")}`);
    }
    if (query.sort && !isOneOf(query.sort, ["scheduled", "created", "updated"] as const)) {
      return badRequest(reply, "sort must be one of: scheduled, created, updated");
    }
    if (query.direction && !isOneOf(query.direction, ["asc", "desc"] as const)) {
      return badRequest(reply, "direction must be one of: asc, desc");
    }

    const publications = await listPublications(context.tenantId, {
      page,
      pageSize,
      channel: query.channel as (typeof PUBLICATION_CHANNELS)[number] | undefined,
      status: query.status as (typeof PUBLICATION_STATES)[number] | undefined,
      projectId: query.projectId,
      siteId: query.siteId,
      search: parseOptionalString(query.search) ?? undefined,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
      sort: query.sort as "scheduled" | "created" | "updated" | undefined,
      direction: query.direction as "asc" | "desc" | undefined,
      failedOnly: query.failed === "true",
    });

    return reply.send({
      ...publications,
      items: await Promise.all(
        publications.items.map(async (publication) => ({
          ...publication,
          assetUrl: await buildAssetPublicUrl(publication.version.contentImage?.storagePath ?? null),
        })),
      ),
    });
  });

  fastify.get("/v2/publications/:id", async (request, reply) => {
    const context = await requireStudioContext(request, reply);
    if (!context) {
      return;
    }
    const publicationId = (request.params as { id: string }).id;
    if (!isUuid(publicationId)) {
      return badRequest(reply, "invalid publication id");
    }
    const publication = await getPublication(context.tenantId, publicationId);
    if (!publication) {
      return notFound(reply, "publication not found");
    }
    return reply.send({
      ...publication,
      assetUrl: await buildAssetPublicUrl(publication.version.contentImage?.storagePath ?? null),
    });
  });

  fastify.post("/v2/publications", async (request, reply) => {
    const context = await requireStudioPermission(request, reply, "publishing.manage");
    if (!context) {
      return;
    }
    const body = parseBody<{
      projectId?: string;
      versionId?: string;
      channel?: string;
      accountId?: string;
      siteId?: string;
      socialContentId?: string;
      scheduledFor?: string;
      campaignId?: string;
    }>(request);
    if (!body.projectId || !isUuid(body.projectId)) {
      return badRequest(reply, "projectId is required");
    }
    if (!body.channel || !isOneOf(body.channel, PUBLICATION_CHANNELS)) {
      return badRequest(reply, `channel must be one of: ${PUBLICATION_CHANNELS.join(", ")}`);
    }

    const project = await prisma.contentProject.findFirst({
      where: { id: body.projectId, tenantId: context.tenantId },
      include: { versions: { orderBy: { versionNumber: "desc" }, take: 1 } },
    });
    if (!project) {
      return notFound(reply, "project not found");
    }
    const versionId = body.versionId ?? project.versions[0]?.id;
    if (!versionId) {
      return badRequest(reply, "project has no versions");
    }

    try {
      const publication = await createPublication({
        tenantId: context.tenantId,
        projectId: project.id,
        versionId,
        channel: body.channel as (typeof PUBLICATION_CHANNELS)[number],
        accountId: body.accountId ?? null,
        siteId: body.siteId ?? (body.channel === "website" ? project.siteId : null),
        socialContentId: body.socialContentId ?? null,
        scheduledFor: parseIsoDate(body.scheduledFor),
        campaignId: body.campaignId ?? null,
        manualOverride: true,
      });
      return reply.code(201).send(publication);
    } catch (error) {
      return badRequest(reply, error instanceof Error ? error.message : String(error));
    }
  });

  fastify.patch("/v2/publications/:id", async (request, reply) => {
    const context = await requireStudioPermission(request, reply, "publishing.manage");
    if (!context) {
      return;
    }
    const publicationId = (request.params as { id: string }).id;
    if (!isUuid(publicationId)) {
      return badRequest(reply, "invalid publication id");
    }
    const body = parseBody<{ scheduledFor?: string; accountId?: string | null }>(request);
    try {
      const publication = await updatePublicationSchedule(context.tenantId, publicationId, {
        scheduledFor: parseIsoDate(body.scheduledFor) ?? undefined,
        accountId: body.accountId,
      });
      if (!publication) {
        return notFound(reply, "publication not found");
      }
      return reply.send(publication);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message === "publication_not_editable" || message.startsWith("invalid_publication_transition")) {
        return conflict(reply, message);
      }
      return badRequest(reply, message);
    }
  });

  fastify.delete("/v2/publications/:id", async (request, reply) => {
    const context = await requireStudioPermission(request, reply, "publishing.manage");
    if (!context) {
      return;
    }
    const publicationId = (request.params as { id: string }).id;
    if (!isUuid(publicationId)) {
      return badRequest(reply, "invalid publication id");
    }
    try {
      const publication = await deletePublication(context.tenantId, publicationId);
      if (!publication) {
        return notFound(reply, "publication not found");
      }
      return reply.send(publication);
    } catch (error) {
      return conflict(reply, error instanceof Error ? error.message : String(error));
    }
  });

  fastify.post("/v2/publications/:id/schedule", async (request, reply) => {
    const context = await requireStudioPermission(request, reply, "publishing.manage");
    if (!context) {
      return;
    }
    const publicationId = (request.params as { id: string }).id;
    if (!isUuid(publicationId)) {
      return badRequest(reply, "invalid publication id");
    }
    const body = parseBody<{ scheduledFor?: string }>(request);
    const scheduledFor = parseIsoDate(body.scheduledFor);
    if (!scheduledFor) {
      return badRequest(reply, "scheduledFor (ISO date) is required");
    }
    try {
      const publication = await updatePublicationSchedule(context.tenantId, publicationId, { scheduledFor });
      if (!publication) {
        return notFound(reply, "publication not found");
      }
      return reply.send(publication);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message === "publication_not_editable" || message.startsWith("invalid_publication_transition")) {
        return conflict(reply, message);
      }
      return badRequest(reply, message);
    }
  });

  fastify.post("/v2/publications/:id/reschedule", async (request, reply) => {
    const context = await requireStudioPermission(request, reply, "publishing.manage");
    if (!context) {
      return;
    }
    const publicationId = (request.params as { id: string }).id;
    if (!isUuid(publicationId)) {
      return badRequest(reply, "invalid publication id");
    }
    const body = parseBody<{ scheduledFor?: string }>(request);
    const scheduledFor = parseIsoDate(body.scheduledFor);
    if (!scheduledFor) {
      return badRequest(reply, "scheduledFor (ISO date) is required");
    }
    try {
      const publication = await updatePublicationSchedule(context.tenantId, publicationId, { scheduledFor });
      if (!publication) {
        return notFound(reply, "publication not found");
      }
      return reply.send(publication);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message === "publication_not_editable" || message.startsWith("invalid_publication_transition")) {
        return conflict(reply, message);
      }
      return badRequest(reply, message);
    }
  });

  fastify.post("/v2/publications/:id/publish-now", async (request, reply) => {
    const context = await requireStudioPermission(request, reply, "publishing.manage");
    if (!context) {
      return;
    }
    const publicationId = (request.params as { id: string }).id;
    if (!isUuid(publicationId)) {
      return badRequest(reply, "invalid publication id");
    }
    try {
      const publication = await updatePublicationSchedule(context.tenantId, publicationId, {
        scheduledFor: new Date(Date.now() + 1000),
      });
      if (!publication) {
        return notFound(reply, "publication not found");
      }
      return reply.send(publication);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message === "publication_not_editable" || message.startsWith("invalid_publication_transition")) {
        return conflict(reply, message);
      }
      return badRequest(reply, message);
    }
  });

  fastify.post("/v2/publications/:id/cancel", async (request, reply) => {
    const context = await requireStudioPermission(request, reply, "publishing.manage");
    if (!context) {
      return;
    }
    const publicationId = (request.params as { id: string }).id;
    if (!isUuid(publicationId)) {
      return badRequest(reply, "invalid publication id");
    }
    try {
      const publication = await updatePublicationSchedule(context.tenantId, publicationId, { cancel: true });
      if (!publication) {
        return notFound(reply, "publication not found");
      }
      return reply.send(publication);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message === "publication_not_editable" || message.startsWith("invalid_publication_transition")) {
        return conflict(reply, message);
      }
      return badRequest(reply, message);
    }
  });

  fastify.post("/v2/publications/:id/retry", async (request, reply) => {
    const context = await requireStudioPermission(request, reply, "publishing.manage");
    if (!context) {
      return;
    }
    const publicationId = (request.params as { id: string }).id;
    if (!isUuid(publicationId)) {
      return badRequest(reply, "invalid publication id");
    }
    try {
      const publication = await retryPublication(context.tenantId, publicationId);
      if (!publication) {
        return notFound(reply, "publication not found");
      }
      return reply.send(publication);
    } catch (error) {
      return conflict(reply, error instanceof Error ? error.message : String(error));
    }
  });

  fastify.post("/v2/publications/:id/unpublish", async (request, reply) => {
    const context = await requireStudioPermission(request, reply, "publishing.manage");
    if (!context) {
      return;
    }
    const publicationId = (request.params as { id: string }).id;
    if (!isUuid(publicationId)) {
      return badRequest(reply, "invalid publication id");
    }
    try {
      const publication = await unpublishPublication(context.tenantId, publicationId);
      if (!publication) {
        return notFound(reply, "publication not found");
      }
      return reply.send(publication);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message === "publication_missing_external_id") {
        return conflict(reply, "publication has no external id to unpublish");
      }
      return conflict(reply, message);
    }
  });

  // ──────────────────────────────────────────────────────────── Calendar

  fastify.get("/v2/calendar", async (request, reply) => {
    const context = await requireStudioContext(request, reply);
    if (!context) {
      return;
    }
    const query = request.query as { from?: string; to?: string; channel?: string; siteId?: string };
    const from = parseIsoDate(query.from) ?? new Date(Date.now() - 7 * 24 * 3_600_000);
    const to = parseIsoDate(query.to) ?? new Date(Date.now() + 7 * 24 * 3_600_000);
    if (query.channel && !isOneOf(query.channel, PUBLICATION_CHANNELS)) {
      return badRequest(reply, `channel must be one of: ${PUBLICATION_CHANNELS.join(", ")}`);
    }
    const events = await listCalendarEvents(context.tenantId, {
      from,
      to,
      channel: query.channel as (typeof PUBLICATION_CHANNELS)[number] | undefined,
      siteId: query.siteId,
    });
    return reply.send({ items: events });
  });

  // ──────────────────────────────────────────────────────────── Social

  fastify.get("/v2/projects/:id/social", async (request, reply) => {
    const context = await requireStudioContext(request, reply);
    if (!context) {
      return;
    }
    const projectId = (request.params as { id: string }).id;
    if (!isUuid(projectId)) {
      return badRequest(reply, "invalid project id");
    }
    const channel = parseOptionalString((request.query as { channel?: string }).channel);
    if (channel && !isOneOf(channel, SOCIAL_CHANNELS)) {
      return badRequest(reply, `channel must be one of: ${SOCIAL_CHANNELS.join(", ")}`);
    }
    const social = await listSocialContent(context.tenantId, {
      projectId,
      channel: channel as "x" | "instagram" | undefined,
    });
    return reply.send({ items: social });
  });

  fastify.post("/v2/projects/:id/social/generate", async (request, reply) => {
    const context = await requireStudioPermission(request, reply, "projects.manage");
    if (!context) {
      return;
    }
    const projectId = (request.params as { id: string }).id;
    if (!isUuid(projectId)) {
      return badRequest(reply, "invalid project id");
    }
    const body = parseBody<{
      channels?: string[];
      threadLength?: number;
      versionId?: string;
    }>(request);
    const channels = (body.channels ?? ["x", "instagram"]).filter((channel): channel is "x" | "instagram" =>
      isOneOf(channel, SOCIAL_CHANNELS),
    );
    if (channels.length === 0) {
      return badRequest(reply, "channels must include x and/or instagram");
    }

    const project = await prisma.contentProject.findFirst({
      where: { id: projectId, tenantId: context.tenantId },
      include: { versions: { orderBy: { versionNumber: "desc" }, take: 1 } },
    });
    if (!project) {
      return notFound(reply, "project not found");
    }
    const versionId = body.versionId ?? project.versions[0]?.id;
    if (!versionId) {
      return badRequest(reply, "project has no versions");
    }

    try {
      const result = await createSocialGenerationJobs(context.tenantId, {
        projectId,
        versionId,
        channels,
        threadLength: body.threadLength ?? 1,
      });
      return reply.code(202).send({ job_id: result.jobId, status: "queued" });
    } catch (error) {
      return badRequest(reply, error instanceof Error ? error.message : String(error));
    }
  });

  fastify.patch("/v2/social/:id", async (request, reply) => {
    const context = await requireStudioPermission(request, reply, "projects.manage");
    if (!context) {
      return;
    }
    const socialId = (request.params as { id: string }).id;
    if (!isUuid(socialId)) {
      return badRequest(reply, "invalid social content id");
    }
    const body = parseBody<{
      body?: string;
      hashtags?: string[];
      editorialStatus?: string;
      mediaAssetIds?: string[];
    }>(request);
    if (body.editorialStatus && !isOneOf(body.editorialStatus, SOCIAL_EDITORIAL_STATUSES)) {
      return badRequest(reply, `editorialStatus must be one of: ${SOCIAL_EDITORIAL_STATUSES.join(", ")}`);
    }
    const social = await updateSocialContent(context.tenantId, socialId, {
      body: body.body,
      hashtags: body.hashtags,
      editorialStatus: body.editorialStatus as "draft" | "approved" | "rejected" | undefined,
      mediaAssetIds: body.mediaAssetIds,
    });
    if (!social) {
      return notFound(reply, "social content not found");
    }
    return reply.send(social);
  });

  fastify.post("/v2/social/:id/regenerate", async (request, reply) => {
    const context = await requireStudioPermission(request, reply, "projects.manage");
    if (!context) {
      return;
    }
    const socialId = (request.params as { id: string }).id;
    if (!isUuid(socialId)) {
      return badRequest(reply, "invalid social content id");
    }
    const result = await regenerateSocial(context.tenantId, socialId);
    if (!result) {
      return notFound(reply, "social content not found");
    }
    return reply.code(202).send({ job_id: result.jobId, status: "queued" });
  });

  // ──────────────────────────────────────────────────────────── Publishing accounts

  fastify.get("/v2/publishing-accounts", async (request, reply) => {
    const context = await requireStudioContext(request, reply);
    if (!context) {
      return;
    }
    const query = request.query as { platform?: string };
    if (query.platform && !isOneOf(query.platform, ACCOUNT_PLATFORMS)) {
      return badRequest(reply, `platform must be one of: ${ACCOUNT_PLATFORMS.join(", ")}`);
    }
    const accounts = await prisma.publishingAccount.findMany({
      where: {
        tenantId: context.tenantId,
        ...(query.platform ? { platform: query.platform as (typeof ACCOUNT_PLATFORMS)[number] } : {}),
      },
      orderBy: { platform: "asc" },
      include: { site: { select: { id: true, name: true, key: true } } },
    });
    return reply.send({
      items: accounts.map((account) => ({
        id: account.id,
        tenantId: account.tenantId,
        siteId: account.siteId,
        site: account.site,
        platform: account.platform,
        displayName: account.displayName,
        externalAccountId: account.externalAccountId,
        provider: account.provider,
        providerProfileId: account.providerProfileId,
        providerAccountId: account.providerAccountId,
        username: account.username,
        avatarUrl: account.avatarUrl,
        connectionStatus: account.connectionStatus,
        connectionMetadata: account.connectionMetadata,
        connectedAt: account.connectedAt,
        lastError: account.lastError,
        enabled: account.enabled,
        status: account.status,
        configuration: account.configuration,
        lastVerifiedAt: account.lastVerifiedAt,
        createdAt: account.createdAt,
        updatedAt: account.updatedAt,
        hasCredentials: Boolean(account.credentialsRef),
        // credentialsRef and credentialsCiphertext are intentionally never
        // serialized to the client (Phase 5 security hardening).
      })),
    });
  });

  fastify.post("/v2/publishing-accounts", async (request, reply) => {
    const context = await requireStudioPermission(request, reply, "integrations.manage");
    if (!context) {
      return;
    }
    const body = parseBody<{
      platform?: string;
      displayName?: string;
      externalAccountId?: string;
      credentialsRef?: string;
      siteId?: string;
      enabled?: boolean;
      configuration?: Record<string, unknown>;
    }>(request);
    if (!body.platform || !isOneOf(body.platform, ACCOUNT_PLATFORMS)) {
      return badRequest(reply, `platform must be one of: ${ACCOUNT_PLATFORMS.join(", ")}`);
    }
    if (!body.displayName?.trim()) {
      return badRequest(reply, "displayName is required");
    }
    if (body.platform !== "website" && !body.credentialsRef?.trim()) {
      return badRequest(reply, "credentialsRef (environment variable name) is required for social accounts");
    }
    const account = await prisma.publishingAccount.create({
      data: {
        tenantId: context.tenantId,
        siteId: parseOptionalString(body.siteId) ?? null,
        platform: body.platform as (typeof ACCOUNT_PLATFORMS)[number],
        displayName: body.displayName.trim(),
        externalAccountId: parseOptionalString(body.externalAccountId),
        credentialsRef: parseOptionalString(body.credentialsRef),
        enabled: body.enabled ?? true,
        configuration: body.configuration ? (body.configuration as Prisma.InputJsonObject) : Prisma.JsonNull,
      },
    });
    await writeAudit({
      tenantId: context.tenantId,
      actorType: "user",
      actorUserId: context.userId,
      action: "connection.created",
      entityType: "publishing_account",
      entityId: account.id,
      metadata: { platform: account.platform, siteId: account.siteId, hasCredentials: Boolean(account.credentialsRef) },
    });
    return reply.code(201).send({
      id: account.id,
      tenantId: account.tenantId,
      siteId: account.siteId,
      platform: account.platform,
      displayName: account.displayName,
      externalAccountId: account.externalAccountId,
      provider: account.provider,
      username: account.username,
      connectionStatus: account.connectionStatus,
      enabled: account.enabled,
      status: account.status,
      configuration: account.configuration,
      createdAt: account.createdAt,
      updatedAt: account.updatedAt,
      hasCredentials: Boolean(account.credentialsRef),
    });
  });

  fastify.patch("/v2/publishing-accounts/:id", async (request, reply) => {
    const context = await requireStudioPermission(request, reply, "integrations.manage");
    if (!context) {
      return;
    }
    const accountId = (request.params as { id: string }).id;
    if (!isUuid(accountId)) {
      return badRequest(reply, "invalid account id");
    }
    const body = parseBody<{
      displayName?: string;
      externalAccountId?: string;
      credentialsRef?: string;
      enabled?: boolean;
      status?: string;
      configuration?: Record<string, unknown>;
    }>(request);
    if (body.status && !isOneOf(body.status, ACCOUNT_STATUSES)) {
      return badRequest(reply, `status must be one of: ${ACCOUNT_STATUSES.join(", ")}`);
    }
    const existing = await prisma.publishingAccount.findFirst({ where: { id: accountId, tenantId: context.tenantId } });
    if (!existing) {
      return notFound(reply, "account not found");
    }
    const account = await prisma.publishingAccount.update({
      where: { id: existing.id },
      data: {
        displayName: body.displayName?.trim() || undefined,
        externalAccountId: parseOptionalString(body.externalAccountId) ?? undefined,
        credentialsRef: body.credentialsRef === undefined ? undefined : parseOptionalString(body.credentialsRef),
        enabled: body.enabled,
        status: body.status as (typeof ACCOUNT_STATUSES)[number] | undefined,
        configuration: body.configuration ? (body.configuration as Prisma.InputJsonObject) : undefined,
      },
    });
    await writeAudit({
      tenantId: context.tenantId,
      actorType: "user",
      actorUserId: context.userId,
      action: body.credentialsRef === undefined ? "connection.updated" : "connection.credential_replaced",
      entityType: "publishing_account",
      entityId: account.id,
      metadata: { platform: account.platform, enabled: account.enabled, hasCredentials: Boolean(account.credentialsRef) },
    });
    return reply.send({
      id: account.id,
      tenantId: account.tenantId,
      siteId: account.siteId,
      platform: account.platform,
      displayName: account.displayName,
      externalAccountId: account.externalAccountId,
      provider: account.provider,
      username: account.username,
      connectionStatus: account.connectionStatus,
      enabled: account.enabled,
      status: account.status,
      configuration: account.configuration,
      createdAt: account.createdAt,
      updatedAt: account.updatedAt,
      hasCredentials: Boolean(account.credentialsRef),
    });
  });

  fastify.delete("/v2/publishing-accounts/:id", async (request, reply) => {
    const context = await requireStudioPermission(request, reply, "integrations.manage");
    if (!context) {
      return;
    }
    const accountId = (request.params as { id: string }).id;
    if (!isUuid(accountId)) {
      return badRequest(reply, "invalid account id");
    }
    const existing = await prisma.publishingAccount.findFirst({ where: { id: accountId, tenantId: context.tenantId } });
    if (!existing) {
      return notFound(reply, "account not found");
    }
    await prisma.publishingAccount.delete({ where: { id: existing.id } });
    await writeAudit({
      tenantId: context.tenantId,
      actorType: "user",
      actorUserId: context.userId,
      action: "connection.deleted",
      entityType: "publishing_account",
      entityId: existing.id,
      metadata: { platform: existing.platform, siteId: existing.siteId },
    });
    return reply.send({ ok: true });
  });

  fastify.post("/v2/publishing-accounts/:id/verify", async (request, reply) => {
    const context = await requireStudioPermission(request, reply, "integrations.manage");
    if (!context) {
      return;
    }
    const accountId = (request.params as { id: string }).id;
    if (!isUuid(accountId)) {
      return badRequest(reply, "invalid account id");
    }
    const account = await prisma.publishingAccount.findFirst({ where: { id: accountId, tenantId: context.tenantId } });
    if (!account) {
      return notFound(reply, "account not found");
    }
    if (account.platform === "website") {
      return reply.send({ ok: true, message: "website_account_no_verification" });
    }
    const credentials = readCredentialsByRef(account.credentialsRef);
    if (!credentials) {
      return reply.send({ ok: false, message: "credentials_not_resolved" });
    }
    const { getSocialPublisher } = await import("./social-publishers");
    const publisher = getSocialPublisher(account.platform);
    const result = await publisher.validateCredentials(credentials);
    await prisma.publishingAccount.update({
      where: { id: account.id },
      data: {
        status: result.ok ? "active" : "error",
        lastVerifiedAt: new Date(),
      },
    });
    await writeAudit({
      tenantId: context.tenantId,
      actorType: "user",
      actorUserId: context.userId,
      action: "connection.tested",
      entityType: "publishing_account",
      entityId: account.id,
      metadata: { platform: account.platform, ok: result.ok },
    });
    return reply.send(result);
  });

  // ──────────────────────────────────────────────────────────── Automation

  fastify.get("/v2/automation", async (request, reply) => {
    const context = await requireStudioContext(request, reply);
    if (!context) {
      return;
    }
    const siteId = parseOptionalString((request.query as { siteId?: string }).siteId) ?? null;
    const policy = await getOrCreatePolicy(context.tenantId, siteId);
    return reply.send(policy);
  });

  fastify.patch("/v2/automation", async (request, reply) => {
    const context = await requireStudioPermission(request, reply, "workspace.manage");
    if (!context) {
      return;
    }
    const body = parseBody<UpdatePolicyInput & { siteId?: string }>(request);
    try {
      const policy = await updatePolicy(
        context.tenantId,
        parseOptionalString(body.siteId) ?? null,
        {
          enabled: body.enabled,
          timezone: body.timezone,
          articlesPerDay: body.articlesPerDay,
          maxArticlesPerDay: body.maxArticlesPerDay,
          xPostsPerDay: body.xPostsPerDay,
          instagramPostsPerDay: body.instagramPostsPerDay,
          minimumMinutesBetweenArticles: body.minimumMinutesBetweenArticles,
          activeDaysOfWeek: body.activeDaysOfWeek,
          publishingWindows: body.publishingWindows,
          autoGenerate: body.autoGenerate,
          autoApprove: body.autoApprove,
          autoSchedule: body.autoSchedule,
          autoPublish: body.autoPublish,
          minimumStoryScore: body.minimumStoryScore,
          categories: body.categories,
          excludedCategories: body.excludedCategories,
          priorityTopics: body.priorityTopics,
          imageRequired: body.imageRequired,
          socialRequired: body.socialRequired,
          maximumQueueSize: body.maximumQueueSize,
          articlesPerHour: body.articlesPerHour,
          socialPostsPerHour: body.socialPostsPerHour,
          maximumDailySocial: body.maximumDailySocial,
          socialTimingMinutesX: body.socialTimingMinutesX,
          socialTimingMinutesInstagram: body.socialTimingMinutesInstagram,
          sourceSelectionRules: body.sourceSelectionRules,
          mode: body.mode,
          autoRepair: body.autoRepair,
          maxRepairAttempts: body.maxRepairAttempts,
          autonomousQaThresholds: body.autonomousQaThresholds,
          sourceRequirements: body.sourceRequirements,
        },
        context.userId,
      );
      return reply.send(policy);
    } catch (error) {
      return badRequest(reply, error instanceof Error ? error.message : String(error));
    }
  });

  fastify.get("/v2/automation/status", async (request, reply) => {
    const context = await requireStudioContext(request, reply);
    if (!context) {
      return;
    }
    const siteId = parseOptionalString((request.query as { siteId?: string }).siteId) ?? null;
    return reply.send(await getAutomationStatus(context.tenantId, siteId));
  });

  fastify.post("/v2/automation/pause", async (request, reply) => {
    const context = await requireStudioPermission(request, reply, "workspace.manage");
    if (!context) {
      return;
    }
    const body = parseBody<{ siteId?: string; reason?: string }>(request);
    const policy = await pauseAutomation(
      context.tenantId,
      parseOptionalString(body.siteId) ?? null,
      parseOptionalString(body.reason) ?? "paused_manually",
      context.userId,
    );
    return reply.send(policy);
  });

  fastify.post("/v2/automation/resume", async (request, reply) => {
    const context = await requireStudioPermission(request, reply, "workspace.manage");
    if (!context) {
      return;
    }
    const body = parseBody<{ siteId?: string }>(request);
    const policy = await resumeAutomation(context.tenantId, parseOptionalString(body.siteId) ?? null, context.userId);
    return reply.send(policy);
  });

  fastify.get("/v2/automation/health", async (request, reply) => {
    const context = await requireStudioContext(request, reply);
    if (!context) {
      return;
    }
    const workers = await listWorkerHeartbeats();
    const policies = await prisma.automationPolicy.findMany({
      where: { tenantId: context.tenantId },
      select: {
        id: true,
        siteId: true,
        mode: true,
        enabled: true,
        state: true,
        circuitOpen: true,
        circuitOpenedAt: true,
        consecutivePublishFailures: true,
        pausedReason: true,
      },
    });
    const redisConfigured = Boolean(getEnv("REDIS_URL", ""));
    return reply.send({
      redisConfigured,
      workers,
      policies,
      degraded: !redisConfigured || workers.some((worker) => worker.stale) || policies.some((policy) => policy.circuitOpen),
    });
  });

  fastify.post("/v2/automation/recover", async (request, reply) => {
    const context = await requireStudioPermission(request, reply, "workspace.manage");
    if (!context) {
      return;
    }
    const body = parseBody<{ siteId?: string; dryRun?: boolean; statuses?: string[] }>(request);
    const report = await recoverStuckAutoProjects({
      tenantId: context.tenantId,
      siteId: parseOptionalString(body.siteId) ?? null,
      dryRun: body.dryRun === true,
      statuses: Array.isArray(body.statuses) ? body.statuses : undefined,
    });
    return reply.send(report);
  });

  // ──────────────────────────────────────────────────────────── Editorial plans

  fastify.get("/v2/editorial-plans", async (request, reply) => {
    const context = await requireStudioContext(request, reply);
    if (!context) return;
    const query = request.query as { page?: string; pageSize?: string };
    return reply.send(await listEditorialPlans(
      context.tenantId,
      parsePage(query.page, 1),
      parsePageSize(query.pageSize, 20),
    ));
  });

  fastify.get("/v2/editorial-plans/:id", async (request, reply) => {
    const context = await requireStudioContext(request, reply);
    if (!context) return;
    const planId = (request.params as { id: string }).id;
    if (!isUuid(planId)) return badRequest(reply, "invalid editorial plan id");
    const plan = await getEditorialPlan(context.tenantId, planId);
    if (!plan) return notFound(reply, "editorial plan not found");
    return reply.send(plan);
  });

  fastify.post("/v2/editorial-plans/generate", async (request, reply) => {
    const context = await requireStudioPermission(request, reply, "projects.manage");
    if (!context) return;
    const body = parseBody<{
      siteId?: string;
      briefId?: string;
      dateFrom?: string;
      dateTo?: string;
      objective?: string;
      channels?: string[];
      publicationCount?: number;
      frequency?: string;
      timezone?: string;
      accountIds?: string[];
      language?: string;
      audience?: string;
      topics?: string[];
      excludedTopics?: string[];
      strategyMode?: string;
      primaryIntent?: string;
      contentFormats?: string[];
      market?: string;
      campaignName?: string;
      existingCluster?: string;
      newCluster?: boolean;
      freeAiDiscovery?: boolean;
      seasonalEvents?: string[];
      brandsOrEntities?: string[];
      keywordSeeds?: string[];
      allowWithoutIntelligence?: boolean;
      async?: boolean;
    }>(request);
    const dateFrom = parseIsoDate(body.dateFrom);
    const dateTo = parseIsoDate(body.dateTo);
    const channels = (body.channels ?? []).filter((channel): channel is (typeof PUBLICATION_CHANNELS)[number] =>
      isOneOf(channel, PUBLICATION_CHANNELS),
    );
    if (!dateFrom || !dateTo) return badRequest(reply, "dateFrom and dateTo are required ISO dates");
    if (!body.siteId || !isUuid(body.siteId)) return badRequest(reply, "siteId is required and must be a valid id");
    if (channels.length === 0) return badRequest(reply, "channels must include website, x, or instagram");
    if (!body.publicationCount) return badRequest(reply, "publicationCount must be greater than zero");
    try {
      const generationInput: GenerateEditorialPlanInput = {
        tenantId: context.tenantId,
        siteId: parseOptionalString(body.siteId),
        briefId: parseOptionalString(body.briefId),
        dateFrom,
        dateTo,
        objective: parseOptionalString(body.objective),
        channels,
        publicationCount: body.publicationCount,
        frequency: parseOptionalString(body.frequency),
        timezone: parseOptionalString(body.timezone) ?? "Europe/Madrid",
        accountIds: body.accountIds ?? [],
        language: parseOptionalString(body.language) ?? "es",
        audience: parseOptionalString(body.audience),
        topics: body.topics ?? [],
        excludedTopics: body.excludedTopics ?? [],
        userId: context.userId,
        allowWithoutIntelligence: body.allowWithoutIntelligence === true,
        strategy: {
          mode: (parseOptionalString(body.strategyMode) ?? "balanced") as (typeof STRATEGY_MODES)[number],
          primaryIntent: parseOptionalString(body.primaryIntent) as (typeof SEARCH_INTENTS)[number] | null,
          contentFormats: (body.contentFormats ?? []).filter((format): format is (typeof CONTENT_FORMATS)[number] => isOneOf(format, CONTENT_FORMATS)),
          market: parseOptionalString(body.market),
          campaignName: parseOptionalString(body.campaignName),
          language: parseOptionalString(body.language) ?? "es",
          audience: parseOptionalString(body.audience),
          objective: parseOptionalString(body.objective),
          priorityTopics: body.topics ?? [],
          excludedTopics: body.excludedTopics ?? [],
          existingCluster: parseOptionalString(body.existingCluster),
          newCluster: body.newCluster === true,
          freeAiDiscovery: body.freeAiDiscovery === true,
          seasonalEvents: body.seasonalEvents ?? [],
          brandsOrEntities: body.brandsOrEntities ?? [],
          keywordSeeds: body.keywordSeeds ?? [],
        },
      };

      if (body.async !== false) {
        const enqueued = await enqueueEditorialPlanGeneration(generationInput);
        return reply.code(202).send({ planId: enqueued.planId, status: "generating" });
      }

      const plan = await generateEditorialPlan(generationInput);
      return reply.code(201).send(plan);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message === "EDITORIAL_PLAN_STRUCTURED_OUTPUT_INVALID") {
        return badRequest(
          reply,
          "The AI returned an invalid planning response. Auctorio retried automatically but could not build a valid plan.",
        );
      }
      if (message === "site_intelligence_required") {
        return badRequest(reply, "Site intelligence is missing. Index the website before planning (or allowWithoutIntelligence for degraded mode).");
      }
      if (message === "EDITORIAL_PLAN_NO_RELEVANT_ITEMS") {
        return badRequest(reply, "The AI could not propose topics relevant to the selected website. Review the site profile and topic priorities.");
      }
      return badRequest(reply, message);
    }
  });

  fastify.patch("/v2/editorial-plan-items/:id", async (request, reply) => {
    const context = await requireStudioPermission(request, reply, "projects.manage");
    if (!context) return;
    const itemId = (request.params as { id: string }).id;
    if (!isUuid(itemId)) return badRequest(reply, "invalid editorial plan item id");
    const body = parseBody<Record<string, unknown>>(request);
    const stringOrNull = (value: unknown) => (typeof value === "string" || value === null ? value : undefined);
    const stringArrayOrNull = (value: unknown) => (Array.isArray(value) && value.every((entry) => typeof entry === "string") ? value : value === null ? null : undefined);
    const updated = await updateEditorialPlanItem(context.tenantId, itemId, {
      title: typeof body.title === "string" ? body.title : undefined,
      workingTitle: stringOrNull(body.workingTitle),
      topic: stringOrNull(body.topic),
      scheduledFor: body.scheduledFor === null ? null : parseIsoDate(body.scheduledFor),
      primaryKeyword: stringOrNull(body.primaryKeyword),
      seoTitle: stringOrNull(body.seoTitle),
      metaDescription: stringOrNull(body.metaDescription),
      socialHook: stringOrNull(body.socialHook),
      imageConcept: stringOrNull(body.imageConcept),
      imageRequirements: stringOrNull(body.imageRequirements),
      priority: typeof body.priority === "number" ? body.priority : undefined,
      notes: stringOrNull(body.notes),
      contentType: stringOrNull(body.contentType),
      primaryIntent: stringOrNull(body.primaryIntent),
      secondaryIntents: stringArrayOrNull(body.secondaryIntents),
      funnelStage: stringOrNull(body.funnelStage),
      targetQuery: stringOrNull(body.targetQuery),
      semanticKeywords: stringArrayOrNull(body.semanticKeywords),
      questionsToAnswer: stringArrayOrNull(body.questionsToAnswer),
      topicCluster: stringOrNull(body.topicCluster),
      pillarPage: stringOrNull(body.pillarPage),
      finalSuggestedTitle: stringOrNull(body.finalSuggestedTitle),
      angle: stringOrNull(body.angle),
      editorialObjective: stringOrNull(body.editorialObjective),
      competitorAngle: stringOrNull(body.competitorAngle),
      suggestedInternalLinks: stringArrayOrNull(body.suggestedInternalLinks),
      suggestedExternalEvidenceTypes: stringArrayOrNull(body.suggestedExternalEvidenceTypes),
      faqCandidates: Array.isArray(body.faqCandidates) ? body.faqCandidates : body.faqCandidates === null ? null : undefined,
      schemaTypes: stringArrayOrNull(body.schemaTypes),
      outline: Array.isArray(body.outline) ? body.outline : body.outline === null ? null : undefined,
      recommendedWordCountMin: typeof body.recommendedWordCountMin === "number" || body.recommendedWordCountMin === null ? body.recommendedWordCountMin : undefined,
      recommendedWordCountMax: typeof body.recommendedWordCountMax === "number" || body.recommendedWordCountMax === null ? body.recommendedWordCountMax : undefined,
      difficultyEstimate: typeof body.difficultyEstimate === "number" || body.difficultyEstimate === null ? body.difficultyEstimate : undefined,
      confidence: typeof body.confidence === "number" || body.confidence === null ? body.confidence : undefined,
      rationale: stringOrNull(body.rationale),
      freshnessRequirement: stringOrNull(body.freshnessRequirement),
    });
    if (!updated) return notFound(reply, "editorial plan item not found");
    return reply.send(updated);
  });

  fastify.post("/v2/editorial-plan-items/:id/approve", async (request, reply) => {
    const context = await requireStudioPermission(request, reply, "review.approve");
    if (!context) return;
    const itemId = (request.params as { id: string }).id;
    if (!isUuid(itemId)) return badRequest(reply, "invalid editorial plan item id");
    const updated = await setEditorialPlanItemStatus(context.tenantId, itemId, "approved", context.userId);
    if (!updated) return notFound(reply, "editorial plan item not found");
    return reply.send(updated);
  });

  fastify.post("/v2/editorial-plan-items/bulk-approve", async (request, reply) => {
    const context = await requireStudioPermission(request, reply, "review.approve");
    if (!context) return;
    const body = parseBody<{ itemIds?: string[] }>(request);
    if (!Array.isArray(body.itemIds) || body.itemIds.length === 0 || body.itemIds.some((id) => !isUuid(id))) return badRequest(reply, "itemIds must contain valid ids");
    return reply.send(await bulkApproveEditorialPlanItems(context.tenantId, body.itemIds, context.userId));
  });

  fastify.post("/v2/editorial-plan-items/bulk-status", async (request, reply) => {
    const context = await requireStudioPermission(request, reply, "review.approve");
    if (!context) return;
    const body = parseBody<{ itemIds?: string[]; status?: string }>(request);
    if (!Array.isArray(body.itemIds) || body.itemIds.length === 0 || body.itemIds.some((id) => !isUuid(id))) return badRequest(reply, "itemIds must contain valid ids");
    if (!body.status || !["approved", "rejected", "proposed", "canceled"].includes(body.status)) return badRequest(reply, "status must be one of: approved, rejected, proposed, canceled");
    return reply.send(await bulkSetEditorialPlanItemStatus(context.tenantId, body.itemIds, body.status as "approved" | "rejected" | "proposed" | "canceled", context.userId));
  });

  fastify.post("/v2/editorial-plan-items/bulk-delete", async (request, reply) => {
    const context = await requireStudioPermission(request, reply, "projects.manage");
    if (!context) return;
    const body = parseBody<{ itemIds?: string[] }>(request);
    if (!Array.isArray(body.itemIds) || body.itemIds.length === 0 || body.itemIds.some((id) => !isUuid(id))) return badRequest(reply, "itemIds must contain valid ids");
    try {
      return reply.send(await bulkDeleteEditorialPlanItems(context.tenantId, body.itemIds, context.userId));
    } catch (error) {
      return conflict(reply, error instanceof Error ? error.message : String(error));
    }
  });

  fastify.delete("/v2/editorial-plan-items/:id", async (request, reply) => {
    const context = await requireStudioPermission(request, reply, "projects.manage");
    if (!context) return;
    const itemId = (request.params as { id: string }).id;
    if (!isUuid(itemId)) return badRequest(reply, "invalid editorial plan item id");
    try {
      const deleted = await deleteEditorialPlanItem(context.tenantId, itemId, context.userId);
      if (!deleted) return notFound(reply, "editorial plan item not found");
      return reply.send(deleted);
    } catch (error) {
      return conflict(reply, error instanceof Error ? error.message : String(error));
    }
  });

  fastify.post("/v2/editorial-plan-items/:id/generate-content", async (request, reply) => {
    const context = await requireStudioPermission(request, reply, "projects.manage");
    if (!context) return;
    const itemId = (request.params as { id: string }).id;
    if (!isUuid(itemId)) return badRequest(reply, "invalid editorial plan item id");
    try {
      const result = await generateContentFromEditorialPlanItem(context.tenantId, itemId, context.userId);
      if (!result) return notFound(reply, "editorial plan item not found");
      return reply.code(202).send(result);
    } catch (error) {
      return badRequest(reply, error instanceof Error ? error.message : String(error));
    }
  });

  // ──────────────────────────────────────────────────────────── AI usage

  fastify.get("/v2/ai-usage", async (request, reply) => {
    const context = await requireStudioPermission(request, reply, "workspace.manage");
    if (!context) return;
    const [textGroups, imageGroups] = await Promise.all([
      prisma.contentText.groupBy({
        by: ["provider", "model"],
        where: { tenantId: context.tenantId },
        _count: { _all: true },
        _sum: { costUsd: true, tokensInput: true, tokensOutput: true },
      }),
      prisma.contentImage.groupBy({
        by: ["provider", "model"],
        where: { tenantId: context.tenantId },
        _count: { _all: true },
        _sum: { costUsd: true },
      }),
    ]);
    const rows = new Map<string, { provider: string; model: string; textCount: number; imageCount: number; tokensInput: number; tokensOutput: number; costUsd: number }>();
    for (const group of textGroups) {
      const key = `${group.provider ?? "unknown"}|${group.model ?? "unknown"}`;
      rows.set(key, {
        provider: group.provider ?? "unknown",
        model: group.model ?? "unknown",
        textCount: group._count._all,
        imageCount: 0,
        tokensInput: group._sum.tokensInput ?? 0,
        tokensOutput: group._sum.tokensOutput ?? 0,
        costUsd: Number(group._sum.costUsd ?? 0),
      });
    }
    for (const group of imageGroups) {
      const key = `${group.provider ?? "unknown"}|${group.model ?? "unknown"}`;
      const existing = rows.get(key);
      rows.set(key, {
        provider: existing?.provider ?? group.provider ?? "unknown",
        model: existing?.model ?? group.model ?? "unknown",
        textCount: existing?.textCount ?? 0,
        imageCount: group._count._all,
        tokensInput: existing?.tokensInput ?? 0,
        tokensOutput: existing?.tokensOutput ?? 0,
        costUsd: (existing?.costUsd ?? 0) + Number(group._sum.costUsd ?? 0),
      });
    }
    return reply.send({ rows: Array.from(rows.values()) });
  });

  // ──────────────────────────────────────────────────────────── Campaigns & briefs

  fastify.get("/v2/campaigns", async (request, reply) => {
    const context = await requireStudioContext(request, reply);
    if (!context) {
      return;
    }
    const campaigns = await prisma.campaign.findMany({
      where: { tenantId: context.tenantId },
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { projects: true, publications: true } } },
    });
    return reply.send({ items: campaigns });
  });

  fastify.post("/v2/campaigns", async (request, reply) => {
    const context = await requireStudioPermission(request, reply, "projects.manage");
    if (!context) {
      return;
    }
    const body = parseBody<{ name?: string; description?: string; startAt?: string; endAt?: string; tags?: string[] }>(request);
    if (!body.name?.trim()) {
      return badRequest(reply, "name is required");
    }
    const campaign = await prisma.campaign.create({
      data: {
        tenantId: context.tenantId,
        name: body.name.trim(),
        description: parseOptionalString(body.description),
        startAt: parseIsoDate(body.startAt),
        endAt: parseIsoDate(body.endAt),
        tags: body.tags && body.tags.length ? (body.tags as Prisma.InputJsonValue) : Prisma.JsonNull,
      },
    });
    return reply.code(201).send(campaign);
  });

  fastify.delete("/v2/campaigns/:id", async (request, reply) => {
    const context = await requireStudioPermission(request, reply, "projects.manage");
    if (!context) {
      return;
    }
    const campaignId = (request.params as { id: string }).id;
    if (!isUuid(campaignId)) {
      return badRequest(reply, "invalid campaign id");
    }
    const existing = await prisma.campaign.findFirst({ where: { id: campaignId, tenantId: context.tenantId } });
    if (!existing) {
      return notFound(reply, "campaign not found");
    }
    await prisma.campaign.delete({ where: { id: existing.id } });
    return reply.send({ ok: true });
  });

  fastify.get("/v2/briefs", async (request, reply) => {
    const context = await requireStudioContext(request, reply);
    if (!context) {
      return;
    }
    const briefs = await prisma.editorialBrief.findMany({
      where: { tenantId: context.tenantId },
      orderBy: { createdAt: "desc" },
    });
    return reply.send({ items: briefs });
  });

  fastify.post("/v2/briefs", async (request, reply) => {
    const context = await requireStudioPermission(request, reply, "projects.manage");
    if (!context) {
      return;
    }
    const body = parseBody<{
      name?: string;
      topic?: string;
      audience?: string;
      tone?: string;
      keywords?: string[];
      seoIntent?: string;
      channels?: string[];
      imageStyle?: string;
      publicationFrequency?: string;
    }>(request);
    if (!body.name?.trim()) {
      return badRequest(reply, "name is required");
    }
    const brief = await prisma.editorialBrief.create({
      data: {
        tenantId: context.tenantId,
        name: body.name.trim(),
        topic: parseOptionalString(body.topic),
        audience: parseOptionalString(body.audience),
        tone: parseOptionalString(body.tone),
        keywords: body.keywords && body.keywords.length ? (body.keywords as Prisma.InputJsonValue) : Prisma.JsonNull,
        seoIntent: parseOptionalString(body.seoIntent),
        channels: body.channels && body.channels.length ? (body.channels as Prisma.InputJsonValue) : Prisma.JsonNull,
        imageStyle: parseOptionalString(body.imageStyle),
        publicationFrequency: parseOptionalString(body.publicationFrequency),
      },
    });
    return reply.code(201).send(brief);
  });

  fastify.delete("/v2/briefs/:id", async (request, reply) => {
    const context = await requireStudioPermission(request, reply, "projects.manage");
    if (!context) {
      return;
    }
    const briefId = (request.params as { id: string }).id;
    if (!isUuid(briefId)) {
      return badRequest(reply, "invalid brief id");
    }
    const existing = await prisma.editorialBrief.findFirst({ where: { id: briefId, tenantId: context.tenantId } });
    if (!existing) {
      return notFound(reply, "brief not found");
    }
    await prisma.editorialBrief.delete({ where: { id: existing.id } });
    return reply.send({ ok: true });
  });

  // ──────────────────────────────────────────────────────────── Audit

  fastify.get("/v2/audit", async (request, reply) => {
    const context = await requireStudioPermission(request, reply, "workspace.manage");
    if (!context) {
      return;
    }
    const query = request.query as {
      page?: string;
      pageSize?: string;
      entityType?: string;
      entityId?: string;
      action?: string;
    };
    const page = parsePage(query.page, 1);
    const pageSize = parsePageSize(query.pageSize, 50);
    return reply.send(
      await listAudit(context.tenantId, {
        page,
        pageSize,
        entityType: query.entityType,
        entityId: query.entityId,
        action: query.action,
      }),
    );
  });

  // ──────────────────────────────────────────────────────────── Dashboard overview

  fastify.get("/v2/overview", async (request, reply) => {
    const context = await requireStudioContext(request, reply);
    if (!context) {
      return;
    }
    const tenantId = context.tenantId;
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart.getTime() + 24 * 3_600_000);
    const weekEnd = new Date(dayStart.getTime() + 7 * 24 * 3_600_000);

    const [
      todayPlannedArticles,
      todayPublishedArticles,
      todayPlannedX,
      todayPlannedIg,
      inboxCandidates,
      draftsCount,
      reviewCount,
      scheduledCount,
      failedCount,
      sources,
      recentPublications,
      automation,
      connections,
      weekPlanItems,
      todayPlanCount,
    ] = await Promise.all([
      prisma.publication.count({
        where: { tenantId, channel: "website", scheduledFor: { gte: dayStart, lt: dayEnd }, status: { notIn: ["deleted", "canceled"] } },
      }),
      prisma.publication.count({
        where: { tenantId, channel: "website", status: "published", publishedAt: { gte: dayStart, lt: dayEnd } },
      }),
      prisma.publication.count({
        where: { tenantId, channel: "x", scheduledFor: { gte: dayStart, lt: dayEnd }, status: { notIn: ["deleted", "canceled"] } },
      }),
      prisma.publication.count({
        where: { tenantId, channel: "instagram", scheduledFor: { gte: dayStart, lt: dayEnd }, status: { notIn: ["deleted", "canceled"] } },
      }),
      prisma.sourceItem.count({ where: { tenantId, processingStatus: "candidate" } }),
      prisma.contentProject.count({ where: { tenantId, deletedAt: null, status: { in: ["draft", "ai_generated"] } } }),
      prisma.contentProject.count({ where: { tenantId, deletedAt: null, status: { in: ["in_review", "qa_passed"] } } }),
      prisma.publication.count({ where: { tenantId, status: { in: ["scheduled", "queued"] } } }),
      prisma.publication.count({ where: { tenantId, status: "failed" } }),
      prisma.contentSource.findMany({
        where: { tenantId },
        select: { id: true, name: true, type: true, enabled: true, lastSuccessAt: true, consecutiveFailures: true },
      }),
      prisma.publication.findMany({
        where: { tenantId, status: { not: "deleted" } },
        orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
        take: 8,
        include: {
          project: { select: { id: true, title: true } },
          site: { select: { id: true, name: true } },
          account: { select: { id: true, displayName: true } },
        },
      }),
      getAutomationStatus(tenantId, null),
      prisma.publishingAccount.findMany({
        where: { tenantId },
        orderBy: [{ platform: "asc" }, { displayName: "asc" }],
        select: {
          id: true,
          platform: true,
          displayName: true,
          enabled: true,
          status: true,
          provider: true,
          providerProfileId: true,
          username: true,
          connectionStatus: true,
          credentialsRef: true,
          lastVerifiedAt: true,
          site: { select: { name: true } },
        },
      }),
      prisma.editorialPlanItem.findMany({
        where: {
          tenantId,
          scheduledFor: { gte: dayStart, lt: weekEnd },
          status: { notIn: ["canceled", "rejected"] },
        },
        select: { channel: true, status: true, projectId: true },
      }),
      prisma.editorialPlanItem.count({
        where: {
          tenantId,
          scheduledFor: { gte: dayStart, lt: dayEnd },
          status: { notIn: ["canceled", "rejected"] },
        },
      }),
    ]);

    return reply.send({
      today: {
        articlesPlanned: todayPlannedArticles,
        articlesPublished: todayPublishedArticles,
        xPosts: todayPlannedX,
        instagramPosts: todayPlannedIg,
      },
      pipeline: {
        inboxCandidates,
        drafts: draftsCount,
        review: reviewCount,
        scheduled: scheduledCount,
        failed: failedCount,
      },
      sources: {
        total: sources.length,
        enabled: sources.filter((source) => source.enabled).length,
        degraded: sources.filter((source) => source.enabled && source.consecutiveFailures > 0).length,
        failing: sources.filter((source) => source.enabled && source.consecutiveFailures >= 3).length,
      },
      automation: {
        enabled: automation.enabled,
        state: automation.state,
        pausedReason: automation.pausedReason,
        warnings: automation.warnings,
        nextSlots: automation.nextSlots.slice(0, 5),
      },
      connections: connections.map((connection) => ({
        id: connection.id,
        platform: connection.platform,
        displayName: connection.username ? `@${connection.username}` : connection.displayName,
        enabled: connection.enabled,
        status: connection.status,
        connectionState: computeConnectionState(connection as never),
        lastVerifiedAt: connection.lastVerifiedAt,
        siteName: connection.site?.name ?? null,
      })),
      planCoverage: {
        today: todayPlanCount,
        week: {
          total: weekPlanItems.length,
          generated: weekPlanItems.filter((item) => item.projectId !== null).length,
          approved: weekPlanItems.filter((item) => item.status === "approved").length,
          website: weekPlanItems.filter((item) => item.channel === "website").length,
          x: weekPlanItems.filter((item) => item.channel === "x").length,
          instagram: weekPlanItems.filter((item) => item.channel === "instagram").length,
        },
      },
      recentPublications: recentPublications.map((publication) => ({
        id: publication.id,
        channel: publication.channel,
        status: publication.status,
        scheduledFor: publication.scheduledFor,
        publishedAt: publication.publishedAt,
        title: publication.project.title,
        destination:
          publication.channel === "website"
            ? publication.site?.name ?? "Website"
            : publication.account?.displayName ?? publication.channel,
        lastError: publication.lastError,
      })),
      failures: await prisma.publication.findMany({
        where: { tenantId, status: "failed" },
        orderBy: { updatedAt: "desc" },
        take: 5,
        select: {
          id: true,
          channel: true,
          lastError: true,
          failureClass: true,
          updatedAt: true,
          project: { select: { id: true, title: true } },
        },
      }),
    });
  });

  // ──────────────────────────────────────────────────────────── Worker health

  fastify.get("/v2/health/workers", async (request, reply) => {
    const context = await requireStudioContext(request, reply);
    if (!context) {
      return;
    }
    try {
      const { Queue } = await import("bullmq");
      const { getRedisConnectionOptions } = await import("../infrastructure/queue/redis");
      const { webIntelligenceAvailability } = await import("./web-intelligence");
      const { providerAvailability } = await import("./social-connections");
      const connection = getRedisConnectionOptions();

      const entries = await Promise.all(
        Object.values(QUEUE_NAMES).map(async (name) => {
          const queue = new Queue(name, { connection });
          try {
            const counts = await queue.getJobCounts("waiting", "active", "delayed", "failed", "completed");
            return { queue: name, ...counts };
          } finally {
            await queue.close();
          }
        }),
      );

      // Recent connection health for social accounts.
      const accounts = await prisma.publishingAccount.findMany({
        where: { tenantId: context.tenantId, platform: { in: ["x", "instagram"] } },
        select: { platform: true, provider: true, connectionStatus: true, lastVerifiedAt: true, enabled: true, username: true },
        orderBy: { platform: "asc" },
      });

      return reply.send({
        workers: entries,
        providers: {
          social: providerAvailability(),
          webIntelligence: webIntelligenceAvailability(),
        },
        connections: accounts.map((account) => ({
          platform: account.platform,
          provider: account.provider,
          username: account.username,
          enabled: account.enabled,
          connectionStatus: account.connectionStatus ?? "unknown",
          lastVerifiedAt: account.lastVerifiedAt,
        })),
      });
    } catch (error) {
      return reply.code(503).send({ status: "degraded", message: error instanceof Error ? error.message : String(error) });
    }
  });
}

function readCredentialsByRef(credentialsRef: string | null | undefined): Record<string, unknown> | null {
  if (!credentialsRef) {
    return null;
  }
  const raw = getEnvValue(credentialsRef);
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function getEnvValue(name: string): string {
  return process.env[name] ?? "";
}
