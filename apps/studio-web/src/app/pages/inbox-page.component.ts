import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Component, DestroyRef, OnDestroy, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Subscription, timer } from 'rxjs';
import { StudioApiService } from '../services/studio-api.service';
import { AppContextService } from '../services/app-context.service';
import { ToastService } from '../services/toast.service';
import { AppIconComponent } from '../components/ui/app-icon.component';
import { AppEmptyStateComponent } from '../components/ui/app-empty-state.component';
import { ProductionApiService } from '../services/production-api.service';
import { ProductionStatusComponent } from '../components/production/production-status.component';
import type {
  SourceItemStatus,
  StudioMuteRule,
  StudioSite,
  StudioSource,
  StudioSourceItem,
  StudioStoryCluster,
  StudioStoryDetail,
} from '../models/studio.models';

type InboxTab = 'inbox' | 'clusters';

@Component({
  selector: 'app-inbox-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, AppIconComponent, AppEmptyStateComponent, ProductionStatusComponent],
  template: `
    <section class="au-page advanced-page advanced-inbox">
      <header class="au-page__header">
        <div>
          <p class="au-page__eyebrow">Auctorio / Herramientas avanzadas</p>
          <h1 class="au-page__title">Inbox editorial</h1>
          <p class="au-page__subtitle">Descubrimiento, triage y evidencias: convertir información en propuestas sin ruido.</p>
        </div>
        <div class="au-page__actions">
          <button class="au-btn au-btn--secondary au-btn--sm" type="button" (click)="load()" [disabled]="loading"><app-icon name="refresh"></app-icon>Actualizar historias</button>
          <a class="au-btn au-btn--secondary" routerLink="/studio/sources">
            <app-icon name="sources"></app-icon>
            Gestionar fuentes
          </a>
        </div>
      </header>

      <dl class="advanced-kpis" aria-label="Resumen del Inbox" *ngIf="tab === 'inbox' && !loading">
        <div class="au-stat">
          <dt class="au-stat__label">Historias encontradas</dt>
          <dd class="au-stat__value">{{ total }}</dd>
          <dd class="au-stat__note">Con los filtros actuales</dd>
        </div>
        <div class="au-stat advanced-stat--good">
          <dt class="au-stat__label">Seleccionadas</dt>
          <dd class="au-stat__value">{{ selectedOnPage }}</dd>
          <dd class="au-stat__note">En esta página</dd>
        </div>
        <div class="au-stat">
          <dt class="au-stat__label">Con referencia de origen</dt>
          <dd class="au-stat__value">{{ linkedOnPage }}</dd>
          <dd class="au-stat__note">En esta página</dd>
        </div>
        <div class="au-stat">
          <dt class="au-stat__label">Clústeres</dt>
          <dd class="au-stat__value">{{ clustersOnPage }}</dd>
          <dd class="au-stat__note">En esta página</dd>
        </div>
      </dl>

      <section class="au-panel au-panel--padded" *ngIf="tab === 'inbox'" aria-labelledby="inbox-stories">
        <div class="advanced-card-header">
          <h2 class="au-panel__title" id="inbox-stories">Historias encontradas</h2>
          <p>Filtra las historias y revisa sus fuentes antes de continuar.</p>
        </div>
        <div class="au-toolbar advanced-filter-bar" role="search" aria-label="Search and filter stories">
          <div class="au-search">
            <app-icon name="search"></app-icon>
            <input
              class="au-input au-input--search"
              type="search"
              placeholder="Buscar historias, fuentes o temas…"
              aria-label="Search stories"
              [(ngModel)]="filters.search"
              (keyup.enter)="applyFilters()"
            />
          </div>
          <select class="au-select au-filter-select" [(ngModel)]="filters.sourceId" (ngModelChange)="applyFilters()" aria-label="Filter by source">
            <option value="">Todas las fuentes</option>
            <option *ngFor="let source of sources" [ngValue]="source.id">{{ source.name }}</option>
          </select>
          <select class="au-select au-filter-select" [(ngModel)]="filters.status" (ngModelChange)="applyFilters()" aria-label="Filter by status">
            <option value="candidate">Candidatas</option>
            <option value="discovered">Nuevas</option>
            <option value="selected">Seleccionadas</option>
            <option value="rejected">Descartadas</option>
            <option value="processed">Procesadas</option>
            <option value="">Todas</option>
          </select>
          <select class="au-select au-filter-select" [(ngModel)]="filters.sort" (ngModelChange)="applyFilters()" aria-label="Sort stories">
            <option value="score">Mayor puntuación</option>
            <option value="discovered">Más recientes</option>
          </select>
          <button class="au-btn au-btn--ghost au-btn--sm" type="button" (click)="applyFilters()" [disabled]="loading">
            <app-icon name="search"></app-icon>
            Filtrar
          </button>
        </div>

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
              <a class="au-btn au-btn--secondary au-btn--sm" routerLink="/studio/sources" [queryParams]="{ tab: 'add' }">Add source</a>
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
                    <button
                      class="au-btn au-btn--primary au-btn--sm"
                      type="button"
                      (click)="createArticle(item)"
                      [disabled]="!siteId || creating[item.id]"
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

      <section class="au-panel au-panel--padded advanced-followup" *ngIf="tab === 'inbox'" aria-labelledby="inbox-triage">
        <div class="advanced-card-header"><h2 class="au-panel__title" id="inbox-triage">Aprender del triage</h2><p>Revisa las señales que ayudan a decidir qué historias considerar.</p></div>
        <div class="advanced-grid-3">
          <div class="advanced-callout"><strong>Procedencia</strong><p>Consulta las fuentes y la fecha de publicación.</p></div>
          <div class="advanced-callout"><strong>Relevancia</strong><p>Abre una historia para ver cómo se calculó su puntuación.</p></div>
          <div class="advanced-callout"><strong>Duplicados</strong><p>Usa Clústeres para revisar referencias del mismo hecho.</p></div>
        </div>
      </section>

      <section class="au-panel au-panel--padded" *ngIf="tab === 'clusters'" aria-labelledby="inbox-clusters">
        <div class="advanced-card-header">
          <h2 class="au-panel__title" id="inbox-clusters">Clústeres y duplicados</h2>
          <p>Reúne distintas fuentes que describen un mismo hecho.</p>
        </div>
        <div class="au-toolbar advanced-filter-bar">
          <label class="au-search"><app-icon name="search"></app-icon><input class="au-input au-input--search" type="search" aria-label="Buscar clúster" placeholder="Buscar clúster…" [(ngModel)]="clusterSearch" /></label>
        </div>
        <app-empty-state
          *ngIf="visibleClusters.length === 0 && !loading"
          icon="layers"
          [title]="clusterSearch.trim() ? 'Ningún clúster coincide' : 'Todavía no hay clústeres'"
          text="Los clústeres agrupan varias referencias relacionadas con una misma historia."
        ></app-empty-state>
        <div class="au-feed advanced-grid-2" *ngIf="visibleClusters.length > 0">
          <article
            class="au-feed__item au-feed__item--interactive"
            *ngFor="let cluster of visibleClusters"
            (click)="openStory(cluster.id)" tabindex="0" role="button" (keydown.enter)="openStory(cluster.id)" (keydown.space)="$event.preventDefault(); openStory(cluster.id)"
            [attr.aria-label]="'Open story ' + cluster.headline"
          >
            <div class="au-feed__body">
              <div class="au-feed__meta">
                <span
                  class="au-badge"
                  [class.au-badge--success]="cluster.verificationState === 'high_confidence' || cluster.verificationState === 'corroborated'"
                  [class.au-badge--warning]="cluster.verificationState === 'developing' || cluster.verificationState === 'single_source'"
                  [class.au-badge--danger]="cluster.verificationState === 'disputed'"
                  [class.au-badge--neutral]="!cluster.verificationState || cluster.verificationState === 'unverified'"
                >
                  {{ cluster.verificationState || 'unverified' }}
                </span>
                <span class="au-badge au-badge--brand" *ngIf="cluster.sourceDiversity !== null && cluster.sourceDiversity !== undefined">
                  {{ cluster.sourceDiversity }} independent {{ cluster.sourceDiversity === 1 ? 'publisher' : 'publishers' }}
                </span>
                <span
                  class="au-badge"
                  *ngIf="cluster.candidateScore !== null && cluster.candidateScore !== undefined"
                  [class.au-badge--success]="cluster.candidateScore >= 0.6"
                  [class.au-badge--warning]="cluster.candidateScore >= 0.4 && cluster.candidateScore < 0.6"
                  [class.au-badge--neutral]="cluster.candidateScore < 0.4"
                  [title]="scoreComponentsExplanation(cluster)"
                >
                  relevance {{ candidatePct(cluster.candidateScore) }}
                </span>
                <span class="au-badge au-badge--outline" *ngFor="let entity of (cluster.entityCandidates || []).slice(0, 3)">
                  {{ entity }}
                </span>
                <span class="au-badge au-badge--brand" *ngIf="cluster.contentGapScore === 1">content gap</span>
                <span class="au-feed__date">{{ dateLabel(cluster.lastSeenAt) }}</span>
              </div>
              <h3 class="au-feed__title">{{ cluster.headline }}</h3>
              <p class="au-feed__desc">{{ cluster.summary }}</p>
              <div class="au-feed__meta" *ngIf="cluster.reasonSelected && cluster.reasonSelected.length > 0">
                <span class="au-feed__note">Why: {{ (cluster.reasonSelected || []).slice(0, 3).join(' · ') }}</span>
              </div>
              <div class="au-feed__meta">
                <span class="au-badge au-badge--outline" *ngFor="let member of cluster.items">{{ member.source.name }}</span>
              </div>
            </div>
          </article>
        </div>
      </section>

      <div class="au-story-drawer" *ngIf="story" role="dialog" aria-modal="true" aria-label="Story detail">
        <div class="au-story-drawer__scrim" (click)="closeStory()"></div>
        <aside class="au-story-drawer__panel">
          <header class="au-story-drawer__header">
            <div>
              <span
                class="au-badge"
                [class.au-badge--success]="story.verificationState === 'high_confidence' || story.verificationState === 'corroborated'"
                [class.au-badge--warning]="story.verificationState === 'developing' || story.verificationState === 'single_source'"
                [class.au-badge--danger]="story.verificationState === 'disputed'"
                [class.au-badge--neutral]="story.verificationState === 'unverified'"
              >
                {{ story.verificationState }}
              </span>
              <span class="au-badge au-badge--neutral">{{ story.status }}</span>
              <span class="au-badge au-badge--brand" *ngIf="story.candidateScore !== null">relevance {{ candidatePct(story.candidateScore) }}</span>
            </div>
            <button class="au-btn au-btn--ghost au-btn--sm" type="button" (click)="closeStory()" aria-label="Close story">
              <app-icon name="close"></app-icon>
            </button>
          </header>
          <div class="au-story-drawer__body">
            <h2 class="au-story-drawer__title">{{ story.headline }}</h2>
            <p class="au-story-drawer__summary">{{ story.summary }}</p>
            <div class="au-feed__actions">
              <button class="au-btn au-btn--primary au-btn--sm" type="button" (click)="generateArticle(story.id)" [disabled]="generatingStoryId === story.id">
                <app-icon name="sparkles"></app-icon>
                {{ generatingStoryId === story.id ? 'Starting…' : 'Generate article' }}
              </button>
            </div>
            <app-production-status [clusterId]="story.id"></app-production-status>

            <div class="au-feed__note" *ngIf="story.verificationDetail && story.verificationDetail.reasons && story.verificationDetail.reasons.length > 0">
              Verification: {{ (story.verificationDetail.reasons ?? []).join(', ') }}
            </div>
            <div class="au-feed__note" *ngIf="story.reasonSelected && story.reasonSelected.length > 0">
              Selected because: {{ (story.reasonSelected ?? []).slice(0, 4).join(' · ') }}
            </div>

            <section class="au-story-drawer__section" *ngIf="story.scoreComponents && story.scoreComponents.length > 0">
              <h4>Score components</h4>
              <table class="au-table au-table--compact">
                <thead>
                  <tr><th>Component</th><th>Weight</th><th>Value</th><th>Detail</th></tr>
                </thead>
                <tbody>
                  <tr *ngFor="let component of story.scoreComponents">
                    <td>{{ component.key }}</td>
                    <td>{{ component.weight }}</td>
                    <td>{{ candidatePct(component.value) }}</td>
                    <td>{{ component.detail }}</td>
                  </tr>
                </tbody>
              </table>
            </section>

            <section class="au-story-drawer__section">
              <h4>Sources ({{ story.sources.length }})</h4>
              <div class="au-story-drawer__source" *ngFor="let source of story.sources">
                <label class="au-check">
                  <input type="checkbox" [checked]="splitSelection.has(source.itemId)" (change)="toggleSplit(source.itemId)" />
                  <span>{{ source.publisher }}</span>
                </label>
                <a class="au-link au-link--sm" *ngIf="source.url" [href]="source.url" target="_blank" rel="noopener">{{ source.title }}</a>
                <span class="au-story-drawer__meta">
                  {{ dateLabel(source.discoveredAt) }}
                  <span class="au-badge au-badge--outline">trust {{ Math.round(source.trustScore * 100) }}</span>
                </span>
                <button class="au-btn au-btn--ghost au-btn--sm" type="button" (click)="muteSource(source)">Mute source</button>
              </div>
            </section>

            <section class="au-story-drawer__section" *ngIf="story.facts.length > 0">
              <h4>Fact ledger ({{ story.facts.length }})</h4>
              <div class="au-story-drawer__fact" *ngFor="let fact of story.facts">
                <div class="au-story-drawer__fact-row">
                  <span class="au-badge au-badge--outline">{{ fact.factKey }}</span>
                  <span
                    class="au-badge"
                    [class.au-badge--danger]="fact.verificationStatus === 'conflicting'"
                    [class.au-badge--success]="fact.verificationStatus === 'corroborated'"
                    [class.au-badge--neutral]="fact.verificationStatus === 'unverified'"
                  >
                    {{ fact.verificationStatus }}
                  </span>
                  <span class="au-story-drawer__meta">{{ fact.publisher }} · conf {{ Math.round(fact.confidence * 100) }}</span>
                </div>
                <p class="au-story-drawer__fact-text">{{ fact.statement }}</p>
              </div>
            </section>

            <section class="au-story-drawer__section" *ngIf="story.entities.length > 0">
              <h4>Entities</h4>
              <div class="au-story-drawer__entity" *ngFor="let entity of story.entities">
                <div class="au-story-drawer__fact-row">
                  <span class="au-badge au-badge--brand">{{ entity.type }}</span>
                  <strong>{{ entity.name }}</strong>
                  <button class="au-btn au-btn--ghost au-btn--sm" type="button" (click)="muteTopic(entity)">Mute topic</button>
                </div>
                <div class="au-story-drawer__enrichment" *ngFor="let enrichment of entity.enrichments">
                  <app-icon name="sparkles"></app-icon>
                  {{ enrichment.providerKey }} · {{ enrichment.title }}
                  <span *ngIf="enrichment.releaseDate">· {{ enrichment.releaseDate | date : 'yyyy' }}</span>
                  <span *ngIf="enrichment.data?.rating">· ★ {{ enrichment.data?.rating }}</span>
                  <span class="au-story-drawer__meta">· {{ enrichment.matchMethod }} · conf {{ Math.round(enrichment.confidence * 100) }}</span>
                </div>
              </div>
            </section>

            <section class="au-story-drawer__section" *ngIf="story.relatedContent.length > 0">
              <h4>Related existing site content</h4>
              <ul class="au-list">
                <li *ngFor="let related of story.relatedContent">
                  {{ related.title }} <span class="au-story-drawer__meta">· {{ candidatePct(related.similarity) }} similar</span>
                </li>
              </ul>
            </section>
          </div>

          <footer class="au-story-drawer__actions">
            <button class="au-btn au-btn--primary au-btn--sm" type="button" (click)="createArticleFromStory()" [disabled]="!siteId || busy">Create article</button>
            <button class="au-btn au-btn--ghost au-btn--sm" type="button" (click)="saveStory()" [disabled]="busy">Save</button>
            <button class="au-btn au-btn--ghost au-btn--sm" type="button" (click)="rejectStory()" [disabled]="busy">Reject</button>
            <span class="au-story-drawer__spacer"></span>
            <select class="au-select au-filter-select" [(ngModel)]="mergeTargetId" aria-label="Merge into cluster">
              <option [ngValue]="null" disabled>Merge into…</option>
              <option *ngFor="let other of clusters" [ngValue]="other.id" [hidden]="other.id === story.id">{{ other.headline?.slice(0, 60) }}</option>
            </select>
            <button class="au-btn au-btn--ghost au-btn--sm" type="button" (click)="mergeStory()" [disabled]="!mergeTargetId || busy">Merge</button>
            <button class="au-btn au-btn--ghost au-btn--sm" type="button" (click)="splitStory()" [disabled]="splitSelection.size === 0 || busy">
              Split {{ splitSelection.size || '' }}
            </button>
          </footer>
        </aside>
      </div>
    </section>
  `,
})
export class InboxPageComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly api = inject(StudioApiService);
  private readonly appContext = inject(AppContextService);
  private readonly toast = inject(ToastService);
  private readonly production = inject(ProductionApiService);
  generatingStoryId: string | null = null;

  tab: InboxTab = 'inbox';
  clusterSearch = '';

  get visibleClusters(): StudioStoryCluster[] {
    const term = this.clusterSearch.trim().toLowerCase();
    return term ? this.clusters.filter((cluster) => `${cluster.headline} ${cluster.summary}`.toLowerCase().includes(term)) : this.clusters;
  }
  items: StudioSourceItem[] = [];
  clusters: StudioStoryCluster[] = [];
  sources: StudioSource[] = [];
  mutes: StudioMuteRule[] = [];
  page = 1;
  pageSize = 20;
  total = 0;
  loading = false;
  busy = false;
  creating: Record<string, boolean> = {};
  noticeFor: Record<string, string> = {};
  story: StudioStoryDetail | null = null;
  splitSelection = new Set<string>();
  mergeTargetId: string | null = null;
  /** Articles are always created on the top bar active site. */
  readonly siteId: string | null = inject(AppContextService).activeSite()?.id ?? null;
  Math = Math;
  filters = {
    sourceId: '',
    status: 'candidate' as '' | SourceItemStatus,
    search: '',
    sort: 'score' as 'score' | 'discovered',
  };
  private refreshSubscription: Subscription | null = null;

  get selectedOnPage(): number { return this.items.filter((item) => item.processingStatus === 'selected').length; }
  get linkedOnPage(): number { return this.items.filter((item) => item.canonicalUrl || item.sourceUrl).length; }
  get clustersOnPage(): number { return new Set(this.items.flatMap((item) => item.clusterId ? [item.clusterId] : [])).size; }

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.total / this.pageSize));
  }

  ngOnInit(): void {
    this.api.listSources(1, 100).subscribe({
      next: (response) => {
        this.sources = response.items;
      },
    });
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      this.setTab(params.get('tab') === 'clusters' ? 'clusters' : 'inbox');
    });
    this.loadMutes();
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

  createArticle(item: StudioSourceItem): void {
    const siteId = this.siteId;
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

  candidatePct(score: number | null | undefined): string {
    return score === null || score === undefined ? '—' : `${Math.round(score * 100)}`;
  }

  scoreComponentsExplanation(cluster: StudioStoryCluster): string {
    const components = cluster.scoreComponents ?? [];
    return components
      .map((component) => `${component.key}: ${Math.round(component.value * 100)} (${component.detail})`)
      .join('\n');
  }

  loadMutes(): void {
    this.api.listMutes().subscribe({
      next: (response) => {
        this.mutes = response.items;
      },
      error: () => {
        this.mutes = [];
      },
    });
  }

  // ── Story detail drawer ────────────────────────────────────────────────

  /** Starts (or returns the active) production job for the story; app-production-status follows it and links to the review. */
  generateArticle(clusterId: string): void {
    this.generatingStoryId = clusterId;
    this.production.start({ kind: 'cluster', clusterId }).subscribe({
      next: () => {
        this.generatingStoryId = null;
        this.toast.success('Writing started. The draft appears in the Review queue.');
      },
      error: (error) => {
        this.generatingStoryId = null;
        this.toast.error(error?.error?.message ?? 'Could not start the article');
      },
    });
  }

  openStory(clusterId: string): void {
    this.story = null;
    this.splitSelection.clear();
    this.mergeTargetId = null;
    this.api.getStoryDetail(clusterId).subscribe({
      next: (detail) => {
        this.story = detail;
      },
      error: () => this.toast.error('Could not load the story detail.'),
    });
  }

  closeStory(): void {
    this.story = null;
    this.splitSelection.clear();
  }

  toggleSplit(itemId: string): void {
    if (this.splitSelection.has(itemId)) {
      this.splitSelection.delete(itemId);
    } else {
      this.splitSelection.add(itemId);
    }
  }

  saveStory(): void {
    if (!this.story || this.busy) {
      return;
    }
    this.busy = true;
    this.api.setClusterStatus(this.story.id, 'selected').subscribe({
      next: () => {
        this.busy = false;
        this.toast.success('Story saved for editorial.');
        this.load(true);
        this.closeStory();
      },
      error: () => {
        this.busy = false;
        this.toast.error('The story could not be saved.');
      },
    });
  }

  rejectStory(): void {
    if (!this.story || this.busy) {
      return;
    }
    this.busy = true;
    this.api.setClusterStatus(this.story.id, 'rejected').subscribe({
      next: () => {
        this.busy = false;
        this.toast.success('Story rejected.');
        this.load(true);
        this.closeStory();
      },
      error: () => {
        this.busy = false;
        this.toast.error('The story could not be rejected.');
      },
    });
  }

  createArticleFromStory(): void {
    const siteId = this.siteId;
    if (!this.story || !siteId || this.busy) {
      return;
    }
    const primary = this.story.sources[0];
    if (!primary) {
      this.toast.error('The story has no sources.');
      return;
    }
    this.busy = true;
    this.api
      .createProjectFromSourceItem({ siteId, sourceItemId: primary.itemId, goal: 'news_article' })
      .subscribe({
        next: (result) => {
          this.busy = false;
          this.toast.success(result.kind === 'update' ? 'Existing article updated.' : 'Article created. Generation started.');
          this.closeStory();
        },
        error: () => {
          this.busy = false;
          this.toast.error('The article could not be created.');
        },
      });
  }

  mergeStory(): void {
    if (!this.story || !this.mergeTargetId || this.busy) {
      return;
    }
    this.busy = true;
    this.api.mergeClusters(this.story.id, this.mergeTargetId).subscribe({
      next: (result) => {
        this.busy = false;
        this.toast.success(`Merged ${result.movedItems} sources into the target cluster.`);
        this.load(true);
        this.closeStory();
      },
      error: () => {
        this.busy = false;
        this.toast.error('The clusters could not be merged.');
      },
    });
  }

  splitStory(): void {
    if (!this.story || this.splitSelection.size === 0 || this.busy) {
      return;
    }
    this.busy = true;
    this.api.splitCluster(this.story.id, Array.from(this.splitSelection)).subscribe({
      next: () => {
        this.busy = false;
        this.toast.success('Selected sources moved to a new cluster.');
        this.load(true);
        this.closeStory();
      },
      error: () => {
        this.busy = false;
        this.toast.error('The cluster could not be split.');
      },
    });
  }

  muteTopic(entity: { type: string; name: string }): void {
    const value = entity.name;
    if (!value || this.busy) {
      return;
    }
    this.busy = true;
    this.api.createMute('topic', value).subscribe({
      next: () => {
        this.busy = false;
        this.loadMutes();
        this.toast.success(`Muted topic "${value}".`);
        this.load(true);
      },
      error: () => {
        this.busy = false;
        this.toast.error('The topic could not be muted.');
      },
    });
  }

  muteSource(source: { publisher: string; domain: string | null }): void {
    const value = source.domain ?? source.publisher;
    if (!value || this.busy) {
      return;
    }
    this.busy = true;
    this.api.createMute('source', value).subscribe({
      next: () => {
        this.busy = false;
        this.loadMutes();
        this.toast.success(`Muted source "${value}".`);
        this.load(true);
      },
      error: () => {
        this.busy = false;
        this.toast.error('The source could not be muted.');
      },
    });
  }
}
