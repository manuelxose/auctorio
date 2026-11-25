import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { AppContextService } from '../services/app-context.service';
import { ConfirmService } from '../services/confirm.service';
import { ResearchOverview, SeoIntelligenceApiService } from '../services/seo-intelligence-api.service';
import { ToastService } from '../services/toast.service';
import { SeoResearchPageComponent } from './seo-research-page.component';

const field = <T>(value: T | null, source = 'detected') => ({ value, source });
const run = (id: string, status: string) => ({
  id, trigger: 'manual', reason: { detail: `Motivo ${id}` }, status, error: null, createdAt: '2026-11-25T10:00:00Z', finishedAt: null, progress: 40, completedTasks: 1, totalTasks: 2,
  tasks: [{ id: 't', kind: 'serp', subject: 'guia tv', market: 'es-ES', status: 'skipped', reason: 'run_limit', external: true, result: null }],
});
const overview = (patch: Partial<ResearchOverview> = {}): ResearchOverview => ({
  profile: {
    kinds: field(['established']), businessModel: field('publisher'), audience: field<string>(null, 'unknown'), topics: field(['series'], 'corrected'), excludedTopics: field<string[]>(null, 'unknown'), markets: field(['es-ES', 'es-MX'], 'configured'),
    regions: field<string[]>(null, 'unknown'), languages: field(['es']), offerings: field<string[]>(null, 'unknown'), revenueObjectives: field<string[]>(null, 'unknown'), corrections: {}, reviewedAt: null, policy: { mode: 'automatic', targetDays: 75, minScore: 40 },
  },
  coverage: { available: 12, wanted: 75, articlesPerWeek: 7, days: 12, sufficient: false, needsReplenishment: true, stages: { qualified: 12, rejected: 3 }, gaps: ['cine'], topics: [], freshness: { newest: 1, oldest: 9 } },
  triggers: [{ trigger: 'insufficient_opportunities', detail: 'Cubren 12 días.' }], runs: [run('a', 'paused'), run('b', 'partial')], active: null, keywords: { opportunity: 12, rejected: 30 }, intensity: null,
  allowance: { state: 'available', kind: 'recurring', usedPercent: 35, renewsAt: '2026-12-01T00:00:00Z', automatic: true, held: null }, ...patch,
} as ResearchOverview);
const preview = (blocked: string | null = null) => ({ acquisitions: [{ kind: 'discover_seed', subject: 'cine', market: 'es-ES', reason: 'Falta', blocked }], maxPercent: 8, knownPercent: 5, exceedsAllowance: false, allowance: overview().allowance });

describe('SeoResearchPageComponent', () => {
  const api = jasmine.createSpyObj<SeoIntelligenceApiService>('api', ['research', 'researchRun', 'previewResearch', 'startResearch', 'controlResearch']);
  const confirm = jasmine.createSpyObj<ConfirmService>('confirm', ['confirm']);
  const create = async (view: ResearchOverview, permissions = ['projects.manage']) => {
    api.research.and.returnValue(of(view));
    await TestBed.configureTestingModule({
      imports: [SeoResearchPageComponent],
      providers: [
        provideRouter([]), { provide: SeoIntelligenceApiService, useValue: api }, { provide: ConfirmService, useValue: confirm }, { provide: ToastService, useValue: { success: () => undefined, error: () => undefined } },
        { provide: AppContextService, useValue: { activeSite: signal({ id: 'site' }), can: (permission: string) => permissions.includes(permission) } },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(SeoResearchPageComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const button = (text: string) => [...host.querySelectorAll('button')].find((entry) => entry.textContent!.trim() === text) as HTMLButtonElement;
    return { fixture, host, button };
  };
  beforeEach(() => { api.previewResearch.calls.reset(); api.startResearch.calls.reset(); api.controlResearch.calls.reset(); confirm.confirm.calls.reset(); });

  it('shows the allowance, why research is justified and the runs in a table, never an amount', async () => {
    const { host } = await create(overview());
    expect(host.textContent).toContain('35 % usado');
    expect(host.querySelector('.advanced-kpis')!.textContent).toContain('12');
    expect(host.textContent).toContain('Faltan oportunidades: Cubren 12 días.');
    expect(host.querySelectorAll('.sr-table tbody tr').length).toBe(2);
    expect(host.textContent).not.toMatch(/USD|\$|€/);
  });

  it('previews first and only starts after the person confirms', async () => {
    api.previewResearch.and.returnValue(of(preview()) as never);
    api.startResearch.and.returnValue(of({ created: true, run: run('c', 'queued') }) as never);
    const { fixture, host, button } = await create(overview());
    button('Pedir investigación').click();
    fixture.detectChanges();
    button('Ver alcance').click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(api.previewResearch).toHaveBeenCalledOnceWith('site', {});
    expect(host.textContent).toContain('Usará como máximo el 8 % de la asignación.');
    expect(api.startResearch).not.toHaveBeenCalled();
    button('Empezar').click();
    await fixture.whenStable();
    expect(api.startResearch).toHaveBeenCalledOnceWith('site', {});
  });

  it('says nothing is consulted when every step is blocked', async () => {
    api.previewResearch.and.returnValue(of(preview('budget_exhausted')) as never);
    const { fixture, host, button } = await create(overview());
    button('Pedir investigación').click();
    fixture.detectChanges();
    button('Ver alcance').click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(host.textContent).toContain('No consultará a ningún proveedor.');
  });

  it('controls a run, and asks before cancelling', async () => {
    api.controlResearch.and.returnValue(of(run('a', 'queued')) as never);
    const { fixture, button } = await create(overview());
    button('Reanudar').click();
    await fixture.whenStable();
    expect(api.controlResearch).toHaveBeenCalledOnceWith('site', 'a', 'resume');

    confirm.confirm.and.resolveTo(false);
    button('Cancelar').click();
    await fixture.whenStable();
    expect(confirm.confirm).toHaveBeenCalledTimes(1);
    expect(api.controlResearch).toHaveBeenCalledTimes(1);

    confirm.confirm.and.resolveTo(true);
    button('Cancelar').click();
    await fixture.whenStable();
    expect(api.controlResearch).toHaveBeenCalledWith('site', 'a', 'cancel');
  });

  it('explains what was not asked in the run detail', async () => {
    api.researchRun.and.returnValue(of(run('b', 'partial')) as never);
    const { fixture, host } = await create(overview());
    (host.querySelector('.sr-table .au-link-button') as HTMLButtonElement).click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(host.querySelector('.au-drawer')!.textContent).toContain('Superaba el límite de la investigación.');
  });

  it('offers no new run while one is open', async () => {
    const open = run('d', 'paused');
    const { button } = await create(overview({ runs: [open] as never, active: open as never }));
    expect(button('Pedir investigación').disabled).toBeTrue();
  });

  it('offers no actions to a reader and sends profile editing to the settings page', async () => {
    const { host, button } = await create(overview(), []);
    expect(button('Pedir investigación')).toBeUndefined();
    expect(button('Reanudar')).toBeUndefined();
    expect(button('Guardar perfil')).toBeUndefined();
    expect([...host.querySelectorAll('a')].some((link) => link.getAttribute('href') === '/studio/settings/seo')).toBeTrue();
  });
});
