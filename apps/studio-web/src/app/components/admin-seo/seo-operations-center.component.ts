import { CommonModule } from '@angular/common';
import { Component, computed, inject, output, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { SeoGovernorSettingsComponent } from '../seo-governor-settings.component';
import { SeoProviderSettingsComponent } from '../seo-provider-settings.component';
import { SeoCostAnalyticsComponent } from './seo-cost-analytics.component';
import { SeoEconomicsComponent } from './seo-economics.component';
import { SeoEmergencyStopComponent } from './seo-emergency-stop.component';
import { SeoGovernanceComponent } from './seo-governance.component';
import { SeoResearchOperationsComponent } from './seo-research-operations.component';

const TABS = [
  { id: 'providers', label: 'Proveedores' }, { id: 'budgets', label: 'Presupuestos' }, { id: 'costs', label: 'Costes' }, { id: 'research', label: 'Investigación' }, { id: 'data', label: 'Datos y gobierno' }, { id: 'economics', label: 'Rentabilidad' },
] as const;

/** Administración global → Operaciones SEO: one place for providers, budgets, costs, research, data and the emergency stop. */
@Component({
  selector: 'app-seo-operations-center',
  standalone: true,
  imports: [CommonModule, RouterLink, SeoEmergencyStopComponent, SeoProviderSettingsComponent, SeoGovernorSettingsComponent, SeoCostAnalyticsComponent, SeoResearchOperationsComponent, SeoGovernanceComponent, SeoEconomicsComponent],
  styles: [`:host { display: grid; gap: 14px; min-width: 0; } :host > * { min-width: 0; margin-block: 0 !important; } nav { display: flex; overflow-x: auto; } a.au-tab { text-decoration: none; white-space: nowrap; }`],
  template: `
    <app-seo-emergency-stop (forbidden)="forbidden.emit()" (changed)="refresh()" />
    <nav class="au-tabs" aria-label="Operaciones SEO">
      @for (item of tabs; track item.id) { <a class="au-tab" routerLink="." [queryParams]="{ tab: item.id }" [class.is-active]="tab() === item.id" [attr.aria-current]="tab() === item.id ? 'page' : null">{{ item.label }}</a> }
    </nav>
    @for (key of [version()]; track key) {
      @switch (tab()) {
        @case ('budgets') { <app-seo-governor-settings /> }
        @case ('costs') { <app-seo-cost-analytics /> }
        @case ('research') { <app-seo-research-operations /> }
        @case ('data') { <app-seo-governance /> }
        @case ('economics') { <app-seo-economics /> }
        @default { <app-seo-provider-settings (forbidden)="forbidden.emit()" /> }
      }
    }
  `,
})
export class SeoOperationsCenterComponent {
  private readonly query = toSignal(inject(ActivatedRoute).queryParamMap);

  readonly forbidden = output<void>();
  readonly tabs = TABS;
  readonly tab = computed(() => TABS.find((item) => item.id === this.query()?.get('tab'))?.id ?? 'providers');
  /** The emergency stop changes what every section shows. */
  readonly version = signal(0);

  refresh(): void {
    this.version.update((value) => value + 1);
  }
}
