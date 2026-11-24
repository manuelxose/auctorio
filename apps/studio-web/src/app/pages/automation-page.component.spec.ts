import { provideRouter } from '@angular/router';
import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { AutomationPageComponent } from './automation-page.component';
import { AppContextService } from '../services/app-context.service';
import { StudioApiService } from '../services/studio-api.service';
import { ToastService } from '../services/toast.service';
import { ConfirmService } from '../services/confirm.service';
import type { AutomationPolicy } from '../models/studio.models';

describe('Automation policy saving', () => {
  it('does not resend an unchanged mode, retains rejected edits and adopts the returned policy', () => {
    const result = new Subject<AutomationPolicy>();
    const update = jasmine.createSpy('update').and.returnValue(result);
    TestBed.configureTestingModule({ providers: [
      provideRouter([]),
      { provide: AppContextService, useValue: { activeSite: () => ({ id: 'site', name: 'Site' }), permissions: () => ['workspace.manage'] } },
      { provide: StudioApiService, useValue: { updateAutomationPolicy: update, getAutomationStatus: () => new Subject() } },
      { provide: ConfirmService, useValue: {} },
      { provide: ToastService, useValue: { success: () => {} } },
    ] });
    const page = TestBed.runInInjectionContext(() => new AutomationPageComponent());
    page.policy = { mode: 'assisted', state: 'paused', enabled: true, timezone: 'Europe/Madrid', publishingWindows: [] } as unknown as AutomationPolicy;
    page.savedMode = 'assisted';
    page.save();
    expect(update.calls.mostRecent().args[0].mode).toBeUndefined();
    result.error({ error: { message: 'rejected' } });
    expect(page.policy.mode).toBe('assisted');
    expect(page.feedback).toBe('rejected');
    expect(page.saving).toBeFalse();

    const success = new Subject<AutomationPolicy>(); update.and.returnValue(success);
    page.setMode('manual'); page.save();
    expect(update.calls.mostRecent().args[0].mode).toBe('manual');
    const saved = { ...page.policy, enabled: false, state: 'paused' } as AutomationPolicy;
    success.next(saved);
    expect(page.policy).toBe(saved);
    expect(page.savedMode).toBe('manual');
    expect(page.policy.state).toBe('paused');
  });
});

