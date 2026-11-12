import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { STUDIO_ORIGIN } from '../infrastructure/http/studio-origin.token';

export type SiteSourceRecommendation = {
  id: string;
  name: string | null;
  url: string | null;
  domain: string;
  type: string | null;
  category: string | null;
  relationship: 'first_party' | 'external' | null;
  topics: string[] | null;
  trustLevel: string | null;
  relevance: string | null;
  assessmentReason: string | null;
  language: string | null;
  geography: string | null;
  verificationStatus: string | null;
  lastCheckedAt: string | null;
  expectedFreshness: string | null;
  limitations: string[] | null;
  score: number;
  status: string;
  sourceId: string | null;
};

export type SiteSource = {
  id: string;
  name: string;
  url: string;
  type: string;
  state: 'active' | 'paused' | 'archived';
  priority: number;
  language: string | null;
  refreshIntervalMinutes: number;
  categories?: string[] | null;
  trustScore?: number | null;
  verificationStatus?: string | null;
  lastError: string | null;
  lastFetchedAt: string | null;
  itemsCount: number;
  configuration?: Record<string, unknown> | null;
};

export type SourceConfigPatchBody = {
  url?: string;
  refreshIntervalMinutes?: number;
  language?: string;
  priority?: number;
  trustLevel?: 'high' | 'medium' | 'low';
  topics?: string[];
  pillars?: string[];
  relevanceKeywords?: string[];
  selectors?: Record<string, string>;
};

export type SourceTestResult = { ok: boolean; latencyMs: number; itemCount: number; items: Array<{ title: string; url: string; publishedAt: string | null }>; error: string | null };
export type SourceItemRow = { id: string; title: string; canonicalUrl: string | null; sourceUrl: string; publishedAt: string | null; processingStatus: string };
export type SourceDiagnostics = { health: { healthStatus: string; consecutiveFailures?: number } | null; runs: Array<{ id: string; status: string; startedAt: string; errorMessage?: string | null }>; notice: string };

@Injectable({ providedIn: 'root' })
export class SourcesApiService {
  private readonly http = inject(HttpClient);
  private readonly base = `${inject(STUDIO_ORIGIN)}/studio/api/backend/v2`;

  private site(siteId: string) {
    return `${this.base}/sites/${siteId}`;
  }

  recommendations(siteId: string, status?: string): Observable<{ items: SiteSourceRecommendation[] }> {
    let params = new HttpParams();
    if (status) params = params.set('status', status);
    return this.http.get<{ items: SiteSourceRecommendation[] }>(`${this.site(siteId)}/source-recommendations`, { params });
  }
  discover(siteId: string): Observable<{ operationId: string }> {
    return this.http.post<{ operationId: string }>(`${this.site(siteId)}/source-recommendations/discover`, {});
  }
  operationStatus(id: string): Observable<{ status: string }> {
    return this.http.get<{ status: string }>(`${this.base}/operations/${id}`);
  }
  decide(siteId: string, id: string, action: 'accept' | 'reject'): Observable<unknown> {
    return this.http.post(`${this.site(siteId)}/source-recommendations/${id}/${action}`, {});
  }
  bulk(siteId: string, ids: string[], action: 'accept' | 'reject'): Observable<{ succeeded: number; failed: number }> {
    return this.http.post<{ succeeded: number; failed: number }>(`${this.site(siteId)}/source-recommendations/bulk`, { ids, action });
  }
  sources(siteId: string, state?: string): Observable<{ items: SiteSource[] }> {
    let params = new HttpParams();
    if (state) params = params.set('state', state);
    return this.http.get<{ items: SiteSource[] }>(`${this.site(siteId)}/sources`, { params });
  }
  addManual(siteId: string, body: { url: string; name?: string; topics?: string[]; language?: string }): Observable<SiteSource> {
    return this.http.post<SiteSource>(`${this.site(siteId)}/sources`, body);
  }
  patchConfig(siteId: string, id: string, body: SourceConfigPatchBody): Observable<SiteSource> {
    return this.http.patch<SiteSource>(`${this.site(siteId)}/sources/${id}/config`, body);
  }
  setState(siteId: string, id: string, action: 'pause' | 'resume' | 'archive' | 'restore'): Observable<SiteSource> {
    return this.http.post<SiteSource>(`${this.site(siteId)}/sources/${id}/state`, { action });
  }
  test(siteId: string, id: string): Observable<SourceTestResult> {
    return this.http.post<SourceTestResult>(`${this.site(siteId)}/sources/${id}/test`, {});
  }
  items(siteId: string, id: string): Observable<{ items: SourceItemRow[] }> {
    return this.http.get<{ items: SourceItemRow[] }>(`${this.site(siteId)}/sources/${id}/items`);
  }
  diagnostics(siteId: string, id: string): Observable<SourceDiagnostics> {
    return this.http.get<SourceDiagnostics>(`${this.site(siteId)}/sources/${id}/diagnostics`);
  }
}
