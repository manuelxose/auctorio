import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { StudioApiService } from '../services/studio-api.service';
import { AppContextService } from '../services/app-context.service';
import { ConfirmService } from '../services/confirm.service';
import { ToastService } from '../services/toast.service';
import { AppIconComponent } from '../components/ui/app-icon.component';
import { AppPopoverComponent } from '../components/ui/app-popover.component';
import { AppEmptyStateComponent } from '../components/ui/app-empty-state.component';
import type { ProjectStatus, StudioProjectSummary, StudioSite } from '../models/studio.models';
import { CONTENT_FILTERS, contentFilterOf, formatRelativeTime, stageLabel, stageTone } from '../utils/content-status';

@Component({
  selector: 'app-content-list-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, AppIconComponent, AppPopoverComponent, AppEmptyStateComponent],
  template: `
    <section class="au-page">
      <header class="au-page__header">
        <div>
          <p class="au-page__eyebrow">Editorial production</p>
          <h1 class="au-page__title">Content</h1>
          <p class="au-page__subtitle">Every article across your sites, in one workflow.</p>
        </div>
        <div class="au-page__actions">
          <a class="au-btn au-btn--primary" routerLink="/studio/content/new">
            <app-icon name="plus"></app-icon>
            New content
          </a>
        </div>
      </header>

      <div class="au-toolbar">
        <div class="au-segmented" role="group" aria-label="Quick state filters">
          <button
            class="au-segmented__item"
            type="button"
            *ngFor="let filter of quickFilters"
            [class.is-active]="filters.status === filter.key"
            (click)="setQuickFilter(filter.key)"
          >
            {{ filter.label }}
          </button>
        </div>
        <div class="au-toolbar__spacer"></div>
        <div class="au-search">
          <app-icon name="search"></app-icon>
          <input
            class="au-input au-input--search"
            type="search"
            placeholder="Search content…"
            [(ngModel)]="filters.search"
            (keyup.enter)="applyFilters()"
          />
        </div>
        <select class="au-select au-filter-select" [(ngModel)]="filters.siteId" (ngModelChange)="applyFilters()" aria-label="Filter by site">
          <option value="">All sites</option>
          <option *ngFor="let site of sites" [ngValue]="site.id">{{ site.name }}</option>
        </select>
        <select class="au-select au-filter-select" [(ngModel)]="filters.origin" (ngModelChange)="applyFilters()" aria-label="Filter by origin">
          <option value="">All origins</option>
          <option value="manual">Manual</option>
          <option value="auto">Automatic</option>
        </select>
        <label class="au-checkbox">
          <input type="checkbox" [(ngModel)]="showArchived" (ngModelChange)="applyFilters()" />
          Trash
        </label>
        <button class="au-btn au-btn--ghost au-btn--sm" type="button" (click)="load()" [disabled]="loading">
          <app-icon name="refresh"></app-icon>
          Refresh
        </button>
      </div>

      <section class="au-panel">
        @if (selectedIds.size > 0 && !showArchived) {
          <div class="au-bulkbar">
            <span class="au-bulkbar__count">{{ selectedIds.size }} selected</span>
            <button class="au-btn au-btn--secondary au-btn--sm" type="button" (click)="batchApprove()">
              <app-icon name="circle-check"></app-icon>
              Approve
            </button>
            <button class="au-btn au-btn--danger-ghost au-btn--sm" type="button" (click)="batchDelete()">
              <app-icon name="trash"></app-icon>
              Archive
            </button>
            <button class="au-btn au-btn--ghost au-btn--sm" type="button" (click)="selectedIds.clear()">Clear</button>
          </div>
        }

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
            icon="content"
            [title]="showArchived ? 'Trash is empty' : 'Create your first article'"
            [text]="
              showArchived
                ? 'Archived content will appear here until it is restored.'
                : 'Start from a blank piece or pick a story from the Inbox.'
            "
          >
            @if (!showArchived) {
              <a class="au-btn au-btn--primary au-btn--sm" routerLink="/studio/content/new">Create article</a>
              <a class="au-btn au-btn--secondary au-btn--sm" routerLink="/studio/inbox">Open inbox</a>
            }
          </app-empty-state>
        } @else {
          <div class="au-table-wrap">
            <table class="au-table">
              <thead>
                <tr>
                  <th style="width: 34px">
                    <input type="checkbox" [checked]="allSelected" (change)="toggleAll()" aria-label="Select all" />
                  </th>
                  <th style="width: 40px"></th>
                  <th>Title</th>
                  <th>Site</th>
                  <th>Workflow</th>
                  <th>QA</th>
                  <th>Social</th>
                  <th>Schedule</th>
                  <th>Updated</th>
                  <th style="width: 44px"></th>
                </tr>
              </thead>
              <tbody>
                <tr
                  *ngFor="let item of items"
                  class="au-table-row--link"
                  [class.is-selected]="selectedIds.has(item.id)"
                  (click)="open(item)"
                >
                  <td (click)="$event.stopPropagation()">
                    <input type="checkbox" [checked]="selectedIds.has(item.id)" (change)="toggleSelected(item.id)" [attr.aria-label]="'Select ' + item.title" />
                  </td>
                  <td>
                    <img class="au-table__thumb" *ngIf="item.latestVersion?.assetUrl" [src]="item.latestVersion?.assetUrl || ''" alt="" loading="lazy" />
                    <span class="au-table__thumb au-table__thumb--empty" *ngIf="!item.latestVersion?.assetUrl"></span>
                  </td>
                  <td>
                    <a class="au-table__title au-link" [routerLink]="['/studio/content', item.id]" (click)="$event.stopPropagation()">{{ item.title }}</a>
                    <span class="au-table__sub">{{ item.goal }} · {{ item.primaryLanguage }}<span *ngIf="item.origin === 'auto'"> · automatic</span></span>
                  </td>
                  <td class="au-nowrap">{{ item.site.name }}</td>
                  <td>
                    <span class="au-badge" [class]="'au-badge--' + stageTone(item.reviewGate)">{{ stageLabel(item.reviewGate) }}</span>
                  </td>
                  <td>
                    <span
                      class="au-badge"
                      [class.au-badge--success]="qaState(item) === 'passed'"
                      [class.au-badge--danger]="qaState(item) === 'failed'"
                      [class.au-badge--neutral]="qaState(item) === 'none'"
                    >
                      {{ qaState(item) }}
                    </span>
                  </td>
                  <td>
                    <span class="au-badge" [class.au-badge--brand]="item.socialCount > 0" [class.au-badge--neutral]="item.socialCount === 0">
                      {{ item.socialCount > 0 ? item.socialCount + ' pieces' : 'none' }}
                    </span>
                  </td>
                  <td>
                    <span class="au-table__sub" *ngFor="let publication of item.publications.slice(0, 2)">
                      <span class="au-channel" [class]="'au-channel--' + publication.channel">{{ publication.channel }}</span>
                      {{ dateLabel(publication.scheduledFor) }} · {{ publication.status }}
                    </span>
                    <span class="au-table__sub au-faint" *ngIf="item.publications.length === 0">—</span>
                  </td>
                  <td class="au-nowrap au-muted">{{ formatRelativeTime(item.updatedAt) }}</td>
                  <td (click)="$event.stopPropagation()">
                    <button
                      class="au-btn au-btn--ghost au-btn--icon au-btn--sm"
                      type="button"
                      #menuTrigger
                      (click)="rowMenu.toggle(menuTrigger)"
                      [attr.aria-label]="'Actions for ' + item.title"
                      aria-haspopup="menu"
                    >
                      <app-icon name="dots"></app-icon>
                    </button>
                    <app-popover #rowMenu>
                      <div class="au-menu">
                        <a class="au-menu__item" [routerLink]="['/studio/content', item.id]" (click)="rowMenu.hide()">
                          <app-icon name="external"></app-icon>
                          Open workspace
                        </a>
                        <button class="au-menu__item" type="button" *ngIf="!showArchived" (click)="rowMenu.hide(); duplicateOne(item)">
                          <app-icon name="copy"></app-icon>
                          Duplicate
                        </button>
                        <button class="au-menu__item" type="button" *ngIf="item.reviewGate.approvalReady && !showArchived" (click)="rowMenu.hide(); approveOne(item)">
                          <app-icon name="circle-check"></app-icon>
                          Approve
                        </button>
                        <div class="au-menu__sep"></div>
                        <button class="au-menu__item is-danger" type="button" *ngIf="!showArchived" (click)="rowMenu.hide(); removeOne(item)">
                          <app-icon name="trash"></app-icon>
                          Archive
                        </button>
                        <button class="au-menu__item" type="button" *ngIf="showArchived" (click)="rowMenu.hide(); restoreOne(item)">
                          <app-icon name="refresh"></app-icon>
                          Restore
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
              <span>Page {{ page }} of {{ totalPages }} · {{ total }} pieces</span>
              <button class="au-btn au-btn--ghost au-btn--sm" type="button" [disabled]="page >= totalPages" (click)="goPage(page + 1)">Next</button>
            </div>
          }
        }
      </section>
    </section>
  `,
})
export class ContentListPageComponent implements OnInit {
  private readonly api = inject(StudioApiService);
  private readonly appContext = inject(AppContextService);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  projectStatuses: ProjectStatus[] = ['draft', 'ai_generated', 'qa_failed', 'qa_passed', 'in_review', 'approved', 'publish_queued', 'published', 'publish_failed'];
  quickFilters = CONTENT_FILTERS;
  items: StudioProjectSummary[] = [];
  sites: StudioSite[] = [];
  page = 1;
  pageSize = 20;
  total = 0;
  showArchived = false;
  loading = false;
  selectedIds = new Set<string>();
  filters = {
    siteId: '',
    status: 'all' as string,
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

  setQuickFilter(key: string): void {
    this.filters.status = key;
    this.applyFilters();
  }

  applyFilters(): void {
    this.page = 1;
    this.load();
  }

  goPage(page: number): void {
    this.page = page;
    this.load();
  }

  open(item: StudioProjectSummary): void {
    void this.router.navigate(['/studio/content', item.id]);
  }

  load(): void {
    this.loading = true;
    this.api
      .listProjects({
        page: this.page,
        pageSize: this.pageSize,
        siteId: this.filters.siteId || undefined,
        status:
          this.filters.status && this.filters.status !== 'all'
            ? (this.filters.status as ProjectStatus)
            : undefined,
        origin: (this.filters.origin || undefined) as 'manual' | 'auto' | undefined,
        archived: this.showArchived,
        search: this.filters.search || undefined,
      })
      .subscribe({
        next: (response) => {
          this.items = response.items;
          this.total = response.total;
          this.loading = false;
        },
        error: () => {
          this.items = [];
          this.total = 0;
          this.loading = false;
          this.toast.error('Could not load content.');
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
      next: () => {
        this.toast.success('Piece approved.');
        this.load();
      },
      error: () => this.toast.error('The piece could not be approved.'),
    });
  }

  duplicateOne(item: StudioProjectSummary): void {
    this.api.duplicateProject(item.id).subscribe({
      next: () => {
        this.toast.success('Duplicate created.');
        this.load();
      },
      error: () => this.toast.error('The piece could not be duplicated.'),
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
            this.toast.success(ids.length === 1 ? 'Piece approved.' : `${ids.length} pieces approved.`);
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
    void this.confirmDelete([item.id]);
  }

  batchDelete(): void {
    void this.confirmDelete(Array.from(this.selectedIds));
  }

  private async confirmDelete(ids: string[]): Promise<void> {
    const confirmed = await this.confirm.confirm({
      title: ids.length === 1 ? 'Archive this piece?' : `Archive ${ids.length} pieces?`,
      message:
        'Archived content moves to Trash and can be restored later. Content already published externally stays online unless you unpublish it first.',
      confirmLabel: 'Archive',
      danger: true,
    });
    if (!confirmed) {
      return;
    }
    let remaining = ids.length;
    let failed = 0;
    for (const id of ids) {
      this.api.deleteProject(id, { mode: 'archive' }).subscribe({
        next: () => {
          remaining -= 1;
          if (remaining === 0) {
            this.selectedIds.clear();
            if (failed > 0) {
              this.toast.error(`${failed} piece(s) could not be archived.`);
            } else {
              this.toast.success(ids.length === 1 ? 'Piece archived.' : `${ids.length} pieces archived.`);
            }
            this.load();
          }
        },
        error: () => {
          remaining -= 1;
          failed += 1;
          if (remaining === 0) {
            this.load();
          }
        },
      });
    }
  }

  restoreOne(item: StudioProjectSummary): void {
    this.api.restoreProject(item.id).subscribe({
      next: () => {
        this.toast.success('Piece restored.');
        this.load();
      },
      error: () => this.toast.error('The piece could not be restored.'),
    });
  }

  dateLabel(value: string | null): string {
    return value ? new Date(value).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
  }

  stageLabel = stageLabel;
  stageTone = stageTone;
  formatRelativeTime = formatRelativeTime;
  contentFilterOf = contentFilterOf;
}

