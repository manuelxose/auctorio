import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { RouterLink } from '@angular/router';
import type {
  CreateSitePayload,
  PublicationStatus,
  SiteType,
  StudioSiteDetail,
  StudioSiteSummary,
} from '../models/studio.models';
import { StudioPageHeaderComponent } from '../components/studio-page-header.component';
import { StudioStatStripComponent, type StudioStatItem } from '../components/studio-stat-strip.component';
import { StudioApiService } from '../services/studio-api.service';
import { formatApiError } from '../utils/api-error';

type CredentialFilter = 'all' | 'mapped' | 'missing';

@Component({
  selector: 'app-sites-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, StudioPageHeaderComponent, StudioStatStripComponent],
  template: `
    <section class="console-page">
      <app-studio-page-header
        kicker="Publishing"
        title="Destinations"
        intro="Directorio de webs, endpoints y contratos de publicacion conectados al workspace editorial."
      >
        <div page-meta *ngIf="!pageLoading">
          <span class="console-tag console-tag--success">{{ credentialsMappedCount }} credentialed</span>
          <span class="console-tag console-tag--accent">{{ publishedProjectsCount }} live pieces</span>
          <span class="console-tag console-tag--warning">{{ runtimeIncidentCount }} runtime incidents</span>
        </div>

        <div page-actions>
          <a class="console-button console-button--secondary" routerLink="/studio/publishing/history">
            Open history
          </a>
          <button type="button" class="console-button console-button--secondary" (click)="resetForm()">
            New destination
          </button>
          <button type="button" class="console-button" (click)="loadSites()">
            Refresh registry
          </button>
        </div>
      </app-studio-page-header>

      <div class="console-banner console-banner--error" *ngIf="error">{{ error }}</div>
      <div class="console-banner console-banner--success" *ngIf="notice">{{ notice }}</div>

      <app-studio-stat-strip *ngIf="!pageLoading" [items]="siteStats"></app-studio-stat-strip>

      <section class="console-surface console-surface--hero" *ngIf="!pageLoading">
        <div class="console-hero-grid">
          <div class="console-hero-copy">
            <p class="console-surface__eyebrow">Destination posture</p>
            <h2 class="console-surface__title">Release governance across connected surfaces</h2>
            <p class="console-hero-copy__body">{{ destinationNarrative }}</p>

            <div class="console-header-strip">
              <article class="console-header-strip__card">
                <span>Connected</span>
                <strong>{{ sites.length }}</strong>
                <small>Publishing surfaces mapped into the workspace control plane.</small>
              </article>
              <article class="console-header-strip__card">
                <span>Credentials mapped</span>
                <strong>{{ credentialsMappedCount }}</strong>
                <small>Destinations that already have a publishing credentials reference.</small>
              </article>
              <article class="console-header-strip__card">
                <span>Runtime incidents</span>
                <strong>{{ runtimeIncidentCount }}</strong>
                <small>Destinations whose latest publishing signal still shows a failed runtime event.</small>
              </article>
            </div>
          </div>

          <div class="console-focus-stack">
            <div class="console-surface__head">
              <div>
                <p class="console-surface__eyebrow">Focus now</p>
                <h2 class="console-surface__title">Destination watchlist</h2>
              </div>
            </div>

            <div class="console-focus-list" *ngIf="focusSites.length; else emptyFocusSites">
              <button
                type="button"
                class="console-focus-card console-focus-card--button"
                *ngFor="let site of focusSites.slice(0, 3)"
                (click)="startEdit(site.id)"
              >
                <div>
                  <strong>{{ site.name }}</strong>
                  <p>{{ focusSiteNarrative(site) }}</p>
                </div>
                <span class="console-tag" [ngClass]="siteRuntimeTagClass(site)">{{ siteRuntimeLabel(site) }}</span>
              </button>
            </div>
          </div>
        </div>
      </section>

      <div class="console-workspace" *ngIf="!pageLoading; else loadingState">
        <div class="console-workspace__main">
          <section class="console-surface console-surface--editorial">
            <div class="console-surface__head">
              <div>
                <p class="console-surface__eyebrow">Registry</p>
                <h2 class="console-surface__title">Connected destinations</h2>
              </div>
              <span class="console-tag console-tag--muted">{{ filteredSites.length }} indexed destinations</span>
            </div>

            <form class="console-toolbar console-toolbar--stretch" [formGroup]="filterForm">
              <label class="console-search console-search--wide">
                <span>Search</span>
                <input
                  type="text"
                  formControlName="query"
                  placeholder="Destination, key, runtime note or URL"
                  (input)="applyFilters()"
                />
              </label>

              <label class="console-select">
                <span>Type</span>
                <select formControlName="type" (change)="applyFilters()">
                  <option value="">All types</option>
                  <option *ngFor="let option of siteTypes" [value]="option">{{ option }}</option>
                </select>
              </label>

              <label class="console-select">
                <span>Credentials</span>
                <select formControlName="credentials" (change)="applyFilters()">
                  <option value="all">All destinations</option>
                  <option value="mapped">Credentials mapped</option>
                  <option value="missing">Missing credentials</option>
                </select>
              </label>
            </form>

            <div class="console-list-grid" *ngIf="filteredSites.length; else emptySites">
              <article class="console-list-card console-list-card--interactive" *ngFor="let site of filteredSites">
                <div class="console-version-card__head">
                  <div>
                    <strong>{{ site.name }}</strong>
                    <p>{{ site.key }} · {{ site.type }} · {{ site.projectCount }} active projects</p>
                  </div>
                  <div class="console-version-card__tags">
                    <span class="console-tag console-tag--muted">{{ site.locale }}</span>
                    <span class="console-tag" [ngClass]="siteRuntimeTagClass(site)">{{ siteRuntimeLabel(site) }}</span>
                  </div>
                </div>

                <p class="console-version-card__body">
                  {{ site.baseUrl || 'No base URL configured yet.' }}
                </p>

                <div class="console-meta-grid">
                  <article class="console-meta-card">
                    <span>Credentials</span>
                    <strong>{{ site.publishingCredentialsRef ? 'Mapped' : 'Missing' }}</strong>
                  </article>
                  <article class="console-meta-card">
                    <span>Published footprint</span>
                    <strong>{{ site.publishedProjectCount }} live pieces</strong>
                  </article>
                  <article class="console-meta-card">
                    <span>Runtime signal</span>
                    <strong>{{ siteRuntimeDetail(site) }}</strong>
                  </article>
                </div>

                <div class="console-inline-actions">
                  <button type="button" class="console-link-button" (click)="startEdit(site.id)">
                    Edit
                  </button>
                  <a class="console-link" routerLink="/studio/publishing/history">
                    Open history
                  </a>
                </div>
              </article>
            </div>
          </section>

          <section class="console-surface" *ngIf="watchlistSites.length">
            <div class="console-surface__head">
              <div>
                <p class="console-surface__eyebrow">Watchlist</p>
                <h2 class="console-surface__title">Governance gaps</h2>
              </div>
            </div>

            <div class="console-feed">
              <article class="console-feed__item" *ngFor="let site of watchlistSites.slice(0, 6)">
                <div>
                  <strong>{{ site.name }}</strong>
                  <p>{{ site.key }} · {{ site.type }} · {{ siteRuntimeDetail(site) }}</p>
                </div>
                <button type="button" class="console-link-button" (click)="startEdit(site.id)">
                  Review
                </button>
              </article>
            </div>
          </section>
        </div>

        <aside class="console-workspace__aside">
          <section class="console-surface console-surface--editorial">
            <div class="console-surface__head">
              <div>
                <p class="console-surface__eyebrow">{{ editingSiteId ? 'Edit' : 'Create' }}</p>
                <h2 class="console-surface__title">
                  {{ editingSiteId ? 'Destination profile' : 'New destination' }}
                </h2>
              </div>
            </div>

            <form [formGroup]="form" (ngSubmit)="submit()" class="console-form">
              <div class="console-project-composer__intro">
                <div>
                  <strong>{{ editingSiteId ? 'Destination contract' : 'New publishing contract' }}</strong>
                  <p>
                    {{ editingSiteId
                      ? 'Actualiza URL base, credenciales y reglas editoriales sin perder trazabilidad del destino actual.'
                      : 'Configura una nueva superficie de salida con su contrato editorial, SEO y runtime de publicacion.' }}
                  </p>
                </div>
              </div>

              <div class="console-form__grid">
                <label class="console-field">
                  <span>Key</span>
                  <input type="text" formControlName="key" [readonly]="!!editingSiteId" />
                </label>

                <label class="console-field">
                  <span>Name</span>
                  <input type="text" formControlName="name" />
                </label>
              </div>

              <div class="console-form__grid">
                <label class="console-field">
                  <span>Type</span>
                  <select formControlName="type">
                    <option *ngFor="let option of siteTypes" [value]="option">{{ option }}</option>
                  </select>
                </label>

                <label class="console-field">
                  <span>Locale</span>
                  <input type="text" formControlName="locale" />
                </label>
              </div>

              <label class="console-field">
                <span>Base URL</span>
                <input type="url" formControlName="baseUrl" />
              </label>

              <label class="console-field">
                <span>Credential ref</span>
                <input type="text" formControlName="publishingCredentialsRef" />
              </label>

              <label class="console-field">
                <span>Brand voice JSON</span>
                <textarea rows="4" formControlName="brandVoice"></textarea>
              </label>

              <label class="console-field">
                <span>SEO rules JSON</span>
                <textarea rows="4" formControlName="seoRules"></textarea>
              </label>

              <label class="console-field">
                <span>Taxonomy map JSON</span>
                <textarea rows="4" formControlName="taxonomyMap"></textarea>
              </label>

              <div class="console-form__actions">
                <button type="button" class="console-button console-button--secondary" (click)="resetForm()">
                  Clear
                </button>
                <button type="submit" class="console-button" [disabled]="saving || form.invalid">
                  {{ saving ? 'Saving...' : editingSiteId ? 'Update destination' : 'Create destination' }}
                </button>
              </div>
            </form>
          </section>

          <section class="console-surface">
            <div class="console-surface__head">
              <div>
                <p class="console-surface__eyebrow">Operating notes</p>
                <h2 class="console-surface__title">How to read this module</h2>
              </div>
            </div>

            <ul class="console-note-list">
              <li class="console-note-list__item">
                Destinations ya no son un simple CRUD; muestran credenciales, huella publicada y ultimo pulso runtime.
              </li>
              <li class="console-note-list__item">
                Una referencia de credenciales ausente no bloquea el modelado, pero si limita publish real y debe quedar visible.
              </li>
              <li class="console-note-list__item">
                History y Scheduled completan la lectura downstream del release cuando el problema ya salio del editor.
              </li>
            </ul>
          </section>
        </aside>
      </div>

      <ng-template #loadingState>
        <section class="console-empty-state">
          <div>
            <p class="console-kicker">Publishing</p>
            <h2>Loading destinations</h2>
            <p>Estamos reuniendo contratos de salida, credenciales y señales runtime del workspace.</p>
          </div>
        </section>
      </ng-template>

      <ng-template #emptyFocusSites>
        <div class="console-empty-compact">
          <p>No destination watchlist yet.</p>
        </div>
      </ng-template>

      <ng-template #emptySites>
        <section class="console-empty-state">
          <div>
            <p class="console-kicker">No destinations yet</p>
            <h2>Connect the first publishing target</h2>
            <p>Empieza configurando la primera web o endpoint para activar el publishing del workspace.</p>
          </div>
          <button type="button" class="console-button console-button--secondary" (click)="resetForm()">
            Create destination
          </button>
        </section>
      </ng-template>
    </section>
  `,
})
export class SitesPageComponent implements OnInit {
  private readonly api = inject(StudioApiService);

  readonly siteTypes: SiteType[] = ['guiatv', 'tecnoria', 'talkaris', 'webhook'];
  readonly filterForm = new FormGroup({
    query: new FormControl('', { nonNullable: true }),
    type: new FormControl<SiteType | ''>('', { nonNullable: true }),
    credentials: new FormControl<CredentialFilter>('all', { nonNullable: true }),
  });
  readonly form = new FormGroup({
    key: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    name: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    type: new FormControl<SiteType>('guiatv', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    locale: new FormControl('es-ES', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    baseUrl: new FormControl('', { nonNullable: true }),
    publishingCredentialsRef: new FormControl('', { nonNullable: true }),
    brandVoice: new FormControl('{}', { nonNullable: true }),
    seoRules: new FormControl('{}', { nonNullable: true }),
    taxonomyMap: new FormControl('{}', { nonNullable: true }),
  });

  sites: StudioSiteSummary[] = [];
  filteredSites: StudioSiteSummary[] = [];
  editingSiteId: string | null = null;
  pageLoading = true;
  saving = false;
  error = '';
  notice = '';

  get publishedProjectsCount(): number {
    return this.sites.reduce((total, site) => total + site.publishedProjectCount, 0);
  }

  get credentialsMappedCount(): number {
    return this.sites.filter((site) => site.publishingCredentialsRef).length;
  }

  get runtimeIncidentCount(): number {
    return this.sites.filter((site) => site.latestPublicationJob?.status === 'failed').length;
  }

  get siteStats(): StudioStatItem[] {
    return [
      {
        label: 'Connected destinations',
        value: this.sites.length,
        detail: 'Registros de salida conectados al control plane.',
        tone: this.sites.length > 0 ? 'accent' : 'muted',
      },
      {
        label: 'Webhook capable',
        value: this.countSitesByType('webhook'),
        detail: 'Destinos del tipo webhook detectados por el backend.',
        tone: this.countSitesByType('webhook') > 0 ? 'accent' : 'muted',
      },
      {
        label: 'Published projects',
        value: this.publishedProjectsCount,
        detail: 'Contenido actualmente visible en destinos conectados.',
        tone: this.publishedProjectsCount > 0 ? 'success' : 'muted',
      },
      {
        label: 'Credentials mapped',
        value: this.credentialsMappedCount,
        detail: 'Destinos con referencia de credenciales ya configurada.',
        tone: this.credentialsMappedCount === this.sites.length && this.sites.length > 0 ? 'success' : 'warning',
      },
    ];
  }

  get destinationNarrative(): string {
    if (!this.sites.length) {
      return 'Todavia no hay destinos conectados. El workspace necesita al menos una superficie de salida real para completar el flujo SEO end-to-end.';
    }

    const missingCredentials = this.sites.length - this.credentialsMappedCount;

    if (this.runtimeIncidentCount > 0) {
      return `${this.runtimeIncidentCount} destino${this.runtimeIncidentCount > 1 ? 's muestran' : ' muestra'} un incidente runtime reciente. Governance ya no es solo configuracion: tambien expone la salud operativa del release.`;
    }

    if (missingCredentials > 0) {
      return `${missingCredentials} destino${missingCredentials > 1 ? 's siguen' : ' sigue'} sin referencia de credenciales. La topologia existe, pero la capacidad de publish real aun es parcial en parte del workspace.`;
    }

    return `${this.sites.length} destino${this.sites.length > 1 ? 's conectados' : ' conectado'} con ${this.publishedProjectsCount} piezas live. La capa de publishing ya funciona como un registry operativo, no solo como inventario.`;
  }

  get focusSites(): StudioSiteSummary[] {
    return [...this.sites].sort((left, right) => {
      const rankDelta = this.sitePriorityRank(left) - this.sitePriorityRank(right);
      if (rankDelta !== 0) {
        return rankDelta;
      }

      if (right.publishedProjectCount !== left.publishedProjectCount) {
        return right.publishedProjectCount - left.publishedProjectCount;
      }

      return Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
    });
  }

  get watchlistSites(): StudioSiteSummary[] {
    return this.sites.filter(
      (site) => site.latestPublicationJob?.status === 'failed' || !site.publishingCredentialsRef,
    );
  }

  ngOnInit(): void {
    this.loadSites();
  }

  loadSites(): void {
    this.pageLoading = true;
    this.error = '';

    this.api.listSites(1, 100).subscribe({
      next: (response) => {
        this.sites = response.items;
        this.applyFilters();
        this.pageLoading = false;
      },
      error: (error) => {
        this.error = formatApiError(error);
        this.pageLoading = false;
      },
    });
  }

  startEdit(siteId: string): void {
    this.error = '';
    this.notice = '';

    this.api.getSite(siteId).subscribe({
      next: (site) => {
        this.editingSiteId = site.id;
        this.patchForm(site);
      },
      error: (error) => {
        this.error = formatApiError(error);
      },
    });
  }

  resetForm(): void {
    this.editingSiteId = null;
    this.notice = '';
    this.error = '';
    this.form.reset({
      key: '',
      name: '',
      type: 'guiatv',
      locale: 'es-ES',
      baseUrl: '',
      publishingCredentialsRef: '',
      brandVoice: '{}',
      seoRules: '{}',
      taxonomyMap: '{}',
    });
  }

  submit(): void {
    if (this.form.invalid || this.saving) {
      this.form.markAllAsTouched();
      return;
    }

    this.saving = true;
    this.error = '';
    this.notice = '';

    let payload: CreateSitePayload;
    try {
      payload = {
        key: this.form.controls.key.value.trim(),
        name: this.form.controls.name.value.trim(),
        type: this.form.controls.type.value,
        locale: this.form.controls.locale.value.trim(),
        baseUrl: this.form.controls.baseUrl.value.trim() || null,
        publishingCredentialsRef: this.form.controls.publishingCredentialsRef.value.trim() || null,
        brandVoice: this.parseJson(this.form.controls.brandVoice.value),
        seoRules: this.parseJson(this.form.controls.seoRules.value),
        taxonomyMap: this.parseJson(this.form.controls.taxonomyMap.value),
      };
    } catch (error) {
      this.saving = false;
      this.error = formatApiError(error);
      return;
    }

    const request = this.editingSiteId
      ? this.api.updateSite(this.editingSiteId, payload)
      : this.api.createSite(payload);

    request.subscribe({
      next: () => {
        this.saving = false;
        this.notice = this.editingSiteId
          ? 'Destination updated successfully.'
          : 'Destination created successfully.';
        this.loadSites();
        this.resetForm();
      },
      error: (error) => {
        this.saving = false;
        this.error = formatApiError(error);
      },
    });
  }

  countSitesByType(type: SiteType): number {
    return this.sites.filter((site) => site.type === type).length;
  }

  applyFilters(): void {
    const query = this.filterForm.controls.query.value.trim().toLowerCase();
    const type = this.filterForm.controls.type.value;
    const credentials = this.filterForm.controls.credentials.value;

    this.filteredSites = this.sites.filter((site) => {
      if (type && site.type !== type) {
        return false;
      }

      if (credentials === 'mapped' && !site.publishingCredentialsRef) {
        return false;
      }

      if (credentials === 'missing' && site.publishingCredentialsRef) {
        return false;
      }

      if (!query) {
        return true;
      }

      return [
        site.name,
        site.key,
        site.type,
        site.locale,
        site.baseUrl || '',
        site.publishingCredentialsRef || '',
        site.latestPublicationJob?.status || '',
        site.latestPublicationJob?.error || '',
      ]
        .join(' ')
        .toLowerCase()
        .includes(query);
    });
  }

  siteRuntimeLabel(site: StudioSiteSummary): string {
    const status = site.latestPublicationJob?.status;

    switch (status) {
      case 'published':
        return 'Publishing live';
      case 'draft_synced':
        return 'Draft synced';
      case 'processing':
        return 'Processing';
      case 'queued':
        return 'Queued';
      case 'failed':
        return 'Runtime incident';
      case 'canceled':
        return 'Canceled';
      default:
        return site.publishingCredentialsRef ? 'Configured' : 'Needs setup';
    }
  }

  siteRuntimeTagClass(site: StudioSiteSummary): string {
    const status = site.latestPublicationJob?.status;

    switch (status) {
      case 'published':
        return 'console-tag--success';
      case 'draft_synced':
      case 'queued':
        return 'console-tag--accent';
      case 'processing':
        return 'console-tag--warning';
      case 'failed':
        return 'console-tag--danger';
      case 'canceled':
        return 'console-tag--muted';
      default:
        return site.publishingCredentialsRef ? 'console-tag--muted' : 'console-tag--warning';
    }
  }

  siteRuntimeDetail(site: StudioSiteSummary): string {
    const status = site.latestPublicationJob?.status;

    if (!status) {
      return site.publishingCredentialsRef ? 'No runtime yet' : 'Missing credentials';
    }

    if (status === 'failed') {
      return site.latestPublicationJob?.error || 'Latest job failed';
    }

    if (status === 'published') {
      return site.latestPublicationJob?.externalUrl ? 'Live URL available' : 'Latest publish succeeded';
    }

    if (status === 'draft_synced') {
      return 'Latest job finished as draft sync';
    }

    if (status === 'processing') {
      return 'Latest job still processing';
    }

    if (status === 'queued') {
      return 'Latest job is queued';
    }

    return 'Latest job was canceled';
  }

  focusSiteNarrative(site: StudioSiteSummary): string {
    if (site.latestPublicationJob?.status === 'failed') {
      return `${site.type} · ${this.siteRuntimeDetail(site)}`;
    }

    if (!site.publishingCredentialsRef) {
      return `${site.type} · credential reference still missing for real publish operations.`;
    }

    if (site.publishedProjectCount > 0) {
      return `${site.type} · ${site.publishedProjectCount} live pieces and ${site.projectCount} active projects.`;
    }

    return `${site.type} · ${site.projectCount} active projects but no live publications yet.`;
  }

  private patchForm(site: StudioSiteDetail): void {
    this.form.reset({
      key: site.key,
      name: site.name,
      type: site.type,
      locale: site.locale,
      baseUrl: site.baseUrl || '',
      publishingCredentialsRef: site.publishingCredentialsRef || '',
      brandVoice: JSON.stringify(site.brandVoice || {}, null, 2),
      seoRules: JSON.stringify(site.seoRules || {}, null, 2),
      taxonomyMap: JSON.stringify(site.taxonomyMap || {}, null, 2),
    });
  }

  private parseJson(value: string): Record<string, unknown> | null {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }

    return JSON.parse(trimmed) as Record<string, unknown>;
  }

  private sitePriorityRank(site: StudioSiteSummary): number {
    if (site.latestPublicationJob?.status === 'failed') {
      return 0;
    }

    if (!site.publishingCredentialsRef) {
      return 1;
    }

    if (site.publishedProjectCount > 0) {
      return 2;
    }

    return 3;
  }
}
