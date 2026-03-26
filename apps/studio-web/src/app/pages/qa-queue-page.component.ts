import { CommonModule, DatePipe } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import type {
  PublicationListItem,
  ReviewGateStage,
  StudioProjectSummary,
  StudioSiteSummary,
} from '../models/studio.models';
import { StudioPageHeaderComponent } from '../components/studio-page-header.component';
import { StudioStatStripComponent, type StudioStatItem } from '../components/studio-stat-strip.component';
import { StudioApiService } from '../services/studio-api.service';
import { formatApiError } from '../utils/api-error';
import { buildQaScore, qaScoreLabel, reviewStageLabel, reviewStageTone } from '../utils/review-gate';

type QaFocus = 'all' | 'fixes' | 'review' | 'ready';
type TagTone = 'muted' | 'accent' | 'warning' | 'success' | 'danger';

type QueueRow = {
  id: string;
  title: string;
  siteName: string;
  status: string;
  tone: TagTone;
  summary: string;
  score: number;
  updatedAt: string;
  link: string[];
};

type CheckSignal = {
  key: string;
  count: number;
  severity: 'error' | 'warning';
  latestMessage: string;
};

@Component({
  selector: 'app-qa-queue-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, DatePipe, StudioPageHeaderComponent, StudioStatStripComponent],
  template: `
    <section class="console-page">
      <app-studio-page-header
        kicker="Review"
        title="QA Queue"
        intro="Triage operativo para blockers de QA, decisiones humanas y fallos de release antes de publicar."
      >
        <div page-meta *ngIf="!loading">
          <span class="console-tag console-tag--warning">{{ fixesCount }} fixes</span>
          <span class="console-tag console-tag--accent">{{ humanDecisionCount }} human decisions</span>
          <span class="console-tag console-tag--success">{{ readyCount }} ready now</span>
        </div>

        <div page-actions>
          <a class="console-button console-button--secondary" routerLink="/studio/editorial/pipeline">
            Open pipeline
          </a>
          <a class="console-button console-button--secondary" routerLink="/studio/review/editor">
            Editor review
          </a>
          <button type="button" class="console-button" (click)="loadData()">Refresh queue</button>
        </div>
      </app-studio-page-header>

      <div class="console-banner console-banner--error" *ngIf="error">{{ error }}</div>

      <app-studio-stat-strip *ngIf="!loading" [items]="queueStats"></app-studio-stat-strip>

      <section class="console-surface console-surface--hero" *ngIf="!loading">
        <div class="console-hero-grid">
          <div class="console-hero-copy">
            <p class="console-surface__eyebrow">QA posture</p>
            <h2 class="console-surface__title">Gate triage before sign-off and release</h2>
            <p class="console-hero-copy__body">{{ queueNarrative }}</p>

            <div class="console-header-strip">
              <article class="console-header-strip__card">
                <span>Needs fixes</span>
                <strong>{{ fixesCount }}</strong>
                <small>Projects blocked by QA failures, release blockers or recent publish incidents.</small>
              </article>
              <article class="console-header-strip__card">
                <span>Human decisions</span>
                <strong>{{ humanDecisionCount }}</strong>
                <small>Pieces that already passed the automatic layer and still need editorial judgment.</small>
              </article>
              <article class="console-header-strip__card">
                <span>Runtime incidents</span>
                <strong>{{ runtimeIncidentCount }}</strong>
                <small>Failed publication jobs still visible inside the current triage window.</small>
              </article>
            </div>
          </div>

          <div class="console-focus-stack">
            <div class="console-surface__head">
              <div>
                <p class="console-surface__eyebrow">Focus now</p>
                <h2 class="console-surface__title">Highest priority queue items</h2>
              </div>
            </div>

            <div class="console-focus-list" *ngIf="priorityProjects.length; else emptyPriorityProjects">
              <a
                class="console-focus-card"
                *ngFor="let project of priorityProjects.slice(0, 3)"
                [routerLink]="priorityProjectLink(project)"
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
                <h2 class="console-surface__title">Priority triage</h2>
              </div>
              <span class="console-tag console-tag--muted">{{ queueRows.length }} queued items</span>
            </div>

            <form class="console-toolbar console-toolbar--stretch" [formGroup]="filterForm">
              <label class="console-search console-search--wide">
                <span>Search</span>
                <input
                  type="text"
                  formControlName="query"
                  placeholder="Project, blocker, destination or QA note"
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
                <div class="console-version-card__head">
                  <div>
                    <strong>{{ row.title }}</strong>
                    <p>{{ row.siteName }} · {{ row.summary }}</p>
                  </div>
                  <div class="console-version-card__tags">
                    <span class="console-tag" [ngClass]="tagToneClass(row.tone)">
                      {{ row.status }}
                    </span>
                    <span class="console-tag console-tag--muted">{{ row.score }}/100</span>
                  </div>
                </div>
                <small>{{ row.updatedAt | date: 'MMM d, HH:mm' }}</small>
              </a>
            </div>
          </section>

          <section class="console-surface">
            <div class="console-surface__head">
              <div>
                <p class="console-surface__eyebrow">Signals</p>
                <h2 class="console-surface__title">Most repeated gate signals</h2>
              </div>
            </div>

            <div class="console-list-grid" *ngIf="checkSignals.length; else emptySignals">
              <article class="console-list-card" *ngFor="let signal of checkSignals">
                <div>
                  <strong>{{ signal.key }}</strong>
                  <p>{{ signal.latestMessage }}</p>
                </div>
                <span class="console-tag" [ngClass]="severityTagClass(signal.severity)">
                  {{ signal.count }}
                </span>
              </article>
            </div>
          </section>
        </div>

        <aside class="console-workspace__aside">
          <section class="console-surface console-surface--editorial">
            <div class="console-surface__head">
              <div>
                <p class="console-surface__eyebrow">Incidents</p>
                <h2 class="console-surface__title">Publishing failures</h2>
              </div>
            </div>

            <div class="console-feed" *ngIf="failedPublications.length; else emptyIncidents">
              <article class="console-feed__item" *ngFor="let incident of failedPublications">
                <div>
                  <a [routerLink]="['/studio/editorial/articles', incident.project.id]">{{ incident.project.title }}</a>
                  <p>{{ incident.site.name }} · {{ incident.action }} · {{ incident.error || 'Unknown error' }}</p>
                </div>
                <span>{{ incident.updatedAt | date: 'short' }}</span>
              </article>
            </div>
          </section>

          <section class="console-surface">
            <div class="console-surface__head">
              <div>
                <p class="console-surface__eyebrow">Control surfaces</p>
                <h2 class="console-surface__title">Operator handoff</h2>
              </div>
            </div>

            <div class="console-action-stack">
              <a class="console-action-card" routerLink="/studio/review/editor">
                <strong>Editor review</strong>
                <span>Envia ahi las piezas que ya no necesitan fixes sino criterio editorial humano.</span>
              </a>
              <a class="console-action-card" routerLink="/studio/publishing/history">
                <strong>Publishing history</strong>
                <span>Usalo cuando el incidente ya salio del editor y vive en el runtime de release.</span>
              </a>
              <a class="console-action-card" routerLink="/studio/publishing/scheduled">
                <strong>Scheduled release</strong>
                <span>Las piezas realmente listas pasan de QA al carril de release management.</span>
              </a>
            </div>
          </section>
        </aside>
      </div>

      <ng-template #loadingState>
        <section class="console-empty-state">
          <div>
            <p class="console-kicker">Loading</p>
            <h2>Assembling the QA queue</h2>
            <p>Estamos cruzando review gate, QA checks y publication jobs para construir la cola de triage.</p>
          </div>
        </section>
      </ng-template>

      <ng-template #emptyPriorityProjects>
        <div class="console-empty-compact">
          <p>No priority queue items right now.</p>
        </div>
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
  filteredProjects: StudioProjectSummary[] = [];
  queueRows: QueueRow[] = [];
  checkSignals: CheckSignal[] = [];
  failedPublications: PublicationListItem[] = [];
  loading = true;
  error = '';

  fixesCount = 0;
  humanDecisionCount = 0;
  readyCount = 0;
  runtimeIncidentCount = 0;

  get queueStats(): StudioStatItem[] {
    return [
      {
        label: 'Needs fixes',
        value: this.fixesCount,
        detail: 'Piezas bloqueadas por gate editorial o por un release fallido.',
        tone: this.fixesCount > 0 ? 'warning' : 'muted',
      },
      {
        label: 'Human decisions',
        value: this.humanDecisionCount,
        detail: 'Contenido esperando lectura, aprobacion o compare humano.',
        tone: this.humanDecisionCount > 0 ? 'accent' : 'muted',
      },
      {
        label: 'Ready to release',
        value: this.readyCount,
        detail: 'Piezas listas para draft sync o publish sin blockers abiertos.',
        tone: this.readyCount > 0 ? 'success' : 'muted',
      },
      {
        label: 'Runtime incidents',
        value: this.runtimeIncidentCount,
        detail: 'Publication jobs fallidos dentro de la ventana observada.',
        tone: this.runtimeIncidentCount > 0 ? 'danger' : 'muted',
      },
    ];
  }

  get queueNarrative(): string {
    if (!this.projects.length) {
      return 'No hay proyectos todavia en la cola de QA. La superficie queda lista para triage cuando el workspace empiece a generar y revisar piezas reales.';
    }

    if (this.fixesCount > 0) {
      return `${this.fixesCount} pieza${this.fixesCount > 1 ? 's siguen' : ' sigue'} bloqueada${this.fixesCount > 1 ? 's' : ''}. QA Queue ya no es una lista de checks: es el carril donde se prioriza la deuda editorial y runtime antes del release.`;
    }

    if (this.humanDecisionCount > 0) {
      return `${this.humanDecisionCount} pieza${this.humanDecisionCount > 1 ? 's esperan' : ' espera'} criterio humano tras superar la capa automatica. El cuello de botella ya no es QA bruto sino decision editorial.`;
    }

    if (this.readyCount > 0) {
      return `${this.readyCount} pieza${this.readyCount > 1 ? 's ya pueden' : ' ya puede'} salir de QA hacia scheduled o publish sin blockers visibles.`;
    }

    return 'La cola esta estable y sin deuda operativa relevante. El siguiente throughput depende de generar nuevo volumen o abrir nuevas iteraciones.';
  }

  get priorityProjects(): StudioProjectSummary[] {
    const source = this.filteredProjects.length
      ? this.filteredProjects
      : this.projects.filter((project) => this.isQueueProject(project));

    return [...source].sort((left, right) => this.rankProject(right) - this.rankProject(left));
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
          project.brief,
          project.latestVersion?.title ?? '',
          project.reviewGate.primaryConcern,
          project.reviewGate.nextAction,
          ...(project.reviewGate.blockers || []),
          ...(project.reviewGate.warnings || []),
          qaMessages,
        ]
          .join(' ')
          .toLowerCase()
          .includes(query);
      })
      .sort((left, right) => this.rankProject(right) - this.rankProject(left));

    const filteredProjects = scopedProjects.filter((project) => {
      if (focus === 'fixes') {
        return this.needsFixes(project);
      }

      if (focus === 'review') {
        return this.needsHumanDecision(project);
      }

      if (focus === 'ready') {
        return this.readyForRelease(project);
      }

      return this.isQueueProject(project);
    });

    this.filteredProjects = filteredProjects;
    this.queueRows = filteredProjects.map((project) => ({
      id: project.id,
      title: project.title,
      siteName: project.site.name,
      status: reviewStageLabel(project.reviewGate.stage),
      tone: this.rowTone(project.reviewGate.stage),
      summary: this.projectSummary(project),
      score: buildQaScore(project.latestVersion),
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

    this.fixesCount = scopedProjects.filter((project) => this.needsFixes(project)).length;
    this.humanDecisionCount = scopedProjects.filter((project) => this.needsHumanDecision(project)).length;
    this.readyCount = scopedProjects.filter((project) => this.readyForRelease(project)).length;
    this.runtimeIncidentCount = this.failedPublications.length;
  }

  priorityProjectLink(project: StudioProjectSummary): string[] {
    return project.reviewGate.compareReady
      ? ['/studio/editorial/versions', project.id]
      : ['/studio/editorial/articles', project.id];
  }

  priorityProjectNarrative(project: StudioProjectSummary): string {
    if (this.needsFixes(project)) {
      return `${project.reviewGate.blockerCount} blockers · ${project.reviewGate.primaryConcern}`;
    }

    if (this.needsHumanDecision(project)) {
      return `${qaScoreLabel(buildQaScore(project.latestVersion))} · ${project.reviewGate.nextAction}`;
    }

    if (this.readyForRelease(project)) {
      return `${buildQaScore(project.latestVersion)}/100 QA score · ready for scheduled release`;
    }

    return project.reviewGate.nextAction;
  }

  tagToneClass(tone: TagTone): string {
    switch (tone) {
      case 'accent':
        return 'console-tag--accent';
      case 'warning':
        return 'console-tag--warning';
      case 'success':
        return 'console-tag--success';
      case 'danger':
        return 'console-tag--danger';
      case 'muted':
      default:
        return 'console-tag--muted';
    }
  }

  reviewTagClass(stage: ReviewGateStage): string {
    return this.tagToneClass(reviewStageTone(stage));
  }

  reviewStageLabel(stage: ReviewGateStage): string {
    return reviewStageLabel(stage);
  }

  severityTagClass(severity: CheckSignal['severity']): string {
    return severity === 'error' ? 'console-tag--danger' : 'console-tag--warning';
  }

  private buildCheckSignals(projects: StudioProjectSummary[]): CheckSignal[] {
    const registry = new Map<string, CheckSignal>();

    const register = (key: string, severity: 'error' | 'warning', message: string) => {
      const existing = registry.get(key);
      if (existing) {
        existing.count += 1;
        existing.latestMessage = message;
        return;
      }

      registry.set(key, {
        key,
        count: 1,
        severity,
        latestMessage: message,
      });
    };

    projects.forEach((project) => {
      project.latestVersion?.qaReport?.checks.forEach((check) => {
        if (!check.passed) {
          register(check.key, check.severity, check.message);
        }
      });

      project.reviewGate.blockers.forEach((message) => {
        register(this.signalKey(message), 'error', message);
      });

      project.reviewGate.warnings.forEach((message) => {
        register(this.signalKey(message), 'warning', message);
      });
    });

    return [...registry.values()]
      .sort((left, right) => right.count - left.count)
      .slice(0, 6);
  }

  private rankProject(project: StudioProjectSummary): number {
    const weights: Partial<Record<ReviewGateStage, number>> = {
      publish_failed: 100,
      qa_blocked: 90,
      needs_review: 75,
      ready_to_approve: 65,
      approved: 55,
      publish_queued: 45,
      published: 10,
      awaiting_generation: 5,
    };

    return (
      ((weights[project.reviewGate.stage] ?? 0) + project.reviewGate.blockerCount * 2) * 10000000000000 +
      Date.parse(project.updatedAt)
    );
  }

  private projectSummary(project: StudioProjectSummary): string {
    if (project.reviewGate.stage === 'publish_failed') {
      return project.latestPublicationJob?.error || 'Latest release attempt failed and needs operator review.';
    }

    if (project.reviewGate.blockerCount > 0) {
      return `${project.reviewGate.blockerCount} blockers · ${project.reviewGate.primaryConcern}`;
    }

    return `${qaScoreLabel(buildQaScore(project.latestVersion))} · ${project.reviewGate.nextAction}`;
  }

  private rowTone(stage: ReviewGateStage): TagTone {
    return reviewStageTone(stage);
  }

  private isQueueProject(project: StudioProjectSummary): boolean {
    return this.needsFixes(project) || this.needsHumanDecision(project) || this.readyForRelease(project) || project.reviewGate.stage === 'publish_queued';
  }

  private needsFixes(project: StudioProjectSummary): boolean {
    return project.reviewGate.blockerCount > 0 || project.reviewGate.stage === 'publish_failed';
  }

  private needsHumanDecision(project: StudioProjectSummary): boolean {
    return ['needs_review', 'qa_blocked', 'ready_to_approve'].includes(project.reviewGate.stage);
  }

  private readyForRelease(project: StudioProjectSummary): boolean {
    return (
      project.reviewGate.publishReady &&
      ['approved', 'publish_failed'].includes(project.reviewGate.stage)
    );
  }

  private signalKey(message: string): string {
    return message
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 32);
  }
}
