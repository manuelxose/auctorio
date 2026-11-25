import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { STUDIO_ORIGIN } from '../infrastructure/http/studio-origin.token';

export type SearchConsoleStatus = {
  configured: boolean;
  status: 'not_connected' | 'pending_property' | 'active' | 'revoked' | 'forbidden' | 'disconnected';
  property: string | null;
  syncedFrom: string | null;
  syncedThrough: string | null;
  dataAgeDays: number | null;
  backfillComplete: boolean;
  lastSuccessAt: string | null;
  lastError: string | null;
  nextSyncAt: string | null;
  syncing: boolean;
};

export type SeoEvidence = { metric: string; value: number | string | null; kind: string; period?: string; note?: string };
export type SeoExplanation = {
  why: string;
  action: { type: string; proposed: string; reason: string };
  evidence: SeoEvidence[];
  factors: Array<{ key: string; value: number | null; weight: number; kind: string; detail: string }>;
  score: { value: number | null; coverage: number; note: string };
  confidence: { value: number; reasons: string[] };
  expected: { clicks28d: number | null; scenario: string | null; kind: string };
  effort: 'low' | 'medium' | 'high';
  externalData: { required: boolean; detail: string };
  risks: string[];
  safeguards: Array<{ code: string; detail: string }>;
};
export type SeoEvaluation = { window: number; pre: { clicks: number }; post: { clicks: number }; outcome: string; cohort: { pages: number; medianClicksRatio: number } | null; uncertainty: string[] };
export type SeoOpportunity = {
  id: string;
  source: string;
  kind: string;
  topic: string;
  query: string | null;
  targetUrl: string | null;
  action: string;
  status: string;
  score: number | null;
  confidence: number | null;
  explanation: SeoExplanation | null;
  planItemId: string | null;
  actions: Array<{ actedAt: string; url: string | null; evaluations: Record<string, SeoEvaluation> | null }>;
};
export type SeoProfileView = { profile: string; chosen: boolean; profiles: string[]; priorityTopics: string[]; holdoutPercent: number; weights: Record<string, number>; defaults: Record<string, number> };

export type ProfileField<T> = { value: T | null; source: string };
export type ResearchControl = 'pause' | 'resume' | 'cancel' | 'retry';
export type ResearchTask = { id: string; kind: string; subject: string; status: string; reason: string | null; external: boolean; maxUsd: number | null; billedUsd: number | null; result: Record<string, unknown> | null };
export type ResearchRun = {
  id: string; trigger: string; reason: { detail?: string } | null; status: string; maxUsd: number; estimatedUsd: number | null; error: string | null; createdAt: string; progress: number;
  cost: { actualUsd: number; heldUsd: number; uncertain: number; requests: number }; tasks?: ResearchTask[];
};
export type ResearchPolicy = { mode: string; maxUsdPerRun: number; targetDays: number; minScore: number };
export type ResearchOverview = {
  profile: {
    kinds: ProfileField<string[]>; businessModel: ProfileField<string>; audience: ProfileField<string>; topics: ProfileField<string[]>; excludedTopics: ProfileField<string[]>; markets: ProfileField<string[]>; languages: ProfileField<string[]>;
    revenueObjectives: ProfileField<string[]>; corrections: Record<string, unknown>; reviewedAt: string | null; policy: ResearchPolicy;
  };
  coverage: { available: number; wanted: number; articlesPerWeek: number | null; days: number | null; needsReplenishment: boolean; stages: Record<string, number>; gaps: string[] };
  triggers: Array<{ trigger: string; detail: string }>;
  runs: ResearchRun[];
  active: ResearchRun | null;
  keywords: Record<string, number>;
};
export type ResearchEstimate = { acquisitions: Array<{ kind: string; subject: string; maxUsd: number | null; blocked: string | null }>; maxUsd: number };

@Injectable({ providedIn: 'root' })
export class SeoIntelligenceApiService {
  private readonly http = inject(HttpClient);
  private readonly base = `${inject(STUDIO_ORIGIN)}/studio/api/backend/v2`;

  private site(siteId: string) {
    return `${this.base}/sites/${siteId}`;
  }

  connection(siteId: string): Observable<SearchConsoleStatus> {
    return this.http.get<SearchConsoleStatus>(`${this.site(siteId)}/search-console`);
  }
  connect(siteId: string): Observable<{ url: string }> {
    return this.http.post<{ url: string }>(`${this.site(siteId)}/search-console/connect`, {});
  }
  complete(state: string, code: string): Observable<{ siteId: string }> {
    return this.http.post<{ siteId: string }>(`${this.base}/search-console/complete`, { state, code });
  }
  properties(siteId: string): Observable<{ items: Array<{ property: string; permissionLevel: string }> }> {
    return this.http.get<{ items: Array<{ property: string; permissionLevel: string }> }>(`${this.site(siteId)}/search-console/properties`);
  }
  selectProperty(siteId: string, property: string): Observable<SearchConsoleStatus> {
    return this.http.put<SearchConsoleStatus>(`${this.site(siteId)}/search-console/property`, { property });
  }
  sync(siteId: string): Observable<{ status: string; days: number; error: string | null; connection: SearchConsoleStatus }> {
    return this.http.post<{ status: string; days: number; error: string | null; connection: SearchConsoleStatus }>(`${this.site(siteId)}/search-console/sync`, {});
  }
  disconnect(siteId: string, deleteData: boolean): Observable<SearchConsoleStatus> {
    return this.http.delete<SearchConsoleStatus>(`${this.site(siteId)}/search-console?deleteData=${deleteData}`);
  }
  opportunities(siteId: string): Observable<{ items: SeoOpportunity[] }> {
    return this.http.get<{ items: SeoOpportunity[] }>(`${this.site(siteId)}/seo-opportunities`);
  }
  analyze(siteId: string): Observable<{ open: number; firstPartyData: boolean }> {
    return this.http.post<{ open: number; firstPartyData: boolean }>(`${this.site(siteId)}/seo-opportunities/analyze`, {});
  }
  decide(siteId: string, id: string, decision: 'approved' | 'dismissed' | 'open'): Observable<unknown> {
    return this.http.post(`${this.site(siteId)}/seo-opportunities/${id}/decision`, { decision });
  }
  markDone(siteId: string, id: string, actedAt: string): Observable<unknown> {
    return this.http.post(`${this.site(siteId)}/seo-opportunities/${id}/complete`, { actedAt });
  }
  /** A new version of the page, left for review. */
  revise(siteId: string, id: string): Observable<{ projectId: string; jobId: string; status: string }> {
    return this.http.post<{ projectId: string; jobId: string; status: string }>(`${this.site(siteId)}/seo-opportunities/${id}/revision`, {});
  }
  plan(siteId: string, id: string): Observable<unknown> {
    return this.http.post(`${this.site(siteId)}/opportunities/${id}/plan`, {});
  }
  profile(siteId: string): Observable<SeoProfileView> {
    return this.http.get<SeoProfileView>(`${this.site(siteId)}/seo-profile`);
  }
  saveProfile(siteId: string, body: { profile: string; priorityTopics: string[]; holdoutPercent: number; weights: Record<string, number> }): Observable<SeoProfileView> {
    return this.http.put<SeoProfileView>(`${this.site(siteId)}/seo-profile`, body);
  }
  research(siteId: string): Observable<ResearchOverview> {
    return this.http.get<ResearchOverview>(`${this.site(siteId)}/seo-research`);
  }
  researchRun(siteId: string, id: string): Observable<ResearchRun> {
    return this.http.get<ResearchRun>(`${this.site(siteId)}/seo-research/runs/${id}`);
  }
  estimateResearch(siteId: string): Observable<ResearchEstimate> {
    return this.http.post<ResearchEstimate>(`${this.site(siteId)}/seo-research/estimate`, {});
  }
  startResearch(siteId: string): Observable<{ created: boolean; run: ResearchRun }> {
    return this.http.post<{ created: boolean; run: ResearchRun }>(`${this.site(siteId)}/seo-research/runs`, {});
  }
  controlResearch(siteId: string, id: string, control: ResearchControl): Observable<ResearchRun> {
    return this.http.post<ResearchRun>(`${this.site(siteId)}/seo-research/runs/${id}/${control}`, {});
  }
  saveResearchProfile(siteId: string, body: { corrections?: Record<string, unknown>; reviewed?: boolean }): Observable<unknown> {
    return this.http.put(`${this.site(siteId)}/seo-research/profile`, body);
  }
  saveResearchPolicy(siteId: string, policy: ResearchPolicy): Observable<unknown> {
    return this.http.put(`${this.site(siteId)}/seo-research/policy`, { policy });
  }
}
