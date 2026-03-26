import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { StudioEmptyStateComponent } from '../components/studio-empty-state.component';
import { StudioPageHeaderComponent } from '../components/studio-page-header.component';
import { StudioSidePanelComponent } from '../components/studio-side-panel.component';
import { StudioStatStripComponent, type StudioStatItem } from '../components/studio-stat-strip.component';
import type {
  PublicationListItem,
  StudioIdentityProviderConfig,
  StudioProjectSummary,
  StudioRoleSummary,
  StudioSession,
  StudioSiteSummary,
  StudioUserSummary,
} from '../models/studio.models';
import { StudioApiService } from '../services/studio-api.service';
import { formatApiError } from '../utils/api-error';

@Component({
  selector: 'app-workspace-settings-page',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterLink,
    StudioEmptyStateComponent,
    StudioPageHeaderComponent,
    StudioSidePanelComponent,
    StudioStatStripComponent,
  ],
  template: `
    <section class="console-page">
      <app-studio-page-header
        kicker="Settings"
        title="Workspace"
        intro="Identidad del tenant, provider OIDC, provisioning invite-only y señales operativas base del cockpit."
      >
        <div page-meta *ngIf="!loading">
          <span class="console-tag console-tag--muted">{{ session?.tenant?.status || 'unknown' }}</span>
          <span class="console-tag console-tag--muted">{{ session?.authMode || 'unknown' }}</span>
          <span class="console-tag" [ngClass]="provider?.enabled ? 'console-tag--success' : 'console-tag--warning'">
            {{ provider?.enabled ? 'SSO enabled' : 'SSO disabled' }}
          </span>
        </div>

        <a page-actions class="console-button console-button--secondary" routerLink="/studio/publishing/destinations">
          Open destinations
        </a>
        <a page-actions class="console-button console-button--secondary" routerLink="/studio/settings/users">
          Open users
        </a>
        <button page-actions type="button" class="console-button" (click)="loadData()">Refresh workspace</button>
      </app-studio-page-header>

      <div class="console-banner console-banner--success" *ngIf="notice">{{ notice }}</div>
      <div class="console-banner console-banner--error" *ngIf="error">{{ error }}</div>

      <app-studio-stat-strip *ngIf="!loading" [items]="stats"></app-studio-stat-strip>

      <section class="console-surface console-surface--hero" *ngIf="!loading">
        <div class="console-hero-grid">
          <div class="console-hero-copy">
            <p class="console-surface__eyebrow">Workspace posture</p>
            <h2 class="console-surface__title">Tenant governance across identity, access and release</h2>
            <p class="console-hero-copy__body">{{ workspaceNarrative }}</p>

            <div class="console-header-strip">
              <article class="console-header-strip__card">
                <span>Members</span>
                <strong>{{ users.length }}</strong>
                <small>{{ activeUsersCount }} active · {{ invitedUsersCount }} invited · {{ suspendedUsersCount }} suspended.</small>
              </article>
              <article class="console-header-strip__card">
                <span>Roles</span>
                <strong>{{ roles.length }}</strong>
                <small>{{ customRolesCount }} custom roles on top of the seeded system defaults.</small>
              </article>
              <article class="console-header-strip__card">
                <span>Publishing coverage</span>
                <strong>{{ credentialsCoverageLabel }}</strong>
                <small>{{ runtimeIncidentCount }} runtime incident{{ runtimeIncidentCount === 1 ? '' : 's' }} still visible in recent publishing signals.</small>
              </article>
            </div>
          </div>

          <div class="console-focus-stack">
            <div class="console-surface__head">
              <div>
                <p class="console-surface__eyebrow">Focus now</p>
                <h2 class="console-surface__title">Governance shortcuts</h2>
              </div>
            </div>

            <div class="console-focus-list">
              <a class="console-focus-card" routerLink="/studio/settings/users">
                <div>
                  <strong>User access</strong>
                  <p>{{ invitedUsersCount }} invited accounts and {{ suspendedUsersCount }} suspended seats need governance visibility.</p>
                </div>
                <span class="console-tag console-tag--accent">Users</span>
              </a>

              <a class="console-focus-card" routerLink="/studio/settings/roles">
                <div>
                  <strong>Role matrix</strong>
                  <p>{{ customRolesCount }} custom roles and {{ roles.length }} total RBAC shapes define the cockpit perimeter.</p>
                </div>
                <span class="console-tag console-tag--muted">Roles</span>
              </a>

              <a class="console-focus-card" routerLink="/studio/ai/prompts">
                <div>
                  <strong>Prompt governance</strong>
                  <p>{{ session?.projectCount || 0 }} projects depend on prompt defaults, assignments and provider health remaining coherent.</p>
                </div>
                <span class="console-tag" [ngClass]="provider?.enabled ? 'console-tag--success' : 'console-tag--warning'">
                  {{ provider?.enabled ? 'Tenant ready' : 'Check setup' }}
                </span>
              </a>
            </div>
          </div>
        </div>
      </section>

      <div class="console-workspace" *ngIf="!loading; else loadingState">
        <div class="console-workspace__main">
          <section class="console-surface console-surface--editorial">
            <div class="console-surface__head">
              <div>
                <p class="console-surface__eyebrow">Tenant profile</p>
                <h2 class="console-surface__title">Workspace identity</h2>
              </div>
              <span class="console-tag console-tag--muted">{{ session?.tenant?.slug || 'no-slug' }}</span>
            </div>

            <div class="console-meta-grid">
              <article class="console-meta-card">
                <span>Name</span>
                <strong>{{ session?.tenant?.name || 'Unknown workspace' }}</strong>
              </article>
              <article class="console-meta-card">
                <span>Slug</span>
                <strong>{{ session?.tenant?.slug || 'Missing slug' }}</strong>
              </article>
              <article class="console-meta-card">
                <span>Tenant status</span>
                <strong>{{ session?.tenant?.status || 'unknown' }}</strong>
              </article>
              <article class="console-meta-card">
                <span>Auth mode</span>
                <strong>{{ session?.authMode || 'unknown' }}</strong>
              </article>
              <article class="console-meta-card">
                <span>Members</span>
                <strong>{{ activeUsersCount }} active · {{ invitedUsersCount }} invited</strong>
              </article>
              <article class="console-meta-card">
                <span>Workspace load</span>
                <strong>{{ session?.projectCount || 0 }} projects · {{ sites.length }} destinations</strong>
              </article>
            </div>
          </section>

          <section class="console-surface">
            <div class="console-surface__head">
              <div>
                <p class="console-surface__eyebrow">OIDC configuration</p>
                <h2 class="console-surface__title">Identity provider</h2>
              </div>
              <span class="console-tag" [ngClass]="provider?.enabled ? 'console-tag--success' : 'console-tag--warning'">
                {{ provider?.enabled ? 'enabled' : 'disabled' }}
              </span>
            </div>

            <form class="console-form" [formGroup]="providerForm" (ngSubmit)="saveProvider()">
              <div class="console-form-grid">
                <label class="console-field">
                  <span>Enabled</span>
                  <select formControlName="enabled">
                    <option [ngValue]="true">Enabled</option>
                    <option [ngValue]="false">Disabled</option>
                  </select>
                </label>

                <label class="console-field">
                  <span>Provisioning</span>
                  <select formControlName="provisioningMode">
                    <option value="invite_only">Invite only</option>
                  </select>
                </label>
              </div>

              <label class="console-field">
                <span>Issuer</span>
                <input type="url" formControlName="issuer" placeholder="https://idp.example.com" />
              </label>

              <div class="console-form-grid">
                <label class="console-field">
                  <span>Client ID</span>
                  <input type="text" formControlName="clientId" />
                </label>

                <label class="console-field">
                  <span>Client secret</span>
                  <input type="password" formControlName="clientSecret" placeholder="Stored encrypted when present" />
                  <small *ngIf="provider?.hasClientSecret" class="console-field__hint">
                    A secret is already stored. Leave blank to keep it.
                  </small>
                </label>
              </div>

              <label class="console-field">
                <span>Scopes</span>
                <input type="text" formControlName="scopes" placeholder="openid profile email" />
              </label>

              <label class="console-field">
                <span>Claim mapping JSON</span>
                <textarea rows="6" formControlName="claimMappingsJson" placeholder='{"email":"email","name":"name","groups":"groups"}'></textarea>
              </label>

              <div class="console-inline-actions">
                <button type="submit" class="console-button" [disabled]="saving">
                  {{ saving ? 'Saving…' : 'Save provider' }}
                </button>
                <button type="button" class="console-button console-button--secondary" [disabled]="testing" (click)="testProvider()">
                  {{ testing ? 'Testing…' : 'Test connection' }}
                </button>
              </div>
            </form>
          </section>
        </div>

        <aside class="console-workspace__aside">
          <app-studio-side-panel eyebrow="Destinations" title="Destination mix">
            <div class="console-list-grid" *ngIf="sites.length; else emptySites">
              <article class="console-list-card" *ngFor="let site of sites">
                <div>
                  <strong>{{ site.name }}</strong>
                  <p>{{ site.type }} · {{ site.locale }} · {{ site.projectCount }} projects</p>
                  <small>{{ site.baseUrl || 'No base URL configured' }}</small>
                </div>
                <span class="console-tag" [ngClass]="destinationTagClass(site)">
                  {{ destinationTagLabel(site) }}
                </span>
              </article>
            </div>
          </app-studio-side-panel>

          <app-studio-side-panel eyebrow="Runtime" title="Recent publication signals">
            <div class="console-feed" *ngIf="publications.length; else emptyPublications">
              <article class="console-feed__item" *ngFor="let item of publications.slice(0, 6)">
                <div>
                  <strong>{{ item.project.title }}</strong>
                  <p>{{ item.site.name }} · {{ item.action }} · {{ item.status }}</p>
                </div>
                <span class="console-tag" [ngClass]="publicationTagClass(item.status)">
                  {{ item.status }}
                </span>
              </article>
            </div>
          </app-studio-side-panel>
        </aside>
      </div>

      <ng-template #loadingState>
        <app-studio-empty-state
          kicker="Settings"
          title="Loading workspace settings"
          body="Estamos reuniendo identidad del tenant, destinos y configuración enterprise del provider."
        ></app-studio-empty-state>
      </ng-template>

      <ng-template #emptySites>
        <div class="console-empty-compact">
          <p>No destinations configured yet.</p>
        </div>
      </ng-template>

      <ng-template #emptyPublications>
        <div class="console-empty-compact">
          <p>No publication signals yet.</p>
        </div>
      </ng-template>
    </section>
  `,
})
export class WorkspaceSettingsPageComponent implements OnInit {
  private readonly api = inject(StudioApiService);

  readonly providerForm = new FormGroup({
    enabled: new FormControl(true, { nonNullable: true }),
    provisioningMode: new FormControl('invite_only', { nonNullable: true }),
    issuer: new FormControl('', { nonNullable: true }),
    clientId: new FormControl('', { nonNullable: true }),
    clientSecret: new FormControl('', { nonNullable: true }),
    scopes: new FormControl('openid profile email', { nonNullable: true }),
    claimMappingsJson: new FormControl('', { nonNullable: true }),
  });

  session: StudioSession | null = null;
  provider: StudioIdentityProviderConfig | null = null;
  sites: StudioSiteSummary[] = [];
  projects: StudioProjectSummary[] = [];
  users: StudioUserSummary[] = [];
  roles: StudioRoleSummary[] = [];
  publications: PublicationListItem[] = [];
  stats: StudioStatItem[] = [];
  loading = true;
  saving = false;
  testing = false;
  error = '';
  notice = '';

  get activeUsersCount(): number {
    return this.users.filter((user) => user.status === 'active').length;
  }

  get invitedUsersCount(): number {
    return this.users.filter((user) => user.status === 'invited').length;
  }

  get suspendedUsersCount(): number {
    return this.users.filter((user) => user.status === 'suspended').length;
  }

  get customRolesCount(): number {
    return this.roles.filter((role) => !role.isSystem).length;
  }

  get credentialsMappedCount(): number {
    return this.sites.filter((site) => Boolean(site.publishingCredentialsRef)).length;
  }

  get runtimeIncidentCount(): number {
    return this.publications.filter((item) => item.status === 'failed').length;
  }

  get credentialsCoverageLabel(): string {
    return `${this.credentialsMappedCount}/${this.sites.length || 0}`;
  }

  get workspaceNarrative(): string {
    if (!this.session) {
      return 'Estamos reuniendo la postura real del tenant antes de exponer decisiones de gobierno.';
    }

    if (!this.provider?.enabled) {
      return 'El tenant sigue operando sin SSO activo. Antes de escalar invitaciones y colaboración enterprise conviene cerrar la postura del identity provider.';
    }

    if (this.runtimeIncidentCount > 0) {
      return `${this.runtimeIncidentCount} incidente${this.runtimeIncidentCount === 1 ? '' : 's'} runtime siguen visibles en publishing. Workspace settings deja de ser solo configuración y pasa a resumir el estado operativo del tenant.`;
    }

    if (this.credentialsMappedCount < this.sites.length) {
      return `${this.sites.length - this.credentialsMappedCount} destino${this.sites.length - this.credentialsMappedCount === 1 ? '' : 's'} siguen sin credenciales mapeadas. El tenant está topológicamente montado, pero todavía no totalmente listo para publish real.`;
    }

    return `${this.activeUsersCount} usuarios activos, ${this.roles.length} roles y ${this.sites.length} destinos conectados. La postura base del tenant ya se parece a un control plane serio y no a un panel aislado de configuración.`;
  }

  ngOnInit(): void {
    this.loadData();
  }

  loadData(): void {
    this.loading = true;
    this.error = '';

    forkJoin({
      session: this.api.getSession(),
      provider: this.api.getIdentityProvider(),
      sites: this.api.listSites(1, 100),
      projects: this.api.listProjects({ page: 1, pageSize: 100 }),
      users: this.api.listUsers(),
      roles: this.api.listRoles(),
      publications: this.api.listPublications(1, 100),
    }).subscribe({
      next: ({ session, provider, sites, projects, users, roles, publications }) => {
        this.session = session;
        this.provider = provider;
        this.sites = sites.items;
        this.projects = projects.items;
        this.users = users;
        this.roles = roles;
        this.publications = publications.items;
        this.stats = [
          {
            label: 'Destinations',
            value: sites.items.length,
            detail: 'Superficies conectadas al tenant para operar contenido.',
            tone: sites.items.length > 0 ? 'accent' : 'muted',
          },
          {
            label: 'Members',
            value: users.length,
            detail: 'Cuentas con invitación o acceso activo dentro del workspace.',
            tone: users.length > 0 ? 'accent' : 'muted',
          },
          {
            label: 'Roles',
            value: roles.length,
            detail: 'Capas RBAC que gobiernan acceso y operación del cockpit.',
            tone: roles.length > 0 ? 'muted' : 'warning',
          },
          {
            label: 'SSO',
            value: provider?.enabled ? 'Enabled' : 'Disabled',
            detail: 'Estado operativo del identity provider enterprise.',
            tone: provider?.enabled ? 'success' : 'warning',
          },
        ];
        this.providerForm.reset({
          enabled: provider?.enabled ?? false,
          provisioningMode: provider?.provisioningMode ?? 'invite_only',
          issuer: provider?.issuer ?? '',
          clientId: provider?.clientId ?? '',
          clientSecret: '',
          scopes: provider?.scopes ?? 'openid profile email',
          claimMappingsJson: provider?.claimMappings
            ? JSON.stringify(provider.claimMappings, null, 2)
            : '',
        });
        this.loading = false;
      },
      error: (error) => {
        this.error = formatApiError(error);
        this.loading = false;
      },
      });
  }

  destinationTagLabel(site: StudioSiteSummary): string {
    if (site.latestPublicationJob?.status === 'failed') {
      return 'Runtime incident';
    }

    if (site.publishingCredentialsRef) {
      return 'Credentials mapped';
    }

    return 'Credentials missing';
  }

  destinationTagClass(site: StudioSiteSummary): string {
    if (site.latestPublicationJob?.status === 'failed') {
      return 'console-tag--danger';
    }

    if (site.publishingCredentialsRef) {
      return 'console-tag--success';
    }

    return 'console-tag--warning';
  }

  publicationTagClass(status: PublicationListItem['status']): string {
    switch (status) {
      case 'published':
        return 'console-tag--success';
      case 'failed':
        return 'console-tag--danger';
      case 'processing':
        return 'console-tag--warning';
      case 'queued':
      case 'draft_synced':
        return 'console-tag--accent';
      case 'canceled':
      default:
        return 'console-tag--muted';
    }
  }

  saveProvider(): void {
    this.saving = true;
    this.error = '';

    let claimMappings: Record<string, unknown> | null = null;
    try {
      claimMappings = this.providerForm.controls.claimMappingsJson.value.trim()
        ? (JSON.parse(this.providerForm.controls.claimMappingsJson.value) as Record<string, unknown>)
        : null;
    } catch {
      this.saving = false;
      this.error = 'Claim mappings must be valid JSON.';
      return;
    }

    this.api
      .updateIdentityProvider({
        enabled: this.providerForm.controls.enabled.value,
        provisioningMode: this.providerForm.controls.provisioningMode.value,
        issuer: this.providerForm.controls.issuer.value.trim(),
        clientId: this.providerForm.controls.clientId.value.trim(),
        clientSecret: this.providerForm.controls.clientSecret.value.trim() || undefined,
        scopes: this.providerForm.controls.scopes.value.trim(),
        claimMappings,
      })
      .subscribe({
        next: () => {
          this.saving = false;
          this.notice = 'Identity provider updated.';
          this.loadData();
        },
        error: (error) => {
          this.saving = false;
          this.error = formatApiError(error);
        },
      });
  }

  testProvider(): void {
    this.testing = true;
    this.error = '';

    let claimMappings: Record<string, unknown> | null = null;
    try {
      claimMappings = this.providerForm.controls.claimMappingsJson.value.trim()
        ? (JSON.parse(this.providerForm.controls.claimMappingsJson.value) as Record<string, unknown>)
        : null;
    } catch {
      this.testing = false;
      this.error = 'Claim mappings must be valid JSON.';
      return;
    }

    this.api
      .testIdentityProvider({
        issuer: this.providerForm.controls.issuer.value.trim(),
        clientId: this.providerForm.controls.clientId.value.trim(),
        clientSecret: this.providerForm.controls.clientSecret.value.trim() || undefined,
        scopes: this.providerForm.controls.scopes.value.trim(),
        claimMappings,
      })
      .subscribe({
        next: (result) => {
          this.testing = false;
          this.notice = result.ok
            ? `OIDC discovery OK for ${result.issuer || this.providerForm.controls.issuer.value}.`
            : result.message || 'OIDC discovery failed.';
        },
        error: (error) => {
          this.testing = false;
          this.error = formatApiError(error);
        },
      });
  }
}
