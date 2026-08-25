export type SiteType = 'guiatv' | 'tecnoria' | 'talkaris' | 'webhook';
export type ProjectGoal =
  | 'article'
  | 'landing'
  | 'comparison'
  | 'faq'
  | 'newsletter'
  | 'social_pack'
  | 'news_article';
export type ProjectStatus =
  | 'draft'
  | 'ai_generated'
  | 'qa_failed'
  | 'qa_passed'
  | 'in_review'
  | 'approved'
  | 'publish_queued'
  | 'published'
  | 'publish_failed';
export type VersionStatus =
  | 'draft'
  | 'ai_generated'
  | 'qa_failed'
  | 'qa_passed'
  | 'approved'
  | 'published'
  | 'archived';
export type PublicationStatus =
  | 'queued'
  | 'processing'
  | 'draft_synced'
  | 'published'
  | 'failed'
  | 'canceled';

export type JsonRecord = Record<string, unknown> | null;

export type PaginatedResponse<T> = {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
};

export type StudioPermission =
  | 'workspace.manage'
  | 'users.manage'
  | 'roles.manage'
  | 'prompts.manage'
  | 'projects.manage'
  | 'review.approve'
  | 'publishing.manage'
  | 'integrations.manage'
  | 'analytics.read';

export type StudioAuthMode = 'api_key' | 'oidc' | 'password' | 'google' | 'launch';

export type StudioRole = 'admin' | 'editor' | 'viewer';

export type StudioSite = {
  id: string;
  key: string;
  name: string;
  type: SiteType;
  baseUrl: string | null;
  role: StudioRole;
};

export type StudioSession = {
  user: {
    id: string;
    email: string;
    displayName: string;
    avatarUrl: string | null;
  };
  role: StudioRole;
  sites: StudioSite[];
  activeSiteId: string | null;
};

export type StudioAuthProviders = {
  googleClientId: string | null;
};

export type StudioMediaItem = {
  id: string;
  status: string;
  provider: string | null;
  model: string | null;
  prompt: string | null;
  storagePath: string | null;
  width: number | null;
  height: number | null;
  error: string | null;
  assetUrl: string | null;
  createdAt: string;
  updatedAt: string;
  variants: Array<{
    id: string;
    kind: string;
    storagePath: string;
    mimeType: string;
    width: number | null;
    height: number | null;
    publicUrl: string | null;
  }>;
  project: { id: string; title: string; siteId: string; site: { key: string; name: string } } | null;
  version: { id: string; versionNumber: number } | null;
};

export type PublicationExecutionState = {
  id: string;
  status: PublicationStatus;
  action: 'publish' | 'update' | 'unpublish';
  targetStatus: 'draft' | 'publish' | null;
  externalId: string | null;
  externalUrl: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
};

export type ReviewGateStage =
  | 'awaiting_generation'
  | 'needs_review'
  | 'qa_blocked'
  | 'ready_to_approve'
  | 'approved'
  | 'publish_queued'
  | 'publish_failed'
  | 'published';

export type ReviewGateIssue = {
  code: string;
  severity: 'blocking' | 'warning';
  message: string;
};

export type ReviewGateSummary = {
  stage: ReviewGateStage;
  compareReady: boolean;
  approvalReady: boolean;
  publishReady: boolean;
  ready: boolean;
  blockerCount: number;
  warningCount: number;
  blockers: string[];
  warnings: string[];
  issues: ReviewGateIssue[];
  nextAction: string;
  primaryConcern: string;
};

export type VersionSummary = {
  id: string;
  versionNumber: number;
  status: VersionStatus;
  title: string | null;
  excerpt: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  feedback: string | null;
  createdAt: string;
  updatedAt: string;
  approvedAt: string | null;
  approvedBy: string | null;
  publishedAt: string | null;
  qaState: 'not_ready' | 'failed' | 'passed' | 'approved' | 'published';
  hasAsset: boolean;
  assetUrl: string | null;
  image: {
    id: string;
    status: string;
    error: string | null;
  } | null;
  promptPresetVersionId: string | null;
  promptVersionLabel: string | null;
  promptPresetName: string | null;
  promptPresetKey: string | null;
  wordCount: number;
  qaFailureCount: number;
  qaWarningCount: number;
  derivativeCount: number;
  latestPublicationJob: PublicationExecutionState | null;
  qaReport: {
    passed: boolean;
    score?: number;
    checks: Array<{
      key: string;
      passed: boolean;
      message: string;
      severity: 'error' | 'warning';
    }>;
    findings?: Array<{
      key: string;
      label: string;
      passed: boolean;
      severity: 'error' | 'warning' | 'info';
      message: string;
      group: 'structural' | 'seo' | 'editorial' | 'evidence' | 'publishing';
    }>;
  } | null;
};

export type StudioSiteSummary = {
  id: string;
  key: string;
  name: string;
  type: SiteType;
  locale: string;
  baseUrl: string | null;
  publishingCredentialsRef: string | null;
  createdAt: string;
  updatedAt: string;
  projectCount: number;
  publishedProjectCount: number;
  latestPublicationJob: Pick<
    PublicationExecutionState,
    'id' | 'status' | 'externalUrl' | 'createdAt' | 'publishedAt' | 'error'
  > | null;
};

export type StudioSiteDetail = {
  id: string;
  key: string;
  name: string;
  type: SiteType;
  locale: string;
  baseUrl: string | null;
  brandVoice: JsonRecord;
  seoRules: JsonRecord;
  taxonomyMap: JsonRecord;
  publishingCredentialsRef: string | null;
  createdAt: string;
  updatedAt: string;
};

export type StudioProjectSummary = {
  id: string;
  siteId: string;
  title: string;
  brief: string;
  goal: ProjectGoal;
  status: ProjectStatus;
  origin: string;
  primaryLanguage: string;
  createdAt: string;
  updatedAt: string;
  site: {
    id: string;
    key: string;
    name: string;
    type: SiteType;
    locale: string;
    baseUrl: string | null;
  };
  versionCount: number;
  socialCount: number;
  publications: Array<{
    id: string;
    channel: PublicationChannel;
    status: PublicationState;
    scheduledFor: string | null;
    publishedAt: string | null;
  }>;
  reviewGate: ReviewGateSummary;
  latestVersion: VersionSummary | null;
  latestPublicationJob: PublicationExecutionState | null;
};

export type ProjectVersionDetail = VersionSummary & {
  bodyHtml: string | null;
};

export type StudioProjectDetailView = StudioProjectSummary & {
  metadata: JsonRecord;
  origin: string;
  deletedAt: string | null;
  deletionReason: string | null;
  sourceItem: { id: string; title: string; canonicalUrl: string | null; source: { id: string; name: string } } | null;
  cluster: { id: string; headline: string | null; sourceCount: number } | null;
  site: {
    id: string;
    key: string;
    name: string;
    type: SiteType;
    locale: string;
    baseUrl: string | null;
    brandVoice: JsonRecord;
    seoRules: JsonRecord;
    taxonomyMap: JsonRecord;
    publishingCredentialsRef: string | null;
  };
  topic: { id: string; title: string | null } | null;
  latestAssetUrl: string | null;
  socialContents: StudioSocialContent[];
  publications: Array<{
    id: string;
    channel: PublicationChannel;
    status: PublicationState;
    scheduledFor: string | null;
    publishedAt: string | null;
    externalId: string | null;
    externalUrl: string | null;
    lastError: string | null;
    failureClass: string | null;
    failureReason: string | null;
    retryCount: number;
    manualOverride: boolean;
    account: { id: string; platform: string; displayName: string } | null;
    site: { id: string; key: string; name: string } | null;
    attempts: Array<{
      id: string;
      attemptNumber: number;
      status: string;
      error: string | null;
      startedAt: string | null;
      finishedAt: string | null;
    }>;
  }>;
  latestVersion: (VersionSummary & {
    bodyHtml: string | null;
    derivatives: Array<{
      id: string;
      type: string;
      title: string | null;
      body: string;
      status: string;
      createdAt: string;
      updatedAt: string;
    }>;
    assetVariants: Array<{
      id: string;
      kind: string;
      storagePath: string;
      mimeType: string;
      width: number | null;
      height: number | null;
      createdAt: string;
      updatedAt: string;
      publicUrl: string | null;
    }>;
  }) | null;
  versions: ProjectVersionDetail[];
  publicationJobs: PublicationExecutionState[];
};

export type PublicationListItem = PublicationExecutionState & {
  site: {
    id: string;
    key: string;
    name: string;
    type: SiteType;
  };
  project: {
    id: string;
    title: string;
    status: ProjectStatus;
  };
  version: {
    id: string;
    versionNumber: number;
    status: VersionStatus;
  };
  assetUrl: string | null;
};

export type CreateSitePayload = {
  key: string;
  name: string;
  type: SiteType;
  locale?: string;
  baseUrl?: string | null;
  brandVoice?: JsonRecord;
  seoRules?: JsonRecord;
  taxonomyMap?: JsonRecord;
  publishingCredentialsRef?: string | null;
};

export type UpdateSitePayload = Omit<CreateSitePayload, 'key'>;

export type CreateProjectPayload = {
  siteId: string;
  title: string;
  brief: string;
  goal?: ProjectGoal;
  primaryLanguage?: string;
  metadata?: JsonRecord;
};

export type UpdateProjectPayload = {
  siteId?: string;
  title?: string;
  brief?: string;
  goal?: ProjectGoal;
  primaryLanguage?: string;
  metadata?: JsonRecord;
};

export type ListProjectsFilters = {
  siteId?: string;
  status?: ProjectStatus;
  goal?: ProjectGoal;
  page?: number;
  pageSize?: number;
  search?: string;
  origin?: 'manual' | 'auto';
  archived?: boolean;
};

export type PublishProjectPayload = {
  action?: 'publish' | 'update' | 'unpublish';
  targetStatus?: 'draft' | 'publish';
};

export type StudioIdentityProviderConfig = {
  enabled: boolean;
  issuer: string;
  clientId: string;
  scopes: string;
  provisioningMode: string;
  claimMappings: Record<string, unknown> | null;
  hasClientSecret: boolean;
};

export type UpdateStudioIdentityProviderPayload = {
  enabled?: boolean;
  issuer?: string;
  clientId?: string;
  clientSecret?: string | null;
  scopes?: string;
  provisioningMode?: string;
  claimMappings?: Record<string, unknown> | null;
};

export type StudioRoleSummary = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  createdAt: string;
  updatedAt: string;
  permissions: StudioPermission[];
  memberCount: number;
};

export type StudioUserSummary = {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  status: 'invited' | 'active' | 'suspended';
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
  authProvider: 'oidc' | 'invitation';
  roles: Array<{
    id: string;
    key: string;
    name: string;
    description: string | null;
    isSystem: boolean;
  }>;
};

export type StudioInvitationSummary = {
  id: string;
  email: string;
  displayName: string | null;
  status: string;
  acceptedAt: string | null;
  createdAt: string;
  updatedAt: string;
  userId: string | null;
};

export type StudioPromptVersionSummary = {
  id: string;
  versionNumber: number;
  status: 'draft' | 'approved' | 'deprecated';
  notes: string | null;
  approvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: {
    id: string;
    displayName: string;
    email: string;
  } | null;
  approvedBy: {
    id: string;
    displayName: string;
    email: string;
  } | null;
};

export type StudioPromptAssignmentSummary = {
  id: string;
  surface: 'text_seo' | 'text_instagram' | 'image_contextual' | 'image_independent';
  assignmentKey: string;
  siteId: string | null;
  createdAt: string;
  updatedAt: string;
  site: {
    id: string;
    name: string;
    key: string;
  } | null;
  version: {
    id: string;
    versionNumber: number;
    status: 'draft' | 'approved' | 'deprecated';
  };
};

export type StudioPromptPresetSummary = {
  id: string;
  key: string;
  name: string;
  surface: 'text_seo' | 'text_instagram' | 'image_contextual' | 'image_independent';
  scope: 'global' | 'site';
  description: string | null;
  siteId: string | null;
  createdAt: string;
  updatedAt: string;
  site: {
    id: string;
    name: string;
    key: string;
  } | null;
  latestVersion: StudioPromptVersionSummary | null;
  activeAssignment: StudioPromptAssignmentSummary | null;
};

export type StudioPromptPresetDetail = StudioPromptPresetSummary & {
  versions: Array<
    StudioPromptVersionSummary & {
      systemTemplate: string | null;
      userTemplate: string;
      variablesJson: Record<string, unknown> | null;
    }
  >;
  assignments: StudioPromptAssignmentSummary[];
  preview: {
    systemPrompt: string;
    userPrompt: string;
    variables: Record<string, string>;
    source: 'manual' | 'site' | 'global' | 'fallback';
  } | null;
};

// ─── Editorial platform models ────────────────────────────────────────────

export type SourceType = 'rss' | 'atom' | 'html' | 'sitemap' | 'api' | 'htmllist' | 'imdb' | 'manual';

export type StudioSource = {
  id: string;
  siteId: string | null;
  name: string;
  type: SourceType;
  url: string | null;
  enabled: boolean;
  priority: number;
  trustScore: number;
  language: string;
  country: string | null;
  categories: string[] | null;
  tags: string[] | null;
  refreshIntervalMinutes: number;
  lastFetchedAt: string | null;
  lastSuccessAt: string | null;
  consecutiveFailures: number;
  configuration: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  discoveredCount: number;
  site: { id: string; name: string; key: string } | null;
};

export type SourceItemStatus =
  | 'discovered'
  | 'fetched'
  | 'parsed'
  | 'duplicate'
  | 'rejected'
  | 'candidate'
  | 'selected'
  | 'processed'
  | 'failed';

export type StudioSourceItem = {
  id: string;
  sourceId: string;
  clusterId: string | null;
  externalId: string;
  canonicalUrl: string | null;
  sourceUrl: string | null;
  title: string;
  description: string | null;
  author: string | null;
  publishedAt: string | null;
  discoveredAt: string;
  sourceImageUrls: string[] | null;
  language: string | null;
  categories: string[] | null;
  processingStatus: SourceItemStatus;
  score: number | null;
  scoreExplanation: Array<{ signal: string; points: number; detail: string }> | null;
  source: { id: string; name: string; type: SourceType; trustScore: number };
  cluster: { id: string; headline: string | null; sourceCount: number } | null;
  projects: Array<{ id: string; title: string; status: ProjectStatus }>;
  projectCount: number;
  retrieval: { id: string; provider: string; retrievedAt: string } | null;
};

export type StudioStoryCluster = {
  id: string;
  primaryTopic: string | null;
  headline: string | null;
  summary: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  score: number | null;
  status: string;
  sourceCount: number;
  itemCount: number;
  projectCount: number;
  items: Array<{ id: string; title: string; source: { name: string }; discoveredAt: string }>;
};

export type SocialChannel = 'x' | 'instagram';
export type SocialContentType = 'x_post' | 'x_thread' | 'instagram_caption' | 'instagram_story' | 'social_post';

export type StudioSocialContent = {
  id: string;
  projectId: string;
  versionId: string;
  channel: SocialChannel;
  contentType: SocialContentType;
  body: string;
  title: string | null;
  hashtags: string[] | null;
  mentions: string[] | null;
  mediaAssetIds: string[] | null;
  characterCount: number | null;
  generationStatus: 'queued' | 'processing' | 'done' | 'failed';
  editorialStatus: 'draft' | 'approved' | 'rejected';
  threadPosition: number | null;
  metadata: JsonRecord;
  createdAt: string;
  updatedAt: string;
};

export type PublicationChannel = 'website' | 'x' | 'instagram';
export type PublicationState =
  | 'draft'
  | 'ready'
  | 'scheduled'
  | 'queued'
  | 'publishing'
  | 'published'
  | 'failed'
  | 'canceled'
  | 'deleted'
  | 'unpublished';

export type StudioPublication = {
  id: string;
  tenantId: string;
  projectId: string;
  versionId: string;
  channel: PublicationChannel;
  accountId: string | null;
  siteId: string | null;
  socialContentId: string | null;
  status: PublicationState;
  scheduledFor: string | null;
  publishedAt: string | null;
  externalId: string | null;
  externalUrl: string | null;
  currentAttempt: number;
  retryCount: number;
  lastError: string | null;
  failureClass: string | null;
  failureReason: string | null;
  manualOverride: boolean;
  createdAt: string;
  updatedAt: string;
  assetUrl?: string | null;
  project?: { id: string; title: string; status: ProjectStatus };
  version?: {
    id: string;
    versionNumber: number;
    status: VersionStatus;
    title: string | null;
    contentImage: { storagePath: string | null } | null;
  };
  account: { id: string; platform: string; displayName: string } | null;
  site: { id: string; key: string; name: string; type: SiteType } | null;
  socialContent: { id: string; contentType: SocialContentType; channel: string; body: string; characterCount: number | null } | null;
  attempts?: Array<{
    id: string;
    attemptNumber: number;
    status: string;
    error: string | null;
    startedAt: string | null;
    finishedAt: string | null;
  }>;
};

export type CalendarEvent = {
  id: string;
  projectId: string;
  channel: PublicationChannel;
  status: PublicationState;
  scheduledFor: string | null;
  publishedAt: string | null;
  externalUrl: string | null;
  title: string;
  projectTitle: string;
  destination: string;
  site: { id: string; key: string; name: string; type: SiteType } | null;
  account: { id: string; platform: string; displayName: string } | null;
  thumbnail: string | null;
  automated: boolean;
  lastError: string | null;
  failureClass: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PublishingAccount = {
  id: string;
  platform: 'website' | 'x' | 'instagram';
  displayName: string;
  externalAccountId: string | null;
  enabled: boolean;
  status: 'pending' | 'active' | 'error' | 'disabled';
  lastVerifiedAt: string | null;
  hasCredentials: boolean;
  provider?: string;
  connectedAt?: string | null;
  site: { id: string; name: string; key: string } | null;
};

// ─── Social connections (OAuth / managed provider) ───────────────────────

export type SocialConnectionState =
  | 'not_connected'
  | 'connecting'
  | 'connected'
  | 'expired'
  | 'permissions_required'
  | 'provider_error'
  | 'disabled';

export type SocialConnection = {
  id: string;
  platform: 'x' | 'instagram' | 'website';
  provider: string;
  displayName: string;
  externalAccountId: string | null;
  username: string | null;
  avatarUrl: string | null;
  connectionState: SocialConnectionState;
  status: string;
  enabled: boolean;
  connectedAt: string | null;
  lastVerifiedAt: string | null;
  lastError: string | null;
  capabilities: Record<string, boolean>;
  hasCredentials: boolean;
  siteId: string | null;
  createdAt: string;
};

export type SocialConnectionSession = {
  sessionId: string;
  url: string;
  provider: string;
  expiresAt: string;
  callbackUrl: string;
};

export type SocialSetupInfo = {
  provider: { provider: string; configured: boolean; requiresSetup: string | null };
  callbackUrl: string;
  platforms: {
    instagram: { ready: boolean; requirement: string };
    x: { ready: boolean; requirement: string };
  };
};

// ─── AI web discovery ────────────────────────────────────────────────────

export type DiscoverySettings = {
  enabled: boolean;
  mode: 'manual' | 'recommend' | 'automatic';
  frequencyMinutes: number;
  languages: string[];
  regions: string[];
  maxSearchesPerDay: number;
  maxScrapesPerDay: number;
  maxDiscoveryCostPerDay: number;
  preferPrimarySources: boolean;
  requireTwoSources: boolean;
  avoidLowAuthority: boolean;
  detectDevelopingStories: boolean;
  autoEnableSources: boolean;
  minRecommendationScore: number;
};

export type DiscoverySettingsResponse = {
  config: DiscoverySettings & { id: string; siteId: string | null };
  provider: { provider: string; configured: boolean; message: string };
  usageToday: { searches: number; scrapes: number; estimatedCostUsd: number };
};

export type SourceRecommendation = {
  id: string;
  domain: string;
  sourceId: string | null;
  status: 'open' | 'accepted' | 'dismissed';
  score: number;
  searchesCount: number;
  reasonSummary: string | null;
  lastSeenAt: string;
  createdAt: string;
};

export type DiscoveredDomain = {
  id: string;
  domain: string;
  firstSeenAt: string;
  lastSeenAt: string;
  discoveryCount: number;
  blocked: boolean;
  qualityScore: number | null;
  tier: string | null;
};

export type BlockedDomain = {
  id: string;
  domain: string;
  reason: string | null;
  createdAt: string;
};

export type EditorialPlanItem = {
  id: string;
  projectId: string | null;
  title: string;
  workingTitle: string | null;
  finalSuggestedTitle: string | null;
  topic: string | null;
  topicCluster: string | null;
  pillarPage: string | null;
  angle: string | null;
  editorialObjective: string | null;
  channel: 'website' | 'x' | 'instagram';
  scheduledFor: string | null;
  primaryKeyword: string | null;
  secondaryKeywords: unknown;
  semanticKeywords: unknown;
  relatedEntities: unknown;
  questionsToAnswer: unknown;
  seoTitle: string | null;
  metaDescription: string | null;
  socialHook: string | null;
  imageConcept: string | null;
  status: string;
  contentType: string | null;
  primaryIntent: string | null;
  secondaryIntents: unknown;
  funnelStage: string | null;
  targetQuery: string | null;
  suggestedSlug: string | null;
  suggestedInternalLinks: unknown;
  suggestedExternalEvidenceTypes: unknown;
  faqCandidates: unknown;
  schemaTypes: unknown;
  outline: unknown;
  recommendedWordCountMin: number | null;
  recommendedWordCountMax: number | null;
  difficultyEstimate: number | null;
  opportunityScore: number | null;
  relevanceScore: number | null;
  cannibalizationRisk: string | null;
  confidence: number | null;
  rationale: string | null;
  sourceEvidence: unknown;
  freshnessRequirement: string | null;
};

export type EditorialPlan = {
  id: string;
  name: string;
  status: 'draft' | 'generating' | 'ready' | 'failed' | 'archived';
  dateFrom: string;
  dateTo: string;
  objective: string | null;
  timezone: string;
  siteId: string | null;
  provider: string | null;
  model: string | null;
  error: string | null;
  strategyMode: string | null;
  createdAt?: string;
  updatedAt?: string;
  siteName?: string | null;
  channelCounts?: { website?: number; x?: number; instagram?: number };
  statusCounts?: Record<string, number>;
  items?: EditorialPlanItem[];
  generatedOutput?: { items?: unknown[]; dropped?: Array<{ title: string; reason: string }>; warnings?: string[] } | null;
  _count?: { items: number };
};

export type SiteIntelligenceOverview = {
  site: { id: string; name: string; type: string; baseUrl: string | null };
  profile: {
    version: number;
    indexedAt: string | null;
    pageCount: number;
    detectedSiteType: string | null;
    detectedLanguage: string | null;
    detectedAudience: string | null;
    brandSummary: string | null;
    mainTopics: string[];
    categories: string[];
    contentTypes: Array<{ type: string; count: number }>;
    topicClusters: Array<{ name: string; slug: string; pagesCount: number; authorityScore: number; keywords: string[]; sampleUrls: string[] }>;
    editorialTone: string | null;
    commonArticleLength: number | null;
    commercialTopics: string[];
    evergreenTopics: string[];
    newsTopics: string[];
    sportsTopics: string[];
    entities: Array<{ name: string; type: string; mentions: number }>;
    confidence: number | null;
    warnings: string[];
  } | null;
  sitemaps: Array<{ id: string; url: string; kind: string; status: string; urlCount: number | null; lastFetchedAt: string | null; error: string | null }>;
  pageStates: Record<string, number>;
  totalPages: number;
  extractedPages: number;
  clusters: Array<{ id: string; name: string; slug: string; pagesCount: number; authorityScore: number; gapScore: number; keywords: unknown; sampleUrls: unknown }>;
  indexing: boolean;
  lastRun: string | null;
};

export type SiteIndexedPageRow = {
  id: string;
  url: string;
  title: string | null;
  contentType: string | null;
  wordCount: number | null;
  crawlState: string;
  modifiedAt: string | null;
  lastIndexedAt: string | null;
};

export type InternalLinkSuggestion = {
  url: string;
  title: string;
  anchor: string;
  reason: string;
  score: number;
};

export type PublishingWindow = { channel: string; days: number[]; from: string; to: string };

export type AutomationPolicy = {
  id: string;
  tenantId: string;
  siteId: string | null;
  enabled: boolean;
  state: 'active' | 'paused' | 'degraded';
  pausedReason: string | null;
  timezone: string;
  articlesPerDay: number;
  maxArticlesPerDay: number;
  xPostsPerDay: number;
  instagramPostsPerDay: number;
  minimumMinutesBetweenArticles: number;
  activeDaysOfWeek: number[] | null;
  publishingWindows: PublishingWindow[] | null;
  autoGenerate: boolean;
  autoApprove: boolean;
  autoSchedule: boolean;
  autoPublish: boolean;
  minimumStoryScore: number;
  categories: string[] | null;
  excludedCategories: string[] | null;
  priorityTopics: string[] | null;
  imageRequired: boolean;
  socialRequired: boolean;
  maximumQueueSize: number;
  articlesPerHour: number;
  socialPostsPerHour: number;
  maximumDailySocial: number;
  socialTimingMinutesX: number;
  socialTimingMinutesInstagram: number;
  createdAt: string;
  updatedAt: string;
};

export type AiUsageRow = {
  provider: string;
  model: string;
  textCount: number;
  imageCount: number;
  tokensInput: number;
  tokensOutput: number;
  costUsd: number;
};

export type AutomationStatus = {
  policyId: string;
  enabled: boolean;
  state: string;
  pausedReason: string | null;
  timezone: string;
  today: {
    date: string;
    articlesPlanned: number;
    articlesPublished: number;
    xPlanned: number;
    instagramPlanned: number;
  };
  limits: {
    articlesPerDay: number;
    xPostsPerDay: number;
    instagramPostsPerDay: number;
    maximumDailySocial: number;
    maximumQueueSize: number;
  };
  nextSlots: Array<{ channel: string; at: string }>;
  warnings: string[];
};

export type StudioOverview = {
  today: {
    articlesPlanned: number;
    articlesPublished: number;
    xPosts: number;
    instagramPosts: number;
  };
  pipeline: {
    inboxCandidates: number;
    drafts: number;
    review: number;
    scheduled: number;
    failed: number;
  };
  sources: { total: number; enabled: number; degraded: number; failing: number };
  connections: Array<{
    id: string;
    platform: 'website' | 'x' | 'instagram';
    displayName: string;
    enabled: boolean;
    status: string;
    connectionState: string | null;
    lastVerifiedAt: string | null;
    siteName: string | null;
  }>;
  planCoverage: {
    today: number;
    week: {
      total: number;
      generated: number;
      approved: number;
      website: number;
      x: number;
      instagram: number;
    };
  };
  automation: {
    enabled: boolean;
    state: string;
    pausedReason: string | null;
    warnings: string[];
    nextSlots: Array<{ channel: string; at: string }>;
  };
  recentPublications: Array<{
    id: string;
    channel: PublicationChannel;
    status: PublicationState;
    scheduledFor: string | null;
    publishedAt: string | null;
    title: string;
    destination: string;
    lastError: string | null;
  }>;
  failures: Array<{
    id: string;
    channel: PublicationChannel;
    lastError: string | null;
    failureClass: string | null;
    updatedAt: string;
    project: { id: string; title: string };
  }>;
};

export type WorkerHealth = {
  workers: Array<{
    queue: string;
    waiting: number;
    active: number;
    delayed: number;
    failed: number;
    completed: number;
  }>;
};

// ── Magic Installer, Activity Center and Notification models ───────────

export type ConnectorKind = 'website' | 'x' | 'instagram';

export type ConnectorAuthMethodView = {
  id: string;
  label: string;
  description: string;
  available: boolean;
};

export type ConnectorView = {
  id: string;
  name: string;
  description: string;
  capabilities: string[];
  authMethods: ConnectorAuthMethodView[];
  ready: boolean;
  actionHint: string | null;
  configSchemaVersion: number;
};

export type ConnectorCapabilitiesResponse = {
  kinds: Array<{ kind: ConnectorKind; label: string; mark: string; connectors: ConnectorView[] }>;
};

export type ConfigSchemaField = {
  key: string;
  label: string;
  kind: 'url' | 'text' | 'secret' | 'select' | 'boolean';
  required: boolean;
  placeholder?: string;
  help?: string;
  options?: Array<{ value: string; label: string }>;
};

export type WebsiteDiscoveryResult = {
  inputUrl: string;
  canonicalOrigin: string;
  reachable: boolean;
  httpStatus: number | null;
  title: string | null;
  locale: string | null;
  faviconUrl: string | null;
  cms: string | null;
  cmsSignals: string[];
  robotsTxtUrl: string | null;
  robotsHasSitemap: boolean;
  sitemapUrls: string[];
  generators: string[];
  endpoints: Array<{ url: string; kind: string; status: number | null; note: string | null }>;
  authOptions: Array<{ id: string; label: string; available: boolean; detail: string | null }>;
  publishingCapabilities: string[];
  warnings: string[];
  discoveredAt: string;
};

export type InstallationState =
  | 'draft'
  | 'discovering'
  | 'credentials_required'
  | 'verifying'
  | 'ready'
  | 'active'
  | 'failed'
  | 'expired'
  | 'disabled'
  | 'cancelled';

export type ConnectorInstallation = {
  id: string;
  tenantId: string;
  siteId: string | null;
  kind: ConnectorKind;
  provider: string;
  state: InstallationState;
  displayName: string | null;
  externalAccountId: string | null;
  config: Record<string, unknown> | null;
  discovered: WebsiteDiscoveryResult | Record<string, unknown> | null;
  capabilities: Record<string, unknown> | null;
  hasCredentials: boolean;
  credentialsRef: string | null;
  lastError: string | null;
  verifiedAt: string | null;
  activatedAt: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type InstallationDetailResponse = {
  installation: ConnectorInstallation;
  descriptor: {
    id: string;
    name: string;
    kind: ConnectorKind;
    capabilities: string[];
    configSchema: { type: 'object'; version: number; fields: ConfigSchemaField[] };
    verification: {
      probes: Array<{ probe: string; label: string; reversible: boolean }>;
      reversible: boolean;
      notes: string;
    };
  } | null;
};

export type OperationStatus =
  | 'queued'
  | 'running'
  | 'retrying'
  | 'succeeded'
  | 'partial'
  | 'failed'
  | 'cancelled';

export type OperationItem = {
  id: string;
  tenantId: string;
  siteId: string | null;
  type: string;
  status: OperationStatus;
  phase: string | null;
  progress: number;
  totalSteps: number;
  completedSteps: number;
  initiatorUserId: string | null;
  entityType: string | null;
  entityId: string | null;
  retryCount: number;
  errorSummary: string | null;
  errorCode: string | null;
  queueName: string | null;
  jobKey: string | null;
  metadata: Record<string, unknown> | null;
  startedAt: string | null;
  finishedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type OperationListResponse = {
  items: OperationItem[];
  page: number;
  pageSize: number;
  total: number;
  counts: Record<string, number>;
};

export type NotificationSeverity = 'info' | 'success' | 'warning' | 'error';

export type StudioNotification = {
  id: string;
  tenantId: string;
  userId: string | null;
  siteId: string | null;
  category: string;
  severity: NotificationSeverity;
  title: string;
  message: string;
  entityType: string | null;
  entityId: string | null;
  actionUrl: string | null;
  readAt: string | null;
  archivedAt: string | null;
  createdAt: string;
};

export type NotificationListResponse = {
  items: StudioNotification[];
  page: number;
  pageSize: number;
  total: number;
  unread: number;
  counts: Record<string, number>;
};

export type NotificationPreference = { category: string; enabled: boolean };

export type StudioEventMessage = {
  type: string;
  payload: Record<string, unknown>;
  siteId: string | null;
  emittedAt: string;
};
