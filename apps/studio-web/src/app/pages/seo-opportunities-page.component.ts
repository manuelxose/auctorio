import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, ElementRef, computed, effect, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AppEmptyStateComponent } from '../components/ui/app-empty-state.component';
import { AppIconComponent } from '../components/ui/app-icon.component';
import { AppContextService } from '../services/app-context.service';
import { SearchConsoleStatus, SeoEvaluation, SeoIntelligenceApiService, SeoOpportunity, SeoProfileView } from '../services/seo-intelligence-api.service';
import { ToastService } from '../services/toast.service';

const ACTIONS: Record<string, string> = {
  create_content: 'Crear contenido', update_existing: 'Actualizar página', expand_existing: 'Ampliar página', improve_metadata: 'Mejorar título y descripción', improve_internal_linking: 'Mejorar enlaces internos',
  strengthen_cluster: 'Reforzar tema', investigate_cannibalization: 'Investigar canibalización', resolve_technical: 'Resolver problema técnico', monitor: 'Vigilar', defer: 'Esperar', reject: 'Descartar',
};
const STATUSES: Record<string, string> = { open: 'Abierta', approved: 'Aprobada', planned: 'En el plan', completed: 'Hecha', monitoring: 'En seguimiento', deferred: 'En espera', rejected: 'Rechazada', dismissed: 'Descartada', expired: 'Caducada' };
const DATA: Record<string, string> = { observed: 'Observado', provider_reported: 'Según proveedor', estimated: 'Estimado', historical: 'Histórico', unavailable: 'No disponible', unknown: 'Desconocido' };
const PROFILES: Record<string, string> = { publisher: 'Medio o blog', corporate: 'Web corporativa', local_business: 'Negocio local', services: 'Servicios', ecommerce: 'Tienda', new_website: 'Sitio nuevo', custom: 'Personalizado' };
const FACTORS: Record<string, string> = {
  businessRelevance: 'Relevancia para el negocio', searchDemand: 'Demanda', rankingFeasibility: 'Alcanzable', conversionPotential: 'Potencial de conversión', existingPerformance: 'Rendimiento actual', topicalAuthority: 'Autoridad en el tema',
  competitiveEvidence: 'Competencia', seasonality: 'Estacionalidad', productionEffort: 'Poco esfuerzo', maintenanceCost: 'Poco mantenimiento', cannibalizationRisk: 'Sin canibalización', expectedValue: 'Valor esperado',
};
const CONNECTION: Record<string, string> = {
  not_connected: 'Sin conectar', pending_property: 'Falta elegir la propiedad', active: 'Conectado', revoked: 'Google retiró el acceso: vuelve a conectar', forbidden: 'La cuenta ya no puede leer la propiedad', disconnected: 'Desconectado',
};
const ERRORS: Record<string, string> = {
  opportunity_conflicts_with_approved: 'Esa página ya tiene otra acción aprobada. Complétala antes.', opportunity_not_open: 'Esta oportunidad ya no está abierta.', search_console_not_configured: 'Falta configurar Google en el servidor.',
  search_console_syncing: 'Ya se está sincronizando.', external_seo_stopped: 'Un administrador ha parado el SEO externo.', search_console_property_not_allowed: 'Esa propiedad no es de este dominio.', site_base_url_required: 'El sitio no tiene dirección web.',
  search_console_state_expired: 'La autorización caducó. Vuelve a conectar.', search_console_unknown_state: 'Esa autorización no es de esta sesión.', search_console_forbidden: 'Google no concedió el permiso de lectura.', search_console_quota: 'Google ha limitado las consultas. Se reintentará más tarde.',
  forbidden: 'No tienes permiso para esta acción.',
};

@Component({
  selector: 'app-seo-opportunities-page',
  standalone: true,
  imports: [CommonModule, FormsModule, AppIconComponent, AppEmptyStateComponent],
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
    .so-panels { align-items: start; }
    .so-panels p { margin: 0 0 8px; font-size: var(--au-fs-body-sm); overflow-wrap: anywhere; }
    .so-head { display: flex; flex-wrap: wrap; align-items: start; justify-content: space-between; gap: 10px; }
  `],
  template: `
    <section class="au-page advanced-page advanced-jobs">
      <header class="au-page__header">
        <div>
          <p class="au-page__eyebrow">Auctorio / Investigación</p>
          <h1 class="au-page__title">Oportunidades SEO</h1>
          <p class="au-page__subtitle">Qué hacer en tu sitio, con qué datos se decide y con cuánta confianza.</p>
        </div>
        <div class="au-page__actions">
          <button class="au-btn au-btn--primary au-btn--sm" type="button" [disabled]="!!busy()" (click)="analyze()"><app-icon name="refresh"></app-icon>{{ busy() === 'analyze' ? 'Analizando…' : 'Analizar ahora' }}</button>
        </div>
      </header>

      @if (failed(); as reason) {
        <div class="au-banner au-banner--error" role="alert"><app-icon name="warning"></app-icon><span class="au-banner__text">{{ reason }}</span><button class="au-banner__action" type="button" (click)="load()">Reintentar</button></div>
      } @else if (loaded()) {
        <dl class="advanced-kpis" aria-label="Resumen de oportunidades">
          <div class="au-stat"><dt class="au-stat__label">Abiertas</dt><dd class="au-stat__value">{{ count('open') }}</dd><dd class="au-stat__note">Esperan tu decisión</dd></div>
          <div class="au-stat"><dt class="au-stat__label">Aprobadas</dt><dd class="au-stat__value">{{ count('approved') + count('planned') }}</dd><dd class="au-stat__note">Por hacer o en el plan</dd></div>
          <div class="au-stat"><dt class="au-stat__label">En espera</dt><dd class="au-stat__value">{{ count('deferred') }}</dd><dd class="au-stat__note">Frenadas por las protecciones</dd></div>
          <div class="au-stat advanced-stat--good"><dt class="au-stat__label">Hechas</dt><dd class="au-stat__value">{{ count('completed') }}</dd><dd class="au-stat__note">Con su resultado en medición</dd></div>
        </dl>
      }

      @if (connection(); as c) { @if (c.status !== 'active') { <ng-container [ngTemplateOutlet]="consolePanel" [ngTemplateOutletContext]="{ $implicit: c }"></ng-container> } }

      <section class="au-panel au-panel--padded" [class.advanced-followup]="connection()?.status !== 'active'" aria-labelledby="so-list">
        <div class="advanced-card-header">
          <h2 class="au-panel__title" id="so-list">Trabajo propuesto</h2>
          <p>La puntuación ordena el trabajo; no es una probabilidad de posicionar.</p>
        </div>
        <div class="au-tabs" role="group" aria-label="Estado">
          @for (key of tabs(); track key) {
            <button class="au-tab" type="button" [class.is-active]="status() === key" [attr.aria-pressed]="status() === key" (click)="status.set(key)">{{ plural(statuses[key]) }} <span class="au-tab__count">{{ count(key) }}</span></button>
          }
        </div>
        <div class="au-toolbar advanced-filter-bar" role="search">
          <label class="au-search au-flex-1"><app-icon name="search"></app-icon><input class="au-search__input" type="search" placeholder="Buscar consulta o página…" aria-label="Buscar oportunidades" [ngModel]="search()" (ngModelChange)="search.set($event)" /></label>
          <select class="au-select" aria-label="Acción" [ngModel]="action()" (ngModelChange)="action.set($event)">
            <option value="">Todas las acciones</option>
            @for (key of actionKeys(); track key) { <option [value]="key">{{ actions[key] ?? key }}</option> }
          </select>
        </div>

        @if (!loaded()) { <div class="au-skeleton-list" aria-label="Cargando oportunidades">@for (row of [1, 2, 3]; track row) { <div class="au-skeleton" style="height: 52px"></div> }</div> }
        @else if (!shown().length && !failed()) {
          <app-empty-state icon="competency" title="Ninguna oportunidad coincide" [text]="items().length ? 'Cambia el estado, la acción o la búsqueda.' : 'Conecta Search Console o analiza el sitio para encontrar oportunidades.'"></app-empty-state>
        }
        @if (shown().length) {
          <div class="au-panel au-table-wrap au-table-wrap--scrollable" role="region" aria-label="Oportunidades SEO" tabindex="0">
            <table class="au-table au-table--hover au-table--keep-columns so-table">
              <thead>
                <tr>
                  <th scope="col">Oportunidad</th>
                  <th scope="col">Acción</th>
                  <th scope="col" class="au-num">Impresiones</th>
                  <th scope="col" class="au-num">Posición</th>
                  <th scope="col">Puntuación</th>
                  <th scope="col">Confianza</th>
                  <th scope="col" class="au-table__actions"><span class="au-visually-hidden">Acciones</span></th>
                </tr>
              </thead>
              <tbody>
                @for (item of shown(); track item.id) {
                  <tr [class.is-selected]="open() === item.id">
                    <td class="so-title">
                      <button class="au-cell-title__name au-link-button" type="button" [title]="label(item)" (click)="show(item.id)">{{ label(item) }}</button>
                      @if (item.targetUrl; as url) { <a class="au-cell-title__meta" [href]="url" [title]="url" target="_blank" rel="noopener noreferrer">{{ path(url) }}</a> }
                      @else { <span class="au-cell-title__meta">Página nueva</span> }
                      @for (guard of item.explanation?.safeguards ?? []; track guard.code) { <p class="so-guard">{{ guard.detail }}</p> }
                    </td>
                    <td><span class="au-badge" [ngClass]="badge(item)">{{ actions[proposed(item)] ?? proposed(item) }}</span></td>
                    <td class="au-num">{{ metric(item, 'Impresiones') === null ? '—' : (metric(item, 'Impresiones') | number) }}</td>
                    <td class="au-num">{{ metric(item, 'Posición media') ?? '—' }}</td>
                    <td>@if (item.score !== null) { <div class="so-score"><strong>{{ item.score }}</strong><div class="au-progress" aria-hidden="true"><span class="au-progress__bar" [style.width.%]="item.score"></span></div></div> } @else { — }</td>
                    <td><span class="au-badge" [ngClass]="(item.confidence ?? 0) < 50 ? 'au-badge--warning' : 'au-badge--neutral'">{{ item.confidence ?? '—' }}</span></td>
                    <td class="au-table__actions">
                      <button class="au-btn au-btn--ghost au-btn--sm" type="button" (click)="show(item.id)">Por qué</button>
                      @if (item.status === 'open') {
                        <button class="au-btn au-btn--secondary au-btn--sm" type="button" [disabled]="!!busy()" (click)="act(item, creates(item) ? 'plan' : 'approved')">{{ creates(item) ? 'Al plan' : 'Aprobar' }}</button>
                        <button class="au-btn au-btn--ghost au-btn--sm" type="button" [disabled]="!!busy()" (click)="act(item, 'dismissed')">Descartar</button>
                      }
                      @if (item.status === 'approved') { <button class="au-btn au-btn--secondary au-btn--sm" type="button" (click)="show(item.id)">Completar</button> }
                      @if (item.status === 'dismissed') { <button class="au-btn au-btn--ghost au-btn--sm" type="button" [disabled]="!!busy()" (click)="act(item, 'open')">Reabrir</button> }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      </section>

      <div class="advanced-grid-2 advanced-followup so-panels">
        @if (connection(); as c) { @if (c.status === 'active') { <ng-container [ngTemplateOutlet]="consolePanel" [ngTemplateOutletContext]="{ $implicit: c }"></ng-container> } }
        @if (profile(); as p) {
          <section class="au-panel au-panel--padded" aria-labelledby="so-profile">
            <div class="advanced-card-header so-head">
              <div><h2 class="au-panel__title" id="so-profile">Qué valora este sitio</h2><p>{{ p.chosen ? 'Elegido por tu equipo' : 'Deducido del tipo de sitio: confírmalo o cámbialo' }}</p></div>
              <button class="au-btn au-btn--secondary au-btn--sm" type="button" [attr.aria-expanded]="editProfile()" (click)="editProfile.set(!editProfile())">{{ editProfile() ? 'Cerrar' : 'Cambiar' }}</button>
            </div>
            @if (!editProfile()) { <p><strong>{{ profiles[p.profile] }}</strong></p> }
            @else {
              <form (ngSubmit)="saveProfile()">
                <div class="au-field-grid">
                  <label class="au-field"><span class="au-field__label">Tipo de negocio</span><select class="au-select" name="profile" [(ngModel)]="form.profile">@for (key of p.profiles; track key) { <option [value]="key">{{ profiles[key] }}</option> }</select></label>
                  <label class="au-field"><span class="au-field__label">Páginas de control sin tocar (%)</span><input class="au-input" name="holdout" type="number" min="0" max="30" step="1" [(ngModel)]="form.holdout" /></label>
                  <label class="au-field au-field--wide"><span class="au-field__label">Temas prioritarios (separados por comas)</span><input class="au-input" name="topics" [(ngModel)]="form.topics" /></label>
                  @if (form.profile === 'custom') {
                    @for (key of factorKeys; track key) { <label class="au-field"><span class="au-field__label">{{ factors[key] }} (peso 0–3)</span><input class="au-input" [name]="key" type="number" min="0" max="3" step="0.1" [(ngModel)]="form.weights[key]" /></label> }
                  }
                </div>
                <div class="so-actions"><button class="au-btn au-btn--primary au-btn--sm" type="submit" [disabled]="!!busy()">Guardar</button></div>
              </form>
            }
          </section>
        }
      </div>

      <ng-template #consolePanel let-c>
        <section class="au-panel au-panel--padded" aria-labelledby="so-console">
          <div class="advanced-card-header so-head">
            <div><h2 class="au-panel__title" id="so-console">Search Console</h2><p>{{ connectionLabel(c) }}@if (c.property) { · {{ c.property }} }</p></div>
            <div class="so-head">
              @if (c.status === 'active') {
                <button class="au-btn au-btn--secondary au-btn--sm" type="button" [disabled]="!!busy() || c.syncing" (click)="sync()">{{ busy() === 'sync' || c.syncing ? 'Sincronizando…' : 'Sincronizar' }}</button>
                <button class="au-btn au-btn--ghost au-btn--sm" type="button" [disabled]="!!busy()" (click)="confirmDisconnect.set(!confirmDisconnect())" [attr.aria-expanded]="confirmDisconnect()">Desconectar</button>
              } @else {
                <button class="au-btn au-btn--primary au-btn--sm" type="button" [disabled]="!!busy() || !c.configured" (click)="connect()">{{ c.status === 'not_connected' ? 'Conectar Search Console' : 'Volver a conectar' }}</button>
              }
            </div>
          </div>
          @if (!c.configured) { <p>La plataforma no tiene configurado el acceso a Google. Un administrador debe añadirlo en el servidor.</p> }
          @if (c.syncedThrough) {
            <p>Datos del {{ c.syncedFrom | date: 'd/MM/y' }} al {{ c.syncedThrough | date: 'd/MM/y' }}{{ c.backfillComplete ? '' : ' (descargando el historial)' }}. Google publica los datos definitivos con dos o tres días de retraso{{ (c.dataAgeDays ?? 0) > 5 ? '; estos tienen ' + c.dataAgeDays + ' días' : '' }}.</p>
          }
          @if (c.lastError) { <p class="au-error" role="alert">Último error: {{ c.lastError }}. {{ c.nextSyncAt ? 'Próximo intento: ' + (c.nextSyncAt | date: 'd/MM/y, HH:mm') : 'No se reintentará hasta que vuelvas a conectar.' }}</p> }
          @if (c.status === 'pending_property') {
            @if (properties().length) {
              <div class="so-actions">@for (item of properties(); track item.property) { <button class="au-btn au-btn--secondary au-btn--sm" type="button" [disabled]="!!busy()" (click)="select(item.property)">{{ item.property }}</button> }</div>
            } @else { <p>La cuenta de Google no tiene ninguna propiedad verificada de este dominio.</p> }
          }
          @if (confirmDisconnect()) {
            <div class="so-actions" role="group" aria-label="Confirmar desconexión">
              <button class="au-btn au-btn--secondary au-btn--sm" type="button" (click)="disconnect(false)">Desconectar y conservar los datos</button>
              <button class="au-btn au-btn--danger au-btn--sm" type="button" (click)="disconnect(true)">Desconectar y borrar los datos</button>
            </div>
          }
        </section>
      </ng-template>

      @if (detail(); as item) {
        <div class="au-drawer-backdrop" (click)="close()"></div>
        <aside class="au-drawer" role="dialog" aria-modal="true" aria-labelledby="so-detail-title" (keydown.escape)="close()">
          <header class="au-drawer__head">
            <h2 class="au-drawer__title" id="so-detail-title">{{ label(item) }}</h2>
            <button #closeButton class="au-btn au-btn--ghost au-btn--sm" type="button" (click)="close()" aria-label="Cerrar detalle"><app-icon name="close"></app-icon></button>
          </header>
          <dl class="so-facts">
            <dt>Estado</dt><dd>{{ statuses[item.status] ?? item.status }}</dd>
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
          <div class="so-actions">
            @if (item.status === 'open') {
              <button class="au-btn au-btn--primary au-btn--sm" type="button" [disabled]="!!busy()" (click)="act(item, creates(item) ? 'plan' : 'approved')">{{ creates(item) ? 'Llevar al plan' : 'Aprobar' }}</button>
              <button class="au-btn au-btn--ghost au-btn--sm" type="button" [disabled]="!!busy()" (click)="act(item, 'dismissed')">Descartar</button>
            }
            @if (item.status === 'approved') {
              <label class="au-field"><span class="au-field__label">Fecha del cambio</span><input class="au-input" type="date" [max]="today" [(ngModel)]="doneOn" /></label>
              <button class="au-btn au-btn--primary au-btn--sm" type="button" [disabled]="!!busy() || !doneOn" (click)="act(item, 'done')">Marcar como hecha</button>
              <button class="au-btn au-btn--ghost au-btn--sm" type="button" [disabled]="!!busy()" (click)="act(item, 'open')">Reabrir</button>
            }
            @if (item.status === 'dismissed') { <button class="au-btn au-btn--secondary au-btn--sm" type="button" [disabled]="!!busy()" (click)="act(item, 'open')">Reabrir</button> }
          </div>
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

  readonly actions = ACTIONS;
  readonly statuses = STATUSES;
  readonly data = DATA;
  readonly profiles = PROFILES;
  readonly factors = FACTORS;
  readonly efforts: Record<string, string> = { low: 'bajo', medium: 'medio', high: 'alto' };
  readonly outcomes: Record<string, string> = { higher: 'Por encima de las páginas comparables.', lower: 'Por debajo de las páginas comparables.', no_clear_change: 'Sin diferencia clara con las páginas comparables.', insufficient_data: 'Datos insuficientes.' };
  readonly statusKeys = ['open', 'approved', 'planned', 'completed', 'monitoring', 'deferred', 'rejected', 'dismissed', 'expired'];
  readonly factorKeys = Object.keys(FACTORS);
  readonly today = new Date().toISOString().slice(0, 10);

  readonly connection = signal<SearchConsoleStatus | null>(null);
  readonly properties = signal<Array<{ property: string }>>([]);
  readonly items = signal<SeoOpportunity[]>([]);
  readonly profile = signal<SeoProfileView | null>(null);
  readonly status = signal('open');
  readonly open = signal<string | null>(null);
  readonly busy = signal('');
  readonly loaded = signal(false);
  readonly failed = signal('');
  readonly editProfile = signal(false);
  readonly confirmDisconnect = signal(false);
  readonly search = signal('');
  readonly action = signal('');
  readonly shown = computed(() => {
    const text = this.search().trim().toLowerCase();
    return this.items().filter((item) => item.status === this.status() && (!this.action() || this.proposed(item) === this.action()) && (!text || `${item.topic} ${item.query ?? ''} ${item.targetUrl ?? ''}`.toLowerCase().includes(text)));
  });
  readonly tabs = computed(() => this.statusKeys.filter((key) => key === 'open' || key === this.status() || this.count(key) > 0));
  readonly actionKeys = computed(() => [...new Set(this.items().map((item) => this.proposed(item)))].sort());
  readonly detail = computed(() => this.items().find((item) => item.id === this.open()) ?? null);
  private readonly closeButton = viewChild<ElementRef<HTMLButtonElement>>('closeButton');
  private opener: HTMLElement | null = null;
  doneOn = this.today;
  form: { profile: string; topics: string; holdout: number; weights: Record<string, number> } = { profile: 'publisher', topics: '', holdout: 0, weights: {} };
  private siteId: string | null = null;

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
    effect(() => this.closeButton()?.nativeElement.focus());
  }

  connectionLabel(c: SearchConsoleStatus): string {
    return CONNECTION[c.status] ?? c.status;
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
  badge(item: SeoOpportunity): string {
    const action = this.proposed(item);
    return action === 'resolve_technical' || action === 'investigate_cannibalization' ? 'au-badge--warning' : action === 'create_content' || action === 'strengthen_cluster' ? 'au-badge--brand' : 'au-badge--success';
  }
  metric(item: SeoOpportunity, name: string): number | string | null {
    return item.explanation?.evidence.find((entry) => entry.metric === name)?.value ?? null;
  }
  path(url: string): string {
    try {
      return new URL(url).pathname;
    } catch {
      return url;
    }
  }
  /** A page without a title is named by its address, shown once as a path. */
  label(item: SeoOpportunity): string {
    return item.topic === item.targetUrl ? this.path(item.topic) : item.topic;
  }
  show(id: string): void {
    this.opener = document.activeElement as HTMLElement | null;
    this.open.set(id);
  }
  close(): void {
    this.open.set(null);
    this.opener?.focus();
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
    await this.work('connect', async () => {
      await firstValueFrom(this.api.complete(state, code));
      this.toast.success('Search Console conectado.');
    });
  }

  async load(): Promise<void> {
    const siteId = this.siteId;
    if (!siteId) return;
    try {
      const [connection, opportunities, profile] = await Promise.all([firstValueFrom(this.api.connection(siteId)), firstValueFrom(this.api.opportunities(siteId)), firstValueFrom(this.api.profile(siteId))]);
      if (siteId !== this.siteId) return;
      this.failed.set('');
      this.connection.set(connection);
      this.items.set(opportunities.items);
      this.profile.set(profile);
      this.form = { profile: profile.profile, topics: profile.priorityTopics.join(', '), holdout: profile.holdoutPercent, weights: { ...profile.weights } };
      this.properties.set(connection.status === 'pending_property' ? (await firstValueFrom(this.api.properties(siteId))).items : []);
    } catch (error) {
      this.failed.set(this.message(error));
    } finally {
      this.loaded.set(true);
    }
  }

  private message(error: unknown): string {
    const body = error instanceof HttpErrorResponse ? error.error : null;
    const code = typeof body?.error === 'string' ? body.error : (body?.error?.code ?? '');
    return ERRORS[code] ?? ERRORS[body?.message ?? ''] ?? ERRORS[body?.error?.message ?? ''] ?? 'No se pudo completar la acción. Inténtalo de nuevo.';
  }

  private async work(name: string, run: (siteId: string) => Promise<void>): Promise<void> {
    if (this.busy()) return;
    this.busy.set(name);
    try {
      await run(this.siteId ?? '');
    } catch (error) {
      this.toast.error(this.message(error));
    } finally {
      this.busy.set('');
      await this.load();
    }
  }

  connect(): Promise<void> {
    return this.work('connect', async (siteId) => {
      window.location.href = (await firstValueFrom(this.api.connect(siteId))).url;
    });
  }
  select(property: string): Promise<void> {
    return this.work('select', async (siteId) => void (await firstValueFrom(this.api.selectProperty(siteId, property))));
  }
  sync(): Promise<void> {
    return this.work('sync', async (siteId) => {
      const result = await firstValueFrom(this.api.sync(siteId));
      if (result.status === 'failed') this.toast.error(`Google no respondió bien: ${result.error}`);
      else this.toast.success(result.days ? `${result.days} día(s) nuevos.` : 'No hay días nuevos.');
    });
  }
  disconnect(deleteData: boolean): Promise<void> {
    this.confirmDisconnect.set(false);
    return this.work('disconnect', async (siteId) => void (await firstValueFrom(this.api.disconnect(siteId, deleteData))));
  }
  analyze(): Promise<void> {
    return this.work('analyze', async (siteId) => {
      const result = await firstValueFrom(this.api.analyze(siteId));
      this.toast.success(`${result.open} oportunidad(es) abiertas${result.firstPartyData ? '' : '. Aún no hay datos suficientes de Search Console'}.`);
    });
  }
  act(item: SeoOpportunity, action: 'plan' | 'approved' | 'dismissed' | 'open' | 'done'): Promise<void> {
    return this.work('act', async (siteId) => {
      if (action === 'plan') await firstValueFrom(this.api.plan(siteId, item.id));
      else if (action === 'done') await firstValueFrom(this.api.markDone(siteId, item.id, this.doneOn));
      else await firstValueFrom(this.api.decide(siteId, item.id, action));
      this.open.set(null);
    });
  }
  saveProfile(): Promise<void> {
    return this.work('profile', async (siteId) => {
      const { profile, topics, holdout, weights } = this.form;
      // Only a custom profile carries its own weights; the others follow the product's.
      const body = { profile, priorityTopics: topics.split(',').map((topic) => topic.trim()).filter(Boolean), holdoutPercent: Number(holdout) || 0, weights: profile === 'custom' ? Object.fromEntries(Object.entries(weights).map(([key, value]) => [key, Number(value)])) : {} };
      await firstValueFrom(this.api.saveProfile(siteId, body));
      await firstValueFrom(this.api.analyze(siteId));
      this.editProfile.set(false);
      this.toast.success('Guardado. Las oportunidades se han vuelto a valorar.');
    });
  }
}
