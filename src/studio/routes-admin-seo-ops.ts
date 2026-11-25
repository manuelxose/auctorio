// SEO Operations Center (SEO-V2-06): what platform administrators see and control beyond the provider and budget panels.

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { getPrismaClient, readAcrossWorkspaceSites } from "../infrastructure/db/prisma";
import { SEO_CAPABILITIES, SeoProviderError } from "../infrastructure/seo/contract";
import { findSeoProvider } from "../infrastructure/seo/registry";
import { writeAudit } from "./audit";
import { badRequest, isUuid, notFound, parseBody, type StudioRequestContext } from "./http-utils";
import { requirePlatformAdmin } from "./routes-admin";
import { purgeExpiredSeoData } from "./seo-cache";
import { LICENSE_TERMS } from "./seo-licensing";
import { RUN_STATUSES, costAnalytics, costCsv, economicsView, effectiveBudget, exhaustionHistory, governanceView, listResearchOperations, parseCostFilters, providerHistory, readProviderBalance, researchOperation } from "./seo-operations";
import { RUN_CONTROLS, controlResearchRun } from "./seo-research/runs";

const prisma = getPrismaClient();
const CONFLICTS = new Set(["research_run_not_controllable", "research_already_running"]);

export function registerAdminSeoOperationsRoutes(fastify: FastifyInstance) {
  const route = (method: "GET" | "POST" | "PUT" | "DELETE", path: string, run: (context: StudioRequestContext, request: FastifyRequest, reply: FastifyReply) => Promise<unknown>) =>
    fastify.route({
      method, url: `/v2/admin/seo/${path}`,
      handler: async (request, reply) => {
        const context = await requirePlatformAdmin(request, reply);
        if (!context) return;
        const result = await run(context, request, reply);
        return reply.sent ? undefined : reply.send(result);
      },
    });
  const audit = (context: StudioRequestContext, action: string, entityType: string, entityId: string | null, metadata: Record<string, unknown>) =>
    writeAudit({ tenantId: context.tenantId, action, entityType, entityId, actorType: "user", actorUserId: context.userId, metadata });
  const queryOf = (request: FastifyRequest) => request.query as Record<string, string | undefined>;
  const idOf = (request: FastifyRequest) => (request.params as { id: string }).id;

  // ---- Costs ----

  route("GET", "costs", async (_context, request, reply) => {
    const filters = parseCostFilters(queryOf(request));
    return typeof filters === "string" ? badRequest(reply, filters) : costAnalytics(filters);
  });
  route("GET", "costs/export", async (context, request, reply) => {
    const filters = parseCostFilters(queryOf(request));
    if (typeof filters === "string") return badRequest(reply, filters);
    const { csv, rows, truncated } = await costCsv(filters);
    await audit(context, "seo.costs.exported", "seo_ledger", null, { ...filters, rows, truncated });
    return reply.header("content-type", "text/csv; charset=utf-8").header("content-disposition", `attachment; filename="seo-costs-${filters.from.toISOString().slice(0, 10)}.csv"`).send(`﻿${csv}`);
  });
  route("GET", "economics", async (_context, request, reply) => {
    const filters = parseCostFilters(queryOf(request));
    return typeof filters === "string" ? badRequest(reply, filters) : economicsView(filters);
  });

  // ---- Budgets ----

  route("GET", "effective-budget", async (_context, request, reply) => {
    const { tenantId, siteId, providerId, operation } = queryOf(request);
    if (!isUuid(tenantId ?? "") || (siteId && !isUuid(siteId))) return badRequest(reply, "invalid tenantId or siteId");
    if (!findSeoProvider(providerId ?? "")) return badRequest(reply, "unknown provider");
    if (!(SEO_CAPABILITIES as readonly string[]).includes(operation ?? "")) return badRequest(reply, "unknown operation");
    return (await effectiveBudget({ tenantId: tenantId!, siteId: siteId || null, providerId: providerId!, operation: operation! })) ?? notFound(reply, "workspace or site not found");
  });
  route("GET", "exhaustion", async () => ({ items: await exhaustionHistory() }));

  // ---- Providers ----

  route("GET", "providers/:id/history", async (_context, request, reply) => {
    const provider = findSeoProvider(idOf(request));
    return provider ? providerHistory(provider.id) : notFound(reply, "provider not found");
  });
  route("POST", "providers/:id/balance", async (context, request, reply) => {
    const provider = findSeoProvider(idOf(request));
    if (!provider) return notFound(reply, "provider not found");
    try {
      const balance = await readProviderBalance(provider.id);
      await audit(context, "seo.provider.balance_read", "seo_provider", null, { provider: provider.id, ok: true });
      return balance;
    } catch (error) {
      if (!(error instanceof SeoProviderError)) throw error;
      await audit(context, "seo.provider.balance_read", "seo_provider", null, { provider: provider.id, ok: false, code: error.code });
      return reply.code(409).send({ error: error.code, message: error.message });
    }
  });

  // ---- Research operations ----

  route("GET", "research", async (_context, request, reply) => {
    const query = queryOf(request);
    if (query.status && !(RUN_STATUSES as readonly string[]).includes(query.status)) return badRequest(reply, "unknown status");
    for (const key of ["tenantId", "siteId"]) if (query[key] && !isUuid(query[key]!)) return badRequest(reply, `invalid ${key}`);
    return listResearchOperations({ status: query.status, tenantId: query.tenantId, siteId: query.siteId, page: Math.trunc(Number(query.page)) || 1 });
  });
  route("GET", "research/:id", async (_context, request, reply) => (isUuid(idOf(request)) ? (await researchOperation(idOf(request))) ?? notFound(reply, "run not found") : notFound(reply, "run not found")));
  for (const control of RUN_CONTROLS) {
    route("POST", `research/:id/${control}`, async (context, request, reply) => {
      const run = isUuid(idOf(request)) ? await researchOperation(idOf(request)) : null;
      if (!run) return notFound(reply, "run not found");
      try {
        // Audited in the workspace it belongs to by the control itself, and in the platform's log here.
        await readAcrossWorkspaceSites(() => controlResearchRun(run.tenantId, run.siteId, idOf(request), control, context.userId));
      } catch (error) {
        const code = error instanceof Error ? error.message : "";
        if (!CONFLICTS.has(code)) throw error;
        return reply.code(409).send({ error: code, message: code.replace(/_/g, " ") });
      }
      await audit(context, `seo.research.${control}`, "seo_research_run", idOf(request), { tenantId: run.tenantId, siteId: run.siteId });
      return researchOperation(idOf(request));
    });
  }
  route("PUT", "research-holds", async (context, request, reply) => {
    const body = parseBody<{ scope?: unknown; scopeId?: unknown; reason?: unknown }>(request);
    const reason = String(body.reason ?? "").trim().slice(0, 300);
    const scopeId = String(body.scopeId ?? "");
    if (body.scope !== "tenant" && body.scope !== "site") return badRequest(reply, "scope must be tenant or site");
    if (!isUuid(scopeId) || !reason) return badRequest(reply, "scopeId and reason are required");
    const exists = body.scope === "tenant" ? await prisma.tenant.findUnique({ where: { id: scopeId } }) : await prisma.site.findUnique({ where: { id: scopeId } });
    if (!exists) return notFound(reply, "workspace or site not found");
    const key = { scope: body.scope, scopeId };
    const hold = await prisma.seoResearchHold.upsert({ where: { scope_scopeId: key }, create: { ...key, reason, createdByUserId: context.userId }, update: { reason, createdByUserId: context.userId } });
    await audit(context, "seo.research.held", "seo_research_hold", hold.id, { ...key, reason });
    return hold;
  });
  route("DELETE", "research-holds/:id", async (context, request, reply) => {
    const hold = isUuid(idOf(request)) ? await prisma.seoResearchHold.findUnique({ where: { id: idOf(request) } }) : null;
    if (!hold) return notFound(reply, "hold not found");
    await prisma.seoResearchHold.deleteMany({ where: { id: hold.id } });
    await audit(context, "seo.research.hold_lifted", "seo_research_hold", hold.id, { scope: hold.scope, scopeId: hold.scopeId });
    return { ok: true };
  });

  // ---- Data and governance ----

  route("GET", "governance", () => governanceView());
  route("POST", "retention/purge", async (context) => {
    const deleted = await readAcrossWorkspaceSites(() => purgeExpiredSeoData(new Date(), true));
    await audit(context, "seo.retention.purged", "seo_data", null, { deleted });
    return { deleted };
  });

  route("POST", "licenses", async (context, request, reply) => {
    const body = parseBody<Record<string, unknown>>(request);
    const provider = findSeoProvider(String(body.providerId ?? ""));
    if (!provider) return badRequest(reply, "unknown provider");
    const terms = Object.fromEntries((["commercialUse", "storage", "crossTenantSharing"] as const).map((key) => [key, String(body[key] ?? "")])) as Record<"commercialUse" | "storage" | "crossTenantSharing", string>;
    if (Object.values(terms).some((value) => !(LICENSE_TERMS as readonly string[]).includes(value))) return badRequest(reply, `each term must be one of: ${LICENSE_TERMS.join(", ")}`);
    const documentUrl = String(body.documentUrl ?? "").trim();
    if (!URL.canParse(documentUrl) || new URL(documentUrl).protocol !== "https:" || documentUrl.length > 500) return badRequest(reply, "documentUrl must be an https address");
    const notes = String(body.notes ?? "").trim().slice(0, 1_000);
    if (!notes) return badRequest(reply, "say which clause permits it");
    const validUntil = body.validUntil ? new Date(String(body.validUntil)) : null;
    if (validUntil && (!Number.isFinite(validUntil.getTime()) || validUntil <= new Date())) return badRequest(reply, "validUntil must be a future date");
    const row = await prisma.seoLicenseRecord.create({ data: { providerId: provider.id, ...terms, documentUrl, notes, validUntil, createdByUserId: context.userId! } });
    await audit(context, "seo.license.recorded", "seo_license_record", row.id, { provider: provider.id, ...terms, documentUrl, validUntil });
    return reply.code(201).send(row);
  });
  // Nobody approves their own record: sharing data between workspaces takes two administrators.
  route("POST", "licenses/:id/approve", async (context, request, reply) => {
    const row = isUuid(idOf(request)) ? await prisma.seoLicenseRecord.findUnique({ where: { id: idOf(request) } }) : null;
    if (!row) return notFound(reply, "record not found");
    if (row.createdByUserId === context.userId) return reply.code(409).send({ error: "second_approver_required", message: "Another platform administrator must approve this record." });
    const { count } = await prisma.seoLicenseRecord.updateMany({ where: { id: row.id, status: "pending" }, data: { status: "approved", approvedByUserId: context.userId, approvedAt: new Date() } });
    if (!count) return reply.code(409).send({ error: "not_pending", message: "Only a pending record can be approved." });
    await audit(context, "seo.license.approved", "seo_license_record", row.id, { provider: row.providerId });
    return { ok: true };
  });
  route("POST", "licenses/:id/revoke", async (context, request, reply) => {
    if (!isUuid(idOf(request))) return notFound(reply, "record not found");
    const { count } = await prisma.seoLicenseRecord.updateMany({ where: { id: idOf(request), status: { in: ["pending", "approved"] } }, data: { status: "revoked", revokedAt: new Date() } });
    if (!count) return notFound(reply, "record not found");
    await audit(context, "seo.license.revoked", "seo_license_record", idOf(request), {});
    return { ok: true };
  });
}
