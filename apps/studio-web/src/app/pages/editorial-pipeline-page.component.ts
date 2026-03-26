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
import { StudioApiService } from '../services/studio-api.service';
import { formatApiError } from '../utils/api-error';
import { buildQaScore, qaScoreLabel, reviewStageLabel, reviewStageTone } from '../utils/review-gate';

type PipelineStageId =
  | 'brief'
  | 'draft'
  | 'ai_generation'
  | 'human_review'
  | 'editing'
  | 'qa'
  | 'scheduled'
  | 'published';

type PipelineStageTone = 'neutral' | 'accent' | 'warning' | 'success';
type TagTone = 'muted' | 'accent' | 'warning' | 'success' | 'danger';

type PipelineCard = {
  id: string;
  link: string[];
  title: string;
  siteName: string;
  goal: string;
  statusLabel: string;
  summary: string;
  updatedAt: string;
  versionLabel: string | null;
  tone: TagTone;
};

type PipelineStage = {
  id: PipelineStageId;
  title: string;
  description: string;
  emptyMessage: string;
  tone: PipelineStageTone;
  cards: PipelineCard[];
  count: number;
};

type PipelineAlert = {
  title: string;
  detail: string;
  badge: string;
  tone: TagTone;
  updatedAt: string;
  link: string[];
};

type DestinationSignal = {
  id: string;
  name: string;
  type: string;
  locale: string;
  projectCount: number;
  readyCount: number;
  liveCount: number;
};

const STAGE_BLUEPRINT: Array<Omit<PipelineStage, 'cards' | 'count'>> = [
  {
    id: 'brief',
    title: 'Brief',
    description: 'Intake y framing editorial antes de generar la primera version.',
    emptyMessage: 'No hay briefs nuevos en esta vista.',
    tone: 'neutral',
  },
  {
    id: 'draft',
    title: 'Draft',
    description: 'Briefs con estructura inicial, listos para pasar a IA o refinement.',
    emptyMessage: 'No hay drafts manuales pendientes.',
    tone: 'neutral',
  },
  {
    id: 'ai_generation',
    title: 'AI Generation',
    description: 'Salida generada por IA esperando lectura y calibracion del editor.',
    emptyMessage: 'No hay piezas en generacion o recien generadas.',
    tone: 'accent',
  },
  {
    id: 'human_review',
    title: 'Human Review',
    description: 'Decision editorial humana sobre enfoque, tono y estructura.',
    emptyMessage: 'No hay contenido esperando revision humana.',
    tone: 'accent',
  },
  {
    id: 'editing',
    title: 'Editing',
    description: 'Correcciones activas tras feedback, QA o bloqueos de release.',
    emptyMessage: 'No hay piezas bloqueadas en edicion.',
    tone: 'warning',
  },
  {
    id: 'qa',
    title: 'QA',
    description: 'Chequeos de calidad, metadata y readiness antes del go-live.',
    emptyMessage: 'No hay piezas esperando validacion QA.',
    tone: 'warning',
  },
  {
    id: 'scheduled',
    title: 'Scheduled',
    description: 'Contenido listo para release, sincronizacion draft o publish queue.',
    emptyMessage: 'No hay piezas listas para release.',
    tone: 'accent',
  },
  {
    id: 'published',
    title: 'Published',
    description: 'Contenido ya distribuido en un destino final.',
    emptyMessage: 'Todavia no hay piezas publicadas en esta vista.',
    tone: 'success',
  },
];

@Component({
  selector: 'app-editorial-pipeline-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, DatePipe],
  template: `
    <section class="console-page">
      <header class="console-page__header">
        <div class="console-page__copy">
          <p class="console-kicker">Editorial</p>
          <h1 class="console-page__title">Pipeline</h1>
          <p class="console-page__intro">
            Board operativo del flujo editorial: brief, generacion, revision, QA, scheduling y publish sobre datos vivos del workspace.
          </p>
        </div>

        <div class="console-page__actions">
          <a class="console-button console-button--secondary" routerLink="/studio/review/qa">
            QA queue
          </a>
          <button type="button" class="console-button console-button--secondary" (click)="loadData()">
            Refresh
          </button>
          <a class="console-button" routerLink="/studio/projects/new">New project</a>
        </div>
      </header>

      <div class="console-banner console-banner--error" *ngIf="error">{{ error }}</div>

      <div class="console-stat-grid" *ngIf="!loading">
        <article class="console-stat-card">
          <p class="console-stat-card__label">Items in flow</p>
          <strong class="console-stat-card__value">{{ inFlowCount }}</strong>
          <span class="console-stat-card__detail">Piezas que aun no completan el circuito editorial.</span>
        </article>

        <article class="console-stat-card">
          <p class="console-stat-card__label">Blocked</p>
          <strong class="console-stat-card__value">{{ blockedCount }}</strong>
          <span class="console-stat-card__detail">Ediciones atascadas por QA o por fallos de publishing recientes.</span>
        </article>

        <article class="console-stat-card">
          <p class="console-stat-card__label">Ready for release</p>
          <strong class="console-stat-card__value">{{ readyCount }}</strong>
          <span class="console-stat-card__detail">Piezas que ya pueden entrar en schedule, sync draft o publish.</span>
        </article>

        <article class="console-stat-card">
          <p class="console-stat-card__label">Published</p>
          <strong class="console-stat-card__value">{{ publishedCount }}</strong>
          <span class="console-stat-card__detail">Contenido que ya esta live en algun destino del workspace.</span>
        </article>
      </div>

      <div class="console-workspace" *ngIf="!loading; else loadingState">
        <div class="console-workspace__main">
          <section class="console-surface">
            <div class="console-surface__head">
              <div>
                <p class="console-surface__eyebrow">Workflow</p>
                <h2 class="console-surface__title">Visual board</h2>
              </div>

              <a class="console-link" routerLink="/studio/analytics/content-performance">
                Open analytics
              </a>
            </div>

            <form class="console-toolbar console-toolbar--stretch" [formGroup]="filterForm">
              <label class="console-search console-search--wide">
                <span>Search</span>
                <input
                  type="text"
                  formControlName="query"
                  placeholder="Project, brief, destination or status"
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
            </form>

            <div class="console-chip-row">
              <span class="console-chip">Flow: Brief -> Draft -> AI -> Review -> Editing -> QA -> Scheduled -> Published</span>
              <span class="console-chip">Visible items: {{ visibleProjects.length }}</span>
              <span class="console-chip">Destination: {{ activeDestinationLabel }}</span>
            </div>

            <div class="console-pipeline-board">
              <article
                class="console-pipeline-stage"
                *ngFor="let stage of pipelineStages"
                [class.console-pipeline-stage--accent]="stage.tone === 'accent'"
                [class.console-pipeline-stage--warning]="stage.tone === 'warning'"
                [class.console-pipeline-stage--success]="stage.tone === 'success'"
              >
                <div class="console-pipeline-stage__head">
                  <div class="console-pipeline-stage__copy">
                    <h3 class="console-pipeline-stage__title">{{ stage.title }}</h3>
                    <p class="console-pipeline-stage__description">{{ stage.description }}</p>
                  </div>
                  <span
                    class="console-tag"
                    [class.console-tag--accent]="stage.tone === 'accent'"
                    [class.console-tag--warning]="stage.tone === 'warning'"
                    [class.console-tag--success]="stage.tone === 'success'"
                    [class.console-tag--muted]="stage.tone === 'neutral'"
                  >
                    {{ stage.count }}
                  </span>
                </div>

                <div class="console-pipeline-stack" *ngIf="stage.cards.length; else emptyLane">
                  <a class="console-pipeline-card" *ngFor="let card of stage.cards" [routerLink]="card.link">
                    <div class="console-pipeline-card__meta">
                      <span
                        class="console-tag"
                        [class.console-tag--accent]="card.tone === 'accent'"
                        [class.console-tag--warning]="card.tone === 'warning'"
                        [class.console-tag--success]="card.tone === 'success'"
                        [class.console-tag--danger]="card.tone === 'danger'"
                        [class.console-tag--muted]="card.tone === 'muted'"
                      >
                        {{ card.statusLabel }}
                      </span>
                      <span class="console-tag console-tag--muted">{{ card.siteName }}</span>
                    </div>

                    <div>
                      <strong>{{ card.title }}</strong>
                      <p class="console-pipeline-card__summary">{{ card.summary }}</p>
                    </div>

                    <div class="console-pipeline-card__footer">
                      <span>{{ card.goal }}<ng-container *ngIf="card.versionLabel"> · {{ card.versionLabel }}</ng-container></span>
                      <span>{{ card.updatedAt | date: 'MMM d, HH:mm' }}</span>
                    </div>
                  </a>
                </div>

                <ng-template #emptyLane>
                  <div class="console-empty-compact">
                    <p>{{ stage.emptyMessage }}</p>
                  </div>
                </ng-template>
              </article>
            </div>
          </section>

          <section class="console-surface">
            <div class="console-surface__head">
              <div>
                <p class="console-surface__eyebrow">Destinations</p>
                <h2 class="console-surface__title">Flow by publishing surface</h2>
              </div>
            </div>

            <div class="console-list-grid" *ngIf="destinationSignals.length; else noDestinations">
              <article class="console-list-card" *ngFor="let destination of destinationSignals">
                <div>
                  <strong>{{ destination.name }}</strong>
                  <p>{{ destination.type }} · {{ destination.projectCount }} projects in view · {{ destination.readyCount }} ready</p>
                </div>
                <span class="console-tag console-tag--success">{{ destination.liveCount }} live</span>
              </article>
            </div>
          </section>
        </div>

        <aside class="console-workspace__aside">
          <section class="console-surface">
            <div class="console-surface__head">
              <div>
                <p class="console-surface__eyebrow">Release queue</p>
                <h2 class="console-surface__title">What can ship next</h2>
              </div>
            </div>

            <div class="console-action-stack" *ngIf="releaseQueue.length; else emptyReleaseQueue">
              <a class="console-action-card" *ngFor="let item of releaseQueue" [routerLink]="item.link">
                <div>
                  <strong>{{ item.title }}</strong>
                  <p>{{ item.detail }}</p>
                </div>
                <span
                  class="console-tag"
                  [class.console-tag--accent]="item.tone === 'accent'"
                  [class.console-tag--warning]="item.tone === 'warning'"
                  [class.console-tag--success]="item.tone === 'success'"
                  [class.console-tag--danger]="item.tone === 'danger'"
                  [class.console-tag--muted]="item.tone === 'muted'"
                >
                  {{ item.badge }}
                </span>
              </a>
            </div>
          </section>

          <section class="console-surface">
            <div class="console-surface__head">
              <div>
                <p class="console-surface__eyebrow">Blockers</p>
                <h2 class="console-surface__title">Issues to resolve</h2>
              </div>
            </div>

            <div class="console-action-stack" *ngIf="blockers.length; else emptyBlockers">
              <a class="console-action-card" *ngFor="let item of blockers" [routerLink]="item.link">
                <div>
                  <strong>{{ item.title }}</strong>
                  <p>{{ item.detail }}</p>
                </div>
                <span
                  class="console-tag"
                  [class.console-tag--accent]="item.tone === 'accent'"
                  [class.console-tag--warning]="item.tone === 'warning'"
                  [class.console-tag--success]="item.tone === 'success'"
                  [class.console-tag--danger]="item.tone === 'danger'"
                  [class.console-tag--muted]="item.tone === 'muted'"
                >
                  {{ item.badge }}
                </span>
              </a>
            </div>
          </section>

          <section class="console-surface">
            <div class="console-surface__head">
              <div>
                <p class="console-surface__eyebrow">Operating model</p>
                <h2 class="console-surface__title">How the board maps the backend</h2>
              </div>
            </div>

            <ul class="console-note-list">
              <li class="console-note-list__item">
                El board ya no decide por el status tecnico a solas: ordena el flujo desde el review gate y usa la version solo como contexto secundario.
              </li>
              <li class="console-note-list__item">
                Scheduled agrupa contenido realmente publicable; los retry de publish fallido aparecen ademas como incidencias operativas hasta que alguien actua.
              </li>
              <li class="console-note-list__item">
                Blockers y warnings visibles en cada tarjeta salen del mismo gate que ya gobierna approval y publish en backend.
              </li>
            </ul>
          </section>
        </aside>
      </div>

      <ng-template #loadingState>
        <section class="console-empty-state">
          <div>
            <p class="console-kicker">Loading</p>
            <h2>Building the editorial board</h2>
            <p>Estamos agrupando proyectos, versiones y publication jobs en el nuevo workflow visual.</p>
          </div>
        </section>
      </ng-template>

      <ng-template #noDestinations>
        <div class="console-empty-compact">
          <p>No destinations match the current filters.</p>
        </div>
      </ng-template>

      <ng-template #emptyReleaseQueue>
        <div class="console-empty-compact">
          <p>No release-ready items right now.</p>
        </div>
      </ng-template>

      <ng-template #emptyBlockers>
        <div class="console-empty-compact">
          <p>No blockers for the current filters.</p>
        </div>
      </ng-template>
    </section>
  `,
})
export class EditorialPipelinePageComponent implements OnInit {
  private readonly api = inject(StudioApiService);

  readonly filterForm = new FormGroup({
    query: new FormControl('', { nonNullable: true }),
    siteId: new FormControl('', { nonNullable: true }),
  });

  sites: StudioSiteSummary[] = [];
  projects: StudioProjectSummary[] = [];
  publications: PublicationListItem[] = [];
  visibleProjects: StudioProjectSummary[] = [];
  pipelineStages: PipelineStage[] = [];
  releaseQueue: PipelineAlert[] = [];
  blockers: PipelineAlert[] = [];
  destinationSignals: DestinationSignal[] = [];

  loading = true;
  error = '';
  inFlowCount = 0;
  blockedCount = 0;
  readyCount = 0;
  publishedCount = 0;

  get activeDestinationLabel(): string {
    const siteId = this.filterForm.controls.siteId.value;
    return this.sites.find((site) => site.id === siteId)?.name ?? 'All destinations';
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

    const filteredProjects = this.projects
      .filter((project) => {
        if (siteId && project.siteId !== siteId) {
          return false;
        }

        if (!query) {
          return true;
        }

        return [
          project.title,
          project.brief,
          project.goal,
          project.reviewGate.stage,
          project.reviewGate.nextAction,
          project.reviewGate.primaryConcern,
          project.site.name,
          project.latestVersion?.title ?? '',
          project.latestVersion?.excerpt ?? '',
          ...(project.reviewGate.blockers ?? []),
          ...(project.reviewGate.warnings ?? []),
        ]
          .join(' ')
          .toLowerCase()
          .includes(query);
      })
      .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));

    this.visibleProjects = filteredProjects;

    this.pipelineStages = STAGE_BLUEPRINT.map((stage) => {
      const cards = filteredProjects
        .filter((project) => this.resolveStage(project) === stage.id)
        .map((project) => this.buildCard(project));

      return {
        ...stage,
        cards,
        count: cards.length,
      };
    });

    const filteredFailures = this.publications
      .filter((publication) => publication.status === 'failed')
      .filter((publication) => {
        if (siteId && publication.site.id !== siteId) {
          return false;
        }

        if (!query) {
          return true;
        }

        return [
          publication.project.title,
          publication.site.name,
          publication.action,
          publication.status,
          publication.error ?? '',
        ]
          .join(' ')
          .toLowerCase()
          .includes(query);
      });

    this.inFlowCount = filteredProjects.filter(
      (project) => this.resolveStage(project) !== 'published',
    ).length;
    this.readyCount = filteredProjects.filter((project) => this.isReleaseCandidate(project)).length;
    this.publishedCount = filteredProjects.filter(
      (project) => project.reviewGate.stage === 'published',
    ).length;
    this.blockedCount = new Set([
      ...filteredProjects
        .filter((project) => this.isOperationallyBlocked(project))
        .map((project) => project.id),
      ...filteredFailures.map((publication) => publication.project.id),
    ]).size;

    this.releaseQueue = filteredProjects
      .filter((project) => this.isReleaseCandidate(project) || this.isRetryCandidate(project))
      .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
      .slice(0, 6)
      .map((project) => ({
        title: project.title,
        detail: `${project.site.name} · ${this.buildReleaseSummary(project)}`,
        badge: this.isRetryCandidate(project) ? 'Retry publish' : reviewStageLabel(project.reviewGate.stage),
        tone: this.isRetryCandidate(project) ? 'danger' : reviewStageTone(project.reviewGate.stage),
        updatedAt: project.updatedAt,
        link: this.projectLink(project, 'article'),
      }));

    const projectBlockers = filteredProjects
      .filter((project) => this.isOperationallyBlocked(project))
      .map((project) => ({
        title: project.title,
        detail: `${project.site.name} · ${project.reviewGate.primaryConcern}`,
        badge: reviewStageLabel(project.reviewGate.stage),
        tone: reviewStageTone(project.reviewGate.stage) === 'muted'
          ? 'warning' as const
          : reviewStageTone(project.reviewGate.stage),
        updatedAt: project.updatedAt,
        link: this.projectLink(project, 'article'),
      }));

    const publicationBlockers = filteredFailures.map((publication) => ({
      title: publication.project.title,
      detail: `${publication.site.name} · ${publication.action} failed${publication.error ? ` · ${this.truncate(publication.error, 72)}` : ''}`,
      badge: 'Publish failed',
      tone: 'danger' as const,
      updatedAt: publication.updatedAt,
      link: ['/studio/projects', publication.project.id],
    }));

    this.blockers = [...projectBlockers, ...publicationBlockers]
      .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
      .slice(0, 8);

    this.destinationSignals = this.sites
      .filter((site) => !siteId || site.id === siteId)
      .map((site) => {
        const siteProjects = filteredProjects.filter((project) => project.siteId === site.id);
        return {
          id: site.id,
          name: site.name,
          type: site.type,
          locale: site.locale,
          projectCount: siteProjects.length,
          readyCount: siteProjects.filter((project) => this.isReleaseCandidate(project)).length,
          liveCount: siteProjects.filter((project) => project.reviewGate.stage === 'published').length,
        };
      })
      .filter((site) => site.projectCount > 0)
      .sort((left, right) => right.projectCount - left.projectCount)
      .slice(0, 6);
  }

  private buildCard(project: StudioProjectSummary): PipelineCard {
    const stage = this.resolveStage(project);
    const qaScore = buildQaScore(project.latestVersion);
    const qaLabel = qaScore > 0 ? `${qaScoreLabel(qaScore)} · ${qaScore}/100` : 'QA pending';

    return {
      id: project.id,
      link: this.projectLink(project, stage),
      title: project.title,
      siteName: project.site.name,
      goal: project.goal,
      statusLabel: reviewStageLabel(project.reviewGate.stage),
      summary: this.buildCardSummary(project, stage, qaLabel),
      updatedAt: project.updatedAt,
      versionLabel: project.latestVersion
        ? `V${project.latestVersion.versionNumber}`
        : null,
      tone: this.reviewTone(project.reviewGate.stage),
    };
  }

  private resolveStage(project: StudioProjectSummary): PipelineStageId {
    switch (project.reviewGate.stage) {
      case 'published':
        return 'published';
      case 'approved':
      case 'publish_queued':
        return 'scheduled';
      case 'ready_to_approve':
        return 'qa';
      case 'qa_blocked':
      case 'publish_failed':
        return 'editing';
      case 'awaiting_generation':
        return project.latestVersion ? 'draft' : 'brief';
      case 'needs_review':
      default:
        return this.resolvePreApprovalStage(project);
    }
  }

  private buildCardSummary(
    project: StudioProjectSummary,
    stage: PipelineStageId,
    qaLabel: string,
  ): string {
    switch (stage) {
      case 'brief':
        return this.truncate(
          project.brief,
          108,
          project.reviewGate.nextAction,
        );
      case 'draft':
        return project.latestVersion?.title
          ? `Version inicial disponible: ${project.latestVersion.title}. ${project.reviewGate.nextAction}.`
          : project.reviewGate.nextAction;
      case 'ai_generation':
        return project.latestVersion?.excerpt
          ? this.truncate(project.latestVersion.excerpt, 108)
          : `${qaLabel} · ${project.reviewGate.nextAction}.`;
      case 'human_review':
        return `${project.reviewGate.nextAction}. ${project.reviewGate.primaryConcern}`;
      case 'editing':
        return project.reviewGate.primaryConcern;
      case 'qa':
        return `${qaLabel} · ${project.reviewGate.nextAction}.`;
      case 'scheduled':
        return project.reviewGate.stage === 'publish_queued'
          ? 'El job ya esta en cola de publicacion.'
          : `${qaLabel} · ${project.reviewGate.nextAction}.`;
      case 'published':
        return project.latestPublicationJob?.externalUrl
          ? 'Contenido visible en destino final y listo para seguimiento.'
          : 'Contenido publicado y disponible para seguimiento.';
    }
  }

  private projectLink(
    project: StudioProjectSummary,
    stage: PipelineStageId | 'article',
  ): string[] {
    if (stage === 'brief' || stage === 'draft') {
      return ['/studio/editorial/briefs', project.id];
    }

    if (stage === 'article') {
      return ['/studio/editorial/articles', project.id];
    }

    return ['/studio/editorial/articles', project.id];
  }

  private resolvePreApprovalStage(project: StudioProjectSummary): PipelineStageId {
    if (!project.latestVersion) {
      return 'brief';
    }

    if (project.latestVersion.status === 'draft') {
      return 'draft';
    }

    if (project.latestVersion.status === 'ai_generated') {
      return 'ai_generation';
    }

    return 'human_review';
  }

  private isReleaseCandidate(project: StudioProjectSummary): boolean {
    return (
      project.reviewGate.publishReady &&
      ['approved', 'publish_queued'].includes(project.reviewGate.stage)
    );
  }

  private isRetryCandidate(project: StudioProjectSummary): boolean {
    return project.reviewGate.publishReady && project.reviewGate.stage === 'publish_failed';
  }

  private isOperationallyBlocked(project: StudioProjectSummary): boolean {
    return project.reviewGate.blockerCount > 0 || project.reviewGate.stage === 'publish_failed';
  }

  private buildReleaseSummary(project: StudioProjectSummary): string {
    const qaScore = buildQaScore(project.latestVersion);
    const qaState = qaScore > 0 ? `${qaScoreLabel(qaScore)} · ${qaScore}/100` : 'QA pending';

    if (this.isRetryCandidate(project)) {
      return `Retry path available. ${project.reviewGate.primaryConcern}`;
    }

    return `${qaState} · ${project.reviewGate.nextAction}`;
  }

  private reviewTone(stage: ReviewGateStage): TagTone {
    return reviewStageTone(stage);
  }

  private truncate(text: string | null | undefined, limit: number, fallback = ''): string {
    const normalized = text?.trim() ?? '';
    if (!normalized) {
      return fallback;
    }

    return normalized.length > limit
      ? `${normalized.slice(0, limit).trimEnd()}...`
      : normalized;
  }
}
