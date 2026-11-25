import { CommonModule } from '@angular/common';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AppContextService } from '../../services/app-context.service';
import { KeywordHistory, KeywordPage, SeoIntelligenceApiService, SiteKeywordRow } from '../../services/seo-intelligence-api.service';
import { ToastService } from '../../services/toast.service';
import { SEO_LOCALE, SEO_DATA_KINDS, SEO_INTENTS, seoError, urlPath } from '../seo-labels';
import { AppEmptyStateComponent } from '../ui/app-empty-state.component';
import { AppDrawerDirective } from '../ui/app-drawer.directive';
import { AppIconComponent } from '../ui/app-icon.component';
import { AppPagerComponent } from '../ui/app-pager.component';

const VIEWS = [{ id: '', label: 'Relevantes', count: 'relevant' }, { id: 'opportunity', label: 'Con oportunidad', count: 'opportunity' }, { id: 'rejected', label: 'Descartadas', count: 'rejected' }, { id: 'all', label: 'Descubiertas', count: 'discovered' }] as const;
const ORIGINS: Record<string, string> = { seed: 'Semilla del sitio', cluster: 'Tema del sitio', site_topic: 'Tema del sitio', competitor: 'Competidor', own: 'El propio sitio', opportunity: 'Oportunidad', suggestion: 'Sugerencia' };

/** Site Intelligence → Palabras clave. A figure nobody reported is shown as unavailable, never as zero. */
@Component({
  selector: 'app-seo-keywords',
  standalone: true,
  providers: SEO_LOCALE,
  imports: [CommonModule, FormsModule, AppDrawerDirective, RouterLink, AppIconComponent, AppEmptyStateComponent, AppPagerComponent],
  styles: [`
    .kw-table { min-width: 980px; }
    .kw-note { display: block; color: var(--au-muted); font-size: var(--au-fs-metadata); overflow-wrap: anywhere; }
    .kw-cell { max-width: 240px; }
    .kw-none { color: var(--au-muted); }
    .kw-facts { display: grid; grid-template-columns: auto 1fr; gap: 6px 14px; margin: 0 0 16px; }
    .kw-facts dt { color: var(--au-muted); }
    .kw-facts dd { margin: 0; overflow-wrap: anywhere; }
    h3 { font-size: var(--au-fs-body-sm); margin: 16px 0 6px; }
    ul { margin: 0; padding-left: 18px; }
  `],
  template: `
    <section class="au-panel au-panel--padded advanced-jobs" aria-labelledby="kw-title">
      <div class="advanced-card-header"><h2 class="au-panel__title" id="kw-title">Palabras clave del sitio</h2>
        <p>Volumen, dificultad y CPC los informa un proveedor externo; impresiones y clics son los de tu sitio en 28 días{{ page()?.searchConsoleThrough ? ', hasta el ' + (page()!.searchConsoleThrough | date: 'd/MM/y') : ' (sin Search Console)' }}.</p></div>
      <div class="au-tabs" role="group" aria-label="Qué palabras ver">
        @for (view of views; track view.id) { <button class="au-tab" type="button" [class.is-active]="filters.view === view.id" [attr.aria-pressed]="filters.view === view.id" (click)="filters.view = view.id; load(1)">{{ view.label }} <span class="au-tab__count">{{ page()?.counts?.[view.count] ?? '…' }}</span></button> }
      </div>
      <form class="au-toolbar advanced-filter-bar" role="search" (ngSubmit)="load(1)">
        <label class="au-search au-flex-1"><app-icon name="search"></app-icon><input class="au-search__input" type="search" name="search" placeholder="Buscar palabra…" aria-label="Buscar palabra clave" [(ngModel)]="filters.search" (ngModelChange)="searching()" /></label>
        <select class="au-select" name="cluster" aria-label="Tema" [(ngModel)]="filters.cluster" (ngModelChange)="load(1)"><option value="">Todos los temas</option><option value="none">Sin tema</option>@for (cluster of page()?.clusters ?? []; track cluster.name) { <option [value]="cluster.name">{{ cluster.name }} ({{ cluster.keywords }})</option> }</select>
        <select class="au-select" name="intent" aria-label="Intención" [(ngModel)]="filters.intent" (ngModelChange)="load(1)"><option value="">Toda intención</option><option value="unknown">Sin intención conocida</option>@for (intent of page()?.intents ?? []; track intent) { <option [value]="intent">{{ intents[intent] ?? intent }}</option> }</select>
        <select class="au-select" name="sort" aria-label="Ordenar" [(ngModel)]="filters.sort" (ngModelChange)="load(1)"><option value="score">Mejor valoradas</option><option value="volume">Más volumen</option><option value="impressions">Más impresiones</option><option value="difficulty">Menos dificultad</option><option value="keyword">Alfabético</option></select>
      </form>

      @if (failed(); as reason) { <div class="au-banner au-banner--error" role="alert"><app-icon name="warning"></app-icon><span class="au-banner__text">{{ reason }}</span><button class="au-banner__action" type="button" (click)="load(current())">Reintentar</button></div> }
      @if (!page() && !failed()) { <div class="au-skeleton-list" aria-label="Cargando palabras clave">@for (row of [1, 2, 3, 4]; track row) { <div class="au-skeleton" style="height: 48px"></div> }</div> }
      @if (page(); as p) {
        @if (!p.items.length) {
          <app-empty-state icon="search" [title]="p.counts.discovered ? 'Ninguna palabra coincide' : 'Aún no hay palabras clave'" [text]="p.counts.discovered ? 'Cambia la vista, los filtros o la búsqueda.' : 'Se descubren al investigar el sitio y sus competidores.'">
            @if (!p.counts.discovered) { <a class="au-btn au-btn--secondary au-btn--sm" routerLink="/studio/seo-research">Ir a investigación</a> }
          </app-empty-state>
        } @else {
          <div class="au-panel au-table-wrap au-table-wrap--scrollable" role="region" aria-label="Palabras clave" tabindex="0" [attr.aria-busy]="loading()">
            <table class="au-table au-table--hover au-table--keep-columns kw-table">
              <thead><tr><th scope="col">Palabra</th><th scope="col">Tema</th><th scope="col">Intención</th><th scope="col" class="au-num">Volumen</th><th scope="col" class="au-num">Dificultad SEO</th><th scope="col" class="au-num">CPC</th><th scope="col" class="au-num">Impresiones</th><th scope="col" class="au-num">Clics</th><th scope="col">Página</th><th scope="col">Datos</th></tr></thead>
              <tbody>
                @for (row of p.items; track row.id) {
                  <tr [class.is-selected]="open()?.id === row.id">
                    <td class="kw-cell"><button class="au-cell-title__name au-link-button" type="button" (click)="show(row)">{{ row.keyword }}</button><span class="kw-note">{{ row.market }}{{ row.score === null ? '' : ' · valoración ' + row.score }}</span></td>
                    <td>{{ row.cluster ?? '—' }}</td>
                    <td>{{ row.intent ? (intents[row.intent] ?? row.intent) : '—' }}</td>
                    @for (value of [row.volume, row.difficulty]; track $index) { <td class="au-num">@if (value === null) { <span class="kw-none" title="Nadie lo ha informado">No disponible</span> } @else { {{ value | number: '1.0-0' }} }</td> }
                    <td class="au-num">@if (row.cpc === null) { <span class="kw-none" title="Nadie lo ha informado">No disponible</span> } @else { {{ row.cpc | number: '1.2-2' }} }</td>
                    @for (value of [row.impressions, row.clicks]; track $index) { <td class="au-num">@if (value === null) { <span class="kw-none" [title]="p.searchConsoleThrough ? 'Google no la muestra entre tus consultas' : 'Sin Search Console'">—</span> } @else { {{ value | number }} }</td> }
                    <td class="kw-cell">@if (row.page; as url) { <a class="au-cell-title__meta" [href]="url" [title]="url" target="_blank" rel="noopener noreferrer">{{ path(url) }}</a> } @else { <span class="kw-none">Ninguna</span> }</td>
                    <td><span class="au-badge" [ngClass]="row.freshness === 'fresh' ? 'au-badge--success' : row.freshness === 'stale' ? 'au-badge--warning' : 'au-badge--neutral'">{{ freshness[row.freshness] }}</span>@if (row.ageDays !== null) { <span class="kw-note">{{ row.ageDays }} días · {{ row.quality }} % completa</span> }</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          <app-pager [page]="p.page" [pages]="p.pages" label="palabras clave" (go)="load($event)"></app-pager>
        }
      }
    </section>

    @if (open(); as row) {
      <div class="au-drawer-backdrop" (click)="close()"></div>
      <aside class="au-drawer" appDrawer (closed)="close()" aria-labelledby="kw-detail">
        <header class="au-drawer__head"><h2 class="au-drawer__title" id="kw-detail">{{ row.keyword }}</h2><button class="au-btn au-btn--ghost au-btn--sm" type="button" (click)="close()" aria-label="Cerrar detalle"><app-icon name="close"></app-icon></button></header>
        <dl class="kw-facts">
          <dt>Mercado</dt><dd>{{ row.market }}</dd>
          <dt>Estado</dt><dd>{{ statusLabel(row) }}{{ row.reason ? ': ' + row.reason : '' }}</dd>
          <dt>Posición propia</dt><dd>{{ row.position === null ? 'Sin datos propios' : (row.position | number: '1.1-1') }}</dd>
          @if (row.page; as url) { <dt>Página</dt><dd><a [href]="url" target="_blank" rel="noopener noreferrer">{{ path(url) }}</a></dd> }
          @if (row.opportunity; as opportunity) { <dt>Oportunidad</dt><dd><a routerLink="/studio/seo-opportunities" [queryParams]="{ id: opportunity.id }">Ver la oportunidad</a></dd> }
        </dl>
        <h3>De dónde viene</h3>
        @if (row.discoveries.length) { <ul>@for (entry of row.discoveries; track $index) { <li>{{ origins[entry.kind] ?? entry.kind }}: {{ entry.value }}{{ entry.position ? ', posición ' + entry.position : '' }} <span class="kw-note">{{ entry.discoveredAt | date: 'd/MM/y' }}</span></li> }</ul> } @else { <p class="kw-note">No consta.</p> }
        <h3>Cómo han cambiado sus datos</h3>
        @if (history(); as h) {
          @for (item of h.items; track item.collectedAt) {
            <p>{{ item.confirmedAt | date: 'd/MM/y' }} · volumen {{ item.volume ?? 'no disponible' }} · dificultad {{ item.difficulty ?? 'no disponible' }} · CPC {{ item.cpc ?? 'no disponible' }}<span class="kw-note">{{ provenance(item.fields) }}</span></p>
          } @empty { <p class="kw-note">Nadie la ha medido todavía.</p> }
        } @else { <div class="au-skeleton" style="height: 48px"></div> }
        <p class="kw-note">La dificultad es orgánica y propia de cada proveedor; no es la competencia de los anuncios.</p>
      </aside>
    }
  `,
})
export class SeoKeywordsComponent {
  private readonly api = inject(SeoIntelligenceApiService);
  private readonly app = inject(AppContextService);
  private readonly toast = inject(ToastService);

  readonly views = VIEWS;
  readonly intents = SEO_INTENTS;
  readonly origins = ORIGINS;
  readonly path = urlPath;
  readonly freshness: Record<string, string> = { fresh: 'Reciente', stale: 'Antiguo', unmeasured: 'Sin medir' };
  readonly page = signal<KeywordPage | null>(null);
  readonly loading = signal(false);
  readonly failed = signal('');
  readonly open = signal<SiteKeywordRow | null>(null);
  readonly history = signal<KeywordHistory | null>(null);
  readonly current = computed(() => this.page()?.page ?? 1);
  filters = { search: '', view: '', cluster: '', intent: '', sort: 'score' };
  private timer: ReturnType<typeof setTimeout> | undefined;
  private request = 0;

  constructor() {
    effect(() => {
      if (this.app.activeSite()?.id) void this.load(1);
    });
  }

  /** The list follows the typing without asking on every key. */
  searching(): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.load(1), 300);
  }

  async load(page: number): Promise<void> {
    const siteId = this.app.activeSite()?.id;
    if (!siteId) return;
    clearTimeout(this.timer);
    const request = ++this.request;
    this.loading.set(true);
    try {
      const result = await firstValueFrom(this.api.keywords(siteId, { ...this.filters, page }));
      if (request !== this.request) return;
      this.failed.set('');
      this.page.set(result);
    } catch (error) {
      if (request === this.request) this.failed.set(seoError(error, 'No se han podido cargar las palabras clave.'));
    } finally {
      if (request === this.request) this.loading.set(false);
    }
  }

  statusLabel(row: SiteKeywordRow): string {
    return row.status === 'opportunity' ? 'Con oportunidad' : row.status === 'rejected' ? 'Descartada' : 'Candidata';
  }
  provenance(fields: KeywordHistory['items'][number]['fields']): string {
    const names: Record<string, string> = { volume: 'volumen', difficulty: 'dificultad', cpc: 'CPC', intent: 'intención' };
    return Object.entries(fields).map(([name, field]) => `${names[name] ?? name}: ${(SEO_DATA_KINDS[field.kind] ?? field.kind).toLowerCase()}`).join(' · ');
  }
  show(row: SiteKeywordRow): void {
    this.open.set(row);
    this.history.set(null);
    firstValueFrom(this.api.keywordHistory(this.app.activeSite()?.id ?? '', row.id)).then((history) => {
      if (this.open()?.id === row.id) this.history.set(history);
    }).catch((error) => this.toast.error(seoError(error)));
  }
  close(): void {
    this.open.set(null);
  }
}
