import { CommonModule, DatePipe } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import type { ProjectVersionDetail, StudioProjectDetailView } from '../models/studio.models';
import { StudioApiService } from '../services/studio-api.service';
import { formatApiError } from '../utils/api-error';

type CompareRow = {
  label: string;
  latest: string;
  baseline: string;
  changed: boolean;
};

@Component({
  selector: 'app-version-compare-page',
  standalone: true,
  imports: [CommonModule, RouterLink, DatePipe],
  template: `
    <section class="console-page" *ngIf="project; else loadingState">
      <header class="console-page__header">
        <div class="console-page__copy">
          <p class="console-kicker">Editorial / Versions</p>
          <h1 class="console-page__title">{{ project.title }}</h1>
          <p class="console-page__intro">
            Memoria de versiones para {{ project.site.name }}. Comparamos el snapshot mas reciente contra una baseline anterior para entender cambios antes de aprobar o publicar.
          </p>
        </div>

        <div class="console-page__actions">
          <a class="console-button console-button--secondary" routerLink="/studio/editorial/versions">
            Back to versions
          </a>
          <a class="console-button console-button--secondary" [routerLink]="['/studio/editorial/articles', project.id]">
            Open article
          </a>
          <button type="button" class="console-button" (click)="loadProject()">Refresh</button>
        </div>
      </header>

      <div class="console-banner console-banner--error" *ngIf="error">{{ error }}</div>

      <div class="console-stat-grid">
        <article class="console-stat-card">
          <p class="console-stat-card__label">Total versions</p>
          <strong class="console-stat-card__value">{{ project.versions.length }}</strong>
          <span class="console-stat-card__detail">Historial completo de snapshots registrados para esta pieza.</span>
        </article>

        <article class="console-stat-card">
          <p class="console-stat-card__label">Comparing</p>
          <strong class="console-stat-card__value">
            {{ latestVersion ? 'V' + latestVersion.versionNumber : '-' }} vs {{ baselineVersion ? 'V' + baselineVersion.versionNumber : '-' }}
          </strong>
          <span class="console-stat-card__detail">Baseline seleccionada para detectar cambios editoriales y de release.</span>
        </article>

        <article class="console-stat-card">
          <p class="console-stat-card__label">Changed fields</p>
          <strong class="console-stat-card__value">{{ changedFieldCount }}</strong>
          <span class="console-stat-card__detail">Delta visible entre metadata, QA, feedback y publish readiness.</span>
        </article>

        <article class="console-stat-card">
          <p class="console-stat-card__label">Word delta</p>
          <strong class="console-stat-card__value">{{ wordDelta }}</strong>
          <span class="console-stat-card__detail">Diferencia de longitud editorial entre ambas versiones.</span>
        </article>
      </div>

      <div class="console-workspace">
        <div class="console-workspace__main">
          <section class="console-surface" *ngIf="latestVersion && baselineVersion; else singleVersionState">
            <div class="console-surface__head">
              <div>
                <p class="console-surface__eyebrow">Compare</p>
                <h2 class="console-surface__title">Snapshot delta</h2>
              </div>
            </div>

            <div class="console-compare-grid">
              <article class="console-compare-card">
                <div class="console-compare-card__head">
                  <div>
                    <strong>Latest · V{{ latestVersion.versionNumber }}</strong>
                    <p>{{ latestVersion.status }} · {{ latestVersion.updatedAt | date: 'short' }}</p>
                  </div>
                  <span class="console-tag console-tag--accent">{{ latestVersion.qaState }}</span>
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
                  <span
                    class="console-tag"
                    [class.console-tag--warning]="row.changed"
                    [class.console-tag--muted]="!row.changed"
                  >
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
                  <span>{{ version.status }} · {{ version.updatedAt | date: 'short' }}</span>
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
                <span class="console-tag">{{ publication.externalId || 'pending' }}</span>
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
    this.wordDelta =
      this.countWords(this.latestVersion.bodyHtml) - this.countWords(this.baselineVersion.bodyHtml);
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

  private countWords(html: string | null | undefined): number {
    const plain = (html || '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    return plain ? plain.split(' ').length : 0;
  }
}
