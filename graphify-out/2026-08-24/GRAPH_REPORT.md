# Graph Report - auctorio  (2026-08-24)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 2105 nodes · 5090 edges · 95 communities (83 shown, 12 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 26 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `bf472a59`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- getNumberEnv
- studio/auth.ts
- routes.ts
- ContentWorkspacePageComponent
- studio.models.ts
- StudioApiService
- routes-editorial.ts
- repository.ts
- app.routes.ts
- CalendarPageComponent
- "tenants"
- prompts.ts
- src/server.ts
- planner.ts
- topic.ts
- sources.ts
- InboxPageComponent
- views.ts
- AppConfirmDialogComponent
- loginStudioAccountWithPassword
- marketing-content.ts
- repositories.ts
- topic-controller.ts
- StudioPublication
- getPrismaClient
- editorial.ts
- getMarketingPath
- compilerOptions
- scraping/index.ts
- AppContextService
- settings-page.component.ts
- devDependencies
- dependencies
- prisma.ts
- publication.ts
- EditorialPlanPageComponent
- getEnv
- scripts
- producer.ts
- image.ts
- public-shell.component.ts
- social.ts
- development
- options
- seo.service.ts
- MediaPageComponent
- AutomationPageComponent
- dependencies
- worker-publishing.ts
- SeoService
- PublishingAccount
- worker-social.ts
- devDependencies
- AppShellComponent
- worker-image.ts
- LoginPageComponent
- verify-platform-credentials.ts
- ai/text.ts
- studio-web
- AppPopoverComponent
- auctorio-chat-widget.component.ts
- AuctorioChatWidgetComponent
- PublishingPageComponent
- OverviewPageComponent
- ThemeService
- generate-marketing-images.mjs
- angular.json
- studio-web/package.json
- scripts
- shouldUseSecureCookie
- getInternalHeaders
- postInternalAuth
- deps.ts
- resolveStudioSession
- getRequestOrigin
- readSession
- cloudflare-cutover.sh
- live-guiatv-contract.ts
- hash.ts
- ContentImage
- ContentText
- qa.ts
- studio-ssr.test.ts
- ContentNewPageComponent
- smoke-editorial.cjs
- escapeXml
- package.json
- ContactPageComponent
- fastify.d.ts
- studio-workflow.spec.ts

## God Nodes (most connected - your core abstractions)
1. `StudioApiService` - 107 edges
2. `registerStudioRoutes()` - 94 edges
3. `getNumberEnv()` - 62 edges
4. `registerEditorialRoutes()` - 62 edges
5. `ContentWorkspacePageComponent` - 61 edges
6. `getEnv()` - 61 edges
7. `getPrismaClient()` - 55 edges
8. `writeAudit()` - 39 edges
9. `"tenants"` - 35 edges
10. `PublisherContext` - 32 edges

## Surprising Connections (you probably didn't know these)
- `main()` --calls--> `resolveTenantBySlug()`  [EXTRACTED]
  scripts/qa-visual-login.ts → src/studio/auth.ts
- `createFixture()` --calls--> `sha256()`  [EXTRACTED]
  tests/studio-routes.test.ts → src/shared/utils/hash.ts
- `main()` --calls--> `getPrismaClient()`  [EXTRACTED]
  scripts/qa-visual-login.ts → src/infrastructure/db/prisma.ts
- `buildStudioTestServer()` --calls--> `registerStudioRoutes()`  [EXTRACTED]
  tests/studio-routes.test.ts → src/studio/routes.ts
- `main()` --calls--> `getPrismaClient()`  [EXTRACTED]
  scripts/grant-cross-site-access.ts → src/infrastructure/db/prisma.ts

## Import Cycles
- None detected.

## Communities (95 total, 12 thin omitted)

### Community 0 - "getNumberEnv"
Cohesion: 0.05
Nodes (60): getNumberEnv(), fetchJson(), fetchWithTimeout(), HttpRequestOptions, JsonRecord, normalizeBody(), sleep(), asRecord() (+52 more)

### Community 1 - "studio/auth.ts"
Cohesion: 0.05
Nodes (92): main(), WORKSPACE_BOOTSTRAP, AccountWithMemberships, applyMappedRoles(), assignStudioRoleToUser(), buildApiKeyStudioSession(), buildHumanSession(), buildPermissionList() (+84 more)

### Community 2 - "routes.ts"
Cohesion: 0.06
Nodes (66): getContentTypeFromPath(), MIME_BY_EXTENSION, badRequest(), conflict(), errorBody(), getInternalSharedSecret(), INTERNAL_SECRET_HEADER, isOneOf() (+58 more)

### Community 3 - "ContentWorkspacePageComponent"
Cohesion: 0.06
Nodes (5): ProjectVersionDetail, StudioProjectDetailView, StudioSocialContent, ContentWorkspacePageComponent, Component

### Community 4 - "studio.models.ts"
Cohesion: 0.04
Nodes (41): AutomationStatus, CreateProjectPayload, CreateSitePayload, EditorialPlanItem, JsonRecord, ProjectGoal, PublicationExecutionState, PublicationState (+33 more)

### Community 5 - "StudioApiService"
Cohesion: 0.04
Nodes (10): AutomationPolicy, EditorialPlan, ListProjectsFilters, PaginatedResponse, PublicationChannel, SourceItemStatus, SourceType, StudioStoryCluster (+2 more)

### Community 6 - "routes-editorial.ts"
Cohesion: 0.08
Nodes (51): AuditActorType, AuditEntryInput, listAudit(), prisma, writeAudit(), UpdatePolicyInput, CalendarFilters, listCalendarEvents() (+43 more)

### Community 7 - "repository.ts"
Cohesion: 0.06
Nodes (53): buildDerivatives(), deriveVersion(), makeDerivative(), prisma, requestImageGenerationForVersion(), retryImageGeneration(), startProjectGeneration(), stripHtml() (+45 more)

### Community 8 - "app.routes.ts"
Cohesion: 0.12
Nodes (25): AppEmptyStateComponent, Component, AppIconComponent, IconElement, ICONS, StudioIconName, Component, StudioSite (+17 more)

### Community 9 - "CalendarPageComponent"
Cohesion: 0.07
Nodes (6): CalendarEvent, StudioProjectSummary, CalendarPageComponent, Component, ContentListPageComponent, Component

### Community 10 - ""tenants""
Cohesion: 0.14
Nodes (39): "ai_audit", "content_image", "content_text", "facts", "jobs", "tenants", "topics", "asset_variants" (+31 more)

### Community 11 - "prompts.ts"
Cohesion: 0.08
Nodes (41): buildImagePrompt(), buildTextPrompt(), ImagePromptInput, TextPromptInput, TextPromptOutput, approveStudioPromptVersion(), assignmentKeyForSite(), assignStudioPromptVersion() (+33 more)

### Community 12 - "src/server.ts"
Cohesion: 0.05
Nodes (27): STUDIO_BASE_PATH, angularApp, app, AuthStatePayload, backendBaseUrl, browserDistFolder, cookieKey, GlobalLoginResponse (+19 more)

### Community 13 - "planner.ts"
Cohesion: 0.10
Nodes (39): assertSafeAutomationPolicy(), AUTOMATION_DEFAULTS, AutomationStatus, countChannelPublicationsToday(), EditorialSlot, generateEditorialSlots(), getAutomationStatus(), getChannelWindow() (+31 more)

### Community 14 - "topic.ts"
Cohesion: 0.11
Nodes (30): GenerateImageFromTextInput, GenerateImageFromTextOutput, generateImageFromTextUseCase(), GetContentImageInput, GetContentImageOutput, getContentImageUseCase(), GetContentTextInput, GetContentTextOutput (+22 more)

### Community 15 - "sources.ts"
Cohesion: 0.12
Nodes (32): fetchUrl(), validateScrapeUrl(), ApiSourceAdapter, asStringArray(), AtomSourceAdapter, compact(), CreateSourceInput, deriveExternalId() (+24 more)

### Community 16 - "InboxPageComponent"
Cohesion: 0.10
Nodes (6): StudioSource, StudioSourceItem, InboxPageComponent, Component, SourcesPageComponent, Component

### Community 17 - "views.ts"
Cohesion: 0.11
Nodes (33): buildAssetPublicUrl(), listProjects(), mapQaState(), buildReviewGate(), BuildReviewGateInput, countQaFailures(), countQaWarnings(), countWordsFromHtml() (+25 more)

### Community 18 - "AppConfirmDialogComponent"
Cohesion: 0.08
Nodes (14): App, appConfig, config, serverConfig, routes, serverRoutes, Component, AppConfirmDialogComponent (+6 more)

### Community 19 - "loginStudioAccountWithPassword"
Cohesion: 0.11
Nodes (30): main(), acceptStudioInvitation(), completeLocalAccountLogin(), consumeStudioAccountToken(), getStudioAccountByEmail(), getStudioAccountByGoogleSubject(), getStudioLoginOptions(), getStudioRequestAccessUrl() (+22 more)

### Community 20 - "marketing-content.ts"
Cohesion: 0.07
Nodes (31): BRAND_DESCRIPTION, BRAND_DOMAIN_OBJECTIVE, CONTACT_CONTENT, ContactContent, ExampleId, FAQ_ENTRIES, getHomeAssets(), getHomeExamples() (+23 more)

### Community 21 - "repositories.ts"
Cohesion: 0.09
Nodes (22): AiAudit, ContentStatus, ContentTextType, Fact, FactSourceType, Job, JobStatus, JobType (+14 more)

### Community 22 - "topic-controller.ts"
Cohesion: 0.16
Nodes (25): createTopicUseCase(), getResultsUseCase(), nowIso(), getIdempotencyKey(), mapErrorCodeToStatus(), sendContentAccepted(), sendJobAccepted(), sendTopicCreated() (+17 more)

### Community 23 - "StudioPublication"
Cohesion: 0.12
Nodes (3): StudioPublication, PublicationsPageComponent, Component

### Community 24 - "getPrismaClient"
Cohesion: 0.11
Nodes (24): hashApiKey(), main(), main(), ROLE_KEYS, main(), asJson(), hashApiKey(), main() (+16 more)

### Community 25 - "editorial.ts"
Cohesion: 0.10
Nodes (29): DiscoveryTickResult, prisma, runDiscoveryTick(), runDiscoveryWorker(), scoreAndClusterItems(), normalizeText(), assignSourceItemToCluster(), buildSemanticHash() (+21 more)

### Community 26 - "getMarketingPath"
Cohesion: 0.15
Nodes (16): getAlternatePagePaths(), getAssetBySlug(), getLocalizedPageSeo(), getLocalizedUseCases(), getMarketingPath(), getUseCaseAlternatePaths(), getUseCasePath(), getUseCaseSeo() (+8 more)

### Community 27 - "compilerOptions"
Cohesion: 0.07
Nodes (27): dist, DOM, ES2022, node, node_modules, scripts/**/*.ts, src/**/*.ts, tests/**/*.ts (+19 more)

### Community 28 - "scraping/index.ts"
Cohesion: 0.13
Nodes (26): buildContentFromFields(), compactWhitespace(), enforceRateLimit(), ensureRobotsAllowed(), extractLink(), extractSelectors(), getRobotsRules(), isHostAllowed() (+18 more)

### Community 29 - "AppContextService"
Cohesion: 0.10
Nodes (10): studioAuthGuard(), studioRoleGuard(), NavItem, StudioSession, GoogleAccounts, GoogleCredentialResponse, AppContextService, Injectable (+2 more)

### Community 30 - "settings-page.component.ts"
Cohesion: 0.12
Nodes (7): AiUsageRow, StudioRoleSummary, StudioSiteSummary, StudioUserSummary, SettingsPageComponent, SettingsSection, Component

### Community 31 - "devDependencies"
Cohesion: 0.09
Nodes (23): @angular/build, @angular/cli, @angular/compiler-cli, devDependencies, @angular/build, @angular/cli, @angular/compiler-cli, jasmine-core (+15 more)

### Community 32 - "dependencies"
Cohesion: 0.09
Nodes (23): @angular/common, @angular/compiler, @angular/core, @angular/forms, @angular/platform-browser, @angular/platform-server, @angular/router, @angular/ssr (+15 more)

### Community 33 - "prisma.ts"
Cohesion: 0.26
Nodes (9): RepositoryError, isUniqueViolation(), contentImageRepository, contentTextRepository, factRepository, jobRepository, tenantRepository, topicRepository (+1 more)

### Community 34 - "publication.ts"
Cohesion: 0.13
Nodes (18): ALLOWED_TRANSITIONS, canTransition(), classifyPublicationError(), createPublication(), CreatePublicationInput, failAttempt(), FailureClass, getPublication() (+10 more)

### Community 36 - "getEnv"
Cohesion: 0.18
Nodes (14): getRedisConnectionOptions(), RedisConnectionOptions, runAutomationWorker(), runScrapingWorker(), ScrapeJobData, getBooleanEnv(), getEnv(), getJsonEnv() (+6 more)

### Community 37 - "scripts"
Cohesion: 0.10
Nodes (20): scripts, bootstrap:studio-access, build, build:studio, dev:studio, serve:studio, start:api, start:worker:automation (+12 more)

### Community 38 - "producer.ts"
Cohesion: 0.25
Nodes (13): enqueueImageJob(), enqueuePublishingJob(), enqueueScrapingJob(), enqueueSocialJob(), enqueueTextJob(), getPublishingQueue(), getQueue(), queues (+5 more)

### Community 39 - "image.ts"
Cohesion: 0.14
Nodes (11): backoffDelay(), downloadBytesRobust(), ImageDownloadError, ImageDownloadErrorCode, ImageGenerationHandle, ImageGenerationInput, ImageGenerationResult, ImageProvider (+3 more)

### Community 40 - "public-shell.component.ts"
Cohesion: 0.16
Nodes (12): BRAND_SIGNATURE, BRAND_TAGLINE, getFooterResources(), getMarketingLocaleFromPath(), getMarketingNavigation(), getStudioLoginPath(), getUseCaseBySlug(), translateMarketingPath() (+4 more)

### Community 41 - "social.ts"
Cohesion: 0.14
Nodes (18): PUBLICATION_STATES, buildSocialPrompt(), extractHashtags(), extractJsonObject(), GeneratedSocialPiece, INSTAGRAM_CAPTION_LIMIT, listSocialContent(), parseGeneratedSocial() (+10 more)

### Community 42 - "development"
Cohesion: 0.12
Nodes (17): build, serve, builder, configurations, defaultConfiguration, development, production, buildTarget (+9 more)

### Community 43 - "options"
Cohesion: 0.14
Nodes (17): options, assets, browser, outputMode, polyfills, security, server, ssr (+9 more)

### Community 44 - "seo.service.ts"
Cohesion: 0.21
Nodes (11): BRAND_NAME, getLocalizedFaqEntries(), MarketingLocale, TECNORIA_LINKS, ExamplesPageComponent, Component, FaqPageComponent, Component (+3 more)

### Community 45 - "MediaPageComponent"
Cohesion: 0.18
Nodes (3): StudioMediaItem, MediaPageComponent, Component

### Community 47 - "dependencies"
Cohesion: 0.12
Nodes (17): cheerio, fast-xml-parser, fastify, google-auth-library, nodemailer, dependencies, bullmq, cheerio (+9 more)

### Community 48 - "worker-publishing.ts"
Cohesion: 0.18
Nodes (12): defaultDependencies, LoadedPublication, prisma, processPublishingJob(), PublishingDependencies, PublishingJobData, readTargetStatus(), resolvePublicationStatus() (+4 more)

### Community 49 - "SeoService"
Cohesion: 0.23
Nodes (3): MarketingShowcaseAsset, SeoService, Injectable

### Community 50 - "PublishingAccount"
Cohesion: 0.21
Nodes (3): PublishingAccount, ConnectionsPageComponent, Component

### Community 51 - "worker-social.ts"
Cohesion: 0.22
Nodes (13): QUEUE_NAMES, prisma, processPublish(), processUnpublish(), runSocialWorker(), SocialGenerateJobData, SocialJobData, SocialPublishJobData (+5 more)

### Community 52 - "devDependencies"
Cohesion: 0.13
Nodes (15): @types/node, typescript, devDependencies, @playwright/test, prisma, ts-node, @types/node, @types/nodemailer (+7 more)

### Community 54 - "worker-image.ts"
Cohesion: 0.23
Nodes (13): getImageProvider(), buildModerationFallbackPrompt(), computeImageCost(), extensionFromContentType(), ImageJobData, isImageModerationRejection(), parseSize(), runImageWorker() (+5 more)

### Community 55 - "LoginPageComponent"
Cohesion: 0.26
Nodes (4): LoginPageComponent, resolveReturnTo(), Component, ViewChild

### Community 56 - "verify-platform-credentials.ts"
Cohesion: 0.27
Nodes (11): Account, checkAuctorioLogin(), checkAuthEndpoint(), checkPublicSite(), CheckResult, Inventory, jsonRequest(), main() (+3 more)

### Community 57 - "ai/text.ts"
Cohesion: 0.21
Nodes (8): getTextProvider(), MockTextProvider, OpenAICompatibleTextProvider, TextGenerationInput, TextGenerationResult, TextProvider, TextUsage, isProductionEnv()

### Community 58 - "studio-web"
Cohesion: 0.18
Nodes (11): extract-i18n, test, builder, studio-web, architect, prefix, projectType, root (+3 more)

### Community 60 - "auctorio-chat-widget.component.ts"
Cohesion: 0.24
Nodes (8): WidgetWindow, CHAT_WIDGET_API_BASE_URL, CHAT_WIDGET_BASE_URL, CHAT_WIDGET_BRAND_LABEL, CHAT_WIDGET_ENTRY_CONTEXT, CHAT_WIDGET_SITE_KEYS, normalizeOrigin(), STUDIO_ORIGIN

### Community 61 - "AuctorioChatWidgetComponent"
Cohesion: 0.29
Nodes (4): AuctorioChatWidgetComponent, Component, Inject, Input

### Community 62 - "PublishingPageComponent"
Cohesion: 0.28
Nodes (4): ProjectStatus, PublicationListItem, PublishingPageComponent, Component

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

### Community 72 - "deps.ts"
Cohesion: 0.15
Nodes (11): checkCostPolicy(), CostPolicyInput, CostPolicyResult, startOfDayUtc(), startOfMonthUtc(), toNumber(), CostPolicy, CostPolicyResult (+3 more)

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

### Community 77 - "live-guiatv-contract.ts"
Cohesion: 0.47
Nodes (5): ApiEnvelope, assert(), call(), main(), PostShape

### Community 78 - "hash.ts"
Cohesion: 0.48
Nodes (3): authPlugin(), buildServer(), startServer()

### Community 82 - "qa.ts"
Cohesion: 0.47
Nodes (4): hasAtLeastWords(), runVersionQa(), QaCheck, QaReport

### Community 83 - "studio-ssr.test.ts"
Cohesion: 0.47
Nodes (4): getFreePort(), MockBackend, startStudioServer(), waitForServer()

### Community 85 - "smoke-editorial.cjs"
Cohesion: 0.60
Nodes (4): call(), crypto, main(), signedHeaders()

### Community 86 - "escapeXml"
Cohesion: 0.50
Nodes (4): buildImageSitemapXml(), buildLocalizedSitemapXml(), buildSitemapIndexXml(), escapeXml()

### Community 87 - "package.json"
Cohesion: 0.50
Nodes (3): name, private, version

## Knowledge Gaps
- **407 isolated node(s):** `HttpRequestOptions`, `JsonRecord`, `DryRunDecision`, `TecnoriaCredentials`, `InstagramCredentials` (+402 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **12 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `ContentWorkspacePageComponent` connect `ContentWorkspacePageComponent` to `app.routes.ts`, `PublishingAccount`?**
  _High betweenness centrality (0.027) - this node is a cross-community bridge._
- **Why does `StudioApiService` connect `StudioApiService` to `ContentWorkspacePageComponent`, `studio.models.ts`, `app.routes.ts`, `MediaPageComponent`, `InboxPageComponent`, `PublishingAccount`, `StudioPublication`, `PublishingPageComponent`, `AppContextService`, `settings-page.component.ts`?**
  _High betweenness centrality (0.024) - this node is a cross-community bridge._
- **Why does `getNumberEnv()` connect `getNumberEnv` to `publication.ts`, `getEnv`, `producer.ts`, `image.ts`, `deps.ts`, `planner.ts`, `sources.ts`, `worker-image.ts`, `topic-controller.ts`, `getPrismaClient`, `ai/text.ts`, `scraping/index.ts`, `editorial.ts`?**
  _High betweenness centrality (0.024) - this node is a cross-community bridge._
- **What connects `HttpRequestOptions`, `JsonRecord`, `DryRunDecision` to the rest of the system?**
  _407 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `getNumberEnv` be split into smaller, more focused modules?**
  _Cohesion score 0.05324967824967825 - nodes in this community are weakly interconnected._
- **Should `studio/auth.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.04746563573883161 - nodes in this community are weakly interconnected._
- **Should `routes.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.057902973395931145 - nodes in this community are weakly interconnected._