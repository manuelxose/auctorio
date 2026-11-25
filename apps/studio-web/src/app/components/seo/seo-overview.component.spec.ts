import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { AppContextService } from '../../services/app-context.service';
import { SeoIntelligenceApiService, SeoWorkspaceOverview } from '../../services/seo-intelligence-api.service';
import { SeoOverviewComponent } from './seo-overview.component';

const data = (patch: Partial<SeoWorkspaceOverview> = {}): SeoWorkspaceOverview => ({
  research: { lastRun: null, keywords: 0, pages: { total: 0, read: 0 } },
  connection: { configured: true, status: 'not_connected', property: null, syncedThrough: null },
  organic: null, opportunities: { open: 0, approved: 0, planned: 0, waiting: 0, completed: 0 }, recommendations: [],
  coverage: { available: 0, wanted: 75, articlesPerWeek: null, days: null, sufficient: false, needsReplenishment: true, stages: {}, gaps: [], topics: [], freshness: { newest: null, oldest: null } },
  allowance: { state: 'available', kind: 'recurring', usedPercent: 0, renewsAt: null, automatic: true, held: null }, nextAction: 'connect_search_console', ...patch,
} as unknown as SeoWorkspaceOverview);

describe('SeoOverviewComponent', () => {
  const create = async (view: SeoWorkspaceOverview) => {
    await TestBed.configureTestingModule({
      imports: [SeoOverviewComponent],
      providers: [provideRouter([]), { provide: SeoIntelligenceApiService, useValue: { workspace: () => of(view) } }, { provide: AppContextService, useValue: { activeSite: signal({ id: 'site' }) } }],
    }).compileComponents();
    const fixture = TestBed.createComponent(SeoOverviewComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  };
  const stat = (host: HTMLElement, label: string) => [...host.querySelectorAll('.au-stat')].find((entry) => entry.querySelector('.au-stat__label')!.textContent!.trim() === label)!;

  it('shows a dash, and no invented figure, when there is no organic data', async () => {
    const host = await create(data());
    expect(stat(host, 'Clics orgánicos').querySelector('.au-stat__value')!.textContent!.trim()).toBe('—');
    expect(stat(host, 'Impresiones').querySelector('.au-stat__value')!.textContent!.trim()).toBe('—');
    expect(stat(host, 'Clics orgánicos').textContent).toContain('Conecta Search Console para verlos');
  });

  it('shows the real figures when Search Console reports them', async () => {
    const figures = { clicks: 1234, impressions: 56789, position: 8.2, days: 28 };
    const host = await create(data({ organic: { from: '2026-10-01', through: '2026-10-28', days: 28, current: figures, previous: null } }));
    expect(stat(host, 'Clics orgánicos').querySelector('.au-stat__value')!.textContent!.trim()).toBe('1.234');
    expect(stat(host, 'Impresiones').textContent).toContain('Posición media 8,2');
  });

  it('links the next action to where it is done', async () => {
    const host = await create(data());
    const link = host.querySelector('.next a') as HTMLAnchorElement;
    expect(link.textContent!.trim()).toBe('Conectar');
    expect(link.getAttribute('href')).toBe('/studio/settings/seo?tab=data');
  });
});
