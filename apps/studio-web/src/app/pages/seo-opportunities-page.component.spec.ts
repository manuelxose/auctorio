import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { AppContextService } from '../services/app-context.service';
import { SeoIntelligenceApiService, SeoOpportunity } from '../services/seo-intelligence-api.service';
import { ToastService } from '../services/toast.service';
import { SeoOpportunitiesPageComponent } from './seo-opportunities-page.component';

const item = (id: string, patch: Partial<SeoOpportunity> = {}): SeoOpportunity => ({
  id, source: 'search_console', kind: 'query', topic: `Tema ${id}`, query: `consulta ${id}`, targetUrl: null, action: 'create_content', status: 'open', score: 50, confidence: 80, market: 'es-ES', intent: 'informational', stage: 'qualified',
  explanation: null, actions: [], analyzedAt: null, ...patch,
} as unknown as SeoOpportunity);

describe('SeoOpportunitiesPageComponent', () => {
  const api = jasmine.createSpyObj<SeoIntelligenceApiService>('api', ['opportunities', 'connection', 'decide', 'plan', 'analyze']);
  const create = async (items: SeoOpportunity[], permissions = ['projects.manage'], id: string | null = null) => {
    api.opportunities.and.returnValue(of({ items, total: items.length }) as never);
    api.connection.and.returnValue(of({ status: 'active', configured: true }) as never);
    await TestBed.configureTestingModule({
      imports: [SeoOpportunitiesPageComponent],
      providers: [
        provideRouter([]), { provide: SeoIntelligenceApiService, useValue: api }, { provide: ToastService, useValue: { success: () => undefined, error: () => undefined } },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap(id ? { id } : {}) } } },
        { provide: AppContextService, useValue: { activeSite: signal({ id: 'site' }), can: (permission: string) => permissions.includes(permission) } },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(SeoOpportunitiesPageComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const pick = (label: string, value: string) => {
      const select = host.querySelector(`select[aria-label="${label}"]`) as HTMLSelectElement;
      select.value = value;
      select.dispatchEvent(new Event('change'));
      fixture.detectChanges();
    };
    const titles = () => [...host.querySelectorAll('tbody td.so-title .au-link-button')].map((entry) => entry.textContent!.trim());
    const button = (text: string) => [...host.querySelectorAll('button')].find((entry) => entry.textContent!.trim() === text) as HTMLButtonElement | undefined;
    return { fixture, host, pick, titles, button };
  };
  beforeEach(() => { api.decide.calls.reset(); api.plan.calls.reset(); });

  it('filters by create or improve', async () => {
    const { pick, titles } = await create([item('a'), item('b', { action: 'update_existing', targetUrl: 'https://x.test/b' })]);
    pick('Crear o mejorar', 'create');
    expect(titles()).toEqual(['Tema a']);
    pick('Crear o mejorar', 'improve');
    expect(titles().length).toBe(1);
    expect(titles()[0]).not.toBe('Tema a');
  });

  it('filters by intent and market, and tells an unknown intent apart', async () => {
    const { pick, titles } = await create([item('a'), item('b', { intent: null, market: 'es-MX' }), item('c', { intent: 'transactional', market: 'es-MX' })]);
    pick('Intención', 'unknown');
    expect(titles()).toEqual(['Tema b']);
    pick('Intención', '');
    pick('Mercado', 'es-MX');
    expect(titles()).toEqual(['Tema b', 'Tema c']);
  });

  it('treats an unknown confidence as neither low nor high', async () => {
    const { pick, titles } = await create([item('a', { confidence: 80 }), item('b', { confidence: 30 }), item('c', { confidence: null })]);
    pick('Confianza', 'low');
    expect(titles()).toEqual(['Tema b']);
    pick('Confianza', 'unknown');
    expect(titles()).toEqual(['Tema c']);
    pick('Confianza', 'high');
    expect(titles()).toEqual(['Tema a']);
  });

  it('puts an unknown score last when sorting', async () => {
    const { pick, titles } = await create([item('a', { score: null }), item('b', { score: 10 }), item('c', { score: 60 })]);
    pick('Ordenar', 'score');
    expect(titles()).toEqual(['Tema c', 'Tema b', 'Tema a']);
  });

  it('pages by 25', async () => {
    const { host, titles, button, fixture } = await create(Array.from({ length: 30 }, (_, index) => item(String(index))));
    expect(titles().length).toBe(25);
    expect(host.textContent).toContain('Página 1 de 2');
    button('Siguiente')!.click();
    fixture.detectChanges();
    expect(titles().length).toBe(5);
  });

  it('defers a decision from the detail', async () => {
    api.decide.and.returnValue(of({}) as never);
    const { fixture, host, button } = await create([item('a')]);
    (host.querySelector('tbody td.so-title .au-link-button') as HTMLButtonElement).click();
    fixture.detectChanges();
    button('Aplazar')!.click();
    await fixture.whenStable();
    expect(api.decide).toHaveBeenCalledOnceWith('site', 'a', 'deferred');
  });

  it('offers no action buttons without projects.manage', async () => {
    const { fixture, host, button } = await create([item('a')], []);
    expect(button('Aprobar')).toBeUndefined();
    expect(button('Al plan')).toBeUndefined();
    expect(button('Analizar ahora')).toBeUndefined();
    (host.querySelector('tbody td.so-title .au-link-button') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(button('Aplazar')).toBeUndefined();
    expect(host.querySelector('.au-drawer')!.textContent).toContain('no decidir sobre ellas');
  });

  it('opens the opportunity named by ?id= wherever it is', async () => {
    const { host } = await create([item('a'), item('b', { status: 'approved', topic: 'Pedida' })], ['projects.manage'], 'b');
    expect(host.querySelector('.au-drawer-title, .au-drawer__title')!.textContent).toContain('Pedida');
  });
});
