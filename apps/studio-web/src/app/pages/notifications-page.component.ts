import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { StudioApiService } from '../services/studio-api.service';
import { ToastService } from '../services/toast.service';
import { SseService } from '../services/sse.service';
import { AppIconComponent } from '../components/ui/app-icon.component';
import { AppEmptyStateComponent } from '../components/ui/app-empty-state.component';
import type { NotificationPreference, NotificationSeverity, StudioNotification } from '../models/studio.models';

const CATEGORY_TABS: Array<{ id: string; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'publication', label: 'Publications' },
  { id: 'connection', label: 'Connections' },
  { id: 'generation', label: 'Generation' },
  { id: 'automation', label: 'Automation' },
  { id: 'system', label: 'System' },
];

@Component({
  selector: 'app-notifications-page',
  standalone: true,
  imports: [CommonModule, RouterLink, AppIconComponent, AppEmptyStateComponent],
  template: `
    <section class="au-page au-page--narrow">
      <header class="au-page__header au-page__header--split">
        <div>
          <p class="au-page__eyebrow">Persistent updates</p>
          <h1 class="au-page__title">Notifications</h1>
          <p class="au-page__subtitle">Durable outcomes from publications, connections and automation.</p>
        </div>
        <button class="au-btn au-btn--secondary" type="button" (click)="markAll()" [disabled]="unread === 0">
          Mark all read
        </button>
      </header>

      <div class="au-banner au-banner--error" *ngIf="loadError">
        <app-icon name="warning"></app-icon>
        <span class="au-banner__text">{{ loadError }}</span>
        <button class="au-banner__action" type="button" (click)="load()">Retry</button>
      </div>

      <div class="au-tabs" role="tablist" aria-label="Notification categories">
        <button
          class="au-tab"
          type="button"
          role="tab"
          *ngFor="let tab of tabs"
          [class.is-active]="activeCategory === tab.id"
          [attr.aria-selected]="activeCategory === tab.id"
          (click)="selectCategory(tab.id)"
        >
          {{ tab.label }}
          <span class="au-tab__count" *ngIf="counts[tab.id]">{{ counts[tab.id] }}</span>
        </button>
      </div>

      <div class="au-segment au-mb-2" role="group" aria-label="Inbox filter">
        <button class="au-segment__item" type="button" [class.is-active]="!unreadOnly" (click)="setUnreadOnly(false)">All</button>
        <button class="au-segment__item" type="button" [class.is-active]="unreadOnly" (click)="setUnreadOnly(true)">Unread</button>
        <button class="au-segment__item" type="button" [class.is-active]="archived" (click)="setArchived(!archived)">Archived</button>
      </div>

      <div class="au-skeleton-list" *ngIf="loading" aria-label="Loading notifications">
        <div class="au-skeleton" *ngFor="let _ of [1, 2, 3]" style="height: 72px"></div>
      </div>

      <app-empty-state *ngIf="!loading && !loadError && items.length === 0" icon="bell" title="You're all caught up" text="Notifications about publications, connections and automation will appear here."></app-empty-state>

      <ul class="au-notification-list" *ngIf="items.length > 0">
        <li class="au-notification" *ngFor="let item of items" [class.is-unread]="!item.readAt">
          <span class="au-notification__dot" [class]="severityClass(item.severity)" [attr.aria-label]="item.severity"></span>
          <div class="au-notification__body">
            <div class="au-notification__head">
              <span class="au-notification__title">{{ item.title }}</span>
              <time class="au-notification__time" [attr.datetime]="item.createdAt">{{ item.createdAt | date: 'short' }}</time>
            </div>
            <p class="au-notification__text">{{ item.message }}</p>
            <div class="au-notification__actions">
              <a class="au-link" *ngIf="item.actionUrl" [routerLink]="item.actionUrl">{{ actionLabel(item.category) }}</a>
              <button class="au-link-button" type="button" (click)="toggleRead(item)">{{ item.readAt ? 'Mark unread' : 'Mark read' }}</button>
              <button class="au-link-button" type="button" (click)="toggleArchive(item)">{{ item.archivedAt ? 'Restore' : 'Archive' }}</button>
            </div>
          </div>
        </li>
      </ul>

      <div class="au-pagination" *ngIf="totalPages > 1">
        <button class="au-btn au-btn--ghost au-btn--sm" type="button" (click)="goPage(page - 1)" [disabled]="page <= 1">Previous</button>
        <span class="au-pagination__meta">Page {{ page }} of {{ totalPages }}</span>
        <button class="au-btn au-btn--ghost au-btn--sm" type="button" (click)="goPage(page + 1)" [disabled]="page >= totalPages">Next</button>
      </div>

      <section class="au-panel au-panel--padded au-mt-3" aria-label="Notification preferences">
        <h2 class="au-panel__title">Preferences</h2>
        <p class="au-panel__subtitle">Choose which notification categories reach your inbox.</p>
        <label class="au-toggle-row" *ngFor="let preference of preferences">
          <span class="au-flex-1">
            <span class="au-toggle-row__label">{{ categoryLabel(preference.category) }}</span>
          </span>
          <input type="checkbox" [checked]="preference.enabled" (change)="togglePreference(preference)" role="switch" [attr.aria-label]="'Enable ' + categoryLabel(preference.category) + ' notifications'" />
        </label>
      </section>
    </section>
  `,
})
export class NotificationsPageComponent implements OnInit, OnDestroy {
  private readonly api = inject(StudioApiService);
  private readonly toast = inject(ToastService);
  private readonly sse = inject(SseService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private sseUnsubscribe: (() => void) | null = null;
  private sseSubscription: Subscription | null = null;

  readonly tabs = CATEGORY_TABS;
  activeCategory = 'all';
  unreadOnly = false;
  archived = false;
  page = 1;
  pageSize = 20;
  total = 0;
  unread = 0;
  counts: Record<string, number> = {};
  items: StudioNotification[] = [];
  preferences: NotificationPreference[] = [];
  loading = true;
  loadError = '';

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.total / this.pageSize));
  }

  ngOnInit(): void {
    const category = this.route.snapshot.queryParamMap.get('category');
    if (category && CATEGORY_TABS.some((tab) => tab.id === category)) {
      this.activeCategory = category;
    }
    this.load();
    this.loadPreferences();
    this.sseUnsubscribe = this.sse.subscribe((event) => {
      if (event.type === 'notification.created' || event.type === 'notification.read') {
        this.refreshSilently();
      }
    });
    this.sseSubscription = this.sse.connection$.subscribe();
  }

  ngOnDestroy(): void {
    this.sseUnsubscribe?.();
    this.sseSubscription?.unsubscribe();
  }

  load(): void {
    this.loading = true;
    this.loadError = '';
    this.api.listNotifications({
      page: this.page,
      pageSize: this.pageSize,
      unreadOnly: this.unreadOnly,
      category: this.activeCategory,
      archived: this.archived,
    }).subscribe({
      next: (response) => {
        this.items = response.items;
        this.total = response.total;
        this.unread = response.unread;
        this.counts = response.counts;
        this.loading = false;
      },
      error: () => {
        this.loading = false;
        this.loadError = 'Notifications could not be loaded. Try again.';
      },
    });
  }

  private refreshSilently(): void {
    this.api.listNotifications({
      page: this.page,
      pageSize: this.pageSize,
      unreadOnly: this.unreadOnly,
      category: this.activeCategory,
      archived: this.archived,
    }).subscribe({
      next: (response) => {
        this.items = response.items;
        this.total = response.total;
        this.unread = response.unread;
        this.counts = response.counts;
      },
      error: () => undefined,
    });
  }

  loadPreferences(): void {
    this.api.getNotificationPreferences().subscribe({
      next: (response) => {
        this.preferences = response.preferences;
      },
      error: () => undefined,
    });
  }

  selectCategory(category: string): void {
    this.activeCategory = category;
    this.page = 1;
    this.load();
    void this.router.navigate([], {
      queryParams: { category: category === 'all' ? null : category },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  setUnreadOnly(value: boolean): void {
    this.unreadOnly = value;
    this.archived = false;
    this.page = 1;
    this.load();
  }

  setArchived(value: boolean): void {
    this.archived = value;
    this.unreadOnly = false;
    this.page = 1;
    this.load();
  }

  goPage(page: number): void {
    this.page = page;
    this.load();
  }

  toggleRead(item: StudioNotification): void {
    this.api.markNotificationRead(item.id, !item.readAt).subscribe({
      next: () => this.refreshSilently(),
      error: () => this.toast.error('Could not update the notification.'),
    });
  }

  toggleArchive(item: StudioNotification): void {
    this.api.archiveNotification(item.id, !item.archivedAt).subscribe({
      next: () => this.refreshSilently(),
      error: () => this.toast.error('Could not archive the notification.'),
    });
  }

  markAll(): void {
    this.api.markAllNotificationsRead(this.activeCategory === 'all' ? undefined : this.activeCategory).subscribe({
      next: () => {
        this.toast.success('Notifications marked as read.');
        this.refreshSilently();
      },
      error: () => this.toast.error('Could not mark notifications as read.'),
    });
  }

  togglePreference(preference: NotificationPreference): void {
    this.api.setNotificationPreference(preference.category, !preference.enabled).subscribe({
      next: (updated) => {
        this.preferences = this.preferences.map((entry) => (entry.category === updated.category ? updated : entry));
      },
      error: () => this.toast.error('Preference could not be saved.'),
    });
  }

  severityClass(severity: NotificationSeverity): string {
    return severity === 'error' ? 'is-error' : severity === 'warning' ? 'is-warning' : severity === 'success' ? 'is-success' : 'is-info';
  }

  categoryLabel(category: string): string {
    const tab = this.tabs.find((entry) => entry.id === category);
    return tab?.label ?? category;
  }

  actionLabel(category: string): string {
    switch (category) {
      case 'publication': return 'Open publications';
      case 'connection': return 'Open connections';
      case 'automation': return 'Open automation';
      case 'editorial': return 'Open editorial plan';
      default: return 'Open';
    }
  }
}
