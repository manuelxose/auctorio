import { CommonModule, DatePipe, PercentPipe } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import type {
  PublicationListItem,
  StudioProjectSummary,
  StudioSiteSummary,
} from '../models/studio.models';
import { StudioApiService } from '../services/studio-api.service';
import { formatApiError } from '../utils/api-error';

type AnalyticsView = 'contentPerformance' | 'seoMetrics';

@Component({
  selector: 'app-analytics-page',
  standalone: true,
  imports: [CommonModule, RouterLink, DatePipe, PercentPipe],
  template: `
    <section class="console-page">
      <header class="console-page__header">
        <div class="console-page__copy">
          <p class="console-kicker">Analytics</p>
          <h1 class="console-page__title">{{ viewTitle }}</h1>
          <p class="console-page__intro">{{ viewDescription }}</p>
        </div>

        <div class="console-page__actions">
          <span class="console-tag console-tag--accent">Live data</span>
          <a class="console-button console-button--secondary" routerLink="/studio/publishing/history">
            Open history
          </a>
          <button type="button" class="console-button" (click)="loadData()">
            Refresh analytics
          </button>
        </div>
      </header>

      <div class="console-banner console-banner--error" *ngIf="error">{{ error }}</div>

      <div class="console-stat-grid" *ngIf="!loading">
        <article class="console-stat-card">
          <p class="console-stat-card__label">Destinations</p>
          <strong class="console-stat-card__value">{{ sites.length }}</strong>
          <span class="console-stat-card__detail">Superficies de publicacion conectadas al workspace.</span>
        </article>

        <article class="console-stat-card">
          <p class="console-stat-card__label">Projects</p>
          <strong class="console-stat-card__value">{{ projects.length }}</strong>
          <span class="console-stat-card__detail">Piezas activas observadas por esta vista.</span>
        </article>

        <article class="console-stat-card">
          <p class="console-stat-card__label">Publish success rate</p>
          <strong class="console-stat-card__value">{{ successRate | percent: '1.0-0' }}</strong>
          <span class="console-stat-card__detail">Ratio de jobs publicados sobre el total observado.</span>
        </article>

        <article class="console-stat-card">
          <p class="console-stat-card__label">Review ready</p>
          <strong class="console-stat-card__value">{{ reviewReadyCount }}</strong>
          <span class="console-stat-card__detail">Piezas en qa_passed o approved listas para release.</span>
        </article>
      </div>

      <div class="console-workspace">
        <div class="console-workspace__main">
          <section class="console-surface">
            <div class="console-surface__head">
              <div>
                <p class="console-surface__eyebrow">{{ primaryBlockEyebrow }}</p>
                <h2 class="console-surface__title">{{ primaryBlockTitle }}</h2>
              </div>
            </div>

            <div class="console-list-grid">
              <article class="console-list-card" *ngFor="let row of statusRows">
                <div>
                  <strong>{{ row.label }}</strong>
                  <p>{{ row.detail }}</p>
                </div>
                <span class="console-tag">{{ row.count }}</span>
              </article>
            </div>
          </section>

          <section class="console-surface">
            <div class="console-surface__head">
              <div>
                <p class="console-surface__eyebrow">Destination mix</p>
                <h2 class="console-surface__title">Where content is flowing</h2>
              </div>
            </div>

            <div class="console-list-grid" *ngIf="destinationRows.length; else noDestinations">
              <article class="console-list-card" *ngFor="let site of destinationRows">
                <div>
                  <strong>{{ site.name }}</strong>
                  <p>{{ site.type }} · {{ site.projectCount }} projects</p>
                </div>
                <span class="console-tag">{{ site.publishedProjectCount }} live</span>
              </article>
            </div>
          </section>
        </div>

        <aside class="console-workspace__aside">
          <section class="console-surface">
            <div class="console-surface__head">
              <div>
                <p class="console-surface__eyebrow">Recent activity</p>
                <h2 class="console-surface__title">Latest publishing signals</h2>
              </div>
            </div>

            <div class="console-feed" *ngIf="recentPublications.length; else noActivity">
              <article class="console-feed__item" *ngFor="let item of recentPublications">
                <div>
                  <strong>{{ item.project.title }}</strong>
                  <p>{{ item.site.name }} · {{ item.status }}</p>
                </div>
                <span>{{ item.updatedAt | date: 'short' }}</span>
              </article>
            </div>
          </section>

          <section class="console-surface">
            <div class="console-surface__head">
              <div>
                <p class="console-surface__eyebrow">Interpretation</p>
                <h2 class="console-surface__title">What this view tells you</h2>
              </div>
            </div>

            <ul class="console-note-list">
              <li class="console-note-list__item" *ngFor="let note of notes">
                {{ note }}
              </li>
            </ul>
          </section>
        </aside>
      </div>

      <ng-template #noDestinations>
        <div class="console-empty-compact">
          <p>No destination analytics yet.</p>
        </div>
      </ng-template>

      <ng-template #noActivity>
        <div class="console-empty-compact">
          <p>No publication activity yet.</p>
        </div>
      </ng-template>
    </section>
  `,
})
export class AnalyticsPageComponent implements OnInit {
  private readonly api = inject(StudioApiService);
  private readonly route = inject(ActivatedRoute);

  sites: StudioSiteSummary[] = [];
  projects: StudioProjectSummary[] = [];
  publications: PublicationListItem[] = [];
  destinationRows: StudioSiteSummary[] = [];
  recentPublications: PublicationListItem[] = [];
  statusRows: Array<{ label: string; detail: string; count: number }> = [];
  notes: string[] = [];
  loading = true;
  error = '';
  successRate = 0;
  reviewReadyCount = 0;

  view: AnalyticsView = 'contentPerformance';

  get viewTitle(): string {
    return this.view === 'seoMetrics' ? 'SEO Metrics' : 'Content Performance';
  }

  get viewDescription(): string {
    return this.view === 'seoMetrics'
      ? 'Calidad SEO del flujo editorial: metadata, readiness y oportunidades antes de publicar.'
      : 'Rendimiento editorial del workspace: throughput, publish outcomes y mezcla de destinos.';
  }

  get primaryBlockEyebrow(): string {
    return this.view === 'seoMetrics' ? 'SEO readiness' : 'Editorial throughput';
  }

  get primaryBlockTitle(): string {
    return this.view === 'seoMetrics' ? 'Optimization and quality signals' : 'Status distribution';
  }

  ngOnInit(): void {
    this.view =
      (this.route.snapshot.data['analyticsView'] as AnalyticsView | undefined) ??
      'contentPerformance';
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
        this.destinationRows = [...this.sites]
          .sort((a, b) => b.projectCount - a.projectCount)
          .slice(0, 6);
        this.recentPublications = this.publications.slice(0, 6);

        const publicationTotal = this.publications.length;
        this.successRate = publicationTotal
          ? this.publications.filter((item) => item.status === 'published').length / publicationTotal
          : 0;
        this.reviewReadyCount = this.projects.filter((item) =>
          ['qa_passed', 'approved'].includes(item.status),
        ).length;

        const statusConfig: Array<{
          key: StudioProjectSummary['status'];
          label: string;
          detail: string;
        }> = this.view === 'seoMetrics'
          ? [
              {
                key: 'draft',
                label: 'Brief stage',
                detail: 'Piezas que todavia necesitan estructura y objetivo editorial claros.',
              },
              {
                key: 'ai_generated',
                label: 'Needs optimization',
                detail: 'Contenido generado que aun no ha pasado por QA y ajuste editorial.',
              },
              {
                key: 'qa_failed',
                label: 'SEO risk',
                detail: 'Piezas bloqueadas por checks de estructura, metadata o imagen.',
              },
              {
                key: 'qa_passed',
                label: 'Ready for approval',
                detail: 'Contenido optimizado y listo para decision editorial final.',
              },
              {
                key: 'approved',
                label: 'Ready to publish',
                detail: 'Piezas ya listas para pasar a release sin friccion SEO adicional.',
              },
              {
                key: 'published',
                label: 'Live content',
                detail: 'Contenido ya visible en destino final.',
              },
            ]
          : [
              {
                key: 'draft',
                label: 'Draft',
                detail: 'Briefs y proyectos todavia sin una primera salida AI.',
              },
              {
                key: 'ai_generated',
                label: 'AI generated',
                detail: 'Piezas con contenido generado que todavia no cerraron QA.',
              },
              {
                key: 'qa_failed',
                label: 'QA failed',
                detail: 'Bloqueos que frenan el paso a revision y publish.',
              },
              {
                key: 'qa_passed',
                label: 'QA passed',
                detail: 'Piezas listas para aprobacion y release.',
              },
              {
                key: 'approved',
                label: 'Approved',
                detail: 'Contenido aprobado, pendiente de publicar o sincronizar.',
              },
              {
                key: 'published',
                label: 'Published',
                detail: 'Contenido ya visible y distribuido en destino final.',
              },
            ];

        this.statusRows = statusConfig.map((item) => ({
          ...item,
          count: this.projects.filter((project) => project.status === item.key).length,
        }));

        this.notes = this.buildNotes();
        this.loading = false;
      },
      error: (error) => {
        this.error = formatApiError(error);
        this.loading = false;
      },
    });
  }

  private buildNotes(): string[] {
    if (this.view === 'seoMetrics') {
      return [
        'Esta vista usa estados editoriales y QA como proxy de readiness SEO hasta que exista una capa analitica dedicada.',
        'Los siguientes pasos naturales son topic planning, clustering y scorecards por pieza.',
        'Destinations y publishing history completan la lectura de impacto operacional.',
      ];
    }

    return [
      'La distribucion de estados revela donde se atasca hoy el workflow editorial antes de publicar.',
      'Publishing history y jobs completan esta vista para diagnosticar runtime e integraciones.',
      'El siguiente salto es incorporar performance real por contenido y no solo trazas operativas.',
    ];
  }
}
