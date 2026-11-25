import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { AdminSeoOpsApiService, Economics } from '../../services/admin-seo-ops-api.service';
import { SEO_LOCALE, seoError } from '../seo-labels';
import { AppIconComponent } from '../ui/app-icon.component';

/** Known variable cost of each workspace. Auctorio stores no revenue, so no margin is shown. */
@Component({
  selector: 'app-seo-economics',
  standalone: true,
  providers: SEO_LOCALE,
  imports: [CommonModule, FormsModule, AppIconComponent],
  styles: [`
    :host { display: grid; gap: 14px; }
    :host > * { margin-block: 0 !important; min-width: 0; }
    .filters { display: flex; flex-wrap: wrap; gap: 10px; align-items: end; }
    .filters .au-field { margin: 0; }
    .note { color: var(--au-muted); font-size: var(--au-fs-metadata); }
    table { min-width: 860px; }
  `],
  template: `
    <section class="au-panel au-panel--padded" aria-labelledby="ec-title">
      <div class="advanced-card-header"><h2 class="au-panel__title" id="ec-title">Rentabilidad por suscripción</h2><p>Costes variables conocidos, en USD.</p></div>
      <div class="au-banner au-banner--info" role="note"><app-icon name="info"></app-icon><span class="au-banner__text">Auctorio no guarda cobros de suscripciones: los ingresos y el margen de contribución no están disponibles y no se estiman. El margen de contribución serían los ingresos menos estos costes; no es el beneficio de la empresa, que además incluye personal, infraestructura y el resto de gastos fijos.</span></div>
      <form class="filters au-mt-3" (ngSubmit)="load()">
        <label class="au-field"><span class="au-field__label">Desde</span><input class="au-input" type="date" name="from" [(ngModel)]="range.from" /></label>
        <label class="au-field"><span class="au-field__label">Hasta</span><input class="au-input" type="date" name="to" [(ngModel)]="range.to" /></label>
        <button class="au-btn au-btn--primary" type="submit" [disabled]="loading()">Aplicar</button>
      </form>
    </section>
    @if (failed(); as reason) { <div class="au-banner au-banner--error" role="alert"><app-icon name="warning"></app-icon><span class="au-banner__text">{{ reason }}</span><button class="au-banner__action" type="button" (click)="load()">Reintentar</button></div> }
    @if (data(); as d) {
      <dl class="advanced-kpis" aria-label="Costes del periodo">
        <div class="au-stat"><dt class="au-stat__label">Datos SEO</dt><dd class="au-stat__value">{{ d.totals.seoUsd | number: '1.2-4' }}</dd><dd class="au-stat__note">Liquidado</dd></div>
        <div class="au-stat"><dt class="au-stat__label">IA de texto</dt><dd class="au-stat__value">{{ d.totals.aiUsd | number: '1.2-4' }}</dd><dd class="au-stat__note">Cargos registrados</dd></div>
        <div class="au-stat"><dt class="au-stat__label">Imágenes</dt><dd class="au-stat__value">{{ d.totals.imageUsd | number: '1.2-4' }}</dd><dd class="au-stat__note">Cargos registrados</dd></div>
        <div class="au-stat"><dt class="au-stat__label">Ingresos</dt><dd class="au-stat__value">—</dd><dd class="au-stat__note">No disponibles</dd></div>
      </dl>
      <section class="au-panel au-panel--padded" aria-label="Costes por workspace">
        <div class="au-table-wrap au-table-wrap--scrollable" role="region" aria-label="Costes por workspace" tabindex="0"><table class="au-table au-table--keep-columns">
          <thead><tr><th scope="col">Workspace</th><th scope="col">Plan</th><th scope="col" class="au-num">Sitios</th><th scope="col" class="au-num">Ingresos</th><th scope="col" class="au-num">Datos SEO</th><th scope="col" class="au-num">IA de texto</th><th scope="col" class="au-num">Imágenes</th><th scope="col" class="au-num">Coste conocido</th><th scope="col" class="au-num">Margen de contribución</th></tr></thead>
          <tbody>@for (row of d.rows; track row.tenantId) { <tr><td>{{ row.tenant }}</td><td>{{ row.plan ?? 'Sin plan' }}</td><td class="au-num">{{ row.sites }}</td><td class="au-num">{{ money(row.revenueUsd) }}</td><td class="au-num">{{ money(row.seoUsd) }}</td><td class="au-num">{{ money(row.aiUsd) }}</td><td class="au-num">{{ money(row.imageUsd) }}</td><td class="au-num">{{ money(row.knownCostUsd) }}</td><td class="au-num">{{ money(row.contributionMarginUsd) }}</td></tr> } @empty { <tr><td colspan="9">No hay workspaces.</td></tr> }</tbody>
        </table></div>
        <p class="note au-mt-2">«No disponible» no es cero: no hay ningún cargo registrado, por ejemplo porque el proveedor no informa de su coste.</p>
      </section>
    } @else if (!failed()) { <div class="au-skeleton" style="height: 120px" aria-label="Cargando costes por suscripción"></div> }
  `,
})
export class SeoEconomicsComponent implements OnInit {
  private readonly api = inject(AdminSeoOpsApiService);

  readonly data = signal<Economics | null>(null);
  readonly failed = signal('');
  readonly loading = signal(false);
  range = { from: '', to: '' };

  ngOnInit(): void {
    void this.load();
  }

  money(value: number | null): string {
    return value === null ? 'No disponible' : value.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  }

  async load(): Promise<void> {
    this.loading.set(true);
    try {
      const data = await firstValueFrom(this.api.economics(this.range));
      this.failed.set('');
      this.data.set(data);
      this.range = { ...data.range };
    } catch (error) {
      this.failed.set(seoError(error, 'No se han podido calcular. Revisa las fechas.'));
    } finally {
      this.loading.set(false);
    }
  }
}
