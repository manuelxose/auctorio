import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { STUDIO_ORIGIN } from '../infrastructure/http/studio-origin.token';
import type { AssistantAction, AssistantContextView, AssistantTool } from '../models/assistant.models';
import type { EditorialSelection } from './editorial-context.service';

@Injectable({ providedIn: 'root' })
export class AssistantApiService {
  private readonly http = inject(HttpClient);
  private readonly base = `${inject(STUDIO_ORIGIN)}/studio/api/backend/v2/copilot`;

  tools(): Observable<{ items: AssistantTool[] }> {
    return this.http.get<{ items: AssistantTool[] }>(`${this.base}/tools`);
  }

  /** The server re-loads the ids with tenant checks and returns names for the context chip. */
  context(selection: EditorialSelection): Observable<AssistantContextView> {
    return this.http.post<AssistantContextView>(`${this.base}/context`, selection);
  }

  confirm(actionId: string): Observable<{ action: AssistantAction; replayed: boolean }> {
    return this.http.post<{ action: AssistantAction; replayed: boolean }>(`${this.base}/actions/${actionId}/confirm`, {});
  }

  cancel(actionId: string): Observable<{ action: AssistantAction }> {
    return this.http.post<{ action: AssistantAction }>(`${this.base}/actions/${actionId}/cancel`, {});
  }

  describe(error: HttpErrorResponse): string {
    const body = error.error as { error?: { message?: string } | string; message?: string } | null;
    if (body && typeof body.error === 'object' && body.error?.message) return body.error.message;
    if (body?.message) return body.message;
    return error.status === 0 ? 'The Studio API is not reachable' : `Request failed (${error.status})`;
  }
}
