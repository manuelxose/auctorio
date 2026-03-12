import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-studio-side-panel',
  standalone: true,
  imports: [CommonModule],
  template: `
    <section class="console-surface">
      <div class="console-surface__head">
        <div>
          <p class="console-surface__eyebrow">{{ eyebrow }}</p>
          <h2 class="console-surface__title">{{ title }}</h2>
        </div>
      </div>
      <ng-content></ng-content>
    </section>
  `,
})
export class StudioSidePanelComponent {
  @Input({ required: true }) eyebrow = '';
  @Input({ required: true }) title = '';
}
