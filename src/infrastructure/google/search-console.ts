// Google Search Console over HTTP: official endpoints, read-only scope, no SDK.
// First-party data the site's owner authorizes; it is free, so it never passes through the cost governor.

import { getEnv } from "../../shared/utils/env";
import { pkceChallenge } from "../../shared/utils/crypto";

export const SEARCH_CONSOLE_SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";
/** Rows per request allowed by the API. */
export const SEARCH_CONSOLE_PAGE_ROWS = 25_000;
const TIMEOUT_MS = 30_000;

export type SearchConsoleErrorKind = "not_configured" | "revoked" | "forbidden" | "quota" | "transient" | "invalid";
export class SearchConsoleError extends Error {
  constructor(readonly kind: SearchConsoleErrorKind, message: string) {
    super(message);
  }
}

export type SearchConsoleProperty = { property: string; permissionLevel: string };
export type SearchDimension = "date" | "query" | "page" | "country" | "device";
export type SearchRow = { keys: string[]; clicks: number; impressions: number; position: number };
export type IndexInspection = {
  verdict: string | null;
  coverageState: string | null;
  indexingState: string | null;
  robotsState: string | null;
  fetchState: string | null;
  googleCanonical: string | null;
  userCanonical: string | null;
  lastCrawlAt: Date | null;
};

function credentials(): { clientId: string; clientSecret: string } {
  const clientId = getEnv("GOOGLE_CLIENT_ID", "").trim();
  const clientSecret = getEnv("GOOGLE_CLIENT_SECRET", "").trim();
  if (!clientId || !clientSecret) throw new SearchConsoleError("not_configured", "search_console_not_configured");
  return { clientId, clientSecret };
}

export function searchConsoleConfigured(): boolean {
  return Boolean(getEnv("GOOGLE_CLIENT_ID", "").trim() && getEnv("GOOGLE_CLIENT_SECRET", "").trim());
}

export function searchConsoleAuthorizeUrl(input: { redirectUri: string; state: string; pkceVerifier: string }): string {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: credentials().clientId,
    redirect_uri: input.redirectUri,
    response_type: "code",
    scope: SEARCH_CONSOLE_SCOPE,
    access_type: "offline",
    prompt: "consent", // without it Google omits the refresh token on reconnections
    state: input.state,
    code_challenge: pkceChallenge(input.pkceVerifier),
    code_challenge_method: "S256",
  }).toString();
  return url.toString();
}

/** Never carries tokens, codes or response bodies into the message. */
async function failure(response: Response): Promise<SearchConsoleError> {
  const body = (await response.json().catch(() => ({}))) as { error?: string | { status?: string; message?: string; errors?: Array<{ reason?: string }> } };
  const reason = typeof body.error === "string" ? body.error : (body.error?.errors?.[0]?.reason ?? body.error?.status ?? "");
  const label = `google_${response.status}${/^[\w-]{1,60}$/.test(reason) ? `_${reason}` : ""}`;
  if (reason === "invalid_grant" || response.status === 401) return new SearchConsoleError("revoked", label);
  if (response.status === 429 || /quota|rateLimit|RESOURCE_EXHAUSTED/i.test(reason)) return new SearchConsoleError("quota", label);
  if (response.status === 403) return new SearchConsoleError("forbidden", label);
  if (response.status >= 500) return new SearchConsoleError("transient", label);
  return new SearchConsoleError("invalid", label);
}

async function call(fetchImpl: typeof fetch, url: string, init: RequestInit): Promise<Record<string, unknown>> {
  if (fetchImpl === globalThis.fetch && process.env.NODE_TEST_CONTEXT) throw new Error("search_console_real_fetch_in_tests");
  let response: Response;
  try {
    response = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch {
    throw new SearchConsoleError("transient", "google_unreachable");
  }
  if (!response.ok) throw await failure(response);
  return (await response.json().catch(() => ({}))) as Record<string, unknown>;
}

const form = (fields: Record<string, string>): RequestInit => ({
  method: "POST",
  headers: { "content-type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams(fields).toString(),
});
const bearer = (accessToken: string, body?: unknown): RequestInit => ({
  method: body ? "POST" : "GET",
  headers: { authorization: `Bearer ${accessToken}`, ...(body ? { "content-type": "application/json" } : {}) },
  ...(body ? { body: JSON.stringify(body) } : {}),
});
const str = (value: unknown): string | null => (typeof value === "string" && value ? value : null);
const count = (value: unknown): number => (typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0);

export async function exchangeSearchConsoleCode(
  input: { code: string; redirectUri: string; pkceVerifier: string },
  fetchImpl: typeof fetch = fetch,
): Promise<{ accessToken: string; refreshToken: string }> {
  const { clientId, clientSecret } = credentials();
  const token = await call(fetchImpl, "https://oauth2.googleapis.com/token", form({
    client_id: clientId, client_secret: clientSecret, code: input.code, code_verifier: input.pkceVerifier, redirect_uri: input.redirectUri, grant_type: "authorization_code",
  }));
  // The user can untick the permission on Google's screen.
  if (!String(token.scope ?? "").split(" ").includes(SEARCH_CONSOLE_SCOPE)) throw new SearchConsoleError("forbidden", "search_console_scope_not_granted");
  const accessToken = str(token.access_token);
  const refreshToken = str(token.refresh_token);
  if (!accessToken || !refreshToken) throw new SearchConsoleError("invalid", "search_console_token_missing");
  return { accessToken, refreshToken };
}

export async function refreshSearchConsoleToken(refreshToken: string, fetchImpl: typeof fetch = fetch): Promise<string> {
  const { clientId, clientSecret } = credentials();
  const token = await call(fetchImpl, "https://oauth2.googleapis.com/token", form({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: "refresh_token" }));
  const accessToken = str(token.access_token);
  if (!accessToken) throw new SearchConsoleError("invalid", "search_console_token_missing");
  return accessToken;
}

export async function revokeSearchConsoleToken(refreshToken: string, fetchImpl: typeof fetch = fetch): Promise<void> {
  await call(fetchImpl, "https://oauth2.googleapis.com/revoke", form({ token: refreshToken }));
}

/** Only properties the account can read: an unverified one gives no data. */
export async function listSearchConsoleProperties(accessToken: string, fetchImpl: typeof fetch = fetch): Promise<SearchConsoleProperty[]> {
  const data = await call(fetchImpl, "https://www.googleapis.com/webmasters/v3/sites", bearer(accessToken));
  const entries = Array.isArray(data.siteEntry) ? (data.siteEntry as Array<Record<string, unknown>>) : [];
  return entries
    .map((entry) => ({ property: str(entry.siteUrl) ?? "", permissionLevel: str(entry.permissionLevel) ?? "" }))
    .filter((entry) => entry.property && entry.permissionLevel && entry.permissionLevel !== "siteUnverifiedUser");
}

/** Final data only: fresh figures still change and would have to be bought again in quota. */
export async function querySearchConsole(
  input: { accessToken: string; property: string; startDate: string; endDate: string; dimensions: SearchDimension[]; rowLimit?: number; startRow?: number },
  fetchImpl: typeof fetch = fetch,
): Promise<SearchRow[]> {
  const data = await call(fetchImpl, `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(input.property)}/searchAnalytics/query`, bearer(input.accessToken, {
    startDate: input.startDate, endDate: input.endDate, dimensions: input.dimensions, rowLimit: input.rowLimit ?? SEARCH_CONSOLE_PAGE_ROWS, startRow: input.startRow ?? 0, type: "web", dataState: "final",
  }));
  return (Array.isArray(data.rows) ? (data.rows as Array<Record<string, unknown>>) : []).map((row) => ({
    keys: (Array.isArray(row.keys) ? row.keys : []).map(String), clicks: count(row.clicks), impressions: count(row.impressions), position: count(row.position),
  }));
}

export async function inspectSearchConsoleUrl(input: { accessToken: string; property: string; url: string }, fetchImpl: typeof fetch = fetch): Promise<IndexInspection> {
  const data = await call(fetchImpl, "https://searchconsole.googleapis.com/v1/urlInspection/index:inspect", bearer(input.accessToken, { inspectionUrl: input.url, siteUrl: input.property, languageCode: "es-ES" }));
  const result = ((data.inspectionResult as Record<string, unknown> | undefined)?.indexStatusResult ?? {}) as Record<string, unknown>;
  const crawled = str(result.lastCrawlTime);
  return {
    verdict: str(result.verdict),
    coverageState: str(result.coverageState),
    indexingState: str(result.indexingState),
    robotsState: str(result.robotsTxtState),
    fetchState: str(result.pageFetchState),
    googleCanonical: str(result.googleCanonical),
    userCanonical: str(result.userCanonical),
    lastCrawlAt: crawled && Number.isFinite(Date.parse(crawled)) ? new Date(crawled) : null,
  };
}
