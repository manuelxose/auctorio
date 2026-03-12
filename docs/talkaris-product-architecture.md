# Talkaris Product Architecture

Actualizado: marzo 2026

## 1. Resumen ejecutivo

El repositorio corresponde a un control plane editorial multi-tenant llamado Auctorio con:

- autenticacion dual: API key de tenant + OIDC/SSO
- RBAC con 9 permisos, roles system y custom, invitaciones
- BFF SSR privado bajo `/studio` con route guards y permission gates
- gestion de destinos (`sites`) con publishers desacoplados
- pipeline de contenido (`content_projects`, `content_versions`)
- generacion de texto e imagen asincrona
- QA automatizado
- derivados de contenido
- publicacion multi-destino con jobs y trazabilidad
- prompt governance con presets, versiones y asignaciones
- publishers por contrato para `tecnoria`, `guiatv`, `talkaris` y `webhook`

El rediseño actual dignifica el cockpit editorial manteniendo la infraestructura viva del backend y agregando:

- auth guards funcionales (session, login redirect, permission check)
- RBAC completo con UI de gestion de usuarios, roles y permisos
- prompt library con versionado y asignacion a sites
- dashboard cockpit con pipeline health, readiness checks y publishing feed
- navegacion permission-aware con 4 categorias (Dashboard, Operations, Control, Governance)

## 2. Mapa real del repositorio

### Frontend

App principal: `apps/studio-web`

Angular 20, standalone components, SSR + Express 5.

Rutas publicas:

- marketing bilingue SSR
- home, use cases, examples, gallery, faq, contact

Rutas privadas:

- `/studio/login` — login page (API key o SSO)
- `/studio/dashboard` — cockpit editorial
- `/studio/projects` — registro de proyectos
- `/studio/projects/new` — crear proyecto (guarded: `projects.manage`)
- `/studio/projects/:id` — detalle de proyecto
- `/studio/editorial/*` — pipeline, calendar, briefs, articles, versions
- `/studio/assets/*` — images, media library
- `/studio/ai/*` — text generation, image generation, prompt library
- `/studio/review/*` — QA queue, editor review
- `/studio/publishing/*` — destinations, scheduled, history
- `/studio/analytics/*` — content performance, SEO metrics (guarded: `analytics.read`)
- `/studio/automation/*` — pipelines, jobs
- `/studio/integrations/*` — CMS, webhooks, APIs (guarded: `integrations.manage`)
- `/studio/settings/workspace` — workspace config (guarded: `workspace.manage`)
- `/studio/settings/users` — user management (guarded: `users.manage`)
- `/studio/settings/roles` — RBAC matrix (guarded: `roles.manage`)

Auth infrastructure:

- `StudioSessionService`: signal-based session state, `ensureSession()`, `hasPermission()`
- `studioAuthGuard`: ensures session, redirects to login with `returnTo`
- `studioLoginGuard`: redirects authenticated users away from login
- `studioPermissionGuard`: checks `route.data.requiredPermission`, redirects to dashboard if denied

### Backend HTTP

API publica v1:

- `POST /v1/topics`
- `POST /v1/topics/:id/facts`
- `POST /v1/topics/:id/generate-text`
- `POST /v1/topics/:id/generate-image`
- `POST /v1/text/:id/generate-image`
- `GET /v1/topics/:id/results`
- `GET /v1/text/:id`
- `GET /v1/images/:id`

Studio v2:

- `GET /v2/session/me` — session with permissions, roles, tenant
- `GET /v2/session/identity-provider` — OIDC config
- `POST /v2/auth/login` / `POST /v2/auth/logout`
- `GET/POST/PUT /v2/sites`
- `GET/POST /v2/projects` with filters
- `GET /v2/projects/:id`
- `POST /v2/projects/:id/generate|revise|approve|publish`
- `POST /v2/assets/generate`
- `GET /v2/publications`
- `GET /v2/users` / `POST /v2/users/invite` / `PUT /v2/users/:id`
- `POST /v2/users/:id/roles/:roleId` / `DELETE /v2/users/:id/roles/:roleId`
- `GET /v2/roles` / `POST /v2/roles` / `PUT /v2/roles/:id`
- `GET /v2/prompts` / `GET /v2/prompts/:id`
- `POST /v2/prompts` / `POST /v2/prompts/:id/versions`
- `PUT /v2/prompt-versions/:id` / `POST /v2/prompt-versions/:id/approve`
- `POST /v2/prompt-versions/:id/assign`

### Workers y runtime

Workers detectados:

- scraping
- text
- image
- publishing

Infraestructura:

- Fastify
- Prisma/PostgreSQL
- Redis + BullMQ
- almacenamiento local de assets
- publishers desacoplados por adapter

## 3. Dominio actual

### Entidades vivas

- `Tenant` (workspace)
- `TenantUser` (with roles, permissions, auth provider)
- `Role` (system + custom, with permission matrix)
- `Topic` / `Fact` (knowledge primitives)
- `ContentText` / `ContentImage` (AI outputs)
- `Job` / `AiAudit` (trazabilidad)
- `Site` (publisher contract / destination)
- `ContentProject` / `ContentVersion` / `ContentDerivative`
- `PublicationJob` / `AssetVariant`
- `PromptPreset` / `PromptVersion` / `PromptAssignment`

### Relaciones reales

- un `Tenant` agrupa toda la operacion
- un `TenantUser` pertenece a un `Tenant` con N roles y permisos derivados
- un `Role` tiene un array de `StudioPermission` (9 tipos)
- un `Site` representa un destino o integration contract
- un `ContentProject` vive dentro de un `Site`
- un `ContentProject` puede enlazarse con un `Topic`
- un `Topic` agrega `Fact`, `ContentText` y `ContentImage`
- un `ContentProject` genera multiples `ContentVersion`
- una `ContentVersion` puede tener texto, imagen, derivados y publication jobs
- un `PublicationJob` sincroniza una version con un destino externo
- un `PromptPreset` tiene N `PromptVersion` (draft → approved lifecycle)
- un `PromptVersion` puede asignarse a N `Site` via `PromptAssignment`

### Estados reales

Project:

- `draft`
- `ai_generated`
- `qa_failed`
- `qa_passed`
- `in_review`
- `approved`
- `publish_queued`
- `published`
- `publish_failed`

Version:

- `draft`
- `ai_generated`
- `qa_failed`
- `qa_passed`
- `approved`
- `published`
- `archived`

Publication:

- `queued`
- `processing`
- `draft_synced`
- `published`
- `failed`
- `canceled`

Prompt version:

- `draft`
- `approved`

### Permissions (RBAC)

9 permisos efectivos:

- `workspace.manage`
- `users.manage`
- `roles.manage`
- `prompts.manage`
- `projects.manage`
- `review.approve`
- `publishing.manage`
- `integrations.manage`
- `analytics.read`

System roles (Owner, Admin) seedeados por tenant. Custom roles creados por workspace admins.

## 4. Funcionalidades existentes y su representacion

### Completamente representadas en UI

- login dual (API key + OIDC/SSO)
- session-aware dashboard con pipeline health, readiness, publishing feed
- CRUD de sites con metricas
- pipeline editorial completo (projects, versions, QA, approve, publish)
- user management con invitaciones y role assignment
- role management con permission matrix
- prompt library con presets, versions, approval y site assignment
- analytics (content performance, SEO)
- automation (pipelines, jobs)

### Existentes en backend, UI basica

- primitives de conocimiento con `topics` y `facts`
- motor de trabajos asincronos (visible via automation/jobs)
- image generation y asset variants
- derivados de newsletter y social
- draft sync, publish y unpublish
- publishers por tipo de destino

### Parcialmente implementadas

- command palette (boton visual sin funcionalidad real)
- healthchecks y readiness reales (representados via dashboard checklist)
- observabilidad avanzada
- version diff y comparacion
- webhook delivery monitoring

## 5. Auth architecture

### Dual-mode auth

- API key: fallback authentication para desarrollo y automation
- OIDC/SSO: enterprise authentication via configured identity provider

### Session model

```typescript
StudioSession {
  tenant: { id, name, slug, status }
  authMode: 'api_key' | 'oidc'
  user: { id, email, displayName, avatarUrl, status, lastLoginAt }
  roles: string[]
  permissions: StudioPermission[]
  identityProvider: { enabled, issuer, provisioningMode } | null
  siteCount: number
  projectCount: number
}
```

### Guard pipeline

1. `studioAuthGuard` → ensures session exists, redirects to `/studio/login?returnTo=...`
2. `studioPermissionGuard` → checks `route.data.requiredPermission` against session permissions
3. `studioLoginGuard` → prevents authenticated users from seeing login page

### UI filtering

- Navigation items with `requiredPermission` are filtered in `StudioShellComponent.navCategories`
- Topbar actions gated via `canAccess(permission)` method
- Dashboard quick actions gated per permission

## 6. Resultado

El cockpit editorial ahora funciona como:

- un control plane profesional con auth enterprise
- RBAC enforcement en frontend (guards + nav filtering) y backend (API validation)
- governance de prompts con versionado y approval workflow
- pipeline health visible en dashboard
- workspace readiness checklist
- permission-gated navigation y acciones
- 33 page components reales con datos vivos
