import { CommonModule, DatePipe } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import type { ProjectStatus, StudioProjectSummary, StudioSiteSummary } from '../models/studio.models';
import { StudioApiService } from '../services/studio-api.service';
import { formatApiError } from '../utils/api-error';

type ReviewFocus = 'all' | 'awaitingDecision' | 'qaPassed' | 'approved';

@Component({
  selector: 'app-editor-review-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, DatePipe],
  template: `
    <section class="console-page">
      <header class="console-page__header">
        <div class="console-page__copy">
          <p class="console-kicker">Review</p>
          <h1 class="console-page__title">Editor Review</h1>
          <p class="console-page__intro">
            Superficie humana para leer, decidir y aprobar piezas antes de pasar a scheduling o publish.
          </p>
        </div>

        <div class="console-page__actions">
          <a class="console-button console-button--secondary" routerLink="/studio/review/qa">
            QA queue
          </a>
          <button type="button" class="console-button" (click)="loadData()">Refresh review</button>
        </div>
      </header>

      <div class="console-banner console-banner--success" *ngIf="notice">{{ notice }}</div>
      <div class="console-banner console-banner--error" *ngIf="error">{{ error }}</div>

      <div class="console-stat-grid" *ngIf="!loading">
        <article class="console-stat-card">
          <p class="console-stat-card__label">Awaiting decision</p>
          <strong class="console-stat-card__value">{{ awaitingDecisionCount }}</strong>
          <span class="console-stat-card__detail">Piezas activas que esperan lectura o cierre editorial humano.</span>
        </article>

        <article class="console-stat-card">
          <p class="console-stat-card__label">Ready to approve</p>
          <strong class="console-stat-card__value">{{ qaPassedCount }}</strong>
          <span class="console-stat-card__detail">Contenido con QA pasado y listo para decisión final.</span>
        </article>

        <article class="console-stat-card">
          <p class="console-stat-card__label">Approved</p>
          <strong class="console-stat-card__value">{{ approvedCount }}</strong>
          <span class="console-stat-card__detail">Piezas ya aprobadas que deben pasar a release management.</span>
        </article>

        <article class="console-stat-card">
          <p class="console-stat-card__label">With feedback</p>
          <strong class="console-stat-card__value">{{ feedbackCount }}</strong>
          <span class="console-stat-card__detail">Versiones cuya memoria editorial ya contiene instrucciones o contexto humano.</span>
        </article>
      </div>

      <div class="console-workspace" *ngIf="!loading; else loadingState">
        <div class="console-workspace__main">
          <section class="console-surface">
            <div class="console-surface__head">
              <div>
                <p class="console-surface__eyebrow">Queue</p>
                <h2 class="console-surface__title">Editorial decisions</h2>
              </div>
            </div>

            <form class="console-toolbar console-toolbar--stretch" [formGroup]="filterForm">
              <label class="console-search console-search--wide">
                <span>Search</span>
                <input
                  type="text"
                  formControlName="query"
                  placeholder="Project, excerpt, destination or feedback"
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
                  <option value="awaitingDecision">Awaiting decision</option>
                  <option value="qaPassed">QA passed</option>
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
                    <span
                      class="console-tag"
                      [class.console-tag--warning]="project.status === 'in_review'"
                      [class.console-tag--accent]="project.status === 'qa_passed'"
                      [class.console-tag--success]="project.status === 'approved'"
                    >
                      {{ statusLabel(project.status) }}
                    </span>
                    <span class="console-tag console-tag--muted">
                      {{ project.latestVersion?.qaState || 'not_ready' }}
                    </span>
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
                    <span>Updated</span>
                    <strong>{{ project.updatedAt | date: 'short' }}</strong>
                  </article>
                  <article class="console-meta-card">
                    <span>Feedback memory</span>
                    <strong>{{ project.latestVersion?.feedback ? 'Available' : 'No feedback yet' }}</strong>
                  </article>
                </div>

                <div class="console-inline-actions">
                  <a class="console-button console-button--secondary" [routerLink]="['/studio/editorial/articles', project.id]">
                    Open article
                  </a>
                  <button
                    type="button"
                    class="console-button"
                    *ngIf="project.status === 'qa_passed'"
                    (click)="approve(project)"
                    [disabled]="actingProjectId === project.id"
                  >
                    {{ actingProjectId === project.id ? 'Approving...' : 'Approve' }}
                  </button>
                  <a
                    class="console-button"
                    *ngIf="project.status === 'approved'"
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
          <section class="console-surface">
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
                  <p>{{ project.site.name }} · {{ project.latestVersion?.status || project.status }}</p>
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
            <p>Estamos reuniendo decisiones pendientes, feedback reciente y piezas aprobadas.</p>
          </div>
        </section>
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
  awaitingDecisionCount = 0;
  qaPassedCount = 0;
  approvedCount = 0;
  feedbackCount = 0;
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
        this.projects = projects.items
          .filter((project) => ['in_review', 'qa_passed', 'approved'].includes(project.status))
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

    this.awaitingDecisionCount = this.projects.filter((project) =>
      ['in_review', 'qa_passed'].includes(project.status),
    ).length;
    this.qaPassedCount = this.projects.filter((project) => project.status === 'qa_passed').length;
    this.approvedCount = this.projects.filter((project) => project.status === 'approved').length;
    this.feedbackCount = this.projects.filter((project) => Boolean(project.latestVersion?.feedback)).length;

    this.filteredProjects = this.projects.filter((project) => {
      if (siteId && project.siteId !== siteId) {
        return false;
      }

      if (focus === 'awaitingDecision' && !['in_review', 'qa_passed'].includes(project.status)) {
        return false;
      }

      if (focus === 'qaPassed' && project.status !== 'qa_passed') {
        return false;
      }

      if (focus === 'approved' && project.status !== 'approved') {
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
        project.latestVersion?.excerpt || '',
        project.latestVersion?.feedback || '',
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
      .filter((project) => project.status === 'approved')
      .filter((project) => !siteId || project.siteId === siteId)
      .slice(0, 6);
  }

  approve(project: StudioProjectSummary): void {
    if (this.actingProjectId) {
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
}
