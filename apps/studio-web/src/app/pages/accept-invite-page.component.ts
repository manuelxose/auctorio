import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { SeoService } from '../services/seo.service';
import { StudioApiService } from '../services/studio-api.service';

@Component({
  selector: 'app-accept-invite-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <main class="au-auth">
      <div class="au-auth__card">
        <a class="au-brand" routerLink="/" aria-label="Auctorio">
          <span class="au-brand__mark">AU</span>
          <span class="au-brand__name">Auctorio</span>
        </a>
        <h1 class="au-auth__title">Accept your invitation</h1>
        <p class="au-auth__hint">Choose a password to activate your account.</p>

        <form class="au-auth__form" (ngSubmit)="submit()">
          <label class="au-field">
            <span class="au-field__label">Password</span>
            <input class="au-input" type="password" name="password" autocomplete="new-password" [(ngModel)]="password" required minlength="10" />
          </label>
          <p class="au-error" *ngIf="error">{{ error }}</p>
          <button class="au-button au-button--primary au-button--block" type="submit" [disabled]="busy">
            {{ busy ? 'Activating…' : 'Activate account' }}
          </button>
        </form>

        <a class="au-link au-auth__back" routerLink="/login">← Back to sign in</a>
      </div>
    </main>
  `,
})
export class AcceptInvitePageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly api = inject(StudioApiService);
  private readonly seo = inject(SeoService);

  password = '';
  busy = false;
  error = '';

  constructor() {
    this.seo.update({
      title: 'Accept invitation · Auctorio',
      description: 'Activate your Auctorio account.',
      path: '/accept-invite',
      locale: 'en',
      noIndex: true,
    });
  }

  submit(): void {
    const token = String(this.route.snapshot.queryParamMap.get('token') || '').trim();
    if (!token) {
      this.error = 'This invitation link is invalid.';
      return;
    }
    if (this.password.length < 10) {
      this.error = 'Use at least 10 characters.';
      return;
    }

    this.busy = true;
    this.error = '';
    this.api.acceptInvitation({ token, password: this.password }).subscribe({
      next: () => {
        void this.router.navigate(['/login'], {
          queryParams: { activated: '1' },
        });
      },
      error: () => {
        this.busy = false;
        this.error = 'This invitation link is invalid or expired.';
      },
    });
  }
}
