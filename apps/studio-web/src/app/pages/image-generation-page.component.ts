import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import type { ReviewGateStage, StudioProjectSummary, StudioSiteSummary } from '../models/studio.models';
import { StudioApiService } from '../services/studio-api.service';
import { formatApiError } from '../utils/api-error';
import {
  buildQaScore,
  qaScoreLabel,
  reviewStageLabel as formatReviewStageLabel,
  reviewStageTone as getReviewStageTone,
} from '../utils/review-gate';

type ImageWorkspaceView = 'assets' | 'generation';
type AssetFocus = 'all' | 'releaseRisk' | 'missing' | 'ready' | 'live';
type TagTone = 'muted' | 'accent' | 'warning' | 'success' | 'danger';

type ViewConfig = {
  kicker: string;
  title: string;
  intro: string;
  primaryActionLabel: string;
};

const VIEW_CONFIGS: Record<ImageWorkspaceView, ViewConfig> = {
  assets: {
    kicker: 'Assets',
    title: 'Images',
    intro: 'Galeria operativa de hero images por pieza editorial, con foco en cobertura y readiness para publish.',
    primaryActionLabel: 'Generate image',
  },
  generation: {
    kicker: 'AI Generation',
    title: 'Image Generation',
    intro: 'Consola de generación visual: revisa cobertura, relanza candidatos y conecta cada hero con su artículo.',
    primaryActionLabel: 'Run generation',
  },
};

@Component({
  selector: 'app-image-generation-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  template: `
    <section class="console-page">
      <header class="console-page__header">
        <div class="console-page__copy">
          <p class="console-kicker">{{ viewConfig.kicker }}</p>
          <h1 class="console-page__title">{{ viewConfig.title }}</h1>
          <p class="console-page__intro">{{ viewConfig.intro }}</p>
        </div>

        <div class="console-page__actions">
          <a class="console-button console-button--secondary" routerLink="/studio/editorial/articles">
            Open articles
          </a>
          <button type="button" class="console-button" (click)="loadData()">Refresh</button>
        </div>
      </header>

      <div class="console-banner console-banner--success" *ngIf="notice">{{ notice }}</div>
      <div class="console-banner console-banner--error" *ngIf="error">{{ error }}</div>

      <div class="console-stat-grid" *ngIf="!loading">
        <article class="console-stat-card">
          <p class="console-stat-card__label">Ready heroes</p>
          <strong class="console-stat-card__value">{{ readyCount }}</strong>
          <span class="console-stat-card__detail">Piezas cuya version activa ya tiene una imagen disponible.</span>
        </article>

        <article class="console-stat-card">
          <p class="console-stat-card__label">Missing coverage</p>
          <strong class="console-stat-card__value">{{ missingCount }}</strong>
          <span class="console-stat-card__detail">Versiones listas para texto pero aun sin hero visual.</span>
        </article>

        <article class="console-stat-card">
          <p class="console-stat-card__label">Blocks release</p>
          <strong class="console-stat-card__value">{{ releaseRiskCount }}</strong>
          <span class="console-stat-card__detail">Piezas cuyo hero ausente sigue impidiendo QA final, approval o publish.</span>
        </article>

        <article class="console-stat-card">
          <p class="console-stat-card__label">Live with hero</p>
          <strong class="console-stat-card__value">{{ liveCount }}</strong>
          <span class="console-stat-card__detail">Contenido publicado cuya version activa mantiene un hero disponible.</span>
        </article>
      </div>

      <div class="console-workspace" *ngIf="!loading; else loadingState">
        <div class="console-workspace__main">
          <section class="console-surface">
            <div class="console-surface__head">
              <div>
                <p class="console-surface__eyebrow">Gallery</p>
                <h2 class="console-surface__title">Hero image workspace</h2>
              </div>
            </div>

            <form class="console-toolbar console-toolbar--stretch" [formGroup]="filterForm">
              <label class="console-search console-search--wide">
                <span>Search</span>
                <input
                  type="text"
                  formControlName="query"
                  placeholder="Project, blocker, gate, version title or destination"
                  (input)="applyFilters()"
                />
              </label>

              <label class="console-select">
                <span>Destination</span>
                <select formControlName="siteId" (change)="applyFilters()">
                  <option value="">All destinations</option>
                  <option *ngFor="let site of sites" [value]="site.id">{{ site.name }}</option>
                </select>
              </label>

              <label class="console-select">
                <span>Focus</span>
                <select formControlName="focus" (change)="applyFilters()">
                  <option value="all">All assets</option>
                  <option value="releaseRisk">Blocks release</option>
                  <option value="missing">Missing</option>
                  <option value="ready">Ready</option>
                  <option value="live">Live</option>
                </select>
              </label>
            </form>

            <div class="console-image-grid" *ngIf="filteredProjects.length; else emptyImages">
              <article class="console-image-card" *ngFor="let project of filteredProjects">
                <div class="console-image-card__preview" *ngIf="project.latestVersion?.assetUrl; else missingPreview">
                  <img [src]="project.latestVersion?.assetUrl || ''" alt="Generated asset preview" />
                </div>

                <ng-template #missingPreview>
                  <div class="console-image-card__placeholder">
                    <strong>No image yet</strong>
                    <p>Launch generation from the active version.</p>
                  </div>
                </ng-template>

                <div class="console-version-card__head">
                  <div>
                    <strong>{{ project.title }}</strong>
                    <p>{{ project.site.name }} · {{ project.goal }} · {{ assetNarrative(project) }}</p>
                  </div>
                  <div class="console-version-card__tags">
                    <span
                      class="console-tag"
                      [class.console-tag--success]="assetTone(project) === 'success'"
                      [class.console-tag--accent]="assetTone(project) === 'accent'"
                      [class.console-tag--warning]="assetTone(project) === 'warning'"
                      [class.console-tag--danger]="assetTone(project) === 'danger'"
                      [class.console-tag--muted]="assetTone(project) === 'muted'"
                    >
                      {{ assetLabel(project) }}
                    </span>
                    <span
                      class="console-tag"
                      [class.console-tag--success]="reviewStageTone(project.reviewGate.stage) === 'success'"
                      [class.console-tag--accent]="reviewStageTone(project.reviewGate.stage) === 'accent'"
                      [class.console-tag--warning]="reviewStageTone(project.reviewGate.stage) === 'warning'"
                      [class.console-tag--danger]="reviewStageTone(project.reviewGate.stage) === 'danger'"
                      [class.console-tag--muted]="reviewStageTone(project.reviewGate.stage) === 'muted'"
                    >
                      {{ reviewStageLabel(project.reviewGate.stage) }}
                    </span>
                  </div>
                </div>

                <p class="console-version-card__body">
                  {{ project.latestVersion?.title || 'No current version title' }}
                </p>

                <div class="console-meta-grid">
                  <article class="console-meta-card">
                    <span>Prompt</span>
                    <strong>{{ project.latestVersion?.promptPresetName || project.latestVersion?.promptVersionLabel || 'Seed fallback' }}</strong>
                  </article>
                  <article class="console-meta-card">
                    <span>Gate / QA</span>
                    <strong>{{ qaSummary(project) }}</strong>
                  </article>
                  <article class="console-meta-card">
                    <span>Version</span>
                    <strong>V{{ project.latestVersion?.versionNumber || 0 }}</strong>
                  </article>
                </div>

                <div class="console-inline-actions">
                  <button
                    type="button"
                    class="console-button"
                    (click)="generate(project)"
                    [disabled]="generatingProjectId === project.id || !project.latestVersion"
                  >
                    {{ generatingProjectId === project.id ? 'Running...' : viewConfig.primaryActionLabel }}
                  </button>
                  <a
                    *ngIf="project.latestVersion?.promptPresetVersionId"
                    class="console-button console-button--secondary"
                    [routerLink]="['/studio/ai/prompts']"
                    [queryParams]="{ preset: project.latestVersion?.promptPresetKey }"
                  >
                    Prompt
                  </a>
                  <a class="console-button console-button--secondary" [routerLink]="detailLink(project)">
                    {{ project.latestVersion ? 'Open article' : 'Open brief' }}
                  </a>
                </div>
              </article>
            </div>
          </section>
        </div>

        <aside class="console-workspace__aside">
          <section class="console-surface">
            <div class="console-surface__head">
              <div>
                <p class="console-surface__eyebrow">Queue</p>
                <h2 class="console-surface__title">Most urgent candidates</h2>
              </div>
            </div>

            <div class="console-action-stack" *ngIf="generationCandidates.length; else emptyQueue">
              <a class="console-action-card" *ngFor="let project of generationCandidates" [routerLink]="detailLink(project)">
                <div>
                  <strong>{{ project.title }}</strong>
                  <span>{{ project.site.name }} · {{ project.reviewGate.primaryConcern }}</span>
                </div>
                <span
                  class="console-tag"
                  [class.console-tag--danger]="needsHeroForRelease(project)"
                  [class.console-tag--warning]="!needsHeroForRelease(project)"
                >
                  {{ needsHeroForRelease(project) ? 'Blocks release' : 'Needs image' }}
                </span>
              </a>
            </div>
          </section>

          <section class="console-surface">
            <div class="console-surface__head">
              <div>
                <p class="console-surface__eyebrow">Guidance</p>
                <h2 class="console-surface__title">Generation rules</h2>
              </div>
            </div>

            <ul class="console-note-list">
              <li class="console-note-list__item">
                La generación se ejecuta sobre la version activa del proyecto, no sobre briefs huérfanos.
              </li>
              <li class="console-note-list__item">
                El hero deja de ser un adorno: cuando falta, el mismo review gate lo trata como blocker real antes de publish.
              </li>
              <li class="console-note-list__item">
                Esta superficie prioriza primero las piezas cuyo hueco visual ya pone en riesgo approval o release, no solo las que no tienen imagen.
              </li>
            </ul>
          </section>
        </aside>
      </div>

      <ng-template #loadingState>
        <section class="console-empty-state">
          <div>
            <p class="console-kicker">{{ viewConfig.kicker }}</p>
            <h2>Loading image workspace</h2>
            <p>Estamos reuniendo versiones activas, cobertura visual y candidatos para nueva generación.</p>
          </div>
        </section>
      </ng-template>

      <ng-template #emptyImages>
        <div class="console-empty-compact">
          <p>No image records match the current filters.</p>
        </div>
      </ng-template>

      <ng-template #emptyQueue>
        <div class="console-empty-compact">
          <p>No urgent image generation candidates right now.</p>
        </div>
      </ng-template>
    </section>
  `,
})
export class ImageGenerationPageComponent implements OnInit {
  private readonly api = inject(StudioApiService);
  private readonly route = inject(ActivatedRoute);

  readonly filterForm = new FormGroup({
    query: new FormControl('', { nonNullable: true }),
    siteId: new FormControl('', { nonNullable: true }),
    focus: new FormControl<AssetFocus>('all', { nonNullable: true }),
  });

  view: ImageWorkspaceView = 'assets';
  sites: StudioSiteSummary[] = [];
  projects: StudioProjectSummary[] = [];
  filteredProjects: StudioProjectSummary[] = [];
  generationCandidates: StudioProjectSummary[] = [];
  readyCount = 0;
  missingCount = 0;
  releaseRiskCount = 0;
  liveCount = 0;
  generatingProjectId = '';
  loading = true;
  error = '';
  notice = '';

  get viewConfig(): ViewConfig {
    return VIEW_CONFIGS[this.view];
  }

  ngOnInit(): void {
    this.view =
      (this.route.snapshot.data['imageWorkspaceView'] as ImageWorkspaceView | undefined) ?? 'assets';
    this.loadData();
  }

  loadData(): void {
    this.loading = true;
    this.error = '';

    this.api.listSites(1, 100).subscribe({
      next: (sites) => {
        this.sites = sites.items;
        this.api.listProjects({ page: 1, pageSize: 100 }).subscribe({
          next: (projects) => {
            this.projects = projects.items
              .filter((project) => Boolean(project.latestVersion))
              .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
            this.applyFilters();
            this.loading = false;
          },
          error: (error) => {
            this.error = formatApiError(error);
            this.loading = false;
          },
        });
      },
      error: (error) => {
        this.error = formatApiError(error);
        this.loading = false;
      },
    });
  }

  applyFilters(): void {
    const query = this.filterForm.controls.query.value.trim().toLowerCase();
    const siteId = this.filterForm.controls.siteId.value;
    const focus = this.filterForm.controls.focus.value;

    this.readyCount = this.projects.filter((project) => this.hasHero(project)).length;
    this.missingCount = this.projects.filter((project) => this.isCoverageGap(project)).length;
    this.releaseRiskCount = this.projects.filter((project) => this.needsHeroForRelease(project)).length;
    this.liveCount = this.projects.filter((project) => this.isLiveWithHero(project)).length;

    this.filteredProjects = this.projects
      .filter((project) => {
        if (siteId && project.siteId !== siteId) {
          return false;
        }

        if (focus === 'releaseRisk' && !this.needsHeroForRelease(project)) {
          return false;
        }

        if (focus === 'missing' && !this.isCoverageGap(project)) {
          return false;
        }

        if (focus === 'ready' && !this.hasHero(project)) {
          return false;
        }

        if (focus === 'live' && !this.isLiveWithHero(project)) {
          return false;
        }

        if (!query) {
          return true;
        }

        return [
          project.title,
          project.site.name,
          project.goal,
          project.reviewGate.stage,
          project.reviewGate.nextAction,
          project.reviewGate.primaryConcern,
          project.latestVersion?.title || '',
          ...(project.reviewGate.blockers ?? []),
          ...(project.reviewGate.warnings ?? []),
        ]
          .join(' ')
          .toLowerCase()
          .includes(query);
      })
      .sort((left, right) => {
        const priorityDelta = this.assetPriority(right) - this.assetPriority(left);
        if (priorityDelta !== 0) {
          return priorityDelta;
        }

        return Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
      });

    this.generationCandidates = this.projects
      .filter((project) => this.isCoverageGap(project))
      .filter((project) => !siteId || project.siteId === siteId)
      .sort((left, right) => this.assetPriority(right) - this.assetPriority(left))
      .slice(0, 6);
  }

  generate(project: StudioProjectSummary): void {
    if (!project.latestVersion || this.generatingProjectId) {
      return;
    }

    this.generatingProjectId = project.id;
    this.notice = '';
    this.error = '';

    this.api.generateAsset(project.id, project.latestVersion.id).subscribe({
      next: () => {
        this.generatingProjectId = '';
        this.notice = `Image generation launched for ${project.title}.`;
        this.loadData();
      },
      error: (error) => {
        this.generatingProjectId = '';
        this.error = formatApiError(error);
      },
    });
  }

  reviewStageLabel(stage: ReviewGateStage): string {
    return formatReviewStageLabel(stage);
  }

  reviewStageTone(stage: ReviewGateStage): TagTone {
    return getReviewStageTone(stage);
  }

  assetLabel(project: StudioProjectSummary): string {
    if (this.needsHeroForRelease(project)) {
      return 'Blocks release';
    }

    if (this.isLiveWithHero(project)) {
      return 'Live hero';
    }

    if (this.hasHero(project)) {
      return 'Hero ready';
    }

    return 'Missing hero';
  }

  assetTone(project: StudioProjectSummary): TagTone {
    if (this.needsHeroForRelease(project)) {
      return 'danger';
    }

    if (this.isLiveWithHero(project)) {
      return 'success';
    }

    if (this.hasHero(project)) {
      return 'accent';
    }

    return 'warning';
  }

  assetNarrative(project: StudioProjectSummary): string {
    if (this.needsHeroForRelease(project)) {
      return 'Hero missing and now blocking QA, approval or publish.';
    }

    if (this.isLiveWithHero(project)) {
      return 'Hero is live with the published article.';
    }

    if (this.hasHero(project)) {
      return `Hero available. ${project.reviewGate.nextAction}`;
    }

    return 'Hero missing on the active version.';
  }

  qaSummary(project: StudioProjectSummary): string {
    const qaScore = buildQaScore(project.latestVersion);
    return qaScore > 0
      ? `${qaScoreLabel(qaScore)} · ${qaScore}/100`
      : formatReviewStageLabel(project.reviewGate.stage);
  }

  detailLink(project: StudioProjectSummary): string[] {
    return project.latestVersion
      ? ['/studio/editorial/articles', project.id]
      : ['/studio/editorial/briefs', project.id];
  }

  needsHeroForRelease(project: StudioProjectSummary): boolean {
    return (
      this.isCoverageGap(project) &&
      ['needs_review', 'qa_blocked', 'ready_to_approve', 'approved', 'publish_queued', 'publish_failed'].includes(
        project.reviewGate.stage,
      )
    );
  }

  private hasHero(project: StudioProjectSummary): boolean {
    return Boolean(project.latestVersion?.hasAsset);
  }

  private isCoverageGap(project: StudioProjectSummary): boolean {
    return Boolean(project.latestVersion) && !this.hasHero(project);
  }

  private isLiveWithHero(project: StudioProjectSummary): boolean {
    return this.hasHero(project) && project.reviewGate.stage === 'published';
  }

  private assetPriority(project: StudioProjectSummary): number {
    if (this.needsHeroForRelease(project)) {
      return 4;
    }

    if (this.isCoverageGap(project)) {
      return 3;
    }

    if (project.reviewGate.publishReady && this.hasHero(project)) {
      return 2;
    }

    if (this.isLiveWithHero(project)) {
      return 1;
    }

    return 0;
  }
}
