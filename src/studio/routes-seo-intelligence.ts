// Search Console of a site and the decisions made with its data.

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { SearchConsoleError } from "../infrastructure/google/search-console";
import { errorBody, isOneOf, isUuid, badRequest, parseBody, parseOptionalString, requireStudioPermission, type StudioRequestContext } from "./http-utils";
import { hasStudioPermission, type StudioPermission } from "./security";
import {
  completeSearchConsoleConnection,
  disconnectSearchConsole,
  getSearchConsoleStatus,
  listSiteSearchConsoleProperties,
  selectSearchConsoleProperty,
  startSearchConsoleConnection,
  syncSearchConsole,
} from "./search-console";
import { readSeoControl } from "./seo-control";
import { OPPORTUNITY_DECISIONS, analyzeSite, completeSeoOpportunity, decideSeoOpportunity, getSeoProfile, listSeoOpportunities, saveSeoProfile, startOpportunityRevision } from "./seo-intelligence";
import { outcomeSummary } from "./seo-intelligence/attribution";
import { saveResearchProfile } from "./seo-research/profile";
import { intensityOf, workspaceResearchPolicy } from "./seo-research/policy";
import { RUN_CONTROLS, controlResearchRun, getResearchRun, requestResearch } from "./seo-research/runs";
import type { ResearchFocus } from "./seo-research/triggers";
import { getPrismaClient } from "../infrastructure/db/prisma";
import { previewResearch, researchAllowance, researchForWorkspace, runForWorkspace, withoutCosts, workspaceKeywordHistory, workspaceKeywords, workspaceOverview, workspacePerformance } from "./seo-workspace";

const prisma = getPrismaClient();

const STATUS: Record<string, number> = {
  site_not_found: 404, opportunity_not_found: 404, keyword_not_found: 404, search_console_not_connected: 409, search_console_not_configured: 503, opportunity_already_acted: 409, opportunity_conflicts_with_approved: 409, opportunity_changed: 409,
  opportunity_not_revisable: 409, opportunity_not_approved: 409, optimization_page_not_managed: 409, generation_in_flight: 409,
  search_console_syncing: 409, external_seo_stopped: 409, site_base_url_required: 400, search_console_unknown_state: 400, search_console_state_expired: 400, search_console_property_not_allowed: 400, invalid_profile: 400, invalid_weights: 400,
  research_run_not_found: 404, research_run_not_controllable: 409, research_already_running: 409, research_disabled: 409, research_manual_only: 409, invalid_corrections: 400, invalid_policy: 400,
  invalid_priority_topics: 400, invalid_holdout_percent: 400, url_required: 400, url_not_of_this_site: 400,
};

function fail(reply: FastifyReply, error: unknown) {
  if (error instanceof SearchConsoleError) {
    const status = error.kind === "not_configured" ? 503 : error.kind === "quota" ? 429 : error.kind === "transient" ? 502 : 409;
    return reply.code(status).send(errorBody(reply, `search_console_${error.kind}`, error.message));
  }
  const code = error instanceof Error ? error.message : String(error);
  if (!STATUS[code]) throw error;
  return reply.code(STATUS[code]).send(errorBody(reply, code, code.replace(/_/g, " ")));
}

type Params = { siteId: string; id?: string };

/** Subjects a person asks to research. */
function parseFocus(value: unknown): ResearchFocus | null {
  if (value === undefined) return {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const { topics = [], market, ...rest } = value as { topics?: unknown; market?: unknown };
  if (Object.keys(rest).length || !Array.isArray(topics) || topics.length > 5 || topics.some((topic) => typeof topic !== "string" || !topic.trim() || topic.length > 80)) return null;
  if (market !== undefined && (typeof market !== "string" || !/^[a-z]{2}-[A-Z]{2}$/.test(market))) return null;
  return { ...(topics.length ? { topics: topics as string[] } : {}), ...(market ? { market } : {}) };
}

export function registerSeoIntelligenceRoutes(fastify: FastifyInstance) {
  const route = (method: "GET" | "POST" | "PUT" | "DELETE", path: string, permission: StudioPermission, run: (context: StudioRequestContext, params: Params, request: FastifyRequest, reply: FastifyReply) => Promise<unknown>) =>
    fastify.route({
      method,
      url: `/v2/sites/:siteId/${path}`,
      handler: async (request, reply) => {
        const context = await requireStudioPermission(request, reply, permission);
        if (!context) return;
        const params = request.params as Params;
        if (!isUuid(params.siteId) || (params.id !== undefined && !isUuid(params.id))) return badRequest(reply, "invalid id");
        try {
          const result = await run(context, params, request, reply);
          return reply.sent ? undefined : reply.send(result ?? { ok: true });
        } catch (error) {
          return fail(reply, error);
        }
      },
    });

  route("GET", "search-console", "analytics.read", (context, { siteId }) => getSearchConsoleStatus(context.tenantId, siteId));

  // The flow is tied to the person who starts it, so an API key cannot.
  route("POST", "search-console/connect", "integrations.manage", async (context, { siteId }, _request, reply) => {
    if (!context.userId) return reply.code(403).send(errorBody(reply, "user_required", "Search Console is connected by a signed-in user"));
    return startSearchConsoleConnection(context.tenantId, siteId, context.userId);
  });

  fastify.post("/v2/search-console/complete", async (request, reply) => {
    const context = await requireStudioPermission(request, reply, "integrations.manage");
    if (!context) return;
    const body = parseBody<{ state?: string; code?: string }>(request);
    const state = parseOptionalString(body.state);
    const code = parseOptionalString(body.code);
    if (!state || !code || !context.userId) return badRequest(reply, "state and code are required");
    try {
      return reply.send(await completeSearchConsoleConnection(context.tenantId, context.userId, { state, code }));
    } catch (error) {
      return fail(reply, error);
    }
  });

  route("GET", "search-console/properties", "integrations.manage", async (context, { siteId }) => ({ items: await listSiteSearchConsoleProperties(context.tenantId, siteId) }));
  route("PUT", "search-console/property", "integrations.manage", async (context, { siteId }, request, reply) => {
    const property = parseOptionalString(parseBody<{ property?: string }>(request).property);
    if (!property) return badRequest(reply, "property is required");
    await selectSearchConsoleProperty(context.tenantId, siteId, property, context.userId);
    return getSearchConsoleStatus(context.tenantId, siteId);
  });
  route("POST", "search-console/sync", "integrations.manage", async (context, { siteId }) => {
    const status = await getSearchConsoleStatus(context.tenantId, siteId);
    if (status.status !== "active") throw new Error("search_console_not_connected");
    if ((await readSeoControl()).emergencyStop) throw new Error("external_seo_stopped");
    const result = await syncSearchConsole(siteId, { maxDays: 3 });
    if (result.status === "skipped") throw new Error("search_console_syncing");
    return { ...result, connection: await getSearchConsoleStatus(context.tenantId, siteId) };
  });
  route("DELETE", "search-console", "integrations.manage", async (context, { siteId }, request) => {
    await disconnectSearchConsole(context.tenantId, siteId, context.userId, { deleteData: (request.query as { deleteData?: string }).deleteData === "true" });
    return getSearchConsoleStatus(context.tenantId, siteId);
  });

  route("GET", "seo-opportunities", "analytics.read", async (context, { siteId }, request) => {
    const query = request.query as { status?: string; action?: string };
    const total = await prisma.contentOpportunity.count({ where: { tenantId: context.tenantId, siteId, action: { not: null } } });
    return withoutCosts({ total, items: await listSeoOpportunities(context.tenantId, siteId, { status: parseOptionalString(query.status) ?? undefined, action: parseOptionalString(query.action) ?? undefined, take: 500 }) });
  });
  route("POST", "seo-opportunities/analyze", "projects.manage", (context, { siteId }) => analyzeSite(context.tenantId, siteId));
  route("GET", "seo-opportunities/outcomes", "analytics.read", async (context, { siteId }) => {
    await getSearchConsoleStatus(context.tenantId, siteId); // tenant/site guard
    return withoutCosts(await outcomeSummary(context.tenantId, siteId));
  });
  route("POST", "seo-opportunities/:id/decision", "projects.manage", async (context, { siteId, id }, request, reply) => {
    const decision = parseBody<{ decision?: string }>(request).decision ?? "";
    if (!isOneOf(decision, OPPORTUNITY_DECISIONS)) return badRequest(reply, `decision must be one of: ${OPPORTUNITY_DECISIONS.join(", ")}`);
    // Resolving it may end in merging, redirecting or deleting pages: approving takes both permissions.
    const row = await prisma.contentOpportunity.findFirst({ where: { id, tenantId: context.tenantId, siteId }, select: { action: true } });
    if (decision === "approved" && row?.action === "investigate_cannibalization" && !(["review.approve", "publishing.manage"] as const).every((permission) => hasStudioPermission(context.permissions, permission))) {
      return reply.code(403).send(errorBody(reply, "forbidden", "Missing permission: review.approve, publishing.manage"));
    }
    await decideSeoOpportunity(context.tenantId, siteId, id!, decision, context.userId);
    return undefined;
  });
  route("POST", "seo-opportunities/:id/complete", "projects.manage", async (context, { siteId, id }, request, reply) => {
    const body = parseBody<{ actedAt?: string; url?: string }>(request);
    const actedAt = body.actedAt === undefined ? new Date() : new Date(body.actedAt);
    if (!Number.isFinite(actedAt.getTime()) || actedAt.getTime() > Date.now() + 60_000 || actedAt.getFullYear() < 2015) return badRequest(reply, "actedAt must be a past date");
    return withoutCosts(await completeSeoOpportunity(context.tenantId, siteId, id!, { actedAt, url: parseOptionalString(body.url) ?? null }, context.userId));
  });

  route("POST", "seo-opportunities/:id/revision", "projects.manage", (context, { siteId, id }) => startOpportunityRevision(context.tenantId, siteId, id!, context.userId));

  // The workspace's own view: stored data, no amounts.
  route("GET", "seo-workspace", "analytics.read", (context, { siteId }) => workspaceOverview(context.tenantId, siteId));
  route("GET", "seo-allowance", "analytics.read", (context, { siteId }) => researchAllowance(context.tenantId, siteId));
  route("GET", "seo-keywords", "analytics.read", (context, { siteId }, request) => {
    const query = request.query as Record<string, string | undefined>;
    const text = (key: string) => parseOptionalString(query[key])?.slice(0, 160) ?? undefined;
    return workspaceKeywords(context.tenantId, siteId, { search: text("search"), view: text("view"), cluster: text("cluster"), intent: text("intent"), sort: text("sort"), page: Math.trunc(Number(query.page)) || 1 });
  });
  route("GET", "seo-keywords/:id/history", "analytics.read", (context, { siteId, id }) => workspaceKeywordHistory(context.tenantId, siteId, id!));
  route("GET", "seo-performance", "analytics.read", (context, { siteId }, request) => workspacePerformance(context.tenantId, siteId, (request.query as { days?: string }).days === "90" ? 90 : 28));

  // Research. Reading never buys; a run buys only through the manager and the governor.
  route("GET", "seo-research", "analytics.read", (context, { siteId }) => researchForWorkspace(context.tenantId, siteId));
  route("PUT", "seo-research/profile", "projects.manage", async (context, { siteId }, request) => {
    const body = parseBody<{ corrections?: unknown; reviewed?: boolean }>(request);
    return withoutCosts(await saveResearchProfile(context.tenantId, siteId, { corrections: body.corrections, reviewed: body.reviewed === true }, context.userId));
  });
  // A workspace sets its goals; how much a run may spend is the platform's.
  route("PUT", "seo-research/policy", "workspace.manage", async (context, { siteId }, request) => {
    const profile = await saveResearchProfile(context.tenantId, siteId, { policy: workspaceResearchPolicy(parseBody<{ policy?: unknown }>(request).policy) }, context.userId);
    return withoutCosts({ ...profile, intensity: intensityOf(profile.policy) });
  });
  route("POST", "seo-research/estimate", "projects.manage", async (context, { siteId }, request, reply) => {
    const focus = parseFocus(parseBody<{ focus?: unknown }>(request).focus);
    return focus ? previewResearch(context.tenantId, siteId, focus) : badRequest(reply, "invalid focus");
  });
  route("POST", "seo-research/runs", "projects.manage", async (context, { siteId }, request, reply) => {
    const body = parseBody<{ focus?: unknown; maxUsd?: unknown }>(request);
    const focus = parseFocus(body.focus);
    if (!focus) return badRequest(reply, "invalid focus");
    if (body.maxUsd !== undefined) return badRequest(reply, "the amount of a run is set by the platform");
    const { runId, created } = await requestResearch({ tenantId: context.tenantId, siteId, userId: context.userId, trigger: "manual", triggerKey: null, detail: "Pedida por una persona.", focus });
    return { created, run: runForWorkspace(await getResearchRun(context.tenantId, siteId, runId)) };
  });
  route("GET", "seo-research/runs/:id", "analytics.read", async (context, { siteId, id }) => runForWorkspace(await getResearchRun(context.tenantId, siteId, id!)));
  for (const control of RUN_CONTROLS) route("POST", `seo-research/runs/:id/${control}`, "projects.manage", async (context, { siteId, id }) => runForWorkspace(await controlResearchRun(context.tenantId, siteId, id!, control, context.userId)));

  route("GET", "seo-profile", "analytics.read", (context, { siteId }) => getSeoProfile(context.tenantId, siteId));
  route("PUT", "seo-profile", "workspace.manage", (context, { siteId }, request) => saveSeoProfile(context.tenantId, siteId, parseBody(request), context.userId));
}
