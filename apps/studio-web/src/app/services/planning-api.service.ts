import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, switchMap, takeWhile, timer } from 'rxjs';
import { STUDIO_ORIGIN } from '../infrastructure/http/studio-origin.token';
import type { OperationItem, PaginatedResponse } from '../models/studio.models';
import type {
  GeneratorPresetPayload,
  PlanDetail,
  PlanGenerationAccepted,
  PlanItem,
  PlanPreset,
  PlanningInventory,
  SitePlanningSettings,
} from '../models/planning.models';

const RUNNING = new Set(['queued', 'running', 'retrying']);

/** Planning workspace endpoints (plans, items, presets, site planning defaults). */
@Injectable({ providedIn: 'root' })
export class PlanningApiService {
  private readonly http = inject(HttpClient);
  private readonly base = `${inject(STUDIO_ORIGIN)}/studio/api/backend/v2`;

  listPlans(): Observable<PaginatedResponse<PlanDetail>> {
    return this.http.get<PaginatedResponse<PlanDetail>>(`${this.base}/editorial-plans`, { params: { page: 1, pageSize: 100 } });
  }
  getPlan(planId: string): Observable<PlanDetail> {
    return this.http.get<PlanDetail>(`${this.base}/editorial-plans/${planId}`);
  }
  generatePlan(payload: Record<string, unknown>): Observable<PlanGenerationAccepted> {
    return this.http.post<PlanGenerationAccepted>(`${this.base}/editorial-plans/generate`, payload);
  }
  fillMissing(planId: string): Observable<PlanGenerationAccepted> {
    return this.http.post<PlanGenerationAccepted>(`${this.base}/editorial-plans/${planId}/fill`, {});
  }
  extendPlan(planId: string, payload: { dateTo: string; articlesPerDay?: number }): Observable<PlanGenerationAccepted> {
    return this.http.post<PlanGenerationAccepted>(`${this.base}/editorial-plans/${planId}/extend`, payload);
  }
  updatePlan(planId: string, payload: { name?: string; status?: 'archived' }): Observable<PlanDetail> {
    return this.http.patch<PlanDetail>(`${this.base}/editorial-plans/${planId}`, payload);
  }

  updateItem(itemId: string, payload: Record<string, unknown>): Observable<PlanItem> {
    return this.http.patch<PlanItem>(`${this.base}/editorial-plan-items/${itemId}`, payload);
  }
  approveItem(itemId: string): Observable<PlanItem> {
    return this.http.post<PlanItem>(`${this.base}/editorial-plan-items/${itemId}/approve`, {});
  }
  regenerateItem(itemId: string): Observable<PlanGenerationAccepted> {
    return this.http.post<PlanGenerationAccepted>(`${this.base}/editorial-plan-items/${itemId}/regenerate`, {});
  }
  generateDraft(itemId: string): Observable<{ project: { id: string } }> {
    return this.http.post<{ project: { id: string } }>(`${this.base}/editorial-plan-items/${itemId}/generate-content`, {});
  }
  bulkStatus(itemIds: string[], status: 'approved' | 'rejected' | 'proposed' | 'canceled'): Observable<{ updatedCount: number }> {
    return this.http.post<{ updatedCount: number }>(`${this.base}/editorial-plan-items/bulk-status`, { itemIds, status });
  }
  bulkDelete(itemIds: string[]): Observable<{ deletedCount: number }> {
    return this.http.post<{ deletedCount: number }>(`${this.base}/editorial-plan-items/bulk-delete`, { itemIds });
  }

  listPresets(siteId?: string): Observable<{ items: PlanPreset[] }> {
    return this.http.get<{ items: PlanPreset[] }>(`${this.base}/editorial-plan-presets`, { params: siteId ? { siteId } : {} });
  }
  createPreset(payload: { name: string; siteId?: string | null; payload: GeneratorPresetPayload }): Observable<PlanPreset> {
    return this.http.post<PlanPreset>(`${this.base}/editorial-plan-presets`, payload);
  }
  updatePreset(presetId: string, payload: { name?: string; payload?: GeneratorPresetPayload }): Observable<PlanPreset> {
    return this.http.patch<PlanPreset>(`${this.base}/editorial-plan-presets/${presetId}`, payload);
  }
  deletePreset(presetId: string): Observable<{ ok: true }> {
    return this.http.delete<{ ok: true }>(`${this.base}/editorial-plan-presets/${presetId}`);
  }

  getPlanningSettings(siteId: string): Observable<SitePlanningSettings> {
    return this.http.get<SitePlanningSettings>(`${this.base}/sites/${siteId}/planning-settings`);
  }
  putPlanningSettings(siteId: string, payload: Partial<Omit<SitePlanningSettings, 'siteId' | 'persisted'>>): Observable<SitePlanningSettings> {
    return this.http.put<SitePlanningSettings>(`${this.base}/sites/${siteId}/planning-settings`, payload);
  }
  inventory(siteId: string, q: string): Observable<PlanningInventory> {
    return this.http.get<PlanningInventory>(`${this.base}/sites/${siteId}/planning-inventory`, { params: { q, limit: 15 } });
  }

  /** Polls a durable operation every 2 s; emits each state and completes after the terminal one. */
  watchOperation(operationId: string): Observable<OperationItem> {
    return timer(0, 2000).pipe(
      switchMap(() => this.http.get<OperationItem>(`${this.base}/operations/${operationId}`)),
      takeWhile((op) => RUNNING.has(op.status), true),
    );
  }
}

export function isRunning(op: OperationItem | null): boolean {
  return Boolean(op && RUNNING.has(op.status));
}

/** Backend errors come as { error: { message } } or { message }. */
export function apiMessage(err: unknown, fallback: string): string {
  const body = (err as { error?: { error?: { message?: string }; message?: string } })?.error;
  return body?.error?.message || body?.message || fallback;
}
