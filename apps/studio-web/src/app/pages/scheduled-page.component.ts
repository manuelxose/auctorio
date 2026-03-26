import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { StudioEmptyStateComponent } from '../components/studio-empty-state.component';
import { StudioPageHeaderComponent } from '../components/studio-page-header.component';
import { StudioSidePanelComponent } from '../components/studio-side-panel.component';
import { StudioStatStripComponent, type StudioStatItem } from '../components/studio-stat-strip.component';
import type {
  PublicationListItem,
  PublicationStatus,
  ReviewGateStage,
  StudioProjectSummary,
  StudioSiteSummary,
} from '../models/studio.models';
import { StudioApiService } from '../services/studio-api.service';
import { formatApiError } from '../utils/api-error';
import {
  reviewStageLabel as formatReviewStageLabel,
  reviewStageTone as getReviewStageTone,
} from '../utils/review-gate';

type ReleaseFocus = 'all' | 'ready' | 'queued' | 'live' | 'retry';

@Component({
  selector: 'app-scheduled-page',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterLink,
    StudioEmptyStateComponent,
    StudioPageHeaderComponent,
    StudioSidePanelComponent,
    StudioStatStripComponent,
  ],
  template: `
    <section class="console-page">
      <app-studio-page-header
        kicker="Publishing"
        title="Scheduled"
        intro="Release manager para piezas aprobadas, draft syncs, retries y publicaciones en cola antes de llegar a history."
      >
        <div page-meta *ngIf="!loading">
          <span class="console-tag console-tag--accent">{{ readyCount }} ready</span>
          <span class="console-tag console-tag--muted">{{ queuedCount }} queued</span>
          <span class="console-tag" [ngClass]="runtimeIncidentCount > 0 ? 'console-tag--danger' : 'console-tag--success'">
            {{ runtimeIncidentCount }} incidents
          </span>
        </div>

        <a page-actions class="console-button console-button--secondary" routerLink="/studio/publishing/destinations">
          Open destinations
        </a>
        <a page-actions class="console-button console-button--secondary" routerLink="/studio/publishing/history">
          Open history
        </a>
        <button page-actions type="button" class="console-button" (click)="loadData()">Refresh schedule</button>
      </app-studio-page-header>

      <div class="console-banner console-banner--success" *ngIf="notice">{{ notice }}</div>
      <div class="console-banner console-banner--error" *ngIf="error">{{ error }}</div>

      <app-studio-stat-strip *ngIf="!loading" [items]="stats"></app-studio-stat-strip>

      <section class="console-surface console-surface--hero" *ngIf="!loading">
        <div class="console-hero-grid">
          <div class="console-hero-copy">
            <p class="console-surface__eyebrow">Release posture</p>
            <h2 class="console-surface__title">Editorial handoff across approval, runtime queue and final publish</h2>
            <p class="console-hero-copy__body">{{ releaseNarrative }}</p>

            <div class="console-header-strip">
              <article class="console-header-strip__card">
                <span>Ready to ship</span>
                <strong>{{ readyCount }}</strong>
                <small>Piezas aprobadas y publicables que pueden iniciar draft sync o publish final.</small>
              </article>
              <article class="console-header-strip__card">
                <span>Runtime queue</span>
                <strong>{{ queuedCount }}</strong>
                <small>Jobs ya entregados al runtime y aún pendientes de cerrar resultado final.</small>
              </article>
              <article class="console-header-strip__card">
                <span>Retry candidates</span>
                <strong>{{ retryCount }}</strong>
                <small>{{ runtimeIncidentCount }} incident{{ runtimeIncidentCount === 1 ? '' : 's' }} still visible in publication history.</small>
              </article>
            </div>
          </div>

          <div class="console-focus-stack">
            <div class="console-surface__head">
              <div>
                <p class="console-surface__eyebrow">Focus now</p>
                <h2 class="console-surface__title">Release watchlist</h2>
              </div>
            </div>

            <div class="console-focus-list">
              <button
                type="button"
                class="console-focus-card console-focus-card--button"
                [disabled]="readyCount === 0"
                (click)="applyFocus('ready')"
              >
                <div>
                  <strong>{{ readyCount === 0 ? 'Ready queue clear' : 'Ready to ship' }}</strong>
                  <p>
                    {{
                      readyCount === 0
                        ? 'No approved piece is currently waiting for draft sync or publish.'
                        : readyCount + ' release candidate' + (readyCount === 1 ? '' : 's') + ' can move to runtime now.'
                    }}
                  </p>
                </div>
                <span class="console-tag" [ngClass]="readyCount === 0 ? 'console-tag--success' : 'console-tag--accent'">
                  {{ readyCount === 0 ? 'Healthy' : 'Ship now' }}
                </span>
              </button>

              <button
                type="button"
                class="console-focus-card console-focus-card--button"
                [disabled]="retryCount === 0"
                (click)="applyFocus('retry')"
              >
                <div>
                  <strong>{{ retryCount === 0 ? 'Retry lane clear' : 'Retry publish' }}</strong>
                  <p>
                    {{
                      retryCount === 0
                        ? 'No failed publish or runtime incident currently needs a retry handoff.'
                        : retryCount + ' piece' + (retryCount === 1 ? '' : 's') + ' need retry or incident review before release is healthy.'
                    }}
                  </p>
                </div>
                <span class="console-tag" [ngClass]="retryCount === 0 ? 'console-tag--success' : 'console-tag--danger'">
                  {{ retryCount === 0 ? 'Healthy' : 'Needs retry' }}
                </span>
              </button>

              <a class="console-focus-card" routerLink="/studio/publishing/history">
                <div>
                  <strong>Runtime history</strong>
                  <p>{{ runtimeItems.length }} recent runtime signal{{ runtimeItems.length === 1 ? '' : 's' }} are already visible from this release lane.</p>
                </div>
                <span class="console-tag console-tag--muted">Open history</span>
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
                <p class="console-surface__eyebrow">Release queue</p>
                <h2 class="console-surface__title">Scheduled and ready items</h2>
              </div>
              <span class="console-tag console-tag--muted">{{ filteredProjects.length }} visible items</span>
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
                  <option value="retry">Retry</option>
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
                    <span class="console-tag" [ngClass]="reviewStageTagClass(project.reviewGate.stage)">
                      {{ reviewStageLabel(project.reviewGate.stage) }}
                    </span>
                    <span class="console-tag" [ngClass]="publicationTagClass(project.latestPublicationJob?.status || null)">
                      {{ project.latestPublicationJob?.status || 'not queued' }}
                    </span>
                  </div>
                </div>

                <p class="console-version-card__body">
                  {{ project.latestVersion?.title || 'Untitled version' }} · {{ project.reviewGate.nextAction }}
                </p>

                <div class="console-meta-grid">
                  <article class="console-meta-card">
                    <span>Release posture</span>
                    <strong>{{ projectReleasePosture(project) }}</strong>
                  </article>
                  <article class="console-meta-card">
                    <span>Runtime</span>
                    <strong>{{ project.latestPublicationJob?.action || 'No job yet' }}</strong>
                  </article>
                </div>

                <ul class="console-note-list" *ngIf="project.reviewGate.blockers.length || project.reviewGate.warnings.length">
                  <li class="console-note-list__item" *ngFor="let blocker of project.reviewGate.blockers.slice(0, 2)">
                    {{ blocker }}
                  </li>
                  <li class="console-note-list__item" *ngFor="let warning of project.reviewGate.warnings.slice(0, 1)">
                    {{ warning }}
                  </li>
                </ul>

                <div class="console-inline-actions">
                  <button
                    type="button"
                    class="console-button console-button--secondary"
                    *ngIf="canRelease(project)"
                    (click)="syncDraft(project)"
                    [disabled]="actingProjectId === project.id"
                  >
                    {{ actingProjectId === project.id ? 'Submitting...' : 'Sync draft' }}
                  </button>
                  <button
                    type="button"
                    class="console-button"
                    *ngIf="canRelease(project)"
                    (click)="publish(project)"
                    [disabled]="actingProjectId === project.id"
                  >
                    {{ actingProjectId === project.id ? 'Submitting...' : publishLabel(project) }}
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
          <app-studio-side-panel eyebrow="Runtime" title="Latest runtime jobs">
            <div class="console-feed" *ngIf="runtimeItems.length; else emptyRuntime">
              <article class="console-feed__item" *ngFor="let item of runtimeItems">
                <div>
                  <strong>{{ item.project.title }}</strong>
                  <p>{{ item.site.name }} · {{ item.action }} · {{ item.status }}</p>
                </div>
                <span class="console-tag" [ngClass]="publicationTagClass(item.status)">
                  {{ formatDate(item.updatedAt) }}
                </span>
              </article>
            </div>
          </app-studio-side-panel>

          <app-studio-side-panel eyebrow="Playbook" title="Release rules">
            <ul class="console-note-list">
              <li class="console-note-list__item">
                Solo las versiones aprobadas y publish-ready deben iniciar draft sync o publish desde esta superficie.
              </li>
              <li class="console-note-list__item">
                Publish queued indica handoff al runtime; History confirma resultado y trazabilidad final.
              </li>
              <li class="console-note-list__item">
                Retry existe para errores reales de runtime o publish fail, no para maquillar blockers editoriales.
              </li>
            </ul>
          </app-studio-side-panel>
        </aside>
      </div>

      <ng-template #loadingState>
        <app-studio-empty-state
          kicker="Publishing"
          title="Loading scheduled surface"
          body="Estamos cruzando piezas aprobadas con publication jobs para componer la release queue."
        ></app-studio-empty-state>
      </ng-template>

      <ng-template #emptyRelease>
        <app-studio-empty-state
          kicker="Publishing"
          title="No release items match the current view"
          body="Ajusta filtros o vuelve a la cola editorial para seguir empujando piezas hacia publish."
        ></app-studio-empty-state>
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
  stats: StudioStatItem[] = [];
  readyCount = 0;
  queuedCount = 0;
  draftSyncedCount = 0;
  liveCount = 0;
  retryCount = 0;
  runtimeIncidentCount = 0;
  actingProjectId = '';
  loading = true;
  error = '';
  notice = '';

  get releaseNarrative(): string {
    if (!this.projects.length) {
      return 'Todavía no hay piezas suficientemente maduras para entrar en release management. El flujo editorial sigue sin entregar candidatos reales a publish.';
    }

    if (this.runtimeIncidentCount > 0) {
      return `${this.runtimeIncidentCount} incidente${this.runtimeIncidentCount === 1 ? '' : 's'} runtime siguen visibles en publishing. Scheduled ya no debe ser solo cola: tiene que enseñar también el riesgo operativo del handoff final.`;
    }

    if (this.retryCount > 0) {
      return `${this.retryCount} pieza${this.retryCount === 1 ? '' : 's'} siguen en carril de retry. La deuda ya no está en generar contenido, sino en cerrar el tramo final de release con trazabilidad honesta.`;
    }

    if (this.readyCount > 0) {
      return `${this.readyCount} release candidate${this.readyCount === 1 ? '' : 's'} están listos para draft sync o publish. Scheduled ya actúa como handoff real entre approval y runtime.`;
    }

    return `${this.liveCount} pieza${this.liveCount === 1 ? '' : 's'} ya están publicadas y ${this.queuedCount} job${this.queuedCount === 1 ? '' : 's'} siguen en runtime. La superficie ya se parece a un release manager editorial, no a un listado de botones.`;
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
      publications: this.api.listPublications(1, 100),
    }).subscribe({
      next: ({ sites, projects, publications }) => {
        this.sites = sites.items;
        this.projects = projects.items
          .filter((project) =>
            ['approved', 'publish_queued', 'published', 'publish_failed'].includes(project.reviewGate.stage),
          )
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

  applyFocus(focus: Exclude<ReleaseFocus, 'all'>): void {
    this.filterForm.controls.focus.setValue(focus);
    this.applyFilters();
  }

  applyFilters(): void {
    const query = this.filterForm.controls.query.value.trim().toLowerCase();
    const siteId = this.filterForm.controls.siteId.value;
    const focus = this.filterForm.controls.focus.value;

    this.readyCount = this.projects.filter((project) => this.canRelease(project)).length;
    this.queuedCount = this.publications.filter((item) => ['queued', 'processing'].includes(item.status)).length;
    this.draftSyncedCount = this.publications.filter((item) => item.status === 'draft_synced').length;
    this.liveCount = this.projects.filter((project) => project.reviewGate.stage === 'published').length;
    this.retryCount = this.projects.filter((project) => this.needsRetry(project)).length;
    this.runtimeIncidentCount = this.publications.filter((item) => item.status === 'failed').length;
    this.stats = [
      {
        label: 'Ready to ship',
        value: this.readyCount,
        detail: 'Piezas aprobadas listas para draft sync o publish definitivo.',
        tone: this.readyCount > 0 ? 'accent' : 'muted',
      },
      {
        label: 'Queued jobs',
        value: this.queuedCount,
        detail: 'Jobs ya enviados al runtime y pendientes de cerrar resultado.',
        tone: this.queuedCount > 0 ? 'warning' : 'muted',
      },
      {
        label: 'Draft synced',
        value: this.draftSyncedCount,
        detail: 'Salidas guardadas en borrador como paso previo a publicación final.',
        tone: this.draftSyncedCount > 0 ? 'muted' : 'muted',
      },
      {
        label: 'Runtime incidents',
        value: this.runtimeIncidentCount,
        detail: 'Fallos visibles en publication history que todavía contaminan el release lane.',
        tone: this.runtimeIncidentCount > 0 ? 'danger' : 'success',
      },
    ];

    this.filteredProjects = this.projects.filter((project) => {
      if (siteId && project.siteId !== siteId) {
        return false;
      }

      if (focus === 'ready' && !this.canRelease(project)) {
        return false;
      }

      if (focus === 'queued' && project.reviewGate.stage !== 'publish_queued') {
        return false;
      }

      if (focus === 'retry' && !this.needsRetry(project)) {
        return false;
      }

      if (focus === 'live' && project.reviewGate.stage !== 'published') {
        return false;
      }

      if (!query) {
        return true;
      }

      return [
        project.title,
        project.site.name,
        project.reviewGate.stage,
        project.latestVersion?.title || '',
        project.reviewGate.nextAction,
        project.latestPublicationJob?.status || '',
        ...(project.reviewGate.blockers || []),
        ...(project.reviewGate.warnings || []),
      ]
        .join(' ')
        .toLowerCase()
        .includes(query);
    });

    this.runtimeItems = this.publications
      .filter((item) => ['queued', 'processing', 'draft_synced', 'failed'].includes(item.status))
      .filter((item) => !siteId || item.site.id === siteId)
      .filter((item) => {
        if (!query) {
          return true;
        }

        return [item.project.title, item.site.name, item.status, item.action]
          .join(' ')
          .toLowerCase()
          .includes(query);
      })
      .slice(0, 8);
  }

  syncDraft(project: StudioProjectSummary): void {
    this.runReleaseAction(
      project,
      {
        action: 'update',
        targetStatus: 'draft',
      },
      `Draft sync launched for ${project.title}.`,
    );
  }

  publish(project: StudioProjectSummary): void {
    this.runReleaseAction(
      project,
      {
        action: 'publish',
        targetStatus: 'publish',
      },
      `${this.publishLabel(project)} launched for ${project.title}.`,
    );
  }

  reviewStageLabel(stage: ReviewGateStage): string {
    return formatReviewStageLabel(stage);
  }

  reviewStageTagClass(stage: ReviewGateStage): string {
    switch (getReviewStageTone(stage)) {
      case 'success':
        return 'console-tag--success';
      case 'accent':
        return 'console-tag--accent';
      case 'warning':
        return 'console-tag--warning';
      case 'danger':
        return 'console-tag--danger';
      case 'muted':
      default:
        return 'console-tag--muted';
    }
  }

  publicationTagClass(status: PublicationStatus | null): string {
    switch (status) {
      case 'published':
        return 'console-tag--success';
      case 'queued':
      case 'processing':
        return 'console-tag--warning';
      case 'draft_synced':
        return 'console-tag--accent';
      case 'failed':
        return 'console-tag--danger';
      case 'canceled':
      case null:
      default:
        return 'console-tag--muted';
    }
  }

  canRelease(project: StudioProjectSummary): boolean {
    return project.reviewGate.publishReady && ['approved', 'publish_failed'].includes(project.reviewGate.stage);
  }

  needsRetry(project: StudioProjectSummary): boolean {
    return project.reviewGate.stage === 'publish_failed' || project.latestPublicationJob?.status === 'failed';
  }

  publishLabel(project: StudioProjectSummary): string {
    return project.reviewGate.stage === 'publish_failed' ? 'Retry publish' : 'Publish';
  }

  projectReleasePosture(project: StudioProjectSummary): string {
    if (this.canRelease(project)) {
      return project.reviewGate.stage === 'publish_failed' ? 'Ready for retry' : 'Ready for publish';
    }
    if (project.reviewGate.stage === 'publish_queued') {
      return 'In runtime queue';
    }
    if (project.reviewGate.stage === 'published') {
      return 'Live';
    }
    return project.reviewGate.primaryConcern;
  }

  formatDate(value: string): string {
    return new Date(value).toLocaleString();
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
