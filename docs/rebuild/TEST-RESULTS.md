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
