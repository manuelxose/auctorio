import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { AppContextService } from '../services/app-context.service';
import { ResearchOverview, SeoIntelligenceApiService } from '../services/seo-intelligence-api.service';
import { ToastService } from '../services/toast.service';
import { SeoSettingsPageComponent } from './seo-settings-page.component';

const field = <T>(value: T | null, source = 'detected') => ({ value, source });
const overview = (): ResearchOverview => ({
  profile: {
    kinds: field(['established']), businessModel: field('publisher'), audience: field<string>(null, 'unknown'), topics: field(['series'], 'corrected'), excludedTopics: field<string[]>(null, 'unknown'), markets: field(['es-ES'], 'configured'),
    regions: field<string[]>(null, 'unknown'), languages: field(['es']), offerings: field<string[]>(null, 'unknown'), revenueObjectives: field<string[]>(null, 'unknown'), corrections: { topics: ['series'] }, reviewedAt: null, policy: { mode: 'automatic', targetDays: 75, minScore: 40 },
  },
  coverage: { available: 0, wanted: 0, articlesPerWeek: null, days: null, sufficient: false, needsReplenishment: false, stages: {}, gaps: [], topics: [], freshness: { newest: null, oldest: null } },
  triggers: [], runs: [], active: null, keywords: {}, intensity: 'balanced', allowance: { state: 'available', kind: 'recurring', usedPercent: 1, renewsAt: null, automatic: true, held: null },
} as ResearchOverview);

describe('SeoSettingsPageComponent', () => {
  const api = jasmine.createSpyObj<SeoIntelligenceApiService>('api', ['research', 'profile', 'saveResearchProfile', 'saveResearchPolicy']);
  const create = async (permissions = ['projects.manage', 'workspace.manage'], tab?: string) => {
    api.research.and.returnValue(of(overview()));
    api.profile.and.returnValue(of({ profile: 'publisher', chosen: false, profiles: ['publisher'], priorityTopics: [], holdoutPercent: 0, weights: {}, defaults: {} }));
    await TestBed.configureTestingModule({
      imports: [SeoSettingsPageComponent],
      providers: [provideRouter([]), { provide: ActivatedRoute, useValue: { queryParamMap: of(convertToParamMap(tab ? { tab } : {})) } }, { provide: SeoIntelligenceApiService, useValue: api }, { provide: ToastService, useValue: { success: () => undefined, error: () => undefined } },
        { provide: AppContextService, useValue: { activeSite: signal({ id: 'site' }), can: (permission: string) => permissions.includes(permission) } }],
    }).compileComponents();
    const fixture = TestBed.createComponent(SeoSettingsPageComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const button = (text: string) => [...host.querySelectorAll('button')].find((entry) => entry.textContent!.trim() === text) as HTMLButtonElement;
    return { fixture, host, button };
  };
  beforeEach(() => { api.saveResearchProfile.calls.reset(); api.saveResearchPolicy.calls.reset(); });

  it('sends only what a person wrote and turns an emptied field into null', async () => {
    api.saveResearchProfile.and.returnValue(of({}) as never);
    const { fixture, host, button } = await create();
    const model = host.querySelector('input[name="businessModel"]') as HTMLInputElement;
    model.value = 'Tienda';
    model.dispatchEvent(new Event('input'));
    const topics = [...host.querySelectorAll('input')].find((entry) => entry.placeholder === 'series')!;
    topics.value = '';
    topics.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    button('Guardar').click();
    await fixture.whenStable();
    expect(api.saveResearchProfile).toHaveBeenCalledTimes(1);
    const sent = api.saveResearchProfile.calls.mostRecent().args[1] as { corrections: Record<string, unknown>; reviewed: boolean };
    expect(sent.corrections['businessModel']).toBe('Tienda');
    expect(sent.corrections['topics']).toBeNull();
    expect(sent.corrections['audience']).toBeNull();
    expect(sent.reviewed).toBeTrue();
  });

  it('never sends an amount with the research policy', async () => {
    api.saveResearchPolicy.and.returnValue(of({}) as never);
    const { fixture, host, button } = await create(undefined, 'research');
    fixture.detectChanges();
    expect(host.textContent).not.toMatch(/USD|\$|€/);
    button('Guardar').click();
    await fixture.whenStable();
    expect(api.saveResearchPolicy).toHaveBeenCalledOnceWith('site', { mode: 'automatic', targetDays: 75, minScore: 40, intensity: 'balanced' });
    expect(Object.keys(api.saveResearchPolicy.calls.mostRecent().args[1]).some((key) => /usd|amount|budget/i.test(key))).toBeFalse();
  });

  it('shows a disabled form to a reader', async () => {
    const { host } = await create(['projects.read']);
    expect((host.querySelector('fieldset') as HTMLFieldSetElement).disabled).toBeTrue();
    expect(host.textContent).toContain('pero no cambiarlos');
  });

  it('keeps what was typed when saving fails', async () => {
    api.saveResearchProfile.and.returnValue(throwError(() => new Error('fail')));
    const { fixture, host, button } = await create();
    const model = host.querySelector('input[name="businessModel"]') as HTMLInputElement;
    model.value = 'Tienda';
    model.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    button('Guardar').click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(api.saveResearchProfile).toHaveBeenCalledTimes(1);
    expect((host.querySelector('input[name="businessModel"]') as HTMLInputElement).value).toBe('Tienda');
  });
});
