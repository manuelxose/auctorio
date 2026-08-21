import { CommonModule } from '@angular/common';
import { Component, DestroyRef, OnDestroy, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AppContextService } from '../services/app-context.service';
import { StudioApiService } from '../services/studio-api.service';
import type {
  ProjectVersionDetail,
  StudioProjectDetailView,
} from '../models/studio.models';
import { stageLabel, stageTone } from '../utils/content-status';

type WorkspaceTab = 'content' | 'media' | 'seo' | 'history';

@Component({
  selector: 'app-content-workspace-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <section class="au-page" *ngIf="project; else loadingState">
      <a class="au-link" routerLink="/studio/content">← Content</a>

      <header class="au-page__header">
        <div>
          <h1 class="au-page__title">{{ project.title }}</h1>
          <div class="au-page__tags">
            <span class="au-tag">{{ project.site.name }}</span>
            <span
              class="au-tag"
              [class.au-tag--success]="stageTone(project.reviewGate) === 'success'"
              [class.au-tag--danger]="stageTone(project.reviewGate) === 'danger'"
              [class.au-tag--warning]="stageTone(project.reviewGate) === 'warning'"
            >
              {{ stageLabel(project.reviewGate) }}
            </span>
          </div>
        </div>
        <div class="au-page__actions">
          <button class="au-button au-button--ghost" type="button" (click)="refresh()">Refresh</button>
          <button class="au-button au-button--secondary" type="button" *ngIf="canGenerate" (click)="generate()">
            {{ project.versions.length > 0 ? 'Regenerate' : 'Generate article' }}
          </button>
          <button class="au-button au-button--secondary" type="button" *ngIf="imageNeedsRetry" (click)="retryImage()">
            Retry image
          </button>
          <button class="au-button au-button--secondary" type="button" *ngIf="canApprove" (click)="approve()">
            Approve
          </button>
          <button class="au-button au-button--primary" type="button" *ngIf="canSyncDraft" (click)="syncDraft()">
            Save to site as draft
          </button>
          <button class="au-button au-button--primary" type="button" *ngIf="canPublish" (click)="publish()">
            {{ published ? 'Republish' : 'Publish' }}
          </button>
          <button class="au-button au-button--danger" type="button" *ngIf="canUnpublish" (click)="unpublish()">
            Unpublish
          </button>
        </div>
      </header>

      <p class="au-banner au-banner--error" *ngIf="error">{{ error }}</p>
      <p class="au-banner au-banner--success" *ngIf="notice">{{ notice }}</p>

      <div class="au-workspace">
        <div class="au-workspace__main">
          <nav class="au-tabs" aria-label="Content sections">
            <button
              *ngFor="let tab of tabs"
              class="au-tab"
              [class.is-active]="tab === activeTab"
              type="button"
              (click)="activeTab = tab"
            >
              {{ tabLabel(tab) }}
            </button>
          </nav>

          <ng-container [ngSwitch]="activeTab">
            <section class="au-surface au-surface--padded" *ngSwitchCase="'content'">
              <div class="au-empty" *ngIf="!project.latestVersion">
                <p>The article is being generated. This takes a few seconds.</p>
                <span class="au-spinner"></span>
              </div>

              <ng-container *ngIf="project.latestVersion">
                <label class="au-field">
                  <span class="au-field__label">Title</span>
                  <input class="au-input" type="text" [(ngModel)]="draftTitle" />
                </label>
                <label class="au-field">
                  <span class="au-field__label">Excerpt</span>
                  <textarea class="au-input" rows="2" [(ngModel)]="draftExcerpt"></textarea>
                </label>
                <label class="au-field">
                  <span class="au-field__label">Article</span>
                  <textarea class="au-input au-input--editor" rows="18" [(ngModel)]="draftBody"></textarea>
                </label>
                <div class="au-form__actions">
                  <button class="au-button au-button--secondary" type="button" [disabled]="saving" (click)="save()">
                    {{ saving ? 'Saving…' : 'Save' }}
                  </button>
                </div>
              </ng-container>

              <details class="au-advanced au-workspace__feedback">
                <summary class="au-link">Ask the AI to improve this</summary>
                <textarea class="au-input" rows="2" placeholder="e.g. Add a section about prices…" [(ngModel)]="feedback"></textarea>
                <button class="au-button au-button--secondary" type="button" [disabled]="revising" (click)="revise()">
                  {{ revising ? 'Revising…' : 'Revise with AI' }}
                </button>
              </details>
            </section>

            <section class="au-surface au-surface--padded" *ngSwitchCase="'media'">
              <div class="au-media-grid">
                <article class="au-media-card" *ngFor="let variant of project.latestVersion?.assetVariants ?? []">
                  <img [src]="variant.publicUrl || ''" [alt]="variant.kind" loading="lazy" />
                  <span class="au-tag">{{ variant.kind }} · {{ variant.width }}×{{ variant.height }}</span>
                </article>
              </div>
              <div class="au-empty" *ngIf="!(project.latestVersion?.assetVariants?.length)">
                <p *ngIf="project.latestVersion?.image?.status === 'queued' || project.latestVersion?.image?.status === 'processing'">
                  Generating hero image… <span class="au-spinner"></span>
                </p>
                <p *ngIf="project.latestVersion?.image?.status === 'failed' || project.latestVersion?.image?.status === 'retryable'">
                  {{ imageError }}
                </p>
                <p *ngIf="!project.latestVersion?.image">No hero image yet.</p>
              </div>
              <div class="au-form__actions">
                <button class="au-button au-button--secondary" type="button" (click)="generateAsset()">
                  {{ project.latestVersion?.assetVariants?.length ? 'Generate new image' : 'Generate image' }}
                </button>
              </div>
            </section>

            <section class="au-surface au-surface--padded" *ngSwitchCase="'seo'">
              <ng-container *ngIf="project.latestVersion">
                <label class="au-field">
                  <span class="au-field__label">SEO title</span>
                  <input class="au-input" type="text" [(ngModel)]="draftSeoTitle" />
                  <span class="au-field__hint">{{ (draftSeoTitle || '').length }} / 65</span>
                </label>
                <label class="au-field">
                  <span class="au-field__label">SEO description</span>
                  <textarea class="au-input" rows="3" [(ngModel)]="draftSeoDescription"></textarea>
                  <span class="au-field__hint">{{ (draftSeoDescription || '').length }} / 165</span>
                </label>
                <div class="au-form__actions">
                  <button class="au-button au-button--secondary" type="button" [disabled]="saving" (click)="save()">
                    {{ saving ? 'Saving…' : 'Save SEO' }}
                  </button>
                </div>
              </ng-container>
            </section>

            <section class="au-surface au-surface--padded" *ngSwitchCase="'history'">
              <div class="au-history">
                <button
                  class="au-history__item"
                  type="button"
                  *ngFor="let version of project.versions"
                  [class.is-active]="version.id === selectedVersionId"
                  (click)="selectVersion(version)"
                >
                  <span class="au-tag">v{{ version.versionNumber }}</span>
                  <span class="au-history__label">{{ version.title }}</span>
                  <span class="au-tag">{{ version.status }}</span>
                  <span class="au-row__meta">{{ version.approvedBy || version.updatedAt | date: 'short' }}</span>
                </button>
              </div>
              <p class="au-auth__hint" *ngIf="selectedVersionId">
                Comparing v{{ project.latestVersion?.versionNumber }} with v{{ selectedVersion?.versionNumber }}. Select a version to inspect its content below.
              </p>
              <pre class="au-diff" *ngIf="selectedVersion">{{ selectedVersion.bodyHtml }}</pre>
            </section>
          </ng-container>
        </div>

        <aside class="au-workspace__rail">
          <section class="au-surface au-surface--padded">
            <h2 class="au-surface__title">Quality</h2>
            <div class="au-qa" *ngIf="project.latestVersion; else noVersion">
              <div class="au-qa__score">
                <strong>{{ qaScore }}</strong><span>/ 100</span>
              </div>
              <ul class="au-qa__list">
                <li *ngFor="let issue of project.reviewGate.issues" [class.is-blocking]="issue.severity === 'blocking'">
                  <span class="au-qa__mark">{{ issue.severity === 'blocking' ? '✕' : '⚠' }}</span>
                  {{ issue.message }}
                </li>
              </ul>
              <p class="au-auth__hint" *ngIf="project.reviewGate.blockerCount > 0">
                {{ project.reviewGate.blockerCount }} issue{{ project.reviewGate.blockerCount === 1 ? '' : 's' }} must be fixed before publishing.
              </p>
              <button class="au-button au-button--secondary au-button--block" type="button" *ngIf="canFixWithAi" (click)="fixWithAi()">
                Fix with AI
              </button>
            </div>
            <ng-template #noVersion><p class="au-auth__hint">Quality checks run after generation.</p></ng-template>
          </section>

          <section class="au-surface au-surface--padded">
            <h2 class="au-surface__title">Publishing</h2>
            <p class="au-auth__hint">
              {{ project.site.name }} · {{ project.site.baseUrl || 'destination' }}
            </p>
            <div class="au-pub" *ngIf="project.latestPublicationJob">
              <span class="au-tag">{{ project.latestPublicationJob.status }}</span>
              <a
                class="au-link"
                *ngIf="project.latestPublicationJob.externalUrl"
                [href]="externalLink"
                target="_blank"
                rel="noopener"
              >
                Open published page ↗
              </a>
            </div>
            <p class="au-auth__hint" *ngIf="!project.latestPublicationJob">Not published yet.</p>
          </section>
        </aside>
      </div>
    </section>

    <ng-template #loadingState>
      <div class="au-boot"><span class="au-spinner" aria-label="Loading"></span></div>
    </ng-template>
  `,
})
export class ContentWorkspacePageComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(StudioApiService);
  private readonly appContext = inject(AppContextService);
  private readonly destroyRef = inject(DestroyRef);

  project: StudioProjectDetailView | null = null;
  activeTab: WorkspaceTab = 'content';
  tabs: WorkspaceTab[] = ['content', 'media', 'seo', 'history'];
  error = '';
  notice = '';
  saving = false;
  revising = false;
  feedback = '';
  selectedVersionId: string | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  draftTitle = '';
  draftExcerpt = '';
  draftBody = '';
  draftSeoTitle = '';
  draftSeoDescription = '';

  get published(): boolean {
    return this.project?.reviewGate.stage === 'published';
  }

  get canGenerate(): boolean {
    const stage = this.project?.reviewGate.stage;
    return Boolean(
      this.project &&
        stage !== 'publish_queued' &&
        stage !== 'published' &&
        this.project.versions.length === 0 ? true : this.project !== null && stage !== 'publish_queued',
    );
  }

  get canApprove(): boolean {
    return Boolean(this.project?.reviewGate.approvalReady);
  }

  get canSyncDraft(): boolean {
    return Boolean(this.project?.reviewGate.publishReady && !this.published);
  }

  get canPublish(): boolean {
    return Boolean(this.project?.reviewGate.publishReady && this.project?.reviewGate.stage !== 'publish_queued');
  }

  get canUnpublish(): boolean {
    return Boolean(this.project?.latestPublicationJob?.externalId && this.published);
  }

  get canFixWithAi(): boolean {
    return Boolean(this.project && this.project.reviewGate.blockerCount > 0 && this.project.versions.length > 0);
  }

  get imageNeedsRetry(): boolean {
    const image = this.project?.latestVersion?.image;
    return Boolean(image && (image.status === 'failed' || image.status === 'retryable'));
  }

  get imageError(): string {
    return this.project?.latestVersion?.image?.error || 'Image generation failed.';
  }

  get qaScore(): number {
    const report = this.project?.latestVersion?.qaReport as
      | { checks?: Array<{ passed: boolean; severity: string }> }
      | null;
    if (!report?.checks?.length) {
      return 0;
    }
    const passed = report.checks.filter((check) => check.passed).length;
    return Math.round((passed / report.checks.length) * 100);
  }

  get selectedVersion(): ProjectVersionDetail | null {
    return this.project?.versions.find((version) => version.id === this.selectedVersionId) ?? null;
  }

  get externalLink(): string {
    const url = this.project?.latestPublicationJob?.externalUrl ?? '';
    if (url.startsWith('http')) {
      return url;
    }
    return `${this.project?.site.baseUrl ?? ''}${url.startsWith('/') ? '' : '/'}${url}`.replace(/\/$/, '');
  }

  ngOnInit(): void {
    this.destroyRef.onDestroy(() => this.stopPolling());
    this.load();
  }

  ngOnDestroy(): void {
    this.stopPolling();
  }

  private get projectId(): string {
    return this.route.snapshot.paramMap.get('id') || '';
  }

  load(): void {
    this.api.getProject(this.projectId).subscribe({
      next: (project) => {
        this.project = project;
        this.patchDrafts(project);
        if (this.isWorkInFlight(project)) {
          this.startPolling();
        }
      },
      error: (err) => {
        this.error = this.describe(err);
      },
    });
  }

  refresh(): void {
    this.load();
  }

  private patchDrafts(project: StudioProjectDetailView): void {
    const version = project.latestVersion;
    this.draftTitle = version?.title ?? project.title;
    this.draftExcerpt = version?.excerpt ?? '';
    this.draftBody = version?.bodyHtml ?? '';
    this.draftSeoTitle = version?.seoTitle ?? '';
    this.draftSeoDescription = version?.seoDescription ?? '';
  }

  private isWorkInFlight(project: StudioProjectDetailView): boolean {
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
        this.notice = 'Polling stopped. Use Refresh to check the latest state.';
        return;
      }
      this.api.getProject(this.projectId).subscribe({
        next: (project) => {
          this.project = project;
          this.patchDrafts(project);
          if (!this.isWorkInFlight(project)) {
            this.stopPolling();
          }
        },
        error: (err) => {
          this.stopPolling();
          this.error = this.describe(err);
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

  save(): void {
    const version = this.project?.latestVersion;
    if (!version) {
      return;
    }
    this.saving = true;
    this.notice = '';
    this.error = '';
    this.api
      .updateVersionContent(version.id, {
        title: this.draftTitle,
        excerpt: this.draftExcerpt,
        bodyHtml: this.draftBody,
        seoTitle: this.draftSeoTitle,
        seoDescription: this.draftSeoDescription,
      })
      .subscribe({
        next: () => {
          this.saving = false;
          this.notice = 'Saved. Quality checks refreshed.';
          this.load();
        },
        error: (err) => {
          this.saving = false;
          this.error = this.describe(err);
        },
      });
  }

  generate(): void {
    this.api.generateProject(this.projectId).subscribe({
      next: () => {
        this.notice = 'Generation queued.';
        this.load();
      },
      error: (err) => {
        this.error = this.describe(err);
      },
    });
  }

  generateAsset(): void {
    const versionId = this.project?.latestVersion?.id;
    this.api.generateAsset(this.projectId, versionId).subscribe({
      next: () => {
        this.notice = 'Image generation queued.';
        this.load();
      },
      error: (err) => {
        this.error = this.describe(err);
      },
    });
  }

  retryImage(): void {
    const imageId = this.project?.latestVersion?.image?.id;
    if (!imageId) {
      return;
    }
    this.api.retryImage(imageId).subscribe({
      next: () => {
        this.notice = 'Image retry queued.';
        this.startPolling();
      },
      error: (err) => {
        this.error = this.describe(err);
      },
    });
  }

  approve(): void {
    this.api.approveProject(this.projectId).subscribe({
      next: () => {
        this.notice = 'Version approved.';
        this.load();
      },
      error: (err) => {
        this.error = this.describe(err);
      },
    });
  }

  revise(): void {
    if (this.feedback.trim().length < 8) {
      this.error = 'Describe the improvement in at least 8 characters.';
      return;
    }
    this.revising = true;
    this.api.reviseProject(this.projectId, this.feedback.trim()).subscribe({
      next: () => {
        this.revising = false;
        this.feedback = '';
        this.notice = 'AI revision queued.';
        this.load();
      },
      error: (err) => {
        this.revising = false;
        this.error = this.describe(err);
      },
    });
  }

  fixWithAi(): void {
    const concern = this.project?.reviewGate.primaryConcern ?? 'fix the blocking issues';
    this.feedback = concern;
    this.revise();
  }

  syncDraft(): void {
    this.api
      .publishProject(this.projectId, { action: 'update', targetStatus: 'draft' })
      .subscribe({
        next: () => {
          this.notice = 'Draft sync queued.';
          this.load();
        },
        error: (err) => {
          this.error = this.describe(err);
        },
      });
  }

  publish(): void {
    this.api
      .publishProject(this.projectId, { action: 'publish', targetStatus: 'publish' })
      .subscribe({
        next: () => {
          this.notice = 'Publication queued.';
          this.load();
        },
        error: (err) => {
          this.error = this.describe(err);
        },
      });
  }

  unpublish(): void {
    this.api
      .publishProject(this.projectId, { action: 'unpublish', targetStatus: 'publish' })
      .subscribe({
        next: () => {
          this.notice = 'Unpublish queued.';
          this.load();
        },
        error: (err) => {
          this.error = this.describe(err);
        },
      });
  }

  selectVersion(version: ProjectVersionDetail): void {
    this.selectedVersionId = this.selectedVersionId === version.id ? null : version.id;
  }

  tabLabel(tab: WorkspaceTab): string {
    switch (tab) {
      case 'content':
        return 'Content';
      case 'media':
        return 'Media';
      case 'seo':
        return 'SEO';
      case 'history':
        return 'History';
    }
  }

  private describe(err: unknown): string {
    const body = (err as { error?: { message?: string } })?.error;
    return body?.message ? String(body.message) : 'Request failed.';
  }

  stageLabel = stageLabel;
  stageTone = stageTone;
}
