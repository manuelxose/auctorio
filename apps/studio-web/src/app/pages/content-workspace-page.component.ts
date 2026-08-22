import { CommonModule } from '@angular/common';
import { Component, DestroyRef, OnDestroy, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AppContextService } from '../services/app-context.service';
import { StudioApiService } from '../services/studio-api.service';
import type {
  ProjectVersionDetail,
  PublishingAccount,
  StudioProjectDetailView,
  StudioPublication,
  StudioSocialContent,
} from '../models/studio.models';
import { stageLabel, stageTone } from '../utils/content-status';

type WorkspaceTab = 'content' | 'media' | 'seo' | 'social' | 'schedule' | 'history';
type ProjectPublication = {
  id: string;
  channel: 'website' | 'x' | 'instagram';
  status: string;
  scheduledFor: string | null;
  publishedAt: string | null;
  externalId: string | null;
  lastError: string | null;
  account: { id: string; platform: string; displayName: string } | null;
  site: { id: string; key: string; name: string } | null;
};

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
            <span class="au-tag" *ngIf="project.origin === 'auto'" title="Created by automation">🤖 auto</span>
          </div>
          <div class="au-readiness">
            <span class="au-readiness__item" [class.is-ready]="readiness.article">Article</span>
            <span class="au-readiness__item" [class.is-ready]="readiness.media">Media</span>
            <span class="au-readiness__item" [class.is-ready]="readiness.seo">SEO</span>
            <span class="au-readiness__item" [class.is-ready]="readiness.x">X</span>
            <span class="au-readiness__item" [class.is-ready]="readiness.instagram">Instagram</span>
            <span class="au-readiness__item" [class.is-ready]="readiness.schedule">Schedule</span>
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

            <section class="au-surface au-surface--padded" *ngSwitchCase="'social'">
              <div class="au-social-generate">
                <p class="au-auth__hint">Generate platform-native copy from the current article version.</p>
                <div class="au-social-generate__controls">
                  <label class="au-check"><input type="checkbox" [(ngModel)]="socialChannels.x" /> X post</label>
                  <label class="au-check"><input type="checkbox" [(ngModel)]="socialChannels.instagram" /> Instagram</label>
                  <label class="au-field au-field--inline">
                    <span>X thread length</span>
                    <select class="au-input au-input--sm" [(ngModel)]="socialThreadLength">
                      <option [ngValue]="1">single post</option>
                      <option [ngValue]="2">2 posts</option>
                      <option [ngValue]="3">3 posts</option>
                      <option [ngValue]="5">5 posts</option>
                    </select>
                  </label>
                  <button class="au-button au-button--primary" type="button" [disabled]="socialGenerating" (click)="generateSocial()">
                    {{ socialGenerating ? 'Generating…' : 'Generate social copy' }}
                  </button>
                </div>
              </div>

              <div class="au-empty" *ngIf="social.length === 0">No social derivatives yet. Generate X and Instagram copy from this article.</div>

              <article class="au-social-card" *ngFor="let piece of social">
                <header class="au-social-card__header">
                  <span class="au-channel-badge" [ngClass]="'au-channel-badge--' + piece.channel">{{ piece.channel }}</span>
                  <span class="au-tag au-tag--muted">{{ piece.contentType }}</span>
                  <span class="au-tag" [class.au-tag--success]="piece.editorialStatus === 'approved'" [class.au-tag--danger]="piece.editorialStatus === 'rejected'">
                    {{ piece.generationStatus }} / {{ piece.editorialStatus }}
                  </span>
                  <span class="au-social-card__count" [class.is-over]="isOverLimit(piece)">
                    {{ piece.characterCount ?? 0 }}/{{ limitFor(piece) }}
                  </span>
                  <span class="au-social-card__meta" *ngIf="piece.threadPosition !== null">post {{ piece.threadPosition + 1 }}</span>
                </header>
                <textarea class="au-input au-input--social" rows="3" [ngModel]="piece.body" (ngModelChange)="updateSocialBody(piece, $event)"></textarea>
                <div class="au-social-card__hashtags" *ngIf="piece.hashtags?.length">
                  <span class="au-tag au-tag--muted" *ngFor="let tag of piece.hashtags">{{ tag }}</span>
                </div>
                <footer class="au-social-card__actions">
                  <button class="au-button au-button--ghost au-button--sm" type="button" (click)="regenerateSocialPiece(piece)">↻ Regenerate</button>
                  <button class="au-button au-button--ghost au-button--sm" type="button" (click)="saveSocialPiece(piece)">Save</button>
                  <button class="au-button au-button--ghost au-button--sm" type="button" (click)="approveSocial(piece)">Approve</button>
                </footer>
              </article>
            </section>

            <section class="au-surface au-surface--padded" *ngSwitchCase="'schedule'">
              <p class="au-auth__hint">Schedule the article and its social posts. Times are in your site timezone.</p>
              <table class="au-table au-table--schedule">
                <thead>
                  <tr><th>Channel</th><th>Destination</th><th>Status</th><th>When</th><th></th></tr>
                </thead>
                <tbody>
                  <tr *ngFor="let publication of publications">
                    <td><span class="au-channel-badge" [ngClass]="'au-channel-badge--' + publication.channel">{{ publication.channel }}</span></td>
                    <td>{{ destinationLabel(publication) }}</td>
                    <td><span class="au-tag" [ngClass]="statusClass(publication.status)">{{ publication.status }}</span>
                      <span class="au-social-card__meta" *ngIf="publication.lastError">{{ publication.lastError }}</span>
                    </td>
                    <td>
                      <input
                        class="au-input au-input--sm"
                        type="datetime-local"
                        [ngModel]="toLocalInput(publication.scheduledFor)"
                        (ngModelChange)="reschedule(publication, $event)"
                      />
                    </td>
                    <td class="au-cell-actions">
                      <button class="au-button au-button--ghost au-button--xs" type="button" *ngIf="publication.status === 'failed'" (click)="retryPublication(publication)">Retry</button>
                      <button class="au-button au-button--ghost au-button--xs" type="button" *ngIf="publication.status === 'scheduled' || publication.status === 'ready' || publication.status === 'draft'" (click)="publishNow(publication)">Publish now</button>
                      <button class="au-button au-button--ghost au-button--xs au-button--danger" type="button" *ngIf="publication.status === 'scheduled'" (click)="cancelPublication(publication)">Cancel</button>
                    </td>
                  </tr>
                </tbody>
              </table>

              <div class="au-form__actions au-form__actions--schedule" *ngIf="publications.length === 0">
                <label class="au-field">
                  <span>Article on</span>
                  <select class="au-input" [(ngModel)]="newArticleSiteId">
                    <option *ngFor="let site of scheduleSites" [ngValue]="site.id">{{ site.name }}</option>
                  </select>
                </label>
                <input class="au-input au-input--inline" type="datetime-local" [(ngModel)]="newScheduleTime" />
                <button class="au-button au-button--secondary" type="button" (click)="scheduleWebsite()">Schedule article</button>
              </div>
              <div class="au-form__actions au-form__actions--schedule" *ngIf="publications.length > 0">
                <button class="au-button au-button--secondary" type="button" *ngIf="!hasChannel('website')" (click)="scheduleWebsite()">+ Schedule article</button>
                <button class="au-button au-button--secondary" type="button" *ngIf="!hasChannel('x')" (click)="scheduleSocial('x')">+ Schedule X</button>
                <button class="au-button au-button--secondary" type="button" *ngIf="!hasChannel('instagram')" (click)="scheduleSocial('instagram')">+ Schedule Instagram</button>
              </div>
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
  styles: [
    `
      .au-readiness { display: flex; gap: 0.35rem; flex-wrap: wrap; margin-top: 0.5rem; }
      .au-readiness__item {
        font-size: 0.7rem; padding: 2px 8px; border-radius: 999px;
        background: var(--au-surface-subtle, #f3f4f6); color: var(--au-muted, #6b7280);
      }
      .au-readiness__item.is-ready { background: #dcfce7; color: #15803d; }
      .au-social-generate { margin-bottom: 1rem; }
      .au-social-generate__controls { display: flex; gap: 0.8rem; align-items: center; flex-wrap: wrap; margin-top: 0.5rem; }
      .au-field--inline { flex-direction: row; align-items: center; gap: 0.4rem; }
      .au-check { display: inline-flex; align-items: center; gap: 0.35rem; font-size: 0.85rem; }
      .au-social-card { border: 1px solid var(--au-border, #e5e7eb); border-radius: 8px; padding: 0.8rem; margin-bottom: 0.8rem; }
      .au-social-card__header { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 0.5rem; }
      .au-social-card__count { margin-left: auto; font-size: 0.75rem; color: var(--au-muted, #6b7280); }
      .au-social-card__count.is-over { color: var(--au-danger, #dc2626); font-weight: 700; }
      .au-social-card__meta { font-size: 0.72rem; color: var(--au-muted, #6b7280); }
      .au-input--social { font-size: 0.9rem; line-height: 1.5; }
      .au-social-card__hashtags { display: flex; gap: 0.3rem; flex-wrap: wrap; margin-top: 0.4rem; }
      .au-social-card__actions { display: flex; gap: 0.4rem; margin-top: 0.6rem; }
      .au-button--sm { padding: 0.3rem 0.7rem; font-size: 0.8rem; }
      .au-button--xs { padding: 0.2rem 0.5rem; font-size: 0.75rem; }
      .au-button--danger { color: var(--au-danger, #dc2626); }
      .au-table--schedule { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
      .au-table--schedule th { text-align: left; padding: 0.5rem 0.6rem; border-bottom: 1px solid var(--au-border, #e5e7eb); color: var(--au-muted, #6b7280); }
      .au-table--schedule td { padding: 0.55rem 0.6rem; border-bottom: 1px solid var(--au-border-subtle, #f3f4f6); }
      .au-form__actions--schedule { justify-content: flex-start; margin-top: 1rem; align-items: flex-end; }
      .au-input--sm { padding: 0.3rem 0.5rem; font-size: 0.8rem; width: auto; }
      .au-channel-badge { text-transform: uppercase; font-size: 0.65rem; padding: 2px 6px; border-radius: 4px; }
      .au-channel-badge--website { background: #dbeafe; color: #1d4ed8; }
      .au-channel-badge--x { background: #111; color: #fff; }
      .au-channel-badge--instagram { background: #fdf2f8; color: #be185d; }
      .au-cell-actions { white-space: nowrap; }
    `,
  ],
})
export class ContentWorkspacePageComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(StudioApiService);
  private readonly appContext = inject(AppContextService);
  private readonly destroyRef = inject(DestroyRef);

  project: StudioProjectDetailView | null = null;
  activeTab: WorkspaceTab = 'content';
  tabs: WorkspaceTab[] = ['content', 'media', 'seo', 'social', 'schedule', 'history'];
  error = '';
  notice = '';
  saving = false;
  revising = false;
  feedback = '';
  selectedVersionId: string | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  // Social tab state.
  socialChannels = { x: true, instagram: true };
  socialThreadLength = 1;
  socialGenerating = false;
  socialDrafts: Record<string, string> = {};
  accounts: PublishingAccount[] = [];

  // Schedule tab state.
  scheduleSites: Array<{ id: string; name: string }> = [];
  newScheduleTime = '';
  newArticleSiteId = '';

  get social(): StudioSocialContent[] {
    return this.project?.socialContents ?? [];
  }

  get publications(): ProjectPublication[] {
    const list = this.project?.publications ?? [];
    return list.filter((publication) => publication.status !== 'deleted') as ProjectPublication[];
  }

  get readiness(): { article: boolean; media: boolean; seo: boolean; x: boolean; instagram: boolean; schedule: boolean } {
    const version = this.project?.latestVersion;
    const xDone = this.social.some((piece) => piece.channel === 'x' && piece.generationStatus === 'done');
    const igDone = this.social.some((piece) => piece.channel === 'instagram' && piece.generationStatus === 'done');
    return {
      article: Boolean(version?.bodyHtml),
      media: Boolean(version?.hasAsset),
      seo: Boolean(version?.seoTitle),
      x: xDone,
      instagram: igDone,
      schedule: this.publications.some((publication) => ['scheduled', 'published'].includes(publication.status)),
    };
  }

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
    this.api.listPublishingAccounts().subscribe({
      next: (response) => {
        this.accounts = response.items;
      },
    });
    this.scheduleSites = this.appContext.sites().map((site) => ({ id: site.id, name: site.name }));
    this.newArticleSiteId = this.scheduleSites[0]?.id ?? '';
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
      case 'social':
        return 'Social';
      case 'schedule':
        return 'Schedule';
      case 'history':
        return 'History';
    }
  }

  // ── Social tab actions ──

  generateSocial(): void {
    const channels = [
      ...(this.socialChannels.x ? (['x'] as const) : []),
      ...(this.socialChannels.instagram ? (['instagram'] as const) : []),
    ];
    if (channels.length === 0) {
      this.error = 'Select at least one channel.';
      return;
    }
    this.socialGenerating = true;
    this.api.generateSocial(this.projectId, { channels, threadLength: this.socialThreadLength }).subscribe({
      next: () => {
        this.socialGenerating = false;
        this.notice = 'Social generation queued.';
        this.startPolling();
      },
      error: (err) => {
        this.socialGenerating = false;
        this.error = this.describe(err);
      },
    });
  }

  updateSocialBody(piece: StudioSocialContent, body: string): void {
    this.socialDrafts[piece.id] = body;
  }

  saveSocialPiece(piece: StudioSocialContent): void {
    const body = this.socialDrafts[piece.id];
    this.api.updateSocial(piece.id, body === undefined ? {} : { body }).subscribe({
      next: () => {
        this.notice = 'Social copy saved.';
        this.load();
      },
      error: (err) => {
        this.error = this.describe(err);
      },
    });
  }

  regenerateSocialPiece(piece: StudioSocialContent): void {
    this.api.regenerateSocial(piece.id).subscribe({
      next: () => {
        this.notice = 'Regeneration queued.';
        this.startPolling();
      },
      error: (err) => {
        this.error = this.describe(err);
      },
    });
  }

  approveSocial(piece: StudioSocialContent): void {
    this.api.updateSocial(piece.id, { editorialStatus: 'approved' }).subscribe({
      next: () => this.load(),
      error: (err) => {
        this.error = this.describe(err);
      },
    });
  }

  isOverLimit(piece: StudioSocialContent): boolean {
    const count = piece.characterCount ?? 0;
    return count > this.limitFor(piece);
  }

  limitFor(piece: StudioSocialContent): number {
    return piece.channel === 'x' ? 280 : 2200;
  }

  // ── Schedule tab actions ──

  hasChannel(channel: string): boolean {
    return this.publications.some((publication) => publication.channel === channel);
  }

  destinationLabel(publication: ProjectPublication): string {
    if (publication.channel === 'website') {
      return publication.site?.name ?? 'Website';
    }
    return publication.account?.displayName ?? publication.channel;
  }

  statusClass(status: string): string {
    switch (status) {
      case 'published':
        return 'au-tag--success';
      case 'failed':
        return 'au-tag--danger';
      case 'scheduled':
      case 'queued':
      case 'publishing':
        return 'au-tag--warning';
      default:
        return 'au-tag--muted';
    }
  }

  toLocalInput(value: string | null): string {
    if (!value) {
      return '';
    }
    const date = new Date(value);
    const pad = (part: number) => String(part).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  reschedule(publication: ProjectPublication, localInput: string): void {
    if (!localInput) {
      return;
    }
    this.api.reschedulePublication(publication.id, new Date(localInput).toISOString()).subscribe({
      next: () => {
        this.notice = 'Publication rescheduled.';
        this.load();
      },
      error: (err) => {
        this.error = this.describe(err);
        this.load();
      },
    });
  }

  cancelPublication(publication: ProjectPublication): void {
    if (!window.confirm(`Cancel this ${publication.channel} publication?`)) {
      return;
    }
    this.api.cancelPublication(publication.id).subscribe({
      next: () => this.load(),
      error: (err) => {
        this.error = this.describe(err);
      },
    });
  }

  retryPublication(publication: ProjectPublication): void {
    this.api.retryPublication(publication.id).subscribe({
      next: () => this.load(),
      error: (err) => {
        this.error = this.describe(err);
      },
    });
  }

  publishNow(publication: ProjectPublication): void {
    this.api.publishNow(publication.id).subscribe({
      next: () => this.load(),
      error: (err) => {
        this.error = this.describe(err);
      },
    });
  }

  scheduleWebsite(): void {
    if (!this.project) {
      return;
    }
    const versionId = this.project.latestVersion?.id;
    if (!versionId) {
      this.error = 'No article version to schedule.';
      return;
    }
    const scheduledFor = this.newScheduleTime ? new Date(this.newScheduleTime).toISOString() : undefined;
    this.api
      .createPublication({
        projectId: this.projectId,
        versionId,
        channel: 'website',
        siteId: this.newArticleSiteId || this.project.siteId,
        scheduledFor,
      })
      .subscribe({
        next: () => {
          this.notice = scheduledFor ? 'Article scheduled.' : 'Article publication draft created.';
          this.load();
        },
        error: (err) => {
          this.error = this.describe(err);
        },
      });
  }

  scheduleSocial(channel: 'x' | 'instagram'): void {
    if (!this.project) {
      return;
    }
    const versionId = this.project.latestVersion?.id;
    if (!versionId) {
      this.error = 'No article version to schedule.';
      return;
    }
    const account = this.accounts.find((entry) => entry.platform === channel && entry.enabled);
    if (!account) {
      this.error = `No enabled ${channel} account. Connect one in Automation → Social accounts.`;
      return;
    }
    const piece = this.social.find((entry) => entry.channel === channel && entry.generationStatus === 'done');
    const scheduledFor = this.newScheduleTime ? new Date(this.newScheduleTime).toISOString() : undefined;
    this.api
      .createPublication({
        projectId: this.projectId,
        versionId,
        channel,
        accountId: account.id,
        socialContentId: piece?.id,
        scheduledFor,
      })
      .subscribe({
        next: () => {
          this.notice = `${channel} publication ${scheduledFor ? 'scheduled' : 'created'}.`;
          this.load();
        },
        error: (err) => {
          this.error = this.describe(err);
        },
      });
  }

  private describe(err: unknown): string {
    const body = (err as { error?: { message?: string } })?.error;
    return body?.message ? String(body.message) : 'Request failed.';
  }

  stageLabel = stageLabel;
  stageTone = stageTone;
}
