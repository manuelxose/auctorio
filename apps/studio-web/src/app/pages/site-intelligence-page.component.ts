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
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { sectionFor } from '../layout/studio-nav';
import type { ClusterCoverage, Provenance, StrategyConfig, StrategyField, StrategyLayers, StrategyPillar, StrategyVersion } from '../models/intelligence.models';
import type { SiteIndexedPageRow, SiteIntelligenceOverview, StudioSite } from '../models/studio.models';

const STYLES = `
  .summary { display: flex; flex-wrap: wrap; gap: 4px 20px; margin: 0 0 var(--au-s4, 16px); color: var(--au-muted); font-size: var(--au-fs-body-sm); }
  .summary strong { color: var(--au-text); font-variant-numeric: tabular-nums; }
  .summary a { color: inherit; text-decoration: none; }
  .summary a:hover { text-decoration: underline; }
  .summary .is-alert, .summary .is-alert strong { color: var(--au-danger, #b42318); }
  .summary__live { color: var(--au-accent); font-weight: 600; }
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
  .howto { margin: 0; padding-left: 18px; display: grid; gap: 4px; font-size: var(--au-fs-body-sm); color: var(--au-muted); }
  .howto strong { color: var(--au-text); font-weight: 600; }
  .sub-label { font-size: var(--au-fs-caption); color: var(--au-muted); margin-bottom: -6px; }
  .src--none { color: var(--au-muted); }
  .cov { margin: 0; padding-left: 18px; }
  .group { border: 0; padding: 0; margin: 0 0 var(--au-s5, 20px); min-width: 0; }
  .group legend { padding: 0; font-weight: 600; }
  .group__hint { margin: 2px 0 10px; }
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

      <!-- One-line summary, the same in every section; sections are picked in the sidebar -->
      <ng-container *ngIf="overview">
        <p class="summary" aria-label="Site summary">
          <span><strong>{{ overview.extractedPages }}</strong> of {{ overview.totalPages }} pages read</span>
          <span><strong>{{ overview.profile?.topicClusters?.length ?? 0 }}</strong> topic clusters</span>
          <a routerLink="." [queryParams]="{ tab: 'crawl' }" [class.is-alert]="healthySitemaps < overview.sitemaps.length"><strong>{{ healthySitemaps }}/{{ overview.sitemaps.length }}</strong> sitemaps healthy</a>
          <span *ngIf="busy" class="summary__live">Reading the site now…</span>
          <span *ngIf="!busy">Last read {{ overview.lastRun ? (overview.lastRun | date: 'd MMM, HH:mm') : 'never' }}</span>
        </p>
        <div class="au-banner au-banner--warning au-mb-3" *ngIf="overview.profile?.warnings?.length">
          <app-icon name="warning"></app-icon>
          <span class="au-banner__text">{{ overview.profile?.warnings?.join(' · ') }}</span>
        </div>
      </ng-container>

      <section class="au-panel au-panel--padded au-mb-3" *ngIf="tab === 'seo'">
        <h2 class="au-panel__title">On-page signals</h2>
        <ng-container *ngIf="overview?.seoSignals?.length && overview?.evidence?.extracted; else noSeo">
          <p class="au-muted">Measured on the {{ overview?.seoSignals?.[0]?.of }} editorial pages we analysed (legal and utility pages excluded), not the whole site. No rankings, traffic or Google indexation data: connect Search Console for that.</p>
          <table class="au-table">
            <thead><tr><th>Signal</th><th>Pages affected</th><th>Examples</th></tr></thead>
            <tbody>
              <tr *ngFor="let s of overview?.seoSignals">
                <td>{{ s.label }}</td>
                <td>{{ s.count }} of {{ s.of }}</td>
                <td><a *ngFor="let u of s.samples" [href]="u" target="_blank" rel="noopener">{{ u }} </a><span class="au-muted" *ngIf="!s.samples.length">None found</span></td>
              </tr>
            </tbody>
          </table>
        </ng-container>
        <ng-template #noSeo><p class="au-muted">No pages analysed yet. Use "Read the whole site" above to see on-page signals.</p></ng-template>
      </section>

      <!-- Pages & crawl: what was read, sitemaps, the setup run and the page inventory -->
      <section class="au-panel au-panel--padded au-mb-3" *ngIf="tab === 'crawl'">
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
        <ng-template #noEvidence><p class="au-muted">No crawl yet. Use "Read the whole site" above to see coverage.</p></ng-template>
      </section>

      <!-- Profile: what was detected (read-only) first, then the strategy you approve -->
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
        <p class="au-muted">The rules every plan and article follows. Fields marked <span class="src src--suggested">From your site</span> were filled from what Auctorio read; edit anything and save to approve it. Reading the site again never overwrites approved values.</p>
        <div class="au-banner au-banner--info au-mt-2" *ngIf="layers && !layers.approved">
          <app-icon name="info"></app-icon>
          <span class="au-banner__text">Nothing approved yet. Plans already use these values; review them and save to make them yours.</span>
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
          <button class="au-btn au-btn--secondary" type="button" [disabled]="saving" (click)="regenerate()" title="Fill again from the latest read of the site; approved values stay">Refill from site</button>
          <span class="au-muted" *ngIf="layers?.approved">Approved v{{ layers?.approved?.version }}</span>
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

      <!-- Pillars: the main topics plans are built from -->
      <section class="au-panel au-panel--padded au-mb-3" *ngIf="tab === 'pillars' && draft">
        <h2 class="au-panel__title">Content pillars</h2>
        <p class="au-muted">Pillars are the big topics your site writes about. Auctorio found them by grouping your pages by subject. When it generates a plan, it splits the articles between the pillars you include, by their share, and never proposes topics from excluded ones.</p>
        <ul class="howto au-mt-2">
          <li><strong>Include or exclude</strong> a pillar to decide whether plans cover it.</li>
          <li><strong>Share of the plan</strong> sets how many articles each one gets.</li>
          <li><strong>Subtopics</strong> are what articles inside the pillar can be about; missing ones show up below as gaps.</li>
        </ul>
        <div class="pillars au-mt-3">
          <article class="pillar" *ngFor="let p of draft.pillars; let i = index" [class.pillar--off]="!p.included">
            <div class="pillar__head">
              <input class="au-input" type="text" [(ngModel)]="p.name" [attr.aria-label]="'Pillar name ' + (i + 1)" />
              <span class="src" [ngClass]="'src--' + (layers?.pillarProvenance?.[i] ?? 'approved')">{{ pillarLabel(i) }}</span>
            </div>
            <textarea class="au-input" rows="2" [(ngModel)]="p.description" placeholder="What this pillar covers" aria-label="Pillar description"></textarea>
            <label class="sub-label" [attr.for]="'sub-' + i">Subtopics</label>
            <textarea class="au-input" rows="2" [id]="'sub-' + i" [ngModel]="csv(p.subtopics)" (ngModelChange)="p.subtopics = split($event)" placeholder="Comma separated, e.g. series de estreno, horarios"></textarea>
            <div class="pill-row">
              <label><input type="checkbox" [(ngModel)]="p.included" /> Include in plans</label>
              <label>Weight <input class="au-input" type="number" min="0" max="10" step="0.1" [(ngModel)]="p.weight" style="width: 80px" [disabled]="!p.included" /></label>
              <span class="au-muted" *ngIf="p.included">≈ {{ share(p) }}% of the plan</span>
              <button class="au-btn au-btn--ghost au-btn--sm" type="button" (click)="investigate(p)" [disabled]="!p.clusterSlug" [title]="p.clusterSlug ? 'See which of your pages cover it and which subtopics are missing' : 'Not linked to a group of your pages'">Show my pages</button>
              <a class="au-btn au-btn--secondary au-btn--sm" routerLink="/studio/plan" [queryParams]="{ pillar: p.name }">Generate proposals</a>
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
        <p class="au-muted au-mt-2" *ngIf="draft.pillars.length === 0">No pillars yet. Read the whole site so Auctorio can find them, or add one.</p>
        <div class="pill-row au-mt-2">
          <button class="au-btn au-btn--secondary au-btn--sm" type="button" (click)="addPillar()">Add pillar</button>
          <ng-container *ngIf="unlinkedClusters.length">
            <span class="au-muted">Other topics found on your site:</span>
            <button class="au-btn au-btn--ghost au-btn--sm" type="button" *ngFor="let c of unlinkedClusters" (click)="addPillar(c.name, c.slug, c.keywords)" [title]="c.pagesCount + ' pages'">+ {{ c.name }}</button>
          </ng-container>
        </div>
        <div class="savebar">
          <button class="au-btn au-btn--primary" type="button" [disabled]="saving" (click)="save()">{{ saving ? 'Saving…' : 'Save as new version' }}</button>
          <button class="au-btn au-btn--ghost" type="button" [disabled]="saving" (click)="resetDraft()">Discard edits</button>
        </div>
        <p class="au-error" *ngIf="strategyError">{{ strategyError }}</p>
      </section>

      <section class="au-panel au-panel--padded au-mb-3" *ngIf="tab === 'pillars'">
        <h2 class="au-panel__title">Content gaps</h2>
        <ng-container *ngIf="overview?.opportunities?.length; else noOpp">
          <p class="au-muted">Approved pillar subtopics that no analysed page title or H1 mentions. A gap in our sample may not be a gap on the site; confidence follows how much of the site was read. No search volume or difficulty is estimated.</p>
          <table class="au-table">
            <thead><tr><th>Pillar</th><th>Subtopic</th><th>Why</th><th>Confidence</th><th></th></tr></thead>
            <tbody>
              <tr *ngFor="let o of overview?.opportunities">
                <td>{{ o.pillar }}</td>
                <td>{{ o.subtopic }}</td>
                <td>{{ o.reason }}</td>
                <td>{{ o.confidence }}</td>
                <td><a class="au-btn au-btn--secondary au-btn--sm" routerLink="/studio/plan" [queryParams]="{ pillar: o.pillar }">Plan it</a></td>
              </tr>
            </tbody>
          </table>
        </ng-container>
        <ng-template #noOpp>
          <p class="au-muted" *ngIf="overview?.opportunitiesBasis === 'detected-keywords'">No pillars with subtopics are defined yet, so gaps cannot be detected. Add subtopics to the pillars above.</p>
          <p class="au-muted" *ngIf="overview?.opportunitiesBasis !== 'detected-keywords'">No uncovered subtopics found in the pages analysed so far.</p>
        </ng-template>
      </section>

      <ng-container *ngIf="overview">
        <!-- Sitemaps -->
        <section class="au-panel au-mb-3" *ngIf="tab === 'crawl'">
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
        <details class="au-panel au-panel--padded au-mb-3" *ngIf="tab === 'crawl' && selectedSiteId">
          <summary>Setup run</summary>
          <app-onboarding-timeline class="au-mt-2" [siteId]="selectedSiteId" [allowStart]="true"></app-onboarding-timeline>
        </details>

        <!-- Indexed pages -->
        <section class="au-panel" *ngIf="tab === 'crawl'">
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
  readonly fieldGroups = FIELD_GROUPS.map((g) => ({ ...g, fields: FIELDS.filter((f) => g.keys.includes(f.key)) }));
  // ?tab= picks the section (sidebar sub-items); old tab ids still deep-link to the section that absorbed them.
  tab = 'profile';
  private readonly router = inject(Router);
  private readonly tabSub = inject(ActivatedRoute, { optional: true })?.queryParamMap.subscribe((query) => {
    const legacy: Record<string, string> = { onboarding: 'crawl', health: 'crawl', inventory: 'crawl', coverage: 'crawl', opportunities: 'pillars' };
    const renamed = legacy[query.get('tab') ?? ''];
    // Rewrite the URL so the sidebar highlights the same section.
    if (renamed) void this.router.navigate([], { queryParams: { tab: renamed }, queryParamsHandling: 'merge', replaceUrl: true });
    this.tab = sectionFor('/studio/site-intelligence', renamed ?? query.get('tab'));
  });
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
    return !p || p === 'none' ? 'none' : p;
  }
  sourceLabel(key: StrategyField): string {
    const s = this.source(key);
    return s === 'approved' ? 'Approved' : s === 'suggested' ? 'From your site' : 'Empty';
  }
  pillarLabel(i: number): string {
    const p: Provenance | undefined = this.layers?.pillarProvenance?.[i];
    return p === 'approved' ? 'Approved' : p === 'suggested' ? 'From your site' : 'New (unsaved)';
  }
  /** Plans split articles by weight among included pillars (editorial-plan-context). */
  share(p: StrategyPillar): number {
    const total = (this.draft?.pillars ?? []).filter((x) => x.included).reduce((sum, x) => sum + (x.weight || 0), 0);
    return total ? Math.round(((p.weight || 0) / total) * 100) : 0;
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
