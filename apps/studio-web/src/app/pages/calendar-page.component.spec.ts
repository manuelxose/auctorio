import { TestBed } from '@angular/core/testing';
import { Subject, of, throwError } from 'rxjs';
import { CalendarPageComponent } from './calendar-page.component';
import { StudioApiService } from '../services/studio-api.service';
import { AppContextService } from '../services/app-context.service';
import { PlanningApiService } from '../services/planning-api.service';
import { ToastService } from '../services/toast.service';
import type { CalendarEvent } from '../models/studio.models';

describe('CalendarPageComponent reschedule', () => {
  const event = (): CalendarEvent => ({
    kind: 'publication', planId: null, planItemId: null, priority: null, contentType: null,
    id: 'publication-1', projectId: 'project-1', channel: 'website', status: 'scheduled',
    scheduledFor: '2026-08-23T10:00:00.000Z', publishedAt: null, externalUrl: null,
    title: 'Planned article', projectTitle: 'Planned article', destination: 'Website', site: null,
    account: null, thumbnail: null, automated: false, lastError: null, failureClass: null,
    createdAt: '2026-08-20T10:00:00.000Z', updatedAt: '2026-08-20T10:00:00.000Z',
  });

  function create(api: Record<string, jasmine.Spy>) {
    TestBed.configureTestingModule({ providers: [
      { provide: StudioApiService, useValue: api },
      { provide: AppContextService, useValue: { sites: () => [], activeSite: () => ({ id: 'site-1', name: 'Site one' }) } },
      { provide: PlanningApiService, useValue: {} },
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

  it('reads wall-clock input in the site timezone across the DST change', () => {
    const component = create({ listCalendar: jasmine.createSpy().and.returnValue(of({ items: [], timeZone: 'Europe/Madrid' })) });
    component.timeZone = 'Europe/Madrid';
    const fromWallClock = (component as unknown as { fromWallClock(value: string): Date | null }).fromWallClock.bind(component);
    // Summer (CEST, UTC+2) and winter (CET, UTC+1) on either side of 2026-10-25.
    expect(fromWallClock('2026-10-24T10:00')?.toISOString()).toBe('2026-10-24T08:00:00.000Z');
    expect(fromWallClock('2026-10-26T10:00')?.toISOString()).toBe('2026-10-26T09:00:00.000Z');
    expect(component.timeLabel('2026-10-26T09:00:00.000Z')).toBe('10:00');
  });

  it('labels proposals and scheduled publications differently for assistive tech', () => {
    const component = create({ listCalendar: jasmine.createSpy().and.returnValue(of({ items: [] })) });
    component.timeZone = 'Europe/Madrid';
    expect(component.ariaLabel(event())).toContain('Scheduled publication');
    expect(component.ariaLabel({ ...event(), kind: 'plan_item', status: 'proposed' })).toContain('Proposal, not scheduled to publish');
    const socialDraft: CalendarEvent = { ...event(), kind: 'social_draft', channel: 'x', status: 'draft' };
    expect(component.ariaLabel(socialDraft)).toContain('Social draft: X');
    expect(component.ariaLabel(socialDraft)).toContain('pending approval');
    expect(component.canDrag(socialDraft)).toBeFalse();
  });

  it('shows Instagram and X below website posts on the same day, including in compact cells', () => {
    const component = create({});
    const website = event();
    const instagram = { ...website, id: 'instagram', channel: 'instagram' as const, scheduledFor: '2026-08-23T08:00:00.000Z' };
    const thread = { ...website, id: 'thread', channel: 'x' as const, scheduledFor: '2026-08-23T09:00:00.000Z' };
    component.events = [thread, website, { ...website, id: 'web-2' }, { ...website, id: 'web-3' }, instagram];
    const entries = component.groupedEvents[0].entries.map(({ item }) => item);
    expect(entries.map(({ channel }) => channel)).toEqual(['website', 'website', 'website', 'instagram', 'x']);
    expect(component.compactDayEvents(entries).map(({ channel }) => channel)).toEqual(['website', 'website', 'instagram']);
  });
});
