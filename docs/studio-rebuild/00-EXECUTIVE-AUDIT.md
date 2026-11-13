# Autorio Studio — auditoría ejecutiva basada en código
Fecha: 2026-11-13. Base: main, commit 173ecf037a358fc0360d718f1e8393d846ec3cd1.

## Veredicto: PARTIAL (no sustituye auditoría del Studio local)
Inspección verificada mediante GitHub: árbol del repositorio, rutas Angular, servicios Fastify, Prisma, historial relacionado y evidencia de aceptación local del 2026-11-12. SIN acceso a localhost:4420, base de datos activa, navegadores Playwright ni ejecución local. Las skills ui-ux-pro-max y unslop no se pudieron cargar desde este entorno; no hubo delegación real ni revisor independiente. Esto impide declarar UX/E2E/producción PASS.

## Arquitectura real
Angular 20 SSR + BFF Express (apps/studio-web/src/server.ts), Fastify/TypeScript (src/studio/routes*.ts), PostgreSQL/Prisma (prisma/schema.prisma), Redis/BullMQ y workers (src/infrastructure/workers, infra/systemd). Dominio editorial con Site, ContentProject, ContentVersion, EditorialPlan/Item, ProductionJob, Publication, ConnectorInstallation, PublishingAccount, AutomationPolicy, Operation. La interfaz tiene cuatro áreas horizontales y sidebar contextual (layout/studio-nav.ts y app-shell.component.ts), más copilot. No partir de cero.

## P0 confirmados en código/evidencia
1. Overview /v2/overview solo agrega prisma.publishingAccount, no prisma.connectorInstallation ni Site (src/studio/routes-editorial.ts:2155-2304). El instalador de websites activa ConnectorInstallation y Site (routes-connectors.ts:450-579), por lo que el dashboard puede omitir destinos reales. Además su regla visual interpreta status=active como Connected sin exigir prueba reciente (overview-page.component.ts:532-544). Causa exacta del estado de la cuenta del usuario NO verificada: requiere DB/session.
2. Tres modos EXISTEN: manual, assisted y autopilot (src/studio/automation-mode.ts; overview-page.component.ts; automation-page.component.ts). No reimplementarlos como modos nuevos. UI automation-page.setMode('assisted') asigna autoSchedule=true antes de guardar, mientras MODE_FLAGS.assisted.autoSchedule=false. Resolver divergencia del formulario vs backend y la accesibilidad de modo en Overview.
3. Prueba local GuíaTV documenta crawl sesgado: 4.192 URL descubiertas, 199 extraídas, 187 películas; temas TV/TDT/series infrarepresentados (docs/acceptance/guiatv-local-2026-11-12.md).
4. Recomendaciones: 21 fuentes en inglés para GuíaTV en España, y competidores irrelevantes; pack actual centrado en movie-tv-en (src/studio/source-packs/movie-tv-en.ts).
5. Generación 2/día y 3/día alcanzó estados partial y huecos después de fill; desfase entre pilares aprobados y clusters detectados (site-relevance.ts:303-311).
6. Producción tiene un pipeline unificado (docs/adr/unified-production-pipeline.md) pero la prueba local halló headings en inglés y falta de imagen en ContentProject sin topicId. No reabrir fixes de tokens/título ya aplicados.
7. Calendar y Editorial Plan contienen vistas de calendario distintas, aunque el backend calendar.ts ya proyecta plan_item y publication evitando copia. Consolidar semántica sin borrar vistas legítimas.

## Prioridad
P0: completar inspección real/DB; conexiones + readiness; modos y verificación. P1: calidad del crawl, fuentes, planning y writer. P1: calendario/estado publicación. P2: reubicación progresiva UI y admin/avanzado.

## Prohibiciones
No despliegue, publicación real, rotación de credenciales, eliminación de datos o merges. Secretos nunca en artefactos. Resultados de prueba solo si se ejecutaron. Ver roadmap, matriz de pruebas e INDEX.
