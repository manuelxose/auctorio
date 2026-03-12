import { CommonModule, DatePipe } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import type {
  ProjectStatus,
  PublicationListItem,
  StudioProjectSummary,
  StudioSiteSummary,
} from '../models/studio.models';
import { StudioApiService } from '../services/studio-api.service';
import { formatApiError } from '../utils/api-error';

type ReleaseFocus = 'all' | 'ready' | 'queued' | 'live';

@Component({
  selector: 'app-scheduled-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, DatePipe],
  template: `
    <section class="console-page">
      <header class="console-page__header">
        <div class="console-page__copy">
          <p class="console-kicker">Publishing</p>
          <h1 class="console-page__title">Scheduled</h1>
          <p class="console-page__intro">
            Release manager para piezas aprobadas, draft syncs y publicaciones en cola antes de llegar a history.
          </p>
        </div>

        <div class="console-page__actions">
          <a class="console-button console-button--secondary" routerLink="/studio/publishing/history">
            Open history
          </a>
          <button type="button" class="console-button" (click)="loadData()">Refresh schedule</button>
        </div>
      </header>

      <div class="console-banner console-banner--success" *ngIf="notice">{{ notice }}</div>
      <div class="console-banner console-banner--error" *ngIf="error">{{ error }}</div>

      <div class="console-stat-grid" *ngIf="!loading">
        <article class="console-stat-card">
          <p class="console-stat-card__label">Ready to ship</p>
          <strong class="console-stat-card__value">{{ readyCount }}</strong>
          <span class="console-stat-card__detail">Piezas aprobadas listas para draft sync o publish definitivo.</span>
        </article>

        <article class="console-stat-card">
          <p class="console-stat-card__label">Queued jobs</p>
          <strong class="console-stat-card__value">{{ queuedCount }}</strong>
          <span class="console-stat-card__detail">Jobs ya enviados al runtime y pendientes de completar.</span>
        </article>

        <article class="console-stat-card">
          <p class="console-stat-card__label">Draft synced</p>
          <strong class="console-stat-card__value">{{ draftSyncedCount }}</strong>
          <span class="console-stat-card__detail">Salidas guardadas en borrador como paso previo a publicación final.</span>
        </article>

        <article class="console-stat-card">
          <p class="console-stat-card__label">Live content</p>
          <strong class="console-stat-card__value">{{ liveCount }}</strong>
          <span class="console-stat-card__detail">Piezas cuya última versión ya se encuentra publicada.</span>
        </article>
      </div>

      <div class="console-workspace" *ngIf="!loading; else loadingState">
        <div class="console-workspace__main">
          <section class="console-surface">
            <div class="console-surface__head">
              <div>
                <p class="console-surface__eyebrow">Release queue</p>
                <h2 class="console-surface__title">Scheduled and ready items</h2>
              </div>
            </div>

            <form class="console-toolbar console-toolbar--stretch" [formGroup]="filterForm">
              <label class="console-search console-search--wide">
                <span>Search</span>
                <input
                  type="text"
                  formControlName="query"
                  placeholder="Project, destination or version title"
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
                  <option value="all">All release</option>
                  <option value="ready">Ready</option>
                  <option value="queued">Queued</option>
                  <option value="live">Live</option>
                </select>
              </label>
            </form>

            <div class="console-list-grid" *ngIf="filteredProjects.length; else emptyRelease">
              <article class="console-list-card" *ngFor="let project of filteredProjects">
                <div class="console-version-card__head">
                  <div>
                    <strong>{{ project.title }}</strong>
                    <p>{{ project.site.name }} · {{ project.goal }} · V{{ project.latestVersion?.versionNumber || 0 }}</p>
                  </div>
                  <div class="console-version-card__tags">
                    <span
                      class="console-tag"
                      [class.console-tag--success]="project.status === 'published'"
                      [class.console-tag--accent]="project.status === 'publish_queued'"
                      [class.console-tag--warning]="project.status === 'approved'"
                    >
                      {{ statusLabel(project.status) }}
                    </span>
                    <span class="console-tag console-tag--muted">
                      {{ project.latestPublicationJob?.status || 'not queued' }}
                    </span>
                  </div>
                </div>

                <p class="console-version-card__body">
                  {{ project.latestVersion?.title || 'Untitled version' }}
                </p>

                <div class="console-inline-actions">
                  <button
                    type="button"
                    class="console-button console-button--secondary"
                    *ngIf="project.status === 'approved'"
                    (click)="syncDraft(project)"
                    [disabled]="actingProjectId === project.id"
                  >
                    {{ actingProjectId === project.id ? 'Submitting...' : 'Sync draft' }}
                  </button>
                  <button
                    type="button"
                    class="console-button"
                    *ngIf="project.status === 'approved'"
                    (click)="publish(project)"
                    [disabled]="actingProjectId === project.id"
                  >
                    {{ actingProjectId === project.id ? 'Submitting...' : 'Publish' }}
                  </button>
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
                <p class="console-surface__eyebrow">In flight</p>
                <h2 class="console-surface__title">Latest runtime jobs</h2>
              </div>
            </div>

            <div class="console-feed" *ngIf="runtimeItems.length; else emptyRuntime">
              <article class="console-feed__item" *ngFor="let item of runtimeItems">
                <div>
                  <strong>{{ item.project.title }}</strong>
                  <p>{{ item.site.name }} · {{ item.action }} · {{ item.status }}</p>
                </div>
                <span>{{ item.updatedAt | date: 'short' }}</span>
              </article>
            </div>
          </section>

          <section class="console-surface">
            <div class="console-surface__head">
              <div>
                <p class="console-surface__eyebrow">Playbook</p>
                <h2 class="console-surface__title">Release rules</h2>
              </div>
            </div>

            <ul class="console-note-list">
              <li class="console-note-list__item">
                Solo las versiones aprobadas deben iniciar draft sync o publish desde esta superficie.
              </li>
              <li class="console-note-list__item">
                Publish queued indica handoff al runtime; History confirma el resultado final.
              </li>
              <li class="console-note-list__item">
                Cuando exista calendario real, esta pantalla absorberá ventanas de salida y programación temporal.
              </li>
            </ul>
          </section>
        </aside>
      </div>

      <ng-template #loadingState>
        <section class="console-empty-state">
          <div>
            <p class="console-kicker">Publishing</p>
            <h2>Loading scheduled surface</h2>
            <p>Estamos cruzando piezas aprobadas con publication jobs para componer la release queue.</p>
          </div>
        </section>
      </ng-template>

      <ng-template #emptyRelease>
        <div class="console-empty-compact">
          <p>No release items match the current filters.</p>
        </div>
      </ng-template>

      <ng-template #emptyRuntime>
        <div class="console-empty-compact">
          <p>No runtime jobs in flight right now.</p>
        </div>
      </ng-template>
    </section>
  `,
})
export class ScheduledPageComponent implements OnInit {
  private readonly api = inject(StudioApiService);

  readonly filterForm = new FormGroup({
    query: new FormControl('', { nonNullable: true }),
    siteId: new FormControl('', { nonNullable: true }),
    focus: new FormControl<ReleaseFocus>('all', { nonNullable: true }),
  });

  sites: StudioSiteSummary[] = [];
  projects: StudioProjectSummary[] = [];
  publications: PublicationListItem[] = [];
  filteredProjects: StudioProjectSummary[] = [];
  runtimeItems: PublicationListItem[] = [];
  readyCount = 0;
  queuedCount = 0;
  draftSyncedCount = 0;
  liveCount = 0;
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
      publications: this.api.listPublications(1, 100),
    }).subscribe({
      next: ({ sites, projects, publications }) => {
        this.sites = sites.items;
        this.projects = projects.items
          .filter((project) => ['approved', 'publish_queued', 'published'].includes(project.status))
          .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
        this.publications = publications.items.sort(
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

    this.readyCount = this.projects.filter((project) => project.status === 'approved').length;
    this.queuedCount = this.publications.filter((item) =>
      ['queued', 'processing'].includes(item.status),
    ).length;
    this.draftSyncedCount = this.publications.filter(
      (item) => item.status === 'draft_synced',
    ).length;
    this.liveCount = this.projects.filter((project) => project.status === 'published').length;

    this.filteredProjects = this.projects.filter((project) => {
      if (siteId && project.siteId !== siteId) {
        return false;
      }

      if (focus === 'ready' && project.status !== 'approved') {
        return false;
      }

      if (focus === 'queued' && project.status !== 'publish_queued') {
        return false;
      }

      if (focus === 'live' && project.status !== 'published') {
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

    this.runtimeItems = this.publications
      .filter((item) => ['queued', 'processing', 'draft_synced'].includes(item.status))
      .filter((item) => !siteId || item.site.id === siteId)
      .filter((item) => {
        if (!query) {
          return true;
        }

        return [
          item.project.title,
          item.site.name,
          item.status,
          item.action,
        ]
          .join(' ')
          .toLowerCase()
          .includes(query);
      })
      .slice(0, 8);
  }

  syncDraft(project: StudioProjectSummary): void {
    this.runReleaseAction(project, {
      action: 'update',
      targetStatus: 'draft',
    }, `Draft sync launched for ${project.title}.`);
  }

  publish(project: StudioProjectSummary): void {
    this.runReleaseAction(project, {
      action: 'publish',
      targetStatus: 'publish',
    }, `Publish launched for ${project.title}.`);
  }

  statusLabel(status: ProjectStatus): string {
    const labels: Record<ProjectStatus, string> = {
      draft: 'Draft',
      ai_generated: 'AI generated',
      qa_failed: 'QA failed',
      qa_passed: 'QA passed',
      in_review: 'In review',
      approved: 'Approved',
      publish_queued: 'Queued',
      published: 'Published',
      publish_failed: 'Publish failed',
    };

    return labels[status];
  }

  private runReleaseAction(
    project: StudioProjectSummary,
    payload: { action: 'publish' | 'update'; targetStatus: 'draft' | 'publish' },
    notice: string,
  ): void {
    if (this.actingProjectId) {
      return;
    }

    this.actingProjectId = project.id;
    this.notice = '';
    this.error = '';

    this.api.publishProject(project.id, payload).subscribe({
      next: () => {
        this.actingProjectId = '';
        this.notice = notice;
        this.loadData();
      },
      error: (error) => {
        this.actingProjectId = '';
        this.error = formatApiError(error);
      },
    });
  }
}
