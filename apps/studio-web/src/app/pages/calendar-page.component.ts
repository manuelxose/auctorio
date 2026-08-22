import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Subscription, timer } from 'rxjs';
import { StudioApiService } from '../services/studio-api.service';
import { AppContextService } from '../services/app-context.service';
import { ConfirmService } from '../services/confirm.service';
import { ToastService } from '../services/toast.service';
import { AppIconComponent } from '../components/ui/app-icon.component';
import { AppEmptyStateComponent } from '../components/ui/app-empty-state.component';
import type { CalendarEvent, PublicationChannel, StudioProjectSummary, StudioSite, PublishingAccount } from '../models/studio.models';

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
          <p class="au-page__subtitle">Every scheduled article and social post, in one timeline.</p>
        </div>
        <div class="au-page__actions">
          <select class="au-select au-filter-select" [(ngModel)]="channelFilter" (ngModelChange)="load()" aria-label="Filter by channel">
            <option value="">All channels</option>
            <option value="website">Website</option>
            <option value="x">X</option>
            <option value="instagram">Instagram</option>
          </select>
          <select class="au-select au-filter-select" [(ngModel)]="siteFilter" (ngModelChange)="load()" aria-label="Filter by site">
            <option value="">All sites</option>
            <option *ngFor="let site of sites" [ngValue]="site.id">{{ site.name }}</option>
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
      <div class="au-banner au-banner--success" *ngIf="notice">
        <app-icon name="circle-check"></app-icon>
        <span class="au-banner__text">{{ notice }}</span>
      </div>

      <section class="au-panel au-panel--padded au-mb-3">
        <h2 class="au-panel__title">Schedule a publication</h2>
        <p class="au-panel__subtitle au-mb-3">Pick content, a channel and a time. Social channels need an approved social piece on the content.</p>
        <form class="au-field-grid au-calendar-form" (ngSubmit)="createFromCalendar()">
          <label class="au-field au-mb-0">
            <span class="au-field__label">Content</span>
            <select class="au-select" name="projectId" [(ngModel)]="draft.projectId" required>
              <option value="" disabled>Select content</option>
              <option *ngFor="let project of projects" [value]="project.id">{{ project.title }}</option>
            </select>
          </label>
          <label class="au-field au-mb-0">
            <span class="au-field__label">Channel</span>
            <select class="au-select" name="channel" [(ngModel)]="draft.channel">
              <option value="website">Website</option>
              <option value="x">X</option>
              <option value="instagram">Instagram</option>
            </select>
          </label>
          <label class="au-field au-mb-0" *ngIf="draft.channel === 'website'">
            <span class="au-field__label">Site</span>
            <select class="au-select" name="siteId" [(ngModel)]="draft.siteId">
              <option value="">Default site</option>
              <option *ngFor="let site of sites" [value]="site.id">{{ site.name }}</option>
            </select>
          </label>
          <label class="au-field au-mb-0" *ngIf="draft.channel !== 'website'">
            <span class="au-field__label">Account</span>
            <select class="au-select" name="accountId" [(ngModel)]="draft.accountId">
              <option value="">Default account</option>
              <option *ngFor="let account of accountsForChannel" [value]="account.id">{{ account.displayName }}</option>
            </select>
          </label>
          <label class="au-field au-mb-0">
            <span class="au-field__label">When</span>
            <input class="au-input" type="datetime-local" name="scheduledFor" [(ngModel)]="draft.scheduledFor" required />
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
            draggable="true"
            (dragstart)="onDragStart($event, entry.item)"
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
            draggable="true"
            (dragstart)="onDragStart($event, event)"
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
        <div class="au-calendar-day" *ngFor="let day of monthDays" (click)="focusDay(day.date)">
          <span class="au-calendar-day__num" [class.is-today]="isToday(day.date)">{{ day.dayNum }}</span>
          <span class="au-calendar-day__count" *ngIf="day.count > 0">{{ day.count }}</span>
          <span class="au-calendar-day__markers">
            <i class="au-channel-dot au-channel-dot--website" *ngIf="day.hasWebsite"></i>
            <i class="au-channel-dot au-channel-dot--x" *ngIf="day.hasX"></i>
            <i class="au-channel-dot au-channel-dot--instagram" *ngIf="day.hasInstagram"></i>
          </span>
        </div>
      </section>
    </section>

    <ng-template #cardTpl let-event>
      <div class="au-calendar-card__body">
        <span class="au-calendar-time">{{ timeLabel(event.scheduledFor) }}</span>
        <span class="au-channel" [class]="'au-channel--' + event.channel">{{ event.channel }}</span>
        <img class="au-calendar-thumb" *ngIf="event.thumbnail" [src]="event.thumbnail" alt="" loading="lazy" />
        <div class="au-calendar-card__text">
          <strong>{{ event.title }}</strong>
          <span class="au-calendar-card__meta">{{ event.destination }} · {{ event.projectTitle }}</span>
          <span class="au-inline au-mt-1">
            <span class="au-badge" [class]="statusClass(event.status)">{{ event.status }}</span>
            <span class="au-badge au-badge--brand" *ngIf="event.automated">automatic</span>
          </span>
          <span class="au-calendar-card__error" *ngIf="event.lastError">{{ event.lastError }}</span>
        </div>
        <div class="au-calendar-card__actions" (click)="$event.stopPropagation()">
          <button class="au-btn au-btn--ghost au-btn--sm" type="button" [routerLink]="['/studio/content', event.projectId]">
            Open
          </button>
          <button
            *ngIf="event.status === 'scheduled' || event.status === 'failed'"
            class="au-btn au-btn--ghost au-btn--sm" type="button" (click)="publishNow(event)"
          >
            <app-icon name="play"></app-icon>
            Publish now
          </button>
          <button
            *ngIf="event.status === 'scheduled'"
            class="au-btn au-btn--danger-ghost au-btn--sm" type="button" (click)="cancel(event)"
          >
            Cancel
          </button>
          <button
            *ngIf="event.status === 'failed'"
            class="au-btn au-btn--ghost au-btn--sm" type="button" (click)="retry(event)"
          >
            <app-icon name="refresh"></app-icon>
            Retry
          </button>
        </div>
      </div>
    </ng-template>
  `,
})
export class CalendarPageComponent implements OnInit, OnDestroy {
  private readonly api = inject(StudioApiService);
  private readonly appContext = inject(AppContextService);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);

  views: Array<{ key: CalendarView; label: string }> = [
    { key: 'list', label: 'List' },
    { key: 'day', label: 'Day' },
    { key: 'week', label: 'Week' },
    { key: 'month', label: 'Month' },
  ];
  viewMode: CalendarView = 'list';
  events: CalendarEvent[] = [];
  sites: StudioSite[] = [];
  channelFilter = '';
  siteFilter = '';
  anchor = new Date();
  dragHint = false;
  error = '';
  notice = '';
  creating = false;
  projects: StudioProjectSummary[] = [];
  accounts: PublishingAccount[] = [];
  draft = { projectId: '', channel: 'website' as PublicationChannel, siteId: '', accountId: '', scheduledFor: '' };

  get accountsForChannel(): PublishingAccount[] {
    return this.accounts.filter((account) => account.platform === this.draft.channel && account.enabled);
  }

  private draggedEvent: CalendarEvent | null = null;
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
    this.sites = this.appContext.sites();
    this.api.listProjects({ page: 1, pageSize: 50 }).subscribe({
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
    this.api
      .listCalendar(from.toISOString(), to.toISOString(), this.channelFilter ? (this.channelFilter as PublicationChannel) : undefined, this.siteFilter || undefined)
      .subscribe({
        next: (response) => {
          this.events = response.items;
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
      const date = event.scheduledFor ? new Date(event.scheduledFor) : null;
      const key = date ? date.toDateString() : 'unscheduled';
      byDate.set(key, [...(byDate.get(key) ?? []), event]);
    }
    return Array.from(byDate.entries())
      .sort(([a], [b]) => (a === 'unscheduled' ? 1 : b === 'unscheduled' ? -1 : new Date(a).getTime() - new Date(b).getTime()))
      .map(([key, entries]) => ({
        label: key === 'unscheduled' ? 'Unscheduled' : new Date(key).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }),
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
        events: this.events.filter((event) => event.scheduledFor && new Date(event.scheduledFor).toDateString() === date.toDateString()),
      };
    });
  }

  get monthDays(): Array<{ date: Date; dayNum: number; count: number; hasWebsite: boolean; hasX: boolean; hasInstagram: boolean }> {
    const { from } = this.range();
    const daysInMonth = new Date(from.getFullYear(), from.getMonth() + 1, 0).getDate();
    return Array.from({ length: daysInMonth }, (_value, index) => {
      const date = new Date(from.getFullYear(), from.getMonth(), index + 1);
      const dayEvents = this.events.filter((event) => event.scheduledFor && new Date(event.scheduledFor).toDateString() === date.toDateString());
      return {
        date,
        dayNum: index + 1,
        count: dayEvents.length,
        hasWebsite: dayEvents.some((event) => event.channel === 'website'),
        hasX: dayEvents.some((event) => event.channel === 'x'),
        hasInstagram: dayEvents.some((event) => event.channel === 'instagram'),
      };
    });
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
    return value ? new Date(value).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '—';
  }

  statusClass(status: string): string {
    switch (status) {
      case 'published':
        return 'au-badge--success';
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
    this.draggedEvent = item;
    this.dragHint = true;
    event.dataTransfer?.setData('text/plain', item.id);
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
    }
    (event.currentTarget as HTMLElement)?.classList.add('is-dragging');
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
    const original = source.scheduledFor ? new Date(source.scheduledFor) : new Date();
    const target = new Date(day.getTime());
    target.setHours(original.getHours(), original.getMinutes(), 0, 0);
    this.reschedule(source, target);
  }

  private reschedule(eventItem: CalendarEvent, target: Date): void {
    if (eventItem.status === 'published') {
      this.error = 'Published items cannot be rescheduled.';
      return;
    }
    this.dragHint = false;
    const previous = eventItem.scheduledFor;
    // Optimistic update.
    eventItem.scheduledFor = target.toISOString();
    this.api.reschedulePublication(eventItem.id, target.toISOString()).subscribe({
      next: () => {
        this.toast.success('Publication rescheduled.');
        this.load(true);
      },
      error: () => {
        eventItem.scheduledFor = previous; // rollback
        this.error = 'The publication could not be rescheduled.';
        this.load(true);
      },
    });
  }

  publishNow(eventItem: CalendarEvent): void {
    this.api.publishNow(eventItem.id).subscribe({
      next: () => this.load(true),
      error: () => { this.error = 'The publication could not be published.'; this.load(true); },
    });
  }

  cancel(eventItem: CalendarEvent): void {
    void this.confirmCancel(eventItem);
  }

  private async confirmCancel(eventItem: CalendarEvent): Promise<void> {
    const confirmed = await this.confirm.confirm({
      title: `Cancel this scheduled ${eventItem.channel} publication?`,
      message: `"${eventItem.title}" — this only cancels the local schedule. Content already published externally is not affected.`,
      confirmLabel: 'Cancel publication',
      danger: true,
    });
    if (!confirmed) {
      return;
    }
    this.api.cancelPublication(eventItem.id).subscribe({
      next: () => {
        this.toast.success('Publication canceled.');
        this.load(true);
      },
      error: () => { this.error = 'The publication could not be canceled.'; this.load(true); },
    });
  }

  retry(eventItem: CalendarEvent): void {
    this.api.retryPublication(eventItem.id).subscribe({
      next: () => this.load(true),
      error: () => { this.error = 'The publication could not be retried.'; this.load(true); },
    });
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
      siteId: this.draft.channel === 'website' ? (this.draft.siteId || undefined) : undefined,
      accountId: this.draft.channel !== 'website' ? (this.draft.accountId || undefined) : undefined,
      scheduledFor: new Date(this.draft.scheduledFor).toISOString(),
    }).subscribe({
      next: () => {
        this.creating = false;
        this.toast.success('Publication added to the calendar.');
        this.draft = { projectId: '', channel: 'website', siteId: '', accountId: '', scheduledFor: '' };
        this.load(true);
      },
      error: (err) => {
        this.creating = false;
        this.error = err?.error?.error?.message || 'The publication could not be scheduled.';
      },
    });
  }
}
