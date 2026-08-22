import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Subscription, timer } from 'rxjs';
import { StudioApiService } from '../services/studio-api.service';
import { AppContextService } from '../services/app-context.service';
import type { PublicationChannel, PublicationState, StudioPublication, StudioSite } from '../models/studio.models';

@Component({
  selector: 'app-publications-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <section class="au-page">
      <header class="au-page__header">
        <div>
          <h1 class="au-page__title">Publications</h1>
          <p class="au-page__subtitle">Operational view of every article and social publication.</p>
        </div>
      </header>

      <div class="au-toolbar au-toolbar--wrap">
        <select class="au-input au-input--inline" [(ngModel)]="filters.channel" (ngModelChange)="applyFilters()">
          <option value="">All channels</option>
          <option value="website">Website</option>
          <option value="x">X</option>
          <option value="instagram">Instagram</option>
        </select>
        <select class="au-input au-input--inline" [(ngModel)]="filters.status" (ngModelChange)="applyFilters()">
          <option value="">All states</option>
          <option *ngFor="let state of states" [ngValue]="state">{{ state }}</option>
        </select>
        <select class="au-input au-input--inline" [(ngModel)]="filters.siteId" (ngModelChange)="applyFilters()">
          <option value="">All sites</option>
          <option *ngFor="let site of sites" [ngValue]="site.id">{{ site.name }}</option>
        </select>
        <input
          class="au-input au-input--search"
          type="search"
          placeholder="Search title, URL, source…"
          [(ngModel)]="filters.search"
          (keyup.enter)="applyFilters()"
        />
        <label class="au-check">
          <input type="checkbox" [(ngModel)]="filters.failed" (ngModelChange)="applyFilters()" />
          Failed only
        </label>
        <select class="au-input au-input--inline" [(ngModel)]="filters.sort" (ngModelChange)="applyFilters()">
          <option value="scheduled">Sort: scheduled</option>
          <option value="created">Sort: created</option>
          <option value="updated">Sort: updated</option>
        </select>
        <select class="au-input au-input--inline" [(ngModel)]="filters.direction" (ngModelChange)="applyFilters()">
          <option value="desc">Newest first</option>
          <option value="asc">Oldest first</option>
        </select>
        <button class="au-button au-button--ghost" type="button" (click)="load()">Refresh</button>
      </div>
      <div class="au-banner au-banner--error" *ngIf="error">{{ error }}</div>

      <section class="au-surface au-surface--table">
        <div class="au-empty" *ngIf="items.length === 0">No publications match the current filters.</div>
        <table class="au-table" *ngIf="items.length > 0">
          <thead>
            <tr>
              <th></th>
              <th>Publication</th>
              <th>Project</th>
              <th>Channel</th>
              <th>Destination</th>
              <th>Status</th>
              <th>Scheduled</th>
              <th>Published</th>
              <th>Updated</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let item of items">
              <td>
                <img class="au-thumb" *ngIf="item.assetUrl" [src]="item.assetUrl" alt="" />
              </td>
              <td>
                <div class="au-cell-title">{{ item.socialContent?.body?.slice(0, 80) || item.version?.title || item.project?.title || '—' }}</div>
                <div class="au-cell-meta" *ngIf="item.externalUrl">
                  <a [href]="item.externalUrl" target="_blank" rel="noopener">{{ item.externalUrl }}</a>
                </div>
                <div class="au-cell-meta au-cell-error" *ngIf="item.lastError">{{ item.lastError }}</div>
              </td>
              <td><a class="au-link" [routerLink]="['/studio/content', item.projectId]">{{ item.project?.title || '—' }}</a></td>
              <td><span class="au-channel-badge" [ngClass]="'au-channel-badge--' + item.channel">{{ item.channel }}</span></td>
              <td>{{ destination(item) }}</td>
              <td><span class="au-tag" [ngClass]="statusClass(item.status)">{{ item.status }}</span></td>
              <td class="au-cell-date">{{ dateLabel(item.scheduledFor) }}</td>
              <td class="au-cell-date">{{ dateLabel(item.publishedAt) }}</td>
              <td class="au-cell-date">{{ dateLabel(item.updatedAt) }}</td>
              <td class="au-cell-actions">
                <button class="au-button au-button--ghost au-button--xs" type="button" (click)="inspect(item)">Details</button>
                <button class="au-button au-button--ghost au-button--xs" type="button" *ngIf="item.status === 'failed'" (click)="retry(item)">Retry</button>
                <button class="au-button au-button--ghost au-button--xs" type="button" *ngIf="item.status === 'scheduled' || item.status === 'ready' || item.status === 'draft'" (click)="publishNow(item)">Publish now</button>
                <button class="au-button au-button--ghost au-button--xs" type="button" *ngIf="item.status === 'scheduled'" (click)="cancel(item)">Cancel</button>
                <button class="au-button au-button--ghost au-button--xs" type="button" *ngIf="item.status === 'published'" (click)="unpublish(item)">Unpublish</button>
                <button class="au-button au-button--ghost au-button--xs au-button--danger" type="button" *ngIf="item.status !== 'deleted'" (click)="remove(item)">Delete</button>
              </td>
            </tr>
          </tbody>
        </table>

        <div class="au-pagination" *ngIf="totalPages > 1">
          <button class="au-button au-button--ghost" type="button" [disabled]="page <= 1" (click)="goPage(page - 1)">‹ Prev</button>
          <span>Page {{ page }} of {{ totalPages }} ({{ total }} items)</span>
          <button class="au-button au-button--ghost" type="button" [disabled]="page >= totalPages" (click)="goPage(page + 1)">Next ›</button>
        </div>
      </section>

      <aside class="au-publication-detail" *ngIf="selected" aria-label="Publication details">
        <div class="au-publication-detail__head"><div><p class="au-eyebrow">Operational record</p><h2>{{ selected.project?.title || 'Publication' }}</h2></div><button class="au-button au-button--ghost au-button--sm" type="button" (click)="selected = null" aria-label="Close publication details">Close</button></div>
        <dl class="au-kv"><dt>Channel</dt><dd>{{ selected.channel }}</dd><dt>Destination</dt><dd>{{ destination(selected) }}</dd><dt>Status</dt><dd><span class="au-tag" [ngClass]="statusClass(selected.status)">{{ selected.status }}</span></dd><dt>Attempts</dt><dd>{{ selected.attempts?.length || 0 }}</dd><dt>Failure</dt><dd>{{ selected.lastError || 'No failure recorded' }}</dd></dl>
        <form class="au-form" *ngIf="canEdit(selected)" (ngSubmit)="saveSchedule()"><label class="au-field"><span class="au-field__label">Scheduled time</span><input class="au-input" type="datetime-local" name="scheduledFor" [(ngModel)]="scheduleDraft" required /></label><button class="au-button au-button--primary" type="submit" [disabled]="saving">{{ saving ? 'Saving...' : 'Save schedule' }}</button></form>
        <div class="au-publication-attempts" *ngIf="selected.attempts?.length"><h3>Attempt history</h3><div class="au-row" *ngFor="let attempt of selected.attempts"><span class="au-row__title">Attempt {{ attempt.attemptNumber }}</span><span class="au-tag">{{ attempt.status }}</span><span class="au-row__meta">{{ dateLabel(attempt.startedAt) }}</span></div></div>
      </aside>
    </section>
  `,
  styles: [
    `
      .au-toolbar--wrap { flex-wrap: wrap; }
      .au-check { display: inline-flex; align-items: center; gap: 0.35rem; font-size: 0.85rem; }
      .au-surface--table { overflow-x: auto; }
      .au-table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
      .au-table th { text-align: left; padding: 0.5rem 0.6rem; border-bottom: 1px solid var(--au-border, #e5e7eb); color: var(--au-muted, #6b7280); font-weight: 600; white-space: nowrap; }
      .au-table td { padding: 0.55rem 0.6rem; border-bottom: 1px solid var(--au-border-subtle, #f3f4f6); vertical-align: top; }
      .au-thumb { width: 34px; height: 34px; object-fit: cover; border-radius: 6px; }
      .au-cell-title { font-weight: 600; max-width: 320px; }
      .au-cell-meta { font-size: 0.72rem; color: var(--au-muted, #6b7280); max-width: 260px; overflow: hidden; text-overflow: ellipsis; }
      .au-cell-error { color: var(--au-danger, #dc2626); }
      .au-cell-date { white-space: nowrap; font-variant-numeric: tabular-nums; font-size: 0.75rem; color: var(--au-muted, #6b7280); }
      .au-cell-actions { white-space: nowrap; }
      .au-button--xs { padding: 0.2rem 0.5rem; font-size: 0.75rem; }
      .au-button--danger { color: var(--au-danger, #dc2626); }
      .au-pagination { display: flex; align-items: center; gap: 0.75rem; padding: 0.75rem 0.6rem; font-size: 0.85rem; }
      .au-channel-badge { text-transform: uppercase; font-size: 0.65rem; padding: 2px 6px; border-radius: 4px; }
      .au-channel-badge--website { background: #dbeafe; color: #1d4ed8; }
      .au-channel-badge--x { background: #111; color: #fff; }
      .au-channel-badge--instagram { background: #fdf2f8; color: #be185d; }
      .au-publication-detail { margin-top: 1rem; padding: 1rem; border: 1px solid var(--au-border, #e5e7eb); border-radius: 12px; background: var(--au-surface, #fff); }
      .au-publication-detail__head { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; margin-bottom: 1rem; }
      .au-publication-detail h2 { margin: 0; font-size: 1.1rem; }
      .au-publication-detail h3 { margin: 1rem 0 0.4rem; font-size: 0.9rem; }
      .au-publication-attempts .au-row { padding: 0.5rem 0; }
    `,
  ],
})
export class PublicationsPageComponent implements OnInit, OnDestroy {
  private readonly api = inject(StudioApiService);
  private readonly appContext = inject(AppContextService);

  states: PublicationState[] = ['draft', 'ready', 'scheduled', 'queued', 'publishing', 'published', 'failed', 'canceled', 'deleted', 'unpublished'];
  items: StudioPublication[] = [];
  sites: StudioSite[] = [];
  page = 1;
  pageSize = 20;
  total = 0;
  selected: StudioPublication | null = null;
  scheduleDraft = '';
  saving = false;
  error = '';
  filters = {
    channel: '' as '' | PublicationChannel,
    status: '' as '' | PublicationState,
    siteId: '',
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
    this.sites = this.appContext.sites();
    this.load();
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
    this.api
      .listPublicationsV2(this.page, this.pageSize, {
        channel: this.filters.channel || undefined,
        status: this.filters.status || undefined,
        siteId: this.filters.siteId || undefined,
        search: this.filters.search || undefined,
        failed: this.filters.failed || undefined,
        sort: this.filters.sort,
        direction: this.filters.direction,
      })
      .subscribe({
        next: (response) => {
          this.items = response.items;
          this.total = response.total;
        },
        error: () => {
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
    this.api.getPublication(item.id).subscribe({ next: (publication) => { this.selected = publication; this.scheduleDraft = publication.scheduledFor ? new Date(publication.scheduledFor).toISOString().slice(0, 16) : ''; }, error: () => { this.error = 'Publication details could not be loaded.'; } });
  }

  canEdit(item: StudioPublication): boolean { return ['draft', 'ready', 'scheduled', 'failed', 'canceled'].includes(item.status); }

  saveSchedule(): void {
    if (!this.selected || !this.scheduleDraft) return;
    this.saving = true;
    this.api.reschedulePublication(this.selected.id, new Date(this.scheduleDraft).toISOString()).subscribe({ next: (publication) => { this.selected = { ...this.selected!, ...publication }; this.saving = false; this.load(true); }, error: () => { this.saving = false; this.error = 'Publication schedule could not be updated.'; } });
  }

  statusClass(status: string): string {
    switch (status) {
      case 'published':
        return 'au-tag--success';
      case 'failed':
        return 'au-tag--danger';
      case 'scheduled':
      case 'queued':
      case 'publishing':
        return 'au-tag--warning';
      case 'unpublished':
      case 'canceled':
        return 'au-tag--muted';
      default:
        return '';
    }
  }

  dateLabel(value: string | null): string {
    return value ? new Date(value).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
  }

  retry(item: StudioPublication): void {
    this.api.retryPublication(item.id).subscribe(() => this.load(true));
  }

  publishNow(item: StudioPublication): void {
    this.api.publishNow(item.id).subscribe(() => this.load(true));
  }

  cancel(item: StudioPublication): void {
    if (!window.confirm(`Cancel this scheduled ${item.channel} publication?`)) {
      return;
    }
    this.api.cancelPublication(item.id).subscribe(() => this.load(true));
  }

  unpublish(item: StudioPublication): void {
    const destination = this.destination(item);
    if (
      !window.confirm(
        `Unpublish from ${destination}?\n\nThis ${item.channel === 'website' ? 'removes the remote article' : 'deletes the remote post'} on ${destination}. This cannot be undone automatically.`,
      )
    ) {
      return;
    }
    this.api.unpublishPublication(item.id).subscribe(() => this.load(true));
  }

  remove(item: StudioPublication): void {
    const publishedExternally = item.status === 'published' && Boolean(item.externalId);
    const message = publishedExternally
      ? `This publication is live on ${this.destination(item)}.\n\nDeleting here only removes the local record. Unpublish first to remove it externally.`
      : `Delete this ${item.channel} publication record?`;
    if (!window.confirm(message)) {
      return;
    }
    this.api.deletePublication(item.id).subscribe(() => this.load(true));
  }
}
