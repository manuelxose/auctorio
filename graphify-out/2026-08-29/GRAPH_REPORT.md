# Graph Report - auctorio  (2026-08-27)

## Corpus Check
- 301 files · ~265,503 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 3682 nodes · 8323 edges · 180 communities (156 shown, 24 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 35 edges (avg confidence: 0.84)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `f2e1280f`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- studio/auth.ts
- publishers.ts
- routes-editorial.ts
- app.routes.ts
- studio.models.ts
- StudioApiService
- routes.ts
- "tenants"
- social-connections.ts
- AppShellComponent
- routes-discovery.ts
- sources.ts
- EditorialPlanPageComponent
- repository.ts
- src/server.ts
- AUCTORIO MASTER ROADMAP
- 4. Componentes
- Auctorio — Milestones
- repositories.ts
- social-provider.ts
- ConnectionsPageComponent
- Auctorio Design System
- prompts.ts
- ConnectionWizardPageComponent
- Auctorio Admin Redesign
- Auctorio Product Architecture
- sha256
- StudioPublication
- fetchWithTimeout
- marketing-content.ts
- Talkaris Admin Redesign
- topic.ts
- routes-connectors.ts
- topic-controller.ts
- structured.ts
- crawler.ts
- getMarketingPath
- ContentWorkspacePageComponent
- worker-image.ts
- web-discovery.ts
- SourcesPageComponent
- getEnv
- getNumberEnv
- verification.ts
- site-relevance.ts
- orchestration.ts
- AppConfirmDialogComponent
- CalendarPageComponent
- compilerOptions
- editorial-plan-schema.ts
- views.ts
- Auctorio — SEO Architecture
- scraping/index.ts
- social-publishers.ts
- 2. Mapa objetivo de rutas
- Auctorio Web — Rework Audit & Delivery Report
- AuRichEditorComponent
- InboxPageComponent
- ActivityPageComponent
- Arquitectura Tecnica del Backend de Generacion de Contenido con IA (SEO e Instagram)
- qa.ts
- devDependencies
- dependencies
- SettingsPageComponent
- Talkaris Product Architecture
- worker-social.ts
- prisma.ts
- profile.ts
- ContentListPageComponent
- planner.ts
- registry.ts
- scripts
- getPrismaClient
- automation.ts
- MarketingLocale
- AUCTORIO REBUILD STATUS
- image.ts
- source-quality.ts
- MediaPageComponent
- AutomationPageComponent
- dependencies
- editorial.ts
- events.ts
- social.ts
- options
- site-intelligence/index.ts
- SeoService
- Auctorio Studio — Design System (Phase 2)
- worker-publishing.ts
- home-page.component.ts
- 1. Universal connection installer
- 3. Architecture decisions
- Auctorio — Universal Connection Installer, Job Center, Notifications and UX Polish
- LoginPageComponent
- Auctorio Studio — Frontend Rebuild Report
- Auctorio Multi-Tenant Client Integrations
- devDependencies
- worker-discovery.ts
- producer.ts
- AyrshareSocialProvider
- Image Manifest
- seo.service.ts
- SiteIntelligencePageComponent
- SseService
- Auctorio Studio — Frontend Rebuild Audit (Phase 0)
- verify-platform-credentials.ts
- CLAUDE.md - Auctorio Agent Guide
- Studio Simplification — Architecture Report
- Studio Simplification — Deletion Report
- Talkaris Screen Map
- Content AI Platform — Auctorio
- AuctorioChatWidgetComponent
- .startPolling
- OverviewPageComponent
- deps.ts
- ai/text.ts
- discovery-planner.ts
- SocialIntegrationProvider
- development
- PublishingPageComponent
- StudioSocialContent
- ThemeService
- Auctorio SEO Engine V2 — Architecture & Operator Notes (M16–M22)
- Auctorio Studio — Frontend Information Architecture (Phase 1)
- cleanup-seeded-connections.ts
- generate-marketing-images.mjs
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
- cost-policy.ts
- studio-web
- AppToastHostComponent
- resolveStudioSession
- getRequestOrigin
- readSession
- cloudflare-cutover.sh
- qa-visual-installer.mjs
- ContentImage
- editorial.test.ts
- studio-ssr.test.ts
- architect
- accept-invite-page.component.ts
- ContentNewPageComponent
- smoke-editorial.cjs
- projects.ts
- AGENTS.md - Auctorio AI Agents
- escapeXml
- connection-installer.spec.ts
- guiatv-seo-golden-path.spec.ts
- package.json
- browser.ts
- ProjectVersionDetail
- fastify.d.ts
- zone.js
- karma
- karma-coverage
- studio-workflow.spec.ts
- ImageDownloadError

## God Nodes (most connected - your core abstractions)
1. `StudioApiService` - 157 edges
2. `getNumberEnv()` - 113 edges
3. `registerStudioRoutes()` - 109 edges
4. `getEnv()` - 97 edges
5. `getPrismaClient()` - 82 edges
6. `ContentWorkspacePageComponent` - 71 edges
7. `writeAudit()` - 67 edges
8. `registerEditorialRoutes()` - 67 edges
9. `"tenants"` - 56 edges
10. `structuredEvent()` - 50 edges

## Surprising Connections (you probably didn't know these)
- `buildStudioTestServer()` --calls--> `registerStudioRoutes()`  [EXTRACTED]
  tests/studio-routes.test.ts → src/studio/routes.ts
- `createTenant()` --calls--> `sha256()`  [EXTRACTED]
  tests/notifications.test.ts → src/shared/utils/hash.ts
- `buildServer()` --calls--> `registerStudioRoutes()`  [EXTRACTED]
  tests/social-connections-routes.test.ts → src/studio/routes.ts
- `buildServer()` --calls--> `registerStudioRoutes()`  [EXTRACTED]
  tests/tenant-isolation.test.ts → src/studio/routes.ts
- `cleanupAccount()` --calls--> `writeAudit()`  [EXTRACTED]
  scripts/cleanup-seeded-connections.ts → src/studio/audit.ts

## Import Cycles
- None detected.

## Communities (180 total, 24 thin omitted)

### Community 0 - "studio/auth.ts"
Cohesion: 0.05
Nodes (103): main(), WORKSPACE_BOOTSTRAP, main(), acceptStudioInvitation(), AccountWithMemberships, applyMappedRoles(), assignStudioRoleToUser(), buildApiKeyStudioSession() (+95 more)

### Community 1 - "publishers.ts"
Cohesion: 0.06
Nodes (40): ALLOWED_ATTRIBUTES, ALLOWED_TAGS, sanitizeEditorialHtml(), asRecord(), buildDryRunExternalId(), buildDryRunResult(), buildGuiaTvPayload(), DryRunDecision (+32 more)

### Community 2 - "routes-editorial.ts"
Cohesion: 0.05
Nodes (90): AuditActorType, AuditEntryInput, listAudit(), prisma, writeAudit(), pauseAutomation(), resumeAutomation(), updatePolicy() (+82 more)

### Community 3 - "app.routes.ts"
Cohesion: 0.08
Nodes (40): AppEmptyStateComponent, Component, AppIconComponent, IconElement, ICONS, StudioIconName, Component, studioAuthGuard() (+32 more)

### Community 4 - "studio.models.ts"
Cohesion: 0.03
Nodes (56): AutomationStatus, BlockedDomain, CalendarEvent, ConfigSchemaField, ConnectorAuthMethodView, ConnectorCapabilitiesResponse, ConnectorView, CreateProjectPayload (+48 more)

### Community 5 - "StudioApiService"
Cohesion: 0.03
Nodes (11): AutomationPolicy, EditorialPlan, NotificationPreference, SocialConnectionSession, StudioSession, ForgotPasswordPageComponent, Component, ResetPasswordPageComponent (+3 more)

### Community 6 - "routes.ts"
Cohesion: 0.05
Nodes (77): getContentTypeFromPath(), MIME_BY_EXTENSION, conflict(), errorBody(), getInternalSharedSecret(), INTERNAL_SECRET_HEADER, parseJsonObjectField(), parsePermissionList() (+69 more)

### Community 7 - ""tenants""
Cohesion: 0.08
Nodes (60): "ai_audit", "content_image", "content_text", "facts", "jobs", "tenants", "topics", "asset_variants" (+52 more)

### Community 8 - "social-connections.ts"
Cohesion: 0.08
Nodes (57): markOperationStartedForJob(), ConnectionDependencies, ConnectionJobData, defaultDependencies, prisma, processConnectionJob(), runConnectionWorker(), runDiscovery() (+49 more)

### Community 9 - "AppShellComponent"
Cohesion: 0.06
Nodes (7): AppPopoverComponent, Component, AppShellComponent, Component, StudioNotification, NotificationsPageComponent, Component

### Community 10 - "routes-discovery.ts"
Cohesion: 0.10
Nodes (44): badRequest(), isUuid(), notFound(), parseBody(), parsePage(), parsePageSize(), requireStudioContext(), requireStudioPermission() (+36 more)

### Community 11 - "sources.ts"
Cohesion: 0.11
Nodes (38): fetchHtmlWithBrowser(), fetchUrl(), validateScrapeUrl(), ApiSourceAdapter, asStringArray(), AtomSourceAdapter, compact(), CreateSourceInput (+30 more)

### Community 13 - "repository.ts"
Cohesion: 0.07
Nodes (37): createVersion(), mapPublicationJob(), prisma, readPublicationTargetStatus(), stripHtmlText(), updateVersionContent(), AssetVariantInput, CreateProjectInput (+29 more)

### Community 14 - "src/server.ts"
Cohesion: 0.05
Nodes (27): STUDIO_BASE_PATH, angularApp, app, AuthStatePayload, backendBaseUrl, browserDistFolder, cookieKey, GlobalLoginResponse (+19 more)

### Community 15 - "AUCTORIO MASTER ROADMAP"
Cohesion: 0.05
Nodes (39): Acceptance criteria, Acceptance criteria, Acceptance criteria, Acceptance criteria, Acceptance criteria, Acceptance criteria, Acceptance criteria, Acceptance criteria (+31 more)

### Community 16 - "4. Componentes"
Cohesion: 0.05
Nodes (38): 1. Visual direction, 2. Tokens, 3. Layout primitives, 4. Componentes, 5. Interaction rules, 6. Semantica del sistema, 7. Component inventory real, 8. Proximos componentes recomendados (+30 more)

### Community 17 - "Auctorio — Milestones"
Cohesion: 0.05
Nodes (38): Auctorio — Milestones, Known non-blocking residuals, Known non-blocking residuals (unchanged), M0 — Repository Intelligence ✅, M10 — Golden Path ✅ (GuiaTV) / ✅ (Tecnoria — 2026-08-25), M11 — Cross-Tenant Regression 🟡, M12 — UX/UI Enterprise Rebuild ✅, M13 — Realtime, Reliability, Observability 🟡 (+30 more)

### Community 18 - "repositories.ts"
Cohesion: 0.08
Nodes (24): AiAudit, ContentStatus, ContentText, ContentTextType, Fact, FactSourceType, Job, JobStatus (+16 more)

### Community 19 - "social-provider.ts"
Cohesion: 0.09
Nodes (26): decryptSecret(), encryptionKey(), encryptSecret(), generateOAuthState(), generatePkceVerifier(), pkceChallenge(), tryDecryptSecret(), loadActiveInstallationForSite() (+18 more)

### Community 20 - "ConnectionsPageComponent"
Cohesion: 0.08
Nodes (7): ConnectorInstallation, ConnectorKind, PublishingAccount, SocialConnection, SocialSetupInfo, ConnectionsPageComponent, Component

### Community 21 - "Auctorio Design System"
Cohesion: 0.06
Nodes (35): 10. Accesibilidad, 11. Inventario de componentes para implementacion, 12. Regla final, 1. Direccion visual, 2. Principios del sistema, 3.1 Foundation tokens, 3.2 Semantic tokens, 3.3 Typography (+27 more)

### Community 22 - "prompts.ts"
Cohesion: 0.10
Nodes (32): buildImagePrompt(), buildTextPrompt(), ImagePromptInput, TextPromptInput, TextPromptOutput, buildImageContext(), buildPromptPreview(), buildTextContext() (+24 more)

### Community 24 - "Auctorio Admin Redesign"
Cohesion: 0.06
Nodes (34): 10. Reglas de UX de Auctorio, 11. Resultado esperado, 1. Objetivo, 2. Principios rectores, 3. Nueva arquitectura del panel, 4. Shell de producto, 5. Dashboard rediseñado, 6.1 Editorial Pipeline Visual (+26 more)

### Community 25 - "Auctorio Product Architecture"
Cohesion: 0.06
Nodes (34): 10. North star, 1. Resumen ejecutivo, 2. Fuentes auditadas, 3.1 Frontend actual, 3.2 API actual, 3.3 Runtime actual, 3. Arquitectura actual del sistema, 4.1 Entidades reales (+26 more)

### Community 26 - "sha256"
Cohesion: 0.08
Nodes (23): sha256(), authPlugin(), buildServer(), startServer(), createFixture(), createTenant(), prisma, createTenant() (+15 more)

### Community 27 - "StudioPublication"
Cohesion: 0.11
Nodes (5): PublicationChannel, PublicationState, StudioPublication, PublicationsPageComponent, Component

### Community 28 - "fetchWithTimeout"
Cohesion: 0.14
Nodes (15): fetchJson(), fetchWithTimeout(), HttpRequestOptions, JsonRecord, normalizeBody(), sleep(), basicAuth(), DirectSocialProvider (+7 more)

### Community 29 - "marketing-content.ts"
Cohesion: 0.08
Nodes (31): WidgetWindow, CHAT_WIDGET_API_BASE_URL, CHAT_WIDGET_BASE_URL, CHAT_WIDGET_BRAND_LABEL, CHAT_WIDGET_ENTRY_CONTEXT, CHAT_WIDGET_SITE_KEYS, CONTACT_CONTENT, ContactContent (+23 more)

### Community 30 - "Talkaris Admin Redesign"
Cohesion: 0.06
Nodes (32): 10. Resultado de producto, 1. Objetivo del rediseño, 2. Principios de producto, 3. Nueva arquitectura del sidebar, 4. Pantallas rediseñadas, 5. Auth architecture implementada, 6. RBAC model, 7. Modelo mental (+24 more)

### Community 31 - "topic.ts"
Cohesion: 0.11
Nodes (30): GenerateImageFromTextInput, GenerateImageFromTextOutput, generateImageFromTextUseCase(), GetContentImageInput, GetContentImageOutput, getContentImageUseCase(), GetContentTextInput, GetContentTextOutput (+22 more)

### Community 32 - "routes-connectors.ts"
Cohesion: 0.15
Nodes (28): assertCanTransition(), cancelInstallation(), canTransition(), clearInstallationCredentials(), createInstallation(), deleteInstallationDraft(), getInstallation(), INSTALLATION_STATES (+20 more)

### Community 33 - "topic-controller.ts"
Cohesion: 0.17
Nodes (23): nowIso(), getIdempotencyKey(), mapErrorCodeToStatus(), sendContentAccepted(), sendJobAccepted(), sendTopicCreated(), sendUseCaseError(), generateImageFromText() (+15 more)

### Community 34 - "structured.ts"
Cohesion: 0.11
Nodes (23): balanceJson(), extractJsonCandidate(), generateStructured(), parseJsonWithRepair(), repairJson(), stripFences(), StructuredGenerationAttempt, StructuredGenerationOptions (+15 more)

### Community 35 - "crawler.ts"
Cohesion: 0.12
Nodes (27): BOILERPLATE_SELECTORS, compact(), CrawlBatchResult, ExtractedPage, extractPage(), extractPageFromHtml(), firstText(), inferContentTypeFromUrl() (+19 more)

### Community 36 - "getMarketingPath"
Cohesion: 0.14
Nodes (17): BRAND_NAME, getAlternatePagePaths(), getLocalizedPageSeo(), getMarketingContactContent(), getMarketingPath(), ContactPageComponent, Component, ExamplesPageComponent (+9 more)

### Community 38 - "worker-image.ts"
Cohesion: 0.16
Nodes (21): markJobDone(), markJobProcessing(), QUEUE_NAMES, getRedisConnectionOptions(), RedisConnectionOptions, completeOperationForJob(), failOperationForJob(), JobDataWithOperation (+13 more)

### Community 39 - "web-discovery.ts"
Cohesion: 0.11
Nodes (23): loadBlockedDomainSet(), recommendSource(), upsertDiscoveredDomain(), upsertSourceItem(), DailyUsage, dedupeCandidates(), DiscoveryRunResult, ensureDomainSource() (+15 more)

### Community 40 - "SourcesPageComponent"
Cohesion: 0.15
Nodes (5): SourceRecommendation, SourceType, StudioSource, SourcesPageComponent, Component

### Community 41 - "getEnv"
Cohesion: 0.12
Nodes (21): ApiEnvelope, assert(), call(), main(), PostShape, getImageProvider(), hmacHex(), getBooleanEnv() (+13 more)

### Community 42 - "getNumberEnv"
Cohesion: 0.13
Nodes (12): runSchedulerTick(), runSchedulerWorker(), getNumberEnv(), claimDuePublications(), FirecrawlWebIntelligenceProvider, isUrlReachable(), normalizeSearchItem(), TavilyWebIntelligenceProvider (+4 more)

### Community 43 - "verification.ts"
Cohesion: 0.13
Nodes (26): detectCms(), DiscoveredAuthOption, discoverWebsite(), extractMetaContent(), isPrivateIpLiteral(), normalizeDestinationUrl(), PROBE_HEADERS, probeEndpoint() (+18 more)

### Community 44 - "site-relevance.ts"
Cohesion: 0.11
Nodes (24): EditorialPlanningContext, PlanningEvidence, PlanningStrategy, prisma, EditorialPlanBriefV2, SearchIntent, SiteIntelligenceProfileSummary, CannibalizationVerdict (+16 more)

### Community 45 - "orchestration.ts"
Cohesion: 0.14
Nodes (28): asRecord(), buildDerivatives(), deriveVersion(), makeDerivative(), prisma, readNumber(), readString(), requestImageGenerationForVersion() (+20 more)

### Community 46 - "AppConfirmDialogComponent"
Cohesion: 0.11
Nodes (11): App, appConfig, config, serverConfig, routes, serverRoutes, Component, AppConfirmDialogComponent (+3 more)

### Community 48 - "compilerOptions"
Cohesion: 0.07
Nodes (27): dist, DOM, ES2022, node, node_modules, scripts/**/*.ts, src/**/*.ts, tests/**/*.ts (+19 more)

### Community 49 - "editorial-plan-schema.ts"
Cohesion: 0.07
Nodes (27): briefItemSchema, CANNIBALIZATION_RISKS, CannibalizationRisk, channelSchema, CONTENT_FORMATS, ContentFormat, contentTypeSchema, EDITORIAL_PLAN_PROMPT_VERSION (+19 more)

### Community 50 - "views.ts"
Cohesion: 0.11
Nodes (26): listProjects(), mapQaState(), buildReviewGate(), BuildReviewGateInput, countQaFailures(), countQaWarnings(), countWordsFromHtml(), ImageReadinessInput (+18 more)

### Community 51 - "Auctorio — SEO Architecture"
Cohesion: 0.07
Nodes (26): 1. URL Structure, 2. Meta Tags, 3. Structured Data (JSON-LD), 4. Content Architecture, 5. Technical SEO, 6. Open Graph & Social, 7. Recommendations, Auctorio — SEO Architecture (+18 more)

### Community 52 - "scraping/index.ts"
Cohesion: 0.13
Nodes (26): buildContentFromFields(), compactWhitespace(), enforceRateLimit(), ensureRobotsAllowed(), extractLink(), extractSelectors(), getRobotsRules(), isHostAllowed() (+18 more)

### Community 53 - "social-publishers.ts"
Cohesion: 0.15
Nodes (18): buildOAuthHeader(), dryRunResult(), igUrl(), InstagramCredentials, InstagramPublisherAdapterImpl, percentEncode(), PublisherCapabilities, readInstagramCredentials() (+10 more)

### Community 54 - "2. Mapa objetivo de rutas"
Cohesion: 0.08
Nodes (25): 1. Superficies auditadas hoy, 2. Mapa objetivo de rutas, 3. Pantallas clave por fase, 4. Patrones de pantalla, 5. Notas de migracion, 6. Resultado del mapa, AI Generation, Analytics (+17 more)

### Community 55 - "Auctorio Web — Rework Audit & Delivery Report"
Cohesion: 0.08
Nodes (24): 1.1 Visual Design — Critical Issues, 1.2 UX/UI — Critical Issues, 1.3 Copywriting — Critical Issues, 1.4 SEO — Critical Issues, 1.5 Accessibility, 1.6 Performance, 1. Pre-Rework Audit, 2. Design System — New Visual Direction (+16 more)

### Community 56 - "AuRichEditorComponent"
Cohesion: 0.12
Nodes (8): ALLOWED_TAGS, AuRichEditorComponent, isPlatformBrowserSafe(), sanitizeHtml(), Component, Input, ViewChild, Output

### Community 57 - "InboxPageComponent"
Cohesion: 0.13
Nodes (5): SourceItemStatus, StudioSourceItem, StudioStoryCluster, InboxPageComponent, Component

### Community 58 - "ActivityPageComponent"
Cohesion: 0.14
Nodes (4): OperationItem, OperationStatus, ActivityPageComponent, Component

### Community 59 - "Arquitectura Tecnica del Backend de Generacion de Contenido con IA (SEO e Instagram)"
Cohesion: 0.08
Nodes (23): 0.1 Estados y transiciones (publicaciones), 0.2 Workers y colas, 0.3 Idempotencia y reintentos, 0.4 Seguridad, 0.5 Automatizacion, 0. Dominio editorial (nuevo), 10. Seguridad y scraping, 11. Proveedores de IA (abstraccion) (+15 more)

### Community 60 - "qa.ts"
Cohesion: 0.14
Nodes (20): containsKeyword(), countExternalLinks(), countImages(), countInternalLinks(), GENERIC_AI_PHRASES, hasEmptyHeadings(), hasFaqSection(), hasHeadingOrderIssues() (+12 more)

### Community 61 - "devDependencies"
Cohesion: 0.09
Nodes (23): @angular/build, @angular/cli, @angular/compiler-cli, devDependencies, @angular/build, @angular/cli, @angular/compiler-cli, jasmine-core (+15 more)

### Community 62 - "dependencies"
Cohesion: 0.09
Nodes (23): @angular/common, @angular/compiler, @angular/core, @angular/forms, @angular/platform-browser, @angular/platform-server, @angular/router, @angular/ssr (+15 more)

### Community 63 - "SettingsPageComponent"
Cohesion: 0.11
Nodes (5): AiUsageRow, StudioRoleSummary, StudioUserSummary, SettingsPageComponent, Component

### Community 64 - "Talkaris Product Architecture"
Cohesion: 0.09
Nodes (21): 1. Resumen ejecutivo, 2. Mapa real del repositorio, 3. Dominio actual, 4. Funcionalidades existentes y su representacion, 5. Auth architecture, 6. Resultado, Backend HTTP, Completamente representadas en UI (+13 more)

### Community 65 - "worker-social.ts"
Cohesion: 0.19
Nodes (20): buildPublishInput(), LoadedPublication, loadPublication(), prisma, processPublish(), processUnpublish(), runSocialWorker(), SocialGenerateJobData (+12 more)

### Community 66 - "prisma.ts"
Cohesion: 0.25
Nodes (9): RepositoryError, isUniqueViolation(), contentImageRepository, contentTextRepository, factRepository, jobRepository, tenantRepository, topicRepository (+1 more)

### Community 67 - "profile.ts"
Cohesion: 0.13
Nodes (21): loadProfile(), COMMON_TOPIC_TERMS, containsAny(), countKeywords(), ENGLISH_STOPWORDS, EntitySummary, GUIATV_COMMERCIAL_TERMS, GUIATV_EVERGREEN_TERMS (+13 more)

### Community 69 - "planner.ts"
Cohesion: 0.15
Nodes (18): runAutomationWorker(), findDuplicateCoverage(), AutomationTickResult, createAutoProject(), createFactsFromSourceItem(), CreateProjectFromSourceItemInput, CreateProjectFromSourceItemResult, ensureAutoPublications() (+10 more)

### Community 70 - "registry.ts"
Cohesion: 0.12
Nodes (18): AuthMethodDescriptor, AuthMethodId, CapabilityId, ConfigSchemaField, connectorCapabilityView, ConnectorKind, GENERIC_REST_DESCRIPTOR, GENERIC_REST_FIELDS (+10 more)

### Community 71 - "scripts"
Cohesion: 0.10
Nodes (20): scripts, bootstrap:studio-access, build, build:studio, dev:studio, serve:studio, start:api, start:worker:automation (+12 more)

### Community 72 - "getPrismaClient"
Cohesion: 0.15
Nodes (14): hashApiKey(), main(), main(), ROLE_KEYS, main(), hashApiKey(), main(), allowedStatuses (+6 more)

### Community 73 - "automation.ts"
Cohesion: 0.15
Nodes (19): assertSafeAutomationPolicy(), AUTOMATION_DEFAULTS, AutomationStatus, countChannelPublicationsToday(), EditorialSlot, generateEditorialSlots(), getAutomationStatus(), getChannelWindow() (+11 more)

### Community 74 - "MarketingLocale"
Cohesion: 0.16
Nodes (13): BRAND_SIGNATURE, BRAND_TAGLINE, getFooterResources(), getMarketingLocaleFromPath(), getMarketingNavigation(), getStudioLoginPath(), getUseCaseBySlug(), MarketingLocale (+5 more)

### Community 75 - "AUCTORIO REBUILD STATUS"
Cohesion: 0.11
Nodes (18): Architecture decisions, AUCTORIO REBUILD STATUS, Backend API, Completed in latest pass, Current objective, Current phase, Files touched, Functional status by module (+10 more)

### Community 77 - "image.ts"
Cohesion: 0.16
Nodes (10): backoffDelay(), downloadBytesRobust(), ImageDownloadErrorCode, ImageGenerationHandle, ImageGenerationInput, ImageGenerationResult, ImageProvider, MockImageProvider (+2 more)

### Community 78 - "source-quality.ts"
Cohesion: 0.15
Nodes (15): applySourceFeedback(), AUTHORITY_TLDS, detectSpamSignals(), DomainEvaluationContext, evaluateDomainQuality(), isPrimaryCandidate(), PRIMARY_HINTS, prisma (+7 more)

### Community 79 - "MediaPageComponent"
Cohesion: 0.18
Nodes (3): StudioMediaItem, MediaPageComponent, Component

### Community 81 - "dependencies"
Cohesion: 0.12
Nodes (17): cheerio, fast-xml-parser, fastify, google-auth-library, nodemailer, dependencies, bullmq, cheerio (+9 more)

### Community 82 - "editorial.ts"
Cohesion: 0.19
Nodes (15): normalizeText(), assignSourceItemToCluster(), buildSemanticHash(), clampScore(), CoverageCheckResult, overlapRatio(), prisma, ScoreExplanationEntry (+7 more)

### Community 83 - "events.ts"
Cohesion: 0.24
Nodes (15): eventHeartbeatMs(), eventRateLimitPerMinute(), getPublisher(), parseEvent(), publishEvent(), readEventsSince(), sanitizeEventPayload(), streamKey() (+7 more)

### Community 84 - "social.ts"
Cohesion: 0.16
Nodes (15): buildSocialPrompt(), extractHashtags(), extractJsonObject(), GeneratedSocialPiece, INSTAGRAM_CAPTION_LIMIT, parseGeneratedSocial(), prisma, runSocialGenerationJob() (+7 more)

### Community 85 - "options"
Cohesion: 0.15
Nodes (16): options, assets, browser, outputMode, polyfills, security, server, ssr (+8 more)

### Community 86 - "site-intelligence/index.ts"
Cohesion: 0.18
Nodes (14): main(), MOVIE_SOURCES, prisma, TRUNCATE_TABLES, verifyTruncateSafety(), crawlPagesForSite(), upsertDiscoveredPages(), activeRuns (+6 more)

### Community 88 - "Auctorio Studio — Design System (Phase 2)"
Cohesion: 0.13
Nodes (14): 10. State language, 11. CSS architecture, 1. Direction, 2. Color tokens, 3. Theming mechanism, 4. Typography, 5. Spacing / density, 6. Radii, borders, shadows, focus (+6 more)

### Community 89 - "worker-publishing.ts"
Cohesion: 0.22
Nodes (13): defaultDependencies, LoadedPublication, prisma, processPublishingJob(), PublishingDependencies, PublishingJobData, readTargetStatus(), resolvePublicationStatus() (+5 more)

### Community 90 - "home-page.component.ts"
Cohesion: 0.20
Nodes (11): getAssetBySlug(), getHomeExamples(), getLocalizedExamples(), getLocalizedFaqEntries(), getLocalizedUseCases(), getMarketingHomeContent(), getUseCaseAlternatePaths(), getUseCasePath() (+3 more)

### Community 91 - "1. Universal connection installer"
Cohesion: 0.14
Nodes (13): 1. Universal connection installer, 2. Activity Center (operations), 3. Realtime events (SSE), 4. Notification Center, 5. Provisioning and cleanup, Activation, Async execution, Connector registry (`src/studio/connectors/registry.ts`) (+5 more)

### Community 92 - "3. Architecture decisions"
Cohesion: 0.14
Nodes (13): 1. Verified current-state anchors (with corrections), 2. Hard-coded brand/bootstrap paths to remove, 3.1 Connector registry (M3), 3.2 Installation aggregate + state machine (M2/M4), 3.3 Operations (M5), 3.4 SSE (M6), 3.5 Notifications (M7), 3.6 UX polish (M8) (+5 more)

### Community 93 - "Auctorio — Universal Connection Installer, Job Center, Notifications and UX Polish"
Cohesion: 0.14
Nodes (13): Architecture requirements, Auctorio — Universal Connection Installer, Job Center, Notifications and UX Polish, Delivery milestones, Mandatory context discipline, Non-negotiable completion rules, Primary objective: universal “Magic Installer”, Remove hard-coded defaults safely, Required tests and proof (+5 more)

### Community 94 - "LoginPageComponent"
Cohesion: 0.26
Nodes (4): LoginPageComponent, resolveReturnTo(), Component, ViewChild

### Community 95 - "Auctorio Studio — Frontend Rebuild Report"
Cohesion: 0.15
Nodes (12): Accessibility, Architecture — what changed and why, Auctorio Studio — Frontend Rebuild Report, Before — major frontend problems, Mobile strategy, Performance, Remaining issues, Removed code (+4 more)

### Community 96 - "Auctorio Multi-Tenant Client Integrations"
Cohesion: 0.15
Nodes (12): Auctorio Multi-Tenant Client Integrations, Current operational caveat, Destination contracts, Guía Programación TV, Notes, Operational sequence, Provisioning, Publishing credentials (+4 more)

### Community 97 - "devDependencies"
Cohesion: 0.15
Nodes (13): devDependencies, @playwright/test, prisma, ts-node, @types/node, @types/nodemailer, typescript, @types/node (+5 more)

### Community 98 - "worker-discovery.ts"
Cohesion: 0.26
Nodes (10): DiscoveryTickResult, prisma, runDiscoveryTick(), runDiscoveryWorker(), scoreAndClusterItems(), scoreAndPromoteSourceItem(), fetchSourceNow(), getSourceAdapter() (+2 more)

### Community 99 - "producer.ts"
Cohesion: 0.36
Nodes (11): jobQueue, enqueueConnectionJob(), enqueueImageJob(), enqueuePublishingJob(), enqueueScrapingJob(), enqueueSocialJob(), enqueueTextJob(), getPublishingQueue() (+3 more)

### Community 100 - "AyrshareSocialProvider"
Cohesion: 0.29
Nodes (3): AyrshareSocialProvider, SocialPlatform, SocialProfile

### Community 101 - "Image Manifest"
Cohesion: 0.17
Nodes (11): 1. publisher-command-center, 2. search-led-newsroom, 3. multi-site-publishing-grid, 4. editorial-qa-review, 5. brand-content-program, 6. content-operations-showcase, Auctorio — Image Generation Log, Existing Images (Pre-Rework) (+3 more)

### Community 102 - "seo.service.ts"
Cohesion: 0.21
Nodes (9): BRAND_DESCRIPTION, BRAND_DOMAIN_OBJECTIVE, MarketingShowcaseAsset, TECNORIA_LINKS, normalizeOrigin(), STUDIO_ORIGIN, MadeByTecnoriaPageComponent, Component (+1 more)

### Community 103 - "SiteIntelligencePageComponent"
Cohesion: 0.26
Nodes (3): SiteIntelligenceOverview, SiteIntelligencePageComponent, Component

### Community 104 - "SseService"
Cohesion: 0.30
Nodes (4): StudioEventMessage, EventListener, SseService, Injectable

### Community 105 - "Auctorio Studio — Frontend Rebuild Audit (Phase 0)"
Cohesion: 0.17
Nodes (11): 10. Known constraints, 1. Current product architecture, 2. Current information architecture, 3. Functionality inventory (preserved, real), 4. Styling architecture — current state, 5. Application shell — current state, 6. Cross-cutting UX debt (measured), 7. Performance baseline (+3 more)

### Community 106 - "verify-platform-credentials.ts"
Cohesion: 0.27
Nodes (11): Account, checkAuctorioLogin(), checkAuthEndpoint(), checkPublicSite(), CheckResult, Inventory, jsonRequest(), main() (+3 more)

### Community 107 - "CLAUDE.md - Auctorio Agent Guide"
Cohesion: 0.18
Nodes (10): [ARCHITECT], Behavioral Rules, Build & Test Commands, CLAUDE.md - Auctorio Agent Guide, [DEVELOPER], graphify, Project Context, Role-Specific Missions (+2 more)

### Community 108 - "Studio Simplification — Architecture Report"
Cohesion: 0.18
Nodes (10): 1. New authentication model, 2. Session cookie (BFF, `apps/studio-web/src/server.ts`), 3. Site scoping per request, 4. New Studio session view, 5. Navigation & routing, 6. Content workflow, 7. Backend additions, 8. Preserved production core (unchanged behavior) (+2 more)

### Community 109 - "Studio Simplification — Deletion Report"
Cohesion: 0.18
Nodes (10): Deleted components (5), Deleted pages (23), Deleted routes (28 old Studio routes removed; redirects installed), Deleted services / guards / utils, Login UI reduction, Merged pages, Metrics, Obsolete styles (+2 more)

### Community 110 - "Talkaris Screen Map"
Cohesion: 0.18
Nodes (10): Control, Dashboard, Estado de pantallas del cockpit editorial, Governance, Lectura del mapa, Mapa de navegación, Operations, Protección por permisos (+2 more)

### Community 111 - "Content AI Platform — Auctorio"
Cohesion: 0.18
Nodes (10): API expuesta, Arranque local, Conectar X / Instagram, Content AI Platform — Auctorio, Fiabilidad, Flujo editorial, Modo automatico, Modo de publicacion (dry-run) (+2 more)

### Community 112 - "AuctorioChatWidgetComponent"
Cohesion: 0.29
Nodes (4): AuctorioChatWidgetComponent, Component, Input, Inject

### Community 115 - "deps.ts"
Cohesion: 0.24
Nodes (4): CostPolicy, CostPolicyResult, JobQueue, UseCaseDependencies

### Community 116 - "ai/text.ts"
Cohesion: 0.24
Nodes (6): MockTextProvider, OpenAICompatibleTextProvider, TextGenerationInput, TextGenerationResult, TextProvider, TextUsage

### Community 117 - "discovery-planner.ts"
Cohesion: 0.29
Nodes (9): getTextProvider(), buildPlanPrompt(), DiscoveryQueryPlan, EditorialDiscoveryContext, gatherEditorialContext(), parseDiscoveryPlan(), planDiscovery(), prisma (+1 more)

### Community 119 - "development"
Cohesion: 0.22
Nodes (9): build, builder, configurations, defaultConfiguration, development, buildTarget, extractLicenses, optimization (+1 more)

### Community 120 - "PublishingPageComponent"
Cohesion: 0.28
Nodes (4): ProjectStatus, PublicationListItem, PublishingPageComponent, Component

### Community 123 - "Auctorio SEO Engine V2 — Architecture & Operator Notes (M16–M22)"
Cohesion: 0.22
Nodes (8): AI structured-output architecture, Auctorio SEO Engine V2 — Architecture & Operator Notes (M16–M22), Editorial planning architecture, External provider requirements, Old pipeline vs new pipeline, Operator runbook, Publishing contract (GuiaTV), Site intelligence architecture

### Community 124 - "Auctorio Studio — Frontend Information Architecture (Phase 1)"
Cohesion: 0.22
Nodes (8): 1. Product loop the UI must reinforce, 2. Studio navigation hierarchy, 3. Route responsibilities, 4. Global actions, 5. Cross-screen workflows, 6. Settings hierarchy, 7. Layout rules, Auctorio Studio — Frontend Information Architecture (Phase 1)

### Community 125 - "cleanup-seeded-connections.ts"
Cohesion: 0.36
Nodes (8): Args, cleanupAccount(), cleanupInstallationDrafts(), main(), parseArgs(), prisma, reportCandidates(), resolveTargets()

### Community 126 - "generate-marketing-images.mjs"
Cohesion: 0.28
Nodes (8): __dirname, downloadAndConvert(), generateImage(), IMAGES, main(), MODEL, OUTPUT_DIR, ROOT

### Community 127 - "angular.json"
Cohesion: 0.25
Nodes (7): cli, analytics, packageManager, newProjectRoot, projects, $schema, version

### Community 128 - "production"
Cohesion: 0.25
Nodes (8): serve, production, budgets, buildTarget, outputHashing, builder, configurations, defaultConfiguration

### Community 129 - "studio-web/package.json"
Cohesion: 0.25
Nodes (7): name, prettier, overrides, printWidth, singleQuote, private, version

### Community 130 - "scripts"
Cohesion: 0.25
Nodes (8): scripts, build, dev:ssr, ng, serve:ssr, start, test, watch

### Community 131 - "Studio Web"
Cohesion: 0.25
Nodes (7): Comandos, Flujo soportado, Notas operativas, Que hace, Rutas principales, Studio Web, Variables necesarias

### Community 132 - "provision-linked-tenants.ts"
Cohesion: 0.39
Nodes (7): asJson(), FIXTURE_SITES, hashApiKey(), main(), parseArgs(), provision(), ProvisionArgs

### Community 133 - "shouldUseSecureCookie"
Cohesion: 0.33
Nodes (7): clearAuthStateCookie(), encryptAuthState(), encryptPayload(), encryptSession(), setAuthStateCookie(), setSessionCookie(), shouldUseSecureCookie()

### Community 134 - "getInternalHeaders"
Cohesion: 0.29
Nodes (7): createInternalLaunchTicket(), exchangeOidcSession(), fetchInternalIdentityProvider(), fetchInternalWorkspaceAccess(), getInternalHeaders(), redeemInternalLaunchTicket(), revokeSessionToken()

### Community 135 - "postInternalAuth"
Cohesion: 0.29
Nodes (7): postInternalAuth(), requestInternalGoogleLogin(), requestInternalInvitationAccept(), requestInternalLoginOptions(), requestInternalPasswordForgot(), requestInternalPasswordLogin(), requestInternalPasswordReset()

### Community 136 - "Auctorio → GuiaTV Production Acceptance Evidence"
Cohesion: 0.29
Nodes (6): Auctorio → GuiaTV Production Acceptance Evidence, Known residuals, Release identity, Reliability changes shipped in this pass, Test suite results, Workflow evidence (real services, real GuiaTV)

### Community 137 - "Auctorio Environment & Configuration Audit"
Cohesion: 0.29
Nodes (6): Auctorio Environment & Configuration Audit, Deployment reproducibility, Environment variable matrix, Fail-fast rules (implemented 2026-08-21), Migration verification (2026-08-21), Production runtime facts (verified)

### Community 138 - "Progreso del proyecto"
Cohesion: 0.29
Nodes (6): Estado actual, Implementado, Pendiente relevante, Progreso del proyecto, Pruebas automatizadas, Verificado

### Community 139 - "cost-policy.ts"
Cohesion: 0.43
Nodes (6): checkCostPolicy(), CostPolicyInput, CostPolicyResult, startOfDayUtc(), startOfMonthUtc(), toNumber()

### Community 140 - "studio-web"
Cohesion: 0.33
Nodes (6): studio-web, prefix, projectType, root, schematics, sourceRoot

### Community 141 - "AppToastHostComponent"
Cohesion: 0.40
Nodes (3): AppToastHostComponent, Component, ToastItem

### Community 142 - "resolveStudioSession"
Cohesion: 0.33
Nodes (6): buildProxySignature(), clearSessionCookie(), proxyToBackend(), resolveStudioSession(), validateApiKey(), validateSessionToken()

### Community 143 - "getRequestOrigin"
Cohesion: 0.33
Nodes (6): buildRedirectUri(), getRequestOrigin(), readHeaderValue(), resolveRequestSiteId(), resolveTargetSite(), splitForwardedValue()

### Community 144 - "readSession"
Cohesion: 0.40
Nodes (6): decryptAuthState(), decryptPayload(), decryptSession(), parseCookies(), readAuthState(), readSession()

### Community 145 - "cloudflare-cutover.sh"
Cohesion: 0.73
Nodes (5): cf_api(), require_env(), set_zone_setting(), cloudflare-cutover.sh script, upsert_a_record()

### Community 146 - "qa-visual-installer.mjs"
Cohesion: 0.33
Nodes (5): overflowRows, PAGES, report, THEMES, WIDTHS

### Community 148 - "editorial.test.ts"
Cohesion: 0.47
Nodes (5): classifyPublicationError(), failAttempt(), maxPublicationRetries(), nextRetryDelay(), PUBLICATION_STATES

### Community 149 - "studio-ssr.test.ts"
Cohesion: 0.47
Nodes (4): getFreePort(), MockBackend, startStudioServer(), waitForServer()

### Community 150 - "architect"
Cohesion: 0.40
Nodes (5): extract-i18n, test, builder, architect, builder

### Community 153 - "smoke-editorial.cjs"
Cohesion: 0.60
Nodes (4): call(), crypto, main(), signedHeaders()

### Community 154 - "projects.ts"
Cohesion: 0.40
Nodes (4): ArchiveProjectInput, ArchiveProjectResult, enqueueUnpublishForWebsite(), prisma

### Community 155 - "AGENTS.md - Auctorio AI Agents"
Cohesion: 0.50
Nodes (3): AGENTS.md - Auctorio AI Agents, Available Agent Roles, Optimization Policy

### Community 156 - "escapeXml"
Cohesion: 0.50
Nodes (4): buildImageSitemapXml(), buildLocalizedSitemapXml(), buildSitemapIndexXml(), escapeXml()

### Community 159 - "package.json"
Cohesion: 0.50
Nodes (3): name, private, version

### Community 160 - "browser.ts"
Cohesion: 0.50
Nodes (3): BrowserFetchOptions, BrowserHandle, BrowserPage

## Knowledge Gaps
- **1078 isolated node(s):** `M0 — Repository Intelligence ✅`, `M1 — Multi-Agent Foundation (RuFlo) 🟡`, `M2 — Architecture and Data Integrity ✅`, `M3 — Enterprise Security and RBAC ✅`, `M4 — SaaS Foundation 🟡` (+1073 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **24 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `getPrismaClient()` connect `getPrismaClient` to `studio/auth.ts`, `routes-editorial.ts`, `provision-linked-tenants.ts`, `routes.ts`, `social-connections.ts`, `routes-discovery.ts`, `sources.ts`, `repository.ts`, `projects.ts`, `sha256`, `routes-connectors.ts`, `crawler.ts`, `worker-image.ts`, `web-discovery.ts`, `site-relevance.ts`, `orchestration.ts`, `worker-social.ts`, `prisma.ts`, `profile.ts`, `planner.ts`, `automation.ts`, `source-quality.ts`, `editorial.ts`, `social.ts`, `site-intelligence/index.ts`, `worker-publishing.ts`, `worker-discovery.ts`, `discovery-planner.ts`, `cleanup-seeded-connections.ts`?**
  _High betweenness centrality (0.025) - this node is a cross-community bridge._
- **Why does `StudioApiService` connect `StudioApiService` to `StudioSocialContent`, `app.routes.ts`, `studio.models.ts`, `SiteIntelligencePageComponent`, `SseService`, `AppShellComponent`, `SourcesPageComponent`, `MediaPageComponent`, `.startPolling`, `ConnectionsPageComponent`, `accept-invite-page.component.ts`, `PublishingPageComponent`, `InboxPageComponent`, `ActivityPageComponent`, `StudioPublication`, `SettingsPageComponent`?**
  _High betweenness centrality (0.024) - this node is a cross-community bridge._
- **Why does `getNumberEnv()` connect `getNumberEnv` to `publishers.ts`, `routes-editorial.ts`, `social-connections.ts`, `cost-policy.ts`, `sources.ts`, `social-provider.ts`, `editorial.test.ts`, `fetchWithTimeout`, `topic-controller.ts`, `structured.ts`, `crawler.ts`, `worker-image.ts`, `web-discovery.ts`, `getEnv`, `verification.ts`, `scraping/index.ts`, `social-publishers.ts`, `worker-social.ts`, `profile.ts`, `planner.ts`, `automation.ts`, `image.ts`, `events.ts`, `site-intelligence/index.ts`, `worker-discovery.ts`, `producer.ts`, `AyrshareSocialProvider`, `ai/text.ts`?**
  _High betweenness centrality (0.022) - this node is a cross-community bridge._
- **What connects `M0 — Repository Intelligence ✅`, `M1 — Multi-Agent Foundation (RuFlo) 🟡`, `M2 — Architecture and Data Integrity ✅` to the rest of the system?**
  _1078 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `studio/auth.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.04603836530442035 - nodes in this community are weakly interconnected._
- **Should `publishers.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.06332842415316642 - nodes in this community are weakly interconnected._
- **Should `routes-editorial.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.04703247480403135 - nodes in this community are weakly interconnected._