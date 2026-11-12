import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AppIconComponent } from '../ui/app-icon.component';
import type { PlanItem } from '../../models/planning.models';
import { ITEM_STATUSES, channelLabel, formatDay, itemTitle, localDate, localTime, startOfWeek, statusLabel, statusTone } from './planning-utils';

export type BacklogAction =
  | { kind: 'approve' | 'reject' | 'delete' | 'regenerate'; ids: string[] }
  | { kind: 'reschedule'; ids: string[]; days: number };

type GroupKey = 'none' | 'day' | 'week' | 'status' | 'cluster' | 'contentType';
type SortKey = 'date-asc' | 'date-desc' | 'priority' | 'title';

/** Dense, filterable list of the plan's items with multi-select bulk actions. */
@Component({
  selector: 'app-plan-backlog-view',
  standalone: true,
  imports: [CommonModule, FormsModule, AppIconComponent],
  styles: [
    `
      .pb__tools { display: flex; flex-wrap: wrap; gap: var(--au-s2); align-items: end; margin-bottom: var(--au-s3); }
      .pb__tools .au-field { margin: 0; min-width: 130px; }
      .pb__search { flex: 1 1 220px; }
      .pb__bulk { position: sticky; top: 0; z-index: 2; display: flex; flex-wrap: wrap; gap: var(--au-s2); align-items: center; padding: var(--au-s2) var(--au-s3); margin-bottom: var(--au-s2); border: 1px solid var(--au-brand); border-radius: var(--au-r-md); background: var(--au-surface-selected); }
      .pb__bulk strong { margin-right: var(--au-s2); }
      .pb__shift { display: inline-flex; gap: var(--au-s1); align-items: center; }
      .pb__shift input { width: 72px; }
      .pb__group { margin: var(--au-s3) 0 var(--au-s1); font-size: var(--au-fs-body-sm); font-weight: 600; color: var(--au-text-2); display: flex; gap: var(--au-s2); align-items: baseline; }
      .pb__group small { color: var(--au-muted); font-weight: 400; }
      .pb__list { list-style: none; margin: 0; padding: 0; border: 1px solid var(--au-border); border-radius: var(--au-r-md); overflow: hidden; background: var(--au-surface); }
      .pb__row { display: grid; grid-template-columns: 28px 112px minmax(0, 1fr) 120px 90px; gap: var(--au-s3); align-items: center; padding: 8px var(--au-s3); border-top: 1px solid var(--au-border); }
      .pb__row:first-child { border-top: 0; }
      .pb__row.is-selected { background: var(--au-surface-selected); }
      .pb__row--head { font-size: var(--au-fs-caption); color: var(--au-muted); font-weight: 600; background: var(--au-surface-2); }
      .pb__when { font-variant-numeric: tabular-nums; font-size: var(--au-fs-body-sm); color: var(--au-text-2); }
      .pb__title:focus-visible { outline: 2px solid var(--au-brand); outline-offset: 2px; }
      .pb__title { text-align: left; border: 0; background: transparent; font: inherit; color: var(--au-text); cursor: pointer; padding: 2px 0; min-width: 0; }
      .pb__title strong { display: block; font-weight: 560; overflow-wrap: anywhere; }
      .pb__title small { display: block; color: var(--au-muted); font-size: var(--au-fs-caption); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .pb__title:hover strong { color: var(--au-brand); }
      .pb__check { width: 18px; height: 18px; }
      .pb__count { display: flex; align-items: center; gap: var(--au-s2); font-size: var(--au-fs-body-sm); margin: 0 0 var(--au-s2); }
      @media (max-width: 767px) {
        .pb__row { grid-template-columns: 28px minmax(0, 1fr); row-gap: 4px; }
        .pb__row--head { display: none; }
        .pb__row > .pb__when, .pb__row > .pb__status, .pb__row > .pb__channel { grid-column: 2; }
        .pb__row > .pb__when { order: 3; }
        .pb__status, .pb__channel { display: inline; }
        .pb__check { width: 22px; height: 22px; }
      }
    `,
  ],
  template: `
    <div class="pb__tools">
      <label class="au-field pb__search">
        <span class="au-field__label">Search</span>
        <input class="au-input" type="search" [(ngModel)]="query" (ngModelChange)="apply()" placeholder="Title, topic, keyword" />
      </label>
      <label class="au-field">
        <span class="au-field__label">Status</span>
        <select class="au-select" [(ngModel)]="statusFilter" (ngModelChange)="apply()">
          <option value="">All</option>
          <option *ngFor="let status of statuses" [value]="status">{{ label(status) }}</option>
        </select>
      </label>
      <label class="au-field">
        <span class="au-field__label">Channel</span>
        <select class="au-select" [(ngModel)]="channelFilter" (ngModelChange)="apply()">
          <option value="">All</option>
          <option value="website">Website</option>
          <option value="x">X</option>
          <option value="instagram">Instagram</option>
        </select>
      </label>
      <label class="au-field">
        <span class="au-field__label">Content type</span>
        <select class="au-select" [(ngModel)]="typeFilter" (ngModelChange)="apply()">
          <option value="">All</option>
          <option *ngFor="let type of contentTypes" [value]="type">{{ type }}</option>
        </select>
      </label>
      <label class="au-field">
        <span class="au-field__label">Group by</span>
        <select class="au-select" [(ngModel)]="groupBy" (ngModelChange)="apply()">
          <option value="none">No grouping</option>
          <option value="day">Day</option>
          <option value="week">Week</option>
          <option value="status">Status</option>
          <option value="cluster">Cluster</option>
          <option value="contentType">Content type</option>
        </select>
      </label>
      <label class="au-field">
        <span class="au-field__label">Sort</span>
        <select class="au-select" [(ngModel)]="sortBy" (ngModelChange)="apply()">
          <option value="date-asc">Date, earliest first</option>
          <option value="date-desc">Date, latest first</option>
          <option value="priority">Priority, highest first</option>
          <option value="title">Title A–Z</option>
        </select>
      </label>
    </div>

    <div class="pb__bulk" *ngIf="selected.size > 0" role="region" aria-label="Bulk actions">
      <strong>{{ selected.size }} selected</strong>
      <button class="au-btn au-btn--secondary au-btn--sm" type="button" [disabled]="busy" (click)="emit('approve')"><app-icon name="circle-check"></app-icon> Approve</button>
      <button class="au-btn au-btn--ghost au-btn--sm" type="button" [disabled]="busy" (click)="emit('reject')">Reject</button>
      <span class="pb__shift">
        <label class="au-sr-only" for="pb-shift">Days to move</label>
        <input id="pb-shift" class="au-input" type="number" min="-60" max="60" [(ngModel)]="shiftDays" />
        <button class="au-btn au-btn--ghost au-btn--sm" type="button" [disabled]="busy || !shiftDays" (click)="emitShift()">Move {{ shiftDays >= 0 ? '+' : '' }}{{ shiftDays }} day{{ shiftDays === 1 || shiftDays === -1 ? '' : 's' }}</button>
      </span>
      <button class="au-btn au-btn--ghost au-btn--sm" type="button" [disabled]="busy" (click)="emit('regenerate')"><app-icon name="refresh"></app-icon> Regenerate</button>
      <button class="au-btn au-btn--danger-ghost au-btn--sm" type="button" [disabled]="busy" (click)="emit('delete')"><app-icon name="trash"></app-icon> Delete</button>
      <button class="au-btn au-btn--ghost au-btn--sm" type="button" (click)="clear()">Clear selection</button>
    </div>

    <p class="au-muted pb__count" role="status" aria-live="polite">
      {{ filtered.length }} of {{ items.length }} items
      <button *ngIf="filtered.length" class="au-btn au-btn--ghost au-btn--sm" type="button" (click)="selectShown()">Select all shown</button>
    </p>

    <ng-container *ngFor="let group of groups">
      <h3 class="pb__group" *ngIf="groupBy !== 'none'">{{ group.label }} <small>{{ group.items.length }}</small></h3>
      <ul class="pb__list">
        <li class="pb__row pb__row--head">
          <input class="pb__check" type="checkbox" [checked]="allSelected(group.items)" (change)="toggleAll(group.items, $event)" [attr.aria-label]="'Select all ' + group.items.length + (group.label ? ' in ' + group.label : '')" />
          <span aria-hidden="true">When</span><span aria-hidden="true">Brief</span><span aria-hidden="true">Status</span><span aria-hidden="true">Channel</span>
        </li>
        <li class="pb__row" *ngFor="let item of group.items; trackBy: trackId" [class.is-selected]="selected.has(item.id)">
          <input class="pb__check" type="checkbox" [checked]="selected.has(item.id)" (change)="toggle(item.id)" [attr.aria-label]="'Select ' + title(item)" />
          <span class="pb__when">{{ when(item) }}</span>
          <button type="button" class="pb__title" (click)="open.emit(item)">
            <strong>{{ title(item) }}</strong>
            <small>{{ [item.topicCluster, item.contentType, item.primaryKeyword].filter(truthy).join(' · ') || 'No cluster or keyword yet' }}</small>
          </button>
          <span class="pb__status"><span class="au-badge" [class]="'au-badge au-badge--' + tone(item.status)">{{ label(item.status) }}</span></span>
          <span class="pb__channel au-muted">{{ channel(item.channel) }}</span>
        </li>
      </ul>
    </ng-container>
    <p class="au-muted" *ngIf="filtered.length === 0 && items.length > 0">No item matches these filters.</p>
  `,
})
export class PlanBacklogViewComponent implements OnChanges {
  @Input() items: PlanItem[] = [];
  @Input() timezone = 'Europe/Madrid';
  @Input() busy = false;
  @Output() open = new EventEmitter<PlanItem>();
  @Output() action = new EventEmitter<BacklogAction>();

  readonly statuses = ITEM_STATUSES;
  contentTypes: string[] = [];
  query = '';
  statusFilter = '';
  channelFilter = '';
  typeFilter = '';
  groupBy: GroupKey = 'none';
  sortBy: SortKey = 'date-asc';
  shiftDays = 1;
  selected = new Set<string>();
  filtered: PlanItem[] = [];
  groups: Array<{ label: string; items: PlanItem[] }> = [];

  readonly label = statusLabel;
  readonly tone = statusTone;
  readonly channel = channelLabel;
  readonly title = itemTitle;
  readonly truthy = Boolean;

  ngOnChanges(): void {
    const ids = new Set(this.items.map((item) => item.id));
    this.selected = new Set([...this.selected].filter((id) => ids.has(id)));
    this.contentTypes = [...new Set(this.items.map((item) => item.contentType).filter((type): type is string => Boolean(type)))].sort();
    this.apply();
  }

  trackId(_index: number, item: PlanItem): string {
    return item.id;
  }

  when(item: PlanItem): string {
    if (!item.scheduledFor) return 'Unscheduled';
    const date = localDate(item.scheduledFor, this.timezone);
    return `${formatDay(date, { weekday: 'short', day: 'numeric', month: 'short' })} ${localTime(item.scheduledFor, this.timezone)}`;
  }

  apply(): void {
    const q = this.query.trim().toLowerCase();
    this.filtered = this.items.filter((item) => {
      if (this.statusFilter && item.status !== this.statusFilter) return false;
      if (this.channelFilter && item.channel !== this.channelFilter) return false;
      if (this.typeFilter && item.contentType !== this.typeFilter) return false;
      if (!q) return true;
      return [item.title, item.workingTitle, item.finalSuggestedTitle, item.topic, item.primaryKeyword, item.topicCluster].some((value) => value?.toLowerCase().includes(q));
    });
    const dir = this.sortBy === 'date-desc' ? -1 : 1;
    this.filtered.sort((a, b) => {
      if (this.sortBy === 'priority') return (b.priority ?? 0) - (a.priority ?? 0);
      if (this.sortBy === 'title') return itemTitle(a).localeCompare(itemTitle(b));
      return dir * (a.scheduledFor ?? '').localeCompare(b.scheduledFor ?? '');
    });
    if (this.groupBy === 'none') {
      this.groups = [{ label: '', items: this.filtered }];
      return;
    }
    const map = new Map<string, PlanItem[]>();
    for (const item of this.filtered) {
      const key = this.groupKey(item);
      map.set(key, [...(map.get(key) ?? []), item]);
    }
    this.groups = [...map.entries()].map(([key, items]) => ({ label: this.groupLabel(key), items }));
  }

  private groupKey(item: PlanItem): string {
    const date = item.scheduledFor ? localDate(item.scheduledFor, this.timezone) : '';
    switch (this.groupBy) {
      case 'day': return date || 'unscheduled';
      case 'week': return date ? startOfWeek(date) : 'unscheduled';
      case 'status': return item.status;
      case 'cluster': return item.topicCluster || 'No cluster';
      default: return item.contentType || 'No content type';
    }
  }

  private groupLabel(key: string): string {
    if (key === 'unscheduled') return 'Unscheduled';
    if (this.groupBy === 'day') return formatDay(key, { weekday: 'long', day: 'numeric', month: 'long' });
    if (this.groupBy === 'week') return `Week of ${formatDay(key, { day: 'numeric', month: 'long' })}`;
    if (this.groupBy === 'status') return statusLabel(key);
    return key;
  }

  toggle(id: string): void {
    this.selected = new Set(this.selected);
    if (this.selected.has(id)) this.selected.delete(id);
    else this.selected.add(id);
  }

  allSelected(items: PlanItem[]): boolean {
    return items.length > 0 && items.every((item) => this.selected.has(item.id));
  }

  toggleAll(items: PlanItem[], event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.selected = new Set(this.selected);
    for (const item of items) {
      if (checked) this.selected.add(item.id);
      else this.selected.delete(item.id);
    }
  }

  selectShown(): void {
    this.selected = new Set([...this.selected, ...this.filtered.map((item) => item.id)]);
  }

  clear(): void {
    this.selected = new Set();
  }

  emit(kind: 'approve' | 'reject' | 'delete' | 'regenerate'): void {
    this.action.emit({ kind, ids: [...this.selected] });
  }

  emitShift(): void {
    this.action.emit({ kind: 'reschedule', ids: [...this.selected], days: Math.round(Number(this.shiftDays)) });
  }
}
