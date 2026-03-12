import { CommonModule, DatePipe } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { PublicationListItem } from '../models/studio.models';
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
  imports: [CommonModule, RouterLink, DatePipe],
  template: `
    <section class="console-page">
      <header class="console-page__header">
        <div class="console-page__copy">
          <p class="console-kicker">Publishing</p>
          <h1 class="console-page__title">History</h1>
          <p class="console-page__intro">
            Historial de publish, sync draft, errores y trazabilidad operativa por destino.
          </p>
        </div>

        <div class="console-page__actions">
          <span class="console-tag console-tag--accent">Live data</span>
          <button type="button" class="console-button console-button--secondary" (click)="resetFilters()">
            Reset filters
          </button>
          <button type="button" class="console-button" (click)="loadPublications()">
            Refresh history
          </button>
        </div>
      </header>

      <div class="console-banner console-banner--error" *ngIf="error">{{ error }}</div>

      <div class="console-stat-grid" *ngIf="!loading">
        <article class="console-stat-card">
          <p class="console-stat-card__label">Published</p>
          <strong class="console-stat-card__value">{{ publishedCount }}</strong>
          <span class="console-stat-card__detail">Jobs que terminaron en publicacion efectiva.</span>
        </article>

        <article class="console-stat-card">
          <p class="console-stat-card__label">In flight</p>
          <strong class="console-stat-card__value">{{ queuedCount + processingCount }}</strong>
          <span class="console-stat-card__detail">Cola y procesamiento activo del runtime editorial.</span>
        </article>

        <article class="console-stat-card">
          <p class="console-stat-card__label">Draft sync</p>
          <strong class="console-stat-card__value">{{ draftSyncedCount }}</strong>
          <span class="console-stat-card__detail">Sincronizaciones a borrador sin publicar aun.</span>
        </article>

        <article class="console-stat-card">
          <p class="console-stat-card__label">Failures</p>
          <strong class="console-stat-card__value">{{ failedCount }}</strong>
          <span class="console-stat-card__detail">Incidentes que requieren revision operativa.</span>
        </article>
      </div>

      <div class="console-workspace">
        <div class="console-workspace__main">
          <section class="console-surface">
            <div class="console-surface__head">
              <div>
                <p class="console-surface__eyebrow">Filters</p>
                <h2 class="console-surface__title">Publication history</h2>
              </div>
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
                  <span class="console-tag" [class.console-tag--danger]="item.status === 'failed'">
                    {{ item.status }}
                  </span>
                </span>
                <span>{{ item.updatedAt | date: 'short' }}</span>
              </article>
            </div>
          </section>
        </div>

        <aside class="console-workspace__aside">
          <section class="console-surface">
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
                <p class="console-surface__eyebrow">Signals</p>
                <h2 class="console-surface__title">Publishing notes</h2>
              </div>
            </div>

            <ul class="console-note-list">
              <li class="console-note-list__item">
                La plataforma ya soporta draft, publish y unpublish con trazabilidad por job.
              </li>
              <li class="console-note-list__item">
                El dry-run seguro sigue siendo parte del modelo operativo cuando faltan credenciales.
              </li>
              <li class="console-note-list__item">
                El detalle completo de cada pieza enlaza a projects, briefs o articles sin perder contexto.
              </li>
            </ul>
          </section>
        </aside>
      </div>

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
}
