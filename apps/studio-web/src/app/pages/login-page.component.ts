import { CommonModule, isPlatformBrowser } from '@angular/common';
import {
  AfterViewInit,
  Component,
  ElementRef,
  NgZone,
  PLATFORM_ID,
  ViewChild,
  inject,
} from '@angular/core';
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

type GoogleCredentialResponse = {
  credential?: string;
};

type GoogleAccounts = {
  accounts: {
    id: {
      initialize: (config: { client_id: string; callback: (response: GoogleCredentialResponse) => void }) => void;
      renderButton: (element: HTMLElement, options: Record<string, unknown>) => void;
    };
  };
};

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
          <div #googleButtonHost class="au-google-button" aria-label="Continue with Google" *ngIf="!googleFailed"></div>
          <p class="au-auth__hint au-google-fallback" *ngIf="googleFailed">
            Google Sign-In is not available for this domain yet. Use email and password to continue.
          </p>
        </ng-container>
      </div>
    </main>
  `,
})
export class LoginPageComponent implements AfterViewInit {
  @ViewChild('googleButtonHost')
  private readonly googleButtonHost?: ElementRef<HTMLDivElement>;

  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly seo = inject(SeoService);
  private readonly api = inject(StudioApiService);
  private readonly appContext = inject(AppContextService);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly zone = inject(NgZone);
  private readonly isBrowser = isPlatformBrowser(this.platformId);

  email = '';
  password = '';
  error = '';
  busy = false;
  googleConfigured = false;
  googleFailed = false;
  private googleClientId: string | null = null;
  private googleRenderTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.email = String(this.route.snapshot.queryParamMap.get('email') || '').trim();
    const reason = String(this.route.snapshot.queryParamMap.get('reason') || '').trim();
    if (reason === 'session_expired') {
      this.error = 'Your session expired. Please sign in again.';
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
        if (providers.googleClientId) {
          this.googleClientId = providers.googleClientId;
          this.googleConfigured = true;
          if (this.isBrowser) {
            this.loadGoogleIdentity(providers.googleClientId);
          }
        }
      },
      error: () => {
        this.googleConfigured = false;
      },
    });
  }

  ngAfterViewInit(): void {
    if (this.isBrowser && this.googleClientId) {
      this.renderGoogleButton(this.googleClientId);
    }
  }

  private loadGoogleIdentity(clientId: string): void {
    const windowRef = window as unknown as { google?: GoogleAccounts };
    if (windowRef.google?.accounts?.id) {
      this.initGoogleIdentity(clientId, windowRef.google);
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => {
      const loaded = window as unknown as { google?: GoogleAccounts };
      if (loaded.google?.accounts?.id) {
        this.initGoogleIdentity(clientId, loaded.google);
      }
    };
    script.onerror = () => {
      this.error = 'Google Sign-In could not be loaded. Use email and password.';
    };
    document.head.appendChild(script);
  }

  private initGoogleIdentity(clientId: string, google: GoogleAccounts): void {
    google.accounts.id.initialize({
      client_id: clientId,
      callback: (response) => {
        if (response.credential) {
          this.completeGoogleLogin(response.credential);
        }
      },
    });
    this.renderGoogleButton(clientId);
  }

  private renderGoogleButton(clientId: string): void {
    const host = this.googleButtonHost?.nativeElement;
    const windowRef = window as unknown as { google?: GoogleAccounts };
    if (!host || !windowRef.google?.accounts?.id || this.googleRenderTimer) {
      return;
    }

    windowRef.google.accounts.id.renderButton(host, {
      type: 'standard',
      theme: 'outline',
      size: 'large',
      text: 'continue_with',
      shape: 'rectangular',
      width: 324,
      logo_alignment: 'left',
    });

    // When this origin is not an authorized JavaScript origin for the client id,
    // Google's iframe fails to load and GSI keeps it collapsed (0x0) while
    // showing a fallback button that would only lead to an error. Detect the
    // collapsed iframe and switch to the password form with an honest hint.
    this.googleRenderTimer = setTimeout(() => {
      const iframe = host.querySelector('iframe');
      const iframeVisible =
        iframe !== null && (iframe.offsetHeight > 0 || iframe.offsetWidth > 0);
      if (!iframeVisible) {
        this.zone.run(() => {
          this.googleFailed = true;
        });
      }
    }, 5000);
  }

  private completeGoogleLogin(credential: string): void {
    this.busy = true;
    this.error = '';
    this.api.loginWithGoogle({ credential }).subscribe({
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

  private describeError(err: unknown): string {
    const body = (err as { error?: { message?: string } })?.error;
    if (body?.message) {
      const message = String(body.message);
      const labels: Record<string, string> = {
        invalid_credentials: 'Incorrect email or password.',
        user_not_authorized: 'This account has no access to Auctorio.',
        user_suspended: 'This account is suspended.',
        activation_required: 'Activate your account before signing in.',
        google_login_not_configured: 'Google Sign-In is not configured for this environment.',
        google_identity_invalid: 'The Google session could not be validated. Please try again.',
        google_email_not_verified: 'Your Google account must have a verified email.',
        google_subject_mismatch: 'This Google account is linked to a different Auctorio user.',
      };
      return labels[message] ?? message;
    }
    return 'Could not sign in. Please try again.';
  }
}
