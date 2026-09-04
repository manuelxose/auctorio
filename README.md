# Content AI Platform — Auctorio

Plataforma editorial autonoma: ingesta de noticias, reescritura original con IA, generacion de imagenes,
derivados sociales (X / Instagram), calendario editorial, programacion y publicacion multi-canal.

Estado: vertical slice operativa evolucionada a plataforma editorial completa
(studio central + API publica v1/v2 + sources/inbox + publicaciones durables + automatizacion).

Documentacion:
- docs/architecture.md
- docs/progress.md
- docs/openapi.yaml

Estructura:
- src/domain: entidades, casos de uso, interfaces
- src/application: servicios y politicas (prompts, costos)
- src/infrastructure: db, colas, IA, scraping, storage, workers
- src/web: API HTTP (Fastify)
- src/studio: plataforma editorial (sources, inbox, social, publications, automation, audit)
- apps/studio-web: Angular 20 SSR + BFF seguro bajo `/studio`
- storage: assets locales generados

## Flujo editorial

SOURCE → DISCOVERY → SOURCE ITEM → CANDIDATE → CONTENT PROJECT → ARTICLE VERSION
→ MEDIA → SOCIAL DERIVATIVES → REVIEW → SCHEDULE → CHANNEL PUBLICATIONS → PUBLISHED
→ MONITOR / UPDATE / UNPUBLISH

### Modo manual
1. `Sources` → añadir una fuente RSS/Atom/HTML/sitemap/API (o pegar URL en `Inbox` → Rewrite as news article).
2. `Inbox` → seleccionar historia → `Rewrite as news article` crea un proyecto con hechos de la fuente.
3. Workspace → generar articulo (news_article: reescritura original con grounding factual), hero image, SEO.
4. Tab `Social` → generar copia para X (post/thread) e Instagram (caption/story), editar y aprobar.
5. Tab `Schedule` → programar articulo (website) y posts sociales (X/Instagram) con fecha/hora.
6. `Calendar` → ver todo el plan; arrastrar para reprogramar; publicar ya / cancelar / reintentar.
7. `Publications` → lista operativa con filtros, paginacion, reintentos y despublicacion.

### Modo automatico
1. `Automation` → habilitar politica (articulos/dia, X posts/dia, Instagram posts/dia, ventanas, limites).
2. `Sources` → añadir fuentes habilitadas.
3. Workers (discovery + automation + scheduler + publishing + social) descubren, puntuan,
   deduplican, generan, aprueban (segun politica), programan slots y publican sin superar limites.
4. `Automation` → Pause detiene nuevas publicaciones automaticas sin corromper trabajos activos.

## Arranque local

- API: npm run start:api
- Worker discovery (fuentes): npm run start:worker:discovery
- Worker control (planificador, scheduler y watchdog): npm run start:worker:automation
- Worker scraping: npm run start:worker:scraping
- Worker texto: npm run start:worker:text
- Worker imagen: npm run start:worker:image
- Worker publishing (websites): npm run start:worker:publishing
- Worker social (generacion + X/Instagram): npm run start:worker:social
- Studio SSR: npm run build:studio && npm run serve:studio

## Inicio de sesión con Google

El Studio admite Google Identity Services: el navegador obtiene un ID token y
el API lo verifica contra `GOOGLE_CLIENT_ID` antes de crear la sesión. Añade el
mismo `GOOGLE_CLIENT_ID` al entorno del API y del Studio, y registra el origen
exacto del Studio en Google Cloud Console → OAuth client → **Authorized
JavaScript origins** (por ejemplo, `http://localhost:4200` para desarrollo y
el dominio HTTPS de producción). Este flujo no usa ni requiere un client
secret. Si la variable no está configurada, el botón de Google no se muestra.

Produccion: unit files systemd en `infra/systemd/` (api, studio, 8 workers).

## Conectar X / Instagram

1. Crear cuenta en `Automation → Social accounts` (o `POST /v2/publishing-accounts`).
   - `platform=x`, `credentialsRef=X_PUBLISHER_CREDENTIALS`
   - `platform=instagram`, `credentialsRef=INSTAGRAM_PUBLISHER_CREDENTIALS`
2. Definir la variable de entorno con el JSON de credenciales (ver .env.example).
3. `Verify` valida las credenciales sin exponerlas (nunca viajan al navegador).

## API expuesta

- `/v1/*`: capa baja de topics/facts/generate-text/generate-image
- `/v2/*`: studio multi-site + plataforma editorial:
  - `sites`, `projects`, `versions`, `prompts`, `users/roles` (existente)
  - `sources`, `source-items`, `story-clusters` (ingesta y wire)
  - `publications`, `publication-jobs`, `calendar` (programacion durable)
  - `projects/:id/social`, `social/:id` (derivados sociales)
  - `publishing-accounts` (X / Instagram)
  - `automation` (+ pause/resume/status), `campaigns`, `briefs`, `audit`, `overview`
- `/assets/*`: serving publico de imagenes generadas
- `/health`, `/health/live`, `/health/ready`, `/v2/health/workers`: probes operativas

## Modo de publicacion (dry-run)

- `PUBLISH_DRY_RUN=true` por defecto fuera de produccion. Aplica a websites, X e Instagram.
- En dry-run: pipeline completo, payload validado, IDs externos simulados (`dryrun-*`),
  trazabilidad normal en `publications`/`publication_attempts`/`publication_jobs`. Nunca crea contenido publico real.
- Sin credenciales resueltas en produccion, los publishers fallan con `publishing_missing_credentials`.

## Fiabilidad

- Programacion: durables en PostgreSQL (`publications`), el scheduler reclama con `FOR UPDATE SKIP LOCKED`
  y encola; multiples workers no duplican publicaciones.
- Idempotencia: keys deterministicas por (site+project+version+action) y por publication.
- Reintentos: clasificacion transient/permanent, backoff exponencial, max reintentos configurable,
  `failed` inspeccionable y reintentable desde el Studio.
- Estados: maquina de estados explicita (draft→ready→scheduled→queued→publishing→published/failed/unpublished).
- Limites de seguridad: articulos/hora-dia, social/hora-dia, cola maxima; la automatizacion nunca los supera.

## Verificacion

- `npm run typecheck`
- `npm test`
- `npm run build:studio`
- `npx prisma validate` / `npx prisma migrate deploy`
