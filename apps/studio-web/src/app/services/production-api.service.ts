import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { map, Observable } from 'rxjs';
import { STUDIO_ORIGIN } from '../infrastructure/http/studio-origin.token';
import type { ProductionJob, ProductionJobList } from '../models/production.models';

@Injectable({ providedIn: 'root' })
export class ProductionApiService {
  private readonly http = inject(HttpClient);
  private readonly base = `${inject(STUDIO_ORIGIN)}/studio/api/backend/v2/production/jobs`;

  list(filters: { siteId?: string; status?: string; kind?: string; planItemId?: string; clusterId?: string; page?: number; pageSize?: number } = {}): Observable<ProductionJobList> {
    let params = new HttpParams();
    for (const [key, value] of Object.entries(filters)) {
      if (value !== undefined && value !== '') params = params.set(key, String(value));
    }
    return this.http.get<ProductionJobList>(this.base, { params });
  }

  get(id: string): Observable<ProductionJob> {
    return this.http.get<{ job: ProductionJob }>(`${this.base}/${id}`).pipe(map((r) => r.job));
  }

  /** Latest job for a plan item or cluster, or null. */
  latestFor(filter: { planItemId?: string; clusterId?: string }): Observable<ProductionJob | null> {
    return this.list({ ...filter, pageSize: 1 }).pipe(map((r) => r.items[0] ?? null));
  }

  start(body: { kind: 'plan_item'; planItemId: string } | { kind: 'cluster'; clusterId: string; siteId?: string }): Observable<ProductionJob> {
    return this.http.post<{ job: ProductionJob }>(this.base, body).pipe(map((r) => r.job));
  }

  retry(id: string): Observable<ProductionJob> {
    return this.http.post<{ job: ProductionJob }>(`${this.base}/${id}/retry`, {}).pipe(map((r) => r.job));
  }

  cancel(id: string): Observable<ProductionJob> {
    return this.http.post<{ job: ProductionJob }>(`${this.base}/${id}/cancel`, {}).pipe(map((r) => r.job));
  }

  review(id: string, decision: 'approve' | 'reject', notes?: string): Observable<ProductionJob> {
    return this.http.post<{ job: ProductionJob }>(`${this.base}/${id}/review`, { decision, notes }).pipe(map((r) => r.job));
  }
}
