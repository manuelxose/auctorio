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
import { ActivatedRoute, Router } from '@angular/router';
import { lastValueFrom } from 'rxjs';
import type {
  StudioLoginOptions,
  StudioLoginWorkspace,
  StudioSession,
} from '../models/studio.models';
import { SeoService } from '../services/seo.service';
import { StudioApiService } from '../services/studio-api.service';
import { StudioSessionService } from '../services/studio-session.service';

const DEFAULT_STUDIO_RETURN_TO = '/studio/dashboard';

const LOGIN_REASON_COPY: Record<string, string> = {
  workspace_not_found: 'No existe ese workspace.',
  identity_provider_not_configured: 'Ese workspace todavia no tiene SSO configurado.',
  user_not_invited: 'Tu cuenta todavia no tiene acceso al Studio.',
  user_suspended: 'Tu acceso al Studio esta suspendido.',
  session_expired: 'La sesion ha expirado. Vuelve a iniciar sesion.',
  workspace_launch_not_allowed: 'Este workspace no admite acceso delegado.',
  user_not_authorized: 'Tu usuario no tiene acceso a Auctorio.',
  interactive_login_required: 'Necesitas completar primero el alta interactiva.',
  launch_invalid: 'El enlace de acceso ya no es valido.',
  launch_expired: 'El enlace de acceso ha caducado.',
  launch_consumed: 'El enlace de acceso ya fue utilizado.',
  activation_required: 'Tu acceso necesita activarse antes de entrar.',
  invalid_credentials: 'Email o password incorrectos.',
  password_login_not_available: 'Esta cuenta no admite acceso local por password.',
  workspace_selection_required: 'Selecciona el workspace al que quieres entrar.',
  workspace_not_authorized: 'No tienes acceso al workspace seleccionado.',
  google_email_not_verified: 'Google no confirma ese email como verificado.',
  google_subject_mismatch: 'La cuenta de Google no coincide con el acceso autorizado.',
  google_login_not_configured: 'Google Sign-In no esta disponible en este entorno.',
  smtp_not_configured: 'El envio de correos no esta configurado todavia.',
  invite_invalid: 'El enlace de activacion no es valido.',
  invite_expired: 'El enlace de activacion ha caducado.',
  invite_consumed: 'El enlace de activacion ya fue utilizado.',
  reset_invalid: 'El enlace de reseteo no es valido.',
  reset_expired: 'El enlace de reseteo ha caducado.',
  reset_consumed: 'El enlace de reseteo ya fue utilizado.',
  password_too_short: 'Usa un password de al menos 10 caracteres.',
};

let googleScriptPromise: Promise<void> | null = null;

function resolveStudioReturnTo(value: string | null | undefined): string {
  const normalized = String(value || '').trim();
  return normalized.startsWith('/studio/') ? normalized : DEFAULT_STUDIO_RETURN_TO;
}

@Component({
  selector: 'app-login-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './login-page.component.html',
  styleUrls: ['./login-page.component.css'],
})
export class LoginPageComponent implements AfterViewInit {
  @ViewChild('googleButtonHost')
  private readonly googleButtonHost?: ElementRef<HTMLDivElement>;

  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly seo = inject(SeoService);
  private readonly api = inject(StudioApiService);
  private readonly sessionService = inject(StudioSessionService);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly ngZone = inject(NgZone);
  private readonly isBrowser = isPlatformBrowser(this.platformId);

  email = '';
  password = '';
  passwordConfirm = '';
  selectedWorkspaceId = '';
  options: StudioLoginOptions | null = null;
  activeSession: StudioSession | null = null;

  loadingOptions = false;
  loadingPassword = false;
  loadingGoogle = false;
  sendingAccessEmail = false;
  changingAccount = false;

  googleReady = false;
  googleConfigured = false;
  googleButtonRendered = false;
  googleUnavailableMessage = '';
  googleErrorMessage = '';

  error = '';
  success = '';

  returnTo = DEFAULT_STUDIO_RETURN_TO;
  publicEntry = false;
  inviteToken = '';
  resetToken = '';

  constructor() {
    const query = this.route.snapshot.queryParamMap;
    this.returnTo = resolveStudioReturnTo(query.get('returnTo'));
    this.publicEntry = String(query.get('entry') || '').trim().toLowerCase() === 'public';
    this.email = String(query.get('email') || '').trim().toLowerCase();
    this.inviteToken = String(query.get('invite') || '').trim();
    this.resetToken = String(query.get('reset') || '').trim();

    const reason = String(query.get('reason') || '').trim();
    this.error = reason ? LOGIN_REASON_COPY[reason] || `Login error: ${reason}` : '';

    this.seo.update({
      title: 'Auctorio Studio Login',
      description:
        'Email-first access to Auctorio Studio with password, Google and enterprise SSO compatibility.',
      path: '/login',
      locale: 'en',
      noIndex: true,
    });

    if (this.isBrowser) {
      void this.bootstrap();
    }
  }

  async ngAfterViewInit(): Promise<void> {
    if (!this.isBrowser) {
      return;
    }

    queueMicrotask(() => {
      void this.syncGoogleButton();
    });
  }

  get hasTokenFlow(): boolean {
    return Boolean(this.inviteToken || this.resetToken);
  }

  get showContinuation(): boolean {
    return Boolean(this.activeSession && this.publicEntry && !this.changingAccount && !this.hasTokenFlow);
  }

  get hasResolvedOptions(): boolean {
    return Boolean(this.options);
  }

  get localWorkspaces(): StudioLoginWorkspace[] {
    return this.options?.localWorkspaces ?? [];
  }

  get ssoWorkspaces(): StudioLoginWorkspace[] {
    return this.options?.ssoWorkspaces ?? [];
  }

  get requiresWorkspaceSelection(): boolean {
    return this.localWorkspaces.length > 1 && !this.selectedWorkspaceId;
  }

  get requestAccessUrl(): string {
    return this.options?.requestAccessUrl || 'https://tecnoriasl.com/contacto';
  }

  get selectedWorkspaceName(): string {
    const workspace = this.localWorkspaces.find((item) => item.workspace.id === this.selectedWorkspaceId);
    return workspace?.workspace.name || 'el workspace seleccionado';
  }

  get tokenFormTitle(): string {
    if (this.inviteToken) {
      return 'Activa tu acceso al Studio';
    }
    if (this.resetToken) {
      return 'Define un password nuevo';
    }
    return 'Accede al Studio';
  }

  async lookupEmail(): Promise<void> {
    if (!this.email.trim() || this.loadingOptions) {
      this.error = 'Introduce tu email para continuar.';
      return;
    }

    this.loadingOptions = true;
    this.error = '';
    this.success = '';
    this.options = null;
    this.selectedWorkspaceId = '';
    this.resetGoogleState();

    try {
      const options = await lastValueFrom(this.api.getLoginOptions(this.email.trim().toLowerCase()));
      this.email = options.email;
      this.options = options;
      this.selectedWorkspaceId =
        options.recommendedWorkspaceId ||
        (options.localWorkspaces.length === 1 ? options.localWorkspaces[0].workspace.id : '');
      await this.syncGoogleButton();
    } catch (error) {
      this.error = this.resolveError(error);
    } finally {
      this.loadingOptions = false;
    }
  }

  async submitPassword(): Promise<void> {
    if (this.loadingPassword) {
      return;
    }

    if (!this.password.trim()) {
      this.error = 'Introduce un password para continuar.';
      return;
    }

    if (this.requiresWorkspaceSelection) {
      this.error = LOGIN_REASON_COPY['workspace_selection_required'];
      return;
    }

    this.loadingPassword = true;
    this.error = '';
    this.success = '';

    try {
      if (this.inviteToken) {
        if (this.password.trim().length < 10) {
          this.error = LOGIN_REASON_COPY['password_too_short'];
          return;
        }
        if (this.password !== this.passwordConfirm) {
          this.error = 'Los passwords no coinciden.';
          return;
        }

        const session = await lastValueFrom(
          this.api.acceptInvitation({
            token: this.inviteToken,
            password: this.password,
            workspaceId: this.selectedWorkspaceId || null,
          }),
        );
        await this.completeLogin(session);
        return;
      }

      if (this.resetToken) {
        if (this.password.trim().length < 10) {
          this.error = LOGIN_REASON_COPY['password_too_short'];
          return;
        }
        if (this.password !== this.passwordConfirm) {
          this.error = 'Los passwords no coinciden.';
          return;
        }

        await lastValueFrom(
          this.api.resetPassword({
            token: this.resetToken,
            password: this.password,
          }),
        );
        this.resetToken = '';
        this.password = '';
        this.passwordConfirm = '';
        this.success = 'Password actualizado. Ya puedes entrar con tu cuenta.';
        if (!this.options && this.email) {
          await this.lookupEmail();
        }
        return;
      }

      const session = await lastValueFrom(
        this.api.loginWithPassword({
          email: this.email.trim().toLowerCase(),
          password: this.password,
          workspaceId: this.selectedWorkspaceId || null,
        }),
      );

      await this.completeLogin(session);
    } catch (error) {
      this.error = this.resolveError(error);
    } finally {
      this.loadingPassword = false;
    }
  }

  async sendAccessEmail(): Promise<void> {
    if (!this.email.trim() || this.sendingAccessEmail) {
      return;
    }

    this.sendingAccessEmail = true;
    this.error = '';
    this.success = '';

    try {
      await lastValueFrom(this.api.sendPasswordReset(this.email.trim().toLowerCase()));
      this.success =
        this.options?.accountState === 'invited'
          ? 'Te hemos enviado un enlace de activacion al email.'
          : 'Te hemos enviado un enlace para restablecer el password.';
    } catch (error) {
      this.error = this.resolveError(error);
    } finally {
      this.sendingAccessEmail = false;
    }
  }

  async switchAccount(): Promise<void> {
    this.changingAccount = true;
    this.error = '';
    this.success = '';
    this.resetToken = '';
    this.inviteToken = '';

    try {
      await lastValueFrom(this.api.logout());
    } catch {
      // Best effort.
    }

    this.sessionService.clearSession();
    this.activeSession = null;
  }

  async goWithSso(workspace: StudioLoginWorkspace): Promise<void> {
    const slug = workspace.workspace.slug;
    if (!slug || !this.isBrowser) {
      return;
    }
    window.location.assign(
      `/studio/api/auth/sso/start?workspace=${encodeURIComponent(slug)}&returnTo=${encodeURIComponent(
        this.returnTo,
      )}`,
    );
  }

  changeEmail(): void {
    this.password = '';
    this.passwordConfirm = '';
    this.options = null;
    this.selectedWorkspaceId = '';
    this.error = '';
    this.success = '';
    this.resetGoogleState();
  }

  private async bootstrap(): Promise<void> {
    try {
      this.activeSession = await this.sessionService.ensureSession();
    } catch {
      this.activeSession = null;
    }

    if (this.email) {
      await this.lookupEmail();
    }
  }

  private async completeLogin(session: StudioSession): Promise<void> {
    this.sessionService.setSession(session);
    this.activeSession = session;
    await this.router.navigateByUrl(this.returnTo);
  }

  private resetGoogleState(): void {
    this.googleReady = false;
    this.googleConfigured = false;
    this.googleButtonRendered = false;
    this.googleUnavailableMessage = '';
    this.googleErrorMessage = '';
    if (this.googleButtonHost?.nativeElement) {
      this.googleButtonHost.nativeElement.innerHTML = '';
    }
  }

  private async syncGoogleButton(): Promise<void> {
    if (!this.isBrowser || !this.googleButtonHost?.nativeElement) {
      return;
    }

    if (!this.options?.canUseGoogle || this.hasTokenFlow) {
      this.resetGoogleState();
      return;
    }

    const clientId = this.options.googleClientId?.trim();
    if (!clientId) {
      this.googleConfigured = false;
      this.googleUnavailableMessage = LOGIN_REASON_COPY['google_login_not_configured'];
      return;
    }

    this.googleConfigured = true;

    try {
      await this.loadGoogleScript();
      const googleApi = (window as any).google;
      if (!googleApi?.accounts?.id) {
        throw new Error('Google Identity Services unavailable');
      }

      googleApi.accounts.id.initialize({
        client_id: clientId,
        callback: ({ credential }: { credential?: string }) => {
          if (!credential) {
            this.googleErrorMessage = 'No se pudo validar el acceso con Google.';
            return;
          }

          void this.ngZone.run(async () => {
            await this.signInWithGoogle(credential);
          });
        },
      });

      this.googleButtonHost.nativeElement.innerHTML = '';
      googleApi.accounts.id.renderButton(this.googleButtonHost.nativeElement, {
        theme: 'outline',
        size: 'large',
        shape: 'pill',
        text: 'continue_with',
        width: this.getGoogleButtonWidth(),
      });

      this.googleReady = true;
      this.googleButtonRendered = true;
      this.googleUnavailableMessage = '';
    } catch (error) {
      console.error('Google button setup failed:', error);
      this.googleReady = false;
      this.googleConfigured = true;
      this.googleUnavailableMessage =
        'No se pudo cargar Google Sign-In. Revisa bloqueadores de scripts o vuelve a intentarlo.';
    }
  }

  private async signInWithGoogle(credential: string): Promise<void> {
    if (this.loadingGoogle || this.requiresWorkspaceSelection) {
      if (this.requiresWorkspaceSelection) {
        this.googleErrorMessage = LOGIN_REASON_COPY['workspace_selection_required'];
      }
      return;
    }

    this.loadingGoogle = true;
    this.googleErrorMessage = '';
    this.error = '';

    try {
      const session = await lastValueFrom(
        this.api.loginWithGoogle({
          credential,
          emailHint: this.email.trim().toLowerCase() || null,
          workspaceId: this.selectedWorkspaceId || null,
        }),
      );
      await this.completeLogin(session);
    } catch (error) {
      this.googleErrorMessage = this.resolveError(error);
    } finally {
      this.loadingGoogle = false;
    }
  }

  private resolveError(error: unknown): string {
    const status = Number((error as any)?.status || 0);
    const message = String((error as any)?.error?.message || (error as any)?.message || '').trim();
    if (message && LOGIN_REASON_COPY[message]) {
      return LOGIN_REASON_COPY[message];
    }
    if (status === 401) {
      return 'No se pudo validar tu sesion actual.';
    }
    if (status === 404) {
      return 'No se ha encontrado el recurso solicitado.';
    }
    if (message) {
      return message;
    }
    return 'No se pudo completar el acceso al Studio. Intentalo de nuevo.';
  }

  private loadGoogleScript(): Promise<void> {
    if ((window as any).google?.accounts?.id) {
      return Promise.resolve();
    }

    if (googleScriptPromise) {
      return googleScriptPromise;
    }

    googleScriptPromise = new Promise<void>((resolve, reject) => {
      const existing = document.querySelector(
        'script[data-auctorio-google-signin="true"]',
      ) as HTMLScriptElement | null;
      if (existing) {
        existing.addEventListener('load', () => resolve(), { once: true });
        existing.addEventListener(
          'error',
          () => reject(new Error('Failed to load Google Identity Services')),
          { once: true },
        );
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.dataset['auctorioGoogleSignin'] = 'true';
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Failed to load Google Identity Services'));
      document.head.appendChild(script);
    });

    return googleScriptPromise;
  }

  private getGoogleButtonWidth(): number {
    return Math.min(420, Math.max(280, window.innerWidth < 540 ? window.innerWidth - 64 : 360));
  }
}
