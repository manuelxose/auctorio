# Graph Report - auctorio  (2026-08-25)

## Corpus Check
- 254 files · ~216,247 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 3123 nodes · 6843 edges · 145 communities (133 shown, 12 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 29 edges (avg confidence: 0.84)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `ef766d98`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- publishers.ts
- studio/auth.ts
- social-connections.ts
- ContentWorkspacePageComponent
- studio.models.ts
- StudioApiService
- routes-editorial.ts
- worker-discovery.ts
- app.routes.ts
- CalendarPageComponent
- "tenants"
- prompts.ts
- src/server.ts
- planner.ts
- structured.ts
- fetchUrl
- InboxPageComponent
- views.ts
- AppConfirmDialogComponent
- SocialIntegrationProvider
- marketing-content.ts
- topic.ts
- topic-controller.ts
- StudioPublication
- profile.ts
- security.ts
- getMarketingPath
- compilerOptions
- scraping/index.ts
- social-provider.ts
- SettingsPageComponent
- devDependencies
- dependencies
- prisma.ts
- publication.ts
- EditorialPlanPageComponent
- getEnv
- scripts
- fetchWithTimeout
- image.ts
- MarketingLocale
- social.ts
- development
- options
- routes.ts
- MediaPageComponent
- AutomationPageComponent
- dependencies
- worker-publishing.ts
- SeoService
- ConnectionsPageComponent
- worker-social.ts
- devDependencies
- AppShellComponent
- getPrismaClient
- LoginPageComponent
- verify-platform-credentials.ts
- worker-image.ts
- studio-web
- social-publishers.ts
- seo.service.ts
- AuctorioChatWidgetComponent
- PublishingPageComponent
- OverviewPageComponent
- editorial-plan-schema.ts
- generate-marketing-images.mjs
- angular.json
- studio-web/package.json
- scripts
- shouldUseSecureCookie
- getInternalHeaders
- postInternalAuth
- site-relevance.ts
- resolveStudioSession
- getRequestOrigin
- readSession
- cloudflare-cutover.sh
- getNumberEnv
- sha256
- http-utils.ts
- AUCTORIO MASTER ROADMAP
- orchestration.ts
- home-page.component.ts
- studio-ssr.test.ts
- editorial-plan.ts
- smoke-editorial.cjs
- getImageSitemapEntries
- package.json
- deps.ts
- SourcesPageComponent
- web-discovery.ts
- fastify.d.ts
- studio-workflow.spec.ts
- 4. Componentes
- Auctorio Design System
- CLAUDE.md - Auctorio Agent Guide
- Auctorio Admin Redesign
- Auctorio Product Architecture
- Talkaris Admin Redesign
- zone.js
- Auctorio — SEO Architecture
- 2. Mapa objetivo de rutas
- Auctorio Web — Rework Audit & Delivery Report
- Arquitectura Tecnica del Backend de Generacion de Contenido con IA (SEO e Instagram)
- ContentListPageComponent
- Talkaris Product Architecture
- source-quality.ts
- Auctorio — Milestones
- AUCTORIO REBUILD STATUS
- Auctorio Studio — Design System (Phase 2)
- crawler.ts
- Auctorio Studio — Frontend Rebuild Report
- Auctorio Multi-Tenant Client Integrations
- Image Manifest
- Auctorio Studio — Frontend Rebuild Audit (Phase 0)
- sitemap.ts
- Studio Simplification — Architecture Report
- Studio Simplification — Deletion Report
- Talkaris Screen Map
- Content AI Platform — Auctorio
- Auctorio Studio — Frontend Information Architecture (Phase 1)
- 20260825000000_site_intelligence/migration.sql
- AppToastHostComponent
- production
- Studio Web
- worker-scheduler.ts
- ContentNewPageComponent
- qa.ts
- Auctorio → GuiaTV Production Acceptance Evidence
- Auctorio Environment & Configuration Audit
- Progreso del proyecto
- site-isolation.test.ts
- "editorial_plan_items"
- "editorial_plans"
- architect
- AGENTS.md - Auctorio AI Agents
- karma
- karma-coverage

## God Nodes (most connected - your core abstractions)
1. `StudioApiService` - 123 edges
2. `registerStudioRoutes()` - 103 edges
3. `getNumberEnv()` - 98 edges
4. `getEnv()` - 93 edges
5. `getPrismaClient()` - 68 edges
6. `registerEditorialRoutes()` - 66 edges
7. `ContentWorkspacePageComponent` - 61 edges
8. `writeAudit()` - 54 edges
9. `"tenants"` - 44 edges
10. `fetchWithTimeout()` - 37 edges

## Surprising Connections (you probably didn't know these)
- `buildServer()` --calls--> `registerStudioRoutes()`  [EXTRACTED]
  tests/social-connections-routes.test.ts → src/studio/routes.ts
- `buildStudioTestServer()` --calls--> `registerStudioRoutes()`  [EXTRACTED]
  tests/studio-routes.test.ts → src/studio/routes.ts
- `buildServer()` --calls--> `registerStudioRoutes()`  [EXTRACTED]
  tests/tenant-isolation.test.ts → src/studio/routes.ts
- `createFixture()` --calls--> `sha256()`  [EXTRACTED]
  tests/site-isolation.test.ts → src/shared/utils/hash.ts
- `main()` --calls--> `getPrismaClient()`  [EXTRACTED]
  scripts/qa-visual-login.ts → src/infrastructure/db/prisma.ts

## Import Cycles
- None detected.

## Communities (145 total, 12 thin omitted)

### Community 0 - "publishers.ts"
Cohesion: 0.06
Nodes (31): asRecord(), buildDryRunExternalId(), buildDryRunResult(), DryRunDecision, filterGuiaTvRelatedPlatformKeys(), filterGuiaTvRelatedRouteKeys(), GenericWebhookPublisher, getDryRunDecision() (+23 more)

### Community 1 - "studio/auth.ts"
Cohesion: 0.05
Nodes (95): main(), WORKSPACE_BOOTSTRAP, main(), acceptStudioInvitation(), AccountWithMemberships, applyMappedRoles(), buildApiKeyStudioSession(), buildHumanSession() (+87 more)

### Community 2 - "social-connections.ts"
Cohesion: 0.14
Nodes (23): decryptSecret(), encryptionKey(), encryptSecret(), generateOAuthState(), generatePkceVerifier(), sha256Hex(), tryDecryptSecret(), structuredEvent() (+15 more)

### Community 3 - "ContentWorkspacePageComponent"
Cohesion: 0.06
Nodes (5): ProjectVersionDetail, StudioProjectDetailView, StudioSocialContent, ContentWorkspacePageComponent, Component

### Community 4 - "studio.models.ts"
Cohesion: 0.04
Nodes (46): BlockedDomain, CreateProjectPayload, CreateSitePayload, DiscoveredDomain, DiscoverySettings, DiscoverySettingsResponse, EditorialPlanItem, JsonRecord (+38 more)

### Community 5 - "StudioApiService"
Cohesion: 0.04
Nodes (6): AutomationPolicy, EditorialPlan, SocialConnectionSession, StudioSession, StudioApiService, Injectable

### Community 6 - "routes-editorial.ts"
Cohesion: 0.07
Nodes (53): writeAudit(), listCalendarEvents(), bulkApproveEditorialPlanItems(), bulkDeleteEditorialPlanItems(), bulkSetEditorialPlanItemStatus(), deleteEditorialPlanItem(), generateContentFromEditorialPlanItem(), getEditorialPlan() (+45 more)

### Community 7 - "worker-discovery.ts"
Cohesion: 0.39
Nodes (6): DiscoveryTickResult, prisma, runDiscoveryTick(), runDiscoveryWorker(), scoreAndClusterItems(), listDueSources()

### Community 8 - "app.routes.ts"
Cohesion: 0.09
Nodes (35): AppEmptyStateComponent, Component, AppIconComponent, IconElement, ICONS, StudioIconName, Component, studioAuthGuard() (+27 more)

### Community 9 - "CalendarPageComponent"
Cohesion: 0.13
Nodes (3): CalendarEvent, CalendarPageComponent, Component

### Community 10 - ""tenants""
Cohesion: 0.10
Nodes (48): "ai_audit", "content_image", "content_text", "facts", "jobs", "tenants", "topics", "asset_variants" (+40 more)

### Community 11 - "prompts.ts"
Cohesion: 0.09
Nodes (41): buildImagePrompt(), buildTextPrompt(), ImagePromptInput, TextPromptInput, TextPromptOutput, approveStudioPromptVersion(), assignmentKeyForSite(), assignStudioPromptVersion() (+33 more)

### Community 12 - "src/server.ts"
Cohesion: 0.05
Nodes (26): angularApp, app, AuthStatePayload, backendBaseUrl, browserDistFolder, cookieKey, GlobalLoginResponse, GlobalSessionEntry (+18 more)

### Community 13 - "planner.ts"
Cohesion: 0.09
Nodes (40): runAutomationWorker(), assertSafeAutomationPolicy(), AUTOMATION_DEFAULTS, AutomationStatus, countChannelPublicationsToday(), EditorialSlot, generateEditorialSlots(), getAutomationStatus() (+32 more)

### Community 14 - "structured.ts"
Cohesion: 0.09
Nodes (28): balanceJson(), extractJsonCandidate(), generateStructured(), parseJsonWithRepair(), repairJson(), stripFences(), StructuredGenerationOptions, StructuredGenerationResult (+20 more)

### Community 15 - "fetchUrl"
Cohesion: 0.23
Nodes (16): fetchUrl(), validateScrapeUrl(), asStringArray(), compact(), deriveExternalId(), extractLink(), extractMedia(), firstOf() (+8 more)

### Community 16 - "InboxPageComponent"
Cohesion: 0.13
Nodes (5): SourceItemStatus, StudioSourceItem, StudioStoryCluster, InboxPageComponent, Component

### Community 17 - "views.ts"
Cohesion: 0.12
Nodes (32): buildAssetPublicUrl(), listProjects(), buildReviewGate(), BuildReviewGateInput, countQaFailures(), countQaWarnings(), countWordsFromHtml(), ImageReadinessInput (+24 more)

### Community 18 - "AppConfirmDialogComponent"
Cohesion: 0.11
Nodes (11): App, appConfig, config, serverConfig, routes, serverRoutes, Component, AppConfirmDialogComponent (+3 more)

### Community 20 - "marketing-content.ts"
Cohesion: 0.08
Nodes (28): WidgetWindow, CHAT_WIDGET_API_BASE_URL, CHAT_WIDGET_BASE_URL, CHAT_WIDGET_BRAND_LABEL, CHAT_WIDGET_ENTRY_CONTEXT, CHAT_WIDGET_SITE_KEYS, CONTACT_CONTENT, ContactContent (+20 more)

### Community 21 - "topic.ts"
Cohesion: 0.06
Nodes (36): AiAudit, ContentImage, ContentStatus, ContentText, ContentTextType, Fact, FactSourceType, Job (+28 more)

### Community 22 - "topic-controller.ts"
Cohesion: 0.10
Nodes (43): GenerateImageFromTextInput, GenerateImageFromTextOutput, generateImageFromTextUseCase(), GetContentImageInput, GetContentImageOutput, getContentImageUseCase(), GetContentTextInput, GetContentTextOutput (+35 more)

### Community 23 - "StudioPublication"
Cohesion: 0.11
Nodes (4): PublicationChannel, StudioPublication, PublicationsPageComponent, Component

### Community 24 - "profile.ts"
Cohesion: 0.10
Nodes (27): buildEditorialPlanningContext(), EditorialPlanningContext, loadProfile(), PlanningEvidence, PlanningStrategy, prisma, COMMON_TOPIC_TERMS, containsAny() (+19 more)

### Community 25 - "security.ts"
Cohesion: 0.11
Nodes (26): assignStudioRoleToUser(), createStudioRole(), ensureStudioRoles(), ensureTenantBootstrap(), ensureUniqueRoleKey(), getInternalStudioIdentityProviderBySlug(), getInternalStudioWorkspaceAccessBySlug(), getStudioIdentityProviderConfig() (+18 more)

### Community 26 - "getMarketingPath"
Cohesion: 0.11
Nodes (22): BRAND_NAME, getAlternatePagePaths(), getHomeExamples(), getLocalizedExamples(), getLocalizedPageSeo(), getMarketingContactContent(), getMarketingPath(), TECNORIA_LINKS (+14 more)

### Community 27 - "compilerOptions"
Cohesion: 0.07
Nodes (27): dist, DOM, ES2022, node, node_modules, scripts/**/*.ts, src/**/*.ts, tests/**/*.ts (+19 more)

### Community 28 - "scraping/index.ts"
Cohesion: 0.14
Nodes (25): buildContentFromFields(), compactWhitespace(), enforceRateLimit(), ensureRobotsAllowed(), extractLink(), extractSelectors(), getRobotsRules(), isHostAllowed() (+17 more)

### Community 29 - "social-provider.ts"
Cohesion: 0.09
Nodes (23): AyrshareSocialProvider, IG_LIMIT, PLATFORM_MAP, X_LIMIT, CONNECTION_PROVIDERS, ConnectionProviderName, defaultConnectionProvider(), INSTAGRAM_CAPTION_LIMIT (+15 more)

### Community 30 - "SettingsPageComponent"
Cohesion: 0.11
Nodes (5): AiUsageRow, StudioRoleSummary, StudioUserSummary, SettingsPageComponent, Component

### Community 31 - "devDependencies"
Cohesion: 0.09
Nodes (23): @angular/build, @angular/cli, @angular/compiler-cli, devDependencies, @angular/build, @angular/cli, @angular/compiler-cli, jasmine-core (+15 more)

### Community 32 - "dependencies"
Cohesion: 0.09
Nodes (23): @angular/common, @angular/compiler, @angular/core, @angular/forms, @angular/platform-browser, @angular/platform-server, @angular/router, @angular/ssr (+15 more)

### Community 33 - "prisma.ts"
Cohesion: 0.28
Nodes (8): RepositoryError, isUniqueViolation(), contentImageRepository, contentTextRepository, factRepository, jobRepository, tenantRepository, topicRepository

### Community 34 - "publication.ts"
Cohesion: 0.08
Nodes (36): assignSourceItemToCluster(), buildSemanticHash(), clampScore(), CoverageCheckResult, findDuplicateCoverage(), listStoryClusters(), overlapRatio(), prisma (+28 more)

### Community 36 - "getEnv"
Cohesion: 0.13
Nodes (21): ApiEnvelope, assert(), call(), main(), PostShape, hmacHex(), getBooleanEnv(), getEnv() (+13 more)

### Community 37 - "scripts"
Cohesion: 0.10
Nodes (20): scripts, bootstrap:studio-access, build, build:studio, dev:studio, serve:studio, start:api, start:worker:automation (+12 more)

### Community 38 - "fetchWithTimeout"
Cohesion: 0.14
Nodes (14): pkceChallenge(), fetchJson(), fetchWithTimeout(), HttpRequestOptions, JsonRecord, normalizeBody(), sleep(), basicAuth() (+6 more)

### Community 39 - "image.ts"
Cohesion: 0.14
Nodes (11): backoffDelay(), downloadBytesRobust(), ImageDownloadError, ImageDownloadErrorCode, ImageGenerationHandle, ImageGenerationInput, ImageGenerationResult, ImageProvider (+3 more)

### Community 40 - "MarketingLocale"
Cohesion: 0.17
Nodes (12): BRAND_SIGNATURE, BRAND_TAGLINE, getFooterResources(), getMarketingLocaleFromPath(), getMarketingNavigation(), getUseCaseBySlug(), MarketingLocale, translateMarketingPath() (+4 more)

### Community 41 - "social.ts"
Cohesion: 0.14
Nodes (17): buildSocialPrompt(), extractHashtags(), extractJsonObject(), GeneratedSocialPiece, INSTAGRAM_CAPTION_LIMIT, listSocialContent(), parseGeneratedSocial(), prisma (+9 more)

### Community 42 - "development"
Cohesion: 0.22
Nodes (9): build, builder, configurations, defaultConfiguration, development, buildTarget, extractLicenses, optimization (+1 more)

### Community 43 - "options"
Cohesion: 0.15
Nodes (16): options, assets, browser, outputMode, polyfills, security, server, ssr (+8 more)

### Community 44 - "routes.ts"
Cohesion: 0.06
Nodes (61): getContentTypeFromPath(), MIME_BY_EXTENSION, conflict(), errorBody(), parsePermissionList(), enqueueWebsitePublication(), approveVersion(), clearProjectPublicationState() (+53 more)

### Community 45 - "MediaPageComponent"
Cohesion: 0.20
Nodes (3): StudioMediaItem, MediaPageComponent, Component

### Community 46 - "AutomationPageComponent"
Cohesion: 0.16
Nodes (3): AutomationStatus, AutomationPageComponent, Component

### Community 47 - "dependencies"
Cohesion: 0.12
Nodes (17): cheerio, fast-xml-parser, fastify, google-auth-library, nodemailer, dependencies, bullmq, cheerio (+9 more)

### Community 48 - "worker-publishing.ts"
Cohesion: 0.14
Nodes (17): defaultDependencies, LoadedPublication, prisma, processPublishingJob(), PublishingDependencies, PublishingJobData, readTargetStatus(), resolvePublicationStatus() (+9 more)

### Community 50 - "ConnectionsPageComponent"
Cohesion: 0.10
Nodes (5): PublishingAccount, SocialConnection, SocialSetupInfo, ConnectionsPageComponent, Component

### Community 51 - "worker-social.ts"
Cohesion: 0.19
Nodes (20): buildPublishInput(), LoadedPublication, loadPublication(), prisma, processPublish(), processUnpublish(), runSocialWorker(), SocialGenerateJobData (+12 more)

### Community 52 - "devDependencies"
Cohesion: 0.15
Nodes (13): devDependencies, @playwright/test, prisma, ts-node, @types/node, @types/nodemailer, typescript, @types/node (+5 more)

### Community 53 - "AppShellComponent"
Cohesion: 0.11
Nodes (4): AppPopoverComponent, Component, AppShellComponent, Component

### Community 54 - "getPrismaClient"
Cohesion: 0.10
Nodes (21): hashApiKey(), main(), main(), ROLE_KEYS, main(), asJson(), hashApiKey(), main() (+13 more)

### Community 55 - "LoginPageComponent"
Cohesion: 0.26
Nodes (4): LoginPageComponent, resolveReturnTo(), Component, ViewChild

### Community 56 - "verify-platform-credentials.ts"
Cohesion: 0.27
Nodes (11): Account, checkAuctorioLogin(), checkAuthEndpoint(), checkPublicSite(), CheckResult, Inventory, jsonRequest(), main() (+3 more)

### Community 57 - "worker-image.ts"
Cohesion: 0.14
Nodes (23): getImageProvider(), getTextProvider(), markJobDone(), markJobFailed(), markJobProcessing(), QUEUE_NAMES, ScrapeSourceType, buildModerationFallbackPrompt() (+15 more)

### Community 58 - "studio-web"
Cohesion: 0.33
Nodes (6): studio-web, prefix, projectType, root, schematics, sourceRoot

### Community 59 - "social-publishers.ts"
Cohesion: 0.16
Nodes (19): buildOAuthHeader(), dryRunResult(), igUrl(), InstagramCredentials, InstagramPublisherAdapterImpl, isDryRunEnabled(), percentEncode(), PublisherCapabilities (+11 more)

### Community 60 - "seo.service.ts"
Cohesion: 0.09
Nodes (12): BRAND_DESCRIPTION, BRAND_DOMAIN_OBJECTIVE, MarketingShowcaseAsset, normalizeOrigin(), STUDIO_ORIGIN, AcceptInvitePageComponent, Component, ForgotPasswordPageComponent (+4 more)

### Community 61 - "AuctorioChatWidgetComponent"
Cohesion: 0.29
Nodes (4): AuctorioChatWidgetComponent, Component, Inject, Input

### Community 62 - "PublishingPageComponent"
Cohesion: 0.38
Nodes (3): PublicationListItem, PublishingPageComponent, Component

### Community 64 - "editorial-plan-schema.ts"
Cohesion: 0.09
Nodes (22): briefItemSchema, CANNIBALIZATION_RISKS, CannibalizationRisk, channelSchema, CONTENT_FORMATS, contentTypeSchema, EditorialPlanOutputV2, EvidenceItem (+14 more)

### Community 65 - "generate-marketing-images.mjs"
Cohesion: 0.28
Nodes (8): __dirname, downloadAndConvert(), generateImage(), IMAGES, main(), MODEL, OUTPUT_DIR, ROOT

### Community 66 - "angular.json"
Cohesion: 0.25
Nodes (7): cli, analytics, packageManager, newProjectRoot, projects, $schema, version

### Community 67 - "studio-web/package.json"
Cohesion: 0.25
Nodes (7): name, prettier, overrides, printWidth, singleQuote, private, version

### Community 68 - "scripts"
Cohesion: 0.25
Nodes (8): scripts, build, dev:ssr, ng, serve:ssr, start, test, watch

### Community 69 - "shouldUseSecureCookie"
Cohesion: 0.33
Nodes (7): clearAuthStateCookie(), encryptAuthState(), encryptPayload(), encryptSession(), setAuthStateCookie(), setSessionCookie(), shouldUseSecureCookie()

### Community 70 - "getInternalHeaders"
Cohesion: 0.29
Nodes (7): createInternalLaunchTicket(), exchangeOidcSession(), fetchInternalIdentityProvider(), fetchInternalWorkspaceAccess(), getInternalHeaders(), redeemInternalLaunchTicket(), revokeSessionToken()

### Community 71 - "postInternalAuth"
Cohesion: 0.29
Nodes (7): postInternalAuth(), requestInternalGoogleLogin(), requestInternalInvitationAccept(), requestInternalLoginOptions(), requestInternalPasswordForgot(), requestInternalPasswordLogin(), requestInternalPasswordReset()

### Community 72 - "site-relevance.ts"
Cohesion: 0.14
Nodes (19): EditorialPlanBriefV2, SearchIntent, CannibalizationVerdict, classifyCannibalization(), computeSiteRelevanceScore(), DEFAULT_RELEVANCE_THRESHOLD, intentFitsProfile(), knownPlatformFromText() (+11 more)

### Community 73 - "resolveStudioSession"
Cohesion: 0.33
Nodes (6): buildProxySignature(), clearSessionCookie(), proxyToBackend(), resolveStudioSession(), validateApiKey(), validateSessionToken()

### Community 74 - "getRequestOrigin"
Cohesion: 0.33
Nodes (6): buildRedirectUri(), getRequestOrigin(), readHeaderValue(), resolveRequestSiteId(), resolveTargetSite(), splitForwardedValue()

### Community 75 - "readSession"
Cohesion: 0.40
Nodes (6): decryptAuthState(), decryptPayload(), decryptSession(), parseCookies(), readAuthState(), readSession()

### Community 76 - "cloudflare-cutover.sh"
Cohesion: 0.73
Nodes (5): cf_api(), require_env(), set_zone_setting(), cloudflare-cutover.sh script, upsert_a_record()

### Community 77 - "getNumberEnv"
Cohesion: 0.19
Nodes (4): getNumberEnv(), FirecrawlWebIntelligenceProvider, normalizeSearchItem(), TavilyWebIntelligenceProvider

### Community 78 - "sha256"
Cohesion: 0.12
Nodes (16): sha256(), authPlugin(), buildServer(), startServer(), buildServer(), createFixture(), Fixture, prisma (+8 more)

### Community 79 - "http-utils.ts"
Cohesion: 0.08
Nodes (56): badRequest(), getInternalSharedSecret(), INTERNAL_SECRET_HEADER, isOneOf(), isUuid(), notFound(), parseBody(), parseJsonObjectField() (+48 more)

### Community 80 - "AUCTORIO MASTER ROADMAP"
Cohesion: 0.05
Nodes (39): Acceptance criteria, Acceptance criteria, Acceptance criteria, Acceptance criteria, Acceptance criteria, Acceptance criteria, Acceptance criteria, Acceptance criteria (+31 more)

### Community 81 - "orchestration.ts"
Cohesion: 0.09
Nodes (42): jobQueue, enqueueImageJob(), enqueuePublishingJob(), enqueueScrapingJob(), enqueueSocialJob(), enqueueTextJob(), getPublishingQueue(), getQueue() (+34 more)

### Community 82 - "home-page.component.ts"
Cohesion: 0.18
Nodes (12): getAssetBySlug(), getHomeAssets(), getLocalizedAssets(), getLocalizedFaqEntries(), getLocalizedUseCases(), getMarketingHomeContent(), getStudioLoginPath(), getUseCaseAlternatePaths() (+4 more)

### Community 83 - "studio-ssr.test.ts"
Cohesion: 0.47
Nodes (4): getFreePort(), MockBackend, startStudioServer(), waitForServer()

### Community 84 - "editorial-plan.ts"
Cohesion: 0.14
Nodes (19): StructuredGenerationAttempt, buildPromptV2(), CHANNELS, renderPlanningContext(), generateEditorialPlan(), GenerateEditorialPlanInput, normalizeSlug(), PlanChannel (+11 more)

### Community 85 - "smoke-editorial.cjs"
Cohesion: 0.60
Nodes (4): call(), crypto, main(), signedHeaders()

### Community 86 - "getImageSitemapEntries"
Cohesion: 0.40
Nodes (6): getImageSitemapEntries(), getPublicRouteEntries(), buildImageSitemapXml(), buildLocalizedSitemapXml(), buildSitemapIndexXml(), escapeXml()

### Community 87 - "package.json"
Cohesion: 0.50
Nodes (3): name, private, version

### Community 88 - "deps.ts"
Cohesion: 0.15
Nodes (11): checkCostPolicy(), CostPolicyInput, CostPolicyResult, startOfDayUtc(), startOfMonthUtc(), toNumber(), CostPolicy, CostPolicyResult (+3 more)

### Community 89 - "SourcesPageComponent"
Cohesion: 0.12
Nodes (4): SourcesPageComponent, Component, ThemeService, Injectable

### Community 90 - "web-discovery.ts"
Cohesion: 0.08
Nodes (32): buildPlanPrompt(), DiscoveryQueryPlan, EditorialDiscoveryContext, gatherEditorialContext(), planDiscovery(), prisma, QUERY_CATEGORIES, loadBlockedDomainSet() (+24 more)

### Community 98 - "4. Componentes"
Cohesion: 0.05
Nodes (38): 1. Visual direction, 2. Tokens, 3. Layout primitives, 4. Componentes, 5. Interaction rules, 6. Semantica del sistema, 7. Component inventory real, 8. Proximos componentes recomendados (+30 more)

### Community 99 - "Auctorio Design System"
Cohesion: 0.06
Nodes (35): 10. Accesibilidad, 11. Inventario de componentes para implementacion, 12. Regla final, 1. Direccion visual, 2. Principios del sistema, 3.1 Foundation tokens, 3.2 Semantic tokens, 3.3 Typography (+27 more)

### Community 100 - "CLAUDE.md - Auctorio Agent Guide"
Cohesion: 0.18
Nodes (10): [ARCHITECT], Behavioral Rules, Build & Test Commands, CLAUDE.md - Auctorio Agent Guide, [DEVELOPER], graphify, Project Context, Role-Specific Missions (+2 more)

### Community 101 - "Auctorio Admin Redesign"
Cohesion: 0.06
Nodes (34): 10. Reglas de UX de Auctorio, 11. Resultado esperado, 1. Objetivo, 2. Principios rectores, 3. Nueva arquitectura del panel, 4. Shell de producto, 5. Dashboard rediseñado, 6.1 Editorial Pipeline Visual (+26 more)

### Community 102 - "Auctorio Product Architecture"
Cohesion: 0.06
Nodes (34): 10. North star, 1. Resumen ejecutivo, 2. Fuentes auditadas, 3.1 Frontend actual, 3.2 API actual, 3.3 Runtime actual, 3. Arquitectura actual del sistema, 4.1 Entidades reales (+26 more)

### Community 103 - "Talkaris Admin Redesign"
Cohesion: 0.06
Nodes (32): 10. Resultado de producto, 1. Objetivo del rediseño, 2. Principios de producto, 3. Nueva arquitectura del sidebar, 4. Pantallas rediseñadas, 5. Auth architecture implementada, 6. RBAC model, 7. Modelo mental (+24 more)

### Community 105 - "Auctorio — SEO Architecture"
Cohesion: 0.07
Nodes (26): 1. URL Structure, 2. Meta Tags, 3. Structured Data (JSON-LD), 4. Content Architecture, 5. Technical SEO, 6. Open Graph & Social, 7. Recommendations, Auctorio — SEO Architecture (+18 more)

### Community 106 - "2. Mapa objetivo de rutas"
Cohesion: 0.08
Nodes (25): 1. Superficies auditadas hoy, 2. Mapa objetivo de rutas, 3. Pantallas clave por fase, 4. Patrones de pantalla, 5. Notas de migracion, 6. Resultado del mapa, AI Generation, Analytics (+17 more)

### Community 107 - "Auctorio Web — Rework Audit & Delivery Report"
Cohesion: 0.08
Nodes (24): 1.1 Visual Design — Critical Issues, 1.2 UX/UI — Critical Issues, 1.3 Copywriting — Critical Issues, 1.4 SEO — Critical Issues, 1.5 Accessibility, 1.6 Performance, 1. Pre-Rework Audit, 2. Design System — New Visual Direction (+16 more)

### Community 108 - "Arquitectura Tecnica del Backend de Generacion de Contenido con IA (SEO e Instagram)"
Cohesion: 0.08
Nodes (23): 0.1 Estados y transiciones (publicaciones), 0.2 Workers y colas, 0.3 Idempotencia y reintentos, 0.4 Seguridad, 0.5 Automatizacion, 0. Dominio editorial (nuevo), 10. Seguridad y scraping, 11. Proveedores de IA (abstraccion) (+15 more)

### Community 109 - "ContentListPageComponent"
Cohesion: 0.16
Nodes (3): StudioProjectSummary, ContentListPageComponent, Component

### Community 110 - "Talkaris Product Architecture"
Cohesion: 0.09
Nodes (21): 1. Resumen ejecutivo, 2. Mapa real del repositorio, 3. Dominio actual, 4. Funcionalidades existentes y su representacion, 5. Auth architecture, 6. Resultado, Backend HTTP, Completamente representadas en UI (+13 more)

### Community 111 - "source-quality.ts"
Cohesion: 0.11
Nodes (19): AuditActorType, AuditEntryInput, listAudit(), prisma, applySourceFeedback(), AUTHORITY_TLDS, detectSpamSignals(), DomainEvaluationContext (+11 more)

### Community 112 - "Auctorio — Milestones"
Cohesion: 0.10
Nodes (19): Auctorio — Milestones, Known non-blocking residuals, M0 — Repository Intelligence ✅, M10 — Golden Path ✅ (GuiaTV) / ✅ (Tecnoria — 2026-08-25), M11 — Cross-Tenant Regression 🟡, M12 — UX/UI Enterprise Rebuild ✅, M13 — Realtime, Reliability, Observability 🟡, M14 — Full QA ✅ (current head) (+11 more)

### Community 113 - "AUCTORIO REBUILD STATUS"
Cohesion: 0.11
Nodes (18): Architecture decisions, AUCTORIO REBUILD STATUS, Backend API, Completed in latest pass, Current objective, Current phase, Files touched, Functional status by module (+10 more)

### Community 114 - "Auctorio Studio — Design System (Phase 2)"
Cohesion: 0.13
Nodes (14): 10. State language, 11. CSS architecture, 1. Direction, 2. Color tokens, 3. Theming mechanism, 4. Typography, 5. Spacing / density, 6. Radii, borders, shadows, focus (+6 more)

### Community 115 - "crawler.ts"
Cohesion: 0.20
Nodes (15): BOILERPLATE_SELECTORS, compact(), CrawlBatchResult, crawlPagesForSite(), ExtractedPage, extractPage(), extractPageFromHtml(), firstText() (+7 more)

### Community 116 - "Auctorio Studio — Frontend Rebuild Report"
Cohesion: 0.15
Nodes (12): Accessibility, Architecture — what changed and why, Auctorio Studio — Frontend Rebuild Report, Before — major frontend problems, Mobile strategy, Performance, Remaining issues, Removed code (+4 more)

### Community 117 - "Auctorio Multi-Tenant Client Integrations"
Cohesion: 0.15
Nodes (12): Auctorio Multi-Tenant Client Integrations, Current operational caveat, Destination contracts, Guía Programación TV, Notes, Operational sequence, Provisioning, Publishing credentials (+4 more)

### Community 118 - "Image Manifest"
Cohesion: 0.17
Nodes (11): 1. publisher-command-center, 2. search-led-newsroom, 3. multi-site-publishing-grid, 4. editorial-qa-review, 5. brand-content-program, 6. content-operations-showcase, Auctorio — Image Generation Log, Existing Images (Pre-Rework) (+3 more)

### Community 119 - "Auctorio Studio — Frontend Rebuild Audit (Phase 0)"
Cohesion: 0.17
Nodes (11): 10. Known constraints, 1. Current product architecture, 2. Current information architecture, 3. Functionality inventory (preserved, real), 4. Styling architecture — current state, 5. Application shell — current state, 6. Cross-cutting UX debt (measured), 7. Performance baseline (+3 more)

### Community 120 - "sitemap.ts"
Cohesion: 0.25
Nodes (13): DiscoveredSitemap, discoverSitemapsForSite(), fetchBounded(), normalizePageUrl(), parseRobotsTxt(), parseSitemapBody(), prisma, readLastmod() (+5 more)

### Community 121 - "Studio Simplification — Architecture Report"
Cohesion: 0.18
Nodes (10): 1. New authentication model, 2. Session cookie (BFF, `apps/studio-web/src/server.ts`), 3. Site scoping per request, 4. New Studio session view, 5. Navigation & routing, 6. Content workflow, 7. Backend additions, 8. Preserved production core (unchanged behavior) (+2 more)

### Community 122 - "Studio Simplification — Deletion Report"
Cohesion: 0.18
Nodes (10): Deleted components (5), Deleted pages (23), Deleted routes (28 old Studio routes removed; redirects installed), Deleted services / guards / utils, Login UI reduction, Merged pages, Metrics, Obsolete styles (+2 more)

### Community 123 - "Talkaris Screen Map"
Cohesion: 0.18
Nodes (10): Control, Dashboard, Estado de pantallas del cockpit editorial, Governance, Lectura del mapa, Mapa de navegación, Operations, Protección por permisos (+2 more)

### Community 124 - "Content AI Platform — Auctorio"
Cohesion: 0.18
Nodes (10): API expuesta, Arranque local, Conectar X / Instagram, Content AI Platform — Auctorio, Fiabilidad, Flujo editorial, Modo automatico, Modo de publicacion (dry-run) (+2 more)

### Community 125 - "Auctorio Studio — Frontend Information Architecture (Phase 1)"
Cohesion: 0.22
Nodes (8): 1. Product loop the UI must reinforce, 2. Studio navigation hierarchy, 3. Route responsibilities, 4. Global actions, 5. Cross-screen workflows, 6. Settings hierarchy, 7. Layout rules, Auctorio Studio — Frontend Information Architecture (Phase 1)

### Community 126 - "20260825000000_site_intelligence/migration.sql"
Cohesion: 0.39
Nodes (11): "editorial_plan_generation_attempts", "search_targets", "site_entities", "site_indexed_pages", "site_intelligence_profiles", "site_internal_links", "site_sitemaps", "site_topic_clusters" (+3 more)

### Community 127 - "AppToastHostComponent"
Cohesion: 0.40
Nodes (3): AppToastHostComponent, Component, ToastItem

### Community 128 - "production"
Cohesion: 0.25
Nodes (8): serve, production, budgets, buildTarget, outputHashing, builder, configurations, defaultConfiguration

### Community 129 - "Studio Web"
Cohesion: 0.25
Nodes (7): Comandos, Flujo soportado, Notas operativas, Que hace, Rutas principales, Studio Web, Variables necesarias

### Community 130 - "worker-scheduler.ts"
Cohesion: 0.60
Nodes (4): runSchedulerTick(), runSchedulerWorker(), claimDuePublications(), enqueuePublication()

### Community 132 - "qa.ts"
Cohesion: 0.47
Nodes (4): hasAtLeastWords(), runVersionQa(), QaCheck, QaReport

### Community 133 - "Auctorio → GuiaTV Production Acceptance Evidence"
Cohesion: 0.29
Nodes (6): Auctorio → GuiaTV Production Acceptance Evidence, Known residuals, Release identity, Reliability changes shipped in this pass, Test suite results, Workflow evidence (real services, real GuiaTV)

### Community 134 - "Auctorio Environment & Configuration Audit"
Cohesion: 0.29
Nodes (6): Auctorio Environment & Configuration Audit, Deployment reproducibility, Environment variable matrix, Fail-fast rules (implemented 2026-08-21), Migration verification (2026-08-21), Production runtime facts (verified)

### Community 135 - "Progreso del proyecto"
Cohesion: 0.29
Nodes (6): Estado actual, Implementado, Pendiente relevante, Progreso del proyecto, Pruebas automatizadas, Verificado

### Community 136 - "site-isolation.test.ts"
Cohesion: 0.40
Nodes (3): createFixture(), Fixture, prisma

### Community 141 - "architect"
Cohesion: 0.40
Nodes (5): extract-i18n, test, builder, architect, builder

### Community 142 - "AGENTS.md - Auctorio AI Agents"
Cohesion: 0.50
Nodes (3): AGENTS.md - Auctorio AI Agents, Available Agent Roles, Optimization Policy

## Knowledge Gaps
- **933 isolated node(s):** `StructuredGenerationOptions`, `StructuredGenerationResult`, `prisma`, `PlanningEvidence`, `StrategyMode` (+928 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **12 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `getPrismaClient()` connect `getPrismaClient` to `studio/auth.ts`, `social-connections.ts`, `routes-editorial.ts`, `worker-discovery.ts`, `site-isolation.test.ts`, `planner.ts`, `profile.ts`, `prisma.ts`, `publication.ts`, `social.ts`, `routes.ts`, `worker-publishing.ts`, `worker-social.ts`, `worker-image.ts`, `sha256`, `http-utils.ts`, `orchestration.ts`, `editorial-plan.ts`, `deps.ts`, `web-discovery.ts`, `source-quality.ts`, `crawler.ts`, `sitemap.ts`?**
  _High betweenness centrality (0.027) - this node is a cross-community bridge._
- **Why does `getNumberEnv()` connect `getNumberEnv` to `publishers.ts`, `worker-scheduler.ts`, `routes-editorial.ts`, `worker-discovery.ts`, `planner.ts`, `structured.ts`, `fetchUrl`, `topic-controller.ts`, `profile.ts`, `scraping/index.ts`, `social-provider.ts`, `publication.ts`, `getEnv`, `fetchWithTimeout`, `image.ts`, `worker-social.ts`, `worker-image.ts`, `social-publishers.ts`, `http-utils.ts`, `orchestration.ts`, `deps.ts`, `web-discovery.ts`, `crawler.ts`, `sitemap.ts`?**
  _High betweenness centrality (0.027) - this node is a cross-community bridge._
- **Why does `getEnv()` connect `getEnv` to `publishers.ts`, `studio/auth.ts`, `worker-scheduler.ts`, `social-connections.ts`, `worker-discovery.ts`, `planner.ts`, `structured.ts`, `fetchUrl`, `security.ts`, `scraping/index.ts`, `social-provider.ts`, `fetchWithTimeout`, `image.ts`, `routes.ts`, `worker-publishing.ts`, `worker-social.ts`, `worker-image.ts`, `social-publishers.ts`, `getNumberEnv`, `sha256`, `http-utils.ts`, `orchestration.ts`, `web-discovery.ts`?**
  _High betweenness centrality (0.018) - this node is a cross-community bridge._
- **What connects `StructuredGenerationOptions`, `StructuredGenerationResult`, `prisma` to the rest of the system?**
  _933 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `publishers.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.06202435312024353 - nodes in this community are weakly interconnected._
- **Should `studio/auth.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.04717530576587071 - nodes in this community are weakly interconnected._
- **Should `social-connections.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.14193548387096774 - nodes in this community are weakly interconnected._