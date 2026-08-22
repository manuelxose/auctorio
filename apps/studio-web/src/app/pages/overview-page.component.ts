import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Subscription, timer } from 'rxjs';
import { AppContextService } from '../services/app-context.service';
import { StudioApiService } from '../services/studio-api.service';
import type { StudioOverview, WorkerHealth } from '../models/studio.models';

@Component({
  selector: 'app-overview-page',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <section class="au-page">
      <header class="au-page__header">
        <div>
          <h1 class="au-page__title">Good {{ greeting }}, {{ firstName }}</h1>
          <p class="au-page__subtitle">The operational state of your editorial pipeline.</p>
        </div>
        <a class="au-button au-button--primary" routerLink="/studio/content/new">+ New content</a>
      </header>

      <div class="au-stat-row" *ngIf="overview">
        <article class="au-stat">
          <strong>{{ overview.today.articlesPlanned }}</strong>
          <span>Articles planned today</span>
        </article>
        <article class="au-stat">
          <strong>{{ overview.today.articlesPublished }}</strong>
          <span>Published today</span>
        </article>
        <article class="au-stat">
          <strong>{{ overview.today.xPosts }}</strong>
          <span>X posts</span>
        </article>
        <article class="au-stat">
          <strong>{{ overview.today.instagramPosts }}</strong>
          <span>Instagram posts</span>
        </article>
      </div>

      <div class="au-grid au-grid--dash" *ngIf="overview">
        <section class="au-surface au-surface--padded">
          <header class="au-surface__header">
            <h2 class="au-surface__title">Pipeline</h2>
            <a class="au-link" routerLink="/studio/content">Content</a>
          </header>
          <a class="au-row" routerLink="/studio/inbox">
            <span class="au-row__title">Inbox candidates</span>
            <span class="au-tag au-tag--warning">{{ overview.pipeline.inboxCandidates }}</span>
          </a>
          <a class="au-row" routerLink="/studio/content">
            <span class="au-row__title">Drafts</span>
            <span class="au-tag">{{ overview.pipeline.drafts }}</span>
          </a>
          <a class="au-row" routerLink="/studio/content">
            <span class="au-row__title">In review</span>
            <span class="au-tag">{{ overview.pipeline.review }}</span>
          </a>
          <a class="au-row" routerLink="/studio/publications">
            <span class="au-row__title">Scheduled</span>
            <span class="au-tag au-tag--success">{{ overview.pipeline.scheduled }}</span>
          </a>
          <a class="au-row" routerLink="/studio/publications">
            <span class="au-row__title">Failed</span>
            <span class="au-tag au-tag--danger" *ngIf="overview.pipeline.failed > 0">{{ overview.pipeline.failed }}</span>
            <span class="au-tag au-tag--muted" *ngIf="overview.pipeline.failed === 0">0</span>
          </a>
        </section>

        <section class="au-surface au-surface--padded">
          <header class="au-surface__header">
            <h2 class="au-surface__title">Automation</h2>
            <a class="au-link" routerLink="/studio/automation">Configure</a>
          </header>
          <div class="au-automation-state">
            <span class="au-tag" [class.au-tag--success]="overview.automation.enabled" [class.au-tag--muted]="!overview.automation.enabled">
              {{ overview.automation.enabled ? 'enabled' : 'disabled' }}
            </span>
            <span class="au-tag" [class.au-tag--danger]="overview.automation.state === 'paused'" [class.au-tag--success]="overview.automation.state === 'active'">
              {{ overview.automation.state }}
            </span>
            <span class="au-overview__reason" *ngIf="overview.automation.pausedReason">{{ overview.automation.pausedReason }}</span>
          </div>
          <div class="au-overview__warnings" *ngIf="overview.automation.warnings.length > 0">
            <p class="au-overview__warning" *ngFor="let warning of overview.automation.warnings">⚠ {{ warning }}</p>
          </div>
          <p class="au-auth__hint" *ngIf="overview.automation.nextSlots.length > 0">Next planned:</p>
          <span class="au-tag au-tag--muted" *ngFor="let slot of overview.automation.nextSlots">{{ slot.channel }} · {{ slotLabel(slot.at) }}</span>
        </section>

        <section class="au-surface au-surface--padded">
          <header class="au-surface__header">
            <h2 class="au-surface__title">Sources</h2>
            <a class="au-link" routerLink="/studio/sources">Manage</a>
          </header>
          <div class="au-row">
            <span class="au-row__title">Healthy</span>
            <span class="au-tag au-tag--success">{{ overview.sources.enabled - overview.sources.degraded - overview.sources.failing }}</span>
          </div>
          <div class="au-row">
            <span class="au-row__title">Degraded</span>
            <span class="au-tag au-tag--warning">{{ overview.sources.degraded }}</span>
          </div>
          <div class="au-row">
            <span class="au-row__title">Failing</span>
            <span class="au-tag au-tag--danger">{{ overview.sources.failing }}</span>
          </div>
          <div class="au-row">
            <span class="au-row__title">Disabled</span>
            <span class="au-tag au-tag--muted">{{ overview.sources.total - overview.sources.enabled }}</span>
          </div>
          <details class="au-advanced">
            <summary class="au-link">Worker health</summary>
            <div class="au-workers">
              <div class="au-workers__row" *ngFor="let worker of workerHealth">
                <span class="au-workers__name">{{ worker.queue }}</span>
                <span class="au-tag au-tag--muted">waiting {{ worker.waiting }}</span>
                <span class="au-tag au-tag--warning">active {{ worker.active }}</span>
                <span class="au-tag" [class.au-tag--danger]="worker.failed > 0">failed {{ worker.failed }}</span>
              </div>
            </div>
          </details>
        </section>
      </div>

      <div class="au-grid au-grid--dash" *ngIf="overview">
        <section class="au-surface au-surface--padded">
          <header class="au-surface__header">
            <h2 class="au-surface__title">Destinations</h2>
            <a class="au-link" routerLink="/studio/connections">Connections</a>
          </header>
          <div class="au-empty" *ngIf="overview.connections.length === 0">No publishing destinations connected yet.</div>
          <div class="au-row" *ngFor="let connection of overview.connections">
            <span class="au-row__title">{{ connection.displayName }}</span>
            <span class="au-channel-badge" [ngClass]="'au-channel-badge--' + connection.platform">{{ connection.platform }}</span>
            <span class="au-tag" [class.au-tag--success]="connection.enabled && connection.status === 'active'" [class.au-tag--danger]="connection.enabled && connection.status === 'error'" [class.au-tag--muted]="!connection.enabled">
              {{ !connection.enabled ? 'Disabled' : connection.status === 'active' ? 'Connected' : 'Action required' }}
            </span>
          </div>
        </section>

        <section class="au-surface au-surface--padded">
          <header class="au-surface__header">
            <h2 class="au-surface__title">Editorial plan</h2>
            <a class="au-link" routerLink="/studio/editorial-plan">Open plan</a>
          </header>
          <div class="au-row">
            <span class="au-row__title">Planned today</span>
            <span class="au-tag au-tag--success">{{ overview.planCoverage.today }}</span>
          </div>
          <div class="au-row">
            <span class="au-row__title">Planned this week</span>
            <span class="au-tag">{{ overview.planCoverage.week.total }}</span>
          </div>
          <div class="au-row">
            <span class="au-row__title">Generated</span>
            <span class="au-tag">{{ overview.planCoverage.week.generated }}</span>
          </div>
          <div class="au-row">
            <span class="au-row__title">Approved</span>
            <span class="au-tag au-tag--success">{{ overview.planCoverage.week.approved }}</span>
          </div>
          <div class="au-row">
            <span class="au-row__title">By channel</span>
            <span class="au-row__meta">Web {{ overview.planCoverage.week.website }} · X {{ overview.planCoverage.week.x }} · IG {{ overview.planCoverage.week.instagram }}</span>
          </div>
        </section>
      </div>

      <section class="au-surface" *ngIf="overview">
        <header class="au-surface__header">
          <h2 class="au-surface__title">Recent publications</h2>
          <a class="au-link" routerLink="/studio/publications">View all</a>
        </header>
        <div class="au-empty" *ngIf="overview.recentPublications.length === 0">No publication activity yet.</div>
        <a class="au-row" *ngFor="let item of overview.recentPublications" [routerLink]="['/studio/content', item.id]">
          <span class="au-row__title">{{ item.title }}</span>
          <span class="au-channel-badge" [ngClass]="'au-channel-badge--' + item.channel">{{ item.channel }}</span>
          <span class="au-tag" [class.au-tag--success]="item.status === 'published'" [class.au-tag--danger]="item.status === 'failed'">{{ item.status }}</span>
          <span class="au-row__meta">{{ item.destination }}</span>
        </a>
      </section>

      <section class="au-surface au-surface--danger" *ngIf="overview && overview.failures.length > 0">
        <header class="au-surface__header">
          <h2 class="au-surface__title">Failures needing attention</h2>
          <a class="au-link" routerLink="/studio/publications">Open</a>
        </header>
        <div class="au-row" *ngFor="let failure of overview.failures">
          <span class="au-row__title">{{ failure.project.title }}</span>
          <span class="au-channel-badge" [ngClass]="'au-channel-badge--' + failure.channel">{{ failure.channel }}</span>
          <span class="au-row__meta au-row__error">{{ failure.lastError }}</span>
        </div>
      </section>
    </section>
  `,
  styles: [
    `
      .au-grid--dash { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1rem; margin-bottom: 1rem; }
      .au-surface--padded { padding: 0.9rem 1.1rem; }
      .au-surface--danger { border: 1px solid #fecaca; }
      .au-automation-state { display: flex; gap: 0.4rem; align-items: center; margin-bottom: 0.5rem; }
      .au-overview__reason { font-size: 0.8rem; color: var(--au-danger, #dc2626); }
      .au-overview__warnings { margin: 0.4rem 0; }
      .au-overview__warning { font-size: 0.78rem; color: #92400e; margin: 2px 0; }
      .au-workers { display: flex; flex-direction: column; gap: 0.35rem; margin-top: 0.5rem; }
      .au-workers__row { display: flex; gap: 0.4rem; align-items: center; font-size: 0.8rem; }
      .au-workers__name { font-weight: 600; min-width: 130px; }
      .au-row__error { color: var(--au-danger, #dc2626); max-width: 400px; }
      .au-channel-badge { text-transform: uppercase; font-size: 0.65rem; padding: 2px 6px; border-radius: 4px; }
      .au-channel-badge--website { background: #dbeafe; color: #1d4ed8; }
      .au-channel-badge--x { background: #111; color: #fff; }
      .au-channel-badge--instagram { background: #fdf2f8; color: #be185d; }
      .au-auth__hint { font-size: 0.8rem; color: var(--au-muted, #6b7280); }
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
}

