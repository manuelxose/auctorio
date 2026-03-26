import { CommonModule, DatePipe, PercentPipe } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import type {
  PublicationListItem,
  ReviewGateStage,
  StudioProjectSummary,
  StudioSiteSummary,
} from '../models/studio.models';
import { StudioApiService } from '../services/studio-api.service';
import { formatApiError } from '../utils/api-error';
import {
  buildQaScore,
  reviewStageLabel,
  reviewStageTone,
} from '../utils/review-gate';

type AnalyticsView = 'contentPerformance' | 'seoMetrics';
type TagTone = 'muted' | 'accent' | 'warning' | 'success' | 'danger';
type AnalyticsRow = {
  label: string;
  detail: string;
  count: number;
  tone: TagTone;
};
type DestinationAnalyticsRow = {
  id: string;
  name: string;
  type: string;
  projectCount: number;
  liveCount: number;
  releaseReadyCount: number;
  blockedCount: number;
  tone: TagTone;
};
type PublicationSignal = {
  title: string;
  detail: string;
  badge: string;
  tone: TagTone;
  updatedAt: string;
};

@Component({
  selector: 'app-analytics-page',
  standalone: true,
  imports: [CommonModule, RouterLink, DatePipe, PercentPipe],
  template: `
    <section class="console-page">
      <header class="console-page__header">
        <div class="console-page__copy">
          <p class="console-kicker">Analytics</p>
          <h1 class="console-page__title">{{ viewTitle }}</h1>
          <p class="console-page__intro">{{ viewDescription }}</p>
        </div>

        <div class="console-page__actions">
          <span class="console-tag console-tag--accent">Live data</span>
          <a class="console-button console-button--secondary" routerLink="/studio/publishing/history">
            Open history
          </a>
          <button type="button" class="console-button" (click)="loadData()">
            Refresh analytics
          </button>
        </div>
      </header>

      <div class="console-banner console-banner--error" *ngIf="error">{{ error }}</div>

      <div class="console-stat-grid" *ngIf="!loading">
        <article class="console-stat-card">
          <p class="console-stat-card__label">Destinations</p>
          <strong class="console-stat-card__value">{{ sites.length }}</strong>
          <span class="console-stat-card__detail">Superficies de publicacion conectadas al workspace.</span>
        </article>

        <article class="console-stat-card">
          <p class="console-stat-card__label">Projects</p>
          <strong class="console-stat-card__value">{{ projects.length }}</strong>
          <span class="console-stat-card__detail">Piezas activas observadas por esta vista.</span>
        </article>

        <article class="console-stat-card">
          <p class="console-stat-card__label">Publish success rate</p>
          <strong class="console-stat-card__value">{{ successRate | percent: '1.0-0' }}</strong>
          <span class="console-stat-card__detail">Ratio de publicaciones completadas sobre jobs ya resueltos en runtime.</span>
        </article>

        <article class="console-stat-card">
          <p class="console-stat-card__label">Editorial ready</p>
          <strong class="console-stat-card__value">{{ reviewReadyCount }}</strong>
          <span class="console-stat-card__detail">Piezas ya listas para aprobacion o release sin blockers editoriales abiertos.</span>
        </article>
      </div>

      <div class="console-workspace">
        <div class="console-workspace__main">
          <section class="console-surface">
            <div class="console-surface__head">
              <div>
                <p class="console-surface__eyebrow">{{ primaryBlockEyebrow }}</p>
                <h2 class="console-surface__title">{{ primaryBlockTitle }}</h2>
              </div>
            </div>

            <div class="console-list-grid">
              <article class="console-list-card" *ngFor="let row of statusRows">
                <div>
                  <strong>{{ row.label }}</strong>
                  <p>{{ row.detail }}</p>
                </div>
                <span
                  class="console-tag"
                  [class.console-tag--accent]="row.tone === 'accent'"
                  [class.console-tag--warning]="row.tone === 'warning'"
                  [class.console-tag--success]="row.tone === 'success'"
                  [class.console-tag--danger]="row.tone === 'danger'"
                  [class.console-tag--muted]="row.tone === 'muted'"
                >
                  {{ row.count }}
                </span>
              </article>
            </div>
          </section>

          <section class="console-surface">
            <div class="console-surface__head">
              <div>
                <p class="console-surface__eyebrow">Destination mix</p>
                <h2 class="console-surface__title">Where content is flowing</h2>
              </div>
            </div>

            <div class="console-list-grid" *ngIf="destinationRows.length; else noDestinations">
              <article class="console-list-card" *ngFor="let site of destinationRows">
                <div>
                  <strong>{{ site.name }}</strong>
                  <p>{{ site.type }} · {{ site.releaseReadyCount }} release-ready · {{ site.blockedCount }} blocked</p>
                </div>
                <span
                  class="console-tag"
                  [class.console-tag--accent]="site.tone === 'accent'"
                  [class.console-tag--warning]="site.tone === 'warning'"
                  [class.console-tag--success]="site.tone === 'success'"
                  [class.console-tag--danger]="site.tone === 'danger'"
                  [class.console-tag--muted]="site.tone === 'muted'"
                >
                  {{ site.liveCount }} live
                </span>
              </article>
            </div>
          </section>
        </div>

        <aside class="console-workspace__aside">
          <section class="console-surface">
            <div class="console-surface__head">
              <div>
                <p class="console-surface__eyebrow">Recent activity</p>
                <h2 class="console-surface__title">Latest publishing signals</h2>
              </div>
            </div>

            <div class="console-feed" *ngIf="recentSignals.length; else noActivity">
              <article class="console-feed__item" *ngFor="let item of recentSignals">
                <div>
                  <strong>{{ item.title }}</strong>
                  <p>{{ item.detail }}</p>
                </div>
                <div class="console-calendar-day__meta">
                  <span
                    class="console-tag"
                    [class.console-tag--accent]="item.tone === 'accent'"
                    [class.console-tag--warning]="item.tone === 'warning'"
                    [class.console-tag--success]="item.tone === 'success'"
                    [class.console-tag--danger]="item.tone === 'danger'"
                    [class.console-tag--muted]="item.tone === 'muted'"
                  >
                    {{ item.badge }}
                  </span>
                  <span>{{ item.updatedAt | date: 'short' }}</span>
                </div>
              </article>
            </div>
          </section>

          <section class="console-surface">
            <div class="console-surface__head">
              <div>
                <p class="console-surface__eyebrow">Interpretation</p>
                <h2 class="console-surface__title">What this view tells you</h2>
              </div>
            </div>

            <ul class="console-note-list">
              <li class="console-note-list__item" *ngFor="let note of notes">
                {{ note }}
              </li>
            </ul>
          </section>
        </aside>
      </div>

      <ng-template #noDestinations>
        <div class="console-empty-compact">
          <p>No destination analytics yet.</p>
        </div>
      </ng-template>

      <ng-template #noActivity>
        <div class="console-empty-compact">
          <p>No publication activity yet.</p>
        </div>
      </ng-template>
    </section>
  `,
})
export class AnalyticsPageComponent implements OnInit {
  private readonly api = inject(StudioApiService);
  private readonly route = inject(ActivatedRoute);

  sites: StudioSiteSummary[] = [];
  projects: StudioProjectSummary[] = [];
  publications: PublicationListItem[] = [];
  destinationRows: DestinationAnalyticsRow[] = [];
  recentSignals: PublicationSignal[] = [];
  statusRows: AnalyticsRow[] = [];
  notes: string[] = [];
  loading = true;
  error = '';
  successRate = 0;
  reviewReadyCount = 0;

  view: AnalyticsView = 'contentPerformance';

  get viewTitle(): string {
    return this.view === 'seoMetrics' ? 'SEO Metrics' : 'Content Performance';
  }

  get viewDescription(): string {
    return this.view === 'seoMetrics'
      ? 'Calidad SEO del flujo editorial: metadata, readiness y oportunidades antes de publicar.'
      : 'Rendimiento editorial del workspace: throughput, publish outcomes y mezcla de destinos.';
  }

  get primaryBlockEyebrow(): string {
    return this.view === 'seoMetrics' ? 'SEO package' : 'Operational gate';
  }

  get primaryBlockTitle(): string {
    return this.view === 'seoMetrics' ? 'Optimization and release signals' : 'Gate distribution';
  }

  ngOnInit(): void {
    this.view =
      (this.route.snapshot.data['analyticsView'] as AnalyticsView | undefined) ??
      'contentPerformance';
    this.loadData();
  }

  loadData(): void {
    this.loading = true;
    this.error = '';

    forkJoin({
      sites: this.api.listSites(1, 100),
      projects: this.api.listProjects({ page: 1, pageSize: 100 }),
      publications: this.api.listPublications(1, 100),
    }).subscribe({
      next: ({ sites, projects, publications }) => {
        this.sites = sites.items;
        this.projects = projects.items;
        this.publications = [...publications.items].sort(
          (left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt),
        );
        this.destinationRows = this.buildDestinationRows();
        this.recentSignals = this.buildRecentSignals();

        const resolvedPublications = this.publications.filter((item) =>
          ['published', 'failed', 'canceled'].includes(item.status),
        );
        this.successRate = resolvedPublications.length
          ? resolvedPublications.filter((item) => item.status === 'published').length / resolvedPublications.length
          : 0;
        this.reviewReadyCount = this.projects.filter((project) =>
          project.reviewGate.approvalReady || project.reviewGate.publishReady,
        ).length;
        this.statusRows = this.buildStatusRows();

        this.notes = this.buildNotes();
        this.loading = false;
      },
      error: (error) => {
        this.error = formatApiError(error);
        this.loading = false;
      },
    });
  }

  private buildStatusRows(): AnalyticsRow[] {
    if (this.view === 'seoMetrics') {
      return [
        {
          label: 'SEO package complete',
          detail: 'Latest versions that already carry metadata, hero asset and a strong QA baseline.',
          count: this.projects.filter((project) => this.hasCompleteSeoPackage(project)).length,
          tone: 'success',
        },
        {
          label: 'Metadata missing',
          detail: 'Generated pieces whose latest version still lacks SEO title or description.',
          count: this.projects.filter((project) => this.hasOutput(project) && !this.hasSeoMetadata(project)).length,
          tone: 'warning',
        },
        {
          label: 'Hero missing',
          detail: 'Pieces with output but without a featured asset yet attached to the release package.',
          count: this.projects.filter((project) => this.hasOutput(project) && !project.latestVersion?.hasAsset).length,
          tone: 'danger',
        },
        {
          label: 'QA blocked',
          detail: 'Pieces whose review gate is still blocked by structure, metadata, image or publish failures.',
          count: this.projects.filter((project) => this.isBlocked(project)).length,
          tone: 'danger',
        },
        {
          label: 'Warning watchlist',
          detail: 'Pieces with warnings but no blockers, where the SEO package still deserves human attention.',
          count: this.projects.filter((project) => this.hasWarningPressure(project)).length,
          tone: 'warning',
        },
        {
          label: 'Approval ready',
          detail: 'Pieces already safe enough to move into final editorial decision.',
          count: this.projects.filter((project) => project.reviewGate.approvalReady).length,
          tone: 'accent',
        },
        {
          label: 'Live baseline',
          detail: 'Published pieces whose current package still meets the latest SEO minimums.',
          count: this.projects.filter((project) =>
            project.reviewGate.stage === 'published' && this.hasCompleteSeoPackage(project),
          ).length,
          tone: 'success',
        },
      ];
    }

    const throughputStages: Array<{ stage: ReviewGateStage; detail: string }> = [
      {
        stage: 'awaiting_generation',
        detail: 'Briefs still waiting for a first usable draft or structured editorial output.',
      },
      {
        stage: 'needs_review',
        detail: 'AI output exists, but the editorial loop still needs a human pass.',
      },
      {
        stage: 'qa_blocked',
        detail: 'Blockers in QA, metadata or hero package still stop release.',
      },
      {
        stage: 'ready_to_approve',
        detail: 'Pieces with QA cleared and enough package quality to enter final decision.',
      },
      {
        stage: 'approved',
        detail: 'Approved pieces that can move into release orchestration.',
      },
      {
        stage: 'publish_queued',
        detail: 'Pieces already flowing through runtime publishing or draft sync.',
      },
      {
        stage: 'published',
        detail: 'Content already visible in its destination.',
      },
    ];

    const rows = throughputStages.map((item) => ({
      label: reviewStageLabel(item.stage),
      detail: item.detail,
      count: this.projects.filter((project) => project.reviewGate.stage === item.stage).length,
      tone: reviewStageTone(item.stage),
    }));

    return [
      ...rows,
      {
        label: 'Retry publish',
        detail: 'Release incidents that need supervised retry instead of pretending they are healthy queued items.',
        count: this.projects.filter((project) => project.reviewGate.stage === 'publish_failed').length,
        tone: 'danger',
      },
    ];
  }

  private buildDestinationRows(): DestinationAnalyticsRow[] {
    return this.sites
      .map((site) => {
        const siteProjects = this.projects.filter((project) => project.siteId === site.id);
        const liveCount = siteProjects.filter((project) => project.reviewGate.stage === 'published').length;
        const releaseReadyCount = siteProjects.filter((project) =>
          project.reviewGate.publishReady &&
          ['approved', 'publish_queued'].includes(project.reviewGate.stage),
        ).length;
        const blockedCount = siteProjects.filter((project) => this.isBlocked(project)).length;

        const tone: TagTone =
          blockedCount > 0 ? 'danger' : releaseReadyCount > 0 ? 'accent' : liveCount > 0 ? 'success' : 'muted';

        return {
          id: site.id,
          name: site.name,
          type: site.type,
          projectCount: siteProjects.length,
          liveCount,
          releaseReadyCount,
          blockedCount,
          tone,
        };
      })
      .sort((left, right) => {
        const priorityDelta =
          right.releaseReadyCount + right.liveCount * 2 - right.blockedCount -
          (left.releaseReadyCount + left.liveCount * 2 - left.blockedCount);
        if (priorityDelta !== 0) {
          return priorityDelta;
        }

        return right.projectCount - left.projectCount;
      })
      .slice(0, 6);
  }

  private buildRecentSignals(): PublicationSignal[] {
    return this.publications.slice(0, 6).map((item) => ({
      title: item.project.title,
      detail: `${item.site.name} · ${item.action} · ${item.error || this.publicationNarrative(item)}`,
      badge: this.publicationBadge(item),
      tone: this.publicationTone(item.status),
      updatedAt: item.updatedAt,
    }));
  }

  private buildNotes(): string[] {
    if (this.view === 'seoMetrics') {
      return [
        'Esta vista usa el mismo review gate y la misma version viva que ya gobiernan QA, review y publish; no es una taxonomia separada.',
        'Todavia faltan scorecards SEO por pieza, topic planning y clustering editorial para hablar de performance organica real.',
        'Publishing history y destinations siguen completando la lectura runtime del riesgo de release.',
      ];
    }

    return [
      'La distribucion ya no usa project.status como verdad principal; agrupa por el mismo review gate que usa el cockpit operativo.',
      'Release lane y runtime failures siguen leyendo publication jobs reales, no una simulacion analitica separada.',
      'El siguiente salto es incorporar performance real por contenido y no solo trazas operativas del workflow.',
    ];
  }

  private hasOutput(project: StudioProjectSummary): boolean {
    return Boolean(project.latestVersion);
  }

  private hasSeoMetadata(project: StudioProjectSummary): boolean {
    return Boolean(project.latestVersion?.seoTitle && project.latestVersion?.seoDescription);
  }

  private hasCompleteSeoPackage(project: StudioProjectSummary): boolean {
    const latestVersion = project.latestVersion;
    if (!latestVersion) {
      return false;
    }

    return Boolean(
      latestVersion.hasAsset &&
      latestVersion.seoTitle &&
      latestVersion.seoDescription &&
      buildQaScore(latestVersion) >= 90,
    );
  }

  private hasWarningPressure(project: StudioProjectSummary): boolean {
    return project.reviewGate.warningCount > 0 && project.reviewGate.blockerCount === 0;
  }

  private isBlocked(project: StudioProjectSummary): boolean {
    return project.reviewGate.blockerCount > 0 || project.reviewGate.stage === 'publish_failed';
  }

  private publicationBadge(item: PublicationListItem): string {
    if (item.status === 'failed') {
      return 'Runtime failure';
    }

    if (item.status === 'published') {
      return 'Published';
    }

    if (item.status === 'draft_synced') {
      return 'Draft synced';
    }

    if (item.status === 'processing') {
      return 'Processing';
    }

    if (item.status === 'queued') {
      return 'Queued';
    }

    return 'Canceled';
  }

  private publicationNarrative(item: PublicationListItem): string {
    if (item.status === 'published') {
      return 'Live signal confirmed';
    }

    if (item.status === 'draft_synced') {
      return 'Draft is already synced downstream';
    }

    if (item.status === 'processing') {
      return 'Runtime is executing the current release step';
    }

    if (item.status === 'queued') {
      return 'Waiting for runtime execution';
    }

    if (item.status === 'failed') {
      return 'Runtime reported a publishing failure';
    }

    return 'Execution was canceled before completion';
  }

  private publicationTone(status: PublicationListItem['status']): TagTone {
    switch (status) {
      case 'published':
        return 'success';
      case 'queued':
      case 'processing':
      case 'draft_synced':
        return 'accent';
      case 'failed':
        return 'danger';
      case 'canceled':
        return 'warning';
      default:
        return 'muted';
    }
  }
}
