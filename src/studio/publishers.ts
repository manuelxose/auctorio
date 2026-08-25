import crypto from "node:crypto";
import path from "node:path";
import type { ContentImage, ContentProject, ContentVersion, Site } from "@prisma/client";
import { fetchJson, fetchWithTimeout } from "../shared/utils/http";
import { getBooleanEnv, getEnv, getNumberEnv } from "../shared/utils/env";
import type {
  PublicationTargetStatus,
  PublishResult,
  PublisherAdapter,
  PublisherContext,
} from "./types";
import { buildAssetPublicUrl } from "./orchestration";
import { isProductionEnv } from "../shared/utils/env";
import { sanitizeEditorialHtml } from "./html-sanitizer";
import { loadActiveInstallationForSite } from "./connectors/installation";

type TecnoriaCredentials = {
  token?: string;
  email?: string;
  password?: string;
};

type DryRunDecision = {
  enabled: boolean;
  reason: string | null;
};

/**
 * Pure GuiaTV payload builder (exported for fidelity tests). Maps the approved
 * SEO brief fields from project metadata into the destination contract.
 */
export function buildGuiaTvPayload(
  context: PublisherContext,
  assetUrl: string | null,
  status: "draft" | "publish",
): Record<string, unknown> {
  const metadata = getMetadata(context.project);
  const categories = getStringArray(metadata.categories);
  const keywords = getStringArray(metadata.keywords);

  return {
    title: context.version.title || context.project.title,
    slug: String(metadata.slug || "").trim() || undefined,
    status,
    excerpt: sanitizeEditorialHtml(context.version.excerpt || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
    content: sanitizeEditorialHtml(context.version.bodyHtml || ""),
    categories,
    contentType: normalizeGuiaTvContentType(String(metadata.contentType || "guide")),
    featured: Boolean(metadata.featured),
    primaryIntent: metadata.primaryIntent ? String(metadata.primaryIntent) : undefined,
    targetQuery: metadata.targetQuery ? String(metadata.targetQuery) : undefined,
    relatedPlatformKeys: filterGuiaTvRelatedPlatformKeys(getStringArray(metadata.relatedPlatformKeys)),
    relatedRouteKeys: filterGuiaTvRelatedRouteKeys(getStringArray(metadata.relatedRouteKeys)),
    faqItems: getFaqItems(context.project),
    evergreen: metadata.evergreen !== false,
    featuredImage: assetUrl ?? undefined,
    coverImage: assetUrl ?? undefined,
    metaTitle: context.version.seoTitle || undefined,
    metaDescription: context.version.seoDescription || undefined,
    keywords,
    ogImage: assetUrl ?? undefined,
    canonicalUrl: metadata.canonicalUrl ? String(metadata.canonicalUrl) : undefined,
    publishedAt: new Date().toISOString(),
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

const GUIATV_CONTENT_TYPES = new Set([
  "guide",
  "ranking",
  "trend",
  "news",
  "analysis",
  "preview",
  "match-report",
]);

const GUIATV_CONTENT_TYPE_ALIASES: Record<string, string> = {
  faq: "guide",
  article: "guide",
  blog: "news",
  comparison: "guide",
};

const GUIATV_RELATED_ROUTE_KEYS = new Set(["platforms", "guide", "explore", "stats", "comparison"]);

const GUIATV_RELATED_PLATFORM_KEYS = new Set([
  "netflix",
  "prime-video",
  "disney-plus",
  "max",
  "movistar-plus",
  "skyshowtime",
  "apple-tv-plus",
  "filmin",
  "rtve-play",
  "atresplayer",
  "mitele",
  "pluto-tv",
  "rakuten-tv",
]);

function normalizeGuiaTvContentType(value: string): string {
  const normalized = String(value || "").trim().toLowerCase();
  if (GUIATV_CONTENT_TYPES.has(normalized)) {
    return normalized;
  }
  return GUIATV_CONTENT_TYPE_ALIASES[normalized] ?? "guide";
}

function filterGuiaTvRelatedPlatformKeys(keys: string[]): string[] {
  return keys.filter((key) => GUIATV_RELATED_PLATFORM_KEYS.has(key));
}

function filterGuiaTvRelatedRouteKeys(keys: string[]): string[] {
  return keys.filter((key) => GUIATV_RELATED_ROUTE_KEYS.has(key));
}

function readCredentialRef(ref: string | null | undefined): string {
  if (!ref) {
    return "";
  }
  return getEnv(ref, "").trim();
}

function readJsonCredentials<T extends Record<string, unknown>>(ref: string | null | undefined): T | null {
  const raw = readCredentialRef(ref);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function getMetadata(project: ContentProject): Record<string, unknown> {
  return asRecord(project.metadata);
}

function getStringArray(value: unknown): string[] {
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

function getFaqItems(project: ContentProject): Array<{ question: string; answer: string }> {
  const value = getMetadata(project).faqItems;
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => asRecord(item))
    .filter((item) => item.question && item.answer)
    .map((item) => ({
      question: String(item.question),
      answer: String(item.answer),
    }));
}

function imageFileName(assetUrl: string): string {
  const parsed = new URL(assetUrl);
  return path.basename(parsed.pathname) || "generated-image.png";
}

async function resolveAssetUrl(context: PublisherContext): Promise<string | null> {
  if (context.assetUrl) {
    return context.assetUrl;
  }
  return buildAssetPublicUrl(
    (context.version as ContentVersion & { contentImage?: ContentImage | null }).contentImage?.storagePath,
  );
}

function isPublishDryRunEnabled(): boolean {
  const defaultValue =
    getEnv("APP_ENV", "local") !== "production" || getEnv("NODE_ENV", "development") !== "production";
  return getBooleanEnv("PUBLISH_DRY_RUN", defaultValue);
}

function buildDryRunExternalId(context: PublisherContext, action: string): string {
  const seed = [
    context.site.type,
    context.site.key,
    context.project.id,
    context.version.id,
    action,
  ].join(":");
  const digest = crypto.createHash("sha1").update(seed).digest("hex").slice(0, 16);
  return `dryrun-${digest}`;
}

async function buildDryRunResult(
  context: PublisherContext,
  action: string,
  reason: string,
  externalId?: string | null,
): Promise<PublishResult> {
  const resolvedExternalId = externalId || buildDryRunExternalId(context, action);
  const assetUrl = await resolveAssetUrl(context);
  const baseUrl = String(context.site.baseUrl || "").replace(/\/$/, "");
  const effectiveTargetStatus =
    action === "publishDraft" || action === "updateDraft"
      ? "draft"
      : action === "publish"
        ? "publish"
        : null;

  return {
    externalId: resolvedExternalId,
    externalUrl: baseUrl ? `${baseUrl}/dry-run/${resolvedExternalId}` : null,
    effectiveTargetStatus,
    responsePayload: {
      mode: "dry_run",
      reason,
      action,
      effectiveTargetStatus,
      siteType: context.site.type,
      siteKey: context.site.key,
      projectId: context.project.id,
      versionId: context.version.id,
      generatedAt: new Date().toISOString(),
      assetUrl,
    },
  };
}

function getDryRunDecision(hasResolvedCredentials: boolean): DryRunDecision {
  if (isPublishDryRunEnabled()) {
    return {
      enabled: true,
      reason: "env_publish_dry_run",
    };
  }

  if (!hasResolvedCredentials) {
    if (isProductionEnv()) {
      throw new Error("publishing_missing_credentials");
    }

    return {
      enabled: true,
      reason: "missing_publishing_credentials",
    };
  }

  return {
    enabled: false,
    reason: null,
  };
}

class GuiaTvPublisher implements PublisherAdapter {
  private getAdminKey(site: Site): string {
    return readCredentialRef(site.publishingCredentialsRef);
  }
  private getHeaders(site: Site): Record<string, string> {
    const adminKey = this.getAdminKey(site);
    if (!adminKey) {
      throw new Error("guiatv_missing_admin_key");
    }
    return {
      "content-type": "application/json",
      "x-admin-key": adminKey,
    };
  }

  private async maybeDryRun(
    context: PublisherContext,
    action: "publishDraft" | "updateDraft" | "publish" | "unpublish",
    externalId?: string | null,
  ): Promise<PublishResult | null> {
    const decision = getDryRunDecision(Boolean(this.getAdminKey(context.site)));
    if (!decision.enabled || !decision.reason) {
      return null;
    }
    return buildDryRunResult(context, action, decision.reason, externalId);
  }

  private buildPayload(context: PublisherContext, assetUrl: string | null, status: "draft" | "publish") {
    return buildGuiaTvPayload(context, assetUrl, status);
  }

  async publishDraft(context: PublisherContext): Promise<PublishResult> {
    const dryRun = await this.maybeDryRun(context, "publishDraft");
    if (dryRun) {
      return dryRun;
    }

    const assetUrl = await resolveAssetUrl(context);
    const payload = this.buildPayload(context, assetUrl, "draft");
    const siteBaseUrl = String(context.site.baseUrl || "").replace(/\/$/, "");
    const response = await this.postJson(
      `${siteBaseUrl}/v2/blog`,
      context,
      payload,
    );

    return {
      externalId: String(response.data?.post?.id || ""),
      externalUrl: response.data?.post?.link || null,
      effectiveTargetStatus: "draft",
      responsePayload: response as Record<string, unknown>,
    };
  }

  private async postJson(url: string, context: PublisherContext, payload: Record<string, unknown>) {
    try {
      return await fetchJson<{ data?: { post?: { id?: string; link?: string } } }>(url, {
        method: "POST",
        headers: this.getHeaders(context.site),
        body: payload,
        timeoutMs: getNumberEnv("PUBLISH_TIMEOUT_MS", 30_000),
        retries: 1,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/status=401|status=403/.test(message)) {
        throw new Error(
          `guiatv_admin_key_rejected. The configured x-admin-key was not accepted by ${url}. Verify GUIATV_AUCTORIO_ADMIN_KEY matches the destination ANALYTICS_ADMIN_KEY.`,
        );
      }
      if (/status=404/.test(message)) {
        throw new Error(
          `guiatv_endpoint_not_found at ${url}. The GuiaTV admin API is served under /v2/blog.`,
        );
      }
      throw error;
    }
  }

  async updateDraft(context: PublisherContext, externalId: string): Promise<PublishResult> {
    const dryRun = await this.maybeDryRun(context, "updateDraft", externalId);
    if (dryRun) {
      return dryRun;
    }

    const assetUrl = await resolveAssetUrl(context);
    const payload = this.buildPayload(context, assetUrl, "draft");
    const siteBaseUrl = String(context.site.baseUrl || "").replace(/\/$/, "");
    const response = await fetchJson<{ data?: { post?: { id?: string; link?: string } } }>(
      `${siteBaseUrl}/v2/blog/${externalId}`,
      {
        method: "PUT",
        headers: this.getHeaders(context.site),
        body: payload,
        timeoutMs: getNumberEnv("PUBLISH_TIMEOUT_MS", 30_000),
        retries: 1,
      },
    );

    return {
      externalId,
      externalUrl: response.data?.post?.link || null,
      effectiveTargetStatus: "draft",
      responsePayload: response as Record<string, unknown>,
    };
  }

  async publish(context: PublisherContext, externalId?: string | null): Promise<PublishResult> {
    const dryRun = await this.maybeDryRun(context, "publish", externalId);
    if (dryRun) {
      return dryRun;
    }

    if (externalId) {
      const assetUrl = await resolveAssetUrl(context);
      const payload = this.buildPayload(context, assetUrl, "publish");
      const siteBaseUrl = String(context.site.baseUrl || "").replace(/\/$/, "");
      const response = await fetchJson<{ data?: { post?: { id?: string; link?: string } } }>(
        `${siteBaseUrl}/v2/blog/${externalId}`,
        {
          method: "PUT",
          headers: this.getHeaders(context.site),
          body: payload,
          timeoutMs: getNumberEnv("PUBLISH_TIMEOUT_MS", 30_000),
          retries: 1,
        },
      );
      return {
        externalId,
        externalUrl: response.data?.post?.link || null,
        effectiveTargetStatus: "publish",
        responsePayload: response as Record<string, unknown>,
      };
    }

    const draft = await this.publishDraft(context);
    if (!draft.externalId) {
      return draft;
    }

    return this.publish(context, draft.externalId);
  }

  async unpublish(context: PublisherContext, externalId: string): Promise<PublishResult> {
    const dryRun = await this.maybeDryRun(context, "unpublish", externalId);
    if (dryRun) {
      return dryRun;
    }

    const siteBaseUrl = String(context.site.baseUrl || "").replace(/\/$/, "");
    const response = await fetchJson<{ data?: { deleted?: boolean; id?: string } }>(
      `${siteBaseUrl}/v2/blog/${externalId}`,
      {
        method: "DELETE",
        headers: this.getHeaders(context.site),
        timeoutMs: getNumberEnv("PUBLISH_TIMEOUT_MS", 30_000),
        retries: 1,
      },
    );

    return {
      externalId: String(response.data?.id || externalId),
      responsePayload: response as Record<string, unknown>,
    };
  }
}

class TecnoriaPublisher implements PublisherAdapter {
  private readCredentials(site: Site): TecnoriaCredentials | null {
    const ref = site.publishingCredentialsRef;
    if (!ref) {
      return null;
    }

    const raw = readCredentialRef(ref);
    if (!raw) {
      return null;
    }

    const parsed = readJsonCredentials<TecnoriaCredentials>(ref);
    if (parsed?.token?.trim()) {
      return { token: parsed.token.trim() };
    }
    if (parsed?.email?.trim() && parsed?.password?.trim()) {
      return {
        email: parsed.email.trim(),
        password: parsed.password.trim(),
      };
    }

    return { token: raw };
  }

  private async maybeDryRun(
    context: PublisherContext,
    action: "publishDraft" | "updateDraft" | "publish" | "unpublish",
    externalId?: string | null,
  ): Promise<PublishResult | null> {
    const decision = getDryRunDecision(Boolean(this.readCredentials(context.site)));
    if (!decision.enabled || !decision.reason) {
      return null;
    }

    return buildDryRunResult(context, action, decision.reason, externalId);
  }

  private async getSessionCookie(site: Site): Promise<string> {
    const credentials = this.readCredentials(site);
    if (!credentials) {
      throw new Error("tecnoria_missing_credentials");
    }

    const siteBaseUrl = String(site.baseUrl || "").replace(/\/$/, "");
    const response = await fetchWithTimeout(`${siteBaseUrl}/api/v1/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: {
        email: credentials.email,
        password: credentials.password,
      },
      timeoutMs: getNumberEnv("PUBLISH_TIMEOUT_MS", 30_000),
      retries: 1,
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`tecnoria_login_failed status=${response.status} body=${body}`);
    }

    const setCookie = response.headers.get("set-cookie");
    if (!setCookie) {
      throw new Error("tecnoria_missing_session_cookie");
    }

    return setCookie.split(";")[0];
  }

  private async getAuthHeaders(site: Site, contentType?: string): Promise<Record<string, string>> {
    const credentials = this.readCredentials(site);
    if (!credentials) {
      throw new Error("tecnoria_missing_credentials");
    }

    if (credentials.token?.trim()) {
      return {
        ...(contentType ? { "content-type": contentType } : {}),
        Authorization: `Bearer ${credentials.token.trim()}`,
      };
    }

    const cookie = await this.getSessionCookie(site);
    return {
      ...(contentType ? { "content-type": contentType } : {}),
      Cookie: cookie,
    };
  }

  async uploadAsset(context: PublisherContext): Promise<string | null> {
    const assetUrl = await resolveAssetUrl(context);
    if (!assetUrl) {
      return null;
    }

    const siteBaseUrl = String(context.site.baseUrl || "").replace(/\/$/, "");

    const assetResponse = await fetchWithTimeout(assetUrl, {
      timeoutMs: getNumberEnv("IMAGE_DOWNLOAD_TIMEOUT_MS", 60_000),
      retries: 1,
    });
    if (!assetResponse.ok) {
      const body = await assetResponse.text();
      throw new Error(`asset_download_failed status=${assetResponse.status} body=${body}`);
    }

    const buffer = Buffer.from(await assetResponse.arrayBuffer());
    const formData = new FormData();
    formData.append("file", new Blob([buffer]), imageFileName(assetUrl));

    const upload = await fetchJson<{ url?: string }>(`${siteBaseUrl}/api/v1/blog/upload-image`, {
      method: "POST",
      headers: await this.getAuthHeaders(context.site),
      body: formData,
      timeoutMs: getNumberEnv("PUBLISH_TIMEOUT_MS", 60_000),
      retries: 1,
    });

    return upload.url ?? null;
  }

  private buildPayload(
    context: PublisherContext,
    uploadedImage: string | null,
    status: "draft" | "publish",
  ) {
    const metadata = getMetadata(context.project);
    const slug =
      String(metadata.slug || "").trim() ||
      String(context.version.title || context.project.title)
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, "")
        .trim()
        .replace(/\s+/g, "-");

    return {
      slug,
      title: context.version.title || context.project.title,
      shortDescription: context.version.excerpt || "",
      content: context.version.bodyHtml || "",
      image: uploadedImage ?? undefined,
      tags: getStringArray(metadata.tags),
      author: metadata.author ? String(metadata.author) : "TecnoRia",
      status,
      publishedAt: status === "publish" ? new Date().toISOString() : null,
      seoTitle: context.version.seoTitle || undefined,
      seoDescription: context.version.seoDescription || undefined,
    };
  }

  async publishDraft(context: PublisherContext): Promise<PublishResult> {
    const dryRun = await this.maybeDryRun(context, "publishDraft");
    if (dryRun) {
      return dryRun;
    }

    return this.upsert(context, "draft");
  }

  async updateDraft(context: PublisherContext, externalId: string): Promise<PublishResult> {
    const dryRun = await this.maybeDryRun(context, "updateDraft", externalId);
    if (dryRun) {
      return dryRun;
    }

    return this.upsert(context, "draft", externalId);
  }

  async publish(context: PublisherContext, externalId?: string | null): Promise<PublishResult> {
    const dryRun = await this.maybeDryRun(context, "publish", externalId);
    if (dryRun) {
      return dryRun;
    }

    return this.upsert(context, "publish", externalId ?? undefined);
  }

  private async upsert(
    context: PublisherContext,
    status: "draft" | "publish",
    externalId?: string,
  ): Promise<PublishResult> {
    const uploadedImage = await this.uploadAsset(context);
    const payload = this.buildPayload(context, uploadedImage, status);
    const siteBaseUrl = String(context.site.baseUrl || "").replace(/\/$/, "");
    const method = externalId ? "PUT" : "POST";
    const url = externalId ? `${siteBaseUrl}/api/v1/blog/${externalId}` : `${siteBaseUrl}/api/v1/blog`;

    const response = await fetchWithTimeout(url, {
      method,
      headers: await this.getAuthHeaders(context.site, "application/json"),
      body: payload,
      timeoutMs: getNumberEnv("PUBLISH_TIMEOUT_MS", 30_000),
      retries: 1,
    });

    const text = await response.text();
    if (!response.ok) {
      throw new Error(`tecnoria_publish_failed status=${response.status} body=${text}`);
    }

    const parsed = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    const resolvedExternalId = externalId ?? (parsed.id ? String(parsed.id) : null);
    const resolvedSlug =
      parsed.slug && String(parsed.slug).trim()
        ? String(parsed.slug).trim()
        : String(payload.slug || "").trim();

    return {
      externalId: resolvedExternalId,
      externalUrl: resolvedSlug ? `${siteBaseUrl}/blog/${resolvedSlug}` : null,
      effectiveTargetStatus: status,
      responsePayload: parsed,
    };
  }

  async unpublish(context: PublisherContext, externalId: string): Promise<PublishResult> {
    const dryRun = await this.maybeDryRun(context, "unpublish", externalId);
    if (dryRun) {
      return dryRun;
    }

    return this.upsert(context, "draft", externalId);
  }
}

class TalkarisPublisher implements PublisherAdapter {
  private getToken(site: Site): string {
    return readCredentialRef(site.publishingCredentialsRef);
  }

  private async maybeDryRun(
    context: PublisherContext,
    action: "publishDraft" | "updateDraft" | "publish" | "unpublish",
    externalId?: string | null,
  ): Promise<PublishResult | null> {
    const decision = getDryRunDecision(Boolean(this.getToken(context.site)));
    if (!decision.enabled || !decision.reason) {
      return null;
    }

    return buildDryRunResult(context, action, decision.reason, externalId);
  }

  private getHeaders(site: Site): Record<string, string> {
    const token = this.getToken(site);
    if (!token) {
      throw new Error("talkaris_missing_token");
    }

    return {
      "content-type": "application/json",
      Authorization: `Bearer ${token}`,
    };
  }

  private buildPayload(
    context: PublisherContext,
    status: "draft" | "publish",
    externalId?: string | null,
  ) {
    const metadata = getMetadata(context.project);
    const slug =
      String(metadata.slug || "").trim() ||
      String(context.version.title || context.project.title)
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, "")
        .trim()
        .replace(/\s+/g, "-");

    return {
      id: externalId ?? undefined,
      slug,
      title: context.version.title || context.project.title,
      summary: context.version.excerpt || "",
      bodyHtml: context.version.bodyHtml || "",
      locale: context.project.primaryLanguage || "en",
      author: metadata.author ? String(metadata.author) : "Talkaris Team",
      category: metadata.category ? String(metadata.category) : "product-updates",
      tags: getStringArray(metadata.tags),
      imageUrl: context.assetUrl ?? null,
      seoTitle: context.version.seoTitle || undefined,
      seoDescription: context.version.seoDescription || undefined,
      status,
      publishedAt: status === "publish" ? new Date().toISOString() : null,
    };
  }

  private async dispatch(
    context: PublisherContext,
    status: "draft" | "publish",
    externalId?: string | null,
  ): Promise<PublishResult> {
    const siteBaseUrl = String(context.site.baseUrl || "").replace(/\/$/, "");
    const payload = this.buildPayload(context, status, externalId);
    const method = externalId ? "PUT" : "POST";
    const url = externalId
      ? `${siteBaseUrl}/api/v1/ops/blog/${externalId}`
      : `${siteBaseUrl}/api/v1/ops/blog`;

    const response = await fetchWithTimeout(url, {
      method,
      headers: this.getHeaders(context.site),
      body: payload,
      timeoutMs: getNumberEnv("PUBLISH_TIMEOUT_MS", 30_000),
      retries: 1,
    });

    const text = await response.text();
    if (!response.ok) {
      throw new Error(`talkaris_publish_failed status=${response.status} body=${text}`);
    }

    const parsed = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    const resolvedExternalId = externalId ?? (parsed.id ? String(parsed.id) : null);
    const resolvedSlug =
      parsed.slug && String(parsed.slug).trim()
        ? String(parsed.slug).trim()
        : String(payload.slug || "").trim();

    return {
      externalId: resolvedExternalId,
      externalUrl: resolvedSlug ? `${siteBaseUrl}/blog/${resolvedSlug}` : null,
      effectiveTargetStatus: status,
      responsePayload: parsed,
    };
  }

  async publishDraft(context: PublisherContext): Promise<PublishResult> {
    const dryRun = await this.maybeDryRun(context, "publishDraft");
    if (dryRun) {
      return dryRun;
    }

    return this.dispatch(context, "draft");
  }

  async updateDraft(context: PublisherContext, externalId: string): Promise<PublishResult> {
    const dryRun = await this.maybeDryRun(context, "updateDraft", externalId);
    if (dryRun) {
      return dryRun;
    }

    return this.dispatch(context, "draft", externalId);
  }

  async publish(context: PublisherContext, externalId?: string | null): Promise<PublishResult> {
    const dryRun = await this.maybeDryRun(context, "publish", externalId);
    if (dryRun) {
      return dryRun;
    }

    return this.dispatch(context, "publish", externalId);
  }

  async unpublish(context: PublisherContext, externalId: string): Promise<PublishResult> {
    const dryRun = await this.maybeDryRun(context, "unpublish", externalId);
    if (dryRun) {
      return dryRun;
    }

    return this.dispatch(context, "draft", externalId);
  }
}

class GenericWebhookPublisher implements PublisherAdapter {
  private async getSecret(site: Site): Promise<string> {
    const installation = await loadActiveInstallationForSite(site.tenantId, site.id, "generic_webhook");
    if (installation?.decryptedSecrets?.signingSecret) {
      return installation.decryptedSecrets.signingSecret;
    }
    return readCredentialRef(site.publishingCredentialsRef);
  }

  private async maybeDryRun(
    context: PublisherContext,
    action: "publishDraft" | "updateDraft" | "publish" | "unpublish",
    externalId?: string | null,
  ): Promise<PublishResult | null> {
    const decision = getDryRunDecision(Boolean(await this.getSecret(context.site)));
    if (!decision.enabled || !decision.reason) {
      return null;
    }

    return buildDryRunResult(context, action, decision.reason, externalId);
  }

  private buildPayload(
    context: PublisherContext,
    action: "publishDraft" | "updateDraft" | "publish" | "unpublish",
    targetStatus: PublicationTargetStatus | null,
    externalId?: string | null,
  ) {
    return {
      site: {
        id: context.site.id,
        key: context.site.key,
        type: context.site.type,
      },
      project: {
        id: context.project.id,
        title: context.project.title,
        goal: context.project.goal,
        metadata: context.project.metadata,
      },
      version: {
        id: context.version.id,
        title: context.version.title,
        excerpt: context.version.excerpt,
        bodyHtml: context.version.bodyHtml,
        seoTitle: context.version.seoTitle,
        seoDescription: context.version.seoDescription,
      },
      publication: {
        action,
        targetStatus,
        externalId: externalId ?? null,
      },
      assetUrl: context.assetUrl ?? null,
    };
  }

  async publishDraft(context: PublisherContext): Promise<PublishResult> {
    const dryRun = await this.maybeDryRun(context, "publishDraft");
    if (dryRun) {
      return dryRun;
    }

    return this.dispatch(context, "publishDraft", "draft");
  }

  async updateDraft(context: PublisherContext, externalId?: string): Promise<PublishResult> {
    const dryRun = await this.maybeDryRun(context, "updateDraft", externalId);
    if (dryRun) {
      return dryRun;
    }

    return this.dispatch(context, "updateDraft", "draft", externalId);
  }

  async publish(context: PublisherContext, externalId?: string | null): Promise<PublishResult> {
    const dryRun = await this.maybeDryRun(context, "publish", externalId);
    if (dryRun) {
      return dryRun;
    }

    return this.dispatch(context, "publish", "publish", externalId);
  }

  private async dispatch(
    context: PublisherContext,
    action: "publishDraft" | "updateDraft" | "publish" | "unpublish",
    targetStatus: PublicationTargetStatus | null,
    externalId?: string | null,
  ): Promise<PublishResult> {
    const siteBaseUrl = String(context.site.baseUrl || "").replace(/\/$/, "");
    const payload = this.buildPayload(context, action, targetStatus, externalId);
    const body = JSON.stringify(payload);
    const signature = crypto
      .createHmac("sha256", await this.getSecret(context.site))
      .update(body)
      .digest("hex");

    const response = await fetchWithTimeout(siteBaseUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-content-signature": signature,
      },
      body,
      timeoutMs: getNumberEnv("PUBLISH_TIMEOUT_MS", 30_000),
      retries: 1,
    });

    const text = await response.text();
    if (!response.ok) {
      throw new Error(`webhook_publish_failed status=${response.status} body=${text}`);
    }

    const parsed = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    return {
      externalId: parsed.id ? String(parsed.id) : null,
      externalUrl: parsed.url ? String(parsed.url) : null,
      effectiveTargetStatus: targetStatus,
      responsePayload: parsed,
    };
  }

  async unpublish(context: PublisherContext, externalId?: string): Promise<PublishResult> {
    const dryRun = await this.maybeDryRun(context, "unpublish", externalId);
    if (dryRun) {
      return dryRun;
    }

    return this.dispatch(context, "unpublish", null, externalId);
  }
}

// ────────────────────────────────────────────────────────────── Generic REST adapter

type GenericRestConfig = {
  baseUrl?: string;
  restBasePath?: string;
  contentPath?: string;
  mediaPath?: string;
  authScheme?: string;
  apiToken?: string;
  authorId?: string;
  categoryIds?: string;
  locale?: string;
};

class GenericRestPublisher implements PublisherAdapter {
  private async resolveConfig(site: Site): Promise<GenericRestConfig> {
    const installation = await loadActiveInstallationForSite(site.tenantId, site.id, "generic_rest");
    if (installation) {
      const config = (installation.config ?? {}) as Record<string, unknown>;
      return {
        baseUrl: String(config.baseUrl ?? site.baseUrl ?? ""),
        restBasePath: String(config.restBasePath ?? ""),
        contentPath: String(config.contentPath ?? "posts"),
        mediaPath: String(config.mediaPath ?? "media"),
        authScheme: String(config.authScheme ?? "bearer"),
        apiToken: installation.decryptedSecrets?.apiToken ?? "",
        authorId: String(config.authorId ?? ""),
        categoryIds: String(config.categoryIds ?? ""),
        locale: String(config.locale ?? site.locale ?? ""),
      };
    }
    // Fallback: environment-referenced credentials for compatibility.
    return {
      baseUrl: String(site.baseUrl ?? ""),
      restBasePath: "",
      contentPath: "posts",
      mediaPath: "media",
      authScheme: "bearer",
      apiToken: readCredentialRef(site.publishingCredentialsRef),
      authorId: "",
      categoryIds: "",
      locale: site.locale ?? "",
    };
  }

  private async getHeaders(site: Site): Promise<Record<string, string>> {
    const config = await this.resolveConfig(site);
    if (!config.apiToken) {
      throw new Error("generic_rest_missing_credentials");
    }
    const headers: Record<string, string> = { "content-type": "application/json" };
    if ((config.authScheme ?? "bearer") === "basic_user_pass") {
      headers.authorization = `Basic ${Buffer.from(config.apiToken).toString("base64")}`;
    } else {
      headers.authorization = `Bearer ${config.apiToken}`;
    }
    return headers;
  }

  private async restBase(site: Site): Promise<string> {
    const config = await this.resolveConfig(site);
    const baseUrl = String(config.baseUrl || "").replace(/\/$/, "");
    const rest = String(config.restBasePath || "/wp-json/wp/v2").replace(/^\/+/, "");
    return `${baseUrl}/${rest}`;
  }

  private buildPayload(context: PublisherContext, assetUrl: string | null, status: "draft" | "publish") {
    const metadata = getMetadata(context.project);
    return {
      title: context.version.title || context.project.title,
      slug: String(metadata.slug || "").trim() || undefined,
      status,
      excerpt: sanitizeEditorialHtml(context.version.excerpt || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
      content: sanitizeEditorialHtml(context.version.bodyHtml || ""),
      featured_media: assetUrl ?? undefined,
      categories: getStringArray(metadata.categories),
      tags: getStringArray(metadata.keywords),
      lang: undefined,
      meta: {
        _auctorio_seo_title: context.version.seoTitle || undefined,
        _auctorio_seo_description: context.version.seoDescription || undefined,
      },
    };
  }

  private async maybeDryRun(
    context: PublisherContext,
    action: "publishDraft" | "updateDraft" | "publish" | "unpublish",
    externalId?: string | null,
  ): Promise<PublishResult | null> {
    const config = await this.resolveConfig(context.site);
    const decision = getDryRunDecision(Boolean(config.apiToken));
    if (!decision.enabled || !decision.reason) {
      return null;
    }
    return buildDryRunResult(context, action, decision.reason, externalId);
  }

  async uploadAsset(context: PublisherContext): Promise<string | null> {
    const assetUrl = await resolveAssetUrl(context);
    if (!assetUrl) {
      return null;
    }
    const config = await this.resolveConfig(context.site);
    const base = await this.restBase(context.site);
    const mediaPath = String(config.mediaPath || "media").replace(/^\/+/, "");
    const headers = await this.getHeaders(context.site);
    delete headers["content-type"];

    const assetResponse = await fetchWithTimeout(assetUrl, {
      timeoutMs: getNumberEnv("IMAGE_DOWNLOAD_TIMEOUT_MS", 60_000),
      retries: 1,
    });
    if (!assetResponse.ok) {
      const body = await assetResponse.text();
      throw new Error(`asset_download_failed status=${assetResponse.status} body=${body}`);
    }
    const buffer = Buffer.from(await assetResponse.arrayBuffer());
    const formData = new FormData();
    formData.append("file", new Blob([buffer]), imageFileName(assetUrl));

    const upload = await fetchJson<{ source_url?: string; url?: string; id?: number | string }>(`${base}/${mediaPath}`, {
      method: "POST",
      headers,
      body: formData,
      timeoutMs: getNumberEnv("PUBLISH_TIMEOUT_MS", 60_000),
      retries: 1,
    });
    return upload.source_url ?? upload.url ?? null;
  }

  async publishDraft(context: PublisherContext): Promise<PublishResult> {
    const dryRun = await this.maybeDryRun(context, "publishDraft");
    if (dryRun) {
      return dryRun;
    }
    const config = await this.resolveConfig(context.site);
    const base = await this.restBase(context.site);
    const contentPath = String(config.contentPath || "posts").replace(/^\/+/, "");
    let assetUrl: string | null = null;
    try {
      assetUrl = await this.uploadAsset(context);
    } catch {
      assetUrl = null;
    }
    const payload = {
      ...this.buildPayload(context, assetUrl, "draft"),
      ...(config.authorId ? { author: Number(config.authorId) || config.authorId } : {}),
      ...(config.categoryIds ? { categories: config.categoryIds.split(",").map((id) => Number(id.trim()) || id.trim()).filter(Boolean) } : {}),
    };
    const response = await fetchJson<Record<string, unknown>>(`${base}/${contentPath}`, {
      method: "POST",
      headers: await this.getHeaders(context.site),
      body: payload,
      timeoutMs: getNumberEnv("PUBLISH_TIMEOUT_MS", 30_000),
      retries: 1,
    });
    return {
      externalId: String(response.id ?? ""),
      externalUrl: typeof response.link === "string" ? response.link : null,
      effectiveTargetStatus: "draft",
      responsePayload: response,
    };
  }

  async updateDraft(context: PublisherContext, externalId: string): Promise<PublishResult> {
    const dryRun = await this.maybeDryRun(context, "updateDraft", externalId);
    if (dryRun) {
      return dryRun;
    }
    const config = await this.resolveConfig(context.site);
    const base = await this.restBase(context.site);
    const contentPath = String(config.contentPath || "posts").replace(/^\/+/, "");
    const response = await fetchJson<Record<string, unknown>>(`${base}/${contentPath}/${externalId}`, {
      method: "PUT",
      headers: await this.getHeaders(context.site),
      body: { ...this.buildPayload(context, null, "draft") },
      timeoutMs: getNumberEnv("PUBLISH_TIMEOUT_MS", 30_000),
      retries: 1,
    });
    return {
      externalId,
      externalUrl: typeof response.link === "string" ? response.link : null,
      effectiveTargetStatus: "draft",
      responsePayload: response,
    };
  }

  async publish(context: PublisherContext, externalId?: string | null): Promise<PublishResult> {
    const dryRun = await this.maybeDryRun(context, "publish", externalId);
    if (dryRun) {
      return dryRun;
    }
    if (externalId) {
      const config = await this.resolveConfig(context.site);
      const base = await this.restBase(context.site);
      const contentPath = String(config.contentPath || "posts").replace(/^\/+/, "");
      const response = await fetchJson<Record<string, unknown>>(`${base}/${contentPath}/${externalId}`, {
        method: "PUT",
        headers: await this.getHeaders(context.site),
        body: { status: "publish" },
        timeoutMs: getNumberEnv("PUBLISH_TIMEOUT_MS", 30_000),
        retries: 1,
      });
      return {
        externalId,
        externalUrl: typeof response.link === "string" ? response.link : null,
        effectiveTargetStatus: "publish",
        responsePayload: response,
      };
    }
    const draft = await this.publishDraft(context);
    if (!draft.externalId) {
      return draft;
    }
    return this.publish(context, draft.externalId);
  }

  async unpublish(context: PublisherContext, externalId: string): Promise<PublishResult> {
    const dryRun = await this.maybeDryRun(context, "unpublish", externalId);
    if (dryRun) {
      return dryRun;
    }
    const config = await this.resolveConfig(context.site);
    const base = await this.restBase(context.site);
    const contentPath = String(config.contentPath || "posts").replace(/^\/+/, "");
    const response = await fetchJson<Record<string, unknown>>(`${base}/${contentPath}/${externalId}`, {
      method: "PUT",
      headers: await this.getHeaders(context.site),
      body: { status: "draft" },
      timeoutMs: getNumberEnv("PUBLISH_TIMEOUT_MS", 30_000),
      retries: 1,
    });
    return {
      externalId,
      effectiveTargetStatus: "draft",
      responsePayload: response,
    };
  }
}

export function getPublisher(site: Site): PublisherAdapter {
  switch (site.type) {
    case "guiatv":
      return new GuiaTvPublisher();
    case "tecnoria":
      return new TecnoriaPublisher();
    case "talkaris":
      return new TalkarisPublisher();
    case "webhook":
      return new GenericWebhookPublisher();
    case "generic_rest":
      return new GenericRestPublisher();
    default:
      throw new Error(`unsupported_publisher_type ${site.type}`);
  }
}
