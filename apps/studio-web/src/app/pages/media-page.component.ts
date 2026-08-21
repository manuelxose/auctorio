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
      </div>

      <div class="au-empty" *ngIf="items.length === 0">No media yet. Generate a hero image from any article.</div>

      <div class="au-media-grid">
        <article class="au-media-card" *ngFor="let item of items">
          <img [src]="item.assetUrl || ''" [alt]="item.prompt || 'Generated asset'" loading="lazy" />
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
          </div>
        </article>
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

  ngOnInit(): void {
    this.sites = this.appContext.sites();
    this.siteFilter = this.appContext.activeSite()?.id ?? '';
    this.load();
  }

  load(): void {
    this.api
      .listMedia(1, 48, {
        siteId: this.siteFilter || undefined,
        status: this.statusFilter || undefined,
      })
      .subscribe({
        next: (response) => {
          this.items = response.items;
        },
        error: () => {
          this.items = [];
        },
      });
  }

  setStatus(status: string): void {
    this.statusFilter = status;
    this.load();
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

  formatRelativeTime = formatRelativeTime;
}
