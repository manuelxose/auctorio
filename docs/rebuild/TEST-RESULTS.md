# Resultados de pruebas

| Comando | Resultado comprobado |
| --- | --- |
| `npm run typecheck` | TypeScript backend aprobado. |
| `npm run build:studio` | Angular de producción aprobado. Hay avisos de compilador y presupuestos de tamaño. |
| `rtk bypass node --env-file=.env --require ts-node/register/transpile-only --test tests/studio-access-mutations.test.ts tests/studio-rbac-matrix.test.ts tests/studio-routes.test.ts tests/destination-readiness.test.ts tests/writing-settings.test.ts` | 41 aprobadas, 0 fallos. PostgreSQL local y registros de prueba. Una ruta de sugerencias registró un aviso de DataForSEO HTTP 402. |
| `rtk bypass node --require ts-node/register/transpile-only --test tests/studio-ssr.test.ts` | 9 aprobadas, 0 fallos. Incluye permisos vigentes, revocación e inventario sin sitios. |
| `npx ng test --watch=false --browsers=ChromeHeadless --include=src/app/layout/studio-nav.spec.ts --include=src/app/pages/settings-page.component.spec.ts` | 7 aprobadas, 0 fallos. Ejecutado en `apps/studio-web` con Chrome Headless. |
| `rtk bypass node --env-file=.env node_modules/@playwright/test/cli.js test --config e2e/playwright.config.ts e2e/specs/studio-integration-acceptance.spec.ts` | 8 aprobadas, 0 fallos. Chrome local, SSR en `127.0.0.1:4422`, API en `127.0.0.1:4311` y workspace temporal. |

La primera pasada de navegador con las credenciales de entorno devolvió HTTP 403. La prueba definitiva crea y elimina cuentas, sitios y membresías propios en PostgreSQL local. Las pruebas de API verificaron decisiones y límites editoriales, borrado de medios, contratos de destinos y cambios de acceso. Queda pendiente la regresión completa con trabajadores y servicios externos controlados.

## Fase C · Escritura

| Comando | Resultado comprobado |
| --- | --- |
| `npm run typecheck` y `npm run build:studio` | Aprobados. |
| `rtk bypass node --env-file=.env --require ts-node/register/transpile-only --test tests/production-pipeline.test.ts tests/planning-workspace.test.ts tests/writing-settings.test.ts tests/guide-template.test.ts tests/qa-v2.test.ts tests/brand-cards.test.ts tests/visuals.test.ts` | 60 aprobadas. PostgreSQL local, `DATAFORSEO_LOGIN` vacío y redactor controlado en la regresión de Escritura. |
| `npx ng test --watch=false --browsers=ChromeHeadless --include=src/app/pages/writing-settings-page.component.spec.ts` | 1 aprobada. Ejecutado en `apps/studio-web`. |
| `rtk bypass node --env-file=.env node_modules/@playwright/test/cli.js test --config e2e/playwright.config.ts --output test-results/studio-writing e2e/specs/studio-integration-acceptance.spec.ts` | 9 aprobadas. Chrome local, SSR en `127.0.0.1:4422` y API en `127.0.0.1:4311`. |

El caso de producción guardó ajustes por API, comprobó la convivencia con una escritura concurrente del calendario, generó nuevas versiones de prueba y verificó que el borrador anterior conservaba exactamente el mismo cuerpo. La prueba de navegador cambió de sitio desde la barra, recuperó el borrador sin guardar y confirmó que cada sitio conservaba su propia regla tras guardar y recargar.

## Fase C · Automatización

| Comando | Resultado comprobado |
| --- | --- |
| `npm run typecheck` y `npm run build:studio` | Aprobados. |
| `rtk bypass node --env-file=.env --require ts-node/register/transpile-only --test tests/automation-settings.test.ts tests/autopilot-mode.test.ts tests/autopilot-planner.test.ts tests/automation-recovery.test.ts tests/editorial.test.ts tests/studio-rbac-matrix.test.ts tests/production-pipeline.test.ts` | 67 aprobadas en PostgreSQL local. `DATAFORSEO_LOGIN` vacío. |
| `npx ng test --watch=false --browsers=ChromeHeadless --include=src/app/pages/automation-page.component.spec.ts` | 1 aprobada. Ejecutado en `apps/studio-web`. |
| `rtk bypass node --require ts-node/register/transpile-only --test tests/studio-ssr.test.ts` | 9 aprobadas. |
| `rtk bypass node --env-file=.env node_modules/@playwright/test/cli.js test --config e2e/playwright.config.ts --output test-results/studio-automation e2e/specs/studio-integration-acceptance.spec.ts` | 10 aprobadas con un workspace temporal, SSR en `127.0.0.1:4422` y API en `127.0.0.1:4311`. |

La API verificó inicialización concurrente, aislamiento entre sitios y tenants, Manual deshabilitado, pausa persistente, bloqueo y rearme del circuito. Los casos de franjas cubrieron un día de 23 horas y varias ventanas. El navegador comprobó que un modo sin guardar conserva el estado confirmado y que el cambio confirmado se refleja en Inicio y Calendario.

En la pasada final, backend tardó 22,3 s, Playwright 29,8 s con un trabajador y la compilación Angular 33,0 s. Dos agentes participaron en implementación y revisión.

## Fase C · Conexiones

| Comprobación | Resultado |
| --- | --- |
| `npm run typecheck` y `npm run build:studio` | Aprobados. |
| `rtk bypass node --env-file=.env --require ts-node/register/transpile-only --test tests/connector-routes.test.ts tests/connector-registry.test.ts tests/connection-discovery.test.ts tests/destination-readiness.test.ts tests/social-connections.test.ts tests/social-connections-routes.test.ts tests/worker-publishing.test.ts tests/studio-routes.test.ts` | 77 aprobadas en PostgreSQL local con `DATAFORSEO_LOGIN` vacío. |
| `npx ng test --watch=false --browsers=ChromeHeadless --include=src/app/pages/connections-page.component.spec.ts` | 2 aprobadas desde `apps/studio-web`. |
| `rtk bypass node --env-file=.env node_modules/@playwright/test/cli.js test --config e2e/playwright.config.ts --output test-results/studio-connections e2e/specs/studio-integration-acceptance.spec.ts` | 11 aprobadas con un workspace temporal, SSR en `127.0.0.1:4422` y API en `127.0.0.1:4311`. |

Se comprobó el aislamiento entre tenants, la respuesta sin secretos, la nueva verificación tras el cambio de credenciales, la actualización del adaptador y el bloqueo de entregas tras desconectar. Queda pendiente una prueba con credenciales reales para OAuth social y publicación externa.

## Rediseño de Configuración y Advanced

La compilación de Angular terminó con código 0 y avisos de presupuesto. El paquete inicial quedó en 528,34 kB frente al umbral de 500 kB. Las suites unitarias de navegación y Configuración pasaron 7 de 7 casos. Playwright pasó 12 de 12 escenarios en 32,6 s con Chrome, la API local y un workspace temporal.

La prueba nueva cubre los enlaces entre áreas, los selectores a 390 px y la selección de sección al volver atrás. Las capturas están enlazadas en [aceptación visual](UI-ACCEPTANCE.md).

## Paridad de navegación de Configuración y Advanced

- `npm run typecheck` y `npm run build:studio` aprobados. Angular registró un aviso por el paquete inicial de 529,82 kB frente al umbral de 500 kB.
- Angular, 11 pruebas aprobadas. Backend, 29 de revisión editorial y operaciones y 10 del planificador con Redis local aislado.
- Playwright, 13 escenarios de integración aprobados en 36,1 s. Una prueba adicional recorrió las 49 subvistas de workspace desde la barra lateral, comprobó sus URL y verificó el indicador de selección. Usó un workspace temporal y un trabajador.
- El primer intento del planificador encontró su trabajo temporal bloqueado por un worker de la cola local compartida. El helper de limpieza ahora consulta los identificadores del fixture y retira solo esos trabajos. Se verificó y limpió el fixture afectado. El efecto del primer intento sobre otros trabajos de la cola local quedó sin comprobar.

## Directorio y gestión de acceso

- TypeScript y compilación Angular aprobados. La compilación mantuvo el aviso de presupuesto inicial.
- Angular, 7 aprobadas. Backend, 9 aprobadas en las suites de mutaciones de acceso y RBAC, con PostgreSQL local.
- Playwright, 16 aprobadas en 46,9 s, con un trabajador y un workspace temporal. El nombre y los roles se conservaron al recargar, la suspensión revocó la sesión activa y una invitación de prueba conservó sus roles con SMTP desactivado. Los 49 enlaces de las subvistas siguieron funcionando.

## Revocación de invitaciones

Compilación Angular y comprobación de tipos aprobadas. Las suites de acceso y RBAC completaron 14 casos en PostgreSQL local. Los casos de invitación comprobaron aislamiento por workspace, permisos de gestión, enlaces heredados, reinvitación, aceptación concurrente con revocación y reenvío de un enlace caducado con transporte de correo simulado. Las pruebas de SSO usaron los atributos de una identidad simulada.

Pasaron 15 escenarios de Playwright en la pasada general. El escenario de navegación móvil pasó en la repetición focalizada tras corregir su selector. Playwright confirmó la cancelación, la revocación y su persistencia después de recargar. La comprobación de navegación móvil seleccionaba por error el enlace oculto del menú. Se ajustó para comprobar el contador de la vista principal y pasó en la repetición focalizada.

## Advanced · Site Intelligence y Competidores

La primera carga intermitente de Site Intelligence se reprodujo con cuatro lecturas simultáneas en PostgreSQL. La generación inicial de la estrategia ahora usa una inserción idempotente. Después del cambio pasaron las 10 pruebas de estrategia y aislamiento y los 5 escenarios focalizados de Playwright, incluido el recorrido de los 49 enlaces de Configuración y Advanced. TypeScript y compilación Angular aprobados. Se mantiene el aviso de presupuesto inicial.

## Advanced · Fuentes a Trabajos en segundo plano

- `npm run build:studio` compiló Angular y SSR. El paquete inicial supera el presupuesto de 500 kB.
- La suite local `studio-integration-acceptance.spec.ts` completó 19 pruebas con SMTP desactivado. Se recorrieron las 49 subvistas de Configuración y Advanced y se comprobó el historial de Auditoría con datos propios de la prueba.
- Las seis pantallas de Advanced se probaron a 1440 y 390 px. En Fuentes se verificaron el detalle, los filtros por estado y categoría y el desplazamiento horizontal de la tabla en móvil. El tablero se comprobó con una propuesta persistida.
