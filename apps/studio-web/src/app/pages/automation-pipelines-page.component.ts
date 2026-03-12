import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import type { PublicationListItem, StudioProjectSummary, StudioSiteSummary } from '../models/studio.models';
import { StudioApiService } from '../services/studio-api.service';
import { formatApiError } from '../utils/api-error';

type AutomationFocus = 'all' | 'approval' | 'release' | 'runtime';

type LaneCard = {
  title: string;
  detail: string;
  badge: string;
  link: string[];
};

@Component({
  selector: 'app-automation-pipelines-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  template: `
    <section class="console-page">
      <header class="console-page__header">
        <div class="console-page__copy">
          <p class="console-kicker">Automation</p>
          <h1 class="console-page__title">Pipelines</h1>
          <p class="console-page__intro">
            Superficie híbrida para visualizar handoffs automatizables entre QA, aprobación, release y runtime editorial.
          </p>
        </div>

        <div class="console-page__actions">
          <a class="console-button console-button--secondary" routerLink="/studio/automation/jobs">
            Open jobs
          </a>
          <button type="button" class="console-button" (click)="loadData()">Refresh automation</button>
        </div>
      </header>

      <div class="console-banner console-banner--error" *ngIf="error">{{ error }}</div>

      <div class="console-stat-grid" *ngIf="!loading">
        <article class="console-stat-card">
          <p class="console-stat-card__label">Automation candidates</p>
          <strong class="console-stat-card__value">{{ candidateCount }}</strong>
          <span class="console-stat-card__detail">Piezas que ya están cerca de un tramo automatizable del workflow.</span>
        </article>

        <article class="console-stat-card">
          <p class="console-stat-card__label">Ready to autopush</p>
          <strong class="console-stat-card__value">{{ releaseCandidates.length }}</strong>
          <span class="console-stat-card__detail">Contenido aprobado o en cola donde una policy futura podría intervenir.</span>
        </article>

        <article class="console-stat-card">
          <p class="console-stat-card__label">Runtime jobs</p>
          <strong class="console-stat-card__value">{{ runtimeQueue.length }}</strong>
          <span class="console-stat-card__detail">Tareas activas o recién procesadas que ya viven del lado de ejecución.</span>
        </article>

        <article class="console-stat-card">
          <p class="console-stat-card__label">Failures</p>
          <strong class="console-stat-card__value">{{ failedJobs.length }}</strong>
          <span class="console-stat-card__detail">Incidentes que hoy bloquean cualquier automatización de release.</span>
        </article>
      </div>

      <div class="console-workspace" *ngIf="!loading; else loadingState">
        <div class="console-workspace__main">
          <section class="console-surface">
            <div class="console-surface__head">
              <div>
                <p class="console-surface__eyebrow">Policy board</p>
                <h2 class="console-surface__title">Automation opportunities</h2>
              </div>
            </div>

            <form class="console-toolbar console-toolbar--stretch" [formGroup]="filterForm">
              <label class="console-search console-search--wide">
                <span>Search</span>
                <input
                  type="text"
                  formControlName="query"
                  placeholder="Project, destination or automation stage"
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
                  <option value="all">All pipelines</option>
                  <option value="approval">Approval</option>
                  <option value="release">Release</option>
                  <option value="runtime">Runtime</option>
                </select>
              </label>
            </form>

            <div class="console-pipeline-board">
              <article class="console-pipeline-stage console-pipeline-stage--warning" *ngIf="showApprovalLane">
                <div class="console-pipeline-stage__head">
                  <div class="console-pipeline-stage__copy">
                    <h3 class="console-pipeline-stage__title">Approval gate</h3>
                    <p class="console-pipeline-stage__description">QA pasada, pendiente de decisión humana o policy supervisada.</p>
                  </div>
                  <span class="console-tag console-tag--warning">{{ approvalCandidates.length }}</span>
                </div>

                <div class="console-pipeline-stack" *ngIf="approvalCandidates.length; else emptyApproval">
                  <a class="console-pipeline-card" *ngFor="let card of approvalCandidates" [routerLink]="card.link">
                    <div class="console-pipeline-card__meta">
                      <span class="console-tag console-tag--warning">{{ card.badge }}</span>
                    </div>
                    <div>
                      <strong>{{ card.title }}</strong>
                      <p class="console-pipeline-card__summary">{{ card.detail }}</p>
                    </div>
                  </a>
                </div>
              </article>

              <article class="console-pipeline-stage console-pipeline-stage--accent" *ngIf="showReleaseLane">
                <div class="console-pipeline-stage__head">
                  <div class="console-pipeline-stage__copy">
                    <h3 class="console-pipeline-stage__title">Release automation</h3>
                    <p class="console-pipeline-stage__description">Piezas aprobadas que podrían seguir un autopublish o auto draft sync.</p>
                  </div>
                  <span class="console-tag console-tag--accent">{{ releaseCandidates.length }}</span>
                </div>

                <div class="console-pipeline-stack" *ngIf="releaseCandidates.length; else emptyRelease">
                  <a class="console-pipeline-card" *ngFor="let card of releaseCandidates" [routerLink]="card.link">
                    <div class="console-pipeline-card__meta">
                      <span class="console-tag console-tag--accent">{{ card.badge }}</span>
                    </div>
                    <div>
                      <strong>{{ card.title }}</strong>
                      <p class="console-pipeline-card__summary">{{ card.detail }}</p>
                    </div>
                  </a>
                </div>
              </article>

              <article class="console-pipeline-stage console-pipeline-stage--success" *ngIf="showRuntimeLane">
                <div class="console-pipeline-stage__head">
                  <div class="console-pipeline-stage__copy">
                    <h3 class="console-pipeline-stage__title">Runtime queue</h3>
                    <p class="console-pipeline-stage__description">Jobs reales que ya están ejecutándose o terminando en el runtime editorial.</p>
                  </div>
                  <span class="console-tag console-tag--success">{{ runtimeQueue.length }}</span>
                </div>

                <div class="console-pipeline-stack" *ngIf="runtimeQueue.length; else emptyRuntime">
                  <a class="console-pipeline-card" *ngFor="let card of runtimeQueue" [routerLink]="card.link">
                    <div class="console-pipeline-card__meta">
                      <span class="console-tag console-tag--success">{{ card.badge }}</span>
                    </div>
                    <div>
                      <strong>{{ card.title }}</strong>
                      <p class="console-pipeline-card__summary">{{ card.detail }}</p>
                    </div>
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
                <p class="console-surface__eyebrow">Blocking incidents</p>
                <h2 class="console-surface__title">Automation blockers</h2>
              </div>
            </div>

            <div class="console-feed" *ngIf="failedJobs.length; else emptyFailures">
              <article class="console-feed__item" *ngFor="let job of failedJobs">
                <div>
                  <strong>{{ job.project.title }}</strong>
                  <p>{{ job.site.name }} · {{ job.action }}</p>
                </div>
                <p class="console-feed__error">{{ job.error || 'Unknown runtime failure' }}</p>
              </article>
            </div>
          </section>

          <section class="console-surface">
            <div class="console-surface__head">
              <div>
                <p class="console-surface__eyebrow">Design intent</p>
                <h2 class="console-surface__title">What this surface means today</h2>
              </div>
            </div>

            <ul class="console-note-list">
              <li class="console-note-list__item">
                No existe todavía un motor declarativo de policies; esta vista hace visible dónde tendría sentido introducirlo.
              </li>
              <li class="console-note-list__item">
                Approval y release automation dependen hoy de estados reales, no de una simulación inventada.
              </li>
              <li class="console-note-list__item">
                El siguiente paso de producto es modelar reglas por destino, goal y ventana de publicación.
              </li>
            </ul>
          </section>
        </aside>
      </div>

      <ng-template #loadingState>
        <section class="console-empty-state">
          <div>
            <p class="console-kicker">Automation</p>
            <h2>Loading automation board</h2>
            <p>Estamos agrupando proyectos y runtime jobs para mostrar handoffs automatizables.</p>
          </div>
        </section>
      </ng-template>

      <ng-template #emptyApproval>
        <div class="console-empty-compact">
          <p>No approval automation candidates right now.</p>
        </div>
      </ng-template>

      <ng-template #emptyRelease>
        <div class="console-empty-compact">
          <p>No release automation candidates right now.</p>
        </div>
      </ng-template>

      <ng-template #emptyRuntime>
        <div class="console-empty-compact">
          <p>No runtime jobs in the current automation view.</p>
        </div>
      </ng-template>

      <ng-template #emptyFailures>
        <div class="console-empty-compact">
          <p>No automation blockers detected.</p>
        </div>
      </ng-template>
    </section>
  `,
})
export class AutomationPipelinesPageComponent implements OnInit {
  private readonly api = inject(StudioApiService);

  readonly filterForm = new FormGroup({
    query: new FormControl('', { nonNullable: true }),
    siteId: new FormControl('', { nonNullable: true }),
    focus: new FormControl<AutomationFocus>('all', { nonNullable: true }),
  });

  sites: StudioSiteSummary[] = [];
  projects: StudioProjectSummary[] = [];
  publications: PublicationListItem[] = [];
  approvalCandidates: LaneCard[] = [];
  releaseCandidates: LaneCard[] = [];
  runtimeQueue: LaneCard[] = [];
  failedJobs: PublicationListItem[] = [];
  candidateCount = 0;
  loading = true;
  error = '';

  get showApprovalLane(): boolean {
    return ['all', 'approval'].includes(this.filterForm.controls.focus.value);
  }

  get showReleaseLane(): boolean {
    return ['all', 'release'].includes(this.filterForm.controls.focus.value);
  }

  get showRuntimeLane(): boolean {
    return ['all', 'runtime'].includes(this.filterForm.controls.focus.value);
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
        this.projects = projects.items;
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

    const scopedProjects = this.projects
      .filter((project) => !siteId || project.siteId === siteId)
      .filter((project) => {
        if (!query) {
          return true;
        }

        return [
          project.title,
          project.site.name,
          project.status,
          project.goal,
          project.latestVersion?.title || '',
        ]
          .join(' ')
          .toLowerCase()
          .includes(query);
      });

    const scopedPublications = this.publications
      .filter((item) => !siteId || item.site.id === siteId)
      .filter((item) => {
        if (!query) {
          return true;
        }

        return [
          item.project.title,
          item.site.name,
          item.action,
          item.status,
        ]
          .join(' ')
          .toLowerCase()
          .includes(query);
      });

    this.approvalCandidates = scopedProjects
      .filter((project) => ['qa_passed', 'in_review'].includes(project.status))
      .slice(0, 8)
      .map((project) => ({
        title: project.title,
        detail: `${project.site.name} · ${project.status} · ${project.latestVersion?.title || 'Untitled version'}`,
        badge: project.status === 'qa_passed' ? 'Ready to approve' : 'Human review',
        link: ['/studio/review/editor'],
      }));

    this.releaseCandidates = scopedProjects
      .filter((project) => ['approved', 'publish_queued'].includes(project.status))
      .slice(0, 8)
      .map((project) => ({
        title: project.title,
        detail: `${project.site.name} · ${project.status} · ${project.latestVersion?.title || 'Untitled version'}`,
        badge: project.status === 'approved' ? 'Can autopublish' : 'Queued',
        link: ['/studio/publishing/scheduled'],
      }));

    this.runtimeQueue = scopedPublications
      .filter((item) => ['queued', 'processing', 'draft_synced', 'published'].includes(item.status))
      .slice(0, 8)
      .map((item) => ({
        title: item.project.title,
        detail: `${item.site.name} · ${item.action} · ${item.status}`,
        badge: item.status,
        link: ['/studio/automation/jobs'],
      }));

    this.failedJobs = scopedPublications
      .filter((item) => item.status === 'failed')
      .slice(0, 8);

    this.candidateCount = this.approvalCandidates.length + this.releaseCandidates.length;
  }
}
