# SEO-V2-05 — Integración de la inteligencia SEO en todo el proceso editorial

Fecha: 2026-11-25. Rama: `feat/seo-v2-05-editorial-integration`, creada desde `origin/main` (`15a29c3`, con SEO-V2-03 ya fusionado).

## Veredicto: PASS, con restricciones

Se cumplen los criterios de aceptación, probados sobre PostgreSQL real con proveedores, modelo de texto y páginas simulados; ninguno exige una llamada real y no había presupuesto
para hacerla. Restricciones: **nada se ha ejecutado con un proveedor de pago real**, no se ha publicado en ningún CMS real y faltan CI y fusión en `main`.

## Auditoría de consumidores

Quedaba una vía directa a proveedores de pago: **Tavily y Firecrawl** (competidores, fuentes, noticias y Engagement), sin presupuesto común, caché, libro de gastos ni parada de
emergencia. Ahora pasan por el gestor y el gobernador; una prueba impide que vuelva a haber otra. La lista completa está en [architecture.md](../architecture.md).

| Hallazgo | Corrección |
|---|---|
| Reintentar o reescribir un artículo volvía a buscar resultados y vídeo, y podía pagarlos | El artículo guarda lo que encontró y lo reutiliza |
| El plan rellenaba huecos con temas del modelo sin decirlo | Carencia registrada y visible; tema del modelo marcado «sin medir» y descartado si el sitio ya lo cubre |
| La procedencia de la oportunidad no quedaba en el artículo | `opportunityId`, investigación, estado y fecha de las métricas |
| Lo aprobado por una persona perdía su prioridad al puntuar | Va primero |
| Los temas excluidos solo iban en el texto para el modelo | Se descartan antes de repartir |
| Cada plan reservaba el doble de lo que necesitaba más ocho, y dejaba sin nada a otro simultáneo | Reserva la mitad de más, dos como mínimo |
| «Mejorar artículo» escribía un segundo artículo | Nueva versión de la misma página, con aprobación |
| Autopilot podía publicar solo la reescritura de una página pública | Siempre espera a una persona |
| El fragmento del buscador se usaba como dato | Solo cuenta la página leída; si no, es una pista |
| El lector de páginas seguía redirecciones sin revisarlas, leía sin límite y era vulnerable a cambios de DNS | Corregido |
| Un texto ajeno podía cerrar su bloque de datos en el prompt | Corregido |
| `undici` se usaba sin declararse | Declarado |

## Qué se ha implementado

- **Planificación**: oportunidades guardadas, reservadas de forma atómica, con prioridad de negocio y reparto por temas. Solo se investiga si faltan; si lo pide Autopilot, solo con
  permiso de la plataforma. Rehacer una propuesta no investiga.
- **Colas**: las mejoras no cuentan como artículos del plan ni del cupo, la automatización no las empieza y aprobarlas exige `review.approve` y `publishing.manage`.
  Preparar una revisión desde Oportunidades SEO escribe una versión nueva y la deja pendiente.
- **SERP**: se compra para un artículo que se está redactando y lo necesita. Se guarda si es en vivo o histórica, su fecha y el formato dominante. Para noticias no se compran
  resultados históricos ni se usa nada de más de tres días.
- **Evidencias**: oficiales y primarias primero, con fecha de lectura.
- **Vídeo**: aprobados, canal propio, guardado y, solo si el artículo lo pide, búsqueda. Pertinencia y permiso de inserción comprobados.
- **Automatización**: sin proveedor, saldo o presupuesto se sigue con lo guardado; el borrador dice qué le faltó y una noticia sin fuente actual no se publica sola.
- **Studio**: carencias, borradores incompletos, revisiones, vídeos aprobados y fuentes nuevas a petición.

## Decisiones y supuestos

- El modo de los proveedores SEO no elige el buscador web; «desactivado» y la parada de emergencia sí lo paran.
- Precio máximo del buscador: el crédito publicado más caro, leído el 2026-11-25. Con un plan gratuito se anota más de lo que se paga.
- No existe ningún cupo de artículos comprado en el código: se protege el número pedido al plan y la cadencia.
- La API oficial de YouTube no se implementa: no hay clave autorizada. Se usan oEmbed y el canal público.
- Añadir palabras a mano sigue midiéndolas: lo pide una persona.
- Una página que no publicó Auctorio sigue siendo una tarea manual.
- Se descartó bloquear la redacción de noticias sin fuente: se redacta y se retiene.

## Cambios de comportamiento

1. El descubrimiento web gasta como máximo 2 USD al mes por workspace en búsquedas y 1 en páginas, y se detiene con las paradas.
2. Con fuentes suficientes en el plan, la guía ya no compra resultados; sin página leída, no hay dato.
3. Con vídeo activado, solo se busca si el artículo lo pide.
4. Un plan puede salir con huecos donde antes el modelo repetía un tema ya cubierto.

## Archivos y migraciones

Sin migraciones. Nuevos: `src/infrastructure/seo/web.ts`, `tests/seo-editorial.test.ts`. Modificados: gestor, gobernador, política, precios y registro SEO, `web-intelligence.ts` y sus
consumidores, `serp-sources.ts`, `youtube-videos.ts`, `production/`, `editorial-plan.ts`, `keyword-candidates.ts`, `seo-research/`, `seo-intelligence/`, planificador, rutas, lector de
páginas, Studio y documentación.

## Pruebas

| Comprobación | Resultado |
|---|---|
| Suite de backend, en serie, sin claves, base y Redis propios | 757 de 757 |
| `migrate diff` | Sin diferencias |
| Typecheck, build y build de Studio | Correctos |
| Specs de Studio (Karma) | 50 de 50 |
| Dev real, `http://localhost:4420` | Carencia en Autopilot y en el plan, revisión rechazada en una página ajena, vídeos aprobados persistentes, casilla de fuentes nuevas y avisos del borrador (con datos de muestra, ya retirados) |

Escenarios de redacción probados: sitio nuevo, establecido, medio, servicios, sin Search Console, sin credenciales, presupuesto agotado, solo DataForSEO, solo AnyAPI (se redacta, pero
AnyAPI sigue cerrado para la automatización), externos desactivados, parada de emergencia, caída a mitad, sin saldo y precio desconocido.

Sin comprobar: anchos de móvil de los avisos nuevos; la revisión completa desde la pantalla con una página propia (sí por prueba); el plan de extremo a extremo con otros tipos de sitio.

## Aceptación

| Criterio | Estado |
|---|---|
| Los procesos editoriales siguen funcionando | Cumplido, suite completa |
| Los planes reutilizan oportunidades | Cumplido, con prueba |
| Repetir y editar no compra | Cumplido, con prueba |
| Toda petición gobernada y auditable | Cumplido, con prueba |
| Calidad de fuentes y verificación | Cumplido, con prueba |
| Permisos de publicación | Cumplido, con prueba |
| CMS sin romper | Cumplido con adaptadores simulados |
| Presupuesto agotado sin fallos | Cumplido, con prueba |

## Peticiones y gasto

Peticiones de este hito a proveedores SEO, buscadores web o modelos: **0**. Gasto: **0 USD**. Solo se leyeron las páginas públicas de precios y condiciones de Tavily y Firecrawl.

Incidencia: una repetición de una prueba se ejecutó a las 12:08 UTC contra la base de desarrollo en lugar de la aislada, y se cortó. Todas las respuestas eran simuladas. Vació la única
fila de salud de proveedores que había (ajustes, presupuestos y claves estaban vacíos) y dejó un workspace y un gasto ficticios de 0,024 USD, ya borrados.

## Seguridad y licencias

- Las condiciones de Tavily y Firecrawl sobre guardar resultados no se han establecido: 90 días, por tenant, sin historial de páginas.
- Siguen sin redirección vigilada, porque no leen fuentes: el descubrimiento OIDC y la prueba de destino (`routes.ts`) y la verificación por HTTP del publicador.

## Pendiente

1. CI y fusión en `main`, cuando el responsable lo apruebe.
2. Primera ejecución real con presupuesto autorizado.
3. Precio máximo de `historical_serps`: sin él no hay resultados de DataForSEO.
4. Vigilar las redirecciones citadas en Seguridad.
5. Los umbrales (reparto por temas, fuentes suficientes, pertinencia del vídeo) son supuestos sin calibrar.

No se hizo revisión independiente, por indicación del responsable.
