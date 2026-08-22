import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { StudioApiService } from '../services/studio-api.service';
import { AppContextService } from '../services/app-context.service';
import { ConfirmService } from '../services/confirm.service';
import { ToastService } from '../services/toast.service';
import { AppIconComponent } from '../components/ui/app-icon.component';
import { AppEmptyStateComponent } from '../components/ui/app-empty-state.component';
import type { PublishingAccount, StudioSite } from '../models/studio.models';

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
          <p class="au-page__subtitle">Manage the websites and social accounts Auctorio can publish to.</p>
        </div>
        <div class="au-page__actions">
          <button class="au-btn au-btn--primary" type="button" (click)="showForm = !showForm">
            <app-icon name="plus"></app-icon>
            {{ showForm ? 'Close' : 'Add connection' }}
          </button>
        </div>
      </header>

      <section class="au-panel au-panel--padded au-mb-3" *ngIf="showForm">
        <h2 class="au-panel__title">Add a publishing destination</h2>
        <p class="au-panel__subtitle au-mb-3">Use an environment-backed credential reference. Auctorio never sends stored secrets to this screen.</p>
        <form (ngSubmit)="create()">
          <div class="au-field-grid">
            <label class="au-field">
              <span class="au-field__label">Platform</span>
              <select class="au-select" name="platform" [(ngModel)]="draft.platform">
                <option value="website">Website</option>
                <option value="x">X</option>
                <option value="instagram">Instagram</option>
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
          <label class="au-field">
            <span class="au-field__label">Credential reference</span>
            <input class="au-input au-mono" name="credentialsRef" [(ngModel)]="draft.credentialsRef" placeholder="Environment variable or secret reference" />
            <span class="au-field__hint">Stored secrets are never displayed here. Only the reference is stored.</span>
          </label>
          <p class="au-error" *ngIf="error">{{ error }}</p>
          <div class="au-form__actions">
            <button class="au-btn au-btn--primary" type="submit" [disabled]="saving">{{ saving ? 'Saving…' : 'Save connection' }}</button>
          </div>
        </form>
      </section>

      <div class="au-banner au-banner--error" *ngIf="loadError">
        <app-icon name="warning"></app-icon>
        <span class="au-banner__text">{{ loadError }}</span>
        <button class="au-banner__action" type="button" (click)="load()">Retry</button>
      </div>

      <app-empty-state
        *ngIf="!loading && !loadError && accounts.length === 0"
        icon="connections"
        title="Connect a publishing destination"
        text="Add your website, X account or Instagram account to start publishing."
      >
        <button class="au-btn au-btn--primary au-btn--sm" type="button" (click)="showForm = true">Add connection</button>
      </app-empty-state>

      <div class="au-connection-grid" *ngIf="!loading && accounts.length > 0">
        <article class="au-connection-card" *ngFor="let account of accounts">
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
            <button class="au-btn au-btn--secondary au-btn--sm" type="button" (click)="verify(account)" [disabled]="busyId === account.id">
              <app-icon name="circle-check"></app-icon>
              Test connection
            </button>
            <button class="au-btn au-btn--ghost au-btn--sm" type="button" (click)="toggle(account)" [disabled]="busyId === account.id">
              {{ account.enabled ? 'Disable' : 'Enable' }}
            </button>
            <button class="au-btn au-btn--danger-ghost au-btn--sm" type="button" (click)="remove(account)" [disabled]="busyId === account.id">
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

  accounts: PublishingAccount[] = [];
  sites: StudioSite[] = [];
  loading = true;
  loadError = '';
  error = '';
  accountError = '';
  showForm = false;
  saving = false;
  busyId = '';
  draft = { platform: 'website' as 'website' | 'x' | 'instagram', displayName: '', externalAccountId: '', credentialsRef: '', siteId: '' };

  ngOnInit(): void {
    this.sites = this.appContext.sites();
    this.load();
  }

  load(): void {
    this.loading = true;
    this.loadError = '';
    this.api.listPublishingAccounts().subscribe({
      next: (response) => { this.accounts = response.items; this.loading = false; },
      error: () => { this.loading = false; this.loadError = 'Connections could not be loaded. Try again.'; },
    });
  }

  create(): void {
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
        this.accounts = [account, ...this.accounts];
        this.showForm = false;
        this.saving = false;
        this.draft.displayName = '';
        this.toast.success('Connection added.');
      },
      error: (err) => { this.saving = false; this.error = err?.error?.message || 'Connection could not be saved.'; },
    });
  }

  verify(account: PublishingAccount): void {
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
        this.accounts = this.accounts.map((item) => (item.id === updated.id ? updated : item));
        this.busyId = '';
        this.toast.success(updated.enabled ? 'Connection enabled.' : 'Connection disabled.');
      },
      error: () => { this.busyId = ''; this.loadError = 'Connection state could not be updated.'; },
    });
  }

  remove(account: PublishingAccount): void {
    void this.confirmRemove(account);
  }

  private async confirmRemove(account: PublishingAccount): Promise<void> {
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
        this.accounts = this.accounts.filter((item) => item.id !== account.id);
        this.busyId = '';
        this.toast.success('Connection removed.');
      },
      error: () => { this.busyId = ''; this.loadError = 'Connection could not be removed.'; },
    });
  }

  platformLabel(platform: PublishingAccount['platform']): string { return platform === 'x' ? 'X' : platform === 'instagram' ? 'Instagram' : 'Website'; }
  platformMark(platform: PublishingAccount['platform']): string { return platform === 'x' ? 'X' : platform === 'instagram' ? 'IG' : 'WEB'; }
  statusLabel(account: PublishingAccount): string { return !account.enabled ? 'Disabled' : account.status === 'active' ? 'Connected' : account.status === 'error' ? 'Action required' : account.status === 'pending' ? 'Pending' : 'Unavailable'; }
}
