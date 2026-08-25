import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { STUDIO_ORIGIN } from '../infrastructure/http/studio-origin.token';
import type {
  AiUsageRow,
  AutomationPolicy,
  AutomationStatus,
  CalendarEvent,
  ConnectorCapabilitiesResponse,
  ConnectorInstallation,
  ConnectorKind,
  CreateProjectPayload,
  CreateSitePayload,
  InstallationDetailResponse,
  ListProjectsFilters,
  NotificationListResponse,
  NotificationPreference,
  OperationItem,
  OperationListResponse,
  PaginatedResponse,
  PublicationChannel,
  PublicationListItem,
  ProjectGoal,
  ProjectStatus,
  PublishProjectPayload,
  PublishingAccount,
  BlockedDomain,
  DiscoveredDomain,
  DiscoverySettings,
  DiscoverySettingsResponse,
  SocialConnection,
  SocialConnectionSession,
  SocialSetupInfo,
  SourceRecommendation,
  EditorialPlan,
  InternalLinkSuggestion,
  SiteIndexedPageRow,
  SiteIntelligenceOverview,
  PublishingWindow,
  SourceItemStatus,
  SourceType,
  StudioAuthProviders,
  StudioInvitationSummary,
  StudioMediaItem,
  StudioNotification,
  StudioOverview,
  StudioProjectDetailView,
  StudioProjectSummary,
  StudioPublication,
  StudioRoleSummary,
  StudioSession,
  StudioSite,
  StudioSiteDetail,
  StudioSiteSummary,
  StudioSocialContent,
  StudioSource,
  StudioSourceItem,
  StudioStoryCluster,
  StudioUserSummary,
  UpdateProjectPayload,
  UpdateSitePayload,
  WebsiteDiscoveryResult,
  WorkerHealth,
} from '../models/studio.models';

@Injectable({ providedIn: 'root' })
export class StudioApiService {
  private readonly http = inject(HttpClient);
  private readonly origin = inject(STUDIO_ORIGIN);
  private readonly apiBase = `${this.origin}/studio/api`;

  getAuthProviders(): Observable<StudioAuthProviders> {
    return this.http.get<StudioAuthProviders>(`${this.apiBase}/auth/providers`);
  }

  loginWithPassword(payload: {
    email: string;
    password: string;
    workspaceId?: string | null;
  }): Observable<StudioSession> {
    return this.http.post<StudioSession>(`${this.apiBase}/auth/login/password`, payload);
  }

  loginWithGoogle(payload: {
    credential: string;
    emailHint?: string | null;
    workspaceId?: string | null;
  }): Observable<StudioSession> {
    return this.http.post<StudioSession>(`${this.apiBase}/auth/login/google`, payload);
  }

  sendPasswordReset(email: string): Observable<{ ok: true }> {
    return this.http.post<{ ok: true }>(`${this.apiBase}/auth/password/forgot`, { email });
  }

  resetPassword(payload: { token: string; password: string }): Observable<{ ok: true }> {
    return this.http.post<{ ok: true }>(`${this.apiBase}/auth/password/reset`, payload);
  }

  acceptInvitation(payload: {
    token: string;
    password: string;
    workspaceId?: string | null;
  }): Observable<unknown> {
    return this.http.post<unknown>(`${this.apiBase}/auth/invitations/accept`, payload);
  }

  logout(): Observable<{ ok: true }> {
    return this.http.post<{ ok: true }>(`${this.apiBase}/session/logout`, {});
  }

  getSession(): Observable<StudioSession> {
    return this.http.get<StudioSession>(`${this.apiBase}/session/me`);
  }

  setActiveSite(siteId: string): Observable<StudioSession> {
    return this.http.post<StudioSession>(`${this.apiBase}/session/active-site`, { siteId });
  }

  listSites(): Observable<{ items: StudioSite[] }> {
    return this.http.get<{ items: StudioSite[] }>(`${this.apiBase}/sites`);
  }

  listTenantSites(page = 1, pageSize = 20): Observable<PaginatedResponse<StudioSiteSummary>> {
    return this.http.get<PaginatedResponse<StudioSiteSummary>>(
      `${this.apiBase}/backend/v2/sites`,
      {
        params: new HttpParams()
          .set('page', page)
          .set('pageSize', pageSize),
      },
    );
  }

  getSite(siteId: string): Observable<StudioSiteDetail> {
    return this.http.get<StudioSiteDetail>(`${this.apiBase}/backend/v2/sites/${siteId}`);
  }

  createSite(payload: CreateSitePayload): Observable<StudioSiteDetail> {
    return this.http.post<StudioSiteDetail>(`${this.apiBase}/backend/v2/sites`, payload);
  }

  updateSite(siteId: string, payload: UpdateSitePayload): Observable<StudioSiteDetail> {
    return this.http.put<StudioSiteDetail>(
      `${this.apiBase}/backend/v2/sites/${siteId}`,
      payload,
    );
  }

  listProjects(
    filters: ListProjectsFilters = {},
  ): Observable<PaginatedResponse<StudioProjectSummary>> {
    let params = new HttpParams()
      .set('page', filters.page ?? 1)
      .set('pageSize', filters.pageSize ?? 20);

    if (filters.siteId) {
      params = params.set('siteId', filters.siteId);
    }
    if (filters.status) {
      params = params.set('status', filters.status);
    }
    if (filters.goal) {
      params = params.set('goal', filters.goal);
    }
    if (filters.search) {
      params = params.set('search', filters.search);
    }
    if (filters.origin) {
      params = params.set('origin', filters.origin);
    }
    if (filters.archived) {
      params = params.set('archived', 'true');
    }

    return this.http.get<PaginatedResponse<StudioProjectSummary>>(
      `${this.apiBase}/backend/v2/projects`,
      { params },
    );
  }

  createProject(payload: CreateProjectPayload): Observable<{ id: string }> {
    return this.http.post<{ id: string }>(`${this.apiBase}/backend/v2/projects`, payload);
  }

  updateProject(
    projectId: string,
    payload: UpdateProjectPayload,
  ): Observable<StudioProjectDetailView> {
    return this.http.put<StudioProjectDetailView>(
      `${this.apiBase}/backend/v2/projects/${projectId}`,
      payload,
    );
  }

  duplicateProject(projectId: string): Observable<{ id: string }> {
    return this.http.post<{ id: string }>(`${this.apiBase}/backend/v2/projects/${projectId}/duplicate`, {});
  }

  getProject(projectId: string): Observable<StudioProjectDetailView> {
    return this.http.get<StudioProjectDetailView>(
      `${this.apiBase}/backend/v2/projects/${projectId}`,
    );
  }

  generateProject(projectId: string, feedback?: string): Observable<unknown> {
    return this.http.post(`${this.apiBase}/backend/v2/projects/${projectId}/generate`, {
      ...(feedback ? { feedback } : {}),
    });
  }

  reviseProject(projectId: string, feedback: string): Observable<unknown> {
    return this.http.post(`${this.apiBase}/backend/v2/projects/${projectId}/revise`, {
      feedback,
    });
  }

  approveProject(projectId: string): Observable<unknown> {
    return this.http.post(`${this.apiBase}/backend/v2/projects/${projectId}/approve`, {});
  }

  publishProject(
    projectId: string,
    payload: PublishProjectPayload = { action: 'publish', targetStatus: 'publish' },
  ): Observable<unknown> {
    return this.http.post(`${this.apiBase}/backend/v2/projects/${projectId}/publish`, {
      action: payload.action ?? 'publish',
      targetStatus: payload.targetStatus ?? 'publish',
    });
  }

  generateAsset(projectId: string, versionId?: string): Observable<unknown> {
    return this.http.post(`${this.apiBase}/backend/v2/assets/generate`, {
      projectId,
      ...(versionId ? { versionId } : {}),
    });
  }

  retryImage(imageId: string): Observable<unknown> {
    return this.http.post(`${this.apiBase}/backend/v2/content-images/${imageId}/retry`, {});
  }

  deleteMedia(imageId: string): Observable<{ ok: true }> {
    return this.http.delete<{ ok: true }>(`${this.apiBase}/backend/v2/media/${imageId}`);
  }

  bulkDeleteMedia(itemIds: string[]): Observable<{ ok: true; deletedCount: number }> {
    return this.http.post<{ ok: true; deletedCount: number }>(`${this.apiBase}/backend/v2/media/bulk-delete`, { itemIds });
  }

  listMedia(
    page = 1,
    pageSize = 24,
    filters: { siteId?: string; status?: string; unused?: boolean } = {},
  ): Observable<PaginatedResponse<StudioMediaItem>> {
    let params = new HttpParams().set('page', page).set('pageSize', pageSize);
    if (filters.siteId) {
      params = params.set('siteId', filters.siteId);
    }
    if (filters.status) {
      params = params.set('status', filters.status);
    }
    if (filters.unused) {
      params = params.set('unused', 'true');
    }
    return this.http.get<PaginatedResponse<StudioMediaItem>>(
      `${this.apiBase}/backend/v2/media`,
      { params },
    );
  }

  updateVersionContent(
    versionId: string,
    payload: {
      title?: string;
      excerpt?: string;
      bodyHtml?: string;
      seoTitle?: string;
      seoDescription?: string;
    },
  ): Observable<{ id: string; status: string; qaReport: unknown }> {
    return this.http.patch<{ id: string; status: string; qaReport: unknown }>(
      `${this.apiBase}/backend/v2/versions/${versionId}`,
      payload,
    );
  }

  listPublications(
    page = 1,
    pageSize = 10,
    status?: ProjectStatus | 'queued' | 'processing' | 'draft_synced' | 'failed' | 'canceled' | 'published',
  ): Observable<PaginatedResponse<PublicationListItem>> {
    let params = new HttpParams().set('page', page).set('pageSize', pageSize);
    if (status) {
      params = params.set('status', status);
    }

    return this.http.get<PaginatedResponse<PublicationListItem>>(
      `${this.apiBase}/backend/v2/publications`,
      { params },
    );
  }

  listUsers(): Observable<StudioUserSummary[]> {
    return this.http.get<StudioUserSummary[]>(`${this.apiBase}/backend/v2/users`);
  }

  inviteUser(payload: {
    email: string;
    displayName?: string | null;
    roleKeys?: string[];
  }): Observable<StudioInvitationSummary> {
    return this.http.post<StudioInvitationSummary>(
      `${this.apiBase}/backend/v2/users/invitations`,
      payload,
    );
  }

  updateUser(
    userId: string,
    payload: { displayName?: string; status?: 'invited' | 'active' | 'suspended' },
  ): Observable<StudioUserSummary> {
    return this.http.patch<StudioUserSummary>(
      `${this.apiBase}/backend/v2/users/${userId}`,
      payload,
    );
  }

  assignRole(userId: string, roleId: string): Observable<void> {
    return this.http.post<void>(`${this.apiBase}/backend/v2/users/${userId}/roles`, {
      roleId,
    });
  }

  removeRole(userId: string, roleId: string): Observable<void> {
    return this.http.delete<void>(`${this.apiBase}/backend/v2/users/${userId}/roles/${roleId}`);
  }

  listRoles(): Observable<StudioRoleSummary[]> {
    return this.http.get<StudioRoleSummary[]>(`${this.apiBase}/backend/v2/roles`);
  }

  // ─── Editorial platform: sources ──────────────────────────────────────

  listSources(page = 1, pageSize = 50, filters: { type?: SourceType; enabled?: boolean } = {}): Observable<PaginatedResponse<StudioSource>> {
    let params = new HttpParams().set('page', page).set('pageSize', pageSize);
    if (filters.type) {
      params = params.set('type', filters.type);
    }
    if (filters.enabled !== undefined) {
      params = params.set('enabled', filters.enabled);
    }
    return this.http.get<PaginatedResponse<StudioSource>>(`${this.apiBase}/backend/v2/sources`, { params });
  }

  createSource(payload: {
    name: string;
    type: SourceType;
    url?: string;
    siteId?: string;
    priority?: number;
    trustScore?: number;
    language?: string;
    categories?: string[];
    tags?: string[];
    refreshIntervalMinutes?: number;
  }): Observable<StudioSource> {
    return this.http.post<StudioSource>(`${this.apiBase}/backend/v2/sources`, payload);
  }

  updateSource(sourceId: string, payload: Record<string, unknown>): Observable<StudioSource> {
    return this.http.patch<StudioSource>(`${this.apiBase}/backend/v2/sources/${sourceId}`, payload);
  }

  deleteSource(sourceId: string): Observable<{ ok: true }> {
    return this.http.delete<{ ok: true }>(`${this.apiBase}/backend/v2/sources/${sourceId}`);
  }

  testSource(sourceId: string): Observable<{ ok: boolean; itemCount?: number; message?: string }> {
    return this.http.post<{ ok: boolean; itemCount?: number; message?: string }>(
      `${this.apiBase}/backend/v2/sources/${sourceId}/test`,
      {},
    );
  }

  fetchSource(sourceId: string): Observable<{ fetched: number; created: number; duplicates: number; failed: boolean; error: string | null }> {
    return this.http.post<{ fetched: number; created: number; duplicates: number; failed: boolean; error: string | null }>(
      `${this.apiBase}/backend/v2/sources/${sourceId}/fetch`,
      {},
    );
  }

  // ─── Editorial platform: inbox ─────────────────────────────────────────

  listSourceItems(
    page = 1,
    pageSize = 20,
    filters: {
      sourceId?: string;
      status?: SourceItemStatus;
      search?: string;
      minScore?: number;
      sort?: 'discovered' | 'score';
      direction?: 'asc' | 'desc';
    } = {},
  ): Observable<PaginatedResponse<StudioSourceItem>> {
    let params = new HttpParams().set('page', page).set('pageSize', pageSize);
    if (filters.sourceId) {
      params = params.set('sourceId', filters.sourceId);
    }
    if (filters.status) {
      params = params.set('status', filters.status);
    }
    if (filters.search) {
      params = params.set('search', filters.search);
    }
    if (filters.minScore !== undefined) {
      params = params.set('minScore', filters.minScore);
    }
    if (filters.sort) {
      params = params.set('sort', filters.sort);
    }
    if (filters.direction) {
      params = params.set('direction', filters.direction);
    }
    return this.http.get<PaginatedResponse<StudioSourceItem>>(`${this.apiBase}/backend/v2/source-items`, { params });
  }

  getSourceItem(itemId: string): Observable<StudioSourceItem & {
    cluster: (StudioStoryCluster & { items: StudioSourceItem[] }) | null;
    cleanedText: string | null;
  }> {
    return this.http.get<StudioSourceItem & {
      cluster: (StudioStoryCluster & { items: StudioSourceItem[] }) | null;
      cleanedText: string | null;
    }>(`${this.apiBase}/backend/v2/source-items/${itemId}`);
  }

  setSourceItemStatus(itemId: string, status: SourceItemStatus): Observable<StudioSourceItem> {
    return this.http.post<StudioSourceItem>(`${this.apiBase}/backend/v2/source-items/${itemId}/${status === 'selected' ? 'select' : status === 'rejected' ? 'reject' : 'select'}`, {});
  }

  createProjectFromSourceItem(payload: {
    siteId: string;
    sourceItemId?: string;
    goal?: 'news_article' | 'article';
    allowUpdateExisting?: boolean;
  }): Observable<{ kind: string; projectId: string; coveredByProjectId?: string }> {
    const itemId = payload.sourceItemId;
    return this.http.post<{ kind: string; projectId: string; coveredByProjectId?: string }>(
      `${this.apiBase}/backend/v2/source-items/${itemId}/create-project`,
      { siteId: payload.siteId, goal: payload.goal, allowUpdateExisting: payload.allowUpdateExisting },
    );
  }

  listStoryClusters(page = 1, pageSize = 20, status?: string): Observable<PaginatedResponse<StudioStoryCluster>> {
    let params = new HttpParams().set('page', page).set('pageSize', pageSize);
    if (status) {
      params = params.set('status', status);
    }
    return this.http.get<PaginatedResponse<StudioStoryCluster>>(`${this.apiBase}/backend/v2/story-clusters`, { params });
  }

  // ─── Editorial platform: publications & calendar ──────────────────────

  listPublicationsV2(
    page = 1,
    pageSize = 20,
    filters: {
      channel?: PublicationChannel;
      status?: string;
      projectId?: string;
      siteId?: string;
      search?: string;
      dateFrom?: string;
      dateTo?: string;
      sort?: 'scheduled' | 'created' | 'updated';
      direction?: 'asc' | 'desc';
      failed?: boolean;
    } = {},
  ): Observable<PaginatedResponse<StudioPublication>> {
    let params = new HttpParams().set('page', page).set('pageSize', pageSize);
    if (filters.channel) {
      params = params.set('channel', filters.channel);
    }
    if (filters.status) {
      params = params.set('status', filters.status);
    }
    if (filters.projectId) {
      params = params.set('projectId', filters.projectId);
    }
    if (filters.siteId) {
      params = params.set('siteId', filters.siteId);
    }
    if (filters.search) {
      params = params.set('search', filters.search);
    }
    if (filters.dateFrom) {
      params = params.set('dateFrom', filters.dateFrom);
    }
    if (filters.dateTo) {
      params = params.set('dateTo', filters.dateTo);
    }
    if (filters.sort) {
      params = params.set('sort', filters.sort);
    }
    if (filters.direction) {
      params = params.set('direction', filters.direction);
    }
    if (filters.failed) {
      params = params.set('failed', 'true');
    }
    return this.http.get<PaginatedResponse<StudioPublication>>(`${this.apiBase}/backend/v2/publications`, { params });
  }

  getPublication(publicationId: string): Observable<StudioPublication> {
    return this.http.get<StudioPublication>(`${this.apiBase}/backend/v2/publications/${publicationId}`);
  }

  createPublication(payload: {
    projectId: string;
    versionId?: string;
    channel: PublicationChannel;
    accountId?: string;
    siteId?: string;
    socialContentId?: string;
    scheduledFor?: string;
  }): Observable<StudioPublication> {
    return this.http.post<StudioPublication>(`${this.apiBase}/backend/v2/publications`, payload);
  }

  reschedulePublication(publicationId: string, scheduledFor: string): Observable<StudioPublication> {
    return this.http.post<StudioPublication>(`${this.apiBase}/backend/v2/publications/${publicationId}/reschedule`, { scheduledFor });
  }

  cancelPublication(publicationId: string): Observable<StudioPublication> {
    return this.http.post<StudioPublication>(`${this.apiBase}/backend/v2/publications/${publicationId}/cancel`, {});
  }

  retryPublication(publicationId: string): Observable<StudioPublication> {
    return this.http.post<StudioPublication>(`${this.apiBase}/backend/v2/publications/${publicationId}/retry`, {});
  }

  publishNow(publicationId: string): Observable<StudioPublication> {
    return this.http.post<StudioPublication>(`${this.apiBase}/backend/v2/publications/${publicationId}/publish-now`, {});
  }

  deletePublication(publicationId: string): Observable<StudioPublication> {
    return this.http.delete<StudioPublication>(`${this.apiBase}/backend/v2/publications/${publicationId}`);
  }

  unpublishPublication(publicationId: string): Observable<StudioPublication> {
    return this.http.post<StudioPublication>(`${this.apiBase}/backend/v2/publications/${publicationId}/unpublish`, {});
  }

  listCalendar(from: string, to: string, channel?: PublicationChannel, siteId?: string): Observable<{ items: CalendarEvent[] }> {
    let params = new HttpParams().set('from', from).set('to', to);
    if (channel) {
      params = params.set('channel', channel);
    }
    if (siteId) {
      params = params.set('siteId', siteId);
    }
    return this.http.get<{ items: CalendarEvent[] }>(`${this.apiBase}/backend/v2/calendar`, { params });
  }

  // ─── Editorial platform: social ───────────────────────────────────────

  listSocial(projectId: string, channel?: 'x' | 'instagram'): Observable<{ items: StudioSocialContent[] }> {
    let params = new HttpParams();
    if (channel) {
      params = params.set('channel', channel);
    }
    return this.http.get<{ items: StudioSocialContent[] }>(`${this.apiBase}/backend/v2/projects/${projectId}/social`, { params });
  }

  generateSocial(projectId: string, payload: { channels: Array<'x' | 'instagram'>; threadLength?: number; versionId?: string }): Observable<{ job_id: string }> {
    return this.http.post<{ job_id: string }>(`${this.apiBase}/backend/v2/projects/${projectId}/social/generate`, payload);
  }

  updateSocial(socialId: string, payload: {
    body?: string;
    hashtags?: string[];
    editorialStatus?: 'draft' | 'approved' | 'rejected';
    mediaAssetIds?: string[];
  }): Observable<StudioSocialContent> {
    return this.http.patch<StudioSocialContent>(`${this.apiBase}/backend/v2/social/${socialId}`, payload);
  }

  regenerateSocial(socialId: string): Observable<{ job_id: string }> {
    return this.http.post<{ job_id: string }>(`${this.apiBase}/backend/v2/social/${socialId}/regenerate`, {});
  }

  // ─── Editorial platform: accounts & automation ────────────────────────

  listPublishingAccounts(platform?: string): Observable<{ items: PublishingAccount[] }> {
    let params = new HttpParams();
    if (platform) {
      params = params.set('platform', platform);
    }
    return this.http.get<{ items: PublishingAccount[] }>(`${this.apiBase}/backend/v2/publishing-accounts`, { params });
  }

  createPublishingAccount(payload: {
    platform: 'website' | 'x' | 'instagram';
    displayName: string;
    credentialsRef?: string;
    externalAccountId?: string;
    siteId?: string;
  }): Observable<PublishingAccount> {
    return this.http.post<PublishingAccount>(`${this.apiBase}/backend/v2/publishing-accounts`, payload);
  }

  updatePublishingAccount(accountId: string, payload: Record<string, unknown>): Observable<PublishingAccount> {
    return this.http.patch<PublishingAccount>(`${this.apiBase}/backend/v2/publishing-accounts/${accountId}`, payload);
  }

  deletePublishingAccount(accountId: string): Observable<{ ok: true }> {
    return this.http.delete<{ ok: true }>(`${this.apiBase}/backend/v2/publishing-accounts/${accountId}`);
  }

  verifyPublishingAccount(accountId: string): Observable<{ ok: boolean; message: string }> {
    return this.http.post<{ ok: boolean; message: string }>(`${this.apiBase}/backend/v2/publishing-accounts/${accountId}/verify`, {});
  }

  // ─── Social connections (OAuth / managed provider) ────────────────────

  listSocialConnections(): Observable<{ items: SocialConnection[]; provider: SocialSetupInfo['provider']; callbackUrl: string }> {
    return this.http.get<{ items: SocialConnection[]; provider: SocialSetupInfo['provider']; callbackUrl: string }>(`${this.apiBase}/backend/v2/social-connections`);
  }

  getSocialSetup(): Observable<SocialSetupInfo> {
    return this.http.get<SocialSetupInfo>(`${this.apiBase}/backend/v2/social-connections/setup`);
  }

  startSocialConnectionSession(platform: 'x' | 'instagram'): Observable<SocialConnectionSession> {
    return this.http.post<SocialConnectionSession>(`${this.apiBase}/backend/v2/social-connections/session`, { platform });
  }

  verifySocialConnection(connectionId: string): Observable<{ ok: boolean; state: string; message: string }> {
    return this.http.post<{ ok: boolean; state: string; message: string }>(`${this.apiBase}/backend/v2/social-connections/${connectionId}/verify`, {});
  }

  reconnectSocialConnection(connectionId: string): Observable<SocialConnectionSession> {
    return this.http.post<SocialConnectionSession>(`${this.apiBase}/backend/v2/social-connections/${connectionId}/reconnect`, {});
  }

  disconnectSocialConnection(connectionId: string): Observable<{ ok: boolean }> {
    return this.http.delete<{ ok: boolean }>(`${this.apiBase}/backend/v2/social-connections/${connectionId}`);
  }

  // ─── AI web discovery ─────────────────────────────────────────────────

  getDiscoverySettings(): Observable<DiscoverySettingsResponse> {
    return this.http.get<DiscoverySettingsResponse>(`${this.apiBase}/backend/v2/discovery/settings`);
  }

  updateDiscoverySettings(payload: Partial<DiscoverySettings>): Observable<DiscoverySettings> {
    return this.http.patch<DiscoverySettings>(`${this.apiBase}/backend/v2/discovery/settings`, payload);
  }

  runDiscoveryNow(): Observable<{ status: string }> {
    return this.http.post<{ status: string }>(`${this.apiBase}/backend/v2/discovery/run`, {});
  }

  listSourceRecommendations(page = 1, pageSize = 50, status?: string): Observable<PaginatedResponse<SourceRecommendation>> {
    let params = new HttpParams().set('page', page).set('pageSize', pageSize);
    if (status) {
      params = params.set('status', status);
    }
    return this.http.get<PaginatedResponse<SourceRecommendation>>(`${this.apiBase}/backend/v2/discovery/recommendations`, { params });
  }

  acceptSourceRecommendation(recommendationId: string): Observable<{ ok: boolean; sourceId: string }> {
    return this.http.post<{ ok: boolean; sourceId: string }>(`${this.apiBase}/backend/v2/discovery/recommendations/${recommendationId}/accept`, {});
  }

  dismissSourceRecommendation(recommendationId: string): Observable<{ ok: boolean }> {
    return this.http.post<{ ok: boolean }>(`${this.apiBase}/backend/v2/discovery/recommendations/${recommendationId}/dismiss`, {});
  }

  listDiscoveredDomains(page = 1, pageSize = 50, blocked = false): Observable<PaginatedResponse<DiscoveredDomain>> {
    let params = new HttpParams().set('page', page).set('pageSize', pageSize);
    if (blocked) {
      params = params.set('blocked', 'true');
    }
    return this.http.get<PaginatedResponse<DiscoveredDomain>>(`${this.apiBase}/backend/v2/discovery/domains`, { params });
  }

  blockDiscoveredDomain(domain: string, reason?: string): Observable<{ ok: boolean }> {
    return this.http.post<{ ok: boolean }>(`${this.apiBase}/backend/v2/discovery/domains/block`, { domain, reason });
  }

  unblockDiscoveredDomain(domain: string): Observable<{ ok: boolean }> {
    return this.http.post<{ ok: boolean }>(`${this.apiBase}/backend/v2/discovery/domains/unblock`, { domain });
  }

  listBlockedDomains(): Observable<{ items: BlockedDomain[] }> {
    return this.http.get<{ items: BlockedDomain[] }>(`${this.apiBase}/backend/v2/discovery/blocked-domains`);
  }

  listEditorialPlans(page = 1, pageSize = 20): Observable<PaginatedResponse<EditorialPlan>> {
    return this.http.get<PaginatedResponse<EditorialPlan>>(`${this.apiBase}/backend/v2/editorial-plans`, {
      params: new HttpParams().set('page', page).set('pageSize', pageSize),
    });
  }

  getEditorialPlan(planId: string): Observable<EditorialPlan> {
    return this.http.get<EditorialPlan>(`${this.apiBase}/backend/v2/editorial-plans/${planId}`);
  }

  generateEditorialPlan(payload: {
    siteId?: string;
    dateFrom: string;
    dateTo: string;
    objective?: string;
    channels: Array<'website' | 'x' | 'instagram'>;
    publicationCount: number;
    frequency?: string;
    timezone?: string;
    language?: string;
    audience?: string;
    topics?: string[];
    excludedTopics?: string[];
    strategyMode?: string;
    primaryIntent?: string;
    contentFormats?: string[];
    market?: string;
    campaignName?: string;
    existingCluster?: string;
    newCluster?: boolean;
    freeAiDiscovery?: boolean;
    seasonalEvents?: string[];
    brandsOrEntities?: string[];
    keywordSeeds?: string[];
  }): Observable<EditorialPlan> {
    return this.http.post<EditorialPlan>(`${this.apiBase}/backend/v2/editorial-plans/generate`, payload);
  }

  updateEditorialPlanItem(itemId: string, payload: Record<string, unknown>): Observable<EditorialPlan['items'] extends Array<infer Item> ? Item : never> {
    return this.http.patch<EditorialPlan['items'] extends Array<infer Item> ? Item : never>(`${this.apiBase}/backend/v2/editorial-plan-items/${itemId}`, payload);
  }

  approveEditorialPlanItem(itemId: string): Observable<unknown> {
    return this.http.post(`${this.apiBase}/backend/v2/editorial-plan-items/${itemId}/approve`, {});
  }

  bulkApproveEditorialPlanItems(itemIds: string[]): Observable<{ updatedCount: number }> {
    return this.http.post<{ updatedCount: number }>(`${this.apiBase}/backend/v2/editorial-plan-items/bulk-approve`, { itemIds });
  }

  bulkSetEditorialPlanItemStatus(itemIds: string[], status: 'approved' | 'rejected' | 'proposed' | 'canceled'): Observable<{ updatedCount: number }> {
    return this.http.post<{ updatedCount: number }>(`${this.apiBase}/backend/v2/editorial-plan-items/bulk-status`, { itemIds, status });
  }

  bulkDeleteEditorialPlanItems(itemIds: string[]): Observable<{ deletedCount: number }> {
    return this.http.post<{ deletedCount: number }>(`${this.apiBase}/backend/v2/editorial-plan-items/bulk-delete`, { itemIds });
  }

  deleteEditorialPlanItem(itemId: string): Observable<{ ok: true }> {
    return this.http.delete<{ ok: true }>(`${this.apiBase}/backend/v2/editorial-plan-items/${itemId}`);
  }

  // ── Site intelligence ────────────────────────────────────────────

  getSiteIntelligence(siteId: string): Observable<SiteIntelligenceOverview> {
    return this.http.get<SiteIntelligenceOverview>(`${this.apiBase}/backend/v2/site-intelligence/${siteId}`);
  }

  indexSite(
    siteId: string,
    options: { crawl?: boolean; budget?: number; changedOnly?: boolean; force?: boolean; wait?: boolean } = {},
  ): Observable<{ started: boolean; indexing?: boolean; result?: unknown }> {
    return this.http.post<{ started: boolean; indexing?: boolean; result?: unknown }>(`${this.apiBase}/backend/v2/site-intelligence/${siteId}/index`, options);
  }

  listSiteIntelligencePages(siteId: string, options: { q?: string; crawlState?: string; page?: number; pageSize?: number } = {}): Observable<PaginatedResponse<SiteIndexedPageRow>> {
    let params = new HttpParams();
    if (options.q) params = params.set('q', options.q);
    if (options.crawlState) params = params.set('crawlState', options.crawlState);
    if (options.page) params = params.set('page', options.page);
    if (options.pageSize) params = params.set('pageSize', options.pageSize);
    return this.http.get<PaginatedResponse<SiteIndexedPageRow>>(`${this.apiBase}/backend/v2/site-intelligence/${siteId}/pages`, { params });
  }

  suggestInternalLinks(siteId: string, options: { keyword?: string; topic?: string; q?: string; excludeUrl?: string; limit?: number } = {}): Observable<{ items: InternalLinkSuggestion[] }> {
    let params = new HttpParams();
    if (options.keyword) params = params.set('keyword', options.keyword);
    if (options.topic) params = params.set('topic', options.topic);
    if (options.q) params = params.set('q', options.q);
    if (options.excludeUrl) params = params.set('excludeUrl', options.excludeUrl);
    if (options.limit) params = params.set('limit', String(options.limit));
    return this.http.get<{ items: InternalLinkSuggestion[] }>(`${this.apiBase}/backend/v2/site-intelligence/${siteId}/internal-links`, { params });
  }

  generateContentFromEditorialPlanItem(itemId: string): Observable<unknown> {
    return this.http.post(`${this.apiBase}/backend/v2/editorial-plan-items/${itemId}/generate-content`, {});
  }

  getAutomationPolicy(siteId?: string): Observable<AutomationPolicy> {
    let params = new HttpParams();
    if (siteId) {
      params = params.set('siteId', siteId);
    }
    return this.http.get<AutomationPolicy>(`${this.apiBase}/backend/v2/automation`, { params });
  }

  updateAutomationPolicy(payload: Record<string, unknown>): Observable<AutomationPolicy> {
    return this.http.patch<AutomationPolicy>(`${this.apiBase}/backend/v2/automation`, payload);
  }

  getAutomationStatus(siteId?: string): Observable<AutomationStatus> {
    let params = new HttpParams();
    if (siteId) {
      params = params.set('siteId', siteId);
    }
    return this.http.get<AutomationStatus>(`${this.apiBase}/backend/v2/automation/status`, { params });
  }

  pauseAutomation(reason: string, siteId?: string): Observable<AutomationPolicy> {
    return this.http.post<AutomationPolicy>(`${this.apiBase}/backend/v2/automation/pause`, { reason, siteId });
  }

  resumeAutomation(siteId?: string): Observable<AutomationPolicy> {
    return this.http.post<AutomationPolicy>(`${this.apiBase}/backend/v2/automation/resume`, { siteId });
  }

  // ─── Editorial platform: overview & audit ─────────────────────────────

  getOverview(): Observable<StudioOverview> {
    return this.http.get<StudioOverview>(`${this.apiBase}/backend/v2/overview`);
  }

  getAiUsage(): Observable<{ rows: AiUsageRow[] }> {
    return this.http.get<{ rows: AiUsageRow[] }>(`${this.apiBase}/backend/v2/ai-usage`);
  }

  getWorkerHealth(): Observable<WorkerHealth> {
    return this.http.get<WorkerHealth>(`${this.apiBase}/backend/v2/health/workers`);
  }

  deleteProject(projectId: string, payload: { reason?: string; mode?: 'archive' | 'unpublish_delete' }): Observable<{ archived: boolean }> {
    return this.http.delete<{ archived: boolean }>(`${this.apiBase}/backend/v2/projects/${projectId}`, {
      body: payload,
    });
  }

  restoreProject(projectId: string): Observable<{ ok: true }> {
    return this.http.post<{ ok: true }>(`${this.apiBase}/backend/v2/projects/${projectId}/restore`, {});
  }

  // ─── Magic Installer (connector registry + installations) ─────────────

  getConnectorCapabilities(): Observable<ConnectorCapabilitiesResponse> {
    return this.http.get<ConnectorCapabilitiesResponse>(`${this.apiBase}/backend/v2/connectors/capabilities`);
  }

  discoverWebsite(url: string): Observable<WebsiteDiscoveryResult> {
    return this.http.post<WebsiteDiscoveryResult>(`${this.apiBase}/backend/v2/connectors/discover-website`, { url });
  }

  listConnectorInstallations(kind?: string, state?: string): Observable<{ items: ConnectorInstallation[] }> {
    let params = new HttpParams();
    if (kind) {
      params = params.set('kind', kind);
    }
    if (state) {
      params = params.set('state', state);
    }
    return this.http.get<{ items: ConnectorInstallation[] }>(`${this.apiBase}/backend/v2/connector-installations`, { params });
  }

  createConnectorInstallation(payload: { kind: ConnectorKind; provider: string; siteId?: string; displayName?: string }): Observable<ConnectorInstallation> {
    return this.http.post<ConnectorInstallation>(`${this.apiBase}/backend/v2/connector-installations`, payload);
  }

  getConnectorInstallation(id: string): Observable<InstallationDetailResponse> {
    return this.http.get<InstallationDetailResponse>(`${this.apiBase}/backend/v2/connector-installations/${id}`);
  }

  startInstallationDiscovery(id: string, url: string): Observable<{ operationId: string; state: string }> {
    return this.http.post<{ operationId: string; state: string }>(`${this.apiBase}/backend/v2/connector-installations/${id}/discover`, { url });
  }

  storeInstallationCredentials(id: string, payload: { secrets: Record<string, string>; config: Record<string, unknown> }): Observable<ConnectorInstallation> {
    return this.http.post<ConnectorInstallation>(`${this.apiBase}/backend/v2/connector-installations/${id}/credentials`, payload);
  }

  startInstallationVerification(id: string): Observable<{ operationId: string; state: string }> {
    return this.http.post<{ operationId: string; state: string }>(`${this.apiBase}/backend/v2/connector-installations/${id}/verify`, {});
  }

  startInstallationSocialSession(id: string): Observable<SocialConnectionSession> {
    return this.http.post<SocialConnectionSession>(`${this.apiBase}/backend/v2/connector-installations/${id}/social-session`, {});
  }

  activateInstallation(id: string, payload: { socialAccountId?: string } = {}): Observable<ConnectorInstallation> {
    return this.http.post<ConnectorInstallation>(`${this.apiBase}/backend/v2/connector-installations/${id}/activate`, payload);
  }

  cancelInstallation(id: string): Observable<ConnectorInstallation> {
    return this.http.post<ConnectorInstallation>(`${this.apiBase}/backend/v2/connector-installations/${id}/cancel`, {});
  }

  resumeInstallation(id: string): Observable<ConnectorInstallation> {
    return this.http.post<ConnectorInstallation>(`${this.apiBase}/backend/v2/connector-installations/${id}/resume`, {});
  }

  deleteConnectorInstallation(id: string): Observable<{ ok: true }> {
    return this.http.delete<{ ok: true }>(`${this.apiBase}/backend/v2/connector-installations/${id}`);
  }

  // ─── Activity Center (operations) ─────────────────────────────────────

  listOperations(filters: { page?: number; pageSize?: number; status?: string; type?: string; siteId?: string; search?: string } = {}): Observable<OperationListResponse> {
    let params = new HttpParams().set('page', filters.page ?? 1).set('pageSize', filters.pageSize ?? 20);
    if (filters.status) {
      params = params.set('status', filters.status);
    }
    if (filters.type) {
      params = params.set('type', filters.type);
    }
    if (filters.siteId) {
      params = params.set('siteId', filters.siteId);
    }
    if (filters.search) {
      params = params.set('search', filters.search);
    }
    return this.http.get<OperationListResponse>(`${this.apiBase}/backend/v2/operations`, { params });
  }

  getOperation(id: string): Observable<OperationItem> {
    return this.http.get<OperationItem>(`${this.apiBase}/backend/v2/operations/${id}`);
  }

  retryOperation(id: string): Observable<OperationItem & { requeued: boolean }> {
    return this.http.post<OperationItem & { requeued: boolean }>(`${this.apiBase}/backend/v2/operations/${id}/retry`, {});
  }

  cancelOperation(id: string): Observable<OperationItem & { queueCancelled: boolean }> {
    return this.http.post<OperationItem & { queueCancelled: boolean }>(`${this.apiBase}/backend/v2/operations/${id}/cancel`, {});
  }

  // ─── Notifications ────────────────────────────────────────────────────

  listNotifications(filters: { page?: number; pageSize?: number; unreadOnly?: boolean; category?: string; archived?: boolean } = {}): Observable<NotificationListResponse> {
    let params = new HttpParams().set('page', filters.page ?? 1).set('pageSize', filters.pageSize ?? 20);
    if (filters.unreadOnly) {
      params = params.set('unreadOnly', 'true');
    }
    if (filters.category) {
      params = params.set('category', filters.category);
    }
    if (filters.archived) {
      params = params.set('archived', 'true');
    }
    return this.http.get<NotificationListResponse>(`${this.apiBase}/backend/v2/notifications`, { params });
  }

  markNotificationRead(id: string, read: boolean): Observable<StudioNotification> {
    return this.http.post<StudioNotification>(`${this.apiBase}/backend/v2/notifications/${id}/read`, { read });
  }

  markAllNotificationsRead(category?: string): Observable<{ updated: number }> {
    return this.http.post<{ updated: number }>(`${this.apiBase}/backend/v2/notifications/read-all`, { category });
  }

  archiveNotification(id: string, archived: boolean): Observable<StudioNotification> {
    return this.http.post<StudioNotification>(`${this.apiBase}/backend/v2/notifications/${id}/archive`, { archived });
  }

  getNotificationPreferences(): Observable<{ preferences: NotificationPreference[] }> {
    return this.http.get<{ preferences: NotificationPreference[] }>(`${this.apiBase}/backend/v2/notifications/preferences`);
  }

  setNotificationPreference(category: string, enabled: boolean): Observable<NotificationPreference> {
    return this.http.put<NotificationPreference>(`${this.apiBase}/backend/v2/notifications/preferences`, { category, enabled });
  }
}
