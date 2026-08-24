import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Subscription, timer } from 'rxjs';
import { AppContextService } from '../services/app-context.service';
import { StudioApiService } from '../services/studio-api.service';
import { AppIconComponent } from '../components/ui/app-icon.component';
import { AppEmptyStateComponent } from '../components/ui/app-empty-state.component';
import type { StudioOverview, WorkerHealth } from '../models/studio.models';

@Component({
  selector: 'app-overview-page',
  standalone: true,
  imports: [CommonModule, RouterLink, AppIconComponent, AppEmptyStateComponent],
  template: `
    <section class="au-page">
      <header class="au-page__header">
        <div>
          <p class="au-page__eyebrow">Operating dashboard</p>
          <h1 class="au-page__title">Good {{ greeting }}, {{ firstName }}</h1>
          <p class="au-page__subtitle">What requires your attention across the editorial pipeline.</p>
        </div>
        <div class="au-page__actions">
          <a class="au-btn au-btn--primary" routerLink="/studio/content/new">
            <app-icon name="plus"></app-icon>
            New content
          </a>
        </div>
      </header>

      @if (!overview) {
        <div class="au-stat-row">
          <div class="au-stat"><span class="au-skeleton" style="height: 22px; width: 48px"></span><span class="au-skeleton au-mt-2" style="height: 12px; width: 120px"></span></div>
          <div class="au-stat"><span class="au-skeleton" style="height: 22px; width: 48px"></span><span class="au-skeleton au-mt-2" style="height: 12px; width: 120px"></span></div>
          <div class="au-stat"><span class="au-skeleton" style="height: 22px; width: 48px"></span><span class="au-skeleton au-mt-2" style="height: 12px; width: 120px"></span></div>
          <div class="au-stat"><span class="au-skeleton" style="height: 22px; width: 48px"></span><span class="au-skeleton au-mt-2" style="height: 12px; width: 120px"></span></div>
        </div>
      } @else {
        <div class="au-stat-row">
          <article class="au-stat">
            <span class="au-stat__value">{{ overview.today.articlesPlanned }}</span>
            <span class="au-stat__label">Articles planned today</span>
          </article>
          <article class="au-stat">
            <span class="au-stat__value">{{ overview.today.articlesPublished }}</span>
            <span class="au-stat__label">Published today</span>
          </article>
          <article class="au-stat">
            <span class="au-stat__value">{{ overview.today.xPosts }}</span>
            <span class="au-stat__label">X posts</span>
          </article>
          <article class="au-stat">
            <span class="au-stat__value">{{ overview.today.instagramPosts }}</span>
            <span class="au-stat__label">Instagram posts</span>
          </article>
        </div>
      }

      <!-- Attention required -->
      @if (overview && attentionItems().length > 0) {
        <section class="au-panel au-mb-3">
          <header class="au-panel__header">
            <div>
              <h2 class="au-panel__title">Needs attention</h2>
              <p class="au-panel__subtitle">Actionable issues in your pipeline.</p>
            </div>
            <span class="au-badge au-badge--danger">{{ attentionItems().length }}</span>
          </header>
          <a
            class="au-row"
            *ngFor="let item of attentionItems()"
            [routerLink]="item.link"
          >
            <app-icon [name]="item.icon" class="au-faint"></app-icon>
            <span class="au-row__title">{{ item.title }}</span>
            <span class="au-row__error au-truncate" style="max-width: 320px">{{ item.detail }}</span>
            <span class="au-btn au-btn--secondary au-btn--sm">{{ item.action }}</span>
          </a>
        </section>
      }

      @if (overview) {
        <div class="au-grid-dash">
          <section class="au-panel">
            <header class="au-panel__header">
              <h2 class="au-panel__title">Pipeline</h2>
              <a class="au-link" routerLink="/studio/content">Content</a>
            </header>
            <a class="au-row" routerLink="/studio/inbox">
              <span class="au-row__title">Inbox candidates</span>
              <span class="au-badge au-badge--warning">{{ overview.pipeline.inboxCandidates }}</span>
            </a>
            <a class="au-row" routerLink="/studio/content">
              <span class="au-row__title">Drafts</span>
              <span class="au-badge au-badge--neutral">{{ overview.pipeline.drafts }}</span>
            </a>
            <a class="au-row" routerLink="/studio/content">
              <span class="au-row__title">In review</span>
              <span class="au-badge au-badge--warning">{{ overview.pipeline.review }}</span>
            </a>
            <a class="au-row" routerLink="/studio/publications">
              <span class="au-row__title">Scheduled</span>
              <span class="au-badge au-badge--success">{{ overview.pipeline.scheduled }}</span>
            </a>
            <a class="au-row" routerLink="/studio/publications">
              <span class="au-row__title">Failed</span>
              <span class="au-badge" [class.au-badge--danger]="overview.pipeline.failed > 0" [class.au-badge--neutral]="overview.pipeline.failed === 0">
                {{ overview.pipeline.failed }}
              </span>
            </a>
          </section>

          <section class="au-panel">
            <header class="au-panel__header">
              <h2 class="au-panel__title">Upcoming publishing</h2>
              <a class="au-link" routerLink="/studio/calendar">Calendar</a>
            </header>
            <div class="au-empty" *ngIf="overview.recentPublications.length === 0 && overview.automation.nextSlots.length === 0">
              Nothing scheduled yet.
            </div>
            <a class="au-row" *ngFor="let slot of overview.automation.nextSlots.slice(0, 4)" routerLink="/studio/calendar">
              <app-icon name="clock" class="au-faint"></app-icon>
              <span class="au-row__title">{{ slot.channel }}</span>
              <span class="au-row__meta">{{ slotLabel(slot.at) }}</span>
            </a>
            <a class="au-row" *ngFor="let item of overview.recentPublications.slice(0, 4)" [routerLink]="['/studio/content', item.id]">
              <app-icon name="publications" class="au-faint"></app-icon>
              <span class="au-row__title au-truncate">{{ item.title }}</span>
              <span class="au-channel" [class]="'au-channel--' + item.channel">{{ item.channel }}</span>
              <span class="au-badge" [class.au-badge--success]="item.status === 'published'" [class.au-badge--danger]="item.status === 'failed'" [class.au-badge--warning]="item.status !== 'published' && item.status !== 'failed'">
                {{ item.status }}
              </span>
            </a>
          </section>

          <section class="au-panel">
            <header class="au-panel__header">
              <h2 class="au-panel__title">Automation</h2>
              <a class="au-link" routerLink="/studio/automation">Configure</a>
            </header>
            <div class="au-panel--padded au-stack">
              <span class="au-inline">
                <span class="au-badge" [class.au-badge--success]="overview.automation.enabled" [class.au-badge--neutral]="!overview.automation.enabled">
                  {{ overview.automation.enabled ? 'enabled' : 'disabled' }}
                </span>
                <span class="au-badge" [class.au-badge--danger]="overview.automation.state === 'paused'" [class.au-badge--success]="overview.automation.state === 'active'">
                  {{ overview.automation.state }}
                </span>
                <span class="au-muted au-fs-metadata" *ngIf="overview.automation.pausedReason">{{ overview.automation.pausedReason }}</span>
              </span>
              <div class="au-stack au-mt-1" *ngIf="overview.automation.warnings.length > 0">
                <p class="au-muted" *ngFor="let warning of overview.automation.warnings">
                  <app-icon name="warning" class="au-warning-color"></app-icon>
                  {{ warning }}
                </p>
              </div>
              <p class="au-muted" *ngIf="overview.automation.nextSlots.length === 0">No automatic slots planned.</p>
            </div>
          </section>

          <section class="au-panel">
            <header class="au-panel__header">
              <h2 class="au-panel__title">Sources</h2>
              <a class="au-link" routerLink="/studio/sources">Manage</a>
            </header>
            <div class="au-row">
              <span class="au-row__title">Healthy</span>
              <span class="au-badge au-badge--success">{{ overview.sources.enabled - overview.sources.degraded - overview.sources.failing }}</span>
            </div>
            <div class="au-row">
              <span class="au-row__title">Degraded</span>
              <span class="au-badge au-badge--warning">{{ overview.sources.degraded }}</span>
            </div>
            <div class="au-row">
              <span class="au-row__title">Failing</span>
              <span class="au-badge au-badge--danger">{{ overview.sources.failing }}</span>
            </div>
            <div class="au-row">
              <span class="au-row__title">Disabled</span>
              <span class="au-badge au-badge--neutral">{{ overview.sources.total - overview.sources.enabled }}</span>
            </div>
            <details class="au-advanced" style="margin: 8px 16px 14px">
              <summary>Worker health</summary>
              <div class="au-workers">
                <div class="au-workers__row" *ngFor="let worker of workerHealth">
                  <span class="au-workers__name">{{ worker.queue }}</span>
                  <span class="au-badge au-badge--neutral">waiting {{ worker.waiting }}</span>
                  <span class="au-badge au-badge--warning">active {{ worker.active }}</span>
                  <span class="au-badge" [class.au-badge--danger]="worker.failed > 0">failed {{ worker.failed }}</span>
                </div>
              </div>
            </details>
          </section>

          <section class="au-panel">
            <header class="au-panel__header">
              <h2 class="au-panel__title">Destinations</h2>
              <a class="au-link" routerLink="/studio/connections">Connections</a>
            </header>
            <app-empty-state
              *ngIf="overview.connections.length === 0"
              icon="connections"
              title="No destinations connected"
              text="Connect a website or social account to publish."
            >
              <a class="au-btn au-btn--primary au-btn--sm" routerLink="/studio/connections">Add connection</a>
            </app-empty-state>
            <div class="au-row" *ngFor="let connection of overview.connections">
              <span class="au-row__title">{{ connection.displayName }}</span>
              <span class="au-channel" [class]="'au-channel--' + connection.platform">{{ connection.platform }}</span>
              <span class="au-badge" [class.au-badge--success]="connectionStateLabel(connection) === 'Connected'" [class.au-badge--danger]="connectionStateLabel(connection) !== 'Connected' && connectionStateLabel(connection) !== 'Disabled'" [class.au-badge--neutral]="connectionStateLabel(connection) === 'Disabled'">
                {{ connectionStateLabel(connection) }}
              </span>
            </div>
          </section>

          <section class="au-panel">
            <header class="au-panel__header">
              <h2 class="au-panel__title">Editorial plan</h2>
              <a class="au-link" routerLink="/studio/editorial-plan">Open plan</a>
            </header>
            <div class="au-row">
              <span class="au-row__title">Planned today</span>
              <span class="au-badge au-badge--success">{{ overview.planCoverage.today }}</span>
            </div>
            <div class="au-row">
              <span class="au-row__title">Planned this week</span>
              <span class="au-badge au-badge--neutral">{{ overview.planCoverage.week.total }}</span>
            </div>
            <div class="au-row">
              <span class="au-row__title">Generated</span>
              <span class="au-badge au-badge--warning">{{ overview.planCoverage.week.generated }}</span>
            </div>
            <div class="au-row">
              <span class="au-row__title">Approved</span>
              <span class="au-badge au-badge--success">{{ overview.planCoverage.week.approved }}</span>
            </div>
            <div class="au-row">
              <span class="au-row__title">By channel</span>
              <span class="au-row__meta">Web {{ overview.planCoverage.week.website }} · X {{ overview.planCoverage.week.x }} · IG {{ overview.planCoverage.week.instagram }}</span>
            </div>
          </section>
        </div>

        <section class="au-panel" *ngIf="overview.failures.length > 0">
          <header class="au-panel__header">
            <h2 class="au-panel__title">Failures needing attention</h2>
            <a class="au-link" routerLink="/studio/publications">Open publications</a>
          </header>
          <a class="au-row" *ngFor="let failure of overview.failures" routerLink="/studio/publications">
            <app-icon name="warning" class="au-warning-color"></app-icon>
            <span class="au-row__title au-truncate">{{ failure.project.title }}</span>
            <span class="au-channel" [class]="'au-channel--' + failure.channel">{{ failure.channel }}</span>
            <span class="au-row__error au-truncate" style="max-width: 320px">{{ failure.lastError }}</span>
          </a>
        </section>
      }
    </section>
  `,
  styles: [
    `
      .au-grid-dash {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
        gap: var(--au-s3);
        align-items: start;
      }
      .au-grid-dash .au-panel { margin-bottom: 0; }
      .au-workers {
        display: flex;
        flex-direction: column;
        gap: 6px;
        margin-top: 6px;
      }
      .au-workers__row {
        display: flex;
        gap: 6px;
        align-items: center;
        font-size: var(--au-fs-metadata);
      }
      .au-workers__name {
        font-weight: 600;
        min-width: 120px;
        font-family: var(--au-mono);
      }
      .au-warning-color { color: var(--au-warning); }
      .au-fs-metadata { font-size: var(--au-fs-metadata); }
    `,
  ],
})
export class OverviewPageComponent implements OnInit, OnDestroy {
  private readonly api = inject(StudioApiService);
  private readonly appContext = inject(AppContextService);

  overview: StudioOverview | null = null;
  workerHealth: Array<{ queue: string; waiting: number; active: number; delayed: number; failed: number; completed: number }> = [];
  private refreshSubscription: Subscription | null = null;

  get greeting(): string {
    const hour = new Date().getHours();
    if (hour < 6) {
      return 'night';
    }
    if (hour < 12) {
      return 'morning';
    }
    if (hour < 19) {
      return 'afternoon';
    }
    return 'evening';
  }

  get firstName(): string {
    return this.appContext.user()?.displayName?.split(/\s+/)[0] ?? 'there';
  }

  attentionItems(): Array<{ icon: string; title: string; detail: string; action: string; link: string }> {
    const overview = this.overview;
    if (!overview) {
      return [];
    }
    const items: Array<{ icon: string; title: string; detail: string; action: string; link: string }> = [];
    if (overview.pipeline.failed > 0) {
      items.push({
        icon: 'warning',
        title: `${overview.pipeline.failed} failed publication${overview.pipeline.failed === 1 ? '' : 's'}`,
        detail: 'Inspect the attempt and retry or fix the destination.',
        action: 'Review',
        link: '/studio/publications',
      });
    }
    if (overview.automation.state === 'paused' || overview.automation.pausedReason) {
      items.push({
        icon: 'pause',
        title: 'Automation is paused',
        detail: overview.automation.pausedReason ?? 'No automatic publications will run.',
        action: 'Review',
        link: '/studio/automation',
      });
    }
    for (const connection of overview.connections) {
      if (connection.enabled && connection.status !== 'active') {
        items.push({
          icon: 'connections',
          title: `${connection.displayName} needs attention`,
          detail: 'The destination is not connected. Review its credentials.',
          action: 'Review connection',
          link: '/studio/connections',
        });
      }
    }
    if (overview.sources.failing > 0) {
      items.push({
        icon: 'sources',
        title: `${overview.sources.failing} failing source${overview.sources.failing === 1 ? '' : 's'}`,
        detail: 'Sources failing repeatedly stop feeding the inbox.',
        action: 'Review sources',
        link: '/studio/sources',
      });
    }
    return items;
  }

  ngOnInit(): void {
    this.load();
    this.refreshSubscription = timer(45_000, 45_000).subscribe(() => {
      if (!document.hidden) {
        this.load();
      }
    });
  }

  ngOnDestroy(): void {
    this.refreshSubscription?.unsubscribe();
  }

  load(): void {
    this.api.getOverview().subscribe({
      next: (overview) => {
        this.overview = overview;
      },
      error: () => {
        this.overview = null;
      },
    });
    this.api.getWorkerHealth().subscribe({
      next: (health) => {
        this.workerHealth = health.workers ?? [];
      },
      error: () => {
        this.workerHealth = [];
      },
    });
  }

  slotLabel(value: string): string {
    return new Date(value).toLocaleString('en-US', { weekday: 'short', hour: '2-digit', minute: '2-digit' });
  }

  connectionStateLabel(connection: { enabled: boolean; status: string; connectionState: string | null }): string {
    if (!connection.enabled) {
      return 'Disabled';
    }
    if (connection.connectionState === 'expired') {
      return 'Reconnect required';
    }
    if (connection.connectionState === 'permissions_required') {
      return 'Permissions needed';
    }
    if (connection.connectionState === 'provider_error' || connection.status === 'error') {
      return 'Action required';
    }
    if (connection.connectionState === 'connected' || connection.status === 'active') {
      return 'Connected';
    }
    if (connection.connectionState === 'connecting') {
      return 'Connecting…';
    }
    return connection.status === 'pending' ? 'Pending' : 'Not connected';
  }
}

