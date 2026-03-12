# Studio Web

Angular 20 SSR + BFF seguro para operar `content-ai-platform` desde `/studio`.

## Que hace

- Render SSR del cockpit editorial
- Login workspace-aware: SSO OIDC si el tenant lo tiene activo, o fallback temporal por API key si todavía no está configurado
- Cookie cifrada `HttpOnly` para no exponer la API key ni el token de sesión OIDC al navegador
- Proxy same-origin `/studio/api/backend/*` hacia la API Fastify

## Rutas principales

- `/studio/login`
- `/studio/`
- `/studio/sites`
- `/studio/projects`
- `/studio/projects/:id`

## Variables necesarias

- `STUDIO_BASE_PATH=/studio`
- `STUDIO_API_INTERNAL_URL=http://127.0.0.1:4401`
- `STUDIO_SESSION_SECRET=<secret largo>`
- `STUDIO_COOKIE_NAME=studio_session`
- `STUDIO_ALLOWED_HOSTS=localhost,127.0.0.1`
- `STUDIO_COOKIE_SECURE=true` en produccion si el reverse proxy termina TLS

## Comandos

```bash
npm run build:studio
npm run serve:studio
npm run dev:studio
```

## Flujo soportado

1. Seleccion de workspace.
2. Login por SSO OIDC o API key fallback.
3. Alta y edicion de sites.
4. Alta y consulta de projects.
5. Generacion de texto e imagen.
6. Revision manual por feedback.
7. Aprobacion.
8. Publicacion `draft` o `publish`.
9. Retirada (`unpublish`) y trazabilidad de publication jobs.

## Notas operativas

- Runtime real en esta maquina:
  - Studio SSR: `http://127.0.0.1:4400/studio`
  - API interna: `http://127.0.0.1:4401`
- El Studio no almacena sesiones de BFF en base de datos; el logout limpia la cookie en cliente.
- El proxy inyecta `Authorization: Bearer <tenantApiKey>` solo cuando existe cookie valida en modo fallback por API key.
- Para desarrollo, `PUBLISH_DRY_RUN=true` mantiene el flujo completo sin credenciales reales.
