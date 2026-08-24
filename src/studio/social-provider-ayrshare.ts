import { getEnv, getNumberEnv } from "../shared/utils/env";
import { fetchWithTimeout } from "../shared/utils/http";
import {
  INSTAGRAM_CAPTION_LIMIT,
  X_POST_LIMIT,
  type SocialExchangeInput,
  type SocialExchangeResult,
  type SocialIntegrationProvider,
  type SocialPlatform,
  type SocialProfile,
  type SocialPublishInput,
  type SocialPublishResult,
  type SocialSessionRequest,
  type SocialSessionResult,
  validateInstagramPayload,
  validateXPayload,
} from "./social-provider";

// Ayrshare managed social infrastructure provider.
// Docs: https://www.ayrshare.com/docs/apis/overview
// - Account linking through Ayrshare Link (OAuth UX for the end user).
// - Provider-managed token storage and refresh; Auctorio never persists
//   plaintext OAuth tokens for Ayrshare connections.
// - Publishing through the unified /post endpoint.

const AYRSHARE_API_BASE = "https://api.ayrshare.com/api";

const PLATFORM_MAP: Record<SocialPlatform, string> = {
  x: "twitter",
  instagram: "instagram",
};

export class AyrshareSocialProvider implements SocialIntegrationProvider {
  readonly name = "ayrshare";

  private apiKey(): string {
    const key = getEnv("AYRSHARE_API_KEY", "").trim();
    if (!key) {
      throw new Error("AYRSHARE_API_KEY is required for the Ayrshare social provider");
    }
    return key;
  }

  private async request<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
    const response = await fetchWithTimeout(`${AYRSHARE_API_BASE}${path}`, {
      method: options.method ?? "GET",
      headers: {
        authorization: `Bearer ${this.apiKey()}`,
        ...(options.body ? { "content-type": "application/json" } : {}),
      },
      body: options.body ? (options.body as Record<string, unknown>) : null,
      timeoutMs: getNumberEnv("SOCIAL_PROVIDER_TIMEOUT_MS", 30_000),
      retries: 1,
    });
    const text = await response.text();
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(text) as Record<string, unknown>;
    } catch {
      throw new Error(`ayrshare_invalid_response status=${response.status}`);
    }
    if (!response.ok) {
      const detail = String(parsed.message ?? parsed.error ?? text).slice(0, 300);
      throw new Error(`ayrshare_api_error status=${response.status} message=${detail}`);
    }
    return parsed as T;
  }

  isConfigured(): boolean {
    return Boolean(getEnv("AYRSHARE_API_KEY", "").trim());
  }

  // ── Connection flow

  async createSession(request: SocialSessionRequest): Promise<SocialSessionResult> {
    const platform = PLATFORM_MAP[request.platform];
    const data = await this.request<{ url?: string; token?: string }>("/user/generateLink", {
      method: "POST",
      body: {
        platform,
        redirectUri: request.redirectUri,
      },
    });
    if (!data.url) {
      throw new Error("ayrshare_generate_link_missing_url");
    }
    return { providerUrl: data.url, providerLinkToken: data.token ?? null };
  }

  async exchangeConnection(input: SocialExchangeInput): Promise<SocialExchangeResult> {
    const platform = PLATFORM_MAP[input.platform];
    const authCode = input.query.authCode?.trim();
    const linkToken = input.query.token?.trim() ?? input.context.providerLinkToken;
    if (!authCode) {
      throw new Error("ayrshare_callback_missing_auth_code");
    }
    if (!linkToken) {
      throw new Error("ayrshare_callback_missing_link_token");
    }

    // Current API uses PUT /user/linkProfile. Older installations used POST,
    // so fall back when the endpoint is not available.
    let linked: { profileKey?: string; username?: string; avatarUrl?: string; title?: string } | null = null;
    try {
      linked = await this.request<{ profileKey?: string; username?: string; avatarUrl?: string; title?: string }>(
        "/user/linkProfile",
        { method: "PUT", body: { platform, authCode, linkToken } },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("status=404") || message.includes("status=405")) {
        linked = await this.request<{ profileKey?: string; username?: string; avatarUrl?: string; title?: string }>(
          "/user/linkProfile",
          { method: "POST", body: { platform, authCode, linkToken } },
        );
      } else {
        throw error;
      }
    }

    if (!linked?.profileKey) {
      throw new Error("ayrshare_link_profile_missing_profile_key");
    }

    const profile = await this.findProfile(input.platform, linked.profileKey);
    const capabilities = this.profileCapabilities(input.platform, profile.metadata);

    return {
      profile,
      credentials: {
        // No user tokens are stored: Ayrshare keeps them server-side.
        profileKey: linked.profileKey,
        provider: "ayrshare",
      },
      metadata: {
        provider: "ayrshare",
        profileKey: linked.profileKey,
        linkedAt: new Date().toISOString(),
      },
    };
  }

  private profileCapabilities(platform: SocialPlatform, metadata: Record<string, unknown>): SocialProfile["capabilities"] {
    if (platform === "instagram") {
      // Ayrshare exposes whether the IG account can publish through the
      // linked Facebook Page; conservative defaults unless metadata says otherwise.
      const canPublish = metadata.instagramPublishEnabled !== false;
      return {
        canPublish,
        canPostMedia: true,
        canPostStories: canPublish,
        canPostCarousel: true,
        canPostThreads: false,
      };
    }
    return {
      canPublish: true,
      canPostMedia: true,
      canPostStories: false,
      canPostCarousel: false,
      canPostThreads: true,
    };
  }

  async getConnectionStatus(
    credentials: Record<string, unknown>,
    account: { providerProfileId: string | null; providerAccountId: string | null; platform: string },
  ): Promise<{ state: "connected" | "expired" | "permissions_required" | "provider_error"; message: string; profile: SocialProfile | null }> {
    const profileKey = account.providerProfileId ?? String(credentials.profileKey ?? "");
    try {
      const profiles = await this.request<{ profiles?: Array<Record<string, unknown>> }>("/user");
      const match = (profiles.profiles ?? []).find(
        (entry) => String(entry.profileKey) === profileKey || String(entry.platform) === PLATFORM_MAP[account.platform as SocialPlatform],
      );
      if (!match) {
        return { state: "expired", message: "The social account is no longer linked to this workspace.", profile: null };
      }
      return {
        state: "connected",
        message: "Social account linked and verified.",
        profile: {
          providerProfileId: String(match.profileKey ?? profileKey),
          providerAccountId: match.id ? String(match.id) : null,
          platform: account.platform as SocialPlatform,
          username: match.username ? String(match.username) : null,
          displayName: match.title ? String(match.title) : null,
          avatarUrl: match.avatarUrl ? String(match.avatarUrl) : null,
          capabilities: this.profileCapabilities(account.platform as SocialPlatform, match as Record<string, unknown>),
          metadata: { provider: "ayrshare", platforms: match.platforms ?? null },
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("status=401") || message.includes("status=403")) {
        return { state: "expired", message: "The connection needs to be re-authorized.", profile: null };
      }
      return { state: "provider_error", message: "The social provider could not be reached.", profile: null };
    }
  }

  async disconnect(credentials: Record<string, unknown>, account: { providerProfileId: string | null; providerAccountId: string | null }): Promise<void> {
    const profileKey = account.providerProfileId ?? String(credentials.profileKey ?? "");
    if (!profileKey) {
      return;
    }
    await this.request("/user/unlinkProfile", { method: "DELETE", body: { profileKey } });
  }

  private async findProfile(platform: SocialPlatform, profileKey: string): Promise<SocialProfile> {
    const data = await this.request<{ profiles?: Array<Record<string, unknown>> }>("/user");
    const match = (data.profiles ?? []).find((entry) => String(entry.profileKey) === profileKey);
    const record = match ?? {};
    return {
      providerProfileId: profileKey,
      providerAccountId: record.id ? String(record.id) : null,
      platform,
      username: record.username ? String(record.username) : null,
      displayName: record.title ? String(record.title) : null,
      avatarUrl: record.avatarUrl ? String(record.avatarUrl) : null,
      capabilities: this.profileCapabilities(platform, record),
      metadata: { provider: "ayrshare", platforms: record.platforms ?? null },
    };
  }

  // ── Publishing

  validateContent(payload: SocialPublishInput, platform: SocialPlatform): { valid: boolean; errors: string[] } {
    const errors = platform === "x" ? validateXPayload(payload) : validateInstagramPayload(payload);
    return { valid: errors.length === 0, errors };
  }

  private static publishBody(payload: SocialPublishInput, platform: SocialPlatform, profileKey: string | null): Record<string, unknown> {
    if (platform === "x") {
      const thread = payload.thread && payload.thread.length > 0
        ? payload.thread.map((entry) => ({ text: entry.body }))
        : [{ text: payload.text }];
      return {
        post: thread.length === 1 ? payload.text : thread,
        platforms: ["twitter"],
        profileKeys: profileKey ? [profileKey] : undefined,
        mediaUrls: payload.mediaUrls.length ? payload.mediaUrls : undefined,
      };
    }
    return {
      post: payload.text,
      platforms: ["instagram"],
      profileKeys: profileKey ? [profileKey] : undefined,
      mediaUrls: payload.mediaUrls.length ? payload.mediaUrls : undefined,
    };
  }

  async publish(payload: SocialPublishInput, credentials: Record<string, unknown>, account: { providerProfileId: string | null; providerAccountId: string | null; platform: string }): Promise<SocialPublishResult> {
    const profileKey = account.providerProfileId ?? String(credentials.profileKey ?? "");
    const body = AyrshareSocialProvider.publishBody(payload, account.platform as SocialPlatform, profileKey || null);
    const result = await this.request<{ id?: string; postUrl?: string; errors?: unknown }>("/post", { method: "POST", body });
    if (!result.id) {
      const detail = result.errors ? JSON.stringify(result.errors).slice(0, 300) : "no_post_id";
      throw new Error(`ayrshare_publish_failed ${detail}`);
    }
    return {
      externalId: result.id,
      externalUrl: result.postUrl ?? null,
      responsePayload: { provider: "ayrshare", id: result.id },
      dryRun: false,
    };
  }

  async deletePublication(externalId: string): Promise<SocialPublishResult> {
    await this.request("/post", { method: "DELETE", body: { id: externalId } });
    return { externalId: null, externalUrl: null, responsePayload: { provider: "ayrshare", deleted: true }, dryRun: false };
  }

  async getPublicationStatus(externalId: string): Promise<Record<string, unknown>> {
    return this.request(`/post?id=${encodeURIComponent(externalId)}`);
  }
}

export const X_LIMIT = X_POST_LIMIT;
export const IG_LIMIT = INSTAGRAM_CAPTION_LIMIT;
