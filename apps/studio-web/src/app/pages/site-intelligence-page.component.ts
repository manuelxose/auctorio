import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { StudioApiService } from '../services/studio-api.service';
import { AppContextService } from '../services/app-context.service';
import { ToastService } from '../services/toast.service';
import { AppIconComponent } from '../components/ui/app-icon.component';
import { AppEmptyStateComponent } from '../components/ui/app-empty-state.component';
import { OnboardingTimelineComponent } from '../components/intelligence/onboarding-timeline.component';
import { IntelligenceApiService } from '../services/intelligence-api.service';
import { EditorialContextService } from '../services/editorial-context.service';
import { ActivatedRoute, RouterLink } from '@angular/router';
import type { ClusterCoverage, Provenance, StrategyConfig, StrategyField, StrategyLayers, StrategyPillar, StrategyVersion } from '../models/intelligence.models';
import type { SiteIndexedPageRow, SiteIntelligenceOverview, StudioSite } from '../models/studio.models';

const STYLES = `
  .tabs { display: flex; gap: 4px; flex-wrap: wrap; border-bottom: 1px solid var(--au-border); margin-bottom: 16px; }
  .tab { background: none; border: 0; padding: 10px 14px; cursor: pointer; font: inherit; color: var(--au-text-muted, inherit); border-bottom: 2px solid transparent; }
  .tab[aria-selected='true'] { color: var(--au-text, inherit); border-bottom-color: var(--au-brand, currentColor); font-weight: 600; }
  .tab:focus-visible { outline: 2px solid var(--au-brand, currentColor); outline-offset: 2px; }
  .form-grid { display: grid; gap: 14px; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); }
  .field label { display: flex; justify-content: space-between; align-items: center; gap: 8px; font-weight: 600; margin-bottom: 4px; }
  .field textarea { width: 100%; box-sizing: border-box; }
  .src { font-size: 0.72rem; padding: 1px 8px; border-radius: 999px; border: 1px solid var(--au-border); font-weight: 500; }
  .src--approved { color: var(--au-success, inherit); border-color: currentColor; }
  .src--suggested { color: var(--au-warning, inherit); border-color: currentColor; }
  .savebar { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; padding-top: 12px; border-top: 1px solid var(--au-border); margin-top: 16px; }
  .pillar { border: 1px solid var(--au-border); border-radius: 10px; padding: 14px; display: grid; gap: 10px; }
  .pillar--off { opacity: 0.65; }
  .pillar__head { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; justify-content: space-between; }
  .pill-row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
  .pillars { display: grid; gap: 12px; }
  .cov { margin: 0; padding-left: 18px; }
  .group { border: 0; padding: 0; margin: 0 0 var(--au-s5, 20px); min-width: 0; }
  .group legend { padding: 0; font-weight: 600; }
  .group__hint { margin: 2px 0 10px; }
  .summary { grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); }
  .detected { display: grid; gap: 16px 24px; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); }
`;

const FIELD_GROUPS: Array<{ title: string; hint: string; keys: StrategyField[] }> = [
  { title: 'Identity & audience', hint: 'Who the site is for and where it is read.', keys: ['description', 'primaryAudience', 'languages', 'markets'] },
  { title: 'Voice & boundaries', hint: 'How articles sound and what they never cover.', keys: ['writingStyle', 'preferredFormats', 'excludedTopics', 'editorialRestrictions'] },
  { title: 'Search strategy', hint: 'What each article should rank for and how it links.', keys: ['priorityCategories', 'searchIntents', 'seoObjectives', 'internalLinkingRules'] },
  { title: 'Sources & cadence', hint: 'Where facts come from and how often to publish.', keys: ['sourcePolicy', 'cadenceNotes'] },
];

const FIELDS: Array<{ key: StrategyField; label: string; kind: 'text' | 'list' }> = [
  { key: 'description', label: 'Site description', kind: 'text' },
  { key: 'primaryAudience', label: 'Audience', kind: 'text' },
  { key: 'languages', label: 'Languages', kind: 'list' },
  { key: 'markets', label: 'Markets', kind: 'list' },
  { key: 'priorityCategories', label: 'Priority categories', kind: 'list' },
  { key: 'excludedTopics', label: 'Excluded topics', kind: 'list' },
  { key: 'writingStyle', label: 'Style and tone', kind: 'text' },
  { key: 'preferredFormats', label: 'Formats', kind: 'list' },
  { key: 'searchIntents', label: 'Intent strategy', kind: 'list' },
  { key: 'seoObjectives', label: 'SEO objectives', kind: 'list' },
  { key: 'sourcePolicy', label: 'Source policy', kind: 'text' },
  { key: 'cadenceNotes', label: 'Cadence notes', kind: 'text' },
  { key: 'editorialRestrictions', label: 'Restrictions', kind: 'list' },
  { key: 'internalLinkingRules', label: 'Internal-linking rules', kind: 'list' },
];

@Component({
  selector: 'app-site-intelligence-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, AppIconComponent, AppEmptyStateComponent, OnboardingTimelineComponent],
  styles: [STYLES],
  template: `
    <section class="au-page">
      <header class="au-page__header">
        <div>
          <p class="au-page__eyebrow">{{ overview?.site?.name || 'Understand the site' }}<span *ngIf="host"> · {{ host }}</span></p>
          <h1 class="au-page__title">Site intelligence</h1>
          <p class="au-page__subtitle">What Auctorio learned from your pages, and the strategy every plan and article follows.</p>
        </div>
        <div class="au-page__actions">
          <button class="au-btn au-btn--ghost" type="button" [disabled]="busy" (click)="crawlChanged()" title="Only pages added or changed since the last read">
            <app-icon name="refresh"></app-icon>
            Crawl changes
          </button>
          <button class="au-btn au-btn--primary" type="button" [disabled]="busy" (click)="indexSite()">
            <app-icon name="scan"></app-icon>
            {{ busy ? 'Reading the site…' : 'Read the whole site' }}
          </button>
        </div>
      </header>

      <div class="au-banner au-banner--error" *ngIf="loadError" role="alert">
        <app-icon name="warning"></app-icon>
        <span class="au-banner__text">{{ loadError }}</span>
        <button class="au-banner__action" type="button" (click)="load()">Retry</button>
      </div>

      <!-- Summary: same on every tab -->
      <ng-container *ngIf="overview">
        <div class="au-stat-row summary au-mb-3" aria-label="Site summary">
          <div class="au-stat">
            <span class="au-stat__value">{{ overview.extractedPages }}<span class="au-muted"> / {{ overview.totalPages }}</span></span>
            <span class="au-stat__label">Pages read / found</span>
          </div>
          <div class="au-stat">
            <span class="au-stat__value">{{ overview.profile?.topicClusters?.length ?? 0 }}</span>
            <span class="au-stat__label">Topic clusters</span>
          </div>
          <div class="au-stat" [class.is-alert]="healthySitemaps < overview.sitemaps.length">
            <span class="au-stat__value">{{ healthySitemaps }}/{{ overview.sitemaps.length }}</span>
            <span class="au-stat__label">Healthy sitemaps</span>
          </div>
          <div class="au-stat">
            <span class="au-stat__value">{{ busy ? 'Now' : overview.lastRun ? (overview.lastRun | date: 'd MMM') : 'Never' }}</span>
            <span class="au-stat__label">{{ busy ? 'Reading the site' : overview.lastRun ? 'Last read · ' + (overview.lastRun | date: 'HH:mm') : 'Last read' }}</span>
          </div>
        </div>
        <div class="au-banner au-banner--warning au-mb-3" *ngIf="overview.profile?.warnings?.length">
          <app-icon name="warning"></app-icon>
          <span class="au-banner__text">{{ overview.profile?.warnings?.join(' · ') }}</span>
        </div>
      </ng-container>

      <nav class="tabs" role="tablist" aria-label="Site intelligence sections">
        <button class="tab" type="button" role="tab" *ngFor="let t of tabs" [attr.aria-selected]="tab === t.id" (click)="tab = t.id">{{ t.label }}</button>
      </nav>

      <!-- Profile: what was detected (read-only) first, then the strategy you approve -->
      <section class="au-panel au-panel--padded au-mb-3" *ngIf="tab === 'coverage'">
        <h2 class="au-panel__title">What was actually read</h2>
        <ng-container *ngIf="overview?.evidence as ev; else noEvidence">
          <p>{{ ev.discovered }} URLs found in sitemaps · {{ ev.fetched }} fetched · {{ ev.extracted }} analysed · {{ ev.failed }} failed · {{ ev.skipped }} skipped</p>
          <p class="au-muted">Counts come from sitemap discovery and our own crawl. They say nothing about Google indexation; connect Search Console for that.</p>
          <table class="au-table">
            <thead><tr><th>Section</th><th>Analysed</th><th>Found</th></tr></thead>
            <tbody>
              <tr *ngFor="let s of ev.sections"><td>/{{ s.family === '/' ? '' : s.family }}</td><td>{{ s.extracted }}</td><td>{{ s.discovered }}</td></tr>
            </tbody>
          </table>
        </ng-container>
        <ng-template #noEvidence><p class="au-muted">No crawl yet. Read the site from Crawl health to see coverage.</p></ng-template>
      </section>

      <section class="au-panel au-panel--padded au-mb-3" *ngIf="tab === 'profile' && overview?.profile as p">
        <h2 class="au-panel__title">What Auctorio detected</h2>
        <div class="detected au-mt-2">
          <div>
            <p>{{ p.brandSummary || 'No summary yet. Read the whole site to build one.' }}</p>
            <div class="au-chips au-mt-2" aria-label="Main topics">
              <span class="au-chip au-chip--brand" *ngFor="let topic of p.mainTopics">{{ topic }}</span>
            </div>
            <div class="au-field-grid au-mt-3" *ngIf="topicGroups.length">
              <div class="au-meta" *ngFor="let g of topicGroups">
                <strong>{{ g.label }}</strong>
                <p class="au-muted">{{ g.items.join(', ') }}</p>
              </div>
            </div>
          </div>
          <dl class="au-detail-grid">
            <dt>Audience</dt><dd>{{ p.detectedAudience || '—' }}</dd>
            <dt>Language</dt><dd>{{ p.detectedLanguage || '—' }}</dd>
            <dt>Tone</dt><dd>{{ p.editorialTone || '—' }}</dd>
            <dt>Site type</dt><dd>{{ p.detectedSiteType || '—' }}</dd>
            <dt>Typical article</dt><dd>{{ p.commonArticleLength ? p.commonArticleLength + ' words' : '—' }}</dd>
            <dt>Confidence</dt><dd>{{ p.confidence !== null ? (p.confidence * 100 | number: '1.0-0') + '%' : '—' }}</dd>
          </dl>
        </div>
      </section>

      <section class="au-panel au-panel--padded au-mb-3" *ngIf="tab === 'profile' && draft">
        <h2 class="au-panel__title">Editorial strategy</h2>
        <p class="au-muted">Detected values come from your pages, Suggested values are drafts, Approved values are yours. Saving creates a new version; reading the site again never overwrites approved values.</p>
        <div class="au-banner au-banner--info au-mt-2" *ngIf="layers && !layers.approved">
          <app-icon name="info"></app-icon>
          <span class="au-banner__text">Nothing is approved yet. Planning uses the suggested values below until you save.</span>
        </div>
        <fieldset class="group au-mt-3" *ngFor="let g of fieldGroups">
          <legend>{{ g.title }}</legend>
          <p class="group__hint au-muted">{{ g.hint }}</p>
          <div class="form-grid">
            <div class="field" *ngFor="let f of g.fields">
              <label [attr.for]="'f-' + f.key">{{ f.label }} <span class="src" [ngClass]="'src--' + source(f.key)">{{ sourceLabel(f.key) }}</span></label>
              <textarea *ngIf="f.kind === 'text'" class="au-input" rows="3" [id]="'f-' + f.key" [ngModel]="$any(draft)[f.key] ?? ''" (ngModelChange)="setText(f.key, $event)"></textarea>
              <textarea *ngIf="f.kind === 'list'" class="au-input" rows="3" [id]="'f-' + f.key" [ngModel]="csv($any(draft)[f.key])" (ngModelChange)="setList(f.key, $event)" placeholder="Comma or line separated"></textarea>
            </div>
          </div>
        </fieldset>
        <div class="savebar">
          <input class="au-input" type="text" [(ngModel)]="note" placeholder="Version note (optional)" aria-label="Version note" />
          <button class="au-btn au-btn--primary" type="button" [disabled]="saving" (click)="save()">{{ saving ? 'Saving…' : 'Save as new version' }}</button>
          <button class="au-btn au-btn--ghost" type="button" [disabled]="saving" (click)="resetDraft()">Discard edits</button>
          <button class="au-btn au-btn--secondary" type="button" [disabled]="saving" (click)="regenerate()">Refresh suggestions</button>
          <span class="au-muted" *ngIf="layers?.approved">Approved v{{ layers?.approved?.version }}</span>
          <span class="au-muted" *ngIf="layers?.suggested">Suggestions: {{ layers?.suggested?.source }}</span>
        </div>
        <p class="au-error" *ngIf="strategyError">{{ strategyError }}</p>

        <details class="au-mt-3" (toggle)="loadVersions()">
          <summary>Version history</summary>
          <p class="au-muted" *ngIf="versions.length === 0">No saved versions yet.</p>
          <ul class="cov au-mt-2">
            <li *ngFor="let v of versions">
              v{{ v.version }} · {{ v.createdAt | date: 'medium' }}<span *ngIf="v.note"> · {{ v.note }}</span><span *ngIf="v.restoredFromVersion"> · restored from v{{ v.restoredFromVersion }}</span>
              <button class="au-btn au-btn--ghost au-btn--sm" type="button" [disabled]="saving" (click)="restore(v.version)">Restore</button>
            </li>
          </ul>
        </details>
      </section>

      <!-- Pillars & clusters -->
      <section class="au-panel au-panel--padded au-mb-3" *ngIf="tab === 'pillars' && draft">
        <h2 class="au-panel__title">Pillars &amp; clusters</h2>
        <p class="au-muted">Excluded pillars and topics are rejected from editorial plans after generation.</p>
        <div class="pillars au-mt-2">
          <article class="pillar" *ngFor="let p of draft.pillars; let i = index" [class.pillar--off]="!p.included">
            <div class="pillar__head">
              <input class="au-input" type="text" [(ngModel)]="p.name" [attr.aria-label]="'Pillar name ' + (i + 1)" />
              <span class="src" [ngClass]="'src--' + (layers?.pillarProvenance?.[i] ?? 'approved')">{{ pillarLabel(i) }}</span>
            </div>
            <textarea class="au-input" rows="2" [(ngModel)]="p.description" placeholder="Description" aria-label="Pillar description"></textarea>
            <textarea class="au-input" rows="2" [ngModel]="csv(p.subtopics)" (ngModelChange)="p.subtopics = split($event)" placeholder="Subtopics, comma separated" aria-label="Pillar subtopics"></textarea>
            <div class="pill-row">
              <label>Weight <input class="au-input" type="number" min="0" max="10" step="1" [(ngModel)]="p.weight" style="width: 80px" /></label>
              <label><input type="checkbox" [(ngModel)]="p.included" /> Include in planning</label>
              <button class="au-btn au-btn--ghost au-btn--sm" type="button" (click)="investigate(p)" [disabled]="!p.clusterSlug" [title]="p.clusterSlug ? '' : 'Not linked to a detected cluster'">Site pages &amp; gaps</button>
              <a class="au-btn au-btn--secondary au-btn--sm" routerLink="/studio/editorial-plan" [queryParams]="{ pillar: p.name }">Generate proposals</a>
              <button class="au-btn au-btn--ghost au-btn--sm" type="button" (click)="removePillar(i)">Remove</button>
            </div>
            <div *ngIf="coverage && coverageFor === p.clusterSlug" class="au-meta">
              <strong>{{ coverage.cluster.pagesCount }} site pages · subtopics from {{ coverage.subtopicSource }}</strong>
              <ul class="cov">
                <li *ngFor="let c of coverage.coverage">{{ c.subtopic }}: {{ c.pagesCovering }} page(s)</li>
              </ul>
              <p class="au-muted" *ngIf="coverage.gaps.length">Gaps: {{ coverage.gaps.join(', ') }}</p>
              <p class="au-muted" *ngIf="!coverage.gaps.length && coverage.coverage.length">No uncovered subtopics.</p>
              <ul class="cov"><li *ngFor="let pg of coverage.pages.slice(0, 8)"><a [href]="pg.url" target="_blank" rel="noopener">{{ pg.title || pg.url }}</a></li></ul>
            </div>
          </article>
        </div>
        <p class="au-muted au-mt-2" *ngIf="draft.pillars.length === 0">No pillars yet. Index the website or add one.</p>
        <div class="pill-row au-mt-2">
          <button class="au-btn au-btn--secondary au-btn--sm" type="button" (click)="addPillar()">Add pillar</button>
          <button class="au-btn au-btn--ghost au-btn--sm" type="button" *ngFor="let c of unlinkedClusters" (click)="addPillar(c.name, c.slug, c.keywords)">+ {{ c.name }} ({{ c.pagesCount }})</button>
        </div>
        <div class="savebar">
          <button class="au-btn au-btn--primary" type="button" [disabled]="saving" (click)="save()">{{ saving ? 'Saving…' : 'Save as new version' }}</button>
          <button class="au-btn au-btn--ghost" type="button" [disabled]="saving" (click)="resetDraft()">Discard edits</button>
        </div>
        <p class="au-error" *ngIf="strategyError">{{ strategyError }}</p>
      </section>

      <ng-container *ngIf="overview">
        <!-- Sitemaps -->
        <section class="au-panel au-mb-3" *ngIf="tab === 'health'">
          <header class="au-panel__header">
            <h2 class="au-panel__title">Sitemaps</h2>
            <span class="au-badge au-badge--neutral">{{ overview.sitemaps.length }}</span>
          </header>
          <div class="au-table-wrap au-table-wrap--scrollable">
            <table class="au-table">
              <thead>
                <tr><th>URL</th><th>Kind</th><th>Status</th><th>URLs</th><th>Last fetched</th></tr>
              </thead>
              <tbody>
                <tr *ngFor="let sitemap of overview.sitemaps">
                  <td class="au-muted au-ellipsis">{{ sitemap.url }}</td>
                  <td><span class="au-channel">{{ sitemap.kind }}</span></td>
                  <td>
                    <span class="au-badge" [class.au-badge--success]="sitemap.status === 'fetched'" [class.au-badge--danger]="sitemap.status === 'failed' || sitemap.status === 'blocked'" [class.au-badge--neutral]="sitemap.status !== 'fetched' && sitemap.status !== 'failed' && sitemap.status !== 'blocked'">{{ sitemap.status }}</span>
                    <span class="au-table__sub" *ngIf="sitemap.error">{{ sitemap.error }}</span>
                  </td>
                  <td>{{ sitemap.urlCount ?? '—' }}</td>
                  <td class="au-muted">{{ sitemap.lastFetchedAt ? (sitemap.lastFetchedAt | date: 'medium') : '—' }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <!-- Setup run: the one-off onboarding (read → profile → sources → competitors → strategy) -->
        <details class="au-panel au-panel--padded au-mb-3" *ngIf="tab === 'health' && selectedSiteId">
          <summary>Setup run</summary>
          <app-onboarding-timeline class="au-mt-2" [siteId]="selectedSiteId" [allowStart]="true"></app-onboarding-timeline>
        </details>

        <!-- Indexed pages -->
        <section class="au-panel" *ngIf="tab === 'inventory'">
          <header class="au-panel__header">
            <h2 class="au-panel__title">Discovered pages <span class="au-muted">(from sitemap; not Google-indexed)</span></h2>
            <span class="au-badge au-badge--neutral">{{ pagesTotal }}</span>
          </header>
          <div class="au-toolbar au-toolbar--panel">
            <div class="au-search">
              <app-icon name="search"></app-icon>
              <input class="au-input au-input--search" type="search" placeholder="Search URL or title…" [(ngModel)]="pageQuery" (keyup.enter)="loadPages()" />
            </div>
            <select class="au-select au-filter-select" [(ngModel)]="pageCrawlState" (ngModelChange)="loadPages()" aria-label="Filter by crawl state">
              <option value="">All states</option>
              <option value="extracted">Extracted</option>
              <option value="discovered">Discovered</option>
              <option value="stale">Stale</option>
              <option value="failed">Failed</option>
              <option value="skipped">Skipped</option>
            </select>
            <button class="au-btn au-btn--ghost au-btn--sm" type="button" (click)="loadPages()">Apply</button>
          </div>
          <div class="au-table-wrap au-table-wrap--scrollable">
            <table class="au-table">
              <thead>
                <tr><th>URL</th><th>Title</th><th>Type</th><th>Words</th><th>State</th><th>Last indexed</th></tr>
              </thead>
              <tbody>
                <tr *ngFor="let page of pages">
                  <td class="au-muted au-ellipsis">{{ page.url }}</td>
                  <td><span class="au-table__title">{{ page.title || '—' }}</span></td>
                  <td><span class="au-channel">{{ page.contentType || '—' }}</span></td>
                  <td>{{ page.wordCount ?? '—' }}</td>
                  <td><span class="au-badge" [class.au-badge--success]="page.crawlState === 'extracted'" [class.au-badge--danger]="page.crawlState === 'failed'" [class.au-badge--neutral]="page.crawlState !== 'extracted' && page.crawlState !== 'failed'">{{ page.crawlState }}</span></td>
                  <td class="au-muted">{{ page.lastIndexedAt ? (page.lastIndexedAt | date: 'medium') : '—' }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="au-pagination" *ngIf="pagesTotal > 25">
            <button class="au-btn au-btn--ghost au-btn--sm" type="button" [disabled]="page <= 1" (click)="goPage(page - 1)">Previous</button>
            <span class="au-muted">Page {{ page }}</span>
            <button class="au-btn au-btn--ghost au-btn--sm" type="button" [disabled]="page * 25 >= pagesTotal" (click)="goPage(page + 1)">Next</button>
          </div>
        </section>
      </ng-container>

      <app-empty-state
        *ngIf="!loading && !overview && !loadError"
        icon="scan"
        title="No site intelligence yet"
        text="Read the whole site to crawl its sitemaps, understand its content and build the site profile."
      ></app-empty-state>
    </section>
  `,
})
export class SiteIntelligencePageComponent implements OnInit {
  private readonly api = inject(StudioApiService);
  private readonly appContext = inject(AppContextService);
  private readonly toast = inject(ToastService);
  private readonly intel = inject(IntelligenceApiService);
  private readonly editorialContext = inject(EditorialContextService);
  readonly tabs: Array<{ id: string; label: string }> = [
    { id: 'profile', label: 'Profile & audience' },
    { id: 'pillars', label: 'Pillars & clusters' },
    { id: 'coverage', label: 'Coverage' },
    { id: 'inventory', label: 'Pages' },
    { id: 'health', label: 'Crawl health' },
  ];
  readonly fieldGroups = FIELD_GROUPS.map((g) => ({ ...g, fields: FIELDS.filter((f) => g.keys.includes(f.key)) }));
  // ?tab= deep-links a section, e.g. Overview "Read the site again" opens Crawl health; the old Onboarding tab lives there now.
  private readonly requestedTab = inject(ActivatedRoute, { optional: true })?.snapshot.queryParamMap.get('tab');
  tab = this.requestedTab === 'onboarding' ? 'health' : (this.tabs.find((t) => t.id === this.requestedTab)?.id ?? 'profile');
  layers: StrategyLayers | null = null;
  draft: StrategyConfig | null = null;
  versions: StrategyVersion[] = [];
  note = '';
  saving = false;
  strategyError = '';
  coverage: ClusterCoverage | null = null;
  coverageFor: string | null = null;

  csv(value: unknown): string {
    return Array.isArray(value) ? value.join(', ') : '';
  }
  split(text: string): string[] {
    return text.split(/[,\n]/).map((v) => v.trim()).filter(Boolean);
  }
  setText(key: StrategyField, value: string): void {
    (this.draft as unknown as Record<string, unknown>)[key] = value.trim() ? value : null;
  }
  setList(key: StrategyField, value: string): void {
    (this.draft as unknown as Record<string, unknown>)[key] = this.split(value);
  }
  source(key: StrategyField): string {
    const p = this.layers?.provenance[key];
    return !p || p === 'none' ? 'detected' : p;
  }
  sourceLabel(key: StrategyField): string {
    const s = this.source(key);
    return s === 'approved' ? 'Approved' : s === 'suggested' ? 'Suggested' : 'Detected';
  }
  pillarLabel(i: number): string {
    const p: Provenance | undefined = this.layers?.pillarProvenance?.[i];
    return p === 'approved' ? 'Approved' : p === 'suggested' ? 'Suggested' : 'New (unsaved)';
  }
  get unlinkedClusters() {
    const linked = new Set((this.draft?.pillars ?? []).map((p) => p.clusterSlug));
    return (this.layers?.detected?.clusters ?? []).filter((c) => !linked.has(c.slug)).slice(0, 12);
  }

  loadStrategy(): void {
    this.layers = null;
    this.draft = null;
    this.coverage = null;
    if (!this.selectedSiteId) return;
    this.intel.getStrategy(this.selectedSiteId).subscribe({
      next: (layers) => this.applyLayers(layers),
      error: () => (this.strategyError = 'The editorial strategy could not be loaded.'),
    });
  }
  private applyLayers(layers: StrategyLayers): void {
    this.layers = layers;
    this.resetDraft();
  }
  resetDraft(): void {
    this.draft = this.layers ? structuredClone(this.layers.effective) : null;
    this.strategyError = '';
  }
  save(): void {
    if (!this.draft || this.saving) return;
    this.saving = true;
    this.strategyError = '';
    this.intel.saveStrategy(this.selectedSiteId, this.draft, this.note || undefined).subscribe({
      next: (res) => {
        this.saving = false;
        this.note = '';
        this.versions = [];
        this.applyLayers(res.layers);
        this.toast.success('Strategy saved as version ' + res.version + '.');
      },
      error: (err) => {
        this.saving = false;
        this.strategyError = err?.error?.error?.message || 'The strategy could not be saved.';
      },
    });
  }
  regenerate(): void {
    this.saving = true;
    this.intel.regenerateSuggestion(this.selectedSiteId).subscribe({
      next: (res) => {
        this.saving = false;
        this.applyLayers(res.layers);
        this.toast.success(res.generated ? 'Suggestions refreshed (' + res.source + '). Approved values were kept.' : 'No site profile yet; index the website first.');
      },
      error: () => {
        this.saving = false;
        this.strategyError = 'Suggestions could not be refreshed.';
      },
    });
  }
  loadVersions(): void {
    if (!this.selectedSiteId || this.versions.length) return;
    this.intel.listVersions(this.selectedSiteId).subscribe({ next: (r) => (this.versions = r.items) });
  }
  restore(version: number): void {
    this.saving = true;
    this.intel.restoreVersion(this.selectedSiteId, version).subscribe({
      next: (res) => {
        this.saving = false;
        this.versions = [];
        this.applyLayers(res.layers);
        this.toast.success('Restored version ' + version + ' as version ' + res.version + '.');
      },
      error: () => {
        this.saving = false;
        this.strategyError = 'That version could not be restored.';
      },
    });
  }
  addPillar(name = '', clusterSlug: string | null = null, keywords: string[] = []): void {
    const pillar: StrategyPillar = { name, description: null, subtopics: [], keywords, weight: 1, included: true, clusterSlug };
    this.draft?.pillars.push(pillar);
  }
  removePillar(i: number): void {
    this.draft?.pillars.splice(i, 1);
  }
  investigate(p: StrategyPillar): void {
    if (!p.clusterSlug) return;
    const slug = p.clusterSlug;
    this.intel.getClusterCoverage(this.selectedSiteId, slug).subscribe({
      next: (c) => {
        this.coverage = c;
        this.coverageFor = slug;
      },
      error: () => this.toast.error('Coverage could not be loaded.'),
    });
  }
  /** Always the top bar active site; the shell re-creates the page when it changes. */
  selectedSiteId = '';
  overview: SiteIntelligenceOverview | null = null;
  loading = true;
  indexing = false;
  loadError = '';
  pages: SiteIndexedPageRow[] = [];
  pagesTotal = 0;
  page = 1;
  pageQuery = '';
  pageCrawlState = '';

  /** A crawl started here, or one already running server-side (e.g. from onboarding). */
  get busy(): boolean {
    return this.indexing || Boolean(this.overview?.indexing);
  }

  get host(): string {
    try {
      return this.overview?.site.baseUrl ? new URL(this.overview.site.baseUrl).hostname : '';
    } catch {
      return '';
    }
  }

  /** Only the topic groups the crawl actually filled; a TV guide has no "commercial" group to show. */
  get topicGroups(): Array<{ label: string; items: string[] }> {
    const p = this.overview?.profile;
    if (!p) return [];
    return [
      { label: 'Evergreen', items: p.evergreenTopics },
      { label: 'News', items: p.newsTopics },
      { label: 'Commercial', items: p.commercialTopics },
      { label: 'Sports', items: p.sportsTopics },
    ].filter((g) => g.items?.length);
  }

  get healthySitemaps(): number {
    return this.overview?.sitemaps.filter((sitemap) => sitemap.status === 'fetched').length ?? 0;
  }

  ngOnInit(): void {
    this.selectedSiteId = this.appContext.activeSite()?.id ?? '';
    this.load();
  }

  load(): void {
    if (!this.selectedSiteId) {
      this.loading = false;
      return;
    }
    this.loading = true;
    this.loadError = '';
    this.editorialContext.update({ area: 'intelligence', siteId: this.selectedSiteId });
    this.loadStrategy();
    this.api.getSiteIntelligence(this.selectedSiteId).subscribe({
      next: (overview) => {
        this.overview = overview;
        this.indexing = false; // from here the server's overview.indexing tells whether the crawl still runs
        this.loading = false;
        this.loadPages();
      },
      error: () => {
        this.loadError = 'Site intelligence could not be loaded. Try again.';
        this.loading = false;
      },
    });
  }

  loadPages(): void {
    if (!this.selectedSiteId) return;
    this.api.listSiteIntelligencePages(this.selectedSiteId, { q: this.pageQuery || undefined, crawlState: this.pageCrawlState || undefined, page: this.page, pageSize: 25 }).subscribe({
      next: (response) => {
        this.pages = response.items;
        this.pagesTotal = response.total;
      },
      error: () => {
        this.loadError = 'Indexed pages could not be loaded.';
      },
    });
  }

  goPage(target: number): void {
    this.page = target;
    this.loadPages();
  }

  indexSite(): void {
    if (!this.selectedSiteId || this.indexing) return;
    this.indexing = true;
    this.api.indexSite(this.selectedSiteId, {}).subscribe({
      next: () => {
        this.toast.success('Site indexing started. The workspace stays responsive while it runs.');
        setTimeout(() => this.load(), 2500);
      },
      error: (err) => {
        this.indexing = false;
        this.loadError = err?.error?.error?.message || 'Indexing could not be started.';
      },
    });
  }

  crawlChanged(): void {
    if (!this.selectedSiteId || this.indexing) return;
    this.indexing = true;
    this.api.indexSite(this.selectedSiteId, { crawl: true, changedOnly: true }).subscribe({
      next: () => {
        this.toast.success('Changed-page crawl started.');
        setTimeout(() => this.load(), 2500);
      },
      error: (err) => {
        this.indexing = false;
        this.loadError = err?.error?.error?.message || 'Crawl could not be started.';
      },
    });
  }
}
