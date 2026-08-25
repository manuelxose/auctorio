# Graph Report - auctorio  (2026-08-25)

## Corpus Check
- 296 files · ~261,781 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 3647 nodes · 8178 edges · 173 communities (155 shown, 18 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 34 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `8b6cc985`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- studio.models.ts
- routes.ts
- app.routes.ts
- StudioApiService
- ContentWorkspacePageComponent
- "tenants"
- editorial-plan.ts
- automation.ts
- http-utils.ts
- routes-editorial.ts
- CalendarPageComponent
- worker-publishing.ts
- writeAudit
- src/server.ts
- AUCTORIO MASTER ROADMAP
- prompts.ts
- planner.ts
- 4. Componentes
- Auctorio — Milestones
- sha256
- ConnectionsPageComponent
- getNumberEnv
- AyrshareSocialProvider
- Auctorio Design System
- topic.ts
- ConnectionWizardPageComponent
- Auctorio Admin Redesign
- Auctorio Product Architecture
- AppConfirmDialogComponent
- StudioPublication
- repositories.ts
- social-publishers.ts
- structuredEvent
- marketing-content.ts
- Talkaris Admin Redesign
- scraping/index.ts
- getPrismaClient
- topic-controller.ts
- views.ts
- getMarketingPath
- SourcesPageComponent
- editorial-plan-v2.test.ts
- EditorialPlanPageComponent
- verification.ts
- profile.ts
- AppShellComponent
- compilerOptions
- getRedisConnectionOptions
- sources.ts
- .maybeDryRun
- editorial-plan-schema.ts
- Auctorio — SEO Architecture
- site-relevance.ts
- repository.ts
- 2. Mapa objetivo de rutas
- qa.ts
- Auctorio Web — Rework Audit & Delivery Report
- AuRichEditorComponent
- SettingsPageComponent
- InboxPageComponent
- editorial.ts
- crypto.ts
- publishers.ts
- ActivityPageComponent
- Arquitectura Tecnica del Backend de Generacion de Contenido con IA (SEO e Instagram)
- social-connections.ts
- devDependencies
- dependencies
- getEnv
- web-discovery.ts
- Talkaris Product Architecture
- image.ts
- registry.ts
- scripts
- cleanup-seeded-connections.ts
- notifications.ts
- source-quality.ts
- MarketingLocale
- AUCTORIO REBUILD STATUS
- deps.ts
- social.ts
- NotificationsPageComponent
- prisma.ts
- MediaPageComponent
- AutomationPageComponent
- dependencies
- structured.ts
- TecnoriaPublisher
- fetchWithTimeout
- options
- FirecrawlWebIntelligenceProvider
- SeoService
- Auctorio Studio — Design System (Phase 2)
- publishers.test.ts
- ThemeService
- use-case-detail-page.component.ts
- 1. Universal connection installer
- 3. Architecture decisions
- Auctorio — Universal Connection Installer, Job Center, Notifications and UX Polish
- LoginPageComponent
- Auctorio Studio — Frontend Rebuild Report
- Auctorio Multi-Tenant Client Integrations
- devDependencies
- Image Manifest
- seo.service.ts
- SiteIntelligencePageComponent
- home-page.component.ts
- Auctorio Studio — Frontend Rebuild Audit (Phase 0)
- verify-platform-credentials.ts
- PublishingPageComponent
- internal-linking.ts
- CLAUDE.md - Auctorio Agent Guide
- Studio Simplification — Architecture Report
- Studio Simplification — Deletion Report
- Talkaris Screen Map
- Content AI Platform — Auctorio
- AuctorioChatWidgetComponent
- OverviewPageComponent
- studio/auth.ts
- email.ts
- 20260826000000_connections_operations_notifications/migration.sql
- site-intelligence/index.ts
- development
- SseService
- Auctorio SEO Engine V2 — Architecture & Operator Notes (M16–M22)
- Auctorio Studio — Frontend Information Architecture (Phase 1)
- generate-marketing-images.mjs
- karma
- angular.json
- production
- studio-web/package.json
- scripts
- Studio Web
- provision-linked-tenants.ts
- shouldUseSecureCookie
- getInternalHeaders
- postInternalAuth
- Auctorio → GuiaTV Production Acceptance Evidence
- Auctorio Environment & Configuration Audit
- Progreso del proyecto
- studio-web
- resolveStudioSession
- getRequestOrigin
- readSession
- cloudflare-cutover.sh
- qa-visual-installer.mjs
- karma-coverage
- AppToastHostComponent
- studio-ssr.test.ts
- architect
- accept-invite-page.component.ts
- ContentNewPageComponent
- smoke-editorial.cjs
- AGENTS.md - Auctorio AI Agents
- getImageSitemapEntries
- connection-installer.spec.ts
- guiatv-seo-golden-path.spec.ts
- package.json
- forgot-password-page.component.ts
- fastify.d.ts
- social-provider.ts
- zone.js
- studio-workflow.spec.ts
- publication.ts

## God Nodes (most connected - your core abstractions)
1. `StudioApiService` - 156 edges
2. `getNumberEnv()` - 112 edges
3. `registerStudioRoutes()` - 109 edges
4. `getEnv()` - 95 edges
5. `getPrismaClient()` - 81 edges
6. `ContentWorkspacePageComponent` - 71 edges
7. `registerEditorialRoutes()` - 67 edges
8. `writeAudit()` - 66 edges
9. `"tenants"` - 52 edges
10. `structuredEvent()` - 50 edges

## Surprising Connections (you probably didn't know these)
- `buildServer()` --calls--> `registerStudioRoutes()`  [EXTRACTED]
  tests/social-connections-routes.test.ts → src/studio/routes.ts
- `buildStudioTestServer()` --calls--> `registerStudioRoutes()`  [EXTRACTED]
  tests/studio-routes.test.ts → src/studio/routes.ts
- `buildServer()` --calls--> `registerStudioRoutes()`  [EXTRACTED]
  tests/tenant-isolation.test.ts → src/studio/routes.ts
- `buildServer()` --calls--> `registerStudioRoutes()`  [EXTRACTED]
  tests/connector-routes.test.ts → src/studio/routes.ts
- `main()` --calls--> `getPrismaClient()`  [EXTRACTED]
  scripts/provision-linked-tenants.ts → src/infrastructure/db/prisma.ts

## Import Cycles
- None detected.

## Communities (173 total, 18 thin omitted)

### Community 0 - "studio.models.ts"
Cohesion: 0.03
Nodes (56): AutomationStatus, BlockedDomain, ConfigSchemaField, ConnectorAuthMethodView, ConnectorCapabilitiesResponse, ConnectorView, CreateProjectPayload, CreateSitePayload (+48 more)

### Community 1 - "routes.ts"
Cohesion: 0.06
Nodes (62): getContentTypeFromPath(), MIME_BY_EXTENSION, assignStudioRoleToUser(), createStudioRole(), ensureStudioRoles(), ensureTenantBootstrap(), ensureUniqueRoleKey(), getInternalStudioIdentityProviderBySlug() (+54 more)

### Community 2 - "app.routes.ts"
Cohesion: 0.08
Nodes (41): AppEmptyStateComponent, Component, AppIconComponent, IconElement, ICONS, StudioIconName, Component, studioAuthGuard() (+33 more)

### Community 3 - "StudioApiService"
Cohesion: 0.03
Nodes (9): AutomationPolicy, EditorialPlan, NotificationPreference, SocialConnectionSession, StudioSession, ResetPasswordPageComponent, Component, StudioApiService (+1 more)

### Community 4 - "ContentWorkspacePageComponent"
Cohesion: 0.05
Nodes (5): ProjectVersionDetail, StudioSocialContent, ContentWorkspacePageComponent, strOf(), Component

### Community 5 - ""tenants""
Cohesion: 0.09
Nodes (56): "ai_audit", "content_image", "content_text", "facts", "jobs", "tenants", "topics", "asset_variants" (+48 more)

### Community 6 - "editorial-plan.ts"
Cohesion: 0.12
Nodes (25): buildPromptV2(), bulkApproveEditorialPlanItems(), CHANNELS, renderPlanningContext(), deleteEditorialPlanItem(), enqueueEditorialPlanGeneration(), executeEditorialPlanGeneration(), generateEditorialPlan() (+17 more)

### Community 7 - "automation.ts"
Cohesion: 0.17
Nodes (20): assertSafeAutomationPolicy(), AUTOMATION_DEFAULTS, AutomationStatus, countChannelPublicationsToday(), EditorialSlot, generateEditorialSlots(), getAutomationStatus(), getChannelWindow() (+12 more)

### Community 8 - "http-utils.ts"
Cohesion: 0.10
Nodes (45): badRequest(), errorBody(), getInternalSharedSecret(), INTERNAL_SECRET_HEADER, isUuid(), notFound(), parseBody(), parseJsonObjectField() (+37 more)

### Community 9 - "routes-editorial.ts"
Cohesion: 0.08
Nodes (36): AuditActorType, AuditEntryInput, listAudit(), prisma, UpdatePolicyInput, CalendarFilters, listCalendarEvents(), prisma (+28 more)

### Community 10 - "CalendarPageComponent"
Cohesion: 0.07
Nodes (6): CalendarEvent, StudioProjectSummary, CalendarPageComponent, Component, ContentListPageComponent, Component

### Community 11 - "worker-publishing.ts"
Cohesion: 0.15
Nodes (16): defaultDependencies, LoadedPublication, prisma, processPublishingJob(), PublishingDependencies, PublishingJobData, readTargetStatus(), resolvePublicationStatus() (+8 more)

### Community 12 - "writeAudit"
Cohesion: 0.14
Nodes (33): sha256Hex(), writeAudit(), assertCanTransition(), cancelInstallation(), canTransition(), clearInstallationCredentials(), createInstallation(), deleteInstallationDraft() (+25 more)

### Community 13 - "src/server.ts"
Cohesion: 0.05
Nodes (27): STUDIO_BASE_PATH, angularApp, app, AuthStatePayload, backendBaseUrl, browserDistFolder, cookieKey, GlobalLoginResponse (+19 more)

### Community 14 - "AUCTORIO MASTER ROADMAP"
Cohesion: 0.05
Nodes (39): Acceptance criteria, Acceptance criteria, Acceptance criteria, Acceptance criteria, Acceptance criteria, Acceptance criteria, Acceptance criteria, Acceptance criteria (+31 more)

### Community 15 - "prompts.ts"
Cohesion: 0.08
Nodes (46): buildImagePrompt(), buildTextPrompt(), ImagePromptInput, TextPromptInput, TextPromptOutput, approveStudioPromptVersion(), assignmentKeyForSite(), assignStudioPromptVersion() (+38 more)

### Community 16 - "planner.ts"
Cohesion: 0.15
Nodes (20): runAutomationWorker(), findDuplicateCoverage(), AutomationTickResult, createAutoProject(), createFactsFromSourceItem(), createProjectFromSourceItem(), CreateProjectFromSourceItemInput, CreateProjectFromSourceItemResult (+12 more)

### Community 17 - "4. Componentes"
Cohesion: 0.05
Nodes (38): 1. Visual direction, 2. Tokens, 3. Layout primitives, 4. Componentes, 5. Interaction rules, 6. Semantica del sistema, 7. Component inventory real, 8. Proximos componentes recomendados (+30 more)

### Community 18 - "Auctorio — Milestones"
Cohesion: 0.05
Nodes (38): Auctorio — Milestones, Known non-blocking residuals, Known non-blocking residuals (unchanged), M0 — Repository Intelligence ✅, M10 — Golden Path ✅ (GuiaTV) / ✅ (Tecnoria — 2026-08-25), M11 — Cross-Tenant Regression 🟡, M12 — UX/UI Enterprise Rebuild ✅, M13 — Realtime, Reliability, Observability 🟡 (+30 more)

### Community 19 - "sha256"
Cohesion: 0.08
Nodes (23): sha256(), authPlugin(), buildServer(), startServer(), createFixture(), createTenant(), createTenant(), createTenant() (+15 more)

### Community 20 - "ConnectionsPageComponent"
Cohesion: 0.08
Nodes (7): ConnectorInstallation, ConnectorKind, PublishingAccount, SocialConnection, SocialSetupInfo, ConnectionsPageComponent, Component

### Community 21 - "getNumberEnv"
Cohesion: 0.29
Nodes (4): getNumberEnv(), GenericRestPublisher, GuiaTvPublisher, resolveAssetUrl()

### Community 22 - "AyrshareSocialProvider"
Cohesion: 0.17
Nodes (7): AyrshareSocialProvider, SocialPlatform, SocialProfile, SocialPublishInput, SocialPublishResult, validateInstagramPayload(), validateXPayload()

### Community 23 - "Auctorio Design System"
Cohesion: 0.06
Nodes (35): 10. Accesibilidad, 11. Inventario de componentes para implementacion, 12. Regla final, 1. Direccion visual, 2. Principios del sistema, 3.1 Foundation tokens, 3.2 Semantic tokens, 3.3 Typography (+27 more)

### Community 24 - "topic.ts"
Cohesion: 0.11
Nodes (30): GenerateImageFromTextInput, GenerateImageFromTextOutput, generateImageFromTextUseCase(), GetContentImageInput, GetContentImageOutput, getContentImageUseCase(), GetContentTextInput, GetContentTextOutput (+22 more)

### Community 26 - "Auctorio Admin Redesign"
Cohesion: 0.06
Nodes (34): 10. Reglas de UX de Auctorio, 11. Resultado esperado, 1. Objetivo, 2. Principios rectores, 3. Nueva arquitectura del panel, 4. Shell de producto, 5. Dashboard rediseñado, 6.1 Editorial Pipeline Visual (+26 more)

### Community 27 - "Auctorio Product Architecture"
Cohesion: 0.06
Nodes (34): 10. North star, 1. Resumen ejecutivo, 2. Fuentes auditadas, 3.1 Frontend actual, 3.2 API actual, 3.3 Runtime actual, 3. Arquitectura actual del sistema, 4.1 Entidades reales (+26 more)

### Community 28 - "AppConfirmDialogComponent"
Cohesion: 0.11
Nodes (11): App, appConfig, config, serverConfig, routes, serverRoutes, Component, AppConfirmDialogComponent (+3 more)

### Community 29 - "StudioPublication"
Cohesion: 0.11
Nodes (5): PublicationChannel, PublicationState, StudioPublication, PublicationsPageComponent, Component

### Community 30 - "repositories.ts"
Cohesion: 0.07
Nodes (26): AiAudit, ContentImage, ContentStatus, ContentText, ContentTextType, Fact, FactSourceType, Job (+18 more)

### Community 31 - "social-publishers.ts"
Cohesion: 0.16
Nodes (19): buildOAuthHeader(), dryRunResult(), igUrl(), InstagramCredentials, InstagramPublisherAdapterImpl, isDryRunEnabled(), percentEncode(), PublisherCapabilities (+11 more)

### Community 32 - "structuredEvent"
Cohesion: 0.11
Nodes (39): failOperationForJob(), JobDataWithOperation, markOperationStartedForJob(), ConnectionDependencies, ConnectionJobData, defaultDependencies, prisma, processConnectionJob() (+31 more)

### Community 33 - "marketing-content.ts"
Cohesion: 0.07
Nodes (32): WidgetWindow, CHAT_WIDGET_API_BASE_URL, CHAT_WIDGET_BASE_URL, CHAT_WIDGET_BRAND_LABEL, CHAT_WIDGET_ENTRY_CONTEXT, CHAT_WIDGET_SITE_KEYS, CONTACT_CONTENT, ContactContent (+24 more)

### Community 34 - "Talkaris Admin Redesign"
Cohesion: 0.06
Nodes (32): 10. Resultado de producto, 1. Objetivo del rediseño, 2. Principios de producto, 3. Nueva arquitectura del sidebar, 4. Pantallas rediseñadas, 5. Auth architecture implementada, 6. RBAC model, 7. Modelo mental (+24 more)

### Community 35 - "scraping/index.ts"
Cohesion: 0.07
Nodes (55): buildContentFromFields(), compactWhitespace(), enforceRateLimit(), ensureRobotsAllowed(), extractLink(), extractSelectors(), fetchUrl(), getRobotsRules() (+47 more)

### Community 36 - "getPrismaClient"
Cohesion: 0.10
Nodes (31): hashApiKey(), main(), main(), ROLE_KEYS, main(), hashApiKey(), main(), allowedStatuses (+23 more)

### Community 37 - "topic-controller.ts"
Cohesion: 0.17
Nodes (23): nowIso(), getIdempotencyKey(), mapErrorCodeToStatus(), sendContentAccepted(), sendJobAccepted(), sendTopicCreated(), sendUseCaseError(), generateImageFromText() (+15 more)

### Community 38 - "views.ts"
Cohesion: 0.12
Nodes (32): buildAssetPublicUrl(), listProjects(), buildReviewGate(), BuildReviewGateInput, countQaFailures(), countQaWarnings(), countWordsFromHtml(), ImageReadinessInput (+24 more)

### Community 39 - "getMarketingPath"
Cohesion: 0.17
Nodes (14): BRAND_NAME, getAlternatePagePaths(), getLocalizedPageSeo(), getMarketingPath(), ContactPageComponent, Component, ExamplesPageComponent, Component (+6 more)

### Community 40 - "SourcesPageComponent"
Cohesion: 0.14
Nodes (5): SourceRecommendation, SourceType, StudioSource, SourcesPageComponent, Component

### Community 41 - "editorial-plan-v2.test.ts"
Cohesion: 0.15
Nodes (12): buildEditorialPlanningContext(), EditorialPlanningContext, loadProfile(), PlanningEvidence, PlanningStrategy, prisma, EditorialPlanBriefV2, SiteIntelligenceProfileSummary (+4 more)

### Community 43 - "verification.ts"
Cohesion: 0.14
Nodes (25): detectCms(), DiscoveredAuthOption, discoverWebsite(), extractMetaContent(), isPrivateIpLiteral(), normalizeDestinationUrl(), PROBE_HEADERS, probeEndpoint() (+17 more)

### Community 44 - "profile.ts"
Cohesion: 0.13
Nodes (20): COMMON_TOPIC_TERMS, containsAny(), countKeywords(), ENGLISH_STOPWORDS, EntitySummary, GUIATV_COMMERCIAL_TERMS, GUIATV_EVERGREEN_TERMS, GUIATV_NEWS_TERMS (+12 more)

### Community 45 - "AppShellComponent"
Cohesion: 0.09
Nodes (5): AppPopoverComponent, Component, AppShellComponent, Component, StudioNotification

### Community 46 - "compilerOptions"
Cohesion: 0.07
Nodes (27): dist, DOM, ES2022, node, node_modules, scripts/**/*.ts, src/**/*.ts, tests/**/*.ts (+19 more)

### Community 47 - "getRedisConnectionOptions"
Cohesion: 0.20
Nodes (17): getRedisConnectionOptions(), RedisConnectionOptions, eventHeartbeatMs(), eventRateLimitPerMinute(), getPublisher(), parseEvent(), publishEvent(), readEventsSince() (+9 more)

### Community 48 - "sources.ts"
Cohesion: 0.11
Nodes (31): ApiSourceAdapter, asStringArray(), AtomSourceAdapter, compact(), CreateSourceInput, deriveExternalId(), extractLink(), extractMedia() (+23 more)

### Community 49 - ".maybeDryRun"
Cohesion: 0.21
Nodes (4): buildDryRunExternalId(), buildDryRunResult(), GenericWebhookPublisher, TalkarisPublisher

### Community 50 - "editorial-plan-schema.ts"
Cohesion: 0.07
Nodes (31): arr(), enums(), Infer, num(), obj(), optionalString(), optNul(), SchemaDef (+23 more)

### Community 51 - "Auctorio — SEO Architecture"
Cohesion: 0.07
Nodes (26): 1. URL Structure, 2. Meta Tags, 3. Structured Data (JSON-LD), 4. Content Architecture, 5. Technical SEO, 6. Open Graph & Social, 7. Recommendations, Auctorio — SEO Architecture (+18 more)

### Community 52 - "site-relevance.ts"
Cohesion: 0.22
Nodes (15): SearchIntent, CannibalizationVerdict, classifyCannibalization(), computeSiteRelevanceScore(), intentFitsProfile(), knownPlatformFromText(), normalize(), OFF_TOPIC_TERMS (+7 more)

### Community 53 - "repository.ts"
Cohesion: 0.06
Nodes (67): enqueueConnectionJob(), enqueueImageJob(), enqueuePublishingJob(), enqueueScrapingJob(), enqueueSocialJob(), enqueueTextJob(), getPublishingQueue(), getQueue() (+59 more)

### Community 54 - "2. Mapa objetivo de rutas"
Cohesion: 0.08
Nodes (25): 1. Superficies auditadas hoy, 2. Mapa objetivo de rutas, 3. Pantallas clave por fase, 4. Patrones de pantalla, 5. Notas de migracion, 6. Resultado del mapa, AI Generation, Analytics (+17 more)

### Community 55 - "qa.ts"
Cohesion: 0.13
Nodes (22): containsKeyword(), countExternalLinks(), countImages(), countInternalLinks(), GENERIC_AI_PHRASES, hasEmptyHeadings(), hasFaqSection(), hasHeadingOrderIssues() (+14 more)

### Community 56 - "Auctorio Web — Rework Audit & Delivery Report"
Cohesion: 0.08
Nodes (24): 1.1 Visual Design — Critical Issues, 1.2 UX/UI — Critical Issues, 1.3 Copywriting — Critical Issues, 1.4 SEO — Critical Issues, 1.5 Accessibility, 1.6 Performance, 1. Pre-Rework Audit, 2. Design System — New Visual Direction (+16 more)

### Community 57 - "AuRichEditorComponent"
Cohesion: 0.12
Nodes (8): ALLOWED_TAGS, AuRichEditorComponent, isPlatformBrowserSafe(), sanitizeHtml(), Component, Input, ViewChild, Output

### Community 58 - "SettingsPageComponent"
Cohesion: 0.10
Nodes (6): AiUsageRow, DiscoverySettingsResponse, StudioRoleSummary, StudioUserSummary, SettingsPageComponent, Component

### Community 59 - "InboxPageComponent"
Cohesion: 0.13
Nodes (5): SourceItemStatus, StudioSourceItem, StudioStoryCluster, InboxPageComponent, Component

### Community 60 - "editorial.ts"
Cohesion: 0.16
Nodes (17): normalizeText(), assignSourceItemToCluster(), buildSemanticHash(), clampScore(), CoverageCheckResult, listStoryClusters(), overlapRatio(), prisma (+9 more)

### Community 61 - "crypto.ts"
Cohesion: 0.19
Nodes (11): decryptSecret(), encryptionKey(), encryptSecret(), generateOAuthState(), generatePkceVerifier(), hmacHex(), tryDecryptSecret(), loadActiveInstallationForSite() (+3 more)

### Community 62 - "publishers.ts"
Cohesion: 0.11
Nodes (22): ALLOWED_ATTRIBUTES, ALLOWED_TAGS, asRecord(), buildGuiaTvPayload(), DryRunDecision, filterGuiaTvRelatedPlatformKeys(), filterGuiaTvRelatedRouteKeys(), GenericRestConfig (+14 more)

### Community 63 - "ActivityPageComponent"
Cohesion: 0.14
Nodes (4): OperationItem, OperationStatus, ActivityPageComponent, Component

### Community 64 - "Arquitectura Tecnica del Backend de Generacion de Contenido con IA (SEO e Instagram)"
Cohesion: 0.08
Nodes (23): 0.1 Estados y transiciones (publicaciones), 0.2 Workers y colas, 0.3 Idempotencia y reintentos, 0.4 Seguridad, 0.5 Automatizacion, 0. Dominio editorial (nuevo), 10. Seguridad y scraping, 11. Proveedores de IA (abstraccion) (+15 more)

### Community 65 - "social-connections.ts"
Cohesion: 0.12
Nodes (34): buildPublishInput(), LoadedPublication, loadPublication(), prisma, processPublish(), processUnpublish(), runSocialWorker(), SocialGenerateJobData (+26 more)

### Community 66 - "devDependencies"
Cohesion: 0.09
Nodes (23): @angular/build, @angular/cli, @angular/compiler-cli, devDependencies, @angular/build, @angular/cli, @angular/compiler-cli, jasmine-core (+15 more)

### Community 67 - "dependencies"
Cohesion: 0.09
Nodes (23): @angular/common, @angular/compiler, @angular/core, @angular/forms, @angular/platform-browser, @angular/platform-server, @angular/router, @angular/ssr (+15 more)

### Community 68 - "getEnv"
Cohesion: 0.22
Nodes (11): ApiEnvelope, assert(), call(), main(), PostShape, getBooleanEnv(), getEnv(), getJsonEnv() (+3 more)

### Community 69 - "web-discovery.ts"
Cohesion: 0.08
Nodes (33): DiscoveryTickResult, prisma, runDiscoveryTick(), runDiscoveryWorker(), scoreAndClusterItems(), scoreAndPromoteSourceItem(), loadBlockedDomainSet(), recommendSource() (+25 more)

### Community 70 - "Talkaris Product Architecture"
Cohesion: 0.09
Nodes (21): 1. Resumen ejecutivo, 2. Mapa real del repositorio, 3. Dominio actual, 4. Funcionalidades existentes y su representacion, 5. Auth architecture, 6. Resultado, Backend HTTP, Completamente representadas en UI (+13 more)

### Community 71 - "image.ts"
Cohesion: 0.14
Nodes (11): backoffDelay(), downloadBytesRobust(), ImageDownloadError, ImageDownloadErrorCode, ImageGenerationHandle, ImageGenerationInput, ImageGenerationResult, ImageProvider (+3 more)

### Community 72 - "registry.ts"
Cohesion: 0.12
Nodes (19): AuthMethodDescriptor, AuthMethodId, CapabilityId, ConfigSchemaField, connectorCapabilityView, ConnectorDescriptor, ConnectorKind, GENERIC_REST_DESCRIPTOR (+11 more)

### Community 73 - "scripts"
Cohesion: 0.10
Nodes (20): scripts, bootstrap:studio-access, build, build:studio, dev:studio, serve:studio, start:api, start:worker:automation (+12 more)

### Community 74 - "cleanup-seeded-connections.ts"
Cohesion: 0.36
Nodes (8): Args, cleanupAccount(), cleanupInstallationDrafts(), main(), parseArgs(), prisma, reportCandidates(), resolveTargets()

### Community 75 - "notifications.ts"
Cohesion: 0.22
Nodes (16): archiveNotification(), getNotificationPreferences(), listNotifications(), markAllNotificationsRead(), markNotificationRead(), NotificationCategory, NotificationInput, NotificationView (+8 more)

### Community 76 - "source-quality.ts"
Cohesion: 0.15
Nodes (15): applySourceFeedback(), AUTHORITY_TLDS, detectSpamSignals(), DomainEvaluationContext, evaluateDomainQuality(), isPrimaryCandidate(), PRIMARY_HINTS, prisma (+7 more)

### Community 77 - "MarketingLocale"
Cohesion: 0.16
Nodes (13): BRAND_SIGNATURE, BRAND_TAGLINE, getFooterResources(), getMarketingLocaleFromPath(), getMarketingNavigation(), getStudioLoginPath(), getUseCaseBySlug(), MarketingLocale (+5 more)

### Community 78 - "AUCTORIO REBUILD STATUS"
Cohesion: 0.11
Nodes (18): Architecture decisions, AUCTORIO REBUILD STATUS, Backend API, Completed in latest pass, Current objective, Current phase, Files touched, Functional status by module (+10 more)

### Community 79 - "deps.ts"
Cohesion: 0.16
Nodes (10): checkCostPolicy(), CostPolicyInput, CostPolicyResult, startOfDayUtc(), startOfMonthUtc(), toNumber(), CostPolicy, CostPolicyResult (+2 more)

### Community 80 - "social.ts"
Cohesion: 0.10
Nodes (26): buildPlanPrompt(), DiscoveryQueryPlan, EditorialDiscoveryContext, gatherEditorialContext(), parseDiscoveryPlan(), planDiscovery(), prisma, QUERY_CATEGORIES (+18 more)

### Community 82 - "prisma.ts"
Cohesion: 0.24
Nodes (10): RepositoryError, isUniqueViolation(), contentImageRepository, contentTextRepository, factRepository, jobRepository, tenantRepository, topicRepository (+2 more)

### Community 83 - "MediaPageComponent"
Cohesion: 0.18
Nodes (3): StudioMediaItem, MediaPageComponent, Component

### Community 85 - "dependencies"
Cohesion: 0.12
Nodes (17): cheerio, fast-xml-parser, fastify, google-auth-library, nodemailer, dependencies, bullmq, cheerio (+9 more)

### Community 86 - "structured.ts"
Cohesion: 0.13
Nodes (19): balanceJson(), extractJsonCandidate(), generateStructured(), parseJsonWithRepair(), repairJson(), stripFences(), StructuredGenerationAttempt, StructuredGenerationOptions (+11 more)

### Community 87 - "TecnoriaPublisher"
Cohesion: 0.29
Nodes (3): readCredentialRef(), readJsonCredentials(), TecnoriaPublisher

### Community 88 - "fetchWithTimeout"
Cohesion: 0.14
Nodes (14): pkceChallenge(), fetchJson(), fetchWithTimeout(), HttpRequestOptions, JsonRecord, normalizeBody(), sleep(), basicAuth() (+6 more)

### Community 89 - "options"
Cohesion: 0.15
Nodes (16): options, assets, browser, outputMode, polyfills, security, server, ssr (+8 more)

### Community 90 - "FirecrawlWebIntelligenceProvider"
Cohesion: 0.18
Nodes (3): FirecrawlWebIntelligenceProvider, normalizeSearchItem(), TavilyWebIntelligenceProvider

### Community 92 - "Auctorio Studio — Design System (Phase 2)"
Cohesion: 0.13
Nodes (14): 10. State language, 11. CSS architecture, 1. Direction, 2. Color tokens, 3. Theming mechanism, 4. Typography, 5. Spacing / density, 6. Radii, borders, shadows, focus (+6 more)

### Community 93 - "publishers.test.ts"
Cohesion: 0.20
Nodes (6): getPublisher(), ENV_KEYS, MockHandler, MockRequest, MockServer, originalEnv

### Community 95 - "use-case-detail-page.component.ts"
Cohesion: 0.43
Nodes (5): getAssetBySlug(), getUseCaseAlternatePaths(), getUseCaseSeo(), Component, UseCaseDetailPageComponent

### Community 96 - "1. Universal connection installer"
Cohesion: 0.14
Nodes (13): 1. Universal connection installer, 2. Activity Center (operations), 3. Realtime events (SSE), 4. Notification Center, 5. Provisioning and cleanup, Activation, Async execution, Connector registry (`src/studio/connectors/registry.ts`) (+5 more)

### Community 97 - "3. Architecture decisions"
Cohesion: 0.14
Nodes (13): 1. Verified current-state anchors (with corrections), 2. Hard-coded brand/bootstrap paths to remove, 3.1 Connector registry (M3), 3.2 Installation aggregate + state machine (M2/M4), 3.3 Operations (M5), 3.4 SSE (M6), 3.5 Notifications (M7), 3.6 UX polish (M8) (+5 more)

### Community 98 - "Auctorio — Universal Connection Installer, Job Center, Notifications and UX Polish"
Cohesion: 0.14
Nodes (13): Architecture requirements, Auctorio — Universal Connection Installer, Job Center, Notifications and UX Polish, Delivery milestones, Mandatory context discipline, Non-negotiable completion rules, Primary objective: universal “Magic Installer”, Remove hard-coded defaults safely, Required tests and proof (+5 more)

### Community 99 - "LoginPageComponent"
Cohesion: 0.26
Nodes (4): LoginPageComponent, resolveReturnTo(), Component, ViewChild

### Community 100 - "Auctorio Studio — Frontend Rebuild Report"
Cohesion: 0.15
Nodes (12): Accessibility, Architecture — what changed and why, Auctorio Studio — Frontend Rebuild Report, Before — major frontend problems, Mobile strategy, Performance, Remaining issues, Removed code (+4 more)

### Community 101 - "Auctorio Multi-Tenant Client Integrations"
Cohesion: 0.15
Nodes (12): Auctorio Multi-Tenant Client Integrations, Current operational caveat, Destination contracts, Guía Programación TV, Notes, Operational sequence, Provisioning, Publishing credentials (+4 more)

### Community 102 - "devDependencies"
Cohesion: 0.15
Nodes (13): devDependencies, @playwright/test, prisma, ts-node, @types/node, @types/nodemailer, typescript, @types/node (+5 more)

### Community 103 - "Image Manifest"
Cohesion: 0.17
Nodes (11): 1. publisher-command-center, 2. search-led-newsroom, 3. multi-site-publishing-grid, 4. editorial-qa-review, 5. brand-content-program, 6. content-operations-showcase, Auctorio — Image Generation Log, Existing Images (Pre-Rework) (+3 more)

### Community 104 - "seo.service.ts"
Cohesion: 0.21
Nodes (9): BRAND_DESCRIPTION, BRAND_DOMAIN_OBJECTIVE, MarketingShowcaseAsset, TECNORIA_LINKS, normalizeOrigin(), STUDIO_ORIGIN, MadeByTecnoriaPageComponent, Component (+1 more)

### Community 105 - "SiteIntelligencePageComponent"
Cohesion: 0.26
Nodes (3): SiteIntelligenceOverview, SiteIntelligencePageComponent, Component

### Community 106 - "home-page.component.ts"
Cohesion: 0.25
Nodes (6): getLocalizedFaqEntries(), getLocalizedUseCases(), getMarketingHomeContent(), getUseCasePath(), HomePageComponent, Component

### Community 107 - "Auctorio Studio — Frontend Rebuild Audit (Phase 0)"
Cohesion: 0.17
Nodes (11): 10. Known constraints, 1. Current product architecture, 2. Current information architecture, 3. Functionality inventory (preserved, real), 4. Styling architecture — current state, 5. Application shell — current state, 6. Cross-cutting UX debt (measured), 7. Performance baseline (+3 more)

### Community 108 - "verify-platform-credentials.ts"
Cohesion: 0.27
Nodes (11): Account, checkAuctorioLogin(), checkAuthEndpoint(), checkPublicSite(), CheckResult, Inventory, jsonRequest(), main() (+3 more)

### Community 109 - "PublishingPageComponent"
Cohesion: 0.38
Nodes (3): PublicationListItem, PublishingPageComponent, Component

### Community 110 - "internal-linking.ts"
Cohesion: 0.36
Nodes (7): anchorFromTitle(), InternalLinkSuggestion, prisma, slugTokens(), suggestInternalLinks(), tokenize(), prisma

### Community 111 - "CLAUDE.md - Auctorio Agent Guide"
Cohesion: 0.18
Nodes (10): [ARCHITECT], Behavioral Rules, Build & Test Commands, CLAUDE.md - Auctorio Agent Guide, [DEVELOPER], graphify, Project Context, Role-Specific Missions (+2 more)

### Community 112 - "Studio Simplification — Architecture Report"
Cohesion: 0.18
Nodes (10): 1. New authentication model, 2. Session cookie (BFF, `apps/studio-web/src/server.ts`), 3. Site scoping per request, 4. New Studio session view, 5. Navigation & routing, 6. Content workflow, 7. Backend additions, 8. Preserved production core (unchanged behavior) (+2 more)

### Community 113 - "Studio Simplification — Deletion Report"
Cohesion: 0.18
Nodes (10): Deleted components (5), Deleted pages (23), Deleted routes (28 old Studio routes removed; redirects installed), Deleted services / guards / utils, Login UI reduction, Merged pages, Metrics, Obsolete styles (+2 more)

### Community 114 - "Talkaris Screen Map"
Cohesion: 0.18
Nodes (10): Control, Dashboard, Estado de pantallas del cockpit editorial, Governance, Lectura del mapa, Mapa de navegación, Operations, Protección por permisos (+2 more)

### Community 115 - "Content AI Platform — Auctorio"
Cohesion: 0.18
Nodes (10): API expuesta, Arranque local, Conectar X / Instagram, Content AI Platform — Auctorio, Fiabilidad, Flujo editorial, Modo automatico, Modo de publicacion (dry-run) (+2 more)

### Community 116 - "AuctorioChatWidgetComponent"
Cohesion: 0.29
Nodes (4): AuctorioChatWidgetComponent, Component, Input, Inject

### Community 118 - "studio/auth.ts"
Cohesion: 0.05
Nodes (93): main(), WORKSPACE_BOOTSTRAP, main(), acceptStudioInvitation(), AccountWithMemberships, applyMappedRoles(), buildApiKeyStudioSession(), buildHumanSession() (+85 more)

### Community 119 - "email.ts"
Cohesion: 0.39
Nodes (7): getPublicBaseUrl(), sendStudioAccountActionEmail(), buildStudioLoginUrl(), EmailPayload, getTransporter(), isStudioEmailConfigured(), sendStudioEmail()

### Community 120 - "20260826000000_connections_operations_notifications/migration.sql"
Cohesion: 0.52
Nodes (6): "connector_installations", "notification_preferences", "notifications", "operations", "sites", "tenants"

### Community 121 - "site-intelligence/index.ts"
Cohesion: 0.32
Nodes (7): crawlPagesForSite(), upsertDiscoveredPages(), activeRuns, prisma, runRefresh(), SiteIntelligenceOverview, SiteIntelligenceRefreshResult

### Community 122 - "development"
Cohesion: 0.22
Nodes (9): build, builder, configurations, defaultConfiguration, development, buildTarget, extractLicenses, optimization (+1 more)

### Community 124 - "Auctorio SEO Engine V2 — Architecture & Operator Notes (M16–M22)"
Cohesion: 0.22
Nodes (8): AI structured-output architecture, Auctorio SEO Engine V2 — Architecture & Operator Notes (M16–M22), Editorial planning architecture, External provider requirements, Old pipeline vs new pipeline, Operator runbook, Publishing contract (GuiaTV), Site intelligence architecture

### Community 125 - "Auctorio Studio — Frontend Information Architecture (Phase 1)"
Cohesion: 0.22
Nodes (8): 1. Product loop the UI must reinforce, 2. Studio navigation hierarchy, 3. Route responsibilities, 4. Global actions, 5. Cross-screen workflows, 6. Settings hierarchy, 7. Layout rules, Auctorio Studio — Frontend Information Architecture (Phase 1)

### Community 126 - "generate-marketing-images.mjs"
Cohesion: 0.28
Nodes (8): __dirname, downloadAndConvert(), generateImage(), IMAGES, main(), MODEL, OUTPUT_DIR, ROOT

### Community 128 - "angular.json"
Cohesion: 0.25
Nodes (7): cli, analytics, packageManager, newProjectRoot, projects, $schema, version

### Community 129 - "production"
Cohesion: 0.25
Nodes (8): serve, production, budgets, buildTarget, outputHashing, builder, configurations, defaultConfiguration

### Community 130 - "studio-web/package.json"
Cohesion: 0.25
Nodes (7): name, prettier, overrides, printWidth, singleQuote, private, version

### Community 131 - "scripts"
Cohesion: 0.25
Nodes (8): scripts, build, dev:ssr, ng, serve:ssr, start, test, watch

### Community 132 - "Studio Web"
Cohesion: 0.25
Nodes (7): Comandos, Flujo soportado, Notas operativas, Que hace, Rutas principales, Studio Web, Variables necesarias

### Community 133 - "provision-linked-tenants.ts"
Cohesion: 0.39
Nodes (7): asJson(), FIXTURE_SITES, hashApiKey(), main(), parseArgs(), provision(), ProvisionArgs

### Community 134 - "shouldUseSecureCookie"
Cohesion: 0.33
Nodes (7): clearAuthStateCookie(), encryptAuthState(), encryptPayload(), encryptSession(), setAuthStateCookie(), setSessionCookie(), shouldUseSecureCookie()

### Community 135 - "getInternalHeaders"
Cohesion: 0.29
Nodes (7): createInternalLaunchTicket(), exchangeOidcSession(), fetchInternalIdentityProvider(), fetchInternalWorkspaceAccess(), getInternalHeaders(), redeemInternalLaunchTicket(), revokeSessionToken()

### Community 136 - "postInternalAuth"
Cohesion: 0.29
Nodes (7): postInternalAuth(), requestInternalGoogleLogin(), requestInternalInvitationAccept(), requestInternalLoginOptions(), requestInternalPasswordForgot(), requestInternalPasswordLogin(), requestInternalPasswordReset()

### Community 137 - "Auctorio → GuiaTV Production Acceptance Evidence"
Cohesion: 0.29
Nodes (6): Auctorio → GuiaTV Production Acceptance Evidence, Known residuals, Release identity, Reliability changes shipped in this pass, Test suite results, Workflow evidence (real services, real GuiaTV)

### Community 138 - "Auctorio Environment & Configuration Audit"
Cohesion: 0.29
Nodes (6): Auctorio Environment & Configuration Audit, Deployment reproducibility, Environment variable matrix, Fail-fast rules (implemented 2026-08-21), Migration verification (2026-08-21), Production runtime facts (verified)

### Community 139 - "Progreso del proyecto"
Cohesion: 0.29
Nodes (6): Estado actual, Implementado, Pendiente relevante, Progreso del proyecto, Pruebas automatizadas, Verificado

### Community 140 - "studio-web"
Cohesion: 0.33
Nodes (6): studio-web, prefix, projectType, root, schematics, sourceRoot

### Community 141 - "resolveStudioSession"
Cohesion: 0.33
Nodes (6): buildProxySignature(), clearSessionCookie(), proxyToBackend(), resolveStudioSession(), validateApiKey(), validateSessionToken()

### Community 142 - "getRequestOrigin"
Cohesion: 0.33
Nodes (6): buildRedirectUri(), getRequestOrigin(), readHeaderValue(), resolveRequestSiteId(), resolveTargetSite(), splitForwardedValue()

### Community 143 - "readSession"
Cohesion: 0.40
Nodes (6): decryptAuthState(), decryptPayload(), decryptSession(), parseCookies(), readAuthState(), readSession()

### Community 144 - "cloudflare-cutover.sh"
Cohesion: 0.73
Nodes (5): cf_api(), require_env(), set_zone_setting(), cloudflare-cutover.sh script, upsert_a_record()

### Community 145 - "qa-visual-installer.mjs"
Cohesion: 0.33
Nodes (5): overflowRows, PAGES, report, THEMES, WIDTHS

### Community 147 - "AppToastHostComponent"
Cohesion: 0.40
Nodes (3): AppToastHostComponent, Component, ToastItem

### Community 148 - "studio-ssr.test.ts"
Cohesion: 0.47
Nodes (4): getFreePort(), MockBackend, startStudioServer(), waitForServer()

### Community 149 - "architect"
Cohesion: 0.40
Nodes (5): extract-i18n, test, builder, architect, builder

### Community 152 - "smoke-editorial.cjs"
Cohesion: 0.60
Nodes (4): call(), crypto, main(), signedHeaders()

### Community 153 - "AGENTS.md - Auctorio AI Agents"
Cohesion: 0.50
Nodes (3): AGENTS.md - Auctorio AI Agents, Available Agent Roles, Optimization Policy

### Community 154 - "getImageSitemapEntries"
Cohesion: 0.40
Nodes (6): getImageSitemapEntries(), getPublicRouteEntries(), buildImageSitemapXml(), buildLocalizedSitemapXml(), buildSitemapIndexXml(), escapeXml()

### Community 157 - "package.json"
Cohesion: 0.50
Nodes (3): name, private, version

### Community 160 - "social-provider.ts"
Cohesion: 0.08
Nodes (17): IG_LIMIT, PLATFORM_MAP, X_LIMIT, CONNECTION_PROVIDERS, ConnectionProviderName, defaultConnectionProvider(), INSTAGRAM_CAPTION_LIMIT, INSTAGRAM_IMAGE_RATIOS (+9 more)

### Community 164 - "publication.ts"
Cohesion: 0.11
Nodes (25): runSchedulerTick(), runSchedulerWorker(), ALLOWED_TRANSITIONS, canTransition(), claimDuePublications(), classifyPublicationError(), createPublication(), CreatePublicationInput (+17 more)

## Knowledge Gaps
- **1070 isolated node(s):** `NavItem`, `SiteType`, `VersionStatus`, `PublicationStatus`, `JsonRecord` (+1065 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **18 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `getPrismaClient()` connect `getPrismaClient` to `routes.ts`, `provision-linked-tenants.ts`, `editorial-plan.ts`, `automation.ts`, `http-utils.ts`, `routes-editorial.ts`, `worker-publishing.ts`, `writeAudit`, `planner.ts`, `sha256`, `structuredEvent`, `scraping/index.ts`, `publication.ts`, `editorial-plan-v2.test.ts`, `profile.ts`, `getRedisConnectionOptions`, `sources.ts`, `repository.ts`, `editorial.ts`, `social-connections.ts`, `web-discovery.ts`, `cleanup-seeded-connections.ts`, `notifications.ts`, `source-quality.ts`, `deps.ts`, `social.ts`, `prisma.ts`, `internal-linking.ts`, `studio/auth.ts`, `site-intelligence/index.ts`?**
  _High betweenness centrality (0.024) - this node is a cross-community bridge._
- **Why does `StudioApiService` connect `StudioApiService` to `studio.models.ts`, `app.routes.ts`, `ContentWorkspacePageComponent`, `SourcesPageComponent`, `SiteIntelligencePageComponent`, `CalendarPageComponent`, `AppShellComponent`, `MediaPageComponent`, `ConnectionsPageComponent`, `accept-invite-page.component.ts`, `SettingsPageComponent`, `InboxPageComponent`, `StudioPublication`, `forgot-password-page.component.ts`, `ActivityPageComponent`?**
  _High betweenness centrality (0.021) - this node is a cross-community bridge._
- **Why does `ContentWorkspacePageComponent` connect `ContentWorkspacePageComponent` to `studio.models.ts`, `app.routes.ts`, `ConnectionsPageComponent`?**
  _High betweenness centrality (0.016) - this node is a cross-community bridge._
- **What connects `NavItem`, `SiteType`, `VersionStatus` to the rest of the system?**
  _1070 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `studio.models.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.034710269650028686 - nodes in this community are weakly interconnected._
- **Should `routes.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.05961538461538462 - nodes in this community are weakly interconnected._
- **Should `app.routes.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.07860011474469306 - nodes in this community are weakly interconnected._