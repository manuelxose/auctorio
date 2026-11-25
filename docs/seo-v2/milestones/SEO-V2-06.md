# SEO-V2-06 — Interfaz completa de inteligencia SEO y administración de operaciones

Fecha: 2026-11-25. Rama: `feat/seo-v2-06-seo-operations-ux`, creada desde `origin/main` (`648c6be`, con SEO-V2-05 ya fusionado como PR 12). Commits: `81710ba` (servidor), `cf9ab67` (Studio) y el de este informe. Sin subir ni fusionar.

## Veredicto: PASS, con restricciones

Se cumplen los criterios de aceptación, probados sobre PostgreSQL real, en navegador real y con datos de ejemplo. Ninguno exige una llamada de pago y no había presupuesto para hacerla. Restricciones: **no se ha llamado a
ningún proveedor real** (tampoco a los puntos gratuitos de saldo), los controles que gastan o conectan con Google no se han pulsado, y faltan CI y fusión en `main`.

## Auditoría de Studio

| Hallazgo | Corrección |
|---|---|
| Importes de los proveedores (gasto, máximo, precio por paso) visibles y editables por cualquier rol en Investigación SEO | Los clientes no reciben importes, precios ni nombres de proveedor; ven porcentajes de su asignación |
| El coste de SEO se colaba en los totales de Salud del sistema y en Descubrimiento web | Excluido |
| Cifra fija «—» de Search Console en Señales SEO | Retirada; los datos reales están en Resumen y Rendimiento |
| Search Console y el perfil estaban repartidos entre Oportunidades e Investigación | Una sola página: Configuración → SEO del sitio |
| «Oportunidades» eran tres cosas | Oportunidades SEO, Huecos de contenido (competidores) y Oportunidades (Reddit y Quora, en Home) |
| Botones sin permiso visibles en todas las páginas SEO | Se ocultan; el servidor sigue decidiendo |
| Confianza desconocida pintada como baja; valores sin dato mezclados con 0 | «Desconocida», «No disponible», «Sin dato» |
| Cuatro copias del traductor de errores y del vocabulario | `components/seo-labels.ts` |
| Presupuestos anidados dentro de Proveedores y parada de emergencia enterrada | Centro de operaciones con pestañas y la parada siempre arriba |
| Paneles laterales sin control del foco; el diálogo de confirmación no lo devolvía | Directiva común `app-drawer` y corrección del servicio |
| Textos grises por debajo de 4,5:1 y zona Advanced ilegible en tema oscuro | Corregido (ver Accesibilidad) |
| `cancelled` mal escrito al valorar una investigación fallida | Corregido |
| La retención solo se aplicaba tras una compra | También cada hora desde el worker |

El mapa de rutas y responsabilidades está en [architecture.md](../architecture.md), sección *Interface and operations*. No hay ninguna entrada nueva de primer nivel.

## Qué se ha implementado

- **Site Intelligence**: Resumen (estado, rendimiento, reserva, asignación, recomendaciones y siguiente acción), Palabras clave (50 por página, filtros, orden con lo desconocido al final, historial y procedencia) y Rendimiento
  (28 o 90 días, páginas, consultas, contenido nuevo y oportunidades ejecutadas, sin atribuir causas).
- **Oportunidades SEO**: crear o mejorar, acción, intención, mercado, confianza, orden y 25 por página; aplazar; llevar al plan lo aprobado; investigar más; enlace a una oportunidad concreta.
- **Competidores**: palabras en común, fecha de la última investigación y aviso si es antigua. Abrir la página no consulta nada.
- **Investigación SEO**: asignación, petición con temas y mercado, vista previa con el alcance y el porcentaje máximo, y control de cada investigación.
- **Configuración → SEO del sitio**: negocio y temas, investigación (automatización e intensidad), Search Console y prioridades de mejora.
- **Operaciones SEO** (administración global): proveedores (saldo, historial de fallos, credenciales, prueba real), presupuestos (efectivo, agotados, excepciones), costes (filtros, coste por resultado, reutilización, CSV),
  investigación de todos los workspaces (control, workers, desactivar la automática), datos y gobierno (licencias con doble aprobación, retención, procedencia, avisos, sincronización) y rentabilidad.
- **Asistente**: explica una oportunidad, qué mejorar, qué se sabe del sitio y si hace falta investigar; puede preparar una investigación, que solo empieza al confirmarla con el mismo permiso y los mismos límites.

## Decisiones y supuestos

- **Intensidad en vez de dinero.** Los topes por investigación (0,10, 0,25 y 0,50 USD) son supuestos sin calibrar; los presupuestos mandan siempre.
- **El porcentaje de la asignación** es el del límite más apurado del plan, el workspace o el sitio, incluido el diario.
- **No hay ingresos**: Auctorio no factura, así que ingresos y margen de contribución se muestran como no disponibles. No se ha añadido ningún precio por plan.
- **Compartir datos** exige dos administradores de la plataforma. Con uno solo no se puede activar.
- **La retención no se alarga** con una licencia aprobada: sigue lo establecido en el código.
- **El gasto evitado es una estimación** y así se rotula. Los contadores empiezan con este hito.
- **El plan** de los costes es el que el workspace tiene hoy; el registro no guarda el de cada día.
- **Conversiones**: no hay fuente autorizada; se dice.
- **Localización**: Studio no tiene capa de traducción. Se ha seguido su patrón (texto en español en el código), con un vocabulario único y cifras en formato español.
- **Sin gráficas de terceros ni virtualización**: una gráfica SVG con su tabla y paginación en todas las listas largas.

## Cambios de comportamiento

1. Las respuestas de cliente pierden `maxUsd`, `cost`, `estimatedUsd`, `billedUsd`, `seoCostUsd`, `contentCostUsd` y `providerId`.
2. `PUT seo-research/policy` rechaza `maxUsdPerRun` y los límites por lote; `POST seo-research/runs` rechaza `maxUsd`; `GET seo-research/keywords` pasa a ser `GET seo-keywords`.
3. Site Intelligence se abre en Resumen.
4. Los errores internos de una investigación llegan al cliente solo por su nombre.

## Archivos y migraciones

Migración `20261125180000_seo_operations`, aditiva: `seo_usage_daily`, `seo_license_records`, `seo_research_holds` y la columna `seo_provider_states.balance`.

Nuevos en `src/studio`: `seo-workspace.ts`, `seo-operations.ts`, `seo-usage.ts`, `seo-licensing.ts`, `routes-admin-seo-ops.ts`, `copilot/seo-tools.ts`. Nuevos en Studio: `components/seo/`, `components/admin-seo/`, `components/ui/app-pager`,
`components/ui/app-drawer`, `pages/seo-settings-page`, `services/admin-seo-ops-api`. Pruebas: `tests/seo-operations.test.ts`, `e2e/specs/seo-operations.spec.ts` y ocho specs de Karma. Modificados: gestor, gobernador,
investigación, rutas SEO y de administración, costes, descubrimiento, asistente, páginas SEO, competidores, administración y estilos.

## Pruebas

| Comprobación | Resultado |
|---|---|
| Suite de backend, en serie, sin claves, base y Redis propios | 776 de 776 |
| `tests/seo-operations.test.ts` (permisos, aislamiento, importes, límites, parada, licencias, asistente) | 19 de 19 |
| Specs de Studio (Karma) | 88 de 88 |
| `migrate diff` | Sin diferencias |
| Build de producción de Studio | Correcto; el paquete inicial avisa (542,57 kB sobre 500) y no supera el máximo de 1 MB |
| `e2e/specs/seo-operations.spec.ts` en Chrome, contra `http://localhost:4420` | 9 de 9 |

Recorrido en navegador, 16 vistas de cliente y 6 pestañas de administración, a 1440 y 390 px:

| Área | Evidencia |
|---|---|
| Navegar y refrescar | Ninguna escritura; `seo_spend_reservations` no cambia |
| Roles | Lector: 403 en 20 de 20 escrituras y ningún botón; `seo_manager`: proyectos sí, política e integraciones no; quien no es administrador: 403 en 24 de 24 rutas de `/v2/admin/seo` |
| Oportunidades | Aprobar, aplazar, descartar, reabrir, llevar al plan, marcar como hecha: estado en base y auditoría |
| Investigación | Pedir, vista previa, empezar, pausar, reanudar, cancelar, reintentar: estado en base, sin reservas |
| Competidores | Aceptar, rechazar, pausar, editar, añadir, retirar y huecos de contenido |
| Ajustes | Las cuatro pestañas guardan y persisten; Search Console: desconectar conservando y borrando |
| Administración | Modo, proveedores, prioridad, credenciales (Firecrawl, con un valor falso: nunca vuelve en la respuesta), presupuestos, autorizaciones, precios, frescura, peticiones sin confirmar, costes y CSV, investigación, desactivación, licencias (autoaprobación rechazada), borrado de lo caducado, parada |
| Estados | Carga, error con Reintentar, vacío, parado, desactivado y sin proveedor, reales; asignación agotada y vista previa con porcentaje, con la respuesta sustituida en el navegador |

El primer recorrido encontró once defectos. El más grave: `GET seo-research` devolvía aún `profile.policy.maxUsdPerRun`; ni la prueba ni el filtro lo veían porque compartían la misma expresión. Corregidos los dos y los
demás (errores «[object Object]», foco, enlaces sin esquema, estados de error, presupuestos sin paginar, textos sin traducir, contraste y tamaños).

Capturas con datos de ejemplo: [SEO-V2-06/](SEO-V2-06/README.md).

### Accesibilidad

Teclado, foco, nombres, paneles modales, regiones de tabla y contraste comprobados con un evaluador propio en Chrome: no hay axe-core instalado y no se añadió. Objetivos táctiles de 24 px o más salvo el enlace «Auctorio»
de la ruta de migas (15 px, anterior) y el campo interior de las búsquedas (23 px dentro de una etiqueta de 36). El tema oscuro de las vistas nuevas se corrigió y
comprobó: solo el contador de las pestañas queda en 4,45:1.

### Sin comprobar

Autorizar y probar, Consultar saldo contra el proveedor (sí con respuestas simuladas), Descubrir y Comparar cobertura, Conectar Search Console, y las lecturas del sitio: gastan, rastrean o salen a Google. Lectores de pantalla
reales. Tema oscuro de Perfil, Pilares, Salud técnica, Rastreo y Competidores: son páginas anteriores dibujadas sobre papel claro y no se han rehecho.

## Aceptación

| Criterio | Estado |
|---|---|
| Funciones SEO de cliente integradas en Studio | Cumplido |
| Control completo de proveedores, investigación, presupuestos, costes y parada | Cumplido |
| Ningún usuario normal accede a costes, secretos o datos de otro workspace | Cumplido, con prueba |
| Todos los controles tienen servidor detrás | Cumplido; los que no se pulsaron tienen prueba de backend |
| Navegación e identidad conservadas | Cumplido |
| Sin datos inventados ni controles inertes | Cumplido |
| Pruebas de navegador, accesibilidad y backend | Cumplido |

## Peticiones y gasto

Peticiones a proveedores SEO, buscadores o modelos: **0**. Gasto: **0 USD**. Se leyó la especificación pública de AnyAPI (`openapi.json`) para el formato del saldo.

Incidencias: los datos de ejemplo se sembraron en la base de desarrollo con la parada de emergencia activa, y se borraron; quedaron las filas originales y una sola reserva, la que había. La base aislada `auctorio_seo_v2_06` se conserva.

## Seguridad y licencias

- Autoaprobar una licencia se rechaza (409); una prohibición manda sobre cualquier registro; revocar deja de compartir en el acto.
- El CSV escapa las celdas que una hoja de cálculo ejecutaría y su descarga se audita.
- El asistente muestra como texto plano lo que viene de fuera; una dirección suelta sigue siendo texto visible.
- Los nombres de proveedor siguen apareciendo a clientes en Configuración → Descubrimiento web, anterior a este hito.
- Ninguna licencia permite hoy guardar ni compartir de forma explícita.

## Pendiente

1. CI y fusión en `main`, cuando el responsable lo apruebe.
2. Primera ejecución real con presupuesto autorizado, incluido el saldo.
3. Conexión real de Search Console (`GOOGLE_CLIENT_SECRET`).
4. Calibrar las intensidades.
5. Un segundo administrador en `PLATFORM_ADMIN_EMAILS` si se quiere compartir datos.
6. Ingresos por suscripción, si se quiere medir el margen.

No se hizo revisión independiente, por indicación del responsable.
