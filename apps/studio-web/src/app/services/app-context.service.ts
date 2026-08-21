import { Injectable, computed, inject, signal } from '@angular/core';
import { lastValueFrom } from 'rxjs';
import type { StudioSession, StudioSite } from '../models/studio.models';
import { StudioApiService } from './studio-api.service';

/**
 * Single canonical application context: current user, accessible sites and the
 * active site. Components must read from here instead of resolving tenant or
 * workspace concepts independently.
 */
@Injectable({ providedIn: 'root' })
export class AppContextService {
  private readonly api = inject(StudioApiService);

  private readonly sessionState = signal<StudioSession | null>(null);
  private readonly loadingState = signal(false);
  private readonly loadedState = signal(false);
  private inFlight: Promise<StudioSession | null> | null = null;

  readonly session = this.sessionState.asReadonly();
  readonly loading = this.loadingState.asReadonly();
  readonly loaded = this.loadedState.asReadonly();
  readonly user = computed(() => this.sessionState()?.user ?? null);
  readonly sites = computed(() => this.sessionState()?.sites ?? []);
  readonly activeSite = computed<StudioSite | null>(() => {
    const session = this.sessionState();
    if (!session) {
      return null;
    }
    return (
      session.sites.find((site) => site.id === session.activeSiteId) ??
      session.sites[0] ??
      null
    );
  });
  readonly role = computed(() => this.sessionState()?.role ?? 'viewer');

  async ensureSession(force = false): Promise<StudioSession | null> {
    if (!force && this.loadedState()) {
      return this.sessionState();
    }
    if (!force && this.inFlight) {
      return this.inFlight;
    }

    this.loadingState.set(true);
    this.inFlight = lastValueFrom(this.api.getSession())
      .then((session) => {
        this.sessionState.set(session);
        this.loadedState.set(true);
        return session;
      })
      .catch((error) => {
        this.sessionState.set(null);
        this.loadedState.set(true);
        throw error;
      })
      .finally(() => {
        this.loadingState.set(false);
        this.inFlight = null;
      });

    return this.inFlight;
  }

  setSession(session: StudioSession | null): void {
    this.sessionState.set(session);
    this.loadedState.set(Boolean(session));
  }

  async switchSite(siteId: string): Promise<StudioSession> {
    const session = await lastValueFrom(this.api.setActiveSite(siteId));
    this.sessionState.set(session);
    return session;
  }

  async logout(): Promise<void> {
    try {
      await lastValueFrom(this.api.logout());
    } finally {
      this.sessionState.set(null);
      this.loadedState.set(false);
    }
  }

  clearSession(): void {
    this.sessionState.set(null);
    this.loadedState.set(false);
  }
}
