import { CommonModule, DatePipe } from '@angular/common';
import { Component, DestroyRef, OnInit, inject } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import type {
  ProjectGoal,
  StudioProjectDetailView,
  StudioSiteSummary,
} from '../models/studio.models';
import { StudioPageHeaderComponent } from '../components/studio-page-header.component';
import { StudioStatStripComponent, type StudioStatItem } from '../components/studio-stat-strip.component';
import { StudioApiService } from '../services/studio-api.service';
import {
  buildProjectPayloadFromBriefEditor,
  createProjectBriefEditorValueFromProject,
  createEmptyProjectBriefEditorValue,
  getUnknownProjectMetadata,
} from '../utils/project-brief';
import { formatApiError } from '../utils/api-error';
import {
  buildQaScore,
  buildReviewChecklist,
  qaScoreLabel,
  reviewStageLabel as formatReviewStageLabel,
  reviewStageTone as getReviewStageTone,
} from '../utils/review-gate';

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
  imports: [CommonModule, ReactiveFormsModule, DatePipe, RouterLink, StudioPageHeaderComponent, StudioStatStripComponent],
  template: `
    <section class="console-page" *ngIf="project; else loadingState">
      <app-studio-page-header
        [kicker]="workbench.kicker"
        [title]="project.title"
        [intro]="workbench.intro + ' ' + project.site.name + ' · ' + reviewStageLabel(project.reviewGate.stage) + ' · ' + project.goal + ' · ' + project.primaryLanguage"
      >
        <div page-meta>
          <span class="console-tag" [ngClass]="reviewTagClass(project.reviewGate.stage)">
            {{ reviewStageLabel(project.reviewGate.stage) }}
          </span>
          <span class="console-tag console-tag--muted">{{ project.site.name }}</span>
          <span class="console-tag console-tag--muted">{{ project.primaryLanguage }}</span>
        </div>

        <div page-actions>
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
            *ngIf="imageNeedsRetry"
            (click)="retryImage()"
          >
            Retry image
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
            *ngIf="canSyncDraft"
            (click)="syncDraft()"
          >
            {{ syncDraftLabel }}
          </button>
          <button type="button" class="console-button" *ngIf="canPublish" (click)="publish()">
            {{ publishLabel }}
          </button>
        </div>
      </app-studio-page-header>

      <div class="console-banner console-banner--success" *ngIf="notice">{{ notice }}</div>
      <div class="console-banner console-banner--error" *ngIf="error">{{ error }}</div>

      <app-studio-stat-strip [items]="detailStats"></app-studio-stat-strip>

      <section class="console-surface console-surface--hero">
        <div class="console-hero-grid">
          <div class="console-hero-copy">
            <p class="console-surface__eyebrow">Release posture</p>
            <h2 class="console-surface__title">{{ heroTitle }}</h2>
            <p class="console-hero-copy__body">{{ detailNarrative }}</p>

            <div class="console-header-strip">
              <article class="console-header-strip__card">
                <span>Next action</span>
                <strong>{{ project.reviewGate.nextAction }}</strong>
                <small>La pieza ya habla el mismo lenguaje operativo que QA, review y publish.</small>
              </article>
              <article class="console-header-strip__card">
                <span>Approval gate</span>
                <strong>{{ project.reviewGate.approvalReady ? 'Ready' : 'Blocked' }}</strong>
                <small>{{ project.reviewGate.approvalReady ? 'Puede pasar a decisión editorial final.' : 'Aún necesita intervención humana o QA.' }}</small>
              </article>
              <article class="console-header-strip__card">
                <span>Publish gate</span>
                <strong>{{ project.reviewGate.publishReady ? 'Ready' : 'Blocked' }}</strong>
                <small>{{ project.reviewGate.publishReady ? 'Puede entrar en release o draft sync.' : 'Todavía no cumple mínimos de release.' }}</small>
              </article>
            </div>
          </div>

          <div class="console-focus-stack">
            <div class="console-surface__head">
              <div>
                <p class="console-surface__eyebrow">Control lane</p>
                <h2 class="console-surface__title">Operational shortcuts</h2>
              </div>
            </div>

            <div class="console-focus-list">
              <a class="console-focus-card" [routerLink]="['/studio/editorial/versions', project.id]">
                <div>
                  <strong>Version memory</strong>
                  <p>{{ project.versionCount }} saved snapshots and compare history for this piece.</p>
                </div>
                <span class="console-tag console-tag--accent">Open versions</span>
              </a>

              <a class="console-focus-card" routerLink="/studio/review/qa">
                <div>
                  <strong>QA scorecard</strong>
                  <p>{{ qaScoreSummary }} · {{ project.latestVersion?.qaFailureCount || 0 }} blockers · {{ project.latestVersion?.qaWarningCount || 0 }} warnings.</p>
                </div>
                <span class="console-tag" [ngClass]="qaScoreTagClass">{{ qaScore }}/100</span>
              </a>

              <a class="console-focus-card" [routerLink]="releaseSurfaceLink">
                <div>
                  <strong>Release surface</strong>
                  <p>{{ releaseSurfaceNarrative }}</p>
                </div>
                <span class="console-tag" [ngClass]="reviewTagClass(project.reviewGate.stage)">{{ releaseSurfaceLabel }}</span>
              </a>
            </div>
          </div>
        </div>
      </section>

      <div class="console-workspace">
        <div class="console-workspace__main">
          <section class="console-surface">
            <div class="console-surface__head">
              <div>
                <p class="console-surface__eyebrow">Context</p>
                <h2 class="console-surface__title">{{ workbench.contextTitle }}</h2>
              </div>
              <span class="console-tag">{{ contextForm.dirty ? 'unsaved changes' : 'live project data' }}</span>
            </div>

            <form [formGroup]="contextForm" (ngSubmit)="saveContext()" class="console-form">
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
              </div>

              <div class="console-form__grid">
                <label class="console-field">
                  <span>Primary language</span>
                  <input type="text" formControlName="primaryLanguage" />
                </label>

                <label class="console-field">
                  <span>Target query</span>
                  <input type="text" formControlName="targetQuery" />
                </label>
              </div>

              <label class="console-field">
                <span>Editorial brief summary</span>
                <textarea rows="5" formControlName="briefSummary"></textarea>
              </label>

              <div class="console-form__grid">
                <label class="console-field">
                  <span>Audience</span>
                  <input type="text" formControlName="audience" />
                </label>

                <label class="console-field">
                  <span>Angle</span>
                  <input type="text" formControlName="angle" />
                </label>
              </div>

              <div class="console-form__grid">
                <label class="console-field">
                  <span>Tone</span>
                  <input type="text" formControlName="tone" />
                </label>

                <label class="console-field">
                  <span>CTA</span>
                  <input type="text" formControlName="cta" />
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
                  <span>Author</span>
                  <input type="text" formControlName="author" />
                </label>

                <label class="console-field">
                  <span>Preferred slug</span>
                  <input type="text" formControlName="slug" />
                </label>
              </div>

              <label class="console-field">
                <span>Canonical URL</span>
                <input type="url" formControlName="canonicalUrl" />
              </label>

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
                <button type="submit" class="console-button" [disabled]="!canSaveContext">
                  Save context
                </button>
                <button
                  type="button"
                  class="console-button console-button--secondary"
                  [disabled]="!contextForm.dirty"
                  (click)="resetContextForm()"
                >
                  Discard draft
                </button>
              </div>
            </form>

            <div class="console-meta-grid">
              <article class="console-meta-card">
                <span>Destination key</span>
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
              <article class="console-meta-card">
                <span>Preserved metadata keys</span>
                <strong>{{ preservedMetadataCount }}</strong>
              </article>
            </div>

            <div class="console-code-block">
              <pre>{{ briefPreview }}</pre>
            </div>

            <div class="console-code-block" *ngIf="hasUnknownMetadata">
              <pre>{{ unknownMetadataPreview }}</pre>
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
                El brief deja de depender de JSON manual y ahora expone query, secciones, fuentes y CTA.
              </li>
              <li class="console-note-list__item">
                Los cambios se guardan sobre el proyecto vivo y alimentan la siguiente generación o revisión.
              </li>
              <li class="console-note-list__item">
                Si existen keys históricas fuera del composer, se preservan y siguen viajando en metadata.
              </li>
            </ul>
          </section>

          <section class="console-surface">
            <div class="console-surface__head">
              <div>
                <p class="console-surface__eyebrow">Release gate</p>
                <h2 class="console-surface__title">Editorial readiness</h2>
              </div>
              <span
                class="console-tag"
                [class.console-tag--danger]="reviewStageTone(project.reviewGate.stage) === 'danger'"
                [class.console-tag--warning]="reviewStageTone(project.reviewGate.stage) === 'warning'"
                [class.console-tag--accent]="reviewStageTone(project.reviewGate.stage) === 'accent'"
                [class.console-tag--success]="reviewStageTone(project.reviewGate.stage) === 'success'"
                [class.console-tag--muted]="reviewStageTone(project.reviewGate.stage) === 'muted'"
              >
                {{ reviewStageLabel(project.reviewGate.stage) }}
              </span>
            </div>

            <div class="console-meta-grid">
              <article class="console-meta-card">
                <span>Next action</span>
                <strong>{{ project.reviewGate.nextAction }}</strong>
              </article>
              <article class="console-meta-card">
                <span>Version memory</span>
                <strong>{{ project.versionCount }} snapshots</strong>
              </article>
              <article class="console-meta-card">
                <span>Approval gate</span>
                <strong>{{ project.reviewGate.approvalReady ? 'Ready' : 'Blocked' }}</strong>
              </article>
              <article class="console-meta-card">
                <span>Publish gate</span>
                <strong>{{ project.reviewGate.publishReady ? 'Ready' : 'Blocked' }}</strong>
              </article>
            </div>

            <ul class="console-note-list" *ngIf="project.reviewGate.blockers.length || project.reviewGate.warnings.length">
              <li class="console-note-list__item" *ngFor="let blocker of project.reviewGate.blockers">
                {{ blocker }}
              </li>
              <li class="console-note-list__item" *ngFor="let warning of project.reviewGate.warnings">
                {{ warning }}
              </li>
            </ul>

            <div class="console-inline-actions">
              <a class="console-button console-button--secondary" [routerLink]="['/studio/editorial/versions', project.id]">
                Compare versions
              </a>
              <a class="console-button console-button--secondary" routerLink="/studio/review/qa">
                Open QA queue
              </a>
              <a class="console-button console-button--secondary" routerLink="/studio/publishing/scheduled">
                Open scheduled
              </a>
            </div>
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
                *ngIf="canUnpublish"
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
                <h2 class="console-surface__title">QA scorecard</h2>
              </div>
            </div>

            <div class="console-meta-grid">
              <article class="console-meta-card">
                <span>Score</span>
                <strong>{{ qaScore }}/100</strong>
              </article>
              <article class="console-meta-card">
                <span>Signal</span>
                <strong>{{ qaScoreSummary }}</strong>
              </article>
              <article class="console-meta-card">
                <span>QA blockers</span>
                <strong>{{ project.latestVersion?.qaFailureCount || 0 }}</strong>
              </article>
              <article class="console-meta-card">
                <span>QA warnings</span>
                <strong>{{ project.latestVersion?.qaWarningCount || 0 }}</strong>
              </article>
            </div>

            <div class="console-feed">
              <article class="console-feed__item" *ngFor="let item of qaChecklist">
                <div>
                  <strong>{{ item.label }}</strong>
                  <p>{{ item.detail }}</p>
                </div>
                <span class="console-tag" [ngClass]="qaChecklistTagClass(item.status)">
                  {{ qaChecklistLabel(item.status) }}
                </span>
              </article>
            </div>

            <div class="console-feed" *ngIf="project.latestVersion?.qaReport?.checks?.length; else emptyQa">
              <article class="console-feed__item" *ngFor="let check of project.latestVersion?.qaReport?.checks">
                <div>
                  <strong>{{ check.key }}</strong>
                  <p>{{ check.message }}</p>
                </div>
                <span class="console-tag" [ngClass]="check.passed ? 'console-tag--success' : 'console-tag--danger'">
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
  private readonly destroyRef = inject(DestroyRef);

  readonly goals: ProjectGoal[] = [
    'article',
    'landing',
    'comparison',
    'faq',
    'newsletter',
    'social_pack',
  ];

  readonly feedbackControl = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.minLength(8)],
  });

  readonly contextForm = new FormGroup({
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
      validators: [Validators.required],
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

  project: StudioProjectDetailView | null = null;
  sites: StudioSiteSummary[] = [];
  error = '';
  notice = '';
  view: ProjectWorkbenchView = 'overview';
  pollTimer: ReturnType<typeof setInterval> | null = null;

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
    return Boolean(this.project?.reviewGate.approvalReady);
  }

  get canSyncDraft(): boolean {
    return Boolean(this.project?.reviewGate.publishReady && this.project?.reviewGate.stage !== 'publish_queued');
  }

  get canPublish(): boolean {
    return Boolean(this.project?.reviewGate.publishReady && this.project?.reviewGate.stage !== 'publish_queued');
  }

  get canUnpublish(): boolean {
    return Boolean(
      this.project?.publicationJobs.some((job) =>
        Boolean(job.externalId) || ['draft_synced', 'published'].includes(job.status),
      ),
    );
  }

  get canSaveContext(): boolean {
    return Boolean(this.project) && this.contextForm.valid && this.contextForm.dirty;
  }

  get briefPreview(): string {
    return this.projectPayloadPreview.brief || 'The editorial brief preview will appear here.';
  }

  get unknownMetadataPreview(): string {
    return JSON.stringify(this.unknownMetadata, null, 2);
  }

  get hasUnknownMetadata(): boolean {
    return this.preservedMetadataCount > 0;
  }

  get preservedMetadataCount(): number {
    return Object.keys(this.unknownMetadata).length;
  }

  get qaScore(): number {
    return buildQaScore(this.project?.latestVersion);
  }

  get qaScoreSummary(): string {
    return qaScoreLabel(this.qaScore);
  }

  get qaChecklist() {
    if (!this.project) {
      return [];
    }

    return buildReviewChecklist(this.project.latestVersion, this.project.reviewGate);
  }

  get detailStats(): StudioStatItem[] {
    if (!this.project) {
      return [];
    }

    return [
      {
        label: 'Review gate',
        value: this.reviewStageLabel(this.project.reviewGate.stage),
        detail: this.project.reviewGate.nextAction,
        tone: this.reviewStageTone(this.project.reviewGate.stage),
      },
      {
        label: 'QA score',
        value: `${this.qaScore}/100`,
        detail: this.qaScoreSummary,
        tone: this.qaScore >= 90 ? 'success' : this.qaScore >= 70 ? 'warning' : this.qaScore > 0 ? 'danger' : 'muted',
      },
      {
        label: 'Gate issues',
        value: `${this.project.reviewGate.blockerCount} / ${this.project.reviewGate.warningCount}`,
        detail: 'Blockers y warnings vivos sobre la version activa.',
        tone: this.project.reviewGate.blockerCount > 0 ? 'danger' : this.project.reviewGate.warningCount > 0 ? 'warning' : 'success',
      },
      {
        label: 'Publication runs',
        value: this.project.publicationJobs.length,
        detail: 'Historial de publish, draft sync y retiros sobre esta pieza.',
        tone: this.project.publicationJobs.some((job) => job.status === 'failed') ? 'warning' : 'accent',
      },
    ];
  }

  get heroTitle(): string {
    if (!this.project) {
      return 'Project posture';
    }

    if (this.project.reviewGate.stage === 'published') {
      return 'Live article under active editorial control';
    }

    if (this.project.reviewGate.publishReady) {
      return 'Release lane is open for this piece';
    }

    if (this.project.reviewGate.approvalReady) {
      return 'Editorial decision is the next meaningful step';
    }

    return 'This piece still needs direct editorial intervention';
  }

  get detailNarrative(): string {
    if (!this.project) {
      return '';
    }

    if (this.project.reviewGate.blockerCount > 0 || this.project.reviewGate.stage === 'publish_failed') {
      return `${this.project.reviewGate.primaryConcern} El objetivo ahora es desbloquear QA, metadata, asset package o retry de publish antes de seguir empujando el workflow.`;
    }

    if (this.project.reviewGate.publishReady) {
      return `La pieza ya sostiene release real con la versión viva, el package editorial actual y el gate operativo del proyecto.`;
    }

    if (this.project.reviewGate.approvalReady) {
      return `La salida ya está suficientemente madura para decisión editorial final; el siguiente salto no es técnico sino de criterio.`;
    }

    return `Todavía estamos en un tramo de elaboración editorial. La siguiente mejora útil sigue siendo ${this.project.reviewGate.nextAction.toLowerCase()}.`;
  }

  get releaseSurfaceLink(): string[] {
    if (!this.project) {
      return ['/studio/publishing/scheduled'];
    }

    if (this.project.reviewGate.stage === 'published') {
      return ['/studio/publishing/history'];
    }

    return ['/studio/publishing/scheduled'];
  }

  get releaseSurfaceLabel(): string {
    if (!this.project) {
      return 'Release';
    }

    if (this.project.reviewGate.stage === 'published') {
      return 'Live';
    }

    if (this.project.reviewGate.stage === 'publish_failed') {
      return 'Retry';
    }

    if (this.project.reviewGate.stage === 'publish_queued') {
      return 'Queued';
    }

    return 'Release';
  }

  get releaseSurfaceNarrative(): string {
    if (!this.project) {
      return '';
    }

    if (this.project.reviewGate.stage === 'published') {
      return 'La última publicación ya está live; usa history para revisar runtime y trazabilidad downstream.';
    }

    if (this.project.reviewGate.stage === 'publish_failed') {
      return 'Existe un incidente de release en esta pieza y debe reintentarse desde la lane de publishing.';
    }

    if (this.project.reviewGate.stage === 'publish_queued') {
      return 'Este proyecto ya está fluyendo por runtime publishing y debe supervisarse desde la superficie de scheduled.';
    }

    return 'Abre la release lane para supervisar draft sync, publish intent y estado downstream del adapter.';
  }

  get publishLabel(): string {
    if (this.project?.reviewGate.stage === 'published') {
      return 'Republish';
    }

    if (this.project?.reviewGate.stage === 'publish_failed') {
      return 'Retry publish';
    }

    return 'Publish';
  }

  get syncDraftLabel(): string {
    return this.project?.reviewGate.stage === 'publish_failed' ? 'Retry draft sync' : 'Sync draft';
  }

  ngOnInit(): void {
    this.view =
      (this.route.snapshot.data['projectWorkbenchView'] as ProjectWorkbenchView | undefined) ??
      'overview';
    this.destroyRef.onDestroy(() => this.stopPolling());
    this.loadSites();
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
        this.patchContextForm(project);
      },
      error: (error) => {
        this.error = formatApiError(error);
      },
    });
  }

  loadSites(): void {
    this.api.listSites(1, 100).subscribe({
      next: (response) => {
        this.sites = response.items;
      },
      error: (error) => {
        this.error = formatApiError(error);
      },
    });
  }

  saveContext(): void {
    if (!this.project) {
      return;
    }
    if (this.contextForm.invalid) {
      this.contextForm.markAllAsTouched();
      return;
    }

    this.error = '';
    this.notice = '';

    this.api.updateProject(this.requireProjectId(), this.projectPayloadPreview).subscribe({
      next: (project) => {
        this.project = project;
        this.patchContextForm(project);
        this.notice = 'Project context updated.';
      },
      error: (error) => {
        this.error = formatApiError(error);
      },
    });
  }

  resetContextForm(): void {
    if (!this.project) {
      return;
    }

    this.patchContextForm(this.project);
  }

  generate(): void {
    this.runAction(() => this.api.generateProject(this.requireProjectId()), { poll: true });
  }

  generateAsset(): void {
    this.runAction(() =>
      this.api.generateAsset(this.requireProjectId(), this.project?.latestVersion?.id),
      { poll: true },
    );
  }

  retryImage(): void {
    const imageId = this.project?.latestVersion?.image?.id;
    if (!imageId) {
      return;
    }

    this.error = '';
    this.notice = '';
    this.api.retryImage(imageId).subscribe({
      next: () => {
        this.notice = 'Image retry queued. The worker will retry the failed generation.';
        this.startPolling();
      },
      error: (error) => {
        this.error = formatApiError(error);
      },
    });
  }

  approve(): void {
    this.runAction(() => this.api.approveProject(this.requireProjectId()));
  }

  publish(): void {
    this.runAction(
      () =>
        this.api.publishProject(this.requireProjectId(), {
          action: 'publish',
          targetStatus: 'publish',
        }),
      { poll: true },
    );
  }

  syncDraft(): void {
    this.runAction(
      () =>
        this.api.publishProject(this.requireProjectId(), {
          action: 'update',
          targetStatus: 'draft',
        }),
      { poll: true },
    );
  }

  unpublish(): void {
    this.runAction(
      () =>
        this.api.publishProject(this.requireProjectId(), {
          action: 'unpublish',
          targetStatus: 'publish',
        }),
      { poll: true },
    );
  }

  revise(): void {
    if (this.feedbackControl.invalid) {
      this.feedbackControl.markAsTouched();
      return;
    }

    this.runAction(
      () => this.api.reviseProject(this.requireProjectId(), this.feedbackControl.value.trim()),
      { poll: true },
    );
  }

  private patchContextForm(project: StudioProjectDetailView): void {
    const nextValue = createProjectBriefEditorValueFromProject(project);
    this.contextForm.reset(nextValue);
    this.contextForm.markAsPristine();
  }

  private runAction(
    requestFactory: () => ReturnType<StudioApiService['approveProject']>,
    options: { poll?: boolean } = {},
  ): void {
    this.error = '';
    this.notice = '';

    requestFactory().subscribe({
      next: () => {
        this.notice = 'Action submitted successfully.';
        this.loadProject();
        if (options.poll) {
          this.startPolling();
        }
      },
      error: (error) => {
        this.error = formatApiError(error);
      },
    });
  }

  get imageNeedsRetry(): boolean {
    const image = this.project?.latestVersion?.image ?? null;
    return Boolean(image && (image.status === 'failed' || image.status === 'retryable'));
  }

  private isWorkInFlight(): boolean {
    const project = this.project;
    if (!project) {
      return false;
    }

    const imageStatus = project.latestVersion?.image?.status;
    if (imageStatus === 'queued' || imageStatus === 'processing') {
      return true;
    }

    return ['awaiting_generation', 'publish_queued'].includes(project.reviewGate.stage);
  }

  private startPolling(): void {
    this.stopPolling();
    let attempts = 0;
    this.pollTimer = setInterval(() => {
      attempts += 1;
      if (attempts > 60) {
        this.stopPolling();
        this.notice = 'Polling stopped after 4 minutes. Use Refresh to check the latest state.';
        return;
      }
      this.api.getProject(this.requireProjectId()).subscribe({
        next: (project) => {
          this.project = project;
          if (!this.isWorkInFlight()) {
            this.stopPolling();
          }
        },
        error: (error) => {
          this.stopPolling();
          this.error = formatApiError(error);
        },
      });
    }, 4000);
  }

  private stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private requireProjectId(): string {
    const projectId = this.route.snapshot.paramMap.get('id');
    if (!projectId) {
      throw new Error('Project id no valido.');
    }

    return projectId;
  }

  private get unknownMetadata(): Record<string, unknown> {
    return getUnknownProjectMetadata(this.project?.metadata ?? null);
  }

  reviewStageLabel(stage: StudioProjectDetailView['reviewGate']['stage']): string {
    return formatReviewStageLabel(stage);
  }

  reviewStageTone(stage: StudioProjectDetailView['reviewGate']['stage']) {
    return getReviewStageTone(stage);
  }

  reviewTagClass(stage: StudioProjectDetailView['reviewGate']['stage']): string {
    const tone = this.reviewStageTone(stage);
    return tone === 'danger'
      ? 'console-tag--danger'
      : tone === 'warning'
        ? 'console-tag--warning'
        : tone === 'accent'
          ? 'console-tag--accent'
          : tone === 'success'
            ? 'console-tag--success'
            : 'console-tag--muted';
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

  qaChecklistLabel(status: "pass" | "warning" | "fail"): string {
    if (status === 'pass') {
      return 'Pass';
    }

    if (status === 'warning') {
      return 'Watch';
    }

    return 'Fail';
  }

  qaChecklistTagClass(status: "pass" | "warning" | "fail"): string {
    return status === 'pass'
      ? 'console-tag--success'
      : status === 'warning'
        ? 'console-tag--warning'
        : 'console-tag--danger';
  }

  private get projectPayloadPreview() {
    return buildProjectPayloadFromBriefEditor(
      {
        siteId: this.contextForm.controls.siteId.value,
        title: this.contextForm.controls.title.value,
        goal: this.contextForm.controls.goal.value,
        primaryLanguage: this.contextForm.controls.primaryLanguage.value,
        briefSummary: this.contextForm.controls.briefSummary.value,
        targetQuery: this.contextForm.controls.targetQuery.value,
        audience: this.contextForm.controls.audience.value,
        angle: this.contextForm.controls.angle.value,
        tone: this.contextForm.controls.tone.value,
        cta: this.contextForm.controls.cta.value,
        sourceNotes: this.contextForm.controls.sourceNotes.value,
        requiredSections: this.contextForm.controls.requiredSections.value,
        keywords: this.contextForm.controls.keywords.value,
        categories: this.contextForm.controls.categories.value,
        author: this.contextForm.controls.author.value,
        slug: this.contextForm.controls.slug.value,
        canonicalUrl: this.contextForm.controls.canonicalUrl.value,
        featured: this.contextForm.controls.featured.value,
      },
      this.project?.metadata ?? null,
    );
  }
}
