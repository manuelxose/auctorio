import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-studio-empty-state',
  standalone: true,
  imports: [CommonModule],
  template: `
    <section class="console-empty-state">
      <div>
        <p class="console-kicker">{{ kicker }}</p>
        <h2>{{ title }}</h2>
        <p>{{ body }}</p>
      </div>
      <ng-content select="[empty-actions]"></ng-content>
    </section>
  `,
})
export class StudioEmptyStateComponent {
  @Input({ required: true }) kicker = '';
  @Input({ required: true }) title = '';
  @Input({ required: true }) body = '';
}
