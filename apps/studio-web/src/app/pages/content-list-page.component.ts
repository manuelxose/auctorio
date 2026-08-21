import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { StudioApiService } from '../services/studio-api.service';
import type { StudioProjectSummary } from '../models/studio.models';
import {
  CONTENT_FILTERS,
  contentFilterOf,
  formatRelativeTime,
  stageLabel,
  stageTone,
  type ContentFilter,
} from '../utils/content-status';

@Component({
  selector: 'app-content-list-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <section class="au-page">
      <header class="au-page__header">
        <div>
          <h1 class="au-page__title">Content</h1>
          <p class="au-page__subtitle">Every article across your sites, in one workflow.</p>
        </div>
        <a class="au-button au-button--primary" routerLink="/studio/content/new">+ New content</a>
      </header>

      <div class="au-toolbar">
        <div class="au-filters">
          <button
            *ngFor="let filter of CONTENT_FILTERS"
            class="au-filter"
            [class.is-active]="filter.key === activeFilter"
            type="button"
            (click)="setFilter(filter.key)"
          >
            {{ filter.label }}
          </button>
        </div>
        <input
          class="au-input au-input--search"
          type="search"
          placeholder="Search…"
          [(ngModel)]="search"
          aria-label="Search content"
        />
      </div>

      <section class="au-surface">
        <div class="au-empty" *ngIf="filtered.length === 0">Nothing here yet. Create your first piece.</div>
        <a
          class="au-row"
          *ngFor="let item of filtered"
          [routerLink]="['/studio/content', item.id]"
        >
          <span class="au-row__title">{{ item.title }}</span>
          <span class="au-tag">{{ item.site.name }}</span>
          <span
            class="au-tag"
            [class.au-tag--success]="stageTone(item.reviewGate) === 'success'"
            [class.au-tag--danger]="stageTone(item.reviewGate) === 'danger'"
            [class.au-tag--warning]="stageTone(item.reviewGate) === 'warning'"
          >
            {{ stageLabel(item.reviewGate) }}
          </span>
          <span class="au-row__meta">{{ formatRelativeTime(item.updatedAt) }}</span>
        </a>
      </section>
    </section>
  `,
})
export class ContentListPageComponent implements OnInit {
  private readonly api = inject(StudioApiService);
  private readonly route = inject(ActivatedRoute);

  items: StudioProjectSummary[] = [];
  search = '';
  activeFilter: ContentFilter = 'all';
  CONTENT_FILTERS = CONTENT_FILTERS;

  get filtered(): StudioProjectSummary[] {
    const needle = this.search.trim().toLowerCase();
    return this.items.filter((item) => {
      if (this.activeFilter !== 'all' && contentFilterOf(item.reviewGate) !== this.activeFilter) {
        return false;
      }
      if (!needle) {
        return true;
      }
      return item.title.toLowerCase().includes(needle);
    });
  }

  ngOnInit(): void {
    const queryFilter = String(this.route.snapshot.queryParamMap.get('filter') || 'all');
    if (CONTENT_FILTERS.some((filter) => filter.key === queryFilter)) {
      this.activeFilter = queryFilter as ContentFilter;
    }
    this.load();
  }

  load(): void {
    this.api.listProjects({ page: 1, pageSize: 100 }).subscribe({
      next: (response) => {
        this.items = response.items;
      },
      error: () => {
        this.items = [];
      },
    });
  }

  setFilter(filter: ContentFilter): void {
    this.activeFilter = filter;
  }

  stageLabel = stageLabel;
  stageTone = stageTone;
  formatRelativeTime = formatRelativeTime;
}
