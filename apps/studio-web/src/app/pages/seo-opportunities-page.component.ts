import { CommonModule } from '@angular/common';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { SEO_LOCALE, SEO_ACTIONS, SEO_DATA_KINDS, SEO_FACTORS, SEO_INTENTS, SEO_OUTCOMES, SEO_STAGES, SEO_STATUSES, seoError, urlPath } from '../components/seo-labels';
import { AppEmptyStateComponent } from '../components/ui/app-empty-state.component';
import { AppDrawerDirective } from '../components/ui/app-drawer.directive';
import { AppIconComponent } from '../components/ui/app-icon.component';
import { AppPagerComponent } from '../components/ui/app-pager.component';
import { AppContextService } from '../services/app-context.service';
import { SearchConsoleStatus, SeoDecision, SeoEvaluation, SeoIntelligenceApiService, SeoOpportunity } from '../services/seo-intelligence-api.service';
import { ToastService } from '../services/toast.service';

const PAGE_SIZE = 25;

@Component({
  selector: 'app-seo-opportunities-page',
  standalone: true,
  providers: SEO_LOCALE,
  imports: [CommonModule, FormsModule, AppDrawerDirective, RouterLink, AppIconComponent, AppEmptyStateComponent, AppPagerComponent],
  styles: [`
    .so-table { min-width: 860px; }
    .so-title { max-width: 260px; }
    .so-title .au-cell-title__name { max-width: 100%; text-align: left; }
    .so-guard { margin: 3px 0 0; color: var(--au-muted); font-size: var(--au-fs-metadata); overflow-wrap: anywhere; }
    .so-score { display: grid; grid-template-columns: 2ch minmax(40px, 1fr); align-items: center; gap: 8px; min-width: 96px; }
    .so-facts { display: grid; grid-template-columns: auto 1fr; gap: 6px 14px; margin: 0 0 16px; }
    .so-facts dt { color: var(--au-muted); }
    .so-facts dd { margin: 0; overflow-wrap: anywhere; }
    .so-detail { display: grid; gap: 14px; }
    .so-detail h3 { margin: 0 0 4px; font-size: var(--au-fs-body-sm); }
    .so-detail p, .so-detail ul { margin: 0; overflow-wrap: anywhere; }
    .so-detail ul { padding-left: 18px; }
    .so-detail small { color: var(--au-muted); }
    .so-detail li small { margin-left: 4px; }
    .so-table th.au-table__actions { text-align: right; }
    .so-actions { display: flex; flex-wrap: wrap; align-items: end; gap: 8px; margin-top: 16px; }
  `],
  template: `
    <section class="au-page advanced-page advanced-jobs">
      <header class="au-page__header">
        <div>
          <p class="au-page__eyebrow">Auctorio / Inteligencia SEO</p>
          <h1 class="au-page__title">Oportunidades SEO</h1>
          <p class="au-page__subtitle">Qué hacer en tu sitio, con qué datos se decide y con cuánta confianza.</p>
        </div>
        <div class="au-page__actions">
          <a class="au-btn au-btn--ghost au-btn--sm" routerLink="/studio/settings/seo" [queryParams]="{ tab: 'optimization' }">Qué se valora</a>
          @if (canManage()) { <button class="au-btn au-btn--primary au-btn--sm" type="button" [disabled]="!!busy()" (click)="analyze()"><app-icon name="refresh"></app-icon>{{ busy() === 'analyze' ? 'Analizando…' : 'Analizar ahora' }}</button> }
        </div>
      </header>

      @if (failed(); as reason) {
        <div class="au-banner au-banner--error" role="alert"><app-icon name="warning"></app-icon><span class="au-banner__text">{{ reason }}</span><button class="au-banner__action" type="button" (click)="load()">Reintentar</button></div>
      } @else if (loaded()) {
        <dl class="advanced-kpis" aria-label="Resumen de oportunidades">
          <div class="au-stat"><dt class="au-stat__label">Abiertas</dt><dd class="au-stat__value">{{ count('open') }}</dd><dd class="au-stat__note">Esperan tu decisión</dd></div>
          <div class="au-stat"><dt class="au-stat__label">Aprobadas</dt><dd class="au-stat__value">{{ count('approved') + count('planned') }}</dd><dd class="au-stat__note">Por hacer o en el plan</dd></div>
          <div class="au-stat"><dt class="au-stat__label">En espera</dt><dd class="au-stat__value">{{ count('deferred') }}</dd><dd class="au-stat__note">Aplazadas o frenadas por las protecciones</dd></div>
          <div class="au-stat advanced-stat--good"><dt class="au-stat__label">Hechas</dt><dd class="au-stat__value">{{ count('completed') }}</dd><dd class="au-stat__note">Con su resultado en medición</dd></div>
        </dl>
      }

      @if (connection(); as c) {
        @if (c.status !== 'active') {
          <div class="au-banner au-banner--info" role="status"><app-icon name="info"></app-icon><span class="au-banner__text">{{ c.configured ? 'Search Console no está conectado: solo se ven oportunidades del sitio, los competidores y la investigación.' : 'Esta plataforma no tiene configurado Search Console: solo se ven oportunidades del sitio, los competidores y la investigación.' }}</span><a class="au-banner__action" routerLink="/studio/settings/seo" [queryParams]="{ tab: 'data' }">Ajustes</a></div>
        }
      }

      <section class="au-panel au-panel--padded" aria-labelledby="so-list">
        <div class="advanced-card-header">
          <h2 class="au-panel__title" id="so-list">Trabajo propuesto</h2>
          <p>La puntuación ordena el trabajo; no es una probabilidad de posicionar.</p>
        </div>
        <div class="au-tabs" role="group" aria-label="Estado">
          @for (key of tabs(); track key) {
            <button class="au-tab" type="button" [class.is-active]="status() === key" [attr.aria-pressed]="status() === key" (click)="status.set(key); page.set(1)">{{ plural(statuses[key]) }} <span class="au-tab__count">{{ count(key) }}</span></button>
          }
        </div>
        <div class="au-toolbar advanced-filter-bar" role="search">
          <label class="au-search au-flex-1"><app-icon name="search"></app-icon><input class="au-search__input" type="search" placeholder="Buscar consulta o página…" aria-label="Buscar oportunidades" [ngModel]="search()" (ngModelChange)="search.set($event); page.set(1)" /></label>
          <select class="au-select" aria-label="Crear o mejorar" [ngModel]="work()" (ngModelChange)="work.set($event); page.set(1)"><option value="">Crear y mejorar</option><option value="create">Crear contenido</option><option value="improve">Mejorar lo existente</option></select>
          <select class="au-select" aria-label="Acción" [ngModel]="action()" (ngModelChange)="action.set($event); page.set(1)">
            <option value="">Todas las acciones</option>
            @for (key of actionKeys(); track key) { <option [value]="key">{{ actions[key] ?? key }}</option> }
          </select>
          <select class="au-select" aria-label="Intención" [ngModel]="intent()" (ngModelChange)="intent.set($event); page.set(1)"><option value="">Toda intención</option><option value="unknown">Sin intención conocida</option>@for (key of intentKeys(); track key) { <option [value]="key">{{ intents[key] ?? key }}</option> }</select>
          @if (marketKeys().length > 1) { <select class="au-select" aria-label="Mercado" [ngModel]="market()" (ngModelChange)="market.set($event); page.set(1)"><option value="">Todos los mercados</option>@for (key of marketKeys(); track key) { <option [value]="key">{{ key }}</option> }</select> }
          <select class="au-select" aria-label="Confianza" [ngModel]="confidence()" (ngModelChange)="confidence.set($event); page.set(1)"><option value="">Toda confianza</option><option value="high">Confianza 50 o más</option><option value="low">Confianza menor de 50</option><option value="unknown">Confianza desconocida</option></select>
          <select class="au-select" aria-label="Ordenar" [ngModel]="sort()" (ngModelChange)="sort.set($event); page.set(1)"><option value="priority">Prioridad</option><option value="score">Puntuación</option><option value="relevance">Relevancia para el negocio</option><option value="value">Valor potencial</option><option value="confidence">Confianza</option></select>
        </div>

        @if (!loaded()) { <div class="au-skeleton-list" aria-label="Cargando oportunidades">@for (row of [1, 2, 3]; track row) { <div class="au-skeleton" style="height: 52px"></div> }</div> }
        @else if (!shown().length && !failed()) {
          <app-empty-state icon="competency" title="Ninguna oportunidad coincide" [text]="items().length ? 'Cambia el estado, los filtros o la búsqueda.' : 'Analiza el sitio, conecta Search Console o investiga para encontrar oportunidades.'"></app-empty-state>
        }
        @if (truncated()) { <p class="so-guard">Se muestran las {{ items().length }} con más prioridad de {{ total() }}.</p> }
        @if (shown().length) {
          <div class="au-panel au-table-wrap au-table-wrap--scrollable" role="region" aria-label="Oportunidades SEO" tabindex="0">
            <table class="au-table au-table--hover au-table--keep-columns so-table">
              <thead>
                <tr>
                  <th scope="col">Oportunidad</th>
                  <th scope="col">Acción</th>
                  <th scope="col">Intención</th>
                  <th scope="col" class="au-num">Relevancia</th>
                  <th scope="col" class="au-num">Valor potencial</th>
                  <th scope="col">Puntuación</th>
                  <th scope="col">Confianza</th>
                  <th scope="col" class="au-table__actions"><span class="au-visually-hidden">Acciones</span></th>
                </tr>
              </thead>
              <tbody>
                @for (item of paged(); track item.id) {
                  <tr [class.is-selected]="open() === item.id">
                    <td class="so-title">
                      <button class="au-cell-title__name au-link-button" type="button" [title]="label(item)" (click)="show(item.id)">{{ label(item) }}</button>
                      @if (item.targetUrl; as url) { <a class="au-cell-title__meta" [href]="url" [title]="url" target="_blank" rel="noopener noreferrer">{{ path(url) }}</a> }
                      @else { <span class="au-cell-title__meta">Página nueva{{ item.market ? ' · ' + item.market : '' }}</span> }
                      @for (guard of item.explanation?.safeguards ?? []; track guard.code) { <p class="so-guard">{{ guard.detail }}</p> }
                    </td>
                    <td><span class="au-badge" [ngClass]="badge(item)">{{ actions[proposed(item)] ?? proposed(item) }}</span></td>
                    <td>{{ intentLabel(item) }}</td>
                    <td class="au-num">{{ relevance(item) === null ? 'Sin dato' : (relevance(item)! * 100 | number: '1.0-0') + ' %' }}</td>
                    <td class="au-num">{{ potential(item) === null ? 'Sin dato' : '+' + (potential(item) | number) + ' clics' }}</td>
                    <td>@if (item.score !== null) { <div class="so-score"><strong>{{ item.score }}</strong><div class="au-progress" aria-hidden="true"><span class="au-progress__bar" [style.width.%]="item.score"></span></div></div> } @else { Sin puntuar }</td>
                    <td><span class="au-badge" [ngClass]="item.confidence === null ? 'au-badge--outline' : item.confidence < 50 ? 'au-badge--warning' : 'au-badge--neutral'">{{ item.confidence ?? 'Desconocida' }}</span></td>
                    <td class="au-table__actions">
                      @if (canManage()) {
                        @if (item.status === 'open') { <button class="au-btn au-btn--secondary au-btn--sm" type="button" [disabled]="!!busy()" (click)="act(item, creates(item) ? 'plan' : 'approved')">{{ creates(item) ? 'Al plan' : 'Aprobar' }}</button> }
                        @if (item.status === 'approved' && creates(item)) { <button class="au-btn au-btn--secondary au-btn--sm" type="button" [disabled]="!!busy()" (click)="act(item, 'plan')">Al plan</button> }
                        @if (item.status === 'approved' && revisable(item)) { <button class="au-btn au-btn--secondary au-btn--sm" type="button" [disabled]="!!busy()" (click)="act(item, 'revise')">Preparar revisión</button> }
                        @if (item.status === 'dismissed' || item.status === 'deferred') { <button class="au-btn au-btn--ghost au-btn--sm" type="button" [disabled]="!!busy()" (click)="act(item, 'open')">Reabrir</button> }
                      }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          <app-pager [page]="page()" [pages]="pages()" label="oportunidades" (go)="page.set($event)"></app-pager>
        }
      </section>

      @if (detail(); as item) {
        <div class="au-drawer-backdrop" (click)="close()"></div>
        <aside class="au-drawer" appDrawer (closed)="close()" aria-labelledby="so-detail-title">
          <header class="au-drawer__head">
            <h2 class="au-drawer__title" id="so-detail-title">{{ label(item) }}</h2>
            <button class="au-btn au-btn--ghost au-btn--sm" type="button" (click)="close()" aria-label="Cerrar detalle"><app-icon name="close"></app-icon></button>
          </header>
          <dl class="so-facts">
            <dt>Estado</dt><dd>{{ statuses[item.status] ?? item.status }} · {{ stages[item.stage] ?? item.stage }}</dd>
            <dt>Origen</dt><dd>{{ origins[item.source] ?? item.source }}{{ item.analyzedAt ? ', valorada el ' + (item.analyzedAt | date: 'd/MM/y') : '' }}</dd>
            <dt>Intención</dt><dd>{{ intentLabel(item) }}</dd>
            @if (item.market) { <dt>Mercado</dt><dd>{{ item.market }}</dd> }
            <dt>Acción</dt><dd>{{ actions[proposed(item)] ?? proposed(item) }}</dd>
            @if (item.targetUrl; as url) { <dt>Página</dt><dd><a [href]="url" target="_blank" rel="noopener noreferrer">{{ path(url) }}</a></dd> }
            <dt>Puntuación</dt><dd>{{ item.score ?? 'desconocida' }}</dd>
            <dt>Confianza</dt><dd>{{ item.confidence ?? 'desconocida' }}</dd>
            <dt>Esfuerzo</dt><dd>{{ efforts[item.explanation?.effort ?? ''] ?? 'desconocido' }}</dd>
          </dl>
          @if (item.explanation; as why) {
            <div class="so-detail">
              <p>{{ why.why }}</p>
              @for (guard of why.safeguards; track guard.code) { <p class="advanced-callout">{{ guard.detail }}</p> }
              <div><h3>Por qué esta acción</h3><p>{{ why.action.reason }}</p></div>
              <div><h3>Datos</h3><ul>@for (entry of why.evidence; track $index) { <li>{{ entry.metric }}: <strong>{{ entry.value ?? 'sin dato' }}</strong> <small>{{ data[entry.kind] }}{{ entry.period ? ' · ' + entry.period : '' }}{{ entry.note ? ' · ' + entry.note : '' }}</small></li> }</ul></div>
              <div><h3>Puntuación ({{ why.score.coverage * 100 | number: '1.0-0' }} % conocido)</h3><ul>@for (part of why.factors; track part.key) { <li>{{ factors[part.key] }}: <strong>{{ part.value === null ? 'desconocido' : (part.value * 100 | number: '1.0-0') + ' %' }}</strong> <small>{{ data[part.kind] }} · {{ part.detail }}</small></li> }</ul></div>
              <div><h3>Confianza</h3><ul>@for (reason of why.confidence.reasons; track $index) { <li>{{ reason }}</li> }</ul></div>
              @if (why.expected.clicks28d !== null) { <div><h3>Estimación</h3><p>Unos {{ why.expected.clicks28d | number }} clics más en 28 días {{ why.expected.scenario }}. Es un escenario, no una promesa.</p></div> }
              @if (why.risks.length) { <div><h3>Riesgos</h3><ul>@for (risk of why.risks; track $index) { <li>{{ risk }}</li> }</ul></div> }
              <p><small>{{ why.externalData.detail }}</small></p>
              @for (done of item.actions; track done.actedAt) {
                <div>
                  <h3>Resultado observado (cambio del {{ done.actedAt | date: 'd/MM/y' }})</h3>
                  @for (result of evaluations(done.evaluations); track result.window) {
                    <p>{{ result.window }} días: {{ result.pre.clicks | number }} → {{ result.post.clicks | number }} clics. {{ outcomes[result.outcome] }}</p>
                    <p><small>{{ result.uncertainty.join(' ') }}</small></p>
                  } @empty { <p>Aún no hay 28 días completos que comparar.</p> }
                </div>
              }
            </div>
          }
          @if (canManage()) {
            <div class="so-actions">
              @if (item.status === 'open') {
                <button class="au-btn au-btn--primary au-btn--sm" type="button" [disabled]="!!busy()" (click)="act(item, creates(item) ? 'plan' : 'approved')">{{ creates(item) ? 'Llevar al plan' : 'Aprobar' }}</button>
                @if (creates(item)) { <button class="au-btn au-btn--secondary au-btn--sm" type="button" [disabled]="!!busy()" (click)="act(item, 'approved')">Aprobar sin planificar</button> }
                <button class="au-btn au-btn--ghost au-btn--sm" type="button" [disabled]="!!busy()" (click)="act(item, 'deferred')">Aplazar</button>
                <button class="au-btn au-btn--ghost au-btn--sm" type="button" [disabled]="!!busy()" (click)="act(item, 'dismissed')">Descartar</button>
              }
              @if (item.status === 'approved') {
                @if (creates(item)) { <button class="au-btn au-btn--primary au-btn--sm" type="button" [disabled]="!!busy()" (click)="act(item, 'plan')">Llevar al plan</button> }
                @if (revisable(item)) { <button class="au-btn au-btn--secondary au-btn--sm" type="button" [disabled]="!!busy()" (click)="act(item, 'revise')">Preparar revisión</button> }
                <label class="au-field"><span class="au-field__label">Fecha del cambio</span><input class="au-input" type="date" [max]="today" [(ngModel)]="doneOn" /></label>
                <button class="au-btn au-btn--secondary au-btn--sm" type="button" [disabled]="!!busy() || !doneOn" (click)="act(item, 'done')">Marcar como hecha</button>
                <button class="au-btn au-btn--ghost au-btn--sm" type="button" [disabled]="!!busy()" (click)="act(item, 'open')">Reabrir</button>
              }
              @if (item.status === 'dismissed' || item.status === 'deferred') { <button class="au-btn au-btn--secondary au-btn--sm" type="button" [disabled]="!!busy()" (click)="act(item, 'open')">Reabrir</button> }
              @if (researchable(item)) { <a class="au-btn au-btn--ghost au-btn--sm" routerLink="/studio/seo-research" [queryParams]="{ topic: item.query ?? item.topic }">Investigar más</a> }
            </div>
          } @else { <p class="so-guard">Tu rol puede consultarlas, pero no decidir sobre ellas.</p> }
        </aside>
      }
    </section>
  `,
})
export class SeoOpportunitiesPageComponent {
  private readonly api = inject(SeoIntelligenceApiService);
  private readonly app = inject(AppContextService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly actions = SEO_ACTIONS;
  readonly statuses = SEO_STATUSES;
  readonly stages = SEO_STAGES;
  readonly intents = SEO_INTENTS;
  readonly data = SEO_DATA_KINDS;
  readonly factors = SEO_FACTORS;
  readonly outcomes = SEO_OUTCOMES;
  readonly path = urlPath;
  readonly efforts: Record<string, string> = { low: 'bajo', medium: 'medio', high: 'alto' };
  readonly origins: Record<string, string> = { search_console: 'Search Console', crawl: 'Lectura del sitio', competitor: 'Competidores', provider: 'Proveedor de datos', research: 'Investigación' };
  readonly statusKeys = ['open', 'approved', 'planned', 'completed', 'monitoring', 'deferred', 'rejected', 'dismissed', 'expired'];
  readonly today = new Date().toISOString().slice(0, 10);

  readonly connection = signal<SearchConsoleStatus | null>(null);
  readonly items = signal<SeoOpportunity[]>([]);
  readonly total = signal(0);
  readonly page = signal(1);
  readonly status = signal('open');
  readonly open = signal<string | null>(null);
  readonly busy = signal('');
  readonly loaded = signal(false);
  readonly failed = signal('');
  readonly search = signal('');
  readonly action = signal('');
  readonly work = signal('');
  readonly intent = signal('');
  readonly market = signal('');
  readonly confidence = signal('');
  readonly sort = signal('priority');
  readonly canManage = computed(() => this.app.can('projects.manage'));
  readonly truncated = computed(() => this.total() > this.items().length);
  readonly shown = computed(() => {
    const text = this.search().trim().toLowerCase();
    const level = this.confidence();
    const rows = this.items().filter((item) => item.status === this.status() && (!this.action() || this.proposed(item) === this.action())
      && (!this.work() || this.creates(item) === (this.work() === 'create')) && (!this.intent() || (this.intentOf(item) ?? 'unknown') === this.intent()) && (!this.market() || item.market === this.market())
      && (!level || (level === 'unknown' ? item.confidence === null : item.confidence !== null && (level === 'low') === item.confidence < 50))
      && (!text || `${item.topic} ${item.query ?? ''} ${item.targetUrl ?? ''}`.toLowerCase().includes(text)));
    const key = this.sort();
    if (key === 'priority') return rows; // as the server ordered them
    const value = (item: SeoOpportunity) => (key === 'score' ? item.score : key === 'confidence' ? item.confidence : key === 'relevance' ? this.relevance(item) : this.potential(item));
    // Unknown goes last: it is not a low value.
    return [...rows].sort((a, b) => (value(b) ?? -Infinity) - (value(a) ?? -Infinity) || 0);
  });
  readonly pages = computed(() => Math.max(1, Math.ceil(this.shown().length / PAGE_SIZE)));
  readonly paged = computed(() => this.shown().slice((Math.min(this.page(), this.pages()) - 1) * PAGE_SIZE, Math.min(this.page(), this.pages()) * PAGE_SIZE));
  readonly intentKeys = computed(() => [...new Set(this.items().flatMap((item) => this.intentOf(item) ?? []))].sort());
  readonly marketKeys = computed(() => [...new Set(this.items().flatMap((item) => item.market ?? []))].sort());
  readonly tabs = computed(() => this.statusKeys.filter((key) => key === 'open' || key === this.status() || this.count(key) > 0));
  readonly actionKeys = computed(() => [...new Set(this.items().map((item) => this.proposed(item)))].sort());
  readonly detail = computed(() => this.items().find((item) => item.id === this.open()) ?? null);
  doneOn = this.today;
  private siteId: string | null = null;
  private requested = this.route.snapshot.queryParamMap.get('id');

  constructor() {
    void this.finishAuthorization();
    effect(() => {
      const id = this.app.activeSite()?.id ?? null;
      if (id && id !== this.siteId) {
        this.siteId = id;
        this.loaded.set(false);
        this.open.set(null);
        void this.load();
      }
    });
  }

  count(status: string): number {
    return this.items().filter((item) => item.status === status).length;
  }
  plural(label: string): string {
    return label.startsWith('En ') ? label : label + 's';
  }
  proposed(item: SeoOpportunity): string {
    return item.explanation?.action?.proposed ?? item.action;
  }
  creates(item: SeoOpportunity): boolean {
    return item.action === 'create_content' || item.action === 'strengthen_cluster';
  }
  revisable(item: SeoOpportunity): boolean {
    return !!item.targetUrl && ['update_existing', 'expand_existing', 'improve_metadata'].includes(item.action);
  }
  badge(item: SeoOpportunity): string {
    const action = this.proposed(item);
    return action === 'resolve_technical' || action === 'investigate_cannibalization' ? 'au-badge--warning' : action === 'create_content' || action === 'strengthen_cluster' ? 'au-badge--brand' : 'au-badge--success';
  }
  metric(item: SeoOpportunity, name: string): number | string | null {
    return item.explanation?.evidence.find((entry) => entry.metric === name)?.value ?? null;
  }
  /** A page without a title is named by its address, shown once as a path. */
  label(item: SeoOpportunity): string {
    return item.topic === item.targetUrl ? this.path(item.topic) : item.topic;
  }
  relevance(item: SeoOpportunity): number | null {
    return item.explanation?.factors.find((factor) => factor.key === 'businessRelevance')?.value ?? null;
  }
  potential(item: SeoOpportunity): number | null {
    return item.explanation?.expected.clicks28d ?? null;
  }
  intentOf(item: SeoOpportunity): string | null {
    return item.intent;
  }
  intentLabel(item: SeoOpportunity): string {
    const intent = this.intentOf(item);
    return intent ? (this.intents[intent] ?? intent) : 'Sin dato';
  }
  researchable(item: SeoOpportunity): boolean {
    return ['open', 'approved', 'deferred'].includes(item.status) && (!!item.query || item.topic !== item.targetUrl);
  }
  show(id: string): void {
    this.open.set(id);
  }
  close(): void {
    this.open.set(null);
  }
  evaluations(value: Record<string, SeoEvaluation> | null): SeoEvaluation[] {
    return Object.values(value ?? {}).sort((a, b) => a.window - b.window);
  }

  /** Google sends the person back here; the code is exchanged once and leaves the address bar. */
  private async finishAuthorization(): Promise<void> {
    const params = this.route.snapshot.queryParamMap;
    const state = params.get('state');
    const code = params.get('code');
    const declined = params.get('error');
    if (!state) return;
    await this.router.navigate([], { queryParams: {}, replaceUrl: true });
    if (declined || !code) {
      this.toast.error('No se autorizó el acceso a Search Console.');
      return;
    }
    await this.run('connect', async () => {
      await firstValueFrom(this.api.complete(state, code));
      this.toast.success('Search Console conectado.');
      await this.router.navigate(['/studio/settings/seo'], { queryParams: { tab: 'data' } });
    });
  }

  async load(): Promise<void> {
    const siteId = this.siteId;
    if (!siteId) return;
    try {
      const [connection, opportunities] = await Promise.all([firstValueFrom(this.api.connection(siteId)), firstValueFrom(this.api.opportunities(siteId))]);
      if (siteId !== this.siteId) return;
      this.failed.set('');
      this.connection.set(connection);
      this.items.set(opportunities.items);
      this.total.set(opportunities.total);
      this.openRequested();
    } catch (error) {
      this.failed.set(seoError(error));
    } finally {
      this.loaded.set(true);
    }
  }

  /** A link to one opportunity shows it wherever it is in the list. */
  private openRequested(): void {
    const item = this.items().find((entry) => entry.id === this.requested);
    this.requested = null;
    if (!item) return;
    this.status.set(item.status);
    this.page.set(Math.floor(Math.max(0, this.shown().indexOf(item)) / PAGE_SIZE) + 1);
    this.show(item.id);
  }

  private async run(name: string, action: (siteId: string) => Promise<void>): Promise<void> {
    if (this.busy()) return;
    this.busy.set(name);
    try {
      await action(this.siteId ?? '');
    } catch (error) {
      this.toast.error(seoError(error));
    } finally {
      this.busy.set('');
      await this.load();
    }
  }

  analyze(): Promise<void> {
    return this.run('analyze', async (siteId) => {
      const result = await firstValueFrom(this.api.analyze(siteId));
      this.toast.success(`${result.open} oportunidad(es) abiertas${result.firstPartyData ? '' : '. Aún no hay datos suficientes de Search Console'}.`);
    });
  }
  act(item: SeoOpportunity, action: SeoDecision | 'plan' | 'done' | 'revise'): Promise<void> {
    return this.run('act', async (siteId) => {
      if (action === 'revise') {
        const { projectId } = await firstValueFrom(this.api.revise(siteId, item.id));
        this.toast.success('Redactando una versión nueva de la página. No se publica hasta que la apruebes.');
        await this.router.navigate(['/studio/content', projectId]);
        return;
      }
      if (action === 'plan') await firstValueFrom(this.api.plan(siteId, item.id));
      else if (action === 'done') await firstValueFrom(this.api.markDone(siteId, item.id, this.doneOn));
      else await firstValueFrom(this.api.decide(siteId, item.id, action));
      this.open.set(null);
    });
  }
}
