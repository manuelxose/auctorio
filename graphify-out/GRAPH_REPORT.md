# Graph Report - auctorio  (2026-08-24)

## Corpus Check
- 232 files · ~193,999 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 2120 nodes · 5109 edges · 106 communities (92 shown, 14 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 26 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `6ff32cb6`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- PublisherContext
- studio/auth.ts
- routes.ts
- ContentWorkspacePageComponent
- studio.models.ts
- StudioApiService
- routes-editorial.ts
- registerStudioRoutes
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
- prisma.ts
- editorial.ts
- getMarketingPath
- compilerOptions
- scraping/index.ts
- login-page.component.ts
- settings-page.component.ts
- devDependencies
- dependencies
- dependencies.ts
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
- getPrismaClient
- LoginPageComponent
- verify-platform-credentials.ts
- ai/text.ts
- studio-web
- getNumberEnv
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
- publishers.ts
- studio-routes.test.ts
- security.ts
- ContentImage
- orchestration.ts
- qa.ts
- studio-ssr.test.ts
- ContentNewPageComponent
- smoke-editorial.cjs
- escapeXml
- package.json
- ContactPageComponent
- SourcesPageComponent
- worker-discovery.ts
- fastify.d.ts
- studio-workflow.spec.ts
- TecnoriaPublisher
- 20260824000000_social_connections_and_web_discovery/migration.sql
- cost-policy.ts
- forgot-password-page.component.ts
- reset-password-page.component.ts
- "content_sources"
- "publishing_accounts"
- "story_clusters"

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
- `createFixture()` --calls--> `sha256()`  [EXTRACTED]
  tests/studio-routes.test.ts → src/shared/utils/hash.ts
- `buildStudioTestServer()` --calls--> `registerStudioRoutes()`  [EXTRACTED]
  tests/studio-routes.test.ts → src/studio/routes.ts
- `main()` --calls--> `getPrismaClient()`  [EXTRACTED]
  scripts/grant-cross-site-access.ts → src/infrastructure/db/prisma.ts
- `main()` --calls--> `getPrismaClient()`  [EXTRACTED]
  scripts/set-tenant-status.ts → src/infrastructure/db/prisma.ts
- `main()` --calls--> `getPrismaClient()`  [EXTRACTED]
  scripts/qa-visual-login.ts → src/infrastructure/db/prisma.ts

## Import Cycles
- None detected.

## Communities (106 total, 14 thin omitted)

### Community 0 - "PublisherContext"
Cohesion: 0.20
Nodes (10): buildDryRunExternalId(), buildDryRunResult(), GenericWebhookPublisher, getDryRunDecision(), GuiaTvPublisher, resolveAssetUrl(), TalkarisPublisher, PublisherAdapter (+2 more)

### Community 1 - "studio/auth.ts"
Cohesion: 0.05
Nodes (77): main(), WORKSPACE_BOOTSTRAP, main(), AccountWithMemberships, applyMappedRoles(), buildApiKeyStudioSession(), buildHumanSession(), buildPermissionList() (+69 more)

### Community 2 - "routes.ts"
Cohesion: 0.06
Nodes (51): getContentTypeFromPath(), MIME_BY_EXTENSION, badRequest(), conflict(), errorBody(), getInternalSharedSecret(), INTERNAL_SECRET_HEADER, isOneOf() (+43 more)

### Community 3 - "ContentWorkspacePageComponent"
Cohesion: 0.06
Nodes (5): ProjectVersionDetail, StudioProjectDetailView, StudioSocialContent, ContentWorkspacePageComponent, Component

### Community 4 - "studio.models.ts"
Cohesion: 0.05
Nodes (36): AutomationStatus, CreateProjectPayload, CreateSitePayload, EditorialPlanItem, JsonRecord, ListProjectsFilters, ProjectGoal, PublicationExecutionState (+28 more)

### Community 5 - "StudioApiService"
Cohesion: 0.04
Nodes (9): AutomationPolicy, EditorialPlan, PaginatedResponse, PublicationChannel, StudioSession, AcceptInvitePageComponent, Component, StudioApiService (+1 more)

### Community 6 - "routes-editorial.ts"
Cohesion: 0.08
Nodes (49): writeAudit(), assertSafeAutomationPolicy(), pauseAutomation(), resumeAutomation(), sanitizePolicyInput(), updatePolicy(), listCalendarEvents(), listStoryClusters() (+41 more)

### Community 7 - "registerStudioRoutes"
Cohesion: 0.06
Nodes (44): queuePublication(), approveStudioPromptVersion(), createStudioPromptPreset(), createStudioPromptVersion(), listStudioPromptPresets(), toNullableJsonInput(), updateStudioPromptVersion(), enqueueWebsitePublication() (+36 more)

### Community 8 - "app.routes.ts"
Cohesion: 0.10
Nodes (30): AppEmptyStateComponent, Component, AppIconComponent, IconElement, ICONS, StudioIconName, Component, studioAuthGuard() (+22 more)

### Community 9 - "CalendarPageComponent"
Cohesion: 0.07
Nodes (6): CalendarEvent, StudioProjectSummary, CalendarPageComponent, Component, ContentListPageComponent, Component

### Community 10 - ""tenants""
Cohesion: 0.14
Nodes (39): "ai_audit", "content_image", "content_text", "facts", "jobs", "tenants", "topics", "asset_variants" (+31 more)

### Community 11 - "prompts.ts"
Cohesion: 0.12
Nodes (31): buildImagePrompt(), buildTextPrompt(), ImagePromptInput, TextPromptInput, TextPromptOutput, assignmentKeyForSite(), assignStudioPromptVersion(), buildImageContext() (+23 more)

### Community 12 - "src/server.ts"
Cohesion: 0.05
Nodes (27): STUDIO_BASE_PATH, angularApp, app, AuthStatePayload, backendBaseUrl, browserDistFolder, cookieKey, GlobalLoginResponse (+19 more)

### Community 13 - "planner.ts"
Cohesion: 0.09
Nodes (40): AUTOMATION_DEFAULTS, AutomationStatus, countChannelPublicationsToday(), EditorialSlot, generateEditorialSlots(), getAutomationStatus(), getChannelWindow(), getOrCreatePolicy() (+32 more)

### Community 14 - "topic.ts"
Cohesion: 0.11
Nodes (30): GenerateImageFromTextInput, GenerateImageFromTextOutput, generateImageFromTextUseCase(), GetContentImageInput, GetContentImageOutput, getContentImageUseCase(), GetContentTextInput, GetContentTextOutput (+22 more)

### Community 15 - "sources.ts"
Cohesion: 0.11
Nodes (35): fetchUrl(), getRobotsRules(), isHostAllowed(), isPrivateIp(), parseRobotsTxt(), validateScrapeUrl(), ApiSourceAdapter, asStringArray() (+27 more)

### Community 16 - "InboxPageComponent"
Cohesion: 0.13
Nodes (5): SourceItemStatus, StudioSourceItem, StudioStoryCluster, InboxPageComponent, Component

### Community 17 - "views.ts"
Cohesion: 0.12
Nodes (32): buildAssetPublicUrl(), listProjects(), buildReviewGate(), BuildReviewGateInput, countQaFailures(), countQaWarnings(), countWordsFromHtml(), ImageReadinessInput (+24 more)

### Community 18 - "AppConfirmDialogComponent"
Cohesion: 0.08
Nodes (14): App, appConfig, config, serverConfig, routes, serverRoutes, Component, AppConfirmDialogComponent (+6 more)

### Community 19 - "loginStudioAccountWithPassword"
Cohesion: 0.14
Nodes (24): acceptStudioInvitation(), completeLocalAccountLogin(), getStudioAccountByEmail(), getStudioAccountByGoogleSubject(), getStudioLoginOptions(), getStudioRequestAccessUrl(), hasEnabledProvider(), isLocalMembership() (+16 more)

### Community 20 - "marketing-content.ts"
Cohesion: 0.07
Nodes (31): BRAND_DESCRIPTION, BRAND_DOMAIN_OBJECTIVE, CONTACT_CONTENT, ContactContent, ExampleId, FAQ_ENTRIES, getHomeAssets(), getHomeExamples() (+23 more)

### Community 21 - "repositories.ts"
Cohesion: 0.08
Nodes (24): AiAudit, ContentStatus, ContentText, ContentTextType, Fact, FactSourceType, Job, JobStatus (+16 more)

### Community 22 - "topic-controller.ts"
Cohesion: 0.16
Nodes (24): getResultsUseCase(), nowIso(), getIdempotencyKey(), mapErrorCodeToStatus(), sendContentAccepted(), sendJobAccepted(), sendTopicCreated(), sendUseCaseError() (+16 more)

### Community 23 - "StudioPublication"
Cohesion: 0.12
Nodes (3): StudioPublication, PublicationsPageComponent, Component

### Community 24 - "prisma.ts"
Cohesion: 0.09
Nodes (20): hashApiKey(), main(), main(), ROLE_KEYS, asJson(), hashApiKey(), main(), TenantDefinition (+12 more)

### Community 25 - "editorial.ts"
Cohesion: 0.24
Nodes (13): assignSourceItemToCluster(), buildSemanticHash(), clampScore(), CoverageCheckResult, overlapRatio(), prisma, ScoreExplanationEntry, ScoreResult (+5 more)

### Community 26 - "getMarketingPath"
Cohesion: 0.15
Nodes (16): getAlternatePagePaths(), getAssetBySlug(), getLocalizedPageSeo(), getLocalizedUseCases(), getMarketingPath(), getUseCaseAlternatePaths(), getUseCasePath(), getUseCaseSeo() (+8 more)

### Community 27 - "compilerOptions"
Cohesion: 0.07
Nodes (27): dist, DOM, ES2022, node, node_modules, scripts/**/*.ts, src/**/*.ts, tests/**/*.ts (+19 more)

### Community 28 - "scraping/index.ts"
Cohesion: 0.15
Nodes (21): buildContentFromFields(), compactWhitespace(), enforceRateLimit(), ensureRobotsAllowed(), extractLink(), extractSelectors(), isPathAllowedByRobots(), lastRequestByHost (+13 more)

### Community 29 - "login-page.component.ts"
Cohesion: 0.33
Nodes (4): GoogleAccounts, GoogleCredentialResponse, StudioEffectiveTheme, StudioThemePreference

### Community 30 - "settings-page.component.ts"
Cohesion: 0.12
Nodes (7): AiUsageRow, StudioRoleSummary, StudioSiteSummary, StudioUserSummary, SettingsPageComponent, SettingsSection, Component

### Community 31 - "devDependencies"
Cohesion: 0.09
Nodes (23): @angular/build, @angular/cli, @angular/compiler-cli, devDependencies, @angular/build, @angular/cli, @angular/compiler-cli, jasmine-core (+15 more)

### Community 32 - "dependencies"
Cohesion: 0.09
Nodes (23): @angular/common, @angular/compiler, @angular/core, @angular/forms, @angular/platform-browser, @angular/platform-server, @angular/router, @angular/ssr (+15 more)

### Community 33 - "dependencies.ts"
Cohesion: 0.29
Nodes (8): RepositoryError, isUniqueViolation(), contentImageRepository, contentTextRepository, factRepository, jobRepository, topicRepository, jobQueue

### Community 34 - "publication.ts"
Cohesion: 0.13
Nodes (19): ALLOWED_TRANSITIONS, canTransition(), classifyPublicationError(), CreatePublicationInput, deletePublication(), failAttempt(), FailureClass, getPublication() (+11 more)

### Community 36 - "getEnv"
Cohesion: 0.17
Nodes (16): ApiEnvelope, assert(), call(), main(), PostShape, runAutomationWorker(), getBooleanEnv(), getEnv() (+8 more)

### Community 37 - "scripts"
Cohesion: 0.10
Nodes (20): scripts, bootstrap:studio-access, build, build:studio, dev:studio, serve:studio, start:api, start:worker:automation (+12 more)

### Community 38 - "producer.ts"
Cohesion: 0.24
Nodes (14): enqueueImageJob(), enqueuePublishingJob(), enqueueScrapingJob(), enqueueSocialJob(), enqueueTextJob(), getPublishingQueue(), getQueue(), queues (+6 more)

### Community 39 - "image.ts"
Cohesion: 0.10
Nodes (16): backoffDelay(), downloadBytesRobust(), ImageDownloadError, ImageDownloadErrorCode, ImageGenerationHandle, ImageGenerationInput, ImageGenerationResult, ImageProvider (+8 more)

### Community 40 - "public-shell.component.ts"
Cohesion: 0.16
Nodes (12): BRAND_SIGNATURE, BRAND_TAGLINE, getFooterResources(), getMarketingLocaleFromPath(), getMarketingNavigation(), getStudioLoginPath(), getUseCaseBySlug(), translateMarketingPath() (+4 more)

### Community 41 - "social.ts"
Cohesion: 0.10
Nodes (22): AuditActorType, AuditEntryInput, listAudit(), prisma, buildSocialPrompt(), extractHashtags(), extractJsonObject(), GeneratedSocialPiece (+14 more)

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
Cohesion: 0.20
Nodes (3): StudioMediaItem, MediaPageComponent, Component

### Community 47 - "dependencies"
Cohesion: 0.12
Nodes (17): cheerio, fast-xml-parser, fastify, google-auth-library, nodemailer, dependencies, bullmq, cheerio (+9 more)

### Community 48 - "worker-publishing.ts"
Cohesion: 0.16
Nodes (15): defaultDependencies, LoadedPublication, prisma, processPublishingJob(), PublishingDependencies, PublishingJobData, readTargetStatus(), resolvePublicationStatus() (+7 more)

### Community 49 - "SeoService"
Cohesion: 0.23
Nodes (3): MarketingShowcaseAsset, SeoService, Injectable

### Community 50 - "PublishingAccount"
Cohesion: 0.21
Nodes (3): PublishingAccount, ConnectionsPageComponent, Component

### Community 51 - "worker-social.ts"
Cohesion: 0.25
Nodes (13): prisma, processPublish(), processUnpublish(), runSocialWorker(), SocialGenerateJobData, SocialJobData, SocialPublishJobData, SocialUnpublishJobData (+5 more)

### Community 52 - "devDependencies"
Cohesion: 0.13
Nodes (15): @types/node, typescript, devDependencies, @playwright/test, prisma, ts-node, @types/node, @types/nodemailer (+7 more)

### Community 53 - "AppShellComponent"
Cohesion: 0.11
Nodes (4): AppPopoverComponent, Component, AppShellComponent, Component

### Community 54 - "getPrismaClient"
Cohesion: 0.14
Nodes (27): main(), getImageProvider(), getTextProvider(), createJob(), findJobByIdempotency(), markJobDone(), markJobFailed(), markJobProcessing() (+19 more)

### Community 55 - "LoginPageComponent"
Cohesion: 0.26
Nodes (4): LoginPageComponent, resolveReturnTo(), Component, ViewChild

### Community 56 - "verify-platform-credentials.ts"
Cohesion: 0.27
Nodes (11): Account, checkAuctorioLogin(), checkAuthEndpoint(), checkPublicSite(), CheckResult, Inventory, jsonRequest(), main() (+3 more)

### Community 57 - "ai/text.ts"
Cohesion: 0.24
Nodes (6): MockTextProvider, OpenAICompatibleTextProvider, TextGenerationInput, TextGenerationResult, TextProvider, TextUsage

### Community 58 - "studio-web"
Cohesion: 0.18
Nodes (11): extract-i18n, test, builder, studio-web, architect, prefix, projectType, root (+3 more)

### Community 59 - "getNumberEnv"
Cohesion: 0.18
Nodes (21): getNumberEnv(), fetchWithTimeout(), buildOAuthHeader(), dryRunResult(), igUrl(), InstagramCredentials, InstagramPublisherAdapterImpl, isDryRunEnabled() (+13 more)

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
Cohesion: 0.21
Nodes (5): CostPolicy, CostPolicyResult, JobQueue, UseCaseDependencies, costPolicyAdapter

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

### Community 77 - "publishers.ts"
Cohesion: 0.10
Nodes (21): asRecord(), DryRunDecision, filterGuiaTvRelatedPlatformKeys(), filterGuiaTvRelatedRouteKeys(), getFaqItems(), getMetadata(), getPublisher(), getStringArray() (+13 more)

### Community 78 - "studio-routes.test.ts"
Cohesion: 0.19
Nodes (8): tenantRepository, authPlugin(), buildServer(), startServer(), buildStudioTestServer(), createFixture(), Fixture, prisma

### Community 79 - "security.ts"
Cohesion: 0.11
Nodes (25): assignStudioRoleToUser(), createStudioRole(), ensureStudioRoles(), ensureTenantBootstrap(), ensureUniqueRoleKey(), getInternalStudioIdentityProviderBySlug(), getStudioIdentityProviderConfig(), listStudioRoles() (+17 more)

### Community 81 - "orchestration.ts"
Cohesion: 0.16
Nodes (22): buildDerivatives(), deriveVersion(), makeDerivative(), prisma, requestImageGenerationForVersion(), retryImageGeneration(), stripHtml(), syncImageResultToStudio() (+14 more)

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

### Community 89 - "SourcesPageComponent"
Cohesion: 0.19
Nodes (4): SourceType, StudioSource, SourcesPageComponent, Component

### Community 90 - "worker-discovery.ts"
Cohesion: 0.23
Nodes (11): DiscoveryTickResult, prisma, runDiscoveryTick(), runDiscoveryWorker(), scoreAndClusterItems(), scoreAndPromoteSourceItem(), fetchSourceNow(), getSourceAdapter() (+3 more)

### Community 98 - "TecnoriaPublisher"
Cohesion: 0.31
Nodes (3): readCredentialRef(), readJsonCredentials(), TecnoriaPublisher

### Community 99 - "20260824000000_social_connections_and_web_discovery/migration.sql"
Cohesion: 0.29
Nodes (11): "blocked_domains", "discovered_domains", "discovery_configs", "social_connection_sessions", "source_quality_profiles", "source_recommendations", "web_discovery_queries", "web_retrievals" (+3 more)

### Community 100 - "cost-policy.ts"
Cohesion: 0.43
Nodes (6): checkCostPolicy(), CostPolicyInput, CostPolicyResult, startOfDayUtc(), startOfMonthUtc(), toNumber()

## Knowledge Gaps
- **407 isolated node(s):** `HttpRequestOptions`, `JsonRecord`, `DryRunDecision`, `TecnoriaCredentials`, `InstagramCredentials` (+402 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **14 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `StudioApiService` connect `StudioApiService` to `ContentWorkspacePageComponent`, `studio.models.ts`, `forgot-password-page.component.ts`, `reset-password-page.component.ts`, `app.routes.ts`, `InboxPageComponent`, `PublishingAccount`, `StudioPublication`, `PublishingPageComponent`, `SourcesPageComponent`, `login-page.component.ts`, `settings-page.component.ts`?**
  _High betweenness centrality (0.035) - this node is a cross-community bridge._
- **Why does `getNumberEnv()` connect `getNumberEnv` to `PublisherContext`, `publication.ts`, `TecnoriaPublisher`, `cost-policy.ts`, `getEnv`, `producer.ts`, `image.ts`, `routes-editorial.ts`, `planner.ts`, `publishers.ts`, `sources.ts`, `getPrismaClient`, `topic-controller.ts`, `prisma.ts`, `ai/text.ts`, `worker-discovery.ts`, `scraping/index.ts`?**
  _High betweenness centrality (0.024) - this node is a cross-community bridge._
- **Why does `ContentWorkspacePageComponent` connect `ContentWorkspacePageComponent` to `app.routes.ts`, `PublishingAccount`?**
  _High betweenness centrality (0.022) - this node is a cross-community bridge._
- **What connects `HttpRequestOptions`, `JsonRecord`, `DryRunDecision` to the rest of the system?**
  _407 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `studio/auth.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.050543637966500146 - nodes in this community are weakly interconnected._
- **Should `routes.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.0632996632996633 - nodes in this community are weakly interconnected._
- **Should `ContentWorkspacePageComponent` be split into smaller, more focused modules?**
  _Cohesion score 0.06057692307692308 - nodes in this community are weakly interconnected._