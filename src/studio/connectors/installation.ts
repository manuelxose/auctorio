import { Prisma, type ConnectorInstallation, type InstallationKind, type InstallationState, type SiteType } from "@prisma/client";
import { getPrismaClient } from "../../infrastructure/db/prisma";
import { encryptSecret, sha256Hex } from "../../shared/utils/crypto";
import { structuredEvent } from "../../shared/utils/logger";
import { writeAudit } from "../audit";
import { getConnectorDescriptor } from "./registry";
import { installationToConnection, resolveSiteIdByOrigin, type DestinationStage } from "../destination-readiness";

const prisma = getPrismaClient();

// ────────────────────────────────────────────────────────────── State machine

export const INSTALLATION_STATES: InstallationState[] = [
  "draft",
  "discovering",
  "credentials_required",
  "verifying",
  "ready",
  "active",
  "failed",
  "expired",
  "disabled",
  "cancelled",
];

const TRANSITIONS: Record<InstallationState, InstallationState[]> = {
  draft: ["discovering", "credentials_required", "ready", "cancelled"],
  discovering: ["discovering", "credentials_required", "failed", "draft", "cancelled"],
  credentials_required: ["discovering", "verifying", "ready", "draft", "failed", "cancelled"],
  verifying: ["verifying", "ready", "failed", "credentials_required", "cancelled"],
  ready: ["discovering", "verifying", "active", "cancelled", "draft"],
  active: ["disabled", "expired", "failed", "cancelled"],
  failed: ["discovering", "draft", "credentials_required", "verifying", "cancelled"],
  expired: ["credentials_required", "cancelled"],
  disabled: ["active", "cancelled"],
  cancelled: ["draft"],
};

export class InvalidTransitionError extends Error {
  constructor(from: InstallationState, to: InstallationState) {
    super(`invalid_installation_transition ${from} -> ${to}`);
    this.name = "InvalidTransitionError";
  }
}

export function canTransition(from: InstallationState, to: InstallationState): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertCanTransition(from: InstallationState, to: InstallationState): void {
  if (!canTransition(from, to)) {
    throw new InvalidTransitionError(from, to);
  }
}

// ────────────────────────────────────────────────────────────── Persistence

export type InstallationView = {
  id: string;
  tenantId: string;
  siteId: string | null;
  kind: InstallationKind;
  provider: string;
  state: InstallationState;
  displayName: string | null;
  externalAccountId: string | null;
  config: Record<string, unknown> | null;
  discovered: Record<string, unknown> | null;
  capabilities: Record<string, unknown> | null;
  hasCredentials: boolean;
  credentialsRef: string | null;
  verificationStage?: DestinationStage;
  lastError: string | null;
  verifiedAt: Date | null;
  activatedAt: Date | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
};

export function toInstallationView(installation: ConnectorInstallation): InstallationView {
  const hasCredentials = Boolean(installation.credentialsCiphertext || installation.credentialsRef);
  const descriptor = getConnectorDescriptor(installation.provider);
  const rawConfig = (installation.config ?? {}) as Record<string, unknown>;
  const config: Record<string, unknown> = {};
  for (const field of descriptor?.configSchema.fields ?? []) {
    const value = rawConfig[field.key];
    if (field.kind === "secret") continue;
    if (field.kind === "url" && typeof value === "string") {
      try {
        const url = new URL(value);
        url.username = url.password = url.search = url.hash = "";
        config[field.key] = url.toString();
      } catch {
        continue;
      }
    } else if (typeof value === "string" || typeof value === "boolean") {
      config[field.key] = value;
    }
  }
  // The feed wizard can display the issuance/pull status, never the key hash.
  for (const key of ["feedKeyHint", "feedKeyIssuedAt", "feedSiteKey", "lastPulledAt"]) {
    if (typeof rawConfig[key] === "string") config[key] = rawConfig[key];
  }
  return {
    id: installation.id,
    tenantId: installation.tenantId,
    siteId: installation.siteId,
    kind: installation.kind,
    provider: installation.provider,
    state: installation.state,
    displayName: installation.displayName,
    externalAccountId: installation.externalAccountId,
    config: installation.config ? config : null,
    discovered: (installation.discovered ?? null) as Record<string, unknown> | null,
    capabilities: (installation.capabilities ?? null) as Record<string, unknown> | null,
    hasCredentials,
    credentialsRef: null,
    verificationStage: installation.kind === "website"
      ? installationToConnection({ ...installation, site: null, configured: hasCredentials }).stage
      : undefined,
    lastError: installation.lastError ? "The last connection check failed. Review the destination and try again." : null,
    verifiedAt: installation.verifiedAt,
    activatedAt: installation.activatedAt,
    version: installation.version,
    createdAt: installation.createdAt,
    updatedAt: installation.updatedAt,
  };
}

function secretFingerprint(secret: string): string {
  return sha256Hex(secret).slice(0, 16);
}

export async function createInstallation(input: {
  tenantId: string;
  siteId: string | null;
  kind: InstallationKind;
  provider: string;
  displayName?: string | null;
  userId?: string | null;
}): Promise<InstallationView> {
  const descriptor = getConnectorDescriptor(input.provider);
  if (!descriptor || descriptor.kind !== input.kind) {
    throw new Error(`unknown_connector ${input.provider} for kind ${input.kind}`);
  }
  if (input.siteId && !(await prisma.site.findFirst({ where: { id: input.siteId, tenantId: input.tenantId }, select: { id: true } }))) {
    throw new Error("site_not_found");
  }
  const created = await prisma.connectorInstallation.create({
    data: {
      tenantId: input.tenantId,
      siteId: input.siteId,
      kind: input.kind,
      provider: input.provider,
      state: "draft",
      displayName: input.displayName?.trim() || null,
      createdByStudioUserId: input.userId ?? null,
      capabilities: { supported: descriptor.capabilities } as Prisma.InputJsonObject,
    },
  });
  await writeAudit({
    tenantId: input.tenantId,
    actorType: "user",
    actorUserId: input.userId,
    action: "connection.installation.created",
    entityType: "connector_installation",
    entityId: created.id,
    metadata: { kind: input.kind, provider: input.provider },
  });
  structuredEvent("connection.installation.created", {
    tenantId: input.tenantId,
    installationId: created.id,
    kind: input.kind,
    provider: input.provider,
  });
  return toInstallationView(created);
}

export async function getInstallation(tenantId: string, id: string): Promise<ConnectorInstallation | null> {
  return prisma.connectorInstallation.findFirst({ where: { id, tenantId } });
}

export async function listInstallations(
  tenantId: string,
  filter: { kind?: InstallationKind; state?: InstallationState; siteId?: string } = {},
): Promise<InstallationView[]> {
  const rows = await prisma.connectorInstallation.findMany({
    where: {
      tenantId,
      ...(filter.kind ? { kind: filter.kind } : {}),
      ...(filter.state ? { state: filter.state } : {}),
      ...(filter.siteId ? { siteId: filter.siteId } : {}),
    },
    orderBy: { updatedAt: "desc" },
  });
  return rows.map(toInstallationView);
}

export async function transitionInstallation(
  tenantId: string,
  id: string,
  to: InstallationState,
  input: {
    userId?: string | null;
    error?: string | null;
    patch?: Partial<{
      discovered: Record<string, unknown>;
      capabilities: Record<string, unknown>;
      config: Record<string, unknown>;
      displayName: string;
      externalAccountId: string;
      siteId: string | null;
      verifiedAt: Date;
      activatedAt: Date;
    }>;
  } = {},
  db: Prisma.TransactionClient = prisma,
): Promise<InstallationView> {
  const current = await db.connectorInstallation.findFirst({ where: { tenantId, id } });
  if (!current) {
    throw new Error("installation_not_found");
  }
  if (current.state === to && Object.keys(input.patch ?? {}).length === 0 && !input.error) {
    return toInstallationView(current);
  }
  assertCanTransition(current.state, to);
  const updated = await db.connectorInstallation.update({
    where: { id: current.id, state: current.state },
    data: {
      state: to,
      lastError: input.error ? input.error.slice(0, 2000) : to === "failed" ? current.lastError : null,
      discovered: input.patch?.discovered ? (input.patch.discovered as Prisma.InputJsonObject) : undefined,
      capabilities: input.patch?.capabilities ? (input.patch.capabilities as Prisma.InputJsonObject) : undefined,
      config: input.patch?.config ? (input.patch.config as Prisma.InputJsonObject) : undefined,
      displayName: input.patch?.displayName !== undefined ? input.patch.displayName : undefined,
      externalAccountId: input.patch?.externalAccountId !== undefined ? input.patch.externalAccountId : undefined,
      siteId: input.patch?.siteId !== undefined ? input.patch.siteId : undefined,
      verifiedAt: input.patch?.verifiedAt !== undefined ? input.patch.verifiedAt : undefined,
      activatedAt: input.patch?.activatedAt !== undefined ? input.patch.activatedAt : undefined,
    },
  });
  await writeAudit({
    tenantId,
    actorType: input.userId ? "user" : "automation",
    actorUserId: input.userId,
    action: "connection.installation.transitioned",
    entityType: "connector_installation",
    entityId: id,
    metadata: { from: current.state, to, error: input.error ? input.error.slice(0, 300) : null },
  }, db);
  structuredEvent("connection.installation.transitioned", {
    tenantId,
    installationId: id,
    from: current.state,
    to,
  });
  return toInstallationView(updated);
}

/**
 * Store credentials write-only. Secrets are encrypted at rest and only a
 * fingerprint is retained for comparison; raw values are never returned.
 */
export async function storeInstallationCredentials(
  tenantId: string,
  id: string,
  input: { secrets: Record<string, string>; config: Record<string, unknown>; userId?: string | null },
): Promise<InstallationView> {
  const current = await getInstallation(tenantId, id);
  if (!current) {
    throw new Error("installation_not_found");
  }
  if (!["draft", "credentials_required", "ready", "failed", "expired"].includes(current.state)) {
    throw new Error("installation_credentials_locked");
  }
  const secretEntries = Object.entries(input.secrets).filter(([, value]) => value && value.trim().length > 0);
  const secrets = Object.fromEntries(secretEntries);
  if (Object.keys(secrets).length === 0) {
    throw new Error("installation_credentials_required");
  }
  const ciphertext = encryptSecret(JSON.stringify(secrets));
  const fingerprint = secretFingerprint(JSON.stringify(secretEntries.map(([key, value]) => [key, value]).sort()));
  const updated = await prisma.connectorInstallation.update({
    where: { id: current.id, state: current.state },
    data: {
      state: "credentials_required",
      verifiedAt: null,
      lastError: null,
      capabilities: { ...((current.capabilities ?? {}) as Prisma.InputJsonObject), verification: null },
      credentialsCiphertext: ciphertext,
      secretFingerprint: fingerprint,
      config: input.config as Prisma.InputJsonObject,
    },
  });
  await writeAudit({
    tenantId,
    actorType: input.userId ? "user" : "automation",
    actorUserId: input.userId,
    action: "connection.installation.credentials_stored",
    entityType: "connector_installation",
    entityId: id,
    metadata: { fingerprint },
  });
  return toInstallationView(updated);
}

export async function clearInstallationCredentials(tenantId: string, id: string, userId: string | null): Promise<void> {
  const current = await getInstallation(tenantId, id);
  if (!current) {
    throw new Error("installation_not_found");
  }
  await prisma.connectorInstallation.update({
    where: { id: current.id },
    data: { credentialsCiphertext: null, secretFingerprint: null },
  });
  await writeAudit({
    tenantId,
    actorType: userId ? "user" : "automation",
    actorUserId: userId,
    action: "connection.installation.credentials_cleared",
    entityType: "connector_installation",
    entityId: id,
  });
}

export async function cancelInstallation(tenantId: string, id: string, userId: string | null): Promise<InstallationView> {
  const current = await getInstallation(tenantId, id);
  if (!current) {
    throw new Error("installation_not_found");
  }
  if (current.state === "cancelled") {
    return toInstallationView(current);
  }
  if (current.state === "active" || current.state === "disabled") {
    // Active installations are cancelled via their own lifecycle; keep audit.
    await writeAudit({
      tenantId,
      actorType: userId ? "user" : "automation",
      actorUserId: userId,
      action: "connection.installation.cancelled",
      entityType: "connector_installation",
      entityId: id,
    });
    return toInstallationView(current);
  }
  return transitionInstallation(tenantId, id, "cancelled", { userId });
}

export async function deleteInstallationDraft(tenantId: string, id: string, userId: string | null): Promise<void> {
  const current = await getInstallation(tenantId, id);
  if (!current) {
    throw new Error("installation_not_found");
  }
  if (current.state === "active" || current.state === "disabled") {
    throw new Error("active_installation_cannot_be_deleted");
  }
  await prisma.connectorInstallation.delete({ where: { id: current.id } });
  await writeAudit({
    tenantId,
    actorType: userId ? "user" : "automation",
    actorUserId: userId,
    action: "connection.installation.deleted",
    entityType: "connector_installation",
    entityId: id,
  });
}

export async function disconnectWebsiteInstallation(tenantId: string, id: string, userId: string | null): Promise<InstallationView> {
  return prisma.$transaction(async (db) => {
    const current = await db.connectorInstallation.findFirst({ where: { id, tenantId, kind: "website" } });
    if (!current) throw new Error("installation_not_found");
    if (current.state === "disabled") return toInstallationView(current);
    if (current.state !== "active") throw new Error("installation_not_active");
    const sites = await db.site.findMany({ where: { tenantId }, select: { id: true, baseUrl: true } });
    const resolve = (installation: Pick<ConnectorInstallation, "siteId" | "config">) =>
      installation.siteId ?? resolveSiteIdByOrigin((installation.config as { baseUrl?: unknown } | null)?.baseUrl, sites);
    const siteId = resolve(current);
    if (!siteId || !sites.some((site) => site.id === siteId)) throw new Error("installation_site_not_linked");
    await db.$queryRaw`SELECT id FROM sites WHERE id = ${siteId}::uuid AND tenant_id = ${tenantId}::uuid FOR NO KEY UPDATE`;
    const installations = await db.connectorInstallation.findMany({
      where: { tenantId, kind: "website", state: "active", OR: [{ siteId }, { siteId: null }] },
      select: { id: true, siteId: true, config: true },
    });
    await db.connectorInstallation.updateMany({
      where: { tenantId, id: { in: installations.filter((installation) => resolve(installation) === siteId).map(({ id: installationId }) => installationId) }, state: "active" },
      data: { state: "disabled", siteId },
    });
    await writeAudit({
      tenantId, actorUserId: userId, actorType: userId ? "user" : "automation",
      action: "connection.installation.disconnected", entityType: "connector_installation", entityId: id,
      metadata: { siteId },
    }, db);
    return toInstallationView(await db.connectorInstallation.findUniqueOrThrow({ where: { id } }));
  });
}

export async function activateWebsiteInstallation(input: {
  tenantId: string; installationId: string; siteId: string; displayName: string; userId: string | null;
  transport?: { type: SiteType; baseUrl: string };
}): Promise<InstallationView> {
  return prisma.$transaction(async (db) => {
    const { tenantId, installationId, siteId, displayName, userId, transport } = input;
    await db.$queryRaw`SELECT id FROM sites WHERE id = ${siteId}::uuid AND tenant_id = ${tenantId}::uuid FOR NO KEY UPDATE`;
    const site = await db.site.findFirst({ where: { id: siteId, tenantId } });
    if (!site) throw new Error("site_not_found");
    const current = await db.connectorInstallation.findFirst({ where: { id: installationId, tenantId, kind: "website" } });
    if (current?.state !== "ready" || toInstallationView(current).verificationStage !== "ready") throw new Error("installation_not_verified");
    if (transport) await db.site.update({ where: { id: siteId }, data: transport });
    await db.connectorInstallation.updateMany({
      where: { tenantId, siteId, kind: "website", state: "active", id: { not: installationId } },
      data: { state: "disabled" },
    });
    return transitionInstallation(tenantId, installationId, "active", {
      userId, patch: { siteId, displayName, activatedAt: new Date() },
    }, db);
  });
}

export async function isWebsiteDestinationDisconnected(tenantId: string, siteId: string): Promise<boolean> {
  const installations = await prisma.connectorInstallation.findMany({
    where: { tenantId, siteId, kind: "website", state: { in: ["active", "disabled"] } },
    select: { state: true },
    distinct: ["state"],
  });
  return installations.some(({ state }) => state === "disabled") && !installations.some(({ state }) => state === "active");
}

export type InstallationWithSecret = ConnectorInstallation & { decryptedSecrets: Record<string, string> | null };

/**
 * Merge the non-secret configuration with the decrypted write-only secrets
 * so verification and publishing can run without ever returning them.
 */
export async function resolveInstallationSecrets(
  installation: ConnectorInstallation,
): Promise<Record<string, unknown>> {
  const config = (installation.config ?? {}) as Record<string, unknown>;
  if (!installation.credentialsCiphertext) {
    return { ...config };
  }
  const { tryDecryptSecret } = await import("../../shared/utils/crypto");
  const plaintext = tryDecryptSecret(installation.credentialsCiphertext);
  if (!plaintext) {
    return { ...config };
  }
  try {
    const parsed = JSON.parse(plaintext) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return { ...config, ...(parsed as Record<string, unknown>) };
    }
  } catch {
    /* ignore */
  }
  return { ...config };
}

export async function loadActiveInstallationForSite(
  tenantId: string,
  siteId: string,
  provider?: string,
): Promise<InstallationWithSecret | null> {
  const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!UUID_PATTERN.test(tenantId) || !UUID_PATTERN.test(siteId)) {
    return null;
  }
  const row = await prisma.connectorInstallation.findFirst({
    where: {
      tenantId,
      siteId,
      state: "active",
      ...(provider ? { provider } : {}),
    },
    orderBy: { activatedAt: "desc" },
  });
  if (!row) {
    return null;
  }
  let decryptedSecrets: Record<string, string> | null = null;
  if (row.credentialsCiphertext) {
    const { tryDecryptSecret } = await import("../../shared/utils/crypto");
    const plaintext = tryDecryptSecret(row.credentialsCiphertext);
    if (plaintext) {
      try {
        const parsed = JSON.parse(plaintext) as unknown;
        decryptedSecrets = parsed && typeof parsed === "object" ? (parsed as Record<string, string>) : null;
      } catch {
        decryptedSecrets = null;
      }
    }
  }
  return { ...row, decryptedSecrets };
}
