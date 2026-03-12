import { Injectable, computed, inject, signal } from '@angular/core';
import { lastValueFrom } from 'rxjs';
import type { StudioPermission, StudioSession } from '../models/studio.models';
import { StudioApiService } from './studio-api.service';

@Injectable({ providedIn: 'root' })
export class StudioSessionService {
  private readonly api = inject(StudioApiService);
  private readonly sessionState = signal<StudioSession | null>(null);
  private readonly loadingState = signal(false);
  private readonly loadedState = signal(false);
  private inFlight: Promise<StudioSession | null> | null = null;

  readonly session = this.sessionState.asReadonly();
  readonly loading = this.loadingState.asReadonly();
  readonly loaded = this.loadedState.asReadonly();
  readonly permissions = computed(() => this.sessionState()?.permissions ?? []);

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

  clearSession(): void {
    this.sessionState.set(null);
    this.loadedState.set(false);
  }

  hasPermission(permission: StudioPermission): boolean {
    return this.permissions().includes(permission);
  }

  hasAnyPermission(permissions: StudioPermission[]): boolean {
    const current = this.permissions();
    return permissions.some((permission) => current.includes(permission));
  }
}
