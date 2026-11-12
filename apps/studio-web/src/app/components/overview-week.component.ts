import { DatePipe } from '@angular/common';
import { Component, input, output } from '@angular/core';
import type { EditorialPlanItem } from '../models/studio.models';
import type { PlanChip } from '../utils/overview-model';

export type WeekDay = { offset: number; date: Date; isToday: boolean; items: Array<{ item: EditorialPlanItem; title: string; chip: PlanChip }> };

/** Seven-day strip of planned topics with their status; picking a topic opens that day. */
@Component({
  selector: 'app-overview-week',
  standalone: true,
  imports: [DatePipe],
  template: `
    <ol class="wk">
      @for (d of days(); track d.offset) {
        <li class="wk__day" [class.is-today]="d.isToday">
          <span class="wk__head"><span>{{ d.date | date: 'EEE' }}</span><strong>{{ d.date | date: 'd' }}</strong></span>
          @for (entry of d.items; track entry.item.id) {
            <button type="button" class="wk__topic" (click)="pick.emit(d.offset)">
              <span class="wk__chip" [attr.data-chip]="entry.chip" [attr.title]="entry.chip">{{ entry.chip === 'Needs approval' ? 'To review' : entry.chip }}</span>
              <span class="wk__title">{{ entry.title }}</span>
              @if (entry.item.primaryKeyword) { <span class="wk__kw">{{ entry.item.primaryKeyword }}</span> }
            </button>
          } @empty {
            <span class="wk__empty">No topic</span>
          }
        </li>
      }
    </ol>
  `,
  styles: [
    `
      .wk { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: var(--au-s2); margin: 0; padding: 0; list-style: none; }
      .wk__day { min-width: 0; display: flex; flex-direction: column; gap: var(--au-s2); min-height: 132px; padding: var(--au-s2); border: 1px solid var(--au-border); border-radius: 12px; background: var(--au-surface-hover); }
      .wk__day.is-today { border-color: var(--au-accent); box-shadow: inset 0 3px 0 var(--au-accent); }
      .wk__head { display: flex; align-items: baseline; gap: 6px; color: var(--au-muted); font-size: var(--au-fs-caption); }
      .wk__head strong { color: var(--au-text); font-size: var(--au-fs-body); font-weight: 600; font-variant-numeric: tabular-nums; }
      .wk__empty { color: var(--au-faint); font-size: var(--au-fs-caption); }
      .wk__topic { min-width: 0; max-width: 100%; display: flex; flex-direction: column; align-items: flex-start; gap: 4px; padding: 6px; border: 1px solid var(--au-border); border-radius: 8px; background: var(--au-surface); color: var(--au-text); font: inherit; text-align: left; cursor: pointer; }
      .wk__topic:hover { border-color: var(--au-border-strong); }
      .wk__title { font-size: var(--au-fs-caption); line-height: 1.35; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
      .wk__kw { color: var(--au-muted); font-size: 11px; }
      .wk__chip { display: inline-flex; align-items: center; height: 20px; padding: 0 6px; border-radius: 6px; font-size: 11px; font-weight: 500; white-space: nowrap; max-width: 100%; overflow: hidden; text-overflow: ellipsis; background: var(--au-surface-2); color: var(--au-muted); }
      .wk__chip[data-chip='Published'] { background: var(--au-success-soft); color: var(--au-success); }
      .wk__chip[data-chip='Written'] { background: var(--au-info-soft); color: var(--au-info); }
      .wk__chip[data-chip='Queued'] { background: var(--au-warning-soft); color: var(--au-warning); }
      .wk__chip[data-chip='Needs approval'] { background: var(--au-brand-soft); color: var(--au-brand); }
      @media (max-width: 1100px) { .wk { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
      @media (max-width: 600px) { .wk { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    `,
  ],
})
export class OverviewWeekComponent {
  readonly days = input.required<WeekDay[]>();
  readonly pick = output<number>();
}
