# Progreso del proyecto

## Estado actual

Plataforma editorial autonoma: ingesta de fuentes, wire/inbox, clustering y scoring de historias,
reescritura original de noticias con grounding factual, generacion de imagenes, derivados sociales
(X / Instagram), programacion durable multi-canal, calendario, automatizacion configurable y
publicacion con reintentos e idempotencia.

## Implementado

- API Fastify multi-tenant con auth por API key.
- Motor base `topics`, `facts`, `jobs`, `content_text`, `content_image`.
- Capa editorial `sites`, `content_projects`, `content_versions`, `content_derivatives`, `publication_jobs`, `asset_variants`.
- **Plataforma editorial nueva**:
  - `ContentSource` (rss/atom/html/sitemap/api/manual) con adapters y SSRF protection.
  - `SourceItem` con dedupe (url canonica, external id, content hash) e Inbox.
  - `StoryCluster` con similaridad de titulos y agrupacion multi-fuente.
  - Scoring de candidatos con explicaciones (frescura, trust, categorias, coverage).
  - `news_article` goal: reescritura original con reglas de grounding factual y originalidad.
  - `SocialContent` (x_post, x_thread, instagram_caption, instagram_story) con prompts por plataforma.
  - `PublishingAccount` con `credentialsRef` server-side (nunca en el navegador).
  - `Publication` durable + `PublicationAttempt` por intento; maquina de estados explicita.
  - Scheduler con `FOR UPDATE SKIP LOCKED`, reintentos transient/permanent, backoff exponencial.
  - `AutomationPolicy` (volumenes diarios, ventanas, flags auto*, limites de seguridad, kill switch).
  - Planificador automatico: candidatos → proyectos → generacion → QA → social → slots → schedule.
  - `Campaign`, `EditorialBrief`, `AuditLog`.
- Workers: scraping, texto, imagen, publishing (websites) + **discovery, automation, scheduler, social**.
- Publishers X (OAuth 1.0a + API v2 + media upload) e Instagram (Graph API) con capabilities y dry-run.
- `PUBLISH_DRY_RUN` cubre websites, X e Instagram.
- Studio Angular 20 SSR:
  - login, dashboard operativo, sites, media, settings, prompts, usuarios/roles (existente)
  - Content redisenado (filtros, paginacion backend, batch, trash/restore, delete con confirmacion)
  - Workspace con tabs Social y Schedule + readiness strip (Article/Media/SEO/X/Instagram/Schedule)
  - Nuevas paginas: Calendar (drag & drop con rollback), Publications, Inbox, Sources, Automation.

## Pruebas automatizadas

- Unitarias de prompts, QA, publishers y worker de publicacion (existente).
- Nuevas: `tests/editorial.test.ts` — dedupe de fuentes, similaridad de titulos, scoring,
  maquina de estados, clasificacion de errores, backoff, parsing/validacion social, slots editoriales.

## Verificado

- `npm run typecheck`
- `npm test`
- `npm run build:studio`
- `prisma migrate deploy` (migracion `20260822000000_editorial_platform`)

## Pendiente relevante

- Metricas de coste IA agregadas por dia/mes.
- Metricas de engagement por publicacion (impressions/clicks) cuando existan fuentes.
- SSE/WebSocket para estado en tiempo real (hoy: polling centralizado de 30-45s).
- E2E completos de los flujos A-E (spec base en e2e/specs/studio-workflow.spec.ts).
- S3-compatible storage (abstraccion lista via IAssetStorage).
