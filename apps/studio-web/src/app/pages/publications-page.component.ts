import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Subscription, timer } from 'rxjs';
import { StudioApiService } from '../services/studio-api.service';
import { AppContextService } from '../services/app-context.service';
import { ConfirmService } from '../services/confirm.service';
import { ToastService } from '../services/toast.service';
import { AppIconComponent } from '../components/ui/app-icon.component';
import { AppEmptyStateComponent } from '../components/ui/app-empty-state.component';
import { AppPopoverComponent } from '../components/ui/app-popover.component';
import type { PublicationChannel, PublicationState, StudioPublication, StudioSite } from '../models/studio.models';

@Component({
  selector: 'app-publications-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, AppIconComponent, AppEmptyStateComponent, AppPopoverComponent],
  template: `
    <section class="au-page">
      <header class="au-page__header">
        <div>
          <h1 class="au-page__title">Results</h1>
          <p class="au-page__subtitle">Every publication of this site: publish now, retry, cancel, unpublish or delete. Dates are changed in Calendar.</p>
        </div>
        <div class="au-page__actions">
          <a class="au-btn au-btn--secondary" routerLink="/studio/calendar">
            <app-icon name="calendar"></app-icon>
            Open calendar
          </a>
        </div>
      </header>

      <div class="au-banner au-banner--info" *ngIf="projectId">
        <app-icon name="filter"></app-icon>
        <span class="au-banner__text">Showing the publications of one article.</span>
        <a class="au-banner__action" routerLink="/studio/results">Show all</a>
      </div>

      <div class="au-toolbar">
        <div class="au-search">
          <app-icon name="search"></app-icon>
          <input
            class="au-input au-input--search"
            type="search"
            placeholder="Search title, URL…"
            [(ngModel)]="filters.search"
            (keyup.enter)="applyFilters()"
          />
        </div>
        <select class="au-select au-filter-select" [(ngModel)]="filters.channel" (ngModelChange)="applyFilters()" aria-label="Filter by channel">
          <option value="">All channels</option>
          <option value="website">Website</option>
          <option value="x">X</option>
          <option value="instagram">Instagram</option>
        </select>
        <select class="au-select au-filter-select" [(ngModel)]="filters.status" (ngModelChange)="applyFilters()" aria-label="Filter by state">
          <option value="">All states</option>
          <option *ngFor="let state of states" [ngValue]="state">{{ state }}</option>
        </select>
        <label class="au-checkbox">
          <input type="checkbox" [(ngModel)]="filters.failed" (ngModelChange)="applyFilters()" />
          Failed only
        </label>
        <div class="au-toolbar__spacer"></div>
        <select class="au-select au-filter-select" [(ngModel)]="filters.sort" (ngModelChange)="applyFilters()" aria-label="Sort publications">
          <option value="scheduled">Sort: scheduled</option>
          <option value="created">Sort: created</option>
          <option value="updated">Sort: updated</option>
        </select>
        <select class="au-select au-filter-select" [(ngModel)]="filters.direction" (ngModelChange)="applyFilters()" aria-label="Sort direction">
          <option value="desc">Newest first</option>
          <option value="asc">Oldest first</option>
        </select>
        <button class="au-btn au-btn--ghost au-btn--sm" type="button" (click)="load()" [disabled]="loading">
          <app-icon name="refresh"></app-icon>
          Refresh
        </button>
      </div>
      <div class="au-banner au-banner--error" *ngIf="error">
        <app-icon name="warning"></app-icon>
        <span class="au-banner__text">{{ error }}</span>
      </div>

      <section class="au-panel">
        @if (loading && items.length === 0) {
          <div class="au-skeleton-row">
            <div class="au-skeleton au-skeleton-avatar"></div>
            <div class="au-skeleton au-skeleton-line"></div>
            <div class="au-skeleton au-skeleton-line au-skeleton-line--sm"></div>
          </div>
          <div class="au-skeleton-row">
            <div class="au-skeleton au-skeleton-avatar"></div>
            <div class="au-skeleton au-skeleton-line"></div>
            <div class="au-skeleton au-skeleton-line au-skeleton-line--sm"></div>
          </div>
          <div class="au-skeleton-row">
            <div class="au-skeleton au-skeleton-avatar"></div>
            <div class="au-skeleton au-skeleton-line"></div>
            <div class="au-skeleton au-skeleton-line au-skeleton-line--sm"></div>
          </div>
        } @else if (items.length === 0) {
          <app-empty-state
            icon="publications"
            title="No publications match the current filters"
            text="Adjust the filters or schedule something from the content workspace."
          >
            <a class="au-btn au-btn--secondary au-btn--sm" routerLink="/studio/content">Open content</a>
          </app-empty-state>
        } @else {
          <div class="au-table-wrap au-table-wrap--scrollable">
            <table class="au-table">
              <thead>
                <tr>
                  <th style="width: 40px"></th>
                  <th>Publication</th>
                  <th>Channel</th>
                  <th>Destination</th>
                  <th>Status</th>
                  <th>Scheduled</th>
                  <th>Published</th>
                  <th>Updated</th>
                  <th style="width: 44px"></th>
                </tr>
              </thead>
              <tbody>
                <tr *ngFor="let item of items">
                  <td>
                    <img class="au-table__thumb" *ngIf="item.assetUrl" [src]="item.assetUrl" alt="" loading="lazy" />
                    <span class="au-table__thumb" *ngIf="!item.assetUrl"></span>
                  </td>
                  <td style="max-width: 340px">
                    <span class="au-table__title au-truncate">{{ item.socialContent?.body?.slice(0, 80) || item.version?.title || item.project?.title || '—' }}</span>
                    <a class="au-table__sub au-link" *ngIf="item.externalUrl" [href]="item.externalUrl" target="_blank" rel="noopener">
                      {{ item.externalUrl }}
                      <app-icon name="external"></app-icon>
                    </a>
                    <span class="au-table__sub" *ngIf="item.status === 'published'">
                      <span class="au-badge" [class]="item.metadata?.verification?.state === 'verified' ? 'au-badge--success' : 'au-badge--warning'">{{ verificationLabel(item) }}</span>
                    </span>
                    <span class="au-table__sub" *ngIf="item.lastError">
                      <span class="au-badge au-badge--danger">{{ item.lastError }}</span>
                    </span>
                  </td>
                  <td><span class="au-channel" [class]="'au-channel--' + item.channel">{{ item.channel }}</span></td>
                  <td class="au-nowrap">{{ destination(item) }}</td>
                  <td>
                    <span class="au-badge" [class]="statusClass(item.status)">{{ item.status }}</span>
                    <span class="au-table__sub au-muted" *ngIf="item.failureReason">{{ failureReasonLabel(item.failureReason) }}</span>
                  </td>
                  <td class="au-nowrap au-muted">{{ dateLabel(item.scheduledFor) }}</td>
                  <td class="au-nowrap au-muted">{{ dateLabel(item.publishedAt) }}</td>
                  <td class="au-nowrap au-muted">{{ dateLabel(item.updatedAt) }}</td>
                  <td>
                    <button
                      class="au-btn au-btn--ghost au-btn--icon au-btn--sm"
                      type="button"
                      #menuTrigger
                      (click)="rowMenu.toggle(menuTrigger)"
                      [attr.aria-label]="'Actions for ' + (item.version?.title || item.project?.title || 'publication')"
                      aria-haspopup="menu"
                    >
                      <app-icon name="dots"></app-icon>
                    </button>
                    <app-popover #rowMenu>
                      <div class="au-menu">
                        <button class="au-menu__item" type="button" (click)="rowMenu.hide(); inspect(item)">
                          <app-icon name="eye"></app-icon>
                          Details
                        </button>
                        <a class="au-menu__item" [routerLink]="['/studio/content', item.projectId]" (click)="rowMenu.hide()">
                          <app-icon name="content"></app-icon>
                          Open content
                        </a>
                        <button class="au-menu__item" type="button" *ngIf="item.status === 'failed'" (click)="rowMenu.hide(); retry(item)">
                          <app-icon name="refresh"></app-icon>
                          Retry
                        </button>
                        <button class="au-menu__item" type="button" *ngIf="item.status === 'scheduled' || item.status === 'ready' || item.status === 'draft'" (click)="rowMenu.hide(); publishNow(item)">
                          <app-icon name="play"></app-icon>
                          Publish now
                        </button>
                        <button class="au-menu__item" type="button" *ngIf="item.status === 'scheduled'" (click)="rowMenu.hide(); cancel(item)">
                          <app-icon name="close"></app-icon>
                          Cancel
                        </button>
                        <button class="au-menu__item" type="button" *ngIf="item.status === 'published'" (click)="rowMenu.hide(); unpublish(item)">
                          <app-icon name="arrow-down"></app-icon>
                          Unpublish
                        </button>
                        <div class="au-menu__sep"></div>
                        <button class="au-menu__item is-danger" type="button" *ngIf="item.status !== 'deleted'" (click)="rowMenu.hide(); remove(item)">
                          <app-icon name="trash"></app-icon>
                          Delete record
                        </button>
                      </div>
                    </app-popover>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          @if (totalPages > 1) {
            <div class="au-pager">
              <button class="au-btn au-btn--ghost au-btn--sm" type="button" [disabled]="page <= 1" (click)="goPage(page - 1)">Previous</button>
              <span>Page {{ page }} of {{ totalPages }} · {{ total }} publications</span>
              <button class="au-btn au-btn--ghost au-btn--sm" type="button" [disabled]="page >= totalPages" (click)="goPage(page + 1)">Next</button>
            </div>
          }
        }
      </section>

      <aside class="au-panel" *ngIf="selected" aria-label="Publication details">
        <div class="au-panel__header">
          <div>
            <h2 class="au-panel__title">{{ selected.project?.title || 'Publication' }}</h2>
            <p class="au-panel__subtitle">Operational record</p>
          </div>
          <button class="au-btn au-btn--ghost au-btn--sm" type="button" (click)="selected = null" aria-label="Close publication details">
            <app-icon name="close"></app-icon>
            Close
          </button>
        </div>
        <div class="au-panel--padded">
          <dl class="au-kv">
            <dt>Channel</dt><dd>{{ selected.channel }}</dd>
            <dt>Destination</dt><dd>{{ destination(selected) }}</dd>
            <dt>Status</dt><dd><span class="au-badge" [class]="statusClass(selected.status)">{{ selected.status }}</span></dd>
            <dt>Attempts</dt><dd>{{ selected.attempts?.length || 0 }}</dd>
            <dt>Failure</dt><dd class="au-muted">{{ selected.lastError || 'No failure recorded' }}</dd>
            <dt>Reason</dt><dd class="au-muted">{{ selected.failureReason ? failureReasonLabel(selected.failureReason) : '—' }}</dd>
            <dt>Remote record</dt><dd class="au-muted">{{ selected.externalId || 'None yet' }}</dd>
            <dt>Verification</dt><dd class="au-muted">{{ verificationLabel(selected) }}</dd>
          </dl>
          <!-- Dates have a single home: the calendar. -->
          <p class="au-mt-3 au-inline">
            <span>Scheduled for <strong>{{ selected.scheduledFor ? dateLabel(selected.scheduledFor) : 'not scheduled' }}</strong></span>
            <a *ngIf="canEdit(selected)" class="au-btn au-btn--secondary au-btn--sm" routerLink="/studio/calendar">
              <app-icon name="calendar"></app-icon>
              Change in Calendar
            </a>
          </p>
          <ng-container *ngIf="selected.attempts?.length">
            <h3 class="au-panel__title au-mt-3 au-mb-2">Attempt history</h3>
            <div class="au-row" *ngFor="let attempt of selected.attempts">
              <span class="au-row__title">Attempt {{ attempt.attemptNumber }}</span>
              <span class="au-badge" [class]="statusClass(attempt.status)">{{ attempt.status }}</span>
              <span class="au-row__meta">{{ dateLabel(attempt.startedAt) }}</span>
            </div>
          </ng-container>
        </div>
      </aside>
    </section>
  `,
})
export class PublicationsPageComponent implements OnInit, OnDestroy {
  private readonly api = inject(StudioApiService);
  private readonly appContext = inject(AppContextService);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);

  states: PublicationState[] = ['draft', 'ready', 'scheduled', 'queued', 'publishing', 'published', 'failed', 'canceled', 'deleted', 'unpublished'];
  items: StudioPublication[] = [];
  page = 1;
  pageSize = 20;
  total = 0;
  selected: StudioPublication | null = null;
  loading = false;
  error = '';
  /** ?projectId= (from an article) filters to its publications; ?id= (from Calendar) opens one. */
  private readonly query = inject(ActivatedRoute, { optional: true })?.snapshot.queryParamMap;
  readonly projectId = this.query?.get('projectId') ?? '';
  filters = {
    channel: '' as '' | PublicationChannel,
    status: '' as '' | PublicationState,
    siteId: this.appContext.activeSite()?.id ?? '',
    search: '',
    failed: false,
    sort: 'scheduled' as 'scheduled' | 'created' | 'updated',
    direction: 'desc' as 'asc' | 'desc',
  };
  private refreshSubscription: Subscription | null = null;

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.total / this.pageSize));
  }

  ngOnInit(): void {
    this.load();
    const id = this.query?.get('id');
    if (id) this.inspect({ id } as StudioPublication);
    this.refreshSubscription = timer(30_000, 30_000).subscribe(() => {
      if (!document.hidden) {
        this.load(true);
      }
    });
  }

  ngOnDestroy(): void {
    this.refreshSubscription?.unsubscribe();
  }

  applyFilters(): void {
    this.page = 1;
    this.load();
  }

  goPage(page: number): void {
    this.page = page;
    this.load();
  }

  load(silent = false): void {
    if (!silent) {
      this.loading = true;
    }
    this.api
      .listPublicationsV2(this.page, this.pageSize, {
        channel: this.filters.channel || undefined,
        status: this.filters.status || undefined,
        siteId: this.filters.siteId || undefined,
        projectId: this.projectId || undefined,
        search: this.filters.search || undefined,
        failed: this.filters.failed || undefined,
        sort: this.filters.sort,
        direction: this.filters.direction,
      })
      .subscribe({
        next: (response) => {
          this.items = response.items;
          this.total = response.total;
          this.loading = false;
        },
        error: () => {
          this.loading = false;
          if (!silent) {
            this.items = [];
            this.total = 0;
          }
        },
      });
  }

  destination(item: StudioPublication): string {
    if (item.channel === 'website') {
      return item.site?.name ?? 'Website';
    }
    return item.account?.displayName ?? item.channel;
  }

  inspect(item: StudioPublication): void {
    this.api.getPublication(item.id).subscribe({ next: (publication) => { this.selected = publication; }, error: () => { this.error = 'Publication details could not be loaded.'; } });
  }

  canEdit(item: StudioPublication): boolean { return ['draft', 'ready', 'scheduled', 'failed', 'canceled'].includes(item.status); }

  statusClass(status: string): string {
    switch (status) {
      case 'published':
      case 'draft_synced':
        return 'au-badge--success';
      case 'failed':
        return 'au-badge--danger';
      case 'scheduled':
      case 'queued':
      case 'publishing':
      case 'processing':
        return 'au-badge--warning';
      default:
        return 'au-badge--neutral';
    }
  }

  verificationLabel(item: StudioPublication): string {
    const verification = item.metadata?.verification;
    if (item.status !== 'published') return '—';
    if (!verification) return 'Remote URL not verified';
    return verification.state === 'verified' ? 'Remote URL verified' : `Unverified: ${verification.detail}`;
  }

  failureReasonLabel(reason: string): string {
    return ({
      awaiting_retry: 'Retrying automatically',
      retries_exhausted: 'Retries exhausted',
      permanent_failure: 'Needs a fix before retry',
      release_blocked: 'Blocked before release',
      enqueue_failed: 'Could not be queued',
      stalled: 'Stalled: check the destination, then retry',
    } as Record<string, string>)[reason] ?? reason.replace(/_/g, ' ');
  }

  private blockerMessage(err: unknown): string | null {
    const message = (err as { error?: { error?: { message?: string } } })?.error?.error?.message ?? '';
    if (!message.startsWith('release_blocked:')) return null;
    return `Not released. Fix first: ${message.slice('release_blocked:'.length).split(',').map((code) => code.replace(/_/g, ' ')).join(', ')}.`;
  }

  dateLabel(value: string | null): string {
    return value ? new Date(value).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
  }

  retry(item: StudioPublication): void {
    this.api.retryPublication(item.id).subscribe({
      next: () => {
        this.toast.success('Retry queued.');
        this.load(true);
      },
      error: () => this.toast.error('The publication could not be retried.'),
    });
  }

  publishNow(item: StudioPublication): void {
    this.api.publishNow(item.id).subscribe({
      next: () => {
        this.toast.success('Publishing started.');
        this.load(true);
      },
      // 409 release_blocked:<codes> names what must be fixed before a human release.
      error: (err) => this.toast.error(this.blockerMessage(err) ?? 'The publication could not be started.'),
    });
  }

  cancel(item: StudioPublication): void {
    void this.confirmCancel(item);
  }

  private async confirmCancel(item: StudioPublication): Promise<void> {
    const confirmed = await this.confirm.confirm({
      title: `Cancel this scheduled ${item.channel} publication?`,
      message: 'The scheduled publication is removed and will not run.',
      confirmLabel: 'Cancel publication',
      danger: true,
    });
    if (!confirmed) {
      return;
    }
    this.api.cancelPublication(item.id).subscribe({
      next: () => {
        this.toast.success('Publication canceled.');
        this.load(true);
      },
      error: () => this.toast.error('The publication could not be canceled.'),
    });
  }

  unpublish(item: StudioPublication): void {
    void this.confirmUnpublish(item);
  }

  private async confirmUnpublish(item: StudioPublication): Promise<void> {
    const destination = this.destination(item);
    const confirmed = await this.confirm.confirm({
      title: `Unpublish from ${destination}?`,
      message: `${item.channel === 'website' ? 'The remote article is removed' : 'The remote post is deleted'} on ${destination}. This cannot be undone automatically.`,
      confirmLabel: 'Unpublish',
      danger: true,
    });
    if (!confirmed) {
      return;
    }
    this.api.unpublishPublication(item.id).subscribe({
      next: () => {
        this.toast.success('Unpublish started.');
        this.load(true);
      },
      error: () => this.toast.error('The publication could not be unpublished.'),
    });
  }

  remove(item: StudioPublication): void {
    void this.confirmRemove(item);
  }

  private async confirmRemove(item: StudioPublication): Promise<void> {
    const publishedExternally = item.status === 'published' && Boolean(item.externalId);
    const confirmed = await this.confirm.confirm({
      title: publishedExternally ? 'Delete the local record?' : `Delete this ${item.channel} publication record?`,
      message: publishedExternally
        ? `This publication is live on ${this.destination(item)}. Deleting here only removes the local record — unpublish first to remove it externally.`
        : 'Only the local publication record is removed.',
      confirmLabel: 'Delete record',
      danger: true,
    });
    if (!confirmed) {
      return;
    }
    this.api.deletePublication(item.id).subscribe({
      next: () => {
        this.toast.success('Publication record deleted.');
        this.load(true);
      },
      error: () => this.toast.error('The publication record could not be deleted.'),
    });
  }
}
