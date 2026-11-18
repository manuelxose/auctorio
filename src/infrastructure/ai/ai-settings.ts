// Which AI provider and model a workspace uses for text generation.
//
// Keys never leave the server: they are read from the environment under the same names
// GuíaTV uses (DEEPSEEK_API_KEY, ANTHROPIC_API_KEY, OPENAI_API_KEY). An admin only picks
// one of the configured providers and a model; the choice is stored per workspace.
//
// The active workspace travels in an AsyncLocalStorage context entered by requests
// (requireStudioContext) and by workers per job, so every getTextProvider() call made on
// behalf of a workspace uses that workspace's choice without changing call sites.

import { AsyncLocalStorage } from "node:async_hooks";
import { Prisma } from "@prisma/client";
import { getPrismaClient } from "../db/prisma";
import { getEnv } from "../../shared/utils/env";
import { encryptSecret, tryDecryptSecret } from "../../shared/utils/crypto";

export type AiProviderId = "deepseek" | "anthropic" | "openai";

export type AiProviderDefinition = {
  id: AiProviderId;
  label: string;
  keyEnv: string;
  baseUrlEnv?: string;
  defaultBaseUrl?: string;
  /** Selectable models; providers with `freeModel` also accept any valid model id. */
  models: string[];
  defaultModel: string;
  freeModel?: boolean;
  description: string;
};

export const AI_PROVIDERS: AiProviderDefinition[] = [
  {
    id: "deepseek",
    label: "DeepSeek",
    keyEnv: "DEEPSEEK_API_KEY",
    baseUrlEnv: "DEEPSEEK_BASE_URL",
    defaultBaseUrl: "https://api.deepseek.com",
    models: ["deepseek-chat", "deepseek-reasoner"],
    defaultModel: "deepseek-chat",
    description: "Low cost, fast for planning and drafts",
  },
  {
    id: "anthropic",
    label: "Claude (Anthropic)",
    keyEnv: "ANTHROPIC_API_KEY",
    models: ["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5"],
    defaultModel: "claude-opus-5-5",
    description: "Highest writing quality; Haiku for cheap, quick tasks",
  },
  {
    id: "openai",
    label: "OpenAI (GPT / Codex)",
    keyEnv: "OPENAI_API_KEY",
    baseUrlEnv: "OPENAI_BASE_URL",
    defaultBaseUrl: "https://api.openai.com",
    models: (process.env.OPENAI_MODELS ?? "").split(",").map((m) => m.trim()).filter(Boolean),
    defaultModel: (process.env.OPENAI_MODEL ?? "").trim(),
    freeModel: true,
    description: "Any model id enabled on your OpenAI account",
  },
];

export type AiSelection = { provider: AiProviderId; model: string };
/** What a text call is for; each may use its own model (Settings → AI). */
export type AiUse = "plans" | "articles" | "repair" | "social" | "copilot";
export const AI_USES: Array<{ key: AiUse; label: string }> = [
  { key: "plans", label: "Editorial plans" },
  { key: "articles", label: "Articles" },
  { key: "repair", label: "Quality repair" },
  { key: "social", label: "Social posts" },
  { key: "copilot", label: "Copilot" },
];
/** The workspace's text choice: a default model, optional per-use models and an explicit fallback. */
export type AiTextSettings = AiSelection & { uses?: Partial<Record<AiUse, AiSelection>>; fallback?: AiSelection | null };
export type AiImageProviderId = "openai" | "custom";
export type AiImageSelection = { provider: AiImageProviderId; model: string };

/** Image generation backends. "custom" is any OpenAI-compatible endpoint configured by IMAGE_API_* env vars. */
export const AI_IMAGE_PROVIDERS: Array<Omit<AiProviderDefinition, "id"> & { id: AiImageProviderId }> = [
  {
    id: "openai",
    label: "OpenAI Images",
    keyEnv: "OPENAI_API_KEY",
    baseUrlEnv: "OPENAI_BASE_URL",
    defaultBaseUrl: "https://api.openai.com",
    // gpt-image-1 / dall-e-3 are no longer served to current keys (400 "model does not exist", 2026-11-15).
    models: ["gpt-image-2", "gpt-image-1.5", "gpt-image-1-mini"],
    defaultModel: "gpt-image-2",
    description: "gpt-image-2 for quality, gpt-image-1-mini as a cheaper fallback",
  },
  {
    id: "custom",
    label: "Custom (OpenAI-compatible)",
    keyEnv: "IMAGE_API_KEY",
    baseUrlEnv: "IMAGE_API_BASE_URL",
    models: [],
    defaultModel: (process.env.IMAGE_MODEL ?? "").trim(),
    freeModel: true,
    description: "Any compatible image endpoint set on the server (Flux, Stability, fal...)",
  },
];

/** What each task is used for, shown in Settings -> AI so admins know what a choice affects. */
export const AI_TASKS = [
  { task: "text", label: "Writing", uses: AI_USES.map((use) => use.label) },
  { task: "image", label: "Images", uses: ["Article cover images", "Social post images"] },
];
export type ResolvedAiSelection = AiSelection & { apiKey: string; baseUrl?: string };

const MODEL_ID = /^[A-Za-z0-9._:/-]{1,100}$/;
const CACHE_TTL_MS = 15_000;
const tenantContext = new AsyncLocalStorage<{ tenantId: string | null }>();
const cache = new Map<string, { value: AiTextSettings | null; at: number }>();
const imageCache = new Map<string, { value: AiImageSelection | null; at: number }>();

export function findImageProvider(id: string | null | undefined) {
  return AI_IMAGE_PROVIDERS.find((provider) => provider.id === id) ?? null;
}

export function findProvider(id: string | null | undefined): AiProviderDefinition | null {
  return AI_PROVIDERS.find((provider) => provider.id === id) ?? null;
}

/** Keys/endpoints saved from the admin UI win over the server environment. */
const keyCache = new Map<string, string>();
let keysLoadedAt = 0;

export async function loadProviderKeys(fresh = false): Promise<void> {
  if (!fresh && Date.now() - keysLoadedAt < CACHE_TTL_MS) return;
  const rows = await getPrismaClient().aiProviderKey.findMany();
  keyCache.clear();
  for (const row of rows) {
    const value = tryDecryptSecret(row.ciphertext);
    if (value) keyCache.set(row.envName, value);
  }
  keysLoadedAt = Date.now();
}

/** Env names an admin may set from the UI. */
export function managedEnvNames(): string[] {
  const all = [...AI_PROVIDERS, ...AI_IMAGE_PROVIDERS].flatMap((p) => [p.keyEnv, p.baseUrlEnv ?? ""]);
  return Array.from(new Set(all.filter(Boolean)));
}

export function secretOf(envName: string, fallback = ""): string {
  return (keyCache.get(envName) ?? getEnv(envName, fallback)).trim();
}

/** Where a value comes from, without exposing it. */
export function secretSource(envName: string): "ui" | "env" | null {
  if (keyCache.has(envName)) return "ui";
  return getEnv(envName, "").trim() ? "env" : null;
}

export async function saveProviderKey(envName: string, value: string | null, userId: string | null): Promise<void> {
  const prisma = getPrismaClient();
  if (!value) await prisma.aiProviderKey.deleteMany({ where: { envName } });
  else {
    const ciphertext = encryptSecret(value);
    await prisma.aiProviderKey.upsert({
      where: { envName },
      create: { envName, ciphertext, updatedByUserId: userId },
      update: { ciphertext, updatedByUserId: userId },
    });
  }
  await loadProviderKeys(true);
}

export function providerConfigured(provider: { keyEnv: string }): boolean {
  return secretOf(provider.keyEnv).length > 0;
}

export function isValidModel(provider: AiProviderDefinition, model: string): boolean {
  if (provider.models.includes(model)) return true;
  return Boolean(provider.freeModel && MODEL_ID.test(model));
}

/** A stored {provider, model} pair, or null when it no longer names a known provider/model. */
export function readSelection(value: unknown): AiSelection | null {
  const raw = value as { provider?: unknown; model?: unknown } | null;
  const provider = findProvider(typeof raw?.provider === "string" ? raw.provider : null);
  const model = typeof raw?.model === "string" ? raw.model.trim() : "";
  return provider && model && isValidModel(provider, model) ? { provider: provider.id, model } : null;
}

function readUses(value: unknown): Partial<Record<AiUse, AiSelection>> {
  const uses: Partial<Record<AiUse, AiSelection>> = {};
  for (const { key } of AI_USES) {
    const selection = readSelection((value as Record<string, unknown> | null)?.[key]);
    if (selection) uses[key] = selection;
  }
  return uses;
}

/** Reads (and caches) a workspace's stored choice. */
export async function loadAiSelection(tenantId: string, fresh = false): Promise<AiTextSettings | null> {
  const hit = cache.get(tenantId);
  if (!fresh && hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;
  const row = await getPrismaClient().aiProviderSetting.findUnique({ where: { tenantId } });
  const provider = findProvider(row?.provider);
  const value = row && provider ? { provider: provider.id, model: row.model, uses: readUses(row.uses), fallback: readSelection(row.fallback) } : null;
  cache.set(tenantId, { value, at: Date.now() });
  return value;
}

export async function saveAiSelection(tenantId: string, settings: AiTextSettings, userId: string | null): Promise<AiTextSettings> {
  const value: AiTextSettings = { provider: settings.provider, model: settings.model, uses: readUses(settings.uses ?? {}), fallback: readSelection(settings.fallback) };
  const data = { provider: value.provider, model: value.model, uses: value.uses as object, fallback: value.fallback ?? Prisma.DbNull, updatedByUserId: userId };
  await getPrismaClient().aiProviderSetting.upsert({ where: { tenantId }, create: { tenantId, ...data }, update: data });
  cache.set(tenantId, { value, at: Date.now() });
  return value;
}

/**
 * Models to try for a text call, in order: the use's model (or the default), the explicit
 * fallback, then every other configured provider on its default model, so a provider that is
 * down or out of credit never stops the work. Pure: `configured` says which providers have a key.
 */
export function textChain(settings: AiTextSettings, use: AiUse | undefined, configured: (provider: AiProviderDefinition) => boolean): AiSelection[] {
  const chain: AiSelection[] = [];
  const add = (selection: AiSelection | null | undefined) => {
    const provider = findProvider(selection?.provider);
    if (!selection || !provider || !configured(provider)) return;
    if (!chain.some((entry) => entry.provider === selection.provider && entry.model === selection.model)) chain.push(selection);
  };
  add((use && settings.uses?.[use]) || settings);
  add(settings.fallback);
  for (const provider of AI_PROVIDERS) {
    if (provider.defaultModel && !chain.some((entry) => entry.provider === provider.id)) add({ provider: provider.id, model: provider.defaultModel });
  }
  return chain;
}

export async function loadImageSelection(tenantId: string, fresh = false): Promise<AiImageSelection | null> {
  const hit = imageCache.get(tenantId);
  if (!fresh && hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;
  const row = await getPrismaClient().aiImageSetting.findUnique({ where: { tenantId } });
  const provider = findImageProvider(row?.provider);
  const value = row && provider ? { provider: provider.id, model: row.model } : null;
  imageCache.set(tenantId, { value, at: Date.now() });
  return value;
}

export async function saveImageSelection(tenantId: string, selection: AiImageSelection, userId: string | null): Promise<AiImageSelection> {
  await getPrismaClient().aiImageSetting.upsert({
    where: { tenantId },
    create: { tenantId, provider: selection.provider, model: selection.model, updatedByUserId: userId },
    update: { provider: selection.provider, model: selection.model, updatedByUserId: userId },
  });
  imageCache.set(tenantId, { value: selection, at: Date.now() });
  return selection;
}

/**
 * Fastify onRequest hook: opens an empty per-request context. It must wrap the request
 * from the start, because a context entered inside an awaited helper does not flow back
 * into the route handler. enterAiTenant() then fills in the workspace.
 */
export function aiRequestContextHook(_request: unknown, _reply: unknown, done: () => void): void {
  tenantContext.run({ tenantId: null }, done);
}

/** Marks the rest of the current request (and work it starts) as running for this workspace. */
export async function enterAiTenant(tenantId: string): Promise<void> {
  await Promise.all([loadAiSelection(tenantId).catch(() => null), loadImageSelection(tenantId).catch(() => null), loadProviderKeys().catch(() => null)]);
  const store = tenantContext.getStore();
  if (store) store.tenantId = tenantId;
}

/** Runs a background job (worker) for a workspace. */
export async function withAiTenant<T>(tenantId: string | null | undefined, fn: () => Promise<T>): Promise<T> {
  if (!tenantId) return fn(); // jobs without a workspace (e.g. publishing) make no model calls
  await Promise.all([loadAiSelection(tenantId).catch(() => null), loadImageSelection(tenantId).catch(() => null), loadProviderKeys().catch(() => null)]);
  return tenantContext.run({ tenantId }, fn);
}

/** The models that apply right now for a use, in fallback order, with their server-side keys; empty means "use the environment default". */
export function activeAiChain(use?: AiUse): ResolvedAiSelection[] {
  const tenantId = tenantContext.getStore()?.tenantId;
  const settings = tenantId ? cache.get(tenantId)?.value : null;
  if (!settings) return [];
  const chain = textChain(settings, use, providerConfigured);
  if (!chain.length) {
    const provider = findProvider(settings.provider);
    throw new Error(`${provider?.label ?? settings.provider} is selected for this workspace but no text provider has a key on the server`);
  }
  return chain.map((selection) => {
    const provider = findProvider(selection.provider)!;
    const baseUrl = provider.baseUrlEnv ? secretOf(provider.baseUrlEnv, provider.defaultBaseUrl ?? "") : provider.defaultBaseUrl;
    return { ...selection, apiKey: secretOf(provider.keyEnv), baseUrl };
  });
}

/** The first model of the chain (what a call tries first); null means "use the environment default". */
export function activeAiSelection(use?: AiUse): ResolvedAiSelection | null {
  return activeAiChain(use)[0] ?? null;
}

/** The image selection that applies right now, with its server-side key and endpoint; null means "use the environment default". */
export function activeImageSelection(): (AiImageSelection & { apiKey: string; baseUrl: string }) | null {
  const tenantId = tenantContext.getStore()?.tenantId;
  const selection = tenantId ? imageCache.get(tenantId)?.value : null;
  const provider = findImageProvider(selection?.provider);
  if (!selection || !provider) return null;
  const apiKey = secretOf(provider.keyEnv);
  const baseUrl = secretOf(provider.baseUrlEnv ?? "", provider.defaultBaseUrl ?? "");
  if (!apiKey || !baseUrl) {
    throw new Error(`${provider.label} is selected for images but ${provider.keyEnv} / ${provider.baseUrlEnv} is not set on the server`);
  }
  return { ...selection, apiKey, baseUrl };
}
