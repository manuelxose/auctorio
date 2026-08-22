import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AppContextService } from '../services/app-context.service';
import { StudioApiService } from '../services/studio-api.service';
import { ConfirmService } from '../services/confirm.service';
import { ToastService } from '../services/toast.service';
import { AppIconComponent } from '../components/ui/app-icon.component';
import { AppEmptyStateComponent } from '../components/ui/app-empty-state.component';
import type { StudioMediaItem, StudioSite } from '../models/studio.models';
import { formatRelativeTime } from '../utils/content-status';

@Component({
  selector: 'app-media-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, AppIconComponent, AppEmptyStateComponent],
  template: `
    <section class="au-page">
      <header class="au-page__header">
        <div>
          <p class="au-page__eyebrow">Asset library</p>
          <h1 class="au-page__title">Media</h1>
          <p class="au-page__subtitle">Every generated asset, with its variants and status.</p>
        </div>
      </header>

      <div class="au-toolbar">
        <div class="au-segmented" role="group" aria-label="Asset status filters">
          <button class="au-segmented__item" [class.is-active]="statusFilter === ''" type="button" (click)="setStatus('')">All</button>
          <button class="au-segmented__item" [class.is-active]="statusFilter === 'done'" type="button" (click)="setStatus('done')">Ready</button>
          <button class="au-segmented__item" [class.is-active]="statusFilter === 'failed'" type="button" (click)="setStatus('failed')">Failed</button>
        </div>
        <select class="au-select au-filter-select" [(ngModel)]="siteFilter" (ngModelChange)="load()" aria-label="Filter by site">
          <option value="">All sites</option>
          <option *ngFor="let site of sites" [ngValue]="site.id">{{ site.name }}</option>
        </select>
        <label class="au-checkbox">
          <input type="checkbox" [(ngModel)]="unusedOnly" (ngModelChange)="load()" />
          Unused only
        </label>
        <div class="au-toolbar__spacer"></div>
        <button class="au-btn au-btn--danger-ghost au-btn--sm" type="button" (click)="bulkRemove()" [disabled]="selectedIds.size === 0">
          <app-icon name="trash"></app-icon>
          Delete selected ({{ selectedIds.size }})
        </button>
      </div>

      <div class="au-banner au-banner--error" *ngIf="loadError">
        <app-icon name="warning"></app-icon>
        <span class="au-banner__text">{{ loadError }}</span>
        <button class="au-banner__action" type="button" (click)="load()">Retry</button>
      </div>

      <app-empty-state
        *ngIf="items.length === 0 && !loadError"
        icon="media"
        title="Your media library is empty"
        text="Generate a hero image from any article and it will appear here."
      >
        <a class="au-btn au-btn--secondary au-btn--sm" routerLink="/studio/content">Open content</a>
      </app-empty-state>

      <div class="au-media-grid" *ngIf="items.length > 0">
        <article class="au-media-card" *ngFor="let item of items" [class.is-selected]="selectedIds.has(item.id)">
          <label class="au-media-select">
            <input type="checkbox" [checked]="selectedIds.has(item.id)" (change)="toggleSelection(item.id)" [attr.aria-label]="'Select media asset'" />
          </label>
          <button class="au-media-card__thumb" type="button" (click)="open(item)" [attr.aria-label]="'Inspect media asset'">
            <img [src]="item.assetUrl || ''" [alt]="item.prompt || 'Generated asset'" loading="lazy" />
          </button>
          <div class="au-media-card__body">
            <span class="au-media-card__name au-truncate">{{ item.prompt || 'Generated asset' }}</span>
            <div class="au-media-card__meta">
              <span class="au-badge" [class]="'au-badge--' + mediaStatusTone(item.status)">
                {{ item.status }}
              </span>
              <span class="au-badge au-badge--outline" *ngIf="item.project">{{ item.project.site.name }}</span>
              <span class="au-badge au-badge--neutral">{{ formatRelativeTime(item.createdAt) }}</span>
            </div>
            <p class="au-error au-mb-0" *ngIf="item.error">{{ item.error }}</p>
            <div class="au-media-card__actions">
              <a class="au-btn au-btn--ghost au-btn--sm" *ngIf="item.project" [routerLink]="['/studio/content', item.project.id]">
                <app-icon name="content"></app-icon>
                Open article
              </a>
              <button class="au-btn au-btn--secondary au-btn--sm" type="button" *ngIf="item.status === 'failed' || item.status === 'retryable'" (click)="retry(item)">
                <app-icon name="refresh"></app-icon>
                Retry
              </button>
              <button class="au-btn au-btn--danger-ghost au-btn--icon au-btn--sm" type="button" (click)="remove(item)" [attr.aria-label]="'Delete asset'">
                <app-icon name="trash"></app-icon>
              </button>
            </div>
          </div>
        </article>
      </div>

      @if (selected) {
        <div class="au-media-lightbox" role="dialog" aria-modal="true" aria-label="Media details" (click)="onLightboxScrim($event)" (keydown)="onLightboxKey($event)" tabindex="0">
          <div class="au-media-lightbox__panel">
            <div class="au-between">
              <h2 class="au-panel__title">{{ selected.project?.title || 'Generated asset' }}</h2>
              <button class="au-btn au-btn--ghost au-btn--sm" type="button" (click)="selected = null" aria-label="Close media details">
                <app-icon name="close"></app-icon>
                Close
              </button>
            </div>
            <img [src]="selected.assetUrl || ''" [alt]="selected.prompt || 'Generated asset'" />
            <dl class="au-kv">
              <dt>Dimensions</dt><dd>{{ selected.width || '—' }} × {{ selected.height || '—' }}</dd>
              <dt>Provider</dt><dd>{{ selected.provider || '—' }} / {{ selected.model || '—' }}</dd>
              <dt>Status</dt><dd>{{ selected.status }}</dd>
              <dt>Prompt</dt><dd>{{ selected.prompt || '—' }}</dd>
              <dt>Variants</dt><dd>{{ selected.variants.length }}</dd>
              <dt>Used by</dt><dd><a class="au-link" *ngIf="selected.project" [routerLink]="['/studio/content', selected.project.id]">{{ selected.project.title }}</a><span class="au-muted" *ngIf="!selected.project">Unused</span></dd>
            </dl>
          </div>
        </div>
      }
    </section>
  `,
})
export class MediaPageComponent implements OnInit {
  private readonly api = inject(StudioApiService);
  private readonly appContext = inject(AppContextService);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);

  items: StudioMediaItem[] = [];
  sites: StudioSite[] = [];
  siteFilter = '';
  statusFilter = '';
  unusedOnly = false;
  loadError = '';
  selectedIds = new Set<string>();
  selected: StudioMediaItem | null = null;

  ngOnInit(): void {
    this.sites = this.appContext.sites();
    this.siteFilter = this.appContext.activeSite()?.id ?? '';
    this.load();
  }

  load(): void {
    this.loadError = '';
    this.api
      .listMedia(1, 48, {
        siteId: this.siteFilter || undefined,
        status: this.statusFilter || undefined,
        unused: this.unusedOnly || undefined,
      })
      .subscribe({
        next: (response) => {
          this.items = response.items;
        },
        error: () => {
          this.loadError = 'Media could not be loaded. Try again.';
        },
      });
  }

  setStatus(status: string): void {
    this.statusFilter = status;
    this.load();
  }

  mediaStatusTone(status: string): 'success' | 'danger' | 'warning' | 'neutral' {
    switch (status) {
      case 'done':
        return 'success';
      case 'failed':
        return 'danger';
      case 'queued':
      case 'processing':
      case 'retryable':
        return 'warning';
      default:
        return 'neutral';
    }
  }

  toggleSelection(itemId: string): void { this.selectedIds = new Set(this.selectedIds); this.selectedIds.has(itemId) ? this.selectedIds.delete(itemId) : this.selectedIds.add(itemId); }
  open(item: StudioMediaItem): void { this.selected = item; }

  onLightboxScrim(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.selected = null;
    }
  }

  onLightboxKey(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      this.selected = null;
    }
  }

  bulkRemove(): void {
    void this.confirmBulkRemove();
  }

  private async confirmBulkRemove(): Promise<void> {
    const count = this.selectedIds.size;
    const confirmed = await this.confirm.confirm({
      title: `Delete ${count} selected asset${count === 1 ? '' : 's'}?`,
      message: 'Assets currently used by an article are protected and will not be deleted. The result reports any failures.',
      confirmLabel: 'Delete assets',
      danger: true,
    });
    if (!confirmed) return;
    const ids = [...this.selectedIds];
    this.api.bulkDeleteMedia(ids).subscribe({
      next: () => {
        this.items = this.items.filter((item) => !this.selectedIds.has(item.id));
        this.selectedIds.clear();
        this.toast.success('Assets deleted.');
      },
      error: (err) => {
        this.loadError = err?.error?.error?.message || 'Selected assets could not be deleted.';
      },
    });
  }

  retry(item: StudioMediaItem): void {
    this.api.retryImage(item.id).subscribe({
      next: () => {
        this.toast.success('Image retry queued.');
        this.load();
      },
      error: () => {
        this.load();
      },
    });
  }

  remove(item: StudioMediaItem): void {
    void this.confirmRemove(item);
  }

  private async confirmRemove(item: StudioMediaItem): Promise<void> {
    const confirmed = await this.confirm.confirm({
      title: 'Delete this asset?',
      message: 'If the asset is used by an article, the deletion is refused to protect published content.',
      confirmLabel: 'Delete asset',
      danger: true,
    });
    if (!confirmed) return;
    this.api.deleteMedia(item.id).subscribe({
      next: () => {
        this.items = this.items.filter((current) => current.id !== item.id);
        this.toast.success('Asset deleted.');
      },
      error: (err) => {
        this.loadError = err?.error?.message || 'Asset could not be deleted.';
      },
    });
  }

  formatRelativeTime = formatRelativeTime;
}
