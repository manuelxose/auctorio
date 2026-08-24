import crypto from "node:crypto";
import { fetchWithTimeout } from "../shared/utils/http";
import { getBooleanEnv, getEnv, getNumberEnv, isProductionEnv } from "../shared/utils/env";

// ────────────────────────────────────────────────────────────── Capabilities

export interface PublisherCapabilities {
  publish: boolean;
  update: boolean;
  delete: boolean;
  unpublish: boolean;
  media: boolean;
  carousel: boolean;
  thread: boolean;
  schedulingNative: boolean;
}

export const WEBSITE_PUBLISHER_CAPABILITIES: PublisherCapabilities = {
  publish: true,
  update: true,
  delete: true,
  unpublish: true,
  media: true,
  carousel: false,
  thread: false,
  schedulingNative: false,
};

export type SocialPublishPayload = {
  text: string;
  imageUrls: string[];
  mediaType: "text" | "photo" | "carousel" | "story";
  thread?: Array<{ body: string }>;
};

export type SocialPublishResult = {
  externalId: string | null;
  externalUrl: string | null;
  responsePayload: Record<string, unknown> | null;
  dryRun: boolean;
};

export type SocialPublisherAdapter = {
  platform: "x" | "instagram";
  capabilities: PublisherCapabilities;
  validateCredentials(credentials: Record<string, unknown>): Promise<{ ok: boolean; message: string }>;
  publish(payload: SocialPublishPayload, credentials: Record<string, unknown>): Promise<SocialPublishResult>;
  update(externalId: string, payload: SocialPublishPayload, credentials: Record<string, unknown>): Promise<SocialPublishResult>;
  delete(externalId: string, credentials: Record<string, unknown>): Promise<SocialPublishResult>;
};

// ────────────────────────────────────────────────────────────── Credentials

export function readSocialCredentials(credentialsRef: string | null | undefined): Record<string, unknown> | null {
  if (!credentialsRef) {
    return null;
  }
  const raw = getEnv(credentialsRef, "").trim();
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function isDryRunEnabled(hasCredentials: boolean): { enabled: boolean; reason: string | null } {
  const defaultDryRun =
    getEnv("APP_ENV", "local") !== "production" || getEnv("NODE_ENV", "development") !== "production";
  if (getBooleanEnv("PUBLISH_DRY_RUN", defaultDryRun)) {
    return { enabled: true, reason: "env_publish_dry_run" };
  }
  if (!hasCredentials) {
    if (isProductionEnv()) {
      throw new Error("publishing_missing_credentials");
    }
    return { enabled: true, reason: "missing_publishing_credentials" };
  }
  return { enabled: false, reason: null };
}

export function dryRunGate(hasCredentials: boolean): { enabled: boolean; reason: string | null } {
  return isDryRunEnabled(hasCredentials);
}

function dryRunResult(platform: string, seed: string): SocialPublishResult {
  const digest = crypto.createHash("sha1").update(seed).digest("hex").slice(0, 16);
  return {
    externalId: `dryrun-${platform}-${digest}`,
    externalUrl: null,
    responsePayload: {
      mode: "dry_run",
      platform,
      generatedAt: new Date().toISOString(),
    },
    dryRun: true,
  };
}

export function buildDryRunResult(platform: string, seed: string): SocialPublishResult {
  return dryRunResult(platform, seed);
}

// ────────────────────────────────────────────────────────────── X (Twitter) — OAuth 1.0a user context + API v2

type XCredentials = {
  apiKey: string;
  apiSecret: string;
  accessToken: string;
  accessTokenSecret: string;
};

function readXCredentials(credentials: Record<string, unknown>): XCredentials | null {
  const apiKey = String(credentials.apiKey ?? credentials.consumerKey ?? "").trim();
  const apiSecret = String(credentials.apiSecret ?? credentials.consumerSecret ?? "").trim();
  const accessToken = String(credentials.accessToken ?? "").trim();
  const accessTokenSecret = String(credentials.accessTokenSecret ?? "").trim();
  if (!apiKey || !apiSecret || !accessToken || !accessTokenSecret) {
    return null;
  }
  return { apiKey, apiSecret, accessToken, accessTokenSecret };
}

function percentEncode(value: string): string {
  return encodeURIComponent(value)
    .replace(/[!'()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
}

function buildOAuthHeader(
  method: string,
  url: string,
  credentials: XCredentials,
  extraParams: Record<string, string> = {},
): string {
  const oauthParams: Record<string, string> = {
    oauth_consumer_key: credentials.apiKey,
    oauth_nonce: crypto.randomBytes(16).toString("base64url"),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: String(Math.floor(Date.now() / 1000)),
    oauth_token: credentials.accessToken,
    oauth_version: "1.0",
    ...extraParams,
  };

  const allParams = Object.entries(oauthParams).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const parameterString = allParams
    .map(([key, value]) => `${percentEncode(key)}=${percentEncode(value)}`)
    .join("&");
  const signatureBase = [
    method.toUpperCase(),
    percentEncode(url),
    percentEncode(parameterString),
  ].join("&");
  const signingKey = `${percentEncode(credentials.apiSecret)}&${percentEncode(credentials.accessTokenSecret)}`;
  const signature = crypto.createHmac("sha1", signingKey).update(signatureBase).digest("base64");

  const headerParams = { ...oauthParams, oauth_signature: signature };
  return `OAuth ${Object.entries(headerParams)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `${percentEncode(key)}="${percentEncode(value)}"`)
    .join(", ")}`;
}

async function xCreateTweet(text: string, credentials: XCredentials): Promise<{ id: string }> {
  const url = "https://api.twitter.com/2/tweets";
  const response = await fetchWithTimeout(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: buildOAuthHeader("POST", url, credentials),
    },
    body: { text },
    timeoutMs: getNumberEnv("PUBLISH_TIMEOUT_MS", 30_000),
    retries: 1,
  });
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`x_publish_failed status=${response.status} body=${body.slice(0, 300)}`);
  }
  const parsed = JSON.parse(body) as { data?: { id?: string } };
  if (!parsed.data?.id) {
    throw new Error("x_publish_missing_id");
  }
  return { id: parsed.data.id };
}

async function xDeleteTweet(externalId: string, credentials: XCredentials): Promise<void> {
  const url = `https://api.twitter.com/2/tweets/${externalId}`;
  const response = await fetchWithTimeout(url, {
    method: "DELETE",
    headers: {
      authorization: buildOAuthHeader("DELETE", url, credentials),
    },
    timeoutMs: getNumberEnv("PUBLISH_TIMEOUT_MS", 30_000),
    retries: 1,
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`x_delete_failed status=${response.status} body=${body.slice(0, 300)}`);
  }
}

async function xUploadMedia(imageUrl: string, credentials: XCredentials): Promise<string> {
  const imageResponse = await fetchWithTimeout(imageUrl, {
    timeoutMs: getNumberEnv("IMAGE_DOWNLOAD_TIMEOUT_MS", 60_000),
    retries: 1,
  });
  if (!imageResponse.ok) {
    throw new Error(`x_media_download_failed status=${imageResponse.status}`);
  }
  const buffer = Buffer.from(await imageResponse.arrayBuffer());
  const baseUrl = "https://upload.twitter.com/1.1/media/upload.json";

  const initForm = new FormData();
  initForm.append("command", "INIT");
  initForm.append("total_bytes", String(buffer.length));
  initForm.append("media_type", "image/png");
  initForm.append("media_category", "tweet_image");
  const initResponse = await fetchWithTimeout(baseUrl, {
    method: "POST",
    headers: { authorization: buildOAuthHeader("POST", baseUrl, credentials) },
    body: initForm,
    timeoutMs: getNumberEnv("PUBLISH_TIMEOUT_MS", 30_000),
    retries: 1,
  });
  const initBody = await initResponse.text();
  if (!initResponse.ok) {
    throw new Error(`x_media_init_failed status=${initResponse.status} body=${initBody.slice(0, 200)}`);
  }
  const init = JSON.parse(initBody) as { media_id_string?: string };
  if (!init.media_id_string) {
    throw new Error("x_media_init_missing_media_id");
  }

  const appendForm = new FormData();
  appendForm.append("command", "APPEND");
  appendForm.append("media_id", init.media_id_string);
  appendForm.append("segment_index", "0");
  appendForm.append("media", new Blob([buffer]));
  const appendResponse = await fetchWithTimeout(baseUrl, {
    method: "POST",
    headers: { authorization: buildOAuthHeader("POST", baseUrl, credentials) },
    body: appendForm,
    timeoutMs: getNumberEnv("PUBLISH_TIMEOUT_MS", 60_000),
    retries: 1,
  });
  if (!appendResponse.ok) {
    throw new Error(`x_media_append_failed status=${appendResponse.status}`);
  }

  const finalizeForm = new FormData();
  finalizeForm.append("command", "FINALIZE");
  finalizeForm.append("media_id", init.media_id_string);
  const finalizeResponse = await fetchWithTimeout(baseUrl, {
    method: "POST",
    headers: { authorization: buildOAuthHeader("POST", baseUrl, credentials) },
    body: finalizeForm,
    timeoutMs: getNumberEnv("PUBLISH_TIMEOUT_MS", 30_000),
    retries: 1,
  });
  if (!finalizeResponse.ok) {
    throw new Error(`x_media_finalize_failed status=${finalizeResponse.status}`);
  }

  return init.media_id_string;
}

class XPublisherAdapterImpl implements SocialPublisherAdapter {
  platform = "x" as const;
  capabilities: PublisherCapabilities = {
    publish: true,
    update: false,
    delete: true,
    unpublish: false,
    media: true,
    carousel: false,
    thread: true,
    schedulingNative: false,
  };

  async validateCredentials(credentials: Record<string, unknown>) {
    const resolved = readXCredentials(credentials);
    if (!resolved) {
      return { ok: false, message: "x_credentials_incomplete (apiKey, apiSecret, accessToken, accessTokenSecret)" };
    }
    const dryRun = isDryRunEnabled(true);
    if (dryRun.enabled) {
      return { ok: true, message: "x_credentials_valid (dry run)" };
    }
    const url = "https://api.twitter.com/2/users/me";
    try {
      const response = await fetchWithTimeout(url, {
        headers: { authorization: buildOAuthHeader("GET", url, resolved) },
        timeoutMs: 15_000,
        retries: 0,
      });
      if (!response.ok) {
        const body = await response.text();
        return { ok: false, message: `x_verification_failed status=${response.status} body=${body.slice(0, 200)}` };
      }
      const parsed = (await response.json()) as { data?: { id?: string; username?: string } };
      return { ok: true, message: `x_account_verified: @${parsed.data?.username ?? "unknown"}` };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : String(error) };
    }
  }

  async publish(payload: SocialPublishPayload, credentials: Record<string, unknown>): Promise<SocialPublishResult> {
    const resolved = readXCredentials(credentials);
    const dryRun = isDryRunEnabled(Boolean(resolved));
    if (dryRun.enabled || !resolved) {
      return dryRunResult("x", `${payload.text}|${payload.imageUrls.join(",")}`);
    }

    let mediaId: string | null = null;
    if (payload.mediaType === "photo" && payload.imageUrls.length > 0) {
      mediaId = await xUploadMedia(payload.imageUrls[0], resolved);
    }

    const posts = payload.thread && payload.thread.length > 0
      ? payload.thread.map((entry) => entry.body)
      : [payload.text];

    let lastId: string | null = null;
    for (const body of posts) {
      if (!body.trim()) {
        continue;
      }
      const tweetUrl = "https://api.twitter.com/2/tweets";
      const tweetPayload: Record<string, unknown> = { text: body };
      if (mediaId) {
        tweetPayload.media = { media_ids: [mediaId] };
      }
      const response = await fetchWithTimeout(tweetUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: buildOAuthHeader("POST", tweetUrl, resolved),
        },
        body: tweetPayload,
        timeoutMs: getNumberEnv("PUBLISH_TIMEOUT_MS", 30_000),
        retries: 1,
      });
      const responseBody = await response.text();
      if (!response.ok) {
        throw new Error(`x_publish_failed status=${response.status} body=${responseBody.slice(0, 300)}`);
      }
      const parsed = JSON.parse(responseBody) as { data?: { id?: string; text?: string } };
      if (parsed.data?.id) {
        lastId = parsed.data.id;
      }
    }

    if (!lastId) {
      throw new Error("x_publish_missing_id");
    }

    return {
      externalId: lastId,
      externalUrl: `https://x.com/i/status/${lastId}`,
      responsePayload: { tweetId: lastId },
      dryRun: false,
    };
  }

  async update(_externalId: string, _payload: SocialPublishPayload, _credentials: Record<string, unknown>): Promise<SocialPublishResult> {
    throw new Error("x_update_not_supported");
  }

  async delete(externalId: string, credentials: Record<string, unknown>): Promise<SocialPublishResult> {
    const resolved = readXCredentials(credentials);
    const dryRun = isDryRunEnabled(Boolean(resolved));
    if (dryRun.enabled || !resolved) {
      return dryRunResult("x", `delete:${externalId}`);
    }
    await xDeleteTweet(externalId, resolved);
    return { externalId: null, externalUrl: null, responsePayload: { deleted: true }, dryRun: false };
  }
}

// ────────────────────────────────────────────────────────────── Instagram — Graph API

type InstagramCredentials = {
  accessToken: string;
  igUserId: string;
};

function readInstagramCredentials(credentials: Record<string, unknown>): InstagramCredentials | null {
  const accessToken = String(credentials.accessToken ?? "").trim();
  const igUserId = String(credentials.igUserId ?? credentials.userId ?? "").trim();
  if (!accessToken || !igUserId) {
    return null;
  }
  return { accessToken, igUserId };
}

const INSTAGRAM_GRAPH_BASE = "https://graph.facebook.com/v21.0";

function igUrl(path: string, accessToken: string): string {
  const separator = path.includes("?") ? "&" : "?";
  return `${INSTAGRAM_GRAPH_BASE}${path}${separator}access_token=${encodeURIComponent(accessToken)}`;
}

class InstagramPublisherAdapterImpl implements SocialPublisherAdapter {
  platform = "instagram" as const;
  capabilities: PublisherCapabilities = {
    publish: true,
    update: true,
    delete: true,
    unpublish: false,
    media: true,
    carousel: true,
    thread: false,
    schedulingNative: false,
  };

  async validateCredentials(credentials: Record<string, unknown>) {
    const resolved = readInstagramCredentials(credentials);
    if (!resolved) {
      return { ok: false, message: "instagram_credentials_incomplete (accessToken, igUserId)" };
    }
    const dryRun = isDryRunEnabled(true);
    if (dryRun.enabled) {
      return { ok: true, message: "instagram_credentials_valid (dry run)" };
    }
    try {
      const response = await fetchWithTimeout(
        igUrl(`/${resolved.igUserId}`, resolved.accessToken) + "&fields=id,username",
        { timeoutMs: 15_000, retries: 0 },
      );
      if (!response.ok) {
        const body = await response.text();
        return { ok: false, message: `instagram_verification_failed status=${response.status} body=${body.slice(0, 200)}` };
      }
      const parsed = (await response.json()) as { username?: string };
      return { ok: true, message: `instagram_account_verified: @${parsed.username ?? "unknown"}` };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : String(error) };
    }
  }

  async publish(payload: SocialPublishPayload, credentials: Record<string, unknown>): Promise<SocialPublishResult> {
    const resolved = readInstagramCredentials(credentials);
    const dryRun = isDryRunEnabled(Boolean(resolved));
    if (dryRun.enabled || !resolved) {
      return dryRunResult("instagram", `${payload.mediaType}|${payload.text}|${payload.imageUrls.join(",")}`);
    }

    const mediaType = payload.mediaType === "story" ? "STORIES" : payload.mediaType === "carousel" ? "CAROUSEL" : "IMAGE";

    let creationId: string;
    if (mediaType === "CAROUSEL") {
      if (payload.imageUrls.length < 2) {
        throw new Error("instagram_carousel_requires_multiple_images");
      }
      const createResponse = await fetchWithTimeout(
        igUrl(`/${resolved.igUserId}/media`, resolved.accessToken),
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: {
            media_type: "CAROUSEL",
            children: payload.imageUrls,
            caption: payload.text,
          },
          timeoutMs: getNumberEnv("PUBLISH_TIMEOUT_MS", 30_000),
          retries: 1,
        },
      );
      const createBody = await createResponse.text();
      if (!createResponse.ok) {
        throw new Error(`instagram_create_failed status=${createResponse.status} body=${createBody.slice(0, 300)}`);
      }
      creationId = String((JSON.parse(createBody) as { id: string }).id);
    } else {
      if (mediaType !== "STORIES" && payload.imageUrls.length === 0) {
        throw new Error("instagram_requires_image");
      }
      const createResponse = await fetchWithTimeout(
        igUrl(`/${resolved.igUserId}/media`, resolved.accessToken),
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: {
            media_type: mediaType,
            image_url: payload.imageUrls[0],
            caption: mediaType === "STORIES" ? undefined : payload.text,
          },
          timeoutMs: getNumberEnv("PUBLISH_TIMEOUT_MS", 30_000),
          retries: 1,
        },
      );
      const createBody = await createResponse.text();
      if (!createResponse.ok) {
        throw new Error(`instagram_create_failed status=${createResponse.status} body=${createBody.slice(0, 300)}`);
      }
      creationId = String((JSON.parse(createBody) as { id: string }).id);
    }

    const publishResponse = await fetchWithTimeout(
      igUrl(`/${resolved.igUserId}/media_publish`, resolved.accessToken),
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
      responsePayload: { mediaId, creationId },
      dryRun: false,
    };
  }

  async update(externalId: string, payload: SocialPublishPayload, credentials: Record<string, unknown>): Promise<SocialPublishResult> {
    const resolved = readInstagramCredentials(credentials);
    const dryRun = isDryRunEnabled(Boolean(resolved));
    if (dryRun.enabled || !resolved) {
      return dryRunResult("instagram", `update:${externalId}`);
    }
    const response = await fetchWithTimeout(
      igUrl(`/${externalId}`, resolved.accessToken),
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: { caption: payload.text },
        timeoutMs: getNumberEnv("PUBLISH_TIMEOUT_MS", 30_000),
        retries: 1,
      },
    );
    const body = await response.text();
    if (!response.ok) {
      throw new Error(`instagram_update_failed status=${response.status} body=${body.slice(0, 300)}`);
    }
    return { externalId, externalUrl: `https://www.instagram.com/p/${externalId}`, responsePayload: { updated: true }, dryRun: false };
  }

  async delete(externalId: string, credentials: Record<string, unknown>): Promise<SocialPublishResult> {
    const resolved = readInstagramCredentials(credentials);
    const dryRun = isDryRunEnabled(Boolean(resolved));
    if (dryRun.enabled || !resolved) {
      return dryRunResult("instagram", `delete:${externalId}`);
    }
    const response = await fetchWithTimeout(
      igUrl(`/${externalId}`, resolved.accessToken),
      { method: "DELETE", timeoutMs: getNumberEnv("PUBLISH_TIMEOUT_MS", 30_000), retries: 1 },
    );
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`instagram_delete_failed status=${response.status} body=${body.slice(0, 300)}`);
    }
    return { externalId: null, externalUrl: null, responsePayload: { deleted: true }, dryRun: false };
  }
}

export function getSocialPublisher(platform: "x" | "instagram"): SocialPublisherAdapter {
  switch (platform) {
    case "x":
      return new XPublisherAdapterImpl();
    case "instagram":
      return new InstagramPublisherAdapterImpl();
    default:
      throw new Error(`unsupported_social_platform ${platform}`);
  }
}
