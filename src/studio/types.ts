import type {
  AssetKind,
  ContentProject,
  ContentVersion,
  DerivativeType,
  ProjectGoal,
  ProjectStatus,
  PublicationAction,
  PublicationJob,
  Site,
  SiteType,
  StudioIdentityProvider,
  StudioInvitation,
  StudioAccount,
  StudioPromptAssignment,
  StudioPromptPreset,
  StudioPromptScope,
  StudioPromptSurface,
  StudioPromptVersion,
  StudioPromptVersionStatus,
  StudioProvisioningMode,
  StudioRole,
  StudioSessionAuthMode,
  StudioUser,
  StudioAccountStatus,
  StudioUserStatus,
  Tenant,
  VersionStatus,
} from "@prisma/client";
import type { StudioPermission } from "./security";

export type CreateSiteInput = {
  key: string;
  name: string;
  type: Site["type"];
  locale?: string;
  baseUrl?: string | null;
  brandVoice?: Record<string, unknown> | null;
  seoRules?: Record<string, unknown> | null;
  taxonomyMap?: Record<string, unknown> | null;
  publishingCredentialsRef?: string | null;
};

export type CreateProjectInput = {
  siteId: string;
  title: string;
  brief: string;
  goal?: ProjectGoal;
  primaryLanguage?: string;
  metadata?: Record<string, unknown> | null;
};

export type UpdateProjectInput = {
  siteId?: string;
  title?: string;
  brief?: string;
  goal?: ProjectGoal;
  primaryLanguage?: string;
  metadata?: Record<string, unknown> | null;
};

export type GenerateProjectInput = {
  feedback?: string | null;
  createNewVersion?: boolean;
  autoGenerateImage?: boolean;
  promptPresetVersionId?: string | null;
};

export type StudioVersionDerivation = {
  title: string;
  excerpt: string;
  bodyHtml: string;
  seoTitle: string;
  seoDescription: string;
};

export type GeneratedDerivative = {
  type: DerivativeType;
  title?: string;
  body: string;
};

export type QaCheck = {
  key: string;
  passed: boolean;
  message: string;
  severity: "error" | "warning";
};

export type QaReport = {
  passed: boolean;
  checks: QaCheck[];
};

export type PublicationPayload = {
  action?: PublicationAction;
  targetStatus?: "draft" | "publish";
};

export type PublicationTargetStatus = "draft" | "publish";

export type PublishResult = {
  externalId?: string | null;
  externalUrl?: string | null;
  effectiveTargetStatus?: PublicationTargetStatus | null;
  responsePayload?: Record<string, unknown> | null;
};

export type PublisherContext = {
  site: Site;
  project: ContentProject;
  version: ContentVersion;
  assetUrl?: string | null;
};

export type PublisherAdapter = {
  publishDraft(context: PublisherContext): Promise<PublishResult>;
  updateDraft(context: PublisherContext, externalId: string): Promise<PublishResult>;
  publish(context: PublisherContext, externalId?: string | null): Promise<PublishResult>;
  unpublish(context: PublisherContext, externalId: string): Promise<PublishResult>;
  uploadAsset?(context: PublisherContext): Promise<string | null>;
  getPublicationStatus?(context: PublisherContext, externalId: string): Promise<Record<string, unknown>>;
};

export type AssetVariantInput = {
  tenantId: string;
  siteId?: string | null;
  contentImageId: string;
  kind?: AssetKind;
  storagePath: string;
  mimeType: string;
  width?: number | null;
  height?: number | null;
};

export type PaginationQuery = {
  page?: number;
  pageSize?: number;
};

export type PaginatedResult<T> = {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
};

export type StudioSession = {
  tenant: Pick<Tenant, "id" | "name" | "slug" | "status">;
  authMode: StudioSessionAuthMode | "api_key";
  user: {
    id: string;
    email: string;
    displayName: string;
    avatarUrl: string | null;
    status: StudioUserStatus | "active";
    lastLoginAt: Date | null;
  };
  roles: string[];
  permissions: string[];
  identityProvider: {
    enabled: boolean;
    issuer: string | null;
    provisioningMode: StudioProvisioningMode;
  } | null;
  siteCount: number;
  projectCount: number;
};

export type StudioAccountWorkspaceSummary = {
  workspace: Pick<Tenant, "id" | "name" | "slug" | "status">;
  membershipStatus: StudioUserStatus;
  requiresSso: boolean;
  preferred: boolean;
};

export type StudioLoginOptions = {
  email: string;
  account: Pick<
    StudioAccount,
    "id" | "email" | "displayName" | "avatarUrl" | "status" | "lastWorkspaceId" | "emailVerifiedAt"
  > | null;
  accountState: StudioAccountStatus | "no_access";
  canUsePassword: boolean;
  canUseGoogle: boolean;
  googleClientId: string | null;
  needsActivation: boolean;
  localWorkspaces: StudioAccountWorkspaceSummary[];
  ssoWorkspaces: StudioAccountWorkspaceSummary[];
  recommendedWorkspaceId: string | null;
  requestAccessUrl: string;
};

export type StudioPasswordLoginInput = {
  email: string;
  password: string;
  workspaceId?: string | null;
};

export type StudioGoogleLoginInput = {
  credential: string;
  emailHint?: string | null;
  workspaceId?: string | null;
};

export type StudioActivationInput = {
  token: string;
  password: string;
  workspaceId?: string | null;
};

export type StudioPasswordResetInput = {
  token: string;
  password: string;
};

export type StudioIdentityProviderConfig = Pick<
  StudioIdentityProvider,
  "enabled" | "issuer" | "clientId" | "scopes" | "provisioningMode"
> & {
  claimMappings: Record<string, unknown> | null;
  hasClientSecret: boolean;
};

export type UpdateStudioIdentityProviderInput = {
  enabled?: boolean;
  issuer?: string;
  clientId?: string;
  clientSecret?: string | null;
  scopes?: string;
  claimMappings?: Record<string, unknown> | null;
  provisioningMode?: StudioProvisioningMode;
};

export type StudioUserRoleSummary = Pick<StudioRole, "id" | "key" | "name" | "description" | "isSystem">;

export type StudioUserSummary = Pick<
  StudioUser,
  "id" | "email" | "displayName" | "avatarUrl" | "status" | "lastLoginAt" | "createdAt" | "updatedAt"
> & {
  authProvider: "oidc" | "invitation";
  roles: StudioUserRoleSummary[];
};

export type CreateStudioInvitationInput = {
  email: string;
  displayName?: string | null;
  roleKeys?: string[];
};

export type UpdateStudioUserInput = {
  displayName?: string;
  status?: StudioUserStatus;
};

export type StudioInvitationSummary = Pick<
  StudioInvitation,
  "id" | "email" | "displayName" | "status" | "acceptedAt" | "createdAt" | "updatedAt"
> & {
  userId: string | null;
};

export type StudioRoleSummary = Pick<
  StudioRole,
  "id" | "key" | "name" | "description" | "isSystem" | "createdAt" | "updatedAt"
> & {
  permissions: StudioPermission[];
  memberCount: number;
};

export type CreateStudioRoleInput = {
  key?: string;
  name: string;
  description?: string | null;
  permissions: StudioPermission[];
  cloneFromRoleId?: string | null;
};

export type UpdateStudioRoleInput = {
  name?: string;
  description?: string | null;
  permissions?: StudioPermission[];
};

export type StudioPromptVersionSummary = Pick<
  StudioPromptVersion,
  "id" | "versionNumber" | "status" | "notes" | "approvedAt" | "createdAt" | "updatedAt"
> & {
  createdBy: Pick<StudioUser, "id" | "displayName" | "email"> | null;
  approvedBy: Pick<StudioUser, "id" | "displayName" | "email"> | null;
};

export type StudioPromptAssignmentSummary = Pick<
  StudioPromptAssignment,
  "id" | "surface" | "assignmentKey" | "siteId" | "createdAt" | "updatedAt"
> & {
  site: Pick<Site, "id" | "name" | "key"> | null;
  version: Pick<StudioPromptVersion, "id" | "versionNumber" | "status">;
};

export type StudioPromptPresetSummary = Pick<
  StudioPromptPreset,
  "id" | "key" | "name" | "surface" | "scope" | "description" | "siteId" | "createdAt" | "updatedAt"
> & {
  site: Pick<Site, "id" | "name" | "key"> | null;
  latestVersion: StudioPromptVersionSummary | null;
  activeAssignment: StudioPromptAssignmentSummary | null;
};

export type StudioPromptPreview = {
  systemPrompt: string;
  userPrompt: string;
  variables: Record<string, string>;
  source: "manual" | "site" | "global" | "fallback";
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
  preview: StudioPromptPreview | null;
};

export type CreateStudioPromptPresetInput = {
  key?: string;
  name: string;
  surface: StudioPromptSurface;
  scope?: StudioPromptScope;
  siteId?: string | null;
  description?: string | null;
  systemTemplate?: string | null;
  userTemplate: string;
  variablesJson?: Record<string, unknown> | null;
  notes?: string | null;
};

export type CreateStudioPromptVersionInput = {
  systemTemplate?: string | null;
  userTemplate: string;
  variablesJson?: Record<string, unknown> | null;
  notes?: string | null;
};

export type UpdateStudioPromptVersionInput = {
  status?: StudioPromptVersionStatus;
  systemTemplate?: string | null;
  userTemplate?: string;
  variablesJson?: Record<string, unknown> | null;
  notes?: string | null;
};

export type AssignStudioPromptInput = {
  versionId: string;
  siteId?: string | null;
};

export type StudioSiteSummary = Pick<
  Site,
  | "id"
  | "key"
  | "name"
  | "type"
  | "locale"
  | "baseUrl"
  | "publishingCredentialsRef"
  | "createdAt"
  | "updatedAt"
> & {
  projectCount: number;
  publishedProjectCount: number;
  latestPublicationJob: Pick<
    PublicationJob,
    "id" | "status" | "externalUrl" | "createdAt" | "publishedAt" | "error"
  > | null;
};

export type ListProjectsInput = PaginationQuery & {
  siteId?: string;
  status?: ProjectStatus;
  goal?: ProjectGoal;
};

export type PublicationExecutionState = Pick<
  PublicationJob,
  | "id"
  | "status"
  | "action"
  | "externalId"
  | "externalUrl"
  | "error"
  | "createdAt"
  | "updatedAt"
  | "publishedAt"
> & {
  targetStatus: PublicationTargetStatus | null;
};

export type ReviewGateStage =
  | "awaiting_generation"
  | "needs_review"
  | "qa_blocked"
  | "ready_to_approve"
  | "approved"
  | "publish_queued"
  | "publish_failed"
  | "published";

export type ReviewGateSummary = {
  stage: ReviewGateStage;
  compareReady: boolean;
  approvalReady: boolean;
  publishReady: boolean;
  blockerCount: number;
  warningCount: number;
  blockers: string[];
  warnings: string[];
  nextAction: string;
  primaryConcern: string;
};

export type VersionSummary = Pick<
  ContentVersion,
  | "id"
  | "versionNumber"
  | "status"
  | "title"
  | "excerpt"
  | "seoTitle"
  | "seoDescription"
  | "feedback"
  | "createdAt"
  | "updatedAt"
  | "approvedAt"
  | "approvedBy"
  | "publishedAt"
> & {
  qaState: "not_ready" | "failed" | "passed" | "approved" | "published";
  hasAsset: boolean;
  assetUrl: string | null;
  promptPresetVersionId: string | null;
  promptVersionLabel: string | null;
  promptPresetName: string | null;
  promptPresetKey: string | null;
  wordCount: number;
  qaFailureCount: number;
  qaWarningCount: number;
  derivativeCount: number;
  latestPublicationJob: PublicationExecutionState | null;
  qaReport: ContentVersion["qaReport"];
};

export type StudioProjectSummary = Pick<
  ContentProject,
  | "id"
  | "siteId"
  | "title"
  | "brief"
  | "goal"
  | "status"
  | "primaryLanguage"
  | "createdAt"
  | "updatedAt"
> & {
  site: Pick<Site, "id" | "key" | "name" | "type" | "locale" | "baseUrl">;
  versionCount: number;
  reviewGate: ReviewGateSummary;
  latestVersion: VersionSummary | null;
  latestPublicationJob: PublicationExecutionState | null;
};

export type ProjectVersionDetail = VersionSummary & {
  bodyHtml: string | null;
};

export type StudioProjectDetailView = StudioProjectSummary & {
  metadata: ContentProject["metadata"];
  site: Pick<
    Site,
    | "id"
    | "key"
    | "name"
    | "type"
    | "locale"
    | "baseUrl"
    | "brandVoice"
    | "seoRules"
    | "taxonomyMap"
    | "publishingCredentialsRef"
  >;
  topic: { id: string; title: string | null } | null;
  latestAssetUrl: string | null;
  latestVersion: (VersionSummary & {
    bodyHtml: string | null;
    derivatives: Array<{
      id: string;
      type: DerivativeType;
      title: string | null;
      body: string;
      status: string;
      createdAt: Date;
      updatedAt: Date;
    }>;
    assetVariants: Array<{
      id: string;
      kind: AssetKind;
      storagePath: string;
      mimeType: string;
      width: number | null;
      height: number | null;
      createdAt: Date;
      updatedAt: Date;
      publicUrl: string | null;
    }>;
  }) | null;
  versions: ProjectVersionDetail[];
  publicationJobs: PublicationExecutionState[];
};

export type UpdateSiteInput = {
  name?: string;
  locale?: string;
  baseUrl?: string | null;
  brandVoice?: Record<string, unknown> | null;
  seoRules?: Record<string, unknown> | null;
  taxonomyMap?: Record<string, unknown> | null;
  publishingCredentialsRef?: string | null;
  type?: SiteType;
};
