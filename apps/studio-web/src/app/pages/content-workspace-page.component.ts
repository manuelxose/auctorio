import { CommonModule } from '@angular/common';
import { Component, DestroyRef, OnDestroy, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AppContextService } from '../services/app-context.service';
import { StudioApiService } from '../services/studio-api.service';
import { ConfirmService } from '../services/confirm.service';
import { ToastService } from '../services/toast.service';
import { AppIconComponent } from '../components/ui/app-icon.component';
import { AuRichEditorComponent } from '../components/ui/au-rich-editor.component';
import type {
  InternalLinkSuggestion,
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

function strOf(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

@Component({
  selector: 'app-content-workspace-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, AppIconComponent, AuRichEditorComponent],
  template: `
    <section class="au-page" *ngIf="project; else loadingState">
      <a class="au-link au-mb-2" routerLink="/studio/content">
        <app-icon name="chevron-left"></app-icon>
        Back to content
      </a>

      <header class="au-page__header">
        <div>
          <h1 class="au-page__title">{{ project.title }}</h1>
          <div class="au-page__tags">
            <span class="au-badge au-badge--neutral">{{ project.site.name }}</span>
            <span class="au-badge" [class]="'au-badge--' + stageTone(project.reviewGate)">
              {{ stageLabel(project.reviewGate) }}
            </span>
            <span class="au-badge au-badge--brand" *ngIf="project.origin === 'auto'" title="Created by automation">automatic</span>
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
          <button class="au-btn au-btn--ghost" type="button" (click)="refresh()">
            <app-icon name="refresh"></app-icon>
            Refresh
          </button>
          <button class="au-btn au-btn--secondary" type="button" *ngIf="canGenerate" (click)="generate()">
            <app-icon name="sparkles"></app-icon>
            {{ project.versions.length > 0 ? 'Regenerate' : 'Generate article' }}
          </button>
          <button class="au-btn au-btn--secondary" type="button" *ngIf="imageNeedsRetry" (click)="retryImage()">
            <app-icon name="refresh"></app-icon>
            Retry image
          </button>
          <button class="au-btn au-btn--secondary" type="button" *ngIf="canApprove" (click)="approve()">
            <app-icon name="circle-check"></app-icon>
            Approve
          </button>
          <button class="au-btn au-btn--primary" type="button" *ngIf="canSyncDraft" (click)="syncDraft()">Save to site as draft</button>
          <button class="au-btn au-btn--primary" type="button" *ngIf="canPublish" (click)="publish()">
            <app-icon name="publications"></app-icon>
            {{ published ? 'Republish' : 'Publish' }}
          </button>
          <button class="au-btn au-btn--danger" type="button" *ngIf="canUnpublish" (click)="unpublish()">Unpublish</button>
        </div>
      </header>

      <div class="au-banner au-banner--error" *ngIf="error">
        <app-icon name="warning"></app-icon>
        <span class="au-banner__text">{{ error }}</span>
      </div>
      <div class="au-banner au-banner--success" *ngIf="notice">
        <app-icon name="circle-check"></app-icon>
        <span class="au-banner__text">{{ notice }}</span>
      </div>

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
            <section class="au-panel au-panel--padded" *ngSwitchCase="'content'">
              <div class="au-empty" *ngIf="!project.latestVersion">
                <span class="au-empty__icon"><app-icon name="sparkles"></app-icon></span>
                <p class="au-empty__title">Generating your article…</p>
                <p class="au-empty__text">The workspace refreshes automatically when the first version is ready.</p>
              </div>

              <ng-container *ngIf="project.latestVersion">
                <label class="au-field">
                  <span class="au-field__label">Title</span>
                  <input class="au-input" type="text" [(ngModel)]="draftTitle" />
                </label>
                <label class="au-field">
                  <span class="au-field__label">Excerpt</span>
                  <textarea class="au-textarea" rows="2" [(ngModel)]="draftExcerpt"></textarea>
                </label>
                <div class="au-field au-mb-2">
                  <span class="au-field__label">Article</span>
                  <au-rich-editor [(ngModel)]="draftBody" (autosave)="onAutosave()"></au-rich-editor>
                </div>
                <div class="au-form__actions">
                  <button class="au-btn au-btn--secondary" type="button" [disabled]="saving" (click)="save()">
                    {{ saving ? 'Saving…' : 'Save' }}
                  </button>
                  <span class="au-muted" *ngIf="bodyDirty">Unsaved changes are autosaved periodically.</span>
                </div>
              </ng-container>

              <details class="au-advanced au-mt-3">
                <summary>Ask the AI to improve this</summary>
                <textarea class="au-textarea au-mt-2" rows="2" placeholder="e.g. Add a section about prices…" [(ngModel)]="feedback"></textarea>
                <div class="au-form__actions">
                  <button class="au-btn au-btn--secondary" type="button" [disabled]="revising" (click)="revise()">
                    <app-icon name="sparkles"></app-icon>
                    {{ revising ? 'Revising…' : 'Revise with AI' }}
                  </button>
                </div>
              </details>
            </section>

            <section class="au-panel au-panel--padded" *ngSwitchCase="'media'">
              <div class="au-media-grid" *ngIf="project.latestVersion?.assetVariants?.length">
                <article class="au-media-card" *ngFor="let variant of project.latestVersion?.assetVariants ?? []">
                  <img [src]="variant.publicUrl || ''" [alt]="variant.kind" loading="lazy" />
                  <div class="au-media-card__body">
                    <span class="au-badge au-badge--neutral">{{ variant.kind }} · {{ variant.width }}×{{ variant.height }}</span>
                  </div>
                </article>
              </div>
              <div class="au-empty" *ngIf="!(project.latestVersion?.assetVariants?.length)">
                <span class="au-empty__icon"><app-icon name="media"></app-icon></span>
                <p class="au-empty__title" *ngIf="project.latestVersion?.image?.status === 'queued' || project.latestVersion?.image?.status === 'processing'">
                  Generating hero image…
                </p>
                <p class="au-empty__title" *ngIf="project.latestVersion?.image?.status === 'failed' || project.latestVersion?.image?.status === 'retryable'">
                  {{ imageError }}
                </p>
                <p class="au-empty__title" *ngIf="!project.latestVersion?.image">No hero image yet</p>
                <p class="au-empty__text">A hero image improves article performance on social channels.</p>
              </div>
              <div class="au-form__actions">
                <button class="au-btn au-btn--secondary" type="button" (click)="generateAsset()">
                  <app-icon name="media"></app-icon>
                  {{ project.latestVersion?.assetVariants?.length ? 'Generate new image' : 'Generate image' }}
                </button>
              </div>
            </section>

            <section class="au-panel au-panel--padded" *ngSwitchCase="'seo'">
              <ng-container *ngIf="project.latestVersion; else seoEmpty">
                <!-- Explainable readiness score -->
                <div class="au-seo-score">
                  <div class="au-seo-score__value" [class.is-good]="seoScore >= 70" [class.is-mid]="seoScore >= 45 && seoScore < 70" [class.is-low]="seoScore < 45">
                    {{ seoScore }}
                    <span>/100</span>
                  </div>
                  <div class="au-seo-score__body">
                    <strong>SEO readiness: {{ seoScore }}/100</strong>
                    <p class="au-muted">{{ seoSummary }}</p>
                  </div>
                </div>

                <!-- Metadata -->
                <h3 class="au-panel__subtitle au-mb-1"><strong>Metadata</strong></h3>
                <div class="au-field-grid">
                  <label class="au-field">
                    <span class="au-field__label">SEO title</span>
                    <input class="au-input" type="text" [(ngModel)]="draftSeoTitle" />
                    <span class="au-field__hint" [class.au-hint--over]="(draftSeoTitle || '').length > 70">{{ (draftSeoTitle || '').length }} / 70 characters</span>
                  </label>
                  <label class="au-field">
                    <span class="au-field__label">Slug</span>
                    <input class="au-input" type="text" [(ngModel)]="draftSlug" placeholder="suggested-slug" />
                  </label>
                  <label class="au-field">
                    <span class="au-field__label">Canonical URL</span>
                    <input class="au-input" type="text" [(ngModel)]="draftCanonicalUrl" placeholder="https://…" />
                  </label>
                </div>
                <label class="au-field">
                  <span class="au-field__label">Meta description</span>
                  <textarea class="au-textarea" rows="3" [(ngModel)]="draftSeoDescription"></textarea>
                  <span class="au-field__hint" [class.au-hint--over]="(draftSeoDescription || '').length > 165">{{ (draftSeoDescription || '').length }} / 165 characters</span>
                </label>

                <!-- Strategy -->
                <h3 class="au-panel__subtitle au-mb-1 au-mt-2"><strong>Strategy</strong></h3>
                <div class="au-field-grid">
                  <label class="au-field">
                    <span class="au-field__label">Primary search intent</span>
                    <select class="au-select" [(ngModel)]="draftPrimaryIntent">
                      <option value="">— none —</option>
                      <option *ngFor="let intent of intentOptions" [value]="intent">{{ intent }}</option>
                    </select>
                  </label>
                  <label class="au-field">
                    <span class="au-field__label">Content type</span>
                    <select class="au-select" [(ngModel)]="draftContentType">
                      <option value="">— none —</option>
                      <option *ngFor="let format of formatOptions" [value]="format">{{ format }}</option>
                    </select>
                  </label>
                  <label class="au-field">
                    <span class="au-field__label">Target query</span>
                    <input class="au-input" type="text" [(ngModel)]="draftTargetQuery" />
                  </label>
                  <label class="au-field">
                    <span class="au-field__label">Primary keyword</span>
                    <input class="au-input" type="text" [(ngModel)]="draftPrimaryKeyword" />
                  </label>
                  <label class="au-field">
                    <span class="au-field__label">Secondary keywords</span>
                    <input class="au-input" type="text" [(ngModel)]="draftSecondaryKeywords" placeholder="Comma-separated" />
                  </label>
                  <label class="au-field">
                    <span class="au-field__label">Topic cluster</span>
                    <input class="au-input" type="text" [(ngModel)]="draftTopicCluster" />
                  </label>
                </div>

                <div class="au-form__actions">
                  <button class="au-btn au-btn--secondary" type="button" [disabled]="saving" (click)="save()">
                    {{ saving ? 'Saving…' : 'Save SEO' }}
                  </button>
                  <button class="au-btn au-btn--ghost" type="button" (click)="aiImprove('seoTitle')">
                    <app-icon name="sparkles"></app-icon> Improve SEO title
                  </button>
                  <button class="au-btn au-btn--ghost" type="button" (click)="aiImprove('metaDescription')">
                    <app-icon name="sparkles"></app-icon> Improve meta description
                  </button>
                </div>

                <!-- SERP preview -->
                <h3 class="au-panel__subtitle au-mb-1 au-mt-2"><strong>Search preview</strong></h3>
                <div class="au-serp">
                  <p class="au-serp__title">{{ draftSeoTitle || project.latestVersion?.title || 'SEO title' }}</p>
                  <p class="au-serp__url">{{ serpUrl }}</p>
                  <p class="au-serp__desc">{{ draftSeoDescription || 'Meta description appears here.' }}</p>
                </div>

                <!-- Content analysis -->
                <h3 class="au-panel__subtitle au-mb-1 au-mt-2"><strong>Content analysis</strong></h3>
                <ul class="au-seo-findings">
                  <li *ngFor="let finding of seoFindings" [class.is-fail]="!finding.passed" [class.is-warn]="!finding.passed && finding.severity === 'warning'" [class.is-error]="!finding.passed && finding.severity === 'error'">
                    <app-icon [name]="finding.passed ? 'circle-check' : 'warning'"></app-icon>
                    <span><strong>{{ finding.label }}</strong> — {{ finding.message }}</span>
                  </li>
                </ul>

                <!-- Internal links from real inventory -->
                <h3 class="au-panel__subtitle au-mb-1 au-mt-2"><strong>Internal links (real site inventory)</strong></h3>
                <div class="au-form__actions au-mt-1">
                  <button class="au-btn au-btn--ghost au-btn--sm" type="button" [disabled]="linksLoading" (click)="loadLinkSuggestions()">
                    <app-icon name="connections"></app-icon>
                    {{ linksLoading ? 'Looking up…' : 'Suggest internal links' }}
                  </button>
                </div>
                <ul class="au-link-suggestions au-mt-1" *ngIf="linkSuggestions.length > 0">
                  <li *ngFor="let suggestion of linkSuggestions">
                    <div>
                      <strong>{{ suggestion.title }}</strong>
                      <span class="au-muted au-block">{{ suggestion.url }} · {{ suggestion.reason }} · score {{ suggestion.score }}</span>
                    </div>
                    <button class="au-btn au-btn--ghost au-btn--sm" type="button" (click)="insertLinkSuggestion(suggestion)">Insert</button>
                  </li>
                </ul>
                <p class="au-muted" *ngIf="linksChecked && linkSuggestions.length === 0">No matching pages in the site inventory for the current keyword. Index more pages or refine the keyword.</p>
              </ng-container>
              <ng-template #seoEmpty>
                <div class="au-empty">
                  <p class="au-empty__title">No version to optimize yet</p>
                  <p class="au-empty__text">Generate the article first; the SEO workspace analyzes the latest version.</p>
                </div>
              </ng-template>
            </section>

            <section class="au-panel au-panel--padded" *ngSwitchCase="'social'">
              <div class="au-social-generate au-mb-3">
                <p class="au-hint">Generate platform-native copy from the current article version.</p>
                <div class="au-social-generate__controls au-mt-2">
                  <label class="au-checkbox"><input type="checkbox" [(ngModel)]="socialChannels.x" /> X post</label>
                  <label class="au-checkbox"><input type="checkbox" [(ngModel)]="socialChannels.instagram" /> Instagram</label>
                  <label class="au-inline au-muted">
                    <span>X thread length</span>
                    <select class="au-select au-filter-select" [(ngModel)]="socialThreadLength">
                      <option [ngValue]="1">single post</option>
                      <option [ngValue]="2">2 posts</option>
                      <option [ngValue]="3">3 posts</option>
                      <option [ngValue]="5">5 posts</option>
                    </select>
                  </label>
                  <button class="au-btn au-btn--primary" type="button" [disabled]="socialGenerating" (click)="generateSocial()">
                    <app-icon name="sparkles"></app-icon>
                    {{ socialGenerating ? 'Generating social copy…' : 'Generate social copy' }}
                  </button>
                </div>
              </div>

              <div class="au-empty" *ngIf="social.length === 0">
                <span class="au-empty__icon"><app-icon name="publications"></app-icon></span>
                <p class="au-empty__title">No social derivatives yet</p>
                <p class="au-empty__text">Generate X and Instagram copy from this article.</p>
              </div>

              <article class="au-social-card" *ngFor="let piece of social">
                <header class="au-social-card__header">
                  <span class="au-channel" [class]="'au-channel--' + piece.channel">{{ piece.channel }}</span>
                  <span class="au-badge au-badge--neutral">{{ piece.contentType }}</span>
                  <span class="au-badge" [class.au-badge--success]="piece.editorialStatus === 'approved'" [class.au-badge--danger]="piece.editorialStatus === 'rejected'" [class.au-badge--warning]="piece.editorialStatus !== 'approved' && piece.editorialStatus !== 'rejected'">
                    {{ piece.generationStatus }} / {{ piece.editorialStatus }}
                  </span>
                  <span class="au-social-card__count" [class.is-over]="isOverLimit(piece)">
                    {{ piece.characterCount ?? 0 }}/{{ limitFor(piece) }}
                  </span>
                  <span class="au-social-card__meta" *ngIf="piece.threadPosition !== null">post {{ piece.threadPosition + 1 }}</span>
                </header>
                <textarea class="au-textarea" rows="3" [ngModel]="piece.body" (ngModelChange)="updateSocialBody(piece, $event)"></textarea>
                <div class="au-social-card__hashtags" *ngIf="piece.hashtags?.length">
                  <span class="au-badge au-badge--neutral" *ngFor="let tag of piece.hashtags">{{ tag }}</span>
                </div>
                <footer class="au-social-card__actions">
                  <button class="au-btn au-btn--ghost au-btn--sm" type="button" (click)="regenerateSocialPiece(piece)">
                    <app-icon name="refresh"></app-icon>
                    Regenerate
                  </button>
                  <button class="au-btn au-btn--ghost au-btn--sm" type="button" (click)="saveSocialPiece(piece)">Save</button>
                  <button class="au-btn au-btn--secondary au-btn--sm" type="button" (click)="approveSocial(piece)">
                    <app-icon name="circle-check"></app-icon>
                    Approve
                  </button>
                </footer>
              </article>
            </section>

            <section class="au-panel" *ngSwitchCase="'schedule'">
              <p class="au-hint au-panel-pad">Schedule the article and its social posts. Times are in your site timezone.</p>
              <div class="au-table-wrap">
                <table class="au-table">
                  <thead>
                    <tr><th>Channel</th><th>Destination</th><th>Status</th><th>When</th><th style="width: 220px"></th></tr>
                  </thead>
                  <tbody>
                    <tr *ngFor="let publication of publications">
                      <td><span class="au-channel" [class]="'au-channel--' + publication.channel">{{ publication.channel }}</span></td>
                      <td>{{ destinationLabel(publication) }}</td>
                      <td>
                        <span class="au-badge" [class]="statusClass(publication.status)">{{ publication.status }}</span>
                        <span class="au-table__sub" *ngIf="publication.lastError">{{ publication.lastError }}</span>
                      </td>
                      <td>
                        <input
                          class="au-input"
                          type="datetime-local"
                          [ngModel]="toLocalInput(publication.scheduledFor)"
                          (ngModelChange)="reschedule(publication, $event)"
                        />
                      </td>
                      <td>
                        <div class="au-inline">
                          <button class="au-btn au-btn--ghost au-btn--sm" type="button" *ngIf="publication.status === 'failed'" (click)="retryPublication(publication)">
                            <app-icon name="refresh"></app-icon>
                            Retry
                          </button>
                          <button class="au-btn au-btn--ghost au-btn--sm" type="button" *ngIf="publication.status === 'scheduled' || publication.status === 'ready' || publication.status === 'draft'" (click)="publishNow(publication)">
                            Publish now
                          </button>
                          <button class="au-btn au-btn--danger-ghost au-btn--sm" type="button" *ngIf="publication.status === 'scheduled'" (click)="cancelPublication(publication)">
                            Cancel
                          </button>
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div class="au-form__actions au-panel-pad au-mt-0" *ngIf="publications.length === 0">
                <label class="au-field au-mb-0">
                  <span class="au-field__label">Article on</span>
                  <select class="au-select au-filter-select" [(ngModel)]="newArticleSiteId">
                    <option *ngFor="let site of scheduleSites" [ngValue]="site.id">{{ site.name }}</option>
                  </select>
                </label>
                <input class="au-input" style="max-width: 220px" type="datetime-local" [(ngModel)]="newScheduleTime" />
                <button class="au-btn au-btn--secondary" type="button" (click)="scheduleWebsite()">Schedule article</button>
              </div>
              <div class="au-form__actions au-panel-pad au-mt-0" *ngIf="publications.length > 0">
                <button class="au-btn au-btn--secondary au-btn--sm" type="button" *ngIf="!hasChannel('website')" (click)="scheduleWebsite()">
                  <app-icon name="plus"></app-icon>
                  Schedule article
                </button>
                <button class="au-btn au-btn--secondary au-btn--sm" type="button" *ngIf="!hasChannel('x')" (click)="scheduleSocial('x')">
                  <app-icon name="plus"></app-icon>
                  Schedule X
                </button>
                <button class="au-btn au-btn--secondary au-btn--sm" type="button" *ngIf="!hasChannel('instagram')" (click)="scheduleSocial('instagram')">
                  <app-icon name="plus"></app-icon>
                  Schedule Instagram
                </button>
              </div>
            </section>

            <section class="au-panel au-panel--padded" *ngSwitchCase="'history'">
              <div class="au-history">
                <button
                  class="au-history__item"
                  type="button"
                  *ngFor="let version of project.versions"
                  [class.is-active]="version.id === selectedVersionId"
                  (click)="selectVersion(version)"
                >
                  <span class="au-badge au-badge--neutral">v{{ version.versionNumber }}</span>
                  <span class="au-history__label">{{ version.title }}</span>
                  <span class="au-badge" [class]="'au-badge--' + versionStatusTone(version.status)">{{ version.status }}</span>
                  <span class="au-row__meta">{{ version.approvedBy || version.updatedAt | date: 'short' }}</span>
                </button>
              </div>
              <p class="au-hint au-mt-2" *ngIf="selectedVersionId">
                Comparing v{{ project.latestVersion?.versionNumber }} with v{{ selectedVersion?.versionNumber }}. Select a version to inspect its content below.
              </p>
              <pre class="au-diff" *ngIf="selectedVersion">{{ selectedVersion.bodyHtml }}</pre>
            </section>
          </ng-container>
        </div>

        <aside class="au-workspace__rail">
          <section class="au-panel au-panel--padded">
            <h2 class="au-panel__title au-mb-2">Quality</h2>
            <div class="au-qa" *ngIf="project.latestVersion; else noVersion">
              <div class="au-qa__score">
                <strong>{{ qaScore }}</strong><span>/ 100</span>
              </div>
              <ul class="au-qa__list">
                <li *ngFor="let issue of project.reviewGate.issues" [class.is-blocking]="issue.severity === 'blocking'">
                  <span class="au-qa__mark">
                    <app-icon [name]="issue.severity === 'blocking' ? 'circle-x' : 'warning'"></app-icon>
                  </span>
                  {{ issue.message }}
                </li>
              </ul>
              <p class="au-hint" *ngIf="project.reviewGate.blockerCount > 0">
                {{ project.reviewGate.blockerCount }} issue{{ project.reviewGate.blockerCount === 1 ? '' : 's' }} must be fixed before publishing.
              </p>
              <button class="au-btn au-btn--secondary au-btn--block" type="button" *ngIf="canFixWithAi" (click)="fixWithAi()">
                <app-icon name="sparkles"></app-icon>
                Fix with AI
              </button>
            </div>
            <ng-template #noVersion><p class="au-hint">Quality checks run after generation.</p></ng-template>
          </section>

          <section class="au-panel au-panel--padded">
            <h2 class="au-panel__title au-mb-2">Publishing</h2>
            <p class="au-hint">
              {{ project.site.name }} · {{ project.site.baseUrl || 'destination' }}
            </p>
            <div class="au-stack au-mt-2" *ngIf="project.latestPublicationJob">
              <span class="au-badge" [class]="'au-badge--' + jobTone(project.latestPublicationJob.status)">{{ project.latestPublicationJob.status }}</span>
              <a
                class="au-link"
                *ngIf="project.latestPublicationJob.externalUrl"
                [href]="externalLink"
                target="_blank"
                rel="noopener"
              >
                Open published page
                <app-icon name="external"></app-icon>
              </a>
            </div>
            <p class="au-hint" *ngIf="!project.latestPublicationJob">Not published yet.</p>
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
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);
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
  draftSlug = '';
  draftCanonicalUrl = '';
  draftPrimaryIntent = '';
  draftContentType = '';
  draftTargetQuery = '';
  draftPrimaryKeyword = '';
  draftSecondaryKeywords = '';
  draftTopicCluster = '';
  bodyDirty = false;
  linkSuggestions: InternalLinkSuggestion[] = [];
  linksLoading = false;
  linksChecked = false;
  intentOptions = ['informational', 'navigational', 'commercial-investigation', 'transactional', 'comparison', 'news', 'entertainment-discovery', 'where-to-watch', 'sports-live', 'mixed'];
  formatOptions = ['guide', 'news', 'ranking', 'comparison', 'analysis', 'explainer', 'tutorial', 'faq', 'review', 'preview', 'match-preview', 'match-report', 'schedule', 'where-to-watch', 'streaming-recommendation', 'evergreen-pillar', 'cluster-article'];

  get seoScore(): number {
    const report = this.project?.latestVersion?.qaReport as { score?: number; checks?: Array<{ passed: boolean; severity: string }> } | null;
    if (typeof report?.score === 'number') {
      return report.score;
    }
    if (!report?.checks?.length) {
      return 0;
    }
    const passed = report.checks.filter((check) => check.passed).length;
    return Math.round((passed / report.checks.length) * 100);
  }

  get seoFindings(): Array<{ key: string; label: string; passed: boolean; severity: string; message: string; group: string }> {
    const report = this.project?.latestVersion?.qaReport as {
      findings?: Array<{ key: string; label: string; passed: boolean; severity: string; message: string; group: string }>;
      checks?: Array<{ key: string; passed: boolean; message: string; severity: string }>;
    } | null;
    if (report?.findings?.length) {
      return report.findings.filter((finding) => finding.severity !== 'info');
    }
    return (report?.checks ?? []).map((check) => ({
      key: check.key,
      label: check.key,
      passed: check.passed,
      severity: check.severity,
      message: check.message,
      group: 'seo',
    }));
  }

  get seoSummary(): string {
    const findings = this.seoFindings;
    if (findings.length === 0) {
      return 'No analysis yet. Generate the article and save to refresh checks.';
    }
    const failures = findings.filter((finding) => !finding.passed);
    if (failures.length === 0) {
      return 'All checks passed.';
    }
    const errors = failures.filter((finding) => finding.severity === 'error').length;
    const warnings = failures.length - errors;
    const parts: string[] = [];
    if (errors > 0) parts.push(`${errors} blocking issue${errors === 1 ? '' : 's'}`);
    if (warnings > 0) parts.push(`${warnings} warning${warnings === 1 ? '' : 's'}`);
    return `${parts.join(' and ')} to resolve.`;
  }

  get serpUrl(): string {
    const base = String(this.project?.site.baseUrl ?? 'https://example.com').replace(/\/$/, '');
    const slug = this.draftSlug || (this.project?.title ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    return `${base}/${slug}`;
  }

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
    const metadata = project.metadata ?? {};
    this.draftSlug = strOf(metadata['slug']);
    this.draftCanonicalUrl = strOf(metadata['canonicalUrl']);
    this.draftPrimaryIntent = strOf(metadata['primaryIntent']);
    this.draftContentType = strOf(metadata['contentType']);
    this.draftTargetQuery = strOf(metadata['targetQuery']);
    this.draftPrimaryKeyword = strOf(metadata['primaryKeyword']);
    this.draftTopicCluster = strOf(metadata['topicCluster']);
    this.draftSecondaryKeywords = Array.isArray(metadata['secondaryKeywords']) ? (metadata['secondaryKeywords'] as unknown[]).filter((entry): entry is string => typeof entry === 'string').join(', ') : strOf(metadata['secondaryKeywords']);
    this.bodyDirty = false;
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
          this.saveStrategyMetadata();
        },
        error: (err) => {
          this.saving = false;
          this.error = this.describe(err);
        },
      });
  }

  private saveStrategyMetadata(): void {
    const current = this.project?.metadata ?? {};
    const merged = {
      ...current,
      slug: this.draftSlug || undefined,
      canonicalUrl: this.draftCanonicalUrl || undefined,
      primaryIntent: this.draftPrimaryIntent || undefined,
      contentType: this.draftContentType || undefined,
      targetQuery: this.draftTargetQuery || undefined,
      primaryKeyword: this.draftPrimaryKeyword || undefined,
      topicCluster: this.draftTopicCluster || undefined,
      secondaryKeywords: this.draftSecondaryKeywords.split(',').map((keyword) => keyword.trim()).filter(Boolean),
    };
    this.api.updateProject(this.projectId, { metadata: merged }).subscribe({
      next: () => {
        this.saving = false;
        this.bodyDirty = false;
        this.notice = 'Saved. Quality checks refreshed.';
        this.load();
      },
      error: (err) => {
        this.saving = false;
        this.error = this.describe(err);
      },
    });
  }

  onAutosave(): void {
    if (!this.bodyDirty) return;
    this.bodyDirty = false;
    const version = this.project?.latestVersion;
    if (!version) return;
    this.api.updateVersionContent(version.id, {
      title: this.draftTitle,
      excerpt: this.draftExcerpt,
      bodyHtml: this.draftBody,
      seoTitle: this.draftSeoTitle,
      seoDescription: this.draftSeoDescription,
    }).subscribe({
      next: () => {
        this.notice = 'Autosaved.';
      },
      error: () => {
        this.bodyDirty = true;
      },
    });
  }

  aiImprove(kind: 'seoTitle' | 'metaDescription' | 'outline' | 'introduction' | 'conclusion' | 'faqs' | 'readability' | 'internalLinks'): void {
    const prompts: Record<string, string> = {
      seoTitle: 'Improve the SEO title: make it compelling, under 70 characters, and include the primary keyword naturally.',
      metaDescription: 'Improve the meta description: 110-165 characters, include the primary keyword and a clear value proposition.',
      outline: 'Suggest a stronger H2/H3 outline that covers the target query and search intent, keeping the current angle.',
      introduction: 'Improve the introduction: hook the reader, state the value and include the primary keyword naturally. Do not rewrite the rest of the article.',
      conclusion: 'Improve the conclusion: summarize the main points and add a clear next step. Do not rewrite the rest of the article.',
      faqs: 'Add a FAQ section with 4-5 relevant questions and concise answers, using only information present in the article.',
      readability: 'Improve readability: shorten long paragraphs, add a list or table where useful, and avoid filler. Keep the meaning and structure.',
      internalLinks: 'Add the suggested internal links from the SEO workspace with natural anchors, only where they fit contextually.',
    };
    this.feedback = prompts[kind];
    this.revise();
  }

  loadLinkSuggestions(): void {
    if (!this.project) return;
    this.linksLoading = true;
    this.linksChecked = true;
    this.api.suggestInternalLinks(this.project.site.id, {
      keyword: this.draftPrimaryKeyword || undefined,
      topic: this.draftTopicCluster || undefined,
      q: this.draftTargetQuery || undefined,
      limit: 6,
    }).subscribe({
      next: (response) => {
        this.linksLoading = false;
        this.linkSuggestions = response.items;
      },
      error: () => {
        this.linksLoading = false;
        this.linkSuggestions = [];
      },
    });
  }

  insertLinkSuggestion(suggestion: InternalLinkSuggestion): void {
    const linkHtml = `<p><a href="${suggestion.url}">${suggestion.anchor}</a></p>`;
    this.draftBody = this.draftBody ? `${this.draftBody.trim()}\n${linkHtml}` : linkHtml;
    this.bodyDirty = true;
    this.notice = 'Link inserted. Remember to save.';
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
      case 'draft_synced':
        return 'au-badge--success';
      case 'failed':
      case 'canceled':
        return 'au-badge--danger';
      case 'scheduled':
      case 'queued':
      case 'publishing':
      case 'processing':
        return 'au-badge--warning';
      default:
        return 'au-badge--neutral';
    }
  }

  versionStatusTone(status: string): 'success' | 'danger' | 'warning' | 'brand' | 'neutral' {
    switch (status) {
      case 'approved':
      case 'published':
        return 'success';
      case 'qa_failed':
      case 'archived':
        return 'danger';
      case 'in_review':
      case 'qa_passed':
        return 'warning';
      case 'ai_generated':
        return 'brand';
      default:
        return 'neutral';
    }
  }

  jobTone(status: string): 'success' | 'danger' | 'warning' | 'neutral' {
    switch (status) {
      case 'published':
        return 'success';
      case 'failed':
      case 'canceled':
        return 'danger';
      case 'queued':
      case 'processing':
        return 'warning';
      default:
        return 'neutral';
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
    void this.confirmCancelPublication(publication);
  }

  private async confirmCancelPublication(publication: ProjectPublication): Promise<void> {
    const confirmed = await this.confirm.confirm({
      title: `Cancel this ${publication.channel} publication?`,
      message: 'The scheduled publication is removed and will not run.',
      confirmLabel: 'Cancel publication',
      danger: true,
    });
    if (!confirmed) {
      return;
    }
    this.api.cancelPublication(publication.id).subscribe({
      next: () => {
        this.toast.success('Publication canceled.');
        this.load();
      },
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
