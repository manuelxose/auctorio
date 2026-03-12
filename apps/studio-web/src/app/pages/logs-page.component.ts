import { CommonModule, DatePipe } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import type { PublicationListItem } from '../models/studio.models';
import { StudioApiService } from '../services/studio-api.service';
import { formatApiError } from '../utils/api-error';

@Component({
  selector: 'app-logs-page',
  standalone: true,
  imports: [CommonModule, RouterLink, DatePipe],
  template: `
    <section class="console-page">
      <header class="console-page__header">
        <div class="console-page__copy">
          <p class="console-kicker">Automation</p>
          <h1 class="console-page__title">Jobs Monitor</h1>
          <p class="console-page__intro">
            Cola visible del runtime editorial: errores, jobs en espera, cancelaciones y trazas que requieren accion.
          </p>
        </div>

        <div class="console-page__actions">
          <span class="console-tag console-tag--accent">Live data</span>
          <a class="console-button console-button--secondary" routerLink="/studio/publishing/history">
            Open publishing history
          </a>
          <button type="button" class="console-button" (click)="loadData()">
            Refresh jobs
          </button>
        </div>
      </header>

      <div class="console-banner console-banner--error" *ngIf="error">{{ error }}</div>

      <div class="console-stat-grid" *ngIf="!loading">
        <article class="console-stat-card">
          <p class="console-stat-card__label">Failed jobs</p>
          <strong class="console-stat-card__value">{{ failedLogs.length }}</strong>
          <span class="console-stat-card__detail">Errores de publicacion con mensaje trazable.</span>
        </article>

        <article class="console-stat-card">
          <p class="console-stat-card__label">Queued jobs</p>
          <strong class="console-stat-card__value">{{ queuedLogs.length }}</strong>
          <span class="console-stat-card__detail">Jobs pendientes que aun no completaron el runtime.</span>
        </article>

        <article class="console-stat-card">
          <p class="console-stat-card__label">Canceled jobs</p>
          <strong class="console-stat-card__value">{{ canceledLogs.length }}</strong>
          <span class="console-stat-card__detail">Retiradas o reversiones explicitadas por el sistema.</span>
        </article>

        <article class="console-stat-card">
          <p class="console-stat-card__label">Last incident</p>
          <strong class="console-stat-card__value">{{ lastIncidentLabel }}</strong>
          <span class="console-stat-card__detail">Ultima senal que requiere diagnostico o seguimiento.</span>
        </article>
      </div>

      <div class="console-workspace">
        <div class="console-workspace__main">
          <section class="console-surface">
            <div class="console-surface__head">
              <div>
                <p class="console-surface__eyebrow">Incident stream</p>
                <h2 class="console-surface__title">Failed and canceled jobs</h2>
              </div>
            </div>

            <div class="console-log-list" *ngIf="incidentLogs.length; else noIncidents">
              <article class="console-log-entry" *ngFor="let item of incidentLogs">
                <div class="console-log-entry__head">
                  <div>
                    <a [routerLink]="['/studio/projects', item.project.id]">{{ item.project.title }}</a>
                    <p>{{ item.site.name }} · {{ item.action }} · {{ item.status }}</p>
                  </div>
                  <span class="console-tag console-tag--danger">{{ item.status }}</span>
                </div>

                <p class="console-log-entry__body">{{ item.error || 'No error payload returned.' }}</p>

                <div class="console-log-entry__meta">
                  <span>{{ item.updatedAt | date: 'short' }}</span>
                  <span *ngIf="item.externalId">external: {{ item.externalId }}</span>
                </div>
              </article>
            </div>
          </section>
        </div>

        <aside class="console-workspace__aside">
          <section class="console-surface">
            <div class="console-surface__head">
              <div>
                <p class="console-surface__eyebrow">Known caveats</p>
                <h2 class="console-surface__title">Operational context</h2>
              </div>
            </div>

            <ul class="console-note-list">
              <li class="console-note-list__item">
                Hoy esta vista usa publication jobs como cola visible del runtime editorial.
              </li>
              <li class="console-note-list__item">
                El siguiente paso es sumar workers de texto, imagen y webhooks a la misma superficie.
              </li>
              <li class="console-note-list__item">
                Publishing history conserva el detalle de release; jobs monitor prioriza salud operativa.
              </li>
            </ul>
          </section>

          <section class="console-surface">
            <div class="console-surface__head">
              <div>
                <p class="console-surface__eyebrow">Queued</p>
                <h2 class="console-surface__title">Waiting jobs</h2>
              </div>
            </div>

            <div class="console-feed" *ngIf="queuedLogs.length; else noQueued">
              <article class="console-feed__item" *ngFor="let item of queuedLogs.slice(0, 5)">
                <div>
                  <strong>{{ item.project.title }}</strong>
                  <p>{{ item.site.name }} · {{ item.action }}</p>
                </div>
                <span>{{ item.updatedAt | date: 'short' }}</span>
              </article>
            </div>
          </section>
        </aside>
      </div>

      <ng-template #noIncidents>
        <section class="console-empty-state">
          <div>
            <p class="console-kicker">No runtime incidents</p>
            <h2>The job stream is clear right now</h2>
            <p>No hay errores o cancelaciones visibles en los publication jobs.</p>
          </div>
          <a class="console-button console-button--secondary" routerLink="/studio/analytics/content-performance">
            Open analytics
          </a>
        </section>
      </ng-template>

      <ng-template #noQueued>
        <div class="console-empty-compact">
          <p>No queued jobs right now.</p>
        </div>
      </ng-template>
    </section>
  `,
})
export class LogsPageComponent implements OnInit {
  private readonly api = inject(StudioApiService);

  incidentLogs: PublicationListItem[] = [];
  failedLogs: PublicationListItem[] = [];
  queuedLogs: PublicationListItem[] = [];
  canceledLogs: PublicationListItem[] = [];
  loading = true;
  error = '';
  lastIncidentLabel = 'None';

  ngOnInit(): void {
    this.loadData();
  }

  loadData(): void {
    this.loading = true;
    this.error = '';

    forkJoin({
      failed: this.api.listPublications(1, 100, 'failed'),
      queued: this.api.listPublications(1, 100, 'queued'),
      canceled: this.api.listPublications(1, 100, 'canceled'),
    }).subscribe({
      next: ({ failed, queued, canceled }) => {
        this.failedLogs = failed.items;
        this.queuedLogs = queued.items;
        this.canceledLogs = canceled.items;
        this.incidentLogs = [...this.failedLogs, ...this.canceledLogs].sort((a, b) =>
          b.updatedAt.localeCompare(a.updatedAt),
        );
        this.lastIncidentLabel = this.incidentLogs[0]
          ? new Date(this.incidentLogs[0].updatedAt).toLocaleDateString()
          : 'None';
        this.loading = false;
      },
      error: (error) => {
        this.error = formatApiError(error);
        this.loading = false;
      },
    });
  }
}
