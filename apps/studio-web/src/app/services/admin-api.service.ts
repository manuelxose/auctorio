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
  health: { lastSuccessAt: string | null; lastErrorAt: string | null; lastErrorCode: string | null; lastErrorMessage: string | null; circuit: { until: string; reason: string | null } | null };
};
export type AdminSeo = {
  mode: string; modes: { id: string; locked: boolean }[]; routing: Record<string, string>; maxTestSpendUsd: number;
  providers: AdminSeoProvider[]; capabilities: { id: string; provider: string | null; reason: string | null }[];
};

export type AdminSeoBudgetKey = { scope: string; scopeId: string; operation: string; allowance: string; period: string };
export type AdminSeoBudget = AdminSeoBudgetKey & { limitUsd: number; source: 'default' | 'custom'; name: string | null };
export type AdminSeoUse = AdminSeoBudget & { extraUsd: number; actualUsd: number; heldUsd: number; remainingUsd: number };
export type AdminSeoGovernor = {
  emergency: { active: boolean; reason: string | null; at: string | null };
  budgets: AdminSeoBudget[]; use: AdminSeoUse[];
  pricing: { version: string; entries: { providerId: string; capability: string; perRequestUsd: number | null; perItemUsd: number; currency: string; verifiedAt: string; status: string; override: { maxRequestUsd?: number } | null }[] };
  policy: { freshness: Record<string, { min: number; days: number; max: number }> } & Record<string, unknown>;
  authorizations: (AdminSeoBudgetKey & { id: string; amountUsd: number; reason: string; expiresAt: string; name: string | null })[];
  uncertain: { id: string; providerId: string; operation: string; tenant: string | null; site: string | null; maxUsd: number; reason: string | null; createdAt: string }[];
  targets: { tenants: { id: string; name: string; plan: string | null }[]; sites: { id: string; name: string; tenantId: string }[] };
};
export type AdminSeoLedger = { page: number; total: number; items: { id: string; providerId: string; operation: string; state: string; maxUsd: number; actualUsd: number | null; createdAt: string }[] };

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
  updateSeoProvider(id: string, patch: { enabled?: boolean; priority?: number; resetCircuit?: true }): Observable<unknown> {
    return this.http.patch(`${this.base}/seo/providers/${id}`, patch);
  }
  setSeoCredential(id: string, envName: string, value: string): Observable<unknown> {
    return this.http.put(`${this.base}/seo/providers/${id}/credentials`, { envName, value });
  }
  testSeoProvider(id: string, input: { capability: string; locale: string; maxSpendUsd: number; authorize: true; requestId: string }): Observable<{ rows: number; costUsd: number | null }> {
    return this.http.post<{ rows: number; costUsd: number | null }>(`${this.base}/seo/providers/${id}/verify`, input);
  }
  seoGovernor(): Observable<AdminSeoGovernor> {
    return this.http.get<AdminSeoGovernor>(`${this.base}/seo/governor`);
  }
  seoLedger(page: number, state: string): Observable<AdminSeoLedger> {
    return this.http.get<AdminSeoLedger>(`${this.base}/seo/ledger`, { params: { page, ...(state ? { state } : {}) } });
  }
  setSeoEmergencyStop(active: boolean, reason: string): Observable<unknown> {
    return this.http.put(`${this.base}/seo/emergency-stop`, { active, reason });
  }
  setSeoBudget(key: AdminSeoBudgetKey, limitUsd: number | null): Observable<unknown> {
    return this.http.put(`${this.base}/seo/budgets`, { ...key, limitUsd });
  }
  authorizeSeoSpend(key: AdminSeoBudgetKey, amountUsd: number, days: number, reason: string): Observable<unknown> {
    return this.http.post(`${this.base}/seo/authorizations`, { ...key, amountUsd, days, reason });
  }
  revokeSeoAuthorization(id: string): Observable<unknown> {
    return this.http.delete(`${this.base}/seo/authorizations/${id}`);
  }
  resolveSeoReservation(id: string, actualUsd: number, note: string): Observable<unknown> {
    return this.http.post(`${this.base}/seo/reservations/${id}/resolve`, { actualUsd, note });
  }
  setSeoPrice(providerId: string, capability: string, maxRequestUsd: number | null, source: string): Observable<unknown> {
    return this.http.put(`${this.base}/seo/pricing`, { providerId, capability, maxRequestUsd, source });
  }
  setSeoPolicy(policy: Record<string, unknown>): Observable<unknown> {
    return this.http.put(`${this.base}/seo/policy`, { policy });
  }
  ai(): Observable<AdminAi> {
    return this.http.get<AdminAi>(`${this.base}/ai`);
  }
}
