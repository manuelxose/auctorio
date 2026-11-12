import type { FastifyInstance } from "fastify";
import { getTextProvider } from "../infrastructure/ai/text";
import {
  AI_PROVIDERS,
  findProvider,
  isValidModel,
  loadAiSelection,
  providerConfigured,
  saveAiSelection,
} from "../infrastructure/ai/ai-settings";
import { getEnv } from "../shared/utils/env";
import { writeAudit } from "./audit";
import { badRequest, parseBody, requireStudioContext, requireStudioPermission } from "./http-utils";

/** Settings → AI: pick which provider and model the workspace uses. Keys stay in the server env. */
export function registerAiSettingsRoutes(fastify: FastifyInstance) {
  fastify.get("/v2/ai/providers", async (request, reply) => {
    const context = await requireStudioContext(request, reply);
    if (!context) return;
    const selection = await loadAiSelection(context.tenantId, true);
    return reply.send({
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
    const context = await requireStudioPermission(request, reply, "workspace.manage");
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

  /** Sends one short prompt with the saved choice; costs a few tokens. */
  fastify.post("/v2/ai/provider/test", async (request, reply) => {
    const context = await requireStudioPermission(request, reply, "workspace.manage");
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
