import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { STUDIO_ORIGIN } from '../infrastructure/http/studio-origin.token';
import type {
  ClusterCoverage,
  OnboardingResponse,
  OnboardingRun,
  PillarPatch,
  StrategyConfig,
  StrategyLayers,
  StrategyVersion,
} from '../models/intelligence.models';

/** Website onboarding + editorial strategy endpoints (src/studio/routes-site-intelligence.ts). */
@Injectable({ providedIn: 'root' })
export class IntelligenceApiService {
  private readonly http = inject(HttpClient);
  private readonly base = `${inject(STUDIO_ORIGIN)}/studio/api/backend/v2/sites`;

  getOnboarding(siteId: string): Observable<OnboardingResponse> {
    return this.http.get<OnboardingResponse>(`${this.base}/${siteId}/onboarding`);
  }

  startOnboarding(siteId: string): Observable<{ started: boolean; operationId: string | null; run: OnboardingRun }> {
    return this.http.post<{ started: boolean; operationId: string | null; run: OnboardingRun }>(`${this.base}/${siteId}/onboarding`, {});
  }

  retryOnboarding(siteId: string): Observable<{ started: boolean; operationId: string; fromStep: string; run: OnboardingRun }> {
    return this.http.post<{ started: boolean; operationId: string; fromStep: string; run: OnboardingRun }>(`${this.base}/${siteId}/onboarding/retry`, {});
  }

  getStrategy(siteId: string): Observable<StrategyLayers> {
    return this.http.get<StrategyLayers>(`${this.base}/${siteId}/strategy`);
  }

  saveStrategy(siteId: string, config: StrategyConfig, note?: string): Observable<{ version: number; layers: StrategyLayers }> {
    return this.http.put<{ version: number; layers: StrategyLayers }>(`${this.base}/${siteId}/strategy`, { config, note });
  }

  regenerateSuggestion(siteId: string): Observable<{ generated: boolean; pillars: number; source: string; layers: StrategyLayers }> {
    return this.http.post<{ generated: boolean; pillars: number; source: string; layers: StrategyLayers }>(`${this.base}/${siteId}/strategy/suggest`, {});
  }

  listVersions(siteId: string): Observable<{ items: StrategyVersion[] }> {
    return this.http.get<{ items: StrategyVersion[] }>(`${this.base}/${siteId}/strategy/versions`);
  }

  restoreVersion(siteId: string, version: number): Observable<{ version: number; layers: StrategyLayers }> {
    return this.http.post<{ version: number; layers: StrategyLayers }>(`${this.base}/${siteId}/strategy/versions/${version}/restore`, {});
  }

  patchPillar(siteId: string, patch: PillarPatch): Observable<{ version: number; layers: StrategyLayers }> {
    return this.http.patch<{ version: number; layers: StrategyLayers }>(`${this.base}/${siteId}/strategy/pillars`, patch);
  }

  getClusterCoverage(siteId: string, slug: string): Observable<ClusterCoverage> {
    return this.http.get<ClusterCoverage>(`${this.base}/${siteId}/strategy/clusters/${encodeURIComponent(slug)}/coverage`);
  }
}
