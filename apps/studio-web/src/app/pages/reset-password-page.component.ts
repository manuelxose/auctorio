import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { SeoService } from '../services/seo.service';
import { StudioApiService } from '../services/studio-api.service';

@Component({
  selector: 'app-reset-password-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <main class="au-auth">
      <div class="au-auth__card">
        <a class="au-brand" routerLink="/" aria-label="Auctorio">
          <span class="au-brand__mark">AU</span>
          <span class="au-brand__name">Auctorio</span>
        </a>
        <h1 class="au-auth__title">Choose a new password</h1>
        <p class="au-auth__hint" *ngIf="!done">Use at least 10 characters.</p>
        <p class="au-notice" *ngIf="done">
          Password updated. You can sign in now.
        </p>

        <form class="au-auth__form" (ngSubmit)="submit()" *ngIf="!done">
          <label class="au-field">
            <span class="au-field__label">New password</span>
            <input class="au-input" type="password" name="password" autocomplete="new-password" [(ngModel)]="password" required minlength="10" />
          </label>
          <p class="au-error" *ngIf="error">{{ error }}</p>
          <button class="au-btn au-btn--primary au-btn--block" type="submit" [disabled]="busy">
            {{ busy ? 'Saving…' : 'Save password' }}
          </button>
        </form>

        <a class="au-link au-auth__back" routerLink="/login">← Back to sign in</a>
      </div>
    </main>
  `,
})
export class ResetPasswordPageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly api = inject(StudioApiService);
  private readonly seo = inject(SeoService);

  password = '';
  busy = false;
  done = false;
  error = '';

  constructor() {
    this.seo.update({
      title: 'New password · Auctorio',
      description: 'Choose a new Auctorio password.',
      path: '/reset-password',
      locale: 'en',
      noIndex: true,
    });
  }

  submit(): void {
    const token = String(this.route.snapshot.queryParamMap.get('token') || '').trim();
    if (!token) {
      this.error = 'This reset link is invalid.';
      return;
    }
    if (this.password.length < 10) {
      this.error = 'Use at least 10 characters.';
      return;
    }

    this.busy = true;
    this.error = '';
    this.api.resetPassword({ token, password: this.password }).subscribe({
      next: () => {
        this.busy = false;
        this.done = true;
      },
      error: () => {
        this.busy = false;
        this.error = 'This reset link is invalid or expired.';
      },
    });
  }
}
