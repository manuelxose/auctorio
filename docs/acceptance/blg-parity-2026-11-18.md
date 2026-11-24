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

### Segunda ronda (v4, tras la revisión del usuario)
El usuario vio en Studio: enlaces sin aspecto de enlace (vista previa y editor), «(own post)» en Lecturas recomendadas, una
tarjeta CTA que no se parecía a la de BLG y ni tarjetas ni imágenes con los colores de la marca.

| # | Fallo | Causa | Arreglo | Test |
|---|---|---|---|---|
| 5 | Enlaces del cuerpo con el color del texto y sin subrayado | el CSS del componente está encapsulado y no alcanza al HTML de `[innerHTML]` | `::ng-deep` en la vista previa; enlaces en color de marca, subrayados y en seminegrita (vista previa y editor) | navegador: `rgb(79,70,229)`, `underline`, 600 |
| 6 | Tarjeta sin estilo en la vista previa; el editor le quitaba `style` y `data-block` (al guardar se perdía) | el sanitizer de Angular en `[innerHTML]` elimina `style` y `data-*` | el HTML ya saneado (servidor / `sanitizeHtml` del editor) se marca como confiable; el editor solo lo hace en `writeValue` | navegador: la tarjeta conserva `style` en vista previa y editor |
| 7 | «(own post)» en el artículo | la marca del brief se copiaba | la instrucción dice que no se escribe y se elimina al guardar | v4: 0 apariciones |
| 8 | Tarjeta básica (borde + botón) y con un color de prueba (`#e4572e`) | diseño mínimo de M5; sin colores del sitio | tarjeta estilo BLG solo con estilos en línea (cabecera oscura con píldora de marca, logo y dominio, titular de 22 px, barra de acento, botón «Visitar →», halo del color de marca) que pasa los saneadores de publicación; `brand-colors.ts` crawlea portada + CSS (color saturado más usado, `theme-color` oscuro, icono) con caché de 30 días, y rellena lo vacío de Branding | `tests/brand-palette-expand.test.ts`, `tests/brand-cards.test.ts` |
| 9 | Imágenes sin los colores de marca | el prompt no llevaba paleta | `brand_colors` en las opciones de cada imagen → «Brand palette: #1ed760, #121212…» en el prompt | idem; las 3 imágenes de v4 lo llevan |
| 10 | Longitud variable (v3: 1.493) | variación del modelo | paso «ampliar»: si el cuerpo (sin TOC, tarjetas, Fuentes ni Recomendaciones) queda por debajo del 85 % del mínimo, una segunda pasada pide la misma envoltura con más detalle y se queda la versión más larga | `tests/production-pipeline.test.ts` |

| 11 | Atribuciones en el texto sin enlace («Según television.digital.gob.es…», «TDTChannels»): v4 tenía 0 enlaces externos en el cuerpo, los 23 solo en Fuentes | el redactor nombra la fuente pero no la enlaza | `linkInlineAttributions`: la primera mención sin enlazar del editor o dominio de cada fuente del ledger se enlaza a su URL, una vez por URL, fuera de tarjetas, TOC, FAQ y listas finales (sobre el HTML de v4: 19 enlaces en el texto) | `tests/brand-palette-expand.test.ts` |
| 12 | «Según facebook.com», «según youtube.com» como fuentes | la SERP incluía redes sociales | redes sociales y YouTube no son fuentes citables (el vídeo ya va como bloque propio) | idem |

| 13 | `editorial-engine` intermitente (~1 de cada 10 pasadas, un escenario distinto cada vez) | la QA editorial leía como «año inventado» los dígitos de identificadores y dominios del texto: el sufijo aleatorio del fixture (`eng-…-1847-site`, `….example.com`) → «year 1847 does not appear in the fact ledger» → `reject`. En producción pasaría igual con un dominio o nombre tipo `radio2024.es` | `proseForDateChecks` quita URLs, dominios e identificadores con guiones que mezclan letras y dígitos antes de buscar años/fechas; los rangos de la prosa («2024-2025») y los años inventados («en 1931») siguen detectándose | nuevo test en `tests/editorial-engine.test.ts`; con el sufijo «1847» forzado solo en la semilla del fixture: 1/11 sin el arreglo, 11/11 con él; 15 pasadas seguidas en verde |

Los tests de `editorial-engine` y `production-pipeline` no gastan IA (redactor falso), así que respetan el tope de modelo.

En la BD local se vació el `primaryColor` de prueba de GuíaTV (`#e4572e`) para que se aplique la paleta crawleada
(`#1ed760` / `#121212`, logo `assets/logo.svg`).

**v4** (Regenerate): 10/10 checks, QA 100, **2.000 palabras de cuerpo**, 14 H2, tabla, resumen, TOC, 26 internos (22 URLs),
23 externos todos en Fuentes, 5 FAQ, link card estilo BLG en verde/negro de la marca, 5 recomendaciones sin «(own post)»,
3 imágenes de cuerpo con alt y sin metadatos, slug `canales-de-television-gratis`. El paso «ampliar» se disparó con
2.000/2.001 y su salida no cupo en 8.000 tokens, así que se conservó el borrador; por eso el umbral pasa a ser el 85 %.

**v5** (Regenerate tras #11–#12): 10/10 checks, QA 100, 1.857 palabras de cuerpo (≥1.700; por encima del 85 % del mínimo,
sin pasada «ampliar»), **19 enlaces externos en el texto + 20 en Fuentes** (como BLG, cada fuente ~2 veces; 1 página de
Tivify enlazada en el texto con otra URL que la de Fuentes), 0 redes sociales, tarjeta en el verde de la marca, sin «(own post)»,
5 FAQ, 5 recomendaciones, 3 imágenes de cuerpo, slug `canales-de-television-gratis`.

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

## Cierre de Social SEO M5 — Reddit y Quora (2026-11-19)

**Aceptado en local.** La implementación está en `e32ba55`. Se aplicaron las migraciones de la bandeja y de puntuación. La API y el worker de discovery se reiniciaron con Tavily como proveedor de búsqueda y la credencial en el `.env` local ignorado por Git.

| Plataforma | Oportunidades nuevas en GuiaProgramacionTV | Borrador y estado |
| --- | ---: | --- |
| Reddit | 24 | Borrador generado, guardado y recuperado con estado «Respondida». |
| Quora | 35 | Borrador generado, guardado y recuperado con estado «Respondida». |

- Se ejecutó el refresco real mediante operaciones del backend con las palabras clave del sitio de pruebas. Ambas operaciones terminaron en `succeeded`. La búsqueda directa de Reddit devolvió HTTP 403 y Tavily aportó resultados para ambas plataformas.
- La generación recibió el tono de marca configurado para el sitio de pruebas. Anthropic rechazó las peticiones por falta de saldo y el proveedor alternativo configurado, DeepSeek, generó ambos textos. Tras comprobar la persistencia de «Respondida», los dos borradores volvieron a «Por responder» para revisión manual.
- La validación de M5 incluyó 54 pruebas de backend, 6 de navegación de Studio, la comprobación de tipos y la compilación de producción de Studio. Chrome permitió inspeccionar las dos bandejas con una sesión existente. Los casos de Playwright en [engagement.spec.ts](../../e2e/specs/engagement.spec.ts) se enumeraron, pero el acceso automatizado con las credenciales de prueba devolvió HTTP 403. La aceptación con datos reales se verificó mediante el backend y PostgreSQL.
