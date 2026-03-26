import { CommonModule, DatePipe } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import type {
  PublicationListItem,
  ReviewGateStage,
  StudioPermission,
  StudioProjectSummary,
  StudioSiteSummary,
} from '../models/studio.models';
import { StudioApiService } from '../services/studio-api.service';
import { StudioSessionService } from '../services/studio-session.service';
import { StudioPageHeaderComponent } from '../components/studio-page-header.component';
import { StudioStatStripComponent, type StudioStatItem } from '../components/studio-stat-strip.component';
import { formatApiError } from '../utils/api-error';
import {
  reviewStageLabel as formatReviewStageLabel,
  reviewStageTone,
} from '../utils/review-gate';

@Component({
  selector: 'app-dashboard-page',
  standalone: true,
  imports: [CommonModule, RouterLink, DatePipe, StudioPageHeaderComponent, StudioStatStripComponent],
  template: `
    <section class="console-page">
      <app-studio-page-header
        kicker="Dashboard"
        title="Editorial Cockpit"
        intro="Produccion, revision, publishing y riesgo operativo del workspace en una sola vista ejecutiva."
      >
        <div page-actions>
          <a
            *ngIf="canAccess('projects.manage')"
            class="console-button console-button--secondary"
            routerLink="/studio/editorial/pipeline"
          >
            Open pipeline
          </a>
          <a *ngIf="canAccess('projects.manage')" class="console-button" routerLink="/studio/projects/new">
            New project
          </a>
        </div>
      </app-studio-page-header>

      <div class="console-banner console-banner--error" *ngIf="error">{{ error }}</div>

      <app-studio-stat-strip *ngIf="!loading" [items]="stats"></app-studio-stat-strip>

      <section class="console-surface console-surface--hero" *ngIf="!loading">
        <div class="console-hero-grid">
          <div class="console-hero-copy">
            <p class="console-surface__eyebrow">Mission control</p>
            <h2 class="console-surface__title">Workspace release posture</h2>
            <p class="console-hero-copy__body">
              {{ dashboardNarrative }}
            </p>

            <div class="console-header-strip">
              <article class="console-header-strip__card">
                <span>Approval ready</span>
                <strong>{{ approvalReadyCount }}</strong>
                <small>Pieces safe enough for final editorial decision.</small>
              </article>
              <article class="console-header-strip__card">
                <span>Release ready</span>
                <strong>{{ releaseReadyCount }}</strong>
                <small>Pieces that can move into publish or draft sync without blockers.</small>
              </article>
              <article class="console-header-strip__card">
                <span>Incidents</span>
                <strong>{{ attentionProjects.length }}</strong>
                <small>Projects that still need direct human intervention.</small>
              </article>
            </div>
          </div>

          <div class="console-focus-stack">
            <div class="console-surface__head">
              <div>
                <p class="console-surface__eyebrow">Focus now</p>
                <h2 class="console-surface__title">Attention queue</h2>
              </div>
            </div>

            <div class="console-focus-list" *ngIf="heroProjects.length; else emptyHeroProjects">
              <a
                class="console-focus-card"
                *ngFor="let project of heroProjects.slice(0, 3)"
                [routerLink]="['/studio/projects', project.id]"
              >
                <div>
                  <strong>{{ project.title }}</strong>
                  <p>{{ project.site.name }} · {{ activeProjectSummary(project) }}</p>
                </div>
                <span class="console-tag" [ngClass]="projectTagClass(project.reviewGate.stage)">
                  {{ reviewStageLabel(project.reviewGate.stage) }}
                </span>
              </a>
            </div>
          </div>
        </div>
      </section>

      <div class="console-workspace" *ngIf="!loading">
        <div class="console-workspace__main">
          <!-- Pipeline health -->
          <section class="console-surface">
            <div class="console-surface__head">
              <div>
                <p class="console-surface__eyebrow">Pipeline health</p>
                <h2 class="console-surface__title">Editorial flow breakdown</h2>
              </div>
              <a *ngIf="canAccess('analytics.read')" class="console-link" routerLink="/studio/analytics/content-performance">
                Open analytics
              </a>
            </div>

            <div class="console-pipeline-bar" *ngIf="projects.length">
              <div
                *ngFor="let segment of pipelineSegments"
                class="console-pipeline-bar__segment"
                [style.flex]="segment.count"
                [class]="'console-pipeline-bar__segment--' + segment.key"
                [title]="segment.label + ': ' + segment.count"
              ></div>
            </div>

            <div class="console-list-grid">
              <article class="console-list-card" *ngFor="let row of pipelineRows">
                <div>
                  <strong>{{ row.label }}</strong>
                  <p>{{ row.description }}</p>
                </div>
                <span class="console-tag" [ngClass]="row.tagClass">{{ row.count }}</span>
              </article>
            </div>
          </section>

          <!-- Quick actions -->
          <section class="console-surface">
            <div class="console-surface__head">
              <div>
                <p class="console-surface__eyebrow">Quick actions</p>
                <h2 class="console-surface__title">What the team does next</h2>
              </div>
            </div>

            <div class="console-action-grid">
              <a *ngIf="canAccess('projects.manage')" class="console-action-card" routerLink="/studio/projects/new">
                <strong>Create project</strong>
                <span>Inicia una nueva pieza editorial con brief, objetivo y destino principal.</span>
              </a>
              <a *ngIf="canAccess('review.approve')" class="console-action-card" routerLink="/studio/review/qa">
                <strong>Review QA queue</strong>
                <span>Prioriza piezas bloqueadas, listas para aprobacion o pendientes de accion.</span>
              </a>
              <a *ngIf="canAccess('publishing.manage')" class="console-action-card" routerLink="/studio/publishing/destinations">
                <strong>Manage destinations</strong>
                <span>Controla contratos de publicacion, credenciales y readiness de adapters.</span>
              </a>
              <a *ngIf="canAccess('prompts.manage')" class="console-action-card" routerLink="/studio/ai/prompts">
                <strong>Prompt library</strong>
                <span>Gobierna presets, versiones y asignaciones de prompts en produccion.</span>
              </a>
              <a *ngIf="canAccess('publishing.manage')" class="console-action-card" routerLink="/studio/publishing/history">
                <strong>Publishing history</strong>
                <span>Revisa publish, draft sync, unpublish y errores recientes por destino.</span>
              </a>
              <a *ngIf="canAccess('users.manage')" class="console-action-card" routerLink="/studio/settings/users">
                <strong>Team directory</strong>
                <span>Gestiona usuarios, invitaciones y asignacion de roles del workspace.</span>
              </a>
            </div>
          </section>

          <!-- Recent publishing -->
          <section class="console-surface">
            <div class="console-surface__head">
              <div>
                <p class="console-surface__eyebrow">Recent publishing</p>
                <h2 class="console-surface__title">Latest release activity</h2>
              </div>
              <a class="console-link" routerLink="/studio/publishing/history">View all</a>
            </div>

            <div class="console-feed" *ngIf="publications.length; else emptyRuntime">
              <article class="console-feed__item" *ngFor="let pub of publications.slice(0, 8)">
                <div>
                  <a [routerLink]="['/studio/projects', pub.project.id]">
                    {{ pub.project.title }}
                  </a>
                  <p>{{ pub.site.name }} · {{ pub.action }}</p>
                </div>
                <div class="console-feed__trail">
                  <span class="console-tag" [ngClass]="publicationTagClass(pub.status)">{{ pub.status }}</span>
                  <span class="console-feed__ts">{{ pub.updatedAt | date: 'mediumDate' }}</span>
                </div>
              </article>
            </div>
          </section>
        </div>

        <aside class="console-workspace__aside">
          <!-- Workspace readiness -->
          <section class="console-surface">
            <div class="console-surface__head">
              <div>
                <p class="console-surface__eyebrow">Workspace readiness</p>
                <h2 class="console-surface__title">System checklist</h2>
              </div>
            </div>

            <div class="console-checklist">
              <article class="console-checklist__item" *ngFor="let check of readinessChecks">
                <span class="console-checklist__icon" [class.is-ok]="check.ok">{{ check.ok ? '✓' : '○' }}</span>
                <div>
                  <strong>{{ check.label }}</strong>
                  <p>{{ check.detail }}</p>
                </div>
              </article>
            </div>
          </section>

          <!-- Destination directory -->
          <section class="console-surface">
            <div class="console-surface__head">
              <div>
                <p class="console-surface__eyebrow">Destinations</p>
                <h2 class="console-surface__title">Connected surfaces</h2>
              </div>
              <a class="console-link" routerLink="/studio/publishing/destinations">Manage</a>
            </div>

            <div class="console-feed" *ngIf="sites.length; else emptyDestinations">
              <article class="console-feed__item" *ngFor="let site of sites.slice(0, 6)">
                <div>
                  <strong>{{ site.name }}</strong>
                  <p>{{ site.type }} · {{ site.projectCount }} projects · {{ site.publishedProjectCount }} published</p>
                </div>
                <span class="console-tag console-tag--muted">{{ site.locale }}</span>
              </article>
            </div>
          </section>

          <!-- Top projects in flight -->
          <section class="console-surface" *ngIf="activeProjects.length">
            <div class="console-surface__head">
              <div>
                <p class="console-surface__eyebrow">In flight</p>
                <h2 class="console-surface__title">Active projects</h2>
              </div>
              <a class="console-link" routerLink="/studio/projects">View all</a>
            </div>

            <div class="console-feed">
              <article class="console-feed__item" *ngFor="let project of activeProjects.slice(0, 5)">
                <div>
                  <a [routerLink]="['/studio/projects', project.id]">
                    <strong>{{ project.title }}</strong>
                  </a>
                  <p>{{ project.site.name }} · {{ activeProjectSummary(project) }}</p>
                </div>
                <span class="console-tag" [ngClass]="projectTagClass(project.reviewGate.stage)">
                  {{ reviewStageLabel(project.reviewGate.stage) }}
                </span>
              </article>
            </div>
          </section>
        </aside>
      </div>

      <ng-template #emptyHeroProjects>
        <div class="console-empty-compact">
          <p>No priority projects need attention right now.</p>
        </div>
      </ng-template>

      <ng-template #emptyRuntime>
        <div class="console-empty-compact">
          <p>No publishing activity yet. Create a project and run the editorial pipeline to generate your first release.</p>
        </div>
      </ng-template>

      <ng-template #emptyDestinations>
        <div class="console-empty-compact">
          <p>No destinations connected. Add a publishing surface to start delivering content.</p>
        </div>
      </ng-template>
    </section>
  `,
})
export class DashboardPageComponent implements OnInit {
  private readonly api = inject(StudioApiService);
  private readonly sessionService = inject(StudioSessionService);

  sites: StudioSiteSummary[] = [];
  projects: StudioProjectSummary[] = [];
  publications: PublicationListItem[] = [];
  stats: StudioStatItem[] = [];
  loading = true;
  error = '';

  activeProjects: StudioProjectSummary[] = [];
  attentionProjects: StudioProjectSummary[] = [];
  releaseReadyProjects: StudioProjectSummary[] = [];
  pipelineRows: Array<{ label: string; description: string; count: number; tagClass: string }> = [];
  pipelineSegments: Array<{ key: string; label: string; count: number }> = [];
  readinessChecks: Array<{ label: string; detail: string; ok: boolean }> = [];

  get approvalReadyCount(): number {
    return this.projects.filter((project) => project.reviewGate.approvalReady).length;
  }

  get releaseReadyCount(): number {
    return this.releaseReadyProjects.length;
  }

  get heroProjects(): StudioProjectSummary[] {
    return this.attentionProjects.length ? this.attentionProjects : this.releaseReadyProjects;
  }

  get dashboardNarrative(): string {
    if (this.attentionProjects.length > 0) {
      return `${this.attentionProjects.length} project${this.attentionProjects.length > 1 ? 's' : ''} still block the ideal release path. The cockpit is now prioritizing direct editorial intervention before pushing more volume downstream.`;
    }

    if (this.releaseReadyProjects.length > 0) {
      return `${this.releaseReadyProjects.length} project${this.releaseReadyProjects.length > 1 ? 's are' : ' is'} ready to move through release. The workspace is operating with a healthy editorial gate and a clear publish lane.`;
    }

    return 'The workspace is stable, but the next throughput gain still depends on creating new briefs or running another AI generation cycle.';
  }

  ngOnInit(): void {
    forkJoin({
      sites: this.api.listSites(1, 50),
      projects: this.api.listProjects({ page: 1, pageSize: 200 }),
      publications: this.api.listPublications(1, 30),
    }).subscribe({
      next: ({ sites, projects, publications }) => {
        this.sites = sites.items;
        this.projects = projects.items;
        this.publications = publications.items;

        this.activeProjects = this.projects
          .filter((project) => project.reviewGate.stage !== 'published')
          .sort((left, right) => {
            const priorityDelta = this.projectAttentionRank(right) - this.projectAttentionRank(left);
            if (priorityDelta !== 0) {
              return priorityDelta;
            }

            return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
          });
        this.attentionProjects = this.activeProjects.filter((project) => this.projectNeedsAttention(project));
        this.releaseReadyProjects = this.projects
          .filter((project) =>
            project.reviewGate.publishReady &&
            ['approved', 'publish_queued'].includes(project.reviewGate.stage),
          )
          .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime());

        const publishedJobs = this.publications.filter((p) => p.status === 'published').length;
        const failedJobs = this.publications.filter((p) => p.status === 'failed').length;
        const incidentProjects = new Set([
          ...this.projects
            .filter((project) => this.projectNeedsAttention(project))
            .map((project) => project.id),
          ...this.publications
            .filter((publication) => publication.status === 'failed')
            .map((publication) => publication.project.id),
        ]);
        const incidentCount = incidentProjects.size + failedJobs;

        this.stats = [
          {
            label: 'Active destinations',
            value: this.sites.length,
            detail: 'Webs y endpoints listos para recibir contenido.',
          },
          {
            label: 'In production',
            value: this.activeProjects.length,
            detail: 'Piezas que todavia no completan el ciclo editorial.',
          },
          {
            label: 'Published jobs',
            value: publishedJobs,
            detail: 'Ejecuciones ya visibles en destino final.',
          },
          {
            label: 'Needs attention',
            value: incidentCount,
            detail: incidentCount > 0
              ? 'Bloqueos de QA o publishing que requieren decision humana.'
              : 'Sin incidentes pendientes en este momento.',
          },
        ];

        this.buildPipeline();
        this.buildReadiness(incidentCount);
        this.loading = false;
      },
      error: (error) => {
        this.error = formatApiError(error);
        this.loading = false;
      },
    });
  }

  canAccess(permission: StudioPermission): boolean {
    return this.sessionService.session()?.permissions.includes(permission) ?? false;
  }

  publicationTagClass(status: string): string {
    switch (status) {
      case 'published': return 'console-tag--success';
      case 'failed': return 'console-tag--danger';
      case 'pending':
      case 'in_progress': return 'console-tag--warning';
      default: return 'console-tag--muted';
    }
  }

  projectTagClass(stage: ReviewGateStage): string {
    switch (reviewStageTone(stage)) {
      case 'danger': return 'console-tag--danger';
      case 'warning': return 'console-tag--warning';
      case 'accent': return 'console-tag--accent';
      case 'success': return 'console-tag--success';
      default: return 'console-tag--muted';
    }
  }

  reviewStageLabel(stage: ReviewGateStage): string {
    return formatReviewStageLabel(stage);
  }

  activeProjectSummary(project: StudioProjectSummary): string {
    if (project.reviewGate.blockerCount > 0 || project.reviewGate.stage === 'publish_failed') {
      return project.reviewGate.primaryConcern;
    }

    return project.reviewGate.nextAction;
  }

  private buildPipeline(): void {
    const draft = this.projects.filter((project) => this.pipelineBucket(project) === 'draft').length;
    const aiGen = this.projects.filter((project) => this.pipelineBucket(project) === 'ai').length;
    const review = this.projects.filter((project) => this.pipelineBucket(project) === 'review').length;
    const published = this.projects.filter((project) => this.pipelineBucket(project) === 'published').length;
    const failed = this.projects.filter((project) => this.pipelineBucket(project) === 'failed').length;

    this.pipelineSegments = [
      { key: 'draft', label: 'Brief / Draft', count: draft },
      { key: 'ai', label: 'AI / Review', count: aiGen },
      { key: 'review', label: 'Approval / Release', count: review },
      { key: 'published', label: 'Published', count: published },
      { key: 'failed', label: 'Blocked', count: failed },
    ].filter((s) => s.count > 0);

    this.pipelineRows = [
      {
        label: 'Brief / Draft',
        description: 'Intake pendiente de primera generacion o de completar la estructura inicial.',
        count: draft,
        tagClass: 'console-tag--muted',
      },
      {
        label: 'AI / Review',
        description: 'Contenido con version viva que aun requiere lectura, calibracion o QA inicial.',
        count: aiGen,
        tagClass: 'console-tag--warning',
      },
      {
        label: 'Approval / Release',
        description: 'Piezas sin blockers que ya pueden aprobarse o entrar en release.',
        count: review,
        tagClass: 'console-tag--accent',
      },
      {
        label: 'Published',
        description: 'Contenido sincronizado y visible en destino final.',
        count: published,
        tagClass: 'console-tag--success',
      },
      {
        label: 'Blocked',
        description: 'Blockers editoriales o fallos de publish que requieren intervencion.',
        count: failed,
        tagClass: 'console-tag--danger',
      },
    ];
  }

  private buildReadiness(incidents: number): void {
    const session = this.sessionService.session();
    this.readinessChecks = [
      {
        label: 'Destinations connected',
        detail: this.sites.length
          ? `${this.sites.length} publishing surface${this.sites.length > 1 ? 's' : ''} configured.`
          : 'No destinations yet — add one to start publishing.',
        ok: this.sites.length > 0,
      },
      {
        label: 'Pipeline active',
        detail: this.projects.length
          ? `${this.projects.length} project${this.projects.length > 1 ? 's' : ''} in the workspace.`
          : 'No projects created yet.',
        ok: this.projects.length > 0,
      },
      {
        label: 'Publishing healthy',
        detail: incidents === 0
          ? 'No blocked projects or failed jobs.'
          : `${incidents} operational incident${incidents > 1 ? 's' : ''} need attention.`,
        ok: incidents === 0,
      },
      {
        label: 'Identity provider',
        detail: session?.identityProvider?.enabled
          ? `SSO active via ${session.identityProvider.issuer || 'configured IdP'}.`
          : 'Using API key fallback authentication.',
        ok: session?.identityProvider?.enabled ?? false,
      },
    ];
  }

  private pipelineBucket(project: StudioProjectSummary): 'draft' | 'ai' | 'review' | 'published' | 'failed' {
    switch (project.reviewGate.stage) {
      case 'published':
        return 'published';
      case 'qa_blocked':
      case 'publish_failed':
        return 'failed';
      case 'ready_to_approve':
      case 'approved':
      case 'publish_queued':
        return 'review';
      case 'awaiting_generation':
        return 'draft';
      case 'needs_review':
      default:
        return project.latestVersion?.status === 'draft' ? 'draft' : 'ai';
    }
  }

  private projectNeedsAttention(project: StudioProjectSummary): boolean {
    return project.reviewGate.blockerCount > 0 || project.reviewGate.stage === 'publish_failed';
  }

  private projectAttentionRank(project: StudioProjectSummary): number {
    switch (project.reviewGate.stage) {
      case 'publish_failed':
        return 5;
      case 'qa_blocked':
        return 4;
      case 'ready_to_approve':
        return 3;
      case 'approved':
      case 'publish_queued':
        return 2;
      case 'needs_review':
        return 1;
      default:
        return 0;
    }
  }
}
