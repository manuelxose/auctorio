import { Injectable, computed, signal } from '@angular/core';

/**
 * What the operator is looking at right now. Pages publish into it; the
 * contextual assistant reads it so its answers and actions target the real
 * selection (never a guess). Only ids and the visible period are shared.
 */
export type EditorialSelection = {
  siteId: string | null;
  planId: string | null;
  planItemId: string | null;
  projectId: string | null;
  /** Visible calendar period as inclusive local dates (YYYY-MM-DD). */
  periodFrom: string | null;
  periodTo: string | null;
  /** Route-level area, e.g. 'plan', 'calendar', 'intelligence', 'sources', 'competitors'. */
  area: string | null;
};

const EMPTY: EditorialSelection = { siteId: null, planId: null, planItemId: null, projectId: null, periodFrom: null, periodTo: null, area: null };

@Injectable({ providedIn: 'root' })
export class EditorialContextService {
  private readonly state = signal<EditorialSelection>(EMPTY);
  readonly selection = this.state.asReadonly();
  readonly hasSelection = computed(() => Boolean(this.state().planItemId || this.state().planId || this.state().projectId));

  /** Merge a partial update from the page that owns that part of the selection. */
  update(patch: Partial<EditorialSelection>): void {
    this.state.update((current) => ({ ...current, ...patch }));
  }

  /** Called by a page on destroy to drop the parts it owned. */
  clear(keys: Array<keyof EditorialSelection>): void {
    this.state.update((current) => {
      const next = { ...current };
      for (const key of keys) next[key] = null;
      return next;
    });
  }
}
