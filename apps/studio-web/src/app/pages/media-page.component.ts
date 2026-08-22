import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AppContextService } from '../services/app-context.service';
import { StudioApiService } from '../services/studio-api.service';
import type { StudioMediaItem, StudioSite } from '../models/studio.models';
import { formatRelativeTime } from '../utils/content-status';

@Component({
  selector: 'app-media-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <section class="au-page">
      <header class="au-page__header">
        <div>
          <h1 class="au-page__title">Media</h1>
          <p class="au-page__subtitle">Every generated asset, with its variants and status.</p>
        </div>
      </header>

      <div class="au-toolbar">
        <div class="au-filters">
          <button class="au-filter" [class.is-active]="statusFilter === ''" type="button" (click)="setStatus('')">
            All
          </button>
          <button class="au-filter" [class.is-active]="statusFilter === 'done'" type="button" (click)="setStatus('done')">
            Ready
          </button>
          <button class="au-filter" [class.is-active]="statusFilter === 'failed'" type="button" (click)="setStatus('failed')">
            Failed
          </button>
        </div>
        <select class="au-input au-input--search" [(ngModel)]="siteFilter" (ngModelChange)="load()" aria-label="Filter by site">
          <option value="">All sites</option>
          <option *ngFor="let site of sites" [ngValue]="site.id">{{ site.name }}</option>
        </select>
        <label class="au-check"><input type="checkbox" [(ngModel)]="unusedOnly" (ngModelChange)="load()" /> Unused only</label>
        <button class="au-button au-button--ghost au-button--sm" type="button" (click)="bulkRemove()" [disabled]="selectedIds.size === 0">Delete selected ({{ selectedIds.size }})</button>
      </div>

      <div class="au-empty" *ngIf="items.length === 0">No media yet. Generate a hero image from any article.</div>
      <div class="au-banner au-banner--error" *ngIf="loadError">{{ loadError }}</div>

      <div class="au-media-grid">
        <article class="au-media-card" *ngFor="let item of items">
          <label class="au-media-select"><input type="checkbox" [checked]="selectedIds.has(item.id)" (change)="toggleSelection(item.id)" [attr.aria-label]="'Select media asset'" /></label>
          <button class="au-media-preview" type="button" (click)="open(item)" [attr.aria-label]="'Inspect media asset'">
            <img [src]="item.assetUrl || ''" [alt]="item.prompt || 'Generated asset'" loading="lazy" />
          </button>
          <div class="au-media-card__meta">
            <span class="au-tag">{{ item.status }}</span>
            <span class="au-tag" *ngIf="item.project">{{ item.project.site.name }}</span>
            <span class="au-row__meta">{{ formatRelativeTime(item.createdAt) }}</span>
          </div>
          <p class="au-auth__hint" *ngIf="item.error">{{ item.error }}</p>
          <div class="au-form__actions">
            <a class="au-link" *ngIf="item.project" [routerLink]="['/studio/content', item.project.id]">
              Open article
            </a>
            <button
              class="au-button au-button--secondary au-button--sm"
              type="button"
              *ngIf="item.status === 'failed' || item.status === 'retryable'"
              (click)="retry(item)"
            >
              Retry
            </button>
            <button class="au-button au-button--ghost au-button--sm au-button--danger" type="button" (click)="remove(item)">
              Delete
            </button>
          </div>
        </article>
      </div>
      <div class="au-media-lightbox" *ngIf="selected" role="dialog" aria-modal="true" aria-label="Media details">
        <div class="au-media-lightbox__panel"><button class="au-button au-button--ghost au-button--sm" type="button" (click)="selected = null">Close</button><img [src]="selected.assetUrl || ''" [alt]="selected.prompt || 'Generated asset'" /><h2>{{ selected.project?.title || 'Generated asset' }}</h2><dl class="au-kv"><dt>Dimensions</dt><dd>{{ selected.width || '—' }} × {{ selected.height || '—' }}</dd><dt>Provider</dt><dd>{{ selected.provider || '—' }} / {{ selected.model || '—' }}</dd><dt>Status</dt><dd>{{ selected.status }}</dd><dt>Prompt</dt><dd>{{ selected.prompt || '—' }}</dd><dt>Variants</dt><dd>{{ selected.variants.length }}</dd></dl></div>
      </div>
    </section>
  `,
})
export class MediaPageComponent implements OnInit {
  private readonly api = inject(StudioApiService);
  private readonly appContext = inject(AppContextService);

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

  toggleSelection(itemId: string): void { this.selectedIds = new Set(this.selectedIds); this.selectedIds.has(itemId) ? this.selectedIds.delete(itemId) : this.selectedIds.add(itemId); }
  open(item: StudioMediaItem): void { this.selected = item; }
  bulkRemove(): void {
    if (!window.confirm(`Delete ${this.selectedIds.size} selected asset(s)?`)) return;
    const ids = [...this.selectedIds];
    this.api.bulkDeleteMedia(ids).subscribe({ next: () => { this.items = this.items.filter((item) => !this.selectedIds.has(item.id)); this.selectedIds.clear(); }, error: (err) => { this.loadError = err?.error?.error?.message || 'Selected assets could not be deleted.'; } });
  }

  retry(item: StudioMediaItem): void {
    this.api.retryImage(item.id).subscribe({
      next: () => {
        this.load();
      },
      error: () => {
        this.load();
      },
    });
  }

  remove(item: StudioMediaItem): void {
    if (!window.confirm(`Delete this asset? This cannot be undone.`)) return;
    this.api.deleteMedia(item.id).subscribe({
      next: () => { this.items = this.items.filter((current) => current.id !== item.id); },
      error: (err) => { this.loadError = err?.error?.message || 'Asset could not be deleted.'; },
    });
  }

  formatRelativeTime = formatRelativeTime;
}
