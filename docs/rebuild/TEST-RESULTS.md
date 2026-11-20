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
