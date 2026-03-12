import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import type { PublicationListItem, StudioProjectSummary, StudioSiteSummary } from '../models/studio.models';
import { StudioApiService } from '../services/studio-api.service';
import { formatApiError } from '../utils/api-error';

type CalendarFocus = 'all' | 'updated' | 'releaseReady' | 'published';

type CalendarEvent = {
  id: string;
  dayKey: string;
  title: string;
  kind: 'project' | 'publication';
  label: string;
  detail: string;
  status: string;
  occurredAt: string;
  link: string[];
};

type CalendarGroup = {
  dayKey: string;
  title: string;
  events: CalendarEvent[];
};

@Component({
  selector: 'app-editorial-calendar-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  template: `
    <section class="console-page">
      <header class="console-page__header">
        <div class="console-page__copy">
          <p class="console-kicker">Editorial</p>
          <h1 class="console-page__title">Calendar</h1>
          <p class="console-page__intro">
            Agenda operativa del workspace: actividad editorial, handoffs de revisión y publicaciones recientes mientras llega la planificación temporal completa.
          </p>
        </div>

        <div class="console-page__actions">
          <a class="console-button console-button--secondary" routerLink="/studio/publishing/scheduled">
            Open scheduled
          </a>
          <button type="button" class="console-button" (click)="loadData()">Refresh calendar</button>
        </div>
      </header>

      <div class="console-banner console-banner--error" *ngIf="error">{{ error }}</div>

      <div class="console-stat-grid" *ngIf="!loading">
        <article class="console-stat-card">
          <p class="console-stat-card__label">Updated today</p>
          <strong class="console-stat-card__value">{{ updatedTodayCount }}</strong>
          <span class="console-stat-card__detail">Piezas que tocaron el pipeline editorial en la jornada actual.</span>
        </article>

        <article class="console-stat-card">
          <p class="console-stat-card__label">Published this week</p>
          <strong class="console-stat-card__value">{{ publishedThisWeekCount }}</strong>
          <span class="console-stat-card__detail">Publicaciones completadas durante la ventana reciente de operación.</span>
        </article>

        <article class="console-stat-card">
          <p class="console-stat-card__label">Ready for release</p>
          <strong class="console-stat-card__value">{{ releaseReadyCount }}</strong>
          <span class="console-stat-card__detail">Aprobadas o en cola, listas para pasar por el tramo final de publish.</span>
        </article>

        <article class="console-stat-card">
          <p class="console-stat-card__label">Destinations active</p>
          <strong class="console-stat-card__value">{{ activeDestinationCount }}</strong>
          <span class="console-stat-card__detail">Destinos que tuvieron actividad editorial o de publicación en la ventana observada.</span>
        </article>
      </div>

      <div class="console-workspace" *ngIf="!loading; else loadingState">
        <div class="console-workspace__main">
          <section class="console-surface">
            <div class="console-surface__head">
              <div>
                <p class="console-surface__eyebrow">Agenda</p>
                <h2 class="console-surface__title">Editorial timeline</h2>
              </div>
            </div>

            <form class="console-toolbar console-toolbar--stretch" [formGroup]="filterForm">
              <label class="console-search console-search--wide">
                <span>Search</span>
                <input
                  type="text"
                  formControlName="query"
                  placeholder="Project, destination or event type"
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
                  <option value="all">All activity</option>
                  <option value="updated">Updated</option>
                  <option value="releaseReady">Release ready</option>
                  <option value="published">Published</option>
                </select>
              </label>
            </form>

            <div class="console-calendar-stack" *ngIf="calendarGroups.length; else emptyCalendar">
              <section class="console-calendar-day" *ngFor="let group of calendarGroups">
                <div class="console-calendar-day__head">
                  <h3>{{ group.title }}</h3>
                  <span class="console-tag console-tag--muted">{{ group.events.length }} events</span>
                </div>

                <div class="console-feed">
                  <article class="console-feed__item" *ngFor="let event of group.events">
                    <div>
                      <strong>{{ event.title }}</strong>
                      <p>{{ event.detail }}</p>
                    </div>
                    <div class="console-calendar-day__meta">
                      <span class="console-tag" [class.console-tag--accent]="event.kind === 'project'">
                        {{ event.label }}
                      </span>
                      <a class="console-link" [routerLink]="event.link">{{ event.status }}</a>
                    </div>
                  </article>
                </div>
              </section>
            </div>
          </section>
        </div>

        <aside class="console-workspace__aside">
          <section class="console-surface">
            <div class="console-surface__head">
              <div>
                <p class="console-surface__eyebrow">Release lane</p>
                <h2 class="console-surface__title">Ready or queued</h2>
              </div>
            </div>

            <div class="console-action-stack" *ngIf="releaseProjects.length; else emptyReleaseLane">
              <a class="console-action-card" *ngFor="let project of releaseProjects" [routerLink]="['/studio/publishing/scheduled']">
                <div>
                  <strong>{{ project.title }}</strong>
                  <span>{{ project.site.name }} · {{ project.status }}</span>
                </div>
                <span class="console-tag console-tag--accent">Release</span>
              </a>
            </div>
          </section>

          <section class="console-surface">
            <div class="console-surface__head">
              <div>
                <p class="console-surface__eyebrow">Interpretation</p>
                <h2 class="console-surface__title">How to read this calendar</h2>
              </div>
            </div>

            <ul class="console-note-list">
              <li class="console-note-list__item">
                Esta vista no promete programación futura exacta: ordena la cadencia editorial observable hoy.
              </li>
              <li class="console-note-list__item">
                Combina cambios de proyectos con publication jobs para dar una lectura continua del workflow.
              </li>
              <li class="console-note-list__item">
                Cuando exista scheduling real, esta pantalla podrá pasar de agenda operativa a calendario editorial completo.
              </li>
            </ul>
          </section>
        </aside>
      </div>

      <ng-template #loadingState>
        <section class="console-empty-state">
          <div>
            <p class="console-kicker">Editorial</p>
            <h2>Loading operational calendar</h2>
            <p>Estamos agrupando actividad editorial y de publicación por día para construir la agenda.</p>
          </div>
        </section>
      </ng-template>

      <ng-template #emptyCalendar>
        <div class="console-empty-compact">
          <p>No calendar events match the current filters.</p>
        </div>
      </ng-template>

      <ng-template #emptyReleaseLane>
        <div class="console-empty-compact">
          <p>No ready or queued pieces right now.</p>
        </div>
      </ng-template>
    </section>
  `,
})
export class EditorialCalendarPageComponent implements OnInit {
  private readonly api = inject(StudioApiService);

  readonly filterForm = new FormGroup({
    query: new FormControl('', { nonNullable: true }),
    siteId: new FormControl('', { nonNullable: true }),
    focus: new FormControl<CalendarFocus>('all', { nonNullable: true }),
  });

  sites: StudioSiteSummary[] = [];
  projects: StudioProjectSummary[] = [];
  publications: PublicationListItem[] = [];
  calendarGroups: CalendarGroup[] = [];
  releaseProjects: StudioProjectSummary[] = [];
  updatedTodayCount = 0;
  publishedThisWeekCount = 0;
  releaseReadyCount = 0;
  activeDestinationCount = 0;
  loading = true;
  error = '';

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
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(todayStart);
    weekStart.setDate(weekStart.getDate() - 6);

    const projectEvents = this.projects
      .filter((project) => !siteId || project.siteId === siteId)
      .filter((project) => {
        if (focus === 'releaseReady') {
          return ['approved', 'publish_queued'].includes(project.status);
        }
        if (focus === 'published') {
          return project.status === 'published';
        }
        return true;
      })
      .map<CalendarEvent>((project) => ({
        id: `project-${project.id}`,
        dayKey: this.dayKey(project.updatedAt),
        title: project.title,
        kind: 'project',
        label: 'Project update',
        detail: `${project.site.name} · ${project.goal} · ${project.status}`,
        status: 'Open article',
        occurredAt: project.updatedAt,
        link: ['/studio/editorial/articles', project.id],
      }));

    const publicationEvents = this.publications
      .filter((item) => !siteId || item.site.id === siteId)
      .filter((item) => {
        if (focus === 'updated') {
          return false;
        }
        if (focus === 'releaseReady') {
          return ['queued', 'processing', 'draft_synced'].includes(item.status);
        }
        if (focus === 'published') {
          return item.status === 'published';
        }
        return true;
      })
      .map<CalendarEvent>((item) => ({
        id: `publication-${item.id}`,
        dayKey: this.dayKey(item.updatedAt),
        title: item.project.title,
        kind: 'publication',
        label: 'Publishing',
        detail: `${item.site.name} · ${item.action} · ${item.status}`,
        status: 'Open history',
        occurredAt: item.updatedAt,
        link: ['/studio/publishing/history'],
      }));

    const events = [...projectEvents, ...publicationEvents]
      .filter((event) => {
        if (!query) {
          return true;
        }

        return [event.title, event.detail, event.label]
          .join(' ')
          .toLowerCase()
          .includes(query);
      })
      .sort((left, right) => Date.parse(right.occurredAt) - Date.parse(left.occurredAt));

    const grouped = new Map<string, CalendarEvent[]>();
    events.forEach((event) => {
      grouped.set(event.dayKey, [...(grouped.get(event.dayKey) ?? []), event]);
    });

    this.calendarGroups = [...grouped.entries()].map(([dayKey, dayEvents]) => ({
      dayKey,
      title: this.labelForDay(dayKey, todayStart),
      events: dayEvents,
    }));

    this.updatedTodayCount = this.projects.filter(
      (project) => Date.parse(project.updatedAt) >= todayStart.getTime(),
    ).length;
    this.publishedThisWeekCount = this.publications.filter((item) => {
      const updated = Date.parse(item.updatedAt);
      return item.status === 'published' && updated >= weekStart.getTime();
    }).length;
    this.releaseReadyCount = this.projects.filter((project) =>
      ['approved', 'publish_queued'].includes(project.status),
    ).length;
    this.activeDestinationCount = new Set(
      [
        ...this.projects.map((project) => project.siteId),
        ...this.publications.map((item) => item.site.id),
      ],
    ).size;

    this.releaseProjects = this.projects
      .filter((project) => ['approved', 'publish_queued'].includes(project.status))
      .filter((project) => !siteId || project.siteId === siteId)
      .slice(0, 6);
  }

  private dayKey(value: string): string {
    const date = new Date(value);
    return new Date(date.getFullYear(), date.getMonth(), date.getDate()).toISOString();
  }

  private labelForDay(dayKey: string, todayStart: Date): string {
    const date = new Date(dayKey);
    const diff = Math.round((todayStart.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

    if (diff === 0) {
      return 'Today';
    }
    if (diff === 1) {
      return 'Yesterday';
    }
    if (diff <= 6) {
      return 'This week';
    }

    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }
}
