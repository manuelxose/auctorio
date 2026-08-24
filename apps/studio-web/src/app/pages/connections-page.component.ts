import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Component, OnInit, PLATFORM_ID, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { StudioApiService } from '../services/studio-api.service';
import { AppContextService } from '../services/app-context.service';
import { ConfirmService } from '../services/confirm.service';
import { ToastService } from '../services/toast.service';
import { AppIconComponent } from '../components/ui/app-icon.component';
import { AppEmptyStateComponent } from '../components/ui/app-empty-state.component';
import type { PublishingAccount, SocialConnection, SocialSetupInfo, StudioSite } from '../models/studio.models';

@Component({
  selector: 'app-connections-page',
  standalone: true,
  imports: [CommonModule, FormsModule, AppIconComponent, AppEmptyStateComponent],
  template: `
    <section class="au-page">
      <header class="au-page__header">
        <div>
          <p class="au-page__eyebrow">Publishing destinations</p>
          <h1 class="au-page__title">Connections</h1>
          <p class="au-page__subtitle">Connect the websites and social accounts Auctorio can publish to.</p>
        </div>
      </header>

      <div class="au-banner au-banner--error" *ngIf="loadError">
        <app-icon name="warning"></app-icon>
        <span class="au-banner__text">{{ loadError }}</span>
        <button class="au-banner__action" type="button" (click)="load()">Retry</button>
      </div>

      <div class="au-banner" *ngIf="setup && !setup.provider.configured">
        <app-icon name="info"></app-icon>
        <span class="au-banner__text">
          One-click social connections need a provider configured server-side (Ayrshare managed API or your own X/Meta developer apps).
          Until then, use the advanced credential references below.
        </span>
      </div>

      <h2 class="au-section-title">Social accounts</h2>
      <div class="au-connection-grid" *ngIf="!loading">
        <article class="au-connection-card" *ngFor="let platform of socialPlatforms">
          <div class="au-connection-card__head">
            <span class="au-platform-icon" aria-hidden="true">{{ platformMark(platform) }}</span>
            <div class="au-flex-1">
              <h2>{{ platformLabel(platform) }}</h2>
              <p *ngIf="connection(platform)">
                {{ connection(platform)!.username ? '@' + connection(platform)!.username : connection(platform)!.displayName }}
              </p>
              <p *ngIf="!connection(platform)">Not connected yet</p>
            </div>
            <span class="au-badge" [class]="stateBadgeClass(platform)">
              {{ stateLabel(platform) }}
            </span>
          </div>

          <dl class="au-connection-card__details" *ngIf="connection(platform)">
            <dt>Status</dt><dd>{{ connectionDetail(platform) }}</dd>
            <dt>Last checked</dt><dd>{{ connection(platform)!.lastVerifiedAt ? (connection(platform)!.lastVerifiedAt | date: 'medium') : 'Not checked yet' }}</dd>
          </dl>

          <p class="au-error au-mb-2" *ngIf="connection(platform) && connection(platform)!.lastError">{{ humanError(connection(platform)!.lastError!) }}</p>

          <div class="au-inline">
            <button class="au-btn au-btn--primary au-btn--sm" type="button" *ngIf="!connection(platform)" (click)="connect(platform)" [disabled]="busy === platform">
              <app-icon name="plug"></app-icon>
              {{ busy === platform ? 'Preparing…' : 'Connect ' + platformLabel(platform) }}
            </button>
            <ng-container *ngIf="connection(platform)">
              <button class="au-btn au-btn--secondary au-btn--sm" type="button" (click)="verify(connection(platform)!)" [disabled]="busy === platform">
                <app-icon name="circle-check"></app-icon>
                Test connection
              </button>
              <button class="au-btn au-btn--secondary au-btn--sm" type="button" (click)="reconnect(connection(platform)!)" [disabled]="busy === platform">
                <app-icon name="refresh"></app-icon>
                Reconnect
              </button>
              <button class="au-btn au-btn--danger-ghost au-btn--sm" type="button" (click)="disconnect(connection(platform)!)" [disabled]="busy === platform">
                <app-icon name="trash"></app-icon>
                Disconnect
              </button>
            </ng-container>
          </div>
          <p class="au-error au-mb-0" *ngIf="actionError === platform">{{ actionErrorText }}</p>
        </article>
      </div>

      <h2 class="au-section-title">Websites &amp; advanced</h2>

      <div class="au-inline" *ngIf="!showForm">
        <button class="au-btn au-btn--secondary au-btn--sm" type="button" (click)="showForm = true">
          <app-icon name="plus"></app-icon>
          Add website or advanced connection
        </button>
      </div>

      <section class="au-panel au-panel--padded au-mb-3" *ngIf="showForm">
        <h2 class="au-panel__title">Add a publishing destination</h2>
        <p class="au-panel__subtitle au-mb-3">Websites and legacy credential references. For social accounts, use the cards above.</p>
        <form (ngSubmit)="createWebsite()">
          <div class="au-field-grid">
            <label class="au-field">
              <span class="au-field__label">Platform</span>
              <select class="au-select" name="platform" [(ngModel)]="draft.platform">
                <option value="website">Website</option>
                <option value="x">X (advanced)</option>
                <option value="instagram">Instagram (advanced)</option>
              </select>
            </label>
            <label class="au-field">
              <span class="au-field__label">Display name</span>
              <input class="au-input" name="displayName" [(ngModel)]="draft.displayName" required placeholder="Main website or @brand" />
            </label>
            <label class="au-field">
              <span class="au-field__label">Site</span>
              <select class="au-select" name="siteId" [(ngModel)]="draft.siteId">
                <option value="">Workspace default</option>
                <option *ngFor="let site of sites" [value]="site.id">{{ site.name }}</option>
              </select>
            </label>
            <label class="au-field">
              <span class="au-field__label">Remote account or domain</span>
              <input class="au-input" name="externalAccountId" [(ngModel)]="draft.externalAccountId" placeholder="Optional" />
            </label>
          </div>
          <label class="au-field" *ngIf="draft.platform !== 'website'">
            <span class="au-field__label">Credential reference</span>
            <input class="au-input au-mono" name="credentialsRef" [(ngModel)]="draft.credentialsRef" placeholder="Environment variable or secret reference" />
            <span class="au-field__hint">Stored secrets are never displayed here. Only the reference is stored.</span>
          </label>
          <p class="au-error" *ngIf="error">{{ error }}</p>
          <div class="au-form__actions">
            <button class="au-btn au-btn--primary" type="submit" [disabled]="saving">{{ saving ? 'Saving…' : 'Save connection' }}</button>
            <button class="au-btn au-btn--ghost" type="button" (click)="showForm = false">Cancel</button>
          </div>
        </form>
      </section>

      <app-empty-state
        *ngIf="!loading && !loadError && websiteAccounts.length === 0"
        icon="connections"
        title="Connect a publishing destination"
        text="Add your website, X account or Instagram account to start publishing."
      ></app-empty-state>

      <div class="au-connection-grid" *ngIf="websiteAccounts.length > 0">
        <article class="au-connection-card" *ngFor="let account of websiteAccounts">
          <div class="au-connection-card__head">
            <span class="au-platform-icon" aria-hidden="true">{{ platformMark(account.platform) }}</span>
            <div class="au-flex-1">
              <h2>{{ account.displayName }}</h2>
              <p>{{ platformLabel(account.platform) }} · {{ account.externalAccountId || account.site?.name || 'Workspace default' }}</p>
            </div>
            <span
              class="au-badge"
              [class.au-badge--success]="account.status === 'active' && account.enabled"
              [class.au-badge--danger]="account.status === 'error'"
              [class.au-badge--warning]="account.status === 'pending'"
              [class.au-badge--neutral]="!account.enabled"
            >
              {{ statusLabel(account) }}
            </span>
          </div>
          <dl class="au-connection-card__details">
            <dt>Site</dt><dd>{{ account.site?.name || 'Workspace default' }}</dd>
            <dt>Credentials</dt><dd>{{ account.hasCredentials ? 'Configured securely' : 'Not configured' }}</dd>
            <dt>Last checked</dt><dd>{{ account.lastVerifiedAt ? (account.lastVerifiedAt | date: 'medium') : 'Not checked yet' }}</dd>
          </dl>
          <div class="au-inline">
            <button class="au-btn au-btn--secondary au-btn--sm" type="button" (click)="verifyLegacy(account)" [disabled]="busyId === account.id">
              <app-icon name="circle-check"></app-icon>
              Test connection
            </button>
            <button class="au-btn au-btn--ghost au-btn--sm" type="button" (click)="toggle(account)" [disabled]="busyId === account.id">
              {{ account.enabled ? 'Disable' : 'Enable' }}
            </button>
            <button class="au-btn au-btn--danger-ghost au-btn--sm" type="button" (click)="removeLegacy(account)" [disabled]="busyId === account.id">
              <app-icon name="trash"></app-icon>
              Remove
            </button>
          </div>
          <p class="au-error au-mb-0" *ngIf="accountError === account.id">The connection check failed. Review its credentials and try again.</p>
        </article>
      </div>
    </section>
  `,
})
export class ConnectionsPageComponent implements OnInit {
  private readonly api = inject(StudioApiService);
  private readonly appContext = inject(AppContextService);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);
  private readonly route = inject(ActivatedRoute);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);

  socialPlatforms: Array<'x' | 'instagram'> = ['instagram', 'x'];
  socialConnections: SocialConnection[] = [];
  websiteAccounts: PublishingAccount[] = [];
  sites: StudioSite[] = [];
  setup: SocialSetupInfo | null = null;
  loading = true;
  loadError = '';
  error = '';
  accountError = '';
  actionError = '';
  actionErrorText = '';
  showForm = false;
  saving = false;
  busy = '';
  busyId = '';
  draft = { platform: 'website' as 'website' | 'x' | 'instagram', displayName: '', externalAccountId: '', credentialsRef: '', siteId: '' };

  ngOnInit(): void {
    this.sites = this.appContext.sites();
    this.load();
    this.readCallbackStatus();
  }

  private readCallbackStatus(): void {
    const status = this.route.snapshot.queryParamMap.get('social');
    const reason = this.route.snapshot.queryParamMap.get('reason') || '';
    if (status === 'success') {
      this.toast.success('Social account connected.');
    } else if (status === 'error') {
      this.toast.error(reason ? `Connection failed: ${reason}` : 'Connection failed. Please try again.');
    } else if (status === 'cancelled') {
      this.toast.info('Connection cancelled.');
    }
    if (this.isBrowser && status) {
      const url = new URL(window.location.href);
      url.searchParams.delete('social');
      url.searchParams.delete('reason');
      window.history.replaceState({}, '', url.pathname + url.search);
    }
  }

  load(): void {
    this.loading = true;
    this.loadError = '';
    this.api.listSocialConnections().subscribe({
      next: (response) => {
        this.socialConnections = response.items.filter((item) => item.platform === 'x' || item.platform === 'instagram');
        this.loading = false;
      },
      error: () => { this.loading = false; this.loadError = 'Connections could not be loaded. Try again.'; },
    });
    this.api.listPublishingAccounts().subscribe({
      next: (response) => {
        this.websiteAccounts = response.items.filter((item) => !this.socialConnections.some((social) => social.id === item.id));
      },
      error: () => { /* the connections list already surfaced an error */ },
    });
    this.api.getSocialSetup().subscribe({
      next: (setup) => { this.setup = setup; },
      error: () => { this.setup = null; },
    });
  }

  connection(platform: 'x' | 'instagram'): SocialConnection | undefined {
    return this.socialConnections.find((item) => item.platform === platform);
  }

  stateLabel(platform: 'x' | 'instagram'): string {
    const connection = this.connection(platform);
    if (!connection) {
      return 'Not connected';
    }
    switch (connection.connectionState) {
      case 'connected': return 'Connected';
      case 'connecting': return 'Connecting…';
      case 'expired': return 'Reconnect required';
      case 'permissions_required': return 'Permissions needed';
      case 'provider_error': return 'Action required';
      case 'disabled': return 'Disabled';
      default: return 'Not connected';
    }
  }

  stateBadgeClass(platform: 'x' | 'instagram'): string {
    const connection = this.connection(platform);
    if (!connection || connection.connectionState === 'not_connected') {
      return 'au-badge--neutral';
    }
    switch (connection.connectionState) {
      case 'connected': return 'au-badge--success';
      case 'connecting': return 'au-badge--warning';
      case 'disabled': return 'au-badge--neutral';
      default: return 'au-badge--danger';
    }
  }

  connectionDetail(platform: 'x' | 'instagram'): string {
    const connection = this.connection(platform);
    if (!connection) {
      return 'Not connected';
    }
    if (platform === 'instagram' && connection.capabilities['canPostStories'] === false) {
      return 'Connected (feed posts only)';
    }
    return 'Connection healthy';
  }

  humanError(error: string): string {
    if (error === 'credentials_not_resolved') return 'The stored credentials could not be resolved. Reconnect to fix this.';
    if (error === 'connection_credentials_missing') return 'The stored credentials are missing. Reconnect to fix this.';
    return error;
  }

  connect(platform: 'x' | 'instagram'): void {
    this.busy = platform;
    this.actionError = '';
    this.api.startSocialConnectionSession(platform).subscribe({
      next: (session) => {
        this.busy = '';
        if (this.isBrowser) {
          window.open(session.url, '_blank', 'noopener');
        } else {
          this.toast.info(`Open ${session.url} to authorize ${platform}.`);
        }
        this.toast.info(`Authorize ${platform === 'x' ? 'X' : 'Instagram'} in the opened window. This page updates automatically when done.`);
        this.watchForCompletion();
      },
      error: (err) => {
        this.busy = '';
        this.actionError = platform;
        this.actionErrorText = err?.error?.error?.message || err?.error?.message || 'The connection could not be started.';
      },
    });
  }

  private watchForCompletion(): void {
    // The provider callback redirects to this page with ?social=… and the list
    // refreshes here automatically.
    let attempts = 0;
    const interval = setInterval(() => {
      attempts += 1;
      this.api.listSocialConnections().subscribe({
        next: (response) => {
          this.socialConnections = response.items.filter((item) => item.platform === 'x' || item.platform === 'instagram');
          if (attempts >= 12) {
            clearInterval(interval);
          }
        },
        error: () => { if (attempts >= 12) clearInterval(interval); },
      });
    }, 5000);
  }

  verify(connection: SocialConnection): void {
    this.busy = connection.platform;
    this.actionError = '';
    this.api.verifySocialConnection(connection.id).subscribe({
      next: (result) => {
        this.busy = '';
        if (result.ok) {
          this.toast.success('Connection verified.');
        } else {
          this.toast.info(result.message || 'Connection needs attention.');
        }
        this.load();
      },
      error: () => { this.busy = ''; this.toast.error('Connection check failed.'); },
    });
  }

  reconnect(connection: SocialConnection): void {
    this.busy = connection.platform;
    this.api.reconnectSocialConnection(connection.id).subscribe({
      next: (session) => {
        this.busy = '';
        if (this.isBrowser) {
          window.open(session.url, '_blank', 'noopener');
        }
        this.toast.info('Authorize the account again in the opened window.');
        this.watchForCompletion();
      },
      error: () => { this.busy = ''; this.toast.error('Reconnect could not be started.'); },
    });
  }

  async disconnect(connection: SocialConnection): Promise<void> {
    const confirmed = await this.confirm.confirm({
      title: `Disconnect ${connection.username ? '@' + connection.username : connection.displayName}?`,
      message: 'Auctorio will stop publishing to this account. Existing publications stay where they are.',
      confirmLabel: 'Disconnect',
      danger: true,
    });
    if (!confirmed) return;
    this.busy = connection.platform;
    this.api.disconnectSocialConnection(connection.id).subscribe({
      next: () => {
        this.busy = '';
        this.socialConnections = this.socialConnections.filter((item) => item.id !== connection.id);
        this.toast.success('Connection removed.');
      },
      error: () => { this.busy = ''; this.toast.error('Connection could not be removed.'); },
    });
  }

  createWebsite(): void {
    if (!this.draft.displayName.trim()) return;
    this.saving = true;
    this.error = '';
    this.api.createPublishingAccount({
      platform: this.draft.platform,
      displayName: this.draft.displayName.trim(),
      externalAccountId: this.draft.externalAccountId.trim() || undefined,
      credentialsRef: this.draft.credentialsRef.trim() || undefined,
      siteId: this.draft.siteId || undefined,
    }).subscribe({
      next: (account) => {
        this.websiteAccounts = [account, ...this.websiteAccounts];
        this.showForm = false;
        this.saving = false;
        this.draft.displayName = '';
        this.draft.credentialsRef = '';
        this.toast.success('Connection added.');
      },
      error: (err) => { this.saving = false; this.error = err?.error?.message || 'Connection could not be saved.'; },
    });
  }

  verifyLegacy(account: PublishingAccount): void {
    this.busyId = account.id;
    this.accountError = '';
    this.api.verifyPublishingAccount(account.id).subscribe({
      next: (result) => {
        this.busyId = '';
        if (result.ok) {
          this.toast.success('Connection verified.');
          this.load();
        } else {
          this.accountError = account.id;
        }
      },
      error: () => { this.busyId = ''; this.accountError = account.id; this.load(); },
    });
  }

  toggle(account: PublishingAccount): void {
    this.busyId = account.id;
    this.api.updatePublishingAccount(account.id, { enabled: !account.enabled, status: account.enabled ? 'disabled' : 'pending' }).subscribe({
      next: (updated) => {
        this.websiteAccounts = this.websiteAccounts.map((item) => (item.id === updated.id ? updated : item));
        this.busyId = '';
        this.toast.success(updated.enabled ? 'Connection enabled.' : 'Connection disabled.');
      },
      error: () => { this.busyId = ''; this.loadError = 'Connection state could not be updated.'; },
    });
  }

  async removeLegacy(account: PublishingAccount): Promise<void> {
    const confirmed = await this.confirm.confirm({
      title: `Remove ${account.displayName}?`,
      message: 'Existing publication history will remain. Publishing to this destination stops immediately.',
      confirmLabel: 'Remove connection',
      danger: true,
    });
    if (!confirmed) return;
    this.busyId = account.id;
    this.api.deletePublishingAccount(account.id).subscribe({
      next: () => {
        this.websiteAccounts = this.websiteAccounts.filter((item) => item.id !== account.id);
        this.busyId = '';
        this.toast.success('Connection removed.');
      },
      error: () => { this.busyId = ''; this.loadError = 'Connection could not be removed.'; },
    });
  }

  platformLabel(platform: string): string { return platform === 'x' ? 'X' : platform === 'instagram' ? 'Instagram' : 'Website'; }
  platformMark(platform: string): string { return platform === 'x' ? 'X' : platform === 'instagram' ? 'IG' : 'WEB'; }
  statusLabel(account: PublishingAccount): string { return !account.enabled ? 'Disabled' : account.status === 'active' ? 'Connected' : account.status === 'error' ? 'Action required' : account.status === 'pending' ? 'Pending' : 'Unavailable'; }
}
