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
import { ThemeService } from '../services/theme.service';
import { AppIconComponent } from '../components/ui/app-icon.component';

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
  imports: [CommonModule, FormsModule, RouterLink, AppIconComponent],
  template: `
    <section class="auth-layout">
      <div class="auth-pitch">
        <p class="marketing-kicker">Auctorio Studio</p>
        <h1>Sign in to your editorial workspace</h1>
        <p class="marketing-lead">Plan, review and publish for every site and channel your team runs.</p>
        <ul class="marketing-bullet-list">
          <li>Editorial plan ranked by search demand.</li>
          <li>Review with pre-publication checks.</li>
          <li>One approval publishes everywhere.</li>
        </ul>
      </div>

      <div class="au-auth__card">
        <button
          class="au-btn au-btn--ghost au-btn--icon au-btn--sm au-auth__theme"
          type="button"
          (click)="theme.cycle()"
          [attr.aria-label]="'Switch appearance. Current: ' + theme.preference()"
        >
          <app-icon [name]="themeIcon"></app-icon>
        </button>
        <h2 class="au-auth__title">Sign in</h2>
        <p class="au-auth__hint">Use your Google account or your work email.</p>

        <!-- Google first: the official GSI button when a client id is configured, an honest disabled twin otherwise. -->
        <div #googleButtonHost class="au-google-button" *ngIf="googleConfigured && !googleFailed"></div>
        <ng-container *ngIf="!googleConfigured || googleFailed">
          <button class="auth-google" type="button" disabled aria-describedby="google-unavailable">
            <svg viewBox="0 0 48 48" width="18" height="18" aria-hidden="true">
              <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/>
              <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
              <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/>
              <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/>
            </svg>
            Continue with Google
          </button>
          <p class="auth-note" id="google-unavailable">
            {{ googleFailed ? 'Google sign-in is not authorised for this domain yet.' : 'Google sign-in is not enabled on this server yet.' }}
            Use your email and password.
          </p>
        </ng-container>

        <div class="au-divider"><span>or with email</span></div>

        <form class="au-auth__form" (ngSubmit)="submit()">
          <label class="au-field">
            <span class="au-field__label">Work email</span>
            <input class="au-input" type="email" name="email" autocomplete="email" [(ngModel)]="email" required />
          </label>

          <label class="au-field">
            <span class="au-field__label">Password</span>
            <input class="au-input" type="password" name="password" autocomplete="current-password" [(ngModel)]="password" required />
          </label>

          <div class="au-auth__row">
            <a class="au-link" routerLink="/forgot-password">Forgot password?</a>
          </div>

          <p class="au-error" role="alert" *ngIf="error">{{ error }}</p>

          <button class="au-btn au-btn--primary au-btn--block" type="submit" [disabled]="busy">
            {{ busy ? 'Signing in…' : 'Sign in' }}
          </button>
        </form>

        <p class="auth-note">No account yet? <a class="au-link" routerLink="/contact">Request a demo</a></p>
      </div>
    </section>
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
  protected readonly theme = inject(ThemeService);

  get themeIcon(): string {
    const preference = this.theme.preference();
    return preference === 'light' ? 'sun' : preference === 'dark' ? 'moon' : 'monitor';
  }

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
