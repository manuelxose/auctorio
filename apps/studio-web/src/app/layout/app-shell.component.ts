import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Component, OnDestroy, OnInit, inject, PLATFORM_ID } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  ActivatedRoute,
  NavigationEnd,
  Router,
  RouterLink,
  RouterLinkActive,
  RouterOutlet,
} from '@angular/router';
import { Subscription, filter, startWith } from 'rxjs';
import { AppContextService } from '../services/app-context.service';
import { SeoService } from '../services/seo.service';
import { ThemeService } from '../services/theme.service';
import { StudioApiService } from '../services/studio-api.service';
import { SseService } from '../services/sse.service';
import { AppIconComponent } from '../components/ui/app-icon.component';
import { AppPopoverComponent } from '../components/ui/app-popover.component';
import type { StudioNotification, StudioSession, StudioSite } from '../models/studio.models';

type NavItem = {
  label: string;
  path: string;
  icon: string;
};

@Component({
  selector: 'app-app-shell',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    RouterLinkActive,
    RouterOutlet,
    AppIconComponent,
    AppPopoverComponent,
  ],
  template: `
    <div class="au-app au-shell" *ngIf="!loading; else bootState">
      <aside class="au-sidebar" [class.is-open]="menuOpen">
        <div class="au-sidebar__head">
          <a class="au-brand" routerLink="/studio/overview" (click)="menuOpen = false">
            <span class="au-brand__mark">AU</span>
            <span class="au-brand__name">Auctorio</span>
          </a>
        </div>

        <!-- Site switcher -->
        <div class="au-ws">
          <button
            class="au-ws__trigger"
            type="button"
            #siteTrigger
            (click)="siteMenu.toggle(siteTrigger)"
            [attr.aria-expanded]="siteMenu.isOpen()"
            aria-haspopup="menu"
            aria-label="Switch site"
          >
            <span class="au-ws__icon">{{ siteInitials }}</span>
            <span class="au-ws__name">{{ activeSiteName }}</span>
            <app-icon name="chevron-down" class="au-faint"></app-icon>
          </button>
          <app-popover #siteMenu>
            <div class="au-menu">
              <div class="au-menu__label">Switch site</div>
              <button
                class="au-menu__item"
                type="button"
                *ngFor="let site of sites"
                [class.is-active]="site.id === activeSiteId"
                (click)="selectSite(site.id, siteMenu)"
              >
                <span class="au-ws__icon">{{ siteInitialsOf(site) }}</span>
                {{ site.name }}
                <span class="au-menu__meta">{{ site.role }}</span>
              </button>
              <div class="au-menu__sep"></div>
              <a class="au-menu__item" routerLink="/studio/settings/sites" (click)="siteMenu.hide(); menuOpen = false">
                <app-icon name="settings"></app-icon>
                Manage sites
              </a>
            </div>
          </app-popover>
        </div>

        <!-- Grouped navigation -->
        <nav class="au-nav" *ngFor="let group of navGroups" [attr.aria-label]="group.label">
          <div class="au-nav__label">{{ group.label }}</div>
          <a
            class="au-nav-item"
            *ngFor="let item of group.items"
            [routerLink]="item.path"
            routerLinkActive="is-active"
            (click)="menuOpen = false"
          >
            <app-icon [name]="item.icon"></app-icon>
            {{ item.label }}
          </a>
        </nav>

        <nav class="au-nav au-mt-2" aria-label="System">
          <a
            class="au-nav-item"
            routerLink="/studio/settings/profile"
            routerLinkActive="is-active"
            (click)="menuOpen = false"
          >
            <app-icon name="settings"></app-icon>
            Settings
          </a>
        </nav>

        <!-- User area -->
        <div class="au-sidebar__footer">
          <div class="au-user" *ngIf="session">
            <button
              class="au-user__btn"
              type="button"
              #userTrigger
              (click)="userMenu.toggle(userTrigger)"
              [attr.aria-expanded]="userMenu.isOpen()"
              aria-haspopup="menu"
            >
              <span class="au-avatar">{{ initials }}</span>
              <span class="au-user__meta">
                <span class="au-user__name">{{ session.user.displayName }}</span>
                <span class="au-user__role">{{ session.role }}</span>
              </span>
              <app-icon name="chevron-down" class="au-faint"></app-icon>
            </button>
            <app-popover #userMenu>
              <div class="au-menu">
                <div class="au-menu__label au-truncate">{{ session.user.email }}</div>
                <a class="au-menu__item" routerLink="/studio/settings/profile" (click)="userMenu.hide(); menuOpen = false">
                  <app-icon name="user"></app-icon>
                  Profile
                </a>
                <a class="au-menu__item" routerLink="/studio/settings/sites" (click)="userMenu.hide(); menuOpen = false">
                  <app-icon name="globe"></app-icon>
                  Sites
                </a>
                <button class="au-menu__item" type="button" (click)="cycleTheme()">
                  <app-icon [name]="themeIcon"></app-icon>
                  Appearance
                  <span class="au-menu__meta">{{ themeLabel }}</span>
                </button>
                <div class="au-menu__sep"></div>
                <button class="au-menu__item is-danger" type="button" (click)="logout()">
                  <app-icon name="logout"></app-icon>
                  Log out
                </button>
              </div>
            </app-popover>
          </div>
        </div>
      </aside>

      @if (menuOpen) {
        <div class="au-backdrop" (click)="menuOpen = false"></div>
      }

      <div class="au-main">
        <header class="au-topbar">
          <button
            class="au-menu-toggle"
            type="button"
            (click)="menuOpen = !menuOpen"
            [attr.aria-expanded]="menuOpen"
            aria-label="Toggle navigation"
          >
            <span></span><span></span><span></span>
          </button>
          <div class="au-topbar__context">
            <span class="au-topbar__title">{{ sectionTitle }}</span>
          </div>
          <div class="au-topbar__actions">
            <a
              class="au-icon-button"
              routerLink="/studio/activity"
              aria-label="Background activity"
              title="Background activity"
            >
              <app-icon name="activity"></app-icon>
            </a>
            <button
              class="au-icon-button au-icon-button--bell"
              type="button"
              #bellTrigger
              (click)="bellMenu.toggle(bellTrigger)"
              [attr.aria-expanded]="bellMenu.isOpen()"
              aria-haspopup="menu"
              aria-label="Notifications"
              title="Notifications"
            >
              <app-icon name="bell"></app-icon>
              <span class="au-bell-badge" *ngIf="unreadCount > 0" aria-hidden="true">{{ unreadCount > 99 ? '99+' : unreadCount }}</span>
            </button>
            <app-popover #bellMenu>
              <div class="au-menu au-menu--wide" aria-label="Notifications preview">
                <div class="au-menu__label au-menu__label--split">
                  Notifications
                  <a class="au-link au-link--sm" routerLink="/studio/notifications" (click)="bellMenu.hide()">View all</a>
                </div>
                <button
                  class="au-menu__item"
                  type="button"
                  *ngFor="let item of notificationPreview"
                  [routerLink]="notificationPath(item)"
                  [queryParams]="notificationQuery(item)"
                  (click)="bellMenu.hide()"
                >
                  <span class="au-menu__item-text">
                    <span class="au-menu__item-title">{{ item.title }}</span>
                    <span class="au-menu__item-meta">{{ item.createdAt | date: 'short' }}</span>
                  </span>
                </button>
                <div class="au-menu__empty" *ngIf="notificationPreview.length === 0">
                  No notifications yet.
                </div>
              </div>
            </app-popover>
            <div class="au-split">
              <a class="au-btn au-btn--primary" routerLink="/studio/content/new">
                <app-icon name="plus"></app-icon>
                New content
              </a>
              <button
                class="au-split__caret"
                type="button"
                #createTrigger
                (click)="createMenu.toggle(createTrigger)"
                [attr.aria-expanded]="createMenu.isOpen()"
                aria-haspopup="menu"
                aria-label="More creation options"
              >
                <app-icon name="chevron-down"></app-icon>
              </button>
            </div>
            <app-popover #createMenu>
              <div class="au-menu">
                <a class="au-menu__item" routerLink="/studio/content/new" (click)="createMenu.hide()">
                  <app-icon name="plus"></app-icon>
                  New article
                </a>
                <a class="au-menu__item" routerLink="/studio/editorial-plan" (click)="createMenu.hide()">
                  <app-icon name="sparkles"></app-icon>
                  Generate editorial plan
                </a>
                <a class="au-menu__item" routerLink="/studio/sources" (click)="createMenu.hide()">
                  <app-icon name="sources"></app-icon>
                  Add source
                </a>
              </div>
            </app-popover>
          </div>
        </header>
        <div class="au-content">
          <router-outlet></router-outlet>
        </div>
      </div>
    </div>

    <ng-template #bootState>
      <div class="au-app au-boot">
        <span class="au-spinner" aria-label="Loading"></span>
      </div>
    </ng-template>
  `,
})
export class AppShellComponent implements OnInit, OnDestroy {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly seo = inject(SeoService);
  private readonly appContext = inject(AppContextService);
  private readonly themeService = inject(ThemeService);
  private readonly api = inject(StudioApiService);
  private readonly sse = inject(SseService);
  private readonly platformId = inject(PLATFORM_ID);

  readonly navGroups: Array<{ label: string; items: NavItem[] }> = [
    {
      label: 'Workspace',
      items: [
        { label: 'Overview', path: '/studio/overview', icon: 'overview' },
        { label: 'Inbox', path: '/studio/inbox', icon: 'inbox' },
        { label: 'Editorial Plan', path: '/studio/editorial-plan', icon: 'plan' },
        { label: 'Content', path: '/studio/content', icon: 'content' },
        { label: 'Calendar', path: '/studio/calendar', icon: 'calendar' },
      ],
    },
    {
      label: 'Publish',
      items: [
        { label: 'Publications', path: '/studio/publications', icon: 'publications' },
        { label: 'Media', path: '/studio/media', icon: 'media' },
        { label: 'Connections', path: '/studio/connections', icon: 'connections' },
      ],
    },
    {
      label: 'Operate',
      items: [
        { label: 'Site Intelligence', path: '/studio/site-intelligence', icon: 'scan' },
        { label: 'Sources', path: '/studio/sources', icon: 'sources' },
        { label: 'Automation', path: '/studio/automation', icon: 'automation' },
        { label: 'Activity', path: '/studio/activity', icon: 'activity' },
      ],
    },
  ];

  private subscription: Subscription | null = null;
  private sseUnsubscribe: (() => void) | null = null;
  private sseSubscription: Subscription | null = null;
  private notificationTimer: ReturnType<typeof setTimeout> | null = null;

  session: StudioSession | null = null;
  sites: StudioSite[] = [];
  activeSiteId: string | null = null;
  loading = true;
  menuOpen = false;
  sectionTitle = '';
  unreadCount = 0;
  notificationPreview: StudioNotification[] = [];

  get activeSiteName(): string {
    return this.sites.find((site) => site.id === this.activeSiteId)?.name ?? 'All sites';
  }

  get siteInitials(): string {
    return this.initialsOf(this.activeSiteName);
  }

  get initials(): string {
    const label = this.session?.user.displayName?.trim() || this.session?.user.email || 'AU';
    return this.initialsOf(label) || 'AU';
  }

  get themeIcon(): string {
    const preference = this.themeService.preference();
    return preference === 'light' ? 'sun' : preference === 'dark' ? 'moon' : 'monitor';
  }

  get themeLabel(): string {
    const preference = this.themeService.preference();
    return preference === 'light' ? 'Light' : preference === 'dark' ? 'Dark' : 'System';
  }

  ngOnInit(): void {
    this.subscription = this.router.events
      .pipe(
        filter((event) => event instanceof NavigationEnd),
        startWith(null),
      )
      .subscribe(() => {
        this.menuOpen = false;
        const snapshot = this.route.snapshot.firstChild;
        this.sectionTitle = snapshot?.data['studioMeta']?.title ?? '';
      });

    void this.bootstrap();
  }

  ngOnDestroy(): void {
    this.subscription?.unsubscribe();
    this.sseUnsubscribe?.();
    this.sseSubscription?.unsubscribe();
    if (this.notificationTimer) {
      clearTimeout(this.notificationTimer);
    }
  }

  private watchLiveUpdates(): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }
    this.sseUnsubscribe = this.sse.subscribe((event) => {
      if (event.type === 'notification.created' || event.type === 'notification.read') {
        this.refreshNotificationSummary();
      }
    });
    this.sseSubscription = this.sse.connection$.subscribe();
    this.refreshNotificationSummary();
  }

  private refreshNotificationSummary(): void {
    if (this.notificationTimer) {
      clearTimeout(this.notificationTimer);
    }
    this.notificationTimer = setTimeout(() => {
      this.api.listNotifications({ page: 1, pageSize: 5 }).subscribe({
        next: (response) => {
          this.unreadCount = response.unread;
          this.notificationPreview = response.items;
        },
        error: () => undefined,
      });
    }, 250);
  }

  /** Router-safe path for a notification action URL (query string split off). */
  notificationPath(item: StudioNotification): string {
    const raw = item.actionUrl || '/studio/notifications';
    const path = raw.split('?')[0] || '/studio/notifications';
    return path.startsWith('/studio/') ? path : '/studio/notifications';
  }

  /** Query parameters so routerLink never URL-encodes them into the path. */
  notificationQuery(item: StudioNotification): Record<string, string> {
    const raw = item.actionUrl || '';
    const queryIndex = raw.indexOf('?');
    if (queryIndex < 0) {
      return {};
    }
    const params: Record<string, string> = {};
    for (const [key, value] of new URLSearchParams(raw.slice(queryIndex + 1))) {
      params[key] = value;
    }
    return params;
  }

  siteInitialsOf(site: StudioSite): string {
    return this.initialsOf(site.name);
  }

  private initialsOf(name: string): string {
    return (
      name
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase() ?? '')
        .join('') || 'AU'
    );
  }

  private async bootstrap(): Promise<void> {
    try {
      const session = await this.appContext.ensureSession();
      this.session = session;
      this.sites = session?.sites ?? [];
      this.activeSiteId = session?.activeSiteId ?? this.sites[0]?.id ?? null;
      this.loading = false;
      this.watchLiveUpdates();
      this.seo.update({
        title: 'Auctorio',
        description: 'Editorial workspace',
        path: '/studio',
        locale: 'en',
        noIndex: true,
      });
    } catch {
      void this.router.navigate(['/login'], {
        queryParams: { reason: 'session_expired', returnTo: this.router.url },
      });
    } finally {
      this.dismissBootOverlay();
    }
  }

  private dismissBootOverlay(): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }
    document.body.classList.remove('studio-boot-pending');
    window.dispatchEvent(new Event('auctorio:studio-ready'));
  }

  async selectSite(siteId: string, menu?: AppPopoverComponent): Promise<void> {
    menu?.hide();
    if (siteId === this.activeSiteId) {
      return;
    }
    const session = await this.appContext.switchSite(siteId);
    this.session = session;
    this.sites = session?.sites ?? [];
    this.activeSiteId = session?.activeSiteId ?? null;
  }

  cycleTheme(): void {
    this.themeService.cycle();
  }

  logout(): void {
    void this.appContext.logout().then(() => this.router.navigate(['/login']));
  }
}
