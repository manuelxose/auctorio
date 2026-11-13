# Arquitectura técnica objetivo — cambios incrementales
1. DestinationReadModel único, backend: proyecta Site+ConnectorInstallation+PublishingAccount+probe/readiness con tenant/site scope. Implementar en rutas de Connections y Overview sin romper contratos, agregar datos faltantes de forma versionada.
2. AutomationPolicy único: src/studio/automation-mode.ts autoridad de mode flags; frontend recibe modo+capabilidades/blocked reason y nunca persiste estado parcial inconsistente. Release readiness verifica QA, destino, workers, horarios, idempotencia y dry-run.
3. Sitio y contexto únicos: AppContextService y frontend interceptors; invalidar cachés/status al cambiar de site; no mezclar datos de tenants.
4. SiteProfile y estrategia: capas detected/suggested/approved y versiones; crawl estratificado + taxonomy/pillars canonical. Mantener historial e impedir sustitución silenciosa.
5. Fuente/Opportunity/PlanItem: referencia explícita al source evidence y procedencia; un solo gestor de fuentes. Modelos Prisma actuales preferidos a reescritura de schema.
6. ProductionJob -> ContentProject/Version -> Publication: estado tipado, idempotencia, audit trail, retries y revisión. Conservar pipeline unificado del ADR y adaptar writer de forma localizada; social legacy con migration plan.
7. Calendar como proyección derivada; plan proposed != publication scheduled. Materialización y edición atómicas, zona horaria correcta con DST.
8. UI por features: dividir componentes monolíticos Sources/Calendar por módulos; componentes de estado, filtros, drawer y tablas compartidos. No modificar estilos globales sin visual regression.
9. Observabilidad con Operation/PublicationAttempt y logs estructurados, sin datos sensibles.
10. Seguridad: tenant isolation, RBAC, SSRF-safe crawl y verification, anti-prompt injection, encryption at rest, idempotent reconcilers.
11. Migración incremental: adapter de lectura -> API contract -> UI -> E2E -> retirada controlada de duplicados. No cambios destructivos.
