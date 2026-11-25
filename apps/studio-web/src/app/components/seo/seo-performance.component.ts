import { CommonModule } from '@angular/common';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AppContextService } from '../../services/app-context.service';
import { SeoIntelligenceApiService, SeoPerformance } from '../../services/seo-intelligence-api.service';
import { SEO_LOCALE, SEO_ACTIONS, SEO_OUTCOMES, seoError, urlPath } from '../seo-labels';
import { AppEmptyStateComponent } from '../ui/app-empty-state.component';
import { AppIconComponent } from '../ui/app-icon.component';

const WIDTH = 720;
const HEIGHT = 180;
const ROWS = 10;

/** Site Intelligence → Rendimiento: observed results and what was done, without claiming one caused the other. */
@Component({
  selector: 'app-seo-performance',
  standalone: true,
  providers: SEO_LOCALE,
  imports: [CommonModule, RouterLink, AppIconComponent, AppEmptyStateComponent],
  styles: [`
    :host { display: grid; gap: 14px; }
    :host > * { margin-block: 0 !important; min-width: 0; }
    .head { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: start; gap: 10px; }
    .chart { width: 100%; height: auto; display: block; }
    .chart text { fill: var(--au-muted); font-size: 11px; }
    .chart .grid { stroke: var(--au-border); }
    .chart .line { fill: none; stroke: var(--au-brand); stroke-width: 2; vector-effect: non-scaling-stroke; }
    .note { color: var(--au-muted); font-size: var(--au-fs-metadata); margin: 8px 0 0; }
    .cell { max-width: 300px; overflow-wrap: anywhere; }
  `],
  template: `
    @if (failed(); as reason) { <div class="au-banner au-banner--error" role="alert"><app-icon name="warning"></app-icon><span class="au-banner__text">{{ reason }}</span><button class="au-banner__action" type="button" (click)="load()">Reintentar</button></div> }
    @if (data(); as d) {
      @if (d.organic; as o) {
        <section class="au-panel au-panel--padded" aria-labelledby="pf-title">
          <div class="advanced-card-header head">
            <div><h2 class="au-panel__title" id="pf-title">Tráfico orgánico</h2><p>Del {{ o.from | date: 'd/MM/y' }} al {{ o.through | date: 'd/MM/y' }}, según Search Console.</p></div>
            <div class="au-tabs" role="group" aria-label="Periodo">@for (option of [28, 90]; track option) { <button class="au-tab" type="button" [class.is-active]="days() === option" [attr.aria-pressed]="days() === option" (click)="period(option)">{{ option }} días</button> }</div>
          </div>
          <dl class="advanced-kpis" aria-label="Totales del periodo">
            <div class="au-stat"><dt class="au-stat__label">Clics</dt><dd class="au-stat__value">{{ o.current.clicks | number }}</dd><dd class="au-stat__note">{{ versus(o.current.clicks, o.previous?.clicks) }}</dd></div>
            <div class="au-stat"><dt class="au-stat__label">Impresiones</dt><dd class="au-stat__value">{{ o.current.impressions | number }}</dd><dd class="au-stat__note">{{ versus(o.current.impressions, o.previous?.impressions) }}</dd></div>
            <div class="au-stat"><dt class="au-stat__label">Posición media</dt><dd class="au-stat__value">{{ o.current.position === null ? '—' : (o.current.position | number: '1.1-1') }}</dd><dd class="au-stat__note">{{ o.previous?.position ? 'Antes ' + (o.previous!.position | number: '1.1-1') : 'Sin periodo anterior completo' }}</dd></div>
            <div class="au-stat"><dt class="au-stat__label">Conversiones</dt><dd class="au-stat__value">—</dd><dd class="au-stat__note">No hay ninguna fuente de conversiones conectada</dd></div>
          </dl>
          @if (d.series.length > 1) {
            <svg class="chart" [attr.viewBox]="'0 0 ' + width + ' ' + (height + 24)" role="img" [attr.aria-label]="'Clics diarios: de ' + d.series[0].clicks + ' a ' + d.series[d.series.length - 1].clicks + ', máximo ' + peak()">
              <line class="grid" x1="0" [attr.x2]="width" y1="0.5" y2="0.5" /><line class="grid" x1="0" [attr.x2]="width" [attr.y1]="height / 2" [attr.y2]="height / 2" /><line class="grid" x1="0" [attr.x2]="width" [attr.y1]="height" [attr.y2]="height" />
              <polyline class="line" [attr.points]="points()" />
              <text x="0" y="12">{{ peak() | number }} clics</text>
              <text x="0" [attr.y]="height + 18">{{ d.series[0].date | date: 'd/MM' }}</text><text [attr.x]="width" [attr.y]="height + 18" text-anchor="end">{{ d.series[d.series.length - 1].date | date: 'd/MM' }}</text>
            </svg>
            <details><summary>Ver los clics por día en tabla</summary>
              <div class="au-table-wrap au-table-wrap--scrollable" role="region" aria-label="Clics por día" tabindex="0"><table class="au-table au-table--compact"><thead><tr><th scope="col">Día</th><th scope="col" class="au-num">Clics</th><th scope="col" class="au-num">Impresiones</th></tr></thead><tbody>@for (row of d.series; track row.date) { <tr><td>{{ row.date | date: 'd/MM/y' }}</td><td class="au-num">{{ row.clicks | number }}</td><td class="au-num">{{ row.impressions | number }}</td></tr> }</tbody></table></div>
            </details>
          }
          @if (o.current.days < o.days) { <p class="note">Solo hay {{ o.current.days }} de {{ o.days }} días guardados: los totales son parciales.</p> }
        </section>

        <div class="advanced-grid-2">
          <section class="au-panel au-panel--padded" aria-labelledby="pf-pages">
            <div class="advanced-card-header"><h2 class="au-panel__title" id="pf-pages">Páginas</h2><p>Las que más clics reciben.</p></div>
            <div class="au-table-wrap au-table-wrap--scrollable" role="region" aria-label="Páginas con más clics" tabindex="0"><table class="au-table au-table--keep-columns"><thead><tr><th scope="col">Página</th><th scope="col" class="au-num">Clics</th><th scope="col" class="au-num">Antes</th><th scope="col" class="au-num">Posición</th></tr></thead>
              <tbody>@for (row of pages(); track row.page) { <tr><td class="cell"><a [href]="row.page" [title]="row.page" target="_blank" rel="noopener noreferrer">{{ path(row.page) }}</a></td><td class="au-num">{{ row.clicks | number }}</td><td class="au-num">{{ row.previousClicks === null ? '—' : (row.previousClicks | number) }}</td><td class="au-num">{{ row.position === null ? '—' : (row.position | number: '1.1-1') }}</td></tr> } @empty { <tr><td colspan="4">Ninguna página con datos en el periodo.</td></tr> }</tbody></table></div>
            @if (d.pages.length > rows) { <button class="au-btn au-btn--ghost au-btn--sm" type="button" (click)="allPages.set(!allPages())">{{ allPages() ? 'Ver menos' : 'Ver las ' + d.pages.length }}</button> }
          </section>
          <section class="au-panel au-panel--padded" aria-labelledby="pf-queries">
            <div class="advanced-card-header"><h2 class="au-panel__title" id="pf-queries">Consultas</h2><p>Google oculta las menos frecuentes: no suman el total.</p></div>
            <div class="au-table-wrap au-table-wrap--scrollable" role="region" aria-label="Consultas con más clics" tabindex="0"><table class="au-table au-table--keep-columns"><thead><tr><th scope="col">Consulta</th><th scope="col" class="au-num">Clics</th><th scope="col" class="au-num">Impresiones</th><th scope="col" class="au-num">Posición</th></tr></thead>
              <tbody>@for (row of queries(); track row.query) { <tr><td class="cell">{{ row.query }}</td><td class="au-num">{{ row.clicks | number }}</td><td class="au-num">{{ row.impressions | number }}</td><td class="au-num">{{ row.position === null ? '—' : (row.position | number: '1.1-1') }}</td></tr> } @empty { <tr><td colspan="4">Google no ha dado ninguna consulta en el periodo.</td></tr> }</tbody></table></div>
            @if (d.queries.length > rows) { <button class="au-btn au-btn--ghost au-btn--sm" type="button" (click)="allQueries.set(!allQueries())">{{ allQueries() ? 'Ver menos' : 'Ver las ' + d.queries.length }}</button> }
          </section>
        </div>
      } @else {
        <section class="au-panel au-panel--padded"><app-empty-state icon="activity" title="Sin datos de rendimiento" text="Los resultados observados vienen de Search Console. Hasta conectarlo no se puede saber cómo va cada página."><a class="au-btn au-btn--primary au-btn--sm" routerLink="/studio/settings/seo" [queryParams]="{ tab: 'data' }">Conectar Search Console</a></app-empty-state></section>
      }

      <section class="au-panel au-panel--padded" aria-labelledby="pf-new">
        <div class="advanced-card-header"><h2 class="au-panel__title" id="pf-new">Contenido nuevo</h2><p>Artículos publicados con Auctorio en los últimos 180 días y lo observado desde entonces.</p></div>
        @if (d.newContent.length) {
          <div class="au-table-wrap au-table-wrap--scrollable" role="region" aria-label="Contenido nuevo" tabindex="0"><table class="au-table au-table--keep-columns"><thead><tr><th scope="col">Artículo</th><th scope="col">Publicado</th><th scope="col" class="au-num">Clics</th><th scope="col" class="au-num">Impresiones</th></tr></thead>
            <tbody>@for (row of d.newContent; track row.id) { <tr><td class="cell">@if (row.project; as project) { <a [routerLink]="['/studio/content', project.id]">{{ project.title }}</a> } @else { {{ path(row.externalUrl) }} }</td><td>{{ row.publishedAt | date: 'd/MM/y' }}</td><td class="au-num">{{ row.clicks === null ? 'Sin datos aún' : (row.clicks | number) }}</td><td class="au-num">{{ row.impressions === null ? 'Sin datos aún' : (row.impressions | number) }}</td></tr> }</tbody></table></div>
        } @else { <app-empty-state icon="content" title="Nada publicado todavía" text="Los artículos publicados con Auctorio aparecen aquí con sus resultados."></app-empty-state> }
      </section>

      <section class="au-panel au-panel--padded" aria-labelledby="pf-done">
        <div class="advanced-card-header"><h2 class="au-panel__title" id="pf-done">Oportunidades ejecutadas</h2><p>{{ d.outcomes.note }}</p></div>
        @if (d.history.length) {
          <div class="au-table-wrap au-table-wrap--scrollable" role="region" aria-label="Oportunidades ejecutadas" tabindex="0"><table class="au-table au-table--keep-columns"><thead><tr><th scope="col">Oportunidad</th><th scope="col">Acción</th><th scope="col">Fecha</th><th scope="col">Clics antes y después</th><th scope="col">Resultado observado</th></tr></thead>
            <tbody>@for (row of d.history; track row.id) {
              <tr><td class="cell">{{ row.opportunity?.topic ?? row.query ?? (row.url ? path(row.url) : '—') }}</td><td>{{ actions[row.action] ?? row.action }}</td><td>{{ row.actedAt | date: 'd/MM/y' }}</td>
                <td>@if (row.evaluation; as e) { {{ e.pre.clicks | number }} → {{ e.post.clicks | number }} ({{ e.window }} días) } @else { Aún no hay 28 días completos }</td><td class="cell">{{ row.evaluation ? outcomes[row.evaluation.outcome] : '—' }}@if (row.evaluation?.uncertainty?.length) { <span class="note">{{ row.evaluation!.uncertainty[0] }}</span> }</td></tr> }</tbody></table></div>
        } @else { <app-empty-state icon="competency" title="Ninguna oportunidad ejecutada" text="Al publicar o marcar como hecha una oportunidad empieza su medición a 28, 56 y 90 días."></app-empty-state> }
      </section>
    } @else if (!failed()) { <div class="au-skeleton-list" aria-label="Cargando rendimiento">@for (row of [1, 2, 3]; track row) { <div class="au-skeleton" style="height: 120px"></div> }</div> }
  `,
})
export class SeoPerformanceComponent {
  private readonly api = inject(SeoIntelligenceApiService);
  private readonly app = inject(AppContextService);

  readonly actions = SEO_ACTIONS;
  readonly outcomes = SEO_OUTCOMES;
  readonly path = urlPath;
  readonly width = WIDTH;
  readonly height = HEIGHT;
  readonly rows = ROWS;
  readonly days = signal<28 | 90>(28);
  readonly data = signal<SeoPerformance | null>(null);
  readonly failed = signal('');
  readonly allPages = signal(false);
  readonly allQueries = signal(false);
  readonly pages = computed(() => (this.data()?.pages ?? []).slice(0, this.allPages() ? undefined : ROWS));
  readonly queries = computed(() => (this.data()?.queries ?? []).slice(0, this.allQueries() ? undefined : ROWS));
  readonly peak = computed(() => Math.max(1, ...(this.data()?.series ?? []).map((row) => row.clicks)));
  readonly points = computed(() => {
    const series = this.data()?.series ?? [];
    return series.map((row, index) => `${(index / Math.max(1, series.length - 1)) * WIDTH},${HEIGHT - (row.clicks / this.peak()) * HEIGHT}`).join(' ');
  });

  constructor() {
    effect(() => {
      if (this.app.activeSite()?.id) void this.load();
    });
  }

  period(days: number): void {
    this.days.set(days === 90 ? 90 : 28);
  }

  versus(now: number, before: number | undefined): string {
    if (before === undefined) return 'Sin periodo anterior completo';
    const change = now - before;
    return `${change >= 0 ? '+' : ''}${change.toLocaleString('es-ES')} frente a los ${this.days()} días anteriores`;
  }

  async load(): Promise<void> {
    const siteId = this.app.activeSite()?.id;
    const days = this.days();
    if (!siteId) return;
    try {
      const data = await firstValueFrom(this.api.performance(siteId, days));
      if (siteId !== this.app.activeSite()?.id || days !== this.days()) return;
      this.failed.set('');
      this.data.set(data);
    } catch (error) {
      this.failed.set(seoError(error, 'No se ha podido cargar el rendimiento.'));
    }
  }
}
