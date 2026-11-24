import { Prisma } from "@prisma/client";
import type { FastifyInstance, FastifyReply } from "fastify";
import { saveProviderKey, secretSource } from "../infrastructure/ai/ai-settings";
import { getPrismaClient } from "../infrastructure/db/prisma";
import { SEO_CAPABILITIES, SeoProviderError, type SeoCapability } from "../infrastructure/seo/contract";
import { DEFAULT_CONTROL, SEO_LOCKS, SEO_MODES, SEO_PROVIDERS, findSeoProvider, selectSeoProvider, type SeoMode } from "../infrastructure/seo/registry";
import { writeAudit } from "./audit";
import { badRequest, notFound, parseBody } from "./http-utils";
import { requirePlatformAdmin } from "./routes-admin";
import { MAX_TEST_SPEND_USD, loadSeoControl, verifySeoProvider } from "./seo-manager";

const prisma = getPrismaClient();

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
      paidFallback: control.paidFallback,
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
    const body = parseBody<{ mode?: string; routing?: Record<string, unknown> }>(request);
    const before = await loadSeoControl();
    const mode = body.mode ?? before.mode;
    if (!(SEO_MODES as readonly string[]).includes(mode)) return badRequest(reply, "unknown mode");
    if (mode === "cost_optimized" && SEO_LOCKS.automaticRouting) return locked(reply, "Automatic paid routing stays locked until hard budgets are enforced (SEO-V2-02).");
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
    const data = { mode: mode as SeoMode, routing: routing as Prisma.InputJsonObject, updatedByUserId: context.userId };
    await prisma.seoControlSetting.upsert({ where: { id: "global" }, create: { id: "global", ...data }, update: data });
    await writeAudit({ tenantId: context.tenantId, action: "seo.control.updated", entityType: "seo_control", actorType: "user", actorUserId: context.userId, metadata: { from: { mode: before.mode, routing: before.routing }, to: { mode, routing } } });
    return reply.send({ mode, routing });
  });

  fastify.patch("/v2/admin/seo/providers/:id", async (request, reply) => {
    const context = await requirePlatformAdmin(request, reply);
    if (!context) return;
    const provider = findSeoProvider((request.params as { id: string }).id);
    if (!provider) return notFound(reply, "provider not found");
    const body = parseBody<{ enabled?: unknown; priority?: unknown }>(request);
    if (body.enabled !== undefined && typeof body.enabled !== "boolean") return badRequest(reply, "enabled must be true or false");
    if (body.priority !== undefined && (!Number.isInteger(body.priority) || Number(body.priority) < 1 || Number(body.priority) > 999)) return badRequest(reply, "priority must be 1 to 999");
    const before = (await loadSeoControl()).providers[provider.id] ?? { enabled: false, priority: 100 };
    const after = { enabled: (body.enabled as boolean | undefined) ?? before.enabled, priority: (body.priority as number | undefined) ?? before.priority };
    await prisma.seoProviderState.upsert({
      where: { providerId: provider.id },
      create: { providerId: provider.id, ...DEFAULT_CONTROL.providers[provider.id], ...after, updatedByUserId: context.userId },
      update: { ...after, updatedByUserId: context.userId },
    });
    await writeAudit({ tenantId: context.tenantId, action: "seo.provider.updated", entityType: "seo_provider", actorType: "user", actorUserId: context.userId, metadata: { provider: provider.id, from: before, to: after } });
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
    await writeAudit({ tenantId: context.tenantId, action: value ? "seo.credential.set" : "seo.credential.cleared", entityType: "seo_provider", actorType: "user", actorUserId: context.userId, metadata: { provider: provider.id, envName: credential.envName } });
    return reply.send({ ok: true, source: secretSource(credential.envName), configured: provider.configured() });
  });

  /** One paid live call. Requires authorize: true and a ceiling; refused uncalled when its maximum price is unknown or higher. */
  fastify.post("/v2/admin/seo/providers/:id/verify", async (request, reply) => {
    const context = await requirePlatformAdmin(request, reply);
    if (!context) return;
    const provider = findSeoProvider((request.params as { id: string }).id);
    if (!provider) return notFound(reply, "provider not found");
    const body = parseBody<{ authorize?: unknown; capability?: string; locale?: string; maxSpendUsd?: unknown }>(request);
    if (body.authorize !== true) return badRequest(reply, "a live test can cost money: authorize it explicitly");
    if (typeof body.maxSpendUsd !== "number" || !Number.isFinite(body.maxSpendUsd)) return badRequest(reply, "maxSpendUsd is required");
    if (!(SEO_CAPABILITIES as readonly string[]).includes(body.capability ?? "")) return badRequest(reply, "unknown capability");
    const input = { providerId: provider.id, capability: body.capability as SeoCapability, locale: String(body.locale ?? "es-ES"), maxSpendUsd: body.maxSpendUsd };
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
}
