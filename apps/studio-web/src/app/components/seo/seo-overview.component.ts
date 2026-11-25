import { CommonModule } from '@angular/common';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AppContextService } from '../../services/app-context.service';
import { SeoIntelligenceApiService, SeoWorkspaceOverview } from '../../services/seo-intelligence-api.service';
import { SEO_LOCALE, NEXT_ACTIONS, RUN_STATUSES, SEARCH_CONSOLE_STATUS, SEO_ACTIONS, runBadge, seoError, urlPath } from '../seo-labels';
import { AppEmptyStateComponent } from '../ui/app-empty-state.component';
import { AppIconComponent } from '../ui/app-icon.component';
import { SeoAllowanceComponent } from './seo-allowance.component';

/** Site Intelligence → Resumen: what is known, how the site does and what to do next. Reads stored data only. */
@Component({
  selector: 'app-seo-overview',
  standalone: true,
  providers: SEO_LOCALE,
  imports: [CommonModule, RouterLink, AppIconComponent, AppEmptyStateComponent, SeoAllowanceComponent],
  styles: [`
    :host { display: grid; gap: 14px; }
    :host > * { margin-block: 0 !important; min-width: 0; }
    .facts a { color: var(--au-brand); }
    .next { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; }
    .next p { margin: 4px 0 0; color: var(--au-muted); font-size: var(--au-fs-body-sm); }
    .facts { display: grid; grid-template-columns: auto 1fr; gap: 8px 14px; margin: 0; }
    .facts dt { color: var(--au-muted); }
    .facts dd { margin: 0; overflow-wrap: anywhere; }
    .note { color: var(--au-muted); font-size: var(--au-fs-metadata); margin: 10px 0 0; }
    .row-head { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 8px; align-items: start; }
  `],
  template: `
    @if (failed(); as reason) {
      <div class="au-banner au-banner--error" role="alert"><app-icon name="warning"></app-icon><span class="au-banner__text">{{ reason }}</span><button class="au-banner__action" type="button" (click)="load()">Reintentar</button></div>
    }
    @if (data(); as d) {
      <section class="au-panel au-panel--padded next" aria-labelledby="sv-next">
        <div><h2 class="au-panel__title" id="sv-next">{{ next().title }}</h2><p>{{ next().text }}</p></div>
        <a class="au-btn au-btn--primary au-btn--sm" [routerLink]="next().path" [queryParams]="next().tab ? { tab: next().tab } : {}">{{ next().label }}</a>
      </section>

      <dl class="advanced-kpis" aria-label="Resumen SEO del sitio">
        <div class="au-stat"><dt class="au-stat__label">Clics orgánicos</dt><dd class="au-stat__value">{{ d.organic ? (d.organic.current.clicks | number) : '—' }}</dd><dd class="au-stat__note">{{ organicNote() }}</dd></div>
        <div class="au-stat"><dt class="au-stat__label">Impresiones</dt><dd class="au-stat__value">{{ d.organic ? (d.organic.current.impressions | number) : '—' }}</dd><dd class="au-stat__note">{{ d.organic?.current?.position ? 'Posición media ' + (d.organic!.current.position | number: '1.1-1') : 'Sin datos propios' }}</dd></div>
        <div class="au-stat"><dt class="au-stat__label">Oportunidades abiertas</dt><dd class="au-stat__value">{{ d.opportunities.open }}</dd><dd class="au-stat__note">{{ d.opportunities.approved }} aprobadas · {{ d.opportunities.planned }} en el plan</dd></div>
        <div class="au-stat" [class.advanced-stat--good]="d.coverage.sufficient"><dt class="au-stat__label">Reserva de calidad</dt><dd class="au-stat__value">{{ d.coverage.available }}</dd><dd class="au-stat__note">Objetivo {{ d.coverage.wanted }}{{ d.coverage.days === null ? '' : ' · ' + d.coverage.days + ' días cubiertos' }}</dd></div>
      </dl>

      <app-seo-allowance [allowance]="d.allowance"></app-seo-allowance>

      <div class="advanced-grid-2">
        <section class="au-panel au-panel--padded" aria-labelledby="sv-status">
          <div class="advanced-card-header"><h2 class="au-panel__title" id="sv-status">Qué se sabe del sitio</h2><p>Estado de cada fuente de conocimiento.</p></div>
          <dl class="facts">
            <dt>Páginas</dt><dd>{{ d.research.pages.read | number }} leídas de {{ d.research.pages.total | number }} conocidas · <a routerLink="/studio/site-intelligence" [queryParams]="{ tab: 'crawl' }">Ver</a></dd>
            <dt>Search Console</dt><dd>{{ consoleLabel() }} · <a routerLink="/studio/settings/seo" [queryParams]="{ tab: 'data' }">Ajustar</a></dd>
            <dt>Palabras clave</dt><dd>{{ d.research.keywords | number }} conocidas · <a routerLink="/studio/site-intelligence" [queryParams]="{ tab: 'keywords' }">Ver</a></dd>
            <dt>Última investigación</dt><dd>@if (d.research.lastRun; as run) { <span class="au-badge" [ngClass]="badge(run.status)">{{ statuses[run.status] ?? run.status }}</span> {{ run.finishedAt ?? run.createdAt | date: 'd/MM/y' }} } @else { Ninguna todavía } · <a routerLink="/studio/seo-research">Ver</a></dd>
            <dt>Automática</dt><dd>{{ d.allowance.automatic ? 'Empieza sola cuando hay un motivo' : 'Solo cuando la pide alguien' }}</dd>
          </dl>
        </section>

        <section class="au-panel au-panel--padded" aria-labelledby="sv-topics">
          <div class="advanced-card-header row-head"><div><h2 class="au-panel__title" id="sv-topics">Cobertura por tema</h2><p>Oportunidades de calidad y páginas de cada tema del sitio.</p></div><a class="au-btn au-btn--ghost au-btn--sm" routerLink="/studio/site-intelligence" [queryParams]="{ tab: 'pillars' }">Pilares y brechas</a></div>
          @if (topics().length) {
            <table class="au-table au-table--keep-columns" style="min-width: 0"><thead><tr><th scope="col">Tema</th><th scope="col" class="au-num">Oportunidades</th><th scope="col" class="au-num">Páginas</th></tr></thead>
              <tbody>@for (row of topics(); track row.topic) { <tr><td>{{ row.topic }}</td><td class="au-num">{{ row.available }}</td><td class="au-num">{{ row.pages }}</td></tr> }</tbody></table>
            @if (d.coverage.gaps.length) { <p class="note">{{ d.coverage.gaps.length }} {{ d.coverage.gaps.length === 1 ? 'tema' : 'temas' }} sin ninguna oportunidad de calidad.</p> }
          } @else { <app-empty-state icon="layers" title="Sin temas todavía" text="Aparecen al leer el sitio o al escribirlos en los ajustes SEO."></app-empty-state> }
        </section>
      </div>

      <section class="au-panel au-panel--padded" aria-labelledby="sv-top">
        <div class="advanced-card-header row-head"><div><h2 class="au-panel__title" id="sv-top">Recomendaciones prioritarias</h2><p>Las mejor valoradas que esperan una decisión o están aprobadas.</p></div><a class="au-btn au-btn--ghost au-btn--sm" routerLink="/studio/seo-opportunities">Ver todas</a></div>
        @if (d.recommendations.length) {
          <ul class="advanced-row-list">
            @for (item of d.recommendations; track item.id) {
              <li><div><a routerLink="/studio/seo-opportunities" [queryParams]="{ id: item.id }"><strong>{{ item.topic === item.targetUrl ? path(item.topic) : item.topic }}</strong></a><p>{{ item.rationale }}</p></div>
                <span class="au-badge au-badge--neutral">{{ actions[item.action] ?? item.action }}</span><span class="au-badge au-badge--outline">{{ item.score === null ? 'Sin puntuar' : 'Puntuación ' + item.score }}</span></li>
            }
          </ul>
        } @else { <app-empty-state icon="competency" title="Ninguna recomendación abierta" text="Aparecen al analizar el sitio, conectar Search Console o investigar."></app-empty-state> }
      </section>
    } @else if (!failed()) { <div class="au-skeleton-list" aria-label="Cargando resumen">@for (row of [1, 2, 3]; track row) { <div class="au-skeleton" style="height: 72px"></div> }</div> }
  `,
})
export class SeoOverviewComponent {
  private readonly api = inject(SeoIntelligenceApiService);
  private readonly app = inject(AppContextService);

  readonly actions = SEO_ACTIONS;
  readonly statuses = RUN_STATUSES;
  readonly badge = runBadge;
  readonly path = urlPath;
  readonly data = signal<SeoWorkspaceOverview | null>(null);
  readonly failed = signal('');
  readonly next = computed(() => NEXT_ACTIONS[this.data()?.nextAction ?? ''] ?? NEXT_ACTIONS['up_to_date']);
  readonly topics = computed(() => [...(this.data()?.coverage.topics ?? [])].sort((a, b) => a.available - b.available || b.pages - a.pages).slice(0, 8));
  readonly consoleLabel = computed(() => {
    const connection = this.data()?.connection;
    if (!connection) return '';
    if (!connection.configured && connection.status !== 'active') return 'No disponible en esta plataforma';
    const label = SEARCH_CONSOLE_STATUS[connection.status] ?? connection.status;
    return connection.syncedThrough ? `${label}, datos hasta el ${new Date(connection.syncedThrough).toLocaleDateString('es-ES', { timeZone: 'UTC' })}` : label;
  });
  readonly organicNote = computed(() => {
    const organic = this.data()?.organic;
    if (!organic) return 'Conecta Search Console para verlos';
    if (organic.current.days < organic.days) return `${organic.current.days} de ${organic.days} días con datos`;
    if (!organic.previous) return `Últimos ${organic.days} días; sin periodo anterior completo`;
    const change = organic.current.clicks - organic.previous.clicks;
    return `${change >= 0 ? '+' : ''}${change.toLocaleString('es-ES')} frente a los ${organic.days} días anteriores`;
  });

  constructor() {
    effect(() => {
      if (this.app.activeSite()?.id) void this.load();
    });
  }

  async load(): Promise<void> {
    const siteId = this.app.activeSite()?.id;
    if (!siteId) return;
    try {
      const data = await firstValueFrom(this.api.workspace(siteId));
      if (siteId !== this.app.activeSite()?.id) return;
      this.failed.set('');
      this.data.set(data);
    } catch (error) {
      this.failed.set(seoError(error, 'No se ha podido cargar el resumen SEO.'));
    }
  }
}
