import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, OnDestroy, Output, PLATFORM_ID, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Subscription, timer } from 'rxjs';
import { AppIconComponent } from '../ui/app-icon.component';
import { IntelligenceApiService } from '../../services/intelligence-api.service';
import type { OnboardingRun, OnboardingStepId, OnboardingStepStatus } from '../../models/intelligence.models';

const STEP_LABELS: Record<OnboardingStepId, { title: string; text: string }> = {
  index: { title: 'Index the website', text: 'Sitemaps, page inventory and a read-only crawl.' },
  profile: { title: 'Build the site profile', text: 'Topics, clusters, language and audience from crawled pages.' },
  sources: { title: 'Find sources', text: 'Feeds and references that fit the site.' },
  competitors: { title: 'Map competitors', text: 'Sites covering the same topics.' },
  strategy: { title: 'Suggest an editorial strategy', text: 'Pillars, audience and formats for you to review. Nothing is approved for you.' },
  first_plan_offer: { title: 'Ready for the first plan', text: 'Nothing is generated or published until you ask.' },
};

/**
 * Live onboarding timeline for one site. Polls GET /v2/sites/:siteId/onboarding while a pass is
 * running; offers retry from the first failed/skipped step and the first-plan CTA when done.
 */
@Component({
  selector: 'app-onboarding-timeline',
  standalone: true,
  imports: [CommonModule, RouterLink, AppIconComponent],
  styles: [
    `
      .tl { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; }
      .tl__item { display: grid; grid-template-columns: 28px 1fr auto; gap: 12px; align-items: start; padding: 10px 0; border-bottom: 1px solid var(--au-border); }
      .tl__item:last-child { border-bottom: none; }
      .tl__dot { width: 24px; height: 24px; border-radius: 999px; display: grid; place-items: center; border: 1px solid var(--au-border); color: var(--au-text-muted, inherit); }
      .tl__dot--succeeded { background: var(--au-success-soft, transparent); color: var(--au-success, inherit); border-color: currentColor; }
      .tl__dot--failed { color: var(--au-danger, inherit); border-color: currentColor; }
      .tl__dot--running { color: var(--au-brand, inherit); border-color: currentColor; }
      .tl__title { font-weight: 600; margin: 0; }
      .tl__text { margin: 2px 0 0; font-size: 0.86rem; }
      .tl__error { margin: 4px 0 0; font-size: 0.86rem; color: var(--au-danger, inherit); }
      .tl__head { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-bottom: 10px; }
      .tl__actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 12px; }
      @media (prefers-reduced-motion: reduce) { .tl__spin { animation: none !important; } }
    `,
  ],
  template: `
    <section class="au-panel au-panel--padded" aria-live="polite">
      <div class="tl__head">
        <div>
          <h2 class="au-panel__title">Website onboarding</h2>
          <p class="au-muted" *ngIf="run">{{ run.completedSteps }} of {{ run.totalSteps }} steps · {{ statusLabel(run.status) }}</p>
        </div>
        <span class="au-badge" *ngIf="run" [class.au-badge--success]="run.status === 'succeeded'" [class.au-badge--danger]="run.status === 'failed'" [class.au-badge--info]="run.status === 'running'">{{ statusLabel(run.status) }}</span>
      </div>

      <div class="au-progress" *ngIf="run" role="progressbar" [attr.aria-valuenow]="progress" aria-valuemin="0" aria-valuemax="100" aria-label="Onboarding progress">
        <span class="au-progress__bar" [style.width.%]="progress"></span>
      </div>

      <p class="au-error" *ngIf="error">{{ error }}</p>

      <ol class="tl au-mt-2" *ngIf="run">
        <li class="tl__item" *ngFor="let step of run.steps">
          <span class="tl__dot" [ngClass]="'tl__dot--' + step.status" [attr.aria-label]="stepStatusLabel(step.status)">
            <app-icon [name]="stepIcon(step.status)" [class.tl__spin]="step.status === 'running'"></app-icon>
          </span>
          <div>
            <p class="tl__title">{{ label(step.id).title }}</p>
            <p class="tl__text au-muted">{{ step.summary || label(step.id).text }}</p>
            <p class="tl__error" *ngIf="step.error">{{ step.error }}</p>
          </div>
          <span class="au-badge" [class.au-badge--success]="step.status === 'succeeded'" [class.au-badge--danger]="step.status === 'failed'" [class.au-badge--info]="step.status === 'running'" [class.au-badge--neutral]="step.status === 'pending' || step.status === 'skipped'">{{ stepStatusLabel(step.status) }}</span>
        </li>
      </ol>

      <p class="au-muted" *ngIf="!run && !loading">No onboarding has run for this site yet.</p>

      <div class="tl__actions">
        <button class="au-btn au-btn--secondary au-btn--sm" type="button" *ngIf="run && run.status !== 'running' && run.retryFrom" [disabled]="busy" (click)="retry()">
          <app-icon name="refresh"></app-icon>
          Retry from "{{ label(run.retryFrom).title }}"
        </button>
        <button class="au-btn au-btn--secondary au-btn--sm" type="button" *ngIf="!run && !loading && allowStart" [disabled]="busy" (click)="start()">
          <app-icon name="play"></app-icon>
          Run onboarding
        </button>
        <a class="au-btn au-btn--primary au-btn--sm" *ngIf="planReady" routerLink="/studio/editorial-plan" [queryParams]="{ siteId: siteId }">
          <app-icon name="plan"></app-icon>
          Create the first editorial plan
        </a>
        <a class="au-btn au-btn--ghost au-btn--sm" *ngIf="showStrategyLink && run?.status !== 'running'" routerLink="/studio/site-intelligence" [queryParams]="{ siteId: siteId }">
          Review the suggested strategy
        </a>
      </div>
    </section>
  `,
})
export class OnboardingTimelineComponent implements OnChanges, OnDestroy {
  private readonly api = inject(IntelligenceApiService);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private poll: Subscription | null = null;

  @Input({ required: true }) siteId = '';
  /** Offer "Run onboarding" when the site has never been onboarded (sites connected before this feature). */
  @Input() allowStart = false;
  @Input() showStrategyLink = false;
  /** Emits the latest run whenever it changes state (e.g. so a page can refresh its data). */
  @Output() readonly runChange = new EventEmitter<OnboardingRun | null>();

  run: OnboardingRun | null = null;
  loading = true;
  busy = false;
  error = '';

  get progress(): number {
    return this.run && this.run.totalSteps > 0 ? Math.round((this.run.completedSteps / this.run.totalSteps) * 100) : 0;
  }

  get planReady(): boolean {
    return Boolean(this.run?.steps.some((step) => step.id === 'first_plan_offer' && step.status === 'succeeded'));
  }

  ngOnChanges(): void {
    this.run = null;
    this.loading = true;
    this.refresh();
  }

  ngOnDestroy(): void {
    this.poll?.unsubscribe();
  }

  label(id: OnboardingStepId) {
    return STEP_LABELS[id] ?? { title: id, text: '' };
  }

  statusLabel(status: OnboardingRun['status']): string {
    return status === 'running' ? 'In progress' : status === 'succeeded' ? 'Completed' : 'Needs attention';
  }

  stepStatusLabel(status: OnboardingStepStatus): string {
    return { pending: 'Pending', running: 'Running', succeeded: 'Done', failed: 'Failed', skipped: 'Not available' }[status];
  }

  stepIcon(status: OnboardingStepStatus): string {
    return { pending: 'clock', running: 'loader', succeeded: 'check', failed: 'warning', skipped: 'info' }[status];
  }

  refresh(): void {
    if (!this.siteId) return;
    this.api.getOnboarding(this.siteId).subscribe({
      next: (response) => {
        const changed = response.run?.status !== this.run?.status || response.run?.completedSteps !== this.run?.completedSteps;
        this.run = response.run;
        this.loading = false;
        this.error = '';
        if (changed) this.runChange.emit(this.run);
        this.schedule();
      },
      error: () => {
        this.loading = false;
        this.error = 'The onboarding status could not be loaded.';
        this.schedule();
      },
    });
  }

  retry(): void {
    this.busy = true;
    this.api.retryOnboarding(this.siteId).subscribe({
      next: (response) => {
        this.busy = false;
        this.run = response.run;
        this.refresh();
      },
      error: (err) => {
        this.busy = false;
        this.error = err?.error?.error?.message || 'The retry could not be started.';
      },
    });
  }

  start(): void {
    this.busy = true;
    this.api.startOnboarding(this.siteId).subscribe({
      next: (response) => {
        this.busy = false;
        this.run = response.run;
        this.refresh();
      },
      error: (err) => {
        this.busy = false;
        this.error = err?.error?.error?.message || 'Onboarding could not be started.';
      },
    });
  }

  private schedule(): void {
    this.poll?.unsubscribe();
    // Poll only while a pass runs (and after a load error, slower); never on the server render.
    if (!this.isBrowser) return;
    if (this.run?.status === 'running') this.poll = timer(2000).subscribe(() => this.refresh());
    else if (this.error) this.poll = timer(10000).subscribe(() => this.refresh());
  }
}
