import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, Output } from '@angular/core';
import type { PlanItem } from '../../models/planning.models';
import { channelLabel, formatDay, itemTitle, localDate, localTime, statusTone } from './planning-utils';

const STAGES: Array<{ key: string; label: string; statuses: string[] }> = [
  { key: 'proposed', label: 'Proposals', statuses: ['proposed'] },
  { key: 'approved', label: 'Approved briefs', statuses: ['approved', 'content_pending'] },
  { key: 'writing', label: 'Writing', statuses: ['generating'] },
  { key: 'review', label: 'Draft ready / review', statuses: ['content_ready', 'review_required'] },
  { key: 'delivery', label: 'Scheduled / published', statuses: ['scheduled', 'published'] },
  { key: 'closed', label: 'Rejected / canceled', statuses: ['rejected', 'canceled'] },
];

/** The plan's items by lifecycle stage. */
@Component({
  selector: 'app-plan-pipeline-view',
  standalone: true,
  imports: [CommonModule],
  styles: [
    `
      .pp { display: grid; grid-auto-flow: column; grid-auto-columns: minmax(220px, 1fr); gap: var(--au-s3); overflow-x: auto; padding-bottom: var(--au-s2); scroll-snap-type: x mandatory; }
      .pp__col { scroll-snap-align: start; min-width: 0; border: 1px solid var(--au-border); border-radius: var(--au-r-md); background: var(--au-surface-2); padding: var(--au-s2); display: flex; flex-direction: column; gap: var(--au-s2); max-height: 70vh; }
      .pp__col h3 { margin: 0; display: flex; justify-content: space-between; font-size: var(--au-fs-body-sm); padding: 2px 4px; }
      .pp__col h3 span { color: var(--au-muted); font-variant-numeric: tabular-nums; }
      .pp__list { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--au-s2); overflow-y: auto; }
      .pp__card { width: 100%; text-align: left; border: 1px solid var(--au-border); border-left: 3px solid var(--pp-tone, var(--au-border-strong)); border-radius: var(--au-r-sm); background: var(--au-surface); padding: 8px; font: inherit; color: var(--au-text); cursor: pointer; display: grid; gap: 2px; }
      .pp__card:hover { border-color: var(--au-border-strong); }
      .pp__card small { color: var(--au-muted); font-size: var(--au-fs-caption); font-variant-numeric: tabular-nums; }
      .pp__card strong { font-weight: 560; font-size: var(--au-fs-body-sm); overflow-wrap: anywhere; }
      .pp__empty { color: var(--au-muted); font-size: var(--au-fs-caption); padding: 4px; }
      .tone-success { --pp-tone: var(--au-success); } .tone-warning { --pp-tone: var(--au-warning); } .tone-danger { --pp-tone: var(--au-danger); }
      .tone-brand { --pp-tone: var(--au-brand); } .tone-info { --pp-tone: var(--au-info); }
      @media (min-width: 1280px) { .pp { grid-auto-columns: minmax(0, 1fr); } }
    `,
  ],
  template: `
    <div class="pp" role="list" aria-label="Pipeline by stage">
      <section class="pp__col" *ngFor="let column of columns" role="listitem" [attr.aria-label]="column.label + ', ' + column.items.length">
        <h3>{{ column.label }} <span>{{ column.items.length }}</span></h3>
        <ul class="pp__list">
          <li *ngFor="let item of column.items">
            <button type="button" class="pp__card" [ngClass]="'tone-' + tone(item.status)" (click)="open.emit(item)">
              <small>{{ when(item) }} · {{ channel(item.channel) }}</small>
              <strong>{{ title(item) }}</strong>
            </button>
          </li>
        </ul>
        <p class="pp__empty" *ngIf="column.items.length === 0">Nothing here.</p>
      </section>
    </div>
  `,
})
export class PlanPipelineViewComponent implements OnChanges {
  @Input() items: PlanItem[] = [];
  @Input() timezone = 'Europe/Madrid';
  @Output() open = new EventEmitter<PlanItem>();
  columns: Array<{ label: string; items: PlanItem[] }> = [];
  readonly tone = statusTone;
  readonly channel = channelLabel;
  readonly title = itemTitle;

  ngOnChanges(): void {
    const sorted = [...this.items].sort((a, b) => (a.scheduledFor ?? '').localeCompare(b.scheduledFor ?? ''));
    this.columns = STAGES.map((stage) => ({ label: stage.label, items: sorted.filter((item) => stage.statuses.includes(item.status)) }));
  }

  when(item: PlanItem): string {
    if (!item.scheduledFor) return 'Unscheduled';
    return `${formatDay(localDate(item.scheduledFor, this.timezone), { day: 'numeric', month: 'short' })} ${localTime(item.scheduledFor, this.timezone)}`;
  }
}
