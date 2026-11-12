import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Observable, Subscription, forkJoin, of } from 'rxjs';
import { AppContextService } from '../services/app-context.service';
import { ConfirmService } from '../services/confirm.service';
import { EditorialContextService } from '../services/editorial-context.service';
import { ToastService } from '../services/toast.service';
import { PlanningApiService, apiMessage, isRunning } from '../services/planning-api.service';
import { AppIconComponent } from '../components/ui/app-icon.component';
import { AppEmptyStateComponent } from '../components/ui/app-empty-state.component';
import { PlanGeneratorComponent } from '../components/planning/plan-generator.component';
import { PlanCalendarViewComponent } from '../components/planning/plan-calendar-view.component';
import { BacklogAction, PlanBacklogViewComponent } from '../components/planning/plan-backlog-view.component';
import { PlanPipelineViewComponent } from '../components/planning/plan-pipeline-view.component';
import { PlanItemDrawerComponent } from '../components/planning/plan-item-drawer.component';
import { addDays, localDate } from '../components/planning/planning-utils';
import type { OperationItem, StudioSite } from '../models/studio.models';
import type { PlanDetail, PlanGenerationAccepted, PlanItem } from '../models/planning.models';

type View = 'calendar' | 'backlog' | 'pipeline';

/** Planning workspace: plan switcher, three views over the same items, plan actions and the item drawer. */
@Component({
  selector: 'app-editorial-plan-page',
  standalone: true,
  imports: [
    CommonModule, FormsModule, RouterLink, AppIconComponent, AppEmptyStateComponent,
    PlanGeneratorComponent, PlanCalendarViewComponent, PlanBacklogViewComponent, PlanPipelineViewComponent, PlanItemDrawerComponent,
  ],
  styles: [
    `
      .pw-bar { display: flex; flex-wrap: wrap; align-items: end; gap: var(--au-s3); margin-bottom: var(--au-s3); }
      .pw-bar__switch { display: flex; flex-direction: column; gap: var(--au-s1); min-width: min(100%, 280px); flex: 1 1 280px; max-width: 460px; }
      .pw-bar__label { font-size: var(--au-fs-caption); color: var(--au-muted); }
      .pw-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--au-s3); padding: var(--au-s3) var(--au-s4); border-bottom: 1px solid var(--au-border); }
      .pw-head h2 { margin: 0; font-size: var(--au-fs-h3, 1.1rem); overflow-wrap: anywhere; }
      .pw-head p { margin: 2px 0 0; color: var(--au-muted); font-size: var(--au-fs-body-sm); }
      .pw-actions { display: flex; flex-wrap: wrap; align-items: center; gap: var(--au-s2); }
      .pw-extend { display: flex; flex-wrap: wrap; align-items: end; gap: var(--au-s2); padding: var(--au-s3) var(--au-s4); border-bottom: 1px solid var(--au-border); background: var(--au-surface-2); }
      .pw-op { padding: var(--au-s3) var(--au-s4); border-bottom: 1px solid var(--au-border); }
      .pw-counts { display: flex; flex-wrap: wrap; gap: var(--au-s3); padding: var(--au-s2) var(--au-s4); font-size: var(--au-fs-metadata); color: var(--au-muted); border-bottom: 1px solid var(--au-border); }
      .pw-counts strong { color: var(--au-text); }
      .pw-tabs { display: flex; gap: var(--au-s1); padding: var(--au-s2) var(--au-s4) 0; border-bottom: 1px solid var(--au-border); }
      .pw-tab { border: none; background: transparent; font: inherit; color: var(--au-muted); padding: var(--au-s2) var(--au-s3); cursor: pointer; border-bottom: 2px solid transparent; margin-bottom: -1px; }
      .pw-tab:hover { color: var(--au-text); }
      .pw-tab[aria-selected='true'] { color: var(--au-text); border-bottom-color: var(--au-brand); font-weight: 600; }
      .pw-tab:focus-visible { outline: 2px solid var(--au-brand); outline-offset: -2px; }
      .pw-body { padding: var(--au-s3) var(--au-s4); }
      .pw-warn { margin: var(--au-s3) var(--au-s4) 0; }
      @media (max-width: 640px) {
        .pw-head, .pw-body, .pw-counts, .pw-tabs, .pw-op, .pw-extend { padding-left: var(--au-s3); padding-right: var(--au-s3); }
        .pw-tab { padding: var(--au-s2); }
      }
    `,
  ],
  template: `
    <section class="au-page">
      <header class="au-page__header au-page__header--split">
        <div>
          <p class="au-page__eyebrow">Editorial control</p>
          <h1 class="au-page__title">Editorial Plan</h1>
          <p class="au-page__subtitle">Decide what to publish before generating the actual content.</p>
        </div>
        <div class="au-page__actions">
          <button class="au-btn au-btn--secondary" type="button" (click)="showGenerator = !showGenerator" [attr.aria-expanded]="showGenerator">
            <app-icon name="sparkles"></app-icon>
            {{ showGenerator ? 'Hide generator' : 'New plan' }}
          </button>
          <a class="au-btn au-btn--ghost" routerLink="/studio/calendar">
            <app-icon name="calendar"></app-icon>
            Open calendar
          </a>
        </div>
      </header>

      <div class="au-banner au-banner--error" *ngIf="loadError" role="alert">
        <app-icon name="warning"></app-icon>
        <span class="au-banner__text">{{ loadError }}</span>
        <button class="au-banner__action" type="button" (click)="load()">Retry</button>
      </div>

      <section class="au-panel au-mb-3" *ngIf="showGenerator || (!loading && visiblePlans().length === 0 && !loadError)">
        <header class="au-panel__header">
          <div>
            <h2 class="au-panel__title">Generate a plan</h2>
            <p class="au-panel__subtitle">Period, cadence and destination. AI proposes briefs to review; nothing is written until you approve.</p>
          </div>
        </header>
        <div class="au-panel--padded">
          <app-plan-generator [sites]="sites" [initialSiteId]="siteId" [busy]="!!activeOp" (generate)="generate($event)"></app-plan-generator>
        </div>
      </section>

      <div class="pw-bar" *ngIf="visiblePlans().length > 0">
        <label class="pw-bar__switch">
          <span class="pw-bar__label">Plan</span>
          <select class="au-select" [ngModel]="plan?.id || ''" (ngModelChange)="selectPlan($event)">
            <option *ngFor="let entry of visiblePlans()" [value]="entry.id">{{ entry.name }} · {{ entry.dateFrom | date: 'MMM d' }} to {{ entry.dateTo | date: 'MMM d' }}</option>
          </select>
        </label>
        <label class="au-checkbox"><input type="checkbox" [(ngModel)]="showArchived" (ngModelChange)="onArchivedToggle()" /> Show archived</label>
      </div>

      <section class="au-panel" *ngIf="plan" [attr.aria-busy]="!!activeOp">
        <header class="pw-head">
          <div>
            <h2>{{ plan.name }}</h2>
            <p>
              {{ plan.dateFrom | date: 'mediumDate' }} to {{ plan.dateTo | date: 'mediumDate' }} · {{ plan.timezone }}
              <span class="au-badge" [ngClass]="'au-badge--' + planTone(plan.status)">{{ plan.status }}</span>
            </p>
          </div>
          <div class="pw-actions">
            <button class="au-btn au-btn--secondary au-btn--sm" type="button" [disabled]="!!activeOp || plan.status === 'archived'" (click)="fillMissing()" [title]="unfilledCount() ? unfilledCount() + ' slots are empty' : 'Every slot is filled'">
              <app-icon name="refresh"></app-icon> Fill missing slots<ng-container *ngIf="unfilledCount()"> ({{ unfilledCount() }})</ng-container>
            </button>
            <button class="au-btn au-btn--secondary au-btn--sm" type="button" [disabled]="!!activeOp || plan.status === 'archived'" (click)="toggleExtend()" [attr.aria-expanded]="extending">
              <app-icon name="plus"></app-icon> Extend
            </button>
            <button class="au-btn au-btn--ghost au-btn--sm" type="button" [disabled]="!!activeOp || plan.status === 'archived'" (click)="archive()">
              <app-icon name="archive"></app-icon> Archive
            </button>
          </div>
        </header>

        <form class="pw-extend" *ngIf="extending" (ngSubmit)="extend()">
          <label class="au-field">
            <span class="au-field__label">New end date</span>
            <input class="au-input" type="date" name="extendTo" [(ngModel)]="extendTo" [min]="extendMin()" required />
          </label>
          <button class="au-btn au-btn--primary au-btn--sm" type="submit" [disabled]="!extendTo || extendTo < extendMin()">Generate extra slots</button>
          <button class="au-btn au-btn--ghost au-btn--sm" type="button" (click)="extending = false">Cancel</button>
          <p class="au-hint">Only slots after {{ plan.dateTo | date: 'mediumDate' }} are generated. Existing proposals stay untouched.</p>
        </form>

        <div class="pw-op" *ngIf="activeOp" role="status" aria-live="polite">
          <div class="au-progress" role="progressbar" aria-label="Operation progress" [attr.aria-valuenow]="opPercent()" aria-valuemin="0" aria-valuemax="100">
            <span class="au-progress__bar" [style.width.%]="opPercent()"></span>
          </div>
          <p class="au-hint au-mt-1">
            {{ opLabel }}: {{ activeOp.phase || 'Queued' }}<ng-container *ngIf="activeOp.totalSteps"> · {{ activeOp.completedSteps }} of {{ activeOp.totalSteps }}</ng-container>
          </p>
        </div>
        <p class="au-visually-hidden" role="status" aria-live="polite">{{ announce }}</p>
        <div class="au-banner au-banner--warning pw-warn" *ngIf="notice" role="status">
          <app-icon name="warning"></app-icon>
          <span class="au-banner__text">{{ notice }}</span>
        </div>
        <div class="au-banner au-banner--error pw-warn" *ngIf="error" role="alert">
          <app-icon name="warning"></app-icon>
          <span class="au-banner__text">{{ error }}</span>
        </div>

        <div class="pw-counts">
          <span><strong>{{ items().length }}</strong> proposals</span>
          <span><strong>{{ count('proposed') }}</strong> to review</span>
          <span><strong>{{ count('approved') }}</strong> approved</span>
          <span><strong>{{ count('content_ready') + count('review_required') }}</strong> drafted</span>
          <span><strong>{{ count('scheduled') + count('published') }}</strong> scheduled or published</span>
        </div>

        <div class="pw-tabs" role="tablist" aria-label="Plan views">
          <button *ngFor="let tab of tabs" class="pw-tab" role="tab" type="button" [id]="'pw-tab-' + tab.id" [attr.aria-selected]="view === tab.id" aria-controls="pw-panel" [attr.tabindex]="view === tab.id ? 0 : -1" (click)="view = tab.id" (keydown.arrowright)="moveTab(1)" (keydown.arrowleft)="moveTab(-1)">{{ tab.label }}</button>
        </div>
        <div class="pw-body" id="pw-panel" role="tabpanel" [attr.aria-labelledby]="'pw-tab-' + view">
          <div class="au-skeleton" *ngIf="detailLoading">Loading plan…</div>
          <ng-container *ngIf="!detailLoading">
            <app-empty-state *ngIf="items().length === 0" icon="plan" title="This plan has no proposals" text="Use Fill missing slots to generate proposals for the empty slots."></app-empty-state>
            <ng-container *ngIf="items().length > 0">
              <app-plan-calendar-view *ngIf="view === 'calendar'" [items]="items()" [timezone]="plan.timezone" [startDate]="startDate()" (open)="openItem($event)" (periodChange)="onPeriod($event)"></app-plan-calendar-view>
              <app-plan-backlog-view *ngIf="view === 'backlog'" [items]="items()" [timezone]="plan.timezone" [busy]="bulkBusy || !!activeOp" (open)="openItem($event)" (action)="onBacklogAction($event)"></app-plan-backlog-view>
              <app-plan-pipeline-view *ngIf="view === 'pipeline'" [items]="items()" [timezone]="plan.timezone" (open)="openItem($event)"></app-plan-pipeline-view>
            </ng-container>
          </ng-container>
        </div>
      </section>
    </section>

    <app-plan-item-drawer *ngIf="openedItem && plan" [item]="openedItem" [timezone]="plan.timezone" [siteId]="plan.siteId" (changed)="onDrawerChanged($event)" (closed)="closeItem()"></app-plan-item-drawer>
  `,
})
export class EditorialPlanPageComponent implements OnInit, OnDestroy {
  private readonly api = inject(PlanningApiService);
  private readonly appContext = inject(AppContextService);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);
  private readonly context = inject(EditorialContextService);
  private opSub: Subscription | null = null;

  sites: StudioSite[] = [];
  siteId = '';
  plans: PlanDetail[] = [];
  plan: PlanDetail | null = null;
  openedItem: PlanItem | null = null;
  loading = true;
  detailLoading = false;
  loadError = '';
  error = '';
  notice = '';
  announce = '';
  showGenerator = false;
  showArchived = false;
  extending = false;
  extendTo = '';
  view: View = 'calendar';
  tabs: Array<{ id: View; label: string }> = [
    { id: 'calendar', label: 'Calendar' },
    { id: 'backlog', label: 'Backlog' },
    { id: 'pipeline', label: 'Pipeline' },
  ];
  activeOp: OperationItem | null = null;
  opLabel = '';
  bulkBusy = false;

  ngOnInit(): void {
    this.sites = this.appContext.sites();
    this.siteId = this.appContext.activeSite()?.id ?? this.sites[0]?.id ?? '';
    this.context.update({ area: 'plan', siteId: this.siteId || null });
    this.load();
  }

  ngOnDestroy(): void {
    this.opSub?.unsubscribe();
    this.context.clear(['area', 'siteId', 'planId', 'planItemId', 'periodFrom', 'periodTo']);
  }

  visiblePlans(): PlanDetail[] {
    return this.plans.filter((entry) => this.showArchived || entry.status !== 'archived' || entry.id === this.plan?.id);
  }
  items(): PlanItem[] {
    return this.plan?.items ?? [];
  }
  count(status: string): number {
    return this.items().filter((item) => item.status === status).length;
  }
  unfilledCount(): number {
    return this.plan?.generatedOutput?.unfilledSlots?.length ?? 0;
  }
  startDate(): string {
    const today = localDate(new Date(), this.plan?.timezone ?? 'Europe/Madrid');
    const from = this.plan ? localDate(this.plan.dateFrom, this.plan.timezone) : today;
    const to = this.plan ? localDate(this.plan.dateTo, this.plan.timezone) : today;
    return today >= from && today <= to ? today : from;
  }
  planTone(status: string): string {
    return status === 'ready' ? 'success' : status === 'failed' ? 'danger' : status === 'generating' || status === 'partial' ? 'warning' : 'neutral';
  }
  opPercent(): number {
    const op = this.activeOp;
    return op && op.totalSteps ? Math.round((op.completedSteps / op.totalSteps) * 100) : 0;
  }
  moveTab(step: number): void {
    const index = this.tabs.findIndex((tab) => tab.id === this.view);
    this.view = this.tabs[(index + step + this.tabs.length) % this.tabs.length].id;
    queueMicrotask(() => document.getElementById('pw-tab-' + this.view)?.focus());
  }

  load(selectId?: string): void {
    this.loading = true;
    this.loadError = '';
    this.api.listPlans().subscribe({
      next: (response) => {
        this.plans = response.items;
        this.loading = false;
        const target = selectId ?? this.plan?.id ?? this.visiblePlans()[0]?.id;
        if (target) this.selectPlan(target);
      },
      error: (err) => {
        this.loading = false;
        this.loadError = apiMessage(err, 'Editorial plans could not be loaded. Try again.');
      },
    });
  }

  onArchivedToggle(): void {
    if (this.plan && !this.visiblePlans().some((entry) => entry.id === this.plan?.id)) this.selectPlan(this.visiblePlans()[0]?.id ?? '');
  }

  selectPlan(planId: string): void {
    if (!planId) {
      this.plan = null;
      this.context.update({ planId: null, planItemId: null });
      return;
    }
    this.detailLoading = true;
    this.openedItem = null;
    this.error = '';
    this.notice = '';
    this.api.getPlan(planId).subscribe({
      next: (detail) => {
        this.plan = detail;
        this.detailLoading = false;
        this.plans = this.plans.map((entry) => (entry.id === detail.id ? { ...entry, ...detail } : entry));
        this.context.update({ planId: detail.id, siteId: detail.siteId ?? (this.siteId || null), planItemId: null });
      },
      error: (err) => {
        this.detailLoading = false;
        this.error = apiMessage(err, 'This plan could not be opened.');
      },
    });
  }

  private reload(): void {
    if (!this.plan) return;
    const id = this.plan.id;
    this.api.getPlan(id).subscribe({
      next: (detail) => {
        if (this.plan?.id !== id) return;
        this.plan = detail;
        if (this.openedItem) {
          const fresh = detail.items?.find((item) => item.id === this.openedItem?.id);
          if (fresh) this.openedItem = fresh;
        }
      },
      error: () => undefined,
    });
  }

  onPeriod(period: { from: string; to: string }): void {
    this.context.update({ periodFrom: period.from, periodTo: period.to });
  }

  openItem(item: PlanItem): void {
    this.openedItem = item;
    this.context.update({ planItemId: item.id });
  }
  closeItem(): void {
    this.openedItem = null;
    this.context.update({ planItemId: null });
  }
  onDrawerChanged(event: { item?: PlanItem; regenerated?: boolean }): void {
    if (event.item && this.plan) {
      const updated = event.item;
      this.plan = { ...this.plan, items: this.items().map((item) => (item.id === updated.id ? { ...item, ...updated } : item)) };
      if (this.openedItem) this.openedItem = { ...this.openedItem, ...updated };
    }
    if (event.regenerated) this.reload();
  }

  // generate, fill and extend all follow a durable Operation for real progress.
  generate(payload: Record<string, unknown>): void {
    this.error = '';
    this.notice = '';
    this.track('Building plan', this.api.generatePlan(payload), (accepted) => {
      this.showGenerator = false;
      this.load(accepted.planId);
    });
  }
  fillMissing(): void {
    if (!this.plan) return;
    this.track('Filling empty slots', this.api.fillMissing(this.plan.id), () => this.reload());
  }
  toggleExtend(): void {
    this.extending = !this.extending;
    this.extendTo = this.extendMin();
  }
  extendMin(): string {
    return this.plan ? addDays(localDate(this.plan.dateTo, this.plan.timezone), 1) : '';
  }
  extend(): void {
    if (!this.plan || !this.extendTo) return;
    this.extending = false;
    this.track('Extending plan', this.api.extendPlan(this.plan.id, { dateTo: this.extendTo }), () => this.load(this.plan?.id));
  }
  async archive(): Promise<void> {
    if (!this.plan) return;
    const ok = await this.confirm.confirm({
      title: 'Archive this plan?',
      message: 'It leaves the plan list and calendar. Content already generated is kept.',
      confirmLabel: 'Archive',
    });
    if (!ok) return;
    this.api.updatePlan(this.plan.id, { status: 'archived' }).subscribe({
      next: () => {
        this.toast.success('Plan archived.');
        this.plan = null;
        this.load();
      },
      error: (err) => (this.error = apiMessage(err, 'The plan could not be archived.')),
    });
  }

  private track(label: string, request: Observable<PlanGenerationAccepted>, done: (accepted: PlanGenerationAccepted) => void): void {
    this.opLabel = label;
    this.activeOp = { phase: 'Queued', completedSteps: 0, totalSteps: 0, status: 'queued' } as OperationItem;
    this.announce = `${label} started.`;
    request.subscribe({
      next: (accepted) => {
        const skipped = Array.isArray(accepted.skippedPast) ? accepted.skippedPast.length : accepted.skippedPast;
        this.activeOp = { ...this.activeOp!, totalSteps: accepted.expectedCount };
        this.opSub?.unsubscribe();
        this.opSub = this.api.watchOperation(accepted.operationId).subscribe({
          next: (op) => {
            this.activeOp = op;
            if (isRunning(op)) return;
            this.activeOp = null;
            if (op.status === 'failed') {
              this.error = op.errorSummary || `${label} failed.`;
              this.announce = this.error;
            } else {
              this.notice = skipped ? `${skipped} slot${skipped === 1 ? ' was' : 's were'} skipped because they are in the past.` : '';
              this.announce = `${label} finished.`;
              this.toast.success(`${label} finished.`);
            }
            done(accepted);
          },
          error: () => {
            this.activeOp = null;
            this.error = 'Lost track of the operation. It keeps running; reload the plan.';
          },
        });
      },
      error: (err) => {
        this.activeOp = null;
        this.error = apiMessage(err, `${label} could not start.`);
        this.announce = this.error;
      },
    });
  }

  async onBacklogAction(action: BacklogAction): Promise<void> {
    if (!action.ids.length || this.bulkBusy) return;
    const n = action.ids.length;
    const noun = `${n} proposal${n === 1 ? '' : 's'}`;
    let run: Observable<unknown>;
    switch (action.kind) {
      case 'approve':
        run = this.api.bulkStatus(action.ids, 'approved');
        break;
      case 'reject':
        run = this.api.bulkStatus(action.ids, 'rejected');
        break;
      case 'delete': {
        const ok = await this.confirm.confirm({ title: `Delete ${noun}?`, message: 'Proposals that already generated content are not deleted. This cannot be undone.', confirmLabel: 'Delete', danger: true });
        if (!ok) return;
        run = this.api.bulkDelete(action.ids);
        break;
      }
      case 'reschedule': {
        const byId = new Map(this.items().map((item) => [item.id, item]));
        const calls = action.ids
          .map((id) => byId.get(id))
          .filter((item): item is PlanItem => !!item?.scheduledFor)
          .map((item) => this.api.updateItem(item.id, { scheduledFor: new Date(Date.parse(item.scheduledFor!) + action.days * 86400000).toISOString() }));
        run = calls.length ? forkJoin(calls) : of(null);
        break;
      }
      case 'regenerate':
        this.regenerateMany(action.ids);
        return;
    }
    this.bulkBusy = true;
    this.error = '';
    run.subscribe({
      next: () => {
        this.bulkBusy = false;
        this.announce = `${noun}: ${action.kind} done.`;
        this.toast.success(`${noun} updated.`);
        this.reload();
      },
      error: (err: unknown) => {
        this.bulkBusy = false;
        this.error = apiMessage(err, `The ${action.kind} action failed. Some proposals may have changed; the list was reloaded.`);
        this.reload();
      },
    });
  }

  /** Regenerates one at a time: each regeneration is its own durable operation. */
  private regenerateMany(ids: string[]): void {
    const queue = [...ids];
    const total = queue.length;
    this.bulkBusy = true;
    this.opLabel = 'Regenerating proposals';
    const next = (): void => {
      const id = queue.shift();
      if (!id) {
        this.bulkBusy = false;
        this.activeOp = null;
        this.announce = `${total} proposals regenerated.`;
        this.reload();
        return;
      }
      this.activeOp = { phase: `Proposal ${total - queue.length} of ${total}`, completedSteps: total - queue.length - 1, totalSteps: total, status: 'running' } as OperationItem;
      this.api.regenerateItem(id).subscribe({
        next: (accepted) => {
          this.opSub?.unsubscribe();
          this.opSub = this.api.watchOperation(accepted.operationId).subscribe({
            next: (op) => {
              if (isRunning(op)) return;
              if (op.status === 'failed') this.error = op.errorSummary || 'One regeneration failed; the original proposal was kept.';
              next();
            },
            error: () => {
              this.error = 'Lost track of a regeneration.';
              this.bulkBusy = false;
              this.activeOp = null;
            },
          });
        },
        error: (err) => {
          this.error = apiMessage(err, 'A proposal could not be regenerated.');
          next();
        },
      });
    };
    next();
  }
}
