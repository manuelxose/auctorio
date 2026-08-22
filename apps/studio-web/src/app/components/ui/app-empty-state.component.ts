import { Component, input } from '@angular/core';
import { AppIconComponent } from './app-icon.component';

/**
 * Intentional empty state: icon, title, actionable sentence and optional actions
 * projected by the parent.
 */
@Component({
  selector: 'app-empty-state',
  standalone: true,
  imports: [AppIconComponent],
  template: `
    <div class="au-empty">
      <span class="au-empty__icon">
        <app-icon [name]="icon()"></app-icon>
      </span>
      <p class="au-empty__title">{{ title() }}</p>
      @if (text()) {
        <p class="au-empty__text">{{ text() }}</p>
      }
      <div class="au-inline au-mt-2">
        <ng-content></ng-content>
      </div>
    </div>
  `,
})
export class AppEmptyStateComponent {
  readonly icon = input<string>('inbox');
  readonly title = input.required<string>();
  readonly text = input<string | null>(null);
}
