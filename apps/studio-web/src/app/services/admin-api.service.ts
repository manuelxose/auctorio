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
  ai(): Observable<AdminAi> {
    return this.http.get<AdminAi>(`${this.base}/ai`);
  }
}
