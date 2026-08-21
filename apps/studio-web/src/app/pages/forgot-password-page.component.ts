import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { SeoService } from '../services/seo.service';
import { StudioApiService } from '../services/studio-api.service';

@Component({
  selector: 'app-forgot-password-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <main class="au-auth">
      <div class="au-auth__card">
        <a class="au-brand" routerLink="/" aria-label="Auctorio">
          <span class="au-brand__mark">AU</span>
          <span class="au-brand__name">Auctorio</span>
        </a>
        <h1 class="au-auth__title">Reset password</h1>
        <p class="au-auth__hint" *ngIf="!sent">
          Enter your email and we will send you a reset link.
        </p>
        <p class="au-notice" *ngIf="sent">
          If that email has access to Auctorio, a reset link is on its way.
        </p>

        <form class="au-auth__form" (ngSubmit)="submit()" *ngIf="!sent">
          <label class="au-field">
            <span class="au-field__label">Email</span>
            <input class="au-input" type="email" name="email" autocomplete="email" [(ngModel)]="email" required />
          </label>
          <p class="au-error" *ngIf="error">{{ error }}</p>
          <button class="au-button au-button--primary au-button--block" type="submit" [disabled]="busy">
            {{ busy ? 'Sending…' : 'Send reset link' }}
          </button>
        </form>

        <a class="au-link au-auth__back" routerLink="/login">← Back to sign in</a>
      </div>
    </main>
  `,
})
export class ForgotPasswordPageComponent {
  private readonly api = inject(StudioApiService);
  private readonly seo = inject(SeoService);

  email = '';
  sent = false;
  busy = false;
  error = '';

  constructor() {
    this.seo.update({
      title: 'Reset password · Auctorio',
      description: 'Reset your Auctorio password.',
      path: '/forgot-password',
      locale: 'en',
      noIndex: true,
    });
  }

  submit(): void {
    if (!this.email.trim()) {
      this.error = 'Enter your email.';
      return;
    }
    this.busy = true;
    this.error = '';
    this.api.sendPasswordReset(this.email.trim()).subscribe({
      next: () => {
        this.busy = false;
        this.sent = true;
      },
      error: () => {
        this.busy = false;
        this.sent = true;
      },
    });
  }
}
