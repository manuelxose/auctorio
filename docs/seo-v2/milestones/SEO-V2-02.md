# SEO-V2-02 — Gobernador de costes SEO y optimización de la adquisición

Fecha: 2026-11-24. Rama: `feat/seo-v2-02-cost-governor`, creada desde `origin/main` (`ff0168d`).

## Veredicto: PASS, con restricciones

Se cumplen los criterios de aceptación. Las pruebas usan respuestas simuladas sobre PostgreSQL y procesos reales; ningún criterio de este hito exige una llamada
real, y no había presupuesto para hacerla. La automatización de AnyAPI, el enrutado automático y el respaldo de pago **siguen bloqueados en código**.
Pendiente: CI y fusión en `main`.

## Qué se ha implementado

- **Precios** (`pricing.ts`): registro único y versionado con unidad, precio por petición y por elemento, mínimo, máximo, lote, moneda, fecha, fuente e
  incertidumbre. Los adaptadores ya no llevan precios. Sin máximo conocido no se compra. Una factura por encima del máximo cierra la operación.
- **Gobernador** (`seo-governor.ts`): presupuestos de plataforma, proveedor, plan, workspace, sitio y operación; asignación de alta y recurrente; tope diario;
  gasto extra autorizado. Se aplican todos a la vez, y también los `cost_budgets` del workspace.
- **Reservas** atómicas e idempotentes: reservada, en curso, liquidada, liberada y sin confirmar. Una petición sin confirmar retiene su máximo sin límite de tiempo
  hasta que llega la respuesta o la resuelve un administrador. Cada cargo del registro apunta a su reserva.
- **Caché unificada** (`seo-cache.ts`) sobre la tabla existente: claves canónicas, vacíos reales, procedencia por campo, historial y retención según licencia.
- **Compra única entre procesos**: un bloqueo por clave de caché; los lotes solapados no repiten ninguna palabra.
- **Reutilización por campo**: volumen, CPC, dificultad e intención que llegan con el descubrimiento no se vuelven a comprar.
- **Optimización**: agrupación de lotes simultáneos, cola por prioridad, espera hasta 10 palabras en `search_volume` (0,09 USD fijos), reintentos acotados,
  cortacircuitos, tope de peticiones por minuto y parada cuando ya hay candidatas suficientes.
- **Frescura** configurable por dato, tipo de sitio, mercado, urgencia, importancia y licencia. Nada se renueva por calendario.
- **Administración** (`/studio/admin/seo`): parada de emergencia, límites, uso, autorizaciones, precios, frescura, peticiones sin confirmar y registro de consumo.
  Todo se aplica en el servidor, solo para administradores de plataforma, y queda auditado.

## Cambios de comportamiento

1. **Las guías se quedan sin fuentes SERP de DataForSEO** hasta que un administrador guarde su precio máximo: hoy es desconocido y el hito exige no gastar.
2. Cambiar a mano la palabra de una pieza ya no compra datos (regla 9 del contrato): usa lo guardado y queda sin medir hasta la siguiente planificación.
3. Una palabra sin volumen puede quedar «sin medir» mientras no haya 10 para el respaldo de Google Ads.
4. Los datos de palabras clave se reutilizan hasta 75 días (antes 30), y SERP y YouTube, 21 (antes 7).
5. Los presupuestos empiezan a contar al desplegar: el gasto anterior no tiene reserva.

## Decisiones y supuestos

- Los límites por defecto (25 USD al mes y 5 al día para la plataforma, 20 por proveedor, 5 por workspace, 3 por sitio) son supuestos editables.
- Tabla propia de presupuestos: en `cost_budgets` gana el límite más específico y aquí se aplican todos. El registro de gasto es el mismo.
- La caché sigue siendo por workspace: ninguna licencia permite compartirla. La política es de no comparar proveedores; no hay presupuesto de evaluación.
- Retención de 90 días mientras la licencia no diga nada.

## Archivos y migraciones

- Nuevos: `pricing.ts`, `policy.ts` (en `src/infrastructure/seo/`), `seo-governor.ts`, `seo-cache.ts`, `seo-control.ts` (en `src/studio/`),
  `seo-governor-settings.component.ts`, `seo-labels.ts`, `tests/seo-policy.test.ts`, `tests/seo-worker.ts`.
- Modificados: contrato, registro y adaptadores SEO, `seo-manager.ts`, `keyword-metrics.ts`, `keyword-candidates.ts`, `serp-sources.ts`, `youtube-videos.ts`,
  `plan-item-keyword.ts`, `editorial-plan.ts`, `production/plan-item.ts`, `provider-cache.ts`, `routes-admin-seo.ts`, panel y servicio de administración.
- Migración: `20261124180000_seo_cost_governor` (cinco tablas y columnas nuevas; aditiva).

## Pruebas

| Comprobación | Resultado |
|---|---|
| 45 migraciones en base limpia y `migrate diff` | Sin diferencias |
| Typecheck, build y build de Studio | Correctos |
| Suite completa de backend | 702 de 702 |
| Specs de Studio (Karma) | 46 de 46 |
| Panel en navegador, 1280 y 390 px, base de pruebas | Límite, autorización, resolución y parada persisten y quedan auditados; sin errores ni desbordes |

Dos pasadas anteriores de la suite dieron fallos. La primera, `autopilot-planner` y `studio-rbac-matrix` (un 500 de causa no determinada, que
no se ha repetido). El de `autopilot-planner` volvió en CI: era un error previo de `editorial-plan.ts`, un rechazo sin capturar cuando la operación de un plan
desaparece mientras se genera; corregido y con prueba. La segunda fue un defecto de este hito, ya corregido (véase abajo). Una pasada previa se colgó por compartir Redis con el entorno de desarrollo local.

| Prueba adversaria | Resultado |
|---|---|
| Cinco procesos piden los mismos datos, con lotes solapados | Cada palabra, una vez |
| 300 reservas simultáneas; 8 procesos con un presupuesto común | Solo las que caben |
| Trabajador perdido antes y después del envío | Liberada; sin confirmar |
| Trabajo entregado dos veces; prueba pulsada dos veces | Una reserva, un cargo |
| Timeout con cobro incierto | Retiene el máximo; sin repetición |
| Mercados, idiomas y operaciones con el mismo texto | Sin colisiones |
| Respaldo hacia un proveedor desactivado | Sin peticiones |
| Planes regenerados e interacciones repetidas | Ninguna compra nueva |
| Presupuesto agotado y parada de emergencia | Nada sale, tampoco lo ya reservado |

Defectos encontrados y corregidos durante el hito: la agrupación de lecturas de la caché mezclaba operaciones con la misma clave (previo); el presupuesto de plan sumaba
toda la plataforma; una respuesta parcial podía recomprarse sin espera; las reservas en espera agotaban las conexiones de la base de datos.

## Aceptación

| Criterio | Estado |
|---|---|
| Ninguna compra simultánea duplicada | Cumplido |
| Sin llamadas fuera de control | Cumplido: una prueba impide importar adaptadores o gastar fuera del gestor |
| Cada compra con reserva y registro | Cumplido |
| Métricas reutilizadas entre operaciones compatibles | Cumplido |
| Presupuestos coherentes con concurrencia | Cumplido |
| Un proveedor desactivado no recibe peticiones | Cumplido |
| Precio desconocido: no se gasta | Cumplido |
| Controles funcionales y auditados | Cumplido |

## Peticiones y gasto

Peticiones a proveedores: **0**. Gasto: **0 USD**. No se ha consultado ninguna página de precios: valen las cifras verificadas en SEO-V2-01.

## Seguridad y licencias

- Los términos de DataForSEO sobre uso, almacenamiento y reventa siguen sin verificar; AnyAPI sigue sin decir nada del almacenamiento.
- Una licencia que prohíba el uso comercial impide la llamada; si prohíbe almacenar, no se guarda nada.
- La petición ya enviada no se puede retirar: la parada evita las siguientes.
- Los límites valen dentro de Auctorio: conviene fijar también un tope en la cuenta de cada proveedor.

## Pendiente

1. Precio máximo de `historical_serps`, con una factura o la tarifa.
2. Confirmación escrita de AnyAPI y revisión de los términos de DataForSEO.
3. DataForSEO no se ha llamado en vivo por el camino nuevo; tampoco se ha probado en producción.
4. Desplegar API y trabajadores a la vez: uno antiguo gasta sin reservar.
5. Renovar la clave de prueba de AnyAPI (de SEO-V2-01).

No se hizo revisión independiente, por indicación del responsable. Los subagentes no estuvieron disponibles (un hook modificaba sus peticiones), así que la lectura
y las pruebas se hicieron en la sesión principal.
