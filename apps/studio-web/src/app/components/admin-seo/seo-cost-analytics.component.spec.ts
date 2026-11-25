import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { AdminApiService } from '../../services/admin-api.service';
import { AdminSeoOpsApiService, CostAnalytics } from '../../services/admin-seo-ops-api.service';
import { ToastService } from '../../services/toast.service';
import { SeoCostAnalyticsComponent } from './seo-cost-analytics.component';

const costs = (patch: Partial<CostAnalytics['units']> = {}): CostAnalytics => ({
  range: { from: '2026-11-01', to: '2026-11-25' },
  totals: { requests: 10, settledUsd: 1.5, estimatedUsd: 1.4, heldUsd: 0, uncertain: 0, uncertainUsd: 0, assumedUsd: 0, failures: 0, failedUsd: 0, onboardingUsd: 0, recurringUsd: 0 },
  units: { keywords: 0, perKeywordUsd: null, opportunities: 0, perOpportunityUsd: null, articles: null, perArticleUsd: null, perOnboardingSiteUsd: null, perRecurringSiteUsd: null, ...patch },
  cache: { countedSince: null, reused: 4, bought: 6, duplicatesPrevented: 1, hitRate: 0.4, avoidedUsdEstimate: 0.5, unpricedAnswers: 0, refused: {}, byProvider: [] },
  by: { provider: [], operation: [], tenant: [], site: [], plan: [], run: [], day: [] },
});

describe('SeoCostAnalyticsComponent', () => {
  const create = async (view: CostAnalytics) => {
    await TestBed.configureTestingModule({
      imports: [SeoCostAnalyticsComponent],
      providers: [{ provide: AdminSeoOpsApiService, useValue: { costs: () => of(view) } }, { provide: AdminApiService, useValue: { seoGovernor: () => of({ targets: { tenants: [], sites: [] }, pricing: { entries: [] } }) } }, { provide: ToastService, useValue: {} }],
    }).compileComponents();
    const fixture = TestBed.createComponent(SeoCostAnalyticsComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  };
  const rowOf = (host: HTMLElement, label: string) => [...host.querySelectorAll('tr')].find((entry) => entry.textContent!.includes(label))!;

  it('labels what was not charged as an estimate', async () => {
    const host = await create(costs());
    expect(rowOf(host, 'Gasto evitado').textContent).toContain('(estimación)');
    expect(host.textContent).toContain('Nadie ha cobrado ni devuelto ese importe');
    expect(host.textContent).toContain('Estimado de lo liquidado');
  });

  it('shows a unit cost nobody can work out as a dash, not as zero', async () => {
    const host = await create(costs());
    expect(rowOf(host, 'Palabra investigada').querySelectorAll('td')[2].textContent!.trim()).toBe('—');
    expect(rowOf(host, 'Artículo publicado').querySelectorAll('td')[1].textContent!.trim()).toBe('—');
  });

  it('shows a real unit cost as an amount', async () => {
    const host = await create(costs({ keywords: 10, perKeywordUsd: 0.05 }));
    expect(rowOf(host, 'Palabra investigada').querySelectorAll('td')[2].textContent!.trim()).toBe('0,05');
  });
});
