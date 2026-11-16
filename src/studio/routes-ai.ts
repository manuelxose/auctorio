import type { FastifyInstance } from "fastify";
import { getTextProvider } from "../infrastructure/ai/text";
import {
  AI_IMAGE_PROVIDERS,
  AI_PROVIDERS,
  AI_TASKS,
  findImageProvider,
  findProvider,
  isValidModel,
  loadAiSelection,
  loadImageSelection,
  loadProviderKeys,
  secretOf,
  providerConfigured,
  saveAiSelection,
  saveImageSelection,
} from "../infrastructure/ai/ai-settings";
import { getEnv } from "../shared/utils/env";
import { writeAudit } from "./audit";
import { requirePlatformAdmin } from "./routes-admin";
import { badRequest, parseBody } from "./http-utils";

/** Settings → AI: pick which provider and model the workspace uses. Keys stay in the server env. */
export function registerAiSettingsRoutes(fastify: FastifyInstance) {
  fastify.get("/v2/ai/providers", async (request, reply) => {
    const context = await requirePlatformAdmin(request, reply);
    if (!context) return;
    await loadProviderKeys(true);
    const selection = await loadAiSelection(context.tenantId, true);
    const imageSelection = await loadImageSelection(context.tenantId, true);
    return reply.send({
      tasks: AI_TASKS,
      image: {
        selection: imageSelection,
        environmentDefault: { provider: getEnv("IMAGE_PROVIDER", "mock"), model: getEnv("IMAGE_MODEL", "") || null },
        providers: AI_IMAGE_PROVIDERS.map((provider) => ({
          id: provider.id,
          label: provider.label,
          description: provider.description,
          keyEnv: provider.keyEnv,
          // Custom needs both a key and an endpoint on the server.
          configured: providerConfigured(provider) && (!provider.baseUrlEnv || Boolean(provider.defaultBaseUrl) || secretOf(provider.baseUrlEnv).length > 0),
          models: provider.models,
          defaultModel: provider.defaultModel || null,
          freeModel: Boolean(provider.freeModel),
        })),
      },
      selection,
      environmentDefault: { provider: getEnv("TEXT_PROVIDER", "mock"), model: getEnv("TEXT_MODEL", "") || null },
      providers: AI_PROVIDERS.map((provider) => ({
        id: provider.id,
        label: provider.label,
        description: provider.description,
        keyEnv: provider.keyEnv,
        configured: providerConfigured(provider),
        models: provider.models,
        defaultModel: provider.defaultModel || null,
        freeModel: Boolean(provider.freeModel),
      })),
    });
  });

  fastify.put("/v2/ai/provider", async (request, reply) => {
    const context = await requirePlatformAdmin(request, reply);
    if (!context) return;
    const body = parseBody<{ provider?: string; model?: string }>(request);
    const provider = findProvider(body.provider);
    if (!provider) return badRequest(reply, `provider must be one of: ${AI_PROVIDERS.map((p) => p.id).join(", ")}`);
    const model = String(body.model ?? "").trim();
    if (!isValidModel(provider, model)) return badRequest(reply, `model is not available for ${provider.label}`);
    if (!providerConfigured(provider)) return badRequest(reply, `${provider.label} has no API key on the server (${provider.keyEnv})`);
    const before = await loadAiSelection(context.tenantId, true);
    const selection = await saveAiSelection(context.tenantId, { provider: provider.id, model }, context.userId);
    await writeAudit({
      tenantId: context.tenantId,
      action: "ai.provider.updated",
      entityType: "ai_provider_setting",
      actorType: context.userId ? "user" : "system",
      actorUserId: context.userId,
      metadata: { from: before, to: selection },
    });
    return reply.send({ selection });
  });

  fastify.put("/v2/ai/image-provider", async (request, reply) => {
    const context = await requirePlatformAdmin(request, reply);
    if (!context) return;
    const body = parseBody<{ provider?: string; model?: string }>(request);
    const provider = findImageProvider(body.provider);
    if (!provider) return badRequest(reply, `provider must be one of: ${AI_IMAGE_PROVIDERS.map((p) => p.id).join(", ")}`);
    const model = String(body.model ?? "").trim();
    if (!isValidModel(provider as never, model)) return badRequest(reply, `model is not available for ${provider.label}`);
    if (!providerConfigured(provider as never)) return badRequest(reply, `${provider.label} has no API key on the server (${provider.keyEnv})`);
    const before = await loadImageSelection(context.tenantId, true);
    const selection = await saveImageSelection(context.tenantId, { provider: provider.id, model }, context.userId);
    await writeAudit({
      tenantId: context.tenantId,
      action: "ai.image_provider.updated",
      entityType: "ai_image_setting",
      actorType: context.userId ? "user" : "system",
      actorUserId: context.userId,
      metadata: { from: before, to: selection },
    });
    return reply.send({ selection });
  });

  /** Sends one short prompt with the saved choice; costs a few tokens. */
  fastify.post("/v2/ai/provider/test", async (request, reply) => {
    const context = await requirePlatformAdmin(request, reply);
    if (!context) return;
    const started = Date.now();
    try {
      const result = await getTextProvider().generate({
        systemPrompt: "Reply with exactly one short sentence.",
        prompt: "Say that the connection works, in Spanish.",
        maxTokens: 60,
      });
      return reply.send({ ok: true, provider: result.provider, model: result.model, latencyMs: Date.now() - started, sample: result.output.slice(0, 200), usage: result.usage ?? null });
    } catch (error) {
      const message = error instanceof Error ? error.message : "provider_error";
      return reply.send({ ok: false, latencyMs: Date.now() - started, error: message.replace(/(sk|key)[-_][A-Za-z0-9-_]{8,}/gi, "[redacted]").slice(0, 300) });
    }
  });
}
