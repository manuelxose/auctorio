import { CommonModule } from '@angular/common';
import { Component, ElementRef, EventEmitter, Input, OnChanges, Output, SimpleChanges, ViewChild } from '@angular/core';
import { AppIconComponent } from '../ui/app-icon.component';
import type { PlanItem } from '../../models/planning.models';
import { WEEKDAYS, addDays, channelLabel, formatDay, itemTitle, localDate, localTime, startOfWeek, statusLabel, statusTone } from './planning-utils';

type Day = { date: string; inMonth: boolean; items: PlanItem[] };

/** Week / month grid of real proposal cards in the plan's timezone. Overflow opens a day panel in place. */
@Component({
  selector: 'app-plan-calendar-view',
  standalone: true,
  imports: [CommonModule, AppIconComponent],
  styles: [
    `
      .pc__bar { display: flex; flex-wrap: wrap; align-items: center; gap: var(--au-s2); margin-bottom: var(--au-s3); }
      .pc__label { font-weight: 600; min-width: 12ch; text-align: center; font-variant-numeric: tabular-nums; }
      .pc__spacer { flex: 1; }
      .pc__head { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: var(--au-s2); font-size: var(--au-fs-caption); color: var(--au-muted); font-weight: 600; margin-bottom: var(--au-s1); }
      .pc__grid { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: var(--au-s2); }
      .pc__day { min-width: 0; min-height: 132px; border: 1px solid var(--au-border); border-radius: var(--au-r-md); background: var(--au-surface); padding: var(--au-s2); display: flex; flex-direction: column; gap: var(--au-s1); }
      .pc__day.is-out { background: transparent; opacity: 0.55; }
      .pc__day.is-today { border-color: var(--au-brand); }
      .pc__day.is-selected { box-shadow: 0 0 0 2px var(--au-brand); }
      .pc__date { display: flex; justify-content: space-between; align-items: baseline; font-size: var(--au-fs-body-sm); font-weight: 600; }
      .pc__date small { font-weight: 400; color: var(--au-muted); }
      .pc__card { display: grid; gap: 2px; text-align: left; width: 100%; border: 1px solid var(--au-border); border-left: 3px solid var(--pc-tone, var(--au-border-strong)); border-radius: var(--au-r-sm); background: var(--au-surface-2); padding: 6px 8px; font: inherit; color: var(--au-text); cursor: pointer; min-width: 0; }
      .pc__card:hover { border-color: var(--au-border-strong); background: var(--au-surface-hover); }
      .pc__card-top { display: flex; gap: 6px; align-items: center; font-size: var(--au-fs-caption); color: var(--au-muted); font-variant-numeric: tabular-nums; }
      .pc__card-title { font-size: var(--au-fs-body-sm); line-height: 1.35; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow-wrap: anywhere; }
      .pc__chip { display: flex; gap: 6px; align-items: center; width: 100%; text-align: left; border: 0; border-left: 3px solid var(--pc-tone, var(--au-border-strong)); border-radius: 4px; background: var(--au-surface-2); padding: 3px 6px; font: inherit; font-size: var(--au-fs-caption); color: var(--au-text); cursor: pointer; min-width: 0; }
      .pc__chip span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .pc__card:focus-visible, .pc__chip:focus-visible, .pc__more:focus-visible, .pc__count:focus-visible { outline: 2px solid var(--au-brand); outline-offset: 1px; }
      @media (pointer: coarse) { .pc__more, .pc__chip { min-height: 44px; } .pc__grid--month .pc__count { min-height: 44px; } }
      .pc__more { border: 0; background: transparent; color: var(--au-brand); font: inherit; font-size: var(--au-fs-caption); font-weight: 600; text-align: left; padding: 2px 4px; cursor: pointer; border-radius: 4px; }
      .pc__count { display: none; }
      .pc__panel { margin-top: var(--au-s3); border: 1px solid var(--au-border); border-radius: var(--au-r-md); background: var(--au-surface); padding: var(--au-s3); }
      .pc__panel-head { display: flex; justify-content: space-between; align-items: center; gap: var(--au-s2); margin-bottom: var(--au-s2); }
      .pc__panel-head h3 { margin: 0; font-size: var(--au-fs-body); }
      .pc__panel-list { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--au-s2); grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); }
      .tone-success { --pc-tone: var(--au-success); }
      .tone-warning { --pc-tone: var(--au-warning); }
      .tone-danger { --pc-tone: var(--au-danger); }
      .tone-brand { --pc-tone: var(--au-brand); }
      .tone-info { --pc-tone: var(--au-info); }
      @media (max-width: 767px) {
        .pc__head--week { display: none; }
        .pc__grid--week { grid-template-columns: 1fr; }
        .pc__grid--week .pc__day { min-height: 0; }
        .pc__grid--month { gap: 2px; }
        .pc__grid--month .pc__day { min-height: 56px; padding: 4px; }
        .pc__grid--month .pc__chip, .pc__grid--month .pc__more { display: none; }
        .pc__grid--month .pc__count { display: block; border: 0; background: var(--au-brand-soft); color: var(--au-brand); border-radius: 999px; font: inherit; font-size: var(--au-fs-caption); font-weight: 600; min-height: 28px; cursor: pointer; }
        .pc__date small { display: none; }
      }
    `,
  ],
  template: `
    <div class="pc__bar">
      <div class="au-segmented" role="group" aria-label="Calendar range">
        <button type="button" class="au-segmented__item" [class.is-active]="mode === 'week'" [attr.aria-pressed]="mode === 'week'" (click)="setMode('week')">Week</button>
        <button type="button" class="au-segmented__item" [class.is-active]="mode === 'month'" [attr.aria-pressed]="mode === 'month'" (click)="setMode('month')">Month</button>
      </div>
      <button class="au-btn au-btn--ghost au-btn--icon au-btn--sm" type="button" (click)="shift(-1)" [attr.aria-label]="'Previous ' + mode"><app-icon name="chevron-left"></app-icon></button>
      <span class="pc__label" aria-live="polite">{{ label }}</span>
      <button class="au-btn au-btn--ghost au-btn--icon au-btn--sm" type="button" (click)="shift(1)" [attr.aria-label]="'Next ' + mode"><app-icon name="chevron-right"></app-icon></button>
      <button class="au-btn au-btn--ghost au-btn--sm" type="button" (click)="goToday()">Today</button>
      <span class="pc__spacer"></span>
      <span class="au-muted" style="font-size: var(--au-fs-body-sm)">{{ visibleCount }} in view · times in {{ timezone }}</span>
    </div>

    <div class="pc__head" [class.pc__head--week]="mode === 'week'" aria-hidden="true">
      <span *ngFor="let day of weekdays">{{ day.short }}</span>
    </div>
    <div class="pc__grid" [class.pc__grid--week]="mode === 'week'" [class.pc__grid--month]="mode === 'month'">
      <section *ngFor="let day of days" class="pc__day" [class.is-out]="!day.inMonth" [class.is-today]="day.date === today" [class.is-selected]="day.date === panelDate" [attr.aria-label]="dayLabel(day.date) + ', ' + day.items.length + ' planned'">
        <div class="pc__date">{{ mode === 'week' ? dayLabel(day.date) : dayNumber(day.date) }}<small *ngIf="day.items.length">{{ day.items.length }}</small></div>
        <ng-container *ngIf="mode === 'week'">
          <button *ngFor="let item of day.items.slice(0, weekLimit)" type="button" class="pc__card" [ngClass]="'tone-' + tone(item.status)" (click)="open.emit(item)">
            <span class="pc__card-top">{{ time(item) }} · {{ channel(item.channel) }} · {{ label_(item.status) }}</span>
            <span class="pc__card-title">{{ title(item) }}</span>
          </button>
          <button *ngIf="day.items.length > weekLimit" type="button" class="pc__more" (click)="openDay(day.date)" [attr.aria-label]="'Show all ' + day.items.length + ' on ' + dayLabel(day.date)">+{{ day.items.length - weekLimit }} more</button>
        </ng-container>
        <ng-container *ngIf="mode === 'month'">
          <button *ngFor="let item of day.items.slice(0, monthLimit)" type="button" class="pc__chip" [ngClass]="'tone-' + tone(item.status)" (click)="open.emit(item)" [attr.aria-label]="time(item) + ' ' + title(item) + ', ' + label_(item.status)">
            <span>{{ time(item) }} {{ title(item) }}</span>
          </button>
          <button *ngIf="day.items.length > monthLimit" type="button" class="pc__more" (click)="openDay(day.date)" [attr.aria-label]="'Show all ' + day.items.length + ' on ' + dayLabel(day.date)">+{{ day.items.length - monthLimit }}</button>
          <button *ngIf="day.items.length" type="button" class="pc__count" (click)="openDay(day.date)" [attr.aria-label]="'Show ' + day.items.length + ' on ' + dayLabel(day.date)">{{ day.items.length }}</button>
        </ng-container>
      </section>
    </div>

    <section class="pc__panel" *ngIf="panelDate" aria-labelledby="pc-panel-title">
      <div class="pc__panel-head">
        <h3 id="pc-panel-title" #panelTitle tabindex="-1">{{ dayLabel(panelDate) }} · {{ panelItems.length }} planned</h3>
        <button class="au-btn au-btn--ghost au-btn--icon au-btn--sm" type="button" (click)="panelDate = null" aria-label="Close day panel"><app-icon name="close"></app-icon></button>
      </div>
      <ul class="pc__panel-list">
        <li *ngFor="let item of panelItems">
          <button type="button" class="pc__card" [ngClass]="'tone-' + tone(item.status)" (click)="open.emit(item)">
            <span class="pc__card-top">{{ time(item) }} · {{ channel(item.channel) }} · {{ label_(item.status) }}</span>
            <span class="pc__card-title">{{ title(item) }}</span>
          </button>
        </li>
      </ul>
    </section>
  `,
})
export class PlanCalendarViewComponent implements OnChanges {
  @Input() items: PlanItem[] = [];
  @Input() timezone = 'Europe/Madrid';
  /** Local date the view starts on when the plan changes. */
  @Input() startDate = '';
  @Output() open = new EventEmitter<PlanItem>();
  /** Visible local period, published into the editorial context. */
  @Output() periodChange = new EventEmitter<{ from: string; to: string }>();
  @ViewChild('panelTitle') panelTitle?: ElementRef<HTMLElement>;

  readonly weekdays = WEEKDAYS;
  readonly weekLimit = 4;
  readonly monthLimit = 3;
  mode: 'week' | 'month' = 'week';
  anchor = '';
  today = '';
  days: Day[] = [];
  label = '';
  visibleCount = 0;
  panelDate: string | null = null;
  panelItems: PlanItem[] = [];

  readonly tone = statusTone;
  readonly label_ = statusLabel;
  readonly channel = channelLabel;
  readonly title = itemTitle;

  ngOnChanges(changes: SimpleChanges): void {
    this.today = localDate(new Date(), this.timezone);
    if (changes['startDate'] || !this.anchor) this.anchor = this.startDate || this.today;
    this.build();
  }

  time(item: PlanItem): string {
    return item.scheduledFor ? localTime(item.scheduledFor, this.timezone) : '--:--';
  }

  dayLabel(date: string): string {
    return formatDay(date, { weekday: 'short', day: 'numeric', month: 'short' });
  }

  dayNumber(date: string): string {
    return String(Number(date.slice(8)));
  }

  setMode(mode: 'week' | 'month'): void {
    this.mode = mode;
    this.build();
  }

  shift(delta: number): void {
    if (this.mode === 'week') this.anchor = addDays(this.anchor, 7 * delta);
    else {
      const [y, m] = this.anchor.split('-').map(Number);
      this.anchor = new Date(Date.UTC(y, m - 1 + delta, 1)).toISOString().slice(0, 10);
    }
    this.panelDate = null;
    this.build();
  }

  goToday(): void {
    this.anchor = this.today;
    this.build();
  }

  openDay(date: string): void {
    this.panelDate = date;
    this.panelItems = this.days.find((day) => day.date === date)?.items ?? [];
    setTimeout(() => this.panelTitle?.nativeElement.focus());
  }

  private build(): void {
    const byDay = new Map<string, PlanItem[]>();
    for (const item of this.items) {
      if (!item.scheduledFor) continue;
      const key = localDate(item.scheduledFor, this.timezone);
      byDay.set(key, [...(byDay.get(key) ?? []), item]);
    }
    for (const list of byDay.values()) list.sort((a, b) => (a.scheduledFor ?? '').localeCompare(b.scheduledFor ?? ''));
    let from: string;
    let to: string;
    const month = this.anchor.slice(0, 7);
    if (this.mode === 'week') {
      from = startOfWeek(this.anchor);
      to = addDays(from, 6);
      this.label = `${formatDay(from, { day: 'numeric', month: 'short' })} – ${formatDay(to, { day: 'numeric', month: 'short', year: 'numeric' })}`;
    } else {
      from = startOfWeek(`${month}-01`);
      const [y, m] = month.split('-').map(Number);
      const lastOfMonth = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
      to = addDays(startOfWeek(lastOfMonth), 6);
      this.label = formatDay(`${month}-01`, { month: 'long', year: 'numeric' });
    }
    this.days = [];
    for (let day = from; day <= to; day = addDays(day, 1)) {
      this.days.push({ date: day, inMonth: this.mode === 'week' || day.startsWith(month), items: byDay.get(day) ?? [] });
    }
    this.visibleCount = this.days.filter((day) => day.inMonth).reduce((sum, day) => sum + day.items.length, 0);
    if (this.panelDate) this.panelItems = byDay.get(this.panelDate) ?? [];
    const period = this.mode === 'week' ? { from, to } : { from: `${month}-01`, to: this.days.filter((day) => day.inMonth).at(-1)!.date };
    // Emitted after this change-detection pass so listeners can update shared state safely.
    queueMicrotask(() => this.periodChange.emit(period));
  }
}
