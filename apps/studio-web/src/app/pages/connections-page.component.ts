import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { StudioApiService } from '../services/studio-api.service';
import { AppContextService } from '../services/app-context.service';
import type { PublishingAccount, StudioSite } from '../models/studio.models';

@Component({
  selector: 'app-connections-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <section class="au-page">
      <header class="au-page__header">
        <div>
          <p class="au-eyebrow">Publishing control</p>
          <h1 class="au-page__title">Connections</h1>
          <p class="au-page__subtitle">Manage the websites and social accounts Auctorio can publish to.</p>
        </div>
        <button class="au-button au-button--primary" type="button" (click)="showForm = !showForm">
          {{ showForm ? 'Close' : 'Add connection' }}
        </button>
      </header>

      <section class="au-surface au-surface--padded" *ngIf="showForm">
        <h2 class="au-surface__title">Add a publishing destination</h2>
        <p class="au-page__subtitle">Use an environment-backed credential reference. Auctorio never sends stored secrets to this screen.</p>
        <form class="au-form au-connection-form" (ngSubmit)="create()">
          <div class="au-field-grid">
            <label class="au-field">
              <span class="au-field__label">Platform</span>
              <select class="au-input" name="platform" [(ngModel)]="draft.platform">
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
              <select class="au-input" name="siteId" [(ngModel)]="draft.siteId">
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
            <input class="au-input" name="credentialsRef" [(ngModel)]="draft.credentialsRef" placeholder="Environment variable or secret reference" />
          </label>
          <p class="au-error" *ngIf="error">{{ error }}</p>
          <div class="au-form__actions">
            <button class="au-button au-button--primary" type="submit" [disabled]="saving">{{ saving ? 'Saving…' : 'Save connection' }}</button>
          </div>
        </form>
      </section>

      <div class="au-banner au-banner--error" *ngIf="loadError">{{ loadError }}</div>
      <div class="au-empty" *ngIf="!loading && !loadError && accounts.length === 0">
        <strong>No publishing destinations yet.</strong>
        <span>Connect your website, X account or Instagram account to start publishing.</span>
      </div>
      <div class="au-connection-grid" *ngIf="!loading && accounts.length > 0">
        <article class="au-connection-card" *ngFor="let account of accounts">
          <div class="au-connection-card__head">
            <span class="au-platform-icon" aria-hidden="true">{{ platformMark(account.platform) }}</span>
            <div>
              <h2>{{ account.displayName }}</h2>
              <p>{{ platformLabel(account.platform) }} · {{ account.externalAccountId || account.site?.name || 'Workspace default' }}</p>
            </div>
            <span class="au-tag" [class.au-tag--success]="account.status === 'active' && account.enabled" [class.au-tag--danger]="account.status === 'error'" [class.au-tag--warning]="account.status === 'pending'">
              {{ statusLabel(account) }}
            </span>
          </div>
          <dl class="au-connection-card__details">
            <dt>Site</dt><dd>{{ account.site?.name || 'Workspace default' }}</dd>
            <dt>Credentials</dt><dd>{{ account.hasCredentials ? 'Configured securely' : 'Not configured' }}</dd>
            <dt>Last checked</dt><dd>{{ account.lastVerifiedAt ? (account.lastVerifiedAt | date:'medium') : 'Not checked yet' }}</dd>
          </dl>
          <div class="au-form__actions">
            <button class="au-button au-button--secondary au-button--sm" type="button" (click)="verify(account)" [disabled]="busyId === account.id">Test connection</button>
            <button class="au-button au-button--ghost au-button--sm" type="button" (click)="toggle(account)" [disabled]="busyId === account.id">{{ account.enabled ? 'Disable' : 'Enable' }}</button>
            <button class="au-button au-button--ghost au-button--sm au-button--danger" type="button" (click)="remove(account)" [disabled]="busyId === account.id">Remove</button>
          </div>
          <p class="au-error" *ngIf="accountError === account.id">The connection check failed. Review its credentials and try again.</p>
        </article>
      </div>
    </section>
  `,
})
export class ConnectionsPageComponent implements OnInit {
  private readonly api = inject(StudioApiService);
  private readonly appContext = inject(AppContextService);

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
      next: (account) => { this.accounts = [account, ...this.accounts]; this.showForm = false; this.saving = false; this.draft.displayName = ''; },
      error: (err) => { this.saving = false; this.error = err?.error?.message || 'Connection could not be saved.'; },
    });
  }

  verify(account: PublishingAccount): void {
    this.busyId = account.id;
    this.accountError = '';
    this.api.verifyPublishingAccount(account.id).subscribe({
      next: (result) => { this.busyId = ''; if (result.ok) this.load(); else this.accountError = account.id; },
      error: () => { this.busyId = ''; this.accountError = account.id; this.load(); },
    });
  }

  toggle(account: PublishingAccount): void {
    this.busyId = account.id;
    this.api.updatePublishingAccount(account.id, { enabled: !account.enabled, status: account.enabled ? 'disabled' : 'pending' }).subscribe({
      next: (updated) => { this.accounts = this.accounts.map((item) => item.id === updated.id ? updated : item); this.busyId = ''; },
      error: () => { this.busyId = ''; this.loadError = 'Connection state could not be updated.'; },
    });
  }

  remove(account: PublishingAccount): void {
    if (!window.confirm(`Remove ${account.displayName}? Existing publication history will remain.`)) return;
    this.busyId = account.id;
    this.api.deletePublishingAccount(account.id).subscribe({
      next: () => { this.accounts = this.accounts.filter((item) => item.id !== account.id); this.busyId = ''; },
      error: () => { this.busyId = ''; this.loadError = 'Connection could not be removed.'; },
    });
  }

  platformLabel(platform: PublishingAccount['platform']): string { return platform === 'x' ? 'X' : platform === 'instagram' ? 'Instagram' : 'Website'; }
  platformMark(platform: PublishingAccount['platform']): string { return platform === 'x' ? 'X' : platform === 'instagram' ? 'IG' : 'WEB'; }
  statusLabel(account: PublishingAccount): string { return !account.enabled ? 'Disabled' : account.status === 'active' ? 'Connected' : account.status === 'error' ? 'Action required' : account.status === 'pending' ? 'Pending' : 'Unavailable'; }
}
