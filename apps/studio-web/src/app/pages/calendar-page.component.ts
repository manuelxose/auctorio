import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Observable, Subscription, timer } from 'rxjs';
import { StudioApiService } from '../services/studio-api.service';
import { PlanningApiService } from '../services/planning-api.service';
import { AppContextService } from '../services/app-context.service';
import { ToastService } from '../services/toast.service';
import { EditorialContextService } from '../services/editorial-context.service';
import { AppIconComponent } from '../components/ui/app-icon.component';
import { AppEmptyStateComponent } from '../components/ui/app-empty-state.component';
import type { CalendarEvent, PublicationChannel, StudioProjectSummary, PublishingAccount } from '../models/studio.models';
import { localDate, localTime, zonedToUtc } from '../components/planning/planning-utils';

type CalendarView = 'list' | 'day' | 'week' | 'month';

@Component({
  selector: 'app-calendar-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, AppIconComponent, AppEmptyStateComponent],
  template: `
    <section class="au-page">
      <header class="au-page__header">
        <div>
          <p class="au-page__eyebrow">Publishing timeline</p>
          <h1 class="au-page__title">Calendar</h1>
          <p class="au-page__subtitle">When each piece goes out on {{ siteName }}. Schedule content, then drag a card or use Move to change its date. Briefs are decided in the plan; publishing, retries and cancellations live in Publications.</p>
          <p class="au-hint au-mb-0">Times in {{ timeZone }}. <span class="au-calendar-legend au-calendar-legend--proposal">Dashed: proposal, not scheduled to publish</span> · <span class="au-calendar-legend">Solid: scheduled publication</span></p>
        </div>
        <div class="au-page__actions">
          <button class="au-btn au-btn--primary" type="button" (click)="showScheduleForm = !showScheduleForm" [attr.aria-expanded]="showScheduleForm" aria-controls="schedule-form">
            <app-icon name="plus"></app-icon>
            {{ showScheduleForm ? 'Hide form' : 'Schedule a publication' }}
          </button>
          <select class="au-select au-filter-select" [(ngModel)]="channelFilter" (ngModelChange)="load()" aria-label="Filter by channel">
            <option value="">All channels</option>
            <option value="website">Website</option>
            <option value="x">X</option>
            <option value="instagram">Instagram</option>
          </select>
        </div>
      </header>

      <div class="au-tabs">
        <button *ngFor="let view of views" class="au-tab" [class.is-active]="view.key === viewMode" type="button" (click)="setView(view.key)">
          {{ view.label }}
        </button>
        <div class="au-toolbar__spacer"></div>
        <button class="au-btn au-btn--ghost au-btn--icon au-btn--sm" type="button" (click)="move(-1)" aria-label="Previous period">
          <app-icon name="chevron-left"></app-icon>
        </button>
        <span class="au-calendar-label">{{ rangeLabel }}</span>
        <button class="au-btn au-btn--ghost au-btn--icon au-btn--sm" type="button" (click)="move(1)" aria-label="Next period">
          <app-icon name="chevron-right"></app-icon>
        </button>
      </div>

      <div class="au-banner au-banner--error" *ngIf="error">
        <app-icon name="warning"></app-icon>
        <span class="au-banner__text">{{ error }}</span>
        <button class="au-banner__action" type="button" (click)="load()">Retry</button>
      </div>
      <p class="au-visually-hidden" role="status" aria-live="polite">{{ moveResult }}</p>
      <div class="au-banner au-banner--success" *ngIf="notice">
        <app-icon name="circle-check"></app-icon>
        <span class="au-banner__text">{{ notice }}</span>
      </div>

      <section id="schedule-form" class="au-panel au-panel--padded au-mb-3" *ngIf="showScheduleForm">
        <h2 class="au-panel__title">Schedule a publication</h2>
        <p class="au-panel__subtitle au-mb-3">Three steps: the content, where it goes, and when. Social channels need an approved social piece on the content.</p>
        <form class="au-field-grid au-calendar-form" (ngSubmit)="createFromCalendar()">
          <label class="au-field au-mb-0">
            <span class="au-field__label">1 · Content</span>
            <select class="au-select" name="projectId" [(ngModel)]="draft.projectId" required>
              <option value="" disabled>Select content</option>
              <option *ngFor="let project of projects" [value]="project.id">{{ project.title }}</option>
            </select>
          </label>
          <label class="au-field au-mb-0">
            <span class="au-field__label">2 · Channel</span>
            <select class="au-select" name="channel" [(ngModel)]="draft.channel">
              <option value="website">Website ({{ siteName }})</option>
              <option value="x">X</option>
              <option value="instagram">Instagram</option>
            </select>
          </label>
          <label class="au-field au-mb-0" *ngIf="draft.channel !== 'website'">
            <span class="au-field__label">2 · Account</span>
            <select class="au-select" name="accountId" [(ngModel)]="draft.accountId">
              <option value="">Default account</option>
              <option *ngFor="let account of accountsForChannel" [value]="account.id">{{ account.displayName }}</option>
            </select>
          </label>
          <label class="au-field au-mb-0">
            <span class="au-field__label">3 · When</span>
            <input class="au-input" type="datetime-local" name="scheduledFor" [(ngModel)]="draft.scheduledFor" required aria-describedby="schedule-tz" />
            <span class="au-hint" id="schedule-tz">{{ timeZone }}</span>
          </label>
          <div class="au-form__actions au-mt-0 au-mb-0">
            <button class="au-btn au-btn--primary" type="submit" [disabled]="creating">
              <app-icon name="plus"></app-icon>
              {{ creating ? 'Scheduling…' : 'Add to calendar' }}
            </button>
          </div>
        </form>
      </section>

      <!-- List / agenda -->
      <section class="au-panel au-panel--padded" *ngIf="viewMode === 'list'">
        <p class="au-hint au-mb-2" *ngIf="dragHint">Drag a card to move it. Drop to reschedule.</p>
        <app-empty-state
          *ngIf="events.length === 0"
          icon="calendar"
          title="Nothing scheduled yet"
          text="Add a publication above or schedule from the content workspace."
        ></app-empty-state>
        <div *ngFor="let group of groupedEvents" class="au-calendar-group">
          <h3 class="au-calendar-group__date">{{ group.label }}</h3>
          <div
            class="au-calendar-card"
            [class.is-proposal]="entry.item.kind === 'plan_item'"
            role="group" [attr.aria-label]="ariaLabel(entry.item)"
            [draggable]="canDrag(entry.item)"
            (dragstart)="onDragStart($event, entry.item)"
            (dragend)="onDragEnd($event)"
            (dragover)="$event.preventDefault()"
            (drop)="onDropOnCard($event, entry.item)"
            *ngFor="let entry of group.entries"
          >
            <ng-container *ngTemplateOutlet="cardTpl; context: { $implicit: entry.item }"></ng-container>
          </div>
        </div>
      </section>

      <!-- Day / week columns -->
      <section class="au-calendar-grid" *ngIf="viewMode === 'day' || viewMode === 'week'">
        <div class="au-calendar-col" *ngFor="let day of dayColumns"
          (dragover)="$event.preventDefault()" (drop)="onDropOnDay($event, day.date)">
          <h3 class="au-calendar-group__date">{{ day.label }}</h3>
          <div class="au-calendar-card" *ngFor="let event of day.events"
            [class.is-proposal]="event.kind === 'plan_item'"
            role="group" [attr.aria-label]="ariaLabel(event)"
            [draggable]="canDrag(event)"
            (dragstart)="onDragStart($event, event)"
            (dragend)="onDragEnd($event)"
            (dragover)="$event.preventDefault()"
            (drop)="onDropOnCard($event, event)"
          >
            <ng-container *ngTemplateOutlet="cardTpl; context: { $implicit: event }"></ng-container>
          </div>
          <div class="au-calendar-col__empty" *ngIf="day.events.length === 0">—</div>
        </div>
      </section>

      <!-- Month -->
      <section class="au-calendar-grid au-calendar-grid--month" *ngIf="viewMode === 'month'">
        <div class="au-calendar-day" *ngFor="let day of monthDays" [style.grid-column-start]="day.dayNum === 1 ? ((day.date.getDay() + 6) % 7) + 1 : null"
          (dragover)="$event.preventDefault()" (drop)="onDropOnDay($event, day.date)">
          <span class="au-calendar-day__num" [class.is-today]="isToday(day.date)">{{ day.dayNum }}</span>
          <span class="au-calendar-day__count" *ngIf="day.events.length > 0">{{ day.events.length }} planned</span>
          <button type="button" class="au-calendar-chip" *ngFor="let event of day.events.slice(0, 3)"
            [class.is-proposal]="event.kind === 'plan_item'"
            [draggable]="canDrag(event)" (dragstart)="onDragStart($event, event)" (dragend)="onDragEnd($event)"
            (click)="focusDay(day.date)" [title]="event.title" [attr.aria-label]="ariaLabel(event)">
            <i class="au-channel-dot" [class]="'au-channel-dot au-channel-dot--' + event.channel"></i>
            <span class="au-calendar-chip__text">{{ event.title }}</span>
          </button>
          <button type="button" class="au-calendar-chip au-calendar-chip--more" *ngIf="day.events.length > 3" (click)="focusDay(day.date)">
            +{{ day.events.length - 3 }} more
          </button>
        </div>
      </section>
    </section>

    <ng-template #cardTpl let-event>
      <div class="au-calendar-card__body">
        <span class="au-calendar-time" [title]="utcLabel(event.scheduledFor)">{{ timeLabel(event.scheduledFor) }}</span>
        <span class="au-channel" [class]="'au-channel--' + event.channel">{{ event.channel }}</span>
        <img class="au-calendar-thumb" *ngIf="event.thumbnail" [src]="event.thumbnail" alt="" loading="lazy" />
        <div class="au-calendar-card__text">
          <strong>{{ event.title }}</strong>
          <span class="au-calendar-card__meta">{{ event.destination }} · {{ event.projectTitle }}</span>
          <span class="au-inline au-mt-1">
            <span class="au-badge au-badge--neutral">{{ event.kind === 'plan_item' ? 'Proposal' : 'Publication' }}</span>
            <span class="au-badge" [class]="statusClass(event.status)">{{ statusLabel(event) }}</span>
            <span class="au-badge au-badge--neutral" *ngIf="event.contentType">{{ event.contentType }}</span>
            <span class="au-badge au-badge--brand" *ngIf="event.automated">automatic</span>
          </span>
          <span class="au-calendar-card__error" *ngIf="event.lastError">{{ event.lastError }}</span>
          <a class="au-table__sub au-link" *ngIf="event.externalUrl" [href]="event.externalUrl" target="_blank" rel="noopener">{{ event.externalUrl }}</a>
        </div>
        <div class="au-calendar-card__actions" (click)="$event.stopPropagation()">
          <button *ngIf="event.projectId" class="au-btn au-btn--ghost au-btn--sm" type="button" [routerLink]="['/studio/content', event.projectId]">
            Open
          </button>
          <button *ngIf="event.status !== 'published' && event.status !== 'canceled'" class="au-btn au-btn--ghost au-btn--sm" type="button" (click)="startMove(event)" [attr.aria-expanded]="movingId === event.id" [attr.aria-label]="'Move ' + event.title">
            <app-icon name="calendar"></app-icon>
            Move
          </button>
          <!-- Single homes: briefs are decided in the plan, publication state in Publications. -->
          <a *ngIf="event.kind === 'plan_item'" class="au-btn au-btn--ghost au-btn--sm" routerLink="/studio/editorial-plan" [queryParams]="{ plan: event.planId, item: event.id }">
            <app-icon name="plan"></app-icon>
            {{ event.status === 'proposed' ? 'Review in plan' : 'Open in plan' }}
          </a>
          <a *ngIf="event.kind === 'publication'" class="au-btn au-btn--ghost au-btn--sm" routerLink="/studio/publications" [queryParams]="{ id: event.id }">
            <app-icon name="publications"></app-icon>
            {{ event.status === 'failed' ? 'Fix in Publications' : 'Manage' }}
          </a>
        </div>
      </div>
      <form class="au-inline au-mt-2" *ngIf="movingId === event.id" (ngSubmit)="confirmMove(event)" (keydown.escape)="cancelMove()" (click)="$event.stopPropagation()">
        <label class="au-field au-mb-0">
          <span class="au-field__label">Move to ({{ timeZone }})</span>
          <input class="au-input" type="datetime-local" name="moveTo" [(ngModel)]="moveTo" required />
        </label>
        <button class="au-btn au-btn--primary au-btn--sm" type="submit" [disabled]="!moveTo">Move</button>
        <button class="au-btn au-btn--ghost au-btn--sm" type="button" (click)="cancelMove()">Cancel</button>
      </form>
    </ng-template>
  `,
})
export class CalendarPageComponent implements OnInit, OnDestroy {
  private readonly api = inject(StudioApiService);
  private readonly planning = inject(PlanningApiService);
  private readonly appContext = inject(AppContextService);
  private readonly toast = inject(ToastService);
  private readonly context = inject(EditorialContextService);
  private readonly route = inject(ActivatedRoute, { optional: true });
  /** The calendar always shows the top bar's active site; the shell re-creates the page when it changes. */
  private readonly siteId = this.appContext.activeSite()?.id ?? '';
  readonly siteName = this.appContext.activeSite()?.name ?? 'this site';

  views: Array<{ key: CalendarView; label: string }> = [
    { key: 'list', label: 'List' },
    { key: 'day', label: 'Day' },
    { key: 'week', label: 'Week' },
    { key: 'month', label: 'Month' },
  ];
  viewMode: CalendarView = 'week';
  events: CalendarEvent[] = [];
  /** The site's IANA timezone (from the API); wall-clock inputs and labels use it, the API stores UTC. */
  timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  channelFilter = '';
  anchor = new Date();
  dragHint = false;
  showScheduleForm = false;
  movingId = '';
  moveTo = '';
  moveResult = '';
  error = '';
  notice = '';
  creating = false;
  projects: StudioProjectSummary[] = [];
  accounts: PublishingAccount[] = [];
  draft = { projectId: '', channel: 'website' as PublicationChannel, accountId: '', scheduledFor: '' };

  get accountsForChannel(): PublishingAccount[] {
    return this.accounts.filter((account) => account.platform === this.draft.channel && account.enabled);
  }

  private draggedEvent: CalendarEvent | null = null;
  private readonly reschedulingIds = new Set<string>();
  private refreshSubscription: Subscription | null = null;

  get rangeLabel(): string {
    const options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
    if (this.viewMode === 'list') {
      return `${this.anchor.toLocaleDateString('en-US', options)} → ${new Date(this.anchor.getTime() + 13 * 24 * 3_600_000).toLocaleDateString('en-US', options)}`;
    }
    if (this.viewMode === 'month') {
      return this.anchor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    }
    return this.anchor.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  }

  ngOnInit(): void {
    this.context.update({ area: 'calendar' });
    // ?projectId= comes from an article's "Schedule in Calendar": open the form with it preselected.
    const projectId = this.route?.snapshot.queryParamMap.get('projectId');
    if (projectId) {
      this.draft.projectId = projectId;
      this.showScheduleForm = true;
    }
    this.api.listProjects({ page: 1, pageSize: 50, siteId: this.siteId || undefined }).subscribe({
      next: (response) => {
        this.projects = response.items;
      },
      error: () => {
        this.projects = [];
      },
    });
    this.api.listPublishingAccounts().subscribe({
      next: (response) => {
        this.accounts = response.items;
      },
      error: () => {
        this.accounts = [];
      },
    });
    this.load();
    this.refreshSubscription = timer(30_000, 30_000).subscribe(() => {
      if (!document.hidden) {
        this.load(true);
      }
    });
  }

  ngOnDestroy(): void {
    this.refreshSubscription?.unsubscribe();
    this.context.clear(['area', 'siteId', 'planId', 'planItemId', 'periodFrom', 'periodTo']);
  }

  private range(): { from: Date; to: Date } {
    if (this.viewMode === 'month') {
      const start = new Date(this.anchor.getFullYear(), this.anchor.getMonth(), 1);
      const end = new Date(this.anchor.getFullYear(), this.anchor.getMonth() + 1, 1);
      return { from: start, to: end };
    }
    if (this.viewMode === 'week') {
      const day = this.anchor.getDay();
      const diff = day === 0 ? -6 : 1 - day;
      const start = new Date(this.anchor.getFullYear(), this.anchor.getMonth(), this.anchor.getDate() + diff);
      return { from: start, to: new Date(start.getTime() + 7 * 24 * 3_600_000) };
    }
    if (this.viewMode === 'day') {
      const start = new Date(this.anchor.getFullYear(), this.anchor.getMonth(), this.anchor.getDate());
      return { from: start, to: new Date(start.getTime() + 24 * 3_600_000) };
    }
    const start = new Date(this.anchor.getFullYear(), this.anchor.getMonth(), this.anchor.getDate());
    return { from: start, to: new Date(start.getTime() + 14 * 24 * 3_600_000) };
  }

  load(silent = false): void {
    if (!silent) this.error = '';
    const { from, to } = this.range();
    const day = (date: Date): string => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    this.context.update({ siteId: this.siteId || null, periodFrom: day(from), periodTo: day(new Date(to.getTime() - 1)) });
    this.api
      .listCalendar(from.toISOString(), to.toISOString(), this.channelFilter ? (this.channelFilter as PublicationChannel) : undefined, this.siteId || undefined)
      .subscribe({
        next: (response) => {
          this.events = response.items;
          if (response.timeZone) this.timeZone = response.timeZone;
        },
        error: () => {
          if (!silent) {
            this.error = 'Calendar could not be loaded. Try again.';
          }
        },
      });
  }

  setView(view: CalendarView): void {
    this.viewMode = view;
    this.load();
  }

  move(delta: number): void {
    if (this.viewMode === 'month') {
      this.anchor = new Date(this.anchor.getFullYear(), this.anchor.getMonth() + delta, 1);
    } else if (this.viewMode === 'week') {
      this.anchor = new Date(this.anchor.getTime() + delta * 7 * 24 * 3_600_000);
    } else {
      this.anchor = new Date(this.anchor.getTime() + delta * 24 * 3_600_000);
    }
    this.load();
  }

  get groupedEvents(): Array<{ label: string; entries: Array<{ item: CalendarEvent }> }> {
    const byDate = new Map<string, CalendarEvent[]>();
    for (const event of this.events) {
      const key = event.scheduledFor ? localDate(event.scheduledFor, this.timeZone) : 'unscheduled';
      byDate.set(key, [...(byDate.get(key) ?? []), event]);
    }
    return Array.from(byDate.entries())
      .sort(([a], [b]) => (a === 'unscheduled' ? 1 : b === 'unscheduled' ? -1 : a.localeCompare(b)))
      .map(([key, entries]) => ({
        label: key === 'unscheduled' ? 'Unscheduled' : new Date(`${key}T12:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'long', month: 'long', day: 'numeric' }),
        entries: entries
          .sort((a, b) => (a.scheduledFor ?? '').localeCompare(b.scheduledFor ?? ''))
          .map((item) => ({ item })),
      }));
  }

  get dayColumns(): Array<{ label: string; date: Date; events: CalendarEvent[] }> {
    const { from } = this.range();
    const count = this.viewMode === 'day' ? 1 : 7;
    return Array.from({ length: count }, (_value, index) => {
      const date = new Date(from.getTime() + index * 24 * 3_600_000);
      return {
        date,
        label: date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
        events: this.eventsOn(date),
      };
    });
  }

  get monthDays(): Array<{ date: Date; dayNum: number; events: CalendarEvent[] }> {
    const { from } = this.range();
    const daysInMonth = new Date(from.getFullYear(), from.getMonth() + 1, 0).getDate();
    return Array.from({ length: daysInMonth }, (_value, index) => {
      const date = new Date(from.getFullYear(), from.getMonth(), index + 1);
      return {
        date,
        dayNum: index + 1,
        events: this.eventsOn(date),
      };
    });
  }

  /** Calendar cells are browser-local dates; an event belongs to the cell of its site-local day. */
  private dayKey(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  private eventsOn(date: Date): CalendarEvent[] {
    const key = this.dayKey(date);
    return this.events.filter((event) => event.scheduledFor && localDate(event.scheduledFor, this.timeZone) === key);
  }

  ariaLabel(event: CalendarEvent): string {
    const kind = event.kind === 'plan_item' ? 'Proposal, not scheduled to publish' : 'Scheduled publication';
    const when = event.scheduledFor ? `${localDate(event.scheduledFor, this.timeZone)} ${localTime(event.scheduledFor, this.timeZone)} ${this.timeZone}` : 'unscheduled';
    return `${kind}: ${event.title}, ${this.statusLabel(event)}, ${when}`;
  }

  utcLabel(value: string | null): string {
    return value ? `Stored as ${new Date(value).toISOString().slice(0, 16).replace('T', ' ')} UTC` : '';
  }

  canDrag(event: CalendarEvent): boolean {
    return !['published', 'generating', 'canceled'].includes(event.status) && !this.reschedulingIds.has(event.id);
  }

  statusLabel(event: CalendarEvent): string {
    if (event.kind === 'publication') return event.status;
    return ({ proposed: 'proposal', approved: 'approved brief', generating: 'writing draft', content_ready: 'draft ready', review_required: 'in review' } as Record<string, string>)[event.status] ?? event.status.replace(/_/g, ' ');
  }

  focusDay(date: Date): void {
    this.anchor = date;
    this.viewMode = 'day';
    this.load();
  }

  isToday(date: Date): boolean {
    return date.toDateString() === new Date().toDateString();
  }

  timeLabel(value: string | null): string {
    return value ? localTime(value, this.timeZone) : '—';
  }

  statusClass(status: string): string {
    switch (status) {
      case 'published':
      case 'approved':
      case 'content_ready':
        return 'au-badge--success';
      case 'proposed':
      case 'generating':
      case 'review_required':
        return 'au-badge--brand';
      case 'failed':
        return 'au-badge--danger';
      case 'scheduled':
      case 'queued':
        return 'au-badge--warning';
      default:
        return 'au-badge--neutral';
    }
  }

  // ── Drag & drop rescheduling with optimistic UI ──

  onDragStart(event: DragEvent, item: CalendarEvent): void {
    if (item.status === 'published' || this.reschedulingIds.has(item.id)) {
      event.preventDefault();
      return;
    }
    this.draggedEvent = item;
    this.dragHint = true;
    event.dataTransfer?.setData('text/plain', item.id);
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
    }
    (event.currentTarget as HTMLElement)?.classList.add('is-dragging');
  }

  onDragEnd(event: DragEvent): void {
    (event.currentTarget as HTMLElement)?.classList.remove('is-dragging');
    this.draggedEvent = null;
    this.dragHint = false;
  }

  isRescheduling(publicationId: string): boolean {
    return this.reschedulingIds.has(publicationId);
  }

  onDropOnCard(event: DragEvent, target: CalendarEvent): void {
    event.preventDefault();
    const source = this.draggedEvent;
    if (!source || source.id === target.id) {
      return;
    }
    const targetTime = target.scheduledFor ? new Date(target.scheduledFor) : new Date();
    targetTime.setMinutes(targetTime.getMinutes() + 5);
    this.reschedule(source, targetTime);
  }

  onDropOnDay(event: DragEvent, day: Date): void {
    event.preventDefault();
    const source = this.draggedEvent;
    if (!source) {
      return;
    }
    const time = localTime(source.scheduledFor ?? new Date(), this.timeZone);
    this.reschedule(source, zonedToUtc(this.dayKey(day), time, this.timeZone));
  }

  private reschedule(eventItem: CalendarEvent, target: Date): void {
    if (this.reschedulingIds.has(eventItem.id)) return;
    if (eventItem.status === 'published') {
      this.error = 'Published items cannot be rescheduled.';
      return;
    }
    this.dragHint = false;
    const previous = eventItem.scheduledFor;
    const optimisticSchedule = target.toISOString();
    this.reschedulingIds.add(eventItem.id);
    // Optimistic update.
    eventItem.scheduledFor = optimisticSchedule;
    // Plan items keep their own proposal date; publications own the real delivery time.
    const request: Observable<unknown> = eventItem.kind === 'plan_item'
      ? this.planning.updateItem(eventItem.id, { scheduledFor: optimisticSchedule })
      : this.api.reschedulePublication(eventItem.id, optimisticSchedule);
    request.subscribe({
      next: () => {
        this.reschedulingIds.delete(eventItem.id);
        this.toast.success(eventItem.kind === 'plan_item' ? 'Proposal moved.' : 'Publication rescheduled.');
        this.moveResult = `${eventItem.title} moved to ${localDate(target, this.timeZone)} ${localTime(target, this.timeZone)} (${this.timeZone}).`;
        this.load(true);
      },
      error: (err: unknown) => {
        if (eventItem.scheduledFor === optimisticSchedule) eventItem.scheduledFor = previous;
        this.reschedulingIds.delete(eventItem.id);
        this.error = eventItem.kind === 'plan_item' ? 'The proposal could not be moved.' : 'The publication could not be rescheduled.';
        if (/scheduled_in_past/.test(JSON.stringify((err as { error?: unknown })?.error ?? ''))) this.error += ' Pick a future time, or use Publish now in Publications.';
        this.moveResult = this.error;
        this.load(true);
      },
    });
  }

  // Keyboard alternative to drag: pick an exact date and time, result announced via aria-live.
  startMove(item: CalendarEvent): void {
    this.movingId = this.movingId === item.id ? '' : item.id;
    const at = item.scheduledFor ?? new Date();
    this.moveTo = `${localDate(at, this.timeZone)}T${localTime(at, this.timeZone)}`;
    this.context.update({ planItemId: item.kind === 'plan_item' && this.movingId ? item.id : null, planId: item.kind === 'plan_item' && this.movingId ? item.planId : null });
  }
  cancelMove(): void {
    this.movingId = '';
    this.context.update({ planItemId: null, planId: null });
  }
  confirmMove(item: CalendarEvent): void {
    const target = this.fromWallClock(this.moveTo);
    if (!target) return;
    this.movingId = '';
    this.moveResult = '';
    this.reschedule(item, target);
  }

  /** `YYYY-MM-DDTHH:mm` from a datetime-local input, read in the site's timezone (DST-safe). */
  private fromWallClock(value: string): Date | null {
    const [date, time] = value.split('T');
    if (!date || !time) return null;
    const target = zonedToUtc(date, time.slice(0, 5), this.timeZone);
    return Number.isNaN(target.getTime()) ? null : target;
  }

  createFromCalendar(): void {
    if (!this.draft.projectId || !this.draft.scheduledFor) {
      this.error = 'Select content and a scheduled time.';
      return;
    }
    this.creating = true;
    this.error = '';
    this.notice = '';
    this.api.createPublication({
      projectId: this.draft.projectId,
      channel: this.draft.channel,
      siteId: this.draft.channel === 'website' ? (this.siteId || undefined) : undefined,
      accountId: this.draft.channel !== 'website' ? (this.draft.accountId || undefined) : undefined,
      scheduledFor: this.fromWallClock(this.draft.scheduledFor)?.toISOString(),
    }).subscribe({
      next: () => {
        this.creating = false;
        this.toast.success('Publication added to the calendar.');
        this.draft = { projectId: '', channel: 'website', accountId: '', scheduledFor: '' };
        this.load(true);
      },
      error: (err) => {
        this.creating = false;
        this.error = err?.error?.error?.message || 'The publication could not be scheduled.';
      },
    });
  }
}
