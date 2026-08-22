import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subscription, timer } from 'rxjs';
import { StudioApiService } from '../services/studio-api.service';
import { AppContextService } from '../services/app-context.service';
import type { SourceItemStatus, StudioSite, StudioSource, StudioSourceItem, StudioStoryCluster } from '../models/studio.models';

type InboxTab = 'inbox' | 'clusters';

@Component({
  selector: 'app-inbox-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <section class="au-page">
      <header class="au-page__header">
        <div>
          <h1 class="au-page__title">Inbox</h1>
          <p class="au-page__subtitle">The newsroom wire: newly discovered stories across your sources.</p>
        </div>
      </header>

      <nav class="au-tabs">
        <button class="au-tab" [class.is-active]="tab === 'inbox'" type="button" (click)="setTab('inbox')">Stories</button>
        <button class="au-tab" [class.is-active]="tab === 'clusters'" type="button" (click)="setTab('clusters')">Clusters</button>
      </nav>

      <div class="au-toolbar au-toolbar--wrap" *ngIf="tab === 'inbox'">
        <select class="au-input au-input--inline" [(ngModel)]="filters.sourceId" (ngModelChange)="applyFilters()">
          <option value="">All sources</option>
          <option *ngFor="let source of sources" [ngValue]="source.id">{{ source.name }}</option>
        </select>
        <select class="au-input au-input--inline" [(ngModel)]="filters.status" (ngModelChange)="applyFilters()">
          <option value="candidate">Candidates</option>
          <option value="discovered">New</option>
          <option value="selected">Selected</option>
          <option value="rejected">Rejected</option>
          <option value="processed">Processed</option>
          <option value="">All</option>
        </select>
        <select class="au-input au-input--inline" [(ngModel)]="filters.sort" (ngModelChange)="applyFilters()">
          <option value="score">Sort by score</option>
          <option value="discovered">Sort by date</option>
        </select>
        <input
          class="au-input au-input--search"
          type="search"
          placeholder="Search stories…"
          [(ngModel)]="filters.search"
          (keyup.enter)="applyFilters()"
        />
        <button class="au-button au-button--ghost" type="button" (click)="load()">Refresh</button>
      </div>

      <ng-container *ngIf="tab === 'inbox'">
        <section class="au-surface au-surface--list">
          <div class="au-empty" *ngIf="items.length === 0">No stories here. Fetch a source or adjust the filters.</div>
          <article class="au-inbox-card" *ngFor="let item of items">
            <img class="au-inbox-card__img" *ngIf="firstImage(item)" [src]="firstImage(item)" alt="" />
            <div class="au-inbox-card__body">
              <div class="au-inbox-card__meta">
                <span class="au-tag au-tag--muted">{{ item.source.name }}</span>
                <span class="au-tag" *ngIf="item.cluster">cluster ×{{ item.cluster.sourceCount }}</span>
                <span class="au-tag" *ngIf="item.score !== null" [class.au-tag--success]="item.score >= 0.7" [title]="scoreExplanation(item)">
                  ★ {{ scorePct(item) }}
                </span>
                <span class="au-inbox-card__status">{{ item.processingStatus }}</span>
                <span class="au-inbox-card__date">{{ dateLabel(item.discoveredAt) }}</span>
              </div>
              <h3 class="au-inbox-card__title">{{ item.title }}</h3>
              <p class="au-inbox-card__desc">{{ item.description || '—' }}</p>
              <div class="au-inbox-card__actions">
                <span class="au-select au-select--inline">
                  <select class="au-input au-input--sm" [(ngModel)]="siteForItem[item.id]" (ngModelChange)="onSiteChosen($event, item.id)">
                    <option [ngValue]="null" disabled>Create article on…</option>
                    <option *ngFor="let site of sites" [ngValue]="site.id">{{ site.name }}</option>
                  </select>
                </span>
                <button class="au-button au-button--primary au-button--sm" type="button" (click)="createArticle(item)" [disabled]="!siteForItem[item.id] || creating[item.id]">
                  {{ creating[item.id] ? 'Creating…' : 'Rewrite as news article' }}
                </button>
                <button class="au-button au-button--ghost au-button--sm" type="button" (click)="select(item)">Select</button>
                <button class="au-button au-button--ghost au-button--sm" type="button" (click)="reject(item)">Ignore</button>
                <a class="au-link au-link--sm" *ngIf="item.canonicalUrl" [href]="item.canonicalUrl" target="_blank" rel="noopener">Open source ↗</a>
              </div>
              <div class="au-inbox-card__note" *ngIf="noticeFor[item.id]">{{ noticeFor[item.id] }}</div>
            </div>
          </article>
        </section>
        <div class="au-pagination" *ngIf="totalPages > 1">
          <button class="au-button au-button--ghost" type="button" [disabled]="page <= 1" (click)="goPage(page - 1)">‹ Prev</button>
          <span>Page {{ page }} of {{ totalPages }} ({{ total }} items)</span>
          <button class="au-button au-button--ghost" type="button" [disabled]="page >= totalPages" (click)="goPage(page + 1)">Next ›</button>
        </div>
      </ng-container>

      <section class="au-surface au-surface--list" *ngIf="tab === 'clusters'">
        <div class="au-empty" *ngIf="clusters.length === 0">No story clusters yet.</div>
        <article class="au-inbox-card" *ngFor="let cluster of clusters">
          <div class="au-inbox-card__body">
            <div class="au-inbox-card__meta">
              <span class="au-tag">×{{ cluster.sourceCount }} sources</span>
              <span class="au-tag au-tag--muted">{{ cluster.status }}</span>
              <span class="au-inbox-card__date">{{ dateLabel(cluster.lastSeenAt) }}</span>
            </div>
            <h3 class="au-inbox-card__title">{{ cluster.headline }}</h3>
            <p class="au-inbox-card__desc">{{ cluster.summary }}</p>
            <div class="au-inbox-card__sources">
              <span class="au-tag au-tag--muted" *ngFor="let member of cluster.items">{{ member.source.name }}</span>
            </div>
          </div>
        </article>
      </section>
    </section>
  `,
  styles: [
    `
      .au-toolbar--wrap { flex-wrap: wrap; }
      .au-surface--list { padding: 0.25rem 0.75rem; }
      .au-inbox-card { display: flex; gap: 0.9rem; padding: 0.9rem 0.35rem; border-bottom: 1px solid var(--au-border-subtle, #f3f4f6); }
      .au-inbox-card:last-child { border-bottom: none; }
      .au-inbox-card__img { width: 84px; height: 84px; object-fit: cover; border-radius: 8px; flex-shrink: 0; }
      .au-inbox-card__body { flex: 1; min-width: 0; }
      .au-inbox-card__meta { display: flex; gap: 0.4rem; align-items: center; flex-wrap: wrap; }
      .au-inbox-card__status { font-size: 0.7rem; text-transform: uppercase; color: var(--au-muted, #6b7280); }
      .au-inbox-card__date { font-size: 0.72rem; color: var(--au-muted, #6b7280); }
      .au-inbox-card__title { margin: 0.35rem 0; font-size: 1.02rem; }
      .au-inbox-card__desc { font-size: 0.85rem; color: var(--au-text-subtle, #4b5563); margin: 0 0 0.5rem; max-width: 900px; }
      .au-inbox-card__actions { display: flex; gap: 0.45rem; align-items: center; flex-wrap: wrap; }
      .au-inbox-card__note { margin-top: 0.45rem; font-size: 0.8rem; color: var(--au-success, #16a34a); }
      .au-inbox-card__sources { display: flex; gap: 0.35rem; flex-wrap: wrap; margin-top: 0.4rem; }
      .au-button--sm { padding: 0.3rem 0.7rem; font-size: 0.8rem; }
      .au-input--sm { padding: 0.3rem 0.5rem; font-size: 0.8rem; }
      .au-link--sm { font-size: 0.8rem; }
      .au-pagination { display: flex; align-items: center; gap: 0.75rem; padding: 0.75rem; font-size: 0.85rem; }
      @media (max-width: 640px) {
        .au-inbox-card { flex-direction: column; }
        .au-inbox-card__img { width: 100%; height: 150px; }
      }
    `,
  ],
})
export class InboxPageComponent implements OnInit, OnDestroy {
  private readonly api = inject(StudioApiService);
  private readonly appContext = inject(AppContextService);

  tab: InboxTab = 'inbox';
  items: StudioSourceItem[] = [];
  clusters: StudioStoryCluster[] = [];
  sources: StudioSource[] = [];
  sites: StudioSite[] = [];
  page = 1;
  pageSize = 20;
  total = 0;
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

  applyFilters(): void {
    this.page = 1;
    this.load();
  }

  goPage(page: number): void {
    this.page = page;
    this.load();
  }

  load(silent = false): void {
    if (this.tab === 'clusters') {
      this.api.listStoryClusters(1, 50).subscribe({
        next: (response) => {
          this.clusters = response.items;
        },
        error: () => {
          if (!silent) {
            this.clusters = [];
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
        },
        error: () => {
          if (!silent) {
            this.items = [];
            this.total = 0;
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
          this.noticeFor[item.id] =
            result.kind === 'update'
              ? `Updated existing article (v${result.projectId.slice(0, 8)}) with the new source facts.`
              : 'Article created. Generation started.';
          this.creating[item.id] = false;
          this.load(true);
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
        },
      });
  }

  select(item: StudioSourceItem): void {
    this.api.setSourceItemStatus(item.id, 'selected').subscribe(() => this.load(true));
  }

  reject(item: StudioSourceItem): void {
    this.api.setSourceItemStatus(item.id, 'rejected').subscribe(() => this.load(true));
  }
}
