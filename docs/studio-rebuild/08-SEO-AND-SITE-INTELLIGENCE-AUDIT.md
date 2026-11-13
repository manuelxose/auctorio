# SEO e inteligencia — examen de evidencias
Fuentes: docs/acceptance/guiatv-local-2026-11-12.md; src/studio/site-intelligence; src/studio/site-relevance.ts; source-packs/movie-tv-en.ts; routes-site-intelligence.ts.

## Hallazgos medidos en aceptación local del 12-11-2026
- 4192 URLs descubiertas mediante 6 sitemaps, 199 extraídas y 3992 discovered no analizadas. 187 de 199 páginas procesadas eran /peliculas/*. No interpretar páginas descubiertas como páginas extraídas, indexables o indexadas en Google.
- Topic clusters detectados: movies 187, article 11 (incluye legales), sports 1. Se omitió representatividad de /series, /canales, /programas, /programacion-tv. La cobertura no es fiable para decidir estrategia.
- 21 recomendaciones externas de fuentes, 20 verified y 1 failed, todas en inglés; pack movie-tv-en no representa TV española.
- Competidores recomendaron sitios irrelevantes (incluyendo wa.me y tecnoriasl.com) y no rivales comparables de programación española.
- Plan 7x2 terminó 12/14 antes de fill y 14/14 después. 7x3: 14/21, 20/21 tras fill. Fallo documentado: pilar aprobado "Streaming y plataformas" no coincide con cluster detectado, por lo que site-relevance.ts:303-311 niega +15 relevancia.
- Artículos español con encabezados ingleses; imagen falló para proyectos plan_item con topicId null. No confundir fuentes y SEO de contenido con métricas externas Search Console.

## Propuesta
Muestreo estratificado por estructura/ruta de sitemap + tamaño, no solo orden de entrada; páginas importantes y representatividad TDT, canales, guías, deportes, plataformas, series, películas; etiquetar discovered/crawled/extracted/validated. Separar ruido legal de clusters editoriales. Enlazar pilares aprobados a taxonomía semántica canonical antes de score, soportando aliases. Ofrecer recomendaciones con procedencia y grado de evidencia, idioma ES, mercado España; puntuación de calidad (relevancia, licencia, originalidad, actualidad, first-party). Source registry no equivale a motores de keywords de terceros. SEO scoring explícitamente grounded; volumen/ranking/indexación externa solo si se importó de integración legitimada.
