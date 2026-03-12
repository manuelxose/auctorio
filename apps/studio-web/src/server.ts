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

type SessionPayload = {
  authMode: 'api_key' | 'oidc';
  apiKey?: string;
  sessionToken?: string;
};

type SessionResponse = {
  tenant: {
    id: string;
    name: string;
    slug?: string | null;
    status: string;
  };
  authMode?: 'api_key' | 'oidc';
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
const angularApp = new AngularNodeAppEngine({
  allowedHosts: getAllowedHosts(),
});

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

  if (payload.authMode === 'oidc' && payload.sessionToken?.trim()) {
    return {
      authMode: 'oidc',
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

async function validateSessionToken(
  sessionToken: string,
): Promise<InternalValidatedSession | null> {
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

    return (await response.json()) as InternalValidatedSession;
  } catch {
    return null;
  }
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

  if (payload.authMode === 'oidc' && payload.sessionToken) {
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

app.post(`${studioBasePath}/api/session/login`, express.json({ limit: '64kb' }), (req, res) => {
  void (async () => {
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

app.get(`${studioBasePath}/api/auth/sso/start`, (req, res) => {
  void (async () => {
    const workspaceSlug = String(req.query['workspace'] || '').trim();
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
      authMode: 'oidc',
      sessionToken: studioSession.sessionToken,
    });
    res.redirect(302, `${studioBasePath}/dashboard`);
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
    if (session?.authMode === 'oidc' && session.sessionToken) {
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

    res.json(resolved.session);
  })().catch((error) => {
    res.status(500).json({
      error: 'internal_error',
      message: error instanceof Error ? error.message : 'Unexpected error',
    });
  });
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
    const pathname = new URL(req.originalUrl, 'http://localhost').pathname;
    if (!shouldHandleWithAngular(pathname)) {
      next();
      return;
    }

    if (isStudioPage(pathname)) {
      const isLoginRoute = pathname === `${studioBasePath}/login`;
      const rawSession = readSession(req);
      const validatedSession = await resolveStudioSession(req);

      if (isLoginRoute && validatedSession) {
        res.redirect(302, `${studioBasePath}/`);
        return;
      }

      if (!isLoginRoute && !validatedSession) {
        if (rawSession) {
          clearSessionCookie(res, req);
        }
        const reason = rawSession ? 'session_expired' : '';
        res.redirect(
          302,
          reason ? `${studioBasePath}/login?reason=${reason}` : `${studioBasePath}/login`,
        );
        return;
      }
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
