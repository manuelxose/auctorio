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
          <p class="au-muted">Pega un sitio web, el enlace de un perfil de Instagram o X, o un &#64;usuario</p>
        </div>
      }
      <label class="au-magic__field">
        <span class="au-sr-only">Sitio web, enlace de perfil o usuario</span>
        <app-icon name="plug"></app-icon>
        <input
          class="au-magic__input"
          type="text"
          name="target"
          autocomplete="off"
          spellcheck="false"
          [(ngModel)]="value"
          (ngModelChange)="detected = detect($event)"
          placeholder="ejemplo.com o @tumarca"
        />
        <button class="au-btn au-btn--primary" type="submit" [disabled]="!detected">
          Conectar
          <app-icon name="arrow-right"></app-icon>
        </button>
      </label>
      <div class="au-magic__result" aria-live="polite">
        @if (detected) {
          <span class="au-magic__chip" [attr.data-kind]="detected.kind">
            <app-icon [name]="detected.kind === 'website' ? 'globe' : 'user'"></app-icon>
            {{ detected.kind === 'website' ? 'Sitio web · ' + detected.label : detected.kind === 'handle' ? detected.label + ' · elige la red a continuación' : detected.label }}
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
