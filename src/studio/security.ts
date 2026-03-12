import crypto from "node:crypto";
import { getEnv } from "../shared/utils/env";
import { sha256 } from "../shared/utils/hash";

export const STUDIO_PERMISSIONS = [
  "workspace.manage",
  "users.manage",
  "roles.manage",
  "prompts.manage",
  "projects.manage",
  "review.approve",
  "publishing.manage",
  "integrations.manage",
  "analytics.read",
] as const;

export type StudioPermission = (typeof STUDIO_PERMISSIONS)[number];

type SystemRoleDefinition = {
  name: string;
  description: string;
  permissions: StudioPermission[];
};

export const STUDIO_SYSTEM_ROLES: Record<string, SystemRoleDefinition> = {
  owner: {
    name: "Owner",
    description: "Control total del workspace editorial, identidad, equipo y runtime.",
    permissions: [...STUDIO_PERMISSIONS],
  },
  admin: {
    name: "Admin",
    description: "Gobierna operaciones, configuracion y surfaces internas del cockpit.",
    permissions: [...STUDIO_PERMISSIONS],
  },
  editor: {
    name: "Editor",
    description: "Opera briefs, artículos y generación editorial sin gobernar el workspace.",
    permissions: ["projects.manage", "analytics.read"],
  },
  reviewer: {
    name: "Reviewer",
    description: "Aprueba versiones y opera la cola de revisión editorial.",
    permissions: ["review.approve", "analytics.read"],
  },
  seo_manager: {
    name: "SEO Manager",
    description: "Gobierna prompts, QA y señales SEO del workspace.",
    permissions: ["prompts.manage", "projects.manage", "analytics.read"],
  },
  publisher: {
    name: "Publisher",
    description: "Gestiona destinos, ventanas de publicación e integraciones operativas.",
    permissions: ["publishing.manage", "integrations.manage", "analytics.read"],
  },
};

export type StudioSignedContext = {
  tenantId: string;
  userId: string;
  sessionId: string;
  permissions: string[];
  timestamp: string;
  signature: string;
};

export function hasStudioPermission(
  permissions: Iterable<string>,
  permission: string,
): boolean {
  const set = permissions instanceof Set ? permissions : new Set(permissions);
  return set.has(permission) || set.has("*");
}

export function normalizeRoleKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
}

export function slugifyTenantName(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "workspace";
}

export function generateStudioToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

export function hashStudioToken(value: string): string {
  return sha256(value);
}

function buildSecretKey(envName: string, fallbackEnvName: string, fallbackValue: string): Buffer {
  const secret = getEnv(envName, getEnv(fallbackEnvName, fallbackValue));
  return crypto.createHash("sha256").update(secret).digest();
}

export function encryptStudioSecret(value: string): string {
  const iv = crypto.randomBytes(12);
  const key = buildSecretKey(
    "STUDIO_IDENTITY_ENCRYPTION_SECRET",
    "STUDIO_PROXY_SHARED_SECRET",
    "studio-dev-secret-change-me",
  );
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [
    "v1",
    iv.toString("base64url"),
    tag.toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");
}

export function decryptStudioSecret(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  try {
    const [version, ivPart, tagPart, encryptedPart] = value.split(".");
    if (version !== "v1" || !ivPart || !tagPart || !encryptedPart) {
      return null;
    }

    const key = buildSecretKey(
      "STUDIO_IDENTITY_ENCRYPTION_SECRET",
      "STUDIO_PROXY_SHARED_SECRET",
      "studio-dev-secret-change-me",
    );
    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      key,
      Buffer.from(ivPart, "base64url"),
    );
    decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(encryptedPart, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return null;
  }
}

export function buildStudioProxySignature(input: Omit<StudioSignedContext, "signature"> & {
  method: string;
  url: string;
}): string {
  const payload = [
    input.method.toUpperCase(),
    input.url,
    input.tenantId,
    input.userId,
    input.sessionId,
    input.permissions.join(","),
    input.timestamp,
  ].join("\n");

  return crypto
    .createHmac(
      "sha256",
      getEnv("STUDIO_PROXY_SHARED_SECRET", "studio-proxy-dev-secret-change-me"),
    )
    .update(payload)
    .digest("base64url");
}

export function isStudioProxySignatureFresh(timestamp: string): boolean {
  const value = Number.parseInt(timestamp, 10);
  if (Number.isNaN(value)) {
    return false;
  }

  const delta = Math.abs(Date.now() - value);
  return delta <= 5 * 60 * 1000;
}
