import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AppContextService } from '../services/app-context.service';
import { StudioApiService } from '../services/studio-api.service';
import { AppIconComponent } from '../components/ui/app-icon.component';
import { AppEmptyStateComponent } from '../components/ui/app-empty-state.component';
import type { PublicationListItem, PublishingAccount, StudioSite } from '../models/studio.models';
import { formatRelativeTime } from '../utils/content-status';

type PublishingTab = 'queue' | 'published' | 'destinations';

@Component({
  selector: 'app-publishing-page',
  standalone: true,
  imports: [CommonModule, RouterLink, AppIconComponent, AppEmptyStateComponent],
  template: `
    <section class="au-page">
      <header class="au-page__header">
        <div>
          <p class="au-page__eyebrow">Release management</p>
          <h1 class="au-page__title">Publishing</h1>
          <p class="au-page__subtitle">Queue, published items and destinations.</p>
        </div>
        <div class="au-page__actions">
          <a class="au-btn au-btn--secondary" routerLink="/studio/publications">
            <app-icon name="publications"></app-icon>
            Publication records
          </a>
        </div>
      </header>

      <div class="au-tabs" aria-label="Publishing sections">
        <button class="au-tab" [class.is-active]="tab === 'queue'" type="button" (click)="setTab('queue')">
          Queue
          <span class="au-badge au-badge--neutral">{{ items.length }}</span>
        </button>
        <button class="au-tab" [class.is-active]="tab === 'published'" type="button" (click)="setTab('published')">Published</button>
        <button class="au-tab" [class.is-active]="tab === 'destinations'" type="button" (click)="setTab('destinations')">Destinations</button>
      </div>

      <section class="au-panel" *ngIf="tab !== 'destinations'">
        <app-empty-state
          *ngIf="filtered.length === 0"
          icon="clock"
          [title]="tab === 'published' ? 'Nothing published yet' : 'Queue is empty'"
          [text]="tab === 'published' ? 'Published items appear here after the first successful publication.' : 'Scheduled publications appear here while waiting to run.'"
        >
          <a class="au-btn au-btn--secondary au-btn--sm" routerLink="/studio/calendar">Open calendar</a>
        </app-empty-state>
        <a class="au-row" *ngFor="let item of filtered" [routerLink]="['/studio/content', item.project.id]">
          <app-icon name="content" class="au-faint"></app-icon>
          <span class="au-row__title">{{ item.project.title || 'Publication' }}</span>
          <span class="au-badge au-badge--neutral">{{ item.site.name }}</span>
          <span
            class="au-badge"
            [class.au-badge--success]="item.status === 'published' || item.status === 'draft_synced'"
            [class.au-badge--danger]="item.status === 'failed'"
            [class.au-badge--warning]="item.status === 'processing' || item.status === 'queued'"
          >
            {{ item.status }}
          </span>
          <span class="au-row__meta">{{ formatRelativeTime(item.createdAt) }}</span>
          <span class="au-row__error" *ngIf="item.error">{{ item.error }}</span>
          <a
            class="au-link"
            *ngIf="item.externalUrl"
            [href]="externalLink(item)"
            target="_blank"
            rel="noopener"
            (click)="$event.stopPropagation()"
          >
            Open
            <app-icon name="external"></app-icon>
          </a>
        </a>
      </section>

      <section class="au-panel" *ngIf="tab === 'destinations'">
        <app-empty-state
          *ngIf="accounts.length === 0"
          icon="connections"
          title="No publishing destinations configured"
          text="Add a website or social account to publish content."
        >
          <a class="au-btn au-btn--primary au-btn--sm" routerLink="/studio/connections">Add a connection</a>
        </app-empty-state>
        <div class="au-row" *ngFor="let account of accounts">
          <span class="au-platform-icon" style="width: 26px; height: 26px; flex-basis: 26px; font-size: 9px">{{ account.platform === 'x' ? 'X' : account.platform === 'instagram' ? 'IG' : 'WEB' }}</span>
          <span class="au-row__title">{{ account.displayName }}</span>
          <span class="au-badge au-badge--outline">{{ account.platform }}</span>
          <span class="au-badge" [class.au-badge--success]="account.status === 'active' && account.enabled" [class.au-badge--danger]="account.status === 'error'" [class.au-badge--neutral]="!account.enabled">
            {{ account.enabled ? account.status : 'disabled' }}
          </span>
          <span class="au-row__meta">{{ account.site?.name || 'Workspace default' }}</span>
          <a class="au-link" routerLink="/studio/connections">Manage</a>
        </div>
      </section>
    </section>
  `,
})
export class PublishingPageComponent implements OnInit {
  private readonly api = inject(StudioApiService);
  private readonly appContext = inject(AppContextService);

  tab: PublishingTab = 'queue';
  items: PublicationListItem[] = [];
  sites: StudioSite[] = [];
  accounts: PublishingAccount[] = [];

  get filtered(): PublicationListItem[] {
    if (this.tab === 'published') {
      return this.items.filter((item) => item.status === 'published' || item.status === 'draft_synced');
    }
    return this.items;
  }

  ngOnInit(): void {
    this.sites = this.appContext.sites();
    this.api.listPublishingAccounts().subscribe({
      next: (response) => { this.accounts = response.items; },
    });
    this.api.listPublications(1, 50).subscribe({
      next: (response) => {
        this.items = response.items;
      },
      error: () => {
        this.items = [];
      },
    });
  }

  setTab(tab: PublishingTab): void {
    this.tab = tab;
  }

  externalLink(item: PublicationListItem): string {
    const url = item.externalUrl ?? '';
    if (url.startsWith('http')) {
      return url;
    }
    const base = this.sites.find((site) => site.id === item.site?.id)?.baseUrl ?? '';
    return `${base}${url.startsWith('/') ? '' : '/'}${url}`.replace(/\/$/, '');
  }

  formatRelativeTime = formatRelativeTime;
}
