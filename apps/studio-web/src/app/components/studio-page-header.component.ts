import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-studio-page-header',
  standalone: true,
  imports: [CommonModule],
  template: `
    <header class="console-page__header">
      <div class="console-page__copy">
        <p class="console-kicker">{{ kicker }}</p>
        <h1 class="console-page__title">{{ title }}</h1>
        <p class="console-page__intro">{{ intro }}</p>
        <div class="console-page__header-meta">
          <ng-content select="[page-meta]"></ng-content>
        </div>
      </div>

      <div class="console-page__actions">
        <ng-content select="[page-actions]"></ng-content>
      </div>
    </header>
  `,
})
export class StudioPageHeaderComponent {
  @Input({ required: true }) kicker = '';
  @Input({ required: true }) title = '';
  @Input({ required: true }) intro = '';
}
