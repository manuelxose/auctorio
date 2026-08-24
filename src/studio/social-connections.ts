import { Prisma, type PublishingAccount, type PublishingAccountStatus } from "@prisma/client";
import { getPrismaClient } from "../infrastructure/db/prisma";
import { getEnv } from "../shared/utils/env";
import { encryptSecret, sha256Hex, tryDecryptSecret } from "../shared/utils/crypto";
import { structuredEvent } from "../shared/utils/logger";
import { writeAudit } from "./audit";
import {
  getSocialIntegrationProvider,
  registerSocialIntegrationProvider,
  type ConnectionProviderName,
  type SocialConnectionState,
  type SocialPlatform,
} from "./social-provider";
import { AyrshareSocialProvider } from "./social-provider-ayrshare";
import { DirectSocialProvider } from "./social-provider-direct";
import { getSocialPublisher, readSocialCredentials } from "./social-publishers";

const prisma = getPrismaClient();

// Provider registry bootstrap (idempotent, synchronous).
registerSocialIntegrationProvider(() => new AyrshareSocialProvider());
registerSocialIntegrationProvider(() => new DirectSocialProvider());

const SESSION_TTL_MS = 15 * 60 * 1000;

export type SocialConnectionView = {
  id: string;
  tenantId: string;
  platform: string;
  provider: string;
  displayName: string;
  externalAccountId: string | null;
  username: string | null;
  avatarUrl: string | null;
  connectionState: SocialConnectionState;
  status: string;
  enabled: boolean;
  connectedAt: Date | null;
  lastVerifiedAt: Date | null;
  lastError: string | null;
  capabilities: Record<string, boolean>;
  hasCredentials: boolean;
  siteId: string | null;
  createdAt: Date;
};

function resolveProviderForPlatform(platform: SocialPlatform): ConnectionProviderName {
  const configured = getEnv("SOCIAL_PROVIDER", "").trim().toLowerCase();
  if (configured === "ayrshare" || configured === "direct") {
    return configured;
  }
  if (platform === "instagram") {
    // Ayrshare is strongly preferred for Instagram because it manages the
    // Facebook Page linkage requirements end to end.
    if (getEnv("AYRSHARE_API_KEY", "")) {
      return "ayrshare";
    }
  } else if (getEnv("X_CLIENT_ID", "") && getEnv("X_CLIENT_SECRET", "")) {
    return "direct";
  } else if (getEnv("AYRSHARE_API_KEY", "")) {
    return "ayrshare";
  }
  return "direct";
}

export function providerAvailability(): {
  provider: string;
  configured: boolean;
  requiresSetup: string | null;
} {
  if (getEnv("AYRSHARE_API_KEY", "")) {
    return { provider: "ayrshare", configured: true, requiresSetup: null };
  }
  const xReady = Boolean(getEnv("X_CLIENT_ID", "") && getEnv("X_CLIENT_SECRET", ""));
  const metaReady = Boolean(getEnv("META_APP_ID", "") && getEnv("META_APP_SECRET", ""));
  if (xReady || metaReady) {
    return {
      provider: "direct",
      configured: true,
      requiresSetup: !xReady ? "X developer app required (X_CLIENT_ID / X_CLIENT_SECRET)" : !metaReady ? "Meta app required (META_APP_ID / META_APP_SECRET)" : null,
    };
  }
  return {
    provider: "direct",
    configured: false,
    requiresSetup: "No social provider configured. Set AYRSHARE_API_KEY (managed) or X_CLIENT_ID/X_CLIENT_SECRET and META_APP_ID/META_APP_SECRET (direct OAuth).",
  };
}

// ────────────────────────────────────────────────────────────── Sessions

export type StartConnectionSessionInput = {
  tenantId: string;
  userId: string | null;
  siteId: string | null;
  platform: SocialPlatform;
  redirectUri: string;
};

export async function startConnectionSession(input: StartConnectionSessionInput) {
  const providerName = resolveProviderForPlatform(input.platform);
  const provider = getSocialIntegrationProvider(providerName);
  if (!provider.isConfigured()) {
    throw new Error(
      input.platform === "instagram"
        ? "instagram_connection_unavailable: the social provider is not configured for this workspace"
        : "x_connection_unavailable: the social provider is not configured for this workspace",
    );
  }

  const { generateOAuthState, generatePkceVerifier } = await import("../shared/utils/crypto");
  const state = generateOAuthState();
  const pkceVerifier = generatePkceVerifier();

  const session = await provider.createSession({
    platform: input.platform,
    redirectUri: input.redirectUri,
    state,
    pkceVerifier,
  });

  const created = await prisma.socialConnectionSession.create({
    data: {
      tenantId: input.tenantId,
      studioUserId: input.userId,
      siteId: input.siteId,
      platform: input.platform,
      provider: providerName,
      stateHash: sha256Hex(state),
      redirectUri: input.redirectUri,
      providerLink: session.providerUrl,
      providerToken: session.providerLinkToken,
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
      metadata: {
        pkceVerifier,
      } as Prisma.InputJsonObject,
    },
  });

  await writeAudit({
    tenantId: input.tenantId,
    actorType: "user",
    actorUserId: input.userId,
    action: "social.connection.started",
    entityType: "social_connection_session",
    entityId: created.id,
    metadata: { platform: input.platform, provider: providerName },
  });
  structuredEvent("social.connection.started", {
    tenantId: input.tenantId,
    platform: input.platform,
    provider: providerName,
    sessionId: created.id,
  });

  return {
    sessionId: created.id,
    url: session.providerUrl,
    provider: providerName,
    expiresAt: created.expiresAt,
    callbackUrl: input.redirectUri,
  };
}

// ────────────────────────────────────────────────────────────── Callback

export async function completeConnectionCallback(
  platform: SocialPlatform,
  query: Record<string, string | undefined>,
): Promise<{ accountId: string; username: string | null; platform: SocialPlatform; state: SocialConnectionState }> {
  if (query.error) {
    throw new Error(`social_connection_declined (${String(query.error).slice(0, 120)})`);
  }
  const state = query.state?.trim();
  if (!state) {
    throw new Error("social_connection_missing_state");
  }
  const session = await prisma.socialConnectionSession.findFirst({
    where: { stateHash: sha256Hex(state), platform },
  });
  if (!session) {
    throw new Error("social_connection_unknown_state");
  }
  if (session.consumedAt) {
    throw new Error("social_connection_state_already_used");
  }
  if (session.expiresAt.getTime() < Date.now()) {
    throw new Error("social_connection_state_expired");
  }

  await prisma.socialConnectionSession.update({
    where: { id: session.id },
    data: { consumedAt: new Date() },
  });

  const provider = getSocialIntegrationProvider(session.provider);
  const metadata = (session.metadata ?? {}) as Record<string, unknown>;

  let result;
  try {
    result = await provider.exchangeConnection({
      platform,
      query,
      context: {
        state,
        pkceVerifier: typeof metadata.pkceVerifier === "string" ? metadata.pkceVerifier : null,
        redirectUri: session.redirectUri ?? "",
        providerLinkToken: session.providerToken,
        metadata,
      },
    });
  } catch (error) {
    await writeAudit({
      tenantId: session.tenantId,
      actorType: "user",
      actorUserId: session.studioUserId,
      action: "social.connection.failed",
      entityType: "social_connection_session",
      entityId: session.id,
      metadata: { platform, provider: session.provider, error: error instanceof Error ? error.message.slice(0, 200) : String(error) },
    });
    structuredEvent("social.connection.failed", {
      tenantId: session.tenantId,
      platform,
      provider: session.provider,
      sessionId: session.id,
      error: error instanceof Error ? error.message : String(error),
    }, "warn");
    throw error;
  }

  const account = await upsertConnectionAccount({
    tenantId: session.tenantId,
    siteId: session.siteId,
    platform,
    provider: session.provider as ConnectionProviderName,
    profile: result.profile,
    credentials: result.credentials,
    metadata: result.metadata,
  });

  await writeAudit({
    tenantId: session.tenantId,
    actorType: "user",
    actorUserId: session.studioUserId,
    action: "social.connection.completed",
    entityType: "publishing_account",
    entityId: account.id,
    metadata: { platform, provider: session.provider, username: result.profile.username },
  });
  structuredEvent("social.connection.completed", {
    tenantId: session.tenantId,
    platform,
    provider: session.provider,
    accountId: account.id,
    username: result.profile.username,
  });

  return {
    accountId: account.id,
    username: result.profile.username,
    platform,
    state: "connected",
  };
}

export async function upsertConnectionAccount(input: {
  tenantId: string;
  siteId: string | null;
  platform: SocialPlatform;
  provider: ConnectionProviderName;
  profile: {
    providerProfileId: string;
    providerAccountId: string | null;
    username: string | null;
    displayName: string | null;
    avatarUrl: string | null;
    capabilities: Record<string, boolean>;
    metadata: Record<string, unknown>;
  };
  credentials: Record<string, unknown>;
  metadata: Record<string, unknown>;
}): Promise<PublishingAccount> {
  const tenantId = input.tenantId;
  const platform = input.platform;
  const profileId = input.profile.providerProfileId || input.profile.providerAccountId || null;
  if (!profileId) {
    throw new Error("social_connection_missing_profile_id");
  }

  const existing = await prisma.publishingAccount.findFirst({
    where: { tenantId, platform, provider: input.provider, providerProfileId: profileId },
  });

  const ciphertext = input.provider === "ayrshare"
    ? null // Ayrshare keeps tokens server-side; only the profile key is stored.
    : encryptSecret(JSON.stringify(input.credentials));

  const data = {
    tenantId,
    siteId: input.siteId,
    platform,
    provider: input.provider,
    providerProfileId: profileId,
    providerAccountId: input.profile.providerAccountId,
    displayName: input.profile.username ?? input.profile.displayName ?? (platform === "x" ? "X account" : "Instagram account"),
    externalAccountId: input.profile.providerAccountId,
    username: input.profile.username,
    avatarUrl: input.profile.avatarUrl,
    credentialsCiphertext: ciphertext,
    connectionStatus: "connected",
    connectionMetadata: {
      ...input.metadata,
      capabilities: input.profile.capabilities,
    } as Prisma.InputJsonObject,
    connectedAt: new Date(),
    lastVerifiedAt: new Date(),
    lastError: null,
    enabled: true,
    status: "active" as PublishingAccountStatus,
  };

  const account = existing
    ? await prisma.publishingAccount.update({ where: { id: existing.id }, data })
    : await prisma.publishingAccount.create({ data });

  return account;
}

// ────────────────────────────────────────────────────────────── Credentials

export function resolveAccountCredentials(account: PublishingAccount): Record<string, unknown> | null {
  if (account.provider === "legacy") {
    return readSocialCredentials(account.credentialsRef);
  }
  if (account.provider === "ayrshare") {
    return { profileKey: account.providerProfileId, provider: "ayrshare" };
  }
  if (account.credentialsCiphertext) {
    const plaintext = tryDecryptSecret(account.credentialsCiphertext);
    if (plaintext) {
      try {
        const parsed = JSON.parse(plaintext) as unknown;
        return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
      } catch {
        return null;
      }
    }
    return null;
  }
  return null;
}

// ────────────────────────────────────────────────────────────── Views & states

export function computeConnectionState(account: PublishingAccount): SocialConnectionState {
  if (!account.enabled) {
    return "disabled";
  }
  if (account.connectionStatus === "connected" || (account.provider === "legacy" && account.credentialsRef)) {
    return account.status === "error" ? "provider_error" : "connected";
  }
  if (account.connectionStatus === "expired") {
    return "expired";
  }
  if (account.connectionStatus === "permissions_required") {
    return "permissions_required";
  }
  if (account.connectionStatus === "provider_error" || account.status === "error") {
    return "provider_error";
  }
  if (account.connectionStatus === "connecting") {
    return "connecting";
  }
  if (account.provider !== "legacy" && !account.providerProfileId) {
    return "not_connected";
  }
  if (account.status === "pending") {
    return "connecting";
  }
  return "connected";
}

export function toConnectionView(account: PublishingAccount): SocialConnectionView {
  const metadata = (account.connectionMetadata ?? {}) as Record<string, unknown>;
  const capabilities = (metadata.capabilities ?? {}) as Record<string, boolean>;
  return {
    id: account.id,
    tenantId: account.tenantId,
    platform: account.platform,
    provider: account.provider,
    displayName: account.displayName,
    externalAccountId: account.externalAccountId,
    username: account.username,
    avatarUrl: account.avatarUrl,
    connectionState: computeConnectionState(account),
    status: account.status,
    enabled: account.enabled,
    connectedAt: account.connectedAt,
    lastVerifiedAt: account.lastVerifiedAt,
    lastError: account.lastError,
    capabilities,
    hasCredentials: Boolean(account.credentialsRef || account.credentialsCiphertext || account.provider === "ayrshare"),
    siteId: account.siteId,
    createdAt: account.createdAt,
  };
}

export async function listSocialConnections(tenantId: string, platform?: string) {
  const accounts = await prisma.publishingAccount.findMany({
    where: {
      tenantId,
      ...(platform ? { platform: platform as PublishingAccount["platform"] } : {}),
    },
    orderBy: { platform: "asc" },
  });
  return accounts.map(toConnectionView);
}

// ────────────────────────────────────────────────────────────── Verify / reconnect / disconnect

export async function verifySocialConnection(tenantId: string, accountId: string): Promise<{ ok: boolean; state: SocialConnectionState; message: string }> {
  const account = await prisma.publishingAccount.findFirst({ where: { id: accountId, tenantId } });
  if (!account) {
    throw new Error("connection_not_found");
  }
  if (account.provider === "legacy" || account.platform === "website") {
    return verifyLegacyAccount(account);
  }
  const provider = getSocialIntegrationProvider(account.provider);
  const credentials = resolveAccountCredentials(account);
  if (!credentials) {
    await prisma.publishingAccount.update({
      where: { id: account.id },
      data: { connectionStatus: "expired", status: "error", lastError: "connection_credentials_missing", lastVerifiedAt: new Date() },
    });
    return { ok: false, state: "expired", message: "The connection needs to be re-authorized." };
  }
  const result = await provider.getConnectionStatus(credentials, account);
  await prisma.publishingAccount.update({
    where: { id: account.id },
    data: {
      connectionStatus: result.state,
      status: result.state === "connected" ? "active" : "error",
      lastVerifiedAt: new Date(),
      lastError: result.state === "connected" ? null : result.message.slice(0, 500),
      ...(result.profile?.username ? { username: result.profile.username, displayName: result.profile.displayName ?? result.profile.username } : {}),
      ...(result.profile?.avatarUrl ? { avatarUrl: result.profile.avatarUrl } : {}),
    },
  });
  await writeAudit({
    tenantId,
    actorType: "user",
    action: "social.connection.verified",
    entityType: "publishing_account",
    entityId: account.id,
    metadata: { platform: account.platform, provider: account.provider, state: result.state },
  });
  return { ok: result.state === "connected", state: result.state, message: result.message };
}

async function verifyLegacyAccount(account: PublishingAccount): Promise<{ ok: boolean; state: SocialConnectionState; message: string }> {
  if (account.platform === "website") {
    return { ok: true, state: "connected", message: "website_account_no_verification" };
  }
  const credentials = readSocialCredentials(account.credentialsRef);
  if (!credentials) {
    await prisma.publishingAccount.update({
      where: { id: account.id },
      data: { status: "error", connectionStatus: "expired", lastVerifiedAt: new Date(), lastError: "credentials_not_resolved" },
    });
    return { ok: false, state: "expired", message: "credentials_not_resolved" };
  }
  const publisher = getSocialPublisher(account.platform as "x" | "instagram");
  const result = await publisher.validateCredentials(credentials);
  await prisma.publishingAccount.update({
    where: { id: account.id },
    data: {
      status: result.ok ? "active" : "error",
      connectionStatus: result.ok ? "connected" : "provider_error",
      lastVerifiedAt: new Date(),
      lastError: result.ok ? null : result.message.slice(0, 500),
    },
  });
  return { ok: result.ok, state: result.ok ? "connected" : "provider_error", message: result.message };
}

export async function disconnectSocialConnection(tenantId: string, accountId: string): Promise<void> {
  const account = await prisma.publishingAccount.findFirst({ where: { id: accountId, tenantId } });
  if (!account) {
    throw new Error("connection_not_found");
  }
  if (account.provider !== "legacy" && account.provider !== "ayrshare" && account.provider !== "direct") {
    throw new Error(`unsupported_provider ${account.provider}`);
  }
  try {
    if (account.provider === "ayrshare" || account.provider === "direct") {
      const provider = getSocialIntegrationProvider(account.provider);
      const credentials = resolveAccountCredentials(account);
      if (credentials && provider.disconnect) {
        await provider.disconnect(credentials, account);
      }
    }
  } catch (error) {
    structuredEvent("social.connection.disconnect_provider_failed", {
      tenantId,
      accountId: account.id,
      provider: account.provider,
      error: error instanceof Error ? error.message : String(error),
    }, "warn");
  }
  await prisma.publishingAccount.delete({ where: { id: account.id } });
  await writeAudit({
    tenantId,
    actorType: "user",
    action: "social.connection.disconnected",
    entityType: "publishing_account",
    entityId: account.id,
    metadata: { platform: account.platform, provider: account.provider, username: account.username },
  });
  structuredEvent("social.connection.disconnected", { tenantId, accountId: account.id, platform: account.platform, provider: account.provider });
}

// ────────────────────────────────────────────────────────────── Health loop

export type ConnectionHealthReport = {
  checked: number;
  healthy: number;
  broken: number;
  details: Array<{ accountId: string; platform: string; username: string | null; state: SocialConnectionState }>;
};

export async function runConnectionHealthCheck(): Promise<ConnectionHealthReport> {
  const accounts = await prisma.publishingAccount.findMany({
    where: { platform: { in: ["x", "instagram"] }, enabled: true },
  });

  const report: ConnectionHealthReport = { checked: 0, healthy: 0, broken: 0, details: [] };
  for (const account of accounts) {
    if (account.provider === "legacy") {
      continue; // legacy accounts keep the explicit Test connection flow
    }
    try {
      const result = await verifySocialConnection(account.tenantId, account.id);
      report.checked += 1;
      if (result.ok) {
        report.healthy += 1;
      } else {
        report.broken += 1;
      }
      report.details.push({ accountId: account.id, platform: account.platform, username: account.username, state: result.state });
    } catch (error) {
      report.broken += 1;
      report.details.push({ accountId: account.id, platform: account.platform, username: account.username, state: "provider_error" });
      structuredEvent("social.connection.health_failed", { accountId: account.id, platform: account.platform, error: error instanceof Error ? error.message : String(error) }, "warn");
    }
  }

  if (report.checked > 0) {
    structuredEvent("social.connection.health.completed", {
      checked: report.checked,
      healthy: report.healthy,
      broken: report.broken,
    });
  }
  return report;
}

export function connectionCallbackBaseUrl(): string {
  return `${getEnv("PUBLIC_BASE_URL", "http://localhost:3000")}/v2/social-connections/callback`;
}

export function studioConnectionsUrl(status: "connected" | "error" | "cancelled"): string {
  const base = getEnv("PUBLIC_BASE_URL", "http://localhost:3000");
  const basePath = getEnv("STUDIO_BASE_PATH", "/studio").replace(/\/$/, "");
  const code = status === "connected" ? "success" : status === "cancelled" ? "cancelled" : "error";
  return `${base}${basePath}/connections?social=${code}`;
}
