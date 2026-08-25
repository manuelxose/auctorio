import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { StudioApiService } from '../services/studio-api.service';
import { ToastService } from '../services/toast.service';
import { SseService } from '../services/sse.service';
import { AppIconComponent } from '../components/ui/app-icon.component';
import { AppEmptyStateComponent } from '../components/ui/app-empty-state.component';
import type { OperationItem, OperationStatus } from '../models/studio.models';

const STATUS_TABS: Array<{ id: OperationStatus | 'all'; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'running', label: 'Running' },
  { id: 'queued', label: 'Queued' },
  { id: 'succeeded', label: 'Succeeded' },
  { id: 'failed', label: 'Failed' },
  { id: 'cancelled', label: 'Cancelled' },
];

@Component({
  selector: 'app-activity-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, AppIconComponent, AppEmptyStateComponent],
  template: `
    <section class="au-page">
      <header class="au-page__header">
        <div>
          <p class="au-page__eyebrow">Background operations</p>
          <h1 class="au-page__title">Activity</h1>
          <p class="au-page__subtitle">Every indexing, generation, publication and installation job with live progress.</p>
        </div>
      </header>

      <div class="au-banner au-banner--error" *ngIf="loadError">
        <app-icon name="warning"></app-icon>
        <span class="au-banner__text">{{ loadError }}</span>
        <button class="au-banner__action" type="button" (click)="load()">Retry</button>
      </div>

      <div class="au-tabs" role="tablist" aria-label="Operation status">
        <button
          class="au-tab"
          type="button"
          role="tab"
          *ngFor="let tab of statusTabs"
          [class.is-active]="activeStatus === tab.id"
          [attr.aria-selected]="activeStatus === tab.id"
          (click)="selectStatus(tab.id)"
        >
          {{ tab.label }}
          <span class="au-tab__count" *ngIf="counts[tab.id]">{{ counts[tab.id] }}</span>
        </button>
      </div>

      <div class="au-toolbar au-mb-2">
        <label class="au-search au-flex-1">
          <app-icon name="search"></app-icon>
          <input class="au-search__input" type="search" placeholder="Search operations…" [(ngModel)]="search" (input)="debouncedLoad()" aria-label="Search operations" />
        </label>
      </div>

      <div class="au-skeleton-list" *ngIf="loading" aria-label="Loading operations">
        <div class="au-skeleton" *ngFor="let _ of [1, 2, 3]" style="height: 64px"></div>
      </div>

      <app-empty-state *ngIf="!loading && !loadError && items.length === 0" icon="activity" title="No operations yet" text="Start an indexing, generation or publication job and it will appear here."></app-empty-state>

      <div class="au-table-wrap au-table-wrap--scrollable" *ngIf="items.length > 0">
        <table class="au-table au-table--hover">
          <thead>
            <tr>
              <th scope="col">Operation</th>
              <th scope="col">Status</th>
              <th scope="col">Progress</th>
              <th scope="col">Started</th>
              <th scope="col">Duration</th>
              <th scope="col" class="au-table__actions"><span class="au-visually-hidden">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let item of items" [class.is-row-error]="item.status === 'failed'">
              <td data-label="Operation">
                <div class="au-cell-title">
                  <div>
                    <button class="au-cell-title__name au-link-button" type="button" (click)="openDetail(item)">{{ typeLabel(item.type) }}</button>
                    <div class="au-cell-title__meta">
                      {{ item.phase || '—' }} · retries: {{ item.retryCount }}
                      <ng-container *ngIf="item.entityType"> · {{ item.entityType }}</ng-container>
                    </div>
                  </div>
                </div>
              </td>
              <td data-label="Status">
                <span class="au-badge" [class]="badgeClass(item.status)">{{ statusLabel(item.status) }}</span>
              </td>
              <td data-label="Progress">
                <div class="au-progress" role="progressbar" [attr.aria-valuenow]="item.progress" aria-valuemin="0" aria-valuemax="100">
                  <span class="au-progress__bar" [style.width.%]="item.progress"></span>
                </div>
                <span class="au-table__meta">{{ item.progress }}%<ng-container *ngIf="item.totalSteps > 0"> · {{ item.completedSteps }}/{{ item.totalSteps }}</ng-container></span>
              </td>
              <td data-label="Started">{{ item.startedAt ? (item.startedAt | date: 'short') : 'Queued' }}</td>
              <td data-label="Duration">{{ durationLabel(item) }}</td>
              <td class="au-table__actions">
                <button class="au-btn au-btn--ghost au-btn--sm" type="button" (click)="openDetail(item)">Details</button>
                <button class="au-btn au-btn--ghost au-btn--sm" type="button" *ngIf="canRetry(item)" (click)="retry(item)">Retry</button>
                <button class="au-btn au-btn--ghost au-btn--sm" type="button" *ngIf="canCancel(item)" (click)="cancel(item)">Cancel</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="au-pagination" *ngIf="totalPages > 1">
        <button class="au-btn au-btn--ghost au-btn--sm" type="button" (click)="goPage(page - 1)" [disabled]="page <= 1">Previous</button>
        <span class="au-pagination__meta">Page {{ page }} of {{ totalPages }} · {{ total }} operations</span>
        <button class="au-btn au-btn--ghost au-btn--sm" type="button" (click)="goPage(page + 1)" [disabled]="page >= totalPages">Next</button>
      </div>

      <!-- Detail drawer -->
      <div class="au-drawer-backdrop" *ngIf="detail" (click)="detail = null"></div>
      <aside class="au-drawer" *ngIf="detail" role="dialog" aria-modal="true" [attr.aria-label]="'Operation details: ' + typeLabel(detail.type)">
        <header class="au-drawer__head">
          <h2 class="au-drawer__title">{{ typeLabel(detail.type) }}</h2>
          <button class="au-btn au-btn--ghost au-btn--sm" type="button" (click)="detail = null" aria-label="Close details">
            <app-icon name="close"></app-icon>
          </button>
        </header>
        <dl class="au-detail-grid">
          <dt>Status</dt><dd>{{ statusLabel(detail.status) }}</dd>
          <dt>Progress</dt><dd>{{ detail.progress }}% ({{ detail.completedSteps }}/{{ detail.totalSteps }})</dd>
          <dt>Phase</dt><dd>{{ detail.phase || '—' }}</dd>
          <dt>Started</dt><dd>{{ detail.startedAt ? (detail.startedAt | date: 'medium') : 'Queued' }}</dd>
          <dt>Finished</dt><dd>{{ detail.finishedAt ? (detail.finishedAt | date: 'medium') : '—' }}</dd>
          <dt>Duration</dt><dd>{{ durationLabel(detail) }}</dd>
          <dt>Retries</dt><dd>{{ detail.retryCount }}</dd>
          <dt>Type</dt><dd>{{ detail.type }}</dd>
          <dt>Error code</dt><dd>{{ detail.errorCode || '—' }}</dd>
        </dl>
        <div class="au-banner au-banner--error" *ngIf="detail.errorSummary">
          <app-icon name="warning"></app-icon>
          <span class="au-banner__text">{{ detail.errorSummary }}</span>
        </div>
        <div class="au-form__actions">
          <button class="au-btn au-btn--primary au-btn--sm" type="button" *ngIf="canRetry(detail)" (click)="retry(detail)">Retry</button>
          <button class="au-btn au-btn--ghost au-btn--sm" type="button" *ngIf="canCancel(detail)" (click)="cancel(detail)">Cancel</button>
          <button class="au-btn au-btn--ghost au-btn--sm" type="button" (click)="detail = null">Close</button>
        </div>
      </aside>
    </section>
  `,
})
export class ActivityPageComponent implements OnInit, OnDestroy {
  private readonly api = inject(StudioApiService);
  private readonly toast = inject(ToastService);
  private readonly sse = inject(SseService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private searchTimer: ReturnType<typeof setTimeout> | null = null;
  private sseUnsubscribe: (() => void) | null = null;
  private sseSubscription: Subscription | null = null;

  readonly statusTabs = STATUS_TABS;
  activeStatus: OperationStatus | 'all' = 'all';
  search = '';
  page = 1;
  pageSize = 20;
  total = 0;
  counts: Record<string, number> = {};
  items: OperationItem[] = [];
  loading = true;
  loadError = '';
  detail: OperationItem | null = null;

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.total / this.pageSize));
  }

  ngOnInit(): void {
    const status = this.route.snapshot.queryParamMap.get('status');
    if (status && STATUS_TABS.some((tab) => tab.id === status)) {
      this.activeStatus = status as OperationStatus | 'all';
    }
    this.load();
    this.sseUnsubscribe = this.sse.subscribe((event) => {
      if (event.type.startsWith('operation.')) {
        this.refreshSilently();
      }
    });
    this.sseSubscription = this.sse.connection$.subscribe();
  }

  ngOnDestroy(): void {
    this.sseUnsubscribe?.();
    this.sseSubscription?.unsubscribe();
    if (this.searchTimer) {
      clearTimeout(this.searchTimer);
    }
  }

  load(): void {
    this.loading = true;
    this.loadError = '';
    this.api.listOperations({
      page: this.page,
      pageSize: this.pageSize,
      status: this.activeStatus,
      search: this.search || undefined,
    }).subscribe({
      next: (response) => {
        this.items = response.items;
        this.total = response.total;
        this.counts = response.counts;
        this.loading = false;
        if (this.detail) {
          this.detail = response.items.find((item) => item.id === this.detail?.id) ?? this.detail;
        }
      },
      error: () => {
        this.loading = false;
        this.loadError = 'Operations could not be loaded. Try again.';
      },
    });
  }

  private refreshSilently(): void {
    this.api.listOperations({
      page: this.page,
      pageSize: this.pageSize,
      status: this.activeStatus,
      search: this.search || undefined,
    }).subscribe({
      next: (response) => {
        this.items = response.items;
        this.total = response.total;
        this.counts = response.counts;
        if (this.detail) {
          this.detail = response.items.find((item) => item.id === this.detail?.id) ?? this.detail;
        }
      },
      error: () => undefined,
    });
  }

  debouncedLoad(): void {
    if (this.searchTimer) {
      clearTimeout(this.searchTimer);
    }
    this.searchTimer = setTimeout(() => {
      this.page = 1;
      this.load();
    }, 350);
  }

  selectStatus(status: OperationStatus | 'all'): void {
    this.activeStatus = status;
    this.page = 1;
    this.load();
    void this.router.navigate([], {
      queryParams: { status: status === 'all' ? null : status },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  goPage(page: number): void {
    this.page = page;
    this.load();
  }

  openDetail(item: OperationItem): void {
    this.detail = item;
  }

  canRetry(item: OperationItem): boolean {
    if (item.status !== 'failed' && item.status !== 'partial') {
      return false;
    }
    const retryable = Boolean(item.metadata && typeof item.metadata === 'object' && (item.metadata as Record<string, unknown>)['retryable']);
    return retryable || item.status === 'partial';
  }

  canCancel(item: OperationItem): boolean {
    return ['queued', 'running', 'retrying'].includes(item.status);
  }

  retry(item: OperationItem): void {
    this.api.retryOperation(item.id).subscribe({
      next: () => {
        this.toast.success('Operation queued for retry.');
        this.detail = null;
        this.load();
      },
      error: (err) => this.toast.error(err?.error?.error?.message || 'Retry failed.'),
    });
  }

  cancel(item: OperationItem): void {
    this.api.cancelOperation(item.id).subscribe({
      next: () => {
        this.toast.info('Operation cancelled.');
        this.detail = null;
        this.load();
      },
      error: (err) => this.toast.error(err?.error?.error?.message || 'Cancellation failed.'),
    });
  }

  typeLabel(type: string): string {
    return type.replace(/_/g, ' ');
  }

  statusLabel(status: OperationStatus): string {
    switch (status) {
      case 'queued': return 'Queued';
      case 'running': return 'Running';
      case 'retrying': return 'Retrying';
      case 'succeeded': return 'Succeeded';
      case 'partial': return 'Partially succeeded';
      case 'failed': return 'Failed';
      case 'cancelled': return 'Cancelled';
      default: return status;
    }
  }

  badgeClass(status: OperationStatus): string {
    switch (status) {
      case 'succeeded': return 'au-badge--success';
      case 'running':
      case 'queued':
      case 'retrying': return 'au-badge--warning';
      case 'failed': return 'au-badge--danger';
      case 'partial': return 'au-badge--warning';
      default: return 'au-badge--neutral';
    }
  }

  durationLabel(item: OperationItem): string {
    if (!item.startedAt) {
      return '—';
    }
    const end = item.finishedAt ? new Date(item.finishedAt).getTime() : Date.now();
    const ms = Math.max(0, end - new Date(item.startedAt).getTime());
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) {
      return `${seconds}s`;
    }
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) {
      return `${minutes}m ${seconds % 60}s`;
    }
    const hours = Math.floor(minutes / 60);
    return `${hours}h ${minutes % 60}m`;
  }
}
