import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import crypto from 'node:crypto';
import http from 'node:http';
import https from 'node:https';
import { join } from 'node:path';
import express from 'express';
import {
  BRAND_NAME,
  getImageSitemapEntries,
  getPublicRouteEntries,
  STUDIO_BASE_PATH,
  type MarketingLocale,
} from './app/content/marketing-content';

type GlobalSite = {
  id: string;
  key: string;
  name: string;
  type: string;
  baseUrl: string | null;
  tenantId: string;
  role: 'admin' | 'editor' | 'viewer';
  permissions: string[];
};

type GlobalSessionEntry = {
  tenantId: string;
  studioUserId: string;
  sessionToken: string;
  permissions: string[];
};

type SessionPayload = {
  authMode: 'api_key' | 'human' | 'oidc';
  apiKey?: string;
  sessionToken?: string;
  user?: {
    id: string;
    email: string;
    displayName: string;
    avatarUrl: string | null;
  };
  sessions?: GlobalSessionEntry[];
  sites?: GlobalSite[];
  activeSiteId?: string | null;
};

type StudioSessionView = {
  user: {
    id: string;
    email: string;
    displayName: string;
    avatarUrl: string | null;
  };
  role: 'admin' | 'editor' | 'viewer';
  sites: Array<{
    id: string;
    key: string;
    name: string;
    type: string;
    baseUrl: string | null;
    role: 'admin' | 'editor' | 'viewer';
  }>;
  activeSiteId: string | null;
};

type GlobalLoginResponse = {
  user: SessionPayload['user'];
  sites: GlobalSite[];
  sessions: GlobalSessionEntry[];
  activeSiteId: string | null;
};

type HumanAuthMode = 'oidc' | 'password' | 'google' | 'launch';

type SessionResponse = {
  tenant: {
    id: string;
    name: string;
    slug?: string | null;
    status: string;
  };
  authMode?: 'api_key' | HumanAuthMode;
  user?: {
    id: string;
    email: string;
    displayName: string;
    avatarUrl: string | null;
    status: string;
    lastLoginAt: string | null;
  };
  roles?: string[];
  permissions?: string[];
  identityProvider?: {
    enabled: boolean;
    issuer: string | null;
    provisioningMode: string;
  } | null;
  siteCount: number;
  projectCount: number;
};

type InternalIdentityProvider = {
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  enabled: boolean;
  issuer: string;
  clientId: string;
  clientSecret: string | null;
  scopes: string;
  claimMappings: Record<string, unknown> | null;
  provisioningMode: string;
};

type WorkspaceAccessResponse = {
  workspace: {
    id: string;
    name: string;
    slug: string;
    status: string;
  };
  authMode: 'api_key' | 'oidc';
  apiKeyFallback: boolean;
  identityProvider: {
    configured: boolean;
    enabled: boolean;
    issuer: string | null;
    provisioningMode: string | null;
  };
};

type LoginWorkspaceSummary = {
  workspace: {
    id: string;
    name: string;
    slug: string | null;
    status: string;
  };
  membershipStatus: string;
  requiresSso: boolean;
  preferred: boolean;
};

type LoginOptionsResponse = {
  email: string;
  account: {
    id: string;
    email: string;
    displayName: string | null;
    avatarUrl: string | null;
    status: 'invited' | 'active' | 'suspended';
    lastWorkspaceId: string | null;
    emailVerifiedAt: string | null;
  } | null;
  accountState: 'invited' | 'active' | 'suspended' | 'no_access';
  canUsePassword: boolean;
  canUseGoogle: boolean;
  googleClientId: string | null;
  needsActivation: boolean;
  localWorkspaces: LoginWorkspaceSummary[];
  ssoWorkspaces: LoginWorkspaceSummary[];
  recommendedWorkspaceId: string | null;
  requestAccessUrl: string;
};

type LaunchTicketResponse = {
  launchId: string;
  tenantSlug: string;
  returnTo: string;
};

type RedeemedLaunchResponse = {
  sessionToken: string;
  session: SessionResponse;
  tenantSlug: string;
  returnTo: string;
};

type InternalValidatedSession = {
  sessionId: string;
  tenantId: string;
  userId: string;
  permissions: string[];
  session: SessionResponse;
};

type AuthStatePayload = {
  state: string;
  nonce: string;
  workspaceSlug: string;
  returnTo: string;
  issuer: string;
  clientId: string;
  clientSecret: string | null;
  scopes: string;
  codeVerifier: string;
};

const browserDistFolder = join(import.meta.dirname, '../browser');
const app = express();

app.set('trust proxy', 1);

const studioBasePath = normalizeBasePath(process.env['STUDIO_BASE_PATH'] || STUDIO_BASE_PATH);
const sessionCookieName = process.env['STUDIO_COOKIE_NAME'] || 'studio_session';
const authStateCookieName = process.env['STUDIO_AUTH_STATE_COOKIE_NAME'] || 'studio_auth_state';
const sessionSecret = process.env['STUDIO_SESSION_SECRET'] || 'studio-dev-secret-change-me';
const cookieKey = crypto.createHash('sha256').update(sessionSecret).digest();
const backendBaseUrl = new URL(
  process.env['STUDIO_API_INTERNAL_URL'] || 'http://127.0.0.1:3000',
);
const backendInternalSecret =
  process.env['STUDIO_PROXY_SHARED_SECRET'] || 'studio-proxy-dev-secret-change-me';
const launchClientId = process.env['STUDIO_LAUNCH_CLIENT_ID'] || 'webtecnoria';
const launchSharedSecret =
  process.env['STUDIO_LAUNCH_SHARED_SECRET'] || 'studio-launch-dev-secret-change-me';
const opsLoginEnabled = ['1', 'true', 'yes', 'on'].includes(
  String(process.env['STUDIO_ENABLE_OPS_LOGIN'] || 'false').trim().toLowerCase(),
);
const angularApp = new AngularNodeAppEngine({
  allowedHosts: getAllowedHosts(),
});
const LAUNCH_CLIENT_HEADER = 'x-launch-client';
const LAUNCH_TIMESTAMP_HEADER = 'x-launch-timestamp';
const LAUNCH_SIGNATURE_HEADER = 'x-launch-signature';

function resolveStudioReturnTo(value: unknown): string {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return normalized.startsWith(`${studioBasePath}/`) ? normalized : `${studioBasePath}/overview`;
}

function normalizeBasePath(value: string): string {
  const normalized = value.trim().replace(/\/+$/, '');
  return normalized.startsWith('/') ? normalized : `/${normalized}`;
}

function getAllowedHosts(): string[] {
  const configured = process.env['STUDIO_ALLOWED_HOSTS']?.trim();
  if (!configured) {
    return ['127.0.0.1', 'localhost'];
  }

  return configured
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function readHeaderValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

function constantTimeEquals(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function buildLaunchSignature(timestamp: string, rawBody: string): string {
  return crypto
    .createHmac('sha256', launchSharedSecret)
    .update(`${timestamp}.${rawBody}`)
    .digest('base64url');
}

function isLaunchTimestampFresh(timestamp: string): boolean {
  const parsed = Number.parseInt(timestamp, 10);
  if (Number.isNaN(parsed)) {
    return false;
  }

  return Math.abs(Date.now() - parsed) <= 60 * 1000;
}

function readLaunchHeader(req: express.Request, name: string): string {
  const value = req.headers[name];
  if (Array.isArray(value)) {
    return String(value[0] || '').trim();
  }
  return String(value || '').trim();
}

function splitForwardedValue(value: string | null | undefined): string | undefined {
  return value?.split(',')[0]?.trim() || undefined;
}

function getRequestOrigin(req: express.Request): string {
  const protocol =
    splitForwardedValue(readHeaderValue(req.headers['x-forwarded-proto'])) ||
    (req.secure ? 'https' : 'http');
  const host =
    splitForwardedValue(readHeaderValue(req.headers['x-forwarded-host'])) ||
    readHeaderValue(req.headers.host) ||
    '127.0.0.1:4400';

  return `${protocol}://${host}`.replace(/\/$/, '');
}

function buildSitemapIndexXml(origin: string): string {
  const lastModified = new Date().toISOString();
  const sitemaps = ['/sitemap-en.xml', '/sitemap-es.xml', '/sitemap-images.xml'].map((path) => {
    const loc = `${origin}${path}`;
    return [
      '  <sitemap>',
      `    <loc>${escapeXml(loc)}</loc>`,
      `    <lastmod>${lastModified}</lastmod>`,
      '  </sitemap>',
    ].join('\n');
  }).join('\n');

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    sitemaps,
    '</sitemapindex>',
  ].join('\n');
}

function buildLocalizedSitemapXml(origin: string, locale: MarketingLocale): string {
  const lastModified = new Date().toISOString();
  const urls = getPublicRouteEntries()
    .filter((entry) => entry.locale === locale)
    .map((entry) => {
      const loc = entry.path === '/' ? `${origin}/` : `${origin}${entry.path}`;
      return [
        '  <url>',
        `    <loc>${escapeXml(loc)}</loc>`,
        `    <lastmod>${lastModified}</lastmod>`,
        `    <changefreq>${entry.changefreq}</changefreq>`,
        `    <priority>${entry.priority.toFixed(1)}</priority>`,
        '  </url>',
      ].join('\n');
    })
    .join('\n');

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    urls,
    '</urlset>',
  ].join('\n');
}

function buildImageSitemapXml(origin: string): string {
  const lastModified = new Date().toISOString();
  const urls = getImageSitemapEntries()
    .map((entry) => {
      const loc = entry.path === '/' ? `${origin}/` : `${origin}${entry.path}`;
      const images = entry.images
        .map((image) =>
          [
            '    <image:image>',
            `      <image:loc>${escapeXml(`${origin}${image.path}`)}</image:loc>`,
            `      <image:title>${escapeXml(image.title)}</image:title>`,
            `      <image:caption>${escapeXml(image.caption)}</image:caption>`,
            '    </image:image>',
          ].join('\n'),
        )
        .join('\n');

      return [
        '  <url>',
        `    <loc>${escapeXml(loc)}</loc>`,
        `    <lastmod>${lastModified}</lastmod>`,
        images,
        '  </url>',
      ].join('\n');
    })
    .join('\n');

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"',
    '        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">',
    urls,
    '</urlset>',
  ].join('\n');
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  if (!cookieHeader) {
    return {};
  }

  return cookieHeader
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce<Record<string, string>>((accumulator, item) => {
      const index = item.indexOf('=');
      if (index === -1) {
        return accumulator;
      }
      const key = item.slice(0, index).trim();
      const value = item.slice(index + 1).trim();
      accumulator[key] = decodeURIComponent(value);
      return accumulator;
    }, {});
}

function encryptPayload(payload: unknown): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', cookieKey, iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(payload), 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    'v1',
    iv.toString('base64url'),
    tag.toString('base64url'),
    encrypted.toString('base64url'),
  ].join('.');
}

function decryptPayload<T>(value: string | undefined): T | null {
  if (!value) {
    return null;
  }

  try {
    const [version, ivPart, tagPart, encryptedPart] = value.split('.');
    if (version !== 'v1' || !ivPart || !tagPart || !encryptedPart) {
      return null;
    }

    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      cookieKey,
      Buffer.from(ivPart, 'base64url'),
    );
    decipher.setAuthTag(Buffer.from(tagPart, 'base64url'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encryptedPart, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
    return JSON.parse(decrypted) as T;
  } catch {
    return null;
  }
}

function encryptSession(payload: SessionPayload): string {
  return encryptPayload(payload);
}

function decryptSession(value: string | undefined): SessionPayload | null {
  const payload = decryptPayload<SessionPayload>(value);
  if (!payload) {
    return null;
  }

  if (payload.authMode === 'api_key' && payload.apiKey?.trim()) {
    return {
      authMode: 'api_key',
      apiKey: payload.apiKey.trim(),
    };
  }

  if (
    (payload.authMode === 'human' || payload.authMode === 'oidc') &&
    Array.isArray(payload.sessions) &&
    payload.sessions.length > 0
  ) {
    return {
      authMode: payload.authMode,
      user: payload.user,
      sessions: payload.sessions,
      sites: Array.isArray(payload.sites) ? payload.sites : [],
      activeSiteId: payload.activeSiteId ?? payload.sites?.[0]?.id ?? null,
    };
  }

  if ((payload.authMode === 'oidc' || payload.authMode === 'human') && payload.sessionToken?.trim()) {
    return {
      authMode: payload.authMode,
      sessionToken: payload.sessionToken.trim(),
    };
  }

  return null;
}

function encryptAuthState(payload: AuthStatePayload): string {
  return encryptPayload(payload);
}

function decryptAuthState(value: string | undefined): AuthStatePayload | null {
  const payload = decryptPayload<AuthStatePayload>(value);
  if (!payload?.state || !payload.workspaceSlug || !payload.issuer || !payload.clientId) {
    return null;
  }
  return payload;
}

function shouldUseSecureCookie(req: express.Request): boolean {
  const explicit = process.env['STUDIO_COOKIE_SECURE'];
  if (explicit) {
    return ['1', 'true', 'yes', 'on'].includes(explicit.trim().toLowerCase());
  }

  return process.env['NODE_ENV'] === 'production' || req.secure;
}

function setSessionCookie(
  res: express.Response,
  req: express.Request,
  payload: SessionPayload,
): void {
  const parts = [
    `${sessionCookieName}=${encodeURIComponent(encryptSession(payload))}`,
    `Path=${studioBasePath}`,
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${60 * 60 * 12}`,
  ];

  if (shouldUseSecureCookie(req)) {
    parts.push('Secure');
  }

  res.append('Set-Cookie', parts.join('; '));
}

function clearSessionCookie(res: express.Response, req: express.Request): void {
  const parts = [
    `${sessionCookieName}=`,
    `Path=${studioBasePath}`,
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0',
  ];

  if (shouldUseSecureCookie(req)) {
    parts.push('Secure');
  }

  res.append('Set-Cookie', parts.join('; '));
}

function readSession(req: express.Request): SessionPayload | null {
  const cookies = parseCookies(req.headers.cookie);
  return decryptSession(cookies[sessionCookieName]);
}

function setAuthStateCookie(
  res: express.Response,
  req: express.Request,
  payload: AuthStatePayload,
): void {
  const parts = [
    `${authStateCookieName}=${encodeURIComponent(encryptAuthState(payload))}`,
    `Path=${studioBasePath}`,
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${10 * 60}`,
  ];

  if (shouldUseSecureCookie(req)) {
    parts.push('Secure');
  }

  res.append('Set-Cookie', parts.join('; '));
}

function clearAuthStateCookie(res: express.Response, req: express.Request): void {
  const parts = [
    `${authStateCookieName}=`,
    `Path=${studioBasePath}`,
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0',
  ];

  if (shouldUseSecureCookie(req)) {
    parts.push('Secure');
  }

  res.append('Set-Cookie', parts.join('; '));
}

function readAuthState(req: express.Request): AuthStatePayload | null {
  const cookies = parseCookies(req.headers.cookie);
  return decryptAuthState(cookies[authStateCookieName]);
}

function getInternalHeaders(): Record<string, string> {
  return {
    'x-studio-internal-secret': backendInternalSecret,
  };
}

function buildRedirectUri(req: express.Request): string {
  return `${getRequestOrigin(req)}${studioBasePath}/api/auth/sso/callback`;
}

function randomBase64Url(byteLength: number): string {
  return crypto.randomBytes(byteLength).toString('base64url');
}

function buildPkceChallenge(verifier: string): string {
  return crypto.createHash('sha256').update(verifier).digest('base64url');
}

function buildProxySignature(input: {
  method: string;
  url: string;
  tenantId: string;
  userId: string;
  sessionId: string;
  permissions: string[];
  timestamp: string;
}): string {
  const payload = [
    input.method.toUpperCase(),
    input.url,
    input.tenantId,
    input.userId,
    input.sessionId,
    input.permissions.join(','),
    input.timestamp,
  ].join('\n');

  return crypto
    .createHmac('sha256', backendInternalSecret)
    .update(payload)
    .digest('base64url');
}

async function validateApiKey(apiKey: string): Promise<SessionResponse | null> {
  try {
    const response = await fetch(new URL('/v2/session/me', backendBaseUrl), {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as SessionResponse;
  } catch {
    return null;
  }
}

async function fetchInternalIdentityProvider(
  workspaceSlug: string,
): Promise<InternalIdentityProvider | null> {
  const response = await fetch(
    new URL(`/internal/identity-provider/${encodeURIComponent(workspaceSlug)}`, backendBaseUrl),
    {
      headers: getInternalHeaders(),
    },
  );

  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new Error(`identity_provider_lookup_failed:${response.status}`);
  }

  return (await response.json()) as InternalIdentityProvider;
}

async function fetchInternalWorkspaceAccess(
  workspaceSlug: string,
): Promise<WorkspaceAccessResponse | null> {
  const response = await fetch(
    new URL(`/internal/workspace-access/${encodeURIComponent(workspaceSlug)}`, backendBaseUrl),
    {
      headers: getInternalHeaders(),
    },
  );

  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new Error(`workspace_access_lookup_failed:${response.status}`);
  }

  const payload = await response.json() as {
    tenantId: string;
    tenantName: string;
    tenantSlug: string;
    tenantStatus: string;
    authMode: 'api_key' | 'oidc';
    apiKeyFallback: boolean;
    identityProvider: {
      configured: boolean;
      enabled: boolean;
      issuer: string | null;
      provisioningMode: string | null;
    };
  };

  return {
    workspace: {
      id: payload.tenantId,
      name: payload.tenantName,
      slug: payload.tenantSlug,
      status: payload.tenantStatus,
    },
    authMode: payload.authMode,
    apiKeyFallback: payload.apiKeyFallback,
    identityProvider: payload.identityProvider,
  };
}

async function postInternalAuth<TResponse extends object>(
  path: string,
  body: Record<string, unknown>,
): Promise<TResponse> {
  const response = await fetch(new URL(path, backendBaseUrl), {
    method: 'POST',
    headers: {
      ...getInternalHeaders(),
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const payload = (await response.json()) as TResponse | { error?: string; message?: string };
  if (!response.ok) {
    const error = new Error(
      ('message' in payload && payload.message) || 'auth_request_failed',
    ) as Error & { status?: number };
    error.status = response.status;
    throw error;
  }

  return payload as TResponse;
}

async function requestInternalLoginOptions(email: string): Promise<LoginOptionsResponse> {
  return postInternalAuth<LoginOptionsResponse>('/internal/login/options', { email });
}

async function requestInternalPasswordLogin(input: {
  email: string;
  password: string;
  workspaceId?: string | null;
}): Promise<{ sessionToken: string; session: SessionResponse }> {
  return postInternalAuth<{ sessionToken: string; session: SessionResponse }>(
    '/internal/login/password',
    input,
  );
}

async function requestInternalGoogleLogin(input: {
  credential: string;
  emailHint?: string | null;
  workspaceId?: string | null;
}): Promise<{ sessionToken: string; session: SessionResponse }> {
  return postInternalAuth<{ sessionToken: string; session: SessionResponse }>(
    '/internal/login/google',
    input,
  );
}

async function requestInternalPasswordForgot(email: string): Promise<{ ok: true }> {
  return postInternalAuth<{ ok: true }>('/internal/password/forgot', { email });
}

async function requestInternalPasswordReset(input: {
  token: string;
  password: string;
}): Promise<{ ok: true }> {
  return postInternalAuth<{ ok: true }>('/internal/password/reset', input);
}

async function requestInternalInvitationAccept(input: {
  token: string;
  password: string;
  workspaceId?: string | null;
}): Promise<{ sessionToken: string; session: SessionResponse }> {
  return postInternalAuth<{ sessionToken: string; session: SessionResponse }>(
    '/internal/invitations/accept',
    input,
  );
}

async function createInternalLaunchTicket(input: {
  workspace: string;
  email: string;
  displayName?: string | null;
  returnTo: string;
  sourceApp: 'webtecnoria';
}): Promise<LaunchTicketResponse> {
  const response = await fetch(new URL('/internal/launch-tickets', backendBaseUrl), {
    method: 'POST',
    headers: {
      ...getInternalHeaders(),
      'content-type': 'application/json',
    },
    body: JSON.stringify(input),
  });

  const payload = (await response.json()) as
    | LaunchTicketResponse
    | { error?: string; message?: string };

  if (!response.ok || !('launchId' in payload)) {
    throw new Error(
      ('message' in payload && payload.message) || 'launch_ticket_create_failed',
    );
  }

  return payload;
}

async function redeemInternalLaunchTicket(launchId: string): Promise<RedeemedLaunchResponse> {
  const response = await fetch(new URL('/internal/launch-tickets/redeem', backendBaseUrl), {
    method: 'POST',
    headers: {
      ...getInternalHeaders(),
      'content-type': 'application/json',
    },
    body: JSON.stringify({ launchId }),
  });

  const payload = (await response.json()) as
    | RedeemedLaunchResponse
    | { error?: string; message?: string };

  if (!response.ok || !('sessionToken' in payload)) {
    throw new Error(
      ('message' in payload && payload.message) || 'launch_ticket_redeem_failed',
    );
  }

  return payload;
}

async function validateSessionToken(
  sessionToken: string,
): Promise<InternalValidatedSession | null> {
  const cached = sessionValidationCache.get(sessionToken);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  try {
    const response = await fetch(new URL('/internal/session/validate', backendBaseUrl), {
      method: 'POST',
      headers: {
        ...getInternalHeaders(),
        'content-type': 'application/json',
      },
      body: JSON.stringify({ sessionToken }),
    });

    if (!response.ok) {
      return null;
    }

    const value = (await response.json()) as InternalValidatedSession;
    sessionValidationCache.set(sessionToken, {
      value,
      expiresAt: Date.now() + 60_000,
    });
    return value;
  } catch {
    return null;
  }
}

const sessionValidationCache = new Map<
  string,
  { value: InternalValidatedSession; expiresAt: number }
>();

function buildSessionView(payload: SessionPayload): StudioSessionView {
  const sites = (payload.sites ?? []).map((site) => ({
    id: site.id,
    key: site.key,
    name: site.name,
    type: site.type,
    baseUrl: site.baseUrl,
    role: site.role,
  }));

  const activeSite = sites.find((site) => site.id === payload.activeSiteId) ?? sites[0] ?? null;
  const role =
    activeSite?.role ??
    sites.reduce<'admin' | 'editor' | 'viewer'>((best, site) => {
      if (best === 'admin' || site.role === 'admin') {
        return 'admin';
      }
      if (best === 'editor' || site.role === 'editor') {
        return 'editor';
      }
      return 'viewer';
    }, 'viewer');

  return {
    user: payload.user ?? {
      id: 'legacy-session',
      email: '',
      displayName: 'Session',
      avatarUrl: null,
    },
    role,
    sites,
    activeSiteId: activeSite?.id ?? null,
  };
}

function resolveRequestSiteId(req: express.Request): string | null {
  const header = readHeaderValue(req.headers['x-studio-site-id']);
  if (header?.trim()) {
    return header.trim();
  }

  const rawUrl = String(req.originalUrl || '');
  try {
    const query = new URL(rawUrl, 'http://local').searchParams.get('siteId');
    if (query?.trim()) {
      return query.trim();
    }
  } catch {
    // Ignore malformed URLs.
  }

  return null;
}

function resolveTargetSite(
  payload: SessionPayload,
  req: express.Request,
): GlobalSite | null {
  const sites = payload.sites ?? [];
  if (sites.length === 0) {
    return null;
  }

  const requested = resolveRequestSiteId(req);
  if (requested) {
    return sites.find((site) => site.id === requested) ?? null;
  }

  return sites.find((site) => site.id === payload.activeSiteId) ?? sites[0] ?? null;
}

async function revokeSessionToken(sessionToken: string): Promise<void> {
  try {
    await fetch(new URL('/internal/session/revoke', backendBaseUrl), {
      method: 'POST',
      headers: {
        ...getInternalHeaders(),
        'content-type': 'application/json',
      },
      body: JSON.stringify({ sessionToken }),
    });
  } catch {
    // Best-effort revocation.
  }
}

async function exchangeOidcSession(input: {
  slug: string;
  issuer: string;
  subject: string;
  claims: Record<string, unknown>;
}): Promise<{ sessionToken: string; session: SessionResponse }> {
  const response = await fetch(new URL('/internal/session/oidc', backendBaseUrl), {
    method: 'POST',
    headers: {
      ...getInternalHeaders(),
      'content-type': 'application/json',
    },
    body: JSON.stringify(input),
  });

  const payload = (await response.json()) as
    | { sessionToken: string; session: SessionResponse }
    | { message?: string };

  if (!response.ok || !('sessionToken' in payload)) {
    throw new Error(('message' in payload && payload.message) || 'oidc_session_exchange_failed');
  }

  return payload;
}

async function discoverOidcConfiguration(issuer: string): Promise<Record<string, unknown>> {
  const url = new URL(
    '/.well-known/openid-configuration',
    issuer.endsWith('/') ? issuer : `${issuer}/`,
  );
  const response = await fetch(url, {
    headers: { accept: 'application/json' },
  });
  if (!response.ok) {
    throw new Error(`oidc_discovery_failed:${response.status}`);
  }

  return (await response.json()) as Record<string, unknown>;
}

function decodeJwtPayload(token: string): Record<string, unknown> {
  const [, payload] = token.split('.');
  if (!payload) {
    throw new Error('id_token_invalid');
  }
  return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Record<string, unknown>;
}

async function resolveStudioSession(
  req: express.Request,
): Promise<
  | {
      payload: SessionPayload;
      session: SessionResponse;
      validatedOidcSession?: InternalValidatedSession;
    }
  | null
> {
  const payload = readSession(req);
  if (!payload) {
    return null;
  }

  if (payload.authMode === 'api_key' && payload.apiKey) {
    const session = await validateApiKey(payload.apiKey);
    if (!session) {
      return null;
    }
    return { payload, session };
  }

  if (
    (payload.authMode === 'human' || payload.authMode === 'oidc') &&
    Array.isArray(payload.sessions)
  ) {
    const site = resolveTargetSite(payload, req);
    if (!site) {
      return null;
    }
    const entry = payload.sessions.find((item) => item.tenantId === site.tenantId);
    if (!entry) {
      return null;
    }

    const validated = await validateSessionToken(entry.sessionToken);
    if (!validated) {
      return null;
    }

    return {
      payload,
      session: validated.session,
      validatedOidcSession: {
        ...validated,
        userId: entry.studioUserId,
        permissions: entry.permissions,
        tenantId: entry.tenantId,
      },
    };
  }

  if ((payload.authMode === 'oidc' || payload.authMode === 'human') && payload.sessionToken) {
    const validatedOidcSession = await validateSessionToken(payload.sessionToken);
    if (!validatedOidcSession) {
      return null;
    }
    return {
      payload,
      session: validatedOidcSession.session,
      validatedOidcSession,
    };
  }

  return null;
}

function proxyToBackend(): express.RequestHandler {
  return (req, res) => {
    void (async () => {
      const resolved = await resolveStudioSession(req);
      if (!resolved) {
        clearSessionCookie(res, req);
        res.status(401).json({
          error: 'unauthorized',
          message: 'Missing studio session',
        });
        return;
      }

      const relativePath =
        req.originalUrl.slice(`${studioBasePath}/api/backend`.length) || '/';
      const targetUrl = new URL(relativePath, backendBaseUrl);
      const transport = targetUrl.protocol === 'https:' ? https : http;

      const headers: http.OutgoingHttpHeaders = {
        ...req.headers,
        host: targetUrl.host,
        'x-forwarded-host': req.headers.host ?? '',
        'x-forwarded-proto': req.protocol,
      };
      delete headers.cookie;

      if (resolved.payload.authMode === 'api_key' && resolved.payload.apiKey) {
        headers.authorization = `Bearer ${resolved.payload.apiKey}`;
      } else if (resolved.validatedOidcSession) {
        delete headers.authorization;
        const timestamp = String(Date.now());
        const signature = buildProxySignature({
          method: req.method,
          url: relativePath,
          tenantId: resolved.validatedOidcSession.tenantId,
          userId: resolved.validatedOidcSession.userId,
          sessionId: resolved.validatedOidcSession.sessionId,
          permissions: resolved.validatedOidcSession.permissions,
          timestamp,
        });

        headers['x-studio-tenant-id'] = resolved.validatedOidcSession.tenantId;
        headers['x-studio-user-id'] = resolved.validatedOidcSession.userId;
        headers['x-studio-session-id'] = resolved.validatedOidcSession.sessionId;
        headers['x-studio-permissions'] = resolved.validatedOidcSession.permissions.join(',');
        headers['x-studio-timestamp'] = timestamp;
        headers['x-studio-signature'] = signature;
      }

      const upstream = transport.request(
        targetUrl,
        {
          method: req.method,
          headers,
        },
        (upstreamResponse) => {
          res.status(upstreamResponse.statusCode || 502);
          Object.entries(upstreamResponse.headers).forEach(([key, value]) => {
            if (value !== undefined) {
              res.setHeader(key, value as string | string[]);
            }
          });
          upstreamResponse.pipe(res);
        },
      );

      upstream.on('error', (error) => {
        if (!res.headersSent) {
          res.status(503).json({
            error: 'backend_unavailable',
            message: error instanceof Error ? error.message : 'Backend unavailable',
          });
        }
      });

      req.pipe(upstream);
    })().catch((error) => {
      if (!res.headersSent) {
        res.status(500).json({
          error: 'internal_error',
          message: error instanceof Error ? error.message : 'Unexpected error',
        });
      }
    });
  };
}

function isStaticAssetRequest(pathname: string): boolean {
  return /\.[a-z0-9]+$/i.test(pathname);
}

function isStudioPage(pathname: string): boolean {
  return pathname === studioBasePath || pathname.startsWith(`${studioBasePath}/`);
}

function shouldHandleWithAngular(pathname: string): boolean {
  if (pathname.startsWith(`${studioBasePath}/api/`)) {
    return false;
  }
  if (pathname === `${studioBasePath}/health`) {
    return false;
  }
  if (
    pathname === '/robots.txt' ||
    pathname === '/sitemap.xml' ||
    pathname === '/sitemap-en.xml' ||
    pathname === '/sitemap-es.xml' ||
    pathname === '/sitemap-images.xml'
  ) {
    return false;
  }
  if (pathname === '/health' || pathname === '/favicon.ico') {
    return false;
  }
  if (pathname.startsWith('/v1/') || pathname.startsWith('/v2/') || pathname.startsWith('/assets/')) {
    return false;
  }
  return !isStaticAssetRequest(pathname);
}

app.get('/robots.txt', (req, res) => {
  const origin = getRequestOrigin(req);
  res.type('text/plain').send(
    [
      'User-agent: *',
      'Allow: /',
      `Disallow: ${studioBasePath}`,
      `Sitemap: ${origin}/sitemap.xml`,
    ].join('\n'),
  );
});

app.get('/sitemap.xml', (req, res) => {
  res.type('application/xml').send(buildSitemapIndexXml(getRequestOrigin(req)));
});

app.get('/sitemap-en.xml', (req, res) => {
  res.type('application/xml').send(buildLocalizedSitemapXml(getRequestOrigin(req), 'en'));
});

app.get('/sitemap-es.xml', (req, res) => {
  res.type('application/xml').send(buildLocalizedSitemapXml(getRequestOrigin(req), 'es'));
});

app.get('/sitemap-images.xml', (req, res) => {
  res.type('application/xml').send(buildImageSitemapXml(getRequestOrigin(req)));
});

app.get(`${studioBasePath}/health`, (_req, res) => {
  res.json({
    ok: true,
    service: 'content-studio-web',
    brand: BRAND_NAME,
    timestamp: new Date().toISOString(),
  });
});

app.get('/login', (_req, res, next) => {
  // Canonical login is rendered by Angular directly; no server redirect.
  next();
});

app.get(`${studioBasePath}/api/session/workspace`, (req, res) => {
  void (async () => {
    const workspace = String(req.query['workspace'] || '').trim();
    if (!workspace) {
      res.status(400).json({
        error: 'bad_request',
        message: 'workspace is required',
      });
      return;
    }

    const access = await fetchInternalWorkspaceAccess(workspace);
    if (!access) {
      res.status(404).json({
        error: 'not_found',
        message: 'Workspace not found',
      });
      return;
    }

    res.json(access);
  })().catch((error) => {
    res.status(500).json({
      error: 'internal_error',
      message: error instanceof Error ? error.message : 'Unexpected error',
    });
  });
});

app.get(`${studioBasePath}/api/auth/providers`, (_req, res) => {
  void (async () => {
    const response = await fetch(new URL('/internal/auth/providers', backendBaseUrl), {
      headers: getInternalHeaders(),
    });

    if (!response.ok) {
      res.status(502).json({ error: 'backend_unavailable', message: 'providers unavailable' });
      return;
    }

    res.json(await response.json());
  })().catch(() => {
    res.status(502).json({ error: 'backend_unavailable', message: 'providers unavailable' });
  });
});

app.post(`${studioBasePath}/api/auth/login/options`, express.json({ limit: '16kb' }), (req, res) => {
  void (async () => {
    const email = String((req.body as { email?: string } | undefined)?.email || '').trim();
    if (!email) {
      res.status(400).json({
        error: 'bad_request',
        message: 'email_required',
      });
      return;
    }

    const options = await requestInternalLoginOptions(email);
    res.json(options);
  })().catch((error: Error & { status?: number }) => {
    res.status(error.status || 500).json({
      error: error.status && error.status < 500 ? 'auth_error' : 'internal_error',
      message: error.message || 'Unexpected error',
    });
  });
});

app.post(`${studioBasePath}/api/auth/login/password`, express.json({ limit: '32kb' }), (req, res) => {
  void (async () => {
    const body = req.body as
      | {
          email?: string;
          password?: string;
          workspaceId?: string | null;
        }
      | undefined;

    const result = await postInternalAuth<GlobalLoginResponse>(
      '/internal/session/global-login/password',
      {
        email: String(body?.email || '').trim(),
        password: String(body?.password || ''),
      },
    );

    const payload: SessionPayload = {
      authMode: 'human',
      user: result.user,
      sessions: result.sessions,
      sites: result.sites,
      activeSiteId: result.activeSiteId,
    };

    setSessionCookie(res, req, payload);
    res.json(buildSessionView(payload));
  })().catch((error: Error & { status?: number }) => {
    res.status(error.status || 500).json({
      error: error.status && error.status < 500 ? 'auth_error' : 'internal_error',
      message: error.message || 'Unexpected error',
    });
  });
});

app.post(`${studioBasePath}/api/auth/login/google`, express.json({ limit: '32kb' }), (req, res) => {
  void (async () => {
    const body = req.body as
      | {
          credential?: string;
          emailHint?: string | null;
          workspaceId?: string | null;
        }
      | undefined;

    const result = await postInternalAuth<GlobalLoginResponse>(
      '/internal/session/global-login/google',
      {
        credential: String(body?.credential || '').trim(),
        emailHint: body?.emailHint ? String(body.emailHint).trim() : null,
      },
    );

    const payload: SessionPayload = {
      authMode: 'human',
      user: result.user,
      sessions: result.sessions,
      sites: result.sites,
      activeSiteId: result.activeSiteId,
    };

    setSessionCookie(res, req, payload);
    res.json(buildSessionView(payload));
  })().catch((error: Error & { status?: number }) => {
    res.status(error.status || 500).json({
      error: error.status && error.status < 500 ? 'auth_error' : 'internal_error',
      message: error.message || 'Unexpected error',
    });
  });
});

app.post(`${studioBasePath}/api/auth/password/forgot`, express.json({ limit: '16kb' }), (req, res) => {
  void (async () => {
    const email = String((req.body as { email?: string } | undefined)?.email || '').trim();
    await requestInternalPasswordForgot(email);
    res.json({ ok: true });
  })().catch((error: Error & { status?: number }) => {
    res.status(error.status || 500).json({
      error: error.status && error.status < 500 ? 'auth_error' : 'internal_error',
      message: error.message || 'Unexpected error',
    });
  });
});

app.post(`${studioBasePath}/api/auth/password/reset`, express.json({ limit: '32kb' }), (req, res) => {
  void (async () => {
    const body = req.body as { token?: string; password?: string } | undefined;
    const result = await requestInternalPasswordReset({
      token: String(body?.token || '').trim(),
      password: String(body?.password || ''),
    });
    res.json(result);
  })().catch((error: Error & { status?: number }) => {
    res.status(error.status || 500).json({
      error: error.status && error.status < 500 ? 'auth_error' : 'internal_error',
      message: error.message || 'Unexpected error',
    });
  });
});

app.post(`${studioBasePath}/api/auth/invitations/accept`, express.json({ limit: '32kb' }), (req, res) => {
  void (async () => {
    const body = req.body as
      | {
          token?: string;
          password?: string;
          workspaceId?: string | null;
        }
      | undefined;

    const result = await requestInternalInvitationAccept({
      token: String(body?.token || '').trim(),
      password: String(body?.password || ''),
      workspaceId: body?.workspaceId ? String(body.workspaceId).trim() : null,
    });

    setSessionCookie(res, req, {
      authMode: 'human',
      sessionToken: result.sessionToken,
    });
    res.json(result.session);
  })().catch((error: Error & { status?: number }) => {
    res.status(error.status || 500).json({
      error: error.status && error.status < 500 ? 'auth_error' : 'internal_error',
      message: error.message || 'Unexpected error',
    });
  });
});

app.post(`${studioBasePath}/api/session/login`, express.json({ limit: '64kb' }), (req, res) => {
  void (async () => {
    if (!opsLoginEnabled) {
      res.status(404).json({
        error: 'not_found',
        message: 'Ops login is disabled',
      });
      return;
    }

    const apiKey = String((req.body as { apiKey?: string } | undefined)?.apiKey || '').trim();
    const workspace = String((req.body as { workspace?: string } | undefined)?.workspace || '').trim();
    if (!apiKey) {
      res.status(400).json({
        error: 'bad_request',
        message: 'apiKey is required',
      });
      return;
    }

    const session = await validateApiKey(apiKey);
    if (!session) {
      res.status(401).json({
        error: 'unauthorized',
        message: 'Invalid API key',
      });
      return;
    }

    if (workspace) {
      const access = await fetchInternalWorkspaceAccess(workspace);
      if (!access) {
        res.status(404).json({
          error: 'not_found',
          message: 'Workspace not found',
        });
        return;
      }

      if (access.workspace.id !== session.tenant.id) {
        res.status(403).json({
          error: 'workspace_mismatch',
          message: 'The API key does not belong to the selected workspace',
        });
        return;
      }
    }

    setSessionCookie(res, req, { authMode: 'api_key', apiKey });
    res.json(session);
  })().catch((error) => {
    res.status(500).json({
      error: 'internal_error',
      message: error instanceof Error ? error.message : 'Unexpected error',
    });
  });
});

app.post(
  `${studioBasePath}/api/auth/launch-tickets`,
  express.json({
    limit: '16kb',
    verify: (req, _res, buffer) => {
      (req as express.Request & { rawBody?: string }).rawBody = buffer.toString('utf8');
    },
  }),
  (req, res) => {
    void (async () => {
      const client = readLaunchHeader(req, LAUNCH_CLIENT_HEADER);
      const timestamp = readLaunchHeader(req, LAUNCH_TIMESTAMP_HEADER);
      const signature = readLaunchHeader(req, LAUNCH_SIGNATURE_HEADER);
      const rawBody = (req as express.Request & { rawBody?: string }).rawBody || '';

      if (!client || !timestamp || !signature || !rawBody) {
        res.status(401).json({
          error: 'unauthorized',
          message: 'Missing launch signature headers',
        });
        return;
      }

      if (client !== launchClientId || !isLaunchTimestampFresh(timestamp)) {
        res.status(401).json({
          error: 'unauthorized',
          message: 'Invalid launch signature context',
        });
        return;
      }

      const expectedSignature = buildLaunchSignature(timestamp, rawBody);
      if (!constantTimeEquals(signature, expectedSignature)) {
        res.status(401).json({
          error: 'unauthorized',
          message: 'Invalid launch signature',
        });
        return;
      }

      const body = req.body as {
        workspace?: string;
        email?: string;
        displayName?: string | null;
        returnTo?: string;
        sourceApp?: 'webtecnoria';
      };
      const workspace = String(body.workspace || '').trim();
      const email = String(body.email || '').trim().toLowerCase();
      const sourceApp = body.sourceApp === 'webtecnoria' ? body.sourceApp : null;
      const returnTo = resolveStudioReturnTo(body.returnTo);

      if (!workspace || !email || !sourceApp) {
        res.status(400).json({
          error: 'bad_request',
          message: 'workspace, email and sourceApp are required',
        });
        return;
      }

      try {
        const ticket = await createInternalLaunchTicket({
          workspace,
          email,
          displayName: body.displayName?.trim() || null,
          returnTo,
          sourceApp,
        });

        res.json(ticket);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'launch_ticket_create_failed';
        const status =
          message === 'workspace_not_found'
            ? 404
            : [
                  'workspace_launch_not_allowed',
                  'interactive_login_required',
                  'user_not_authorized',
                  'user_suspended',
                ].includes(message)
              ? 403
              : 502;

        res.status(status).json({
          error: status === 502 ? 'upstream_unavailable' : 'launch_denied',
          message,
        });
      }
    })().catch((error) => {
      res.status(500).json({
        error: 'internal_error',
        message: error instanceof Error ? error.message : 'Unexpected error',
      });
    });
  },
);

app.get(`${studioBasePath}/api/auth/sso/start`, (req, res) => {
  void (async () => {
    const workspaceSlug = String(req.query['workspace'] || '').trim();
    const returnTo = resolveStudioReturnTo(req.query['returnTo']);
    if (!workspaceSlug) {
      res.redirect(302, `${studioBasePath}/login?reason=workspace_not_found`);
      return;
    }

    const provider = await fetchInternalIdentityProvider(workspaceSlug);
    if (!provider) {
      res.redirect(302, `${studioBasePath}/login?reason=workspace_not_found`);
      return;
    }
    if (!provider.enabled) {
      res.redirect(302, `${studioBasePath}/login?reason=identity_provider_not_configured`);
      return;
    }

    const configuration = await discoverOidcConfiguration(provider.issuer);
    const authorizationEndpoint = String(configuration['authorization_endpoint'] || '').trim();
    if (!authorizationEndpoint) {
      throw new Error('oidc_authorization_endpoint_missing');
    }

    const state = randomBase64Url(24);
    const nonce = randomBase64Url(24);
    const codeVerifier = randomBase64Url(48);
    const redirectUri = buildRedirectUri(req);
    const authState: AuthStatePayload = {
      state,
      nonce,
      workspaceSlug,
      returnTo,
      issuer: provider.issuer,
      clientId: provider.clientId,
      clientSecret: provider.clientSecret,
      scopes: provider.scopes || 'openid profile email',
      codeVerifier,
    };

    setAuthStateCookie(res, req, authState);

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: provider.clientId,
      redirect_uri: redirectUri,
      scope: provider.scopes || 'openid profile email',
      state,
      nonce,
      code_challenge_method: 'S256',
      code_challenge: buildPkceChallenge(codeVerifier),
    });

    res.redirect(302, `${authorizationEndpoint}?${params.toString()}`);
  })().catch((error) => {
    res.redirect(
      302,
      `${studioBasePath}/login?reason=${encodeURIComponent(
        error instanceof Error ? error.message : 'sso_start_failed',
      )}`,
    );
  });
});

app.get(`${studioBasePath}/api/auth/sso/callback`, (req, res) => {
  void (async () => {
    const authState = readAuthState(req);
    const state = String(req.query['state'] || '');
    const code = String(req.query['code'] || '');
    const errorParam = String(req.query['error'] || '');

    if (errorParam) {
      clearAuthStateCookie(res, req);
      res.redirect(
        302,
        `${studioBasePath}/login?reason=${encodeURIComponent(errorParam)}`,
      );
      return;
    }

    if (!authState || !state || !code || authState.state !== state) {
      clearAuthStateCookie(res, req);
      res.redirect(302, `${studioBasePath}/login?reason=session_expired`);
      return;
    }

    const configuration = await discoverOidcConfiguration(authState.issuer);
    const tokenEndpoint = String(configuration['token_endpoint'] || '').trim();
    const userInfoEndpoint = String(configuration['userinfo_endpoint'] || '').trim();
    if (!tokenEndpoint) {
      throw new Error('oidc_token_endpoint_missing');
    }

    const tokenParams = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: buildRedirectUri(req),
      client_id: authState.clientId,
      code_verifier: authState.codeVerifier,
    });
    if (authState.clientSecret) {
      tokenParams.set('client_secret', authState.clientSecret);
    }

    const tokenResponse = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        accept: 'application/json',
      },
      body: tokenParams.toString(),
    });
    const tokenPayload = (await tokenResponse.json()) as Record<string, unknown>;
    if (!tokenResponse.ok) {
      throw new Error(String(tokenPayload['error'] || 'oidc_token_exchange_failed'));
    }

    const accessToken =
      typeof tokenPayload['access_token'] === 'string' ? tokenPayload['access_token'] : '';
    const idToken = typeof tokenPayload['id_token'] === 'string' ? tokenPayload['id_token'] : '';

    let claims: Record<string, unknown> | null = null;
    if (userInfoEndpoint && accessToken) {
      const userInfoResponse = await fetch(userInfoEndpoint, {
        headers: {
          authorization: `Bearer ${accessToken}`,
          accept: 'application/json',
        },
      });
      if (userInfoResponse.ok) {
        claims = (await userInfoResponse.json()) as Record<string, unknown>;
      }
    }

    if (!claims && idToken) {
      claims = decodeJwtPayload(idToken);
    }
    if (!claims) {
      throw new Error('oidc_claims_unavailable');
    }

    const subject = typeof claims['sub'] === 'string' ? claims['sub'].trim() : '';
    if (!subject) {
      throw new Error('oidc_subject_missing');
    }

    const studioSession = await exchangeOidcSession({
      slug: authState.workspaceSlug,
      issuer: authState.issuer,
      subject,
      claims,
    });

    clearAuthStateCookie(res, req);
    setSessionCookie(res, req, {
      authMode: 'human',
      sessionToken: studioSession.sessionToken,
    });
    res.redirect(302, authState.returnTo);
  })().catch((error) => {
    clearAuthStateCookie(res, req);
    res.redirect(
      302,
      `${studioBasePath}/login?reason=${encodeURIComponent(
        error instanceof Error ? error.message : 'sso_callback_failed',
      )}`,
    );
  });
});

app.post(`${studioBasePath}/api/session/logout`, (req, res) => {
  void (async () => {
    const session = readSession(req);
    if ((session?.authMode === 'oidc' || session?.authMode === 'human') && session.sessionToken) {
      await revokeSessionToken(session.sessionToken);
    }

    clearAuthStateCookie(res, req);
    clearSessionCookie(res, req);
    res.json({ ok: true });
  })().catch((error) => {
    res.status(500).json({
      error: 'internal_error',
      message: error instanceof Error ? error.message : 'Unexpected error',
    });
  });
});

app.get(`${studioBasePath}/api/session/me`, (req, res) => {
  void (async () => {
    const resolved = await resolveStudioSession(req);
    if (!resolved) {
      clearSessionCookie(res, req);
      res.status(401).json({
        error: 'unauthorized',
        message: 'Missing studio session',
      });
      return;
    }

    res.json(buildSessionView(resolved.payload));
  })().catch((error) => {
    res.status(500).json({
      error: 'internal_error',
      message: error instanceof Error ? error.message : 'Unexpected error',
    });
  });
});

app.post(
  `${studioBasePath}/api/session/active-site`,
  express.json({ limit: '16kb' }),
  (req, res) => {
    const payload = readSession(req);
    if (!payload || !Array.isArray(payload.sites)) {
      res.status(401).json({ error: 'unauthorized', message: 'Missing studio session' });
      return;
    }

    const siteId = String((req.body as { siteId?: string } | undefined)?.siteId || '').trim();
    const site = payload.sites.find((item) => item.id === siteId);
    if (!site) {
      res.status(400).json({ error: 'bad_request', message: 'site_not_authorized' });
      return;
    }

    const nextPayload: SessionPayload = {
      ...payload,
      activeSiteId: site.id,
    };
    setSessionCookie(res, req, nextPayload);
    res.json(buildSessionView(nextPayload));
  },
);

app.get(`${studioBasePath}/api/sites`, (req, res) => {
  const payload = readSession(req);
  if (!payload) {
    res.status(401).json({ error: 'unauthorized', message: 'Missing studio session' });
    return;
  }

  res.json({ items: buildSessionView(payload).sites });
});

app.use(`${studioBasePath}/api/backend`, proxyToBackend());
app.use(
  express.static(browserDistFolder, {
    maxAge: '1y',
    index: false,
    redirect: false,
  }),
);

app.use((req, res, next) => {
  void (async () => {
    req.headers['x-studio-internal-origin'] = `http://127.0.0.1:${process.env['PORT'] || '4400'}`;

    const pathname = new URL(req.originalUrl, 'http://localhost').pathname;
    if (!shouldHandleWithAngular(pathname)) {
      next();
      return;
    }

    if (isStudioPage(pathname)) {
      const isLoginRoute = pathname === `${studioBasePath}/login`;
      const isOpsLoginRoute = pathname === `${studioBasePath}/ops-login`;
      const forceLoginView =
        isLoginRoute && String(req.query['entry'] || '').trim().toLowerCase() === 'public';
      const rawSession = readSession(req);
      const validatedSession = await resolveStudioSession(req);
      const requestedStudioPath = resolveStudioReturnTo(req.originalUrl);
      const returnTo = resolveStudioReturnTo(
        typeof req.query['returnTo'] === 'string' ? req.query['returnTo'] : undefined,
      );

      if (isOpsLoginRoute && !opsLoginEnabled) {
        res.status(404).type('text/plain').send('Not found');
        return;
      }

      if (isLoginRoute) {
        const launchId = String(req.query['launch'] || '').trim();
        if (launchId) {
          try {
            const redeemed = await redeemInternalLaunchTicket(launchId);
            clearAuthStateCookie(res, req);
            setSessionCookie(res, req, {
              authMode: 'human',
              sessionToken: redeemed.sessionToken,
            });
            res.redirect(302, redeemed.returnTo);
            return;
          } catch (error) {
            const reason = error instanceof Error ? error.message : 'launch_ticket_redeem_failed';
            const workspace = String(req.query['workspace'] || '').trim();
            const params = new URLSearchParams({
              reason,
              returnTo,
            });

            if (workspace) {
              params.set('workspace', workspace);
            }

            res.redirect(302, `${studioBasePath}/login?${params.toString()}`);
            return;
          }
        }
      }

      if ((isLoginRoute || isOpsLoginRoute) && validatedSession && !forceLoginView) {
        res.redirect(302, returnTo);
        return;
      }

      if (rawSession && !validatedSession) {
        clearSessionCookie(res, req);
        if (!isLoginRoute && !isOpsLoginRoute) {
          const params = new URLSearchParams({
            reason: 'session_expired',
            returnTo: requestedStudioPath,
          });
          res.redirect(302, `/login?${params.toString()}`);
          return;
        }
      }

      if (!validatedSession && !isLoginRoute && !isOpsLoginRoute) {
        const params = new URLSearchParams({
          returnTo: requestedStudioPath,
        });
        res.redirect(302, `/login?${params.toString()}`);
        return;
      }

      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.sendFile(join(browserDistFolder, 'index.csr.html'));
      return;
    }

    angularApp
      .handle(req)
      .then((response) => (response ? writeResponseToNodeResponse(response, res) : next()))
      .catch(next);
  })().catch(next);
});

if (isMainModule(import.meta.url) || process.env['pm_id']) {
  const port = Number.parseInt(process.env['PORT'] || '4400', 10);
  const host = process.env['HOST'] || '127.0.0.1';
  app.listen(port, host, (error) => {
    if (error) {
      throw error;
    }

    console.log(`Auctorio SSR listening on http://${host}:${port}`);
  });
}

export const reqHandler = createNodeRequestHandler(app);
