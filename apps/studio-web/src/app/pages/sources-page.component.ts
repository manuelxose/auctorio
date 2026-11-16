import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { StudioApiService } from '../services/studio-api.service';
import { AppContextService } from '../services/app-context.service';
import { ConfirmService } from '../services/confirm.service';
import { ToastService } from '../services/toast.service';
import { AppIconComponent } from '../components/ui/app-icon.component';
import { SiteSourceRegistryComponent } from '../components/sources/site-source-registry.component';
import { AppEmptyStateComponent } from '../components/ui/app-empty-state.component';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { sectionFor } from '../layout/studio-nav';

type SourcesView = 'sources' | 'recommendations' | 'evidence' | 'add' | 'settings';
import type { BlockedDomain, DiscoveredDomain, SourceRecommendation, SourceType, StudioEnrichmentProvider, StudioFeedCandidate, StudioFeedDiscoveryResult, StudioSite, StudioSource, StudioSourcePack } from '../models/studio.models';

@Component({
  selector: 'app-sources-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, AppIconComponent, AppEmptyStateComponent, SiteSourceRegistryComponent],
  styles: [`.add-url { display: flex; gap: var(--au-s2); flex-wrap: wrap; } .add-url .au-input { flex: 1 1 320px; }`],
  template: `
    <section class="au-page">
      <header class="au-page__header">
        <div>
          <p class="au-page__eyebrow">Content acquisition</p>
          <h1 class="au-page__title">Sources</h1>
          <p class="au-page__subtitle">Where this site's stories and evidence come from: its own sources plus the ones shared by every site.</p>
        </div>
        <div class="au-page__actions">
          <a class="au-btn au-btn--primary" routerLink="." [queryParams]="{ tab: 'add' }" *ngIf="view !== 'add'">
            <app-icon name="plus"></app-icon>
            Add source
          </a>
        </div>
      </header>

      <app-site-source-registry *ngIf="view === 'sources'" section="sources"></app-site-source-registry>
      <app-site-source-registry *ngIf="view === 'recommendations'" section="recommendations"></app-site-source-registry>
      <app-site-source-registry *ngIf="view === 'evidence'" section="evidence"></app-site-source-registry>


      <!-- Recently discovered -->
      <section class="au-panel au-panel--padded au-mb-3" *ngIf="view === 'settings'">
        <h2 class="au-panel__title">Recently discovered</h2>
        <p class="au-panel__subtitle au-mb-3">Domains found by AI web discovery. Block low-quality or off-topic domains from being scraped.</p>
        <app-empty-state
          *ngIf="domains.length === 0"
          icon="sources"
          title="Nothing discovered yet"
          text="Enable AI source discovery in Settings and run it to start finding sources on the live web."
        >
          <button class="au-btn au-btn--primary au-btn--sm" type="button" (click)="runDiscovery()" [disabled]="runningDiscovery">
            {{ runningDiscovery ? 'Running…' : 'Run discovery now' }}
          </button>
        </app-empty-state>
        <div class="au-table-wrap" *ngIf="domains.length > 0">
          <table class="au-table">
            <thead>
              <tr>
                <th>Domain</th>
                <th>Discoveries</th>
                <th>Quality</th>
                <th>Last seen</th>
                <th style="width: 120px"></th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let domain of domains">
                <td><span class="au-table__title">{{ domain.domain }}</span></td>
                <td>{{ domain.discoveryCount }}</td>
                <td>
                  <span class="au-badge" [class.au-badge--success]="(domain.qualityScore ?? 0) >= 70" [class.au-badge--warning]="(domain.qualityScore ?? 0) >= 40 && (domain.qualityScore ?? 0) < 70" [class.au-badge--neutral]="(domain.qualityScore ?? 0) < 40">
                    {{ domain.qualityScore ?? '—' }}{{ domain.tier ? ' · ' + domain.tier : '' }}
                  </span>
                </td>
                <td class="au-nowrap au-muted">{{ dateLabel(domain.lastSeenAt) }}</td>
                <td>
                  <button class="au-btn au-btn--danger-ghost au-btn--sm" type="button" (click)="blockDomain(domain.domain)" *ngIf="!domain.blocked">
                    Block
                  </button>
                  <span class="au-badge au-badge--danger" *ngIf="domain.blocked">blocked</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="au-inline" *ngIf="domains.length > 0">
          <button class="au-btn au-btn--secondary au-btn--sm" type="button" (click)="runDiscovery()" [disabled]="runningDiscovery">
            <app-icon name="sparkles"></app-icon>
            {{ runningDiscovery ? 'Running…' : 'Run discovery now' }}
          </button>
        </div>
      </section>

      <!-- Blocked -->
      <section class="au-panel au-panel--padded au-mb-3" *ngIf="view === 'settings'">
        <h2 class="au-panel__title">Blocked sources</h2>
        <p class="au-panel__subtitle au-mb-3">These domains are excluded from AI discovery and scraping.</p>
        <app-empty-state
          *ngIf="blockedDomains.length === 0"
          icon="sources"
          title="No blocked domains"
          text="Block a domain from the Recently discovered section to keep it out of the pipeline."
        ></app-empty-state>
        <div class="au-table-wrap" *ngIf="blockedDomains.length > 0">
          <table class="au-table">
            <thead>
              <tr>
                <th>Domain</th>
                <th>Reason</th>
                <th>Blocked on</th>
                <th style="width: 120px"></th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let entry of blockedDomains">
                <td><span class="au-table__title">{{ entry.domain }}</span></td>
                <td class="au-muted">{{ entry.reason || '—' }}</td>
                <td class="au-nowrap au-muted">{{ dateLabel(entry.createdAt) }}</td>
                <td>
                  <button class="au-btn au-btn--secondary au-btn--sm" type="button" (click)="unblockDomain(entry.domain)">
                    Unblock
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section class="au-panel au-panel--padded au-mb-3" *ngIf="view === 'add'">
        <h2 class="au-panel__title">{{ editingId ? 'Edit source' : 'Add a source' }}</h2>
        <p class="au-panel__subtitle au-mb-3">Paste any website, feed or sitemap address. Auctorio finds the feed, you test it, and new stories start arriving in the Inbox.</p>
        <div class="au-field au-mb-3">
          <span class="au-field__label">1. Website or feed address</span>
          <div class="add-url">
            <input class="au-input" type="url" [(ngModel)]="form.url" placeholder="https://www.example.com" [disabled]="form.type === 'manual'" aria-label="Website or feed address" />
            <button class="au-btn au-btn--secondary" type="button" (click)="discoverFeeds()" [disabled]="!form.url || discoveringFeeds">
              <app-icon name="sparkles"></app-icon>
              {{ discoveringFeeds ? 'Looking…' : 'Find the feed' }}
            </button>
          </div>
        </div>
        <div class="au-field-grid au-mb-3">
          <label class="au-field">
            <span class="au-field__label">2. Name</span>
            <input class="au-input" type="text" [(ngModel)]="form.name" placeholder="e.g. El Mundo Deportes" />
          </label>
          <label class="au-field">
            <span class="au-field__label">3. Used by</span>
            <select class="au-select" [(ngModel)]="form.siteId">
              <option [ngValue]="activeSiteId">This site only</option>
              <option [ngValue]="null">Shared by all sites</option>
            </select>
          </label>
        </div>
        <details class="au-details au-mb-3">
          <summary class="au-details__summary">More options (type, refresh, trust, categories…)</summary>
        <div class="au-field-grid">
          <label class="au-field">
            <span class="au-field__label">Type</span>
            <select class="au-select" [(ngModel)]="form.type">
              <option *ngFor="let type of sourceTypes" [ngValue]="type">{{ type }}</option>
            </select>
          </label>
          <label class="au-field">
            <span class="au-field__label">Refresh (minutes)</span>
            <input class="au-input" type="number" min="5" [(ngModel)]="form.refreshIntervalMinutes" />
          </label>
          <label class="au-field">
            <span class="au-field__label">Priority (-5..5)</span>
            <input class="au-input" type="number" min="-5" max="5" [(ngModel)]="form.priority" />
          </label>
          <label class="au-field">
            <span class="au-field__label">Trust (0..1)</span>
            <input class="au-input" type="number" min="0" max="1" step="0.05" [(ngModel)]="form.trustScore" />
          </label>
          <label class="au-field">
            <span class="au-field__label">Language</span>
            <input class="au-input" type="text" [(ngModel)]="form.language" />
          </label>
          <label class="au-field">
            <span class="au-field__label">Categories (comma separated)</span>
            <input class="au-input" type="text" [(ngModel)]="form.categoriesText" placeholder="football, streaming, technology" />
          </label>
          <label class="au-field au-field--wide">
            <span class="au-field__label">Configuration (JSON, optional)</span>
            <textarea class="au-input au-textarea" rows="4" [(ngModel)]="form.configurationText" placeholder='{"itemSelector": "div.fa-card", "engine": "browser"}'></textarea>
            <span class="au-field__hint">Selectors for htmllist, filters for imdb. Leave empty to use per-site defaults.</span>
          </label>
        </div>
          <div class="au-field-grid au-mt-3">
            <label class="au-field">
              <span class="au-field__label">Authority (0..1)</span>
              <input class="au-input" type="number" min="0" max="1" step="0.05" [(ngModel)]="form.authorityScore" />
            </label>
            <label class="au-field">
              <span class="au-field__label">Country</span>
              <input class="au-input" type="text" [(ngModel)]="form.country" placeholder="e.g. US, GB, ES" />
            </label>
            <label class="au-field">
              <span class="au-field__label">Tags (comma separated)</span>
              <input class="au-input" type="text" [(ngModel)]="form.tagsText" placeholder="movies, tv, trade" />
            </label>
            <label class="au-field">
              <span class="au-field__label">Respect robots.txt</span>
              <select class="au-select" [(ngModel)]="form.respectRobots">
                <option [ngValue]="true">Yes</option>
                <option [ngValue]="false">No</option>
              </select>
            </label>
            <label class="au-field">
              <span class="au-field__label">Rate limits (JSON, optional)</span>
              <input class="au-input" type="text" [(ngModel)]="form.rateLimitsText" placeholder='{"maxRequestsPerMinute": 6, "minIntervalMs": 10000}' />
            </label>
            <label class="au-field">
              <span class="au-field__label">Extraction policy (JSON, optional)</span>
              <input class="au-input" type="text" [(ngModel)]="form.extractionPolicyText" placeholder='{"extractArticleMetadataOnly": true}' />
            </label>
          </div>
        </details>
        <div class="au-panel au-panel--padded au-mb-3" *ngIf="feedCandidates.length > 0">
          <h3 class="au-panel__title">Discovered endpoints for {{ discoveredHostname }}</h3>
          <p class="au-panel__subtitle">Verified endpoints only. Pick one to use — nothing is subscribed automatically.</p>
          <ul class="au-list">
            <li class="au-list__item" *ngFor="let candidate of feedCandidates">
              <div class="au-flex-1">
                <span class="au-badge au-badge--success" *ngIf="candidate.verified">verified</span>
                <span class="au-badge au-badge--warning" *ngIf="!candidate.verified">unverified</span>
                <span class="au-badge au-badge--outline au-ml-1">{{ candidate.type }}</span>
                <span class="au-badge au-badge--outline au-ml-1">{{ candidate.method }}</span>
                <div class="au-truncate au-muted" style="max-width: 640px">{{ candidate.url }}</div>
                <div class="au-muted" *ngIf="candidate.note">{{ candidate.note }}</div>
              </div>
              <button class="au-btn au-btn--secondary au-btn--sm" type="button" (click)="useCandidate(candidate)" [disabled]="!candidate.verified">Use this endpoint</button>
            </li>
          </ul>
        </div>
        <div class="au-panel au-panel--padded au-mb-3" *ngIf="draftTest">
          <h3 class="au-panel__title">Preview — {{ draftTest.itemCount ?? 0 }} items</h3>
          <div class="au-muted au-mb-2" *ngIf="!draftTest.ok">{{ draftTest.message }}</div>
          <table class="au-table" *ngIf="draftTest.ok && draftTest.sample?.length">
            <thead><tr><th>Title</th><th>Published</th><th>Category</th></tr></thead>
            <tbody>
              <tr *ngFor="let item of draftTest.sample">
                <td><span class="au-table__title">{{ item['title'] }}</span><span class="au-table__sub au-truncate" style="display:block;max-width:420px">{{ item['canonicalUrl'] }}</span></td>
                <td class="au-nowrap au-muted">{{ dateLabel(item['publishedAt']) }}</td>
                <td class="au-muted">{{ categoriesLabel(item) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="au-form__actions">
          <button class="au-btn au-btn--ghost" type="button" *ngIf="editingId" (click)="resetForm()">Cancel</button>
          <button class="au-btn au-btn--secondary" type="button" (click)="testDraft()" [disabled]="!form.url || testingDraft">
            {{ testingDraft ? 'Testing…' : 'Test connection' }}
          </button>
          <button class="au-btn au-btn--primary" type="button" (click)="save()" [disabled]="saving">{{ saving ? 'Saving…' : 'Save source' }}</button>
        </div>
      </section>


      <!-- Source packs -->
      <section class="au-panel au-panel--padded au-mb-3" *ngIf="view === 'add'">
        <h2 class="au-panel__title">Source packs</h2>
        <p class="au-panel__subtitle au-mb-3">Optional bootstrap configuration. Importing a pack creates ordinary sources — the database remains the runtime source of truth.</p>
        <app-empty-state *ngIf="packs.length === 0" icon="sources" title="No packs available" text="Source packs appear here when the backend registers them."></app-empty-state>
        <div class="au-connection-grid" *ngIf="packs.length > 0">
          <article class="au-connection-card" *ngFor="let pack of packs">
            <div class="au-connection-card__head">
              <div class="au-flex-1">
                <h2>{{ pack.name }}</h2>
                <p>{{ pack.description }}</p>
              </div>
              <span class="au-badge au-badge--outline">{{ pack.key }}</span>
            </div>
            <p class="au-muted au-mb-2">
              {{ pack.entryCount }} sources · {{ pack.providerCount }} enrichment providers ·
              {{ pack.importedSourceCount }} already imported
            </p>
            <details class="au-details au-mb-2">
              <summary class="au-details__summary">Sources in this pack</summary>
              <ul class="au-list">
                <li class="au-list__item" *ngFor="let entry of pack.entries">
                  <div class="au-flex-1">
                    <span class="au-table__title">{{ entry.name }}</span>
                    <span class="au-badge au-badge--outline au-ml-1">{{ entry.adapter }}</span>
                    <span class="au-badge au-badge--neutral au-ml-1">{{ entry.discoveryMethod }}</span>
                    <div class="au-truncate au-muted" style="max-width: 520px">{{ entry.endpoint }}</div>
                    <div class="au-muted" *ngIf="entry.notes">{{ entry.notes }}</div>
                  </div>
                </li>
              </ul>
            </details>
            <label class="au-check au-mb-2">
              <input type="checkbox" [(ngModel)]="importEnabled" />
              Enable sources after import
            </label>
            <label class="au-check au-mb-2">
              <input type="checkbox" [(ngModel)]="importWithProviders" />
              Also create enrichment providers (TMDB, OMDb, YouTube…)
            </label>
            <div class="au-inline">
              <button class="au-btn au-btn--primary au-btn--sm" type="button" (click)="importPack(pack.key)" [disabled]="importingPack === pack.key">
                {{ importingPack === pack.key ? 'Importing…' : 'Import pack' }}
              </button>
            </div>
          </article>
        </div>
      </section>

      <!-- Enrichment providers -->
      <section class="au-panel au-panel--padded au-mb-3" *ngIf="view === 'settings'">
        <h2 class="au-panel__title">Enrichment providers</h2>
        <p class="au-panel__subtitle au-mb-3">Structured-data APIs (TMDB, OMDb, YouTube Data API…). Independent from editorial sources. Credentials are server-side env-var references — API keys never reach the browser.</p>
        <app-empty-state *ngIf="providers.length === 0" icon="sources" title="No enrichment providers" text="Import a source pack or add a provider manually."></app-empty-state>
        <div class="au-table-wrap" *ngIf="providers.length > 0">
          <table class="au-table">
            <thead>
              <tr><th>Provider</th><th>Type</th><th>Endpoint</th><th>Credential</th><th>Status</th><th>Verified</th><th style="width: 130px"></th></tr>
            </thead>
            <tbody>
              <tr *ngFor="let provider of providers">
                <td><span class="au-table__title">{{ provider.name }}</span><span class="au-table__sub">{{ provider.key }}</span></td>
                <td><span class="au-badge au-badge--outline">{{ provider.providerType }}</span></td>
                <td class="au-muted au-truncate" style="max-width: 260px">{{ provider.baseUrl ?? '—' }}{{ provider.endpoint ?? '' }}</td>
                <td>
                  <span class="au-badge au-badge--success" *ngIf="provider.credentialsConfigured">configured</span>
                  <span class="au-badge au-badge--warning" *ngIf="!provider.credentialsConfigured">{{ provider.credentialsRef ?? 'no ref' }}</span>
                </td>
                <td>
                  <span class="au-badge" [class.au-badge--success]="provider.enabled" [class.au-badge--neutral]="!provider.enabled">{{ provider.enabled ? 'enabled' : 'disabled' }}</span>
                </td>
                <td>
                  <span class="au-badge au-badge--success" *ngIf="provider.verificationStatus === 'verified'">verified</span>
                  <span class="au-badge au-badge--danger" *ngIf="provider.verificationStatus === 'unsupported'">unsupported</span>
                  <span class="au-badge au-badge--neutral" *ngIf="provider.verificationStatus !== 'verified' && provider.verificationStatus !== 'unsupported'">{{ provider.verificationStatus ?? 'unverified' }}</span>
                </td>
                <td>
                  <div class="au-inline">
                    <button class="au-btn au-btn--secondary au-btn--sm" type="button" (click)="testProvider(provider)" [disabled]="testingProvider === provider.id">Test</button>
                    <button class="au-btn au-btn--ghost au-btn--sm" type="button" (click)="toggleProvider(provider)">{{ provider.enabled ? 'Disable' : 'Enable' }}</button>
                    <button class="au-btn au-btn--danger-ghost au-btn--sm" type="button" (click)="removeProvider(provider)">Delete</button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="au-panel au-panel--padded au-mb-3" *ngIf="providerTestResult">
          <h3 class="au-panel__title">Provider test result</h3>
          <div class="au-muted">{{ providerTestResult }}</div>
        </div>
        <details class="au-details">
          <summary class="au-details__summary">Add provider</summary>
          <div class="au-field-grid">
            <label class="au-field">
              <span class="au-field__label">Key</span>
              <input class="au-input" type="text" [(ngModel)]="providerForm.key" placeholder="tmdb" />
            </label>
            <label class="au-field">
              <span class="au-field__label">Name</span>
              <input class="au-input" type="text" [(ngModel)]="providerForm.name" placeholder="TMDB (The Movie Database)" />
            </label>
            <label class="au-field">
              <span class="au-field__label">Provider type</span>
              <input class="au-input" type="text" [(ngModel)]="providerForm.providerType" placeholder="tmdb | omdb | youtube | custom" />
            </label>
            <label class="au-field">
              <span class="au-field__label">Base URL</span>
              <input class="au-input" type="text" [(ngModel)]="providerForm.baseUrl" placeholder="https://api.themoviedb.org/3" />
            </label>
            <label class="au-field">
              <span class="au-field__label">Endpoint path</span>
              <input class="au-input" type="text" [(ngModel)]="providerForm.endpoint" placeholder="/trending/movie/week" />
            </label>
            <label class="au-field">
              <span class="au-field__label">Credentials ref (env var name)</span>
              <input class="au-input" type="text" [(ngModel)]="providerForm.credentialsRef" placeholder="TMDB_API_KEY" />
              <span class="au-field__hint">Server-side secret reference. The key itself is never stored or returned.</span>
            </label>
          </div>
          <div class="au-form__actions">
            <button class="au-btn au-btn--primary" type="button" (click)="addProvider()" [disabled]="savingProvider">{{ savingProvider ? 'Saving…' : 'Add provider' }}</button>
          </div>
        </details>
      </section>
    </section>
  `,
})
export class SourcesPageComponent implements OnInit {
  private readonly api = inject(StudioApiService);
  private readonly appContext = inject(AppContextService);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);
  private readonly route = inject(ActivatedRoute);

  sourceTypes: SourceType[] = ['rss', 'atom', 'html', 'sitemap', 'api', 'htmllist', 'imdb', 'manual'];
  sources: StudioSource[] = [];
  sites: StudioSite[] = [];
  showForm = false;
  saving = false;
  editingId: string | null = null;
  fetching: Record<string, boolean> = {};
  feedback = '';
  view: SourcesView = 'sources';
  /** New sources default to the active site; null shares them with every site. */
  readonly activeSiteId = this.appContext.activeSite()?.id ?? null;
  recommendations: SourceRecommendation[] = [];
  domains: DiscoveredDomain[] = [];
  blockedDomains: BlockedDomain[] = [];
  busyRecommendation = '';
  runningDiscovery = false;
  includeArchived = false;

  // Feed discovery + draft test
  discoveringFeeds = false;
  testingDraft = false;
  feedCandidates: StudioFeedCandidate[] = [];
  discoveryResult: StudioFeedDiscoveryResult | null = null;
  discoveredHostname = '';
  draftTest: { ok: boolean; itemCount?: number; sample?: Array<Record<string, unknown>>; message?: string } | null = null;

  // Bulk operations
  selected = new Set<string>();
  bulkRunning = false;
  bulkFeedback = '';
  bulkCategory = '';
  bulkSiteId: string | null = null;

  // Source detail & runs
  detailSource: StudioSource | null = null;
  detailId: string | null = null;
  runs: Array<{
    id: string;
    runKey: string;
    status: string;
    startedAt: string;
    durationMs: number | null;
    itemsFound: number;
    itemsCreated: number;
    itemsDuplicated: number;
    errorMessage: string | null;
  }> = [];

  // Source packs
  packs: StudioSourcePack[] = [];
  importingPack = '';
  importEnabled = true;
  importWithProviders = false;

  // Enrichment providers
  providers: StudioEnrichmentProvider[] = [];
  testingProvider = '';
  savingProvider = false;
  providerTestResult = '';
  providerForm = { key: '', name: '', providerType: '', baseUrl: '', endpoint: '', credentialsRef: '' };

  form = {
    name: '',
    type: 'rss' as SourceType,
    url: '',
    domain: '',
    siteId: this.activeSiteId as string | null,
    refreshIntervalMinutes: 30,
    priority: 0,
    trustScore: 0.5,
    authorityScore: 0.5,
    language: 'es',
    country: '',
    categoriesText: '',
    tagsText: '',
    configurationText: '',
    rateLimitsText: '',
    extractionPolicyText: '',
    respectRobots: true,
    discoveryMethod: '' as string,
  };

  ngOnInit(): void {
    this.sites = this.appContext.sites();
    // Sections are picked in the sidebar (?tab=).
    this.route.queryParamMap.subscribe((params) => this.setView(sectionFor('/studio/sources', params.get('tab')) as SourcesView));
  }

  setView(view: SourcesView): void {
    this.view = view;
    if (view === 'add') {
      this.resetForm();
      this.loadPacks();
    }
    if (view === 'settings') {
      this.loadDiscovered();
      this.loadBlocked();
      this.loadProviders();
    }
  }

  loadDiscovered(): void {
    this.api.listDiscoveredDomains(1, 50).subscribe({
      next: (response) => { this.domains = response.items; },
      error: () => { this.domains = []; },
    });
  }

  loadBlocked(): void {
    this.api.listBlockedDomains().subscribe({
      next: (response) => { this.blockedDomains = response.items; },
      error: () => { this.blockedDomains = []; },
    });
  }

  blockDomain(domain: string): void {
    this.api.blockDiscoveredDomain(domain).subscribe({
      next: () => {
        this.toast.success(`${domain} blocked from discovery.`);
        this.loadDiscovered();
        this.loadBlocked();
      },
      error: (error) => {
        this.feedback = String(error?.error?.message ?? 'Could not block the domain.');
      },
    });
  }

  unblockDomain(domain: string): void {
    this.api.unblockDiscoveredDomain(domain).subscribe({
      next: () => {
        this.toast.success(`${domain} unblocked.`);
        this.loadBlocked();
        this.loadDiscovered();
      },
      error: (error) => {
        this.feedback = String(error?.error?.message ?? 'Could not unblock the domain.');
      },
    });
  }

  runDiscovery(): void {
    this.runningDiscovery = true;
    this.api.runDiscoveryNow().subscribe({
      next: () => {
        this.runningDiscovery = false;
        this.toast.success('AI discovery started. Results appear shortly.');
        setTimeout(() => this.loadDiscovered(), 4000);
      },
      error: (error) => {
        this.runningDiscovery = false;
        this.feedback = String(error?.error?.message ?? 'Discovery could not be started.');
      },
    });
  }

  save(): void {
    if (!this.form.name.trim()) {
      this.feedback = 'Name is required.';
      return;
    }
    let configuration: Record<string, unknown> | undefined;
    if (this.form.configurationText.trim()) {
      try {
        const parsed = JSON.parse(this.form.configurationText) as unknown;
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          throw new Error('object expected');
        }
        configuration = parsed as Record<string, unknown>;
      } catch {
        this.feedback = 'Configuration must be valid JSON.';
        return;
      }
    }
    let rateLimitPolicy: Record<string, unknown> | undefined;
    if (this.form.rateLimitsText.trim()) {
      try {
        const parsed = JSON.parse(this.form.rateLimitsText) as unknown;
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          throw new Error('object expected');
        }
        rateLimitPolicy = parsed as Record<string, unknown>;
      } catch {
        this.feedback = 'Rate limits must be valid JSON.';
        return;
      }
    }
    let extractionPolicy: Record<string, unknown> | undefined;
    if (this.form.extractionPolicyText.trim()) {
      try {
        const parsed = JSON.parse(this.form.extractionPolicyText) as unknown;
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          throw new Error('object expected');
        }
        extractionPolicy = parsed as Record<string, unknown>;
      } catch {
        this.feedback = 'Extraction policy must be valid JSON.';
        return;
      }
    }
    const payload = {
      name: this.form.name.trim(),
      type: this.form.type,
      url: this.form.type === 'manual' ? undefined : this.form.url.trim(),
      domain: this.form.domain.trim() || undefined,
      siteId: this.form.siteId ?? undefined,
      refreshIntervalMinutes: Math.max(5, this.form.refreshIntervalMinutes),
      priority: this.form.priority,
      trustScore: this.form.trustScore,
      authorityScore: this.form.authorityScore,
      language: this.form.language || 'es',
      country: this.form.country.trim() || undefined,
      categories: this.form.categoriesText.split(',').map((item) => item.trim()).filter(Boolean),
      tags: this.form.tagsText.split(',').map((item) => item.trim()).filter(Boolean),
      configuration,
      rateLimitPolicy,
      robotsPolicy: { respect: this.form.respectRobots },
      extractionPolicy,
      discoveryMethod: this.form.discoveryMethod || undefined,
    };
    this.saving = true;
    const request = this.editingId
      ? this.api.updateSource(this.editingId, payload)
      : this.api.createSource(payload);
    request.subscribe({
      next: () => {
        this.saving = false;
        this.resetForm();
        this.toast.success('Source saved. It now appears in Sources.');
      },
      error: (error) => {
        this.saving = false;
        this.feedback = String(error?.error?.message ?? 'Failed to save source.');
      },
    });
  }

  resetForm(): void {
    this.editingId = null;
    this.showForm = false;
    this.feedCandidates = [];
    this.discoveryResult = null;
    this.draftTest = null;
    this.form = {
      name: '',
      type: 'rss',
      url: '',
      domain: '',
      siteId: this.activeSiteId,
      refreshIntervalMinutes: 30,
      priority: 0,
      trustScore: 0.5,
      authorityScore: 0.5,
      language: 'es',
      country: '',
      categoriesText: '',
      tagsText: '',
      configurationText: '',
      rateLimitsText: '',
      extractionPolicyText: '',
      respectRobots: true,
      discoveryMethod: '',
    };
  }

  // ── Feed discovery ───────────────────────────────────────────────────

  discoverFeeds(): void {
    const target = this.form.url.trim();
    if (!target) {
      this.feedback = 'Enter a URL or domain to discover feeds.';
      return;
    }
    this.discoveringFeeds = true;
    this.feedback = '';
    this.api.discoverFeeds(target).subscribe({
      next: (result) => {
        this.discoveringFeeds = false;
        this.discoveryResult = result;
        this.discoveredHostname = result.hostname;
        this.feedCandidates = result.candidates.filter((candidate) => candidate.verified || candidate.type === 'feed');
        if (result.errors.length > 0 && this.feedCandidates.length === 0) {
          this.feedback = `Discovery issues: ${result.errors.join('; ')}`;
        }
      },
      error: (error) => {
        this.discoveringFeeds = false;
        this.feedback = String(error?.error?.message ?? 'Feed discovery failed.');
      },
    });
  }

  useCandidate(candidate: StudioFeedCandidate): void {
    this.form.url = candidate.url;
    this.form.domain = this.discoveredHostname || this.form.domain;
    this.form.type = candidate.type === 'atom' ? 'atom' : candidate.type === 'sitemap' || candidate.type === 'news_sitemap' ? 'sitemap' : 'rss';
    this.form.discoveryMethod = candidate.method;
    this.toast.success(`Endpoint selected: ${candidate.url}`);
  }

  testDraft(): void {
    if (!this.form.url.trim() || this.form.type === 'manual') {
      return;
    }
    this.testingDraft = true;
    let configuration: Record<string, unknown> | undefined;
    if (this.form.configurationText.trim()) {
      try {
        configuration = JSON.parse(this.form.configurationText) as Record<string, unknown>;
      } catch {
        this.feedback = 'Configuration must be valid JSON before testing.';
        this.testingDraft = false;
        return;
      }
    }
    this.api.testSourceDraft(this.form.type, this.form.url.trim(), configuration).subscribe({
      next: (result) => {
        this.testingDraft = false;
        this.draftTest = result;
        if (!result.ok) {
          this.feedback = String(result.message ?? 'Test failed.');
        }
      },
      error: (error) => {
        this.testingDraft = false;
        this.draftTest = { ok: false, message: String(error?.error?.message ?? 'Test failed.') };
      },
    });
  }

  // ── Bulk operations ──────────────────────────────────────────────────

  allSelected(): boolean {
    return this.sources.length > 0 && this.sources.every((source) => this.selected.has(source.id));
  }

  // ── Source detail & runs ─────────────────────────────────────────────

  // ── Source packs ─────────────────────────────────────────────────────

  loadPacks(): void {
    this.api.listSourcePacks().subscribe({
      next: (response) => {
        this.packs = response.items;
      },
      error: () => {
        this.packs = [];
      },
    });
  }

  importPack(packKey: string): void {
    this.importingPack = packKey;
    this.api.importSourcePack(packKey, this.importEnabled, this.importWithProviders).subscribe({
      next: (result) => {
        this.importingPack = '';
        this.toast.success(`Pack imported: ${result.imported} sources, ${result.skipped} skipped, ${result.failed} failed.`);
        if (result.errors.length > 0) {
          this.feedback = result.errors.join('; ');
        }
        this.loadPacks();
        this.loadProviders();
      },
      error: (error) => {
        this.importingPack = '';
        this.feedback = String(error?.error?.message ?? 'Import failed.');
      },
    });
  }

  // ── Enrichment providers ─────────────────────────────────────────────

  loadProviders(): void {
    this.api.listEnrichmentProviders(1, 50).subscribe({
      next: (response) => {
        this.providers = response.items;
      },
      error: () => {
        this.providers = [];
      },
    });
  }

  addProvider(): void {
    if (!this.providerForm.key.trim() || !this.providerForm.name.trim() || !this.providerForm.providerType.trim()) {
      this.feedback = 'Key, name and provider type are required.';
      return;
    }
    this.savingProvider = true;
    this.api.createEnrichmentProvider({
      key: this.providerForm.key.trim(),
      name: this.providerForm.name.trim(),
      providerType: this.providerForm.providerType.trim(),
      baseUrl: this.providerForm.baseUrl.trim() || undefined,
      endpoint: this.providerForm.endpoint.trim() || undefined,
      credentialsRef: this.providerForm.credentialsRef.trim() || undefined,
    }).subscribe({
      next: () => {
        this.savingProvider = false;
        this.providerForm = { key: '', name: '', providerType: '', baseUrl: '', endpoint: '', credentialsRef: '' };
        this.toast.success('Enrichment provider added.');
        this.loadProviders();
      },
      error: (error) => {
        this.savingProvider = false;
        this.feedback = String(error?.error?.message ?? 'Could not add provider.');
      },
    });
  }

  testProvider(provider: StudioEnrichmentProvider): void {
    this.testingProvider = provider.id;
    this.providerTestResult = '';
    this.api.testEnrichmentProvider(provider.id).subscribe({
      next: (result) => {
        this.testingProvider = '';
        const credentialNote = result.credentialsConfigured ? 'credentials configured' : 'credentials NOT configured';
        this.providerTestResult = result.ok
          ? `OK (HTTP ${result.status ?? '?'}, ${result.itemCount ?? 0} items, ${credentialNote}). Sample: ${(result.sample ?? []).map((item) => String(item['title'] ?? '')).join(' | ')}`
          : `Failed (${credentialNote}): ${result.message ?? 'unknown error'}`;
        this.loadProviders();
      },
      error: (error) => {
        this.testingProvider = '';
        this.providerTestResult = String(error?.error?.message ?? 'Provider test failed.');
      },
    });
  }

  toggleProvider(provider: StudioEnrichmentProvider): void {
    this.api.updateEnrichmentProvider(provider.id, { enabled: !provider.enabled }).subscribe({
      next: () => {
        this.toast.success(provider.enabled ? 'Provider disabled.' : 'Provider enabled.');
        this.loadProviders();
      },
      error: (error) => {
        this.feedback = String(error?.error?.message ?? 'Update failed.');
      },
    });
  }

  removeProvider(provider: StudioEnrichmentProvider): void {
    void this.confirm.confirm({
      title: `Delete enrichment provider "${provider.name}"?`,
      message: 'Enrichment lookups through this provider stop immediately.',
      confirmLabel: 'Delete provider',
      danger: true,
    }).then((confirmed) => {
      if (!confirmed) {
        return;
      }
      this.api.deleteEnrichmentProvider(provider.id).subscribe({
        next: () => {
          this.toast.success('Provider deleted.');
          this.loadProviders();
        },
        error: (error) => {
          this.feedback = String(error?.error?.message ?? 'Delete failed.');
        },
      });
    });
  }

  // ── Health presentation ──────────────────────────────────────────────

  dateLabel(value: unknown): string {
    if (!value) {
      return '—';
    }
    return new Date(String(value)).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  categoriesLabel(item: Record<string, unknown>): string {
    const categories = item['categories'];
    return Array.isArray(categories) ? (categories as string[]).join(', ') : '';
  }
}
