import { CommonModule, DatePipe, JsonPipe } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import type { StudioProjectDetailView } from '../models/studio.models';
import { StudioApiService } from '../services/studio-api.service';
import { formatApiError } from '../utils/api-error';

type ProjectWorkbenchView = 'overview' | 'brief' | 'article';

type WorkbenchConfig = {
  kicker: string;
  backLabel: string;
  backLink: string;
  intro: string;
  contextTitle: string;
  feedbackTitle: string;
  outputTitle: string;
};

const WORKBENCH_CONFIGS: Record<ProjectWorkbenchView, WorkbenchConfig> = {
  overview: {
    kicker: 'Projects',
    backLabel: 'Back to projects',
    backLink: '/studio/projects',
    intro: 'Resumen operativo del proyecto, sus versiones, QA y publishing.',
    contextTitle: 'Brief and metadata',
    feedbackTitle: 'Revision loop',
    outputTitle: 'Latest output',
  },
  brief: {
    kicker: 'Editorial / Briefs',
    backLabel: 'Back to briefs',
    backLink: '/studio/editorial/briefs',
    intro: 'Contexto editorial, metadata y readiness del brief antes de generar o revisar.',
    contextTitle: 'Brief context',
    feedbackTitle: 'Revision notes',
    outputTitle: 'Current editorial output',
  },
  article: {
    kicker: 'Editorial / Articles',
    backLabel: 'Back to articles',
    backLink: '/studio/editorial/articles',
    intro: 'Articulo vivo con salida AI, SEO, assets y trazabilidad de publicacion.',
    contextTitle: 'Editorial context',
    feedbackTitle: 'Human review loop',
    outputTitle: 'Article canvas',
  },
};

@Component({
  selector: 'app-project-detail-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, DatePipe, JsonPipe, RouterLink],
  template: `
    <section class="console-page" *ngIf="project; else loadingState">
      <header class="console-page__header">
        <div class="console-page__copy">
          <p class="console-kicker">{{ workbench.kicker }}</p>
          <h1 class="console-page__title">{{ project.title }}</h1>
          <p class="console-page__intro">
            {{ workbench.intro }} {{ project.site.name }} · {{ project.status }} · {{ project.goal }} · {{ project.primaryLanguage }}
          </p>
        </div>

        <div class="console-page__actions">
          <a class="console-button console-button--secondary" [routerLink]="workbench.backLink">
            {{ workbench.backLabel }}
          </a>
          <a
            class="console-button console-button--secondary"
            *ngIf="!isBriefView"
            [routerLink]="['/studio/editorial/versions', project.id]"
          >
            Open versions
          </a>
          <button type="button" class="console-button console-button--secondary" (click)="loadProject()">
            Refresh
          </button>
          <button type="button" class="console-button console-button--secondary" (click)="generate()">
            Generate text
          </button>
          <button
            type="button"
            class="console-button console-button--secondary"
            *ngIf="!isBriefView"
            (click)="generateAsset()"
          >
            Generate image
          </button>
          <button
            type="button"
            class="console-button console-button--secondary"
            *ngIf="canApprove"
            (click)="approve()"
          >
            Approve
          </button>
          <button
            type="button"
            class="console-button console-button--secondary"
            *ngIf="canPublish"
            (click)="syncDraft()"
          >
            Sync draft
          </button>
          <button type="button" class="console-button" *ngIf="canPublish" (click)="publish()">Publish</button>
        </div>
      </header>

      <div class="console-banner console-banner--success" *ngIf="notice">{{ notice }}</div>
      <div class="console-banner console-banner--error" *ngIf="error">{{ error }}</div>

      <div class="console-stat-grid">
        <article class="console-stat-card">
          <p class="console-stat-card__label">Latest version</p>
          <strong class="console-stat-card__value">
            {{ project.latestVersion ? 'V' + project.latestVersion.versionNumber : 'None' }}
          </strong>
          <span class="console-stat-card__detail">Ultima version registrada dentro del workflow.</span>
        </article>

        <article class="console-stat-card">
          <p class="console-stat-card__label">QA state</p>
          <strong class="console-stat-card__value">{{ project.latestVersion?.qaState || 'not_ready' }}</strong>
          <span class="console-stat-card__detail">Readiness editorial de la version activa.</span>
        </article>

        <article class="console-stat-card">
          <p class="console-stat-card__label">Asset</p>
          <strong class="console-stat-card__value">{{ project.latestAssetUrl ? 'Ready' : 'Pending' }}</strong>
          <span class="console-stat-card__detail">Disponibilidad de hero image para publish y reuse.</span>
        </article>

        <article class="console-stat-card">
          <p class="console-stat-card__label">Publication runs</p>
          <strong class="console-stat-card__value">{{ project.publicationJobs.length }}</strong>
          <span class="console-stat-card__detail">Historial de publish, draft sync y retiros sobre esta pieza.</span>
        </article>
      </div>

      <div class="console-workspace">
        <div class="console-workspace__main">
          <section class="console-surface">
            <div class="console-surface__head">
              <div>
                <p class="console-surface__eyebrow">Context</p>
                <h2 class="console-surface__title">{{ workbench.contextTitle }}</h2>
              </div>
            </div>

            <p class="console-rich-copy">{{ project.brief }}</p>

            <div class="console-meta-grid">
              <article class="console-meta-card">
                <span>Destination</span>
                <strong>{{ project.site.key }}</strong>
              </article>
              <article class="console-meta-card">
                <span>Topic</span>
                <strong>{{ project.topic?.title || 'Unlinked' }}</strong>
              </article>
              <article class="console-meta-card">
                <span>Credential ref</span>
                <strong>{{ project.site.publishingCredentialsRef || 'Not configured' }}</strong>
              </article>
            </div>

            <div class="console-code-block">
              <pre>{{ project.metadata | json }}</pre>
            </div>
          </section>

          <section class="console-surface" *ngIf="isBriefView">
            <div class="console-surface__head">
              <div>
                <p class="console-surface__eyebrow">Readiness</p>
                <h2 class="console-surface__title">Brief generation checklist</h2>
              </div>
            </div>

            <div class="console-meta-grid">
              <article class="console-meta-card">
                <span>Destination credentials</span>
                <strong>{{ project.site.publishingCredentialsRef ? 'Configured' : 'Missing' }}</strong>
              </article>
              <article class="console-meta-card">
                <span>Topic linked</span>
                <strong>{{ project.topic?.title || 'Not linked' }}</strong>
              </article>
              <article class="console-meta-card">
                <span>Existing version</span>
                <strong>{{ project.latestVersion ? 'V' + project.latestVersion.versionNumber : 'No output yet' }}</strong>
              </article>
              <article class="console-meta-card">
                <span>Next editorial step</span>
                <strong>{{ project.latestVersion ? 'Refine or regenerate' : 'Generate first draft' }}</strong>
              </article>
            </div>

            <ul class="console-note-list">
              <li class="console-note-list__item">
                El brief debe dejar claro objetivo, destino y topic antes de lanzar la primera generación.
              </li>
              <li class="console-note-list__item">
                Si ya existe una versión, esta vista se usa para reencuadrar el trabajo editorial antes de iterar.
              </li>
              <li class="console-note-list__item">
                El siguiente handoff natural desde aquí es Text Generation o directamente Article Editor si ya hay salida.
              </li>
            </ul>
          </section>

          <section class="console-surface">
            <div class="console-surface__head">
              <div>
                <p class="console-surface__eyebrow">{{ isBriefView ? 'Instructions' : 'Review' }}</p>
                <h2 class="console-surface__title">{{ workbench.feedbackTitle }}</h2>
              </div>
            </div>

            <label class="console-field">
              <span>{{ isBriefView ? 'Generation notes' : 'Feedback' }}</span>
              <textarea rows="6" [formControl]="feedbackControl"></textarea>
            </label>

            <div class="console-form__actions">
              <button type="button" class="console-button" (click)="revise()" [disabled]="feedbackControl.invalid">
                {{ isBriefView ? 'Generate with notes' : 'Send revision' }}
              </button>
              <button
                type="button"
                class="console-button console-button--secondary"
                *ngIf="!isBriefView"
                (click)="unpublish()"
              >
                Retire content
              </button>
            </div>
          </section>

          <section class="console-surface" *ngIf="isArticleView">
            <div class="console-surface__head">
              <div>
                <p class="console-surface__eyebrow">SEO and release</p>
                <h2 class="console-surface__title">Article control panel</h2>
              </div>
            </div>

            <div class="console-meta-grid">
              <article class="console-meta-card">
                <span>SEO title</span>
                <strong>{{ project.latestVersion?.seoTitle || 'Missing' }}</strong>
              </article>
              <article class="console-meta-card">
                <span>SEO description</span>
                <strong>{{ project.latestVersion?.seoDescription || 'Missing' }}</strong>
              </article>
              <article class="console-meta-card">
                <span>Latest publication</span>
                <strong>{{ project.latestVersion?.latestPublicationJob?.status || 'not shipped' }}</strong>
              </article>
              <article class="console-meta-card">
                <span>Asset variants</span>
                <strong>{{ project.latestVersion?.assetVariants?.length || 0 }}</strong>
              </article>
            </div>

            <div class="console-inline-actions">
              <a class="console-button console-button--secondary" [routerLink]="['/studio/editorial/versions', project.id]">
                Compare versions
              </a>
              <a class="console-button console-button--secondary" routerLink="/studio/publishing/history">
                Open history
              </a>
              <a class="console-button console-button--secondary" routerLink="/studio/assets/library">
                Open media library
              </a>
            </div>
          </section>

          <section class="console-surface">
            <div class="console-surface__head">
              <div>
                <p class="console-surface__eyebrow">Output</p>
                <h2 class="console-surface__title">
                  {{ project.latestVersion?.title || workbench.outputTitle }}
                </h2>
              </div>
              <span class="console-tag">{{ project.latestVersion?.status || 'draft' }}</span>
            </div>

            <div class="console-asset-preview" *ngIf="project.latestAssetUrl">
              <img [src]="project.latestAssetUrl" alt="Generated asset" />
            </div>

            <div class="console-meta-grid" *ngIf="project.latestVersion">
              <article class="console-meta-card">
                <span>SEO title</span>
                <strong>{{ project.latestVersion.seoTitle || '-' }}</strong>
              </article>
              <article class="console-meta-card">
                <span>SEO description</span>
                <strong>{{ project.latestVersion.seoDescription || '-' }}</strong>
              </article>
              <article class="console-meta-card">
                <span>Derivative count</span>
                <strong>{{ project.latestVersion.derivativeCount }}</strong>
              </article>
            </div>

            <div
              class="console-preview-surface"
              [innerHTML]="project.latestVersion?.bodyHtml || '<p>No generated content yet.</p>'"
            ></div>
          </section>

          <section class="console-surface">
            <div class="console-surface__head">
              <div>
                <p class="console-surface__eyebrow">Derivatives</p>
                <h2 class="console-surface__title">Newsletter and social outputs</h2>
              </div>
            </div>

            <div class="console-list-grid" *ngIf="project.latestVersion?.derivatives?.length; else emptyDerivatives">
              <article class="console-list-card" *ngFor="let derivative of project.latestVersion?.derivatives">
                <div>
                  <strong>{{ derivative.type }}</strong>
                  <p>{{ derivative.title || 'Untitled derivative' }}</p>
                </div>
                <small>{{ derivative.body }}</small>
              </article>
            </div>
          </section>

          <section class="console-surface" *ngIf="isArticleView && project.latestVersion?.assetVariants?.length">
            <div class="console-surface__head">
              <div>
                <p class="console-surface__eyebrow">Assets</p>
                <h2 class="console-surface__title">Variant inventory</h2>
              </div>
            </div>

            <div class="console-variant-grid">
              <article class="console-variant-card" *ngFor="let variant of project.latestVersion?.assetVariants">
                <div>
                  <strong>{{ variant.kind }}</strong>
                  <p>{{ variant.mimeType }} · {{ variant.width || 'auto' }}x{{ variant.height || 'auto' }}</p>
                </div>
                <a class="console-link" *ngIf="variant.publicUrl" [href]="variant.publicUrl" target="_blank" rel="noreferrer">
                  Open file
                </a>
              </article>
            </div>
          </section>
        </div>

        <aside class="console-workspace__aside">
          <section class="console-surface">
            <div class="console-surface__head">
              <div>
                <p class="console-surface__eyebrow">QA</p>
                <h2 class="console-surface__title">Automated checks</h2>
              </div>
            </div>

            <div class="console-feed" *ngIf="project.latestVersion?.qaReport?.checks?.length; else emptyQa">
              <article class="console-feed__item" *ngFor="let check of project.latestVersion?.qaReport?.checks">
                <div>
                  <strong>{{ check.key }}</strong>
                  <p>{{ check.message }}</p>
                </div>
                <span class="console-tag" [class.console-tag--danger]="!check.passed">
                  {{ check.passed ? 'ok' : 'fail' }}
                </span>
              </article>
            </div>
          </section>

          <section class="console-surface">
            <div class="console-surface__head">
              <div>
                <p class="console-surface__eyebrow">Versions</p>
                <h2 class="console-surface__title">Timeline</h2>
              </div>
            </div>

            <div class="console-feed">
              <article class="console-feed__item" *ngFor="let version of project.versions">
                <div>
                  <strong>V{{ version.versionNumber }} · {{ version.title || 'Untitled' }}</strong>
                  <p>{{ version.status }} · {{ version.createdAt | date: 'short' }}</p>
                </div>
                <a
                  class="console-link"
                  [routerLink]="version.versionNumber > 1 ? ['/studio/editorial/versions', project.id, 'compare', version.id] : ['/studio/editorial/versions', project.id]"
                >
                  {{ version.versionNumber > 1 ? 'Compare' : 'Open detail' }}
                </a>
              </article>
            </div>
          </section>

          <section class="console-surface">
            <div class="console-surface__head">
              <div>
                <p class="console-surface__eyebrow">Publishing</p>
                <h2 class="console-surface__title">Traceability</h2>
              </div>
            </div>

            <div class="console-feed" *ngIf="project.publicationJobs.length; else emptyPublications">
              <article class="console-feed__item" *ngFor="let publication of project.publicationJobs">
                <div>
                  <strong>{{ publication.action }} · {{ publication.status }}</strong>
                  <p>
                    {{ publication.targetStatus || 'n/a' }} · {{ publication.createdAt | date: 'short' }}
                  </p>
                  <small *ngIf="publication.error">{{ publication.error }}</small>
                </div>
                <span class="console-tag">{{ publication.externalId || 'pending' }}</span>
              </article>
            </div>
          </section>
        </aside>
      </div>

      <ng-template #emptyQa>
        <div class="console-empty-compact">
          <p>QA not available yet.</p>
        </div>
      </ng-template>

      <ng-template #emptyDerivatives>
        <div class="console-empty-compact">
          <p>No derivatives generated yet.</p>
        </div>
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
          <p class="console-kicker">{{ workbench.kicker }}</p>
          <h2>Loading project detail...</h2>
        </div>
      </section>
    </ng-template>
  `,
})
export class ProjectDetailPageComponent implements OnInit {
  private readonly api = inject(StudioApiService);
  private readonly route = inject(ActivatedRoute);

  readonly feedbackControl = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.minLength(8)],
  });

  project: StudioProjectDetailView | null = null;
  error = '';
  notice = '';
  view: ProjectWorkbenchView = 'overview';

  get workbench(): WorkbenchConfig {
    return WORKBENCH_CONFIGS[this.view];
  }

  get isBriefView(): boolean {
    return this.view === 'brief';
  }

  get isArticleView(): boolean {
    return this.view === 'article';
  }

  get canApprove(): boolean {
    return this.project?.latestVersion?.status === 'qa_passed';
  }

  get canPublish(): boolean {
    return ['approved', 'published'].includes(this.project?.latestVersion?.status || '');
  }

  ngOnInit(): void {
    this.view =
      (this.route.snapshot.data['projectWorkbenchView'] as ProjectWorkbenchView | undefined) ??
      'overview';
    this.loadProject();
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
      },
      error: (error) => {
        this.error = formatApiError(error);
      },
    });
  }

  generate(): void {
    this.runAction(() => this.api.generateProject(this.requireProjectId()));
  }

  generateAsset(): void {
    this.runAction(() =>
      this.api.generateAsset(this.requireProjectId(), this.project?.latestVersion?.id),
    );
  }

  approve(): void {
    this.runAction(() => this.api.approveProject(this.requireProjectId()));
  }

  publish(): void {
    this.runAction(() =>
      this.api.publishProject(this.requireProjectId(), {
        action: 'publish',
        targetStatus: 'publish',
      }),
    );
  }

  syncDraft(): void {
    this.runAction(() =>
      this.api.publishProject(this.requireProjectId(), {
        action: 'update',
        targetStatus: 'draft',
      }),
    );
  }

  unpublish(): void {
    this.runAction(() =>
      this.api.publishProject(this.requireProjectId(), {
        action: 'unpublish',
        targetStatus: 'publish',
      }),
    );
  }

  revise(): void {
    if (this.feedbackControl.invalid) {
      this.feedbackControl.markAsTouched();
      return;
    }

    this.runAction(() =>
      this.api.reviseProject(this.requireProjectId(), this.feedbackControl.value.trim()),
    );
  }

  private runAction(requestFactory: () => ReturnType<StudioApiService['approveProject']>): void {
    this.error = '';
    this.notice = '';

    requestFactory().subscribe({
      next: () => {
        this.notice = 'Action submitted successfully.';
        this.loadProject();
      },
      error: (error) => {
        this.error = formatApiError(error);
      },
    });
  }

  private requireProjectId(): string {
    const projectId = this.route.snapshot.paramMap.get('id');
    if (!projectId) {
      throw new Error('Project id no valido.');
    }

    return projectId;
  }
}
