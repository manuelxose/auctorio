import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { AdminSeoOpsApiService, ResearchHold, ResearchOperationDetail, ResearchOperations } from '../../services/admin-seo-ops-api.service';
import { ConfirmService } from '../../services/confirm.service';
import { ResearchControl } from '../../services/seo-intelligence-api.service';
import { ToastService } from '../../services/toast.service';
import { SEO_LOCALE, RESEARCH_TRIGGERS, RUN_STATUSES, RUN_TASKS, SEO_BLOCKS, TASK_STATUSES, runBadge, seoError } from '../seo-labels';
import { AppEmptyStateComponent } from '../ui/app-empty-state.component';
import { AppDrawerDirective } from '../ui/app-drawer.directive';
import { AppIconComponent } from '../ui/app-icon.component';
import { AppPagerComponent } from '../ui/app-pager.component';

/** Research of every workspace: state, cost and control. */
@Component({
  selector: 'app-seo-research-operations',
  standalone: true,
  providers: SEO_LOCALE,
  imports: [CommonModule, FormsModule, AppDrawerDirective, AppIconComponent, AppEmptyStateComponent, AppPagerComponent],
  styles: [`
    :host { display: grid; gap: 14px; }
    :host > * { margin-block: 0 !important; min-width: 0; }
    .note { display: block; color: var(--au-muted); font-size: var(--au-fs-metadata); overflow-wrap: anywhere; }
    .facts { display: grid; grid-template-columns: auto 1fr; gap: 6px 14px; margin: 0; }
    .facts dt { color: var(--au-muted); }
    .facts dd { margin: 0; overflow-wrap: anywhere; }
    .tasks { display: grid; gap: 10px; margin: 16px 0 0; padding: 0; list-style: none; }
    .tasks li { overflow-wrap: anywhere; }
    .form { display: flex; flex-wrap: wrap; gap: 8px; align-items: end; }
    .form .au-field { flex: 1 1 180px; }
    table { min-width: 980px; }
  `],
  template: `
    @if (failed(); as reason) { <div class="au-banner au-banner--error" role="alert"><app-icon name="warning"></app-icon><span class="au-banner__text">{{ reason }}</span><button class="au-banner__action" type="button" (click)="load(1)">Reintentar</button></div> }
    @if (data(); as d) {
      <dl class="advanced-kpis" aria-label="Estado de la investigación">
        <div class="au-stat"><dt class="au-stat__label">En curso</dt><dd class="au-stat__value">{{ d.counts['running'] ?? 0 }}</dd><dd class="au-stat__note">{{ d.counts['queued'] ?? 0 }} en cola · {{ d.counts['paused'] ?? 0 }} en pausa</dd></div>
        <div class="au-stat"><dt class="au-stat__label">Fallidas</dt><dd class="au-stat__value">{{ d.counts['failed'] ?? 0 }}</dd><dd class="au-stat__note">{{ d.counts['partial'] ?? 0 }} parciales</dd></div>
        <div class="au-stat"><dt class="au-stat__label">Reservado ahora (USD)</dt><dd class="au-stat__value">{{ d.reserved.heldUsd | number: '1.2-4' }}</dd><dd class="au-stat__note">{{ d.reserved.inFlight }} peticiones en vuelo · {{ d.reserved.uncertain }} sin confirmar</dd></div>
        <div class="au-stat" [class.advanced-stat--warning]="!workersAlive(d)"><dt class="au-stat__label">Workers</dt><dd class="au-stat__value">{{ workersAlive(d) }} / {{ d.workers.length }}</dd><dd class="au-stat__note">{{ d.control.automaticResearch ? 'Pueden empezar solos' : 'Solo lo que pide una persona o el alta' }}</dd></div>
      </dl>

      <section class="au-panel au-panel--padded advanced-jobs" aria-labelledby="ro-runs">
        <div class="advanced-card-header"><h2 class="au-panel__title" id="ro-runs">Investigaciones</h2><p>Pausar o cancelar impide que salga nada más. Lo que ya se envió termina y se contabiliza cuando llega.</p></div>
        <div class="au-toolbar advanced-filter-bar" role="search">
          <select class="au-select" aria-label="Estado" [(ngModel)]="filters.status" (ngModelChange)="load(1)"><option value="">Todos los estados</option>@for (entry of statusList; track entry[0]) { <option [value]="entry[0]">{{ entry[1] }} ({{ d.counts[entry[0]] ?? 0 }})</option> }</select>
          <select class="au-select" aria-label="Workspace" [(ngModel)]="filters.tenantId" (ngModelChange)="filters.siteId = ''; load(1)"><option value="">Todos los workspaces</option>@for (tenant of d.targets.tenants; track tenant.id) { <option [value]="tenant.id">{{ tenant.name }}</option> }</select>
          <select class="au-select" aria-label="Sitio" [(ngModel)]="filters.siteId" (ngModelChange)="load(1)"><option value="">Todos los sitios</option>@for (site of sites(d); track site.id) { <option [value]="site.id">{{ site.name }}</option> }</select>
          <button class="au-btn au-btn--ghost au-btn--sm" type="button" [disabled]="!!busy()" (click)="load(d.page)"><app-icon name="refresh"></app-icon>Actualizar</button>
        </div>
        @if (!d.items.length) { <app-empty-state icon="search" title="Ninguna investigación coincide" text="Cambia los filtros. Las investigaciones aparecen aquí en cuanto se piden."></app-empty-state> }
        @else {
          <div class="au-panel au-table-wrap au-table-wrap--scrollable" role="region" aria-label="Investigaciones" tabindex="0"><table class="au-table au-table--hover au-table--keep-columns">
            <thead><tr><th scope="col">Sitio</th><th scope="col">Motivo</th><th scope="col">Estado</th><th scope="col">Progreso</th><th scope="col" class="au-num">Gastado</th><th scope="col" class="au-num">Reservado</th><th scope="col" class="au-num">Queda (estimado)</th><th scope="col">Fecha</th><th scope="col" class="au-table__actions"><span class="au-visually-hidden">Acciones</span></th></tr></thead>
            <tbody>@for (run of d.items; track run.id) {
              <tr><td>{{ run.site ?? 'Sitio borrado' }}<span class="note">{{ run.tenant ?? 'Workspace borrado' }}</span></td><td>{{ triggers[run.trigger] ?? run.trigger }}<span class="note">{{ run.detail }}</span></td>
                <td><span class="au-badge" [ngClass]="badge(run.status)">{{ statuses[run.status] ?? run.status }}</span>@if (run.error) { <span class="note">{{ blocks[run.error] ?? run.error }}</span> }</td><td>{{ run.progress }} %</td>
                <td class="au-num">{{ run.cost.actualUsd | number: '1.2-4' }}<span class="note">máx. {{ run.maxUsd | number: '1.2-2' }}</span></td><td class="au-num">{{ run.cost.heldUsd | number: '1.2-4' }}</td><td class="au-num">{{ run.remainingUsd === null ? 'Sin estimar' : (run.remainingUsd | number: '1.2-4') }}</td><td>{{ run.createdAt | date: 'd/MM/y, HH:mm' }}</td>
                <td class="au-table__actions"><button class="au-btn au-btn--ghost au-btn--sm" type="button" (click)="show(run.id)">Detalle</button>@for (control of controls(run.status); track control.key) { <button class="au-btn au-btn--secondary au-btn--sm" type="button" [disabled]="!!busy()" (click)="act(run.id, control.key)">{{ control.label }}</button> }</td></tr> }</tbody>
          </table></div>
          <app-pager [page]="d.page" [pages]="d.pages" label="investigaciones" (go)="load($event)"></app-pager>
        }
      </section>

      <div class="advanced-grid-2">
        <section class="au-panel au-panel--padded" aria-labelledby="ro-holds">
          <div class="advanced-card-header"><h2 class="au-panel__title" id="ro-holds">Investigación automática desactivada</h2><p>Por workspace o por sitio. No empieza nada por sí solo; lo que pida una persona sigue su curso y lo ya abierto no se cancela.</p></div>
          @for (hold of d.holds; track hold.id) { <div class="au-row"><span class="au-row__title">{{ hold.scope === 'tenant' ? 'Workspace' : 'Sitio' }}: {{ hold.name ?? hold.scopeId }}</span><span class="au-row__meta">{{ hold.reason }} · {{ hold.createdAt | date: 'd/MM/y' }}</span><button class="au-btn au-btn--sm" type="button" [disabled]="!!busy()" (click)="lift(hold)">Volver a permitir</button></div> } @empty { <p class="note">Ninguna.</p> }
          <form class="form au-mt-3" (ngSubmit)="holdNow()">
            <label class="au-field"><span class="au-field__label">Ámbito</span><select class="au-select" name="scope" [(ngModel)]="draft.scope" (ngModelChange)="draft.scopeId = ''"><option value="site">Sitio</option><option value="tenant">Workspace</option></select></label>
            <label class="au-field"><span class="au-field__label">Cuál</span><select class="au-select" name="scopeId" required [(ngModel)]="draft.scopeId"><option value="" disabled>Elige…</option>@for (target of draft.scope === 'tenant' ? d.targets.tenants : d.targets.sites; track target.id) { <option [value]="target.id">{{ target.name }}</option> }</select></label>
            <label class="au-field"><span class="au-field__label">Motivo</span><input class="au-input" name="reason" maxlength="300" required [(ngModel)]="draft.reason" /></label>
            <button class="au-btn au-btn--secondary" type="submit" [disabled]="!!busy() || !draft.scopeId || !draft.reason.trim()">Desactivar</button>
          </form>
        </section>
        <section class="au-panel au-panel--padded" aria-labelledby="ro-workers">
          <div class="advanced-card-header"><h2 class="au-panel__title" id="ro-workers">Workers y proveedores</h2><p>Un proveedor se suspende en la pestaña Proveedores; no vuelve a recibir peticiones hasta activarlo.</p></div>
          @for (worker of d.workers; track worker.name) { <div class="au-row"><span class="au-row__title">{{ worker.name }}</span><span class="au-badge" [ngClass]="worker.status === 'running' && !worker.stale ? 'au-badge--success' : 'au-badge--danger'">{{ worker.stale ? 'Sin señal' : worker.status === 'running' ? 'En marcha' : 'Parado' }}</span><span class="au-row__meta">última señal {{ worker.lastBeatAt | date: 'd/MM/y, HH:mm' }}</span></div> } @empty { <p class="note">Ningún worker de investigación ha dado señal todavía.</p> }
          @for (provider of d.control.providers; track provider.id) { <div class="au-row"><span class="au-row__title">{{ provider.label }}</span><span class="au-badge" [ngClass]="!provider.enabled ? 'au-badge--neutral' : provider.circuit ? 'au-badge--warning' : 'au-badge--success'">{{ !provider.enabled ? 'Suspendido' : provider.circuit ? 'En pausa por fallos' : 'Recibe peticiones' }}</span></div> }
        </section>
      </div>
    } @else if (!failed()) { <div class="au-skeleton-list" aria-label="Cargando operaciones">@for (row of [1, 2, 3]; track row) { <div class="au-skeleton" style="height: 72px"></div> }</div> }

    @if (detail(); as item) {
      <div class="au-drawer-backdrop" (click)="close()"></div>
      <aside class="au-drawer" appDrawer (closed)="close()" aria-labelledby="ro-detail">
        <header class="au-drawer__head"><h2 class="au-drawer__title" id="ro-detail">{{ triggers[item.run.trigger] ?? item.run.trigger }}</h2><button class="au-btn au-btn--ghost au-btn--sm" type="button" (click)="close()" aria-label="Cerrar detalle"><app-icon name="close"></app-icon></button></header>
        <dl class="facts">
          <dt>Estado</dt><dd>{{ statuses[item.run.status] ?? item.run.status }}</dd>
          <dt>Límite</dt><dd>{{ item.run.maxUsd | number: '1.2-4' }} USD</dd>
          <dt>Gastado</dt><dd>{{ item.run.cost.actualUsd | number: '1.2-4' }} USD en {{ item.run.cost.requests }} peticiones; {{ item.run.cost.heldUsd | number: '1.2-4' }} USD reservados</dd>
          <dt>En vuelo</dt><dd>{{ item.inFlight }}{{ item.inFlight ? ': ya salieron y terminarán aunque se pause o cancele' : '' }}</dd>
          <dt>Id</dt><dd>{{ item.run.id }}</dd>
        </dl>
        <ol class="tasks">@for (task of item.run.tasks; track task.id) { <li><strong>{{ tasks[task.kind] ?? task.kind }}</strong>@if (task.subject) { · {{ task.subject }} } <span class="au-badge" [ngClass]="badge(task.status)">{{ taskStatuses[task.status] ?? task.status }}</span><span class="note">{{ task.reason ? (blocks[task.reason] ?? task.reason) : '' }}{{ task.billedUsd !== null && task.external ? ' ' + task.billedUsd + ' USD' : '' }}</span></li> }</ol>
      </aside>
    }
  `,
})
export class SeoResearchOperationsComponent implements OnInit {
  private readonly api = inject(AdminSeoOpsApiService);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);

  readonly triggers = RESEARCH_TRIGGERS;
  readonly statuses = RUN_STATUSES;
  readonly statusList = Object.entries(RUN_STATUSES);
  readonly tasks = RUN_TASKS;
  readonly taskStatuses = TASK_STATUSES;
  readonly blocks = SEO_BLOCKS;
  readonly badge = runBadge;
  readonly data = signal<ResearchOperations | null>(null);
  readonly detail = signal<ResearchOperationDetail | null>(null);
  readonly busy = signal('');
  readonly failed = signal('');
  filters = { status: '', tenantId: '', siteId: '' };
  draft: { scope: 'tenant' | 'site'; scopeId: string; reason: string } = { scope: 'site', scopeId: '', reason: '' };

  ngOnInit(): void {
    void this.load(1);
  }

  workersAlive(d: ResearchOperations): number {
    return d.workers.filter((worker) => worker.status === 'running' && !worker.stale).length;
  }
  sites(d: ResearchOperations) {
    return d.targets.sites.filter((site) => !this.filters.tenantId || site.tenantId === this.filters.tenantId);
  }
  controls(status: string): Array<{ key: ResearchControl; label: string }> {
    if (status === 'queued' || status === 'running') return [{ key: 'pause', label: 'Pausar' }, { key: 'cancel', label: 'Cancelar' }];
    if (status === 'paused') return [{ key: 'resume', label: 'Reanudar' }, { key: 'cancel', label: 'Cancelar' }];
    return status === 'failed' || status === 'partial' || status === 'cancelled' ? [{ key: 'retry', label: 'Reintentar' }] : [];
  }

  async load(page: number): Promise<void> {
    try {
      this.data.set(await firstValueFrom(this.api.research({ ...this.filters, page })));
      this.failed.set('');
    } catch (error) {
      this.failed.set(seoError(error, 'No se han podido cargar las operaciones de investigación.'));
    }
  }

  show(id: string): void {
    firstValueFrom(this.api.researchRun(id)).then((detail) => this.detail.set(detail)).catch((error) => this.toast.error(seoError(error)));
  }
  close(): void {
    this.detail.set(null);
  }

  private async work(name: string, message: string, run: () => Promise<unknown>): Promise<void> {
    if (this.busy()) return;
    this.busy.set(name);
    try {
      await run();
      this.toast.success(message);
    } catch (error) {
      this.toast.error(seoError(error));
    } finally {
      this.busy.set('');
      await this.load(this.data()?.page ?? 1);
    }
  }

  async act(id: string, control: ResearchControl): Promise<void> {
    const messages: Record<ResearchControl, string> = { pause: 'En pausa.', resume: 'Reanudada.', cancel: 'Cancelada.', retry: 'Se reintentará lo que no se hizo.' };
    if (control === 'cancel' && !(await this.confirm.confirm({ title: '¿Cancelar esta investigación?', message: 'No sale nada más. Las peticiones que ya salieron terminan y se cobran y contabilizan con normalidad.', confirmLabel: 'Cancelar investigación', cancelLabel: 'Volver', danger: true }))) return;
    if (control === 'retry' && !(await this.confirm.confirm({ title: '¿Reintentar lo que falló?', message: 'Vuelve a la cola y puede comprar lo que no se hizo, dentro del límite de la investigación y de todos los presupuestos. Lo ya hecho no se repite.', confirmLabel: 'Reintentar', cancelLabel: 'Volver' }))) return;
    await this.work(control, messages[control], () => firstValueFrom(this.api.controlResearch(id, control)));
  }
  holdNow(): Promise<void> {
    const { scope, scopeId, reason } = this.draft;
    return this.work('hold', 'Investigación automática desactivada.', async () => {
      await firstValueFrom(this.api.hold(scope, scopeId, reason.trim()));
      this.draft = { scope, scopeId: '', reason: '' };
    });
  }
  lift(hold: ResearchHold): Promise<void> {
    return this.work('lift', 'Vuelve a estar permitida.', () => firstValueFrom(this.api.liftHold(hold.id)));
  }
}
