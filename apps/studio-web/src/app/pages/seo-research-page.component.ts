import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, ElementRef, OnDestroy, computed, effect, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AppEmptyStateComponent } from '../components/ui/app-empty-state.component';
import { AppIconComponent } from '../components/ui/app-icon.component';
import { AppContextService } from '../services/app-context.service';
import { ResearchControl, ResearchEstimate, ResearchOverview, ResearchRun, ResearchTask, SeoIntelligenceApiService } from '../services/seo-intelligence-api.service';
import { ToastService } from '../services/toast.service';

const TRIGGERS: Record<string, string> = {
  onboarding: 'Alta del sitio', insufficient_opportunities: 'Faltan oportunidades', new_topic: 'Tema nuevo', new_market: 'Mercado nuevo', performance_change: 'Cambio de rendimiento', competitor_opportunity: 'Competidor nuevo',
  seasonal_event: 'Temporada', stale_evidence: 'Datos antiguos', pending_decision: 'Plan pendiente', manual: 'A mano',
};
const STATUSES: Record<string, string> = { queued: 'En cola', running: 'En curso', paused: 'En pausa', succeeded: 'Completa', partial: 'Parcial', failed: 'Fallida', cancelled: 'Cancelada' };
const TASKS: Record<string, string> = {
  inspect_site: 'Revisar el sitio', first_party: 'Datos propios', profile: 'Perfil del sitio', gaps: 'Lagunas y semillas', discover_seed: 'Descubrir palabras', competitor_keywords: 'Palabras de un competidor', own_keywords: 'Palabras del sitio',
  screen: 'Filtrar y valorar', metrics: 'Medir palabras', serp: 'Resultados de búsqueda', inventory: 'Inventario',
};
const TASK_STATUSES: Record<string, string> = { pending: 'Pendiente', running: 'En curso', succeeded: 'Hecha', skipped: 'No se compró', failed: 'Falló', cancelled: 'Cancelada' };
const REASONS: Record<string, string> = {
  enough_opportunities: 'Ya hay oportunidades de calidad suficientes.', run_limit: 'Superaba el límite de la investigación.', budget_exhausted: 'Presupuesto agotado.', unknown_price: 'Precio desconocido.', not_configured: 'Sin proveedor configurado.',
  external_disabled: 'SEO externo desactivado.', provider_disabled: 'Proveedor desactivado.', not_selected: 'Ningún proveedor elegido.', paid_automation_locked: 'La automatización de ese proveedor está bloqueada.', unsupported_market: 'Mercado no admitido.',
  billing_uncertain: 'Puede que ya se cobrara: espera confirmación.', insufficient_balance: 'Sin saldo en el proveedor.', invalid_credentials: 'Credenciales rechazadas.', not_worth_cost: 'No compensa su precio.', timeout: 'El proveedor no respondió.', retry_cooldown: 'En espera tras un fallo.',
};
const STAGES: Record<string, string> = {
  discovered: 'Descubiertas', needs_validation: 'Por validar', qualified: 'De calidad', prioritized: 'Prioritarias', reserved: 'Reservadas', scheduled: 'En el plan', published: 'Publicadas', monitoring: 'En seguimiento', refresh_candidate: 'Para refrescar',
  rejected: 'Rechazadas', superseded: 'Superadas',
};
const SOURCES: Record<string, string> = { corrected: 'Corregido por tu equipo', configured: 'Configurado', approved: 'Estrategia aprobada', observed: 'Observado', detected: 'Detectado', unknown: 'Desconocido' };
const KINDS: Record<string, string> = { new_website: 'Sitio nuevo', established: 'Consolidado', publisher: 'Medio o blog', local_business: 'Negocio local', services: 'Servicios', ecommerce: 'Tienda', multilingual: 'Varios idiomas' };
const MODES: Record<string, string> = { automatic: 'Automática, si hay motivo', manual: 'Solo cuando la pida alguien', off: 'Desactivada' };
const ERRORS: Record<string, string> = {
  research_already_running: 'Ya hay una investigación abierta.', research_run_not_controllable: 'Su estado ha cambiado: ya no admite esa acción.', research_disabled: 'La investigación está desactivada para este sitio.', invalid_corrections: 'Revisa los datos del perfil.', invalid_policy: 'Algún límite está fuera de rango.',
  forbidden: 'No tienes permiso para esta acción.',
};
const LISTS = ['topics', 'excludedTopics', 'offerings', 'revenueObjectives', 'markets', 'regions'] as const;

@Component({
  selector: 'app-seo-research-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, AppIconComponent, AppEmptyStateComponent],
  styles: [`
    .sr-table { min-width: 760px; }
    .sr-actions { display: flex; flex-wrap: wrap; align-items: end; gap: 8px; margin-top: 16px; }
    .sr-head { display: flex; flex-wrap: wrap; align-items: start; justify-content: space-between; gap: 10px; }
    .sr-facts { display: grid; grid-template-columns: auto 1fr; gap: 6px 14px; margin: 0; }
    .sr-facts dt { color: var(--au-muted); }
    .sr-facts dd { margin: 0; overflow-wrap: anywhere; }
    .sr-note { display: block; color: var(--au-muted); font-size: var(--au-fs-metadata); overflow-wrap: anywhere; }
    .sr-progress { display: grid; grid-template-columns: 4ch minmax(60px, 1fr); align-items: center; gap: 8px; min-width: 110px; }
    .sr-tasks { display: grid; gap: 10px; margin: 16px 0 0; padding: 0; list-style: none; }
    .sr-tasks li { display: grid; gap: 2px; overflow-wrap: anywhere; }
    .sr-table th.au-table__actions { text-align: right; }
  `],
  template: `
    <section class="au-page advanced-page advanced-jobs">
      <header class="au-page__header">
        <div>
          <p class="au-page__eyebrow">Auctorio / Investigación</p>
          <h1 class="au-page__title">Investigación SEO</h1>
          <p class="au-page__subtitle">Lo que se sabe de tu sitio y cuándo merece la pena saber más.</p>
        </div>
        <div class="au-page__actions">
          <button class="au-btn au-btn--primary au-btn--sm" type="button" [disabled]="!!busy() || !!overview()?.active" (click)="prepare()"><app-icon name="search"></app-icon>{{ busy() === 'estimate' ? 'Calculando…' : 'Investigar ahora' }}</button>
        </div>
      </header>

      @if (failed(); as reason) {
        <div class="au-banner au-banner--error" role="alert"><app-icon name="warning"></app-icon><span class="au-banner__text">{{ reason }}</span><button class="au-banner__action" type="button" (click)="load()">Reintentar</button></div>
      }
      @if (estimate(); as e) {
        <div class="au-banner" role="status">
          <app-icon name="info"></app-icon>
          <span class="au-banner__text">
            @if (e.acquisitions.length) { Compraría como máximo {{ purchasable(e) }} lote(s), hasta {{ e.maxUsd | number: '1.2-3' }} USD, y parará antes si ya basta. }
            @else { No hay nada que comprar: se usará solo lo guardado. }
          </span>
          <button class="au-banner__action" type="button" [disabled]="!!busy()" (click)="start()">Empezar</button>
          <button class="au-banner__action" type="button" (click)="estimate.set(null)">Cancelar</button>
        </div>
      }

      @if (overview(); as o) {
        <dl class="advanced-kpis" aria-label="Resumen de la reserva">
          <div class="au-stat" [class.advanced-stat--good]="!o.coverage.needsReplenishment"><dt class="au-stat__label">Oportunidades de calidad</dt><dd class="au-stat__value">{{ o.coverage.available }}</dd><dd class="au-stat__note">Objetivo: {{ o.coverage.wanted }}</dd></div>
          <div class="au-stat"><dt class="au-stat__label">Días cubiertos</dt><dd class="au-stat__value">{{ o.coverage.days ?? '—' }}</dd><dd class="au-stat__note">{{ o.coverage.articlesPerWeek === null ? 'Ritmo de publicación desconocido' : o.coverage.articlesPerWeek + ' artículos por semana' }}</dd></div>
          <div class="au-stat"><dt class="au-stat__label">Palabras conocidas</dt><dd class="au-stat__value">{{ known() | number }}</dd><dd class="au-stat__note">{{ o.keywords['rejected'] ?? 0 | number }} descartadas por no encajar</dd></div>
          <div class="au-stat"><dt class="au-stat__label">Gasto</dt><dd class="au-stat__value">{{ spent() | number: '1.2-3' }} USD</dd><dd class="au-stat__note">En las últimas {{ o.runs.length }} investigaciones</dd></div>
        </dl>

        <section class="au-panel au-panel--padded" aria-labelledby="sr-runs">
          <div class="advanced-card-header"><h2 class="au-panel__title" id="sr-runs">Investigaciones</h2><p>Solo compran lo que nadie ha respondido todavía, dentro de los límites.</p></div>
          @for (trigger of o.triggers; track trigger.detail) { <p class="advanced-callout">{{ triggers[trigger.trigger] ?? trigger.trigger }}: {{ trigger.detail }}</p> }
          @if (!o.runs.length) { <app-empty-state icon="search" title="Aún no hay investigaciones" text="Se inician solas cuando hay un motivo, o puedes pedir una."></app-empty-state> }
          @else {
            <div class="au-panel au-table-wrap au-table-wrap--scrollable" role="region" aria-label="Investigaciones" tabindex="0">
              <table class="au-table au-table--hover au-table--keep-columns sr-table">
                <thead><tr><th scope="col">Motivo</th><th scope="col">Estado</th><th scope="col">Progreso</th><th scope="col" class="au-num">Estimado</th><th scope="col" class="au-num">Gastado</th><th scope="col">Fecha</th><th scope="col" class="au-table__actions"><span class="au-visually-hidden">Acciones</span></th></tr></thead>
                <tbody>
                  @for (run of o.runs; track run.id) {
                    <tr [class.is-selected]="detail()?.id === run.id">
                      <td><button class="au-cell-title__name au-link-button" type="button" (click)="show(run.id)">{{ triggers[run.trigger] ?? run.trigger }}</button><span class="sr-note">{{ run.reason?.detail }}</span></td>
                      <td><span class="au-badge" [ngClass]="badge(run.status)">{{ statuses[run.status] ?? run.status }}</span>@if (run.error) { <span class="sr-note">{{ run.error }}</span> }</td>
                      <td><div class="sr-progress"><span>{{ run.progress }} %</span><div class="au-progress" role="progressbar" [attr.aria-valuenow]="run.progress" aria-valuemin="0" aria-valuemax="100" aria-label="Progreso"><span class="au-progress__bar" [style.width.%]="run.progress"></span></div></div></td>
                      <td class="au-num">{{ run.estimatedUsd === null ? '—' : (run.estimatedUsd | number: '1.2-3') }}</td>
                      <td class="au-num">{{ run.cost.actualUsd | number: '1.2-3' }}@if (run.cost.uncertain) { <span class="sr-note">{{ run.cost.uncertain }} sin confirmar</span> }</td>
                      <td>{{ run.createdAt | date: 'd/MM/y, HH:mm' }}</td>
                      <td class="au-table__actions">
                        <button class="au-btn au-btn--ghost au-btn--sm" type="button" (click)="show(run.id)">Detalle</button>
                        @for (control of controls(run.status); track control.key) { <button class="au-btn au-btn--secondary au-btn--sm" type="button" [disabled]="!!busy()" (click)="act(run.id, control.key)">{{ control.label }}</button> }
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        </section>

        <div class="advanced-grid-2 advanced-followup">
          <section class="au-panel au-panel--padded" aria-labelledby="sr-reservoir">
            <div class="advanced-card-header sr-head"><div><h2 class="au-panel__title" id="sr-reservoir">Reserva de oportunidades</h2><p>La calidad mínima no se baja para llegar al objetivo.</p></div><a class="au-btn au-btn--ghost au-btn--sm" routerLink="/studio/seo-opportunities">Ver todas</a></div>
            <table class="au-table au-table--keep-columns"><thead><tr><th scope="col">Estado</th><th scope="col" class="au-num">Oportunidades</th></tr></thead>
              <tbody>@for (stage of stageKeys; track stage) { @if (o.coverage.stages[stage]) { <tr><td>{{ stages[stage] }}</td><td class="au-num">{{ o.coverage.stages[stage] }}</td></tr> } } @empty { }</tbody></table>
            @if (o.coverage.gaps.length) { <p class="sr-note">Temas sin oportunidades: {{ o.coverage.gaps.slice(0, 12).join(', ') }}</p> }
          </section>

          <section class="au-panel au-panel--padded" aria-labelledby="sr-profile">
            <div class="advanced-card-header sr-head">
              <div><h2 class="au-panel__title" id="sr-profile">Perfil del sitio</h2><p>{{ o.profile.reviewedAt ? 'Revisado el ' + (o.profile.reviewedAt | date: 'd/MM/y') : 'Sin revisar: lo detectado puede no ser exacto' }}</p></div>
              <button class="au-btn au-btn--secondary au-btn--sm" type="button" [attr.aria-expanded]="editing()" (click)="editing.set(!editing())">{{ editing() ? 'Cerrar' : 'Corregir' }}</button>
            </div>
            @if (!editing()) {
              <dl class="sr-facts">
                <dt>Tipo</dt><dd>{{ kindLabels(o) || '—' }}</dd>
                @for (row of facts(); track row.label) { <dt>{{ row.label }}</dt><dd>{{ row.value || '—' }} <span class="sr-note">{{ sources[row.source] }}</span></dd> }
                <dt>Investigación</dt><dd>{{ modes[o.profile.policy.mode] }}, hasta {{ o.profile.policy.maxUsdPerRun | number: '1.2-2' }} USD cada una</dd>
              </dl>
              @if (!o.profile.reviewedAt) { <div class="sr-actions"><button class="au-btn au-btn--ghost au-btn--sm" type="button" [disabled]="!!busy()" (click)="review()">Está bien así</button></div> }
            } @else {
              <form (ngSubmit)="save()">
                <div class="au-field-grid">
                  <label class="au-field au-field--wide"><span class="au-field__label">Modelo de negocio</span><input class="au-input" name="businessModel" maxlength="300" [(ngModel)]="form.businessModel" /></label>
                  <label class="au-field au-field--wide"><span class="au-field__label">Público</span><input class="au-input" name="audience" maxlength="300" [(ngModel)]="form.audience" /></label>
                  @for (key of listKeys; track key) { <label class="au-field au-field--wide"><span class="au-field__label">{{ listLabels[key] }} (separados por comas)</span><input class="au-input" [name]="key" [(ngModel)]="form.lists[key]" /></label> }
                </div>
                <div class="sr-actions"><button class="au-btn au-btn--primary au-btn--sm" type="submit" [disabled]="!!busy()">Guardar perfil</button></div>
              </form>
              <form (ngSubmit)="savePolicy()">
                <div class="au-field-grid">
                  <label class="au-field"><span class="au-field__label">Investigación</span><select class="au-select" name="mode" [(ngModel)]="policy.mode">@for (mode of modeKeys; track mode) { <option [value]="mode">{{ modes[mode] }}</option> }</select></label>
                  <label class="au-field"><span class="au-field__label">Máximo por investigación (USD)</span><input class="au-input" name="maxUsdPerRun" type="number" min="0" max="2" step="0.01" [(ngModel)]="policy.maxUsdPerRun" /></label>
                  <label class="au-field"><span class="au-field__label">Días que debe cubrir la reserva</span><input class="au-input" name="targetDays" type="number" min="14" max="120" step="1" [(ngModel)]="policy.targetDays" /></label>
                  <label class="au-field"><span class="au-field__label">Calidad mínima (20–90)</span><input class="au-input" name="minScore" type="number" min="20" max="90" step="1" [(ngModel)]="policy.minScore" /></label>
                </div>
                <div class="sr-actions"><button class="au-btn au-btn--secondary au-btn--sm" type="submit" [disabled]="!!busy()">Guardar límites</button></div>
              </form>
            }
          </section>
        </div>
      } @else if (!failed()) { <div class="au-skeleton-list" aria-label="Cargando investigación">@for (row of [1, 2, 3]; track row) { <div class="au-skeleton" style="height: 52px"></div> }</div> }

      @if (detail(); as run) {
        <div class="au-drawer-backdrop" (click)="close()"></div>
        <aside class="au-drawer" role="dialog" aria-modal="true" aria-labelledby="sr-detail" (keydown.escape)="close()">
          <header class="au-drawer__head"><h2 class="au-drawer__title" id="sr-detail">{{ triggers[run.trigger] ?? run.trigger }}</h2><button #closeButton class="au-btn au-btn--ghost au-btn--sm" type="button" (click)="close()" aria-label="Cerrar detalle"><app-icon name="close"></app-icon></button></header>
          <dl class="sr-facts">
            <dt>Estado</dt><dd>{{ statuses[run.status] ?? run.status }}</dd>
            <dt>Motivo</dt><dd>{{ run.reason?.detail }}</dd>
            <dt>Límite</dt><dd>{{ run.maxUsd | number: '1.2-3' }} USD</dd>
            <dt>Gastado</dt><dd>{{ run.cost.actualUsd | number: '1.2-3' }} USD en {{ run.cost.requests }} petición(es){{ run.cost.heldUsd ? '; ' + (run.cost.heldUsd | number: '1.2-3') + ' USD retenidos' : '' }}</dd>
          </dl>
          <ol class="sr-tasks">
            @for (task of run.tasks ?? []; track task.id) {
              <li><span><strong>{{ tasks[task.kind] ?? task.kind }}</strong>@if (task.subject && task.kind !== 'metrics') { · {{ task.subject }} } <span class="au-badge" [ngClass]="badge(task.status)">{{ taskStatuses[task.status] ?? task.status }}</span></span><span class="sr-note">{{ note(task) }}</span></li>
            }
          </ol>
        </aside>
      }
    </section>
  `,
})
export class SeoResearchPageComponent implements OnDestroy {
  private readonly api = inject(SeoIntelligenceApiService);
  private readonly app = inject(AppContextService);
  private readonly toast = inject(ToastService);

  readonly triggers = TRIGGERS;
  readonly statuses = STATUSES;
  readonly tasks = TASKS;
  readonly taskStatuses = TASK_STATUSES;
  readonly stages = STAGES;
  readonly stageKeys = Object.keys(STAGES);
  readonly sources = SOURCES;
  readonly modes = MODES;
  readonly modeKeys = Object.keys(MODES);
  readonly listKeys = LISTS;
  readonly listLabels: Record<string, string> = { topics: 'Temas del negocio', excludedTopics: 'Temas excluidos', offerings: 'Productos o servicios', revenueObjectives: 'Objetivos de ingresos', markets: 'Mercados, p. ej. es-ES', regions: 'Zonas' };

  readonly overview = signal<ResearchOverview | null>(null);
  readonly detail = signal<ResearchRun | null>(null);
  readonly estimate = signal<ResearchEstimate | null>(null);
  readonly busy = signal('');
  readonly failed = signal('');
  readonly editing = signal(false);
  readonly known = computed(() => Object.values(this.overview()?.keywords ?? {}).reduce((sum, count) => sum + count, 0));
  readonly spent = computed(() => (this.overview()?.runs ?? []).reduce((sum, run) => sum + run.cost.actualUsd, 0));
  readonly facts = computed(() => {
    const profile = this.overview()?.profile;
    if (!profile) return [];
    const text = (value: unknown) => (Array.isArray(value) ? value.join(', ') : String(value ?? ''));
    return [
      { label: 'Negocio', field: profile.businessModel }, { label: 'Público', field: profile.audience }, { label: 'Temas', field: profile.topics }, { label: 'Excluidos', field: profile.excludedTopics }, { label: 'Mercados', field: profile.markets },
      { label: 'Idiomas', field: profile.languages }, { label: 'Ingresos', field: profile.revenueObjectives },
    ].map(({ label, field }) => ({ label, value: text(field.value), source: field.source }));
  });
  private readonly closeButton = viewChild<ElementRef<HTMLButtonElement>>('closeButton');
  private opener: HTMLElement | null = null;
  form: { businessModel: string; audience: string; lists: Record<string, string> } = { businessModel: '', audience: '', lists: {} };
  policy: { mode: string; maxUsdPerRun: number; targetDays: number; minScore: number } = { mode: 'automatic', maxUsdPerRun: 0.25, targetDays: 75, minScore: 40 };
  private siteId: string | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    effect(() => {
      const id = this.app.activeSite()?.id ?? null;
      if (id && id !== this.siteId) {
        this.siteId = id;
        this.overview.set(null);
        this.detail.set(null);
        this.estimate.set(null);
        void this.load();
      }
    });
    effect(() => this.closeButton()?.nativeElement.focus());
  }

  ngOnDestroy(): void {
    clearTimeout(this.timer);
  }

  badge(status: string): string {
    return status === 'succeeded' ? 'au-badge--success' : status === 'failed' ? 'au-badge--danger' : status === 'partial' || status === 'paused' || status === 'skipped' ? 'au-badge--warning' : 'au-badge--neutral';
  }
  controls(status: string): Array<{ key: ResearchControl; label: string }> {
    if (status === 'queued' || status === 'running') return [{ key: 'pause', label: 'Pausar' }, { key: 'cancel', label: 'Cancelar' }];
    if (status === 'paused') return [{ key: 'resume', label: 'Reanudar' }, { key: 'cancel', label: 'Cancelar' }];
    return status === 'failed' || status === 'partial' || status === 'cancelled' ? [{ key: 'retry', label: 'Reintentar' }] : [];
  }
  kindLabels(o: ResearchOverview): string {
    return (o.profile.kinds.value ?? []).map((kind) => KINDS[kind] ?? kind).join(', ');
  }
  purchasable(e: ResearchEstimate): number {
    return e.acquisitions.filter((entry) => !entry.blocked).length;
  }
  note(task: ResearchTask): string {
    const reason = task.reason ? (REASONS[task.reason] ?? task.reason) : '';
    const cost = task.external && task.billedUsd !== null ? `${task.billedUsd.toFixed(3)} USD` : '';
    const rows = typeof task.result?.['rows'] === 'number' ? `${task.result['rows']} palabras` : '';
    return [reason, rows, cost].filter(Boolean).join(' · ');
  }
  show(id: string): void {
    this.opener = document.activeElement as HTMLElement | null;
    const siteId = this.siteId ?? '';
    firstValueFrom(this.api.researchRun(siteId, id)).then((run) => this.detail.set(run)).catch((error) => this.toast.error(this.message(error)));
  }
  close(): void {
    this.detail.set(null);
    this.opener?.focus();
  }

  async load(): Promise<void> {
    const siteId = this.siteId;
    if (!siteId) return;
    clearTimeout(this.timer);
    try {
      const overview = await firstValueFrom(this.api.research(siteId));
      if (siteId !== this.siteId) return;
      this.failed.set('');
      this.overview.set(overview);
      if (!this.editing()) this.fill(overview);
      if (overview.active && overview.active.status !== 'paused') this.timer = setTimeout(() => void this.load(), 10_000);
    } catch (error) {
      this.failed.set(this.message(error));
    }
  }

  private fill({ profile }: ResearchOverview): void {
    const { corrections } = profile;
    this.form = { businessModel: corrections['businessModel'] as string ?? '', audience: corrections['audience'] as string ?? '', lists: Object.fromEntries(LISTS.map((key) => [key, ((corrections[key] as string[] | undefined) ?? []).join(', ')])) };
    const { mode, maxUsdPerRun, targetDays, minScore } = profile.policy;
    this.policy = { mode, maxUsdPerRun, targetDays, minScore };
  }

  private message(error: unknown): string {
    const body = error instanceof HttpErrorResponse ? error.error : null;
    const code = typeof body?.error === 'string' ? body.error : (body?.error?.code ?? '');
    return ERRORS[code] ?? 'No se pudo completar la acción. Inténtalo de nuevo.';
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

  prepare(): Promise<void> {
    return this.work('estimate', async (siteId) => this.estimate.set(await firstValueFrom(this.api.estimateResearch(siteId))));
  }
  start(): Promise<void> {
    return this.work('start', async (siteId) => {
      const { created } = await firstValueFrom(this.api.startResearch(siteId));
      this.estimate.set(null);
      this.toast.success(created ? 'Investigación en cola.' : 'Ya había una investigación abierta.');
    });
  }
  act(id: string, control: ResearchControl): Promise<void> {
    return this.work(control, async (siteId) => {
      const run = await firstValueFrom(this.api.controlResearch(siteId, id, control));
      if (this.detail()?.id === id) this.detail.set(run);
    });
  }
  review(): Promise<void> {
    return this.work('profile', async (siteId) => void (await firstValueFrom(this.api.saveResearchProfile(siteId, { reviewed: true }))));
  }
  save(): Promise<void> {
    return this.work('profile', async (siteId) => {
      const list = (text: string) => text.split(',').map((item) => item.trim()).filter(Boolean);
      // An emptied field goes back to what was detected.
      const corrections: Record<string, unknown> = { businessModel: this.form.businessModel.trim() || null, audience: this.form.audience.trim() || null };
      for (const key of LISTS) corrections[key] = list(this.form.lists[key] ?? '').length ? list(this.form.lists[key]) : null;
      await firstValueFrom(this.api.saveResearchProfile(siteId, { corrections, reviewed: true }));
      this.editing.set(false);
      this.toast.success('Perfil guardado.');
    });
  }
  savePolicy(): Promise<void> {
    return this.work('policy', async (siteId) => {
      const { mode, maxUsdPerRun, targetDays, minScore } = this.policy;
      await firstValueFrom(this.api.saveResearchPolicy(siteId, { mode, maxUsdPerRun: Number(maxUsdPerRun), targetDays: Number(targetDays), minScore: Number(minScore) }));
      this.editing.set(false);
      this.toast.success('Límites guardados.');
    });
  }
}
