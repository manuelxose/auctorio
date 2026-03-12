import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { lastValueFrom } from 'rxjs';
import type { StudioWorkspaceAccess } from '../models/studio.models';
import { SeoService } from '../services/seo.service';
import { StudioApiService } from '../services/studio-api.service';

const LOGIN_REASON_COPY: Record<string, string> = {
  workspace_not_found: 'No existe ningún workspace con ese slug.',
  identity_provider_not_configured: 'El workspace existe, pero todavía no tiene SSO OIDC configurado.',
  user_not_invited: 'Tu cuenta todavía no está invitada al workspace.',
  user_suspended: 'Tu acceso está suspendido. Contacta con un administrador del workspace.',
  session_expired: 'La sesión ha expirado. Inicia sesión otra vez para continuar.',
};

@Component({
  selector: 'app-login-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  template: `
    <div class="console-auth">
      <section class="console-auth__hero">
        <p class="console-kicker">Auctorio</p>
        <h1>Este es el cockpit editorial para operar múltiples webs con IA.</h1>
        <p>
          Briefs, article production, prompt governance, review humana, assets y publishing multi-site desde una misma superficie.
        </p>

        <div class="console-auth__signals">
          <article class="console-auth__signal">
            <span>Workspace aware</span>
            <strong>SSO o API key fallback</strong>
          </article>
          <article class="console-auth__signal">
            <span>Governance</span>
            <strong>RBAC + prompt versions</strong>
          </article>
          <article class="console-auth__signal">
            <span>Workflow</span>
            <strong>Brief to publish</strong>
          </article>
        </div>
      </section>

      <section class="console-auth__panel">
        <p class="console-kicker">Login</p>
        <h2>Enter Editorial Cockpit</h2>
        <p>
          Introduce el slug del workspace. Si el tenant tiene SSO activo, continuas por OIDC.
          Si no lo tiene todavía, el panel expone fallback por API key.
        </p>

        <div class="console-banner console-banner--error" *ngIf="error">{{ error }}</div>

        <div class="console-banner" *ngIf="workspaceAccess as access" style="margin-bottom: 1rem;">
          <strong>{{ access.workspace.name }}</strong>
          <p style="margin: .35rem 0 0;">
            Workspace <code>{{ access.workspace.slug }}</code> · estado {{ access.workspace.status }} ·
            acceso actual
            <strong>{{ access.authMode === 'oidc' ? 'SSO OIDC' : 'API key fallback' }}</strong>
          </p>
          <p style="margin: .35rem 0 0;" *ngIf="access.identityProvider.configured && access.identityProvider.issuer">
            Issuer: <code>{{ access.identityProvider.issuer }}</code>
          </p>
          <p style="margin: .35rem 0 0;" *ngIf="!access.identityProvider.configured">
            Este workspace todavía no tiene identity provider configurado.
          </p>
        </div>

        <form [formGroup]="form" (ngSubmit)="submit()" class="console-form">
          <label class="console-field">
            <span>Workspace slug</span>
            <input
              type="text"
              formControlName="workspace"
              placeholder="my-editorial-workspace"
              autocomplete="organization"
              (input)="onWorkspaceInput()"
            />
          </label>

          <label class="console-field" *ngIf="workspaceAccess?.authMode === 'api_key'">
            <span>Workspace API key</span>
            <input
              type="password"
              formControlName="apiKey"
              placeholder="Pega la API key del tenant"
              autocomplete="one-time-code"
            />
          </label>

          <button type="submit" class="console-button console-button--full" [disabled]="loading || form.controls.workspace.invalid">
            {{
              loading
                ? (workspaceAccess?.authMode === 'api_key' ? 'Entering…' : 'Checking workspace…')
                : (workspaceAccess?.authMode === 'api_key' ? 'Enter with API key' : 'Continue')
            }}
          </button>
        </form>

        <button
          type="button"
          class="console-button console-button--ghost"
          *ngIf="workspaceAccess"
          (click)="resetWorkspace()"
          style="margin-top: 0.75rem; width: 100%;"
        >
          Change workspace
        </button>
      </section>
    </div>
  `,
})
export class LoginPageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly seo = inject(SeoService);
  private readonly api = inject(StudioApiService);

  readonly form = new FormGroup({
    workspace: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(2)],
    }),
    apiKey: new FormControl('', {
      nonNullable: true,
    }),
  });

  loading = false;
  error = '';
  workspaceAccess: StudioWorkspaceAccess | null = null;

  constructor() {
    const reason = String(this.route.snapshot.queryParamMap.get('reason') || '').trim();
    this.error = reason ? LOGIN_REASON_COPY[reason] || `Login error: ${reason}` : '';

    this.seo.update({
      title: 'Auctorio Studio Login',
      description: 'Acceso privado al cockpit editorial de Auctorio mediante workspace-aware SSO y fallback temporal por API key cuando el tenant aún no tiene OIDC.',
      path: '/studio/login',
      locale: 'en',
      noIndex: true,
    });
  }

  onWorkspaceInput(): void {
    const currentWorkspace = this.form.controls.workspace.value.trim();
    if (this.workspaceAccess && this.workspaceAccess.workspace.slug !== currentWorkspace) {
      this.workspaceAccess = null;
      this.form.controls.apiKey.setValue('');
      this.error = '';
    }
  }

  resetWorkspace(): void {
    this.workspaceAccess = null;
    this.form.controls.apiKey.setValue('');
    this.error = '';
  }

  async submit(): Promise<void> {
    if (this.form.controls.workspace.invalid || this.loading) {
      this.form.controls.workspace.markAsTouched();
      return;
    }

    this.loading = true;
    this.error = '';

    const workspace = this.form.controls.workspace.value.trim();

    try {
      const access =
        this.workspaceAccess && this.workspaceAccess.workspace.slug === workspace
          ? this.workspaceAccess
          : await lastValueFrom(this.api.lookupWorkspaceAccess(workspace));

      this.workspaceAccess = access;

      if (access.authMode === 'oidc') {
        const url = `/studio/api/auth/sso/start?workspace=${encodeURIComponent(workspace)}`;
        window.location.assign(url);
        return;
      }

      const apiKey = this.form.controls.apiKey.value.trim();
      if (!apiKey) {
        this.error = 'Este workspace todavía usa fallback por API key. Introduce la clave para continuar.';
        return;
      }

      await lastValueFrom(this.api.login(apiKey, workspace));
      await this.router.navigateByUrl('/studio/dashboard');
    } catch (error: any) {
      const message = String(error?.error?.message || '');
      if (message) {
        this.error = message;
      } else if (error?.status === 404) {
        this.error = 'No existe ningún workspace con ese slug.';
      } else if (error?.status === 403) {
        this.error = 'La API key no pertenece al workspace seleccionado.';
      } else if (error?.status === 401) {
        this.error = 'La API key no es válida para este workspace.';
      } else {
        this.error = 'No se pudo iniciar sesión en Auctorio Studio.';
      }
    } finally {
      this.loading = false;
    }
  }
}
