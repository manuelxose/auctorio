import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AdminApiService, AdminSeoBudgetKey, AdminSeoGovernor, AdminSeoLedger, AdminSeoUse } from '../services/admin-api.service';
import { ConfirmService } from '../services/confirm.service';
import { ToastService } from '../services/toast.service';
import { AdminSeoOpsApiService, EffectiveBudget, Exhaustion } from '../services/admin-seo-ops-api.service';
import { SEO_LOCALE, SEO_BLOCKS, SEO_CAPABILITY_LABELS, seoError } from './seo-labels';
import { AppPagerComponent } from './ui/app-pager.component';

const SCOPES: Record<string, string> = { global: 'Plataforma', provider: 'Proveedor', plan: 'Plan (por workspace)', tenant: 'Workspace', site: 'Sitio' };
const PERIODS: Record<string, string> = { daily: 'al día', monthly: 'al mes', total: 'en total' };
const ALLOWANCES: Record<string, string> = { any: '', onboarding: 'alta', recurring: 'recurrente' };
const PRICE_STATUS: Record<string, string> = { known: 'conocido', admin_ceiling: 'tope del administrador', unknown: 'desconocido: no se gasta', suspect: 'facturó de más: no se gasta', review_due: 'conviene revisarlo' };
const STATES: Record<string, string> = { reserved: 'reservada', dispatched: 'en curso', settled: 'liquidada', released: 'liberada', uncertain: 'sin confirmar' };

/** Cost Governor: emergency stop, hard budgets, use, authorizations, prices, unknown bills and ledger (platform admins). */
@Component({
  selector: 'app-seo-governor-settings',
  standalone: true,
  providers: SEO_LOCALE,
  imports: [CommonModule, FormsModule, AppPagerComponent],
  styles: ['.au-row { flex-wrap: wrap; } .au-row__title { min-width: 180px; } .au-row__meta { white-space: normal; } .num { width: 100px; } .sel { width: 190px; } .scroll { overflow-x: auto; }'],
  template: `
    <div class="au-banner au-banner--error" role="alert" *ngIf="failed"><span class="au-banner__text">No se han podido cargar los presupuestos SEO.</span><button class="au-banner__action" type="button" (click)="load()">Reintentar</button></div>
    <div class="au-skeleton-list" aria-label="Cargando presupuestos" *ngIf="!data && !failed"><div class="au-skeleton" style="height: 120px"></div></div>
    <ng-container *ngIf="data as d">
      <section class="au-panel au-panel--padded">
        <h2 class="au-panel__title">Presupuestos en uso</h2>
        <p class="au-panel__subtitle au-mb-3">Límites duros: se aplican todos a la vez. Al agotarse uno se siguen usando los datos guardados y no se compra nada hasta que se renueve.</p>
        <div class="au-row"><input class="au-input au-flex-1" type="search" [(ngModel)]="useSearch" (ngModelChange)="usePage = 1" name="use-search" placeholder="Buscar workspace, sitio o proveedor…" aria-label="Buscar presupuesto" /><span class="au-row__meta">{{ useRows().length }} de {{ d.use.length }}</span></div>
        <div class="scroll"><table class="au-table">
          <thead><tr><th>Presupuesto</th><th>Límite (USD)</th><th>Gastado</th><th>Reservado</th><th>Queda</th><th></th></tr></thead>
          <tbody><tr *ngFor="let b of useRows().slice((usePage - 1) * 25, usePage * 25); trackBy: trackUse">
            <td>{{ label(b) }}</td>
            <td><input class="au-input num" type="number" min="0" step="0.01" [ngModel]="b.limitUsd" (change)="setLimit(b, $event)" [name]="'l-' + trackUse(0, b)" [attr.aria-label]="'Límite de ' + label(b)" /><span class="au-muted" *ngIf="b.extraUsd"> + {{ b.extraUsd | number: '1.2-2' }}</span></td>
            <td>{{ b.actualUsd | number: '1.2-4' }}</td><td>{{ b.heldUsd | number: '1.2-4' }}</td>
            <td><span class="au-badge" [ngClass]="b.remainingUsd > 0 ? 'au-badge--neutral' : 'au-badge--danger'">{{ b.remainingUsd > 0 ? (b.remainingUsd | number: '1.2-4') : 'agotado' }}</span></td>
            <td><button class="au-btn au-btn--sm" type="button" (click)="startAuthorization(b)">Autorizar más</button></td>
          </tr>
          <tr *ngIf="!useRows().length"><td colspan="6" class="au-muted">Ningún presupuesto coincide.</td></tr></tbody>
        </table></div>
        <app-pager [page]="usePage" [pages]="usePages()" label="presupuestos" (go)="usePage = $event"></app-pager>
        <div class="au-row au-mt-3" *ngIf="extra as e">
          <span class="au-row__title">Gasto extra: {{ label(e.budget) }}</span>
          <input class="au-input num" type="number" min="0.01" step="0.01" [(ngModel)]="e.amountUsd" name="x-amount" aria-label="Importe extra en USD" placeholder="USD" />
          <input class="au-input num" type="number" min="1" max="31" [(ngModel)]="e.days" name="x-days" aria-label="Días de vigencia" />
          <input class="au-input au-flex-1" [(ngModel)]="e.reason" name="x-reason" placeholder="Motivo" aria-label="Motivo del gasto extra" />
          <button class="au-btn au-btn--primary" type="button" [disabled]="!e.amountUsd || !e.reason.trim()" (click)="authorize()">Autorizar</button>
          <button class="au-btn" type="button" (click)="extra = null">Cancelar</button>
        </div>
        <div class="au-row" *ngFor="let a of d.authorizations">
          <span class="au-row__title">Extra: {{ label(a) }}</span>
          <span class="au-badge au-badge--brand">{{ a.amountUsd | number: '1.2-2' }} USD</span>
          <span class="au-row__meta">hasta {{ a.expiresAt | date: 'short' }} · {{ a.reason }}</span>
          <button class="au-btn au-btn--sm" type="button" (click)="revoke(a.id)">Retirar</button>
        </div>
      </section>

      <section class="au-panel au-panel--padded au-mt-4">
        <h2 class="au-panel__title">Presupuesto efectivo</h2>
        <p class="au-panel__subtitle au-mb-3">Lo que podría gastar ahora una petición concreta, con todos los límites a la vez.</p>
        <form class="au-row" (ngSubmit)="check()">
          <select class="au-input sel" [(ngModel)]="query.tenantId" (ngModelChange)="query.siteId = ''" name="q-tenant" aria-label="Workspace"><option value="" disabled>Workspace…</option><option *ngFor="let t of d.targets.tenants" [value]="t.id">{{ t.name }}</option></select>
          <select class="au-input sel" [(ngModel)]="query.siteId" name="q-site" aria-label="Sitio"><option value="">Sin sitio</option><option *ngFor="let s of sitesOf(query.tenantId)" [value]="s.id">{{ s.name }}</option></select>
          <select class="au-input sel" [(ngModel)]="query.providerId" name="q-provider" aria-label="Proveedor"><option value="" disabled>Proveedor…</option><option *ngFor="let p of providerIds()" [value]="p">{{ p }}</option></select>
          <select class="au-input sel" [(ngModel)]="query.operation" name="q-op" aria-label="Operación"><option *ngFor="let c of keys(capabilities)" [value]="c">{{ capabilities[c] }}</option></select>
          <button class="au-btn" type="submit" [disabled]="!query.tenantId || !query.providerId">Calcular</button>
        </form>
        <ng-container *ngIf="effective as e">
          <p class="au-mt-2" role="status"><strong>{{ e.effectiveUsd | number: '1.2-4' }} USD</strong> disponibles{{ e.stopped ? ': ' + stopReason(e.stopped) : e.rows[0] ? ', por ' + label(e.rows[0]) : '' }} ({{ e.allowance === 'onboarding' ? 'asignación de alta' : 'asignación recurrente' }}).</p>
          <div class="scroll"><table class="au-table"><thead><tr><th scope="col">Límite</th><th scope="col">Total</th><th scope="col">Gastado</th><th scope="col">Reservado</th><th scope="col">Queda</th></tr></thead>
            <tbody><tr *ngFor="let r of e.rows; let first = first"><td>{{ label(r) }} <span class="au-badge au-badge--outline" *ngIf="first">manda</span></td><td>{{ r.limitUsd + r.extraUsd | number: '1.2-4' }}</td><td>{{ r.actualUsd | number: '1.2-4' }}</td><td>{{ r.heldUsd | number: '1.2-4' }}</td><td>{{ r.remainingUsd | number: '1.2-4' }}</td></tr></tbody></table></div>
          <p class="au-muted" *ngFor="let g of e.general">Además, el workspace tiene un límite general {{ g.period === 'daily' ? 'al día' : 'al mes' }} de {{ g.hardLimitUsd | number: '1.2-2' }} USD, IA incluida: lleva {{ g.spentUsd | number: '1.2-4' }}.</p>
        </ng-container>
      </section>

      <section class="au-panel au-panel--padded au-mt-4">
        <h2 class="au-panel__title">Límites configurados</h2>
        <p class="au-panel__subtitle au-mb-3">Lo específico manda sobre lo general. Sin cambios, valen los valores por defecto.</p>
        <div class="au-row" *ngFor="let b of d.budgets">
          <span class="au-row__title">{{ label(b) }}</span>
          <input class="au-input num" type="number" min="0" step="0.01" [ngModel]="b.limitUsd" (change)="setLimit(b, $event)" [name]="'c-' + trackUse(0, b)" [attr.aria-label]="'Límite configurado de ' + label(b)" />
          <span class="au-badge au-badge--outline">{{ b.source === 'custom' ? 'personalizado' : 'por defecto' }}</span>
          <button class="au-btn au-btn--sm" type="button" *ngIf="b.source === 'custom'" (click)="save(b, null)">Restablecer</button>
        </div>
        <h3 class="au-panel__title au-mt-4 au-mb-2">Añadir un límite</h3>
        <div class="au-row">
          <select class="au-input sel" [(ngModel)]="draft.scope" (ngModelChange)="draft.scopeId = $event === 'global' ? 'platform' : '*'" name="d-scope" aria-label="Ámbito"><option *ngFor="let s of keys(scopes)" [value]="s">{{ scopes[s] }}</option></select>
          <select class="au-input sel" *ngIf="draft.scope !== 'global'" [(ngModel)]="draft.scopeId" name="d-id" aria-label="A quién se aplica">
            <option value="*">Todos (cada uno)</option><option *ngFor="let t of targets()" [value]="t.id">{{ t.name }}</option>
          </select>
          <select class="au-input sel" [(ngModel)]="draft.operation" name="d-op" aria-label="Operación"><option value="*">Todas las operaciones</option><option *ngFor="let c of keys(capabilities)" [value]="c">{{ capabilities[c] }}</option></select>
          <select class="au-input" style="width: 130px" [(ngModel)]="draft.allowance" name="d-allow" aria-label="Tipo de asignación"><option value="any">Cualquiera</option><option value="onboarding">Alta</option><option value="recurring">Recurrente</option></select>
          <select class="au-input" style="width: 120px" [(ngModel)]="draft.period" name="d-period" aria-label="Periodo"><option *ngFor="let p of keys(periods)" [value]="p">{{ periods[p] }}</option></select>
          <input class="au-input num" type="number" min="0" step="0.01" [(ngModel)]="draftLimit" name="d-limit" placeholder="USD" aria-label="Límite en USD" />
          <button class="au-btn" type="button" [disabled]="draftLimit === null" (click)="save(draft, draftLimit)">Añadir</button>
        </div>
      </section>

      <section class="au-panel au-panel--padded au-mt-4" *ngIf="d.uncertain.length">
        <h2 class="au-panel__title">Peticiones sin confirmar</h2>
        <p class="au-panel__subtitle au-mb-3">Salieron y no se sabe si se cobraron: retienen su máximo hasta que indiques el coste real según la factura del proveedor (0 si no se cobró).</p>
        <div class="au-row" *ngFor="let u of d.uncertain">
          <span class="au-row__title">{{ capability(u.operation) }} · {{ u.providerId }}</span>
          <span class="au-row__meta">{{ u.createdAt | date: 'short' }} · {{ u.tenant ?? 'workspace borrado' }} · hasta {{ u.maxUsd }} USD · {{ u.reason }}</span>
          <input class="au-input num" type="number" min="0" step="0.0001" [(ngModel)]="bills[u.id]" [name]="'u-' + u.id" aria-label="Coste real en USD" placeholder="USD" />
          <input class="au-input au-flex-1" [(ngModel)]="notes[u.id]" [name]="'n-' + u.id" aria-label="De dónde sale el dato" placeholder="De dónde sale el dato" />
          <button class="au-btn au-btn--sm" type="button" [disabled]="bills[u.id] == null || !notes[u.id]?.trim()" (click)="resolve(u.id)">Resolver</button>
        </div>
      </section>

      <section class="au-panel au-panel--padded au-mt-4">
        <h2 class="au-panel__title">Presupuestos agotados</h2>
        <p class="au-panel__subtitle au-mb-3">Peticiones rechazadas en los últimos 90 días porque un límite no tenía sitio.</p>
        <div class="scroll"><table class="au-table"><thead><tr><th scope="col">Día</th><th scope="col">Límite</th><th scope="col">Workspace</th><th scope="col">Sitio</th><th scope="col">Operación</th><th scope="col">Veces</th></tr></thead>
          <tbody><tr *ngFor="let x of exhausted"><td>{{ x.day | date: 'd/MM/y' }}</td><td>{{ exhaustedLabel(x.metric) }}</td><td>{{ x.tenant ?? '—' }}</td><td>{{ x.site ?? '—' }}</td><td>{{ capability(x.operation) }} · {{ x.provider_id }}</td><td>{{ x.count }}</td></tr>
          <tr *ngIf="!exhausted.length"><td colspan="6" class="au-muted">Ninguna.</td></tr></tbody></table></div>
      </section>

      <section class="au-panel au-panel--padded au-mt-4">
        <h2 class="au-panel__title">Precios</h2>
        <p class="au-panel__subtitle au-mb-3">Versión {{ d.pricing.version }}. Una operación sin precio máximo conocido no se compra. Un tope guardado nunca rebaja el precio de lista.</p>
        <div class="au-row" *ngFor="let p of d.pricing.entries">
          <span class="au-row__title">{{ p.providerId }} · {{ capability(p.capability) }}</span>
          <span class="au-badge" [ngClass]="p.status === 'known' ? 'au-badge--neutral' : p.status === 'unknown' || p.status === 'suspect' ? 'au-badge--danger' : 'au-badge--warning'">{{ priceStatus(p.status) }}</span>
          <span class="au-row__meta">{{ p.perRequestUsd === null ? 'base desconocida' : p.perRequestUsd + ' por petición' }}{{ p.perItemUsd ? ' + ' + p.perItemUsd + ' por elemento' : '' }} {{ p.currency }} · {{ p.verifiedAt }}</span>
          <input class="au-input num" type="number" min="0" step="0.001" [(ngModel)]="ceilings[p.providerId + ':' + p.capability]" [name]="'p-' + p.providerId + p.capability" [placeholder]="p.override?.maxRequestUsd ?? 'Tope USD'" [attr.aria-label]="'Tope por petición de ' + p.providerId + ' ' + capability(p.capability)" />
          <button class="au-btn au-btn--sm" type="button" [disabled]="!ceilings[p.providerId + ':' + p.capability]" (click)="setCeiling(p.providerId, p.capability, ceilings[p.providerId + ':' + p.capability]!)">Guardar</button>
          <button class="au-btn au-btn--sm" type="button" *ngIf="p.override" (click)="setCeiling(p.providerId, p.capability, null)">Quitar</button>
        </div>
      </section>

      <section class="au-panel au-panel--padded au-mt-4">
        <h2 class="au-panel__title">Frescura de los datos</h2>
        <p class="au-panel__subtitle au-mb-3">Días durante los que un dato se considera reciente. Pasarlos no dispara compras: solo se renueva si una decisión lo necesita y compensa.</p>
        <div class="au-row" *ngFor="let c of keys(capabilities)">
          <span class="au-row__title">{{ capabilities[c] }}</span>
          <input class="au-input num" type="number" min="1" [(ngModel)]="freshness[c]" [name]="'f-' + c" [attr.aria-label]="'Días de frescura: ' + capabilities[c]" /><span class="au-row__meta">días</span>
        </div>
        <label class="au-row"><input type="checkbox" name="automatic-research" [(ngModel)]="automaticResearch" /><span>Dejar que la investigación SEO empiece sola cuando haya un motivo, dentro de los límites</span></label>
        <button class="au-btn au-mt-2" type="button" (click)="saveFreshness()">Guardar frescura e investigación</button>
      </section>

      <section class="au-panel au-panel--padded au-mt-4">
        <h2 class="au-panel__title">Registro de consumo</h2>
        <div class="au-row"><select class="au-input sel" [(ngModel)]="ledgerState" (ngModelChange)="loadLedger(1)" name="ledger-state" aria-label="Filtrar por estado"><option value="">Todas</option><option *ngFor="let s of keys(states)" [value]="s">{{ states[s] }}</option></select></div>
        <div class="scroll" *ngIf="ledger as l"><table class="au-table">
          <thead><tr><th>Fecha</th><th>Operación</th><th>Proveedor</th><th>Estado</th><th>Máximo</th><th>Real</th></tr></thead>
          <tbody><tr *ngFor="let r of l.items"><td>{{ r.createdAt | date: 'short' }}</td><td>{{ capability(r.operation) }}</td><td>{{ r.providerId }}</td><td>{{ states[r.state] ?? r.state }}</td><td>{{ r.maxUsd }}</td><td>{{ r.actualUsd ?? '—' }}</td></tr>
          <tr *ngIf="!l.items.length"><td colspan="6" class="au-muted">Todavía no hay peticiones.</td></tr></tbody>
        </table></div>
        <app-pager *ngIf="ledger as l" [page]="l.page" [pages]="ledgerPages(l)" label="el registro" (go)="loadLedger($event)"></app-pager>
      </section>
    </ng-container>
  `,
})
export class SeoGovernorSettingsComponent implements OnInit {
  private readonly api = inject(AdminApiService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);

  private readonly ops = inject(AdminSeoOpsApiService);

  readonly scopes = SCOPES;
  readonly periods = PERIODS;
  readonly states = STATES;
  readonly capabilities = SEO_CAPABILITY_LABELS;
  data: AdminSeoGovernor | null = null;
  ledger: AdminSeoLedger | null = null;
  ledgerState = '';
  failed = false;
  useSearch = '';
  usePage = 1;
  query = { tenantId: '', siteId: '', providerId: '', operation: 'keyword_suggestions' };
  effective: EffectiveBudget | null = null;
  exhausted: Exhaustion[] = [];
  draft: AdminSeoBudgetKey = { scope: 'tenant', scopeId: '*', operation: '*', allowance: 'any', period: 'monthly' };
  draftLimit: number | null = null;
  extra: { budget: AdminSeoUse; amountUsd: number | null; days: number; reason: string } | null = null;
  bills: Record<string, number | null> = {};
  notes: Record<string, string> = {};
  ceilings: Record<string, number | null> = {};
  freshness: Record<string, number> = {};
  automaticResearch = false;

  ngOnInit(): void {
    this.load();
    this.loadLedger(1);
    this.ops.exhaustion().subscribe({ next: ({ items }) => (this.exhausted = items), error: () => this.toast.error('No se ha podido cargar el historial de presupuestos agotados.') });
  }

  sitesOf = (tenantId: string) => this.data!.targets.sites.filter((site) => site.tenantId === tenantId);
  providerIds = () => [...new Set(this.data!.pricing.entries.map((entry) => entry.providerId))];
  ledgerPages = (l: AdminSeoLedger) => Math.max(1, Math.ceil(l.total / 50));
  stopReason = (code: string) => (code === 'tenant_suspended' ? 'el workspace está suspendido' : (SEO_BLOCKS[code] ?? code).toLowerCase());
  exhaustedLabel = (metric: string) => {
    const [scope, period] = metric.split(':');
    return `${SCOPES[scope] ?? scope} ${PERIODS[period] ?? period}`;
  };

  check(): void {
    this.ops.effectiveBudget(this.query).subscribe({ next: (result) => (this.effective = result), error: (error) => this.toast.error(seoError(error)) });
  }

  /** Agotados y casi agotados primero: son los que hay que mirar. */
  useRows(): AdminSeoUse[] {
    const text = this.useSearch.trim().toLowerCase();
    const rows = (this.data?.use ?? []).filter((b) => !text || this.label(b).toLowerCase().includes(text));
    const left = (b: AdminSeoUse) => (b.limitUsd + b.extraUsd ? b.remainingUsd / (b.limitUsd + b.extraUsd) : 0);
    return rows.sort((a, b) => Number(b.scope === 'global') - Number(a.scope === 'global') || Number(b.scope === 'provider') - Number(a.scope === 'provider') || left(a) - left(b));
  }
  usePages = () => Math.max(1, Math.ceil(this.useRows().length / 25));

  keys = (value: object) => Object.keys(value);
  capability = (id: string) => SEO_CAPABILITY_LABELS[id] ?? id;
  priceStatus = (id: string) => PRICE_STATUS[id] ?? id;
  trackUse = (_: number, b: AdminSeoBudgetKey) => [b.scope, b.scopeId, b.operation, b.allowance, b.period].join('|');
  label = (b: AdminSeoBudgetKey & { name?: string | null }) =>
    [SCOPES[b.scope], b.scope === 'global' ? '' : b.scopeId === '*' ? '(cada uno)' : b.name ?? b.scopeId, b.operation === '*' ? '' : `· ${this.capability(b.operation)}`, ALLOWANCES[b.allowance], PERIODS[b.period]].filter(Boolean).join(' ');

  targets(): { id: string; name: string }[] {
    const d = this.data!;
    if (this.draft.scope === 'tenant') return d.targets.tenants;
    if (this.draft.scope === 'site') return d.targets.sites;
    if (this.draft.scope === 'provider') return [...new Set(d.pricing.entries.map((p) => p.providerId))].map((id) => ({ id, name: id }));
    return [...new Set(d.targets.tenants.map((t) => t.plan ?? 'none'))].map((id) => ({ id, name: id === 'none' ? 'Sin plan' : id }));
  }

  load(): void {
    this.api.seoGovernor().subscribe({
      next: (data) => {
        this.data = data;
        this.failed = false;
        for (const id of Object.keys(SEO_CAPABILITY_LABELS)) this.freshness[id] = data.policy.freshness[id].days;
        this.automaticResearch = data.policy['automaticResearch'] === true;
      },
      error: (e: { status?: number }) => { this.failed = e.status !== 403; },
    });
  }

  loadLedger(page: number): void {
    this.api.seoLedger(page, this.ledgerState).subscribe({ next: (ledger) => (this.ledger = ledger), error: () => undefined });
  }

  private after(message: string, done: () => void = () => undefined) {
    return {
      next: () => { done(); this.toast.success(message); this.load(); this.loadLedger(1); },
      error: (e: { error?: { message?: string } }) => { this.toast.error(e?.error?.message ?? 'No se ha podido guardar.'); this.load(); },
    };
  }

  setLimit(budget: AdminSeoBudgetKey, event: Event): void {
    const raw = (event.target as HTMLInputElement).value;
    if (raw === '' || Number(raw) < 0) { this.load(); return; }
    this.save(budget, Number(raw));
  }

  save(budget: AdminSeoBudgetKey, limitUsd: number | null): void {
    const { scope, scopeId, operation, allowance, period } = budget;
    this.api.setSeoBudget({ scope, scopeId, operation, allowance, period }, limitUsd).subscribe(this.after('Límite guardado.', () => (this.draftLimit = null)));
  }

  startAuthorization(budget: AdminSeoUse): void {
    this.extra = { budget, amountUsd: null, days: 7, reason: '' };
  }

  authorize(): void {
    const { budget, amountUsd, days, reason } = this.extra!;
    const { scope, scopeId, operation, allowance, period } = budget;
    this.api.authorizeSeoSpend({ scope, scopeId, operation, allowance, period }, Number(amountUsd), Number(days), reason).subscribe(this.after('Gasto extra autorizado.', () => (this.extra = null)));
  }

  revoke(id: string): void {
    this.api.revokeSeoAuthorization(id).subscribe(this.after('Autorización retirada.'));
  }

  resolve(id: string): void {
    this.api.resolveSeoReservation(id, Number(this.bills[id]), this.notes[id]).subscribe(this.after('Petición resuelta.'));
  }

  async setCeiling(providerId: string, capability: string, maxRequestUsd: number | null): Promise<void> {
    const ok = await this.confirm.confirm({
      title: maxRequestUsd === null ? '¿Volver al precio de lista?' : `¿Guardar un tope de ${maxRequestUsd} USD por petición?`,
      message: `${providerId} · ${this.capability(capability)}. Confirma que lo has contrastado con una factura o con la tarifa del proveedor.`, confirmLabel: 'Confirmar', cancelLabel: 'Cancelar',
    });
    if (!ok) return;
    this.api.setSeoPrice(providerId, capability, maxRequestUsd, 'Confirmado por un administrador en el panel').subscribe(this.after('Precio guardado.', () => (this.ceilings = {})));
  }

  saveFreshness(): void {
    const { freshness: _current, ...policy } = this.data!.policy;
    this.api.setSeoPolicy({ ...policy, automaticResearch: this.automaticResearch, freshnessDays: this.freshness }).subscribe(this.after('Guardado.'));
  }
}
