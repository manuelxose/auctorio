import { Component, inject, input, signal } from '@angular/core';
import { AppIconComponent } from './ui/app-icon.component';
import { StudioApiService } from '../services/studio-api.service';

/**
 * Shown when Instagram or X cannot be authorized yet: says exactly what a server admin
 * must set (no secrets are entered here) and which callback URL the provider needs.
 */
@Component({
  selector: 'app-social-setup-guide',
  standalone: true,
  imports: [AppIconComponent],
  template: `
    <div class="au-setup-guide au-glass-card">
      <div class="au-setup-guide__head">
        <app-icon name="lock"></app-icon>
        <div>
          <h3 class="au-setup-guide__title">{{ platformLabel() }} needs a publishing provider first</h3>
          <p class="au-muted">A server admin sets this once in the API environment. After a restart, this step becomes a single sign-in.</p>
        </div>
      </div>

      <ol class="au-setup-guide__options">
        <li>
          <strong>Managed provider (fastest)</strong>
          <span class="au-muted">One key covers Instagram and X</span>
          <pre class="au-setup-guide__code">SOCIAL_PROVIDER=ayrshare
AYRSHARE_API_KEY=&lt;key from your Ayrshare dashboard&gt;</pre>
        </li>
        <li>
          <strong>Your own developer app</strong>
          <span class="au-muted">{{ platform() === 'x' ? 'An X developer app with OAuth 2.0 enabled' : 'A Meta app with Instagram Graph API; the Instagram account must be Business or Creator and linked to a Facebook Page' }}</span>
          <pre class="au-setup-guide__code">SOCIAL_PROVIDER=direct
{{ platform() === 'x' ? 'X_CLIENT_ID=…\nX_CLIENT_SECRET=…' : 'META_APP_ID=…\nMETA_APP_SECRET=…' }}</pre>
          @if (callbackUrl()) {
            <div class="au-setup-guide__callback">
              <span class="au-muted">Redirect URL to register in the app</span>
              <code>{{ callbackUrl() }}</code>
              <button class="au-btn au-btn--sm" type="button" (click)="copy()">
                <app-icon [name]="copied() ? 'check' : 'copy'"></app-icon>
                {{ copied() ? 'Copied' : 'Copy' }}
              </button>
            </div>
          }
        </li>
      </ol>
      <p class="au-muted au-setup-guide__foot">Status right now: {{ status() }}</p>
    </div>
  `,
  styles: [
    `
      .au-setup-guide { display: flex; flex-direction: column; gap: var(--au-s4); padding: var(--au-s5); margin: var(--au-s3) 0; }
      .au-setup-guide__head { display: flex; gap: var(--au-s3); align-items: flex-start; }
      .au-setup-guide__head > app-icon { width: 20px; height: 20px; margin-top: 2px; color: var(--au-warning); flex: 0 0 20px; }
      .au-setup-guide__title { font-size: var(--au-fs-section); font-weight: 600; margin-bottom: 2px; }
      .au-setup-guide__options { margin: 0; padding-left: 20px; display: flex; flex-direction: column; gap: var(--au-s4); }
      .au-setup-guide__options li { display: flex; flex-direction: column; gap: var(--au-s1); font-size: var(--au-fs-body-sm); }
      .au-setup-guide__code { margin: var(--au-s1) 0 0; padding: var(--au-s3); border-radius: 10px; background: var(--au-surface-2); font: 12.5px/1.6 var(--au-mono); white-space: pre-wrap; overflow-x: auto; }
      .au-setup-guide__callback { display: flex; flex-wrap: wrap; align-items: center; gap: var(--au-s2); margin-top: var(--au-s1); }
      .au-setup-guide__callback code { padding: 2px 8px; border-radius: 6px; background: var(--au-surface-2); font: 12px var(--au-mono); overflow-wrap: anywhere; }
      .au-setup-guide__foot { font-size: var(--au-fs-caption); }
    `,
  ],
})
export class SocialSetupGuideComponent {
  private readonly api = inject(StudioApiService);
  readonly platform = input<'instagram' | 'x'>('instagram');
  readonly callbackUrl = signal('');
  readonly status = signal('checking…');
  readonly copied = signal(false);

  constructor() {
    this.api.listSocialConnections().subscribe({
      next: (response) => {
        this.callbackUrl.set(response.callbackUrl ?? '');
        this.status.set(response.provider?.configured ? `${response.provider.provider} is configured` : 'no provider configured on this server');
      },
      error: () => this.status.set('could not be read'),
    });
  }

  platformLabel(): string {
    return this.platform() === 'x' ? 'X' : 'Instagram';
  }

  copy(): void {
    void navigator.clipboard?.writeText(this.callbackUrl()).then(() => {
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 1500);
    });
  }
}
