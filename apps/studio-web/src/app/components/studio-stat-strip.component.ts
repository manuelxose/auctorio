import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';

export type StudioStatItem = {
  label: string;
  value: string | number;
  detail: string;
};

@Component({
  selector: 'app-studio-stat-strip',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="console-stat-grid">
      <article class="console-stat-card" *ngFor="let stat of items">
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
