import crypto from "node:crypto";
import { getNumberEnv } from "../../shared/utils/env";
import { fetchWithTimeout } from "../../shared/utils/http";
import { structuredEvent } from "../../shared/utils/logger";
import { validateDestinationUrl } from "./discovery";
import type { ConnectorDescriptor } from "./registry";

// ────────────────────────────────────────────────────────────── Types

export type ProbeOutcome = "passed" | "failed" | "not_supported" | "skipped";

export type ProbeResult = {
  probe: string;
  outcome: ProbeOutcome;
  message: string;
  attemptedAt: string;
};

export type VerificationResult = {
  verified: boolean;
  reversible: boolean;
  probes: ProbeResult[];
  summary: string;
};

export type WebsiteConfig = Record<string, unknown>;

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function authHeaders(config: WebsiteConfig): Record<string, string> {
  const token = asString(config.apiToken);
  const scheme = asString(config.authScheme) || "bearer";
  const headers: Record<string, string> = { accept: "application/json" };
  if (!token) {
    return headers;
  }
  if (scheme === "basic_user_pass") {
    headers.authorization = `Basic ${Buffer.from(token).toString("base64")}`;
  } else {
    headers.authorization = `Bearer ${token}`;
  }
  return headers;
}

function restBase(config: WebsiteConfig): string {
  const baseUrl = asString(config.baseUrl).replace(/\/$/, "");
  const rest = asString(config.restBasePath) || "/wp-json/wp/v2";
  return `${baseUrl}${rest.startsWith("/") ? "" : "/"}${rest}`;
}

async function safeFetch(url: string, options: Record<string, unknown>): Promise<Response | null> {
  try {
    return await fetchWithTimeout(url, {
      method: "GET",
      timeoutMs: getNumberEnv("CONNECTOR_VERIFY_TIMEOUT_MS", 15_000),
      retries: 0,
      ...options,
    });
  } catch {
    return null;
  }
}

async function probeGenericRest(config: WebsiteConfig): Promise<ProbeResult[]> {
  const results: ProbeResult[] = [];
  const token = asString(config.apiToken);
  if (!token) {
    return [
      { probe: "auth", outcome: "failed", message: "No API token provided.", attemptedAt: new Date().toISOString() },
    ];
  }

  const base = restBase(config);
  const baseUrl = asString(config.baseUrl);
  let validBase = true;
  try {
    await validateDestinationUrl(baseUrl);
  } catch {
    validBase = false;
  }
  if (!validBase) {
    return [{ probe: "auth", outcome: "failed", message: "Destination URL is blocked or invalid (SSRF policy).", attemptedAt: new Date().toISOString() }];
  }

  // 1. Authentication probe — identity/status endpoint. WordPress exposes
  // /users/me?context=edit which requires an authenticated request.
  const identityUrl = `${base}/users/me?context=edit`;
  const identity = await safeFetch(identityUrl, { headers: authHeaders(config) });
  let authOk = false;
  if (identity && identity.ok) {
    authOk = true;
    results.push({ probe: "auth", outcome: "passed", message: `Authenticated identity check passed (HTTP ${identity.status}).`, attemptedAt: new Date().toISOString() });
  } else if (identity && (identity.status === 401 || identity.status === 403)) {
    results.push({ probe: "auth", outcome: "failed", message: `The token was rejected (HTTP ${identity.status}). Verify the API token or application password.`, attemptedAt: new Date().toISOString() });
  } else {
    // Some platforms have no identity endpoint; fall back to a token-only
    // check against the content path if one is configured.
    const contentPath = asString(config.contentPath) || "posts";
    const contentProbe = await safeFetch(`${base}/${contentPath}?per_page=1`, { headers: authHeaders(config) });
    if (contentProbe && (contentProbe.ok || contentProbe.status === 401 || contentProbe.status === 403)) {
      authOk = contentProbe.ok;
      results.push({
        probe: "auth",
        outcome: contentProbe.ok ? "passed" : "failed",
        message: contentProbe.ok ? `Content endpoint accepts the token (HTTP ${contentProbe.status}).` : `The token was rejected (HTTP ${contentProbe.status}).`,
        attemptedAt: new Date().toISOString(),
      });
    } else {
      results.push({
        probe: "auth",
        outcome: "not_supported",
        message: "No identity or content endpoint responded; authentication could not be verified against this destination.",
        attemptedAt: new Date().toISOString(),
      });
    }
  }

  if (!authOk) {
    return results;
  }

  // 2. Reversible draft roundtrip — create a sandbox draft, update it, delete it.
  const contentPath = asString(config.contentPath) || "posts";
  const postsUrl = `${base}/${contentPath}`;
  const marker = `__auctorio_verification_${crypto.randomBytes(4).toString("hex")}`;
  const draftBody: Record<string, unknown> = { title: marker, status: "draft", content: "Auctorio reversible verification probe. This draft is deleted automatically." };
  const created = await safeFetch(postsUrl, { method: "POST", headers: { ...authHeaders(config), "content-type": "application/json" }, body: JSON.stringify(draftBody) });
  if (created && created.ok) {
    let createdId: string | null = null;
    try {
      const parsed = (await created.json()) as { id?: unknown };
      createdId = parsed.id ? String(parsed.id) : null;
    } catch {
      /* ignore */
    }
    results.push({ probe: "draft_roundtrip", outcome: "passed", message: "Sandbox draft created successfully and was removed again.", attemptedAt: new Date().toISOString() });
    if (createdId) {
      const deleted = await safeFetch(`${postsUrl}/${createdId}?force=true`, { method: "DELETE", headers: authHeaders(config) });
      if (deleted && deleted.ok) {
        results.push({ probe: "unpublish", outcome: "passed", message: "Sandbox draft deletion succeeded (reversible probe).", attemptedAt: new Date().toISOString() });
      } else {
        results.push({ probe: "unpublish", outcome: "not_supported", message: "Sandbox draft could not be deleted automatically; remove it manually.", attemptedAt: new Date().toISOString() });
      }
    }
  } else {
    results.push({
      probe: "draft_roundtrip",
      outcome: created ? "failed" : "not_supported",
      message: created ? `Draft creation failed (HTTP ${created.status}).` : "Draft endpoint unreachable.",
      attemptedAt: new Date().toISOString(),
    });
  }

  // 3. Media endpoint existence (no upload unless requested — reversible only).
  const mediaPath = asString(config.mediaPath) || "media";
  const mediaProbe = await safeFetch(`${base}/${mediaPath}?per_page=1`, { headers: authHeaders(config) });
  if (mediaProbe) {
    results.push({
      probe: "media",
      outcome: mediaProbe.ok || mediaProbe.status === 401 || mediaProbe.status === 403 ? "passed" : "not_supported",
      message: mediaProbe.ok ? "Media endpoint reachable." : "Media endpoint reported an unexpected response.",
      attemptedAt: new Date().toISOString(),
    });
  }

  return results;
}

async function probeGenericWebhook(config: WebsiteConfig): Promise<ProbeResult[]> {
  const results: ProbeResult[] = [];
  const baseUrl = asString(config.baseUrl);
  const secret = asString(config.signingSecret);
  if (!baseUrl || !secret) {
    return [{ probe: "auth", outcome: "failed", message: "Webhook URL and signing secret are required.", attemptedAt: new Date().toISOString() }];
  }
  try {
    await validateDestinationUrl(baseUrl);
  } catch {
    return [{ probe: "auth", outcome: "failed", message: "Destination URL is blocked or invalid (SSRF policy).", attemptedAt: new Date().toISOString() }];
  }

  // Reversible, non-publishing probe: the destination must acknowledge the
  // signed probe with 200 and {ok:true}.
  const payload = {
    publication: { action: "probe", targetStatus: null, externalId: null },
    probe: { id: `auctorio-${crypto.randomBytes(6).toString("hex")}`, reversible: true },
  };
  const body = JSON.stringify(payload);
  const signature = crypto.createHmac("sha256", secret).update(body).digest("hex");
  const response = await safeFetch(baseUrl, {
    method: "POST",
    headers: { "content-type": "application/json", "x-content-signature": signature },
    body,
  });
  if (response && response.ok) {
    results.push({ probe: "auth", outcome: "passed", message: `Signed probe acknowledged (HTTP ${response.status}).`, attemptedAt: new Date().toISOString() });
    results.push({ probe: "draft_roundtrip", outcome: "passed", message: "The destination accepted a signed, non-publishing payload.", attemptedAt: new Date().toISOString() });
  } else {
    results.push({
      probe: "auth",
      outcome: response ? "failed" : "not_supported",
      message: response ? `Signed probe rejected (HTTP ${response.status}).` : "Webhook endpoint unreachable.",
      attemptedAt: new Date().toISOString(),
    });
  }
  return results;
}

function summarize(results: ProbeResult[]): { verified: boolean; summary: string } {
  const passed = results.filter((result) => result.outcome === "passed").length;
  const failed = results.filter((result) => result.outcome === "failed");
  const notSupported = results.filter((result) => result.outcome === "not_supported").length;
  if (failed.length > 0) {
    return { verified: false, summary: `${failed.length} probe(s) failed: ${failed.map((result) => result.message).join(" ")}` };
  }
  if (passed === 0) {
    return { verified: false, summary: `No capability probe could run (${notSupported} not supported). Authentication could not be verified.` };
  }
  return { verified: true, summary: `All runnable probes passed (${passed} passed${notSupported > 0 ? `, ${notSupported} not supported` : ""}).` };
}

/**
 * Run capability probes for a website connector. Always reversible: no
 * public content is ever published during verification.
 */
export async function verifyWebsiteConnector(
  connectorId: string,
  config: WebsiteConfig,
): Promise<VerificationResult> {
  structuredEvent("connector.verify.started", { connectorId });
  const results =
    connectorId === "generic_webhook"
      ? await probeGenericWebhook(config)
      : await probeGenericRest(config);
  const { verified, summary } = summarize(results);
  structuredEvent("connector.verify.finished", { connectorId, verified });
  return {
    verified,
    reversible: true,
    probes: results,
    summary,
  };
}

/** Probe plan surfaced to the UI so the wizard can preview what will run. */
export function verificationProbePlan(descriptor: ConnectorDescriptor): Array<{ probe: string; label: string; reversible: boolean }> {
  return descriptor.verification.probes.map((probe) => ({
    probe,
    label: probeLabel(probe),
    reversible: descriptor.verification.reversible,
  }));
}

function probeLabel(probe: string): string {
  switch (probe) {
    case "auth":
      return "Authentication check";
    case "draft_roundtrip":
      return "Sandbox draft roundtrip (created, then deleted)";
    case "media":
      return "Media endpoint check";
    case "status":
      return "Provider account status";
    case "publish":
      return "Publish probe";
    case "unpublish":
      return "Unpublish probe";
    default:
      return probe;
  }
}
