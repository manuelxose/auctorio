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
  ReviewGateStage,
  StudioProjectSummary,
  StudioSiteSummary,
} from '../models/studio.models';
import { StudioApiService } from '../services/studio-api.service';
import {
  buildProjectPayloadFromBriefEditor,
  createEmptyProjectBriefEditorValue,
} from '../utils/project-brief';
import { StudioPageHeaderComponent } from '../components/studio-page-header.component';
import { formatApiError } from '../utils/api-error';
import { buildQaScore, qaScoreLabel, reviewStageLabel, reviewStageTone } from '../utils/review-gate';

type ProjectCollectionView =
  | 'projects'
  | 'create'
  | 'pipeline'
  | 'briefs'
  | 'articles';

type ProjectFocus =
  | 'all'
  | 'intake'
  | 'review'
  | 'release'
  | 'blocked'
  | 'live';

type TagTone = 'muted' | 'accent' | 'warning' | 'success' | 'danger';

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
  imports: [CommonModule, ReactiveFormsModule, RouterLink, StudioPageHeaderComponent],
  template: `
    <section class="console-page">
      <app-studio-page-header
        [kicker]="viewConfig.kicker"
        [title]="viewConfig.title"
        [intro]="viewConfig.intro"
      >
        <div page-actions>
          <span class="console-tag console-tag--accent">Live backend</span>
          <a class="console-button console-button--secondary" routerLink="/studio/editorial/pipeline">
            Open pipeline
          </a>
          <button type="button" class="console-button console-button--secondary" (click)="loadProjects()">
            Refresh
          </button>
        </div>
      </app-studio-page-header>

      <div class="console-banner console-banner--error" *ngIf="createError">{{ createError }}</div>
      <div class="console-banner console-banner--error" *ngIf="listError">{{ listError }}</div>

      <div class="console-stat-grid">
        <article class="console-stat-card">
          <p class="console-stat-card__label">Total items</p>
          <strong class="console-stat-card__value">{{ projects.length }}</strong>
          <span class="console-stat-card__detail">Registros editoriales cargados bajo los filtros actuales.</span>
        </article>

        <article class="console-stat-card">
          <p class="console-stat-card__label">Human decisions</p>
          <strong class="console-stat-card__value">{{ countByFocus('review') }}</strong>
          <span class="console-stat-card__detail">Piezas esperando lectura humana, QA final o aprobacion editorial.</span>
        </article>

        <article class="console-stat-card">
          <p class="console-stat-card__label">Release ready</p>
          <strong class="console-stat-card__value">{{ countByFocus('release') }}</strong>
          <span class="console-stat-card__detail">Contenido ya publicable o sincronizable sin blockers editoriales abiertos.</span>
        </article>

        <article class="console-stat-card">
          <p class="console-stat-card__label">Blocked</p>
          <strong class="console-stat-card__value">{{ countByFocus('blocked') }}</strong>
          <span class="console-stat-card__detail">Bloqueos de QA, metadata, asset o publishing que exigen intervencion.</span>
        </article>
      </div>

      <section class="console-surface console-surface--hero">
        <div class="console-hero-grid console-hero-grid--compact">
          <div class="console-hero-copy">
            <p class="console-surface__eyebrow">Intake control</p>
            <h2 class="console-surface__title">Structured briefs, live gate, cleaner registry</h2>
            <p class="console-hero-copy__body">
              La entrada editorial ya es operativa. Esta superficie combina composer, filtros y gate real para mover briefs
              hacia generación, revisión y release sin volver a caer en pantallas sueltas.
            </p>

            <div class="console-chip-row">
              <span class="console-chip">Intake {{ countByFocus('intake') }}</span>
              <span class="console-chip">Review {{ countByFocus('review') }}</span>
              <span class="console-chip">Release {{ countByFocus('release') }}</span>
              <span class="console-chip">Blocked {{ countByFocus('blocked') }}</span>
            </div>
          </div>

          <div class="console-focus-stack">
            <div class="console-surface__head">
              <div>
                <p class="console-surface__eyebrow">Priority lane</p>
                <h2 class="console-surface__title">Projects to move next</h2>
              </div>
            </div>

            <div class="console-focus-list" *ngIf="priorityProjects.length; else emptyPriorityProjects">
              <a
                class="console-focus-card"
                *ngFor="let project of priorityProjects"
                [routerLink]="[viewConfig.detailBasePath, project.id]"
              >
                <div>
                  <strong>{{ project.title }}</strong>
                  <p>{{ project.site.name }} · {{ projectNarrative(project) }}</p>
                </div>
                <span
                  class="console-tag"
                  [class.console-tag--accent]="reviewStageTone(project.reviewGate.stage) === 'accent'"
                  [class.console-tag--warning]="reviewStageTone(project.reviewGate.stage) === 'warning'"
                  [class.console-tag--success]="reviewStageTone(project.reviewGate.stage) === 'success'"
                  [class.console-tag--danger]="reviewStageTone(project.reviewGate.stage) === 'danger'"
                  [class.console-tag--muted]="reviewStageTone(project.reviewGate.stage) === 'muted'"
                >
                  {{ reviewStageLabel(project.reviewGate.stage) }}
                </span>
              </a>
            </div>
          </div>
        </div>
      </section>

      <div class="console-workspace">
        <div class="console-workspace__main">
          <section class="console-surface console-surface--editorial">
            <div class="console-surface__head">
              <div>
                <p class="console-surface__eyebrow">{{ viewConfig.createEyebrow }}</p>
                <h2 class="console-surface__title">{{ viewConfig.createTitle }}</h2>
              </div>
            </div>

            <div class="console-project-composer__intro">
              <div>
                <strong>Structured editorial composer</strong>
                <p>
                  Define destination, search intent, editorial angle, sections y metadata antes de lanzar la primera versión.
                </p>
              </div>

              <div class="console-header-strip">
                <article class="console-header-strip__card">
                  <span>Destination</span>
                  <strong>{{ createForm.controls.siteId.value ? 'Ready' : 'Missing' }}</strong>
                  <small>Necesario para alinear destino, locale y adapter.</small>
                </article>
                <article class="console-header-strip__card">
                  <span>Search intent</span>
                  <strong>{{ hasSearchIntent ? 'Ready' : 'Thin' }}</strong>
                  <small>Query, audience y angle definen la oportunidad editorial.</small>
                </article>
                <article class="console-header-strip__card">
                  <span>Context pack</span>
                  <strong>{{ hasOperationalContext ? 'Ready' : 'Thin' }}</strong>
                  <small>Sections, notes y keywords alimentan generación y QA.</small>
                </article>
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

              <div class="console-form__grid">
                <label class="console-field">
                  <span>Working title</span>
                  <input type="text" formControlName="title" />
                </label>

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
                <span>Editorial brief summary</span>
                <textarea rows="5" formControlName="briefSummary"></textarea>
              </label>

              <div class="console-form__grid">
                <label class="console-field">
                  <span>Target query</span>
                  <input type="text" formControlName="targetQuery" />
                </label>

                <label class="console-field">
                  <span>Audience</span>
                  <input type="text" formControlName="audience" />
                </label>
              </div>

              <div class="console-form__grid">
                <label class="console-field">
                  <span>Angle</span>
                  <input type="text" formControlName="angle" />
                </label>

                <label class="console-field">
                  <span>Tone</span>
                  <input type="text" formControlName="tone" />
                </label>
              </div>

              <div class="console-form__grid">
                <label class="console-field">
                  <span>CTA</span>
                  <input type="text" formControlName="cta" />
                </label>

                <label class="console-field">
                  <span>Author</span>
                  <input type="text" formControlName="author" />
                </label>
              </div>

              <div class="console-form__grid">
                <label class="console-field">
                  <span>Keywords</span>
                  <input type="text" formControlName="keywords" />
                </label>

                <label class="console-field">
                  <span>Categories</span>
                  <input type="text" formControlName="categories" />
                </label>
              </div>

              <div class="console-form__grid">
                <label class="console-field">
                  <span>Preferred slug</span>
                  <input type="text" formControlName="slug" />
                </label>

                <label class="console-field">
                  <span>Canonical URL</span>
                  <input type="url" formControlName="canonicalUrl" />
                </label>
              </div>

              <label class="console-field">
                <span>Required sections</span>
                <textarea rows="4" formControlName="requiredSections"></textarea>
              </label>

              <label class="console-field">
                <span>Facts and source notes</span>
                <textarea rows="4" formControlName="sourceNotes"></textarea>
              </label>

              <label class="console-field">
                <span class="console-inline-actions">
                  <input type="checkbox" formControlName="featured" />
                  Featured placement
                </span>
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
                  placeholder="Title, gate, blocker, brief or destination"
                  (input)="applySearch()"
                />
              </label>

              <label class="console-field">
                <span>Focus</span>
                <select formControlName="focus" (change)="applySearch()">
                  <option value="all">All projects</option>
                  <option value="intake">Needs generation</option>
                  <option value="review">Needs decision</option>
                  <option value="release">Release ready</option>
                  <option value="blocked">Blocked</option>
                  <option value="live">Live</option>
                </select>
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
                  <span>Tech status</span>
                  <select formControlName="status" (change)="loadProjects()">
                    <option value="">All technical statuses</option>
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
                Este composer genera un brief legible para IA y metadata estructurada sobre el mismo ContentProject.
              </li>
              <li class="console-note-list__item">
                Keywords, sections, CTA y notas de fuente dejan de vivir en un textarea JSON sin contexto.
              </li>
              <li class="console-note-list__item">
                El siguiente salto sigue siendo un board real y social publishing, pero la entrada editorial ya deja de ser ciega.
              </li>
            </ul>
          </section>

          <section class="console-surface">
            <div class="console-surface__head">
              <div>
                <p class="console-surface__eyebrow">Preview</p>
                <h2 class="console-surface__title">Generated payload</h2>
              </div>
            </div>

            <div class="console-code-block">
              <pre>{{ briefPreview }}</pre>
            </div>

            <div class="console-code-block">
              <pre>{{ metadataPreview }}</pre>
            </div>
          </section>

          <section class="console-surface">
            <div class="console-surface__head">
              <div>
                <p class="console-surface__eyebrow">Readiness</p>
                <h2 class="console-surface__title">Pre-flight checks</h2>
              </div>
            </div>

            <ul class="console-note-list">
              <li class="console-note-list__item">
                Destination: {{ createForm.controls.siteId.value ? 'ready' : 'missing' }}
              </li>
              <li class="console-note-list__item">
                Editorial summary: {{ createForm.controls.briefSummary.value.trim() ? 'ready' : 'missing' }}
              </li>
              <li class="console-note-list__item">
                Search intent: {{ hasSearchIntent ? 'ready' : 'thin' }}
              </li>
              <li class="console-note-list__item">
                Context and sections: {{ hasOperationalContext ? 'ready' : 'thin' }}
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
          <div class="console-chip-row">
            <span class="console-chip">{{ filteredProjects.length }} visible</span>
            <span class="console-chip">Focus {{ filterForm.controls.focus.value }}</span>
          </div>
        </div>

        <div class="console-list-grid" *ngIf="filteredProjects.length; else emptyProjects">
          <a
            class="console-list-card console-list-card--interactive"
            *ngFor="let project of filteredProjects"
            [routerLink]="[viewConfig.detailBasePath, project.id]"
          >
            <div class="console-version-card__head">
              <div>
                <strong>{{ project.title }}</strong>
                <p>{{ project.site.name }} · {{ project.goal }} · {{ projectNarrative(project) }}</p>
                <small>{{ projectMeta(project) }}</small>
              </div>
              <div class="console-version-card__tags">
                <span
                  class="console-tag"
                  [class.console-tag--accent]="reviewStageTone(project.reviewGate.stage) === 'accent'"
                  [class.console-tag--warning]="reviewStageTone(project.reviewGate.stage) === 'warning'"
                  [class.console-tag--success]="reviewStageTone(project.reviewGate.stage) === 'success'"
                  [class.console-tag--danger]="reviewStageTone(project.reviewGate.stage) === 'danger'"
                  [class.console-tag--muted]="reviewStageTone(project.reviewGate.stage) === 'muted'"
                >
                  {{ reviewStageLabel(project.reviewGate.stage) }}
                </span>
                <span class="console-tag console-tag--muted">{{ project.primaryLanguage }}</span>
              </div>
            </div>
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

      <ng-template #emptyPriorityProjects>
        <div class="console-empty-compact">
          <p>No priority projects in the current workspace view.</p>
        </div>
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
    siteId: new FormControl(createEmptyProjectBriefEditorValue().siteId, {
      nonNullable: true,
      validators: [Validators.required],
    }),
    title: new FormControl(createEmptyProjectBriefEditorValue().title, {
      nonNullable: true,
      validators: [Validators.required],
    }),
    goal: new FormControl<ProjectGoal>(createEmptyProjectBriefEditorValue().goal, {
      nonNullable: true,
    }),
    primaryLanguage: new FormControl(createEmptyProjectBriefEditorValue().primaryLanguage, {
      nonNullable: true,
    }),
    briefSummary: new FormControl(createEmptyProjectBriefEditorValue().briefSummary, {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(24)],
    }),
    targetQuery: new FormControl(createEmptyProjectBriefEditorValue().targetQuery, {
      nonNullable: true,
    }),
    audience: new FormControl(createEmptyProjectBriefEditorValue().audience, {
      nonNullable: true,
    }),
    angle: new FormControl(createEmptyProjectBriefEditorValue().angle, {
      nonNullable: true,
    }),
    tone: new FormControl(createEmptyProjectBriefEditorValue().tone, {
      nonNullable: true,
    }),
    cta: new FormControl(createEmptyProjectBriefEditorValue().cta, {
      nonNullable: true,
    }),
    sourceNotes: new FormControl(createEmptyProjectBriefEditorValue().sourceNotes, {
      nonNullable: true,
    }),
    requiredSections: new FormControl(createEmptyProjectBriefEditorValue().requiredSections, {
      nonNullable: true,
    }),
    keywords: new FormControl(createEmptyProjectBriefEditorValue().keywords, {
      nonNullable: true,
    }),
    categories: new FormControl(createEmptyProjectBriefEditorValue().categories, {
      nonNullable: true,
    }),
    author: new FormControl(createEmptyProjectBriefEditorValue().author, {
      nonNullable: true,
    }),
    slug: new FormControl(createEmptyProjectBriefEditorValue().slug, {
      nonNullable: true,
    }),
    canonicalUrl: new FormControl(createEmptyProjectBriefEditorValue().canonicalUrl, {
      nonNullable: true,
    }),
    featured: new FormControl(createEmptyProjectBriefEditorValue().featured, {
      nonNullable: true,
    }),
  });

  readonly filterForm = new FormGroup({
    query: new FormControl('', { nonNullable: true }),
    focus: new FormControl<ProjectFocus>('all', { nonNullable: true }),
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

  get briefPreview(): string {
    return this.structuredPayload.brief || 'The editorial brief preview will appear here.';
  }

  get metadataPreview(): string {
    return JSON.stringify(this.structuredPayload.metadata || {}, null, 2);
  }

  get hasSearchIntent(): boolean {
    return Boolean(
      this.createForm.controls.targetQuery.value.trim() ||
        this.createForm.controls.audience.value.trim() ||
        this.createForm.controls.angle.value.trim(),
    );
  }

  get hasOperationalContext(): boolean {
    return Boolean(
      this.createForm.controls.requiredSections.value.trim() ||
        this.createForm.controls.sourceNotes.value.trim() ||
        this.createForm.controls.keywords.value.trim(),
    );
  }

  get priorityProjects(): StudioProjectSummary[] {
    return [...this.filteredProjects].slice(0, 3);
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
    const focus = this.filterForm.controls.focus.value;

    this.filteredProjects = this.projects
      .filter((project) => this.matchesFocus(project, focus))
      .filter((project) => {
      if (!query) {
        return true;
      }

      return [
        project.title,
        project.brief,
        project.site.name,
        project.goal,
        project.reviewGate.stage,
        project.reviewGate.nextAction,
        project.reviewGate.primaryConcern,
        project.latestVersion?.title ?? '',
        project.latestVersion?.excerpt ?? '',
        ...(project.reviewGate.blockers ?? []),
        ...(project.reviewGate.warnings ?? []),
      ]
        .join(' ')
        .toLowerCase()
        .includes(query);
      })
      .sort((left, right) => {
        const rankDelta = this.projectPriority(right) - this.projectPriority(left);
        if (rankDelta !== 0) {
          return rankDelta;
        }

        return Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
      });
  }

  resetFilters(): void {
    this.filterForm.reset({
      query: '',
      focus: 'all',
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

    this.api
      .createProject(this.structuredPayload)
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

  countByFocus(focus: Exclude<ProjectFocus, 'all'>): number {
    return this.projects.filter((project) => this.matchesFocus(project, focus)).length;
  }

  reviewStageLabel(stage: ReviewGateStage): string {
    return reviewStageLabel(stage);
  }

  reviewStageTone(stage: ReviewGateStage): TagTone {
    return reviewStageTone(stage);
  }

  projectNarrative(project: StudioProjectSummary): string {
    if (this.isBlocked(project)) {
      return project.reviewGate.primaryConcern;
    }

    if (this.isReleaseReady(project)) {
      return `Release ready · ${project.reviewGate.nextAction}`;
    }

    return project.reviewGate.nextAction;
  }

  projectMeta(project: StudioProjectSummary): string {
    const parts: string[] = [];
    if (project.latestVersion) {
      parts.push(`V${project.latestVersion.versionNumber}`);
      const qaScore = buildQaScore(project.latestVersion);
      parts.push(qaScore > 0 ? `${qaScoreLabel(qaScore)} · ${qaScore}/100` : 'QA pending');
    } else {
      parts.push('No generated version yet');
    }

    parts.push(`Gate ${this.reviewStageLabel(project.reviewGate.stage)}`);
    return parts.join(' · ');
  }

  private get structuredPayload() {
    return buildProjectPayloadFromBriefEditor({
      siteId: this.createForm.controls.siteId.value,
      title: this.createForm.controls.title.value,
      goal: this.createForm.controls.goal.value,
      primaryLanguage: this.createForm.controls.primaryLanguage.value,
      briefSummary: this.createForm.controls.briefSummary.value,
      targetQuery: this.createForm.controls.targetQuery.value,
      audience: this.createForm.controls.audience.value,
      angle: this.createForm.controls.angle.value,
      tone: this.createForm.controls.tone.value,
      cta: this.createForm.controls.cta.value,
      sourceNotes: this.createForm.controls.sourceNotes.value,
      requiredSections: this.createForm.controls.requiredSections.value,
      keywords: this.createForm.controls.keywords.value,
      categories: this.createForm.controls.categories.value,
      author: this.createForm.controls.author.value,
      slug: this.createForm.controls.slug.value,
      canonicalUrl: this.createForm.controls.canonicalUrl.value,
      featured: this.createForm.controls.featured.value,
    });
  }

  private matchesFocus(project: StudioProjectSummary, focus: ProjectFocus): boolean {
    switch (focus) {
      case 'intake':
        return project.reviewGate.stage === 'awaiting_generation';
      case 'review':
        return this.needsHumanDecision(project);
      case 'release':
        return this.isReleaseReady(project);
      case 'blocked':
        return this.isBlocked(project);
      case 'live':
        return project.reviewGate.stage === 'published';
      case 'all':
      default:
        return true;
    }
  }

  private needsHumanDecision(project: StudioProjectSummary): boolean {
    return ['needs_review', 'ready_to_approve'].includes(project.reviewGate.stage);
  }

  private isReleaseReady(project: StudioProjectSummary): boolean {
    return (
      project.reviewGate.publishReady &&
      ['approved', 'publish_queued', 'publish_failed'].includes(project.reviewGate.stage)
    );
  }

  private isBlocked(project: StudioProjectSummary): boolean {
    return project.reviewGate.blockerCount > 0 || project.reviewGate.stage === 'publish_failed';
  }

  private projectPriority(project: StudioProjectSummary): number {
    if (this.isBlocked(project)) {
      return 5;
    }

    if (this.isReleaseReady(project)) {
      return 4;
    }

    if (project.reviewGate.stage === 'ready_to_approve') {
      return 3;
    }

    if (project.reviewGate.stage === 'needs_review') {
      return 2;
    }

    if (project.reviewGate.stage === 'awaiting_generation') {
      return 1;
    }

    return 0;
  }
}
