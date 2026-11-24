import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { of } from 'rxjs';
import { editSocialHashtags, SocialPageComponent, socialPostState } from './social-page.component';
import { SocialSettingsPageComponent } from './social-settings-page.component';
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

describe('editSocialHashtags', () => {
  it('updates the text sent to the platform without creating another post in an X thread', () => {
    const updated = editSocialHashtags('Primero\n\nSegundo', [], '#Guía', false);
    expect(updated).toEqual({ body: 'Primero\n\nSegundo\n#Guía', hashtags: ['#Guía'] });
    expect(editSocialHashtags(updated.body, updated.hashtags, '#guía', true))
      .toEqual({ body: 'Primero\n\nSegundo', hashtags: [] });
    expect(editSocialHashtags('Lee #GuíaLocal y #GUÍA', [], '#guía', true).body).toBe('Lee #GuíaLocal y');
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
        { provide: ActivatedRoute, useValue: { queryParamMap: of(convertToParamMap({ tab: 'x', post: 'post-1' })) } },
        { provide: StudioApiService, useValue: api },
        { provide: AppContextService, useValue: { activeSite: () => ({ id: 'site-1' }) } },
        { provide: ToastService, useValue: jasmine.createSpyObj('ToastService', ['success', 'error', 'info']) },
      ],
    });
    const page = TestBed.runInInjectionContext(() => new SocialPageComponent());
    page.ngOnInit();
    expect(api.listSiteSocial).toHaveBeenCalledWith('site-1', 'x', 'post-1');
    page.approve({ id: 'post-1', body: 'Edited' } as never);
    expect(api.updateSocial).toHaveBeenCalledWith('post-1', { body: 'Edited', editorialStatus: 'approved' });
    expect(api.listSiteSocial).toHaveBeenCalledTimes(2);
    expect(api.getSocialSettings).not.toHaveBeenCalled();

    const settings = TestBed.runInInjectionContext(() => new SocialSettingsPageComponent());
    settings.ngOnInit();
    settings.toggleDay(3);
    expect(settings.settings()!.postDays).toEqual([1, 3]);
  });
});
