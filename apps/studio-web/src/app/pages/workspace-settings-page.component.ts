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
  StudioSession,
  StudioSiteSummary,
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
        <a page-actions class="console-button console-button--secondary" routerLink="/studio/publishing/destinations">
          Open destinations
        </a>
        <button page-actions type="button" class="console-button" (click)="loadData()">Refresh workspace</button>
      </app-studio-page-header>

      <div class="console-banner console-banner--success" *ngIf="notice">{{ notice }}</div>
      <div class="console-banner console-banner--error" *ngIf="error">{{ error }}</div>

      <app-studio-stat-strip *ngIf="!loading" [items]="stats"></app-studio-stat-strip>

      <div class="console-workspace" *ngIf="!loading; else loadingState">
        <div class="console-workspace__main">
          <section class="console-surface">
            <div class="console-surface__head">
              <div>
                <p class="console-surface__eyebrow">Tenant profile</p>
                <h2 class="console-surface__title">Workspace identity</h2>
              </div>
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
            </div>
          </section>

          <section class="console-surface">
            <div class="console-surface__head">
              <div>
                <p class="console-surface__eyebrow">OIDC configuration</p>
                <h2 class="console-surface__title">Identity provider</h2>
              </div>
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
                <span
                  class="console-tag"
                  [class.console-tag--success]="!!site.publishingCredentialsRef"
                  [class.console-tag--warning]="!site.publishingCredentialsRef"
                >
                  {{ site.publishingCredentialsRef ? 'Credentials mapped' : 'Credentials missing' }}
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
                <span class="console-tag" [class.console-tag--danger]="item.status === 'failed'">
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
  publications: PublicationListItem[] = [];
  stats: StudioStatItem[] = [];
  loading = true;
  saving = false;
  testing = false;
  error = '';
  notice = '';

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
      publications: this.api.listPublications(1, 100),
    }).subscribe({
      next: ({ session, provider, sites, projects, publications }) => {
        this.session = session;
        this.provider = provider;
        this.sites = sites.items;
        this.projects = projects.items;
        this.publications = publications.items;
        this.stats = [
          {
            label: 'Destinations',
            value: sites.items.length,
            detail: 'Superficies conectadas al tenant para operar contenido.',
          },
          {
            label: 'Projects',
            value: session.projectCount,
            detail: 'Volumen editorial actual gestionado por el workspace.',
          },
          {
            label: 'Credentials coverage',
            value: sites.items.filter((site) => Boolean(site.publishingCredentialsRef)).length,
            detail: 'Destinos con referencia de credenciales mapeada en el control plane.',
          },
          {
            label: 'SSO',
            value: provider?.enabled ? 'Enabled' : 'Disabled',
            detail: 'Estado operativo del identity provider enterprise.',
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
