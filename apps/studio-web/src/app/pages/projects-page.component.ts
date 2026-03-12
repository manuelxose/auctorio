import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import type {
  ProjectGoal,
  ProjectStatus,
  StudioProjectSummary,
  StudioSiteSummary,
} from '../models/studio.models';
import { StudioApiService } from '../services/studio-api.service';
import { formatApiError } from '../utils/api-error';

type ProjectCollectionView =
  | 'projects'
  | 'create'
  | 'pipeline'
  | 'briefs'
  | 'articles';

type ViewConfig = {
  kicker: string;
  title: string;
  intro: string;
  createTitle: string;
  createEyebrow: string;
  listTitle: string;
  filterTitle: string;
  signalsTitle: string;
  detailBasePath: string;
};

const VIEW_CONFIGS: Record<ProjectCollectionView, ViewConfig> = {
  projects: {
    kicker: 'Projects',
    title: 'All Projects',
    intro: 'Registro maestro del workspace editorial: briefs, articulos, destinos y estado de ejecucion.',
    createTitle: 'Create new project',
    createEyebrow: 'Create',
    listTitle: 'Project registry',
    filterTitle: 'Project explorer',
    signalsTitle: 'Workspace signals',
    detailBasePath: '/studio/projects',
  },
  create: {
    kicker: 'Projects',
    title: 'Create Project',
    intro: 'Alta de una nueva iniciativa editorial con brief inicial, objetivo y destino principal.',
    createTitle: 'Create new project',
    createEyebrow: 'Create',
    listTitle: 'Recent projects',
    filterTitle: 'Project explorer',
    signalsTitle: 'Create guidance',
    detailBasePath: '/studio/projects',
  },
  pipeline: {
    kicker: 'Editorial',
    title: 'Pipeline',
    intro: 'Vista operativa del flujo editorial para mover cada pieza desde brief hasta publicacion.',
    createTitle: 'Create pipeline item',
    createEyebrow: 'Create',
    listTitle: 'Pipeline items',
    filterTitle: 'Pipeline explorer',
    signalsTitle: 'Flow signals',
    detailBasePath: '/studio/projects',
  },
  briefs: {
    kicker: 'Editorial',
    title: 'Briefs',
    intro: 'Repositorio de briefs con contexto, destino, metadata y readiness para generacion.',
    createTitle: 'Create brief container',
    createEyebrow: 'Create',
    listTitle: 'Brief registry',
    filterTitle: 'Brief explorer',
    signalsTitle: 'Brief signals',
    detailBasePath: '/studio/editorial/briefs',
  },
  articles: {
    kicker: 'Editorial',
    title: 'Articles',
    intro: 'Inventario de piezas editoriales con version activa, estado QA y trazabilidad de publish.',
    createTitle: 'Create article project',
    createEyebrow: 'Create',
    listTitle: 'Article registry',
    filterTitle: 'Article explorer',
    signalsTitle: 'Article signals',
    detailBasePath: '/studio/editorial/articles',
  },
};

@Component({
  selector: 'app-projects-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  template: `
    <section class="console-page">
      <header class="console-page__header">
        <div class="console-page__copy">
          <p class="console-kicker">{{ viewConfig.kicker }}</p>
          <h1 class="console-page__title">{{ viewConfig.title }}</h1>
          <p class="console-page__intro">
            {{ viewConfig.intro }}
          </p>
        </div>

        <div class="console-page__actions">
          <span class="console-tag console-tag--accent">Live backend</span>
          <button type="button" class="console-button console-button--secondary" (click)="loadProjects()">
            Refresh
          </button>
        </div>
      </header>

      <div class="console-banner console-banner--error" *ngIf="createError">{{ createError }}</div>
      <div class="console-banner console-banner--error" *ngIf="listError">{{ listError }}</div>

      <div class="console-stat-grid">
        <article class="console-stat-card">
          <p class="console-stat-card__label">Total items</p>
          <strong class="console-stat-card__value">{{ projects.length }}</strong>
          <span class="console-stat-card__detail">Registros editoriales cargados bajo los filtros actuales.</span>
        </article>

        <article class="console-stat-card">
          <p class="console-stat-card__label">Review ready</p>
          <strong class="console-stat-card__value">{{ countByStatuses(['qa_passed', 'approved']) }}</strong>
          <span class="console-stat-card__detail">Piezas preparadas para decision humana o release.</span>
        </article>

        <article class="console-stat-card">
          <p class="console-stat-card__label">Published</p>
          <strong class="console-stat-card__value">{{ countByStatuses(['published']) }}</strong>
          <span class="console-stat-card__detail">Contenido ya sincronizado con un destino final.</span>
        </article>

        <article class="console-stat-card">
          <p class="console-stat-card__label">Blocked</p>
          <strong class="console-stat-card__value">{{ countByStatuses(['qa_failed', 'publish_failed']) }}</strong>
          <span class="console-stat-card__detail">Bloqueos de QA o publishing que exigen intervencion.</span>
        </article>
      </div>

      <div class="console-workspace">
        <div class="console-workspace__main">
          <section class="console-surface">
            <div class="console-surface__head">
              <div>
                <p class="console-surface__eyebrow">{{ viewConfig.createEyebrow }}</p>
                <h2 class="console-surface__title">{{ viewConfig.createTitle }}</h2>
              </div>
            </div>

            <form [formGroup]="createForm" (ngSubmit)="createProject()" class="console-form">
              <label class="console-field">
                <span>Destination</span>
                <select formControlName="siteId">
                  <option value="">Select a destination</option>
                  <option *ngFor="let site of sites" [value]="site.id">{{ site.name }}</option>
                </select>
              </label>

              <label class="console-field">
                <span>Working title</span>
                <input type="text" formControlName="title" />
              </label>

              <label class="console-field">
                <span>Brief</span>
                <textarea rows="5" formControlName="brief"></textarea>
              </label>

              <div class="console-form__grid">
                <label class="console-field">
                  <span>Goal</span>
                  <select formControlName="goal">
                    <option *ngFor="let goal of goals" [value]="goal">{{ goal }}</option>
                  </select>
                </label>

                <label class="console-field">
                  <span>Primary language</span>
                  <input type="text" formControlName="primaryLanguage" />
                </label>
              </div>

              <label class="console-field">
                <span>Metadata JSON</span>
                <textarea rows="4" formControlName="metadata"></textarea>
              </label>

              <div class="console-form__actions">
                <button type="submit" class="console-button" [disabled]="createLoading || createForm.invalid">
                  {{ createLoading ? 'Creating...' : 'Create project' }}
                </button>
              </div>
            </form>
          </section>
        </div>

        <aside class="console-workspace__aside">
          <section class="console-surface">
            <div class="console-surface__head">
              <div>
                <p class="console-surface__eyebrow">Filters</p>
                <h2 class="console-surface__title">{{ viewConfig.filterTitle }}</h2>
              </div>
            </div>

            <form [formGroup]="filterForm" (ngSubmit)="loadProjects()" class="console-form">
              <label class="console-field">
                <span>Search</span>
                <input
                  type="text"
                  formControlName="query"
                  placeholder="Title, brief, goal or destination"
                  (input)="applySearch()"
                />
              </label>

              <label class="console-field">
                <span>Destination</span>
                <select formControlName="siteId" (change)="loadProjects()">
                  <option value="">All destinations</option>
                  <option *ngFor="let site of sites" [value]="site.id">{{ site.name }}</option>
                </select>
              </label>

              <div class="console-form__grid">
                <label class="console-field">
                  <span>Status</span>
                  <select formControlName="status" (change)="loadProjects()">
                    <option value="">All statuses</option>
                    <option *ngFor="let status of statuses" [value]="status">{{ status }}</option>
                  </select>
                </label>

                <label class="console-field">
                  <span>Goal</span>
                  <select formControlName="goal" (change)="loadProjects()">
                    <option value="">All goals</option>
                    <option *ngFor="let goal of goals" [value]="goal">{{ goal }}</option>
                  </select>
                </label>
              </div>
            </form>
          </section>

          <section class="console-surface">
            <div class="console-surface__head">
              <div>
                <p class="console-surface__eyebrow">Signals</p>
                <h2 class="console-surface__title">{{ viewConfig.signalsTitle }}</h2>
              </div>
            </div>

            <ul class="console-note-list">
              <li class="console-note-list__item">
                La entidad viva del backend sigue siendo ContentProject, pero ahora se presenta con lenguaje editorial.
              </li>
              <li class="console-note-list__item">
                El mismo dato soporta registro de proyectos, pipeline, briefs y articulos segun la vista activa.
              </li>
              <li class="console-note-list__item">
                El siguiente salto de producto es reemplazar el brief plano por un editor estructurado y un board real.
              </li>
            </ul>
          </section>
        </aside>
      </div>

      <section class="console-surface">
        <div class="console-surface__head">
          <div>
            <p class="console-surface__eyebrow">List</p>
            <h2 class="console-surface__title">{{ viewConfig.listTitle }}</h2>
          </div>
        </div>

        <div class="console-list-grid" *ngIf="filteredProjects.length; else emptyProjects">
          <a
            class="console-list-card console-list-card--interactive"
            *ngFor="let project of filteredProjects"
            [routerLink]="[viewConfig.detailBasePath, project.id]"
          >
            <div>
              <strong>{{ project.title }}</strong>
              <p>{{ project.site.name }} · {{ project.goal }} · {{ project.status }}</p>
              <small *ngIf="project.latestVersion">
                V{{ project.latestVersion.versionNumber }} · QA {{ project.latestVersion.qaState }}
              </small>
            </div>
            <span class="console-tag">{{ project.primaryLanguage }}</span>
          </a>
        </div>
      </section>

      <ng-template #emptyProjects>
        <section class="console-empty-state">
          <div>
            <p class="console-kicker">No matching items</p>
            <h2>No records for the active filters</h2>
            <p>Prueba a limpiar filtros, crear un nuevo proyecto o revisar otro destino.</p>
          </div>
          <button type="button" class="console-button console-button--secondary" (click)="resetFilters()">
            Reset filters
          </button>
        </section>
      </ng-template>
    </section>
  `,
})
export class ProjectsPageComponent implements OnInit {
  private readonly api = inject(StudioApiService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly goals: ProjectGoal[] = [
    'article',
    'landing',
    'comparison',
    'faq',
    'newsletter',
    'social_pack',
  ];
  readonly statuses: ProjectStatus[] = [
    'draft',
    'ai_generated',
    'qa_failed',
    'qa_passed',
    'in_review',
    'approved',
    'publish_queued',
    'published',
    'publish_failed',
  ];

  readonly createForm = new FormGroup({
    siteId: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    title: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    brief: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    goal: new FormControl<ProjectGoal>('article', { nonNullable: true }),
    primaryLanguage: new FormControl('es', { nonNullable: true }),
    metadata: new FormControl('{}', { nonNullable: true }),
  });

  readonly filterForm = new FormGroup({
    query: new FormControl('', { nonNullable: true }),
    siteId: new FormControl('', { nonNullable: true }),
    status: new FormControl('', { nonNullable: true }),
    goal: new FormControl('', { nonNullable: true }),
  });

  sites: StudioSiteSummary[] = [];
  projects: StudioProjectSummary[] = [];
  filteredProjects: StudioProjectSummary[] = [];
  createLoading = false;
  createError = '';
  listError = '';
  view: ProjectCollectionView = 'projects';

  get viewConfig(): ViewConfig {
    return VIEW_CONFIGS[this.view];
  }

  ngOnInit(): void {
    this.view =
      (this.route.snapshot.data['projectCollectionView'] as ProjectCollectionView | undefined) ??
      'projects';

    this.api.listSites(1, 100).subscribe({
      next: (response) => {
        this.sites = response.items;
      },
      error: (error) => {
        this.listError = formatApiError(error);
      },
    });
    this.loadProjects();
  }

  loadProjects(): void {
    this.listError = '';

    this.api
      .listProjects({
        siteId: this.filterForm.controls.siteId.value || undefined,
        status: (this.filterForm.controls.status.value || undefined) as ProjectStatus | undefined,
        goal: (this.filterForm.controls.goal.value || undefined) as ProjectGoal | undefined,
        page: 1,
        pageSize: 100,
      })
      .subscribe({
        next: (response) => {
          this.projects = response.items;
          this.applySearch();
        },
        error: (error) => {
          this.listError = formatApiError(error);
        },
      });
  }

  applySearch(): void {
    const query = this.filterForm.controls.query.value.trim().toLowerCase();

    this.filteredProjects = this.projects.filter((project) => {
      if (!query) {
        return true;
      }

      return [
        project.title,
        project.brief,
        project.site.name,
        project.goal,
        project.status,
      ]
        .join(' ')
        .toLowerCase()
        .includes(query);
    });
  }

  resetFilters(): void {
    this.filterForm.reset({
      query: '',
      siteId: '',
      status: '',
      goal: '',
    });
    this.loadProjects();
  }

  createProject(): void {
    if (this.createForm.invalid || this.createLoading) {
      this.createForm.markAllAsTouched();
      return;
    }

    this.createLoading = true;
    this.createError = '';

    let metadata: Record<string, unknown> | null = null;
    try {
      const trimmed = this.createForm.controls.metadata.value.trim();
      metadata = trimmed ? (JSON.parse(trimmed) as Record<string, unknown>) : null;
    } catch (error) {
      this.createLoading = false;
      this.createError = formatApiError(error);
      return;
    }

    this.api
      .createProject({
        siteId: this.createForm.controls.siteId.value,
        title: this.createForm.controls.title.value.trim(),
        brief: this.createForm.controls.brief.value.trim(),
        goal: this.createForm.controls.goal.value,
        primaryLanguage: this.createForm.controls.primaryLanguage.value.trim(),
        metadata,
      })
      .subscribe({
        next: (project) => {
          this.createLoading = false;
          this.loadProjects();
          void this.router.navigate(['/studio/projects', project.id]);
        },
        error: (error) => {
          this.createLoading = false;
          this.createError = formatApiError(error);
        },
      });
  }

  countByStatuses(statuses: ProjectStatus[]): number {
    return this.projects.filter((project) => statuses.includes(project.status)).length;
  }
}
