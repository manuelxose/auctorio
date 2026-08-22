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
    checks: Array<{
      key: string;
      passed: boolean;
      message: string;
      severity: 'error' | 'warning';
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

export type SourceType = 'rss' | 'atom' | 'html' | 'sitemap' | 'api' | 'manual';

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
  site: { id: string; name: string; key: string } | null;
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
