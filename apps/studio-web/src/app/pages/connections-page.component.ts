import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Component, OnInit, PLATFORM_ID, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { StudioApiService } from '../services/studio-api.service';
import { ConfirmService } from '../services/confirm.service';
import { ToastService } from '../services/toast.service';
import { AppIconComponent } from '../components/ui/app-icon.component';
import { AppEmptyStateComponent } from '../components/ui/app-empty-state.component';
import type {
  ConnectorInstallation,
  PublishingAccount,
  SocialConnection,
  SocialSetupInfo,
} from '../models/studio.models';

type TabId = 'all' | 'websites' | 'social' | 'attention';

type ConnectionRow = {
  id: string;
  kind: 'website' | 'x' | 'instagram';
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
  imports: [CommonModule, FormsModule, RouterLink, AppIconComponent, AppEmptyStateComponent],
  template: `
    <section class="au-page">
      <header class="au-page__header au-page__header--split">
        <div>
          <p class="au-page__eyebrow">Publishing destinations</p>
          <h1 class="au-page__title">Connections</h1>
          <p class="au-page__subtitle">Discover, verify and manage the websites and social accounts Auctorio publishes to.</p>
        </div>
        <a class="au-btn au-btn--primary" routerLink="/studio/connections/wizard">
          <app-icon name="plug"></app-icon>
          Connect destination
        </a>
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
        <a class="au-btn au-btn--primary" routerLink="/studio/connections/wizard">Connect destination</a>
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
                <span class="au-badge" [class]="badgeClass(row)">
                  {{ stateLabel(row) }}
                </span>
              </td>
              <td data-label="Last checked">
                {{ row.verifiedAt ? (row.verifiedAt | date: 'medium') : 'Not checked yet' }}
              </td>
              <td class="au-table__actions">
                <button class="au-btn au-btn--ghost au-btn--sm" type="button" *ngIf="row.website" (click)="verifyLegacy(row.website)" [disabled]="busyId === row.id">
                  Test
                </button>
                <button class="au-btn au-btn--ghost au-btn--sm" type="button" *ngIf="row.social" (click)="verifySocial(row.social)" [disabled]="busyId === row.id">
                  Test
                </button>
                <button class="au-btn au-btn--ghost au-btn--sm" type="button" *ngIf="row.installation && resumable(row.installation)" (click)="resume(row.installation)">
                  {{ row.installation.state === 'ready' ? 'Activate' : 'Resume' }}
                </button>
                <button class="au-btn au-btn--ghost au-btn--sm" type="button" *ngIf="row.website || row.social || (row.installation && !isActive(row.installation))" (click)="remove(row)" [disabled]="busyId === row.id">
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
    this.api.listSocialConnections().subscribe({
      next: (response) => {
        this.socialConnections = response.items.filter((item) => item.platform === 'x' || item.platform === 'instagram');
        this.rebuildRows();
        this.loading = false;
      },
      error: () => {
        this.loading = false;
        this.loadError = 'Connections could not be loaded. Try again.';
      },
    });
    this.api.listPublishingAccounts().subscribe({
      next: (response) => {
        this.websiteAccounts = response.items.filter((item) => !this.socialConnections.some((social) => social.id === item.id));
        this.rebuildRows();
      },
      error: () => undefined,
    });
    this.api.listConnectorInstallations().subscribe({
      next: (response) => {
        this.installations = response.items;
        this.rebuildRows();
      },
      error: () => undefined,
    });
    this.api.getSocialSetup().subscribe({
      next: (setup) => {
        this.setup = setup;
      },
      error: () => {
        this.setup = null;
      },
    });
  }

  private rebuildRows(): void {
    const merged = new Map<string, ConnectionRow>();
    for (const account of this.websiteAccounts) {
      merged.set(`website:${account.id}`, {
        id: account.id,
        kind: account.platform === 'x' ? 'x' : account.platform === 'instagram' ? 'instagram' : 'website',
        provider: account.provider || 'legacy',
        displayName: account.displayName,
        state: !account.enabled ? 'disabled' : account.status === 'active' ? 'connected' : account.status === 'error' ? 'error' : account.status,
        needsAttention: !account.enabled || account.status === 'error',
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
        id: installation.id,
        kind: installation.kind,
        provider: installation.provider,
        displayName: installation.displayName ?? installation.provider,
        state: installation.state,
        needsAttention: ['failed', 'expired', 'credentials_required'].includes(installation.state),
        lastError: installation.lastError,
        verifiedAt: installation.verifiedAt,
        activatedAt: installation.activatedAt,
        siteName: null,
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
    return kind === 'x' ? 'X' : kind === 'instagram' ? 'IG' : 'WEB';
  }

  kindLabel(kind: string): string {
    return kind === 'x' ? 'X (Twitter)' : kind === 'instagram' ? 'Instagram' : 'Website';
  }

  stateLabel(row: ConnectionRow): string {
    switch (row.state) {
      case 'connected':
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
      case 'verifying':
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
    return ['draft', 'credentials_required', 'failed', 'ready', 'cancelled'].includes(installation.state);
  }

  isActive(installation: ConnectorInstallation): boolean {
    return installation.state === 'active' || installation.state === 'disabled';
  }

  resume(installation: ConnectorInstallation): void {
    if (installation.state === 'ready') {
      this.api.activateInstallation(installation.id).subscribe({
        next: () => {
          this.toast.success('Destination activated.');
          this.load();
        },
        error: (err) => this.toast.error(err?.error?.error?.message || 'Activation failed.'),
      });
      return;
    }
    void this.router.navigate(['/studio/connections/wizard', installation.id]);
  }

  verifySocial(connection: SocialConnection): void {
    this.busyId = connection.id;
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
    const label = row.kind === 'website' ? 'website destination' : 'social connection';
    const confirmed = await this.confirm.confirm({
      title: `Remove ${row.displayName}?`,
      message: `Existing publication history will remain. Publishing to this ${label} stops immediately.`,
      confirmLabel: 'Remove',
      danger: true,
    });
    if (!confirmed) {
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
      this.api.deleteConnectorInstallation(row.installation.id).subscribe({
        next: () => {
          this.busyId = '';
          this.toast.success('Draft removed.');
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
