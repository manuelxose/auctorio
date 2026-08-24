import { getEnv, getNumberEnv } from "../shared/utils/env";
import { fetchWithTimeout } from "../shared/utils/http";
import { pkceChallenge } from "../shared/utils/crypto";
import type {
  SocialExchangeInput,
  SocialExchangeResult,
  SocialIntegrationProvider,
  SocialPlatform,
  SocialProfile,
  SocialPublishInput,
  SocialPublishResult,
  SocialSessionRequest,
  SocialSessionResult,
} from "./social-provider";
import { validateInstagramPayload, validateXPayload } from "./social-provider";

// Direct OAuth integration (Bring Your Own App).
// - X: OAuth 2.0 Authorization Code with PKCE against api.x.com (scopes
//   tweet.read tweet.write users.read offline.access). Requires an X
//   developer app (X_CLIENT_ID / X_CLIENT_SECRET). Tokens are refreshed
//   with the offline.access refresh token and encrypted at rest.
// - Instagram: Meta Graph OAuth (META_APP_ID / META_APP_SECRET) with
//   instagram_basic + instagram_content_publish + pages scopes. Long-lived
//   page tokens are exchanged and encrypted at rest.

const X_AUTHORIZE_URL = "https://x.com/i/oauth2/authorize";
const X_TOKEN_URL = "https://api.x.com/2/oauth2/token";
const X_API_BASE = "https://api.x.com/2";
const X_MEDIA_UPLOAD_URL = "https://upload.x.com/2/media/upload";
const X_SCOPES = ["tweet.read", "tweet.write", "users.read", "offline.access"].join(" ");

const META_GRAPH_BASE = "https://graph.facebook.com/v21.0";
const META_DIALOG_URL = "https://www.facebook.com/v21.0/dialog/oauth";
const META_SCOPES = "instagram_basic,instagram_content_publish,pages_show_list,pages_read_engagement,business_management";

type XTokenSet = {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: number | null;
  scope: string[];
};

type MetaTokenSet = {
  accessToken: string;
  userId: string;
  expiresAt: number | null;
  pageId: string | null;
  igUserId: string | null;
  igUsername: string | null;
};

function basicAuth(clientId: string, clientSecret: string): string {
  return `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
}

export class DirectSocialProvider implements SocialIntegrationProvider {
  readonly name = "direct";

  isConfigured(): boolean {
    return this.xConfigured() || this.metaConfigured();
  }

  private xConfigured(): boolean {
    return Boolean(getEnv("X_CLIENT_ID", "") && getEnv("X_CLIENT_SECRET", ""));
  }

  private metaConfigured(): boolean {
    return Boolean(getEnv("META_APP_ID", "") && getEnv("META_APP_SECRET", ""));
  }

  // ── Sessions

  async createSession(request: SocialSessionRequest): Promise<SocialSessionResult> {
    if (request.platform === "x") {
      if (!this.xConfigured()) {
        throw new Error("x_oauth_not_configured (X_CLIENT_ID and X_CLIENT_SECRET are required)");
      }
      const url = new URL(X_AUTHORIZE_URL);
      url.searchParams.set("response_type", "code");
      url.searchParams.set("client_id", getEnv("X_CLIENT_ID", ""));
      url.searchParams.set("redirect_uri", request.redirectUri);
      url.searchParams.set("scope", X_SCOPES);
      url.searchParams.set("state", request.state);
      url.searchParams.set("code_challenge", pkceChallenge(request.pkceVerifier));
      url.searchParams.set("code_challenge_method", "S256");
      return { providerUrl: url.toString(), providerLinkToken: null };
    }
    if (!this.metaConfigured()) {
      throw new Error("instagram_oauth_not_configured (META_APP_ID and META_APP_SECRET are required)");
    }
    const url = new URL(META_DIALOG_URL);
    url.searchParams.set("client_id", getEnv("META_APP_ID", ""));
    url.searchParams.set("redirect_uri", request.redirectUri);
    url.searchParams.set("scope", META_SCOPES);
    url.searchParams.set("state", request.state);
    url.searchParams.set("response_type", "code");
    return { providerUrl: url.toString(), providerLinkToken: null };
  }

  // ── Exchange

  async exchangeConnection(input: SocialExchangeInput): Promise<SocialExchangeResult> {
    if (input.platform === "x") {
      return this.exchangeX(input);
    }
    return this.exchangeInstagram(input);
  }

  private async exchangeX(input: SocialExchangeInput): Promise<SocialExchangeResult> {
    const code = input.query.code?.trim();
    if (!code) {
      throw new Error("x_oauth_missing_code");
    }
    const body = new URLSearchParams({
      code,
      grant_type: "authorization_code",
      redirect_uri: input.context.redirectUri,
      code_verifier: input.context.pkceVerifier ?? "",
    });
    const response = await fetchWithTimeout(X_TOKEN_URL, {
      method: "POST",
      headers: {
        authorization: basicAuth(getEnv("X_CLIENT_ID", ""), getEnv("X_CLIENT_SECRET", "")),
        "content-type": "application/x-www-form-urlencoded",
      },
      body,
      timeoutMs: getNumberEnv("SOCIAL_PROVIDER_TIMEOUT_MS", 30_000),
      retries: 1,
    });
    const payload = await response.text();
    if (!response.ok) {
      throw new Error(`x_token_exchange_failed status=${response.status} body=${payload.slice(0, 200)}`);
    }
    const parsed = JSON.parse(payload) as { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string };
    if (!parsed.access_token) {
      throw new Error("x_token_exchange_missing_access_token");
    }
    const tokens: XTokenSet = {
      accessToken: parsed.access_token,
      refreshToken: parsed.refresh_token ?? null,
      expiresAt: parsed.expires_in ? Date.now() + parsed.expires_in * 1000 : null,
      scope: (parsed.scope ?? "").split(" ").filter(Boolean),
    };
    const me = await this.xGetMe(tokens.accessToken);
    return {
      profile: {
        providerProfileId: me.id,
        providerAccountId: me.id,
        platform: "x",
        username: me.username,
        displayName: me.name,
        avatarUrl: me.profile_image_url ?? null,
        capabilities: { canPublish: true, canPostMedia: true, canPostStories: false, canPostCarousel: false, canPostThreads: true },
        metadata: { provider: "direct", scope: tokens.scope },
      },
      credentials: { provider: "direct", platform: "x", accessToken: tokens.accessToken, refreshToken: tokens.refreshToken, expiresAt: tokens.expiresAt },
      metadata: { provider: "direct", oauth: "x_oauth2_pkce", connectedAt: new Date().toISOString() },
    };
  }

  private async xGetMe(accessToken: string): Promise<{ id: string; username: string | null; name: string | null; profile_image_url?: string }> {
    const response = await fetchWithTimeout(`${X_API_BASE}/users/me?user.fields=profile_image_url,username,name`, {
      headers: { authorization: `Bearer ${accessToken}` },
      timeoutMs: 15_000,
      retries: 1,
    });
    const payload = await response.text();
    if (!response.ok) {
      throw new Error(`x_users_me_failed status=${response.status} body=${payload.slice(0, 200)}`);
    }
    const parsed = JSON.parse(payload) as { data?: { id?: string; username?: string; name?: string; profile_image_url?: string } };
    if (!parsed.data?.id) {
      throw new Error("x_users_me_missing_id");
    }
    return {
      id: parsed.data.id,
      username: parsed.data.username ?? null,
      name: parsed.data.name ?? null,
      profile_image_url: parsed.data.profile_image_url,
    };
  }

  private async exchangeInstagram(input: SocialExchangeInput): Promise<SocialExchangeResult> {
    const code = input.query.code?.trim();
    if (!code) {
      throw new Error("instagram_oauth_missing_code");
    }
    const appId = getEnv("META_APP_ID", "");
    const appSecret = getEnv("META_APP_SECRET", "");
    const tokenUrl = `${META_GRAPH_BASE}/oauth/access_token?client_id=${encodeURIComponent(appId)}&client_secret=${encodeURIComponent(appSecret)}&redirect_uri=${encodeURIComponent(input.context.redirectUri)}&code=${encodeURIComponent(code)}`;
    const response = await fetchWithTimeout(tokenUrl, { timeoutMs: getNumberEnv("SOCIAL_PROVIDER_TIMEOUT_MS", 30_000), retries: 1 });
    const payload = await response.text();
    if (!response.ok) {
      throw new Error(`instagram_token_exchange_failed status=${response.status} body=${payload.slice(0, 200)}`);
    }
    const parsed = JSON.parse(payload) as { access_token?: string; user_id?: string; expires_in?: number };
    if (!parsed.access_token) {
      throw new Error("instagram_token_exchange_missing_access_token");
    }

    // Long-lived user token.
    let userToken = parsed.access_token;
    let expiresAt = parsed.expires_in ? Date.now() + parsed.expires_in * 1000 : null;
    try {
      const exchangeUrl = `${META_GRAPH_BASE}/oauth/access_token?grant_type=fb_exchange_token&client_id=${encodeURIComponent(appId)}&client_secret=${encodeURIComponent(appSecret)}&fb_exchange_token=${encodeURIComponent(userToken)}`;
      const exchangeResponse = await fetchWithTimeout(exchangeUrl, { timeoutMs: 20_000, retries: 1 });
      const exchangePayload = await exchangeResponse.text();
      if (exchangeResponse.ok) {
        const exchanged = JSON.parse(exchangePayload) as { access_token?: string; expires_in?: number };
        if (exchanged.access_token) {
          userToken = exchanged.access_token;
          expiresAt = exchanged.expires_in ? Date.now() + exchanged.expires_in * 1000 : null;
        }
      }
    } catch {
      // Short-lived token remains usable for this session.
    }

    // Find the linked Instagram business account through the user's pages.
    const pages = await this.metaPages(userToken);
    const business = pages.find((page) => page.instagramBusinessAccountId);
    const igUserId = business?.instagramBusinessAccountId ?? null;
    let igUsername: string | null = null;
    if (business && igUserId) {
      igUsername = await this.metaIgUsername(igUserId, business.accessToken);
    }

    const capabilities = {
      canPublish: Boolean(business && igUserId),
      canPostMedia: Boolean(business && igUserId),
      canPostStories: Boolean(business && igUserId),
      canPostCarousel: Boolean(business && igUserId),
      canPostThreads: false,
    };

    return {
      profile: {
        providerProfileId: igUserId ?? parsed.user_id ?? "",
        providerAccountId: parsed.user_id ?? null,
        platform: "instagram",
        username: igUsername,
        displayName: business?.name ?? null,
        avatarUrl: null,
        capabilities,
        metadata: { provider: "direct", pageId: business?.id ?? null },
      },
      credentials: {
        provider: "direct",
        platform: "instagram",
        accessToken: business?.accessToken ?? userToken,
        userToken,
        igUserId,
        pageId: business?.id ?? null,
        expiresAt,
      },
      metadata: {
        provider: "direct",
        oauth: "meta_graph",
        canPublish: capabilities.canPublish,
        connectedAt: new Date().toISOString(),
      },
    };
  }

  private async metaPages(userToken: string): Promise<Array<{ id: string; name: string | null; accessToken: string; instagramBusinessAccountId: string | null }>> {
    const url = `${META_GRAPH_BASE}/me/accounts?fields=id,name,access_token,instagram_business_account&limit=100`;
    const response = await fetchWithTimeout(url, {
      headers: { authorization: `Bearer ${userToken}` },
      timeoutMs: 20_000,
      retries: 1,
    });
    const payload = await response.text();
    if (!response.ok) {
      throw new Error(`instagram_pages_failed status=${response.status} body=${payload.slice(0, 200)}`);
    }
    const parsed = JSON.parse(payload) as { data?: Array<{ id?: string; name?: string; access_token?: string; instagram_business_account?: { id?: string } }> };
    return (parsed.data ?? []).map((page) => ({
      id: page.id ?? "",
      name: page.name ?? null,
      accessToken: page.access_token ?? "",
      instagramBusinessAccountId: page.instagram_business_account?.id ?? null,
    }));
  }

  private async metaIgUsername(igUserId: string, pageToken: string): Promise<string | null> {
    const url = `${META_GRAPH_BASE}/${encodeURIComponent(igUserId)}?fields=id,username&access_token=${encodeURIComponent(pageToken)}`;
    const response = await fetchWithTimeout(url, { timeoutMs: 15_000, retries: 1 });
    const payload = await response.text();
    if (!response.ok) {
      return null;
    }
    const parsed = JSON.parse(payload) as { username?: string };
    return parsed.username ?? null;
  }

  // ── Status

  async getConnectionStatus(
    credentials: Record<string, unknown>,
    account: { providerProfileId: string | null; providerAccountId: string | null; platform: string },
  ): Promise<{ state: "connected" | "expired" | "permissions_required" | "provider_error"; message: string; profile: SocialProfile | null }> {
    const token = String(credentials.accessToken ?? "");
    if (!token) {
      return { state: "expired", message: "The connection token is missing.", profile: null };
    }
    try {
      if (account.platform === "x") {
        const me = await this.xGetMe(token);
        return {
          state: "connected",
          message: `X account verified: @${me.username ?? me.id}`,
          profile: {
            providerProfileId: me.id,
            providerAccountId: me.id,
            platform: "x",
            username: me.username,
            displayName: me.name,
            avatarUrl: me.profile_image_url ?? null,
            capabilities: { canPublish: true, canPostMedia: true, canPostStories: false, canPostCarousel: false, canPostThreads: true },
            metadata: { provider: "direct" },
          },
        };
      }
      const igUserId = account.providerProfileId ?? String(credentials.igUserId ?? "");
      if (!igUserId) {
        return { state: "permissions_required", message: "The Instagram account is connected but no Instagram business account is linked. Link a Facebook Page with an Instagram business account.", profile: null };
      }
      const url = `${META_GRAPH_BASE}/${encodeURIComponent(igUserId)}?fields=id,username&access_token=${encodeURIComponent(token)}`;
      const response = await fetchWithTimeout(url, { timeoutMs: 15_000, retries: 1 });
      const payload = await response.text();
      if (!response.ok) {
        return { state: "expired", message: "Instagram permissions expired. Reconnect to refresh them.", profile: null };
      }
      const parsed = JSON.parse(payload) as { username?: string };
      return {
        state: "connected",
        message: `Instagram account verified: @${parsed.username ?? igUserId}`,
        profile: {
          providerProfileId: igUserId,
          providerAccountId: String(credentials.userId ?? null),
          platform: "instagram",
          username: parsed.username ?? null,
          displayName: null,
          avatarUrl: null,
          capabilities: { canPublish: true, canPostMedia: true, canPostStories: true, canPostCarousel: true, canPostThreads: false },
          metadata: { provider: "direct" },
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("status=401") || message.includes("status=403") || message.includes("190")) {
        return { state: "expired", message: "The connection needs to be re-authorized.", profile: null };
      }
      return { state: "provider_error", message: "The platform could not be reached.", profile: null };
    }
  }

  async refreshConnection(credentials: Record<string, unknown>): Promise<Record<string, unknown> | null> {
    const platform = String(credentials.platform ?? "");
    const refreshToken = String(credentials.refreshToken ?? "");
    if (platform !== "x" || !refreshToken) {
      return null;
    }
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: getEnv("X_CLIENT_ID", ""),
    });
    const response = await fetchWithTimeout(X_TOKEN_URL, {
      method: "POST",
      headers: {
        authorization: basicAuth(getEnv("X_CLIENT_ID", ""), getEnv("X_CLIENT_SECRET", "")),
        "content-type": "application/x-www-form-urlencoded",
      },
      body,
      timeoutMs: getNumberEnv("SOCIAL_PROVIDER_TIMEOUT_MS", 30_000),
      retries: 1,
    });
    const payload = await response.text();
    if (!response.ok) {
      throw new Error(`x_refresh_failed status=${response.status}`);
    }
    const parsed = JSON.parse(payload) as { access_token?: string; refresh_token?: string; expires_in?: number };
    if (!parsed.access_token) {
      throw new Error("x_refresh_missing_access_token");
    }
    return {
      ...credentials,
      accessToken: parsed.access_token,
      refreshToken: parsed.refresh_token ?? refreshToken,
      expiresAt: parsed.expires_in ? Date.now() + parsed.expires_in * 1000 : null,
    };
  }

  async disconnect(credentials: Record<string, unknown>, account: { providerProfileId: string | null; providerAccountId: string | null }): Promise<void> {
    const platform = String(credentials.platform ?? account.providerProfileId ?? "");
    if (platform !== "x") {
      return;
    }
    const clientId = getEnv("X_CLIENT_ID", "");
    const token = String(credentials.accessToken ?? "");
    if (!clientId || !token) {
      return;
    }
    // Revoke the token best-effort; failure is not fatal for disconnecting.
    await fetchWithTimeout("https://api.x.com/2/oauth2/revoke", {
      method: "POST",
      headers: {
        authorization: basicAuth(clientId, getEnv("X_CLIENT_SECRET", "")),
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ token, token_type_hint: "access_token" }),
      timeoutMs: 15_000,
      retries: 0,
    }).catch(() => undefined);
  }

  // ── Publishing

  validateContent(payload: SocialPublishInput, platform: SocialPlatform): { valid: boolean; errors: string[] } {
    const errors = platform === "x" ? validateXPayload(payload) : validateInstagramPayload(payload);
    return { valid: errors.length === 0, errors };
  }

  async publish(payload: SocialPublishInput, credentials: Record<string, unknown>, account: { providerProfileId: string | null; providerAccountId: string | null; platform: string }): Promise<SocialPublishResult> {
    if (account.platform === "x") {
      return this.publishX(payload, credentials);
    }
    return this.publishInstagram(payload, credentials, account);
  }

  private async publishX(payload: SocialPublishInput, credentials: Record<string, unknown>): Promise<SocialPublishResult> {
    const token = String(credentials.accessToken ?? "");
    if (!token) {
      throw new Error("x_oauth_missing_access_token");
    }
    let mediaId: string | null = null;
    if (payload.mediaUrls.length > 0 && (payload.mediaType === "photo" || payload.mediaType === "carousel")) {
      mediaId = await this.xUploadMedia(payload.mediaUrls[0], token);
    }
    const posts = payload.thread && payload.thread.length > 0 ? payload.thread.map((entry) => entry.body) : [payload.text];
    let lastId: string | null = null;
    for (const body of posts) {
      if (!body.trim()) {
        continue;
      }
      const tweetPayload: Record<string, unknown> = { text: body };
      if (mediaId) {
        tweetPayload.media = { media_ids: [mediaId] };
      }
      const response = await fetchWithTimeout(`${X_API_BASE}/tweets`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: tweetPayload,
        timeoutMs: getNumberEnv("PUBLISH_TIMEOUT_MS", 30_000),
        retries: 1,
      });
      const responseBody = await response.text();
      if (!response.ok) {
        throw new Error(`x_publish_failed status=${response.status} body=${responseBody.slice(0, 300)}`);
      }
      const parsed = JSON.parse(responseBody) as { data?: { id?: string } };
      if (parsed.data?.id) {
        lastId = parsed.data.id;
      }
    }
    if (!lastId) {
      throw new Error("x_publish_missing_id");
    }
    return { externalId: lastId, externalUrl: `https://x.com/i/status/${lastId}`, responsePayload: { provider: "direct", tweetId: lastId }, dryRun: false };
  }

  private async xUploadMedia(imageUrl: string, token: string): Promise<string> {
    const imageResponse = await fetchWithTimeout(imageUrl, {
      timeoutMs: getNumberEnv("IMAGE_DOWNLOAD_TIMEOUT_MS", 60_000),
      retries: 1,
    });
    if (!imageResponse.ok) {
      throw new Error(`x_media_download_failed status=${imageResponse.status}`);
    }
    const buffer = Buffer.from(await imageResponse.arrayBuffer());

    const initForm = new FormData();
    initForm.append("command", "INIT");
    initForm.append("total_bytes", String(buffer.length));
    initForm.append("media_type", "image/png");
    initForm.append("media_category", "tweet_image");
    const initResponse = await fetchWithTimeout(X_MEDIA_UPLOAD_URL, {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      body: initForm,
      timeoutMs: getNumberEnv("PUBLISH_TIMEOUT_MS", 30_000),
      retries: 1,
    });
    const initBody = await initResponse.text();
    if (!initResponse.ok) {
      throw new Error(`x_media_init_failed status=${initResponse.status} body=${initBody.slice(0, 200)}`);
    }
    const init = JSON.parse(initBody) as { data?: { media_id_string?: string }; media_id_string?: string };
    const mediaId = init.data?.media_id_string ?? init.media_id_string;
    if (!mediaId) {
      throw new Error("x_media_init_missing_media_id");
    }

    const appendForm = new FormData();
    appendForm.append("command", "APPEND");
    appendForm.append("media_id", mediaId);
    appendForm.append("segment_index", "0");
    appendForm.append("media", new Blob([buffer]));
    const appendResponse = await fetchWithTimeout(X_MEDIA_UPLOAD_URL, {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      body: appendForm,
      timeoutMs: getNumberEnv("PUBLISH_TIMEOUT_MS", 60_000),
      retries: 1,
    });
    if (!appendResponse.ok) {
      throw new Error(`x_media_append_failed status=${appendResponse.status}`);
    }

    const finalizeForm = new FormData();
    finalizeForm.append("command", "FINALIZE");
    finalizeForm.append("media_id", mediaId);
    const finalizeResponse = await fetchWithTimeout(X_MEDIA_UPLOAD_URL, {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      body: finalizeForm,
      timeoutMs: getNumberEnv("PUBLISH_TIMEOUT_MS", 30_000),
      retries: 1,
    });
    if (!finalizeResponse.ok) {
      throw new Error(`x_media_finalize_failed status=${finalizeResponse.status}`);
    }
    return mediaId;
  }

  private async publishInstagram(payload: SocialPublishInput, credentials: Record<string, unknown>, account: { providerProfileId: string | null; providerAccountId: string | null }): Promise<SocialPublishResult> {
    const accessToken = String(credentials.accessToken ?? "");
    const igUserId = account.providerProfileId ?? String(credentials.igUserId ?? "");
    if (!accessToken || !igUserId) {
      throw new Error("instagram_oauth_missing_token_or_ig_user");
    }
    const mediaType = payload.mediaType === "story" ? "STORIES" : payload.mediaType === "carousel" ? "CAROUSEL" : "IMAGE";
    let creationId: string;
    if (mediaType === "CAROUSEL") {
      if (payload.mediaUrls.length < 2) {
        throw new Error("instagram_carousel_requires_multiple_images");
      }
      const response = await fetchWithTimeout(
        `${META_GRAPH_BASE}/${encodeURIComponent(igUserId)}/media?access_token=${encodeURIComponent(accessToken)}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: { media_type: "CAROUSEL", children: payload.mediaUrls, caption: payload.text },
          timeoutMs: getNumberEnv("PUBLISH_TIMEOUT_MS", 30_000),
          retries: 1,
        },
      );
      const body = await response.text();
      if (!response.ok) {
        throw new Error(`instagram_create_failed status=${response.status} body=${body.slice(0, 300)}`);
      }
      creationId = String((JSON.parse(body) as { id: string }).id);
    } else {
      if (mediaType !== "STORIES" && payload.mediaUrls.length === 0) {
        throw new Error("instagram_requires_image");
      }
      const response = await fetchWithTimeout(
        `${META_GRAPH_BASE}/${encodeURIComponent(igUserId)}/media?access_token=${encodeURIComponent(accessToken)}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: { media_type: mediaType, image_url: payload.mediaUrls[0], caption: mediaType === "STORIES" ? undefined : payload.text },
          timeoutMs: getNumberEnv("PUBLISH_TIMEOUT_MS", 30_000),
          retries: 1,
        },
      );
      const body = await response.text();
      if (!response.ok) {
        throw new Error(`instagram_create_failed status=${response.status} body=${body.slice(0, 300)}`);
      }
      creationId = String((JSON.parse(body) as { id: string }).id);
    }

    const publishResponse = await fetchWithTimeout(
      `${META_GRAPH_BASE}/${encodeURIComponent(igUserId)}/media_publish?access_token=${encodeURIComponent(accessToken)}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: { creation_id: creationId },
        timeoutMs: getNumberEnv("PUBLISH_TIMEOUT_MS", 30_000),
        retries: 1,
      },
    );
    const publishBody = await publishResponse.text();
    if (!publishResponse.ok) {
      throw new Error(`instagram_publish_failed status=${publishResponse.status} body=${publishBody.slice(0, 300)}`);
    }
    const mediaId = String((JSON.parse(publishBody) as { id: string }).id);
    return {
      externalId: mediaId,
      externalUrl: `https://www.instagram.com/p/${mediaId}`,
      responsePayload: { provider: "direct", mediaId, creationId },
      dryRun: false,
    };
  }

  async deletePublication(externalId: string, credentials: Record<string, unknown>, account: { providerProfileId: string | null; providerAccountId: string | null; platform: string }): Promise<SocialPublishResult> {
    if (account.platform === "x") {
      const token = String(credentials.accessToken ?? "");
      const response = await fetchWithTimeout(`${X_API_BASE}/tweets/${encodeURIComponent(externalId)}`, {
        method: "DELETE",
        headers: { authorization: `Bearer ${token}` },
        timeoutMs: getNumberEnv("PUBLISH_TIMEOUT_MS", 30_000),
        retries: 1,
      });
      if (!response.ok) {
        const body = await response.text();
        throw new Error(`x_delete_failed status=${response.status} body=${body.slice(0, 300)}`);
      }
      return { externalId: null, externalUrl: null, responsePayload: { provider: "direct", deleted: true }, dryRun: false };
    }
    const accessToken = String(credentials.accessToken ?? "");
    const response = await fetchWithTimeout(
      `${META_GRAPH_BASE}/${encodeURIComponent(externalId)}?access_token=${encodeURIComponent(accessToken)}`,
      { method: "DELETE", timeoutMs: getNumberEnv("PUBLISH_TIMEOUT_MS", 30_000), retries: 1 },
    );
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`instagram_delete_failed status=${response.status} body=${body.slice(0, 300)}`);
    }
    return { externalId: null, externalUrl: null, responsePayload: { provider: "direct", deleted: true }, dryRun: false };
  }
}
