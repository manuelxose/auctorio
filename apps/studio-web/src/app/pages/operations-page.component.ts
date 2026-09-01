import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { lastValueFrom, Subscription, timer } from 'rxjs';
import { StudioApiService } from '../services/studio-api.service';
import { ToastService } from '../services/toast.service';
import { AppIconComponent } from '../components/ui/app-icon.component';
import { AppEmptyStateComponent } from '../components/ui/app-empty-state.component';
import type { CostBudgetView, CostControlsView, OperationsHealth } from '../models/studio.models';

type TabId = 'overview' | 'workers' | 'queues' | 'failures' | 'cost';

const TABS: Array<{ id: TabId; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'workers', label: 'Workers' },
  { id: 'queues', label: 'Queues' },
  { id: 'failures', label: 'Failures' },
  { id: 'cost', label: 'Cost controls' },
];

@Component({
  selector: 'app-operations-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, AppIconComponent, AppEmptyStateComponent],
  template: `
    <section class="au-page">
      <header class="au-page__header au-page__header--split">
        <div>
          <p class="au-page__eyebrow">System health & operations</p>
          <h1 class="au-page__title">Operations</h1>
          <p class="au-page__subtitle">Worker liveness, queue pressure, source health, failures and AI cost.</p>
        </div>
        <div class="au-page__actions">
          <span class="au-badge" [class]="health?.status === 'ok' ? 'au-badge--success' : 'au-badge--danger'">
            <span class="au-badge__dot"></span>{{ health ? (health.status | uppercase) : '…' }}
          </span>
          <button class="au-btn au-btn--ghost" type="button" (click)="load()" [disabled]="loading">
            <app-icon name="refresh"></app-icon> Refresh
          </button>
        </div>
      </header>

      <div class="au-banner au-banner--error" *ngIf="loadError">
        <app-icon name="warning"></app-icon>
        <span class="au-banner__text">{{ loadError }}</span>
        <button class="au-banner__action" type="button" (click)="load()">Retry</button>
      </div>

      <div class="au-tabs" role="tablist" aria-label="Operations sections">
        <button
          class="au-tab"
          type="button"
          role="tab"
          *ngFor="let tab of tabs"
          [class.is-active]="activeTab === tab.id"
          [attr.aria-selected]="activeTab === tab.id"
          (click)="activeTab = tab.id"
        >
          {{ tab.label }}
        </button>
      </div>

      <ng-container *ngIf="loading && !health">
        <div class="au-skeleton-list" aria-label="Loading system health">
          <div class="au-skeleton" *ngFor="let _ of [1, 2, 3, 4]" style="height: 72px"></div>
        </div>
      </ng-container>

      <ng-container *ngIf="health">
        <!-- ── Overview ─────────────────────────────────────────────── -->
        <div class="au-row" *ngIf="activeTab === 'overview'">
          <div class="au-row__item au-row__item--third" *ngFor="let card of overviewCards">
            <div class="au-panel au-panel--padded">
              <p class="au-panel__subtitle">{{ card.label }}</p>
              <p class="au-mono au-mt-1" [class.au-badge--danger]="card.bad" style="font-size: 1.5rem; margin: 0">{{ card.value }}</p>
            </div>
          </div>
        </div>

        <div class="au-panel au-panel--padded au-mt-3" *ngIf="activeTab === 'overview' && health.automation.length > 0">
          <div class="au-panel__header"><h2 class="au-panel__title">Automation state</h2></div>
          <table class="au-table au-table--compact">
            <thead><tr><th scope="col">Site</th><th scope="col">Enabled</th><th scope="col">State</th><th scope="col">Paused reason</th></tr></thead>
            <tbody>
              <tr *ngFor="let policy of health.automation">
                <td>{{ policy.siteId || '—' }}</td>
                <td><span class="au-badge" [class]="policy.enabled ? 'au-badge--success' : 'au-badge--neutral'">{{ policy.enabled ? 'on' : 'off' }}</span></td>
                <td><span class="au-badge" [class]="policy.state === 'active' ? 'au-badge--success' : 'au-badge--warning'">{{ policy.state }}</span></td>
                <td>{{ policy.pausedReason || '—' }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="au-panel au-panel--padded au-mt-3" *ngIf="activeTab === 'overview' && health.recentErrors.length > 0">
          <div class="au-panel__header"><h2 class="au-panel__title">Recent critical errors</h2></div>
          <div class="au-table-wrap au-table-wrap--scrollable">
            <table class="au-table au-table--compact au-table--hover">
              <thead><tr><th scope="col">Operation</th><th scope="col">Error</th><th scope="col">Queue</th><th scope="col">When</th></tr></thead>
              <tbody>
                <tr *ngFor="let error of health.recentErrors">
                  <td><span class="au-cell-title__name">{{ error.type }}</span></td>
                  <td><span class="au-badge au-badge--danger">{{ error.errorCode || 'error' }}</span> <span class="au-muted">{{ truncate(error.errorSummary, 90) }}</span></td>
                  <td class="au-mono">{{ error.queueName || '—' }}</td>
                  <td>{{ error.updatedAt | date: 'short' }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <a class="au-link-button au-mt-2" routerLink="/studio/activity">Open activity center →</a>
        </div>

        <!-- ── Workers ─────────────────────────────────────────────── -->
        <div class="au-panel au-panel--padded au-mt-3" *ngIf="activeTab === 'workers'">
          <div class="au-panel__header">
            <h2 class="au-panel__title">Worker heartbeats</h2>
            <p class="au-panel__subtitle">{{ staleWorkers }} stale</p>
          </div>
          <app-empty-state
            *ngIf="health.workers.length === 0"
            icon="activity"
            title="No worker heartbeats"
            text="Workers report their liveness here every few seconds once running."
          ></app-empty-state>
          <div class="au-table-wrap au-table-wrap--scrollable" *ngIf="health.workers.length > 0">
            <table class="au-table au-table--hover">
              <thead><tr><th scope="col">Worker</th><th scope="col">Status</th><th scope="col">Task</th><th scope="col">PID</th><th scope="col">Started</th><th scope="col">Last beat</th></tr></thead>
              <tbody>
                <tr *ngFor="let worker of health.workers">
                  <td><span class="au-cell-title__name au-mono">{{ worker.name }}</span></td>
                  <td>
                    <span class="au-badge" [class]="worker.status === 'running' ? (worker.stale ? 'au-badge--warning' : 'au-badge--success') : 'au-badge--neutral'">
                      {{ worker.stale ? 'stale' : worker.status }}
                    </span>
                  </td>
                  <td class="au-muted">{{ worker.currentTask || '—' }}</td>
                  <td class="au-mono">{{ worker.pid }}</td>
                  <td>{{ worker.startedAt ? (worker.startedAt | date: 'short') : '—' }}</td>
                  <td>{{ worker.lastBeatAt | date: 'mediumTime' }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- ── Queues ──────────────────────────────────────────────── -->
        <div class="au-panel au-panel--padded au-mt-3" *ngIf="activeTab === 'queues'">
          <div class="au-panel__header"><h2 class="au-panel__title">Queue pressure</h2></div>
          <div class="au-detail-grid">
            <div *ngFor="let queue of health.queues">
              <p class="au-kv__key au-mono">{{ queue.queue }}</p>
              <div class="au-progress" role="progressbar" [attr.aria-valuenow]="queuePercent(queue)" aria-valuemin="0" aria-valuemax="100">
                <span class="au-progress__bar" [style.width.%]="queuePercent(queue)"></span>
              </div>
              <p class="au-table__meta">
                waiting {{ queue.counts['waiting'] ?? 0 }} · active {{ queue.counts['active'] ?? 0 }} · delayed {{ queue.counts['delayed'] ?? 0 }}
                · failed {{ queue.counts['failed'] ?? 0 }} · completed {{ queue.counts['completed'] ?? 0 }}
              </p>
            </div>
          </div>
        </div>

        <!-- ── Failures ────────────────────────────────────────────── -->
        <div class="au-panel au-panel--padded au-mt-3" *ngIf="activeTab === 'failures'">
          <div class="au-panel__header">
            <h2 class="au-panel__title">Failures</h2>
            <p class="au-panel__subtitle">
              {{ health.failures.operations24h ?? '—' }} operations failed (24h) · {{ health.failures.publicationsFailed ?? '—' }} publications failed
            </p>
          </div>
          <app-empty-state
            *ngIf="health.recentErrors.length === 0"
            icon="circle-check"
            title="No recent failures"
            text="Failed operations and publications will be listed here."
          ></app-empty-state>
          <div class="au-table-wrap au-table-wrap--scrollable" *ngIf="health.recentErrors.length > 0">
            <table class="au-table au-table--hover">
              <thead><tr><th scope="col">Operation</th><th scope="col">Error code</th><th scope="col">Summary</th><th scope="col">When</th><th scope="col" class="au-table__actions"><span class="au-visually-hidden">Actions</span></th></tr></thead>
              <tbody>
                <tr *ngFor="let error of health.recentErrors">
                  <td>{{ error.type }}</td>
                  <td><span class="au-badge au-badge--danger">{{ error.errorCode || 'error' }}</span></td>
                  <td class="au-muted">{{ truncate(error.errorSummary, 120) }}</td>
                  <td>{{ error.updatedAt | date: 'short' }}</td>
                  <td class="au-table__actions"><a class="au-btn au-btn--ghost au-btn--sm" routerLink="/studio/activity">Details</a></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- ── Cost ────────────────────────────────────────────────── -->
        <ng-container *ngIf="activeTab === 'cost'">
          <div class="au-row au-mt-2">
            <div class="au-row__item au-row__item--third">
              <div class="au-panel au-panel--padded"><p class="au-panel__subtitle">AI cost today</p><p class="au-mono" style="font-size: 1.5rem; margin: 0">\${{ (costControls?.spend?.dailyUsd ?? 0) | number: '1.0-4' }}</p><p class="au-table__meta">{{ costControls?.spend?.dailyEvents ?? 0 }} events</p></div>
            </div>
            <div class="au-row__item au-row__item--third">
              <div class="au-panel au-panel--padded"><p class="au-panel__subtitle">AI cost this month</p><p class="au-mono" style="font-size: 1.5rem; margin: 0">\${{ (costControls?.spend?.monthlyUsd ?? 0) | number: '1.0-4' }}</p><p class="au-table__meta">{{ costControls?.spend?.monthlyEvents ?? 0 }} events</p></div>
            </div>
          </div>

          <div class="au-panel au-panel--padded au-mt-3">
            <div class="au-panel__header"><h2 class="au-panel__title">Budgets</h2></div>
            <app-empty-state *ngIf="(costControls?.budgets ?? []).length === 0" icon="shield-check" title="No budgets configured" text="Add a daily or monthly AI budget to cap spend per site or content type."></app-empty-state>
            <div class="au-table-wrap au-table-wrap--scrollable" *ngIf="(costControls?.budgets ?? []).length > 0">
              <table class="au-table au-table--hover">
                <thead><tr><th scope="col">Scope</th><th scope="col">Period</th><th scope="col">Limit</th><th scope="col">Hard limit</th><th scope="col">Action</th><th scope="col" class="au-table__actions"><span class="au-visually-hidden">Actions</span></th></tr></thead>
                <tbody>
                  <tr *ngFor="let budget of costControls?.budgets ?? []">
                    <td>{{ budgetScope(budget) }}</td>
                    <td>{{ budget.period }}</td>
                    <td class="au-mono">\${{ budget.limitUsd | number: '1.0-2' }}</td>
                    <td class="au-mono">{{ budget.hardLimitUsd ? '$' + (budget.hardLimitUsd | number: '1.0-2') : '—' }}</td>
                    <td><span class="au-badge" [class]="actionBadge(budget.action)">{{ budget.action }}</span></td>
                    <td class="au-table__actions"><button class="au-btn au-btn--ghost au-btn--sm" type="button" (click)="removeBudget(budget)">Remove</button></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div class="au-panel au-panel--padded au-mt-3" *ngIf="!budgetFormOpen">
            <button class="au-btn au-btn--secondary" type="button" (click)="budgetFormOpen = true">
              <app-icon name="plus"></app-icon> Add budget
            </button>
          </div>

          <div class="au-panel au-panel--padded au-mt-3" *ngIf="budgetFormOpen">
            <div class="au-panel__header"><h2 class="au-panel__title">New budget</h2></div>
            <div class="au-field-grid">
              <div class="au-field">
                <label class="au-field__label" for="budget-period">Period</label>
                <select id="budget-period" class="au-select" [(ngModel)]="budgetForm.period">
                  <option value="daily">Daily</option>
                  <option value="monthly">Monthly</option>
                </select>
              </div>
              <div class="au-field">
                <label class="au-field__label" for="budget-limit">Soft limit (USD)</label>
                <input id="budget-limit" class="au-input" type="number" step="0.1" min="0" [(ngModel)]="budgetForm.limitUsd" />
              </div>
              <div class="au-field">
                <label class="au-field__label" for="budget-hard">Hard limit (USD, optional)</label>
                <input id="budget-hard" class="au-input" type="number" step="0.1" min="0" [(ngModel)]="budgetForm.hardLimitUsd" />
              </div>
              <div class="au-field">
                <label class="au-field__label" for="budget-action">When limit reached</label>
                <select id="budget-action" class="au-select" [(ngModel)]="budgetForm.action">
                  <option value="warn">Warn</option>
                  <option value="degrade">Degrade model</option>
                  <option value="delay">Delay</option>
                  <option value="pause">Pause</option>
                </select>
              </div>
              <div class="au-field" *ngIf="budgetForm.action === 'degrade'">
                <label class="au-field__label" for="budget-model">Fallback model</label>
                <input id="budget-model" class="au-input" type="text" placeholder="deepseek-chat" [(ngModel)]="budgetForm.degradeModel" />
              </div>
            </div>
            <div class="au-form__actions">
              <button class="au-btn au-btn--primary" type="button" (click)="saveBudget()" [disabled]="savingBudget">Save budget</button>
              <button class="au-btn au-btn--ghost" type="button" (click)="budgetFormOpen = false">Cancel</button>
            </div>
          </div>
        </ng-container>
      </ng-container>
    </section>
  `,
})
export class OperationsPageComponent implements OnInit, OnDestroy {
  private readonly api = inject(StudioApiService);
  private readonly toasts = inject(ToastService);

  readonly tabs = TABS;
  activeTab: TabId = 'overview';

  health: OperationsHealth | null = null;
  costControls: CostControlsView | null = null;
  loading = false;
  loadError: string | null = null;

  budgetFormOpen = false;
  savingBudget = false;
  budgetForm = { period: 'daily', limitUsd: 10, hardLimitUsd: null as number | null, action: 'warn', degradeModel: '' };

  private refreshSub: Subscription | null = null;

  ngOnInit(): void {
    void this.load();
    this.refreshSub = timer(30_000, 30_000).subscribe(() => void this.load(true));
  }

  ngOnDestroy(): void {
    this.refreshSub?.unsubscribe();
  }

  async load(silent = false): Promise<void> {
    if (!silent) {
      this.loading = true;
    }
    this.loadError = null;
    try {
      const [health, cost] = await Promise.all([
        lastValueFrom(this.api.getOperationsHealth()),
        lastValueFrom(this.api.getCostControls()),
      ]);
      this.health = health ?? null;
      this.costControls = cost ?? null;
    } catch {
      this.loadError = 'Could not load system health. Is the backend reachable?';
    } finally {
      this.loading = false;
    }
  }

  get staleWorkers(): number {
    return this.health?.workers.filter((worker) => worker.stale).length ?? 0;
  }

  get overviewCards(): Array<{ label: string; value: string; bad: boolean }> {
    const health = this.health;
    if (!health) {
      return [];
    }
    const runningWorkers = health.workers.filter((worker) => worker.status === 'running' && !worker.stale).length;
    return [
      { label: 'Database', value: health.db, bad: health.db !== 'ok' },
      { label: 'Redis', value: health.redis, bad: health.redis !== 'ok' },
      { label: 'Workers alive', value: `${runningWorkers}/${health.workers.length}`, bad: runningWorkers === 0 && health.workers.length > 0 },
      { label: 'Broken sources', value: String(health.sources.broken ?? '—'), bad: (health.sources.broken ?? 0) > 0 },
      { label: 'Rate-limited providers', value: String(health.sources.rateLimited ?? '—'), bad: (health.sources.rateLimited ?? 0) > 0 },
      { label: 'Source items (24h)', value: String(health.throughput.sourceItems24h ?? '—'), bad: false },
    ];
  }

  queuePercent(queue: { counts: Record<string, number> }): number {
    const waiting = queue.counts['waiting'] ?? 0;
    const active = queue.counts['active'] ?? 0;
    const delayed = queue.counts['delayed'] ?? 0;
    return Math.min(100, Math.round((waiting + active + delayed) * 4));
  }

  truncate(value: string | null | undefined, max: number): string {
    if (!value) {
      return '—';
    }
    return value.length > max ? `${value.slice(0, max)}…` : value;
  }

  budgetScope(budget: CostBudgetView): string {
    if (budget.siteId && budget.contentType) {
      return `site ${this.shortId(budget.siteId)} · ${budget.contentType}`;
    }
    if (budget.siteId) {
      return `site ${this.shortId(budget.siteId)}`;
    }
    if (budget.contentType) {
      return budget.contentType;
    }
    return 'tenant-wide';
  }

  shortId(id: string): string {
    return id.slice(0, 8);
  }

  actionBadge(action: string): string {
    switch (action) {
      case 'pause':
        return 'au-badge--danger';
      case 'degrade':
      case 'delay':
        return 'au-badge--warning';
      default:
        return 'au-badge--info';
    }
  }

  async saveBudget(): Promise<void> {
    if (this.budgetForm.limitUsd <= 0) {
      this.toasts.error('Soft limit must be positive.');
      return;
    }
    this.savingBudget = true;
    try {
      await lastValueFrom(
        this.api.upsertCostBudget({
          period: this.budgetForm.period,
          limitUsd: this.budgetForm.limitUsd,
          hardLimitUsd: this.budgetForm.hardLimitUsd,
          action: this.budgetForm.action,
          degradeModel: this.budgetForm.degradeModel || null,
        }),
      );
      this.toasts.success('Budget saved.');
      this.budgetFormOpen = false;
      await this.load(true);
    } catch {
      this.toasts.error('Could not save budget.');
    } finally {
      this.savingBudget = false;
    }
  }

  async removeBudget(budget: CostBudgetView): Promise<void> {
    try {
      await lastValueFrom(this.api.deleteCostBudget(budget.id));
      this.toasts.success('Budget removed.');
      await this.load(true);
    } catch {
      this.toasts.error('Could not remove budget.');
    }
  }
}
