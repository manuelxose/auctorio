import { CommonModule, DatePipe } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import type {
  PublicationListItem,
  StudioPermission,
  StudioProjectSummary,
  StudioSiteSummary,
} from '../models/studio.models';
import { StudioApiService } from '../services/studio-api.service';
import { StudioSessionService } from '../services/studio-session.service';
import { StudioPageHeaderComponent } from '../components/studio-page-header.component';
import { StudioStatStripComponent, type StudioStatItem } from '../components/studio-stat-strip.component';
import { formatApiError } from '../utils/api-error';

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
                  <p>{{ project.site.name }} · {{ project.goal }}</p>
                </div>
                <span class="console-tag" [ngClass]="projectTagClass(project.status)">{{ project.status.replace('_', ' ') }}</span>
              </article>
            </div>
          </section>
        </aside>
      </div>

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
  pipelineRows: Array<{ label: string; description: string; count: number; tagClass: string }> = [];
  pipelineSegments: Array<{ key: string; label: string; count: number }> = [];
  readinessChecks: Array<{ label: string; detail: string; ok: boolean }> = [];

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
          .filter((p) => !['published', 'publish_failed'].includes(p.status))
          .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

        const publishedJobs = this.publications.filter((p) => p.status === 'published').length;
        const failedJobs = this.publications.filter((p) => p.status === 'failed').length;
        const failedProjects = this.projects.filter((p) => p.status === 'publish_failed').length;
        const incidentCount = failedJobs + failedProjects;

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

  projectTagClass(status: string): string {
    switch (status) {
      case 'published': return 'console-tag--success';
      case 'publish_failed': return 'console-tag--danger';
      case 'approved':
      case 'qa_passed': return 'console-tag--accent';
      default: return 'console-tag--muted';
    }
  }

  private buildPipeline(): void {
    const draft = this.countProjects('draft');
    const aiGen = this.countProjects('ai_generated');
    const review = this.countProjects('qa_passed') + this.countProjects('approved');
    const published = this.countProjects('published');
    const failed = this.countProjects('publish_failed');

    this.pipelineSegments = [
      { key: 'draft', label: 'Draft', count: draft },
      { key: 'ai', label: 'AI generation', count: aiGen },
      { key: 'review', label: 'Review', count: review },
      { key: 'published', label: 'Published', count: published },
      { key: 'failed', label: 'Failed', count: failed },
    ].filter((s) => s.count > 0);

    this.pipelineRows = [
      {
        label: 'Draft',
        description: 'Briefs recien creados o todavia sin una primera salida de IA.',
        count: draft,
        tagClass: 'console-tag--muted',
      },
      {
        label: 'AI generation',
        description: 'Contenido generado que todavia no completo QA ni aprobacion.',
        count: aiGen,
        tagClass: 'console-tag--warning',
      },
      {
        label: 'Review and QA',
        description: 'Piezas listas para decision humana o ya aprobadas.',
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
        label: 'Failed',
        description: 'Publicaciones fallidas que requieren intervencion.',
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
          ? 'No failed jobs or blocked projects.'
          : `${incidents} incident${incidents > 1 ? 's' : ''} need attention.`,
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

  private countProjects(status: StudioProjectSummary['status']): number {
    return this.projects.filter((project) => project.status === status).length;
  }
}
