import { TestBed } from '@angular/core/testing';
import { Subject, of, throwError } from 'rxjs';
import { CalendarPageComponent } from './calendar-page.component';
import { StudioApiService } from '../services/studio-api.service';
import { AppContextService } from '../services/app-context.service';
import { ConfirmService } from '../services/confirm.service';
import { ToastService } from '../services/toast.service';
import type { CalendarEvent } from '../models/studio.models';

describe('CalendarPageComponent reschedule', () => {
  const event = (): CalendarEvent => ({
    id: 'publication-1', projectId: 'project-1', channel: 'website', status: 'scheduled',
    scheduledFor: '2026-08-23T10:00:00.000Z', publishedAt: null, externalUrl: null,
    title: 'Planned article', projectTitle: 'Planned article', destination: 'Website', site: null,
    account: null, thumbnail: null, automated: false, lastError: null, failureClass: null,
    createdAt: '2026-08-20T10:00:00.000Z', updatedAt: '2026-08-20T10:00:00.000Z',
  });

  function create(api: Record<string, jasmine.Spy>) {
    TestBed.configureTestingModule({ providers: [
      { provide: StudioApiService, useValue: api },
      { provide: AppContextService, useValue: { sites: () => [] } },
      { provide: ConfirmService, useValue: {} },
      { provide: ToastService, useValue: { success: jasmine.createSpy('success') } },
    ] });
    return TestBed.runInInjectionContext(() => new CalendarPageComponent());
  }

  it('restores the optimistic date when the API rejects the reschedule', () => {
    const api = {
      reschedulePublication: jasmine.createSpy().and.returnValue(throwError(() => new Error('failed'))),
      listCalendar: jasmine.createSpy().and.returnValue(of({ items: [] })),
    };
    const component = create(api);
    const publication = event();

    (component as unknown as { reschedule(item: CalendarEvent, target: Date): void })
      .reschedule(publication, new Date('2026-08-24T12:30:00.000Z'));

    expect(publication.scheduledFor).toBe('2026-08-23T10:00:00.000Z');
    expect(component.error).toBe('The publication could not be rescheduled.');
  });

  it('prevents concurrent reschedules for the same publication', () => {
    const pending = new Subject<CalendarEvent>();
    const api = {
      reschedulePublication: jasmine.createSpy().and.returnValue(pending),
      listCalendar: jasmine.createSpy().and.returnValue(of({ items: [] })),
    };
    const component = create(api);
    const publication = event();
    const reschedule = (component as unknown as { reschedule(item: CalendarEvent, target: Date): void }).reschedule.bind(component);

    reschedule(publication, new Date('2026-08-24T12:30:00.000Z'));
    reschedule(publication, new Date('2026-08-25T12:30:00.000Z'));

    expect(api.reschedulePublication).toHaveBeenCalledTimes(1);
  });
});
