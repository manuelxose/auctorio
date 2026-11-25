import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { STUDIO_ORIGIN } from '../infrastructure/http/studio-origin.token';
import { ResearchControl, ResearchTask } from './seo-intelligence-api.service';

export type CostRow = { key: string; label: string | null; requests: number; settledUsd: number; estimatedUsd: number; heldUsd: number; failures: number; failedUsd: number };
export type CostFilters = { from?: string; to?: string; tenantId?: string; siteId?: string; providerId?: string; operation?: string; plan?: string; runId?: string };
export type CostAnalytics = {
  range: { from: string; to: string };
  totals: { requests: number; settledUsd: number; estimatedUsd: number; heldUsd: number; uncertain: number; uncertainUsd: number; assumedUsd: number; failures: number; failedUsd: number; onboardingUsd: number; recurringUsd: number };
  units: {
    keywords: number; perKeywordUsd: number | null; opportunities: number; perOpportunityUsd: number | null; articles: number | null; perArticleUsd: number | null; perOnboardingSiteUsd: number | null; perRecurringSiteUsd: number | null;
  };
  cache: {
    countedSince: string | null; reused: number; bought: number; duplicatesPrevented: number; hitRate: number | null; avoidedUsdEstimate: number | null; unpricedAnswers: number; refused: Record<string, number>;
    byProvider: Array<{ providerId: string; served: number; bought: number; hitRate: number | null }>;
  };
  by: Record<'provider' | 'operation' | 'tenant' | 'site' | 'plan' | 'run' | 'day', CostRow[]>;
};
export type EffectiveBudget = {
  tenant: string; plan: string | null; site: string | null; allowance: string; effectiveUsd: number; stopped: string | null;
  rows: Array<{ scope: string; scopeId: string; operation: string; allowance: string; period: string; limitUsd: number; extraUsd: number; actualUsd: number; heldUsd: number; remainingUsd: number; source: string }>;
  general: Array<{ period: string; siteId: string | null; limitUsd: number; hardLimitUsd: number; spentUsd: number }>;
};
export type Exhaustion = { day: string; metric: string; tenant: string | null; site: string | null; provider_id: string; operation: string; count: number };
export type ProviderHistory = {
  daily: Array<{ day: string; ok: number; failed: number; usd: number }>;
  failures: Array<{ id: string; at: string; operation: string; state: string; reason: string | null; usd: number | null }>;
};
export type ResearchOperationRow = {
  id: string; tenantId: string; tenant: string | null; siteId: string; site: string | null; trigger: string; detail: string | null; status: string; error: string | null; progress: number; createdAt: string; startedAt: string | null; finishedAt: string | null; nextAt: string | null;
  maxUsd: number; estimatedUsd: number | null; remainingUsd: number | null; cost: { actualUsd: number; heldUsd: number; uncertain: number; requests: number };
};
export type ResearchHold = { id: string; scope: 'tenant' | 'site'; scopeId: string; reason: string; name: string | null; createdAt: string };
export type ResearchOperations = {
  page: number; pages: number; total: number; items: ResearchOperationRow[]; counts: Record<string, number>;
  workers: Array<{ name: string; status: string; currentTask: string | null; lastBeatAt: string; stale: boolean }>;
  control: { emergencyStop: boolean; mode: string; automaticResearch: boolean; providers: Array<{ id: string; label: string; enabled: boolean; circuit: { until: string; reason: string | null } | null }> };
  reserved: { heldUsd: number; inFlight: number; uncertain: number };
  holds: ResearchHold[];
  targets: { tenants: Array<{ id: string; name: string; plan: string | null }>; sites: Array<{ id: string; name: string; tenantId: string }> };
};
export type ResearchOperationDetail = { tenantId: string; siteId: string; inFlight: number; run: ResearchOperationRow & { tasks: Array<ResearchTask & { maxUsd: number | null; billedUsd: number | null }> } };
export type LicenseRecord = {
  id: string; providerId: string; commercialUse: string; storage: string; crossTenantSharing: string; documentUrl: string; notes: string; status: string; validUntil: string | null; expired: boolean; createdBy: string | null; approvedBy: string | null; createdAt: string; createdByUserId: string;
};
export type Governance = {
  retention: Array<{ providerId: string; label: string; storage: string; days: number; termsUrl: string; checkedAt: string }>;
  searchConsoleRetentionDays: number;
  freshness: Record<string, { days: number }>;
  licences: Array<{ providerId: string; commercialUse: string; storage: string; crossTenantSharing: string }>;
  records: LicenseRecord[];
  sharing: { requested: boolean; eligible: string[]; active: boolean };
  provenance: Array<{ provider_id: string; source: string; storage: string; sharing: string; rows: number; keywords: number; quality: number | null; oldest: string; newest: string; expiring: number }>;
  cache: Array<{ provider_key: string; resource_type: string; entries: number; hits: number; negative: number; expired: number; oldest: string | null }>;
  warnings: Array<{ code: string; count: number }>;
  sync: Array<{ tenantId: string; siteId: string; tenant: string; site: string; status: string; syncedThrough: string | null; lastSuccessAt: string | null; lastError: string | null; failureCount: number; nextSyncAt: string | null; backfillComplete: boolean }>;
};
export type Economics = {
  range: { from: string; to: string };
  rows: Array<{ tenantId: string; tenant: string; plan: string | null; status: string; sites: number; revenueUsd: number | null; seoUsd: number; seoHeldUsd: number; aiUsd: number | null; imageUsd: number | null; knownCostUsd: number; contributionMarginUsd: number | null }>;
  totals: { seoUsd: number; aiUsd: number; imageUsd: number };
};

const clean = (query: object) => Object.fromEntries(Object.entries(query).filter(([, value]) => value !== undefined && value !== null && value !== '')) as Record<string, string | number>;

/** SEO Operations Center; the server refuses every call to anyone who is not a platform administrator. */
@Injectable({ providedIn: 'root' })
export class AdminSeoOpsApiService {
  private readonly http = inject(HttpClient);
  private readonly base = `${inject(STUDIO_ORIGIN)}/studio/api/backend/v2/admin/seo`;

  costs(filters: CostFilters): Observable<CostAnalytics> {
    return this.http.get<CostAnalytics>(`${this.base}/costs`, { params: clean(filters) });
  }
  exportCosts(filters: CostFilters): Observable<Blob> {
    return this.http.get(`${this.base}/costs/export`, { params: clean(filters), responseType: 'blob' });
  }
  economics(range: { from?: string; to?: string }): Observable<Economics> {
    return this.http.get<Economics>(`${this.base}/economics`, { params: clean(range) });
  }
  effectiveBudget(query: { tenantId: string; siteId?: string; providerId: string; operation: string }): Observable<EffectiveBudget> {
    return this.http.get<EffectiveBudget>(`${this.base}/effective-budget`, { params: clean(query) });
  }
  exhaustion(): Observable<{ items: Exhaustion[] }> {
    return this.http.get<{ items: Exhaustion[] }>(`${this.base}/exhaustion`);
  }
  providerHistory(id: string): Observable<ProviderHistory> {
    return this.http.get<ProviderHistory>(`${this.base}/providers/${id}/history`);
  }
  readBalance(id: string): Observable<{ usd: number; at: string }> {
    return this.http.post<{ usd: number; at: string }>(`${this.base}/providers/${id}/balance`, {});
  }
  research(query: { status?: string; tenantId?: string; siteId?: string; page?: number }): Observable<ResearchOperations> {
    return this.http.get<ResearchOperations>(`${this.base}/research`, { params: clean(query) });
  }
  researchRun(id: string): Observable<ResearchOperationDetail> {
    return this.http.get<ResearchOperationDetail>(`${this.base}/research/${id}`);
  }
  controlResearch(id: string, control: ResearchControl): Observable<ResearchOperationDetail> {
    return this.http.post<ResearchOperationDetail>(`${this.base}/research/${id}/${control}`, {});
  }
  hold(scope: 'tenant' | 'site', scopeId: string, reason: string): Observable<unknown> {
    return this.http.put(`${this.base}/research-holds`, { scope, scopeId, reason });
  }
  liftHold(id: string): Observable<unknown> {
    return this.http.delete(`${this.base}/research-holds/${id}`);
  }
  governance(): Observable<Governance> {
    return this.http.get<Governance>(`${this.base}/governance`);
  }
  purge(): Observable<{ deleted: number }> {
    return this.http.post<{ deleted: number }>(`${this.base}/retention/purge`, {});
  }
  recordLicense(body: { providerId: string; commercialUse: string; storage: string; crossTenantSharing: string; documentUrl: string; notes: string; validUntil?: string }): Observable<unknown> {
    return this.http.post(`${this.base}/licenses`, body);
  }
  approveLicense(id: string): Observable<unknown> {
    return this.http.post(`${this.base}/licenses/${id}/approve`, {});
  }
  revokeLicense(id: string): Observable<unknown> {
    return this.http.post(`${this.base}/licenses/${id}/revoke`, {});
  }
}
