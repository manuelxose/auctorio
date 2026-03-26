import { CommonModule, DatePipe } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import type {
  PublicationStatus,
  ProjectVersionDetail,
  ReviewGateStage,
  StudioProjectDetailView,
} from '../models/studio.models';
import { StudioPageHeaderComponent } from '../components/studio-page-header.component';
import { StudioStatStripComponent, type StudioStatItem } from '../components/studio-stat-strip.component';
import { StudioApiService } from '../services/studio-api.service';
import { formatApiError } from '../utils/api-error';
import {
  buildQaScore,
  qaScoreLabel,
  reviewStageLabel as formatReviewStageLabel,
  reviewStageTone,
} from '../utils/review-gate';

type CompareRow = {
  label: string;
  latest: string;
  baseline: string;
  changed: boolean;
};

@Component({
  selector: 'app-version-compare-page',
  standalone: true,
  imports: [CommonModule, RouterLink, DatePipe, StudioPageHeaderComponent, StudioStatStripComponent],
  template: `
    <section class="console-page" *ngIf="project; else loadingState">
      <app-studio-page-header
        kicker="Editorial / Versions"
        [title]="project.title"
        [intro]="'Memoria de versiones para ' + project.site.name + '. Comparamos el snapshot mas reciente contra una baseline anterior y dejamos visible el gate editorial antes de aprobar o publicar.'"
      >
        <div page-meta>
          <span class="console-tag" [ngClass]="reviewTagClass(project.reviewGate.stage)">
            {{ reviewStageLabel(project.reviewGate.stage) }}
          </span>
          <span class="console-tag console-tag--muted">{{ project.site.name }}</span>
          <span class="console-tag console-tag--muted">{{ project.primaryLanguage }}</span>
        </div>

        <div page-actions>
          <a class="console-button console-button--secondary" routerLink="/studio/editorial/versions">
            Back to versions
          </a>
          <a class="console-button console-button--secondary" [routerLink]="['/studio/editorial/articles', project.id]">
            Open article
          </a>
          <button type="button" class="console-button" (click)="loadProject()">Refresh</button>
        </div>
      </app-studio-page-header>

      <div class="console-banner console-banner--error" *ngIf="error">{{ error }}</div>

      <app-studio-stat-strip [items]="compareStats"></app-studio-stat-strip>

      <section class="console-surface console-surface--hero">
        <div class="console-hero-grid console-hero-grid--compact">
          <div class="console-hero-copy">
            <p class="console-surface__eyebrow">Compare posture</p>
            <h2 class="console-surface__title">Version memory for editorial decision-making</h2>
            <p class="console-hero-copy__body">{{ compareNarrative }}</p>

            <div class="console-header-strip">
              <article class="console-header-strip__card">
                <span>Compare pair</span>
                <strong>{{ comparePairLabel }}</strong>
                <small>The latest snapshot is measured against the selected baseline, not against a visual placeholder.</small>
              </article>
              <article class="console-header-strip__card">
                <span>Changed fields</span>
                <strong>{{ changedFieldCount }}</strong>
                <small>Metadata, QA and release deltas that materially changed between both saved iterations.</small>
              </article>
              <article class="console-header-strip__card">
                <span>Gate issues</span>
                <strong>{{ project.reviewGate.blockerCount }} · {{ project.reviewGate.warningCount }}</strong>
                <small>Current blockers and warnings still governing approval or publish readiness.</small>
              </article>
            </div>
          </div>

          <div class="console-focus-stack">
            <div class="console-surface__head">
              <div>
                <p class="console-surface__eyebrow">Focus now</p>
                <h2 class="console-surface__title">Compare shortcuts</h2>
              </div>
            </div>

            <div class="console-focus-list">
              <a class="console-focus-card" [routerLink]="['/studio/editorial/articles', project.id]">
                <div>
                  <strong>Open article</strong>
                  <p>{{ latestVersion?.title || 'Current editorial output' }} · jump back to the live article canvas.</p>
                </div>
                <span class="console-tag console-tag--accent">Article</span>
              </a>

              <a class="console-focus-card" routerLink="/studio/review/qa">
                <div>
                  <strong>QA posture</strong>
                  <p>{{ qaScore }}/100 · {{ qaScoreSummary }} on the latest saved version.</p>
                </div>
                <span class="console-tag" [ngClass]="qaScoreTagClass">{{ latestVersion?.qaState || 'not_ready' }}</span>
              </a>

              <a class="console-focus-card" routerLink="/studio/publishing/history">
                <div>
                  <strong>Release trace</strong>
                  <p>{{ project.publicationJobs.length }} publication events already tied to this piece.</p>
                </div>
                <span class="console-tag" [ngClass]="publicationTagClass(project.publicationJobs[0]?.status || 'canceled')">
                  {{ project.publicationJobs[0]?.status || 'no jobs' }}
                </span>
              </a>
            </div>
          </div>
        </div>
      </section>

      <div class="console-workspace">
        <div class="console-workspace__main">
          <section class="console-surface console-surface--editorial" *ngIf="latestVersion && baselineVersion; else singleVersionState">
            <div class="console-surface__head">
              <div>
                <p class="console-surface__eyebrow">Compare</p>
                <h2 class="console-surface__title">Snapshot delta</h2>
              </div>
              <span class="console-tag console-tag--muted">{{ changedFieldCount }} fields changed</span>
            </div>

            <div class="console-compare-grid">
              <article class="console-compare-card">
                <div class="console-compare-card__head">
                  <div>
                    <strong>Latest · V{{ latestVersion.versionNumber }}</strong>
                    <p>{{ latestVersion.status }} · {{ latestVersion.updatedAt | date: 'short' }}</p>
                  </div>
                  <span class="console-tag" [ngClass]="reviewTagClass(project.reviewGate.stage)">{{ latestVersion.qaState }}</span>
                </div>
                <p>{{ latestVersion.title || 'Untitled version' }}</p>
              </article>

              <article class="console-compare-card">
                <div class="console-compare-card__head">
                  <div>
                    <strong>Baseline · V{{ baselineVersion.versionNumber }}</strong>
                    <p>{{ baselineVersion.status }} · {{ baselineVersion.updatedAt | date: 'short' }}</p>
                  </div>
                  <span class="console-tag console-tag--muted">{{ baselineVersion.qaState }}</span>
                </div>
                <p>{{ baselineVersion.title || 'Untitled version' }}</p>
              </article>
            </div>

            <div class="console-diff-grid">
              <article class="console-diff-row" *ngFor="let row of compareRows">
                <div class="console-diff-row__label">
                  <strong>{{ row.label }}</strong>
                  <span class="console-tag" [ngClass]="row.changed ? 'console-tag--warning' : 'console-tag--muted'">
                    {{ row.changed ? 'Changed' : 'Same' }}
                  </span>
                </div>
                <div class="console-diff-row__columns">
                  <div class="console-diff-row__value">
                    <span>Latest</span>
                    <strong>{{ row.latest }}</strong>
                  </div>
                  <div class="console-diff-row__value">
                    <span>Baseline</span>
                    <strong>{{ row.baseline }}</strong>
                  </div>
                </div>
              </article>
            </div>
          </section>

          <section class="console-surface" *ngIf="latestVersion && baselineVersion">
            <div class="console-surface__head">
              <div>
                <p class="console-surface__eyebrow">Body compare</p>
                <h2 class="console-surface__title">Editorial output side by side</h2>
              </div>
            </div>

            <div class="console-compare-grid">
              <article class="console-compare-card">
                <div class="console-compare-card__head">
                  <div>
                    <strong>Latest output</strong>
                    <p>{{ latestVersion.title || 'Untitled version' }}</p>
                  </div>
                  <span class="console-tag console-tag--accent">V{{ latestVersion.versionNumber }}</span>
                </div>

                <div
                  class="console-preview-surface console-preview-surface--compare"
                  [innerHTML]="latestVersion.bodyHtml || '<p>No body available for this version.</p>'"
                ></div>
              </article>

              <article class="console-compare-card">
                <div class="console-compare-card__head">
                  <div>
                    <strong>Baseline output</strong>
                    <p>{{ baselineVersion.title || 'Untitled version' }}</p>
                  </div>
                  <span class="console-tag console-tag--muted">V{{ baselineVersion.versionNumber }}</span>
                </div>

                <div
                  class="console-preview-surface console-preview-surface--compare"
                  [innerHTML]="baselineVersion.bodyHtml || '<p>No body available for this version.</p>'"
                ></div>
              </article>
            </div>
          </section>
        </div>

        <aside class="console-workspace__aside">
          <section class="console-surface console-surface--editorial">
            <div class="console-surface__head">
              <div>
                <p class="console-surface__eyebrow">Review gate</p>
                <h2 class="console-surface__title">Current release readiness</h2>
              </div>
            </div>

            <div class="console-meta-grid">
              <article class="console-meta-card">
                <span>Stage</span>
                <strong>{{ reviewStageLabel(project.reviewGate.stage) }}</strong>
              </article>
              <article class="console-meta-card">
                <span>Gate issues</span>
                <strong>{{ project.reviewGate.blockerCount }} blockers · {{ project.reviewGate.warningCount }} warnings</strong>
              </article>
              <article class="console-meta-card">
                <span>Next action</span>
                <strong>{{ project.reviewGate.nextAction }}</strong>
              </article>
            </div>

            <ul class="console-note-list" *ngIf="project.reviewGate.blockers.length || project.reviewGate.warnings.length">
              <li class="console-note-list__item" *ngFor="let blocker of project.reviewGate.blockers.slice(0, 3)">
                {{ blocker }}
              </li>
              <li class="console-note-list__item" *ngFor="let warning of project.reviewGate.warnings.slice(0, 2)">
                {{ warning }}
              </li>
            </ul>
          </section>

          <section class="console-surface">
            <div class="console-surface__head">
              <div>
                <p class="console-surface__eyebrow">Timeline</p>
                <h2 class="console-surface__title">Revision memory</h2>
              </div>
            </div>

            <div class="console-action-stack">
              <article class="console-action-card" *ngFor="let version of project.versions">
                <div>
                  <strong>V{{ version.versionNumber }} · {{ version.title || 'Untitled' }}</strong>
                  <span>
                    {{ version.status }} · {{ version.wordCount }} words · {{ version.qaFailureCount }} blockers
                  </span>
                </div>
                <a
                  *ngIf="latestVersion && version.id !== latestVersion.id"
                  class="console-link"
                  [routerLink]="['/studio/editorial/versions', project.id, 'compare', version.id]"
                >
                  Compare to latest
                </a>
                <span class="console-tag console-tag--accent" *ngIf="latestVersion && version.id === latestVersion.id">
                  Current
                </span>
              </article>
            </div>
          </section>

          <section class="console-surface">
            <div class="console-surface__head">
              <div>
                <p class="console-surface__eyebrow">Publishing</p>
                <h2 class="console-surface__title">Release traceability</h2>
              </div>
            </div>

            <div class="console-feed" *ngIf="project.publicationJobs.length; else emptyPublications">
              <article class="console-feed__item" *ngFor="let publication of project.publicationJobs.slice(0, 6)">
                <div>
                  <strong>{{ publication.action }} · {{ publication.status }}</strong>
                  <p>{{ publication.targetStatus || 'n/a' }} · {{ publication.updatedAt | date: 'short' }}</p>
                </div>
                <span class="console-tag" [ngClass]="publicationTagClass(publication.status)">
                  {{ publication.externalId || publication.status }}
                </span>
              </article>
            </div>
          </section>
        </aside>
      </div>

      <ng-template #singleVersionState>
        <section class="console-surface">
          <div class="console-surface__head">
            <div>
              <p class="console-surface__eyebrow">Compare</p>
              <h2 class="console-surface__title">Not enough history yet</h2>
            </div>
          </div>

          <div class="console-empty-compact">
            <p>This project needs at least two versions before comparison is meaningful.</p>
          </div>
        </section>
      </ng-template>

      <ng-template #emptyPublications>
        <div class="console-empty-compact">
          <p>No publication jobs registered.</p>
        </div>
      </ng-template>
    </section>

    <ng-template #loadingState>
      <section class="console-loading">
        <div class="console-loading__panel">
          <p class="console-kicker">Editorial / Versions</p>
          <h2>Loading version history...</h2>
        </div>
      </section>
    </ng-template>
  `,
})
export class VersionComparePageComponent implements OnInit {
  private readonly api = inject(StudioApiService);
  private readonly route = inject(ActivatedRoute);

  project: StudioProjectDetailView | null = null;
  latestVersion: ProjectVersionDetail | null = null;
  baselineVersion: ProjectVersionDetail | null = null;
  compareRows: CompareRow[] = [];
  changedFieldCount = 0;
  wordDelta = 0;
  error = '';

  get compareStats(): StudioStatItem[] {
    return [
      {
        label: 'Total versions',
        value: this.project?.versionCount ?? 0,
        detail: 'Historial completo de snapshots registrados para esta pieza.',
        tone: (this.project?.versionCount ?? 0) > 1 ? 'accent' : 'muted',
      },
      {
        label: 'Comparing',
        value: this.comparePairLabel,
        detail: 'Baseline seleccionada para detectar cambios editoriales y de release.',
        tone: this.baselineVersion ? 'accent' : 'muted',
      },
      {
        label: 'Changed fields',
        value: this.changedFieldCount,
        detail: 'Delta visible entre metadata, QA, feedback y publish readiness.',
        tone: this.changedFieldCount > 0 ? 'warning' : 'muted',
      },
      {
        label: 'Word delta',
        value: this.wordDelta,
        detail: 'Diferencia de longitud editorial entre ambas versiones.',
        tone: this.wordDelta !== 0 ? 'accent' : 'muted',
      },
    ];
  }

  get comparePairLabel(): string {
    return `${this.latestVersion ? 'V' + this.latestVersion.versionNumber : '-'} vs ${this.baselineVersion ? 'V' + this.baselineVersion.versionNumber : '-'}`;
  }

  get qaScore(): number {
    return buildQaScore(this.latestVersion);
  }

  get qaScoreSummary(): string {
    return qaScoreLabel(this.qaScore);
  }

  get qaScoreTagClass(): string {
    if (this.qaScore >= 90) {
      return 'console-tag--success';
    }

    if (this.qaScore >= 70) {
      return 'console-tag--warning';
    }

    if (this.qaScore > 0) {
      return 'console-tag--danger';
    }

    return 'console-tag--muted';
  }

  get compareNarrative(): string {
    if (!this.latestVersion || !this.baselineVersion) {
      return 'Todavia no hay suficiente memoria guardada para comparar iteraciones de forma util. El siguiente paso sigue siendo persistir una segunda version real.';
    }

    if (this.project?.reviewGate.blockerCount) {
      return `${this.changedFieldCount} campos cambiaron entre ${this.comparePairLabel}, pero el gate sigue bloqueado. Compare ya muestra el delta; el cuello de botella actual sigue estando en QA o release readiness.`;
    }

    if (this.changedFieldCount > 0) {
      return `${this.comparePairLabel} muestra un delta editorial visible sin depender de heuristicas. La comparacion ya sirve para decidir si la iteracion mejoro lo suficiente antes de aprobar o publicar.`;
    }

    return `${this.comparePairLabel} no introduce cambios relevantes en los campos comparados. La siguiente iteracion deberia justificarse por feedback humano o por un nuevo objetivo editorial.`;
  }

  ngOnInit(): void {
    this.route.paramMap.subscribe(() => {
      this.loadProject();
    });
  }

  loadProject(): void {
    const projectId = this.route.snapshot.paramMap.get('id');
    if (!projectId) {
      this.error = 'Project id no valido.';
      return;
    }

    this.error = '';

    this.api.getProject(projectId).subscribe({
      next: (project) => {
        this.project = project;
        this.hydrateComparison();
      },
      error: (error) => {
        this.error = formatApiError(error);
      },
    });
  }

  reviewStageLabel(stage: ReviewGateStage): string {
    return formatReviewStageLabel(stage);
  }

  reviewTagClass(stage: ReviewGateStage): string {
    switch (reviewStageTone(stage)) {
      case 'danger':
        return 'console-tag--danger';
      case 'warning':
        return 'console-tag--warning';
      case 'accent':
        return 'console-tag--accent';
      case 'success':
        return 'console-tag--success';
      case 'muted':
      default:
        return 'console-tag--muted';
    }
  }

  publicationTagClass(status: PublicationStatus | 'canceled'): string {
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

  private hydrateComparison(): void {
    if (!this.project) {
      this.latestVersion = null;
      this.baselineVersion = null;
      this.compareRows = [];
      this.changedFieldCount = 0;
      this.wordDelta = 0;
      return;
    }

    this.latestVersion = this.project.versions[0] ?? null;

    const requestedBaselineId = this.route.snapshot.paramMap.get('againstId');
    const requestedBaseline = requestedBaselineId
      ? this.project.versions.find((version) => version.id === requestedBaselineId) ?? null
      : null;
    const fallbackBaseline = this.project.versions[1] ?? null;

    this.baselineVersion = requestedBaseline && requestedBaseline.id !== this.latestVersion?.id
      ? requestedBaseline
      : fallbackBaseline;

    if (!this.latestVersion || !this.baselineVersion) {
      this.compareRows = [];
      this.changedFieldCount = 0;
      this.wordDelta = 0;
      return;
    }

    this.compareRows = [
      this.buildRow('Status', this.latestVersion.status, this.baselineVersion.status),
      this.buildRow('QA state', this.latestVersion.qaState, this.baselineVersion.qaState),
      this.buildRow('Title', this.latestVersion.title, this.baselineVersion.title),
      this.buildRow('Excerpt', this.latestVersion.excerpt, this.baselineVersion.excerpt),
      this.buildRow('SEO title', this.latestVersion.seoTitle, this.baselineVersion.seoTitle),
      this.buildRow('SEO description', this.latestVersion.seoDescription, this.baselineVersion.seoDescription),
      this.buildRow('Word count', String(this.latestVersion.wordCount), String(this.baselineVersion.wordCount)),
      this.buildRow('QA blockers', String(this.latestVersion.qaFailureCount), String(this.baselineVersion.qaFailureCount)),
      this.buildRow('QA warnings', String(this.latestVersion.qaWarningCount), String(this.baselineVersion.qaWarningCount)),
      this.buildRow('Feedback', this.latestVersion.feedback, this.baselineVersion.feedback),
      this.buildRow('Has asset', this.latestVersion.hasAsset ? 'Yes' : 'No', this.baselineVersion.hasAsset ? 'Yes' : 'No'),
      this.buildRow('Derivatives', String(this.latestVersion.derivativeCount), String(this.baselineVersion.derivativeCount)),
      this.buildRow(
        'Publication state',
        this.latestVersion.latestPublicationJob?.status || 'not shipped',
        this.baselineVersion.latestPublicationJob?.status || 'not shipped',
      ),
    ];

    this.changedFieldCount = this.compareRows.filter((row) => row.changed).length;
    this.wordDelta = this.latestVersion.wordCount - this.baselineVersion.wordCount;
  }

  private buildRow(label: string, latest: string | null | undefined, baseline: string | null | undefined): CompareRow {
    const left = this.displayValue(latest);
    const right = this.displayValue(baseline);

    return {
      label,
      latest: left,
      baseline: right,
      changed: left !== right,
    };
  }

  private displayValue(value: string | null | undefined): string {
    const normalized = value?.trim() ?? '';
    return normalized || '—';
  }
}
