import { provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { WritingSettingsPageComponent } from './writing-settings-page.component';
import { AppContextService } from '../services/app-context.service';
import { PlanningApiService } from '../services/planning-api.service';
import { ToastService } from '../services/toast.service';

describe('Writing settings site changes', () => {
  it('ignores stale loads and preserves edits and pending saves for their site', () => {
    const activeSite = signal<{ id: string; name: string } | null>({ id: 'a', name: 'A' });
    const reads: Record<string, Subject<any>> = {};
    const writes: Array<{ site: string; result: Subject<any> }> = [];
    const api = {
      getPlanningSettings: (id: string) => (reads[id] = new Subject<any>()),
      putPlanningSettings: (site: string) => { const result = new Subject<any>(); writes.push({ site, result }); return result; },
    };
    TestBed.configureTestingModule({ providers: [
      provideRouter([]),
      { provide: AppContextService, useValue: { activeSite } },
      { provide: PlanningApiService, useValue: api },
      { provide: ToastService, useValue: { success: () => {}, error: () => {} } },
    ] });
    const page = TestBed.runInInjectionContext(() => new WritingSettingsPageComponent());
    TestBed.flushEffects();
    activeSite.set({ id: 'b', name: 'B' }); TestBed.flushEffects();
    reads['a'].next({ articleTargets: { writing: { disclaimer: 'stale' } } });
    expect(page.writing).toBeNull();
    reads['b'].next({ articleTargets: {} });
    page.writing!.disclaimer = 'B draft'; page.dirty = true; page.save();
    expect(writes[0].site).toBe('b');
    page.writing!.disclaimer = 'B newer';
    activeSite.set({ id: 'a', name: 'A' }); TestBed.flushEffects();
    reads['a'].next({ articleTargets: {} });
    writes[0].result.next({ articleTargets: {} });
    expect(page.siteName).toBe('A');
    activeSite.set({ id: 'b', name: 'B' }); TestBed.flushEffects();
    expect(page.writing!.disclaimer).toBe('B newer');
    expect(page.dirty).toBeTrue();
    expect(page.saving).toBeFalse();
  });
});
