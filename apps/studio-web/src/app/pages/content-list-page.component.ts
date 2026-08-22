import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { StudioApiService } from '../services/studio-api.service';
import { AppContextService } from '../services/app-context.service';
import type { ProjectStatus, StudioProjectSummary, StudioSite } from '../models/studio.models';
import { formatRelativeTime, stageLabel, stageTone } from '../utils/content-status';

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
        <div class="au-header-actions">
          <a class="au-button au-button--primary" routerLink="/studio/content/new">+ New content</a>
        </div>
      </header>

      <div class="au-toolbar au-toolbar--wrap">
        <select class="au-input au-input--inline" [(ngModel)]="filters.siteId" (ngModelChange)="applyFilters()">
          <option value="">All sites</option>
          <option *ngFor="let site of sites" [ngValue]="site.id">{{ site.name }}</option>
        </select>
        <select class="au-input au-input--inline" [(ngModel)]="filters.status" (ngModelChange)="applyFilters()">
          <option value="">All states</option>
          <option *ngFor="let status of projectStatuses" [ngValue]="status">{{ status }}</option>
        </select>
        <select class="au-input au-input--inline" [(ngModel)]="filters.origin" (ngModelChange)="applyFilters()">
          <option value="">All origins</option>
          <option value="manual">Manual</option>
          <option value="auto">Automatic</option>
        </select>
        <input
          class="au-input au-input--search"
          type="search"
          placeholder="Search…"
          [(ngModel)]="filters.search"
          (keyup.enter)="applyFilters()"
        />
        <label class="au-check">
          <input type="checkbox" [(ngModel)]="showArchived" (ngModelChange)="applyFilters()" />
          Trash
        </label>
        <button class="au-button au-button--ghost" type="button" (click)="load()">Refresh</button>
        <span class="au-toolbar__count" *ngIf="selectedIds.size > 0">{{ selectedIds.size }} selected</span>
        <ng-container *ngIf="selectedIds.size > 0 && !showArchived">
          <button class="au-button au-button--secondary au-button--sm" type="button" (click)="batchApprove()">Approve</button>
          <button class="au-button au-button--danger au-button--sm" type="button" (click)="batchDelete()">Delete</button>
        </ng-container>
      </div>

      <section class="au-surface au-surface--table">
        <div class="au-empty" *ngIf="items.length === 0">
          {{ showArchived ? 'Trash is empty.' : 'Nothing here yet. Create your first piece or pick a story from the Inbox.' }}
        </div>
        <table class="au-table" *ngIf="items.length > 0">
          <thead>
            <tr>
              <th><input type="checkbox" [checked]="allSelected" (change)="toggleAll()" /></th>
              <th></th>
              <th>Title</th>
              <th>Site</th>
              <th>Status</th>
              <th>QA</th>
              <th>Social</th>
              <th>Scheduled / published</th>
              <th>Updated</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let item of items" [class.is-selected]="selectedIds.has(item.id)">
              <td><input type="checkbox" [checked]="selectedIds.has(item.id)" (change)="toggleSelected(item.id)" /></td>
              <td><img class="au-thumb" *ngIf="item.latestVersion?.assetUrl" [src]="item.latestVersion?.assetUrl || ''" alt="" /></td>
              <td>
                <a class="au-link au-cell-title" [routerLink]="['/studio/content', item.id]">{{ item.title }}</a>
                <div class="au-cell-meta">{{ item.goal }} · {{ item.primaryLanguage }} <span *ngIf="item.origin === 'auto'">· 🤖 auto</span></div>
              </td>
              <td>{{ item.site.name }}</td>
              <td>
                <span class="au-tag" [class.au-tag--success]="stageTone(item.reviewGate) === 'success'" [class.au-tag--danger]="stageTone(item.reviewGate) === 'danger'" [class.au-tag--warning]="stageTone(item.reviewGate) === 'warning'">
                  {{ stageLabel(item.reviewGate) }}
                </span>
              </td>
              <td>
                <span class="au-tag" [class.au-tag--success]="qaState(item) === 'passed'" [class.au-tag--danger]="qaState(item) === 'failed'" [class.au-tag--muted]="qaState(item) === 'none'">
                  {{ qaState(item) }}
                </span>
              </td>
              <td>
                <span class="au-tag" [class.au-tag--success]="item.socialCount > 0" [class.au-tag--muted]="item.socialCount === 0">
                  {{ item.socialCount > 0 ? item.socialCount + ' pieces' : 'none' }}
                </span>
              </td>
              <td>
                <span class="au-cell-date" *ngFor="let publication of item.publications.slice(0, 3)">
                  {{ publication.channel }} · {{ dateLabel(publication.scheduledFor) }} · {{ publication.status }}
                </span>
                <span class="au-cell-meta" *ngIf="item.publications.length === 0">—</span>
              </td>
              <td class="au-cell-date">{{ formatRelativeTime(item.updatedAt) }}</td>
              <td class="au-cell-actions">
                <a class="au-button au-button--ghost au-button--xs" [routerLink]="['/studio/content', item.id]">Open</a>
                <button class="au-button au-button--ghost au-button--xs" type="button" *ngIf="!showArchived" (click)="duplicateOne(item)">Duplicate</button>
                <button class="au-button au-button--ghost au-button--xs" type="button" *ngIf="item.reviewGate.approvalReady" (click)="approveOne(item)">Approve</button>
                <button class="au-button au-button--ghost au-button--xs" type="button" *ngIf="!showArchived" (click)="removeOne(item)">Delete</button>
                <button class="au-button au-button--ghost au-button--xs" type="button" *ngIf="showArchived" (click)="restoreOne(item)">Restore</button>
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
    </section>
  `,
  styles: [
    `
      .au-header-actions { display: flex; gap: 0.5rem; }
      .au-toolbar--wrap { flex-wrap: wrap; }
      .au-check { display: inline-flex; align-items: center; gap: 0.35rem; font-size: 0.85rem; }
      .au-toolbar__count { font-size: 0.8rem; color: var(--au-muted, #6b7280); margin-left: auto; }
      .au-button--sm { padding: 0.3rem 0.7rem; font-size: 0.8rem; }
      .au-button--xs { padding: 0.2rem 0.5rem; font-size: 0.75rem; }
      .au-button--danger { color: var(--au-danger, #dc2626); }
      .au-surface--table { overflow-x: auto; }
      .au-table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
      .au-table th { text-align: left; padding: 0.5rem 0.6rem; border-bottom: 1px solid var(--au-border, #e5e7eb); color: var(--au-muted, #6b7280); font-weight: 600; white-space: nowrap; }
      .au-table td { padding: 0.55rem 0.6rem; border-bottom: 1px solid var(--au-border-subtle, #f3f4f6); vertical-align: top; }
      .au-table tr.is-selected td { background: var(--au-surface-subtle, #f9fafb); }
      .au-thumb { width: 34px; height: 34px; object-fit: cover; border-radius: 6px; }
      .au-cell-title { font-weight: 600; }
      .au-cell-meta { font-size: 0.72rem; color: var(--au-muted, #6b7280); }
      .au-cell-date { display: block; white-space: nowrap; font-variant-numeric: tabular-nums; font-size: 0.72rem; color: var(--au-muted, #6b7280); }
      .au-cell-actions { white-space: nowrap; }
      .au-pagination { display: flex; align-items: center; gap: 0.75rem; padding: 0.75rem 0.6rem; font-size: 0.85rem; }
    `,
  ],
})
export class ContentListPageComponent implements OnInit {
  private readonly api = inject(StudioApiService);
  private readonly appContext = inject(AppContextService);

  projectStatuses: ProjectStatus[] = ['draft', 'ai_generated', 'qa_failed', 'qa_passed', 'in_review', 'approved', 'publish_queued', 'published', 'publish_failed'];
  items: StudioProjectSummary[] = [];
  sites: StudioSite[] = [];
  page = 1;
  pageSize = 20;
  total = 0;
  showArchived = false;
  selectedIds = new Set<string>();
  filters = {
    siteId: '',
    status: '' as '' | ProjectStatus,
    origin: '',
    search: '',
  };

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.total / this.pageSize));
  }

  get allSelected(): boolean {
    return this.items.length > 0 && this.items.every((item) => this.selectedIds.has(item.id));
  }

  ngOnInit(): void {
    this.sites = this.appContext.sites();
    this.load();
  }

  applyFilters(): void {
    this.page = 1;
    this.load();
  }

  goPage(page: number): void {
    this.page = page;
    this.load();
  }

  load(): void {
    this.api
      .listProjects({
        page: this.page,
        pageSize: this.pageSize,
        siteId: this.filters.siteId || undefined,
        status: this.filters.status || undefined,
        origin: (this.filters.origin || undefined) as 'manual' | 'auto' | undefined,
        archived: this.showArchived,
      })
      .subscribe({
        next: (response) => {
          this.items = response.items;
          this.total = response.total;
        },
        error: () => {
          this.items = [];
          this.total = 0;
        },
      });
  }

  qaState(item: StudioProjectSummary): 'passed' | 'failed' | 'none' {
    const state = item.latestVersion?.qaState;
    if (state === 'passed' || state === 'approved' || state === 'published') {
      return 'passed';
    }
    return state === 'failed' ? 'failed' : 'none';
  }

  toggleSelected(id: string): void {
    if (this.selectedIds.has(id)) {
      this.selectedIds.delete(id);
    } else {
      this.selectedIds.add(id);
    }
  }

  toggleAll(): void {
    if (this.allSelected) {
      this.selectedIds.clear();
    } else {
      for (const item of this.items) {
        this.selectedIds.add(item.id);
      }
    }
  }

  approveOne(item: StudioProjectSummary): void {
    this.api.approveProject(item.id).subscribe({
      next: () => this.load(),
      error: () => this.load(),
    });
  }

  duplicateOne(item: StudioProjectSummary): void {
    this.api.duplicateProject(item.id).subscribe({
      next: () => this.load(),
      error: () => this.load(),
    });
  }

  batchApprove(): void {
    const ids = Array.from(this.selectedIds);
    let remaining = ids.length;
    for (const id of ids) {
      this.api.approveProject(id).subscribe({
        next: () => {
          remaining -= 1;
          if (remaining === 0) {
            this.selectedIds.clear();
            this.load();
          }
        },
        error: () => {
          remaining -= 1;
          if (remaining === 0) {
            this.load();
          }
        },
      });
    }
  }

  removeOne(item: StudioProjectSummary): void {
    this.confirmDelete([item.id]);
  }

  batchDelete(): void {
    this.confirmDelete(Array.from(this.selectedIds));
  }

  private confirmDelete(ids: string[]): void {
    if (
      !window.confirm(
        `Archive ${ids.length} project${ids.length === 1 ? '' : 's'}?\n\nArchived projects can be restored from the Trash view. Content already published externally stays online unless you unpublish it first.`,
      )
    ) {
      return;
    }
    let remaining = ids.length;
    for (const id of ids) {
      this.api.deleteProject(id, { mode: 'archive' }).subscribe({
        next: () => {
          remaining -= 1;
          if (remaining === 0) {
            this.selectedIds.clear();
            this.load();
          }
        },
        error: () => {
          remaining -= 1;
          if (remaining === 0) {
            this.load();
          }
        },
      });
    }
  }

  restoreOne(item: StudioProjectSummary): void {
    this.api.restoreProject(item.id).subscribe({
      next: () => this.load(),
      error: () => this.load(),
    });
  }

  dateLabel(value: string | null): string {
    return value ? new Date(value).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
  }

  stageLabel = stageLabel;
  stageTone = stageTone;
  formatRelativeTime = formatRelativeTime;
}

