import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import type { ReviewGateStage, StudioProjectSummary, StudioSiteSummary } from '../models/studio.models';
import { StudioApiService } from '../services/studio-api.service';
import { formatApiError } from '../utils/api-error';
import { buildQaScore, qaScoreLabel, reviewStageLabel, reviewStageTone } from '../utils/review-gate';

type GenerationFocus = 'all' | 'needsRun' | 'drafting' | 'needsRevision' | 'handoff';
type TagTone = 'muted' | 'accent' | 'warning' | 'success' | 'danger';

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
          <p class="console-stat-card__label">Drafting loop</p>
          <strong class="console-stat-card__value">{{ draftingCount }}</strong>
          <span class="console-stat-card__detail">Piezas con salida viva que siguen en el tramo de generación y calibración editorial.</span>
        </article>

        <article class="console-stat-card">
          <p class="console-stat-card__label">Needs revision run</p>
          <strong class="console-stat-card__value">{{ needsRevisionCount }}</strong>
          <span class="console-stat-card__detail">Contenido con feedback o blockers que ya justifican una nueva iteración.</span>
        </article>

        <article class="console-stat-card">
          <p class="console-stat-card__label">Editorial handoff</p>
          <strong class="console-stat-card__value">{{ handoffCount }}</strong>
          <span class="console-stat-card__detail">Outputs que ya salieron del tramo AI y quedan en manos de review, QA o release.</span>
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
                  <option value="drafting">Drafting loop</option>
                  <option value="needsRevision">Needs revision</option>
                  <option value="handoff">Editorial handoff</option>
                </select>
              </label>
            </form>

            <div class="console-list-grid" *ngIf="filteredProjects.length; else emptyGeneration">
              <article class="console-list-card" *ngFor="let project of filteredProjects">
                <div class="console-version-card__head">
                  <div>
                    <strong>{{ project.title }}</strong>
                    <p>{{ project.site.name }} · {{ project.goal }} · {{ generationSummary(project) }}</p>
                  </div>
                  <div class="console-version-card__tags">
                    <span
                      class="console-tag"
                      [class.console-tag--warning]="generationTone(project) === 'warning'"
                      [class.console-tag--accent]="generationTone(project) === 'accent'"
                      [class.console-tag--success]="generationTone(project) === 'success'"
                      [class.console-tag--danger]="generationTone(project) === 'danger'"
                      [class.console-tag--muted]="generationTone(project) === 'muted'"
                    >
                      {{ generationLabel(project) }}
                    </span>
                    <span
                      class="console-tag"
                      [class.console-tag--warning]="reviewStageTone(project.reviewGate.stage) === 'warning'"
                      [class.console-tag--accent]="reviewStageTone(project.reviewGate.stage) === 'accent'"
                      [class.console-tag--success]="reviewStageTone(project.reviewGate.stage) === 'success'"
                      [class.console-tag--danger]="reviewStageTone(project.reviewGate.stage) === 'danger'"
                      [class.console-tag--muted]="reviewStageTone(project.reviewGate.stage) === 'muted'"
                    >
                      {{ reviewStageLabel(project.reviewGate.stage) }}
                    </span>
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
                    <span>Revision signal</span>
                    <strong>{{ revisionSignal(project) }}</strong>
                  </article>
                  <article class="console-meta-card">
                    <span>Gate / QA</span>
                    <strong>{{ qaSummary(project) }}</strong>
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
                <p class="console-surface__eyebrow">Feedback-driven</p>
                <h2 class="console-surface__title">Candidates for rewrite</h2>
              </div>
            </div>

            <div class="console-action-stack" *ngIf="revisionCandidates.length; else emptyRevision">
              <a class="console-action-card" *ngFor="let project of revisionCandidates" [routerLink]="detailLink(project)">
                <div>
                  <strong>{{ project.title }}</strong>
                  <span>{{ project.site.name }} · {{ project.reviewGate.primaryConcern }}</span>
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
                Generate sirve para primera salida y para nuevas variantes; la revision real usa feedback persistido cuando existe.
              </li>
              <li class="console-note-list__item">
                La salida AI deja de ser un job invisible y se conecta con briefs, articles, versions y el mismo review gate del cockpit.
              </li>
              <li class="console-note-list__item">
                Si no hay feedback humano guardado, la siguiente iteracion se apoya en blockers o concern reales del gate en vez de vender una revision ficticia.
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
  draftingCount = 0;
  needsRevisionCount = 0;
  handoffCount = 0;
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

    this.needsRunCount = this.projects.filter((project) => this.needsFirstRun(project)).length;
    this.draftingCount = this.projects.filter((project) => this.isDraftingLoop(project)).length;
    this.needsRevisionCount = this.projects.filter((project) => this.needsRevision(project)).length;
    this.handoffCount = this.projects.filter((project) => this.isHandoff(project)).length;

    this.filteredProjects = this.projects
      .filter((project) => {
        if (siteId && project.siteId !== siteId) {
          return false;
        }

        if (focus === 'needsRun' && !this.needsFirstRun(project)) {
          return false;
        }

        if (focus === 'drafting' && !this.isDraftingLoop(project)) {
          return false;
        }

        if (focus === 'needsRevision' && !this.needsRevision(project)) {
          return false;
        }

        if (focus === 'handoff' && !this.isHandoff(project)) {
          return false;
        }

        if (!query) {
          return true;
        }

        return [
          project.title,
          project.site.name,
          project.brief,
          project.reviewGate.stage,
          project.reviewGate.nextAction,
          project.reviewGate.primaryConcern,
          project.latestVersion?.title || '',
          project.latestVersion?.excerpt || '',
          project.latestVersion?.feedback || '',
          ...(project.reviewGate.blockers ?? []),
          ...(project.reviewGate.warnings ?? []),
        ]
          .join(' ')
          .toLowerCase()
          .includes(query);
      })
      .sort((left, right) => {
        const priorityDelta = this.generationPriority(right) - this.generationPriority(left);
        if (priorityDelta !== 0) {
          return priorityDelta;
        }

        return Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
      });

    this.revisionCandidates = this.filteredProjects
      .filter((project) => this.needsRevision(project))
      .slice(0, 6);
  }

  generate(project: StudioProjectSummary): void {
    if (this.actingProjectId) {
      return;
    }

    this.actingProjectId = project.id;
    this.notice = '';
    this.error = '';
    const feedback = this.buildGenerationFeedback(project);
    const request =
      project.latestVersion?.feedback?.trim()
        ? this.api.reviseProject(project.id, project.latestVersion.feedback.trim())
        : this.api.generateProject(project.id, feedback);

    request.subscribe({
      next: () => {
        this.actingProjectId = '';
        this.notice = `${this.actionLabel(project)} launched for ${project.title}.`;
        this.loadData();
      },
      error: (error) => {
        this.actingProjectId = '';
        this.error = formatApiError(error);
      },
    });
  }

  actionLabel(project: StudioProjectSummary): string {
    if (this.needsFirstRun(project)) {
      return 'Generate first draft';
    }

    if (this.needsRevision(project)) {
      return project.latestVersion?.feedback?.trim()
        ? 'Run revision'
        : 'Generate corrective draft';
    }

    if (this.isHandoff(project)) {
      return 'Generate variant';
    }

    return 'Continue drafting';
  }

  generationLabel(project: StudioProjectSummary): string {
    if (this.needsFirstRun(project)) {
      return 'Needs first run';
    }

    if (this.needsRevision(project)) {
      return 'Needs rewrite';
    }

    if (this.isHandoff(project)) {
      return 'Handoff ready';
    }

    return 'Drafting loop';
  }

  generationSummary(project: StudioProjectSummary): string {
    if (this.needsRevision(project)) {
      return project.reviewGate.primaryConcern;
    }

    return project.reviewGate.nextAction;
  }

  revisionSignal(project: StudioProjectSummary): string {
    if (project.latestVersion?.feedback?.trim()) {
      return 'Stored reviewer feedback';
    }

    if (project.reviewGate.blockerCount > 0) {
      return `${project.reviewGate.blockerCount} blockers in gate`;
    }

    return 'No rewrite signal';
  }

  qaSummary(project: StudioProjectSummary): string {
    const score = buildQaScore(project.latestVersion);
    return score > 0
      ? `${qaScoreLabel(score)} · ${score}/100`
      : reviewStageLabel(project.reviewGate.stage);
  }

  reviewStageLabel(stage: ReviewGateStage): string {
    return reviewStageLabel(stage);
  }

  reviewStageTone(stage: ReviewGateStage): TagTone {
    return reviewStageTone(stage);
  }

  generationTone(project: StudioProjectSummary): TagTone {
    if (this.needsFirstRun(project)) {
      return 'muted';
    }

    if (this.needsRevision(project)) {
      return 'danger';
    }

    if (this.isHandoff(project)) {
      return 'success';
    }

    return 'accent';
  }

  detailLink(project: StudioProjectSummary): string[] {
    return project.latestVersion
      ? ['/studio/editorial/articles', project.id]
      : ['/studio/editorial/briefs', project.id];
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
      Boolean(project.latestVersion?.feedback?.trim()) ||
      project.reviewGate.blockerCount > 0 ||
      project.reviewGate.stage === 'publish_failed'
    );
  }

  private needsFirstRun(project: StudioProjectSummary): boolean {
    return !project.latestVersion || project.reviewGate.stage === 'awaiting_generation';
  }

  private isDraftingLoop(project: StudioProjectSummary): boolean {
    return !this.needsFirstRun(project) && !this.needsRevision(project) && !this.isHandoff(project);
  }

  private isHandoff(project: StudioProjectSummary): boolean {
    if (this.needsRevision(project)) {
      return false;
    }

    return (
      project.reviewGate.approvalReady ||
      project.reviewGate.publishReady ||
      ['approved', 'publish_queued', 'published'].includes(project.reviewGate.stage)
    );
  }

  private generationPriority(project: StudioProjectSummary): number {
    if (this.needsRevision(project)) {
      return 4;
    }

    if (this.needsFirstRun(project)) {
      return 3;
    }

    if (this.isDraftingLoop(project)) {
      return 2;
    }

    if (this.isHandoff(project)) {
      return 1;
    }

    return 0;
  }

  private buildGenerationFeedback(project: StudioProjectSummary): string | undefined {
    const reviewerFeedback = project.latestVersion?.feedback?.trim();
    if (reviewerFeedback) {
      return reviewerFeedback;
    }

    if (project.reviewGate.blockers.length > 0) {
      return project.reviewGate.blockers.slice(0, 3).join(' ');
    }

    if (project.reviewGate.warningCount > 0) {
      return project.reviewGate.warnings.slice(0, 2).join(' ');
    }

    return undefined;
  }
}
