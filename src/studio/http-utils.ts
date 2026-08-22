import crypto from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import { tenantRepository } from "../infrastructure/db/repositories";
import { sha256 } from "../shared/utils/hash";
import { getEnv } from "../shared/utils/env";
import {
  buildStudioProxySignature,
  hasStudioPermission,
  isStudioProxySignatureFresh,
  STUDIO_PERMISSIONS,
  type StudioPermission,
} from "./security";

export type StudioRequestContext = {
  tenantId: string;
  userId: string | null;
  sessionId: string | null;
  permissions: string[];
  authMode: "api_key" | "oidc";
};

export const INTERNAL_SECRET_HEADER = "x-studio-internal-secret";
export const STUDIO_TENANT_HEADER = "x-studio-tenant-id";
export const STUDIO_USER_HEADER = "x-studio-user-id";
export const STUDIO_SESSION_HEADER = "x-studio-session-id";
export const STUDIO_PERMISSIONS_HEADER = "x-studio-permissions";
export const STUDIO_SIGNATURE_HEADER = "x-studio-signature";
export const STUDIO_TIMESTAMP_HEADER = "x-studio-timestamp";

export function errorBody(reply: FastifyReply, code: string, message: string) {
  return {
    error: {
      code,
      message,
      requestId: reply.request.id ?? null,
    },
  };
}

export function badRequest(reply: FastifyReply, message: string) {
  return reply.code(400).send(errorBody(reply, "bad_request", message));
}

export function notFound(reply: FastifyReply, message: string) {
  return reply.code(404).send(errorBody(reply, "not_found", message));
}

export function conflict(reply: FastifyReply, message: string) {
  return reply.code(409).send(errorBody(reply, "conflict", message));
}

export function parseBody<T>(request: FastifyRequest): T {
  return (request.body ?? {}) as T;
}

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function requireTenant(request: FastifyRequest, reply: FastifyReply): Promise<string | null> {
  if (request.tenantId) {
    return request.tenantId;
  }

  const authHeader = request.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    reply.code(401).send({ error: "unauthorized", message: "Missing API key" });
    return null;
  }

  const token = authHeader.slice("Bearer ".length).trim();
  if (!token) {
    reply.code(401).send({ error: "unauthorized", message: "Invalid API key" });
    return null;
  }

  const tenant = await tenantRepository.findByApiKeyHash(sha256(token));
  if (!tenant || tenant.status !== "active") {
    reply.code(401).send({ error: "unauthorized", message: "Invalid API key" });
    return null;
  }

  request.tenantId = tenant.id;
  return tenant.id;
}

export function readSingleHeader(
  request: FastifyRequest,
  name: string,
): string | null {
  const value = request.headers[name];
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }
  return typeof value === "string" ? value : null;
}

export function getInternalSharedSecret(): string {
  return getEnv("STUDIO_PROXY_SHARED_SECRET", "studio-proxy-dev-secret-change-me");
}

export function requireInternalSecret(request: FastifyRequest, reply: FastifyReply): boolean {
  const secret = readSingleHeader(request, INTERNAL_SECRET_HEADER);
  if (!secret || secret !== getInternalSharedSecret()) {
    reply.code(401).send({ error: "unauthorized", message: "Invalid studio internal secret" });
    return false;
  }
  return true;
}

export function readSignedStudioContext(request: FastifyRequest): StudioRequestContext | null {
  const tenantId = readSingleHeader(request, STUDIO_TENANT_HEADER)?.trim() || "";
  const userId = readSingleHeader(request, STUDIO_USER_HEADER)?.trim() || "";
  const sessionId = readSingleHeader(request, STUDIO_SESSION_HEADER)?.trim() || "";
  const permissionsValue = readSingleHeader(request, STUDIO_PERMISSIONS_HEADER)?.trim() || "";
  const timestamp = readSingleHeader(request, STUDIO_TIMESTAMP_HEADER)?.trim() || "";
  const signature = readSingleHeader(request, STUDIO_SIGNATURE_HEADER)?.trim() || "";

  if (!tenantId || !userId || !sessionId || !timestamp || !signature) {
    return null;
  }
  if (!isStudioProxySignatureFresh(timestamp)) {
    return null;
  }

  const permissions = permissionsValue
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const expected = buildStudioProxySignature({
    tenantId,
    userId,
    sessionId,
    permissions,
    timestamp,
    method: request.method,
    url: request.url,
  });

  const providedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (providedBuffer.length !== expectedBuffer.length) {
    return null;
  }
  if (!crypto.timingSafeEqual(providedBuffer, expectedBuffer)) {
    return null;
  }

  request.tenantId = tenantId;
  request.studioUserId = userId;
  request.studioSessionId = sessionId;
  request.studioPermissions = permissions;
  request.studioAuthMode = "oidc";

  return {
    tenantId,
    userId,
    sessionId,
    permissions,
    authMode: "oidc",
  };
}

export async function requireStudioContext(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<StudioRequestContext | null> {
  const signed = readSignedStudioContext(request);
  if (signed) {
    return signed;
  }

  const tenantId = await requireTenant(request, reply);
  if (!tenantId) {
    return null;
  }

  request.studioAuthMode = "api_key";
  request.studioPermissions = [...STUDIO_PERMISSIONS];

  return {
    tenantId,
    userId: null,
    sessionId: null,
    permissions: [...STUDIO_PERMISSIONS],
    authMode: "api_key",
  };
}

export async function requireStudioPermission(
  request: FastifyRequest,
  reply: FastifyReply,
  permission: StudioPermission,
): Promise<StudioRequestContext | null> {
  const context = await requireStudioContext(request, reply);
  if (!context) {
    return null;
  }

  if (!hasStudioPermission(context.permissions, permission)) {
    reply.code(403).send({ error: "forbidden", message: `Missing permission: ${permission}` });
    return null;
  }

  return context;
}

export function parsePage(value: unknown, fallback = 1): number {
  const parsed = Number.parseInt(String(value ?? fallback), 10);
  if (Number.isNaN(parsed) || parsed < 1) {
    return fallback;
  }
  return parsed;
}

export function parsePageSize(value: unknown, fallback = 20, max = 100): number {
  const parsed = Number.parseInt(String(value ?? fallback), 10);
  if (Number.isNaN(parsed) || parsed < 1) {
    return fallback;
  }
  return Math.min(parsed, max);
}

export function parseJsonObjectField(
  value: unknown,
  fieldName: string,
): Record<string, unknown> | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null || value === "") {
    return null;
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch (error) {
      throw new Error(`${fieldName} must be valid JSON (${String(error)})`);
    }
    throw new Error(`${fieldName} must be a JSON object`);
  }
  if (typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  throw new Error(`${fieldName} must be a JSON object`);
}

export function isOneOf<T extends string>(value: string, allowed: readonly T[]): value is T {
  return allowed.includes(value as T);
}

export function parseOptionalString(value: unknown): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  const normalized = String(value).trim();
  return normalized || null;
}

export function parseStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

export function parsePermissionList(value: unknown): StudioPermission[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const permissions = value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);

  if (!permissions.every((permission) => hasStudioPermission(STUDIO_PERMISSIONS, permission))) {
    throw new Error(`permissions must be one of: ${STUDIO_PERMISSIONS.join(", ")}`);
  }

  return Array.from(new Set(permissions)) as StudioPermission[];
}
