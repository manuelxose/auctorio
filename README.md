# Content AI Platform

Backend para generacion de contenido con IA, workflow editorial y publicacion multi-site.
Estado: vertical slice operativa para studio central + API publica v1/v2.

Documentacion:
- docs/architecture.md
- docs/progress.md
- docs/openapi.yaml

Estructura:
- src/domain: entidades, casos de uso, interfaces
- src/application: servicios y politicas
- src/infrastructure: db, colas, IA, scraping, storage, workers
- src/web: API HTTP (Fastify)
- apps/studio-web: Angular 20 SSR + BFF seguro bajo `/studio`
- storage: assets locales generados

Pendiente:
- Configurar systemd/pm2 para procesos en VPS (opcional)

CLI:
- Crear tenant: ts-node scripts/create-tenant.ts <tenant-name>
- Rotar API key: ts-node scripts/rotate-api-key.ts <tenant-id-or-name>
- Cambiar estado tenant: ts-node scripts/set-tenant-status.ts <tenant-id-or-name> <active|suspended>

Arranque local:
- API: npm run start:api
- Worker scraping: npm run start:worker:scraping
- Worker texto: npm run start:worker:text
- Worker imagen: npm run start:worker:image
- Worker publishing: npm run start:worker:publishing
- Studio SSR: npm run build:studio && npm run serve:studio

API expuesta:
- `/v1/*`: capa baja de topics/facts/generate-text/generate-image
- `/v2/*`: studio multi-site para sites, projects, approvals, assets y publications
- `/assets/*`: serving publico de imagenes generadas
- `/health`, `/health/live`, `/health/ready`: probes operativas

Studio SSR:
- Base path: `/studio`
- BFF: `/studio/api/session/*` y `/studio/api/backend/*`
- Login: selector de workspace con SSO OIDC cuando existe identity provider y fallback por API key cuando el tenant todavía no lo tiene configurado
- Variables: `STUDIO_BASE_PATH`, `STUDIO_API_INTERNAL_URL`, `STUDIO_SESSION_SECRET`, `STUDIO_COOKIE_NAME`, `STUDIO_ALLOWED_HOSTS`
- Runtime actual en produccion en esta maquina:
  - Studio SSR: `http://127.0.0.1:4400`
  - API/BFF interna: `http://127.0.0.1:4401`

Modo de publicacion:
- `PUBLISH_DRY_RUN=true` por defecto fuera de produccion
- Si faltan credenciales de publicacion resueltas, los publishers ejecutan mock-safe y dejan trazabilidad normal en `publication_jobs`
- `/v2/projects/:id/publish` soporta `targetStatus=draft|publish` y `action=publish|update|unpublish`

Verificacion:
- `npm run typecheck`
- `npm test`
- `npm run build:studio`
