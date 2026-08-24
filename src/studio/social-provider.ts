import { getEnv } from "../shared/utils/env";
import type { PublishingAccount } from "@prisma/client";

// ────────────────────────────────────────────────────────────── Domain types

export type SocialPlatform = "x" | "instagram";

export type SocialConnectionState =
  | "not_connected"
  | "connecting"
  | "connected"
  | "expired"
  | "permissions_required"
  | "provider_error"
  | "disabled";

export type SocialConnectionCapabilities = {
  canPublish: boolean;
  canPostMedia: boolean;
  canPostStories: boolean;
  canPostCarousel: boolean;
  canPostThreads: boolean;
};

export type SocialProfile = {
  providerProfileId: string;
  providerAccountId: string | null;
  platform: SocialPlatform;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  capabilities: SocialConnectionCapabilities;
  metadata: Record<string, unknown>;
};

export type SocialPublishInput = {
  text: string;
  mediaUrls: string[];
  mediaType: "text" | "photo" | "carousel" | "story";
  thread?: Array<{ body: string }>;
};

export type SocialPublishResult = {
  externalId: string | null;
  externalUrl: string | null;
  responsePayload: Record<string, unknown> | null;
  dryRun: boolean;
};

export type SocialSessionRequest = {
  platform: SocialPlatform;
  redirectUri: string;
  state: string;
  pkceVerifier: string;
};

export type SocialSessionResult = {
  providerUrl: string;
  providerLinkToken: string | null;
};

export type SocialExchangeContext = {
  state: string;
  pkceVerifier: string | null;
  redirectUri: string;
  providerLinkToken: string | null;
  metadata: Record<string, unknown>;
};

export type SocialExchangeInput = {
  platform: SocialPlatform;
  query: Record<string, string | undefined>;
  context: SocialExchangeContext;
};

export type SocialExchangeResult = {
  profile: SocialProfile;
  credentials: Record<string, unknown>;
  metadata: Record<string, unknown>;
};

export interface SocialIntegrationProvider {
  readonly name: string;
  isConfigured(): boolean;
  createSession(request: SocialSessionRequest): Promise<SocialSessionResult>;
  exchangeConnection(input: SocialExchangeInput): Promise<SocialExchangeResult>;
  getConnectionStatus(
    credentials: Record<string, unknown>,
    account: Pick<PublishingAccount, "providerProfileId" | "providerAccountId" | "platform">,
  ): Promise<{ state: SocialConnectionState; message: string; profile: SocialProfile | null }>;
  refreshConnection?(credentials: Record<string, unknown>): Promise<Record<string, unknown> | null>;
  disconnect?(credentials: Record<string, unknown>, account: Pick<PublishingAccount, "providerProfileId" | "providerAccountId">): Promise<void>;
  publish(payload: SocialPublishInput, credentials: Record<string, unknown>, account: Pick<PublishingAccount, "providerProfileId" | "providerAccountId" | "platform">): Promise<SocialPublishResult>;
  deletePublication(externalId: string, credentials: Record<string, unknown>, account: Pick<PublishingAccount, "providerProfileId" | "providerAccountId" | "platform">): Promise<SocialPublishResult>;
  getPublicationStatus?(externalId: string, credentials: Record<string, unknown>): Promise<Record<string, unknown>>;
  validateContent(payload: SocialPublishInput, platform: SocialPlatform): { valid: boolean; errors: string[] };
}

export const CONNECTION_PROVIDERS = ["ayrshare", "direct", "legacy"] as const;
export type ConnectionProviderName = (typeof CONNECTION_PROVIDERS)[number];

export function defaultConnectionProvider(): ConnectionProviderName {
  const configured = getEnv("SOCIAL_PROVIDER", "").trim().toLowerCase();
  if (configured === "ayrshare" || configured === "direct") {
    return configured;
  }
  // Managed provider is preferred when configured; otherwise direct OAuth apps.
  if (getEnv("AYRSHARE_API_KEY", "")) {
    return "ayrshare";
  }
  return "direct";
}

const providers = new Map<string, () => SocialIntegrationProvider>();

export function registerSocialIntegrationProvider(factory: () => SocialIntegrationProvider): void {
  const provider = factory();
  providers.set(provider.name, () => provider);
}

export function getSocialIntegrationProvider(name: string): SocialIntegrationProvider {
  const factory = providers.get(name);
  if (!factory) {
    throw new Error(`social_provider_not_registered ${name}`);
  }
  return factory();
}

export function isSocialIntegrationConfigured(name: string): boolean {
  const factory = providers.get(name);
  if (!factory) {
    return false;
  }
  try {
    return factory().isConfigured();
  } catch {
    return false;
  }
}

// ────────────────────────────────────────────────────────────── Content validation (platform rules)

export const X_POST_LIMIT = 280;
export const INSTAGRAM_CAPTION_LIMIT = 2200;
export const INSTAGRAM_IMAGE_RATIOS = [
  { width: 1080, height: 1350, label: "4:5 portrait (feed)" },
  { width: 1080, height: 1080, label: "1:1 square (feed)" },
  { width: 1080, height: 1920, label: "9:16 story" },
] as const;

export function validateXPayload(payload: SocialPublishInput): string[] {
  const errors: string[] = [];
  const bodies = payload.thread && payload.thread.length > 0
    ? payload.thread.map((entry) => entry.body)
    : [payload.text];
  if (bodies.length === 0 || bodies.every((body) => !body.trim())) {
    errors.push("x_post_requires_text");
  }
  for (const [index, body] of bodies.entries()) {
    if (body.length > X_POST_LIMIT) {
      errors.push(`x_post_${index + 1}_exceeds_${X_POST_LIMIT}_characters`);
    }
  }
  if (payload.mediaUrls.length > 4) {
    errors.push("x_supports_max_4_images");
  }
  return errors;
}

export function validateInstagramPayload(payload: SocialPublishInput): string[] {
  const errors: string[] = [];
  if (payload.text.length > INSTAGRAM_CAPTION_LIMIT) {
    errors.push(`instagram_caption_exceeds_${INSTAGRAM_CAPTION_LIMIT}_characters`);
  }
  if (payload.mediaType === "carousel" && payload.mediaUrls.length < 2) {
    errors.push("instagram_carousel_requires_multiple_images");
  }
  if (payload.mediaType !== "story" && payload.mediaUrls.length === 0) {
    errors.push("instagram_feed_requires_image");
  }
  return errors;
}
