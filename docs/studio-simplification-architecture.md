# Studio Simplification — Architecture Report

Date: 2026-08-21

## 1. New authentication model

**One global user identity, many sites. No workspace concept in the UI.**

```
User (StudioAccount, one per email)
 ├── memberships (StudioUser rows, one per tenant)   ← retained internally
 │    ├── Tecnoria (tenant) → sites → role admin
 │    └── GuiaTV (tenant)    → sites → role admin
 └── session (cookie) carries: user, sites, per-tenant session tokens, activeSiteId
```

- Login: `POST /studio/api/auth/login/password` → backend `POST /internal/session/global-login/password`
  (`loginStudioAccountWithPasswordGlobal` in `src/studio/auth.ts`) resolves **all** local
  memberships, creates one `StudioUserSession` per tenant, and returns
  `{ user, sites[], sessions[{tenantId, studioUserId, sessionToken, permissions}], activeSiteId }`.
- Google login uses the same global completion (`loginStudioAccountWithGoogleGlobal`).
- Per-site role is derived from the membership role keys: `admin` > `editor` > `viewer`.

## 2. Session cookie (BFF, `apps/studio-web/src/server.ts`)

Encrypted (AES-256-GCM, same as before) payload now:

```ts
type SessionPayload = {
  authMode: 'api_key' | 'human' | 'oidc';
  apiKey?: string;
  user?: { id, email, displayName, avatarUrl };
  sessions?: Array<{ tenantId, studioUserId, sessionToken, permissions }>;
  sites?: Array<{ id, key, name, type, baseUrl, tenantId, role, permissions }>;
  activeSiteId?: string | null;
};
```

- Legacy single-token sessions remain readable (backward compatible).
- Session token validation is cached for 60 s per token.

## 3. Site scoping per request

- Client tags backend calls with `x-studio-site-id` (`studio-site.interceptor.ts`).
- BFF `resolveTargetSite()` resolves: header → `?siteId=` → `activeSiteId` → first site,
  then maps the site to its tenant and signs the upstream request with that tenant's
  session (`x-studio-tenant-id` + HMAC signature). Tenant isolation is unchanged.
- `POST /studio/api/session/active-site` re-encrypts the cookie with the new active site.
  Switching sites never re-authenticates.

## 4. New Studio session view

`GET /studio/api/session/me` returns only product concepts:

```ts
type StudioSessionView = {
  user: { id, email, displayName, avatarUrl };
  role: 'admin' | 'editor' | 'viewer';
  sites: Array<{ id, key, name, type, baseUrl, role }>;
  activeSiteId: string | null;
};
```

No tenant, no authMode, no permissions, no identity provider leakage.

## 5. Navigation & routing

- Shell: `layout/app-shell.component.ts` — sidebar (brand, site selector, 4 primary
  items + Settings), mobile drawer, topbar with global "+ New content".
- Routes: `app.routes.ts` — `/login`, auth lifecycle pages, `/studio/{overview,content,
  content/new, content/:id, media, publishing, settings/:section}` + compatibility
  redirects + marketing routes (en/es).

## 6. Content workflow

- `content-list-page`: filters All/Draft/Review/Ready/Published/Failed + search.
- `content-new-page`: destination + topic + goal + instructions → Create & Generate
  (progressive disclosure for slug/categories/keywords).
- `content-workspace-page`: single workspace with tabs **Content | Media | SEO | History**,
  right rail **Quality** (structured gate issues + score + Fix with AI) and **Publishing**
  (status, external link, Sync draft / Publish / Unpublish). Auto-polling during
  generation/publishing. Editor saves through `PATCH /v2/versions/:id`
  (`updateVersionContent` + QA re-run); immutable after approval.

## 7. Backend additions

- `POST /internal/session/global-login/{password,google}` — multi-site login.
- `GET /internal/auth/providers` — Google client availability (login page).
- `GET /v2/media` — media library list with variants + project link (`listMediaImages`).
- `PATCH /v2/versions/:id` — editor save + QA re-run.
- `scripts/grant-cross-site-access.ts` — grants one account access to another tenant
  (used to give the acceptance user GuiaTV + Tecnoria in one identity).

## 8. Preserved production core (unchanged behavior)

Text/image generation workers, image persistence + derivatives, retry pipeline,
project/version persistence, QA gate, approval, publication jobs with idempotency
and retries, GuiaTV and Tecnoria adapters, destination health checks, structured
errors, CI, backups, E2E/live contract suites.

## 9. Verification (2026-08-21)

- Unit/integration: 42/42. E2E: 3/3 (login without workspace, site switching with
  scoped content, content create → generate → workspace). Studio production build
  and backend build green.
- Live: one login returns role `admin` for both `tecnoria-main` and `guiatv-editorial`;
  switching active site re-scopes `/v2/projects` per tenant (4 GuiaTV projects vs 0
  Tecnoria) in the same session.
