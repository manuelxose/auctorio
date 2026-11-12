import { Component, inject, input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AppIconComponent } from './ui/app-icon.component';
import { detectConnectTarget, type ConnectTarget } from '../utils/connect-target';

/** One field to connect anything: a domain, a profile link or an @handle. Opens the wizard already started. */
@Component({
  selector: 'app-connect-box',
  standalone: true,
  imports: [FormsModule, AppIconComponent],
  template: `
    <form class="au-magic au-glass-card" (ngSubmit)="go()">
      @if (title()) {
        <div class="au-magic__head">
          <h2 class="au-panel__title">{{ title() }}</h2>
          <p class="au-muted">Paste a website, an Instagram or X profile link, or an &#64;handle</p>
        </div>
      }
      <label class="au-magic__field">
        <span class="au-sr-only">Website, profile link or handle</span>
        <app-icon name="plug"></app-icon>
        <input
          class="au-magic__input"
          type="text"
          name="target"
          autocomplete="off"
          spellcheck="false"
          [(ngModel)]="value"
          (ngModelChange)="detected = detect($event)"
          placeholder="example.com or @yourbrand"
        />
        <button class="au-btn au-btn--primary" type="submit" [disabled]="!detected">
          Connect
          <app-icon name="arrow-right"></app-icon>
        </button>
      </label>
      <div class="au-magic__result" aria-live="polite">
        @if (detected) {
          <span class="au-magic__chip" [attr.data-kind]="detected.kind">
            <app-icon [name]="detected.kind === 'website' ? 'globe' : 'user'"></app-icon>
            {{ detected.kind === 'website' ? 'Website · ' + detected.label : detected.kind === 'handle' ? detected.label + ' · choose the network next' : detected.label }}
          </span>
        }
      </div>
    </form>
  `,
})
export class ConnectBoxComponent {
  private readonly router = inject(Router);
  readonly title = input<string>('');
  value = '';
  detected: ConnectTarget | null = null;

  detect(value: string): ConnectTarget | null {
    return detectConnectTarget(value);
  }

  go(): void {
    if (!this.detected) return;
    void this.router.navigate(['/studio/connections/wizard'], { queryParams: { target: this.value.trim() } });
  }
}
