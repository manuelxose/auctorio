import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subscription, timer } from 'rxjs';
import { StudioApiService } from '../services/studio-api.service';
import { AppContextService } from '../services/app-context.service';
import { ConfirmService } from '../services/confirm.service';
import { ToastService } from '../services/toast.service';
import { AppIconComponent } from '../components/ui/app-icon.component';
import { AppEmptyStateComponent } from '../components/ui/app-empty-state.component';
import type { AutomationHealth, AutomationPolicy, AutomationRecoveryReport, AutomationStatus, PublishingAccount, PublishingWindow, StudioSite } from '../models/studio.models';

@Component({
  selector: 'app-automation-page',
  standalone: true,
  imports: [CommonModule, FormsModule, AppIconComponent, AppEmptyStateComponent],
  template: `
    <section class="au-page">
      <header class="au-page__header">
        <div>
          <p class="au-page__eyebrow">Autonomous operations</p>
          <h1 class="au-page__title">Automation</h1>
          <p class="au-page__subtitle">Configure autonomous discovery, generation and multi-channel publishing.</p>
        </div>
        <div class="au-page__actions">
          <button
            class="au-btn"
            [class.au-btn--danger]="policy?.state === 'active'"
            [class.au-btn--primary]="policy?.state !== 'active'"
            type="button"
            (click)="togglePause()"
            [disabled]="!policy"
          >
            <app-icon [name]="policy?.state === 'paused' ? 'play' : 'pause'"></app-icon>
            {{ policy?.state === 'paused' ? 'Resume automation' : 'Pause automation' }}
          </button>
        </div>
      </header>

      <div class="au-status" *ngIf="status">
        <span class="au-badge" [class.au-badge--success]="status.enabled" [class.au-badge--neutral]="!status.enabled">
          {{ status.enabled ? 'Enabled' : 'Disabled' }}
        </span>
        <span class="au-badge" [class.au-badge--danger]="status.state === 'paused'" [class.au-badge--success]="status.state === 'active'" [class.au-badge--warning]="status.state !== 'paused' && status.state !== 'active'">
          {{ status.state }}
        </span>
        <span class="au-status__reason" *ngIf="status.pausedReason">{{ status.pausedReason }}</span>
        <span class="au-status__counts">
          Today: {{ status.today.articlesPlanned }}/{{ status.limits.articlesPerDay }} articles ·
          {{ status.today.xPlanned }} X · {{ status.today.instagramPlanned }} Instagram
        </span>
      </div>

      <div class="au-banner au-banner--warning" *ngFor="let warning of status?.warnings ?? []">
        <app-icon name="warning"></app-icon>
        <span class="au-banner__text">{{ warning }}</span>
      </div>

      <section class="au-panel au-panel--padded au-mb-3" *ngIf="policy">
        <h2 class="au-panel__title">General</h2>
        <p class="au-panel__subtitle au-mb-3">Where the policy applies and its basic settings.</p>
        <div class="au-field-grid">
          <label class="au-field">
            <span class="au-field__label">Site</span>
            <select class="au-select" [(ngModel)]="selectedSiteId" (ngModelChange)="load()">
              <option [ngValue]="null">All sites</option>
              <option *ngFor="let site of sites" [ngValue]="site.id">{{ site.name }}</option>
            </select>
          </label>
          <label class="au-field">
            <span class="au-field__label">Timezone</span>
            <input class="au-input" type="text" [(ngModel)]="policy.timezone" placeholder="Europe/Madrid" />
          </label>
          <label class="au-checkbox au-mt-4">
            <input type="checkbox" [(ngModel)]="policy.enabled" />
            Automation enabled
          </label>
        </div>
      </section>

      <section class="au-panel au-panel--padded au-mb-3" *ngIf="policy">
        <h2 class="au-panel__title">Automation mode</h2>
        <p class="au-panel__subtitle au-mb-3">One first-class mode decides the whole pipeline. Modes are atomic: contradictory flag combinations are never saved.</p>
        <div class="au-automation-modes" role="radiogroup" aria-label="Automation mode">
          <button class="au-mode" [class.is-active]="policy.mode === 'manual' || !policy.mode" role="radio" [attr.aria-checked]="policy.mode === 'manual' || !policy.mode" type="button" (click)="setMode('manual')">
            <strong>Manual</strong>
            <span>No autonomous generation, approval or publication. You do everything.</span>
          </button>
          <button class="au-mode" [class.is-active]="policy.mode === 'assisted'" role="radio" [attr.aria-checked]="policy.mode === 'assisted'" type="button" (click)="setMode('assisted')">
            <strong>Assisted</strong>
            <span>AI generates, repairs and reruns QA. You approve before anything publishes.</span>
          </button>
          <button class="au-mode au-mode--warning" [class.is-active]="policy.mode === 'autopilot'" role="radio" [attr.aria-checked]="policy.mode === 'autopilot'" type="button" (click)="setMode('autopilot')">
            <strong>Autopilot</strong>
            <span>Full zero-touch pipeline with a strict autonomous quality gate.</span>
          </button>
        </div>

        <div class="au-banner au-banner--success" *ngIf="policy.mode === 'autopilot'">
          <div class="au-banner__text">
            <strong>Autopilot will:</strong>
            <ul class="au-checklist">
              <li>✓ generate content</li>
              <li>✓ run strict QA</li>
              <li>✓ repair failures automatically (bounded retries)</li>
              <li>✓ approve only after the strict autonomous QA gate passes</li>
              <li>✓ schedule publications</li>
              <li>✓ publish them automatically</li>
              <li>✓ verify publication</li>
              <li>✓ stop and notify you if recovery fails</li>
            </ul>
          </div>
        </div>

        <div class="au-banner au-banner--warning" *ngIf="policy.mode === 'assisted'">
          <app-icon name="warning"></app-icon>
          <span class="au-banner__text">Assisted mode generates and schedules automatically but never approves or publishes without you.</span>
        </div>

        <button class="au-btn au-btn--ghost au-btn--sm au-mt-2" type="button" (click)="advancedOpen = !advancedOpen" [attr.aria-expanded]="advancedOpen">
          <app-icon [name]="advancedOpen ? 'chevron-up' : 'chevron-down'"></app-icon>
          {{ advancedOpen ? 'Hide advanced controls' : 'Advanced controls' }}
        </button>
      </section>

      <section class="au-panel au-panel--padded au-mb-3" *ngIf="policy && advancedOpen">
        <h2 class="au-panel__title">Advanced controls</h2>
        <p class="au-panel__subtitle au-mb-3">Limits, windows and quality policy. Autopilot keeps every safeguard below active.</p>
        <h3 class="au-panel__title au-mt-4 au-mb-2">Daily volume</h3>
        <div class="au-field-grid">
          <label class="au-field"><span class="au-field__label">Articles / day</span><input class="au-input" type="number" min="0" max="20" [(ngModel)]="policy.articlesPerDay" /></label>
          <label class="au-field"><span class="au-field__label">Max articles / day (safety)</span><input class="au-input" type="number" min="0" max="20" [(ngModel)]="policy.maxArticlesPerDay" /></label>
          <label class="au-field"><span class="au-field__label">Min minutes between articles</span><input class="au-input" type="number" min="15" [(ngModel)]="policy.minimumMinutesBetweenArticles" /></label>
          <label class="au-field"><span class="au-field__label">X posts / day</span><input class="au-input" type="number" min="0" max="50" [(ngModel)]="policy.xPostsPerDay" /></label>
          <label class="au-field"><span class="au-field__label">Instagram posts / day</span><input class="au-input" type="number" min="0" max="20" [(ngModel)]="policy.instagramPostsPerDay" /></label>
          <label class="au-field"><span class="au-field__label">Max daily social posts (safety)</span><input class="au-input" type="number" min="0" [(ngModel)]="policy.maximumDailySocial" /></label>
          <label class="au-field"><span class="au-field__label">X timing after article (min)</span><input class="au-input" type="number" min="0" [(ngModel)]="policy.socialTimingMinutesX" /></label>
          <label class="au-field"><span class="au-field__label">Instagram timing after article (min)</span><input class="au-input" type="number" min="0" [(ngModel)]="policy.socialTimingMinutesInstagram" /></label>
        </div>

        <h3 class="au-panel__title au-mt-4 au-mb-2">Pipeline flags</h3>
        <div class="au-field-grid">
          <label class="au-checkbox"><input type="checkbox" [(ngModel)]="policy.autoGenerate" /> Auto-generate articles</label>
          <label class="au-checkbox"><input type="checkbox" [(ngModel)]="policy.autoApprove" /> Auto-approve when QA passes</label>
          <label class="au-checkbox"><input type="checkbox" [(ngModel)]="policy.autoSchedule" /> Auto-schedule</label>
          <label class="au-checkbox"><input type="checkbox" [(ngModel)]="policy.autoPublish" /> Auto-publish when due</label>
          <label class="au-checkbox"><input type="checkbox" [(ngModel)]="policy.imageRequired" /> Require image</label>
          <label class="au-checkbox"><input type="checkbox" [(ngModel)]="policy.socialRequired" /> Require social derivatives</label>
        </div>

        <h3 class="au-panel__title au-mt-4 au-mb-2">Quality & self-healing</h3>
        <div class="au-field-grid">
          <label class="au-checkbox"><input type="checkbox" [(ngModel)]="policy.autoRepair" /> Auto-repair QA failures (targeted repair)</label>
          <label class="au-field"><span class="au-field__label">Max repair attempts</span><input class="au-input" type="number" min="0" max="10" [(ngModel)]="policy.maxRepairAttempts" /></label>
          <label class="au-field"><span class="au-field__label">Circuit breaker threshold (consecutive failures)</span><input class="au-input" type="number" min="1" max="10" [(ngModel)]="policy.consecutivePublishFailures" /></label>
        </div>
        <label class="au-field au-mt-2">
          <span class="au-field__label">Autonomous QA thresholds (JSON)</span>
          <textarea class="au-input" rows="7" [(ngModel)]="qaThresholdsText" placeholder='{ "overallQualityScore": 90, "evidenceScore": 85 }'></textarea>
        </label>
        <p class="au-hint">Defaults: overall/structural/editorial/SEO ≥ 90, evidence ≥ 85, zero blocking errors, zero unresolved high-priority warnings. High-value commercial content can raise them.</p>

        <h3 class="au-panel__title au-mt-4 au-mb-2">Candidate selection</h3>
        <div class="au-field-grid">
          <label class="au-field"><span class="au-field__label">Minimum story score</span><input class="au-input" type="number" min="0" max="1" step="0.05" [(ngModel)]="policy.minimumStoryScore" /></label>
          <label class="au-field"><span class="au-field__label">Categories (include, comma separated)</span><input class="au-input" type="text" [ngModel]="categoriesText" (ngModelChange)="categoriesText = $event" /></label>
          <label class="au-field"><span class="au-field__label">Excluded categories</span><input class="au-input" type="text" [ngModel]="excludedCategoriesText" (ngModelChange)="excludedCategoriesText = $event" /></label>
          <label class="au-field"><span class="au-field__label">Priority topics (comma separated)</span><input class="au-input" type="text" [ngModel]="priorityTopicsText" (ngModelChange)="priorityTopicsText = $event" /></label>
        </div>

        <h3 class="au-panel__title au-mt-4 au-mb-2">Publishing windows</h3>
        <p class="au-hint au-mb-2">Each channel publishes inside its window on the configured days (0=Sun … 6=Sat).</p>
        <div class="au-window-row" *ngFor="let window of policy.publishingWindows ?? []; let i = index">
          <select class="au-select au-filter-select" [(ngModel)]="window.channel" aria-label="Window channel">
            <option value="website">website</option>
            <option value="x">x</option>
            <option value="instagram">instagram</option>
          </select>
          <input class="au-input" style="max-width: 90px" type="text" [(ngModel)]="window.from" placeholder="08:00" aria-label="From" />
          <span class="au-muted">→</span>
          <input class="au-input" style="max-width: 90px" type="text" [(ngModel)]="window.to" placeholder="20:00" aria-label="To" />
          <label class="au-window-days" title="Toggle active days">
            <input
              type="checkbox"
              *ngFor="let day of [0,1,2,3,4,5,6]"
              [checked]="window.days.includes(day)"
              (change)="toggleDay(window, day)"
              [attr.aria-label]="'Day ' + day"
            />
            <span class="au-window-days__labels">Sun-Sat</span>
          </label>
          <button class="au-btn au-btn--danger-ghost au-btn--sm" type="button" (click)="removeWindow(i)">Remove</button>
        </div>
        <button class="au-btn au-btn--ghost au-btn--sm" type="button" (click)="addWindow()">
          <app-icon name="plus"></app-icon>
          Add window
        </button>

        <h3 class="au-panel__title au-mt-4 au-mb-2">Safety limits</h3>
        <div class="au-field-grid">
          <label class="au-field"><span class="au-field__label">Max pending queue</span><input class="au-input" type="number" min="1" [(ngModel)]="policy.maximumQueueSize" /></label>
          <label class="au-field"><span class="au-field__label">Articles / hour</span><input class="au-input" type="number" min="1" [(ngModel)]="policy.articlesPerHour" /></label>
          <label class="au-field"><span class="au-field__label">Social posts / hour</span><input class="au-input" type="number" min="1" [(ngModel)]="policy.socialPostsPerHour" /></label>
        </div>

        <div class="au-form__actions">
          <button class="au-btn au-btn--primary" type="button" (click)="save()" [disabled]="saving">{{ saving ? 'Saving…' : 'Save automation policy' }}</button>
        </div>
      </section>

      <section class="au-panel au-panel--padded au-mb-3" *ngIf="nextSlots.length > 0">
        <h2 class="au-panel__title">Next planned slots</h2>
        <p class="au-panel__subtitle au-mb-2">Computed from the current policy and limits.</p>
        <div class="au-slots">
          <span class="au-badge au-badge--neutral" *ngFor="let slot of nextSlots">{{ slot.channel }} · {{ dateLabel(slot.at) }}</span>
        </div>
      </section>

      <section class="au-panel au-panel--padded au-mb-3">
        <h2 class="au-panel__title">Workers & operational health</h2>
        <p class="au-panel__subtitle au-mb-2">
          <span class="au-badge" [class.au-badge--success]="health && health.redisConfigured && !health.degraded" [class.au-badge--danger]="health && (!health.redisConfigured || health.degraded)">
            {{ health ? (health.degraded ? 'Degraded' : 'Healthy') : 'Loading…' }}
          </span>
          <span class="au-hint au-ml-1">Redis: {{ health ? (health.redisConfigured ? 'configured' : 'MISSING') : '…' }}</span>
        </p>
        <div class="au-table-wrap">
          <table class="au-table">
            <thead>
              <tr>
                <th>Worker</th>
                <th>Status</th>
                <th>Last heartbeat</th>
                <th>Current task</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let worker of health?.workers ?? []">
                <td>{{ worker.name }}</td>
                <td>
                  <span class="au-badge" [class.au-badge--success]="worker.status === 'running' && !worker.stale" [class.au-badge--danger]="worker.status !== 'running' || worker.stale">
                    {{ worker.status }}{{ worker.stale ? ' · stale' : '' }}
                  </span>
                </td>
                <td class="au-muted">{{ formatRelative(worker.lastBeatAt) }}</td>
                <td class="au-muted">{{ worker.currentTask ?? '—' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p class="au-hint au-mt-2">Worker heartbeats update continuously. A stale heartbeat or missing Redis triggers a prominent operational failure and degrades the health badge.</p>
      </section>

      <section class="au-panel au-panel--padded">
        <h2 class="au-panel__title">Recover stuck automatic content</h2>
        <p class="au-panel__subtitle au-mb-2">Automatically repair, approve and reschedule existing AUTOPILOT projects stuck in QA blocked, Ready for review or failed publication states. Manual projects are never touched.</p>
        <div class="au-form__actions">
          <button class="au-btn au-btn--secondary" type="button" (click)="runRecovery(true)" [disabled]="recovering">
            <app-icon name="eye"></app-icon>
            Dry-run
          </button>
          <button class="au-btn au-btn--primary" type="button" (click)="runRecovery(false)" [disabled]="recovering">
            <app-icon name="refresh"></app-icon>
            {{ recovering ? 'Recovering…' : 'Recover now' }}
          </button>
        </div>
        <div class="au-banner au-banner--info" *ngIf="recoveryReport">
          <span class="au-banner__text">
            {{ recoveryReport.dryRun ? 'Dry run:' : 'Recovery:' }}
            scanned {{ recoveryReport.scanned }} · eligible {{ recoveryReport.eligible }} · acted {{ recoveryReport.acted }}
            <span *ngIf="recoveryReport.items.length > 0">· last: {{ recoveryReport.items[0].projectId.slice(0, 8) }} → {{ recoveryReport.items[0].action }} ({{ recoveryReport.items[0].result }})</span>
          </span>
        </div>
      </section>

      <section class="au-panel au-panel--padded">
        <h2 class="au-panel__title">Social accounts</h2>
        <p class="au-panel__subtitle au-mb-2">Accounts used by automation for X and Instagram publishing.</p>
        <app-empty-state
          *ngIf="accounts.length === 0"
          icon="connections"
          title="No social accounts connected"
          text="Connect an X or Instagram account to enable social automation."
        ></app-empty-state>
        <div class="au-row" *ngFor="let account of accounts">
          <span class="au-platform-icon" style="width: 26px; height: 26px; flex-basis: 26px; font-size: 9px">{{ account.platform === 'x' ? 'X' : 'IG' }}</span>
          <span class="au-row__title">{{ account.displayName }}</span>
          <span class="au-badge au-badge--outline">{{ account.platform }}</span>
          <span class="au-badge" [class.au-badge--success]="account.status === 'active'" [class.au-badge--danger]="account.status === 'error'" [class.au-badge--warning]="account.status !== 'active' && account.status !== 'error'">{{ account.status }}</span>
          <span class="au-row__meta">credentials: {{ account.hasCredentials ? 'configured' : 'missing' }}</span>
          <button class="au-btn au-btn--ghost au-btn--sm" type="button" (click)="verify(account)">
            <app-icon name="circle-check"></app-icon>
            Verify
          </button>
        </div>
        <p class="au-hint au-mt-2">Credentials are environment-variable references kept server-side and never exposed to the browser.</p>
      </section>
    </section>
  `,
})
export class AutomationPageComponent implements OnInit, OnDestroy {
  private readonly api = inject(StudioApiService);
  private readonly appContext = inject(AppContextService);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);

  policy: AutomationPolicy | null = null;
  status: AutomationStatus | null = null;
  accounts: PublishingAccount[] = [];
  sites: StudioSite[] = [];
  selectedSiteId: string | null = null;
  categoriesText = '';
  excludedCategoriesText = '';
  priorityTopicsText = '';
  qaThresholdsText = '';
  advancedOpen = false;
  health: AutomationHealth | null = null;
  recovering = false;
  recoveryReport: AutomationRecoveryReport | null = null;
  saving = false;
  feedback = '';
  private refreshSubscription: Subscription | null = null;

  get nextSlots(): Array<{ channel: string; at: string }> {
    return this.status?.nextSlots ?? [];
  }

  ngOnInit(): void {
    this.sites = this.appContext.sites();
    this.load();
    this.refreshSubscription = timer(45_000, 45_000).subscribe(() => {
      if (!document.hidden) {
        this.loadStatus();
      }
    });
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
        this.qaThresholdsText = policy.autonomousQaThresholds
          ? JSON.stringify(policy.autonomousQaThresholds, null, 2)
          : '';
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
    this.loadHealth();
  }

  loadHealth(): void {
    this.api.getAutomationHealth().subscribe({
      next: (health) => {
        this.health = health;
      },
      error: () => undefined,
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

  setMode(mode: 'manual' | 'assisted' | 'autopilot'): void {
    if (!this.policy) return;
    this.policy.mode = mode;
    if (mode === 'manual') {
      this.policy.enabled = false;
      this.policy.autoGenerate = false;
      this.policy.autoApprove = false;
      this.policy.autoSchedule = false;
      this.policy.autoPublish = false;
      this.policy.autoRepair = false;
    } else if (mode === 'assisted') {
      this.policy.enabled = true;
      this.policy.autoGenerate = true;
      this.policy.autoApprove = false;
      this.policy.autoSchedule = true;
      this.policy.autoPublish = false;
      this.policy.autoRepair = true;
    } else {
      this.policy.enabled = true;
      this.policy.autoGenerate = true;
      this.policy.autoApprove = true;
      this.policy.autoSchedule = true;
      this.policy.autoPublish = true;
      this.policy.autoRepair = true;
    }
  }

  save(): void {
    if (!this.policy) {
      return;
    }
    this.saving = true;
    this.api
      .updateAutomationPolicy({        siteId: this.selectedSiteId ?? null,
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
        mode: this.policy.mode,
        autoRepair: this.policy.autoRepair,
        maxRepairAttempts: this.policy.maxRepairAttempts,
        autonomousQaThresholds: parseJsonField(this.qaThresholdsText),
        sourceRequirements: this.policy.sourceRequirements,
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
          this.toast.success('Automation policy saved.');
          this.loadStatus();
        },
        error: (error) => {
          this.saving = false;
          this.feedback = String(error?.error?.message ?? 'Failed to save policy.');
        },
      });
  }

  togglePause(): void {
    void this.confirmTogglePause();
  }

  private async confirmTogglePause(): Promise<void> {
    const target = this.policy?.state === 'paused' ? 'resume' : 'pause';
    if (target === 'pause') {
      const confirmed = await this.confirm.confirm({
        title: 'Pause automation?',
        message: 'No new automatic publications will be created or scheduled. Active jobs are not interrupted.',
        confirmLabel: 'Pause automation',
        danger: true,
      });
      if (!confirmed) {
        return;
      }
    }
    const request = target === 'pause'
      ? this.api.pauseAutomation('paused_manually', this.selectedSiteId ?? undefined)
      : this.api.resumeAutomation(this.selectedSiteId ?? undefined);
    request.subscribe({
      next: (policy) => {
        this.policy = policy;
        this.toast.success(target === 'pause' ? 'Automation paused.' : 'Automation resumed.');
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
        if (result.ok) {
          this.toast.success(result.message || 'Account verified.');
        } else {
          this.toast.error(result.message || 'Verification failed.');
        }
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

  formatRelative(value: string | null | undefined): string {
    if (!value) {
      return '—';
    }
    const minutes = Math.round((Date.now() - new Date(value).getTime()) / 60_000);
    if (minutes < 1) {
      return 'just now';
    }
    return minutes < 60 ? `${minutes} min` : `${Math.round(minutes / 60)} h`;
  }

  runRecovery(dryRun: boolean): void {
    this.recovering = true;
    this.api
      .recoverAutomation({ siteId: this.selectedSiteId, dryRun })
      .subscribe({
        next: (report) => {
          this.recovering = false;
          this.recoveryReport = report;
          if (dryRun) {
            this.toast.success(`Dry run complete: ${report.scanned} scanned, ${report.eligible} eligible.`);
          } else {
            this.toast.success(`Recovery finished: ${report.acted} actions applied.`);
          }
          this.load();
        },
        error: (error) => {
          this.recovering = false;
          this.feedback = String(error?.error?.message ?? 'Recovery failed.');
        },
      });
  }
}

function parseJsonField(text: string): Record<string, unknown> | null {
  const trimmed = text.trim();
  if (!trimmed) {
    return null;
  }
  try {
    const parsed = JSON.parse(trimmed);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}
