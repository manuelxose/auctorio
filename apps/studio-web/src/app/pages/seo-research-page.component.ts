import { CommonModule } from '@angular/common';
import { Component, OnDestroy, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { SeoAllowanceComponent } from '../components/seo/seo-allowance.component';
import { SEO_LOCALE, RESEARCH_MODES, RESEARCH_TRIGGERS, RUN_STATUSES, RUN_TASKS, SEO_BLOCKS, SEO_STAGES, TASK_STATUSES, runBadge, seoError } from '../components/seo-labels';
import { AppEmptyStateComponent } from '../components/ui/app-empty-state.component';
import { AppDrawerDirective } from '../components/ui/app-drawer.directive';
import { AppIconComponent } from '../components/ui/app-icon.component';
import { AppContextService } from '../services/app-context.service';
import { ConfirmService } from '../services/confirm.service';
import { ResearchControl, ResearchFocus, ResearchOverview, ResearchPreview, ResearchRun, ResearchTask, SeoIntelligenceApiService } from '../services/seo-intelligence-api.service';
import { ToastService } from '../services/toast.service';

/** Research of the site: why, how much of the allowance and how it goes. Opening it asks nobody anything. */
@Component({
  selector: 'app-seo-research-page',
  standalone: true,
  providers: SEO_LOCALE,
  imports: [CommonModule, FormsModule, AppDrawerDirective, RouterLink, AppIconComponent, AppEmptyStateComponent, SeoAllowanceComponent],
  styles: [`
    .sr-table { min-width: 720px; }
    .sr-actions { display: flex; flex-wrap: wrap; align-items: end; gap: 8px; margin-top: 16px; }
    .sr-head { display: flex; flex-wrap: wrap; align-items: start; justify-content: space-between; gap: 10px; }
    .sr-facts { display: grid; grid-template-columns: auto 1fr; gap: 6px 14px; margin: 0; }
    .sr-facts dt { color: var(--au-muted); }
    .sr-facts dd { margin: 0; overflow-wrap: anywhere; }
    .sr-note { display: block; color: var(--au-muted); font-size: var(--au-fs-metadata); overflow-wrap: anywhere; }
    .sr-progress { display: grid; grid-template-columns: 6ch minmax(60px, 1fr); align-items: center; gap: 8px; min-width: 110px; }
    .sr-tasks { display: grid; gap: 10px; margin: 16px 0 0; padding: 0; list-style: none; }
    .sr-tasks li { display: grid; gap: 2px; overflow-wrap: anywhere; }
    .sr-table th.au-table__actions { text-align: right; }
    app-seo-allowance { display: block; margin-bottom: 14px; }
  `],
  template: `
    <section class="au-page advanced-page advanced-jobs">
      <header class="au-page__header">
        <div>
          <p class="au-page__eyebrow">Auctorio / Inteligencia SEO</p>
          <h1 class="au-page__title">Investigación SEO</h1>
          <p class="au-page__subtitle">Lo que se sabe de tu sitio y cuándo merece la pena saber más.</p>
        </div>
        <div class="au-page__actions">
          <a class="au-btn au-btn--ghost au-btn--sm" routerLink="/studio/settings/seo" [queryParams]="{ tab: 'research' }">Ajustes</a>
          @if (canManage()) { <button class="au-btn au-btn--primary au-btn--sm" type="button" [attr.aria-expanded]="preparing()" [disabled]="!!busy() || !!overview()?.active" (click)="preparing.set(!preparing()); preview.set(null)"><app-icon name="search"></app-icon>Pedir investigación</button> }
        </div>
      </header>

      @if (failed(); as reason) {
        <div class="au-banner au-banner--error" role="alert"><app-icon name="warning"></app-icon><span class="au-banner__text">{{ reason }}</span><button class="au-banner__action" type="button" (click)="load()">Reintentar</button></div>
      }

      @if (overview(); as o) {
        <app-seo-allowance [allowance]="o.allowance"></app-seo-allowance>

        @if (preparing() && canManage()) {
          <section class="au-panel au-panel--padded" aria-labelledby="sr-request" style="margin-bottom: 14px">
            <div class="advanced-card-header"><h2 class="au-panel__title" id="sr-request">Pedir una investigación</h2><p>Primero se calcula qué consultaría. Hasta que la confirmes no sale ninguna petición.</p></div>
            <form (ngSubmit)="prepare()">
              <div class="au-field-grid">
                <label class="au-field au-field--wide"><span class="au-field__label">Temas (hasta cinco, separados por comas; vacío: los que más falta hacen)</span><input class="au-input" name="topics" maxlength="400" [(ngModel)]="request.topics" (ngModelChange)="preview.set(null)" /></label>
                <label class="au-field"><span class="au-field__label">Mercado</span><select class="au-select" name="market" [(ngModel)]="request.market" (ngModelChange)="preview.set(null)">@for (market of o.profile.markets.value ?? []; track market; let first = $first) { <option [value]="first ? '' : market">{{ market }}{{ first ? ' (principal)' : '' }}</option> }</select></label>
              </div>
              <div class="sr-actions"><button class="au-btn au-btn--secondary au-btn--sm" type="submit" [disabled]="!!busy()">{{ busy() === 'preview' ? 'Calculando…' : 'Ver alcance' }}</button><button class="au-btn au-btn--ghost au-btn--sm" type="button" (click)="preparing.set(false); preview.set(null)">Cancelar</button></div>
            </form>
            @if (preview(); as p) {
              <div class="advanced-callout" role="status" style="margin-top: 14px">
                @if (purchasable(p)) {
                  <strong>Usará como máximo el {{ p.maxPercent }} % de la asignación.</strong>
                  <p>{{ purchasable(p) }} consulta(s) previstas, que suponen hasta el {{ p.knownPercent }} %; puede añadir mediciones hasta ese máximo y para antes si ya basta.</p>
                } @else { <strong>No consultará a ningún proveedor.</strong><p>Analizará lo guardado.{{ p.acquisitions[0]?.blocked ? ' ' + reason(p.acquisitions[0].blocked) : '' }}</p> }
                @if (p.exceedsAllowance) { <p>No queda asignación suficiente para todo: se hará lo que quepa y el resto quedará sin consultar.</p> }
                @if (p.acquisitions.length) { <ul>@for (entry of p.acquisitions; track $index) { <li>{{ tasks[entry.kind] ?? entry.kind }}: {{ entry.subject }} ({{ entry.market }}) <span class="sr-note">{{ entry.blocked ? reason(entry.blocked) : entry.reason }}</span></li> }</ul> }
              </div>
              <div class="sr-actions"><button class="au-btn au-btn--primary au-btn--sm" type="button" [disabled]="!!busy()" (click)="start()">{{ busy() === 'start' ? 'Empezando…' : 'Empezar' }}</button></div>
            }
          </section>
        }

        <dl class="advanced-kpis" aria-label="Resumen de la reserva">
          <div class="au-stat" [class.advanced-stat--good]="!o.coverage.needsReplenishment"><dt class="au-stat__label">Oportunidades de calidad</dt><dd class="au-stat__value">{{ o.coverage.available }}</dd><dd class="au-stat__note">Objetivo: {{ o.coverage.wanted }}</dd></div>
          <div class="au-stat"><dt class="au-stat__label">Días cubiertos</dt><dd class="au-stat__value">{{ o.coverage.days ?? '—' }}</dd><dd class="au-stat__note">{{ o.coverage.articlesPerWeek === null ? 'Ritmo de publicación desconocido' : o.coverage.articlesPerWeek + ' artículos por semana' }}</dd></div>
          <div class="au-stat"><dt class="au-stat__label">Palabras conocidas</dt><dd class="au-stat__value">{{ known() | number }}</dd><dd class="au-stat__note"><a routerLink="/studio/site-intelligence" [queryParams]="{ tab: 'keywords' }">Verlas</a></dd></div>
          <div class="au-stat"><dt class="au-stat__label">Evidencia más antigua</dt><dd class="au-stat__value">{{ o.coverage.freshness.oldest === null ? '—' : o.coverage.freshness.oldest }}</dd><dd class="au-stat__note">{{ o.coverage.freshness.oldest === null ? 'Sin oportunidades disponibles' : 'días, entre las disponibles' }}</dd></div>
        </dl>

        <section class="au-panel au-panel--padded" aria-labelledby="sr-runs">
          <div class="advanced-card-header"><h2 class="au-panel__title" id="sr-runs">Investigaciones</h2><p>Solo consultan lo que nadie ha respondido todavía, dentro de la asignación.</p></div>
          @for (trigger of o.triggers; track trigger.detail) { <p class="advanced-callout">{{ triggers[trigger.trigger] ?? trigger.trigger }}: {{ trigger.detail }}</p> }
          @if (!o.runs.length) { <app-empty-state icon="search" title="Aún no hay investigaciones" [text]="o.allowance.automatic ? 'Se inician solas cuando hay un motivo, o puedes pedir una.' : 'Puedes pedir una cuando haga falta.'"></app-empty-state> }
          @else {
            <div class="au-panel au-table-wrap au-table-wrap--scrollable" role="region" aria-label="Investigaciones" tabindex="0">
              <table class="au-table au-table--hover au-table--keep-columns sr-table">
                <thead><tr><th scope="col">Motivo</th><th scope="col">Estado</th><th scope="col">Progreso</th><th scope="col">Fecha</th><th scope="col" class="au-table__actions"><span class="au-visually-hidden">Acciones</span></th></tr></thead>
                <tbody>
                  @for (run of o.runs; track run.id) {
                    <tr [class.is-selected]="detail()?.id === run.id">
                      <td><button class="au-cell-title__name au-link-button" type="button" (click)="show(run.id)">{{ triggers[run.trigger] ?? run.trigger }}</button><span class="sr-note">{{ run.reason?.detail }}</span></td>
                      <td><span class="au-badge" [ngClass]="badge(run.status)">{{ statuses[run.status] ?? run.status }}</span>@if (run.error) { <span class="sr-note">{{ reason(run.error) }}</span> }</td>
                      <td><div class="sr-progress"><span>{{ run.progress }} %</span><div class="au-progress" role="progressbar" [attr.aria-valuenow]="run.progress" aria-valuemin="0" aria-valuemax="100" aria-label="Progreso"><span class="au-progress__bar" [style.width.%]="run.progress"></span></div></div></td>
                      <td>{{ run.createdAt | date: 'd/MM/y, HH:mm' }}</td>
                      <td class="au-table__actions">
                        <button class="au-btn au-btn--ghost au-btn--sm" type="button" (click)="show(run.id)">Detalle</button>
                        @if (canManage()) { @for (control of controls(run.status); track control.key) { <button class="au-btn au-btn--secondary au-btn--sm" type="button" [disabled]="!!busy()" (click)="act(run.id, control.key)">{{ control.label }}</button> } }
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
            @if (stagesShown().length) {
              <table class="au-table au-table--keep-columns" style="min-width: 0"><thead><tr><th scope="col">Estado</th><th scope="col" class="au-num">Oportunidades</th></tr></thead>
                <tbody>@for (stage of stagesShown(); track stage) { <tr><td>{{ stages[stage] }}</td><td class="au-num">{{ o.coverage.stages[stage] }}</td></tr> }</tbody></table>
            } @else { <p class="sr-note">Todavía no hay oportunidades.</p> }
            @if (o.coverage.gaps.length) { <p class="sr-note">Temas sin oportunidades: {{ o.coverage.gaps.slice(0, 12).join(', ') }}</p> }
          </section>
          <section class="au-panel au-panel--padded" aria-labelledby="sr-rules">
            <div class="advanced-card-header sr-head"><div><h2 class="au-panel__title" id="sr-rules">Cómo se investiga este sitio</h2><p>{{ o.profile.reviewedAt ? 'Perfil revisado el ' + (o.profile.reviewedAt | date: 'd/MM/y') : 'Perfil sin revisar: lo detectado puede no ser exacto' }}</p></div><a class="au-btn au-btn--secondary au-btn--sm" routerLink="/studio/settings/seo">Cambiar</a></div>
            <dl class="sr-facts">
              <dt>Automatización</dt><dd>{{ modes[o.profile.policy.mode] ?? o.profile.policy.mode }}{{ o.profile.policy.mode === 'automatic' && !o.allowance.automatic ? ' (la plataforma no la tiene permitida ahora)' : '' }}</dd>
              <dt>Temas</dt><dd>{{ (o.profile.topics.value ?? []).slice(0, 10).join(', ') || 'Sin definir' }}</dd>
              <dt>Excluidos</dt><dd>{{ (o.profile.excludedTopics.value ?? []).join(', ') || 'Ninguno' }}</dd>
              <dt>Mercados</dt><dd>{{ (o.profile.markets.value ?? []).join(', ') || 'Sin definir' }}</dd>
            </dl>
          </section>
        </div>
      } @else if (!failed()) { <div class="au-skeleton-list" aria-label="Cargando investigación">@for (row of [1, 2, 3]; track row) { <div class="au-skeleton" style="height: 52px"></div> }</div> }

      @if (detail(); as run) {
        <div class="au-drawer-backdrop" (click)="close()"></div>
        <aside class="au-drawer" appDrawer (closed)="close()" aria-labelledby="sr-detail">
          <header class="au-drawer__head"><h2 class="au-drawer__title" id="sr-detail">{{ triggers[run.trigger] ?? run.trigger }}</h2><button class="au-btn au-btn--ghost au-btn--sm" type="button" (click)="close()" aria-label="Cerrar detalle"><app-icon name="close"></app-icon></button></header>
          <dl class="sr-facts">
            <dt>Estado</dt><dd>{{ statuses[run.status] ?? run.status }}, {{ run.completedTasks }} de {{ run.totalTasks }} pasos</dd>
            <dt>Motivo</dt><dd>{{ run.reason?.detail }}</dd>
            @if (run.reason?.focus?.topics?.length) { <dt>Temas</dt><dd>{{ run.reason!.focus!.topics!.join(', ') }}</dd> }
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
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);

  readonly triggers = RESEARCH_TRIGGERS;
  readonly statuses = RUN_STATUSES;
  readonly tasks = RUN_TASKS;
  readonly taskStatuses = TASK_STATUSES;
  readonly stages = SEO_STAGES;
  readonly modes = RESEARCH_MODES;
  readonly badge = runBadge;

  readonly overview = signal<ResearchOverview | null>(null);
  readonly detail = signal<ResearchRun | null>(null);
  readonly preview = signal<ResearchPreview | null>(null);
  readonly preparing = signal(false);
  readonly busy = signal('');
  readonly failed = signal('');
  readonly canManage = computed(() => this.app.can('projects.manage'));
  readonly known = computed(() => Object.values(this.overview()?.keywords ?? {}).reduce((sum, count) => sum + count, 0));
  readonly stagesShown = computed(() => Object.keys(SEO_STAGES).filter((stage) => this.overview()?.coverage.stages[stage]));
  request = { topics: '', market: '' };
  private siteId: string | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    // Another page may ask to research one topic; it only fills the form.
    const topic = inject(ActivatedRoute).snapshot.queryParamMap.get('topic');
    if (topic) {
      this.request.topics = topic.slice(0, 80);
      this.preparing.set(true);
    }
    effect(() => {
      const id = this.app.activeSite()?.id ?? null;
      if (id && id !== this.siteId) {
        this.siteId = id;
        this.overview.set(null);
        this.detail.set(null);
        this.preview.set(null);
        void this.load();
      }
    });
  }

  ngOnDestroy(): void {
    clearTimeout(this.timer);
  }

  controls(status: string): Array<{ key: ResearchControl; label: string }> {
    if (status === 'queued' || status === 'running') return [{ key: 'pause', label: 'Pausar' }, { key: 'cancel', label: 'Cancelar' }];
    if (status === 'paused') return [{ key: 'resume', label: 'Reanudar' }, { key: 'cancel', label: 'Cancelar' }];
    return status === 'failed' || status === 'partial' || status === 'cancelled' ? [{ key: 'retry', label: 'Reintentar' }] : [];
  }
  reason(code: string | null): string {
    return code ? (SEO_BLOCKS[code] ?? code) : '';
  }
  purchasable(preview: ResearchPreview): number {
    return preview.acquisitions.filter((entry) => !entry.blocked).length;
  }
  note(task: ResearchTask): string {
    const rows = typeof task.result?.['rows'] === 'number' ? `${task.result['rows']} palabras` : '';
    return [this.reason(task.reason), rows].filter(Boolean).join(' · ');
  }
  show(id: string): void {
    firstValueFrom(this.api.researchRun(this.siteId ?? '', id)).then((run) => this.detail.set(run)).catch((error) => this.toast.error(seoError(error)));
  }
  close(): void {
    this.detail.set(null);
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
      if (overview.active && overview.active.status !== 'paused') this.timer = setTimeout(() => void this.load(), 10_000);
    } catch (error) {
      this.failed.set(seoError(error));
    }
  }

  private async work(name: string, run: (siteId: string) => Promise<void>): Promise<void> {
    if (this.busy()) return;
    this.busy.set(name);
    try {
      await run(this.siteId ?? '');
    } catch (error) {
      this.toast.error(seoError(error));
    } finally {
      this.busy.set('');
      await this.load();
    }
  }

  private focus(): ResearchFocus {
    const topics = this.request.topics.split(',').map((topic) => topic.trim()).filter(Boolean).slice(0, 5);
    return { ...(topics.length ? { topics } : {}), ...(this.request.market ? { market: this.request.market } : {}) };
  }

  prepare(): Promise<void> {
    return this.work('preview', async (siteId) => this.preview.set(await firstValueFrom(this.api.previewResearch(siteId, this.focus()))));
  }
  start(): Promise<void> {
    return this.work('start', async (siteId) => {
      const { created } = await firstValueFrom(this.api.startResearch(siteId, this.focus()));
      this.preview.set(null);
      this.preparing.set(false);
      this.toast.success(created ? 'Investigación en cola.' : 'Ya había una investigación abierta.');
    });
  }
  async act(id: string, control: ResearchControl): Promise<void> {
    if (control === 'cancel' && !(await this.confirm.confirm({ title: '¿Cancelar la investigación?', message: 'No sale nada más. Lo que ya se había pedido termina y cuenta en la asignación.', confirmLabel: 'Cancelar investigación', cancelLabel: 'Volver', danger: true }))) return;
    await this.work(control, async (siteId) => {
      const run = await firstValueFrom(this.api.controlResearch(siteId, id, control));
      if (this.detail()?.id === id) this.detail.set(run);
    });
  }
}
