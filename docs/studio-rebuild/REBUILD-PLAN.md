# Rebuild del proceso de publicación

Simple por defecto, Avanzado cuando haga falta. El usuario conecta el sitio; Auctorio lee el sitio y sus competidores, llena un calendario de 30 días y publica cada día lo previsto. El flujo de referencia está en [BABYLOVEGROWTH-FLOW.md](BABYLOVEGROWTH-FLOW.md) (M0).

**Decisiones fijadas**
- Modo por defecto: **Asistido "justo a tiempo"**. Hasta su hora, el artículo solo tiene keyword, intención y métricas. Se redacta `lead` minutos antes (60 por defecto) y el usuario lo aprueba. Pasar a Autopilot es un clic.
- Fuentes e Inbox de noticias pasan a Avanzado. WordPress no entra.

## Estado

| Hito | Rama | Estado |
|---|---|---|
| M0 · Estudio del flujo de referencia | — | Hecho: `BABYLOVEGROWTH-FLOW.md` |
| M1 · Autopilot/Asistido desde el plan, publicación en su hueco | `feat/m1-plan-driven-autopilot` | Hecho (390b82a) |
| M2 · Un solo sistema de generación | `feat/m2-single-generation` | Hecho (a47c29e) |
| M3 · Una configuración de puertas, un tick, ciclo de vida | `feat/m3-one-gate-one-tick` | Hecho (e3d8b43) |
| M3b · Publicar sin `PublicationJob` | `feat/m3b-publish-without-publication-job` | Hecho (f4d68a6, d5cefe3, 942134a, 30a4ad7); entrega real verificada en M4 |
| M4 · Plantilla tipo guía + JSON-LD | `feat/m4-guide-template` | Hecho; borrador real entregado en guiaprogramaciontv.com |
| M5 · Nueva arquitectura de información | `feat/m5-information-architecture` | Hecho (f0a89d3) |
| M6 · Limpieza final | `feat/m6-final-cleanup` | Hecho; migración sin desplegar |

Cada hito va en su propia rama, apilada sobre la anterior. Nada está publicado.

## Ciclo de vida

Internamente: `Planificado → Redactando → Necesita revisión → Listo → Programado → Publicado`, más `Falló` y `Cancelado`. Es una función pura sobre los enums existentes, sin migración.

En la UI se muestran 4 chips, como en la referencia: **En cola · Redactando · Revisar · Publicado**, más **Falló**. "Listo" y "Programado" no son chips: se muestran como la hora de publicación en la tarjeta.

## Diferencias por modo

| Momento | Asistido (defecto) | Autopilot | Manual |
|---|---|---|---|
| Antes del día | Keyword, intención y métricas | Igual | Igual |
| Plan propuesto | Se aprueba en el calendario | Se aprueba solo | Lo crea y aprueba el usuario |
| Redacción | Automática en `hueco − lead` | Igual | El usuario pulsa "Redactar" |
| Falla la puerta | Revisar | Auto-reparación y luego Revisar | Revisar |
| Pasa la puerta | Espera la aprobación; publica en su hueco (o al aprobar si ya pasó) | Se programa en su hueco | Listo; el usuario programa |

## Hitos pendientes

### M3 · Una configuración de puertas, un tick, ciclo de vida
- **Puertas:** las dos puertas evalúan informes distintos (QA v2 de la versión y QA editorial del pipeline), así que siguen siendo dos funciones, pero con **una sola configuración**: `AutomationPolicy.autonomousQaThresholds`. El umbral de QA del pipeline sale de `overallQualityScore` (90 por defecto). `qaGates` deja de leerse.
  - `requireHumanApproval` pasa a `false` por defecto: con `true`, Autopilot nunca auto-publicaba un plan item (bug de M1). Los modos no-Autopilot ya van a revisión por la cadena de política.
  - El rango fijo 1200–2200 de `qa.ts` se borra: mandan los objetivos del plan y, si no hay, la banda por tipo de contenido (`wordBandForContentType`).
- **Tick:** producción (`deploy-production.sh`) solo arranca `worker-automation`, cuyo bucle embebido es el scheduler. Por eso se queda ese, y `dev.ps1` deja de arrancar `worker:scheduler`, que duplicaba el tick en local.
- **Ciclo de vida:** `src/studio/article-lifecycle.ts` con `articleState({ planItem, job, publication })` y `articleChip`. La API del calendario devuelve `lifecycle` y `chip` en cada evento. La vista de proyecto lo tomará en M3b, cuando deje de leer `PublicationJob`.
- **Tests:** `tests/article-lifecycle.test.ts` (tabla de 17 casos), Autopilot programando en su hueco y el calendario durante una ejecución asistida.

### M3b · Publicar sin `PublicationJob` (nuevo, separado de M3)
`PublicationJob` no es un registro muerto: hoy es la unidad de ejecución de **toda** publicación web. La cola lleva su id, el worker lo lee y lo actualiza, y su `externalId` evita que un reintento cree un post duplicado en el sitio.
- Reescribir `worker-publishing.ts` para trabajar sobre `Publication` + `PublicationAttempt`: payload de cola, reintentos, idempotencia y `getLatestPublishedExternalId`.
- Migrar `enqueueWebsitePublication` (`publication.ts`), la ruta de publicar ahora (`routes.ts`), `projects.ts` y la vista de proyecto (`views.ts`, `repository.ts`).
- Al desplegar, drenar o traducir los mensajes de cola que aún lleven ids de `PublicationJob`.
- **Tests:** `worker-publishing`, e2e `autopilot-golden-path` y `calendar-publications`, más una publicación real en guiaprogramaciontv.com.
- Requisito de M6 (borrar la tabla).
- **Hecho:** `startWebsiteAttempt` reclama la `Publication`, crea el `PublicationAttempt` y encola su id; el worker reutiliza `startAttempt`/`succeedAttempt`/`failAttempt` (mismos reintentos y circuit breaker que social). El id remoto de un intento fallido se guarda en la `Publication`. Los mensajes antiguos con id de `PublicationJob` se relanzan como intento nuevo (atajo, se borra en M6). `PublicationJob` solo se lee ya para ids externos anteriores y para `/v2/publication-jobs`.
- **Arreglos descubiertos en las e2e:** `runProductionJob` corre dentro de `withAiTenant` (desde M2 el tick de automatización escribía con el proveedor `mock`); el estado `connected` de Overview cuenta un sitio con credenciales guardadas (guiaprogramaciontv.com), sin afirmar que se verificó con borrador de prueba.
- **Tests:** `worker-publishing` 5/5; `autopilot-golden-path` pasa (con `minimumStoryScore` 0,3 en el spec). `calendar-publications` se salta en una base limpia: necesita un proyecto con versión.

### M4 · Plantilla tipo guía + JSON-LD
- **Estructura** (`editorial-engine/structure.ts`, spec `guide`): unas 2.300 palabras; intro de ~110; caja "En resumen" de 5 puntos; índice; 8–12 H2 con H3; tabla comparativa; "Cómo elegir"; FAQ de 5; "Fuentes"; **"Lecturas recomendadas"**; **tarjeta CTA hacia una página del sitio**; 15–20 enlaces internos; ~4 externos; 5 imágenes con alt.
- **10 checks de calidad**, mostrados como lista en el panel del artículo:
  - Nuevos: respuesta primero, dato o estadística, keywords semánticas.
  - Existentes, se mapean: fuente creíble, estructura, enlaces internos, plagio (duplicate-check), alt de imágenes, meta tags, JSON-LD.
- **Override por sitio:** columna nullable `article_targets Json?` en `SitePlanningSettings`, con interruptores sí/no por sección (resumen, índice, FAQ, fuentes, JSON-LD, lecturas recomendadas, CTA) además de los objetivos numéricos. `PlanItemGenerationSettings` puede sobrescribirlo por artículo.
- **"¿Por qué este tema?":** se muestra el `rationale` del plan item.
- **JSON-LD:** `editorial-engine/json-ld.ts` (Article, FAQPage, BreadcrumbList) en los metadatos de la publicación; lo inyectan los publishers `guiatv` y `generic_rest`.
- Índice determinista desde los H2 en la etapa seo. `html-sanitizer.ts` permite `aside` y `nav`.
- **Tests:** fixture de referencia pasa; sin tabla o sin FAQ falla; forma del JSON-LD; e2e `guiatv-seo-golden-path`.
- **Hecho:** tipo `guide` (plan items con `contentType` guide/tutorial). `structure.ts` lleva la spec, `GUIDE_TARGETS` y `resolveArticleTargets(sitio, artículo)`; las secciones apagadas salen del prompt y del QA. Migración `20261117120000_site_article_targets`; `PUT /v2/sites/:id/planning-settings` acepta `articleTargets` (null lo borra). El override por artículo es `generation.articleTargets` del plan item. La etapa seo genera el índice (`withTableOfContents`) y el sanitizer permite `aside`, `nav` e `id` en H2/H3. `editorial-engine/quality-checklist.ts` añade los 10 checks como `qaReport.checklist`; cada re-run de QA v2 los recalcula desde los metadatos del proyecto (`articleTargets`, `internalLinkInventorySize`). El rail «Quality» del workspace los lista, y «¿Por qué este tema?» muestra el `rationale` que ahora se copia al proyecto. `editorial-engine/json-ld.ts` reúne los builders del feed y añade BreadcrumbList y la extracción de FAQ del cuerpo. El JSON-LD se construye al publicar, no se guarda en la publicación: `jsonLd` en el payload de GuíaTV y `meta._auctorio_json_ld` en generic_rest.
- **Tests:** `tests/guide-template.test.ts` 8/8; los 11 ficheros relacionados siguen en verde. E2E `guiatv-seo-golden-path` pasos 1–3 en verde en local: generó una guía real con índice, caja de resumen, tabla y los 10 checks. El escritor no puso enlaces internos (0/7); el check lo marca bien. `related-cluster` ya no cuenta como plagio.
- **GuíaTV (visto en su repo):** su página de post monta el índice desde los H2/H3, pinta `faqItems` como bloque FAQ con su FAQPage y genera su propio Article, y descarta los campos desconocidos. Por eso su payload va sin nuestro índice y con la FAQ del cuerpo convertida en `faqItems`, sin `jsonLd`. El JSON-LD de `json-ld.ts` queda para generic_rest y el feed.
- **Fechas en guías:** QA aceptaba solo los años del ledger y rechazaba guías por «2026» o una fecha de «actualizado el» inventada. En contenido no noticioso se admite el año actual; el prompt lo da y prohíbe fechas de actualización. Las noticias siguen igual.
- **Entrega real (cierra M3b):** e2e `guiatv-seo-golden-path` 4/4 en local, pero el paso 4 pasa en dry-run (local publica en dry-run por defecto). Con solo el worker de publicación en vivo (`PUBLISH_DRY_RUN=false`, worker de automatización parado), GuíaTV creó el borrador `6afc4988ab6af65bec7d8c4c` (`/guias/realities-convivencia-tv-streaming-donde-ver`): contentType guide, 5 `faqItems`, sin índice duplicado y con la tarjeta CTA.
- **Bug arreglado en esa entrega:** el worker reutilizaba el id `dryrun-…` de una entrega simulada y hacía `PUT /v2/blog/dryrun-…` (GuíaTV respondía 500). Ese id ya no cuenta como remoto, ni en la fila ni en `getLatestPublishedExternalId`; test en `worker-publishing` (6/6).
- **Longitud de guías en el plan:** `postValidatePlanItems` fija los ítems guide/tutorial a ±13 % del objetivo de palabras del sitio (`article_targets.words`, 2.300 por defecto), sin importar lo que proponga el modelo. Test en `editorial-plan-v2`. `site-strategy` tiene un test de concurrencia que ya fallaba antes de este cambio.
- **Publicar es publicar (2026-11-17):** una orden de publicar nunca queda como borrador en el destino. El worker falla con `destination_kept_draft`, guardando el id remoto para el reintento, si el sitio responde `effectiveTargetStatus: "draft"`, en vez de marcarla publicada. generic_rest lee el `status` que devuelve el CMS (`pending`/`draft` cuenta como no publicado). En GuíaTV, publicar un post existente sube antes la versión actual y luego aprueba.
- **GuíaTV en producción:** desde el PR #218 (desplegado el 16 nov, decisión del dueño, ADR 0001) publica sin persona lo que aprueba la identidad de Auctorio, pero le faltaban `AUCTORIO_EDITORIAL_REVIEW_KEY`/`AUCTORIO_EDITORIAL_REVIEWER` en `/etc/guiatv/api.env`, así que toda aprobación de Auctorio se rechazaba. Ya están configuradas (misma clave que `/etc/content-ai-platform/app.env`, copia de seguridad `api.env.bak-auctorio-autopublish-*`) y `guiatv-api` se reinició. Comprobado: con esa clave el guard responde 404 sobre un post inexistente; con otra clave, 403. Siguen bloqueando, y ahora se ven como error en Auctorio: el freno de emergencia de GuíaTV, enlaces a guías no públicas y casi-duplicados.
- **Pendiente:** los interruptores por sitio no tienen UI todavía (irán en Ajustes · Artículos, M5). El borrador de prueba `6afc4988…` se borró de GuíaTV el 17 nov.

### M5 · Nueva arquitectura de información
- **Navegación:** Inicio · Calendario · Artículos · Resultados · Ajustes. Avanzado agrupa Site intelligence, Competidores, Fuentes, Inbox, Media, Review queue y Trabajos.
- **Configuración:** solo **conectar el sitio** es obligatorio; los otros 4 pasos se pueden saltar. El perfil detectado se confirma en Inicio ("Correcto / Actualizar"), no en el asistente.
- **Inicio:**
  - Línea de estado arriba ("todo automático" / "N para revisar").
  - Checklist Obligatorio / Opcional hasta completarla.
  - Feed por día con el artículo destacado y su "¿por qué este tema?", hecho con los ProductionJob y plan items del día.
  - El siguiente paso sigue saliendo de `overview-model.ts`.
- **Calendario (pantalla principal):**
  - Grid de 30 días con los 4 chips y contadores por estado en la cabecera.
  - **Arrastrar para reprogramar.**
  - **Añadir keywords** en bloque. *Nuevo backend:* un endpoint que recibe hasta 50 keywords y las convierte en plan items, descartando duplicadas y fuera de tema.
  - Clic en un ítem en cola → modal de instrucciones y URL de referencia (`PlanItemGenerationSettings.instructions`). El drawer completo queda en Avanzado.
- **Artículo:** vista previa + **panel lateral**, sin pestañas. El panel lleva, en orden: calidad, checks, datos, slug/meta/portada y Aprobar/Publicar. "Arreglar con IA" solo aparece si falla un check. La edición es un modo aparte.
- **Ajustes:** agrupados por *Negocio y marca · Artículos · Integraciones*. Modo y ritmo van juntos en Artículos.
- **Ritmo:** por defecto 1 artículo al día con chips de días de la semana. Artículos por día y hora pasan a Avanzado.
- **Resultados** absorbe `publications-page`. Se ocultan los CMS sin proveedor.
- **Diseño:** se mantienen "Ink & Vermilion", Inter y Source Serif 4. Reglas de la skill: progreso, Saltar/Atrás, revelación progresiva, labels visibles, feedback al enviar, objetivos de 44px, foco visible, `prefers-reduced-motion`, responsive a 375/768/1024/1440.
- **Rutas antiguas** redirigen (`/studio/editorial-plan` → calendario; `/studio/editorial-engine` → calendario filtrado por Revisar).
- **Tests:** specs del calendario y del setup; e2e nuevo `setup-wizard`; actualizar `calendar-publications`, `studio-shell-nav`, `sources-tabs`, `site-intelligence-coverage`.
- **Hecho (parte 1, 2026-11-17):**
  - **Navegación:** `STUDIO_NAV` es Home · Calendar · Articles · Results, con Advanced y Settings al final. Se quitó el flujo numerado (barra de paso y "Next step"). Advanced: Site intelligence, Competitors, Sources, Inbox, Plan backlog, Review queue, Media, Background jobs. Settings agrupa *Business & brand · Articles (Mode & rhythm) · Integrations*, y luego Workspace y System.
  - **Rutas:** `/studio/plan` (antes editorial-plan: generador y drawer completo), `/studio/review-queue` (antes editorial-engine), `/studio/results` (antes publications). `/studio/editorial-plan` → calendario, `/studio/editorial-engine` → `calendar?chip=review`, `/studio/publications` → results (conserva `?id=`). Enlaces del servidor (notificaciones, copilot, onboarding, cobertura de clusters) apuntan ya a las rutas nuevas.
  - **Calendario:** vista "30 days" por defecto, chips con contador (All · Queued · Drafting · Review · Published · Failed, filtran y aceptan `?chip=`), el chip del ciclo de vida en cada tarjeta y los cancelados fuera. El arrastre para reprogramar ya existía.
  - **Añadir keywords:** `POST /v2/sites/:id/plan-keywords` (`plan-keywords.ts`), hasta 50. Descarta repetidas, ya planificadas o cubiertas (solapamiento de título ≥ 0,75) y fuera de tema (solo las guardas duras: léxico fuera de tema y exclusiones de la estrategia; el umbral blando tumbaba frases cortas). Cada una es un plan item `guide` **aprobado** (lo eligió el usuario) en el siguiente hueco libre según el ritmo del sitio, dentro de un plan "Your keywords".
  - **Modal de instrucciones:** en un ítem en cola, guarda `generation.instructions` y `generation.referenceUrl` (http/https). Arreglos encontrados: el PATCH reemplazaba `metadata.generation` entero (borraba idioma, tipo y objetivos); ahora fusiona solo las claves enviadas. Y el pipeline justo a tiempo no pasaba ni las instrucciones ni las notas al escritor; ahora van en `planGuidance`.
  - **Tests:** `plan-keywords` 1/1, `studio-nav.spec` 5/5, e2e nuevo `calendar-m5` 3/3 (capturas en `evidence/m5/`), `studio-shell-nav` 2/2; `planning-workspace`, `production-pipeline`, `site-onboarding` y `guide-template` en verde.
- **Hecho (parte 2, 2026-11-17):**
  - **Inicio:** la línea de estado dice "N articles to review" (con enlace a `calendar?chip=review`) o "Everything runs on its own"; el feed del día muestra 8 actividades y "Show all". La checklist ya existía; ahora solo "Connect your website" es obligatoria (`overview-model.ts`) y se puede ocultar una vez hecha (por sitio, en `localStorage`). "What Auctorio learned" pregunta "Is this right?": **Correct** guarda la estrategia efectiva como aprobada (`PUT /v2/sites/:id/strategy`), **Update** abre Site intelligence.
  - **Configuración:** no hay asistente aparte; la checklist de Inicio es el setup, así que "solo conectar es obligatorio" vive ahí. El e2e `setup-wizard` del plan lo cubre `home-article-m5`.
  - **Ajustes · Artículos:** la página `/studio/automation` es "Mode & rhythm". Nueva tarjeta `article-settings-card`: días de publicación como chips, interruptores de las secciones de la guía (M4) y, bajo "More", artículos por día y hora. Guarda en `planning-settings` (lo que usan el plan y "Add keywords"). `AutomationPolicy.articlesPerDay` (presupuesto diario del tick) sigue en los controles avanzados de la política.
  - **Artículo:** abre en vista previa (portada, título, entradilla, cuerpo con Source Serif 4); las pestañas solo aparecen en el modo **Edit**. Panel lateral en orden: Quality (puntuación, avisos, 10 checks), Data (keyword, intención, tipo, palabras, imágenes, "Why this topic"), Slug, meta and cover, Approve and publish. "Fix with AI" aparece solo si falla un check o hay bloqueos.
  - **Results:** cabecera "Results". El asistente de conexión ya no lista Webflow, Shopify, Wix, Ghost ni Framer (no tienen publisher).
  - La sección "Advanced" de Sources pasa a "Technical settings" para no chocar con el área Advanced.
  - **Tests:** `overview-model.spec` + `studio-nav.spec` 12/12; e2e `home-article-m5` 5/5, `calendar-m5` 3/3, `studio-shell-nav` 2/2, `calendar-publications` 1/1, `sources-tabs` 1/1, `studio-role-separation` 4/4, `site-intelligence-coverage` 1/1. Capturas en `evidence/m5/`.
  - **Abierto:** el bundle inicial supera en ~4 kB su presupuesto de 500 kB (aviso de build).

### M6 · Limpieza final
- Migración que borra `PublicationJob` y `PublicationStatus`. Es la única destructiva: solo con backup y tras confirmar 0 escrituras desde M3b.
- Se borran rutas y componentes muertos tras M5 y `grant-studio-admin.tmp.ts`.
- **Hecho (2026-11-17):**
  - Migración `20261117180000_drop_publication_jobs`. Antes de borrar, conserva los ids remotos: los copia a la `Publication` enlazada que no los tenga y, para entregas antiguas sin enlace, crea una `Publication` web (`published`/`ready`) con la última por proyecto y sitio. Así `getLatestPublishedExternalId` sigue actualizando el post en vez de duplicarlo, ya sin leer la tabla. Luego borra `publication_jobs`, `PublicationStatus` y `PublicationAction`.
  - Fuera `GET /v2/publication-jobs` y `/:id` (sin uso en la UI) y sus lecturas en `repository.ts`. El vocabulario que lee la UI (`queued`, `draft_synced`…) pasa a tipos TS en `types.ts` (`PublicationExecutionStatus`, `PublicationAction`).
  - Borrado `scripts/grant-studio-admin.tmp.ts`. No quedan componentes sin referencia; las rutas antiguas ya son redirecciones.
  - **Se queda** el traductor de mensajes antiguos del worker (`translateLegacyMessage`): no lee la tabla, solo `publications.publication_job_id`, y producción aún no tiene M3b, así que habrá mensajes con id de `PublicationJob` en cola al desplegar. Se borra cuando esa cola se haya drenado. La columna `publication_job_id` también se queda (marca entregas antiguas en `isWebsiteDelivery`).
  - **Tests:** `worker-publishing` 7/7, `studio-routes` 15/15, `production-pipeline` 12/12, `editorial-engine` 24/24; `tsc` limpio. Migración aplicada en local.
  - **Para desplegar:** backup de la base antes; el backfill cubre los ids remotos, pero el resto de columnas de `publication_jobs` (payloads, errores) se pierde.

### Fuera de alcance
- Reescritura automática de artículos antiguos ("Mejoras" en la referencia): idea futura.
- Reddit, Quora, backlinks y analítica de visibilidad en IA.

## Riesgos abiertos
- **M1:** al desplegar, los plan items aprobados con el hueco ya pasado se redactan (y en Autopilot se publican). Revisar los planes en producción antes de desplegar.
- **M2:** los presets de prompt llegan al escritor como instrucciones; sus variables de plantilla ya no se rellenan. `worker-text` sigue vivo para el caso de uso de topics de `src/domain`.
- **M3b:** al desplegar, los mensajes de cola sin publicación enlazada se descartan (normalmente despublicaciones o borradores de «publicar ahora»). Una despublicación web que falla del todo ya activa el circuit breaker del sitio.
- **Entorno local:** el e2e de Autopilot depende del feed externo; la base local se limpia conservando tenant, usuario QA, sitios y datos del crawl de guiaprogramaciontv.com.
- **M4:** los planes generados antes de este cambio conservan sus `recommendedWordCount*` cortos para guías (350–600 en la prueba). Con tan poco espacio el escritor suprime la tabla y el resumen; el check «Estructura» lo marca. Los planes nuevos ya salen con el rango de la guía.
- **GuíaTV:** responde 500 (no 404) a un `PUT /v2/blog/:id` con id inválido.
- **M4:** los plan items `guide` piden unas 2.300 palabras; los planes ya generados con `recommendedWordCount*` conservan su rango.
- `npm run dev` aborta a veces al reiniciar: `taskkill` falla con un proceso hijo ya cerrado. Una segunda ejecución funciona.

## Verificación
- Tests sueltos: `TS_NODE_TRANSPILE_ONLY=true node --env-file=.env -r ts-node/register --test tests/<f>.test.ts`.
- E2E: `npx playwright test --config e2e/playwright.config.ts <spec>` con `E2E_*` de `.env.example`.
- Recorrido real en guiaprogramaciontv.com con su token existente: plan de 1 día en Asistido y luego en Autopilot.
- UI en el navegador integrado a 1440/1024/390 tras cada hito de UI.
- `graphify update .` tras cada hito.
