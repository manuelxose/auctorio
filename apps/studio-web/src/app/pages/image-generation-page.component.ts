import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import type { StudioProjectSummary, StudioSiteSummary } from '../models/studio.models';
import { StudioApiService } from '../services/studio-api.service';
import { formatApiError } from '../utils/api-error';

type ImageWorkspaceView = 'assets' | 'generation';
type AssetFocus = 'all' | 'missing' | 'ready' | 'published';

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
          <p class="console-stat-card__label">Published with image</p>
          <strong class="console-stat-card__value">{{ publishedWithImageCount }}</strong>
          <span class="console-stat-card__detail">Contenido live cuya version activa mantiene soporte visual.</span>
        </article>

        <article class="console-stat-card">
          <p class="console-stat-card__label">Generation queue</p>
          <strong class="console-stat-card__value">{{ generationCandidates.length }}</strong>
          <span class="console-stat-card__detail">Candidatos inmediatos para lanzar o relanzar generación de assets.</span>
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
                  placeholder="Project, version title or destination"
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
                  <option value="missing">Missing</option>
                  <option value="ready">Ready</option>
                  <option value="published">Published</option>
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
                    <p>{{ project.site.name }} · {{ project.goal }} · V{{ project.latestVersion?.versionNumber || 0 }}</p>
                  </div>
                  <div class="console-version-card__tags">
                    <span
                      class="console-tag"
                      [class.console-tag--success]="project.latestVersion?.hasAsset"
                      [class.console-tag--warning]="!project.latestVersion?.hasAsset"
                    >
                      {{ project.latestVersion?.hasAsset ? 'Ready' : 'Missing' }}
                    </span>
                    <span class="console-tag console-tag--muted">{{ project.status }}</span>
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
                    <span>Assignment</span>
                    <strong>{{ project.site.name }}</strong>
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
                  <a class="console-button console-button--secondary" [routerLink]="['/studio/editorial/articles', project.id]">
                    Open article
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
              <a class="console-action-card" *ngFor="let project of generationCandidates" [routerLink]="['/studio/editorial/articles', project.id]">
                <div>
                  <strong>{{ project.title }}</strong>
                  <span>{{ project.site.name }} · {{ project.status }}</span>
                </div>
                <span class="console-tag console-tag--warning">Needs image</span>
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
                Missing coverage marca contenido con texto listo pero sin soporte visual para release.
              </li>
              <li class="console-note-list__item">
                El siguiente salto será exponer variantes, prompts y selección manual desde la misma superficie.
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
  publishedWithImageCount = 0;
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

    this.readyCount = this.projects.filter((project) => project.latestVersion?.hasAsset).length;
    this.missingCount = this.projects.filter((project) => !project.latestVersion?.hasAsset).length;
    this.publishedWithImageCount = this.projects.filter(
      (project) => project.status === 'published' && project.latestVersion?.hasAsset,
    ).length;

    this.filteredProjects = this.projects.filter((project) => {
      if (siteId && project.siteId !== siteId) {
        return false;
      }

      if (focus === 'missing' && project.latestVersion?.hasAsset) {
        return false;
      }

      if (focus === 'ready' && !project.latestVersion?.hasAsset) {
        return false;
      }

      if (focus === 'published' && project.status !== 'published') {
        return false;
      }

      if (!query) {
        return true;
      }

      return [
        project.title,
        project.site.name,
        project.status,
        project.latestVersion?.title || '',
      ]
        .join(' ')
        .toLowerCase()
        .includes(query);
    });

    this.generationCandidates = this.projects
      .filter((project) => !project.latestVersion?.hasAsset)
      .filter((project) => !siteId || project.siteId === siteId)
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
}
