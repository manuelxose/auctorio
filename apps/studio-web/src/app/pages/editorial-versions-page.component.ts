import { CommonModule, DatePipe } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import type { ProjectStatus, StudioProjectSummary, StudioSiteSummary } from '../models/studio.models';
import { StudioApiService } from '../services/studio-api.service';
import { formatApiError } from '../utils/api-error';

type VersionFocus = 'all' | 'needsReview' | 'approved' | 'published' | 'compareReady';

@Component({
  selector: 'app-editorial-versions-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, DatePipe],
  template: `
    <section class="console-page">
      <header class="console-page__header">
        <div class="console-page__copy">
          <p class="console-kicker">Editorial</p>
          <h1 class="console-page__title">Versions</h1>
          <p class="console-page__intro">
            Inventario de snapshots editoriales, readiness QA y capacidad de comparación antes de aprobar o publicar.
          </p>
        </div>

        <div class="console-page__actions">
          <a class="console-button console-button--secondary" routerLink="/studio/editorial/articles">
            Open articles
          </a>
          <button type="button" class="console-button" (click)="loadData()">Refresh versions</button>
        </div>
      </header>

      <div class="console-banner console-banner--error" *ngIf="error">{{ error }}</div>

      <div class="console-stat-grid" *ngIf="!loading">
        <article class="console-stat-card">
          <p class="console-stat-card__label">Latest snapshots</p>
          <strong class="console-stat-card__value">{{ versionedProjects.length }}</strong>
          <span class="console-stat-card__detail">Proyectos que ya cuentan con al menos una version registrada.</span>
        </article>

        <article class="console-stat-card">
          <p class="console-stat-card__label">Compare ready</p>
          <strong class="console-stat-card__value">{{ compareReadyCount }}</strong>
          <span class="console-stat-card__detail">Piezas con suficiente memoria de revisiones para abrir compare mode.</span>
        </article>

        <article class="console-stat-card">
          <p class="console-stat-card__label">Approved snapshots</p>
          <strong class="console-stat-card__value">{{ approvedCount }}</strong>
          <span class="console-stat-card__detail">Versiones activas ya aprobadas y listas para release.</span>
        </article>

        <article class="console-stat-card">
          <p class="console-stat-card__label">Without version</p>
          <strong class="console-stat-card__value">{{ unversionedProjects.length }}</strong>
          <span class="console-stat-card__detail">Briefs o proyectos que aun no han generado una primera salida versionada.</span>
        </article>
      </div>

      <div class="console-workspace" *ngIf="!loading; else loadingState">
        <div class="console-workspace__main">
          <section class="console-surface">
            <div class="console-surface__head">
              <div>
                <p class="console-surface__eyebrow">Explorer</p>
                <h2 class="console-surface__title">Version memory</h2>
              </div>
            </div>

            <form class="console-toolbar console-toolbar--stretch" [formGroup]="filterForm">
              <label class="console-search console-search--wide">
                <span>Search</span>
                <input
                  type="text"
                  formControlName="query"
                  placeholder="Project, version title, excerpt or destination"
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
                    <span
                      class="console-tag"
                      [class.console-tag--success]="project.latestVersion?.qaState === 'published'"
                      [class.console-tag--accent]="project.latestVersion?.qaState === 'approved' || project.latestVersion?.qaState === 'passed'"
                      [class.console-tag--warning]="project.latestVersion?.qaState === 'not_ready'"
                      [class.console-tag--danger]="project.latestVersion?.qaState === 'failed'"
                    >
                      {{ project.latestVersion?.qaState }}
                    </span>
                    <span class="console-tag console-tag--muted">{{ project.latestVersion?.status }}</span>
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
                    <span>Updated</span>
                    <strong>{{ project.latestVersion?.updatedAt | date: 'short' }}</strong>
                  </article>
                  <article class="console-meta-card">
                    <span>Publication</span>
                    <strong>{{ project.latestVersion?.latestPublicationJob?.status || 'not shipped' }}</strong>
                  </article>
                </div>

                <div class="console-inline-actions">
                  <a class="console-button console-button--secondary" [routerLink]="['/studio/editorial/articles', project.id]">
                    Open article
                  </a>
                  <a
                    class="console-button"
                    [routerLink]="['/studio/editorial/versions', project.id]"
                  >
                    {{ isCompareReady(project) ? 'Compare versions' : 'Open version detail' }}
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
                  <p>{{ project.site.name }} · {{ project.status }} · {{ truncate(project.brief, 120) }}</p>
                </div>
                <a class="console-link" [routerLink]="['/studio/editorial/briefs', project.id]">Open brief</a>
              </article>
            </div>
          </section>
        </div>

        <aside class="console-workspace__aside">
          <section class="console-surface">
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
                  <span>{{ project.site.name }} · V{{ project.latestVersion?.versionNumber }}</span>
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
                La version activa sigue siendo la referencia operativa, pero esta vista separa memoria editorial de article editing.
              </li>
              <li class="console-note-list__item">
                Compare ready usa el numero de version como proxy de historial suficiente para comparar iteraciones.
              </li>
              <li class="console-note-list__item">
                El siguiente salto sera añadir restore o promote version cuando el backend exponga esa accion.
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
            <p>Estamos reuniendo snapshots, estados QA y readiness de comparación.</p>
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
  approvedCount = 0;
  loading = true;
  error = '';

  ngOnInit(): void {
    this.loadData();
  }

  loadData(): void {
    this.loading = true;
    this.error = '';

    this.api.listSites(1, 100).subscribe({
      next: (sites) => {
        this.sites = sites.items;
        this.api.listProjects({ page: 1, pageSize: 100 }).subscribe({
          next: (projects) => {
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
    this.compareReadyCount = this.versionedProjects.filter((project) => this.isCompareReady(project)).length;
    this.approvedCount = this.versionedProjects.filter((project) =>
      ['approved', 'published'].includes(project.latestVersion?.status || ''),
    ).length;

    this.filteredProjects = this.versionedProjects
      .filter((project) => {
        if (siteId && project.siteId !== siteId) {
          return false;
        }

        if (focus === 'needsReview' && !this.needsReview(project.status)) {
          return false;
        }

        if (focus === 'approved' && !['approved'].includes(project.latestVersion?.status || '')) {
          return false;
        }

        if (focus === 'published' && !['published'].includes(project.latestVersion?.status || '')) {
          return false;
        }

        if (focus === 'compareReady' && !this.isCompareReady(project)) {
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
          project.latestVersion?.status || '',
          project.latestVersion?.qaState || '',
        ]
          .join(' ')
          .toLowerCase()
          .includes(query);
      });

    this.compareReadyProjects = this.versionedProjects
      .filter((project) => this.isCompareReady(project))
      .filter((project) => !siteId || project.siteId === siteId)
      .slice(0, 6);
  }

  isCompareReady(project: StudioProjectSummary): boolean {
    return (project.latestVersion?.versionNumber ?? 0) > 1;
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

  private needsReview(status: ProjectStatus): boolean {
    return ['ai_generated', 'qa_failed', 'qa_passed', 'in_review'].includes(status);
  }
}
