import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import type {
  ReviewGateStage,
  StudioProjectDetailView,
  StudioProjectSummary,
  StudioSiteSummary,
} from '../models/studio.models';
import { StudioApiService } from '../services/studio-api.service';
import { formatApiError } from '../utils/api-error';
import {
  buildQaScore,
  qaScoreLabel,
  reviewStageLabel as formatReviewStageLabel,
  reviewStageTone as getReviewStageTone,
} from '../utils/review-gate';

type LibraryFocus = 'all' | 'releaseReady' | 'live' | 'recent' | 'coverageGaps';
type TagTone = 'muted' | 'accent' | 'warning' | 'success' | 'danger';

@Component({
  selector: 'app-media-library-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  template: `
    <section class="console-page">
      <header class="console-page__header">
        <div class="console-page__copy">
          <p class="console-kicker">Assets</p>
          <h1 class="console-page__title">Media Library</h1>
          <p class="console-page__intro">
            Inventario vivo de hero images, variantes y cobertura visual por pieza editorial y destino.
          </p>
        </div>

        <div class="console-page__actions">
          <a class="console-button console-button--secondary" routerLink="/studio/assets/images">
            Open images
          </a>
          <button type="button" class="console-button" (click)="loadData()">Refresh library</button>
        </div>
      </header>

      <div class="console-banner console-banner--success" *ngIf="notice">{{ notice }}</div>
      <div class="console-banner console-banner--error" *ngIf="error">{{ error }}</div>

      <div class="console-stat-grid" *ngIf="!loading">
        <article class="console-stat-card">
          <p class="console-stat-card__label">Library assets</p>
          <strong class="console-stat-card__value">{{ assetProjects.length }}</strong>
          <span class="console-stat-card__detail">Proyectos cuya versión activa ya aporta un hero reutilizable.</span>
        </article>

        <article class="console-stat-card">
          <p class="console-stat-card__label">Release-ready heroes</p>
          <strong class="console-stat-card__value">{{ releaseReadyAssetCount }}</strong>
          <span class="console-stat-card__detail">Assets que ya sostienen piezas sin blockers editoriales abiertos.</span>
        </article>

        <article class="console-stat-card">
          <p class="console-stat-card__label">Live assets</p>
          <strong class="console-stat-card__value">{{ liveAssetCount }}</strong>
          <span class="console-stat-card__detail">Heroes que ya están sosteniendo contenido publicado.</span>
        </article>

        <article class="console-stat-card">
          <p class="console-stat-card__label">Critical gaps</p>
          <strong class="console-stat-card__value">{{ criticalGapCount }}</strong>
          <span class="console-stat-card__detail">Piezas donde la falta de hero sigue poniendo en riesgo QA, approval o publish.</span>
        </article>
      </div>

      <div class="console-workspace" *ngIf="!loading; else loadingState">
        <div class="console-workspace__main">
          <section class="console-surface">
            <div class="console-surface__head">
              <div>
                <p class="console-surface__eyebrow">Library explorer</p>
                <h2 class="console-surface__title">Workspace assets</h2>
              </div>
            </div>

            <form class="console-toolbar console-toolbar--stretch" [formGroup]="filterForm">
              <label class="console-search console-search--wide">
                <span>Search</span>
                <input
                  type="text"
                  formControlName="query"
                  placeholder="Project, destination, gate, blocker or version title"
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
                  <option value="releaseReady">Release ready</option>
                  <option value="live">Live</option>
                  <option value="recent">Recently updated</option>
                  <option value="coverageGaps">Coverage gaps</option>
                </select>
              </label>
            </form>

            <div class="console-library-grid" *ngIf="filteredLibraryProjects.length; else emptyLibrary">
              <button
                type="button"
                class="console-library-card"
                *ngFor="let project of filteredLibraryProjects"
                [class.console-library-card--active]="project.id === selectedProjectId"
                (click)="selectProject(project.id)"
              >
                <div class="console-library-card__preview">
                  <img [src]="project.latestVersion?.assetUrl || ''" alt="Library asset preview" />
                </div>

                <div class="console-version-card__head">
                  <div>
                    <strong>{{ project.title }}</strong>
                    <p>{{ project.site.name }} · {{ assetNarrative(project) }}</p>
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
                  {{ project.latestVersion?.title || 'Untitled version' }}
                </p>
              </button>
            </div>

            <div class="console-feed" *ngIf="coverageGapItems.length">
              <article class="console-feed__item" *ngFor="let project of coverageGapItems">
                <div>
                  <strong>{{ project.title }}</strong>
                  <p>{{ project.site.name }} · {{ project.reviewGate.primaryConcern }}</p>
                </div>
                <a class="console-link" [routerLink]="detailLink(project)">Open article</a>
              </article>
            </div>
          </section>
        </div>

        <aside class="console-workspace__aside">
          <section class="console-surface" *ngIf="selectedProject as activeProject; else emptySelection">
            <div class="console-surface__head">
              <div>
                <p class="console-surface__eyebrow">Asset detail</p>
                <h2 class="console-surface__title">{{ activeProject.title }}</h2>
              </div>
            </div>

            <div class="console-image-card__preview" *ngIf="activeProject.latestAssetUrl">
              <img [src]="activeProject.latestAssetUrl || ''" alt="Selected asset preview" />
            </div>

            <div class="console-meta-grid">
              <article class="console-meta-card">
                <span>Destination</span>
                <strong>{{ activeProject.site.name }}</strong>
              </article>
              <article class="console-meta-card">
                <span>Gate</span>
                <strong>{{ reviewStageLabel(activeProject.reviewGate.stage) }}</strong>
              </article>
              <article class="console-meta-card">
                <span>QA / release</span>
                <strong>{{ qaSummary(activeProject) }}</strong>
              </article>
              <article class="console-meta-card">
                <span>Derivative count</span>
                <strong>{{ activeProject.latestVersion?.derivativeCount || 0 }}</strong>
              </article>
            </div>

            <div class="console-inline-actions">
              <button
                type="button"
                class="console-button"
                (click)="regenerateSelected()"
                [disabled]="regeneratingProjectId === activeProject.id"
              >
                {{ regeneratingProjectId === activeProject.id ? 'Running...' : 'Regenerate hero' }}
              </button>
              <a class="console-button console-button--secondary" [routerLink]="detailLink(activeProject)">
                {{ activeProject.latestVersion ? 'Open article' : 'Open brief' }}
              </a>
            </div>
          </section>

          <section class="console-surface" *ngIf="selectedProject as activeProject">
            <div class="console-surface__head">
              <div>
                <p class="console-surface__eyebrow">Variants</p>
                <h2 class="console-surface__title">Active asset variants</h2>
              </div>
            </div>

            <div class="console-variant-grid" *ngIf="activeProject.latestVersion?.assetVariants?.length; else emptyVariants">
              <article class="console-variant-card" *ngFor="let variant of activeProject.latestVersion?.assetVariants">
                <div>
                  <strong>{{ variant.kind }}</strong>
                  <p>{{ variant.mimeType }} · {{ variant.width || 'auto' }}x{{ variant.height || 'auto' }}</p>
                </div>
                <a class="console-link" *ngIf="variant.publicUrl" [href]="variant.publicUrl" target="_blank" rel="noreferrer">
                  Open file
                </a>
              </article>
            </div>

            <ng-template #emptyVariants>
              <div class="console-empty-compact">
                <p>No asset variants registered for the selected hero.</p>
              </div>
            </ng-template>
          </section>

          <section class="console-surface">
            <div class="console-surface__head">
              <div>
                <p class="console-surface__eyebrow">Coverage gaps</p>
                <h2 class="console-surface__title">Pieces missing hero image</h2>
              </div>
            </div>

            <div class="console-action-stack" *ngIf="missingProjects.length; else emptyCoverage">
              <a class="console-action-card" *ngFor="let project of missingProjects.slice(0, 6)" [routerLink]="detailLink(project)">
                <div>
                  <strong>{{ project.title }}</strong>
                  <span>{{ project.site.name }} · {{ project.reviewGate.primaryConcern }}</span>
                </div>
                <span
                  class="console-tag"
                  [class.console-tag--danger]="needsHeroForRelease(project)"
                  [class.console-tag--warning]="!needsHeroForRelease(project)"
                >
                  {{ needsHeroForRelease(project) ? 'Blocks release' : 'Missing' }}
                </span>
              </a>
            </div>
          </section>
        </aside>
      </div>

      <ng-template #loadingState>
        <section class="console-empty-state">
          <div>
            <p class="console-kicker">Assets</p>
            <h2>Loading media library</h2>
            <p>Estamos reuniendo heroes activos y cargando el detalle del asset seleccionado.</p>
          </div>
        </section>
      </ng-template>

      <ng-template #emptyLibrary>
        <div class="console-empty-compact">
          <p>No assets match the current filters.</p>
        </div>
      </ng-template>

      <ng-template #emptySelection>
        <section class="console-surface">
          <div class="console-empty-compact">
            <p>Select an asset to inspect its variants and editorial context.</p>
          </div>
        </section>
      </ng-template>

      <ng-template #emptyCoverage>
        <div class="console-empty-compact">
          <p>No coverage gaps right now.</p>
        </div>
      </ng-template>
    </section>
  `,
})
export class MediaLibraryPageComponent implements OnInit {
  private readonly api = inject(StudioApiService);

  readonly filterForm = new FormGroup({
    query: new FormControl('', { nonNullable: true }),
    siteId: new FormControl('', { nonNullable: true }),
    focus: new FormControl<LibraryFocus>('all', { nonNullable: true }),
  });

  sites: StudioSiteSummary[] = [];
  projects: StudioProjectSummary[] = [];
  assetProjects: StudioProjectSummary[] = [];
  filteredLibraryProjects: StudioProjectSummary[] = [];
  missingProjects: StudioProjectSummary[] = [];
  coverageGapItems: StudioProjectSummary[] = [];
  selectedProjectId = '';
  selectedProject: StudioProjectDetailView | null = null;
  releaseReadyAssetCount = 0;
  liveAssetCount = 0;
  criticalGapCount = 0;
  regeneratingProjectId = '';
  loading = true;
  detailLoading = false;
  error = '';
  notice = '';

  ngOnInit(): void {
    this.loadData();
  }

  loadData(): void {
    this.loading = true;
    this.error = '';

    forkJoin({
      sites: this.api.listSites(1, 100),
      projects: this.api.listProjects({ page: 1, pageSize: 100 }),
    }).subscribe({
      next: ({ sites, projects }) => {
        this.sites = sites.items;
        this.projects = projects.items.sort(
          (left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt),
        );
        this.applyFilters();
        this.loading = false;
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

    this.assetProjects = this.projects.filter((project) => this.hasHero(project));
    this.missingProjects = this.projects.filter((project) => this.isCoverageGap(project));
    this.releaseReadyAssetCount = this.assetProjects.filter((project) => this.isReleaseReadyAsset(project)).length;
    this.liveAssetCount = this.assetProjects.filter((project) => this.isLiveAsset(project)).length;
    this.criticalGapCount = this.missingProjects.filter((project) => this.needsHeroForRelease(project)).length;

    this.filteredLibraryProjects = this.assetProjects
      .filter((project) => {
        if (siteId && project.siteId !== siteId) {
          return false;
        }

        if (focus === 'releaseReady' && !this.isReleaseReadyAsset(project)) {
          return false;
        }

        if (focus === 'live' && !this.isLiveAsset(project)) {
          return false;
        }

        if (focus === 'recent') {
          const isRecent = Date.now() - Date.parse(project.updatedAt) <= 1000 * 60 * 60 * 24 * 7;
          if (!isRecent) {
            return false;
          }
        }

        if (focus === 'coverageGaps') {
          return false;
        }

        if (!query) {
          return true;
        }

        return [
          project.title,
          project.site.name,
          project.latestVersion?.title || '',
          project.reviewGate.stage,
          project.reviewGate.nextAction,
          project.reviewGate.primaryConcern,
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

    this.coverageGapItems = this.missingProjects
      .filter((project) => !siteId || project.siteId === siteId)
      .filter((project) => {
        if (focus !== 'coverageGaps' && !query) {
          return true;
        }

        if (focus !== 'coverageGaps' && query) {
          return [
            project.title,
            project.site.name,
            project.brief,
            project.reviewGate.primaryConcern,
            project.reviewGate.stage,
          ]
            .join(' ')
            .toLowerCase()
            .includes(query);
        }

        if (!query) {
          return true;
        }

        return [
          project.title,
          project.site.name,
          project.brief,
          project.reviewGate.primaryConcern,
          project.reviewGate.stage,
        ]
          .join(' ')
          .toLowerCase()
          .includes(query);
      })
      .sort((left, right) => this.assetPriority(right) - this.assetPriority(left))
      .slice(0, 8);

    const nextSelectedId = this.filteredLibraryProjects[0]?.id ?? '';
    if (!this.selectedProjectId || !this.filteredLibraryProjects.some((project) => project.id === this.selectedProjectId)) {
      this.selectedProjectId = nextSelectedId;
      if (this.selectedProjectId) {
        this.fetchSelectedProject();
      } else {
        this.selectedProject = null;
      }
    }
  }

  selectProject(projectId: string): void {
    if (projectId === this.selectedProjectId) {
      return;
    }

    this.selectedProjectId = projectId;
    this.fetchSelectedProject();
  }

  regenerateSelected(): void {
    const project = this.selectedProject;
    if (!project?.latestVersion || this.regeneratingProjectId) {
      return;
    }

    this.regeneratingProjectId = project.id;
    this.notice = '';
    this.error = '';

    this.api.generateAsset(project.id, project.latestVersion.id).subscribe({
      next: () => {
        this.regeneratingProjectId = '';
        this.notice = `Hero regeneration launched for ${project.title}.`;
        this.loadData();
      },
      error: (error) => {
        this.regeneratingProjectId = '';
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

  assetLabel(project: StudioProjectSummary | StudioProjectDetailView): string {
    if (this.isLiveAsset(project)) {
      return 'Live hero';
    }

    if (this.isReleaseReadyAsset(project)) {
      return 'Release ready';
    }

    return 'Active asset';
  }

  assetTone(project: StudioProjectSummary | StudioProjectDetailView): TagTone {
    if (this.isLiveAsset(project)) {
      return 'success';
    }

    if (this.isReleaseReadyAsset(project)) {
      return 'accent';
    }

    return 'muted';
  }

  assetNarrative(project: StudioProjectSummary | StudioProjectDetailView): string {
    if (this.isLiveAsset(project)) {
      return 'Hero is already supporting a published article.';
    }

    if (this.isReleaseReadyAsset(project)) {
      return `Hero available. ${project.reviewGate.nextAction}`;
    }

    return `Hero available. ${project.reviewGate.primaryConcern}`;
  }

  qaSummary(project: StudioProjectSummary | StudioProjectDetailView): string {
    const qaScore = buildQaScore(project.latestVersion);
    return qaScore > 0
      ? `${qaScoreLabel(qaScore)} · ${qaScore}/100`
      : formatReviewStageLabel(project.reviewGate.stage);
  }

  detailLink(project: StudioProjectSummary | StudioProjectDetailView): string[] {
    return project.latestVersion
      ? ['/studio/editorial/articles', project.id]
      : ['/studio/editorial/briefs', project.id];
  }

  needsHeroForRelease(project: StudioProjectSummary | StudioProjectDetailView): boolean {
    return (
      this.isCoverageGap(project) &&
      ['needs_review', 'qa_blocked', 'ready_to_approve', 'approved', 'publish_queued', 'publish_failed'].includes(
        project.reviewGate.stage,
      )
    );
  }

  private fetchSelectedProject(): void {
    if (!this.selectedProjectId) {
      this.selectedProject = null;
      return;
    }

    this.detailLoading = true;
    this.api.getProject(this.selectedProjectId).subscribe({
      next: (project) => {
        this.selectedProject = project;
        this.detailLoading = false;
      },
      error: (error) => {
        this.error = formatApiError(error);
        this.detailLoading = false;
      },
    });
  }

  private hasHero(project: StudioProjectSummary | StudioProjectDetailView): boolean {
    return Boolean(project.latestVersion?.hasAsset);
  }

  private isCoverageGap(project: StudioProjectSummary | StudioProjectDetailView): boolean {
    return Boolean(project.latestVersion) && !this.hasHero(project);
  }

  private isReleaseReadyAsset(project: StudioProjectSummary | StudioProjectDetailView): boolean {
    return this.hasHero(project) && (project.reviewGate.publishReady || project.reviewGate.stage === 'ready_to_approve');
  }

  private isLiveAsset(project: StudioProjectSummary | StudioProjectDetailView): boolean {
    return this.hasHero(project) && project.reviewGate.stage === 'published';
  }

  private assetPriority(project: StudioProjectSummary): number {
    if (this.needsHeroForRelease(project)) {
      return 4;
    }

    if (this.isCoverageGap(project)) {
      return 3;
    }

    if (this.isReleaseReadyAsset(project)) {
      return 2;
    }

    if (this.isLiveAsset(project)) {
      return 1;
    }

    return 0;
  }
}
