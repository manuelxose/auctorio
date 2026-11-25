import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { AdminApiService, AdminSeoGovernor } from '../../services/admin-api.service';
import { AdminSeoOpsApiService, CostAnalytics, CostRow } from '../../services/admin-seo-ops-api.service';
import { ToastService } from '../../services/toast.service';
import { SEO_LOCALE, SEO_BLOCKS, SEO_CAPABILITY_LABELS, seoError } from '../seo-labels';
import { AppIconComponent } from '../ui/app-icon.component';

const GROUPS = [
  { id: 'tenant', label: 'Workspace' }, { id: 'site', label: 'Sitio' }, { id: 'provider', label: 'Proveedor' }, { id: 'operation', label: 'Operación' }, { id: 'plan', label: 'Plan' }, { id: 'run', label: 'Investigación' }, { id: 'day', label: 'Día' },
] as const;

/** What external SEO data cost, from the ledger. Amounts that were not charged are labelled as estimates. */
@Component({
  selector: 'app-seo-cost-analytics',
  standalone: true,
  providers: SEO_LOCALE,
  imports: [CommonModule, FormsModule, AppIconComponent],
  styles: [`
    :host { display: grid; gap: 14px; }
    :host > * { margin-block: 0 !important; min-width: 0; }
    .filters { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 10px; align-items: end; }
    .filters .au-field { margin: 0; }
    .head { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: start; gap: 10px; }
    .note { color: var(--au-muted); font-size: var(--au-fs-metadata); }
    table { min-width: 720px; }
  `],
  template: `
    <section class="au-panel au-panel--padded" aria-labelledby="ca-filters">
      <div class="advanced-card-header head"><div><h2 class="au-panel__title" id="ca-filters">Costes de datos SEO</h2><p>Importes en USD, según el registro de consumo. El plan es el que tiene hoy cada workspace.</p></div>
        <button class="au-btn au-btn--secondary au-btn--sm" type="button" [disabled]="!data() || !!busy()" (click)="exportCsv()">{{ busy() === 'export' ? 'Exportando…' : 'Exportar CSV' }}</button></div>
      <form class="filters" (ngSubmit)="load()">
        <label class="au-field"><span class="au-field__label">Desde</span><input class="au-input" type="date" name="from" [(ngModel)]="filters.from" /></label>
        <label class="au-field"><span class="au-field__label">Hasta</span><input class="au-input" type="date" name="to" [(ngModel)]="filters.to" /></label>
        <label class="au-field"><span class="au-field__label">Workspace</span><select class="au-select" name="tenant" [(ngModel)]="filters.tenantId" (ngModelChange)="filters.siteId = ''"><option value="">Todos</option>@for (tenant of targets()?.tenants ?? []; track tenant.id) { <option [value]="tenant.id">{{ tenant.name }}</option> }</select></label>
        <label class="au-field"><span class="au-field__label">Sitio</span><select class="au-select" name="site" [(ngModel)]="filters.siteId"><option value="">Todos</option>@for (site of sites(); track site.id) { <option [value]="site.id">{{ site.name }}</option> }</select></label>
        <label class="au-field"><span class="au-field__label">Proveedor</span><select class="au-select" name="provider" [(ngModel)]="filters.providerId"><option value="">Todos</option>@for (id of providers(); track id) { <option [value]="id">{{ id }}</option> }</select></label>
        <label class="au-field"><span class="au-field__label">Operación</span><select class="au-select" name="operation" [(ngModel)]="filters.operation"><option value="">Todas</option>@for (entry of operations; track entry[0]) { <option [value]="entry[0]">{{ entry[1] }}</option> }</select></label>
        <label class="au-field"><span class="au-field__label">Plan</span><select class="au-select" name="plan" [(ngModel)]="filters.plan"><option value="">Todos</option>@for (plan of plans(); track plan) { <option [value]="plan">{{ plan === 'none' ? 'Sin plan' : plan }}</option> }</select></label>
        <label class="au-field"><span class="au-field__label">Id de investigación</span><input class="au-input" name="run" maxlength="36" [(ngModel)]="filters.runId" /></label>
        <button class="au-btn au-btn--primary" type="submit" [disabled]="!!busy()">{{ busy() === 'load' ? 'Calculando…' : 'Aplicar' }}</button>
      </form>
    </section>
    @if (failed(); as reason) { <div class="au-banner au-banner--error" role="alert"><app-icon name="warning"></app-icon><span class="au-banner__text">{{ reason }}</span><button class="au-banner__action" type="button" (click)="load()">Reintentar</button></div> }
    @if (data(); as d) {
      <dl class="advanced-kpis" aria-label="Totales de coste">
        <div class="au-stat"><dt class="au-stat__label">Gasto liquidado</dt><dd class="au-stat__value">{{ d.totals.settledUsd | number: '1.2-4' }}</dd><dd class="au-stat__note">{{ d.totals.requests }} peticiones enviadas</dd></div>
        <div class="au-stat"><dt class="au-stat__label">Estimado de lo liquidado</dt><dd class="au-stat__value">{{ d.totals.estimatedUsd | number: '1.2-4' }}</dd><dd class="au-stat__note">Lo que se esperaba antes de enviar</dd></div>
        <div class="au-stat"><dt class="au-stat__label">Reservado</dt><dd class="au-stat__value">{{ d.totals.heldUsd | number: '1.2-4' }}</dd><dd class="au-stat__note">{{ d.totals.uncertain }} sin confirmar, {{ d.totals.uncertainUsd | number: '1.2-4' }}</dd></div>
        <div class="au-stat" [class.advanced-stat--warning]="d.totals.failedUsd > 0"><dt class="au-stat__label">Errores cobrados</dt><dd class="au-stat__value">{{ d.totals.failedUsd | number: '1.2-4' }}</dd><dd class="au-stat__note">{{ d.totals.failures }} fallos, cobrados o no</dd></div>
      </dl>

      <div class="advanced-grid-2">
        <section class="au-panel au-panel--padded" aria-labelledby="ca-units">
          <div class="advanced-card-header"><h2 class="au-panel__title" id="ca-units">Coste por resultado</h2><p>«—» significa que no hay nada entre lo que repartir.</p></div>
          <table class="au-table au-table--keep-columns" style="min-width: 0"><thead><tr><th scope="col">Resultado</th><th scope="col" class="au-num">Cuántos</th><th scope="col" class="au-num">Coste de cada uno</th></tr></thead><tbody>
            <tr><td>Palabra investigada</td><td class="au-num">{{ d.units.keywords | number }}</td><td class="au-num">{{ money(d.units.perKeywordUsd) }}</td></tr>
            <tr><td>Oportunidad de calidad</td><td class="au-num">{{ d.units.opportunities | number }}</td><td class="au-num">{{ money(d.units.perOpportunityUsd) }}</td></tr>
            <tr><td>Artículo publicado<span class="note">@if (d.units.articles === null) { <br />No se puede repartir con este filtro }</span></td><td class="au-num">{{ d.units.articles === null ? '—' : (d.units.articles | number) }}</td><td class="au-num">{{ money(d.units.perArticleUsd) }}</td></tr>
            <tr><td>Alta de un sitio</td><td class="au-num">{{ d.totals.onboardingUsd | number: '1.2-4' }} en total</td><td class="au-num">{{ money(d.units.perOnboardingSiteUsd) }}</td></tr>
            <tr><td>Sitio, recurrente</td><td class="au-num">{{ d.totals.recurringUsd | number: '1.2-4' }} en total</td><td class="au-num">{{ money(d.units.perRecurringSiteUsd) }}</td></tr>
          </tbody></table>
        </section>
        <section class="au-panel au-panel--padded" aria-labelledby="ca-reuse">
          <div class="advanced-card-header"><h2 class="au-panel__title" id="ca-reuse">Reutilización</h2><p>{{ d.cache.countedSince ? 'Se cuenta desde el ' + (d.cache.countedSince | date: 'd/MM/y') + '.' : 'Todavía no se ha contado ninguna consulta.' }}</p></div>
          <table class="au-table au-table--keep-columns" style="min-width: 0"><tbody>
            <tr><th scope="row">Respuestas servidas de lo guardado</th><td class="au-num">{{ d.cache.reused | number }}</td></tr>
            <tr><th scope="row">Consultas duplicadas evitadas</th><td class="au-num">{{ d.cache.duplicatesPrevented | number }}</td></tr>
            <tr><th scope="row">Compradas</th><td class="au-num">{{ d.cache.bought | number }}</td></tr>
            <tr><th scope="row">Aciertos de la caché</th><td class="au-num">{{ d.cache.hitRate === null ? '—' : (d.cache.hitRate * 100 | number: '1.0-1') + ' %' }}</td></tr>
            <tr><th scope="row">Gasto evitado (estimación)</th><td class="au-num">{{ d.cache.avoidedUsdEstimate === null ? '—' : (d.cache.avoidedUsdEstimate | number: '1.2-4') }}</td></tr>
          </tbody></table>
          <p class="note">La estimación multiplica lo reutilizado por el coste medio liquidado de la misma operación y proveedor en el periodo{{ d.cache.unpricedAnswers ? '; ' + d.cache.unpricedAnswers + ' respuestas no tienen con qué compararse' : '' }}. Nadie ha cobrado ni devuelto ese importe.</p>
          @if (refusals().length) { <p class="note">Rechazadas antes de enviar: @for (entry of refusals(); track entry[0]; let last = $last) { {{ blocks[entry[0]] ?? entry[0] }} ({{ entry[1] }}){{ last ? '' : ' · ' }} }</p> }
        </section>
      </div>

      <section class="au-panel au-panel--padded" aria-labelledby="ca-by">
        <div class="advanced-card-header"><h2 class="au-panel__title" id="ca-by">Desglose</h2></div>
        <div class="au-tabs" role="group" aria-label="Agrupar por">@for (option of groups; track option.id) { <button class="au-tab" type="button" [class.is-active]="group() === option.id" [attr.aria-pressed]="group() === option.id" (click)="group.set(option.id)">{{ option.label }}</button> }</div>
        <div class="au-table-wrap au-table-wrap--scrollable" role="region" aria-label="Desglose de costes" tabindex="0"><table class="au-table au-table--keep-columns">
          <thead><tr><th scope="col">{{ groupLabel() }}</th><th scope="col" class="au-num">Peticiones</th><th scope="col" class="au-num">Liquidado</th><th scope="col" class="au-num">Estimado</th><th scope="col" class="au-num">Reservado</th><th scope="col" class="au-num">Uso</th><th scope="col" class="au-num">Fallos</th></tr></thead>
          <tbody>@for (row of rows(); track row.key) { <tr><td>{{ name(row) }}</td><td class="au-num">{{ row.requests | number }}</td><td class="au-num">{{ row.settledUsd | number: '1.2-4' }}</td><td class="au-num">{{ row.estimatedUsd | number: '1.2-4' }}</td><td class="au-num">{{ row.heldUsd | number: '1.2-4' }}</td><td class="au-num">{{ d.totals.settledUsd ? (100 * row.settledUsd / d.totals.settledUsd | number: '1.0-1') + ' %' : '—' }}</td><td class="au-num">{{ row.failures }}</td></tr> }
            @empty { <tr><td colspan="7">No hay consumo en este periodo.</td></tr> }</tbody>
        </table></div>
      </section>
    } @else if (!failed()) { <div class="au-skeleton-list" aria-label="Cargando costes">@for (row of [1, 2, 3]; track row) { <div class="au-skeleton" style="height: 72px"></div> }</div> }
  `,
})
export class SeoCostAnalyticsComponent implements OnInit {
  private readonly api = inject(AdminSeoOpsApiService);
  private readonly admin = inject(AdminApiService);
  private readonly toast = inject(ToastService);

  readonly groups = GROUPS;
  readonly blocks = SEO_BLOCKS;
  readonly operations = Object.entries(SEO_CAPABILITY_LABELS);
  readonly data = signal<CostAnalytics | null>(null);
  readonly targets = signal<AdminSeoGovernor['targets'] | null>(null);
  readonly providers = signal<string[]>([]);
  readonly group = signal<(typeof GROUPS)[number]['id']>('tenant');
  readonly busy = signal('');
  readonly failed = signal('');
  readonly rows = computed(() => this.data()?.by[this.group()] ?? []);
  readonly groupLabel = computed(() => GROUPS.find((entry) => entry.id === this.group())!.label);
  readonly plans = computed(() => [...new Set((this.targets()?.tenants ?? []).map((tenant) => tenant.plan ?? 'none'))].sort());
  readonly refusals = computed(() => Object.entries(this.data()?.cache.refused ?? {}).sort((a, b) => b[1] - a[1]));
  filters = { from: '', to: '', tenantId: '', siteId: '', providerId: '', operation: '', plan: '', runId: '' };

  ngOnInit(): void {
    firstValueFrom(this.admin.seoGovernor()).then((governor) => {
      this.targets.set(governor.targets);
      this.providers.set([...new Set(governor.pricing.entries.map((entry) => entry.providerId))]);
    }).catch(() => undefined); // the filters stay empty; the costs say their own error
    void this.load();
  }

  sites(): Array<{ id: string; name: string }> {
    return (this.targets()?.sites ?? []).filter((site) => !this.filters.tenantId || site.tenantId === this.filters.tenantId);
  }
  money(value: number | null): string {
    return value === null ? '—' : value.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  }
  name(row: CostRow): string {
    const group = this.group();
    if (group === 'operation') return SEO_CAPABILITY_LABELS[row.key] ?? row.key;
    if (group === 'plan') return row.key === 'none' ? 'Sin plan' : row.key;
    if (group === 'day') return new Date(row.key).toLocaleDateString('es-ES', { timeZone: 'UTC' });
    if (group === 'run' || group === 'site') return row.label ?? (row.key || (group === 'run' ? 'Fuera de investigaciones' : 'Sin sitio'));
    return row.label ?? (group === 'tenant' ? `Workspace borrado (${row.key.slice(0, 8)})` : row.key);
  }

  async load(): Promise<void> {
    if (this.busy()) return;
    this.busy.set('load');
    try {
      const data = await firstValueFrom(this.api.costs(this.filters));
      this.failed.set('');
      this.data.set(data);
      this.filters.from = data.range.from;
      this.filters.to = data.range.to;
    } catch (error) {
      this.failed.set(seoError(error, 'No se han podido calcular los costes. Revisa las fechas y los filtros.'));
    } finally {
      this.busy.set('');
    }
  }

  async exportCsv(): Promise<void> {
    if (this.busy()) return;
    this.busy.set('export');
    try {
      const url = URL.createObjectURL(await firstValueFrom(this.api.exportCosts(this.filters)));
      const link = document.createElement('a');
      link.href = url;
      link.download = `costes-seo-${this.filters.from}-${this.filters.to}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      this.toast.error(seoError(error, 'No se ha podido exportar.'));
    } finally {
      this.busy.set('');
    }
  }
}
