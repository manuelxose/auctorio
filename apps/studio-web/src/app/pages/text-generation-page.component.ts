import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import type { ProjectStatus, StudioProjectSummary, StudioSiteSummary } from '../models/studio.models';
import { StudioApiService } from '../services/studio-api.service';
import { formatApiError } from '../utils/api-error';

type GenerationFocus = 'all' | 'needsRun' | 'generated' | 'needsRevision';

@Component({
  selector: 'app-text-generation-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  template: `
    <section class="console-page">
      <header class="console-page__header">
        <div class="console-page__copy">
          <p class="console-kicker">AI Generation</p>
          <h1 class="console-page__title">Text Generation</h1>
          <p class="console-page__intro">
            Consola editorial para lanzar primeras salidas, relanzar revisiones y seguir el rastro operativo del contenido generado.
          </p>
        </div>

        <div class="console-page__actions">
          <a class="console-button console-button--secondary" routerLink="/studio/editorial/pipeline">
            Open pipeline
          </a>
          <button type="button" class="console-button" (click)="loadData()">Refresh generation</button>
        </div>
      </header>

      <div class="console-banner console-banner--success" *ngIf="notice">{{ notice }}</div>
      <div class="console-banner console-banner--error" *ngIf="error">{{ error }}</div>

      <div class="console-stat-grid" *ngIf="!loading">
        <article class="console-stat-card">
          <p class="console-stat-card__label">Needs first run</p>
          <strong class="console-stat-card__value">{{ needsRunCount }}</strong>
          <span class="console-stat-card__detail">Briefs y proyectos que aun no tienen una primera salida AI registrada.</span>
        </article>

        <article class="console-stat-card">
          <p class="console-stat-card__label">Generated outputs</p>
          <strong class="console-stat-card__value">{{ generatedCount }}</strong>
          <span class="console-stat-card__detail">Piezas con version activa ya creada por el circuito de generación.</span>
        </article>

        <article class="console-stat-card">
          <p class="console-stat-card__label">Needs revision run</p>
          <strong class="console-stat-card__value">{{ needsRevisionCount }}</strong>
          <span class="console-stat-card__detail">Contenido con feedback o bloqueos que probablemente requiere una nueva iteración.</span>
        </article>

        <article class="console-stat-card">
          <p class="console-stat-card__label">Review ready</p>
          <strong class="console-stat-card__value">{{ reviewReadyCount }}</strong>
          <span class="console-stat-card__detail">Outputs que ya avanzaron hasta review o QA y salen del tramo puramente AI.</span>
        </article>
      </div>

      <div class="console-workspace" *ngIf="!loading; else loadingState">
        <div class="console-workspace__main">
          <section class="console-surface">
            <div class="console-surface__head">
              <div>
                <p class="console-surface__eyebrow">Generation queue</p>
                <h2 class="console-surface__title">Runs and reruns</h2>
              </div>
            </div>

            <form class="console-toolbar console-toolbar--stretch" [formGroup]="filterForm">
              <label class="console-search console-search--wide">
                <span>Search</span>
                <input
                  type="text"
                  formControlName="query"
                  placeholder="Project, brief, excerpt or feedback"
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
                  <option value="all">All generation</option>
                  <option value="needsRun">Needs first run</option>
                  <option value="generated">Generated</option>
                  <option value="needsRevision">Needs revision</option>
                </select>
              </label>
            </form>

            <div class="console-list-grid" *ngIf="filteredProjects.length; else emptyGeneration">
              <article class="console-list-card" *ngFor="let project of filteredProjects">
                <div class="console-version-card__head">
                  <div>
                    <strong>{{ project.title }}</strong>
                    <p>{{ project.site.name }} · {{ project.goal }} · {{ project.primaryLanguage }}</p>
                  </div>
                  <div class="console-version-card__tags">
                    <span
                      class="console-tag"
                      [class.console-tag--warning]="!project.latestVersion"
                      [class.console-tag--accent]="project.latestVersion && ['draft', 'ai_generated', 'in_review'].includes(project.status)"
                      [class.console-tag--success]="project.latestVersion && ['qa_passed', 'approved', 'published'].includes(project.status)"
                      [class.console-tag--danger]="project.status === 'qa_failed' || project.status === 'publish_failed'"
                    >
                      {{ generationLabel(project) }}
                    </span>
                    <span class="console-tag console-tag--muted">{{ statusLabel(project.status) }}</span>
                  </div>
                </div>

                <p class="console-version-card__body">
                  <ng-container *ngIf="project.latestVersion; else briefSummary">
                    {{ project.latestVersion.title || 'Untitled version' }}
                    <ng-container *ngIf="project.latestVersion.excerpt">
                      · {{ truncate(project.latestVersion.excerpt, 180) }}
                    </ng-container>
                  </ng-container>
                </p>

                <ng-template #briefSummary>
                  {{ truncate(project.brief, 180) }}
                </ng-template>

                <div class="console-meta-grid">
                  <article class="console-meta-card">
                    <span>Latest version</span>
                    <strong>{{ project.latestVersion ? 'V' + project.latestVersion.versionNumber : 'None yet' }}</strong>
                  </article>
                  <article class="console-meta-card">
                    <span>Feedback memory</span>
                    <strong>{{ project.latestVersion?.feedback ? 'Available' : 'No feedback yet' }}</strong>
                  </article>
                  <article class="console-meta-card">
                    <span>Prompt</span>
                    <strong>{{ project.latestVersion?.promptPresetName || project.latestVersion?.promptVersionLabel || 'Seed fallback' }}</strong>
                  </article>
                </div>

                <div class="console-inline-actions">
                  <button
                    type="button"
                    class="console-button"
                    (click)="generate(project)"
                    [disabled]="actingProjectId === project.id"
                  >
                    {{ actingProjectId === project.id ? 'Running...' : actionLabel(project) }}
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
                <p class="console-surface__eyebrow">Feedback-driven</p>
                <h2 class="console-surface__title">Candidates for rewrite</h2>
              </div>
            </div>

            <div class="console-action-stack" *ngIf="revisionCandidates.length; else emptyRevision">
              <a class="console-action-card" *ngFor="let project of revisionCandidates" [routerLink]="['/studio/editorial/articles', project.id]">
                <div>
                  <strong>{{ project.title }}</strong>
                  <span>{{ project.site.name }} · {{ statusLabel(project.status) }}</span>
                </div>
                <span class="console-tag console-tag--warning">Rewrite</span>
              </a>
            </div>
          </section>

          <section class="console-surface">
            <div class="console-surface__head">
              <div>
                <p class="console-surface__eyebrow">Observability</p>
                <h2 class="console-surface__title">Generation notes</h2>
              </div>
            </div>

            <ul class="console-note-list">
              <li class="console-note-list__item">
                Generate no solo crea la primera versión; también sirve para iterar sobre feedback editorial.
              </li>
              <li class="console-note-list__item">
                La salida AI deja de ser un job invisible y se conecta con briefs, articles y versions.
              </li>
              <li class="console-note-list__item">
                Cuando exista Prompt Library real, esta pantalla podrá sumar presets y trazabilidad de policies.
              </li>
            </ul>
          </section>
        </aside>
      </div>

      <ng-template #loadingState>
        <section class="console-empty-state">
          <div>
            <p class="console-kicker">AI Generation</p>
            <h2>Loading text generation workspace</h2>
            <p>Estamos reuniendo briefs, snapshots y memoria editorial para construir la cola de generación.</p>
          </div>
        </section>
      </ng-template>

      <ng-template #emptyGeneration>
        <div class="console-empty-compact">
          <p>No generation candidates match the current filters.</p>
        </div>
      </ng-template>

      <ng-template #emptyRevision>
        <div class="console-empty-compact">
          <p>No rewrite candidates right now.</p>
        </div>
      </ng-template>
    </section>
  `,
})
export class TextGenerationPageComponent implements OnInit {
  private readonly api = inject(StudioApiService);

  readonly filterForm = new FormGroup({
    query: new FormControl('', { nonNullable: true }),
    siteId: new FormControl('', { nonNullable: true }),
    focus: new FormControl<GenerationFocus>('all', { nonNullable: true }),
  });

  sites: StudioSiteSummary[] = [];
  projects: StudioProjectSummary[] = [];
  filteredProjects: StudioProjectSummary[] = [];
  revisionCandidates: StudioProjectSummary[] = [];
  needsRunCount = 0;
  generatedCount = 0;
  needsRevisionCount = 0;
  reviewReadyCount = 0;
  actingProjectId = '';
  loading = true;
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

    this.needsRunCount = this.projects.filter((project) => !project.latestVersion).length;
    this.generatedCount = this.projects.filter((project) => Boolean(project.latestVersion)).length;
    this.needsRevisionCount = this.projects.filter((project) => this.needsRevision(project)).length;
    this.reviewReadyCount = this.projects.filter((project) =>
      ['in_review', 'qa_passed', 'approved', 'published'].includes(project.status),
    ).length;

    this.filteredProjects = this.projects.filter((project) => {
      if (siteId && project.siteId !== siteId) {
        return false;
      }

      if (focus === 'needsRun' && project.latestVersion) {
        return false;
      }

      if (focus === 'generated' && !project.latestVersion) {
        return false;
      }

      if (focus === 'needsRevision' && !this.needsRevision(project)) {
        return false;
      }

      if (!query) {
        return true;
      }

      return [
        project.title,
        project.site.name,
        project.brief,
        project.latestVersion?.title || '',
        project.latestVersion?.excerpt || '',
        project.latestVersion?.feedback || '',
      ]
        .join(' ')
        .toLowerCase()
        .includes(query);
    });

    this.revisionCandidates = this.projects
      .filter((project) => this.needsRevision(project))
      .filter((project) => !siteId || project.siteId === siteId)
      .slice(0, 6);
  }

  generate(project: StudioProjectSummary): void {
    if (this.actingProjectId) {
      return;
    }

    this.actingProjectId = project.id;
    this.notice = '';
    this.error = '';

    this.api.generateProject(project.id).subscribe({
      next: () => {
        this.actingProjectId = '';
        this.notice = `Generation launched for ${project.title}.`;
        this.loadData();
      },
      error: (error) => {
        this.actingProjectId = '';
        this.error = formatApiError(error);
      },
    });
  }

  actionLabel(project: StudioProjectSummary): string {
    if (!project.latestVersion) {
      return 'Generate first draft';
    }

    if (this.needsRevision(project)) {
      return 'Run revision';
    }

    return 'Regenerate';
  }

  generationLabel(project: StudioProjectSummary): string {
    if (!project.latestVersion) {
      return 'No output';
    }

    if (this.needsRevision(project)) {
      return 'Needs rewrite';
    }

    if (['qa_passed', 'approved', 'published'].includes(project.status)) {
      return 'Review ready';
    }

    return 'Generated';
  }

  statusLabel(status: ProjectStatus): string {
    const labels: Record<ProjectStatus, string> = {
      draft: 'Draft',
      ai_generated: 'AI generated',
      qa_failed: 'QA failed',
      qa_passed: 'QA passed',
      in_review: 'In review',
      approved: 'Approved',
      publish_queued: 'Publish queued',
      published: 'Published',
      publish_failed: 'Publish failed',
    };

    return labels[status];
  }

  truncate(text: string | null | undefined, limit: number): string {
    const normalized = text?.trim() ?? '';
    if (!normalized) {
      return '';
    }

    return normalized.length > limit
      ? `${normalized.slice(0, limit).trimEnd()}...`
      : normalized;
  }

  private needsRevision(project: StudioProjectSummary): boolean {
    return (
      Boolean(project.latestVersion?.feedback) ||
      ['qa_failed', 'publish_failed', 'in_review'].includes(project.status)
    );
  }
}
