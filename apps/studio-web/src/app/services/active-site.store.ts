import { Injectable, signal } from '@angular/core';

/**
 * The active site id, kept apart from AppContextService so the HTTP interceptor
 * (loaded on every page) does not pull the whole Studio API client into the initial bundle.
 */
@Injectable({ providedIn: 'root' })
export class ActiveSiteStore {
  readonly siteId = signal<string | null>(null);
}
