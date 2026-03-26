import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';

export type StudioStatItem = {
  label: string;
  value: string | number;
  detail: string;
  tone?: 'muted' | 'accent' | 'warning' | 'success' | 'danger';
};

@Component({
  selector: 'app-studio-stat-strip',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="console-stat-grid">
      <article
        class="console-stat-card"
        *ngFor="let stat of items"
        [class.console-stat-card--accent]="stat.tone === 'accent'"
        [class.console-stat-card--warning]="stat.tone === 'warning'"
        [class.console-stat-card--success]="stat.tone === 'success'"
        [class.console-stat-card--danger]="stat.tone === 'danger'"
      >
        <p class="console-stat-card__label">{{ stat.label }}</p>
        <strong class="console-stat-card__value">{{ stat.value }}</strong>
        <span class="console-stat-card__detail">{{ stat.detail }}</span>
      </article>
    </div>
  `,
})
export class StudioStatStripComponent {
  @Input({ required: true }) items: StudioStatItem[] = [];
}
