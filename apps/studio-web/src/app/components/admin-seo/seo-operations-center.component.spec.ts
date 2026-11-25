import { Component, output } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { SeoGovernorSettingsComponent } from '../seo-governor-settings.component';
import { SeoProviderSettingsComponent } from '../seo-provider-settings.component';
import { SeoCostAnalyticsComponent } from './seo-cost-analytics.component';
import { SeoEconomicsComponent } from './seo-economics.component';
import { SeoEmergencyStopComponent } from './seo-emergency-stop.component';
import { SeoGovernanceComponent } from './seo-governance.component';
import { SeoOperationsCenterComponent } from './seo-operations-center.component';
import { SeoResearchOperationsComponent } from './seo-research-operations.component';

const stub = (selector: string) => {
  @Component({ selector, standalone: true, template: `<p>${selector}</p>` })
  class Stub { readonly forbidden = output<void>(); readonly changed = output<void>(); }
  return Stub;
};

describe('SeoOperationsCenterComponent', () => {
  const create = async (tab?: string) => {
    await TestBed.configureTestingModule({
      imports: [SeoOperationsCenterComponent],
      providers: [provideRouter([]), { provide: ActivatedRoute, useValue: { queryParamMap: of(convertToParamMap(tab ? { tab } : {})) } }],
    }).overrideComponent(SeoOperationsCenterComponent, {
      remove: { imports: [SeoEmergencyStopComponent, SeoProviderSettingsComponent, SeoGovernorSettingsComponent, SeoCostAnalyticsComponent, SeoResearchOperationsComponent, SeoGovernanceComponent, SeoEconomicsComponent] },
      add: { imports: ['app-seo-emergency-stop', 'app-seo-provider-settings', 'app-seo-governor-settings', 'app-seo-cost-analytics', 'app-seo-research-operations', 'app-seo-governance', 'app-seo-economics'].map(stub) },
    }).compileComponents();
    const fixture = TestBed.createComponent(SeoOperationsCenterComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  };

  it('opens the providers tab by default and keeps the emergency stop always at hand', async () => {
    const host = await create();
    expect(host.querySelector('app-seo-provider-settings')).toBeTruthy();
    expect(host.querySelector('app-seo-emergency-stop')).toBeTruthy();
    expect(host.querySelector('a.au-tab.is-active')!.textContent!.trim()).toBe('Proveedores');
  });

  for (const [tab, selector] of [['budgets', 'app-seo-governor-settings'], ['costs', 'app-seo-cost-analytics'], ['research', 'app-seo-research-operations'], ['data', 'app-seo-governance'], ['economics', 'app-seo-economics']]) {
    it(`shows ${selector} for ?tab=${tab}`, async () => {
      const host = await create(tab);
      expect(host.querySelector(selector)).toBeTruthy();
      expect(host.querySelector('app-seo-provider-settings')).toBeNull();
      expect(host.querySelector('app-seo-emergency-stop')).toBeTruthy();
    });
  }

  it('falls back to providers for an unknown tab', async () => {
    expect((await create('nada')).querySelector('app-seo-provider-settings')).toBeTruthy();
  });
});
