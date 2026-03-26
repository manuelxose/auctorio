import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import type { ReviewGateStage, StudioProjectSummary, StudioSiteSummary } from '../models/studio.models';
import { StudioPageHeaderComponent } from '../components/studio-page-header.component';
import { StudioStatStripComponent, type StudioStatItem } from '../components/studio-stat-strip.component';
import { StudioApiService } from '../services/studio-api.service';
import { formatApiError } from '../utils/api-error';
import {
  buildQaScore,
  qaScoreLabel as formatQaScoreLabel,
  reviewStageLabel as formatReviewStageLabel,
  reviewStageTone,
} from '../utils/review-gate';

type ReviewFocus = 'all' | 'needsReview' | 'readyToApprove' | 'approved';

@Component({
  selector: 'app-editor-review-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, StudioPageHeaderComponent, StudioStatStripComponent],
  template: `
    <section class="console-page">
      <app-studio-page-header
        kicker="Review"
        title="Editor Review"
        intro="Superficie humana para leer, comparar, dejar memoria editorial y cerrar la decision antes de scheduling o publish."
      >
        <div page-meta *ngIf="!loading">
          <span class="console-tag console-tag--warning">{{ needsActionCount }} active lane</span>
          <span class="console-tag console-tag--accent">{{ readyToApproveCount }} ready now</span>
          <span class="console-tag console-tag--success">{{ approvedCount }} approved</span>
        </div>

        <div page-actions>
          <a class="console-button console-button--secondary" routerLink="/studio/review/qa">
            QA queue
          </a>
          <button type="button" class="console-button" (click)="loadData()">Refresh review</button>
        </div>
      </app-studio-page-header>

      <div class="console-banner console-banner--success" *ngIf="notice">{{ notice }}</div>
      <div class="console-banner console-banner--error" *ngIf="error">{{ error }}</div>

      <app-studio-stat-strip *ngIf="!loading" [items]="reviewStats"></app-studio-stat-strip>

      <section class="console-surface console-surface--hero" *ngIf="!loading">
        <div class="console-hero-grid">
          <div class="console-hero-copy">
            <p class="console-surface__eyebrow">Human decision lane</p>
            <h2 class="console-surface__title">Editorial sign-off posture</h2>
            <p class="console-hero-copy__body">{{ reviewNarrative }}</p>

            <div class="console-header-strip">
              <article class="console-header-strip__card">
                <span>Open decisions</span>
                <strong>{{ needsActionCount }}</strong>
                <small>Pieces that still need a human read, compare pass or blocker closure.</small>
              </article>
              <article class="console-header-strip__card">
                <span>Ready to approve</span>
                <strong>{{ readyToApproveCount }}</strong>
                <small>Content that already cleared QA and can receive the final editorial decision.</small>
              </article>
              <article class="console-header-strip__card">
                <span>Reviewer memory</span>
                <strong>{{ feedbackCount }}</strong>
                <small>Latest versions that already contain written editorial context or direction.</small>
              </article>
            </div>
          </div>

          <div class="console-focus-stack">
            <div class="console-surface__head">
              <div>
                <p class="console-surface__eyebrow">Focus now</p>
                <h2 class="console-surface__title">Highest leverage reviews</h2>
              </div>
            </div>

            <div class="console-focus-list" *ngIf="priorityProjects.length; else emptyPriorityProjects">
              <a
                class="console-focus-card"
                *ngFor="let project of priorityProjects.slice(0, 3)"
                [routerLink]="['/studio/projects', project.id]"
              >
                <div>
                  <strong>{{ project.title }}</strong>
                  <p>{{ project.site.name }} · {{ priorityProjectNarrative(project) }}</p>
                </div>
                <span class="console-tag" [ngClass]="reviewTagClass(project.reviewGate.stage)">
                  {{ reviewStageLabel(project.reviewGate.stage) }}
                </span>
              </a>
            </div>
          </div>
        </div>
      </section>

      <div class="console-workspace" *ngIf="!loading; else loadingState">
        <div class="console-workspace__main">
          <section class="console-surface console-surface--editorial">
            <div class="console-surface__head">
              <div>
                <p class="console-surface__eyebrow">Queue</p>
                <h2 class="console-surface__title">Editorial decisions</h2>
              </div>
              <span class="console-tag console-tag--muted">{{ filteredProjects.length }} active items</span>
            </div>

            <form class="console-toolbar console-toolbar--stretch" [formGroup]="filterForm">
              <label class="console-search console-search--wide">
                <span>Search</span>
                <input
                  type="text"
                  formControlName="query"
                  placeholder="Project, blocker, feedback or destination"
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
                  <option value="all">All review</option>
                  <option value="needsReview">Needs review</option>
                  <option value="readyToApprove">Ready to approve</option>
                  <option value="approved">Approved</option>
                </select>
              </label>
            </form>

            <div class="console-list-grid" *ngIf="filteredProjects.length; else emptyReview">
              <article class="console-list-card" *ngFor="let project of filteredProjects">
                <div class="console-version-card__head">
                  <div>
                    <strong>{{ project.title }}</strong>
                    <p>{{ project.site.name }} · {{ project.goal }} · {{ project.primaryLanguage }}</p>
                  </div>
                  <div class="console-version-card__tags">
                    <span class="console-tag" [ngClass]="reviewTagClass(project.reviewGate.stage)">
                      {{ reviewStageLabel(project.reviewGate.stage) }}
                    </span>
                    <span class="console-tag console-tag--muted">{{ project.latestVersion?.qaState || 'not_ready' }}</span>
                  </div>
                </div>

                <p class="console-version-card__body">
                  {{ project.latestVersion?.title || 'Untitled version' }}
                  <ng-container *ngIf="project.latestVersion?.excerpt">
                    · {{ truncate(project.latestVersion?.excerpt, 180) }}
                  </ng-container>
                </p>

                <div class="console-meta-grid">
                  <article class="console-meta-card">
                    <span>Revision memory</span>
                    <strong>{{ project.versionCount }} snapshots</strong>
                  </article>
                  <article class="console-meta-card">
                    <span>QA posture</span>
                    <strong>{{ qaScore(project) }}/100 · {{ qaScoreLabel(project) }}</strong>
                  </article>
                  <article class="console-meta-card">
                    <span>Next action</span>
                    <strong>{{ project.reviewGate.nextAction }}</strong>
                  </article>
                </div>

                <ul
                  class="console-note-list"
                  *ngIf="project.reviewGate.blockers.length || project.reviewGate.warnings.length"
                >
                  <li class="console-note-list__item" *ngFor="let blocker of project.reviewGate.blockers.slice(0, 2)">
                    {{ blocker }}
                  </li>
                  <li class="console-note-list__item" *ngFor="let warning of project.reviewGate.warnings.slice(0, 1)">
                    {{ warning }}
                  </li>
                </ul>

                <div class="console-inline-actions">
                  <a class="console-button console-button--secondary" [routerLink]="['/studio/editorial/articles', project.id]">
                    Open article
                  </a>
                  <a
                    class="console-button console-button--secondary"
                    *ngIf="project.reviewGate.compareReady"
                    [routerLink]="['/studio/editorial/versions', project.id]"
                  >
                    Compare
                  </a>
                  <button
                    type="button"
                    class="console-button"
                    *ngIf="project.reviewGate.approvalReady"
                    (click)="approve(project)"
                    [disabled]="actingProjectId === project.id"
                  >
                    {{ actingProjectId === project.id ? 'Approving...' : 'Approve' }}
                  </button>
                  <a
                    class="console-button"
                    *ngIf="project.reviewGate.stage === 'approved'"
                    [routerLink]="['/studio/publishing/scheduled']"
                  >
                    Open scheduled
                  </a>
                </div>
              </article>
            </div>
          </section>
        </div>

        <aside class="console-workspace__aside">
          <section class="console-surface console-surface--editorial">
            <div class="console-surface__head">
              <div>
                <p class="console-surface__eyebrow">Feedback memory</p>
                <h2 class="console-surface__title">Latest revision notes</h2>
              </div>
            </div>

            <div class="console-feed" *ngIf="feedbackProjects.length; else emptyFeedback">
              <article class="console-feed__item" *ngFor="let project of feedbackProjects">
                <div>
                  <strong>{{ project.title }}</strong>
                  <p>{{ project.site.name }} · {{ reviewStageLabel(project.reviewGate.stage) }}</p>
                </div>
                <small>{{ truncate(project.latestVersion?.feedback, 160) }}</small>
              </article>
            </div>
          </section>

          <section class="console-surface">
            <div class="console-surface__head">
              <div>
                <p class="console-surface__eyebrow">Next handoff</p>
                <h2 class="console-surface__title">Approved for release</h2>
              </div>
            </div>

            <div class="console-action-stack" *ngIf="approvedProjects.length; else emptyApproved">
              <a class="console-action-card" *ngFor="let project of approvedProjects" [routerLink]="['/studio/publishing/scheduled']">
                <div>
                  <strong>{{ project.title }}</strong>
                  <span>{{ project.site.name }} · {{ project.latestVersion?.title || 'Untitled version' }}</span>
                </div>
                <span class="console-tag console-tag--success">Approved</span>
              </a>
            </div>
          </section>
        </aside>
      </div>

      <ng-template #loadingState>
        <section class="console-empty-state">
          <div>
            <p class="console-kicker">Review</p>
            <h2>Loading editor review queue</h2>
            <p>Estamos reuniendo decisiones pendientes, blockers del gate y piezas aprobadas.</p>
          </div>
        </section>
      </ng-template>

      <ng-template #emptyPriorityProjects>
        <div class="console-empty-compact">
          <p>No high-priority review items yet.</p>
        </div>
      </ng-template>

      <ng-template #emptyReview>
        <div class="console-empty-compact">
          <p>No review items match the current filters.</p>
        </div>
      </ng-template>

      <ng-template #emptyFeedback>
        <div class="console-empty-compact">
          <p>No revision notes available yet.</p>
        </div>
      </ng-template>

      <ng-template #emptyApproved>
        <div class="console-empty-compact">
          <p>No approved pieces waiting for release.</p>
        </div>
      </ng-template>
    </section>
  `,
})
export class EditorReviewPageComponent implements OnInit {
  private readonly api = inject(StudioApiService);

  readonly filterForm = new FormGroup({
    query: new FormControl('', { nonNullable: true }),
    siteId: new FormControl('', { nonNullable: true }),
    focus: new FormControl<ReviewFocus>('all', { nonNullable: true }),
  });

  sites: StudioSiteSummary[] = [];
  projects: StudioProjectSummary[] = [];
  filteredProjects: StudioProjectSummary[] = [];
  feedbackProjects: StudioProjectSummary[] = [];
  approvedProjects: StudioProjectSummary[] = [];
  needsActionCount = 0;
  readyToApproveCount = 0;
  approvedCount = 0;
  feedbackCount = 0;
  actingProjectId = '';
  loading = true;
  error = '';
  notice = '';

  get reviewStats(): StudioStatItem[] {
    return [
      {
        label: 'Needs editorial action',
        value: this.needsActionCount,
        detail: 'Piezas que aun requieren lectura humana, compare o cierre de blockers.',
        tone: this.needsActionCount > 0 ? 'warning' : 'muted',
      },
      {
        label: 'Ready to approve',
        value: this.readyToApproveCount,
        detail: 'Contenido que ya paso QA y puede recibir decision editorial final.',
        tone: this.readyToApproveCount > 0 ? 'accent' : 'muted',
      },
      {
        label: 'Approved for release',
        value: this.approvedCount,
        detail: 'Piezas aprobadas que deben pasar a release management o publish.',
        tone: this.approvedCount > 0 ? 'success' : 'muted',
      },
      {
        label: 'With feedback',
        value: this.feedbackCount,
        detail: 'Versiones cuya memoria editorial ya contiene contexto o decision humana.',
        tone: this.feedbackCount > 0 ? 'accent' : 'muted',
      },
    ];
  }

  get reviewNarrative(): string {
    if (!this.projects.length) {
      return 'No hay piezas activas en review. El modulo queda listo para recibir nuevas decisiones editoriales o handoffs desde generation y QA.';
    }

    const blockedCount = this.projects.filter((project) => project.reviewGate.blockerCount > 0).length;

    if (blockedCount > 0) {
      return `${blockedCount} piezas siguen bloqueadas por QA o inputs de release. El trabajo del editor ahora es despejar esos blockers antes de aprobar o programar publish.`;
    }

    if (this.readyToApproveCount > 0) {
      return `${this.readyToApproveCount} piezas ya estan listas para decision editorial final. La cola humana se ha convertido en un lane de cierre, no en una simple lista de snapshots.`;
    }

    if (this.approvedCount > 0) {
      return `${this.approvedCount} piezas ya quedaron aprobadas y esperan handoff hacia release management. Review conserva la memoria humana, pero ya no dicta publish por si solo.`;
    }

    return 'La cola de review esta viva, pero sin blockers criticos. El equipo puede usarla para seguir refinando memoria editorial y asegurar continuidad entre iteraciones.';
  }

  get priorityProjects(): StudioProjectSummary[] {
    return [...this.projects].sort((left, right) => {
      const rankDelta = this.reviewPriorityRank(left) - this.reviewPriorityRank(right);
      if (rankDelta !== 0) {
        return rankDelta;
      }

      return Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
    });
  }

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
        this.projects = projects.items
          .filter((project) =>
            ['needs_review', 'qa_blocked', 'ready_to_approve', 'approved', 'publish_queued'].includes(project.reviewGate.stage),
          )
          .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
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

    this.needsActionCount = this.projects.filter((project) =>
      ['needs_review', 'qa_blocked', 'ready_to_approve'].includes(project.reviewGate.stage),
    ).length;
    this.readyToApproveCount = this.projects.filter((project) => project.reviewGate.approvalReady).length;
    this.approvedCount = this.projects.filter((project) => project.reviewGate.stage === 'approved').length;
    this.feedbackCount = this.projects.filter((project) => Boolean(project.latestVersion?.feedback)).length;

    this.filteredProjects = this.projects.filter((project) => {
      if (siteId && project.siteId !== siteId) {
        return false;
      }

      if (focus === 'needsReview' && !this.needsReview(project.reviewGate.stage)) {
        return false;
      }

      if (focus === 'readyToApprove' && !project.reviewGate.approvalReady) {
        return false;
      }

      if (focus === 'approved' && project.reviewGate.stage !== 'approved') {
        return false;
      }

      if (!query) {
        return true;
      }

      return [
        project.title,
        project.site.name,
        project.latestVersion?.title || '',
        project.latestVersion?.excerpt || '',
        project.latestVersion?.feedback || '',
        project.reviewGate.primaryConcern,
        project.reviewGate.nextAction,
        ...(project.reviewGate.blockers || []),
        ...(project.reviewGate.warnings || []),
      ]
        .join(' ')
        .toLowerCase()
        .includes(query);
    });

    this.feedbackProjects = this.projects
      .filter((project) => Boolean(project.latestVersion?.feedback))
      .filter((project) => !siteId || project.siteId === siteId)
      .slice(0, 6);

    this.approvedProjects = this.projects
      .filter((project) => project.reviewGate.stage === 'approved')
      .filter((project) => !siteId || project.siteId === siteId)
      .slice(0, 6);
  }

  approve(project: StudioProjectSummary): void {
    if (this.actingProjectId || !project.reviewGate.approvalReady) {
      return;
    }

    this.actingProjectId = project.id;
    this.notice = '';
    this.error = '';

    this.api.approveProject(project.id).subscribe({
      next: () => {
        this.actingProjectId = '';
        this.notice = `Project approved: ${project.title}.`;
        this.loadData();
      },
      error: (error) => {
        this.actingProjectId = '';
        this.error = formatApiError(error);
      },
    });
  }

  reviewStageLabel(stage: ReviewGateStage): string {
    return formatReviewStageLabel(stage);
  }

  reviewTagClass(stage: ReviewGateStage): string {
    switch (reviewStageTone(stage)) {
      case 'danger':
        return 'console-tag--danger';
      case 'warning':
        return 'console-tag--warning';
      case 'accent':
        return 'console-tag--accent';
      case 'success':
        return 'console-tag--success';
      case 'muted':
      default:
        return 'console-tag--muted';
    }
  }

  qaScore(project: StudioProjectSummary): number {
    return buildQaScore(project.latestVersion);
  }

  qaScoreLabel(project: StudioProjectSummary): string {
    return formatQaScoreLabel(this.qaScore(project));
  }

  priorityProjectNarrative(project: StudioProjectSummary): string {
    const score = this.qaScore(project);

    if (project.reviewGate.blockerCount > 0) {
      return `${project.reviewGate.blockerCount} blockers · ${project.reviewGate.nextAction}`;
    }

    if (project.reviewGate.approvalReady) {
      return `${score}/100 QA score · Ready for editorial sign-off`;
    }

    if (project.latestVersion?.feedback?.trim()) {
      return `Human note present · ${this.truncate(project.latestVersion.feedback, 96)}`;
    }

    return `${project.reviewGate.warningCount} warnings · ${project.reviewGate.nextAction}`;
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

  private needsReview(stage: ReviewGateStage): boolean {
    return ['needs_review', 'qa_blocked', 'ready_to_approve'].includes(stage);
  }

  private reviewPriorityRank(project: StudioProjectSummary): number {
    if (project.reviewGate.blockerCount > 0) {
      return 0;
    }

    if (project.reviewGate.approvalReady) {
      return 1;
    }

    if (project.latestVersion?.feedback?.trim()) {
      return 2;
    }

    if (project.reviewGate.stage === 'approved') {
      return 3;
    }

    return 4;
  }
}
