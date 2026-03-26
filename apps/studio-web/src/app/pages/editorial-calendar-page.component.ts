import { CommonModule } from '@angular/common';
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
import {
  reviewStageLabel as formatReviewStageLabel,
  reviewStageTone as getReviewStageTone,
} from '../utils/review-gate';

type CalendarFocus = 'all' | 'updated' | 'releaseReady' | 'published';
type TagTone = 'muted' | 'accent' | 'warning' | 'success' | 'danger';

type CalendarEvent = {
  id: string;
  dayKey: string;
  title: string;
  kind: 'project' | 'publication';
  label: string;
  detail: string;
  status: string;
  tone: TagTone;
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
          <span class="console-stat-card__detail">Piezas que realmente pueden entrar en scheduled release sin blockers editoriales abiertos.</span>
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
                  placeholder="Project, destination, gate, runtime or event type"
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
                      <span
                        class="console-tag"
                        [class.console-tag--accent]="event.tone === 'accent'"
                        [class.console-tag--warning]="event.tone === 'warning'"
                        [class.console-tag--success]="event.tone === 'success'"
                        [class.console-tag--danger]="event.tone === 'danger'"
                        [class.console-tag--muted]="event.tone === 'muted'"
                      >
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
              <a class="console-action-card" *ngFor="let project of releaseProjects" [routerLink]="releaseLink(project)">
                <div>
                  <strong>{{ project.title }}</strong>
                  <span>{{ project.site.name }} · {{ releaseNarrative(project) }}</span>
                </div>
                <span
                  class="console-tag"
                  [class.console-tag--accent]="releaseTone(project) === 'accent'"
                  [class.console-tag--warning]="releaseTone(project) === 'warning'"
                  [class.console-tag--success]="releaseTone(project) === 'success'"
                  [class.console-tag--danger]="releaseTone(project) === 'danger'"
                  [class.console-tag--muted]="releaseTone(project) === 'muted'"
                >
                  {{ releaseBadge(project) }}
                </span>
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
                Combina review gate y publication jobs para dar una lectura continua del workflow, no un simple historial de enums técnicos.
              </li>
              <li class="console-note-list__item">
                Cuando exista scheduling real con ventanas temporales, esta agenda ya tendrá la semántica editorial correcta para crecer sin rehacerse.
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
          return this.isReleaseReady(project);
        }
        if (focus === 'published') {
          return project.reviewGate.stage === 'published';
        }
        return true;
      })
      .map<CalendarEvent>((project) => ({
        id: `project-${project.id}`,
        dayKey: this.dayKey(project.updatedAt),
        title: project.title,
        kind: 'project',
        label: this.projectEventLabel(project),
        detail: `${project.site.name} · ${project.goal} · ${this.projectEventDetail(project)}`,
        status: this.projectEventActionLabel(project),
        tone: this.projectEventTone(project.reviewGate.stage),
        occurredAt: project.updatedAt,
        link: this.projectEventLink(project),
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
        tone: this.publicationTone(item.status),
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
      this.isReleaseReady(project),
    ).length;
    this.activeDestinationCount = new Set(
      [
        ...this.projects.map((project) => project.siteId),
        ...this.publications.map((item) => item.site.id),
      ],
    ).size;

    this.releaseProjects = this.projects
      .filter((project) =>
        ['approved', 'publish_queued', 'publish_failed'].includes(project.reviewGate.stage) &&
        (project.reviewGate.publishReady || project.reviewGate.stage === 'publish_queued'),
      )
      .filter((project) => !siteId || project.siteId === siteId)
      .sort((left, right) => this.releasePriority(right) - this.releasePriority(left))
      .slice(0, 6);
  }

  releaseBadge(project: StudioProjectSummary): string {
    if (project.reviewGate.stage === 'publish_queued') {
      return 'Queued';
    }

    if (project.reviewGate.stage === 'publish_failed') {
      return 'Retry publish';
    }

    return 'Release ready';
  }

  releaseTone(project: StudioProjectSummary): TagTone {
    if (project.reviewGate.stage === 'publish_failed') {
      return 'danger';
    }

    if (project.reviewGate.stage === 'publish_queued') {
      return 'warning';
    }

    return 'accent';
  }

  releaseNarrative(project: StudioProjectSummary): string {
    if (project.reviewGate.stage === 'publish_failed') {
      return project.reviewGate.primaryConcern;
    }

    return project.reviewGate.nextAction;
  }

  releaseLink(project: StudioProjectSummary): string[] {
    if (project.reviewGate.stage === 'publish_queued') {
      return ['/studio/publishing/history'];
    }

    return ['/studio/publishing/scheduled'];
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

  private isReleaseReady(project: StudioProjectSummary): boolean {
    return (
      project.reviewGate.publishReady &&
      ['approved', 'publish_queued', 'publish_failed'].includes(project.reviewGate.stage)
    );
  }

  private projectEventLabel(project: StudioProjectSummary): string {
    if (project.reviewGate.stage === 'published') {
      return 'Live content';
    }

    if (project.reviewGate.stage === 'publish_queued') {
      return 'Queued for publish';
    }

    return formatReviewStageLabel(project.reviewGate.stage);
  }

  private projectEventDetail(project: StudioProjectSummary): string {
    if (project.reviewGate.blockerCount > 0 || project.reviewGate.stage === 'publish_failed') {
      return project.reviewGate.primaryConcern;
    }

    return project.reviewGate.nextAction;
  }

  private projectEventActionLabel(project: StudioProjectSummary): string {
    if (['approved', 'publish_queued', 'publish_failed'].includes(project.reviewGate.stage)) {
      return 'Open scheduled';
    }

    if (project.reviewGate.stage === 'published') {
      return 'Open article';
    }

    return 'Open article';
  }

  private projectEventLink(project: StudioProjectSummary): string[] {
    if (['approved', 'publish_queued', 'publish_failed'].includes(project.reviewGate.stage)) {
      return ['/studio/publishing/scheduled'];
    }

    return ['/studio/editorial/articles', project.id];
  }

  private projectEventTone(stage: ReviewGateStage): TagTone {
    return getReviewStageTone(stage);
  }

  private publicationTone(status: PublicationListItem['status']): TagTone {
    switch (status) {
      case 'published':
        return 'success';
      case 'failed':
        return 'danger';
      case 'queued':
      case 'processing':
      case 'draft_synced':
        return 'accent';
      default:
        return 'muted';
    }
  }

  private releasePriority(project: StudioProjectSummary): number {
    if (project.reviewGate.stage === 'publish_failed') {
      return 3;
    }

    if (project.reviewGate.stage === 'publish_queued') {
      return 2;
    }

    if (project.reviewGate.stage === 'approved') {
      return 1;
    }

    return 0;
  }
}
