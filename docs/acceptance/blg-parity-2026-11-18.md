# Aceptación BLG (sección 4 de `docs/prompts/blg-article-parity.md`) y medición de BLG — 2026-11-18

Rama `feat/m6-final-cleanup`. Sin revisión independiente (por instrucción). Local: `npm run dev` (Studio 4420, API 4301),
BD local desechable, `PUBLISH_DRY_RUN=true` (nada se publica en guiaprogramaciontv.com). Sitio `guiatv-editorial`.

## Entorno y modelo
- Texto: el sitio se puso en **Anthropic `claude-sonnet-5-5`** (Settings › AI). La cuenta de Anthropic del `.env` **no tiene
  saldo** («credit balance is too low»): la primera generación falló en `write`. Eso destapó que no había fallback (ver #1).
  Con el arreglo, la cadena es Sonnet 5.5 → fallback explícito **DeepSeek `deepseek-chat`**; los artículos de esta prueba los
  escribió DeepSeek (evento `ai.text.fallback` en el log). Nunca Opus.
- El adaptador de Anthropic no envía `effort`; si se recarga saldo, Sonnet corre con el esfuerzo por defecto de la API (no
  hay ajuste de esfuerzo en la app).
- Imágenes: OpenAI `gpt-image-1-mini`. Métricas: DataForSEO (Labs, España).

## Recorrido
1. **Add keywords** «canales de televisión gratis» (+ duplicado y variante) → los 3 descartados: duplicado y `already_planned`.
   Correcto: GuíaTV ya publica `/guias/canales-de-television-gratis` (el artículo de BLG), así que el guard de canibalización
   actúa. Para generar el artículo de la prueba se añadieron «ver tdt por internet» y «series de abogados» (+ duplicado → `duplicate`)
   y se usó **Cambiar tema** en el primero → «canales de televisión gratis», que vuelve a medir: **1.600 / KD 21**
   (idéntico a BLG).
2. **Añadir instrucciones** en «series de abogados» → `metadata.generation.instructions`, llega al redactor como
   «Editor instructions». **Eliminar** → 200.
3. **Generar desde el plan** (`generate-content`) → proyecto `52eb13b6-f238-45da-89c9-b06f176d48f1`.
4. **Regenerate** (`POST /v2/projects/:id/generate`) → v2 salió con plantilla de noticia (ver #4); tras el arreglo, v3.

## Criterios (sección 4)

Artículo «Canales de televisión gratis…», proyecto `52eb13b6…`. v1 = generación desde el plan; v3 = Regenerate tras los arreglos.

| Criterio | Objetivo | v1 | v3 | Resultado |
|---|---|---|---|---|
| Palabras | ≥1.700 | 2.341 cuerpo (2.674 total) | 1.493 cuerpo (1.954 según QA, que cuenta TOC y fuentes) | **v1 PASS · v3 FAIL** (ver abajo) |
| Resumen («En resumen») | sí | sí | sí | PASS |
| TOC | sí | sí | sí (13 anclas) | PASS |
| H2 con forma de subconsulta | ≥6 | 11 de cuerpo | 9 de cuerpo («Cómo ver la TDT gratis en el televisor», «Qué canales FAST se pueden ver gratis en Smart TV»…) | PASS |
| Tabla | ≥1 | 1 | 1 | PASS |
| Enlaces internos a URLs reales del sitemap | ≥15 | ~27 (todas en `SiteIndexedPage`) | 28 (23 únicas; 0 fuera del sitemap) | PASS |
| Externos, todos en «Fuentes» | ≥8 | 20 / 20 en Fuentes | 25 / 25 en Fuentes | PASS |
| FAQ | 5 | 5 | 5 | PASS |
| Link card | sí | sí | sí | PASS |
| Párrafo promo (H2 de marca) | sí | «GuiaProgramacionTV: la guía para no perderte nada…» | «GuiaProgramacionTV: tu guía para no perderte nada» | PASS |
| Recomendaciones | 3–5 | 5 | 5 | PASS |
| Imágenes con alt y sin metadatos | 3 | portada + 3, alt 3/3, `metadata_stripped` 4/4 | portada + 3, alt 3/3, `metadata_stripped` 4/4 | PASS |
| JSON-LD válido | Article + FAQPage + Breadcrumb | Article, BreadcrumbList, FAQPage (5) | ídem | PASS |
| Title sin cortar | 35–70 | 55 car. | 55 car. | PASS |
| Slug | ≤60 | 70 car., del titular | `canales-de-television-gratis` (28) | **v1 FAIL → arreglado (#3)** |
| Checks | 10/10 | 9/10 (internos «0», bug #2; duplicado: real) | **10/10**, QA 100 | **PASS tras #2** |
| Panel del artículo | — | — | «10/10 checks», Searches/mo 1.600, Difficulty 21 Easy, palabras, imágenes 4, internos 28, externos 25, slug 28/60, meta 138/160, «No AI watermark metadata» | PASS |

**Palabras (abierto)**: el objetivo del item es 2.001–2.599 y la QA acepta −15 % sobre el texto completo (1.954 ≥ 1.701),
pero con el mismo criterio que el panel de BLG (sin TOC, link card, Fuentes ni Recomendaciones) v3 se queda en 1.493. La
longitud varía entre ejecuciones del mismo modelo (v1: 2.341 con el mismo prompt) y el JSON llegó completo (no es tope de
tokens). No se maquilla: queda como pendiente un paso de «ampliar» cuando el cuerpo no llegue al mínimo.

## Calendario y métricas
| Criterio | Resultado |
|---|---|
| Tarjeta en cola: keyword, Difficulty, Volume, tipo | PASS — vista lista: «series de abogados · Explainer · KD 0 · 1K/mo», «qué ver en max · KD 2 · 10/mo» (BLG: KD 2, 10) |
| Contadores | PASS — Queued 2 · Drafting 0 · Review 1 · Published 0 · Failed 0 |
| Add keywords deduplica y programa | PASS — duplicado → `duplicate`, ya cubierta → `already_planned`; nuevas en los huecos siguientes (19, 20, 21 nov 09:00) |
| Cambiar tema / Añadir instrucciones / Eliminar | PASS — re-mide métricas / guarda en `generation.instructions` / 200 |
| Ningún volumen sin `keywordMetricsSource` | PASS — `count(searchVolume != null AND keywordMetricsSource IS NULL) = 0` en toda la BD |

## Hallazgos y arreglos (causa raíz, código compartido)
| # | Fallo | Causa | Arreglo | Test |
|---|---|---|---|---|
| 1 | Sin saldo en el proveedor elegido, la generación falla; no hay fallback ni modelo por uso | `getTextProvider()` construía un único proveedor | `textChain`: modelo del uso → fallback explícito → resto de proveedores con clave (modelo por defecto). `FallbackTextProvider` pasa al siguiente si uno falla. Modelos por uso (planes, artículos, reparación, social, Copilot) y fallback en Settings › AI (columnas `uses`/`fallback`, migración `20261118140000`) | `tests/ai-fallback.test.ts` |
| 2 | Checklist: «0 internos / 46 externos» con 35 internos reales | contaba como internos solo `href` relativos; el redactor escribe URLs absolutas del propio dominio | `countLinks(html, siteUrl)` clasifica por host (con/sin `www`); `siteUrl` viaja en los metadatos del proyecto; también en `qa.ts` y `editorial-qa.ts` | `tests/link-count-slug.test.ts` |
| 3 | Slug de 70 car. desde el titular | `slugify(title, 90)` cortando a mitad de palabra | guías: slug de la keyword, ≤60, corte por palabra | `tests/link-count-slug.test.ts` |
| 4 | Regenerate de una guía del plan → plantilla de noticia (sin resumen, FAQ, fuentes ni link card) | `startProductionForProject` siempre lanzaba `kind: "manual"` | proyectos con `editorialPlanItemId` (web) se regeneran por `plan_item` (`rerun`), nueva versión del mismo proyecto | `tests/production-pipeline.test.ts` |

No es fallo: «Riesgo de duplicado» en v1 — GuíaTV ya tiene una guía con esa keyword (la de BLG).

## Medición BLG (sesión iniciada, Playwright; no pidió login)
Panel «Article data» de BLG (y recuento del DOM del `<article>`, que incluye TOC, link card, Fuentes y Recomendaciones):

| Artículo BLG | Keyword · vol · KD | Palabras | Imágenes | Internos (panel / URLs únicas) | Externos (panel / URLs únicas) | H2/H3 | Tablas | Checks |
|---|---|---|---|---|---|---|---|---|
| Canales de televisión gratis en España: TDT y online (1119398) | canales de televisión gratis · 1600 · 21 | 2.112 | 3 | 24 / 20 | 27 / 13 | 13/14 | 1 | 10/10 |
| Series de suspense: qué ver en España y dónde verlas (1123698) | series de suspense · 9900 · 2 | 1.982 | 4 | 18 / 16 | 27 / 13 | 12/11 | 2 | 10/10 |
| Fórmula 1 en televisión: dónde verla en España (1104094) | fórmula 1 en televisión · 10 · 4 | 2.198 | 4 | 13 / 9 | 32 / 11 | 13/7 | 3 | 10/10 |

BLG enlaza cada fuente ~2 veces (en el texto y en «Fuentes»): 27–32 enlaces externos son solo 11–13 URLs distintas.
Calendario BLG: 8 Published · 1 Generated · 26 Queued; tarjetas en cola con keyword, Difficulty, Volume y tipo.

**Nuestro artículo frente a BLG** (misma keyword, mismo sitio):

| | BLG 1119398 | Auctorio v3 |
|---|---|---|
| Palabras (criterio del panel) | 2.112 | 1.954 (QA) / 1.493 solo cuerpo |
| Imágenes | 3 | 4 (portada + 3) |
| Internos | 24 (20 URLs) | 28 (23 URLs) |
| Externos | 27 (13 URLs) | 25 (25 URLs, una vez cada una) |
| H2 / H3 / tablas | 13 / 14 / 1 | 13 / 5 / 1 |
| FAQ / Fuentes / Recomendaciones | 5 / 13 / 4 | 5 / 25 / 5 |
| Checks | 10/10 | 10/10 |
| Keyword · vol · KD | 1600 · 21 | 1600 · 21 (DataForSEO) |

Diferencias: BLG es más largo y usa más H3; nosotros citamos más fuentes distintas y enlazamos cada una una sola vez.

## Pruebas
- `npm run build` + `node --test`: `ai-fallback` 2/2, `link-count-slug` 2/2, `production-pipeline` 13/13 (incluye el nuevo de
  Regenerate), `ai-settings` 3/3, `guide-template` 15/15, `editorial-engine` 24/24, `brand-cards` 6/6, `visuals` 5/5,
  `qa` 4/4, `qa-v2` 6/6, `autonomous-quality-gate` 13/13, `editorial-plan-v2` 17/17, `keyword-candidates` 6/6,
  `keyword-metrics` 3/3, `plan-keywords` 1/1, `blg-leftovers` 5/5, `publishers` 26/26, `studio-routes` 15/15,
  `generation-in-flight` 1/1. `tsc --noEmit` (backend y Studio) limpio.
- UI (navegador integrado): Settings › AI muestra «Model per use» (5 usos + Fallback) y carga el fallback guardado; Calendario
  en vista lista con keyword/KD/volumen/tipo; panel del artículo v3.
- Incidencias de la sesión: Docker parado y el puerto 55432 dentro de un rango reservado de Windows (el usuario movió Postgres
  a 55543); los tests de BD reescriben la cuenta QA local, que se volvió a sembrar con `scripts/qa-visual-login.ts`.
- No ejecutado: publicación real, aceptación con Sonnet escribiendo (sin saldo), revisión independiente.
