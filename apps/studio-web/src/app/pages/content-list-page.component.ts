import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { StudioApiService } from '../services/studio-api.service';
import { AppContextService } from '../services/app-context.service';
import { ConfirmService } from '../services/confirm.service';
import { ToastService } from '../services/toast.service';
import { AppIconComponent } from '../components/ui/app-icon.component';
import { AppPopoverComponent } from '../components/ui/app-popover.component';
import { AppEmptyStateComponent } from '../components/ui/app-empty-state.component';
import type { ProjectStatus, StudioProjectSummary } from '../models/studio.models';
import { CONTENT_FILTERS, formatRelativeTime, stageLabel, stageTone } from '../utils/content-status';

type Tone = 'info' | 'warning' | 'success' | 'danger' | 'muted';

const AUTOPILOT_LABELS: Record<string, string> = {
  generating: 'Writing',
  waiting_for_image: 'Waiting for image',
  qa_checking: 'Checking quality',
  qa_passed: 'Quality passed',
  auto_approved: 'Approved automatically',
  social_generating: 'Writing social posts',
  scheduling: 'Scheduling',
  scheduled: 'Scheduled',
  publishing: 'Publishing',
  published: 'Published',
  retrying: 'Retrying',
  intervention_required: 'Needs you',
};

@Component({
  selector: 'app-content-list-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, AppIconComponent, AppPopoverComponent, AppEmptyStateComponent],
  styleUrls: ['./studio-page-kit.css'],
  template: `
    <section class="sp">
      <header class="sp-head">
        <div>
          <h1 class="sp-head__title">Articles</h1>
          <p class="sp-head__sub">{{ siteName }} · every article from draft to published</p>
        </div>
        <div class="sp-head__actions">
          <a class="au-btn au-btn--secondary" routerLink="/studio/calendar"><app-icon name="calendar"></app-icon>Open calendar</a>
          <a class="au-btn au-btn--primary" routerLink="/studio/content/new"><app-icon name="plus"></app-icon>New article</a>
        </div>
      </header>

      <div class="sp-states" role="group" aria-label="Filter by state">
        @for (filter of quickFilters; track filter.key) {
          <button type="button" class="sp-state" [attr.data-tone]="filterTone(filter.key)" [attr.aria-pressed]="filters.status === filter.key" (click)="setQuickFilter(filter.key)">
            @if (filter.key !== 'all') { <i class="sp-dot" aria-hidden="true"></i> }
            {{ filter.label }}
            <span class="sp-state__count">{{ counts[filter.key] ?? '·' }}</span>
          </button>
        }
      </div>

      <div class="sp-bar">
        <label class="sp-search">
          <app-icon name="search"></app-icon>
          <input class="au-input" type="search" placeholder="Search" aria-label="Search articles" [(ngModel)]="filters.search" (ngModelChange)="searchChanged()" (keyup.enter)="applyFilters()" />
        </label>
        <select class="au-select" [(ngModel)]="filters.origin" (ngModelChange)="applyFilters()" aria-label="Filter by origin">
          <option value="">All origins</option>
          <option value="manual">Manual</option>
          <option value="auto">Automatic</option>
        </select>
        <div class="sp-seg" role="group" aria-label="Active or trash">
          <button type="button" class="sp-seg__item" [class.is-active]="!showArchived" [attr.aria-pressed]="!showArchived" (click)="setArchived(false)">Active</button>
          <button type="button" class="sp-seg__item" [class.is-active]="showArchived" [attr.aria-pressed]="showArchived" (click)="setArchived(true)">Trash</button>
        </div>
        <span class="sp-bar__spacer"></span>
        <button class="au-btn au-btn--ghost au-btn--icon au-btn--sm" type="button" (click)="refresh()" [disabled]="loading" aria-label="Refresh"><app-icon name="refresh"></app-icon></button>
      </div>

      <section class="sp-panel">
        @if (selectedIds.size > 0 && !showArchived) {
          <div class="sp-bulk" role="region" aria-label="Bulk actions">
            <span class="sp-bulk__count">{{ selectedIds.size }} selected</span>
            <button class="au-btn au-btn--secondary au-btn--sm" type="button" (click)="batchApprove()"><app-icon name="circle-check"></app-icon>Approve</button>
            <button class="au-btn au-btn--danger-ghost au-btn--sm" type="button" (click)="batchDelete()"><app-icon name="trash"></app-icon>Archive</button>
            <button class="au-btn au-btn--ghost au-btn--sm" type="button" (click)="selectedIds.clear()">Clear</button>
          </div>
        }

        @if (loading && items.length === 0) {
          @for (row of [1, 2, 3, 4]; track row) { <div class="sp-skeleton" aria-hidden="true"></div> }
        } @else if (items.length === 0) {
          <app-empty-state
            icon="content"
            [title]="showArchived ? 'Trash is empty' : filters.status !== 'all' || filters.search || filters.origin ? 'No articles match these filters' : 'No articles yet'"
            [text]="showArchived ? 'Archived articles stay here until you restore them.' : 'Add keywords in the calendar and articles are written for you, or start one by hand.'"
          >
            @if (!showArchived) {
              <a class="au-btn au-btn--primary au-btn--sm" routerLink="/studio/calendar">Add keywords</a>
              <a class="au-btn au-btn--secondary au-btn--sm" routerLink="/studio/content/new">New article</a>
            }
          </app-empty-state>
        } @else {
          <table class="sp-table">
            <thead>
              <tr>
                <th class="sp-col-check"><input class="sp-check" type="checkbox" [checked]="allSelected" (change)="toggleAll()" aria-label="Select all" /></th>
                <th style="width: 88px"><span class="au-sr-only">Image</span></th>
                <th>Article</th>
                <th>Status</th>
                <th>Quality</th>
                <th class="sp-hide-md">Publication</th>
                <th class="sp-hide-lg">Social</th>
                <th class="sp-hide-lg">Updated</th>
                <th class="sp-col-menu"><span class="au-sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              @for (item of items; track item.id) {
                <tr [class.is-selected]="selectedIds.has(item.id)" (click)="open(item)">
                  <td class="sp-col-check" (click)="$event.stopPropagation()">
                    <input class="sp-check" type="checkbox" [checked]="selectedIds.has(item.id)" (change)="toggleSelected(item.id)" [attr.aria-label]="'Select ' + item.title" />
                  </td>
                  <td>
                    @if (item.latestVersion?.assetUrl) { <img class="sp-thumb" [src]="item.latestVersion?.assetUrl" alt="" loading="lazy" /> }
                    @else { <span class="sp-thumb" aria-hidden="true"></span> }
                  </td>
                  <td>
                    <a class="sp-title" [routerLink]="['/studio/content', item.id]" (click)="$event.stopPropagation()">{{ item.title }}</a>
                    <span class="sp-meta">{{ metaLine(item) }}</span>
                  </td>
                  <td>
                    <span class="sp-status" [attr.data-tone]="statusTone(item)"><i class="sp-dot" aria-hidden="true"></i>{{ statusLabel(item) }}</span>
                    @if (blocker(item); as reason) { <span class="sp-meta" [class.sp-meta--danger]="item.reviewGate.blockers.length > 0">{{ reason }}</span> }
                  </td>
                  <td>
                    <span class="sp-status" [attr.data-tone]="qaTone(item)">
                      <i class="sp-dot" aria-hidden="true"></i>
                      <span class="sp-num">{{ qaScore(item) ?? '—' }}</span>
                      <span class="sp-muted">{{ qaWord(item) }}</span>
                    </span>
                    @if ((item.latestVersion?.repairAttempts ?? 0) > 0) { <span class="sp-meta">Repaired {{ item.latestVersion?.repairAttempts }} times</span> }
                  </td>
                  <td class="sp-hide-md">
                    @if (item.publications[0]; as publication) {
                      <span class="sp-status">{{ publication.channel }} · {{ publicationWord(publication.status) }}</span>
                      <span class="sp-meta sp-num">{{ dateLabel(publication.publishedAt || publication.scheduledFor) }}</span>
                    } @else {
                      <span class="sp-faint">Not scheduled</span>
                    }
                  </td>
                  <td class="sp-hide-lg sp-num sp-muted">{{ item.socialCount || '—' }}</td>
                  <td class="sp-hide-lg sp-muted" [title]="item.updatedAt">{{ formatRelativeTime(item.updatedAt) }}</td>
                  <td class="sp-col-menu" (click)="$event.stopPropagation()">
                    <button class="au-btn au-btn--ghost au-btn--icon au-btn--sm" type="button" #menuTrigger (click)="rowMenu.toggle(menuTrigger)" [attr.aria-label]="'Actions for ' + item.title" aria-haspopup="menu">
                      <app-icon name="dots"></app-icon>
                    </button>
                    <app-popover #rowMenu>
                      <div class="au-menu">
                        <a class="au-menu__item" [routerLink]="['/studio/content', item.id]" (click)="rowMenu.hide()"><app-icon name="external"></app-icon>Open article</a>
                        @if (item.publications.length) {
                          <a class="au-menu__item" routerLink="/studio/results" [queryParams]="{ projectId: item.id }" (click)="rowMenu.hide()"><app-icon name="publications"></app-icon>See publications</a>
                        }
                        @if (!showArchived) {
                          <button class="au-menu__item" type="button" (click)="rowMenu.hide(); duplicateOne(item)"><app-icon name="copy"></app-icon>Duplicate</button>
                          <div class="au-menu__sep"></div>
                          <button class="au-menu__item is-danger" type="button" (click)="rowMenu.hide(); removeOne(item)"><app-icon name="trash"></app-icon>Archive</button>
                        } @else {
                          <button class="au-menu__item" type="button" (click)="rowMenu.hide(); restoreOne(item)"><app-icon name="refresh"></app-icon>Restore</button>
                        }
                      </div>
                    </app-popover>
                  </td>
                </tr>
              }
            </tbody>
          </table>
          <div class="sp-pager">
            <span>{{ rangeStart }}–{{ rangeEnd }} of {{ total }}</span>
            @if (totalPages > 1) {
              <span class="sp-pager__btns">
                <button class="au-btn au-btn--ghost au-btn--icon au-btn--sm" type="button" [disabled]="page <= 1" (click)="goPage(page - 1)" aria-label="Previous page"><app-icon name="chevron-left"></app-icon></button>
                <button class="au-btn au-btn--ghost au-btn--icon au-btn--sm" type="button" [disabled]="page >= totalPages" (click)="goPage(page + 1)" aria-label="Next page"><app-icon name="chevron-right"></app-icon></button>
              </span>
            }
          </div>
        }
      </section>
    </section>
  `,
  styles: [`
    @container (max-width: 1100px) { .sp-hide-lg { display: none; } }
    @container (max-width: 860px) { .sp-hide-md { display: none; } }
    @container (max-width: 640px) {
      .sp-table thead { display: none; }
      .sp-table tbody tr { display: grid; grid-template-columns: 24px 64px minmax(0, 1fr) 32px; gap: 4px 12px; padding: 12px; border-bottom: 1px solid var(--sp-line); }
      .sp-table td { padding: 0; border: 0; }
      .sp-table td:nth-child(3) { grid-column: 3; grid-row: 1; }
      .sp-table td:nth-child(4), .sp-table td:nth-child(5) { grid-column: 3; }
      .sp-table td:nth-child(5) .sp-meta { display: none; }
      .sp-table .sp-col-menu { grid-column: 4; grid-row: 1; }
    }
  `],
})
export class ContentListPageComponent implements OnInit, OnDestroy {
  private readonly api = inject(StudioApiService);
  private readonly appContext = inject(AppContextService);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  readonly siteName = this.appContext.activeSite()?.name ?? 'This site';
  quickFilters = CONTENT_FILTERS;
  items: StudioProjectSummary[] = [];
  counts: Partial<Record<string, number>> = {};
  page = 1;
  pageSize = 20;
  total = 0;
  showArchived = false;
  loading = false;
  selectedIds = new Set<string>();
  filters = {
    siteId: this.appContext.activeSite()?.id ?? '',
    status: 'all' as string,
    origin: '',
    search: '',
  };
  private searchTimer: ReturnType<typeof setTimeout> | null = null;

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.total / this.pageSize));
  }
  get rangeStart(): number {
    return this.total === 0 ? 0 : (this.page - 1) * this.pageSize + 1;
  }
  get rangeEnd(): number {
    return Math.min(this.total, this.page * this.pageSize);
  }

  get allSelected(): boolean {
    return this.items.length > 0 && this.items.every((item) => this.selectedIds.has(item.id));
  }

  ngOnInit(): void {
    this.refresh();
  }

  ngOnDestroy(): void {
    if (this.searchTimer) clearTimeout(this.searchTimer);
  }

  setQuickFilter(key: string): void {
    this.filters.status = key;
    this.page = 1;
    this.load();
  }

  setArchived(archived: boolean): void {
    this.showArchived = archived;
    this.selectedIds.clear();
    this.applyFilters();
  }

  /** Search as you type, 300 ms after the last key. */
  searchChanged(): void {
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.applyFilters(), 300);
  }

  applyFilters(): void {
    this.page = 1;
    this.refresh();
  }

  refresh(): void {
    this.load();
    this.loadCounts();
  }

  goPage(page: number): void {
    this.page = page;
    this.load();
  }

  open(item: StudioProjectSummary): void {
    void this.router.navigate(['/studio/content', item.id]);
  }

  private query(status: string, page: number, pageSize: number) {
    return this.api.listProjects({
      page,
      pageSize,
      siteId: this.filters.siteId || undefined,
      status: (this.quickFilters.find((filter) => filter.key === status)?.statuses || undefined) as ProjectStatus | undefined,
      origin: (this.filters.origin || undefined) as 'manual' | 'auto' | undefined,
      archived: this.showArchived,
      search: this.filters.search || undefined,
    });
  }

  load(): void {
    this.loading = true;
    this.query(this.filters.status, this.page, this.pageSize).subscribe({
      next: (response) => {
        this.items = response.items;
        this.total = response.total;
        this.loading = false;
      },
      error: () => {
        this.items = [];
        this.total = 0;
        this.loading = false;
        this.toast.error('Could not load articles.');
      },
    });
  }

  /** One small request per state (pageSize 1) so the strip shows real totals for the current search and origin. */
  private loadCounts(): void {
    forkJoin(Object.fromEntries(this.quickFilters.map((filter) => [filter.key, this.query(filter.key, 1, 1)]))).subscribe({
      next: (responses) => (this.counts = Object.fromEntries(Object.entries(responses).map(([key, response]) => [key, response.total]))),
      error: () => (this.counts = {}),
    });
  }

  filterTone(key: string): Tone {
    return ({ draft: 'muted', review: 'warning', ready: 'info', published: 'success', failed: 'danger' } as Record<string, Tone>)[key] ?? 'muted';
  }

  statusLabel(item: StudioProjectSummary): string {
    if (item.automationMode === 'autopilot' && item.automationSubstate) {
      if (item.automationSubstate === 'qa_repairing') return `Repairing (attempt ${item.latestVersion?.repairAttempts ?? 1})`;
      return AUTOPILOT_LABELS[item.automationSubstate] ?? stageLabel(item.reviewGate);
    }
    return stageLabel(item.reviewGate);
  }

  statusTone(item: StudioProjectSummary): Tone {
    if (item.automationMode === 'autopilot' && item.automationSubstate) {
      const substate = item.automationSubstate;
      if (substate === 'published') return 'success';
      if (substate === 'intervention_required') return 'danger';
      if (['auto_approved', 'qa_passed', 'scheduled'].includes(substate)) return 'info';
      if (['publishing', 'retrying', 'qa_repairing'].includes(substate)) return 'warning';
      return 'muted';
    }
    const tone = stageTone(item.reviewGate);
    return tone === 'muted' ? 'muted' : tone;
  }

  /** The one reason a person has to act, when there is one. */
  blocker(item: StudioProjectSummary): string | null {
    const needsYou = item.automationSubstate === 'intervention_required' || item.reviewGate.stage === 'qa_blocked' || item.reviewGate.stage === 'publish_failed';
    return needsYou ? item.reviewGate.blockers[0] ?? item.reviewGate.nextAction ?? null : null;
  }

  metaLine(item: StudioProjectSummary): string {
    const origin = ({ auto: 'From sources', editorial: 'From the plan' } as Record<string, string>)[item.origin] ?? 'Manual';
    const mode = item.automationMode === 'autopilot' ? 'Autopilot' : item.automationMode === 'assisted' ? 'Assisted' : null;
    const words = item.latestVersion?.wordCount ? `${item.latestVersion.wordCount.toLocaleString('en-US')} words` : null;
    return [origin, mode, words, item.primaryLanguage?.toUpperCase()].filter(Boolean).join(' · ');
  }

  qaTone(item: StudioProjectSummary): Tone {
    const state = item.latestVersion?.qaState;
    if (state === 'passed' || state === 'approved' || state === 'published') return 'success';
    return state === 'failed' ? 'danger' : 'muted';
  }

  qaWord(item: StudioProjectSummary): string {
    return ({ success: 'passed', danger: 'failed' } as Record<string, string>)[this.qaTone(item)] ?? 'not checked';
  }

  qaScore(item: StudioProjectSummary): number | null {
    const score = item.latestVersion?.qaReport?.score;
    return typeof score === 'number' && Number.isFinite(score) ? Math.round(score) : null;
  }

  publicationWord(status: string): string {
    return status.replace(/_/g, ' ');
  }

  toggleSelected(id: string): void {
    if (this.selectedIds.has(id)) this.selectedIds.delete(id);
    else this.selectedIds.add(id);
  }

  toggleAll(): void {
    if (this.allSelected) this.selectedIds.clear();
    else for (const item of this.items) this.selectedIds.add(item.id);
  }

  duplicateOne(item: StudioProjectSummary): void {
    this.api.duplicateProject(item.id).subscribe({
      next: () => {
        this.toast.success('Duplicate created.');
        this.refresh();
      },
      error: () => this.toast.error('The article could not be duplicated.'),
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
            this.toast.success(ids.length === 1 ? 'Article approved.' : `${ids.length} articles approved.`);
            this.refresh();
          }
        },
        error: () => {
          remaining -= 1;
          if (remaining === 0) this.refresh();
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
      title: ids.length === 1 ? 'Archive this article?' : `Archive ${ids.length} articles?`,
      message: 'Archived articles move to Trash and can be restored later. An article already published stays online unless you unpublish it first.',
      confirmLabel: 'Archive',
      danger: true,
    });
    if (!confirmed) return;
    let remaining = ids.length;
    let failed = 0;
    for (const id of ids) {
      this.api.deleteProject(id, { mode: 'archive' }).subscribe({
        next: () => {
          remaining -= 1;
          if (remaining === 0) {
            this.selectedIds.clear();
            if (failed > 0) this.toast.error(`${failed} article(s) could not be archived.`);
            else this.toast.success(ids.length === 1 ? 'Article archived.' : `${ids.length} articles archived.`);
            this.refresh();
          }
        },
        error: () => {
          remaining -= 1;
          failed += 1;
          if (remaining === 0) this.refresh();
        },
      });
    }
  }

  restoreOne(item: StudioProjectSummary): void {
    this.api.restoreProject(item.id).subscribe({
      next: () => {
        this.toast.success('Article restored.');
        this.refresh();
      },
      error: () => this.toast.error('The article could not be restored.'),
    });
  }

  dateLabel(value: string | null): string {
    return value ? new Date(value).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }) : '—';
  }

  formatRelativeTime = formatRelativeTime;
}
