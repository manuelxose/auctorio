import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Subscription, timer } from 'rxjs';
import { StudioApiService } from '../services/studio-api.service';
import { AppContextService } from '../services/app-context.service';
import type { CalendarEvent, PublicationChannel, StudioProjectSummary, StudioSite, PublishingAccount } from '../models/studio.models';

type CalendarView = 'list' | 'day' | 'week' | 'month';

@Component({
  selector: 'app-calendar-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <section class="au-page">
      <header class="au-page__header">
        <div>
          <h1 class="au-page__title">Calendar</h1>
          <p class="au-page__subtitle">Every scheduled article and social post, in one timeline.</p>
        </div>
        <div class="au-header-actions">
          <select class="au-input au-input--inline" [(ngModel)]="channelFilter" (ngModelChange)="load()">
            <option value="">All channels</option>
            <option value="website">Website</option>
            <option value="x">X</option>
            <option value="instagram">Instagram</option>
          </select>
          <select class="au-input au-input--inline" [(ngModel)]="siteFilter" (ngModelChange)="load()">
            <option value="">All sites</option>
            <option *ngFor="let site of sites" [ngValue]="site.id">{{ site.name }}</option>
          </select>
        </div>
      </header>

      <nav class="au-tabs">
        <button *ngFor="let view of views" class="au-tab" [class.is-active]="view.key === viewMode" type="button" (click)="setView(view.key)">
          {{ view.label }}
        </button>
        <span class="au-tabs__spacer"></span>
        <button class="au-tab au-tab--nav" type="button" (click)="move(-1)">‹</button>
        <span class="au-calendar-label">{{ rangeLabel }}</span>
        <button class="au-tab au-tab--nav" type="button" (click)="move(1)">›</button>
      </nav>

      <p class="au-banner au-banner--error" *ngIf="error">{{ error }}</p>
      <p class="au-banner au-banner--success" *ngIf="notice">{{ notice }}</p>
      <p class="au-hint" *ngIf="dragHint">Drag a card to move it. Drop to reschedule.</p>

      <section class="au-surface au-surface--padded">
        <h2 class="au-surface__title">Schedule a publication</h2>
        <form class="au-form au-form-grid au-form-grid--4" (ngSubmit)="createFromCalendar()">
          <label class="au-field"><span>Content</span><select class="au-input" name="projectId" [(ngModel)]="draft.projectId" required><option value="" disabled>Select content</option><option *ngFor="let project of projects" [value]="project.id">{{ project.title }}</option></select></label>
          <label class="au-field"><span>Channel</span><select class="au-input" name="channel" [(ngModel)]="draft.channel"><option value="website">Website</option><option value="x">X</option><option value="instagram">Instagram</option></select></label>
          <label class="au-field" *ngIf="draft.channel === 'website'"><span>Site</span><select class="au-input" name="siteId" [(ngModel)]="draft.siteId"><option value="">Default site</option><option *ngFor="let site of sites" [value]="site.id">{{ site.name }}</option></select></label>
          <label class="au-field" *ngIf="draft.channel !== 'website'"><span>Account</span><select class="au-input" name="accountId" [(ngModel)]="draft.accountId"><option value="">Default account</option><option *ngFor="let account of accountsForChannel" [value]="account.id">{{ account.displayName }}</option></select></label>
          <label class="au-field"><span>When</span><input class="au-input" type="datetime-local" name="scheduledFor" [(ngModel)]="draft.scheduledFor" required /></label>
          <button class="au-button au-button--primary" type="submit" [disabled]="creating">{{ creating ? 'Scheduling…' : 'Add to calendar' }}</button>
        </form>
      </section>

      <!-- List / agenda -->
      <section class="au-surface" *ngIf="viewMode === 'list'">
        <div class="au-empty" *ngIf="events.length === 0">Nothing scheduled in this range.</div>
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
        <span class="au-channel-badge" [ngClass]="'au-channel-badge--' + event.channel">{{ event.channel }}</span>
        <img class="au-calendar-thumb" *ngIf="event.thumbnail" [src]="event.thumbnail" alt="" />
        <div class="au-calendar-card__text">
          <strong>{{ event.title }}</strong>
          <span class="au-calendar-card__meta">{{ event.destination }} · {{ event.projectTitle }}</span>
          <span class="au-tag" [ngClass]="statusClass(event.status)">{{ event.status }}</span>
          <span class="au-calendar-card__meta" *ngIf="event.automated">🤖 auto</span>
          <span class="au-calendar-card__error" *ngIf="event.lastError">{{ event.lastError }}</span>
        </div>
        <div class="au-calendar-card__actions" (click)="$event.stopPropagation()">
          <button class="au-button au-button--ghost au-button--xs" type="button" [routerLink]="['/studio/content', event.projectId]">Open</button>
          <button
            *ngIf="event.status === 'scheduled' || event.status === 'failed'"
            class="au-button au-button--ghost au-button--xs" type="button" (click)="publishNow(event)"
          >Publish now</button>
          <button
            *ngIf="event.status === 'scheduled'"
            class="au-button au-button--ghost au-button--xs au-button--danger" type="button" (click)="cancel(event)"
          >Cancel</button>
          <button
            *ngIf="event.status === 'failed'"
            class="au-button au-button--ghost au-button--xs" type="button" (click)="retry(event)"
          >Retry</button>
        </div>
      </div>
    </ng-template>
  `,
  styles: [
    `
      .au-header-actions { display: flex; gap: 0.5rem; }
      .au-input--inline { width: auto; }
      .au-tabs__spacer { flex: 1; }
      .au-tab--nav { padding: 0.5rem 0.6rem; }
      .au-calendar-label { font-weight: 600; margin: 0 0.5rem; }
      .au-form-grid--4 { grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); align-items: end; gap: 0.8rem; display: grid; }
      .au-field { display: flex; flex-direction: column; gap: 0.3rem; font-size: 0.8rem; color: var(--au-muted, #6b7280); }
      .au-hint { color: var(--au-muted, #6b7280); font-size: 0.8rem; }
      .au-calendar-group__date {
        margin: 1rem 0 0.5rem; font-size: 0.85rem; text-transform: uppercase;
        letter-spacing: 0.05em; color: var(--au-muted, #6b7280);
      }
      .au-calendar-card {
        background: var(--au-surface, #fff); border: 1px solid var(--au-border, #e5e7eb);
        border-radius: 8px; padding: 0.65rem 0.8rem; margin-bottom: 0.5rem; cursor: grab;
        transition: box-shadow 120ms ease;
      }
      .au-calendar-card:hover { box-shadow: 0 2px 8px rgb(0 0 0 / 8%); }
      .au-calendar-card.is-dragging { opacity: 0.4; }
      .au-calendar-card__body { display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap; }
      .au-calendar-time { font-variant-numeric: tabular-nums; font-weight: 700; min-width: 3.2rem; }
      .au-channel-badge { text-transform: uppercase; font-size: 0.65rem; padding: 2px 6px; border-radius: 4px; }
      .au-channel-badge--website { background: #dbeafe; color: #1d4ed8; }
      .au-channel-badge--x { background: #111; color: #fff; }
      .au-channel-badge--instagram { background: #fdf2f8; color: #be185d; }
      .au-calendar-thumb { width: 40px; height: 40px; object-fit: cover; border-radius: 6px; }
      .au-calendar-card__text { display: flex; flex-direction: column; gap: 2px; min-width: 220px; flex: 1; }
      .au-calendar-card__meta { font-size: 0.75rem; color: var(--au-muted, #6b7280); }
      .au-calendar-card__error { font-size: 0.72rem; color: var(--au-danger, #dc2626); }
      .au-calendar-card__actions { display: flex; gap: 0.35rem; margin-left: auto; }
      .au-button--xs { padding: 0.2rem 0.5rem; font-size: 0.75rem; }
      .au-button--danger { color: var(--au-danger, #dc2626); }
      .au-calendar-grid { display: grid; gap: 0.75rem; }
      .au-calendar-grid:not(.au-calendar-grid--month) { grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); }
      .au-calendar-grid--month { grid-template-columns: repeat(7, 1fr); }
      .au-calendar-col { background: var(--au-surface-subtle, #f9fafb); border-radius: 8px; padding: 0.6rem; min-height: 180px; }
      .au-calendar-col__empty { color: var(--au-muted, #6b7280); font-size: 0.8rem; text-align: center; padding: 1rem; }
      .au-calendar-day { position: relative; min-height: 68px; border: 1px solid var(--au-border, #e5e7eb); border-radius: 8px; padding: 0.4rem; cursor: pointer; }
      .au-calendar-day__num { font-weight: 600; }
      .au-calendar-day__num.is-today { color: var(--au-primary, #4f46e5); }
      .au-calendar-day__count { position: absolute; top: 0.4rem; right: 0.5rem; font-size: 0.75rem; }
      .au-calendar-day__markers { display: flex; gap: 3px; margin-top: 0.4rem; }
      .au-channel-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
      .au-channel-dot--website { background: #3b82f6; }
      .au-channel-dot--x { background: #111; }
      .au-channel-dot--instagram { background: #ec4899; }
      @media (max-width: 640px) {
        .au-calendar-grid--month { grid-template-columns: repeat(7, 1fr); overflow-x: auto; }
        .au-calendar-card__actions { width: 100%; }
      }
    `,
  ],
})
export class CalendarPageComponent implements OnInit, OnDestroy {
  private readonly api = inject(StudioApiService);
  private readonly appContext = inject(AppContextService);

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
        return 'au-tag--success';
      case 'failed':
        return 'au-tag--danger';
      case 'scheduled':
      case 'queued':
        return 'au-tag--warning';
      default:
        return '';
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
      next: () => this.load(true),
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
    const confirmed = window.confirm(
      `Cancel this scheduled ${eventItem.channel} publication?\n\n"${eventItem.title}"\n\nThis only cancels the local schedule. Content already published externally is not affected.`,
    );
    if (!confirmed) {
      return;
    }
    this.api.cancelPublication(eventItem.id).subscribe({
      next: () => this.load(true),
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
        this.notice = 'Publication added to the calendar.';
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
