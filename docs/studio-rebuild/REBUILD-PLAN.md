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
| M3 · Una puerta, un tick, ciclo de vida | `feat/m3-one-gate-one-tick` | En curso |
| M4 · Plantilla tipo guía + JSON-LD | — | Pendiente |
| M5 · Nueva arquitectura de información | — | Pendiente |
| M6 · Limpieza final | — | Pendiente |

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

### M3 · Una puerta, un tick, ciclo de vida
- **Puerta:** `editorial-engine/publication-gates.ts` es el único evaluador. Los umbrales salen de `AutomationPolicy.autonomousQaThresholds` (90 por defecto). `quality-gate.ts` delega en él. El rango fijo 1200–2200 de `qa.ts` se borra; manda la longitud por tipo de artículo.
- **Tick:** se quita el scheduler embebido en `worker-automation.ts`; queda solo `worker-scheduler.ts`.
- **Ciclo de vida:** nueva `src/studio/article-lifecycle.ts` con `articleState(planItem, job, project, publication)` y el mapeo a los 4 chips. La usan `views.ts` y la API del calendario.
- **Publicaciones legadas:** se deja de escribir en `PublicationJob`.
- **Tests:** `tests/article-lifecycle.test.ts` (tabla de casos), `qa-v2`, `autopilot-mode`, `worker-publishing`.

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

### M6 · Limpieza final
- Migración que borra `PublicationJob` y `PublicationStatus`. Es la única destructiva: solo con backup y tras confirmar 0 escrituras desde M3.
- Se borran rutas y componentes muertos tras M5 y `grant-studio-admin.tmp.ts`.

### Fuera de alcance
- Reescritura automática de artículos antiguos ("Mejoras" en la referencia): idea futura.
- Reddit, Quora, backlinks y analítica de visibilidad en IA.

## Riesgos abiertos
- **M1:** al desplegar, los plan items aprobados con el hueco ya pasado se redactan (y en Autopilot se publican). Revisar los planes en producción antes de desplegar.
- **M2:** los presets de prompt llegan al escritor como instrucciones; sus variables de plantilla ya no se rellenan. `worker-text` sigue vivo para el caso de uso de topics de `src/domain`.
- `npm run dev` aborta a veces al reiniciar: `taskkill` falla con un proceso hijo ya cerrado. Una segunda ejecución funciona.

## Verificación
- Tests sueltos: `TS_NODE_TRANSPILE_ONLY=true node --env-file=.env -r ts-node/register --test tests/<f>.test.ts`.
- E2E: `npx playwright test --config e2e/playwright.config.ts <spec>` con `E2E_*` de `.env.example`.
- Recorrido real en guiaprogramaciontv.com con su token existente: plan de 1 día en Asistido y luego en Autopilot.
- UI en el navegador integrado a 1440/1024/390 tras cada hito de UI.
- `graphify update .` tras cada hito.
