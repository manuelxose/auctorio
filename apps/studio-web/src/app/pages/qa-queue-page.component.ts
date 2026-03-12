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

type QaFocus = 'all' | 'fixes' | 'review' | 'ready';
type TagTone = 'muted' | 'accent' | 'warning' | 'success' | 'danger';

type QueueRow = {
  id: string;
  title: string;
  siteName: string;
  status: string;
  tone: TagTone;
  summary: string;
  updatedAt: string;
  link: string[];
};

type CheckSignal = {
  key: string;
  count: number;
  severity: 'error' | 'warning';
  latestMessage: string;
};

const REVIEW_STATUSES = new Set<ProjectStatus>(['in_review', 'qa_passed', 'approved']);
const BASE_QUEUE_STATUSES = new Set<ProjectStatus>([
  'qa_failed',
  'qa_passed',
  'approved',
  'in_review',
  'publish_failed',
]);

@Component({
  selector: 'app-qa-queue-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, DatePipe],
  template: `
    <section class="console-page">
      <header class="console-page__header">
        <div class="console-page__copy">
          <p class="console-kicker">Review</p>
          <h1 class="console-page__title">QA Queue</h1>
          <p class="console-page__intro">
            Triage operativo para bloqueos de calidad, decisiones editoriales y fallos de release antes de publicar.
          </p>
        </div>

        <div class="console-page__actions">
          <a class="console-button console-button--secondary" routerLink="/studio/editorial/pipeline">
            Open pipeline
          </a>
          <button type="button" class="console-button" (click)="loadData()">Refresh queue</button>
        </div>
      </header>

      <div class="console-banner console-banner--error" *ngIf="error">{{ error }}</div>

      <div class="console-stat-grid" *ngIf="!loading">
        <article class="console-stat-card">
          <p class="console-stat-card__label">Needs fixes</p>
          <strong class="console-stat-card__value">{{ fixesCount }}</strong>
          <span class="console-stat-card__detail">Piezas bloqueadas por QA o por un publish fallido.</span>
        </article>

        <article class="console-stat-card">
          <p class="console-stat-card__label">Human decisions</p>
          <strong class="console-stat-card__value">{{ humanDecisionCount }}</strong>
          <span class="console-stat-card__detail">Contenido esperando lectura, aprobacion o cierre editorial.</span>
        </article>

        <article class="console-stat-card">
          <p class="console-stat-card__label">Ready to release</p>
          <strong class="console-stat-card__value">{{ readyCount }}</strong>
          <span class="console-stat-card__detail">Piezas ya validadas y listas para schedule o publish.</span>
        </article>

        <article class="console-stat-card">
          <p class="console-stat-card__label">Runtime incidents</p>
          <strong class="console-stat-card__value">{{ runtimeIncidentCount }}</strong>
          <span class="console-stat-card__detail">Ejecuciones de publicacion fallidas en la ventana observada.</span>
        </article>
      </div>

      <div class="console-workspace" *ngIf="!loading; else loadingState">
        <div class="console-workspace__main">
          <section class="console-surface">
            <div class="console-surface__head">
              <div>
                <p class="console-surface__eyebrow">Queue</p>
                <h2 class="console-surface__title">Priority triage</h2>
              </div>
            </div>

            <form class="console-toolbar console-toolbar--stretch" [formGroup]="filterForm">
              <label class="console-search console-search--wide">
                <span>Search</span>
                <input
                  type="text"
                  formControlName="query"
                  placeholder="Project, destination or QA message"
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
                  <option value="all">All queue</option>
                  <option value="fixes">Fixes</option>
                  <option value="review">Human review</option>
                  <option value="ready">Ready</option>
                </select>
              </label>
            </form>

            <div class="console-list-grid" *ngIf="queueRows.length; else emptyQueue">
              <a class="console-list-card console-list-card--interactive" *ngFor="let row of queueRows" [routerLink]="row.link">
                <div>
                  <strong>{{ row.title }}</strong>
                  <p>{{ row.siteName }} · {{ row.summary }}</p>
                  <small>{{ row.updatedAt | date: 'MMM d, HH:mm' }}</small>
                </div>
                <span
                  class="console-tag"
                  [class.console-tag--accent]="row.tone === 'accent'"
                  [class.console-tag--warning]="row.tone === 'warning'"
                  [class.console-tag--success]="row.tone === 'success'"
                  [class.console-tag--danger]="row.tone === 'danger'"
                  [class.console-tag--muted]="row.tone === 'muted'"
                >
                  {{ row.status }}
                </span>
              </a>
            </div>
          </section>

          <section class="console-surface">
            <div class="console-surface__head">
              <div>
                <p class="console-surface__eyebrow">Signals</p>
                <h2 class="console-surface__title">Most repeated QA checks</h2>
              </div>
            </div>

            <div class="console-list-grid" *ngIf="checkSignals.length; else emptySignals">
              <article class="console-list-card" *ngFor="let signal of checkSignals">
                <div>
                  <strong>{{ signal.key }}</strong>
                  <p>{{ signal.latestMessage }}</p>
                </div>
                <span
                  class="console-tag"
                  [class.console-tag--warning]="signal.severity === 'warning'"
                  [class.console-tag--danger]="signal.severity === 'error'"
                >
                  {{ signal.count }}
                </span>
              </article>
            </div>
          </section>
        </div>

        <aside class="console-workspace__aside">
          <section class="console-surface">
            <div class="console-surface__head">
              <div>
                <p class="console-surface__eyebrow">Incidents</p>
                <h2 class="console-surface__title">Publishing failures</h2>
              </div>
            </div>

            <div class="console-feed" *ngIf="failedPublications.length; else emptyIncidents">
              <article class="console-feed__item" *ngFor="let incident of failedPublications">
                <div>
                  <a [routerLink]="['/studio/projects', incident.project.id]">{{ incident.project.title }}</a>
                  <p>{{ incident.site.name }} · {{ incident.action }} · {{ incident.error || 'Unknown error' }}</p>
                </div>
                <span>{{ incident.updatedAt | date: 'short' }}</span>
              </article>
            </div>
          </section>

          <section class="console-surface">
            <div class="console-surface__head">
              <div>
                <p class="console-surface__eyebrow">Guidance</p>
                <h2 class="console-surface__title">Operator checklist</h2>
              </div>
            </div>

            <ul class="console-note-list">
              <li class="console-note-list__item">
                Empieza por fixes: todo lo que combine QA failed o publish failed es deuda operativa inmediata.
              </li>
              <li class="console-note-list__item">
                Después resuelve Human decisions para que el pipeline no acumule piezas sin propietario claro.
              </li>
              <li class="console-note-list__item">
                Ready to release indica capacidad de salida; Publishing History confirma si esa capacidad se convierte en contenido live.
              </li>
            </ul>
          </section>
        </aside>
      </div>

      <ng-template #loadingState>
        <section class="console-empty-state">
          <div>
            <p class="console-kicker">Loading</p>
            <h2>Assembling the QA queue</h2>
            <p>Estamos cruzando estados editoriales, checks y publication jobs para construir la cola de triage.</p>
          </div>
        </section>
      </ng-template>

      <ng-template #emptyQueue>
        <div class="console-empty-compact">
          <p>No queue items match the current filters.</p>
        </div>
      </ng-template>

      <ng-template #emptySignals>
        <div class="console-empty-compact">
          <p>No QA signals available yet.</p>
        </div>
      </ng-template>

      <ng-template #emptyIncidents>
        <div class="console-empty-compact">
          <p>No publication incidents for the current filters.</p>
        </div>
      </ng-template>
    </section>
  `,
})
export class QaQueuePageComponent implements OnInit {
  private readonly api = inject(StudioApiService);

  readonly filterForm = new FormGroup({
    query: new FormControl('', { nonNullable: true }),
    siteId: new FormControl('', { nonNullable: true }),
    focus: new FormControl<QaFocus>('all', { nonNullable: true }),
  });

  sites: StudioSiteSummary[] = [];
  projects: StudioProjectSummary[] = [];
  publications: PublicationListItem[] = [];
  queueRows: QueueRow[] = [];
  checkSignals: CheckSignal[] = [];
  failedPublications: PublicationListItem[] = [];
  loading = true;
  error = '';

  fixesCount = 0;
  humanDecisionCount = 0;
  readyCount = 0;
  runtimeIncidentCount = 0;

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
        this.publications = publications.items;
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

    const scopedProjects = this.projects
      .filter((project) => {
        if (siteId && project.siteId !== siteId) {
          return false;
        }

        if (!query) {
          return true;
        }

        const qaMessages = project.latestVersion?.qaReport?.checks
          ?.map((check) => `${check.key} ${check.message}`)
          .join(' ') ?? '';

        return [
          project.title,
          project.site.name,
          project.status,
          project.brief,
          project.latestVersion?.title ?? '',
          qaMessages,
        ]
          .join(' ')
          .toLowerCase()
          .includes(query);
      })
      .sort((left, right) => this.rankProject(right) - this.rankProject(left));

    const filteredProjects = scopedProjects.filter((project) => {
      if (focus === 'fixes') {
        return ['qa_failed', 'publish_failed'].includes(project.status);
      }

      if (focus === 'review') {
        return REVIEW_STATUSES.has(project.status);
      }

      if (focus === 'ready') {
        return ['qa_passed', 'approved'].includes(project.status);
      }

      return BASE_QUEUE_STATUSES.has(project.status);
    });

    this.queueRows = filteredProjects.map((project) => ({
      id: project.id,
      title: project.title,
      siteName: project.site.name,
      status: this.formatStatus(project.status),
      tone: this.rowTone(project.status),
      summary: this.projectSummary(project),
      updatedAt: project.updatedAt,
      link: ['/studio/editorial/articles', project.id],
    }));

    this.checkSignals = this.buildCheckSignals(filteredProjects);

    this.failedPublications = this.publications
      .filter((item) => item.status === 'failed')
      .filter((item) => !siteId || item.site.id === siteId)
      .filter((item) => {
        if (!query) {
          return true;
        }

        return [
          item.project.title,
          item.site.name,
          item.error ?? '',
          item.action,
        ]
          .join(' ')
          .toLowerCase()
          .includes(query);
      })
      .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
      .slice(0, 8);

    this.fixesCount = scopedProjects.filter((project) =>
      ['qa_failed', 'publish_failed'].includes(project.status),
    ).length;
    this.humanDecisionCount = scopedProjects.filter((project) =>
      REVIEW_STATUSES.has(project.status),
    ).length;
    this.readyCount = scopedProjects.filter((project) =>
      ['qa_passed', 'approved'].includes(project.status),
    ).length;
    this.runtimeIncidentCount = this.failedPublications.length;
  }

  private buildCheckSignals(projects: StudioProjectSummary[]): CheckSignal[] {
    const registry = new Map<string, CheckSignal>();

    projects.forEach((project) => {
      project.latestVersion?.qaReport?.checks.forEach((check) => {
        if (check.passed) {
          return;
        }

        const existing = registry.get(check.key);
        if (existing) {
          existing.count += 1;
          existing.latestMessage = check.message;
          return;
        }

        registry.set(check.key, {
          key: check.key,
          count: 1,
          severity: check.severity,
          latestMessage: check.message,
        });
      });
    });

    return [...registry.values()]
      .sort((left, right) => right.count - left.count)
      .slice(0, 6);
  }

  private rankProject(project: StudioProjectSummary): number {
    const weights: Partial<Record<ProjectStatus, number>> = {
      publish_failed: 100,
      qa_failed: 90,
      in_review: 70,
      approved: 60,
      qa_passed: 50,
      ai_generated: 30,
      draft: 20,
      published: 10,
    };

    return (weights[project.status] ?? 0) * 10000000000000 + Date.parse(project.updatedAt);
  }

  private projectSummary(project: StudioProjectSummary): string {
    if (project.status === 'publish_failed') {
      return 'El contenido esta listo en texto, pero el push a destino fallo.';
    }

    if (project.status === 'qa_failed') {
      const failedChecks = project.latestVersion?.qaReport?.checks.filter((check) => !check.passed) ?? [];
      return failedChecks.length
        ? failedChecks.slice(0, 2).map((check) => check.key).join(' · ')
        : 'QA detecto problemas que deben resolverse antes de publicar.';
    }

    if (project.status === 'in_review') {
      return 'Esperando decision humana sobre calidad, tono y enfoque editorial.';
    }

    if (project.status === 'approved') {
      return 'Aprobado por editorial, listo para schedule o release directo.';
    }

    if (project.status === 'qa_passed') {
      return 'Checks completados, pendiente de aprobacion final.';
    }

    return project.latestVersion?.excerpt || 'Pieza viva dentro del circuito editorial.';
  }

  private rowTone(status: ProjectStatus): TagTone {
    if (status === 'publish_failed' || status === 'qa_failed') {
      return 'danger';
    }
    if (status === 'in_review') {
      return 'warning';
    }
    if (status === 'approved') {
      return 'success';
    }
    if (status === 'qa_passed') {
      return 'accent';
    }
    return 'muted';
  }

  private formatStatus(status: ProjectStatus): string {
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
}
