import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import type {
  CreateSitePayload,
  SiteType,
  StudioSiteDetail,
  StudioSiteSummary,
} from '../models/studio.models';
import { StudioApiService } from '../services/studio-api.service';
import { formatApiError } from '../utils/api-error';

@Component({
  selector: 'app-sites-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  template: `
    <section class="console-page">
      <header class="console-page__header">
        <div class="console-page__copy">
          <p class="console-kicker">Publishing</p>
          <h1 class="console-page__title">Destinations</h1>
          <p class="console-page__intro">
            Directorio de webs, endpoints y contratos de publicacion conectados al workspace editorial.
          </p>
        </div>

        <div class="console-page__actions">
          <span class="console-tag console-tag--accent">Live data</span>
          <button type="button" class="console-button console-button--secondary" (click)="resetForm()">
            New destination
          </button>
        </div>
      </header>

      <div class="console-banner console-banner--error" *ngIf="error">{{ error }}</div>
      <div class="console-banner console-banner--success" *ngIf="notice">{{ notice }}</div>

      <div class="console-stat-grid">
        <article class="console-stat-card">
          <p class="console-stat-card__label">Connected destinations</p>
          <strong class="console-stat-card__value">{{ sites.length }}</strong>
          <span class="console-stat-card__detail">Registros de salida conectados al control plane.</span>
        </article>

        <article class="console-stat-card">
          <p class="console-stat-card__label">Webhook capable</p>
          <strong class="console-stat-card__value">{{ countSitesByType('webhook') }}</strong>
          <span class="console-stat-card__detail">Destinos del tipo webhook detectados por el backend.</span>
        </article>

        <article class="console-stat-card">
          <p class="console-stat-card__label">Published projects</p>
          <strong class="console-stat-card__value">{{ publishedProjectsCount }}</strong>
          <span class="console-stat-card__detail">Contenido actualmente visible en destinos conectados.</span>
        </article>

        <article class="console-stat-card">
          <p class="console-stat-card__label">Credentials mapped</p>
          <strong class="console-stat-card__value">{{ credentialsMappedCount }}</strong>
          <span class="console-stat-card__detail">Destinos con referencia de credenciales ya configurada.</span>
        </article>
      </div>

      <div class="console-workspace">
        <div class="console-workspace__main">
          <section class="console-surface">
            <div class="console-surface__head">
              <div>
                <p class="console-surface__eyebrow">Registry</p>
                <h2 class="console-surface__title">Connected destinations</h2>
              </div>
            </div>

            <div class="console-list-grid" *ngIf="sites.length; else emptySites">
              <article class="console-list-card console-list-card--interactive" *ngFor="let site of sites">
                <div>
                  <strong>{{ site.name }}</strong>
                  <p>{{ site.key }} · {{ site.type }} · {{ site.projectCount }} active projects</p>
                  <small>{{ site.baseUrl || 'No base URL configured' }}</small>
                </div>

                <div class="console-inline-actions">
                  <span class="console-tag">{{ site.locale }}</span>
                  <button type="button" class="console-link-button" (click)="startEdit(site.id)">
                    Edit
                  </button>
                </div>
              </article>
            </div>
          </section>
        </div>

        <aside class="console-workspace__aside">
          <section class="console-surface">
            <div class="console-surface__head">
              <div>
                <p class="console-surface__eyebrow">{{ editingSiteId ? 'Edit' : 'Create' }}</p>
                <h2 class="console-surface__title">
                  {{ editingSiteId ? 'Destination profile' : 'New destination' }}
                </h2>
              </div>
            </div>

            <form [formGroup]="form" (ngSubmit)="submit()" class="console-form">
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
                <button type="submit" class="console-button" [disabled]="loading || form.invalid">
                  {{ loading ? 'Saving...' : editingSiteId ? 'Update destination' : 'Create destination' }}
                </button>
              </div>
            </form>
          </section>
        </aside>
      </div>

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
  editingSiteId: string | null = null;
  loading = false;
  error = '';
  notice = '';

  get publishedProjectsCount(): number {
    return this.sites.reduce((total, site) => total + site.publishedProjectCount, 0);
  }

  get credentialsMappedCount(): number {
    return this.sites.filter((site) => site.publishingCredentialsRef).length;
  }

  ngOnInit(): void {
    this.loadSites();
  }

  loadSites(): void {
    this.api.listSites(1, 100).subscribe({
      next: (response) => {
        this.sites = response.items;
      },
      error: (error) => {
        this.error = formatApiError(error);
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
    if (this.form.invalid || this.loading) {
      this.form.markAllAsTouched();
      return;
    }

    this.loading = true;
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
      this.loading = false;
      this.error = formatApiError(error);
      return;
    }

    const request = this.editingSiteId
      ? this.api.updateSite(this.editingSiteId, payload)
      : this.api.createSite(payload);

    request.subscribe({
      next: () => {
        this.loading = false;
        this.notice = this.editingSiteId
          ? 'Destination updated successfully.'
          : 'Destination created successfully.';
        this.loadSites();
        this.resetForm();
      },
      error: (error) => {
        this.loading = false;
        this.error = formatApiError(error);
      },
    });
  }

  countSitesByType(type: SiteType): number {
    return this.sites.filter((site) => site.type === type).length;
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
}
