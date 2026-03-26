import { CommonModule, DatePipe } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { PublicationListItem } from '../models/studio.models';
import { StudioPageHeaderComponent } from '../components/studio-page-header.component';
import { StudioStatStripComponent, type StudioStatItem } from '../components/studio-stat-strip.component';
import { StudioApiService } from '../services/studio-api.service';
import { formatApiError } from '../utils/api-error';

type PublicationStatusFilter =
  | ''
  | 'queued'
  | 'processing'
  | 'draft_synced'
  | 'published'
  | 'failed'
  | 'canceled';

@Component({
  selector: 'app-deployments-page',
  standalone: true,
  imports: [CommonModule, RouterLink, DatePipe, StudioPageHeaderComponent, StudioStatStripComponent],
  template: `
    <section class="console-page">
      <app-studio-page-header
        kicker="Publishing"
        title="History"
        intro="Historial de publish, sync draft, errores y trazabilidad operativa por destino."
      >
        <div page-meta *ngIf="!loading">
          <span class="console-tag console-tag--success">{{ publishedCount }} published</span>
          <span class="console-tag console-tag--accent">{{ inFlightCount }} in flight</span>
          <span class="console-tag console-tag--warning">{{ failedCount }} incidents</span>
        </div>

        <div page-actions>
          <a class="console-button console-button--secondary" routerLink="/studio/publishing/destinations">
            Open destinations
          </a>
          <button type="button" class="console-button console-button--secondary" (click)="resetFilters()">
            Reset filters
          </button>
          <button type="button" class="console-button" (click)="loadPublications()">
            Refresh history
          </button>
        </div>
      </app-studio-page-header>

      <div class="console-banner console-banner--error" *ngIf="error">{{ error }}</div>

      <app-studio-stat-strip *ngIf="!loading" [items]="historyStats"></app-studio-stat-strip>

      <section class="console-surface console-surface--hero" *ngIf="!loading">
        <div class="console-hero-grid">
          <div class="console-hero-copy">
            <p class="console-surface__eyebrow">Runtime posture</p>
            <h2 class="console-surface__title">Release trace and incident view</h2>
            <p class="console-hero-copy__body">{{ runtimeNarrative }}</p>

            <div class="console-header-strip">
              <article class="console-header-strip__card">
                <span>Published jobs</span>
                <strong>{{ publishedCount }}</strong>
                <small>Successful publish executions already visible on connected destinations.</small>
              </article>
              <article class="console-header-strip__card">
                <span>Runtime active</span>
                <strong>{{ inFlightCount }}</strong>
                <small>Queued, processing and draft sync jobs still moving through the release runtime.</small>
              </article>
              <article class="console-header-strip__card">
                <span>Requires action</span>
                <strong>{{ failedCount }}</strong>
                <small>Publishing incidents that still require direct operator attention or retry.</small>
              </article>
            </div>
          </div>

          <div class="console-focus-stack">
            <div class="console-surface__head">
              <div>
                <p class="console-surface__eyebrow">Focus now</p>
                <h2 class="console-surface__title">Runtime priority queue</h2>
              </div>
            </div>

            <div class="console-focus-list" *ngIf="priorityPublications.length; else emptyPriorityPublications">
              <a
                class="console-focus-card"
                *ngFor="let item of priorityPublications.slice(0, 3)"
                [routerLink]="['/studio/projects', item.project.id]"
              >
                <div>
                  <strong>{{ item.project.title }}</strong>
                  <p>{{ item.site.name }} · {{ priorityPublicationNarrative(item) }}</p>
                </div>
                <span class="console-tag" [ngClass]="publicationTagClass(item.status)">{{ item.status }}</span>
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
                <p class="console-surface__eyebrow">Filters</p>
                <h2 class="console-surface__title">Publication history</h2>
              </div>
              <span class="console-tag console-tag--muted">{{ filteredPublications.length }} runtime events</span>
            </div>

            <div class="console-toolbar console-toolbar--stretch">
              <label class="console-search console-search--wide">
                <span>Search</span>
                <input
                  type="text"
                  [value]="query"
                  (input)="updateQuery($event)"
                  placeholder="Project, destination or external id"
                />
              </label>

              <label class="console-select">
                <span>Status</span>
                <select [value]="selectedStatus" (change)="updateStatus($event)">
                  <option value="">All statuses</option>
                  <option *ngFor="let status of statuses" [value]="status">{{ status }}</option>
                </select>
              </label>
            </div>

            <div class="console-table" *ngIf="filteredPublications.length; else emptyState">
              <div class="console-table__head console-table__head--deployments">
                <span>Project</span>
                <span>Destination</span>
                <span>Action</span>
                <span>Status</span>
                <span>Updated</span>
              </div>

              <article class="console-table__row console-table__row--deployments" *ngFor="let item of filteredPublications">
                <div class="console-table__primary">
                  <a [routerLink]="['/studio/projects', item.project.id]">{{ item.project.title }}</a>
                  <small>{{ item.version.versionNumber ? 'V' + item.version.versionNumber : 'Version' }}</small>
                </div>

                <span>{{ item.site.name }}</span>
                <span>{{ item.action }} · {{ item.targetStatus || 'n/a' }}</span>
                <span>
                  <span class="console-tag" [ngClass]="publicationTagClass(item.status)">
                    {{ item.status }}
                  </span>
                </span>
                <span>{{ item.updatedAt | date: 'short' }}</span>
              </article>
            </div>
          </section>
        </div>

        <aside class="console-workspace__aside">
          <section class="console-surface console-surface--editorial">
            <div class="console-surface__head">
              <div>
                <p class="console-surface__eyebrow">Failures</p>
                <h2 class="console-surface__title">Needs attention</h2>
              </div>
            </div>

            <div class="console-feed" *ngIf="failedItems.length; else healthyRuntime">
              <article class="console-feed__item" *ngFor="let failure of failedItems">
                <div>
                  <strong>{{ failure.project.title }}</strong>
                  <p>{{ failure.site.name }} · {{ failure.action }}</p>
                </div>
                <p class="console-feed__error">{{ failure.error || 'Unknown publishing error' }}</p>
              </article>
            </div>
          </section>

          <section class="console-surface">
            <div class="console-surface__head">
              <div>
                <p class="console-surface__eyebrow">Governance links</p>
                <h2 class="console-surface__title">Release control surfaces</h2>
              </div>
            </div>

            <div class="console-action-stack">
              <a class="console-action-card" routerLink="/studio/publishing/scheduled">
                <strong>Scheduled release queue</strong>
                <span>Gestiona piezas aprobadas, draft syncs y cola previa a publish.</span>
              </a>
              <a class="console-action-card" routerLink="/studio/publishing/destinations">
                <strong>Destination governance</strong>
                <span>Revisa credenciales, contratos de salida y posture operativa por destino.</span>
              </a>
              <a class="console-action-card" routerLink="/studio/editorial/pipeline">
                <strong>Editorial pipeline</strong>
                <span>Vuelve al flujo upstream cuando un incidente de publishing nace antes del release.</span>
              </a>
            </div>
          </section>
        </aside>
      </div>

      <ng-template #loadingState>
        <section class="console-empty-state">
          <div>
            <p class="console-kicker">Publishing</p>
            <h2>Loading publishing history</h2>
            <p>Estamos reuniendo eventos runtime, incidentes y trazabilidad reciente por destino.</p>
          </div>
        </section>
      </ng-template>

      <ng-template #emptyPriorityPublications>
        <div class="console-empty-compact">
          <p>No runtime priorities right now.</p>
        </div>
      </ng-template>

      <ng-template #emptyState>
        <section class="console-empty-state">
          <div>
            <p class="console-kicker">No matching publication jobs</p>
            <h2>No publication history for the current filters</h2>
            <p>Prueba a limpiar filtros o a publicar una pieza desde el pipeline editorial.</p>
          </div>
          <a class="console-button console-button--secondary" routerLink="/studio/editorial/pipeline">
            Open pipeline
          </a>
        </section>
      </ng-template>

      <ng-template #healthyRuntime>
        <div class="console-empty-compact">
          <p>No failed publication jobs right now.</p>
        </div>
      </ng-template>
    </section>
  `,
})
export class DeploymentsPageComponent implements OnInit {
  private readonly api = inject(StudioApiService);

  readonly statuses: PublicationStatusFilter[] = [
    'queued',
    'processing',
    'draft_synced',
    'published',
    'failed',
    'canceled',
  ];

  publications: PublicationListItem[] = [];
  filteredPublications: PublicationListItem[] = [];
  failedItems: PublicationListItem[] = [];
  loading = true;
  error = '';
  query = '';
  selectedStatus: PublicationStatusFilter = '';

  publishedCount = 0;
  queuedCount = 0;
  processingCount = 0;
  draftSyncedCount = 0;
  failedCount = 0;

  get inFlightCount(): number {
    return this.queuedCount + this.processingCount + this.draftSyncedCount;
  }

  get historyStats(): StudioStatItem[] {
    return [
      {
        label: 'Published',
        value: this.publishedCount,
        detail: 'Jobs que terminaron en publicacion efectiva.',
        tone: this.publishedCount > 0 ? 'success' : 'muted',
      },
      {
        label: 'In flight',
        value: this.inFlightCount,
        detail: 'Cola, procesamiento y draft sync activos del runtime editorial.',
        tone: this.inFlightCount > 0 ? 'accent' : 'muted',
      },
      {
        label: 'Draft sync',
        value: this.draftSyncedCount,
        detail: 'Sincronizaciones a borrador completadas sin publicar aun.',
        tone: this.draftSyncedCount > 0 ? 'accent' : 'muted',
      },
      {
        label: 'Failures',
        value: this.failedCount,
        detail: 'Incidentes que requieren revision operativa.',
        tone: this.failedCount > 0 ? 'warning' : 'muted',
      },
    ];
  }

  get runtimeNarrative(): string {
    if (!this.publications.length) {
      return 'Todavia no hay eventos de publishing en el workspace. La superficie queda preparada para leer runtime real cuando el equipo empiece a sincronizar drafts o publicar.';
    }

    if (this.failedCount > 0) {
      return `${this.failedCount} incidente${this.failedCount > 1 ? 's siguen' : ' sigue'} abierto${this.failedCount > 1 ? 's' : ''}. History deja de ser una tabla plana y pasa a ser la vista de control para retries, fallos y trazabilidad downstream.`;
    }

    if (this.inFlightCount > 0) {
      return `${this.inFlightCount} job${this.inFlightCount > 1 ? 's siguen' : ' sigue'} en movimiento entre cola, procesamiento o draft sync. El runtime esta activo y sin incidentes criticos visibles.`;
    }

    return `${this.publishedCount} release${this.publishedCount > 1 ? 's ya quedaron' : ' ya quedo'} trazado${this.publishedCount > 1 ? 's' : ''} sin fallos activos. Publishing history esta funcionando como memoria operativa real del release.`;
  }

  get priorityPublications(): PublicationListItem[] {
    return [...this.publications].sort((left, right) => {
      const priorityDelta = this.publicationPriorityRank(left) - this.publicationPriorityRank(right);
      if (priorityDelta !== 0) {
        return priorityDelta;
      }

      return Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
    });
  }

  ngOnInit(): void {
    this.loadPublications();
  }

  loadPublications(): void {
    this.loading = true;
    this.error = '';

    this.api.listPublications(1, 100).subscribe({
      next: (response) => {
        this.publications = response.items;
        this.failedItems = this.publications.filter((item) => item.status === 'failed').slice(0, 5);
        this.publishedCount = this.countByStatus('published');
        this.queuedCount = this.countByStatus('queued');
        this.processingCount = this.countByStatus('processing');
        this.draftSyncedCount = this.countByStatus('draft_synced');
        this.failedCount = this.countByStatus('failed');
        this.loading = false;
        this.applyFilters();
      },
      error: (error) => {
        this.error = formatApiError(error);
        this.loading = false;
      },
    });
  }

  resetFilters(): void {
    this.query = '';
    this.selectedStatus = '';
    this.applyFilters();
  }

  updateQuery(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.query = target.value || '';
    this.applyFilters();
  }

  updateStatus(event: Event): void {
    const target = event.target as HTMLSelectElement;
    this.selectedStatus = (target.value || '') as PublicationStatusFilter;
    this.applyFilters();
  }

  publicationTagClass(status: PublicationListItem['status']): string {
    switch (status) {
      case 'published':
        return 'console-tag--success';
      case 'failed':
        return 'console-tag--danger';
      case 'queued':
      case 'draft_synced':
        return 'console-tag--accent';
      case 'processing':
        return 'console-tag--warning';
      case 'canceled':
      default:
        return 'console-tag--muted';
    }
  }

  priorityPublicationNarrative(item: PublicationListItem): string {
    if (item.status === 'failed') {
      return `${item.action} failed · ${item.error || 'Unknown runtime error'}`;
    }

    if (item.status === 'processing') {
      return `${item.action} is currently processing on the destination runtime.`;
    }

    if (item.status === 'queued') {
      return `${item.action} is queued and waiting for runtime execution.`;
    }

    if (item.status === 'draft_synced') {
      return `${item.action} finished as draft sync${item.externalId ? ` · ${item.externalId}` : ''}.`;
    }

    if (item.status === 'published') {
      return `${item.action} reached destination successfully${item.externalUrl ? ' and has a live URL.' : '.'}`;
    }

    return `${item.action} was canceled before completion.`;
  }

  private applyFilters(): void {
    const search = this.query.trim().toLowerCase();

    this.filteredPublications = this.publications.filter((item) => {
      const matchesStatus = !this.selectedStatus || item.status === this.selectedStatus;
      const haystack = [
        item.project.title,
        item.site.name,
        item.externalId || '',
        item.error || '',
      ]
        .join(' ')
        .toLowerCase();

      const matchesQuery = !search || haystack.includes(search);
      return matchesStatus && matchesQuery;
    });
  }

  private countByStatus(status: PublicationListItem['status']): number {
    return this.publications.filter((item) => item.status === status).length;
  }

  private publicationPriorityRank(item: PublicationListItem): number {
    switch (item.status) {
      case 'failed':
        return 0;
      case 'processing':
        return 1;
      case 'queued':
        return 2;
      case 'draft_synced':
        return 3;
      case 'published':
        return 4;
      case 'canceled':
      default:
        return 5;
    }
  }
}
