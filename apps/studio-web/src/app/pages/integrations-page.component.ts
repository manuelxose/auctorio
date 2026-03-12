import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { STUDIO_ORIGIN } from '../infrastructure/http/studio-origin.token';
import type { PublicationListItem, StudioSession, StudioSiteSummary } from '../models/studio.models';
import { StudioApiService } from '../services/studio-api.service';
import { formatApiError } from '../utils/api-error';

type IntegrationsView = 'cms' | 'webhooks' | 'apis';

type ViewConfig = {
  kicker: string;
  title: string;
  intro: string;
  primaryActionLabel: string;
  primaryActionLink: string;
};

type EndpointRow = {
  title: string;
  method: string;
  path: string;
  detail: string;
};

const VIEW_CONFIGS: Record<IntegrationsView, ViewConfig> = {
  cms: {
    kicker: 'Integrations',
    title: 'CMS',
    intro: 'Estado de adapters CMS, credenciales y readiness de publicación por destino editorial.',
    primaryActionLabel: 'Open destinations',
    primaryActionLink: '/studio/publishing/destinations',
  },
  webhooks: {
    kicker: 'Integrations',
    title: 'Webhooks',
    intro: 'Entrega programática por webhook, trazas recientes y salud operativa del delivery.',
    primaryActionLabel: 'Open history',
    primaryActionLink: '/studio/publishing/history',
  },
  apis: {
    kicker: 'Integrations',
    title: 'APIs',
    intro: 'Superficie programática del workspace: auth, recursos expuestos y contratos vivos del cockpit.',
    primaryActionLabel: 'Open dashboard',
    primaryActionLink: '/studio/dashboard',
  },
};

@Component({
  selector: 'app-integrations-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  template: `
    <section class="console-page">
      <header class="console-page__header">
        <div class="console-page__copy">
          <p class="console-kicker">{{ viewConfig.kicker }}</p>
          <h1 class="console-page__title">{{ viewConfig.title }}</h1>
          <p class="console-page__intro">{{ viewConfig.intro }}</p>
        </div>

        <div class="console-page__actions">
          <a class="console-button console-button--secondary" [routerLink]="viewConfig.primaryActionLink">
            {{ viewConfig.primaryActionLabel }}
          </a>
          <button type="button" class="console-button" (click)="loadData()">Refresh integrations</button>
        </div>
      </header>

      <div class="console-banner console-banner--error" *ngIf="error">{{ error }}</div>

      <div class="console-stat-grid" *ngIf="!loading">
        <article class="console-stat-card">
          <p class="console-stat-card__label">{{ statOneLabel }}</p>
          <strong class="console-stat-card__value">{{ statOneValue }}</strong>
          <span class="console-stat-card__detail">{{ statOneDetail }}</span>
        </article>

        <article class="console-stat-card">
          <p class="console-stat-card__label">{{ statTwoLabel }}</p>
          <strong class="console-stat-card__value">{{ statTwoValue }}</strong>
          <span class="console-stat-card__detail">{{ statTwoDetail }}</span>
        </article>

        <article class="console-stat-card">
          <p class="console-stat-card__label">{{ statThreeLabel }}</p>
          <strong class="console-stat-card__value">{{ statThreeValue }}</strong>
          <span class="console-stat-card__detail">{{ statThreeDetail }}</span>
        </article>

        <article class="console-stat-card">
          <p class="console-stat-card__label">{{ statFourLabel }}</p>
          <strong class="console-stat-card__value">{{ statFourValue }}</strong>
          <span class="console-stat-card__detail">{{ statFourDetail }}</span>
        </article>
      </div>

      <div class="console-workspace" *ngIf="!loading; else loadingState">
        <div class="console-workspace__main">
          <section class="console-surface" *ngIf="view !== 'apis'; else apiSurface">
            <div class="console-surface__head">
              <div>
                <p class="console-surface__eyebrow">{{ view === 'cms' ? 'Adapters' : 'Delivery traces' }}</p>
                <h2 class="console-surface__title">{{ view === 'cms' ? 'Connected integrations' : 'Webhook operations' }}</h2>
              </div>
            </div>

            <form class="console-toolbar console-toolbar--stretch" [formGroup]="filterForm">
              <label class="console-search console-search--wide">
                <span>Search</span>
                <input
                  type="text"
                  formControlName="query"
                  placeholder="Destination, status or publication trace"
                  (input)="applyFilters()"
                />
              </label>

              <label class="console-select">
                <span>Type</span>
                <select formControlName="type" (change)="applyFilters()">
                  <option value="">All types</option>
                  <option *ngFor="let type of availableTypes" [value]="type">{{ type }}</option>
                </select>
              </label>
            </form>

            <div class="console-list-grid" *ngIf="filteredSites.length; else emptyIntegrations">
              <article class="console-list-card" *ngFor="let site of filteredSites">
                <div>
                  <strong>{{ site.name }}</strong>
                  <p>{{ site.key }} · {{ site.type }} · {{ site.projectCount }} projects</p>
                  <small>{{ site.baseUrl || 'No base URL configured' }}</small>
                </div>

                <div class="console-version-card__tags">
                  <span class="console-tag" [class.console-tag--success]="!!site.publishingCredentialsRef" [class.console-tag--warning]="!site.publishingCredentialsRef">
                    {{ site.publishingCredentialsRef ? 'Credentials mapped' : 'Credentials missing' }}
                  </span>
                  <span class="console-tag console-tag--muted">{{ site.locale }}</span>
                </div>
              </article>
            </div>

            <section class="console-surface console-surface--nested" *ngIf="view === 'webhooks'">
              <div class="console-surface__head">
                <div>
                  <p class="console-surface__eyebrow">Recent deliveries</p>
                  <h2 class="console-surface__title">Webhook publication traces</h2>
                </div>
              </div>

              <div class="console-feed" *ngIf="filteredWebhookPublications.length; else emptyWebhookDeliveries">
                <article class="console-feed__item" *ngFor="let item of filteredWebhookPublications">
                  <div>
                    <strong>{{ item.project.title }}</strong>
                    <p>{{ item.site.name }} · {{ item.action }} · {{ item.status }}</p>
                    <small>{{ item.externalUrl || item.externalId || 'No external receipt yet' }}</small>
                  </div>
                  <span class="console-tag" [class.console-tag--danger]="item.status === 'failed'">
                    {{ item.status }}
                  </span>
                </article>
              </div>
            </section>
          </section>

          <ng-template #apiSurface>
            <section class="console-surface">
              <div class="console-surface__head">
                <div>
                  <p class="console-surface__eyebrow">Access surface</p>
                  <h2 class="console-surface__title">API workspace contract</h2>
                </div>
              </div>

              <div class="console-meta-grid">
                <article class="console-meta-card">
                  <span>Tenant</span>
                  <strong>{{ session?.tenant?.name || 'Unknown workspace' }}</strong>
                </article>
                <article class="console-meta-card">
                  <span>Status</span>
                  <strong>{{ session?.tenant?.status || 'unknown' }}</strong>
                </article>
                <article class="console-meta-card">
                  <span>Studio origin</span>
                  <strong>{{ origin }}</strong>
                </article>
                <article class="console-meta-card">
                  <span>API base</span>
                  <strong>{{ apiBase }}</strong>
                </article>
              </div>

              <div class="console-table" *ngIf="endpointRows.length">
                <div class="console-table__head">
                  <span>Surface</span>
                  <span>Method</span>
                  <span>Path</span>
                  <span>Purpose</span>
                </div>

                <article class="console-table__row" *ngFor="let endpoint of endpointRows">
                  <strong>{{ endpoint.title }}</strong>
                  <span>{{ endpoint.method }}</span>
                  <span>{{ endpoint.path }}</span>
                  <span>{{ endpoint.detail }}</span>
                </article>
              </div>
            </section>
          </ng-template>
        </div>

        <aside class="console-workspace__aside">
          <section class="console-surface">
            <div class="console-surface__head">
              <div>
                <p class="console-surface__eyebrow">{{ view === 'apis' ? 'Auth model' : 'Health' }}</p>
                <h2 class="console-surface__title">{{ view === 'apis' ? 'Programmatic notes' : 'Integration health' }}</h2>
              </div>
            </div>

            <ul class="console-note-list">
              <li class="console-note-list__item" *ngFor="let note of notes">
                {{ note }}
              </li>
            </ul>
          </section>

          <section class="console-surface" *ngIf="view !== 'apis'">
            <div class="console-surface__head">
              <div>
                <p class="console-surface__eyebrow">Incidents</p>
                <h2 class="console-surface__title">Recent failures</h2>
              </div>
            </div>

            <div class="console-feed" *ngIf="failurePublications.length; else emptyFailures">
              <article class="console-feed__item" *ngFor="let failure of failurePublications">
                <div>
                  <strong>{{ failure.project.title }}</strong>
                  <p>{{ failure.site.name }} · {{ failure.action }}</p>
                </div>
                <p class="console-feed__error">{{ failure.error || 'Unknown integration error' }}</p>
              </article>
            </div>
          </section>
        </aside>
      </div>

      <ng-template #loadingState>
        <section class="console-empty-state">
          <div>
            <p class="console-kicker">{{ viewConfig.kicker }}</p>
            <h2>Loading integration surfaces</h2>
            <p>Estamos reuniendo adapters, deliveries y contrato programático del workspace.</p>
          </div>
        </section>
      </ng-template>

      <ng-template #emptyIntegrations>
        <div class="console-empty-compact">
          <p>No integrations match the current filters.</p>
        </div>
      </ng-template>

      <ng-template #emptyWebhookDeliveries>
        <div class="console-empty-compact">
          <p>No webhook deliveries observed yet.</p>
        </div>
      </ng-template>

      <ng-template #emptyFailures>
        <div class="console-empty-compact">
          <p>No integration failures right now.</p>
        </div>
      </ng-template>
    </section>
  `,
})
export class IntegrationsPageComponent implements OnInit {
  private readonly api = inject(StudioApiService);
  private readonly route = inject(ActivatedRoute);
  readonly origin = inject(STUDIO_ORIGIN);

  readonly filterForm = new FormGroup({
    query: new FormControl('', { nonNullable: true }),
    type: new FormControl('', { nonNullable: true }),
  });

  session: StudioSession | null = null;
  sites: StudioSiteSummary[] = [];
  publications: PublicationListItem[] = [];
  filteredSites: StudioSiteSummary[] = [];
  filteredWebhookPublications: PublicationListItem[] = [];
  failurePublications: PublicationListItem[] = [];
  availableTypes: string[] = [];
  endpointRows: EndpointRow[] = [];
  notes: string[] = [];
  loading = true;
  error = '';
  view: IntegrationsView = 'cms';

  get viewConfig(): ViewConfig {
    return VIEW_CONFIGS[this.view];
  }

  get apiBase(): string {
    return `${this.origin}/studio/api`;
  }

  get integrationSites(): StudioSiteSummary[] {
    return this.view === 'webhooks'
      ? this.sites.filter((site) => site.type === 'webhook')
      : this.sites.filter((site) => site.type !== 'webhook');
  }

  get statOneLabel(): string {
    return this.view === 'apis' ? 'Workspace sites' : 'Connected integrations';
  }

  get statOneValue(): number {
    return this.view === 'apis' ? this.session?.siteCount || this.sites.length : this.integrationSites.length;
  }

  get statOneDetail(): string {
    return this.view === 'apis'
      ? 'Destinos conectados al tenant que consume esta superficie programática.'
      : 'Destinos de integración visibles en esta vista.';
  }

  get statTwoLabel(): string {
    return this.view === 'apis' ? 'Workspace projects' : 'Credentials mapped';
  }

  get statTwoValue(): number {
    return this.view === 'apis'
      ? this.session?.projectCount || 0
      : this.integrationSites.filter((site) => Boolean(site.publishingCredentialsRef)).length;
  }

  get statTwoDetail(): string {
    return this.view === 'apis'
      ? 'Volumen de proyectos accesibles bajo el tenant autenticado.'
      : 'Integraciones con referencia de credenciales ya configurada.';
  }

  get statThreeLabel(): string {
    return this.view === 'apis' ? 'Endpoint groups' : 'Published destinations';
  }

  get statThreeValue(): number {
    return this.view === 'apis'
      ? this.endpointRows.length
      : this.integrationSites.filter((site) => site.publishedProjectCount > 0).length;
  }

  get statThreeDetail(): string {
    return this.view === 'apis'
      ? 'Contratos principales expuestos hoy por el backend editorial.'
      : 'Integraciones que ya sostienen contenido visible en producción.';
  }

  get statFourLabel(): string {
    return this.view === 'apis' ? 'Recent publication traces' : 'Failures';
  }

  get statFourValue(): number {
    return this.view === 'apis'
      ? this.publications.length
      : this.failurePublications.length;
  }

  get statFourDetail(): string {
    return this.view === 'apis'
      ? 'Trazas recientes disponibles para inspección desde publicación.'
      : 'Incidentes recientes de integración observados en publication jobs.';
  }

  ngOnInit(): void {
    this.view =
      (this.route.snapshot.data['integrationsView'] as IntegrationsView | undefined) ?? 'cms';
    this.loadData();
  }

  loadData(): void {
    this.loading = true;
    this.error = '';

    forkJoin({
      session: this.api.getSession(),
      sites: this.api.listSites(1, 100),
      publications: this.api.listPublications(1, 100),
    }).subscribe({
      next: ({ session, sites, publications }) => {
        this.session = session;
        this.sites = sites.items;
        this.publications = publications.items.sort(
          (left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt),
        );
        this.availableTypes = [...new Set(this.integrationSites.map((site) => site.type))];
        this.endpointRows = this.buildEndpointRows();
        this.notes = this.buildNotes();
        this.applyFilters();
        this.loading = false;
      },
      error: (error) => {
        this.error = formatApiError(error);
        this.loading = false;
      },
    });
  }

  applyFilters(): void {
    const query = this.filterForm.controls.query.value.trim().toLowerCase();
    const type = this.filterForm.controls.type.value;

    this.filteredSites = this.integrationSites.filter((site) => {
      if (type && site.type !== type) {
        return false;
      }

      if (!query) {
        return true;
      }

      return [site.name, site.key, site.type, site.baseUrl || '', site.locale]
        .join(' ')
        .toLowerCase()
        .includes(query);
    });

    const webhookSiteIds = new Set(
      this.sites.filter((site) => site.type === 'webhook').map((site) => site.id),
    );

    this.filteredWebhookPublications = this.publications
      .filter((item) => webhookSiteIds.has(item.site.id))
      .filter((item) => {
        if (!query) {
          return true;
        }

        return [
          item.project.title,
          item.site.name,
          item.status,
          item.action,
          item.externalId || '',
          item.externalUrl || '',
        ]
          .join(' ')
          .toLowerCase()
          .includes(query);
      })
      .slice(0, 10);

    this.failurePublications = this.publications
      .filter((item) => item.status === 'failed')
      .filter((item) => {
        if (this.view === 'cms') {
          return item.site.type !== 'webhook';
        }
        if (this.view === 'webhooks') {
          return item.site.type === 'webhook';
        }
        return true;
      })
      .slice(0, 8);
  }

  private buildEndpointRows(): EndpointRow[] {
    return [
      {
        title: 'Session',
        method: 'GET',
        path: '/session/me',
        detail: 'Identidad del tenant autenticado y volumen actual del workspace.',
      },
      {
        title: 'Sites',
        method: 'GET/POST',
        path: '/backend/v2/sites',
        detail: 'Registro de destinos, adapters y contratos de publicación.',
      },
      {
        title: 'Projects',
        method: 'GET/POST',
        path: '/backend/v2/projects',
        detail: 'Registro maestro de briefs, artículos y estado editorial.',
      },
      {
        title: 'Generation',
        method: 'POST',
        path: '/backend/v2/projects/:id/generate',
        detail: 'Disparo de primera salida o rerun editorial AI por proyecto.',
      },
      {
        title: 'Review',
        method: 'POST',
        path: '/backend/v2/projects/:id/revise | /approve',
        detail: 'Handoffs humanos entre feedback, QA pasada y aprobación final.',
      },
      {
        title: 'Publishing',
        method: 'POST/GET',
        path: '/backend/v2/projects/:id/publish | /backend/v2/publications',
        detail: 'Cola de release y trazabilidad programática por destino.',
      },
      {
        title: 'Assets',
        method: 'POST',
        path: '/backend/v2/assets/generate',
        detail: 'Generación de hero images sobre la versión activa.',
      },
    ];
  }

  private buildNotes(): string[] {
    if (this.view === 'cms') {
      return [
        'Esta vista traduce sites en adapters editoriales, no en simple configuración técnica.',
        'Credentials mapped es hoy la mejor señal visible de readiness de integración en CMS.',
        'Publishing History sigue siendo la fuente táctica para diagnosticar errores concretos de entrega.',
      ];
    }

    if (this.view === 'webhooks') {
      return [
        'Los destinos webhook son la vía más flexible para publicar en superficies no modeladas como CMS nativo.',
        'El valor de esta vista está en mezclar contrato de destino con trazas reales de delivery.',
        'Cuando exista observabilidad más fina, aquí deben aparecer payload signatures, retries y receipts.',
      ];
    }

    return [
      'La autenticación actual gira alrededor de la sesión del tenant y su API key asociada.',
      'El contrato expuesto hoy cubre session, sites, projects, generation, assets y publishing.',
      'Cuando aparezcan API keys gestionables o webhooks firmados, esta superficie deberá crecer como un verdadero developer portal.',
    ];
  }
}
