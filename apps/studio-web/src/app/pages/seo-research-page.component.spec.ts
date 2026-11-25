import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { AppContextService } from '../services/app-context.service';
import { ResearchOverview, SeoIntelligenceApiService } from '../services/seo-intelligence-api.service';
import { ToastService } from '../services/toast.service';
import { SeoResearchPageComponent } from './seo-research-page.component';

const field = <T>(value: T | null, source = 'detected') => ({ value, source });
const run = (id: string, status: string) => ({
  id, trigger: 'manual', reason: { detail: `Motivo ${id}` }, status, maxUsd: 0.25, estimatedUsd: 0.096, error: null, createdAt: '2026-11-25T10:00:00Z', progress: 40,
  cost: { actualUsd: 0.024, heldUsd: 0, uncertain: 0, requests: 1 }, tasks: [{ id: 't', kind: 'serp', subject: 'guia tv', status: 'skipped', reason: 'run_limit', external: true, maxUsd: 0.01, billedUsd: 0, result: null }],
});
const overview = (patch: Partial<ResearchOverview> = {}): ResearchOverview => ({
  profile: {
    kinds: field(['established']), businessModel: field('publisher'), audience: field<string>(null, 'unknown'), topics: field(['series'], 'corrected'), excludedTopics: field<string[]>(null, 'unknown'), markets: field(['es-ES'], 'configured'),
    languages: field(['es']), revenueObjectives: field<string[]>(null, 'unknown'), corrections: { topics: ['series'] }, reviewedAt: null, policy: { mode: 'automatic', maxUsdPerRun: 0.25, targetDays: 75, minScore: 40 },
  },
  coverage: { available: 12, wanted: 75, articlesPerWeek: 7, days: 12, needsReplenishment: true, stages: { qualified: 12, rejected: 3 }, gaps: ['cine'] },
  triggers: [{ trigger: 'insufficient_opportunities', detail: 'Cubren 12 días.' }], runs: [run('a', 'paused'), run('b', 'partial')], active: null, keywords: { opportunity: 12, rejected: 30 }, ...patch,
} as ResearchOverview);

describe('SeoResearchPageComponent', () => {
  const api = jasmine.createSpyObj<SeoIntelligenceApiService>('api', ['research', 'researchRun', 'estimateResearch', 'startResearch', 'controlResearch', 'saveResearchProfile', 'saveResearchPolicy']);
  const create = async (view: ResearchOverview) => {
    api.research.and.returnValue(of(view));
    await TestBed.configureTestingModule({
      imports: [SeoResearchPageComponent],
      providers: [provideRouter([]), { provide: SeoIntelligenceApiService, useValue: api }, { provide: AppContextService, useValue: { activeSite: signal({ id: 'site' }) } }, { provide: ToastService, useValue: { success: () => undefined, error: () => undefined } }],
    }).compileComponents();
    const fixture = TestBed.createComponent(SeoResearchPageComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const button = (text: string) => [...host.querySelectorAll('button')].find((entry) => entry.textContent!.trim() === text) as HTMLButtonElement;
    return { fixture, host, button };
  };

  it('shows the reserve, why research is justified and the runs in a table', async () => {
    const { host } = await create(overview());
    expect(host.querySelector('.advanced-kpis')!.textContent).toContain('12');
    expect(host.textContent).toContain('Faltan oportunidades: Cubren 12 días.');
    expect(host.querySelectorAll('.sr-table tbody tr').length).toBe(2);
    expect(host.textContent).toContain('Corregido por tu equipo');
  });

  it('asks before spending and controls a run', async () => {
    api.estimateResearch.and.returnValue(of({ acquisitions: [{ kind: 'discover_seed', subject: 'cine', maxUsd: 0.024, blocked: null }], maxUsd: 0.024 }));
    api.startResearch.and.returnValue(of({ created: true, run: run('c', 'queued') }));
    api.controlResearch.and.returnValue(of(run('a', 'queued')));
    const { fixture, host, button } = await create(overview());
    button('Reanudar').click();
    await fixture.whenStable();
    expect(api.controlResearch).toHaveBeenCalledOnceWith('site', 'a', 'resume');
    fixture.detectChanges();
    expect(button('Reintentar')).toBeTruthy();
    (host.querySelector('.au-page__actions button') as HTMLButtonElement).click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(host.textContent).toContain('Compraría como máximo 1 lote(s)');
    expect(api.startResearch).not.toHaveBeenCalled();
    button('Empezar').click();
    await fixture.whenStable();
    expect(api.startResearch).toHaveBeenCalledTimes(1);
  });

  it('explains what was not bought and sends only corrections a person wrote', async () => {
    api.researchRun.and.returnValue(of(run('b', 'partial')));
    api.saveResearchProfile.and.returnValue(of({}));
    const { fixture, host, button } = await create(overview());
    (host.querySelector('.sr-table .au-link-button') as HTMLButtonElement).click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(host.querySelector('.au-drawer')!.textContent).toContain('Superaba el límite de la investigación.');
    button('Corregir').click();
    fixture.detectChanges();
    await fixture.whenStable();
    button('Guardar perfil').click();
    await fixture.whenStable();
    expect(api.saveResearchProfile).toHaveBeenCalledOnceWith('site', { corrections: { businessModel: null, audience: null, topics: ['series'], excludedTopics: null, offerings: null, revenueObjectives: null, markets: null, regions: null }, reviewed: true });
  });

  it('offers no new run while one is open', async () => {
    const open = run('d', 'paused');
    const { host } = await create(overview({ runs: [open] as never, active: open as never }));
    expect((host.querySelector('.au-page__actions button') as HTMLButtonElement).disabled).toBeTrue();
  });
});
