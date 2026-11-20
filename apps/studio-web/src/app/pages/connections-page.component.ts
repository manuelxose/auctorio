import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Component, DestroyRef, OnInit, PLATFORM_ID, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { catchError, filter, forkJoin, of, switchMap, take, timeout, timer, type Observable } from 'rxjs';
import { StudioApiService } from '../services/studio-api.service';
import { AppContextService } from '../services/app-context.service';
import { ConfirmService } from '../services/confirm.service';
import { ToastService } from '../services/toast.service';
import { AppIconComponent } from '../components/ui/app-icon.component';
import { AppEmptyStateComponent } from '../components/ui/app-empty-state.component';
import { ConnectBoxComponent } from '../components/connect-box.component';
import type {
  ConnectorInstallation,
  PublishingAccount,
  SocialConnection,
  SocialSetupInfo,
} from '../models/studio.models';

type TabId = 'all' | 'websites' | 'social' | 'attention';

type ConnectionRow = {
  id: string;
  kind: 'website' | 'x' | 'instagram' | 'facebook';
  provider: string;
  displayName: string;
  state: string;
  needsAttention: boolean;
  lastError: string | null;
  verifiedAt: string | null;
  activatedAt: string | null;
  siteName: string | null;
  social?: SocialConnection;
  website?: PublishingAccount;
  installation?: ConnectorInstallation;
};

@Component({
  selector: 'app-connections-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, AppIconComponent, AppEmptyStateComponent, ConnectBoxComponent],
  template: `
    <section class="au-page">
      <header class="au-page__header au-page__header--split">
        <div>
          <p class="au-page__eyebrow">Publishing destinations</p>
          <h1 class="au-page__title">Connections</h1>
          <p class="au-page__subtitle">The websites and social accounts Auctorio publishes to, with their verification status</p>
        </div>
      </header>

      <app-connect-box *ngIf="canManage" title="Connect a site or account"></app-connect-box>
      <div class="au-banner" *ngIf="!canManage">You need integrations.manage to manage connections.</div>

      <div class="au-banner au-banner--error" *ngIf="loadError">
        <app-icon name="warning"></app-icon>
        <span class="au-banner__text">{{ loadError }}</span>
        <button class="au-banner__action" type="button" (click)="load()">Retry</button>
      </div>

      <div class="au-banner" *ngIf="setup && !setup.provider.configured">
        <app-icon name="info"></app-icon>
        <span class="au-banner__text">
          One-click social connections need a provider configured server-side (Ayrshare managed API or your own X/Meta developer apps).
          Until then, website destinations and advanced credential references remain available.
        </span>
      </div>

      <div class="au-tabs" role="tablist" aria-label="Connection types">
        <button
          class="au-tab"
          type="button"
          role="tab"
          *ngFor="let tab of tabs"
          [class.is-active]="activeTab === tab.id"
          [attr.aria-selected]="activeTab === tab.id"
          (click)="selectTab(tab.id)"
        >
          {{ tab.label }}
          <span class="au-tab__count" *ngIf="countFor(tab.id) > 0">{{ countFor(tab.id) }}</span>
        </button>
      </div>

      <div class="au-toolbar au-mb-2">
        <label class="au-search au-flex-1">
          <app-icon name="search"></app-icon>
          <input
            class="au-search__input"
            type="search"
            placeholder="Search connections…"
            [(ngModel)]="search"
            (input)="applyFilters()"
            aria-label="Search connections"
          />
        </label>
      </div>

      <div class="au-skeleton-list" *ngIf="loading" aria-label="Loading connections">
        <div class="au-skeleton" *ngFor="let _ of [1, 2, 3]" style="height: 76px"></div>
      </div>

      <app-empty-state
        *ngIf="!loading && !loadError && rows.length === 0"
        icon="connections"
        title="No destinations yet"
        text="Connect a website, X or Instagram destination to start publishing."
      >
        <a *ngIf="canManage" class="au-btn au-btn--primary" routerLink="/studio/connections/wizard">Connect destination</a>
      </app-empty-state>

      <div class="au-empty-note" *ngIf="!loading && !loadError && rows.length > 0 && filteredRows.length === 0">
        No connections match this view.
      </div>

      <div class="au-table-wrap au-table-wrap--scrollable" *ngIf="filteredRows.length > 0">
        <table class="au-table au-table--hover">
          <thead>
            <tr>
              <th scope="col">Destination</th>
              <th scope="col">Type</th>
              <th scope="col">Site</th>
              <th scope="col">Status</th>
              <th scope="col">Last checked</th>
              <th scope="col" class="au-table__actions"><span class="au-visually-hidden">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let row of filteredRows">
              <td data-label="Destination">
                <div class="au-cell-title">
                  <span class="au-platform-icon au-platform-icon--sm" aria-hidden="true">{{ mark(row.kind) }}</span>
                  <div>
                    <div class="au-cell-title__name">{{ row.displayName }}</div>
                    <div class="au-cell-title__meta">
                      {{ row.social?.username ? '@' + row.social!.username : row.website?.externalAccountId || row.installation?.provider || row.provider }}
                    </div>
                  </div>
                </div>
              </td>
              <td data-label="Type">{{ kindLabel(row.kind) }}</td>
              <td data-label="Site">{{ row.siteName || 'Workspace default' }}</td>
              <td data-label="Status">
                <span class="au-badge" [class]="badgeClass(row)">{{ stateLabel(row) }}</span>
                <div *ngIf="row.installation">Lifecycle: {{ row.installation.state }}<span *ngIf="row.installation.kind === 'website'"> · Verification: {{ row.installation.verificationStage || 'unknown' }}</span></div>
                <div *ngIf="row.installation">{{ row.installation.hasCredentials ? 'Credentials stored' : 'No credentials stored' }}</div>
                <div *ngIf="row.website">{{ row.website.hasCredentials ? 'Credentials stored' : 'No credentials stored' }}</div>
                <div *ngIf="row.lastError">{{ row.lastError }}</div>
                <div *ngIf="row.social">{{ row.social.hasCredentials ? 'Credentials stored' : 'No credentials stored' }}<span *ngIf="row.social.connectionState === 'permissions_required'"> · Permissions required</span></div>
              </td>
              <td data-label="Last checked">
                {{ row.verifiedAt ? (row.verifiedAt | date: 'medium') : 'Not checked yet' }}
              </td>
              <td class="au-table__actions">
                <button class="au-btn au-btn--ghost au-btn--sm" type="button" *ngIf="canManage && row.website" (click)="verifyLegacy(row.website)" [disabled]="busyId === row.id">
                  Test
                </button>
                <button class="au-btn au-btn--ghost au-btn--sm" type="button" *ngIf="canManage && row.social" (click)="verifySocial(row.social)" [disabled]="busyId === row.id">
                  Test
                </button>
                <button class="au-btn au-btn--ghost au-btn--sm" type="button" *ngIf="canManage && row.installation?.kind === 'website' && row.installation?.state === 'active' && row.installation?.hasCredentials" (click)="verifyWebsite(row.installation!)" [disabled]="busyId === row.id">Test website</button>
                <button class="au-btn au-btn--ghost au-btn--sm" type="button" *ngIf="canManage && row.social && row.social.connectionState !== 'connected'" (click)="reconnect(row.social)" [disabled]="busyId === row.id">Reconnect</button>
                <button class="au-btn au-btn--ghost au-btn--sm" type="button" *ngIf="canManage && row.installation && resumable(row.installation)" (click)="resume(row.installation)">Open setup</button>
                <button class="au-btn au-btn--ghost au-btn--sm" type="button" *ngIf="canManage && (row.website || row.social || (row.installation && row.installation.state !== 'disabled' && (row.installation.kind === 'website' || !isActive(row.installation))))" (click)="remove(row)" [disabled]="busyId === row.id" [attr.aria-label]="(row.installation?.state === 'active' ? 'Disconnect ' : 'Remove ') + row.displayName">
                  <app-icon name="trash"></app-icon>
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  `,
})
export class ConnectionsPageComponent implements OnInit {
  private readonly api = inject(StudioApiService);
  private readonly appContext = inject(AppContextService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);

  readonly tabs: Array<{ id: TabId; label: string }> = [
    { id: 'all', label: 'All' },
    { id: 'websites', label: 'Websites' },
    { id: 'social', label: 'Social' },
    { id: 'attention', label: 'Needs attention' },
  ];

  activeTab: TabId = 'all';
  get canManage(): boolean { return this.appContext.permissions().includes('integrations.manage'); }
  private loadVersion = 0;

  search = '';
  loading = true;
  loadError = '';
  busyId = '';
  rows: ConnectionRow[] = [];
  filteredRows: ConnectionRow[] = [];
  setup: SocialSetupInfo | null = null;
  socialConnections: SocialConnection[] = [];
  websiteAccounts: PublishingAccount[] = [];
  installations: ConnectorInstallation[] = [];

  ngOnInit(): void {
    const tab = this.route.snapshot.queryParamMap.get('tab');
    if (tab === 'websites' || tab === 'social' || tab === 'attention') {
      this.activeTab = tab;
    }
    const query = this.route.snapshot.queryParamMap.get('q');
    if (query) {
      this.search = query;
    }
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
    const version = ++this.loadVersion;
    forkJoin({
      social: this.api.listSocialConnections().pipe(catchError(() => of(null))),
      accounts: this.api.listPublishingAccounts().pipe(catchError(() => of(null))),
      installations: this.api.listConnectorInstallations().pipe(catchError(() => of(null))),
      setup: this.api.getSocialSetup().pipe(catchError(() => of(null))),
    }).subscribe(({ social, accounts, installations, setup }) => {
      if (version !== this.loadVersion) return;
      this.socialConnections = social?.items.filter((item) => ['x', 'instagram', 'facebook'].includes(item.platform)) ?? [];
      this.websiteAccounts = accounts?.items ?? [];
      this.installations = installations?.items ?? [];
      this.setup = setup;
      const failed = [!social && 'social connections', !accounts && 'publishing accounts', !installations && 'installations', !setup && 'social setup'].filter(Boolean);
      this.loadError = failed.length ? `Could not load: ${failed.join(', ')}. Other results are shown below.` : '';
      this.loading = false;
      this.rebuildRows();
    });
  }

  private rebuildRows(): void {
    const merged = new Map<string, ConnectionRow>();
    // An installation is the canonical record: hide a legacy website account of the same site.
    const covered = new Set(this.installations.filter((i) => i.kind === 'website' && (i.state === 'active' || i.state === 'disabled') && i.siteId).map((i) => i.siteId));
    for (const account of this.websiteAccounts) {
      if (account.platform === 'website' && account.site?.id && covered.has(account.site.id)) continue;
      if (this.socialConnections.some((social) => social.id === account.id)) continue;
      merged.set(`website:${account.id}`, {
        id: account.id,
        kind: account.platform,
        provider: account.provider || 'legacy',
        displayName: account.displayName,
        state: !account.enabled ? 'disabled' : account.status === 'active' ? (account.lastVerifiedAt ? 'connected' : 'not_verified') : account.status === 'error' ? 'error' : account.status,
        needsAttention: !account.enabled || account.status === 'error' || (account.status === 'active' && !account.lastVerifiedAt),
        lastError: null,
        verifiedAt: account.lastVerifiedAt,
        activatedAt: account.connectedAt ?? null,
        siteName: account.site?.name ?? null,
        website: account,
      });
    }
    for (const social of this.socialConnections) {
      merged.set(`social:${social.id}`, {
        id: social.id,
        kind: social.platform,
        provider: social.provider,
        displayName: social.displayName,
        state: social.connectionState,
        needsAttention: ['expired', 'permissions_required', 'provider_error'].includes(social.connectionState),
        lastError: social.lastError,
        verifiedAt: social.lastVerifiedAt,
        activatedAt: social.connectedAt,
        siteName: null,
        social,
      });
    }
    for (const installation of this.installations) {
      merged.set(`installation:${installation.id}`, {
      if (installation.kind !== 'website' && installation.externalAccountId && this.socialConnections.some((social) => social.id === installation.externalAccountId)) continue;
        id: installation.id,
        kind: installation.kind,
        provider: installation.provider,
        displayName: installation.displayName ?? installation.provider,
        // Active alone is not proof: it must also carry a recorded verification and no last error.
        state: this.installationState(installation),
        needsAttention: ['failed', 'expired', 'credentials_required', 'not_verified', 'error', 'stale', 'read_only', 'unconfigured', 'stored', 'authenticated'].includes(this.installationState(installation)),
        lastError: installation.lastError,
        verifiedAt: installation.verifiedAt,
        activatedAt: installation.activatedAt,
        siteName: this.appContext.sites().find((site) => site.id === installation.siteId)?.name ?? null,
        installation,
      });
    }
    this.rows = Array.from(merged.values()).sort((a, b) => {
      const score = (row: ConnectionRow): number => (row.needsAttention ? 0 : 1);
      return score(a) - score(b) || String(a.displayName).localeCompare(String(b.displayName));
    });
    this.applyFilters();
  }

  applyFilters(): void {
    const query = this.search.trim().toLowerCase();
    this.filteredRows = this.rows.filter((row) => {
      if (this.activeTab === 'websites' && row.kind !== 'website') {
        return false;
      }
      if (this.activeTab === 'social' && row.kind === 'website') {
        return false;
      }
      if (this.activeTab === 'attention' && !row.needsAttention) {
        return false;
      }
      if (query) {
        const haystack = `${row.displayName} ${row.provider} ${row.siteName ?? ''}`.toLowerCase();
        return haystack.includes(query);
      }
      return true;
    });
  }

  selectTab(tab: TabId): void {
    this.activeTab = tab;
    this.applyFilters();
    const query = this.route.snapshot.queryParams;
    void this.router.navigate([], {
      queryParams: { ...query, tab },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  countFor(tab: TabId): number {
    if (tab === 'websites') {
      return this.rows.filter((row) => row.kind === 'website').length;
    }
    if (tab === 'social') {
      return this.rows.filter((row) => row.kind !== 'website').length;
    }
    if (tab === 'attention') {
      return this.rows.filter((row) => row.needsAttention).length;
    }
    return this.rows.length;
  }

  mark(kind: string): string {
    return kind === 'x' ? 'X' : kind === 'instagram' ? 'IG' : kind === 'facebook' ? 'FB' : 'WEB';
  }

  kindLabel(kind: string): string {
    return kind === 'x' ? 'X (Twitter)' : kind === 'instagram' ? 'Instagram' : kind === 'facebook' ? 'Facebook' : 'Website';
  }

  installationState(installation: ConnectorInstallation): string {
    if (installation.state !== 'active') return installation.state;
    if (installation.lastError) return 'error';
    if (installation.kind !== 'website') return installation.verifiedAt ? 'active' : 'not_verified';
    return installation.verificationStage === 'ready' ? 'active' : installation.verificationStage || 'not_verified';
  }

  stateLabel(row: ConnectionRow): string {
    switch (row.state) {
      case 'not_verified':
        return 'Not verified';
      case 'connected':
      case 'unconfigured': return 'Not configured';
      case 'stored': return 'Credentials stored';
      case 'authenticated': return 'Authenticated';
      case 'read_only': return 'Read-only access';
      case 'stale': return 'Verification stale';
        return 'Connected';
      case 'active':
        return 'Active';
      case 'ready':
        return 'Ready to activate';
      case 'verifying':
        return 'Verifying…';
      case 'discovering':
        return 'Discovering…';
      case 'credentials_required':
        return 'Needs credentials';
      case 'failed':
        return 'Action required';
      case 'expired':
        return 'Reconnect required';
      case 'permissions_required':
        return 'Permissions needed';
      case 'provider_error':
        return 'Provider error';
      case 'disabled':
        return 'Disabled';
      case 'error':
        return 'Action required';
      case 'draft':
        return 'Draft';
      case 'cancelled':
        return 'Cancelled';
      default:
        return row.state;
    }
  }

  badgeClass(row: ConnectionRow): string {
    switch (row.state) {
      case 'connected':
      case 'active':
        return 'au-badge--success';
      case 'ready':
      case 'not_verified':
      case 'verifying':
      case 'unconfigured':
      case 'stored':
      case 'authenticated':
      case 'read_only':
      case 'stale':
      case 'discovering':
      case 'draft':
        return 'au-badge--warning';
      case 'failed':
      case 'error':
      case 'expired':
      case 'permissions_required':
      case 'provider_error':
        return 'au-badge--danger';
      default:
        return 'au-badge--neutral';
    }
  }

  resumable(installation: ConnectorInstallation): boolean {
    if (installation.state === 'active') return this.installationState(installation) !== 'active';
    if (installation.kind !== 'website' && installation.state === 'active') return false;
    return ['draft', 'credentials_required', 'failed', 'ready', 'cancelled', 'disabled', 'expired'].includes(installation.state);
  }

  isActive(installation: ConnectorInstallation): boolean {
    return installation.state === 'active' || installation.state === 'disabled';
  }

  resume(installation: ConnectorInstallation): void {
    if (!this.canManage) return;
    if (installation.kind === 'website' && installation.state === 'disabled') {
      const target = this.appContext.sites().find((site) => site.id === installation.siteId)?.baseUrl;
      void this.router.navigate(['/studio/connections/wizard'], { queryParams: target ? { target } : {} });
      return;
    }
    void this.router.navigate(['/studio/connections/wizard', installation.id]);
  }

  verifySocial(connection: SocialConnection): void {
  reconnect(connection: SocialConnection): void {
    if (!this.canManage || !this.isBrowser) return;
    this.busyId = connection.id;
    this.api.reconnectSocialConnection(connection.id).subscribe({
      next: (session) => { this.busyId = ''; window.location.assign(session.url); },
      error: (error) => { this.busyId = ''; this.toast.error(error?.error?.message || 'Could not reconnect.'); },
    });
  }

    this.busyId = connection.id;
    if (!this.canManage) return;
    this.api.verifySocialConnection(connection.id).subscribe({
      next: (result) => {
        this.busyId = '';
        if (result.ok) {
          this.toast.success('Connection verified.');
        } else {
          this.toast.info(result.message || 'Connection needs attention.');
        }
        this.load();
      },
      error: () => {
        this.busyId = '';
        this.toast.error('Connection check failed.');
      },
    });
  }

  verifyLegacy(account: PublishingAccount): void {
    this.busyId = account.id;
    if (!this.canManage) return;
    this.api.verifyPublishingAccount(account.id).subscribe({
      next: (result) => {
        this.busyId = '';
        if (result.ok) {
          this.toast.success('Connection verified.');
          this.load();
        } else {
          this.toast.error('Connection needs attention.');
          this.load();
        }
      },
      error: () => {
        this.busyId = '';
        this.load();
      },
    });
  }

  async remove(row: ConnectionRow): Promise<void> {
    if (!this.canManage) return;
    const activeWebsite = row.installation?.kind === 'website' && row.installation.state === 'active';
    const action = activeWebsite ? 'Disconnect' : 'Remove';
    const siteId = this.appContext.activeSite()?.id;
    const confirmed = await this.confirm.confirm({
      title: `${action} ${row.displayName}?`,
      message: activeWebsite ? 'New deliveries to this website will be blocked. Publication history stays available.'
        : row.website ? 'Remove this account record? Other destination credentials may still be configured.'
        : 'Publication history stays available.',
      confirmLabel: action,
      danger: true,
    });
    if (!confirmed || !this.canManage || siteId !== this.appContext.activeSite()?.id) {
      return;
    }
    this.busyId = row.id;
    if (row.website) {
      this.api.deletePublishingAccount(row.website.id).subscribe({
        next: () => {
          this.busyId = '';
          this.toast.success('Connection removed.');
          this.load();
        },
        error: () => {
          this.busyId = '';
          this.loadError = 'Connection could not be removed.';
        },
      });
    } else if (row.social) {
      this.api.disconnectSocialConnection(row.social.id).subscribe({
        next: () => {
          this.busyId = '';
          this.toast.success('Connection removed.');
          this.load();
        },
        error: () => {
          this.busyId = '';
          this.toast.error('Connection could not be removed.');
        },
      });
    } else if (row.installation) {
      const request: Observable<unknown> = activeWebsite ? this.api.disconnectConnectorInstallation(row.installation.id) : this.api.deleteConnectorInstallation(row.installation.id);
      request.subscribe({
        next: () => {
          this.busyId = '';
          this.toast.success(activeWebsite ? 'Connection disconnected.' : 'Draft removed.');
          this.load();
        },
        error: (err) => {
          this.busyId = '';
          this.toast.error(err?.error?.error?.message || 'Could not be removed.');
        },
      });
    }
  }
}

  verifyWebsite(installation: ConnectorInstallation): void {
    if (!this.canManage || this.busyId) return;
    this.busyId = installation.id;
    this.api.startInstallationVerification(installation.id).pipe(
      switchMap(({ operationId }) => timer(0, 2000).pipe(
        switchMap(() => this.api.getOperation(operationId)),
        filter((operation) => ['succeeded', 'failed', 'cancelled'].includes(operation.status)),
        take(1),
        timeout(120_000),
      )),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe({
      next: (operation) => {
        this.busyId = '';
        if (operation.status === 'succeeded') this.toast.success('Website verified.');
        else this.toast.error('The website did not pass its latest check.');
        this.load();
      },
      error: () => {
        this.busyId = '';
        this.toast.error('No verification result yet. Check Background jobs or try again.');
      },
    });
  }
