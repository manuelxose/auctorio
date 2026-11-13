# Matriz de aceptación y no regresión
Estado actual de estas pruebas: NOT RUN durante esta auditoría; resultados del 12-11 citados son históricos.

| Riesgo | Evidencia de PASS requerida | Suite objetivo |
|---|---|---|
| Destino invisible | installation-only + site visible en Overview, sin token expuesto | API tests, Playwright Overview/Connections |
| Falso Connected | invalid auth/expired/unverified -> NOT READY; dry-run no engaña | mocks contract y estado visual |
| Tres modos | Manual/Assisted/Autopilot derivan flags exactos en API y UI | tests/autopilot-mode.test.ts, e2e autopilot |
| Tenant isolation | Ninguna instalación, artículo, política ni operación de otro tenant | tests/site-isolation.test.ts |
| Crawl biased | Se extraen páginas representativas de seis secciones prioritarias con presupuesto fijo | tests/site-intelligence.test.ts + fixture GuíaTV |
| SEO honesto | discovered != extracted != Google indexed; fuentes/fecha visibles | frontend unit y E2E |
| Sources relevantes | ES/TV prioridad, rechazo de dominio irrelevante y URL duplicada | tests/source-quality.test.ts, sources-competitors |
| Plan por día | 7x1=7, 7x2=14, 7x3=21 o parcial con razones accionables | tests/editorial-plan-v2.test.ts, plan-slots |
| Outline de artículo | encabezados en español y brief aprobado respetado o bloqueado | production-pipeline, writer tests |
| Imagen de plan item | no error version_or_topic_not_found; QA correcto | pipeline + worker image |
| Calendar | plan proposed vs Publication schedule, reschedule consistente, DST | tests calendar/E2E |
| Publicación idempotente | mismo externalId tras retries, no duplicate remote post | publisher fidelity/worker tests |
| UX | top-nav, sidebar, copilot en 1440/1024/390; teclado accesible | Playwright snapshots/a11y |
| Roles | viewer/editor/admin y privilegios de operaciones | API permission + browser |
| Producción | read-only rehearsal/dry-run; verificación remota sólo autorizada | E2E mock destination + release readiness |

Comandos verificados en package.json (no ejecutados aquí): npm run typecheck; npm test (aplica migraciones al DB configurado; prohibido apuntar a producción); npm run build:studio; npm run test:e2e. Usar DB temporal de prueba y secrets sintéticos. Verdictos separados IMPLEMENTATION/FUNCTIONALITY/UX/UI/ACCESSIBILITY/SECURITY/INTEGRATION/REGRESSION/PRODUCTION READINESS: PASS, PARTIAL, BLOCKED o FAIL.
