# Estudio de flujo de referencia (M0)

Recorrido de una cuenta ya onboardeada en el producto de referencia, el 2026-11-16. Aquí solo se describen el flujo, los datos y la UX: no se copian ni la marca ni los textos.
La captura de red saneada (sin cookies ni cabeceras, con los valores de la query redactados y los cuerpos reducidos a su forma) está fuera del repo, en el scratchpad de la sesión (`babylovegrowth-m0.har`: 213 peticiones, 27 pantallas, 55 endpoints).

**No cubierto:** el onboarding desde cero. La cuenta ya lo tenía completo, y repetirlo habría creado un sitio nuevo. Lo que se infiere sale del modelo `org-website` (`onboardingStatus`, `lastCompletedOnboardingStep`, `onboardingCompletedAt`) y de la tarjeta "Lo que aprendimos".

---

## 1. Arquitectura de información

Sidebar fija, en dos grupos:
- **Acciones:** Inicio · Contenido del blog · Backlinks · Salud del sitio · SEO social (submenú)
- **Analítica:** Visibilidad en IA · Tráfico (submenús)
- **Abajo:** Ajustes

Selector de sitio arriba (multisitio, con la bandera del idioma).

**Ajustes** sustituye la sidebar por su propia navegación, con "Volver al panel":
| Grupo | Páginas |
|---|---|
| Cuenta | Perfil, Miembros, Suscripción, Referidos |
| Negocio y marca | Datos del negocio, Branding, Competidores, Catálogo de productos, Biblioteca de medios, Páginas guardadas |
| Artículos | Redacción, Visuales, Llamadas a la acción, Calendario (días), Mejoras (beta) |
| Integraciones | Publicación, Analítica |
| Social | Reddit, Quora, Instagram/Facebook |

**Conclusión:** solo hay dos superficies de trabajo diario, Inicio y Calendario. Todo lo configurable vive en Ajustes, agrupado por "sobre qué" (negocio, artículos, integraciones) y no por "qué motor".

## 2. Inicio (overview)

Orden vertical:
1. **Saludo y estado en una línea**: dice si todo corre solo y si hay algo pendiente. El estado es lo primero.
2. **Actividad de los agentes** (fila izquierda grande):
   - Navegador por día (← Hoy →) y chip "motor activo" con menú.
   - Artículo destacado del día con miniatura, título, keyword objetivo, volumen y un tooltip "¿Por qué este tema?" (`whyThisTopic: string[]`).
   - Lista de acciones del agente en pasado: "investigó el tema de mañana: X", "sincronizó el sitemap: N páginas".
   - API: `GET /api/overview/agent-activities` → `{timeZone, days:[{date,isToday,count,featuredArticle{…,whyThisTopic[],status}, items[{type,…}]}]}`.
3. **Primeros pasos** (columna derecha):
   - Sección **Obligatorio**: conexión con el sitio; en verde cuando está hecho.
   - Sección **Opcional**: vídeo, docs, Search Console, Analytics, Instagram. Lo completado se tacha con ✓.
   - API: `GET /api/overview/setup-checklist` → `{items:[{key,isDone}]}`.
4. **Lo que aprendimos de tu sitio**: tipo de sitio, "qué haces", "a quién sirves" (chips), mercado e idioma y colores de marca.
   - Dos botones: uno para confirmar el perfil y otro para corregirlo. El perfil detectado se confirma aquí, no en un wizard.
5. **Fuentes de tráfico** (GA4, 90 días, desglose por canal).
6. Prueba social y garantía. Es marketing, no aplica.

## 3. Calendario (pantalla principal de contenido)

- Pestañas: **Calendario de contenido** · **Mejoras** (beta).
- Cabecera: contadores-chip **N publicados · N generados · N en cola**, botón **Añadir keywords** y navegador de mes (◀ mes ▶).
- Grid semanal lun–dom; **hoy** resaltado; los días futuros fuera del mes, atenuados.
- **Tarjeta por día** (una por día, según los días activos de Ajustes → Calendario):
  - **En cola**: chip de estado, keyword en minúscula, *Dificultad* y *Volumen*. Icono "Arrastrar para reprogramar": se reprograma con drag & drop.
    - Al hacer clic se abre el modal **"Instrucciones del artículo para <keyword>"**: instrucciones especiales (textarea, 1000 caracteres), URL de referencia y un aviso para vincular productos del catálogo. Botones Cancelar / Guardar.
  - **Generado / Publicado**: chip de estado, título final y tipo de artículo (p. ej. "Explicativo"). El botón "Ver artículo" abre el artículo.
- **Añadir keywords**: modal con un textarea "separadas por comas, máx. 50". Agrupa las keywords en temas y las programa sola; descarta duplicadas y fuera de tema.
- API: `GET /api/content-plan` → items `{id, scheduledFor, userInstruction, supportUrl, selectedProductIds, brandImageIds, generationStatus, isLocalKeyword, keywordLocation, gscPerformance, article{id,title,slug,publishedAt,publishedUrl,seoScore,wordCount,generationRationale}, keywordCluster{totalSearchVolume, seedKeyword{value,avgSearchVolume,keywordDifficulty,averageIntent,articleType,languageCode}}}`.
  - También `GET /api/content-plan/get-unused-clusters`, que es el pool de clusters pendientes de programar.

**Patrón clave:** el plan es **una keyword-cluster por día**. Hasta el día de generación solo existen la keyword y sus métricas. El título se crea al generar. El usuario solo puede añadir instrucciones o arrastrar.

## 4. Artículo

- Cabecera: ← volver · "Artículo / título" · tiempo de lectura · **Editar artículo** (CTA primario).
- Cuerpo: vista previa renderizada tal como se publicará: fecha, H1, imagen de portada, intro, tarjeta CTA hacia una página del sitio, "En resumen", índice, H2/H3, FAQ, Fuentes y Recomendaciones.
- Encima del cuerpo, un widget flotante de feedback (👍/👎).
- **Panel lateral derecho**, de arriba a abajo:
  1. **Puerta de calidad**: "Optimizado para búsqueda IA · 10 checks pasados", desplegable. Incluye un párrafo con la razón editorial del artículo (`generationRationale`) y 10 checks con ✓: respuesta primero, fuente creíble, estructura óptima, enlaces internos, datos estadísticos, plagio, alt de imágenes, keywords semánticas, meta tags y JSON-LD.
  2. Enlace "Personalizar artículos futuros" → Ajustes / Redacción.
  3. **Datos del artículo**: keyword objetivo, búsquedas/mes, dificultad (chip "Fácil"), palabras, keywords, imágenes, enlaces internos y externos.
  4. **Slug** (editable) · **Meta description** (editable, con contador) · **Imagen de portada**.
  5. Abajo, fijos: **Publicar** (primario negro) · **Exportar artículo** (con menú).
- API: `GET /api/articles/:id`.

**Conclusión:** la vista del artículo es *preview + panel de calidad + publicar*. No hay pestañas. La edición es un modo aparte, al que se entra con "Editar artículo".

## 5. Ajustes relevantes (qué es configurable)

| Página | Campos |
|---|---|
| Datos del negocio | descripción, nombre, sector (select), posicionamiento, qué vendes, público objetivo (chips), ubicación objetivo, ruta del blog, URL del sitemap |
| Branding | logo, color primario y secundario, voz, URL de un artículo de ejemplo de estilo |
| Competidores | lista de dominios a monitorizar |
| Redacción | reglas libres ("nunca uses X", con ejemplos), longitud (*Dinámica según intención* por defecto) y toggles de lo que incluye cada artículo: perspectiva de autor, TOC, lecturas recomendadas, sección de fuentes, citas, mencionar competidores, JSON-LD, resumen, enlaces internos (www / barra final), disclaimer |
| Visuales | reglas de imagen, estilo de marca en imágenes, estilo de portada, imágenes de cuerpo, infografías y vídeo de YouTube |
| CTA | tarjetas de acción (link card on/off) |
| Calendario | chips L–D de los días en que se genera ("Seleccionado: todos los días"). **Es el único control de ritmo.** |
| Mejoras | "mejorar artículos automáticamente" (toggle), días de mejora (máx. 2/semana, 1 artículo/día), próxima y última ejecución con motivo ("omitido: todas las páginas tienen < 90 días") |
| Publicación | toggle **Publicar automáticamente** y una rejilla de CMS (WordPress, Shopify, Webflow, Wix, Ghost, Framer, …) con "Conectar", más una sección para desarrolladores (API key / webhook) |

El modelo del sitio guarda todos estos toggles como columnas planas (`includeToc`, `includeTldr`, `includeJsonLd`, `includeFaqJsonLd`, `includeInternalLinks`, `includeCitation`, `includeSourcesSection`, `includeRecommendedReads`, `includePerspective`, `mentionCompetitorsIfRelevant`, `brandVoice`, `articleInstructions`, `imageInstructions`, `exampleArticleUrl`, `sitemapUrl`, …).

## 6. Qué es automático y qué configurable

| Automático (sin UI) | Configurable |
|---|---|
| Leer el sitio y deducir el perfil de negocio | Confirmar o corregir el perfil (Inicio) |
| Sincronizar el sitemap a diario | Días de generación |
| Investigar keywords, agruparlas en clusters y llenar el calendario | Añadir keywords propias; arrastrar para reprogramar |
| Elegir el tema del día y explicar por qué | Instrucciones por artículo (texto y URL de referencia) |
| Generar con 10 checks de calidad | Reglas globales de redacción y visuales, toggles de estructura |
| Publicar si está conectado y "auto" está activo | Toggle de autopublicación; botón Publicar manual |
| Reescribir artículos con > 90 días que pueden rankear mejor | Toggle y días de mejora |

## 7. Ajustes propuestos para M5

1. **Inicio:** añadir encima de "siguiente paso" una **línea de estado** ("en automático, nada pendiente" / "N necesitan revisión") y el **feed de actividad por día** con el artículo destacado y su "¿por qué este tema?". `overview-model.ts` ya calcula el siguiente paso; el feed puede salir de los ProductionJob y de las PlanItem del día.
2. **Configuración:** reducir los pasos visibles. La referencia solo obliga a **conectar el sitio**; el perfil detectado se confirma desde Inicio con "Correcto / Actualizar". Se propone el setup de 5 pasos de M5 con **un solo paso obligatorio** (conexión) y el resto saltable, y que Inicio muestre una checklist Obligatorio/Opcional hasta completarla.
3. **Calendario:** confirma el diseño de M5 (grid, chips de ciclo de vida, contadores por estado en la cabecera). Además:
   - Tarjetas futuras con solo keyword, dificultad y volumen (coincide con "antes del día solo título, intención y keywords" de M1).
   - **Drag & drop para reprogramar** en lugar de una acción "Reprogramar".
   - **Añadir keywords** en bloque como entrada manual del plan.
   - Clic en un ítem en cola → modal pequeño de instrucciones y URL de referencia, no un drawer completo. El drawer "Avanzado" queda para lo demás.
4. **Artículo:** confirma "Vista previa + Avanzado". En la vista previa, el **panel lateral** lleva calidad, checks, datos, slug/meta/portada y Publicar/Aprobar, en ese orden. "Arreglar con IA" solo aparece si falla algún check.
5. **Ajustes:** agrupar por *Negocio y marca · Artículos · Integraciones*. El ritmo (días) y el modo (auto/asistido) van juntos en Artículos/Calendario. Mejoras automáticas no entra en M5; se apunta como idea futura.
6. **Publicación:** mantener "ocultar CMS sin proveedor". El toggle de autopublicación de la referencia equivale a nuestro modo Autopilot vs Asistido, así que no hace falta un toggle aparte.
