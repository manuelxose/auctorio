import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AppContextService } from '../services/app-context.service';
import { SeoService } from '../services/seo.service';
import { StudioApiService } from '../services/studio-api.service';

const DEFAULT_RETURN_TO = '/studio/overview';

function resolveReturnTo(value: string | null | undefined): string {
  const normalized = String(value || '').trim();
  return normalized.startsWith('/studio/') ? normalized : DEFAULT_RETURN_TO;
}

@Component({
  selector: 'app-login-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <main class="au-auth">
      <div class="au-auth__card">
        <a class="au-brand" routerLink="/" aria-label="Auctorio">
          <span class="au-brand__mark">AU</span>
          <span class="au-brand__name">Auctorio</span>
        </a>

        <h1 class="au-auth__title">Sign in</h1>
        <p class="au-auth__hint">Create, review and publish content for your sites.</p>

        <form class="au-auth__form" (ngSubmit)="submit()">
          <label class="au-field">
            <span class="au-field__label">Email</span>
            <input
              class="au-input"
              type="email"
              name="email"
              autocomplete="email"
              [(ngModel)]="email"
              required
            />
          </label>

          <label class="au-field">
            <span class="au-field__label">Password</span>
            <input
              class="au-input"
              type="password"
              name="password"
              autocomplete="current-password"
              [(ngModel)]="password"
              required
            />
          </label>

          <div class="au-auth__row">
            <a class="au-link" routerLink="/forgot-password">Forgot password?</a>
          </div>

          <p class="au-error" *ngIf="error">{{ error }}</p>

          <button class="au-button au-button--primary au-button--block" type="submit" [disabled]="busy">
            {{ busy ? 'Signing in…' : 'Sign in' }}
          </button>
        </form>

        <ng-container *ngIf="googleConfigured">
          <div class="au-divider"><span>or</span></div>
          <button
            class="au-button au-button--secondary au-button--block"
            type="button"
            [disabled]="busy"
            (click)="submitGoogle()"
          >
            Continue with Google
          </button>
          <p class="au-auth__hint" *ngIf="googleHint">{{ googleHint }}</p>
        </ng-container>
      </div>
    </main>
  `,
})
export class LoginPageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly seo = inject(SeoService);
  private readonly api = inject(StudioApiService);
  private readonly appContext = inject(AppContextService);

  email = '';
  password = '';
  error = '';
  busy = false;
  googleConfigured = false;
  googleHint = '';

  constructor() {
    this.email = String(this.route.snapshot.queryParamMap.get('email') || '').trim();
    const reason = String(this.route.snapshot.queryParamMap.get('reason') || '').trim();
    if (reason === 'session_expired') {
      this.error = 'Your session expired. Please sign in again.';
    }
    if (this.route.snapshot.queryParamMap.get('activated')) {
      this.error = '';
    }

    this.seo.update({
      title: 'Sign in · Auctorio',
      description: 'Sign in to Auctorio.',
      path: '/login',
      locale: 'en',
      noIndex: true,
    });

    this.api.getAuthProviders().subscribe({
      next: (providers) => {
        this.googleConfigured = Boolean(providers.googleClientId);
      },
      error: () => {
        this.googleConfigured = false;
      },
    });
  }

  submit(): void {
    if (!this.email.trim() || !this.password) {
      this.error = 'Enter your email and password.';
      return;
    }

    this.busy = true;
    this.error = '';
    this.api
      .loginWithPassword({ email: this.email.trim(), password: this.password })
      .subscribe({
        next: (session) => {
          this.appContext.setSession(session);
          void this.router.navigateByUrl(
            resolveReturnTo(this.route.snapshot.queryParamMap.get('returnTo')),
          );
        },
        error: (err) => {
          this.busy = false;
          this.error = this.describeError(err);
        },
      });
  }

  submitGoogle(): void {
    this.googleHint =
      'Google sign-in requires the browser identity flow configured for this deployment. Use email and password to continue.';
  }

  private describeError(err: unknown): string {
    const body = (err as { error?: { message?: string } })?.error;
    if (body?.message) {
      const message = String(body.message);
      const labels: Record<string, string> = {
        invalid_credentials: 'Incorrect email or password.',
        user_not_authorized: 'This account has no access to Auctorio.',
        user_suspended: 'This account is suspended.',
        activation_required: 'Activate your account before signing in.',
      };
      return labels[message] ?? message;
    }
    return 'Could not sign in. Please try again.';
  }
}
