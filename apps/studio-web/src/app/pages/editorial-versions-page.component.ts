import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import type { ReviewGateStage, StudioProjectSummary, StudioSiteSummary } from '../models/studio.models';
import { StudioPageHeaderComponent } from '../components/studio-page-header.component';
import { StudioStatStripComponent, type StudioStatItem } from '../components/studio-stat-strip.component';
import { StudioApiService } from '../services/studio-api.service';
import { formatApiError } from '../utils/api-error';
import {
  buildQaScore,
  qaScoreLabel as formatQaScoreLabel,
  reviewStageLabel as formatReviewStageLabel,
  reviewStageTone,
} from '../utils/review-gate';

type VersionFocus = 'all' | 'needsReview' | 'approved' | 'published' | 'compareReady';

@Component({
  selector: 'app-editorial-versions-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, StudioPageHeaderComponent, StudioStatStripComponent],
  template: `
    <section class="console-page">
      <app-studio-page-header
        kicker="Editorial"
        title="Versions"
        intro="Inventario vivo de snapshots editoriales, compare readiness y bloqueo operativo antes de aprobar o publicar."
      >
        <div page-meta *ngIf="!loading">
          <span class="console-tag console-tag--accent">{{ compareReadyCount }} compare ready</span>
          <span class="console-tag console-tag--warning">{{ gateBlockedCount }} gate blocked</span>
          <span class="console-tag console-tag--muted">{{ unversionedProjects.length }} missing first version</span>
        </div>

        <div page-actions>
          <a class="console-button console-button--secondary" routerLink="/studio/editorial/articles">
            Open articles
          </a>
          <button type="button" class="console-button" (click)="loadData()">Refresh versions</button>
        </div>
      </app-studio-page-header>

      <div class="console-banner console-banner--error" *ngIf="error">{{ error }}</div>

      <app-studio-stat-strip *ngIf="!loading" [items]="versionStats"></app-studio-stat-strip>

      <section class="console-surface console-surface--hero" *ngIf="!loading">
        <div class="console-hero-grid console-hero-grid--compact">
          <div class="console-hero-copy">
            <p class="console-surface__eyebrow">Version posture</p>
            <h2 class="console-surface__title">Revision memory and compare readiness</h2>
            <p class="console-hero-copy__body">{{ versionNarrative }}</p>

            <div class="console-header-strip">
              <article class="console-header-strip__card">
                <span>Saved snapshots</span>
                <strong>{{ versionedProjects.length }}</strong>
                <small>Projects that already keep a traceable editorial output.</small>
              </article>
              <article class="console-header-strip__card">
                <span>Compare ready</span>
                <strong>{{ compareReadyCount }}</strong>
                <small>Pieces with enough saved memory to make iteration diffs useful.</small>
              </article>
              <article class="console-header-strip__card">
                <span>Missing first pass</span>
                <strong>{{ unversionedProjects.length }}</strong>
                <small>Briefs that still need a first generated output before review can even start.</small>
              </article>
            </div>
          </div>

          <div class="console-focus-stack">
            <div class="console-surface__head">
              <div>
                <p class="console-surface__eyebrow">Focus now</p>
                <h2 class="console-surface__title">Version memory lanes</h2>
              </div>
            </div>

            <div class="console-focus-list">
              <a
                class="console-focus-card"
                *ngFor="let card of focusCards"
                [routerLink]="card.link"
              >
                <div>
                  <strong>{{ card.title }}</strong>
                  <p>{{ card.detail }}</p>
                </div>
                <span class="console-tag" [ngClass]="card.tagClass">{{ card.tag }}</span>
              </a>
            </div>
          </div>
        </div>
      </section>

      <div class="console-workspace" *ngIf="!loading; else loadingState">
        <div class="console-workspace__main">
          <section class="console-surface console-surface--editorial">
            <div class="console-surface__head">
              <div>
                <p class="console-surface__eyebrow">Explorer</p>
                <h2 class="console-surface__title">Version memory</h2>
              </div>
              <span class="console-tag console-tag--muted">{{ filteredProjects.length }} indexed versions</span>
            </div>

            <form class="console-toolbar console-toolbar--stretch" [formGroup]="filterForm">
              <label class="console-search console-search--wide">
                <span>Search</span>
                <input
                  type="text"
                  formControlName="query"
                  placeholder="Project, version title, blocker or destination"
                  (input)="applyFilters()"
                />
              </label>

              <label class="console-select">
                <span>Destination</span>
                <select formControlName="siteId" (change)="applyFilters()">
                  <option value="">All destinations</option>
                  <option *ngFor="let site of sites" [value]="site.id">{{ site.name }}</option>
                </select>
              </label>

              <label class="console-select">
                <span>Focus</span>
                <select formControlName="focus" (change)="applyFilters()">
                  <option value="all">All versions</option>
                  <option value="needsReview">Needs review</option>
                  <option value="approved">Approved</option>
                  <option value="published">Published</option>
                  <option value="compareReady">Compare ready</option>
                </select>
              </label>
            </form>

            <div class="console-list-grid" *ngIf="filteredProjects.length; else emptyVersions">
              <article class="console-list-card" *ngFor="let project of filteredProjects">
                <div class="console-version-card__head">
                  <div>
                    <strong>{{ project.title }}</strong>
                    <p>{{ project.site.name }} · {{ project.goal }} · {{ project.primaryLanguage }}</p>
                  </div>
                  <div class="console-version-card__tags">
                    <span class="console-tag console-tag--accent">V{{ project.latestVersion?.versionNumber }}</span>
                    <span class="console-tag" [ngClass]="reviewTagClass(project.reviewGate.stage)">
                      {{ reviewStageLabel(project.reviewGate.stage) }}
                    </span>
                    <span class="console-tag console-tag--muted">{{ project.latestVersion?.qaState }}</span>
                  </div>
                </div>

                <p class="console-version-card__body">
                  {{ project.latestVersion?.title || 'Untitled version' }}
                  <ng-container *ngIf="project.latestVersion?.excerpt">
                    · {{ truncate(project.latestVersion?.excerpt, 160) }}
                  </ng-container>
                </p>

                <div class="console-meta-grid">
                  <article class="console-meta-card">
                    <span>Revision memory</span>
                    <strong>{{ project.versionCount }} snapshots</strong>
                  </article>
                  <article class="console-meta-card">
                    <span>QA posture</span>
                    <strong>{{ qaScore(project) }}/100 · {{ qaScoreLabel(project) }}</strong>
                  </article>
                  <article class="console-meta-card">
                    <span>Next action</span>
                    <strong>{{ project.reviewGate.nextAction }}</strong>
                  </article>
                </div>

                <ul
                  class="console-note-list"
                  *ngIf="project.reviewGate.blockers.length || project.reviewGate.warnings.length"
                >
                  <li class="console-note-list__item" *ngFor="let blocker of project.reviewGate.blockers.slice(0, 2)">
                    {{ blocker }}
                  </li>
                  <li class="console-note-list__item" *ngFor="let warning of project.reviewGate.warnings.slice(0, 1)">
                    {{ warning }}
                  </li>
                </ul>

                <div class="console-inline-actions">
                  <a class="console-button console-button--secondary" [routerLink]="['/studio/editorial/articles', project.id]">
                    Open article
                  </a>
                  <a
                    class="console-button"
                    [routerLink]="['/studio/editorial/versions', project.id]"
                  >
                    {{ project.reviewGate.compareReady ? 'Compare versions' : 'Open version detail' }}
                  </a>
                </div>
              </article>
            </div>
          </section>

          <section class="console-surface" *ngIf="unversionedProjects.length">
            <div class="console-surface__head">
              <div>
                <p class="console-surface__eyebrow">Missing snapshots</p>
                <h2 class="console-surface__title">Projects without a version yet</h2>
              </div>
            </div>

            <div class="console-feed">
              <article class="console-feed__item" *ngFor="let project of unversionedProjects.slice(0, 6)">
                <div>
                  <strong>{{ project.title }}</strong>
                  <p>{{ project.site.name }} · {{ reviewStageLabel(project.reviewGate.stage) }} · {{ truncate(project.brief, 120) }}</p>
                </div>
                <a class="console-link" [routerLink]="['/studio/editorial/briefs', project.id]">Open brief</a>
              </article>
            </div>
          </section>
        </div>

        <aside class="console-workspace__aside">
          <section class="console-surface console-surface--editorial">
            <div class="console-surface__head">
              <div>
                <p class="console-surface__eyebrow">Ready for compare</p>
                <h2 class="console-surface__title">Most revisioned pieces</h2>
              </div>
            </div>

            <div class="console-action-stack" *ngIf="compareReadyProjects.length; else emptyCompareReady">
              <a class="console-action-card" *ngFor="let project of compareReadyProjects" [routerLink]="['/studio/editorial/versions', project.id]">
                <div>
                  <strong>{{ project.title }}</strong>
                  <span>{{ project.site.name }} · {{ project.versionCount }} snapshots</span>
                </div>
                <span class="console-tag console-tag--accent">Compare</span>
              </a>
            </div>
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
                Compare readiness ya no usa un proxy visual: depende de la memoria real de versiones guardadas.
              </li>
              <li class="console-note-list__item">
                El review gate resume blockers, warnings y siguiente accion operativa sin abrir el detalle del articulo.
              </li>
              <li class="console-note-list__item">
                Esta vista sigue siendo catalogo editorial; la decision humana y el publish viven en review y release management.
              </li>
            </ul>
          </section>
        </aside>
      </div>

      <ng-template #loadingState>
        <section class="console-empty-state">
          <div>
            <p class="console-kicker">Loading</p>
            <h2>Indexing version memory</h2>
            <p>Estamos reuniendo snapshots, review gates y readiness de comparacion.</p>
          </div>
        </section>
      </ng-template>

      <ng-template #emptyVersions>
        <div class="console-empty-compact">
          <p>No versions match the current filters.</p>
        </div>
      </ng-template>

      <ng-template #emptyCompareReady>
        <div class="console-empty-compact">
          <p>No projects with multiple versions yet.</p>
        </div>
      </ng-template>
    </section>
  `,
})
export class EditorialVersionsPageComponent implements OnInit {
  private readonly api = inject(StudioApiService);

  readonly filterForm = new FormGroup({
    query: new FormControl('', { nonNullable: true }),
    siteId: new FormControl('', { nonNullable: true }),
    focus: new FormControl<VersionFocus>('all', { nonNullable: true }),
  });

  sites: StudioSiteSummary[] = [];
  projects: StudioProjectSummary[] = [];
  versionedProjects: StudioProjectSummary[] = [];
  filteredProjects: StudioProjectSummary[] = [];
  compareReadyProjects: StudioProjectSummary[] = [];
  unversionedProjects: StudioProjectSummary[] = [];
  compareReadyCount = 0;
  gateBlockedCount = 0;
  loading = true;
  error = '';

  get versionStats(): StudioStatItem[] {
    return [
      {
        label: 'Latest snapshots',
        value: this.versionedProjects.length,
        detail: 'Proyectos que ya cuentan con una salida versionada y trazable.',
        tone: this.versionedProjects.length > 0 ? 'accent' : 'muted',
      },
      {
        label: 'Compare ready',
        value: this.compareReadyCount,
        detail: 'Piezas con memoria suficiente para revisar diffs entre iteraciones.',
        tone: this.compareReadyCount > 0 ? 'accent' : 'muted',
      },
      {
        label: 'Blocked by gate',
        value: this.gateBlockedCount,
        detail: 'Versiones cuya aprobacion o publish siguen frenados por QA o inputs faltantes.',
        tone: this.gateBlockedCount > 0 ? 'warning' : 'muted',
      },
      {
        label: 'Without version',
        value: this.unversionedProjects.length,
        detail: 'Briefs o proyectos que aun no han generado una primera salida versionada.',
        tone: this.unversionedProjects.length > 0 ? 'danger' : 'muted',
      },
    ];
  }

  get versionNarrative(): string {
    if (!this.projects.length) {
      return 'No hay proyectos cargados en el indice editorial. Cuando entren briefs y primeras salidas, este modulo mostrara la memoria de iteracion real.';
    }

    if (this.unversionedProjects.length > 0) {
      return `${this.unversionedProjects.length} piezas siguen sin una primera version guardada. El cuello de botella no esta en compare, sino en producir y persistir el primer output util.`;
    }

    if (this.gateBlockedCount > 0) {
      return `${this.gateBlockedCount} versiones tienen memoria suficiente, pero siguen frenadas por blockers de gate. Compare ya no es el problema; el problema es readiness editorial real.`;
    }

    if (this.compareReadyCount > 0) {
      return `${this.compareReadyCount} piezas ya tienen suficiente historial para comparar iteraciones con criterio. Version memory deja de ser catalogo y pasa a ser soporte operativo para review.`;
    }

    return 'Las versiones estan vivas, pero con poca profundidad de iteracion. El siguiente paso es seguir guardando memoria util para que compare y review ganen contexto.';
  }

  get focusCards(): Array<{ title: string; detail: string; link: string | any[]; tag: string; tagClass: string }> {
    const compareLead = this.compareReadyProjects[0];
    const blockedLead = this.versionedProjects.find((project) => project.reviewGate.blockerCount > 0);
    const missingLead = this.unversionedProjects[0];

    return [
      {
        title: compareLead ? compareLead.title : 'Compare lane',
        detail: compareLead
          ? `${compareLead.site.name} · ${compareLead.versionCount} snapshots ready for diff review.`
          : 'No project has enough saved history yet. Keep persisting iterations before relying on compare.',
        link: compareLead ? ['/studio/editorial/versions', compareLead.id] : '/studio/editorial/versions',
        tag: compareLead ? 'Compare ready' : 'Shallow memory',
        tagClass: compareLead ? 'console-tag--accent' : 'console-tag--muted',
      },
      {
        title: blockedLead ? blockedLead.title : 'Gate blockers',
        detail: blockedLead
          ? `${blockedLead.reviewGate.blockerCount} blockers · ${blockedLead.reviewGate.nextAction}`
          : 'No saved version is currently blocked by QA or release prerequisites.',
        link: blockedLead ? ['/studio/editorial/versions', blockedLead.id] : '/studio/review/qa',
        tag: blockedLead ? 'Blocked' : 'Healthy',
        tagClass: blockedLead ? 'console-tag--warning' : 'console-tag--success',
      },
      {
        title: missingLead ? missingLead.title : 'First version queue',
        detail: missingLead
          ? `${missingLead.site.name} · brief ready but still missing the first persisted output.`
          : 'Every visible project already has at least one saved version.',
        link: missingLead ? ['/studio/editorial/briefs', missingLead.id] : '/studio/editorial/articles',
        tag: missingLead ? 'Needs first pass' : 'Covered',
        tagClass: missingLead ? 'console-tag--danger' : 'console-tag--success',
      },
    ];
  }

  ngOnInit(): void {
    this.loadData();
  }

  loadData(): void {
    this.loading = true;
    this.error = '';

    forkJoin({
      sites: this.api.listSites(1, 100),
      projects: this.api.listProjects({ page: 1, pageSize: 100 }),
    }).subscribe({
      next: ({ sites, projects }) => {
        this.sites = sites.items;
        this.projects = projects.items.sort(
          (left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt),
        );
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
    const siteId = this.filterForm.controls.siteId.value;
    const focus = this.filterForm.controls.focus.value;

    this.versionedProjects = this.projects.filter((project) => Boolean(project.latestVersion));
    this.unversionedProjects = this.projects.filter((project) => !project.latestVersion);
    this.compareReadyCount = this.versionedProjects.filter((project) => project.reviewGate.compareReady).length;
    this.gateBlockedCount = this.versionedProjects.filter((project) => project.reviewGate.blockerCount > 0).length;

    this.filteredProjects = this.versionedProjects.filter((project) => {
      if (siteId && project.siteId !== siteId) {
        return false;
      }

      if (focus === 'needsReview' && !this.needsReview(project.reviewGate.stage)) {
        return false;
      }

      if (focus === 'approved' && project.reviewGate.stage !== 'approved') {
        return false;
      }

      if (focus === 'published' && project.reviewGate.stage !== 'published') {
        return false;
      }

      if (focus === 'compareReady' && !project.reviewGate.compareReady) {
        return false;
      }

      if (!query) {
        return true;
      }

      return [
        project.title,
        project.site.name,
        project.latestVersion?.title || '',
        project.latestVersion?.excerpt || '',
        project.reviewGate.primaryConcern,
        project.reviewGate.nextAction,
        ...(project.reviewGate.blockers || []),
        ...(project.reviewGate.warnings || []),
      ]
        .join(' ')
        .toLowerCase()
        .includes(query);
    });

    this.compareReadyProjects = this.versionedProjects
      .filter((project) => project.reviewGate.compareReady)
      .filter((project) => !siteId || project.siteId === siteId)
      .sort((left, right) => {
        if (right.versionCount !== left.versionCount) {
          return right.versionCount - left.versionCount;
        }

        return Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
      })
      .slice(0, 6);
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

  qaScore(project: StudioProjectSummary): number {
    return buildQaScore(project.latestVersion);
  }

  qaScoreLabel(project: StudioProjectSummary): string {
    return formatQaScoreLabel(this.qaScore(project));
  }

  truncate(text: string | null | undefined, limit: number): string {
    const normalized = text?.trim() ?? '';
    if (!normalized) {
      return '';
    }

    return normalized.length > limit
      ? `${normalized.slice(0, limit).trimEnd()}...`
      : normalized;
  }

  private needsReview(stage: ReviewGateStage): boolean {
    return ['needs_review', 'qa_blocked', 'ready_to_approve'].includes(stage);
  }
}
