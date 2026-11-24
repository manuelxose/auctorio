# SEO-V2-01 — Base SEO independiente del proveedor e integración de AnyAPI

Fecha: 2026-11-24. Rama: `feat/seo-v2-01-provider-foundation`, creada desde `origin/main` (`84bed81`).

## Veredicto: PARTIAL

Todos los criterios de implementación se cumplen. Falta lo que exige una integración externa real: no hay clave de AnyAPI ni
presupuesto autorizado, y AnyAPI no ha sido llamada con éxito ni una vez. Tampoco está aclarada su licencia de
almacenamiento ni la de su proveedor de origen.

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
| Validación real | **Pendiente** |

## Peticiones y gasto

- Peticiones facturables: **0**. Gasto: **0,00 USD**.
- A la API de AnyAPI: 5 cotizaciones sin clave (401, sin coste) y lecturas públicas de `openapi.json` y `/catalog`. Además, páginas públicas
  de documentación y precios de AnyAPI y DataForSEO.

## Seguridad y licencias

- Claves cifradas con AES-256-GCM, solo en servidor; el adaptador de AnyAPI rechaza redirecciones.
- AnyAPI permite el uso comercial y la reventa (§11), no dice nada del almacenamiento y no revela su origen de datos SEO.
- Los términos de DataForSEO sobre reventa y almacenamiento no se han podido establecer.
- Discrepancia: la documentación de AnyAPI dice que las cotizaciones no necesitan clave; el servidor exige una.

## Bloqueos restantes

1. Clave de AnyAPI y presupuesto autorizado (una pasada completa de las seis capacidades cuesta como máximo unos 0,16 USD).
2. Confirmación escrita de AnyAPI sobre almacenamiento y licencia de origen.
3. Mercado es-ES de AnyAPI sin verificar.

## Unificación con el rediseño de Studio

A petición del responsable, `feat/studio-settings-advanced-integration` (16 commits: ajustes, avanzado, redes y plan mensual de
Autopilot) está fusionada en esta rama. Conflictos resueltos en seis archivos: navegación y su spec, página de administración, `editorial-plan.ts`,
`keyword-candidates.ts` y `routes-editorial.ts`. Además, `automation.ts`, `autopilot-plan.ts`, `plan-item-keyword.ts` y el plan del mes
pasan a usar el gestor SEO, y la página de proveedores queda en español dentro de «Administración global».
