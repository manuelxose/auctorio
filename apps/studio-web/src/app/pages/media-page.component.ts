import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
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
    <section class="au-page advanced-page advanced-media">
      <header class="au-page__header">
        <div>
          <p class="au-page__eyebrow">Auctorio / Herramientas avanzadas</p>
          <h1 class="au-page__title">Biblioteca multimedia</h1>
          <p class="au-page__subtitle">Imágenes del catálogo editorial, variantes, asignaciones y errores.</p>
        </div>
        <div class="au-page__actions"><a class="au-btn au-btn--secondary au-btn--sm" routerLink="/studio/content">Ver artículos</a></div>
      </header>

      <dl class="advanced-kpis" aria-label="Resumen de recursos" *ngIf="loaded && !loadError">
        <div class="au-stat">
          <dt class="au-stat__label">Recursos</dt>
          <dd class="au-stat__value">{{ total }}</dd>
          <dd class="au-stat__note">Con los filtros actuales</dd>
        </div>
        <div class="au-stat advanced-stat--good">
          <dt class="au-stat__label">Listos</dt>
          <dd class="au-stat__value">{{ readyOnPage }}</dd>
          <dd class="au-stat__note">Entre los recursos cargados</dd>
        </div>
        <div class="au-stat advanced-stat--warning">
          <dt class="au-stat__label">Requieren atención</dt>
          <dd class="au-stat__value">{{ needsAttentionOnPage }}</dd>
          <dd class="au-stat__note">Fallidos o reintentables</dd>
        </div>
        <div class="au-stat">
          <dt class="au-stat__label">Sin utilizar</dt>
          <dd class="au-stat__value">{{ unusedOnPage }}</dd>
          <dd class="au-stat__note">Recursos cargados sin artículo</dd>
        </div>
      </dl>

      <section class="au-panel au-panel--padded" aria-labelledby="media-gallery">
        <div class="advanced-card-header">
          <h2 class="au-panel__title" id="media-gallery">Explorar recursos</h2>
          <p>Abre un recurso para consultar sus variantes y su uso.</p>
        </div>
        <div class="au-toolbar advanced-filter-bar">
          <label class="au-search">
            <app-icon name="search"></app-icon>
            <input class="au-input au-input--search" type="search" aria-label="Buscar entre los recursos cargados" placeholder="Buscar recurso o artículo…" [(ngModel)]="search" />
          </label>
          <div class="au-segmented" role="group" aria-label="Asset status filters">
            <button class="au-segmented__item" [class.is-active]="statusFilter === ''" [attr.aria-pressed]="statusFilter === ''" type="button" (click)="setStatus('')">Todos</button>
            <button class="au-segmented__item" [class.is-active]="statusFilter === 'done'" [attr.aria-pressed]="statusFilter === 'done'" type="button" (click)="setStatus('done')">Listos</button>
            <button class="au-segmented__item" [class.is-active]="statusFilter === 'failed'" [attr.aria-pressed]="statusFilter === 'failed'" type="button" (click)="setStatus('failed')">Con errores</button>
          </div>
          <label class="au-checkbox">
            <input type="checkbox" [(ngModel)]="unusedOnly" (ngModelChange)="load()" />
            Solo sin utilizar
          </label>
          <div class="au-toolbar__spacer"></div>
          <button class="au-btn au-btn--danger-ghost au-btn--sm" type="button" (click)="bulkRemove()" [disabled]="selectedIds.size === 0">
            <app-icon name="trash"></app-icon>
            Eliminar seleccionados ({{ selectedIds.size }})
          </button>
          <button class="au-btn au-btn--ghost au-btn--sm" type="button" (click)="selectedIds.clear()" [disabled]="selectedIds.size === 0">Limpiar selección</button>
        </div>

        <div class="au-banner au-banner--error" *ngIf="loadError">
          <app-icon name="warning"></app-icon>
          <span class="au-banner__text">{{ loadError }}</span>
          <button class="au-banner__action" type="button" (click)="load()">Retry</button>
        </div>

        <app-empty-state
          *ngIf="loaded && visibleItems.length === 0 && !loadError"
          icon="media"
          [title]="statusFilter || unusedOnly || search.trim() ? 'Ningún recurso coincide con los filtros' : 'Tu biblioteca multimedia está vacía'"
          [text]="statusFilter || unusedOnly || search.trim() ? 'Cambia los filtros para ver más recursos.' : 'Genera una imagen desde un artículo para verla aquí.'"
        >
          <a class="au-btn au-btn--secondary au-btn--sm" routerLink="/studio/content">Ver artículos</a>
        </app-empty-state>

        <div class="au-media-grid" *ngIf="visibleItems.length > 0">
          <article class="au-media-card" *ngFor="let item of visibleItems" [class.is-selected]="selectedIds.has(item.id)">
            <label class="au-media-select">
              <input type="checkbox" [checked]="selectedIds.has(item.id)" (change)="toggleSelection(item.id)" [attr.aria-label]="'Select media asset'" />
            </label>
            <button class="au-media-card__thumb" [class.advanced-media-placeholder]="!item.assetUrl" type="button" (click)="open(item)" [attr.aria-label]="'Inspect media asset'">
              <img *ngIf="item.assetUrl; else noPreview" [src]="item.assetUrl" [alt]="item.prompt || 'Recurso generado'" loading="lazy" />
              <ng-template #noPreview><app-icon name="media"></app-icon></ng-template>
              <span class="advanced-media-badge">{{ mediaStatusLabels[item.status] || item.status }}</span>
            </button>
            <div class="au-media-card__body">
              <span class="au-media-card__name au-truncate">{{ item.prompt || 'Recurso generado' }}</span>
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
                  Abrir artículo
                </a>
                <button class="au-btn au-btn--secondary au-btn--sm" type="button" *ngIf="item.status === 'failed' || item.status === 'retryable'" (click)="retry(item)">
                  <app-icon name="refresh"></app-icon>
                  Reintentar
                </button>
                <button class="au-btn au-btn--danger-ghost au-btn--icon au-btn--sm" type="button" (click)="remove(item)" [attr.aria-label]="'Delete asset'">
                  <app-icon name="trash"></app-icon>
                </button>
              </div>
            </div>
          </article>
        </div>

      </section>

      @if (selected) {
        <div class="au-media-lightbox" role="dialog" aria-modal="true" aria-label="Media details" (click)="onLightboxScrim($event)" (keydown)="onLightboxKey($event)" tabindex="0">
          <div class="au-media-lightbox__panel">
            <div class="au-between">
              <h2 class="au-panel__title">{{ selected.project?.title || 'Recurso generado' }}</h2>
              <button class="au-btn au-btn--ghost au-btn--sm" type="button" (click)="selected = null" aria-label="Close media details">
                <app-icon name="close"></app-icon>
                Close
              </button>
            </div>
            <img *ngIf="selected.assetUrl" [src]="selected.assetUrl" [alt]="selected.prompt || 'Recurso generado'" />
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
export class MediaPageComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private tabSubscription?: Subscription;
  private loadVersion = 0;
  private readonly api = inject(StudioApiService);
  private readonly appContext = inject(AppContextService);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);

  items: StudioMediaItem[] = [];
  search = '';
  loaded = false;
  total = 0;

  get visibleItems(): StudioMediaItem[] {
    const term = this.search.trim().toLowerCase();
    return term ? this.items.filter((item) => `${item.prompt ?? ''} ${item.project?.title ?? ''}`.toLowerCase().includes(term)) : this.items;
  }
  get readyOnPage(): number { return this.items.filter((item) => item.status === 'done').length; }
  get needsAttentionOnPage(): number { return this.items.filter((item) => item.status === 'failed' || item.status === 'retryable').length; }
  get unusedOnPage(): number { return this.items.filter((item) => !item.project).length; }
  siteFilter = '';
  statusFilter = '';
  unusedOnly = false;
  loadError = '';
  selectedIds = new Set<string>();
  readonly mediaStatusLabels: Record<string, string> = { done: 'Lista', failed: 'Fallida', retryable: 'Reintento pendiente', queued: 'En espera', running: 'En curso' };
  selected: StudioMediaItem | null = null;

  ngOnInit(): void {
    this.siteFilter = this.appContext.activeSite()?.id ?? '';
    this.tabSubscription = this.route.queryParamMap.subscribe((params) => {
      const tab = params.get('tab');
      this.statusFilter = tab === 'failed' ? 'failed' : '';
      this.unusedOnly = tab === 'unused';
      this.selectedIds.clear();
      this.load();
    });
  }

  ngOnDestroy(): void { this.tabSubscription?.unsubscribe(); }

  load(): void {
    const version = ++this.loadVersion;
    this.loadError = '';
    this.api
      .listMedia(1, 48, {
        siteId: this.siteFilter || undefined,
        status: this.statusFilter || undefined,
        unused: this.unusedOnly || undefined,
      })
      .subscribe({
        next: (response) => {
          if (version !== this.loadVersion) return;
          this.items = response.items;
          this.total = response.total;
          this.loaded = true;
        },
        error: () => {
          if (version !== this.loadVersion) return;
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
        this.load();
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
        this.load();
        this.toast.success('Asset deleted.');
      },
      error: (err) => {
        this.loadError = err?.error?.message || 'Asset could not be deleted.';
      },
    });
  }

  formatRelativeTime = formatRelativeTime;
}
