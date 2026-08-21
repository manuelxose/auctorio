export type SiteType = 'guiatv' | 'tecnoria' | 'talkaris' | 'webhook';
export type ProjectGoal =
  | 'article'
  | 'landing'
  | 'comparison'
  | 'faq'
  | 'newsletter'
  | 'social_pack';
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
  reviewGate: ReviewGateSummary;
  latestVersion: VersionSummary | null;
  latestPublicationJob: PublicationExecutionState | null;
};

export type ProjectVersionDetail = VersionSummary & {
  bodyHtml: string | null;
};

export type StudioProjectDetailView = StudioProjectSummary & {
  metadata: JsonRecord;
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
