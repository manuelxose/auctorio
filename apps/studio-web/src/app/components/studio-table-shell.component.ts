import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-studio-table-shell',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="console-table-shell">
      <div class="console-table-shell__head">
        <div class="console-table-shell__title-wrap">
          <p class="console-surface__eyebrow">{{ eyebrow }}</p>
          <h2 class="console-surface__title">{{ title }}</h2>
        </div>
        <ng-content select="[table-actions]"></ng-content>
      </div>
      <ng-content></ng-content>
    </div>
  `,
})
export class StudioTableShellComponent {
  @Input({ required: true }) eyebrow = '';
  @Input({ required: true }) title = '';
}
