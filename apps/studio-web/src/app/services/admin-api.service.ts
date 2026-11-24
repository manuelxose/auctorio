import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { Observable } from 'rxjs';
import { STUDIO_ORIGIN } from '../infrastructure/http/studio-origin.token';

export type AdminOverview = { tenants: number; suspended: number; sites: number; users: number; texts: number; images: number; failedJobs24h: number };
export type AdminModelRef = { provider: string; model: string } | null;
export type AdminTenant = {
  id: string; name: string; slug: string | null; status: 'active' | 'suspended'; plan: string | null; createdAt: string;
  sites: number; users: number; texts: number; images: number; textModel: AdminModelRef; imageModel: AdminModelRef;
};
export type AdminAi = {
  providers: { kind: 'text' | 'image'; id: string; label: string; keyEnv: string; baseUrlEnv: string | null; models: string[]; configured: boolean; keySource: 'ui' | 'env' | null; baseUrlSource: 'ui' | 'env' | null }[];
  defaults: { text: string; image: string };
  usage: { kind: 'text' | 'image'; provider: string | null; model: string | null; count: number; tokens: number; costUsd: number }[];
};

export type AdminSeoProvider = {
  id: string; label: string; enabled: boolean; priority: number; configured: boolean; automationLocked: boolean;
  credentials: { envName: string; label: string; source: 'ui' | 'env' | null }[];
  capabilities: Record<string, { supported: boolean; dataKind?: string; methodology?: string; degraded?: string | null; reason?: string }>;
  licensing: { termsUrl: string; checkedAt: string; commercialUse: string; storage: string; crossTenantSharing: string; upstream: string; notes: string[] };
  rateLimit: string | null; liveVerification: 'pending' | 'partial' | 'verified';
  health: { lastSuccessAt: string | null; lastErrorAt: string | null; lastErrorCode: string | null; lastErrorMessage: string | null };
};
export type AdminSeo = {
  mode: string; modes: { id: string; locked: boolean }[]; routing: Record<string, string>; maxTestSpendUsd: number;
  providers: AdminSeoProvider[]; capabilities: { id: string; provider: string | null; reason: string | null }[];
};

/** Platform (SaaS) administration; every call is refused by the server unless the user is a platform admin. */
@Injectable({ providedIn: 'root' })
export class AdminApiService {
  private readonly http = inject(HttpClient);
  private readonly base = `${inject(STUDIO_ORIGIN)}/studio/api/backend/v2/admin`;

  me(): Observable<{ isPlatformAdmin: boolean }> {
    return this.http.get<{ isPlatformAdmin: boolean }>(`${this.base}/me`);
  }
  overview(): Observable<AdminOverview> {
    return this.http.get<AdminOverview>(`${this.base}/overview`);
  }
  tenants(): Observable<{ items: AdminTenant[] }> {
    return this.http.get<{ items: AdminTenant[] }>(`${this.base}/tenants`);
  }
  updateTenant(id: string, patch: { status?: 'active' | 'suspended'; plan?: string | null }): Observable<unknown> {
    return this.http.patch(`${this.base}/tenants/${id}`, patch);
  }
  setKey(envName: string, value: string): Observable<unknown> {
    return this.http.put(`${this.base}/ai/keys`, { envName, value });
  }
  seo(): Observable<AdminSeo> {
    return this.http.get<AdminSeo>(`${this.base}/seo`);
  }
  setSeoControl(patch: { mode?: string; routing?: Record<string, string> }): Observable<unknown> {
    return this.http.put(`${this.base}/seo/control`, patch);
  }
  updateSeoProvider(id: string, patch: { enabled?: boolean; priority?: number }): Observable<unknown> {
    return this.http.patch(`${this.base}/seo/providers/${id}`, patch);
  }
  setSeoCredential(id: string, envName: string, value: string): Observable<unknown> {
    return this.http.put(`${this.base}/seo/providers/${id}/credentials`, { envName, value });
  }
  testSeoProvider(id: string, input: { capability: string; locale: string; maxSpendUsd: number; authorize: true }): Observable<{ rows: number; costUsd: number | null }> {
    return this.http.post<{ rows: number; costUsd: number | null }>(`${this.base}/seo/providers/${id}/verify`, input);
  }
  ai(): Observable<AdminAi> {
    return this.http.get<AdminAi>(`${this.base}/ai`);
  }
}
