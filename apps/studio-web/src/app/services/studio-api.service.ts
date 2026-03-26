import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { STUDIO_ORIGIN } from '../infrastructure/http/studio-origin.token';
import type {
  CreateProjectPayload,
  CreateSitePayload,
  ListProjectsFilters,
  PaginatedResponse,
  PublishProjectPayload,
  PublicationListItem,
  ProjectStatus,
  StudioIdentityProviderConfig,
  StudioLoginOptions,
  StudioInvitationSummary,
  StudioPromptAssignmentSummary,
  StudioPromptPresetDetail,
  StudioPromptPresetSummary,
  StudioPromptVersionSummary,
  StudioProjectDetailView,
  StudioProjectSummary,
  StudioRoleSummary,
  StudioSession,
  StudioSiteDetail,
  StudioSiteSummary,
  StudioUserSummary,
  StudioWorkspaceAccess,
  UpdateStudioIdentityProviderPayload,
  UpdateProjectPayload,
  UpdateSitePayload,
} from '../models/studio.models';

@Injectable({ providedIn: 'root' })
export class StudioApiService {
  private readonly http = inject(HttpClient);
  private readonly origin = inject(STUDIO_ORIGIN);
  private readonly apiBase = `${this.origin}/studio/api`;

  getLoginOptions(email: string): Observable<StudioLoginOptions> {
    return this.http.post<StudioLoginOptions>(`${this.apiBase}/auth/login/options`, {
      email,
    });
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
  }): Observable<StudioSession> {
    return this.http.post<StudioSession>(`${this.apiBase}/auth/invitations/accept`, payload);
  }

  login(apiKey: string, workspace?: string): Observable<StudioSession> {
    return this.http.post<StudioSession>(`${this.apiBase}/session/login`, {
      apiKey,
      ...(workspace ? { workspace } : {}),
    });
  }

  logout(): Observable<{ ok: true }> {
    return this.http.post<{ ok: true }>(`${this.apiBase}/session/logout`, {});
  }

  getSession(): Observable<StudioSession> {
    return this.http.get<StudioSession>(`${this.apiBase}/session/me`);
  }

  lookupWorkspaceAccess(workspace: string): Observable<StudioWorkspaceAccess> {
    return this.http.get<StudioWorkspaceAccess>(`${this.apiBase}/session/workspace`, {
      params: new HttpParams().set('workspace', workspace),
    });
  }

  getIdentityProvider(): Observable<StudioIdentityProviderConfig | null> {
    return this.http.get<StudioIdentityProviderConfig | null>(
      `${this.apiBase}/backend/v2/workspace/identity-provider`,
    );
  }

  updateIdentityProvider(
    payload: UpdateStudioIdentityProviderPayload,
  ): Observable<StudioIdentityProviderConfig> {
    return this.http.patch<StudioIdentityProviderConfig>(
      `${this.apiBase}/backend/v2/workspace/identity-provider`,
      payload,
    );
  }

  testIdentityProvider(
    payload: UpdateStudioIdentityProviderPayload,
  ): Observable<{
    ok: boolean;
    issuer?: string;
    authorizationEndpoint?: string | null;
    tokenEndpoint?: string | null;
    scopesSupported?: unknown;
    message?: string;
  }> {
    return this.http.post<{
      ok: boolean;
      issuer?: string;
      authorizationEndpoint?: string | null;
      tokenEndpoint?: string | null;
      scopesSupported?: unknown;
      message?: string;
    }>(`${this.apiBase}/backend/v2/workspace/identity-provider/test`, payload);
  }

  listSites(page = 1, pageSize = 20): Observable<PaginatedResponse<StudioSiteSummary>> {
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

  createRole(payload: {
    key?: string;
    name: string;
    description?: string | null;
    permissions: string[];
    cloneFromRoleId?: string | null;
  }): Observable<StudioRoleSummary> {
    return this.http.post<StudioRoleSummary>(`${this.apiBase}/backend/v2/roles`, payload);
  }

  updateRole(
    roleId: string,
    payload: {
      name?: string;
      description?: string | null;
      permissions?: string[];
    },
  ): Observable<StudioRoleSummary> {
    return this.http.patch<StudioRoleSummary>(
      `${this.apiBase}/backend/v2/roles/${roleId}`,
      payload,
    );
  }

  listPromptPresets(): Observable<StudioPromptPresetSummary[]> {
    return this.http.get<StudioPromptPresetSummary[]>(`${this.apiBase}/backend/v2/prompts`);
  }

  getPromptPreset(
    promptId: string,
    projectId?: string | null,
  ): Observable<StudioPromptPresetDetail> {
    let params = new HttpParams();
    if (projectId) {
      params = params.set('projectId', projectId);
    }
    return this.http.get<StudioPromptPresetDetail>(
      `${this.apiBase}/backend/v2/prompts/${promptId}`,
      { params },
    );
  }

  createPromptPreset(payload: {
    key?: string;
    name: string;
    surface: string;
    scope?: string;
    siteId?: string | null;
    description?: string | null;
    systemTemplate?: string | null;
    userTemplate: string;
    variablesJson?: Record<string, unknown> | null;
    notes?: string | null;
  }): Observable<StudioPromptPresetDetail> {
    return this.http.post<StudioPromptPresetDetail>(
      `${this.apiBase}/backend/v2/prompts`,
      payload,
    );
  }

  createPromptVersion(
    promptId: string,
    payload: {
      systemTemplate?: string | null;
      userTemplate: string;
      variablesJson?: Record<string, unknown> | null;
      notes?: string | null;
    },
  ): Observable<StudioPromptVersionSummary> {
    return this.http.post<StudioPromptVersionSummary>(
      `${this.apiBase}/backend/v2/prompts/${promptId}/versions`,
      payload,
    );
  }

  updatePromptVersion(
    promptId: string,
    versionId: string,
    payload: {
      status?: string;
      systemTemplate?: string | null;
      userTemplate?: string;
      variablesJson?: Record<string, unknown> | null;
      notes?: string | null;
    },
  ): Observable<StudioPromptVersionSummary> {
    return this.http.patch<StudioPromptVersionSummary>(
      `${this.apiBase}/backend/v2/prompts/${promptId}/versions/${versionId}`,
      payload,
    );
  }

  approvePromptVersion(
    promptId: string,
    versionId: string,
  ): Observable<StudioPromptVersionSummary> {
    return this.http.post<StudioPromptVersionSummary>(
      `${this.apiBase}/backend/v2/prompts/${promptId}/versions/${versionId}/approve`,
      {},
    );
  }

  assignPromptVersion(
    promptId: string,
    payload: { versionId: string; siteId?: string | null },
  ): Observable<StudioPromptAssignmentSummary> {
    return this.http.post<StudioPromptAssignmentSummary>(
      `${this.apiBase}/backend/v2/prompts/${promptId}/assignments`,
      payload,
    );
  }
}
