import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, effect, inject, signal } from '@angular/core';
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
  styleUrls: ['./site-intelligence-profile.css', './site-intelligence-sections.css', './competitors-page.component.css'],
  styles: [`
    .so-list { display: grid; gap: 12px; padding: 16px; }
    .so-item { display: grid; gap: 8px; min-width: 0; }
    .so-item p, .so-item li, .so-item h3 { overflow-wrap: anywhere; margin: 0; }
    .so-detail { display: grid; gap: 12px; }
    .so-detail ul { margin: 4px 0 0; padding-left: 18px; }
    .so-detail h4 { margin: 0; font-size: 13px; }
    .so-kind { color: var(--au-text-muted, #666); font-size: 12px; }
    .so-fields { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(min(220px, 100%), 1fr)); padding: 16px; }
    .so-pad { padding: 0 16px 16px; display: grid; gap: 8px; }
  `],
  template: `
    <section class="au-page profile-reference cp-page">
      <header class="page-head">
        <div>
          <p class="overline">Auctorio / Investigación</p>
          <h1>Oportunidades SEO</h1>
          <p>Qué hacer en tu sitio, con qué datos se decide y con cuánta confianza.</p>
        </div>
        <div class="head-actions">
          <button class="btn small primary" type="button" [disabled]="!!busy()" (click)="analyze()"><app-icon name="refresh"></app-icon>{{ busy() === 'analyze' ? 'Analizando…' : 'Analizar ahora' }}</button>
        </div>
      </header>

      <div class="stack">
        @if (connection(); as c) {
          <section class="card" aria-label="Search Console">
            <div class="card-header">
              <div>
                <h2>Search Console</h2>
                <p>{{ connectionLabel(c) }}@if (c.property) { · {{ c.property }} }</p>
              </div>
              <div class="cp-actions">
                @if (c.status === 'active') {
                  <button class="btn small" type="button" [disabled]="!!busy() || c.syncing" (click)="sync()">{{ busy() === 'sync' || c.syncing ? 'Sincronizando…' : 'Sincronizar' }}</button>
                  <button class="btn small ghost" type="button" [disabled]="!!busy()" (click)="confirmDisconnect.set(!confirmDisconnect())" [attr.aria-expanded]="confirmDisconnect()">Desconectar</button>
                } @else {
                  <button class="btn small primary" type="button" [disabled]="!!busy() || !c.configured" (click)="connect()">{{ c.status === 'not_connected' ? 'Conectar Search Console' : 'Volver a conectar' }}</button>
                }
              </div>
            </div>
            <div class="so-pad">
              @if (!c.configured) { <p>La plataforma no tiene configurado el acceso a Google. Un administrador debe añadirlo en el servidor.</p> }
              @if (c.syncedThrough) {
                <p>Datos del {{ c.syncedFrom | date: 'd/MM/y' }} al {{ c.syncedThrough | date: 'd/MM/y' }}{{ c.backfillComplete ? '' : ' (descargando el historial)' }}. Google publica los datos definitivos con dos o tres días de retraso{{ (c.dataAgeDays ?? 0) > 5 ? '; estos tienen ' + c.dataAgeDays + ' días' : '' }}.</p>
              }
              @if (c.lastError) { <p class="au-error" role="alert">Último error: {{ c.lastError }}. {{ c.nextSyncAt ? 'Próximo intento: ' + (c.nextSyncAt | date: 'd/MM/y, HH:mm') : 'No se reintentará hasta que vuelvas a conectar.' }}</p> }
              @if (c.status === 'pending_property') {
                @if (properties().length) {
                  <div class="cp-actions">
                    @for (item of properties(); track item.property) { <button class="btn small" type="button" [disabled]="!!busy()" (click)="select(item.property)">{{ item.property }}</button> }
                  </div>
                } @else { <p>La cuenta de Google no tiene ninguna propiedad verificada de este dominio.</p> }
              }
              @if (confirmDisconnect()) {
                <div class="cp-actions" role="group" aria-label="Confirmar desconexión">
                  <button class="btn small" type="button" (click)="disconnect(false)">Desconectar y conservar los datos</button>
                  <button class="btn small cp-danger" type="button" (click)="disconnect(true)">Desconectar y borrar los datos</button>
                </div>
              }
            </div>
          </section>
        }

        <section class="card">
          <div class="card-header">
            <div><h2>Oportunidades</h2><p>La puntuación ordena el trabajo; no es una probabilidad de posicionar.</p></div>
            <select class="input filter-select" aria-label="Estado" [ngModel]="status()" (ngModelChange)="status.set($event)">
              @for (key of statusKeys; track key) { <option [value]="key">{{ statuses[key] }} ({{ count(key) }})</option> }
            </select>
          </div>
          @if (failed(); as reason) { <p class="au-error so-pad" role="alert">{{ reason }}</p> }
          @else if (loaded() && !shown().length) {
            <app-empty-state icon="competency" title="Nada en este estado" [text]="items().length ? 'Cambia el estado para ver las demás.' : 'Conecta Search Console o analiza el sitio para encontrar oportunidades.'"></app-empty-state>
          }
          <div class="so-list">
            @for (item of shown(); track item.id) {
              <article class="mini-card so-item">
                <div class="cp-actions">
                  <span class="badge ok">{{ actions[item.explanation?.action?.proposed ?? item.action] ?? item.action }}</span>
                  <span class="badge">Puntuación {{ item.score ?? 'desconocida' }}</span>
                  <span class="badge" [class.warning]="(item.confidence ?? 0) < 50">Confianza {{ item.confidence ?? 'desconocida' }}</span>
                  <span class="badge">Esfuerzo {{ efforts[item.explanation?.effort ?? ''] ?? 'desconocido' }}</span>
                </div>
                <h3>{{ item.topic }}</h3>
                @if (item.targetUrl) { <a class="muted-sm" [href]="item.targetUrl" target="_blank" rel="noopener noreferrer">{{ item.targetUrl }}</a> }
                <p>{{ item.explanation?.why }}</p>
                @for (guard of item.explanation?.safeguards ?? []; track guard.code) { <p class="so-kind">{{ guard.detail }}</p> }
                <div class="form-footer">
                  <button class="btn small" type="button" [attr.aria-expanded]="open() === item.id" (click)="open.set(open() === item.id ? null : item.id)">Por qué</button>
                  @if (item.status === 'open') {
                    @if (item.action === 'create_content' || item.action === 'strengthen_cluster') {
                      <button class="btn small primary" type="button" [disabled]="!!busy()" (click)="act(item, 'plan')">Llevar al plan</button>
                    } @else {
                      <button class="btn small primary" type="button" [disabled]="!!busy()" (click)="act(item, 'approved')">Aprobar</button>
                    }
                    <button class="btn small ghost" type="button" [disabled]="!!busy()" (click)="act(item, 'dismissed')">Descartar</button>
                  }
                  @if (item.status === 'approved') {
                    <input class="input filter-select" type="date" aria-label="Fecha del cambio" [max]="today" [(ngModel)]="doneOn" />
                    <button class="btn small primary" type="button" [disabled]="!!busy() || !doneOn" (click)="act(item, 'done')">Marcar como hecha</button>
                    <button class="btn small ghost" type="button" [disabled]="!!busy()" (click)="act(item, 'open')">Reabrir</button>
                  }
                  @if (item.status === 'dismissed') { <button class="btn small ghost" type="button" [disabled]="!!busy()" (click)="act(item, 'open')">Reabrir</button> }
                </div>
                @if (open() === item.id ? item.explanation : null; as why) {
                  <div class="profile-extra so-detail">
                    <div><h4>Por qué esta acción</h4><p>{{ why.action.reason }}</p></div>
                    <div><h4>Datos</h4><ul>@for (entry of why.evidence; track $index) { <li>{{ entry.metric }}: <strong>{{ entry.value ?? 'sin dato' }}</strong> <span class="so-kind">{{ data[entry.kind] }}{{ entry.period ? ' · ' + entry.period : '' }}{{ entry.note ? ' · ' + entry.note : '' }}</span></li> }</ul></div>
                    <div><h4>Puntuación ({{ why.score.coverage * 100 | number: '1.0-0' }} % conocido)</h4><ul>@for (part of why.factors; track part.key) { <li>{{ factors[part.key] }}: <strong>{{ part.value === null ? 'desconocido' : (part.value * 100 | number: '1.0-0') + ' %' }}</strong> <span class="so-kind">{{ data[part.kind] }} · {{ part.detail }}</span></li> }</ul></div>
                    <div><h4>Confianza</h4><ul>@for (reason of why.confidence.reasons; track $index) { <li>{{ reason }}</li> }</ul></div>
                    @if (why.expected.clicks28d !== null) { <div><h4>Estimación</h4><p>Unos {{ why.expected.clicks28d | number }} clics más en 28 días {{ why.expected.scenario }}. Es un escenario, no una promesa.</p></div> }
                    @if (why.risks.length) { <div><h4>Riesgos</h4><ul>@for (risk of why.risks; track $index) { <li>{{ risk }}</li> }</ul></div> }
                    <p class="so-kind">{{ why.externalData.detail }}</p>
                    @for (action of item.actions; track action.actedAt) {
                      <div>
                        <h4>Resultado observado (cambio del {{ action.actedAt | date: 'd/MM/y' }})</h4>
                        @for (result of evaluations(action.evaluations); track result.window) {
                          <p>{{ result.window }} días: {{ result.pre.clicks | number }} → {{ result.post.clicks | number }} clics. {{ outcomes[result.outcome] }}</p>
                          <p class="so-kind">{{ result.uncertainty.join(' ') }}</p>
                        } @empty { <p>Aún no hay 28 días completos que comparar.</p> }
                      </div>
                    }
                  </div>
                }
              </article>
            }
          </div>
        </section>

        @if (profile(); as p) {
          <section class="card">
            <div class="card-header"><div><h2>Qué valora este sitio</h2><p>{{ p.chosen ? 'Elegido por tu equipo' : 'Deducido del tipo de sitio: confírmalo o cámbialo' }}</p></div>
              <button class="btn small" type="button" [attr.aria-expanded]="editProfile()" (click)="editProfile.set(!editProfile())">{{ editProfile() ? 'Cerrar' : 'Cambiar' }}</button>
            </div>
            @if (!editProfile()) { <div class="so-pad"><p>{{ profiles[p.profile] }}</p></div> }
            @else {
              <form (ngSubmit)="saveProfile()">
                <div class="so-fields">
                  <label class="profile-field"><span>Tipo de negocio</span><select class="input" name="profile" [(ngModel)]="form.profile">@for (key of p.profiles; track key) { <option [value]="key">{{ profiles[key] }}</option> }</select></label>
                  <label class="profile-field"><span>Temas prioritarios (separados por comas)</span><input class="input" name="topics" [(ngModel)]="form.topics" /></label>
                  <label class="profile-field"><span>Páginas de control sin tocar (%)</span><input class="input" name="holdout" type="number" min="0" max="30" step="1" [(ngModel)]="form.holdout" /></label>
                  @if (form.profile === 'custom') {
                    @for (key of factorKeys; track key) { <label class="profile-field"><span>{{ factors[key] }} (peso 0–3)</span><input class="input" [name]="key" type="number" min="0" max="3" step="0.1" [(ngModel)]="form.weights[key]" /></label> }
                  }
                </div>
                <div class="so-pad"><div class="cp-actions"><button class="btn small primary" type="submit" [disabled]="!!busy()">Guardar</button></div></div>
              </form>
            }
          </section>
        }
      </div>
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
  readonly shown = computed(() => this.items().filter((item) => item.status === this.status()));
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
        void this.load();
      }
    });
  }

  connectionLabel(c: SearchConsoleStatus): string {
    return CONNECTION[c.status] ?? c.status;
  }
  count(status: string): number {
    return this.items().filter((item) => item.status === status).length;
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
