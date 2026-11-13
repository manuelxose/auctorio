# Arquitectura inspeccionada
Base Git: 173ecf037; consulta read-only GitHub 2026-11-13. Los datos de runtime no se inspeccionaron.

## Componentes
- apps/studio-web: Angular 20 SSR; app.routes.ts define /studio/{overview,site-intelligence,sources,editorial-plan,content,calendar,automation,connections,publications,publishing,operations,...}; BFF en src/server.ts. app-shell.component.ts y studio-nav.ts controlan navegación de áreas + sidebar. AppContextService/ActiveSiteStore concentran selección de sitio.
- src/studio/routes.ts registra módulos routes-editorial, routes-site-intelligence, routes-source-registry, routes-intelligence, routes-production, routes-connectors, routes-copilot y operaciones. Fastify recibe contexto autenticado, tenant y permisos.
- src/studio: editorial-plan, site-intelligence/{crawler,sitemap,profile,strategy}, source-registry-discovery, site-relevance, production/{pipeline,stages,plan-item}, editorial-engine/{writer-prompt,structure,publication-gates}, publication, publishers, calendar, automation-mode, release-readiness.
- prisma/schema.prisma: Site:566, ContentProject:628, ProductionJob:687, ContentVersion:727, PublicationJob:794, PublishingAccount:1716, Publication:1751, AutomationPolicy:1856, EditorialPlan:1956, EditorialPlanItem:1996, SiteIndexedPage:2146, SiteTopicCluster:2189, ConnectorInstallation:2763, Operation:2795.
- src/infrastructure: text/image/scraping/publishing workers, queue/Redis, Prisma. scripts/start-worker-*.ts; e2e Playwright.

## Contratos y límites
GET /v2/overview -> aggregates por tenant; GET /v2/sites -> sitios del tenant; /v2/connector-installations -> instalaciones; /v2/publishing-accounts -> cuentas; /v2/automation -> políticas; /v2/editorial-plans -> planes; /v2/production/jobs -> ejecución de contenido; /v2/publications y /v2/calendar -> salida programada/publicada.
Autenticación BFF: revisar apps/studio-web/src/server.ts, src/studio/security.ts y auth.ts antes de cambiar tenant/site ownership. No transportar tokens de integración al cliente.
La distinción Site (identidad/URL), ConnectorInstallation (onboarding/credencial/capacidad), PublishingAccount (canales) debe definirse en un único read model de destino.

## Pipeline
docs/adr/unified-production-pipeline.md (accepted 2026-11-12): startProduction(kind=plan_item|cluster|manual), ProductionJob idempotente, stages prepare > duplicates > evidence > brief > write > seo > qa > gates > materialize, posterior image worker, luego Publication + scheduler/publisher. Limitación documentada: contenido social aún usa el worker legacy.
