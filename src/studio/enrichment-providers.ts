// Enrichment providers (TMDB, OMDb, YouTube Data API, IMDb official API…):
// structured-data providers, independent from editorial sources. Credentials
// are server-side secret references (environment variable names) — API keys
// are never persisted in the database or returned to the browser.

import { Prisma } from "@prisma/client";
import type { EnrichmentProvider as EnrichmentProviderRow } from "@prisma/client";
import { getPrismaClient } from "../infrastructure/db/prisma";
import { getEnv } from "../shared/utils/env";
import { writeAudit } from "./audit";
import { validateScrapeUrl } from "../infrastructure/scraping";
import { fetchSourceHttp, SourceHttpError } from "./adapters/http";
import { parseApiItems } from "./adapters/api";
import { readConfigObject } from "./adapters/normalize";
import type { PaginatedResult } from "./types";
import { newRunKey } from "./discovery-run";

const prisma = getPrismaClient();

export type CreateEnrichmentProviderInput = {
  key: string;
  name: string;
  providerType: string;
  baseUrl?: string | null;
  endpoint?: string | null;
  credentialsRef?: string | null;
  enabled?: boolean;
  priority?: number;
  category?: string | null;
  language?: string;
  country?: string | null;
  refreshIntervalMinutes?: number;
  rateLimitPolicy?: Record<string, unknown> | null;
  extractionPolicy?: Record<string, unknown> | null;
  configuration?: Record<string, unknown> | null;
};

/** Resolve a credentialsRef (env var name) to its server-side secret value.
 *  Never returns anything to the browser — used only to build requests.
 *
 *  Security (Phase 5): only allowlisted env var names may be referenced.
 *  An arbitrary env-var name would let a tenant exfiltrate any server
 *  secret by pointing a provider at an attacker-controlled URL. */
const BASE_ALLOWED_SECRET_REFS = new Set(["TMDB_API_KEY", "OMDB_API_KEY", "YOUTUBE_API_KEY", "IMDB_API_KEY"]);

export function isAllowedCredentialsRef(credentialsRef: string | null | undefined): boolean {
  if (!credentialsRef || !/^[A-Z][A-Z0-9_]*$/.test(credentialsRef)) {
    return false;
  }
  if (BASE_ALLOWED_SECRET_REFS.has(credentialsRef)) {
    return true;
  }
  const extras = getEnv("EXTRA_ENRICHMENT_SECRET_REFS", "")
    .split(",")
    .map((entry) => entry.trim().toUpperCase())
    .filter(Boolean);
  return extras.includes(credentialsRef);
}

export function resolveCredentials(credentialsRef: string | null | undefined): string | null {
  if (!credentialsRef || !isAllowedCredentialsRef(credentialsRef)) {
    return null;
  }
  const value = getEnv(credentialsRef, "");
  return value ? value : null;
}

export function credentialsConfigured(credentialsRef: string | null | undefined): boolean {
  return resolveCredentials(credentialsRef) !== null;
}

/** Redact anything credential-shaped before a provider leaves the server. */
export function sanitizeProviderForClient(provider: EnrichmentProviderRow) {
  return {
    ...provider,
    credentialsRef: provider.credentialsRef,
    credentialsConfigured: credentialsConfigured(provider.credentialsRef),
    configuration: redactConfiguration(provider.configuration),
  };
}

/** Redact configuration keys that could carry secrets (headers/auth blocks). */
export function redactConfiguration(configuration: Prisma.JsonValue | null): Record<string, unknown> | null {
  const config = readConfigObject(configuration ?? undefined);
  if (!config) {
    return null;
  }
  const redacted: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(config)) {
    if (key.toLowerCase() === "headers" && value && typeof value === "object") {
      redacted[key] = Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([headerKey]) => [headerKey, "[redacted]"]),
      );
    } else if (/(authorization|bearer|token|secret|api_?key|password|credential)/i.test(key)) {
      redacted[key] = "[redacted]";
    } else {
      redacted[key] = value;
    }
  }
  return redacted;
}

export async function createEnrichmentProvider(tenantId: string, input: CreateEnrichmentProviderInput) {
  if (input.credentialsRef && !isAllowedCredentialsRef(input.credentialsRef)) {
    throw new Error("invalid_credentials_ref");
  }
  const provider = await prisma.enrichmentProvider.create({
    data: {
      tenantId,
      key: input.key.trim(),
      name: input.name.trim(),
      providerType: input.providerType,
      adapter: "api",
      baseUrl: input.baseUrl ?? null,
      endpoint: input.endpoint ?? null,
      credentialsRef: input.credentialsRef ?? null,
      enabled: input.enabled ?? true,
      priority: input.priority ?? 0,
      category: input.category ?? null,
      language: input.language ?? "en",
      country: input.country ?? null,
      refreshIntervalMinutes: input.refreshIntervalMinutes ?? 60,
      rateLimitPolicy: input.rateLimitPolicy ? (input.rateLimitPolicy as Prisma.InputJsonValue) : Prisma.JsonNull,
      extractionPolicy: input.extractionPolicy ? (input.extractionPolicy as Prisma.InputJsonValue) : Prisma.JsonNull,
      configuration: input.configuration ? (input.configuration as Prisma.InputJsonValue) : Prisma.JsonNull,
      verificationStatus: "unverified",
    },
  });
  await writeAudit({
    tenantId,
    action: "enrichment_provider.created",
    entityType: "enrichment_provider",
    entityId: provider.id,
    actorType: "user",
    metadata: { key: provider.key, providerType: provider.providerType },
  });
  return provider;
}

export async function updateEnrichmentProvider(tenantId: string, providerId: string, input: Partial<CreateEnrichmentProviderInput>) {
  if (input.credentialsRef && !isAllowedCredentialsRef(input.credentialsRef)) {
    throw new Error("invalid_credentials_ref");
  }
  const existing = await prisma.enrichmentProvider.findFirst({ where: { id: providerId, tenantId } });
  if (!existing) {
    return null;
  }
  const updated = await prisma.enrichmentProvider.update({
    where: { id: existing.id },
    data: {
      key: input.key?.trim() || undefined,
      name: input.name?.trim() || undefined,
      providerType: input.providerType,
      baseUrl: input.baseUrl === undefined ? undefined : input.baseUrl,
      endpoint: input.endpoint === undefined ? undefined : input.endpoint,
      credentialsRef: input.credentialsRef === undefined ? undefined : input.credentialsRef,
      enabled: input.enabled,
      priority: input.priority,
      category: input.category === undefined ? undefined : input.category,
      language: input.language,
      country: input.country === undefined ? undefined : input.country,
      refreshIntervalMinutes: input.refreshIntervalMinutes,
      rateLimitPolicy: input.rateLimitPolicy === undefined ? undefined : input.rateLimitPolicy ? (input.rateLimitPolicy as Prisma.InputJsonValue) : Prisma.JsonNull,
      extractionPolicy: input.extractionPolicy === undefined ? undefined : input.extractionPolicy ? (input.extractionPolicy as Prisma.InputJsonValue) : Prisma.JsonNull,
      configuration: input.configuration === undefined ? undefined : input.configuration ? (input.configuration as Prisma.InputJsonValue) : Prisma.JsonNull,
    },
  });
  await writeAudit({
    tenantId,
    action: "enrichment_provider.updated",
    entityType: "enrichment_provider",
    entityId: providerId,
    actorType: "user",
  });
  return updated;
}

export async function deleteEnrichmentProvider(tenantId: string, providerId: string): Promise<boolean> {
  const existing = await prisma.enrichmentProvider.findFirst({ where: { id: providerId, tenantId } });
  if (!existing) {
    return false;
  }
  await prisma.enrichmentProvider.delete({ where: { id: existing.id } });
  await writeAudit({
    tenantId,
    action: "enrichment_provider.deleted",
    entityType: "enrichment_provider",
    entityId: providerId,
    actorType: "user",
    metadata: { key: existing.key },
  });
  return true;
}

export async function listEnrichmentProviders(tenantId: string, input: { page: number; pageSize: number }): Promise<PaginatedResult<unknown>> {
  const skip = (input.page - 1) * input.pageSize;
  const [total, providers] = await prisma.$transaction([
    prisma.enrichmentProvider.count({ where: { tenantId } }),
    prisma.enrichmentProvider.findMany({
      where: { tenantId },
      orderBy: [{ priority: "desc" }, { name: "asc" }],
      skip,
      take: input.pageSize,
    }),
  ]);
  return {
    items: providers.map((provider) => sanitizeProviderForClient(provider)),
    page: input.page,
    pageSize: input.pageSize,
    total,
  };
}

/** Build a request URL for a provider: baseUrl + endpoint + default params +
 *  the credential in the scheme declared by configuration. */
export function buildProviderRequest(
  provider: Pick<EnrichmentProviderRow, "baseUrl" | "endpoint" | "configuration" | "credentialsRef">,
  secret: string | null,
  dynamicParams: Record<string, string> = {},
): { url: string; headers: Record<string, string> } {
  const config = readConfigObject(provider.configuration ?? undefined);
  const baseUrl = (provider.baseUrl ?? "").replace(/\/+$/, "");
  const endpoint = provider.endpoint ? (provider.endpoint.startsWith("/") ? provider.endpoint : `/${provider.endpoint}`) : "";
  const url = new URL(`${baseUrl}${endpoint}`);
  const headers: Record<string, string> = {};

  const defaultParams = config.defaultParams && typeof config.defaultParams === "object"
    ? (config.defaultParams as Record<string, string>)
    : {};
  for (const [key, value] of Object.entries({ ...defaultParams, ...dynamicParams })) {
    url.searchParams.set(key, value);
  }

  const scheme = typeof config.credentialScheme === "string" ? config.credentialScheme : "query_api_key";
  if (scheme === "bearer") {
    if (secret) {
      headers.authorization = `Bearer ${secret}`;
    }
  } else if (scheme === "header") {
    const headerName = typeof config.credentialHeader === "string" ? config.credentialHeader : "x-api-key";
    if (secret) {
      headers[headerName] = secret;
    }
  } else {
    const paramName = typeof config.apiKeyParam === "string" ? config.apiKeyParam : "api_key";
    if (secret) {
      url.searchParams.set(paramName, secret);
    }
  }
  return { url: url.toString(), headers };
}

/** Live test of a provider: resolve the secret server-side, call the API and
 *  return a sanitized sample. Never includes the credential. */
export async function testEnrichmentProvider(tenantId: string, providerId: string) {
  const provider = await prisma.enrichmentProvider.findFirst({ where: { id: providerId, tenantId } });
  if (!provider) {
    throw new Error("provider_not_found");
  }
  if (!provider.baseUrl) {
    return { ok: false, message: "provider_not_configured: no baseUrl (e.g. IMDb official API requires a licensed AWS Data Exchange endpoint)" };
  }
  const secret = resolveCredentials(provider.credentialsRef);
  const config = readConfigObject(provider.configuration ?? undefined);
  const dynamicParams = config.testParams && typeof config.testParams === "object"
    ? (config.testParams as Record<string, string>)
    : {};
  const { url, headers } = buildProviderRequest(provider, secret, dynamicParams);

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
    await validateScrapeUrl(parsedUrl);
  } catch {
    return { ok: false, message: "blocked_url" };
  }

  const started = Date.now();
  try {
    const response = await fetchSourceHttp(parsedUrl, {
      accept: "application/json",
      headers,
      timeoutMs: 12_000,
      retryAttempts: 2,
    });
    const json = JSON.parse(response.body) as unknown;
    const items = parseApiItems(json, response.finalUrl, 5, {
      ...config,
      itemsPath: config.itemsPath ?? "results",
      fields: config.fields ?? { id: "id", title: "title", url: "url", description: "description" },
    });
    const ok = items.length > 0;
    await prisma.enrichmentProvider.update({
      where: { id: provider.id },
      data: {
        lastFetchedAt: new Date(),
        lastSuccessAt: ok ? new Date() : undefined,
        consecutiveFailures: ok ? 0 : { increment: 1 },
        lastError: ok ? null : "empty_response",
        lastErrorAt: ok ? null : new Date(),
        verifiedAt: ok ? new Date() : null,
        verificationStatus: ok ? "verified" : "failed",
      },
    });
    return {
      ok,
      status: response.status,
      latencyMs: Date.now() - started,
      itemCount: items.length,
      credentialsConfigured: secret !== null,
      sample: items.slice(0, 3).map((item) => ({
        title: item.title,
        url: item.canonicalUrl,
        description: item.description,
        publishedAt: item.publishedAt,
        categories: item.categories,
      })),
    };
  } catch (error) {
    const status = error instanceof SourceHttpError ? error.status : null;
    const message = error instanceof Error ? error.message : String(error);
    const authError = status === 401 || status === 403;
    await prisma.enrichmentProvider.update({
      where: { id: provider.id },
      data: {
        lastFetchedAt: new Date(),
        consecutiveFailures: { increment: 1 },
        lastError: message,
        lastErrorAt: new Date(),
        verificationStatus: authError ? "failed" : undefined,
      },
    });
    return {
      ok: false,
      status,
      latencyMs: Date.now() - started,
      credentialsConfigured: secret !== null,
      message: authError && !secret ? "credentials_missing_or_invalid" : message,
    };
  }
}

export async function getEnrichmentProvider(tenantId: string, providerId: string) {
  const provider = await prisma.enrichmentProvider.findFirst({ where: { id: providerId, tenantId } });
  return provider ? sanitizeProviderForClient(provider) : null;
}

export function buildProviderTestRunKey(): string {
  return newRunKey("provider-test");
}
