# Arquitectura Tecnica del Backend de Generacion de Contenido con IA (SEO e Instagram)

> Actualizado 2026-08: plataforma editorial autonoma (sources, inbox, social, publicaciones durables, automatizacion).

## 0. Dominio editorial (nuevo)

Workflow: SOURCE → DISCOVERY → SOURCE ITEM → STORY CLUSTER → CONTENT PROJECT → ARTICLE VERSION
→ MEDIA → SOCIAL DERIVATIVES → REVIEW → SCHEDULE → CHANNEL PUBLICATIONS → PUBLISHED → UPDATE/UNPUBLISH.

Modelos clave (PostgreSQL/Prisma):
- `content_sources` (rss/atom/html/sitemap/api/manual) con adapters (`SourceAdapter`).
- `source_items` con dedupe por (source_id + external_id) y content_hash; estados discovered→candidate→selected→processed.
- `story_clusters` agrupa items sobre el mismo evento (similaridad de titulos, ventana de 48h).
- `social_content` (x_post, x_thread, instagram_caption, instagram_story) con validacion por plataforma.
- `publishing_accounts` con `credentials_ref` (variables de entorno server-side; nunca en el navegador).
- `publications` (intencion durable: channel, status, scheduled_for, external_id, retry) + `publication_attempts` (historial de intentos).
- `automation_policies` (volumenes/dia, ventanas, flags auto*, limites de seguridad, estado active/paused).
- `campaigns`, `editorial_briefs`, `audit_logs`.

## 0.1 Estados y transiciones (publicaciones)

```
draft → ready → scheduled → queued → publishing → published
                                  ↘ failed → (retry) → queued
scheduled → canceled
published → unpublished
```
Transiciones invalidas rechazadas en `src/studio/publication.ts` (`canTransition`).

## 0.2 Workers y colas

| Worker | Cola | Responsabilidad |
|--------|------|-----------------|
| discovery | loop | refrescar fuentes vencidas, dedupe, clustering, scoring |
| automation | loop | planificador editorial: candidatos→proyectos→QA→social→slots |
| scheduler | loop | reclamar publicaciones vencidas (`FOR UPDATE SKIP LOCKED`) y encolar |
| scraping | queue_scraping | extraer hechos (v1) |
| text | queue_text | generar articulos (incluye news_article grounding) |
| image | queue_image | hero + variantes (og, social_square, …) |
| publishing | queue_publishing | publicar websites (guiatv/tecnoria/talkaris/webhook) |
| social | queue_social | generar copia social y publicar/despublicar X e Instagram |

## 0.3 Idempotencia y reintentos

- Keys deterministicas: publications por (project+version+channel+account+time), website jobs por (site+project+version+action).
- Reintentos: `classifyPublicationError` (transient: timeout/429/5xx; permanent: 401/403/credenciales),
  backoff exponencial con cap, `PUBLICATION_MAX_RETRIES`, estado `failed` con `next_retry_at` inspeccionable y reintentable.
- Dry-run: `PUBLISH_DRY_RUN` cubre websites, X e Instagram; IDs simulados `dryrun-*`, sin contenido publico real.

## 0.4 Seguridad

- SSRF: `validateScrapeUrl` (protocolos, IPs privadas, link-local, metadata, allowlist).
- HTML sanitizado antes de almacenar y servir.
- Credenciales sociales por referencia a variables de entorno; la API solo expone `hasCredentials`.
- Autorizacion backend por permisos del Studio; Angular solo oculta acciones.

## 0.5 Automatizacion

`AutomationPolicy` por tenant/site: articulos/dia, X/dia, Instagram/dia, ventanas por canal,
dias activos, timing social relativo al articulo, flags autoGenerate/autoApprove/autoSchedule/autoPublish
independientes, limites duros (hora/dia/cola) y kill switch (`state=paused`) que detiene nuevas
publicaciones automaticas sin interrumpir trabajos activos.

## 1. Objetivos y alcance
- Generar contenido SEO y publicaciones para Instagram usando IA.
- Ingesta de datos flexible: scraping y entrada manual.
- Procesamiento asincrono con colas y workers especializados.
- Multi-tenant desde el inicio, API publica primero, front despues.
- Idiomas iniciales: es y en.
- Despliegue local en VPS sin Docker.
- Imagenes y outputs deben guardarse (almacen local), con opcion de migrar a storage externo.

## 2. Decisiones clave
- Arquitectura limpia (Clean Architecture) y principios SOLID.
- Node.js + Fastify como interfaz HTTP.
- PostgreSQL como base de datos principal.
- Redis + BullMQ para colas.
- Proveedores de IA desacoplados mediante interfaces y factory/registry.
- ORM elegido: Prisma + migraciones (fuente de verdad de esquema).

## 3. Capas (Clean Architecture)
- Dominio: entidades, casos de uso, interfaces (repos, IA, storage).
- Aplicacion: orquestacion de casos de uso, politicas de costo, validaciones.
- Infraestructura: PostgreSQL, Redis/BullMQ, proveedores IA, scraping, storage local.
- Interfaces: API REST (Fastify), validacion y DTOs.

## 4. Componentes principales
- Ingesta: scraping (RSS/HTML/APIs) y entrada manual por API.
- Generacion de texto: worker de texto + provider IA.
- Generacion de imagenes: worker de imagenes + provider IA.
- Colas: una cola por tipo (scraping, texto, imagen).
- API REST: endpoints de temas, hechos, contenidos, estado.

## 5. Modelo de datos (PostgreSQL)
Todas las tablas llevan tenant_id para aislamiento.

- tenants: id, name, api_key_hash, status, plan, created_at.
- topics: id, tenant_id, title, description, status, created_at.
- facts: id, tenant_id, topic_id, source_type, source_ref, content, content_hash, created_at.
- content_text: id, tenant_id, topic_id, type (SEO/IG), language (es/en), status,
  provider, model, prompt, output, tokens_input, tokens_output, cost_usd, error, created_at.
- content_image: id, tenant_id, topic_id, text_id (nullable), status,
  provider, model, prompt, storage_path, width, height, cost_usd, error, created_at.
- jobs: id, tenant_id, type (scrape/text/image), status, idempotency_key,
  attempts, last_error, created_at, updated_at.
- ai_audit: id, tenant_id, job_id, provider, model, prompt, response, usage_json, created_at.

Notas:
- content_hash en facts permite deduplicacion.
- content_text y content_image guardan prompt y costos para trazabilidad.
- ai_audit permite auditoria y debugging sin mezclar con tablas principales.

## 6. Estados y transiciones
Estados comunes para jobs y contenidos:
- queued -> processing -> done
- queued/processing -> failed
- queued -> canceled (si se revoca antes de iniciar)

Reglas:
- Un contenido en estado done no vuelve a processing.
- Reintentos incrementan attempts y registran last_error.
- Los casos de uso crean registros con status=queued y encolan el job.

## 7. Colas y asincronia
- cola_scraping: obtiene datos y genera facts.
- cola_texto: genera content_text.
- cola_imagen: genera content_image (contextual o independiente).
- Workers son stateless y escalables.

Idempotencia:
- API acepta Idempotency-Key por request y se guarda en jobs.idempotency_key.
- Si llega el mismo key, se retorna el job/asset existente.

## 8. Politica de costos y cuotas
- Presupuesto por tenant y por canal (SEO/IG) con limites diarios y mensuales.
- Calculo previo del costo estimado por prompt.
- Si supera limite: rechazar job con error controlado.
- Alertas por umbrales (80% y 100% del presupuesto).

## 9. Dedupe de hechos y contenidos
- facts.content_hash = hash(normalize(content)).
- Para content_text: hash de (topic_id + type + language + prompt_version).
- Para content_image: hash de (topic_id + text_id + prompt_version).
- Si existe hash, no se regenera salvo override explicito.

## 10. Seguridad y scraping
- Respetar robots.txt y rate limits por dominio.
- Allowlist de dominios y bloqueo de IPs privadas (prevencion SSRF).
- Sanitizar HTML y remover scripts antes de almacenar.
- Tratar datos externos como no confiables en prompts (delimitar y filtrar).

## 11. Proveedores de IA (abstraccion)
Interfaces:
- ITextGenerator.generate(input, options) -> { output, usage, model }
- IImageGenerator.generate(input, options) -> { image_path/url, usage, model }

Provider registry:
- Config por tenant para elegir proveedor y modelo.
- Default: proveedor mas economico compatible.
- Facilidad para swap sin cambios en casos de uso.

## 12. Almacenamiento local de imagenes
- Storage local en /var/www/auctorio/storage.
- Estructura por tenant y fecha: storage/{tenant_id}/YYYY/MM/{content_image_id}.png
- metadata en content_image.storage_path.
- Interface IAssetStorage para permitir migracion futura (S3, etc).

## 13. API REST (v1)
Base: /v1
Autenticacion: API key por tenant (header Authorization: Bearer ...).

Ejemplos:
- POST /v1/topics
- POST /v1/topics/{id}/facts
- POST /v1/topics/{id}/generate-text (body: type, language, options)
- POST /v1/topics/{id}/generate-image (body: mode, options)
- POST /v1/text/{id}/generate-image (contextual)
- GET /v1/topics/{id}/results
- GET /v1/text/{id}
- GET /v1/images/{id}

Respuestas:
- 202 Accepted para trabajos asincronos (retorna job_id y content_id).
- 200/201 para respuestas sincrona/creacion.

## 14. Observabilidad
- Logs estructurados JSON con correlation_id y job_id.
- Metricas: cola depth, tiempo medio, tasa de error, costo por tenant.
- Tracing basico por job (request_id -> job_id -> content_id).
- Healthchecks para API y workers.

## 15. Operacion local (sin Docker)
- systemd o pm2 para procesos: api, worker-scraper, worker-text, worker-image.
- Variables de entorno: DB_URL, REDIS_URL, AI_PROVIDER, STORAGE_ROOT, API_KEYS, etc.
- Prisma migrate para control de esquema.

## 16. Escalabilidad futura
- Monolito modular listo para extraer workers a microservicios.
- Nuevos canales: video/audio mediante nuevas interfaces y colas.
- Cambio de storage a S3 o equivalente via IAssetStorage.

