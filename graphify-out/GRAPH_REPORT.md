# Graph Report - auctorio  (2026-09-02)

## Corpus Check
- 447 files · ~386,656 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 5023 nodes · 12140 edges · 228 communities (189 shown, 39 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 39 edges (avg confidence: 0.84)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `054f238c`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- studio.models.ts
- publishers.ts
- StudioApiService
- app.routes.ts
- provider-cache.ts
- sha256
- routes-editorial.ts
- fetchWithTimeout
- "tenants"
- getEnv
- intelligence-phase3.test.ts
- api.ts
- site-relevance.ts
- AppShellComponent
- queue-ops.ts
- editorial.ts
- source-registry.test.ts
- orchestration.ts
- prisma.ts
- sources.ts
- EditorialPlanPageComponent
- routes.ts
- ConnectionsPageComponent
- prompts.ts
- editorial-plan-schema.ts
- intelligence-report.ts
- routes-intelligence.ts
- src/server.ts
- Auctorio — Milestones
- AUCTORIO MASTER ROADMAP
- social-publishers.ts
- 4. Componentes
- marketing-content.ts
- source-registry.ts
- Auctorio Design System
- metrics.ts
- getPrismaClient
- routes-connectors.ts
- limiter.ts
- repository.ts
- StudioPublication
- ConnectionWizardPageComponent
- Auctorio Admin Redesign
- Auctorio Product Architecture
- enrichment-providers.ts
- Talkaris Admin Redesign
- scraping/index.ts
- EditorialEnginePageComponent
- InboxPageComponent
- worker-publishing.ts
- repositories.ts
- extraction.ts
- editorial-engine.test.ts
- pipeline.ts
- SourcesPageComponent
- topic-controller.ts
- ContentWorkspacePageComponent
- editorial-qa.ts
- tmdb.ts
- structuredEvent
- connectors/verification.ts
- fact-safety.ts
- writer-prompt.ts
- AppConfirmDialogComponent
- CalendarPageComponent
- compilerOptions
- Auctorio — SEO Architecture
- publication.ts
- 2. Mapa objetivo de rutas
- planner.ts
- qa.ts
- Auctorio Web — Rework Audit & Delivery Report
- AuRichEditorComponent
- getMarketingPath
- SettingsPageComponent
- ActivityPageComponent
- Arquitectura Tecnica del Backend de Generacion de Contenido con IA (SEO e Instagram)
- scripts
- topic.ts
- automation.ts
- brief-builder.ts
- orchestrator.ts
- devDependencies
- dependencies
- WebIntelligenceProvider
- Talkaris Product Architecture
- movie-tv/plugin.ts
- quality-repair.ts
- adapters/http.ts
- connectors/registry.ts
- editorial-engine/types.ts
- profile.ts
- OperationsPageComponent
- deps.ts
- image.ts
- structured.ts
- AUCTORIO REBUILD STATUS
- crawler.ts
- writer-provider.ts
- story-clustering.ts
- notifications.ts
- social.ts
- web-discovery.ts
- AutomationPageComponent
- source-quality.ts
- getNumberEnv
- web-intelligence.ts
- MediaPageComponent
- dependencies
- publishers.test.ts
- options
- SeoService
- editorial-engine-fixtures.ts
- worker-scheduler.ts
- Auctorio Studio — Design System (Phase 2)
- AUCTORIO — PHASE 5 FINAL PRODUCTION REPORT
- InMemoryResilienceStore
- intelligence-settings.ts
- 1. Universal connection installer
- 3. Architecture decisions
- Auctorio — Universal Connection Installer, Job Center, Notifications and UX Polish
- site-editorial-profile.ts
- "quality_repair_attempts"
- public-shell.component.ts
- LoginPageComponent
- Auctorio Studio — Frontend Rebuild Report
- Auctorio Multi-Tenant Client Integrations
- devDependencies
- studio/auth.ts
- Injectable
- "automation_policies"
- CLAUDE.md - Auctorio Agent Guide
- Image Manifest
- use-case-detail-page.component.ts
- SiteIntelligencePageComponent
- SseService
- CLAUDE.md - Auctorio Agent Guide
- Auctorio Studio — Frontend Rebuild Audit (Phase 0)
- verify-platform-credentials.ts
- Studio Simplification — Architecture Report
- Studio Simplification — Deletion Report
- Talkaris Screen Map
- Content AI Platform — Auctorio
- AuctorioChatWidgetComponent
- OverviewPageComponent
- producer.ts
- discovery-planner.ts
- development
- PublishingPageComponent
- ThemeService
- Auctorio SEO Engine V2 — Architecture & Operator Notes (M16–M22)
- Auctorio Source Registry Architecture (Phase 2)
- Auctorio Studio — Frontend Information Architecture (Phase 1)
- cleanup-seeded-connections.ts
- generate-marketing-images.mjs
- content-intelligence.test.ts
- angular.json
- production
- studio-web/package.json
- scripts
- Studio Web
- quality-gate.ts
- autopilot-golden-path.spec.ts
- cost-budgets.ts
- Auctorio → GuiaTV Production Acceptance Evidence
- Auctorio Environment & Configuration Audit
- Progreso del proyecto
- internal-linking.ts
- studio-web
- AppToastHostComponent
- quality-repair.test.ts
- Auctorio — Source Support Matrix
- cloudflare-cutover.sh
- qa-visual-installer.mjs
- studio-ssr.test.ts
- AGENTS.md - Auctorio AI Agents
- AGENTS.md - Auctorio AI Agents
- architect
- runQualityRepairCycle
- ContentNewPageComponent
- ai/text.ts
- smoke-editorial.cjs
- getImageSitemapEntries
- connection-installer.spec.ts
- guiatv-seo-golden-path.spec.ts
- production-journey.spec.ts
- package.json
- fastify.d.ts
- agents/architect.md
- agents/backend.md
- agents/database.md
- agents/devops.md
- agents/frontend.md
- agents/performance.md
- agents/qa.md
- agents/reviewer.md
- agents/security.md
- agents/ux-ui.md
- 20260829-165324/architect.md
- 20260829-165324/backend.md
- 20260829-165324/database.md
- 20260829-165324/devops.md
- 20260829-165324/frontend.md
- orchestrator.md
- 20260829-165324/performance.md
- 20260829-165324/POLICY.md
- 20260829-165324/qa.md
- 20260829-165324/reviewer.md
- 20260829-165324/security.md
- seo.md
- 20260829-165324/ux-ui.md
- .agentic/POLICY.md
- zone.js
- karma
- karma-coverage
- studio-workflow.spec.ts

## God Nodes (most connected - your core abstractions)
1. `StudioApiService` - 198 edges
2. `getNumberEnv()` - 135 edges
3. `getPrismaClient()` - 124 edges
4. `getEnv()` - 119 edges
5. `registerStudioRoutes()` - 116 edges
6. `writeAudit()` - 84 edges
7. `structuredEvent()` - 82 edges
8. `registerEditorialRoutes()` - 72 edges
9. `ContentWorkspacePageComponent` - 71 edges
10. `"tenants"` - 71 edges

## Surprising Connections (you probably didn't know these)
- `createFixture()` --calls--> `sha256()`  [EXTRACTED]
  tests/quality-repair.test.ts → src/shared/utils/hash.ts
- `ingestAndScore()` --calls--> `upsertSourceItem()`  [EXTRACTED]
  tests/intelligence-phase3.test.ts → src/studio/sources.ts
- `makeItem()` --calls--> `emptyDiscoveredItem()`  [EXTRACTED]
  tests/intelligence-phase3.test.ts → src/studio/adapters/normalize.ts
- `open()` --calls--> `getRedisConnectionOptions()`  [EXTRACTED]
  scripts/queue-ops.ts → src/infrastructure/queue/redis.ts
- `clearQueue()` --calls--> `getRedisConnectionOptions()`  [EXTRACTED]
  tests/phase5-operations.test.ts → src/infrastructure/queue/redis.ts

## Import Cycles
- None detected.

## Communities (228 total, 39 thin omitted)

### Community 0 - "studio.models.ts"
Cohesion: 0.02
Nodes (70): AutomationRecoveryItem, BlockedDomain, ConfigSchemaField, ConnectorAuthMethodView, ConnectorCapabilitiesResponse, ConnectorView, CreateProjectPayload, CreateSitePayload (+62 more)

### Community 1 - "publishers.ts"
Cohesion: 0.11
Nodes (23): getBooleanEnv(), loadActiveInstallationForSite(), ALLOWED_ATTRIBUTES, ALLOWED_TAGS, isSafeUrl(), sanitizeEditorialHtml(), asRecord(), buildDryRunExternalId() (+15 more)

### Community 2 - "StudioApiService"
Cohesion: 0.02
Nodes (10): AutomationPolicy, NotificationPreference, SocialConnectionSession, StudioEditorialProfile, StudioEnrichmentProvider, StudioIntelligenceSettings, StudioMuteRule, StudioSession (+2 more)

### Community 3 - "app.routes.ts"
Cohesion: 0.07
Nodes (45): AppEmptyStateComponent, Component, AppIconComponent, IconElement, ICONS, StudioIconName, Component, studioAuthGuard() (+37 more)

### Community 4 - "provider-cache.ts"
Cohesion: 0.08
Nodes (28): EnrichmentProviderAdapter, DEFAULT_PROVIDER_PRECEDENCE, EnrichmentCategory, EnrichmentOutcome, prisma, ProviderEngine, ProviderEngineContext, ttlForCategory() (+20 more)

### Community 5 - "sha256"
Cohesion: 0.06
Nodes (28): main(), closeProducerQueues(), sha256(), createTenant(), prisma, createWorkspace(), prisma, createFixture() (+20 more)

### Community 6 - "routes-editorial.ts"
Cohesion: 0.05
Nodes (85): main(), MOVIE_SOURCES, prisma, TRUNCATE_TABLES, verifyTruncateSafety(), AuditActorType, listAudit(), prisma (+77 more)

### Community 7 - "fetchWithTimeout"
Cohesion: 0.06
Nodes (38): pkceChallenge(), fetchJson(), fetchWithTimeout(), HttpRequestOptions, JsonRecord, normalizeBody(), sleep(), AyrshareSocialProvider (+30 more)

### Community 8 - ""tenants""
Cohesion: 0.06
Nodes (77): "ai_audit", "content_image", "content_text", "facts", "jobs", "tenants", "topics", "asset_variants" (+69 more)

### Community 9 - "getEnv"
Cohesion: 0.06
Nodes (63): ApiEnvelope, assert(), call(), main(), PostShape, QUEUE_NAMES, buildPublishInput(), LoadedPublication (+55 more)

### Community 10 - "intelligence-phase3.test.ts"
Cohesion: 0.07
Nodes (45): setMovieTvProviderEngine(), refreshClusterAggregates(), CANDIDATE_WEIGHTS, CandidateComponentKey, CandidateScoreInput, CandidateScoreResult, clamp01(), scoreCandidate() (+37 more)

### Community 11 - "api.ts"
Cohesion: 0.14
Nodes (29): ApiAdapter, AtomAdapter, GraphqlAdapter, HtmlAdapter, HtmlListingAdapter, fetchSourceHttp(), getDomainThrottle(), robotsAllows() (+21 more)

### Community 12 - "site-relevance.ts"
Cohesion: 0.11
Nodes (24): EditorialPlanningContext, PlanningEvidence, PlanningStrategy, prisma, EditorialPlanBriefV2, SearchIntent, SiteIntelligenceProfileSummary, CannibalizationVerdict (+16 more)

### Community 13 - "AppShellComponent"
Cohesion: 0.06
Nodes (7): AppPopoverComponent, Component, AppShellComponent, Component, StudioNotification, NotificationsPageComponent, Component

### Community 14 - "queue-ops.ts"
Cohesion: 0.26
Nodes (12): ALL_QUEUES, clean(), health(), inspect(), main(), open(), pause(), prisma (+4 more)

### Community 15 - "editorial.ts"
Cohesion: 0.10
Nodes (29): DiscoveryTickResult, notifyBrokenSources(), prisma, runDiscoveryTick(), runDiscoveryWorker(), scoreAndClusterItems(), assignSourceItemToCluster(), buildSemanticHash() (+21 more)

### Community 16 - "source-registry.test.ts"
Cohesion: 0.08
Nodes (53): BrowserFetchOptions, BrowserHandle, BrowserPage, fetchHtmlWithBrowser(), parseApiItems(), readField(), resolvePath(), categoryValues() (+45 more)

### Community 17 - "orchestration.ts"
Cohesion: 0.15
Nodes (25): asRecord(), buildDerivatives(), deriveVersion(), makeDerivative(), prisma, readNumber(), readString(), requestImageGenerationForVersion() (+17 more)

### Community 18 - "prisma.ts"
Cohesion: 0.32
Nodes (7): RepositoryError, isUniqueViolation(), contentImageRepository, contentTextRepository, factRepository, jobRepository, topicRepository

### Community 19 - "sources.ts"
Cohesion: 0.10
Nodes (33): ListingSourceConfig, buildItemContentHash(), buildNormalizedTitleHash(), normalizeTitleForFingerprint(), getSourceAdapter(), registerSourceAdapter(), beginDiscoveryRun(), DiscoveryMetrics (+25 more)

### Community 20 - "EditorialPlanPageComponent"
Cohesion: 0.06
Nodes (3): EditorialPlan, EditorialPlanPageComponent, Component

### Community 21 - "routes.ts"
Cohesion: 0.05
Nodes (73): getContentTypeFromPath(), MIME_BY_EXTENSION, errorBody(), getInternalSharedSecret(), INTERNAL_SECRET_HEADER, parseJsonObjectField(), parsePermissionList(), readSignedStudioContext() (+65 more)

### Community 22 - "ConnectionsPageComponent"
Cohesion: 0.09
Nodes (6): ConnectorInstallation, ConnectorKind, SocialConnection, SocialSetupInfo, ConnectionsPageComponent, Component

### Community 23 - "prompts.ts"
Cohesion: 0.09
Nodes (37): buildImagePrompt(), buildTextPrompt(), ImagePromptInput, TextPromptInput, TextPromptOutput, wrapUntrustedContent(), buildImageContext(), buildPromptPreview() (+29 more)

### Community 24 - "editorial-plan-schema.ts"
Cohesion: 0.07
Nodes (27): briefItemSchema, CANNIBALIZATION_RISKS, CannibalizationRisk, channelSchema, CONTENT_FORMATS, ContentFormat, contentTypeSchema, EDITORIAL_PLAN_PROMPT_VERSION (+19 more)

### Community 25 - "intelligence-report.ts"
Cohesion: 0.13
Nodes (22): main(), prisma, runSimulation(), SIM_ITEMS, SimItem, SimProvider, createProviderCacheStats(), resetProviderRateWindows() (+14 more)

### Community 26 - "routes-intelligence.ts"
Cohesion: 0.08
Nodes (62): listAdapterTypes(), upsertCostBudget(), getDiscoveryMetrics(), getMovieTvProviderEngine(), getGenerationDetail(), listGenerations(), listStoryClusters(), getImdbProvider() (+54 more)

### Community 27 - "src/server.ts"
Cohesion: 0.04
Nodes (65): angularApp, app, AuthStatePayload, backendBaseUrl, browserDistFolder, buildProxySignature(), buildRedirectUri(), clearAuthStateCookie() (+57 more)

### Community 28 - "Auctorio — Milestones"
Cohesion: 0.05
Nodes (40): Auctorio — Milestones, Known non-blocking residuals, Known non-blocking residuals (unchanged), M0 — Repository Intelligence ✅, M10 — Golden Path ✅ (GuiaTV) / ✅ (Tecnoria — 2026-08-25), M11 — Cross-Tenant Regression 🟡, M12 — UX/UI Enterprise Rebuild ✅, M13 — Realtime, Reliability, Observability 🟡 (+32 more)

### Community 29 - "AUCTORIO MASTER ROADMAP"
Cohesion: 0.05
Nodes (39): Acceptance criteria, Acceptance criteria, Acceptance criteria, Acceptance criteria, Acceptance criteria, Acceptance criteria, Acceptance criteria, Acceptance criteria (+31 more)

### Community 30 - "social-publishers.ts"
Cohesion: 0.16
Nodes (20): isProductionEnv(), buildOAuthHeader(), dryRunResult(), igUrl(), InstagramCredentials, InstagramPublisherAdapterImpl, isDryRunEnabled(), percentEncode() (+12 more)

### Community 31 - "4. Componentes"
Cohesion: 0.05
Nodes (38): 1. Visual direction, 2. Tokens, 3. Layout primitives, 4. Componentes, 5. Interaction rules, 6. Semantica del sistema, 7. Component inventory real, 8. Proximos componentes recomendados (+30 more)

### Community 32 - "marketing-content.ts"
Cohesion: 0.07
Nodes (38): WidgetWindow, BRAND_DESCRIPTION, BRAND_DOMAIN_OBJECTIVE, BRAND_TAGLINE, CHAT_WIDGET_API_BASE_URL, CHAT_WIDGET_BASE_URL, CHAT_WIDGET_BRAND_LABEL, CHAT_WIDGET_ENTRY_CONTEXT (+30 more)

### Community 33 - "source-registry.ts"
Cohesion: 0.13
Nodes (19): main(), MatrixRow, pad(), verifyFeedCandidate(), MOVIE_TV_EN_PACK, EnrichmentProviderSeed, SourcePackDefinition, SourcePackEntry (+11 more)

### Community 34 - "Auctorio Design System"
Cohesion: 0.06
Nodes (35): 10. Accesibilidad, 11. Inventario de componentes para implementacion, 12. Regla final, 1. Direccion visual, 2. Principios del sistema, 3.1 Foundation tokens, 3.2 Semantic tokens, 3.3 Typography (+27 more)

### Community 35 - "metrics.ts"
Cohesion: 0.22
Nodes (9): Counters, Gauges, MetricsSnapshot, startedAt, startMetricsLogging(), authPlugin(), buildRateLimiter(), buildServer() (+1 more)

### Community 36 - "getPrismaClient"
Cohesion: 0.08
Nodes (41): hashApiKey(), main(), main(), ROLE_KEYS, asJson(), FIXTURE_SITES, hashApiKey(), main() (+33 more)

### Community 37 - "routes-connectors.ts"
Cohesion: 0.15
Nodes (28): assertCanTransition(), cancelInstallation(), canTransition(), clearInstallationCredentials(), createInstallation(), deleteInstallationDraft(), getInstallation(), INSTALLATION_STATES (+20 more)

### Community 38 - "limiter.ts"
Cohesion: 0.12
Nodes (8): DEFAULT_OPTIONS, DEFAULT_POLICY, DomainEntry, DomainThrottle, DomainThrottleOptions, SourceEntry, SourceRateLimiter, SourceRateLimitPolicy

### Community 39 - "repository.ts"
Cohesion: 0.05
Nodes (62): isAutomaticApprovalQualityReady(), createVersion(), getSiteById(), listProjects(), mapPublicationJob(), mapQaState(), prisma, readPublicationTargetStatus() (+54 more)

### Community 40 - "StudioPublication"
Cohesion: 0.11
Nodes (5): PublicationChannel, PublicationState, StudioPublication, PublicationsPageComponent, Component

### Community 42 - "Auctorio Admin Redesign"
Cohesion: 0.06
Nodes (34): 10. Reglas de UX de Auctorio, 11. Resultado esperado, 1. Objetivo, 2. Principios rectores, 3. Nueva arquitectura del panel, 4. Shell de producto, 5. Dashboard rediseñado, 6.1 Editorial Pipeline Visual (+26 more)

### Community 43 - "Auctorio Product Architecture"
Cohesion: 0.06
Nodes (34): 10. North star, 1. Resumen ejecutivo, 2. Fuentes auditadas, 3.1 Frontend actual, 3.2 API actual, 3.3 Runtime actual, 3. Arquitectura actual del sistema, 4.1 Entidades reales (+26 more)

### Community 44 - "enrichment-providers.ts"
Cohesion: 0.23
Nodes (14): resolveListingConfig(), readConfigObject(), BASE_ALLOWED_SECRET_REFS, buildProviderRequest(), CreateEnrichmentProviderInput, credentialsConfigured(), getEnrichmentProvider(), listEnrichmentProviders() (+6 more)

### Community 45 - "Talkaris Admin Redesign"
Cohesion: 0.06
Nodes (32): 10. Resultado de producto, 1. Objetivo del rediseño, 2. Principios de producto, 3. Nueva arquitectura del sidebar, 4. Pantallas rediseñadas, 5. Auth architecture implementada, 6. RBAC model, 7. Modelo mental (+24 more)

### Community 46 - "scraping/index.ts"
Cohesion: 0.11
Nodes (31): buildContentFromFields(), compactWhitespace(), enforceRateLimit(), ensureRobotsAllowed(), extractLink(), extractSelectors(), fetchUrl(), getRobotsRules() (+23 more)

### Community 47 - "EditorialEnginePageComponent"
Cohesion: 0.10
Nodes (6): StudioFactLicense, StudioGenerationDetail, StudioGenerationSummary, StudioStoryCluster, EditorialEnginePageComponent, Component

### Community 48 - "InboxPageComponent"
Cohesion: 0.10
Nodes (5): SourceItemStatus, StudioSourceItem, StudioStoryDetail, InboxPageComponent, Component

### Community 49 - "worker-publishing.ts"
Cohesion: 0.14
Nodes (17): defaultDependencies, LoadedPublication, prisma, processPublishingJob(), PublishingDependencies, PublishingJobData, readTargetStatus(), resolvePublicationStatus() (+9 more)

### Community 50 - "repositories.ts"
Cohesion: 0.07
Nodes (27): AiAudit, ContentImage, ContentStatus, ContentText, ContentTextType, Fact, FactSourceType, Job (+19 more)

### Community 51 - "extraction.ts"
Cohesion: 0.15
Nodes (18): classifyCapitalizedPhrase(), collectPhrases(), extractEntitiesFromText(), extractionCanonicalKey(), ExtractionInput, ExtractionOptions, extractQuotedWorks(), isCapitalizedWord() (+10 more)

### Community 52 - "editorial-engine.test.ts"
Cohesion: 0.13
Nodes (17): setClassifierOverride(), evaluatePublicationGates(), resolveGatesConfig(), clampText(), extractJsonObject(), parseWriterOutput(), stripHtml(), setArticleWriterFactory() (+9 more)

### Community 53 - "pipeline.ts"
Cohesion: 0.09
Nodes (34): registerMovieTvPlugin(), getDomainPlugin(), listDomainPlugins(), registerDomainPlugin(), registry, ProviderCacheStats, ItemEntityRow, linkItemEntity() (+26 more)

### Community 54 - "SourcesPageComponent"
Cohesion: 0.08
Nodes (5): SourceRecommendation, StudioFeedCandidate, StudioSource, SourcesPageComponent, Component

### Community 55 - "topic-controller.ts"
Cohesion: 0.17
Nodes (23): nowIso(), getIdempotencyKey(), mapErrorCodeToStatus(), sendContentAccepted(), sendJobAccepted(), sendTopicCreated(), sendUseCaseError(), generateImageFromText() (+15 more)

### Community 56 - "ContentWorkspacePageComponent"
Cohesion: 0.05
Nodes (5): ProjectVersionDetail, StudioSocialContent, ContentWorkspacePageComponent, strOf(), Component

### Community 57 - "editorial-qa.ts"
Cohesion: 0.12
Nodes (28): addFinding(), DATE_PATTERN, DimensionAccumulator, extractDates(), extractYears(), NAME_STOPWORDS, NEWS_TYPES, normalize() (+20 more)

### Community 58 - "tmdb.ts"
Cohesion: 0.10
Nodes (18): EnrichmentLookupInput, EnrichmentLookupResult, EnrichmentPayload, providerGetJson(), ProviderUnavailableError, yearFromDate(), IMDB_PROVIDER_KEY, ImdbProvider (+10 more)

### Community 59 - "structuredEvent"
Cohesion: 0.08
Nodes (47): failOperationForJob(), JobDataWithOperation, markOperationStartedForJob(), ConnectionDependencies, ConnectionJobData, defaultDependencies, prisma, processConnectionJob() (+39 more)

### Community 60 - "connectors/verification.ts"
Cohesion: 0.13
Nodes (26): detectCms(), DiscoveredAuthOption, discoverWebsite(), extractMetaContent(), isPrivateIpLiteral(), normalizeDestinationUrl(), PROBE_HEADERS, probeEndpoint() (+18 more)

### Community 61 - "fact-safety.ts"
Cohesion: 0.18
Nodes (15): buildFactLicenses(), buildFactSafetyReport(), CONFLICT_SENSITIVE_KEYS, COPYRIGHT_CUES, FactSafetyContext, FactSafetyReport, hasCopyrightWarningCues(), HIGH_SENSITIVITY_FACT_KEYS (+7 more)

### Community 62 - "writer-prompt.ts"
Cohesion: 0.10
Nodes (27): renderBriefForWriter(), renderStructureLines(), ATTRIBUTION, CONCLUSION, CONTEXT, getStructureSpec(), LEAD_INVERTED_PYRAMID, renderStructureSpec() (+19 more)

### Community 63 - "AppConfirmDialogComponent"
Cohesion: 0.11
Nodes (11): App, appConfig, config, serverConfig, routes, serverRoutes, Component, AppConfirmDialogComponent (+3 more)

### Community 64 - "CalendarPageComponent"
Cohesion: 0.06
Nodes (6): CalendarEvent, StudioProjectSummary, CalendarPageComponent, Component, ContentListPageComponent, Component

### Community 65 - "compilerOptions"
Cohesion: 0.07
Nodes (27): dist, DOM, ES2022, node, node_modules, scripts/**/*.ts, src/**/*.ts, tests/**/*.ts (+19 more)

### Community 66 - "Auctorio — SEO Architecture"
Cohesion: 0.07
Nodes (26): 1. URL Structure, 2. Meta Tags, 3. Structured Data (JSON-LD), 4. Content Architecture, 5. Technical SEO, 6. Open Graph & Social, 7. Recommendations, Auctorio — SEO Architecture (+18 more)

### Community 67 - "publication.ts"
Cohesion: 0.13
Nodes (26): AuditEntryInput, recordWebsitePublishFailure(), ALLOWED_TRANSITIONS, canTransition(), classifyPublicationError(), CreatePublicationInput, enqueueWebsitePublication(), failAttempt() (+18 more)

### Community 68 - "2. Mapa objetivo de rutas"
Cohesion: 0.08
Nodes (25): 1. Superficies auditadas hoy, 2. Mapa objetivo de rutas, 3. Pantallas clave por fase, 4. Patrones de pantalla, 5. Notas de migracion, 6. Resultado del mapa, AI Generation, Analytics (+17 more)

### Community 69 - "planner.ts"
Cohesion: 0.08
Nodes (41): main(), parseArgs(), runAutomationWorker(), AutomationMode, approveAndSchedule(), prisma, pushItem(), RECOVERABLE_STATUSES (+33 more)

### Community 70 - "qa.ts"
Cohesion: 0.14
Nodes (20): containsKeyword(), countExternalLinks(), countImages(), countInternalLinks(), GENERIC_AI_PHRASES, hasEmptyHeadings(), hasFaqSection(), hasHeadingOrderIssues() (+12 more)

### Community 71 - "Auctorio Web — Rework Audit & Delivery Report"
Cohesion: 0.08
Nodes (24): 1.1 Visual Design — Critical Issues, 1.2 UX/UI — Critical Issues, 1.3 Copywriting — Critical Issues, 1.4 SEO — Critical Issues, 1.5 Accessibility, 1.6 Performance, 1. Pre-Rework Audit, 2. Design System — New Visual Direction (+16 more)

### Community 72 - "AuRichEditorComponent"
Cohesion: 0.12
Nodes (8): ALLOWED_TAGS, AuRichEditorComponent, isPlatformBrowserSafe(), sanitizeHtml(), Component, Input, ViewChild, Output

### Community 73 - "getMarketingPath"
Cohesion: 0.12
Nodes (25): BRAND_NAME, getAlternatePagePaths(), getAssetBySlug(), getHomeExamples(), getLocalizedExamples(), getLocalizedFaqEntries(), getLocalizedPageSeo(), getLocalizedUseCases() (+17 more)

### Community 74 - "SettingsPageComponent"
Cohesion: 0.10
Nodes (6): AiUsageRow, DiscoverySettingsResponse, StudioRoleSummary, StudioUserSummary, SettingsPageComponent, Component

### Community 75 - "ActivityPageComponent"
Cohesion: 0.14
Nodes (4): OperationItem, OperationStatus, ActivityPageComponent, Component

### Community 76 - "Arquitectura Tecnica del Backend de Generacion de Contenido con IA (SEO e Instagram)"
Cohesion: 0.08
Nodes (23): 0.1 Estados y transiciones (publicaciones), 0.2 Workers y colas, 0.3 Idempotencia y reintentos, 0.4 Seguridad, 0.5 Automatizacion, 0. Dominio editorial (nuevo), 10. Seguridad y scraping, 11. Proveedores de IA (abstraccion) (+15 more)

### Community 77 - "scripts"
Cohesion: 0.08
Nodes (25): scripts, automation:recover, bootstrap:studio-access, build, build:studio, dev:studio, ops:queue, report:editorial-engine (+17 more)

### Community 78 - "topic.ts"
Cohesion: 0.11
Nodes (30): GenerateImageFromTextInput, GenerateImageFromTextOutput, generateImageFromTextUseCase(), GetContentImageInput, GetContentImageOutput, getContentImageUseCase(), GetContentTextInput, GetContentTextOutput (+22 more)

### Community 79 - "automation.ts"
Cohesion: 0.10
Nodes (35): assertSafeAutomationPolicy(), AUTOMATION_DEFAULTS, AutomationModeValue, AutomationStatus, CIRCUIT_BREAKER_THRESHOLD, countChannelPublicationsToday(), EditorialSlot, generateEditorialSlots() (+27 more)

### Community 80 - "brief-builder.ts"
Cohesion: 0.11
Nodes (24): BriefInput, buildStoryBrief(), derivePrimaryKeyword(), deriveSecondaryKeywords(), STORY_ANGLE_BY_TYPE, stripPunctuation(), titleCaseStops(), ClassificationInput (+16 more)

### Community 81 - "orchestrator.ts"
Cohesion: 0.13
Nodes (26): decideCreateUpdateOrSkip(), DuplicateCheckInput, DuplicateCheckResult, prisma, sharesPrimaryEntity(), sentenceSplit(), asRecord(), computeUpdateDelta() (+18 more)

### Community 82 - "devDependencies"
Cohesion: 0.09
Nodes (23): @angular/build, @angular/cli, @angular/compiler-cli, devDependencies, @angular/build, @angular/cli, @angular/compiler-cli, jasmine-core (+15 more)

### Community 83 - "dependencies"
Cohesion: 0.09
Nodes (23): @angular/common, @angular/compiler, @angular/core, @angular/forms, @angular/platform-browser, @angular/platform-server, @angular/router, @angular/ssr (+15 more)

### Community 85 - "Talkaris Product Architecture"
Cohesion: 0.09
Nodes (21): 1. Resumen ejecutivo, 2. Mapa real del repositorio, 3. Dominio actual, 4. Funcionalidades existentes y su representacion, 5. Auth architecture, 6. Resultado, Backend HTTP, Completamente representadas en UI (+13 more)

### Community 86 - "movie-tv/plugin.ts"
Cohesion: 0.10
Nodes (25): normalizeText(), cleanWorkTitle(), detectWorkType(), extractSeasonFromTitle(), extractYearFromTitle(), matchWork(), MatchWorkInput, MOVIE_CUES (+17 more)

### Community 87 - "quality-repair.ts"
Cohesion: 0.10
Nodes (26): addImageAltText(), applyRepairPlan(), buildRepairInstruction(), contentStrategyCount(), countWords(), enforceCitationAllowlist(), fitSeoDescription(), fitSeoTitle() (+18 more)

### Community 88 - "adapters/http.ts"
Cohesion: 0.15
Nodes (18): buildAgent(), ConditionalRequest, domainThrottle, fetchRobotsRules(), isPathAllowed(), isPathAllowedByRules(), parseRetryAfter(), parseRobotsTxt() (+10 more)

### Community 89 - "connectors/registry.ts"
Cohesion: 0.12
Nodes (18): AuthMethodDescriptor, AuthMethodId, CapabilityId, ConfigSchemaField, connectorCapabilityView, ConnectorKind, GENERIC_REST_DESCRIPTOR, GENERIC_REST_FIELDS (+10 more)

### Community 90 - "editorial-engine/types.ts"
Cohesion: 0.11
Nodes (22): DEFAULT_PUBLICATION_GATES, GatesInput, EnrichmentValue, localizedTitle(), MOVIE_TV_VALUE_PRESET, readStringList(), resolveDefinitions(), resolveSiteValueBlocks() (+14 more)

### Community 91 - "profile.ts"
Cohesion: 0.13
Nodes (21): loadProfile(), COMMON_TOPIC_TERMS, containsAny(), countKeywords(), ENGLISH_STOPWORDS, EntitySummary, GUIATV_COMMERCIAL_TERMS, GUIATV_EVERGREEN_TERMS (+13 more)

### Community 92 - "OperationsPageComponent"
Cohesion: 0.13
Nodes (5): CostBudgetView, CostControlsView, OperationsHealth, OperationsPageComponent, Component

### Community 93 - "deps.ts"
Cohesion: 0.15
Nodes (11): checkCostPolicy(), CostPolicyInput, CostPolicyResult, startOfDayUtc(), startOfMonthUtc(), toNumber(), CostPolicy, CostPolicyResult (+3 more)

### Community 94 - "image.ts"
Cohesion: 0.14
Nodes (11): backoffDelay(), downloadBytesRobust(), ImageDownloadError, ImageDownloadErrorCode, ImageGenerationHandle, ImageGenerationInput, ImageGenerationResult, ImageProvider (+3 more)

### Community 95 - "structured.ts"
Cohesion: 0.11
Nodes (23): balanceJson(), extractJsonCandidate(), generateStructured(), parseJsonWithRepair(), repairJson(), stripFences(), StructuredGenerationAttempt, StructuredGenerationOptions (+15 more)

### Community 96 - "AUCTORIO REBUILD STATUS"
Cohesion: 0.11
Nodes (18): Architecture decisions, AUCTORIO REBUILD STATUS, Backend API, Completed in latest pass, Current objective, Current phase, Files touched, Functional status by module (+10 more)

### Community 97 - "crawler.ts"
Cohesion: 0.11
Nodes (30): BOILERPLATE_SELECTORS, compact(), CrawlBatchResult, crawlPagesForSite(), ExtractedPage, extractPage(), extractPageFromHtml(), firstText() (+22 more)

### Community 98 - "writer-provider.ts"
Cohesion: 0.14
Nodes (14): ParsedArticle, ArticleWriter, ArticleWriterFactory, DefaultArticleWriter, getArticleWriter(), WriterGenerationInput, WriterGenerationResult, buildFakeArticleFromPrompt() (+6 more)

### Community 99 - "story-clustering.ts"
Cohesion: 0.12
Nodes (16): assignClusterAndRefresh(), CLUSTER2_AMBIGUOUS_BAND, CLUSTER2_ENTITY_OVERLAP_THRESHOLD, CLUSTER2_ENTITY_TITLE_FLOOR, CLUSTER2_TITLE_THRESHOLD, CLUSTER2_WINDOW_HOURS, ClusterEntitySignal, ClusterItemInput (+8 more)

### Community 100 - "notifications.ts"
Cohesion: 0.12
Nodes (28): getRedisConnectionOptions(), RedisConnectionOptions, getPublisher(), parseEvent(), publishEvent(), readEventsSince(), sanitizeEventPayload(), streamKey() (+20 more)

### Community 101 - "social.ts"
Cohesion: 0.17
Nodes (14): buildSocialPrompt(), extractHashtags(), GeneratedSocialPiece, INSTAGRAM_CAPTION_LIMIT, parseGeneratedSocial(), prisma, runSocialGenerationJob(), SocialGenerateRequest (+6 more)

### Community 102 - "web-discovery.ts"
Cohesion: 0.17
Nodes (20): loadBlockedDomainSet(), recommendSource(), upsertDiscoveredDomain(), DailyUsage, dedupeCandidates(), DiscoveryRunResult, ensureDomainSource(), estimateScrapeCost() (+12 more)

### Community 103 - "AutomationPageComponent"
Cohesion: 0.09
Nodes (8): AutomationHealth, AutomationRecoveryReport, AutomationStatus, PublishingAccount, PublishingWindow, AutomationPageComponent, parseJsonField(), Component

### Community 104 - "source-quality.ts"
Cohesion: 0.15
Nodes (15): applySourceFeedback(), AUTHORITY_TLDS, detectSpamSignals(), DomainEvaluationContext, evaluateDomainQuality(), isPrimaryCandidate(), PRIMARY_HINTS, prisma (+7 more)

### Community 105 - "getNumberEnv"
Cohesion: 0.11
Nodes (20): getNumberEnv(), assertSafeSiteBaseUrl(), buildDryRunResult(), GenericRestPublisher, GenericWebhookPublisher, getDryRunDecision(), getStringArray(), GuiaTvPublisher (+12 more)

### Community 106 - "web-intelligence.ts"
Cohesion: 0.19
Nodes (8): FirecrawlWebIntelligenceProvider, hostnameOf(), isUrlReachable(), normalizeSearchItem(), WebClaim, WebExtraction, WebSearchOptions, WebSearchResult

### Community 107 - "MediaPageComponent"
Cohesion: 0.20
Nodes (3): StudioMediaItem, MediaPageComponent, Component

### Community 108 - "dependencies"
Cohesion: 0.12
Nodes (17): cheerio, fast-xml-parser, fastify, google-auth-library, nodemailer, dependencies, bullmq, cheerio (+9 more)

### Community 109 - "publishers.test.ts"
Cohesion: 0.22
Nodes (5): ENV_KEYS, MockHandler, MockRequest, MockServer, originalEnv

### Community 110 - "options"
Cohesion: 0.15
Nodes (16): options, assets, browser, outputMode, polyfills, security, server, ssr (+8 more)

### Community 112 - "editorial-engine-fixtures.ts"
Cohesion: 0.30
Nodes (11): cleanupFixture(), clusterFor(), createFixture(), Fixture, ingest(), line(), main(), makeItem() (+3 more)

### Community 113 - "worker-scheduler.ts"
Cohesion: 0.13
Nodes (24): assertQueueHasCapacity(), depthCache, getQueueDepth(), QueueBackpressureError, queueDepthLimit(), exitAfterDrain(), heartbeatIntervalMs(), InFlightTracker (+16 more)

### Community 114 - "Auctorio Studio — Design System (Phase 2)"
Cohesion: 0.13
Nodes (14): 10. State language, 11. CSS architecture, 1. Direction, 2. Color tokens, 3. Theming mechanism, 4. Typography, 5. Spacing / density, 6. Radii, borders, shadows, focus (+6 more)

### Community 115 - "AUCTORIO — PHASE 5 FINAL PRODUCTION REPORT"
Cohesion: 0.13
Nodes (14): AI, Architecture, AUCTORIO — PHASE 5 FINAL PRODUCTION REPORT, Costs, Database, Deployment, Intelligence, Known limitations (+6 more)

### Community 116 - "InMemoryResilienceStore"
Cohesion: 0.16
Nodes (4): Entry, InMemoryResilienceStore, ResilienceStore, sharedStore

### Community 117 - "intelligence-settings.ts"
Cohesion: 0.19
Nodes (13): normalizePrecedence(), ProviderPrecedence, AiJudgeConfig, LevelPolicy, normalizeLevelPolicy(), autoDetectDomains(), DEFAULT_ENABLED_DOMAINS, getIntelligenceSettings() (+5 more)

### Community 118 - "1. Universal connection installer"
Cohesion: 0.14
Nodes (13): 1. Universal connection installer, 2. Activity Center (operations), 3. Realtime events (SSE), 4. Notification Center, 5. Provisioning and cleanup, Activation, Async execution, Connector registry (`src/studio/connectors/registry.ts`) (+5 more)

### Community 119 - "3. Architecture decisions"
Cohesion: 0.14
Nodes (13): 1. Verified current-state anchors (with corrections), 2. Hard-coded brand/bootstrap paths to remove, 3.1 Connector registry (M3), 3.2 Installation aggregate + state machine (M2/M4), 3.3 Operations (M5), 3.4 SSE (M6), 3.5 Notifications (M7), 3.6 UX polish (M8) (+5 more)

### Community 120 - "Auctorio — Universal Connection Installer, Job Center, Notifications and UX Polish"
Cohesion: 0.14
Nodes (13): Architecture requirements, Auctorio — Universal Connection Installer, Job Center, Notifications and UX Polish, Delivery milestones, Mandatory context discipline, Non-negotiable completion rules, Primary objective: universal “Magic Installer”, Remove hard-coded defaults safely, Required tests and proof (+5 more)

### Community 121 - "site-editorial-profile.ts"
Cohesion: 0.24
Nodes (12): BuildProfileInput, buildSiteEditorialProfile(), ContentGap, getSiteEditorialProfile(), prisma, readEditorialDescription(), readProfileTopicArray(), readStringArray() (+4 more)

### Community 122 - ""quality_repair_attempts""
Cohesion: 0.40
Nodes (4): "content_projects", "content_versions", "quality_repair_attempts", "tenants"

### Community 123 - "public-shell.component.ts"
Cohesion: 0.18
Nodes (10): BRAND_SIGNATURE, getFooterResources(), getMarketingLocaleFromPath(), getMarketingNavigation(), getStudioLoginPath(), translateMarketingPath(), PublicShellComponent, Component (+2 more)

### Community 124 - "LoginPageComponent"
Cohesion: 0.26
Nodes (4): LoginPageComponent, resolveReturnTo(), Component, ViewChild

### Community 125 - "Auctorio Studio — Frontend Rebuild Report"
Cohesion: 0.15
Nodes (12): Accessibility, Architecture — what changed and why, Auctorio Studio — Frontend Rebuild Report, Before — major frontend problems, Mobile strategy, Performance, Remaining issues, Removed code (+4 more)

### Community 126 - "Auctorio Multi-Tenant Client Integrations"
Cohesion: 0.15
Nodes (12): Auctorio Multi-Tenant Client Integrations, Current operational caveat, Destination contracts, Guía Programación TV, Notes, Operational sequence, Provisioning, Publishing credentials (+4 more)

### Community 127 - "devDependencies"
Cohesion: 0.15
Nodes (13): devDependencies, @playwright/test, prisma, ts-node, @types/node, @types/nodemailer, typescript, @playwright/test (+5 more)

### Community 128 - "studio/auth.ts"
Cohesion: 0.05
Nodes (100): main(), WORKSPACE_BOOTSTRAP, main(), acceptStudioInvitation(), AccountWithMemberships, applyMappedRoles(), assignStudioRoleToUser(), buildApiKeyStudioSession() (+92 more)

### Community 131 - "CLAUDE.md - Auctorio Agent Guide"
Cohesion: 0.17
Nodes (11): [ARCHITECT], Behavioral Rules, Build & Test Commands, CLAUDE.md - Auctorio Agent Guide, [DEVELOPER], graphify, Managed engineering policy, Project Context (+3 more)

### Community 132 - "Image Manifest"
Cohesion: 0.17
Nodes (11): 1. publisher-command-center, 2. search-led-newsroom, 3. multi-site-publishing-grid, 4. editorial-qa-review, 5. brand-content-program, 6. content-operations-showcase, Auctorio — Image Generation Log, Existing Images (Pre-Rework) (+3 more)

### Community 133 - "use-case-detail-page.component.ts"
Cohesion: 0.38
Nodes (5): getUseCaseAlternatePaths(), getUseCaseBySlug(), getUseCaseSeo(), Component, UseCaseDetailPageComponent

### Community 134 - "SiteIntelligencePageComponent"
Cohesion: 0.21
Nodes (4): SiteIndexedPageRow, SiteIntelligenceOverview, SiteIntelligencePageComponent, Component

### Community 135 - "SseService"
Cohesion: 0.38
Nodes (3): StudioEventMessage, SseService, Injectable

### Community 136 - "CLAUDE.md - Auctorio Agent Guide"
Cohesion: 0.17
Nodes (11): [ARCHITECT], Behavioral Rules, Build & Test Commands, CLAUDE.md - Auctorio Agent Guide, [DEVELOPER], graphify, Managed engineering policy, Project Context (+3 more)

### Community 137 - "Auctorio Studio — Frontend Rebuild Audit (Phase 0)"
Cohesion: 0.17
Nodes (11): 10. Known constraints, 1. Current product architecture, 2. Current information architecture, 3. Functionality inventory (preserved, real), 4. Styling architecture — current state, 5. Application shell — current state, 6. Cross-cutting UX debt (measured), 7. Performance baseline (+3 more)

### Community 138 - "verify-platform-credentials.ts"
Cohesion: 0.27
Nodes (11): Account, checkAuctorioLogin(), checkAuthEndpoint(), checkPublicSite(), CheckResult, Inventory, jsonRequest(), main() (+3 more)

### Community 139 - "Studio Simplification — Architecture Report"
Cohesion: 0.18
Nodes (10): 1. New authentication model, 2. Session cookie (BFF, `apps/studio-web/src/server.ts`), 3. Site scoping per request, 4. New Studio session view, 5. Navigation & routing, 6. Content workflow, 7. Backend additions, 8. Preserved production core (unchanged behavior) (+2 more)

### Community 140 - "Studio Simplification — Deletion Report"
Cohesion: 0.18
Nodes (10): Deleted components (5), Deleted pages (23), Deleted routes (28 old Studio routes removed; redirects installed), Deleted services / guards / utils, Login UI reduction, Merged pages, Metrics, Obsolete styles (+2 more)

### Community 141 - "Talkaris Screen Map"
Cohesion: 0.18
Nodes (10): Control, Dashboard, Estado de pantallas del cockpit editorial, Governance, Lectura del mapa, Mapa de navegación, Operations, Protección por permisos (+2 more)

### Community 142 - "Content AI Platform — Auctorio"
Cohesion: 0.18
Nodes (10): API expuesta, Arranque local, Conectar X / Instagram, Content AI Platform — Auctorio, Fiabilidad, Flujo editorial, Modo automatico, Modo de publicacion (dry-run) (+2 more)

### Community 143 - "AuctorioChatWidgetComponent"
Cohesion: 0.29
Nodes (4): AuctorioChatWidgetComponent, Component, Input, Inject

### Community 146 - "producer.ts"
Cohesion: 0.20
Nodes (17): jobQueue, enqueueConnectionJob(), enqueueImageJob(), enqueuePublishingJob(), enqueueScrapingJob(), enqueueSocialJob(), enqueueTextJob(), getPublishingQueue() (+9 more)

### Community 147 - "discovery-planner.ts"
Cohesion: 0.29
Nodes (9): buildPlanPrompt(), DiscoveryQueryPlan, EditorialDiscoveryContext, gatherEditorialContext(), parseDiscoveryPlan(), planDiscovery(), prisma, QUERY_CATEGORIES (+1 more)

### Community 148 - "development"
Cohesion: 0.22
Nodes (9): build, builder, configurations, defaultConfiguration, development, buildTarget, extractLicenses, optimization (+1 more)

### Community 149 - "PublishingPageComponent"
Cohesion: 0.28
Nodes (4): ProjectStatus, PublicationListItem, PublishingPageComponent, Component

### Community 150 - "ThemeService"
Cohesion: 0.29
Nodes (4): StudioEffectiveTheme, StudioThemePreference, ThemeService, Injectable

### Community 151 - "Auctorio SEO Engine V2 — Architecture & Operator Notes (M16–M22)"
Cohesion: 0.22
Nodes (8): AI structured-output architecture, Auctorio SEO Engine V2 — Architecture & Operator Notes (M16–M22), Editorial planning architecture, External provider requirements, Old pipeline vs new pipeline, Operator runbook, Publishing contract (GuiaTV), Site intelligence architecture

### Community 152 - "Auctorio Source Registry Architecture (Phase 2)"
Cohesion: 0.22
Nodes (8): Auctorio Source Registry Architecture (Phase 2), Copyright and attribution (provenance.ts), Fetching policies (adapters/http.ts), Layers, Parsing (adapters/rss.ts, atom.ts, sitemap.ts), Registry vs packs vs providers, Safe article metadata extraction (adapters/html.ts), Studio sources page

### Community 153 - "Auctorio Studio — Frontend Information Architecture (Phase 1)"
Cohesion: 0.22
Nodes (8): 1. Product loop the UI must reinforce, 2. Studio navigation hierarchy, 3. Route responsibilities, 4. Global actions, 5. Cross-screen workflows, 6. Settings hierarchy, 7. Layout rules, Auctorio Studio — Frontend Information Architecture (Phase 1)

### Community 154 - "cleanup-seeded-connections.ts"
Cohesion: 0.36
Nodes (8): Args, cleanupAccount(), cleanupInstallationDrafts(), main(), parseArgs(), prisma, reportCandidates(), resolveTargets()

### Community 155 - "generate-marketing-images.mjs"
Cohesion: 0.28
Nodes (8): __dirname, downloadAndConvert(), generateImage(), IMAGES, main(), MODEL, OUTPUT_DIR, ROOT

### Community 156 - "content-intelligence.test.ts"
Cohesion: 0.06
Nodes (36): classifyMatch(), DedupInput, DedupOptions, DedupReason, DedupResult, DEFAULT_DEDUP_OPTIONS, evaluateDedup(), ExistingItem (+28 more)

### Community 158 - "angular.json"
Cohesion: 0.25
Nodes (7): cli, analytics, packageManager, newProjectRoot, projects, $schema, version

### Community 159 - "production"
Cohesion: 0.25
Nodes (8): serve, production, budgets, buildTarget, outputHashing, builder, configurations, defaultConfiguration

### Community 160 - "studio-web/package.json"
Cohesion: 0.25
Nodes (7): name, prettier, overrides, printWidth, singleQuote, private, version

### Community 161 - "scripts"
Cohesion: 0.25
Nodes (8): scripts, build, dev:ssr, ng, serve:ssr, start, test, watch

### Community 162 - "Studio Web"
Cohesion: 0.25
Nodes (7): Comandos, Flujo soportado, Notas operativas, Que hace, Rutas principales, Studio Web, Variables necesarias

### Community 163 - "quality-gate.ts"
Cohesion: 0.23
Nodes (15): evaluateAutopilotGateForVersion(), AutonomousGateConfig, AutonomousGateInput, contentRequiresEvidence(), countWordsFromHtml(), DEFAULT_AUTONOMOUS_GATE_CONFIG, evaluateAutonomousGate(), GateReport (+7 more)

### Community 164 - "autopilot-golden-path.spec.ts"
Cohesion: 0.25
Nodes (3): AutomationPolicy, ProjectSummary, Site

### Community 165 - "cost-budgets.ts"
Cohesion: 0.19
Nodes (14): AiSpendInput, BudgetAction, BudgetDecision, BudgetRow, deleteCostBudget(), evaluateAiSpend(), getAiSpend(), listCostBudgets() (+6 more)

### Community 167 - "Auctorio → GuiaTV Production Acceptance Evidence"
Cohesion: 0.29
Nodes (6): Auctorio → GuiaTV Production Acceptance Evidence, Known residuals, Release identity, Reliability changes shipped in this pass, Test suite results, Workflow evidence (real services, real GuiaTV)

### Community 168 - "Auctorio Environment & Configuration Audit"
Cohesion: 0.29
Nodes (6): Auctorio Environment & Configuration Audit, Deployment reproducibility, Environment variable matrix, Fail-fast rules (implemented 2026-08-21), Migration verification (2026-08-21), Production runtime facts (verified)

### Community 169 - "Progreso del proyecto"
Cohesion: 0.29
Nodes (6): Estado actual, Implementado, Pendiente relevante, Progreso del proyecto, Pruebas automatizadas, Verificado

### Community 172 - "internal-linking.ts"
Cohesion: 0.36
Nodes (7): anchorFromTitle(), InternalLinkSuggestion, prisma, slugTokens(), suggestInternalLinks(), tokenize(), prisma

### Community 174 - "studio-web"
Cohesion: 0.33
Nodes (6): studio-web, prefix, projectType, root, schematics, sourceRoot

### Community 175 - "AppToastHostComponent"
Cohesion: 0.40
Nodes (3): AppToastHostComponent, Component, ToastItem

### Community 176 - "quality-repair.test.ts"
Cohesion: 0.17
Nodes (9): QaGroup, QaReportV2, buildRepairPlan(), normalizeStoredQaReport(), RepairProvider, createFixture(), Fixture, PASSING_PROVIDER (+1 more)

### Community 179 - "Auctorio — Source Support Matrix"
Cohesion: 0.33
Nodes (5): Auctorio — Source Support Matrix, Discovery preference order (applied per publisher), Editorial sources (RSS/Atom), Enrichment providers (structured-data APIs, independent from editorial sources), News sitemaps (optional entries, disabled by default)

### Community 181 - "cloudflare-cutover.sh"
Cohesion: 0.73
Nodes (5): cf_api(), require_env(), set_zone_setting(), cloudflare-cutover.sh script, upsert_a_record()

### Community 183 - "qa-visual-installer.mjs"
Cohesion: 0.33
Nodes (5): overflowRows, PAGES, report, THEMES, WIDTHS

### Community 186 - "studio-ssr.test.ts"
Cohesion: 0.47
Nodes (4): getFreePort(), MockBackend, startStudioServer(), waitForServer()

### Community 187 - "AGENTS.md - Auctorio AI Agents"
Cohesion: 0.40
Nodes (4): AGENTS.md - Auctorio AI Agents, Available Agent Roles, Managed engineering policy, Optimization Policy

### Community 188 - "AGENTS.md - Auctorio AI Agents"
Cohesion: 0.40
Nodes (4): AGENTS.md - Auctorio AI Agents, Available Agent Roles, Managed engineering policy, Optimization Policy

### Community 189 - "architect"
Cohesion: 0.40
Nodes (5): extract-i18n, test, builder, architect, builder

### Community 190 - "runQualityRepairCycle"
Cohesion: 0.52
Nodes (7): asRecord(), buildGateContext(), createDefaultRepairProvider(), markInterventionRequired(), readNumber(), readString(), runQualityRepairCycle()

### Community 192 - "ai/text.ts"
Cohesion: 0.12
Nodes (14): getTextProvider(), MockTextProvider, OpenAICompatibleTextProvider, TextGenerationInput, TextGenerationResult, TextProvider, TextUsage, AiJudge (+6 more)

### Community 195 - "smoke-editorial.cjs"
Cohesion: 0.60
Nodes (4): call(), crypto, main(), signedHeaders()

### Community 196 - "getImageSitemapEntries"
Cohesion: 0.29
Nodes (8): getHomeAssets(), getImageSitemapEntries(), getLocalizedAssets(), getPublicRouteEntries(), buildImageSitemapXml(), buildLocalizedSitemapXml(), buildSitemapIndexXml(), escapeXml()

### Community 200 - "package.json"
Cohesion: 0.50
Nodes (3): name, private, version

## Knowledge Gaps
- **1429 isolated node(s):** `SiteType`, `VersionStatus`, `PublicationStatus`, `JsonRecord`, `StudioPermission` (+1424 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **39 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `getPrismaClient()` connect `getPrismaClient` to `studio/auth.ts`, `provider-cache.ts`, `sha256`, `routes-editorial.ts`, `getEnv`, `intelligence-phase3.test.ts`, `site-relevance.ts`, `queue-ops.ts`, `editorial.ts`, `source-registry.test.ts`, `orchestration.ts`, `prisma.ts`, `discovery-planner.ts`, `sources.ts`, `producer.ts`, `routes.ts`, `intelligence-report.ts`, `cleanup-seeded-connections.ts`, `routes-intelligence.ts`, `content-intelligence.test.ts`, `source-registry.ts`, `routes-connectors.ts`, `cost-budgets.ts`, `repository.ts`, `enrichment-providers.ts`, `internal-linking.ts`, `quality-repair.test.ts`, `worker-publishing.ts`, `repositories.ts`, `editorial-engine.test.ts`, `pipeline.ts`, `structuredEvent`, `publication.ts`, `planner.ts`, `automation.ts`, `orchestrator.ts`, `movie-tv/plugin.ts`, `quality-repair.ts`, `profile.ts`, `deps.ts`, `crawler.ts`, `story-clustering.ts`, `notifications.ts`, `social.ts`, `web-discovery.ts`, `source-quality.ts`, `editorial-engine-fixtures.ts`, `worker-scheduler.ts`, `intelligence-settings.ts`, `site-editorial-profile.ts`?**
  _High betweenness centrality (0.049) - this node is a cross-community bridge._
- **Why does `getNumberEnv()` connect `getNumberEnv` to `publishers.ts`, `fetchWithTimeout`, `getEnv`, `api.ts`, `editorial.ts`, `source-registry.test.ts`, `producer.ts`, `sources.ts`, `routes-intelligence.ts`, `social-publishers.ts`, `metrics.ts`, `getPrismaClient`, `scraping/index.ts`, `topic-controller.ts`, `structuredEvent`, `connectors/verification.ts`, `ai/text.ts`, `publication.ts`, `planner.ts`, `automation.ts`, `WebIntelligenceProvider`, `adapters/http.ts`, `profile.ts`, `deps.ts`, `image.ts`, `structured.ts`, `crawler.ts`, `notifications.ts`, `web-discovery.ts`, `web-intelligence.ts`, `worker-scheduler.ts`?**
  _High betweenness centrality (0.022) - this node is a cross-community bridge._
- **Why does `getEnv()` connect `getEnv` to `studio/auth.ts`, `publishers.ts`, `routes-editorial.ts`, `fetchWithTimeout`, `api.ts`, `editorial.ts`, `routes.ts`, `routes-intelligence.ts`, `social-publishers.ts`, `metrics.ts`, `getPrismaClient`, `enrichment-providers.ts`, `scraping/index.ts`, `worker-publishing.ts`, `tmdb.ts`, `structuredEvent`, `ai/text.ts`, `planner.ts`, `WebIntelligenceProvider`, `adapters/http.ts`, `connectors/registry.ts`, `image.ts`, `notifications.ts`, `web-discovery.ts`, `getNumberEnv`, `web-intelligence.ts`, `worker-scheduler.ts`, `intelligence-settings.ts`?**
  _High betweenness centrality (0.019) - this node is a cross-community bridge._
- **What connects `SiteType`, `VersionStatus`, `PublicationStatus` to the rest of the system?**
  _1429 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `studio.models.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.02418682235195997 - nodes in this community are weakly interconnected._
- **Should `publishers.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.1111111111111111 - nodes in this community are weakly interconnected._
- **Should `StudioApiService` be split into smaller, more focused modules?**
  _Cohesion score 0.024188129899216124 - nodes in this community are weakly interconnected._