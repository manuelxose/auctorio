import { Prisma } from "@prisma/client";
import type { FastifyInstance, FastifyReply } from "fastify";
import { saveProviderKey, secretSource } from "../infrastructure/ai/ai-settings";
import { getPrismaClient } from "../infrastructure/db/prisma";
import { SEO_CAPABILITIES, SeoProviderError, type SeoCapability } from "../infrastructure/seo/contract";
import { readSeoPolicy } from "../infrastructure/seo/policy";
import { SEO_PRICES, SEO_PRICING_VERSION, seoPrice, seoPriceStatus, type SeoPriceOverrides } from "../infrastructure/seo/pricing";
import { DEFAULT_CONTROL, SEO_LOCKS, SEO_MODES, SEO_PROVIDERS, findSeoProvider, selectSeoProvider, type SeoMode } from "../infrastructure/seo/registry";
import { writeAudit } from "./audit";
import { badRequest, notFound, parseBody } from "./http-utils";
import { requirePlatformAdmin } from "./routes-admin";
import {
  DEFAULT_SEO_BUDGETS, SEO_BUDGET_ALLOWANCES, SEO_BUDGET_PERIODS, SEO_BUDGET_SCOPES, budgetKeyOf, budgetUse, recoverSeoReservations, resolveUncertainReservation,
  type SeoBudgetKey, type SeoBudgetLimit,
} from "./seo-governor";
import { sharableNow } from "./seo-licensing";
import { MAX_TEST_SPEND_USD, loadSeoControl, verifySeoProvider } from "./seo-manager";

const prisma = getPrismaClient();

/** Most an administrator can add to one budget, and for how long. */
const MAX_AUTHORIZATION_USD = 100;
const MAX_AUTHORIZATION_DAYS = 31;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const usd = (value: unknown, max: number): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= max;

/** A budget an administrator named, or why it is not one. */
function budgetKeyFrom(body: Record<string, unknown>, concrete: boolean): SeoBudgetKey | string {
  const scope = SEO_BUDGET_SCOPES.find((entry) => entry === body.scope);
  const period = SEO_BUDGET_PERIODS.find((entry) => entry === body.period);
  const operation = String(body.operation ?? "*");
  const allowance = String(body.allowance ?? "any");
  if (!scope) return "unknown scope";
  if (!period) return "unknown period";
  if (operation !== "*" && !(SEO_CAPABILITIES as readonly string[]).includes(operation)) return "unknown operation";
  if (!(SEO_BUDGET_ALLOWANCES as readonly string[]).includes(allowance)) return "unknown allowance";
  const scopeId = scope === "global" ? "platform" : String(body.scopeId ?? "").trim();
  if (!scopeId || scopeId.length > 60 || (concrete && scopeId === "*")) return "scopeId is required";
  if (scope === "provider" && scopeId !== "*" && !findSeoProvider(scopeId)) return "unknown provider";
  if ((scope === "tenant" || scope === "site") && scopeId !== "*" && !UUID.test(scopeId)) return "invalid scopeId";
  return { scope, scopeId, operation, allowance, period };
}

/** Budgets as configured: stored rows over the defaults of the same key. */
function configuredBudgets(rows: Array<{ scope: string; scopeId: string; operation: string; allowance: string; period: string; limitUsd: unknown }>): SeoBudgetLimit[] {
  const byKey = new Map<string, SeoBudgetLimit>();
  for (const entry of DEFAULT_SEO_BUDGETS) byKey.set(budgetKeyOf(entry), { ...entry, extraUsd: 0, source: "default" });
  for (const row of rows) {
    const key = { scope: row.scope, scopeId: row.scopeId, operation: row.operation, allowance: row.allowance, period: row.period } as SeoBudgetKey;
    byKey.set(budgetKeyOf(key), { ...key, limitUsd: Number(row.limitUsd), extraUsd: 0, source: "custom" });
  }
  return [...byKey.values()];
}

/** The row that governs one concrete budget: its own over "*". */
const governing = (budgets: SeoBudgetLimit[], scope: string, id: string, period: string, allowance = "any") =>
  [id, "*"].flatMap((scopeId) => budgets.filter((budget) => budget.scope === scope && budget.scopeId === scopeId && budget.operation === "*" && budget.period === period && budget.allowance === allowance))[0];

const locked = (reply: FastifyReply, message: string) => reply.code(409).send({ error: "locked", message });

/** Platform control of external SEO data (SEO-V2). Credentials go in and are never returned; reading calls no provider. */
export function registerAdminSeoRoutes(fastify: FastifyInstance) {
  fastify.get("/v2/admin/seo", async (request, reply) => {
    if (!(await requirePlatformAdmin(request, reply))) return;
    const [control, states] = await Promise.all([loadSeoControl(), prisma.seoProviderState.findMany()]);
    const stateOf = new Map(states.map((state) => [state.providerId, state]));
    return reply.send({
      mode: control.mode,
      modes: SEO_MODES.map((id) => ({ id, locked: id === "cost_optimized" && SEO_LOCKS.automaticRouting })),
      routing: control.routing,
      paidFallback: { enabled: control.paidFallback, locked: SEO_LOCKS.paidFallback },
      emergencyStop: control.emergencyStop,
      maxTestSpendUsd: MAX_TEST_SPEND_USD,
      providers: SEO_PROVIDERS.map((provider) => {
        const state = stateOf.get(provider.id);
        const supported = SEO_CAPABILITIES.filter((capability) => provider.capabilities[capability].supported);
        const verifications = (state?.verifications ?? {}) as Record<string, unknown>;
        const verified = supported.filter((capability) => verifications[capability]).length;
        return {
          id: provider.id,
          label: provider.label,
          ...control.providers[provider.id],
          configured: provider.configured(),
          credentials: provider.credentials.map(({ envName, label }) => ({ envName, label, source: secretSource(envName) })),
          automationLocked: SEO_LOCKS.paidAutomation.includes(provider.id),
          capabilities: provider.capabilities,
          licensing: provider.licensing,
          rateLimit: provider.rateLimit,
          liveVerification: verified === 0 ? "pending" : verified < supported.length ? "partial" : "verified",
          verifications,
          health: { lastSuccessAt: state?.lastSuccessAt ?? null, lastErrorAt: state?.lastErrorAt ?? null, lastErrorCode: state?.lastErrorCode ?? null, lastErrorMessage: state?.lastErrorMessage ?? null },
          /** supported: the provider publishes it; value null: never read. Not publishing it is not a balance of zero. */
          balance: { supported: Boolean(provider.balance), value: state?.balance ?? null },
          circuit: state?.circuitOpenUntil && state.circuitOpenUntil > new Date() ? { until: state.circuitOpenUntil, reason: state.circuitReason } : null,
        };
      }),
      capabilities: SEO_CAPABILITIES.map((capability) => {
        try {
          return { id: capability, provider: selectSeoProvider(capability, null, control).id, reason: null };
        } catch (error) {
          return { id: capability, provider: null, reason: error instanceof SeoProviderError ? error.code : "error" };
        }
      }),
    });
  });

  /** Operating mode and per-capability routing. mode "disabled" stops every external SEO call at once. */
  fastify.put("/v2/admin/seo/control", async (request, reply) => {
    const context = await requirePlatformAdmin(request, reply);
    if (!context) return;
    const body = parseBody<{ mode?: string; routing?: Record<string, unknown>; paidFallback?: unknown }>(request);
    const before = await loadSeoControl();
    const mode = body.mode ?? before.mode;
    if (!(SEO_MODES as readonly string[]).includes(mode)) return badRequest(reply, "unknown mode");
    if (mode === "cost_optimized" && SEO_LOCKS.automaticRouting) return locked(reply, "Automatic paid routing stays locked until the production activation gates are met.");
    if (body.paidFallback !== undefined && typeof body.paidFallback !== "boolean") return badRequest(reply, "paidFallback must be true or false");
    if (body.paidFallback === true && SEO_LOCKS.paidFallback) return locked(reply, "Paid fallback stays locked until the production activation gates are met.");
    const paidFallback = (body.paidFallback as boolean | undefined) ?? before.paidFallback;
    const routing: Record<string, string> = {};
    if (body.routing !== undefined && (typeof body.routing !== "object" || body.routing === null || Array.isArray(body.routing))) return badRequest(reply, "invalid routing");
    for (const [capability, providerId] of Object.entries(body.routing ?? before.routing)) {
      if (!(SEO_CAPABILITIES as readonly string[]).includes(capability)) return badRequest(reply, `unknown capability ${capability}`);
      if (providerId === null || providerId === "") continue;
      const provider = findSeoProvider(String(providerId));
      if (!provider) return badRequest(reply, `unknown provider ${String(providerId)}`);
      if (!provider.capabilities[capability as SeoCapability].supported) return badRequest(reply, `${provider.label} does not support ${capability}`);
      routing[capability] = provider.id;
    }
    const data = { mode: mode as SeoMode, routing: routing as Prisma.InputJsonObject, paidFallback, updatedByUserId: context.userId };
    await prisma.seoControlSetting.upsert({ where: { id: "global" }, create: { id: "global", ...data }, update: data });
    await writeAudit({ tenantId: context.tenantId, action: "seo.control.updated", entityType: "seo_control", actorType: "user", actorUserId: context.userId, metadata: { from: { mode: before.mode, routing: before.routing, paidFallback: before.paidFallback }, to: { mode, routing, paidFallback } } });
    return reply.send({ mode, routing });
  });

  fastify.patch("/v2/admin/seo/providers/:id", async (request, reply) => {
    const context = await requirePlatformAdmin(request, reply);
    if (!context) return;
    const provider = findSeoProvider((request.params as { id: string }).id);
    if (!provider) return notFound(reply, "provider not found");
    const body = parseBody<{ enabled?: unknown; priority?: unknown; resetCircuit?: unknown }>(request);
    if (body.enabled !== undefined && typeof body.enabled !== "boolean") return badRequest(reply, "enabled must be true or false");
    if (body.priority !== undefined && (!Number.isInteger(body.priority) || Number(body.priority) < 1 || Number(body.priority) > 999)) return badRequest(reply, "priority must be 1 to 999");
    const before = (await loadSeoControl()).providers[provider.id] ?? { enabled: false, priority: 100 };
    const after = { enabled: (body.enabled as boolean | undefined) ?? before.enabled, priority: (body.priority as number | undefined) ?? before.priority };
    await prisma.seoProviderState.upsert({
      where: { providerId: provider.id },
      create: { providerId: provider.id, ...DEFAULT_CONTROL.providers[provider.id], ...after, updatedByUserId: context.userId },
      update: { ...after, updatedByUserId: context.userId, ...(body.resetCircuit === true ? { circuitOpenUntil: null, circuitReason: null, consecutiveFailures: 0 } : {}) },
    });
    await writeAudit({ tenantId: context.tenantId, action: "seo.provider.updated", entityType: "seo_provider", actorType: "user", actorUserId: context.userId, metadata: { provider: provider.id, from: before, to: after, ...(body.resetCircuit === true ? { circuitReset: true } : {}) } });
    return reply.send({ id: provider.id, ...after });
  });

  /** Sets or clears (empty value) one credential; stored encrypted, never returned. */
  fastify.put("/v2/admin/seo/providers/:id/credentials", async (request, reply) => {
    const context = await requirePlatformAdmin(request, reply);
    if (!context) return;
    const provider = findSeoProvider((request.params as { id: string }).id);
    if (!provider) return notFound(reply, "provider not found");
    const body = parseBody<{ envName?: string; value?: string }>(request);
    const credential = provider.credentials.find(({ envName }) => envName === body.envName);
    if (!credential) return badRequest(reply, "unknown credential");
    const value = String(body.value ?? "").trim();
    if (value.length > 500 || /[\r\n]/.test(value)) return badRequest(reply, "invalid value");
    try {
      await saveProviderKey(credential.envName, value || null, context.userId);
    } catch (error) {
      return badRequest(reply, error instanceof Error ? error.message : "could not save");
    }
    // New credentials deserve a new try.
    await prisma.seoProviderState.updateMany({ where: { providerId: provider.id }, data: { circuitOpenUntil: null, circuitReason: null } });
    await writeAudit({ tenantId: context.tenantId, action: value ? "seo.credential.set" : "seo.credential.cleared", entityType: "seo_provider", actorType: "user", actorUserId: context.userId, metadata: { provider: provider.id, envName: credential.envName } });
    return reply.send({ ok: true, source: secretSource(credential.envName), configured: provider.configured() });
  });

  /** One paid live call. Requires authorize: true and a ceiling; refused uncalled when its maximum price is unknown or higher. */
  fastify.post("/v2/admin/seo/providers/:id/verify", async (request, reply) => {
    const context = await requirePlatformAdmin(request, reply);
    if (!context) return;
    const provider = findSeoProvider((request.params as { id: string }).id);
    if (!provider) return notFound(reply, "provider not found");
    const body = parseBody<{ authorize?: unknown; capability?: string; locale?: string; maxSpendUsd?: unknown; requestId?: unknown }>(request);
    if (body.authorize !== true) return badRequest(reply, "a live test can cost money: authorize it explicitly");
    if (typeof body.maxSpendUsd !== "number" || !Number.isFinite(body.maxSpendUsd)) return badRequest(reply, "maxSpendUsd is required");
    if (!(SEO_CAPABILITIES as readonly string[]).includes(body.capability ?? "")) return badRequest(reply, "unknown capability");
    const input = { providerId: provider.id, capability: body.capability as SeoCapability, locale: String(body.locale ?? "es-ES"), maxSpendUsd: body.maxSpendUsd, requestId: typeof body.requestId === "string" && UUID.test(body.requestId) ? body.requestId : undefined };
    const audit = (outcome: Record<string, unknown>) =>
      writeAudit({ tenantId: context.tenantId, action: "seo.provider.live_test", entityType: "seo_provider", actorType: "user", actorUserId: context.userId, metadata: { ...input, ...outcome } });
    try {
      const result = await verifySeoProvider({ ...input, tenantId: context.tenantId });
      await audit({ ok: true, costUsd: result.costUsd, rows: result.rows });
      return reply.send(result);
    } catch (error) {
      if (!(error instanceof SeoProviderError)) throw error;
      await audit({ ok: false, code: error.code, costUsd: error.billedUsd });
      return reply.code(error.billedUsd === 0 ? 409 : 502).send({ error: error.code, message: error.message, billedUsd: error.billedUsd });
    }
  });

  // ---- Cost Governor ----

  /** Budgets, use, prices, policy, authorizations and requests with an unknown bill. Calls no provider. */
  fastify.get("/v2/admin/seo/governor", async (request, reply) => {
    if (!(await requirePlatformAdmin(request, reply))) return;
    await recoverSeoReservations();
    const now = new Date();
    const [control, setting, rows, authorizations, uncertain, tenants, sites] = await Promise.all([
      loadSeoControl(),
      prisma.seoControlSetting.findUnique({ where: { id: "global" } }),
      prisma.seoBudget.findMany(),
      prisma.seoBudgetAuthorization.findMany({ where: { revokedAt: null, expiresAt: { gt: now } }, orderBy: { createdAt: "desc" } }),
      prisma.seoSpendReservation.findMany({ where: { state: "uncertain" }, orderBy: { createdAt: "desc" }, take: 100 }),
      prisma.tenant.findMany({ select: { id: true, name: true, plan: true }, orderBy: { name: "asc" } }),
      prisma.site.findMany({ select: { id: true, name: true, tenantId: true, createdAt: true }, orderBy: { name: "asc" } }),
    ]);
    const budgets = configuredBudgets(rows);
    const extra = (budget: SeoBudgetKey) => authorizations.filter((entry) => budgetKeyOf(entry as unknown as SeoBudgetKey) === budgetKeyOf(budget)).reduce((sum, entry) => sum + Number(entry.amountUsd), 0);
    const concrete = (scope: SeoBudgetLimit["scope"], id: string, period: SeoBudgetLimit["period"], allowance = "any"): SeoBudgetLimit | null => {
      const budget = governing(budgets, scope, id, period, allowance);
      return budget ? { ...budget, scopeId: id, extraUsd: extra({ ...budget, scopeId: id }) } : null;
    };
    const wanted = [
      concrete("global", "platform", "monthly"), concrete("global", "platform", "daily"),
      ...SEO_PROVIDERS.map((provider) => concrete("provider", provider.id, "monthly")),
      ...tenants.map((tenant) => concrete("tenant", tenant.id, "monthly")),
      ...sites.map((site) => (now.getTime() - site.createdAt.getTime() < control.policy.onboardingDays * 86_400_000 ? concrete("site", site.id, "total", "onboarding") : concrete("site", site.id, "monthly", "recurring"))),
      ...rows.filter((row) => row.scopeId !== "*" && row.operation !== "*").map((row) => configuredBudgets([row]).find((budget) => budget.source === "custom")!).map((budget) => ({ ...budget, extraUsd: extra(budget) })).filter((budget) => budget.scope !== "plan"),
    ].filter((budget): budget is SeoBudgetLimit => budget !== null);
    const use = await budgetUse(prisma, wanted, now);
    const names = new Map<string, string>([...tenants.map((tenant) => [tenant.id, tenant.name] as const), ...sites.map((site) => [site.id, site.name] as const), ...SEO_PROVIDERS.map((provider) => [provider.id, provider.label] as const)]);
    return reply.send({
      emergency: { active: control.emergencyStop, reason: setting?.emergencyReason ?? null, at: setting?.emergencyAt ?? null },
      exhaustion: "stored_data_only",
      budgets: budgets.map(({ extraUsd: _extra, ...budget }) => ({ ...budget, name: names.get(budget.scopeId) ?? null })),
      use: wanted.map((budget, index) => ({ ...budget, name: names.get(budget.scopeId) ?? null, ...use[index], remainingUsd: Math.max(0, budget.limitUsd + budget.extraUsd - use[index].actualUsd - use[index].heldUsd) })),
      pricing: { version: SEO_PRICING_VERSION, entries: SEO_PRICES.map((entry) => ({ ...entry, status: seoPriceStatus(entry, control.pricing, now), override: control.pricing[`${entry.providerId}:${entry.capability}`] ?? null })) },
      policy: control.policy,
      authorizations: authorizations.map((entry) => ({ ...entry, amountUsd: Number(entry.amountUsd), name: names.get(entry.scopeId) ?? null })),
      uncertain: uncertain.map((row) => ({ id: row.id, providerId: row.providerId, operation: row.operation, tenant: names.get(row.tenantId) ?? null, site: row.targetSiteId ? names.get(row.targetSiteId) ?? null : null, maxUsd: Number(row.maxUsd), reason: row.resolution, createdAt: row.createdAt })),
      targets: { tenants: tenants.map(({ id, name, plan }) => ({ id, name, plan })), sites: sites.map(({ id, name, tenantId }) => ({ id, name, tenantId })) },
    });
  });

  fastify.get("/v2/admin/seo/ledger", async (request, reply) => {
    if (!(await requirePlatformAdmin(request, reply))) return;
    const query = request.query as { state?: string; page?: string };
    const page = Math.max(1, Math.trunc(Number(query.page)) || 1);
    const where = query.state ? { state: query.state } : {};
    const [total, rows] = await Promise.all([prisma.seoSpendReservation.count({ where }), prisma.seoSpendReservation.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * 50, take: 50 })]);
    return reply.send({ page, total, items: rows.map((row) => ({ ...row, estimatedUsd: row.estimatedUsd === null ? null : Number(row.estimatedUsd), maxUsd: Number(row.maxUsd), actualUsd: row.actualUsd === null ? null : Number(row.actualUsd) })) });
  });

  /** Stops every external SEO request at once, live tests included; lifting it restores the previous mode. */
  fastify.put("/v2/admin/seo/emergency-stop", async (request, reply) => {
    const context = await requirePlatformAdmin(request, reply);
    if (!context) return;
    const body = parseBody<{ active?: unknown; reason?: unknown }>(request);
    if (typeof body.active !== "boolean") return badRequest(reply, "active must be true or false");
    const reason = String(body.reason ?? "").trim().slice(0, 300) || null;
    const data = { emergencyStop: body.active, emergencyReason: body.active ? reason : null, emergencyAt: body.active ? new Date() : null, updatedByUserId: context.userId };
    await prisma.seoControlSetting.upsert({ where: { id: "global" }, create: { id: "global", mode: DEFAULT_CONTROL.mode, ...data }, update: data });
    await writeAudit({ tenantId: context.tenantId, action: body.active ? "seo.emergency_stop.activated" : "seo.emergency_stop.lifted", entityType: "seo_control", actorType: "user", actorUserId: context.userId, metadata: { reason } });
    return reply.send({ active: body.active, reason });
  });

  /** Sets one hard budget; limitUsd null restores the default (or removes a specific one). */
  fastify.put("/v2/admin/seo/budgets", async (request, reply) => {
    const context = await requirePlatformAdmin(request, reply);
    if (!context) return;
    const body = parseBody<Record<string, unknown>>(request);
    const key = budgetKeyFrom(body, false);
    if (typeof key === "string") return badRequest(reply, key);
    if (body.limitUsd !== null && !usd(body.limitUsd, 10_000)) return badRequest(reply, "limitUsd must be 0 to 10000, or null to restore the default");
    const where = { scope_scopeId_operation_allowance_period: key };
    const before = await prisma.seoBudget.findUnique({ where });
    if (body.limitUsd === null) await prisma.seoBudget.deleteMany({ where: key });
    else await prisma.seoBudget.upsert({ where, create: { ...key, limitUsd: body.limitUsd, updatedByUserId: context.userId }, update: { limitUsd: body.limitUsd, updatedByUserId: context.userId } });
    await writeAudit({ tenantId: context.tenantId, action: "seo.budget.updated", entityType: "seo_budget", actorType: "user", actorUserId: context.userId, metadata: { ...key, from: before ? Number(before.limitUsd) : null, to: body.limitUsd } });
    return reply.send({ ...key, limitUsd: body.limitUsd });
  });

  /** Additional spend on one exact budget, for a while. Every other limit still applies. */
  fastify.post("/v2/admin/seo/authorizations", async (request, reply) => {
    const context = await requirePlatformAdmin(request, reply);
    if (!context) return;
    const body = parseBody<Record<string, unknown>>(request);
    const key = budgetKeyFrom(body, true);
    if (typeof key === "string") return badRequest(reply, key);
    const reason = String(body.reason ?? "").trim().slice(0, 300);
    if (!usd(body.amountUsd, MAX_AUTHORIZATION_USD) || body.amountUsd === 0) return badRequest(reply, `amountUsd must be above 0 and at most ${MAX_AUTHORIZATION_USD}`);
    if (!Number.isInteger(body.days) || Number(body.days) < 1 || Number(body.days) > MAX_AUTHORIZATION_DAYS) return badRequest(reply, `days must be 1 to ${MAX_AUTHORIZATION_DAYS}`);
    if (!reason) return badRequest(reply, "a reason is required");
    const row = await prisma.seoBudgetAuthorization.create({ data: { ...key, amountUsd: body.amountUsd, reason, expiresAt: new Date(Date.now() + Number(body.days) * 86_400_000), createdByUserId: context.userId } });
    await writeAudit({ tenantId: context.tenantId, action: "seo.budget.authorized", entityType: "seo_budget_authorization", entityId: row.id, actorType: "user", actorUserId: context.userId, metadata: { ...key, amountUsd: body.amountUsd, days: body.days, reason } });
    return reply.code(201).send({ id: row.id, expiresAt: row.expiresAt });
  });

  fastify.delete("/v2/admin/seo/authorizations/:id", async (request, reply) => {
    const context = await requirePlatformAdmin(request, reply);
    if (!context) return;
    const { id } = request.params as { id: string };
    if (!UUID.test(id)) return notFound(reply, "authorization not found");
    const { count } = await prisma.seoBudgetAuthorization.updateMany({ where: { id, revokedAt: null }, data: { revokedAt: new Date() } });
    if (!count) return notFound(reply, "authorization not found");
    await writeAudit({ tenantId: context.tenantId, action: "seo.budget.authorization_revoked", entityType: "seo_budget_authorization", entityId: id, actorType: "user", actorUserId: context.userId });
    return reply.send({ ok: true });
  });

  /** States what a request with an unknown bill really cost (0 = not billed). */
  fastify.post("/v2/admin/seo/reservations/:id/resolve", async (request, reply) => {
    const context = await requirePlatformAdmin(request, reply);
    if (!context) return;
    const { id } = request.params as { id: string };
    const body = parseBody<{ actualUsd?: unknown; note?: unknown }>(request);
    const note = String(body.note ?? "").trim().slice(0, 200);
    if (!UUID.test(id)) return notFound(reply, "reservation not found");
    if (!usd(body.actualUsd, 1000)) return badRequest(reply, "actualUsd is required");
    if (!note) return badRequest(reply, "a note is required");
    if (!(await resolveUncertainReservation(id, body.actualUsd, note, context.userId))) return reply.code(409).send({ error: "not_uncertain", message: "Only a request with an unknown bill can be resolved." });
    await writeAudit({ tenantId: context.tenantId, action: "seo.reservation.resolved", entityType: "seo_reservation", entityId: id, actorType: "user", actorUserId: context.userId, metadata: { actualUsd: body.actualUsd, note } });
    return reply.send({ ok: true });
  });

  /** Confirms the most one request of an operation can cost; null goes back to the price list. */
  fastify.put("/v2/admin/seo/pricing", async (request, reply) => {
    const context = await requirePlatformAdmin(request, reply);
    if (!context) return;
    const body = parseBody<{ providerId?: string; capability?: string; maxRequestUsd?: unknown; source?: unknown }>(request);
    const entry = seoPrice(String(body.providerId), body.capability as SeoCapability);
    if (!entry) return badRequest(reply, "unknown price");
    const source = String(body.source ?? "").trim().slice(0, 300);
    if (body.maxRequestUsd !== null && (!usd(body.maxRequestUsd, 10) || body.maxRequestUsd === 0)) return badRequest(reply, "maxRequestUsd must be above 0 and at most 10, or null");
    if (!source) return badRequest(reply, "say where the price comes from");
    const pricing = { ...((await prisma.seoControlSetting.findUnique({ where: { id: "global" } }))?.pricing as SeoPriceOverrides | null) };
    const key = `${entry.providerId}:${entry.capability}`;
    const before = pricing[key] ?? null;
    if (body.maxRequestUsd === null) delete pricing[key];
    else pricing[key] = { maxRequestUsd: body.maxRequestUsd, source, verifiedAt: new Date().toISOString() };
    await prisma.seoControlSetting.upsert({ where: { id: "global" }, create: { id: "global", mode: DEFAULT_CONTROL.mode, pricing: pricing as Prisma.InputJsonObject }, update: { pricing: pricing as Prisma.InputJsonObject, updatedByUserId: context.userId } });
    await writeAudit({ tenantId: context.tenantId, action: "seo.pricing.updated", entityType: "seo_pricing", actorType: "user", actorUserId: context.userId, metadata: { key, from: before, to: pricing[key] ?? null, source } });
    return reply.send({ key, override: pricing[key] ?? null });
  });

  /** Freshness and acquisition policy; unreadable values are dropped, an empty object restores the defaults. */
  fastify.put("/v2/admin/seo/policy", async (request, reply) => {
    const context = await requirePlatformAdmin(request, reply);
    if (!context) return;
    const body = parseBody<{ policy?: unknown }>(request);
    if (!body.policy || typeof body.policy !== "object" || Array.isArray(body.policy) || JSON.stringify(body.policy).length > 10_000) return badRequest(reply, "invalid policy");
    const before = (await prisma.seoControlSetting.findUnique({ where: { id: "global" } }))?.policy ?? null;
    const policy = body.policy as Prisma.InputJsonObject;
    const turnedOn = policy.shareMarketData === true && (before as { shareMarketData?: unknown } | null)?.shareMarketData !== true;
    if (turnedOn && !(await sharableNow(true)).length) return reply.code(409).send({ error: "license_required", message: "No provider has an approved licence that permits storing and sharing its data between workspaces." });
    await prisma.seoControlSetting.upsert({ where: { id: "global" }, create: { id: "global", mode: DEFAULT_CONTROL.mode, policy }, update: { policy, updatedByUserId: context.userId } });
    await writeAudit({ tenantId: context.tenantId, action: "seo.policy.updated", entityType: "seo_policy", actorType: "user", actorUserId: context.userId, metadata: { from: before, to: policy } });
    return reply.send(readSeoPolicy(policy));
  });
}
