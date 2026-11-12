import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { Subscription, filter } from 'rxjs';
import { STUDIO_ORIGIN } from '../infrastructure/http/studio-origin.token';
import { AppContextService } from './app-context.service';
import { EditorialContextService } from './editorial-context.service';
import type { AssistantAction } from '../models/assistant.models';

export type CopilotMessageStatus = 'completed' | 'failed' | 'cancelled' | 'pending';

export type CopilotMessage = {
  id: string;
  threadId: string;
  role: 'user' | 'assistant';
  content: string;
  status: CopilotMessageStatus;
  competencyKey: string | null;
  evidence: { sources: Array<{ label: string; path: string }>; findings: Array<{ severity: string; message: string }> } | null;
  provider: string | null;
  model: string | null;
  tokensInput: number | null;
  tokensOutput: number | null;
  durationMs: number | null;
  error: string | null;
  createdAt: string;
  /** Pending/finished write actions the assistant staged for this answer. */
  actions?: AssistantAction[];
};

export type CopilotThreadSummary = { id: string; title: string; siteId: string | null; updatedAt: string };

export type CopilotCompetency = {
  key: string;
  label: string;
  description: string;
  scope: 'workspace' | 'site' | 'project';
  permission: string;
  mutates: boolean;
  allowed: boolean;
};

export type CopilotCompetencyStat = { key: string; status: string; runs: number; tokensInput: number | null; tokensOutput: number | null; lastRunAt: string };

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;

/**
 * Client state for the Studio copilot panel. All data lives on the server:
 * threads are per user, and every message carries the page context (route,
 * active site, open article) which the API re-validates against the tenant.
 */
@Injectable({ providedIn: 'root' })
export class CopilotService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly appContext = inject(AppContextService);
  private readonly editorial = inject(EditorialContextService);
  private readonly base = `${inject(STUDIO_ORIGIN)}/studio/api/backend/v2/copilot`;

  readonly open = signal(false);
  readonly wide = signal(false);
  readonly threads = signal<CopilotThreadSummary[]>([]);
  readonly threadsLoading = signal(false);
  readonly activeThreadId = signal<string | null>(null);
  readonly messages = signal<CopilotMessage[]>([]);
  readonly sending = signal(false);
  readonly loadError = signal<string | null>(null);
  readonly route = signal('/studio');
  readonly competencies = signal<CopilotCompetency[]>([]);

  /** Article open in the current route (content workspace), if any. */
  readonly projectId = computed(() => {
    const match = /^\/studio\/content\/([^/?#]+)/.exec(this.route());
    return match && UUID.test(match[1]) ? match[1] : null;
  });

  readonly siteId = computed(() => this.appContext.activeSite()?.id ?? null);

  private inFlight: Subscription | null = null;

  constructor() {
    this.route.set(this.router.url.split(/[?#]/)[0]);
    this.router.events.pipe(filter((event) => event instanceof NavigationEnd)).subscribe(() => this.route.set(this.router.url.split(/[?#]/)[0]));
  }

  toggle(force?: boolean): void {
    const next = force ?? !this.open();
    this.open.set(next);
    if (next && !this.threads().length) {
      this.loadThreads();
      this.loadCompetencies();
    }
  }

  loadThreads(query = ''): void {
    this.threadsLoading.set(true);
    const params = query.trim() ? new HttpParams().set('q', query.trim()) : undefined;
    this.http.get<{ items: CopilotThreadSummary[] }>(`${this.base}/threads`, { params }).subscribe({
      next: (response) => {
        this.threads.set(response.items);
        this.threadsLoading.set(false);
        this.loadError.set(null);
      },
      error: (error: HttpErrorResponse) => {
        this.threadsLoading.set(false);
        this.loadError.set(this.describe(error));
      },
    });
  }

  loadCompetencies(): void {
    this.http.get<{ items: CopilotCompetency[] }>(`${this.base}/competencies`).subscribe({
      next: (response) => this.competencies.set(response.items),
      error: () => undefined,
    });
  }

  newThread(): void {
    this.cancel();
    this.activeThreadId.set(null);
    this.messages.set([]);
  }

  openThread(id: string): void {
    this.cancel();
    this.activeThreadId.set(id);
    this.messages.set([]);
    this.http.get<{ messages: CopilotMessage[] }>(`${this.base}/threads/${id}`).subscribe({
      next: (thread) => this.messages.set(thread.messages),
      error: (error: HttpErrorResponse) => this.loadError.set(this.describe(error)),
    });
  }

  deleteThread(id: string): void {
    this.http.delete(`${this.base}/threads/${id}`).subscribe({
      next: () => {
        this.threads.update((items) => items.filter((item) => item.id !== id));
        if (this.activeThreadId() === id) this.newThread();
      },
      error: (error: HttpErrorResponse) => this.loadError.set(this.describe(error)),
    });
  }

  /** Sends a question, optionally forcing a competency, with the current page context attached. */
  send(content: string, competencyKey: string | null = null): void {
    const text = content.trim();
    if (!text || this.sending()) return;
    const placeholderId = `pending-${Date.now()}`;
    const now = new Date().toISOString();
    this.messages.update((items) => [
      ...items,
      this.localMessage(placeholderId + '-q', 'user', text, 'completed', now),
      this.localMessage(placeholderId, 'assistant', '', 'pending', now),
    ]);
    this.sending.set(true);
    this.inFlight = this.http
      .post<{ threadId: string; userMessage: CopilotMessage; message: CopilotMessage }>(`${this.base}/messages`, {
        threadId: this.activeThreadId(),
        content: text,
        competencyKey,
        context: { ...this.editorial.selection(), siteId: this.siteId(), projectId: this.editorial.selection().projectId ?? this.projectId(), route: this.route() },
      })
      .subscribe({
        next: (response) => {
          this.sending.set(false);
          const isNew = this.activeThreadId() !== response.threadId;
          this.activeThreadId.set(response.threadId);
          this.messages.update((items) => [
            ...items.filter((item) => !item.id.startsWith(placeholderId)),
            response.userMessage,
            response.message,
          ]);
          if (isNew) this.loadThreads();
        },
        error: (error: HttpErrorResponse) => {
          this.sending.set(false);
          this.messages.update((items) =>
            items.map((item) => (item.id === placeholderId ? { ...item, status: 'failed', error: this.describe(error) } : item)),
          );
        },
      });
  }

  /** Swaps in the server's latest state of an action after confirm/cancel. */
  replaceAction(action: AssistantAction): void {
    this.messages.update((items) => items.map((item) => (item.actions?.some((a) => a.id === action.id) ? { ...item, actions: item.actions.map((a) => (a.id === action.id ? action : a)) } : item)));
  }

  /** Stops waiting for the answer. The server stores it as cancelled. */
  cancel(): void {
    if (!this.inFlight) return;
    this.inFlight.unsubscribe();
    this.inFlight = null;
    this.sending.set(false);
    this.messages.update((items) => items.map((item) => (item.status === 'pending' ? { ...item, status: 'cancelled' } : item)));
  }

  retry(message: CopilotMessage): void {
    if (this.sending()) return;
    if (message.id.startsWith('pending-')) {
      // Never reached the server: resend the question.
      const index = this.messages().findIndex((item) => item.id === message.id);
      const question = this.messages()[index - 1];
      this.messages.update((items) => items.filter((item) => item.id !== message.id && item.id !== question?.id));
      if (question) this.send(question.content, null);
      return;
    }
    this.sending.set(true);
    this.messages.update((items) => items.map((item) => (item.id === message.id ? { ...item, status: 'pending', error: null } : item)));
    this.inFlight = this.http.post<{ message: CopilotMessage }>(`${this.base}/messages/${message.id}/retry`, {}).subscribe({
      next: (response) => {
        this.sending.set(false);
        this.messages.update((items) => items.map((item) => (item.id === message.id ? response.message : item)));
      },
      error: (error: HttpErrorResponse) => {
        this.sending.set(false);
        this.messages.update((items) => items.map((item) => (item.id === message.id ? { ...item, status: 'failed', error: this.describe(error) } : item)));
      },
    });
  }

  private localMessage(id: string, role: 'user' | 'assistant', content: string, status: CopilotMessageStatus, createdAt: string): CopilotMessage {
    return { id, threadId: this.activeThreadId() ?? '', role, content, status, competencyKey: null, evidence: null, provider: null, model: null, tokensInput: null, tokensOutput: null, durationMs: null, error: null, createdAt };
  }

  private describe(error: HttpErrorResponse): string {
    const body = error.error as { error?: { message?: string } | string; message?: string } | null;
    if (body && typeof body.error === 'object' && body.error?.message) return body.error.message;
    if (body?.message) return body.message;
    return error.status === 0 ? 'The Studio API is not reachable' : `Request failed (${error.status})`;
  }
}
