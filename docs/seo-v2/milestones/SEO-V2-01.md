# SEO-V2-01 — Base SEO independiente del proveedor e integración de AnyAPI

Fecha: 2026-11-24. Rama: `feat/seo-v2-01-provider-foundation`, creada desde `origin/main` (`84bed81`).

## Veredicto: PASS, con restricciones

Se cumplen los criterios de aceptación, incluida la validación real: las seis operaciones de AnyAPI se llamaron una vez en es-ES, con
presupuesto autorizado, y respondieron según su documentación. AnyAPI **no** queda aprobada para producción: faltan los presupuestos
duros (SEO-V2-02), la confirmación de licencias y contrastar la exactitud de sus cifras. Su automatización sigue bloqueada.

## Qué se ha implementado

- **Contrato** (`src/infrastructure/seo/contract.ts`): seis capacidades declaradas, mercado, lotes, paginación, coste estimado y
  máximo, coste facturado, origen, fecha, metodología, resultados parciales, errores tipados y licencia. La dificultad orgánica va separada de la
  competencia publicitaria; lo desconocido es `null`.
- **Adaptador de DataForSEO**: mismas rutas, cuerpos, credenciales, caché y mensajes de error. El SERP se declara histórico e incluye
  la fecha de la captura.
- **Adaptador de AnyAPI** (getanyapi.com) contra su OpenAPI y su catálogo, con las seis operaciones, validación defensiva y
  techo de precio por petición (`max_cost_usd`).
- **Registro y gestor**: cinco modos, selección por capacidad, prioridades, salud, y relectura del estado justo antes de cada llamada.
- **Administración** (`/studio/admin/seo`): proveedores, capacidades, credenciales cifradas, activación, prioridad, modo, parada total y
  prueba real con autorización y techo. Solo administradores de plataforma; todo queda auditado.
- **Consumidores migrados**: métricas, candidatos, fuentes SERP, vídeo, calendario y script de relleno.

## Decisiones y supuestos

- «AnyAPI» es getanyapi.com (AnyAPI Labs, Inc.); los demás productos con ese nombre no tienen operaciones SEO.
- `keyword_suggestions` usa `seo.keyword_ideas`, equivalente a la operación actual, y no `seo.keyword_suggestions`.
- La automatización de AnyAPI, el enrutado automático y el respaldo de pago están bloqueados en código (`SEO_LOCKS`) hasta SEO-V2-02.
- Sin filas de control, el comportamiento es el anterior: solo DataForSEO.
- La caché sigue siendo por tenant y por proveedor: ninguna licencia permite compartirla.
- No se ha hecho enrutado por coste entre métricas: no son intercambiables.

## Hallazgo económico

A precio de lista, AnyAPI es **entre un 20 % y un 32 % más cara** que DataForSEO en las cuatro operaciones de palabras clave.
Solo es más barata en YouTube, y ofrece resultados de Google en vivo desde 0,0005 USD. Detalle en [cost-model.md](../cost-model.md).

## Archivos y migraciones

- Nuevos: `contract.ts`, `anyapi.ts`, `registry.ts` (en `src/infrastructure/seo/`), `src/studio/seo-manager.ts`,
  `src/studio/routes-admin-seo.ts`, `seo-provider-settings.component.ts`, dos archivos de pruebas y `docs/seo-v2/`.
- Modificados: `dataforseo.ts`, `keyword-metrics.ts`, `keyword-candidates.ts`, `serp-sources.ts`, `youtube-videos.ts`,
  `editorial-plan.ts`, `plan-keywords.ts`, `routes-editorial.ts`, `routes.ts`, esquema Prisma, navegación, página y servicio de administración,
  página de calendario, `.env.example` y el script de relleno.
- Migración: `20261124120000_seo_provider_control` (dos tablas nuevas, aditiva).

## Pruebas

| Comprobación | Resultado |
|---|---|
| `migrate deploy` en base limpia y `migrate diff` | 40 migraciones; sin diferencias |
| Typecheck, build y build de Studio | Correctos |
| Pruebas dirigidas | 56 de 56 |
| Suite completa de backend | 620 de 621 |
| Interfaz (Playwright, base de pruebas) | Modos, parada total, selección manual y activación persisten; sin errores de consola |
| Spec Karma de navegación | No ejecutada |

El único fallo, «concurrent strategy saves both succeed with distinct versions», es una carrera en `site-intelligence/strategy.ts`, que
esta rama no toca. Ese archivo pasó 6 de 6 en tres repeticiones aisladas.

La revisión acotada no encontró ninguna vía hacia un proveedor desactivado, ninguna llamada al abrir páginas y ninguna fuga de secretos.
Corregido a partir de ella: un fallo al registrar el gasto descartaba datos ya pagados. Queda documentado para
SEO-V2-02: un timeout que el proveedor sí factura no se registra como gasto.

## Aceptación

| Criterio | Estado |
|---|---|
| DataForSEO se conserva | Cumplido (no verificado en vivo) |
| Adaptador de AnyAPI contra documentación verificada | Cumplido |
| Selección por capacidad | Cumplido |
| Sin dependencias de proveedor en los consumidores | Cumplido |
| Los datos existentes siguen siendo legibles | Cumplido |
| Controles mínimos de administración | Cumplido |
| Automatización de pago de AnyAPI desactivada | Cumplido |
| Pruebas existentes y nuevas | Cumplido, salvo la carrera preexistente |
| Validación real de AnyAPI | Cumplido: seis operaciones, es-ES |

## Peticiones y gasto

- Peticiones facturadas: **6**, todas a AnyAPI. Gasto: **0,15378 USD**, de 0,156 autorizados. Coincide en el saldo de AnyAPI y en el registro de Auctorio.
- Gratuitas a AnyAPI: 5 cotizaciones sin clave (401), 7 con clave, consultas de saldo y lecturas públicas de `openapi.json` y `/catalog`.
- A DataForSEO: ninguna llamada a su API; solo páginas públicas de precios.
- Hallazgo: en `google.search`, 6 de 10 enlaces venían ocultos tras redirecciones de Google y se descartan. No sustituye bien al SERP actual como fuente
  de citas. YouTube no está localizado.

## Seguridad y licencias

- Claves cifradas con AES-256-GCM, solo en servidor; el adaptador de AnyAPI rechaza redirecciones.
- AnyAPI permite el uso comercial y la reventa (§11), no dice nada del almacenamiento y no revela su origen de datos SEO.
- Los términos de DataForSEO sobre reventa y almacenamiento no se han podido establecer.
- Discrepancia: la documentación de AnyAPI dice que las cotizaciones no necesitan clave; el servidor exige una.

## Pendiente antes de activar AnyAPI

1. Confirmación escrita de AnyAPI sobre almacenamiento y licencia de origen.
2. Presupuestos duros (SEO-V2-02).
3. Comparar sus cifras con una fuente conocida; otros mercados distintos de es-ES están sin verificar.
4. Renovar la clave de prueba: se escribió en una conversación.
5. DataForSEO no se ha llamado en vivo por el camino nuevo.

## Unificación con el rediseño de Studio

A petición del responsable, `feat/studio-settings-advanced-integration` (16 commits: ajustes, avanzado, redes y plan mensual de
Autopilot) está fusionada en esta rama. Conflictos resueltos en seis archivos: navegación y su spec, página de administración, `editorial-plan.ts`,
`keyword-candidates.ts` y `routes-editorial.ts`. Además, `automation.ts`, `autopilot-plan.ts`, `plan-item-keyword.ts` y el plan del mes
pasan a usar el gestor SEO, y la página de proveedores queda en español dentro de «Administración global».

| Comprobación de la rama unificada | Resultado |
|---|---|
| 44 migraciones en base limpia y `migrate diff` | Sin diferencias |
| Typecheck, build y build de Studio | Correctos |
| Suite completa de backend | 674 de 676 |
| Specs de Studio (Karma) | 46 de 46 |
| 31 pantallas en navegador | Sin desbordes ni errores, salvo tres 400 en `/studio/competitors` con un tenant vacío |

Los dos fallos de la suite (`autopilot-planner` y `editorial-engine`) son choques de clave foránea entre archivos que comparten base
en paralelo; cada archivo pasó entero en tres repeticiones aisladas. Corregido al unificar: una llave CSS sin cerrar en Fuentes, que dejaba las tarjetas
sin estilo en escritorio (no comprobado con tarjetas reales), y pruebas desfasadas de onboarding y de escritura.
