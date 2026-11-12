import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { STUDIO_ORIGIN } from '../infrastructure/http/studio-origin.token';

export type Competitor = {
  id: string;
  domain: string;
  name: string;
  origin: string;
  status: 'suggested' | 'accepted' | 'rejected' | 'paused' | 'removed';
  verification: 'verified' | 'speculative';
  evidence: Array<{ kind: string; url: string | null; note: string; observedAt: string }> | null;
  overlapTopics: string[] | null;
  overlapScore: number | null;
  notes: string | null;
  feedUrl: string | null;
  sitemapUrl: string | null;
  lastCheckedAt: string | null;
  lastError: string | null;
  snapshotsCount: number;
  opportunitiesCount: number;
};

export type CoverageComparison = {
  competitors: Array<{ id: string; domain: string; name: string }>;
  topics: Array<{ topic: string; sitePages: number; siteSampleUrls: string[]; competitorPages: Record<string, number> }>;
  unclassifiedCompetitorPages: Record<string, number>;
  sampledCompetitorPages: number;
  sitePages: number;
};

export type ContentOpportunity = {
  id: string;
  kind: string;
  topic: string;
  rationale: string;
  evidence: Array<{ url: string; title: string | null; competitor: string | null }> | null;
  relatedSiteUrls: string[] | null;
  targetUrl: string | null;
  status: 'open' | 'planned' | 'dismissed' | 'monitoring';
  planItemId: string | null;
  competitor: { id: string; domain: string; name: string } | null;
};

@Injectable({ providedIn: 'root' })
export class CompetitorsApiService {
  private readonly http = inject(HttpClient);
  private readonly base = `${inject(STUDIO_ORIGIN)}/studio/api/backend/v2`;

  private site(siteId: string) {
    return `${this.base}/sites/${siteId}`;
  }

  list(siteId: string): Observable<{ items: Competitor[] }> {
    return this.http.get<{ items: Competitor[] }>(`${this.site(siteId)}/competitors`);
  }
  discover(siteId: string): Observable<{ operationId: string }> {
    return this.http.post<{ operationId: string }>(`${this.site(siteId)}/competitors/discover`, {});
  }
  refreshCoverage(siteId: string): Observable<{ operationId: string }> {
    return this.http.post<{ operationId: string }>(`${this.site(siteId)}/competitors/coverage/refresh`, {});
  }
  operationStatus(id: string): Observable<{ status: string }> {
    return this.http.get<{ status: string }>(`${this.base}/operations/${id}`);
  }
  add(siteId: string, body: { url: string; name?: string; notes?: string }): Observable<Competitor> {
    return this.http.post<Competitor>(`${this.site(siteId)}/competitors`, body);
  }
  update(siteId: string, id: string, body: Partial<Pick<Competitor, 'name' | 'notes' | 'status' | 'feedUrl' | 'sitemapUrl'>>): Observable<Competitor> {
    return this.http.patch<Competitor>(`${this.site(siteId)}/competitors/${id}`, body);
  }
  coverage(siteId: string): Observable<CoverageComparison> {
    return this.http.get<CoverageComparison>(`${this.site(siteId)}/competitors/coverage`);
  }
  opportunities(siteId: string): Observable<{ items: ContentOpportunity[] }> {
    return this.http.get<{ items: ContentOpportunity[] }>(`${this.site(siteId)}/opportunities`);
  }
  toPlan(siteId: string, id: string, body: { mode?: 'new' | 'update'; targetUrl?: string }): Observable<{ created: boolean }> {
    return this.http.post<{ created: boolean }>(`${this.site(siteId)}/opportunities/${id}/plan`, body);
  }
  setOpportunityStatus(siteId: string, id: string, status: 'dismissed' | 'monitoring' | 'open'): Observable<unknown> {
    return this.http.post(`${this.site(siteId)}/opportunities/${id}/status`, { status });
  }
}
