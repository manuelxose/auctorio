# STUDIO-11 — Validación integral del recorrido SaaS con GuíaTV en modo seguro (2026-11-16)

Rama `feat/editorial-operating-system` (HEAD antes de este trabajo: `06c108d`). Revisión independiente: no realizada, por instrucción del propietario. Sin despliegue, sin publicación real, sin migraciones, sin rotación de credenciales.

## Entorno
- BD local reseteada desde cero (`prisma migrate reset`, 34 migraciones, Redis vaciado). Aprovisionado como un operador: tenant `Auctorio`, sitio `guiatv-editorial` (https://guiaprogramaciontv.com, `GUIATV_AUCTORIO_ADMIN_KEY`), sitio ficticio `tecnoria-main`, cuenta QA `qa.visual@auctorio.localhost` (admin).
- `npm run dev`: API 4301, Studio 4420, 9 workers. `PUBLISH_DRY_RUN=true`: el publicador de GuíaTV devuelve un resultado simulado y **no escribe** en guiaprogramaciontv.com. El rastreo del sitio sí es real (solo GET).
- Proveedor IA elegido como lo haría un admin (Ajustes → IA, `PUT /v2/ai/provider` y `/v2/ai/image-provider`): DeepSeek `deepseek-chat` (texto) y OpenAI `gpt-image-1-mini` (imagen), con las claves de prueba del `.env`.

## Hallazgos y correcciones
| # | Problema | Clase | Causa raíz | Corrección |
|---|---|---|---|---|
| 1 | Una fuente "sitemap" que apunta a un **índice de sitemaps** guarda como items los propios sub-sitemaps (`sitemap blog.xml`, `programs.xml`…). La pestaña Evidencia sale vacía y el **autopilot llegó a crear artículos titulados "sitemap blog.xml"** | CONFIRMED RUNTIME + CODE | `parseSitemapItems` devuelve las entradas del índice "para que el llamador las expanda", pero ningún llamador lo hacía | `SitemapAdapter.discover` expande un nivel: descarga hasta 5 sub-sitemaps (los de `lastmod` más reciente, respetando robots), devuelve sus páginas y descarta las entradas del índice; un sub-sitemap roto no tumba la fuente. Test `tests/sitemap-adapter-index.test.ts` |
| 2 | Tras generar un artículo, el QA marca **`qa_failed` falso** ("1 imagen, faltan 3") durante ~2 min mientras las imágenes inline siguen en cola; luego pasa a `qa_passed` (89) | CONFIRMED RUNTIME + CODE | `syncImageResultToStudio` evaluaba QA en cuanto existía la hero, sin esperar a las inline | El QA no se ejecuta mientras haya imágenes inline `queued`/`processing` de la versión; la última en llegar (o en **fallar** definitivamente, nuevo camino en `worker-image`) lo relanza. Test `tests/inline-image-qa.test.ts` |
| 3 | `scripts/qa-visual-login.ts` falla en un tenant recién aprovisionado ("No admin role") | CONFIRMED CODE | no sembraba los roles del tenant | llama a `listStudioRoles` (bootstrap) antes de buscar el rol |
| 4 | `site-onboarding` "hung step" falla de forma reproducible | CONFIRMED CODE (test) | `ONBOARDING_STEP_TIMEOUT_MS=100` aplica a todos los pasos; `index`/`profile` reales superan 100 ms y fallan antes de llegar a `strategy` | timeout de test 2000 ms |
| 5 | Ningún test probaba que **Manual** nunca auto-aprueba ni programa | CONFIRMED CODE (hueco) | — | nuevo test en `tests/autopilot-planner.test.ts` |
| 6 | Specs e2e desfasados respecto al contrato actual | CONFIRMED CODE (tests) | `create-project` exige `siteId` explícito; el UUID nulo se rechaza con 400 estructurado; la automatización corre en el worker `control`; el spec de autopilot esperaba 50 s y el tick es de 120 s | specs actualizados (`production-journey`, `autopilot-golden-path`) |
| 7 | Un workspace nuevo sin proveedor IA genera planes que fallan con `EDITORIAL_PLAN_STRUCTURED_OUTPUT_INVALID` | CURRENT RUNTIME (comportamiento esperado) | cae al proveedor `mock` | no se cambia: el admin debe elegir proveedor. Riesgo UX anotado abajo |
| 8 | Plan 7×3: `partial`, 18/21 huecos | CURRENT RUNTIME (honesto) | la guarda de relevancia (score 38–39 < 45) y la deduplicación descartan briefs; inventario indexado pequeño | no se maquilla; el plan explica los huecos |
| 9 | Tras suspender el equipo, el worker de imágenes quedó con 1 job activo colgado y 25 en cola (concurrencia 1) | CURRENT RUNTIME HYPOTHESIS | no se recuperó tras la suspensión del host; `staleWorkers:1` en el watchdog | reinicio del stack; riesgo anotado |
| 10 | Regresión introducida por #2 y detectada en runtime: con el proyecto en `draft` (estado real tras producción) el QA nunca llegaba a ejecutarse | CONFIRMED RUNTIME (propia) | el camino inline solo refrescaba QA en `ai_generated/qa_failed/qa_passed/in_review`; antes la hero lo ejecutaba sin mirar el estado | constante `QA_REFRESHABLE_STATUSES` incluye `draft`; el test usa `draft` y falla sin el arreglo |

| 11 | `POST /v2/projects/:id/generate` (y `/revise`) con una generación en curso abre **una segunda versión en paralelo** (doble gasto de texto e imágenes; un doble clic basta) | CONFIRMED RUNTIME + CODE | `startProjectGeneration` no comprobaba si la última versión seguía escribiéndose; el spec de journey lo hacía tras `create-project`, que ya genera | 409 `generation_in_flight` en las rutas humanas mientras el texto de la última versión esté `queued`/`processing` y se haya tocado en los últimos 30 min (un job perdido no bloquea para siempre). Automatización sin cambios. Test `tests/generation-in-flight.test.ts` |

| 12 | `/generate` con un `promptPresetVersionId` inexistente o de otro tenant respondía 202 y lanzaba una generación real (de pago) ignorando el preset; en el e2e regeneró un artículo ya aprobado y lo devolvió a `ai_generated` | CONFIRMED RUNTIME + CODE | el id se pasaba al worker sin comprobarlo | 404 si el preset no existe en el tenant. Test en `tests/studio-routes.test.ts` |
| 13 | El test e2e "publisher failure" creaba una publicación para *ahora* y llamaba a `publish-now` aunque no hubiera `E2E_ALLOW_REAL_PUBLISH`: contra un entorno real habría **publicado de verdad en GuíaTV** | CONFIRMED CODE (test, riesgo alto) | el resto del spec respetaba la bandera, ese test no | sin la bandera solo comprueba un 404 estructurado sobre una publicación inexistente |

Resultado tras la segunda iteración: `production-journey` **6/6 PASS** (proyecto "Movistar Plus lanza el tráiler…", una sola versión, QA 91, aprobado, programado y cancelado). `autopilot-golden-path` **4/4 PASS** (12 min): crea proyectos temáticos desde vertele.com que llegan a `qa_passed` sin falso fallo; la puerta autónoma estricta los bloquea (intención no definida, palabras, 0 enlaces internos, SEO 75 < 90, marcador de posición) y, tras agotar las reparaciones, el proyecto termina en `intervention_required` sin ninguna publicación, salida segura que el spec acepta. La política volvió a Manual. **No queda demostrado** el camino feliz hasta publicar: las reparaciones automáticas no cambian el contenido (QA 91→91).

Specs live corregidos (segunda iteración): `production-journey` ya no lanza una segunda generación (espera 409), espera el veredicto QA real (hasta 6,5 min), acepta la puerta de QA como resultado válido, toma el primer item no cubierto y usa el estado `canceled` del enum; `autopilot-golden-path` usa un feed de TV en español (`vertele.com`) en lugar de Hacker News, respeta el umbral de relevancia por defecto, calcula el cupo diario ya usado y pide solo uno más, filtra por proyectos de esta ejecución, espera hasta 12 min al pipeline y restaura también `minimumStoryScore`.

Incidencia de la propia verificación: al detener un run e2e a mitad, el `afterAll` del spec de autopilot no restauró la política y GuíaTV quedó en **autopilot** ~10 min; generó borradores automáticos (destino simulado, nada publicado). Se devolvió a Manual por API y se limpiaron los jobs de imagen sobrantes (BD local desechable).

## Pruebas ejecutadas
- `npm run typecheck` PASS. `npm run build:studio` PASS (dentro de `npm test`).
- Backend (`node --test`, 507 tests): 504/507 en la primera pasada. Las 2 de `phase5-operations` solo fallan con workers de dev vivos compitiendo por la cola (pasan con ellos parados); la de `site-onboarding` corregida (#4). Tras los cambios, suites afectadas 123/124: el fallo es `ONB-01`, intermitente bajo carga (pasa/falla en pasadas consecutivas; inestabilidad conocida desde STUDIO-01). Nuevos: sitemap índice 1/1, inline QA 1/1 (falla sin el arreglo), planner 4/4.
- Angular `ng test` 35/35.
- Playwright suite completa sobre BD limpia: 26 OK / 10 fallos / 2 omitidos. Tras correcciones, re-ejecutados los fallidos:
  - `guiatv-seo-golden-path`: 1, 2.1, 2.2, 3, 4 PASS; 2.3 PARTIAL (#8).
  - `sources-flow` 2/2, `calendar-publications` 1/1 PASS.
  - `production-journey`: tras la segunda iteración 6/6 (ver arriba).
  - `autopilot-golden-path`: tras la segunda iteración 4/4 (ver arriba), con salida `intervention_required`.
- Capturas 1440/1024/390 de Overview, Plan, Contenido, Calendario, Publicaciones y Fuentes: `docs/studio-rebuild/evidence/studio-11/` (0 errores de consola, sin desbordamiento horizontal).
- No ejecutado: auditoría axe (no instalada), lectores de pantalla, publicación real o borrador real en GuíaTV (no autorizado), despliegue.

## Recorrido GuíaTV (evidencia por etapa)
| Etapa | Resultado | Evidencia |
|---|---|---|
| Rastreo real del sitio | PASS | e2e golden 1 (2,2 min, páginas reales extraídas) |
| Fuentes → evidencia | PASS tras #1 | `sources-flow` 2/2 |
| Plan 7×1 / 7×2 | PASS | golden 2.1 / 2.2 (7 y 14 briefs en su fecha, en Calendario como propuestas) |
| Plan 7×3 | PARTIAL | 18/21, huecos explicados (#8) |
| Brief → artículo + imágenes + QA | PASS | golden 3: proyecto `f6898faa-7a24-43fa-a4a5-ac6d6654929c` ("Miniseries de casos reales en Netflix: dónde ver…"), QA 89, 3 imágenes inline; la versión queda en `draft` sin veredicto hasta la última imagen |
| Programación | PASS | `calendar-publications` (una sola publicación canónica, guarda de fecha pasada) |
| Publicación borrador (destino simulado) | PASS (simulado) | golden 4: `draft_synced`, `externalId=dryrun-e1589426b0620982`, URL `…/dry-run/…`; ninguna escritura en guiaprogramaciontv.com |
| Modos Manual/Asistido/Autopilot | PASS (unit) / PARTIAL (e2e) | `autopilot-planner` 4/4 (Manual y Asistido nunca publican; Autopilot solo tras la puerta de QA); e2e autopilot 4/4 pero termina en `intervention_required`, sin camino feliz hasta publicar |
| Aislamiento de tenants y roles | PASS | `tenant-isolation`, `site-isolation`, `studio-rbac-matrix`, e2e `studio-role-separation` 4/4, `connection-installer` 5/5 |

## Veredictos por dimensión
| Dimensión | Veredicto | Motivo |
|---|---|---|
| IMPLEMENTATION | PASS | 3 defectos de producto corregidos con test (sitemap índice, QA falso, regresión `draft`); typecheck y build OK |
| FUNCTIONALITY | PARTIAL | golden path GuíaTV y production-journey en verde con IA real; autopilot e2e verde solo por la salida segura; 7×3 parcial; auto-reparación ineficaz |
| UX/UI | PARTIAL | 18 capturas en 3 anchos, 0 errores de consola, sin desbordamiento; sin comparación antes/después (no hubo cambios de UI) |
| ACCESSIBILITY | PARTIAL | e2e de teclado/foco (`studio-shell-nav`, `site-intelligence-coverage`) OK; sin axe ni lector de pantalla |
| SECURITY | PASS | aislamiento de tenant/sitio y matriz RBAC en verde; ningún secreto en logs, capturas ni commit |
| INTEGRATION | PARTIAL | Site→Source→Plan→Job→Version→Publication verificado con destino simulado; destino real no probado |
| REGRESSION | PARTIAL | suites afectadas en verde salvo `ONB-01` intermitente; specs live en verde tras corregirlos |
| PRODUCTION READINESS | BLOCKED | sin despliegue ni escritura real en GuíaTV autorizados; worker de imágenes no se recupera tras suspensión |

## Riesgos pendientes
- Workspace nuevo sin proveedor IA: el plan falla con un código técnico en vez de pedir al admin que elija proveedor.
- Un worker que no se recupera tras suspensión del host bloquea toda la cola de imágenes (concurrencia 1); el watchdog lo detecta (`staleWorkers`) pero no lo reinicia.
- Las fuentes sitemap ya guardadas con entradas de índice conservan esos items hasta que se archiven o se limpien; el arreglo solo evita nuevos.
- Plan 7×3 con DeepSeek sobre un inventario pequeño no llena todos los huecos.
- Las imágenes se generan en serie (concurrencia 1, ~40 s cada una): un artículo tarda ~3 min en tener veredicto QA y cualquier cola previa lo retrasa.
- Los specs live `production-journey` y `autopilot-golden-path` siguen con esperas cortas; si se interrumpen, el de autopilot deja el sitio en autopilot.
- Auto-reparación del autopilot ineficaz: dos intentos por proyecto sin cambio de contenido (QA 91→91), así que todo lo que no supera la puerta estricta acaba en intervención manual.
- Rollback: revertir el commit; sin cambios de esquema.

## Siguiente prompt recomendado
Endurecer la preparación para producción: (0) que la auto-reparación corrija de verdad intención, extensión, enlaces internos y marcadores de posición, (1) mensaje accionable cuando no hay proveedor IA, (2) auto-recuperación de workers atascados tras suspensión, (3) limpieza de items de índice ya guardados, (4) prueba de borrador real en GuíaTV con autorización explícita del propietario (crear/eliminar borrador).
