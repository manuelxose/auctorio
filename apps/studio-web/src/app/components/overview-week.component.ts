import { DatePipe } from '@angular/common';
import { Component, input, output } from '@angular/core';
export type WeekEntry = { id: string; title: string; label: string; tone: string; detail: string };
export type WeekDay = { offset: number; date: Date; isToday: boolean; items: WeekEntry[] };

/** Seven-day strip of planned topics with their status; picking a day opens it. */
@Component({
  selector: 'app-overview-week',
  standalone: true,
  imports: [DatePipe],
  template: `
    <ol class="wk">
      @for (d of days(); track d.offset) {
        <li>
          <button type="button" class="wk__day" [class.is-today]="d.isToday" [class.is-selected]="d.offset === selectedOffset()" [attr.aria-pressed]="d.offset === selectedOffset()" (click)="pick.emit(d.offset)">
            <span class="wk__head"><span>{{ d.date | date: 'EEE' : '' : 'es' }}</span><strong>{{ d.date | date: 'd' }}</strong></span>
            @for (entry of d.items; track entry.id) {
              <span class="wk__topic">
                <span class="wk__chip" [attr.data-tone]="entry.tone">{{ entry.label }}</span>
                <span class="wk__title">{{ entry.title }}</span>
                @if (entry.detail) { <span class="wk__kw">{{ entry.detail }}</span> }
              </span>
            } @empty {
              <span class="wk__empty">Sin tema</span>
            }
          </button>
        </li>
      }
    </ol>
  `,
  styles: [
    `
      .wk { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: var(--au-s2); margin: 0; padding: 0; list-style: none; }
      .wk li { min-width: 0; }
      .wk__day { width: 100%; height: 100%; min-height: 158px; display: flex; flex-direction: column; gap: 7px; padding: 11px; border: 1px solid var(--au-border); border-radius: 10px; background: var(--au-surface-hover); color: var(--au-text); font: inherit; text-align: left; cursor: pointer; }
      .wk__day:hover { border-color: var(--au-brand); }
      .wk__day:focus-visible { outline: 2px solid var(--au-brand); outline-offset: 2px; }
      .wk__day.is-today { border-color: var(--au-brand); }
      .wk__day.is-selected { border-color: var(--au-brand); background: var(--au-brand-soft); box-shadow: inset 0 3px 0 var(--au-brand); }
      .wk__head { display: flex; align-items: baseline; justify-content: space-between; gap: 5px; color: var(--au-muted); font-size: var(--au-fs-caption); }
      .wk__head strong { color: var(--au-text); font-size: var(--au-fs-body); font-weight: 600; font-variant-numeric: tabular-nums; }
      .wk__day.is-today .wk__head strong { color: var(--au-brand); }
      .wk__empty { display: flex; align-items: center; min-height: 66px; color: var(--au-muted); font-size: var(--au-fs-caption); }
      .wk__topic { min-width: 0; display: flex; flex-direction: column; align-items: flex-start; gap: 4px; }
      .wk__topic + .wk__topic { padding-top: 7px; border-top: 1px solid var(--au-border); }
      .wk__title { font-size: var(--au-fs-caption); font-weight: 600; line-height: 1.4; overflow-wrap: anywhere; }
      .wk__kw { color: var(--au-muted); font-size: 11px; overflow-wrap: anywhere; }
      .wk__chip { max-width: 100%; padding: 3px 6px; border-radius: 6px; font-size: 11px; font-weight: 600; line-height: 1.3; background: var(--au-surface-2); color: var(--au-muted); }
      .wk__chip[data-tone='green'] { background: var(--au-success-soft); color: var(--au-success); }
      .wk__chip[data-tone='blue'] { background: var(--au-info-soft); color: var(--au-info); }
      .wk__chip[data-tone='amber'] { background: var(--au-warning-soft); color: var(--au-warning); }
      .wk__chip[data-tone='violet'] { background: var(--au-brand-soft); color: var(--au-brand); }
      .wk__chip[data-tone='red'] { background: var(--au-error-soft); color: var(--au-error); }
      @media (max-width: 1100px) { .wk { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
      @media (max-width: 760px) { .wk { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    `,
  ],
})
export class OverviewWeekComponent {
  readonly days = input.required<WeekDay[]>();
  readonly selectedOffset = input<number | null>(null);
  readonly pick = output<number>();
}
