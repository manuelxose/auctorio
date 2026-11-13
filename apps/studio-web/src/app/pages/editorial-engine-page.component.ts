import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { StudioApiService } from '../services/studio-api.service';
import { ToastService } from '../services/toast.service';
import { AppContextService } from '../services/app-context.service';
import { AppIconComponent } from '../components/ui/app-icon.component';
import { AppEmptyStateComponent } from '../components/ui/app-empty-state.component';
import type {
  StudioGenerationDetail,
  StudioGenerationSummary,
  StudioSite,
  StudioFactLicense,
} from '../models/studio.models';

const USAGE_LABELS: Record<string, string> = {
  state_confidently: 'Confident',
  state: 'Statement',
  attribute: 'Attribute',
  temporal_language: 'Temporal',
  represent_uncertainty: 'Uncertain',
  forbidden: 'Forbidden',
};

const DECISION_LABELS: Record<string, string> = {
  create_new: 'Create new',
  update_existing: 'Update existing',
  skip: 'Skip',
  pending: 'Pending',
};

const OUTCOME_LABELS: Record<string, string> = {
  auto_publish: 'Auto-publish',
  review: 'Review',
  hold: 'Hold',
  reject: 'Reject',
};

@Component({
  selector: 'app-editorial-engine-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, AppIconComponent, AppEmptyStateComponent],
  template: `
    <section class="au-page">
      <header class="au-page__header">
        <div>
          <h1 class="au-page__title">Review queue</h1>
          <p class="au-page__subtitle">
            Articles autopilot wrote from your stories. Check the evidence and QA, then approve or reject. To start one, open a story in the Inbox.
          </p>
        </div>
        <a class="au-btn au-btn--secondary" routerLink="/studio/inbox">
          <app-icon name="inbox"></app-icon>
          Open Inbox
        </a>
      </header>

      <div class="au-toolbar">
        <select class="au-select au-filter-select" [(ngModel)]="generationFilters.outcome" (ngModelChange)="loadGenerations()" aria-label="Filter by outcome">
          <option value="review">Needs review</option>
          <option value="hold">On hold</option>
          <option value="auto_publish">Auto-published</option>
          <option value="reject">Rejected by QA</option>
          <option value="">All</option>
        </select>
        <select class="au-select au-filter-select" [(ngModel)]="generationFilters.decision" (ngModelChange)="loadGenerations()" aria-label="Filter by decision">
          <option value="">New and updates</option>
          <option value="create_new">New articles</option>
          <option value="update_existing">Updates to existing</option>
          <option value="skip">Skipped</option>
        </select>
        <button class="au-btn au-btn--ghost" (click)="loadGenerations()">
          <app-icon name="refresh"></app-icon>
          Refresh
        </button>
      </div>

      <!-- Generations list -->
      <ng-container>
        <app-empty-state
          *ngIf="generations.length === 0 && !loadingGenerations"
          icon="template"
          [title]="generationFilters.outcome === 'review' ? 'Nothing waiting for review' : 'No articles match'"
          message="Open a story in the Inbox and choose Generate article; the draft lands here when it needs a human."
        ></app-empty-state>
        <div class="au-feed">
          <article
            class="au-feed__item au-feed__item--interactive"
            *ngFor="let generation of generations"
            (click)="openGeneration(generation)"
            [attr.aria-label]="'Open generation ' + (generation.title ?? generation.id)"
          >
            <div class="au-feed__body">
              <div class="au-feed__meta">
                <span class="au-badge" [ngClass]="statusBadgeClass(generation)">{{ generation.status }}</span>
                <span class="au-badge au-badge--neutral">{{ DECISION_LABELS[generation.decision] ?? generation.decision }}</span>
                <span class="au-badge" [ngClass]="qaBadgeClass(generation)">QA {{ generation.qaScore ?? '—' }}</span>
                <span class="au-badge" [ngClass]="outcomeBadgeClass(generation)">
                  {{ OUTCOME_LABELS[generation.publicationOutcome ?? ''] ?? generation.publicationOutcome ?? '—' }}
                </span>
                <span class="au-feed__date">{{ generation.createdAt | date: 'short' }}</span>
              </div>
              <h3 class="au-feed__title">{{ generation.title ?? '—' }}</h3>
              <p class="au-feed__desc">{{ generation.articleType ?? '—' }} · {{ generation.searchIntent ?? '—' }}<span *ngIf="generation.decisionReason"> · {{ generation.decisionReason }}</span></p>
            </div>
          </article>
        </div>
        <div class="au-pagination" *ngIf="generationTotal > generationPageSize">
          <button class="au-btn au-btn--ghost" [disabled]="generationPage <= 1" (click)="generationPage = generationPage - 1; loadGenerations()">Previous</button>
          <span>Page {{ generationPage }}</span>
          <button class="au-btn au-btn--ghost" [disabled]="generationPage * generationPageSize >= generationTotal" (click)="generationPage = generationPage + 1; loadGenerations()">Next</button>
        </div>
      </ng-container>

      <!-- Detail drawer -->
      <div class="au-story-drawer" *ngIf="detail" role="dialog" aria-modal="true" aria-label="Generation review">
        <div class="au-story-drawer__scrim" (click)="closeDetail()"></div>
        <aside class="au-story-drawer__panel au-story-drawer__panel--wide">
          <header class="au-story-drawer__header">
            <div>
              <h3 class="au-story-drawer__title">Article review</h3>
              <div class="au-badge-row">
                <span class="au-badge" [ngClass]="detailBadgeClass(detail)">{{ detail.status }}</span>
                <span class="au-badge au-badge--neutral">{{ DECISION_LABELS[detail.decision] ?? detail.decision }}</span>
                <span class="au-badge au-badge--neutral">{{ detail.articleType ?? '—' }} · {{ detail.searchIntent ?? '—' }}</span>
                <span class="au-badge" [ngClass]="outcomeDetailBadgeClass(detail)">
                  {{ OUTCOME_LABELS[detail.publicationDecision?.decision ?? ''] ?? detail.publicationDecision?.decision ?? '—' }}
                </span>
              </div>
            </div>
            <div class="au-story-drawer__actions">
              <a class="au-btn au-btn--secondary" *ngIf="detailProjectId" [routerLink]="['/studio/content', detailProjectId]">
                <app-icon name="edit"></app-icon>
                Edit
              </a>
              <button class="au-btn au-btn--primary" (click)="approve(detail)" [disabled]="detail.status === 'approved'">
                <app-icon name="check"></app-icon>
                Approve
              </button>
              <button class="au-btn au-btn--danger" (click)="reject(detail)" [disabled]="detail.status === 'rejected'">
                <app-icon name="warning"></app-icon>
                Reject
              </button>
              <button class="au-btn au-btn--ghost" (click)="closeDetail()">
                <app-icon name="close"></app-icon>
              </button>
            </div>
          </header>

          <div class="au-story-drawer__body" *ngIf="detail">
            <div class="ee-grid">
              <div class="ee-main">
                <!-- Article -->
                <section class="au-story-drawer__section" *ngIf="detail.article">
                  <h4>Article</h4>
                  <h2 class="ee-article-title">{{ detail.article.title }}</h2>
                  <p class="ee-article-excerpt">{{ detail.article.excerpt }}</p>
                  <div class="ee-article-body" [innerHTML]="safeBody"></div>
                </section>

                <!-- Provenance -->
                <section class="au-story-drawer__section" *ngIf="detail.provenance && detail.provenance.length > 0">
                  <h4>Provenance — why each claim exists</h4>
                  <div class="ee-provenance" *ngFor="let entry of detail.provenance">
                    <p class="ee-provenance__fact">
                      [{{ entry.factKey }}] {{ entry.statement }}
                      <span class="au-badge au-badge--neutral">{{ USAGE_LABELS[entry.usage] ?? entry.usage }}</span>
                    </p>
                    <p class="ee-provenance__source" *ngIf="entry.sources && entry.sources.length">
                      Sources: <ng-container *ngFor="let source of entry.sources; let last = last">
                        {{ source.publisher ?? 'unknown' }}<a *ngIf="source.url" [href]="source.url" target="_blank" rel="noopener"> ↗</a>{{ last ? '' : ', ' }}
                      </ng-container>
                      · Inline attribution: {{ entry.inlineAttributed ? 'yes' : 'no' }}
                    </p>
                    <ul class="ee-provenance__claims" *ngIf="entry.claims && entry.claims.length">
                      <li *ngFor="let claim of entry.claims">«{{ claim }}»</li>
                    </ul>
                  </div>
                </section>

                <!-- Fact panel -->
                <section class="au-story-drawer__section" *ngIf="detail.factPanel.licenses && detail.factPanel.licenses.length > 0">
                  <h4>Fact ledger with usage licenses</h4>
                  <div class="au-story-drawer__source" *ngFor="let license of detail.factPanel.licenses">
                    <strong>[{{ license.factKey }}]</strong> {{ license.statement }}
                    <span class="au-badge" [ngClass]="usageBadgeClass(license)">{{ USAGE_LABELS[license.usage] ?? license.usage }}</span>
                    <span class="au-badge au-badge--neutral" *ngIf="license.sensitivity === 'high'">sensitive</span>
                    <div class="ee-muted" *ngIf="license.alternatives && license.alternatives.length">
                      Alternatives: {{ license.alternatives.join(' | ') }}
                    </div>
                  </div>
                </section>

                <!-- QA warnings -->
                <section class="au-story-drawer__section" *ngIf="detail.qaReport">
                  <h4>Editorial QA — {{ detail.qaReport.score }}/100 {{ detail.qaReport.passed ? '· passed' : '· FAILED' }}</h4>
                  <div class="ee-qa-dims">
                    <span class="au-badge" *ngFor="let dimension of detail.qaReport.dimensions" [ngClass]="dimensionBadgeClass(dimension.score)">
                      {{ dimension.dimension }} {{ dimension.score }}
                    </span>
                  </div>
                  <ul class="ee-qa-list" *ngIf="detail.qaReport.findings.length">
                    <li
                      class="ee-qa-item"
                      *ngFor="let finding of detail.qaReport.findings"
                      [class.ee-qa-item--ok]="finding.passed"
                      [class.ee-qa-item--error]="!finding.passed && finding.severity === 'error'"
                      [class.ee-qa-item--warning]="!finding.passed && finding.severity === 'warning'"
                    >
                      <span class="au-badge au-badge--neutral">{{ finding.severity }}</span>
                      {{ finding.message }}
                    </li>
                  </ul>
                  <div class="ee-critical" *ngIf="detail.qaReport.criticalUnsupportedClaims.length">
                    Critical unsupported claims:
                    {{ detail.qaReport.criticalUnsupportedClaims | json }}
                  </div>
                </section>
              </div>

              <div class="ee-side">
                <!-- Publication decision -->
                <section class="au-story-drawer__section" *ngIf="detail.publicationDecision">
                  <h4>Publication decision</h4>
                  <p class="au-badge" [ngClass]="outcomeDetailBadgeClass(detail)">
                    {{ OUTCOME_LABELS[detail.publicationDecision.decision] ?? detail.publicationDecision.decision }}
                  </p>
                  <ul class="ee-gate-list">
                    <li *ngFor="let gate of detail.publicationDecision.gates" [class.ee-gate--fail]="!gate.passed">
                      {{ gate.passed ? '✓' : '✗' }} {{ gate.label }}
                    </li>
                  </ul>
                  <p class="ee-muted" *ngIf="detail.decisionReason">Reason: {{ detail.decisionReason }}</p>
                </section>

                <!-- SEO -->
                <section class="au-story-drawer__section" *ngIf="detail.seo">
                  <h4>SEO</h4>
                  <dl class="ee-kv">
                    <dt>SEO title</dt><dd>{{ detail.seo.seoTitle }}</dd>
                    <dt>Slug</dt><dd>{{ detail.seo.slug }}</dd>
                    <dt>Meta</dt><dd>{{ detail.seo.metaDescription }}</dd>
                    <dt>Keywords</dt><dd>{{ detail.seo.primaryKeyword }}{{ detail.seo.secondaryKeywords.length ? ' · ' + detail.seo.secondaryKeywords.join(', ') : '' }}</dd>
                    <dt>Structured data</dt><dd>{{ detail.seo.structuredDataRecommendation }}</dd>
                    <dt>Keyword density</dt>
                    <dd>
                      {{ detail.seo.keywordDensity.densityPercent }}%
                      <span class="au-badge" [ngClass]="detail.seo.keywordDensity.stuffingRisk ? 'au-badge--danger' : 'au-badge--neutral'">
                        {{ detail.seo.keywordDensity.stuffingRisk ? 'stuffing risk' : 'ok' }}
                      </span>
                    </dd>
                  </dl>
                  <p class="ee-muted">{{ detail.seo.searchVolumeDisclaimer }}</p>
                </section>

                <!-- Social preview -->
                <section class="au-story-drawer__section" *ngIf="detail.seo">
                  <h4>Social preview</h4>
                  <div class="ee-social-card">
                    <p class="ee-social-card__domain">{{ detail.site?.baseUrl ?? '' }}</p>
                    <p class="ee-social-card__title">{{ detail.seo.openGraph.title }}</p>
                    <p class="ee-social-card__desc">{{ detail.seo.openGraph.description }}</p>
                  </div>
                </section>

                <!-- Internal links -->
                <section class="au-story-drawer__section" *ngIf="detail.seo && detail.seo.internalLinks.length">
                  <h4>Internal links</h4>
                  <ul class="ee-link-list">
                    <li *ngFor="let link of detail.seo.internalLinks">
                      <a [href]="link.url" target="_blank" rel="noopener">{{ link.title }}</a>
                      <span class="ee-muted"> — {{ link.reason }}</span>
                    </li>
                  </ul>
                </section>

                <!-- Sources -->
                <section class="au-story-drawer__section" *ngIf="detail.sources.length">
                  <h4>Sources</h4>
                  <ul class="ee-link-list">
                    <li *ngFor="let source of detail.sources">
                      <a *ngIf="source.url" [href]="source.url" target="_blank" rel="noopener">{{ source.publisher }}</a>
                      <span *ngIf="!source.url">{{ source.publisher }}</span>
                      <span class="ee-muted"> — {{ source.factKey }}</span>
                    </li>
                  </ul>
                </section>

                <!-- Enrichment -->
                <section class="au-story-drawer__section" *ngIf="detail.enrichment.length">
                  <h4>Enrichment</h4>
                  <div class="au-story-drawer__source" *ngFor="let enrichment of detail.enrichment">
                    <strong>{{ enrichment['providerKey'] }}</strong>
                    {{ enrichment['title'] ?? '—' }}
                    <span class="ee-muted" *ngIf="enrichment['releaseDate']"> · {{ enrichment['releaseDate'] }}</span>
                    <span class="ee-muted"> · {{ enrichment['matchMethod'] }}</span>
                  </div>
                </section>

                <!-- Update delta -->
                <section class="au-story-drawer__section" *ngIf="detail.updateDelta">
                  <h4>Update delta</h4>
                  <pre class="ee-pre">{{ detail.updateDelta | json }}</pre>
                </section>

                <p class="ee-muted" *ngIf="detail.error">Error: {{ detail.error }}</p>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </section>
  `,
  styles: [
    `
      .ee-grid { display: grid; grid-template-columns: minmax(0, 2fr) minmax(280px, 1fr); gap: 1.5rem; }
      @media (max-width: 1100px) { .ee-grid { grid-template-columns: 1fr; } }
      .au-story-drawer__panel--wide { max-width: 1180px; }
      .au-badge-row { display: flex; gap: 0.5rem; flex-wrap: wrap; margin-top: 0.5rem; }
      .ee-article-title { margin: 0.25rem 0; }
      .ee-article-excerpt { color: var(--au-muted); }
      .ee-article-body { line-height: 1.6; }
      .ee-article-body ::ng-deep h2 { font-size: 1.15rem; margin-top: 1.5rem; }
      .ee-article-body ::ng-deep p { margin: 0.6rem 0; }
      .ee-provenance { border-left: 2px solid var(--au-border); padding-left: 0.75rem; margin-bottom: 0.75rem; }
      .ee-provenance__fact { margin: 0; display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; }
      .ee-provenance__source, .ee-muted { color: var(--au-muted); font-size: var(--au-fs-sm); }
      .ee-provenance__claims { margin: 0.3rem 0 0 1rem; color: var(--au-muted); font-size: var(--au-fs-sm); }
      .ee-qa-dims { display: flex; flex-wrap: wrap; gap: 0.35rem; margin-bottom: 0.75rem; }
      .ee-qa-list { list-style: none; padding: 0; margin: 0; display: grid; gap: 0.35rem; }
      .ee-qa-item { display: flex; gap: 0.5rem; align-items: baseline; font-size: var(--au-fs-sm); }
      .ee-qa-item--ok { color: var(--au-muted); }
      .ee-qa-item--warning { color: var(--au-warning); }
      .ee-qa-item--error { color: var(--au-danger, #c0392b); font-weight: 600; }
      .ee-critical { color: var(--au-danger, #c0392b); font-weight: 600; margin-top: 0.5rem; }
      .ee-gate-list { list-style: none; padding: 0; margin: 0.5rem 0; display: grid; gap: 0.25rem; font-size: var(--au-fs-sm); }
      .ee-gate--fail { color: var(--au-danger, #c0392b); font-weight: 600; }
      .ee-kv { display: grid; grid-template-columns: auto 1fr; gap: 0.3rem 0.75rem; font-size: var(--au-fs-sm); }
      .ee-kv dt { color: var(--au-muted); white-space: nowrap; }
      .ee-kv dd { margin: 0; overflow-wrap: anywhere; }
      .ee-social-card { border: 1px solid var(--au-border); border-radius: 8px; padding: 0.75rem; background: var(--au-surface-2, #fff); }
      .ee-social-card__domain { color: var(--au-muted); font-size: var(--au-fs-xs); margin: 0; }
      .ee-social-card__title { font-weight: 700; margin: 0.25rem 0; }
      .ee-social-card__desc { color: var(--au-muted); font-size: var(--au-fs-sm); margin: 0; }
      .ee-link-list { list-style: none; padding: 0; margin: 0; display: grid; gap: 0.35rem; font-size: var(--au-fs-sm); }
      .ee-pre { white-space: pre-wrap; font-size: var(--au-fs-xs); background: var(--au-surface-2, #f6f6f6); padding: 0.5rem; border-radius: 6px; max-height: 220px; overflow: auto; }
    `,
  ],
})
export class EditorialEnginePageComponent implements OnInit, OnDestroy {
  private readonly api = inject(StudioApiService);
  private readonly toast = inject(ToastService);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly appContext = inject(AppContextService);
  private subscription: Subscription | null = null;

  readonly USAGE_LABELS = USAGE_LABELS;
  readonly DECISION_LABELS = DECISION_LABELS;
  readonly OUTCOME_LABELS = OUTCOME_LABELS;
  Math = Math;

  generations: StudioGenerationSummary[] = [];
  generationTotal = 0;
  generationPage = 1;
  // shortcut: the API cannot filter by outcome, so filters run on the 100 most recent; add server-side filters if the queue outgrows that.
  generationPageSize = 100;
  generationFilters = { decision: '', outcome: 'review', siteId: this.appContext.activeSite()?.id ?? '' };
  loadingGenerations = false;


  detail: StudioGenerationDetail | null = null;
  detailProjectId: string | null = null;
  safeBody: SafeHtml = '';

  ngOnInit(): void {
    this.loadGenerations();
  }

  ngOnDestroy(): void {
    this.subscription?.unsubscribe();
  }

  loadGenerations(): void {
    this.loadingGenerations = true;
    this.api
      .listGenerations(this.generationPage, this.generationPageSize, {
        siteId: this.generationFilters.siteId || undefined,
      })
      .subscribe({
        next: (response) => {
          const outcomeFilter = this.generationFilters.outcome;
          const decisionFilter = this.generationFilters.decision;
          this.generationTotal = response.total;
          this.generations = response.items.filter((generation) => {
            if (decisionFilter && generation.decision !== decisionFilter) {
              return false;
            }
            if (outcomeFilter && generation.publicationOutcome !== outcomeFilter) {
              return false;
            }
            return true;
          });
          this.loadingGenerations = false;
        },
        error: () => {
          this.loadingGenerations = false;
          this.toast.error('Could not load generations');
        },
      });
  }

  openGeneration(generation: StudioGenerationSummary): void {
    this.detailProjectId = generation.projectId;
    this.api.getGeneration(generation.id).subscribe({
      next: (detail) => this.openDetail(detail),
      error: () => this.toast.error('Could not load generation'),
    });
  }

  private openDetail(detail: StudioGenerationDetail): void {
    this.detail = detail;
    this.safeBody = this.sanitizer.bypassSecurityTrustHtml(detail.article?.bodyHtml ?? '');
  }

  closeDetail(): void {
    this.detail = null;
    this.safeBody = '';
  }

  approve(detail: StudioGenerationDetail): void {
    this.api.approveGeneration(detail.id).subscribe({
      next: () => {
        this.toast.success('Approved');
        this.detail = { ...detail, status: 'approved' };
        this.loadGenerations();
      },
      error: () => this.toast.error('Could not approve'),
    });
  }

  reject(detail: StudioGenerationDetail): void {
    this.api.rejectGeneration(detail.id, 'Rejected from the editorial engine review page').subscribe({
      next: () => {
        this.toast.info('Rejected');
        this.detail = { ...detail, status: 'rejected' };
        this.loadGenerations();
      },
      error: () => this.toast.error('Could not reject'),
    });
  }

  statusBadgeClass(generation: StudioGenerationSummary): string {
    switch (generation.status) {
      case 'qa_review':
        return 'au-badge--info';
      case 'approved':
      case 'auto_publish_scheduled':
        return 'au-badge--success';
      case 'rejected':
      case 'failed':
        return 'au-badge--danger';
      case 'skipped':
        return 'au-badge--warning';
      default:
        return 'au-badge--neutral';
    }
  }

  detailBadgeClass(detail: StudioGenerationDetail): string {
    return this.statusBadgeClass(detail as unknown as StudioGenerationSummary);
  }

  qaBadgeClass(generation: StudioGenerationSummary): string {
    const score = generation.qaScore ?? 0;
    if (score >= 80) {
      return 'au-badge--success';
    }
    if (score >= 60) {
      return 'au-badge--warning';
    }
    return 'au-badge--danger';
  }

  outcomeBadgeClass(generation: StudioGenerationSummary): string {
    switch (generation.publicationOutcome) {
      case 'auto_publish':
        return 'au-badge--success';
      case 'review':
        return 'au-badge--info';
      case 'hold':
        return 'au-badge--warning';
      case 'reject':
        return 'au-badge--danger';
      default:
        return 'au-badge--neutral';
    }
  }

  outcomeDetailBadgeClass(detail: StudioGenerationDetail): string {
    return this.outcomeBadgeClass({
      publicationOutcome: detail.publicationDecision?.decision ?? null,
    } as StudioGenerationSummary);
  }


  usageBadgeClass(license: StudioFactLicense): string {
    switch (license.usage) {
      case 'state_confidently':
      case 'state':
        return 'au-badge--success';
      case 'attribute':
      case 'temporal_language':
        return 'au-badge--warning';
      case 'represent_uncertainty':
        return 'au-badge--danger';
      case 'forbidden':
        return 'au-badge--danger';
      default:
        return 'au-badge--neutral';
    }
  }

  dimensionBadgeClass(score: number): string {
    if (score >= 80) {
      return 'au-badge--success';
    }
    if (score >= 60) {
      return 'au-badge--warning';
    }
    return 'au-badge--danger';
  }
}
