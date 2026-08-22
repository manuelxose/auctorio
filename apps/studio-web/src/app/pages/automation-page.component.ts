import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subscription, timer } from 'rxjs';
import { StudioApiService } from '../services/studio-api.service';
import { AppContextService } from '../services/app-context.service';
import type { AutomationPolicy, AutomationStatus, PublishingAccount, PublishingWindow, StudioSite } from '../models/studio.models';

@Component({
  selector: 'app-automation-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <section class="au-page">
      <header class="au-page__header">
        <div>
          <h1 class="au-page__title">Automation</h1>
          <p class="au-page__subtitle">Configure autonomous discovery, generation and multi-channel publishing.</p>
        </div>
        <button
          class="au-button"
          [class.au-button--danger]="policy?.state === 'active'"
          [class.au-button--primary]="policy?.state !== 'active'"
          type="button"
          (click)="togglePause()"
          [disabled]="!policy"
        >
          {{ policy?.state === 'paused' ? '▶ Resume automation' : '⏸ Pause automation' }}
        </button>
      </header>

      <section class="au-status" *ngIf="status">
        <span class="au-tag" [class.au-tag--success]="status.enabled" [class.au-tag--muted]="!status.enabled">
          {{ status.enabled ? 'Enabled' : 'Disabled' }}
        </span>
        <span class="au-tag" [class.au-tag--danger]="status.state === 'paused'" [class.au-tag--success]="status.state === 'active'">
          {{ status.state }}
        </span>
        <span class="au-status__reason" *ngIf="status.pausedReason">{{ status.pausedReason }}</span>
        <span class="au-status__counts">
          Today: {{ status.today.articlesPlanned }}/{{ status.limits.articlesPerDay }} articles ·
          {{ status.today.xPlanned }} X · {{ status.today.instagramPlanned }} Instagram
        </span>
      </section>

      <div class="au-notice au-notice--warning" *ngFor="let warning of status?.warnings ?? []">{{ warning }}</div>

      <section class="au-surface au-surface--form" *ngIf="policy">
        <h3 class="au-form__title">General</h3>
        <div class="au-form-grid au-form-grid--3">
          <label class="au-field"><span>Site</span>
            <select class="au-input" [(ngModel)]="selectedSiteId" (ngModelChange)="load()">
              <option [ngValue]="null">All sites</option>
              <option *ngFor="let site of sites" [ngValue]="site.id">{{ site.name }}</option>
            </select>
          </label>
          <label class="au-field"><span>Timezone</span>
            <input class="au-input" type="text" [(ngModel)]="policy.timezone" placeholder="Europe/Madrid" />
          </label>
          <label class="au-check au-field">
            <span>Enabled</span>
            <input type="checkbox" [(ngModel)]="policy.enabled" />
          </label>
        </div>

        <h3 class="au-form__title au-form__title--spaced">Daily volume</h3>
        <div class="au-form-grid au-form-grid--3">
          <label class="au-field"><span>Articles / day</span>
            <input class="au-input" type="number" min="0" max="20" [(ngModel)]="policy.articlesPerDay" />
          </label>
          <label class="au-field"><span>Max articles / day (safety)</span>
            <input class="au-input" type="number" min="0" max="20" [(ngModel)]="policy.maxArticlesPerDay" />
          </label>
          <label class="au-field"><span>Min minutes between articles</span>
            <input class="au-input" type="number" min="15" [(ngModel)]="policy.minimumMinutesBetweenArticles" />
          </label>
          <label class="au-field"><span>X posts / day</span>
            <input class="au-input" type="number" min="0" max="50" [(ngModel)]="policy.xPostsPerDay" />
          </label>
          <label class="au-field"><span>Instagram posts / day</span>
            <input class="au-input" type="number" min="0" max="20" [(ngModel)]="policy.instagramPostsPerDay" />
          </label>
          <label class="au-field"><span>Max daily social posts (safety)</span>
            <input class="au-input" type="number" min="0" [(ngModel)]="policy.maximumDailySocial" />
          </label>
          <label class="au-field"><span>X timing after article (min)</span>
            <input class="au-input" type="number" min="0" [(ngModel)]="policy.socialTimingMinutesX" />
          </label>
          <label class="au-field"><span>Instagram timing after article (min)</span>
            <input class="au-input" type="number" min="0" [(ngModel)]="policy.socialTimingMinutesInstagram" />
          </label>
        </div>

        <h3 class="au-form__title au-form__title--spaced">Pipeline flags</h3>
        <div class="au-form-grid au-form-grid--3">
          <label class="au-check au-field"><input type="checkbox" [(ngModel)]="policy.autoGenerate" /> Auto-generate articles</label>
          <label class="au-check au-field"><input type="checkbox" [(ngModel)]="policy.autoApprove" /> Auto-approve when QA passes</label>
          <label class="au-check au-field"><input type="checkbox" [(ngModel)]="policy.autoSchedule" /> Auto-schedule</label>
          <label class="au-check au-field"><input type="checkbox" [(ngModel)]="policy.autoPublish" /> Auto-publish when due</label>
          <label class="au-check au-field"><input type="checkbox" [(ngModel)]="policy.imageRequired" /> Require image</label>
          <label class="au-check au-field"><input type="checkbox" [(ngModel)]="policy.socialRequired" /> Require social derivatives</label>
        </div>

        <h3 class="au-form__title au-form__title--spaced">Candidate selection</h3>
        <div class="au-form-grid au-form-grid--3">
          <label class="au-field"><span>Minimum story score</span>
            <input class="au-input" type="number" min="0" max="1" step="0.05" [(ngModel)]="policy.minimumStoryScore" />
          </label>
          <label class="au-field"><span>Categories (include, comma separated)</span>
            <input class="au-input" type="text" [ngModel]="categoriesText" (ngModelChange)="categoriesText = $event" />
          </label>
          <label class="au-field"><span>Excluded categories</span>
            <input class="au-input" type="text" [ngModel]="excludedCategoriesText" (ngModelChange)="excludedCategoriesText = $event" />
          </label>
          <label class="au-field au-field--wide"><span>Priority topics (comma separated)</span>
            <input class="au-input" type="text" [ngModel]="priorityTopicsText" (ngModelChange)="priorityTopicsText = $event" />
          </label>
        </div>

        <h3 class="au-form__title au-form__title--spaced">Publishing windows</h3>
        <p class="au-hint">Each channel publishes inside its window on the configured days (0=Sun … 6=Sat).</p>
        <div class="au-window-row" *ngFor="let window of policy.publishingWindows ?? []; let i = index">
          <select class="au-input au-input--inline" [(ngModel)]="window.channel">
            <option value="website">website</option>
            <option value="x">x</option>
            <option value="instagram">instagram</option>
          </select>
          <input class="au-input au-input--inline" type="text" [(ngModel)]="window.from" placeholder="08:00" />
          <span>→</span>
          <input class="au-input au-input--inline" type="text" [(ngModel)]="window.to" placeholder="20:00" />
          <label class="au-window-days">
            <input
              type="checkbox"
              *ngFor="let day of [0,1,2,3,4,5,6]"
              [checked]="window.days.includes(day)"
              (change)="toggleDay(window, day)"
            />
            <span class="au-window-days__labels">Sun-Sat</span>
          </label>
          <button class="au-button au-button--ghost au-button--xs au-button--danger" type="button" (click)="removeWindow(i)">Remove</button>
        </div>
        <button class="au-button au-button--ghost au-button--sm" type="button" (click)="addWindow()">+ Add window</button>

        <h3 class="au-form__title au-form__title--spaced">Safety limits</h3>
        <div class="au-form-grid au-form-grid--3">
          <label class="au-field"><span>Max pending queue</span>
            <input class="au-input" type="number" min="1" [(ngModel)]="policy.maximumQueueSize" />
          </label>
          <label class="au-field"><span>Articles / hour</span>
            <input class="au-input" type="number" min="1" [(ngModel)]="policy.articlesPerHour" />
          </label>
          <label class="au-field"><span>Social posts / hour</span>
            <input class="au-input" type="number" min="1" [(ngModel)]="policy.socialPostsPerHour" />
          </label>
        </div>

        <div class="au-form-actions">
          <button class="au-button au-button--primary" type="button" (click)="save()" [disabled]="saving">{{ saving ? 'Saving…' : 'Save automation policy' }}</button>
        </div>
      </section>

      <section class="au-surface au-surface--form" *ngIf="nextSlots.length > 0">
        <h3 class="au-form__title">Next planned slots</h3>
        <div class="au-slots">
          <span class="au-tag" *ngFor="let slot of nextSlots">{{ slot.channel }} · {{ dateLabel(slot.at) }}</span>
        </div>
      </section>

      <section class="au-surface au-surface--form">
        <h3 class="au-form__title">Social accounts</h3>
        <div class="au-empty" *ngIf="accounts.length === 0">No social accounts connected.</div>
        <div class="au-row" *ngFor="let account of accounts">
          <span class="au-row__title">{{ account.displayName }}</span>
          <span class="au-tag">{{ account.platform }}</span>
          <span class="au-tag" [class.au-tag--success]="account.status === 'active'" [class.au-tag--danger]="account.status === 'error'">{{ account.status }}</span>
          <span class="au-row__meta">credentials: {{ account.hasCredentials ? 'configured' : 'missing' }}</span>
          <button class="au-button au-button--ghost au-button--xs" type="button" (click)="verify(account)">Verify</button>
        </div>
        <p class="au-hint">Credentials are environment-variable references kept server-side and never exposed to the browser.</p>
      </section>

      <div class="au-notice" *ngIf="feedback">{{ feedback }}</div>
    </section>
  `,
  styles: [
    `
      .au-status { display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap; padding: 0.7rem 0.9rem; background: var(--au-surface, #fff); border: 1px solid var(--au-border, #e5e7eb); border-radius: 8px; margin-bottom: 1rem; }
      .au-status__reason { font-size: 0.85rem; color: var(--au-danger, #dc2626); }
      .au-status__counts { margin-left: auto; font-size: 0.85rem; color: var(--au-muted, #6b7280); }
      .au-notice { padding: 0.6rem 0.9rem; border-radius: 8px; background: var(--au-surface-subtle, #f9fafb); font-size: 0.85rem; margin-bottom: 0.8rem; }
      .au-notice--warning { background: #fffbeb; color: #92400e; }
      .au-surface--form { padding: 1rem 1.25rem; margin-bottom: 1rem; }
      .au-form__title { margin: 0 0 0.9rem; }
      .au-form__title--spaced { margin-top: 1.4rem; border-top: 1px solid var(--au-border-subtle, #f3f4f6); padding-top: 1rem; }
      .au-form-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 0.8rem; }
      .au-form-grid--3 { grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); }
      .au-field { display: flex; flex-direction: column; gap: 0.3rem; font-size: 0.8rem; color: var(--au-muted, #6b7280); }
      .au-field--wide { grid-column: span 2; }
      .au-check { flex-direction: row; align-items: center; }
      .au-hint { color: var(--au-muted, #6b7280); font-size: 0.8rem; }
      .au-form-actions { display: flex; gap: 0.5rem; margin-top: 1rem; justify-content: flex-end; }
      .au-window-row { display: flex; gap: 0.5rem; align-items: center; margin-bottom: 0.5rem; flex-wrap: wrap; }
      .au-window-days { display: inline-flex; gap: 4px; align-items: center; }
      .au-window-days__labels { font-size: 0.7rem; color: var(--au-muted, #6b7280); }
      .au-button--xs { padding: 0.2rem 0.5rem; font-size: 0.75rem; }
      .au-button--sm { padding: 0.3rem 0.7rem; font-size: 0.8rem; }
      .au-button--danger { color: var(--au-danger, #dc2626); }
      .au-slots { display: flex; gap: 0.4rem; flex-wrap: wrap; }
      .au-row { display: flex; align-items: center; gap: 0.6rem; padding: 0.6rem 0.2rem; border-bottom: 1px solid var(--au-border-subtle, #f3f4f6); }
      .au-row__title { font-weight: 600; min-width: 160px; }
      .au-row__meta { font-size: 0.78rem; color: var(--au-muted, #6b7280); }
    `,
  ],
})
export class AutomationPageComponent implements OnInit, OnDestroy {
  private readonly api = inject(StudioApiService);
  private readonly appContext = inject(AppContextService);

  policy: AutomationPolicy | null = null;
  status: AutomationStatus | null = null;
  accounts: PublishingAccount[] = [];
  sites: StudioSite[] = [];
  selectedSiteId: string | null = null;
  categoriesText = '';
  excludedCategoriesText = '';
  priorityTopicsText = '';
  saving = false;
  feedback = '';
  private refreshSubscription: Subscription | null = null;

  get nextSlots(): Array<{ channel: string; at: string }> {
    return this.status?.nextSlots ?? [];
  }

  ngOnInit(): void {
    this.sites = this.appContext.sites();
    this.load();
    this.refreshSubscription = timer(45_000, 45_000).subscribe(() => this.loadStatus());
  }

  ngOnDestroy(): void {
    this.refreshSubscription?.unsubscribe();
  }

  load(): void {
    this.api.getAutomationPolicy(this.selectedSiteId ?? undefined).subscribe({
      next: (policy) => {
        this.policy = policy;
        this.categoriesText = (policy.categories ?? []).join(', ');
        this.excludedCategoriesText = (policy.excludedCategories ?? []).join(', ');
        this.priorityTopicsText = (policy.priorityTopics ?? []).join(', ');
        this.loadStatus();
      },
      error: () => {
        this.feedback = 'Failed to load automation policy.';
      },
    });
    this.api.listPublishingAccounts().subscribe({
      next: (response) => {
        this.accounts = response.items.filter((account) => account.platform !== 'website');
      },
    });
  }

  loadStatus(): void {
    this.api.getAutomationStatus(this.selectedSiteId ?? undefined).subscribe({
      next: (status) => {
        this.status = status;
      },
      error: () => undefined,
    });
  }

  save(): void {
    if (!this.policy) {
      return;
    }
    this.saving = true;
    this.api
      .updateAutomationPolicy({
        siteId: this.selectedSiteId ?? null,
        enabled: this.policy.enabled,
        timezone: this.policy.timezone,
        articlesPerDay: this.policy.articlesPerDay,
        maxArticlesPerDay: this.policy.maxArticlesPerDay,
        xPostsPerDay: this.policy.xPostsPerDay,
        instagramPostsPerDay: this.policy.instagramPostsPerDay,
        minimumMinutesBetweenArticles: this.policy.minimumMinutesBetweenArticles,
        autoGenerate: this.policy.autoGenerate,
        autoApprove: this.policy.autoApprove,
        autoSchedule: this.policy.autoSchedule,
        autoPublish: this.policy.autoPublish,
        minimumStoryScore: this.policy.minimumStoryScore,
        categories: this.categoriesText.split(',').map((item) => item.trim()).filter(Boolean),
        excludedCategories: this.excludedCategoriesText.split(',').map((item) => item.trim()).filter(Boolean),
        priorityTopics: this.priorityTopicsText.split(',').map((item) => item.trim()).filter(Boolean),
        imageRequired: this.policy.imageRequired,
        socialRequired: this.policy.socialRequired,
        maximumQueueSize: this.policy.maximumQueueSize,
        articlesPerHour: this.policy.articlesPerHour,
        socialPostsPerHour: this.policy.socialPostsPerHour,
        maximumDailySocial: this.policy.maximumDailySocial,
        socialTimingMinutesX: this.policy.socialTimingMinutesX,
        socialTimingMinutesInstagram: this.policy.socialTimingMinutesInstagram,
        publishingWindows: this.policy.publishingWindows ?? [],
      })
      .subscribe({
        next: () => {
          this.saving = false;
          this.feedback = 'Automation policy saved.';
          this.loadStatus();
        },
        error: (error) => {
          this.saving = false;
          this.feedback = String(error?.error?.message ?? 'Failed to save policy.');
        },
      });
  }

  togglePause(): void {
    const target = this.policy?.state === 'paused' ? 'resume' : 'pause';
    if (target === 'pause' && !window.confirm('Pause automation?\n\nNo new automatic publications will be created or scheduled. Active jobs are not interrupted.')) {
      return;
    }
    const request = target === 'pause'
      ? this.api.pauseAutomation('paused_manually', this.selectedSiteId ?? undefined)
      : this.api.resumeAutomation(this.selectedSiteId ?? undefined);
    request.subscribe({
      next: (policy) => {
        this.policy = policy;
        this.feedback = target === 'pause' ? 'Automation paused.' : 'Automation resumed.';
        this.loadStatus();
      },
      error: (error) => {
        this.feedback = String(error?.error?.message ?? 'Operation failed.');
      },
    });
  }

  addWindow(): void {
    this.policy?.publishingWindows?.push({ channel: 'website', days: [0, 1, 2, 3, 4, 5, 6], from: '08:00', to: '20:00' });
  }

  removeWindow(index: number): void {
    this.policy?.publishingWindows?.splice(index, 1);
  }

  toggleDay(window: PublishingWindow, day: number): void {
    if (window.days.includes(day)) {
      window.days = window.days.filter((entry) => entry !== day);
    } else {
      window.days = [...window.days, day].sort();
    }
  }

  verify(account: PublishingAccount): void {
    this.api.verifyPublishingAccount(account.id).subscribe({
      next: (result) => {
        this.feedback = result.ok ? `✓ ${result.message}` : `✗ ${result.message}`;
        this.load();
      },
      error: (error) => {
        this.feedback = String(error?.error?.message ?? 'Verification failed.');
      },
    });
  }

  dateLabel(value: string): string {
    return new Date(value).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
}
