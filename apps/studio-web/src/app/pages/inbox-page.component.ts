import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subscription, timer } from 'rxjs';
import { StudioApiService } from '../services/studio-api.service';
import { AppContextService } from '../services/app-context.service';
import { ToastService } from '../services/toast.service';
import { AppIconComponent } from '../components/ui/app-icon.component';
import { AppEmptyStateComponent } from '../components/ui/app-empty-state.component';
import type { SourceItemStatus, StudioSite, StudioSource, StudioSourceItem, StudioStoryCluster } from '../models/studio.models';

type InboxTab = 'inbox' | 'clusters';

@Component({
  selector: 'app-inbox-page',
  standalone: true,
  imports: [CommonModule, FormsModule, AppIconComponent, AppEmptyStateComponent],
  template: `
    <section class="au-page">
      <header class="au-page__header">
        <div>
          <p class="au-page__eyebrow">Discovery</p>
          <h1 class="au-page__title">Inbox</h1>
          <p class="au-page__subtitle">Stories discovered across your sources, ready to triage.</p>
        </div>
        <div class="au-page__actions">
          <a class="au-btn au-btn--secondary" routerLink="/studio/sources">
            <app-icon name="sources"></app-icon>
            Manage sources
          </a>
        </div>
      </header>

      <div class="au-tabs">
        <button class="au-tab" [class.is-active]="tab === 'inbox'" type="button" (click)="setTab('inbox')">
          Stories
          <span class="au-badge au-badge--neutral">{{ tab === 'inbox' ? total : '…' }}</span>
        </button>
        <button class="au-tab" [class.is-active]="tab === 'clusters'" type="button" (click)="setTab('clusters')">
          Clusters
          <span class="au-badge au-badge--neutral">{{ tab === 'clusters' ? clusters.length : '…' }}</span>
        </button>
      </div>

      <div class="au-toolbar" *ngIf="tab === 'inbox'">
        <div class="au-search">
          <app-icon name="search"></app-icon>
          <input
            class="au-input au-input--search"
            type="search"
            placeholder="Search stories…"
            [(ngModel)]="filters.search"
            (keyup.enter)="applyFilters()"
          />
        </div>
        <select class="au-select au-filter-select" [(ngModel)]="filters.sourceId" (ngModelChange)="applyFilters()" aria-label="Filter by source">
          <option value="">All sources</option>
          <option *ngFor="let source of sources" [ngValue]="source.id">{{ source.name }}</option>
        </select>
        <select class="au-select au-filter-select" [(ngModel)]="filters.status" (ngModelChange)="applyFilters()" aria-label="Filter by status">
          <option value="candidate">Candidates</option>
          <option value="discovered">New</option>
          <option value="selected">Selected</option>
          <option value="rejected">Rejected</option>
          <option value="processed">Processed</option>
          <option value="">All</option>
        </select>
        <select class="au-select au-filter-select" [(ngModel)]="filters.sort" (ngModelChange)="applyFilters()" aria-label="Sort stories">
          <option value="score">Highest score first</option>
          <option value="discovered">Newest first</option>
        </select>
        <button class="au-btn au-btn--ghost au-btn--sm" type="button" (click)="load()" [disabled]="loading">
          <app-icon name="refresh"></app-icon>
          Refresh
        </button>
      </div>

      <ng-container *ngIf="tab === 'inbox'">
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
              icon="inbox"
              title="No stories to triage"
              text="Stories appear here once a source fetches them. Add a source or adjust the filters."
            >
              <a class="au-btn au-btn--secondary au-btn--sm" routerLink="/studio/sources">Add source</a>
              <button class="au-btn au-btn--ghost au-btn--sm" type="button" (click)="clearFilters()">Reset filters</button>
            </app-empty-state>
          } @else {
            <div class="au-feed">
              <article class="au-feed__item" *ngFor="let item of items">
                <img class="au-feed__img" *ngIf="firstImage(item)" [src]="firstImage(item)" alt="" loading="lazy" />
                <div class="au-feed__body">
                  <div class="au-feed__meta">
                    <span class="au-badge au-badge--outline">{{ item.source.name }}</span>
                    <span class="au-badge au-badge--brand" *ngIf="item.retrieval">AI discovered · {{ item.retrieval.provider }} · {{ dateLabel(item.retrieval.retrievedAt) }}</span>
                    <span class="au-badge au-badge--brand" *ngIf="item.cluster">cluster ×{{ item.cluster.sourceCount }}</span>
                    <span
                      class="au-badge"
                      *ngIf="item.score !== null"
                      [class.au-badge--success]="item.score >= 0.7"
                      [class.au-badge--warning]="item.score >= 0.4 && item.score < 0.7"
                      [class.au-badge--neutral]="item.score < 0.4"
                      [title]="scoreExplanation(item)"
                    >
                      score {{ scorePct(item) }}
                    </span>
                    <span class="au-feed__date">{{ dateLabel(item.discoveredAt) }}</span>
                  </div>
                  <h3 class="au-feed__title">{{ item.title }}</h3>
                  <p class="au-feed__desc">{{ item.description || '—' }}</p>
                  <div class="au-feed__actions">
                    <select
                      class="au-select au-filter-select"
                      [(ngModel)]="siteForItem[item.id]"
                      (ngModelChange)="onSiteChosen($event, item.id)"
                      aria-label="Create article on site"
                    >
                      <option [ngValue]="null" disabled>Create article on…</option>
                      <option *ngFor="let site of sites" [ngValue]="site.id">{{ site.name }}</option>
                    </select>
                    <button
                      class="au-btn au-btn--primary au-btn--sm"
                      type="button"
                      (click)="createArticle(item)"
                      [disabled]="!siteForItem[item.id] || creating[item.id]"
                    >
                      <app-icon name="sparkles"></app-icon>
                      {{ creating[item.id] ? 'Creating…' : 'Rewrite as news article' }}
                    </button>
                    <button class="au-btn au-btn--ghost au-btn--sm" type="button" (click)="select(item)">Select</button>
                    <button class="au-btn au-btn--ghost au-btn--sm" type="button" (click)="reject(item)">Ignore</button>
                    <a class="au-link" *ngIf="item.canonicalUrl" [href]="item.canonicalUrl" target="_blank" rel="noopener">
                      Open source
                      <app-icon name="external"></app-icon>
                    </a>
                  </div>
                  <div class="au-feed__note" *ngIf="noticeFor[item.id]">{{ noticeFor[item.id] }}</div>
                </div>
              </article>
            </div>
            @if (totalPages > 1) {
              <div class="au-pager">
                <button class="au-btn au-btn--ghost au-btn--sm" type="button" [disabled]="page <= 1" (click)="goPage(page - 1)">
                  Previous
                </button>
                <span>Page {{ page }} of {{ totalPages }} · {{ total }} stories</span>
                <button class="au-btn au-btn--ghost au-btn--sm" type="button" [disabled]="page >= totalPages" (click)="goPage(page + 1)">
                  Next
                </button>
              </div>
            }
          }
        </section>
      </ng-container>

      <section class="au-panel" *ngIf="tab === 'clusters'">
        <app-empty-state
          *ngIf="clusters.length === 0"
          icon="layers"
          title="No story clusters yet"
          text="Clusters appear when the same story is discovered across several sources."
        ></app-empty-state>
        <div class="au-feed" *ngIf="clusters.length > 0">
          <article class="au-feed__item" *ngFor="let cluster of clusters">
            <div class="au-feed__body">
              <div class="au-feed__meta">
                <span class="au-badge au-badge--brand">×{{ cluster.sourceCount }} sources</span>
                <span class="au-badge au-badge--neutral">{{ cluster.status }}</span>
                <span class="au-feed__date">{{ dateLabel(cluster.lastSeenAt) }}</span>
              </div>
              <h3 class="au-feed__title">{{ cluster.headline }}</h3>
              <p class="au-feed__desc">{{ cluster.summary }}</p>
              <div class="au-feed__meta">
                <span class="au-badge au-badge--outline" *ngFor="let member of cluster.items">{{ member.source.name }}</span>
              </div>
            </div>
          </article>
        </div>
      </section>
    </section>
  `,
})
export class InboxPageComponent implements OnInit, OnDestroy {
  private readonly api = inject(StudioApiService);
  private readonly appContext = inject(AppContextService);
  private readonly toast = inject(ToastService);

  tab: InboxTab = 'inbox';
  items: StudioSourceItem[] = [];
  clusters: StudioStoryCluster[] = [];
  sources: StudioSource[] = [];
  sites: StudioSite[] = [];
  page = 1;
  pageSize = 20;
  total = 0;
  loading = false;
  siteForItem: Record<string, string | null> = {};
  creating: Record<string, boolean> = {};
  noticeFor: Record<string, string> = {};
  filters = {
    sourceId: '',
    status: 'candidate' as '' | SourceItemStatus,
    search: '',
    sort: 'score' as 'score' | 'discovered',
  };
  private refreshSubscription: Subscription | null = null;

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.total / this.pageSize));
  }

  ngOnInit(): void {
    this.sites = this.appContext.sites();
    this.api.listSources(1, 100).subscribe({
      next: (response) => {
        this.sources = response.items;
      },
    });
    this.load();
    this.refreshSubscription = timer(30_000, 30_000).subscribe(() => this.load(true));
  }

  ngOnDestroy(): void {
    this.refreshSubscription?.unsubscribe();
  }

  setTab(tab: InboxTab): void {
    this.tab = tab;
    this.load();
  }

  clearFilters(): void {
    this.filters = { sourceId: '', status: 'candidate', search: '', sort: 'score' };
    this.page = 1;
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

  load(silent = false): void {
    if (!silent) {
      this.loading = true;
    }
    if (this.tab === 'clusters') {
      this.api.listStoryClusters(1, 50).subscribe({
        next: (response) => {
          this.clusters = response.items;
          this.loading = false;
        },
        error: () => {
          this.clusters = [];
          this.loading = false;
          if (!silent) {
            this.toast.error('Could not load story clusters.');
          }
        },
      });
      return;
    }
    this.api
      .listSourceItems(this.page, this.pageSize, {
        sourceId: this.filters.sourceId || undefined,
        status: this.filters.status || undefined,
        search: this.filters.search || undefined,
        sort: this.filters.sort,
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
          if (!silent) {
            this.toast.error('Could not load the inbox. Check that your sources are connected and try again.');
          }
        },
      });
  }

  firstImage(item: StudioSourceItem): string | null {
    return Array.isArray(item.sourceImageUrls) && item.sourceImageUrls.length > 0 ? item.sourceImageUrls[0] : null;
  }

  scorePct(item: StudioSourceItem): string {
    return item.score === null ? '—' : `${Math.round(item.score * 100)}`;
  }

  scoreExplanation(item: StudioSourceItem): string {
    const explanation = item.scoreExplanation ?? [];
    return explanation.map((entry) => `${entry.signal}: ${entry.points > 0 ? '+' : ''}${entry.points} (${entry.detail})`).join('\n');
  }

  dateLabel(value: string): string {
    return new Date(value).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  onSiteChosen(siteId: string | null, itemId: string): void {
    this.siteForItem[itemId] = siteId;
  }

  createArticle(item: StudioSourceItem): void {
    const siteId = this.siteForItem[item.id];
    if (!siteId || this.creating[item.id]) {
      return;
    }
    this.creating[item.id] = true;
    this.api
      .createProjectFromSourceItem({ siteId, sourceItemId: item.id, goal: 'news_article' })
      .subscribe({
        next: (result) => {
          this.creating[item.id] = false;
          this.load(true);
          this.toast.success(
            result.kind === 'update' ? 'Existing article updated with the new source facts.' : 'Article created. Generation started.',
          );
        },
        error: (error) => {
          const message = String(error?.error?.message ?? error?.message ?? 'Failed to create article.');
          const existingId = message.match(/already_covered:([0-9a-f-]{36})/)?.[1];
          if (existingId) {
            this.noticeFor[item.id] = 'This story was already covered. Choose "Update existing article" to add these facts to it.';
          } else {
            this.noticeFor[item.id] = message;
          }
          this.creating[item.id] = false;
          this.toast.error('The article could not be created.');
        },
      });
  }

  select(item: StudioSourceItem): void {
    this.api.setSourceItemStatus(item.id, 'selected').subscribe({
      next: () => this.load(true),
      error: () => this.toast.error('The story could not be selected.'),
    });
  }

  reject(item: StudioSourceItem): void {
    this.api.setSourceItemStatus(item.id, 'rejected').subscribe({
      next: () => this.load(true),
      error: () => this.toast.error('The story could not be dismissed.'),
    });
  }
}
