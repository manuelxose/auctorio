# Progreso del proyecto

## Estado actual

Vertical slice operativa del `Content Studio` multi-site con backend `v1`/`v2`, Studio SSR bajo `/studio`, generacion con DeepSeek y FLUX via SiliconFlow, y publicacion centralizada con modo seguro `dry-run`.

## Implementado

- API Fastify multi-tenant con auth por API key.
- Motor base `topics`, `facts`, `jobs`, `content_text`, `content_image`.
- Capa editorial `sites`, `content_projects`, `content_versions`, `content_derivatives`, `publication_jobs`, `asset_variants`.
- Serving publico de assets bajo `/assets/*`.
- Healthchecks reales `/health/live` y `/health/ready`.
- Worker de publicacion separado.
- Publishers:
  - Guía TV con `publishDraft`, `updateDraft`, `publish`, `unpublish`.
  - Tecnoria con login, upload de imagen, publish, update, delete.
  - Webhook generico firmado.
- `PUBLISH_DRY_RUN` con fallback mock-safe cuando faltan credenciales.
- Workflow de publicacion completo con `targetStatus`:
  - `draft` -> `draft_synced`
  - `publish` -> `published`
  - `unpublish` -> `canceled`
- Reversion local del estado publicado al sincronizar draft o retirar contenido.
- Studio Angular 20 SSR:
  - login
  - dashboard
  - sites
  - projects
  - project detail
  - acciones de generar, revisar, aprobar, sincronizar draft, publicar y retirar
- BFF SSR con cookie cifrada `HttpOnly` y proxy same-origin.

## Pruebas automatizadas

- Unitarias de prompts y QA.
- Contract/integration tests de publishers:
  - Guía TV draft/publish/unpublish
  - Tecnoria login/upload/publish/delete
  - webhook firmado
  - 401
  - 409/422
  - timeout
  - fallo parcial de upload
- Tests del worker de publicacion para `draft`, `publish` y `unpublish`.
- Tests SSR/BFF:
  - redirect a login sin cookie
  - login y cookie cifrada
  - `session/me`
  - proxy con `Authorization` inyectado
  - logout

## Verificado

- `npm run typecheck`
- `npm test`
- `npm run build:studio`

## Pendiente relevante

- Usuarios y roles nativos del Studio (`admin/editor/viewer`) con persistencia propia.
- Revisión editorial fina:
  - comentarios internos persistidos
  - diff entre versiones
  - rollback explícito
  - edición parcial por bloques
- Entidades superiores del plan maestro:
  - `briefs`
  - `campaigns`
  - `approval_events`
- Observabilidad productiva:
  - métricas por cola/provider/publisher
  - alertas
  - dashboards
  - runbooks
- Despliegue final con reverse proxy y process manager (`systemd` o `pm2`).
