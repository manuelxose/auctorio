import { isPlatformBrowser } from '@angular/common';
import { inject, Injectable, OnDestroy, PLATFORM_ID } from '@angular/core';
import { Subject } from 'rxjs';
import { STUDIO_ORIGIN } from '../infrastructure/http/studio-origin.token';
import { StudioApiService } from './studio-api.service';
import type { StudioEventMessage } from '../models/studio.models';

export type EventListener = (event: StudioEventMessage) => void;

/**
 * Authenticated Server-Sent Events channel with Last-Event-ID replay and a
 * visibility-aware polling fallback. The BFF signs the request from the
 * session cookie, so the browser needs no extra credentials.
 */
@Injectable({ providedIn: 'root' })
export class SseService implements OnDestroy {
  private readonly api = inject(StudioApiService);
  private readonly origin = inject(STUDIO_ORIGIN);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly browser = isPlatformBrowser(this.platformId);

  private source: EventSource | null = null;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private pollInterval = 15_000;
  private lastEventId: string | null = null;
  private lastOperationSeen: Record<string, string> = {};
  private polling = false;
  private listeners = new Set<EventListener>();
  private readonly connectionSubject = new Subject<'open' | 'fallback' | 'closed'>();

  readonly connection$ = this.connectionSubject.asObservable();

  subscribe(listener: EventListener): () => void {
    this.listeners.add(listener);
    if (this.listeners.size === 1) {
      this.open();
    }
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0) {
        this.close();
      }
    };
  }

  private open(): void {
    if (!this.browser) {
      return;
    }
    if (typeof EventSource !== 'undefined') {
      this.openStream();
    } else {
      this.startPolling();
    }
  }

  private openStream(): void {
    const url = new URL(`${this.origin}/studio/api/backend/v2/events/stream`);
    this.source = new EventSource(url.toString());
    this.source.onopen = () => this.connectionSubject.next('open');
    this.source.onerror = () => {
      // EventSource reconnects by itself; after two failures fall back to
      // efficient polling with visibility-aware backoff.
      if (this.polling) {
        return;
      }
      this.source?.close();
      this.source = null;
      this.startPolling();
    };
    this.source.addEventListener('message', (raw) => {
      try {
        const event = JSON.parse((raw as MessageEvent).data) as StudioEventMessage;
        this.lastEventId = (raw as MessageEvent<string> & { lastEventId?: string }).lastEventId ?? this.lastEventId;
        this.emit(event);
      } catch {
        /* ignore malformed frames */
      }
    });
    // Named events share the same payload shape.
    this.source.onmessage = null;
  }

  private startPolling(): void {
    if (this.polling) {
      return;
    }
    this.polling = true;
    this.connectionSubject.next('fallback');
    const tick = (): void => {
      if (document.visibilityState === 'hidden') {
        this.pollInterval = 60_000;
      } else {
        this.pollInterval = 15_000;
      }
      this.api.listOperations({ page: 1, pageSize: 8 }).subscribe({
        next: (response) => {
          for (const operation of response.items) {
            const key = `${operation.id}:${operation.status}:${operation.progress}`;
            if (this.lastOperationSeen[operation.id] !== key) {
              this.lastOperationSeen[operation.id] = key;
              this.emit({
                type: `operation.${operation.status}`,
                payload: { operationId: operation.id, status: operation.status, progress: operation.progress, phase: operation.phase },
                siteId: operation.siteId,
                emittedAt: operation.updatedAt,
              });
            }
          }
        },
        error: () => undefined,
      });
      this.pollTimer = setTimeout(tick, this.pollInterval);
    };
    tick();
  }

  private emit(event: StudioEventMessage): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        /* listener errors must not break the stream */
      }
    }
  }

  private close(): void {
    this.source?.close();
    this.source = null;
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
    this.polling = false;
    this.connectionSubject.next('closed');
  }

  ngOnDestroy(): void {
    this.close();
    this.connectionSubject.complete();
  }
}
