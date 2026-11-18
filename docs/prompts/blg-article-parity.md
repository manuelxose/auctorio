# Prompt — Paridad con el modelo de artículo de BabyLoveGrowth (BLG)

> Análisis hecho el 2026-11-17 con Playwright sobre la cuenta BLG de guiaprogramaciontv.com
> (artículo 1119398 «Canales de televisión gratis en España: TDT y online», ajustes y content plan)
> y comparado con nuestro artículo `92d27698-af4d-43b6-947c-3952d0576622` leído de la BD local.
> Sin paso de revisión independiente.

---

## 0. Objetivo

Que Auctorio produzca, por defecto para sitios tipo guía/servicio, artículos **keyword-first** con la misma
anatomía, densidad de enlaces, panel de datos y opciones de personalización que BLG, y un **calendario
de contenido basado en palabra clave + dificultad + volumen**. Reutilizar lo que ya existe
(`src/studio/editorial-engine/structure.ts`, `EditorialPlanItem`, `SitePlanningSettings.articleTargets`,
`SiteIndexedPage`, `qa.ts`, `quality-checklist.ts`, `AuRichEditorComponent`, `ArticleSettingsCardComponent`,
`PlanningDefaultsCardComponent`, `Competitor`). No duplicar modelos.

Regla dura que se mantiene: **el motor nunca inventa volumen de búsqueda**
(`seo-package.ts → searchVolumeDisclaimer`). Volumen y dificultad solo vienen de un proveedor real; si no hay
proveedor, el campo es `null` y la UI muestra «—».

Regla de pruebas: **todo test que gaste IA** (generar artículos o planes de prueba, comprobaciones en vivo de
proveedores, «Fix with AI», subagentes o sesiones de test) usa como máximo `claude-sonnet-5-5` con esfuerzo
medio (Haiku vale; Opus nunca). El modelo por defecto de Anthropic en la app es Opus 5.5: cambiar el sitio a
Sonnet 5.5 antes de generar contenido de prueba.

Estado de datos (2026-11-18): en la BD local se borraron todos los artículos, planes e items de GuíaTV,
generados antes de M3/M4 (el sitio y sus ajustes siguen). Studio ya tiene **Delete** en el plan
(`/studio/plan`) y en cada sitio (Settings › Sites) para limpiar entre pruebas.

---

## 1. Qué hace BLG (referencia exacta)

### 1.1 Anatomía del artículo (orden de bloques)

| # | Bloque | Detalle observado |
|---|--------|-------------------|
| 1 | Fecha + H1 | H1 = keyword + matiz geográfico/intención («…en España: TDT y online»). |
| 2 | Portada | Foto realista sin texto, alt descriptivo, metadatos IA (C2PA) eliminados («No AI watermark metadata»). |
| 3 | Intro *answer-first* (2 párrafos) | P1 responde la consulta en la primera frase y presenta la marca con su propuesta de valor («…esa es la función de Guía Programación TV, que reúne…»). P2 anuncia el alcance («Este artículo expone qué…, cómo…, qué… y cómo…»). |
| 4 | **Link card** (CTA) | Tarjeta: nombre del sitio, dominio, titular («Encuentra qué se emite ahora»), 1 frase, botón «Visitar» → home. |
| 5 | H2 «En resumen» | 4 viñetas TL;DR, cada una un hecho autónomo. Alternativa configurable: «Key takeaways» (frase-tesis + tabla Punto/Detalle). |
| 6 | H2 «Tabla de contenidos» | Lista con ancla a cada H2 siguiente. |
| 7 | Cuerpo: 8 H2 + 11 H3 | H2 con forma de subconsulta («Qué canales… son gratuitos», «Cómo ver… por internet», «Películas en…»). 1 tabla (Grupo / Canales / Dónde se ven), listas `ul`, `ol` para pasos, 2 imágenes de cuerpo. |
| 8 | Atribución inline | «Según X…», «OCU señala que…», «Xataka aconseja…», con fecha («en mayo de 2026») y cifra («cerca de 100.000 horas»). Cada afirmación enlaza a su fuente. |
| 9 | Enlaces internos contextuales | 24 enlaces internos con anchor descriptivo a páginas reales del sitemap (`/guia-canales`, películas hoy, fichas ETB1/ETB2, comparador streaming, guías Ley 13/2022, protección de menores, deporte…). |
| 10 | Párrafo promo | H2 de marca antes del FAQ («Una consulta única para todos los canales»): qué hace el producto + 2 enlaces + imagen de marca + enlace «sobre nosotros». |
| 11 | H2 «Preguntas frecuentes» | 5 H3 en forma de pregunta, respuestas de 2–4 frases autosuficientes. |
| 12 | H2 «Fuentes» | 13 fuentes «Título, Editor» enlazadas (27 enlaces externos en total en el artículo). |
| 13 | H2 «Recomendaciones» | 4 enlaces a otros posts del blog del mismo sitio (Recommended reads). |
| 14 | Atribución BLG | (no aplica a nosotros). |

Registro: castellano impersonal y preciso («se abre», «conviene», «se comprueba»), comillas «», sin
relleno, sin H2 «Conclusión». ~2.100 palabras, 5 keywords, 3 imágenes.

### 1.2 Panel lateral del artículo

- **Built for AI Search — 10 checks passed**, desplegable con un párrafo de racional (intención, audiencia,
  cómo el artículo lleva al producto) y los checks: *Answer-first writing, Credible source, Optimal structure,
  Internal links, Statistics data points, Plagiarism check passed, Image alt texts, Semantic keywords,
  Optimized meta tags, JSON-LD schema*. Enlace «Customize future articles» → ajustes de escritura.
- **Published URL** (link externo).
- **Article data**: Target keyword · Searches/mo (1600) · Difficulty (21 + chip «Easy») · Word count ·
  Keywords (5, con tooltip listándolas) · Images · Internal links · External links — cada fila con punto
  verde/ámbar según cumpla objetivo.
- **Slug** editable · **Meta description** editable con contador `152/160` y barra de progreso.
- **Cover image** reemplazable + badge «No AI watermark metadata».
- Botón de estado (**Published**) · **Export article** · feedback 👍/👎.
- **Edit article**: editor con Undo/Redo, B/I/U/S, H1–H3, Párrafo, listas, cita, separador, alineación,
  enlace, tabla, imagen, YouTube, limpiar formato; Discard / Save & Close.

### 1.3 Personalización («Customize future articles»)

**Writing**
- Instrucciones de escritura libres (marca, palabras/afirmaciones a evitar, tono, audiencia) con ejemplos.
- Longitud: *Dinámica (según intención)* · 1.200–1.600 · 1.700–2.300 · 2.400–2.800.
- Interruptores: Author perspective, TOC, Recommended reads, Sources section, Citations,
  Mention competitors when relevant, JSON-LD, Summary (variante TL;DR o Key takeaways).
- Internal linking: activar, prefijo `www`, barra final `/`.
- Disclaimer opcional al final.

**Visuals**: instrucciones de imagen; estilo de portada (Realistic…); estilo de imágenes de cuerpo o
«usar solo mi Media Library»; infografía (estilo Editorial) generada de la sección con pasos/cifras/comparación,
máx. 1 por artículo; vídeo de YouTube (1 por artículo, opcionalmente solo de mi canal).

**Call to Actions**: Link card (tras el resumen) · Map card (en el cuerpo) · Contact card (final) ·
Promo paragraph (antes del FAQ). Colores desde Branding.

**Business details**: descripción, nombre, industria, posicionamiento (500 car.), «What you sell»
(ofertas con precio y URL, máx. 20, extraídas del sitio), audiencia objetivo (lista), ubicación (país + ciudades),
blog path, sitemap.

**Branding**: logo, color primario/secundario, URL de ejemplo de estilo de escritura.
**Competitors**: dominios a superar. **Schedule**: días de la semana. **Saved pages**: páginas del sitemap
(682) que alimentan el enlazado interno. **Improvements**: reescritura automática de artículos >90 días,
hasta 2 días/semana. **Publishing**: integraciones + API/Webhook. **Product catalog**.

### 1.4 Content plan (calendario)

- Cabecera: contadores *7 Published · 1 Generated · 27 Queued* + botón **Add keywords**
  (diálogo: «agrupamos tus keywords en temas y las programamos; se filtran duplicados y fuera de tema»).
- Calendario por días. Cada tarjeta:
  - Publicado/Generado: estado + título final + tipo.
  - En cola: estado + **keyword** + `Difficulty: N` + `Volume: N` + tipo (*Explainer Article* / *Listicle Article*).
- Hover en tarjeta futura: **Change topic**, **Add instructions**, **Delete**.
- Un artículo por día según Schedule; mezcla de keywords navegacionales de alto volumen
  («programacion la 2» 40.500, «programación canal sur hoy» 18.100) con informacionales de cola larga.

---

## 2. Qué hace hoy nuestro artículo (gap)

Artículo `92d27698…` (guiaprogramaciontv.com, `origin=auto`, v1 `qa_passed`, QA 94):

| Aspecto | BLG | Nosotros |
|--------|-----|----------|
| Origen | Keyword del plan (vol 1600, KD 21) | Noticia de un cluster de fuentes (audiencias); plan item sin `primaryKeyword`, `difficultyEstimate`, rangos de palabras |
| Palabras | 2.112 | 1.059 |
| Encabezados | Subconsultas con keyword | Genéricos: «Lo que necesitas saber», «Datos clave», «Contexto», «Conclusión» |
| Resumen / TOC | Sí / Sí | No / No |
| Tabla | 1 | 0 |
| Enlaces internos | 24 contextuales | 1 |
| Enlaces externos | 27 + sección Fuentes | 0 (hay `provenance` con fuentes pero `inlineAttributed:false` y sin sección) |
| FAQ | 5 | 0 |
| CTA / promo | Link card + párrafo promo | Ninguno |
| Recomendaciones | 4 posts propios | 0 |
| SEO title | Completo | Cortado a 70 car. a mitad de frase («…ante») |
| Slug | `canales-de-television-gratis` | 90 car. truncado («…-final-de-ma») |
| QA | 10 checks orientados a AI Search | `intent_defined` falla; no mide enlaces/FAQ/fuentes/alt |
| Imágenes | 3 | 3 ✔ |
| `SitePlanningSettings.articleTargets` | — | `{}` (defaults) |
| Volumen de búsqueda | Proveedor real | **No existe proveedor** en el código |

Conclusión: la estructura de guía ya está modelada en `structure.ts` (`GUIDE_TARGETS`: 2.300 palabras,
15 internos, 4 externos, 5 imágenes, 5 FAQ, secciones summary/toc/faq/sources/jsonLd/furtherReading/cta),
pero (a) el plan no es keyword-first ni tiene datos de demanda, (b) los artículos automáticos de noticia
no aplican esa plantilla, y (c) faltan bloques (link card, promo, tabla, recomendaciones), el panel de
datos, varios checks y los ajustes de personalización.

---

## 3. Qué implementar (por milestones)

Cada milestone: cambio mínimo completo, tests focales, `graphify update .` al final. Sin revisión independiente.

### M1 — Datos de keyword (volumen + dificultad) con proveedor real

1. Interfaz `KeywordMetricsProvider` en `src/infrastructure/` con
   `getMetrics(keywords[], locale, country) → { keyword, volume|null, difficulty|null, cpc|null, source, fetchedAt }[]`.
2. Implementación **DataForSEO** (decidido 2026-11-17). Auth HTTP Basic con `DATAFORSEO_LOGIN` /
   `DATAFORSEO_PASSWORD` en `.env` (nunca en git; añadir solo los nombres a `.env.example`). Endpoints:
   - `POST /v3/dataforseo_labs/google/keyword_overview/live` → `search_volume`, `keyword_difficulty`, `cpc`,
     `search_intent` (hasta 700 keywords por llamada) — fuente principal de M1.
   - `POST /v3/dataforseo_labs/google/keyword_ideas/live` y `/related_keywords/live` → candidatas para M2.
   - `POST /v3/dataforseo_labs/google/ranked_keywords/live` con el dominio de cada `Competitor` → huecos de M2.
   - España: `location_code: 2724`, `language_code: "es"` (derivar de `Site.locale`/ubicación objetivo).
   Caché en `ProviderCacheEntry` (TTL 30 días), registrar coste en `aiSpendEvents`/presupuesto existente,
   timeouts y reintentos acotados; error del proveedor → `null`, nunca bloquea la planificación.
   Test con fetch falso (sin red).
3. Persistir en `EditorialPlanItem`: añadir `searchVolume Int?` y `keywordMetricsSource String?`;
   reutilizar `difficultyEstimate` (0–100) y `primaryKeyword`. Migración Prisma.
4. Etiqueta de dificultad derivada (no almacenada): 0–29 Easy, 30–49 Medium, 50–69 Hard, 70+ Very hard.
5. Sin proveedor configurado → `null` y la UI muestra «—». Test: nunca se rellena volumen sin `source`.

### M2 — Plan keyword-first + calendario estilo BLG

1. **Add keywords**: endpoint que recibe una lista de keywords, normaliza, deduplica contra
   `EditorialPlanItem.targetQuery` y `SiteIndexedPage` (canibalización), descarta fuera de tema
   (relevancia contra `SiteIntelligenceProfile`), agrupa variantes en un tema (1 item = 1 keyword principal
   + `secondaryKeywords`), pide métricas (M1) y programa en los próximos huecos según `SitePlanningSettings.weekdays`.
2. **Selección de keywords con datos primero, IA después** (hoy el modelo inventa `primaryKeyword` y
   `opportunityScore`; M1 solo las mide a posteriori — eso cambia aquí):
   - **Candidatas reales (DataForSEO)**: `keyword_ideas`/`related_keywords` con semillas del sitio (categorías del
     sitemap, temas de `SiteIntelligenceProfile`, keywords de artículos propios) + `ranked_keywords` de cada
     `Competitor` (keywords donde ellos posicionan y nosotros no) + huecos de `ContentOpportunity`.
   - **Filtros**: idioma/país, relevancia (`computeSiteRelevanceScore`), canibalización (`SiteIndexedPage`,
     `SearchTarget`), intención acorde al tipo de sitio, agrupación de variantes en un tema.
   - **Puntuación determinista** (no del modelo): `opportunityScore = volumen × ganabilidad × relevancia × encaje de intención`,
     con ganabilidad decreciente cuando `keywordDifficulty` supera lo alcanzable por el sitio. Test de la fórmula.
   - **El modelo solo redacta el brief** (título, ángulo, outline, FAQ, tipo) de la keyword ya elegida; no elige keywords.
   - Límites de coste: tope de filas/llamadas por plan, caché por semilla y competidor (30 días), gasto en `aiSpendEvents`.
   - Sin credenciales DataForSEO → se mantiene el flujo actual (keywords del modelo) y la UI lo indica.
   - **Dato real de M1 (2026-11-17)**: de 23 keywords inventadas por el modelo solo 6 existen en la base de
     DataForSEO Labs (p. ej. «audiencias tv» 135.000/KD 18, «programación La 2 hoy» 12.100/KD 0); las frases
     del modelo («deporte en TV abierto y de pago», «qué echan ahora») no tienen datos. Por eso las candidatas
     deben salir de `keyword_ideas`/`ranked_keywords` (todas traen métricas). Para keywords añadidas a mano sin
     datos en Labs, fallback opcional a `keywords_data/google_ads/search_volume/live` (solo volumen, rangos
     como 10 o 50, igual que muestra BLG). Coste observado: ~0,012 USD por llamada de Labs aunque no haya datos.
3. `contentType` por item: `explainer` | `listicle` (y los existentes); visible en la tarjeta.
4. UI del calendario (`PlanPipelineViewComponent` / vista calendario de M5): contadores
   Published/Generated/Queued; tarjeta en cola con keyword, `Difficulty: N`, `Volume: N`, tipo;
   publicada con título final. Hover: **Cambiar tema**, **Añadir instrucciones** (guarda en
   `EditorialPlanItem.notes` y llega al prompt del redactor), **Eliminar**.

**Estado M2 (2026-11-17, hecho)**: `src/studio/keyword-candidates.ts` (keyword_ideas por semilla — `mainTopics` +
clusters, ≤5 — y ranked_keywords de ≤3 competidores `accepted`; caché 30 días por semilla/competidor; gasto
`keyword_metrics`), filtro (guardarraíles duros + relevancia ≥30, canibalización `none|related-cluster`,
sin volumen → fuera), puntuación determinista `keywordOpportunityScore` (ganabilidad cae pasado KD 30) y
agrupación de variantes (`isKeywordVariant`: un modificador de diferencia). El generador reparte las keywords
por llamada (`keywordAssignmentBlock`) y `applyMeasuredKeywords` descarta briefs con otra keyword y pone el
score de la app; las métricas se guardan al crear el item. Sin credenciales → flujo anterior
(`generatedOutput.keywordSource = "model"`) y el calendario lo indica. Add keywords agrupa variantes en
`secondaryKeywords` y mide volumen/KD. Calendario: keyword · Difficulty (Easy…) · Volume («—»), tipo
(ranking → Listicle), Cambiar tema y Eliminar. Pendiente/omitido: semillas de `ContentOpportunity`,
fallback Google Ads para keywords manuales, ranked_keywords del propio dominio, KD alcanzable por sitio,
auto-tipo explainer/listicle en Add keywords.

### M3 — Plantilla de artículo keyword-first (paridad de anatomía)

En `structure.ts` (no crear otro sistema):
1. Añadir kinds `link_card`, `promo`, `key_takeaways`; y switches en `ArticleSections`:
   `linkCard`, `promo`, `recommendedReads` (alias del actual `furtherReading`), `citations`,
   `authorPerspective`, `mentionCompetitors`, `summaryVariant: "tldr" | "key_takeaways"`.
2. Orden fijo: H1 → intro answer-first (2 párrafos: respuesta + marca con propuesta de valor; alcance) →
   link card → En resumen (3–5 viñetas) → Tabla de contenidos → cuerpo (H2 = subconsultas de la keyword,
   H3 para desglose; ≥1 tabla cuando haya comparación; `ol` para pasos) → párrafo promo de marca (H2 propio) →
   FAQ (N = `faqCount`) → Fuentes («Título, Editor» enlazado) → Recomendaciones (posts propios) → disclaimer opcional.
3. Redactor: atribución inline obligatoria para cada dato con su enlace (usar `provenance`, poner
   `inlineAttributed:true`), fechas y cifras concretas, registro impersonal, sin H2 «Conclusión» en guías.
4. Aplicar la plantilla a los items con `primaryKeyword` (guía/explainer/listicle); las noticias de cluster
   mantienen su plantilla de noticia.
5. Longitud: modos *Dinámica (según intención)* | 1200–1600 | 1700–2300 | 2400–2800 → mapear a
   `ArticleTargets.words`.

**Estado M3 (2026-11-17, hecho)**: plantilla `guide` de `structure.ts` reescrita en el orden BLG (intro answer-first
de 2 párrafos → `link_card` → `summary` | `key_takeaways` → TOC → cuerpo con H2 = subconsultas, H3, `ol` para pasos,
tabla al comparar, atribución inline enlazada con fechas y cifras → `promo` (H2 propio) → FAQ (`faqCount`) → Fuentes
«Título, Editor» → Lecturas recomendadas → disclaimer de `writing`); sin «Cómo elegir», sin CTA final ni «Conclusión».
Switches nuevos en `ArticleSections`: `linkCard`, `promo` (on por defecto); `summaryVariant` pasa de
`article_targets.writing` a `ArticleTargets` y `sectionEnabled` deja solo una de las dos variantes (también en QA).
`citations`/`authorPerspective`/`mentionCompetitors` siguen en `renderWritingGuidance`; `furtherReading` = Recommended
reads (sin alias). `mapArticleType` (`production/plan-item.ts`): items con `primaryKeyword` y no noticia ni review →
`guide` (también listicles: un H2 por entrada); `siteGuidance` da al redactor nombre, dominio y home del sitio para la
link card y el promo. `inlineAttributed` lo calcula `provenance.ts` cuando el claim nombra al editor (la plantilla lo
exige). Pendiente: los toggles `linkCard`/`promo` en Settings › Writing, check M7 «link card/promo presentes», y que el
checklist exija la tabla solo cuando hay comparación.

### M4 — Enlazado interno y externo a nivel BLG

1. Interno: candidatos desde `SiteIndexedPage` (sitemap completo) + posts propios publicados; puntuación
   semántica por sección; objetivo `internalLinks` (por defecto 15, BLG llega a 24); anchor descriptivo,
   nunca «aquí»; sin repetir URL; opciones `www` y barra final por sitio.
2. Externo: solo fuentes de la `provenance`/investigación, objetivo `externalLinks` (subir default a ~10),
   todas listadas en «Fuentes».
3. Recomendaciones: 3–5 posts del mismo sitio con mayor afinidad temática.

**Estado M4 (2026-11-17, hecho — los enlaces pasan a ser requisito, no adorno)**: los artículos publicados de BLG
llevan ≥10 internos y a menudo 25+ externos. Antes el redactor recibía como mucho 6 internos (`loadInternalLinks`
limit 6) y los externos solo salían de `sourceEvidence` del plan (2–4 URLs), con objetivo 4. Ahora:
- Objetivos: `externalLinks` por defecto 20 (máx. 40), `internalLinks` 15. El prompt exige «AT LEAST N» de cada uno.
- Internos: el redactor recibe objetivo + 5 candidatos. `suggestInternalLinks` (tope 40) completa con las páginas
  más superficiales del sitio (`fillWithHubs`) cuando no hay bastantes coincidencias de keyword.
- Externos: `src/studio/serp-sources.ts` toma la SERP real de la keyword desde DataForSEO Labs `historical_serps`
  (la última captura, hasta 100 orgánicos, ~0,0008 USD, caché 7 días, gasto `serp_sources`) y la convierte en
  hechos del ledger (título + snippet, editor = dominio, URL real), sin el dominio propio ni los competidores
  `accepted`. La SERP live de Google ya no sirve: envuelve la mayoría de URLs en `google.com/goto` tras una
  comprobación anti‑bot. Solo se aplica a items keyword-first (`guide`).
- QA: «Fuente creíble» exige `min(externalLinks, fuentes con URL del ledger)` (`externalSourceInventorySize` en
  los metadatos del proyecto), no ≥1.
- Topes que lo anulaban: `loadInternalLinks` cortaba a 8 y `brief-builder` a 6 enlaces; ahora el brief admite 40.
- Páginas fuente: cada fuente SERP se lee (`fetchUrl` con guardia SSRF + `extractPageFromHtml`) y el hecho cita
  las 2 frases de la página con cifras/fechas y palabras de la keyword (`pickSourceExcerpt`; caché `source_page`
  7 días por URL + keyword); PDFs, errores o páginas pobres → snippet. ~3 s para 25 fuentes la primera vez.
- Posts propios: `suggestOwnPosts` (`internal-linking.ts`) toma las publicaciones `published` del sitio con URL
  real, ordenadas por afinidad con la keyword y luego por fecha (≤5, sin el propio proyecto); van primero en el
  brief marcadas «(own post)» y «Recommended reading» lista 3–5 de ellas.
- Anchors: cada URL una sola vez en el cuerpo (las listas Fuentes/Recomendaciones pueden repetirla), nunca «aquí».
Pendiente (fuera de M4): medir en BLG con sesión iniciada; editor «Título, Editor» con el nombre real del medio
(hoy el editor es el dominio); aplicar enlazado/fuentes también a artículos manuales y de noticias.

### M5 — CTAs y marca

1. Ajustes por sitio: Link card (titular, frase, URL, texto botón), Contact card, Map card, Promo paragraph.
   Reutilizar datos de `SiteIntelligenceProfile`/perfil editorial; añadir lo que falte (logo, colores,
   posicionamiento ≤500, audiencia, ubicación, ofertas con precio/URL ≤20, blog path).
2. Render: link card como bloque HTML semántico publicable (sin JS), estilado con colores de marca.

**Estado M5 (2026-11-18, hecho)**: ajustes en `article_targets.brand` (sin migración; `src/studio/editorial-engine/brand.ts`
`readBrandSettings` valida: URLs http(s), colores `#rrggbb`, posicionamiento ≤500, audiencia, ubicación país + ciudades,
ofertas nombre/precio/URL ≤20, blog path, link card titular/frase/URL/botón, contact card titular/frase/email/teléfono/URL/botón,
map card titular/dirección/URL, qué debe decir el promo, logo y colores primario/secundario). `resolveBrand` rellena
posicionamiento y audiencia vacíos con `SiteIntelligenceProfile.brandSummary`/`detectedAudience`. El redactor recibe
todo por `siteGuidance` → `renderBrandGuidance` (las URLs de ofertas son enlaces permitidos). Tarjetas: la app las renderiza
en la etapa `seo` (`applyBrandCards`, solo guías): la link card sustituye el `<aside data-block="link_card">` del redactor
(usa su titular/frase si el sitio no configuró los suyos), con logo, borde y botón en el color primario y texto del botón
blanco/negro según contraste; map y contact card son placeholders `<aside data-block="map_card|contact_card"></aside>`
del redactor (si faltan: contacto al final antes del descargo y mapa antes), y solo existen si hay dirección o
email/teléfono/URL (`sections.mapCard/contactCard` se apagan sin datos). `html-sanitizer.ts` admite `style` en
`aside`/`p`/`a` filtrado por `cleanStyle` (propiedades de presentación, valores sin `url()`/paréntesis/comillas), así que
la tarjeta llega igual a WordPress/GuíaTV/REST. Settings › Writing: tarjetas «Calls to action» (toggles link card, map card,
contact card, promo + campos), «Business details» y «Branding». Test: `tests/brand-cards.test.ts`. Después (cierre del plan):
el editor conserva tarjetas/TOC/resumen, el check «Estructura» exige la link card cuando está activa y los artículos manuales
reciben marca + escritura + enlazado. Pendiente: extraer ofertas del sitio automáticamente y la URL de ejemplo de estilo de escritura.

### M6 — Imágenes y medios

1. Portada realista sin texto + 2 de cuerpo, alt descriptivo con keyword natural; eliminar metadatos
   EXIF/C2PA antes de publicar y mostrar badge.
2. Infografía opcional (1/artículo) de la sección con pasos/cifras/comparación.
3. Opción «usar solo mi biblioteca de medios». Embed de YouTube opcional (1/artículo).

**Estado M6 (2026-11-18, hecho)**: `stripImageMetadata` (`infrastructure/storage/image-processing.ts`) re-codifica cada imagen
generada sin EXIF/XMP/IPTC/C2PA (aplica antes la orientación EXIF; formatos desconocidos intactos) antes de guardarla;
`content_image.metadata_stripped` (migración `20261118120000`) alimenta el badge «No AI watermark metadata» de la portada.
Alt de cuerpo = encabezado de la sección + keyword si no la contiene (`inlineAlt`). Ajustes **Visuals** en
`article_targets.visuals` (`editorial-engine/visuals.ts`): instrucciones de imagen, estilo de portada y de cuerpo
(realista | ilustración | editorial | minimal | «solo mi biblioteca»), infografía y YouTube; Settings › Writing tiene la tarjeta.
El worker añade estilo + instrucciones al prompt. «Solo mi biblioteca» rellena los huecos de cuerpo con imágenes ya
generadas del sitio (más palabras en común con la sección primero, nunca repetidas) sin generar nada. Infografía: 1 por
artículo, solo si una sección tiene `<ol>` o `<table>`; ese hueco se genera con un prompt de infografía de sus pasos/filas
(`data-auctorio-infographic`). YouTube: el primer vídeo de la SERP de YouTube de DataForSEO para la keyword (opcionalmente
solo del canal del sitio; caché 7 días, gasto `youtube_video`), insertado antes del 2.º H2 como `<figure data-block="youtube">`
con miniatura enlazada (sin iframe ni JS: pasa el sanitizer y los publishers). Recuento de imágenes sin cambios (portada +
`INLINE_IMAGE_MIN` = 3 de cuerpo; objetivo `images` 5). Test: `tests/visuals.test.ts`.

### M7 — QA «Built for AI Search» y panel del artículo

1. Extender `quality-checklist.ts`/`qa.ts` con los 10 checks: answer-first (1ª frase responde la keyword),
   fuente creíble (≥N externos de dominios de calidad), estructura óptima (resumen+TOC+FAQ+fuentes según switches),
   enlaces internos ≥ objetivo, datos/estadísticas (≥3 cifras atribuidas), plagio/duplicado (similaridad vs
   fuentes y vs posts propios), alt de imágenes, keywords semánticas (≥5 presentes), meta tags (title 35–60 sin
   cortar palabra, description 140–160), JSON-LD (Article + FAQPage + BreadcrumbList válidos). Generar el
   párrafo de racional (intención, audiencia, cómo lleva al producto).
2. Corregir bugs vistos: SEO title cortado a mitad de frase (recortar por palabra o regenerar);
   slug ≤60 car. derivado de la keyword, no del titular; `intent_defined` desde el plan item.
3. Panel en la página del artículo (`/studio/content/:id`): checks desplegables, URL publicada, Article data
   (keyword, volumen, dificultad+chip, palabras, keywords con tooltip, imágenes, internos, externos con punto
   verde/ámbar vs objetivo), slug editable, meta description con contador y barra, portada reemplazable,
   estado, exportar (HTML/Markdown), enlace «Personalizar futuros artículos».
4. Editor (`AuRichEditorComponent`): asegurar toolbar completa (H1–H3, listas, cita, separador, alineación,
   enlace, tabla, imagen, YouTube, limpiar) con Descartar / Guardar y cerrar.

### M8 — Página «Personalizar futuros artículos»

Una página de ajustes por sitio que agrupa, sin duplicar lo existente (`ArticleSettingsCardComponent`,
`PlanningDefaultsCardComponent`): Escritura (instrucciones + longitud + switches + enlazado + disclaimer),
Visuales, CTAs, Negocio, Marca, Competidores, Calendario (días), Páginas guardadas (sitemap). Persistir en
`SitePlanningSettings.articleTargets` (ampliando `readArticleTargetsOverride`) y en el perfil editorial.
Override por artículo vía `generation.articleTargets` del plan item (ya soportado).

**Estado M7 (panel) + M8 (escritura), 2026-11-17, parcial**: página del artículo rehecha (`content-workspace-page`):
panel lateral con «Built for search» (checklist desplegable + Fix with AI), URL publicada, Article data (keyword,
Searches/mo y Difficulty del plan item —`GET /projects/:id` devuelve `keywordMetrics` y `articleTargets`—, palabras,
keywords presentes, imágenes, enlaces internos/externos con punto verde/ámbar vs objetivo), slug ≤60 y meta description
con contador 140–160 y barra, portada reemplazable, exportar/copiar HTML y enlace «Customize future articles».
Settings › Articles › **Writing** (`/studio/settings/writing`): instrucciones (≤30 reglas), longitud (dinámica |
1200–1600 | 1700–2300 | 2400–2800 → `words`), interruptores (perspectiva de autor, TOC, recomendaciones, fuentes,
citas, FAQ, CTA, competidores, JSON-LD, resumen TL;DR / Key takeaways), enlazado interno (activar, `www`, barra final)
y descargo. Se guarda en `article_targets.writing` (`structure.ts readWritingSettings`) y llega al redactor por
`renderWritingGuidance` + `formatInternalUrl` en `production/plan-item.ts` (solo items del plan). Pendiente: Visuals,
CTAs, Business details, Branding (resto de M8), checks M7 nuevos, editor con toolbar completa, badge C2PA, export Markdown,
aplicar los ajustes también a artículos manuales y de noticias.

**Estado M7 + M8 (2026-11-18, cerrado)**: editor (`AuRichEditorComponent`) con U/S, separador, imagen (URL + alt), YouTube
(miniatura enlazada), alineación (`text-align` inline, que ambos sanitizers conservan) y «Save & close»; su sanitizer ya no
borra `aside`/`nav` (link card, resumen, TOC). Sin H1 en el cuerpo: el H1 es el título. Export Markdown (`utils/html-to-markdown.ts`)
junto a Export HTML. Checklist: la tabla solo se exige si la keyword o algún H2 compara opciones (`comparesOptions`) y la
link card cuando el switch está activo. Los rangos de meta tags siguen en 35–70 / 110–165 (coinciden con el redactor,
`seo-package` y QA; endurecerlos a 35–60 / 140–160 haría fallar artículos que el redactor genera bien). Settings › Writing
agrupa Writing, Visuals, CTAs, Business details y Branding, con accesos a Competitors, Saved pages y Publishing days. Las
noticias (clusters) y los artículos manuales reciben las reglas de escritura del sitio y el formato de enlaces internos
(sin la caja de resumen, que su plantilla no tiene).

**Sobras de M2–M4 (2026-11-18)**: Add keywords asigna `listicle`/`explainer` e intención comercial/informativa
(`keywordContentType`). Keywords sin datos en Labs: volumen de Google Ads (`keywords_data/google_ads/search_volume`, solo
volumen, fuente `dataforseo_google_ads`, caché 30 días). Candidatas: semillas de `ContentOpportunity` abiertas, se descartan
las keywords por las que el propio dominio ya posiciona (`ranked_keywords` del sitio) y la dificultad alcanzable es el p75 de
la KD de esas keywords (20–60; 30 si se conocen <10). Fuentes: el editor de «Título, Editor» es el `og:site_name` de la
página leída cuando existe (si no, el dominio). Pendiente real: medir BLG con sesión iniciada.

### Fuera de alcance (por ahora)

Improvements automáticas de artículos >90 días, catálogo de productos, Reddit/Quora/Meta, backlinks,
programas de referidos.

---

## 4. Criterios de aceptación

- Generar un artículo para «canales de televisión gratis» en guiaprogramaciontv.com (local) produce:
  ≥1.700 palabras, resumen, TOC, ≥6 H2 con forma de subconsulta, ≥1 tabla, ≥15 enlaces internos a URLs
  reales del sitemap, ≥8 externos todos en «Fuentes», 5 FAQ, link card, párrafo promo, 3–5 recomendaciones,
  3 imágenes con alt, JSON-LD válido, title sin cortar, slug ≤60, 10/10 checks.
- El calendario muestra keyword, `Difficulty`, `Volume` (o «—» sin proveedor) y tipo en los items en cola;
  Add keywords deduplica y programa; Cambiar tema / Añadir instrucciones / Eliminar funcionan.
- Ningún volumen aparece sin `keywordMetricsSource`.
- Tests focales verdes (structure, qa/quality-checklist, plan keywords, provider con fake) y
  `graphify update .` ejecutado.

**Estado aceptación (2026-11-18, hecha — evidencia en `docs/acceptance/blg-parity-2026-11-18.md`)**: artículo «canales de
televisión gratis» generado desde el plan en local (proyecto `52eb13b6…`): v3 cumple 10/10 checks, resumen, TOC, 9 H2
subconsulta, tabla, 28 internos reales del sitemap, 25 externos todos en Fuentes, 5 FAQ, link card, promo, 5 recomendaciones,
portada + 3 imágenes con alt y sin metadatos, JSON-LD válido, title de 55 y slug `canales-de-television-gratis`. Calendario,
Add keywords, Cambiar tema, Añadir instrucciones y Eliminar funcionan; ningún volumen sin `keywordMetricsSource`. Arreglados:
fallback de IA + modelo por uso en Settings › AI (la cuenta Anthropic no tenía saldo; DeepSeek escribió), recuento de internos
con URLs absolutas del propio dominio, slug ≤60 desde la keyword cortando por palabra, y Regenerate de una guía del plan que
salía con plantilla de noticia. Segunda ronda (v4): enlaces visibles en vista previa y editor, tarjetas que conservan su
estilo (Angular quitaba `style`/`data-block`), sin «(own post)», link card estilo BLG, paleta y logo crawleados del sitio
(`brand-colors.ts`) en tarjetas e imágenes, y paso «ampliar» para guías cortas; v4 = 10/10 con 2.000 palabras. Tercera ronda (v5): las fuentes nombradas en el texto se
enlazan (`inline-citations.ts`; 19 externos en el cuerpo + 20 en Fuentes) y redes sociales/YouTube ya no son fuentes citables. BLG medido con sesión (3 artículos, 10/10, 13–24 internos, 27–32 externos = 11–13 URLs,
~2.000–2.200 palabras). Pendiente: la aceptación con Sonnet escribiendo (sin saldo en la cuenta Anthropic).

## 5. Decisiones

- Proveedor de métricas de keyword: **DataForSEO** (2026-11-17). Requiere cuenta y credenciales API
  del usuario en `.env` antes de probar M1 con datos reales.

---

## 6. Instrucciones para el agente (una sesión por milestone)

Cada milestone se hace en una sesión nueva, con contexto `fresh`, sin worktree (`use_worktree: false`) y en la rama
`feat/m6-final-cleanup`. La sesión relee este doc entero antes de empezar, porque las notas «Estado» cambian entre
milestones, y se guía por lo que digan en ese momento.

### 6.1 Normas (todas las sesiones)

- Seguir el `CLAUDE.md` del proyecto: graphify primero (`graphify query` antes de grep o de leer código), el cambio
  mínimo completo (ponytail full) y `graphify update .` al terminar. **No hay paso de revisión independiente.**
- Reutilizar lo que ya existe (sección 0) y no duplicar modelos.
- Tests focales: `npm run build`, luego `node --test dist/tests/<archivo>.test.js`, y `git checkout -- dist` al final.
- **Todo test que gaste IA usa como máximo `claude-sonnet-5-5` con esfuerzo medio (Haiku vale; Opus nunca).** El modelo
  por defecto de la app es Opus 5.5: cambiarlo en el sitio antes de generar contenido de prueba. Lo mismo vale para
  cualquier subagente o sesión de test.
- Sitio de pruebas: guiaprogramaciontv.com, con la BD local desechable (clon limpio de prod). Reutilizar su token,
  nunca crear uno nuevo. Para limpiar entre pruebas: Delete en `/studio/plan` y en Settings › Sites.
- Dev: `npm run dev` (Studio 4420, API 4301). Si el primer arranque falla por `taskkill`, repetirlo. Un puerto ocupado
  nunca bloquea: reiniciar el proceso viejo.
- Claves de IA y de DataForSEO: en el `.env` (gitignored). Nunca se commitean.
- **Nunca inventar volumen de búsqueda ni dificultad.** Sin proveedor el valor es `null` y la UI muestra «—».
- Terminado = milestone implementado, tests focales en verde, nota «Estado Mx (fecha, hecho)» en la sección 3 de este
  doc, graphify actualizado y un commit en `feat/m6-final-cleanup` que termine con
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Responder en español.

### 6.2 Plantilla del brief

> **Background**: Auctorio es una plataforma editorial con IA: backend Fastify + Prisma en `src/` y Studio en Angular en
> `apps/studio-web`. El usuario quiere que los artículos y el plan de contenido estén a la par con BabyLoveGrowth (BLG),
> siguiendo `docs/prompts/blg-article-parity.md`, un milestone por sesión, y cada sesión relee el plan por si se
> actualizó. Hechos: <milestones cerrados, una línea cada uno>. Quedan: <pendientes>.
>
> **Task**: Implementa el milestone **<Mx — título>** de `docs/prompts/blg-article-parity.md`. Lee primero el doc entero:
> las secciones <1.x relevantes>, 3·<Mx> y todas las notas «Estado». Punto de partida: <últimos commits y los ficheros
> o símbolos donde empieza el trabajo>. <Mx> consiste en: <lista numerada del milestone>.
>
> **Reglas**: las de 6.1.
>
> **Terminado**: lo de 6.1.

### 6.3 Siguiente sesión — Aceptación (sección 4) y medición de BLG

M1–M8 están cerrados (ver notas «Estado»). Queda:

1. **Aceptación de punta a punta** en local con guiaprogramaciontv.com y el sitio en Sonnet 5.5 (esfuerzo medio):
   generar un artículo para «canales de televisión gratis» desde el plan y comprobar uno por uno los criterios de la
   sección 4 (palabras, resumen, TOC, H2, tabla, internos reales del sitemap, externos en «Fuentes», FAQ, link card,
   promo, recomendaciones, imágenes con alt y sin metadatos, JSON-LD, title, slug, 10/10 checks). Comprobar también el
   calendario (keyword, Difficulty, Volume o «—», tipo; Add keywords deduplica y programa; Cambiar tema / Añadir
   instrucciones / Eliminar) y que ningún volumen aparece sin `keywordMetricsSource`.
2. Arreglar en el código compartido lo que falle (causa raíz, no el artículo), con su test focal.
3. **Medir BLG con sesión iniciada** (Playwright, la sesión de la cuenta BLG del usuario; si pide login, se lo pide al
   usuario, nunca se teclea la contraseña): recuento real de enlaces internos/externos, palabras, imágenes y checks de
   2–3 artículos publicados, y comparar con el nuestro.
4. Dejar la evidencia en `docs/acceptance/blg-parity-<fecha>.md` (tabla criterio → resultado, capturas si ayudan) y una
   nota «Estado aceptación» en este doc. Commit como en 6.1.
