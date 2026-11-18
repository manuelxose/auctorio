import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { SocialPageComponent, socialPostState } from './social-page.component';
import { StudioApiService } from '../services/studio-api.service';
import { AppContextService } from '../services/app-context.service';
import { ToastService } from '../services/toast.service';

describe('socialPostState', () => {
  const done = { generationStatus: 'done' as const, publication: null };
  it('maps review and delivery to a queue state', () => {
    expect(socialPostState({ ...done, editorialStatus: 'draft' })).toBe('Pendiente de aprobación');
    expect(socialPostState({ ...done, editorialStatus: 'approved', publication: { id: 'p', status: 'scheduled', scheduledFor: null } })).toBe('Programado');
    expect(socialPostState({ ...done, editorialStatus: 'approved', publication: { id: 'p', status: 'ready', scheduledFor: null } })).toBe('Listo para publicar a mano');
    expect(socialPostState({ generationStatus: 'processing', editorialStatus: 'draft', publication: null })).toBe('Generando');
  });
});

describe('SocialPageComponent', () => {
  it('approves with the edited caption and reloads posts', () => {
    const api = {
      getSocialSettings: jasmine.createSpy().and.returnValue(of({ siteId: 'site-1', workflow: 'approve', postDays: [1], postTime: '10:00', timezone: 'UTC', categories: ['myths'] })),
      listSiteSocial: jasmine.createSpy().and.returnValue(of({ items: [] })),
      updateSocial: jasmine.createSpy().and.returnValue(of({})),
      putSocialSettings: jasmine.createSpy().and.returnValue(of({})),
    };
    TestBed.configureTestingModule({
      providers: [
        { provide: StudioApiService, useValue: api },
        { provide: AppContextService, useValue: { activeSite: () => ({ id: 'site-1' }) } },
        { provide: ToastService, useValue: jasmine.createSpyObj('ToastService', ['success', 'error', 'info']) },
      ],
    });
    const page = TestBed.runInInjectionContext(() => new SocialPageComponent());
    page.ngOnInit();
    page.toggleDay(3);
    expect(page.settings()!.postDays).toEqual([1, 3]);
    page.approve({ id: 'post-1', body: 'Edited' } as never);
    expect(api.updateSocial).toHaveBeenCalledWith('post-1', { body: 'Edited', editorialStatus: 'approved' });
    expect(api.listSiteSocial).toHaveBeenCalledTimes(2);
  });
});
