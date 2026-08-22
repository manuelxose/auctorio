import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AppContextService } from '../services/app-context.service';
import { StudioApiService } from '../services/studio-api.service';
import type { PublicationListItem, PublishingAccount, StudioSite } from '../models/studio.models';
import { formatRelativeTime } from '../utils/content-status';

type PublishingTab = 'queue' | 'published' | 'destinations';

@Component({
  selector: 'app-publishing-page',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <section class="au-page">
      <header class="au-page__header">
        <div>
          <h1 class="au-page__title">Publishing</h1>
          <p class="au-page__subtitle">Queue, published items and destinations.</p>
        </div>
      </header>

      <nav class="au-tabs" aria-label="Publishing sections">
        <button class="au-tab" [class.is-active]="tab === 'queue'" type="button" (click)="setTab('queue')">Queue</button>
        <button class="au-tab" [class.is-active]="tab === 'published'" type="button" (click)="setTab('published')">Published</button>
        <button class="au-tab" [class.is-active]="tab === 'destinations'" type="button" (click)="setTab('destinations')">Destinations</button>
      </nav>

      <section class="au-surface" *ngIf="tab !== 'destinations'">
        <div class="au-empty" *ngIf="filtered.length === 0">Nothing here yet.</div>
        <div class="au-row" *ngFor="let item of filtered">
          <span class="au-row__title">{{ item.project.title || 'Publication' }}</span>
          <span class="au-tag">{{ item.site.name }}</span>
          <span
            class="au-tag"
            [class.au-tag--success]="item.status === 'published' || item.status === 'draft_synced'"
            [class.au-tag--danger]="item.status === 'failed'"
          >
            {{ item.status }}
          </span>
          <span class="au-row__meta">{{ formatRelativeTime(item.createdAt) }}</span>
          <span class="au-row__meta" *ngIf="item.error">{{ item.error }}</span>
          <a
            class="au-link"
            *ngIf="item.externalUrl"
            [href]="externalLink(item)"
            target="_blank"
            rel="noopener"
          >
            Open ↗
          </a>
        </div>
      </section>

      <section class="au-surface" *ngIf="tab === 'destinations'">
        <div class="au-empty" *ngIf="accounts.length === 0">No publishing destinations configured. <a class="au-link" routerLink="/studio/connections">Add a connection</a></div>
        <div class="au-row" *ngFor="let account of accounts">
          <span class="au-row__title">{{ account.displayName }}</span>
          <span class="au-tag">{{ account.platform }}</span>
          <span class="au-tag" [class.au-tag--success]="account.status === 'active' && account.enabled" [class.au-tag--danger]="account.status === 'error'">{{ account.enabled ? account.status : 'disabled' }}</span>
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
