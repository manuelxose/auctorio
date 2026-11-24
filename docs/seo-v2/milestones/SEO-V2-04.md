# SEO-V2-04 — Inteligencia SEO propia y puntuación según el negocio

Fecha: 2026-11-24. Rama: `feat/seo-v2-04-first-party-intelligence`, creada desde `origin/main` (`ddf922e`).

## Veredicto: PARTIAL

El motor, la sincronización, la puntuación y la atribución funcionan y están probados sobre PostgreSQL real, pero **Google no se ha llamado en vivo**: no hay
secreto del cliente OAuth ni cuenta autorizada. El contrato impide dar PASS solo con respuestas simuladas.

Dos hechos que condicionan el hito:

1. **No existía ninguna integración con Search Console** que auditar o reutilizar: ni modelos, ni permisos, ni sincronización (solo el inicio de sesión con
   Google). Se ha construido sobre piezas existentes: sesiones OAuth, cifrado, trabajador de control, oportunidades y auditoría.
2. **SEO-V2-03 no existe** en `main` ni en ninguna rama. Se ha partido del último `main` aceptado (02). Como «conocimiento validado» se usan el inventario
   rastreado, el perfil del sitio y los datos de proveedor ya guardados; no hay repositorio de conocimiento compartido.

## Qué se ha implementado

- **Search Console**: OAuth de solo lectura con PKCE, estado de un uso ligado a la persona que lo inicia, propiedad del mismo dominio y token cifrado. Descarga
  por días de consultas, páginas, países, dispositivos, clics, impresiones y posición media; cada día una sola vez, 16 meses hacia atrás en tandas de 10.
  Inspección de indexación (10 páginas por pasada, 50 al día). Estado, frescura, último error y próximo intento visibles. Acceso revocado: se borra el token.
- **Detección**: CTR bajo frente a las propias páginas por posición, dispositivo, intención y mercado; consultas con recorrido; comerciales; nuevas de cola larga; sin
  página dedicada; páginas en expansión; caídas, decadencia, caída estacional y de demanda; canibalización; temas débiles; enlaces internos; temporada; indexación.
  Todas con mínimo de evidencia; las caídas descuentan el ruido, lo que bajó el sitio y el mismo periodo del año anterior.
- **Puntuación**: siete perfiles de negocio con pesos editables, temas prioritarios y 12 factores; la calidad de la evidencia va en una confianza aparte.
  Lo desconocido queda fuera de la fórmula y se muestra como desconocido.
- **Acciones**: las once pedidas, con protecciones deterministas (una acción por página, enfriamiento de 28 días, duplicados, canibalización abierta, evidencia mínima).
- **Atribución**: punto de partida congelado, ventanas de 28, 56 y 90 días, páginas no tocadas o grupo de control opcional, año anterior, costes y resultado
  observado. `causal` es siempre `false` y los pesos no cambian solos.
- **Explicación** legible por máquina (versión 1) para Studio, el plan y el asistente (`seo_opportunities`).
- **Studio**: `/studio/seo-opportunities` (Avanzado → Investigación).

## Limitaciones corregidas del algoritmo anterior

| Verificada | Corrección |
|---|---|
| Preferencia fija por lo informativo | Depende del perfil; intención desconocida no puntúa |
| Rechazo de toda palabra ya posicionada | Hasta la posición 30 es optimización de esa página; más allá se puede crear |
| Rechazo sin volumen externo | Se conserva si Search Console muestra impresiones propias |
| Exceso de peso de la dificultad | Media geométrica ponderada; la posición propia manda; dificultad desconocida ya no cuenta como alcanzable |

## Cambios de comportamiento

1. Las puntuaciones de palabras suben de escala (media geométrica en vez de producto): no son comparables con las guardadas antes.
2. El plan puede elegir consultas de Search Console sin volumen y sin proveedor configurado, y compra menos si ya bastan.
3. La lista de Competidores muestra solo las suyas; conservan su estado y ganan acción, puntuación y explicación.

## Decisiones y supuestos

- Search Console no pasa por el gobernador de costes (es gratuito y autorizado); la parada de emergencia sí lo detiene.
- **Nada se ejecuta solo.** Solo el contenido nuevo va al plan: un elemento «actualizar» del plan redacta hoy un artículo nuevo, así que las mejoras son tareas que
  una persona aprueba y marca como hechas. Fusionar, redirigir, borrar o cambiar canónicas no tiene código; aprobar una canibalización exige
  `review.approve` y `publishing.manage`.
- Google Ads API no se implementa: es opcional y no hay credenciales aprobadas. Conversiones: «no disponible», no hay analítica autorizada.
- Coste SEO por artículo: desconocido cuando interviene un proveedor (el registro no lo reparte); 0 si solo hay datos propios.

## Archivos y migraciones

- Migración aditiva `20261124220000_first_party_seo`: cinco tablas, columnas nuevas en `content_opportunities` y marca de las decisiones ya tomadas.
- Nuevos: `src/infrastructure/google/search-console.ts`, `src/studio/search-console.ts`, `src/studio/seo-intelligence/` (`detect`, `scoring`, `select`, `attribution`,
  `performance`, `index`), `routes-seo-intelligence.ts`, página y servicio de Studio, `tests/seo-intelligence.test.ts`, `tests/search-console.test.ts`.
- Modificados: `keyword-candidates.ts`, `competitors/index.ts`, `copilot/tools.ts`, `worker-automation.ts`, `routes.ts`, navegación, rutas y detalle de palabra de Studio.

## Pruebas

| Comprobación | Resultado |
|---|---|
| Migraciones en base limpia y `migrate diff` | Sin diferencias |
| Typecheck, build y build de Studio | Correctos |
| Suite de backend en paralelo | 720 de 722; los 2 fallos (`autopilot-planner`, `editorial-engine`) pasan aislados: interferencia entre archivos con la base común |
| Suite de backend en serie | 722 de 722 |
| Specs de Studio | 46 de 46 (Karma) |
| Pantalla, 1024 y 375 px, base de demostración | Ver, explicar, aprobar, completar y cambiar perfil persisten; sin desbordes ni errores de consola |

Defectos encontrados y corregidos durante el hito: un sitio sin temas se trataba como irrelevante en lugar de desconocido; el motor proponía contenido que el plan después
rechazaba por relevancia; sin enlaces rastreados se afirmaba «0 enlaces»; un 403 se mostraba como lista vacía.

## Aceptación

| Criterio | Estado |
|---|---|
| Oportunidades con Search Console sin depender de investigación de pago | Cumplido con datos simulados; falta en vivo |
| Palabras posicionadas producen optimizaciones | Cumplido |
| Volumen externo desconocido no invalida la evidencia propia | Cumplido |
| La puntuación se adapta al negocio | Cumplido |
| Se distingue lo observado de lo estimado | Cumplido |
| Recomendaciones trazables y explicables | Cumplido |
| Search Console aislado por tenant | Cumplido, con prueba |
| Sin afirmaciones causales | Cumplido |

## Peticiones y gasto

Peticiones a Google: **0**. A proveedores SEO: **0**. Gasto: **0 USD**.

## Seguridad y licencias

- `webmasters.readonly` es un permiso sensible: Google exige verificar la aplicación; hasta entonces solo conectan usuarios de prueba.
- El código de autorización llega por la URL de Studio (PKCE, un uso) y puede quedar en el registro de acceso.
- Revocar en Google retira el permiso de toda la cuenta; solo se hace si ningún otro sitio de esa persona en el workspace lo usa.

## Pendiente

1. `GOOGLE_CLIENT_SECRET`, API activada, URI de redirección y verificación de la aplicación; después, prueba en vivo.
2. Que el plan sepa actualizar un artículo publicado: hoy «actualizar» (también en Competidores) redacta uno nuevo.
3. Los umbrales y pesos son supuestos razonados, sin calibrar con datos reales.
4. El detalle por consulta guarda las 5.000 filas con más clics al día.
5. Las palabras posicionadas según proveedor se puntúan en el siguiente análisis y no caducan solas.
6. SEO-V2-03, si sigue previsto.

No se hizo revisión independiente, por indicación del responsable.
