import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AppContextService } from '../services/app-context.service';
import { StudioApiService } from '../services/studio-api.service';
import type { PublicationListItem, StudioProjectSummary } from '../models/studio.models';
import { contentFilterOf, formatRelativeTime, stageLabel, stageTone } from '../utils/content-status';

@Component({
  selector: 'app-overview-page',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <section class="au-page">
      <header class="au-page__header">
        <div>
          <h1 class="au-page__title">Good {{ greeting }}, {{ firstName }}</h1>
          <p class="au-page__subtitle">What needs attention across your sites.</p>
        </div>
        <a class="au-button au-button--primary" routerLink="/studio/content/new">+ New content</a>
      </header>

      <div class="au-stat-row">
        <article class="au-stat">
          <strong>{{ needsAttention }}</strong>
          <span>Needs attention</span>
        </article>
        <article class="au-stat">
          <strong>{{ readyCount }}</strong>
          <span>Ready to publish</span>
        </article>
        <article class="au-stat">
          <strong>{{ publishedCount }}</strong>
          <span>Published</span>
        </article>
      </div>

      <section class="au-surface">
        <header class="au-surface__header">
          <h2 class="au-surface__title">Recent content</h2>
          <a class="au-link" routerLink="/studio/content">View all</a>
        </header>
        <div class="au-empty" *ngIf="recent.length === 0">No content yet. Create your first piece.</div>
        <a class="au-row" *ngFor="let item of recent" [routerLink]="['/studio/content', item.id]">
          <span class="au-row__title">{{ item.title }}</span>
          <span class="au-tag">{{ item.site.name }}</span>
          <span class="au-tag" [class.au-tag--success]="stageTone(item.reviewGate) === 'success'"
            [class.au-tag--danger]="stageTone(item.reviewGate) === 'danger'">
            {{ stageLabel(item.reviewGate) }}
          </span>
          <span class="au-row__meta">{{ formatRelativeTime(item.updatedAt) }}</span>
        </a>
      </section>

      <section class="au-surface">
        <header class="au-surface__header">
          <h2 class="au-surface__title">Recent activity</h2>
          <a class="au-link" routerLink="/studio/publishing">Publishing</a>
        </header>
        <div class="au-empty" *ngIf="publications.length === 0">No publication activity yet.</div>
        <div class="au-row" *ngFor="let item of publications">
          <span class="au-row__title">{{ item.project?.title || 'Publication' }}</span>
          <span class="au-tag">{{ item.site?.name }}</span>
          <span class="au-tag">{{ item.status }}</span>
          <span class="au-row__meta">{{ formatRelativeTime(item.createdAt) }}</span>
        </div>
      </section>
    </section>
  `,
})
export class OverviewPageComponent implements OnInit {
  private readonly api = inject(StudioApiService);
  private readonly appContext = inject(AppContextService);

  recent: StudioProjectSummary[] = [];
  publications: PublicationListItem[] = [];
  needsAttention = 0;
  readyCount = 0;
  publishedCount = 0;

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
    this.api.listProjects({ page: 1, pageSize: 100 }).subscribe({
      next: (response) => {
        const items = response.items;
        this.recent = items.slice(0, 6);
        this.readyCount = items.filter((item) => item.reviewGate.publishReady && item.reviewGate.stage !== 'published').length;
        this.publishedCount = items.filter((item) => item.reviewGate.stage === 'published').length;
        this.needsAttention = items.filter(
          (item) =>
            item.reviewGate.blockerCount > 0 ||
            item.reviewGate.stage === 'publish_failed' ||
            item.reviewGate.stage === 'qa_blocked',
        ).length;
      },
      error: () => {
        this.recent = [];
      },
    });

    this.api.listPublications(1, 6).subscribe({
      next: (response) => {
        this.publications = response.items;
      },
      error: () => {
        this.publications = [];
      },
    });
  }

  contentFilterOf = contentFilterOf;
  stageLabel = stageLabel;
  stageTone = stageTone;
  formatRelativeTime = formatRelativeTime;
}
