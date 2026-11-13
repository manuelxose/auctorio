import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { AI_IMAGE_PROVIDERS, AI_PROVIDERS, loadProviderKeys, managedEnvNames, providerConfigured, saveProviderKey, secretOf, secretSource } from "../infrastructure/ai/ai-settings";
import { getPrismaClient } from "../infrastructure/db/prisma";
import { getEnv } from "../shared/utils/env";
import { writeAudit } from "./audit";
import { badRequest, isUuid, notFound, parseBody, requireStudioContext } from "./http-utils";

/**
 * Platform (SaaS) administration. A platform admin is a studio user whose email is listed in
 * PLATFORM_ADMIN_EMAILS (comma separated); workspace roles never grant it.
 * shortcut: env allow-list instead of a stored platform role, upgrade when admins must be managed in-app.
 */
const prisma = getPrismaClient();

function adminEmails(): string[] {
  return getEnv("PLATFORM_ADMIN_EMAILS", "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
}

async function isPlatformAdminUser(userId: string | null): Promise<boolean> {
  if (!userId) return false;
  const user = await prisma.studioUser.findUnique({ where: { id: userId }, select: { email: true } });
  return Boolean(user && adminEmails().includes(user.email.toLowerCase()));
}

export async function requirePlatformAdmin(request: FastifyRequest, reply: FastifyReply) {
  const context = await requireStudioContext(request, reply);
  if (!context) return null;
  if (!(await isPlatformAdminUser(context.userId))) {
    reply.code(403).send({ error: "forbidden", message: "Platform admin only" });
    return null;
  }
  return context;
}

export function registerAdminRoutes(fastify: FastifyInstance) {
  /** Lets the UI decide whether to show the Admin area; never an error for normal users. */
  fastify.get("/v2/admin/me", async (request, reply) => {
    const context = await requireStudioContext(request, reply);
    if (!context) return;
    return reply.send({ isPlatformAdmin: await isPlatformAdminUser(context.userId) });
  });

  fastify.get("/v2/admin/overview", async (request, reply) => {
    if (!(await requirePlatformAdmin(request, reply))) return;
    const since = new Date(Date.now() - 24 * 3600 * 1000);
    const [tenants, suspended, sites, users, texts, images, failedJobs] = await Promise.all([
      prisma.tenant.count(),
      prisma.tenant.count({ where: { status: "suspended" } }),
      prisma.site.count(),
      prisma.studioUser.count(),
      prisma.contentText.count(),
      prisma.contentImage.count(),
      prisma.job.count({ where: { status: "failed", createdAt: { gte: since } } }),
    ]);
    return reply.send({ tenants, suspended, sites, users, texts, images, failedJobs24h: failedJobs });
  });

  fastify.get("/v2/admin/tenants", async (request, reply) => {
    if (!(await requirePlatformAdmin(request, reply))) return;
    const rows = await prisma.tenant.findMany({
      orderBy: { createdAt: "desc" },
      take: 200,
      select: {
        id: true, name: true, slug: true, status: true, plan: true, createdAt: true,
        _count: { select: { sites: true, contentText: true, contentImage: true } },
        aiProviderSetting: { select: { provider: true, model: true } },
        aiImageSetting: { select: { provider: true, model: true } },
      },
    });
    const userCounts = await prisma.studioUser.groupBy({ by: ["tenantId"], _count: { _all: true } });
    const users = new Map(userCounts.map((g) => [g.tenantId, g._count._all]));
    return reply.send({
      items: rows.map((t) => ({
        id: t.id, name: t.name, slug: t.slug, status: t.status, plan: t.plan, createdAt: t.createdAt,
        sites: t._count.sites, users: users.get(t.id) ?? 0, texts: t._count.contentText, images: t._count.contentImage,
        textModel: t.aiProviderSetting, imageModel: t.aiImageSetting,
      })),
    });
  });

  fastify.patch("/v2/admin/tenants/:id", async (request, reply) => {
    const context = await requirePlatformAdmin(request, reply);
    if (!context) return;
    const id = (request.params as { id: string }).id;
    if (!isUuid(id)) return badRequest(reply, "invalid tenant id");
    const body = parseBody<{ status?: string; plan?: string | null }>(request);
    if (body.status !== undefined && body.status !== "active" && body.status !== "suspended") {
      return badRequest(reply, "status must be active or suspended");
    }
    const plan = body.plan === undefined ? undefined : String(body.plan ?? "").trim().slice(0, 60) || null;
    const before = await prisma.tenant.findUnique({ where: { id }, select: { status: true, plan: true } });
    if (!before) return notFound(reply, "tenant not found");
    const updated = await prisma.tenant.update({
      where: { id },
      data: { ...(body.status ? { status: body.status } : {}), ...(plan !== undefined ? { plan } : {}) },
      select: { id: true, status: true, plan: true },
    });
    await writeAudit({
      tenantId: id,
      action: "admin.tenant.updated",
      entityType: "tenant",
      actorType: "user",
      actorUserId: context.userId,
      metadata: { from: before, to: { status: updated.status, plan: updated.plan } },
    });
    return reply.send(updated);
  });

  /** Sets or clears (empty value) a provider key/endpoint; stored encrypted, never returned. */
  fastify.put("/v2/admin/ai/keys", async (request, reply) => {
    const context = await requirePlatformAdmin(request, reply);
    if (!context) return;
    const body = parseBody<{ envName?: string; value?: string }>(request);
    const envName = String(body.envName ?? "");
    if (!managedEnvNames().includes(envName)) return badRequest(reply, "unknown setting");
    const value = String(body.value ?? "").trim();
    if (value.length > 500) return badRequest(reply, "value too long");
    try {
      await saveProviderKey(envName, value || null, context.userId);
    } catch (error) {
      return badRequest(reply, error instanceof Error ? error.message : "could not save");
    }
    await writeAudit({
      tenantId: context.tenantId,
      action: value ? "ai.key.set" : "ai.key.cleared",
      entityType: "ai_provider_key",
      actorType: "user",
      actorUserId: context.userId,
      metadata: { envName },
    });
    return reply.send({ ok: true, source: secretSource(envName) });
  });

  /** Provider keys (configured or not, never the value) and spend across every workspace. */
  fastify.get("/v2/admin/ai", async (request, reply) => {
    if (!(await requirePlatformAdmin(request, reply))) return;
    await loadProviderKeys(true);
    const [text, image] = await Promise.all([
      prisma.contentText.groupBy({ by: ["provider", "model"], _count: { _all: true }, _sum: { costUsd: true, tokensInput: true, tokensOutput: true } }),
      prisma.contentImage.groupBy({ by: ["provider", "model"], _count: { _all: true }, _sum: { costUsd: true } }),
    ]);
    const describe = (kind: "text" | "image", p: { id: string; label: string; keyEnv: string; baseUrlEnv?: string; models: string[] }) => ({
      kind, id: p.id, label: p.label, keyEnv: p.keyEnv, baseUrlEnv: p.baseUrlEnv ?? null, models: p.models,
      keySource: secretSource(p.keyEnv), baseUrlSource: p.baseUrlEnv ? secretSource(p.baseUrlEnv) : null,
      configured: providerConfigured(p) && (kind === "text" || !p.baseUrlEnv || p.id === "openai" || secretOf(p.baseUrlEnv).length > 0),
    });
    return reply.send({
      providers: [...AI_PROVIDERS.map((p) => describe("text", p)), ...AI_IMAGE_PROVIDERS.map((p) => describe("image", p))],
      defaults: { text: getEnv("TEXT_PROVIDER", "mock"), image: getEnv("IMAGE_PROVIDER", "mock") },
      usage: [
        ...text.map((g) => ({ kind: "text", provider: g.provider, model: g.model, count: g._count._all, tokens: (g._sum.tokensInput ?? 0) + (g._sum.tokensOutput ?? 0), costUsd: Number(g._sum.costUsd ?? 0) })),
        ...image.map((g) => ({ kind: "image", provider: g.provider, model: g.model, count: g._count._all, tokens: 0, costUsd: Number(g._sum.costUsd ?? 0) })),
      ],
    });
  });
}
