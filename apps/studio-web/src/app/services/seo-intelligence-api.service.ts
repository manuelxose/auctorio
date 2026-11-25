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
  market: string | null;
  intent: string | null;
  stage: string;
  explanation: SeoExplanation | null;
  planItemId: string | null;
  analyzedAt: string | null;
  actions: Array<{ actedAt: string; url: string | null; evaluations: Record<string, SeoEvaluation> | null }>;
};
export type SeoDecision = 'approved' | 'dismissed' | 'deferred' | 'open';
export type SeoProfileView = { profile: string; chosen: boolean; profiles: string[]; priorityTopics: string[]; holdoutPercent: number; weights: Record<string, number>; defaults: Record<string, number> };

export type ProfileField<T> = { value: T | null; source: string };
export type ResearchControl = 'pause' | 'resume' | 'cancel' | 'retry';
export type ResearchTask = { id: string; kind: string; subject: string; market: string; status: string; reason: string | null; external: boolean; result: Record<string, unknown> | null };
export type ResearchRun = {
  id: string; trigger: string; reason: { detail?: string; focus?: { topics?: string[]; market?: string } } | null; status: string; error: string | null; createdAt: string; finishedAt: string | null; progress: number; completedTasks: number; totalTasks: number; tasks?: ResearchTask[];
};
export type ResearchAllowance = { state: string; kind: 'onboarding' | 'recurring'; usedPercent: number; renewsAt: string | null; automatic: boolean; held: string | null };
export type ResearchPolicy = { mode: string; targetDays: number; minScore: number };
export type ResearchCoverage = {
  available: number; wanted: number; articlesPerWeek: number | null; days: number | null; sufficient: boolean; needsReplenishment: boolean; stages: Record<string, number>; gaps: string[];
  topics: Array<{ topic: string; available: number; pages: number }>; freshness: { newest: number | null; oldest: number | null };
};
export type ResearchOverview = {
  profile: {
    kinds: ProfileField<string[]>; businessModel: ProfileField<string>; audience: ProfileField<string>; topics: ProfileField<string[]>; excludedTopics: ProfileField<string[]>; markets: ProfileField<string[]>; regions: ProfileField<string[]>; languages: ProfileField<string[]>;
    offerings: ProfileField<string[]>; revenueObjectives: ProfileField<string[]>; corrections: Record<string, unknown>; reviewedAt: string | null; policy: ResearchPolicy;
  };
  coverage: ResearchCoverage;
  triggers: Array<{ trigger: string; detail: string }>;
  runs: ResearchRun[];
  active: ResearchRun | null;
  keywords: Record<string, number>;
  intensity: string | null;
  allowance: ResearchAllowance;
};
export type ResearchFocus = { topics?: string[]; market?: string };
export type ResearchPreview = {
  acquisitions: Array<{ kind: string; subject: string; market: string; reason: string; blocked: string | null }>; maxPercent: number; knownPercent: number; exceedsAllowance: boolean; allowance: ResearchAllowance;
};

export type Figures = { clicks: number; impressions: number; position: number | null; days: number };
export type Organic = { from: string; through: string; days: number; current: Figures; previous: Figures | null };
export type SeoWorkspaceOverview = {
  research: { lastRun: { id: string; status: string; trigger: string; createdAt: string; finishedAt: string | null } | null; keywords: number; pages: { total: number; read: number } };
  connection: SearchConsoleStatus;
  organic: Organic | null;
  opportunities: { open: number; approved: number; planned: number; waiting: number; completed: number };
  recommendations: Array<{ id: string; topic: string; action: string; status: string; score: number | null; confidence: number | null; rationale: string; targetUrl: string | null }>;
  coverage: ResearchCoverage;
  allowance: ResearchAllowance;
  nextAction: string;
};
export type SiteKeywordRow = {
  id: string; keyword: string; market: string; status: string; reason: string | null; score: number | null; cluster: string | null; volume: number | null; difficulty: number | null; cpc: number | null; intent: string | null; quality: number | null;
  measuredAt: string | null; ageDays: number | null; freshness: 'fresh' | 'stale' | 'unmeasured'; impressions: number | null; clicks: number | null; position: number | null; page: string | null;
  opportunity: { id: string; targetUrl: string | null; action: string | null; status: string } | null; discoveries: Array<{ kind: string; value: string; position: number | null; url: string | null; discoveredAt: string }>;
};
export type KeywordPage = {
  items: SiteKeywordRow[]; total: number; page: number; pages: number; counts: { discovered: number; relevant: number; opportunity: number; rejected: number; measured: number };
  clusters: Array<{ name: string; keywords: number }>; intents: string[]; searchConsoleThrough: string | null;
};
export type KeywordHistory = {
  keyword: string; market: string;
  items: Array<{ volume: number | null; difficulty: number | null; cpc: number | null; intent: string | null; quality: number; collectedAt: string; confirmedAt: string; fields: Record<string, { kind: string; at: string | null; asOf: string | null }> }>;
};
export type SeoPerformance = {
  connection: SearchConsoleStatus;
  organic: Organic | null;
  series: Array<{ date: string; clicks: number; impressions: number }>;
  pages: Array<Figures & { page: string; previousClicks: number | null }>;
  queries: Array<{ query: string; clicks: number; impressions: number; position: number | null }>;
  newContent: Array<{ id: string; externalUrl: string; publishedAt: string; project: { id: string; title: string } | null; clicks: number | null; impressions: number | null }>;
  history: Array<{ id: string; action: string; url: string | null; query: string | null; actedAt: string; opportunity: { id: string; topic: string; score: number | null } | null; evaluation: SeoEvaluation | null }>;
  outcomes: { byAction: Array<{ action: string; actions: number; evaluated: number; higher: number; lower: number; noClearChange: number; insufficientData: number }>; note: string };
  conversions: { status: 'unavailable' };
};

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
  workspace(siteId: string): Observable<SeoWorkspaceOverview> {
    return this.http.get<SeoWorkspaceOverview>(`${this.site(siteId)}/seo-workspace`);
  }
  keywords(siteId: string, query: { search?: string; view?: string; cluster?: string; intent?: string; sort?: string; page?: number }): Observable<KeywordPage> {
    const params = Object.fromEntries(Object.entries(query).filter(([, value]) => value !== undefined && value !== '')) as Record<string, string | number>;
    return this.http.get<KeywordPage>(`${this.site(siteId)}/seo-keywords`, { params });
  }
  keywordHistory(siteId: string, id: string): Observable<KeywordHistory> {
    return this.http.get<KeywordHistory>(`${this.site(siteId)}/seo-keywords/${id}/history`);
  }
  performance(siteId: string, days: 28 | 90): Observable<SeoPerformance> {
    return this.http.get<SeoPerformance>(`${this.site(siteId)}/seo-performance`, { params: { days } });
  }
  opportunities(siteId: string): Observable<{ items: SeoOpportunity[]; total: number }> {
    return this.http.get<{ items: SeoOpportunity[]; total: number }>(`${this.site(siteId)}/seo-opportunities`);
  }
  analyze(siteId: string): Observable<{ open: number; firstPartyData: boolean }> {
    return this.http.post<{ open: number; firstPartyData: boolean }>(`${this.site(siteId)}/seo-opportunities/analyze`, {});
  }
  decide(siteId: string, id: string, decision: SeoDecision): Observable<unknown> {
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
  /** What it would ask for and its share of the allowance. Buys nothing. */
  previewResearch(siteId: string, focus: ResearchFocus): Observable<ResearchPreview> {
    return this.http.post<ResearchPreview>(`${this.site(siteId)}/seo-research/estimate`, { focus });
  }
  startResearch(siteId: string, focus: ResearchFocus): Observable<{ created: boolean; run: ResearchRun }> {
    return this.http.post<{ created: boolean; run: ResearchRun }>(`${this.site(siteId)}/seo-research/runs`, { focus });
  }
  controlResearch(siteId: string, id: string, control: ResearchControl): Observable<ResearchRun> {
    return this.http.post<ResearchRun>(`${this.site(siteId)}/seo-research/runs/${id}/${control}`, {});
  }
  saveResearchProfile(siteId: string, body: { corrections?: Record<string, unknown>; reviewed?: boolean }): Observable<unknown> {
    return this.http.put(`${this.site(siteId)}/seo-research/profile`, body);
  }
  saveResearchPolicy(siteId: string, policy: ResearchPolicy & { intensity?: string }): Observable<unknown> {
    return this.http.put(`${this.site(siteId)}/seo-research/policy`, { policy });
  }
}
