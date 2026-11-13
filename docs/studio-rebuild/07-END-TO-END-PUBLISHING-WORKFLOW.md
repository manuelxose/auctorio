# Flujo comprobado y puntos de integración
1. Site / ConnectorInstallation (routes-connectors.ts, Site); verificación de autenticación/capacidades.
2. Onboarding/crawl (onboarding/orchestrator.ts, site-intelligence/{crawler,sitemap,profile}).
3. Sources, SourceItem y source evidence (routes-editorial.ts, routes-source-registry.ts).
4. Competitors/opportunities y estrategia aprobada/versionada (routes-site-intelligence.ts, competitors/routes.ts).
5. EditorialPlan + EditorialPlanItem (routes-editorial.ts:1455-1959), slot horario en timezone del sitio.
6. startProduction(kind=plan_item|cluster|manual), ProductionJob durable; stages prepare, duplicates, evidence, brief, write, seo, qa, gates, materialize (production/pipeline.ts y stages.ts). Estado final needs_review/ready y ContentProject/Version.
7. Content editor + QA; imagen/derivados sociales (worker-image, worker-social; reconocer excepción social legacy en ADR).
8. Publication canónica con scheduledFor, channel, status; /v2/publications/:id/{schedule,reschedule,publish-now,cancel,retry,unpublish}.
9. /v2/calendar proyecta plan_item hasta que existe Publication del canal y después la publicación (src/studio/calendar.ts:16-125), evita copiar el evento.
10. Jobs/release-readiness/publicadores (release-readiness.ts; publishers.ts; workers/worker-publishing.ts) y verificación de URL externa/estado.
11. Operaciones/monitoring (routes-operations, notifications, publication attempts). Publicación real prohibida sin permiso expreso.

## Puntos abiertos
- Diferencia entre fechas propuestas de plan y fechas confirmadas de Publication: un solo owner de schedule, calendario muestra ambas tipificadas.
- Pipeline social legacy distinto al escritor estructurado: no borrar hasta migrar/testear.
- Estado por capas: plan item vs production job vs project/version QA vs Publication/Attempt; nunca colapsar en un string genérico.
- Cancelación/retry idempotentes, SLA de progreso, error recuperable, verificación de remote externalId/URL.
