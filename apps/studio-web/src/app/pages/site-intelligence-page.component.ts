import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { StudioApiService } from '../services/studio-api.service';
import { AppContextService } from '../services/app-context.service';
import { ToastService } from '../services/toast.service';
import { AppIconComponent } from '../components/ui/app-icon.component';
import { AppEmptyStateComponent } from '../components/ui/app-empty-state.component';
import type { SiteIndexedPageRow, SiteIntelligenceOverview, StudioSite } from '../models/studio.models';

@Component({
  selector: 'app-site-intelligence-page',
  standalone: true,
  imports: [CommonModule, FormsModule, AppIconComponent, AppEmptyStateComponent],
  template: `
    <section class="au-page">
      <header class="au-page__header">
        <div>
          <p class="au-page__eyebrow">Site Intelligence</p>
          <h1 class="au-page__title">Site Intelligence</h1>
          <p class="au-page__subtitle">What Auctorio actually knows about the connected website.</p>
        </div>
        <div class="au-page__actions">
          <select class="au-select" [(ngModel)]="selectedSiteId" (ngModelChange)="onSiteChange()" aria-label="Select site">
            <option *ngFor="let site of sites" [value]="site.id">{{ site.name }}</option>
          </select>
          <button class="au-btn au-btn--secondary" type="button" [disabled]="indexing" (click)="crawlChanged()">
            <app-icon name="refresh"></app-icon>
            Crawl changes
          </button>
          <button class="au-btn au-btn--primary" type="button" [disabled]="indexing" (click)="indexSite()">
            <app-icon name="scan"></app-icon>
            {{ indexing ? 'Indexing…' : 'Index website' }}
          </button>
        </div>
      </header>

      <div class="au-banner au-banner--error" *ngIf="loadError">
        <app-icon name="warning"></app-icon>
        <span class="au-banner__text">{{ loadError }}</span>
        <button class="au-banner__action" type="button" (click)="load()">Retry</button>
      </div>

      <ng-container *ngIf="overview">
        <!-- Overview -->
        <section class="au-panel au-panel--padded au-mb-3">
          <div class="au-stat-strip">
            <div class="au-stat">
              <span class="au-stat__value">{{ overview.totalPages }}</span>
              <span class="au-stat__label">Pages indexed</span>
            </div>
            <div class="au-stat">
              <span class="au-stat__value">{{ overview.extractedPages }}</span>
              <span class="au-stat__label">Pages crawled</span>
            </div>
            <div class="au-stat">
              <span class="au-stat__value">{{ healthySitemaps }}/{{ overview.sitemaps.length }}</span>
              <span class="au-stat__label">Healthy sitemaps</span>
            </div>
            <div class="au-stat">
              <span class="au-stat__value">{{ overview.profile?.topicClusters?.length ?? 0 }}</span>
              <span class="au-stat__label">Topic clusters</span>
            </div>
            <div class="au-stat">
              <span class="au-stat__value">{{ overview.profile?.detectedSiteType ?? '—' }}</span>
              <span class="au-stat__label">Detected site type</span>
            </div>
            <div class="au-stat">
              <span class="au-stat__value">{{ overview.profile ? (overview.profile.confidence !== null ? (overview.profile.confidence * 100 | number: '1.0-0') + '%' : '—') : '—' }}</span>
              <span class="au-stat__label">Profile confidence</span>
            </div>
          </div>

          <div class="au-banner au-banner--warning au-mt-2" *ngFor="let warning of overview.profile?.warnings ?? []">
            <app-icon name="warning"></app-icon>
            <span class="au-banner__text">{{ warning }}</span>
          </div>

          <div class="au-field-grid au-mt-3">
            <div class="au-meta">
              <strong>Brand summary</strong>
              <p class="au-muted">{{ overview.profile?.brandSummary || 'No profile yet. Index the website to synthesize one.' }}</p>
            </div>
            <div class="au-meta">
              <strong>Audience & language</strong>
              <p class="au-muted">{{ overview.profile?.detectedAudience || '—' }} · {{ overview.profile?.detectedLanguage || '—' }} · average article {{ overview.profile?.commonArticleLength ?? '—' }} words</p>
            </div>
            <div class="au-meta">
              <strong>Last crawl</strong>
              <p class="au-muted">{{ overview.lastRun ? (overview.lastRun | date: 'medium') : 'Never' }}</p>
            </div>
          </div>
        </section>

        <!-- Topics -->
        <section class="au-panel au-panel--padded au-mb-3">
          <h2 class="au-panel__title">Detected topics</h2>
          <div class="au-chips au-mt-2">
            <span class="au-chip au-chip--brand" *ngFor="let topic of overview.profile?.mainTopics ?? []">{{ topic }}</span>
          </div>
          <div class="au-field-grid au-mt-3">
            <div class="au-meta">
              <strong>Commercial topics</strong>
              <p class="au-muted">{{ (overview.profile?.commercialTopics ?? []).join(', ') || '—' }}</p>
            </div>
            <div class="au-meta">
              <strong>Evergreen topics</strong>
              <p class="au-muted">{{ (overview.profile?.evergreenTopics ?? []).join(', ') || '—' }}</p>
            </div>
            <div class="au-meta">
              <strong>News topics</strong>
              <p class="au-muted">{{ (overview.profile?.newsTopics ?? []).join(', ') || '—' }}</p>
            </div>
            <div class="au-meta">
              <strong>Sports topics</strong>
              <p class="au-muted">{{ (overview.profile?.sportsTopics ?? []).join(', ') || '—' }}</p>
            </div>
          </div>
        </section>

        <!-- Topic clusters -->
        <section class="au-panel au-mb-3" *ngIf="(overview.profile?.topicClusters ?? []).length > 0">
          <header class="au-panel__header">
            <h2 class="au-panel__title">Topic map</h2>
            <span class="au-badge au-badge--neutral">{{ overview.profile?.topicClusters?.length }} clusters</span>
          </header>
          <div class="au-table-wrap au-table-wrap--scrollable">
            <table class="au-table">
              <thead>
                <tr><th>Cluster</th><th>Pages</th><th>Authority</th><th>Keywords</th></tr>
              </thead>
              <tbody>
                <tr *ngFor="let cluster of overview.profile?.topicClusters">
                  <td><span class="au-table__title">{{ cluster.name }}</span></td>
                  <td>{{ cluster.pagesCount }}</td>
                  <td>{{ cluster.authorityScore | number: '1.0-2' }}</td>
                  <td class="au-muted">{{ (cluster.keywords ?? []).join(', ') }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <!-- Sitemaps -->
        <section class="au-panel au-mb-3">
          <header class="au-panel__header">
            <h2 class="au-panel__title">Sitemaps</h2>
            <span class="au-badge au-badge--neutral">{{ overview.sitemaps.length }}</span>
          </header>
          <div class="au-table-wrap au-table-wrap--scrollable">
            <table class="au-table">
              <thead>
                <tr><th>URL</th><th>Kind</th><th>Status</th><th>URLs</th><th>Last fetched</th></tr>
              </thead>
              <tbody>
                <tr *ngFor="let sitemap of overview.sitemaps">
                  <td class="au-muted au-ellipsis">{{ sitemap.url }}</td>
                  <td><span class="au-channel">{{ sitemap.kind }}</span></td>
                  <td>
                    <span class="au-badge" [class.au-badge--success]="sitemap.status === 'fetched'" [class.au-badge--danger]="sitemap.status === 'failed' || sitemap.status === 'blocked'" [class.au-badge--neutral]="sitemap.status !== 'fetched' && sitemap.status !== 'failed' && sitemap.status !== 'blocked'">{{ sitemap.status }}</span>
                    <span class="au-table__sub" *ngIf="sitemap.error">{{ sitemap.error }}</span>
                  </td>
                  <td>{{ sitemap.urlCount ?? '—' }}</td>
                  <td class="au-muted">{{ sitemap.lastFetchedAt ? (sitemap.lastFetchedAt | date: 'medium') : '—' }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <!-- Indexed pages -->
        <section class="au-panel">
          <header class="au-panel__header">
            <h2 class="au-panel__title">Indexed pages</h2>
            <span class="au-badge au-badge--neutral">{{ pagesTotal }}</span>
          </header>
          <div class="au-toolbar au-toolbar--panel">
            <div class="au-search">
              <app-icon name="search"></app-icon>
              <input class="au-input au-input--search" type="search" placeholder="Search URL or title…" [(ngModel)]="pageQuery" (keyup.enter)="loadPages()" />
            </div>
            <select class="au-select au-filter-select" [(ngModel)]="pageCrawlState" (ngModelChange)="loadPages()" aria-label="Filter by crawl state">
              <option value="">All states</option>
              <option value="extracted">Extracted</option>
              <option value="discovered">Discovered</option>
              <option value="stale">Stale</option>
              <option value="failed">Failed</option>
              <option value="skipped">Skipped</option>
            </select>
            <button class="au-btn au-btn--ghost au-btn--sm" type="button" (click)="loadPages()">Apply</button>
          </div>
          <div class="au-table-wrap au-table-wrap--scrollable">
            <table class="au-table">
              <thead>
                <tr><th>URL</th><th>Title</th><th>Type</th><th>Words</th><th>State</th><th>Last indexed</th></tr>
              </thead>
              <tbody>
                <tr *ngFor="let page of pages">
                  <td class="au-muted au-ellipsis">{{ page.url }}</td>
                  <td><span class="au-table__title">{{ page.title || '—' }}</span></td>
                  <td><span class="au-channel">{{ page.contentType || '—' }}</span></td>
                  <td>{{ page.wordCount ?? '—' }}</td>
                  <td><span class="au-badge" [class.au-badge--success]="page.crawlState === 'extracted'" [class.au-badge--danger]="page.crawlState === 'failed'" [class.au-badge--neutral]="page.crawlState !== 'extracted' && page.crawlState !== 'failed'">{{ page.crawlState }}</span></td>
                  <td class="au-muted">{{ page.lastIndexedAt ? (page.lastIndexedAt | date: 'medium') : '—' }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="au-pagination" *ngIf="pagesTotal > 25">
            <button class="au-btn au-btn--ghost au-btn--sm" type="button" [disabled]="page <= 1" (click)="goPage(page - 1)">Previous</button>
            <span class="au-muted">Page {{ page }}</span>
            <button class="au-btn au-btn--ghost au-btn--sm" type="button" [disabled]="page * 25 >= pagesTotal" (click)="goPage(page + 1)">Next</button>
          </div>
        </section>
      </ng-container>

      <app-empty-state
        *ngIf="!loading && !overview && !loadError"
        icon="scan"
        title="No site intelligence yet"
        text="Index the connected website to crawl its sitemap, understand its content and build a durable site profile."
      ></app-empty-state>
    </section>
  `,
})
export class SiteIntelligencePageComponent implements OnInit {
  private readonly api = inject(StudioApiService);
  private readonly appContext = inject(AppContextService);
  private readonly toast = inject(ToastService);
  sites: StudioSite[] = [];
  selectedSiteId = '';
  overview: SiteIntelligenceOverview | null = null;
  loading = true;
  indexing = false;
  loadError = '';
  pages: SiteIndexedPageRow[] = [];
  pagesTotal = 0;
  page = 1;
  pageQuery = '';
  pageCrawlState = '';

  get healthySitemaps(): number {
    return this.overview?.sitemaps.filter((sitemap) => sitemap.status === 'fetched').length ?? 0;
  }

  ngOnInit(): void {
    this.sites = this.appContext.sites();
    this.selectedSiteId = this.appContext.activeSite()?.id ?? this.sites[0]?.id ?? '';
    this.load();
  }

  onSiteChange(): void {
    this.overview = null;
    this.pages = [];
    this.load();
  }

  load(): void {
    if (!this.selectedSiteId) {
      this.loading = false;
      return;
    }
    this.loading = true;
    this.loadError = '';
    this.api.getSiteIntelligence(this.selectedSiteId).subscribe({
      next: (overview) => {
        this.overview = overview;
        this.loading = false;
        this.loadPages();
      },
      error: () => {
        this.loadError = 'Site intelligence could not be loaded. Try again.';
        this.loading = false;
      },
    });
  }

  loadPages(): void {
    if (!this.selectedSiteId) return;
    this.api.listSiteIntelligencePages(this.selectedSiteId, { q: this.pageQuery || undefined, crawlState: this.pageCrawlState || undefined, page: this.page, pageSize: 25 }).subscribe({
      next: (response) => {
        this.pages = response.items;
        this.pagesTotal = response.total;
      },
      error: () => {
        this.loadError = 'Indexed pages could not be loaded.';
      },
    });
  }

  goPage(target: number): void {
    this.page = target;
    this.loadPages();
  }

  indexSite(): void {
    if (!this.selectedSiteId || this.indexing) return;
    this.indexing = true;
    this.api.indexSite(this.selectedSiteId, {}).subscribe({
      next: () => {
        this.toast.success('Site indexing started. The workspace stays responsive while it runs.');
        setTimeout(() => this.load(), 2500);
      },
      error: (err) => {
        this.indexing = false;
        this.loadError = err?.error?.error?.message || 'Indexing could not be started.';
      },
    });
  }

  crawlChanged(): void {
    if (!this.selectedSiteId || this.indexing) return;
    this.indexing = true;
    this.api.indexSite(this.selectedSiteId, { crawl: true, changedOnly: true }).subscribe({
      next: () => {
        this.toast.success('Changed-page crawl started.');
        setTimeout(() => this.load(), 2500);
      },
      error: (err) => {
        this.indexing = false;
        this.loadError = err?.error?.error?.message || 'Crawl could not be started.';
      },
    });
  }
}
